/**
 * Enhanced Node Registration Hook for AeroNyx Platform
 * 
 * File Path: src/hooks/useNodeRegistration.js
 * 
 * Production-ready hook for handling node registration status and processes
 * with accurate data mapping based on actual API responses and WebSocket data structures.
 * 
 * Features:
 * - Handles both REST API and WebSocket data formats
 * - Proper node status classification (online vs active vs offline)
 * - Intelligent caching with TTL management
 * - Comprehensive error handling
 * - Performance history tracking
 * - Real-time status updates
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-18
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../lib/utils/walletSignature';

/**
 * Cache configuration for different data types
 */
const CACHE_CONFIG = {
  NODES_OVERVIEW: 5 * 60 * 1000,      // 5 minutes
  NODE_DETAILS: 1 * 60 * 1000,        // 1 minute  
  PERFORMANCE_HISTORY: 30 * 1000,      // 30 seconds
  SIGNATURE: 10 * 60 * 1000           // 10 minutes
};

/**
 * Node status definitions based on API documentation
 */
const NODE_STATUS = {
  PENDING: 'pending',
  REGISTERED: 'registered',
  ACTIVE: 'active',
  OFFLINE: 'offline',
  SUSPENDED: 'suspended'
};

/**
 * Connection status categories based on API logic
 */
const CONNECTION_CATEGORY = {
  ONLINE: 'online',    // WebSocket connected AND status='active'
  ACTIVE: 'active',    // status='active' BUT no WebSocket connection
  OFFLINE: 'offline'   // All other statuses
};

/**
 * Normalize node data from REST API response
 * Handles the exact data structure from the API documentation
 * 
 * @param {Object} node - Raw node data from API
 * @param {string} source - Data source identifier ('api' or 'websocket')
 * @param {string} category - Node category from API grouping
 * @returns {Object} Normalized node data
 */
function normalizeNodeData(node, source = 'api', category = null) {
  const now = new Date();
  
  // Base node structure
  const baseNode = {
    // Identifiers
    id: node.id || node.reference_code,
    referenceCode: node.reference_code,
    
    // Basic info
    name: node.name || 'Unnamed Node',
    status: node.status,
    
    // Timestamps
    createdAt: node.created_at,
    activatedAt: node.activated_at,
    lastSeen: node.last_seen,
    
    // Uptime and earnings
    uptime: node.uptime || '0 days, 0 hours',
    earnings: parseFloat(node.earnings || 0),
    
    // Node type handling
    type: typeof node.node_type === 'object' 
      ? node.node_type.id 
      : node.node_type || 'general',
    nodeTypeInfo: typeof node.node_type === 'object'
      ? node.node_type
      : { id: node.node_type || 'general', name: formatNodeTypeName(node.node_type || 'general') },
    
    // Connection status from API
    isConnected: node.is_connected || false,
    connectionStatus: node.connection_status || 'offline',
    
    // Registration info
    registrationStatus: node.registration_status || {},
    
    // Metadata
    source,
    category, // 'online', 'active', or 'offline' from REST API grouping
    lastUpdate: now
  };

  // Handle performance data based on source
  if (source === 'api') {
    // REST API performance structure
    baseNode.resources = transformAPIResources(node.performance);
    
    // Connection details from REST API
    if (node.connection_details) {
      baseNode.heartbeatCount = node.connection_details.heartbeat_count || 0;
      baseNode.lastHeartbeat = node.connection_details.last_heartbeat;
      baseNode.connectionDuration = node.connection_details.connection_duration_seconds;
      baseNode.offlineDuration = node.connection_details.offline_duration_seconds;
      baseNode.offlineDurationFormatted = node.connection_details.offline_duration_formatted;
    }
  } else if (source === 'websocket') {
    // WebSocket performance structure
    baseNode.resources = transformWebSocketResources(node.performance);
    
    // Connection details from WebSocket
    if (node.connection) {
      baseNode.isConnected = node.connection.connected || false;
      baseNode.heartbeatCount = node.connection.heartbeat_count || 0;
      baseNode.lastHeartbeat = node.connection.last_heartbeat;
      baseNode.offlineDuration = node.connection.offline_duration_seconds;
    }
  }

  // Calculate real-time status
  baseNode.isRealtime = calculateRealTimeStatus(baseNode, category);
  
  // Blockchain integrations (if available)
  baseNode.blockchainIntegrations = node.blockchain_integrations || [];
  baseNode.hasBlockchainIntegrations = baseNode.blockchainIntegrations.length > 0;
  
  return baseNode;
}

