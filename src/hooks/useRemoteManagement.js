/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Creation Reason: Hook for remote node management via WebSocket
 * Modification Reason: Fixed terminal output routing - handlers not properly stored
 * Main Functionality: Manages terminal sessions and file operations
 * Dependencies: useAeroNyxWebSocket, useGlobalSignature
 *
 * Main Logical Flow:
 * 1. Get JWT token for remote management
 * 2. Authenticate with WebSocket using JWT
 * 3. Initialize terminal sessions with proper handlers
 * 4. Store handlers BEFORE sending term_init to ensure output routing
 * 5. Handle terminal lifecycle (init, output, resize, close)
 *
 * ⚠️ Important Note for Next Developer:
 * - Terminal handlers MUST be stored with the EXACT session_id
 * - The session_id in term_init MUST match what's stored in terminalHandlersRef
 * - Output data is pure text string, NO decoding needed
 * - Must handle both term_ready and term_output messages
 * - Session ID tracking is CRITICAL for message routing
 *
 * Last Modified: v5.5.0 - Fixed handler storage and session ID tracking
 * ============================================
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { useGlobalSignature } from './useGlobalSignature';

// Get the WebSocket instance from the global context
let globalWebSocket = null;
let globalWsState = null;

// Export function to set the global WebSocket (called by useAeroNyxWebSocket)
export function setGlobalWebSocket(ws) {
  globalWebSocket = ws;
  console.log('[useRemoteManagement] Global WebSocket updated:', !!ws);
}

// Export function to set the global WebSocket state
export function setGlobalWsState(state) {
  globalWsState = state;
}

