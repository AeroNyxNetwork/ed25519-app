/**
 * Dashboard Content Component - WebSocket Only Implementation
 * 
 * File Path: src/components/dashboard/DashboardContent.js
 * 
 * IMPORTANT: This component uses WebSocket ONLY for all data communication.
 * DO NOT add REST API calls - all data must come through WebSocket connection.
 * 
 * WebSocket Protocol Flow:
 * 1. Connect to wss://api.aeronyx.network/ws/aeronyx/user-monitor/
 * 2. Receive 'connected' message
 * 3. Send 'get_message' with wallet_address
 * 4. Receive 'signature_message' with message to sign
 * 5. Sign message with wallet
 * 6. Send 'auth' with signature
 * 7. Receive 'auth_success' with nodes
 * 8. Send 'start_monitor' to begin monitoring
 * 9. Receive periodic 'status_update' messages
 * 
 * @version 11.0.0
 * @author AeroNyx Development Team
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Server, 
  Activity, 
  Zap, 
  DollarSign,
  RefreshCw,
  Plus,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';

// Component imports
import { useWallet } from '../wallet/WalletProvider';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100
    }
  }
};

/**
 * Dashboard Content Component
 * 
 * RULES:
 * 1. NO REST API calls - all data via WebSocket
 * 2. wallet_type MUST be 'okx' for OKX wallet
 * 3. Message signing must use exact wallet address from signature message
 * 4. All wallet addresses sent to backend must be lowercase
 * 5. Signature must include '0x' prefix
 */
