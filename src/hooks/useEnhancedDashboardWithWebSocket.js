// src/hooks/useEnhancedDashboardWithWebSocket.js
/**
 * Enhanced Dashboard Hook with WebSocket Integration
 * Combines REST API and WebSocket for optimal user experience
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import useWebSocketDashboard from './useWebSocketDashboard';
import useDashboardData from './useDashboardData';

const DATA_SOURCE_PRIORITY = {
  WEBSOCKET_PREFERRED: 'websocket_preferred',
  REST_FALLBACK: 'rest_fallback',
  HYBRID: 'hybrid'
};

export default function useEnhancedDashboardWithWebSocket(options = {}) {
  const { wallet } = useWallet();
  const {
    preferWebSocket = true,
    enableRESTFallback = true,
    hybridMode = true,
    autoRefreshREST = false,
    onDataUpdate,
    onError
  } = options;

  // State management
  const [dataSource, setDataSource] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mergedData, setMergedData] = useState(null);

  // WebSocket hook
  const {
    isConnected: wsConnected,
    isAuthenticated: wsAuthenticated,
    isMonitoring: wsMonitoring,
    dashboardData: wsData,
    nodes: wsNodes,
    nodesByStatus: wsNodesByStatus,
    summary: wsSummary,
    connectionHealth,
    lastUpdate: wsLastUpdate,
    error: wsError,
    connect: wsConnect,
    disconnect: wsDisconnect,
    startMonitoring,
    stopMonitoring,
    connectionMetrics
  } = useWebSocketDashboard({
    autoConnect: preferWebSocket,
    autoMonitor: true,
    enableReconnect: true,
    onDataUpdate: handleWebSocketUpdate,
    onError: handleWebSocketError
  });

  // REST API hook
  const {
    dashboardData: restData,
    nodesOverview: restNodesOverview,
    isInitialLoading: restLoading,
    isRefreshing: restRefreshing,
    error: restError,
    refreshData: refreshREST,
    lastRefresh: restLastUpdate
  } = useDashboardData(wallet, {
    autoRefresh: autoRefreshREST || !preferWebSocket,
    refreshInterval: 60000, // 1 minute when not using WebSocket
    enableCache: true,
    onDataUpdate: handleRESTUpdate,
    onError: handleRESTError
  });

  /**
   * Handle WebSocket data update
   */
  function handleWebSocketUpdate(data) {
    console.log('[EnhancedDashboard] WebSocket data update received');
    setDataSource(DATA_SOURCE_PRIORITY.WEBSOCKET_PREFERRED);
    setMergedData(data.dashboardData);
    setIsLoading(false);
    setError(null);
    
    onDataUpdate?.(data.dashboardData, 'websocket');
  }

  /**
   * Handle WebSocket error
   */
  function handleWebSocketError(error) {
    console.error('[EnhancedDashboard] WebSocket error:', error);
    
    if (enableRESTFallback && !restData) {
      console.log('[EnhancedDashboard] Falling back to REST API');
      refreshREST(true);
      setDataSource(DATA_SOURCE_PRIORITY.REST_FALLBACK);
    }
    
    setError(error);
    onError?.(error, 'websocket');
  }

  /**
   * Handle REST API data update
   */
  function handleRESTUpdate(data) {
    console.log('[EnhancedDashboard] REST data update received');
    
    // Only use REST data if WebSocket is not providing data
    if (!wsConnected || !wsMonitoring || dataSource === DATA_SOURCE_PRIORITY.REST_FALLBACK) {
      setDataSource(DATA_SOURCE_PRIORITY.REST_FALLBACK);
      setMergedData(data);
      setIsLoading(false);
      setError(null);
      
      onDataUpdate?.(data, 'rest');
    }
  }

  /**
   * Handle REST API error
   */
  function handleRESTError(error) {
    console.error('[EnhancedDashboard] REST error:', error);
    
    // Only set error if WebSocket is also not working
    if (!wsConnected) {
      setError(error);
      onError?.(error, 'rest');
    }
  }

  /**
   * Get current data source information
   */
  const dataSourceInfo = useMemo(() => {
    if (wsMonitoring && wsData) {
      return {
        primary: 'websocket',
        status: 'realtime',
        lastUpdate: wsLastUpdate,
        health: connectionHealth
      };
    } else if (restData) {
      return {
        primary: 'rest',
        status: 'periodic',
        lastUpdate: restLastUpdate,
        health: { status: 'good', label: 'REST API', color: 'blue' }
      };
    } else {
      return {
        primary: 'none',
        status: 'disconnected',
        lastUpdate: null,
        health: { status: 'error', label: 'No Data', color: 'red' }
      };
    }
  }, [wsMonitoring, wsData, restData, wsLastUpdate, restLastUpdate, connectionHealth]);

  /**
   * Force refresh from all sources
   */
  const forceRefresh = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Refresh REST data
      const restPromise = refreshREST(true);
      
      // Restart WebSocket if needed
      let wsPromise = Promise.resolve();
      if (preferWebSocket && !wsMonitoring) {
        if (wsConnected && wsAuthenticated) {
          wsPromise = startMonitoring();
        } else if (!wsConnected) {
          wsConnect();
        }
      }
      
      await Promise.allSettled([restPromise, wsPromise]);
      
    } catch (error) {
      console.error('[EnhancedDashboard] Force refresh failed:', error);
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, [refreshREST, preferWebSocket, wsMonitoring, wsConnected, wsAuthenticated, startMonitoring, wsConnect]);

  /**
   * Switch data source
   */
  const switchDataSource = useCallback((source) => {
    switch (source) {
      case 'websocket':
        if (!wsConnected) {
          wsConnect();
        } else if (wsAuthenticated && !wsMonitoring) {
          startMonitoring();
        }
        break;
        
      case 'rest':
        if (wsMonitoring) {
          stopMonitoring();
        }
        refreshREST(true);
        break;
        
      case 'hybrid':
        // Enable both
        if (!wsConnected) wsConnect();
        refreshREST(false);
        break;
    }
  }, [wsConnected, wsAuthenticated, wsMonitoring, wsConnect, startMonitoring, stopMonitoring, refreshREST]);

  /**
   * Get comprehensive statistics
   */
  const comprehensiveStats = useMemo(() => {
    if (!mergedData) return null;

    const baseStats = mergedData.stats || {};
    
    return {
      // Basic stats
      ...baseStats,
      
      // Data source info
      dataSource: dataSourceInfo.primary,
      dataStatus: dataSourceInfo.status,
      lastUpdate: dataSourceInfo.lastUpdate,
      
      // Connection metrics (only for WebSocket)
      ...(dataSourceInfo.primary === 'websocket' && {
        realtimeMetrics: {
          latency: connectionMetrics.latency,
          messagesReceived: connectionMetrics.messagesReceived,
          uptime: connectionMetrics.uptime,
          reconnectAttempts: connectionMetrics.reconnectAttempts
        }
      })
    };
  }, [mergedData, dataSourceInfo, connectionMetrics]);

  /**
   * Initialize data fetching
   */
  useEffect(() => {
    if (!wallet?.connected) {
      setIsLoading(false);
      setMergedData(null);
      setError(new Error('Wallet not connected'));
      return;
    }

    setIsLoading(true);
    setError(null);

    // Start with preferred data source
    if (preferWebSocket) {
      // WebSocket will auto-connect via its hook
      console.log('[EnhancedDashboard] Starting with WebSocket preference');
    } else {
      // Start with REST
      console.log('[EnhancedDashboard] Starting with REST API');
      refreshREST(false);
    }
  }, [wallet?.connected, preferWebSocket]);

  /**
   * Handle WebSocket connection changes
   */
  useEffect(() => {
    // If WebSocket connects and we're in REST fallback mode, switch back
    if (wsMonitoring && dataSource === DATA_SOURCE_PRIORITY.REST_FALLBACK && preferWebSocket) {
      console.log('[EnhancedDashboard] WebSocket reconnected, switching from REST fallback');
      setDataSource(DATA_SOURCE_PRIORITY.WEBSOCKET_PREFERRED);
    }
  }, [wsMonitoring, dataSource, preferWebSocket]);

  return {
    // Data
    dashboardData: mergedData,
    nodesOverview: wsMonitoring ? {
      summary: wsSummary,
      nodes: wsNodesByStatus,
      realtime: true
    } : restNodesOverview,
    
    // States
    isLoading: isLoading || (restLoading && !wsData),
    isRefreshing: restRefreshing,
    error: error || wsError || restError,
    
    // Data source information
    dataSource: dataSourceInfo.primary,
    dataSourceInfo,
    connectionHealth: dataSourceInfo.health,
    
    // WebSocket specific
    wsConnected,
    wsAuthenticated,
    wsMonitoring,
    wsNodes,
    wsSummary,
    wsNodesByStatus,
    
    // REST specific
    restData,
    restLastUpdate,
    
    // Statistics
    stats: comprehensiveStats,
    
    // Actions
    refresh: forceRefresh,
    switchDataSource,
    
    // WebSocket controls
    connectWebSocket: wsConnect,
    disconnectWebSocket: wsDisconnect,
    startRealtimeMonitoring: startMonitoring,
    stopRealtimeMonitoring: stopMonitoring,
    
    // REST controls
    refreshREST,
    
    // Utilities
    isRealtime: wsMonitoring,
    hasRealTimeData: Boolean(wsData),
    hasRESTData: Boolean(restData)
  };
}
