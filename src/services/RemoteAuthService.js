/**
 * ============================================
 * File: src/services/RemoteAuthService.js
 * ============================================
 * Centralized Remote Authentication Service
 * 
 * Purpose: Single source of truth for JWT authentication
 * Main Functionality: Manage JWT tokens for remote management
 * Dependencies: webSocketService, nodeRegistrationService
 * 
 * Authentication Flow:
 * 1. Get signature from wallet (managed externally)
 * 2. Request JWT token from backend API
 * 3. Send remote_auth message via WebSocket
 * 4. Wait for remote_auth_success confirmation
 * 5. Cache token for reuse (59 minutes validity)
 * 
 * ⚠️ Important Notes:
 * - JWT tokens are cached per node reference
 * - Tokens expire after 59 minutes (1 minute safety margin)
 * - WebSocket must be authenticated before remote auth
 * - Service is singleton to ensure single source of truth
 * - FIXED: Added EventEmitter functionality for event handling
 * 
 * Last Modified: v2.0.0 - Added EventEmitter support
 * ============================================
 */

import webSocketService from './WebSocketService';
import nodeRegistrationService from '../lib/api/nodeRegistration';

class RemoteAuthService {
  constructor() {
    // Token storage - indexed by node reference
    this.tokens = new Map();
    
    // Event listeners - Map<nodeReference, Map<eventName, Set<handler>>>
    this.listeners = new Map();
    
    // Authentication state
    this.isAuthenticating = false;
    this.authenticationPromises = new Map();
    
    // Authentication state cache for reactivity
    this.authStateCache = new Map();
    
    // Constants
    this.TOKEN_VALIDITY_MS = 59 * 60 * 1000; // 59 minutes
    this.AUTH_TIMEOUT_MS = 10000; // 10 seconds
    
    // Bind methods
    this.authenticate = this.authenticate.bind(this);
    this.isAuthenticated = this.isAuthenticated.bind(this);
    this.clearToken = this.clearToken.bind(this);
    this.clearAllTokens = this.clearAllTokens.bind(this);
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
    this.emit = this.emit.bind(this);
  }

  /**
   * Add event listener for a specific node
   * @param {string} nodeReference - Node reference code
   * @param {string} eventName - Event name ('authenticated', 'error', 'expired')
   * @param {Function} handler - Event handler function
   */
  on(nodeReference, eventName, handler) {
    if (!this.listeners.has(nodeReference)) {
      this.listeners.set(nodeReference, new Map());
    }
    
    const nodeListeners = this.listeners.get(nodeReference);
    
    if (!nodeListeners.has(eventName)) {
      nodeListeners.set(eventName, new Set());
    }
    
    nodeListeners.get(eventName).add(handler);
    
    console.log(`[RemoteAuthService] Added ${eventName} listener for node ${nodeReference}`);
  }

  /**
   * Remove event listener for a specific node
   * @param {string} nodeReference - Node reference code
   * @param {string} eventName - Event name
   * @param {Function} handler - Event handler function
   */
  off(nodeReference, eventName, handler) {
    const nodeListeners = this.listeners.get(nodeReference);
    if (!nodeListeners) return;
    
    const eventHandlers = nodeListeners.get(eventName);
    if (!eventHandlers) return;
    
    eventHandlers.delete(handler);
    
    // Clean up empty structures
    if (eventHandlers.size === 0) {
      nodeListeners.delete(eventName);
    }
    
    if (nodeListeners.size === 0) {
      this.listeners.delete(nodeReference);
    }
    
    console.log(`[RemoteAuthService] Removed ${eventName} listener for node ${nodeReference}`);
  }

