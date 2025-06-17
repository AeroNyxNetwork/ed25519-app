/**
 * User Monitor WebSocket Service for AeroNyx Platform
 * 
 * Handles real-time monitoring of user's nodes with wallet authentication
 * and comprehensive monitoring capabilities.
 * 
 * @class UserMonitorWebSocketService
 * @extends WebSocketService
 * @version 1.0.0
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
    
    this.on('auth_success', (data) => {
      this.log('info', `Authenticated for ${data.nodes_summary.total_nodes} nodes`);
      this._initializeNodesData(data.nodes_summary);
    });
    
    this.on('real_time_update', (data) => {
      this._handleRealtimeUpdate(data);
    });
    
    this.on('monitoring_started', (data) => {
      this.monitoringActive = true;
      this.log('info', `Monitoring started for ${data.node_count} nodes`);
    });
    
    this.on('monitoring_stopped', () => {
      this.monitoringActive = false;
      this.log('info', 'Monitoring stopped');
    });
  }

  /**
   * Authenticate with wallet credentials
   * @private
   */
  async _authenticate() {
    try {
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
   * Initialize nodes data from auth response
   * @private
   */
  _initializeNodesData(nodesSummary) {
    nodesSummary.node_references.forEach(ref => {
      this.nodesData.set(ref, {
        reference_code: ref,
        status: 'unknown',
        lastUpdate: null
      });
    });
  }

  /**
   * Handle real-time update
   * @private
   */
  _handleRealtimeUpdate(update) {
    this.lastUpdateSequence = update.sequence;
    
    // Update nodes data
    update.data.nodes.forEach(node => {
      this.nodesData.set(node.reference_code, {
        ...this.nodesData.get(node.reference_code),
        ...node,
        lastUpdate: new Date(update.timestamp)
      });
    });
    
    // Emit processed update
    this.emit('nodes_updated', {
      summary: update.data.summary,
      nodes: Array.from(this.nodesData.values()),
      performance: update.data.performance_overview,
      timestamp: update.timestamp
    });
  }

  /**
   * Start real-time monitoring
   */
  async startMonitoring() {
    if (this.monitoringActive) {
      this.log('warn', 'Monitoring already active');
      return;
    }
    
    return this.send({
      type: 'start_monitoring'
    });
  }

  /**
   * Stop real-time monitoring
   */
  async stopMonitoring() {
    if (!this.monitoringActive) {
      this.log('warn', 'Monitoring not active');
      return;
    }
    
    return this.send({
      type: 'stop_monitoring'
    });
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
    
    await this.send({
      type: 'subscribe_node',
      reference_code: referenceCode
    });
    
    this.subscribedNodes.add(referenceCode);
  }

  /**
   * Unsubscribe from node updates
   * @param {string} referenceCode - Node reference code
   */
  async unsubscribeFromNode(referenceCode) {
    if (!this.subscribedNodes.has(referenceCode)) {
      this.log('warn', `Not subscribed to node ${referenceCode}`);
      return;
    }
    
    await this.send({
      type: 'unsubscribe_node',
      reference_code: referenceCode
    });
    
    this.subscribedNodes.delete(referenceCode);
  }

  /**
   * Get current status snapshot
   */
  async getCurrentStatus() {
    return this.send({
      type: 'get_current_status'
    });
  }

  /**
   * Get performance snapshot
   */
  async getPerformanceSnapshot() {
    return this.send({
      type: 'get_performance_snapshot'
    });
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
      nodesCount: this.nodesData.size,
      subscribedNodes: Array.from(this.subscribedNodes),
      lastUpdateSequence: this.lastUpdateSequence
    };
  }
}
