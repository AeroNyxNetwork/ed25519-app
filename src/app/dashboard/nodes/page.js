/**
 * Enhanced Nodes Management Page for AeroNyx Platform
 * Fixed version with correct imports and WebSocket integration
 * 
 * File Path: src/app/dashboard/nodes/page.js
 * 
 * @version 3.0.0
 * @author AeroNyx Development Team
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '../../../components/wallet/WalletProvider';
import { useWebSocketContext } from '../../../components/providers/WebSocketProvider';
import { useDashboard } from '../../../hooks/useDashboardData';
import NodeList from '../../../components/dashboard/NodeList';
import BlockchainIntegrationModule from '../../../components/dashboard/BlockchainIntegrationModule';
import QuickActionButton from '../../../components/dashboard/QuickActionButton';
import DashboardStatsCard from '../../../components/dashboard/DashboardStatsCard';
import RealTimeNodeMonitor from '../../../components/dashboard/RealTimeDashboard';
import nodeRegistrationService from '../../../lib/api/nodeRegistration';
import { useSignature } from '../../../hooks/useSignature';

/**
 * Enhanced Nodes Management Page
 * Now uses WebSocket for real-time data
 */
export default function NodesPage() {
  const router = useRouter();
  const { wallet } = useWallet();
  const { userMonitorService } = useWebSocketContext();
  const { signature, message } = useSignature('nodesPage');
  
  // ==================== STATE MANAGEMENT ====================
  
  const [selectedNode, setSelectedNode] = useState(null);
  const [blockchainModalOpen, setBlockchainModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [performanceAlerts, setPerformanceAlerts] = useState([]);

  // ==================== WEBSOCKET DATA HOOK ====================
  
  // Use the unified dashboard hook with WebSocket preference
  const {
    nodesOverview,
    stats,
    isInitialLoading,
    isRefreshing,
    error,
    dataSource,
    connectionHealth,
    isRealtime,
    lastUpdate,
    refresh,
    startRealtimeMonitoring,
    stopRealtimeMonitoring
  } = useDashboard({
    preferWebSocket: true,
    enableRESTFallback: true,
    onDataUpdate: handleDataUpdate,
    onError: handleDataError
  });

  // ==================== DATA PROCESSING ====================
  
  /**
   * Process nodes from overview data
   */
  const allNodes = useMemo(() => {
    if (!nodesOverview?.nodes) return [];
    
    const nodes = [];
    
    // Flatten grouped nodes from REST format
    if (nodesOverview.nodes.online) {
      nodes.push(...nodesOverview.nodes.online);
    }
    if (nodesOverview.nodes.active) {
      nodes.push(...nodesOverview.nodes.active);
    }
    if (nodesOverview.nodes.offline) {
      nodes.push(...nodesOverview.nodes.offline);
    }
    
    return nodes;
  }, [nodesOverview]);

  /**
   * Filter and search nodes
   */
  const filteredNodes = useMemo(() => {
    let nodes = allNodes;
    
    // Apply status filter
    if (filterStatus !== 'all') {
      nodes = nodes.filter(node => {
        if (filterStatus === 'online') {
          return node.is_connected && node.status === 'active';
        }
        if (filterStatus === 'active') {
          return !node.is_connected && node.status === 'active';
        }
        return node.status === filterStatus;
      });
    }
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      nodes = nodes.filter(node => 
        node.name?.toLowerCase().includes(query) ||
        node.reference_code?.toLowerCase().includes(query) ||
        node.id?.toString().includes(query)
      );
    }
    
    return nodes;
  }, [allNodes, filterStatus, searchQuery]);

  /**
   * Calculate additional statistics
   */
  const additionalStats = useMemo(() => {
    const totalTasks = allNodes.reduce((sum, node) => 
      sum + (node.tasks_completed || 0), 0
    );
    
    const avgHealthScore = allNodes.length > 0
      ? Math.round(allNodes.reduce((sum, node) => {
          let score = 100;
          if (node.status === 'offline') score -= 50;
          if (node.status === 'pending') score -= 20;
          const cpuUsage = node.performance?.cpu_usage || 0;
          const memoryUsage = node.performance?.memory_usage || 0;
          if (cpuUsage > 80) score -= 10;
          if (memoryUsage > 80) score -= 10;
          return sum + Math.max(0, score);
        }, 0) / allNodes.length)
      : 0;
    
    return {
      totalTasks,
      avgHealthScore,
      networkContribution: stats.networkContribution || '0%'
    };
  }, [allNodes, stats]);

  // ==================== EVENT HANDLERS ====================
  
  /**
   * Handle data updates from WebSocket/REST
   */
  function handleDataUpdate(data, source) {
    console.log(`[NodesPage] Data updated from ${source}`);
    
    // Check for performance alerts
    if (data.nodes) {
      const alerts = [];
      data.nodes.forEach(node => {
        if (node.performance?.cpu_usage > 90) {
          alerts.push({
            nodeId: node.reference_code,
            message: `High CPU usage on ${node.name}`,
            severity: 'critical',
            timestamp: new Date()
          });
        }
        if (node.performance?.memory_usage > 90) {
          alerts.push({
            nodeId: node.reference_code,
            message: `High memory usage on ${node.name}`,
            severity: 'critical',
            timestamp: new Date()
          });
        }
      });
      
      if (alerts.length > 0) {
        setPerformanceAlerts(prev => [...prev, ...alerts].slice(-10));
      }
    }
  }
  
  /**
   * Handle data errors
   */
  function handleDataError(error, source) {
    console.error(`[NodesPage] Error from ${source}:`, error);
  }

  /**
   * Handle blockchain integration
   */
  const handleBlockchainIntegrate = useCallback((node) => {
    setSelectedNode(node);
    setBlockchainModalOpen(true);
  }, []);

  /**
   * Handle node details request
   */
  const handleNodeDetails = useCallback(async (referenceCode) => {
    if (!signature || !message) return null;
    
    try {
      const response = await nodeRegistrationService.getNodeDetailedStatus(
        wallet.address,
        signature,
        message,
        referenceCode,
        'okx'
      );
      
      return response.success ? response.data : null;
    } catch (error) {
      console.error('Failed to fetch node details:', error);
      return null;
    }
  }, [wallet.address, signature, message]);

  /**
   * Clear performance alerts
   */
  const clearAlerts = useCallback(() => {
    setPerformanceAlerts([]);
  }, []);

  /**
   * Toggle real-time monitoring
   */
  const toggleRealtimeMonitoring = useCallback(() => {
    if (isRealtime) {
      stopRealtimeMonitoring();
    } else {
      startRealtimeMonitoring();
    }
  }, [isRealtime, startRealtimeMonitoring, stopRealtimeMonitoring]);

  // ==================== LIFECYCLE ====================
  
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
    }
  }, [wallet.connected, router]);

  // ==================== RENDER ====================
  
  if (!wallet.connected) {
    return null;
  }

  if (isInitialLoading) {
    return (
      <div className="container-custom mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-400">Loading nodes data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-custom mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">My Nodes</h1>
            <p className="text-gray-400">
              Manage and monitor your AeroNyx network nodes
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {/* Real-time Monitoring Toggle */}
            <button
              onClick={toggleRealtimeMonitoring}
              className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${
                isRealtime 
                  ? 'bg-green-900/30 text-green-400 border border-green-800' 
                  : 'bg-background-100 text-gray-400 hover:bg-background-200'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${
                isRealtime ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
              }`}></div>
              {isRealtime ? 'Live Monitoring' : 'Enable Live Updates'}
            </button>
            
            {/* Refresh Button */}
            <button
              onClick={() => refresh(true)}
              disabled={isRefreshing}
              className="button-outline flex items-center gap-2"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} 
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            
            {/* Register New Node Button */}
            <QuickActionButton
              href="/dashboard/register"
              icon="plus"
              title="Register Node"
              description="Add new node"
              color="primary"
              className="h-auto py-2"
            />
          </div>
        </div>
      </div>

      {/* Connection Status Bar */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-red-400">{error.message || 'Failed to load nodes data'}</span>
          </div>
        </div>
      )}

      {/* Real-time Monitor */}
      <RealTimeNodeMonitor
        nodes={allNodes}
        performanceAlerts={performanceAlerts}
        lastUpdate={lastUpdate}
        updateSource={dataSource}
        connectionStatus={connectionHealth}
        onClearAlerts={clearAlerts}
      />

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <DashboardStatsCard
          icon="servers"
          title="Total Nodes"
          value={stats.totalNodes}
          subtitle={`${stats.activeNodes} active, ${stats.offlineNodes} offline`}
          color="primary"
        />
        
        <DashboardStatsCard
          icon="status"
          title="Online Nodes"
          value={stats.activeNodes}
          subtitle={`${stats.activeNodes > 0 ? Math.round((stats.activeNodes / stats.totalNodes) * 100) : 0}% of total`}
          color="success"
          trend={stats.activeNodes > 0 ? 'up' : 'stable'}
        />
        
        <DashboardStatsCard
          icon="performance"
          title="Avg Health Score"
          value={`${additionalStats.avgHealthScore}%`}
          subtitle="Overall node health"
          color={additionalStats.avgHealthScore >= 80 ? 'success' : 
                 additionalStats.avgHealthScore >= 60 ? 'warning' : 'error'}
        />
        
        <DashboardStatsCard
          icon="network"
          title="Network Contribution"
          value={additionalStats.networkContribution}
          subtitle="Your share of the network"
          color="accent"
        />
      </div>

      {/* Filters and Search */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        {/* Search Bar */}
        <div className="flex-1">
          <div className="relative">
            <input
              type="text"
              placeholder="Search nodes by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pl-10 bg-background-100 border border-background-200 rounded-lg focus:outline-none focus:border-primary"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-2.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
        
        {/* Status Filter */}
        <div className="flex gap-2">
          {['all', 'online', 'active', 'offline', 'pending'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-md capitalize transition-colors ${
                filterStatus === status
                  ? 'bg-primary text-white'
                  : 'bg-background-100 text-gray-300 hover:bg-background-200'
              }`}
            >
              {status === 'all' ? 'All' : status}
              {status !== 'all' && (
                <span className="ml-2 text-xs opacity-80">
                  ({status === 'online' ? stats.activeNodes :
                    status === 'active' ? allNodes.filter(n => !n.is_connected && n.status === 'active').length :
                    status === 'offline' ? stats.offlineNodes :
                    status === 'pending' ? stats.pendingNodes : 0})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Nodes List */}
      {filteredNodes.length > 0 ? (
        <NodeList 
          nodes={filteredNodes}
          onBlockchainIntegrate={handleBlockchainIntegrate}
          onNodeDetails={handleNodeDetails}
        />
      ) : (
        <div className="card glass-effect p-12 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mx-auto mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
          
          {searchQuery || filterStatus !== 'all' ? (
            <>
              <h3 className="text-xl font-bold mb-2">No nodes found</h3>
              <p className="text-gray-400 mb-6">
                No nodes match your search criteria. Try adjusting your filters.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('all');
                }}
                className="button-outline"
              >
                Clear Filters
              </button>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold mb-2">No nodes registered yet</h3>
              <p className="text-gray-400 mb-6">
                Get started by registering your first node to join the AeroNyx network.
              </p>
              <QuickActionButton
                href="/dashboard/register"
                icon="plus"
                title="Register Your First Node"
                description="Join the network"
                color="primary"
                className="mx-auto max-w-sm"
              />
            </>
          )}
        </div>
      )}

      {/* Blockchain Integration Modal */}
      <BlockchainIntegrationModule
        isOpen={blockchainModalOpen}
        onClose={() => {
          setBlockchainModalOpen(false);
          setSelectedNode(null);
        }}
        selectedNode={selectedNode}
      />

      {/* Data Source Indicator */}
      <div className="mt-8 text-center text-xs text-gray-500">
        Data source: {dataSource === 'websocket' ? '🔄 Real-time WebSocket' : 
                     dataSource === 'cache' ? '💾 Cached' : '📡 REST API'} 
        {lastUpdate && ` • Last updated: ${lastUpdate.toLocaleTimeString()}`}
      </div>
    </div>
  );
}
