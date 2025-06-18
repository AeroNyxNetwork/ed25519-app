/**
 * Enhanced Dashboard Page for AeroNyx Platform
 * Production-ready version with WebSocket integration
 * 
 * File Path: src/app/dashboard/page.js
 * 
 * Features:
 * - Real-time data updates via WebSocket
 * - Intelligent fallback to REST API
 * - Comprehensive error handling
 * - Performance monitoring
 * - Financial metrics display
 * - Responsive design
 * 
 * @version 3.0.0
 * @author AeroNyx Development Team
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '../../components/wallet/WalletProvider';
import { useWebSocketContext } from '../../components/providers/WebSocketProvider';
import { useDashboard } from '../../hooks/useDashboardData';
import { useSignature } from '../../hooks/useSignature';

// Dashboard Components
import DashboardStatsCard from '../../components/dashboard/DashboardStatsCard';
import NodeList from '../../components/dashboard/NodeList';
import QuickActionButton from '../../components/dashboard/QuickActionButton';
import MetricsOverview from '../../components/dashboard/MetricsOverview';
import RealTimeNodeMonitor from '../../components/dashboard/RealTimeDashboard';
import BlockchainIntegrationModule from '../../components/dashboard/BlockchainIntegrationModule';

// API Service
import nodeRegistrationService from '../../lib/api/nodeRegistration';

/**
 * Main Dashboard Page Component
 * Provides comprehensive overview of user's AeroNyx nodes with real-time monitoring
 */
