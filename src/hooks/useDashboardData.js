/**
 * Dashboard Data Hook for AeroNyx Platform
 * 
 * File Path: src/hooks/useDashboardData.js
 * 
 * Production-ready implementation following Google coding standards.
 * Provides unified data fetching with WebSocket priority and REST fallback.
 * 
 * @version 5.0.0
 * @author AeroNyx Development Team
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import { useWebSocketContext } from '../components/providers/WebSocketProvider';
import { useSignature } from './useSignature';
import nodeRegistrationService from '../lib/api/nodeRegistration';

/**
 * Data source enumeration
 * @enum {string}
 */
export const DataSource = {
  WEBSOCKET: 'websocket',
  REST: 'rest'
};

/**
 * Dashboard hook for unified data management
 * 
 * @param {Object} config - Configuration options
 * @param {boolean} config.preferWebSocket - Prefer WebSocket over REST (default: true)
 * @param {boolean} config.enableRESTFallback - Enable REST API fallback (default: true)
 * @returns {Object} Dashboard state and controls
 */
export function useDashboard(config = {}) {
  const {
    preferWebSocket = true,
    enableRESTFallback = true
  } = config;
  
  const { wallet } = useWallet();
  const { signature, message, isLoading: signatureLoading, error: signatureError } = useSignature('dashboard');
  const { nodes: wsNodes, connectionStatus, isMonitoring } = useWebSocketContext();
  
  // State management
  const [restData, setRestData] = useState(null);
  const [stats, setStats] = useState({
    totalNodes: 0,
    activeNodes: 0,
    offlineNodes: 0,
    pendingNodes: 0,
    totalEarnings: 0,
    networkContribution: '0%',
    resourceUtilization: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // Refs
  const mountedRef = useRef(true);
  const hasDataRef = useRef(false);
  
  // Determine current data source
  const dataSource = useMemo(() => {
    if (isMonitoring && wsNodes.length > 0) {
      return DataSource.WEBSOCKET;
    }
    return DataSource.REST;
  }, [isMonitoring, wsNodes.length]);
  
  // Use WebSocket nodes if available, otherwise REST data
  const nodes = useMemo(() => {
    if (preferWebSocket && wsNodes.length > 0) {
      return wsNodes;
    }
    return restData?.nodes || [];
  }, [preferWebSocket, wsNodes, restData]);
  
  /**
   * Calculate stats from nodes
   */
  const calculateStats = useCallback((nodeArray, summary = null) => {
    if (summary) {
      // Use summary from API if available
      return {
        totalNodes: summary.total_nodes || 0,
        activeNodes: summary.online_nodes || 0,
        offlineNodes: summary.offline_nodes || 0,
        pendingNodes: Math.max(0, 
          (summary.total_nodes || 0) - 
          (summary.online_nodes || 0) - 
          (summary.offline_nodes || 0)
        ),
        totalEarnings: parseFloat(summary.total_earnings || 0),
        networkContribution: `${((summary.online_nodes || 0) * 0.0015).toFixed(4)}%`,
        resourceUtilization: calculateResourceUtilization(nodeArray)
      };
    }
    
    // Calculate from nodes array
    const activeNodes = nodeArray.filter(n => n.status === 'active').length;
    const offlineNodes = nodeArray.filter(n => n.status === 'offline').length;
    const pendingNodes = nodeArray.filter(n => n.status === 'pending' || n.status === 'registered').length;
    
    return {
      totalNodes: nodeArray.length,
      activeNodes,
      offlineNodes,
      pendingNodes,
      totalEarnings: nodeArray.reduce((sum, n) => sum + parseFloat(n.earnings || 0), 0),
      networkContribution: `${(activeNodes * 0.0015).toFixed(4)}%`,
      resourceUtilization: calculateResourceUtilization(nodeArray)
    };
  }, []);
  
  /**
   * Calculate average resource utilization
   */
  const calculateResourceUtilization = useCallback((nodes) => {
    const activeNodes = nodes.filter(n => n.status === 'active');
    if (activeNodes.length === 0) return 0;
    
    const totalUtil = activeNodes.reduce((sum, node) => {
      const cpu = node.performance?.cpu || node.performance?.cpu_usage || 0;
      const memory = node.performance?.memory || node.performance?.memory_usage || 0;
      return sum + ((cpu + memory) / 2);
    }, 0);
    
    return Math.round(totalUtil / activeNodes.length);
  }, []);
  
  /**
   * Fetch data from REST API
   */
  const fetchRESTData = useCallback(async () => {
    if (!wallet.connected || !signature || !message) return;
    
    setIsLoading(true);
    
    try {
      const response = await nodeRegistrationService.getUserNodesOverview(
        wallet.address,
        signature,
        message,
        'okx'
      );
      
      if (!mountedRef.current) return;
      
      if (response.success && response.data) {
        // Combine all node arrays
        const allNodes = [
          ...(response.data.nodes?.online || []),
          ...(response.data.nodes?.active || []),
          ...(response.data.nodes?.offline || [])
        ];
        
        const processedData = {
          nodes: allNodes,
          summary: response.data.summary,
          timestamp: new Date().toISOString()
        };
        
        setRestData(processedData);
        setLastUpdate(new Date());
        setError(null);
        hasDataRef.current = true;
        
        // Update stats with summary data
        const newStats = calculateStats(allNodes, response.data.summary);
        setStats(newStats);
      } else {
        throw new Error(response.message || 'Failed to fetch dashboard data');
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [wallet.connected, wallet.address, signature, message, calculateStats]);
  
  /**
   * Refresh data
   */
  const refresh = useCallback(async () => {
    await fetchRESTData();
  }, [fetchRESTData]);
  
  // Update stats when nodes change
  useEffect(() => {
    if (nodes.length > 0) {
      const newStats = calculateStats(nodes, restData?.summary);
      setStats(newStats);
      
      if (dataSource === DataSource.WEBSOCKET) {
        setLastUpdate(new Date());
      }
    }
  }, [nodes, restData?.summary, calculateStats, dataSource]);
  
  // Initial data load
  useEffect(() => {
    if (!wallet.connected || signatureLoading) return;
    
    if (signatureError) {
      setError('Failed to authenticate. Please reconnect your wallet.');
      setIsLoading(false);
      return;
    }
    
    // Always fetch REST data initially
    if (signature && message) {
      fetchRESTData();
    }
  }, [wallet.connected, signature, message, signatureLoading, signatureError, fetchRESTData]);
  
  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      hasDataRef.current = false;
    };
  }, []);
  
  // Connection health
  const connectionHealth = useMemo(() => {
    if (connectionStatus === 'monitoring') {
      return { status: 'excellent', label: 'Live Monitoring', color: 'green' };
    }
    if (connectionStatus === 'authenticated') {
      return { status: 'good', label: 'Authenticated', color: 'blue' };
    }
    if (connectionStatus === 'connected') {
      return { status: 'fair', label: 'Connected', color: 'yellow' };
    }
    if (error) {
      return { status: 'error', label: 'Connection Error', color: 'red' };
    }
    return { status: 'disconnected', label: 'Disconnected', color: 'gray' };
  }, [connectionStatus, error]);
  
  // Dashboard data structure
  const dashboardData = useMemo(() => {
    if (!nodes.length) return null;
    
    return {
      nodes,
      stats,
      timestamp: lastUpdate?.toISOString() || new Date().toISOString(),
      source: dataSource
    };
  }, [nodes, stats, lastUpdate, dataSource]);
  
  return {
    // Data
    dashboardData,
    stats,
    
    // States
    isInitialLoading: isLoading && !hasDataRef.current,
    isRefreshing: isLoading && hasDataRef.current,
    error,
    
    // Connection info
    dataSource,
    connectionHealth,
    lastUpdate,
    
    // Actions
    refresh
  };
}

// Default export
export default useDashboard;
