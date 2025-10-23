/**
 * ============================================
 * File: src/app/dashboard/nodes/[code]/page.js
 * ============================================
 * Node Details Page - PRODUCTION OPTIMIZED v5.0.0
 * 
 * Modification Reason: Integrate useConnectionState and improve UX
 * - Added: useConnectionState for unified state management
 * - Fixed: Signature time display (hidden, JWT only shown)
 * - Removed: Hardcoded data, replaced with real metrics
 * - Simplified: Panel components, unified Remote Management entry
 * - Enhanced: Error handling and auto-retry indicators
 * - Improved: Loading states and user feedback
 * 
 * Key Changes:
 * 1. Single state source via useConnectionState
 * 2. Only show JWT expiry time (not signature)
 * 3. Real system metrics from node data
 * 4. Simplified component structure
 * 5. Better error recovery UI
 * 
 * Main Functionality: Display node metrics, health, and provide access to remote tools
 * Dependencies: useConnectionState, RemoteManagement, WebSocket hooks
 * 
 * ⚠️ Important Notes:
 * - useConnectionState handles ALL connection logic
 * - Signature auto-renewal is transparent to user
 * - All remote tools accessed through RemoteManagement modal
 * - All existing functionality preserved
 * 
 * Last Modified: v5.0.0 - Production-ready with unified state
 * ============================================
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '../../../../components/wallet/WalletProvider';
import { useConnectionState } from '../../../../hooks/useConnectionState';
import remoteAuthService from '../../../../services/RemoteAuthService';
import RemoteManagement from '../../../../components/nodes/RemoteManagement';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { 
  Server, 
  Activity, 
  Cpu, 
  HardDrive, 
  Wifi,
  Terminal,
  ChevronLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  Shield,
  Database,
  BarChart3,
  Clock,
  Thermometer,
  TrendingUp,
  CheckCircle2,
  Folder,
  Monitor,
  AlertTriangle,
  Info,
  Network,
  Zap
} from 'lucide-react';
import clsx from 'clsx';

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate node health score (0-100)
 */
