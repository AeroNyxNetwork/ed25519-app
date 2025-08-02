/**
 * Web Terminal Component using xterm.js
 * 
 * File Path: src/components/terminal/WebTerminal.js
 * 
 * Full-featured terminal emulator for remote node access
 * 
 * @version 1.2.0
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
  
  // Add ref to track initialization
  const initializationRef = useRef(false);
  const terminalInstanceRef = useRef(null);

  // Initialize terminal
  useEffect(() => {
    if (!terminalContainerRef.current || !isEnabled || !onInit) return;
    
    // Prevent multiple initializations
    if (initializationRef.current) {
      console.log('[WebTerminal] Already initialized, skipping...');
      return;
    }

    console.log('[WebTerminal] Initializing terminal');
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

    // Set up event handlers
    term.onData(data => {
      if (onInput && actualSessionId) {
        // Send raw data directly - backend expects raw terminal input
        onInput(actualSessionId, data);
      }
    });

    term.onResize(({ cols, rows }) => {
      console.log('[WebTerminal] Terminal resized:', cols, rows);
      if (onResize && actualSessionId) {
        onResize(actualSessionId, rows, cols);
      }
    });

    // Handle paste
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown') {
        // Ctrl+V or Cmd+V
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
        // Ctrl+C
        if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
          const selection = term.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection).catch(err => {
              console.error('[WebTerminal] Failed to copy to clipboard:', err);
            });
            return false;
          }
        }
      }
      return true;
    });

    // Initialize terminal session
    const initializeSession = async () => {
      try {
        const serverSessionId = await onInit({
          rows: term.rows,
          cols: term.cols,
          onOutput: (data) => {
            // Handle output data - it might be base64 encoded or raw
            if (data) {
              // Check if it's base64 encoded (only alphanumeric, +, /, and = padding)
              if (/^[A-Za-z0-9+/]+=*$/.test(data) && data.length % 4 === 0) {
                try {
                  const decoded = atob(data);
                  term.write(decoded);
                } catch (err) {
                  // If base64 decode fails, write raw data
                  term.write(data);
                }
              } else {
                // Write raw data directly
                term.write(data);
              }
            }
          },
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
            // Store the actual session ID returned by server
            console.log('[WebTerminal] Terminal ready with session ID:', data.session_id);
            setActualSessionId(data.session_id);
          }
        });
        
        setStatus('ready');
        setActualSessionId(serverSessionId);
        term.focus();
      } catch (err) {
        console.error('[WebTerminal] Failed to initialize terminal:', err);
        setError(err.message);
        setStatus('error');
        initializationRef.current = false; // Allow retry on error
      }
    };

    initializeSession();

    // Cleanup
    return () => {
      console.log('[WebTerminal] Cleaning up terminal');
      initializationRef.current = false;
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose();
        terminalInstanceRef.current = null;
      }
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [isEnabled, nodeReference]); // Remove dependencies that cause re-initialization

  // Handle resize
  useEffect(() => {
    if (!fitAddonRef.current || !xtermRef.current) return;

    const handleResize = () => {
      fitAddonRef.current.fit();
    };

    window.addEventListener('resize', handleResize);
    
    // Use ResizeObserver for more accurate resizing
    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current.fit();
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
        // Show success feedback
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

  // Search in terminal
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
