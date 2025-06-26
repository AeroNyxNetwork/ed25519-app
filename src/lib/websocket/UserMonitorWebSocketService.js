/**
 * User Monitor WebSocket Service for AeroNyx Platform
 * 
 * File Path: src/lib/websocket/UserMonitorWebSocketService.js
 * 
 * Updated to match new WebSocket API specification
 * 
 * @version 3.0.0
 */

import WebSocketService from './WebSocketService';

export default class UserMonitorWebSocketService extends WebSocketService {
  constructor(walletCredentials, options = {}) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://api.aeronyx.network';
    super(`${wsUrl}/ws/aeronyx/user-monitor/`, {
      ...options,
      heartbeatInterval: 30000 // 30 seconds default for user monitoring
    });
    
    this.walletCredentials = walletCredentials;
    this.nodesData = new Map();
    this.monitoringActive = false;
    this.subscribedNodes = new Set();
    this.lastUpdateSequence = 0;
    this.nodeReferences = [];
    this.sessionToken = null;
    
    this._setupEventHandlers();
  }

  /**
   * Setup internal event handlers
   * @private
   */
  _setupEventHandlers() {
    this.on('connected', (data) => {
      this.log('info', 'User monitor connection established');
      // Don't auto-authenticate here, wait for user action
    });
    
    // Handle signature message response
    this.on('signature_message', (data) => {
      this.log('info', 'Received signature message');
      this.emit('signature_message_received', data);
    });
    
    // Handle successful authentication
    this.on('auth_success', (data) => {
      this.log('info', 'Authentication successful');
      
      // Store session token
      if (data.session_token) {
        this.sessionToken = data.session_token;
      }
      
      // Extract nodes from auth response
      if (data.nodes) {
        this.nodeReferences = data.nodes.map(node => node.code);
        this._initializeNodesData(data.nodes);
      }
      
      this.authenticated = true;
      this.emit('authentication_success', data);
    });
    
    // Handle authentication failure
    this.on('auth_failed', (data) => {
      this.log('error', 'Authentication failed:', data);
      this.authenticated = false;
      this.emit('authentication_error', data);
    });
    
    // Handle status updates
    this.on('status_update', (data) => {
      this._handleStatusUpdate(data);
    });
    
    // Handle errors
    this.on('error', (data) => {
      this._handleError(data);
    });
  }

  /**
   * Request signature message for authentication
   * 
   * @param {string} walletAddress - Wallet address
   */
  async requestSignatureMessage(walletAddress) {
    try {
      await this.send({
        type: 'get_message',
        wallet_address: walletAddress
      });
    } catch (error) {
      this.log('error', 'Failed to request signature message', error);
      throw error;
    }
  }

  /**
   * Authenticate with wallet credentials
   * 
   * @param {Object} credentials - Authentication credentials
   */
  async authenticate(credentials) {
    try {
      await this.send({
        type: 'auth',
        wallet_address: credentials.walletAddress,
        signature: credentials.signature,
        message: credentials.message,
        wallet_type: credentials.walletType || 'okx'
      });
    } catch (error) {
      this.log('error', 'Authentication failed', error);
      this.emit('auth_error', error);
      throw error;
    }
  }

  /**
   * Authenticate with session token
   * 
   * @param {string} token - Session token
   */
  async authenticateWithToken(token) {
    try {
      this.sessionToken = token;
      await this.send({
        session_token: token,
        type: 'start_monitor'
      });
    } catch (error) {
      this.log('error', 'Token authentication failed', error);
      throw error;
    }
  }

  /**
   * Initialize nodes data from auth response
   * @private
   */
  _initializeNodesData(nodes) {
    nodes.forEach(node => {
      this.nodesData.set(node.code, {
        id: node.id,
        code: node.code,
        name: node.name,
        status: 'unknown',
        performance: {
          cpu: 0,
          memory: 0,
          disk: 0,
          network: 0
        },
        last_seen: null,
        lastUpdate: null
      });
    });
    
    // Emit initial nodes data
    this.emit('nodes_initialized', {
      nodes: Array.from(this.nodesData.values()),
      count: this.nodesData.size
    });
  }

  /**
   * Handle status update from server
   * @private
   */
  _handleStatusUpdate(update) {
    if (!update.nodes || !Array.isArray(update.nodes)) {
      this.log('warn', 'Invalid status update format');
      return;
    }
    
    // Update each node's data
    update.nodes.forEach(nodeUpdate => {
      const node = this.nodesData.get(nodeUpdate.code);
      if (node) {
        // Update node data
        Object.assign(node, {
          name: nodeUpdate.name,
          status: nodeUpdate.status,
          performance: nodeUpdate.performance || node.performance,
          last_seen: nodeUpdate.last_seen,
          lastUpdate: new Date()
        });
        
        this.nodesData.set(nodeUpdate.code, node);
      }
    });
    
    // Emit comprehensive update
    this.emit('nodes_updated', {
      nodes: Array.from(this.nodesData.values()),
      timestamp: update.timestamp,
      sequence: ++this.lastUpdateSequence
    });
  }

  /**
   * Handle WebSocket errors
   * @private
   */
  _handleError(error) {
    this.log('error', 'WebSocket error received:', error);
    
    // Handle specific error codes
    switch (error.error_code) {
      case 'authentication_required':
        this.authenticated = false;
        this.emit('auth_required', error);
        break;
      
      case 'auth_failed':
        this.authenticated = false;
        this.emit('auth_failed', error);
        break;
      
      case 'rate_limit':
        this.emit('rate_limit_exceeded', error);
        break;
      
      default:
        this.emit('error_received', error);
    }
  }

  /**
   * Start real-time monitoring
   */
  async startMonitoring() {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }
    
    if (this.monitoringActive) {
      this.log('warn', 'Monitoring already active');
      return;
    }
    
    try {
      await this.send({
        type: 'start_monitor'
      });
      
      this.monitoringActive = true;
      this.emit('monitoring_started', {
        node_count: this.nodesData.size
      });
      
      this.log('info', 'Started monitoring');
    } catch (error) {
      this.log('error', 'Failed to start monitoring', error);
      throw error;
    }
  }

  /**
   * Stop real-time monitoring
   */
  async stopMonitoring() {
    if (!this.monitoringActive) {
      this.log('warn', 'Monitoring not active');
      return;
    }
    
    try {
      await this.send({
        type: 'stop_monitor'
      });
      
      this.monitoringActive = false;
      this.emit('monitoring_stopped');
      
      this.log('info', 'Stopped monitoring');
    } catch (error) {
      this.log('error', 'Failed to stop monitoring', error);
      throw error;
    }
  }

  /**
   * Override authenticate method from base class
   * @private
   */
  async _authenticate() {
    // Use the new authentication flow
    if (this.walletCredentials) {
      await this.authenticate(this.walletCredentials);
    }
  }

  /**
   * Get node by reference code
   * @param {string} code - Node reference code
   */
  getNode(code) {
    return this.nodesData.get(code);
  }

  /**
   * Get all nodes
   */
  getAllNodes() {
    return Array.from(this.nodesData.values());
  }

  /**
   * Get nodes by status
   * @param {string} status - Node status
   */
  getNodesByStatus(status) {
    return this.getAllNodes().filter(node => node.status === status);
  }

  /**
   * Get monitoring state
   */
  getMonitoringState() {
    return {
      active: this.monitoringActive,
      authenticated: this.authenticated,
      nodesCount: this.nodesData.size,
      lastUpdateSequence: this.lastUpdateSequence,
      sessionToken: this.sessionToken
    };
  }

  /**
   * Clear all data (useful for logout)
   */
  clearData() {
    this.nodesData.clear();
    this.nodeReferences = [];
    this.sessionToken = null;
    this.monitoringActive = false;
    this.lastUpdateSequence = 0;
    this.authenticated = false;
  }
}
