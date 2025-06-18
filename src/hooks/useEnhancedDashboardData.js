/**
 * Enhanced Dashboard Data Hook with WebSocket Integration
 * 
 * File Path: src/hooks/useEnhancedDashboardData.js
 * 
 * Combines REST API and WebSocket real-time data for a complete
 * dashboard experience with automatic synchronization and fallback.
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import { useUserMonitorWebSocket } from './useWebSocketEnhanced';
import useDashboardData from './useDashboardData';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { signatureCacheService } from '../lib/services/SignatureCacheService';

/**
 * Configuration for enhanced dashboard behavior
 */
const ENHANCED_CONFIG = {
  // Data source priorities
  dataSource: {
    preferWebSocket: true,
    fallbackToREST: true,
    hybridMode: true  // Use REST for initial load, WebSocket for updates
  },
  
  // Sync intervals
  sync: {
    restInterval: 60000,        // 1 minute
    reconcileInterval: 30000,   // 30 seconds
    staleThreshold: 120000      // 2 minutes
  },
  
  // Performance
  performance: {
    debounceUpdates: 100,       // 100ms debounce
    maxUpdateFrequency: 1000,   // Max 1 update per second
    enableMetrics: true
  }
};

/**
 * Enhanced Dashboard Data Hook
 * Provides unified interface for dashboard data with WebSocket real-time updates
 * 
 * @param {Object} options - Configuration options
 * @returns {Object} Enhanced dashboard data and controls
 */
