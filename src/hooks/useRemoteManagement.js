/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Remote Management Hook - COMPLETE FIXED & OPTIMIZED VERSION v8.0.0
 * 
 * ✅ FIXED CRITICAL ISSUES:
 * 1. WebSocket message listener memory leak
 * 2. Race conditions in initialization
 * 3. Base64 encoding for Unicode and binary files
 * 4. Promise handler cleanup on unmount
 * 5. Proper error handling with user-friendly messages
 * 6. Dependency array corrections
 * 
 * ✅ OPTIMIZATIONS:
 * 1. Promise caching to prevent concurrent initialization
 * 2. Dynamic WebSocket reference to handle reconnections
 * 3. Improved timeout handling
 * 4. Better error messages
 * 5. Comprehensive cleanup logic
 * 
 * ✨ NEW in v8.1.0:
 * - Added 12 new remote commands (rename, copy, move, etc.)
 * - All new commands follow same pattern as existing ones
 * 
 * Main Functionality:
 * - Terminal session management (for Terminal tab - interactive shell)
 * - Remote command execution (for File Manager & System Info)
 * - WebSocket connection monitoring
 * - Authentication state management
 * 
 * Dependencies:
 * - useTerminalStore (terminal session store)
 * - terminalService (terminal operations)
 * - webSocketService (WebSocket communication)
 * - remoteAuthService (JWT authentication)
 * - useAeroNyxWebSocket (WebSocket state hook)
 * 
 * ⚠️ CRITICAL NOTES:
 * - Terminal sessions use 'term_input' message type
 * - Remote commands use 'remote_command' message type
 * - These are SEPARATE systems - do not mix them!
 * - Always cleanup handlers and timeouts on unmount
 * - WebSocket reference must be dynamic (window.globalWebSocket)
 * 
 * Last Modified: v8.1.0 - Added new commands, preserved all original logic
 * ============================================
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useTerminalStore from '../stores/terminalStore';
import terminalService from '../services/TerminalService';
import webSocketService from '../services/WebSocketService';
import remoteAuthService from '../services/RemoteAuthService';
import { useAeroNyxWebSocket } from './useAeroNyxWebSocket';

// ==================== CONSTANTS ====================

/**
 * Remote Command Types
 * ✅ CRITICAL: These MUST match the backend Rust code!
 * Backend: remote_command_handler.rs line 212-221
 */
const REMOTE_COMMAND_TYPES = {
  LIST_FILES: 'list',
  READ_FILE: 'download',
  WRITE_FILE: 'upload',
  DELETE_FILE: 'delete',
  RENAME_FILE: 'rename',         // ✨ NEW
  COPY_FILE: 'copy',             // ✨ NEW
  MOVE_FILE: 'move',             // ✨ NEW
  CREATE_DIRECTORY: 'create_directory',  // ✨ NEW
  DELETE_DIRECTORY: 'delete_directory',  // ✨ NEW
  SEARCH_FILES: 'search',        // ✨ NEW
  COMPRESS_FILES: 'compress',    // ✨ NEW
  EXTRACT_FILE: 'extract',       // ✨ NEW
  CHMOD: 'chmod',                // ✨ NEW
  CHOWN: 'chown',                // ✨ NEW
  BATCH_DELETE: 'batch_delete',  // ✨ NEW
  BATCH_MOVE: 'batch_move',      // ✨ NEW
  BATCH_COPY: 'batch_copy',      // ✨ NEW
  SYSTEM_INFO: 'system_info',
  EXECUTE: 'execute'
};

const WS_MESSAGE_TYPES = {
  TERM_INPUT: 'term_input',
  REMOTE_COMMAND: 'remote_command',
  REMOTE_COMMAND_RESPONSE: 'remote_command_response',
  ERROR: 'error'
};

const TIMEOUTS = {
  WS_CONNECTION: 30000,
  WS_AUTH: 10000,
  WS_CHECK_INTERVAL: 500,
  TERMINAL_READY: 2000,
  COMMAND_DEFAULT: 90000, // 90 seconds
  RECONNECT_DELAY: 500
};

const TERMINAL_CONFIG = {
  DEFAULT_ROWS: 24,
  DEFAULT_COLS: 80
};

// ==================== ENCODING UTILITIES ====================

