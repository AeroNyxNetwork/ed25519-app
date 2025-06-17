/**
 * System Monitor WebSocket Service for AeroNyx Platform
 * 
 * Handles system-level monitoring with automatic updates
 * and comprehensive system metrics.
 * 
 * @class SystemMonitorWebSocketService
 * @extends WebSocketService
 * @version 1.0.0
 */

import WebSocketService from './WebSocketService';

export default class SystemMonitorWebSocketService extends WebSocketService {
  constructor(options = {}) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://api.aeronyx.network';
    super(`${wsUrl}/ws/aeronyx/monitor/`, {
      ...options,
      reconnect: true,
      maxReconnectAttempts: Infinity // Always try to reconnect for system monitoring
    });
    
    this.systemMetrics = {
      activeConnections: 0,
      bufferedHeartbeats: 0,
      serverStatus: 'unknown',
      lastUpdate: null
    };
    
    this.metricsHistory = [];
    this.maxHistorySize = 1000;
    
    this._setupEventHandlers();
  }

  /**
   * Setup internal event handlers
   * @private
   */
  _setupEventHandlers() {
    this.on('monitor_update', (data) => {
      this._handleMonitorUpdate(data);
    });
    
    this.on('connected', () => {
      this.log('info', 'System monitor connected');
    });
  }

  /**
   * Handle monitor update
   * @private
   */
  _handleMonitorUpdate(update) {
    this.systemMetrics = {
      ...update.data,
      lastUpdate: new Date(update.data.timestamp)
    };
    
    // Add to history
    this._addToHistory(update.data);
    
    // Emit processed update
    this.emit('system_update', this.systemMetrics);
    
    // Check for anomalies
    this._checkForAnomalies(update.data);
  }

  /**
   * Add metrics to history
   * @private
   */
  _addToHistory(metrics) {
    this.metricsHistory.push({
      ...metrics,
      timestamp: new Date(metrics.timestamp)
    });
    
    // Maintain history size limit
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }
  }

  /**
   * Check for system anomalies
   * @private
   */
  _checkForAnomalies(metrics) {
    const anomalies = [];
    
    // Check server status
    if (metrics.server_status !== 'healthy') {
      anomalies.push({
        type: 'server_unhealthy',
        severity: 'high',
        message: `Server status: ${metrics.server_status}`
      });
    }
    
    // Check buffered heartbeats (potential backlog)
    if (metrics.buffered_heartbeats > 100) {
      anomalies.push({
        type: 'high_heartbeat_buffer',
        severity: 'medium',
        message: `High buffered heartbeats: ${metrics.buffered_heartbeats}`
      });
    }
    
    // Check connection drop
    if (this.metricsHistory.length > 1) {
      const previousMetrics = this.metricsHistory[this.metricsHistory.length - 2];
      const connectionDrop = previousMetrics.active_connections - metrics.active_connections;
      
      if (connectionDrop > 50) {
        anomalies.push({
          type: 'mass_disconnection',
          severity: 'high',
          message: `${connectionDrop} connections dropped`
        });
      }
    }
    
    if (anomalies.length > 0) {
      this.emit('anomalies_detected', anomalies);
    }
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics() {
    return { ...this.systemMetrics };
  }

  /**
   * Get metrics history
   * @param {number} limit - Number of records to return
   */
  getMetricsHistory(limit = 100) {
    const start = Math.max(0, this.metricsHistory.length - limit);
    return this.metricsHistory.slice(start);
  }

  /**
   * Get metrics statistics
   * @param {number} windowMinutes - Time window in minutes
   */
  getMetricsStatistics(windowMinutes = 60) {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    const relevantMetrics = this.metricsHistory.filter(
      m => m.timestamp > windowStart
    );
    
    if (relevantMetrics.length === 0) {
      return null;
    }
    
    const stats = {
      timeWindow: windowMinutes,
      dataPoints: relevantMetrics.length,
      connections: {
        avg: 0,
        min: Infinity,
        max: -Infinity
      },
      heartbeats: {
        avg: 0,
        min: Infinity,
        max: -Infinity
      },
      serverHealthy: 0
    };
    
    relevantMetrics.forEach(metric => {
      // Connections stats
      stats.connections.avg += metric.active_connections;
      stats.connections.min = Math.min(stats.connections.min, metric.active_connections);
      stats.connections.max = Math.max(stats.connections.max, metric.active_connections);
      
      // Heartbeats stats
      stats.heartbeats.avg += metric.buffered_heartbeats;
      stats.heartbeats.min = Math.min(stats.heartbeats.min, metric.buffered_heartbeats);
      stats.heartbeats.max = Math.max(stats.heartbeats.max, metric.buffered_heartbeats);
      
      // Server health
      if (metric.server_status === 'healthy') {
        stats.serverHealthy++;
      }
    });
    
    stats.connections.avg /= relevantMetrics.length;
    stats.heartbeats.avg /= relevantMetrics.length;
    stats.serverHealthyPercentage = (stats.serverHealthy / relevantMetrics.length) * 100;
    
    return stats;
  }

  /**
   * Clear metrics history
   */
  clearHistory() {
    this.metricsHistory = [];
    this.log('info', 'Metrics history cleared');
  }
}
