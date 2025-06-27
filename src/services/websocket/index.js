/**
 * WebSocket Service Layer for AeroNyx Platform
 * 
 * File Path: src/services/websocket/index.js
 * 
 * Unified WebSocket service layer for use across all pages
 * 
 * @version 1.0.0
 */

import { EventEmitter } from 'events';

/**
 * WebSocket connection status enumeration
 */
export const ConnectionStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  MONITORING: 'monitoring',
  ERROR: 'error'
};

/**
 * Base WebSocket service class
 * Provides common functionality for all WebSocket connections
 */
class BaseWebSocketService extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.ws = null;
    this.status = ConnectionStatus.DISCONNECTED;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.heartbeatInterval = null;
  }

  /**
   * Establishes WebSocket connection
   * @returns {Promise} Resolves when connection is established
   */
  connect() {
    if (this.status !== ConnectionStatus.DISCONNECTED) {
      console.warn('[WebSocket] Already connected or connecting');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.status = ConnectionStatus.CONNECTING;
      this.emit('statusChange', this.status);

      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          this.status = ConnectionStatus.CONNECTED;
          this.reconnectAttempts = 0;
          this.emit('connected');
          this.emit('statusChange', this.status);
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (error) => {
          this.emit('error', error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.handleClose(event);
        };

      } catch (error) {
        this.status = ConnectionStatus.ERROR;
        this.emit('statusChange', this.status);
        reject(error);
      }
    });
  }

  /**
   * Closes WebSocket connection and cleans up resources
   */
  disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    if (this.ws) {
      this.ws.close(1000, 'User disconnect');
    }
    
    this.status = ConnectionStatus.DISCONNECTED;
    this.emit('statusChange', this.status);
  }

  /**
   * Sends data through WebSocket connection
   * @param {Object} data - Data to send
   * @returns {boolean} True if message was sent successfully
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  /**
   * Handles incoming WebSocket messages
   * @param {MessageEvent} event - WebSocket message event
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      this.emit('message', data);
      
      // Handle common message types
      if (data.type) {
        this.emit(data.type, data);
      }
    } catch (error) {
      console.error('[WebSocket] Parse error:', error);
    }
  }

  /**
   * Handles WebSocket connection close event
   * @param {CloseEvent} event - WebSocket close event
   */
  handleClose(event) {
    this.status = ConnectionStatus.DISCONNECTED;
    this.emit('disconnected', event);
    this.emit('statusChange', this.status);
    
    // Auto-reconnect logic
    if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedules automatic reconnection with exponential backoff
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }
}

/**
 * User monitoring WebSocket service
 * Handles real-time node monitoring for authenticated users
 */
export class UserMonitorWebSocketService extends BaseWebSocketService {
  constructor(walletAddress) {
    super('wss://api.aeronyx.network/ws/aeronyx/user-monitor/');
    this.walletAddress = walletAddress;
    this.sessionToken = null;
    this.nodes = new Map();
  }

  /**
   * Authenticates user with wallet signature
   * @param {string} signature - Wallet signature
   * @param {string} message - Message that was signed
   * @param {string} walletType - Type of wallet (default: 'metamask')
   * @returns {Promise} Resolves with authentication data
   */
  async authenticate(signature, message, walletType = 'metamask') {
    // Wait for connection to be established
    if (this.status !== ConnectionStatus.CONNECTED) {
      throw new Error('WebSocket not connected');
    }

    // Request signature message
    this.send({
      type: 'get_message',
      wallet_address: this.walletAddress.toLowerCase()
    });

    // Wait for signature message
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 30000);

      const handleSignatureMessage = (data) => {
        clearTimeout(timeout);
        this.off('signature_message', handleSignatureMessage);
        
        // Send authentication
        this.status = ConnectionStatus.AUTHENTICATING;
        this.emit('statusChange', this.status);
        
        this.send({
          type: 'auth',
          wallet_address: this.walletAddress.toLowerCase(),
          signature: signature,
          message: data.message,
          wallet_type: walletType
        });
      };

      const handleAuthSuccess = (data) => {
        this.off('auth_success', handleAuthSuccess);
        this.off('error', handleAuthError);
        
        this.sessionToken = data.session_token;
        this.status = ConnectionStatus.AUTHENTICATED;
        this.emit('statusChange', this.status);
        
        // Initialize node data
        if (data.nodes) {
          data.nodes.forEach(node => {
            this.nodes.set(node.code, node);
          });
        }
        
        resolve(data);
      };

      const handleAuthError = (data) => {
        clearTimeout(timeout);
        this.off('auth_success', handleAuthSuccess);
        this.off('error', handleAuthError);
        
        this.status = ConnectionStatus.ERROR;
        this.emit('statusChange', this.status);
        reject(new Error(data.message || 'Authentication failed'));
      };

      this.once('signature_message', handleSignatureMessage);
      this.once('auth_success', handleAuthSuccess);
      this.once('error', handleAuthError);
    });
  }

  /**
   * Starts real-time node monitoring
   * @throws {Error} If not authenticated
   */
  startMonitoring() {
    if (this.status !== ConnectionStatus.AUTHENTICATED) {
      throw new Error('Not authenticated');
    }

    this.send({ type: 'start_monitor' });
    
    // Listen for status updates
    this.on('status_update', (data) => {
      if (data.nodes) {
        data.nodes.forEach(node => {
          this.nodes.set(node.code, node);
        });
        this.emit('nodesUpdated', Array.from(this.nodes.values()));
      }
    });

    this.on('monitor_started', () => {
      this.status = ConnectionStatus.MONITORING;
      this.emit('statusChange', this.status);
    });
  }

  /**
   * Stops real-time node monitoring
   */
  stopMonitoring() {
    this.send({ type: 'stop_monitor' });
  }

  /**
   * Gets all cached nodes
   * @returns {Array} Array of node objects
   */
  getNodes() {
    return Array.from(this.nodes.values());
  }

  /**
   * Gets a specific node by code
   * @param {string} code - Node code
   * @returns {Object|undefined} Node object or undefined if not found
   */
  getNode(code) {
    return this.nodes.get(code);
  }
}

/**
 * WebSocket service manager (Singleton)
 * Manages multiple WebSocket service instances
 */
class WebSocketManager {
  constructor() {
    this.services = new Map();
  }

  /**
   * Gets or creates a user monitoring service instance
   * @param {string} walletAddress - User's wallet address
   * @returns {UserMonitorWebSocketService} Service instance
   */
  getUserMonitorService(walletAddress) {
    const key = `user-monitor-${walletAddress}`;
    
    if (!this.services.has(key)) {
      const service = new UserMonitorWebSocketService(walletAddress);
      this.services.set(key, service);
    }
    
    return this.services.get(key);
  }

  /**
   * Disconnects all active services and clears the registry
   */
  disconnectAll() {
    this.services.forEach(service => {
      service.disconnect();
    });
    this.services.clear();
  }
}

// Export singleton instance
export const wsManager = new WebSocketManager();
