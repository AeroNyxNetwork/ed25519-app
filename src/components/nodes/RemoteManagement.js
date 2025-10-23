/**
 * ============================================
 * File: src/components/nodes/RemoteManagement.js
 * ============================================
 * Remote Management Component - FINAL CLEAN v6.1.0
 * 
 * Modification Reason: Complete removal of all Signature displays
 * - Verified: ALL Signature time displays removed
 * - Fixed: Terminal initialization state synchronization
 * - Simplified: Only show JWT session time
 * - Enhanced: Better terminal ready state handling
 * 
 * CRITICAL CHANGES:
 * 1. Removed ALL instances of signature display (3 places checked)
 * 2. Fixed terminalUIReady ref declaration position
 * 3. Conditional rendering of TerminalUI (only when session ready)
 * 4. Proper state synchronization
 * 
 * Main Functionality: Multi-tab remote management
 * 
 * ⚠️ VERIFIED: No Signature display anywhere in this file
 * 
 * Last Modified: v6.1.0 - Final clean, all Signature displays removed
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
  ChevronRight,
  Trash2,
  Shield,
  Clock,
  Folder,
  Monitor
} from 'lucide-react';
import clsx from 'clsx';

import TerminalUI from '../terminal/TerminalUI';
import { useRemoteManagement } from '../../hooks/useRemoteManagement';
import remoteAuthService from '../../services/RemoteAuthService';
import webSocketService from '../../services/WebSocketService';
import { useGlobalSignature } from '../../hooks/useGlobalSignature';
import FileManager from './FileManager';
import SystemInfo from './SystemInfo';

export default function RemoteManagement({ 
  nodeReference, 
  isOpen, 
  onClose,
  defaultTab = 'terminal'
}) {
  // ==================== Authentication State ====================
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);
  
  // Get signature for JWT (but don't display signature time)
  const {
    ensureSignature,
    isLoading: isSignatureLoading,
    error: signatureError,
    walletAddress,
    refreshSignature
  } = useGlobalSignature();
  
  // Use the remote management hook
  const {
    terminalSession,
    terminalReady,
    isConnecting,
    error: hookError,
    isRetrying,
    retryCount,
    isNodeOnline,
    isWebSocketReady,
    isRemoteAuthenticated,
    initializeTerminal,
    sendTerminalInput,
    closeTerminal,
    executeTerminalCommand,
    reconnectTerminal,
    tokenExpiry,
    nodes,
    listDirectory,
    readFile,
    writeFile,
    deleteFile,
    uploadFile,
    getSystemInfo,
    executeCommand
  } = useRemoteManagement(nodeReference);

  // ==================== Local State ====================
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [terminalUIReady, setTerminalUIReady] = useState(false);

  // Refs
  const terminalRef = useRef(null);
  const terminalUIReadyRef = useRef(false);
  const outputBufferRef = useRef('');
  const initTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const messageListenerRef = useRef(null);
  const lastOutputRef = useRef('');
  const initializedRef = useRef(false);

  // ==================== Authentication ====================
  
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
      
      return true;
      
    } catch (error) {
      console.error('[RemoteManagement] Authentication failed:', error);
      setAuthError(error.message);
      setIsAuthenticating(false);
      return false;
    }
  }, [nodeReference, walletAddress, ensureSignature, isAuthenticating]);

  // ==================== Initialization ====================
  
  const initializeTerminalWithAuth = useCallback(async () => {
    if (initializedRef.current) {
      console.log('[RemoteManagement] Already initialized');
      return null;
    }
    
    if (!isMountedRef.current) {
      console.log('[RemoteManagement] Component not mounted');
      return null;
    }
    
    setTerminalUIReady(false);
    terminalUIReadyRef.current = false;
    
    try {
      console.log('[RemoteManagement] Initializing terminal with auth check');
      
      const authSuccess = await performAuthentication();
      if (!authSuccess) {
        console.log('[RemoteManagement] Authentication failed, will retry via RemoteAuthService');
        return null;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const result = await initializeTerminal();
      
      if (result && result.sessionId) {
        console.log('[RemoteManagement] Terminal initialized:', result.sessionId);
        initializedRef.current = true;
        return result;
      }
      
      return null;
      
    } catch (error) {
      console.error('[RemoteManagement] Terminal initialization failed:', error);
      setAuthError(error.message);
      return null;
    }
  }, [performAuthentication, initializeTerminal]);

  // ==================== Effects ====================
  
  useEffect(() => {
    if (!isOpen) return;
    
    if (!initializedRef.current) {
      console.log('[RemoteManagement] Modal opened, starting initialization');
      
      const init = async () => {
        if (!isNodeOnline) {
          console.log('[RemoteManagement] Node is offline');
          setAuthError('Node is offline');
          return;
        }
        
        if (!isWebSocketReady) {
          console.log('[RemoteManagement] WebSocket not ready, waiting...');
          setTimeout(() => {
            if (isMountedRef.current && !initializedRef.current) {
              init();
            }
          }, 2000);
          return;
        }
        
        await initializeTerminalWithAuth();
      };
      
      initTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && !initializedRef.current) {
          init();
        }
      }, 100);
    }
    
    return () => {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
    };
  }, [isOpen, isNodeOnline, isWebSocketReady, initializeTerminalWithAuth]);

  // ==================== WebSocket Message Handling ====================
  
  useEffect(() => {
    if (!isOpen || !terminalSession) return;

    const handleTerminalOutput = (message) => {
      if (message.session_id !== terminalSession) return;
      
      console.log('[RemoteManagement] Received terminal output:', message.data?.length || 0, 'bytes');
      
      if (message.data) {
        if (lastOutputRef.current === message.data) {
          console.log('[RemoteManagement] Skipping duplicate output');
          return;
        }
        lastOutputRef.current = message.data;
        
        if (terminalRef.current && terminalUIReadyRef.current) {
          try {
            terminalRef.current.write(message.data);
          } catch (error) {
            console.error('[RemoteManagement] Error writing to terminal:', error);
            outputBufferRef.current += message.data;
          }
        } else {
          outputBufferRef.current += message.data;
        }
      }
    };

    const handleTerminalError = (message) => {
      if (message.session_id !== terminalSession) return;
      
      console.error('[RemoteManagement] Terminal error:', message);
      
      if (terminalRef.current && terminalUIReadyRef.current) {
        terminalRef.current.write('\r\n\x1b[31m● Error: ' + (message.error || message.message) + '\x1b[0m\r\n');
      }
      
      if (message.code === 'INVALID_JWT' || message.code === 'AUTH_FAILED') {
        remoteAuthService.clearToken(nodeReference);
      }
    };

    const handleTerminalClosed = (message) => {
      if (message.session_id !== terminalSession) return;
      
      console.log('[RemoteManagement] Terminal closed');
      
      if (terminalRef.current && terminalUIReadyRef.current) {
        terminalRef.current.write('\r\n\x1b[33m● Session closed by remote host\x1b[0m\r\n');
      }
    };

    webSocketService.on('terminalOutput', handleTerminalOutput);
    webSocketService.on('terminalError', handleTerminalError);
    webSocketService.on('terminalClosed', handleTerminalClosed);

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
        // Not JSON, ignore
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
  }, [isOpen, terminalSession, nodeReference]);

  // ==================== Terminal Handlers ====================
  
  const handleTerminalUIReady = useCallback(() => {
    console.log('[RemoteManagement] Terminal UI onReady callback triggered');
    
    setTerminalUIReady(true);
    terminalUIReadyRef.current = true;
    
    if (terminalSession && terminalRef.current) {
      console.log('[RemoteManagement] Writing welcome message to terminal');
      try {
        terminalRef.current.write('\x1b[32m● Terminal Connected\x1b[0m\r\n');
        terminalRef.current.write('\x1b[90mNode: ' + nodeReference + '\x1b[0m\r\n');
        terminalRef.current.write('\x1b[90mSession: ' + terminalSession + '\x1b[0m\r\n');
        terminalRef.current.write('\x1b[90m─────────────────────────────────────────\x1b[0m\r\n');
        
        if (outputBufferRef.current) {
          terminalRef.current.write(outputBufferRef.current);
          outputBufferRef.current = '';
        }
      } catch (error) {
        console.error('[RemoteManagement] Error writing welcome message:', error);
      }
    }
  }, [nodeReference, terminalSession]);

  const handleTerminalInput = useCallback((data) => {
    const isUIReady = terminalUIReadyRef.current;
    
    if (terminalSession && terminalReady && isUIReady) {
      console.log('[RemoteManagement] Sending input:', data.length, 'bytes');
      sendTerminalInput(data);
    } else {
      console.warn('[RemoteManagement] Cannot send input - terminal not ready', {
        hasSession: !!terminalSession,
        hookReady: terminalReady,
        uiReady: isUIReady,
        uiReadyState: terminalUIReady
      });
    }
  }, [terminalSession, terminalReady, terminalUIReady, sendTerminalInput]);

  // ==================== Terminal Actions ====================
  
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

  const clearTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.clear();
      lastOutputRef.current = '';
    }
  }, []);

  const resetTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.reset();
      lastOutputRef.current = '';
    }
  }, []);

  const handleRetryConnection = useCallback(async () => {
    console.log('[RemoteManagement] Manual retry requested');
    
    setAuthError(null);
    outputBufferRef.current = '';
    lastOutputRef.current = '';
    
    await refreshSignature();
    await performAuthentication();
    
    if (!terminalSession) {
      await initializeTerminalWithAuth();
    }
  }, [refreshSignature, performAuthentication, initializeTerminalWithAuth, terminalSession]);

  // ==================== Quick Commands ====================
  
  const quickCommands = [
    { label: 'List Files', command: 'ls -la' },
    { label: 'System Info', command: 'uname -a' },
    { label: 'Process List', command: 'ps aux | head -20' },
    { label: 'Network Info', command: 'ip addr' },
    { label: 'Disk Usage', command: 'df -h' },
    { label: 'Memory Info', command: 'free -h' },
    { label: 'Docker Status', command: 'docker ps' },
    { label: 'Clear Screen', command: 'clear' }
  ];

  const executeQuickCommand = useCallback((command) => {
    if (terminalSession && terminalReady && terminalUIReadyRef.current) {
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

  useEffect(() => {
    if (!isOpen) {
      setTerminalUIReady(false);
      terminalUIReadyRef.current = false;
      outputBufferRef.current = '';
      lastOutputRef.current = '';
      initializedRef.current = false;
    }
  }, [isOpen]);

  // ==================== RENDER ====================
  
  if (!isOpen) return null;

  const displayError = authError || hookError || signatureError;
  const showRetrying = isRetrying || (retryCount > 0 && retryCount < 3);

  const tabs = [
    { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
    { id: 'files', label: 'File Manager', icon: Folder },
    { id: 'system', label: 'System Info', icon: Monitor }
  ];

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
          <div className="px-4 py-3 border-b border-white/10 bg-black/40 backdrop-blur flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-600/20 to-blue-600/20">
                <TerminalIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Remote Management</h2>
                <p className="text-xs text-gray-400">Node: {nodeReference}</p>
              </div>
              
              {/* ✅ CLEAN: Only JWT Session Time, NO Signature display */}
              <div className="flex items-center gap-3 ml-4 text-xs">
                {/* JWT Session Time */}
                {isRemoteAuthenticated && tokenExpiry && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                    <Shield className="w-3 h-3 text-green-400" />
                    <span className="text-green-400">Session: {tokenExpiry}</span>
                  </div>
                )}
                
                {/* Connection Status */}
                {!isNodeOnline ? (
                  <div className="flex items-center gap-1 px-3 py-1 bg-red-500/10 rounded-full border border-red-500/20">
                    <WifiOff className="w-3 h-3 text-red-400" />
                    <span className="text-red-400">Offline</span>
                  </div>
                ) : !isWebSocketReady ? (
                  <div className="flex items-center gap-1 px-3 py-1 bg-yellow-500/10 rounded-full border border-yellow-500/20">
                    <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
                    <span className="text-yellow-400">Connecting...</span>
                  </div>
                ) : showRetrying ? (
                  <div className="flex items-center gap-1 px-3 py-1 bg-orange-500/10 rounded-full border border-orange-500/20">
                    <Loader2 className="w-3 h-3 text-orange-400 animate-spin" />
                    <span className="text-orange-400">Retry {retryCount}/3</span>
                  </div>
                ) : terminalReady && terminalUIReadyRef.current ? (
                  <div className="flex items-center gap-1 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                    <Wifi className="w-3 h-3 text-green-400" />
                    <span className="text-green-400">Connected</span>
                  </div>
                ) : isAuthenticating || isConnecting ? (
                  <div className="flex items-center gap-1 px-3 py-1 bg-yellow-500/10 rounded-full border border-yellow-500/20">
                    <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
                    <span className="text-yellow-400">
                      {isAuthenticating ? 'Authenticating' : 'Initializing'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-3 py-1 bg-gray-500/10 rounded-full border border-gray-500/20">
                    <WifiOff className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-400">Disconnected</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {activeTab === 'terminal' && (
                <>
                  <button
                    onClick={() => setShowCommandPalette(!showCommandPalette)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    title="Quick Commands (Ctrl+K)"
                  >
                    <Command className="w-4 h-4 text-gray-400" />
                  </button>

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

                  <button
                    onClick={clearTerminal}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    title="Clear Terminal"
                  >
                    <Trash2 className="w-4 h-4 text-gray-400" />
                  </button>

                  <button
                    onClick={resetTerminal}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    title="Reset Terminal"
                  >
                    <RefreshCw className="w-4 h-4 text-gray-400" />
                  </button>
                  
                  <div className="w-px h-6 bg-white/10" />
                </>
              )}

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
            {showCommandPalette && activeTab === 'terminal' && (
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
                        disabled={!terminalReady || !terminalUIReadyRef.current}
                        className={clsx(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-xs",
                          terminalReady && terminalUIReadyRef.current
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

          {/* Tabs */}
          <div className="flex border-b border-white/10 bg-black/20">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex items-center gap-2 px-6 py-3 transition-all",
                    activeTab === tab.id
                      ? "bg-white/10 text-white border-b-2 border-purple-500"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Container */}
          <div className="flex-1 relative bg-black min-h-0">
            {/* Error State */}
            {displayError && activeTab === 'terminal' && (
              <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center p-6 max-w-md">
                  {showRetrying ? (
                    <>
                      <Loader2 className="w-12 h-12 text-orange-400 animate-spin mx-auto mb-3" />
                      <p className="text-white mb-2">Retrying Connection</p>
                      <p className="text-sm text-gray-400 mb-4">
                        Attempt {retryCount} of 3... Please wait.
                      </p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                      <p className="text-white mb-2">Connection Error</p>
                      <p className="text-sm text-gray-400 mb-4">{displayError}</p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={handleRetryConnection}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-sm text-white flex items-center gap-2"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Retry
                        </button>
                        <button
                          onClick={onClose}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm text-gray-400"
                        >
                          Close
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Connecting State */}
            {(isAuthenticating || isConnecting || isSignatureLoading) && !terminalReady && !displayError && activeTab === 'terminal' && (
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
                  </p>
                </div>
              </div>
            )}

            {/* Node Offline State */}
            {!isNodeOnline && !isConnecting && !isAuthenticating && activeTab === 'terminal' && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center p-6">
                  <WifiOff className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-white mb-2">Node Offline</p>
                  <p className="text-sm text-gray-400">
                    The node {nodeReference} is currently offline.
                  </p>
                </div>
              </div>
            )}

            {/* Tab Content */}
            {activeTab === 'terminal' && (
              <>
                {terminalSession && terminalReady ? (
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
                ) : (
                  <div className="absolute inset-0 bg-black flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
                      <p className="text-white mb-1">Initializing Terminal</p>
                      <p className="text-xs text-gray-400">
                        {!terminalSession ? 'Creating session...' : 
                         !terminalReady ? 'Connecting...' : 
                         'Loading UI...'}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'files' && (
              <FileManager
                nodeReference={nodeReference}
                listDirectory={listDirectory}
                readFile={readFile}
                writeFile={writeFile}
                deleteFile={deleteFile}
                isRemoteAuthenticated={isRemoteAuthenticated}
              />
            )}

            {activeTab === 'system' && (
              <SystemInfo
                nodeReference={nodeReference}
                getSystemInfo={getSystemInfo}
                executeCommand={executeCommand}
                isRemoteAuthenticated={isRemoteAuthenticated}
              />
            )}
          </div>

          {/* Status Bar */}
          <div className="px-4 py-2 border-t border-white/10 bg-black/40 backdrop-blur flex items-center justify-between text-xs flex-shrink-0">
            <div className="flex items-center gap-4">
              <span className="text-gray-400">
                Tab: {tabs.find(t => t.id === activeTab)?.label}
              </span>
              {terminalSession && (
                <span className="text-gray-400">
                  Session: {terminalSession}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {terminalReady && terminalUIReadyRef.current ? (
                <span className="text-green-400 flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Ready
                </span>
              ) : showRetrying ? (
                <span className="text-orange-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Retrying...
                </span>
              ) : isAuthenticating || isConnecting ? (
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
