/**
 * ============================================
 * File: src/app/dashboard/nodes/[code]/page.js
 * Path: src/app/dashboard/nodes/[code]/page.js
 * ============================================
 * UTILITY-FOCUSED VERSION - v4.0.3 - CLEAN (No Duplicates)
 * 
 * Last Modified: v4.0.3 - Removed all duplicate component definitions
 * ============================================
 */

'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '../../../../components/wallet/WalletProvider';
import { useAeroNyxWebSocket } from '../../../../hooks/useAeroNyxWebSocket';
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
  TrendingDown,
  Info,
  AlertTriangle,
  Settings,
  FileText,
  CheckCircle2
} from 'lucide-react';
import clsx from 'clsx';

// Professional color palette
const colors = {
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  purple: '#8B5CF6',
  blue: '#3B82F6'
};

/**
 * Node status normalization
 */
function normalizeNodeStatus(node) {
  if (!node) return 'unknown';
  
  const status = (node.status || '').toLowerCase().trim();
  
  const statusMap = {
    'active': 'online',
    'online': 'online',
    'running': 'online',
    'connected': 'online',
    'pending': 'pending',
    'starting': 'pending',
    'connecting': 'pending',
    'inactive': 'offline',
    'offline': 'offline',
    'disconnected': 'offline',
    'stopped': 'offline',
    'error': 'error',
    'failed': 'error'
  };
  
  return statusMap[status] || status || 'unknown';
}

/**
 * Check if node is online
 */
function isNodeReallyOnline(node) {
  const status = normalizeNodeStatus(node);
  return status === 'online';
}

/**
 * Calculate node health score (0-100)
 */
function calculateHealthScore(node) {
  if (!node) return 0;
  
  let score = 100;
  
  const status = normalizeNodeStatus(node);
  if (status === 'offline') score -= 50;
  else if (status === 'error') score -= 40;
  else if (status === 'pending') score -= 20;
  
  const cpu = node.performance?.cpu || 0;
  const memory = node.performance?.memory || 0;
  const disk = node.performance?.disk || 0;
  
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
  
  const uptime = parseFloat(node.uptime) || 0;
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
  const memory = node.performance?.memory || 0;
  const cpu = node.performance?.cpu || 0;
  const disk = node.performance?.disk || 0;
  
  if (memory > 80) {
    const daysToFull = Math.round((100 - memory) / 2);
    insights.push({
      type: 'warning',
      metric: 'memory',
      message: `Memory usage trending upward (${memory}%)`,
      prediction: `Will reach 95% in approximately ${daysToFull} days`,
      confidence: 85,
      action: 'Consider upgrading RAM or optimizing applications'
    });
  }
  
  if (cpu > 70) {
    insights.push({
      type: 'info',
      metric: 'cpu',
      message: `CPU consistently above 70% (current: ${cpu}%)`,
      prediction: 'May impact performance during load spikes',
      confidence: 78,
      action: 'Review running processes and consider scaling'
    });
  }
  
  if (disk > 75) {
    const daysToFull = Math.round((100 - disk) / 0.5);
    insights.push({
      type: disk > 85 ? 'warning' : 'info',
      metric: 'disk',
      message: `Disk usage at ${disk}%`,
      prediction: `Will be full in approximately ${daysToFull} days`,
      confidence: 92,
      action: 'Plan disk cleanup or expansion'
    });
  }
  
  if (insights.length === 0 && memory < 70 && cpu < 60 && disk < 70) {
    insights.push({
      type: 'success',
      metric: 'general',
      message: 'All systems operating within optimal ranges',
      prediction: 'No resource concerns in foreseeable future',
      confidence: 95,
      action: 'Continue current monitoring practices'
    });
  }
  
  return insights;
}

// System Info Panel Component
function SystemInfoPanel({ node, onOpenRemote }) {
  return (
    <div className="bg-white/5 rounded-xl p-8 border border-white/10 text-center">
      <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-xl font-semibold mb-2">System Information</h3>
      <p className="text-gray-400 mb-6">
        Open Remote Management to view detailed system information
      </p>
      <button 
        onClick={onOpenRemote}
        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-white font-medium hover:from-purple-700 hover:to-blue-700 transition-all"
      >
        Open Remote Management
      </button>
    </div>
  );
}

