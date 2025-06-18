/**
 * Unified WebSocket Hook for AeroNyx Platform
 * 
 * File Path: src/hooks/useWebSocket.js
 * 
 * Production-grade React hook providing a unified interface for all WebSocket
 * connections following Google's engineering standards. Supports multiple
 * connection types with automatic management and error recovery.
 * 
 * Features:
 * - Unified interface for all WebSocket types
 * - Automatic connection lifecycle management
 * - Built-in error recovery and reconnection
 * - Performance monitoring and metrics
 * - Memory leak prevention
 * - TypeScript-ready with JSDoc annotations
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { wsManager } from '../lib/websocket/WebSocketManager';
import { cacheService, CacheNamespace } from '../lib/services/CacheService';
import { transformWebSocketToREST, transformRESTToWebSocket } from '../lib/utils/websocketDataTransformer';

/**
 * WebSocket connection types
 * @enum {string}
 */
export const WebSocketType = {
  USER_MONITOR: 'userMonitor',
  NODE: 'node',
  DASHBOARD: 'dashboard' // Alias for userMonitor with dashboard-specific handling
};

/**
 * Connection state enumeration
 * @enum {string}
 */
export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATED: 'authenticated',
  MONITORING: 'monitoring',
  ERROR: 'error',
  RECONNECTING: 'reconnecting'
};

/**
 * WebSocket hook configuration
 * @typedef {Object} WebSocketConfig
 * @property {string} type - Connection type from WebSocketType enum
 * @property {boolean} autoConnect - Auto-connect on mount (default: true)
 * @property {boolean} autoMonitor - Auto-start monitoring after auth (default: true)
 * @property {boolean} enableCache - Enable response caching (default: true)
 * @property {number} cacheTimeout - Cache timeout in ms (default: 30000)
 * @property {Function} onConnect - Connection established callback
 * @property {Function} onDisconnect - Disconnection callback
 * @property {Function} onError - Error callback
 * @property {Function} onData - Data update callback
 * @property {Object} credentials - Authentication credentials
 */

/**
 * WebSocket hook return value
 * @typedef {Object} WebSocketHookReturn
 * @property {boolean} connected - Connection status
 * @property {boolean} authenticated - Authentication status
 * @property {boolean} monitoring - Monitoring status
 * @property {string} connectionState - Current connection state
 * @property {Object} data - Current data
 * @property {Object} error - Current error
 * @property {Function} connect - Manual connect function
 * @property {Function} disconnect - Manual disconnect function
 * @property {Function} send - Send message function
 * @property {Function} startMonitoring - Start monitoring function
 * @property {Function} stopMonitoring - Stop monitoring function
 * @property {Object} metrics - Connection metrics
 */

/**
 * Unified WebSocket Hook
 * 
 * @param {WebSocketConfig} config - Hook configuration
 * @returns {WebSocketHookReturn} WebSocket state and controls
 */
