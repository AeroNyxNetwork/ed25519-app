/**
 * Remote Management Hook
 * 
 * File Path: src/hooks/useRemoteManagement.js
 * 
 * Uses the existing WebSocket connection from useAeroNyxWebSocket
 * to enable remote management functionality
 * 
 * @version 1.1.0
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import nodeRegistrationService from '../lib/api/nodeRegistration';

// Get the WebSocket instance from the global context
// This is set by useAeroNyxWebSocket when it connects
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
  const [isEnabled, setIsEnabled] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState(null);
  const pendingRequests = useRef(new Map());
  const messageHandlerRef = useRef(null);

  // Enable remote management
  const enableRemoteManagement = useCallback(async () => {
    console.log('[useRemoteManagement] enableRemoteManagement called', {
      walletConnected: wallet.connected,
      nodeReference,
      hasGlobalWebSocket: !!globalWebSocket,
      wsState: globalWsState
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
      // Step 1: Generate signature message
      console.log('[useRemoteManagement] Step 1: Generating signature message');
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }
      const signatureMessage = messageResponse.data.message;
      console.log('[useRemoteManagement] Signature message received');

      // Step 2: Sign message with wallet
      console.log('[useRemoteManagement] Step 2: Signing message with wallet');
      const signature = await wallet.provider.request({
        method: 'personal_sign',
        params: [signatureMessage, wallet.address]
      });
      console.log('[useRemoteManagement] Message signed successfully');

      // Step 3: Get JWT Token for remote management
      console.log('[useRemoteManagement] Step 3: Getting JWT token');
      console.log('[useRemoteManagement] Request params:', {
        walletAddress: wallet.address,
        signatureLength: signature?.length,
        messageLength: signatureMessage?.length,
        walletType: 'okx',
        nodeReference
      });
      
      const tokenResponse = await nodeRegistrationService.generateRemoteManagementToken(
        wallet.address,
        signature,
        signatureMessage,
        'okx',
        nodeReference
      );

      console.log('[useRemoteManagement] Full token API response:', JSON.stringify(tokenResponse, null, 2));
      console.log('[useRemoteManagement] Response type:', typeof tokenResponse);
      console.log('[useRemoteManagement] Response keys:', Object.keys(tokenResponse || {}));

      if (!tokenResponse) {
        throw new Error('No response received from token API');
      }

      if (!tokenResponse.success) {
        console.error('[useRemoteManagement] Token API failed:', tokenResponse);
        throw new Error(tokenResponse.message || 'Failed to get remote management token');
      }

      // Check data structure
      if (!tokenResponse.data) {
        console.error('[useRemoteManagement] No data in response:', tokenResponse);
        throw new Error('Invalid response structure - missing data');
      }

      // The API returns: { success: true, data: { token: "...", ... }, ... }
      const jwtToken = tokenResponse.data.token;
      
      console.log('[useRemoteManagement] JWT token received:', jwtToken ? 'Yes' : 'No');
      console.log('[useRemoteManagement] Token type:', tokenResponse.data.token_type);
      console.log('[useRemoteManagement] Expires in:', tokenResponse.data.expires_in);
      console.log('[useRemoteManagement] Node info:', tokenResponse.data.node);
      
      if (jwtToken) {
        console.log('[useRemoteManagement] Token first 50 chars:', jwtToken.substring(0, 50));
        console.log('[useRemoteManagement] Token length:', jwtToken.length);
      }

      if (!jwtToken) {
        console.error('[useRemoteManagement] tokenResponse.data structure:', {
          dataType: typeof tokenResponse.data,
          dataKeys: Object.keys(tokenResponse.data || {}),
          dataStringified: JSON.stringify(tokenResponse.data)
        });
        throw new Error('No JWT token found in server response');
      }

      // Step 4: Send remote_auth to existing WebSocket
      console.log('[useRemoteManagement] Step 4: Sending remote_auth message');
      
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
              setIsEnabled(true);
              setIsEnabling(false);
              resolve(true);
            } else if (data.type === 'error' && (data.message?.includes('remote') || data.message?.includes('JWT'))) {
              console.error('[useRemoteManagement] Remote auth error:', data.message);
              clearTimeout(timeout);
              globalWebSocket.removeEventListener('message', handleMessage);
              messageHandlerRef.current = null;
              setIsEnabling(false);
              reject(new Error(data.message));
            }
          } catch (err) {
            console.error('[useRemoteManagement] Error parsing message:', err);
          }
        };

        messageHandlerRef.current = handleMessage;
        globalWebSocket.addEventListener('message', handleMessage);

        // Check WebSocket state before sending
        if (globalWebSocket.readyState !== WebSocket.OPEN) {
          clearTimeout(timeout);
          globalWebSocket.removeEventListener('message', handleMessage);
          messageHandlerRef.current = null;
          reject(new Error('WebSocket is not open'));
          return;
        }

        // Send remote_auth message with JWT token
        const authMessage = {
          type: 'remote_auth',
          jwt_token: jwtToken
        };
        
        console.log('[useRemoteManagement] Sending remote_auth with JWT token');
        console.log('[useRemoteManagement] Auth message:', JSON.stringify(authMessage));
        console.log('[useRemoteManagement] WebSocket readyState:', globalWebSocket.readyState);
        
        globalWebSocket.send(JSON.stringify(authMessage));
      });

    } catch (err) {
      console.error('[useRemoteManagement] Failed to enable remote management:', err);
      setError(err.message);
      setIsEnabling(false);
      return false;
    }
  }, [wallet, nodeReference]);

  // Execute remote command
  const executeCommand = useCallback(async (command, args = [], cwd = null) => {
    console.log('[useRemoteManagement] executeCommand called', { command, args, cwd, isEnabled });
    
    if (!isEnabled || !globalWebSocket) {
      throw new Error('Remote management not enabled or WebSocket not available');
    }

    if (globalWebSocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const handler = pendingRequests.current.get(requestId);
        if (handler) {
          globalWebSocket.removeEventListener('message', handler.handleMessage);
          pendingRequests.current.delete(requestId);
        }
        reject(new Error('Command timeout'));
      }, 30000);

      const handleMessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'remote_command_response' && data.request_id === requestId) {
            console.log('[useRemoteManagement] Command response received:', data);
            clearTimeout(timeout);
            globalWebSocket.removeEventListener('message', handleMessage);
            pendingRequests.current.delete(requestId);

            if (data.success) {
              resolve(data.result);
            } else {
              reject(new Error(data.error || 'Command failed'));
            }
          }
        } catch (err) {
          console.error('[useRemoteManagement] Error parsing command response:', err);
        }
      };

      pendingRequests.current.set(requestId, { timeout, handleMessage });
      globalWebSocket.addEventListener('message', handleMessage);

      // Send command
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
      
      console.log('[useRemoteManagement] Sending command:', commandMessage);
      globalWebSocket.send(JSON.stringify(commandMessage));
    });
  }, [isEnabled, nodeReference]);

  // Upload file
  const uploadFile = useCallback(async (path, content, base64 = false) => {
    console.log('[useRemoteManagement] uploadFile called', { path, base64, isEnabled });
    
    if (!isEnabled || !globalWebSocket) {
      throw new Error('Remote management not enabled or WebSocket not available');
    }

    if (globalWebSocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (!base64) {
      content = btoa(unescape(encodeURIComponent(content)));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const handler = pendingRequests.current.get(requestId);
        if (handler) {
          globalWebSocket.removeEventListener('message', handler.handleMessage);
          pendingRequests.current.delete(requestId);
        }
        reject(new Error('Upload timeout'));
      }, 60000);

      const handleMessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'remote_command_response' && data.request_id === requestId) {
            console.log('[useRemoteManagement] Upload response received:', data);
            clearTimeout(timeout);
            globalWebSocket.removeEventListener('message', handleMessage);
            pendingRequests.current.delete(requestId);

            if (data.success) {
              resolve(data.result);
            } else {
              reject(new Error(data.error || 'Upload failed'));
            }
          }
        } catch (err) {
          console.error('[useRemoteManagement] Error parsing upload response:', err);
        }
      };

      pendingRequests.current.set(requestId, { timeout, handleMessage });
      globalWebSocket.addEventListener('message', handleMessage);

      // Send upload command
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
      
      console.log('[useRemoteManagement] Sending upload command');
      globalWebSocket.send(JSON.stringify(uploadMessage));
    });
  }, [isEnabled, nodeReference]);

  // Cleanup pending requests on unmount
  useEffect(() => {
    return () => {
      // Clean up message handler
      if (messageHandlerRef.current && globalWebSocket) {
        globalWebSocket.removeEventListener('message', messageHandlerRef.current);
        messageHandlerRef.current = null;
      }
      
      // Clean up pending requests
      pendingRequests.current.forEach(({ timeout, handleMessage }) => {
        clearTimeout(timeout);
        if (globalWebSocket) {
          globalWebSocket.removeEventListener('message', handleMessage);
        }
      });
      pendingRequests.current.clear();
    };
  }, []);

  return {
    isEnabled,
    isEnabling,
    error,
    enableRemoteManagement,
    executeCommand,
    uploadFile
  };
}
