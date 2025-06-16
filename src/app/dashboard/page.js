/**
 * Enhanced AeroNyx Dashboard Page with Real API Integration
 * 
 * File Path: src/app/dashboard/page.js
 * 
 * This component provides a comprehensive dashboard interface that integrates
 * with real API endpoints to display accurate node statistics, user overview,
 * and system performance metrics. Replaces mock data with live data from
 * the AeroNyx backend services.
 * 
 * Features:
 * - Real-time node statistics from API
 * - Live user nodes overview integration
 * - Performance metrics tracking
 * - Comprehensive error handling with fallback states
 * - Intelligent caching for optimal performance
 * - Responsive design for all screen sizes
 * - Production-ready error boundaries
 * 
 * API Integration:
 * - getUserNodesOverview: Primary data source for dashboard statistics
 * - Real-time status monitoring and updates
 * - Cached performance data with automatic refresh
 * - Wallet signature authentication for secure access
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-01
 */

'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../components/layout/Header';
import { useWallet } from '../../components/wallet/WalletProvider';
import NodeStatusCard from '../../components/dashboard/NodeStatusCard';
import DashboardStatsCard from '../../components/dashboard/DashboardStatsCard';
import QuickActionButton from '../../components/dashboard/QuickActionButton';
import Link from 'next/link';
import nodeRegistrationService from '../../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../../lib/utils/walletSignature';

/**
 * Constants for configuration and timing
 */
const REFRESH_INTERVALS = {
  DASHBOARD_DATA: 30 * 1000,     // 30 seconds for dashboard overview
  NODE_STATUS: 15 * 1000,        // 15 seconds for individual node status
  PERFORMANCE_METRICS: 60 * 1000  // 1 minute for performance data
};

const CACHE_DURATION = {
  DASHBOARD_OVERVIEW: 5 * 60 * 1000,  // 5 minutes
  USER_STATS: 2 * 60 * 1000           // 2 minutes
};

const ERROR_MESSAGES = {
  WALLET_NOT_CONNECTED: 'Wallet connection required',
  SIGNATURE_FAILED: 'Authentication signature failed',
  API_UNAVAILABLE: 'AeroNyx services temporarily unavailable',
  NETWORK_ERROR: 'Network connection error',
  DATA_PARSING_ERROR: 'Invalid data received from server'
};

/**
 * Enhanced Dashboard Component with Real API Integration
 */
