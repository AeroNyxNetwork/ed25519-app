/**
 * User Monitor WebSocket Service for AeroNyx Platform
 * 
 * File Path: src/lib/websocket/UserMonitorWebSocketService.js
 * 
 * Production-ready implementation with proper authentication flow.
 * 
 * @version 5.0.0
 * @author AeroNyx Development Team
 */

import WebSocketService from './WebSocketService';

export default class UserMonitorWebSocketService extends WebSocketService {
  constructor(walletCredentials, options = {}) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://api.aeronyx.network';
    super(`${wsUrl}/ws/aeronyx/user-monitor/`, {
      ...options,
      heartbeatInterval: 30000
    });
    
    this.walletAddress = walletCredentials.walletAddress;
    this.nodesData = new Map();
    this.monitoringActive = false;
    this.nodeReferences = [];
    
    this._setupEventHandlers();
  }

  /**
   * Setup internal event handlers
   * @private
   */
  _setupEventHandlers() {
    // Connection established - server will send signature_message next
    this.on('connected', (data) => {
      this.log('info', 'Connected to user monitor WebSocket');
      this.connectionId = data.connection_id;
    });
    
    // Handle signature message from server
    this.on('signature_message', (data) => {
      this.log('info', 'Received signature message for authentication');
      // Don't handle here - let the provider handle signing
      this.emit('signature_message', data);
    });
    
    // Handle successful authentication
    this.on('auth_success', (data) => {
      this.log('info', 'Authentication successful');
      this.authenticated = true;
      
      // Process initial nodes data
      if (data.nodes_summary && data.nodes_summary.nodes) {
        this.nodeReferences = data.nodes_summary.nodes.map(node => node.code);
        this._initializeNodesData(data.nodes_summary.nodes);
      }
      
      // Auto-start monitoring after auth
      setTimeout(() => {
        this.startMonitoring().catch(err => {
          this.log('error', 'Failed to start monitoring:', err);
        });
      }, 100);
    });
    
    // Handle authentication failure
    this.on('auth_failed', (data) => {
      this.log('error', 'Authentication failed:', data.message);
      this.authenticated = false;
    });
    
    // Handle monitoring started
    this.on('monitor_started', (data) => {
      this.log('info', 'Monitoring started');
      this.monitoringActive = true;
      this.emit('monitoring_started', data);
    });
    
    // Handle status updates - main data event
    this.on('status_update', (data) => {
      this.log('info', 'Received status update');
      this._handleStatusUpdate(data);
    });
    
    // Handle errors
    this.on('error', (data) => {
      this.log('error', 'Server error:', data);
      this.emit('error_received', data);
    });
  }

  /**
   * Authenticate with signature
   */
  async authenticateWithSignature(authData) {
    if (!authData.wallet_address || !authData.signature || !authData.message) {
      throw new Error('Missing authentication parameters');
    }
    
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
   * Initialize nodes data from auth response
   * @private
   */
  _initializeNodesData(nodes) {
    if (!Array.isArray(nodes)) return;
    
    this.nodesData.clear();
    
    nodes.forEach(node => {
      if (!node || !node.code) return;
      
      this.nodesData.set(node.code, {
        reference_code: node.code,
        name: node.name || 'Unknown Node',
        status: 'unknown',
        type: 'unknown',
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
    if (!update || !update.nodes || !Array.isArray(update.nodes)) {
      this.log('warn', 'Invalid status update format');
      return;
    }
    
    // Update nodes data
    update.nodes.forEach(nodeUpdate => {
      if (!nodeUpdate || !nodeUpdate.code) return;
      
      const existingNode = this.nodesData.get(nodeUpdate.code) || {};
      
      this.nodesData.set(nodeUpdate.code, {
        ...existingNode,
        reference_code: nodeUpdate.code,
        name: nodeUpdate.name || existingNode.name,
        status: nodeUpdate.status,
        type: nodeUpdate.type || existingNode.type,
        performance: nodeUpdate.performance || existingNode.performance,
        last_seen: nodeUpdate.last_seen,
        lastUpdate: new Date()
      });
    });
    
    // Emit update event
    this.emit('nodes_updated', {
      nodes: Array.from(this.nodesData.values()),
      timestamp: update.timestamp || Date.now()
    });
    
    // Also emit as status_update for compatibility
    this.emit('status_update', update);
  }

  /**
   * Start real-time monitoring
   */
  async startMonitoring() {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }
    
    if (this.monitoringActive) {
      this.log('info', 'Monitoring already active');
      return;
    }
    
    try {
      await this.send({
        type: 'start_monitor'
      });
      
      this.log('info', 'Start monitoring request sent');
    } catch (error) {
      this.log('error', 'Failed to start monitoring', error);
      throw error;
    }
  }

  /**
   * Stop real-time monitoring
   */
  async stopMonitoring() {
    if (!this.monitoringActive) return;
    
    try {
      await this.send({
        type: 'stop_monitor'
      });
      
      this.monitoringActive = false;
      this.log('info', 'Monitoring stopped');
    } catch (error) {
      this.log('error', 'Failed to stop monitoring', error);
      throw error;
    }
  }

  /**
   * Get all nodes
   */
  getAllNodes() {
    return Array.from(this.nodesData.values());
  }

  /**
   * Clear all data
   */
  clearData() {
    this.nodesData.clear();
    this.nodeReferences = [];
    this.monitoringActive = false;
    this.authenticated = false;
  }
}
