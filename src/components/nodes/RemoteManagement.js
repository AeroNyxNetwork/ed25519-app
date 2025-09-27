/**
 * ============================================
 * File: src/components/nodes/RemoteManagement.js
 * ============================================
 * Fixed Remote Management Component
 * Works with existing useRemoteManagement hook
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
  ChevronRight
} from 'lucide-react';
import clsx from 'clsx';

// Import the terminal UI component
import TerminalUI from '../terminal/TerminalUI';

// Import the existing hook that's working
import { useRemoteManagement } from '../../hooks/useRemoteManagement';

export default function RemoteManagement({ nodeReference, isOpen, onClose }) {
  // Use the existing hook that's working
  const {
    terminalSession,
    terminalReady,
    isConnecting: hookIsConnecting,
    error: hookError,
    initializeTerminal,
    sendTerminalInput,
    closeTerminal,
    executeCommand
  } = useRemoteManagement(nodeReference);

  // Local state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [localTerminalReady, setLocalTerminalReady] = useState(false);

  // Refs
  const terminalRef = useRef(null);
  const outputBufferRef = useRef('');
  const initTimeoutRef = useRef(null);

  // Initialize terminal when component opens
  useEffect(() => {
    if (!isOpen || !nodeReference) return;

    let mounted = true;

    const init = async () => {
      console.log('[RemoteManagement] Initializing terminal for node:', nodeReference);
      
      try {
        // Use the existing hook's initialize function
        const result = await initializeTerminal();
        
        if (mounted && result && result.sessionId) {
          console.log('[RemoteManagement] Terminal initialized:', result.sessionId);
          setLocalTerminalReady(true);
          
          // Write any buffered output
          if (outputBufferRef.current && terminalRef.current) {
            terminalRef.current.write(outputBufferRef.current);
            outputBufferRef.current = '';
          }
        }
      } catch (error) {
        console.error('[RemoteManagement] Failed to initialize terminal:', error);
      }
    };

    // Small delay to ensure WebSocket is ready
    initTimeoutRef.current = setTimeout(init, 100);

    return () => {
      mounted = false;
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
    };
  }, [isOpen, nodeReference, initializeTerminal]);

  // Listen for terminal output from WebSocket
  useEffect(() => {
    if (!isOpen) return;

    const handleWebSocketMessage = (event) => {
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        
        // Handle terminal output
        if (message.type === 'term_output' && message.session_id === terminalSession) {
          console.log('[RemoteManagement] Received terminal output:', message.data?.length || 0, 'bytes');
          
          if (message.data && terminalRef.current) {
            // Write directly to terminal
            terminalRef.current.write(message.data);
          } else if (message.data) {
            // Buffer if terminal not ready
            outputBufferRef.current += message.data;
          }
        }
      } catch (error) {
        // Not JSON or not for us, ignore
      }
    };

    // Listen to the global WebSocket
    const ws = window.globalWebSocket;
    if (ws) {
      ws.addEventListener('message', handleWebSocketMessage);
      console.log('[RemoteManagement] Attached WebSocket listener');
      
      return () => {
        ws.removeEventListener('message', handleWebSocketMessage);
        console.log('[RemoteManagement] Removed WebSocket listener');
      };
    }
  }, [isOpen, terminalSession]);

  // Handle terminal ready
  useEffect(() => {
    if (terminalReady && terminalRef.current) {
      console.log('[RemoteManagement] Terminal is ready, writing buffered output');
      
      // Write any buffered output
      if (outputBufferRef.current) {
        terminalRef.current.write(outputBufferRef.current);
        outputBufferRef.current = '';
      }
    }
  }, [terminalReady]);

  // Handle terminal input
  const handleTerminalInput = useCallback((data) => {
    if (terminalSession && terminalReady) {
      console.log('[RemoteManagement] Sending input:', data.length, 'bytes');
      sendTerminalInput(data);
    }
  }, [terminalSession, terminalReady, sendTerminalInput]);

  // Handle terminal ready event from UI
  const handleTerminalUIReady = useCallback(() => {
    console.log('[RemoteManagement] Terminal UI is ready');
    
    // Write any buffered output
    if (outputBufferRef.current && terminalRef.current) {
      terminalRef.current.write(outputBufferRef.current);
      outputBufferRef.current = '';
    }
  }, []);

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
  const executeQuickCommand = (command) => {
    if (terminalSession && terminalReady) {
      sendTerminalInput(command);
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

  // Cleanup on close
  useEffect(() => {
    if (!isOpen && terminalSession) {
      console.log('[RemoteManagement] Closing terminal session');
      closeTerminal();
      setLocalTerminalReady(false);
      outputBufferRef.current = '';
    }
  }, [isOpen, terminalSession, closeTerminal]);

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
                {terminalReady ? (
                  <>
                    <Wifi className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-green-400">Connected</span>
                  </>
                ) : hookIsConnecting ? (
                  <>
                    <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
                    <span className="text-xs text-yellow-400">Connecting...</span>
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
                        onClick={() => executeQuickCommand(cmd.command)}
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
            {hookError && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center p-6">
                  <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                  <p className="text-white mb-2">Terminal Error</p>
                  <p className="text-sm text-gray-400 mb-4">{hookError}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors text-sm text-red-400 border border-red-500/30"
                  >
                    Retry Connection
                  </button>
                </div>
              </div>
            )}

            {/* Connecting State */}
            {hookIsConnecting && !terminalReady && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
                  <p className="text-white mb-1">Connecting to Terminal</p>
                  <p className="text-xs text-gray-400">Establishing secure connection to {nodeReference}</p>
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
