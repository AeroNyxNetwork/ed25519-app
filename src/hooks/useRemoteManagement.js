/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Remote Management Hook - FIXED VERSION v9.1.0
 * 
 * 🔧 FIX APPLIED:
 * - Fixed createSession return value handling
 * - Fixed terminalService.createSession compatibility
 * - Properly handle session object vs sessionId string
 * 
 * ⚠️ CRITICAL FIX:
 * The issue was assuming createSession returns { sessionId: string }
 * Actually it returns the session object directly or just the sessionId string
 * 
 * Last Modified: v9.1.0 - Fixed terminal initialization bug
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
  REMOTE_COMMAND_RESPONSE: 'remote_command_response',
  ERROR: 'error'
};

const TIMEOUTS = {
  WS_CONNECTION: 30000,
  WS_AUTH: 10000,
  WS_CHECK_INTERVAL: 500,
  TERMINAL_READY: 2000,
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
  // State Management
  const [terminalSession, setTerminalSession] = useState(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [isRemoteAuthenticated, setIsRemoteAuthenticated] = useState(false);
  
  // Refs
  const sessionRef = useRef(null);
  const isInitializedRef = useRef(false);
  const isMountedRef = useRef(true);
  const initPromiseRef = useRef(null);
  const eventHandlersRef = useRef({});
  const commandHandlersRef = useRef(new Map());
  const wsMessageListenerRef = useRef(null);
  
  // Store & WebSocket
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
  
  // Get WebSocket reference
  const getWebSocket = useCallback(() => {
    return window.globalWebSocket || webSocketService.ws;
  }, []);
  
  // Check WebSocket ready
  const isWebSocketReady = wsState?.authenticated || wsConnectionState?.authenticated;
  
  // Get node info
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
  
  // Generate unique request ID
  const generateRequestId = useCallback(() => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);
  
  // ==================== AUTHENTICATION MANAGEMENT ====================
  
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
  
  // ==================== TERMINAL INITIALIZATION (FIXED) ====================
  
  /**
   * 🔧 FIXED: Initialize terminal with proper session handling
   */
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
        
        // Wait for WebSocket
        if (!isWebSocketReady) {
          console.log('[useRemoteManagement] Waiting for WebSocket...');
          setError('Connecting to server, please wait...');
          
          let waitTime = 0;
          while (waitTime < TIMEOUTS.WS_CONNECTION && !isWebSocketReady) {
            await new Promise(resolve => setTimeout(resolve, TIMEOUTS.WS_CHECK_INTERVAL));
            waitTime += TIMEOUTS.WS_CHECK_INTERVAL;
          }
          
          if (!isWebSocketReady) {
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
        
        // 🔧 FIX: Properly handle createSession return value
        let newSessionId;
        let sessionResult;
        
        try {
          // Call createSession from store
          sessionResult = await createSession(nodeReference, {
            rows: TERMINAL_CONFIG.DEFAULT_ROWS,
            cols: TERMINAL_CONFIG.DEFAULT_COLS
          });
          
          console.log('[useRemoteManagement] createSession result:', sessionResult);
          
          // Handle different return formats
          if (typeof sessionResult === 'string') {
            // Case 1: Returns sessionId directly as string
            newSessionId = sessionResult;
          } else if (sessionResult && typeof sessionResult === 'object') {
            // Case 2: Returns object with sessionId property
            newSessionId = sessionResult.sessionId || sessionResult.session_id;
            
            // Case 3: Returns session object with sessionId property
            if (!newSessionId && sessionResult.sessionId) {
              newSessionId = sessionResult.sessionId;
            }
          }
          
          if (!newSessionId) {
            throw new Error('Failed to get session ID from createSession');
          }
          
        } catch (createError) {
          console.error('[useRemoteManagement] createSession error:', createError);
          throw new Error(`Failed to create terminal session: ${createError.message}`);
        }
        
        console.log('[useRemoteManagement] Terminal session created:', newSessionId);
        
        sessionRef.current = newSessionId;
        
        if (isMountedRef.current) {
          setTerminalSession(newSessionId);
        }
        
        // Get session from terminalService
        let session = terminalService.getSession(newSessionId);
        
        if (!session) {
          console.warn('[useRemoteManagement] Session not found after creation, retrying...');
          
          // Try direct creation
          try {
            const manualSession = await terminalService.createSession(nodeReference, {
              rows: TERMINAL_CONFIG.DEFAULT_ROWS,
              cols: TERMINAL_CONFIG.DEFAULT_COLS
            });
            
            // Handle TerminalSession object
            if (manualSession && typeof manualSession === 'object') {
              // If it's a TerminalSession instance with sessionId
              if (manualSession.sessionId) {
                newSessionId = manualSession.sessionId;
                session = terminalService.getSession(newSessionId);
              } else {
                // It might be the session itself
                session = manualSession;
                newSessionId = session.sessionId;
              }
            }
            
            if (newSessionId !== sessionRef.current) {
              sessionRef.current = newSessionId;
              if (isMountedRef.current) {
                setTerminalSession(newSessionId);
              }
            }
          } catch (manualError) {
            console.warn('[useRemoteManagement] Manual session creation failed:', manualError);
          }
        }
        
        if (session) {
          console.log('[useRemoteManagement] Session verified:', session.getInfo ? session.getInfo() : session);
          
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
          
          // Attach event handlers if session has event emitter
          if (session.on && typeof session.on === 'function') {
            Object.entries(handlers).forEach(([event, handler]) => {
              session.on(event, handler);
            });
          }
          
          // Wait for ready
          await new Promise((resolve) => {
            const readyTimeout = setTimeout(() => {
              if (isMountedRef.current && newSessionId) {
                setTerminalReady(true);
                console.log('[useRemoteManagement] Terminal ready (timeout)');
              }
              resolve();
            }, TIMEOUTS.TERMINAL_READY);
            
            if (session.once && typeof session.once === 'function') {
              session.once('ready', () => {
                clearTimeout(readyTimeout);
                if (isMountedRef.current) {
                  setTerminalReady(true);
                  console.log('[useRemoteManagement] Terminal ready (event)');
                }
                resolve();
              });
            }
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
  }, [nodeReference, isWebSocketReady, createSession]);
  
  // ==================== REMOTE COMMAND EXECUTION ====================
  
  const sendRemoteCommand = useCallback((commandType, commandData = {}, customTimeout = null) => {
    if (!isRemoteAuthenticated) {
      console.error('[useRemoteManagement] Not authenticated for remote commands');
      return Promise.reject(new RemoteCommandError('AUTH_FAILED', 'Not authenticated for remote management'));
    }
    
    const requestId = generateRequestId();
    const timeout = customTimeout || getCommandTimeout(commandType);
    
    console.log('[useRemoteManagement] Sending remote command:', commandType, 'ID:', requestId);
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        commandHandlersRef.current.delete(requestId);
        reject(new RemoteCommandError('TIMEOUT', 'Command timeout'));
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
        reject(new RemoteCommandError('NETWORK_ERROR', 'Failed to send command via WebSocket'));
      }
    });
  }, [nodeReference, isRemoteAuthenticated, generateRequestId]);
  
  // ==================== FILE OPERATIONS ====================
  
  const listDirectory = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] listDirectory:', path);
    
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.LIST, { 
      path,
      recursive: options.recursive || false,
      include_hidden: options.includeHidden || false
    });
  }, [sendRemoteCommand]);
  
  const readFile = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] readFile:', path);
    
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
    }
    
    try {
      const result = await sendRemoteCommand(REMOTE_COMMAND_TYPES.DOWNLOAD, { 
        path,
        max_size: options.maxSize || null
      });
      
      if (result.content) {
        result.content = decodeFromBase64(result.content, true);
      }
      
      return result;
    } catch (error) {
      logError(error, `readFile: ${path}`);
      throw error instanceof RemoteCommandError ? error : RemoteCommandError.fromResponse(error);
    }
  }, [sendRemoteCommand]);
  
  const writeFile = useCallback(async (path, content, options = {}) => {
    console.log('[useRemoteManagement] writeFile:', path, content.length, 'bytes');
    
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
    }
    
    const sizeValidation = validateFileSize(content.length, 'upload');
    if (!sizeValidation.valid) {
      throw new RemoteCommandError('FILE_TOO_LARGE', sizeValidation.error);
    }
    
    let base64Content;
    try {
      base64Content = encodeToBase64(content);
    } catch (error) {
      throw new RemoteCommandError('SYSTEM_ERROR', 'Failed to encode file content');
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
    
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.DELETE, { path });
  }, [sendRemoteCommand]);
  
  const renameFile = useCallback(async (oldPath, newPath, options = {}) => {
    console.log('[useRemoteManagement] renameFile:', oldPath, '->', newPath);
    
    const validation1 = validatePath(oldPath);
    const validation2 = validatePath(newPath);
    
    if (!validation1.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation1.error);
    }
    if (!validation2.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation2.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.RENAME, {
      path: oldPath,
      destination: newPath,
      overwrite: options.overwrite || false
    });
  }, [sendRemoteCommand]);
  
  const copyFile = useCallback(async (sourcePath, destPath, options = {}) => {
    console.log('[useRemoteManagement] copyFile:', sourcePath, '->', destPath);
    
    const validation1 = validatePath(sourcePath);
    const validation2 = validatePath(destPath);
    
    if (!validation1.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation1.error);
    }
    if (!validation2.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation2.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.COPY, {
      path: sourcePath,
      destination: destPath,
      recursive: options.recursive || false,
      overwrite: options.overwrite || false
    });
  }, [sendRemoteCommand]);
  
  const moveFile = useCallback(async (sourcePath, destPath, options = {}) => {
    console.log('[useRemoteManagement] moveFile:', sourcePath, '->', destPath);
    
    const validation1 = validatePath(sourcePath);
    const validation2 = validatePath(destPath);
    
    if (!validation1.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation1.error);
    }
    if (!validation2.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation2.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.MOVE, {
      path: sourcePath,
      destination: destPath,
      overwrite: options.overwrite || false
    });
  }, [sendRemoteCommand]);
  
  // ==================== DIRECTORY OPERATIONS ====================
  
  const createDirectory = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] createDirectory:', path);
    
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.CREATE_DIRECTORY, {
      path,
      mode: options.mode || '0755'
    });
  }, [sendRemoteCommand]);
  
  const deleteDirectory = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] deleteDirectory:', path);
    
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.DELETE_DIRECTORY, {
      path,
      recursive: options.recursive || false
    });
  }, [sendRemoteCommand]);
  
  // ==================== SEARCH ====================
  
  const searchFiles = useCallback(async (path, query, options = {}) => {
    console.log('[useRemoteManagement] searchFiles:', path, query);
    
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.SEARCH, {
      path,
      query,
      use_regex: options.useRegex || false,
      case_sensitive: options.caseSensitive || false,
      max_depth: options.maxDepth || null
    });
  }, [sendRemoteCommand]);
  
  // ==================== COMPRESSION ====================
  
  const compressFiles = useCallback(async (paths, destination, options = {}) => {
    console.log('[useRemoteManagement] compressFiles:', paths, '->', destination);
    
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new RemoteCommandError('INVALID_PARAMETERS', 'Paths must be a non-empty array');
    }
    
    const validation = validatePath(destination);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
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
    
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.EXTRACT, {
      path,
      destination: options.destination || null,
      format: options.format || null
    });
  }, [sendRemoteCommand]);
  
  // ==================== PERMISSIONS ====================
  
  const changePermissions = useCallback(async (path, mode, options = {}) => {
    console.log('[useRemoteManagement] changePermissions:', path, mode);
    
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.CHMOD, {
      path,
      mode,
      recursive: options.recursive || false
    });
  }, [sendRemoteCommand]);
  
  const changeOwner = useCallback(async (path, options = {}) => {
    console.log('[useRemoteManagement] changeOwner:', path);
    
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.CHOWN, {
      path,
      owner: options.owner || null,
      group: options.group || null,
      recursive: options.recursive || false
    });
  }, [sendRemoteCommand]);
  
  // ==================== BATCH OPERATIONS ====================
  
  const batchDelete = useCallback(async (paths) => {
    console.log('[useRemoteManagement] batchDelete:', paths.length, 'files');
    
    const validation = validateBatchOperation(paths);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PARAMETERS', validation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.BATCH_DELETE, { paths });
  }, [sendRemoteCommand]);
  
  const batchMove = useCallback(async (paths, destination) => {
    console.log('[useRemoteManagement] batchMove:', paths.length, 'files ->', destination);
    
    const validation = validateBatchOperation(paths);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PARAMETERS', validation.error);
    }
    
    const destValidation = validatePath(destination);
    if (!destValidation.valid) {
      throw new RemoteCommandError('INVALID_PATH', destValidation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.BATCH_MOVE, { paths, destination });
  }, [sendRemoteCommand]);
  
  const batchCopy = useCallback(async (paths, destination) => {
    console.log('[useRemoteManagement] batchCopy:', paths.length, 'files ->', destination);
    
    const validation = validateBatchOperation(paths);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PARAMETERS', validation.error);
    }
    
    const destValidation = validatePath(destination);
    if (!destValidation.valid) {
      throw new RemoteCommandError('INVALID_PATH', destValidation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.BATCH_COPY, { paths, destination });
  }, [sendRemoteCommand]);
  
  // ==================== SYSTEM & EXECUTION ====================
  
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
  
  const uploadFile = useCallback(async (path, content, isBase64 = false) => {
    console.log('[useRemoteManagement] uploadFile:', path, 'isBase64:', isBase64);
    
    let base64Content = content;
    if (!isBase64) {
      try {
        base64Content = encodeToBase64(content);
      } catch (error) {
        throw new RemoteCommandError('SYSTEM_ERROR', 'Failed to encode file for upload');
      }
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.UPLOAD, { 
      path, 
      content: base64Content 
    });
  }, [sendRemoteCommand]);
  
  // ==================== TERMINAL OPERATIONS ====================
  
  const terminalStateRef = useRef({ session: null, ready: false });
  
  useEffect(() => {
    terminalStateRef.current = {
      session: terminalSession || sessionRef.current,
      ready: terminalReady
    };
  }, [terminalSession, terminalReady]);
  
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
          if (session.off && typeof session.off === 'function') {
            session.off(event, handler);
          }
        });
      }
      
      if (closeSession && typeof closeSession === 'function') {
        closeSession(currentSession);
      }
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
      return null;
    }
    
    const authState = remoteAuthService.isAuthenticated(nodeReference);
    setIsRemoteAuthenticated(authState);
    
    if (!authState) {
      setError('Authentication required. Please authenticate to use terminal.');
      return null;
    }
    
    return initializeTerminal();
  }, [closeTerminal, initializeTerminal, nodeReference, isWebSocketReady]);
  
  // ==================== WEBSOCKET MESSAGE HANDLING ====================
  
  useEffect(() => {
    if (!isOpen || !terminalSession) return;

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
  
  // ==================== LIFECYCLE MANAGEMENT ====================
  
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
    
    // File Operations
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
    waitForWebSocketReady: async () => {
      // Implementation for waiting
      return isWebSocketReady;
    },
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
