/**
 * User Monitor WebSocket Service for AeroNyx Platform
 * 
 * File Path: src/lib/websocket/UserMonitorWebSocketService.js
 * 
 * Production implementation matching backend consumers.py
 * 
 * @version 7.0.0
 * @author AeroNyx Development Team
 */

import WebSocketService from './WebSocketService';

export default class UserMonitorWebSocketService extends WebSocketService {
  constructor(walletCredentials, options = {}) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://api.aeronyx.network';
    super(`${wsUrl}/ws/aeronyx/user-monitor/`, {
      ...options,
      heartbeatInterval: 30000,
      debug: true
    });
    
    this.walletAddress = walletCredentials.walletAddress;
    this.sessionToken = null;
    this.nodes = [];
    this.monitoringActive = false;
    
    this._setupEventHandlers();
  }

  /**
   * Setup event handlers matching backend message types
   * @private
   */
  _setupEventHandlers() {
    // Connection established
    this.on('connected', (data) => {
      this.log('info', 'Connected to WebSocket:', data.message);
      // Backend expects us to request signature message
      this._requestSignatureMessage();
    });
    
    // Signature message received
    this.on('signature_message', (data) => {
      this.log('info', 'Received signature message');
      // Emit for provider to handle signing
      this.emit('signature_message', {
        message: data.message,
        nonce: data.nonce,
        expires_in: data.expires_in
      });
    });
    
    // Authentication success
    this.on('auth_success', (data) => {
      this.log('info', 'Authentication successful');
      this.authenticated = true;
      this.sessionToken = data.session_token;
      this.walletAddress = data.wallet_address;
      
      // Store nodes from auth response
      if (data.nodes) {
        this.nodes = data.nodes;
      }
      
      // Auto-start monitoring
      setTimeout(() => {
        this.startMonitoring();
      }, 100);
    });
    
    // Monitor started
    this.on('monitor_started', (data) => {
      this.log('info', 'Monitoring started with interval:', data.interval);
      this.monitoringActive = true;
    });
    
    // Status updates
    this.on('status_update', (data) => {
      this.log('info', 'Status update received');
      this._handleStatusUpdate(data);
    });
    
    // Monitor stopped
    this.on('monitor_stopped', () => {
      this.log('info', 'Monitoring stopped');
      this.monitoringActive = false;
    });
    
    // Errors
    this.on('error', (data) => {
      this.log('error', 'Server error:', data.message);
      this.emit('error_received', data);
    });
  }

  /**
   * Request signature message
   * @private
   */
  async _requestSignatureMessage() {
    try {
      await this.send({
        type: 'get_message',
        wallet_address: this.walletAddress
      });
      this.log('info', 'Signature message requested');
    } catch (error) {
      this.log('error', 'Failed to request signature message:', error);
    }
  }

  /**
   * Authenticate with signature
   * @param {Object} authData - Authentication data
   */
  async authenticateWithSignature(authData) {
    try {
      await this.send({
        type: 'auth',
        wallet_address: authData.wallet_address.toLowerCase(),
        signature: authData.signature,
        message: authData.message,
        wallet_type: authData.wallet_type || 'okx'
      });
      
      this.log('info', 'Authentication request sent');
    } catch (error) {
      this.log('error', 'Failed to send authentication', error);
      throw error;
    }
  }

  /**
   * Start monitoring
   */
  async startMonitoring() {
    if (!this.authenticated) {
      this.log('warn', 'Cannot start monitoring: not authenticated');
      return;
    }
    
    if (this.monitoringActive) {
      this.log('info', 'Monitoring already active');
      return;
    }
    
    try {
      await this.send({ type: 'start_monitor' });
      this.log('info', 'Start monitor request sent');
    } catch (error) {
      this.log('error', 'Failed to start monitoring', error);
    }
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring() {
    if (!this.monitoringActive) {
      return;
    }
    
    try {
      await this.send({ type: 'stop_monitor' });
      this.log('info', 'Stop monitor request sent');
    } catch (error) {
      this.log('error', 'Failed to stop monitoring', error);
    }
  }

  /**
   * Handle status update from backend
   * @private
   */
  _handleStatusUpdate(data) {
    if (!data.nodes || !Array.isArray(data.nodes)) {
      this.log('warn', 'Invalid status update data');
      return;
    }
    
    // Transform backend format to frontend format
    const transformedNodes = data.nodes.map(node => ({
      id: node.id,
      reference_code: node.code,
      name: node.name,
      status: node.status,
      type: node.type || 'general',
      node_type: { id: node.type || 'general', name: node.type || 'General' },
      performance: {
        cpu_usage: node.performance?.cpu || 0,
        memory_usage: node.performance?.memory || 0,
        storage_usage: node.performance?.disk || 0,
        bandwidth_usage: node.performance?.network || 0
      },
      last_seen: node.last_seen,
      isConnected: node.status === 'active',
      connectionStatus: node.status === 'active' ? 'online' : 'offline'
    }));
    
    // Emit nodes update
    this.emit('nodes_updated', {
      nodes: transformedNodes,
      timestamp: data.timestamp || Date.now()
    });
  }

  /**
   * Reconnect with session token
   * @param {string} token - Session token
   */
  async reconnectWithSession(token) {
    if (!token) return false;
    
    try {
      await this.send({
        type: 'ping',
        session_token: token
      });
      
      this.sessionToken = token;
      this.authenticated = true;
      
      // Restart monitoring
      await this.startMonitoring();
      
      return true;
    } catch (error) {
      this.log('error', 'Failed to reconnect with session', error);
      return false;
    }
  }

  /**
   * Get all nodes
   */
  getAllNodes() {
    return this.nodes;
  }

  /**
   * Get monitoring state
   */
  getMonitoringState() {
    return {
      active: this.monitoringActive,
      authenticated: this.authenticated,
      sessionToken: this.sessionToken,
      nodesCount: this.nodes.length
    };
  }
}
