/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Main Dashboard Content Component
 * Modification Reason: Remove monetization/earnings displays, keep only functional features
 * Main Functionality: Display node status, resource usage, and management controls
 * Dependencies: useAeroNyxWebSocket, useWallet, node management components
 *
 * Main Logical Flow:
 * 1. Connect to WebSocket for real-time node monitoring
 * 2. Display node operational status and resource metrics
 * 3. Provide quick actions for node management
 *
 * ⚠️ Important Note for Next Developer:
 * - This file focuses on functional node management only
 * - Monetization features have been intentionally removed
 * - WebSocket connection is critical for real-time updates
 *
 * Last Modified: v13.0.0 - Removed earnings displays, kept functional features
 * ============================================
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Server, 
  Activity, 
  Zap,
  Cpu,
  HardDrive,
  RefreshCw,
  Plus,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';

import { useWallet } from '../wallet/WalletProvider';
import { useAeroNyxWebSocket } from '../../hooks/useAeroNyxWebSocket';

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
 * Focuses on functional node management without monetization displays
 */
export default function DashboardContent() {
  const { wallet } = useWallet();
  
  // Use unified WebSocket hook with auto-connect and auto-monitor
  const {
    nodes,
    stats,
    wsState,
    lastUpdate,
    refresh,
    isLoading,
    error
  } = useAeroNyxWebSocket({
    autoConnect: true,
    autoMonitor: true
  });

  // Calculate uptime percentage
  const calculateUptime = useCallback((nodeStats) => {
    if (nodeStats.totalNodes === 0) return 0;
    return Math.round((nodeStats.activeNodes / nodeStats.totalNodes) * 100);
  }, []);

  // Get status message based on WebSocket state
  const getStatusMessage = useCallback((state) => {
    if (state.monitoring) return 'Real-time monitoring active';
    if (state.authenticated) return 'Authenticated, starting monitor...';
    if (state.authState === 'authenticating') return 'Authenticating with network...';
    if (state.authState === 'signing') return 'Signing authentication message...';
    if (state.authState === 'requesting_message') return 'Requesting authentication...';
    if (state.connected) return 'Connecting to network...';
    return 'Connect your wallet to view nodes';
  }, []);

  if (!wallet.connected) {
    return <WalletConnectionPrompt />;
  }

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
                onClick={refresh}
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
          ) : error && nodes.length === 0 ? (
            <ErrorState key="error" error={error} onRetry={refresh} />
          ) : (
            <motion.div
              key="content"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {/* Stats Grid - Focus on operational metrics only */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatsCard
                  icon={Server}
                  title="Total Nodes"
                  value={stats.totalNodes}
                  subtitle={`${stats.activeNodes} active`}
                  trend="neutral"
                />
                
                <StatsCard
                  icon={Activity}
                  title="Network Status"
                  value={stats.activeNodes > 0 ? 'Online' : 'Offline'}
                  subtitle={`${calculateUptime(stats)}% uptime`}
                  trend={stats.activeNodes > 0 ? 'up' : 'down'}
                />
                
                <StatsCard
                  icon={Cpu}
                  title="CPU Usage"
                  value={`${stats.resourceUtilization || 0}%`}
                  subtitle="Average across nodes"
                  trend="neutral"
                />
                
                <StatsCard
                  icon={HardDrive}
                  title="Storage Used"
                  value={`${Math.round(stats.storageUsed || 0)}%`}
                  subtitle="Total capacity"
                  trend="neutral"
                />
              </div>
              
              {/* Main Content */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Nodes Section */}
                <motion.div variants={itemVariants} className="lg:col-span-2">
                  <GlassCard>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-semibold text-white">Active Nodes</h2>
                      {nodes.length > 4 && (
                        <Link 
                          href="/dashboard/nodes"
                          className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-all hover:translate-x-1"
                        >
                          View all
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      )}
                    </div>
                    
                    {nodes.length > 0 ? (
                      <div className="space-y-4">
                        <AnimatePresence>
                          {nodes.slice(0, 4).map((node) => (
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
                          title="Blockchain Integration"
                          href="/dashboard/blockchain-integration"
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
                          value={stats.activeNodes}
                          max={stats.totalNodes || 1}
                          color="green"
                        />
                        <HealthMetric
                          label="Resource Usage"
                          value={stats.resourceUtilization}
                          max={100}
                          color="purple"
                        />
                        <HealthMetric
                          label="Network Latency"
                          value={25}
                          max={100}
                          color="blue"
                          suffix="ms"
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

// Sub Components

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
    online: { color: 'green', Icon: CheckCircle, label: 'Online' },
    offline: { color: 'red', Icon: XCircle, label: 'Offline' },
    pending: { color: 'yellow', Icon: AlertCircle, label: 'Pending' }
  };
  
  const normalizedStatus = node.status?.toLowerCase() || 'offline';
  const config = statusConfig[normalizedStatus] || statusConfig.offline;
  const { Icon } = config;
  
  // Calculate resource usage
  const cpuUsage = node.performance?.cpu || 0;
  const memoryUsage = node.performance?.memory || 0;
  
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
          <p className="text-sm font-medium text-white">CPU: {cpuUsage}%</p>
          <p className="text-xs text-gray-500">MEM: {memoryUsage}%</p>
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

function HealthMetric({ label, value, max, color, suffix = '' }) {
  const percentage = (value / max) * 100;
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-medium">
          {value}{suffix}{max > 1 && `/${max}`}
        </span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={clsx(
            "h-full bg-gradient-to-r",
            color === 'green' && "from-green-500 to-green-400",
            color === 'purple' && "from-purple-500 to-purple-400",
            color === 'blue' && "from-blue-500 to-blue-400"
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
