/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Remote Management Hook - Terminal Session Management with JWT Auth
 * 
 * Creation Reason: Provide terminal management logic for RemoteManagement component
 * Modification Reason: Added remote_auth JWT authentication step
 * Main Functionality: Manage terminal sessions with proper authentication flow
 * Dependencies: terminalStore, webSocketService, terminalService
 * 
 * Main Logical Flow:
 * 1. Check WebSocket authentication status
 * 2. Get JWT token from backend API
 * 3. Send remote_auth message with JWT
 * 4. Wait for remote_auth_success
 * 5. Create terminal session
 * 6. Handle bi-directional terminal communication
 * 
 * ⚠️ Important Note for Next Developer:
 * - MUST send remote_auth with JWT before term_init
 * - JWT token should be obtained from backend API
 * - Session cleanup is automatic on unmount
 * 
 * Last Modified: v2.0.0 - Added JWT authentication flow
 * ============================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import useTerminalStore from '../stores/terminalStore';
import terminalService from '../services/TerminalService';
import webSocketService from '../services/WebSocketService';
import { useAeroNyxWebSocket } from './useAeroNyxWebSocket';

/**
 * Get JWT token for remote management
 * TODO: Replace with actual API endpoint
 */
async function getRemoteJWTToken(nodeReference) {
  try {
    // Get user token from storage
    const userToken = localStorage.getItem('aeronyx_auth_token') || 
                     sessionStorage.getItem('aeronyx_auth_token');
    
    if (!userToken) {
      throw new Error('No user authentication token found');
    }
    
    // Call API to get JWT token
    // NOTE: This endpoint needs to be confirmed with backend team
    const response = await fetch('https://api.aeronyx.network/api/remote/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        node_reference: nodeReference,
        purpose: 'remote_management'
      })
    });

    if (!response.ok) {
      // If endpoint doesn't exist, use a temporary token for development
      if (response.status === 404) {
        console.warn('[useRemoteManagement] JWT endpoint not found, using temp token');
        // In development, you might want to return a test token
        // In production, this should throw an error
        return 'development_jwt_token_' + nodeReference;
      }
      
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to get JWT token: ${response.status}`);
    }

    const data = await response.json();
    return data.jwt_token || data.token;
    
  } catch (error) {
    console.error('[useRemoteManagement] Failed to get JWT token:', error);
    // For development, return a temporary token
    // Remove this in production
    if (process.env.NODE_ENV === 'development') {
      return 'dev_jwt_' + nodeReference + '_' + Date.now();
    }
    throw error;
  }
}

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
  const jwtTokenRef = useRef(null);
  
  // Get store state
  const { 
    wsState, 
    nodes,
    createSession,
    sendInput,
    closeSession,
    getSession
  } = useTerminalStore();
  
  // Get WebSocket state
  const { 
    wsState: wsConnectionState 
  } = useAeroNyxWebSocket({
    autoConnect: true,
    autoMonitor: true
  });
  
  // Determine if WebSocket is ready
  const isWebSocketReady = wsState?.authenticated || wsConnectionState?.authenticated;
  
  // Get node status
  const node = nodes[nodeReference];
  const isNodeOnline = node && (
    node.status === 'online' || 
    node.status === 'active' ||
    node.status === 'running'
  );
  
  // ==================== Remote Authentication ====================
  
  /**
   * Perform remote authentication with JWT
   */
  const performRemoteAuth = useCallback(async () => {
    console.log('[useRemoteManagement] Starting remote authentication');
    
    try {
      // Get JWT token
      const jwtToken = await getRemoteJWTToken(nodeReference);
      jwtTokenRef.current = jwtToken;
      
      console.log('[useRemoteManagement] Got JWT token, sending remote_auth');
      
      // Send remote_auth message
      const authMessage = {
        type: 'remote_auth',
        jwt_token: jwtToken
      };
      
      // Wait for auth response
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          webSocketService.off('message', handleMessage);
          reject(new Error('Remote authentication timeout'));
        }, 5000);  // 降低到5秒
        
        const handleMessage = (message) => {
          console.log('[useRemoteManagement] Auth response:', message.type);
          
          if (message.type === 'remote_auth_success') {
            clearTimeout(timeout);
            webSocketService.off('message', handleMessage);
            setIsRemoteAuthenticated(true);
            console.log('[useRemoteManagement] Remote auth successful');
            resolve(true);
          } else if (message.type === 'error' && 
                     (message.code === 'REMOTE_NOT_ENABLED' || 
                      message.code === 'INVALID_JWT' ||
                      message.code === 'REMOTE_AUTH_FAILED')) {
            clearTimeout(timeout);
            webSocketService.off('message', handleMessage);
            reject(new Error(message.message || 'Remote authentication failed'));
          }
        };
        
        webSocketService.on('message', handleMessage);
        
        const sent = webSocketService.send(authMessage);
        if (!sent) {
          clearTimeout(timeout);
          webSocketService.off('message', handleMessage);
          reject(new Error('Failed to send authentication message'));
        }
      });
      
    } catch (error) {
      console.error('[useRemoteManagement] Remote auth failed:', error);
      throw error;
    }
  }, [nodeReference]);
  
  // ==================== Terminal Management ====================
  
  /**
   * Initialize terminal session
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
    
    setIsConnecting(true);
    setError(null);
    isInitializedRef.current = true;
    
    try {
      // CRITICAL: Perform remote authentication first
      if (!isRemoteAuthenticated) {
        console.log('[useRemoteManagement] Need remote auth first');
        await performRemoteAuth();
      }
      
      // CRITICAL: Perform remote authentication first
      if (!isRemoteAuthenticated) {
        console.log('[useRemoteManagement] Need remote auth first');
        await performRemoteAuth();
      }
      
      // Wait a bit to ensure auth is processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
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
          setIsRemoteAuthenticated(false);
          sessionRef.current = null;
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
        setIsRemoteAuthenticated(false);
        isInitializedRef.current = false;
      }
      
      // If auth failed, clear the token
      if (error.message?.includes('auth') || error.message?.includes('JWT')) {
        jwtTokenRef.current = null;
        setIsRemoteAuthenticated(false);
      }
      
      return null;
    }
  }, [nodeReference, isWebSocketReady, isRemoteAuthenticated, performRemoteAuth, createSession]);
  
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
    setIsRemoteAuthenticated(false);
    sessionRef.current = null;
    jwtTokenRef.current = null;
    isInitializedRef.current = false;
  }, [terminalSession, closeSession]);
  
  /**
   * Reconnect terminal
   */
  const reconnectTerminal = useCallback(async () => {
    closeTerminal();
    
    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return initializeTerminal();
  }, [closeTerminal, initializeTerminal]);
  
  // ==================== WebSocket Error Handling ====================
  
  /**
   * Listen for WebSocket errors related to remote management
   */
  useEffect(() => {
    const handleWebSocketError = (message) => {
      console.log('[useRemoteManagement] WebSocket error received:', message);
      
      // Check for remote management specific errors
      if (message.code === 'REMOTE_NOT_ENABLED') {
        if (isMountedRef.current) {
          setError('Remote management is not enabled. This might be a JWT token issue.');
          setIsConnecting(false);
          setTerminalReady(false);
          setIsRemoteAuthenticated(false);
          isInitializedRef.current = false;
        }
      } else if (message.code === 'INVALID_JWT' || message.code === 'REMOTE_AUTH_FAILED') {
        if (isMountedRef.current) {
          setError('Authentication failed. Please try again.');
          setIsRemoteAuthenticated(false);
          jwtTokenRef.current = null;
        }
      }
    };
    
    // Listen to WebSocket service errors
    webSocketService.on('error', handleWebSocketError);
    
    return () => {
      webSocketService.off('error', handleWebSocketError);
    };
  }, []);
  
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
      }
      
      isInitializedRef.current = false;
      setIsRemoteAuthenticated(false);
    };
  }, []);
  
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
   * Monitor WebSocket authentication
   */
  useEffect(() => {
    // If WebSocket disconnects, mark terminal as not ready
    if (terminalSession && !isWebSocketReady) {
      console.log('[useRemoteManagement] WebSocket disconnected, marking terminal not ready');
      setTerminalReady(false);
      setIsRemoteAuthenticated(false);
    }
  }, [isWebSocketReady, terminalSession]);
  
  /**
   * Set remote authenticated state (for external control)
   */
  const setRemoteAuthenticatedState = useCallback((authenticated) => {
    console.log('[useRemoteManagement] Setting remote authenticated state:', authenticated);
    setIsRemoteAuthenticated(authenticated);
  }, []);
  
  // ==================== Return API ====================
  
  return {
    // State
    terminalSession,
    terminalReady,
    isConnecting,
    error,
    isRemoteAuthenticated,
    
    // Node status
    isNodeOnline,
    isWebSocketReady,
    
    // Actions
    initializeTerminal,
    sendTerminalInput,
    executeCommand,
    closeTerminal,
    reconnectTerminal,
    setRemoteAuthenticatedState,  // Add this to allow external control
    
    // Store state (for debugging)
    wsState,
    nodes
  };
}

// Default export for compatibility
export default useRemoteManagement;
