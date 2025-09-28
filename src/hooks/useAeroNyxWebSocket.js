/**
 * ============================================
 * File: src/hooks/useAeroNyxWebSocket.js
 * ============================================
 * UPDATED VERSION - Integrates with new WebSocket Service
 * Changes:
 * 1. Added integration with centralized WebSocketService
 * 2. Sync WebSocket instance with the service layer
 * 3. Share authentication state with terminal system
 * 4. IMPROVED: Better timeout and retry logic for production stability
 * ============================================
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import nodeRegistrationService from '../lib/api/nodeRegistration';

// Import the new WebSocket service for integration
import webSocketService from '../services/WebSocketService';

// Global setter functions (previously from useRemoteManagement)
// These are now defined locally since RemoteManagement uses the service directly
let setGlobalWebSocket = null;
let setGlobalWsState = null;

/**
 * WebSocket connection states
 */
const WsState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  REQUESTING_MESSAGE: 'requesting_message',
  SIGNING: 'signing',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  MONITORING: 'monitoring',
  ERROR: 'error'
};

// Session storage keys
const SESSION_STORAGE_KEY = 'aeronyx_ws_session';
const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

// Connection configuration
const CONNECTION_CONFIG = {
  CONNECTION_TIMEOUT: 10000,     // 10 seconds for initial connection
  PING_INTERVAL: 15000,          // Send ping every 15 seconds
  PONG_TIMEOUT: 35000,           // Consider dead if no pong for 35 seconds
  QUICK_RETRY_COUNT: 3,          // Number of quick retries
  QUICK_RETRY_DELAY: 1000,       // 1 second for quick retries
  NORMAL_RETRY_DELAY: 5000,      // 5 seconds for normal retries
  SLOW_RETRY_DELAY: 15000,       // 15 seconds for slow retries
  SLOW_RETRY_THRESHOLD: 10,     // After 10 attempts, use slow retry
  AUTH_RETRY_DELAY: 1000,        // 1 second for auth retries
  MAX_CONSECUTIVE_FAILURES: 100  // Max consecutive failures before giving up (optional)
};

// Singleton WebSocket instance and state
let globalWebSocketInstance = null;
let globalListeners = new Set();
let globalState = {
  wsState: {
    connected: false,
    authenticated: false,
    monitoring: false,
    authState: 'idle',
    error: null
  },
  data: {
    nodes: [],
    stats: {
      totalNodes: 0,
      activeNodes: 0,
      offlineNodes: 0,
      totalEarnings: 0,
      resourceUtilization: 0
    },
    lastUpdate: null
  }
};

/**
 * WebSocket Manager Class (Singleton)
 */
class WebSocketManager {
  constructor() {
    this.ws = null;
    this.reconnectTimeout = null;
    this.connectionTimeout = null;
    this.pingInterval = null;
    this.reconnectAttempts = 0;
    this.consecutiveFailures = 0;
    this.lastPong = Date.now();
    this.sessionToken = null;
    this.isConnecting = false;
    this.walletAddress = null;
    this.walletProvider = null;
    this.authenticationInProgress = false;
    this.signatureNonce = null;
    this.shouldReconnect = true; // Flag to control reconnection
  }

  /**
   * Sync with centralized WebSocket service
   * This is the KEY integration point with the new terminal system
   */
  syncWithService() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Update the centralized service with current connection
      webSocketService.ws = this.ws;
      webSocketService.walletAddress = this.walletAddress;
      webSocketService.walletProvider = this.walletProvider;
      webSocketService.isConnected = true;
      webSocketService.isAuthenticated = this.sessionToken ? true : false;
      webSocketService.sessionToken = this.sessionToken;
      
      // Sync state
      webSocketService.updateState({
        connected: true,
        authenticated: this.sessionToken ? true : false,
        monitoring: globalState.wsState.monitoring
      });
      
