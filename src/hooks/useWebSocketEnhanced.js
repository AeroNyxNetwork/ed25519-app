/**
 * Enhanced WebSocket Hook for AeroNyx Platform
 * 
 * File Path: src/hooks/useWebSocketEnhanced.js
 * 
 * Production-ready React hook for WebSocket integration with proper data
 * transformation between REST API and WebSocket formats, comprehensive
 * error handling, and real-time updates.
 * 
 * Features:
 * - Handles data structure differences between REST and WebSocket
 * - Automatic connection management with error recovery
 * - Real-time node status updates with proper categorization
 * - Performance monitoring and alerts
 * - Data synchronization between REST and WebSocket sources
 * - Memory leak prevention with proper cleanup
 * - Comprehensive state management
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import UserMonitorWebSocketService from '../lib/websocket/UserMonitorWebSocketService';
import ErrorRecoveryStrategy from '../lib/websocket/ErrorRecoveryStrategy';
import { transformWebSocketToREST, isValidWebSocketMessage } from '../lib/utils/websocketDataTransformer';

/**
 * Configuration for WebSocket behavior
 */
const WS_CONFIG = {
  RECONNECT_DELAY: 3000,
  MAX_RECONNECT_ATTEMPTS: 5,
  HEARTBEAT_INTERVAL: 30000,
  PERFORMANCE_ALERT_THRESHOLD: {
    CPU: 80,
    MEMORY: 80,
    LATENCY: 1000 // milliseconds
  },
  MESSAGE_DEBOUNCE: 100 // milliseconds
};

/**
 * Connection states
 */
const CONNECTION_STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATED: 'authenticated',
  MONITORING: 'monitoring',
  ERROR: 'error',
  RECONNECTING: 'reconnecting'
};

/**
 * Enhanced WebSocket Hook for User Node Monitoring
 * 
 * @param {Object} walletCredentials - Wallet authentication credentials
 * @param {string} walletCredentials.walletAddress - User's wallet address
 * @param {string} walletCredentials.signature - Signed message
 * @param {string} walletCredentials.message - Original message
 * @param {string} walletCredentials.walletType - Wallet type (default: 'okx')
 * @param {Object} options - Hook configuration options
 * @param {boolean} options.autoConnect - Auto-connect on mount (default: true)
 * @param {boolean} options.autoMonitor - Auto-start monitoring after auth (default: true)
 * @param {Function} options.onNodesUpdated - Callback when nodes are updated
 * @param {Function} options.onError - Error callback
 * @param {Function} options.onStateChange - Connection state change callback
 * @returns {Object} WebSocket state and control methods
 */
