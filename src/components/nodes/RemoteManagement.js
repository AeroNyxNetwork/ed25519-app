/**
 * ============================================
 * File: src/components/nodes/RemoteManagement.js
 * ============================================
 * Remote Management Component - SIMPLIFIED STATE v6.0.0
 * 
 * Modification Reason: Simplify state management and add auto-reconnect UI
 * - Simplified: Merged 4 terminal ready states into 1
 * - Added: Auto-reconnect UI with progress indicator
 * - Added: Clear error messages with recovery actions
 * - Improved: State synchronization
 * - Fixed: No premature unmounting on errors
 * 
 * Main Functionality: Multi-tab remote management interface
 * 
 * State Simplification:
 * - Before: terminalReady, hookTerminalReady, localTerminalReady, terminalUIReady
 * - After: terminalReady (from hook) + terminalUIReady (local UI only)
 * 
 * ⚠️ CRITICAL: All existing functionality preserved
 * - NO parameter changes
 * - NO API changes
 * - NO feature removal
 * - Only simplified internal state management
 * 
 * Last Modified: v6.0.0 - Simplified state and enhanced error UI
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
  Clock,
  Folder,
  Monitor,
  Activity
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
  
  // Get signature
  const {
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
    isRetrying: hookIsRetrying,
    initializeTerminal,
    sendTerminalInput,
    closeTerminal,
    reconnectTerminal,
    tokenExpiry,
    retryCount,
    // Remote commands
    listDirectory,
    readFile,
    writeFile,
    deleteFile,
    uploadFile,
    getSystemInfo,
    executeCommand
  } = useRemoteManagement(nodeReference);
  
  const isNodeOnline = hookIsNodeOnline;

  // ==================== Local State ====================
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [terminalUIReady, setTerminalUIReady] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Refs
  const terminalRef = useRef(null);
  const outputBufferRef = useRef('');
  const isMountedRef = useRef(true);
  const messageListenerRef = useRef(null);
  const lastOutputRef = useRef('');
  const initTimeoutRef = useRef(null);

  // ✅ SIMPLIFIED: Only 2 terminal ready states instead of 4
  const terminalReady = terminalSession && hookTerminalReady && terminalUIReady;

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
    try {
      console.log('[RemoteManagement] Initializing terminal with auth check');
      
      const authSuccess = await performAuthentication();
      if (!authSuccess) {
        console.log('[RemoteManagement] Authentication failed, cannot initialize terminal');
        return null;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const result = await initializeTerminal();
      
      if (result && result.sessionId) {
        console.log('[RemoteManagement] Terminal initialized:', result.sessionId);
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
    
    if (!terminalSession && !hookIsConnecting) {
      console.log('[RemoteManagement] Modal opened, checking initialization');
      
      const init = async () => {
        if (!isNodeOnline) {
          console.log('[RemoteManagement] Node is offline');
          setAuthError('Node is offline');
          return;
        }
        
        if (!isWebSocketReady) {
          console.log('[RemoteManagement] WebSocket not ready, waiting...');
          setAuthError('Connecting to server...');
          initTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current && !terminalSession) {
              init();
            }
          }, 2000);
          return;
        }
        
        await initializeTerminalWithAuth();
      };
      
      initTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && !terminalSession) {
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
  }, [isOpen, terminalSession, hookIsConnecting, isNodeOnline, isWebSocketReady, initializeTerminalWithAuth]);

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
        
        if (terminalRef.current && terminalUIReady) {
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
      
      if (terminalRef.current && terminalUIReady) {
        terminalRef.current.write('\r\n\x1b[31m● Error: ' + (message.error || message.message) + '\x1b[0m\r\n');
      }
      
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
      
      setTerminalUIReady(false);
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
        // Ignore parse errors
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
  
  const handleTerminalUIReady = useCallback(() => {
    console.log('[RemoteManagement] Terminal UI is ready');
    setTerminalUIReady(true);
    
    if (terminalSession && terminalRef.current) {
      terminalRef.current.write('\x1b[32m● Terminal Connected\x1b[0m\r\n');
      terminalRef.current.write('\x1b[90mNode: ' + nodeReference + '\x1b[0m\r\n');
      terminalRef.current.write('\x1b[90mSession: ' + terminalSession + '\x1b[0m\r\n');
      terminalRef.current.write('\x1b[90m─────────────────────────────────────────\x1b[0m\r\n');
      
      if (outputBufferRef.current) {
        try {
          terminalRef.current.write(outputBufferRef.current);
          outputBufferRef.current = '';
        } catch (error) {
          console.error('[RemoteManagement] Error writing buffered output:', error);
        }
      }
    }
  }, [nodeReference, terminalSession]);

  const handleTerminalInput = useCallback((data) => {
    if (terminalSession && hookTerminalReady) {
      console.log('[RemoteManagement] Sending input:', data.length, 'bytes');
      sendTerminalInput(data);
    } else {
      console.warn('[RemoteManagement] Cannot send input - terminal not ready');
    }
  }, [terminalSession, hookTerminalReady, sendTerminalInput]);

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
    console.log('[RemoteManagement] Retrying connection');
    
    setAuthError(null);
    outputBufferRef.current = '';
    lastOutputRef.current = '';
    
    // Don't clear everything - just retry
    await initializeTerminalWithAuth();
  }, [initializeTerminalWithAuth]);

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
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      console.log('[RemoteManagement] Modal closed');
      setTerminalUIReady(false);
      outputBufferRef.current = '';
      lastOutputRef.current = '';
    }
  }, [isOpen]);

  // ==================== RENDER ====================
  
  if (!isOpen) return null;

  const displayError = authError || hookError || signatureError;
  const isRetrying = hookIsRetrying;

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
          <div className="px-4 py-3 border-b border-white/10 bg-black/40 backdrop-blur flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-600/20 to-blue-600/20">
                <TerminalIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Remote Management</h2>
                <p className="text-xs text-gray-400">Node: {nodeReference}</p>
              </div>
              
              {/* ✅ ENHANCED: Unified Status Indicator */}
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
                    <span className="text-xs text-yellow-400">Connecting...</span>
                  </>
                ) : isRetrying ? (
                  <>
                    <Activity className="w-3 h-3 text-yellow-400 animate-pulse" />
                    <span className="text-xs text-yellow-400">Retrying ({retryCount}/3)...</span>
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
                
                {remainingTimeFormatted && !isSignatureLoading && (
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Key className="w-3 h-3" />
                    <span>Signature: {remainingTimeFormatted}</span>
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
                </>
              )}

              <div className="w-px h-6 bg-white/10" />

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

          {/* ✅ FIXED: Tab Content Container with proper layout */}
          <div className="flex-1 relative bg-black min-h-0">
            {/* ✅ ENHANCED: Error State with Recovery Actions */}
            {displayError && activeTab === 'terminal' && !isRetrying && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center p-6 max-w-md">
                  <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                  <p className="text-white mb-2 font-semibold">Connection Error</p>
                  <p className="text-sm text-gray-400 mb-4">{displayError}</p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={handleRetryConnection}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-sm text-white font-medium"
                    >
                      <RefreshCw className="w-4 h-4 inline-block mr-2" />
                      Retry Connection
                    </button>
                    <button
                      onClick={onClose}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm text-gray-400"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ✅ ENHANCED: Retrying State */}
            {isRetrying && activeTab === 'terminal' && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center">
                  <Activity className="w-8 h-8 text-yellow-400 animate-pulse mx-auto mb-3" />
                  <p className="text-white mb-1">Reconnecting...</p>
                  <p className="text-xs text-gray-400">
                    Attempt {retryCount} of 3
                  </p>
                  <div className="mt-4 flex gap-2 text-xs text-gray-500">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className={clsx(
                          "w-2 h-2 rounded-full",
                          i < retryCount ? "bg-yellow-400" : "bg-gray-600"
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Connecting State */}
            {(isAuthenticating || hookIsConnecting || isSignatureLoading) && !hookTerminalReady && !displayError && !isRetrying && activeTab === 'terminal' && (
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
            {!isNodeOnline && !hookIsConnecting && !isAuthenticating && activeTab === 'terminal' && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center p-6">
                  <WifiOff className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-white mb-2">Node Offline</p>
                  <p className="text-sm text-gray-400">
                    The node {nodeReference} is currently offline. Please check the node status.
                  </p>
                </div>
              </div>
            )}

            {/* Tab Content - Direct rendering */}
            {activeTab === 'terminal' && (
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
          <div className="px-4 py-2 border-t border-white/10 bg-black/40 backdrop-blur flex items-center justify-between text-xs">
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
              {terminalReady ? (
                <span className="text-green-400 flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Ready
                </span>
              ) : isRetrying ? (
                <span className="text-yellow-400">Retrying...</span>
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
