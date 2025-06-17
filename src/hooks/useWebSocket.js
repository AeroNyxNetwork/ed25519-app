/**
 * React Hook for WebSocket Integration
 * 
 * Provides easy WebSocket integration for React components
 * with automatic cleanup and state management.
 * 
 * @version 1.0.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { wsManager } from '../lib/websocket/WebSocketManager';

/**
 * Hook for node WebSocket connection
 * @param {string} referenceCode - Node reference code
 * @param {Object} options - WebSocket options
 */
export function useNodeWebSocket(referenceCode, options = {}) {
  const [state, setState] = useState({
    connected: false,
    authenticated: false,
    nodeInfo: null,
    error: null,
    metrics: {}
  });
  
  const serviceRef = useRef(null);
  
  useEffect(() => {
    if (!referenceCode) return;
    
    const service = wsManager.getNodeService(referenceCode, options);
    serviceRef.current = service;
    
    // Event handlers
    const handleConnected = () => {
      setState(prev => ({ ...prev, connected: true, error: null }));
    };
    
    const handleDisconnected = () => {
      setState(prev => ({ ...prev, connected: false, authenticated: false }));
    };
    
    const handleAuthSuccess = (data) => {
      setState(prev => ({
        ...prev,
        authenticated: true,
        nodeInfo: data.node
      }));
    };
    
    const handleAuthFailed = (data) => {
      setState(prev => ({
        ...prev,
        authenticated: false,
        error: data.message || 'Authentication failed'
      }));
    };
    
    const handleError = (error) => {
      setState(prev => ({ ...prev, error: error.message || 'Connection error' }));
    };
    
    // Subscribe to events
    service.on('connected', handleConnected);
    service.on('disconnected', handleDisconnected);
    service.on('auth_success', handleAuthSuccess);
    service.on('auth_failed', handleAuthFailed);
    service.on('error', handleError);
    
    // Connect
    service.connect();
    
    // Cleanup
    return () => {
      service.off('connected', handleConnected);
      service.off('disconnected', handleDisconnected);
      service.off('auth_success', handleAuthSuccess);
      service.off('auth_failed', handleAuthFailed);
      service.off('error', handleError);
      
      wsManager.removeService(`node:${referenceCode}`);
    };
  }, [referenceCode]);
  
  const updateStatus = useCallback(async (status) => {
    if (serviceRef.current) {
      return serviceRef.current.updateStatus(status);
    }
  }, []);
  
  const updateMetrics = useCallback((metrics) => {
    if (serviceRef.current) {
      serviceRef.current.updateMetrics(metrics);
    }
  }, []);
  
  return {
    ...state,
    service: serviceRef.current,
    updateStatus,
    updateMetrics
  };
}

/**
 * Hook for user monitor WebSocket connection
 * @param {Object} walletCredentials - Wallet credentials
 * @param {Object} options - WebSocket options
 */
