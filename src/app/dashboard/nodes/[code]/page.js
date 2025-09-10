/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Dynamic route for individual node details
 * Modification Reason: Fixed data loading and error handling
 * Main Functionality: Display node details and remote management
 * Dependencies: useWallet, useAeroNyxWebSocket, RemoteManagement
 *
 * Main Logical Flow:
 * 1. Extract node code from URL params
 * 2. Connect to WebSocket and wait for authentication
 * 3. Wait for monitoring to start and data to load
 * 4. Find matching node by code with proper error handling
 * 5. Display node details or show appropriate error state
 *
 * ⚠️ Important Note for Next Developer:
 * - The issue was that the WebSocket wasn't properly authenticated/monitoring
 * - Added proper state checks for WebSocket connection stages
 * - Added better debugging output to help diagnose issues
 * - Increased timeouts and added retry logic
 *
 * Last Modified: v2.0.0 - Fixed WebSocket data loading and error handling
 * ============================================
 */

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '../../../../components/wallet/WalletProvider';
import { useAeroNyxWebSocket } from '../../../../hooks/useAeroNyxWebSocket';
import RemoteManagement from '../../../../components/nodes/RemoteManagement';
import NodePerformanceChart from '../../../../components/dashboard/NodePerformanceChart';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { 
  Server, 
  Activity, 
  Cpu, 
  HardDrive, 
  Zap,
  Terminal,
  ChevronLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  DollarSign,
  RefreshCw,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';

export default function NodeDetailsPage({ params }) {
  const { code } = params;
  const { wallet } = useWallet();
  const router = useRouter();
  const [showRemoteManagement, setShowRemoteManagement] = useState(false);
  const [loadingState, setLoadingState] = useState('initializing');
  const [errorDetails, setErrorDetails] = useState(null);
  const checkTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  
  // Get node data from WebSocket with proper options
  const { 
    nodes, 
    isLoading, 
    wsState, 
    refresh,
    error: wsError 
  } = useAeroNyxWebSocket({
    autoConnect: true,
    autoMonitor: true
  });

  // Enhanced debug logging
  useEffect(() => {
    console.log('[NodeDetails] Current state:', {
      code,
      isLoading,
      wsState,
      nodesCount: nodes.length,
      loadingState,
      retryCount: retryCountRef.current,
      nodes: nodes.map(n => ({ 
        code: n.code, 
        name: n.name,
        status: n.status 
      }))
    });
  }, [code, isLoading, wsState, nodes, loadingState]);

  // Find the specific node (case-insensitive)
  const node = nodes.find(n => 
    n.code && n.code.toUpperCase() === code.toUpperCase()
  );

  // Update loading state based on WebSocket state
  useEffect(() => {
    if (!wsState.connected) {
      setLoadingState('connecting');
    } else if (!wsState.authenticated) {
      setLoadingState('authenticating');
    } else if (!wsState.monitoring) {
      setLoadingState('starting_monitor');
    } else if (nodes.length === 0) {
      setLoadingState('loading_nodes');
    } else if (!node) {
      setLoadingState('searching_node');
    } else {
      setLoadingState('ready');
      setErrorDetails(null);
    }
  }, [wsState, nodes.length, node]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!wallet.connected) {
      console.log('[NodeDetails] Wallet not connected, redirecting to home');
      router.push('/');
    }
  }, [wallet.connected, router]);

  // Handle retry logic
  const handleRetry = useCallback(() => {
    console.log('[NodeDetails] Retrying connection...');
    retryCountRef.current += 1;
    setErrorDetails(null);
    refresh();
  }, [refresh]);

  // Set timeout for not found with retry logic
  useEffect(() => {
    // Clear any existing timeout
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    // Only set timeout if we're in a state where we should be finding the node
    if (wsState.authenticated && wsState.monitoring && nodes.length > 0 && !node) {
      checkTimeoutRef.current = setTimeout(() => {
        if (retryCountRef.current < maxRetries) {
          console.log(`[NodeDetails] Node not found, retry ${retryCountRef.current + 1}/${maxRetries}`);
          handleRetry();
        } else {
          console.log('[NodeDetails] Node not found after max retries');
          setErrorDetails({
            title: 'Node Not Found',
            message: `Node ${code} could not be found in your account`,
            canRetry: false
          });
          setLoadingState('error');
        }
      }, 15000); // 15 seconds timeout per attempt
    }

    // Cleanup
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [wsState.authenticated, wsState.monitoring, nodes.length, node, code, handleRetry]);

  // Handle WebSocket errors
  useEffect(() => {
    if (wsError) {
      console.error('[NodeDetails] WebSocket error:', wsError);
      setErrorDetails({
        title: 'Connection Error',
        message: wsError,
        canRetry: true
      });
      setLoadingState('error');
    }
  }, [wsError]);

  // Render loading states with detailed information
  if (loadingState !== 'ready' && loadingState !== 'error') {
    const loadingMessages = {
      'initializing': 'Initializing...',
      'connecting': 'Connecting to AeroNyx network...',
      'authenticating': 'Authenticating wallet...',
      'starting_monitor': 'Starting node monitoring...',
      'loading_nodes': 'Loading your nodes...',
      'searching_node': `Searching for node ${code}...`
    };

    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full mx-auto mb-6"
          />
          <h2 className="text-xl font-semibold text-white mb-2">
            {loadingMessages[loadingState] || 'Loading...'}
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            {loadingState === 'searching_node' && nodes.length > 0 && (
              <>Available nodes: {nodes.length}</>
            )}
          </p>
          
          {/* Show debug info in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 p-4 bg-white/5 rounded-lg text-left">
              <p className="text-xs text-gray-500 font-mono">
                State: {loadingState}<br/>
                Connected: {wsState.connected ? 'Yes' : 'No'}<br/>
                Authenticated: {wsState.authenticated ? 'Yes' : 'No'}<br/>
                Monitoring: {wsState.monitoring ? 'Yes' : 'No'}<br/>
                Nodes: {nodes.length}<br/>
                Retry: {retryCountRef.current}/{maxRetries}
              </p>
            </div>
          )}
          
          {retryCountRef.current > 0 && (
            <p className="text-xs text-yellow-400 mt-2">
              Retry attempt {retryCountRef.current} of {maxRetries}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Render error state
  if (loadingState === 'error' && errorDetails) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            {errorDetails.title}
          </h2>
          <p className="text-gray-400 mb-6">
            {errorDetails.message}
          </p>
          
          <div className="flex gap-4 justify-center">
            {errorDetails.canRetry && retryCountRef.current < maxRetries && (
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            )}
            <Link
              href="/dashboard/nodes"
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Nodes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If still no node after all checks
  if (!node) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Node Not Found</h2>
          <p className="text-gray-400 mb-6">
            Node {code} could not be found in your account
          </p>
          <p className="text-sm text-gray-500 mb-4">
            You have {nodes.length} node{nodes.length !== 1 ? 's' : ''} in your account:
          </p>
          <div className="mb-6 max-h-32 overflow-y-auto">
            {nodes.map(n => (
              <div key={n.code} className="text-xs text-gray-400 py-1">
                {n.code} - {n.name}
              </div>
            ))}
          </div>
          <Link
            href="/dashboard/nodes"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Nodes
          </Link>
        </div>
      </div>
    );
  }

  // Node found - render details
  const statusConfig = {
    active: { color: 'green', Icon: CheckCircle, label: 'Active' },
    online: { color: 'green', Icon: CheckCircle, label: 'Online' },
    offline: { color: 'red', Icon: XCircle, label: 'Offline' },
    pending: { color: 'yellow', Icon: AlertCircle, label: 'Pending' },
    unknown: { color: 'gray', Icon: AlertCircle, label: 'Unknown' }
  };

  const status = statusConfig[node.status] || statusConfig.unknown;
  const StatusIcon = status.Icon;

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
          <Link 
            href="/dashboard/nodes"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Nodes
          </Link>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-500/20 border border-purple-500/30">
                <Server className="w-8 h-8 text-purple-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">{node.name}</h1>
                <p className="text-gray-400 font-mono">{node.code}</p>
              </div>
              <div className={clsx(
                "flex items-center gap-2 px-3 py-1 rounded-full",
                status.color === 'green' && "bg-green-500/10 border border-green-500/20",
                status.color === 'red' && "bg-red-500/10 border border-red-500/20",
                status.color === 'yellow' && "bg-yellow-500/10 border border-yellow-500/20",
                status.color === 'gray' && "bg-gray-500/10 border border-gray-500/20"
              )}>
                <StatusIcon className={clsx(
                  "w-4 h-4",
                  status.color === 'green' && "text-green-400",
                  status.color === 'red' && "text-red-400",
                  status.color === 'yellow' && "text-yellow-400",
                  status.color === 'gray' && "text-gray-400"
                )} />
                <span className={clsx(
                  "text-sm font-medium",
                  status.color === 'green' && "text-green-400",
                  status.color === 'red' && "text-red-400",
                  status.color === 'yellow' && "text-yellow-400",
                  status.color === 'gray' && "text-gray-400"
                )}>{status.label}</span>
              </div>
            </div>
            
            <button
              onClick={() => setShowRemoteManagement(true)}
              disabled={node.status !== 'active' && node.status !== 'online'}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
                node.status === 'active' || node.status === 'online'
                  ? "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 cursor-pointer"
                  : "bg-gray-700 cursor-not-allowed opacity-50"
              )}
            >
              <Terminal className="w-5 h-5" />
              Remote Management
            </button>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatsCard
            icon={Cpu}
            label="CPU Usage"
            value={`${node.performance?.cpu || 0}%`}
            color="purple"
          />
          <StatsCard
            icon={HardDrive}
            label="Memory Usage"
            value={`${node.performance?.memory || 0}%`}
            color="blue"
          />
          <StatsCard
            icon={Activity}
            label="Network"
            value={`${node.performance?.network || 0}%`}
            color="green"
          />
          <StatsCard
            icon={DollarSign}
            label="Earnings"
            value={`$${node.earnings || '0.00'}`}
            color="yellow"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Chart */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Performance History</h2>
            <NodePerformanceChart nodeId={node.code} height={300} />
          </div>

          {/* Node Information */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Node Information</h2>
            <div className="space-y-4">
              <InfoRow label="Node Type" value={node.type || 'Unknown'} />
              <InfoRow label="Status" value={status.label} />
              <InfoRow label="Last Seen" value={node.last_seen ? new Date(node.last_seen).toLocaleString() : 'Never'} />
              <InfoRow label="Uptime" value={node.uptime || 'N/A'} />
              
              <div className="pt-4 border-t border-white/10">
                <h3 className="font-medium text-white mb-3">Resources</h3>
                <ResourceBar label="CPU" value={node.performance?.cpu || 0} />
                <ResourceBar label="Memory" value={node.performance?.memory || 0} />
                <ResourceBar label="Disk" value={node.performance?.disk || 0} />
                <ResourceBar label="Network" value={node.performance?.network || 0} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Remote Management Modal */}
      {(node.status === 'active' || node.status === 'online') && (
        <RemoteManagement
          nodeReference={node.code}
          isOpen={showRemoteManagement}
          onClose={() => setShowRemoteManagement(false)}
        />
      )}
    </div>
  );
}

// Helper Components
function StatsCard({ icon: Icon, label, value, color }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 hover:bg-white/[0.07] transition-all"
    >
      <div className="flex items-center justify-between mb-2">
        <Icon className={clsx(
          "w-6 h-6",
          color === 'purple' && "text-purple-400",
          color === 'blue' && "text-blue-400",
          color === 'green' && "text-green-400",
          color === 'yellow' && "text-yellow-400"
        )} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
    </motion.div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

function ResourceBar({ label, value }) {
  const getColor = (val) => {
    if (val > 80) return 'red';
    if (val > 60) return 'yellow';
    return 'green';
  };

  const color = getColor(value);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white">{value}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={clsx(
            "h-full",
            color === 'green' && "bg-green-500",
            color === 'yellow' && "bg-yellow-500",
            color === 'red' && "bg-red-500"
          )}
        />
      </div>
    </div>
  );
}
