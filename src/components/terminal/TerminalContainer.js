/**
 * ============================================
 * File: src/components/terminal/TerminalContainer.js
 * ============================================
 * Terminal Container Component - Business Logic Layer
 * 
 * Responsibilities:
 * 1. Connect UI to business logic
 * 2. Manage terminal session lifecycle
 * 3. Handle state synchronization
 * 4. Coordinate with services and store
 * 
 * Features:
 * - Session management
 * - Error handling
 * - State synchronization
 * - Event handling
 * ============================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal as TerminalIcon,
  X,
  Maximize2,
  Minimize2,
  Copy,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  Loader2,
  CheckCircle
} from 'lucide-react';
import clsx from 'clsx';

// Import UI component and services
import TerminalUI from './TerminalUI';
import useTerminalStore from '../../stores/terminalStore';
import terminalService from '../../services/TerminalService';

/**
 * Terminal Container Component
 * Manages the business logic for terminal sessions
 */
export default function TerminalContainer({
  // Required props
  nodeReference,      // Node reference code (e.g., 'AERO-65574')
  
  // Optional props
  sessionId = null,   // Existing session ID (if reconnecting)
  autoConnect = true, // Automatically connect on mount
  theme = 'dark',     // Terminal theme
  fontSize = 14,      // Terminal font size
  
  // Layout props
  fullscreen = false, // Start in fullscreen mode
  showHeader = true,  // Show terminal header
  showToolbar = true, // Show terminal toolbar
  
  // Event handlers
  onClose,           // Called when terminal is closed
  onError,           // Called on terminal error
  
  // Style props
  className,
  style
}) {
  // ==================== State Management ====================
  
  // Local state
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(fullscreen);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [connectionError, setConnectionError] = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);
  
  // Refs
  const terminalUIRef = useRef(null);
  const terminalSessionRef = useRef(null);
  const outputBufferRef = useRef([]);
  const isInitializedRef = useRef(false);
  
  // Get store state and actions
  const {
    sessions,
    nodes,
    wsState,
    createSession,
    sendInput,
    resizeSession,
    closeSession,
    getSession
  } = useTerminalStore();
  
  // Get node status
  const node = nodes[nodeReference];
  const isNodeOnline = node && (node.status === 'online' || node.status === 'active');
  
  // ==================== Session Management ====================
  
  /**
   * Initialize terminal session
   */
  const initializeSession = useCallback(async () => {
    // Prevent duplicate initialization
    if (isInitializedRef.current || isConnecting) {
      console.log('[TerminalContainer] Already initializing or initialized');
      return;
    }
    
    // Check if node is online
    if (!isNodeOnline) {
      setConnectionError('Node is offline. Cannot establish terminal connection.');
      return;
    }
    
    // Check WebSocket connection
    if (!wsState.authenticated) {
      setConnectionError('WebSocket not authenticated. Please wait...');
      return;
    }
    
    setIsConnecting(true);
    setConnectionError(null);
    isInitializedRef.current = true;
    
    try {
      console.log('[TerminalContainer] Creating session for node:', nodeReference);
      
      // Create new session or reconnect to existing
      let activeSessionId = sessionId;
      
      if (!activeSessionId) {
        // Create new session
        activeSessionId = await createSession(nodeReference, {
          rows: 24,
          cols: 80
        });
      } else {
        // Verify existing session
        const existingSession = getSession(activeSessionId);
        if (!existingSession) {
          // Session doesn't exist, create new one
          activeSessionId = await createSession(nodeReference, {
            rows: 24,
            cols: 80
          });
        }
      }
      
      // Get terminal session from service
      const session = terminalService.getSession(activeSessionId);
      if (!session) {
        throw new Error('Failed to get terminal session');
      }
      
      terminalSessionRef.current = session;
      
      // Set up event listeners
      session.on('output', handleSessionOutput);
      session.on('error', handleSessionError);
      session.on('closed', handleSessionClosed);
      
      // Update state
      setSessionInfo({
        sessionId: activeSessionId,
        nodeReference,
        createdAt: Date.now()
      });
      setIsConnected(true);
      setIsConnecting(false);
      
      // Write connection message
      if (terminalUIRef.current) {
        terminalUIRef.current.write('\x1b[32m● Connected to ' + nodeReference + '\x1b[0m\r\n');
        terminalUIRef.current.write('\x1b[90mSession: ' + activeSessionId + '\x1b[0m\r\n');
        terminalUIRef.current.write('\x1b[90m─────────────────────────────────────────\x1b[0m\r\n');
      }
      
      // Flush any buffered output
      flushOutputBuffer();
      
    } catch (error) {
      console.error('[TerminalContainer] Failed to initialize session:', error);
      setConnectionError(error.message);
      setIsConnecting(false);
      isInitializedRef.current = false;
      
      if (onError) {
        onError(error);
      }
    }
  }, [nodeReference, sessionId, isNodeOnline, wsState.authenticated, createSession, getSession, onError]);
  
  /**
   * Handle session output
   */
  const handleSessionOutput = useCallback((data) => {
    console.log('[TerminalContainer] Received output:', data.length, 'bytes');
    
    if (terminalUIRef.current) {
      terminalUIRef.current.write(data);
    } else {
      // Buffer output if UI not ready
      outputBufferRef.current.push(data);
    }
  }, []);
  
  /**
   * Handle session error
   */
  const handleSessionError = useCallback((error) => {
    console.error('[TerminalContainer] Session error:', error);
    setConnectionError(error.message || error);
    
    if (terminalUIRef.current) {
      terminalUIRef.current.write(`\r\n\x1b[31m● Error: ${error}\x1b[0m\r\n`);
    }
    
    if (onError) {
      onError(error);
    }
  }, [onError]);
  
  /**
   * Handle session closed
   */
  const handleSessionClosed = useCallback(() => {
    console.log('[TerminalContainer] Session closed');
    setIsConnected(false);
    
    if (terminalUIRef.current) {
      terminalUIRef.current.write('\r\n\x1b[33m● Session closed\x1b[0m\r\n');
    }
  }, []);
  
  /**
   * Flush output buffer
   */
  const flushOutputBuffer = useCallback(() => {
    if (outputBufferRef.current.length > 0 && terminalUIRef.current) {
      console.log('[TerminalContainer] Flushing output buffer:', outputBufferRef.current.length, 'items');
      outputBufferRef.current.forEach(data => {
        terminalUIRef.current.write(data);
      });
      outputBufferRef.current = [];
    }
  }, []);
  
  // ==================== User Input Handling ====================
  
  /**
   * Handle terminal input from user
   */
  const handleTerminalInput = useCallback((data) => {
    console.log('[TerminalContainer] User input:', data.length, 'bytes');
    
    if (!isConnected || !sessionInfo) {
      console.warn('[TerminalContainer] Cannot send input - not connected');
      return;
    }
    
    // Send input through store (which handles service layer)
    sendInput(sessionInfo.sessionId, data);
  }, [isConnected, sessionInfo, sendInput]);
  
  /**
   * Handle terminal resize
   */
  const handleTerminalResize = useCallback((rows, cols) => {
    console.log('[TerminalContainer] Terminal resized:', rows, 'x', cols);
    
    if (!isConnected || !sessionInfo) {
      return;
    }
    
    // Send resize through store
    resizeSession(sessionInfo.sessionId, rows, cols);
  }, [isConnected, sessionInfo, resizeSession]);
  
  /**
   * Handle terminal ready
   */
  const handleTerminalReady = useCallback(() => {
    console.log('[TerminalContainer] Terminal UI ready');
    
    // Flush any buffered output
    flushOutputBuffer();
    
    // Initialize session if auto-connect is enabled
    if (autoConnect && !isConnected && !isConnecting) {
      initializeSession();
    }
  }, [autoConnect, isConnected, isConnecting, initializeSession, flushOutputBuffer]);
  
  // ==================== Toolbar Actions ====================
  
  /**
   * Copy terminal selection
   */
  const copySelection = useCallback(() => {
    if (terminalUIRef.current) {
      const selection = terminalUIRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).then(() => {
          console.log('[TerminalContainer] Copied to clipboard');
        }).catch(console.error);
      }
    }
  }, []);
  
  /**
   * Clear terminal
   */
  const clearTerminal = useCallback(() => {
    if (terminalUIRef.current) {
      terminalUIRef.current.clear();
    }
  }, []);
  
  /**
   * Download terminal buffer
   */
  const downloadBuffer = useCallback(() => {
    if (!terminalUIRef.current) return;
    
    // Get terminal instance
    const terminal = terminalUIRef.current.getTerminal();
    if (!terminal) return;
    
    // Extract buffer content
    const lines = [];
    for (let i = 0; i < terminal.buffer.active.length; i++) {
      const line = terminal.buffer.active.getLine(i);
      if (line) {
        lines.push(line.translateToString(true));
      }
    }
    
    // Create download
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-${nodeReference}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [nodeReference]);
  
  /**
   * Toggle fullscreen
   */
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      const newState = !prev;
      // Refit terminal after animation
      setTimeout(() => {
        if (terminalUIRef.current) {
          terminalUIRef.current.fit();
        }
      }, 300);
      return newState;
    });
  }, []);
  
  /**
   * Handle search
   */
  const handleSearch = useCallback(() => {
    if (terminalUIRef.current && searchQuery) {
      terminalUIRef.current.search(searchQuery);
    }
  }, [searchQuery]);
  
  /**
   * Handle close
   */
  const handleClose = useCallback(() => {
    console.log('[TerminalContainer] Closing terminal');
    
    // Close session if connected
    if (sessionInfo) {
      closeSession(sessionInfo.sessionId);
    }
    
    // Clean up
    if (terminalSessionRef.current) {
      terminalSessionRef.current.removeAllListeners();
      terminalSessionRef.current = null;
    }
    
    // Call parent handler
    if (onClose) {
      onClose();
    }
  }, [sessionInfo, closeSession, onClose]);
  
  // ==================== Effects ====================
  
  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    if (autoConnect && !isConnected && !isConnecting && isNodeOnline && wsState.authenticated) {
      initializeSession();
    }
  }, [autoConnect, isNodeOnline, wsState.authenticated]);
  
  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      console.log('[TerminalContainer] Unmounting, cleaning up');
      
      // Clean up session
      if (sessionInfo && terminalSessionRef.current) {
        terminalSessionRef.current.removeAllListeners();
        // Note: Don't close the session here if it might be reused
      }
      
      isInitializedRef.current = false;
    };
  }, [sessionInfo]);
  
  // ==================== Render ====================
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={clsx(
        'terminal-container flex flex-col',
        'bg-black/90 border border-white/10 rounded-xl overflow-hidden',
        isFullscreen && 'fixed inset-4 z-50',
        className
      )}
      style={style}
    >
      {/* Terminal Header */}
      {showHeader && (
        <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-gray-900 to-gray-800 border-b border-white/10">
          <div className="flex items-center gap-3">
            <TerminalIcon className="w-5 h-5 text-purple-400" />
            <span className="text-sm font-medium text-white">
              Terminal - {nodeReference}
            </span>
            
            {/* Connection Status */}
            {isConnecting && (
              <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
            )}
            {isConnected && (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )}
            {connectionError && (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )}
          </div>
          
          {/* Toolbar */}
          {showToolbar && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                title="Search (Ctrl+F)"
              >
                <Search className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={copySelection}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                title="Copy selection"
              >
                <Copy className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={downloadBuffer}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                title="Download buffer"
              >
                <Download className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={clearTerminal}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                title="Clear terminal"
              >
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4 text-gray-400" />
                ) : (
                  <Maximize2 className="w-4 h-4 text-gray-400" />
                )}
              </button>
              <button
                onClick={handleClose}
                className="p-1.5 hover:bg-white/10 rounded transition-colors ml-2"
                title="Close terminal"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Search Bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2 bg-gray-900/50 border-b border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch();
                    if (e.key === 'Escape') {
                      setShowSearch(false);
                      setSearchQuery('');
                    }
                  }}
                  placeholder="Search in terminal..."
                  className="flex-1 px-3 py-1 bg-white/10 border border-white/20 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  autoFocus
                />
                <button
                  onClick={handleSearch}
                  className="px-4 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm text-white transition-colors"
                >
                  Search
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Terminal Content */}
      <div className="flex-1 relative">
        {/* Error Overlay */}
        {connectionError && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="text-center p-6 max-w-md">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-400 mb-4">{connectionError}</p>
              {!isNodeOnline && (
                <p className="text-gray-400 text-sm">
                  The node must be online to establish a terminal connection.
                </p>
              )}
              {isNodeOnline && (
                <button
                  onClick={() => {
                    setConnectionError(null);
                    isInitializedRef.current = false;
                    initializeSession();
                  }}
                  className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white transition-colors"
                >
                  Retry Connection
                </button>
              )}
            </div>
          </div>
        )}
        
        {/* Terminal UI */}
        <TerminalUI
          ref={terminalUIRef}
          theme={theme}
          fontSize={fontSize}
          onInput={handleTerminalInput}
          onResize={handleTerminalResize}
          onReady={handleTerminalReady}
          className="h-full"
        />
      </div>
      
      {/* Status Bar */}
      {sessionInfo && (
        <div className="px-4 py-1 bg-gradient-to-r from-gray-900 to-gray-800 border-t border-white/10 text-xs text-gray-400 flex items-center justify-between">
          <span>Session: {sessionInfo.sessionId}</span>
          <span>UTF-8</span>
        </div>
      )}
    </motion.div>
  );
}
