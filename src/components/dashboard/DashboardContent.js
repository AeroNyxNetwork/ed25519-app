/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Main Dashboard Content Component
 * Modification Reason: Complete redesign based on user-centric product thinking
 * Main Functionality: Actionable dashboard focused on individual node status
 * Dependencies: useAeroNyxWebSocket, useWallet, node management components
 *
 * Design Philosophy:
 * 1. Show what matters: Individual node health, not aggregated metrics
 * 2. Enable quick actions: Problems should be immediately actionable
 * 3. Progressive disclosure: Details available on demand, not forced
 * 4. Zero state guidance: Clear next steps when no nodes exist
 *
 * ⚠️ Important Note for Next Developer:
 * - This design prioritizes actionable information over vanity metrics
 * - Each element should answer "So what?" and "Now what?"
 * - Maintain focus on individual node management, not system-wide stats
 *
 * Last Modified: v14.0.0 - Complete redesign with user-centric approach
 * ============================================
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Server, 
  Activity, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  HardDrive,
  Wifi,
  Plus,
  ChevronRight,
  AlertCircle,
  Settings,
  Zap,
  Shield,
  RefreshCw,
  ArrowRight,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';

import { useWallet } from '../wallet/WalletProvider';
import { useAeroNyxWebSocket } from '../../hooks/useAeroNyxWebSocket';
import NodeCard from '../common/NodeCard';

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
 * Dashboard Content Component - User-Centric Redesign
 * 
 * Focus: Individual node status and actionable insights
 */
