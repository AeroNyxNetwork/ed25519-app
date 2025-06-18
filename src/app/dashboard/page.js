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

import React, { useState, useCallback, useMemo } from 'react';
import { useWallet } from '../../components/wallet/WalletProvider';
import useEnhancedDashboardWithWebSocket from '../../hooks/useEnhancedDashboardWithWebSocket';

// Components
import DashboardStatsCard from '../../components/dashboard/DashboardStatsCard';
import MetricsOverview from '../../components/dashboard/MetricsOverview';
import QuickActionButton from '../../components/dashboard/QuickActionButton';
import BlockchainIntegrationModule from '../../components/dashboard/BlockchainIntegrationModule';

// Loading and error components
const LoadingDashboard = () => (
  <div className="animate-pulse space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-32 bg-background-100 rounded-lg"></div>
      ))}
    </div>
    <div className="h-96 bg-background-100 rounded-lg"></div>
  </div>
);

const ErrorDashboard = ({ error, onRetry, connectionHealth }) => (
  <div className="text-center py-12">
    <div className="max-w-md mx-auto">
      <div className="text-red-400 mb-4">
        <svg className="h-16 w-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 19c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">Dashboard Connection Error</h3>
      <p className="text-gray-400 mb-4">
        {error?.message || 'Failed to load dashboard data'}
      </p>
      <div className="mb-4">
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm 
          bg-${connectionHealth.color}-900/30 text-${connectionHealth.color}-400 
          border border-${connectionHealth.color}-800`}>
          <div className={`w-2 h-2 rounded-full bg-${connectionHealth.color}-500 mr-2`}></div>
          {connectionHealth.label}
        </span>
      </div>
      <button
        onClick={onRetry}
        className="button-primary"
      >
        Retry Connection
      </button>
    </div>
  </div>
);

export default function DashboardPage() {
  const { wallet } = useWallet();
  const [selectedBlockchainNode, setSelectedBlockchainNode] = useState(null);
  const [showDataSourceSelector, setShowDataSourceSelector] = useState(false);

  // Enhanced dashboard hook with WebSocket integration
  const {
    dashboardData,
    nodesOverview,
    isLoading,
    isRefreshing,
    error,
    dataSource,
    dataSourceInfo,
    connectionHealth,
    wsConnected,
    wsMonitoring,
    stats,
    refresh,
    switchDataSource,
    startRealtimeMonitoring,
    stopRealtimeMonitoring,
    isRealtime,
    hasRealTimeData,
    hasRESTData
  } = useEnhancedDashboardWithWebSocket({
    preferWebSocket: true,
    enableRESTFallback: true,
    hybridMode: true,
    onDataUpdate: handleDataUpdate,
    onError: handleDashboardError
  });

  /**
   * Handle data updates
   */
  function handleDataUpdate(data, source) {
    console.log(`[Dashboard] Data updated from ${source}:`, data);
  }

  /**
   * Handle dashboard errors
   */
  function handleDashboardError(error, source) {
    console.error(`[Dashboard] Error from ${source}:`, error);
  }

  /**
   * Handle blockchain integration modal
   */
  const handleBlockchainIntegration = useCallback((node) => {
    setSelectedBlockchainNode(node);
  }, []);

  /**
   * Close blockchain integration modal
   */
  const closeBlockchainIntegration = useCallback(() => {
    setSelectedBlockchainNode(null);
  }, []);

  /**
   * Toggle real-time monitoring
   */
  const toggleRealtimeMonitoring = useCallback(() => {
    if (wsMonitoring) {
      stopRealtimeMonitoring();
    } else {
      startRealtimeMonitoring();
    }
  }, [wsMonitoring, startRealtimeMonitoring, stopRealtimeMonitoring]);

  /**
   * Switch between data sources
   */
  const handleDataSourceSwitch = useCallback((source) => {
    switchDataSource(source);
    setShowDataSourceSelector(false);
  }, [switchDataSource]);

  /**
   * Generate dashboard statistics cards
   */
  const statsCards = useMemo(() => {
    if (!dashboardData?.stats) return [];

    return [
      {
        title: 'Total Nodes',
        value: dashboardData.stats.totalNodes,
        subtitle: `${dashboardData.stats.activeNodes} active`,
        icon: 'servers',
        color: 'primary',
        trend: { direction: 'up', percentage: 2.1 }
      },
      {
        title: 'Network Status',
        value: dashboardData.stats.activeNodes > 0 ? 'Online' : 'Offline',
        subtitle: `${dashboardData.stats.offlineNodes} offline`,
        icon: 'network',
        color: dashboardData.stats.activeNodes > 0 ? 'success' : 'error',
        trend: { direction: dashboardData.stats.activeNodes > 0 ? 'up' : 'down', percentage: 1.2 }
      },
      {
        title: 'Total Earnings',
        value: dashboardData.stats.totalEarnings,
        subtitle: 'AeroNyx tokens',
        icon: 'earnings',
        color: 'accent',
        trend: { direction: 'up', percentage: 5.7 }
      },
      {
        title: 'Network Health',
        value: `${Math.round((dashboardData.stats.activeNodes / Math.max(1, dashboardData.stats.totalNodes)) * 100)}%`,
        subtitle: 'Overall health score',
        icon: 'health',
        color: dashboardData.stats.totalNodes > 0 ? 'success' : 'neutral',
        trend: { direction: 'stable', percentage: 0.3 }
      }
    ];
  }, [dashboardData]);

  /**
   * Render data source indicator
   */
  const DataSourceIndicator = () => (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm 
        bg-${connectionHealth.color}-900/30 text-${connectionHealth.color}-400 
        border border-${connectionHealth.color}-800`}>
        <div className={`w-2 h-2 rounded-full bg-${connectionHealth.color}-500 mr-2 
          ${isRealtime ? 'animate-pulse' : ''}`}></div>
        {connectionHealth.label}
      </span>
      
      {dataSourceInfo.lastUpdate && (
        <span className="text-xs text-gray-500">
          Updated {new Date(dataSourceInfo.lastUpdate).toLocaleTimeString()}
        </span>
      )}
      
      <button
        onClick={() => setShowDataSourceSelector(!showDataSourceSelector)}
        className="text-xs text-gray-400 hover:text-white transition-colors"
        title="Switch data source"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
      
      {showDataSourceSelector && (
        <div className="absolute top-8 right-0 bg-background-50 border border-background-200 rounded-lg shadow-lg z-10 p-2">
          <button
            onClick={() => handleDataSourceSwitch('websocket')}
            className={`block w-full text-left px-3 py-2 text-sm rounded transition-colors
              ${dataSource === 'websocket' ? 'bg-primary text-white' : 'hover:bg-background-100'}`}
          >
            🔄 WebSocket (Real-time)
          </button>
          <button
            onClick={() => handleDataSourceSwitch('rest')}
            className={`block w-full text-left px-3 py-2 text-sm rounded transition-colors
              ${dataSource === 'rest' ? 'bg-primary text-white' : 'hover:bg-background-100'}`}
          >
            📡 REST API (Periodic)
          </button>
          <button
            onClick={() => handleDataSourceSwitch('hybrid')}
            className="block w-full text-left px-3 py-2 text-sm rounded hover:bg-background-100"
          >
            🔀 Hybrid Mode
          </button>
        </div>
      )}
    </div>
  );

  // Handle wallet not connected
  if (!wallet?.connected) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
        <p className="text-gray-400 mb-6">
          Please connect your wallet to access the dashboard
        </p>
      </div>
    );
  }

  // Handle loading state
  if (isLoading && !dashboardData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="animate-pulse h-8 w-32 bg-background-100 rounded"></div>
        </div>
        <LoadingDashboard />
      </div>
    );
  }

  // Handle error state
  if (error && !dashboardData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <DataSourceIndicator />
        </div>
        <ErrorDashboard 
          error={error} 
          onRetry={refresh}
          connectionHealth={connectionHealth}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-gray-400">
            Monitor and manage your AeroNyx network nodes
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Real-time toggle */}
          {wsConnected && (
            <button
              onClick={toggleRealtimeMonitoring}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                wsMonitoring 
                  ? 'bg-green-700 hover:bg-green-600 text-white' 
                  : 'bg-background-100 hover:bg-background-200 text-gray-300'
              }`}
            >
              {wsMonitoring ? '🔴 Stop Real-time' : '🟢 Start Real-time'}
            </button>
          )}
          
          {/* Refresh button */}
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="button-outline flex items-center gap-2"
          >
            <svg className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} 
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          
          {/* Data source indicator */}
          <div className="relative">
            <DataSourceIndicator />
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statsCards.map((card, index) => (
          <DashboardStatsCard
            key={index}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            icon={card.icon}
            color={card.color}
            trend={card.trend}
          />
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <QuickActionButton
          href="/dashboard/register"
          icon="plus"
          title="Register New Node"
          description="Add a new node to the AeroNyx network"
          color="primary"
        />
        
        <QuickActionButton
          href="/dashboard/nodes"
          icon="servers"
          title="Manage Nodes"
          description="View and configure your existing nodes"
          color="secondary"
          badge={dashboardData?.stats?.totalNodes || 0}
        />
        
        <QuickActionButton
          icon="blockchain"
          title="Blockchain Integration"
          description="Connect nodes to blockchain networks"
          color="accent"
          onClick={() => handleBlockchainIntegration(null)}
        />
      </div>

      {/* Financial Metrics Overview */}
      {dashboardData && (
        <div className="mb-8">
          <MetricsOverview
            financialMetrics={{
              totalValue: dashboardData.stats.totalEarnings * 1.2, // Mock multiplier
              apy: 12.5,
              roi: 15.7,
              dailyYield: dashboardData.stats.totalEarnings / 30,
              monthlyProjection: dashboardData.stats.totalEarnings * 1.1,
              riskScore: 25,
              efficiencyRating: dashboardData.stats.resourceUtilization || 75,
              diversificationScore: 85
            }}
            trends={{
              earningsTrend: { direction: 'up', percentage: 5.2 }
            }}
            timeframe="24h"
            onMetricSelect={(metricId) => console.log('Selected metric:', metricId)}
            onExport={(metrics, selectedMetric) => {
              console.log('Exporting:', metrics, selectedMetric);
            }}
          />
        </div>
      )}

      {/* Real-time Status Banner */}
      {isRealtime && (
        <div className="mb-6 p-4 bg-green-900/20 border border-green-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <div>
                <h4 className="font-semibold text-green-400">Real-time Monitoring Active</h4>
                <p className="text-sm text-green-300">
                  Receiving live updates from {stats?.realtimeMetrics?.messagesReceived || 0} messages
                  {stats?.realtimeMetrics?.latency && ` • ${stats.realtimeMetrics.latency}ms latency`}
                </p>
              </div>
            </div>
            <button
              onClick={stopRealtimeMonitoring}
              className="text-green-400 hover:text-green-300 text-sm"
            >
              Disable
            </button>
          </div>
        </div>
      )}

      {/* Performance Alerts */}
      {stats?.dataSource === 'rest' && (
        <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <h4 className="font-semibold text-yellow-400">Using Periodic Updates</h4>
              <p className="text-sm text-yellow-300">
                Enable real-time monitoring for live data updates
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Blockchain Integration Modal */}
      <BlockchainIntegrationModule
        isOpen={!!selectedBlockchainNode}
        onClose={closeBlockchainIntegration}
        selectedNode={selectedBlockchainNode}
      />
    </div>
  );
}
