/**
 * Enhanced AeroNyx Nodes Management Dashboard with Real-time Updates and Caching
 * 
 * File Path: src/app/dashboard/nodes/page.js
 * 
 * Production-ready dashboard with real-time WebSocket monitoring,
 * automatic updates, performance optimizations, and proper caching.
 * 
 * @version 2.1.0
 * @author AeroNyx Development Team
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../../components/layout/Header';
import { useWallet } from '../../../components/wallet/WalletProvider';
import Link from 'next/link';
import NodeList from '../../../components/dashboard/NodeList';
import BlockchainIntegrationModule from '../../../components/dashboard/BlockchainIntegrationModule';
import RealTimeNodeMonitor from '../../../components/dashboard/RealTimeNodeMonitor';
import { useUserMonitorWebSocket } from '../../../hooks/useWebSocket';
import nodeRegistrationCachedService from '../../../lib/api/nodeRegistrationCached';
import { useSignature } from '../../../hooks/useSignature';
import { apiCacheService } from '../../../lib/services/ApiCacheService';

/**
 * Configuration constants
 */
const MONITOR_CONFIG = {
  ENABLE_REALTIME: true,
  FALLBACK_REFRESH_INTERVAL: 30000, // 30 seconds
  INITIAL_LOAD_DELAY: 1000,
  PERFORMANCE_THRESHOLD: {
    CPU_WARNING: 80,
    CPU_CRITICAL: 90,
    MEMORY_WARNING: 80,
    MEMORY_CRITICAL: 90
  }
};

/**
 * Enhanced Nodes Management Page with Real-time Updates and Caching
 */
