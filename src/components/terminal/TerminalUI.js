/**
 * ============================================
 * File: src/components/terminal/TerminalUI.js
 * ============================================
 * Pure display terminal UI component - FIXED VERSION
 * 
 * Creation Reason: Fix terminal initialization errors
 * Modification Reason: Resolve setOption and dimensions errors
 * Main Functionality: Render terminal interface with proper initialization
 * Dependencies: xterm.js and its addons
 * 
 * Main Logical Flow:
 * 1. Initialize terminal instance with proper lifecycle management
 * 2. Ensure terminal is fully loaded before applying addons
 * 3. Handle resize events safely with dimension checks
 * 4. Properly cleanup on unmount
 * 
 * ⚠️ Important Note for Next Developer:
 * - Terminal must be fully initialized before any operations
 * - Always check terminal.element exists before operations
 * - FitAddon requires terminal to be opened first
 * - Dispose must be called carefully to avoid memory leaks
 * 
 * Last Modified: v2.0.0 - Fixed initialization and dimension errors
 * ============================================
 */

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { motion } from 'framer-motion';
import clsx from 'clsx';

// Import xterm styles
import 'xterm/css/xterm.css';

/**
 * Terminal theme configuration
 */
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

/**
 * Terminal UI component
 * Uses forwardRef to allow parent component to access methods
 */
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
  onInput,        // (data: string) => void
  onResize,       // (rows: number, cols: number) => void
  onReady,        // () => void
  onDispose,      // () => void
  
  // Style
  className,
  style
}, ref) => {
  // DOM references
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  const isInitializedRef = useRef(false);
  const isDisposedRef = useRef(false);
  const resizeObserverRef = useRef(null);
  
  /**
   * Methods exposed to parent component
   */
  useImperativeHandle(ref, () => ({
    /**
     * Write data to terminal
     * @param {string} data - Data to display
     */
    write: (data) => {
      if (terminalRef.current && !isDisposedRef.current) {
        try {
          terminalRef.current.write(data);
        } catch (e) {
          console.error('[TerminalUI] Write error:', e);
        }
      }
    },
    
    /**
     * Clear terminal content
     */
    clear: () => {
      if (terminalRef.current && !isDisposedRef.current) {
        try {
          terminalRef.current.clear();
        } catch (e) {
          console.error('[TerminalUI] Clear error:', e);
        }
      }
    },
    
    /**
     * Reset terminal
     */
    reset: () => {
      if (terminalRef.current && !isDisposedRef.current) {
        try {
          terminalRef.current.reset();
        } catch (e) {
          console.error('[TerminalUI] Reset error:', e);
        }
      }
    },
    
    /**
     * Resize terminal
     */
    fit: () => {
      if (fitAddonRef.current && terminalRef.current && !isDisposedRef.current) {
        try {
          // Check if terminal has element (is opened)
          if (terminalRef.current.element) {
            fitAddonRef.current.fit();
          }
        } catch (e) {
          console.error('[TerminalUI] Fit error:', e);
        }
      }
    },
    
    /**
     * Get selected text
     */
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
    
    /**
     * Search text
     * @param {string} query - Search query
     */
    search: (query) => {
      if (searchAddonRef.current && !isDisposedRef.current) {
        try {
          searchAddonRef.current.findNext(query);
        } catch (e) {
          console.error('[TerminalUI] Search error:', e);
        }
      }
    },
    
    /**
     * Get terminal instance (advanced usage)
     */
    getTerminal: () => terminalRef.current
  }), []);
  
  /**
   * Initialize terminal
   */
  useEffect(() => {
    // Prevent double initialization
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
        // Create terminal instance with safe defaults
        term = new Terminal({
          theme: TERMINAL_THEMES[theme],
          fontSize,
          fontFamily,
          rows,
          cols,
          cursorBlink: true,
          scrollback: 10000,
          convertEol: true,
          windowsMode: false,
          macOptionIsMeta: true,
          rightClickSelectsWord: true,
          allowTransparency: false,
          rendererType: 'canvas' // Use canvas renderer for better compatibility
        });
        
        // Store reference immediately
        terminalRef.current = term;
        
        // Open terminal in container FIRST before loading addons
        term.open(containerRef.current);
        
        // Now load addons after terminal is opened
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
        
        // Set up event handlers after terminal is opened
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
        
        // Handle clipboard
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
        
        // Perform initial fit after a short delay to ensure container dimensions are ready
        setTimeout(() => {
          if (fitAddon && !isDisposedRef.current) {
            try {
              fitAddon.fit();
            } catch (e) {
              console.error('[TerminalUI] Initial fit error:', e);
            }
          }
          
          // Notify ready after fit
          if (onReady) {
            onReady();
          }
        }, 100);
        
      } catch (error) {
        console.error('[TerminalUI] Initialization error:', error);
        isInitializedRef.current = false;
      }
    };
    
    // Initialize terminal after ensuring container is ready
    if (containerRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        initializeTerminal();
      });
    }
    
    // Cleanup function
    return () => {
      console.log('[TerminalUI] Disposing terminal');
      isDisposedRef.current = true;
      isInitializedRef.current = false;
      
      // Clear resize observer
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      
      // Dispose event listeners
      disposables.forEach(d => {
        try {
          if (d && typeof d.dispose === 'function') {
            d.dispose();
          }
        } catch (e) {
          console.error('[TerminalUI] Dispose listener error:', e);
        }
      });
      
      // Clear addon references
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      
      // Dispose terminal last
      if (term) {
        try {
          // Ensure terminal is properly closed before disposal
          if (term.element && term.element.parentElement) {
            term.element.parentElement.removeChild(term.element);
          }
          term.dispose();
        } catch (e) {
          console.error('[TerminalUI] Dispose terminal error:', e);
        }
      }
      
      // Clear terminal reference
      terminalRef.current = null;
      
      // Notify disposal
      if (onDispose) {
        onDispose();
      }
    };
  }, []); // Empty deps - only run once
  
  /**
   * Handle window resize
   */
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current && !isDisposedRef.current) {
        try {
          // Ensure terminal is opened and has element
          if (terminalRef.current.element) {
            fitAddonRef.current.fit();
          }
        } catch (e) {
          console.error('[TerminalUI] Resize error:', e);
        }
      }
    };
    
    // Debounce resize
    let resizeTimer;
    const debouncedResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(handleResize, 100);
    };
    
    window.addEventListener('resize', debouncedResize);
    
    // Also observe container size changes
    if (containerRef.current && window.ResizeObserver) {
      resizeObserverRef.current = new ResizeObserver(() => {
        // Check if not disposed
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
  
  /**
   * Update theme when prop changes
   */
  useEffect(() => {
    if (terminalRef.current && !isDisposedRef.current) {
      try {
        // Use options property instead of setOption
        if (terminalRef.current.options) {
          terminalRef.current.options.theme = TERMINAL_THEMES[theme];
        }
      } catch (e) {
        console.error('[TerminalUI] Theme update error:', e);
      }
    }
  }, [theme]);
  
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
