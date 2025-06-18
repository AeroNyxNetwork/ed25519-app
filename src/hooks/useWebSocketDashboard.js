// src/hooks/useWebSocketDashboard.js
/**
 * Production-Ready WebSocket Dashboard Hook
 * Integrates with AeroNyx WebSocket API for real-time monitoring
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../lib/utils/walletSignature';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://api.aeronyx.network';
const WS_ENDPOINT = `${WS_URL}/ws/aeronyx/user-monitor/`;

const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATED: 'authenticated',
  MONITORING: 'monitoring',
  ERROR: 'error',
  RECONNECTING: 'reconnecting'
};

const RECONNECT_CONFIG = {
  maxAttempts: 5,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2
};

export default function useWebSocketDashboard(options = {}) {
  const { wallet } = useWallet();
  const {
    autoConnect = true,
    autoMonitor = true,
    enableReconnect = true,
    onDataUpdate,
    onError,
    onConnectionChange
  } = options;

  // Connection state
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.DISCONNECTED);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Dashboard data
  const [dashboardData, setDashboardData] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [nodesByStatus, setNodesByStatus] = useState({
    online: [],
    active: [],
    offline: []
  });
  const [summary, setSummary] = useState({
    total_nodes: 0,
    online_nodes: 0,
    active_nodes: 0,
    offline_nodes: 0,
    total_earnings: 0
  });
  const [performanceOverview, setPerformanceOverview] = useState(null);

  // Error and metadata
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [updateSequence, setUpdateSequence] = useState(0);
  const [connectionMetrics, setConnectionMetrics] = useState({
    latency: 0,
    messagesReceived: 0,
    reconnectAttempts: 0,
    uptime: 0
  });

  // Refs for lifecycle management
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const connectionStartTimeRef = useRef(null);
  const isUnmountedRef = useRef(false);

  /**
   * Update connection state with logging and callbacks
   */
  const updateConnectionState = useCallback((newState, errorInfo = null) => {
    if (isUnmountedRef.current) return;
    
    setConnectionState(newState);
    setIsConnected(newState === CONNECTION_STATES.CONNECTED || 
                  newState === CONNECTION_STATES.AUTHENTICATED || 
                  newState === CONNECTION_STATES.MONITORING);
    
    if (errorInfo) {
      setError(errorInfo);
      onError?.(errorInfo);
    } else {
      setError(null);
    }
    
    onConnectionChange?.(newState);
    
    console.log(`[WebSocketDashboard] State: ${newState}`, errorInfo || '');
  }, [onConnectionChange, onError]);

  /**
   * Create WebSocket connection
   */
  const createConnection = useCallback(async () => {
    if (!wallet?.connected || !wallet?.address) {
      updateConnectionState(CONNECTION_STATES.ERROR, 
        new Error('Wallet not connected'));
      return;
    }

    try {
      updateConnectionState(CONNECTION_STATES.CONNECTING);
      
      const ws = new WebSocket(WS_ENDPOINT);
      wsRef.current = ws;
      connectionStartTimeRef.current = Date.now();

      ws.onopen = () => {
        if (isUnmountedRef.current) return;
        updateConnectionState(CONNECTION_STATES.CONNECTED);
        reconnectAttemptsRef.current = 0;
        
        setConnectionMetrics(prev => ({
          ...prev,
          reconnectAttempts: 0
        }));
      };

      ws.onmessage = (event) => {
        if (isUnmountedRef.current) return;
        handleWebSocketMessage(event);
      };

      ws.onerror = (error) => {
        if (isUnmountedRef.current) return;
        console.error('[WebSocketDashboard] Connection error:', error);
        updateConnectionState(CONNECTION_STATES.ERROR, 
          new Error('WebSocket connection failed'));
      };

      ws.onclose = (event) => {
        if (isUnmountedRef.current) return;
        handleWebSocketClose(event);
      };

    } catch (error) {
      console.error('[WebSocketDashboard] Failed to create connection:', error);
      updateConnectionState(CONNECTION_STATES.ERROR, error);
      
      if (enableReconnect) {
        scheduleReconnect();
      }
    }
  }, [wallet?.connected, wallet?.address, enableReconnect, updateConnectionState]);

  /**
   * Handle incoming WebSocket messages
   */
  const handleWebSocketMessage = useCallback((event) => {
    try {
      const message = JSON.parse(event.data);
      
      setConnectionMetrics(prev => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        uptime: connectionStartTimeRef.current 
          ? Date.now() - connectionStartTimeRef.current 
          : 0
      }));

      switch (message.type) {
        case 'connection_established':
          console.log('[WebSocketDashboard] Connection established, authenticating...');
          authenticateWithWallet();
          break;

        case 'auth_success':
          console.log('[WebSocketDashboard] Authentication successful');
          setIsAuthenticated(true);
          updateConnectionState(CONNECTION_STATES.AUTHENTICATED);
          
          if (autoMonitor) {
            startMonitoring();
          }
          break;

        case 'auth_failed':
          console.error('[WebSocketDashboard] Authentication failed:', message.message);
          updateConnectionState(CONNECTION_STATES.ERROR, 
            new Error(`Authentication failed: ${message.message}`));
          break;

        case 'monitoring_started':
          console.log('[WebSocketDashboard] Monitoring started');
          setIsMonitoring(true);
          updateConnectionState(CONNECTION_STATES.MONITORING);
          break;

        case 'monitoring_stopped':
          console.log('[WebSocketDashboard] Monitoring stopped');
          setIsMonitoring(false);
          updateConnectionState(CONNECTION_STATES.AUTHENTICATED);
          break;

        case 'real_time_update':
          handleRealtimeUpdate(message);
          break;

        case 'pong':
          const latency = Date.now() - message.timestamp;
          setConnectionMetrics(prev => ({
            ...prev,
            latency
          }));
          break;

        case 'error':
          console.error('[WebSocketDashboard] Server error:', message);
          updateConnectionState(CONNECTION_STATES.ERROR, 
            new Error(`${message.error_code}: ${message.message}`));
          break;

        default:
          console.log('[WebSocketDashboard] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[WebSocketDashboard] Failed to parse message:', error);
    }
  }, [autoMonitor, updateConnectionState]);

  /**
   * Handle WebSocket close event
   */
  const handleWebSocketClose = useCallback((event) => {
    console.log(`[WebSocketDashboard] Connection closed: ${event.code} - ${event.reason}`);
    
    setIsAuthenticated(false);
    setIsMonitoring(false);
    wsRef.current = null;

    const shouldReconnect = enableReconnect && 
      event.code !== 1000 && // Normal closure
      event.code !== 4006 && // Account locked
      event.code !== 4007 && // Too many auth attempts
      reconnectAttemptsRef.current < RECONNECT_CONFIG.maxAttempts;

    if (shouldReconnect) {
      updateConnectionState(CONNECTION_STATES.RECONNECTING);
      scheduleReconnect();
    } else {
      updateConnectionState(CONNECTION_STATES.DISCONNECTED);
    }
  }, [enableReconnect, updateConnectionState]);

  /**
   * Authenticate with wallet signature
   */
  const authenticateWithWallet = useCallback(async () => {
    try {
      // Generate signature message
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }

      const message = messageResponse.data.message;
      const formattedMessage = formatMessageForSigning(message);
      const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);

      // Send authentication
      sendMessage({
        type: 'auth',
        wallet_address: wallet.address,
        signature: signature,
        message: message,
        wallet_type: 'okx'
      });

    } catch (error) {
      console.error('[WebSocketDashboard] Authentication failed:', error);
      updateConnectionState(CONNECTION_STATES.ERROR, error);
    }
  }, [wallet.address, wallet.provider, updateConnectionState]);

  /**
   * Handle real-time update from WebSocket
   */
  const handleRealtimeUpdate = useCallback((message) => {
    const { data, sequence, timestamp } = message;
    
    // Process nodes data - WebSocket returns flat array, need to categorize
    const categorizedNodes = {
      online: [],
      active: [],
      offline: []
    };

    data.nodes?.forEach(node => {
      const isConnected = node.connection?.connected || false;
      const isActive = node.status === 'active';

      if (isConnected && isActive) {
        categorizedNodes.online.push(node);
      } else if (isActive) {
        categorizedNodes.active.push(node);
      } else {
        categorizedNodes.offline.push(node);
      }
    });

    // Update state
    setNodes(data.nodes || []);
    setNodesByStatus(categorizedNodes);
    setSummary(data.summary || {
      total_nodes: 0,
      online_nodes: 0,
      active_nodes: 0,
      offline_nodes: 0,
      total_earnings: 0
    });
    setPerformanceOverview(data.performance_overview);
    setLastUpdate(new Date(timestamp));
    setUpdateSequence(sequence || 0);

    // Create dashboard data structure compatible with existing components
    const dashboardData = {
      stats: {
        totalNodes: data.summary?.total_nodes || 0,
        activeNodes: data.summary?.online_nodes || 0,
        offlineNodes: data.summary?.offline_nodes || 0,
        pendingNodes: Math.max(0, 
          (data.summary?.total_nodes || 0) - 
          (data.summary?.online_nodes || 0) - 
          (data.summary?.offline_nodes || 0)
        ),
        totalEarnings: parseFloat(data.summary?.total_earnings || 0),
        networkContribution: calculateNetworkContribution(categorizedNodes.online),
        resourceUtilization: calculateResourceUtilization(data.nodes || [])
      },
      nodes: (data.nodes || []).slice(0, 4), // Dashboard preview
      timestamp: new Date(timestamp).toISOString(),
      source: 'websocket'
    };

    setDashboardData(dashboardData);

    // Trigger callback
    onDataUpdate?.({
      dashboardData,
      nodes: data.nodes,
      nodesByStatus: categorizedNodes,
      summary: data.summary,
      performanceOverview: data.performance_overview,
      updateSequence: sequence,
      timestamp
    });

  }, [onDataUpdate]);

  /**
   * Calculate network contribution
   */
  const calculateNetworkContribution = useCallback((onlineNodes) => {
    const nodeCount = onlineNodes?.length || 0;
    return `${(nodeCount * 0.0015).toFixed(4)}%`;
  }, []);

  /**
   * Calculate resource utilization
   */
  const calculateResourceUtilization = useCallback((nodes) => {
    const activeNodes = nodes.filter(n => 
      n.status === 'active' && n.connection?.connected
    );
    
    if (activeNodes.length === 0) return 0;
    
    const totalUtil = activeNodes.reduce((sum, node) => {
      const cpu = node.performance?.cpu_usage || 0;
      const memory = node.performance?.memory_usage || 0;
      return sum + ((cpu + memory) / 2);
    }, 0);
    
    return Math.round(totalUtil / activeNodes.length);
  }, []);

  /**
   * Send message through WebSocket
   */
  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          ...message,
          timestamp: new Date().toISOString()
        }));
        return true;
      } catch (error) {
        console.error('[WebSocketDashboard] Failed to send message:', error);
        return false;
      }
    }
    return false;
  }, []);

  /**
   * Schedule reconnection attempt
   */
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const attempt = reconnectAttemptsRef.current + 1;
    const delay = Math.min(
      RECONNECT_CONFIG.baseDelay * Math.pow(RECONNECT_CONFIG.backoffMultiplier, attempt - 1),
      RECONNECT_CONFIG.maxDelay
    );

    console.log(`[WebSocketDashboard] Reconnecting in ${delay}ms (attempt ${attempt})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      if (!isUnmountedRef.current) {
        reconnectAttemptsRef.current = attempt;
        setConnectionMetrics(prev => ({
          ...prev,
          reconnectAttempts: attempt
        }));
        createConnection();
      }
    }, delay);
  }, [createConnection]);

  /**
   * Start real-time monitoring
   */
  const startMonitoring = useCallback(() => {
    if (!isAuthenticated) {
      console.warn('[WebSocketDashboard] Cannot start monitoring - not authenticated');
      return false;
    }

    return sendMessage({ type: 'start_monitoring' });
  }, [isAuthenticated, sendMessage]);

  /**
   * Stop real-time monitoring
   */
  const stopMonitoring = useCallback(() => {
    if (!isMonitoring) {
      console.warn('[WebSocketDashboard] Monitoring not active');
      return false;
    }

    return sendMessage({ type: 'stop_monitoring' });
  }, [isMonitoring, sendMessage]);

  /**
   * Get current status snapshot
   */
  const getCurrentStatus = useCallback(() => {
    return sendMessage({ type: 'get_current_status' });
  }, [sendMessage]);

  /**
   * Send ping for latency test
   */
  const ping = useCallback(() => {
    return sendMessage({ 
      type: 'ping', 
      timestamp: Date.now() 
    });
  }, [sendMessage]);

  /**
   * Manually connect
   */
  const connect = useCallback(() => {
    if (connectionState === CONNECTION_STATES.CONNECTING || isConnected) {
      console.warn('[WebSocketDashboard] Already connected or connecting');
      return;
    }

    createConnection();
  }, [connectionState, isConnected, createConnection]);

  /**
   * Manually disconnect
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    }

    setIsAuthenticated(false);
    setIsMonitoring(false);
    updateConnectionState(CONNECTION_STATES.DISCONNECTED);
  }, [updateConnectionState]);

  /**
   * Subscribe to specific node
   */
  const subscribeToNode = useCallback((referenceCode) => {
    return sendMessage({
      type: 'subscribe_node',
      reference_code: referenceCode
    });
  }, [sendMessage]);

  /**
   * Unsubscribe from specific node
   */
  const unsubscribeFromNode = useCallback((referenceCode) => {
    return sendMessage({
      type: 'unsubscribe_node',
      reference_code: referenceCode
    });
  }, [sendMessage]);

  // Auto-connect effect
  useEffect(() => {
    isUnmountedRef.current = false;

    if (autoConnect && wallet?.connected && wallet?.address) {
      createConnection();
    }

    return () => {
      isUnmountedRef.current = true;
      disconnect();
    };
  }, [autoConnect, wallet?.connected, wallet?.address]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Connection health indicator
  const connectionHealth = useMemo(() => {
    switch (connectionState) {
      case CONNECTION_STATES.MONITORING:
        return { status: 'excellent', label: 'Live Monitoring', color: 'green' };
      case CONNECTION_STATES.AUTHENTICATED:
        return { status: 'good', label: 'Authenticated', color: 'blue' };
      case CONNECTION_STATES.CONNECTED:
        return { status: 'fair', label: 'Connected', color: 'yellow' };
      case CONNECTION_STATES.CONNECTING:
      case CONNECTION_STATES.RECONNECTING:
        return { status: 'connecting', label: 'Connecting...', color: 'yellow' };
      case CONNECTION_STATES.ERROR:
        return { status: 'error', label: 'Connection Error', color: 'red' };
      default:
        return { status: 'disconnected', label: 'Disconnected', color: 'gray' };
    }
  }, [connectionState]);

  return {
    // Connection state
    connectionState,
    isConnected,
    isAuthenticated,
    isMonitoring,
    connectionHealth,

    // Data
    dashboardData,
    nodes,
    nodesByStatus,
    summary,
    performanceOverview,

    // Metadata
    error,
    lastUpdate,
    updateSequence,
    connectionMetrics,

    // Actions
    connect,
    disconnect,
    startMonitoring,
    stopMonitoring,
    getCurrentStatus,
    ping,
    subscribeToNode,
    unsubscribeFromNode,

    // Utilities
    sendMessage
  };
}
