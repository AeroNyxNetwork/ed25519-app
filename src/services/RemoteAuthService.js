/**
 * ============================================
 * File: src/services/RemoteAuthService.js
 * ============================================
 * Remote Authentication Service - ENHANCED v3.0.0
 * 
 * Modification Reason: Add auto-reconnect and better error handling
 * - Added: Auto-retry on "Node not connected" errors
 * - Added: Exponential backoff retry strategy
 * - Added: Better state synchronization
 * - Improved: Event system with more events
 * - Fixed: Memory leak in event listeners
 * 
 * Main Functionality: Manage JWT tokens for remote management
 * Dependencies: webSocketService, nodeRegistrationService
 * 
 * Authentication Flow:
 * 1. Get signature from wallet (managed externally)
 * 2. Request JWT token from backend API
 * 3. Send remote_auth message via WebSocket
 * 4. Wait for remote_auth_success confirmation
 * 5. Cache token for reuse (59 minutes validity)
 * 6. Auto-retry on failures
 * 
 * ⚠️ Important Notes:
 * - JWT tokens are cached per node reference
 * - Tokens expire after 59 minutes (1 minute safety margin)
 * - Auto-retry up to 3 times on "Node not connected"
 * - Service is singleton to ensure single source of truth
 * - ALL existing APIs preserved for backward compatibility
 * 
 * Last Modified: v3.0.0 - Enhanced error handling and auto-retry
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
    this.authenticationPromises = new Map();
    this.authRetryCount = new Map(); // Track retry attempts per node
    
    // Authentication state cache for reactivity
    this.authStateCache = new Map();
    
    // Constants
    this.TOKEN_VALIDITY_MS = 59 * 60 * 1000; // 59 minutes
    this.AUTH_TIMEOUT_MS = 10000; // 10 seconds
    this.MAX_RETRY_ATTEMPTS = 3;
    this.RETRY_DELAYS = [1000, 3000, 5000]; // Exponential backoff
    
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
   * Events: 'authenticated', 'error', 'expired', 'retrying', 'reconnecting'
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
   */
  isAuthenticated(nodeReference) {
    const tokenData = this.tokens.get(nodeReference);
    if (!tokenData) {
      if (this.authStateCache.get(nodeReference) === true) {
        this.authStateCache.set(nodeReference, false);
        this.emit(nodeReference, 'expired', { nodeReference });
      }
      return false;
    }
    
    // Check if token is still valid
    if (Date.now() >= tokenData.expiresAt) {
      this.tokens.delete(nodeReference);
      if (this.authStateCache.get(nodeReference) !== false) {
        this.authStateCache.set(nodeReference, false);
        this.emit(nodeReference, 'expired', { nodeReference });
      }
      return false;
    }
    
    if (this.authStateCache.get(nodeReference) !== true) {
      this.authStateCache.set(nodeReference, true);
    }
    
    return true;
  }

  /**
   * Get stored token if valid
   */
  getToken(nodeReference) {
    if (!this.isAuthenticated(nodeReference)) {
      return null;
    }
    
    const tokenData = this.tokens.get(nodeReference);
    return tokenData ? tokenData.token : null;
  }

  /**
   * Get authentication state
   */
  getAuthState(nodeReference) {
    const tokenData = this.tokens.get(nodeReference);
    const isAuth = this.isAuthenticated(nodeReference);
    
    return {
      isAuthenticated: isAuth,
      hasToken: !!tokenData,
      expiresAt: tokenData?.expiresAt,
      remainingMs: tokenData ? tokenData.expiresAt - Date.now() : null,
      cached: this.authStateCache.get(nodeReference),
      retryCount: this.authRetryCount.get(nodeReference) || 0
    };
  }

  /**
   * Force refresh auth state check
   */
  refreshAuthState(nodeReference) {
    const isAuth = this.isAuthenticated(nodeReference);
    console.log(`[RemoteAuthService] Refreshed auth state for ${nodeReference}: ${isAuth}`);
    return isAuth;
  }

  /**
   * Main authentication method - ENHANCED with auto-retry
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
      const authPromise = this._performAuthenticationWithRetry({
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
   * Perform authentication with retry logic - NEW
   */
  async _performAuthenticationWithRetry(options) {
    const { nodeReference } = options;
    
    // Initialize retry count
    if (!this.authRetryCount.has(nodeReference)) {
      this.authRetryCount.set(nodeReference, 0);
    }
    
    const retryCount = this.authRetryCount.get(nodeReference);
    
    try {
      const result = await this._performAuthentication(options);
      
      // Success - reset retry count
      this.authRetryCount.set(nodeReference, 0);
      
      return result;
      
    } catch (error) {
      console.error('[RemoteAuthService] Auth attempt failed:', error.message);
      
      // Check if it's a "Node not connected" error and we can retry
      if (error.message.includes('not connected') && retryCount < this.MAX_RETRY_ATTEMPTS) {
        const delay = this.RETRY_DELAYS[retryCount] || this.RETRY_DELAYS[this.RETRY_DELAYS.length - 1];
        
        console.log(`[RemoteAuthService] Retrying in ${delay}ms (attempt ${retryCount + 1}/${this.MAX_RETRY_ATTEMPTS})`);
        
        this.authRetryCount.set(nodeReference, retryCount + 1);
        this.emit(nodeReference, 'retrying', { attempt: retryCount + 1, delay });
        
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this._performAuthenticationWithRetry(options);
      }
      
      // Max retries reached or other error
      this.authRetryCount.set(nodeReference, 0);
      throw error;
    }
  }

  /**
   * Internal authentication implementation - ENHANCED error messages
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
      throw new Error('WebSocket not authenticated. Please wait for connection.');
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
      throw new Error(tokenResponse.message || 'Failed to get JWT token from API');
    }

    const jwtToken = tokenResponse.data?.token;
    if (!jwtToken) {
      throw new Error('No JWT token received from API');
    }

    console.log('[RemoteAuthService] JWT token obtained, sending remote_auth...');

    // Step 3: Send remote_auth message via WebSocket
    const authResult = await this._sendRemoteAuth(jwtToken, nodeReference);

    if (!authResult.success) {
      // Enhanced error message
      let errorMsg = authResult.error || 'Remote authentication failed';
      
      if (errorMsg.includes('not connected')) {
        errorMsg = `Node ${nodeReference} is not connected. The node may be offline or experiencing network issues.`;
      }
      
      throw new Error(errorMsg);
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
    this.authRetryCount.set(nodeReference, 0); // Reset on success

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
   * Send remote_auth message and wait for response - ENHANCED error handling
   */
  async _sendRemoteAuth(jwtToken, nodeReference) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        webSocketService.off('message', handleMessage);
        resolve({
          success: false,
          error: 'Remote authentication timeout (10s). Please check node connection.'
        });
      }, this.AUTH_TIMEOUT_MS);

      const handleMessage = (message) => {
        // Check for success
        if (message.type === 'remote_auth_success') {
          clearTimeout(timeout);
          webSocketService.off('message', handleMessage);
          resolve({ success: true });
          return;
        }
        
        // Check for errors
        if (message.type === 'error') {
          const authErrorCodes = [
            'REMOTE_NOT_ENABLED',
            'INVALID_JWT',
            'REMOTE_AUTH_FAILED',
            'AUTH_FAILED',
            'INVALID_TOKEN'
          ];

          // Also check error messages
          const isAuthError = authErrorCodes.includes(message.code) ||
                            message.message?.includes('not connected') ||
                            message.message?.includes('not enabled');

          if (isAuthError) {
            clearTimeout(timeout);
            webSocketService.off('message', handleMessage);
            
            // Don't clear token yet - let retry logic handle it
            
            resolve({
              success: false,
              error: message.message || 'Remote authentication failed',
              code: message.code
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
          error: 'Failed to send authentication message. WebSocket may be disconnected.'
        });
      }
    });
  }

  /**
   * Schedule automatic token cleanup
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
   */
  clearToken(nodeReference) {
    this.tokens.delete(nodeReference);
    this.authStateCache.set(nodeReference, false);
    this.authRetryCount.delete(nodeReference);
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
    this.authRetryCount.clear();
    console.log('[RemoteAuthService] Cleared all tokens');
  }

  /**
   * Get token expiry time
   */
  getTokenExpiry(nodeReference) {
    const tokenData = this.tokens.get(nodeReference);
    if (!tokenData) return null;

    const remaining = tokenData.expiresAt - Date.now();
    return remaining > 0 ? remaining : null;
  }

  /**
   * Format remaining time for display
   */
  getFormattedExpiry(nodeReference) {
    const remaining = this.getTokenExpiry(nodeReference);
    if (!remaining) return null;

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Get retry count for a node - NEW
   */
  getRetryCount(nodeReference) {
    return this.authRetryCount.get(nodeReference) || 0;
  }

  /**
   * Check if currently retrying authentication - NEW
   */
  isRetrying(nodeReference) {
    return this.authenticationPromises.has(nodeReference) && 
           this.getRetryCount(nodeReference) > 0;
  }
}

// Export singleton instance
const remoteAuthService = new RemoteAuthService();

// Attach to window for debugging (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.remoteAuthService = remoteAuthService;
}

export default remoteAuthService;
