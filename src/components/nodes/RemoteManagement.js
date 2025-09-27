/**
 * ============================================
 * File: src/components/nodes/RemoteManagement.js
 * ============================================
 * Updated Remote Management Component
 * Integrates with new Terminal Service Architecture
 * Version: 2.0.0
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
  Download,
  Upload,
  Settings,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Wifi,
  WifiOff,
  Command,
  FileText,
  ChevronRight
} from 'lucide-react';
import clsx from 'clsx';

// Import the new terminal system components
import TerminalUI from '../terminal/TerminalUI';
import useTerminalStore from '../../stores/terminalStore';
import terminalService from '../../services/TerminalService';

export default function RemoteManagement({ nodeReference, isOpen, onClose }) {
  // Terminal store
  const {
    sessions,
    activeSessionId,
    createSession,
    sendInput,
    resizeSession,
    closeSession,
    wsState,
    nodes,
    error: storeError
  } = useTerminalStore();

  // Local state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Refs
  const terminalRef = useRef(null);
  const sessionRef = useRef(null);
  const containerRef = useRef(null);

  // Get current session
  const currentSession = sessions[activeSessionId];
  const isSessionActive = currentSession && currentSession.state === 'ready';

  // Get node info from store
  const nodeInfo = nodes[nodeReference];
  const isNodeOnline = nodeInfo && (nodeInfo.status === 'online' || nodeInfo.status === 'active');

  // Initialize terminal session
  useEffect(() => {
    if (!isOpen || !nodeReference || !isNodeOnline) return;

    // Check WebSocket state
    if (!wsState.connected || !wsState.authenticated) {
      setLocalError('WebSocket not connected. Please refresh the page.');
      return;
    }

    let isMounted = true;

    const initSession = async () => {
      setIsConnecting(true);
      setLocalError(null);

      try {
        console.log('[RemoteManagement] Creating session for node:', nodeReference);
        
        // Create new terminal session
        const sessionId = await createSession(nodeReference, {
          rows: 24,
          cols: 80,
          cwd: '/',
          env: {
            TERM: 'xterm-256color',
            LANG: 'en_US.UTF-8'
          }
        });

        if (isMounted) {
          sessionRef.current = sessionId;
          console.log('[RemoteManagement] Session created:', sessionId);
          
          // Get the session from service to attach listeners
          const session = terminalService.getSession(sessionId);
          if (session) {
            // Listen for output
            session.on('output', (data) => {
              if (terminalRef.current && isMounted) {
                terminalRef.current.write(data);
              }
            });

            // Listen for errors
            session.on('error', (error) => {
              console.error('[RemoteManagement] Session error:', error);
              if (isMounted) {
                setLocalError(`Terminal error: ${error}`);
              }
            });

            // Listen for close
            session.on('closed', () => {
              console.log('[RemoteManagement] Session closed');
              if (isMounted) {
                setLocalError('Terminal session closed');
              }
            });
          }
        }
      } catch (error) {
        console.error('[RemoteManagement] Failed to create session:', error);
        if (isMounted) {
          setLocalError(error.message || 'Failed to connect to terminal');
        }
      } finally {
        if (isMounted) {
          setIsConnecting(false);
        }
      }
    };

    // Initialize with a small delay to ensure WebSocket is ready
    const timer = setTimeout(initSession, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      
      // Clean up session on unmount
      if (sessionRef.current) {
        closeSession(sessionRef.current);
        sessionRef.current = null;
      }
    };
  }, [isOpen, nodeReference, wsState.connected, wsState.authenticated, isNodeOnline]);

  // Handle terminal input
  const handleTerminalInput = useCallback((data) => {
    if (sessionRef.current && isSessionActive) {
      sendInput(sessionRef.current, data);
    }
  }, [isSessionActive, sendInput]);

  // Handle terminal ready
  const handleTerminalReady = useCallback(() => {
    setTerminalReady(true);
    console.log('[RemoteManagement] Terminal UI ready');
  }, []);

  // Handle terminal resize
  const handleTerminalResize = useCallback((rows, cols) => {
    if (sessionRef.current && isSessionActive) {
      resizeSession(sessionRef.current, rows, cols);
    }
  }, [isSessionActive, resizeSession]);

  // Copy terminal content
  const copyTerminalContent = useCallback(() => {
    if (terminalRef.current) {
      const selection = terminalRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
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

  // Quick commands
  const quickCommands = [
    { label: 'List Files', command: 'ls -la\n' },
    { label: 'System Info', command: 'uname -a\n' },
    { label: 'Process List', command: 'ps aux | head -20\n' },
    { label: 'Network Info', command: 'ip addr\n' },
    { label: 'Disk Usage', command: 'df -h\n' },
    { label: 'Memory Info', command: 'free -h\n' },
    { label: 'Docker Status', command: 'docker ps\n' },
    { label: 'Clear Screen', command: 'clear\n' }
  ];

  // Execute quick command
  const executeCommand = (command) => {
    if (sessionRef.current && isSessionActive) {
      sendInput(sessionRef.current, command);
      setShowCommandPalette(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (showCommandPalette) {
          setShowCommandPalette(false);
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }

    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, isFullscreen, showCommandPalette]);

  if (!isOpen) return null;

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
          ref={containerRef}
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
                {wsState.connected && wsState.authenticated ? (
                  <>
                    <Wifi className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-green-400">Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-red-400" />
                    <span className="text-xs text-red-400">Disconnected</span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Quick Commands */}
              <button
                onClick={() => setShowCommandPalette(!showCommandPalette)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Quick Commands"
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
                <FileText className="w-4 h-4 text-gray-400" />
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
                title="Close"
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
                  <p className="text-xs text-gray-400 mb-2">Quick Commands</p>
                  <div className="grid grid-cols-4 gap-2">
                    {quickCommands.map((cmd, index) => (
                      <button
                        key={index}
                        onClick={() => executeCommand(cmd.command)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xs text-gray-300"
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
            {localError && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center p-6">
                  <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                  <p className="text-white mb-2">Terminal Error</p>
                  <p className="text-sm text-gray-400 mb-4">{localError}</p>
                  <button
                    onClick={() => {
                      setLocalError(null);
                      // Try to reconnect
                      window.location.reload();
                    }}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors text-sm text-red-400 border border-red-500/30"
                  >
                    Retry Connection
                  </button>
                </div>
              </div>
            )}

            {/* Connecting State */}
            {isConnecting && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
                  <p className="text-white mb-1">Connecting to Terminal</p>
                  <p className="text-xs text-gray-400">Establishing secure connection to {nodeReference}</p>
                </div>
              </div>
            )}

            {/* Node Offline Warning */}
            {!isNodeOnline && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center p-6">
                  <WifiOff className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                  <p className="text-white mb-2">Node Offline</p>
                  <p className="text-sm text-gray-400 mb-4">
                    Node {nodeReference} is currently offline. Terminal connection unavailable.
                  </p>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm"
                  >
                    Close Terminal
                  </button>
                </div>
              </div>
            )}

            {/* Terminal UI */}
            <TerminalUI
              ref={terminalRef}
              theme="dark"
              fontSize={14}
              onInput={handleTerminalInput}
              onReady={handleTerminalReady}
              onResize={handleTerminalResize}
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
                Session: {sessionRef.current || 'Not connected'}
              </span>
              {currentSession && (
                <>
                  <span className="text-gray-600">•</span>
                  <span className="text-gray-400">
                    Size: {currentSession.cols}×{currentSession.rows}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {terminalReady ? (
                <span className="text-green-400 flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Ready
                </span>
              ) : (
                <span className="text-yellow-400">Initializing...</span>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
