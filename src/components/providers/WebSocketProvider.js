/**
 * WebSocket Provider Component
 * 
 * File Path: src/components/providers/WebSocketProvider.js
 * 
 * Provides WebSocket context and services to the application
 * with automatic connection management using the unified cache service.
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useWallet } from '../wallet/WalletProvider';
import { wsManager } from '../../lib/websocket/WebSocketManager';
import { signMessage, formatMessageForSigning } from '../../lib/utils/walletSignature';
import nodeRegistrationService from '../../lib/api/nodeRegistration';
import { cacheService, CacheNamespace } from '../../lib/services/CacheService';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { wallet } = useWallet();
  const [userMonitorService, setUserMonitorService] = useState(null);
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
        // Check cache for existing signature
        const cacheKey = cacheService.generateKey('signature', wallet.address, 'websocket');
        let signatureData = cacheService.get(CacheNamespace.SIGNATURE, cacheKey);
        
        if (!signatureData) {
          // Generate new signature
          const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
          
          if (!messageResponse.success) {
            throw new Error(messageResponse.message || 'Failed to generate signature message');
          }

          const message = messageResponse.data.message;
          const formattedMessage = formatMessageForSigning(message);
          const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);
          
          signatureData = { signature, message };
          
          // Cache the signature
          cacheService.set(CacheNamespace.SIGNATURE, cacheKey, signatureData, 10 * 60 * 1000);
        }

        // Create wallet credentials
        const walletCredentials = {
          walletAddress: wallet.address,
          signature: signatureData.signature,
          message: signatureData.message,
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

  const value = {
    wsManager,
    userMonitorService,
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
