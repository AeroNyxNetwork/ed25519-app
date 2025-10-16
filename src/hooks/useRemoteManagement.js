/**
 * ============================================
 * File: src/hooks/useRemoteManagement.js
 * ============================================
 * Remote Management Hook - ENHANCED VERSION v9.0.0
 * 
 * Modification Reason: Add all remote command support from backend
 * Main Functionality: Complete remote management with all command types
 * Dependencies: useTerminalStore, terminalService, webSocketService, remoteAuthService
 * 
 * Main Logical Flow:
 * 1. Terminal session management (for Terminal tab)
 * 2. Remote command execution (for File Manager & System Info)
 * 3. WebSocket connection monitoring
 * 4. Authentication state management
 * 
 * ⚠️ CRITICAL NOTES:
 * - Terminal input uses 'term_input' message type
 * - Remote commands use 'remote_command' message type
 * - These are SEPARATE systems - do not mix them!
 * - All new commands follow the same pattern as existing ones
 * 
 * Last Modified: v9.0.0 - Added all backend command support
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
} from '../constants/remoteCommands';

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
  // ... (keeping all existing state and refs from previous version)
  // ... (keeping all existing authentication and initialization logic)
  
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
  
  // ==================== ENHANCED SEND REMOTE COMMAND ====================
  
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
  
  /**
   * List directory contents
   * @param {string} path - Directory path
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Read/Download file
   * @param {string} path - File path
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Write/Upload file
   * @param {string} path - File path
   * @param {string} content - File content
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Delete file
   * @param {string} path - File path
   * @returns {Promise}
   */
  const deleteFile = useCallback(async (path) => {
    console.log('[useRemoteManagement] deleteFile:', path);
    
    const validation = validatePath(path);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PATH', validation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.DELETE, { path });
  }, [sendRemoteCommand]);
  
  /**
   * Rename file or directory
   * @param {string} oldPath - Current path
   * @param {string} newPath - New path
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Copy file or directory
   * @param {string} sourcePath - Source path
   * @param {string} destPath - Destination path
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Move file or directory
   * @param {string} sourcePath - Source path
   * @param {string} destPath - Destination path
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Create directory
   * @param {string} path - Directory path
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Delete directory
   * @param {string} path - Directory path
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Search files
   * @param {string} path - Search path
   * @param {string} query - Search query
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Compress files
   * @param {Array} paths - Array of file paths
   * @param {string} destination - Output archive path
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Extract archive
   * @param {string} path - Archive path
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Change file permissions
   * @param {string} path - File path
   * @param {string} mode - Permission mode (e.g., "0755")
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Change file owner
   * @param {string} path - File path
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Batch delete files
   * @param {Array} paths - Array of file paths
   * @returns {Promise}
   */
  const batchDelete = useCallback(async (paths) => {
    console.log('[useRemoteManagement] batchDelete:', paths.length, 'files');
    
    const validation = validateBatchOperation(paths);
    if (!validation.valid) {
      throw new RemoteCommandError('INVALID_PARAMETERS', validation.error);
    }
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.BATCH_DELETE, { paths });
  }, [sendRemoteCommand]);
  
  /**
   * Batch move files
   * @param {Array} paths - Array of source paths
   * @param {string} destination - Destination directory
   * @returns {Promise}
   */
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
  
  /**
   * Batch copy files
   * @param {Array} paths - Array of source paths
   * @param {string} destination - Destination directory
   * @returns {Promise}
   */
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
  
  /**
   * Get system information
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
  const getSystemInfo = useCallback(async (options = {}) => {
    console.log('[useRemoteManagement] getSystemInfo');
    
    return sendRemoteCommand(REMOTE_COMMAND_TYPES.SYSTEM_INFO, {
      categories: options.categories || null
    });
  }, [sendRemoteCommand]);
  
  /**
   * Execute command
   * @param {string} command - Command to execute
   * @param {Object} options - Optional parameters
   * @returns {Promise}
   */
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
  
  /**
   * Upload file (alias for writeFile with validation)
   * @param {string} path - File path
   * @param {string} content - File content
   * @param {boolean} isBase64 - Whether content is already base64 encoded
   * @returns {Promise}
   */
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
  
  // ... (Keep all existing terminal-related code)
  // ... (Keep all existing effects and lifecycle management)
  
  // ==================== RETURN API ====================
  
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
    
    // Debug info
    pendingCommandsCount: commandHandlersRef.current.size
  };
}

export default useRemoteManagement;