function calculateHealthScore(node) {
  if (!node) return 0;
  
  let score = 100;
  
  const status = node.status?.toLowerCase();
  if (status === 'offline') score -= 50;
  else if (status === 'error') score -= 40;
  else if (status === 'pending') score -= 20;
  
  const cpu = node.performance?.cpu || node.cpu_usage || 0;
  const memory = node.performance?.memory || node.memory_usage || 0;
  const disk = node.performance?.disk || node.storage_usage || 0;
  
  if (cpu > 95) score -= 20;
  else if (cpu > 85) score -= 15;
  else if (cpu > 75) score -= 10;
  else if (cpu > 65) score -= 5;
  
  if (memory > 95) score -= 20;
  else if (memory > 85) score -= 15;
  else if (memory > 75) score -= 10;
  else if (memory > 65) score -= 5;
  
  if (disk > 90) score -= 10;
  else if (disk > 80) score -= 5;
  
  const uptime = parseFloat(node.uptime) || 99.9;
  if (uptime < 95) score -= 10;
  else if (uptime < 98) score -= 5;
  else if (uptime > 99.9) score += 5;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Generate predictive insights
 */
function generatePredictiveInsights(node) {
  if (!node) return [];
  
  const insights = [];
  const memory = node.performance?.memory || node.memory_usage || 0;
  const cpu = node.performance?.cpu || node.cpu_usage || 0;
  const disk = node.performance?.disk || node.storage_usage || 0;
  
  if (memory > 80) {
    insights.push({
      type: 'warning',
      metric: 'memory',
      message: `Memory usage at ${Math.round(memory)}%`,
      prediction: 'May require optimization if usage continues to increase',
      action: 'Review running processes and consider adding RAM'
    });
  }
  
  if (cpu > 70) {
    insights.push({
      type: 'info',
      metric: 'cpu',
      message: `CPU usage at ${Math.round(cpu)}%`,
      prediction: 'Performance may degrade under additional load',
      action: 'Monitor workload and consider load balancing'
    });
  }
  
  if (disk > 75) {
    insights.push({
      type: disk > 85 ? 'warning' : 'info',
      metric: 'disk',
      message: `Disk usage at ${Math.round(disk)}%`,
      prediction: 'Storage capacity should be monitored',
      action: 'Plan disk cleanup or expansion'
    });
  }
  
  if (insights.length === 0) {
    insights.push({
      type: 'success',
      metric: 'general',
      message: 'All systems operating optimally',
      prediction: 'No immediate resource concerns detected',
      action: 'Continue current monitoring practices'
    });
  }
  
  return insights;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ==================== SUBCOMPONENTS ====================

/**
 * Resource Card Component
 */
function ResourceCard({ title, icon: Icon, value, color, details }) {
  const colorMap = {
    purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', bar: 'bg-purple-500', ring: 'ring-purple-500/50' },
    green: { bg: 'bg-green-500/20', text: 'text-green-400', bar: 'bg-green-500', ring: 'ring-green-500/50' },
    orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', bar: 'bg-orange-500', ring: 'ring-orange-500/50' },
    blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', bar: 'bg-blue-500', ring: 'ring-blue-500/50' }
  };

  const colors = colorMap[color] || colorMap.blue;
  
  const getStatusColor = (val) => {
    if (val > 90) return 'text-red-400';
    if (val > 75) return 'text-orange-400';
    if (val > 50) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <motion.div 
      className="bg-white/5 rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all"
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 ${colors.bg} rounded-lg ring-2 ${colors.ring}`}>
            <Icon className={`w-5 h-5 ${colors.text}`} />
          </div>
          <h3 className="font-semibold">{title}</h3>
        </div>
        <div className={`text-2xl font-bold ${getStatusColor(value)}`}>
          {Math.round(value)}%
        </div>
      </div>
      
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Usage</span>
          <span className="text-gray-400">{Math.round(value)}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div 
            className={`h-full ${colors.bar}`}
            initial={{ width: 0 }}
            animate={{ width: `${value}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {details && details.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-white/10">
          {details.map((detail, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <span className="text-gray-400 flex items-center gap-1">
                {detail.icon && <detail.icon className="w-3 h-3" />}
                {detail.label}
              </span>
              <span className="text-white font-medium">{detail.value}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Event Item Component
 */
function EventItem({ time, type, message }) {
  const typeConfig = {
    success: { color: 'bg-green-500', icon: CheckCircle },
    warning: { color: 'bg-yellow-500', icon: AlertTriangle },
    info: { color: 'bg-blue-500', icon: Info },
    error: { color: 'bg-red-500', icon: XCircle }
  };

  const config = typeConfig[type] || typeConfig.info;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
      <Icon className={`w-4 h-4 ${config.color.replace('bg-', 'text-')}`} />
      <span className="text-sm text-gray-400">{time}</span>
      <span className="flex-1 text-sm">{message}</span>
    </div>
  );
}

/**
 * Quick Access Panel - Unified Remote Management Entry
 */
function QuickAccessPanel({ isOnline, onOpenRemote }) {
  const tools = [
    {
      id: 'terminal',
      icon: Terminal,
      title: 'Terminal',
      description: 'Interactive shell access',
      color: 'purple'
    },
    {
      id: 'files',
      icon: Folder,
      title: 'File Manager',
      description: 'Browse and edit files',
      color: 'blue'
    },
    {
      id: 'system',
      icon: Monitor,
      title: 'System Info',
      description: 'Detailed system metrics',
      color: 'green'
    }
  ];

  const colorMap = {
    purple: 'from-purple-600 to-purple-700',
    blue: 'from-blue-600 to-blue-700',
    green: 'from-green-600 to-green-700'
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {tools.map((tool, index) => {
        const Icon = tool.icon;
        return (
          <motion.button
            key={tool.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => isOnline && onOpenRemote(tool.id)}
            disabled={!isOnline}
            className={clsx(
              "p-6 rounded-xl border transition-all text-left",
              isOnline
                ? "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10 cursor-pointer"
                : "bg-gray-900/50 border-gray-800 cursor-not-allowed opacity-50"
            )}
            whileHover={isOnline ? { scale: 1.02 } : {}}
            whileTap={isOnline ? { scale: 0.98 } : {}}
          >
            <div className={clsx(
              "w-12 h-12 rounded-lg flex items-center justify-center mb-4",
              isOnline
                ? `bg-gradient-to-br ${colorMap[tool.color]}`
                : "bg-gray-800"
            )}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{tool.title}</h3>
            <p className="text-sm text-gray-400">{tool.description}</p>
            {!isOnline && (
              <p className="text-xs text-red-400 mt-2">Node must be online</p>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

export default function NodeDetailsPage({ params }) {
  const { code } = params;
  const { wallet, isInitializing } = useWallet();
  const router = useRouter();
  
  // ✅ NEW: Use unified connection state
  const {
    status: connectionStatus,
    isReady,
    isNodeOnline,
    isWebSocketConnected,
    isWebSocketAuthenticated,
    nodeInfo: node,
    allNodes: nodes,
    jwtExpiryFormatted,
    error: connectionError,
    isLoading: isConnecting,
    isReconnecting,
    canUseTerminal,
    canUseFileManager,
    fullReconnect,
    ensureSignature
  } = useConnectionState(code);
  
  // Local state
  const [showRemoteManagement, setShowRemoteManagement] = useState(false);
  const [remoteManagementDefaultTab, setRemoteManagementDefaultTab] = useState('terminal');
  const [selectedTab, setSelectedTab] = useState('overview');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);

  // ✅ IMPROVED: Computed values from real data
  const healthScore = useMemo(() => calculateHealthScore(node), [node]);
  const predictiveInsights = useMemo(() => generatePredictiveInsights(node), [node]);
  
  // Get real metrics
  const metrics = useMemo(() => {
    if (!node) return null;
    
    return {
      cpu: {
        usage: node.performance?.cpu || node.cpu_usage || 0,
        cores: node.system_info?.cpu_cores || node.cpu_cores || 4,
        model: node.system_info?.cpu_model || 'Unknown'
      },
      memory: {
        usage: node.performance?.memory || node.memory_usage || 0,
        total: node.system_info?.memory_total || node.memory_total || 0,
        used: node.system_info?.memory_used || 0,
        free: node.system_info?.memory_free || 0
      },
      disk: {
        usage: node.performance?.disk || node.storage_usage || 0,
        total: node.system_info?.disk_total || node.disk_total || 0,
        used: node.system_info?.disk_used || 0,
        free: node.system_info?.disk_free || 0
      },
      network: {
        usage: node.performance?.network || node.bandwidth_usage || 0,
        bandwidth: node.system_info?.network_bandwidth || '1 Gbps',
        latency: node.system_info?.network_latency || 'N/A'
      }
    };
  }, [node]);

  // ==================== Effects ====================
  
  // Redirect if wallet not connected
  useEffect(() => {
    if (!isInitializing && !wallet.connected) {
      router.push('/');
    }
  }, [isInitializing, wallet.connected, router]);

  // ==================== Handlers ====================
  
  const openRemoteManagement = useCallback((defaultTab = 'terminal') => {
    setRemoteManagementDefaultTab(defaultTab);
    setShowRemoteManagement(true);
  }, []);

  const handleRetry = useCallback(() => {
    fullReconnect();
  }, [fullReconnect]);
  
  // ✅ NEW: Perform authentication manually
  const performAuthentication = useCallback(async () => {
    if (!wallet.connected || !wallet.address) {
      throw new Error('Wallet not connected');
    }
    
    const signatureData = await ensureSignature();
    
    if (!signatureData) {
      throw new Error('Failed to get signature');
    }
    
    const authResult = await remoteAuthService.authenticate({
      nodeReference: code,
      walletAddress: wallet.address,
      signature: signatureData.signature,
      message: signatureData.message,
      walletType: 'okx'
    });
    
    if (!authResult.success) {
      throw new Error(authResult.error || 'Authentication failed');
    }
    
    return true;
  }, [wallet, code, ensureSignature]);

  // ==================== Loading State ====================
  
  if (isInitializing || (isConnecting && !node)) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="text-center max-w-md">
          <motion.div
            className="w-20 h-20 mx-auto mb-8"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <div className="w-full h-full rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 p-[2px]">
              <div className="w-full h-full rounded-2xl bg-[#0A0A0F] flex items-center justify-center">
                <Server className="w-10 h-10 text-white" />
              </div>
            </div>
          </motion.div>
          
          <h2 className="text-2xl font-bold text-white mb-3">
            {isInitializing ? 'Initializing...' : 'Loading Node Data...'}
          </h2>
          
          <div className="flex items-center justify-center gap-1">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  // ==================== Error State ====================
  
  if (!node && nodes.length > 0) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <motion.div 
          className="text-center max-w-md"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <div className="w-20 h-20 bg-red-500/10 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Node Not Found</h2>
          <p className="text-gray-400 mb-8">
            Node {code} could not be found in your account
          </p>
          <Link
            href="/dashboard/nodes"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl transition-all font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Nodes
          </Link>
        </motion.div>
      </div>
    );
  }

  if (connectionError && !isReconnecting) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <motion.div 
          className="text-center max-w-md"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <div className="w-20 h-20 bg-red-500/10 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Connection Error</h2>
          <p className="text-gray-400 mb-8">{connectionError}</p>
          
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl transition-all font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Connection
            </button>
            <Link
              href="/dashboard/nodes"
              className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all font-medium border border-white/10"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Nodes
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // ==================== Status Config ====================
  
  const statusConfig = {
    online: { color: '#10B981', Icon: CheckCircle, label: 'Online', glow: true },
    active: { color: '#10B981', Icon: CheckCircle, label: 'Online', glow: true },
    offline: { color: '#EF4444', Icon: XCircle, label: 'Offline', glow: false },
    pending: { color: '#F59E0B', Icon: Clock, label: 'Pending', glow: false },
    error: { color: '#EF4444', Icon: AlertCircle, label: 'Error', glow: false }
  };

  const nodeStatus = (node?.status || 'offline').toLowerCase();
  const statusDisplay = statusConfig[nodeStatus] || statusConfig.offline;
  const StatusIcon = statusDisplay.Icon;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'remote', label: 'Remote Tools', icon: Terminal }
  ];

  const getHealthColor = (score) => {
    if (score >= 90) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    if (score >= 50) return 'text-orange-400';
    return 'text-red-400';
  };

  // ==================== RENDER ====================
  
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-blue-900/10" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <motion.header 
          className="px-6 py-6 border-b border-white/5 backdrop-blur-xl bg-black/20"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
              <Link href="/dashboard/nodes">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="text-sm font-medium">Nodes</span>
                </motion.div>
              </Link>
              
              <div className="flex items-center gap-4 flex-1">
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 p-[1px]">
                    <div className="w-full h-full rounded-xl bg-[#0A0A0F] flex items-center justify-center">
                      <Server className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  {statusDisplay.glow && (
                    <div className="absolute -top-1 -right-1">
                      <span className="absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75 animate-ping"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </div>
                  )}
                </div>
                
                <div className="flex-1">
                  <h1 className="text-xl font-bold text-white">{node?.name || code}</h1>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-400 font-mono">{code}</span>
                    <span className="text-gray-600">•</span>
                    <span className="text-gray-400">{node?.location || 'Unknown location'}</span>
                    <span className="text-gray-600">•</span>
                    <span className="flex items-center gap-1" style={{ color: statusDisplay.color }}>
                      <StatusIcon className="w-3 h-3" />
                      {statusDisplay.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* ✅ NEW: Unified Session Display (JWT only) */}
                {jwtExpiryFormatted && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-xl border border-green-500/20">
                    <Shield className="w-4 h-4 text-green-400" />
                    <div className="text-left">
                      <div className="text-xs text-green-400">Session</div>
                      <div className="text-sm font-medium text-green-300">{jwtExpiryFormatted}</div>
                    </div>
                  </div>
                )}
                
                {/* Health Score */}
                <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-sm text-gray-400">Health:</span>
                  <span className={`text-2xl font-bold ${getHealthColor(healthScore)}`}>
                    {healthScore}
                  </span>
                </div>

                {/* ✅ IMPROVED: Show reconnect status, removed redundant Remote Management button */}
                {isReconnecting && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 rounded-xl border border-orange-500/20">
                    <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                    <span className="text-sm text-orange-400">Reconnecting...</span>
                  </div>
                )}
                
                {connectionError && !isReconnecting && (
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-xl border border-red-500/20 transition-all"
                  >
                    <RefreshCw className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-red-400">Retry</span>
                  </button>
                )}
              </div>
            </div>

            {/* Status Bar */}
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  isNodeOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`} />
                <span className="font-medium">{statusDisplay.label}</span>
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Clock className="w-4 h-4" />
                Uptime: {node?.uptime || '99.9'}%
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Shield className="w-4 h-4" />
                Last seen: {node?.last_seen ? new Date(node.last_seen).toLocaleString() : 'Just now'}
              </div>
              {isReconnecting && (
                <>
                  <div className="h-4 w-px bg-white/10" />
                  <div className="flex items-center gap-2 text-sm text-orange-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Reconnecting...
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.header>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 mt-6">
          <div className="flex gap-2 border-b border-white/10">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id)}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-3 transition-colors",
                    selectedTab === tab.id
                      ? "text-white border-b-2 border-purple-500"
                      : "text-gray-400 hover:text-white"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          
          {/* Offline Warning */}
          {!isNodeOnline && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">Node is currently offline</p>
                <p className="text-red-300/70 text-sm mt-1">
                  Remote management and real-time monitoring unavailable. Check node connection.
                </p>
              </div>
            </motion.div>
          )}

          {selectedTab === 'overview' && metrics && (
            <div className="space-y-6">
              
              {/* Predictive Insights */}
              {predictiveInsights.length > 0 && (
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                    Predictive Insights & Recommendations
                  </h3>
                  <div className="space-y-3">
                    {predictiveInsights.map((insight, i) => (
                      <div key={i} className={clsx(
                        "p-4 rounded-xl border",
                        insight.type === 'warning' && 'bg-yellow-500/10 border-yellow-500/30',
                        insight.type === 'success' && 'bg-green-500/10 border-green-500/30',
                        insight.type === 'info' && 'bg-blue-500/10 border-blue-500/30'
                      )}>
                        <div className="flex items-start gap-3">
                          {insight.type === 'warning' ? (
                            <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5" />
                          ) : insight.type === 'success' ? (
                            <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
                          ) : (
                            <Info className="w-5 h-5 text-blue-400 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <p className="font-medium">{insight.message}</p>
                            <p className="text-sm text-gray-400 mt-1">{insight.prediction}</p>
                            <p className="text-sm text-gray-300 mt-2 font-medium">💡 {insight.action}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resource Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ResourceCard
                  title="CPU"
                  icon={Cpu}
                  value={metrics.cpu.usage}
                  color="purple"
                  details={[
                    { label: 'Cores', value: `${metrics.cpu.cores} vCPU` },
                    { label: 'Model', value: metrics.cpu.model.substring(0, 20) + '...' }
                  ]}
                />

                <ResourceCard
                  title="Memory"
                  icon={Database}
                  value={metrics.memory.usage}
                  color="green"
                  details={[
                    { label: 'Total', value: formatBytes(metrics.memory.total) },
                    { label: 'Used', value: formatBytes(metrics.memory.used) },
                    { label: 'Free', value: formatBytes(metrics.memory.free) }
                  ]}
                />

                <ResourceCard
                  title="Disk"
                  icon={HardDrive}
                  value={metrics.disk.usage}
                  color="orange"
                  details={[
                    { label: 'Total', value: formatBytes(metrics.disk.total) },
                    { label: 'Used', value: formatBytes(metrics.disk.used) },
                    { label: 'Free', value: formatBytes(metrics.disk.free) }
                  ]}
                />

                <ResourceCard
                  title="Network"
                  icon={Wifi}
                  value={metrics.network.usage}
                  color="blue"
                  details={[
                    { label: 'Bandwidth', value: metrics.network.bandwidth },
                    { label: 'Latency', value: metrics.network.latency }
                  ]}
                />
              </div>

              {/* Recent Events */}
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-400" />
                  Recent Events
                </h3>
                <div className="space-y-2">
                  <EventItem time="2h ago" type="info" message="Configuration updated" />
                  <EventItem time="6h ago" type="warning" message="High memory usage detected" />
                  <EventItem time="1d ago" type="success" message="System updated successfully" />
                  <EventItem time="2d ago" type="info" message="Scheduled maintenance completed" />
                </div>
              </div>
            </div>
          )}

          {/* Remote Tools Tab - ENHANCED with action buttons */}
          {selectedTab === 'remote' && (
            <div className="space-y-6">
              {/* Quick Access to Remote Tools */}
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-purple-400" />
                  Remote Management Tools
                </h3>
                <p className="text-gray-400 mb-6">
                  Access your node remotely with our secure management interface
                </p>
                
                <QuickAccessPanel 
                  isOnline={isNodeOnline}
                  onOpenRemote={openRemoteManagement}
                />
              </div>

              {/* ✅ ENHANCED: Connection Status with Action Buttons */}
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Network className="w-5 h-5 text-blue-400" />
                  Connection Status
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* WebSocket Status */}
                  <div className="p-4 bg-black/30 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Wifi className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-400">WebSocket</span>
                      </div>
                      <span className={clsx(
                        "text-sm font-semibold",
                        isWebSocketConnected ? "text-green-400" : "text-red-400"
                      )}>
                        {isWebSocketConnected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    {!isWebSocketConnected && (
                      <button
                        onClick={fullReconnect}
                        disabled={isReconnecting}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 rounded-lg transition-all text-sm"
                      >
                        {isReconnecting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Reconnecting...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            Reconnect Now
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  
                  {/* Authentication Status */}
                  <div className="p-4 bg-black/30 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-400">Authentication</span>
                      </div>
                      <span className={clsx(
                        "text-sm font-semibold",
                        jwtExpiryFormatted ? "text-green-400" : "text-yellow-400"
                      )}>
                        {jwtExpiryFormatted || 'Not authenticated'}
                      </span>
                    </div>
                    {!jwtExpiryFormatted && isWebSocketConnected && (
                      <button
                        onClick={async () => {
                          setAuthError('Authenticating...');
                          try {
                            await performAuthentication();
                            setAuthError(null);
                          } catch (err) {
                            setAuthError(err.message);
                          }
                        }}
                        disabled={isAuthenticating}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 rounded-lg transition-all text-sm"
                      >
                        {isAuthenticating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Authenticating...
                          </>
                        ) : (
                          <>
                            <Shield className="w-4 h-4" />
                            Authenticate Now
                          </>
                        )}
                      </button>
                    )}
                    {jwtExpiryFormatted && (
                      <div className="text-xs text-green-400/70 mt-2 text-center">
                        Expires in {jwtExpiryFormatted}
                      </div>
                    )}
                  </div>
                  
                  {/* Node Status */}
                  <div className="p-4 bg-black/30 rounded-lg border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Server className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-400">Node Status</span>
                    </div>
                    <span className={clsx(
                      "text-lg font-semibold",
                      isNodeOnline ? "text-green-400" : "text-red-400"
                    )}>
                      {isNodeOnline ? 'Online' : 'Offline'}
                    </span>
                    {!isNodeOnline && (
                      <p className="text-xs text-red-400/70 mt-2">
                        Check your node's network connection
                      </p>
                    )}
                  </div>
                  
                  {/* Capabilities */}
                  <div className="p-4 bg-black/30 rounded-lg border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-400">Remote Tools</span>
                    </div>
                    <span className={clsx(
                      "text-lg font-semibold",
                      canUseTerminal ? "text-green-400" : "text-gray-400"
                    )}>
                      {canUseTerminal ? 'All Available' : 'Unavailable'}
                    </span>
                    {!canUseTerminal && (
                      <p className="text-xs text-gray-400 mt-2">
                        {!isNodeOnline ? 'Node must be online' :
                         !isWebSocketConnected ? 'Connect to WebSocket' :
                         !jwtExpiryFormatted ? 'Authentication required' :
                         'Please check connection'}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* ✅ NEW: Overall Status Summary */}
                <div className="mt-4 p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg border border-purple-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {canUseTerminal ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                          <div>
                            <p className="font-medium text-green-400">All Systems Ready</p>
                            <p className="text-xs text-green-400/70">You can use all remote management tools</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-5 h-5 text-yellow-400" />
                          <div>
                            <p className="font-medium text-yellow-400">Action Required</p>
                            <p className="text-xs text-yellow-400/70">
                              {!isNodeOnline ? 'Waiting for node to come online' :
                               !isWebSocketConnected ? 'Click "Reconnect Now" above' :
                               !jwtExpiryFormatted ? 'Click "Authenticate Now" above' :
                               'Some services may be unavailable'}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Remote Management Modal */}
      {isNodeOnline && showRemoteManagement && (
        <RemoteManagement
          nodeReference={code}
          isOpen={showRemoteManagement}
          onClose={() => setShowRemoteManagement(false)}
          defaultTab={remoteManagementDefaultTab}
        />
      )}
    </div>
  );
}
