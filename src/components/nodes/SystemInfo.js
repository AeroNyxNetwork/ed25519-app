/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: System information display for remote nodes
 * Modification Reason: Complete redesign with real-time monitoring and better UX
 * Main Functionality: Display comprehensive system metrics with auto-refresh
 * Dependencies: useRemoteManagement hook, executeCommand function
 *
 * Main Logical Flow:
 * 1. Load initial system information on mount
 * 2. Parse and structure system metrics
 * 3. Auto-refresh data at configurable intervals
 * 4. Display metrics in organized cards with visual indicators
 *
 * ⚠️ Important Note for Next Developer:
 * - System commands are OS-specific (Linux/Unix)
 * - Memory parsing assumes 'free -h' output format
 * - Disk parsing assumes 'df -h' output format
 * - Network info requires 'ip' or 'ifconfig' commands
 *
 * Last Modified: v2.0.0 - Complete redesign with enhanced metrics
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

export default function SystemInfo({ nodeReference, executeCommand }) {
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

  /**
   * Parse memory output from 'free -h' command
   */
  const parseMemoryInfo = useCallback((output) => {
    try {
      const lines = output.split('\n');
      const memLine = lines.find(l => l.includes('Mem:'));
      
      if (memLine) {
        const parts = memLine.split(/\s+/).filter(Boolean);
        const total = parseFloat(parts[1]) || 0;
        const used = parseFloat(parts[2]) || 0;
        const available = parseFloat(parts[6]) || parseFloat(parts[3]) || 0;
        const percent = total > 0 ? Math.round((used / total) * 100) : 0;
        
        return {
          total: `${total}${parts[1].replace(/[0-9.]/g, '')}`,
          used: `${used}${parts[2].replace(/[0-9.]/g, '')}`,
          available: `${available}${parts[6]?.replace(/[0-9.]/g, '') || parts[3]?.replace(/[0-9.]/g, '') || 'G'}`,
          percent,
          trend: percent > 80 ? 'up' : percent < 50 ? 'down' : 'stable'
        };
      }
    } catch (err) {
      console.error('Failed to parse memory info:', err);
    }
    
    return { total: '0G', used: '0G', available: '0G', percent: 0, trend: 'stable' };
  }, []);

  /**
   * Parse disk output from 'df -h' command
   */
  const parseDiskInfo = useCallback((output) => {
    try {
      const lines = output.split('\n');
      const rootLine = lines.find(l => l.includes('/$') || l.includes('/ '));
      
      if (rootLine) {
        const parts = rootLine.split(/\s+/).filter(Boolean);
        const total = parts[1];
        const used = parts[2];
        const available = parts[3];
        const percent = parseInt(parts[4]) || 0;
        
        return {
          total,
          used,
          available,
          percent,
          trend: percent > 80 ? 'up' : percent < 50 ? 'down' : 'stable'
        };
      }
    } catch (err) {
      console.error('Failed to parse disk info:', err);
    }
    
    return { total: '0G', used: '0G', available: '0G', percent: 0, trend: 'stable' };
  }, []);

  /**
   * Parse CPU info from various commands
   */
  const parseCpuInfo = useCallback((uptimeOutput, cpuInfoOutput) => {
    try {
      // Parse load average from uptime
      const loadMatch = uptimeOutput.match(/load average: ([\d.]+),?\s*([\d.]+),?\s*([\d.]+)/);
      const loadAvg = loadMatch 
        ? [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])]
        : [0, 0, 0];
      
      // Parse CPU cores from /proc/cpuinfo or nproc
      let cores = 1;
      if (cpuInfoOutput) {
        const coreMatches = cpuInfoOutput.match(/processor/gi);
        cores = coreMatches ? coreMatches.length : 1;
      }
      
      // Estimate CPU usage from load average
      const usage = Math.min(100, Math.round((loadAvg[0] / cores) * 100));
      const trend = loadAvg[0] > loadAvg[2] ? 'up' : loadAvg[0] < loadAvg[2] ? 'down' : 'stable';
      
      return {
        usage,
        cores,
        loadAvg,
        trend
      };
    } catch (err) {
      console.error('Failed to parse CPU info:', err);
    }
    
    return { usage: 0, cores: 1, loadAvg: [0, 0, 0], trend: 'stable' };
  }, []);

  /**
   * Parse network info
   */
  const parseNetworkInfo = useCallback((output) => {
    try {
      const interfaces = [];
      const lines = output.split('\n');
      
      lines.forEach(line => {
        // Parse ip addr show output
        if (line.includes('inet ') && !line.includes('127.0.0.1')) {
          const match = line.match(/inet\s+([\d.]+)/);
          if (match) {
            interfaces.push({
              ip: match[1],
              type: line.includes('wlan') ? 'wireless' : 'ethernet'
            });
          }
        }
      });
      
      return {
        interfaces,
        active: interfaces.length > 0
      };
    } catch (err) {
      console.error('Failed to parse network info:', err);
    }
    
    return { interfaces: [], active: false };
  }, []);

  /**
   * Parse process info
   */
  const parseProcessInfo = useCallback((output) => {
    try {
      const lines = output.split('\n');
      let total = 0, running = 0, sleeping = 0, zombie = 0;
      
      lines.forEach(line => {
        if (line.includes('total')) {
          const match = line.match(/(\d+)\s+total/);
          if (match) total = parseInt(match[1]);
        }
        if (line.includes('running')) {
          const match = line.match(/(\d+)\s+running/);
          if (match) running = parseInt(match[1]);
        }
        if (line.includes('sleeping')) {
          const match = line.match(/(\d+)\s+sleeping/);
          if (match) sleeping = parseInt(match[1]);
        }
        if (line.includes('zombie')) {
          const match = line.match(/(\d+)\s+zombie/);
          if (match) zombie = parseInt(match[1]);
        }
      });
      
      return { total, running, sleeping, zombie };
    } catch (err) {
      console.error('Failed to parse process info:', err);
    }
    
    return { total: 0, running: 0, sleeping: 0, zombie: 0 };
  }, []);

  /**
   * Load comprehensive system information
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
      // Execute all commands in parallel for better performance
      const commands = await Promise.allSettled([
        executeCommand('hostname'),
        executeCommand('uptime'),
        executeCommand('free', ['-h']),
        executeCommand('df', ['-h', '/']),
        executeCommand('cat', ['/proc/cpuinfo']),
        executeCommand('uname', ['-r']),
        executeCommand('ip', ['addr', 'show']),
        executeCommand('ps', ['aux']),
        executeCommand('sensors', ['2>/dev/null']) // Temperature sensors if available
      ]);
      
      // Check if aborted
      if (signal.aborted) return;
      
      // Process results
      const [hostname, uptime, memory, disk, cpuInfo, kernel, network, processes, sensors] = commands;
      
      // Parse system info
      const systemInfo = {
        hostname: hostname.status === 'fulfilled' ? hostname.value.stdout?.trim() || 'Unknown' : 'Unknown',
        kernel: kernel.status === 'fulfilled' ? kernel.value.stdout?.trim() || 'Unknown' : 'Unknown',
        uptime: uptime.status === 'fulfilled' ? uptime.value.stdout?.trim() || 'Unknown' : 'Unknown',
        temperature: null
      };
      
      // Parse temperature if available
      if (sensors.status === 'fulfilled' && sensors.value.stdout) {
        const tempMatch = sensors.value.stdout.match(/Core \d+:\s+\+?([\d.]+)°C/);
        if (tempMatch) {
          systemInfo.temperature = parseFloat(tempMatch[1]);
        }
      }
      
      // Parse metrics
      const cpuMetrics = parseCpuInfo(
        uptime.status === 'fulfilled' ? uptime.value.stdout : '',
        cpuInfo.status === 'fulfilled' ? cpuInfo.value.stdout : ''
      );
      
      const memoryMetrics = parseMemoryInfo(
        memory.status === 'fulfilled' ? memory.value.stdout : ''
      );
      
      const diskMetrics = parseDiskInfo(
        disk.status === 'fulfilled' ? disk.value.stdout : ''
      );
      
      const networkMetrics = parseNetworkInfo(
        network.status === 'fulfilled' ? network.value.stdout : ''
      );
      
      const processMetrics = parseProcessInfo(
        processes.status === 'fulfilled' ? processes.value.stdout : ''
      );
      
      // Update state
      setMetrics({
        cpu: cpuMetrics,
        memory: memoryMetrics,
        disk: diskMetrics,
        network: networkMetrics,
        processes: processMetrics,
        system: systemInfo
      });
      
      setInfo({
        hostname: systemInfo.hostname,
        kernel: systemInfo.kernel,
        uptime: systemInfo.uptime,
        rawMemory: memory.status === 'fulfilled' ? memory.value.stdout : '',
        rawDisk: disk.status === 'fulfilled' ? disk.value.stdout : ''
      });
      
      setLastUpdate(new Date());
      
    } catch (err) {
      console.error('Failed to load system info:', err);
      setError(err.message || 'Failed to load system information');
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [executeCommand, parseCpuInfo, parseMemoryInfo, parseDiskInfo, parseNetworkInfo, parseProcessInfo]);

  /**
   * Toggle auto-refresh
   */
  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev);
  }, []);

  /**
   * Effect: Initial load
   */
  useEffect(() => {
    loadSystemInfo();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadSystemInfo]);

  /**
   * Effect: Auto-refresh
   */
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
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
  }, [autoRefresh, refreshInterval, loadSystemInfo]);

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
   * Format uptime to be more readable
   */
  const formatUptime = useCallback((uptimeStr) => {
    if (!uptimeStr || uptimeStr === 'Unknown') return 'Unknown';
    
    // Extract just the uptime part
    const match = uptimeStr.match(/up\s+(.*?),\s+\d+\s+user/);
    if (match) return match[1];
    
    return uptimeStr;
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
            <p className="text-lg font-mono text-white">{formatUptime(metrics.system.uptime)}</p>
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
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-purple-900/20 to-purple-800/10 backdrop-blur rounded-xl p-4 border border-purple-500/20"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-purple-400" />
                <span className="text-sm font-medium text-white">CPU</span>
              </div>
              {getTrendIcon(metrics.cpu.trend)}
            </div>
            
            <div className="mb-3">
              <div className="text-2xl font-bold text-white">{metrics.cpu.usage}%</div>
              <div className="text-xs text-gray-400">
                {metrics.cpu.cores} core{metrics.cpu.cores > 1 ? 's' : ''}
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="text-xs text-gray-400">Load Average</div>
              <div className="flex gap-2 text-xs font-mono">
                {metrics.cpu.loadAvg.map((load, i) => (
                  <span key={i} className={getStatusColor(load * 100 / metrics.cpu.cores)}>
                    {load.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="mt-3 h-1 bg-black/30 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${metrics.cpu.usage}%` }}
                transition={{ duration: 0.5 }}
                className={clsx(
                  "h-full rounded-full",
                  metrics.cpu.usage >= 90 ? "bg-red-500" :
                  metrics.cpu.usage >= 70 ? "bg-yellow-500" :
                  "bg-purple-500"
                )}
              />
            </div>
          </motion.div>

          {/* Memory Usage */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 backdrop-blur rounded-xl p-4 border border-blue-500/20"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-medium text-white">Memory</span>
              </div>
              {getTrendIcon(metrics.memory.trend)}
            </div>
            
            <div className="mb-3">
              <div className="text-2xl font-bold text-white">{metrics.memory.percent}%</div>
              <div className="text-xs text-gray-400">
                {metrics.memory.used} / {metrics.memory.total}
              </div>
            </div>
            
            <div className="text-xs text-gray-400 mb-1">
              Available: {metrics.memory.available}
            </div>
            
            {/* Progress Bar */}
            <div className="mt-3 h-1 bg-black/30 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${metrics.memory.percent}%` }}
                transition={{ duration: 0.5 }}
                className={clsx(
                  "h-full rounded-full",
                  metrics.memory.percent >= 90 ? "bg-red-500" :
                  metrics.memory.percent >= 70 ? "bg-yellow-500" :
                  "bg-blue-500"
                )}
              />
            </div>
          </motion.div>

          {/* Disk Usage */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-green-900/20 to-green-800/10 backdrop-blur rounded-xl p-4 border border-green-500/20"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-green-400" />
                <span className="text-sm font-medium text-white">Disk</span>
              </div>
              {getTrendIcon(metrics.disk.trend)}
            </div>
            
            <div className="mb-3">
              <div className="text-2xl font-bold text-white">{metrics.disk.percent}%</div>
              <div className="text-xs text-gray-400">
                {metrics.disk.used} / {metrics.disk.total}
              </div>
            </div>
            
            <div className="text-xs text-gray-400 mb-1">
              Available: {metrics.disk.available}
            </div>
            
            {/* Progress Bar */}
            <div className="mt-3 h-1 bg-black/30 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${metrics.disk.percent}%` }}
                transition={{ duration: 0.5 }}
                className={clsx(
                  "h-full rounded-full",
                  metrics.disk.percent >= 90 ? "bg-red-500" :
                  metrics.disk.percent >= 70 ? "bg-yellow-500" :
                  "bg-green-500"
                )}
              />
            </div>
          </motion.div>

          {/* Processes */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-orange-900/20 to-orange-800/10 backdrop-blur rounded-xl p-4 border border-orange-500/20"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-orange-400" />
                <span className="text-sm font-medium text-white">Processes</span>
              </div>
              <span className="text-xs text-gray-400">{metrics.processes.total}</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-green-400">Running</span>
                <span className="text-white font-mono">{metrics.processes.running}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-blue-400">Sleeping</span>
                <span className="text-white font-mono">{metrics.processes.sleeping}</span>
              </div>
              {metrics.processes.zombie > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-red-400">Zombie</span>
                  <span className="text-white font-mono">{metrics.processes.zombie}</span>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Network & Additional Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Network Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-cyan-400" />
                <h4 className="font-medium text-white">Network</h4>
              </div>
              {metrics.network.active ? (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Active
                </span>
              ) : (
                <span className="text-xs text-gray-400">Inactive</span>
              )}
            </div>
            
            {metrics.network.interfaces.length > 0 ? (
              <div className="space-y-2">
                {metrics.network.interfaces.map((iface, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-black/30 rounded">
                    <div className="flex items-center gap-2">
                      <Wifi className={clsx(
                        "w-4 h-4",
                        iface.type === 'wireless' ? "text-blue-400" : "text-green-400"
                      )} />
                      <span className="text-xs text-gray-400">
                        {iface.type === 'wireless' ? 'WiFi' : 'Ethernet'}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-white">{iface.ip}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No active network interfaces</p>
            )}
          </motion.div>

          {/* Temperature & Additional Metrics */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10"
          >
            <div className="flex items-center gap-2 mb-4">
              <Gauge className="w-5 h-5 text-yellow-400" />
              <h4 className="font-medium text-white">System Metrics</h4>
            </div>
            
            <div className="space-y-3">
              {metrics.system.temperature !== null && (
                <div className="flex items-center justify-between p-2 bg-black/30 rounded">
                  <div className="flex items-center gap-2">
                    <Thermometer className={clsx(
                      "w-4 h-4",
                      metrics.system.temperature > 80 ? "text-red-400" :
                      metrics.system.temperature > 60 ? "text-yellow-400" :
                      "text-green-400"
                    )} />
                    <span className="text-xs text-gray-400">Temperature</span>
                  </div>
                  <span className="text-sm font-mono text-white">
                    {metrics.system.temperature.toFixed(1)}°C
                  </span>
                </div>
              )}
              
              <div className="flex items-center justify-between p-2 bg-black/30 rounded">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-gray-400">Performance Score</span>
                </div>
                <span className="text-sm font-mono text-white">
                  {Math.max(0, 100 - metrics.cpu.usage - (metrics.memory.percent / 2)).toFixed(0)}
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Raw Output (Collapsible) */}
        {info && (
          <details className="bg-black/30 rounded-xl p-4 border border-white/10">
            <summary className="cursor-pointer text-sm text-gray-400 hover:text-white transition-colors">
              View Raw Output
            </summary>
            <div className="mt-4 space-y-4">
              <div>
                <h5 className="text-xs text-gray-500 mb-2">Memory (free -h)</h5>
                <pre className="text-xs font-mono text-gray-300 bg-black/50 p-2 rounded overflow-x-auto">
                  {info.rawMemory}
                </pre>
              </div>
              <div>
                <h5 className="text-xs text-gray-500 mb-2">Disk (df -h /)</h5>
                <pre className="text-xs font-mono text-gray-300 bg-black/50 p-2 rounded overflow-x-auto">
                  {info.rawDisk}
                </pre>
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
