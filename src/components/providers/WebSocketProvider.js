/**
 * WebSocket Provider Component
 * 
 * File Path: src/components/providers/WebSocketProvider.js
 * 
 * Updated to use new authentication flow
 * 
 * @version 5.0.0
 * @author AeroNyx Development Team
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
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
  const [sessionToken, setSessionToken] = useState(null);
  
  // Use the shared signature hook
  const { signature, message, error: signatureError } = useSignature('websocket');
  
  // Refs to prevent multiple initialization attempts
  const initializingRef = useRef(false);
  const serviceKeyRef = useRef(null);

  // Handle signature message request
  const requestSignatureMessage = useCallback(async (walletAddress) => {
    if (!userMonitorService) return null;
    
    try {
      await userMonitorService.requestSignatureMessage(walletAddress);
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Signature message timeout'));
        }, 10000);
        
        userMonitorService.once('signature_message_received', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });
    } catch (error) {
      console.error('Failed to request signature message:', error);
      throw error;
    }
  }, [userMonitorService]);

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
      setSessionToken(null);
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

        service.on('authentication_success', (data) => {
          setConnectionStatus('authenticated');
          if (data.session_token) {
            setSessionToken(data.session_token);
            // Store session token in localStorage for reconnection
            localStorage.setItem('aeronyx_session_token', data.session_token);
          }
          // Auto-start monitoring after successful auth
          service.startMonitoring().catch(err => {
            console.warn('Failed to start monitoring:', err);
          });
        });

        service.on('auth_failed', (data) => {
          console.error('WebSocket auth failed:', data);
          setConnectionStatus('auth_failed');
          // Clear stored session token
          localStorage.removeItem('aeronyx_session_token');
        });

        service.on('monitoring_started', () => {
          setConnectionStatus('monitoring');
        });

        service.on('error', (error) => {
          console.error('WebSocket error:', error);
        });

        // Connect with error handling
        try {
          await service.connect();
          
          // Try to use stored session token first
          const storedToken = localStorage.getItem('aeronyx_session_token');
          if (storedToken) {
            try {
              await service.authenticateWithToken(storedToken);
            } catch (error) {
              console.warn('Session token invalid, using signature auth');
              localStorage.removeItem('aeronyx_session_token');
              // Fall back to signature auth
              await service.authenticate(walletCredentials);
            }
          } else {
            // Use signature authentication
            await service.authenticate(walletCredentials);
          }
        } catch (error) {
          console.warn('WebSocket connection failed, will use REST API fallback:', error);
        }
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize user monitor:', error);
        setConnectionStatus('error');
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
    sessionToken,
    requestSignatureMessage,
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
