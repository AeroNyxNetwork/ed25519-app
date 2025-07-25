/**
 * Unified WebSocket Hook for AeroNyx Platform
 * 
 * File Path: src/hooks/useAeroNyxWebSocket.js
 * 
 * This hook encapsulates the WebSocket connection logic from DashboardContent.js
 * to be reused across multiple components. It follows the exact same flow:
 * 1. Connect to wss://api.aeronyx.network/ws/aeronyx/user-monitor/
 * 2. Receive 'connected' message
 * 3. Send 'get_message' with wallet_address
 * 4. Receive 'signature_message' with message to sign
 * 5. Sign message with wallet
 * 6. Send 'auth' with signature
 * 7. Receive 'auth_success' with nodes
 * 8. Send 'start_monitor' to begin monitoring
 * 9. Receive periodic 'status_update' messages
 * 
 * IMPORTANT: This is the ONLY WebSocket connection logic in the entire application.
 * All components MUST use this hook instead of implementing their own WebSocket logic.
 * 
 * @version 2.1.0
 * @author AeroNyx Development Team
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import { setGlobalWebSocket, setGlobalWsState } from './useRemoteManagement';

/**
 * WebSocket connection states - matching DashboardContent exactly
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

/**
 * Unified WebSocket Hook
 * 
 * @param {Object} options - Hook configuration options
 * @param {boolean} options.autoConnect - Auto-connect when wallet is ready (default: true)
 * @param {boolean} options.autoMonitor - Auto-start monitoring after auth (default: true)
 * @param {Function} options.onNodesUpdate - Callback when nodes are updated
 * @param {Function} options.onStatusChange - Callback when connection status changes
 * @param {Function} options.onError - Callback when errors occur
 * @returns {Object} WebSocket state and control methods
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

  // State management - exactly like DashboardContent
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

  // Refs - exactly like DashboardContent
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);

  // Update global WebSocket state whenever it changes
  useEffect(() => {
    setGlobalWsState(wsState);
  }, [wsState]);

  /**
   * Calculate resource utilization from nodes
   * Copied exactly from DashboardContent
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
   * Copied exactly from DashboardContent
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
   * Send message through WebSocket
   * Copied exactly from DashboardContent
   */
  const sendMessage = useCallback((messageData) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[useAeroNyxWebSocket] Sending message:', messageData.type, messageData);
      wsRef.current.send(JSON.stringify(messageData));
    } else {
      console.warn('[useAeroNyxWebSocket] Cannot send message - WebSocket not open');
    }
  }, []);

  /**
   * Sign message with wallet
   * CRITICAL: Must extract wallet address from message to ensure consistency
   * Copied exactly from DashboardContent
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
   * Copied exactly from DashboardContent with modifications for reusability
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
          // Step 1: WebSocket connected, request signature message
          console.log('[useAeroNyxWebSocket] WebSocket connected, requesting signature message');
          setWsState(prev => ({ ...prev, connected: true, authState: 'requesting_message', error: null }));
          
          const getMessageRequest = {
            type: 'get_message',
            wallet_address: wallet.address.toLowerCase()
          };
          console.log('[useAeroNyxWebSocket] Sending get_message request:', getMessageRequest);
          sendMessage(getMessageRequest);
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
            
            // Build auth message
            const authMessage = {
              type: 'auth',
              wallet_address: messageWallet.toLowerCase(),
              signature: signature,
              message: messageData.message,
              wallet_type: 'okx'
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
          console.log('[useAeroNyxWebSocket] Nodes received:', messageData.nodes ? messageData.nodes.length : 0);
          
          setWsState(prev => ({ 
            ...prev, 
            authenticated: true, 
            authState: 'authenticated',
            error: null
          }));
          
          reconnectAttemptsRef.current = 0;
          
          // Process initial nodes if provided
          if (messageData.nodes) {
            console.log('[useAeroNyxWebSocket] Processing nodes data');
            const initialNodes = messageData.nodes.map((node) => ({
              code: node.code,
              name: node.name,
              id: node.id,
              status: 'unknown',
              type: 'unknown',
              performance: { cpu: 0, memory: 0, disk: 0, network: 0 },
              earnings: 0,
              last_seen: null
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
          setWsState(prev => ({ ...prev, monitoring: true }));
          break;
          
        case 'status_update':
          // Step 5: Periodic status updates
          console.log('[useAeroNyxWebSocket] Received status update');
          setWsState(prev => ({ ...prev, monitoring: true }));
          processNodesData(messageData);
          break;
          
        case 'error':
          console.error('[useAeroNyxWebSocket] Server error:', messageData.message);
          setWsState(prev => ({ 
            ...prev, 
            error: messageData.message || 'Server error'
          }));
          
          if (onError) onError(new Error(messageData.message || 'Server error'));
          
          // Handle authentication errors
          if (messageData.error_code === 'authentication_required' || messageData.error_code === 'invalid_signature') {
            console.log('[useAeroNyxWebSocket] Authentication required, restarting auth flow');
            setWsState(prev => ({ ...prev, authenticated: false, authState: 'requesting_message' }));
            sendMessage({
              type: 'get_message',
              wallet_address: wallet.address.toLowerCase()
            });
          }
          break;
          
        case 'pong':
          console.log('[useAeroNyxWebSocket] Pong received at', new Date().toISOString());
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
   * Connect to WebSocket
   * Copied exactly from DashboardContent
   */
  const connectWebSocket = useCallback(() => {
    // Prevent multiple simultaneous connections
    if (!wallet.connected || isConnectingRef.current || wsRef.current) {
      console.log('[useAeroNyxWebSocket] Skipping connection:', {
        walletConnected: wallet.connected,
        isConnecting: isConnectingRef.current,
        hasWebSocket: !!wsRef.current
      });
      return;
    }
    
    isConnectingRef.current = true;
    setWsState(prev => ({ ...prev, authState: 'connecting', error: null }));
    
    try {
      console.log('[useAeroNyxWebSocket] Connecting to WebSocket');
      const ws = new WebSocket('wss://api.aeronyx.network/ws/aeronyx/user-monitor/');
      wsRef.current = ws;
      
      // Connection timeout
      const timeoutId = setTimeout(() => {
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
      }, 10000);
      
      ws.onopen = () => {
        console.log('[useAeroNyxWebSocket] WebSocket opened');
        clearTimeout(timeoutId);
        // Wait for 'connected' message from server
        
        // Expose WebSocket instance for remote management
        setGlobalWebSocket(ws);
      };
      
      ws.onmessage = handleMessage;
      
      ws.onerror = (error) => {
        console.error('[useAeroNyxWebSocket] WebSocket error:', error);
        clearTimeout(timeoutId);
        setWsState(prev => ({ 
          ...prev, 
          error: 'Connection error' 
        }));
        if (onError) onError(error);
      };
      
      ws.onclose = (event) => {
        console.log('[useAeroNyxWebSocket] WebSocket closed:', event.code, event.reason);
        clearTimeout(timeoutId);
        wsRef.current = null;
        isConnectingRef.current = false;
        
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
          const delay = Math.min(3000 * reconnectAttemptsRef.current, 15000);
          
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
      
      // Set up ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
      
      // Store interval ID for cleanup
      ws.pingInterval = pingInterval;
      
    } catch (error) {
      console.error('[useAeroNyxWebSocket] WebSocket setup error:', error);
      wsRef.current = null;
      isConnectingRef.current = false;
      setWsState(prev => ({ 
        ...prev, 
        authState: 'error', 
        error: 'Failed to connect' 
      }));
      if (onError) onError(error);
    }
  }, [wallet.connected, handleMessage, onError]);

  /**
   * Initialize WebSocket when wallet is connected
   * Copied exactly from DashboardContent
   */
  useEffect(() => {
    mountedRef.current = true;
    reconnectAttemptsRef.current = 0;
    
    if (autoConnect && wallet.connected && wallet.address) {
      // Add a small delay to ensure wallet is fully ready
      const initTimeout = setTimeout(() => {
        if (mountedRef.current && !wsRef.current && !isConnectingRef.current) {
          connectWebSocket();
        }
      }, 500);
      
      return () => {
        clearTimeout(initTimeout);
      };
    }
    
    return () => {
      mountedRef.current = false;
      isConnectingRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        // Stop monitoring before disconnect
        if (wsRef.current.readyState === WebSocket.OPEN && wsState.monitoring) {
          wsRef.current.send(JSON.stringify({ type: 'stop_monitor' }));
        }
        
        // Clear ping interval
        if (wsRef.current.pingInterval) {
          clearInterval(wsRef.current.pingInterval);
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
   * Copied exactly from DashboardContent
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
    
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
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
    }, 500);
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
    
    // Loading and error states
    isLoading: wsState.authState === 'connecting' || wsState.authState === 'signing' || wsState.authState === 'authenticating',
    error: wsState.error
  };
}

// Export WebSocket states for external use
export { WsState };
