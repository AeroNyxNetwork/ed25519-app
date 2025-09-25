/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Web-based terminal interface for remote node management
 * Modification Reason: Fix terminal interaction issue - output not displaying
 * Main Functionality: 
 * - Terminal UI using xterm.js
 * - WebSocket communication for input/output
 * - Session management with proper data routing
 * 
 * Main Logical Flow:
 * 1. Initialize xterm.js terminal instance
 * 2. Connect to remote node via WebSocket
 * 3. Handle bidirectional data flow (input/output)
 * 4. Display terminal output and send user input
 * 5. Properly decode and display WebSocket messages
 * 
 * ⚠️ Important Note for Next Developer:
 * - The core terminal instance must be preserved during component lifecycle
 * - WebSocket message handlers must be properly cleaned up
 * - Session ID management is critical for proper routing
 * - Output data must be properly decoded before display
 * - Global WebSocket listener ensures output is always captured
 * 
 * Last Modified: v2.2.0 - Fixed output display and interaction issues
 * ============================================
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Maximize2,
  Minimize2,
  Copy,
  Download,
  Terminal as TerminalIcon,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  Command
} from 'lucide-react';
import clsx from 'clsx';

// Import xterm styles
import 'xterm/css/xterm.css';

// Terminal color themes
const THEMES = {
  dark: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#aeafad',
    cursorAccent: '#000000',
    selection: '#264f78',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#ffffff'
  }
};

/**
 * WebTerminal Component
 * 
 * @param {Object} props
 * @param {string} props.sessionId - Initial session ID (may be pending)
 * @param {string} props.nodeReference - Node reference code (e.g., AERO-65574)
 * @param {boolean} props.isEnabled - Whether terminal is enabled
 * @param {Function} props.onInit - Initialization callback
 * @param {Function} props.onInput - Input handler callback
 * @param {Function} props.onResize - Resize handler callback
 * @param {Function} props.onClose - Close handler callback
 * @param {string} props.className - Additional CSS classes
 */
