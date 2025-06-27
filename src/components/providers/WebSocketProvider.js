/**
 * WebSocket Provider Component for AeroNyx Platform
 * 
 * File Path: src/components/providers/WebSocketProvider.js
 * 
 * Production implementation matching backend authentication flow.
 * 
 * @version 5.0.0
 * @author AeroNyx Development Team
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useWallet } from '../wallet/WalletProvider';
import { wsManager } from '../../lib/websocket/WebSocketManager';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { wallet } = useWallet();
  
  const [nodes, setNodes] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  
  const serviceRef = useRef(null);
  const mountedRef = useRef(true);
  
  const initializeWebSocket = useCallback(async () => {
    if (!wallet.connected || !wallet.address) {
      console.log('[WebSocketProvider] Wallet not connected');
      return;
    }
    
    try {
      console.log('[WebSocketProvider] Initializing WebSocket for:', wallet.address);
      
      // Get or create service
      const service = wsManager.getUserMonitorService({
        walletAddress: wallet.address
      });
      
      serviceRef.current = service;
      
      // Setup event handlers
      service.on('connected', () => {
        console.log('[WebSocketProvider] Connected to server');
        setConnectionStatus('connected');
      });
      
      // Handle signature message
      service.on('signature_message', async (data) => {
        console.log('[WebSocketProvider] Received signature message');
        
        try {
          // Sign the message exactly as received
          const signature = await wallet.provider.request({
            method: 'personal_sign',
            params: [data.message, wallet.address.toLowerCase()]
          });
          
          console.log('[WebSocketProvider] Message signed');
          
          // Send authentication
          await service.authenticateWithSignature({
            wallet_address: wallet.address,
            signature: signature,
            message: data.message,
            wallet_type: 'okx'
          });
          
        } catch (error) {
          console.error('[WebSocketProvider] Signing/Auth error:', error);
          setConnectionStatus('error');
        }
      });
      
      // Handle auth success
      service.on('auth_success', (data) => {
        console.log('[WebSocketProvider] Authentication successful');
        setConnectionStatus('authenticated');
        
        if (data.session_token) {
          setSessionToken(data.session_token);
          // Store in localStorage for reconnection
          localStorage.setItem('aeronyx_session_token', data.session_token);
        }
        
        // Set initial nodes from auth response
        if (data.nodes) {
          const initialNodes = data.nodes.map(node => ({
            id: node.id,
            reference_code: node.code,
            name: node.name,
            status: 'unknown',
            type: 'general'
          }));
          setNodes(initialNodes);
        }
      });
      
      // Handle monitor started
      service.on('monitor_started', () => {
        console.log('[WebSocketProvider] Monitoring started');
        setConnectionStatus('monitoring');
      });
      
      // Handle nodes update
      service.on('nodes_updated', (data) => {
        console.log('[WebSocketProvider] Nodes updated:', data.nodes?.length || 0);
        if (mountedRef.current && data.nodes) {
          setNodes(data.nodes);
          setLastUpdate(new Date());
        }
      });
      
      // Handle errors
      service.on('error_received', (data) => {
        console.error('[WebSocketProvider] Error:', data.message);
        
        // Handle session errors
        if (data.message?.includes('session') || data.message?.includes('authenticated')) {
          localStorage.removeItem('aeronyx_session_token');
          setSessionToken(null);
          setConnectionStatus('disconnected');
        }
      });
      
      // Handle disconnection
      service.on('disconnected', () => {
        console.log('[WebSocketProvider] Disconnected');
        setConnectionStatus('disconnected');
      });
      
      // Connect
      await service.connect();
      
      // Try to reconnect with existing session
      const storedToken = localStorage.getItem('aeronyx_session_token');
      if (storedToken) {
        console.log('[WebSocketProvider] Attempting session reconnection');
        const reconnected = await service.reconnectWithSession(storedToken);
        if (reconnected) {
          setSessionToken(storedToken);
        } else {
          localStorage.removeItem('aeronyx_session_token');
        }
      }
      
    } catch (error) {
      console.error('[WebSocketProvider] Initialization error:', error);
      setConnectionStatus('error');
    }
  }, [wallet.connected, wallet.address, wallet.provider]);
  
  const disconnect = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
      wsManager.removeService(`userMonitor:${wallet.address}`);
      serviceRef.current = null;
    }
    setNodes([]);
    setConnectionStatus('disconnected');
    setSessionToken(null);
  }, [wallet.address]);
  
  const refresh = useCallback(() => {
    console.log('[WebSocketProvider] Refreshing connection');
    disconnect();
    setTimeout(() => initializeWebSocket(), 100);
  }, [disconnect, initializeWebSocket]);
  
  // Initialize on wallet connect
  useEffect(() => {
    if (wallet.connected && wallet.address) {
      initializeWebSocket();
    } else {
      disconnect();
    }
    
    return () => {
      if (serviceRef.current) {
        disconnect();
      }
    };
  }, [wallet.connected, wallet.address]);
  
  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
    };
  }, []);
  
  const contextValue = React.useMemo(() => ({
    nodes,
    connectionStatus,
    isConnected: connectionStatus !== 'disconnected',
    isAuthenticated: ['authenticated', 'monitoring'].includes(connectionStatus),
    isMonitoring: connectionStatus === 'monitoring',
    sessionToken,
    refresh,
    lastUpdate
  }), [nodes, connectionStatus, sessionToken, refresh, lastUpdate]);
  
  return (
    <WebSocketContext.Provider value={contextValue}>
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

export default WebSocketProvider;