/**
 * Transform REST API performance data to standardized format
 * 
 * @param {Object} performance - Performance data from REST API
 * @returns {Object} Standardized resource data
 */
function transformAPIResources(performance) {
  if (!performance) {
    return {
      cpu: { total: 'Unknown', usage: 0 },
      memory: { total: 'Unknown', usage: 0 },
      storage: { total: 'Unknown', usage: 0 },
      bandwidth: { total: 'Unknown', usage: 0 }
    };
  }

  return {
    cpu: {
      total: 'Unknown', // Not provided in API response
      usage: Math.round(performance.cpu_usage || 0)
    },
    memory: {
      total: 'Unknown',
      usage: Math.round(performance.memory_usage || 0)
    },
    storage: {
      total: 'Unknown',
      usage: Math.round(performance.storage_usage || 0)
    },
    bandwidth: {
      total: 'Unknown',
      usage: Math.round(performance.bandwidth_usage || 0)
    }
  };
}

/**
 * Transform WebSocket performance data to standardized format
 * 
 * @param {Object} performance - Performance data from WebSocket
 * @returns {Object} Standardized resource data
 */
function transformWebSocketResources(performance) {
  if (!performance) {
    return {
      cpu: { total: 'Unknown', usage: 0 },
      memory: { total: 'Unknown', usage: 0 },
      storage: { total: 'Unknown', usage: 0 },
      bandwidth: { total: 'Unknown', usage: 0 }
    };
  }

  return {
    cpu: {
      total: 'Unknown',
      usage: Math.round(performance.cpu_usage || 0)
    },
    memory: {
      total: 'Unknown',
      usage: Math.round(performance.memory_usage || 0)
    },
    storage: {
      total: 'Unknown',
      usage: Math.round(performance.storage_usage || 0)
    },
    bandwidth: {
      total: 'Unknown',
      usage: Math.round(performance.bandwidth_usage || 0)
    }
  };
}

/**
 * Calculate if node should be considered real-time active
 * Based on connection status and recent activity
 * 
 * @param {Object} node - Normalized node data
 * @param {string} category - Node category from API
 * @returns {boolean} Whether node is real-time active
 */
function calculateRealTimeStatus(node, category) {
  // If we have category from REST API, use it directly
  if (category === CONNECTION_CATEGORY.ONLINE) {
    return true;
  }
  
  // Otherwise check based on connection and status
  if (!node.isConnected || node.connectionStatus !== 'online') {
    return false;
  }
  
  if (node.status !== NODE_STATUS.ACTIVE) {
    return false;
  }
  
  // Check recent heartbeat (within 5 minutes)
  if (node.lastHeartbeat) {
    const lastHeartbeatTime = new Date(node.lastHeartbeat);
    const minutesSinceHeartbeat = (Date.now() - lastHeartbeatTime.getTime()) / (1000 * 60);
    return minutesSinceHeartbeat <= 5;
  }
  
  // Fallback to last_seen check
  if (node.lastSeen) {
    const lastSeenTime = new Date(node.lastSeen);
    const minutesSinceLastSeen = (Date.now() - lastSeenTime.getTime()) / (1000 * 60);
    return minutesSinceLastSeen <= 5;
  }
  
  return false;
}

