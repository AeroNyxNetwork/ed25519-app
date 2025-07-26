/**
 * Remote Management Hook with Cached Signature Support
 * 
 * File Path: src/hooks/useRemoteManagement.js
 * 
 * Updated to use cached signatures for reducing signing frequency
 * 
 * @version 4.0.0
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { useCachedSignature } from './useCachedSignature';

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
  
  // Use cached signature for remote management
  const {
    signature,
    message,
    ensureSignature,
    isLoading: isSignatureLoading,
    error: signatureError,
    remainingTimeFormatted
  } = useCachedSignature('remote-management');
  
  const [isEnabled, setIsEnabled] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [terminalSessions, setTerminalSessions] = useState(new Map());
  
  const pendingRequests = useRef(new Map());
  const messageHandlerRef = useRef(null);
  const terminalHandlersRef = useRef(new Map());
  const jwtTokenRef = useRef(null);

  // Enable remote management
  const enableRemoteManagement = useCallback(async () => {
    console.log('[useRemoteManagement] enableRemoteManagement called', {
      walletConnected: wallet.connected,
      nodeReference,
      hasGlobalWebSocket: !!globalWebSocket,
      wsState: globalWsState,
      hasCachedSignature: !!signature,
      signatureRemainingTime: remainingTimeFormatted
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

    setIsEnabling(true);
    setError(null);

    try {
      // Step 1: Ensure we have a valid signature (from cache or new)
      console.log('[useRemoteManagement] Step 1: Ensuring valid signature');
      const signatureData = await ensureSignature();
      
      if (!signatureData || !signatureData.signature || !signatureData.message) {
        throw new Error('Failed to obtain signature');
      }

      console.log('[useRemoteManagement] Using signature (cached or new)');

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

      // Store JWT token for later use
      jwtTokenRef.current = jwtToken;
      console.log('[useRemoteManagement] JWT token received and stored');

      // Step 3: Send remote_auth message
      console.log('[useRemoteManagement] Step 3: Sending remote_auth message');
      
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
              data.code === 'MISSING_JWT'
            )) {
              console.error('[useRemoteManagement] Remote auth error:', data);
              clearTimeout(timeout);
              globalWebSocket.removeEventListener('message', handleMessage);
              messageHandlerRef.current = null;
              setIsEnabling(false);
              reject(new Error(data.message || 'Remote authentication failed'));
            }
          } catch (err) {
            console.error('[useRemoteManagement] Error parsing message:', err);
          }
        };

        messageHandlerRef.current = handleMessage;
        globalWebSocket.addEventListener('message', handleMessage);

        // Send remote_auth message
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
      
      // If signature error, show it
      if (signatureError) {
        setError(`Signature error: ${signatureError}`);
      }
      
      return false;
    }
  }, [wallet, nodeReference, ensureSignature, signatureError, remainingTimeFormatted]);

  // Set up permanent handlers for terminal and command responses
  const setupPermanentHandlers = useCallback(() => {
    const handler = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle terminal messages
        if (data.type === 'term_ready') {
          const handler = terminalHandlersRef.current.get(data.session_id);
          if (handler?.onReady) {
            handler.onReady(data);
          }
        } else if (data.type === 'term_output') {
          const handler = terminalHandlersRef.current.get(data.session_id);
          if (handler?.onOutput) {
            handler.onOutput(data.data);
          }
        } else if (data.type === 'term_error') {
          const handler = terminalHandlersRef.current.get(data.session_id);
          if (handler?.onError) {
            handler.onError(data.error);
          }
        } else if (data.type === 'term_closed') {
          const handler = terminalHandlersRef.current.get(data.session_id);
          if (handler?.onClose) {
            handler.onClose();
          }
          terminalHandlersRef.current.delete(data.session_id);
          setTerminalSessions(prev => {
            const next = new Map(prev);
            next.delete(data.session_id);
            return next;
          });
        }
        
        // Handle command responses
        if (data.type === 'remote_command_response') {
          const pending = pendingRequests.current.get(data.request_id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingRequests.current.delete(data.request_id);
            if (data.success) {
              pending.resolve(data.result);
            } else {
              pending.reject(new Error(data.error || 'Command failed'));
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

    const termSessionId = sessionId || `term-${Date.now()}`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        terminalHandlersRef.current.delete(termSessionId);
        reject(new Error('Terminal initialization timeout'));
      }, 10000);

      // Set up handlers for this terminal session
      terminalHandlersRef.current.set(termSessionId, {
        onReady: (data) => {
          clearTimeout(timeout);
          setTerminalSessions(prev => {
            const next = new Map(prev);
            next.set(data.session_id, {
              sessionId: data.session_id,
              nodeReference,
              status: 'ready',
              rows: options.rows || 24,
              cols: options.cols || 80
            });
            return next;
          });
          resolve(data.session_id);
        },
        onOutput: options.onOutput || null,
        onError: options.onError || null,
        onClose: options.onClose || null
      });

      // Send term_init message
      const initMessage = {
        type: 'term_init',
        node_reference: nodeReference,
        session_id: termSessionId,
        rows: options.rows || 24,
        cols: options.cols || 80,
        cwd: options.cwd,
        env: options.env
      };

      console.log('[useRemoteManagement] Initializing terminal:', initMessage);
      globalWebSocket.send(JSON.stringify(initMessage));
    });
  }, [isEnabled, nodeReference, sessionId]);

  // Send terminal input
  const sendTerminalInput = useCallback((termSessionId, data) => {
    if (!isEnabled || !globalWebSocket) {
      throw new Error('Remote management not enabled');
    }

    const message = {
      type: 'term_input',
      session_id: termSessionId,
      data: btoa(data) // Base64 encode
    };

    globalWebSocket.send(JSON.stringify(message));
  }, [isEnabled]);

  // Resize terminal
  const resizeTerminal = useCallback((termSessionId, rows, cols) => {
    if (!isEnabled || !globalWebSocket) {
      throw new Error('Remote management not enabled');
    }

    const message = {
      type: 'term_resize',
      session_id: termSessionId,
      rows,
      cols
    };

    globalWebSocket.send(JSON.stringify(message));
    
    // Update local state
    setTerminalSessions(prev => {
      const next = new Map(prev);
      const session = next.get(termSessionId);
      if (session) {
        session.rows = rows;
        session.cols = cols;
      }
      return next;
    });
  }, [isEnabled]);

  // Close terminal
  const closeTerminal = useCallback((termSessionId) => {
    if (!isEnabled || !globalWebSocket) {
      return;
    }

    const message = {
      type: 'term_close',
      session_id: termSessionId
    };

    globalWebSocket.send(JSON.stringify(message));
    
    // Clean up local state
    terminalHandlersRef.current.delete(termSessionId);
    setTerminalSessions(prev => {
      const next = new Map(prev);
      next.delete(termSessionId);
      return next;
    });
  }, [isEnabled]);

  // Execute command (with JWT token if needed)
  const executeCommand = useCallback(async (command, args = [], cwd = null) => {
    if (!isEnabled || !globalWebSocket) {
      throw new Error('Remote management not enabled');
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.current.delete(requestId);
        reject(new Error('Command timeout'));
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
      
      // Include JWT token if available
      if (jwtTokenRef.current) {
        commandMessage.jwt_token = jwtTokenRef.current;
      }
      
      globalWebSocket.send(JSON.stringify(commandMessage));
    });
  }, [isEnabled, nodeReference]);

  // Upload file
  const uploadFile = useCallback(async (path, content, base64 = false) => {
    if (!isEnabled || !globalWebSocket) {
      throw new Error('Remote management not enabled');
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (!base64) {
      content = btoa(unescape(encodeURIComponent(content)));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.current.delete(requestId);
        reject(new Error('Upload timeout'));
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
      
      // Include JWT token if available
      if (jwtTokenRef.current) {
        uploadMessage.jwt_token = jwtTokenRef.current;
      }
      
      globalWebSocket.send(JSON.stringify(uploadMessage));
    });
  }, [isEnabled, nodeReference]);

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