export function useWebSocket(config = {}) {
  const {
    type = WebSocketType.DASHBOARD,
    autoConnect = true,
    autoMonitor = true,
    enableCache = true,
    cacheTimeout = 30000,
    onConnect,
    onDisconnect,
    onError,
    onData,
    credentials
  } = config;
  
  // ==================== STATE MANAGEMENT ====================
  
  const [state, setState] = useState({
    connected: false,
    authenticated: false,
    monitoring: false,
    connectionState: ConnectionState.DISCONNECTED,
    data: null,
    error: null,
    lastUpdate: null
  });
  
  const [metrics, setMetrics] = useState({
    messagesReceived: 0,
    messagesSent: 0,
    connectionAttempts: 0,
    errors: 0,
    latency: 0,
    uptime: 0
  });
  
  // ==================== REFS ====================
  
  const serviceRef = useRef(null);
  const mountedRef = useRef(true);
  const cacheKeyRef = useRef(null);
  const metricsTimerRef = useRef(null);
  
  // ==================== CACHE KEY GENERATION ====================
  
  const getCacheKey = useCallback(() => {
    if (!credentials) return null;
    
    switch (type) {
      case WebSocketType.USER_MONITOR:
      case WebSocketType.DASHBOARD:
        return cacheService.generateKey('ws', type, credentials.walletAddress);
      case WebSocketType.NODE:
        return cacheService.generateKey('ws', type, credentials.referenceCode);
      default:
        return null;
    }
  }, [type, credentials]);
  
  // ==================== SERVICE CREATION ====================
  
  const createService = useCallback(() => {
    if (!credentials) {
      console.warn('[useWebSocket] No credentials provided');
      return null;
    }
    
    let service;
    
    switch (type) {
      case WebSocketType.USER_MONITOR:
      case WebSocketType.DASHBOARD:
        service = wsManager.getUserMonitorService(credentials, {
          reconnect: true,
          maxReconnectAttempts: 5
        });
        break;
        
      case WebSocketType.NODE:
        service = wsManager.getNodeService(credentials.referenceCode, {
          reconnect: true,
          maxReconnectAttempts: 3
        });
        break;
        
      default:
        console.error(`[useWebSocket] Unknown type: ${type}`);
        return null;
    }
    
    return service;
  }, [type, credentials]);
  
  // ==================== EVENT HANDLERS ====================
  
  const handleConnected = useCallback(() => {
    if (!mountedRef.current) return;
    
    setState(prev => ({
      ...prev,
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      error: null
    }));
    
    setMetrics(prev => ({
      ...prev,
      connectionAttempts: prev.connectionAttempts + 1
    }));
    
    onConnect?.();
  }, [onConnect]);
  
  const handleDisconnected = useCallback((event) => {
    if (!mountedRef.current) return;
    
    setState(prev => ({
      ...prev,
      connected: false,
      authenticated: false,
      monitoring: false,
      connectionState: ConnectionState.DISCONNECTED
    }));
    
    onDisconnect?.(event);
  }, [onDisconnect]);
  
  const handleAuthSuccess = useCallback((data) => {
    if (!mountedRef.current) return;
    
    setState(prev => ({
      ...prev,
      authenticated: true,
      connectionState: ConnectionState.AUTHENTICATED
    }));
    
    // Auto-start monitoring if configured
    if (autoMonitor && serviceRef.current?.startMonitoring) {
      serviceRef.current.startMonitoring();
    }
  }, [autoMonitor]);
  
  const handleMonitoringStarted = useCallback(() => {
    if (!mountedRef.current) return;
    
    setState(prev => ({
      ...prev,
      monitoring: true,
      connectionState: ConnectionState.MONITORING
    }));
  }, []);
  
  const handleDataUpdate = useCallback((data) => {
    if (!mountedRef.current) return;
    
    // Transform data based on type
    let transformedData = data;
    
    if (type === WebSocketType.DASHBOARD) {
      // Transform WebSocket data to dashboard format
      transformedData = transformWebSocketToREST(data);
    }
    
    // Update state
    setState(prev => ({
      ...prev,
      data: transformedData,
      lastUpdate: new Date()
    }));
    
    // Update metrics
    setMetrics(prev => ({
      ...prev,
      messagesReceived: prev.messagesReceived + 1
    }));
    
    // Cache if enabled
    if (enableCache && cacheKeyRef.current) {
      cacheService.set(
        CacheNamespace.WEBSOCKET,
        cacheKeyRef.current,
        transformedData,
        cacheTimeout
      );
    }
    
    // Trigger callback
    onData?.(transformedData);
  }, [type, enableCache, cacheTimeout, onData]);
  
  const handleError = useCallback((error) => {
    if (!mountedRef.current) return;
    
    setState(prev => ({
      ...prev,
      error,
      connectionState: ConnectionState.ERROR
    }));
    
    setMetrics(prev => ({
      ...prev,
      errors: prev.errors + 1
    }));
    
    onError?.(error);
  }, [onError]);
  
  // ==================== ACTIONS ====================
  
  const connect = useCallback(async () => {
    if (!serviceRef.current) {
      serviceRef.current = createService();
      if (!serviceRef.current) return;
      
      // Setup event listeners
      setupEventListeners(serviceRef.current);
    }
    
    if (serviceRef.current.state === 'OPEN') {
      console.warn('[useWebSocket] Already connected');
      return;
    }
    
    setState(prev => ({
      ...prev,
      connectionState: ConnectionState.CONNECTING
    }));
    
    try {
      await serviceRef.current.connect();
    } catch (error) {
      handleError(error);
    }
  }, [createService, handleError]);
  
  const disconnect = useCallback(() => {
    if (!serviceRef.current) return;
    
    serviceRef.current.disconnect();
    
    // Remove from manager
    switch (type) {
      case WebSocketType.USER_MONITOR:
      case WebSocketType.DASHBOARD:
        wsManager.removeService(`userMonitor:${credentials?.walletAddress}`);
        break;
      case WebSocketType.NODE:
        wsManager.removeService(`node:${credentials?.referenceCode}`);
        break;
    }
    
    serviceRef.current = null;
  }, [type, credentials]);
  
  const send = useCallback(async (message) => {
    if (!serviceRef.current) {
      throw new Error('WebSocket not connected');
    }
    
    await serviceRef.current.send(message);
    
    setMetrics(prev => ({
      ...prev,
      messagesSent: prev.messagesSent + 1
    }));
  }, []);
  
  const startMonitoring = useCallback(async () => {
    if (!serviceRef.current?.startMonitoring) {
      console.warn('[useWebSocket] Monitoring not supported for this connection type');
      return;
    }
    
    await serviceRef.current.startMonitoring();
  }, []);
  
  const stopMonitoring = useCallback(async () => {
    if (!serviceRef.current?.stopMonitoring) {
      console.warn('[useWebSocket] Monitoring not supported for this connection type');
      return;
    }
    
    await serviceRef.current.stopMonitoring();
  }, []);
  
  // ==================== EVENT LISTENER SETUP ====================
  
  const setupEventListeners = useCallback((service) => {
    // Connection events
    service.on('connected', handleConnected);
    service.on('disconnected', handleDisconnected);
    service.on('error', handleError);
    
    // Authentication events
    service.on('auth_success', handleAuthSuccess);
    service.on('auth_failed', handleError);
    
    // Monitoring events
    service.on('monitoring_started', handleMonitoringStarted);
    service.on('monitoring_stopped', () => {
      setState(prev => ({ ...prev, monitoring: false }));
    });
    
    // Data events
    switch (type) {
      case WebSocketType.USER_MONITOR:
      case WebSocketType.DASHBOARD:
        service.on('nodes_updated', handleDataUpdate);
        service.on('real_time_update', handleDataUpdate);
        break;
      case WebSocketType.NODE:
        service.on('status_update', handleDataUpdate);
        service.on('metrics_update', handleDataUpdate);
        break;
    }
    
    // Performance events
    service.on('pong', (data) => {
      setMetrics(prev => ({ ...prev, latency: data.latency }));
    });
  }, [type, handleConnected, handleDisconnected, handleError, handleAuthSuccess, handleMonitoringStarted, handleDataUpdate]);
  
  // ==================== LIFECYCLE MANAGEMENT ====================
  
  useEffect(() => {
    mountedRef.current = true;
    cacheKeyRef.current = getCacheKey();
    
    // Load from cache if available
    if (enableCache && cacheKeyRef.current) {
      const cachedData = cacheService.get(CacheNamespace.WEBSOCKET, cacheKeyRef.current);
      if (cachedData) {
        setState(prev => ({
          ...prev,
          data: cachedData,
          lastUpdate: new Date()
        }));
      }
    }
    
    // Auto-connect if configured
    if (autoConnect && credentials) {
      connect();
    }
    
    // Setup metrics timer
    metricsTimerRef.current = setInterval(() => {
      if (serviceRef.current) {
        const serviceMetrics = serviceRef.current.getMetrics?.();
        if (serviceMetrics) {
          setMetrics(prev => ({
            ...prev,
            uptime: serviceMetrics.uptimePercentage || 0
          }));
        }
      }
    }, 5000);
    
    // Cleanup
    return () => {
      mountedRef.current = false;
      
      if (metricsTimerRef.current) {
        clearInterval(metricsTimerRef.current);
      }
      
      disconnect();
    };
  }, []); // Only run on mount/unmount
  
  // Handle credentials change
  useEffect(() => {
    if (credentials && autoConnect) {
      // Disconnect existing connection
      if (serviceRef.current) {
        disconnect();
      }
      
      // Connect with new credentials
      connect();
    }
  }, [credentials?.walletAddress, credentials?.referenceCode]);
  
  // ==================== COMPUTED VALUES ====================
  
  const connectionHealth = useMemo(() => {
    const { connectionState, error } = state;
    
    switch (connectionState) {
      case ConnectionState.MONITORING:
        return { status: 'excellent', label: 'Live Monitoring', color: 'green' };
      case ConnectionState.AUTHENTICATED:
        return { status: 'good', label: 'Authenticated', color: 'blue' };
      case ConnectionState.CONNECTED:
        return { status: 'fair', label: 'Connected', color: 'yellow' };
      case ConnectionState.CONNECTING:
      case ConnectionState.RECONNECTING:
        return { status: 'connecting', label: 'Connecting...', color: 'yellow' };
      case ConnectionState.ERROR:
        return { status: 'error', label: error?.message || 'Connection Error', color: 'red' };
      default:
        return { status: 'disconnected', label: 'Disconnected', color: 'gray' };
    }
  }, [state.connectionState, state.error]);
  
  // ==================== PUBLIC API ====================
  
  return {
    // State
    ...state,
    connectionHealth,
    
    // Actions
    connect,
    disconnect,
    send,
    startMonitoring,
    stopMonitoring,
    
    // Metrics
    metrics,
    
    // Service reference (for advanced usage)
    service: serviceRef.current
  };
}