/**
 * ✅ FIXED: Proper Unicode encoding using TextEncoder
 * Replaces deprecated unescape() function
 */
const encodeToBase64 = (text) => {
  try {
    const encoder = new TextEncoder();
    const uint8Array = encoder.encode(text);
    const binaryString = Array.from(uint8Array, byte => 
      String.fromCharCode(byte)
    ).join('');
    return btoa(binaryString);
  } catch (error) {
    console.error('[encoding] Failed to encode to Base64:', error);
    throw new Error(`Failed to encode text to Base64: ${error.message}`);
  }
};

/**
 * ✅ FIXED: Proper Unicode decoding with binary fallback
 * Handles both text and binary files correctly
 */
const decodeFromBase64 = (base64, allowBinary = false) => {
  try {
    const binaryString = atob(base64);
    const uint8Array = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      uint8Array[i] = binaryString.charCodeAt(i);
    }
    
    // Try UTF-8 decode
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return decoder.decode(uint8Array);
    } catch (utf8Error) {
      // Not valid UTF-8
      if (allowBinary) {
        console.warn('[encoding] Content is not valid UTF-8, returning binary');
        return binaryString;
      } else {
        throw new Error('Content is not valid UTF-8 text');
      }
    }
  } catch (error) {
    console.error('[encoding] Failed to decode from Base64:', error);
    throw new Error(`Failed to decode Base64: ${error.message}`);
  }
};

// ==================== MAIN HOOK ====================

/**
 * Remote Management Hook
 * Provides both terminal session management AND remote command execution
 * 
 * @param {string} nodeReference - Node reference or code
 * @returns {Object} Remote management API
 */