export default function WebTerminal({
  sessionId: propSessionId,
  nodeReference,
  isEnabled,
  onInit,
  onInput,
  onResize,
  onClose,
  className
}) {
  // DOM refs
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  
  // State management
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState(null);
  const [sessionId, setSessionId] = useState(propSessionId);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Track initialization to prevent duplicates
  const isInitializedRef = useRef(false);
  const sessionIdRef = useRef(null);
  const handlersRef = useRef({});
  const wsListenerRef = useRef(null);
  
  // Make terminal instance globally accessible for debugging
  useEffect(() => {
    if (terminalRef.current) {
      window.terminalRef = terminalRef;
      window.sessionIdRef = sessionIdRef;
    }
  }, []);

  /**
   * Main terminal initialization effect
   * Only runs when component mounts or isEnabled changes
   */
  useEffect(() => {
    if (!containerRef.current || !isEnabled || isInitializedRef.current) {
      return;
    }

    console.log('[WebTerminal] Initializing terminal for node:', nodeReference);
    isInitializedRef.current = true;
    
    // Create terminal instance with production settings
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
      theme: THEMES.dark,
      scrollback: 10000,
      convertEol: true,
      windowsMode: false,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
      allowTransparency: false
    });

    // Create and load addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);
    
    // Store references
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    
    // Open terminal in container
    term.open(containerRef.current);
    fitAddon.fit();
    
    // Initialize terminal session
    const initSession = async () => {
      try {
        setStatus('connecting');
        console.log('[WebTerminal] Starting session initialization');
        
        // Define output handler that will be called by parent
        const handleOutput = (data) => {
          console.log('[WebTerminal] Output handler called with:', typeof data, data?.length);
          if (data && term) {
            // Ensure we're writing string data
            if (typeof data === 'string') {
              term.write(data);
            } else if (data instanceof Uint8Array) {
              // Convert Uint8Array to string
              const decoder = new TextDecoder('utf-8');
              term.write(decoder.decode(data));
            } else if (typeof data === 'object' && data.data) {
              // Handle wrapped data
              term.write(data.data);
            }
          }
        };
        
        // Store handler reference
        handlersRef.current.onOutput = handleOutput;
        
        // Define other handlers
        const handleError = (err) => {
          console.error('[WebTerminal] Terminal error:', err);
          setError(err);
          setStatus('error');
          term.write(`\r\n\x1b[31m● Error: ${err}\x1b[0m\r\n`);
        };
        
        const handleClose = () => {
          console.log('[WebTerminal] Session closed');
          setStatus('closed');
          term.write('\r\n\x1b[33m● Session closed\x1b[0m\r\n');
        };
        
        const handleReady = (info) => {
          console.log('[WebTerminal] Session ready:', info);
          const sid = info?.session_id || sessionIdRef.current;
          sessionIdRef.current = sid;
          setSessionId(sid);
          setStatus('ready');
          
          // Clear screen and show connection message
          term.write('\x1b[2J\x1b[H'); // Clear screen and move cursor to top
          term.write('\x1b[32m● Connected to ' + nodeReference + '\x1b[0m\r\n');
          term.write('\x1b[90mSession: ' + sid + '\x1b[0m\r\n');
          term.write('\x1b[90m─────────────────────────────────────────\x1b[0m\r\n');
        };
        
        // Store handlers
        handlersRef.current = {
          onOutput: handleOutput,
          onError: handleError,
          onClose: handleClose,
          onReady: handleReady
        };
        
        // Call parent's onInit with all handlers
        if (onInit) {
          const result = await onInit({
            rows: term.rows,
            cols: term.cols,
            onOutput: handleOutput,
            onError: handleError,
            onClose: handleClose,
            onReady: handleReady
          });
          
          console.log('[WebTerminal] Init completed with session:', result);
          
          if (result && !sessionIdRef.current) {
            sessionIdRef.current = result;
            setSessionId(result);
          }
        }
        
      } catch (err) {
        console.error('[WebTerminal] Session initialization failed:', err);
        setError(err.message);
        setStatus('error');
        term.write(`\r\n\x1b[31m● Failed to initialize: ${err.message}\x1b[0m\r\n`);
      }
    };
    
    // Start initialization
    initSession();
    
    // Setup terminal input handler
    term.onData((data) => {
      const sid = sessionIdRef.current;
      console.log('[WebTerminal] User input:', data.length, 'bytes, session:', sid);
      
      if (onInput && sid && sid !== 'pending') {
        onInput(sid, data);
      }
    });
    
    // Setup resize handler
    term.onResize(({ cols, rows }) => {
      const sid = sessionIdRef.current;
      if (onResize && sid && sid !== 'pending') {
        console.log('[WebTerminal] Terminal resized:', cols, 'x', rows);
        onResize(sid, rows, cols);
      }
    });
    
    // Setup keyboard shortcuts
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown') {
        // Ctrl+C for copy when selection exists
        if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
          const selection = term.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection).catch(console.error);
            return false;
          }
        }
        // Ctrl+V for paste
        if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
          navigator.clipboard.readText().then(text => {
            const sid = sessionIdRef.current;
            if (text && onInput && sid && sid !== 'pending') {
              onInput(sid, text);
            }
          }).catch(console.error);
          return false;
        }
        // Ctrl+F for search
        if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
          setShowSearch(prev => !prev);
          return false;
        }
      }
      return true;
    });
    
    // Cleanup function
    return () => {
      console.log('[WebTerminal] Cleaning up terminal');
      isInitializedRef.current = false;
      sessionIdRef.current = null;
      handlersRef.current = {};
      
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [isEnabled, nodeReference]); // Only depend on stable values

  /**
   * Enhanced WebSocket listener with better message handling
   * This ensures output is displayed even if the callback chain fails
   */
  useEffect(() => {
    if (!isEnabled || !terminalRef.current) return;
    
    const handleWSMessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        // Debug logging for terminal messages
        if (msg.type?.includes('term')) {
          console.log('[WebTerminal] WS message:', {
            type: msg.type,
            sessionId: msg.session_id,
            hasData: !!msg.data,
            dataLength: msg.data?.length
          });
        }
        
        // Check if this is a terminal output message for our session
        if (msg.type === 'term_output' && msg.session_id && msg.data) {
          // Try to match the session ID
          const currentSessionId = sessionIdRef.current;
          
          // Direct match or fuzzy match (for session ID changes)
          if (msg.session_id === currentSessionId || 
              (currentSessionId && msg.session_id.includes(nodeReference)) ||
              (currentSessionId && currentSessionId.includes(nodeReference))) {
            
            console.log('[WebTerminal] Writing output from WS:', msg.data.length, 'chars');
            
            // Write directly to terminal, handling different data formats
            if (terminalRef.current) {
              const term = terminalRef.current;
              
              // Handle different data formats
              if (typeof msg.data === 'string') {
                // Direct string data
                term.write(msg.data);
              } else if (msg.data instanceof Uint8Array) {
                // Binary data - convert to string
                const decoder = new TextDecoder('utf-8');
                term.write(decoder.decode(msg.data));
              } else if (Array.isArray(msg.data)) {
                // Array of bytes - convert to string
                const uint8Array = new Uint8Array(msg.data);
                const decoder = new TextDecoder('utf-8');
                term.write(decoder.decode(uint8Array));
              } else if (typeof msg.data === 'object' && msg.data.data) {
                // Nested data object
                term.write(msg.data.data);
              }
            }
          }
        }
        
        // Handle terminal ready message
        else if (msg.type === 'term_ready' && msg.session_id) {
          console.log('[WebTerminal] Terminal ready, updating session:', msg.session_id);
          sessionIdRef.current = msg.session_id;
          setSessionId(msg.session_id);
          
          // Call ready handler if available
          if (handlersRef.current.onReady) {
            handlersRef.current.onReady(msg);
          }
        }
        
        // Handle terminal errors
        else if (msg.type === 'term_error' && msg.session_id === sessionIdRef.current) {
          console.error('[WebTerminal] Terminal error from WS:', msg);
          if (handlersRef.current.onError) {
            handlersRef.current.onError(msg.error || msg.message || 'Unknown error');
          }
        }
        
        // Handle terminal close
        else if (msg.type === 'term_closed' && msg.session_id === sessionIdRef.current) {
          console.log('[WebTerminal] Terminal closed from WS');
          if (handlersRef.current.onClose) {
            handlersRef.current.onClose();
          }
        }
        
      } catch (err) {
        // Ignore non-JSON messages
        if (err instanceof SyntaxError) {
          // Might be raw text data, try to display it
          if (typeof event.data === 'string' && terminalRef.current) {
            // Only write if it looks like terminal output
            if (event.data.length < 10000 && !event.data.startsWith('{')) {
              terminalRef.current.write(event.data);
            }
          }
        } else {
          console.error('[WebTerminal] Error handling WS message:', err);
        }
      }
    };
    
    // Clean up previous listener
    if (wsListenerRef.current && window.globalWebSocket) {
      window.globalWebSocket.removeEventListener('message', wsListenerRef.current);
    }
    
    // Add listener to global WebSocket
    if (window.globalWebSocket) {
      wsListenerRef.current = handleWSMessage;
      window.globalWebSocket.addEventListener('message', handleWSMessage);
      console.log('[WebTerminal] Enhanced WebSocket listener attached');
      
      return () => {
        if (window.globalWebSocket && wsListenerRef.current) {
          window.globalWebSocket.removeEventListener('message', wsListenerRef.current);
          wsListenerRef.current = null;
          console.log('[WebTerminal] Enhanced WebSocket listener removed');
        }
      };
    }
  }, [isEnabled, nodeReference]);

  /**
   * Window resize handler
   */
  useEffect(() => {
    if (!fitAddonRef.current) return;

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);
    
    // Use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, []);

  // Action handlers
  const copySelection = useCallback(() => {
    const selection = terminalRef.current?.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).then(() => {
        terminalRef.current.clearSelection();
      }).catch(console.error);
    }
  }, []);

  const clearTerminal = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const resetTerminal = useCallback(() => {
    terminalRef.current?.reset();
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
    setTimeout(() => fitAddonRef.current?.fit(), 300);
  }, []);

  const downloadBuffer = useCallback(() => {
    if (!terminalRef.current) return;
    
    const buffer = [];
    for (let i = 0; i < terminalRef.current.buffer.active.length; i++) {
      const line = terminalRef.current.buffer.active.getLine(i);
      if (line) buffer.push(line.translateToString(true));
    }
    
    const blob = new Blob([buffer.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-${nodeReference}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [nodeReference]);

  const handleSearch = useCallback(() => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findNext(searchQuery);
    }
  }, [searchQuery]);

  if (!isEnabled) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={clsx(
        "flex flex-col bg-black/90 border border-white/10 rounded-xl overflow-hidden shadow-2xl",
        isFullscreen ? "fixed inset-4 z-50" : "h-[600px]",
        className
      )}
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-gray-900 to-gray-800 border-b border-white/10">
        <div className="flex items-center gap-3">
          <TerminalIcon className="w-5 h-5 text-purple-400" />
          <span className="text-sm font-medium text-white">
            Terminal - {nodeReference}
          </span>
          {status === 'connecting' && (
            <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
          )}
          {status === 'ready' && (
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          )}
          {status === 'error' && (
            <AlertCircle className="w-4 h-4 text-red-400" />
          )}
          {status === 'closed' && (
            <div className="w-2 h-2 bg-gray-400 rounded-full" />
          )}
        </div>

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
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-gray-400" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded transition-colors ml-2"
            title="Close terminal"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

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

      {/* Terminal Container */}
      <div className="flex-1 relative bg-black">
        {status === 'error' && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="text-center p-6">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-400 mb-2 font-semibold">Connection Error</p>
              <p className="text-gray-400 text-sm max-w-md">
                {error || 'Failed to establish terminal connection'}
              </p>
            </div>
          </div>
        )}
        
        <div
          ref={containerRef}
          className="h-full w-full p-2"
          style={{ backgroundColor: THEMES.dark.background }}
        />
      </div>

      {/* Status Bar */}
      <div className="px-4 py-1 bg-gradient-to-r from-gray-900 to-gray-800 border-t border-white/10 text-xs text-gray-400 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span>Session: {sessionId || 'Connecting...'}</span>
          {terminalRef.current && (
            <span>{terminalRef.current.cols}×{terminalRef.current.rows}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Command className="w-3 h-3" />
          <span>UTF-8</span>
        </div>
      </div>
    </motion.div>
  );
}
