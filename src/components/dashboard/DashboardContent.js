/**
 * Dashboard Content Component for AeroNyx Platform
 * 
 * File Path: src/components/dashboard/DashboardContent.js
 * 
 * Production-ready dashboard UI for Web3 tool platform
 * Focused on node management and operational metrics
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';

// Component imports
import DashboardStatsCard from './DashboardStatsCard';
import NodeList from './NodeList';
import QuickActionButton from './QuickActionButton';
import RealTimeNodeMonitor from './RealTimeDashboard';
import BlockchainIntegrationModule from './BlockchainIntegrationModule';

// Hook imports
import useDashboard from '../../hooks/useDashboardData';
import { useWebSocketContext } from '../providers/WebSocketProvider';

export default function DashboardContent() {
  const [showBlockchainModal, setShowBlockchainModal] = useState(false);
  const [selectedNodeForBlockchain, setSelectedNodeForBlockchain] = useState(null);

  // WebSocket context
  const wsContext = useWebSocketContext();

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
    refresh
  } = useDashboard({
    preferWebSocket: true,
    enableRESTFallback: true,
    hybridMode: true
  });

  // Event handlers
  const handleBlockchainIntegration = useCallback((node) => {
    setSelectedNodeForBlockchain(node);
    setShowBlockchainModal(true);
  }, []);

  const handleNodeDetails = useCallback(async (referenceCode) => {
    console.log('Fetching details for node:', referenceCode);
  }, []);

  const handleRefresh = useCallback(() => {
    refresh(true);
  }, [refresh]);

  // Show loading state
  if (isInitialLoading) {
    return (
      <div className="py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="mb-8">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
          </div>
          <h2 className="text-xl font-bold mb-2">Loading Dashboard</h2>
          <p className="text-gray-400">Fetching your node data...</p>
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

  // Extract nodes array from dashboard data
  const nodesArray = dashboardData?.nodes || [];

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

      {/* Real-time Monitor */}
      <RealTimeNodeMonitor
        nodes={nodesArray}
        performanceAlerts={[]}
        lastUpdate={lastUpdate}
        updateSource={dataSource}
        connectionStatus={connectionHealth}
        onClearAlerts={() => {}}
      />

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
          title="Resource Usage"
          value={`${stats.resourceUtilization}%`}
          subtitle="Average utilization"
          icon="performance"
          color="accent"
          trend={stats.resourceUtilization > 70 ? 'up' : 'stable'}
          trendValue={stats.resourceUtilization > 70 ? 5.2 : 0}
        />
        
        <DashboardStatsCard
          title="Network Share"
          value={stats.networkContribution}
          subtitle="Your contribution"
          icon="network"
          color="secondary"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-6">
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
              
              {nodesArray.length > 0 ? (
                <NodeList
                  nodes={nodesArray.slice(0, 4)}
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
