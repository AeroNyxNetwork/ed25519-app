/**
 * Node Monitor Hook for AeroNyx Platform
 * 
 * File Path: src/hooks/useNodeMonitor.js
 * 
 * Reusable node monitoring hook that encapsulates WebSocket logic
 * 
 * @version 1.0.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import { signMessage } from '../lib/utils/walletSignature';
import { wsManager, ConnectionStatus } from '../services/websocket';

/**
 * Node monitoring hook
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoConnect - Automatically connect when wallet is available
 * @param {boolean} options.autoMonitor - Automatically start monitoring after authentication
 * @param {Function} options.onNodesUpdate - Callback when nodes are updated
 * @param {Function} options.onStatusChange - Callback when connection status changes
 * @param {Function} options.onError - Callback when errors occur
 * @returns {Object} Monitoring state and control methods
 */
export function useNodeMonitor(options = {}) {
  const { 
    autoConnect = true,
    autoMonitor = true,
    onNodesUpdate,
    onStatusChange,
    onError
  } = options;

  const { wallet } = useWallet();
  const [status, setStatus] = useState(ConnectionStatus.DISCONNECTED);
  const [nodes, setNodes] = useState([]);
  const [stats, setStats] = useState({
    totalNodes: 0,
    activeNodes: 0,
    offlineNodes: 0,
    pendingNodes: 0,
    totalEarnings: 0,
    networkContribution: '0%',
    resourceUtilization: 0
  });
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const serviceRef = useRef(null);
  const mountedRef = useRef(true);

  /**
   * Calculates statistics from nodes list
   * @param {Array} nodesList - Array of node objects
   * @returns {Object} Calculated statistics
   */
  const calculateStats = useCallback((nodesList) => {
    const activeNodes = nodesList.filter(n => n.status === 'active');
    const offlineNodes = nodesList.filter(n => n.status === 'offline');
    const pendingNodes = nodesList.filter(n => 
      n.status === 'pending' || n.status === 'registered'
    );

    const totalEarnings = nodesList.reduce((sum, n) => 
      sum + parseFloat(n.earnings || 0), 0
    );

    const resourceUtilization = activeNodes.length > 0
      ? Math.round(
          activeNodes.reduce((sum, node) => {
            const cpu = node.performance?.cpu || 0;
            const memory = node.performance?.memory || 0;
            return sum + ((cpu + memory) / 2);
          }, 0) / activeNodes.length
        )
      : 0;

    return {
      totalNodes: nodesList.length,
      activeNodes: activeNodes.length,
      offlineNodes: offlineNodes.length,
      pendingNodes: pendingNodes.length,
      totalEarnings,
      networkContribution: `${(activeNodes.length * 0.0015).toFixed(4)}%`,
      resourceUtilization
    };
  }, []);

  /**
   * Connects to WebSocket and authenticates user
   */
  const connect = useCallback(async () => {
    if (!wallet.connected || !wallet.address) {
      setError('Wallet not connected');
      return;
    }

    try {
      setError(null);
      
      // Get or create service instance
      const service = wsManager.getUserMonitorService(wallet.address);
      serviceRef.current = service;

      // Set up event listeners
      service.on('statusChange', (newStatus) => {
        if (mountedRef.current) {
          setStatus(newStatus);
          onStatusChange?.(newStatus);
        }
      });

      service.on('nodesUpdated', (nodesList) => {
        if (mountedRef.current) {
          setNodes(nodesList);
          setStats(calculateStats(nodesList));
          setLastUpdate(new Date());
          onNodesUpdate?.(nodesList);
        }
      });

      service.on('error', (err) => {
        if (mountedRef.current) {
          setError(err.message || 'Connection error');
          onError?.(err);
        }
      });

      // Connect to WebSocket
      await service.connect();

      // Sign message for authentication
      const message = await getSignatureMessage();
      const signature = await signMessage(
        wallet.provider,
        message,
        wallet.address
      );

      await service.authenticate(signature, message, 'metamask');

      // Auto-start monitoring if enabled
      if (autoMonitor) {
        service.startMonitoring();
      }

    } catch (err) {
      console.error('[useNodeMonitor] Error:', err);
      setError(err.message || 'Failed to connect');
      onError?.(err);
    }
  }, [wallet, calculateStats, autoMonitor, onNodesUpdate, onStatusChange, onError]);

  /**
   * Disconnects from WebSocket and resets state
   */
  const disconnect = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
      serviceRef.current = null;
    }
    setStatus(ConnectionStatus.DISCONNECTED);
    setNodes([]);
    setStats({
      totalNodes: 0,
      activeNodes: 0,
      offlineNodes: 0,
      pendingNodes: 0,
      totalEarnings: 0,
      networkContribution: '0%',
      resourceUtilization: 0
    });
  }, []);

  /**
   * Starts node monitoring if authenticated
   */
  const startMonitoring = useCallback(() => {
    if (serviceRef.current && status === ConnectionStatus.AUTHENTICATED) {
      serviceRef.current.startMonitoring();
    }
  }, [status]);

  /**
   * Stops node monitoring
   */
  const stopMonitoring = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.stopMonitoring();
    }
  }, []);

  /**
   * Refreshes connection by disconnecting and reconnecting
   */
  const refresh = useCallback(() => {
    disconnect();
    setTimeout(() => {
      connect();
    }, 100);
  }, [connect, disconnect]);

  // Auto-connect effect
  useEffect(() => {
    mountedRef.current = true;

    if (autoConnect && wallet.connected) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [wallet.connected, autoConnect]); // Exclude connect and disconnect to avoid infinite loops

  /**
   * Gets signature message for authentication
   * @returns {Promise<string>} Signature message
   */
  async function getSignatureMessage() {
    // This should call an API to get the message in production
    // For now, return a fixed format
    return `AeroNyx Authentication
Wallet: ${wallet.address.toLowerCase()}
Nonce: ${Math.random().toString(36).substr(2, 9)}
Timestamp: ${Math.floor(Date.now() / 1000)}`;
  }

  return {
    // State
    status,
    nodes,
    stats,
    error,
    lastUpdate,
    
    // Connection information
    isConnected: status !== ConnectionStatus.DISCONNECTED,
    isAuthenticated: [
      ConnectionStatus.AUTHENTICATED,
      ConnectionStatus.MONITORING
    ].includes(status),
    isMonitoring: status === ConnectionStatus.MONITORING,
    
    // Control methods
    connect,
    disconnect,
    refresh,
    startMonitoring,
    stopMonitoring
  };
}

// Export ConnectionStatus for external use
export { ConnectionStatus };
