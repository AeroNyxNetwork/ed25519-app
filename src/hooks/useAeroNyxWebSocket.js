/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: WebSocket hook for real-time node monitoring
 * Modification Reason: Implemented singleton pattern to prevent duplicate connections
 * Main Functionality: Singleton WebSocket connection management with session persistence
 * Dependencies: useWallet, setGlobalWebSocket, setGlobalWsState
 *
 * Main Logical Flow:
 * 1. Singleton instance ensures only ONE WebSocket connection
 * 2. Check for existing valid session token on startup
 * 3. Connect to WebSocket and use session if available
 * 4. Otherwise follow full authentication flow
 * 5. Store session for 30 minutes after successful auth
 * 6. Multiple components share the same connection
 *
 * ⚠️ Important Note for Next Developer:
 * - This uses a SINGLETON PATTERN - only one WebSocket instance exists
 * - Session tokens are properly reused for 30 minutes
 * - DO NOT create multiple instances - use the shared connection
 * - The globalWebSocketInstance prevents duplicate connections
 *
 * Last Modified: v4.0.0 - Singleton pattern implementation with proper session reuse
 * ============================================
 */

'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
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

/**
 * SINGLETON WebSocket instance and state
 * This ensures only ONE connection across the entire app
 */
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

// Singleton connection manager
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
      
      console.log('[WebSocketManager] Found valid stored session, expires in:', 
        Math.round((session.expires_at - Date.now()) / 1000 / 60), 'minutes');
      
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
   * Update global state and notify all listeners
   */
  updateState(updates) {
    // Update wsState if provided
    if (updates.wsState) {
      globalState.wsState = { ...globalState.wsState, ...updates.wsState };
      setGlobalWsState(globalState.wsState);
    }
    
    // Update data if provided
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
    return false;
  }

  /**
   * Setup ping interval
   */
  setupPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Check if we received a pong recently
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
    }, 45000); // 45 seconds
  }

  /**
   * Connect to WebSocket (singleton)
   */
  async connect(wallet) {
    // Prevent multiple simultaneous connections
    if (!wallet || !wallet.connected || this.isConnecting) {
      return;
    }

    // Check if we already have an open connection
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocketManager] Already connected');
      return;
    }

    this.isConnecting = true;
    this.walletAddress = wallet.address;
    this.walletProvider = wallet.provider;
    
    // Check for stored session BEFORE connecting
    const storedSession = this.getStoredSession(wallet.address);
    if (storedSession) {
      this.sessionToken = storedSession.session_token;
    }
    
    this.updateState({ 
      wsState: { authState: 'connecting', error: null }
    });

    try {
      console.log('[WebSocketManager] Connecting to WebSocket (singleton)');
      this.ws = new WebSocket('wss://api.aeronyx.network/ws/aeronyx/user-monitor/');
      
      // Store as global WebSocket
      globalWebSocketInstance = this.ws;
      setGlobalWebSocket(this.ws);
      
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
        
        // Clear connection timeout
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        
        this.isConnecting = false;
        this.lastPong = Date.now();
        this.reconnectAttempts = 0;
        
        // Setup ping interval
        this.setupPingInterval();
        
        this.updateState({ 
          wsState: { connected: true, error: null }
        });
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
        
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        
        setGlobalWebSocket(null);
        
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
      
      this.updateState({ 
        wsState: { 
          authState: 'error', 
          error: 'Failed to connect' 
        }
      });
    }
  }

  /**
   * Handle WebSocket messages
   */
  async handleMessage(event) {
    try {
      const messageData = JSON.parse(event.data);
      console.log('[WebSocketManager] Received:', messageData.type);
      
      switch (messageData.type) {
        case 'connected':
          // WebSocket connected, check for stored session
          if (this.sessionToken) {
            console.log('[WebSocketManager] Using stored session token');
            this.updateState({ wsState: { authState: 'authenticating' }});
            
            // Try authentication with stored session
            this.sendMessage({
              type: 'auth',
              session_token: this.sessionToken,
              wallet_address: this.walletAddress.toLowerCase()
            });
          } else {
            // No session, request signature
            console.log('[WebSocketManager] No session, requesting signature');
            this.updateState({ wsState: { authState: 'requesting_message' }});
            
            this.sendMessage({
              type: 'get_message',
              wallet_address: this.walletAddress.toLowerCase()
            });
          }
          break;
          
        case 'signature_message':
          // Need to sign message
          console.log('[WebSocketManager] Signing message');
          this.updateState({ wsState: { authState: 'signing' }});
          
          try {
            const signature = await this.signMessage(messageData.message);
            
            this.updateState({ wsState: { authState: 'authenticating' }});
            
            // Extract wallet from message for consistency
            const walletMatch = messageData.message.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/);
            const messageWallet = walletMatch ? walletMatch[1] : this.walletAddress;
            
            this.sendMessage({
              type: 'auth',
              wallet_address: messageWallet.toLowerCase(),
              signature: signature,
              message: messageData.message,
              wallet_type: 'okx'
            });
            
          } catch (error) {
            console.error('[WebSocketManager] Signing error:', error);
            this.updateState({ 
              wsState: { 
                authState: 'error', 
                error: 'Failed to sign message' 
              }
            });
          }
          break;
          
        case 'auth_success':
          // Authentication successful - STORE SESSION
          console.log('[WebSocketManager] Authentication successful');
          
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
          
          // Handle authentication errors
          if (messageData.code === 'AUTHENTICATION_REQUIRED' || 
              messageData.code === 'INVALID_SIGNATURE' ||
              messageData.code === 'SESSION_EXPIRED') {
            
            // Clear stored session and retry
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            this.sessionToken = null;
            
            this.updateState({ wsState: { authenticated: false, authState: 'requesting_message' }});
            
            this.sendMessage({
              type: 'get_message',
              wallet_address: this.walletAddress.toLowerCase()
            });
          } else {
            this.updateState({ 
              wsState: { error: messageData.message || 'Server error' }
            });
          }
          break;
          
        case 'pong':
          this.lastPong = Date.now();
          break;
          
        default:
          // Pass to any external handlers
          break;
      }
      
      // Notify all listeners about the message
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
   * Sign message with wallet
   */
  async signMessage(message) {
    const walletMatch = message.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/);
    if (!walletMatch || !walletMatch[1]) {
      throw new Error('Could not extract wallet address from message');
    }
    
    const messageWallet = walletMatch[1];
    
    // For OKX wallet
    if (window.okxwallet && this.walletProvider === window.okxwallet) {
      const accounts = await this.walletProvider.request({ method: 'eth_accounts' });
      const accountToUse = accounts.find(acc => 
        acc.toLowerCase() === messageWallet.toLowerCase()
      ) || accounts[0];
      
      const signature = await this.walletProvider.request({
        method: 'personal_sign',
        params: [message, accountToUse]
      });
      
      return signature.startsWith('0x') ? signature : `0x${signature}`;
    }
    
    // Standard wallet
    const signature = await this.walletProvider.request({
      method: 'personal_sign',
      params: [message, messageWallet]
    });
    
    return signature.startsWith('0x') ? signature : `0x${signature}`;
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
      activeNodes: nodes.filter(n => n.status === 'active').length,
      offlineNodes: nodes.filter(n => n.status === 'offline').length,
      totalEarnings: nodes.reduce((sum, n) => sum + parseFloat(n.earnings || 0), 0),
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
    }
    
    setGlobalWebSocket(null);
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
 * Unified WebSocket Hook - Uses singleton connection
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

  // Cleanup on unmount (but don't disconnect shared connection)
  useEffect(() => {
    return () => {
      // Remove listener but keep connection alive for other components
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
               localState.wsState.authState === 'authenticating',
    error: localState.wsState.error,
    
    // Session info
    hasStoredSession: !!wsManager.sessionToken
  };
}

// Export WebSocket states for external use
export { WsState };
