/**
 * WebSocket Provider Component
 * 
 * Provides WebSocket context and services to the application
 * with automatic connection management.
 * 
 * @version 1.0.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useWallet } from '../wallet/WalletProvider';
import { wsManager } from '../../lib/websocket/WebSocketManager';
import { signMessage, formatMessageForSigning } from '../../lib/utils/walletSignature';
import nodeRegistrationService from '../../lib/api/nodeRegistration';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { wallet } = useWallet();
  const [userMonitorService, setUserMonitorService] = useState(null);
  const [systemMonitorService, setSystemMonitorService] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!wallet.connected || !wallet.address) {
      // Cleanup when wallet disconnected
      if (userMonitorService) {
        wsManager.removeService(`userMonitor:${wallet.address}`);
        setUserMonitorService(null);
      }
      setIsInitialized(false);
      return;
    }

    // Initialize user monitor when wallet connected
    const initializeUserMonitor = async () => {
      try {
        // Get signature for WebSocket authentication
        const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
        
        if (!messageResponse.success) {
          throw new Error(messageResponse.message || 'Failed to generate signature message');
        }

        const message = messageResponse.data.message;
        const formattedMessage = formatMessageForSigning(message);
        const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);

        // Create wallet credentials
        const walletCredentials = {
          walletAddress: wallet.address,
          signature,
          message,
          walletType: 'okx'
        };

        // Get or create user monitor service
        const service = wsManager.getUserMonitorService(walletCredentials);
        setUserMonitorService(service);

        // Connect and start monitoring
        await service.connect();
        
        service.once('auth_success', () => {
          service.startMonitoring();
        });

        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize user monitor:', error);
      }
    };

    initializeUserMonitor();

    // Cleanup
    return () => {
      if (wallet.address) {
        wsManager.removeService(`userMonitor:${wallet.address}`);
      }
    };
  }, [wallet.connected, wallet.address, wallet.provider]);

  // Initialize system monitor (optional, can be enabled based on user role)
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_SYSTEM_MONITOR === 'true') {
      const service = wsManager.getSystemMonitorService();
      setSystemMonitorService(service);
      service.connect();

      return () => {
        wsManager.removeService('systemMonitor');
      };
    }
  }, []);

  const value = {
    wsManager,
    userMonitorService,
    systemMonitorService,
    isInitialized,
    getNodeService: (referenceCode, options) => wsManager.getNodeService(referenceCode, options)
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  
  return context;
}
