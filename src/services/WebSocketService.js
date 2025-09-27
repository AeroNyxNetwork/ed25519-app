/**
 * ============================================
 * File: src/services/WebSocketService.js
 * ============================================
 * WebSocket service layer - Handles all WebSocket communication
 * 
 * Responsibilities:
 * 1. Manage WebSocket connection lifecycle
 * 2. Handle message sending and receiving
 * 3. Automatic reconnection mechanism
 * 4. Message queue management
 * 
 * Features:
 * - Singleton pattern, globally unique instance
 * - Automatic reconnection
 * - Message deduplication
 * - Event emitter pattern
 * ============================================
 */

import EventEmitter from 'events';

// Configuration constants
const CONFIG = {
  WS_URL: 'wss://api.aeronyx.network/ws/aeronyx/user-monitor/',
  RECONNECT_INTERVAL: 3000,
  MAX_RECONNECT_ATTEMPTS: 5,
  PING_INTERVAL: 30000,
  MESSAGE_TIMEOUT: 30000,
  INPUT_DEBOUNCE_MS: 5,
};

// WebSocket state enumeration
export const WS_STATE = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  MONITORING: 'monitoring',
  ERROR: 'error',
  CLOSED: 'closed',
};

/**
 * WebSocket Service Class
 * Uses event emitter pattern, allowing components to subscribe to specific events
 */
class WebSocketService extends EventEmitter {
  constructor() {
    super();
    
    // WebSocket instance
    this.ws = null;
    
    // Connection state
    this.state = WS_STATE.IDLE;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.isMonitoring = false;
    
    // Reconnection management
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
    
    // Ping/Pong management
    this.pingInterval = null;
    this.lastPong = Date.now();
    
    // Message queue (for caching messages when disconnected)
    this.messageQueue = [];
    
    // Input deduplication
    this.lastInput = { data: '', timestamp: 0 };
    
    // Session information
    this.sessionToken = null;
    this.walletAddress = null;
    
    // Pending requests (for responsive messages)
    this.pendingRequests = new Map();
    
    // Debug mode
    this.debug = true;
  }
  
  /**
   * Log output (with debug control)
   */
  log(...args) {
    if (this.debug) {
      console.log('[WebSocketService]', ...args);
    }
  }
  
  /**
   * Error log
   */
  error(...args) {
    console.error('[WebSocketService]', ...args);
  }
  
