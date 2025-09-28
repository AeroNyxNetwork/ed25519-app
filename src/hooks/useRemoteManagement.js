/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Remote Management Hook - Terminal Session Management
 * 
 * Purpose: Provide terminal management logic for RemoteManagement component
 * Main Functionality: Manage terminal sessions (JWT handled externally)
 * Dependencies: terminalStore, webSocketService, terminalService, remoteAuthService
 * 
 * Main Logical Flow:
 * 1. Check WebSocket authentication status
 * 2. Verify JWT authentication (handled by RemoteAuthService)
 * 3. Create terminal session
 * 4. Handle bi-directional terminal communication
 * 
 * ⚠️ Important Notes:
 * - JWT authentication is handled by RemoteAuthService
 * - This hook only manages terminal sessions
 * - Requires remote_auth_success before terminal operations
 * - Session cleanup is automatic on unmount
 * - FIXED: Removed excessive polling that caused performance issues
 * 
 * Last Modified: v3.2.0 - Fixed excessive polling and timeout issues
 * ============================================
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useTerminalStore from '../stores/terminalStore';
import terminalService from '../services/TerminalService';
import webSocketService from '../services/WebSocketService';
import remoteAuthService from '../services/RemoteAuthService';
import { useAeroNyxWebSocket } from './useAeroNyxWebSocket';

/**
 * Remote Management Hook
 * Provides terminal management functionality for remote nodes
 * 
 * @param {string} nodeReference - Node reference code (e.g., 'AERO-65574')
 * @returns {Object} Terminal management functions and state
 */
