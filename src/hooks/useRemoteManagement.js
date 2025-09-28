/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Remote Management Hook - Terminal Session Management
 * 
 * Creation Reason: Provide terminal management logic for RemoteManagement component
 * Modification Reason: Fix duplicate session retrieval and early terminal close issue
 * Main Functionality: Manage terminal sessions with proper state updates
 * Dependencies: terminalStore, webSocketService, terminalService, remoteAuthService
 * 
 * Main Logical Flow:
 * 1. Check WebSocket authentication status
 * 2. Verify JWT authentication (handled by RemoteAuthService)
 * 3. Create terminal session and UPDATE STATE properly
 * 4. Handle bi-directional terminal communication
 * 
 * ⚠️ Important Note for Next Developer:
 * - CRITICAL FIX: Removed duplicate session retrieval that was causing errors
 * - Session ready state must be tracked properly
 * - JWT authentication is handled by RemoteAuthService
 * - sendTerminalInput uses WebSocket directly to avoid terminalService issues
 * - Session cleanup is handled by RemoteManagement component
 * 
 * Last Modified: v5.0.0 - Fixed duplicate session retrieval and early close issue
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
    nodes: wsNodes
  } = useAeroNyxWebSocket({
    autoConnect: true,
    autoMonitor: true
  });
  
  // Determine if WebSocket is ready
  const isWebSocketReady = wsState?.authenticated || wsConnectionState?.authenticated;
  
  // Get node status
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
        // Don't automatically close terminal here - let component decide
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
  
  // ==================== Terminal Management ====================
  
  /**
   * Initialize terminal session - FIXED VERSION
   * NOTE: JWT authentication must be done externally before calling this
   */
  const initializeTerminal = useCallback(async () => {
    // Prevent duplicate initialization - but allow if no session exists
    if (isInitializedRef.current && sessionRef.current) {
      console.log('[useRemoteManagement] Already initialized with session:', sessionRef.current);
      return { sessionId: sessionRef.current };
    }
    
    if (isConnecting) {
      console.log('[useRemoteManagement] Already connecting, waiting...');
      // Wait for current connection attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (sessionRef.current) {
        return { sessionId: sessionRef.current };
      }
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
      let sessionId = await createSession(nodeReference, {
        rows: 24,
        cols: 80
      });
      
      if (!sessionId) {
        throw new Error('Failed to create terminal session');
      }
      
      console.log('[useRemoteManagement] Terminal session created:', sessionId);
      
      // Store session ID immediately
      sessionRef.current = sessionId;
      
      // CRITICAL FIX: Update state immediately after successful creation
      if (isMountedRef.current) {
        setTerminalSession(sessionId);
        console.log('[useRemoteManagement] Terminal session state updated:', sessionId);
      }
      
      // Try to get session from service (but don't fail if it doesn't exist)
      let session = terminalService.getSession(sessionId);
      
      if (!session) {
        console.warn('[useRemoteManagement] Session not found in service after creation');
        console.log('[useRemoteManagement] All sessions:', terminalService.getAllSessionsInfo());
        
        // Try to manually create it in the service
        console.log('[useRemoteManagement] Attempting manual session creation in service');
        try {
          const manualSession = await terminalService.createSession(nodeReference, {
            rows: 24,
            cols: 80,
            sessionId: sessionId  // Pass the sessionId to maintain consistency
          });
          
          if (manualSession && manualSession.sessionId) {
            session = terminalService.getSession(manualSession.sessionId);
            if (manualSession.sessionId !== sessionId) {
              // Update to the new session ID if different
              sessionId = manualSession.sessionId;
              sessionRef.current = sessionId;
              if (isMountedRef.current) {
                setTerminalSession(sessionId);
              }
            }
          }
        } catch (manualError) {
          console.warn('[useRemoteManagement] Manual session creation failed:', manualError);
          // Continue anyway - we can still use WebSocket directly
        }
      }
      
      if (session) {
        console.log('[useRemoteManagement] Session verified in service:', session.getInfo());
        
        // Set up event listeners on the session
        const handlers = {
          output: (data) => {
            console.log('[useRemoteManagement] Terminal output received:', data?.length || 0, 'bytes');
            // Output is handled by the component listening to WebSocket messages
          },
          error: (error) => {
            console.error('[useRemoteManagement] Terminal error:', error);
            if (isMountedRef.current) {
              setError(error?.message || error);
              setTerminalReady(false);
            }
          },
          closed: () => {
            console.log('[useRemoteManagement] Terminal session closed');
            if (isMountedRef.current) {
              setTerminalReady(false);
              setTerminalSession(null);
              sessionRef.current = null;
              isInitializedRef.current = false;
            }
          },
          ready: () => {
            console.log('[useRemoteManagement] Terminal session ready');
            if (isMountedRef.current) {
              setTerminalReady(true);
              console.log('[useRemoteManagement] Terminal ready state updated to true');
            }
          }
        };
        
        // Store handlers for cleanup
        outputHandlerRef.current = handlers.output;
        errorHandlerRef.current = handlers.error;
        closedHandlerRef.current = handlers.closed;
        readyHandlerRef.current = handlers.ready;
        
        // Attach listeners
        Object.entries(handlers).forEach(([event, handler]) => {
          session.on(event, handler);
        });
        
        // Wait for session to be ready (with timeout)
        await new Promise((resolve) => {
          const readyTimeout = setTimeout(() => {
            // If session is initialized but not marked ready, mark it ready anyway
            if (isMountedRef.current && sessionId) {
              setTerminalReady(true);
              console.log('[useRemoteManagement] Marking terminal ready after timeout');
            }
            resolve();
          }, 2000); // 2 second timeout for ready state
          
          // Listen for ready event
          session.once('ready', () => {
            clearTimeout(readyTimeout);
            if (isMountedRef.current) {
              setTerminalReady(true);
              console.log('[useRemoteManagement] Terminal marked ready from event');
            }
            resolve();
          });
        });
      } else {
        // No session object, but we can still work with WebSocket directly
        console.log('[useRemoteManagement] Working without terminalService session object');
        
        // Mark as ready after a short delay
        setTimeout(() => {
          if (isMountedRef.current && sessionId) {
            setTerminalReady(true);
            console.log('[useRemoteManagement] Terminal marked ready (WebSocket mode)');
          }
        }, 500);
      }
      
      // Final state update
      if (isMountedRef.current) {
        setIsConnecting(false);
        console.log('[useRemoteManagement] Terminal initialization complete. Session:', sessionId, 'Ready:', true);
      }
      
      return { sessionId };
      
    } catch (error) {
      console.error('[useRemoteManagement] Failed to initialize terminal:', error);
      
      if (isMountedRef.current) {
        setError(error.message || 'Failed to initialize terminal');
        setIsConnecting(false);
        setTerminalSession(null);
        setTerminalReady(false);
        isInitializedRef.current = false;
        sessionRef.current = null;
      }
      
      return null;
    }
  }, [nodeReference, isWebSocketReady, createSession, isConnecting]);
  
  // Create ref to store current state for sendTerminalInput
  const terminalStateRef = useRef({
    session: null,
    ready: false
  });
  
  // Update ref when state changes
  useEffect(() => {
    terminalStateRef.current = {
      session: terminalSession || sessionRef.current,
      ready: terminalReady
    };
  }, [terminalSession, terminalReady]);
  
  /**
   * Send input to terminal - Fixed to use WebSocket directly with Base64 encoding
   * This bypasses terminalService to avoid session lookup issues
   * CRITICAL: Data must be Base64 encoded for the backend
   */
  const sendTerminalInput = useCallback((data) => {
    // Get current state from ref instead of closure
    const { session: currentSession, ready: currentReady } = terminalStateRef.current;
    
    if (!currentSession) {
      console.warn('[useRemoteManagement] Cannot send input - no session. Session:', currentSession);
      return false;
    }
    
    if (!currentReady) {
      console.warn('[useRemoteManagement] Terminal not ready yet, but sending anyway. Ready:', currentReady);
      // Continue anyway - the terminal might still accept input
    }
    
    console.log('[useRemoteManagement] Sending terminal input to session:', currentSession, 'Data length:', data?.length || 0);
    
    // CRITICAL FIX: Convert data to Base64 for backend compatibility
    let base64Data;
    try {
      // Convert string to UTF-8 bytes then to Base64
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(data);
      base64Data = btoa(String.fromCharCode.apply(null, uint8Array));
      console.log('[useRemoteManagement] Encoded input to Base64:', base64Data);
    } catch (error) {
      console.error('[useRemoteManagement] Failed to encode input to Base64:', error);
      return false;
    }
    
    // Send directly via WebSocket with Base64 encoded data
    const success = webSocketService.send({
      type: 'term_input',
      session_id: currentSession,
      data: base64Data  // Send Base64 encoded data
    });
    
    if (!success) {
      console.error('[useRemoteManagement] Failed to send input via WebSocket');
    }
    
    return success;
  }, []); // No dependencies needed since we use ref
  
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
   * Close terminal session - with logging to debug early close issue
   */
  const closeTerminal = useCallback(() => {
    const currentSession = terminalSession || sessionRef.current;
    
    console.log('[useRemoteManagement] closeTerminal called, session:', currentSession);
    
    if (currentSession) {
      // Get session from service for cleanup
      const session = terminalService.getSession(currentSession);
      
      if (session) {
        // Remove listeners
        if (outputHandlerRef.current) session.off('output', outputHandlerRef.current);
        if (errorHandlerRef.current) session.off('error', errorHandlerRef.current);
        if (closedHandlerRef.current) session.off('closed', closedHandlerRef.current);
        if (readyHandlerRef.current) session.off('ready', readyHandlerRef.current);
      }
      
      // Close through store (which sends term_close via WebSocket)
      closeSession(currentSession);
      
      console.log('[useRemoteManagement] Terminal session closed:', currentSession);
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
      sessionId: terminalSession || sessionRef.current,
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
   * Cleanup on unmount - FIXED to prevent early cleanup
   */
  useEffect(() => {
    // Store current session in cleanup closure
    const currentSession = terminalSession || sessionRef.current;
    
    return () => {
      console.log('[useRemoteManagement] Hook unmounting');
      
      // Only cleanup if hook is unmounting with an active session
      if (currentSession) {
        console.log('[useRemoteManagement] Hook unmounting with session, will be cleaned by RemoteManagement');
        // Don't close here - let RemoteManagement component decide
      }
      
      // Just clean up refs
      isInitializedRef.current = false;
    };
  }, []); // Empty deps - only run on mount/unmount
  
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
  
  // Debug logging on state changes
  useEffect(() => {
    console.log('[useRemoteManagement] State updated:', {
      terminalSession: terminalSession || sessionRef.current,
      terminalReady,
      isConnecting,
      isRemoteAuthenticated,
      isNodeOnline,
      hasError: !!error
    });
  }, [terminalSession, terminalReady, isConnecting, isRemoteAuthenticated, isNodeOnline, error]);
  
  return {
    // State
    terminalSession: terminalSession || sessionRef.current,
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
