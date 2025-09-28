/**
 * ============================================
 * File: src/components/nodes/RemoteManagement.js
 * ============================================
 * Fixed Remote Management Component with JWT Authentication
 * 
 * Creation Reason: Provide terminal interface for remote nodes
 * Modification Reason: Added JWT authentication flow based on UpdatedRemoteManagement
 * Main Functionality: Terminal UI with proper JWT authentication
 * Dependencies: TerminalUI, useRemoteManagement hook, nodeRegistrationService
 * 
 * Main Logical Flow:
 * 1. Get signature from wallet
 * 2. Obtain JWT token from API
 * 3. Send remote_auth message with JWT
 * 4. Wait for remote_auth_success
 * 5. Initialize terminal session
 * 6. Handle terminal I/O
 * 
 * ⚠️ Important Note for Next Developer:
 * - JWT authentication is REQUIRED before terminal access
 * - Token is valid for 59 minutes and auto-refreshes
 * - Uses existing useRemoteManagement hook
 * - Terminal output comes through WebSocket messages
 * 
 * Last Modified: v3.0.0 - Integrated JWT authentication from UpdatedRemoteManagement
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
  Shield
} from 'lucide-react';
import clsx from 'clsx';

// Import the terminal UI component
import TerminalUI from '../terminal/TerminalUI';

// Import the hook with JWT support
import { useRemoteManagement } from '../../hooks/useRemoteManagement';

// Import services
import nodeRegistrationService from '../../lib/api/nodeRegistration';
import webSocketService from '../../services/WebSocketService';
import { useGlobalSignature } from '../../hooks/useGlobalSignature';

export default function RemoteManagement({ nodeReference, isOpen, onClose }) {
  // ==================== JWT Authentication State ====================
  const [isJwtAuthenticated, setIsJwtAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);
  const jwtTokenRef = useRef(null);
  const jwtExpiryRef = useRef(null);
  
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
    terminalReady,
    isConnecting: hookIsConnecting,
    error: hookError,
    isNodeOnline,
    isWebSocketReady,
    initializeTerminal,
    sendTerminalInput,
    closeTerminal,
    executeCommand,
    reconnectTerminal
  } = useRemoteManagement(nodeReference);

  // Local state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [localTerminalReady, setLocalTerminalReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Refs
  const terminalRef = useRef(null);
  const outputBufferRef = useRef('');
  const initTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const messageListenerRef = useRef(null);
  const initializationRef = useRef(false);

  // ==================== JWT Authentication ====================
  
  /**
   * Check if JWT token is still valid
   */
  const isJwtValid = useCallback(() => {
    if (!jwtTokenRef.current || !jwtExpiryRef.current) return false;
    return Date.now() < jwtExpiryRef.current;
  }, []);

  /**
   * Perform JWT authentication for remote management
   */
  const performJwtAuthentication = useCallback(async () => {
    if (isJwtAuthenticated && isJwtValid()) {
      console.log('[RemoteManagement] Already authenticated with valid JWT');
      return true;
    }
    
    setIsAuthenticating(true);
    setAuthError(null);
    
    try {
      console.log('[RemoteManagement] Starting JWT authentication');
      
      // Step 1: Ensure we have a valid signature
      const signatureData = await ensureSignature();
      
      if (!signatureData || !signatureData.signature || !signatureData.message) {
        throw new Error('Failed to obtain signature');
      }
      
      console.log('[RemoteManagement] Got signature, valid for:', remainingTimeFormatted);
      
      // Step 2: Get JWT token from API
      const tokenResponse = await nodeRegistrationService.generateRemoteManagementToken(
        walletAddress,
        signatureData.signature,
        signatureData.message,
        'okx',
        nodeReference,
        60 // 60 minutes validity
      );
      
      if (!tokenResponse.success) {
        throw new Error(tokenResponse.message || 'Failed to get JWT token');
      }
      
      const token = tokenResponse.data?.token;
      if (!token) {
        throw new Error('No JWT token received from server');
      }
      
      // Store JWT token (valid for 59 minutes to be safe)
      jwtTokenRef.current = token;
      jwtExpiryRef.current = Date.now() + (59 * 60 * 1000);
      
      console.log('[RemoteManagement] JWT token obtained, sending remote_auth');
      
      // Step 3: Send remote_auth message via WebSocket
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          webSocketService.off('message', handleMessage);
          reject(new Error('Remote authentication timeout'));
        }, 10000);
        
        const handleMessage = (message) => {
          if (message.type === 'remote_auth_success') {
            clearTimeout(timeout);
            webSocketService.off('message', handleMessage);
            setIsJwtAuthenticated(true);
            setIsAuthenticating(false);
            console.log('[RemoteManagement] JWT authentication successful');
            resolve(true);
          } else if (message.type === 'error' && 
                     (message.code === 'AUTH_FAILED' || 
                      message.code === 'INVALID_TOKEN' ||
                      message.code === 'INVALID_JWT')) {
            clearTimeout(timeout);
            webSocketService.off('message', handleMessage);
            
            // Clear JWT on auth failure
            jwtTokenRef.current = null;
            jwtExpiryRef.current = null;
            setIsJwtAuthenticated(false);
            
            reject(new Error(message.message || 'JWT authentication failed'));
          }
        };
        
        webSocketService.on('message', handleMessage);
        
        const sent = webSocketService.send({
          type: 'remote_auth',
          jwt_token: token
        });
        
        if (!sent) {
          clearTimeout(timeout);
          webSocketService.off('message', handleMessage);
          reject(new Error('Failed to send authentication message'));
        }
      });
      
    } catch (error) {
      console.error('[RemoteManagement] JWT authentication failed:', error);
      setAuthError(error.message);
      setIsAuthenticating(false);
      setIsJwtAuthenticated(false);
      
      // Clear JWT on error
      jwtTokenRef.current = null;
      jwtExpiryRef.current = null;
      
      throw error;
    }
  }, [isJwtAuthenticated, isJwtValid, ensureSignature, remainingTimeFormatted, walletAddress, nodeReference]);

  // ==================== Initialization ====================
  
  // Initialize when modal opens
  useEffect(() => {
    if (!isOpen || initializationRef.current) return;
    
    initializationRef.current = true;
    let mounted = true;

    const init = async () => {
      if (!mounted) return;
      
      console.log('[RemoteManagement] Starting initialization');
      
      // Check prerequisites
      if (!isNodeOnline) {
        console.log('[RemoteManagement] Node is offline');
        setAuthError('Node is offline');
        return;
      }
      
      if (!isWebSocketReady) {
        console.log('[RemoteManagement] WebSocket not ready, retrying...');
        if (mounted && retryCount < 10) {
          initTimeoutRef.current = setTimeout(() => {
            setRetryCount(prev => prev + 1);
            init();
          }, 2000);
        }
        return;
      }
      
      try {
        // Perform JWT authentication first
        if (!isJwtAuthenticated || !isJwtValid()) {
          await performJwtAuthentication();
        }
        
        // Initialize terminal after JWT auth
        const result = await initializeTerminal();
        
        if (mounted && result && result.sessionId) {
          console.log('[RemoteManagement] Terminal initialized:', result.sessionId);
          setLocalTerminalReady(true);
          setRetryCount(0);
          
          // Write welcome message
          if (terminalRef.current) {
            terminalRef.current.write('\x1b[32m● Terminal Connected\x1b[0m\r\n');
            terminalRef.current.write('\x1b[90mNode: ' + nodeReference + '\x1b[0m\r\n');
            terminalRef.current.write('\x1b[90mSession: ' + result.sessionId + '\x1b[0m\r\n');
            terminalRef.current.write('\x1b[90m─────────────────────────────────────────\x1b[0m\r\n');
          }
          
          // Flush any buffered output
          if (outputBufferRef.current && terminalRef.current) {
            terminalRef.current.write(outputBufferRef.current);
            outputBufferRef.current = '';
          }
        }
      } catch (error) {
        console.error('[RemoteManagement] Initialization failed:', error);
        setAuthError(error.message);
        
        // Retry on failure
        if (mounted && retryCount < 5) {
          initTimeoutRef.current = setTimeout(() => {
            setRetryCount(prev => prev + 1);
            init();
          }, 3000);
        }
      }
    };

    // Start initialization
    init();

    return () => {
      mounted = false;
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
    };
  }, [isOpen, nodeReference, isNodeOnline, isWebSocketReady, retryCount, isJwtAuthenticated, isJwtValid, performJwtAuthentication, initializeTerminal]);

  // ==================== WebSocket Message Handling ====================
  
  // Listen for terminal output from WebSocket
  useEffect(() => {
    if (!isOpen || !terminalSession) return;

    const handleTerminalOutput = (message) => {
      if (message.session_id !== terminalSession) return;
      
      console.log('[RemoteManagement] Received terminal output:', message.data?.length || 0, 'bytes');
      
      if (message.data && terminalRef.current) {
        try {
          terminalRef.current.write(message.data);
        } catch (error) {
          console.error('[RemoteManagement] Error writing to terminal:', error);
          outputBufferRef.current += message.data;
        }
      } else if (message.data) {
        outputBufferRef.current += message.data;
      }
    };

    const handleTerminalError = (message) => {
      if (message.session_id !== terminalSession) return;
      
      console.error('[RemoteManagement] Terminal error:', message);
      
      if (terminalRef.current) {
        terminalRef.current.write('\r\n\x1b[31m● Error: ' + (message.error || message.message) + '\x1b[0m\r\n');
      }
    };

    const handleTerminalClosed = (message) => {
      if (message.session_id !== terminalSession) return;
      
      console.log('[RemoteManagement] Terminal closed');
      
      if (terminalRef.current) {
        terminalRef.current.write('\r\n\x1b[33m● Session closed by remote host\x1b[0m\r\n');
      }
      
      setLocalTerminalReady(false);
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
  }, [isOpen, terminalSession]);

  // ==================== Terminal Handlers ====================
  
  // Handle terminal ready
  useEffect(() => {
    if (terminalReady && terminalRef.current && outputBufferRef.current) {
      console.log('[RemoteManagement] Terminal ready, flushing buffer');
      
      try {
        terminalRef.current.write(outputBufferRef.current);
        outputBufferRef.current = '';
      } catch (error) {
        console.error('[RemoteManagement] Error flushing buffer:', error);
      }
    }
  }, [terminalReady]);

  // Handle terminal input
  const handleTerminalInput = useCallback((data) => {
    if (terminalSession && terminalReady) {
      console.log('[RemoteManagement] Sending input:', data.length, 'bytes');
      sendTerminalInput(data);
    } else {
      console.warn('[RemoteManagement] Cannot send input - terminal not ready');
    }
  }, [terminalSession, terminalReady, sendTerminalInput]);

  // Handle terminal UI ready
  const handleTerminalUIReady = useCallback(() => {
    console.log('[RemoteManagement] Terminal UI is ready');
    
    if (outputBufferRef.current && terminalRef.current) {
      try {
        terminalRef.current.write(outputBufferRef.current);
        outputBufferRef.current = '';
      } catch (error) {
        console.error('[RemoteManagement] Error writing buffered output:', error);
      }
    }
  }, []);

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
    }
  }, []);

  // Reset terminal
  const resetTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.reset();
    }
  }, []);

  // Retry connection
  const handleRetryConnection = useCallback(async () => {
    setRetryCount(0);
    setLocalTerminalReady(false);
    setIsJwtAuthenticated(false);
    setAuthError(null);
    outputBufferRef.current = '';
    initializationRef.current = false;
    jwtTokenRef.current = null;
    jwtExpiryRef.current = null;
    
    await reconnectTerminal();
  }, [reconnectTerminal]);

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
    if (terminalSession && terminalReady) {
      const commandWithNewline = command.endsWith('\n') ? command : `${command}\n`;
      sendTerminalInput(commandWithNewline);
      setShowCommandPalette(false);
    }
  }, [terminalSession, terminalReady, sendTerminalInput]);

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
    };
  }, []);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen && terminalSession) {
      console.log('[RemoteManagement] Closing terminal session');
      closeTerminal();
      setLocalTerminalReady(false);
      setRetryCount(0);
      outputBufferRef.current = '';
      initializationRef.current = false;
      // Note: Keep JWT token for reuse
    }
  }, [isOpen, terminalSession, closeTerminal]);

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
                {isJwtAuthenticated && (
                  <div className="flex items-center gap-1">
                    <Shield className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-green-400">JWT Auth</span>
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
                  <span>{remainingTimeFormatted}</span>
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
                        disabled={!terminalReady}
                        className={clsx(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-xs",
                          terminalReady
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
            {(isAuthenticating || hookIsConnecting || isSignatureLoading) && !terminalReady && !displayError && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
                  <p className="text-white mb-1">
                    {isSignatureLoading ? 'Getting Signature...' :
                     isAuthenticating ? 'Authenticating with JWT...' :
                     'Connecting to Terminal...'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {isSignatureLoading ? 'Please approve the signature request' :
                     isAuthenticating ? 'Obtaining secure access token' :
                     `Establishing connection to ${nodeReference}`}
                    {retryCount > 0 && ` (Retry ${retryCount}/5)`}
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
