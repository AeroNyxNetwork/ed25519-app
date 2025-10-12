/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Remote Management Hook - COMPLETELY FIXED VERSION
 * 
 * ✅ FIXED: Now properly separates terminal from remote commands
 * - Terminal: Uses term_input/term_output (interactive shell)
 * - Remote Commands: Uses remote_command/remote_command_response
 * 
 * Key Changes in v7.0.0:
 * - Added sendRemoteCommand() for File Manager and System Info
 * - Fixed listDirectory() to use remote_command instead of term_input
 * - Fixed readFile() to use remote_command instead of term_input  
 * - Fixed writeFile() to use remote_command instead of term_input
 * - Fixed deleteFile() to use remote_command instead of term_input
 * - Fixed getSystemInfo() to use remote_command instead of term_input
 * - Fixed executeCommand() to use remote_command instead of term_input
 * - Added proper response handling for remote_command_response
 * - Terminal functions (sendTerminalInput, executeTerminalCommand) unchanged
 * 
 * ⚠️ Critical Implementation Notes:
 * 1. Terminal Tab ONLY uses: sendTerminalInput(), executeTerminalCommand()
 * 2. File Manager ONLY uses: listDirectory(), readFile(), writeFile(), deleteFile()
 * 3. System Info ONLY uses: getSystemInfo(), executeCommand()
 * 4. These are COMPLETELY SEPARATE message flows!
 * 
 * Last Modified: v7.0.0 - Complete rewrite with proper command routing
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
  const commandHandlersRef = useRef(new Map()); // ✅ NEW: For remote command responses
  
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
  
  // ==================== Terminal Management (Interactive Shell) ====================
  
  /**
   * Initialize terminal session
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
      setError('No node reference provided');
      return null;
    }
    
    if (!isWebSocketReady) {
      console.log('[useRemoteManagement] WebSocket not ready');
      setError('WebSocket not authenticated yet, please wait...');
      return null;
    }
    
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
      type: 'term_input',  // ✅ CORRECT: term_input for terminal
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
  
  // ==================== Remote Commands (File Manager & System Info) ====================
  
  /**
   * Generate unique request ID
   * ✅ NEW: Required for remote_command/remote_command_response correlation
   */
  const generateRequestId = useCallback(() => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);
  
  /**
   * ✅ NEW: Send remote command (NOT terminal input!)
   * This is the CORE FIX - used by File Manager and System Info
   * Sends remote_command message type
   * 
   * @param {string} commandType - Type of command (list_directory, read_file, etc)
   * @param {object} commandData - Command-specific data
   * @param {number} timeout - Timeout in milliseconds (default 30 seconds)
   * @returns {Promise} Resolves with command result or rejects with error
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
        type: 'remote_command',  // ✅ CORRECT: remote_command (NOT term_input!)
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
   * Used by File Manager component
   */
  const listDirectory = useCallback(async (path) => {
    console.log('[useRemoteManagement] listDirectory:', path);
    return sendRemoteCommand('list_directory', { path });
  }, [sendRemoteCommand]);
  
  /**
   * ✅ FIXED: Read file using remote_command
   * Used by File Manager component
   */
  const readFile = useCallback(async (path) => {
    console.log('[useRemoteManagement] readFile:', path);
    const result = await sendRemoteCommand('read_file', { path });
    
    // Decode Base64 content if encoded
    if (result.content && result.encoding === 'base64') {
      try {
        result.content = atob(result.content);
      } catch (decodeError) {
        console.error('[useRemoteManagement] Failed to decode Base64 content:', decodeError);
        throw new Error('Failed to decode file content');
      }
    }
    
    return result;
  }, [sendRemoteCommand]);
  
  /**
   * ✅ FIXED: Write file using remote_command
   * Used by File Manager component
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
    
    return sendRemoteCommand('write_file', { 
      path, 
      content: base64Content 
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✅ FIXED: Delete file using remote_command
   * Used by File Manager component
   */
  const deleteFile = useCallback(async (path) => {
    console.log('[useRemoteManagement] deleteFile:', path);
    return sendRemoteCommand('delete_file', { path });
  }, [sendRemoteCommand]);
  
  /**
   * ✅ FIXED: Get system info using remote_command
   * Used by System Info component
   */
  const getSystemInfo = useCallback(async () => {
    console.log('[useRemoteManagement] getSystemInfo');
    return sendRemoteCommand('get_system_info');
  }, [sendRemoteCommand]);
  
  /**
   * ✅ FIXED: Execute command using remote_command (for System Info, NOT terminal!)
   * Used by System Info component for specific system queries
   */
  const executeCommand = useCallback(async (command, args = []) => {
    console.log('[useRemoteManagement] executeCommand:', command, args);
    
    // Build command string
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    
    return sendRemoteCommand('execute_command', { 
      command: fullCommand 
    });
  }, [sendRemoteCommand]);
  
  /**
   * Upload file (alias for writeFile with better naming)
   * Used by File Manager component
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
    
    return sendRemoteCommand('write_file', { 
      path, 
      content: base64Content 
    });
  }, [sendRemoteCommand]);
  
  // ==================== WebSocket Message Handling ====================
  
  /**
   * ✅ NEW: Handle remote command responses
   * Listens for remote_command_response messages from backend
   */
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        
        // Handle remote command responses
        if (message.type === 'remote_command_response') {
          console.log('[useRemoteManagement] Remote command response:', {
            request_id: message.request_id,
            success: message.success,
            hasResult: !!message.result,
            error: message.error
          });
          
          const handler = commandHandlersRef.current.get(message.request_id);
          if (handler) {
            if (message.success) {
              handler.resolve(message.result);
            } else {
              handler.reject(new Error(message.error || 'Command failed'));
            }
          } else {
            console.warn('[useRemoteManagement] No handler found for request:', message.request_id);
          }
        }
      } catch (error) {
        // Ignore parse errors for non-JSON messages
      }
    };
    
    const ws = window.globalWebSocket || webSocketService.ws;
    if (ws && ws.addEventListener) {
      ws.addEventListener('message', handleMessage);
      
      return () => {
        ws.removeEventListener('message', handleMessage);
      };
    }
  }, []);
  
  /**
   * Listen for WebSocket errors
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
        console.log('[useRemoteManagement] Hook unmounting with session, will be cleaned by RemoteManagement');
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
    sendTerminalInput,        // Sends term_input
    executeTerminalCommand,   // Sends term_input with newline
    closeTerminal,
    
    // ✅ Remote Commands (for File Manager & System Info)
    // All these now use remote_command instead of term_input!
    listDirectory,            // Uses remote_command
    readFile,                 // Uses remote_command  
    writeFile,                // Uses remote_command
    deleteFile,               // Uses remote_command
    uploadFile,               // Uses remote_command
    getSystemInfo,            // Uses remote_command
    executeCommand,           // Uses remote_command (NOT terminal!)
    
    // Store state
    wsState,
    nodes: wsNodes || storeNodes,
    
    // JWT token info
    tokenExpiry: remoteAuthService.getFormattedExpiry(nodeReference),
    
    // Utilities
    refreshAuthState: () => {
      const newAuth = remoteAuthService.isAuthenticated(nodeReference);
      setIsRemoteAuthenticated(newAuth);
      return newAuth;
    },
    
    // Debug info
    pendingCommandsCount: commandHandlersRef.current.size
  };
}

export default useRemoteManagement;
