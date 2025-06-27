/**
 * Dashboard Content Component for AeroNyx Platform
 * 
 * File Path: src/components/dashboard/DashboardContent.js
 * 
 * Production-ready dashboard UI with WebSocket-only data display
 * Fixed to properly show WebSocket node data
 * 
 * @version 4.0.0
 * @author AeroNyx Development Team
 */

'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';

// Component imports
import DashboardStatsCard from './DashboardStatsCard';
import NodeList from './NodeList';
import QuickActionButton from './QuickActionButton';
import RealTimeNodeMonitor from './RealTimeDashboard';
import BlockchainIntegrationModule from './BlockchainIntegrationModule';

// Hook imports
import { useWallet } from '../wallet/WalletProvider';
import { useDashboardWebSocket } from '../../hooks/useWebSocket';
import { useSignature } from '../../hooks/useSignature';

/**
 * Dashboard Content Component
 * 
 * @returns {React.ReactElement} Dashboard content
 */
export default function DashboardContent() {
  const [showBlockchainModal, setShowBlockchainModal] = useState(false);
  const [selectedNodeForBlockchain, setSelectedNodeForBlockchain] = useState(null);
  
  // Wallet and signature
  const { wallet } = useWallet();
  const { signature, message, isLoading: signatureLoading, error: signatureError } = useSignature('dashboard');
  
  // Local state for dashboard data
  const [dashboardData, setDashboardData] = useState({
    nodes: [],
    stats: {
      totalNodes: 0,
      activeNodes: 0,
      offlineNodes: 0,
      pendingNodes: 0,
      totalEarnings: 0,
      networkContribution: '0%',
      resourceUtilization: 0
    },
    lastUpdate: null
  });
  
  const [performanceAlerts, setPerformanceAlerts] = useState([]);
  
  // WebSocket credentials
  const wsCredentials = useMemo(() => {
    if (!wallet.connected || !signature || !message) return null;
    
    return {
      walletAddress: wallet.address,
      signature,
      message,
      walletType: 'okx'
    };
  }, [wallet.connected, wallet.address, signature, message]);
  
  // WebSocket connection for real-time data
  const {
    connected: wsConnected,
    authenticated: wsAuthenticated,
    monitoring: wsMonitoring,
    data: wsData,
    error: wsError,
    connectionHealth,
    connect: wsConnect,
    disconnect: wsDisconnect
  } = useDashboardWebSocket(wsCredentials, {
    autoConnect: true,
    autoMonitor: true,
    onData: handleWebSocketData,
    onError: handleWebSocketError
  });
  
  // Process WebSocket data
  function handleWebSocketData(data) {
    console.log('[DashboardContent] WebSocket data received:', data);
    
    if (!data) return;
    
    // Handle nodes_updated event data structure
    if (data.nodes && Array.isArray(data.nodes)) {
      const nodes = data.nodes;
      
      // Calculate statistics from nodes
      const stats = {
        totalNodes: nodes.length,
        activeNodes: nodes.filter(n => n.status === 'active').length,
        offlineNodes: nodes.filter(n => n.status === 'offline').length,
        pendingNodes: nodes.filter(n => n.status === 'pending' || n.status === 'registered').length,
        totalEarnings: nodes.reduce((sum, n) => sum + parseFloat(n.earnings || 0), 0),
        networkContribution: `${(Math.max(0, nodes.filter(n => n.status === 'active').length) * 0.0015).toFixed(4)}%`,
        resourceUtilization: calculateResourceUtilization(nodes)
      };
      
      setDashboardData({
        nodes: nodes,
        stats: stats,
        lastUpdate: new Date()
      });
      
      // Check for performance alerts
      checkPerformanceAlerts(nodes);
    }
  }
  
  // Handle WebSocket errors
  function handleWebSocketError(error) {
    console.error('[DashboardContent] WebSocket error:', error);
    
    // Add error alert
    setPerformanceAlerts(prev => [{
      nodeId: 'system',
      message: `WebSocket connection error: ${error.message || 'Unknown error'}`,
      severity: 'critical',
      timestamp: new Date()
    }, ...prev].slice(0, 5));
  }
  
  // Calculate resource utilization
  const calculateResourceUtilization = useCallback((nodes) => {
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;
    
    const activeNodes = nodes.filter(n => n.status === 'active' || n.status === 'online');
    if (activeNodes.length === 0) return 0;
    
    const totalUtil = activeNodes.reduce((sum, node) => {
      const cpu = node.performance?.cpu || node.performance?.cpu_usage || 0;
      const memory = node.performance?.memory || node.performance?.memory_usage || 0;
      return sum + ((cpu + memory) / 2);
    }, 0);
    
    return Math.round(totalUtil / activeNodes.length);
  }, []);
  
  // Check for performance alerts
  const checkPerformanceAlerts = useCallback((nodes) => {
    const alerts = [];
    
    nodes.forEach(node => {
      if (node.status === 'active') {
        const cpu = node.performance?.cpu || 0;
        const memory = node.performance?.memory || 0;
        
        if (cpu > 90) {
          alerts.push({
            nodeId: node.code,
            message: `Node ${node.name}: CPU usage critical (${cpu}%)`,
            severity: 'critical',
            timestamp: new Date()
          });
        } else if (cpu > 80) {
          alerts.push({
            nodeId: node.code,
            message: `Node ${node.name}: High CPU usage (${cpu}%)`,
            severity: 'warning',
            timestamp: new Date()
          });
        }
        
        if (memory > 90) {
          alerts.push({
            nodeId: node.code,
            message: `Node ${node.name}: Memory usage critical (${memory}%)`,
            severity: 'critical',
            timestamp: new Date()
          });
        }
      }
      
      // Check for offline nodes that were previously active
      if (node.status === 'offline' && node.last_seen) {
        const lastSeen = new Date(node.last_seen);
        const minutesOffline = Math.floor((Date.now() - lastSeen) / (1000 * 60));
        
        if (minutesOffline < 60) {
          alerts.push({
            nodeId: node.code,
            message: `Node ${node.name}: Went offline ${minutesOffline}m ago`,
            severity: 'warning',
            timestamp: new Date()
          });
        }
      }
    });
    
    setPerformanceAlerts(alerts.slice(0, 10)); // Keep only last 10 alerts
  }, []);
  
  // Event handlers
  const handleBlockchainIntegration = useCallback((node) => {
    setSelectedNodeForBlockchain(node);
    setShowBlockchainModal(true);
  }, []);
  
  const handleNodeDetails = useCallback(async (referenceCode) => {
    console.log('Fetching details for node:', referenceCode);
    // Details will be handled by node detail page
  }, []);
  
  const handleClearAlerts = useCallback(() => {
    setPerformanceAlerts([]);
  }, []);
  
  const handleRefresh = useCallback(() => {
    // For WebSocket, we just reconnect
    if (wsConnected) {
      wsDisconnect();
      setTimeout(() => wsConnect(), 1000);
    } else {
      wsConnect();
    }
  }, [wsConnected, wsConnect, wsDisconnect]);
  
  // Loading state
  const isLoading = signatureLoading || (!wsConnected && !wsError);
  
  // Error state
  const error = signatureError || (wsError && dashboardData.nodes.length === 0);
  
  // Extract data
  const { nodes, stats, lastUpdate } = dashboardData;
  
  if (isLoading) {
    return (
      <div className="py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="mb-8">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
          </div>
          <h2 className="text-xl font-bold mb-2">Loading Dashboard</h2>
          <p className="text-gray-400">
            {signatureLoading ? 'Authenticating wallet...' : 'Connecting to real-time data...'}
          </p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="py-8">
        <div className="card glass-effect p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Unable to Load Dashboard</h2>
          <p className="text-gray-400 mb-6">
            {typeof error === 'string' ? error : 'Failed to connect to real-time data'}
          </p>
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
            <p className="text-gray-400 mt-1">Monitor and manage your AeroNyx nodes in real-time</p>
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
              className="p-2 rounded-md bg-background-100 hover:bg-background-200 transition-colors"
              title="Reconnect"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5" 
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
        nodes={nodes}
        performanceAlerts={performanceAlerts}
        lastUpdate={lastUpdate}
        updateSource="websocket"
        connectionStatus={connectionHealth}
        onClearAlerts={handleClearAlerts}
      />
      
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <DashboardStatsCard
          title="Total Nodes"
          value={stats.totalNodes}
          subtitle={`${stats.activeNodes} active`}
          icon="servers"
          color="primary"
          trend={stats.totalNodes > 0 ? "stable" : undefined}
        />
        
        <DashboardStatsCard
          title="Network Status"
          value={stats.activeNodes > 0 ? 'Operational' : 'Offline'}
          subtitle={`${stats.totalNodes > 0 ? ((stats.activeNodes / stats.totalNodes) * 100).toFixed(0) : 0}% uptime`}
          icon="status"
          color={stats.activeNodes > 0 ? 'success' : 'error'}
        />
        
        <DashboardStatsCard
          title="Resource Usage"
          value={`${stats.resourceUtilization}%`}
          subtitle="Average utilization"
          icon="performance"
          color="accent"
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
        {/* Left Column - Node List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card glass-effect">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Your Nodes</h2>
                {nodes.length > 4 && (
                  <Link 
                    href="/dashboard/nodes"
                    className="text-sm text-primary hover:text-primary-600 transition-colors"
                  >
                    View All →
                  </Link>
                )}
              </div>
              
              {nodes.length > 0 ? (
                <NodeList
                  nodes={nodes.slice(0, 4)}
                  onBlockchainIntegrate={handleBlockchainIntegration}
                  onNodeDetails={handleNodeDetails}
                />
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">
                    {wsMonitoring ? 'No nodes found in your account' : 'Waiting for real-time data...'}
                  </p>
                  {!wsMonitoring && (
                    <button 
                      onClick={handleRefresh}
                      className="button-primary"
                    >
                      Connect to Nodes
                    </button>
                  )}
                  {wsMonitoring && (
                    <Link href="/dashboard/register">
                      <button className="button-primary">
                        Register Your First Node
                      </button>
                    </Link>
                  )}
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
                    style={{ width: `${stats.totalNodes > 0 ? (stats.activeNodes / stats.totalNodes) * 100 : 0}%` }}
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
              
              {wsMonitoring && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 animate-pulse"></div>
                  <div>
                    <p className="text-gray-300">Live monitoring active</p>
                    <p className="text-xs text-gray-500">Real-time updates enabled</p>
                  </div>
                </div>
              )}
              
              {performanceAlerts.length > 0 && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 mt-1.5"></div>
                  <div>
                    <p className="text-gray-300">{performanceAlerts.length} performance alerts</p>
                    <p className="text-xs text-gray-500">Check node status</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Blockchain Integration Modal */}
      <BlockchainIntegrationModule
        isOpen={showBlockchainModal}
        onClose={() => {
          setShowBlockchainModal(false);
          setSelectedNodeForBlockchain(null);
        }}
        selectedNode={selectedNodeForBlockchain}
      />
    </div>
  );
}
