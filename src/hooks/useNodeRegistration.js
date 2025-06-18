/**
 * Enhanced Node Registration Hook for AeroNyx Platform
 * 
 * File Path: src/hooks/useNodeRegistration.js
 * 
 * Production-ready hook for handling node registration status and processes
 * with accurate data mapping based on actual API responses.
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-18
 */

import { useState, useEffect, useCallback } from 'react';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../lib/utils/walletSignature';

/**
 * Normalize node data from REST API response
 * 
 * @param {Object} node - Raw node data from API
 * @param {string} source - Data source identifier ('api' or 'websocket')
 * @returns {Object} Normalized node data
 */
function normalizeNodeData(node, source = 'api') {
  const now = new Date();
  
  // Handle different data structures between REST API and WebSocket
  const baseNode = {
    id: node.id || node.reference_code,
    referenceCode: node.reference_code,
    name: node.name || 'Unnamed Node',
    status: node.status,
    createdAt: node.created_at,
    lastSeen: node.last_seen, // Correct field name from API
    uptime: node.uptime || '0 days, 0 hours',
    earnings: parseFloat(node.earnings || 0),
    
    // Node type handling
    type: typeof node.node_type === 'object' 
      ? node.node_type.id 
      : node.node_type || 'general',
    nodeTypeInfo: typeof node.node_type === 'object'
      ? node.node_type
      : { id: node.node_type || 'general', name: 'General Purpose' },
    
    // Connection status from API (exact field names)
    isConnected: node.is_connected || false,
    connectionStatus: node.connection_status || 'offline',
    
    // Additional fields for enhanced functionality
    activatedAt: node.activated_at,
    registrationStatus: node.registration_status || {},
    
    // Metadata
    source,
    lastUpdate: now
  };

  // Handle performance data - different structures for REST vs WebSocket
  if (source === 'api') {
    baseNode.resources = transformAPIResources(node.performance);
    
    // Connection details from REST API
    if (node.connection_details) {
      baseNode.heartbeatCount = node.connection_details.heartbeat_count || 0;
      baseNode.lastHeartbeat = node.connection_details.last_heartbeat;
      baseNode.connectionDuration = node.connection_details.connection_duration_seconds;
      baseNode.offlineDuration = node.connection_details.offline_duration_formatted;
    }
  } else if (source === 'websocket') {
    baseNode.resources = transformWebSocketResources(node.performance);
    
    // Connection details from WebSocket
    if (node.connection) {
      baseNode.isConnected = node.connection.connected || false;
      baseNode.heartbeatCount = node.connection.heartbeat_count || 0;
      baseNode.lastHeartbeat = node.connection.last_heartbeat;
    }
  }

  // Calculate real-time status for monitoring
  baseNode.isRealtime = calculateRealTimeStatus(baseNode);
  
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
 * @returns {boolean} Whether node is real-time active
 */
function calculateRealTimeStatus(node) {
  // Must be connected via WebSocket
  if (!node.isConnected || node.connectionStatus !== 'online') {
    return false;
  }
  
  // Must have active status
  if (node.status !== 'active') {
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
 * Enhanced custom hook for handling node registration status and processes
 * 
 * @param {Object} wallet - Wallet information containing address and provider
 * @returns {Object} Registration status and handlers
 */
export default function useNodeRegistration(wallet) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [nodesOverview, setNodesOverview] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState({});
  const [performanceCache, setPerformanceCache] = useState({});
  
  // Load nodes when wallet is connected
  useEffect(() => {
    if (wallet?.connected) {
      refreshNodesOverview();
    } else {
      // Clear data when wallet disconnected
      setNodes([]);
      setNodesOverview(null);
      setSelectedNodeDetails({});
      setPerformanceCache({});
    }
  }, [wallet?.connected, wallet?.address]);
  
  /**
   * Generate signature for API calls with caching
   */
  const generateSignature = useCallback(async () => {
    if (!wallet?.connected || !wallet?.address) {
      throw new Error('Wallet not connected');
    }

    const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
    
    if (!messageResponse.success) {
      throw new Error(messageResponse.message || 'Failed to generate signature message');
    }

    const message = messageResponse.data.message;
    const formattedMessage = formatMessageForSigning(message);
    
    const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);
    
    return { signature, message };
  }, [wallet?.connected, wallet?.address, wallet?.provider]);

  /**
   * Refresh nodes overview using the API
   */
  const refreshNodesOverview = useCallback(async () => {
    if (!wallet?.connected) return;
    
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
        
        // Combine all nodes from different status categories with proper structure
        const allNodes = [
          ...(nodesByStatus.online || []).map(node => ({ ...node, _category: 'online' })),
          ...(nodesByStatus.active || []).map(node => ({ ...node, _category: 'active' })),
          ...(nodesByStatus.offline || []).map(node => ({ ...node, _category: 'offline' }))
        ];

        // Transform nodes using exact API structure
        const transformedNodes = allNodes.map(node => normalizeNodeData(node, 'api'));

        setNodes(transformedNodes);
        setNodesOverview({
          summary: {
            ...summary,
            // Use exact values from API response
            total_nodes: summary.total_nodes || 0,
            online_nodes: summary.online_nodes || 0,
            active_nodes: summary.active_nodes || 0,
            offline_nodes: summary.offline_nodes || 0,
            real_time_connections: summary.real_time_connections || 0,
            total_earnings: parseFloat(summary.total_earnings || 0)
          },
          walletInfo: wallet_info,
          performanceStats: performance_stats
        });
      } else {
        throw new Error(overviewResponse.message || 'Failed to fetch nodes overview');
      }
      
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error refreshing nodes overview:', err);
      setError(err.message || 'Failed to refresh nodes overview');
      
      // Handle "no nodes found" case
      if (err.message && (err.message.includes('No nodes found') || err.message.includes('no nodes'))) {
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
          walletInfo: { wallet_address: wallet.address, wallet_type: 'okx' }
        });
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [wallet?.connected, wallet?.address, generateSignature]);

  /**
   * Get detailed status for a specific node
   */
  const getNodeDetailedStatus = useCallback(async (referenceCode) => {
    if (!wallet?.connected || !referenceCode) return null;
    
    // Check cache first (1 minute TTL)
    const cacheKey = `${referenceCode}_details`;
    const cached = selectedNodeDetails[cacheKey];
    if (cached && (Date.now() - cached.timestamp) < 60000) {
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
        setSelectedNodeDetails(prev => ({
          ...prev,
          [cacheKey]: {
            data: detailsResponse.data,
            timestamp: Date.now()
          }
        }));
        
        return detailsResponse.data;
      }
      
      return null;
    } catch (err) {
      console.error('Error fetching node details:', err);
      return null;
    }
  }, [wallet?.connected, wallet?.address, generateSignature, selectedNodeDetails]);

  /**
   * Get performance history for a specific node
   */
  const getNodePerformanceHistory = useCallback(async (referenceCode, hours = 24) => {
    if (!wallet?.connected || !referenceCode) return null;
    
    // Check cache first (5 minute TTL)
    const cacheKey = `${referenceCode}_perf_${hours}h`;
    const cached = performanceCache[cacheKey];
    if (cached && (Date.now() - cached.timestamp) < 300000) {
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
        setPerformanceCache(prev => ({
          ...prev,
          [cacheKey]: {
            data: performanceResponse.data,
            timestamp: Date.now()
          }
        }));
        
        return performanceResponse.data;
      }
      
      return null;
    } catch (err) {
      console.error('Error fetching performance history:', err);
      return null;
    }
  }, [wallet?.connected, wallet?.address, generateSignature, performanceCache]);

  /**
   * Check a specific node's status (legacy compatibility)
   */
  const checkNodeStatus = useCallback(async (referenceCode) => {
    if (!wallet?.connected || !referenceCode) return null;
    
    try {
      const statusResponse = await nodeRegistrationService.checkNodeStatus(
        referenceCode,
        wallet.address
      );
      
      if (statusResponse.success && statusResponse.data) {
        return statusResponse.data;
      }
      
      return null;
    } catch (err) {
      console.error('Error checking node status:', err);
      return null;
    }
  }, [wallet?.connected, wallet?.address]);

  /**
   * Clear cache for a specific node or all nodes
   */
  const clearCache = useCallback((referenceCode = null) => {
    if (referenceCode) {
      // Clear cache for specific node
      setSelectedNodeDetails(prev => {
        const newDetails = { ...prev };
        Object.keys(newDetails).forEach(key => {
          if (key.startsWith(`${referenceCode}_`)) {
            delete newDetails[key];
          }
        });
        return newDetails;
      });
      
      setPerformanceCache(prev => {
        const newCache = { ...prev };
        Object.keys(newCache).forEach(key => {
          if (key.startsWith(`${referenceCode}_`)) {
            delete newCache[key];
          }
        });
        return newCache;
      });
    } else {
      // Clear all cache
      setSelectedNodeDetails({});
      setPerformanceCache({});
    }
  }, []);

  /**
   * Get comprehensive statistics with real-time metrics
   */
  const getStatistics = useCallback(() => {
    if (!nodesOverview || !nodes.length) {
      return {
        // Basic stats
        total: 0,
        online: 0,
        offline: 0,
        pending: 0,
        totalEarnings: 0,
        avgHealthScore: 0,
        
        // Real-time monitoring stats
        realtimeNodes: 0,
        totalHeartbeats: 0,
        avgCpuUsage: 0,
        avgMemoryUsage: 0,
        realTimeConnections: 0
      };
    }

    // Use exact API summary values
    const summary = nodesOverview.summary;
    const performanceStats = nodesOverview.performanceStats;
    
    // Calculate real-time active nodes
    const realtimeNodes = nodes.filter(n => n.isRealtime);
    const totalHeartbeats = realtimeNodes.reduce((sum, n) => sum + (n.heartbeatCount || 0), 0);
    
    // Use performance stats from API if available
    const avgCpuUsage = performanceStats?.cpu?.average || 0;
    const avgMemoryUsage = performanceStats?.memory?.average || 0;
    
    // Calculate health scores
    const healthScores = nodes.map(node => {
      let score = 100;
      if (node.status === 'offline') score -= 50;
      if (node.status === 'pending') score -= 20;
      if (!node.isConnected) score -= 30;
      if (node.resources?.cpu?.usage > 80) score -= 10;
      if (node.resources?.memory?.usage > 80) score -= 10;
      return Math.max(0, score);
    });
    
    const avgHealthScore = healthScores.length > 0 
      ? Math.round(healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length)
      : 0;

    return {
      // Basic stats from API summary
      total: summary.total_nodes,
      online: summary.online_nodes,
      offline: summary.offline_nodes,
      pending: Math.max(0, summary.total_nodes - summary.online_nodes - summary.active_nodes - summary.offline_nodes),
      totalEarnings: summary.total_earnings,
      avgHealthScore,
      
      // Real-time monitoring stats
      realtimeNodes: realtimeNodes.length,
      totalHeartbeats,
      avgCpuUsage: Math.round(avgCpuUsage),
      avgMemoryUsage: Math.round(avgMemoryUsage),
      realTimeConnections: summary.real_time_connections || 0
    };
  }, [nodesOverview, nodes]);

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
    checkNodeStatus,
    clearCache,
    
    // Computed values
    statistics: getStatistics()
  };
}
