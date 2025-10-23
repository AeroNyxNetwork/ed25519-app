/**
 * ============================================
 * File: src/hooks/useConnectionState.js
 * ============================================
 * Unified Connection State Hook - GOOGLE-GRADE v1.0.0
 * 
 * Creation Reason: Single source of truth for all connection states
 * Main Functionality: Aggregate WebSocket, Auth, and Signature states
 * Dependencies: WebSocketService, RemoteAuthService, useGlobalSignature
 * 
 * Design Philosophy:
 * - Single Hook API for all connection needs
 * - Automatic recovery and reconnection
 * - Clear state hierarchy
 * - Smart error handling
 * 
 * Main Logical Flow:
 * 1. Monitor WebSocket connection state
 * 2. Monitor JWT authentication state
 * 3. Monitor signature validity
 * 4. Provide aggregated connection status
 * 5. Auto-reconnect when needed
 * 
 * State Hierarchy:
 * Level 1: WebSocket Connected
 * Level 2: WebSocket Authenticated
 * Level 3: JWT Token Valid (per node)
 * Level 4: Signature Valid
 * 
 * ⚠️ Important Note for Next Developer:
 * - This is the ONLY hook components should use for connection state
 * - All other hooks (useRemoteManagement, etc.) use this internally
 * - DO NOT bypass this hook and check states directly
 * - Auto-reconnect logic is built-in
 * 
 * Last Modified: v1.0.0 - Initial Google-grade implementation
 * ============================================
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import webSocketService from '../services/WebSocketService';
import remoteAuthService from '../services/RemoteAuthService';
import { useGlobalSignature } from './useGlobalSignature';
import { useAeroNyxWebSocket } from './useAeroNyxWebSocket';

/**
 * Connection Status Enum
 */
export const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',       // Nothing connected
  CONNECTING: 'connecting',           // WebSocket connecting
  CONNECTED: 'connected',             // WebSocket connected, not authenticated
  AUTHENTICATING: 'authenticating',   // Authentication in progress
  AUTHENTICATED: 'authenticated',     // WebSocket authenticated
  READY: 'ready',                     // Fully ready (WS + JWT + Signature)
  ERROR: 'error',                     // Error state
  RECONNECTING: 'reconnecting'        // Attempting to reconnect
};

/**
 * Unified Connection State Hook
 * 
 * @param {string} nodeReference - Node reference code (optional for global state)
 * @returns {Object} Connection state and control methods
 */
