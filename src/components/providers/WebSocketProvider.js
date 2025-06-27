/**
 * WebSocket Provider Component for AeroNyx Platform
 * 
 * File Path: src/components/providers/WebSocketProvider.js
 * 
 * Production-ready WebSocket context provider following Google coding standards.
 * Provides real-time data updates for the entire application.
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useWallet } from '../wallet/WalletProvider';
import { useUserMonitorWebSocket } from '../../hooks/useWebSocket';
import { useSignature } from '../../hooks/useSignature';

/**
 * WebSocket context type definition
 * @typedef {Object} WebSocketContextValue
 * @property {Array} nodes - Current nodes data
 * @property {string} connectionStatus - Connection status
 * @property {boolean} isConnected - Whether WebSocket is connected
 * @property {boolean} isAuthenticated - Whether WebSocket is authenticated
 * @property {boolean} isMonitoring - Whether monitoring is active
 * @property {Function} refresh - Manual refresh function
 * @property {Date} lastUpdate - Last update timestamp
 */

const WebSocketContext = createContext(null);

/**
 * WebSocket Provider Component
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @returns {React.ReactElement} Provider component
 */
export function WebSocketProvider({ children }) {
  const { wallet } = useWallet();
  const { signature, message, isLoading: signatureLoading } = useSignature('websocket');
  
  // State
  const [nodes, setNodes] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // Refs
  const mountedRef = useRef(true);
  
  // WebSocket credentials
  const wsCredentials = React.useMemo(() => {
    if (!wallet.connected || !signature || !message) return null;
    
    return {
      walletAddress: wallet.address,
      signature,
      message,
      walletType: 'okx'
    };
  }, [wallet.connected, wallet.address, signature, message]);
  
  // WebSocket hook
  const {
    connected,
    authenticated,
    monitoring,
    connect,
    disconnect
  } = useUserMonitorWebSocket(wsCredentials, {
    autoConnect: true,
    autoMonitor: true,
    onData: handleWebSocketData,
    onError: handleWebSocketError
  });
  
  /**
   * Handle WebSocket data updates
   */
  function handleWebSocketData(data) {
    if (!mountedRef.current) return;
    
    if (data && Array.isArray(data.nodes)) {
      setNodes(data.nodes);
      setLastUpdate(new Date());
    }
  }
  
  /**
   * Handle WebSocket errors
   */
  function handleWebSocketError(error) {
    console.error('[WebSocketProvider] Error:', error);
  }
  
  /**
   * Manual refresh function
   */
  const refresh = useCallback(() => {
    if (connected && !monitoring) {
      // Restart monitoring if connected but not monitoring
      connect();
    }
  }, [connected, monitoring, connect]);
  
  // Connection status
  const connectionStatus = React.useMemo(() => {
    if (monitoring) return 'monitoring';
    if (authenticated) return 'authenticated';
    if (connected) return 'connected';
    if (signatureLoading) return 'connecting';
    return 'disconnected';
  }, [connected, authenticated, monitoring, signatureLoading]);
  
  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
    };
  }, []);
  
  // Context value
  const contextValue = React.useMemo(() => ({
    nodes,
    connectionStatus,
    isConnected: connected,
    isAuthenticated: authenticated,
    isMonitoring: monitoring,
    refresh,
    lastUpdate
  }), [nodes, connectionStatus, connected, authenticated, monitoring, refresh, lastUpdate]);
  
  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

/**
 * Hook to use WebSocket context
 * 
 * @returns {WebSocketContextValue} WebSocket context value
 */
export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  
  return context;
}

// Default export
export default WebSocketProvider;
