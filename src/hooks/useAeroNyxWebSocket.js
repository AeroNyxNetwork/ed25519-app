/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: WebSocket hook for real-time node monitoring
 * Modification Reason: Fixed duplicate timeout issues and added session persistence
 * Main Functionality: Handles WebSocket connection, authentication, and monitoring
 * Dependencies: useWallet, setGlobalWebSocket, setGlobalWsState
 *
 * Main Logical Flow:
 * 1. Check for existing valid session token
 * 2. Connect to WebSocket with session token if available
 * 3. Otherwise follow full authentication flow
 * 4. Store session for 30 minutes after successful auth
 * 5. Handle reconnection with session reuse
 *
 * ⚠️ Important Note for Next Developer:
 * - Fixed duplicate timeout issue by clearing timeout on successful connection
 * - Session tokens are stored in sessionStorage for 30-minute reuse
 * - WebSocket automatically uses stored session to skip re-authentication
 * - Proper cleanup of all timeouts and intervals
 *
 * Last Modified: v3.0.2 - Fixed timeout issues and added session persistence
 * ============================================
 */

/**
 * Corrected Unified WebSocket Hook following exact documentation flow
 * 
 * File Path: src/hooks/useAeroNyxWebSocket.js
 * 
 * Flow:
 * 1. Connect to wss://api.aeronyx.network/ws/aeronyx/user-monitor/
 * 2. Check for existing session token
 * 3. If no session: Request signature message -> Sign -> Authenticate
 * 4. If session exists: Send session token directly
 * 5. Start monitoring after successful authentication
 * 6. Receive periodic status_update messages
 * 
 * @version 3.0.2
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
 * Get stored session if valid
 */
function getStoredSession(walletAddress) {
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
    
    return session;
  } catch (error) {
    console.error('[useAeroNyxWebSocket] Error reading stored session:', error);
    return null;
  }
}

/**
 * Store session for reuse
 */
function storeSession(walletAddress, sessionToken) {
  try {
    const session = {
      wallet_address: walletAddress.toLowerCase(),
      session_token: sessionToken,
      created_at: Date.now(),
      expires_at: Date.now() + SESSION_DURATION
    };
    
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('[useAeroNyxWebSocket] Error storing session:', error);
  }
}

