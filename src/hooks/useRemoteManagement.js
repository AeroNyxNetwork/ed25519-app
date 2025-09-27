/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Remote Management Hook - Terminal Session Management
 * 
 * Creation Reason: Provide terminal management logic for RemoteManagement component
 * Modification Reason: Created to resolve missing import error
 * Main Functionality: Manage terminal sessions, WebSocket communication, command execution
 * Dependencies: terminalStore, webSocketService, terminalService
 * 
 * Main Logical Flow:
 * 1. Check WebSocket authentication status
 * 2. Create terminal session when requested
 * 3. Handle bi-directional terminal communication
 * 4. Manage session lifecycle and cleanup
 * 
 * ⚠️ Important Note for Next Developer:
 * - This hook manages terminal sessions at a high level
 * - It coordinates between WebSocket service and terminal service
 * - Session cleanup is automatic on unmount
 * - WebSocket must be authenticated before terminal initialization
 * 
 * Last Modified: v1.0.0 - Initial implementation
 * ============================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import useTerminalStore from '../stores/terminalStore';
import terminalService from '../services/TerminalService';
import webSocketService from '../services/WebSocketService';
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
  
  // Refs for cleanup and session management
  const sessionRef = useRef(null);
  const isInitializedRef = useRef(false);
  const isMountedRef = useRef(true);
  const outputHandlerRef = useRef(null);
  const errorHandlerRef = useRef(null);
  const closedHandlerRef = useRef(null);
  const readyHandlerRef = useRef(null);
  
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
    
    if (!isNodeOnline) {
      setError('Node is offline');
      return null;
    }
    
    if (!isWebSocketReady) {
      setError('WebSocket not authenticated');
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
  }, [nodeReference, isNodeOnline, isWebSocketReady, createSession]);
  
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
    closeTerminal();
    
    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return initializeTerminal();
  }, [closeTerminal, initializeTerminal]);
  
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
        
        // Note: We don't close the session here to allow reconnection
        // The session will be cleaned up by the service's idle timeout
      }
      
      isInitializedRef.current = false;
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
      setError('WebSocket disconnected');
    }
  }, [isWebSocketReady, terminalSession]);
  
  // ==================== Return API ====================
  
  return {
    // State
    terminalSession,
    terminalReady,
    isConnecting,
    error,
    
    // Node status
    isNodeOnline,
    isWebSocketReady,
    
    // Actions
    initializeTerminal,
    sendTerminalInput,
    executeCommand,
    closeTerminal,
    reconnectTerminal,
    
    // Store state (for debugging)
    wsState,
    nodes
  };
}

// Default export for compatibility
export default useRemoteManagement;
