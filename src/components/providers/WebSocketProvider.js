/**
 * WebSocket Provider Component
 * 
 * File Path: src/components/providers/WebSocketProvider.js
 * 
 * Provides WebSocket context and services to the application
 * with automatic connection management using the unified cache service.
 * 
 * @version 2.0.1
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

'use client';

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
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [nodes, setNodes] = useState([]);

  useEffect(() => {
    if (!wallet.connected || !wallet.address) {
      // Cleanup when wallet disconnected
      if (userMonitorService) {
        wsManager.removeService(`userMonitor:${wallet.address}`);
        setUserMonitorService(null);
      }
      setIsInitialized(false);
      setConnectionStatus('disconnected');
      setNodes([]);
      return;
    }

    // Initialize user monitor when wallet connected
    const initializeUserMonitor = async () => {
      try {
        // Check cache for existing signature - Fixed to use static method
        const cacheKey = CacheService.generateKey('signature', wallet.address, 'websocket');
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

        // Setup event handlers
        service.on('connectionStatusChanged', (status) => {
          setConnectionStatus(status);
        });

        service.on('nodes_updated', (data) => {
          setNodes(data.nodes || []);
        });

        service.on('auth_success', () => {
          setConnectionStatus('authenticated');
          service.startMonitoring();
        });

        service.on('monitoring_started', () => {
          setConnectionStatus('monitoring');
        });

        // Connect and start monitoring
        await service.connect();
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize user monitor:', error);
        setConnectionStatus('error');
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
    connectionStatus,
    nodes,
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

// Import CacheService class for static method
import CacheService from '../../lib/services/CacheService';
