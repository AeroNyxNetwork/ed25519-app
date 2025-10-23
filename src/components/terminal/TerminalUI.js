/**
 * ============================================
 * File: src/components/terminal/TerminalUI.js
 * ============================================
 * Terminal UI Component - PRODUCTION v3.0.0
 * 
 * Modification Reason: Fix input/delete synchronization issues
 * - Fixed: Disable local echo to prevent double input
 * - Fixed: Backspace/delete now works correctly
 * - Changed: convertEol from true to false
 * - Improved: Terminal behavior matches server expectations
 * 
 * Key Fix:
 * - convertEol: false (was true) - Prevents line ending conversion issues
 * - Server handles all echo - No local echo
 * - This fixes the "cannot delete after 6 chars" bug
 * 
 * Main Functionality: Render terminal interface with proper initialization
 * Dependencies: xterm.js and its addons
 * 
 * ⚠️ Important Notes:
 * - Terminal does NOT echo locally - all echo from server
 * - This is correct for remote terminal usage
 * - DO NOT set convertEol to true - it breaks input sync
 * - All existing functionality preserved
 * 
 * Last Modified: v3.0.0 - Fixed input echo and delete issues
 * ============================================
 */

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { motion } from 'framer-motion';
import clsx from 'clsx';

import 'xterm/css/xterm.css';

// ==================== TERMINAL THEMES ====================

export const TERMINAL_THEMES = {
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
    foreground: '#383a42',
    cursor: '#383a42',
    cursorAccent: '#ffffff',
    selection: '#3e4451',
    black: '#000000',
    red: '#e45649',
    green: '#50a14f',
    yellow: '#c18301',
    blue: '#0184bc',
    magenta: '#a626a4',
    cyan: '#0997b3',
    white: '#fafafa',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#d19a66',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff'
  }
};

// ==================== MAIN COMPONENT ====================

