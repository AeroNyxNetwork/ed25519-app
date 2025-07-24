/**
 * Remote Management Hook
 * 
 * File Path: src/hooks/useRemoteManagement.js
 * 
 * Uses the existing WebSocket connection from useAeroNyxWebSocket
 * to enable remote management functionality
 * 
 * @version 1.0.0
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import nodeRegistrationService from '../lib/api/nodeRegistration';

// Get the WebSocket instance from the global context
// This is set by useAeroNyxWebSocket when it connects
let globalWebSocket = null;

// Export function to set the global WebSocket (called by useAeroNyxWebSocket)
export function setGlobalWebSocket(ws) {
  globalWebSocket = ws;
}

export function useRemoteManagement(nodeReference) {
  const { wallet } = useWallet();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState(null);
  const pendingRequests = useRef(new Map());

  // Enable remote management
  const enableRemoteManagement = useCallback(async () => {
    if (!wallet.connected || !nodeReference || !globalWebSocket) {
      setError('WebSocket not connected or wallet not available');
      return false;
    }

    setIsEnabling(true);
    setError(null);

    try {
      // Step 1: Generate signature message
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }
      const signatureMessage = messageResponse.data.message;

      // Step 2: Sign message with wallet
      const signature = await wallet.provider.request({
        method: 'personal_sign',
        params: [signatureMessage, wallet.address]
      });

      // Step 3: Get JWT Token for remote management
      const tokenResponse = await nodeRegistrationService.generateRemoteManagementToken(
        wallet.address,
        signature,
        signatureMessage,
        'okx',
        nodeReference
      );

      if (!tokenResponse.success) {
        throw new Error(tokenResponse.message || 'Failed to get remote management token');
      }

      const jwtToken = tokenResponse.data.token;

      // Step 4: Send remote_auth to existing WebSocket
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Remote auth timeout'));
        }, 10000);

        const handleMessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'remote_auth_success') {
              clearTimeout(timeout);
              globalWebSocket.removeEventListener('message', handleMessage);
              setIsEnabled(true);
              resolve(true);
            } else if (data.type === 'error' && data.message?.includes('remote')) {
              clearTimeout(timeout);
              globalWebSocket.removeEventListener('message', handleMessage);
              reject(new Error(data.message));
            }
          } catch (err) {
            // Ignore parse errors
          }
        };

        globalWebSocket.addEventListener('message', handleMessage);

        // Send remote_auth message
        globalWebSocket.send(JSON.stringify({
          type: 'remote_auth',
          jwt_token: jwtToken
        }));
      });

    } catch (err) {
      console.error('Failed to enable remote management:', err);
      setError(err.message);
      return false;
    } finally {
      setIsEnabling(false);
    }
  }, [wallet, nodeReference]);

  // Execute remote command
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

      const handleMessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'remote_command_response' && data.request_id === requestId) {
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
          // Ignore parse errors
        }
      };

      pendingRequests.current.set(requestId, { timeout, handleMessage });
      globalWebSocket.addEventListener('message', handleMessage);

      // Send command
      globalWebSocket.send(JSON.stringify({
        type: 'remote_command',
        node_reference: nodeReference,
        request_id: requestId,
        command: {
          type: 'execute',
          cmd: command,
          args: args,
          cwd: cwd
        }
      }));
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

      const handleMessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'remote_command_response' && data.request_id === requestId) {
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
          // Ignore parse errors
        }
      };

      pendingRequests.current.set(requestId, { timeout, handleMessage });
      globalWebSocket.addEventListener('message', handleMessage);

      // Send upload command
      globalWebSocket.send(JSON.stringify({
        type: 'remote_command',
        node_reference: nodeReference,
        request_id: requestId,
        command: {
          type: 'upload',
          path: path,
          content: content,
          encoding: 'base64'
        }
      }));
    });
  }, [isEnabled, nodeReference]);

  // Cleanup pending requests on unmount
  useEffect(() => {
    return () => {
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
