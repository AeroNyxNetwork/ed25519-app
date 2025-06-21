/**
 * WebSocket Provider Component
 * 
 * File Path: src/components/providers/WebSocketProvider.js
 * 
 * Final fixed version with proper variable scoping and error handling
 * 
 * @version 4.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useWallet } from '../wallet/WalletProvider';
import { wsManager } from '../../lib/websocket/WebSocketManager';
import { useSignature } from '../../hooks/useSignature';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { wallet } = useWallet();
  const [userMonitorService, setUserMonitorService] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [nodes, setNodes] = useState([]);
  
  // Use the shared signature hook
  const { signature, message, error: signatureError } = useSignature('websocket');
  
  // Refs to prevent multiple initialization attempts
  const initializingRef = useRef(false);
  const serviceKeyRef = useRef(null);

  useEffect(() => {
    if (!wallet.connected || !wallet.address) {
      // Cleanup when wallet disconnected
      if (serviceKeyRef.current) {
        wsManager.removeService(serviceKeyRef.current);
        serviceKeyRef.current = null;
      }
      setUserMonitorService(null);
      setIsInitialized(false);
      setConnectionStatus('disconnected');
      setNodes([]);
      return;
    }

    // Wait for signature
    if (!signature || !message) {
      if (signatureError) {
        console.error('Signature error:', signatureError);
        setConnectionStatus('error');
      }
      return;
    }

    // Prevent multiple initialization attempts
    if (initializingRef.current || isInitialized) {
      return;
    }

    // Initialize user monitor when wallet connected and signature ready
    const initializeUserMonitor = async () => {
      initializingRef.current = true;
      
      try {
        // Create wallet credentials
        const walletCredentials = {
          walletAddress: wallet.address,
          signature: signature,
          message: message,
          walletType: 'okx'
        };

        // Get or create user monitor service
        const service = wsManager.getUserMonitorService(walletCredentials);
        const serviceKey = `userMonitor:${wallet.address}`;
        serviceKeyRef.current = serviceKey;
        
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
          // Start monitoring after successful auth
          service.startMonitoring().catch(err => {
            console.warn('Failed to start monitoring:', err);
          });
        });

        service.on('auth_failed', (data) => {
          console.error('WebSocket auth failed:', data);
          setConnectionStatus('auth_failed');
        });

        service.on('monitoring_started', () => {
          setConnectionStatus('monitoring');
        });

        service.on('error', (error) => {
          console.error('WebSocket error:', error);
          // Don't fail initialization on WebSocket errors
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
      if (serviceKeyRef.current) {
        wsManager.removeService(serviceKeyRef.current);
        serviceKeyRef.current = null;
      }
    };
  }, [wallet.connected, wallet.address, signature, message, signatureError, isInitialized]);

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
