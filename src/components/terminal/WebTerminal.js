/**
 * WebTerminal Component - Fixed Version
 * File: src/components/terminal/WebTerminal.js
 * 
 * 修复了无限循环和初始化问题
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  }
};

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
  const terminalContainerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  
  // State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState(null);
  const [sessionId, setSessionId] = useState(propSessionId);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Track initialization
  const isInitializedRef = useRef(false);
  const initPromiseRef = useRef(null);
  
  // Memoize callbacks to prevent recreation
  const memoizedOnInit = useMemo(() => onInit, []);
  const memoizedOnInput = useMemo(() => onInput, []);
  const memoizedOnResize = useMemo(() => onResize, []);

  // Initialize terminal once
  useEffect(() => {
    if (!terminalContainerRef.current || !isEnabled || isInitializedRef.current) {
      return;
    }

    console.log('[WebTerminal] Starting initialization for node:', nodeReference);
    isInitializedRef.current = true;
    
    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      theme: THEMES.dark,
      scrollback: 10000,
      convertEol: true
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Open terminal
    term.open(terminalContainerRef.current);
    fitAddon.fit();

    // Initialize session
    const initSession = async () => {
      if (initPromiseRef.current) {
        return initPromiseRef.current;
      }

      setStatus('connecting');
      
      initPromiseRef.current = (async () => {
        try {
          // Set up handlers
          const handleOutput = (data) => {
            if (!data) return;
            if (typeof data === 'string') {
              term.write(data);
            }
          };

          const handleError = (err) => {
            console.error('[WebTerminal] Error:', err);
            setError(err);
            setStatus('error');
          };

          const handleClose = () => {
            console.log('[WebTerminal] Closed');
            setStatus('closed');
          };

          const handleReady = (data) => {
            console.log('[WebTerminal] Ready:', data);
            const sid = data?.session_id || propSessionId;
            setSessionId(sid);
            setStatus('ready');
            term.write('\x1b[32m● Connected to ' + nodeReference + '\x1b[0m\r\n\r\n');
          };

          // Call onInit
          if (memoizedOnInit) {
            const result = await memoizedOnInit({
              rows: term.rows,
              cols: term.cols,
              onOutput: handleOutput,
              onError: handleError,
              onClose: handleClose,
              onReady: handleReady
            });

            console.log('[WebTerminal] Init result:', result);
            
            if (result) {
              setSessionId(result);
              if (!status || status === 'connecting') {
                setStatus('ready');
              }
            }
          }

          // Set up terminal input handler
          term.onData((data) => {
            const sid = sessionId || propSessionId;
            if (memoizedOnInput && sid && sid !== 'pending') {
              memoizedOnInput(sid, data);
            }
          });

          // Set up resize handler
          term.onResize(({ cols, rows }) => {
            const sid = sessionId || propSessionId;
            if (memoizedOnResize && sid && sid !== 'pending') {
              memoizedOnResize(sid, rows, cols);
            }
          });

        } catch (err) {
          console.error('[WebTerminal] Init failed:', err);
          setError(err.message);
          setStatus('error');
        } finally {
          initPromiseRef.current = null;
        }
      })();

      return initPromiseRef.current;
    };

    initSession();

    // Cleanup
    return () => {
      console.log('[WebTerminal] Cleanup');
      isInitializedRef.current = false;
      initPromiseRef.current = null;
      
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
  }, [isEnabled]); // Only depend on isEnabled

  // Window resize handler
  useEffect(() => {
    if (!fitAddonRef.current) return;

    const handleResize = () => {
      fitAddonRef.current?.fit();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update sessionId when prop changes
  useEffect(() => {
    if (propSessionId && propSessionId !== 'pending') {
      setSessionId(propSessionId);
    }
  }, [propSessionId]);

  // Actions
  const copySelection = useCallback(() => {
    const selection = terminalRef.current?.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
      terminalRef.current.clearSelection();
    }
  }, []);

  const clearTerminal = useCallback(() => {
    terminalRef.current?.clear();
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
    a.click();
    URL.revokeObjectURL(url);
  }, [nodeReference]);

  if (!isEnabled) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
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
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Search"
          >
            <Search className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={copySelection}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Copy"
          >
            <Copy className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={downloadBuffer}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={clearTerminal}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Clear"
          >
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Fullscreen"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-gray-400" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Search */}
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
                  if (e.key === 'Enter' && terminalRef.current) {
                    // Search implementation would go here
                  }
                }}
                placeholder="Search..."
                className="w-full px-3 py-1 bg-white/10 border border-white/20 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal */}
      <div className="flex-1 relative">
        {status === 'error' && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur z-10 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-400">{error || 'Connection failed'}</p>
            </div>
          </div>
        )}
        
        <div
          ref={terminalContainerRef}
          className="h-full w-full p-2"
          style={{ backgroundColor: '#1e1e1e' }}
        />
      </div>

      {/* Status bar */}
      <div className="px-4 py-1 bg-white/5 border-t border-white/10 text-xs text-gray-400 flex justify-between">
        <span>Session: {sessionId || 'Connecting...'}</span>
        <span>{terminalRef.current ? `${terminalRef.current.cols}×${terminalRef.current.rows}` : ''}</span>
      </div>
    </motion.div>
  );
}
