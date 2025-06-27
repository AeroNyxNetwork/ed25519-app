/**
 * Nodes Content Component - Production Grade
 * 
 * File Path: src/components/nodes/NodesContent.js
 * 
 * Displays all user nodes
 * 
 * @version 3.0.0
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
  DollarSign
} from 'lucide-react';
import clsx from 'clsx';

import { useWallet } from '../wallet/WalletProvider';
import { signMessage } from '../../lib/utils/walletSignature';

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

export default function NodesContent() {
  const { wallet } = useWallet();
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const wsRef = useRef(null);

  // WebSocket connection logic (similar to DashboardContent)
  const connectWebSocket = useCallback(async () => {
    if (!wallet.connected) return;

    try {
      const ws = new WebSocket('wss://api.aeronyx.network/ws/aeronyx/user-monitor/');
      wsRef.current = ws;

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connected':
            ws.send(JSON.stringify({
              type: 'get_message',
              wallet_address: wallet.address.toLowerCase()
            }));
            break;
            
          case 'signature_message':
            try {
              const signature = await signMessage(
                wallet.provider,
                data.message,
                wallet.address
              );
              
              ws.send(JSON.stringify({
                type: 'auth',
                wallet_address: wallet.address.toLowerCase(),
                signature: signature,
                message: data.message,
                wallet_type: 'metamask'
              }));
            } catch (error) {
              console.error('Signing error:', error);
            }
            break;
            
          case 'auth_success':
            if (data.nodes) {
              setNodes(data.nodes);
            }
            ws.send(JSON.stringify({ type: 'start_monitor' }));
            break;
            
          case 'status_update':
            if (data.nodes) {
              setNodes(data.nodes);
            }
            setLoading(false);
            break;
        }
      };

      ws.onerror = () => {
        setLoading(false);
      };

      ws.onclose = () => {
        setLoading(false);
      };
    } catch (error) {
      console.error('WebSocket error:', error);
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    if (wallet.connected) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [wallet.connected, connectWebSocket]);

  // Filter nodes based on search and status
  const filteredNodes = nodes.filter(node => {
    const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         node.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || node.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  if (!wallet.connected) {
    return <WalletConnectionPrompt />;
  }

  if (loading) {
    return <LoadingState />;
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
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-2">
            Your Nodes
          </h1>
          <p className="text-gray-400">Manage and monitor all your nodes</p>
        </motion.div>

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

        {/* Nodes Grid */}
        <AnimatePresence mode="wait">
          {filteredNodes.length > 0 ? (
            <motion.div
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
            <EmptyState searchTerm={searchTerm} filterStatus={filterStatus} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Components

function NodeCard({ node }) {
  const statusConfig = {
    active: { color: 'green', Icon: CheckCircle, label: 'Active', glow: 'shadow-green-500/20' },
    offline: { color: 'red', Icon: XCircle, label: 'Offline', glow: 'shadow-red-500/20' },
    pending: { color: 'yellow', Icon: AlertCircle, label: 'Pending', glow: 'shadow-yellow-500/20' }
  };
  
  const config = statusConfig[node.status] || statusConfig.offline;
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
            <p className="text-sm text-gray-400">{node.code}</p>
          </div>
          <div className={clsx(
            "flex items-center gap-2 px-3 py-1 rounded-full",
            `bg-${config.color}-500/10 border border-${config.color}-500/20`
          )}>
            <Icon className={`w-4 h-4 text-${config.color}-400`} />
            <span className={`text-xs font-medium text-${config.color}-400`}>{config.label}</span>
          </div>
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
    <div className="min-h-screen bg-black flex items-center justify-center">
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
