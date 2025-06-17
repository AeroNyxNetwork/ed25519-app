/**
 * Node WebSocket Service for AeroNyx Platform
 * 
 * Handles WebSocket communication for AeroNyx nodes including
 * authentication, heartbeat, and status updates.
 * 
 * @class NodeWebSocketService
 * @extends WebSocketService
 * @version 1.0.0
 */

import WebSocketService from './WebSocketService';

export default class NodeWebSocketService extends WebSocketService {
  constructor(referenceCode, options = {}) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://api.aeronyx.network';
    super(`${wsUrl}/ws/aeronyx/node/`, options);
    
    this.referenceCode = referenceCode;
    this.nodeInfo = null;
    this.heartbeatCount = 0;
    this.nodeMetrics = {
      cpu: 0,
      memory: 0,
      disk: 0,
      network: 0
    };
    
    this._setupEventHandlers();
  }

  /**
   * Setup internal event handlers
   * @private
   */
  _setupEventHandlers() {
    this.on('connection_established', (data) => {
      this.log('info', 'Connection established, authenticating...');
      this._authenticate();
    });
    
    this.on('auth_success', (data) => {
      this.nodeInfo = data.node;
      this.heartbeatInterval = data.heartbeat_interval;
      this.log('info', `Authenticated as node: ${this.nodeInfo.reference_code}`);
    });
    
    this.on('heartbeat_required', () => {
      this._sendNodeHeartbeat();
    });
  }

  /**
   * Authenticate node
   * @private
   */
  async _authenticate() {
    try {
      await this.send({
        type: 'auth',
        reference_code: this.referenceCode
      });
    } catch (error) {
      this.log('error', 'Authentication failed', error);
      this.emit('auth_error', error);
    }
  }

  /**
   * Send node heartbeat
   * @private
   */
  async _sendNodeHeartbeat() {
    try {
      await this.send({
        type: 'heartbeat',
        status: 'active',
        uptime_seconds: this._getUptime(),
        metrics: await this._collectMetrics()
      });
      
      this.heartbeatCount++;
    } catch (error) {
      this.log('error', 'Failed to send heartbeat', error);
    }
  }

  /**
   * Update node status
   * @param {string} status - Node status (active, offline, suspended)
   */
  async updateStatus(status) {
    const validStatuses = ['active', 'offline', 'suspended'];
    
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    
    return this.send({
      type: 'status_update',
      status
    });
  }

  /**
   * Update node metrics
   * @param {Object} metrics - Node metrics
   */
  updateMetrics(metrics) {
    this.nodeMetrics = {
      ...this.nodeMetrics,
      ...metrics
    };
  }

  /**
   * Get node uptime in seconds
   * @private
   */
  _getUptime() {
    if (!this.metrics.lastConnectedAt) return 0;
    return Math.floor((Date.now() - this.metrics.lastConnectedAt.getTime()) / 1000);
  }

  /**
   * Collect node metrics
   * @private
   */
  async _collectMetrics() {
    // In a real implementation, these would be actual system metrics
    // For now, return the manually set metrics or defaults
    return {
      cpu: Math.round(this.nodeMetrics.cpu),
      mem: Math.round(this.nodeMetrics.memory),
      disk: Math.round(this.nodeMetrics.disk),
      net: Math.round(this.nodeMetrics.network)
    };
  }

  /**
   * Get node information
   */
  getNodeInfo() {
    return {
      ...this.nodeInfo,
      referenceCode: this.referenceCode,
      heartbeatCount: this.heartbeatCount,
      uptime: this._getUptime(),
      metrics: this.nodeMetrics
    };
  }
}
