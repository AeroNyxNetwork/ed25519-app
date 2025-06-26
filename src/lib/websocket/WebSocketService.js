/**
 * Base WebSocket Service for AeroNyx Platform
 * 
 * File Path: src/lib/websocket/WebSocketService.js
 * 
 * Fixed version preventing infinite recursion in event handling
 * 
 * @version 2.1.0
 * @author AeroNyx Development Team
 */

import EventEmitter from 'events';

export const WebSocketState = {
  CONNECTING: 'CONNECTING',
  OPEN: 'OPEN',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  RECONNECTING: 'RECONNECTING'
};

export const WebSocketCloseCode = {
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  CONNECTION_SETUP_FAILED: 4000,
  AUTH_TIMEOUT: 4001,
  CONNECTION_INACTIVE: 4002,
  SECURITY_VIOLATIONS: 4005,
  ACCOUNT_LOCKED: 4006,
  AUTH_ATTEMPTS_EXCEEDED: 4007,
  IP_CONNECTION_LIMIT: 4008,
  SERVER_CONNECTION_LIMIT: 4009,
  INVALID_CLIENT: 4010
};

export default class WebSocketService extends EventEmitter {
  constructor(url, options = {}) {
    super();
    
    this.url = url;
    this.options = {
      reconnect: true,
      reconnectInterval: 1000,
      maxReconnectInterval: 30000,
      reconnectDecay: 1.5,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      heartbeatTimeout: 60000,
      messageQueueSize: 100,
      debug: false,
      ...options
    };
    
    this.ws = null;
    this.state = WebSocketState.CLOSED;
    this.reconnectAttempts = 0;
    this.messageQueue = [];
    this.heartbeatTimer = null;
    this.heartbeatTimeoutTimer = null;
    this.connectionId = null;
    this.authenticated = false;
    
    // Fix: Add flag to prevent logging recursion
    this._isLogging = false;
    
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      connectionAttempts: 0,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      totalUptime: 0
    };
  }

  /**
   * Connect to WebSocket server
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.state === WebSocketState.OPEN || this.state === WebSocketState.CONNECTING) {
      this.log('warn', 'Already connected or connecting');
      return;
    }

    this.state = WebSocketState.CONNECTING;
    this.metrics.connectionAttempts++;
    
    try {
      await this._createConnection();
    } catch (error) {
      this.log('error', 'Connection failed', error);
      this._handleConnectionError(error);
    }
  }

  /**
   * Disconnect from WebSocket server
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   */
  disconnect(code = WebSocketCloseCode.NORMAL_CLOSURE, reason = 'Client disconnect') {
    this.options.reconnect = false;
    this._clearTimers();
    
    if (this.ws && this.state === WebSocketState.OPEN) {
      this.state = WebSocketState.CLOSING;
      this.ws.close(code, reason);
    } else {
      this.state = WebSocketState.CLOSED;
    }
  }

  /**
   * Send message through WebSocket
   * @param {Object} data - Message data
   * @returns {Promise<void>}
   */
  async send(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid message data');
    }

    const message = { ...data };

    if (this.state === WebSocketState.OPEN && this.ws) {
      try {
        this.ws.send(JSON.stringify(message));
        this.metrics.messagesSent++;
        this.emit('message_sent', message);
        return;
      } catch (error) {
        this.log('error', 'Failed to send message', error);
        this._queueMessage(message);
        throw error;
      }
    } else {
      this._queueMessage(message);
      
      if (this.state === WebSocketState.CLOSED) {
        await this.connect();
      }
    }
  }

  /**
   * Create WebSocket connection
   * @private
   */
  async _createConnection() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          this.state = WebSocketState.OPEN;
          this.reconnectAttempts = 0;
          this.metrics.lastConnectedAt = new Date();
          
          this.log('info', 'WebSocket connected');
          this.emit('connected');
          this.emit('connection_established');
          
          this._processMessageQueue();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this._handleMessage(event);
        };

        this.ws.onerror = (error) => {
          this.log('error', 'WebSocket error', error);
          this.emit('error', error);
        };

        this.ws.onclose = (event) => {
          this._handleClose(event);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming message
   * @private
   */
  _handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      this.metrics.messagesReceived++;
      
      // Enhanced logging for debugging
      console.log('[WebSocket] Raw message received:', {
        type: data.type,
        hasData: !!data.data,
        keys: Object.keys(data),
        timestamp: new Date().toISOString()
      });
      
      this.log('debug', 'Message received', data);
      
      // Only emit raw message for debugging purposes
      this.emit('message', data);
      
      // Handle messages based on type field
      if (data.type) {
        // Handle common message types internally first
        switch (data.type) {
          case 'connection_established':
            this._handleConnectionEstablished(data);
            break;
          
          case 'auth_success':
            console.log('[WebSocket] Auth success data:', data);
            this._handleAuthSuccess(data);
            // Auth success has flat structure, emit the whole data
            this.emit('auth_success', data);
            break;
          
          case 'auth_failed':
            this._handleAuthFailed(data.data || data);
            break;
          
          case 'heartbeat_ack':
            this._handleHeartbeatAck(data);
            break;
          
          case 'error':
            this._handleError(data.data || data);
            break;
          
          case 'pong':
            this._handlePong(data);
            break;
            
          // For other message types, emit the event
          default:
            console.log(`[WebSocket] Emitting event: ${data.type}`);
            this.emit(data.type, data.data || data);
            break;
        }
      }
      
    } catch (error) {
      this.log('error', 'Failed to parse message', error);
      this.emit('parse_error', error);
    }
  }

  /**
   * Handle connection established
   * @private
   */
  _handleConnectionEstablished(data) {
    this.connectionId = data.connection_id || data.data?.connection_id;
    this.log('info', 'Connection established with ID:', this.connectionId);
  }

  /**
   * Handle authentication success
   * @private
   */
  _handleAuthSuccess(data) {
    this.authenticated = true;
    this.log('info', 'Authentication successful');
    
    if (data.heartbeat_interval) {
      this._startHeartbeat(data.heartbeat_interval * 1000);
    }
  }

  /**
   * Handle authentication failure
   * @private
   */
  _handleAuthFailed(data) {
    this.authenticated = false;
    this.log('error', 'Authentication failed:', data.message || data);
    this.options.reconnect = false;
  }

  /**
   * Handle heartbeat acknowledgment
   * @private
   */
  _handleHeartbeatAck(data) {
    this._resetHeartbeatTimeout();
    this.emit('heartbeat_ack', data);
  }

  /**
   * Handle error message
   * @private
   */
  _handleError(data) {
    const errorCode = data.code || data.error_code;
    const errorMessage = data.message || 'Unknown error';
    
    this.log('error', `Server error: ${errorCode} - ${errorMessage}`);
    
    switch (errorCode) {
      case 'AUTHENTICATION_FAILED':
      case 'PERMISSION_DENIED':
      case 'INVALID_CLIENT':
        this.options.reconnect = false;
        break;
    }
  }

  /**
   * Handle pong response
   * @private
   */
  _handlePong(data) {
    const latency = Date.now() - (data.timestamp || 0);
    this.emit('pong', { ...data, latency });
  }

  /**
   * Handle WebSocket close
   * @private
   */
  _handleClose(event) {
    this.state = WebSocketState.CLOSED;
    this.authenticated = false;
    this.metrics.lastDisconnectedAt = new Date();
    
    if (this.metrics.lastConnectedAt) {
      this.metrics.totalUptime += Date.now() - this.metrics.lastConnectedAt.getTime();
    }
    
    this._clearTimers();
    
    this.log('info', `WebSocket closed: ${event.code} - ${event.reason}`);
    this.emit('disconnected', { code: event.code, reason: event.reason });
    
    if (this.options.reconnect && this._shouldReconnect(event.code)) {
      this._scheduleReconnect();
    }
  }

  /**
   * Handle connection error
   * @private
   */
  _handleConnectionError(error) {
    this.state = WebSocketState.CLOSED;
    this.emit('connection_error', error);
    
    if (this.options.reconnect) {
      this._scheduleReconnect();
    }
  }

  /**
   * Determine if should reconnect based on close code
   * @private
   */
  _shouldReconnect(code) {
    const noReconnectCodes = [
      WebSocketCloseCode.NORMAL_CLOSURE,
      WebSocketCloseCode.SECURITY_VIOLATIONS,
      WebSocketCloseCode.ACCOUNT_LOCKED,
      WebSocketCloseCode.AUTH_ATTEMPTS_EXCEEDED,
      WebSocketCloseCode.INVALID_CLIENT
    ];
    
    return !noReconnectCodes.includes(code) && 
           this.reconnectAttempts < this.options.maxReconnectAttempts;
  }

  /**
   * Schedule reconnection attempt
   * @private
   */
  _scheduleReconnect() {
    this.state = WebSocketState.RECONNECTING;
    this.reconnectAttempts++;
    
    const interval = Math.min(
      this.options.reconnectInterval * Math.pow(this.options.reconnectDecay, this.reconnectAttempts - 1),
      this.options.maxReconnectInterval
    );
    
    this.log('info', `Reconnecting in ${interval}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (this.state === WebSocketState.RECONNECTING) {
        this.connect();
      }
    }, interval);
  }

  /**
   * Queue message for later sending
   * @private
   */
  _queueMessage(message) {
    if (this.messageQueue.length >= this.options.messageQueueSize) {
      this.messageQueue.shift();
    }
    
    this.messageQueue.push(message);
    this.log('debug', `Message queued (queue size: ${this.messageQueue.length})`);
  }

  /**
   * Process queued messages
   * @private
   */
  async _processMessageQueue() {
    if (this.messageQueue.length === 0) return;
    
    this.log('info', `Processing ${this.messageQueue.length} queued messages`);
    
    while (this.messageQueue.length > 0 && this.state === WebSocketState.OPEN) {
      const message = this.messageQueue.shift();
      try {
        await this.send(message);
      } catch (error) {
        this.log('error', 'Failed to send queued message', error);
        break;
      }
    }
  }

  /**
   * Start heartbeat mechanism
   * @private
   */
  _startHeartbeat(interval) {
    this._clearHeartbeatTimers();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.state === WebSocketState.OPEN && this.authenticated) {
        this._sendHeartbeat();
        this._setHeartbeatTimeout();
      }
    }, interval);
  }

  /**
   * Send heartbeat
   * @private
   */
  _sendHeartbeat() {
    this.emit('heartbeat_required');
  }

  /**
   * Set heartbeat timeout
   * @private
   */
  _setHeartbeatTimeout() {
    this._clearHeartbeatTimeout();
    
    this.heartbeatTimeoutTimer = setTimeout(() => {
      this.log('warn', 'Heartbeat timeout - closing connection');
      this.ws?.close(WebSocketCloseCode.CONNECTION_INACTIVE, 'Heartbeat timeout');
    }, this.options.heartbeatTimeout);
  }

  /**
   * Reset heartbeat timeout
   * @private
   */
  _resetHeartbeatTimeout() {
    this._clearHeartbeatTimeout();
  }

  /**
   * Clear heartbeat timers
   * @private
   */
  _clearHeartbeatTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    this._clearHeartbeatTimeout();
  }

  /**
   * Clear heartbeat timeout
   * @private
   */
  _clearHeartbeatTimeout() {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  /**
   * Clear all timers
   * @private
   */
  _clearTimers() {
    this._clearHeartbeatTimers();
  }

  /**
   * Send ping message
   */
  ping() {
    return this.send({
      type: 'ping',
      timestamp: Date.now()
    });
  }

  /**
   * Get connection metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      state: this.state,
      authenticated: this.authenticated,
      queueSize: this.messageQueue.length,
      uptimePercentage: this._calculateUptime()
    };
  }

  /**
   * Calculate uptime percentage
   * @private
   */
  _calculateUptime() {
    if (!this.metrics.lastConnectedAt) return 0;
    
    const totalTime = this.metrics.totalUptime + 
      (this.state === WebSocketState.OPEN ? Date.now() - this.metrics.lastConnectedAt.getTime() : 0);
    
    const timeSinceFirstConnection = Date.now() - 
      (this.metrics.lastConnectedAt?.getTime() || Date.now());
    
    return timeSinceFirstConnection > 0 ? (totalTime / timeSinceFirstConnection) * 100 : 0;
  }

  /**
   * Log message with recursion protection
   * @private
   */
  log(level, message, data = null) {
    if (!this.options.debug && level === 'debug') return;
    
    // Prevent recursive logging
    if (this._isLogging) return;
    
    const logMessage = `[WebSocketService] ${message}`;
    
    switch (level) {
      case 'debug':
        console.debug(logMessage, data);
        break;
      case 'info':
        console.info(logMessage, data);
        break;
      case 'warn':
        console.warn(logMessage, data);
        break;
      case 'error':
        console.error(logMessage, data);
        break;
    }
    
    // Set flag before emitting to prevent recursion
    this._isLogging = true;
    try {
      this.emit('log', { level, message, data, timestamp: new Date() });
    } finally {
      this._isLogging = false;
    }
  }
}
