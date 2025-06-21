/**
 * WebSocket Provider Component
 * 
 * File Path: src/components/providers/WebSocketProvider.js
 * 
 * Fixed version with better error handling and signature optimization
 * 
 * @version 3.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useWallet } from '../wallet/WalletProvider';
import { wsManager } from '../../lib/websocket/WebSocketManager';
import { signMessage } from '../../lib/utils/walletSignature';
import nodeRegistrationService from '../../lib/api/nodeRegistration';
import { cacheService, CacheNamespace } from '../../lib/services/CacheService';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { wallet } = useWallet();
  const [userMonitorService, setUserMonitorService] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [nodes, setNodes] = useState([]);
  
  // Refs to prevent multiple initialization attempts
  const initializingRef = useRef(false);
  const signatureRef = useRef(null);

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
      signatureRef.current = null;
      return;
    }

    // Prevent multiple initialization attempts
    if (initializingRef.current || isInitialized) {
      return;
    }

    // Initialize user monitor when wallet connected
    const initializeUserMonitor = async () => {
      initializingRef.current = true;
      
      try {
        // Check if we already have a valid signature
        let signatureData = signatureRef.current;
        
        if (!signatureData) {
          // Check cache for existing signature
          const cacheKey = cacheService.generateKey('signature', wallet.address, 'websocket');
          signatureData = cacheService.get(CacheNamespace.SIGNATURE, cacheKey);
        }
        
        if (!signatureData) {
          try {
            // Generate new signature
            const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
            
            if (!messageResponse.success) {
              throw new Error(messageResponse.message || 'Failed to generate signature message');
            }

            const message = messageResponse.data.message;
            const signature = await signMessage(wallet.provider, message, wallet.address);
            
            signatureData = { signature, message };
            signatureRef.current = signatureData;
            
            // Cache the signature
            cacheService.set(CacheNamespace.SIGNATURE, cacheKey, signatureData, 10 * 60 * 1000);
          } catch (error) {
            console.error('Failed to generate signature:', error);
            setConnectionStatus('error');
            return;
          }
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

        service.on('error', (error) => {
          console.error('WebSocket error:', error);
          // Don't fail initialization on WebSocket errors
          // as we have REST API fallback
        });

        // Connect with error handling
        try {
          await service.connect();
        } catch (error) {
          console.warn('WebSocket connection failed, will use REST API fallback:', error);
          // Don't throw - allow app to continue with REST API
        }
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize user monitor:', error);
        setConnectionStatus('error');
        // Still mark as initialized to prevent retry loop
        setIsInitialized(true);
      } finally {
        initializingRef.current = false;
      }
    };

    initializeUserMonitor();

    // Cleanup
    return () => {
      if (wallet.address) {
        wsManager.removeService(`userMonitor:${wallet.address}`);
      }
    };
  }, [wallet.connected, wallet.address, wallet.provider, isInitialized]);

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
