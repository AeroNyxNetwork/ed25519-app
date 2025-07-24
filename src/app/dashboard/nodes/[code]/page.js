/**
 * Node Details Page
 * 
 * File Path: src/app/dashboard/nodes/[code]/page.js
 * 
 * Dynamic route for individual node details and remote management
 * 
 * @version 1.0.0
 */

'use client';

import React, { useState, useEffect } from 'react';
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
  DollarSign
} from 'lucide-react';
import clsx from 'clsx';

export default function NodeDetailsPage({ params }) {
  const { code } = params;
  const { wallet } = useWallet();
  const router = useRouter();
  const [showRemoteManagement, setShowRemoteManagement] = useState(false);
  
  // Get node data from WebSocket
  const { nodes, isLoading } = useAeroNyxWebSocket({
    autoConnect: true,
    autoMonitor: true
  });

  // Find the specific node
  const node = nodes.find(n => n.code === code);

  // Redirect if not authenticated
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
    }
  }, [wallet.connected, router]);

  // 404 if node not found
  useEffect(() => {
    if (!isLoading && nodes.length > 0 && !node) {
      router.push('/dashboard/nodes');
    }
  }, [isLoading, nodes.length, node, router]);

  if (isLoading || !node) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading node details...</p>
        </div>
      </div>
    );
  }

  const statusConfig = {
    active: { color: 'green', Icon: CheckCircle, label: 'Active' },
    online: { color: 'green', Icon: CheckCircle, label: 'Online' },
    offline: { color: 'red', Icon: XCircle, label: 'Offline' },
    pending: { color: 'yellow', Icon: AlertCircle, label: 'Pending' }
  };

  const status = statusConfig[node.status] || statusConfig.offline;
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
                `bg-${status.color}-500/10 border border-${status.color}-500/20`
              )}>
                <StatusIcon className={`w-4 h-4 text-${status.color}-400`} />
                <span className={`text-sm font-medium text-${status.color}-400`}>{status.label}</span>
              </div>
            </div>
            
            <button
              onClick={() => setShowRemoteManagement(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg transition-all"
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
              <InfoRow label="Node Type" value={node.type} />
              <InfoRow label="Status" value={node.status} />
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
      <RemoteManagement
        nodeReference={node.code}
        isOpen={showRemoteManagement}
        onClose={() => setShowRemoteManagement(false)}
      />
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
        <Icon className={`w-6 h-6 text-${color}-400`} />
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
          className={`h-full bg-${color}-500`}
        />
      </div>
    </div>
  );
}
