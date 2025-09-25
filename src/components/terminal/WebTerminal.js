/**
 * WebTerminal Component - Complete Implementation
 * File: src/components/terminal/WebTerminal.js
 * 
 * 完整的Web终端实现，支持xterm.js和远程节点管理
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
  Loader2,
  RefreshCw,
  Search
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
  sessionId: initialSessionId,
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
  // DOM refs
  const terminalContainerRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  
  // State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [status, setStatus] = useState('connecting'); // connecting, ready, error, closed
  const [error, setError] = useState(null);
  const [actualSessionId, setActualSessionId] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Initialization tracking
  const initializationRef = useRef(false);
  const outputHandlerRef = useRef(null);
  
  // Store callback refs to avoid stale closures
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  
  useEffect(() => {
    onInputRef.current = onInput;
    onResizeRef.current = onResize;
  }, [onInput, onResize]);

  // Initialize terminal
  useEffect(() => {
    if (!terminalContainerRef.current || !isEnabled || !onInit || initializationRef.current) {
      return;
    }

    console.log('[WebTerminal] Initializing for node:', nodeReference);
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

    // Create and load addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    // Store references
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Open terminal in container
    term.open(terminalContainerRef.current);
    fitAddon.fit();

    // Handle terminal input
    term.onData(data => {
      const currentSessionId = actualSessionId || initialSessionId;
      const currentOnInput = onInputRef.current;
      
      if (currentOnInput && currentSessionId && currentSessionId !== 'pending') {
        console.log('[WebTerminal] Sending input:', data.length, 'bytes');
        currentOnInput(currentSessionId, data);
      }
    });

    // Handle terminal resize
    term.onResize(({ cols, rows }) => {
      const currentSessionId = actualSessionId || initialSessionId;
      const currentOnResize = onResizeRef.current;
      
      if (currentOnResize && currentSessionId && currentSessionId !== 'pending') {
        console.log('[WebTerminal] Terminal resized to:', cols, 'x', rows);
        currentOnResize(currentSessionId, rows, cols);
      }
    });

    // Handle keyboard shortcuts
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown') {
        // Ctrl+C for copy when there's selection
        if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
          const selection = term.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection).catch(err => {
              console.error('[WebTerminal] Failed to copy:', err);
            });
            return false;
          }
        }
        // Ctrl+V for paste
        if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
          navigator.clipboard.readText().then(text => {
            if (text && actualSessionId && onInputRef.current) {
              onInputRef.current(actualSessionId, text);
            }
          }).catch(err => {
            console.error('[WebTerminal] Failed to paste:', err);
          });
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

    // Initialize session
    const initializeSession = async () => {
      try {
        setStatus('connecting');
        
        // Define output handler
        const handleOutput = (data) => {
          console.log('[WebTerminal] Output received:', {
            type: typeof data,
            length: data?.length,
            preview: data ? data.substring(0, 50) : null
          });
          
          if (!data) return;
          
          // Data is already raw text from server
          if (typeof data === 'string') {
            term.write(data);
          } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
            const decoder = new TextDecoder();
            term.write(decoder.decode(data));
          }
        };

        outputHandlerRef.current = handleOutput;

        // Call onInit with callbacks
        const serverSessionId = await onInit({
          rows: term.rows,
          cols: term.cols,
          onOutput: handleOutput,
          onError: (error) => {
            console.error('[WebTerminal] Error:', error);
            setError(error);
            setStatus('error');
            term.write(`\r\n\x1b[31m● Error: ${error}\x1b[0m\r\n`);
          },
          onClose: () => {
            console.log('[WebTerminal] Session closed');
            setStatus('closed');
            term.write('\r\n\x1b[33m● Session closed\x1b[0m\r\n');
          },
          onReady: (data) => {
            console.log('[WebTerminal] Session ready:', data);
            const sessionId = data?.session_id || serverSessionId;
            setActualSessionId(sessionId);
            setStatus('ready');
            
            // Show welcome message
            term.write('\x1b[2J\x1b[H'); // Clear screen
            term.write(`\x1b[32m● Terminal connected to ${nodeReference}\x1b[0m\r\n`);
            term.write(`\x1b[90mSession: ${sessionId}\x1b[0m\r\n`);
            term.write('\x1b[90m─────────────────────────────────────────\x1b[0m\r\n\r\n');
            
            term.focus();
          }
        });

        console.log('[WebTerminal] Session init requested:', serverSessionId);
        
        // Fallback if onReady not called
        if (serverSessionId && !actualSessionId) {
          setActualSessionId(serverSessionId);
          setTimeout(() => {
            if (status === 'connecting') {
              setStatus('ready');
              term.write('\x1b[32m● Ready\x1b[0m\r\n\r\n');
            }
          }, 3000);
        }

      } catch (err) {
        console.error('[WebTerminal] Init failed:', err);
        setError(err.message);
        setStatus('error');
        term.write(`\r\n\x1b[31m● Failed: ${err.message}\x1b[0m\r\n`);
        initializationRef.current = false;
      }
    };

    initializeSession();

    // Cleanup
    return () => {
      console.log('[WebTerminal] Cleaning up');
      initializationRef.current = false;
      outputHandlerRef.current = null;
      
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [isEnabled, nodeReference, onInit, theme, fontSize, fontFamily, status, actualSessionId, initialSessionId]);

  // Handle window resize
  useEffect(() => {
    if (!fitAddonRef.current || !terminalContainerRef.current) return;

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    });

    resizeObserver.observe(terminalContainerRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, []);

  // Terminal actions
  const copySelection = useCallback(() => {
    if (!xtermRef.current) return;
    
    const selection = xtermRef.current.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).then(() => {
        xtermRef.current.clearSelection();
      }).catch(err => {
        console.error('[WebTerminal] Copy failed:', err);
      });
    }
  }, []);

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

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
    setTimeout(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }, 300);
  }, []);

  const handleSearch = useCallback((query) => {
    if (!searchAddonRef.current || !query) return;
    searchAddonRef.current.findNext(query);
  }, []);

  const clearTerminal = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  }, []);

  const resetTerminal = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.reset();
    }
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
          {status === 'closed' && (
            <div className="w-2 h-2 bg-gray-400 rounded-full" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Search (Ctrl+F)"
          >
            <Search className="w-4 h-4 text-gray-400" />
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

          {/* Clear */}
          <button
            onClick={clearTerminal}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Clear terminal"
          >
            <RefreshCw className="w-4 h-4 text-gray-400" />
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
                  } else if (e.key === 'Escape') {
                    setShowSearch(false);
                    setSearchQuery('');
                  }
                }}
                placeholder="Search in terminal..."
                className="w-full px-3 py-1 bg-white/10 border border-white/20 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                autoFocus
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
              <button
                onClick={() => {
                  initializationRef.current = false;
                  setStatus('connecting');
                  setError(null);
                  window.location.reload();
                }}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-sm"
              >
                Retry
              </button>
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
        <span>
          {status === 'ready' && xtermRef.current ? 
            `${xtermRef.current.cols}×${xtermRef.current.rows}` : 
            status.charAt(0).toUpperCase() + status.slice(1)
          }
        </span>
      </div>
    </motion.div>
  );
}
