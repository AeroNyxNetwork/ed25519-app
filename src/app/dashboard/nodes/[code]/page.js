/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Dynamic route for individual node details
 * Modification Reason: Fixed node loading and matching logic
 * Main Functionality: Display node details and remote management
 * Dependencies: useWallet, useAeroNyxWebSocket, RemoteManagement
 *
 * Main Logical Flow:
 * 1. Get node code from URL params
 * 2. Connect to WebSocket and load nodes
 * 3. Find matching node by code
 * 4. Display node details or redirect if not found
 *
 * ⚠️ Important Note for Next Developer:
 * - Node matching is case-insensitive to handle different formats
 * - Added debug logging to help identify data structure issues
 * - Increased timeout before redirect to allow data to load
 * - WebSocket must be connected before node data is available
 *
 * Last Modified: v1.0.1 - Fixed node loading and matching logic
 * ============================================
 */

/**
 * Node Details Page
 * 
 * File Path: src/app/dashboard/nodes/[code]/page.js
 * 
 * Dynamic route for individual node details and remote management
 * 
 * @version 1.0.1
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  RefreshCw
} from 'lucide-react';
import clsx from 'clsx';

export default function NodeDetailsPage({ params }) {
  const { code } = params;
  const { wallet } = useWallet();
  const router = useRouter();
  const [showRemoteManagement, setShowRemoteManagement] = useState(false);
  const [notFoundTimeout, setNotFoundTimeout] = useState(false);
  const checkTimeoutRef = useRef(null);
  
  // Get node data from WebSocket
  const { nodes, isLoading, wsState, refresh } = useAeroNyxWebSocket({
    autoConnect: true,
    autoMonitor: true
  });

  // Debug logging
  useEffect(() => {
    console.log('[NodeDetails] Current state:', {
      code,
      isLoading,
      wsState,
      nodesCount: nodes.length,
      nodes: nodes.map(n => ({ code: n.code, name: n.name }))
    });
  }, [code, isLoading, wsState, nodes]);

  // Find the specific node (case-insensitive)
  const node = nodes.find(n => 
    n.code && n.code.toUpperCase() === code.toUpperCase()
  );

  // Redirect if not authenticated
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
    }
  }, [wallet.connected, router]);

  // Set timeout for not found redirect (give time for data to load)
  useEffect(() => {
    // Clear any existing timeout
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    // Only set timeout if we're authenticated and monitoring
    if (wsState.authenticated && wsState.monitoring && !node) {
      checkTimeoutRef.current = setTimeout(() => {
        setNotFoundTimeout(true);
      }, 10000); // 10 seconds timeout
    }

    // Cleanup
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [wsState.authenticated, wsState.monitoring, node]);

  // Redirect if node not found after timeout
  useEffect(() => {
    if (notFoundTimeout && !node) {
      console.log('[NodeDetails] Node not found after timeout, redirecting...');
      router.push('/dashboard/nodes');
    }
  }, [notFoundTimeout, node, router]);

  // Loading states
  if (!wsState.authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400 mb-2">Connecting to AeroNyx network...</p>
          <p className="text-xs text-gray-500">Authenticating wallet...</p>
        </div>
      </div>
    );
  }

  if (!wsState.monitoring || (isLoading && !node)) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400 mb-2">Loading node details...</p>
          <p className="text-xs text-gray-500">Fetching data for {code}</p>
          {nodes.length > 0 && (
            <div className="mt-4 text-xs text-gray-600">
              <p>Available nodes: {nodes.map(n => n.code).join(', ')}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If no node found and timeout hasn't occurred yet
  if (!node && !notFoundTimeout) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400 mb-2">Searching for node {code}...</p>
          <p className="text-xs text-gray-500 mb-4">This may take a few moments</p>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Connection
          </button>
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
          <p className="text-gray-400 mb-4">Node {code} could not be found in your account</p>
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
