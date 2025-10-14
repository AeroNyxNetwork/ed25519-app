/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Remote Management Hook - COMPLETE FIXED VERSION v7.2.0
 * 
 * ✅ FIXED: Added proper remote_command_response handling
 * ✅ ALL ORIGINAL FUNCTIONS PRESERVED
 * 
 * Key Fix in v7.2.0:
 * - Added WebSocket message listener for remote_command_response
 * - Fixed Promise resolution/rejection for remote commands
 * - Enhanced error handling and logging
 * 
 * Last Modified: v7.2.0 - Complete fix with all features intact
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
 * Remote Command Types (must match backend RemoteCommandData in remote_command_handler.rs)
 * ✅ CRITICAL: These MUST match the command_type strings in the Rust backend!
 * Backend match statement is at line 212-221 in remote_command_handler.rs
 */
const REMOTE_COMMAND_TYPES = {
  LIST_FILES: 'list',        // ✅ FIXED: Backend expects "list" not "list_files"
  READ_FILE: 'download',     // ✅ FIXED: Backend expects "download" not "read_file"
  WRITE_FILE: 'upload',      // ✅ FIXED: Backend expects "upload" not "write_file"
  DELETE_FILE: 'delete',     // Backend expects "delete"
  SYSTEM_INFO: 'system_info', // ✅ Correct
  EXECUTE: 'execute'          // ✅ Correct
};

/**
 * Remote Management Hook
 * Provides both terminal session management AND remote command execution
 */
