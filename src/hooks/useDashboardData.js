/**
 * Unified Dashboard Hook for AeroNyx Platform
 * 
 * File Path: src/hooks/useDashboardData.js
 * 
 * Fixed version - only fixing data processing issue
 * 
 * @version 4.0.1
 * @author AeroNyx Development Team
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
    restInterval = 300000, // 5 minutes for REST fallback
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
  const hasInitialDataRef = useRef(false);
  
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
   * Process dashboard data from any source - FIXED VERSION
   */
  const processDashboardData = useCallback((data, source) => {
    if (!data) return null;
    
    console.log('[useDashboard] Processing data from:', source, data);
    console.log('[useDashboard] Data structure check:', {
      hasNodes: !!data.nodes,
      nodesType: typeof data.nodes,
      isArray: Array.isArray(data.nodes),
      keys: data.nodes ? Object.keys(data.nodes) : []
    });
    
    // Handle WebSocket data format
    if (source === DataSource.WEBSOCKET && data.nodes && Array.isArray(data.nodes)) {
      const nodes = data.nodes;
      
      const processedStats = {
        totalNodes: nodes.length,
        activeNodes: nodes.filter(n => n.status === 'active').length,
        offlineNodes: nodes.filter(n => n.status === 'offline').length,
        pendingNodes: nodes.filter(n => n.status === 'pending' || n.status === 'registered').length,
        totalEarnings: nodes.reduce((sum, n) => sum + parseFloat(n.earnings || 0), 0),
        networkContribution: `${(Math.max(0, nodes.filter(n => n.status === 'active').length) * 0.0015).toFixed(4)}%`,
        resourceUtilization: calculateResourceUtilization(nodes)
      };
      
      return {
        dashboardData: {
          stats: processedStats,
          nodes: nodes,
          timestamp: new Date().toISOString(),
          source
        },
        stats: processedStats
      };
    }
    
    // Handle REST API data format - THIS IS THE KEY FIX
    if (data.nodes && typeof data.nodes === 'object' && !Array.isArray(data.nodes)) {
      // Combine all node arrays from different statuses
      const nodesArray = [];
      
      // Add nodes from each status category
      if (data.nodes.online && Array.isArray(data.nodes.online)) {
        nodesArray.push(...data.nodes.online);
      }
      if (data.nodes.active && Array.isArray(data.nodes.active)) {
        nodesArray.push(...data.nodes.active);
      }
      if (data.nodes.offline && Array.isArray(data.nodes.offline)) {
        nodesArray.push(...data.nodes.offline);
      }
      
      console.log('[useDashboard] Combined nodes:', {
        online: data.nodes.online?.length || 0,
        active: data.nodes.active?.length || 0,
        offline: data.nodes.offline?.length || 0,
        total: nodesArray.length
      });
      
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
          nodes: nodesArray, // Return the combined array
          timestamp: new Date().toISOString(),
          source
        },
        stats: processedStats
      };
    }
    
    // Handle array format (backwards compatibility)
    if (Array.isArray(data)) {
      const nodes = data;
      const processedStats = {
        totalNodes: nodes.length,
        activeNodes: nodes.filter(n => n.status === 'active').length,
        offlineNodes: nodes.filter(n => n.status === 'offline').length,
        pendingNodes: nodes.filter(n => n.status === 'pending' || n.status === 'registered').length,
        totalEarnings: nodes.reduce((sum, n) => sum + parseFloat(n.earnings || 0), 0),
        networkContribution: `${(Math.max(0, nodes.filter(n => n.status === 'active').length) * 0.0015).toFixed(4)}%`,
        resourceUtilization: calculateResourceUtilization(nodes)
      };
      
      return {
        dashboardData: {
          stats: processedStats,
          nodes: nodes,
          timestamp: new Date().toISOString(),
          source
        },
        stats: processedStats
      };
    }
    
    return null;
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
      const cpu = node.performance?.cpu || node.performance?.cpu_usage || 0;
      const memory = node.performance?.memory || node.performance?.memory_usage || 0;
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
      hasInitialDataRef.current = true;
      
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
    
    // Only fallback to REST if we don't have any data yet
    if (enableRESTFallback && !hasInitialDataRef.current) {
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
    if (!forceRefresh && (now - lastFetchRef.current) < 30000) { // 30 seconds minimum
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
        console.log('[fetchRESTData] API response structure:', {
          hasData: !!response.data,
          dataKeys: Object.keys(response.data),
          hasNodes: !!response.data.nodes
        });
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
    
    if (processed) {
      setState(prev => ({
        ...prev,
        dashboardData: processed.dashboardData,
        nodesOverview: data,
        dataSource: fromCache ? DataSource.CACHE : DataSource.REST,
        lastUpdate: new Date(),
        error: null
      }));
      
      setStats(processed.stats);
      hasInitialDataRef.current = true;
      
      // Cache the data
      if (enableCache && !fromCache && wallet.address) {
        const cacheKey = cacheService.generateKey('dashboard', wallet.address);
        cacheService.set(CacheNamespace.API, cacheKey, data, 5 * 60 * 1000);
      }
      
      onDataUpdate?.(processed.dashboardData, fromCache ? DataSource.CACHE : DataSource.REST);
    }
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
    // If WebSocket is active and monitoring, don't fetch REST
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
    
    // If WebSocket is not preferred or not connected, load REST data
    if (signature && message && (!preferWebSocket || !wsConnected)) {
      fetchRESTData();
    }
  }, [wallet.connected, signature, message, signatureLoading, signatureError, preferWebSocket, wsConnected]);
  
  /**
   * Setup REST refresh interval (only when WebSocket not active)
   */
  useEffect(() => {
    // Only use REST polling if WebSocket is not monitoring
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
      hasInitialDataRef.current = false;
      
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
    // Prefer WebSocket health if monitoring
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
    isWebSocketActive: wsMonitoring,
    
    // Timestamps
    lastUpdate: state.lastUpdate,
    
    // Actions
    refresh
  };
}

// Default export
export default useDashboard;
