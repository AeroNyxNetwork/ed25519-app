/**
 * Real-time Node Monitor Component
 * 
 * Displays real-time monitoring information and performance alerts
 * 
 * @version 1.0.0
 */

import React, { useMemo } from 'react';

export default function RealTimeNodeMonitor({
  nodes,
  performanceAlerts,
  lastUpdate,
  updateSource,
  connectionStatus,
  onClearAlerts
}) {
  
  // Calculate real-time statistics
  const realtimeStats = useMemo(() => {
    const activeNodes = nodes.filter(n => n.isRealtime && (n.status === 'online' || n.status === 'active'));
    const totalHeartbeats = activeNodes.reduce((sum, n) => sum + (n.heartbeatCount || 0), 0);
    const avgCpuUsage = activeNodes.length > 0 
      ? activeNodes.reduce((sum, n) => sum + n.resources.cpu.usage, 0) / activeNodes.length
      : 0;
    const avgMemoryUsage = activeNodes.length > 0
      ? activeNodes.reduce((sum, n) => sum + n.resources.memory.usage, 0) / activeNodes.length
      : 0;
    
    return {
      realtimeNodes: activeNodes.length,
      totalHeartbeats,
      avgCpuUsage: Math.round(avgCpuUsage),
      avgMemoryUsage: Math.round(avgMemoryUsage)
    };
  }, [nodes]);
  
  return (
    <div className="mb-8 space-y-4">
      {/* Real-time Connection Status */}
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
              {lastUpdate && `Updated ${(Date.now() - lastUpdate.getTime()) / 1000 < 60 
                ? 'just now' 
                : `${Math.floor((Date.now() - lastUpdate.getTime()) / 60000)} min ago`
              }`}
            </div>
            
            <div className={`flex items-center gap-2 px-3 py-1 rounded-md bg-${connectionStatus.color}-900/30 border border-${connectionStatus.color}-800`}>
              <div className={`w-2 h-2 rounded-full bg-${connectionStatus.color}-500 animate-pulse`}></div>
              <span className={`text-xs text-${connectionStatus.color}-400`}>
                {connectionStatus.label}
              </span>
            </div>
          </div>
        </div>
        
        {/* Real-time Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">Live Nodes</div>
            <div className="text-xl font-bold text-green-400">{realtimeStats.realtimeNodes}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">Total Heartbeats</div>
            <div className="text-xl font-bold text-blue-400">{realtimeStats.totalHeartbeats}</div>
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
      
      {/* Performance Alerts */}
      {performanceAlerts.length > 0 && (
        <div className="card glass-effect p-4 border-yellow-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Performance Alerts
            </h4>
            
            <button
              onClick={onClearAlerts}
              className="text-xs text-gray-400 hover:text-white"
            >
              Clear All
            </button>
          </div>
          
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {performanceAlerts.map((alert, index) => (
              <div 
                key={`${alert.nodeId}-${alert.timestamp.getTime()}-${index}`}
                className={`text-xs p-2 rounded ${
                  alert.severity === 'critical' 
                    ? 'bg-red-900/30 text-red-400 border border-red-800' 
                    : 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{alert.message}</span>
                  <span className="text-gray-500">
                    {alert.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
