/**
 * Dashboard Content Component for AeroNyx Platform
 * 
 * File Path: src/components/dashboard/DashboardContent.js
 * 
 * Production-ready dashboard with correct WebSocket authentication flow
 * Following the exact API documentation sequence
 * 
 * @version 6.0.1
 * @author AeroNyx Development Team
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';

// Component imports
import DashboardStatsCard from './DashboardStatsCard';
import NodeList from './NodeList';
import QuickActionButton from './QuickActionButton';
import RealTimeNodeMonitor from './RealTimeDashboard';
import BlockchainIntegrationModule from './BlockchainIntegrationModule';

// Hook imports
import { useWallet } from '../wallet/WalletProvider';
import { signMessage } from '../../lib/utils/walletSignature';

/**
 * Dashboard Content Component
 * 
 * @returns {React.ReactElement} Dashboard content
 */
export default function DashboardContent() {
  const [showBlockchainModal, setShowBlockchainModal] = useState(false);
  const [selectedNodeForBlockchain, setSelectedNodeForBlockchain] = useState(null);
  
  // Wallet
  const { wallet } = useWallet();
  
  // WebSocket state
  const [wsState, setWsState] = useState({
    connected: false,
    authenticated: false,
    monitoring: false,
    authState: 'idle', // idle, connecting, requesting_message, signing, authenticating, authenticated, error
    error: null
  });
  
  // Dashboard data state
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
  
  // Refs
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const sessionTokenRef = useRef(null);
  
  // Calculate resource utilization
  const calculateResourceUtilization = useCallback((nodes) => {
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;
    
    const activeNodes = nodes.filter(n => n.status === 'active' || n.status === 'online');
    if (activeNodes.length === 0) return 0;
    
    const totalUtil = activeNodes.reduce((sum, node) => {
      const cpu = node.performance?.cpu || 0;
      const memory = node.performance?.memory || 0;
      return sum + ((cpu + memory) / 2);
    }, 0);
    
    return Math.round(totalUtil / activeNodes.length);
  }, []);
  
  // Process nodes data from WebSocket
  const processNodesData = useCallback((data) => {
    console.log('[DashboardContent] Processing nodes data:', data);
    
    if (!data || !data.nodes || !Array.isArray(data.nodes)) {
      console.warn('[DashboardContent] Invalid nodes data');
      return;
    }
    
    const nodes = data.nodes;
    
    // Calculate statistics
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
    
    // Check for alerts
    checkPerformanceAlerts(nodes);
  }, [calculateResourceUtilization]);
  
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
    });
    
    setPerformanceAlerts(alerts.slice(0, 10));
  }, []);
  
  // Send WebSocket message
  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = JSON.stringify(data);
      console.log('[DashboardContent] Sending:', data.type, data);
      wsRef.current.send(message);
    } else {
      console.warn('[DashboardContent] WebSocket not ready, state:', wsRef.current?.readyState);
    }
  }, []);
  
  // Handle WebSocket messages
  const handleMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('[DashboardContent] Received:', data.type, data);
      
      switch (data.type) {
        case 'connected':
          // Step 1: Connection established, request signature message
          console.log('[DashboardContent] Connected, requesting signature message...');
          setWsState(prev => ({ ...prev, connected: true, authState: 'requesting_message' }));
          
          // IMPORTANT: Must request signature message with lowercase address
          sendMessage({
            type: 'get_message',
            wallet_address: wallet.address.toLowerCase()  // FIX: Ensure lowercase
          });
          break;
          
        case 'signature_message':
          // Step 2: Received signature message, now sign it
          console.log('[DashboardContent] Received signature message:', data.message);
          setWsState(prev => ({ ...prev, authState: 'signing' }));
          
          try {
            // Sign the message with wallet
            const signature = await signMessage(
              wallet.provider,
              data.message,
              wallet.address
            );
            
            console.log('[DashboardContent] Message signed, sending auth...');
            setWsState(prev => ({ ...prev, authState: 'authenticating' }));
            
            // Send authentication with exact message and lowercase address
            sendMessage({
              type: 'auth',
              wallet_address: wallet.address.toLowerCase(),  // FIX: Ensure lowercase
              signature: signature,
              message: data.message, // Must be exact same message
              wallet_type: 'okx'
            });
            
          } catch (error) {
            console.error('[DashboardContent] Signing error:', error);
            setWsState(prev => ({ 
              ...prev, 
              authState: 'error', 
              error: 'Failed to sign message' 
            }));
          }
          break;
          
        case 'auth_success':
          // Step 3: Authentication successful
          console.log('[DashboardContent] Authentication successful:', data);
          sessionTokenRef.current = data.session_token;
          
          setWsState(prev => ({ 
            ...prev, 
            authenticated: true, 
            authState: 'authenticated',
            error: null
          }));
          
          // Initialize nodes from auth response
          if (data.nodes) {
            const initialNodes = data.nodes.map(node => ({
              code: node.code,
              name: node.name,
              id: node.id,
              status: 'unknown',
              type: 'unknown',
              performance: { cpu: 0, memory: 0, disk: 0, network: 0 },
              earnings: 0,
              last_seen: null
            }));
            
            setDashboardData(prev => ({
              ...prev,
              nodes: initialNodes,
              stats: {
                ...prev.stats,
                totalNodes: initialNodes.length
              }
            }));
          }
          
          // Step 4: Start monitoring
          console.log('[DashboardContent] Starting monitoring...');
          sendMessage({ type: 'start_monitor' });
          break;
          
        case 'monitor_started':
          console.log('[DashboardContent] Monitoring started, interval:', data.interval);
          setWsState(prev => ({ ...prev, monitoring: true }));
          break;
          
        case 'status_update':
          // Regular status updates
          console.log('[DashboardContent] Status update received');
          setWsState(prev => ({ ...prev, monitoring: true }));
          processNodesData(data);
          break;
          
        case 'error':
          console.error('[DashboardContent] Server error:', data);
          setWsState(prev => ({ 
            ...prev, 
            error: data.message || 'Server error',
            authState: data.error_code === 'authentication_required' ? 'requesting_message' : prev.authState
          }));
          
          // Handle specific errors
          if (data.error_code === 'authentication_required' || data.error_code === 'invalid_signature') {
            // Re-authenticate with lowercase address
            sendMessage({
              type: 'get_message',
              wallet_address: wallet.address.toLowerCase()  // FIX: Ensure lowercase
            });
          }
          break;
          
        case 'pong':
          console.log('[DashboardContent] Pong received');
          break;
          
        default:
          console.log('[DashboardContent] Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('[DashboardContent] Message handling error:', error);
    }
  }, [wallet.address, wallet.provider, sendMessage, processNodesData]);
  
  // Setup WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (!wallet.connected) {
      console.log('[DashboardContent] Wallet not connected, skipping WebSocket');
      return;
    }
    
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    console.log('[DashboardContent] Connecting to WebSocket...');
    setWsState(prev => ({ ...prev, authState: 'connecting', error: null }));
    
    try {
      const ws = new WebSocket('wss://api.aeronyx.network/ws/aeronyx/user-monitor/');
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('[DashboardContent] WebSocket opened');
        reconnectAttemptsRef.current = 0;
        // Wait for 'connected' message from server
      };
      
      ws.onmessage = handleMessage;
      
      ws.onerror = (error) => {
        console.error('[DashboardContent] WebSocket error:', error);
        setWsState(prev => ({ 
          ...prev, 
          error: 'Connection error' 
        }));
      };
      
      ws.onclose = (event) => {
        console.log('[DashboardContent] WebSocket closed:', event.code, event.reason);
        
        setWsState(prev => ({ 
          ...prev, 
          connected: false,
          authenticated: false,
          monitoring: false,
          authState: 'idle'
        }));
        
        // Handle reconnection
        if (event.code !== 1000 && reconnectAttemptsRef.current < 5 && mountedRef.current) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`[DashboardContent] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connectWebSocket();
            }
          }, delay);
        }
      };
      
    } catch (error) {
      console.error('[DashboardContent] Connection error:', error);
      setWsState(prev => ({ 
        ...prev, 
        authState: 'error', 
        error: 'Failed to connect' 
      }));
    }
  }, [wallet.connected, handleMessage]);
  
  // Initialize WebSocket when wallet is connected
  useEffect(() => {
    mountedRef.current = true;
    
    if (wallet.connected) {
      connectWebSocket();
    }
    
    return () => {
      mountedRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [wallet.connected, connectWebSocket]);
  
  // Event handlers
  const handleBlockchainIntegration = useCallback((node) => {
    setSelectedNodeForBlockchain(node);
    setShowBlockchainModal(true);
  }, []);
  
  const handleNodeDetails = useCallback(async (referenceCode) => {
    console.log('Fetching details for node:', referenceCode);
  }, []);
  
  const handleClearAlerts = useCallback(() => {
    setPerformanceAlerts([]);
  }, []);
  
  const handleRefresh = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connectWebSocket();
  }, [connectWebSocket]);
  
  // Connection health
  const connectionHealth = {
    excellent: { status: 'excellent', label: 'Live Monitoring', color: 'green' },
    authenticated: { status: 'good', label: 'Authenticated', color: 'blue' },
    connected: { status: 'fair', label: 'Connected', color: 'yellow' },
    connecting: { status: 'connecting', label: 'Connecting...', color: 'yellow' },
    error: { status: 'error', label: 'Error', color: 'red' },
    disconnected: { status: 'disconnected', label: 'Disconnected', color: 'gray' }
  };
  
  const currentHealth = wsState.monitoring ? connectionHealth.excellent :
                       wsState.authenticated ? connectionHealth.authenticated :
                       wsState.connected ? connectionHealth.connected :
                       wsState.authState === 'connecting' ? connectionHealth.connecting :
                       wsState.error ? connectionHealth.error :
                       connectionHealth.disconnected;
  
  // Extract data
  const { nodes, stats, lastUpdate } = dashboardData;
  
  // Determine loading state
  const isLoading = wallet.connected && wsState.authState === 'connecting';
  
  // Determine error state
  const hasError = wsState.authState === 'error' && nodes.length === 0;
  
  if (isLoading) {
    return (
      <div className="py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="mb-8">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
          </div>
          <h2 className="text-xl font-bold mb-2">Connecting to Dashboard</h2>
          <p className="text-gray-400">Establishing secure connection...</p>
        </div>
      </div>
    );
  }
  
  if (hasError) {
    return (
      <div className="py-8">
        <div className="card glass-effect p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Connection Error</h2>
          <p className="text-gray-400 mb-6">
            {wsState.error || 'Failed to establish connection'}
          </p>
          <button
            onClick={handleRefresh}
            className="button-primary"
          >
            Retry Connection
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
            <p className="text-gray-400 mt-1">
              {wsState.monitoring ? 'Real-time monitoring active' : 
               wsState.authenticated ? 'Authenticated, starting monitor...' :
               wsState.authState === 'requesting_message' ? 'Requesting authentication...' :
               wsState.authState === 'signing' ? 'Signing message...' :
               wsState.authState === 'authenticating' ? 'Authenticating...' :
               wsState.connected ? 'Connected, authenticating...' :
               'Connect your wallet to view nodes'}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-md bg-${currentHealth.color}-900/30 border border-${currentHealth.color}-800`}>
              <div className={`w-2 h-2 rounded-full bg-${currentHealth.color}-500 ${
                currentHealth.status === 'excellent' ? 'animate-pulse' : ''
              }`}></div>
              <span className={`text-xs text-${currentHealth.color}-400`}>
                {currentHealth.label}
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
      {wsState.monitoring && (
        <RealTimeNodeMonitor
          nodes={nodes}
          performanceAlerts={performanceAlerts}
          lastUpdate={lastUpdate}
          updateSource="websocket"
          connectionStatus={currentHealth}
          onClearAlerts={handleClearAlerts}
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
              
              {/* Debug info - remove in production */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mb-4 p-2 bg-gray-800 rounded text-xs font-mono">
                  <div>State: {wsState.authState}</div>
                  <div>Connected: {wsState.connected ? '✓' : '✗'}</div>
                  <div>Authenticated: {wsState.authenticated ? '✓' : '✗'}</div>
                  <div>Monitoring: {wsState.monitoring ? '✓' : '✗'}</div>
                  <div>Nodes: {nodes.length}</div>
                  {wsState.error && <div className="text-red-400">Error: {wsState.error}</div>}
                </div>
              )}
              
              {nodes.length > 0 ? (
                <NodeList
                  nodes={nodes.slice(0, 4)}
                  onBlockchainIntegrate={handleBlockchainIntegration}
                  onNodeDetails={handleNodeDetails}
                />
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">
                    {wsState.monitoring ? 'No nodes found in your account' : 
                     wsState.authenticated ? 'Loading nodes...' :
                     wsState.connected ? 'Authenticating...' :
                     'Connecting to node network...'}
                  </p>
                  {wsState.monitoring && (
                    <Link href="/dashboard/register">
                      <button className="button-primary">
                        Register Your First Node
                      </button>
                    </Link>
                  )}
                  {!wsState.connected && wallet.connected && (
                    <button 
                      onClick={handleRefresh}
                      className="button-primary"
                    >
                      Connect to Nodes
                    </button>
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
              
              {wsState.monitoring && (
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
