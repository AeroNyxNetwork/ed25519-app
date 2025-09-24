/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: WebSocket hook for real-time node monitoring
 * Modification Reason: Fixed global WebSocket sharing for RemoteManagement
 * Main Functionality: Singleton WebSocket connection with proper global sharing
 * Dependencies: useWallet, nodeRegistrationService, useRemoteManagement
 *
 * Main Logical Flow:
 * 1. Connect to WebSocket server
 * 2. Share WebSocket instance globally for RemoteManagement
 * 3. Request signature message using get_message
 * 4. Receive signature_message from server
 * 5. Sign message with wallet
 * 6. Send auth with signature
 * 7. Start monitoring after successful auth
 *
 * ⚠️ Important Note for Next Developer:
 * - CRITICAL: Must call setGlobalWebSocket from useRemoteManagement
 * - Backend expects get_message -> signature_message -> auth flow
 * - Must authenticate BEFORE sending any other messages
 * - Session tokens are stored for 30 minutes
 * - This uses singleton pattern - only ONE connection
 *
 * Last Modified: v7.0.0 - Fixed global WebSocket sharing for RemoteManagement
 * ============================================
 */

'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import nodeRegistrationService from '../lib/api/nodeRegistration';
// Import the setter functions from useRemoteManagement
import { setGlobalWebSocket, setGlobalWsState } from './useRemoteManagement';

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
    this.lastPong = Date.now();
    this.sessionToken = null;
    this.isConnecting = false;
    this.walletAddress = null;
    this.walletProvider = null;
    this.authenticationInProgress = false;
    this.signatureNonce = null;
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
      console.log('[WebSocketManager] Session stored for 30 minutes');
    } catch (error) {
      console.error('[WebSocketManager] Error storing session:', error);
    }
  }

  /**
   * Update global state and notify listeners
   * CRITICAL: Also update RemoteManagement's global state
   */
  updateState(updates) {
    if (updates.wsState) {
      globalState.wsState = { ...globalState.wsState, ...updates.wsState };
      // CRITICAL: Share state with RemoteManagement
      setGlobalWsState(globalState.wsState);
    }
    
    if (updates.data) {
      globalState.data = { ...globalState.data, ...updates.data };
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
      return true;
    }
    console.warn('[WebSocketManager] Cannot send message - WebSocket not open');
    return false;
  }

  /**
   * Setup ping interval - only after authentication
   */
  setupPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && globalState.wsState.authenticated) {
        const timeSinceLastPong = Date.now() - this.lastPong;
        if (timeSinceLastPong > 90000) { // 90 seconds without pong
          console.warn('[WebSocketManager] No pong received for 90 seconds, reconnecting');
          this.reconnect();
          return;
        }

        this.sendMessage({ 
          type: 'ping',
          echo: Date.now()
        });
      }
    }, 30000); // 30 seconds
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
        
        // Ensure we have accounts
        const accounts = await provider.request({ method: 'eth_accounts' });
        if (!accounts || accounts.length === 0) {
          // Request accounts
          const newAccounts = await provider.request({ method: 'eth_requestAccounts' });
          if (!newAccounts || newAccounts.length === 0) {
            throw new Error('No accounts available');
          }
        }
        
        const accountToUse = accounts.find(acc => 
          acc.toLowerCase() === messageWallet.toLowerCase()
        ) || accounts[0];
        
        console.log('[WebSocketManager] Signing with account:', accountToUse);
        
        const signature = await provider.request({
          method: 'personal_sign',
          params: [message, accountToUse]
        });
        
        return {
          signature: signature.startsWith('0x') ? signature : `0x${signature}`,
          message: message,
          wallet: messageWallet
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
      throw error;
    }
  }

  /**
   * Start authentication flow
   */
  async startAuthentication() {
    if (this.authenticationInProgress) {
      console.log('[WebSocketManager] Authentication already in progress');
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
      // Try API fallback first due to WebSocket server issues
      console.log('[WebSocketManager] Using API fallback for signature message');
      try {
        const messageResponse = await nodeRegistrationService.generateSignatureMessage(this.walletAddress);
        if (messageResponse.success && messageResponse.data.message) {
          console.log('[WebSocketManager] Got signature message from API');
          
          this.updateState({ wsState: { authState: 'signing' }});
          
          const signedData = await this.signMessage(messageResponse.data.message);
          
          this.updateState({ wsState: { authState: 'authenticating' }});
          
          // Send authentication with signature
          this.sendMessage({
            type: 'auth',
            wallet_address: signedData.wallet.toLowerCase(),
            signature: signedData.signature,
            message: signedData.message,
            wallet_type: 'ethereum'
          });
        } else {
          throw new Error('Failed to get signature message from API');
        }
      } catch (error) {
        console.error('[WebSocketManager] API fallback failed:', error);
        // Try WebSocket method as last resort
        this.updateState({ wsState: { authState: 'requesting_message' }});
        this.sendMessage({
          type: 'get_message',
          wallet_address: this.walletAddress.toLowerCase()
        });
      }
    }
  }

  /**
   * Handle WebSocket messages
   */
  async handleMessage(event) {
    try {
      const messageData = JSON.parse(event.data);
      console.log('[WebSocketManager] Received:', messageData.type, messageData);
      
      switch (messageData.type) {
        case 'connected':
          // WebSocket connected, wait before starting auth
          this.updateState({ wsState: { connected: true, authState: 'connected' }});
          
          // Start authentication after a small delay
          setTimeout(() => {
            this.startAuthentication();
          }, 100);
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
            
            // Send authentication with signature
            this.sendMessage({
              type: 'auth',
              wallet_address: signedData.wallet.toLowerCase(),
              signature: signedData.signature,
              message: signedData.message,
              wallet_type: 'ethereum'
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
              messageData.message === 'Invalid or expired session token' ||
              messageData.message === 'Internal error') {
            
            // Clear stored session and retry with API
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            this.sessionToken = null;
            this.authenticationInProgress = false;
            
            // Use API fallback for authentication
            console.log('[WebSocketManager] Server error, using API fallback');
            setTimeout(() => {
              this.startAuthentication();
            }, 1000);
            
          } else if (messageData.message === 'Not authenticated') {
            // If we get "Not authenticated" and we're not in auth flow, start it
            if (!this.authenticationInProgress) {
              console.log('[WebSocketManager] Not authenticated, starting auth flow');
              this.startAuthentication();
            }
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
          console.log('[WebSocketManager] Unknown message type:', messageData.type);
          break;
      }
      
      // Notify listeners about the message
      globalListeners.forEach(listener => {
        if (listener.onMessage) {
          listener.onMessage(messageData);
        }
      });
      
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
   */
  async connect(wallet) {
    // Check if already connected
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('[WebSocketManager] Already connected or connecting');
      // Still share the existing WebSocket
      setGlobalWebSocket(this.ws);
      setGlobalWsState(globalState.wsState);
      return;
    }

    // Prevent multiple simultaneous connections
    if (!wallet || !wallet.connected) {
      console.log('[WebSocketManager] Cannot connect - wallet not ready');
      return;
    }
    
    // Allow reconnection even if previous connection failed
    if (this.isConnecting && this.ws && this.ws.readyState === WebSocket.CLOSED) {
      console.log('[WebSocketManager] Previous connection failed, resetting state');
      this.isConnecting = false;
    }
    
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
      
      // CRITICAL: Share WebSocket with RemoteManagement
      setGlobalWebSocket(this.ws);
      console.log('[WebSocketManager] Shared WebSocket with RemoteManagement');
      
      // Connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.ws.readyState === WebSocket.CONNECTING) {
          console.error('[WebSocketManager] Connection timeout');
          this.ws.close();
          this.updateState({ 
            wsState: { 
              authState: 'error',
              error: 'Connection timeout' 
            }
          });
          this.isConnecting = false;
        }
      }, 30000);
      
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
        
        // Share updated state
        setGlobalWsState(globalState.wsState);
      };
      
      this.ws.onmessage = (event) => this.handleMessage(event);
      
      this.ws.onerror = (error) => {
        console.error('[WebSocketManager] WebSocket error:', error);
        
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        
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
        
        this.ws = null;
        globalWebSocketInstance = null;
        this.isConnecting = false;
        this.authenticationInProgress = false;
        
        // Clear global WebSocket in RemoteManagement
        setGlobalWebSocket(null);
        
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
        if (event.code !== 1000 && this.reconnectAttempts < 5) {
          this.scheduleReconnect();
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
      this.isConnecting = false;
      this.authenticationInProgress = false;
      
      // Clear global WebSocket
      setGlobalWebSocket(null);
      
      this.updateState({ 
        wsState: { 
          authState: 'error', 
          error: 'Failed to connect' 
        }
      });
    }
  }

  /**
   * Schedule reconnection
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(3000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    console.log(`[WebSocketManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (this.walletAddress) {
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
    console.log('[WebSocketManager] Reconnecting');
    
    if (this.ws) {
      this.ws.close(1000, 'Reconnecting');
    }
    
    this.reconnectAttempts = 0;
    
    if (this.walletAddress) {
      setTimeout(() => {
        this.connect({ 
          connected: true, 
          address: this.walletAddress, 
          provider: this.walletProvider 
        });
      }, 1000);
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    console.log('[WebSocketManager] Disconnecting');
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN && globalState.wsState.monitoring) {
        this.ws.send(JSON.stringify({ type: 'stop_monitor' }));
      }
      
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
      globalWebSocketInstance = null;
      
      // Clear global WebSocket
      setGlobalWebSocket(null);
    }
    
    this.authenticationInProgress = false;
  }

  /**
   * Clear stored session
   */
  clearSession() {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    this.sessionToken = null;
    console.log('[WebSocketManager] Session cleared');
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
      // Small delay to ensure wallet is ready
      const timeout = setTimeout(() => {
        if (mountedRef.current) {
          wsManager.connect(wallet);
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
    
    // Loading and error states
    isLoading: localState.wsState.authState === 'connecting' || 
               localState.wsState.authState === 'signing' || 
               localState.wsState.authState === 'authenticating' ||
               localState.wsState.authState === 'requesting_message',
    error: localState.wsState.error,
    
    // Session info
    hasStoredSession: !!wsManager.sessionToken
  };
}

// Export WebSocket states
export { WsState };

// Export for backward compatibility
export default useAeroNyxWebSocket;
