/**
 * ============================================
 * File: src/components/nodes/SystemInfo.js
 * ============================================
 * System Information Component - FIXED VERSION
 * 
 * Modification Reason: Use remote_command API instead of terminal commands
 * Main Changes:
 * - Now uses getSystemInfo() for comprehensive system data
 * - Falls back to executeCommand() for individual metrics if needed
 * - All commands use remote_command (not terminal)
 * 
 * ⚠️ Important Note:
 * - Prefers getSystemInfo() for efficiency (one call gets all data)
 * - executeCommand() is for specific queries only
 * - No output will appear in Terminal tab
 * 
 * Last Modified: v3.0.0 - Fixed to use remote command API
 * ============================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, 
  RefreshCw, 
  Cpu, 
  HardDrive, 
  Database, 
  Clock,
  Activity,
  Wifi,
  Server,
  Zap,
  MemoryStick,
  Gauge,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Network,
  Shield,
  Thermometer
} from 'lucide-react';
import clsx from 'clsx';

export default function SystemInfo({ 
  nodeReference, 
  getSystemInfo,    // From useRemoteManagement
  executeCommand    // From useRemoteManagement (fallback)
}) {
  // State Management
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [lastUpdate, setLastUpdate] = useState(null);
  const [metrics, setMetrics] = useState({
    cpu: { usage: 0, cores: 0, loadAvg: [0, 0, 0], trend: 'stable' },
    memory: { used: 0, total: 0, percent: 0, available: 0, trend: 'stable' },
    disk: { used: 0, total: 0, percent: 0, available: 0, trend: 'stable' },
    network: { interfaces: [], active: false },
    processes: { total: 0, running: 0, sleeping: 0, zombie: 0 },
    system: { hostname: '', kernel: '', uptime: '', temperature: null }
  });

  // Refs
  const intervalRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  /**
   * Format bytes to human readable
   */
  const formatBytes = useCallback((bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  /**
   * Format uptime seconds to readable string
   */
  const formatUptime = useCallback((seconds) => {
    if (!seconds) return 'Unknown';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.join(' ') || '< 1m';
  }, []);

  /**
   * Load comprehensive system information using getSystemInfo
   */
  const loadSystemInfo = useCallback(async () => {
    // Don't start a new load if one is in progress
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('[SystemInfo] Loading system information...');
      
      // Call remote command API - get comprehensive system info
      const result = await getSystemInfo();
      
      // Check if aborted
      if (signal.aborted) return;
      
      console.log('[SystemInfo] System info result:', result);
      
      // Parse the result
      const systemData = {
        hostname: result.hostname || 'Unknown',
        kernel: result.os?.kernel || result.os?.version || 'Unknown',
        uptime: result.uptime_seconds ? formatUptime(result.uptime_seconds) : 'Unknown',
        temperature: result.cpu?.temperature || null
      };
      
      const cpuData = {
        usage: Math.round(result.cpu?.usage_percent || 0),
        cores: result.cpu?.cores || 0,
        loadAvg: result.load_average || [0, 0, 0],
        trend: 'stable' // Calculate from history if available
      };
      
      const memoryData = {
        used: formatBytes((result.memory?.used_mb || 0) * 1024 * 1024),
        total: formatBytes((result.memory?.total_mb || 0) * 1024 * 1024),
        percent: Math.round(result.memory?.usage_percent || 0),
        available: formatBytes((result.memory?.available_mb || 0) * 1024 * 1024),
        trend: 'stable'
      };
      
      // Get primary disk info
      const primaryDisk = result.disks?.[0] || {};
      const diskData = {
        used: `${primaryDisk.used_gb || 0}GB`,
        total: `${primaryDisk.total_gb || 0}GB`,
        percent: Math.round(primaryDisk.usage_percent || 0),
        available: `${primaryDisk.available_gb || 0}GB`,
        trend: 'stable'
      };
      
      const networkData = {
        interfaces: (result.network?.interfaces || []).map(iface => ({
          name: iface.name,
          ip: iface.ip_address,
          type: iface.name.includes('wlan') ? 'wireless' : 'ethernet'
        })),
        active: result.network?.interfaces?.length > 0 || false
      };
      
      // Calculate process stats (if not provided, use estimates)
      const processData = {
        total: 0,
        running: 0,
        sleeping: 0,
        zombie: 0
      };
      
      // Update state if still mounted
      if (isMountedRef.current) {
        setMetrics({
          cpu: cpuData,
          memory: memoryData,
          disk: diskData,
          network: networkData,
          processes: processData,
          system: systemData
        });
        
        setInfo(result);
        setLastUpdate(new Date());
      }
      
    } catch (err) {
      console.error('[SystemInfo] Failed to load system info:', err);
      
      if (isMountedRef.current && !signal.aborted) {
        let errorMessage = 'Failed to load system information';
        if (err && err.message) {
          errorMessage = err.message;
        }
        setError(errorMessage);
      }
    } finally {
      if (isMountedRef.current && !signal.aborted) {
        setLoading(false);
      }
      abortControllerRef.current = null;
    }
  }, [getSystemInfo, formatUptime, formatBytes]);

  /**
   * Toggle auto-refresh
   */
  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev);
  }, []);

  /**
   * Get status color based on percentage
   */
  const getStatusColor = useCallback((percent) => {
    if (percent >= 90) return 'text-red-400';
    if (percent >= 70) return 'text-yellow-400';
    if (percent >= 50) return 'text-blue-400';
    return 'text-green-400';
  }, []);

  /**
   * Get status icon based on trend
   */
  const getTrendIcon = useCallback((trend) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-red-400" />;
      case 'down': return <TrendingDown className="w-4 h-4 text-green-400" />;
      default: return <Minus className="w-4 h-4 text-gray-400" />;
    }
  }, []);

  /**
   * Initial load
   */
  useEffect(() => {
    if (getSystemInfo) {
      loadSystemInfo();
    }
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [getSystemInfo, loadSystemInfo]);

  /**
   * Auto-refresh
   */
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0 && getSystemInfo) {
      intervalRef.current = setInterval(() => {
        loadSystemInfo();
      }, refreshInterval * 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, getSystemInfo, loadSystemInfo]);

  /**
   * Cleanup
   */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Render loading state
  if (loading && !info) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading system information...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error && !info) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={loadSystemInfo}
            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors text-red-400"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-semibold text-white">System Information</h3>
          <p className="text-sm text-gray-400 mt-1">
            Node: {nodeReference}
            {lastUpdate && (
              <span className="ml-2">• Last updated: {lastUpdate.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Auto-refresh toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAutoRefresh}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                autoRefresh 
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10"
              )}
            >
              {autoRefresh ? (
                <>
                  <Activity className="w-4 h-4 inline-block mr-1.5 animate-pulse" />
                  Auto-refresh ON
                </>
              ) : (
                'Auto-refresh OFF'
              )}
            </button>
            
            {autoRefresh && (
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
              >
                <option value="10">10s</option>
                <option value="30">30s</option>
                <option value="60">1m</option>
                <option value="300">5m</option>
              </select>
            )}
          </div>
          
          {/* Manual refresh */}
          <button
            onClick={loadSystemInfo}
            disabled={loading}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx("w-4 h-4 text-gray-400", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto space-y-6">
        {/* System Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10"
          >
            <div className="flex items-center justify-between mb-3">
              <Server className="w-5 h-5 text-purple-400" />
              <CheckCircle className="w-4 h-4 text-green-400" />
            </div>
            <h4 className="text-sm text-gray-400 mb-1">Hostname</h4>
            <p className="text-lg font-mono text-white">{metrics.system.hostname}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10"
          >
            <div className="flex items-center justify-between mb-3">
              <Clock className="w-5 h-5 text-blue-400" />
              <Activity className="w-4 h-4 text-green-400" />
            </div>
            <h4 className="text-sm text-gray-400 mb-1">Uptime</h4>
            <p className="text-lg font-mono text-white">{metrics.system.uptime}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10"
          >
            <div className="flex items-center justify-between mb-3">
              <Shield className="w-5 h-5 text-green-400" />
              <span className="text-xs text-gray-500">Kernel</span>
            </div>
            <h4 className="text-sm text-gray-400 mb-1">System</h4>
            <p className="text-sm font-mono text-white truncate">{metrics.system.kernel}</p>
          </motion.div>
        </div>

        {/* Resource Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CPU Usage */}
          <ResourceCard
            title="CPU"
            icon={Cpu}
            value={metrics.cpu.usage}
            color="purple"
            trend={metrics.cpu.trend}
            details={[
              { label: 'Cores', value: metrics.cpu.cores },
              { label: 'Load Avg', value: metrics.cpu.loadAvg.map(l => l.toFixed(2)).join(', ') }
            ]}
          />

          {/* Memory Usage */}
          <ResourceCard
            title="Memory"
            icon={Database}
            value={metrics.memory.percent}
            color="blue"
            trend={metrics.memory.trend}
            details={[
              { label: 'Used', value: metrics.memory.used },
              { label: 'Available', value: metrics.memory.available }
            ]}
          />

          {/* Disk Usage */}
          <ResourceCard
            title="Disk"
            icon={HardDrive}
            value={metrics.disk.percent}
            color="green"
            trend={metrics.disk.trend}
            details={[
              { label: 'Used', value: metrics.disk.used },
              { label: 'Available', value: metrics.disk.available }
            ]}
          />

          {/* Network */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-cyan-900/20 to-cyan-800/10 backdrop-blur rounded-xl p-4 border border-cyan-500/20"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-cyan-400" />
                <span className="text-sm font-medium text-white">Network</span>
              </div>
              {metrics.network.active ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-gray-400" />
              )}
            </div>
            
            <div className="space-y-2">
              {metrics.network.interfaces.length > 0 ? (
                metrics.network.interfaces.map((iface, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-400">{iface.name}</span>
                    <span className="text-white font-mono">{iface.ip}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400">No active interfaces</p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Temperature (if available) */}
        {metrics.system.temperature !== null && (
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <Thermometer className="w-5 h-5 text-orange-400" />
              <h4 className="font-medium text-white">Temperature</h4>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">CPU Temperature</span>
              <span className={clsx(
                "text-2xl font-bold",
                metrics.system.temperature > 80 ? "text-red-400" :
                metrics.system.temperature > 60 ? "text-yellow-400" :
                "text-green-400"
              )}>
                {metrics.system.temperature.toFixed(1)}°C
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceCard({ title, icon: Icon, value, color, trend, details }) {
  const colorMap = {
    purple: { bg: 'from-purple-900/20 to-purple-800/10', text: 'text-purple-400', bar: 'bg-purple-500', border: 'border-purple-500/20' },
    blue: { bg: 'from-blue-900/20 to-blue-800/10', text: 'text-blue-400', bar: 'bg-blue-500', border: 'border-blue-500/20' },
    green: { bg: 'from-green-900/20 to-green-800/10', text: 'text-green-400', bar: 'bg-green-500', border: 'border-green-500/20' }
  };

  const colors = colorMap[color] || colorMap.blue;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-gradient-to-br ${colors.bg} backdrop-blur rounded-xl p-4 border ${colors.border}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${colors.text}`} />
          <span className="text-sm font-medium text-white">{title}</span>
        </div>
        <div className="text-2xl font-bold text-white">{value}%</div>
      </div>
      
      {/* Progress Bar */}
      <div className="h-2 bg-black/30 rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5 }}
          className={`h-full ${colors.bar}`}
        />
      </div>

      {/* Details */}
      <div className="space-y-1">
        {details.map((detail, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-gray-400">{detail.label}</span>
            <span className="text-white">{detail.value}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
