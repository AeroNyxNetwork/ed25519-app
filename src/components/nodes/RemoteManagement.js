/**
 * ============================================
 * File: src/components/nodes/RemoteManagement.js
 * ============================================
 * Remote Management Component with Centralized JWT Authentication
 * 
 * Creation Reason: Provide terminal interface for remote nodes
 * Modification Reason: Fix component unmounting during initialization
 * Main Functionality: Terminal UI with stable initialization
 * Dependencies: TerminalUI, useRemoteManagement hook, remoteAuthService
 * 
 * Main Logical Flow:
 * 1. Get signature from wallet (via useGlobalSignature)
 * 2. Authenticate via RemoteAuthService
 * 3. Initialize terminal session ONCE with proper cleanup
 * 4. Handle terminal I/O
 * 
 * ⚠️ Important Notes:
 * - CRITICAL FIX: Prevent duplicate initialization and premature cleanup
 * - Use abort controller for cleanup
 * - Track initialization state properly
 * - Terminal output comes through WebSocket messages
 * 
 * Last Modified: v5.0.0 - Fixed initialization and unmounting issues
 * ============================================
 */

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal as TerminalIcon, 
  X, 
  Maximize2, 
  Minimize2,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Wifi,
  WifiOff,
  Command,
  FileText,
  ChevronRight,
  Trash2,
  Key,
  Shield,
  Clock
} from 'lucide-react';
import clsx from 'clsx';

// Import the terminal UI component
import TerminalUI from '../terminal/TerminalUI';

// Import the hook
import { useRemoteManagement } from '../../hooks/useRemoteManagement';

// Import services
import remoteAuthService from '../../services/RemoteAuthService';
import webSocketService from '../../services/WebSocketService';
import { useGlobalSignature } from '../../hooks/useGlobalSignature';

