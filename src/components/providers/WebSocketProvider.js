/**
 * WebSocket Provider Component
 * 
 * File Path: src/components/providers/WebSocketProvider.js
 * 
 * Fixed to handle authentication flow correctly
 * 
 * @version 6.1.0
 * @author AeroNyx Development Team
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useWallet } from '../wallet/WalletProvider';
import { wsManager } from '../../lib/websocket/WebSocketManager';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { wallet } = useWallet();
  const [userMonitorService, setUserMonitorService] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [nodes, setNodes] = useState([]);
  const [sessionToken, setSessionToken] = useState(null);
  const [signatureMessage, setSignatureMessage] = useState(null);
  
  // Refs to prevent multiple initialization attempts
  const initializingRef = useRef(false);
  const serviceKeyRef = useRef(null);
  const signatureHandledRef = useRef(false);

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
      setSignatureMessage(null);
      signatureHandledRef.current = false;
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
        // Create user monitor service (without credentials for now)
        const service = wsManager.getUserMonitorService({
          walletAddress: wallet.address
        });
        const serviceKey = `userMonitor:${wallet.address}`;
        serviceKeyRef.current = serviceKey;
        
        setUserMonitorService(service);

        // Setup event handlers
        service.on('connectionStatusChanged', (status) => {
          setConnectionStatus(status);
        });

        service.on('connected', () => {
          console.log('WebSocket connected successfully');
          setConnectionStatus('connected');
        });

        service.on('signature_message', (data) => {
          // Prevent handling the same signature message multiple times
          if (signatureHandledRef.current) {
            console.log('Signature message already handled, ignoring duplicate');
            return;
          }
          
          console.log('Received signature message from server');
          signatureHandledRef.current = true;
          setSignatureMessage(data);
          
          // Sign and authenticate
          handleSignAndAuth(service, data, wallet);
        });

        service.on('nodes_updated', (data) => {
          setNodes(data.nodes || []);
        });

        service.on('auth_success', (data) => {
          console.log('Authentication successful');
          setConnectionStatus('authenticated');
          if (data.session_token) {
            setSessionToken(data.session_token);
            // Store session token in localStorage for reconnection
            localStorage.setItem('aeronyx_session_token', data.session_token);
          }
          // Initialize nodes from auth response
          if (data.nodes) {
            setNodes(data.nodes);
          }
          // Auto-start monitoring after successful auth
          service.startMonitoring().catch(err => {
            console.warn('Failed to start monitoring:', err);
          });
        });

        service.on('auth_failed', (data) => {
          console.error('WebSocket auth failed:', data);
          setConnectionStatus('auth_failed');
          signatureHandledRef.current = false; // Reset so we can try again
          // Clear stored session token
          localStorage.removeItem('aeronyx_session_token');
        });

        service.on('monitoring_started', () => {
          setConnectionStatus('monitoring');
        });

        service.on('error', (data) => {
          console.error('WebSocket error:', data);
        });

        // Connect to WebSocket
        await service.connect();
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize user monitor:', error);
        setConnectionStatus('error');
        setIsInitialized(true);
      } finally {
        initializingRef.current = false;
      }
    };

    // Handle signing and authentication
    const handleSignAndAuth = async (service, messageData, wallet) => {
      try {
        // Sign the message with wallet
        const signature = await wallet.provider.request({
          method: 'personal_sign',
          params: [messageData.message, wallet.address.toLowerCase()]
        });

        // Send authentication with signature
        await service.authenticateWithSignature({
          wallet_address: wallet.address.toLowerCase(),
          signature: signature,
          message: messageData.message,
          wallet_type: 'okx'
        });
      } catch (error) {
        console.error('Failed to sign and authenticate:', error);
        setConnectionStatus('auth_failed');
        signatureHandledRef.current = false; // Reset so we can try again
      }
    };

    initializeUserMonitor();

    // Cleanup
    return () => {
      if (serviceKeyRef.current) {
        wsManager.removeService(serviceKeyRef.current);
        serviceKeyRef.current = null;
      }
      signatureHandledRef.current = false;
    };
  }, [wallet.connected, wallet.address, isInitialized]);

  const value = {
    wsManager,
    userMonitorService,
    isInitialized,
    connectionStatus,
    nodes,
    sessionToken,
    signatureMessage,
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