export function useRemoteManagement(nodeReference) {
  // ==================== State ====================
  const [terminalSession, setTerminalSession] = useState(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [isRemoteAuthenticated, setIsRemoteAuthenticated] = useState(false);
  
  // Refs for cleanup and session management
  const sessionRef = useRef(null);
  const isInitializedRef = useRef(false);
  const isMountedRef = useRef(true);
  const outputHandlerRef = useRef(null);
  const errorHandlerRef = useRef(null);
  const closedHandlerRef = useRef(null);
  const readyHandlerRef = useRef(null);
  const authListenerRef = useRef(null);
  const lastAuthCheckRef = useRef(0);
  
  // Get store state
  const { 
    wsState, 
    nodes: storeNodes,
    createSession,
    sendInput,
    closeSession,
    getSession
  } = useTerminalStore();
  
  // Get WebSocket state and nodes data
  const { 
    wsState: wsConnectionState,
    nodes: wsNodes  // Get nodes array from WebSocket hook
  } = useAeroNyxWebSocket({
    autoConnect: true,
    autoMonitor: true
  });
  
  // Determine if WebSocket is ready
  const isWebSocketReady = wsState?.authenticated || wsConnectionState?.authenticated;
  
  // Get node status - nodes might be an array or object
  let node = null;
  let isNodeOnline = false;
  
  // Try to find node in wsNodes array first (more up-to-date)
  if (Array.isArray(wsNodes)) {
    node = wsNodes.find(n => n.code === nodeReference || n.reference === nodeReference);
  } else if (wsNodes && typeof wsNodes === 'object') {
    node = wsNodes[nodeReference];
  }
  
  // If not found in wsNodes, try store nodes
  if (!node) {
    if (Array.isArray(storeNodes)) {
      node = storeNodes.find(n => n.code === nodeReference || n.reference === nodeReference);
    } else if (storeNodes && typeof storeNodes === 'object') {
      node = storeNodes[nodeReference];
    }
  }
  
  // Check if node is online using multiple possible status fields
  if (node) {
    isNodeOnline = (
      node.status === 'online' || 
      node.status === 'active' ||
      node.status === 'running' ||
      node.originalStatus === 'active' ||
      node.normalizedStatus === 'online' ||
      node.isOnline === true
    );
  }
  
  // ==================== Authentication State Management ====================
  
  /**
   * Monitor authentication state changes
   */
  useEffect(() => {
    // Check initial auth state
    const initialAuth = remoteAuthService.isAuthenticated(nodeReference);
    setIsRemoteAuthenticated(initialAuth);
    console.log('[useRemoteManagement] Initial auth state for', nodeReference, ':', initialAuth);
    
    // Listen for auth state changes
    const handleAuthenticated = () => {
      console.log('[useRemoteManagement] Node authenticated:', nodeReference);
      if (isMountedRef.current) {
        setIsRemoteAuthenticated(true);
        setError(null);
      }
    };
    
    const handleError = (error) => {
      console.log('[useRemoteManagement] Auth error for', nodeReference, ':', error);
      if (isMountedRef.current) {
        setIsRemoteAuthenticated(false);
        setError(error.message || 'Authentication failed');
      }
    };
    
    const handleExpired = () => {
      console.log('[useRemoteManagement] Token expired for', nodeReference);
      if (isMountedRef.current) {
        setIsRemoteAuthenticated(false);
        setError('Authentication token expired');
        closeTerminal();
      }
    };
    
    // Add listeners
    remoteAuthService.on(nodeReference, 'authenticated', handleAuthenticated);
    remoteAuthService.on(nodeReference, 'error', handleError);
    remoteAuthService.on(nodeReference, 'expired', handleExpired);
    
    authListenerRef.current = { handleAuthenticated, handleError, handleExpired };
    
    return () => {
      remoteAuthService.off(nodeReference, 'authenticated', handleAuthenticated);
      remoteAuthService.off(nodeReference, 'error', handleError);
      remoteAuthService.off(nodeReference, 'expired', handleExpired);
    };
  }, [nodeReference]);
  
  // FIXED: Removed excessive polling - only check auth state when needed
  useEffect(() => {
    // Only check auth state if significant time has passed or on specific events
    const checkAuthState = () => {
      const now = Date.now();
      // Only check if more than 5 seconds have passed since last check
      if (now - lastAuthCheckRef.current > 5000) {
        const currentAuth = remoteAuthService.isAuthenticated(nodeReference);
        if (currentAuth !== isRemoteAuthenticated) {
          console.log('[useRemoteManagement] Auth state changed:', currentAuth);
          setIsRemoteAuthenticated(currentAuth);
        }
        lastAuthCheckRef.current = now;
      }
    };
    
    // Check on mount and when terminal session changes
    checkAuthState();
  }, [nodeReference, terminalSession]);
  
  // ==================== Terminal Management ====================
  
  /**
   * Initialize terminal session
   * NOTE: JWT authentication must be done externally before calling this
   */
  const initializeTerminal = useCallback(async () => {
    // Prevent duplicate initialization
    if (isInitializedRef.current || isConnecting) {
      console.log('[useRemoteManagement] Already initializing or initialized');
      return sessionRef.current ? { sessionId: sessionRef.current } : null;
    }
    
    // Check prerequisites
    if (!nodeReference) {
      setError('No node reference provided');
      return null;
    }
    
    if (!isWebSocketReady) {
      console.log('[useRemoteManagement] WebSocket not ready');
      setError('WebSocket not authenticated yet, please wait...');
      return null;
    }
    
    // CRITICAL: Check if JWT authenticated
    const currentAuthState = remoteAuthService.isAuthenticated(nodeReference);
    console.log('[useRemoteManagement] Current auth state for', nodeReference, ':', currentAuthState);
    
    if (!currentAuthState) {
      console.log('[useRemoteManagement] Not JWT authenticated for node:', nodeReference);
      setError('Remote authentication required. Please authenticate first.');
      return null;
    }
    
    setIsConnecting(true);
    setError(null);
    isInitializedRef.current = true;
    
    try {
      console.log('[useRemoteManagement] Creating terminal session for:', nodeReference);
      
      // Create new session through store
      const sessionId = await createSession(nodeReference, {
        rows: 24,
        cols: 80
      });
      
      if (!sessionId) {
        throw new Error('Failed to create terminal session');
      }
      
      // Get the session from service
      const session = terminalService.getSession(sessionId);
      if (!session) {
        throw new Error('Failed to get terminal session from service');
      }
      
      sessionRef.current = sessionId;
      
      // Set up event listeners on the session
      outputHandlerRef.current = (data) => {
        console.log('[useRemoteManagement] Terminal output received:', data?.length || 0, 'bytes');
        // Output is handled by the component listening to WebSocket messages
      };
      
      errorHandlerRef.current = (error) => {
        console.error('[useRemoteManagement] Terminal error:', error);
        if (isMountedRef.current) {
          setError(error?.message || error);
        }
      };
      
      closedHandlerRef.current = () => {
        console.log('[useRemoteManagement] Terminal session closed');
        if (isMountedRef.current) {
          setTerminalReady(false);
          setTerminalSession(null);
          sessionRef.current = null;
          isInitializedRef.current = false;
        }
      };
      
      readyHandlerRef.current = () => {
        console.log('[useRemoteManagement] Terminal session ready');
        if (isMountedRef.current) {
          setTerminalReady(true);
        }
      };
      
      // Attach listeners
      session.on('output', outputHandlerRef.current);
      session.on('error', errorHandlerRef.current);
      session.on('closed', closedHandlerRef.current);
      session.on('ready', readyHandlerRef.current);
      
      // Update state
      if (isMountedRef.current) {
        setTerminalSession(sessionId);
        setTerminalReady(true);
        setIsConnecting(false);
      }
      
      console.log('[useRemoteManagement] Terminal session created:', sessionId);
      
      return { sessionId };
      
    } catch (error) {
      console.error('[useRemoteManagement] Failed to initialize terminal:', error);
      
      if (isMountedRef.current) {
        setError(error.message || 'Failed to initialize terminal');
        setIsConnecting(false);
        isInitializedRef.current = false;
      }
      
      return null;
    }
  }, [nodeReference, isWebSocketReady, createSession]);
  
  /**
   * Send input to terminal
   */
  const sendTerminalInput = useCallback((data) => {
    if (!terminalSession || !terminalReady) {
      console.warn('[useRemoteManagement] Cannot send input - terminal not ready');
      return false;
    }
    
    console.log('[useRemoteManagement] Sending terminal input:', data?.length || 0, 'bytes');
    
    // Send through store which handles the service layer
    sendInput(terminalSession, data);
    
    return true;
  }, [terminalSession, terminalReady, sendInput]);
  
  /**
   * Execute command (convenience method)
   */
  const executeCommand = useCallback((command) => {
    if (!command) return false;
    
    // Add newline if not present
    const commandWithNewline = command.endsWith('\n') ? command : `${command}\n`;
    
    return sendTerminalInput(commandWithNewline);
  }, [sendTerminalInput]);
  
  /**
   * Close terminal session
   */
  const closeTerminal = useCallback(() => {
    console.log('[useRemoteManagement] Closing terminal session');
    
    if (terminalSession) {
      // Get session from service for cleanup
      const session = terminalService.getSession(terminalSession);
      
      if (session) {
        // Remove listeners
        if (outputHandlerRef.current) session.off('output', outputHandlerRef.current);
        if (errorHandlerRef.current) session.off('error', errorHandlerRef.current);
        if (closedHandlerRef.current) session.off('closed', closedHandlerRef.current);
        if (readyHandlerRef.current) session.off('ready', readyHandlerRef.current);
      }
      
      // Close through store
      closeSession(terminalSession);
    }
    
    // Reset state
    setTerminalSession(null);
    setTerminalReady(false);
    setError(null);
    sessionRef.current = null;
    isInitializedRef.current = false;
  }, [terminalSession, closeSession]);
  
  /**
   * Reconnect terminal
   */
  const reconnectTerminal = useCallback(async () => {
    console.log('[useRemoteManagement] Reconnecting terminal');
    
    // Close existing session
    closeTerminal();
    
    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Force refresh auth state once
    const authState = remoteAuthService.isAuthenticated(nodeReference);
    setIsRemoteAuthenticated(authState);
    
    if (!authState) {
      console.log('[useRemoteManagement] Not authenticated, cannot reconnect terminal');
      setError('Authentication required for terminal');
      return null;
    }
    
    // Reinitialize
    return initializeTerminal();
  }, [closeTerminal, initializeTerminal, nodeReference]);
  
  /**
   * Get terminal status
   */
  const getStatus = useCallback(() => {
    return {
      sessionId: terminalSession,
      isReady: terminalReady,
      isConnecting,
      hasError: !!error,
      error,
      isNodeOnline,
      isWebSocketReady,
      isRemoteAuthenticated
    };
  }, [terminalSession, terminalReady, isConnecting, error, isNodeOnline, isWebSocketReady, isRemoteAuthenticated]);
  
  // ==================== WebSocket Error Handling ====================
  
  /**
   * Listen for WebSocket errors related to remote management
   */
  useEffect(() => {
    const handleWebSocketError = (message) => {
      // Only log important messages, not every message
      if (message.type === 'error' || message.type?.startsWith('term_')) {
        console.log('[useRemoteManagement] WebSocket message received:', message.type);
      }
      
      // Check for remote management specific errors
      if (message.type === 'error') {
        if (message.code === 'REMOTE_NOT_ENABLED') {
          if (isMountedRef.current) {
            setError('Remote management is not enabled for this node');
            setIsConnecting(false);
            setTerminalReady(false);
            isInitializedRef.current = false;
          }
        } else if (message.code === 'INVALID_JWT' || 
                   message.code === 'REMOTE_AUTH_FAILED' ||
                   message.code === 'AUTH_FAILED') {
          if (isMountedRef.current) {
            setError('Authentication failed. Please re-authenticate.');
            setIsRemoteAuthenticated(false);
            // Clear JWT token for this node
            remoteAuthService.clearToken(nodeReference);
          }
        } else if (message.code === 'SESSION_NOT_FOUND') {
          if (isMountedRef.current && message.session_id === terminalSession) {
            setError('Terminal session lost');
            closeTerminal();
          }
        }
      }
    };
    
    // Listen to WebSocket service errors
    webSocketService.on('message', handleWebSocketError);
    
    return () => {
      webSocketService.off('message', handleWebSocketError);
    };
  }, [nodeReference, terminalSession, closeTerminal]);
  
  // ==================== Effects ====================
  
  /**
   * Set mounted state
   */
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      console.log('[useRemoteManagement] Unmounting, cleaning up');
      
      // Clean up session if exists
      if (sessionRef.current) {
        const session = terminalService.getSession(sessionRef.current);
        
        if (session) {
          // Remove listeners
          if (outputHandlerRef.current) session.off('output', outputHandlerRef.current);
          if (errorHandlerRef.current) session.off('error', errorHandlerRef.current);
          if (closedHandlerRef.current) session.off('closed', closedHandlerRef.current);
          if (readyHandlerRef.current) session.off('ready', readyHandlerRef.current);
        }
        
        // Close session
        if (terminalService.getSession(sessionRef.current)) {
          closeSession(sessionRef.current);
        }
      }
      
      isInitializedRef.current = false;
    };
  }, [closeSession]);
  
  /**
   * Monitor node status changes
   */
  useEffect(() => {
    // If node goes offline, close terminal
    if (terminalSession && !isNodeOnline) {
      console.log('[useRemoteManagement] Node went offline, closing terminal');
      closeTerminal();
    }
  }, [isNodeOnline, terminalSession, closeTerminal]);
  
  /**
   * Monitor WebSocket authentication changes
   */
  useEffect(() => {
    // If WebSocket disconnects, mark terminal as not ready
    if (terminalSession && !isWebSocketReady) {
      console.log('[useRemoteManagement] WebSocket disconnected, marking terminal not ready');
      setTerminalReady(false);
    }
  }, [isWebSocketReady, terminalSession]);
  
  /**
   * Monitor JWT authentication changes
   */
  useEffect(() => {
    // If JWT expires or is cleared, close terminal
    if (terminalSession && !isRemoteAuthenticated) {
      console.log('[useRemoteManagement] JWT authentication lost, closing terminal');
      closeTerminal();
    }
  }, [isRemoteAuthenticated, terminalSession, closeTerminal]);
  
  // ==================== Return API ====================
  
  // Reduced logging to prevent performance issues
  useEffect(() => {
    const logInterval = setInterval(() => {
      if (node && isNodeOnline) {
        console.log('[useRemoteManagement] Node found:', node);
        console.log('[useRemoteManagement] Node online status:', isNodeOnline);
      }
    }, 10000); // Log every 10 seconds instead of continuously
    
    return () => clearInterval(logInterval);
  }, [node, isNodeOnline]);
  
  return {
    // State
    terminalSession,
    terminalReady,
    isConnecting,
    error,
    
    // Authentication & Connection Status
    isRemoteAuthenticated,
    isNodeOnline,
    isWebSocketReady,
    
    // Actions
    initializeTerminal,
    sendTerminalInput,
    executeCommand,
    closeTerminal,
    reconnectTerminal,
    getStatus,
    
    // Store state (for debugging)
    wsState,
    nodes: wsNodes || storeNodes,
    
    // JWT token info
    tokenExpiry: remoteAuthService.getFormattedExpiry(nodeReference),
    
    // Force refresh auth state (for debugging)
    refreshAuthState: () => {
      const newAuth = remoteAuthService.isAuthenticated(nodeReference);
      setIsRemoteAuthenticated(newAuth);
      lastAuthCheckRef.current = Date.now();
      return newAuth;
    }
  };
}

// Default export for compatibility
export default useRemoteManagement;