  /**
   * Connect to WebSocket server
   * @param {Object} options - Connection options
   * @param {string} options.walletAddress - Wallet address
   * @param {Object} options.wallet - Wallet provider
   * @returns {Promise<boolean>} Returns true on successful connection
   */
  async connect(options = {}) {
    const { walletAddress, wallet } = options;
    
    // Prevent duplicate connections
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.log('Already connected');
      return true;
    }
    
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      this.log('Connection in progress');
      return false;
    }
    
    this.walletAddress = walletAddress;
    this.walletProvider = wallet;
    
    return new Promise((resolve) => {
      try {
        this.log('Connecting to:', CONFIG.WS_URL);
        this.updateState(WS_STATE.CONNECTING);
        
        // Create WebSocket connection
        this.ws = new WebSocket(CONFIG.WS_URL);
        
        // Connection timeout handler
        const connectTimeout = setTimeout(() => {
          if (this.ws.readyState === WebSocket.CONNECTING) {
            this.error('Connection timeout');
            this.ws.close();
            resolve(false);
          }
        }, 10000);
        
        // Connection open
        this.ws.onopen = () => {
          clearTimeout(connectTimeout);
          this.log('Connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.updateState(WS_STATE.CONNECTED);
          
          // Start ping loop
          this.startPingInterval();
          
          // Emit event
          this.emit('connected');
          
          // Process queued messages
          this.flushMessageQueue();
          
          resolve(true);
        };
        
        // Receive message
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        // Connection error
        this.ws.onerror = (error) => {
          clearTimeout(connectTimeout);
          this.error('Connection error:', error);
          this.updateState(WS_STATE.ERROR);
          this.emit('error', error);
          resolve(false);
        };
        
        // Connection close
        this.ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          this.log('Connection closed:', event.code, event.reason);
          this.handleDisconnect(event);
          resolve(false);
        };
        
      } catch (error) {
        this.error('Failed to connect:', error);
        this.updateState(WS_STATE.ERROR);
        resolve(false);
      }
    });
  }
  
  /**
   * Disconnect
   */
  disconnect() {
    this.log('Disconnecting');
    
    // Clean up timers
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Clean up pending requests
    this.pendingRequests.forEach((request) => {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      if (request.reject) {
        request.reject(new Error('Connection closed'));
      }
    });
    this.pendingRequests.clear();
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
    }
    
    // Reset state
    this.isConnected = false;
    this.isAuthenticated = false;
    this.isMonitoring = false;
    this.updateState(WS_STATE.CLOSED);
  }
  
  /**
   * Handle disconnection
   */
  handleDisconnect(event) {
    this.isConnected = false;
    this.isAuthenticated = false;
    this.isMonitoring = false;
    this.ws = null;
    
    // Clean up timers
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Emit disconnection event
    this.emit('disconnected', event);
    
    // Abnormal closure, attempt reconnection
    if (event.code !== 1000 && this.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
      this.scheduleReconnect();
    } else {
      this.updateState(WS_STATE.CLOSED);
    }
  }
  
  /**
   * Schedule reconnection
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(CONFIG.RECONNECT_INTERVAL * this.reconnectAttempts, 30000);
    
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS})`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (this.walletAddress) {
        this.connect({
          walletAddress: this.walletAddress,
          wallet: this.walletProvider
        });
      }
    }, delay);
  }
  
  /**
   * Update state and emit event
   */
  updateState(newState) {
    const oldState = this.state;
    this.state = newState;
    
    if (oldState !== newState) {
      this.log(`State changed: ${oldState} -> ${newState}`);
      this.emit('stateChange', { oldState, newState });
    }
  }
  
  /**
   * Start ping interval
   */
  startPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    this.pingInterval = setInterval(() => {
      if (this.isConnected && this.isAuthenticated) {
        // Check last pong
        const timeSinceLastPong = Date.now() - this.lastPong;
        if (timeSinceLastPong > CONFIG.PING_INTERVAL * 3) {
          this.log('No pong received, reconnecting');
          this.ws.close();
          return;
        }
        
        // Send ping
        this.send({
          type: 'ping',
          timestamp: Date.now()
        });
      }
    }, CONFIG.PING_INTERVAL);
  }
  
  /**
   * Handle received message
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      this.log('Received:', message.type, message);
      
      // Handle different message types
      switch (message.type) {
        case 'connected':
          this.emit('serverConnected', message);
          break;
          
        case 'signature_message':
          this.emit('signatureRequired', message);
          break;
          
        case 'auth_success':
          this.handleAuthSuccess(message);
          break;
          
        case 'auth_error':
        case 'error':
          this.handleError(message);
          break;
          
        case 'monitor_started':
          this.isMonitoring = true;
          this.updateState(WS_STATE.MONITORING);
          this.emit('monitoringStarted', message);
          break;
          
        case 'status_update':
          this.emit('statusUpdate', message);
          break;
          
        case 'pong':
          this.lastPong = Date.now();
          break;
          
        case 'term_ready':
          this.emit('terminalReady', message);
          break;
          
        case 'term_output':
          this.emit('terminalOutput', message);
          break;
          
        case 'term_error':
          this.emit('terminalError', message);
          break;
          
        case 'term_closed':
          this.emit('terminalClosed', message);
          break;
          
        case 'remote_auth_success':
          this.emit('remoteAuthSuccess', message);
          break;
          
        case 'remote_command_response':
          this.handleCommandResponse(message);
          break;
          
        default:
          this.log('Unknown message type:', message.type);
          this.emit('unknownMessage', message);
      }
      
      // Emit generic message event
      this.emit('message', message);
      
    } catch (error) {
      this.error('Failed to parse message:', error);
    }
  }
  
  /**
   * Handle authentication success
   */
  handleAuthSuccess(message) {
    this.log('Authentication successful');
    this.isAuthenticated = true;
    this.sessionToken = message.session_token;
    this.updateState(WS_STATE.AUTHENTICATED);
    
    // Store session
    if (message.session_token) {
      this.storeSession(message.session_token);
    }
    
    this.emit('authenticated', message);
  }
  
  /**
   * Handle error message
   */
  handleError(message) {
    this.error('Server error:', message);
    
    if (message.code === 'SESSION_INVALID' || message.code === 'SESSION_EXPIRED') {
      this.sessionToken = null;
      this.isAuthenticated = false;
      this.clearStoredSession();
      this.emit('sessionExpired', message);
    } else {
      this.emit('error', message);
    }
  }
  
  /**
   * Handle command response
   */
  handleCommandResponse(message) {
    const pending = this.pendingRequests.get(message.request_id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.request_id);
      
      if (message.success) {
        pending.resolve(message);
      } else {
        pending.reject(new Error(message.error || 'Command failed'));
      }
    }
  }
  
  /**
   * Send message (with deduplication)
   * @param {Object} message - Message to send
   * @param {Object} options - Send options
   * @returns {boolean} Whether successfully sent
   */
  send(message, options = {}) {
    // Input deduplication (only for term_input type)
    if (message.type === 'term_input') {
      const now = Date.now();
      const isDuplicate = 
        message.data === this.lastInput.data &&
        (now - this.lastInput.timestamp) < CONFIG.INPUT_DEBOUNCE_MS;
      
      if (isDuplicate) {
        this.log('Ignoring duplicate input');
        return false;
      }
      
      this.lastInput = {
        data: message.data,
        timestamp: now
      };
    }
    
    // If connection available, send immediately
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        this.log('Sent:', message.type, message);
        return true;
      } catch (error) {
        this.error('Failed to send message:', error);
        return false;
      }
    }
    
    // If queue option is set, add to queue
    if (options.queue) {
      this.messageQueue.push({ message, options });
      this.log('Message queued:', message.type);
      return true;
    }
    
    this.log('Cannot send message - not connected');
    return false;
  }
  
  /**
   * Send request and wait for response
   * @param {Object} message - Request message
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise} Response Promise
   */
  sendRequest(message, timeout = CONFIG.MESSAGE_TIMEOUT) {
    return new Promise((resolve, reject) => {
      // Generate request ID
      const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      message.request_id = requestId;
      
      // Set timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, timeout);
      
      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });
      
      // Send message
      if (!this.send(message)) {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutHandle);
        reject(new Error('Failed to send request'));
      }
    });
  }
  
  /**
   * Process message queue
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const { message, options } = this.messageQueue.shift();
      this.send(message, { ...options, queue: false });
    }
  }
  
  /**
   * Store session to sessionStorage
   */
  storeSession(token) {
    try {
      const session = {
        token,
        walletAddress: this.walletAddress,
        timestamp: Date.now(),
        expiresAt: Date.now() + (30 * 60 * 1000) // 30 minutes
      };
      sessionStorage.setItem('aeronyx_ws_session', JSON.stringify(session));
    } catch (error) {
      this.error('Failed to store session:', error);
    }
  }
  
  /**
   * Get stored session
   */
  getStoredSession() {
    try {
      const stored = sessionStorage.getItem('aeronyx_ws_session');
      if (!stored) return null;
      
      const session = JSON.parse(stored);
      
      // Check if expired
      if (Date.now() > session.expiresAt) {
        this.clearStoredSession();
        return null;
      }
      
      // Check if wallet address matches
      if (session.walletAddress !== this.walletAddress) {
        return null;
      }
      
      return session;
    } catch (error) {
      this.error('Failed to get stored session:', error);
      return null;
    }
  }
  
  /**
   * Clear stored session
   */
  clearStoredSession() {
    try {
      sessionStorage.removeItem('aeronyx_ws_session');
    } catch (error) {
      this.error('Failed to clear session:', error);
    }
  }
  
  /**
   * Authenticate
   * @param {string} signature - Signature
   * @param {string} message - Original message
   */
  authenticate(signature, message) {
    return this.send({
      type: 'auth',
      wallet_address: this.walletAddress.toLowerCase(),
      signature: signature,
      message: message,
      wallet_type: 'ethereum'
    });
  }
  
  /**
   * Authenticate with session token
   * @param {string} token - Session token
   */
  authenticateWithToken(token) {
    return this.send({
      type: 'auth',
      session_token: token,
      wallet_address: this.walletAddress.toLowerCase()
    });
  }
  
  /**
   * Request signature message
   */
  requestSignatureMessage() {
    return this.send({
      type: 'get_message',
      wallet_address: this.walletAddress.toLowerCase()
    });
  }
  
  /**
   * Start monitoring
   */
  startMonitoring() {
    return this.send({
      type: 'start_monitor'
    });
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring() {
    return this.send({
      type: 'stop_monitor'
    });
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

// Export singleton
export default webSocketService;