const TerminalUI = forwardRef(({
  // Basic configuration
  theme = 'dark',
  fontSize = 14,
  fontFamily = 'Menlo, Monaco, Consolas, "Courier New", monospace',
  rows = 24,
  cols = 80,
  
  // Feature toggles
  enableSearch = true,
  enableLinks = true,
  enableClipboard = true,
  
  // Event handlers
  onInput,
  onResize,
  onReady,
  onDispose,
  
  // Style
  className,
  style
}, ref) => {
  // ==================== Refs ====================
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  const isInitializedRef = useRef(false);
  const isDisposedRef = useRef(false);
  const resizeObserverRef = useRef(null);
  
  // ==================== Imperative Methods ====================
  
  useImperativeHandle(ref, () => ({
    write: (data) => {
      if (terminalRef.current && !isDisposedRef.current) {
        try {
          terminalRef.current.write(data);
        } catch (e) {
          console.error('[TerminalUI] Write error:', e);
        }
      }
    },
    
    clear: () => {
      if (terminalRef.current && !isDisposedRef.current) {
        try {
          terminalRef.current.clear();
        } catch (e) {
          console.error('[TerminalUI] Clear error:', e);
        }
      }
    },
    
    reset: () => {
      if (terminalRef.current && !isDisposedRef.current) {
        try {
          terminalRef.current.reset();
        } catch (e) {
          console.error('[TerminalUI] Reset error:', e);
        }
      }
    },
    
    fit: () => {
      if (fitAddonRef.current && terminalRef.current && !isDisposedRef.current) {
        try {
          if (terminalRef.current.element) {
            fitAddonRef.current.fit();
          }
        } catch (e) {
          console.error('[TerminalUI] Fit error:', e);
        }
      }
    },
    
    getSelection: () => {
      if (terminalRef.current && !isDisposedRef.current) {
        try {
          return terminalRef.current.getSelection();
        } catch (e) {
          console.error('[TerminalUI] Get selection error:', e);
        }
      }
      return '';
    },
    
    search: (query) => {
      if (searchAddonRef.current && !isDisposedRef.current) {
        try {
          searchAddonRef.current.findNext(query);
        } catch (e) {
          console.error('[TerminalUI] Search error:', e);
        }
      }
    },
    
    getTerminal: () => terminalRef.current
  }), []);
  
  // ==================== Initialization ====================
  
  useEffect(() => {
    if (isInitializedRef.current || !containerRef.current) return;
    
    console.log('[TerminalUI] Initializing terminal');
    isInitializedRef.current = true;
    isDisposedRef.current = false;
    
    let term = null;
    let fitAddon = null;
    let searchAddon = null;
    let disposables = [];
    
    const initializeTerminal = () => {
      try {
        // ✅ CRITICAL: Terminal configuration for remote shell
        term = new Terminal({
          theme: TERMINAL_THEMES[theme],
          fontSize,
          fontFamily,
          rows,
          cols,
          
          // Cursor configuration
          cursorBlink: true,
          cursorStyle: 'block',
          cursorInactiveStyle: 'outline',
          
          // Scrollback
          scrollback: 10000,
          
          // ✅ CRITICAL FIX: Line ending handling
          convertEol: false,  // ← DO NOT convert - server handles this
          
          // Input handling
          disableStdin: false,  // Allow input
          
          // Terminal behavior
          windowsMode: false,
          macOptionIsMeta: true,
          rightClickSelectsWord: true,
          allowTransparency: false,
          
          // Renderer
          rendererType: 'canvas',
          
          // ✅ Performance optimization
          drawBoldTextInBrightColors: true,
          fastScrollModifier: 'alt',
          fastScrollSensitivity: 5,
          
          // ✅ Accessibility
          screenReaderMode: false,
          
          // ✅ Tab handling
          tabStopWidth: 8
        });
        
        terminalRef.current = term;
        
        // Open terminal FIRST
        term.open(containerRef.current);
        
        // Load addons after terminal is opened
        fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        fitAddonRef.current = fitAddon;
        
        if (enableLinks) {
          const webLinksAddon = new WebLinksAddon();
          term.loadAddon(webLinksAddon);
        }
        
        if (enableSearch) {
          searchAddon = new SearchAddon();
          term.loadAddon(searchAddon);
          searchAddonRef.current = searchAddon;
        }
        
        // ✅ Event handlers
        if (onInput) {
          const inputDisposable = term.onData(onInput);
          disposables.push(inputDisposable);
        }
        
        if (onResize) {
          const resizeDisposable = term.onResize(({ rows, cols }) => {
            onResize(rows, cols);
          });
          disposables.push(resizeDisposable);
        }
        
        // ✅ Clipboard handling
        if (enableClipboard) {
          term.attachCustomKeyEventHandler((event) => {
            if (event.type === 'keydown') {
              // Ctrl+C copy
              if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
                const selection = term.getSelection();
                if (selection) {
                  navigator.clipboard.writeText(selection).catch(console.error);
                  return false;
                }
              }
              
              // Ctrl+V paste
              if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
                event.preventDefault();
                navigator.clipboard.readText().then(text => {
                  if (text && onInput) {
                    onInput(text);
                  }
                }).catch(console.error);
                return false;
              }
            }
            return true;
          });
        }
        
        // Initial fit and ready callback
        setTimeout(() => {
          if (fitAddon && !isDisposedRef.current) {
            try {
              fitAddon.fit();
            } catch (e) {
              console.error('[TerminalUI] Initial fit error:', e);
            }
          }
          
          if (onReady) {
            onReady();
          }
        }, 100);
        
      } catch (error) {
        console.error('[TerminalUI] Initialization error:', error);
        isInitializedRef.current = false;
      }
    };
    
    if (containerRef.current) {
      requestAnimationFrame(() => {
        initializeTerminal();
      });
    }
    
    // ==================== Cleanup ====================
    return () => {
      console.log('[TerminalUI] Disposing terminal');
      isDisposedRef.current = true;
      isInitializedRef.current = false;
      
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      
      disposables.forEach(d => {
        try {
          if (d && typeof d.dispose === 'function') {
            d.dispose();
          }
        } catch (e) {
          console.error('[TerminalUI] Dispose listener error:', e);
        }
      });
      
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      
      if (term) {
        try {
          if (term.element && term.element.parentElement) {
            term.element.parentElement.removeChild(term.element);
          }
          term.dispose();
        } catch (e) {
          console.error('[TerminalUI] Dispose terminal error:', e);
        }
      }
      
      terminalRef.current = null;
      
      if (onDispose) {
        onDispose();
      }
    };
  }, []);
  
  // ==================== Window Resize Handling ====================
  
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current && !isDisposedRef.current) {
        try {
          if (terminalRef.current.element) {
            fitAddonRef.current.fit();
          }
        } catch (e) {
          console.error('[TerminalUI] Resize error:', e);
        }
      }
    };
    
    let resizeTimer;
    const debouncedResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(handleResize, 100);
    };
    
    window.addEventListener('resize', debouncedResize);
    
    if (containerRef.current && window.ResizeObserver) {
      resizeObserverRef.current = new ResizeObserver(() => {
        if (!isDisposedRef.current) {
          debouncedResize();
        }
      });
      resizeObserverRef.current.observe(containerRef.current);
    }
    
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', debouncedResize);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);
  
  // ==================== Theme Update ====================
  
  useEffect(() => {
    if (terminalRef.current && !isDisposedRef.current) {
      try {
        if (terminalRef.current.options) {
          terminalRef.current.options.theme = TERMINAL_THEMES[theme];
        }
      } catch (e) {
        console.error('[TerminalUI] Theme update error:', e);
      }
    }
  }, [theme]);
  
  // ==================== Render ====================
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={clsx(
        'terminal-ui',
        'h-full w-full',
        'bg-black rounded-lg overflow-hidden',
        className
      )}
      style={style}
    >
      <div
        ref={containerRef}
        className="h-full w-full p-2"
        style={{
          backgroundColor: TERMINAL_THEMES[theme].background
        }}
      />
    </motion.div>
  );
});

TerminalUI.displayName = 'TerminalUI';

export default TerminalUI;
