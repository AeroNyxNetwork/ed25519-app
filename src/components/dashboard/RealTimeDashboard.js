/**
 * Real-time Node Monitor Component for AeroNyx Platform
 * 
 * File Path: src/components/dashboard/RealTimeNodeMonitor.js
 * 
 * Production-ready component that displays real-time monitoring information
 * and performance alerts with accurate data processing.
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-18
 */

import React, { useMemo } from 'react';

/**
 * Real-time Node Monitor Component
 * 
 * @param {Object} props - Component properties
 * @param {Array} props.nodes - Array of node objects
 * @param {Array} props.performanceAlerts - Array of performance alert objects
 * @param {Date} props.lastUpdate - Last update timestamp
 * @param {string} props.updateSource - Data source ('websocket' or 'rest')
 * @param {Object} props.connectionStatus - Connection status object with color and label
 * @param {Function} props.onClearAlerts - Callback to clear alerts
 */
export default function RealTimeNodeMonitor({
  nodes,
  performanceAlerts,
  lastUpdate,
  updateSource,
  connectionStatus,
  onClearAlerts
}) {
  
  /**
   * Calculate real-time statistics from nodes data
   */
  const realtimeStats = useMemo(() => {
    if (!nodes || nodes.length === 0) {
      return {
        realtimeNodes: 0,
        totalHeartbeats: 0,
        avgCpuUsage: 0,
        avgMemoryUsage: 0
      };
    }

    // Identify real-time active nodes based on exact API criteria
    const activeNodes = nodes.filter(node => {
      // From API: online_nodes = WebSocket connected AND status='active'
      return (node.isRealtime === true) || 
             (node.isConnected === true && node.status === 'active') ||
             (node.connectionStatus === 'online' && node.status === 'active');
    });

    // Calculate total heartbeats from all active nodes
    const totalHeartbeats = activeNodes.reduce((sum, node) => {
      // Handle different field names from REST API vs WebSocket
      const heartbeats = node.heartbeatCount || 
                        node.connection_details?.heartbeat_count || 
                        node.connection?.heartbeat_count || 
                        0;
      return sum + heartbeats;
    }, 0);

    // Calculate average CPU usage from active nodes only
    const avgCpuUsage = activeNodes.length > 0 
      ? activeNodes.reduce((sum, node) => {
          const cpuUsage = node.resources?.cpu?.usage || 
                          node.performance?.cpu_usage || 
                          0;
          return sum + cpuUsage;
        }, 0) / activeNodes.length
      : 0;

    // Calculate average memory usage from active nodes only
    const avgMemoryUsage = activeNodes.length > 0
      ? activeNodes.reduce((sum, node) => {
          const memoryUsage = node.resources?.memory?.usage || 
                             node.performance?.memory_usage || 
                             0;
          return sum + memoryUsage;
        }, 0) / activeNodes.length
      : 0;
    
    return {
      realtimeNodes: activeNodes.length,
      totalHeartbeats,
      avgCpuUsage: Math.round(avgCpuUsage),
      avgMemoryUsage: Math.round(avgMemoryUsage)
    };
  }, [nodes]);

  /**
   * Format last update time relative to now
   */
  const formatLastUpdate = useMemo(() => {
    if (!lastUpdate) return 'Never updated';
    
    const now = new Date();
    const diffSeconds = Math.floor((now - lastUpdate) / 1000);
    
    if (diffSeconds < 10) return 'Updated just now';
    if (diffSeconds < 60) return `Updated ${diffSeconds}s ago`;
    if (diffSeconds < 300) return `Updated ${Math.floor(diffSeconds / 60)}m ago`;
    
    return `Updated ${lastUpdate.toLocaleTimeString()}`;
  }, [lastUpdate]);

  /**
   * Determine if WebSocket monitoring is active
   */
  const isLiveMonitoring = connectionStatus.label === 'Live Monitoring';
  
  return (
    <div className="mb-8 space-y-4">
      {/* Real-time Monitor Status Card */}
      <div className="card glass-effect p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 3.636a1 1 0 010 1.414 7 7 0 000 9.9 1 1 0 11-1.414 1.414 9 9 0 010-12.728 1 1 0 011.414 0zm9.9 0a1 1 0 011.414 0 9 9 0 010 12.728 1 1 0 11-1.414-1.414 7 7 0 000-9.9 1 1 0 010-1.414zM7.879 6.464a1 1 0 010 1.414 3 3 0 000 4.243 1 1 0 11-1.415 1.414 5 5 0 010-7.07 1 1 0 011.415 0zm4.242 0a1 1 0 011.415 0 5 5 0 010 7.072 1 1 0 01-1.415-1.415 3 3 0 000-4.242 1 1 0 010-1.415zM10 9a1 1 0 011 1v.01a1 1 0 11-2 0V10a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Real-time Monitor
          </h3>
          
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-400">
              {formatLastUpdate}
            </div>
            
            {/* Connection Status Indicator */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-md bg-${connectionStatus.color}-900/30 border border-${connectionStatus.color}-800`}>
              <div className={`w-2 h-2 rounded-full bg-${connectionStatus.color}-500 ${
                isLiveMonitoring ? 'animate-pulse' : ''
              }`}></div>
              <span className={`text-xs text-${connectionStatus.color}-400`}>
                {connectionStatus.label}
              </span>
            </div>

            {/* Data Source Indicator */}
            <div className={`text-xs px-2 py-1 rounded ${
              updateSource === 'websocket' 
                ? 'bg-blue-900/30 text-blue-400 border border-blue-800' 
                : 'bg-gray-900/30 text-gray-400 border border-gray-800'
            }`}>
              {updateSource === 'websocket' ? '🔄 WebSocket' : '📡 REST API'}
            </div>
          </div>
        </div>
        
        {/* Real-time Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">Live Nodes</div>
            <div className="text-xl font-bold text-green-400">{realtimeStats.realtimeNodes}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">Total Heartbeats</div>
            <div className="text-xl font-bold text-blue-400">{realtimeStats.totalHeartbeats.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">Avg CPU</div>
            <div className="text-xl font-bold text-purple-400">{realtimeStats.avgCpuUsage}%</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">Avg Memory</div>
            <div className="text-xl font-bold text-orange-400">{realtimeStats.avgMemoryUsage}%</div>
          </div>
        </div>
      </div>
      
      {/* Performance Alerts Section */}
      {performanceAlerts && performanceAlerts.length > 0 && (
        <div className="card glass-effect p-4 border-yellow-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Performance Alerts ({performanceAlerts.length})
            </h4>
            
            {onClearAlerts && (
              <button
                onClick={onClearAlerts}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
          
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {performanceAlerts.map((alert, index) => (
              <div 
                key={`${alert.nodeId}-${alert.timestamp?.getTime()}-${index}`}
                className={`text-xs p-2 rounded ${
                  alert.severity === 'critical' 
                    ? 'bg-red-900/30 text-red-400 border border-red-800' 
                    : 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{alert.message}</span>
                  <span className="text-gray-500">
                    {alert.timestamp ? alert.timestamp.toLocaleTimeString() : 'Now'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Live Nodes Information */}
      {realtimeStats.realtimeNodes === 0 && nodes && nodes.length > 0 && (
        <div className="card glass-effect p-4 border-blue-800/50">
          <div className="flex items-center gap-2 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <h4 className="font-bold text-blue-400">No Live Nodes Detected</h4>
          </div>
          <p className="text-sm text-gray-300">
            {nodes.length} node(s) found, but none are currently sending real-time heartbeats. 
            {updateSource === 'websocket' 
              ? ' WebSocket monitoring is active but no nodes are connected.' 
              : ' Enable WebSocket monitoring to see live data.'
            }
          </p>
          
          {/* Node status breakdown */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="text-center">
              <div className="text-gray-400">Active Nodes</div>
              <div className="text-blue-400 font-bold">
                {nodes.filter(n => n.status === 'active').length}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Connected</div>
              <div className="text-green-400 font-bold">
                {nodes.filter(n => n.isConnected).length}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Offline</div>
              <div className="text-red-400 font-bold">
                {nodes.filter(n => n.status === 'offline').length}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Pending</div>
              <div className="text-yellow-400 font-bold">
                {nodes.filter(n => n.status === 'pending').length}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Health Overview */}
      {realtimeStats.realtimeNodes > 0 && (
        <div className="card glass-effect p-4 bg-green-900/10 border border-green-800/50">
          <div className="flex items-center gap-2 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <h4 className="font-bold text-green-400">System Health: Good</h4>
          </div>
          <p className="text-sm text-gray-300">
            {realtimeStats.realtimeNodes} node(s) actively reporting metrics. 
            Average resource utilization is within normal ranges.
          </p>
          
          {/* Resource utilization status */}
          <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">CPU Load:</span>
              <span className={`font-bold ${
                realtimeStats.avgCpuUsage > 80 ? 'text-red-400' :
                realtimeStats.avgCpuUsage > 60 ? 'text-yellow-400' :
                'text-green-400'
              }`}>
                {realtimeStats.avgCpuUsage}% {
                  realtimeStats.avgCpuUsage > 80 ? '(High)' :
                  realtimeStats.avgCpuUsage > 60 ? '(Moderate)' :
                  '(Normal)'
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Memory Load:</span>
              <span className={`font-bold ${
                realtimeStats.avgMemoryUsage > 80 ? 'text-red-400' :
                realtimeStats.avgMemoryUsage > 60 ? 'text-yellow-400' :
                'text-green-400'
              }`}>
                {realtimeStats.avgMemoryUsage}% {
                  realtimeStats.avgMemoryUsage > 80 ? '(High)' :
                  realtimeStats.avgMemoryUsage > 60 ? '(Moderate)' :
                  '(Normal)'
                }
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