export function useUserMonitorWebSocket(walletCredentials, options = {}) {
  const {
    autoConnect = true,
    autoMonitor = true,
    onNodesUpdated,
    onError,
    onStateChange
  } = options;
  
  // ==================== STATE MANAGEMENT ====================
  
  // Connection state
  const [connectionState, setConnectionState] = useState(CONNECTION_STATE.DISCONNECTED);
  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  
  // Data state
  const [nodes, setNodes] = useState([]);
  const [nodesByStatus, setNodesByStatus] = useState({
    online: [],   // WebSocket connected AND status='active'
    active: [],   // status='active' BUT no WebSocket
    offline: []   // All other statuses
  });
  const [summary, setSummary] = useState(null);
  const [performanceStats, setPerformanceStats] = useState(null);
  
  // Monitoring state
  const [lastUpdate, setLastUpdate] = useState(null);
  const [updateSequence, setUpdateSequence] = useState(0);
  const [updateSource, setUpdateSource] = useState(null); // 'websocket' or 'rest'
  
  // Error and performance state
  const [error, setError] = useState(null);
  const [performanceAlerts, setPerformanceAlerts] = useState([]);
  const [connectionMetrics, setConnectionMetrics] = useState({
    latency: 0,
    messagesReceived: 0,
    lastHeartbeat: null,
    uptime: 0
  });
  
  // Refs for lifecycle management
  const wsServiceRef = useRef(null);
  const errorRecoveryRef = useRef(null);
  const mountedRef = useRef(true);
  const reconnectTimeoutRef = useRef(null);
  const updateDebounceRef = useRef(null);
  const metricsIntervalRef = useRef(null);
  
  // ==================== UTILITY FUNCTIONS ====================
  
  /**
   * Update connection state with callback
   */
  const updateConnectionState = useCallback((newState) => {
    setConnectionState(newState);
    setConnected(newState === CONNECTION_STATE.CONNECTED || 
                  newState === CONNECTION_STATE.AUTHENTICATED || 
                  newState === CONNECTION_STATE.MONITORING);
    
    if (onStateChange) {
      onStateChange(newState);
    }
  }, [onStateChange]);
  
  /**
   * Process WebSocket data and categorize nodes
   * Handles the flat array structure from WebSocket
   */
  const processWebSocketData = useCallback((wsData) => {
    if (!wsData || !wsData.nodes) return;
    
    // Categorize nodes based on connection status
    const categorized = {
      online: [],
      active: [],
      offline: []
    };
    
    wsData.nodes.forEach(node => {
      // Determine category based on WebSocket data structure
      const isConnected = node.connection?.connected || false;
      const isActive = node.status === 'active';
      
      if (isConnected && isActive) {
        categorized.online.push(node);
      } else if (isActive) {
        categorized.active.push(node);
      } else {
        categorized.offline.push(node);
      }
    });
    
    return categorized;
  }, []);
  
  /**
   * Check node performance and generate alerts
   */
  const checkPerformanceAlerts = useCallback((nodes) => {
    const alerts = [];
    const now = new Date();
    
    nodes.forEach(node => {
      // Check CPU usage
      if (node.performance?.cpu_usage > WS_CONFIG.PERFORMANCE_ALERT_THRESHOLD.CPU) {
        alerts.push({
          nodeId: node.reference_code,
          type: 'cpu',
          severity: node.performance.cpu_usage > 90 ? 'critical' : 'warning',
          message: `Node ${node.name}: High CPU usage (${node.performance.cpu_usage}%)`,
          timestamp: now
        });
      }
      
      // Check memory usage
      if (node.performance?.memory_usage > WS_CONFIG.PERFORMANCE_ALERT_THRESHOLD.MEMORY) {
        alerts.push({
          nodeId: node.reference_code,
          type: 'memory',
          severity: node.performance.memory_usage > 90 ? 'critical' : 'warning',
          message: `Node ${node.name}: High memory usage (${node.performance.memory_usage}%)`,
          timestamp: now
        });
      }
    });
    
    // Update alerts state (keep last 50)
    setPerformanceAlerts(prev => [...prev, ...alerts].slice(-50));
    
    return alerts;
  }, []);
  
  // ==================== WEBSOCKET EVENT HANDLERS ====================
  
  /**
   * Handle connection established
   */
  const handleConnected = useCallback(() => {
    if (!mountedRef.current) return;
    
    updateConnectionState(CONNECTION_STATE.CONNECTED);
    setError(null);
    
    // Reset error recovery on successful connection
    if (errorRecoveryRef.current) {
      errorRecoveryRef.current.recordSuccess();
    }
  }, [updateConnectionState]);
  
  /**
   * Handle authentication success
   */
  const handleAuthSuccess = useCallback((data) => {
    if (!mountedRef.current) return;
    
    setAuthenticated(true);
    updateConnectionState(CONNECTION_STATE.AUTHENTICATED);
    
    // Initialize nodes data from auth response
    if (data.nodes_summary) {
      setSummary({
        total_nodes: data.nodes_summary.total_nodes || 0,
        node_references: data.nodes_summary.node_references || []
      });
    }
    
    // Auto-start monitoring if configured
    if (autoMonitor && wsServiceRef.current) {
      wsServiceRef.current.startMonitoring();
    }
  }, [updateConnectionState, autoMonitor]);
  
  /**
   * Handle monitoring started
   */
  const handleMonitoringStarted = useCallback(() => {
    if (!mountedRef.current) return;
    
    setMonitoring(true);
    updateConnectionState(CONNECTION_STATE.MONITORING);
  }, [updateConnectionState]);
  
  /**
   * Handle real-time update
   * This is where we handle the data structure differences
   */
  const handleRealtimeUpdate = useCallback((update) => {
    if (!mountedRef.current) return;
    
    // Validate message format
    if (!isValidWebSocketMessage(update)) {
      console.warn('Invalid WebSocket message format:', update);
      return;
    }
    
    // Debounce rapid updates
    if (updateDebounceRef.current) {
      clearTimeout(updateDebounceRef.current);
    }
    
    updateDebounceRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      
      // Process and categorize nodes
      const categorizedNodes = processWebSocketData(update.data);
      
      // Update state
      setNodes(update.data.nodes || []);
      setNodesByStatus(categorizedNodes);
      setSummary(update.data.summary || null);
      setPerformanceStats(update.data.performance_overview || null);
      setLastUpdate(new Date(update.timestamp));
      setUpdateSequence(update.sequence || 0);
      setUpdateSource('websocket');
      
      // Check for performance alerts
      checkPerformanceAlerts(update.data.nodes || []);
      
      // Update connection metrics
      setConnectionMetrics(prev => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        lastHeartbeat: new Date()
      }));
      
      // Trigger callback with transformed data
      if (onNodesUpdated) {
        const transformedData = {
          nodes: update.data.nodes,
          nodesByStatus: categorizedNodes,
          summary: update.data.summary,
          performanceStats: update.data.performance_overview,
          realTimeInfo: update.data.real_time_info,
          updateSequence: update.sequence,
          timestamp: update.timestamp
        };
        
        onNodesUpdated(transformedData);
      }
    }, WS_CONFIG.MESSAGE_DEBOUNCE);
  }, [processWebSocketData, checkPerformanceAlerts, onNodesUpdated]);
  
  /**
   * Handle disconnection
   */
  const handleDisconnected = useCallback((event) => {
    if (!mountedRef.current) return;
    
    setAuthenticated(false);
    setMonitoring(false);
    updateConnectionState(CONNECTION_STATE.DISCONNECTED);
    
    // Record error for recovery strategy
    if (errorRecoveryRef.current && event.code) {
      errorRecoveryRef.current.recordError(event.code);
      
      // Check if should reconnect
      if (errorRecoveryRef.current.shouldReconnect(event.code)) {
        const delay = errorRecoveryRef.current.getNextDelay();
        updateConnectionState(CONNECTION_STATE.RECONNECTING);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && wsServiceRef.current) {
            wsServiceRef.current.connect();
          }
        }, delay);
      }
    }
  }, [updateConnectionState]);
  
  /**
   * Handle errors
   */
  const handleError = useCallback((error) => {
    if (!mountedRef.current) return;
    
    setError(error);
    updateConnectionState(CONNECTION_STATE.ERROR);
    
    if (onError) {
      onError(error);
    }
  }, [updateConnectionState, onError]);
  
  // ==================== WEBSOCKET SERVICE MANAGEMENT ====================
  
  /**
   * Create and configure WebSocket service
   */
  const createWebSocketService = useCallback(() => {
    if (!walletCredentials?.walletAddress) return null;
    
    // Create error recovery strategy
    errorRecoveryRef.current = new ErrorRecoveryStrategy({
      maxRetries: WS_CONFIG.MAX_RECONNECT_ATTEMPTS,
      onPermanentFailure: (data) => {
        setError({
          type: 'permanent_failure',
          message: data.reason,
          cooldownUntil: data.cooldownUntil
        });
      }
    });
    
    // Create WebSocket service
    const service = new UserMonitorWebSocketService(walletCredentials, {
      reconnect: false, // We handle reconnection manually
      heartbeatInterval: WS_CONFIG.HEARTBEAT_INTERVAL,
      debug: process.env.NODE_ENV === 'development'
    });
    
    // Attach event handlers
    service.on('connected', handleConnected);
    service.on('auth_success', handleAuthSuccess);
    service.on('monitoring_started', handleMonitoringStarted);
    service.on('real_time_update', handleRealtimeUpdate);
    service.on('disconnected', handleDisconnected);
    service.on('error', handleError);
    
    // Performance monitoring
    service.on('pong', (data) => {
      setConnectionMetrics(prev => ({
        ...prev,
        latency: data.latency || 0
      }));
    });
    
    return service;
  }, [walletCredentials, handleConnected, handleAuthSuccess, handleMonitoringStarted, handleRealtimeUpdate, handleDisconnected, handleError]);
  
  /**
   * Connect to WebSocket
   */
  const connect = useCallback(async () => {
    if (!walletCredentials?.walletAddress || !walletCredentials?.signature) {
      setError({ 
        type: 'credentials_missing', 
        message: 'Wallet credentials required for WebSocket connection' 
      });
      return;
    }
    
    if (wsServiceRef.current?.state === 'OPEN') {
      console.warn('WebSocket already connected');
      return;
    }
    
    updateConnectionState(CONNECTION_STATE.CONNECTING);
    
    try {
      // Create service if not exists
      if (!wsServiceRef.current) {
        wsServiceRef.current = createWebSocketService();
      }
      
      // Connect
      await wsServiceRef.current.connect();
      
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      handleError(error);
    }
  }, [walletCredentials, createWebSocketService, updateConnectionState, handleError]);
  
  /**
   * Disconnect from WebSocket
   */
  const disconnect = useCallback(() => {
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Disconnect service
    if (wsServiceRef.current) {
      wsServiceRef.current.disconnect();
      wsServiceRef.current = null;
    }
    
    // Reset state
    setAuthenticated(false);
    setMonitoring(false);
    updateConnectionState(CONNECTION_STATE.DISCONNECTED);
  }, [updateConnectionState]);
  
  /**
   * Start monitoring
   */
  const startMonitoring = useCallback(async () => {
    if (!wsServiceRef.current || !authenticated) {
      setError({ 
        type: 'not_authenticated', 
        message: 'Must be authenticated to start monitoring' 
      });
      return;
    }
    
    if (monitoring) {
      console.warn('Monitoring already active');
      return;
    }
    
    try {
      await wsServiceRef.current.startMonitoring();
    } catch (error) {
      console.error('Failed to start monitoring:', error);
      handleError(error);
    }
  }, [authenticated, monitoring, handleError]);
  
  /**
   * Stop monitoring
   */
  const stopMonitoring = useCallback(async () => {
    if (!wsServiceRef.current || !monitoring) {
      return;
    }
    
    try {
      await wsServiceRef.current.stopMonitoring();
      setMonitoring(false);
      updateConnectionState(CONNECTION_STATE.AUTHENTICATED);
    } catch (error) {
      console.error('Failed to stop monitoring:', error);
      handleError(error);
    }
  }, [monitoring, updateConnectionState, handleError]);
  
  /**
   * Sync with REST data
   * Allows updating WebSocket state with REST API data
   */
  const syncWithREST = useCallback((restData) => {
    if (!restData) return;
    
    // Transform REST data structure to match WebSocket expectations
    const wsFormat = {
      nodes: [],
      summary: restData.summary
    };
    
    // Flatten grouped nodes from REST API
    if (restData.nodes) {
      if (restData.nodes.online) {
        wsFormat.nodes.push(...restData.nodes.online.map(node => ({
          ...node,
          connection: { connected: true }
        })));
      }
      if (restData.nodes.active) {
        wsFormat.nodes.push(...restData.nodes.active.map(node => ({
          ...node,
          connection: { connected: false }
        })));
      }
      if (restData.nodes.offline) {
        wsFormat.nodes.push(...restData.nodes.offline.map(node => ({
          ...node,
          connection: { connected: false }
        })));
      }
    }
    
    // Process the data
    const categorizedNodes = processWebSocketData(wsFormat);
    
    // Update state
    setNodes(wsFormat.nodes);
    setNodesByStatus(categorizedNodes);
    setSummary(wsFormat.summary);
    setUpdateSource('rest');
    setLastUpdate(new Date());
  }, [processWebSocketData]);
  
  /**
   * Clear performance alerts
   */
  const clearAlerts = useCallback(() => {
    setPerformanceAlerts([]);
  }, []);
  
  /**
   * Send ping for latency measurement
   */
  const ping = useCallback(async () => {
    if (wsServiceRef.current && wsServiceRef.current.state === 'OPEN') {
      try {
        await wsServiceRef.current.ping();
      } catch (error) {
        console.error('Ping failed:', error);
      }
    }
  }, []);
  
  // ==================== LIFECYCLE MANAGEMENT ====================
  
  /**
   * Initialize WebSocket connection
   */
  useEffect(() => {
    mountedRef.current = true;
    
    if (autoConnect && walletCredentials?.walletAddress && walletCredentials?.signature) {
      connect();
    }
    
    return () => {
      mountedRef.current = false;
      disconnect();
      
      // Clear all timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (updateDebounceRef.current) {
        clearTimeout(updateDebounceRef.current);
      }
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
      }
    };
  }, [walletCredentials?.walletAddress, walletCredentials?.signature, autoConnect]);
  
  /**
   * Setup metrics collection
   */
  useEffect(() => {
    if (connected) {
      // Track uptime
      const startTime = Date.now();
      
      metricsIntervalRef.current = setInterval(() => {
        setConnectionMetrics(prev => ({
          ...prev,
          uptime: Math.floor((Date.now() - startTime) / 1000) // seconds
        }));
        
        // Send periodic ping for latency measurement
        ping();
      }, 30000); // Every 30 seconds
      
      return () => {
        if (metricsIntervalRef.current) {
          clearInterval(metricsIntervalRef.current);
        }
      };
    }
  }, [connected, ping]);
  
  // ==================== COMPUTED VALUES ====================
  
  /**
   * Connection health indicator
   */
  const connectionHealth = useMemo(() => {
    if (!connected) {
      return { status: 'disconnected', label: 'Disconnected', color: 'gray' };
    }
    
    if (connectionState === CONNECTION_STATE.ERROR) {
      return { status: 'error', label: 'Connection Error', color: 'red' };
    }
    
    if (connectionState === CONNECTION_STATE.RECONNECTING) {
      return { status: 'reconnecting', label: 'Reconnecting...', color: 'yellow' };
    }
    
    if (monitoring) {
      return { status: 'monitoring', label: 'Live Monitoring', color: 'green' };
    }
    
    if (authenticated) {
      return { status: 'authenticated', label: 'Authenticated', color: 'blue' };
    }
    
    if (connected) {
      return { status: 'connected', label: 'Connected', color: 'blue' };
    }
    
    return { status: 'unknown', label: 'Unknown', color: 'gray' };
  }, [connected, connectionState, monitoring, authenticated]);
  
  /**
   * Performance summary
   */
  const performance = useMemo(() => {
    return {
      latency: connectionMetrics.latency,
      messagesReceived: connectionMetrics.messagesReceived,
      uptime: connectionMetrics.uptime,
      alertCount: performanceAlerts.length,
      criticalAlerts: performanceAlerts.filter(a => a.severity === 'critical').length,
      errorRate: errorRecoveryRef.current?.getStatistics().connectionStability || 100
    };
  }, [connectionMetrics, performanceAlerts]);
  
  /**
   * Overall statistics
   */
  const statistics = useMemo(() => {
    return {
      totalNodes: summary?.total_nodes || 0,
      onlineNodes: nodesByStatus.online.length,
      activeNodes: nodesByStatus.active.length,
      offlineNodes: nodesByStatus.offline.length,
      realtimeConnections: nodes.filter(n => n.connection?.connected).length,
      avgCpuUsage: nodes.length > 0 
        ? Math.round(nodes.reduce((sum, n) => sum + (n.performance?.cpu_usage || 0), 0) / nodes.length)
        : 0,
      avgMemoryUsage: nodes.length > 0
        ? Math.round(nodes.reduce((sum, n) => sum + (n.performance?.memory_usage || 0), 0) / nodes.length)
        : 0
    };
  }, [summary, nodesByStatus, nodes]);
  
  // ==================== PUBLIC API ====================
  
  return {
    // Connection state
    connected,
    authenticated,
    monitoring,
    connectionState,
    connectionHealth,
    
    // Data
    nodes,
    nodesByStatus,
    summary,
    performanceStats,
    statistics,
    
    // Updates
    lastUpdate,
    updateSequence,
    updateSource,
    
    // Errors and alerts
    error,
    performanceAlerts,
    
    // Performance
    performance,
    
    // Actions
    connect,
    disconnect,
    startMonitoring,
    stopMonitoring,
    syncWithREST,
    clearAlerts,
    ping,
    
    // Service reference (for advanced usage)
    service: wsServiceRef.current
  };
}