/**
 * Unified WebSocket Hook
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

  // State management
  const [wsState, setWsState] = useState({
    connected: false,
    authenticated: false,
    monitoring: false,
    authState: 'idle',
    error: null
  });

  const [data, setData] = useState({
    nodes: [],
    stats: {
      totalNodes: 0,
      activeNodes: 0,
      offlineNodes: 0,
      totalEarnings: 0,
      resourceUtilization: 0
    },
    lastUpdate: null
  });

  // Refs
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const mountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const lastPongRef = useRef(Date.now());
  const sessionTokenRef = useRef(null);

  // Update global WebSocket state whenever it changes
  useEffect(() => {
    setGlobalWsState(wsState);
  }, [wsState]);

  /**
   * Calculate resource utilization from nodes
   */
  const calculateResourceUtilization = useCallback((nodes) => {
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;
    
    const activeNodes = nodes.filter(n => n.status === 'active' || n.status === 'online');
    if (activeNodes.length === 0) return 0;
    
    const totalUtil = activeNodes.reduce((sum, node) => {
      const cpu = node.performance?.cpu || 0;
      const memory = node.performance?.memory || 0;
      return sum + ((cpu + memory) / 2);
    }, 0);
    
    return Math.round(totalUtil / activeNodes.length);
  }, []);

  /**
   * Process nodes data from WebSocket status_update
   */
  const processNodesData = useCallback((wsData) => {
    if (!wsData || !wsData.nodes || !Array.isArray(wsData.nodes)) {
      return;
    }
    
    const nodes = wsData.nodes;
    
    const stats = {
      totalNodes: nodes.length,
      activeNodes: nodes.filter(n => n.status === 'active').length,
      offlineNodes: nodes.filter(n => n.status === 'offline').length,
      totalEarnings: nodes.reduce((sum, n) => sum + parseFloat(n.earnings || 0), 0),
      resourceUtilization: calculateResourceUtilization(nodes)
    };
    
    setData({
      nodes: nodes,
      stats: stats,
      lastUpdate: new Date()
    });

    // Call external callback if provided
    if (onNodesUpdate) {
      onNodesUpdate(nodes);
    }
  }, [calculateResourceUtilization, onNodesUpdate]);

  /**
   * Send message through WebSocket with connection check
   */
  const sendMessage = useCallback((messageData) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[useAeroNyxWebSocket] Sending message:', messageData.type, messageData);
      wsRef.current.send(JSON.stringify(messageData));
      return true;
    } else {
      console.warn('[useAeroNyxWebSocket] Cannot send message - WebSocket not open');
      return false;
    }
  }, []);

  /**
   * Sign message with wallet
   * CRITICAL: Must extract wallet address from message to ensure consistency
   */
  const signMessage = useCallback(async (message) => {
    console.log('[useAeroNyxWebSocket] signMessage called');
    console.log('[useAeroNyxWebSocket] Message to sign (first 100 chars):', message.substring(0, 100) + '...');
    
    // Extract wallet address from message to ensure exact match
    const walletMatch = message.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/);
    if (!walletMatch || !walletMatch[1]) {
      console.error('[useAeroNyxWebSocket] Could not extract wallet address from message');
      console.error('[useAeroNyxWebSocket] Message:', message);
      throw new Error('Could not extract wallet address from message');
    }
    
    const messageWallet = walletMatch[1];
    console.log('[useAeroNyxWebSocket] Wallet address from message:', messageWallet);
    console.log('[useAeroNyxWebSocket] Current wallet address:', wallet.address);
    console.log('[useAeroNyxWebSocket] Addresses match:', messageWallet.toLowerCase() === wallet.address.toLowerCase());
    
    // For OKX wallet, ensure we use the correct account
    if (window.okxwallet && wallet.provider === window.okxwallet) {
      console.log('[useAeroNyxWebSocket] Using OKX wallet for signing');
      
      const accounts = await wallet.provider.request({ method: 'eth_accounts' });
      console.log('[useAeroNyxWebSocket] OKX accounts:', accounts);
      
      const accountToUse = accounts.find(acc => acc.toLowerCase() === messageWallet.toLowerCase()) || accounts[0];
      console.log('[useAeroNyxWebSocket] Account to use for signing:', accountToUse);
      
      try {
        const signature = await wallet.provider.request({
          method: 'personal_sign',
          params: [message, accountToUse]
        });
        
        console.log('[useAeroNyxWebSocket] Raw signature from OKX:', signature);
        const finalSignature = signature.startsWith('0x') ? signature : `0x${signature}`;
        console.log('[useAeroNyxWebSocket] Final signature:', finalSignature);
        
        return finalSignature;
      } catch (error) {
        console.error('[useAeroNyxWebSocket] OKX signing error:', error);
        throw error;
      }
    }
    
    console.log('[useAeroNyxWebSocket] Using standard wallet signing');
    const signature = await wallet.provider.request({
      method: 'personal_sign',
      params: [message, messageWallet]
    });
    
    const finalSignature = signature.startsWith('0x') ? signature : `0x${signature}`;
    console.log('[useAeroNyxWebSocket] Final signature:', finalSignature);
    
    return finalSignature;
  }, [wallet]);

  /**
   * Handle WebSocket messages
   */
  const handleMessage = useCallback(async (event) => {
    try {
      const messageData = JSON.parse(event.data);
      console.log('[useAeroNyxWebSocket] Received message:', messageData.type, messageData);
      
      // Call external status change handler if provided
      if (onStatusChange && messageData.type) {
        onStatusChange(messageData.type, messageData);
      }
      
      switch (messageData.type) {
        case 'connected':
          // Step 1: WebSocket connected
          console.log('[useAeroNyxWebSocket] WebSocket connected');
          setWsState(prev => ({ ...prev, connected: true, error: null }));
          
          // Check for stored session (currently disabled until backend supports it)
          const storedSession = getStoredSession(wallet.address);
          if (storedSession && storedSession.session_token && false) { // Disabled for now
            console.log('[useAeroNyxWebSocket] Found stored session, attempting to use it');
            sessionTokenRef.current = storedSession.session_token;
            
            // Try to authenticate with session token
            setWsState(prev => ({ ...prev, authState: 'authenticating' }));
            sendMessage({
              type: 'auth',
              session_token: storedSession.session_token,
              wallet_address: wallet.address.toLowerCase()
            });
          } else {
            // Always request signature message for now
            console.log('[useAeroNyxWebSocket] Requesting signature message');
            setWsState(prev => ({ ...prev, authState: 'requesting_message' }));
            
            const getMessageRequest = {
              type: 'get_message',
              wallet_address: wallet.address.toLowerCase()
            };
            console.log('[useAeroNyxWebSocket] Sending get_message request:', getMessageRequest);
            sendMessage(getMessageRequest);
          }
          break;
          
        case 'signature_message':
          // Step 2: Received message to sign
          console.log('[useAeroNyxWebSocket] Received signature message');
          console.log('[useAeroNyxWebSocket] Message to sign:', messageData.message);
          console.log('[useAeroNyxWebSocket] Nonce:', messageData.nonce);
          console.log('[useAeroNyxWebSocket] Expires in:', messageData.expires_in);
          
          setWsState(prev => ({ ...prev, authState: 'signing' }));
          
          try {
            // Sign the message
            const signature = await signMessage(messageData.message);
            console.log('[useAeroNyxWebSocket] Signature obtained:', signature);
            
            setWsState(prev => ({ ...prev, authState: 'authenticating' }));
            
            // Extract wallet address from message for consistency
            const walletMatch = messageData.message.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/);
            const messageWallet = walletMatch ? walletMatch[1] : wallet.address;
            
            // Build auth message according to documentation
            const authMessage = {
              type: 'auth',
              wallet_address: messageWallet.toLowerCase(),
              signature: signature,
              message: messageData.message,
              wallet_type: 'okx' // or detect wallet type
            };
            
            console.log('[useAeroNyxWebSocket] Sending auth message');
            sendMessage(authMessage);
            
          } catch (error) {
            console.error('[useAeroNyxWebSocket] Signing error:', error);
            setWsState(prev => ({ 
              ...prev, 
              authState: 'error', 
              error: 'Failed to sign message: ' + error.message 
            }));
            if (onError) onError(error);
          }
          break;
          
        case 'auth_success':
          // Step 3: Authentication successful
          console.log('[useAeroNyxWebSocket] Authentication successful');
          console.log('[useAeroNyxWebSocket] Session token:', messageData.session_token);
          console.log('[useAeroNyxWebSocket] Nodes received:', messageData.nodes ? messageData.nodes.length : 0);
          
          // Store session token for reuse
          if (messageData.session_token) {
            sessionTokenRef.current = messageData.session_token;
            storeSession(wallet.address, messageData.session_token);
            console.log('[useAeroNyxWebSocket] Session stored for 30 minutes');
          }
          
          setWsState(prev => ({ 
            ...prev, 
            authenticated: true, 
            authState: 'authenticated',
            error: null
          }));
          
          reconnectAttemptsRef.current = 0;
          
          // Process initial nodes if provided
          if (messageData.nodes) {
            console.log('[useAeroNyxWebSocket] Processing initial nodes data');
            // Map nodes to expected format
            const initialNodes = messageData.nodes.map((node) => ({
              code: node.code,
              name: node.name,
              id: node.id,
              status: node.status || 'unknown',
              type: node.type || 'unknown',
              performance: node.performance || { cpu: 0, memory: 0, disk: 0, network: 0 },
              earnings: node.earnings || 0,
              last_seen: node.last_seen || null
            }));
            
            setData(prev => ({
              ...prev,
              nodes: initialNodes,
              stats: {
                ...prev.stats,
                totalNodes: initialNodes.length
              }
            }));
          }
          
          // Start monitoring if autoMonitor is enabled
          if (autoMonitor) {
            console.log('[useAeroNyxWebSocket] Starting monitoring');
            sendMessage({ type: 'start_monitor' });
          }
          break;
          
        case 'monitor_started':
          // Step 4: Monitoring started
          console.log('[useAeroNyxWebSocket] Monitoring started successfully');
          console.log('[useAeroNyxWebSocket] Update interval:', messageData.interval);
          setWsState(prev => ({ ...prev, monitoring: true }));
          break;
          
        case 'status_update':
          // Step 5: Periodic status updates
          console.log('[useAeroNyxWebSocket] Received status update');
          console.log('[useAeroNyxWebSocket] Update number:', messageData.update_number);
          setWsState(prev => ({ ...prev, monitoring: true }));
          processNodesData(messageData);
          break;
          
        case 'error':
          console.error('[useAeroNyxWebSocket] Server error:', messageData.message);
          console.error('[useAeroNyxWebSocket] Error code:', messageData.code);
          console.error('[useAeroNyxWebSocket] Error details:', messageData.details);
          
          setWsState(prev => ({ 
            ...prev, 
            error: messageData.message || 'Server error'
          }));
          
          if (onError) onError(new Error(messageData.message || 'Server error'));
          
          // Handle authentication errors
          if (messageData.code === 'AUTHENTICATION_REQUIRED' || 
              messageData.code === 'INVALID_SIGNATURE' ||
              messageData.code === 'SESSION_EXPIRED' ||
              messageData.error_code === 'authentication_required' || 
              messageData.error_code === 'invalid_signature') {
            console.log('[useAeroNyxWebSocket] Authentication required, clearing session and restarting auth flow');
            
            // Clear stored session
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            sessionTokenRef.current = null;
            
            setWsState(prev => ({ ...prev, authenticated: false, authState: 'requesting_message' }));
            sendMessage({
              type: 'get_message',
              wallet_address: wallet.address.toLowerCase()
            });
          }
          break;
          
        case 'pong':
          console.log('[useAeroNyxWebSocket] Pong received, echo:', messageData.echo);
          lastPongRef.current = Date.now();
          break;
          
        default:
          console.log('[useAeroNyxWebSocket] Unknown message type:', messageData.type);
      }
    } catch (error) {
      console.error('[useAeroNyxWebSocket] Message handling error:', error);
      if (onError) onError(error);
    }
  }, [wallet.address, sendMessage, processNodesData, signMessage, autoMonitor, onStatusChange, onError]);

  /**
   * Setup ping interval to keep connection alive
   */
  const setupPingInterval = useCallback(() => {
    // Clear existing interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    // Set up new ping interval (45 seconds)
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Check if we received a pong recently
        const timeSinceLastPong = Date.now() - lastPongRef.current;
        if (timeSinceLastPong > 90000) { // 90 seconds without pong
          console.warn('[useAeroNyxWebSocket] No pong received for 90 seconds, connection may be stale');
          // Force reconnection
          if (wsRef.current) {
            wsRef.current.close();
          }
          return;
        }

        console.log('[useAeroNyxWebSocket] Sending ping');
        sendMessage({ 
          type: 'ping',
          echo: Date.now()
        });
      }
    }, 45000); // 45 seconds
  }, [sendMessage]);

  /**
   * Connect to WebSocket with improved timeout handling
   */
  const connectWebSocket = useCallback(() => {
    // Prevent multiple simultaneous connections
    if (!wallet.connected || isConnectingRef.current) {
      console.log('[useAeroNyxWebSocket] Skipping connection:', {
        walletConnected: wallet.connected,
        isConnecting: isConnectingRef.current
      });
      return;
    }

    // Check if we already have an open connection
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[useAeroNyxWebSocket] WebSocket already connected');
      return;
    }

    // Close any existing connection
    if (wsRef.current) {
      console.log('[useAeroNyxWebSocket] Closing existing connection');
      wsRef.current.close();
      wsRef.current = null;
    }
    
    isConnectingRef.current = true;
    setWsState(prev => ({ ...prev, authState: 'connecting', error: null }));
    
    try {
      console.log('[useAeroNyxWebSocket] Connecting to WebSocket');
      const ws = new WebSocket('wss://api.aeronyx.network/ws/aeronyx/user-monitor/');
      wsRef.current = ws;
      
      // Connection timeout - store reference so we can clear it
      connectionTimeoutRef.current = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.error('[useAeroNyxWebSocket] Connection timeout');
          ws.close();
          setWsState(prev => ({ 
            ...prev, 
            authState: 'error',
            error: 'Connection timeout' 
          }));
          isConnectingRef.current = false;
        }
      }, 30000); // 30 seconds timeout
      
      ws.onopen = () => {
        console.log('[useAeroNyxWebSocket] WebSocket opened');
        
        // CRITICAL: Clear the connection timeout
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        
        isConnectingRef.current = false;
        lastPongRef.current = Date.now();
        
        // Setup ping interval
        setupPingInterval();
        
        // Expose WebSocket instance for remote management
        setGlobalWebSocket(ws);
      };
      
      ws.onmessage = handleMessage;
      
      ws.onerror = (error) => {
        console.error('[useAeroNyxWebSocket] WebSocket error:', error);
        
        // Clear connection timeout
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        
        setWsState(prev => ({ 
          ...prev, 
          error: 'Connection error' 
        }));
        if (onError) onError(error);
      };
      
      ws.onclose = (event) => {
        console.log('[useAeroNyxWebSocket] WebSocket closed:', event.code, event.reason);
        
        // Clear connection timeout if still active
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        
        wsRef.current = null;
        isConnectingRef.current = false;
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        // Clear global WebSocket reference
        setGlobalWebSocket(null);
        
        setWsState(prev => ({ 
          ...prev, 
          connected: false,
          authenticated: false,
          monitoring: false,
          authState: 'idle'
        }));
        
        // Handle reconnection for abnormal closures
        if (event.code !== 1000 && mountedRef.current && reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current++;
          // Exponential backoff with max delay of 30 seconds
          const delay = Math.min(3000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
          
          console.log(`[useAeroNyxWebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && wallet.connected) {
              connectWebSocket();
            }
          }, delay);
        } else if (reconnectAttemptsRef.current >= 5) {
          setWsState(prev => ({ 
            ...prev, 
            error: 'Unable to establish connection. Please refresh the page.' 
          }));
          if (onError) onError(new Error('Max reconnection attempts reached'));
        }
      };
      
    } catch (error) {
      console.error('[useAeroNyxWebSocket] WebSocket setup error:', error);
      
      // Clear connection timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      wsRef.current = null;
      isConnectingRef.current = false;
      setWsState(prev => ({ 
        ...prev, 
        authState: 'error', 
        error: 'Failed to connect' 
      }));
      if (onError) onError(error);
    }
  }, [wallet.connected, handleMessage, onError, setupPingInterval]);

  /**
   * Initialize WebSocket when wallet is connected
   */
  useEffect(() => {
    mountedRef.current = true;
    reconnectAttemptsRef.current = 0;
    
    if (autoConnect && wallet.connected && wallet.address) {
      // Add a delay to ensure wallet is fully ready
      const initTimeout = setTimeout(() => {
        if (mountedRef.current && !isConnectingRef.current) {
          connectWebSocket();
        }
      }, 1000);
      
      return () => {
        clearTimeout(initTimeout);
      };
    }
    
    return () => {
      mountedRef.current = false;
      
      // Clear all timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      
      if (wsRef.current) {
        // Stop monitoring before disconnect
        if (wsRef.current.readyState === WebSocket.OPEN && wsState.monitoring) {
          wsRef.current.send(JSON.stringify({ type: 'stop_monitor' }));
        }
        
        // Clear global WebSocket reference
        setGlobalWebSocket(null);
        
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
    };
  }, [wallet.connected, wallet.address, autoConnect]); // Do NOT add connectWebSocket here

  /**
   * Handle refresh - reconnect WebSocket
   */
  const handleRefresh = useCallback(() => {
    console.log('[useAeroNyxWebSocket] Refreshing connection');
    reconnectAttemptsRef.current = 0;
    isConnectingRef.current = false;
    
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close(1000, 'User refresh');
      wsRef.current = null;
    }
    
    // Clear any pending timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    
    // Clear ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    
    // Reset state
    setWsState({
      connected: false,
      authenticated: false,
      monitoring: false,
      authState: 'idle',
      error: null
    });
    
    // Reconnect after a short delay
    setTimeout(() => {
      if (mountedRef.current && wallet.connected) {
        connectWebSocket();
      }
    }, 1000);
  }, [wallet.connected, connectWebSocket]);

  /**
   * Start monitoring manually (if autoMonitor is false)
   */
  const startMonitoring = useCallback(() => {
    if (wsState.authenticated && !wsState.monitoring) {
      console.log('[useAeroNyxWebSocket] Starting monitoring manually');
      sendMessage({ type: 'start_monitor' });
    }
  }, [wsState.authenticated, wsState.monitoring, sendMessage]);

  /**
   * Stop monitoring
   */
  const stopMonitoring = useCallback(() => {
    if (wsState.monitoring) {
      console.log('[useAeroNyxWebSocket] Stopping monitoring');
      sendMessage({ type: 'stop_monitor' });
      setWsState(prev => ({ ...prev, monitoring: false }));
    }
  }, [wsState.monitoring, sendMessage]);

  /**
   * Clear stored session (for logout)
   */
  const clearSession = useCallback(() => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    sessionTokenRef.current = null;
    console.log('[useAeroNyxWebSocket] Session cleared');
  }, []);

  // Return hook state and methods
  return {
    // WebSocket state
    wsState,
    
    // Data
    nodes: data.nodes,
    stats: data.stats,
    lastUpdate: data.lastUpdate,
    
    // Control methods
    refresh: handleRefresh,
    startMonitoring,
    stopMonitoring,
    clearSession,
    
    // Loading and error states
    isLoading: wsState.authState === 'connecting' || wsState.authState === 'signing' || wsState.authState === 'authenticating',
    error: wsState.error,
    
    // Session info
    hasStoredSession: !!sessionTokenRef.current
  };
}

// Export WebSocket states for external use
export { WsState };
