/**
 * src/hooks/useNodeRegistration.js
 * Enhanced custom hook for handling node registration and monitoring with new APIs
 */

import { useState, useEffect, useCallback } from 'react';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../lib/utils/walletSignature';

/**
 * Enhanced custom hook for handling node registration status and processes
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
   * Refresh nodes overview using the new API
   */
  const refreshNodesOverview = useCallback(async () => {
    if (!wallet?.connected) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { signature, message } = await generateSignature();
      
      // Get nodes overview
      const overviewResponse = await nodeRegistrationService.getUserNodesOverview(
        wallet.address,
        signature,
        message,
        'okx'
      );
      
      if (overviewResponse.success && overviewResponse.data) {
        const { summary, nodes: nodesByStatus } = overviewResponse.data;
        
        // Combine all nodes from different status categories
        const allNodes = [
          ...(nodesByStatus.online || []),
          ...(nodesByStatus.active || []),
          ...(nodesByStatus.offline || [])
        ];

        // Transform nodes to match component expectations
        const transformedNodes = allNodes.map(node => ({
          id: node.reference_code || node.id,
          name: node.name || 'Unnamed Node',
          status: node.status,
          type: node.node_type || 'general',
          registeredDate: node.created_at || new Date().toISOString(),
          lastSeen: node.last_heartbeat || null,
          uptime: calculateUptime(node.last_heartbeat, node.created_at),
          earnings: node.total_earnings || 0,
          resources: transformResources(node.resources),
          blockchainIntegrations: node.blockchain_integrations || [],
          referenceCode: node.reference_code,
          // Additional fields from API
          totalTasks: node.total_tasks || 0,
          completedTasks: node.completed_tasks || 0,
          nodeVersion: node.node_version || 'Unknown',
          publicIp: node.public_ip || null
        }));

        setNodes(transformedNodes);
        setNodesOverview({
          summary,
          walletInfo: overviewResponse.data.wallet_info
        });
      } else {
        throw new Error(overviewResponse.message || 'Failed to fetch nodes overview');
      }
      
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error refreshing nodes overview:', err);
      setError(err.message || 'Failed to refresh nodes overview');
      
      // If it's a "no nodes found" error, set empty state instead of error
      if (err.message && (err.message.includes('No nodes found') || err.message.includes('no nodes'))) {
        setNodes([]);
        setNodesOverview({
          summary: { total_nodes: 0, online_nodes: 0, active_nodes: 0, offline_nodes: 0 },
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
    
    // Check cache first
    const cacheKey = `${referenceCode}_details`;
    const cached = selectedNodeDetails[cacheKey];
    if (cached && (Date.now() - cached.timestamp) < 60000) { // 1 minute cache
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
    
    // Check cache first
    const cacheKey = `${referenceCode}_perf_${hours}h`;
    const cached = performanceCache[cacheKey];
    if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 minute cache
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
   * Check a specific node's status (legacy method, kept for compatibility)
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
   * Helper function to calculate uptime
   */
  const calculateUptime = useCallback((lastHeartbeat, createdAt) => {
    if (!lastHeartbeat || !createdAt) return '0 days, 0 hours';
    
    const now = new Date();
    const created = new Date(createdAt);
    const lastSeen = new Date(lastHeartbeat);
    
    // If last heartbeat is too old, consider offline
    const isOnline = (now - lastSeen) < (10 * 60 * 1000); // 10 minutes
    
    if (!isOnline) return '0 days, 0 hours';
    
    const diffMs = now - created;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days} days, ${hours} hours`;
  }, []);

  /**
   * Helper function to transform resource data
   */
  const transformResources = useCallback((resources) => {
    if (!resources) {
      return {
        cpu: { total: 'Unknown', usage: 0 },
        memory: { total: 'Unknown', usage: 0 },
        storage: { total: 'Unknown', usage: 0 },
        bandwidth: { total: 'Unknown', usage: 0 }
      };
    }

    return {
      cpu: {
        total: resources.cpu_cores ? `${resources.cpu_cores} cores` : 'Unknown',
        usage: resources.cpu_usage || 0
      },
      memory: {
        total: resources.memory_gb ? `${resources.memory_gb} GB` : 'Unknown',
        usage: resources.memory_usage || 0
      },
      storage: {
        total: resources.storage_gb ? `${resources.storage_gb} GB` : 'Unknown',
        usage: resources.storage_usage || 0
      },
      bandwidth: {
        total: resources.bandwidth_mbps ? `${resources.bandwidth_mbps} Mbps` : 'Unknown',
        usage: resources.bandwidth_usage || 0
      }
    };
  }, []);

  /**
   * Get summary statistics
   */
  const getStatistics = useCallback(() => {
    if (!nodesOverview || !nodes.length) {
      return {
        total: 0,
        online: 0,
        offline: 0,
        pending: 0,
        totalEarnings: 0,
        avgHealthScore: 0
      };
    }

    const totalEarnings = nodes.reduce((sum, node) => sum + (node.earnings || 0), 0);
    
    // Calculate average health score (simplified)
    const healthScores = nodes.map(node => {
      let score = 100;
      if (node.status === 'offline') score -= 50;
      if (node.status === 'pending') score -= 20;
      if (node.resources?.cpu?.usage > 80) score -= 10;
      if (node.resources?.memory?.usage > 80) score -= 10;
      return Math.max(0, score);
    });
    
    const avgHealthScore = healthScores.length > 0 
      ? Math.round(healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length)
      : 0;

    return {
      total: nodesOverview.summary.total_nodes || 0,
      online: nodesOverview.summary.online_nodes || 0,
      offline: nodesOverview.summary.offline_nodes || 0,
      pending: Math.max(0, (nodesOverview.summary.total_nodes || 0) - (nodesOverview.summary.online_nodes || 0) - (nodesOverview.summary.offline_nodes || 0)),
      totalEarnings,
      avgHealthScore
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