export default function EnhancedDashboard() {
  const { wallet } = useWallet();
  const router = useRouter();

  // ==================== STATE MANAGEMENT ====================
  
  // Core data state
  const [dashboardData, setDashboardData] = useState(null);
  const [nodesOverview, setNodesOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  
  // UI state
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  
  // Cache state
  const [dataCache, setDataCache] = useState(new Map());
  
  // Performance tracking state
  const [performanceMetrics, setPerformanceMetrics] = useState({
    apiResponseTime: null,
    lastUpdateDuration: null,
    successfulRequests: 0,
    failedRequests: 0
  });

  // ==================== LIFECYCLE HOOKS ====================
  
  /**
   * Effect: Handle wallet connection and initial data loading
   */
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
      return;
    }

    // Load initial dashboard data
    fetchDashboardData();
    
    // Setup auto-refresh interval if enabled
    let refreshInterval;
    if (autoRefreshEnabled) {
      refreshInterval = setInterval(() => {
        if (wallet.connected && !isLoading) {
          fetchDashboardData(true); // Silent refresh
        }
      }, REFRESH_INTERVALS.DASHBOARD_DATA);
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [wallet.connected, wallet.address, autoRefreshEnabled]);

  // ==================== DATA FETCHING METHODS ====================
  
  /**
   * Fetch comprehensive dashboard data from multiple API endpoints
   * 
   * @param {boolean} silentRefresh - Whether to suppress loading states
   */
  const fetchDashboardData = useCallback(async (silentRefresh = false) => {
    if (!wallet.connected || !wallet.address) {
      setError(ERROR_MESSAGES.WALLET_NOT_CONNECTED);
      setIsLoading(false);
      return;
    }

    // Check cache first for non-silent refreshes
    const cacheKey = `dashboard_${wallet.address}`;
    const cachedData = dataCache.get(cacheKey);
    
    if (!silentRefresh && cachedData && isCacheValid(cachedData, CACHE_DURATION.DASHBOARD_OVERVIEW)) {
      setDashboardData(cachedData.data);
      setNodesOverview(cachedData.overview);
      setIsLoading(false);
      return;
    }

    if (!silentRefresh) {
      setIsLoading(true);
    } else {
      setRefreshing(true);
    }
    
    setError(null);
    
    const startTime = performance.now();

    try {
      // Step 1: Generate signature for API authentication
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || ERROR_MESSAGES.SIGNATURE_FAILED);
      }

      const message = messageResponse.data.message;
      const formattedMessage = formatMessageForSigning(message);
      const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);

      // Step 2: Fetch user nodes overview (primary data source)
      const overviewResponse = await nodeRegistrationService.getUserNodesOverview(
        wallet.address,
        signature,
        message,
        'okx'
      );

      if (overviewResponse.success && overviewResponse.data) {
        const apiResponseTime = performance.now() - startTime;
        
        // Process and transform the API response
        const processedData = await processDashboardData(overviewResponse.data);
        
        // Cache the successful response
        const newCache = new Map(dataCache);
        newCache.set(cacheKey, {
          data: processedData,
          overview: overviewResponse.data,
          timestamp: Date.now()
        });
        setDataCache(newCache);
        
        // Update state
        setDashboardData(processedData);
        setNodesOverview(overviewResponse.data);
        setLastRefresh(new Date());
        
        // Update performance metrics
        setPerformanceMetrics(prev => ({
          ...prev,
          apiResponseTime: Math.round(apiResponseTime),
          lastUpdateDuration: Math.round(performance.now() - startTime),
          successfulRequests: prev.successfulRequests + 1
        }));
        
      } else {
        throw new Error(overviewResponse.message || ERROR_MESSAGES.API_UNAVAILABLE);
      }

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      handleFetchError(err);
      
      // Update performance metrics for failed requests
      setPerformanceMetrics(prev => ({
        ...prev,
        failedRequests: prev.failedRequests + 1
      }));
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [wallet.connected, wallet.address, wallet.provider, dataCache]);

  /**
   * Process and transform API data for dashboard consumption
   * 
   * @param {Object} apiData - Raw API response data
   * @returns {Object} Processed dashboard data
   */
  const processDashboardData = useCallback(async (apiData) => {
    const { summary, nodes: nodesByStatus } = apiData;
    
    // Combine all nodes from different status categories
    const allNodes = [
      ...(nodesByStatus.online || []),
      ...(nodesByStatus.active || []),
      ...(nodesByStatus.offline || [])
    ];

    // Transform nodes for dashboard display
    const transformedNodes = allNodes.slice(0, 4).map(transformNodeForDashboard);

    // Calculate comprehensive statistics
    const stats = calculateDashboardStats(summary, allNodes);
    
    // Calculate network contribution (estimated based on active nodes)
    const networkContribution = calculateNetworkContribution(allNodes);
    
    // Calculate resource utilization
    const resourceUtilization = calculateResourceUtilization(allNodes);

    return {
      stats: {
        ...stats,
        networkContribution,
        resourceUtilization
      },
      nodes: transformedNodes,
      timestamp: new Date().toISOString(),
      source: 'api'
    };
  }, []);

  /**
   * Transform individual node data for dashboard card display
   * 
   * @param {Object} node - Raw node data from API
   * @returns {Object} Transformed node data
   */
  const transformNodeForDashboard = useCallback((node) => ({
    id: node.reference_code || node.id || `node-${Date.now()}-${Math.random()}`,
    name: node.name || 'Unnamed Node',
    status: normalizeNodeStatus(node.status),
    type: node.node_type?.id || node.node_type || 'general',
    deviceId: node.reference_code || node.id,
    uptime: calculateNodeUptime(node.last_seen, node.created_at),
    earnings: parseFloat(node.earnings || 0),
    cpu: calculateResourceUsage(node.performance?.cpu_usage),
    memory: calculateResourceUsage(node.performance?.memory_usage),
    lastSeen: node.last_seen,
    createdAt: node.created_at,
    isConnected: node.is_connected || false,
    totalTasks: node.total_tasks || 0,
    completedTasks: node.completed_tasks || 0
  }), []);

  /**
   * Calculate comprehensive dashboard statistics
   * 
   * @param {Object} summary - API summary data
   * @param {Array} allNodes - All user nodes
   * @returns {Object} Dashboard statistics
   */
  const calculateDashboardStats = useCallback((summary, allNodes) => {
    const totalNodes = summary.total_nodes || allNodes.length;
    const activeNodes = summary.online_nodes || summary.active_nodes || 0;
    const offlineNodes = summary.offline_nodes || 0;
    const pendingNodes = Math.max(0, totalNodes - activeNodes - offlineNodes);
    
    // Calculate total earnings from all nodes
    const totalEarnings = allNodes.reduce((sum, node) => {
      const earnings = parseFloat(node.earnings || 0);
      return sum + earnings;
    }, 0);

    return {
      totalNodes,
      activeNodes,
      pendingNodes,
      offlineNodes,
      totalEarnings: parseFloat(totalEarnings.toFixed(4))
    };
  }, []);

  /**
   * Calculate estimated network contribution
   * 
   * @param {Array} allNodes - All user nodes
   * @returns {string} Network contribution percentage
   */
  const calculateNetworkContribution = useCallback((allNodes) => {
    // Simplified calculation based on active nodes
    // In production, this would come from network-wide statistics
    const activeNodes = allNodes.filter(node => 
      node.status === 'online' || node.status === 'active'
    ).length;
    
    // Estimated contribution based on active nodes (placeholder calculation)
    const estimatedContribution = (activeNodes * 0.0015).toFixed(4);
    return `${estimatedContribution}%`;
  }, []);

  /**
   * Calculate overall resource utilization
   * 
   * @param {Array} allNodes - All user nodes
   * @returns {number} Resource utilization percentage
   */
  const calculateResourceUtilization = useCallback((allNodes) => {
    const activeNodes = allNodes.filter(node => 
      node.status === 'online' || node.status === 'active'
    );
    
    if (activeNodes.length === 0) return 0;
    
    const totalUtilization = activeNodes.reduce((sum, node) => {
      const cpuUsage = node.performance?.cpu_usage || 0;
      const memoryUsage = node.performance?.memory_usage || 0;
      return sum + ((cpuUsage + memoryUsage) / 2);
    }, 0);
    
    return Math.round(totalUtilization / activeNodes.length);
  }, []);

  // ==================== UTILITY FUNCTIONS ====================
  
  /**
   * Normalize node status to standard values
   * 
   * @param {string} status - Raw status from API
   * @returns {string} Normalized status
   */
  const normalizeNodeStatus = useCallback((status) => {
    const statusMap = {
      'active': 'online',
      'running': 'online',
      'stopped': 'offline',
      'error': 'offline',
      'registered': 'pending',
      'initializing': 'pending'
    };
    
    return statusMap[status] || status || 'offline';
  }, []);

  /**
   * Calculate node uptime from timestamps
   * 
   * @param {string} lastSeen - Last seen timestamp
   * @param {string} createdAt - Creation timestamp
   * @returns {string} Formatted uptime string
   */
  const calculateNodeUptime = useCallback((lastSeen, createdAt) => {
    if (!createdAt) return '0 days, 0 hours';
    
    const now = new Date();
    const created = new Date(createdAt);
    
    // If never seen or seen too long ago, consider as no uptime
    if (!lastSeen) return '0 days, 0 hours';
    
    const lastSeenDate = new Date(lastSeen);
    const isRecentlyActive = (now - lastSeenDate) < (10 * 60 * 1000); // 10 minutes threshold
    
    if (!isRecentlyActive) return '0 days, 0 hours';
    
    const diffMs = now - created;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days} days, ${hours} hours`;
  }, []);

  /**
   * Calculate resource usage percentage
   * 
   * @param {number|string} usage - Raw usage value
   * @returns {number} Usage percentage (0-100)
   */
  const calculateResourceUsage = useCallback((usage) => {
    const numericUsage = Number(usage);
    if (isNaN(numericUsage)) return 0;
    return Math.max(0, Math.min(100, Math.round(numericUsage)));
  }, []);

  /**
   * Check if cached data is still valid
   * 
   * @param {Object} cacheEntry - Cache entry with timestamp
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {boolean} Whether cache is valid
   */
  const isCacheValid = useCallback((cacheEntry, maxAge) => {
    if (!cacheEntry || !cacheEntry.timestamp) return false;
    return (Date.now() - cacheEntry.timestamp) < maxAge;
  }, []);

  /**
   * Handle errors during data fetching
   * 
   * @param {Error} err - The error object
   */
  const handleFetchError = useCallback((err) => {
    let errorMessage = err.message || ERROR_MESSAGES.API_UNAVAILABLE;
    
    // Handle specific error cases
    if (err.message?.includes('Network error') || err.message?.includes('fetch')) {
      errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
    } else if (err.message?.includes('no nodes') || err.message?.includes('No nodes found')) {
      // Not really an error - user just has no nodes yet
      setDashboardData({
        stats: {
          totalNodes: 0,
          activeNodes: 0,
          pendingNodes: 0,
          offlineNodes: 0,
          totalEarnings: 0,
          networkContribution: '0.0000%',
          resourceUtilization: 0
        },
        nodes: [],
        timestamp: new Date().toISOString(),
        source: 'api'
      });
      setError(null);
      return;
    }
    
    setError(errorMessage);
  }, []);

  // ==================== EVENT HANDLERS ====================
  
  /**
   * Handle manual refresh of dashboard data
   */
  const handleRefreshDashboard = useCallback(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  /**
   * Toggle auto-refresh functionality
   */
  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshEnabled(prev => !prev);
  }, []);

  /**
   * Clear all cached data
   */
  const clearCache = useCallback(() => {
    setDataCache(new Map());
    fetchDashboardData();
  }, [fetchDashboardData]);

  // ==================== MEMOIZED VALUES ====================
  
  /**
   * Determine if we should show the performance debug panel
   */
  const showPerformancePanel = useMemo(() => {
    return process.env.NODE_ENV === 'development' && performanceMetrics.successfulRequests > 0;
  }, [performanceMetrics.successfulRequests]);

  /**
   * Calculate dashboard health score
   */
  const dashboardHealthScore = useMemo(() => {
    if (!dashboardData) return 0;
    
    const { stats } = dashboardData;
    const totalNodes = stats.totalNodes;
    
    if (totalNodes === 0) return 100; // Perfect score if no nodes (no issues)
    
    const activeRatio = stats.activeNodes / totalNodes;
    const offlineRatio = stats.offlineNodes / totalNodes;
    
    let score = 100;
    score -= (offlineRatio * 50); // Penalize offline nodes heavily
    score -= ((1 - activeRatio) * 30); // Reward active nodes
    score += (stats.resourceUtilization > 70 ? 10 : 0); // Bonus for good utilization
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [dashboardData]);

  // ==================== RENDER GUARDS ====================
  
  // Redirect if wallet not connected
  if (!wallet.connected) {
    return null;
  }

  // ==================== RENDER COMPONENT ====================
  
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-grow container-custom py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
              <p className="text-gray-400">
                Welcome to your AeroNyx Node Management Dashboard
                {lastRefresh && (
                  <span className="ml-2 text-sm">
                    • Last updated: {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
            
            {/* Dashboard Controls */}
            <div className="flex items-center gap-3">
              {/* Auto-refresh toggle */}
              <button
                onClick={toggleAutoRefresh}
                className={`text-sm px-3 py-1 rounded transition-colors ${
                  autoRefreshEnabled 
                    ? 'bg-green-900/30 text-green-400 border border-green-800' 
                    : 'bg-gray-900/30 text-gray-400 border border-gray-800'
                }`}
                title={`Auto-refresh ${autoRefreshEnabled ? 'enabled' : 'disabled'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Auto
              </button>
              
              {/* Manual refresh */}
              <button 
                onClick={handleRefreshDashboard}
                disabled={isLoading || refreshing}
                className={`button-outline flex items-center gap-2 ${
                  isLoading || refreshing ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                aria-label="Refresh dashboard data"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-800 rounded-md text-red-200">
            <div className="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-bold">Dashboard Error</span>
            </div>
            <p className="text-sm mb-3">{error}</p>
            <div className="flex gap-3">
              <button 
                onClick={handleRefreshDashboard}
                className="text-sm underline hover:no-underline"
              >
                Retry
              </button>
              <button 
                onClick={clearCache}
                className="text-sm text-red-300 underline hover:no-underline"
              >
                Clear Cache & Retry
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-400">Loading dashboard data...</p>
            </div>
          </div>
        ) : dashboardData ? (
          <>
            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <QuickActionButton
                href="/dashboard/register"
                icon="plus"
                title="Register New Node"
                description="Add a new device to the AeroNyx network"
                color="primary"
              />
              
              <QuickActionButton
                href="/dashboard/nodes"
                icon="servers"
                title="Manage Nodes"
                description="View and manage your registered nodes"
                color="secondary"
              />
            </div>

            {/* Dashboard Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <DashboardStatsCard
                title="Total Nodes"
                value={dashboardData.stats.totalNodes}
                subtitle={`${dashboardData.stats.activeNodes} active`}
                icon="servers"
                color="primary"
              />
              
              <DashboardStatsCard
                title="Node Status"
                value=""
                subtitle="Current distribution"
                icon="status"
                color="secondary"
                customContent={
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                      <span className="text-sm">{dashboardData.stats.activeNodes} Active</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-yellow-500"></span>
                      <span className="text-sm">{dashboardData.stats.pendingNodes} Pending</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
                      <span className="text-sm">{dashboardData.stats.offlineNodes} Offline</span>
                    </div>
                  </div>
                }
              />
              
              <DashboardStatsCard
                title="Total Earnings"
                value={dashboardData.stats.totalEarnings}
                subtitle="AeroNyx Tokens"
                icon="earnings"
                color="accent"
              />
              
              <DashboardStatsCard
                title="Network Contribution"
                value={dashboardData.stats.networkContribution}
                subtitle="of Global Resources"
                icon="network"
                color="success"
              />
            </div>

            {/* Resource Utilization */}
            <div className="card glass-effect mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Resource Utilization</h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Health Score:</span>
                  <span className={`text-sm font-bold ${
                    dashboardHealthScore >= 80 ? 'text-green-500' :
                    dashboardHealthScore >= 60 ? 'text-yellow-500' :
                    'text-red-500'
                  }`}>
                    {dashboardHealthScore}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-background-200 rounded-full h-4 mb-2">
                <div 
                  className="bg-primary rounded-full h-4 transition-all duration-500" 
                  style={{ width: `${dashboardData.stats.resourceUtilization}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-sm text-gray-400">
                <span>Current: {dashboardData.stats.resourceUtilization}%</span>
                <span>Target: 85%</span>
              </div>
            </div>

            {/* Node Status Overview */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Recent Nodes</h2>
                <Link href="/dashboard/nodes" className="text-primary hover:text-primary-400 text-sm">
                  View All Nodes →
                </Link>
              </div>
              
              {dashboardData.nodes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {dashboardData.nodes.map(node => (
                    <NodeStatusCard 
                      key={node.id}
                      name={node.name}
                      status={node.status}
                      deviceId={node.deviceId}
                      uptime={node.uptime}
                      earnings={node.earnings}
                      cpu={node.cpu}
                      memory={node.memory}
                      type={node.type}
                    />
                  ))}
                </div>
              ) : (
                <div className="card glass-effect p-8 text-center">
                  <h3 className="text-xl font-bold mb-4">No Nodes Registered</h3>
                  <p className="text-gray-400 mb-6">
                    You haven't registered any nodes yet. Get started by registering your first node!
                  </p>
                  <Link 
                    href="/dashboard/register"
                    className="button-primary inline-flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Register Your First Node
                  </Link>
                </div>
              )}
            </div>

            {/* Performance Debug Panel (Development Only) */}
            {showPerformancePanel && (
              <div className="card glass-effect mb-8 border-blue-800/50">
                <h3 className="text-lg font-bold mb-4 text-blue-400">
                  Performance Metrics (Development)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">API Response Time</div>
                    <div className="font-mono">{performanceMetrics.apiResponseTime}ms</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Update Duration</div>
                    <div className="font-mono">{performanceMetrics.lastUpdateDuration}ms</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Successful Requests</div>
                    <div className="font-mono text-green-400">{performanceMetrics.successfulRequests}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Failed Requests</div>
                    <div className="font-mono text-red-400">{performanceMetrics.failedRequests}</div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="card glass-effect p-8 text-center">
            <h3 className="text-xl font-bold mb-4">No Data Available</h3>
            <p className="text-gray-400 mb-6">
              We couldn't retrieve your dashboard data. Please try again later.
            </p>
            <button 
              onClick={handleRefreshDashboard}
              className="button-primary"
            >
              Refresh Dashboard
            </button>
          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="bg-background-100 border-t border-background-200 py-4">
        <div className="container-custom">
          <div className="text-sm text-gray-400 text-center">
            © {new Date().getFullYear()} AeroNyx Network. All rights reserved.
            {lastRefresh && (
              <span className="ml-4">
                Data source: {dashboardData?.source || 'unknown'} • 
                Last refresh: {lastRefresh.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