export function useRemoteManagement(nodeReference) {
  // ==================== State ====================
  const [terminalSession, setTerminalSession] = useState(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [isRemoteAuthenticated, setIsRemoteAuthenticated] = useState(false);
  
  // Refs
  const sessionRef = useRef(null);
  const isInitializedRef = useRef(false);
  const isMountedRef = useRef(true);
  const outputHandlerRef = useRef(null);
  const errorHandlerRef = useRef(null);
  const closedHandlerRef = useRef(null);
  const readyHandlerRef = useRef(null);
  const authListenerRef = useRef(null);
  const commandHandlersRef = useRef(new Map()); // For remote command responses
  
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
  
  // Try to find node
  if (Array.isArray(wsNodes)) {
    node = wsNodes.find(n => n.code === nodeReference || n.reference === nodeReference);
  } else if (wsNodes && typeof wsNodes === 'object') {
    node = wsNodes[nodeReference];
  }
  
  if (!node && Array.isArray(storeNodes)) {
    node = storeNodes.find(n => n.code === nodeReference || n.reference === nodeReference);
  } else if (!node && storeNodes && typeof storeNodes === 'object') {
    node = storeNodes[nodeReference];
  }
  
  // Check if node is online
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
  
  useEffect(() => {
    const initialAuth = remoteAuthService.isAuthenticated(nodeReference);
    setIsRemoteAuthenticated(initialAuth);
    console.log('[useRemoteManagement] Initial auth state for', nodeReference, ':', initialAuth);
    
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
      }
    };
    
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
  
  // ==================== Smart WebSocket Connection Waiting ====================
  
  /**
   * ✅ NEW: Smart wait for WebSocket connection
   * Waits for user signature, WebSocket connection, and authentication
   * Production-ready with proper timeout and status reporting
   */
  const waitForWebSocketReady = useCallback(async (maxWaitTime = 30000) => {
    console.log('[useRemoteManagement] 🔄 Waiting for WebSocket to be ready...');
    
    const startTime = Date.now();
    const checkInterval = 500; // Check every 500ms
    
    while (Date.now() - startTime < maxWaitTime) {
      // Check WebSocket state
      const ws = window.globalWebSocket || webSocketService.ws;
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Check if authenticated
        const isAuthenticated = wsState?.authenticated || wsConnectionState?.authenticated;
        
        if (isAuthenticated) {
          console.log('[useRemoteManagement] ✅ WebSocket is ready and authenticated');
          return true;
        } else {
          console.log('[useRemoteManagement] ⏳ WebSocket connected, waiting for authentication...');
        }
      } else if (ws && ws.readyState === WebSocket.CONNECTING) {
        console.log('[useRemoteManagement] ⏳ WebSocket is connecting...');
      } else {
        console.log('[useRemoteManagement] ⏳ Waiting for WebSocket connection...');
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    console.log('[useRemoteManagement] ❌ WebSocket connection timeout after', maxWaitTime / 1000, 'seconds');
    return false;
  }, [wsState, wsConnectionState]);
  
  // ==================== Terminal Management (Interactive Shell) ====================
  
  /**
   * ✅ IMPROVED: Initialize terminal session with smart waiting
   * Production-ready terminal initialization with proper error handling
   * This is ONLY for the Terminal tab!
   */
  const initializeTerminal = useCallback(async () => {
    if (isInitializedRef.current && sessionRef.current) {
      console.log('[useRemoteManagement] Already initialized with session:', sessionRef.current);
      return { sessionId: sessionRef.current };
    }
    
    if (isConnecting) {
      console.log('[useRemoteManagement] Already connecting, waiting...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (sessionRef.current) {
        return { sessionId: sessionRef.current };
      }
    }
    
    if (!nodeReference) {
      const errorMsg = 'No node reference provided';
      setError(errorMsg);
      return null;
    }
    
    // ✅ IMPROVED: Smart wait for WebSocket with user-friendly status
    if (!isWebSocketReady) {
      console.log('[useRemoteManagement] WebSocket not ready, waiting for connection...');
      setError('Connecting to server, please wait...');
      setIsConnecting(true);
      
      const isReady = await waitForWebSocketReady(30000);
      
      if (!isReady) {
        const errorMsg = 'Connection timeout. Please check your network and try again.';
        setError(errorMsg);
        setIsConnecting(false);
        return null;
      }
      
      setError(null);
    }
    
    // ✅ IMPROVED: Smart check for remote authentication with auto-wait
    const currentAuthState = remoteAuthService.isAuthenticated(nodeReference);
    console.log('[useRemoteManagement] Current auth state for', nodeReference, ':', currentAuthState);
    
    if (!currentAuthState) {
      console.log('[useRemoteManagement] Not JWT authenticated, waiting for authentication...');
      setError('Authenticating remote access, please wait...');
      
      // Wait up to 10 seconds for automatic authentication
      let authWaitTime = 0;
      const authCheckInterval = 500;
      const maxAuthWait = 10000;
      
      while (authWaitTime < maxAuthWait && !remoteAuthService.isAuthenticated(nodeReference)) {
        await new Promise(resolve => setTimeout(resolve, authCheckInterval));
        authWaitTime += authCheckInterval;
      }
      
      // Check again after waiting
      if (!remoteAuthService.isAuthenticated(nodeReference)) {
        const errorMsg = 'Remote authentication required. Please authenticate to use terminal.';
        setError(errorMsg);
        setIsConnecting(false);
        return null;
      }
      
      setError(null);
    }
    
    setIsConnecting(true);
    setError(null);
    isInitializedRef.current = true;
    
    try {
      console.log('[useRemoteManagement] Creating terminal session for:', nodeReference);
      
      let sessionId = await createSession(nodeReference, {
        rows: 24,
        cols: 80
      });
      
      if (!sessionId) {
        throw new Error('Failed to create terminal session');
      }
      
      console.log('[useRemoteManagement] Terminal session created:', sessionId);
      
      sessionRef.current = sessionId;
      
      if (isMountedRef.current) {
        setTerminalSession(sessionId);
        console.log('[useRemoteManagement] Terminal session state updated:', sessionId);
      }
      
      let session = terminalService.getSession(sessionId);
      
      if (!session) {
        console.warn('[useRemoteManagement] Session not found in service after creation');
        try {
          const manualSession = await terminalService.createSession(nodeReference, {
            rows: 24,
            cols: 80,
            sessionId: sessionId
          });
          
          if (manualSession && manualSession.sessionId) {
            session = terminalService.getSession(manualSession.sessionId);
            if (manualSession.sessionId !== sessionId) {
              sessionId = manualSession.sessionId;
              sessionRef.current = sessionId;
              if (isMountedRef.current) {
                setTerminalSession(sessionId);
              }
            }
          }
        } catch (manualError) {
          console.warn('[useRemoteManagement] Manual session creation failed:', manualError);
        }
      }
      
      if (session) {
        console.log('[useRemoteManagement] Session verified in service:', session.getInfo());
        
        const handlers = {
          output: (data) => {
            console.log('[useRemoteManagement] Terminal output received:', data?.length || 0, 'bytes');
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
        
        outputHandlerRef.current = handlers.output;
        errorHandlerRef.current = handlers.error;
        closedHandlerRef.current = handlers.closed;
        readyHandlerRef.current = handlers.ready;
        
        Object.entries(handlers).forEach(([event, handler]) => {
          session.on(event, handler);
        });
        
        await new Promise((resolve) => {
          const readyTimeout = setTimeout(() => {
            if (isMountedRef.current && sessionId) {
              setTerminalReady(true);
              console.log('[useRemoteManagement] Marking terminal ready after timeout');
            }
            resolve();
          }, 2000);
          
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
        console.log('[useRemoteManagement] Working without terminalService session object');
        
        setTimeout(() => {
          if (isMountedRef.current && sessionId) {
            setTerminalReady(true);
            console.log('[useRemoteManagement] Terminal marked ready (WebSocket mode)');
          }
        }, 500);
      }
      
      if (isMountedRef.current) {
        setIsConnecting(false);
        console.log('[useRemoteManagement] Terminal initialization complete. Session:', sessionId, 'Ready:', true);
      }
      
      return { sessionId };
      
    } catch (error) {
      console.error('[useRemoteManagement] Failed to initialize terminal:', error);
      
      if (isMountedRef.current) {
        // ✅ PRODUCTION: Provide clear, actionable error messages
        let errorMessage = error.message || 'Failed to initialize terminal';
        
        // Map technical errors to user-friendly messages
        if (errorMessage.includes('not connected') || errorMessage.includes('send')) {
          errorMessage = 'Connection lost. Please refresh the page and try again.';
        } else if (errorMessage.includes('authentication') || errorMessage.includes('auth')) {
          errorMessage = 'Authentication failed. Please authenticate and try again.';
        } else if (errorMessage.includes('timeout')) {
          errorMessage = 'Connection timeout. Please check your network and try again.';
        } else if (errorMessage.includes('Failed to create')) {
          errorMessage = 'Failed to create terminal session. Please try again.';
        }
        
        setError(errorMessage);
        setIsConnecting(false);
        setTerminalSession(null);
        setTerminalReady(false);
        isInitializedRef.current = false;
        sessionRef.current = null;
      }
      
      return null;
    }
  }, [nodeReference, isWebSocketReady, createSession, isConnecting, waitForWebSocketReady]);
  
  // Terminal state ref
  const terminalStateRef = useRef({
    session: null,
    ready: false
  });
  
  useEffect(() => {
    terminalStateRef.current = {
      session: terminalSession || sessionRef.current,
      ready: terminalReady
    };
  }, [terminalSession, terminalReady]);
  
  /**
   * Send input to terminal (interactive shell)
   * ✅ This is ONLY for Terminal tab!
   * Sends term_input message type
   */
  const sendTerminalInput = useCallback((data) => {
    const { session: currentSession, ready: currentReady } = terminalStateRef.current;
    
    if (!currentSession) {
      console.warn('[useRemoteManagement] Cannot send input - no session');
      return false;
    }
    
    console.log('[useRemoteManagement] Sending terminal input to session:', currentSession, 'Data length:', data?.length || 0);
    
    let base64Data;
    try {
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(data);
      base64Data = btoa(String.fromCharCode.apply(null, uint8Array));
    } catch (error) {
      console.error('[useRemoteManagement] Failed to encode input to Base64:', error);
      return false;
    }
    
    const success = webSocketService.send({
      type: 'term_input',
      session_id: currentSession,
      data: base64Data
    });
    
    if (!success) {
      console.error('[useRemoteManagement] Failed to send input via WebSocket');
    }
    
    return success;
  }, []);
  
  /**
   * Execute terminal command (convenience method for terminal)
   * ✅ This is ONLY for Terminal tab!
   */
  const executeTerminalCommand = useCallback((command) => {
    if (!command) return false;
    const commandWithNewline = command.endsWith('\n') ? command : `${command}\n`;
    return sendTerminalInput(commandWithNewline);
  }, [sendTerminalInput]);
  
  /**
   * Close terminal session
   */
  const closeTerminal = useCallback(() => {
    const currentSession = terminalSession || sessionRef.current;
    
    console.log('[useRemoteManagement] closeTerminal called, session:', currentSession);
    
    if (currentSession) {
      const session = terminalService.getSession(currentSession);
      
      if (session) {
        if (outputHandlerRef.current) session.off('output', outputHandlerRef.current);
        if (errorHandlerRef.current) session.off('error', errorHandlerRef.current);
        if (closedHandlerRef.current) session.off('closed', closedHandlerRef.current);
        if (readyHandlerRef.current) session.off('ready', readyHandlerRef.current);
      }
      
      closeSession(currentSession);
      
      console.log('[useRemoteManagement] Terminal session closed:', currentSession);
    }
    
    setTerminalSession(null);
    setTerminalReady(false);
    setError(null);
    sessionRef.current = null;
    isInitializedRef.current = false;
  }, [terminalSession, closeSession]);
  
  /**
   * ✅ PRODUCTION: Reconnect terminal with smart waiting and retry logic
   */
  const reconnectTerminal = useCallback(async () => {
    console.log('[useRemoteManagement] Reconnecting terminal with smart connection handling...');
    
    // Close existing session
    closeTerminal();
    
    // Brief delay before reconnecting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // ✅ PRODUCTION: Wait for WebSocket if not ready
    if (!isWebSocketReady) {
      console.log('[useRemoteManagement] WebSocket not ready, waiting before reconnect...');
      setError('Waiting for connection...');
      
      const isReady = await waitForWebSocketReady(30000);
      
      if (!isReady) {
        setError('Unable to connect to server. Please check your network connection.');
        return null;
      }
      
      setError(null);
    }
    
    // Refresh authentication state
    const authState = remoteAuthService.isAuthenticated(nodeReference);
    setIsRemoteAuthenticated(authState);
    
    if (!authState) {
      console.log('[useRemoteManagement] Not authenticated, cannot reconnect terminal');
      setError('Authentication required. Please authenticate to use terminal.');
      return null;
    }
    
    // Attempt to reinitialize
    return initializeTerminal();
  }, [closeTerminal, initializeTerminal, nodeReference, isWebSocketReady, waitForWebSocketReady]);
  
  // ==================== Remote Commands (File Manager & System Info) ====================
  
  /**
   * Generate unique request ID
   */
  const generateRequestId = useCallback(() => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);
  
  /**
   * ✅ FIXED: Send remote command with proper Promise handling
   * This is the CORE FIX - used by File Manager and System Info
   * Sends remote_command message type
   */
  const sendRemoteCommand = useCallback((commandType, commandData = {}, timeout = 30000) => {
    if (!isRemoteAuthenticated) {
      console.error('[useRemoteManagement] Not authenticated for remote commands');
      return Promise.reject(new Error('Not authenticated for remote management'));
    }
    
    const requestId = generateRequestId();
    
    console.log('[useRemoteManagement] Sending remote command:', commandType, 'RequestID:', requestId);
    
    return new Promise((resolve, reject) => {
      // Set timeout
      const timer = setTimeout(() => {
        commandHandlersRef.current.delete(requestId);
        reject(new Error('Command timeout'));
      }, timeout);
      
      // Store handler for response
      commandHandlersRef.current.set(requestId, {
        resolve: (result) => {
          clearTimeout(timer);
          commandHandlersRef.current.delete(requestId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          commandHandlersRef.current.delete(requestId);
          reject(error);
        }
      });
      
      // Send remote_command message
      const message = {
        type: 'remote_command',
        node_reference: nodeReference,
        request_id: requestId,
        command: {
          type: commandType,
          ...commandData
        }
      };
      
      console.log('[useRemoteManagement] Sending message:', JSON.stringify(message, null, 2));
      
      const success = webSocketService.send(message);
      
      if (!success) {
        clearTimeout(timer);
        commandHandlersRef.current.delete(requestId);
        reject(new Error('Failed to send command via WebSocket'));
      }
    });
  }, [nodeReference, isRemoteAuthenticated, generateRequestId]);
  
  /**
   * ✅ FIXED: List directory using remote_command
   */
  const listDirectory = useCallback(async (path) => {
    console.log('[useRemoteManagement] listDirectory:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.LIST_FILES, { path });
  }, [sendRemoteCommand]);
  
  /**
   * ✅ PRODUCTION: Read file with comprehensive validation and error handling
   * Backend expects "download" command with "path" parameter
   */
  const readFile = useCallback(async (path) => {
    console.log('[useRemoteManagement] readFile called with path:', path);
    
    // ✅ PRODUCTION: Comprehensive parameter validation
    if (!path) {
      const error = new Error('File path is required');
      console.error('[useRemoteManagement]', error.message);
      throw error;
    }
    
    if (typeof path !== 'string') {
      const error = new Error('File path must be a string');
      console.error('[useRemoteManagement]', error.message, '- received:', typeof path);
      throw error;
    }
    
    if (path.trim().length === 0) {
      const error = new Error('File path cannot be empty');
      console.error('[useRemoteManagement]', error.message);
      throw error;
    }
    
    console.log('[useRemoteManagement] Sending download command for path:', path);
    
    try {
      // Backend's handle_download expects { path: "..." }
      const result = await sendRemoteCommand(REMOTE_COMMAND_TYPES.READ_FILE, { path });
      
      console.log('[useRemoteManagement] Download result received');
      
      // ✅ PRODUCTION: Handle response properly
      if (!result) {
        throw new Error('No response received from server');
      }
      
      // Backend returns base64 encoded content
      if (result.content) {
        try {
          // Decode base64 content
          result.content = atob(result.content);
          console.log('[useRemoteManagement] Content decoded successfully, length:', result.content.length);
        } catch (decodeError) {
          console.error('[useRemoteManagement] Failed to decode Base64 content:', decodeError);
          throw new Error('Failed to decode file content. The file may be corrupted.');
        }
      } else {
        console.warn('[useRemoteManagement] No content in result, file may be empty');
        result.content = ''; // Ensure content is at least an empty string
      }
      
      return result;
    } catch (error) {
      console.error('[useRemoteManagement] readFile error:', error);
      
      // ✅ PRODUCTION: Provide user-friendly error messages
      if (error.message.includes('timeout')) {
        throw new Error('Request timeout. Please try again.');
      } else if (error.message.includes('not found')) {
        throw new Error('File not found.');
      } else if (error.message.includes('permission')) {
        throw new Error('Permission denied. You do not have access to this file.');
      } else if (error.message.includes('too large')) {
        throw new Error('File is too large to read.');
      }
      
      throw error;
    }
  }, [sendRemoteCommand]);
  
  /**
   * ✅ FIXED: Write file using remote_command
   * Backend expects "upload" command with "path" and "content" (base64) parameters
   */
  const writeFile = useCallback(async (path, content) => {
    console.log('[useRemoteManagement] writeFile:', path, content.length, 'bytes');
    
    // Encode content to Base64
    let base64Content;
    try {
      base64Content = btoa(unescape(encodeURIComponent(content)));
    } catch (encodeError) {
      console.error('[useRemoteManagement] Failed to encode content to Base64:', encodeError);
      throw new Error('Failed to encode file content');
    }
    
    // Backend's handle_upload expects { path: "...", content: "base64..." }
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.WRITE_FILE, { 
      path, 
      content: base64Content 
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✅ FIXED: Delete file using remote_command
   * Backend expects "delete" command with "path" parameter
   */
  const deleteFile = useCallback(async (path) => {
    console.log('[useRemoteManagement] deleteFile:', path);
    
    // Backend's handle_delete expects { path: "..." }
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.DELETE_FILE, { path });
  }, [sendRemoteCommand]);
  
  /**
   * ✅ FIXED: Get system info using remote_command
   */
  const getSystemInfo = useCallback(async () => {
    console.log('[useRemoteManagement] getSystemInfo');
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.SYSTEM_INFO);
  }, [sendRemoteCommand]);
  
  /**
   * ✅ FIXED: Execute command using remote_command
   */
  const executeCommand = useCallback(async (command, args = []) => {
    console.log('[useRemoteManagement] executeCommand:', command, args);
    
    const commandData = {
      command: args.length > 0 ? `${command} ${args.join(' ')}` : command
    };
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.EXECUTE, commandData);
  }, [sendRemoteCommand]);
  
  /**
   * ✅ PRESERVED: Upload file (alias for writeFile with better naming)
   * Backend expects "upload" command with "path" and "content" (base64) parameters
   */
  const uploadFile = useCallback(async (path, content, isBase64 = false) => {
    console.log('[useRemoteManagement] uploadFile:', path, 'isBase64:', isBase64);
    
    let base64Content = content;
    if (!isBase64) {
      try {
        base64Content = btoa(unescape(encodeURIComponent(content)));
      } catch (encodeError) {
        console.error('[useRemoteManagement] Failed to encode upload content:', encodeError);
        throw new Error('Failed to encode file for upload');
      }
    }
    
    // Backend's handle_upload expects { path: "...", content: "base64..." }
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.WRITE_FILE, { 
      path, 
      content: base64Content 
    });
  }, [sendRemoteCommand]);
  
  // ==================== WebSocket Message Handling ====================
  
  /**
   * ✅ CRITICAL FIX: Handle remote_command_response messages
   * This was the MISSING piece!
   */
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        
        // Handle remote command responses
        if (message.type === 'remote_command_response') {
          console.log('[useRemoteManagement] ===== REMOTE COMMAND RESPONSE =====');
          console.log('[useRemoteManagement] Request ID:', message.request_id);
          console.log('[useRemoteManagement] Success:', message.success);
          console.log('[useRemoteManagement] Has result:', !!message.result);
          console.log('[useRemoteManagement] Error:', message.error);
          console.log('[useRemoteManagement] =====================================');
          
          const handler = commandHandlersRef.current.get(message.request_id);
          if (handler) {
            if (message.success) {
              console.log('[useRemoteManagement] ✅ Resolving command with result');
              handler.resolve(message.result);
            } else {
              // Extract error message
              let errorMessage = 'Command failed';
              
              if (message.error) {
                if (typeof message.error === 'string') {
                  errorMessage = message.error;
                } else if (typeof message.error === 'object') {
                  errorMessage = message.error.message || 
                                message.error.error || 
                                message.error.detail || 
                                JSON.stringify(message.error);
                }
              }
              
              console.error('[useRemoteManagement] ❌ Command failed:', errorMessage);
              handler.reject(new Error(errorMessage));
            }
          } else {
            console.warn('[useRemoteManagement] ⚠️ No handler found for request:', message.request_id);
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    };
    
    const ws = window.globalWebSocket || webSocketService.ws;
    if (ws && ws.addEventListener) {
      console.log('[useRemoteManagement] 🎧 Adding message listener for remote_command_response');
      ws.addEventListener('message', handleMessage);
      
      return () => {
        console.log('[useRemoteManagement] 🔇 Removing message listener');
        ws.removeEventListener('message', handleMessage);
      };
    }
  }, []);
  
  /**
   * ✅ PRESERVED: Listen for WebSocket errors
   */
  useEffect(() => {
    const handleWebSocketError = (message) => {
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
    
    webSocketService.on('message', handleWebSocketError);
    
    return () => {
      webSocketService.off('message', handleWebSocketError);
    };
  }, [nodeReference, terminalSession, closeTerminal]);
  
  // ==================== Effects ====================
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  useEffect(() => {
    const currentSession = terminalSession || sessionRef.current;
    
    return () => {
      console.log('[useRemoteManagement] Hook unmounting');
      if (currentSession) {
        console.log('[useRemoteManagement] Hook unmounting with session');
      }
      
      // Clean up any pending command handlers
      commandHandlersRef.current.clear();
      
      isInitializedRef.current = false;
    };
  }, []);
  
  useEffect(() => {
    if (terminalSession && !isNodeOnline) {
      console.log('[useRemoteManagement] Node went offline, closing terminal');
      closeTerminal();
    }
  }, [isNodeOnline, terminalSession, closeTerminal]);
  
  useEffect(() => {
    if (terminalSession && !isWebSocketReady) {
      console.log('[useRemoteManagement] WebSocket disconnected, marking terminal not ready');
      setTerminalReady(false);
    }
  }, [isWebSocketReady, terminalSession]);
  
  useEffect(() => {
    if (terminalSession && !isRemoteAuthenticated) {
      console.log('[useRemoteManagement] JWT authentication lost, closing terminal');
      closeTerminal();
    }
  }, [isRemoteAuthenticated, terminalSession, closeTerminal]);
  
  // Debug logging
  useEffect(() => {
    console.log('[useRemoteManagement] State updated:', {
      terminalSession: terminalSession || sessionRef.current,
      terminalReady,
      isConnecting,
      isRemoteAuthenticated,
      isNodeOnline,
      hasError: !!error,
      pendingCommands: commandHandlersRef.current.size
    });
  }, [terminalSession, terminalReady, isConnecting, isRemoteAuthenticated, isNodeOnline, error]);
  
  // ==================== Return API ====================
  
  return {
    // Terminal State (for Terminal tab only)
    terminalSession: terminalSession || sessionRef.current,
    terminalReady,
    isConnecting,
    error,
    
    // Authentication & Connection Status
    isRemoteAuthenticated,
    isNodeOnline,
    isWebSocketReady,
    
    // ✅ Terminal Actions (ONLY for Terminal tab!)
    initializeTerminal,
    sendTerminalInput,
    executeTerminalCommand,
    closeTerminal,
    reconnectTerminal,
    
    // ✅ Remote Commands (for File Manager & System Info)
    listDirectory,
    readFile,
    writeFile,
    deleteFile,
    uploadFile,
    getSystemInfo,
    executeCommand,
    
    // Store state
    wsState,
    nodes: wsNodes || storeNodes,
    
    // JWT token info
    tokenExpiry: remoteAuthService.getFormattedExpiry(nodeReference),
    
    // ✅ NEW: Utility functions
    waitForWebSocketReady,
    refreshAuthState: () => {
      const newAuth = remoteAuthService.isAuthenticated(nodeReference);
      setIsRemoteAuthenticated(newAuth);
      return newAuth;
    },
    
    // ✅ NEW: WebSocket state helpers
    isWebSocketConnected: () => {
      const ws = window.globalWebSocket || webSocketService.ws;
      return ws && ws.readyState === WebSocket.OPEN;
    },
    isWebSocketConnecting: () => {
      const ws = window.globalWebSocket || webSocketService.ws;
      return ws && ws.readyState === WebSocket.CONNECTING;
    },
    
    // ✅ NEW: Debug helper
    debugState: () => {
      console.log('[useRemoteManagement] === DEBUG STATE ===');
      console.log('Terminal Session:', terminalSession || sessionRef.current);
      console.log('Terminal Ready:', terminalReady);
      console.log('Is Connecting:', isConnecting);
      console.log('Is Authenticated:', isRemoteAuthenticated);
      console.log('Is Node Online:', isNodeOnline);
      console.log('WebSocket Ready:', isWebSocketReady);
      console.log('Error:', error);
      console.log('Pending Commands:', commandHandlersRef.current.size);
      
      const ws = window.globalWebSocket || webSocketService.ws;
      console.log('WebSocket State:', ws?.readyState);
      console.log('WebSocket States:', {
        CONNECTING: WebSocket.CONNECTING,
        OPEN: WebSocket.OPEN,
        CLOSING: WebSocket.CLOSING,
        CLOSED: WebSocket.CLOSED
      });
      console.log('=========================');
    },
    
    // Debug info
    pendingCommandsCount: commandHandlersRef.current.size
  };
}

export default useRemoteManagement;
