/**
 * User Monitor WebSocket Service for AeroNyx Platform
 * 
 * File Path: src/lib/websocket/UserMonitorWebSocketService.js
 * 
 * Fixed version following exact API documentation format
 * 
 * @version 2.0.0
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
    
    this._setupEventHandlers();
  }

  /**
   * Setup internal event handlers
   * @private
   */
  _setupEventHandlers() {
    this.on('connection_established', (data) => {
      this.log('info', 'User monitor connection established');
      this._authenticate();
    });
    
    // Handle successful authentication
    this.on('auth_success', (data) => {
      this.log('info', 'Authentication successful');
      
      // Extract node references from auth response
      if (data.nodes_summary && data.nodes_summary.node_references) {
        this.nodeReferences = data.nodes_summary.node_references;
        this._initializeNodesData(data.nodes_summary);
        
        // Subscribe to all nodes after authentication
        this._subscribeToAllNodes();
      }
    });
    
    // Handle authentication failure
    this.on('auth_failed', (data) => {
      this.log('error', 'Authentication failed:', data);
      this.authenticated = false;
      this.emit('authentication_error', data);
    });
    
    // Handle node status updates
    this.on('node_status_update', (data) => {
      this._handleNodeStatusUpdate(data);
    });
    
    // Handle real-time updates
    this.on('real_time_update', (data) => {
      this._handleRealtimeUpdate(data);
    });
    
    // Handle earnings updates
    this.on('earnings_update', (data) => {
      this._handleEarningsUpdate(data);
    });
    
    // Handle node alerts
    this.on('node_alert', (data) => {
      this._handleNodeAlert(data);
    });
    
    // Handle errors
    this.on('error', (data) => {
      this._handleError(data);
    });
  }

  /**
   * Authenticate with wallet credentials
   * @private
   */
  async _authenticate() {
    try {
      // Use correct message format according to API docs
      await this.send({
        type: 'auth',
        wallet_address: this.walletCredentials.walletAddress,
        signature: this.walletCredentials.signature,
        message: this.walletCredentials.message,
        wallet_type: this.walletCredentials.walletType || 'okx'
      });
    } catch (error) {
      this.log('error', 'Authentication failed', error);
      this.emit('auth_error', error);
    }
  }

  /**
   * Subscribe to all user nodes
   * @private
   */
  async _subscribeToAllNodes() {
    if (!this.nodeReferences || this.nodeReferences.length === 0) {
      this.log('warn', 'No nodes to subscribe to');
      return;
    }
    
    try {
      await this.send({
        type: 'subscribe_nodes',
        data: {
          node_references: this.nodeReferences
        }
      });
      
      this.monitoringActive = true;
      this.emit('monitoring_started', {
        node_count: this.nodeReferences.length,
        nodes: this.nodeReferences
      });
      
      this.log('info', `Subscribed to ${this.nodeReferences.length} nodes`);
    } catch (error) {
      this.log('error', 'Failed to subscribe to nodes', error);
    }
  }

  /**
   * Initialize nodes data from auth response
   * @private
   */
  _initializeNodesData(nodesSummary) {
    // Initialize with basic data from auth response
    if (nodesSummary.node_references) {
      nodesSummary.node_references.forEach(ref => {
        this.nodesData.set(ref, {
          reference_code: ref,
          status: 'unknown',
          is_connected: false,
          lastUpdate: null
        });
      });
    }
    
    // Emit initial summary
    this.emit('nodes_summary', {
      total_nodes: nodesSummary.total_nodes || 0,
      active_nodes: nodesSummary.active_nodes || 0,
      offline_nodes: nodesSummary.offline_nodes || 0,
      pending_nodes: nodesSummary.pending_nodes || 0,
      node_references: nodesSummary.node_references || []
    });
  }

  /**
   * Handle node status update
   * @private
   */
  _handleNodeStatusUpdate(update) {
    const { reference_code, ...nodeData } = update;
    
    if (!reference_code) return;
    
    // Update node data
    const existingData = this.nodesData.get(reference_code) || {};
    this.nodesData.set(reference_code, {
      ...existingData,
      ...nodeData,
      reference_code,
      lastUpdate: new Date()
    });
    
    // Emit update for this specific node
    this.emit('node_updated', {
      reference_code,
      data: this.nodesData.get(reference_code)
    });
    
    // Emit all nodes update
    this._emitNodesUpdate();
  }

  /**
   * Handle real-time update (comprehensive update)
   * @private
   */
  _handleRealtimeUpdate(update) {
    this.lastUpdateSequence = update.sequence || Date.now();
    
    // Update all nodes data if provided
    if (update.data && update.data.nodes && Array.isArray(update.data.nodes)) {
      update.data.nodes.forEach(node => {
        if (node.reference_code) {
          const existingData = this.nodesData.get(node.reference_code) || {};
          this.nodesData.set(node.reference_code, {
            ...existingData,
            ...node,
            lastUpdate: new Date(update.timestamp || Date.now())
          });
        }
      });
    }
    
    // Emit comprehensive update
    this.emit('nodes_updated', {
      summary: update.data?.summary || this._calculateSummary(),
      nodes: Array.from(this.nodesData.values()),
      performance: update.data?.performance_overview || {},
      timestamp: update.timestamp,
      sequence: this.lastUpdateSequence
    });
  }

  /**
   * Handle earnings update
   * @private
   */
  _handleEarningsUpdate(update) {
    const { reference_code, earnings_delta, total_earnings } = update;
    
    if (!reference_code) return;
    
    // Update node earnings
    const node = this.nodesData.get(reference_code);
    if (node) {
      node.earnings = total_earnings;
      node.earnings_delta = earnings_delta;
      node.lastEarningsUpdate = new Date(update.timestamp || Date.now());
      
      this.nodesData.set(reference_code, node);
    }
    
    // Emit earnings update
    this.emit('earnings_updated', update);
    
    // Update nodes
    this._emitNodesUpdate();
  }

  /**
   * Handle node alert
   * @private
   */
  _handleNodeAlert(alert) {
    this.emit('alert_received', alert);
    
    // Update node alert status
    const node = this.nodesData.get(alert.reference_code);
    if (node) {
      if (!node.alerts) node.alerts = [];
      node.alerts.push(alert);
      
      // Keep only recent alerts (last 10)
      if (node.alerts.length > 10) {
        node.alerts = node.alerts.slice(-10);
      }
      
      this.nodesData.set(alert.reference_code, node);
      this._emitNodesUpdate();
    }
  }

  /**
   * Handle WebSocket errors
   * @private
   */
  _handleError(error) {
    this.log('error', 'WebSocket error received:', error);
    
    // Handle specific error codes
    switch (error.code) {
      case 'AUTHENTICATION_FAILED':
        this.authenticated = false;
        this.emit('auth_failed', error);
        break;
      
      case 'RATE_LIMIT_EXCEEDED':
        this.emit('rate_limit_exceeded', error);
        break;
      
      case 'NODE_NOT_FOUND':
        this.emit('node_not_found', error);
        break;
      
      default:
        this.emit('error_received', error);
    }
  }

  /**
   * Calculate summary from current nodes data
   * @private
   */
  _calculateSummary() {
    const nodes = Array.from(this.nodesData.values());
    
    return {
      total_nodes: nodes.length,
      online_nodes: nodes.filter(n => n.status === 'active' && n.is_connected).length,
      active_nodes: nodes.filter(n => n.status === 'active').length,
      offline_nodes: nodes.filter(n => n.status === 'offline').length,
      pending_nodes: nodes.filter(n => n.status === 'pending').length,
      total_earnings: nodes.reduce((sum, n) => sum + parseFloat(n.earnings || 0), 0).toFixed(6)
    };
  }

  /**
   * Emit nodes update event
   * @private
   */
  _emitNodesUpdate() {
    const summary = this._calculateSummary();
    const nodes = Array.from(this.nodesData.values());
    
    this.emit('nodes_updated', {
      summary,
      nodes,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Start real-time monitoring (if not auto-started)
   */
  async startMonitoring() {
    if (this.monitoringActive) {
      this.log('warn', 'Monitoring already active');
      return;
    }
    
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }
    
    // Re-subscribe to all nodes
    await this._subscribeToAllNodes();
  }

  /**
   * Stop real-time monitoring
   */
  async stopMonitoring() {
    if (!this.monitoringActive) {
      this.log('warn', 'Monitoring not active');
      return;
    }
    
    // Note: API docs don't show an unsubscribe message
    // Just mark as inactive locally
    this.monitoringActive = false;
    this.emit('monitoring_stopped');
  }

  /**
   * Subscribe to specific node updates
   * @param {string} referenceCode - Node reference code
   */
  async subscribeToNode(referenceCode) {
    if (this.subscribedNodes.has(referenceCode)) {
      this.log('warn', `Already subscribed to node ${referenceCode}`);
      return;
    }
    
    // Add to current subscriptions
    const allRefs = [...this.nodeReferences, referenceCode];
    
    await this.send({
      type: 'subscribe_nodes',
      data: {
        node_references: allRefs
      }
    });
    
    this.subscribedNodes.add(referenceCode);
    this.nodeReferences = allRefs;
  }

  /**
   * Get node by reference code
   * @param {string} referenceCode - Node reference code
   */
  getNode(referenceCode) {
    return this.nodesData.get(referenceCode);
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
      subscribedNodes: this.nodeReferences,
      lastUpdateSequence: this.lastUpdateSequence,
      summary: this._calculateSummary()
    };
  }
}
