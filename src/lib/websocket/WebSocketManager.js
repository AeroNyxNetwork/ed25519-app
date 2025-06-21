/**
 * WebSocket Manager for AeroNyx Platform
 * 
 * File Path: src/lib/websocket/WebSocketManager.js
 * 
 * Centralized manager for WebSocket connections with
 * optimized lifecycle management
 * 
 * @version 3.0.0
 * @author AeroNyx Development Team
 */

import NodeWebSocketService from './NodeWebSocketService';
import UserMonitorWebSocketService from './UserMonitorWebSocketService';

/**
 * Service types enum
 * @enum {string}
 */
export const ServiceType = {
  NODE: 'node',
  USER_MONITOR: 'userMonitor'
};

/**
 * Connection states enum
 * @enum {string}
 */
export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATED: 'authenticated',
  ERROR: 'error'
};

/**
 * WebSocket Manager Class
 * Implements singleton pattern for centralized connection management
 */
class WebSocketManager {
  constructor() {
    this.services = new Map();
    this.defaultOptions = {
      debug: process.env.NODE_ENV === 'development',
      reconnect: true,
      maxReconnectAttempts: 10,
      reconnectInterval: 1000,
      maxReconnectInterval: 30000,
      heartbeatInterval: 30000
    };
    
    // Performance metrics
    this.metrics = {
      connectionsCreated: 0,
      connectionsDestroyed: 0,
      messagesProcessed: 0,
      errors: 0,
      startTime: Date.now()
    };
  }

  /**
   * Get or create node WebSocket service
   * 
   * @param {string} referenceCode - Node reference code
   * @param {Object} options - Service options
   * @returns {NodeWebSocketService} WebSocket service instance
   */
  getNodeService(referenceCode, options = {}) {
    const key = `${ServiceType.NODE}:${referenceCode}`;
    
    let service = this.services.get(key);
    if (!service) {
      service = new NodeWebSocketService(referenceCode, {
        ...this.defaultOptions,
        ...options
      });
      
      this._setupServiceHandlers(service, key);
      this.services.set(key, service);
      this.metrics.connectionsCreated++;
    }
    
    return service;
  }

  /**
   * Get or create user monitor WebSocket service
   * 
   * @param {Object} walletCredentials - Wallet authentication credentials
   * @param {Object} options - Service options
   * @returns {UserMonitorWebSocketService} WebSocket service instance
   */
  getUserMonitorService(walletCredentials, options = {}) {
    const key = `${ServiceType.USER_MONITOR}:${walletCredentials.walletAddress}`;
    
    let service = this.services.get(key);
    if (!service) {
      service = new UserMonitorWebSocketService(walletCredentials, {
        ...this.defaultOptions,
        ...options
      });
      
      this._setupServiceHandlers(service, key);
      this.services.set(key, service);
      this.metrics.connectionsCreated++;
    }
    
    return service;
  }

  /**
   * Setup common event handlers for a service
   * 
   * @private
   * @param {WebSocketService} service - Service instance
   * @param {string} key - Service key
   */
  _setupServiceHandlers(service, key) {
    // Track messages
    service.on('message', () => {
      this.metrics.messagesProcessed++;
    });
    
    // Track errors
    service.on('error', () => {
      this.metrics.errors++;
    });
    
    // Auto-cleanup on permanent disconnect
    service.on('disconnected', (event) => {
      if (event.code === 1006 || !service.options.reconnect) {
        this.removeService(key);
      }
    });
  }

  /**
   * Remove service and cleanup
   * 
   * @param {string} key - Service key
   */
  removeService(key) {
    const service = this.services.get(key);
    
    if (service) {
      service.disconnect();
      this.services.delete(key);
      this.metrics.connectionsDestroyed++;
    }
  }

  /**
   * Get service by key
   * 
   * @param {string} key - Service key
   * @returns {WebSocketService|null} Service instance or null
   */
  getService(key) {
    return this.services.get(key) || null;
  }

  /**
   * Connect all services
   * 
   * @returns {Promise<void[]>} Connection promises
   */
  async connectAll() {
    const promises = [];
    
    for (const [, service] of this.services) {
      if (service.state === 'CLOSED') {
        promises.push(service.connect());
      }
    }
    
    return Promise.all(promises);
  }

  /**
   * Disconnect all services
   */
  disconnectAll() {
    for (const [, service] of this.services) {
      service.disconnect();
    }
    
    this.services.clear();
  }

  /**
   * Get all active services info
   * 
   * @returns {Array<Object>} Service information array
   */
  getAllServices() {
    const services = [];
    
    for (const [key, service] of this.services) {
      const [type, identifier] = key.split(':');
      
      services.push({
        key,
        type,
        identifier,
        state: service.state,
        authenticated: service.authenticated,
        metrics: service.getMetrics()
      });
    }
    
    return services;
  }

  /**
   * Get services by type
   * 
   * @param {string} type - Service type
   * @returns {Array<Object>} Services of specified type
   */
  getServicesByType(type) {
    const services = [];
    
    for (const [key, service] of this.services) {
      if (key.startsWith(`${type}:`)) {
        services.push({ key, service });
      }
    }
    
    return services;
  }

  /**
   * Get manager statistics
   * 
   * @returns {Object} Manager statistics
   */
  getStatistics() {
    const uptime = Math.floor((Date.now() - this.metrics.startTime) / 1000);
    
    return {
      ...this.metrics,
      uptime,
      activeConnections: this.services.size,
      serviceBreakdown: {
        nodes: this.getServicesByType(ServiceType.NODE).length,
        userMonitors: this.getServicesByType(ServiceType.USER_MONITOR).length
      }
    };
  }

  /**
   * Health check for all services
   * 
   * @returns {Object} Health status
   */
  healthCheck() {
    let healthy = 0;
    let unhealthy = 0;
    const issues = [];
    
    for (const [key, service] of this.services) {
      if (service.state === 'OPEN' && service.authenticated) {
        healthy++;
      } else {
        unhealthy++;
        issues.push({
          key,
          state: service.state,
          authenticated: service.authenticated
        });
      }
    }
    
    return {
      status: unhealthy === 0 ? 'healthy' : 'degraded',
      healthy,
      unhealthy,
      total: this.services.size,
      issues
    };
  }
}

// Export singleton instance
export const wsManager = new WebSocketManager();

// Export class for testing
export default WebSocketManager;
