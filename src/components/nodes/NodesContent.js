/**
 * Nodes Content Component - Fully Compliant with AeroNyx WebSocket API
 * 
 * File Path: src/components/nodes/NodesContent.js
 * 
 * Implements the complete WebSocket connection flow as per API documentation
 * 
 * @version 6.0.0
 * @author AeroNyx Development Team
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Server, 
  Plus, 
  Search,
  Filter,
  CheckCircle,
  XCircle,
  AlertCircle,
  Cpu,
  HardDrive,
  Activity,
  DollarSign,
  RefreshCw,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';

import { useWallet } from '../wallet/WalletProvider';
import nodeRegistrationService from '../../lib/api/nodeRegistration';

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

// WebSocket status enum matching API states
const WsStatus = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  REQUESTING_MESSAGE: 'requesting_message',
  SIGNING: 'signing',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  MONITORING: 'monitoring',
  ERROR: 'error',
  DISCONNECTED: 'disconnected'
};

export default function NodesContent() {
  const { wallet } = useWallet();
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState(WsStatus.IDLE);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const sessionTokenRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const signatureMessageRef = useRef(null);

  /**
   * Initialize nodes from REST API first
   * This ensures we have data even if WebSocket fails
   */
  const loadInitialNodes = useCallback(async () => {
    if (!wallet.connected || !wallet.address) return;

    try {
      console.log('[NodesContent] Loading initial nodes from REST API');
      
      // Get signature for API authentication
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }

      // Use the exact wallet.provider.request method for signing
      const signature = await wallet.provider.request({
        method: 'personal_sign',
        params: [messageResponse.data.message, wallet.address]
      });

      // Fetch nodes overview from REST API
      const nodesResponse = await nodeRegistrationService.getUserNodesOverview(
        wallet.address,
        signature,
        messageResponse.data.message,
        'okx'
      );

      if (nodesResponse.success && nodesResponse.data) {
        // Transform REST API nodes to our format
        const allNodes = [];
        
        if (nodesResponse.data.nodes) {
          ['online', 'active', 'offline'].forEach(status => {
            if (nodesResponse.data.nodes[status]) {
              nodesResponse.data.nodes[status].forEach(node => {
                allNodes.push({
                  ...node,
                  code: node.reference_code,
                  name: node.name,
                  status: node.status || status,
                  type: node.node_type?.name || 'General Purpose',
                  performance: {
                    cpu: node.performance?.cpu_usage || 0,
                    memory: node.performance?.memory_usage || 0,
                    disk: node.performance?.storage_usage || 0,
                    network: node.performance?.bandwidth_usage || 0
                  },
                  earnings: node.earnings || '0.00',
                  uptime: node.uptime || '0h 0m',
                  last_seen: node.last_seen
                });
              });
            }
          });
        }

        setNodes(allNodes);
        setLoading(false);
        console.log('[NodesContent] Loaded', allNodes.length, 'nodes from REST API');
      }
    } catch (err) {
      console.error('[NodesContent] Error loading initial nodes:', err);
      setError('Failed to load nodes');
      setLoading(false);
    }
  }, [wallet]);

  /**
   * Sign message using wallet provider
   * CRITICAL: Uses the exact address from the message to ensure consistency
   */
  const signMessage = useCallback(async (message) => {
    if (!wallet.provider || !message) {
      throw new Error('Missing wallet provider or message');
    }

    // Extract the wallet address from the message to ensure consistency
    const walletMatch = message.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/);
    if (!walletMatch || !walletMatch[1]) {
      throw new Error('Could not extract wallet address from message');
    }

    const addressFromMessage = walletMatch[1];
    console.log('[NodesContent] Signing with address from message:', addressFromMessage);

    try {
      const signature = await wallet.provider.request({
        method: 'personal_sign',
        params: [message, addressFromMessage]
      });

      console.log('[NodesContent] Signature obtained successfully');
      return signature;
    } catch (error) {
      console.error('[NodesContent] Signature error:', error);
      throw error;
    }
  }, [wallet]);

  /**
   * Handle WebSocket message based on type
   */
  const handleWebSocketMessage = useCallback(async (data) => {
    console.log('[NodesContent] Received message:', data.type, data);

    switch (data.type) {
      case 'connected':
        console.log('[NodesContent] Step 1: Connection established');
        setWsStatus(WsStatus.CONNECTED);
        // Step 2: Request signature message
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const request = {
            type: 'get_message',
            wallet_address: wallet.address.toLowerCase()
          };
          console.log('[NodesContent] Step 2: Requesting signature message:', request);
          wsRef.current.send(JSON.stringify(request));
          setWsStatus(WsStatus.REQUESTING_MESSAGE);
        }
        break;

      case 'signature_message':
        console.log('[NodesContent] Step 3: Received signature message');
        signatureMessageRef.current = data;
        setWsStatus(WsStatus.SIGNING);
        
        try {
          // Step 4: Sign the message
          const signature = await signMessage(data.message);
          console.log('[NodesContent] Step 4: Message signed successfully');
          
          // Step 5: Send authentication
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const authRequest = {
              type: 'auth',
              wallet_address: wallet.address.toLowerCase(),
              signature: signature,
              message: data.message, // Use exact message from server
              wallet_type: 'okx'
            };
            console.log('[NodesContent] Step 5: Sending authentication');
            wsRef.current.send(JSON.stringify(authRequest));
            setWsStatus(WsStatus.AUTHENTICATING);
          }
        } catch (signError) {
          console.error('[NodesContent] Signing failed:', signError);
          setError('Failed to sign authentication message');
          setWsStatus(WsStatus.ERROR);
        }
        break;

      case 'auth_success':
        console.log('[NodesContent] Step 6: Authentication successful');
        setWsStatus(WsStatus.AUTHENTICATED);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Save session token
        if (data.session_token) {
          sessionTokenRef.current = data.session_token;
          console.log('[NodesContent] Session token saved');
        }
        
        // Update nodes if provided
        if (data.nodes && Array.isArray(data.nodes)) {
          console.log('[NodesContent] Received', data.nodes.length, 'nodes in auth response');
          const formattedNodes = data.nodes.map(node => ({
            id: node.id,
            code: node.code,
            name: node.name,
            status: 'unknown', // Will be updated by status_update
            type: 'General Purpose',
            performance: {
              cpu: 0,
              memory: 0,
              disk: 0,
              network: 0
            },
            earnings: '0.00',
            uptime: '0h 0m',
            last_seen: null
          }));
          setNodes(formattedNodes);
        }
        
        // Step 7: Start monitoring
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          console.log('[NodesContent] Step 7: Starting monitor');
          wsRef.current.send(JSON.stringify({ type: 'start_monitor' }));
        }
        break;

      case 'monitor_started':
        console.log('[NodesContent] Step 8: Monitoring started, updates every', data.interval, 'seconds');
        setWsStatus(WsStatus.MONITORING);
        break;

      case 'status_update':
        console.log('[NodesContent] Step 9: Status update received');
        if (data.nodes && Array.isArray(data.nodes)) {
          const updatedNodes = data.nodes.map(node => ({
            code: node.code,
            name: node.name,
            status: node.status,
            type: node.type || 'General Purpose',
            performance: {
              cpu: node.performance?.cpu || 0,
              memory: node.performance?.memory || 0,
              disk: node.performance?.disk || 0,
              network: node.performance?.network || 0
            },
            earnings: node.earnings || '0.00',
            uptime: node.uptime || '0h 0m',
            last_seen: node.last_seen
          }));
          setNodes(updatedNodes);
          console.log('[NodesContent] Updated', updatedNodes.length, 'nodes');
        }
        break;

      case 'error':
        console.error('[NodesContent] Server error:', data);
        setError(data.message || 'Server error');
        setWsStatus(WsStatus.ERROR);
        
        // Handle specific error codes
        if (data.error_code === 'authentication_required' || data.error_code === 'invalid_signature') {
          console.log('[NodesContent] Authentication error, will retry');
          sessionTokenRef.current = null;
          // Retry connection
          if (reconnectAttemptsRef.current < 3) {
            setTimeout(() => {
              if (mountedRef.current) {
                connectWebSocket();
              }
            }, 3000);
          }
        }
        break;

      case 'pong':
        console.log('[NodesContent] Pong received');
        break;

      default:
        console.log('[NodesContent] Unknown message type:', data.type);
    }
  }, [wallet, signMessage]);

  /**
   * Connect to WebSocket following the exact API flow
   */
  const connectWebSocket = useCallback(async () => {
    if (!wallet.connected || !wallet.address) return;
    
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      setWsStatus(WsStatus.CONNECTING);
      setError(null);
      
      console.log('[NodesContent] Connecting to WebSocket');
      const ws = new WebSocket('wss://api.aeronyx.network/ws/aeronyx/user-monitor/');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[NodesContent] WebSocket connection opened');
        // Wait for 'connected' message from server
      };

      ws.onmessage = async (event) => {
        if (!mountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data);
          await handleWebSocketMessage(data);
        } catch (parseError) {
          console.error('[NodesContent] Message parsing error:', parseError);
        }
      };

      ws.onerror = (error) => {
        console.error('[NodesContent] WebSocket error event:', error);
        setWsStatus(WsStatus.ERROR);
        setError('Connection error');
      };

      ws.onclose = (event) => {
        console.log('[NodesContent] WebSocket closed:', event.code, event.reason);
        setWsStatus(WsStatus.DISCONNECTED);
        
        // Clear session on close
        if (event.code !== 1000) { // Not a normal closure
          sessionTokenRef.current = null;
        }
        
        // Handle reconnection
        if (mountedRef.current && event.code !== 1000 && reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current++;
          const delay = 3000 * reconnectAttemptsRef.current;
          console.log(`[NodesContent] Will reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connectWebSocket();
            }
          }, delay);
        }
      };

      // Set up ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN && wsStatus === WsStatus.MONITORING) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);

      // Store interval ID for cleanup
      ws.pingInterval = pingInterval;

    } catch (error) {
      console.error('[NodesContent] WebSocket setup error:', error);
      setWsStatus(WsStatus.ERROR);
      setError('Failed to establish connection');
    }
  }, [wallet, wsStatus, handleWebSocketMessage]);

  // Initialize data loading
  useEffect(() => {
    mountedRef.current = true;
    
    if (wallet.connected) {
      // Load initial data from REST API first
      loadInitialNodes().then(() => {
        // Then connect WebSocket for real-time updates
        connectWebSocket();
      });
    } else {
      setLoading(false);
    }

    return () => {
      mountedRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        // Stop monitoring before disconnect
        if (wsRef.current.readyState === WebSocket.OPEN && wsStatus === WsStatus.MONITORING) {
          wsRef.current.send(JSON.stringify({ type: 'stop_monitor' }));
        }
        
        // Clear ping interval
        if (wsRef.current.pingInterval) {
          clearInterval(wsRef.current.pingInterval);
        }
        
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [wallet.connected, loadInitialNodes, connectWebSocket]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setError(null);
    reconnectAttemptsRef.current = 0;
    loadInitialNodes();
    connectWebSocket();
  }, [loadInitialNodes, connectWebSocket]);

  // Filter nodes based on search and status
  const filteredNodes = nodes.filter(node => {
    const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         node.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || node.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  // Connection status badge
  const ConnectionBadge = () => {
    const statusConfig = {
      [WsStatus.IDLE]: { color: 'gray', label: 'Idle', Icon: Activity },
      [WsStatus.CONNECTING]: { color: 'yellow', label: 'Connecting', Icon: Loader2, spin: true },
      [WsStatus.CONNECTED]: { color: 'yellow', label: 'Connected', Icon: Activity },
      [WsStatus.REQUESTING_MESSAGE]: { color: 'yellow', label: 'Requesting', Icon: Loader2, spin: true },
      [WsStatus.SIGNING]: { color: 'yellow', label: 'Signing', Icon: Loader2, spin: true },
      [WsStatus.AUTHENTICATING]: { color: 'yellow', label: 'Authenticating', Icon: Loader2, spin: true },
      [WsStatus.AUTHENTICATED]: { color: 'blue', label: 'Authenticated', Icon: CheckCircle },
      [WsStatus.MONITORING]: { color: 'green', label: 'Live', Icon: Activity, pulse: true },
      [WsStatus.ERROR]: { color: 'red', label: 'Error', Icon: XCircle },
      [WsStatus.DISCONNECTED]: { color: 'gray', label: 'Offline', Icon: XCircle }
    };

    const config = statusConfig[wsStatus] || statusConfig[WsStatus.IDLE];
    const { Icon } = config;

    return (
      <div className={clsx(
        "flex items-center gap-2 px-3 py-1 rounded-full text-xs",
        `bg-${config.color}-500/10 border border-${config.color}-500/20`
      )}>
        <Icon className={clsx(
          `w-4 h-4 text-${config.color}-400`,
          config.spin && "animate-spin",
          config.pulse && "animate-pulse"
        )} />
        <span className={`text-${config.color}-400`}>{config.label}</span>
      </div>
    );
  };

  if (!wallet.connected) {
    return <WalletConnectionPrompt />;
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Background effects */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>
      
      <div className="relative z-10 px-6 py-8 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Your Nodes
            </h1>
            <div className="flex items-center gap-4">
              <ConnectionBadge />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRefresh}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
                disabled={loading}
              >
                <RefreshCw className={clsx("w-5 h-5 text-gray-400", loading && "animate-spin")} />
              </motion.button>
            </div>
          </div>
          <p className="text-gray-400">Manage and monitor all your nodes</p>
        </motion.div>

        {/* Error Alert */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-300">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="text-xs text-red-400 underline hover:no-underline mt-1"
                >
                  Try again
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col md:flex-row gap-4 mb-8"
        >
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
            />
          </div>

          {/* Filter */}
          <div className="flex gap-2">
            {['all', 'active', 'offline', 'pending'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={clsx(
                  "px-4 py-2 rounded-lg transition-all",
                  filterStatus === status
                    ? "bg-purple-600 text-white"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                )}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {/* Add Node Button */}
          <Link href="/dashboard/register">
            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-white font-medium hover:from-purple-700 hover:to-blue-700 transition-all"
            >
              <Plus className="w-5 h-5" />
              Register Node
            </motion.a>
          </Link>
        </motion.div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {loading ? (
            <LoadingState key="loading" />
          ) : filteredNodes.length > 0 ? (
            <motion.div
              key="nodes"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {filteredNodes.map((node) => (
                <NodeCard key={node.code} node={node} />
              ))}
            </motion.div>
          ) : (
            <EmptyState key="empty" searchTerm={searchTerm} filterStatus={filterStatus} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Sub-components remain the same...
function NodeCard({ node }) {
  const statusConfig = {
    active: { color: 'green', Icon: CheckCircle, label: 'Active', glow: 'shadow-green-500/20' },
    online: { color: 'green', Icon: CheckCircle, label: 'Online', glow: 'shadow-green-500/20' },
    offline: { color: 'red', Icon: XCircle, label: 'Offline', glow: 'shadow-red-500/20' },
    pending: { color: 'yellow', Icon: AlertCircle, label: 'Pending', glow: 'shadow-yellow-500/20' },
    registered: { color: 'blue', Icon: AlertCircle, label: 'Registered', glow: 'shadow-blue-500/20' },
    unknown: { color: 'gray', Icon: AlertCircle, label: 'Unknown', glow: 'shadow-gray-500/20' }
  };
  
  const config = statusConfig[node.status] || statusConfig.unknown;
  const { Icon } = config;

  const performance = node.performance || {};
  const cpu = performance.cpu || 0;
  const memory = performance.memory || 0;
  const disk = performance.disk || 0;
  const network = performance.network || 0;

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -5 }}
      className="relative group"
    >
      <div className={clsx(
        "absolute inset-0 rounded-2xl blur-xl transition-all opacity-0 group-hover:opacity-100",
        `bg-${config.color}-500/20`
      )} />
      
      <div className="relative bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">{node.name}</h3>
            <p className="text-sm text-gray-400 font-mono">{node.code}</p>
          </div>
          <div className={clsx(
            "flex items-center gap-2 px-3 py-1 rounded-full",
            `bg-${config.color}-500/10 border border-${config.color}-500/20`
          )}>
            <Icon className={`w-4 h-4 text-${config.color}-400`} />
            <span className={`text-xs font-medium text-${config.color}-400`}>{config.label}</span>
          </div>
        </div>

        {/* Node Type */}
        <div className="mb-4">
          <span className="text-xs text-gray-500">Type:</span>
          <span className="text-sm text-gray-300 ml-1">{node.type}</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-2">
            <MetricBar
              icon={Cpu}
              label="CPU"
              value={cpu}
              color="blue"
            />
            <MetricBar
              icon={HardDrive}
              label="Memory"
              value={memory}
              color="purple"
            />
          </div>
          <div className="space-y-2">
            <MetricBar
              icon={HardDrive}
              label="Disk"
              value={disk}
              color="green"
            />
            <MetricBar
              icon={Activity}
              label="Network"
              value={network}
              color="orange"
            />
          </div>
        </div>

        {/* Last Seen */}
        {node.last_seen && (
          <div className="flex items-center justify-between mb-4 text-sm">
            <span className="text-gray-400">Last seen</span>
            <span className="text-white">
              {new Date(node.last_seen).toLocaleString()}
            </span>
          </div>
        )}

        {/* Earnings */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-400">Earnings</span>
          </div>
          <span className="text-lg font-semibold text-white">${node.earnings || '0.00'}</span>
        </div>

        {/* View Details Link */}
        <Link href={`/dashboard/nodes/${node.code}`}>
          <motion.a
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-4 block w-full text-center py-2 rounded-lg bg-white/5 text-purple-400 hover:bg-white/10 transition-all"
          >
            View Details
          </motion.a>
        </Link>
      </div>
    </motion.div>
  );
}

function MetricBar({ icon: Icon, label, value, color }) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-400',
    purple: 'from-purple-500 to-purple-400',
    green: 'from-green-500 to-green-400',
    orange: 'from-orange-500 to-orange-400'
  };

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="flex items-center gap-1">
          <Icon className="w-3 h-3 text-gray-400" />
          <span className="text-gray-400">{label}</span>
        </div>
        <span className="text-white font-medium">{value}%</span>
      </div>
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={clsx("h-full bg-gradient-to-r", colorClasses[color])}
        />
      </div>
    </div>
  );
}

function EmptyState({ searchTerm, filterStatus }) {
  const hasFilters = searchTerm || filterStatus !== 'all';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center py-16"
    >
      <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Server className="w-10 h-10 text-gray-600" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">
        {hasFilters ? 'No nodes found' : 'No nodes yet'}
      </h3>
      <p className="text-gray-400 mb-8">
        {hasFilters 
          ? 'Try adjusting your search or filters'
          : 'Register your first node to get started'
        }
      </p>
      {!hasFilters && (
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
    </motion.div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full mx-auto mb-4"
        />
        <p className="text-gray-400">Loading your nodes...</p>
      </motion.div>
    </div>
  );
}

function WalletConnectionPrompt() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-8">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Server className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
          <p className="text-gray-400">Connect your wallet to view and manage your nodes.</p>
        </div>
      </motion.div>
    </div>
  );
}
