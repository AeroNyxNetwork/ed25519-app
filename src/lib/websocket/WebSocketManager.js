/**
 * WebSocket Manager for AeroNyx Platform
 * 
 * Centralized manager for all WebSocket connections with
 * lifecycle management and unified interface.
 * 
 * @class WebSocketManager
 * @version 1.0.0
 */

import NodeWebSocketService from './NodeWebSocketService';
import UserMonitorWebSocketService from './UserMonitorWebSocketService';
import SystemMonitorWebSocketService from './SystemMonitorWebSocketService';

export default class WebSocketManager {
  constructor() {
    this.services = new Map();
    this.defaultOptions = {
      debug: process.env.NODE_ENV === 'development',
      reconnect: true,
      maxReconnectAttempts: 10
    };
  }

  /**
   * Create or get node WebSocket service
   * @param {string} referenceCode - Node reference code
   * @param {Object} options - Service options
   */
  getNodeService(referenceCode, options = {}) {
    const key = `node:${referenceCode}`;
    
    if (!this.services.has(key)) {
      const service = new NodeWebSocketService(referenceCode, {
        ...this.defaultOptions,
        ...options
      });
      
      this.services.set(key, service);
    }
    
    return this.services.get(key);
  }

  /**
   * Create or get user monitor WebSocket service
   * @param {Object} walletCredentials - Wallet authentication credentials
   * @param {Object} options - Service options
   */
  getUserMonitorService(walletCredentials, options = {}) {
    const key = `userMonitor:${walletCredentials.walletAddress}`;
    
    if (!this.services.has(key)) {
      const service = new UserMonitorWebSocketService(walletCredentials, {
        ...this.defaultOptions,
        ...options
      });
      
      this.services.set(key, service);
    }
    
    return this.services.get(key);
  }

  /**
   * Create or get system monitor WebSocket service
   * @param {Object} options - Service options
   */
  getSystemMonitorService(options = {}) {
    const key = 'systemMonitor';
    
    if (!this.services.has(key)) {
      const service = new SystemMonitorWebSocketService({
        ...this.defaultOptions,
        ...options
      });
      
      this.services.set(key, service);
    }
    
    return this.services.get(key);
  }

  /**
   * Connect all services
   */
  async connectAll() {
    const promises = [];
    
    for (const [key, service] of this.services) {
      promises.push(service.connect());
    }
    
    return Promise.all(promises);
  }

  /**
   * Disconnect all services
   */
  disconnectAll() {
    for (const [key, service] of this.services) {
      service.disconnect();
    }
    
    this.services.clear();
  }

  /**
   * Get service by key
   * @param {string} key - Service key
   */
  getService(key) {
    return this.services.get(key);
  }

  /**
   * Remove service
   * @param {string} key - Service key
   */
  removeService(key) {
    const service = this.services.get(key);
    
    if (service) {
      service.disconnect();
      this.services.delete(key);
    }
  }

  /**
   * Get all active services
   */
  getAllServices() {
    return Array.from(this.services.entries()).map(([key, service]) => ({
      key,
      type: key.split(':')[0],
      state: service.state,
      authenticated: service.authenticated,
      metrics: service.getMetrics()
    }));
  }

  /**
   * Get services by type
   * @param {string} type - Service type (node, userMonitor, systemMonitor)
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
}

// Export singleton instance
export const wsManager = new WebSocketManager();