export default function useEnhancedDashboardData(options = {}) {
  const { wallet } = useWallet();
  const config = { ...ENHANCED_CONFIG, ...options };
  
  // ==================== STATE MANAGEMENT ====================
  
  const [state, setState] = useState({
    // Unified data state
    dashboardData: null,
    nodesOverview: null,
    
    // Loading states
    isLoading: true,
    isRefreshing: false,
    
    // Connection states
    wsConnected: false,
    wsMonitoring: false,
    dataSource: null, // 'rest' | 'websocket' | 'hybrid'
    
    // Error state
    error: null,
    
    // Metadata
    lastUpdate: null,
    lastRESTUpdate: null,
    lastWSUpdate: null,
    dataQuality: 'unknown' // 'realtime' | 'recent' | 'stale' | 'offline'
  });
  
  // Performance tracking
  const performanceRef = useRef({
    restCalls: 0,
    wsUpdates: 0,
    dataConflicts: 0,
    reconciliations: 0,
    lastUpdateTime: 0
  });
  
  // Refs for intervals and cleanup
  const syncIntervalRef = useRef(null);
  const reconcileIntervalRef = useRef(null);
  const updateDebounceRef = useRef(null);
  
  // ==================== HOOKS INTEGRATION ====================
  
  // REST API data hook
  const {
    dashboardData: restData,
    nodesOverview: restNodesOverview,
    isInitialLoading: restLoading,
    isRefreshing: restRefreshing,
    error: restError,
    refreshData: refreshREST,
    lastRefresh: lastRESTRefresh
  } = useDashboardData(wallet, {
    autoRefresh: !config.dataSource.preferWebSocket, // Disable if using WebSocket
    enableCache: true,
    onDataUpdate: (data) => handleRESTUpdate(data)
  });
  
  // WebSocket data hook
  const {
    connected: wsConnected,
    authenticated: wsAuthenticated,
    monitoring: wsMonitoring,
    nodes: wsNodes,
    nodesByStatus: wsNodesByStatus,
    summary: wsSummary,
    performanceStats: wsPerformanceStats,
    error: wsError,
    lastUpdate: wsLastUpdate,
    updateSource: wsUpdateSource,
    startMonitoring,
    stopMonitoring,
    syncWithREST,
    performance: wsPerformance
  } = useUserMonitorWebSocket(
    wallet.connected ? {
      walletAddress: wallet.address,
      signature: null, // Will be provided by signature cache
      message: null,
      walletType: 'okx'
    } : null,
    {
      autoConnect: config.dataSource.preferWebSocket,
      onNodesUpdated: (data) => handleWebSocketUpdate(data)
    }
  );
  
  // ==================== DATA PROCESSING ====================
  
  /**
   * Handle REST API data update
   */
  const handleRESTUpdate = useCallback((data) => {
    performanceRef.current.restCalls++;
    
    // In hybrid mode, use REST data as base
    if (config.dataSource.hybridMode && !wsMonitoring) {
      updateDashboardData(data, 'rest');
    }
    
    // Sync with WebSocket if connected
    if (wsConnected && syncWithREST) {
      syncWithREST(data);
    }
  }, [config.dataSource.hybridMode, wsMonitoring, wsConnected, syncWithREST]);
  
  /**
   * Handle WebSocket data update
   */
  const handleWebSocketUpdate = useCallback((data) => {
    performanceRef.current.wsUpdates++;
    
    // Debounce rapid updates
    if (updateDebounceRef.current) {
      clearTimeout(updateDebounceRef.current);
    }
    
    updateDebounceRef.current = setTimeout(() => {
      processWebSocketData(data);
    }, config.performance.debounceUpdates);
  }, [config.performance.debounceUpdates]);
  
  /**
   * Process WebSocket data and merge with existing state
   */
  const processWebSocketData = useCallback((wsData) => {
    // Transform WebSocket data to dashboard format
    const transformedData = transformWebSocketToDashboard(wsData);
    
    if (config.dataSource.preferWebSocket || wsMonitoring) {
      updateDashboardData(transformedData, 'websocket');
    }
  }, [config.dataSource.preferWebSocket, wsMonitoring]);
  
  /**
   * Transform WebSocket data to dashboard format
   */
  const transformWebSocketToDashboard = useCallback((wsData) => {
    // Calculate statistics from WebSocket data
    const allNodes = wsData.nodes || [];
    const nodesByStatus = wsData.nodesByStatus || { online: [], active: [], offline: [] };
    
    // Transform to dashboard format
    const dashboardData = {
      stats: {
        totalNodes: wsData.summary?.total_nodes || allNodes.length,
        activeNodes: wsData.summary?.online_nodes || nodesByStatus.online.length,
        offlineNodes: wsData.summary?.offline_nodes || nodesByStatus.offline.length,
        pendingNodes: Math.max(0, 
          (wsData.summary?.total_nodes || allNodes.length) - 
          (wsData.summary?.online_nodes || 0) - 
          (wsData.summary?.active_nodes || 0) - 
          (wsData.summary?.offline_nodes || 0)
        ),
        totalEarnings: parseFloat(wsData.summary?.total_earnings || 0),
        networkContribution: calculateNetworkContribution(allNodes),
        resourceUtilization: calculateResourceUtilization(allNodes)
      },
      nodes: allNodes.slice(0, 4), // Dashboard preview nodes
      timestamp: new Date().toISOString(),
      source: 'websocket'
    };
    
    // Build nodes overview structure
    const nodesOverview = {
      summary: wsData.summary || {},
      nodes: nodesByStatus,
      performance_stats: wsData.performanceStats,
      real_time_info: wsData.realTimeInfo
    };
    
    return { dashboardData, nodesOverview };
  }, []);
  
  /**
   * Update unified dashboard data
   */
  const updateDashboardData = useCallback((data, source) => {
    const now = Date.now();
    
    // Rate limiting
    if (now - performanceRef.current.lastUpdateTime < config.performance.maxUpdateFrequency) {
      return;
    }
    
    performanceRef.current.lastUpdateTime = now;
    
    setState(prev => {
      // Determine data quality
      const dataQuality = determineDataQuality(source, now);
      
      return {
        ...prev,
        dashboardData: data.dashboardData || data,
        nodesOverview: data.nodesOverview || prev.nodesOverview,
        isLoading: false,
        dataSource: source,
        lastUpdate: now,
        lastRESTUpdate: source === 'rest' ? now : prev.lastRESTUpdate,
        lastWSUpdate: source === 'websocket' ? now : prev.lastWSUpdate,
        dataQuality,
        error: null
      };
    });
  }, [config.performance.maxUpdateFrequency]);
  
  /**
   * Determine data quality based on source and age
   */
  const determineDataQuality = useCallback((source, timestamp) => {
    const age = Date.now() - timestamp;
    
    if (source === 'websocket' && wsMonitoring) {
      if (age < 5000) return 'realtime';      // < 5 seconds
      if (age < 30000) return 'recent';       // < 30 seconds
    }
    
    if (age < 60000) return 'recent';         // < 1 minute
    if (age < config.sync.staleThreshold) return 'stale';
    
    return 'offline';
  }, [wsMonitoring, config.sync.staleThreshold]);
  
  /**
   * Calculate network contribution (helper)
   */
  const calculateNetworkContribution = useCallback((nodes) => {
    const activeNodes = nodes.filter(n => 
      n.status === 'active' || n.status === 'online'
    ).length;
    
    return `${(activeNodes * 0.0015).toFixed(4)}%`;
  }, []);
  
  /**
   * Calculate resource utilization (helper)
   */
  const calculateResourceUtilization = useCallback((nodes) => {
    const activeNodes = nodes.filter(n => 
      n.status === 'active' || n.status === 'online'
    );
    
    if (activeNodes.length === 0) return 0;
    
    const totalUtil = activeNodes.reduce((sum, node) => {
      const cpu = node.performance?.cpu_usage || node.resources?.cpu?.usage || 0;
      const memory = node.performance?.memory_usage || node.resources?.memory?.usage || 0;
      return sum + ((cpu + memory) / 2);
    }, 0);
    
    return Math.round(totalUtil / activeNodes.length);
  }, []);
  
  // ==================== SYNCHRONIZATION ====================
  
  /**
   * Reconcile REST and WebSocket data
   */
  const reconcileData = useCallback(() => {
    if (!state.dashboardData) return;
    
    performanceRef.current.reconciliations++;
    
    const restAge = Date.now() - (state.lastRESTUpdate || 0);
    const wsAge = Date.now() - (state.lastWSUpdate || 0);
    
    // Determine which data source is more recent and reliable
    if (wsMonitoring && wsAge < restAge && wsAge < config.sync.staleThreshold) {
      // WebSocket data is fresher
      setState(prev => ({ ...prev, dataSource: 'websocket' }));
    } else if (restAge < config.sync.staleThreshold) {
      // REST data is fresher or WebSocket is stale
      refreshREST(false); // Silent refresh
    }
  }, [state, wsMonitoring, config.sync.staleThreshold, refreshREST]);
  
  /**
   * Force refresh all data sources
   */
  const forceRefresh = useCallback(async () => {
    setState(prev => ({ ...prev, isRefreshing: true }));
    
    try {
      // Refresh REST data
      const restPromise = refreshREST(true);
      
      // Restart WebSocket monitoring if connected
      let wsPromise = Promise.resolve();
      if (wsConnected && wsAuthenticated) {
        wsPromise = stopMonitoring().then(() => startMonitoring());
      }
      
      await Promise.all([restPromise, wsPromise]);
      
    } catch (error) {
      console.error('[useEnhancedDashboardData] Force refresh failed:', error);
      setState(prev => ({ 
        ...prev, 
        error: error.message || 'Refresh failed' 
      }));
    } finally {
      setState(prev => ({ ...prev, isRefreshing: false }));
    }
  }, [refreshREST, wsConnected, wsAuthenticated, startMonitoring, stopMonitoring]);
  
  // ==================== LIFECYCLE MANAGEMENT ====================
  
  /**
   * Initialize WebSocket with proper authentication
   */
  useEffect(() => {
    if (wallet.connected && config.dataSource.preferWebSocket && !wsConnected) {
      // Get or generate signature for WebSocket auth
      signatureCacheService.getOrGenerateSignature(
        wallet.address,
        async () => {
          const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
          if (!messageResponse.success) {
            throw new Error(messageResponse.message);
          }
          
          const message = messageResponse.data.message;
          const formattedMessage = formatMessageForSigning(message);
          const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);
          
          return { signature, message };
        },
        'dashboard'
      ).catch(error => {
        console.error('[useEnhancedDashboardData] Signature generation failed:', error);
      });
    }
  }, [wallet.connected, wallet.address, config.dataSource.preferWebSocket, wsConnected]);
  
  /**
   * Setup synchronization intervals
   */
  useEffect(() => {
    if (!wallet.connected) return;
    
    // REST sync interval (only if not using WebSocket exclusively)
    if (!config.dataSource.preferWebSocket || !wsMonitoring) {
      syncIntervalRef.current = setInterval(() => {
        refreshREST(false); // Silent refresh
      }, config.sync.restInterval);
    }
    
    // Data reconciliation interval
    if (config.dataSource.hybridMode) {
      reconcileIntervalRef.current = setInterval(reconcileData, config.sync.reconcileInterval);
    }
    
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (reconcileIntervalRef.current) clearInterval(reconcileIntervalRef.current);
      if (updateDebounceRef.current) clearTimeout(updateDebounceRef.current);
    };
  }, [
    wallet.connected,
    config.dataSource.preferWebSocket,
    config.dataSource.hybridMode,
    config.sync.restInterval,
    config.sync.reconcileInterval,
    wsMonitoring,
    refreshREST,
    reconcileData
  ]);
  
  /**
   * Update connection states
   */
  useEffect(() => {
    setState(prev => ({
      ...prev,
      wsConnected,
      wsMonitoring,
      error: restError || wsError
    }));
  }, [wsConnected, wsMonitoring, restError, wsError]);
  
  // ==================== COMPUTED VALUES ====================
  
  /**
   * Unified loading state
   */
  const isLoading = useMemo(() => {
    if (config.dataSource.hybridMode) {
      return restLoading && !state.dashboardData;
    }
    
    if (config.dataSource.preferWebSocket) {
      return !wsConnected && !state.dashboardData;
    }
    
    return restLoading;
  }, [config.dataSource, restLoading, wsConnected, state.dashboardData]);
  
  /**
   * Connection health indicator
   */
  const connectionHealth = useMemo(() => {
    if (wsMonitoring && state.dataQuality === 'realtime') {
      return { status: 'excellent', label: 'Real-time Active', color: 'green' };
    }
    
    if (wsConnected && state.dataQuality === 'recent') {
      return { status: 'good', label: 'Connected', color: 'blue' };
    }
    
    if (state.dataQuality === 'stale') {
      return { status: 'fair', label: 'Data Stale', color: 'yellow' };
    }
    
    return { status: 'poor', label: 'Offline', color: 'red' };
  }, [wsMonitoring, wsConnected, state.dataQuality]);
  
  /**
   * Performance metrics
   */
  const performanceMetrics = useMemo(() => ({
    rest: {
      calls: performanceRef.current.restCalls,
      lastUpdate: state.lastRESTUpdate
    },
    websocket: {
      updates: performanceRef.current.wsUpdates,
      lastUpdate: state.lastWSUpdate,
      connected: wsConnected,
      monitoring: wsMonitoring,
      performance: wsPerformance
    },
    data: {
      source: state.dataSource,
      quality: state.dataQuality,
      conflicts: performanceRef.current.dataConflicts,
      reconciliations: performanceRef.current.reconciliations
    }
  }), [state, wsConnected, wsMonitoring, wsPerformance]);
  
  // ==================== PUBLIC API ====================
  
  return {
    // Data
    dashboardData: state.dashboardData,
    nodesOverview: state.nodesOverview,
    
    // States
    isLoading,
    isRefreshing: state.isRefreshing || restRefreshing,
    error: state.error,
    
    // Connection info
    connectionHealth,
    dataSource: state.dataSource,
    dataQuality: state.dataQuality,
    wsConnected: state.wsConnected,
    wsMonitoring: state.wsMonitoring,
    
    // Timestamps
    lastUpdate: state.lastUpdate,
    lastRESTUpdate: state.lastRESTUpdate,
    lastWSUpdate: state.lastWSUpdate,
    
    // Actions
    refresh: forceRefresh,
    startRealtimeUpdates: startMonitoring,
    stopRealtimeUpdates: stopMonitoring,
    
    // Performance
    performance: config.performance.enableMetrics ? performanceMetrics : null
  };
}