export function useRemoteManagement(nodeReference) {
  // ==================== State ====================
  const [terminalSession, setTerminalSession] = useState(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [isRemoteAuthenticated, setIsRemoteAuthenticated] = useState(false);
  
  // ==================== Refs ====================
  const sessionRef = useRef(null);
  const isInitializedRef = useRef(false);
  const isMountedRef = useRef(true);
  const initPromiseRef = useRef(null); // ✅ FIX: Prevent race conditions
  const eventHandlersRef = useRef({});
  const commandHandlersRef = useRef(new Map()); // For remote command responses
  const wsMessageListenerRef = useRef(null); // ✅ FIX: Track listener reference
  
  // ==================== Store & WebSocket ====================
  const { 
    wsState, 
    nodes: storeNodes,
    createSession,
    closeSession
  } = useTerminalStore();
  
  const { 
    wsState: wsConnectionState,
    nodes: wsNodes
  } = useAeroNyxWebSocket({
    autoConnect: true,
    autoMonitor: true
  });
  
  // ==================== Helper Functions ====================
  
  /**
   * ✅ FIX: Get WebSocket with dynamic reference
   * Prevents stale closure issues
   */
  const getWebSocket = useCallback(() => {
    return window.globalWebSocket || webSocketService.ws;
  }, []);
  
  /**
   * Determine if WebSocket is ready
   */
  const isWebSocketReady = wsState?.authenticated || wsConnectionState?.authenticated;
  
  /**
   * Get node and check online status
   */
  const getNodeInfo = useCallback(() => {
    let node = null;
    
    // Try to find node in wsNodes
    if (Array.isArray(wsNodes)) {
      node = wsNodes.find(n => n.code === nodeReference || n.reference === nodeReference);
    } else if (wsNodes && typeof wsNodes === 'object') {
      node = wsNodes[nodeReference];
    }
    
    // Fallback to storeNodes
    if (!node && Array.isArray(storeNodes)) {
      node = storeNodes.find(n => n.code === nodeReference || n.reference === nodeReference);
    } else if (!node && storeNodes && typeof storeNodes === 'object') {
      node = storeNodes[nodeReference];
    }
    
    // Check if node is online
    const isNodeOnline = node ? (
      node.status === 'online' || 
      node.status === 'active' ||
      node.status === 'running' ||
      node.originalStatus === 'active' ||
      node.normalizedStatus === 'online' ||
      node.isOnline === true
    ) : false;
    
    return { node, isNodeOnline };
  }, [wsNodes, storeNodes, nodeReference]);
  
  const { node, isNodeOnline } = getNodeInfo();
  
  /**
   * Generate unique request ID
   */
  const generateRequestId = useCallback(() => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);
  
  // ==================== Authentication Management ====================
  
  useEffect(() => {
    const initialAuth = remoteAuthService.isAuthenticated(nodeReference);
    setIsRemoteAuthenticated(initialAuth);
    console.log('[useRemoteManagement] Initial auth state:', nodeReference, initialAuth);
    
    const handleAuthenticated = () => {
      console.log('[useRemoteManagement] Node authenticated:', nodeReference);
      if (isMountedRef.current) {
        setIsRemoteAuthenticated(true);
        setError(null);
      }
    };
    
    const handleError = (error) => {
      console.log('[useRemoteManagement] Auth error:', nodeReference, error);
      if (isMountedRef.current) {
        setIsRemoteAuthenticated(false);
        setError(error.message || 'Authentication failed');
      }
    };
    
    const handleExpired = () => {
      console.log('[useRemoteManagement] Token expired:', nodeReference);
      if (isMountedRef.current) {
        setIsRemoteAuthenticated(false);
        setError('Authentication token expired');
      }
    };
    
    remoteAuthService.on(nodeReference, 'authenticated', handleAuthenticated);
    remoteAuthService.on(nodeReference, 'error', handleError);
    remoteAuthService.on(nodeReference, 'expired', handleExpired);
    
    return () => {
      remoteAuthService.off(nodeReference, 'authenticated', handleAuthenticated);
      remoteAuthService.off(nodeReference, 'error', handleError);
      remoteAuthService.off(nodeReference, 'expired', handleExpired);
    };
  }, [nodeReference]);
  
  // ==================== WebSocket Connection Helpers ====================
  
  /**
   * ✅ OPTIMIZED: Smart wait for WebSocket connection
   */
  const waitForWebSocketReady = useCallback(async (maxWaitTime = TIMEOUTS.WS_CONNECTION) => {
    console.log('[useRemoteManagement] 🔄 Waiting for WebSocket to be ready...');
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const ws = getWebSocket();
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        const isAuthenticated = wsState?.authenticated || wsConnectionState?.authenticated;
        
        if (isAuthenticated) {
          console.log('[useRemoteManagement] ✅ WebSocket ready and authenticated');
          return true;
        } else {
          console.log('[useRemoteManagement] ⏳ WebSocket connected, waiting for auth...');
        }
      } else if (ws && ws.readyState === WebSocket.CONNECTING) {
        console.log('[useRemoteManagement] ⏳ WebSocket connecting...');
      } else {
        console.log('[useRemoteManagement] ⏳ Waiting for WebSocket...');
      }
      
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.WS_CHECK_INTERVAL));
    }
    
    console.log('[useRemoteManagement] ❌ WebSocket timeout after', maxWaitTime / 1000, 's');
    return false;
  }, [wsState, wsConnectionState, getWebSocket]);
  
  // ==================== Terminal Management ====================
  
  /**
   * ✅ FIXED: Initialize terminal with race condition prevention
   */
  const initializeTerminal = useCallback(async () => {
    // ✅ FIX: Return existing Promise if initialization in progress
    if (initPromiseRef.current) {
      console.log('[useRemoteManagement] Init already in progress, waiting...');
      return initPromiseRef.current;
    }
    
    if (isInitializedRef.current && sessionRef.current) {
      console.log('[useRemoteManagement] Already initialized:', sessionRef.current);
      return { sessionId: sessionRef.current };
    }
    
    if (!nodeReference) {
      const errorMsg = 'No node reference provided';
      setError(errorMsg);
      return null;
    }
    
    // ✅ FIX: Cache initialization Promise
    initPromiseRef.current = (async () => {
      try {
        setIsConnecting(true);
        setError(null);
        
        // Wait for WebSocket
        if (!isWebSocketReady) {
          console.log('[useRemoteManagement] Waiting for WebSocket...');
          setError('Connecting to server, please wait...');
          
          const isReady = await waitForWebSocketReady(TIMEOUTS.WS_CONNECTION);
          if (!isReady) {
            throw new Error('Connection timeout. Please check your network and try again.');
          }
          
          setError(null);
        }
        
        // Wait for authentication
        const currentAuthState = remoteAuthService.isAuthenticated(nodeReference);
        if (!currentAuthState) {
          console.log('[useRemoteManagement] Waiting for authentication...');
          setError('Authenticating remote access, please wait...');
          
          let authWaitTime = 0;
          const maxAuthWait = TIMEOUTS.WS_AUTH;
          
          while (authWaitTime < maxAuthWait && !remoteAuthService.isAuthenticated(nodeReference)) {
            await new Promise(resolve => setTimeout(resolve, TIMEOUTS.WS_CHECK_INTERVAL));
            authWaitTime += TIMEOUTS.WS_CHECK_INTERVAL;
          }
          
          if (!remoteAuthService.isAuthenticated(nodeReference)) {
            throw new Error('Remote authentication required. Please authenticate to use terminal.');
          }
          
          setError(null);
        }
        
        isInitializedRef.current = true;
        
        console.log('[useRemoteManagement] Creating terminal session:', nodeReference);
        
        let newSessionId = await createSession(nodeReference, {
          rows: TERMINAL_CONFIG.DEFAULT_ROWS,
          cols: TERMINAL_CONFIG.DEFAULT_COLS
        });
        
        if (!newSessionId) {
          throw new Error('Failed to create terminal session');
        }
        
        console.log('[useRemoteManagement] Terminal session created:', newSessionId);
        
        sessionRef.current = newSessionId;
        
        if (isMountedRef.current) {
          setTerminalSession(newSessionId);
        }
        
        let session = terminalService.getSession(newSessionId);
        
        if (!session) {
          console.warn('[useRemoteManagement] Session not found after creation, retrying...');
          try {
            const manualSession = await terminalService.createSession(nodeReference, {
              rows: TERMINAL_CONFIG.DEFAULT_ROWS,
              cols: TERMINAL_CONFIG.DEFAULT_COLS,
              sessionId: newSessionId
            });
            
            if (manualSession?.sessionId) {
              session = terminalService.getSession(manualSession.sessionId);
              if (manualSession.sessionId !== newSessionId) {
                newSessionId = manualSession.sessionId;
                sessionRef.current = newSessionId;
                if (isMountedRef.current) {
                  setTerminalSession(newSessionId);
                }
              }
            }
          } catch (manualError) {
            console.warn('[useRemoteManagement] Manual session creation failed:', manualError);
          }
        }
        
        if (session) {
          console.log('[useRemoteManagement] Session verified:', session.getInfo());
          
          const handlers = {
            output: (data) => {
              console.log('[useRemoteManagement] Terminal output:', data?.length || 0, 'bytes');
            },
            error: (err) => {
              console.error('[useRemoteManagement] Terminal error:', err);
              if (isMountedRef.current) {
                setError(err?.message || err);
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
              }
            }
          };
          
          eventHandlersRef.current = handlers;
          
          Object.entries(handlers).forEach(([event, handler]) => {
            session.on(event, handler);
          });
          
          await new Promise((resolve) => {
            const readyTimeout = setTimeout(() => {
              if (isMountedRef.current && newSessionId) {
                setTerminalReady(true);
                console.log('[useRemoteManagement] Terminal ready (timeout)');
              }
              resolve();
            }, TIMEOUTS.TERMINAL_READY);
            
            session.once('ready', () => {
              clearTimeout(readyTimeout);
              if (isMountedRef.current) {
                setTerminalReady(true);
                console.log('[useRemoteManagement] Terminal ready (event)');
              }
              resolve();
            });
          });
        } else {
          console.log('[useRemoteManagement] Working in WebSocket mode');
          
          setTimeout(() => {
            if (isMountedRef.current && newSessionId) {
              setTerminalReady(true);
            }
          }, 500);
        }
        
        if (isMountedRef.current) {
          setIsConnecting(false);
        }
        
        return { sessionId: newSessionId };
        
      } catch (error) {
        console.error('[useRemoteManagement] Failed to initialize terminal:', error);
        
        if (isMountedRef.current) {
          let errorMessage = error.message || 'Failed to initialize terminal';
          
          // Map technical errors to user-friendly messages
          if (errorMessage.includes('not connected') || errorMessage.includes('send')) {
            errorMessage = 'Connection lost. Please refresh the page and try again.';
          } else if (errorMessage.includes('authentication') || errorMessage.includes('auth')) {
            errorMessage = 'Authentication failed. Please authenticate and try again.';
          } else if (errorMessage.includes('timeout')) {
            errorMessage = 'Connection timeout. Please check your network and try again.';
          }
          
          setError(errorMessage);
          setIsConnecting(false);
          setTerminalSession(null);
          setTerminalReady(false);
          isInitializedRef.current = false;
          sessionRef.current = null;
        }
        
        return null;
      } finally {
        // ✅ FIX: Clear Promise cache after completion
        initPromiseRef.current = null;
      }
    })();
    
    return initPromiseRef.current;
  }, [nodeReference, isWebSocketReady, createSession, waitForWebSocketReady]);
  
  /**
   * Terminal state ref for stable access
   */
  const terminalStateRef = useRef({ session: null, ready: false });
  
  useEffect(() => {
    terminalStateRef.current = {
      session: terminalSession || sessionRef.current,
      ready: terminalReady
    };
  }, [terminalSession, terminalReady]);
  
  /**
   * Send terminal input (for Terminal tab only)
   */
  const sendTerminalInput = useCallback((data) => {
    const { session: currentSession } = terminalStateRef.current;
    
    if (!currentSession) {
      console.warn('[useRemoteManagement] Cannot send input - no session');
      return false;
    }
    
    console.log('[useRemoteManagement] Sending terminal input:', currentSession);
    
    let base64Data;
    try {
      base64Data = encodeToBase64(data);
    } catch (error) {
      console.error('[useRemoteManagement] Failed to encode input:', error);
      return false;
    }
    
    const success = webSocketService.send({
      type: WS_MESSAGE_TYPES.TERM_INPUT,
      session_id: currentSession,
      data: base64Data
    });
    
    if (!success) {
      console.error('[useRemoteManagement] Failed to send input via WebSocket');
    }
    
    return success;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // terminalStateRef is a ref, doesn't need dependency
  
  /**
   * Execute terminal command (convenience method)
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
    
    console.log('[useRemoteManagement] Closing terminal:', currentSession);
    
    if (currentSession) {
      const session = terminalService.getSession(currentSession);
      
      if (session && eventHandlersRef.current) {
        Object.entries(eventHandlersRef.current).forEach(([event, handler]) => {
          session.off(event, handler);
        });
      }
      
      closeSession(currentSession);
    }
    
    setTerminalSession(null);
    setTerminalReady(false);
    setError(null);
    sessionRef.current = null;
    isInitializedRef.current = false;
    eventHandlersRef.current = {};
  }, [terminalSession, closeSession]);
  
  /**
   * Reconnect terminal
   */
  const reconnectTerminal = useCallback(async () => {
    console.log('[useRemoteManagement] Reconnecting terminal...');
    
    closeTerminal();
    
    await new Promise(resolve => setTimeout(resolve, TIMEOUTS.RECONNECT_DELAY));
    
    if (!isWebSocketReady) {
      setError('Waiting for connection...');
      
      const isReady = await waitForWebSocketReady(TIMEOUTS.WS_CONNECTION);
      
      if (!isReady) {
        setError('Unable to connect to server. Please check your network connection.');
        return null;
      }
      
      setError(null);
    }
    
    const authState = remoteAuthService.isAuthenticated(nodeReference);
    setIsRemoteAuthenticated(authState);
    
    if (!authState) {
      setError('Authentication required. Please authenticate to use terminal.');
      return null;
    }
    
    return initializeTerminal();
  }, [closeTerminal, initializeTerminal, nodeReference, isWebSocketReady, waitForWebSocketReady]);
  
  // ==================== Remote Commands ====================
  
  /**
   * ✅ FIXED: Send remote command with proper Promise handling
   */
  const sendRemoteCommand = useCallback((commandType, commandData = {}, timeout = TIMEOUTS.COMMAND_DEFAULT) => {
    if (!isRemoteAuthenticated) {
      console.error('[useRemoteManagement] Not authenticated for remote commands');
      return Promise.reject(new Error('Not authenticated for remote management'));
    }
    
    const requestId = generateRequestId();
    
    console.log('[useRemoteManagement] Sending remote command:', commandType, 'ID:', requestId);
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        commandHandlersRef.current.delete(requestId);
        reject(new Error('Command timeout'));
      }, timeout);
      
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
      
      const message = {
        type: WS_MESSAGE_TYPES.REMOTE_COMMAND,
        node_reference: nodeReference,
        request_id: requestId,
        command: {
          type: commandType,
          ...commandData
        }
      };
      
      const success = webSocketService.send(message);
      
      if (!success) {
        clearTimeout(timer);
        commandHandlersRef.current.delete(requestId);
        reject(new Error('Failed to send command via WebSocket'));
      }
    });
  }, [nodeReference, isRemoteAuthenticated, generateRequestId]);
  
  /**
   * List directory
   */
  const listDirectory = useCallback(async (path) => {
    console.log('[useRemoteManagement] listDirectory:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.LIST_FILES, { path });
  }, [sendRemoteCommand]);
  
  /**
   * ✅ FIXED: Read file with proper validation and error handling
   */
  const readFile = useCallback(async (path) => {
    console.log('[useRemoteManagement] readFile:', path);
    
    if (!path || typeof path !== 'string' || path.trim().length === 0) {
      throw new Error('Valid file path is required');
    }
    
    try {
      const result = await sendRemoteCommand(REMOTE_COMMAND_TYPES.READ_FILE, { path });
      
      if (!result) {
        throw new Error('No response received from server');
      }
      
      if (result.content) {
        try {
          result.content = decodeFromBase64(result.content, true);
          console.log('[useRemoteManagement] Content decoded, length:', result.content.length);
        } catch (decodeError) {
          console.error('[useRemoteManagement] Failed to decode content:', decodeError);
          throw new Error('Failed to decode file content. The file may be corrupted.');
        }
      } else {
        console.warn('[useRemoteManagement] No content in result');
        result.content = '';
      }
      
      return result;
    } catch (error) {
      console.error('[useRemoteManagement] readFile error:', error);
      
      // User-friendly error messages
      if (error.message.includes('timeout')) {
        throw new Error('Request timeout. Please try again.');
      } else if (error.message.includes('not found')) {
        throw new Error('File not found.');
      } else if (error.message.includes('permission')) {
        throw new Error('Permission denied. You do not have access to this file.');
      }
      
      throw error;
    }
  }, [sendRemoteCommand]);
  
  /**
   * ✅ FIXED: Write file with proper encoding
   */
  const writeFile = useCallback(async (path, content) => {
    console.log('[useRemoteManagement] writeFile:', path, content.length, 'bytes');
    
    let base64Content;
    try {
      base64Content = encodeToBase64(content);
    } catch (encodeError) {
      console.error('[useRemoteManagement] Failed to encode content:', encodeError);
      throw new Error('Failed to encode file content');
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.WRITE_FILE, { 
      path, 
      content: base64Content 
    });
  }, [sendRemoteCommand]);
  
  /**
   * Delete file
   */
  const deleteFile = useCallback(async (path) => {
    console.log('[useRemoteManagement] deleteFile:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.DELETE_FILE, { path });
  }, [sendRemoteCommand]);
  
  /**
   * Get system info
   */
  const getSystemInfo = useCallback(async () => {
    console.log('[useRemoteManagement] getSystemInfo');
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.SYSTEM_INFO);
  }, [sendRemoteCommand]);
  
  /**
   * Execute command
   */
  const executeCommand = useCallback(async (command, args = []) => {
    console.log('[useRemoteManagement] executeCommand:', command, args);
    
    const commandData = {
      command: args.length > 0 ? `${command} ${args.join(' ')}` : command
    };
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.EXECUTE, commandData);
  }, [sendRemoteCommand]);
  
  /**
   * Upload file (alias for writeFile)
   */
  const uploadFile = useCallback(async (path, content, isBase64 = false) => {
    console.log('[useRemoteManagement] uploadFile:', path, 'isBase64:', isBase64);
    
    let base64Content = content;
    if (!isBase64) {
      try {
        base64Content = encodeToBase64(content);
      } catch (encodeError) {
        console.error('[useRemoteManagement] Failed to encode upload content:', encodeError);
        throw new Error('Failed to encode file for upload');
      }
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.WRITE_FILE, { 
      path, 
      content: base64Content 
    });
  }, [sendRemoteCommand]);
  
  // ==================== NEW REMOTE COMMANDS (✨ ADDED in v8.1.0) ====================
  
  /**
   * ✨ NEW: Rename file or directory
   */
  const renameFile = useCallback(async (oldPath, newPath, options = {}) => {
    console.log('[useRemoteManagement] renameFile:', oldPath, '->', newPath);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.RENAME_FILE, {
      path: oldPath,
      destination: newPath,
      overwrite: options.overwrite || false
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Copy file or directory
   */
  const copyFile = useCallback(async (sourcePath, destPath, options = {}) => {
    console.log('[useRemoteManagement] copyFile:', sourcePath, '->', destPath);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.COPY_FILE, {
      path: sourcePath,
      destination: destPath,
      recursive: options.recursive || false,
      overwrite: options.overwrite || false
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Move file or directory
   */
  const moveFile = useCallback(async (sourcePath, destPath, options = {}) => {
    console.log('[useRemoteManagement] moveFile:', sourcePath, '->', destPath);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.MOVE_FILE, {
      path: sourcePath,
      destination: destPath,
      overwrite: options.overwrite || false
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Create directory
   */
  const createDirectory = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] createDirectory:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.CREATE_DIRECTORY, {
      path,
      mode: options.mode || '0755'
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Delete directory
   */
  const deleteDirectory = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] deleteDirectory:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.DELETE_DIRECTORY, {
      path,
      recursive: options.recursive || false
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Search files
   */
  const searchFiles = useCallback(async (path, query, options = {}) => {
    console.log('[useRemoteManagement] searchFiles:', path, query);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.SEARCH_FILES, {
      path,
      query,
      use_regex: options.useRegex || false,
      case_sensitive: options.caseSensitive || false,
      max_depth: options.maxDepth || null
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Compress files
   */
  const compressFiles = useCallback(async (paths, destination, options = {}) => {
    console.log('[useRemoteManagement] compressFiles:', paths, '->', destination);
    
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new Error('Paths must be a non-empty array');
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.COMPRESS_FILES, {
      paths,
      destination,
      format: options.format || 'zip',
      overwrite: options.overwrite || false
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Extract archive
   */
  const extractFile = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] extractFile:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.EXTRACT_FILE, {
      path,
      destination: options.destination || null,
      format: options.format || null
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Change file permissions
   */
  const changePermissions = useCallback(async (path, mode, options = {}) => {
    console.log('[useRemoteManagement] changePermissions:', path, mode);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.CHMOD, {
      path,
      mode,
      recursive: options.recursive || false
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Change file owner
   */
  const changeOwner = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] changeOwner:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.CHOWN, {
      path,
      owner: options.owner || null,
      group: options.group || null,
      recursive: options.recursive || false
    });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Batch delete files
   */
  const batchDelete = useCallback(async (paths) => {
    console.log('[useRemoteManagement] batchDelete:', paths.length, 'files');
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.BATCH_DELETE, { paths });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Batch move files
   */
  const batchMove = useCallback(async (paths, destination) => {
    console.log('[useRemoteManagement] batchMove:', paths.length, 'files ->', destination);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.BATCH_MOVE, { paths, destination });
  }, [sendRemoteCommand]);
  
  /**
   * ✨ NEW: Batch copy files
   */
  const batchCopy = useCallback(async (paths, destination) => {
    console.log('[useRemoteManagement] batchCopy:', paths.length, 'files ->', destination);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.BATCH_COPY, { paths, destination });
  }, [sendRemoteCommand]);
  
  // ==================== WebSocket Message Handling ====================
  
  /**
   * ✅ CRITICAL FIX: Handle remote_command_response with proper cleanup
   */
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        
        if (message.type === WS_MESSAGE_TYPES.REMOTE_COMMAND_RESPONSE) {
          console.log('[useRemoteManagement] Remote command response:', message.request_id);
          
          const handler = commandHandlersRef.current.get(message.request_id);
          if (handler) {
            if (message.success) {
              console.log('[useRemoteManagement] ✅ Command succeeded');
              handler.resolve(message.result || {});
            } else {
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
            console.warn('[useRemoteManagement] ⚠️ No handler for request:', message.request_id);
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    };
    
    // ✅ FIX: Use dynamic WebSocket reference and track listener
    const ws = getWebSocket();
    if (ws?.addEventListener) {
      console.log('[useRemoteManagement] 🎧 Adding message listener');
      ws.addEventListener('message', handleMessage);
      wsMessageListenerRef.current = handleMessage;
      
      return () => {
        // ✅ FIX: Get current WebSocket for cleanup
        const currentWs = getWebSocket();
        if (currentWs?.removeEventListener && wsMessageListenerRef.current) {
          console.log('[useRemoteManagement] 🔇 Removing message listener');
          currentWs.removeEventListener('message', wsMessageListenerRef.current);
          wsMessageListenerRef.current = null;
        }
      };
    }
  }, [getWebSocket]); // ✅ FIX: Added dependency
  
  /**
   * Handle WebSocket errors
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
        } else if (['INVALID_JWT', 'REMOTE_AUTH_FAILED', 'AUTH_FAILED'].includes(message.code)) {
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
  
  // ==================== Lifecycle Management ====================
  
  /**
   * Mount/unmount tracking
   */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  /**
   * ✅ FIX: Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      console.log('[useRemoteManagement] Hook unmounting');
      
      // ✅ FIX: Clean up pending command handlers
      commandHandlersRef.current.forEach(handler => {
        handler.reject(new Error('Component unmounted'));
      });
      commandHandlersRef.current.clear();
      
      isInitializedRef.current = false;
      initPromiseRef.current = null;
    };
  }, []);
  
  /**
   * Close terminal when node goes offline
   */
  useEffect(() => {
    if (terminalSession && !isNodeOnline) {
      console.log('[useRemoteManagement] Node offline, closing terminal');
      closeTerminal();
    }
  }, [isNodeOnline, terminalSession, closeTerminal]);
  
  /**
   * Mark terminal not ready when WebSocket disconnects
   */
  useEffect(() => {
    if (terminalSession && !isWebSocketReady) {
      console.log('[useRemoteManagement] WebSocket disconnected');
      setTerminalReady(false);
    }
  }, [isWebSocketReady, terminalSession]);
  
  /**
   * Close terminal when authentication is lost
   */
  useEffect(() => {
    if (terminalSession && !isRemoteAuthenticated) {
      console.log('[useRemoteManagement] Auth lost, closing terminal');
      closeTerminal();
    }
  }, [isRemoteAuthenticated, terminalSession, closeTerminal]);
  
  /**
   * Debug logging
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[useRemoteManagement] State:', {
        terminalSession: terminalSession || sessionRef.current,
        terminalReady,
        isConnecting,
        isRemoteAuthenticated,
        isNodeOnline,
        hasError: !!error,
        pendingCommands: commandHandlersRef.current.size
      });
    }
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
    
    // Terminal Actions (ONLY for Terminal tab!)
    initializeTerminal,
    sendTerminalInput,
    executeTerminalCommand,
    closeTerminal,
    reconnectTerminal,
    
    // File Operations (Original)
    listDirectory,
    readFile,
    writeFile,
    deleteFile,
    uploadFile,
    
    // ✨ NEW: File Operations
    renameFile,
    copyFile,
    moveFile,
    
    // ✨ NEW: Directory Operations
    createDirectory,
    deleteDirectory,
    
    // ✨ NEW: Search
    searchFiles,
    
    // ✨ NEW: Compression
    compressFiles,
    extractFile,
    
    // ✨ NEW: Permissions
    changePermissions,
    changeOwner,
    
    // ✨ NEW: Batch Operations
    batchDelete,
    batchMove,
    batchCopy,
    
    // System & Execution (Original)
    getSystemInfo,
    executeCommand,
    
    // Store state
    wsState,
    nodes: wsNodes || storeNodes,
    
    // JWT token info
    tokenExpiry: remoteAuthService.getFormattedExpiry(nodeReference),
    
    // Utility functions
    waitForWebSocketReady,
    refreshAuthState: () => {
      const newAuth = remoteAuthService.isAuthenticated(nodeReference);
      setIsRemoteAuthenticated(newAuth);
      return newAuth;
    },
    
    // WebSocket state helpers
    isWebSocketConnected: () => {
      const ws = getWebSocket();
      return ws && ws.readyState === WebSocket.OPEN;
    },
    isWebSocketConnecting: () => {
      const ws = getWebSocket();
      return ws && ws.readyState === WebSocket.CONNECTING;
    },
    
    // Debug helper
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
      
      const ws = getWebSocket();
      console.log('WebSocket State:', ws?.readyState);
      console.log('=========================');
    },
    
    // Debug info
    pendingCommandsCount: commandHandlersRef.current.size
  };
}

export default useRemoteManagement;
