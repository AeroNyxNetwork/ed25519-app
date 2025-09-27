/**
 * ============================================
 * File: src/components/terminal/TerminalUI.js
 * ============================================
 * Pure display terminal UI component
 * 
 * Responsibilities:
 * 1. Render terminal interface
 * 2. Handle user input
 * 3. Display terminal output
 * 4. No business logic, pure UI
 * 
 * Features:
 * - Rendered using xterm.js
 * - Fully controlled component
 * - Responsive design
 * - Theme support
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
  
  // Input deduplication (to prevent React StrictMode issues)
  const lastInputRef = useRef({ data: '', timestamp: 0 });
  const INPUT_DEBOUNCE_MS = 5;
  
  /**
   * Methods exposed to parent component
   */
  useImperativeHandle(ref, () => ({
    /**
     * Write data to terminal
     * @param {string} data - Data to display
     */
    write: (data) => {
      if (terminalRef.current && !terminalRef.current.disposed) {
        terminalRef.current.write(data);
      }
    },
    
    /**
     * Clear terminal content
     */
    clear: () => {
      if (terminalRef.current && !terminalRef.current.disposed) {
        terminalRef.current.clear();
      }
    },
    
    /**
     * Reset terminal
     */
    reset: () => {
      if (terminalRef.current && !terminalRef.current.disposed) {
        terminalRef.current.reset();
      }
    },
    
    /**
     * Resize terminal
     */
    fit: () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    },
    
    /**
     * Get selected text
     */
    getSelection: () => {
      if (terminalRef.current && !terminalRef.current.disposed) {
        return terminalRef.current.getSelection();
      }
      return '';
    },
    
    /**
     * Search text
     * @param {string} query - Search query
     */
    search: (query) => {
      if (searchAddonRef.current) {
        searchAddonRef.current.findNext(query);
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
    if (!containerRef.current) return;
    
    console.log('[TerminalUI] Initializing terminal');
    
    // Create terminal instance
    const term = new Terminal({
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
      allowTransparency: false
    });
    
    // Create addons
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;
    
    if (enableLinks) {
      const webLinksAddon = new WebLinksAddon();
      term.loadAddon(webLinksAddon);
    }
    
    if (enableSearch) {
      const searchAddon = new SearchAddon();
      term.loadAddon(searchAddon);
      searchAddonRef.current = searchAddon;
    }
    
    // Save reference
    terminalRef.current = term;
    
    // Open terminal
    term.open(containerRef.current);
    fitAddon.fit();
    
    // Set input handler (with deduplication)
    const inputDisposable = term.onData((data) => {
      const now = Date.now();
      
      // Check for duplicate input
      if (data === lastInputRef.current.data && 
          (now - lastInputRef.current.timestamp) < INPUT_DEBOUNCE_MS) {
        console.log('[TerminalUI] Blocked duplicate input');
        return;
      }
      
      lastInputRef.current = { data, timestamp: now };
      
      if (onInput) {
        onInput(data);
      }
    });
    
    // Set resize handler
    const resizeDisposable = term.onResize(({ rows, cols }) => {
      if (onResize) {
        onResize(rows, cols);
      }
    });
    
    // Set keyboard shortcuts
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
                // Use deduplication logic
                const now = Date.now();
                if (text !== lastInputRef.current.data || 
                    (now - lastInputRef.current.timestamp) >= INPUT_DEBOUNCE_MS) {
                  lastInputRef.current = { data: text, timestamp: now };
                  onInput(text);
                }
              }
            }).catch(console.error);
            return false;
          }
        }
        return true;
      });
    }
    
    // Notify ready
    if (onReady) {
      onReady();
    }
    
    // Cleanup function
    return () => {
      console.log('[TerminalUI] Disposing terminal');
      
      // Notify disposal
      if (onDispose) {
        onDispose();
      }
      
      // Clean up event listeners
      inputDisposable.dispose();
      resizeDisposable.dispose();
      
      // Dispose terminal
      if (!term.disposed) {
        term.dispose();
      }
      
      // Clear references
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      lastInputRef.current = { data: '', timestamp: 0 };
    };
  }, []); // Only initialize on component mount
  
  /**
   * Handle theme changes
   */
  useEffect(() => {
    if (terminalRef.current && !terminalRef.current.disposed) {
      terminalRef.current.setOption('theme', TERMINAL_THEMES[theme]);
    }
  }, [theme]);
  
  /**
   * Handle font size changes
   */
  useEffect(() => {
    if (terminalRef.current && !terminalRef.current.disposed) {
      terminalRef.current.setOption('fontSize', fontSize);
      if (fitAddonRef.current) {
        setTimeout(() => fitAddonRef.current.fit(), 100);
      }
    }
  }, [fontSize]);
  
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
    
    // Use ResizeObserver to monitor container size changes
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    // Monitor window size changes
    window.addEventListener('resize', handleResize);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
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