export default function DashboardContent() {
  const { wallet } = useWallet();
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  
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

  // Categorize nodes by status for quick overview
  const nodesByStatus = useMemo(() => {
    const categorized = {
      healthy: [],
      warning: [],
      critical: [],
      offline: []
    };

    nodes.forEach(node => {
      const status = (node.status || '').toLowerCase();
      const cpu = node.performance?.cpu || 0;
      const memory = node.performance?.memory || 0;

      if (status === 'offline' || status === 'disconnected') {
        categorized.offline.push(node);
      } else if (cpu > 90 || memory > 90) {
        categorized.critical.push(node);
      } else if (cpu > 70 || memory > 70 || status === 'pending') {
        categorized.warning.push(node);
      } else {
        categorized.healthy.push(node);
      }
    });

    return categorized;
  }, [nodes]);

  // Calculate actionable insights
  const insights = useMemo(() => {
    const totalNodes = nodes.length;
    const healthyCount = nodesByStatus.healthy.length;
    const issueCount = nodesByStatus.warning.length + nodesByStatus.critical.length + nodesByStatus.offline.length;

    return {
      hasIssues: issueCount > 0,
      healthPercentage: totalNodes > 0 ? Math.round((healthyCount / totalNodes) * 100) : 0,
      primaryAction: nodesByStatus.offline.length > 0 ? 'reconnect' : 
                     nodesByStatus.critical.length > 0 ? 'investigate' :
                     nodesByStatus.warning.length > 0 ? 'monitor' : 
                     totalNodes === 0 ? 'register' : 'maintain'
    };
  }, [nodes.length, nodesByStatus]);

  // Get primary action message
  const getPrimaryMessage = useCallback(() => {
    if (nodes.length === 0) {
      return {
        title: "Welcome to AeroNyx",
        message: "Get started by registering your first node",
        action: "Register Node",
        href: "/dashboard/register",
        icon: Plus
      };
    }

    if (nodesByStatus.offline.length > 0) {
      return {
        title: `${nodesByStatus.offline.length} node${nodesByStatus.offline.length > 1 ? 's' : ''} offline`,
        message: "Immediate attention required to restore service",
        action: "View Offline Nodes",
        icon: AlertTriangle,
        severity: 'critical'
      };
    }

    if (nodesByStatus.critical.length > 0) {
      return {
        title: `${nodesByStatus.critical.length} node${nodesByStatus.critical.length > 1 ? 's' : ''} under heavy load`,
        message: "Resource usage exceeding safe thresholds",
        action: "View Details",
        icon: AlertCircle,
        severity: 'warning'
      };
    }

    if (nodesByStatus.healthy.length === nodes.length) {
      return {
        title: "All systems operational",
        message: `${nodes.length} node${nodes.length > 1 ? 's' : ''} running smoothly`,
        icon: CheckCircle2,
        severity: 'success'
      };
    }

    return {
      title: "Network Overview",
      message: `${nodesByStatus.healthy.length} healthy, ${insights.hasIssues ? `${nodesByStatus.warning.length + nodesByStatus.critical.length + nodesByStatus.offline.length} need attention` : 'all good'}`,
      icon: Activity,
      severity: 'info'
    };
  }, [nodes, nodesByStatus, insights]);

  const primaryMessage = getPrimaryMessage();

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
                Dashboard
              </h1>
              <p className="text-gray-400 mt-1">
                {wsState.monitoring ? 'Real-time monitoring active' : 'Connecting...'}
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <ConnectionStatus wsState={wsState} />
              
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
          {isLoading && nodes.length === 0 ? (
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
              {/* Primary Status Card - The Most Important Thing */}
              <motion.div variants={itemVariants} className="mb-8">
                <StatusCard 
                  message={primaryMessage}
                  nodesByStatus={nodesByStatus}
                  totalNodes={nodes.length}
                />
              </motion.div>

              {nodes.length > 0 ? (
                <>
                  {/* Quick Status Overview - Visual Priority */}
                  {insights.hasIssues && (
                    <motion.div variants={itemVariants} className="mb-8">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {nodesByStatus.offline.length > 0 && (
                          <IssueCard
                            type="offline"
                            nodes={nodesByStatus.offline}
                            onView={() => setSelectedNodeId(nodesByStatus.offline[0].code)}
                          />
                        )}
                        {nodesByStatus.critical.length > 0 && (
                          <IssueCard
                            type="critical"
                            nodes={nodesByStatus.critical}
                            onView={() => setSelectedNodeId(nodesByStatus.critical[0].code)}
                          />
                        )}
                        {nodesByStatus.warning.length > 0 && (
                          <IssueCard
                            type="warning"
                            nodes={nodesByStatus.warning}
                            onView={() => setSelectedNodeId(nodesByStatus.warning[0].code)}
                          />
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Node List - Individual Focus */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <motion.div variants={itemVariants} className="lg:col-span-2">
                      <GlassCard>
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-xl font-semibold text-white">Your Nodes</h2>
                          {nodes.length > 3 && (
                            <Link 
                              href="/dashboard/nodes"
                              className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-all hover:translate-x-1"
                            >
                              Manage all {nodes.length} nodes
                              <ChevronRight className="w-4 h-4" />
                            </Link>
                          )}
                        </div>
                        
                        <div className="space-y-3">
                          <AnimatePresence>
                            {nodes.slice(0, 5).map((node) => (
                              <NodeCard 
                                key={node.code} 
                                node={node}
                                variant="compact"
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      </GlassCard>
                    </motion.div>

                    {/* Actions & Resources */}
                    <div className="space-y-6">
                      {/* Quick Actions - Redesigned */}
                      <motion.div variants={itemVariants}>
                        <QuickActionsCard nodes={nodes} />
                      </motion.div>

                      {/* Help & Resources */}
                      <motion.div variants={itemVariants}>
                        <GlassCard>
                          <h3 className="text-lg font-semibold text-white mb-4">Resources</h3>
                          <div className="space-y-3">
                            <a
                              href="https://docs.aeronyx.network/troubleshooting"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-gray-300"
                            >
                              <Shield className="w-5 h-5 text-gray-400" />
                              <div className="flex-1">
                                <div className="text-sm font-medium">Troubleshooting Guide</div>
                                <div className="text-xs text-gray-500">Fix common issues</div>
                              </div>
                              <ArrowRight className="w-4 h-4 opacity-50" />
                            </a>
                          </div>
                        </GlassCard>
                      </motion.div>
                    </div>
                  </div>
                </>
              ) : (
                // Empty State - Clear Call to Action
                <EmptyState />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Status Card - Primary Information Display
function StatusCard({ message, nodesByStatus, totalNodes }) {
  const getSeverityStyles = (severity) => {
    switch (severity) {
      case 'critical':
        return 'from-red-600/20 to-red-700/20 border-red-500/30';
      case 'warning':
        return 'from-yellow-600/20 to-yellow-700/20 border-yellow-500/30';
      case 'success':
        return 'from-green-600/20 to-green-700/20 border-green-500/30';
      default:
        return 'from-purple-600/20 to-blue-600/20 border-white/10';
    }
  };

  const Icon = message.icon;

  return (
    <div className={clsx(
      "relative overflow-hidden rounded-2xl p-8",
      "bg-gradient-to-br backdrop-blur-md border",
      getSeverityStyles(message.severity)
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <Icon className={clsx(
              "w-8 h-8",
              message.severity === 'critical' ? 'text-red-400' :
              message.severity === 'warning' ? 'text-yellow-400' :
              message.severity === 'success' ? 'text-green-400' :
              'text-white'
            )} />
            <h2 className="text-2xl font-bold text-white">{message.title}</h2>
          </div>
          <p className="text-gray-300 mb-6">{message.message}</p>
          
          {message.action && (
            <Link href={message.href || '#'}>
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl text-white font-medium transition-all"
              >
                {message.action}
                <ArrowRight className="w-4 h-4" />
              </motion.a>
            </Link>
          )}
        </div>

        {totalNodes > 0 && (
          <div className="text-right">
            <div className="text-4xl font-bold text-white">{totalNodes}</div>
            <div className="text-sm text-gray-400">Total Nodes</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Issue Card - Highlight Problems
function IssueCard({ type, nodes, onView }) {
  const config = {
    offline: {
      title: 'Offline',
      icon: XCircle,
      color: 'red',
      message: 'Nodes disconnected'
    },
    critical: {
      title: 'Critical',
      icon: AlertTriangle,
      color: 'orange',
      message: 'High resource usage'
    },
    warning: {
      title: 'Warning',
      icon: AlertCircle,
      color: 'yellow',
      message: 'Needs attention'
    }
  };

  const { title, icon: Icon, color, message } = config[type];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={clsx(
        "p-4 rounded-xl border cursor-pointer transition-all",
        `bg-${color}-500/10 border-${color}-500/30 hover:bg-${color}-500/20`
      )}
      onClick={onView}
    >
      <div className="flex items-start justify-between mb-3">
        <Icon className={`w-6 h-6 text-${color}-400`} />
        <span className={`text-2xl font-bold text-${color}-400`}>{nodes.length}</span>
      </div>
      <h3 className="font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-400">{message}</p>
      <div className="mt-3 text-xs text-gray-500">
        {nodes.slice(0, 2).map(node => node.name).join(', ')}
        {nodes.length > 2 && ` +${nodes.length - 2} more`}
      </div>
    </motion.div>
  );
}

// Import the new NodeCard component (add this at the top of the file with other imports)
// import NodeCard from '../common/NodeCard';

// Connection Status Badge
function ConnectionStatus({ wsState }) {
  if (!wsState.connected) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
        <div className="w-2 h-2 bg-red-500 rounded-full" />
        <span className="text-xs text-red-400">Offline</span>
      </div>
    );
  }

  if (wsState.monitoring) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
        <div className="relative">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping" />
        </div>
        <span className="text-xs text-green-400">Live</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
      <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
      <span className="text-xs text-yellow-400">Connecting</span>
    </div>
  );
}

// Empty State
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-16"
    >
      <div className="w-24 h-24 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
        <Server className="w-12 h-12 text-white" />
      </div>
      <h2 className="text-3xl font-bold text-white mb-3">Start Your Network</h2>
      <p className="text-gray-400 mb-8 max-w-md mx-auto">
        Register your first node to begin building your decentralized infrastructure
      </p>
      <Link href="/dashboard/register">
        <motion.a
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-white font-medium hover:from-purple-700 hover:to-blue-700 transition-all text-lg"
        >
          <Plus className="w-6 h-6" />
          Register Your First Node
        </motion.a>
      </Link>
      
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
        <div className="text-left">
          <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-3">
            <Zap className="w-6 h-6 text-purple-400" />
          </div>
          <h3 className="font-semibold text-white mb-1">Quick Setup</h3>
          <p className="text-sm text-gray-400">Get online in minutes with our simple registration process</p>
        </div>
        <div className="text-left">
          <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-3">
            <Shield className="w-6 h-6 text-blue-400" />
          </div>
          <h3 className="font-semibold text-white mb-1">Secure Network</h3>
          <p className="text-sm text-gray-400">Enterprise-grade security with end-to-end encryption</p>
        </div>
        <div className="text-left">
          <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center mb-3">
            <Activity className="w-6 h-6 text-green-400" />
          </div>
          <h3 className="font-semibold text-white mb-1">Real-time Monitoring</h3>
          <p className="text-sm text-gray-400">Track performance and health metrics instantly</p>
        </div>
      </div>
    </motion.div>
  );
}

// Quick Actions Card - Redesigned Component
function QuickActionsCard({ nodes }) {
  const [hoveredAction, setHoveredAction] = useState(null);
  
  const actions = [
    {
      id: 'register',
      icon: Plus,
      title: 'Register Node',
      description: 'Add new device',
      href: '/dashboard/register',
      color: 'purple',
      gradient: 'from-purple-600 to-purple-700',
      stats: null,
      primary: true
    },
    {
      id: 'manage',
      icon: Settings,
      title: 'Manage',
      description: `${nodes.length} active nodes`,
      href: '/dashboard/nodes',
      color: 'blue',
      gradient: 'from-blue-600 to-blue-700',
      stats: nodes.length,
      badge: nodes.filter(n => n.status === 'pending').length || null
    },
    {
      id: 'blockchain',
      icon: Zap,
      title: 'Blockchain',
      description: 'Web3 integration',
      href: '/dashboard/blockchain-integration',
      color: 'green',
      gradient: 'from-green-600 to-green-700',
      stats: nodes.filter(n => n.blockchainIntegrations?.length > 0).length || null
    }
  ];

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Quick Actions</h3>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-gray-500">Ready</span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const isHovered = hoveredAction === action.id;
          
          return (
            <Link key={action.id} href={action.href}>
              <motion.a
                onMouseEnter={() => setHoveredAction(action.id)}
                onMouseLeave={() => setHoveredAction(null)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={clsx(
                  "relative block p-4 rounded-xl",
                  "border transition-all duration-300 overflow-hidden",
                  action.primary 
                    ? "bg-gradient-to-r " + action.gradient + " border-white/20"
                    : "bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20"
                )}
              >
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,white_0%,transparent_50%)]" />
                </div>
                
                {/* Content */}
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Icon Container */}
                    <div className={clsx(
                      "relative p-2.5 rounded-lg transition-all duration-300",
                      action.primary 
                        ? "bg-white/20" 
                        : `bg-${action.color}-500/10 group-hover:bg-${action.color}-500/20`
                    )}>
                      <Icon className={clsx(
                        "w-5 h-5 transition-transform duration-300",
                        action.primary ? "text-white" : `text-${action.color}-400`,
                        isHovered && "scale-110 rotate-3"
                      )} />
                      
                      {/* Badge */}
                      {action.badge && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                          <span className="text-xs text-white font-bold">{action.badge}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Text */}
                    <div>
                      <div className={clsx(
                        "font-semibold transition-colors",
                        action.primary ? "text-white" : "text-white"
                      )}>
                        {action.title}
                      </div>
                      <div className={clsx(
                        "text-xs transition-colors",
                        action.primary ? "text-white/80" : "text-gray-400"
                      )}>
                        {action.description}
                      </div>
                    </div>
                  </div>
                  
                  {/* Arrow or Stats */}
                  <div className="flex items-center gap-2">
                    {action.stats !== null && !action.primary && (
                      <div className={clsx(
                        "px-2 py-1 rounded-full text-xs font-medium",
                        `bg-${action.color}-500/20 text-${action.color}-400`
                      )}>
                        {action.stats}
                      </div>
                    )}
                    <ChevronRight className={clsx(
                      "w-4 h-4 transition-all duration-300",
                      action.primary ? "text-white/60" : "text-gray-500",
                      isHovered && "translate-x-1"
                    )} />
                  </div>
                </div>
                
                {/* Hover Effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0"
                  initial={{ x: '-100%' }}
                  animate={{ x: isHovered ? '100%' : '-100%' }}
                  transition={{ duration: 0.6 }}
                />
              </motion.a>
            </Link>
          );
        })}
      </div>
      
      {/* Bottom Stats Bar */}
      <div className="mt-4 pt-3 border-t border-white/10">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-gray-400">
                {nodes.filter(n => n.status === 'active' || n.status === 'online').length} Online
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-yellow-500 rounded-full" />
              <span className="text-gray-400">
                {nodes.filter(n => n.status === 'pending').length} Pending
              </span>
            </div>
          </div>
          <Link href="/dashboard/nodes">
            <motion.a
              whileHover={{ scale: 1.05 }}
              className="text-purple-400 hover:text-purple-300 transition-colors"
            >
              View all →
            </motion.a>
          </Link>
        </div>
      </div>
    </GlassCard>
  );
}

// Shared Components
function GlassCard({ children, className }) {
  return (
    <div className={clsx(
      "bg-white/5 backdrop-blur-md rounded-2xl border border-white/10",
      "shadow-[0_8px_32px_0_rgba(31,38,135,0.37)]",
      className
    )}>
      <div className="p-6">
        {children}
      </div>
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
      <p className="mt-4 text-gray-400">Loading your network...</p>
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
          <p className="text-gray-400 mb-8">Connect your wallet to access your node network.</p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
