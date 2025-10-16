/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Remote Management Hook - FINAL WORKING VERSION v9.2.0
 * 
 * 🔧 CRITICAL FIXES:
 * 1. Listen for both remote_command_sent AND remote_command_response
 * 2. Increase timeout to 60 seconds (backend may take time)
 * 3. Better logging for debugging
 * 
 * ✅ PRESERVED:
 * - All original authentication logic
 * - All original terminal logic
 * - All original WebSocket handling
 * 
 * Last Modified: v9.2.0 - Fixed response handling
 * ============================================
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useTerminalStore from '../stores/terminalStore';
import terminalService from '../services/TerminalService';
import webSocketService from '../services/WebSocketService';
import remoteAuthService from '../services/RemoteAuthService';
import { useAeroNyxWebSocket } from './useAeroNyxWebSocket';

// Import constants and error handling
import { 
  REMOTE_COMMAND_TYPES,
  getCommandTimeout,
  validatePath,
  validateFileSize,
  validateBatchOperation
} from '../lib/constants/remoteCommands';

import { 
  RemoteCommandError,
  logError
} from '../lib/utils/remoteCommandErrors';

// ==================== CONSTANTS ====================

const WS_MESSAGE_TYPES = {
  TERM_INPUT: 'term_input',
  REMOTE_COMMAND: 'remote_command',
  REMOTE_COMMAND_SENT: 'remote_command_sent',        // Backend confirmation
  REMOTE_COMMAND_RESPONSE: 'remote_command_response', // Backend response
  ERROR: 'error'
};

const TIMEOUTS = {
  WS_CONNECTION: 30000,
  WS_AUTH: 10000,
  WS_CHECK_INTERVAL: 500,
  TERMINAL_READY: 2000,
  COMMAND_DEFAULT: 60000, // 🔧 Increased to 60 seconds
  RECONNECT_DELAY: 500
};

const TERMINAL_CONFIG = {
  DEFAULT_ROWS: 24,
  DEFAULT_COLS: 80
};

// ==================== ENCODING UTILITIES ====================

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