/**
 * Format node type name from ID
 * 
 * @param {string} typeId - Node type ID
 * @returns {string} Formatted name
 */
function formatNodeTypeName(typeId) {
  const typeNames = {
    'general': 'General Purpose',
    'compute': 'Compute Optimized',
    'storage': 'Storage Optimized',
    'ai': 'AI Training',
    'onion': 'Onion Routing',
    'privacy': 'Privacy Network'
  };
  
  return typeNames[typeId] || typeId.charAt(0).toUpperCase() + typeId.slice(1);
}

/**
 * Enhanced custom hook for handling node registration status and processes
 * 
 * @param {Object} wallet - Wallet object containing address and provider
 * @returns {Object} Registration status and handlers
 */
export default function useNodeRegistration(wallet) {
  // ==================== STATE MANAGEMENT ====================
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [nodesOverview, setNodesOverview] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  
  // Cache management
  const [cache, setCache] = useState({
    signature: null,
    nodeDetails: new Map(),
    performanceHistory: new Map()
  });
  
  // Refs for preventing memory leaks
  const mountedRef = useRef(true);
  const requestInProgressRef = useRef(false);
  
  // ==================== CACHE UTILITIES ====================
  
  /**
   * Check if cached data is still valid
   */
  const isCacheValid = useCallback((timestamp, ttl) => {
    if (!timestamp) return false;
    return (Date.now() - timestamp) < ttl;
  }, []);
  
  /**
   * Generate cache key
   */
  const getCacheKey = useCallback((type, ...params) => {
    return `${type}_${params.join('_')}`;
  }, []);
  
  // ==================== SIGNATURE MANAGEMENT ====================
  
  /**
   * Generate signature for API calls with caching
   */
  const generateSignature = useCallback(async () => {
    if (!wallet?.connected || !wallet?.address) {
      throw new Error('Wallet not connected');
    }

    // Check cache first
    if (cache.signature && isCacheValid(cache.signature.timestamp, CACHE_CONFIG.SIGNATURE)) {
      return cache.signature;
    }

    const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
    
    if (!messageResponse.success) {
      throw new Error(messageResponse.message || 'Failed to generate signature message');
    }

    const message = messageResponse.data.message;
    const formattedMessage = formatMessageForSigning(message);
    const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);
    
    const signatureData = { signature, message, timestamp: Date.now() };
    
    // Update cache
    setCache(prev => ({ ...prev, signature: signatureData }));
    
    return signatureData;
  }, [wallet?.connected, wallet?.address, wallet?.provider, cache.signature, isCacheValid]);

  // ==================== MAIN DATA FETCHING ====================
  
  /**
   * Refresh nodes overview using the API
   * Handles the exact data structure from the API documentation
   */
  const refreshNodesOverview = useCallback(async () => {
    if (!wallet?.connected || requestInProgressRef.current) return;
    
    requestInProgressRef.current = true;
    setLoading(true);
    setError(null);
    
    try {
      const { signature, message } = await generateSignature();
      
      // Get nodes overview with exact API structure
      const overviewResponse = await nodeRegistrationService.getUserNodesOverview(
        wallet.address,
        signature,
        message,
        'okx'
      );
      
      if (overviewResponse.success && overviewResponse.data) {
        const { summary, nodes: nodesByStatus, wallet_info, performance_stats } = overviewResponse.data;
        
        // Process nodes from grouped structure
        const allNodes = [];
        
        // Process online nodes (WebSocket connected AND status='active')
        if (nodesByStatus.online) {
          nodesByStatus.online.forEach(node => {
            allNodes.push(normalizeNodeData(node, 'api', CONNECTION_CATEGORY.ONLINE));
          });
        }
        
        // Process active nodes (status='active' BUT no WebSocket connection)
        if (nodesByStatus.active) {
          nodesByStatus.active.forEach(node => {
            allNodes.push(normalizeNodeData(node, 'api', CONNECTION_CATEGORY.ACTIVE));
          });
        }
        
        // Process offline nodes (all other statuses)
        if (nodesByStatus.offline) {
          nodesByStatus.offline.forEach(node => {
            allNodes.push(normalizeNodeData(node, 'api', CONNECTION_CATEGORY.OFFLINE));
          });
        }

        if (mountedRef.current) {
          setNodes(allNodes);
          setNodesOverview({
            summary: {
              ...summary,
              // Ensure numeric values
              total_nodes: summary.total_nodes || 0,
              online_nodes: summary.online_nodes || 0,
              active_nodes: summary.active_nodes || 0,
              offline_nodes: summary.offline_nodes || 0,
              real_time_connections: summary.real_time_connections || 0,
              total_earnings: parseFloat(summary.total_earnings || 0)
            },
            walletInfo: wallet_info,
            performanceStats: performance_stats,
            nodesByStatus, // Keep original grouped structure
            lastUpdate: new Date()
          });
          setLastRefresh(new Date());
        }
      } else {
        throw new Error(overviewResponse.message || 'Failed to fetch nodes overview');
      }
    } catch (err) {
      console.error('Error refreshing nodes overview:', err);
      
      // Handle "no nodes found" case gracefully
      if (err.message && (err.message.includes('No nodes found') || err.message.includes('no nodes'))) {
        if (mountedRef.current) {
          setNodes([]);
          setNodesOverview({
            summary: { 
              total_nodes: 0, 
              online_nodes: 0, 
              active_nodes: 0, 
              offline_nodes: 0,
              real_time_connections: 0,
              total_earnings: 0
            },
            walletInfo: { wallet_address: wallet.address, wallet_type: 'okx' },
            nodesByStatus: { online: [], active: [], offline: [] },
            lastUpdate: new Date()
          });
          setError(null);
        }
      } else {
        if (mountedRef.current) {
          setError(err.message || 'Failed to refresh nodes overview');
        }
      }
    } finally {
      requestInProgressRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [wallet?.connected, wallet?.address, generateSignature]);

  // ==================== NODE DETAIL METHODS ====================
  
  /**
   * Get detailed status for a specific node with caching
   */
  const getNodeDetailedStatus = useCallback(async (referenceCode) => {
    if (!wallet?.connected || !referenceCode) return null;
    
    // Check cache first
    const cacheKey = getCacheKey('details', referenceCode);
    const cached = cache.nodeDetails.get(cacheKey);
    
    if (cached && isCacheValid(cached.timestamp, CACHE_CONFIG.NODE_DETAILS)) {
      return cached.data;
    }

    try {
      const { signature, message } = await generateSignature();
      
      const detailsResponse = await nodeRegistrationService.getNodeDetailedStatus(
        wallet.address,
        signature,
        message,
        referenceCode,
        'okx'
      );
      
      if (detailsResponse.success && detailsResponse.data) {
        // Cache the result
        const newCache = new Map(cache.nodeDetails);
        newCache.set(cacheKey, {
          data: detailsResponse.data,
          timestamp: Date.now()
        });
        
        setCache(prev => ({ ...prev, nodeDetails: newCache }));
        
        return detailsResponse.data;
      }
      
      return null;
    } catch (err) {
      console.error('Error fetching node details:', err);
      return null;
    }
  }, [wallet?.connected, wallet?.address, generateSignature, cache.nodeDetails, getCacheKey, isCacheValid]);

  /**
   * Get performance history for a specific node with caching
   */
  const getNodePerformanceHistory = useCallback(async (referenceCode, hours = 24) => {
    if (!wallet?.connected || !referenceCode) return null;
    
    // Check cache first
    const cacheKey = getCacheKey('performance', referenceCode, hours);
    const cached = cache.performanceHistory.get(cacheKey);
    
    if (cached && isCacheValid(cached.timestamp, CACHE_CONFIG.PERFORMANCE_HISTORY)) {
      return cached.data;
    }

    try {
      const { signature, message } = await generateSignature();
      
      const performanceResponse = await nodeRegistrationService.getNodePerformanceHistory(
        wallet.address,
        signature,
        message,
        referenceCode,
        hours,
        'okx'
      );
      
      if (performanceResponse.success && performanceResponse.data) {
        // Cache the result
        const newCache = new Map(cache.performanceHistory);
        newCache.set(cacheKey, {
          data: performanceResponse.data,
          timestamp: Date.now()
        });
        
        setCache(prev => ({ ...prev, performanceHistory: newCache }));
        
        return performanceResponse.data;
      }
      
      return null;
    } catch (err) {
      console.error('Error fetching performance history:', err);
      return null;
    }
  }, [wallet?.connected, wallet?.address, generateSignature, cache.performanceHistory, getCacheKey, isCacheValid]);

  // ==================== UTILITY METHODS ====================
  
  /**
   * Update nodes from WebSocket data
   * Handles the flat array structure from WebSocket updates
   */
  const updateNodesFromWebSocket = useCallback((wsData) => {
    if (!wsData || !wsData.nodes) return;
    
    // WebSocket sends flat array, need to categorize
    const categorizedNodes = [];
    
    wsData.nodes.forEach(wsNode => {
      // Determine category based on connection status
      let category = CONNECTION_CATEGORY.OFFLINE;
      
      if (wsNode.connection?.connected && wsNode.status === NODE_STATUS.ACTIVE) {
        category = CONNECTION_CATEGORY.ONLINE;
      } else if (wsNode.status === NODE_STATUS.ACTIVE) {
        category = CONNECTION_CATEGORY.ACTIVE;
      }
      
      categorizedNodes.push(normalizeNodeData(wsNode, 'websocket', category));
    });
    
    if (mountedRef.current) {
      setNodes(categorizedNodes);
      
      // Update overview with WebSocket data
      setNodesOverview(prev => ({
        ...prev,
        summary: wsData.summary || prev?.summary,
        lastWebSocketUpdate: new Date()
      }));
    }
  }, []);
  
  /**
   * Clear cache for a specific node or all nodes
   */
  const clearCache = useCallback((referenceCode = null) => {
    if (referenceCode) {
      // Clear cache for specific node
      const detailsKey = getCacheKey('details', referenceCode);
      const newDetailsCache = new Map(cache.nodeDetails);
      newDetailsCache.delete(detailsKey);
      
      // Clear all performance history for this node
      const newPerfCache = new Map(cache.performanceHistory);
      for (const key of newPerfCache.keys()) {
        if (key.includes(referenceCode)) {
          newPerfCache.delete(key);
        }
      }
      
      setCache(prev => ({
        ...prev,
        nodeDetails: newDetailsCache,
        performanceHistory: newPerfCache
      }));
    } else {
      // Clear all cache except signature
      setCache(prev => ({
        ...prev,
        nodeDetails: new Map(),
        performanceHistory: new Map()
      }));
    }
  }, [cache.nodeDetails, cache.performanceHistory, getCacheKey]);

  /**
   * Get comprehensive statistics with real-time metrics
   * Based on exact API documentation definitions
   */
  const getStatistics = useCallback(() => {
    if (!nodesOverview || !nodes.length) {
      return {
        // Basic stats
        total: 0,
        online: 0,        // WebSocket connected AND status='active'
        active: 0,        // status='active' BUT no WebSocket
        offline: 0,       // All other statuses
        pending: 0,
        totalEarnings: 0,
        avgHealthScore: 0,
        
        // Real-time monitoring stats
        realtimeNodes: 0,
        totalHeartbeats: 0,
        avgCpuUsage: 0,
        avgMemoryUsage: 0,
        realTimeConnections: 0,
        
        // Additional stats
        nodesByType: {},
        nodesByStatus: {}
      };
    }

    // Use exact API summary values
    const summary = nodesOverview.summary;
    const performanceStats = nodesOverview.performanceStats;
    
    // Calculate real-time active nodes
    const realtimeNodes = nodes.filter(n => n.isRealtime);
    const totalHeartbeats = realtimeNodes.reduce((sum, n) => sum + (n.heartbeatCount || 0), 0);
    
    // Use performance stats from API if available
    const avgCpuUsage = performanceStats?.cpu?.average || 
      (realtimeNodes.length > 0 
        ? realtimeNodes.reduce((sum, n) => sum + (n.resources?.cpu?.usage || 0), 0) / realtimeNodes.length
        : 0);
    
    const avgMemoryUsage = performanceStats?.memory?.average || 
      (realtimeNodes.length > 0
        ? realtimeNodes.reduce((sum, n) => sum + (n.resources?.memory?.usage || 0), 0) / realtimeNodes.length
        : 0);
    
    // Calculate health scores
    const healthScores = nodes.map(node => {
      let score = 100;
      
      // Status-based scoring
      if (node.status === NODE_STATUS.OFFLINE) score -= 50;
      if (node.status === NODE_STATUS.PENDING) score -= 20;
      if (node.status === NODE_STATUS.SUSPENDED) score -= 70;
      
      // Connection-based scoring
      if (!node.isConnected && node.status === NODE_STATUS.ACTIVE) score -= 30;
      
      // Resource usage scoring
      if (node.resources?.cpu?.usage > 80) score -= 10;
      if (node.resources?.memory?.usage > 80) score -= 10;
      
      return Math.max(0, score);
    });
    
    const avgHealthScore = healthScores.length > 0 
      ? Math.round(healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length)
      : 0;
    
    // Count nodes by type
    const nodesByType = nodes.reduce((acc, node) => {
      acc[node.type] = (acc[node.type] || 0) + 1;
      return acc;
    }, {});
    
    // Count nodes by status
    const nodesByStatus = nodes.reduce((acc, node) => {
      acc[node.status] = (acc[node.status] || 0) + 1;
      return acc;
    }, {});

    return {
      // Basic stats from API summary (exact definitions)
      total: summary.total_nodes,
      online: summary.online_nodes,      // WebSocket connected AND status='active'
      active: summary.active_nodes,      // status='active' BUT no WebSocket
      offline: summary.offline_nodes,    // All other statuses
      pending: Math.max(0, summary.total_nodes - summary.online_nodes - summary.active_nodes - summary.offline_nodes),
      totalEarnings: summary.total_earnings,
      avgHealthScore,
      
      // Real-time monitoring stats
      realtimeNodes: realtimeNodes.length,
      totalHeartbeats,
      avgCpuUsage: Math.round(avgCpuUsage),
      avgMemoryUsage: Math.round(avgMemoryUsage),
      realTimeConnections: summary.real_time_connections || 0,
      
      // Additional stats
      nodesByType,
      nodesByStatus
    };
  }, [nodesOverview, nodes]);

  // ==================== LIFECYCLE MANAGEMENT ====================
  
  // Load nodes when wallet is connected
  useEffect(() => {
    mountedRef.current = true;
    
    if (wallet?.connected) {
      refreshNodesOverview();
    } else {
      // Clear data when wallet disconnected
      setNodes([]);
      setNodesOverview(null);
      setCache({
        signature: null,
        nodeDetails: new Map(),
        performanceHistory: new Map()
      });
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, [wallet?.connected, wallet?.address]);

  // ==================== PUBLIC API ====================
  
  return {
    // State
    loading,
    error,
    nodes,
    nodesOverview,
    lastRefresh,
    
    // Methods
    refreshNodesOverview,
    getNodeDetailedStatus,
    getNodePerformanceHistory,
    updateNodesFromWebSocket,
    clearCache,
    
    // Computed values
    statistics: getStatistics()
  };
}