export default function DashboardContent() {
  const { wallet } = useWallet();
  
  // State
  const [wsState, setWsState] = useState({
    connected: false,
    authenticated: false,
    monitoring: false,
    authState: 'idle', // idle, connecting, requesting_message, signing, authenticating, authenticated, error
    error: null
  });
  
  const [dashboardData, setDashboardData] = useState({
    nodes: [],
    stats: {
      totalNodes: 0,
      activeNodes: 0,
      offlineNodes: 0,
      totalEarnings: 0,
      resourceUtilization: 0
    },
    lastUpdate: null
  });
  
  // Refs
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  
  /**
   * Calculate resource utilization from nodes
   * @param {Array} nodes - Array of node objects
   * @returns {number} Average resource utilization percentage
   */
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
  
  /**
   * Process nodes data from WebSocket status_update
   * @param {Object} data - WebSocket message data
   */
  const processNodesData = useCallback((data) => {
    if (!data || !data.nodes || !Array.isArray(data.nodes)) {
      return;
    }
    
    const nodes = data.nodes;
    
    const stats = {
      totalNodes: nodes.length,
      activeNodes: nodes.filter(n => n.status === 'active').length,
      offlineNodes: nodes.filter(n => n.status === 'offline').length,
      totalEarnings: nodes.reduce((sum, n) => sum + parseFloat(n.earnings || 0), 0),
      resourceUtilization: calculateResourceUtilization(nodes)
    };
    
    setDashboardData({
      nodes: nodes,
      stats: stats,
      lastUpdate: new Date()
    });
  }, [calculateResourceUtilization]);
  
  /**
   * Send message through WebSocket
   * @param {Object} data - Data to send
   */
  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[Dashboard] Sending message:', data.type, data);
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('[Dashboard] Cannot send message - WebSocket not open');
    }
  }, []);
  
  /**
   * Sign message with wallet
   * CRITICAL: Must extract wallet address from message to ensure consistency
   * @param {string} message - Message to sign
   * @returns {Promise<string>} Signature
   */
  const signMessage = useCallback(async (message) => {
    // Extract wallet address from message to ensure exact match
    const walletMatch = message.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/);
    if (!walletMatch || !walletMatch[1]) {
      throw new Error('Could not extract wallet address from message');
    }
    
    const messageWallet = walletMatch[1];
    console.log('[Dashboard] Signing with wallet address from message:', messageWallet);
    
    // For OKX wallet, ensure we use the correct account
    if (window.okxwallet && wallet.provider === window.okxwallet) {
      const accounts = await wallet.provider.request({ method: 'eth_accounts' });
      const accountToUse = accounts.find(acc => acc.toLowerCase() === messageWallet.toLowerCase()) || accounts[0];
      
      const signature = await wallet.provider.request({
        method: 'personal_sign',
        params: [message, accountToUse]
      });
      
      return signature.startsWith('0x') ? signature : `0x${signature}`;
    }
    
    // Standard signing for other wallets
    const signature = await wallet.provider.request({
      method: 'personal_sign',
      params: [message, messageWallet]
    });
    
    return signature.startsWith('0x') ? signature : `0x${signature}`;
  }, [wallet]);
  
  /**
   * Handle WebSocket messages
   * @param {MessageEvent} event - WebSocket message event
   */
  const handleMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('[Dashboard] Received message:', data.type, data);
      
      switch (data.type) {
        case 'connected':
          // Step 1: WebSocket connected, request signature message
          setWsState(prev => ({ ...prev, connected: true, authState: 'requesting_message', error: null }));
          sendMessage({
            type: 'get_message',
            wallet_address: wallet.address.toLowerCase() // Backend expects lowercase
          });
          break;
          
        case 'signature_message':
          // Step 2: Received message to sign
          setWsState(prev => ({ ...prev, authState: 'signing' }));
          
          try {
            // Sign the message
            const signature = await signMessage(data.message);
            console.log('[Dashboard] Signature obtained:', signature);
            
            setWsState(prev => ({ ...prev, authState: 'authenticating' }));
            
            // Extract wallet address from message for consistency
            const walletMatch = data.message.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/);
            const messageWallet = walletMatch ? walletMatch[1] : wallet.address;
            
            // Send authentication request
            sendMessage({
              type: 'auth',
              wallet_address: messageWallet.toLowerCase(), // Backend expects lowercase
              signature: signature,
              message: data.message, // Use exact message from server
              wallet_type: 'okx' // IMPORTANT: Backend code shows OKX-specific handling
            });
            
          } catch (error) {
            console.error('[Dashboard] Signing error:', error);
            setWsState(prev => ({ 
              ...prev, 
              authState: 'error', 
              error: 'Failed to sign message: ' + error.message 
            }));
          }
          break;
          
        case 'auth_success':
          // Step 3: Authentication successful
          console.log('[Dashboard] Authentication successful');
          setWsState(prev => ({ 
            ...prev, 
            authenticated: true, 
            authState: 'authenticated',
            error: null
          }));
          
          reconnectAttemptsRef.current = 0; // Reset reconnect attempts
          
          // Process initial nodes if provided
          if (data.nodes) {
            const initialNodes = data.nodes.map(node => ({
              code: node.code,
              name: node.name,
              id: node.id,
              status: 'unknown', // Will be updated by status_update
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
          
          // Start monitoring
          sendMessage({ type: 'start_monitor' });
          break;
          
        case 'monitor_started':
          // Step 4: Monitoring started
          console.log('[Dashboard] Monitoring started');
          setWsState(prev => ({ ...prev, monitoring: true }));
          break;
          
        case 'status_update':
          // Step 5: Periodic status updates
          setWsState(prev => ({ ...prev, monitoring: true }));
          processNodesData(data);
          break;
          
        case 'error':
          console.error('[Dashboard] Server error:', data);
          setWsState(prev => ({ 
            ...prev, 
            error: data.message || 'Server error'
          }));
          
          // Handle authentication errors
          if (data.error_code === 'authentication_required' || data.error_code === 'invalid_signature') {
            // Need to re-authenticate
            setWsState(prev => ({ ...prev, authenticated: false, authState: 'requesting_message' }));
            sendMessage({
              type: 'get_message',
              wallet_address: wallet.address.toLowerCase()
            });
          }
          break;
          
        case 'pong':
          // Response to ping
          console.log('[Dashboard] Pong received');
          break;
          
        default:
          console.log('[Dashboard] Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('[Dashboard] Message handling error:', error);
    }
  }, [wallet.address, sendMessage, processNodesData, signMessage]);
  
  /**
   * Connect to WebSocket
   * IMPORTANT: Only connects when wallet is ready and not already connecting
   */
  const connectWebSocket = useCallback(() => {
    // Prevent multiple simultaneous connections
    if (!wallet.connected || isConnectingRef.current || wsRef.current) {
      console.log('[Dashboard] Skipping connection:', {
        walletConnected: wallet.connected,
        isConnecting: isConnectingRef.current,
        hasWebSocket: !!wsRef.current
      });
      return;
    }
    
    isConnectingRef.current = true;
    setWsState(prev => ({ ...prev, authState: 'connecting', error: null }));
    
    try {
      console.log('[Dashboard] Connecting to WebSocket');
      const ws = new WebSocket('wss://api.aeronyx.network/ws/aeronyx/user-monitor/');
      wsRef.current = ws;
      
      // Connection timeout
      const timeoutId = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.error('[Dashboard] Connection timeout');
          ws.close();
          setWsState(prev => ({ 
            ...prev, 
            authState: 'error',
            error: 'Connection timeout' 
          }));
          isConnectingRef.current = false;
        }
      }, 10000);
      
      ws.onopen = () => {
        console.log('[Dashboard] WebSocket opened');
        clearTimeout(timeoutId);
        // Wait for 'connected' message from server
      };
      
      ws.onmessage = handleMessage;
      
      ws.onerror = (error) => {
        console.error('[Dashboard] WebSocket error:', error);
        clearTimeout(timeoutId);
        setWsState(prev => ({ 
          ...prev, 
          error: 'Connection error' 
        }));
      };
      
      ws.onclose = (event) => {
        console.log('[Dashboard] WebSocket closed:', event.code, event.reason);
        clearTimeout(timeoutId);
        wsRef.current = null;
        isConnectingRef.current = false;
        
        setWsState(prev => ({ 
          ...prev, 
          connected: false,
          authenticated: false,
          monitoring: false,
          authState: 'idle'
        }));
        
        // Handle reconnection for abnormal closures
        if (event.code !== 1000 && mountedRef.current && reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(3000 * reconnectAttemptsRef.current, 15000);
          
          console.log(`[Dashboard] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && wallet.connected) {
              connectWebSocket();
            }
          }, delay);
        } else if (reconnectAttemptsRef.current >= 5) {
          setWsState(prev => ({ 
            ...prev, 
            error: 'Unable to establish connection. Please refresh the page.' 
          }));
        }
      };
      
      // Set up ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
      
      // Store interval ID for cleanup
      ws.pingInterval = pingInterval;
      
    } catch (error) {
      console.error('[Dashboard] WebSocket setup error:', error);
      wsRef.current = null;
      isConnectingRef.current = false;
      setWsState(prev => ({ 
        ...prev, 
        authState: 'error', 
        error: 'Failed to connect' 
      }));
    }
  }, [wallet.connected, handleMessage]);
  
  /**
   * Initialize WebSocket when wallet is connected
   * IMPORTANT: Do not add connectWebSocket to dependencies to avoid loops
   */
  useEffect(() => {
    mountedRef.current = true;
    reconnectAttemptsRef.current = 0;
    
    if (wallet.connected && wallet.address) {
      // Add a small delay to ensure wallet is fully ready
      const initTimeout = setTimeout(() => {
        if (mountedRef.current && !wsRef.current && !isConnectingRef.current) {
          connectWebSocket();
        }
      }, 500);
      
      return () => {
        clearTimeout(initTimeout);
      };
    }
    
    return () => {
      mountedRef.current = false;
      isConnectingRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        // Stop monitoring before disconnect
        if (wsRef.current.readyState === WebSocket.OPEN && wsState.monitoring) {
          wsRef.current.send(JSON.stringify({ type: 'stop_monitor' }));
        }
        
        // Clear ping interval
        if (wsRef.current.pingInterval) {
          clearInterval(wsRef.current.pingInterval);
        }
        
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
    };
  }, [wallet.connected, wallet.address]); // Do NOT add connectWebSocket here
  
  /**
   * Handle refresh - reconnect WebSocket
   */
  const handleRefresh = useCallback(() => {
    console.log('[Dashboard] Refreshing connection');
    reconnectAttemptsRef.current = 0;
    isConnectingRef.current = false;
    
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close(1000, 'User refresh');
      wsRef.current = null;
    }
    
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    // Reset state
    setWsState({
      connected: false,
      authenticated: false,
      monitoring: false,
      authState: 'idle',
      error: null
    });
    
    // Reconnect after a short delay
    setTimeout(() => {
      if (mountedRef.current && wallet.connected) {
        connectWebSocket();
      }
    }, 500);
  }, [wallet.connected, connectWebSocket]);

  // Loading state
  if (!wallet.connected) {
    return <WalletConnectionPrompt />;
  }

  const isLoading = wsState.authState === 'connecting' || wsState.authState === 'signing' || wsState.authState === 'authenticating';

  return (
    <div className="min-h-screen bg-black">
      {/* Background effects */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>
      
      <div className="relative z-10 px-6 py-8 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Node Dashboard
              </h1>
              <p className="text-gray-400 mt-1">
                {getStatusMessage(wsState)}
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <ConnectionBadge status={wsState} />
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRefresh}
                disabled={isLoading}
                className={clsx(
                  "p-3 rounded-xl border transition-all",
                  "bg-white/5 border-white/10",
                  "hover:bg-white/10 hover:border-white/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <RefreshCw className={clsx("w-5 h-5 text-gray-400", isLoading && "animate-spin")} />
              </motion.button>
            </div>
          </div>
        </motion.div>
        
        {/* Loading State */}
        <AnimatePresence mode="wait">
          {isLoading ? (
            <LoadingState key="loading" />
          ) : wsState.error && dashboardData.nodes.length === 0 ? (
            <ErrorState key="error" error={wsState.error} onRetry={handleRefresh} />
          ) : (
            <motion.div
              key="content"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatsCard
                  icon={Server}
                  title="Total Nodes"
                  value={dashboardData.stats.totalNodes}
                  subtitle={`${dashboardData.stats.activeNodes} active`}
                  trend="neutral"
                />
                
                <StatsCard
                  icon={Activity}
                  title="Network Status"
                  value={dashboardData.stats.activeNodes > 0 ? 'Online' : 'Offline'}
                  subtitle={`${calculateUptime(dashboardData.stats)}% uptime`}
                  trend={dashboardData.stats.activeNodes > 0 ? 'up' : 'down'}
                />
                
                <StatsCard
                  icon={Zap}
                  title="Resource Usage"
                  value={`${dashboardData.stats.resourceUtilization}%`}
                  subtitle="Average utilization"
                  trend="neutral"
                />
                
                <StatsCard
                  icon={DollarSign}
                  title="Total Earnings"
                  value={`$${dashboardData.stats.totalEarnings.toFixed(2)}`}
                  subtitle="Lifetime earnings"
                  trend="up"
                />
              </div>
              
              {/* Main Content */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Nodes Section */}
                <motion.div variants={itemVariants} className="lg:col-span-2">
                  <GlassCard>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-semibold text-white">Active Nodes</h2>
                      {dashboardData.nodes.length > 4 && (
                        <Link 
                          href="/dashboard/nodes"
                          className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-all hover:translate-x-1"
                        >
                          View all
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      )}
                    </div>
                    
                    {dashboardData.nodes.length > 0 ? (
                      <div className="space-y-4">
                        <AnimatePresence>
                          {dashboardData.nodes.slice(0, 4).map((node) => (
                            <NodeCard key={node.code} node={node} />
                          ))}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <EmptyNodes isMonitoring={wsState.monitoring} />
                    )}
                  </GlassCard>
                </motion.div>
                
                {/* Sidebar */}
                <div className="space-y-6">
                  {/* Quick Actions */}
                  <motion.div variants={itemVariants}>
                    <GlassCard>
                      <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
                      <div className="space-y-3">
                        <QuickAction
                          icon={Plus}
                          title="Register Node"
                          href="/dashboard/register"
                          primary
                        />
                        <QuickAction
                          icon={Server}
                          title="Manage Nodes"
                          href="/dashboard/nodes"
                        />
                        <QuickAction
                          icon={Activity}
                          title="Network Stats"
                          href="/dashboard/network"
                        />
                      </div>
                    </GlassCard>
                  </motion.div>
                  
                  {/* Network Health */}
                  <motion.div variants={itemVariants}>
                    <GlassCard>
                      <h3 className="text-lg font-semibold text-white mb-4">Network Health</h3>
                      <div className="space-y-4">
                        <HealthMetric
                          label="Active Nodes"
                          value={dashboardData.stats.activeNodes}
                          max={dashboardData.stats.totalNodes || 1}
                          color="green"
                        />
                        <HealthMetric
                          label="Resource Usage"
                          value={dashboardData.stats.resourceUtilization}
                          max={100}
                          color="purple"
                        />
                      </div>
                    </GlassCard>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Sub Components (unchanged, keeping them for completeness)

function GlassCard({ children, className }) {
  return (
    <div className={clsx(
      "bg-white/5 backdrop-blur-md rounded-2xl border border-white/10",
      "shadow-[0_8px_32px_0_rgba(31,38,135,0.37)]",
      "hover:bg-white/[0.07] hover:border-white/20",
      "transition-all duration-300",
      className
    )}>
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}

function ConnectionBadge({ status }) {
  const config = {
    monitoring: { color: 'green', label: 'Live', Icon: Activity, pulse: true },
    authenticated: { color: 'blue', label: 'Connected', Icon: CheckCircle },
    connected: { color: 'yellow', label: 'Connecting', Icon: Loader2, spin: true },
    idle: { color: 'gray', label: 'Offline', Icon: XCircle }
  };
  
  const state = status.monitoring ? 'monitoring' : 
                status.authenticated ? 'authenticated' :
                status.connected ? 'connected' : 'idle';
  
  const { color, label, Icon, pulse, spin } = config[state];
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={clsx(
        "flex items-center gap-2 px-4 py-2 rounded-full",
        `bg-${color}-500/10 border border-${color}-500/20`
      )}
    >
      <Icon className={clsx(
        `w-4 h-4 text-${color}-400`,
        pulse && "animate-pulse",
        spin && "animate-spin"
      )} />
      <span className={`text-xs font-medium text-${color}-400`}>{label}</span>
    </motion.div>
  );
}

function StatsCard({ icon: Icon, title, value, subtitle, trend }) {
  const trendConfig = {
    up: { color: 'green', gradient: 'from-green-500/20 to-green-600/20' },
    down: { color: 'red', gradient: 'from-red-500/20 to-red-600/20' },
    neutral: { color: 'purple', gradient: 'from-purple-500/20 to-blue-600/20' }
  };
  
  const { gradient } = trendConfig[trend];
  
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -5, transition: { type: "spring", stiffness: 300 } }}
      className="relative group"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />
      <GlassCard className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className={clsx(
            "p-3 rounded-xl bg-gradient-to-br",
            gradient
          )}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
        <h3 className="text-sm font-medium text-gray-400 mb-1">{title}</h3>
        <p className="text-2xl font-bold text-white mb-1">{value}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </GlassCard>
    </motion.div>
  );
}

function NodeCard({ node }) {
  const statusConfig = {
    active: { color: 'green', Icon: CheckCircle, label: 'Active' },
    offline: { color: 'red', Icon: XCircle, label: 'Offline' },
    pending: { color: 'yellow', Icon: AlertCircle, label: 'Pending' }
  };
  
  const config = statusConfig[node.status] || statusConfig.offline;
  const { Icon } = config;
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      whileHover={{ x: 5 }}
      className={clsx(
        "flex items-center justify-between p-4 rounded-xl",
        "bg-white/5 hover:bg-white/10",
        "border border-transparent hover:border-white/10",
        "transition-all cursor-pointer"
      )}
    >
      <div className="flex items-center gap-4">
        <div className={clsx(
          "p-2 rounded-lg",
          `bg-${config.color}-500/10`
        )}>
          <Server className={`w-5 h-5 text-${config.color}-400`} />
        </div>
        <div>
          <h4 className="font-medium text-white">{node.name}</h4>
          <p className="text-sm text-gray-400">{node.code}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-white">${node.earnings || '0.00'}</p>
          <p className="text-xs text-gray-500">Earned</p>
        </div>
        <Icon className={`w-5 h-5 text-${config.color}-400`} />
      </div>
    </motion.div>
  );
}

function QuickAction({ icon: Icon, title, href, primary }) {
  return (
    <Link href={href}>
      <motion.a
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={clsx(
          "flex items-center gap-3 p-3 rounded-xl transition-all",
          primary 
            ? "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white" 
            : "bg-white/5 hover:bg-white/10 text-gray-300"
        )}
      >
        <Icon className="w-5 h-5" />
        <span className="font-medium">{title}</span>
        <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
      </motion.a>
    </Link>
  );
}

function HealthMetric({ label, value, max, color }) {
  const percentage = (value / max) * 100;
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-medium">{value}/{max}</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={clsx(
            "h-full bg-gradient-to-r",
            color === 'green' && "from-green-500 to-green-400",
            color === 'purple' && "from-purple-500 to-purple-400"
          )}
        />
      </div>
    </div>
  );
}

function EmptyNodes({ isMonitoring }) {
  return (
    <div className="text-center py-12">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
        className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4"
      >
        <Server className="w-8 h-8 text-gray-600" />
      </motion.div>
      <h3 className="text-lg font-medium text-white mb-2">No nodes yet</h3>
      <p className="text-gray-400 mb-6">
        {isMonitoring ? 'Register your first node to get started' : 'Connecting to network...'}
      </p>
      {isMonitoring && (
        <Link href="/dashboard/register">
          <motion.a
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-white font-medium hover:from-purple-700 hover:to-blue-700 transition-all"
          >
            <Plus className="w-5 h-5" />
            Register Node
          </motion.a>
        </Link>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-[400px]"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full"
      />
      <p className="mt-4 text-gray-400">Connecting to network...</p>
    </motion.div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="text-center py-12"
    >
      <GlassCard className="max-w-md mx-auto">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Connection Error</h3>
        <p className="text-gray-400 mb-6">{error}</p>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRetry}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-white font-medium hover:from-purple-700 hover:to-blue-700 transition-all"
        >
          Retry Connection
        </motion.button>
      </GlassCard>
    </motion.div>
  );
}

function WalletConnectionPrompt() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <GlassCard className="max-w-md mx-auto">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Server className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
          <p className="text-gray-400 mb-8">Connect your wallet to access the node dashboard and start monitoring your network.</p>
          <div className="text-sm text-gray-500">Use the wallet button in the navigation bar to connect.</div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

// Helper functions
function getStatusMessage(wsState) {
  if (wsState.monitoring) return 'Real-time monitoring active';
  if (wsState.authenticated) return 'Authenticated, starting monitor...';
  if (wsState.authState === 'authenticating') return 'Authenticating with network...';
  if (wsState.authState === 'signing') return 'Signing authentication message...';
  if (wsState.authState === 'requesting_message') return 'Requesting authentication...';
  if (wsState.connected) return 'Connecting to network...';
  return 'Connect your wallet to view nodes';
}

function calculateUptime(stats) {
  if (stats.totalNodes === 0) return 0;
  return Math.round((stats.activeNodes / stats.totalNodes) * 100);
}
