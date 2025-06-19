/**
 * Dashboard Page Component for AeroNyx Platform
 * 
 * File Path: src/app/dashboard/page.js
 * 
 * Main dashboard page displaying real-time node statistics,
 * performance metrics, and system overview with WebSocket integration.
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '../../components/wallet/WalletProvider';
import { useRouter } from 'next/navigation';

// Dynamically import components that use WebSocket to prevent SSR issues
const DashboardStatsCard = dynamic(
  () => import('../../components/dashboard/DashboardStatsCard'),
  { ssr: false }
);

const NodeList = dynamic(
  () => import('../../components/dashboard/NodeList'),
  { ssr: false }
);

const QuickActionButton = dynamic(
  () => import('../../components/dashboard/QuickActionButton'),
  { ssr: false }
);

const MetricsOverview = dynamic(
  () => import('../../components/dashboard/MetricsOverview'),
  { ssr: false }
);

const RealTimeNodeMonitor = dynamic(
  () => import('../../components/dashboard/RealTimeDashboard'),
  { ssr: false }
);

const BlockchainIntegrationModule = dynamic(
  () => import('../../components/dashboard/BlockchainIntegrationModule'),
  { ssr: false }
);

// Import hooks and services
import useDashboard from '../../hooks/useDashboardData';
import { useWebSocketContext } from '../../components/providers/WebSocketProvider';

/**
 * Loading component for dashboard
 */
function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card glass-effect h-32 bg-background-100"></div>
        ))}
      </div>
      
      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card glass-effect h-64 bg-background-100"></div>
          <div className="card glass-effect h-96 bg-background-100"></div>
        </div>
        <div className="space-y-6">
          <div className="card glass-effect h-48 bg-background-100"></div>
          <div className="card glass-effect h-48 bg-background-100"></div>
        </div>
      </div>
    </div>
  );
}

/**
 * Main Dashboard Page Component
 */
