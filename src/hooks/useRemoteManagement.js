/**
 * Fixed Remote Management Hook with proper message format
 * 
 * File Path: src/hooks/useRemoteManagement.js
 * 
 * @version 5.2.0
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

  // Check if JWT token is still valid
  const isJwtValid = useCallback(() => {
    if (!jwtTokenRef.current || !jwtExpiryRef.current) return false;
    return Date.now() < jwtExpiryRef.current;
  }, []);

  // Helper to send message through WebSocket (NO JWT in messages after remote_auth)
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
            console.log('[useRemoteManagement] Received message:', data.type);
            
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
        
        // Skip if this is a message we're handling elsewhere
        if (data.type === 'remote_auth_success' || data.type === 'connected' || 
            data.type === 'auth_success' || data.type === 'status_update') {
          return;
        }
        
        // Handle terminal messages
        if (data.type === 'term_ready') {
          console.log('[useRemoteManagement] Terminal ready (permanent handler):', data.session_id);
          // This should be handled by the temporary handler in initTerminal
          // But log it for debugging
        } else if (data.type === 'term_output' && data.session_id) {
          const sessionHandler = terminalHandlersRef.current.get(data.session_id);
          if (sessionHandler?.onOutput) {
            sessionHandler.onOutput(data.data);
          }
        } else if (data.type === 'term_error' && data.session_id) {
          console.error('[useRemoteManagement] Terminal error:', data.session_id, data.error);
          const sessionHandler = terminalHandlersRef.current.get(data.session_id);
          if (sessionHandler?.onError) {
            sessionHandler.onError(data.error);
          }
          // Clean up failed session
          terminalHandlersRef.current.delete(data.session_id);
        } else if (data.type === 'term_closed' && data.session_id) {
          console.log('[useRemoteManagement] Terminal closed:', data.session_id);
          const sessionHandler = terminalHandlersRef.current.get(data.session_id);
          if (sessionHandler?.onClose) {
            sessionHandler.onClose();
          }
          terminalHandlersRef.current.delete(data.session_id);
          setTerminalSessions(prev => {
            const next = new Map(prev);
            next.delete(data.session_id);
            return next;
          });
        } else if (data.type === 'error') {
          // Log all errors for debugging
          console.error('[useRemoteManagement] General error:', data);
          
          // Handle specific terminal-related errors
          if (data.code === 'NODE_MISMATCH' || 
              data.code === 'NODE_OFFLINE' || 
              data.code === 'NODE_NOT_FOUND' ||
              data.code === 'SESSION_LIMIT_EXCEEDED' ||
              data.code === 'REMOTE_NOT_ENABLED' ||
              data.code === 'NOT_AUTHENTICATED' ||
              data.code === 'INVALID_TOKEN' ||
              data.code === 'TOKEN_EXPIRED') {
            console.error('[useRemoteManagement] Terminal operation error:', data.code, data.message);
          }
        }
        
        // Handle command responses
        if (data.type === 'remote_command_response') {
          const pending = pendingRequests.current.get(data.request_id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingRequests.current.delete(data.request_id);
            
            console.log('[useRemoteManagement] Command response:', {
              request_id: data.request_id,
              success: data.success,
              result: data.result,
              error: data.error
            });
            
            if (data.success) {
              // For file operations, format the response to match ApiResponse format
              const response = {
                success: true,
                message: 'Operation completed successfully',
                data: data.result,
                error: null
              };
              pending.resolve(response);
            } else {
              // Format error response to match ApiResponse format
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
    
    // Store handler reference for cleanup
    messageHandlerRef.current = handler;
  }, []);

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
      const timeout = setTimeout(() => {
        console.error('[useRemoteManagement] Terminal initialization timeout - no term_ready received');
        reject(new Error('Terminal initialization timeout'));
      }, 15000);

      // Set up handlers for ANY terminal response (not tied to specific session_id yet)
      const tempHandler = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Check for term_ready message
          if (data.type === 'term_ready') {
            console.log('[useRemoteManagement] Received term_ready:', data);
            clearTimeout(timeout);
            globalWebSocket.removeEventListener('message', tempHandler);
            
            const sessionId = data.session_id;
            
            // Set up permanent handlers for this session
            terminalHandlersRef.current.set(sessionId, {
              onOutput: options.onOutput || null,
              onError: options.onError || null,
              onClose: options.onClose || null
            });
            
            setTerminalSessions(prev => {
              const next = new Map(prev);
              next.set(sessionId, {
                sessionId: sessionId,
                nodeReference,
                status: 'ready',
                rows: options.rows || 24,
                cols: options.cols || 80
              });
              return next;
            });
            
            resolve(sessionId);
          } else if (data.type === 'term_error' || 
                     (data.type === 'error' && data.message && 
                      (data.message.includes('term') || data.message.includes('session')))) {
            console.error('[useRemoteManagement] Terminal initialization error:', data);
            clearTimeout(timeout);
            globalWebSocket.removeEventListener('message', tempHandler);
            
            const errorMessage = data.error || data.message || 'Terminal initialization failed';
            if (options.onError) {
              options.onError(errorMessage);
            }
            reject(new Error(errorMessage));
          }
        } catch (err) {
          console.error('[useRemoteManagement] Error parsing terminal response:', err);
        }
      };
      
      // Add temporary handler
      globalWebSocket.addEventListener('message', tempHandler);

      // Send term_init message - MINIMAL format per documentation
      const initMessage = {
        type: 'term_init',
        node_reference: nodeReference
      };

      // Only add optional parameters if they have non-default values
      if (options.rows && options.rows !== 24) {
        initMessage.rows = options.rows;
      }
      if (options.cols && options.cols !== 80) {
        initMessage.cols = options.cols;
      }
      if (options.cwd) {
        initMessage.cwd = options.cwd;
      }
      if (options.env && Object.keys(options.env).length > 0) {
        initMessage.env = options.env;
      }

      console.log('[useRemoteManagement] Sending term_init message:', JSON.stringify(initMessage));
      sendMessage(initMessage);
    });
  }, [isEnabled, nodeReference, isJwtValid, enableRemoteManagement, sendMessage]);

  // Send terminal input
  const sendTerminalInput = useCallback((termSessionId, data) => {
    if (!isEnabled || !globalWebSocket) {
      throw new Error('Remote management not enabled');
    }

    const message = {
      type: 'term_input',
      session_id: termSessionId,
      data: data // Send raw data, WebTerminal handles encoding
    };

    sendMessage(message);
  }, [isEnabled, sendMessage]);

  // Resize terminal
  const resizeTerminal = useCallback((termSessionId, rows, cols) => {
    if (!isEnabled || !globalWebSocket) {
      throw new Error('Remote management not enabled');
    }

    // Validate ranges according to documentation
    const validRows = Math.max(10, Math.min(200, rows));
    const validCols = Math.max(40, Math.min(400, cols));

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

  // Execute command (legacy support for file manager)
  const executeCommand = useCallback(async (command, args = [], cwd = null) => {
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

  // Upload file (legacy support for file manager)
  const uploadFile = useCallback(async (path, content, base64 = false) => {
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
