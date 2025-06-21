/**
 * Unified Dashboard Hook for AeroNyx Platform
 * 
 * File Path: src/hooks/useDashboardData.js
 * 
 * Fixed version with better error handling and reduced signature requests
 * 
 * @version 3.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import { useDashboardWebSocket } from './useWebSocket';
import { useSignature } from './useSignature';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { cacheService, CacheNamespace } from '../lib/services/CacheService';

/**
 * Data source types
 * @enum {string}
 */
export const DataSource = {
  WEBSOCKET: 'websocket',
  REST: 'rest',
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
    restInterval = 60000,
    enableCache = true,
    onDataUpdate,
    onError
  } = config;
  
  const { wallet } = useWallet();
  const { signature, message, isLoading: signatureLoading, error: signatureError } = useSignature('dashboard');
  
  // ==================== STATE MANAGEMENT ====================
  
  const [state, setState] = useState({
    dashboardData: null,
    nodesOverview: null,
    isLoading: true,
    isRefreshing: false,
    error: null,
    dataSource: null,
    lastUpdate: null
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
  const lastFetchRef = useRef(0);
  
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
    connectionHealth: wsConnectionHealth
  } = useDashboardWebSocket(wsCredentials, {
    autoConnect: preferWebSocket && !signatureLoading && !signatureError,
    autoMonitor: true,
    enableCache,
    onData: handleWebSocketData,
    onError: handleWebSocketError
  });
  
  // ==================== DATA PROCESSING ====================
  
  /**
   * Process dashboard data from any source
   */
  const processDashboardData = useCallback((data, source) => {
    if (!data) return null;
    
    // Extract nodes array from different possible structures
    let nodesArray = [];
    
    if (data.nodes) {
      if (Array.isArray(data.nodes)) {
        nodesArray = data.nodes;
      } else if (typeof data.nodes === 'object') {
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
      networkContribution: `${(Math.max(0, summary.online_nodes || 0) * 0.0015).toFixed(4)}%`,
      resourceUtilization: calculateResourceUtilization(nodesArray)
    };
    
    return {
      dashboardData: {
        stats: processedStats,
        nodes: nodesArray.slice(0, 4),
        timestamp: new Date().toISOString(),
        source
      },
      stats: processedStats
    };
  }, []);
  
  /**
   * Calculate resource utilization
   */
  const calculateResourceUtilization = useCallback((nodes) => {
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;
    
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
  
  // ==================== WEBSOCKET HANDLERS ====================
  
  /**
   * Handle WebSocket data update
   */
  function handleWebSocketData(data) {
    if (!mountedRef.current) return;
    
    const processed = processDashboardData(data, DataSource.WEBSOCKET);
    
    if (processed) {
      setState(prev => ({
        ...prev,
        dashboardData: processed.dashboardData,
        nodesOverview: data,
        dataSource: DataSource.WEBSOCKET,
        lastUpdate: new Date(),
        error: null,
        isLoading: false
      }));
      
      setStats(processed.stats);
      
      // Cache the data
      if (enableCache && wallet.address) {
        const cacheKey = cacheService.generateKey('dashboard', wallet.address);
        cacheService.set(CacheNamespace.API, cacheKey, data, 5 * 60 * 1000);
      }
      
      onDataUpdate?.(processed.dashboardData, DataSource.WEBSOCKET);
    }
  }
  
  /**
   * Handle WebSocket error
   */
  function handleWebSocketError(error) {
    if (!mountedRef.current) return;
    
    console.warn('[useDashboard] WebSocket error:', error);
    
    // Fallback to REST if enabled
    if (enableRESTFallback && !state.dashboardData) {
      fetchRESTData();
    }
    
    onError?.(error, DataSource.WEBSOCKET);
  }
  
  // ==================== REST API FUNCTIONS ====================
  
  /**
   * Fetch data from REST API with rate limiting
   */
  const fetchRESTData = useCallback(async (forceRefresh = false) => {
    if (!wallet.connected || !signature || !message) return;
    if (requestInProgressRef.current) return;
    
    // Rate limiting - prevent too frequent requests
    const now = Date.now();
    if (!forceRefresh && (now - lastFetchRef.current) < 5000) {
      return;
    }
    
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
    lastFetchRef.current = now;
    
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
      } else if (response.message?.includes('No nodes found')) {
        // Handle empty state
        handleRESTData({
          summary: { total_nodes: 0, online_nodes: 0, offline_nodes: 0, total_earnings: 0 },
          nodes: { online: [], active: [], offline: [] }
        }, false);
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
    
    const processed = processDashboardData(data, fromCache ? DataSource.CACHE : DataSource.REST);
    
    setState(prev => ({
      ...prev,
      dashboardData: processed?.dashboardData,
      nodesOverview: data,
      dataSource: fromCache ? DataSource.CACHE : DataSource.REST,
      lastUpdate: new Date(),
      error: null
    }));
    
    if (processed) {
      setStats(processed.stats);
    }
    
    // Cache the data
    if (enableCache && !fromCache && wallet.address) {
      const cacheKey = cacheService.generateKey('dashboard', wallet.address);
      cacheService.set(CacheNamespace.API, cacheKey, data, 5 * 60 * 1000);
    }
    
    onDataUpdate?.(processed?.dashboardData, fromCache ? DataSource.CACHE : DataSource.REST);
  }, [enableCache, processDashboardData, onDataUpdate, wallet.address]);
  
  /**
   * Handle REST error
   */
  const handleRESTError = useCallback((error) => {
    if (!mountedRef.current) return;
    
    console.error('[useDashboard] REST error:', error);
    
    setState(prev => ({
      ...prev,
      error: error.message || 'Failed to load dashboard data',
      dataSource: DataSource.REST
    }));
    
    onError?.(error, DataSource.REST);
  }, [onError]);
  
  // ==================== ACTIONS ====================
  
  /**
   * Refresh dashboard data
   */
  const refresh = useCallback(async (force = true) => {
    if (preferWebSocket && wsMonitoring && !force) {
      return;
    }
    
    await fetchRESTData(force);
  }, [preferWebSocket, wsMonitoring, fetchRESTData]);
  
  // ==================== LIFECYCLE MANAGEMENT ====================
  
  /**
   * Initial data load
   */
  useEffect(() => {
    if (!wallet.connected || signatureLoading) return;
    
    // If signature failed, show error
    if (signatureError) {
      setState(prev => ({
        ...prev,
        error: 'Failed to authenticate. Please try reconnecting your wallet.',
        isLoading: false
      }));
      return;
    }
    
    // Load initial data if we have signature
    if (signature && message) {
      fetchRESTData();
    }
  }, [wallet.connected, signature, message, signatureLoading, signatureError]);
  
  /**
   * Setup REST refresh interval
   */
  useEffect(() => {
    if (!preferWebSocket || !wsMonitoring) {
      refreshTimerRef.current = setInterval(() => {
        if (!wsMonitoring) {
          fetchRESTData();
        }
      }, restInterval);
    }
    
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [preferWebSocket, wsMonitoring, restInterval, fetchRESTData]);
  
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
  
  // ==================== PUBLIC API ====================
  
  return {
    // Data
    dashboardData: state.dashboardData,
    nodesOverview: state.nodesOverview,
    stats,
    
    // States
    isInitialLoading: state.isLoading && !state.dashboardData,
    isRefreshing: state.isRefreshing,
    error: state.error,
    
    // Connection info
    dataSource: state.dataSource,
    connectionHealth,
    
    // Timestamps
    lastUpdate: state.lastUpdate,
    
    // Actions
    refresh
  };
}

// Default export
export default useDashboard;