/**
 * Hook for node-specific WebSocket connection
 * Used for individual node monitoring and control
 * 
 * @param {string} referenceCode - Node reference code
 * @param {Object} options - Hook options
 * @returns {Object} Node WebSocket state and controls
 */
export function useNodeWebSocket(referenceCode, options = {}) {
  const [state, setState] = useState({
    connected: false,
    authenticated: false,
    nodeInfo: null,
    metrics: {},
    error: null
  });
  
  const serviceRef = useRef(null);
  const mountedRef = useRef(true);
  
  // Implementation would be similar to useUserMonitorWebSocket
  // but focused on single node operations
  
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      if (serviceRef.current) {
        serviceRef.current.disconnect();
      }
    };
  }, []);
  
  return {
    ...state,
    // Methods would go here
  };
}

/**
 * Hook for system monitor WebSocket
 * Used for platform-wide monitoring (admin only)
 * 
 * @param {Object} options - Hook options
 * @returns {Object} System monitor state and controls
 */
export function useSystemMonitorWebSocket(options = {}) {
  const [state, setState] = useState({
    connected: false,
    systemMetrics: null,
    anomalies: [],
    error: null
  });
  
  const serviceRef = useRef(null);
  const mountedRef = useRef(true);
  
  // Implementation would be similar to useUserMonitorWebSocket
  // but focused on system-wide metrics
  
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      if (serviceRef.current) {
        serviceRef.current.disconnect();
      }
    };
  }, []);
  
  return {
    ...state,
    // Methods would go here
  };
}

// Export default hook
export default useUserMonitorWebSocket;
