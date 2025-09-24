/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Creation Reason: Hook for remote node management via WebSocket
 * Modification Reason: Fixed terminal output routing and session management
 * Main Functionality: Manages terminal sessions and file operations
 * Dependencies: useAeroNyxWebSocket, useGlobalSignature
 *
 * Main Logical Flow:
 * 1. Get JWT token for remote management
 * 2. Authenticate with WebSocket using JWT
 * 3. Initialize terminal sessions with proper handlers
 * 4. Route terminal messages to appropriate callbacks
 * 5. Handle terminal lifecycle (init, output, resize, close)
 *
 * ⚠️ Important Note for Next Developer:
 * - Terminal handlers MUST be stored before sending term_init
 * - Output data needs proper decoding (base64 or raw)
 * - Session handlers are stored in terminalHandlersRef
 * - Must handle both term_ready and term_init_success messages
 *
 * Last Modified: v5.4.0 - Fixed terminal output routing
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
        
        // Skip non-terminal messages
        if (data.type === 'remote_auth_success' || data.type === 'connected' || 
            data.type === 'auth_success' || data.type === 'status_update' ||
            data.type === 'signature_message' || data.type === 'monitor_started') {
          return;
        }
        
        console.log('[useRemoteManagement] Permanent handler received:', data.type);
        
        // Handle terminal initialization success
        if (data.type === 'term_init_success' || data.type === 'term_ready') {
          console.log('[useRemoteManagement] Terminal initialized:', data);
          const sessionId = data.session_id;
          
          // Find and resolve the pending initialization
          const pending = terminalTimeouts.current.get('pending_' + nodeReference);
          if (pending) {
            clearTimeout(pending.timeout);
            terminalTimeouts.current.delete('pending_' + nodeReference);
            
            // The handlers were already set up during initTerminal
            // Just need to mark the session as ready
            const handlers = terminalHandlersRef.current.get(sessionId);
            if (handlers) {
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
              
              // Call onReady callback
              if (handlers.onReady) {
                handlers.onReady({ session_id: sessionId });
              }
            }
            
            // Resolve the promise
            if (pending.resolve) {
              pending.resolve(sessionId);
            }
          }
        }
        // Handle terminal output
        else if (data.type === 'term_output' && data.session_id) {
          const handlers = terminalHandlersRef.current.get(data.session_id);
          console.log('[useRemoteManagement] Terminal output for session:', data.session_id, 'has handler:', !!handlers, 'data:', data.data);
          
          if (handlers?.onOutput) {
            // Pass the raw data to the handler (server already decoded it)
            handlers.onOutput(data.data);
          } else {
            console.warn('[useRemoteManagement] No handler found for session:', data.session_id);
          }
        }
        // Handle terminal errors
        else if (data.type === 'term_error') {
          console.error('[useRemoteManagement] Terminal error:', data);
          
          // Check if this is an init error
          if (data.message && (data.message.includes('init') || data.code === 'INVALID_SESSION')) {
            const pending = terminalTimeouts.current.get('pending_' + nodeReference);
            if (pending) {
              clearTimeout(pending.timeout);
              terminalTimeouts.current.delete('pending_' + nodeReference);
              if (pending.reject) {
                pending.reject(new Error(data.error || data.message || 'Terminal initialization failed'));
              }
            }
          }
          
          // Handle session-specific errors
          if (data.session_id) {
            const handlers = terminalHandlersRef.current.get(data.session_id);
            if (handlers?.onError) {
              handlers.onError(data.error || data.message);
            }
            // Clean up failed session
            terminalHandlersRef.current.delete(data.session_id);
            setTerminalSessions(prev => {
              const next = new Map(prev);
              next.delete(data.session_id);
              return next;
            });
          }
        }
        // Handle terminal closed
        else if (data.type === 'term_closed' && data.session_id) {
          console.log('[useRemoteManagement] Terminal closed:', data.session_id);
          const handlers = terminalHandlersRef.current.get(data.session_id);
          if (handlers?.onClose) {
            handlers.onClose();
          }
          terminalHandlersRef.current.delete(data.session_id);
          setTerminalSessions(prev => {
            const next = new Map(prev);
            next.delete(data.session_id);
            return next;
          });
        }
        // Handle general errors
        else if (data.type === 'error') {
          console.error('[useRemoteManagement] General error:', data);
          
          // Handle terminal-related errors
          if (data.code === 'NODE_MISMATCH' || 
              data.code === 'NODE_OFFLINE' || 
              data.code === 'NODE_NOT_FOUND' ||
              data.code === 'SESSION_LIMIT_EXCEEDED' ||
              data.code === 'REMOTE_NOT_ENABLED' ||
              data.code === 'NOT_AUTHENTICATED' ||
              data.code === 'INVALID_TOKEN' ||
              data.code === 'TOKEN_EXPIRED' ||
              data.code === 'INVALID_SESSION') {
            
            // Handle pending terminal init
            const pending = terminalTimeouts.current.get('pending_' + nodeReference);
            if (pending) {
              clearTimeout(pending.timeout);
              terminalTimeouts.current.delete('pending_' + nodeReference);
              if (pending.reject) {
                pending.reject(new Error(data.message || 'Terminal operation failed'));
              }
            }
          }
        }
        // Handle command responses
        else if (data.type === 'remote_command_response') {
          const pending = pendingRequests.current.get(data.request_id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingRequests.current.delete(data.request_id);
            
            if (data.success) {
              const response = {
                success: true,
                message: 'Operation completed successfully',
                data: data.result,
                error: null
              };
              pending.resolve(response);
            } else {
              const errorResponse = {
                success: false,
                message: data.error || 'Operation failed',
                data: null,
                error: {
                  message: data.error || 'Operation failed',
                  code: 400
                }
              };
              pending.reject(errorResponse);
            }
          }
        }
      } catch (err) {
        console.error('[useRemoteManagement] Error in permanent handler:', err);
      }
    };

    globalWebSocket.addEventListener('message', handler);
    messageHandlerRef.current = handler;
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
      
      // Store handlers BEFORE sending the init message
      // This ensures we can receive output even if term_ready is delayed
      terminalHandlersRef.current.set(tempSessionId, {
        onOutput: options.onOutput || null,
        onError: options.onError || null,
        onClose: options.onClose || null,
        onReady: options.onReady || null
      });
      
      console.log('[useRemoteManagement] Stored handlers for session:', tempSessionId);
      
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

    console.log('[useRemoteManagement] Sending input to session:', termSessionId, 'data length:', data.length, 'data:', data);

    const message = {
      type: 'term_input',
      session_id: termSessionId,
      data: data // Send raw data as-is (no encoding needed)
    };

    console.log('[useRemoteManagement] Sending term_input message:', message);
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