export default function NodesPage() {
  const { wallet } = useWallet();
  const router = useRouter();
  
  // Use cached signature
  const { signature, message, isLoading: signatureLoading } = useSignature('nodesPage');
  
  // ==================== STATE MANAGEMENT ====================
  
  // Core data state
  const [nodes, setNodes] = useState([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFallbackLoading, setIsFallbackLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [updateSource, setUpdateSource] = useState(null); // 'websocket' or 'api'
  
  // UI state
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [showBlockchainModal, setShowBlockchainModal] = useState(false);
  const [showRealtimeMonitor, setShowRealtimeMonitor] = useState(true);
  
  // Statistics state
  const [nodeStats, setNodeStats] = useState({
    total: 0,
    online: 0,
    active: 0,
    offline: 0,
    pending: 0
  });
  
  const [performanceAlerts, setPerformanceAlerts] = useState([]);
  const [walletCredentials, setWalletCredentials] = useState(null);
  
  // Refs
  const fallbackIntervalRef = useRef(null);
  const nodesMapRef = useRef(new Map());
  
  // ==================== WEBSOCKET SETUP ====================
  
  // Initialize wallet credentials for WebSocket using cached signature
  useEffect(() => {
    if (!wallet.connected || !wallet.address || !signature || !message || signatureLoading) return;
    
    setWalletCredentials({
      walletAddress: wallet.address,
      signature,
      message,
      walletType: 'okx'
    });
  }, [wallet.connected, wallet.address, signature, message, signatureLoading]);
  
  // WebSocket hook
  const {
    connected: wsConnected,
    authenticated: wsAuthenticated,
    monitoring: wsMonitoring,
    nodes: wsNodes,
    summary: wsSummary,
    error: wsError,
    startMonitoring,
    stopMonitoring,
    subscribeToNode,
    unsubscribeFromNode
  } = useUserMonitorWebSocket(walletCredentials, {
    enabled: MONITOR_CONFIG.ENABLE_REALTIME && !!walletCredentials
  });
  
  // ==================== LIFECYCLE HOOKS ====================
  
  /**
   * Handle wallet connection and initial setup
   */
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
      return;
    }
    
    // Initial data load with delay to prevent flash
    const loadTimer = setTimeout(() => {
      if (!wsConnected || !wsAuthenticated) {
        if (signature && message && !signatureLoading) {
          fetchNodesViaAPI();
        }
      }
    }, MONITOR_CONFIG.INITIAL_LOAD_DELAY);
    
    return () => clearTimeout(loadTimer);
  }, [wallet.connected, wsConnected, wsAuthenticated, router, signature, message, signatureLoading]);
  
  /**
   * Start WebSocket monitoring when authenticated
   */
  useEffect(() => {
    if (wsAuthenticated && !wsMonitoring && MONITOR_CONFIG.ENABLE_REALTIME) {
      startMonitoring();
    }
  }, [wsAuthenticated, wsMonitoring, startMonitoring]);
  
  /**
   * Process WebSocket nodes updates
   */
  useEffect(() => {
    if (wsNodes && wsNodes.length > 0) {
      processNodesUpdate(wsNodes, 'websocket');
      setIsInitialLoading(false);
      stopFallbackPolling();
    }
  }, [wsNodes]);
  
  /**
   * Update statistics from WebSocket summary
   */
  useEffect(() => {
    if (wsSummary) {
      setNodeStats({
        total: wsSummary.total_nodes || 0,
        online: wsSummary.online_nodes || 0,
        active: wsSummary.active_nodes || 0,
        offline: wsSummary.offline_nodes || 0,
        pending: Math.max(0, (wsSummary.total_nodes || 0) - 
                          (wsSummary.online_nodes || 0) - 
                          (wsSummary.active_nodes || 0) - 
                          (wsSummary.offline_nodes || 0))
      });
    }
  }, [wsSummary]);
  
  /**
   * Handle WebSocket errors
   */
  useEffect(() => {
    if (wsError && !wsConnected) {
      console.warn('WebSocket error, falling back to API polling:', wsError);
      startFallbackPolling();
    }
  }, [wsError, wsConnected]);
  
  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopFallbackPolling();
      if (wsMonitoring) {
        stopMonitoring();
      }
    };
  }, [wsMonitoring, stopMonitoring]);
  
  // ==================== DATA PROCESSING ====================
  
  /**
   * Process nodes update from WebSocket or API
   */
  const processNodesUpdate = useCallback((nodesData, source) => {
    // Create map for efficient updates
    const newNodesMap = new Map();
    
    nodesData.forEach(node => {
      const processedNode = transformNodeData(node, source);
      
      // Check for performance alerts
      checkNodePerformance(processedNode);
      
      // Preserve expansion state
      const existingNode = nodesMapRef.current.get(processedNode.id);
      if (existingNode) {
        processedNode._expanded = existingNode._expanded;
      }
      
      newNodesMap.set(processedNode.id, processedNode);
    });
    
    nodesMapRef.current = newNodesMap;
    setNodes(Array.from(newNodesMap.values()));
    setLastUpdate(new Date());
    setUpdateSource(source);
  }, []);
  
  /**
   * Transform node data for UI consumption
   */
  const transformNodeData = useCallback((node, source) => {
    const isWebSocketData = source === 'websocket';
    
    return {
      // Core identifiers
      id: node.reference_code || node.id,
      referenceCode: node.reference_code || node.id,
      
      // Basic information
      name: node.name || 'Unnamed Node',
      status: normalizeNodeStatus(node.status),
      type: node.node_type?.id || node.node_type || 'general',
      
      // Timestamps
      registeredDate: node.created_at || new Date().toISOString(),
      lastSeen: isWebSocketData ? 
        node.connection?.last_heartbeat : 
        (node.last_seen || node.last_heartbeat),
      
      // Performance
      uptime: node.uptime || calculateUptime(node.connection?.last_heartbeat, node.created_at),
      earnings: parseFloat(node.earnings || 0),
      resources: isWebSocketData ? 
        transformWebSocketResources(node.performance) : 
        transformAPIResources(node.performance),
      
      // Connection
      isConnected: isWebSocketData ? 
        node.connection?.connected : 
        (node.is_connected || false),
      connectionStatus: node.connection_status || 
        (node.connection?.connected ? 'connected' : 'disconnected'),
      heartbeatCount: node.connection?.heartbeat_count || 0,
      
      // Additional data
      blockchainIntegrations: node.blockchain_integrations || [],
      totalTasks: node.total_tasks || 0,
      completedTasks: node.completed_tasks || 0,
      nodeVersion: node.node_version || 'Unknown',
      
      // Real-time indicator
      isRealtime: isWebSocketData,
      lastUpdateSource: source,
      lastUpdateTime: new Date().toISOString()
    };
  }, []);
  
  /**
   * Transform WebSocket performance data to resources format
   */
  const transformWebSocketResources = useCallback((performance) => {
    if (!performance) return getDefaultResources();
    
    return {
      cpu: {
        total: 'Unknown',
        usage: validatePercentage(performance.cpu_usage)
      },
      memory: {
        total: 'Unknown',
        usage: validatePercentage(performance.memory_usage)
      },
      storage: {
        total: 'Unknown',
        usage: validatePercentage(performance.storage_usage)
      },
      bandwidth: {
        total: 'Unknown',
        usage: validatePercentage(performance.bandwidth_usage)
      }
    };
  }, []);
  
  /**
   * Transform API performance data to resources format
   */
  const transformAPIResources = useCallback((performance) => {
    if (!performance) return getDefaultResources();
    
    return {
      cpu: {
        total: performance.cpu_cores ? `${performance.cpu_cores} cores` : 'Unknown',
        usage: validatePercentage(performance.cpu_usage)
      },
      memory: {
        total: performance.memory_gb ? `${performance.memory_gb} GB` : 'Unknown',
        usage: validatePercentage(performance.memory_usage)
      },
      storage: {
        total: performance.storage_gb ? `${performance.storage_gb} GB` : 'Unknown',
        usage: validatePercentage(performance.storage_usage)
      },
      bandwidth: {
        total: performance.bandwidth_mbps ? `${performance.bandwidth_mbps} Mbps` : 'Unknown',
        usage: validatePercentage(performance.bandwidth_usage)
      }
    };
  }, []);
  
  /**
   * Get default resources structure
   */
  const getDefaultResources = () => ({
    cpu: { total: 'Unknown', usage: 0 },
    memory: { total: 'Unknown', usage: 0 },
    storage: { total: 'Unknown', usage: 0 },
    bandwidth: { total: 'Unknown', usage: 0 }
  });
  
  /**
   * Validate percentage value
   */
  const validatePercentage = (value) => {
    const num = Number(value);
    return isNaN(num) ? 0 : Math.max(0, Math.min(100, Math.round(num)));
  };
  
  /**
   * Normalize node status
   */
  const normalizeNodeStatus = (status) => {
    const statusMap = {
      'active': 'online',
      'running': 'online',
      'stopped': 'offline',
      'error': 'offline',
      'registered': 'pending',
      'initializing': 'pending'
    };
    return statusMap[status] || status || 'offline';
  };
  
  /**
   * Calculate uptime
   */
  const calculateUptime = (lastHeartbeat, createdAt) => {
    if (!createdAt) return '0 days, 0 hours';
    
    const now = new Date();
    const created = new Date(createdAt);
    
    if (!lastHeartbeat) return '0 days, 0 hours';
    
    const lastSeen = new Date(lastHeartbeat);
    const isOnline = (now - lastSeen) < (10 * 60 * 1000); // 10 minutes
    
    if (!isOnline) return '0 days, 0 hours';
    
    const diffMs = now - created;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days} days, ${hours} hours`;
  };
  
  /**
   * Check node performance and create alerts
   */
  const checkNodePerformance = useCallback((node) => {
    const alerts = [];
    const { CPU_WARNING, CPU_CRITICAL, MEMORY_WARNING, MEMORY_CRITICAL } = MONITOR_CONFIG.PERFORMANCE_THRESHOLD;
    
    if (node.resources.cpu.usage >= CPU_CRITICAL) {
      alerts.push({
        nodeId: node.id,
        type: 'cpu',
        severity: 'critical',
        message: `CPU usage critical: ${node.resources.cpu.usage}%`,
        timestamp: new Date()
      });
    } else if (node.resources.cpu.usage >= CPU_WARNING) {
      alerts.push({
        nodeId: node.id,
        type: 'cpu',
        severity: 'warning',
        message: `CPU usage high: ${node.resources.cpu.usage}%`,
        timestamp: new Date()
      });
    }
    
    if (node.resources.memory.usage >= MEMORY_CRITICAL) {
      alerts.push({
        nodeId: node.id,
        type: 'memory',
        severity: 'critical',
        message: `Memory usage critical: ${node.resources.memory.usage}%`,
        timestamp: new Date()
      });
    } else if (node.resources.memory.usage >= MEMORY_WARNING) {
      alerts.push({
        nodeId: node.id,
        type: 'memory',
        severity: 'warning',
        message: `Memory usage high: ${node.resources.memory.usage}%`,
        timestamp: new Date()
      });
    }
    
    if (alerts.length > 0) {
      setPerformanceAlerts(prev => [...alerts, ...prev].slice(0, 10)); // Keep last 10 alerts
    }
  }, []);
  
  // ==================== FALLBACK API POLLING ====================
  
  /**
   * Fetch nodes data via API (fallback when WebSocket unavailable)
   */
  const fetchNodesViaAPI = useCallback(async () => {
    if (!wallet.connected || !wallet.address || !signature || !message) return;
    
    setIsFallbackLoading(true);
    setError(null);
    
    try {
      const overviewResponse = await nodeRegistrationCachedService.getUserNodesOverview(
        wallet.address,
        signature,
        message,
        'okx'
      );
      
      if (overviewResponse.success && overviewResponse.data) {
        const { summary, nodes: nodesByStatus } = overviewResponse.data;
        
        const allNodes = [
          ...(nodesByStatus.online || []),
          ...(nodesByStatus.active || []),
          ...(nodesByStatus.offline || [])
        ];
        
        processNodesUpdate(allNodes, 'api');
        
        // Update stats
        setNodeStats({
          total: summary.total_nodes || 0,
          online: summary.online_nodes || 0,
          active: summary.active_nodes || 0,
          offline: summary.offline_nodes || 0,
          pending: Math.max(0, (summary.total_nodes || 0) - 
                            (summary.online_nodes || 0) - 
                            (summary.active_nodes || 0) - 
                            (summary.offline_nodes || 0))
        });
        
        setIsInitialLoading(false);
      }
    } catch (err) {
      console.error('API fetch error:', err);
      setError(err.message || 'Failed to fetch nodes data');
      
      // Handle no nodes case
      if (err.message?.includes('no nodes')) {
        setNodes([]);
        setNodeStats({ total: 0, online: 0, active: 0, offline: 0, pending: 0 });
        setError(null);
      }
    } finally {
      setIsFallbackLoading(false);
    }
  }, [wallet.connected, wallet.address, signature, message, processNodesUpdate]);
  
  /**
   * Start fallback polling
   */
  const startFallbackPolling = useCallback(() => {
    stopFallbackPolling();
    
    // Initial fetch
    if (signature && message) {
      fetchNodesViaAPI();
    }
    
    // Set up interval
    fallbackIntervalRef.current = setInterval(() => {
      if ((!wsConnected || !wsAuthenticated) && signature && message) {
        fetchNodesViaAPI();
      }
    }, MONITOR_CONFIG.FALLBACK_REFRESH_INTERVAL);
  }, [wsConnected, wsAuthenticated, fetchNodesViaAPI, signature, message]);
  
  /**
   * Stop fallback polling
   */
  const stopFallbackPolling = useCallback(() => {
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
  }, []);
  
  // ==================== UI EVENT HANDLERS ====================
  
  const handleRefreshNodes = useCallback(() => {
    if (wsConnected && wsAuthenticated) {
      // For WebSocket, we could send a refresh request
      // For now, just indicate refresh is automatic
      setLastUpdate(new Date());
    } else {
      // Clear cache for fresh data
      apiCacheService.clearCacheByPattern(`nodesOverview|walletAddress:${wallet.address}`);
      fetchNodesViaAPI();
    }
  }, [wsConnected, wsAuthenticated, fetchNodesViaAPI, wallet.address]);
  
  const handleNodeSelect = useCallback((node) => {
    setSelectedNode(node);
    setShowBlockchainModal(true);
  }, []);
  
  const handleSubscribeToNode = useCallback((nodeId) => {
    if (wsConnected && wsAuthenticated) {
      subscribeToNode(nodeId);
    }
  }, [wsConnected, wsAuthenticated, subscribeToNode]);
  
  const handleUnsubscribeFromNode = useCallback((nodeId) => {
    if (wsConnected && wsAuthenticated) {
      unsubscribeFromNode(nodeId);
    }
  }, [wsConnected, wsAuthenticated, unsubscribeFromNode]);
  
  /**
   * Fetch node details (used by NodeList)
   */
  const fetchNodeDetails = useCallback(async (referenceCode) => {
    if (!signature || !message) return null;
    
    try {
      const response = await nodeRegistrationCachedService.getNodeDetailedStatus(
        wallet.address,
        signature,
        message,
        referenceCode,
        'okx'
      );
      
      if (response.success) {
        return response.data;
      }
    } catch (error) {
      console.error('Failed to fetch node details:', error);
    }
    
    return null;
  }, [wallet.address, signature, message]);
  
  // ==================== COMPUTED VALUES ====================
  
  const filteredNodes = useMemo(() => {
    return nodes.filter(node => {
      let matchesFilter = false;
      
      switch (filter) {
        case 'all':
          matchesFilter = true;
          break;
        case 'online':
          matchesFilter = node.status === 'online' || node.status === 'active';
          break;
        case 'offline':
          matchesFilter = node.status === 'offline';
          break;
        case 'pending':
          matchesFilter = node.status === 'pending' || node.status === 'registered';
          break;
        default:
          matchesFilter = node.status === filter;
      }
      
      const matchesSearch = searchTerm === '' || 
        node.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        node.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesFilter && matchesSearch;
    });
  }, [nodes, filter, searchTerm]);
  
  const connectionStatus = useMemo(() => {
    if (wsConnected && wsAuthenticated && wsMonitoring) {
      return { type: 'realtime', label: 'Real-time', color: 'green' };
    } else if (wsConnected && wsAuthenticated) {
      return { type: 'connected', label: 'Connected', color: 'blue' };
    } else if (wsConnected) {
      return { type: 'authenticating', label: 'Authenticating', color: 'yellow' };
    } else if (fallbackIntervalRef.current) {
      return { type: 'polling', label: 'Polling', color: 'orange' };
    } else {
      return { type: 'disconnected', label: 'Disconnected', color: 'red' };
    }
  }, [wsConnected, wsAuthenticated, wsMonitoring]);
  
  // ==================== RENDER ====================
  
  if (!wallet.connected) {
    return null;
  }
  
  const isLoading = isInitialLoading || signatureLoading;
  
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-grow container-custom py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-white">My Nodes</span>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">My Nodes</h1>
              <p className="text-gray-400">
                Manage your registered nodes on the AeroNyx network
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {/* Connection Status */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-md bg-${connectionStatus.color}-900/30 border border-${connectionStatus.color}-800`}>
                <div className={`w-2 h-2 rounded-full bg-${connectionStatus.color}-500 animate-pulse`}></div>
                <span className={`text-sm text-${connectionStatus.color}-400`}>
                  {connectionStatus.label}
                </span>
              </div>
              
              <button 
                onClick={handleRefreshNodes}
                disabled={isLoading || isFallbackLoading}
                className={`button-outline flex items-center gap-2 ${
                  isLoading || isFallbackLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${
                  isFallbackLoading ? 'animate-spin' : ''
                }`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                {isFallbackLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              
              <Link 
                href="/dashboard/register"
                className="button-primary flex items-center gap-2 whitespace-nowrap"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Register New Node
              </Link>
            </div>
          </div>
        </div>

        {/* Real-time Monitor Toggle */}
        {MONITOR_CONFIG.ENABLE_REALTIME && wsConnected && (
          <div className="mb-6">
            <button
              onClick={() => setShowRealtimeMonitor(!showRealtimeMonitor)}
              className="text-sm text-primary hover:text-primary-400 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${
                showRealtimeMonitor ? 'rotate-90' : ''
              }`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              {showRealtimeMonitor ? 'Hide' : 'Show'} Real-time Monitor
            </button>
          </div>
        )}

        {/* Real-time Monitor Component */}
        {MONITOR_CONFIG.ENABLE_REALTIME && showRealtimeMonitor && wsConnected && (
          <RealTimeNodeMonitor 
            nodes={nodes}
            performanceAlerts={performanceAlerts}
            lastUpdate={lastUpdate}
            updateSource={updateSource}
            connectionStatus={connectionStatus}
            onClearAlerts={() => setPerformanceAlerts([])}
          />
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-800 rounded-md text-red-200">
            <div className="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-bold">Error loading nodes</span>
            </div>
            <p className="text-sm mb-3">{error}</p>
            <button 
              onClick={handleRefreshNodes}
              className="text-sm underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Node Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Total Nodes</h3>
            <div className="text-2xl font-bold">{nodeStats.total}</div>
          </div>
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Online</h3>
            <div className="text-2xl font-bold text-green-500">{nodeStats.online}</div>
          </div>
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Active</h3>
            <div className="text-2xl font-bold text-blue-500">{nodeStats.active}</div>
          </div>
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Offline</h3>
            <div className="text-2xl font-bold text-red-500">{nodeStats.offline}</div>
          </div>
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Pending</h3>
            <div className="text-2xl font-bold text-yellow-500">{nodeStats.pending}</div>
          </div>
        </div>
        
        {/* Blockchain Integration Module */}
        <div className="mb-8">
          <div className="card glass-effect overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <div className="p-6 md:w-1/2">
                <div className="flex items-center gap-2 mb-3">
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-primary" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 5C4 4.44772 4.44772 4 5 4H19C19.5523 4 20 4.44772 20 5V7C20 7.55228 19.5523 8 19 8H5C4.44772 8 4 7.55228 4 7V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 13C4 12.4477 4.44772 12 5 12H11C11.5523 12 12 12.4477 12 13V19C12 19.5523 11.5523 20 11 20H5C4.44772 20 4 19.5523 4 19V13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 13C16 12.4477 16.4477 12 17 12H19C19.5523 12 20 12.4477 20 13V19C20 19.5523 19.5523 20 19 20H17C16.4477 20 16 19.5523 16 19V13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <h2 className="text-xl font-bold">Blockchain Integration</h2>
                </div>
                
                <p className="text-gray-300 mb-6">
                  Supercharge your AeroNyx nodes by integrating with leading blockchains. Unlock additional revenue streams and contribute to decentralized networks.
                </p>
                
                <button
                  onClick={() => setShowBlockchainModal(true)}
                  className="button-primary w-full py-3"
                >
                  Explore Blockchain Integration
                </button>
              </div>
              
              <div className="md:w-1/2 bg-gradient-to-br from-background-100 via-background-50 to-background-100 p-6">
                <div className="text-sm text-gray-400 mb-4">Compatible with leading blockchains</div>
                
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 flex flex-col items-center">
                    <img src="/images/solana-logo.svg" alt="Solana" className="h-8 mb-2" />
                    <div className="text-xs font-medium text-center">Solana</div>
                  </div>
                  
                  <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 flex flex-col items-center">
                    <img src="/images/monad-logo.svg" alt="Monad" className="h-8 mb-2" />
                    <div className="text-xs font-medium text-center">Monad</div>
                  </div>
                  
                  <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 flex flex-col items-center">
                    <div className="h-8 mb-2 flex items-center justify-center text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <div className="text-xs font-medium text-center text-gray-400">Coming Soon</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter and Search Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex">
            {[
              { key: 'all', label: 'All' },
              { key: 'online', label: 'Online' },
              { key: 'offline', label: 'Offline' },
              { key: 'pending', label: 'Pending' }
            ].map(({ key, label }, index, array) => (
              <button 
                key={key}
                className={`px-4 py-2 ${
                  index === 0 ? 'rounded-l-md' : index === array.length - 1 ? 'rounded-r-md' : ''
                } ${
                  filter === key 
                    ? 'bg-primary text-white' 
                    : 'bg-background-100 text-gray-300 hover:bg-background-200'
                } transition-colors`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          
          <div className="flex-grow">
            <div className="relative">
              <input
                type="text"
                className="input-field w-full pl-10"
                placeholder="Search nodes by name or reference code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Nodes List or Empty State */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : filteredNodes.length > 0 ? (
          <NodeList 
            nodes={filteredNodes} 
            onBlockchainIntegrate={handleNodeSelect}
            onNodeDetails={fetchNodeDetails}
            onNodeSubscribe={handleSubscribeToNode}
            onNodeUnsubscribe={handleUnsubscribeFromNode}
            isRealtime={wsConnected && wsMonitoring}
            signature={signature}
            message={message}
          />
        ) : (
          <div className="card glass-effect p-8 text-center">
            <h3 className="text-xl font-bold mb-4">No Nodes Found</h3>
            <p className="text-gray-400 mb-6">
              {nodes.length === 0 
                ? "You haven't registered any nodes yet. Get started by registering your first node!"
                : "No nodes match your current filter criteria. Try adjusting your search or filter settings."
              }
            </p>
            {nodes.length === 0 && (
              <Link 
                href="/dashboard/register"
                className="button-primary inline-flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Register Your First Node
              </Link>
            )}
          </div>
        )}
        
        {/* Update Information */}
        {lastUpdate && (
          <div className="mt-6 text-center text-sm text-gray-400">
            Last updated: {lastUpdate.toLocaleString()} 
            {updateSource && ` (via ${updateSource})`}
          </div>
        )}
      </main>
      
      {/* Blockchain Integration Modal */}
      {showBlockchainModal && (
        <BlockchainIntegrationModule 
          isOpen={showBlockchainModal}
          onClose={() => setShowBlockchainModal(false)}
          selectedNode={selectedNode}
        />
      )}
      
      <footer className="bg-background-100 border-t border-background-200 py-4">
        <div className="container-custom">
          <div className="text-sm text-gray-400 text-center">
            © {new Date().getFullYear()} AeroNyx Network. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
