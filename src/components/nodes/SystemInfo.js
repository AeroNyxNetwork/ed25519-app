/**
 * ============================================
 * File: src/components/nodes/SystemInfo.js
 * ============================================
 * System Information Component - PRODUCTION VERSION v5.0.0
 * 
 * Main Functionality:
 * - Display comprehensive system information
 * - Real-time metrics with auto-refresh
 * - Handle authentication requirements
 * - Display execution time for performance monitoring
 * 
 * Dependencies: useRemoteManagement hook, lucide-react icons
 * 
 * ⚠️ Important Notes:
 * - All commands use remote_command API (not terminal)
 * - Must wait for isRemoteAuthenticated before loading
 * - Execution time displayed for monitoring
 * - Auto-refresh with configurable intervals
 * 
 * Last Modified: v5.0.0 - Production complete
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
  AlertCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Network,
  Shield,
  Thermometer,
  Terminal,
  Settings
} from 'lucide-react';
import clsx from 'clsx';

// ==================== HELPER FUNCTIONS ====================

function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  if (!seconds) return 'Unknown';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.join(' ') || '< 1m';
}

// ==================== MAIN COMPONENT ====================

export default function SystemInfo({ 
  nodeReference, 
  getSystemInfo,
  executeCommand,
  isRemoteAuthenticated
}) {
  // ==================== STATE MANAGEMENT ====================
  
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [remoteNotEnabled, setRemoteNotEnabled] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [executionTime, setExecutionTime] = useState(null);
  
  const [metrics, setMetrics] = useState({
    cpu: { usage: 0, cores: 0, loadAvg: [0, 0, 0], trend: 'stable', model: '' },
    memory: { used: 0, total: 0, percent: 0, available: 0, trend: 'stable' },
    disk: { used: 0, total: 0, percent: 0, available: 0, trend: 'stable' },
    network: { interfaces: [], active: false },
    processes: { total: 0, running: 0, sleeping: 0, zombie: 0 },
    system: { hostname: '', kernel: '', uptime: '', temperature: null, platform: '' }
  });

  // Refs
  const intervalRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);
  const previousMetricsRef = useRef(null);
  const hasLoadedRef = useRef(false);

  // ==================== UTILITIES ====================
  
  const calculateTrend = useCallback((current, previous) => {
    if (!previous) return 'stable';
    const diff = current - previous;
    if (diff > 5) return 'up';
    if (diff < -5) return 'down';
    return 'stable';
  }, []);

  const getStatusColor = useCallback((percent) => {
    if (percent >= 90) return 'text-red-400';
    if (percent >= 70) return 'text-yellow-400';
    if (percent >= 50) return 'text-blue-400';
    return 'text-green-400';
  }, []);

  const getTrendIcon = useCallback((trend) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-red-400" />;
      case 'down': return <TrendingDown className="w-4 h-4 text-green-400" />;
      default: return <Minus className="w-4 h-4 text-gray-400" />;
    }
  }, []);

  // ==================== LOAD SYSTEM INFO ====================
  
  const loadSystemInfo = useCallback(async () => {
    if (!getSystemInfo) {
      console.log('[SystemInfo] getSystemInfo not available yet');
      return;
    }
    
    if (!isRemoteAuthenticated) {
      console.log('[SystemInfo] Not authenticated yet, waiting...');
      setError('Waiting for authentication...');
      return;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setLoading(true);
    setError(null);
    setRemoteNotEnabled(false);
    
    const startTime = Date.now();
    
    try {
      console.log('[SystemInfo] Loading system information...');
      
      const result = await getSystemInfo();
      
      if (signal.aborted) return;
      
      const execTime = Date.now() - startTime;
      setExecutionTime(execTime);
      
      console.log('[SystemInfo] System info result:', result);
      console.log('[SystemInfo] Execution time:', execTime, 'ms');
      
      // Parse system data
      const systemData = {
        hostname: result.hostname || 'Unknown',
        kernel: result.os?.kernel || result.os?.version || 'Unknown',
        platform: result.os?.name || 'Unknown',
        uptime: result.uptime_seconds ? formatUptime(result.uptime_seconds) : 'Unknown',
        temperature: result.cpu?.temperature || null
      };
      
      const cpuData = {
        usage: Math.round(result.cpu?.usage_percent || 0),
        cores: result.cpu?.cores || 0,
        model: result.cpu?.model || 'Unknown',
        loadAvg: result.load_average || [0, 0, 0],
        trend: previousMetricsRef.current 
          ? calculateTrend(result.cpu?.usage_percent || 0, previousMetricsRef.current.cpu?.usage || 0)
          : 'stable'
      };
      
      const memoryData = {
        used: formatBytes((result.memory?.used_mb || 0) * 1024 * 1024),
        total: formatBytes((result.memory?.total_mb || 0) * 1024 * 1024),
        percent: Math.round(result.memory?.usage_percent || 0),
        available: formatBytes((result.memory?.available_mb || 0) * 1024 * 1024),
        trend: previousMetricsRef.current
          ? calculateTrend(result.memory?.usage_percent || 0, previousMetricsRef.current.memory?.percent || 0)
          : 'stable'
      };
      
      const primaryDisk = result.disks?.[0] || {};
      const diskData = {
        used: `${primaryDisk.used_gb || 0} GB`,
        total: `${primaryDisk.total_gb || 0} GB`,
        percent: Math.round(primaryDisk.usage_percent || 0),
        available: `${primaryDisk.available_gb || 0} GB`,
        trend: previousMetricsRef.current
          ? calculateTrend(primaryDisk.usage_percent || 0, previousMetricsRef.current.disk?.percent || 0)
          : 'stable'
      };
      
      const networkData = {
        interfaces: (result.network?.interfaces || []).map(iface => ({
          name: iface.name,
          ip: iface.ip_address,
          type: iface.name.includes('wlan') ? 'wireless' : 'ethernet',
          status: iface.status || 'up'
        })),
        active: result.network?.interfaces?.length > 0 || false
      };
      
      const processData = {
        total: result.processes?.total || 0,
        running: result.processes?.running || 0,
        sleeping: result.processes?.sleeping || 0,
        zombie: result.processes?.zombie || 0
      };
      
      previousMetricsRef.current = {
        cpu: cpuData,
        memory: memoryData,
        disk: diskData
      };
      
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
        hasLoadedRef.current = true;
      }
      
    } catch (err) {
      console.error('[SystemInfo] Failed to load system info:', err);
      
      if (isMountedRef.current && !signal.aborted) {
        let errorMessage = 'Failed to load system information';
        
        if (err && err.message) {
          errorMessage = err.message;
          
          // Check for specific errors
          if (errorMessage.includes('Remote management not enabled') ||
              errorMessage.includes('REMOTE_NOT_ENABLED')) {
            setRemoteNotEnabled(true);
            errorMessage = 'Remote management is not enabled on this node';
          } else if (errorMessage.includes('Not authenticated') ||
                     errorMessage.includes('AUTH_FAILED')) {
            errorMessage = 'Please wait for authentication to complete';
          } else if (errorMessage.includes('timeout')) {
            errorMessage = 'Request timeout. The server may be slow to respond.';
          }
        }
        
        setError(errorMessage);
      }
    } finally {
      if (isMountedRef.current && !signal.aborted) {
        setLoading(false);
      }
      abortControllerRef.current = null;
    }
  }, [getSystemInfo, isRemoteAuthenticated, calculateTrend]);

  // ==================== AUTO-REFRESH ====================
  
  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev);
  }, []);

  useEffect(() => {
    if (autoRefresh && refreshInterval > 0 && getSystemInfo && isRemoteAuthenticated) {
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
  }, [autoRefresh, refreshInterval, getSystemInfo, isRemoteAuthenticated, loadSystemInfo]);

  // ==================== LIFECYCLE ====================
  
  useEffect(() => {
    if (!hasLoadedRef.current && getSystemInfo && isRemoteAuthenticated) {
      console.log('[SystemInfo] Initial load with authentication');
      // Delay to ensure everything is ready
      const timer = setTimeout(() => {
        if (isMountedRef.current && !hasLoadedRef.current) {
          loadSystemInfo();
        }
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [getSystemInfo, isRemoteAuthenticated, loadSystemInfo]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ==================== RENDER ====================
  
  // Remote management not enabled state
  if (remoteNotEnabled) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-2xl">
          <div className="w-20 h-20 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Settings className="w-10 h-10 text-yellow-400" />
          </div>
          <h3 className="text-2xl font-semibold text-white mb-3">Remote Management Not Enabled</h3>
          <p className="text-gray-400 mb-6">
            This node does not have remote management enabled. To use system information features, 
            please enable it in the node configuration.
          </p>
          <div className="bg-black/40 rounded-xl p-4 text-left text-sm text-gray-300 border border-white/10">
            <p className="mb-2">To enable remote management, configure your node settings and restart the service.</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
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

  // Waiting for authentication
  if (!isRemoteAuthenticated && !info) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield className="w-12 h-12 text-yellow-400 mx-auto mb-4 animate-pulse" />
          <p className="text-yellow-400 mb-2">Waiting for authentication...</p>
          <p className="text-sm text-gray-400">Please wait while we authenticate your session</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !info) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 mb-4">{error}</p>
          {isRemoteAuthenticated && (
            <button
              onClick={loadSystemInfo}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors text-red-400"
            >
              Retry
            </button>
          )}
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
              <>
                <span className="mx-2">•</span>
                Last updated: {lastUpdate.toLocaleTimeString()}
              </>
            )}
            {executionTime && (
              <>
                <span className="mx-2">•</span>
                Execution: {executionTime}ms
              </>
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
            disabled={loading || !isRemoteAuthenticated}
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
          <SystemOverviewCard
            icon={Server}
            iconColor="text-purple-400"
            label="Hostname"
            value={metrics.system.hostname}
            statusIcon={CheckCircle}
            statusColor="text-green-400"
          />

          <SystemOverviewCard
            icon={Clock}
            iconColor="text-blue-400"
            label="Uptime"
            value={metrics.system.uptime}
            statusIcon={Activity}
            statusColor="text-green-400"
          />

          <SystemOverviewCard
            icon={Shield}
            iconColor="text-green-400"
            label="Platform"
            value={metrics.system.platform}
            subtitle={metrics.system.kernel}
          />
        </div>

        {/* Resource Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ResourceCard
            title="CPU"
            icon={Cpu}
            value={metrics.cpu.usage}
            color="purple"
            trend={metrics.cpu.trend}
            details={[
              { label: 'Cores', value: metrics.cpu.cores },
              { label: 'Model', value: metrics.cpu.model },
              { label: 'Load Avg', value: metrics.cpu.loadAvg.map(l => l.toFixed(2)).join(', ') }
            ]}
          />

          <ResourceCard
            title="Memory"
            icon={Database}
            value={metrics.memory.percent}
            color="blue"
            trend={metrics.memory.trend}
            details={[
              { label: 'Used', value: metrics.memory.used },
              { label: 'Available', value: metrics.memory.available },
              { label: 'Total', value: metrics.memory.total }
            ]}
          />

          <ResourceCard
            title="Disk"
            icon={HardDrive}
            value={metrics.disk.percent}
            color="green"
            trend={metrics.disk.trend}
            details={[
              { label: 'Used', value: metrics.disk.used },
              { label: 'Available', value: metrics.disk.available },
              { label: 'Total', value: metrics.disk.total }
            ]}
          />

          <NetworkCard
            interfaces={metrics.network.interfaces}
            active={metrics.network.active}
          />
        </div>

        {/* Temperature */}
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

        {/* Process Information */}
        {metrics.processes.total > 0 && (
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-5 h-5 text-cyan-400" />
              <h4 className="font-medium text-white">Processes</h4>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <ProcessStat label="Total" value={metrics.processes.total} color="blue" />
              <ProcessStat label="Running" value={metrics.processes.running} color="green" />
              <ProcessStat label="Sleeping" value={metrics.processes.sleeping} color="gray" />
              <ProcessStat label="Zombie" value={metrics.processes.zombie} color="red" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

function SystemOverviewCard({ icon: Icon, iconColor, label, value, subtitle, statusIcon: StatusIcon, statusColor }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10"
    >
      <div className="flex items-center justify-between mb-3">
        <Icon className={clsx("w-5 h-5", iconColor)} />
        {StatusIcon && <StatusIcon className={clsx("w-4 h-4", statusColor)} />}
      </div>
      <h4 className="text-sm text-gray-400 mb-1">{label}</h4>
      <p className="text-lg font-mono text-white truncate">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1 truncate">{subtitle}</p>}
    </motion.div>
  );
}

function ResourceCard({ title, icon: Icon, value, color, trend, details }) {
  const colorMap = {
    purple: { 
      bg: 'from-purple-900/20 to-purple-800/10', 
      text: 'text-purple-400', 
      bar: 'bg-purple-500', 
      border: 'border-purple-500/20' 
    },
    blue: { 
      bg: 'from-blue-900/20 to-blue-800/10', 
      text: 'text-blue-400', 
      bar: 'bg-blue-500', 
      border: 'border-blue-500/20' 
    },
    green: { 
      bg: 'from-green-900/20 to-green-800/10', 
      text: 'text-green-400', 
      bar: 'bg-green-500', 
      border: 'border-green-500/20' 
    }
  };

  const colors = colorMap[color] || colorMap.blue;

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-red-400" />;
      case 'down': return <TrendingDown className="w-4 h-4 text-green-400" />;
      default: return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

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
        <div className="flex items-center gap-2">
          {getTrendIcon(trend)}
          <div className="text-2xl font-bold text-white">{value}%</div>
        </div>
      </div>
      
      <div className="h-2 bg-black/30 rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5 }}
          className={`h-full ${colors.bar}`}
        />
      </div>

      <div className="space-y-1">
        {details.map((detail, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-gray-400">{detail.label}</span>
            <span className="text-white truncate ml-2">{detail.value}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function NetworkCard({ interfaces, active }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-gradient-to-br from-cyan-900/20 to-cyan-800/10 backdrop-blur rounded-xl p-4 border border-cyan-500/20"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-cyan-400" />
          <span className="text-sm font-medium text-white">Network</span>
        </div>
        {active ? (
          <CheckCircle className="w-4 h-4 text-green-400" />
        ) : (
          <AlertCircle className="w-4 h-4 text-gray-400" />
        )}
      </div>
      
      <div className="space-y-2">
        {interfaces.length > 0 ? (
          interfaces.map((iface, i) => (
            <div key={i} className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <Wifi className="w-3 h-3 text-cyan-400" />
                <span className="text-gray-400">{iface.name}</span>
              </div>
              <span className="text-white font-mono text-xs">{iface.ip}</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-gray-400">No active interfaces</p>
        )}
      </div>
    </motion.div>
  );
}

function ProcessStat({ label, value, color }) {
  const colorMap = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    gray: 'text-gray-400',
    red: 'text-red-400'
  };

  return (
    <div className="text-center">
      <div className={clsx("text-2xl font-bold", colorMap[color] || 'text-white')}>
        {value}
      </div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}
