/**
 * WebSocket Provider Component for AeroNyx Platform
 * 
 * File Path: src/components/providers/WebSocketProvider.js
 * 
 * Production implementation with correct authentication flow.
 * 
 * @version 4.0.0
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
  
  const serviceRef = useRef(null);
  const mountedRef = useRef(true);
  
  const initializeWebSocket = useCallback(async () => {
    if (!wallet.connected || !wallet.address) return;
    
    try {
      console.log('[WebSocketProvider] Initializing for:', wallet.address);
      
      // Get service
      const service = wsManager.getUserMonitorService({
        walletAddress: wallet.address
      });
      
      serviceRef.current = service;
      
      // Setup handlers
      service.on('connected', () => {
        console.log('[WebSocketProvider] Connected');
        setConnectionStatus('connected');
      });
      
      service.on('signature_message', async (data) => {
        console.log('[WebSocketProvider] Got signature message');
        
        try {
          // Sign message
          const signature = await wallet.provider.request({
            method: 'personal_sign',
            params: [data.message, wallet.address.toLowerCase()]
          });
          
          // Send auth
          await service.authenticateWithSignature({
            wallet_address: wallet.address,
            signature: signature,
            message: data.message,
            wallet_type: 'okx'
          });
        } catch (error) {
          console.error('[WebSocketProvider] Auth error:', error);
          setConnectionStatus('error');
        }
      });
      
      service.on('auth_success', (data) => {
        console.log('[WebSocketProvider] Authenticated');
        setConnectionStatus('authenticated');
      });
      
      service.on('auth_failed', () => {
        console.error('[WebSocketProvider] Auth failed');
        setConnectionStatus('error');
      });
      
      service.on('monitoring_started', () => {
        console.log('[WebSocketProvider] Monitoring active');
        setConnectionStatus('monitoring');
      });
      
      service.on('nodes_updated', (data) => {
        console.log('[WebSocketProvider] Nodes updated:', data.nodes?.length || 0);
        if (mountedRef.current && data.nodes) {
          setNodes(data.nodes);
          setLastUpdate(new Date());
        }
      });
      
      service.on('error', (error) => {
        console.error('[WebSocketProvider] Error:', error);
      });
      
      service.on('disconnected', () => {
        console.log('[WebSocketProvider] Disconnected');
        setConnectionStatus('disconnected');
      });
      
      // Connect
      await service.connect();
      
    } catch (error) {
      console.error('[WebSocketProvider] Init error:', error);
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
  }, [wallet.address]);
  
  const refresh = useCallback(() => {
    disconnect();
    setTimeout(() => initializeWebSocket(), 100);
  }, [disconnect, initializeWebSocket]);
  
  // Initialize on wallet connect
  useEffect(() => {
    if (wallet.connected) {
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
  
  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  
  const value = React.useMemo(() => ({
    nodes,
    connectionStatus,
    isConnected: connectionStatus !== 'disconnected',
    isAuthenticated: ['authenticated', 'monitoring'].includes(connectionStatus),
    isMonitoring: connectionStatus === 'monitoring',
    refresh,
    lastUpdate
  }), [nodes, connectionStatus, refresh, lastUpdate]);
  
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

export default WebSocketProvider;
