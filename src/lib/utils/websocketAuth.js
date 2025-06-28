/**
 * WebSocket Authentication Helper for AeroNyx Platform
 * 
 * File Path: src/lib/utils/websocketAuth.js
 * 
 * Centralizes WebSocket authentication logic with proper error handling
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 */

import { signMessage } from './walletSignature';
import nodeRegistrationService from '../api/nodeRegistration';

/**
 * WebSocket authentication states
 */
export const AuthState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  REQUESTING_MESSAGE: 'requesting_message',
  SIGNING: 'signing',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  ERROR: 'error'
};

/**
 * Handles WebSocket authentication flow
 * 
 * @class WebSocketAuthenticator
 */
export class WebSocketAuthenticator {
  constructor(wallet, wsUrl = 'wss://api.aeronyx.network/ws/aeronyx/user-monitor/') {
    this.wallet = wallet;
    this.wsUrl = wsUrl;
    this.ws = null;
    this.authState = AuthState.IDLE;
    this.cachedSignature = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emit event to listeners
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[WebSocketAuth] Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Connect and authenticate
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.wallet.connected || !this.wallet.address) {
      throw new Error('Wallet not connected');
    }

    return new Promise((resolve, reject) => {
      try {
        this.authState = AuthState.CONNECTING;
        this.emit('stateChange', this.authState);

        // Create WebSocket connection
        this.ws = new WebSocket(this.wsUrl);
        
        // Set up timeout
        const timeout = setTimeout(() => {
          this.disconnect();
          reject(new Error('Connection timeout'));
        }, 30000);

        this.ws.onopen = () => {
          console.log('[WebSocketAuth] Connected');
          clearTimeout(timeout);
          this.authState = AuthState.REQUESTING_MESSAGE;
          this.emit('stateChange', this.authState);
          this.emit('connected');
          
          // Request signature message
          this.send({
            type: 'get_message',
            wallet_address: this.wallet.address.toLowerCase()
          });
        };

        this.ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            await this.handleMessage(data, resolve, reject);
          } catch (error) {
            console.error('[WebSocketAuth] Message handling error:', error);
            this.emit('error', error);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error('[WebSocketAuth] WebSocket error:', error);
          this.authState = AuthState.ERROR;
          this.emit('stateChange', this.authState);
          this.emit('error', error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          clearTimeout(timeout);
          console.log('[WebSocketAuth] Disconnected:', event.code, event.reason);
          this.emit('disconnected', event);
          
          // Auto-reconnect for abnormal closures
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

      } catch (error) {
        this.authState = AuthState.ERROR;
        this.emit('stateChange', this.authState);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @private
   */
  async handleMessage(data, resolve, reject) {
    console.log('[WebSocketAuth] Received:', data.type);
    
    switch (data.type) {
      case 'signature_message':
        await this.handleSignatureMessage(data);
        break;
        
      case 'auth_success':
        this.handleAuthSuccess(data, resolve);
        break;
        
      case 'auth_failed':
      case 'error':
        this.handleAuthError(data, reject);
        break;
        
      default:
        // Pass through other messages
        this.emit('message', data);
    }
  }

  /**
   * Handle signature message
   * @private
   */
  async handleSignatureMessage(data) {
    this.authState = AuthState.SIGNING;
    this.emit('stateChange', this.authState);
    
    try {
      let signature, message;
      
      // Check if we have a cached signature for this message
      if (this.cachedSignature && this.cachedSignature.message === data.message) {
        console.log('[WebSocketAuth] Using cached signature');
        signature = this.cachedSignature.signature;
        message = this.cachedSignature.message;
      } else {
        console.log('[WebSocketAuth] Signing new message');
        signature = await signMessage(
          this.wallet.provider,
          data.message,
          this.wallet.address
        );
        message = data.message;
        
        // Cache the signature
        this.cachedSignature = { signature, message };
      }
      
      this.authState = AuthState.AUTHENTICATING;
      this.emit('stateChange', this.authState);
      
      // Send authentication
      this.send({
        type: 'auth',
        wallet_address: this.wallet.address.toLowerCase(),
        signature: signature,
        message: message,
        wallet_type: 'okx' // or detect wallet type
      });
      
    } catch (error) {
      console.error('[WebSocketAuth] Signing error:', error);
      this.authState = AuthState.ERROR;
      this.emit('stateChange', this.authState);
      this.emit('error', new Error('Failed to sign authentication message'));
      
      // Try to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Handle authentication success
   * @private
   */
  handleAuthSuccess(data, resolve) {
    console.log('[WebSocketAuth] Authentication successful');
    this.authState = AuthState.AUTHENTICATED;
    this.reconnectAttempts = 0; // Reset reconnect attempts
    this.emit('stateChange', this.authState);
    this.emit('authenticated', data);
    
    if (resolve) {
      resolve(data);
    }
  }

  /**
   * Handle authentication error
   * @private
   */
  handleAuthError(data, reject) {
    console.error('[WebSocketAuth] Authentication failed:', data);
    this.authState = AuthState.ERROR;
    this.emit('stateChange', this.authState);
    
    const error = new Error(data.message || 'Authentication failed');
    error.code = data.error_code;
    
    this.emit('error', error);
    
    if (reject) {
      reject(error);
    }
    
    // Retry authentication if it's a recoverable error
    if (data.error_code === 'authentication_required' || data.error_code === 'invalid_signature') {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        // Clear cached signature and retry
        this.cachedSignature = null;
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Send data through WebSocket
   * @param {Object} data - Data to send
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[WebSocketAuth] Cannot send - WebSocket not open');
    }
  }

  /**
   * Schedule reconnection attempt
   * @private
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
    
    console.log(`[WebSocketAuth] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('[WebSocketAuth] Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
    }
    this.authState = AuthState.IDLE;
    this.emit('stateChange', this.authState);
  }

  /**
   * Get current authentication state
   * @returns {string} Current auth state
   */
  getState() {
    return this.authState;
  }

  /**
   * Check if authenticated
   * @returns {boolean} Is authenticated
   */
  isAuthenticated() {
    return this.authState === AuthState.AUTHENTICATED;
  }

  /**
   * Pre-fetch signature for faster authentication
   * Useful to call before WebSocket connection
   */
  async prefetchSignature() {
    if (!this.wallet.connected || !this.wallet.address) {
      return null;
    }

    try {
      // Get signature message from REST API
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(this.wallet.address);
      
      if (messageResponse.success && messageResponse.data) {
        const signature = await signMessage(
          this.wallet.provider,
          messageResponse.data.message,
          this.wallet.address
        );
        
        // Cache the signature
        this.cachedSignature = {
          signature,
          message: messageResponse.data.message
        };
        
        return this.cachedSignature;
      }
    } catch (error) {
      console.error('[WebSocketAuth] Prefetch signature error:', error);
    }
    
    return null;
  }
}

/**
 * Create a WebSocket connection with authentication
 * 
 * @param {Object} wallet - Wallet object
 * @param {Object} options - Connection options
 * @returns {Promise<WebSocket>} Authenticated WebSocket connection
 */
export async function createAuthenticatedWebSocket(wallet, options = {}) {
  const authenticator = new WebSocketAuthenticator(wallet, options.url);
  
  // Set up event forwarding
  if (options.onStateChange) {
    authenticator.on('stateChange', options.onStateChange);
  }
  
  if (options.onError) {
    authenticator.on('error', options.onError);
  }
  
  if (options.onMessage) {
    authenticator.on('message', options.onMessage);
  }
  
  // Prefetch signature if requested
  if (options.prefetchSignature) {
    await authenticator.prefetchSignature();
  }
  
  // Connect and authenticate
  await authenticator.connect();
  
  return authenticator;
}

// Export default instance factory
export default {
  create: (wallet, options) => new WebSocketAuthenticator(wallet, options),
  createAuthenticated: createAuthenticatedWebSocket,
  AuthState
};