const decodeFromBase64 = (base64, allowBinary = false) => {
  try {
    const binaryString = atob(base64);
    const uint8Array = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      uint8Array[i] = binaryString.charCodeAt(i);
    }
    
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return decoder.decode(uint8Array);
    } catch (utf8Error) {
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
  const initPromiseRef = useRef(null);
  const eventHandlersRef = useRef({});
  const commandHandlersRef = useRef(new Map());
  const wsMessageListenerRef = useRef(null);
  
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
  
  const getWebSocket = useCallback(() => {
    return window.globalWebSocket || webSocketService.ws;
  }, []);
  
  const isWebSocketReady = wsState?.authenticated || wsConnectionState?.authenticated;
  
  const getNodeInfo = useCallback(() => {
    let node = null;
    
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
  
  const generateRequestId = useCallback(() => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);
  
  // ==================== AUTHENTICATION MANAGEMENT (ORIGINAL - UNCHANGED) ====================
  
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
  
  // ==================== WAIT FOR WEBSOCKET (ORIGINAL - UNCHANGED) ====================
  
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
  
  // ==================== TERMINAL INITIALIZATION (ORIGINAL - UNCHANGED) ====================
  
  const initializeTerminal = useCallback(async () => {
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
    
    initPromiseRef.current = (async () => {
      try {
        setIsConnecting(true);
        setError(null);
        
        if (!isWebSocketReady) {
          console.log('[useRemoteManagement] Waiting for WebSocket...');
          setError('Connecting to server, please wait...');
          
          const isReady = await waitForWebSocketReady(TIMEOUTS.WS_CONNECTION);
          if (!isReady) {
            throw new Error('Connection timeout. Please check your network and try again.');
          }
          
          setError(null);
        }
        
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
        
        // createSession returns sessionId string directly
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
              cols: TERMINAL_CONFIG.DEFAULT_COLS
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
        initPromiseRef.current = null;
      }
    })();
    
    return initPromiseRef.current;
  }, [nodeReference, isWebSocketReady, createSession, waitForWebSocketReady]);
  
  // ==================== TERMINAL STATE REF ====================
  
  const terminalStateRef = useRef({ session: null, ready: false });
  
  useEffect(() => {
    terminalStateRef.current = {
      session: terminalSession || sessionRef.current,
      ready: terminalReady
    };
  }, [terminalSession, terminalReady]);
  
  // ==================== TERMINAL INPUT (ORIGINAL - UNCHANGED) ====================
  
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
  }, []);
  
  const executeTerminalCommand = useCallback((command) => {
    if (!command) return false;
    const commandWithNewline = command.endsWith('\n') ? command : `${command}\n`;
    return sendTerminalInput(commandWithNewline);
  }, [sendTerminalInput]);
  
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
  
  // ==================== REMOTE COMMAND EXECUTION ====================
  
  const sendRemoteCommand = useCallback((commandType, commandData = {}, customTimeout = null) => {
    if (!isRemoteAuthenticated) {
      console.error('[useRemoteManagement] Not authenticated for remote commands');
      console.error('[useRemoteManagement] Auth state:', isRemoteAuthenticated);
      console.error('[useRemoteManagement] Node reference:', nodeReference);
      return Promise.reject(new RemoteCommandError('AUTH_FAILED', 'Not authenticated for remote management'));
    }
    
    const requestId = generateRequestId();
    const timeout = customTimeout || getCommandTimeout(commandType);
    
    console.log('[useRemoteManagement] Sending remote command:', commandType, 'ID:', requestId, 'Timeout:', timeout);
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const handler = commandHandlersRef.current.get(requestId);
        if (handler) {
          console.error('[useRemoteManagement] ⏱️ Command timeout after', timeout, 'ms');
          console.error('[useRemoteManagement] Command type:', commandType);
          console.error('[useRemoteManagement] Request ID:', requestId);
          commandHandlersRef.current.delete(requestId);
          reject(new RemoteCommandError('TIMEOUT', `Command timeout after ${timeout/1000}s`));
        }
      }, timeout);
      
      commandHandlersRef.current.set(requestId, {
        resolve: (result) => {
          clearTimeout(timer);
          commandHandlersRef.current.delete(requestId);
          console.log('[useRemoteManagement] ✅ Command completed:', requestId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          commandHandlersRef.current.delete(requestId);
          console.error('[useRemoteManagement] ❌ Command failed:', requestId, error);
          reject(error);
        },
        commandType,
        timestamp: Date.now()
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
      
      console.log('[useRemoteManagement] 📤 Sending command message:', message);
      
      const success = webSocketService.send(message);
      
      if (!success) {
        clearTimeout(timer);
        commandHandlersRef.current.delete(requestId);
        console.error('[useRemoteManagement] ❌ Failed to send via WebSocket');
        reject(new RemoteCommandError('NETWORK_ERROR', 'Failed to send command via WebSocket'));
      } else {
        console.log('[useRemoteManagement] ✅ Command sent successfully, waiting for response...');
      }
    });
  }, [nodeReference, isRemoteAuthenticated, generateRequestId]);
  
  // ==================== FILE OPERATIONS ====================
  
  const listDirectory = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] listDirectory:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.LIST, { 
      path,
      recursive: options.recursive || false,
      include_hidden: options.includeHidden || false
    });
  }, [sendRemoteCommand]);
  
  const readFile = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] readFile:', path);
    
    if (!path || typeof path !== 'string' || path.trim().length === 0) {
      throw new Error('Valid file path is required');
    }
    
    try {
      const result = await sendRemoteCommand(REMOTE_COMMAND_TYPES.DOWNLOAD, { 
        path,
        max_size: options.maxSize || null
      });
      
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
  
  const writeFile = useCallback(async (path, content, options = {}) => {
    console.log('[useRemoteManagement] writeFile:', path, content.length, 'bytes');
    
    let base64Content;
    try {
      base64Content = encodeToBase64(content);
    } catch (encodeError) {
      console.error('[useRemoteManagement] Failed to encode content:', encodeError);
      throw new Error('Failed to encode file content');
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.UPLOAD, { 
      path, 
      content: base64Content,
      overwrite: options.overwrite || false,
      mode: options.mode || null
    });
  }, [sendRemoteCommand]);
  
  const deleteFile = useCallback(async (path) => {
    console.log('[useRemoteManagement] deleteFile:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.DELETE, { path });
  }, [sendRemoteCommand]);
  
  const uploadFile = useCallback(async (path, content, isBase64 = false) => {
    console.log('[useRemoteManagement] uploadFile:', path, 'isBase64:', isBase64);
    
    let base64Content = content;
    if (!isBase64) {
      try {
        base64Content = encodeToBase64(content);
      } catch (error) {
        throw new Error('Failed to encode file for upload');
      }
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.UPLOAD, { 
      path, 
      content: base64Content 
    });
  }, [sendRemoteCommand]);
  
  // ==================== NEW FILE OPERATIONS ====================
  
  const renameFile = useCallback(async (oldPath, newPath, options = {}) => {
    console.log('[useRemoteManagement] renameFile:', oldPath, '->', newPath);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.RENAME, {
      path: oldPath,
      destination: newPath,
      overwrite: options.overwrite || false
    });
  }, [sendRemoteCommand]);
  
  const copyFile = useCallback(async (sourcePath, destPath, options = {}) => {
    console.log('[useRemoteManagement] copyFile:', sourcePath, '->', destPath);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.COPY, {
      path: sourcePath,
      destination: destPath,
      recursive: options.recursive || false,
      overwrite: options.overwrite || false
    });
  }, [sendRemoteCommand]);
  
  const moveFile = useCallback(async (sourcePath, destPath, options = {}) => {
    console.log('[useRemoteManagement] moveFile:', sourcePath, '->', destPath);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.MOVE, {
      path: sourcePath,
      destination: destPath,
      overwrite: options.overwrite || false
    });
  }, [sendRemoteCommand]);
  
  const createDirectory = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] createDirectory:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.CREATE_DIRECTORY, {
      path,
      mode: options.mode || '0755'
    });
  }, [sendRemoteCommand]);
  
  const deleteDirectory = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] deleteDirectory:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.DELETE_DIRECTORY, {
      path,
      recursive: options.recursive || false
    });
  }, [sendRemoteCommand]);
  
  const searchFiles = useCallback(async (path, query, options = {}) => {
    console.log('[useRemoteManagement] searchFiles:', path, query);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.SEARCH, {
      path,
      query,
      use_regex: options.useRegex || false,
      case_sensitive: options.caseSensitive || false,
      max_depth: options.maxDepth || null
    });
  }, [sendRemoteCommand]);
  
  const compressFiles = useCallback(async (paths, destination, options = {}) => {
    console.log('[useRemoteManagement] compressFiles:', paths, '->', destination);
    
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new Error('Paths must be a non-empty array');
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.COMPRESS, {
      paths,
      destination,
      format: options.format || 'zip',
      overwrite: options.overwrite || false
    });
  }, [sendRemoteCommand]);
  
  const extractFile = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] extractFile:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.EXTRACT, {
      path,
      destination: options.destination || null,
      format: options.format || null
    });
  }, [sendRemoteCommand]);
  
  const changePermissions = useCallback(async (path, mode, options = {}) => {
    console.log('[useRemoteManagement] changePermissions:', path, mode);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.CHMOD, {
      path,
      mode,
      recursive: options.recursive || false
    });
  }, [sendRemoteCommand]);
  
  const changeOwner = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] changeOwner:', path);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.CHOWN, {
      path,
      owner: options.owner || null,
      group: options.group || null,
      recursive: options.recursive || false
    });
  }, [sendRemoteCommand]);
  
  const batchDelete = useCallback(async (paths) => {
    console.log('[useRemoteManagement] batchDelete:', paths.length, 'files');
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.BATCH_DELETE, { paths });
  }, [sendRemoteCommand]);
  
  const batchMove = useCallback(async (paths, destination) => {
    console.log('[useRemoteManagement] batchMove:', paths.length, 'files ->', destination);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.BATCH_MOVE, { paths, destination });
  }, [sendRemoteCommand]);
  
  const batchCopy = useCallback(async (paths, destination) => {
    console.log('[useRemoteManagement] batchCopy:', paths.length, 'files ->', destination);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.BATCH_COPY, { paths, destination });
  }, [sendRemoteCommand]);
  
  const getSystemInfo = useCallback(async (options = {}) => {
    console.log('[useRemoteManagement] getSystemInfo');
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.SYSTEM_INFO, {
      categories: options.categories || null
    });
  }, [sendRemoteCommand]);
  
  const executeCommand = useCallback(async (command, options = {}) => {
    console.log('[useRemoteManagement] executeCommand:', command);
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.EXECUTE, {
      cmd: command,
      args: options.args || [],
      cwd: options.cwd || null,
      env: options.env || {},
      timeout: options.timeout || null
    });
  }, [sendRemoteCommand]);
  
  // ==================== WEBSOCKET MESSAGE HANDLING ====================
  
  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        
        // 🔧 CRITICAL: Handle BOTH remote_command_sent AND remote_command_response
        if (message.type === WS_MESSAGE_TYPES.REMOTE_COMMAND_SENT) {
          console.log('[useRemoteManagement] 📨 Command sent confirmation:', message.request_id);
          // This is just acknowledgment, keep waiting for actual response
        }
        
        if (message.type === WS_MESSAGE_TYPES.REMOTE_COMMAND_RESPONSE) {
          console.log('[useRemoteManagement] 📬 Remote command response:', message.request_id);
          
          const handler = commandHandlersRef.current.get(message.request_id);
          if (handler) {
            console.log('[useRemoteManagement] Found handler for:', message.request_id);
            
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
            console.warn('[useRemoteManagement] Active handlers:', Array.from(commandHandlersRef.current.keys()));
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    };
    
    const ws = getWebSocket();
    if (ws?.addEventListener) {
      console.log('[useRemoteManagement] 🎧 Adding message listener');
      ws.addEventListener('message', handleMessage);
      wsMessageListenerRef.current = handleMessage;
      
      return () => {
        const currentWs = getWebSocket();
        if (currentWs?.removeEventListener && wsMessageListenerRef.current) {
          console.log('[useRemoteManagement] 🔇 Removing message listener');
          currentWs.removeEventListener('message', wsMessageListenerRef.current);
          wsMessageListenerRef.current = null;
        }
      };
    }
  }, [getWebSocket]);
  
  // ==================== ERROR HANDLING (ORIGINAL - UNCHANGED) ====================
  
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
  
  // ==================== LIFECYCLE MANAGEMENT (ORIGINAL - UNCHANGED) ====================
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  useEffect(() => {
    return () => {
      console.log('[useRemoteManagement] Hook unmounting');
      
      commandHandlersRef.current.forEach(handler => {
        handler.reject(new Error('Component unmounted'));
      });
      commandHandlersRef.current.clear();
      
      isInitializedRef.current = false;
      initPromiseRef.current = null;
    };
  }, []);
  
  useEffect(() => {
    if (terminalSession && !isNodeOnline) {
      console.log('[useRemoteManagement] Node offline, closing terminal');
      closeTerminal();
    }
  }, [isNodeOnline, terminalSession, closeTerminal]);
  
  useEffect(() => {
    if (terminalSession && !isWebSocketReady) {
      console.log('[useRemoteManagement] WebSocket disconnected');
      setTerminalReady(false);
    }
  }, [isWebSocketReady, terminalSession]);
  
  useEffect(() => {
    if (terminalSession && !isRemoteAuthenticated) {
      console.log('[useRemoteManagement] Auth lost, closing terminal');
      closeTerminal();
    }
  }, [isRemoteAuthenticated, terminalSession, closeTerminal]);
  
  // ==================== DEBUG LOGGING ====================
  
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[useRemoteManagement] State Update:', {
        nodeReference,
        terminalSession: terminalSession || sessionRef.current,
        terminalReady,
        isConnecting,
        isRemoteAuthenticated,
        isNodeOnline,
        isWebSocketReady,
        hasError: !!error,
        pendingCommands: commandHandlersRef.current.size
      });
    }
  }, [nodeReference, terminalSession, terminalReady, isConnecting, isRemoteAuthenticated, isNodeOnline, isWebSocketReady, error]);
  
  // ==================== RETURN API ====================
  
  return {
    // Terminal State
    terminalSession: terminalSession || sessionRef.current,
    terminalReady,
    isConnecting,
    error,
    
    // Authentication & Connection Status
    isRemoteAuthenticated,
    isNodeOnline,
    isWebSocketReady,
    
    // Terminal Actions
    initializeTerminal,
    sendTerminalInput,
    executeTerminalCommand,
    closeTerminal,
    reconnectTerminal,
    
    // File Operations (Original + New)
    listDirectory,
    readFile,
    writeFile,
    deleteFile,
    uploadFile,
    renameFile,
    copyFile,
    moveFile,
    
    // Directory Operations
    createDirectory,
    deleteDirectory,
    
    // Search
    searchFiles,
    
    // Compression
    compressFiles,
    extractFile,
    
    // Permissions
    changePermissions,
    changeOwner,
    
    // Batch Operations
    batchDelete,
    batchMove,
    batchCopy,
    
    // System & Execution
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
    
    isWebSocketConnected: () => {
      const ws = getWebSocket();
      return ws && ws.readyState === WebSocket.OPEN;
    },
    isWebSocketConnecting: () => {
      const ws = getWebSocket();
      return ws && ws.readyState === WebSocket.CONNECTING;
    },
    
    debugState: () => {
      console.log('[useRemoteManagement] === DEBUG STATE ===');
      console.log('Node Reference:', nodeReference);
      console.log('Terminal Session:', terminalSession || sessionRef.current);
      console.log('Terminal Ready:', terminalReady);
      console.log('Is Connecting:', isConnecting);
      console.log('Is Remote Authenticated:', isRemoteAuthenticated);
      console.log('Is Node Online:', isNodeOnline);
      console.log('WebSocket Ready:', isWebSocketReady);
      console.log('Error:', error);
      console.log('Pending Commands:', commandHandlersRef.current.size);
      console.log('Command Handlers:', Array.from(commandHandlersRef.current.keys()));
      
      const ws = getWebSocket();
      console.log('WebSocket State:', ws?.readyState);
      console.log('=========================');
    },
    
    pendingCommandsCount: commandHandlersRef.current.size
  };
}

export default useRemoteManagement;