export default function DashboardPage() {
  const { wallet } = useWallet();
  const router = useRouter();
  const [showBlockchainModal, setShowBlockchainModal] = useState(false);
  const [selectedNodeForBlockchain, setSelectedNodeForBlockchain] = useState(null);
  const [isClient, setIsClient] = useState(false);

  // Use WebSocket context only on client side
  const wsContext = isClient ? useWebSocketContext() : null;

  // Dashboard data hook
  const {
    dashboardData,
    stats,
    isInitialLoading,
    isRefreshing,
    error,
    dataSource,
    connectionHealth,
    lastUpdate,
    refresh,
    connectWebSocket,
    disconnectWebSocket
  } = useDashboard({
    preferWebSocket: true,
    enableRESTFallback: true,
    hybridMode: true
  });

  // Check if client-side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (isClient && !wallet.connected) {
      router.push('/');
    }
  }, [isClient, wallet.connected, router]);

  // Calculate derived metrics
  const financialMetrics = {
    totalValue: stats.totalEarnings * 1.5 || 0,
    apy: 12.5,
    roi: 15.3,
    dailyYield: stats.totalEarnings / 30 || 0,
    monthlyProjection: stats.totalEarnings || 0,
    riskScore: 25,
    efficiencyRating: stats.resourceUtilization || 0,
    diversificationScore: 75
  };

  const trends = {
    earningsTrend: { direction: 'up', percentage: 5.2 }
  };

  // Event handlers
  const handleBlockchainIntegration = useCallback((node) => {
    setSelectedNodeForBlockchain(node);
    setShowBlockchainModal(true);
  }, []);

  const handleNodeDetails = useCallback(async (referenceCode) => {
    // Implementation for fetching node details
    console.log('Fetching details for node:', referenceCode);
  }, []);

  const handleRefresh = useCallback(() => {
    refresh(true);
  }, [refresh]);

  // Don't render anything on server side
  if (!isClient) {
    return null;
  }

  // Show loading state
  if (isInitialLoading || !wallet.connected) {
    return (
      <div className="py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="mb-8">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
          </div>
          <h2 className="text-xl font-bold mb-2">Loading Dashboard</h2>
          <p className="text-gray-400">Connecting to AeroNyx network...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !dashboardData) {
    return (
      <div className="py-8">
        <div className="card glass-effect p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Unable to Load Dashboard</h2>
          <p className="text-gray-400 mb-6">{error.message || 'An error occurred while loading your dashboard.'}</p>
          <button
            onClick={handleRefresh}
            className="button-primary"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Node Dashboard</h1>
            <p className="text-gray-400 mt-1">Monitor and manage your AeroNyx nodes</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-md bg-${connectionHealth.color}-900/30 border border-${connectionHealth.color}-800`}>
              <div className={`w-2 h-2 rounded-full bg-${connectionHealth.color}-500 ${
                connectionHealth.status === 'excellent' ? 'animate-pulse' : ''
              }`}></div>
              <span className={`text-xs text-${connectionHealth.color}-400`}>
                {connectionHealth.label}
              </span>
            </div>
            
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-md bg-background-100 hover:bg-background-200 transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} 
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Monitor (if WebSocket available) */}
      {wsContext && (
        <RealTimeNodeMonitor
          nodes={dashboardData?.nodes || []}
          performanceAlerts={[]}
          lastUpdate={lastUpdate}
          updateSource={dataSource}
          connectionStatus={connectionHealth}
          onClearAlerts={() => {}}
        />
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <DashboardStatsCard
          title="Total Nodes"
          value={stats.totalNodes}
          subtitle={`${stats.activeNodes} active`}
          icon="servers"
          color="primary"
          trend="up"
          trendValue={2.5}
        />
        
        <DashboardStatsCard
          title="Network Status"
          value={stats.activeNodes > 0 ? 'Operational' : 'Offline'}
          subtitle={`${((stats.activeNodes / Math.max(1, stats.totalNodes)) * 100).toFixed(0)}% uptime`}
          icon="status"
          color={stats.activeNodes > 0 ? 'success' : 'error'}
        />
        
        <DashboardStatsCard
          title="Total Earnings"
          value={`$${stats.totalEarnings.toFixed(2)}`}
          subtitle="Lifetime earnings"
          icon="earnings"
          color="accent"
          trend="up"
          trendValue={5.2}
        />
        
        <DashboardStatsCard
          title="Network Contribution"
          value={stats.networkContribution}
          subtitle="Your share"
          icon="network"
          color="secondary"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Financial Metrics */}
          <MetricsOverview
            financialMetrics={financialMetrics}
            trends={trends}
            timeframe="24h"
          />
          
          {/* Node List */}
          <div className="card glass-effect">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Your Nodes</h2>
                <Link 
                  href="/dashboard/nodes"
                  className="text-sm text-primary hover:text-primary-600 transition-colors"
                >
                  View All →
                </Link>
              </div>
              
              {dashboardData?.nodes && dashboardData.nodes.length > 0 ? (
                <NodeList
                  nodes={dashboardData.nodes.slice(0, 4)}
                  onBlockchainIntegrate={handleBlockchainIntegration}
                  onNodeDetails={handleNodeDetails}
                />
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">No nodes registered yet</p>
                  <Link href="/dashboard/register">
                    <button className="button-primary">
                      Register Your First Node
                    </button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Quick Actions & Info */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="card glass-effect p-6">
            <h3 className="font-bold mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <QuickActionButton
                href="/dashboard/register"
                icon="plus"
                title="Register New Node"
                description="Add a new node to your network"
                color="primary"
              />
              
              <QuickActionButton
                href="/dashboard/nodes"
                icon="servers"
                title="Manage Nodes"
                description="View and control all your nodes"
                color="secondary"
              />
              
              <QuickActionButton
                href="/dashboard/network"
                icon="analytics"
                title="Network Stats"
                description="View global network statistics"
                color="accent"
              />
            </div>
          </div>

          {/* Network Health */}
          <div className="card glass-effect p-6">
            <h3 className="font-bold mb-4">Network Health</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">Resource Utilization</span>
                  <span>{stats.resourceUtilization}%</span>
                </div>
                <div className="w-full bg-background-200 rounded-full h-2">
                  <div 
                    className="bg-primary rounded-full h-2 transition-all duration-300" 
                    style={{ width: `${stats.resourceUtilization}%` }}
                  ></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">Active Nodes</span>
                  <span>{stats.activeNodes} / {stats.totalNodes}</span>
                </div>
                <div className="w-full bg-background-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 rounded-full h-2 transition-all duration-300" 
                    style={{ width: `${(stats.activeNodes / Math.max(1, stats.totalNodes)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card glass-effect p-6">
            <h3 className="font-bold mb-4">Recent Activity</h3>
            <div className="space-y-3 text-sm">
              {lastUpdate && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5"></div>
                  <div>
                    <p className="text-gray-300">Data updated</p>
                    <p className="text-xs text-gray-500">
                      {new Date(lastUpdate).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
              
              {stats.activeNodes > 0 && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5"></div>
                  <div>
                    <p className="text-gray-300">{stats.activeNodes} nodes online</p>
                    <p className="text-xs text-gray-500">Network operational</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Blockchain Integration Modal */}
      {showBlockchainModal && (
        <BlockchainIntegrationModule
          isOpen={showBlockchainModal}
          onClose={() => {
            setShowBlockchainModal(false);
            setSelectedNodeForBlockchain(null);
          }}
          selectedNode={selectedNodeForBlockchain}
        />
      )}
    </div>
  );
}

// Add missing import
import Link from 'next/link';