export function useRemoteManagement(nodeReference) {
  const { wallet } = useWallet();
  
  // Use global signature manager
  const {
    signature,
    message,
    ensureSignature,
    isLoading: isSignatureLoading,
    error: signatureError,
    remainingTimeFormatted
  } = useGlobalSignature();
  
  const [isEnabled, setIsEnabled] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [terminalSessions, setTerminalSessions] = useState(new Map());
  
  const pendingRequests = useRef(new Map());
  const messageHandlerRef = useRef(null);
  const terminalHandlersRef = useRef(new Map());
  const jwtTokenRef = useRef(null);
  const jwtExpiryRef = useRef(null);
  const terminalTimeouts = useRef(new Map());
  
  // ⚠️ CRITICAL: Track active terminal session for this node
  const activeTerminalSessionRef = useRef(null);

  // Check if JWT token is still valid
  const isJwtValid = useCallback(() => {
    if (!jwtTokenRef.current || !jwtExpiryRef.current) return false;
    return Date.now() < jwtExpiryRef.current;
  }, []);

  // Helper to send message through WebSocket
  const sendMessage = useCallback((message) => {
    if (!globalWebSocket || globalWebSocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    
    console.log('[useRemoteManagement] Sending message:', message.type, message);
    globalWebSocket.send(JSON.stringify(message));
  }, []);

  // Enable remote management
  const enableRemoteManagement = useCallback(async () => {
    console.log('[useRemoteManagement] enableRemoteManagement called', {
      walletConnected: wallet.connected,
      nodeReference,
      hasGlobalWebSocket: !!globalWebSocket,
      wsState: globalWsState,
      hasCachedSignature: !!signature,
      signatureRemainingTime: remainingTimeFormatted,
      hasValidJWT: isJwtValid()
    });

    if (!wallet.connected || !nodeReference) {
      setError('Wallet not connected or node reference missing');
      return false;
    }

    // Check if WebSocket is available and authenticated
    if (!globalWebSocket || !globalWsState?.authenticated) {
      setError('WebSocket not connected or not authenticated. Please wait for connection.');
      return false;
    }

    // If already enabled and JWT is still valid, return success
    if (isEnabled && isJwtValid()) {
      console.log('[useRemoteManagement] Already enabled with valid JWT');
      return true;
    }

    setIsEnabling(true);
    setError(null);

    try {
      // Step 1: Ensure we have a valid signature from global manager
      console.log('[useRemoteManagement] Step 1: Ensuring valid global signature');
      const signatureData = await ensureSignature();
      
      if (!signatureData || !signatureData.signature || !signatureData.message) {
        throw new Error('Failed to obtain signature');
      }

      console.log('[useRemoteManagement] Using global signature (valid for:', remainingTimeFormatted, ')');

      // Step 2: Get JWT Token for remote management
      console.log('[useRemoteManagement] Step 2: Getting JWT token');
      const tokenResponse = await nodeRegistrationService.generateRemoteManagementToken(
        wallet.address,
        signatureData.signature,
        signatureData.message,
        'okx',
        nodeReference
      );

      if (!tokenResponse.success) {
        throw new Error(tokenResponse.message || 'Failed to get remote management token');
      }

      const jwtToken = tokenResponse.data?.token;
      if (!jwtToken) {
        throw new Error('No JWT token received from server');
      }

      // Store JWT token and expiry (59 minutes from now)
      jwtTokenRef.current = jwtToken;
      jwtExpiryRef.current = Date.now() + (59 * 60 * 1000);
      console.log('[useRemoteManagement] JWT token received and stored');

      // Step 3: Send remote_auth message
      console.log('[useRemoteManagement] Step 3: Sending remote_auth message');
      
      // Remove any existing message handler
      if (messageHandlerRef.current) {
        globalWebSocket.removeEventListener('message', messageHandlerRef.current);
        messageHandlerRef.current = null;
      }
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (messageHandlerRef.current) {
            globalWebSocket.removeEventListener('message', messageHandlerRef.current);
            messageHandlerRef.current = null;
          }
          reject(new Error('Remote auth timeout'));
        }, 10000);

        const handleMessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[useRemoteManagement] Auth handler received:', data.type);
            
            if (data.type === 'remote_auth_success') {
              console.log('[useRemoteManagement] Remote auth successful');
              clearTimeout(timeout);
              globalWebSocket.removeEventListener('message', handleMessage);
              messageHandlerRef.current = null;
              
              // Store session info
              setSessionId(data.session_id);
              setIsEnabled(true);
              setIsEnabling(false);
              
              // Set up permanent message handler for terminal and commands
              setupPermanentHandlers();
              
              resolve(true);
            } else if (data.type === 'error' && (
              data.message?.includes('remote') || 
              data.message?.includes('JWT') || 
              data.code === 'AUTH_FAILED' ||
              data.code === 'MISSING_JWT' ||
              data.code === 'INVALID_TOKEN' ||
              data.code === 'TOKEN_EXPIRED'
            )) {
              console.error('[useRemoteManagement] Remote auth error:', data);
              clearTimeout(timeout);
              globalWebSocket.removeEventListener('message', handleMessage);
              messageHandlerRef.current = null;
              setIsEnabling(false);
              
              // Clear JWT if auth failed
              jwtTokenRef.current = null;
              jwtExpiryRef.current = null;
              
              reject(new Error(data.message || 'Remote authentication failed'));
            }
          } catch (err) {
            console.error('[useRemoteManagement] Error parsing message:', err);
          }
        };

        messageHandlerRef.current = handleMessage;
        globalWebSocket.addEventListener('message', handleMessage);

        // Send remote_auth message with JWT token ONLY
        const authMessage = {
          type: 'remote_auth',
          jwt_token: jwtToken
        };
        
        console.log('[useRemoteManagement] Sending remote_auth message');
        globalWebSocket.send(JSON.stringify(authMessage));
      });

    } catch (err) {
      console.error('[useRemoteManagement] Failed to enable remote management:', err);
      setError(err.message);
      setIsEnabling(false);
      setIsEnabled(false);
      
      // Clear JWT on error
      jwtTokenRef.current = null;
      jwtExpiryRef.current = null;
      
      // If signature error, show it
      if (signatureError) {
        setError(`Signature error: ${signatureError}`);
      }
      
      return false;
    }
  }, [wallet, nodeReference, ensureSignature, signatureError, remainingTimeFormatted, isJwtValid]);

  // Set up permanent handlers for terminal and command responses
  const setupPermanentHandlers = useCallback(() => {
    const handler = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 调试日志 - 显示所有终端相关消息
        if (data.type && data.type.includes('term')) {
          console.log('[useRemoteManagement] Terminal message:', {
            type: data.type,
            sessionId: data.session_id,
            hasData: !!data.data,
            dataLength: data.data ? data.data.length : 0,
            activeSession: activeTerminalSessionRef.current,
            handlersAvailable: Array.from(terminalHandlersRef.current.keys())
          });
        }
        
        // 跳过非终端相关消息
        if (['connected', 'auth_success', 'status_update', 'signature_message', 
             'monitor_started', 'pong', 'ping', 'heartbeat_ack'].includes(data.type)) {
          return;
        }
        
        // 处理终端初始化成功 - term_ready 是服务端实际返回的类型
        if (data.type === 'term_ready') {
          console.log('[useRemoteManagement] Terminal ready:', data);
          const sessionId = data.session_id;
          
          // ⚠️ CRITICAL: Update active session reference
          activeTerminalSessionRef.current = sessionId;
          
          // 查找待处理的初始化请求
          const pendingKey = 'pending_' + nodeReference;
          const pending = terminalTimeouts.current.get(pendingKey);
          
          if (pending) {
            clearTimeout(pending.timeout);
            terminalTimeouts.current.delete(pendingKey);
            
            // ⚠️ CRITICAL: Update handlers mapping if session ID changed
            if (pending.tempSessionId !== sessionId) {
              console.log('[useRemoteManagement] Session ID changed from', pending.tempSessionId, 'to', sessionId);
              const handlers = terminalHandlersRef.current.get(pending.tempSessionId);
              if (handlers) {
                // Remove old mapping
                terminalHandlersRef.current.delete(pending.tempSessionId);
                // Add new mapping with server's session ID
                terminalHandlersRef.current.set(sessionId, handlers);
                console.log('[useRemoteManagement] Updated handlers mapping for new session ID');
              }
            }
            
            // 更新终端会话状态
            setTerminalSessions(prev => {
              const next = new Map(prev);
              next.set(sessionId, {
                sessionId: sessionId,
                nodeReference,
                status: 'ready',
                rows: pending.options?.rows || 24,
                cols: pending.options?.cols || 80
              });
              return next;
            });
            
            // 调用 onReady 回调
            const handlers = terminalHandlersRef.current.get(sessionId);
            if (handlers?.onReady) {
              handlers.onReady({ session_id: sessionId });
            }
            
            // 解析 Promise
            if (pending.resolve) {
              pending.resolve(sessionId);
            }
          }
        }
        
        // 处理终端输出 - ⚠️ CRITICAL FIX
        else if (data.type === 'term_output' && data.session_id && data.data) {
          const sessionId = data.session_id;
          console.log('[useRemoteManagement] Terminal output for session:', sessionId, 'data:', data.data.substring(0, 50));
          
          // ⚠️ CRITICAL: Try multiple methods to find handlers
          let handlers = null;
          
          // Method 1: Direct lookup
          handlers = terminalHandlersRef.current.get(sessionId);
          
          // Method 2: Use active session reference
          if (!handlers && activeTerminalSessionRef.current) {
            handlers = terminalHandlersRef.current.get(activeTerminalSessionRef.current);
            console.log('[useRemoteManagement] Using active session handlers');
          }
          
          // Method 3: Find any handler for this node
          if (!handlers) {
            for (const [key, value] of terminalHandlersRef.current.entries()) {
              // Check if this is for the same node
              if (key.includes(nodeReference) || sessionId.includes(nodeReference)) {
                handlers = value;
                // Update mapping
                terminalHandlersRef.current.delete(key);
                terminalHandlersRef.current.set(sessionId, handlers);
                activeTerminalSessionRef.current = sessionId;
                console.log('[useRemoteManagement] Found handler with node reference match');
                break;
              }
            }
          }
          
          // Method 4: If only one handler exists, use it
          if (!handlers && terminalHandlersRef.current.size === 1) {
            const [key, value] = terminalHandlersRef.current.entries().next().value;
            handlers = value;
            // Update mapping
            terminalHandlersRef.current.delete(key);
            terminalHandlersRef.current.set(sessionId, handlers);
            activeTerminalSessionRef.current = sessionId;
            console.log('[useRemoteManagement] Using only available handler');
          }
          
          if (handlers?.onOutput) {
            // ⚠️ CRITICAL: data.data is already pure text string, pass directly
            console.log('[useRemoteManagement] Calling onOutput handler with data');
            handlers.onOutput(data.data);
          } else {
            console.error('[useRemoteManagement] ❌ No output handler found for session:', sessionId);
            console.log('[useRemoteManagement] Available handlers:', Array.from(terminalHandlersRef.current.keys()));
            console.log('[useRemoteManagement] Active session:', activeTerminalSessionRef.current);
          }
        }
        
        // 处理终端错误
        else if (data.type === 'term_error') {
          console.error('[useRemoteManagement] Terminal error:', data);
          
          const sessionId = data.session_id;
          if (sessionId) {
            const handlers = terminalHandlersRef.current.get(sessionId);
            if (handlers?.onError) {
              handlers.onError(data.error || data.message || 'Unknown error');
            }
            
            // 清理失败的会话
            terminalHandlersRef.current.delete(sessionId);
            if (activeTerminalSessionRef.current === sessionId) {
              activeTerminalSessionRef.current = null;
            }
            setTerminalSessions(prev => {
              const next = new Map(prev);
              next.delete(sessionId);
              return next;
            });
          }
          
          // 处理初始化错误
          const pending = terminalTimeouts.current.get('pending_' + nodeReference);
          if (pending) {
            clearTimeout(pending.timeout);
            terminalTimeouts.current.delete('pending_' + nodeReference);
            if (pending.reject) {
              pending.reject(new Error(data.error || data.message || 'Terminal initialization failed'));
            }
          }
        }
        
        // 处理终端关闭
        else if (data.type === 'term_closed' && data.session_id) {
          console.log('[useRemoteManagement] Terminal closed:', data.session_id);
          const handlers = terminalHandlersRef.current.get(data.session_id);
          if (handlers?.onClose) {
            handlers.onClose();
          }
          
          // 清理资源
          terminalHandlersRef.current.delete(data.session_id);
          if (activeTerminalSessionRef.current === data.session_id) {
            activeTerminalSessionRef.current = null;
          }
          setTerminalSessions(prev => {
            const next = new Map(prev);
            next.delete(data.session_id);
            return next;
          });
        }
        
        // 处理一般错误
        else if (data.type === 'error') {
          console.error('[useRemoteManagement] Error:', data);
          
          // 特定错误代码处理
          if (['NODE_OFFLINE', 'NODE_NOT_FOUND', 'INVALID_SESSION', 
               'REMOTE_NOT_ENABLED', 'TOKEN_EXPIRED'].includes(data.code)) {
            
            const pending = terminalTimeouts.current.get('pending_' + nodeReference);
            if (pending) {
              clearTimeout(pending.timeout);
              terminalTimeouts.current.delete('pending_' + nodeReference);
              if (pending.reject) {
                pending.reject(new Error(data.message || 'Operation failed'));
              }
            }
            
            // 如果是会话错误，清理相关会话
            if (data.code === 'INVALID_SESSION' && data.session_id) {
              terminalHandlersRef.current.delete(data.session_id);
              if (activeTerminalSessionRef.current === data.session_id) {
                activeTerminalSessionRef.current = null;
              }
              setTerminalSessions(prev => {
                const next = new Map(prev);
                next.delete(data.session_id);
                return next;
              });
            }
          }
        }
        
        // 处理命令响应
        else if (data.type === 'remote_command_response') {
          const pending = pendingRequests.current.get(data.request_id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingRequests.current.delete(data.request_id);
            
            if (data.success) {
              pending.resolve({
                success: true,
                message: 'Command executed successfully',
                data: data.result
              });
            } else {
              pending.reject({
                success: false,
                message: data.error || 'Command failed',
                error: { message: data.error || 'Command failed' }
              });
            }
          }
        }
      } catch (err) {
        console.error('[useRemoteManagement] Error handling message:', err);
      }
    };
  
    // 注册消息处理器
    globalWebSocket.addEventListener('message', handler);
    messageHandlerRef.current = handler;
    
    console.log('[useRemoteManagement] Permanent handlers set up');
  }, [nodeReference]);

  // Initialize terminal session
  const initTerminal = useCallback(async (options = {}) => {
    if (!isEnabled || !globalWebSocket) {
      throw new Error('Remote management not enabled');
    }

    // Check if JWT is still valid
    if (!isJwtValid()) {
      console.log('[useRemoteManagement] JWT expired, re-enabling remote management');
      const success = await enableRemoteManagement();
      if (!success) {
        throw new Error('Failed to re-enable remote management');
      }
    }

    console.log('[useRemoteManagement] Initializing terminal for node:', nodeReference);
    
    return new Promise((resolve, reject) => {
      // Generate a unique session ID
      const tempSessionId = `term_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // ⚠️ CRITICAL: Store handlers BEFORE sending the init message
      // This ensures we can receive output even if term_ready is delayed
      const handlers = {
        onOutput: options.onOutput || null,
        onError: options.onError || null,
        onClose: options.onClose || null,
        onReady: options.onReady || null
      };
      
      terminalHandlersRef.current.set(tempSessionId, handlers);
      activeTerminalSessionRef.current = tempSessionId; // Track as active
      
      console.log('[useRemoteManagement] Stored handlers for session:', tempSessionId);
      console.log('[useRemoteManagement] Handler functions:', {
        hasOutput: !!handlers.onOutput,
        hasError: !!handlers.onError,
        hasClose: !!handlers.onClose,
        hasReady: !!handlers.onReady
      });
      
      // Set up timeout with fallback
      const timeout = setTimeout(() => {
        console.log('[useRemoteManagement] Terminal init timeout, using fallback');
        terminalTimeouts.current.delete('pending_' + nodeReference);
        
        // Assume success if no error was received
        setTerminalSessions(prev => {
          const next = new Map(prev);
          next.set(tempSessionId, {
            sessionId: tempSessionId,
            nodeReference,
            status: 'ready',
            rows: options.rows || 24,
            cols: options.cols || 80
          });
          return next;
        });
        
        // Call onReady callback
        if (options?.onReady) {
          options.onReady({ session_id: tempSessionId });
        }
        
        // Resolve with the session ID
        resolve(tempSessionId);
      }, 10000);

      // Store pending info
      terminalTimeouts.current.set('pending_' + nodeReference, {
        timeout,
        resolve,
        reject,
        options,
        tempSessionId
      });

      // Send term_init message
      const initMessage = {
        type: 'term_init',
        node_reference: nodeReference,
        session_id: tempSessionId,
        rows: options.rows || 24,
        cols: options.cols || 80,
        cwd: options.cwd || '/',
        env: options.env || {}
      };

      console.log('[useRemoteManagement] Sending term_init:', initMessage);
      sendMessage(initMessage);
    });
  }, [isEnabled, nodeReference, isJwtValid, enableRemoteManagement, sendMessage]);

  // Send terminal input
  const sendTerminalInput = useCallback((termSessionId, data) => {
    if (!isEnabled || !globalWebSocket) {
      console.error('[useRemoteManagement] Cannot send input - not enabled');
      return;
    }

    console.log('[useRemoteManagement] Sending input to session:', termSessionId, 'data length:', data.length);

    const message = {
      type: 'term_input',
      session_id: termSessionId,
      data: data // Send raw data as-is (no encoding needed)
    };

    console.log('[useRemoteManagement] Sending term_input message');
    sendMessage(message);
  }, [isEnabled, sendMessage]);

  // Resize terminal
  const resizeTerminal = useCallback((termSessionId, rows, cols) => {
    if (!isEnabled || !globalWebSocket) {
      return;
    }

    // Validate ranges
    const validRows = Math.max(10, Math.min(200, rows));
    const validCols = Math.max(40, Math.min(400, cols));

    console.log('[useRemoteManagement] Resizing terminal:', termSessionId, validRows, 'x', validCols);

    const message = {
      type: 'term_resize',
      session_id: termSessionId,
      rows: validRows,
      cols: validCols
    };

    sendMessage(message);
    
    // Update local state
    setTerminalSessions(prev => {
      const next = new Map(prev);
      const session = next.get(termSessionId);
      if (session) {
        session.rows = validRows;
        session.cols = validCols;
      }
      return next;
    });
  }, [isEnabled, sendMessage]);

  // Close terminal
  const closeTerminal = useCallback((termSessionId) => {
    if (!isEnabled || !globalWebSocket) {
      return;
    }

    console.log('[useRemoteManagement] Closing terminal:', termSessionId);

    const message = {
      type: 'term_close',
      session_id: termSessionId
    };

    sendMessage(message);
    
    // Clean up local state
    terminalHandlersRef.current.delete(termSessionId);
    if (activeTerminalSessionRef.current === termSessionId) {
      activeTerminalSessionRef.current = null;
    }
    setTerminalSessions(prev => {
      const next = new Map(prev);
      next.delete(termSessionId);
      return next;
    });
  }, [isEnabled, sendMessage]);

  // Legacy command execution support
  const executeCommand = useCallback(async (command, args = [], cwd = null) => {
    if (!isEnabled || !globalWebSocket) {
      throw new Error('Remote management not enabled');
    }

    // Check if JWT is still valid
    if (!isJwtValid()) {
      console.log('[useRemoteManagement] JWT expired, re-enabling');
      const success = await enableRemoteManagement();
      if (!success) {
        throw new Error('Failed to re-enable remote management');
      }
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.current.delete(requestId);
        const errorResponse = {
          success: false,
          message: 'Command timeout',
          data: null,
          error: {
            message: 'Command timeout',
            code: 408
          }
        };
        reject(errorResponse);
      }, 30000);

      pendingRequests.current.set(requestId, {
        resolve,
        reject,
        timeout
      });

      const commandMessage = {
        type: 'remote_command',
        node_reference: nodeReference,
        request_id: requestId,
        command: {
          type: 'execute',
          cmd: command,
          args: args,
          cwd: cwd
        }
      };
      
      sendMessage(commandMessage);
    });
  }, [isEnabled, nodeReference, isJwtValid, enableRemoteManagement, sendMessage]);

  // Legacy file upload support
  const uploadFile = useCallback(async (path, content, base64 = false) => {
    if (!isEnabled || !globalWebSocket) {
      throw new Error('Remote management not enabled');
    }

    // Check if JWT is still valid
    if (!isJwtValid()) {
      console.log('[useRemoteManagement] JWT expired, re-enabling');
      const success = await enableRemoteManagement();
      if (!success) {
        throw new Error('Failed to re-enable remote management');
      }
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (!base64) {
      content = btoa(unescape(encodeURIComponent(content)));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.current.delete(requestId);
        const errorResponse = {
          success: false,
          message: 'Upload timeout',
          data: null,
          error: {
            message: 'Upload timeout',
            code: 408
          }
        };
        reject(errorResponse);
      }, 60000);

      pendingRequests.current.set(requestId, {
        resolve,
        reject,
        timeout
      });

      const uploadMessage = {
        type: 'remote_command',
        node_reference: nodeReference,
        request_id: requestId,
        command: {
          type: 'upload',
          path: path,
          content: content,
          encoding: 'base64'
        }
      };
      
      sendMessage(uploadMessage);
    });
  }, [isEnabled, nodeReference, isJwtValid, enableRemoteManagement, sendMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Close all terminal sessions
      terminalSessions.forEach((_, sessionId) => {
        closeTerminal(sessionId);
      });

      // Clean up message handler
      if (messageHandlerRef.current && globalWebSocket) {
        globalWebSocket.removeEventListener('message', messageHandlerRef.current);
        messageHandlerRef.current = null;
      }
      
      // Clean up pending requests
      pendingRequests.current.forEach(({ timeout }) => {
        clearTimeout(timeout);
      });
      pendingRequests.current.clear();
      
      // Clean up terminal timeouts
      terminalTimeouts.current.forEach(({ timeout }) => {
        clearTimeout(timeout);
      });
      terminalTimeouts.current.clear();
      
      // Clear terminal handlers
      terminalHandlersRef.current.clear();
      
      // Clear active session reference
      activeTerminalSessionRef.current = null;
      
      // Clear JWT token
      jwtTokenRef.current = null;
      jwtExpiryRef.current = null;
    };
  }, []);

  return {
    isEnabled,
    isEnabling,
    error: error || signatureError,
    sessionId,
    terminalSessions: Array.from(terminalSessions.values()),
    signatureRemainingTime: remainingTimeFormatted,
    isSignatureLoading,
    enableRemoteManagement,
    
    // Terminal methods
    initTerminal,
    sendTerminalInput,
    resizeTerminal,
    closeTerminal,
    
    // Legacy command methods
    executeCommand,
    uploadFile
  };
}