export default function DashboardPage() {
  const router = useRouter();
  const { wallet } = useWallet();
  const { userMonitorService, isInitialized: wsInitialized } = useWebSocketContext();
  const { signature, message } = useSignature('dashboard');

  // ==================== STATE MANAGEMENT ====================
  
  const [selectedNode, setSelectedNode] = useState(null);
  const [blockchainModalOpen, setBlockchainModalOpen] = useState(false);
  const [performanceAlerts, setPerformanceAlerts] = useState([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('24h');
  const [showAllNodes, setShowAllNodes] = useState(false);

  // ==================== WEBSOCKET DATA HOOK ====================
  
  const {
    dashboardData,
    nodesOverview,
    stats,
    isInitialLoading,
    isRefreshing,
    hasData,
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
    hybridMode: true,
    restInterval: 60000, // Refresh every minute if not using WebSocket
    enableCache: true,
    onDataUpdate: handleDataUpdate,
    onError: handleDataError
  });

  // ==================== DATA PROCESSING ====================
  
  /**
   * Process nodes for display
   */
  const displayNodes = useMemo(() => {
    if (!nodesOverview?.nodes) return [];
    
    const allNodes = [];
    
    // Flatten grouped nodes
    if (nodesOverview.nodes.online) {
      allNodes.push(...nodesOverview.nodes.online);
    }
    if (nodesOverview.nodes.active) {
      allNodes.push(...nodesOverview.nodes.active);
    }
    if (nodesOverview.nodes.offline) {
      allNodes.push(...nodesOverview.nodes.offline);
    }
    
    // Sort by status (online first) and name
    allNodes.sort((a, b) => {
      if (a.is_connected && !b.is_connected) return -1;
      if (!a.is_connected && b.is_connected) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    
    // Return limited nodes for dashboard preview
    return showAllNodes ? allNodes : allNodes.slice(0, 4);
  }, [nodesOverview, showAllNodes]);

  /**
   * Calculate financial metrics
   */
  const financialMetrics = useMemo(() => {
    const totalEarnings = parseFloat(stats.totalEarnings) || 0;
    const activeNodes = stats.activeNodes || 0;
    const totalNodes = stats.totalNodes || 0;
    
    // Calculate metrics
    const dailyYield = activeNodes > 0 ? totalEarnings / 30 : 0; // Rough estimate
    const monthlyProjection = dailyYield * 30;
    const apy = totalNodes > 0 ? (monthlyProjection * 12 / (totalNodes * 100)) * 100 : 0; // Rough APY
    const roi = totalEarnings > 0 ? ((totalEarnings / (totalNodes * 100)) * 100) : 0; // Rough ROI
    
    return {
      totalValue: totalEarnings,
      dailyYield: dailyYield.toFixed(2),
      monthlyProjection: monthlyProjection.toFixed(2),
      apy: apy.toFixed(2),
      roi: roi.toFixed(2),
      riskScore: activeNodes === totalNodes ? 10 : 30, // Simple risk calculation
      efficiencyRating: stats.resourceUtilization || 0,
      diversificationScore: 75 // Placeholder
    };
  }, [stats]);

  /**
   * Calculate performance trends
   */
  const performanceTrends = useMemo(() => {
    // Calculate trends based on recent data
    const trends = {
      earningsTrend: {
        direction: 'up',
        percentage: 5.2 // Placeholder - would calculate from historical data
      },
      nodeTrend: {
        direction: stats.activeNodes > 0 ? 'up' : 'stable',
        percentage: 0
      },
      healthTrend: {
        direction: 'stable',
        percentage: 0
      }
    };
    
    return trends;
  }, [stats]);

  // ==================== EVENT HANDLERS ====================
  
  /**
   * Handle data updates from WebSocket/REST
   */
  function handleDataUpdate(data, source) {
    console.log(`[Dashboard] Data updated from ${source}`);
    
    // Check for performance alerts
    if (data.nodes) {
      const alerts = [];
      const criticalNodes = [];
      
      data.nodes.forEach(node => {
        const cpu = node.performance?.cpu_usage || 0;
        const memory = node.performance?.memory_usage || 0;
        
        if (cpu > 90) {
          alerts.push({
            nodeId: node.reference_code,
            message: `High CPU usage (${cpu}%) on ${node.name}`,
            severity: 'critical',
            timestamp: new Date()
          });
          criticalNodes.push(node);
        }
        
        if (memory > 90) {
          alerts.push({
            nodeId: node.reference_code,
            message: `High memory usage (${memory}%) on ${node.name}`,
            severity: 'critical',
            timestamp: new Date()
          });
          if (!criticalNodes.includes(node)) {
            criticalNodes.push(node);
          }
        }
        
        // Check for offline nodes
        if (node.status === 'offline' && node.connection_details?.offline_duration_seconds < 300) {
          alerts.push({
            nodeId: node.reference_code,
            message: `Node ${node.name} went offline`,
            severity: 'warning',
            timestamp: new Date()
          });
        }
      });
      
      if (alerts.length > 0) {
        setPerformanceAlerts(prev => [...prev, ...alerts].slice(-20)); // Keep last 20 alerts
      }
    }
  }
  
  /**
   * Handle data errors
   */
  function handleDataError(error, source) {
    console.error(`[Dashboard] Error from ${source}:`, error);
    
    // Add error alert
    setPerformanceAlerts(prev => [...prev, {
      nodeId: 'system',
      message: `Data source error: ${error.message}`,
      severity: 'error',
      timestamp: new Date()
    }].slice(-20));
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

  /**
   * Handle metric selection
   */
  const handleMetricSelect = useCallback((metricId) => {
    console.log('Selected metric:', metricId);
    // Could navigate to detailed view or show modal
  }, []);

  /**
   * Handle export request
   */
  const handleExportMetrics = useCallback((metrics, selectedMetric) => {
    console.log('Exporting metrics:', { metrics, selectedMetric });
    // Implement export functionality
  }, []);

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
        <div className="flex items-center justify-center min-h-[600px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">Loading Dashboard</h3>
            <p className="text-gray-400">Connecting to AeroNyx network...</p>
          </div>
        </div>
      </div>
    );
  }

  const hasNodes = stats.totalNodes > 0;

  return (
    <div className="container-custom mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-gray-400">
              Welcome back, {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
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
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-red-400">{error.message || 'Failed to load dashboard data'}</span>
            </div>
            <button
              onClick={() => refresh(true)}
              className="text-sm text-red-300 hover:text-red-200 underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Real-time Monitor */}
      {hasNodes && (
        <RealTimeNodeMonitor
          nodes={displayNodes}
          performanceAlerts={performanceAlerts}
          lastUpdate={lastUpdate}
          updateSource={dataSource}
          connectionStatus={connectionHealth}
          onClearAlerts={clearAlerts}
        />
      )}

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <DashboardStatsCard
          icon="servers"
          title="Total Nodes"
          value={stats.totalNodes}
          subtitle={`${stats.activeNodes} active, ${stats.offlineNodes} offline`}
          color="primary"
          trend={stats.totalNodes > 0 ? 'up' : 'stable'}
          trendValue={performanceTrends.nodeTrend.percentage}
        />
        
        <DashboardStatsCard
          icon="earnings"
          title="Total Earnings"
          value={`$${parseFloat(stats.totalEarnings).toFixed(2)}`}
          subtitle="Lifetime earnings"
          color="success"
          trend={performanceTrends.earningsTrend.direction}
          trendValue={performanceTrends.earningsTrend.percentage}
        />
        
        <DashboardStatsCard
          icon="network"
          title="Network Contribution"
          value={stats.networkContribution}
          subtitle="Your share of the network"
          color="accent"
        />
        
        <DashboardStatsCard
          icon="performance"
          title="Resource Utilization"
          value={`${stats.resourceUtilization}%`}
          subtitle="Average across all nodes"
          color={stats.resourceUtilization > 80 ? 'warning' : 'secondary'}
        />
      </div>

      {hasNodes ? (
        <>
          {/* Financial Metrics */}
          <MetricsOverview
            financialMetrics={financialMetrics}
            trends={performanceTrends}
            timeframe={selectedTimeframe}
            onMetricSelect={handleMetricSelect}
            onExport={handleExportMetrics}
          />

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <QuickActionButton
              href="/dashboard/register"
              icon="plus"
              title="Register New Node"
              description="Expand your network presence"
              color="primary"
            />
            
            <QuickActionButton
              href="/dashboard/nodes"
              icon="servers"
              title="Manage Nodes"
              description={`${stats.totalNodes} nodes registered`}
              color="secondary"
              badge={stats.offlineNodes > 0 ? stats.offlineNodes : null}
              badgeColor="error"
            />
            
            <QuickActionButton
              onClick={() => window.open('https://docs.aeronyx.network', '_blank')}
              icon="document"
              title="Documentation"
              description="Learn about node management"
              color="neutral"
              external
            />
          </div>

          {/* Recent Nodes */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Recent Nodes</h2>
              <div className="flex items-center gap-4">
                {displayNodes.length < stats.totalNodes && (
                  <button
                    onClick={() => setShowAllNodes(!showAllNodes)}
                    className="text-sm text-primary hover:text-primary-400 transition-colors"
                  >
                    {showAllNodes ? 'Show Less' : `Show All (${stats.totalNodes})`}
                  </button>
                )}
                <Link 
                  href="/dashboard/nodes" 
                  className="text-sm text-primary hover:text-primary-400 transition-colors flex items-center gap-1"
                >
                  View All Nodes
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </Link>
              </div>
            </div>
            
            <NodeList 
              nodes={displayNodes}
              onBlockchainIntegrate={handleBlockchainIntegrate}
              onNodeDetails={handleNodeDetails}
            />
          </div>
        </>
      ) : (
        /* Empty State */
        <div className="card glass-effect p-12 text-center">
          <div className="max-w-md mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mx-auto mb-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            
            <h3 className="text-2xl font-bold mb-4">Welcome to AeroNyx</h3>
            <p className="text-gray-400 mb-8">
              Get started by registering your first node to begin earning rewards
              and contributing to the decentralized network.
            </p>
            
            <QuickActionButton
              href="/dashboard/register"
              icon="plus"
              title="Register Your First Node"
              description="Join the network and start earning"
              color="primary"
              className="mx-auto max-w-sm"
            />
            
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              <div className="p-4 bg-background-100 rounded-lg">
                <div className="text-primary mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <h4 className="font-semibold mb-1">Easy Setup</h4>
                <p className="text-sm text-gray-400">
                  Register and configure your node in minutes
                </p>
              </div>
              
              <div className="p-4 bg-background-100 rounded-lg">
                <div className="text-success mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                  </svg>
                </div>
                <h4 className="font-semibold mb-1">Earn Rewards</h4>
                <p className="text-sm text-gray-400">
                  Generate passive income from your computing resources
                </p>
              </div>
              
              <div className="p-4 bg-background-100 rounded-lg">
                <div className="text-accent mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                </div>
                <h4 className="font-semibold mb-1">Join Community</h4>
                <p className="text-sm text-gray-400">
                  Be part of the decentralized computing revolution
                </p>
              </div>
            </div>
          </div>
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

      {/* Footer Info */}
      <div className="mt-12 text-center text-xs text-gray-500">
        <div className="flex items-center justify-center gap-4 mb-2">
          <span>
            Data source: {dataSource === 'websocket' ? '🔄 Real-time WebSocket' : 
                         dataSource === 'cache' ? '💾 Cached' : '📡 REST API'}
          </span>
          {lastUpdate && (
            <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
          )}
          {wsInitialized && (
            <span className="text-green-400">WebSocket Ready</span>
          )}
        </div>
        
        <div className="flex items-center justify-center gap-6">
          <Link href="/dashboard/settings" className="hover:text-gray-300 transition-colors">
            Settings
          </Link>
          <Link href="/dashboard/help" className="hover:text-gray-300 transition-colors">
            Help & Support
          </Link>
          <a 
            href="https://docs.aeronyx.network" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-gray-300 transition-colors"
          >
            Documentation ↗
          </a>
        </div>
      </div>
    </div>
  );
}