export function useConnectionState(nodeReference = null) {
  // ==================== State ====================
  const [connectionStatus, setConnectionStatus] = useState(CONNECTION_STATUS.DISCONNECTED);
  const [error, setError] = useState(null);
  const [autoReconnecting, setAutoReconnecting] = useState(false);
  
  // ==================== Dependencies ====================
  const {
    wsState,
    nodes,
    refresh: wsRefresh,
    forceReconnect: wsForceReconnect,
    isReconnecting: wsIsReconnecting
  } = useAeroNyxWebSocket({
    autoConnect: true,
    autoMonitor: true
  });
  
  const {
    signature,
    message: signatureMessage,
    isValid: signatureValid,
    remainingTime: signatureRemainingTime,
    ensureSignature,
    refreshSignature,
    isLoading: signatureLoading,
    error: signatureError
  } = useGlobalSignature();
  
  // ==================== Refs ====================
  const isMountedRef = useRef(true);
  const reconnectTimeoutRef = useRef(null);
  const lastStatusRef = useRef(CONNECTION_STATUS.DISCONNECTED);
  
  // ==================== Computed States ====================
  
  // WebSocket states
  const isWebSocketConnected = wsState?.connected || false;
  const isWebSocketAuthenticated = wsState?.authenticated || false;
  
  // JWT states (per node)
  const isJWTAuthenticated = nodeReference 
    ? remoteAuthService.isAuthenticated(nodeReference)
    : false;
  
  const jwtExpiry = nodeReference
    ? remoteAuthService.getTokenExpiry(nodeReference)
    : null;
  
  // Node states
  const nodeInfo = nodeReference && nodes 
    ? nodes.find(n => n.code === nodeReference || n.reference === nodeReference)
    : null;
  
  const isNodeOnline = nodeInfo 
    ? (nodeInfo.status === 'online' || nodeInfo.status === 'active')
    : false;
  
  // ==================== Status Calculation ====================
  
  useEffect(() => {
    let newStatus = CONNECTION_STATUS.DISCONNECTED;
    let newError = null;
    
    // Calculate status based on state hierarchy
    if (wsIsReconnecting) {
      newStatus = CONNECTION_STATUS.RECONNECTING;
    } else if (!isWebSocketConnected) {
      newStatus = CONNECTION_STATUS.DISCONNECTED;
      newError = wsState?.error || null;
    } else if (isWebSocketConnected && !isWebSocketAuthenticated) {
      if (wsState?.authState === 'authenticating' || wsState?.authState === 'signing') {
        newStatus = CONNECTION_STATUS.AUTHENTICATING;
      } else {
        newStatus = CONNECTION_STATUS.CONNECTED;
      }
    } else if (isWebSocketAuthenticated) {
      if (nodeReference) {
        // For node-specific state
        if (!isNodeOnline) {
          newStatus = CONNECTION_STATUS.ERROR;
          newError = 'Node is offline';
        } else if (!isJWTAuthenticated) {
          newStatus = CONNECTION_STATUS.AUTHENTICATED; // WS auth but no JWT yet
        } else if (!signatureValid && !signatureLoading) {
          newStatus = CONNECTION_STATUS.AUTHENTICATED; // Need signature refresh
        } else {
          newStatus = CONNECTION_STATUS.READY; // Fully ready!
        }
      } else {
        // For global state (no node specified)
        newStatus = CONNECTION_STATUS.AUTHENTICATED;
      }
    }
    
    // Update state if changed
    if (newStatus !== lastStatusRef.current) {
      console.log('[useConnectionState] Status changed:', lastStatusRef.current, '→', newStatus);
      lastStatusRef.current = newStatus;
      setConnectionStatus(newStatus);
    }
    
    if (newError !== error) {
      setError(newError);
    }
    
  }, [
    wsState,
    isWebSocketConnected,
    isWebSocketAuthenticated,
    isJWTAuthenticated,
    isNodeOnline,
    signatureValid,
    signatureLoading,
    nodeReference,
    wsIsReconnecting,
    error
  ]);
  
  // ==================== Auto-Recovery Logic ====================
  
  useEffect(() => {
    // Auto-reconnect logic
    if (connectionStatus === CONNECTION_STATUS.ERROR && nodeReference) {
      // If node is offline, don't try to reconnect
      if (!isNodeOnline) {
        return;
      }
      
      // If WebSocket disconnected, trigger reconnection
      if (!isWebSocketConnected && !wsIsReconnecting) {
        console.log('[useConnectionState] Auto-triggering WebSocket reconnection');
        setAutoReconnecting(true);
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            wsForceReconnect();
            setAutoReconnecting(false);
          }
        }, 2000);
      }
      
      // If JWT expired, try to refresh
      if (isWebSocketAuthenticated && !isJWTAuthenticated && !autoReconnecting) {
        console.log('[useConnectionState] JWT expired, need re-authentication');
        setError('Authentication expired. Please re-authenticate.');
      }
    }
  }, [
    connectionStatus,
    nodeReference,
    isNodeOnline,
    isWebSocketConnected,
    isWebSocketAuthenticated,
    isJWTAuthenticated,
    wsIsReconnecting,
    wsForceReconnect,
    autoReconnecting
  ]);
  
  // ==================== Cleanup ====================
  
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);
  
  // ==================== Control Methods ====================
  
  /**
   * Reconnect WebSocket
   */
  const reconnect = useCallback(async () => {
    console.log('[useConnectionState] Manual reconnect requested');
    setError(null);
    setAutoReconnecting(false);
    wsForceReconnect();
  }, [wsForceReconnect]);
  
  /**
   * Refresh authentication (WebSocket + JWT)
   */
  const refreshAuth = useCallback(async () => {
    console.log('[useConnectionState] Refreshing authentication');
    
    try {
      setError(null);
      
      // Step 1: Ensure signature is valid
      if (!signatureValid) {
        await ensureSignature();
      }
      
      // Step 2: If node specified, refresh JWT
      if (nodeReference) {
        // Clear old token
        remoteAuthService.clearToken(nodeReference);
        
        // Will be re-authenticated by useRemoteManagement
      }
      
      return true;
    } catch (err) {
      console.error('[useConnectionState] Refresh auth failed:', err);
      setError(err.message);
      return false;
    }
  }, [nodeReference, signatureValid, ensureSignature]);
  
  /**
   * Force full reconnection (WebSocket + Auth + Signature)
   */
  const fullReconnect = useCallback(async () => {
    console.log('[useConnectionState] Full reconnect requested');
    
    try {
      setError(null);
      setAutoReconnecting(false);
      
      // Clear all auth states
      if (nodeReference) {
        remoteAuthService.clearToken(nodeReference);
      }
      
      // Refresh signature
      await refreshSignature();
      
      // Reconnect WebSocket
      wsForceReconnect();
      
      return true;
    } catch (err) {
      console.error('[useConnectionState] Full reconnect failed:', err);
      setError(err.message);
      return false;
    }
  }, [nodeReference, refreshSignature, wsForceReconnect]);
  
  // ==================== Return API ====================
  
  return {
    // === Primary Status ===
    status: connectionStatus,
    isReady: connectionStatus === CONNECTION_STATUS.READY,
    
    // === Capability Checks ===
    canUseTerminal: connectionStatus === CONNECTION_STATUS.READY && isNodeOnline,
    canUseFileManager: connectionStatus === CONNECTION_STATUS.READY && isNodeOnline,
    canUseRemoteCommands: isWebSocketAuthenticated && isJWTAuthenticated && isNodeOnline,
    
    // === Detailed States ===
    isWebSocketConnected,
    isWebSocketAuthenticated,
    isJWTAuthenticated,
    isSignatureValid: signatureValid,
    isNodeOnline,
    
    // === Error & Loading ===
    error,
    isLoading: connectionStatus === CONNECTION_STATUS.CONNECTING || 
               connectionStatus === CONNECTION_STATUS.AUTHENTICATING ||
               signatureLoading,
    isReconnecting: wsIsReconnecting || autoReconnecting,
    
    // === Timing Info ===
    jwtExpiry,
    jwtExpiryFormatted: nodeReference 
      ? remoteAuthService.getFormattedExpiry(nodeReference)
      : null,
    signatureExpiry: signatureRemainingTime,
    
    // === Node Info ===
    nodeInfo,
    allNodes: nodes,
    
    // === Control Methods ===
    reconnect,              // WebSocket reconnect only
    refreshAuth,            // Refresh JWT authentication
    fullReconnect,          // Full reconnection (WS + Auth + Signature)
    ensureSignature,        // Ensure signature is valid
    
    // === Status Helpers ===
    needsReconnect: connectionStatus === CONNECTION_STATUS.ERROR || 
                    connectionStatus === CONNECTION_STATUS.DISCONNECTED,
    needsAuth: isWebSocketConnected && !isWebSocketAuthenticated,
    needsJWT: nodeReference && isWebSocketAuthenticated && !isJWTAuthenticated,
    needsSignature: !signatureValid && !signatureLoading,
    
    // === Debug Info ===
    debug: {
      wsState,
      connectionStatus,
      isWebSocketConnected,
      isWebSocketAuthenticated,
      isJWTAuthenticated,
      isSignatureValid: signatureValid,
      isNodeOnline,
      nodeReference
    }
  };
}

export default useConnectionState;