  /**
   * Emit event for a specific node
   * @param {string} nodeReference - Node reference code
   * @param {string} eventName - Event name
   * @param {any} data - Event data
   */
  emit(nodeReference, eventName, data) {
    const nodeListeners = this.listeners.get(nodeReference);
    if (!nodeListeners) return;
    
    const eventHandlers = nodeListeners.get(eventName);
    if (!eventHandlers) return;
    
    console.log(`[RemoteAuthService] Emitting ${eventName} for node ${nodeReference}`, data);
    
    eventHandlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`[RemoteAuthService] Error in ${eventName} handler:`, error);
      }
    });
  }

  /**
   * Check if a valid token exists for a node
   * @param {string} nodeReference - Node reference code
   * @returns {boolean} True if valid token exists
   */
  isAuthenticated(nodeReference) {
    const tokenData = this.tokens.get(nodeReference);
    if (!tokenData) {
      // Update cache if changed
      if (this.authStateCache.get(nodeReference) === true) {
        this.authStateCache.set(nodeReference, false);
        this.emit(nodeReference, 'expired', { nodeReference });
      }
      return false;
    }
    
    // Check if token is still valid
    if (Date.now() >= tokenData.expiresAt) {
      this.tokens.delete(nodeReference);
      // Update cache and emit event
      if (this.authStateCache.get(nodeReference) !== false) {
        this.authStateCache.set(nodeReference, false);
        this.emit(nodeReference, 'expired', { nodeReference });
      }
      return false;
    }
    
    // Update cache if changed
    if (this.authStateCache.get(nodeReference) !== true) {
      this.authStateCache.set(nodeReference, true);
    }
    
    return true;
  }

  /**
   * Get stored token if valid
   * @param {string} nodeReference - Node reference code
   * @returns {string|null} JWT token or null
   */
  getToken(nodeReference) {
    if (!this.isAuthenticated(nodeReference)) {
      return null;
    }
    
    const tokenData = this.tokens.get(nodeReference);
    return tokenData ? tokenData.token : null;
  }

  /**
   * Get authentication state (for debugging)
   * @param {string} nodeReference - Node reference code
   * @returns {Object} Authentication state details
   */
  getAuthState(nodeReference) {
    const tokenData = this.tokens.get(nodeReference);
    const isAuth = this.isAuthenticated(nodeReference);
    
    return {
      isAuthenticated: isAuth,
      hasToken: !!tokenData,
      expiresAt: tokenData?.expiresAt,
      remainingMs: tokenData ? tokenData.expiresAt - Date.now() : null,
      cached: this.authStateCache.get(nodeReference)
    };
  }

  /**
   * Force refresh auth state check
   * @param {string} nodeReference - Node reference code
   * @returns {boolean} Current auth state
   */
  refreshAuthState(nodeReference) {
    const isAuth = this.isAuthenticated(nodeReference);
    console.log(`[RemoteAuthService] Refreshed auth state for ${nodeReference}: ${isAuth}`);
    return isAuth;
  }

  /**
   * Main authentication method
   * @param {Object} options - Authentication options
   * @param {string} options.nodeReference - Node reference code
   * @param {string} options.walletAddress - Wallet address
   * @param {string} options.signature - Wallet signature
   * @param {string} options.message - Signed message
   * @param {string} options.walletType - Wallet type (default: 'okx')
   * @returns {Promise<{success: boolean, token?: string, error?: string}>}
   */
  async authenticate(options) {
    const {
      nodeReference,
      walletAddress,
      signature,
      message,
      walletType = 'okx'
    } = options;

    try {
      // Validate inputs
      if (!nodeReference || !walletAddress || !signature || !message) {
        const error = new Error('Missing required authentication parameters');
        this.emit(nodeReference, 'error', error);
        throw error;
      }

      // Check if already authenticated
      if (this.isAuthenticated(nodeReference)) {
        console.log('[RemoteAuthService] Already authenticated for node:', nodeReference);
        this.emit(nodeReference, 'authenticated', { nodeReference });
        return {
          success: true,
          token: this.getToken(nodeReference)
        };
      }

      // Check if authentication is already in progress for this node
      if (this.authenticationPromises.has(nodeReference)) {
        console.log('[RemoteAuthService] Authentication already in progress for node:', nodeReference);
        return await this.authenticationPromises.get(nodeReference);
      }

      // Create authentication promise
      const authPromise = this._performAuthentication({
        nodeReference,
        walletAddress,
        signature,
        message,
        walletType
      });

      // Store promise to prevent duplicate requests
      this.authenticationPromises.set(nodeReference, authPromise);

      try {
        const result = await authPromise;
        return result;
      } finally {
        // Clean up promise
        this.authenticationPromises.delete(nodeReference);
      }

    } catch (error) {
      console.error('[RemoteAuthService] Authentication failed:', error);
      this.emit(nodeReference, 'error', error);
      return {
        success: false,
        error: error.message || 'Authentication failed'
      };
    }
  }

  /**
   * Internal authentication implementation
   * @private
   */
  async _performAuthentication(options) {
    const {
      nodeReference,
      walletAddress,
      signature,
      message,
      walletType
    } = options;

    console.log('[RemoteAuthService] Starting authentication for node:', nodeReference);

    // Step 1: Check WebSocket is ready
    if (!webSocketService.isConnected || !webSocketService.isAuthenticated) {
      const error = new Error('WebSocket not authenticated. Please wait for connection.');
      this.emit(nodeReference, 'error', error);
      throw error;
    }

    // Step 2: Get JWT token from API
    console.log('[RemoteAuthService] Requesting JWT token from API...');
    
    const tokenResponse = await nodeRegistrationService.generateRemoteManagementToken(
      walletAddress,
      signature,
      message,
      walletType,
      nodeReference,
      60 // 60 minutes validity
    );

    if (!tokenResponse.success) {
      const error = new Error(tokenResponse.message || 'Failed to get JWT token from API');
      this.emit(nodeReference, 'error', error);
      throw error;
    }

    const jwtToken = tokenResponse.data?.token;
    if (!jwtToken) {
      const error = new Error('No JWT token received from API');
      this.emit(nodeReference, 'error', error);
      throw error;
    }

    console.log('[RemoteAuthService] JWT token obtained, sending remote_auth...');

    // Step 3: Send remote_auth message via WebSocket
    const authResult = await this._sendRemoteAuth(jwtToken, nodeReference);

    if (!authResult.success) {
      const error = new Error(authResult.error || 'Remote authentication failed');
      this.emit(nodeReference, 'error', error);
      throw error;
    }

    // Step 4: Store token with expiry
    const tokenData = {
      token: jwtToken,
      nodeReference,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.TOKEN_VALIDITY_MS
    };

    this.tokens.set(nodeReference, tokenData);
    this.authStateCache.set(nodeReference, true);

    console.log('[RemoteAuthService] Authentication successful for node:', nodeReference);

    // Emit success event
    this.emit(nodeReference, 'authenticated', { nodeReference, token: jwtToken });

    // Schedule token cleanup
    this._scheduleTokenCleanup(nodeReference, this.TOKEN_VALIDITY_MS);

    return {
      success: true,
      token: jwtToken
    };
  }

  /**
   * Send remote_auth message and wait for response
   * @private
   */
  async _sendRemoteAuth(jwtToken, nodeReference) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        webSocketService.off('message', handleMessage);
        resolve({
          success: false,
          error: 'Remote authentication timeout'
        });
      }, this.AUTH_TIMEOUT_MS);

      const handleMessage = (message) => {
        // Check if this message is for our authentication
        if (message.type === 'remote_auth_success') {
          clearTimeout(timeout);
          webSocketService.off('message', handleMessage);
          resolve({ success: true });
        } else if (message.type === 'error') {
          // Check for auth-related errors
          const authErrorCodes = [
            'REMOTE_NOT_ENABLED',
            'INVALID_JWT',
            'REMOTE_AUTH_FAILED',
            'AUTH_FAILED',
            'INVALID_TOKEN'
          ];

          if (authErrorCodes.includes(message.code)) {
            clearTimeout(timeout);
            webSocketService.off('message', handleMessage);
            
            // Clear stored token on auth failure
            this.clearToken(nodeReference);
            
            resolve({
              success: false,
              error: message.message || 'Remote authentication failed'
            });
          }
        }
      };

      // Listen for response
      webSocketService.on('message', handleMessage);

      // Send authentication message
      const sent = webSocketService.send({
        type: 'remote_auth',
        jwt_token: jwtToken
      });

      if (!sent) {
        clearTimeout(timeout);
        webSocketService.off('message', handleMessage);
        resolve({
          success: false,
          error: 'Failed to send authentication message'
        });
      }
    });
  }

  /**
   * Schedule automatic token cleanup
   * @private
   */
  _scheduleTokenCleanup(nodeReference, delay) {
    setTimeout(() => {
      const tokenData = this.tokens.get(nodeReference);
      if (tokenData && Date.now() >= tokenData.expiresAt) {
        console.log('[RemoteAuthService] Token expired for node:', nodeReference);
        this.tokens.delete(nodeReference);
        this.authStateCache.set(nodeReference, false);
        this.emit(nodeReference, 'expired', { nodeReference });
      }
    }, delay);
  }

  /**
   * Clear token for specific node
   * @param {string} nodeReference - Node reference code
   */
  clearToken(nodeReference) {
    this.tokens.delete(nodeReference);
    this.authStateCache.set(nodeReference, false);
    console.log('[RemoteAuthService] Cleared token for node:', nodeReference);
    this.emit(nodeReference, 'expired', { nodeReference, manual: true });
  }

  /**
   * Clear all stored tokens
   */
  clearAllTokens() {
    // Emit expired events for all nodes
    this.tokens.forEach((_, nodeReference) => {
      this.emit(nodeReference, 'expired', { nodeReference, manual: true });
    });
    
    this.tokens.clear();
    this.authenticationPromises.clear();
    this.authStateCache.clear();
    console.log('[RemoteAuthService] Cleared all tokens');
  }

  /**
   * Get token expiry time
   * @param {string} nodeReference - Node reference code
   * @returns {number|null} Milliseconds until expiry or null
   */
  getTokenExpiry(nodeReference) {
    const tokenData = this.tokens.get(nodeReference);
    if (!tokenData) return null;

    const remaining = tokenData.expiresAt - Date.now();
    return remaining > 0 ? remaining : null;
  }

  /**
   * Format remaining time for display
   * @param {string} nodeReference - Node reference code
   * @returns {string} Formatted time string
   */
  getFormattedExpiry(nodeReference) {
    const remaining = this.getTokenExpiry(nodeReference);
    if (!remaining) return 'Expired';

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }
}

// Export singleton instance
const remoteAuthService = new RemoteAuthService();

// Attach to window for debugging (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.remoteAuthService = remoteAuthService;
}

export default remoteAuthService;