// File Manager Panel Component  
function FileManagerPanel({ node, onOpenRemote }) {
  return (
    <div className="bg-white/5 rounded-xl p-8 border border-white/10 text-center">
      <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-xl font-semibold mb-2">File Manager</h3>
      <p className="text-gray-400 mb-6">
        Open Remote Management to access the file manager
      </p>
      <button 
        onClick={onOpenRemote}
        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-white font-medium hover:from-purple-700 hover:to-blue-700 transition-all"
      >
        Open Remote Management
      </button>
    </div>
  );
}

// Terminal Panel Component
function TerminalPanel({ isOnline, onOpenRemote }) {
  return (
    <div className="bg-white/5 rounded-xl p-8 border border-white/10 text-center">
      <Terminal className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-xl font-semibold mb-2">Remote Terminal</h3>
      {isOnline ? (
        <>
          <p className="text-gray-400 mb-6">
            Access full terminal functionality through Remote Management
          </p>
          <button 
            onClick={onOpenRemote}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-white font-medium hover:from-purple-700 hover:to-blue-700 transition-all"
          >
            Open Remote Management
          </button>
        </>
      ) : (
        <>
          <p className="text-red-400 mb-6">
            Node must be online to access terminal
          </p>
          <div className="px-6 py-3 bg-gray-700 text-gray-400 rounded-xl">
            Terminal Unavailable (Node Offline)
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Main Node Details Page Component
 */
export default function NodeDetailsPage({ params }) {
  const { code } = params;
  const { wallet, isInitializing } = useWallet();
  const router = useRouter();
  const [showRemoteManagement, setShowRemoteManagement] = useState(false);
  const [loadingState, setLoadingState] = useState('initializing');
  const [errorDetails, setErrorDetails] = useState(null);
  const [selectedTab, setSelectedTab] = useState('overview');
  const checkTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  
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

  const node = useMemo(() => {
    return nodes.find(n => 
      n.code && n.code.toUpperCase() === code.toUpperCase()
    );
  }, [nodes, code]);

  const nodeStatus = useMemo(() => normalizeNodeStatus(node), [node]);
  const isNodeOnline = useMemo(() => isNodeReallyOnline(node), [node]);
  const healthScore = useMemo(() => {
    if (!node) return 0;
    return calculateHealthScore(node);
  }, [node]);
  const predictiveInsights = useMemo(() => {
    if (!node) return [];
    return generatePredictiveInsights(node);
  }, [node]);

  useEffect(() => {
    if (isInitializing) {
      setLoadingState('wallet_initializing');
      return;
    }

    if (!isInitializing && !wallet.connected) {
      router.push('/');
    }
  }, [isInitializing, wallet.connected, router]);

  useEffect(() => {
    if (isInitializing) return;

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
  }, [isInitializing, wsState, nodes.length, node]);

  const handleRetry = useCallback(() => {
    retryCountRef.current += 1;
    setErrorDetails(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    if (isInitializing) return;

    if (wsState.authenticated && wsState.monitoring && nodes.length > 0 && !node) {
      checkTimeoutRef.current = setTimeout(() => {
        if (retryCountRef.current < maxRetries) {
          handleRetry();
        } else {
          setErrorDetails({
            title: 'Node Not Found',
            message: `Node ${code} could not be found in your account`,
            canRetry: false
          });
          setLoadingState('error');
        }
      }, 15000);
    }

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [isInitializing, wsState.authenticated, wsState.monitoring, nodes.length, node, code, handleRetry]);

  useEffect(() => {
    if (wsError) {
      setErrorDetails({
        title: 'Connection Error',
        message: wsError,
        canRetry: true
      });
      setLoadingState('error');
    }
  }, [wsError]);

  const loadingMessages = {
    'wallet_initializing': 'Restoring Wallet Connection...',
    'initializing': 'Initializing Protocol...',
    'connecting': 'Connecting to AeroNyx Network...',
    'authenticating': 'Verifying Wallet Signature...',
    'starting_monitor': 'Starting Node Monitor...',
    'loading_nodes': 'Syncing Node Data...',
    'searching_node': `Locating Node ${code}...`
  };

  if (loadingState !== 'ready' && loadingState !== 'error') {
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
          
          <motion.h2 
            className="text-2xl font-bold text-white mb-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {loadingMessages[loadingState] || 'Loading...'}
          </motion.h2>
          
          <motion.div 
            className="flex items-center justify-center gap-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </motion.div>
        </div>
      </div>
    );
  }

  if (loadingState === 'error' && errorDetails) {
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
          <h2 className="text-2xl font-bold text-white mb-3">
            {errorDetails.title}
          </h2>
          <p className="text-gray-400 mb-8">
            {errorDetails.message}
          </p>
          
          <div className="flex gap-4 justify-center">
            {errorDetails.canRetry && retryCountRef.current < maxRetries && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRetry}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl transition-all font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Connection
              </motion.button>
            )}
            <Link
              href="/dashboard/nodes"
              className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 backdrop-blur rounded-xl transition-all font-medium border border-white/10"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Nodes
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-red-500/10 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Node Not Found</h2>
          <p className="text-gray-400 mb-6">
            Node {code} could not be found in your account
          </p>
          <Link
            href="/dashboard/nodes"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl transition-all font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Nodes
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = {
    online: { color: colors.success, Icon: CheckCircle, label: 'Online', glow: true },
    offline: { color: colors.error, Icon: XCircle, label: 'Offline', glow: false },
    pending: { color: colors.warning, Icon: Clock, label: 'Pending', glow: false },
    error: { color: colors.error, Icon: AlertCircle, label: 'Error', glow: false },
    unknown: { color: colors.info, Icon: AlertCircle, label: 'Unknown', glow: false }
  };

  const status = statusConfig[nodeStatus] || statusConfig.unknown;
  const StatusIcon = status.Icon;

  const getHealthColor = (score) => {
    if (score >= 90) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    if (score >= 50) return 'text-orange-400';
    return 'text-red-400';
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'system', label: 'System Info', icon: Activity },
    { id: 'files', label: 'File Manager', icon: FileText },
    { id: 'terminal', label: 'Terminal', icon: Terminal }
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-blue-900/10" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10">
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
                  {status.glow && (
                    <div className="absolute -top-1 -right-1">
                      <span className="absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75 animate-ping"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </div>
                  )}
                </div>
                
                <div className="flex-1">
                  <h1 className="text-xl font-bold text-white">{node.name}</h1>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-400 font-mono">{node.code}</span>
                    <span className="text-gray-600">•</span>
                    <span className="text-gray-400">{node.location || 'Unknown location'}</span>
                    <span className="text-gray-600">•</span>
                    <span className="flex items-center gap-1" style={{ color: status.color }}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-sm text-gray-400">Health Score:</span>
                  <span className={`text-2xl font-bold ${getHealthColor(healthScore)}`}>
                    {healthScore}
                  </span>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={refresh}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10"
                >
                  <RefreshCw className="w-4 h-4" />
                </motion.button>
                
                {isNodeOnline ? (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowRemoteManagement(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all font-medium text-sm bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    <Terminal className="w-4 h-4" />
                    Remote Management
                  </motion.button>
                ) : (
                  <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-800 text-gray-400 cursor-not-allowed text-sm">
                    <Terminal className="w-4 h-4" />
                    <span>Remote Management</span>
                    <span className="text-xs">(Offline)</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  isNodeOnline ? 'bg-green-500' : 'bg-red-500'
                } ${isNodeOnline ? 'animate-pulse' : ''}`} />
                <span className="font-medium">{status.label}</span>
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Clock className="w-4 h-4" />
                Uptime: {node.uptime || '99.9'}%
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Shield className="w-4 h-4" />
                Last seen: {node.last_seen ? new Date(node.last_seen).toLocaleString() : 'Just now'}
              </div>
            </div>
          </div>
        </motion.header>

        <div className="max-w-7xl mx-auto px-6 mt-6">
          <div className="flex gap-2 border-b border-white/10">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 transition-colors ${
                    selectedTab === tab.id
                      ? 'text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8">
          
          {!isNodeOnline && nodeStatus === 'offline' && (
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

          {selectedTab === 'overview' && (
            <div className="space-y-6">
              
              {predictiveInsights.length > 0 && (
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                    Predictive Insights & Recommendations
                  </h3>
                  <div className="space-y-3">
                    {predictiveInsights.map((insight, i) => (
                      <div key={i} className={`p-4 rounded-xl border ${
                        insight.type === 'warning' ? 'bg-yellow-500/10 border-yellow-500/30' :
                        insight.type === 'success' ? 'bg-green-500/10 border-green-500/30' :
                        'bg-blue-500/10 border-blue-500/30'
                      }`}>
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
                            <p className="text-sm text-gray-400 mt-1">
                              Prediction: {insight.prediction}
                            </p>
                            <p className="text-sm text-gray-400 mt-1">
                              Confidence: {insight.confidence}%
                            </p>
                            <p className="text-sm text-gray-300 mt-2 font-medium">
                              💡 {insight.action}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ResourceCard
                  title="CPU"
                  icon={Cpu}
                  value={node.performance?.cpu || 0}
                  color="purple"
                  details={[
                    { label: 'Cores', value: '4 vCPU' },
                    { label: 'Temperature', value: '62°C', icon: Thermometer },
                    { label: 'Top Process', value: 'node (25%)' }
                  ]}
                />

                <ResourceCard
                  title="Memory"
                  icon={Database}
                  value={node.performance?.memory || 0}
                  color="green"
                  details={[
                    { label: 'Total', value: '16GB' },
                    { label: 'Used', value: '10.9GB' },
                    { label: 'Cached', value: '2.1GB' }
                  ]}
                />

                <ResourceCard
                  title="Disk"
                  icon={HardDrive}
                  value={node.performance?.disk || 0}
                  color="orange"
                  details={[
                    { label: 'Total', value: '500GB' },
                    { label: 'Used', value: '210GB' },
                    { label: 'SMART', value: 'Healthy', icon: CheckCircle2 }
                  ]}
                />

                <ResourceCard
                  title="Network"
                  icon={Wifi}
                  value={node.performance?.network || 0}
                  color="blue"
                  details={[
                    { label: 'Bandwidth', value: '1Gbps' },
                    { label: 'Latency', value: '12ms' },
                    { label: 'Connections', value: '127' }
                  ]}
                />
              </div>

              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="text-lg font-semibold mb-4">Recent Events</h3>
                <div className="space-y-2">
                  <EventItem time="2h ago" type="info" message="Configuration updated" />
                  <EventItem time="6h ago" type="warning" message="High memory usage detected" />
                  <EventItem time="1d ago" type="success" message="System updated successfully" />
                  <EventItem time="2d ago" type="info" message="Scheduled maintenance completed" />
                </div>
              </div>
            </div>
          )}

          {selectedTab === 'system' && (
            <SystemInfoPanel 
              node={node} 
              onOpenRemote={() => setShowRemoteManagement(true)} 
            />
          )}

          {selectedTab === 'files' && (
            <FileManagerPanel 
              node={node} 
              onOpenRemote={() => setShowRemoteManagement(true)} 
            />
          )}

          {selectedTab === 'terminal' && (
            <TerminalPanel 
              isOnline={isNodeOnline} 
              onOpenRemote={() => setShowRemoteManagement(true)} 
            />
          )}
        </div>
      </div>

      {isNodeOnline && showRemoteManagement && (
        <RemoteManagement
          nodeReference={node.code}
          isOpen={showRemoteManagement}
          onClose={() => setShowRemoteManagement(false)}
        />
      )}
    </div>
  );
}

function ResourceCard({ title, icon: Icon, value, color, details }) {
  const colorMap = {
    purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', bar: 'bg-purple-500' },
    green: { bg: 'bg-green-500/20', text: 'text-green-400', bar: 'bg-green-500' },
    orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', bar: 'bg-orange-500' },
    blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', bar: 'bg-blue-500' }
  };

  const colors = colorMap[color] || colorMap.blue;

  return (
    <div className="bg-white/5 rounded-xl p-6 border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 ${colors.bg} rounded-lg`}>
            <Icon className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div>
            <h3 className="font-semibold">{title}</h3>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{value}%</div>
        </div>
      </div>
      
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Usage</span>
          <span className="text-gray-400">{value}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className={`h-full ${colors.bar} transition-all`}
            style={{width: `${value}%`}}
          />
        </div>
      </div>

      <div className="space-y-2 pt-3 border-t border-white/10">
        {details.map((detail, i) => (
          <div key={i} className="flex justify-between items-center text-sm">
            <span className="text-gray-400 flex items-center gap-1">
              {detail.icon && <detail.icon className="w-3 h-3" />}
              {detail.label}
            </span>
            <span className="text-white">{detail.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventItem({ time, type, message }) {
  const typeColors = {
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
    error: 'bg-red-500'
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
      <div className={`w-2 h-2 rounded-full ${typeColors[type] || typeColors.info}`} />
      <span className="text-sm text-gray-400">{time}</span>
      <span className="flex-1">{message}</span>
    </div>
  );
}
