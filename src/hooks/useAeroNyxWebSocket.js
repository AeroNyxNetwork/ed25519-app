/**
 * Fixed Unified WebSocket Hook with Global Signature Support
 * 
 * File Path: src/hooks/useAeroNyxWebSocket.js
 * 
 * @version 2.2.0
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import { setGlobalWebSocket, setGlobalWsState } from './useRemoteManagement';
import globalSignatureManager from '../lib/utils/globalSignatureManager';

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
  const mountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const hasInitializedSignatureRef = useRef(false);

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
   * Send message through WebSocket
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
   * Sign message using global signature manager
   */
  const signMessage = useCallback(async (message) => {
    console.log('[useAeroNyxWebSocket] Getting signature from global manager');
    
    try {
      // Use global signature manager
      const signatureData = await globalSignatureManager.waitForSignature(wallet);
      
      console.log('[useAeroNyxWebSocket] Got signature from global manager');
      return signatureData.signature;
    } catch (error) {
      console.error('[useAeroNyxWebSocket] Failed to get signature:', error);
      throw error;
    }
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
          // Step 1: WebSocket connected, use global signature
          console.log('[useAeroNyxWebSocket] WebSocket connected, using global signature');
          setWsState(prev => ({ ...prev, connected: true, authState: 'authenticating', error: null }));
          
          // Get signature from global manager
          try {
            const signatureData = await globalSignatureManager.waitForSignature(wallet);
            
            // Extract wallet address from message for consistency
            const walletMatch = signatureData.message.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/);
            const messageWallet = walletMatch ? walletMatch[1] : wallet.address;
            
            // Send auth directly with global signature
            const authMessage = {
              type: 'auth',
              wallet_address: messageWallet.toLowerCase(),
              signature: signatureData.signature,
              message: signatureData.message,
              wallet_type: 'okx'
            };
            
            console.log('[useAeroNyxWebSocket] Sending auth with global signature');
            sendMessage(authMessage);
            
          } catch (error) {
            console.error('[useAeroNyxWebSocket] Failed to get global signature:', error);
            setWsState(prev => ({ 
              ...prev, 
              authState: 'error', 
              error: 'Failed to get signature: ' + error.message 
            }));
            if (onError) onError(error);
          }
          break;
          
        case 'signature_message':
          // We shouldn't receive this anymore when using global signature
          console.log('[useAeroNyxWebSocket] Received signature_message but using global signature');
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
            console.log('[useAeroNyxWebSocket] Authentication required, getting new signature');
            setWsState(prev => ({ ...prev, authenticated: false, authState: 'authenticating' }));
            
            // Get new signature from global manager
            try {
              const signatureData = await globalSignatureManager.waitForSignature(wallet);
              
              const walletMatch = signatureData.message.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/);
              const messageWallet = walletMatch ? walletMatch[1] : wallet.address;
              
              const authMessage = {
                type: 'auth',
                wallet_address: messageWallet.toLowerCase(),
                signature: signatureData.signature,
                message: signatureData.message,
                wallet_type: 'okx'
              };
              
              sendMessage(authMessage);
            } catch (error) {
              console.error('[useAeroNyxWebSocket] Failed to re-authenticate:', error);
              setWsState(prev => ({ 
                ...prev, 
                authState: 'error', 
                error: 'Failed to re-authenticate: ' + error.message 
              }));
            }
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
  }, [wallet, sendMessage, processNodesData, autoMonitor, onStatusChange, onError]);

  /**
   * Connect to WebSocket
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
   * Initialize WebSocket when wallet is connected and signature is ready
   */
  useEffect(() => {
    mountedRef.current = true;
    reconnectAttemptsRef.current = 0;
    
    if (autoConnect && wallet.connected && wallet.address) {
      // First ensure global signature is ready
      if (!hasInitializedSignatureRef.current) {
        hasInitializedSignatureRef.current = true;
        console.log('[useAeroNyxWebSocket] Initializing global signature manager');
        
        globalSignatureManager.initialize(wallet).then(() => {
          console.log('[useAeroNyxWebSocket] Global signature ready, connecting WebSocket');
          if (mountedRef.current && !wsRef.current && !isConnectingRef.current) {
            connectWebSocket();
          }
        }).catch((error) => {
          console.error('[useAeroNyxWebSocket] Failed to initialize global signature:', error);
          setWsState(prev => ({ 
            ...prev, 
            authState: 'error', 
            error: 'Failed to initialize signature: ' + error.message 
          }));
          if (onError) onError(error);
        });
      }
    }
    
    return () => {
      mountedRef.current = false;
      isConnectingRef.current = false;
      hasInitializedSignatureRef.current = false;
      
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
  }, [wallet.connected, wallet.address, autoConnect, onError]); // Do NOT add connectWebSocket here

  /**
   * Handle refresh - reconnect WebSocket
   */
  const handleRefresh = useCallback(() => {
    console.log('[useAeroNyxWebSocket] Refreshing connection');
    reconnectAttemptsRef.current = 0;
    isConnectingRef.current = false;
    hasInitializedSignatureRef.current = false;
    
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
    
    // Re-initialize with global signature
    if (wallet.connected && wallet.address) {
      globalSignatureManager.initialize(wallet).then(() => {
        console.log('[useAeroNyxWebSocket] Global signature ready for refresh');
        if (mountedRef.current && wallet.connected) {
          connectWebSocket();
        }
      }).catch((error) => {
        console.error('[useAeroNyxWebSocket] Failed to refresh signature:', error);
        setWsState(prev => ({ 
          ...prev, 
          authState: 'error', 
          error: 'Failed to refresh signature: ' + error.message 
        }));
      });
    }
  }, [wallet.connected, wallet.address, connectWebSocket]);

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
