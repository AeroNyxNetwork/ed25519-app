/**
 * User Monitor WebSocket Service for AeroNyx Platform
 * 
 * File Path: src/lib/websocket/UserMonitorWebSocketService.js
 * 
 * Fixed to follow correct authentication flow
 * 
 * @version 4.0.0
 */

import WebSocketService from './WebSocketService';

export default class UserMonitorWebSocketService extends WebSocketService {
  constructor(walletCredentials, options = {}) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://api.aeronyx.network';
    super(`${wsUrl}/ws/aeronyx/user-monitor/`, {
      ...options,
      heartbeatInterval: 30000 // 30 seconds default for user monitoring
    });
    
    this.walletAddress = walletCredentials.walletAddress;
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
    // Handle initial connection
    this.on('connected', (data) => {
      this.log('info', 'Received connected message from server');
      // Request signature message
      this._requestSignatureMessage();
    });
    
    // Handle signature message response
    this.on('signature_message', (data) => {
      this.log('info', 'Received signature message');
      // Emit for external handling (wallet signing)
      this.emit('signature_message', data);
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
    });
    
    // Handle authentication failure
    this.on('auth_failed', (data) => {
      this.log('error', 'Authentication failed:', data);
      this.authenticated = false;
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
   * @private
   */
  async _requestSignatureMessage() {
    try {
      await this.send({
        type: 'get_message',
        wallet_address: this.walletAddress
      });
    } catch (error) {
      this.log('error', 'Failed to request signature message', error);
      throw error;
    }
  }

  /**
   * Authenticate with signature
   * 
   * @param {Object} authData - Authentication data
   */
  async authenticateWithSignature(authData) {
    try {
      await this.send({
        type: 'auth',
        wallet_address: authData.wallet_address,
        signature: authData.signature,
        message: authData.message,
        wallet_type: authData.wallet_type || 'okx'
      });
    } catch (error) {
      this.log('error', 'Authentication failed', error);
      this.emit('auth_error', error);
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
  _handleError(data) {
    this.log('error', 'WebSocket error received:', data);
    
    // Handle specific error codes
    switch (data.error_code) {
      case 'authentication_required':
        this.authenticated = false;
        this.emit('auth_required', data);
        break;
      
      case 'auth_failed':
        this.authenticated = false;
        this.emit('auth_failed', data);
        break;
      
      case 'rate_limit':
        this.emit('rate_limit_exceeded', data);
        break;
      
      case 'invalid_message_type':
        this.log('error', 'Invalid message type sent to server');
        break;
      
      default:
        this.emit('error_received', data);
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