export default function RemoteManagement({ nodeReference, isOpen, onClose }) {
  // ==================== Authentication State ====================
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authRetryCount, setAuthRetryCount] = useState(0);
  
  // Get signature for JWT
  const {
    signature,
    message,
    ensureSignature,
    isLoading: isSignatureLoading,
    error: signatureError,
    remainingTimeFormatted,
    walletAddress
  } = useGlobalSignature();
  
  // Use the remote management hook
  const {
    terminalSession,
    terminalReady: hookTerminalReady,
    isConnecting: hookIsConnecting,
    error: hookError,
    isNodeOnline: hookIsNodeOnline,
    isWebSocketReady,
    isRemoteAuthenticated,
    initializeTerminal,
    sendTerminalInput,
    closeTerminal,
    executeCommand,
    reconnectTerminal,
    tokenExpiry,
    nodes
  } = useRemoteManagement(nodeReference);
  
  // Use hook's determination of node status
  const isNodeOnline = hookIsNodeOnline;

  // ==================== Local State ====================
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [localTerminalReady, setLocalTerminalReady] = useState(false);
  const [initRetryCount, setInitRetryCount] = useState(0);
  
  // Track if terminal UI has been initialized
  const [terminalUIReady, setTerminalUIReady] = useState(false);

  // Refs
  const terminalRef = useRef(null);
  const outputBufferRef = useRef('');
  const initTimeoutRef = useRef(null);
  const authTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const messageListenerRef = useRef(null);
  const lastOutputRef = useRef('');
  
  // CRITICAL FIX: Track initialization state properly
  const initializingRef = useRef(false);
  const initializedRef = useRef(false);
  const abortControllerRef = useRef(null);
  
  // CRITICAL FIX: Use ref to store current terminal state to avoid closure issues
  const terminalStateRef = useRef({
    session: null,
    ready: false,
    hookReady: false,
    localReady: false,
    uiReady: false
  });

  // Combine terminal ready states
  const terminalReady = terminalSession && hookTerminalReady && localTerminalReady && terminalUIReady;
  
  // Update ref whenever states change to avoid closure issues
  useEffect(() => {
    terminalStateRef.current = {
      session: terminalSession,
      ready: terminalReady,
      hookReady: hookTerminalReady,
      localReady: localTerminalReady,
      uiReady: terminalUIReady
    };
    console.log('[RemoteManagement] Terminal state ref updated:', terminalStateRef.current);
  }, [terminalSession, hookTerminalReady, localTerminalReady, terminalUIReady, terminalReady]);

  // ==================== Authentication ====================
  
  /**
   * Perform JWT authentication via centralized service
   */
  const performAuthentication = useCallback(async () => {
    if (remoteAuthService.isAuthenticated(nodeReference)) {
      console.log('[RemoteManagement] Already authenticated for node:', nodeReference);
      return true;
    }
    
    if (isAuthenticating) {
      console.log('[RemoteManagement] Authentication already in progress');
      return false;
    }
    
    setIsAuthenticating(true);
    setAuthError(null);
    
    try {
      console.log('[RemoteManagement] Starting authentication for node:', nodeReference);
      
      const signatureData = await ensureSignature();
      
      if (!signatureData || !signatureData.signature || !signatureData.message) {
        throw new Error('Failed to obtain wallet signature');
      }
      
      console.log('[RemoteManagement] Got signature, authenticating with RemoteAuthService');
      
      const authResult = await remoteAuthService.authenticate({
        nodeReference,
        walletAddress,
        signature: signatureData.signature,
        message: signatureData.message,
        walletType: 'okx'
      });
      
      if (!authResult.success) {
        throw new Error(authResult.error || 'Authentication failed');
      }
      
      console.log('[RemoteManagement] Authentication successful');
      setIsAuthenticating(false);
      setAuthRetryCount(0);
      
      return true;
      
    } catch (error) {
      console.error('[RemoteManagement] Authentication failed:', error);
      setAuthError(error.message);
      setIsAuthenticating(false);
      
      setAuthRetryCount(prev => prev + 1);
      
      if (authRetryCount < 3 && error.message.includes('WebSocket not authenticated')) {
        console.log('[RemoteManagement] Will retry authentication in 2 seconds...');
        authTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            performAuthentication();
          }
        }, 2000);
      }
      
      return false;
    }
  }, [nodeReference, walletAddress, ensureSignature, isAuthenticating, authRetryCount]);

  // ==================== Initialization ====================
  
  /**
   * Initialize terminal after authentication - FIXED VERSION
   */
  const initializeTerminalWithAuth = useCallback(async () => {
    // Prevent duplicate initialization
    if (initializingRef.current || initializedRef.current) {
      console.log('[RemoteManagement] Already initializing or initialized');
      return null;
    }
    
    if (!isMountedRef.current) {
      console.log('[RemoteManagement] Component not mounted');
      return null;
    }
    
    initializingRef.current = true;
    
    // Create abort controller for this initialization
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    try {
      console.log('[RemoteManagement] Initializing terminal with auth check');
      
      // Check if aborted
      if (signal.aborted) {
        console.log('[RemoteManagement] Initialization aborted');
        return null;
      }
      
      // Step 1: Ensure authenticated
      const authSuccess = await performAuthentication();
      if (!authSuccess) {
        console.log('[RemoteManagement] Authentication failed, cannot initialize terminal');
        return null;
      }
      
      // Check if aborted
      if (signal.aborted) {
        console.log('[RemoteManagement] Initialization aborted after auth');
        return null;
      }
      
      // Step 2: Wait for auth to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if aborted
      if (signal.aborted) {
        console.log('[RemoteManagement] Initialization aborted after wait');
        return null;
      }
      
      // Step 3: Initialize terminal
      const result = await initializeTerminal();
      
      if (result && result.sessionId && !signal.aborted) {
        console.log('[RemoteManagement] Terminal initialized:', result.sessionId);
        setLocalTerminalReady(true);
        setInitRetryCount(0);
        initializedRef.current = true;
        
        return result;
      }
      
      return null;
      
    } catch (error) {
      console.error('[RemoteManagement] Terminal initialization failed:', error);
      setAuthError(error.message);
      
      // Retry logic
      if (initRetryCount < 5 && isMountedRef.current && !signal.aborted) {
        setInitRetryCount(prev => prev + 1);
        initTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            initializingRef.current = false;
            initializeTerminalWithAuth();
          }
        }, 3000);
      }
      
      return null;
    } finally {
      initializingRef.current = false;
    }
  }, [performAuthentication, initializeTerminal, initRetryCount]);

  // ==================== Effects ====================
  
  // Initialize when modal opens - FIXED VERSION
  useEffect(() => {
    if (!isOpen) return;
    
    // Only initialize once per modal open
    if (!initializedRef.current && !initializingRef.current) {
      console.log('[RemoteManagement] Modal opened, starting initialization');
      
      const init = async () => {
        // Check prerequisites
        if (!isNodeOnline) {
          console.log('[RemoteManagement] Node is offline');
          setAuthError('Node is offline');
          return;
        }
        
        if (!isWebSocketReady) {
          console.log('[RemoteManagement] WebSocket not ready, waiting...');
          if (initRetryCount < 10) {
            initTimeoutRef.current = setTimeout(() => {
              if (isMountedRef.current && !initializedRef.current) {
                setInitRetryCount(prev => prev + 1);
                init();
              }
            }, 2000);
          }
          return;
        }
        
        // Initialize terminal with authentication
        await initializeTerminalWithAuth();
      };
      
      // Delay initialization slightly to ensure component is stable
      initTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && !initializedRef.current) {
          init();
        }
      }, 100);
    }
    
    // Cleanup function - only run when modal is closing
    return () => {
      // Clear pending timeouts
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
        authTimeoutRef.current = null;
      }
    };
  }, [isOpen]); // Simplified dependencies to prevent re-runs

  // ==================== WebSocket Message Handling ====================
  
  // Listen for terminal output from WebSocket
  useEffect(() => {
    if (!isOpen || !terminalSession) return;

    const handleTerminalOutput = (message) => {
      if (message.session_id !== terminalSession) return;
      
      console.log('[RemoteManagement] Received terminal output:', message.data?.length || 0, 'bytes');
      
      if (message.data) {
        // Check if this is duplicate output
        if (lastOutputRef.current === message.data) {
          console.log('[RemoteManagement] Skipping duplicate output');
          return;
        }
        lastOutputRef.current = message.data;
        
        if (terminalRef.current && terminalUIReady) {
          try {
            terminalRef.current.write(message.data);
          } catch (error) {
            console.error('[RemoteManagement] Error writing to terminal:', error);
            outputBufferRef.current += message.data;
          }
        } else {
          // Buffer output if terminal UI isn't ready
          outputBufferRef.current += message.data;
        }
      }
    };

    const handleTerminalError = (message) => {
      if (message.session_id !== terminalSession) return;
      
      console.error('[RemoteManagement] Terminal error:', message);
      
      if (terminalRef.current && terminalUIReady) {
        terminalRef.current.write('\r\n\x1b[31m● Error: ' + (message.error || message.message) + '\x1b[0m\r\n');
      }
      
      // Clear authentication on certain errors
      if (message.code === 'INVALID_JWT' || message.code === 'AUTH_FAILED') {
        remoteAuthService.clearToken(nodeReference);
      }
    };

    const handleTerminalClosed = (message) => {
      if (message.session_id !== terminalSession) return;
      
      console.log('[RemoteManagement] Terminal closed');
      
      if (terminalRef.current && terminalUIReady) {
        terminalRef.current.write('\r\n\x1b[33m● Session closed by remote host\x1b[0m\r\n');
      }
      
      setLocalTerminalReady(false);
      setTerminalUIReady(false);
    };

    // Use WebSocket service event emitter
    webSocketService.on('terminalOutput', handleTerminalOutput);
    webSocketService.on('terminalError', handleTerminalError);
    webSocketService.on('terminalClosed', handleTerminalClosed);

    // Also listen to raw WebSocket for compatibility
    const handleRawMessage = (event) => {
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        
        if (message.type === 'term_output') {
          handleTerminalOutput(message);
        } else if (message.type === 'term_error') {
          handleTerminalError(message);
        } else if (message.type === 'term_closed') {
          handleTerminalClosed(message);
        }
      } catch (error) {
        // Not JSON or parse error, ignore
      }
    };

    const ws = window.globalWebSocket || webSocketService.ws;
    if (ws && ws.addEventListener) {
      messageListenerRef.current = handleRawMessage;
      ws.addEventListener('message', handleRawMessage);
    }

    return () => {
      webSocketService.off('terminalOutput', handleTerminalOutput);
      webSocketService.off('terminalError', handleTerminalError);
      webSocketService.off('terminalClosed', handleTerminalClosed);
      
      if (ws && ws.removeEventListener && messageListenerRef.current) {
        ws.removeEventListener('message', messageListenerRef.current);
      }
    };
  }, [isOpen, terminalSession, nodeReference, terminalUIReady]);

  // ==================== Terminal Handlers ====================
  
  // Handle terminal UI ready
  const handleTerminalUIReady = useCallback(() => {
    console.log('[RemoteManagement] Terminal UI is ready');
    setTerminalUIReady(true);
    
    // Get current state from ref
    const currentState = terminalStateRef.current;
    
    // Write welcome message when UI is ready and we have a session
    if (currentState.session && terminalRef.current) {
      terminalRef.current.write('\x1b[32m● Terminal Connected\x1b[0m\r\n');
      terminalRef.current.write('\x1b[90mNode: ' + nodeReference + '\x1b[0m\r\n');
      terminalRef.current.write('\x1b[90mSession: ' + currentState.session + '\x1b[0m\r\n');
      terminalRef.current.write('\x1b[90m─────────────────────────────────────────\x1b[0m\r\n');
      
      // Flush any buffered output
      if (outputBufferRef.current) {
        try {
          terminalRef.current.write(outputBufferRef.current);
          outputBufferRef.current = '';
        } catch (error) {
          console.error('[RemoteManagement] Error writing buffered output:', error);
        }
      }
    }
  }, [nodeReference]);

  // Handle terminal input - Fixed to avoid closure issues
  const handleTerminalInput = useCallback((data) => {
    // Use ref to get current state instead of closure values
    const currentState = terminalStateRef.current;
    
    console.log('[RemoteManagement] handleTerminalInput called');
    console.log('[RemoteManagement] Current states from ref:', currentState);
    
    if (currentState.session && currentState.hookReady) {
      console.log('[RemoteManagement] Sending input:', data.length, 'bytes');
      sendTerminalInput(data);
    } else {
      console.warn('[RemoteManagement] Cannot send input - terminal not ready');
      console.log('[RemoteManagement] Debug - session:', currentState.session, 'hookReady:', currentState.hookReady);
    }
  }, [sendTerminalInput]); // Only depend on sendTerminalInput

  // ==================== Terminal Actions ====================
  
  // Copy terminal content
  const copyTerminalContent = useCallback(() => {
    if (terminalRef.current) {
      const selection = terminalRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(console.error);
      }
    }
  }, []);

  // Clear terminal
  const clearTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.clear();
      lastOutputRef.current = '';
    }
  }, []);

  // Reset terminal
  const resetTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.reset();
      lastOutputRef.current = '';
    }
  }, []);

  // Retry connection
  const handleRetryConnection = useCallback(async () => {
    console.log('[RemoteManagement] Retrying connection');
    
    // Reset state
    setInitRetryCount(0);
    setAuthRetryCount(0);
    setLocalTerminalReady(false);
    setTerminalUIReady(false);
    setAuthError(null);
    outputBufferRef.current = '';
    lastOutputRef.current = '';
    initializedRef.current = false;
    initializingRef.current = false;
    
    // Clear auth token for this node
    remoteAuthService.clearToken(nodeReference);
    
    // Close any existing terminal session
    if (terminalSession) {
      closeTerminal();
    }
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Reinitialize
    await initializeTerminalWithAuth();
  }, [nodeReference, terminalSession, closeTerminal, initializeTerminalWithAuth]);

  // ==================== Quick Commands ====================
  
  const quickCommands = [
    { label: 'List Files', command: 'ls -la', icon: FileText },
    { label: 'System Info', command: 'uname -a', icon: Wifi },
    { label: 'Process List', command: 'ps aux | head -20', icon: Command },
    { label: 'Network Info', command: 'ip addr', icon: Wifi },
    { label: 'Disk Usage', command: 'df -h', icon: FileText },
    { label: 'Memory Info', command: 'free -h', icon: FileText },
    { label: 'Docker Status', command: 'docker ps', icon: Command },
    { label: 'Clear Screen', command: 'clear', icon: Trash2 }
  ];

  // Execute quick command
  const executeQuickCommand = useCallback((command) => {
    if (terminalSession && hookTerminalReady) {
      const commandWithNewline = command.endsWith('\n') ? command : `${command}\n`;
      sendTerminalInput(commandWithNewline);
      setShowCommandPalette(false);
    }
  }, [terminalSession, hookTerminalReady, sendTerminalInput]);

  // ==================== Keyboard Handlers ====================
  
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (showCommandPalette) {
          setShowCommandPalette(false);
        }
      } else if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyPress);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [isOpen, isFullscreen, showCommandPalette]);

  // ==================== Cleanup ====================
  
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      
      // Abort any pending initialization
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Cleanup on close - FIXED VERSION to prevent premature cleanup
  useEffect(() => {
    // Only run cleanup when modal is actually closing
    if (isOpen) return;
    
    // Only cleanup if we actually had a session
    if (!initializedRef.current) return;
    
    console.log('[RemoteManagement] Modal closed, cleaning up');
    
    // Abort any pending initialization
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Close terminal session
    if (terminalSession) {
      closeTerminal();
    }
    
    // Reset state for next open
    setLocalTerminalReady(false);
    setTerminalUIReady(false);
    setInitRetryCount(0);
    setAuthRetryCount(0);
    outputBufferRef.current = '';
    lastOutputRef.current = '';
    initializedRef.current = false;
    initializingRef.current = false;
    
    // Note: Keep JWT token for reuse within validity period
  }, [isOpen]); // Only depend on isOpen to prevent unwanted cleanup

  // ==================== Render ====================
  
  if (!isOpen) return null;

  const displayError = authError || hookError || signatureError;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", damping: 20 }}
          className={clsx(
            "bg-[#0A0A0F] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden",
            isFullscreen ? "fixed inset-4" : "w-full max-w-5xl h-[80vh]"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 bg-black/40 backdrop-blur flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-600/20 to-blue-600/20">
                <TerminalIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Remote Terminal</h2>
                <p className="text-xs text-gray-400">Node: {nodeReference}</p>
              </div>
              
              {/* Connection Status */}
              <div className="flex items-center gap-2 ml-4">
                {isRemoteAuthenticated && (
                  <div className="flex items-center gap-1">
                    <Shield className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-green-400">Authenticated</span>
                    {tokenExpiry && (
                      <>
                        <Clock className="w-3 h-3 text-gray-400 ml-1" />
                        <span className="text-xs text-gray-400">{tokenExpiry}</span>
                      </>
                    )}
                  </div>
                )}
                {!isNodeOnline ? (
                  <>
                    <WifiOff className="w-3 h-3 text-red-400" />
                    <span className="text-xs text-red-400">Node Offline</span>
                  </>
                ) : !isWebSocketReady ? (
                  <>
                    <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
                    <span className="text-xs text-yellow-400">Connecting WS...</span>
                  </>
                ) : terminalReady ? (
                  <>
                    <Wifi className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-green-400">Connected</span>
                  </>
                ) : isAuthenticating || hookIsConnecting ? (
                  <>
                    <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
                    <span className="text-xs text-yellow-400">
                      {isAuthenticating ? 'Authenticating...' : 'Initializing...'}
                    </span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-400">Disconnected</span>
                  </>
                )}
              </div>
              
              {/* Signature Status */}
              {remainingTimeFormatted && !isSignatureLoading && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Key className="w-3 h-3" />
                  <span>Signature: {remainingTimeFormatted}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Quick Commands */}
              <button
                onClick={() => setShowCommandPalette(!showCommandPalette)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Quick Commands (Ctrl+K)"
              >
                <Command className="w-4 h-4 text-gray-400" />
              </button>

              {/* Copy */}
              <button
                onClick={copyTerminalContent}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Copy Selection"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {/* Clear */}
              <button
                onClick={clearTerminal}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Clear Terminal"
              >
                <Trash2 className="w-4 h-4 text-gray-400" />
              </button>

              {/* Reset */}
              <button
                onClick={resetTerminal}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Reset Terminal"
              >
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </button>

              <div className="w-px h-6 bg-white/10" />

              {/* Fullscreen */}
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
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
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Close (Esc)"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Quick Commands Palette */}
          <AnimatePresence>
            {showCommandPalette && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-white/10 bg-black/20 overflow-hidden"
              >
                <div className="p-3">
                  <p className="text-xs text-gray-400 mb-2">Quick Commands (Ctrl+K to toggle)</p>
                  <div className="grid grid-cols-4 gap-2">
                    {quickCommands.map((cmd, index) => (
                      <button
                        key={index}
                        onClick={() => executeQuickCommand(cmd.command)}
                        disabled={!hookTerminalReady}
                        className={clsx(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-xs",
                          hookTerminalReady
                            ? "bg-white/5 hover:bg-white/10 text-gray-300"
                            : "bg-white/5 text-gray-600 cursor-not-allowed"
                        )}
                      >
                        <ChevronRight className="w-3 h-3" />
                        {cmd.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Terminal Content */}
          <div className="flex-1 relative bg-black">
            {/* Error State */}
            {displayError && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center p-6">
                  <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                  <p className="text-white mb-2">Terminal Error</p>
                  <p className="text-sm text-gray-400 mb-4">{displayError}</p>
                  <button
                    onClick={handleRetryConnection}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors text-sm text-red-400 border border-red-500/30"
                  >
                    Retry Connection
                  </button>
                </div>
              </div>
            )}

            {/* Connecting State */}
            {(isAuthenticating || hookIsConnecting || isSignatureLoading) && !hookTerminalReady && !displayError && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
                  <p className="text-white mb-1">
                    {isSignatureLoading ? 'Getting Signature...' :
                     isAuthenticating ? 'Authenticating...' :
                     'Connecting to Terminal...'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {isSignatureLoading ? 'Please approve the signature request' :
                     isAuthenticating ? 'Obtaining secure access token' :
                     `Establishing connection to ${nodeReference}`}
                    {(authRetryCount > 0 || initRetryCount > 0) && 
                      ` (Retry ${Math.max(authRetryCount, initRetryCount)})`}
                  </p>
                </div>
              </div>
            )}

            {/* Node Offline State */}
            {!isNodeOnline && !hookIsConnecting && !isAuthenticating && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center p-6">
                  <WifiOff className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-white mb-2">Node Offline</p>
                  <p className="text-sm text-gray-400">
                    The node {nodeReference} is currently offline. Terminal access is not available.
                  </p>
                </div>
              </div>
            )}

            {/* Terminal UI */}
            <TerminalUI
              ref={terminalRef}
              theme="dark"
              fontSize={14}
              onInput={handleTerminalInput}
              onReady={handleTerminalUIReady}
              enableSearch={true}
              enableLinks={true}
              enableClipboard={true}
              className="h-full"
            />
          </div>

          {/* Status Bar */}
          <div className="px-4 py-2 border-t border-white/10 bg-black/40 backdrop-blur flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="text-gray-400">
                Session: {terminalSession || 'Not connected'}
              </span>
              {terminalSession && (
                <span className="text-gray-400">
                  Node: {nodeReference}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {terminalReady ? (
                <span className="text-green-400 flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Ready
                </span>
              ) : isAuthenticating || hookIsConnecting ? (
                <span className="text-yellow-400">
                  {isAuthenticating ? 'Authenticating...' : 'Initializing...'}
                </span>
              ) : (
                <span className="text-gray-400">Disconnected</span>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
