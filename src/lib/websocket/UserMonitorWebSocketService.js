/**
 * User Monitor WebSocket Service for AeroNyx Platform
 * 
 * File Path: src/lib/websocket/UserMonitorWebSocketService.js
 * 
 * Production implementation with correct authentication flow.
 * 
 * @version 6.0.0
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
    
    this._setupEventHandlers();
  }

  /**
   * Setup internal event handlers
   * @private
   */
  _setupEventHandlers() {
    // Handle initial connection
    this.on('connected', (data) => {
      this.log('info', 'Connected to WebSocket, requesting signature message');
      
      // Immediately request signature message
      this.send({
        type: 'get_message',
        wallet_address: this.walletAddress
      }).catch(err => {
        this.log('error', 'Failed to request signature message:', err);
      });
    });
    
    // Handle signature message
    this.on('signature_message', (data) => {
      this.log('info', 'Received signature message');
      this.emit('signature_message', data);
    });
    
    // Handle auth success
    this.on('auth_success', (data) => {
      this.log('info', 'Authentication successful');
      this.authenticated = true;
      
      // Process nodes from auth response
      if (data.nodes_summary?.nodes) {
        this._initializeNodesData(data.nodes_summary.nodes);
      }
      
      // Start monitoring after auth
      setTimeout(() => {
        this.startMonitoring().catch(err => {
          this.log('error', 'Failed to start monitoring:', err);
        });
      }, 100);
    });
    
    // Handle auth failure
    this.on('auth_failed', (data) => {
      this.log('error', 'Authentication failed:', data.message || 'Unknown error');
      this.authenticated = false;
    });
    
    // Handle monitoring started
    this.on('monitor_started', (data) => {
      this.log('info', 'Monitoring started');
      this.monitoringActive = true;
    });
    
    // Handle status updates
    this.on('status_update', (data) => {
      this._handleStatusUpdate(data);
    });
    
    // Handle errors
    this.on('error', (data) => {
      this.log('error', 'WebSocket error:', data);
    });
  }

  /**
   * Authenticate with signature
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
      
      this.log('info', 'Authentication sent');
    } catch (error) {
      this.log('error', 'Failed to authenticate', error);
      throw error;
    }
  }

  /**
   * Initialize nodes data
   * @private
   */
  _initializeNodesData(nodes) {
    if (!Array.isArray(nodes)) return;
    
    this.nodesData.clear();
    
    nodes.forEach(node => {
      this.nodesData.set(node.code, {
        reference_code: node.code,
        name: node.name || 'Unknown',
        status: 'unknown',
        type: 'general'
      });
    });
    
    this.emit('nodes_initialized', {
      nodes: Array.from(this.nodesData.values())
    });
  }

  /**
   * Handle status update
   * @private
   */
  _handleStatusUpdate(data) {
    if (!data?.nodes || !Array.isArray(data.nodes)) return;
    
    const updatedNodes = [];
    
    data.nodes.forEach(nodeUpdate => {
      const node = {
        reference_code: nodeUpdate.code,
        name: nodeUpdate.name,
        status: nodeUpdate.status,
        type: nodeUpdate.type || 'general',
        performance: nodeUpdate.performance,
        last_seen: nodeUpdate.last_seen
      };
      
      this.nodesData.set(nodeUpdate.code, node);
      updatedNodes.push(node);
    });
    
    this.emit('nodes_updated', {
      nodes: updatedNodes,
      timestamp: Date.now()
    });
  }

  /**
   * Start monitoring
   */
  async startMonitoring() {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }
    
    if (this.monitoringActive) {
      return;
    }
    
    try {
      await this.send({ type: 'start_monitor' });
      this.log('info', 'Monitor start requested');
    } catch (error) {
      this.log('error', 'Failed to start monitoring', error);
      throw error;
    }
  }

  /**
   * Get all nodes
   */
  getAllNodes() {
    return Array.from(this.nodesData.values());
  }
}
