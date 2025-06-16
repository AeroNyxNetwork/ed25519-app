/**
 * AeroNyx Dashboard Page - Production Ready
 * 
 * File Path: src/app/dashboard/page.js
 * 
 * Production-ready dashboard focusing on node management without financial metrics.
 * Implements comprehensive caching and performance optimizations.
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 */

'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../components/layout/Header';
import { useWallet } from '../../components/wallet/WalletProvider';
import NodeStatusCard from '../../components/dashboard/NodeStatusCard';
import Link from 'next/link';
import nodeRegistrationService from '../../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../../lib/utils/walletSignature';

// Configuration constants
const CACHE_DURATION = {
  DASHBOARD_DATA: 5 * 60 * 1000,    // 5 minutes
  SIGNATURE: 10 * 60 * 1000         // 10 minutes
};

const REFRESH_INTERVALS = {
  DASHBOARD_DATA: 30 * 1000,        // 30 seconds
  BACKGROUND: 2 * 60 * 1000         // 2 minutes
};

export default function Dashboard() {
  const { wallet } = useWallet();
  const router = useRouter();

  // Core state management
  const [dashboardData, setDashboardData] = useState(null);
  const [nodesOverview, setNodesOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  
  // Cache management
  const [cache, setCache] = useState(new Map());
  const [signatureCache, setSignatureCache] = useState(new Map());
  
  // Auto-refresh control
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const refreshIntervalRef = React.useRef(null);
  const requestInProgressRef = React.useRef(false);
  const mountedRef = React.useRef(true);

  // Performance metrics
  const [performanceMetrics, setPerformanceMetrics] = useState({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  });

  // Check if cached data is still valid
  const isCacheValid = useCallback((cacheEntry, ttl) => {
    if (!cacheEntry) return false;
    return (Date.now() - cacheEntry.timestamp) < ttl;
  }, []);

  // Get or generate signature with caching
  const getSignature = useCallback(async () => {
    const cacheKey = `signature_${wallet.address}`;
    const cachedSignature = signatureCache.get(cacheKey);
    
    if (cachedSignature && isCacheValid(cachedSignature, CACHE_DURATION.SIGNATURE)) {
      setPerformanceMetrics(prev => ({ ...prev, cacheHits: prev.cacheHits + 1 }));
      return {
        signature: cachedSignature.signature,
        message: cachedSignature.message
      };
    }

    setPerformanceMetrics(prev => ({ ...prev, cacheMisses: prev.cacheMisses + 1 }));

    // Generate new signature
    const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
    
    if (!messageResponse.success) {
      throw new Error(messageResponse.message || 'Failed to generate signature message');
    }

    const message = messageResponse.data.message;
    const formattedMessage = formatMessageForSigning(message);
    const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);

    // Cache the signature
    const newCache = new Map(signatureCache);
    newCache.set(cacheKey, {
      signature,
      message,
      timestamp: Date.now()
    });
    setSignatureCache(newCache);

    return { signature, message };
  }, [wallet.address, wallet.provider, signatureCache, isCacheValid]);

  // Process dashboard data
  const processDashboardData = useCallback((apiData) => {
    const { summary, nodes: nodesByStatus } = apiData;
    
    // Combine all nodes from different status categories
    const allNodes = [
      ...(nodesByStatus.online || []),
      ...(nodesByStatus.active || []),
      ...(nodesByStatus.offline || [])
    ];

    // Transform nodes for dashboard display
    const transformedNodes = allNodes.slice(0, 6).map(node => ({
      id: node.reference_code || node.id || `node-${Date.now()}-${Math.random()}`,
      name: node.name || 'Unnamed Node',
      status: normalizeNodeStatus(node.status),
      type: node.node_type?.id || node.node_type || 'general',
      deviceId: node.reference_code || node.id,
      uptime: calculateNodeUptime(node.last_seen, node.created_at),
      cpu: node.performance?.cpu_usage || 0,
      memory: node.performance?.memory_usage || 0,
      lastSeen: node.last_seen,
      createdAt: node.created_at,
      isConnected: node.is_connected || false,
      totalTasks: node.total_tasks || 0,
      completedTasks: node.completed_tasks || 0
    }));

    // Calculate statistics without financial metrics
    const stats = {
      totalNodes: summary.total_nodes || allNodes.length,
      activeNodes: summary.online_nodes || summary.active_nodes || 0,
      offlineNodes: summary.offline_nodes || 0,
      pendingNodes: Math.max(0, (summary.total_nodes || allNodes.length) - (summary.online_nodes || summary.active_nodes || 0) - (summary.offline_nodes || 0)),
      resourceUtilization: calculateResourceUtilization(allNodes),
      networkHealth: calculateNetworkHealth(summary, allNodes)
    };

    return {
      stats,
      nodes: transformedNodes,
      timestamp: new Date().toISOString(),
      source: 'api'
    };
  }, []);

  // Utility functions
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

  const calculateNodeUptime = useCallback((lastSeen, createdAt) => {
    if (!createdAt) return '0 days, 0 hours';
    
    const now = new Date();
    const created = new Date(createdAt);
    
    if (!lastSeen) return '0 days, 0 hours';
    
    const lastSeenDate = new Date(lastSeen);
    const isRecentlyActive = (now - lastSeenDate) < (10 * 60 * 1000); // 10 minutes threshold
    
    if (!isRecentlyActive) return '0 days, 0 hours';
    
    const diffMs = now - created;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days} days, ${hours} hours`;
  }, []);

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

  const calculateNetworkHealth = useCallback((summary, allNodes) => {
    const totalNodes = summary.total_nodes || allNodes.length;
    if (totalNodes === 0) return 100;
    
    const activeNodes = summary.online_nodes || summary.active_nodes || 0;
    const offlineNodes = summary.offline_nodes || 0;
    
    let score = 100;
    const activeRatio = activeNodes / totalNodes;
    const offlineRatio = offlineNodes / totalNodes;
    
    score -= (offlineRatio * 50);
    score -= ((1 - activeRatio) * 30);
    
    // Bonus for good resource utilization
    if (allNodes.length > 0) {
      const utilization = calculateResourceUtilization(allNodes);
      if (utilization > 70) score += 10;
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [calculateResourceUtilization]);

  // Fetch dashboard data with caching
  const fetchDashboardData = useCallback(async (silentRefresh = false) => {
    // Prevent multiple simultaneous requests
    if (requestInProgressRef.current) {
      return;
    }

    if (!wallet.connected || !wallet.address) {
      setError('Wallet not connected');
      setIsLoading(false);
      return;
    }

    // Check cache first
    const cacheKey = `dashboard_${wallet.address}`;
    const cachedData = cache.get(cacheKey);
    
    if (!silentRefresh && cachedData && isCacheValid(cachedData, CACHE_DURATION.DASHBOARD_DATA)) {
      setDashboardData(cachedData.data);
      setNodesOverview(cachedData.overview);
      setPerformanceMetrics(prev => ({ ...prev, cacheHits: prev.cacheHits + 1 }));
      setIsLoading(false);
      return;
    }

    if (cachedData) {
      setPerformanceMetrics(prev => ({ ...prev, cacheMisses: prev.cacheMisses + 1 }));
    }

    requestInProgressRef.current = true;
    
    if (!silentRefresh) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    
    setError(null);
    
    const startTime = performance.now();
    setPerformanceMetrics(prev => ({ ...prev, totalRequests: prev.totalRequests + 1 }));

    try {
      // Get signature (with caching)
      const { signature, message } = await getSignature();

      // Fetch user nodes overview
      const overviewResponse = await nodeRegistrationService.getUserNodesOverview(
        wallet.address,
        signature,
        message,
        'okx'
      );

      if (overviewResponse.success && overviewResponse.data) {
        const processedData = processDashboardData(overviewResponse.data);
        
        // Update cache
        const newCache = new Map(cache);
        newCache.set(cacheKey, {
          data: processedData,
          overview: overviewResponse.data,
          timestamp: Date.now()
        });
        setCache(newCache);
        
        // Update state
        if (mountedRef.current) {
          setDashboardData(processedData);
          setNodesOverview(overviewResponse.data);
          setLastRefresh(new Date());
          
          // Update performance metrics
          const responseTime = Math.round(performance.now() - startTime);
          setPerformanceMetrics(prev => ({
            ...prev,
            successfulRequests: prev.successfulRequests + 1,
            averageResponseTime: Math.round(
              (prev.averageResponseTime * prev.successfulRequests + responseTime) / 
              (prev.successfulRequests + 1)
            )
          }));
        }
      } else {
        throw new Error(overviewResponse.message || 'Failed to fetch dashboard data');
      }

    } catch (err) {
      console.error('Dashboard data fetch error:', err);
      
      // Update performance metrics
      setPerformanceMetrics(prev => ({
        ...prev,
        failedRequests: prev.failedRequests + 1
      }));
      
      // Handle specific error cases
      if (err.message?.includes('no nodes') || err.message?.includes('No nodes found')) {
        // User has no nodes yet - not really an error
        const emptyData = {
          stats: {
            totalNodes: 0,
            activeNodes: 0,
            pendingNodes: 0,
            offlineNodes: 0,
            resourceUtilization: 0,
            networkHealth: 100
          },
          nodes: [],
          timestamp: new Date().toISOString(),
          source: 'api'
        };
        
        if (mountedRef.current) {
          setDashboardData(emptyData);
          setNodesOverview({
            summary: { total_nodes: 0, online_nodes: 0, active_nodes: 0, offline_nodes: 0 },
            nodes: { online: [], active: [], offline: [] }
          });
          setError(null);
        }
      } else {
        if (mountedRef.current) {
          setError(err.message || 'Failed to load dashboard data');
        }
      }
    } finally {
      requestInProgressRef.current = false;
      if (mountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [wallet.connected, wallet.address, cache, getSignature, processDashboardData, isCacheValid]);

  // Manual refresh handler
  const handleRefreshDashboard = useCallback(() => {
    // Clear cache for fresh data
    const cacheKey = `dashboard_${wallet.address}`;
    cache.delete(cacheKey);
    fetchDashboardData(false);
  }, [wallet.address, cache, fetchDashboardData]);

  // Toggle auto-refresh
  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshEnabled(prev => !prev);
  }, []);

  // Initial data load
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
      return;
    }

    fetchDashboardData();
  }, [wallet.connected, wallet.address, fetchDashboardData, router]);

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefreshEnabled || !wallet.connected) {
      return;
    }

    refreshIntervalRef.current = setInterval(() => {
      if (!requestInProgressRef.current) {
        fetchDashboardData(true); // Silent refresh
      }
    }, REFRESH_INTERVALS.DASHBOARD_DATA);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefreshEnabled, wallet.connected, fetchDashboardData]);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  // Redirect if wallet not connected
  if (!wallet.connected) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background-50 to-background-100">
      <Header />
      
      {/* Hero Section */}
      <section className="border-b border-background-200 bg-gradient-to-r from-primary-900/20 to-secondary-900/20">
        <div className="container-custom py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Welcome & Status */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center">
                  <span className="text-xl font-bold text-white">
                    {wallet.address?.slice(2, 4).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Node Management Center</h1>
                  <p className="text-gray-400">
                    Monitor and manage your AeroNyx network nodes
                  </p>
                </div>
              </div>
            </div>
            
            {/* Control Panel */}
            <div className="flex items-center gap-4">
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
                disabled={isLoading || isRefreshing}
                className={`button-outline flex items-center gap-2 ${
                  isLoading || isRefreshing ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              
              {/* Register new node */}
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
      </section>

      <main className="container-custom py-8">
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
            <button 
              onClick={handleRefreshDashboard}
              className="text-sm underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !dashboardData ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-400">Loading dashboard data...</p>
            </div>
          </div>
        ) : dashboardData ? (
          <>
            {/* Network Overview */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
              <div className="card glass-effect">
                <h3 className="text-sm text-gray-400 mb-1">Total Nodes</h3>
                <div className="text-2xl font-bold">{dashboardData.stats.totalNodes}</div>
              </div>
              
              <div className="card glass-effect">
                <h3 className="text-sm text-gray-400 mb-1">Active</h3>
                <div className="text-2xl font-bold text-green-500">{dashboardData.stats.activeNodes}</div>
              </div>
              
              <div className="card glass-effect">
                <h3 className="text-sm text-gray-400 mb-1">Offline</h3>
                <div className="text-2xl font-bold text-red-500">{dashboardData.stats.offlineNodes}</div>
              </div>
              
              <div className="card glass-effect">
                <h3 className="text-sm text-gray-400 mb-1">Pending</h3>
                <div className="text-2xl font-bold text-yellow-500">{dashboardData.stats.pendingNodes}</div>
              </div>
              
              <div className="card glass-effect">
                <h3 className="text-sm text-gray-400 mb-1">Utilization</h3>
                <div className="text-2xl font-bold">{dashboardData.stats.resourceUtilization}%</div>
              </div>
              
              <div className="card glass-effect">
                <h3 className="text-sm text-gray-400 mb-1">Health Score</h3>
                <div className={`text-2xl font-bold ${
                  dashboardData.stats.networkHealth >= 80 ? 'text-green-500' :
                  dashboardData.stats.networkHealth >= 60 ? 'text-yellow-500' :
                  'text-red-500'
                }`}>
                  {dashboardData.stats.networkHealth}%
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <Link href="/dashboard/nodes" className="card glass-effect flex items-center gap-4 hover:bg-background-100 transition-colors">
                <div className="p-3 rounded-full bg-primary-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold">Manage Nodes</h3>
                  <p className="text-sm text-gray-400">View and control all your registered nodes</p>
                </div>
              </Link>
              
              <Link href="/dashboard/network" className="card glass-effect flex items-center gap-4 hover:bg-background-100 transition-colors">
                <div className="p-3 rounded-full bg-secondary-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold">Network Statistics</h3>
                  <p className="text-sm text-gray-400">Global network insights and analytics</p>
                </div>
              </Link>
            </div>

            {/* Recent Nodes */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Recent Nodes</h2>
                <Link href="/dashboard/nodes" className="text-primary hover:text-primary-400 text-sm">
                  View All Nodes →
                </Link>
              </div>
              
              {dashboardData.nodes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dashboardData.nodes.map(node => (
                    <NodeStatusCard 
                      key={node.id}
                      name={node.name}
                      status={node.status}
                      deviceId={node.deviceId}
                      uptime={node.uptime}
                      earnings={0} // Remove earnings display
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

            {/* Performance Metrics (Production Only) */}
            {process.env.NODE_ENV === 'production' && performanceMetrics.totalRequests > 0 && (
              <div className="card glass-effect mb-8 border-blue-800/50">
                <h3 className="text-lg font-bold mb-4 text-blue-400">System Performance</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">Avg Response Time</div>
                    <div className="font-mono">{performanceMetrics.averageResponseTime}ms</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Success Rate</div>
                    <div className="font-mono text-green-400">
                      {performanceMetrics.totalRequests > 0 
                        ? Math.round((performanceMetrics.successfulRequests / performanceMetrics.totalRequests) * 100)
                        : 0
                      }%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400">Cache Hit Rate</div>
                    <div className="font-mono text-blue-400">
                      {(performanceMetrics.cacheHits + performanceMetrics.cacheMisses) > 0
                        ? Math.round((performanceMetrics.cacheHits / (performanceMetrics.cacheHits + performanceMetrics.cacheMisses)) * 100)
                        : 0
                      }%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400">Total Requests</div>
                    <div className="font-mono">{performanceMetrics.totalRequests}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Last Refresh Information */}
            {lastRefresh && (
              <div className="mt-6 text-center text-sm text-gray-400">
                Last updated: {lastRefresh.toLocaleString()}
                {dashboardData.source && ` • Data source: ${dashboardData.source}`}
              </div>
            )}
          </>
        ) : (
          <div className="card glass-effect p-8 text-center">
            <h3 className="text-xl font-bold mb-4">No Data Available</h3>
            <p className="text-gray-400 mb-6">
              We couldn't retrieve your dashboard data. Please try again.
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
          </div>
        </div>
      </footer>
    </div>
  );
}
