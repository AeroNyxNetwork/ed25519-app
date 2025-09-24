/**
 * ============================================
 * File: src/components/terminal/WebTerminal.js
 * ============================================
 * Creation Reason: Web Terminal Component using xterm.js
 * Modification Reason: Fixed terminal input/output handling and session management
 * Main Functionality: Full-featured terminal emulator for remote node access
 * Dependencies: xterm, useRemoteManagement hook
 *
 * Main Logical Flow:
 * 1. Initialize xterm terminal instance
 * 2. Call onInit to establish WebSocket terminal session
 * 3. Handle bidirectional data flow (input/output)
 * 4. Manage terminal resize and cleanup
 *
 * ⚠️ Important Note for Next Developer:
 * - Terminal data can be base64 encoded or raw text
 * - Session ID is returned asynchronously from onInit
 * - Must handle both term_ready and term_init_success messages
 * - Raw terminal input is sent directly without encoding
 *
 * Last Modified: v1.3.0 - Fixed input/output handling and session management
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
  Settings,
  Terminal as TerminalIcon,
  AlertCircle,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';

// Import xterm styles
import 'xterm/css/xterm.css';

// Terminal themes
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
  },
  light: {
    background: '#ffffff',
    foreground: '#333333',
    cursor: '#333333',
    cursorAccent: '#ffffff',
    selection: '#add6ff',
    black: '#000000',
    red: '#cd3131',
    green: '#00bc00',
    yellow: '#949800',
    blue: '#0451a5',
    magenta: '#bc05bc',
    cyan: '#0598bc',
    white: '#555555',
    brightBlack: '#686868',
    brightRed: '#cd3131',
    brightGreen: '#00bc00',
    brightYellow: '#949800',
    brightBlue: '#0451a5',
    brightMagenta: '#bc05bc',
    brightCyan: '#0598bc',
    brightWhite: '#a5a5a5'
  }
};

export default function WebTerminal({
  sessionId,
  nodeReference,
  isEnabled,
  onInit,
  onInput,
  onResize,
  onClose,
  className,
  theme = 'dark',
  fontSize = 14,
  fontFamily = 'Menlo, Monaco, Consolas, "Courier New", monospace'
}) {
  const terminalRef = useRef(null);
  const terminalContainerRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [status, setStatus] = useState('connecting'); // connecting, ready, error, closed
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [actualSessionId, setActualSessionId] = useState(null);
  
  // Refs to prevent duplicate initialization
  const initializationRef = useRef(false);
  const terminalInstanceRef = useRef(null);
  const outputHandlerRef = useRef(null);

  // Initialize terminal
  useEffect(() => {
    if (!terminalContainerRef.current || !isEnabled || !onInit) return;
    
    // Prevent multiple initializations
    if (initializationRef.current) {
      console.log('[WebTerminal] Already initialized, skipping...');
      return;
    }

    console.log('[WebTerminal] Initializing terminal for node:', nodeReference);
    initializationRef.current = true;
    
    // Create terminal instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: fontSize,
      fontFamily: fontFamily,
      theme: THEMES[theme],
      scrollback: 10000,
      convertEol: true,
      windowsMode: false,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
      allowTransparency: true
    });

    // Create addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    // Load addons
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    // Store references
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    terminalInstanceRef.current = term;

    // Open terminal in container
    term.open(terminalContainerRef.current);
    
    // Initial fit
    fitAddon.fit();

    // Set up input handler - send raw terminal input
    term.onData(data => {
      console.log('[WebTerminal] Sending input:', data.length, 'bytes');
      if (onInput && actualSessionId) {
        onInput(actualSessionId, data);
      }
    });

    // Set up resize handler
    term.onResize(({ cols, rows }) => {
      console.log('[WebTerminal] Terminal resized:', cols, 'x', rows);
      if (onResize && actualSessionId) {
        onResize(actualSessionId, rows, cols);
      }
    });

    // Handle keyboard shortcuts
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown') {
        // Ctrl+V or Cmd+V for paste
        if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
          navigator.clipboard.readText().then(text => {
            if (text && onInput && actualSessionId) {
              onInput(actualSessionId, text);
            }
          }).catch(err => {
            console.error('[WebTerminal] Failed to read clipboard:', err);
          });
          return false;
        }
        // Ctrl+C for copy (when there's selection)
        if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
          const selection = term.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection).catch(err => {
              console.error('[WebTerminal] Failed to copy to clipboard:', err);
            });
            return false;
          }
          // If no selection, let Ctrl+C pass through to terminal
        }
      }
      return true;
    });

    // Initialize terminal session with proper callbacks
    const initializeSession = async () => {
      try {
        console.log('[WebTerminal] Initializing session with callbacks');
        setStatus('connecting');
        
        // Define the output handler that will process terminal data
        const handleOutput = (data) => {
          console.log('[WebTerminal] Received output:', typeof data, data?.length || 'N/A', 'bytes/chars');
          
          if (!data) return;
          
          // Handle different data formats
          if (typeof data === 'string') {
            // Check if it's base64 encoded
            if (/^[A-Za-z0-9+/]+=*$/.test(data) && data.length % 4 === 0) {
              try {
                const decoded = atob(data);
                console.log('[WebTerminal] Writing decoded base64 data:', decoded.length, 'bytes');
                term.write(decoded);
              } catch (err) {
                // Not valid base64, write as raw
                console.log('[WebTerminal] Writing raw string data:', data.length, 'chars');
                term.write(data);
              }
            } else {
              // Write raw string data
              console.log('[WebTerminal] Writing raw string data:', data.length, 'chars');
              term.write(data);
            }
          } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
            // Binary data - convert to string
            const decoder = new TextDecoder();
            const decoded = decoder.decode(data);
            console.log('[WebTerminal] Writing binary data as string:', decoded.length, 'chars');
            term.write(decoded);
          } else {
            console.warn('[WebTerminal] Unknown data format:', typeof data);
          }
        };

        // Store the handler ref so we can clean it up later
        outputHandlerRef.current = handleOutput;

        // Call onInit with all necessary callbacks
        const serverSessionId = await onInit({
          rows: term.rows,
          cols: term.cols,
          onOutput: handleOutput,
          onError: (error) => {
            console.error('[WebTerminal] Terminal error:', error);
            setError(error);
            setStatus('error');
          },
          onClose: () => {
            console.log('[WebTerminal] Terminal closed');
            setStatus('closed');
          },
          onReady: (data) => {
            console.log('[WebTerminal] Terminal ready with session:', data?.session_id);
            const sessionId = data?.session_id || serverSessionId;
            setActualSessionId(sessionId);
            setStatus('ready');
            
            // Write welcome message
            term.write('\r\n\x1b[32m● Terminal connected to ' + nodeReference + '\x1b[0m\r\n\r\n');
          }
        });
        
        console.log('[WebTerminal] Session initialized with ID:', serverSessionId);
        
        // Store session ID if not already set by onReady
        if (!actualSessionId && serverSessionId) {
          setActualSessionId(serverSessionId);
          // If onReady wasn't called, set status to ready after a short delay
          setTimeout(() => {
            if (status === 'connecting') {
              setStatus('ready');
              term.write('\r\n\x1b[32m● Terminal ready\x1b[0m\r\n\r\n');
            }
          }, 1000);
        }
        
        term.focus();
        
      } catch (err) {
        console.error('[WebTerminal] Failed to initialize terminal:', err);
        setError(err.message);
        setStatus('error');
        initializationRef.current = false; // Allow retry on error
      }
    };

    // Start initialization
    initializeSession();

    // Cleanup function
    return () => {
      console.log('[WebTerminal] Cleaning up terminal');
      initializationRef.current = false;
      outputHandlerRef.current = null;
      
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose();
        terminalInstanceRef.current = null;
      }
      
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [isEnabled, nodeReference]); // Only reinitialize if these critical props change

  // Handle resize
  useEffect(() => {
    if (!fitAddonRef.current || !xtermRef.current) return;

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);
    
    // Use ResizeObserver for more accurate resizing
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    });

    if (terminalContainerRef.current) {
      resizeObserver.observe(terminalContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, []);

  // Copy selection
  const copySelection = useCallback(() => {
    if (!xtermRef.current) return;
    
    const selection = xtermRef.current.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).then(() => {
        xtermRef.current.clearSelection();
      }).catch(err => {
        console.error('[WebTerminal] Failed to copy:', err);
      });
    }
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
    
    // Refit terminal after animation
    setTimeout(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }, 300);
  }, []);

  // Download terminal buffer
  const downloadBuffer = useCallback(() => {
    if (!xtermRef.current) return;

    const buffer = [];
    const term = xtermRef.current;
    
    for (let i = 0; i < term.buffer.active.length; i++) {
      const line = term.buffer.active.getLine(i);
      if (line) {
        buffer.push(line.translateToString(true));
      }
    }

    const content = buffer.join('\n');
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

  // Search functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const handleSearch = useCallback((query) => {
    if (!searchAddonRef.current || !query) return;
    searchAddonRef.current.findNext(query);
  }, []);

  if (!isEnabled) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={clsx(
        "flex flex-col bg-black/90 border border-white/10 rounded-xl overflow-hidden",
        isFullscreen ? "fixed inset-4 z-50" : "h-[600px]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
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
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Search"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* Copy */}
          <button
            onClick={copySelection}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Copy selection"
          >
            <Copy className="w-4 h-4 text-gray-400" />
          </button>

          {/* Download */}
          <button
            onClick={downloadBuffer}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Download buffer"
          >
            <Download className="w-4 h-4 text-gray-400" />
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4 text-gray-400" />
          </button>

          {/* Fullscreen */}
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

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2 bg-white/5 border-b border-white/10">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch(searchQuery);
                  }
                }}
                placeholder="Search in terminal..."
                className="w-full px-3 py-1 bg-white/10 border border-white/20 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal container */}
      <div className="flex-1 relative">
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-10">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-400 mb-2">Terminal Error</p>
              <p className="text-gray-400 text-sm">{error || 'Failed to connect'}</p>
            </div>
          </div>
        )}
        
        <div
          ref={terminalContainerRef}
          className="h-full w-full p-2"
          style={{ backgroundColor: THEMES[theme].background }}
        />
      </div>

      {/* Status bar */}
      <div className="px-4 py-1 bg-white/5 border-t border-white/10 text-xs text-gray-400 flex items-center justify-between">
        <span>Session: {actualSessionId || 'Connecting...'}</span>
        <span>{xtermRef.current ? `${xtermRef.current.cols}×${xtermRef.current.rows}` : ''}</span>
      </div>
    </motion.div>
  );
}