      console.log('[WebSocketManager] Synced with centralized WebSocket service');
    }
  }

  /**
   * Get stored session if valid
   */
  getStoredSession(walletAddress) {
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) return null;
      
      const session = JSON.parse(stored);
      
      // Check if session is for current wallet
      if (session.wallet_address !== walletAddress.toLowerCase()) {
        return null;
      }
      
      // Check if session is expired
      if (Date.now() > session.expires_at) {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
      }
      
      console.log('[WebSocketManager] Found valid stored session');
      return session;
    } catch (error) {
      console.error('[WebSocketManager] Error reading stored session:', error);
      return null;
    }
  }

  /**
   * Store session for reuse
   */
  storeSession(walletAddress, sessionToken) {
    try {
      const session = {
        wallet_address: walletAddress.toLowerCase(),
        session_token: sessionToken,
        created_at: Date.now(),
        expires_at: Date.now() + SESSION_DURATION
      };
      
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      
      // Also store in centralized service
      webSocketService.storeSession(sessionToken);
      
      console.log('[WebSocketManager] Session stored for 30 minutes');
    } catch (error) {
      console.error('[WebSocketManager] Error storing session:', error);
    }
  }

  /**
   * Update global state and notify listeners
   * CRITICAL: Also share state with RemoteManagement and WebSocketService
   */
  updateState(updates) {
    if (updates.wsState) {
      globalState.wsState = { ...globalState.wsState, ...updates.wsState };
      
      // Share WebSocket state globally if setter is available
      // (RemoteManagement now uses the service directly, so this is optional)
      if (setGlobalWsState && typeof setGlobalWsState === 'function') {
        setGlobalWsState(globalState.wsState);
      }
      
      // Sync with centralized service
      if (webSocketService) {
        webSocketService.updateState(globalState.wsState);
      }
    }
    
    if (updates.data) {
      globalState.data = { ...globalState.data, ...updates.data };
      
      // Update nodes in centralized service
      if (updates.data.nodes && webSocketService) {
        webSocketService.emit('statusUpdate', { nodes: updates.data.nodes });
      }
    }
    
    // Notify all listeners
    globalListeners.forEach(listener => {
      listener({ ...globalState });
    });
  }

  /**
   * Send message through WebSocket
   */
  sendMessage(messageData) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocketManager] Sending message:', messageData.type);
      this.ws.send(JSON.stringify(messageData));
      
      // Also send through centralized service if it's a terminal message
      if (messageData.type && messageData.type.startsWith('term_')) {
        webSocketService.send(messageData);
      }
      
      return true;
    }
    console.warn('[WebSocketManager] Cannot send message - WebSocket not open');
    return false;
  }

  /**
   * Setup ping interval - only after authentication
   * IMPROVED: More responsive ping/pong detection
   */
  setupPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && globalState.wsState.authenticated) {
        const timeSinceLastPong = Date.now() - this.lastPong;
        
        // Check if connection seems dead (no pong received in time)
        if (timeSinceLastPong > CONNECTION_CONFIG.PONG_TIMEOUT) {
          console.warn(`[WebSocketManager] No pong received for ${CONNECTION_CONFIG.PONG_TIMEOUT/1000} seconds, reconnecting`);
          this.reconnect();
          return;
        }

        // Send ping
        this.sendMessage({ 
          type: 'ping',
          echo: Date.now()
        });
      }
    }, CONNECTION_CONFIG.PING_INTERVAL);
  }

  /**
   * Sign message with wallet
   */
  async signMessage(message) {
    console.log('[WebSocketManager] Signing message for wallet:', this.walletAddress);
    
    try {
      // Extract wallet from message
      const walletMatch = message.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/);
      const messageWallet = walletMatch ? walletMatch[1] : this.walletAddress;
      
      // For OKX wallet or Ethereum wallets
      if (window.okxwallet || window.ethereum) {
        const provider = window.okxwallet || window.ethereum;
        
        // Request accounts if needed
        let accounts = await provider.request({ method: 'eth_accounts' });
        if (!accounts || accounts.length === 0) {
          console.log('[WebSocketManager] No accounts found, requesting access...');
          accounts = await provider.request({ method: 'eth_requestAccounts' });
          if (!accounts || accounts.length === 0) {
            throw new Error('No accounts available after request');
          }
        }
        
        const accountToUse = accounts.find(acc => 
          acc.toLowerCase() === messageWallet.toLowerCase()
        ) || accounts[0];
        
        console.log('[WebSocketManager] Signing with account:', accountToUse);
        
        // Make sure wallet address matches
        if (accountToUse.toLowerCase() !== this.walletAddress.toLowerCase()) {
          console.warn('[WebSocketManager] Account mismatch, updating wallet address');
          this.walletAddress = accountToUse;
        }
        
        const signature = await provider.request({
          method: 'personal_sign',
          params: [message, accountToUse]
        });
        
        return {
          signature: signature.startsWith('0x') ? signature : `0x${signature}`,
          message: message,
          wallet: accountToUse
        };
      }
      
      // For other wallet providers
      if (this.walletProvider) {
        const signature = await this.walletProvider.request({
          method: 'personal_sign',
          params: [message, messageWallet]
        });
        
        return {
          signature: signature.startsWith('0x') ? signature : `0x${signature}`,
          message: message,
          wallet: messageWallet
        };
      }
      
      throw new Error('No wallet provider available');
    } catch (error) {
      console.error('[WebSocketManager] Sign error:', error);
      
      // If user rejected, clear auth state
      if (error.code === 4001 || error.message?.includes('rejected')) {
        this.authenticationInProgress = false;
        this.updateState({ 
          wsState: { 
            authState: 'error', 
            error: 'User rejected signature request' 
          }
        });
      }
      
      throw error;
    }
  }

  /**
   * Start authentication flow
   * 
   * ⚠️ CRITICAL: Auth message format MUST match backend expectations:
   * - Use 'message' field, NOT 'signature_message'
   * - Use 'ethereum' as wallet_type
   */
  async startAuthentication() {
    if (this.authenticationInProgress) {
      console.log('[WebSocketManager] Authentication already in progress');
      return;
    }

    // Check if we have wallet information
    if (!this.walletAddress || !this.walletProvider) {
      console.error('[WebSocketManager] Cannot authenticate - wallet not ready');
      this.updateState({ 
        wsState: { 
          authState: 'error', 
          error: 'Wallet not connected' 
        }
      });
      return;
    }

    this.authenticationInProgress = true;

    // Check for stored session first
    const storedSession = this.getStoredSession(this.walletAddress);
    if (storedSession) {
      console.log('[WebSocketManager] Using stored session token');
      this.sendMessage({
        type: 'auth',
        session_token: storedSession.session_token,
        wallet_address: this.walletAddress.toLowerCase()
      });
      this.updateState({ wsState: { authState: 'authenticating' }});
    } else {
      // Request signature message from WebSocket server
      console.log('[WebSocketManager] Requesting signature message from server');
      this.updateState({ wsState: { authState: 'requesting_message' }});
      
      // Server expects get_message after connection
      this.sendMessage({
        type: 'get_message',
        wallet_address: this.walletAddress.toLowerCase()
      });
    }
  }

  /**
   * Handle WebSocket messages
   * ⚠️ CRITICAL: Must forward ALL messages to listeners, including terminal messages
   */
  async handleMessage(event) {
    try {
      const messageData = JSON.parse(event.data);
      console.log('[WebSocketManager] Received:', messageData.type, messageData);
      
      // ⚠️ CRITICAL: Forward message to centralized service for terminal handling
      if (messageData.type && messageData.type.startsWith('term_')) {
        // Emit through centralized service
        switch (messageData.type) {
          case 'term_ready':
            webSocketService.emit('terminalReady', messageData);
            break;
          case 'term_output':
            webSocketService.emit('terminalOutput', messageData);
            break;
          case 'term_error':
            webSocketService.emit('terminalError', messageData);
            break;
          case 'term_closed':
            webSocketService.emit('terminalClosed', messageData);
            break;
        }
      }
      
      // Forward message to all listeners
      globalListeners.forEach(listener => {
        if (listener.onMessage) {
          try {
            listener.onMessage(messageData);
          } catch (err) {
            console.error('[WebSocketManager] Listener error:', err);
          }
        }
      });
      
      // Then handle known message types
      switch (messageData.type) {
        case 'connected':
          // WebSocket connected, need to authenticate
          console.log('[WebSocketManager] Server confirmed connection, starting authentication');
          this.updateState({ wsState: { connected: true, authState: 'connected' }});
          
          // Reset failure counter on successful connection
          this.consecutiveFailures = 0;
          
          // Sync with service
          this.syncWithService();
          
          // CRITICAL: Start authentication immediately
          // Don't wait - server expects auth right after connection
          if (!this.authenticationInProgress) {
            this.startAuthentication();
          }
          break;
          
        case 'signature_message':
          // Server sent us a message to sign
          console.log('[WebSocketManager] Received signature message from server');
          
          if (messageData.nonce) {
            this.signatureNonce = messageData.nonce;
          }
          
          this.updateState({ wsState: { authState: 'signing' }});
          
          try {
            const signedData = await this.signMessage(messageData.message);
            
            this.updateState({ wsState: { authState: 'authenticating' }});
            
            // ⚠️ CRITICAL: Send authentication with EXACT format backend expects
            // DO NOT CHANGE without backend coordination
            this.sendMessage({
              type: 'auth',
              wallet_address: signedData.wallet.toLowerCase(),
              signature: signedData.signature,
              message: signedData.message,        // ✅ CORRECT: use 'message' NOT 'signature_message'
              wallet_type: 'ethereum'              // ✅ CORRECT: use 'ethereum' for compatibility
            });
            
          } catch (error) {
            console.error('[WebSocketManager] Signing error:', error);
            this.authenticationInProgress = false;
            this.updateState({ 
              wsState: { 
                authState: 'error', 
                error: 'Failed to sign message: ' + error.message 
              }
            });
          }
          break;
          
        case 'auth_success':
          // Authentication successful
          console.log('[WebSocketManager] Authentication successful');
          
          this.authenticationInProgress = false;
          
          if (messageData.session_token) {
            this.sessionToken = messageData.session_token;
            this.storeSession(this.walletAddress, messageData.session_token);
          }
          
          this.updateState({ 
            wsState: { 
              authenticated: true, 
              authState: 'authenticated',
              error: null
            }
          });
          
          // Sync with service after auth
          this.syncWithService();
          
          // Setup ping interval now that we're authenticated
          this.setupPingInterval();
          
          // Process initial nodes if provided
          if (messageData.nodes) {
            this.processNodesData({ nodes: messageData.nodes });
          }
          
          // Start monitoring
          console.log('[WebSocketManager] Starting monitoring');
          this.sendMessage({ type: 'start_monitor' });
          break;
          
        case 'monitor_started':
          console.log('[WebSocketManager] Monitoring started');
          this.updateState({ wsState: { monitoring: true }});
          
          // Sync with service
          this.syncWithService();
          break;
          
        case 'status_update':
          // Update nodes data
          this.processNodesData(messageData);
          break;
          
        case 'error':
          console.error('[WebSocketManager] Server error:', messageData.message);
          
          // Handle specific error codes
          if (messageData.code === 'SESSION_INVALID' || 
              messageData.code === 'SESSION_EXPIRED' ||
              messageData.code === 'NONCE_NOT_FOUND' ||
              messageData.message === 'Invalid or expired session token') {
            
            // Clear stored session and retry with signature
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            this.sessionToken = null;
            this.authenticationInProgress = false;
            
            // Clear in centralized service too
            webSocketService.clearStoredSession();
            
            // Retry authentication with signature quickly
            console.log('[WebSocketManager] Session invalid, retrying authentication');
            setTimeout(() => {
              this.startAuthentication();
            }, CONNECTION_CONFIG.AUTH_RETRY_DELAY);
            
          } else if (messageData.message === 'Not authenticated') {
            // If we get "Not authenticated" and we're not in auth flow, start it
            if (!this.authenticationInProgress) {
              console.log('[WebSocketManager] Not authenticated, starting auth flow');
              this.startAuthentication();
            }
          } else if (messageData.message === 'Internal error') {
            // Server internal error - retry with standard delay
            console.log('[WebSocketManager] Server internal error, retrying');
            this.authenticationInProgress = false;
            setTimeout(() => {
              this.startAuthentication();
            }, CONNECTION_CONFIG.AUTH_RETRY_DELAY);
          } else {
            // Other errors
            this.authenticationInProgress = false;
            this.updateState({ 
              wsState: { 
                error: messageData.message || 'Server error',
                authState: 'error'
              }
            });
          }
          break;
          
        case 'pong':
          this.lastPong = Date.now();
          console.log('[WebSocketManager] Pong received');
          break;
          
        case 'heartbeat_ack':
          // Handle heartbeat acknowledgment
          this.lastPong = Date.now();
          console.log('[WebSocketManager] Heartbeat acknowledged');
          break;
          
        default:
          // Unknown message type - still forwarded to listeners above
          console.log('[WebSocketManager] Unknown message type:', messageData.type);
          break;
      }
      
    } catch (error) {
      console.error('[WebSocketManager] Message handling error:', error);
    }
  }

  /**
   * Process nodes data
   */
  processNodesData(wsData) {
    if (!wsData || !wsData.nodes || !Array.isArray(wsData.nodes)) {
      return;
    }
    
    const nodes = wsData.nodes;
    
    const stats = {
      totalNodes: nodes.length,
      activeNodes: nodes.filter(n => n.status === 'active' || n.status === 'online').length,
      offlineNodes: nodes.filter(n => n.status === 'offline').length,
      totalEarnings: nodes.reduce((sum, n) => sum + parseFloat(n.total_earnings || n.earnings || 0), 0),
      resourceUtilization: this.calculateResourceUtilization(nodes)
    };
    
    this.updateState({
      data: {
        nodes: nodes,
        stats: stats,
        lastUpdate: new Date()
      }
    });
  }

  /**
   * Calculate resource utilization
   */
  calculateResourceUtilization(nodes) {
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;
    
    const activeNodes = nodes.filter(n => n.status === 'active' || n.status === 'online');
    if (activeNodes.length === 0) return 0;
    
    const totalUtil = activeNodes.reduce((sum, node) => {
      const cpu = node.performance?.cpu || 0;
      const memory = node.performance?.memory || 0;
      return sum + ((cpu + memory) / 2);
    }, 0);
    
    return Math.round(totalUtil / activeNodes.length);
  }

  /**
   * Connect to WebSocket
   * CRITICAL: Must share WebSocket instance with RemoteManagement and WebSocketService
   */
  async connect(wallet) {
    // Check if already connected and authenticated
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocketManager] Already connected');
      
      // Still share the existing WebSocket
      if (typeof setGlobalWebSocket === 'function') {
        setGlobalWebSocket(this.ws);
        setGlobalWsState(globalState.wsState);
      }
      
      // Sync with service
      this.syncWithService();
      
      // If connected but not authenticated, start authentication
      if (!globalState.wsState.authenticated && !this.authenticationInProgress) {
        console.log('[WebSocketManager] Connected but not authenticated, starting auth');
        this.startAuthentication();
      }
      
      return;
    }
    
    // Check if connecting - wait for result instead of aborting
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      console.log('[WebSocketManager] Connection already in progress, waiting...');
      return;
    }

    // Prevent multiple simultaneous connections
    if (!wallet || !wallet.connected) {
      console.log('[WebSocketManager] Cannot connect - wallet not ready');
      this.isConnecting = false;
      return;
    }
    
    // Clean up any dead connection
    if (this.ws && (this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING)) {
      console.log('[WebSocketManager] Cleaning up dead connection');
      this.ws = null;
      globalWebSocketInstance = null;
      window.globalWebSocket = null;
      this.isConnecting = false;
    }
    
    // Check if already trying to connect
    if (this.isConnecting) {
      console.log('[WebSocketManager] Already attempting connection');
      return;
    }

    this.isConnecting = true;
    this.walletAddress = wallet.address;
    this.walletProvider = wallet.provider || window.okxwallet || window.ethereum;
    this.authenticationInProgress = false;
    
    this.updateState({ 
      wsState: { authState: 'connecting', error: null }
    });

    try {
      // Hardcode the correct WebSocket URL to avoid environment variable issues
      const wsUrl = 'wss://api.aeronyx.network/ws/aeronyx/user-monitor/';
      console.log('[WebSocketManager] Connecting to WebSocket:', wsUrl);
      this.ws = new WebSocket(wsUrl);
      
      // Store as global
      globalWebSocketInstance = this.ws;
      
      // Share WebSocket instance globally if setter is available
      if (setGlobalWebSocket && typeof setGlobalWebSocket === 'function') {
        setGlobalWebSocket(this.ws);
        console.log('[WebSocketManager] Shared WebSocket with global state');
      }
      
      // Sync with centralized service
      this.syncWithService();
      
      // Make it globally accessible for debugging
      window.globalWebSocket = this.ws;
      
      // Connection timeout - shorter for better UX
      this.connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.error('[WebSocketManager] Connection timeout');
          this.ws.close();
          this.isConnecting = false;
          this.updateState({ 
            wsState: { 
              authState: 'error',
              error: 'Connection timeout' 
            }
          });
          // Will trigger reconnect in onclose handler
        }
      }, CONNECTION_CONFIG.CONNECTION_TIMEOUT);
      
      this.ws.onopen = () => {
        console.log('[WebSocketManager] WebSocket opened');
        
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        
        this.isConnecting = false;
        this.lastPong = Date.now();
        this.reconnectAttempts = 0;
        
        this.updateState({ 
          wsState: { connected: true, error: null }
        });
        
        // Sync with service
        this.syncWithService();
        
        // The server should send a 'connected' message after connection
        // We'll start authentication when we receive that message
        console.log('[WebSocketManager] Waiting for server connected message');
      };
      
      this.ws.onmessage = (event) => this.handleMessage(event);
      
      this.ws.onerror = (error) => {
        console.error('[WebSocketManager] WebSocket error:', error);
        
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        
        this.consecutiveFailures++;
        
        this.updateState({ 
          wsState: { error: 'Connection error' }
        });
      };
      
      this.ws.onclose = (event) => {
        console.log('[WebSocketManager] WebSocket closed:', event.code, event.reason);
        
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        
        // Clear connection state
        this.ws = null;
        globalWebSocketInstance = null;
        window.globalWebSocket = null;
        this.isConnecting = false;  // Always reset connecting flag
        this.authenticationInProgress = false;
        
        // Clear global WebSocket if setter is available
        if (setGlobalWebSocket && typeof setGlobalWebSocket === 'function') {
          setGlobalWebSocket(null);
          console.log('[WebSocketManager] Cleared global WebSocket');
        }
        
        // Clear in centralized service
        webSocketService.ws = null;
        webSocketService.isConnected = false;
        webSocketService.isAuthenticated = false;
        
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        
        this.updateState({ 
          wsState: { 
            connected: false,
            authenticated: false,
            monitoring: false,
            authState: 'idle'
          }
        });
        
        // Handle reconnection for abnormal closures
        // IMPROVED: Always reconnect unless explicitly stopped or manual close
        if (event.code !== 1000 && this.shouldReconnect) {
          // Check if this was triggered by manual reconnect
          if (event.reason === 'Manual reconnecting') {
            console.log('[WebSocketManager] Skipping auto-reconnect for manual reconnection');
          } else {
            this.scheduleReconnect();
          }
        }
      };
      
    } catch (error) {
      console.error('[WebSocketManager] WebSocket setup error:', error);
      
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      
      this.ws = null;
      globalWebSocketInstance = null;
      window.globalWebSocket = null;
      this.isConnecting = false;
      this.authenticationInProgress = false;
      
      // Clear global WebSocket if setter is available
      if (setGlobalWebSocket && typeof setGlobalWebSocket === 'function') {
        setGlobalWebSocket(null);
      }
      
      webSocketService.ws = null;
      webSocketService.isConnected = false;
      
      this.updateState({ 
        wsState: { 
          authState: 'error', 
          error: 'Failed to connect' 
        }
      });
      
      // Schedule reconnection
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Schedule reconnection
   * IMPROVED: Better retry strategy with quick initial retries
   */
  scheduleReconnect() {
    // Clear any existing reconnect timeout to prevent duplicates
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Optional: Check max consecutive failures
    if (CONNECTION_CONFIG.MAX_CONSECUTIVE_FAILURES && 
        this.consecutiveFailures >= CONNECTION_CONFIG.MAX_CONSECUTIVE_FAILURES) {
      console.error('[WebSocketManager] Max consecutive failures reached, stopping reconnection attempts');
      this.shouldReconnect = false;
      this.updateState({ 
        wsState: { 
          error: 'Max reconnection attempts reached. Please refresh the page.' 
        }
      });
      return;
    }
    
    this.reconnectAttempts++;
    
    // Determine delay based on attempt count
    let delay;
    if (this.reconnectAttempts <= CONNECTION_CONFIG.QUICK_RETRY_COUNT) {
      // Quick retries for first few attempts
      delay = CONNECTION_CONFIG.QUICK_RETRY_DELAY;
    } else if (this.reconnectAttempts <= CONNECTION_CONFIG.SLOW_RETRY_THRESHOLD) {
      // Normal retries
      delay = CONNECTION_CONFIG.NORMAL_RETRY_DELAY;
    } else {
      // Slow retries after many attempts
      delay = CONNECTION_CONFIG.SLOW_RETRY_DELAY;
    }
    
    console.log(`[WebSocketManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (this.walletAddress && this.shouldReconnect) {
        // Reset isConnecting flag before attempting connection
        this.isConnecting = false;
        this.connect({ 
          connected: true, 
          address: this.walletAddress, 
          provider: this.walletProvider 
        });
      }
    }, delay);
  }

  /**
   * Reconnect WebSocket
   */
  reconnect() {
    console.log('[WebSocketManager] Manual reconnect requested');
    
    // Clear any pending reconnection attempts first
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
      console.log('[WebSocketManager] Cleared pending reconnect timeout');
    }
    
    // Reset all flags and counters
    this.reconnectAttempts = 0;
    this.consecutiveFailures = 0;
    this.shouldReconnect = true;
    this.isConnecting = false;  // Force reset connecting flag
    
    // Close existing connection if any
    if (this.ws) {
      // Remove listeners temporarily to avoid triggering auto-reconnect
      const originalOnClose = this.ws.onclose;
      this.ws.onclose = null;
      
      this.ws.close(1000, 'Manual reconnecting');
      this.ws = null;
      globalWebSocketInstance = null;
      window.globalWebSocket = null;
      
      // Clear global WebSocket
      if (setGlobalWebSocket && typeof setGlobalWebSocket === 'function') {
        setGlobalWebSocket(null);
      }
      
      // Clear in centralized service
      webSocketService.ws = null;
      webSocketService.isConnected = false;
      webSocketService.isAuthenticated = false;
    }
    
    if (this.walletAddress) {
      // Use quick retry for manual reconnect
      console.log('[WebSocketManager] Starting fresh connection');
      setTimeout(() => {
        this.connect({ 
          connected: true, 
          address: this.walletAddress, 
          provider: this.walletProvider 
        });
      }, CONNECTION_CONFIG.QUICK_RETRY_DELAY);
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    console.log('[WebSocketManager] Disconnecting');
    
    // Stop reconnection attempts
    this.shouldReconnect = false;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN && globalState.wsState.monitoring) {
        this.ws.send(JSON.stringify({ type: 'stop_monitor' }));
      }
      
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
      globalWebSocketInstance = null;
      window.globalWebSocket = null;
      
      // Clear global WebSocket if setter is available
      if (setGlobalWebSocket && typeof setGlobalWebSocket === 'function') {
        setGlobalWebSocket(null);
      }
      
      webSocketService.ws = null;
      webSocketService.isConnected = false;
      webSocketService.isAuthenticated = false;
    }
    
    this.authenticationInProgress = false;
    
    // Reset counters
    this.reconnectAttempts = 0;
    this.consecutiveFailures = 0;
  }

  /**
   * Clear stored session
   */
  clearSession() {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    this.sessionToken = null;
    webSocketService.clearStoredSession();
    console.log('[WebSocketManager] Session cleared');
  }

  /**
   * Enable reconnection (useful after manual disconnect)
   */
  enableReconnection() {
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.consecutiveFailures = 0;
  }
}

// Create singleton instance
const wsManager = new WebSocketManager();

/**
 * Main Hook Export
 */
export function useAeroNyxWebSocket(options = {}) {
  const {
    autoConnect = true,
    autoMonitor = true,
    onNodesUpdate,
    onStatusChange,
    onError
  } = options;

  const { wallet } = useWallet();
  const [localState, setLocalState] = useState(globalState);
  const mountedRef = useRef(true);
  const listenerRef = useRef(null);

  // Subscribe to global state changes
  useEffect(() => {
    const listener = (newState) => {
      if (mountedRef.current) {
        setLocalState(newState);
        
        // Call external callbacks
        if (onNodesUpdate && newState.data.nodes.length > 0) {
          onNodesUpdate(newState.data.nodes);
        }
      }
    };
    
    // Add message handler if needed
    if (onStatusChange) {
      listener.onMessage = (messageData) => {
        onStatusChange(messageData.type, messageData);
      };
    }
    
    listenerRef.current = listener;
    globalListeners.add(listener);
    
    return () => {
      globalListeners.delete(listener);
    };
  }, [onNodesUpdate, onStatusChange]);

  // Handle errors
  useEffect(() => {
    if (localState.wsState.error && onError) {
      onError(new Error(localState.wsState.error));
    }
  }, [localState.wsState.error, onError]);

  // Auto-connect when wallet is ready
  useEffect(() => {
    mountedRef.current = true;
    
    if (autoConnect && wallet.connected && wallet.address) {
      // Small delay to ensure wallet is fully initialized
      const timeout = setTimeout(() => {
        if (mountedRef.current) {
          // Check if we're not already connected or connecting
          if (!wsManager.ws || (wsManager.ws.readyState !== WebSocket.OPEN && wsManager.ws.readyState !== WebSocket.CONNECTING)) {
            console.log('[useAeroNyxWebSocket] Auto-connecting with wallet:', wallet.address);
            wsManager.connect(wallet);
          }
        }
      }, 500);
      
      return () => {
        clearTimeout(timeout);
      };
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, [wallet.connected, wallet.address, autoConnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        globalListeners.delete(listenerRef.current);
      }
    };
  }, []);

  // Control methods
  const refresh = useCallback(() => {
    console.log('[useAeroNyxWebSocket] Refreshing connection');
    wsManager.reconnect();
  }, []);

  const startMonitoring = useCallback(() => {
    if (localState.wsState.authenticated && !localState.wsState.monitoring) {
      console.log('[useAeroNyxWebSocket] Starting monitoring');
      wsManager.sendMessage({ type: 'start_monitor' });
    }
  }, [localState.wsState.authenticated, localState.wsState.monitoring]);

  const stopMonitoring = useCallback(() => {
    if (localState.wsState.monitoring) {
      console.log('[useAeroNyxWebSocket] Stopping monitoring');
      wsManager.sendMessage({ type: 'stop_monitor' });
      wsManager.updateState({ wsState: { monitoring: false }});
    }
  }, [localState.wsState.monitoring]);

  const clearSession = useCallback(() => {
    wsManager.clearSession();
  }, []);

  const forceReconnect = useCallback(() => {
    console.log('[useAeroNyxWebSocket] Force reconnect');
    wsManager.enableReconnection();
    wsManager.reconnect();
  }, []);

  // Return hook state and methods
  return {
    // WebSocket state
    wsState: localState.wsState,
    
    // Data
    nodes: localState.data.nodes,
    stats: localState.data.stats,
    lastUpdate: localState.data.lastUpdate,
    
    // Control methods
    refresh,
    startMonitoring,
    stopMonitoring,
    clearSession,
    forceReconnect, // New method for forcing reconnection
    
    // Loading and error states
    isLoading: localState.wsState.authState === 'connecting' || 
               localState.wsState.authState === 'signing' || 
               localState.wsState.authState === 'authenticating' ||
               localState.wsState.authState === 'requesting_message',
    error: localState.wsState.error,
    
    // Session info
    hasStoredSession: !!wsManager.sessionToken,
    
    // Connection info (new)
    reconnectAttempts: wsManager.reconnectAttempts,
    isReconnecting: wsManager.reconnectAttempts > 0 && !localState.wsState.connected
  };
}

// Export WebSocket states
export { WsState };

// Export connection config for external use/debugging
export { CONNECTION_CONFIG };

// Export for backward compatibility
export default useAeroNyxWebSocket;
