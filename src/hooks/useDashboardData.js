/**
 * Unified Dashboard Hook for AeroNyx Platform
 * 
 * File Path: src/hooks/useDashboardData.js
 * 
 * Production-grade React hook providing comprehensive dashboard data management
 * with intelligent switching between REST API and WebSocket data sources.
 * Fixed initialization and import issues.
 * 
 * @version 2.0.2
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import { useDashboardWebSocket } from './useWebSocket';
import { useSignature } from './useSignature';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { cacheService, CacheNamespace } from '../lib/services/CacheService';
import { mergeWebSocketUpdate } from '../lib/utils/websocketDataTransformer';

/**
 * Data source types
 * @enum {string}
 */
export const DataSource = {
  WEBSOCKET: 'websocket',
  REST: 'rest',
  HYBRID: 'hybrid',
  CACHE: 'cache'
};

/**
 * Unified Dashboard Hook
 * 
 * @param {Object} config - Hook configuration
 * @returns {Object} Dashboard state and controls
 */
export function useDashboard(config = {}) {
  const {
    preferWebSocket = true,
    enableRESTFallback = true,
    hybridMode = true,
    restInterval = 60000,
    enableCache = true,
    onDataUpdate,
    onError
  } = config;
  
  const { wallet } = useWallet();
  const { signature, message, isLoading: signatureLoading } = useSignature('dashboard');
  
  // ==================== STATE MANAGEMENT ====================
  
  const [state, setState] = useState({
    dashboardData: null,
    nodesOverview: null,
    isLoading: true,
    isRefreshing: false,
    error: null,
    dataSource: null,
    lastUpdate: null,
    lastRESTUpdate: null,
    lastWSUpdate: null
  });
  
  const [stats, setStats] = useState({
    totalNodes: 0,
    activeNodes: 0,
    offlineNodes: 0,
    pendingNodes: 0,
    totalEarnings: 0,
    networkContribution: '0%',
    resourceUtilization: 0
  });
  
  // ==================== REFS ====================
  
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef(null);
  const requestInProgressRef = useRef(false);
  
  // ==================== WEBSOCKET SETUP ====================
  
  const wsCredentials = useMemo(() => {
    if (!wallet.connected || !signature || !message) return null;
    
    return {
      walletAddress: wallet.address,
      signature,
      message,
      walletType: 'okx'
    };
  }, [wallet.connected, wallet.address, signature, message]);
  
  const {
    connected: wsConnected,
    authenticated: wsAuthenticated,
    monitoring: wsMonitoring,
    data: wsData,
    error: wsError,
    connect: wsConnect,
    disconnect: wsDisconnect,
    startMonitoring: wsStartMonitoring,
    stopMonitoring: wsStopMonitoring,
    connectionHealth: wsConnectionHealth
  } = useDashboardWebSocket(wsCredentials, {
    autoConnect: preferWebSocket && !signatureLoading,
    autoMonitor: true,
    enableCache,
    onData: handleWebSocketData,
    onError: handleWebSocketError
  });
  
  // ==================== DATA PROCESSING ====================
  
  /**
   * Calculate network contribution
   */
  const calculateNetworkContribution = useCallback((nodes) => {
    if (!Array.isArray(nodes)) return '0%';
    
    const activeNodes = nodes.filter(n => 
      n.status === 'active' || n.status === 'online'
    ).length;
    
    return `${(activeNodes * 0.0015).toFixed(4)}%`;
  }, []);
  
  /**
   * Calculate resource utilization
   */
  const calculateResourceUtilization = useCallback((nodes) => {
    if (!Array.isArray(nodes)) return 0;
    
    const activeNodes = nodes.filter(n => 
      n.status === 'active' || n.status === 'online'
    );
    
    if (activeNodes.length === 0) return 0;
    
    const totalUtil = activeNodes.reduce((sum, node) => {
      const cpu = node.performance?.cpu_usage || 0;
      const memory = node.performance?.memory_usage || 0;
      return sum + ((cpu + memory) / 2);
    }, 0);
    
    return Math.round(totalUtil / activeNodes.length);
  }, []);
  
  /**
   * Process dashboard data from any source
   */
  const processDashboardData = useCallback((data, source) => {
    if (!data) return null;
    
    // Extract nodes array from different possible structures
    let nodesArray = [];
    
    // Handle different API response structures
    if (data.nodes) {
      if (Array.isArray(data.nodes)) {
        // Direct array
        nodesArray = data.nodes;
      } else if (typeof data.nodes === 'object') {
        // Grouped by status (REST API structure)
        nodesArray = [
          ...(data.nodes.online || []),
          ...(data.nodes.active || []),
          ...(data.nodes.offline || [])
        ];
      }
    }
    
    const summary = data.summary || {};
    
    const processedStats = {
      totalNodes: summary.total_nodes || nodesArray.length,
      activeNodes: summary.online_nodes || 0,
      offlineNodes: summary.offline_nodes || 0,
      pendingNodes: Math.max(0, 
        (summary.total_nodes || 0) - 
        (summary.online_nodes || 0) - 
        (summary.offline_nodes || 0)
      ),
      totalEarnings: parseFloat(summary.total_earnings || 0),
      networkContribution: calculateNetworkContribution(nodesArray),
      resourceUtilization: calculateResourceUtilization(nodesArray)
    };
    
    return {
      dashboardData: {
        stats: processedStats,
        nodes: nodesArray.slice(0, 4), // Dashboard preview
        timestamp: new Date().toISOString(),
        source
      },
      stats: processedStats
    };
  }, [calculateNetworkContribution, calculateResourceUtilization]);
  
  // ==================== WEBSOCKET HANDLERS ====================
  
  /**
   * Handle WebSocket data update
   */
  function handleWebSocketData(data) {
    if (!mountedRef.current) return;
    
    // Ensure data has correct structure
    const normalizedData = {
      summary: data.summary || {},
      nodes: data.nodes || { online: [], active: [], offline: [] },
      wallet_info: data.wallet_info,
      performance_stats: data.performance_stats
    };
    
    const processed = processDashboardData(normalizedData, DataSource.WEBSOCKET);
    
    setState(prev => ({
      ...prev,
      dashboardData: processed?.dashboardData,
      nodesOverview: normalizedData,
      dataSource: DataSource.WEBSOCKET,
      lastUpdate: new Date(),
      lastWSUpdate: new Date(),
      error: null,
      isLoading: false
    }));
    
    if (processed) {
      setStats(processed.stats);
    }
    
    // Cache the data
    if (enableCache) {
      const cacheKey = cacheService.generateKey('dashboard', wallet.address);
      cacheService.set(CacheNamespace.API, cacheKey, normalizedData, 5 * 60 * 1000);
    }
    
    onDataUpdate?.(processed?.dashboardData, DataSource.WEBSOCKET);
  }
  
  /**
   * Handle WebSocket error
   */
  function handleWebSocketError(error) {
    if (!mountedRef.current) return;
    
    console.error('[useDashboard] WebSocket error:', error);
    
    // Fallback to REST if enabled
    if (enableRESTFallback && !state.dashboardData) {
      fetchRESTData();
    }
    
    onError?.(error, DataSource.WEBSOCKET);
  }
  
  // ==================== REST API FUNCTIONS ====================
  
  /**
   * Fetch data from REST API
   */
  const fetchRESTData = useCallback(async (forceRefresh = false) => {
    if (!wallet.connected || !signature || !message) return;
    if (requestInProgressRef.current) return;
    
    // Check cache first
    if (enableCache && !forceRefresh) {
      const cacheKey = cacheService.generateKey('dashboard', wallet.address);
      const cachedData = cacheService.get(CacheNamespace.API, cacheKey);
      
      if (cachedData) {
        handleRESTData(cachedData, true);
        return;
      }
    }
    
    requestInProgressRef.current = true;
    
    setState(prev => ({
      ...prev,
      isRefreshing: !prev.dashboardData,
      isLoading: !prev.dashboardData
    }));
    
    try {
      const response = await nodeRegistrationService.getUserNodesOverview(
        wallet.address,
        signature,
        message,
        'okx'
      );
      
      if (response.success && response.data) {
        handleRESTData(response.data, false);
      } else {
        throw new Error(response.message || 'Failed to fetch dashboard data');
      }
    } catch (error) {
      handleRESTError(error);
    } finally {
      requestInProgressRef.current = false;
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          isRefreshing: false,
          isLoading: false
        }));
      }
    }
  }, [wallet.connected, wallet.address, signature, message, enableCache]);
  
  /**
   * Handle REST data response
   */
  const handleRESTData = useCallback((data, fromCache) => {
    if (!mountedRef.current) return;
    
    // Ensure data has correct structure
    const normalizedData = {
      summary: data.summary || {},
      nodes: data.nodes || { online: [], active: [], offline: [] },
      wallet_info: data.wallet_info,
      performance_stats: data.performance_stats
    };
    
    const processed = processDashboardData(normalizedData, fromCache ? DataSource.CACHE : DataSource.REST);
    
    setState(prev => ({
      ...prev,
      dashboardData: processed?.dashboardData,
      nodesOverview: normalizedData,
      dataSource: fromCache ? DataSource.CACHE : DataSource.REST,
      lastUpdate: new Date(),
      lastRESTUpdate: fromCache ? prev.lastRESTUpdate : new Date(),
      error: null
    }));
    
    if (processed) {
      setStats(processed.stats);
    }
    
    // Cache the data
    if (enableCache && !fromCache) {
      const cacheKey = cacheService.generateKey('dashboard', wallet.address);
      cacheService.set(CacheNamespace.API, cacheKey, normalizedData, 5 * 60 * 1000);
    }
    
    onDataUpdate?.(processed?.dashboardData, fromCache ? DataSource.CACHE : DataSource.REST);
  }, [enableCache, processDashboardData, onDataUpdate, wallet.address]);
  
  /**
   * Handle REST error
   */
  const handleRESTError = useCallback((error) => {
    if (!mountedRef.current) return;
    
    console.error('[useDashboard] REST error:', error);
    
    // Special case: user has no nodes
    if (error.message?.includes('No nodes found')) {
      const emptyData = {
        summary: { total_nodes: 0, online_nodes: 0, offline_nodes: 0, total_earnings: 0 },
        nodes: { online: [], active: [], offline: [] }
      };
      
      handleRESTData(emptyData, false);
      return;
    }
    
    setState(prev => ({
      ...prev,
      error,
      dataSource: DataSource.REST
    }));
    
    onError?.(error, DataSource.REST);
  }, [handleRESTData, onError]);
  
  // ==================== ACTIONS ====================
  
  /**
   * Refresh dashboard data
   */
  const refresh = useCallback(async (force = true) => {
    if (preferWebSocket && wsMonitoring && !force) {
      // WebSocket is active, no need to refresh
      return;
    }
    
    await fetchRESTData(force);
  }, [preferWebSocket, wsMonitoring, fetchRESTData]);
  
  /**
   * Switch data source
   */
  const switchDataSource = useCallback((source) => {
    switch (source) {
      case DataSource.WEBSOCKET:
        if (!wsConnected) {
          wsConnect();
        } else if (!wsMonitoring) {
          wsStartMonitoring();
        }
        break;
        
      case DataSource.REST:
        if (wsMonitoring) {
          wsStopMonitoring();
        }
        refresh(true);
        break;
        
      case DataSource.HYBRID:
        if (!wsConnected) {
          wsConnect();
        }
        refresh(false);
        break;
    }
  }, [wsConnected, wsMonitoring, wsConnect, wsStartMonitoring, wsStopMonitoring, refresh]);
  
  // ==================== LIFECYCLE MANAGEMENT ====================
  
  /**
   * Initial data load
   */
  useEffect(() => {
    if (!wallet.connected || signatureLoading) return;
    
    // Load initial data
    if (!preferWebSocket || !wsConnected) {
      fetchRESTData();
    }
  }, [wallet.connected, signatureLoading, preferWebSocket, wsConnected, fetchRESTData]);
  
  /**
   * Setup REST refresh interval
   */
  useEffect(() => {
    if (!hybridMode || wsMonitoring) return;
    
    refreshTimerRef.current = setInterval(() => {
      if (!wsMonitoring) {
        fetchRESTData();
      }
    }, restInterval);
    
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [hybridMode, wsMonitoring, restInterval, fetchRESTData]);
  
  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);
  
  // ==================== COMPUTED VALUES ====================
  
  /**
   * Connection health indicator
   */
  const connectionHealth = useMemo(() => {
    if (wsMonitoring) {
      return wsConnectionHealth;
    }
    
    if (state.error) {
      return { status: 'error', label: 'Connection Error', color: 'red' };
    }
    
    if (state.dataSource === DataSource.REST) {
      return { status: 'good', label: 'REST API', color: 'blue' };
    }
    
    if (state.dataSource === DataSource.CACHE) {
      return { status: 'fair', label: 'Cached Data', color: 'yellow' };
    }
    
    return { status: 'disconnected', label: 'No Data', color: 'gray' };
  }, [wsMonitoring, wsConnectionHealth, state.error, state.dataSource]);
  
  /**
   * Loading states
   */
  const loadingStates = useMemo(() => ({
    isInitialLoading: state.isLoading && !state.dashboardData,
    isRefreshing: state.isRefreshing,
    hasData: !!state.dashboardData,
    hasError: !!state.error
  }), [state]);
  
  // ==================== PUBLIC API ====================
  
  return {
    // Data
    dashboardData: state.dashboardData,
    nodesOverview: state.nodesOverview,
    stats,
    
    // States
    ...loadingStates,
    error: state.error,
    
    // Connection info
    dataSource: state.dataSource,
    connectionHealth,
    isRealtime: wsMonitoring,
    
    // Timestamps
    lastUpdate: state.lastUpdate,
    lastRESTUpdate: state.lastRESTUpdate,
    lastWSUpdate: state.lastWSUpdate,
    
    // Actions
    refresh,
    switchDataSource,
    
    // WebSocket controls
    connectWebSocket: wsConnect,
    disconnectWebSocket: wsDisconnect,
    startRealtimeMonitoring: wsStartMonitoring,
    stopRealtimeMonitoring: wsStopMonitoring
  };
}

// Default export
export default useDashboard;