export function useUserMonitorWebSocket(walletCredentials, options = {}) {
  const [state, setState] = useState({
    connected: false,
    authenticated: false,
    monitoring: false,
    nodes: [],
    summary: null,
    error: null
  });
  
  const serviceRef = useRef(null);
  
  useEffect(() => {
    if (!walletCredentials?.walletAddress) return;
    
    const service = wsManager.getUserMonitorService(walletCredentials, options);
    serviceRef.current = service;
    
    // Event handlers
    const handleConnected = () => {
      setState(prev => ({ ...prev, connected: true, error: null }));
    };
    
    const handleDisconnected = () => {
      setState(prev => ({ 
        ...prev, 
        connected: false, 
        authenticated: false,
        monitoring: false 
      }));
    };
    
    const handleAuthSuccess = (data) => {
      setState(prev => ({
        ...prev,
        authenticated: true
      }));
    };
    
    const handleMonitoringStarted = () => {
      setState(prev => ({ ...prev, monitoring: true }));
    };
    
    const handleMonitoringStopped = () => {
      setState(prev => ({ ...prev, monitoring: false }));
    };
    
    const handleNodesUpdated = (data) => {
      setState(prev => ({
        ...prev,
        nodes: data.nodes,
        summary: data.summary
      }));
    };
    
    const handleError = (error) => {
      setState(prev => ({ ...prev, error: error.message || 'Connection error' }));
    };
    
    // Subscribe to events
    service.on('connected', handleConnected);
    service.on('disconnected', handleDisconnected);
    service.on('auth_success', handleAuthSuccess);
    service.on('monitoring_started', handleMonitoringStarted);
    service.on('monitoring_stopped', handleMonitoringStopped);
    service.on('nodes_updated', handleNodesUpdated);
    service.on('error', handleError);
    
    // Connect
    service.connect();
    
    // Cleanup
    return () => {
      service.off('connected', handleConnected);
      service.off('disconnected', handleDisconnected);
      service.off('auth_success', handleAuthSuccess);
      service.off('monitoring_started', handleMonitoringStarted);
      service.off('monitoring_stopped', handleMonitoringStopped);
      service.off('nodes_updated', handleNodesUpdated);
      service.off('error', handleError);
      
      wsManager.removeService(`userMonitor:${walletCredentials.walletAddress}`);
    };
  }, [walletCredentials?.walletAddress]);
  
  const startMonitoring = useCallback(async () => {
    if (serviceRef.current) {
      return serviceRef.current.startMonitoring();
    }
  }, []);
  
  const stopMonitoring = useCallback(async () => {
    if (serviceRef.current) {
      return serviceRef.current.stopMonitoring();
    }
  }, []);
  
  const subscribeToNode = useCallback(async (referenceCode) => {
    if (serviceRef.current) {
      return serviceRef.current.subscribeToNode(referenceCode);
    }
  }, []);
  
  const unsubscribeFromNode = useCallback(async (referenceCode) => {
    if (serviceRef.current) {
      return serviceRef.current.unsubscribeFromNode(referenceCode);
    }
  }, []);
  
  return {
    ...state,
    service: serviceRef.current,
    startMonitoring,
    stopMonitoring,
    subscribeToNode,
    unsubscribeFromNode
  };
}

/**
 * Hook for system monitor WebSocket connection
 * @param {Object} options - WebSocket options
 */
export function useSystemMonitorWebSocket(options = {}) {
  const [state, setState] = useState({
    connected: false,
    metrics: null,
    anomalies: [],
    error: null
  });
  
  const serviceRef = useRef(null);
  
  useEffect(() => {
    const service = wsManager.getSystemMonitorService(options);
    serviceRef.current = service;
    
    // Event handlers
    const handleConnected = () => {
      setState(prev => ({ ...prev, connected: true, error: null }));
    };
    
    const handleDisconnected = () => {
      setState(prev => ({ ...prev, connected: false }));
    };
    
    const handleSystemUpdate = (metrics) => {
      setState(prev => ({ ...prev, metrics }));
    };
    
    const handleAnomaliesDetected = (anomalies) => {
      setState(prev => ({ 
        ...prev, 
        anomalies: [...prev.anomalies, ...anomalies].slice(-10) // Keep last 10
      }));
    };
    
    const handleError = (error) => {
      setState(prev => ({ ...prev, error: error.message || 'Connection error' }));
    };
    
    // Subscribe to events
    service.on('connected', handleConnected);
    service.on('disconnected', handleDisconnected);
    service.on('system_update', handleSystemUpdate);
    service.on('anomalies_detected', handleAnomaliesDetected);
    service.on('error', handleError);
    
    // Connect
    service.connect();
    
    // Cleanup
    return () => {
      service.off('connected', handleConnected);
      service.off('disconnected', handleDisconnected);
      service.off('system_update', handleSystemUpdate);
      service.off('anomalies_detected', handleAnomaliesDetected);
      service.off('error', handleError);
      
      wsManager.removeService('systemMonitor');
    };
  }, []);
  
  const getMetricsHistory = useCallback((limit) => {
    if (serviceRef.current) {
      return serviceRef.current.getMetricsHistory(limit);
    }
    return [];
  }, []);
  
  const getMetricsStatistics = useCallback((windowMinutes) => {
    if (serviceRef.current) {
      return serviceRef.current.getMetricsStatistics(windowMinutes);
    }
    return null;
  }, []);
  
  return {
    ...state,
    service: serviceRef.current,
    getMetricsHistory,
    getMetricsStatistics
  };
}