// ==================== SPECIALIZED HOOKS ====================

/**
 * Dashboard-specific WebSocket hook
 * 
 * @param {Object} credentials - Wallet credentials
 * @param {Object} options - Additional options
 * @returns {WebSocketHookReturn} WebSocket state and controls
 */
export function useDashboardWebSocket(credentials, options = {}) {
  return useWebSocket({
    type: WebSocketType.DASHBOARD,
    credentials,
    autoMonitor: true,
    ...options
  });
}

/**
 * Node-specific WebSocket hook
 * 
 * @param {string} referenceCode - Node reference code
 * @param {Object} options - Additional options
 * @returns {WebSocketHookReturn} WebSocket state and controls
 */
export function useNodeWebSocket(referenceCode, options = {}) {
  return useWebSocket({
    type: WebSocketType.NODE,
    credentials: { referenceCode },
    autoMonitor: false,
    ...options
  });
}

/**
 * User monitor WebSocket hook
 * 
 * @param {Object} credentials - Wallet credentials
 * @param {Object} options - Additional options
 * @returns {WebSocketHookReturn} WebSocket state and controls
 */
export function useUserMonitorWebSocket(credentials, options = {}) {
  return useWebSocket({
    type: WebSocketType.USER_MONITOR,
    credentials,
    ...options
  });
}
