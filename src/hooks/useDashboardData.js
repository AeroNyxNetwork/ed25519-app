/**
 * Dashboard Data Hook for AeroNyx Platform
 * 
 * File Path: src/hooks/useDashboardData.js
 * 
 * 仅修复数据处理问题
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

export const DataSource = {
  WEBSOCKET: 'websocket',
  REST: 'rest',
  CACHE: 'cache'
};

export function useDashboard(config = {}) {
  const {
    preferWebSocket = true,
    enableRESTFallback = true,
    hybridMode = true
  } = config;
  
  const { wallet } = useWallet();
  const { signature, message, isLoading: signatureLoading, error: signatureError } = useSignature('dashboard');
  
  // State
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
  
  const mountedRef = useRef(true);
  
  // WebSocket
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
    autoMonitor: true
  });
  
  /**
   * Process dashboard data - 修复数据处理
   */
  const processDashboardData = useCallback((data, source) => {
    if (!data) return null;
    
    console.log('[processDashboardData] Processing data from:', source, data);
    
    // Handle WebSocket data
    if (source === DataSource.WEBSOCKET && data.nodes && Array.isArray(data.nodes)) {
      const nodes = data.nodes;
      const processedStats = {
        totalNodes: nodes.length,
        activeNodes: nodes.filter(n => n.status === 'active').length,
        offlineNodes: nodes.filter(n => n.status === 'offline').length,
        pendingNodes: nodes.filter(n => n.status === 'pending' || n.status === 'registered').length,
        totalEarnings: 0,
        networkContribution: `${(nodes.filter(n => n.status === 'active').length * 0.0015).toFixed(4)}%`,
        resourceUtilization: 0
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
    
    // Handle REST API data - 这是关键修复
    if (data.nodes && typeof data.nodes === 'object' && !Array.isArray(data.nodes)) {
      // 合并所有节点数组
      const allNodes = [];
      
      if (data.nodes.online) allNodes.push(...data.nodes.online);
      if (data.nodes.active) allNodes.push(...data.nodes.active);
      if (data.nodes.offline) allNodes.push(...data.nodes.offline);
      
      console.log('[processDashboardData] Combined nodes:', allNodes.length);
      
      const summary = data.summary || {};
      
      const processedStats = {
        totalNodes: summary.total_nodes || allNodes.length,
        activeNodes: summary.online_nodes || 0,
        offlineNodes: summary.offline_nodes || 0,
        pendingNodes: Math.max(0, 
          (summary.total_nodes || 0) - 
          (summary.online_nodes || 0) - 
          (summary.offline_nodes || 0)
        ),
        totalEarnings: parseFloat(summary.total_earnings || 0),
        networkContribution: `${(Math.max(0, summary.online_nodes || 0) * 0.0015).toFixed(4)}%`,
        resourceUtilization: 0
      };
      
      return {
        dashboardData: {
          stats: processedStats,
          nodes: allNodes, // 返回合并后的节点数组
          timestamp: new Date().toISOString(),
          source
        },
        stats: processedStats
      };
    }
    
    return null;
  }, []);
  
  /**
   * Fetch REST data
   */
  const fetchRESTData = useCallback(async (forceRefresh = false) => {
    if (!wallet.connected || !signature || !message) return;
    
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
        const processed = processDashboardData(response.data, DataSource.REST);
        
        if (processed && mountedRef.current) {
          setState(prev => ({
            ...prev,
            dashboardData: processed.dashboardData,
            nodesOverview: response.data,
            dataSource: DataSource.REST,
            lastUpdate: new Date(),
            error: null,
            isLoading: false,
            isRefreshing: false
          }));
          
          setStats(processed.stats);
        }
      }
    } catch (error) {
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          error: error.message || 'Failed to load dashboard data',
          isLoading: false,
          isRefreshing: false
        }));
      }
    }
  }, [wallet.connected, wallet.address, signature, message, processDashboardData]);
  
  // WebSocket data handler
  useEffect(() => {
    if (wsData && wsMonitoring) {
      const processed = processDashboardData(wsData, DataSource.WEBSOCKET);
      if (processed && mountedRef.current) {
        setState(prev => ({
          ...prev,
          dashboardData: processed.dashboardData,
          dataSource: DataSource.WEBSOCKET,
          lastUpdate: new Date(),
          error: null
        }));
        setStats(processed.stats);
      }
    }
  }, [wsData, wsMonitoring, processDashboardData]);
  
  // Initial load
  useEffect(() => {
    if (!wallet.connected || signatureLoading) return;
    
    if (signature && message) {
      fetchRESTData();
    }
  }, [wallet.connected, signature, message, signatureLoading, fetchRESTData]);
  
  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  
  const refresh = useCallback((force = true) => {
    return fetchRESTData(force);
  }, [fetchRESTData]);
  
  const connectionHealth = wsMonitoring ? wsConnectionHealth : {
    status: state.error ? 'error' : 'good',
    label: state.error ? 'Error' : 'REST API',
    color: state.error ? 'red' : 'blue'
  };
  
  return {
    dashboardData: state.dashboardData,
    nodesOverview: state.nodesOverview,
    stats,
    isInitialLoading: state.isLoading && !state.dashboardData,
    isRefreshing: state.isRefreshing,
    error: state.error,
    dataSource: state.dataSource,
    connectionHealth,
    isWebSocketActive: wsMonitoring,
    lastUpdate: state.lastUpdate,
    refresh
  };
}

export default useDashboard;
