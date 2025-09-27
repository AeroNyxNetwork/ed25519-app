/**
 * ============================================
 * File: src/components/nodes/UpdatedRemoteManagement.js
 * ============================================
 * Updated Remote Management Component
 * Uses new architecture with proper separation of concerns
 * 
 * Responsibilities:
 * 1. Remote management UI orchestration
 * 2. Tab navigation (Terminal, Files, System Info)
 * 3. JWT token management for remote access
 * 4. Coordination with terminal container
 * ============================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal,
  FileText,
  Folder,
  X,
  AlertCircle,
  Loader2,
  Monitor,
  HardDrive,
  Key,
  RefreshCw,
  Clock,
  Cpu,
  Database,
  Wifi,
  Activity,
  CheckCircle
} from 'lucide-react';
import clsx from 'clsx';

// Import new architecture components
import TerminalContainer from '../terminal/TerminalContainer';
import FileManager from './FileManager';
import SystemInfo from './SystemInfo';
import useTerminalStore from '../../stores/terminalStore';
import webSocketService from '../../services/WebSocketService';
import nodeRegistrationService from '../../lib/api/nodeRegistration';
import { useGlobalSignature } from '../../hooks/useGlobalSignature';

/**
 * Updated Remote Management Component
 * Simplified and refactored for better architecture
 */
export default function UpdatedRemoteManagement({ 
  nodeReference, 
  isOpen, 
  onClose 
}) {
  // ==================== State Management ====================
  
  // Authentication state
  const [isEnabled, setIsEnabled] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState(null);
  const [jwtToken, setJwtToken] = useState(null);
  const [jwtExpiry, setJwtExpiry] = useState(null);
  
  // UI state
  const [activeTab, setActiveTab] = useState('terminal');
  
  // Refs
  const initializationRef = useRef(false);
  const jwtTokenRef = useRef(null);
  const jwtExpiryRef = useRef(null);
  
  // Get store state
  const { nodes, wsState } = useTerminalStore();
  const node = nodes[nodeReference];
  const isNodeOnline = node && (node.status === 'online' || node.status === 'active');
  
  // Global signature hook
  const {
    signature,
    message,
    ensureSignature,
    isLoading: isSignatureLoading,
    error: signatureError,
    remainingTimeFormatted
  } = useGlobalSignature();
  
  // ==================== JWT Token Management ====================
  
  /**
   * Check if JWT token is still valid
   */
  const isJwtValid = useCallback(() => {
    if (!jwtTokenRef.current || !jwtExpiryRef.current) return false;
    return Date.now() < jwtExpiryRef.current;
  }, []);
  
  /**
   * Enable remote management
   * Handles JWT token acquisition and authentication
   */
  const enableRemoteManagement = useCallback(async () => {
    console.log('[RemoteManagement] Enabling remote management for node:', nodeReference);
    
    // Check prerequisites
    if (!nodeReference) {
      setError('No node reference provided');
      return false;
    }
    
    if (!isNodeOnline) {
      setError('Node is offline. Remote management is not available.');
      return false;
    }
    
    if (!wsState.authenticated) {
      setError('WebSocket not authenticated. Please wait...');
      return false;
    }
    
    // Check if already enabled with valid JWT
    if (isEnabled && isJwtValid()) {
      console.log('[RemoteManagement] Already enabled with valid JWT');
      return true;
    }
    
    setIsEnabling(true);
    setError(null);
    
    try {
      // Step 1: Ensure we have a valid signature
      console.log('[RemoteManagement] Step 1: Ensuring valid signature');
      const signatureData = await ensureSignature();
      
      if (!signatureData || !signatureData.signature || !signatureData.message) {
        throw new Error('Failed to obtain signature');
      }
      
      console.log('[RemoteManagement] Using signature (valid for:', remainingTimeFormatted, ')');
      
      // Step 2: Get JWT token for remote management
      console.log('[RemoteManagement] Step 2: Getting JWT token');
      const tokenResponse = await nodeRegistrationService.generateRemoteManagementToken(
        signatureData.wallet,
        signatureData.signature,
        signatureData.message,
        'okx', // wallet type
        nodeReference
      );
      
      if (!tokenResponse.success) {
        throw new Error(tokenResponse.message || 'Failed to get remote management token');
      }
      
      const token = tokenResponse.data?.token;
      if (!token) {
        throw new Error('No JWT token received from server');
      }
      
      // Store JWT token (valid for 59 minutes)
      jwtTokenRef.current = token;
      jwtExpiryRef.current = Date.now() + (59 * 60 * 1000);
      setJwtToken(token);
      setJwtExpiry(jwtExpiryRef.current);
      
      console.log('[RemoteManagement] JWT token received and stored');
      
      // Step 3: Send remote_auth message via WebSocket
      console.log('[RemoteManagement] Step 3: Authenticating with WebSocket');
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Remote authentication timeout'));
        }, 10000);
        
        // Set up one-time listener for authentication response
        const handleAuthResponse = (message) => {
          clearTimeout(timeout);
          webSocketService.off('remoteAuthSuccess', handleAuthResponse);
          webSocketService.off('error', handleErrorResponse);
          
          console.log('[RemoteManagement] Remote authentication successful');
          setIsEnabled(true);
          setIsEnabling(false);
          resolve(true);
        };
        
        const handleErrorResponse = (message) => {
          if (message.code === 'AUTH_FAILED' || 
              message.code === 'INVALID_TOKEN' ||
              message.message?.includes('JWT')) {
            clearTimeout(timeout);
            webSocketService.off('remoteAuthSuccess', handleAuthResponse);
            webSocketService.off('error', handleErrorResponse);
            
            // Clear JWT on auth failure
            jwtTokenRef.current = null;
            jwtExpiryRef.current = null;
            setJwtToken(null);
            setJwtExpiry(null);
            
            reject(new Error(message.message || 'Remote authentication failed'));
          }
        };
        
        // Listen for responses
        webSocketService.once('remoteAuthSuccess', handleAuthResponse);
        webSocketService.once('error', handleErrorResponse);
        
        // Send authentication message
        const authSuccess = webSocketService.send({
          type: 'remote_auth',
          jwt_token: token
        });
        
        if (!authSuccess) {
          clearTimeout(timeout);
          webSocketService.off('remoteAuthSuccess', handleAuthResponse);
          webSocketService.off('error', handleErrorResponse);
          reject(new Error('Failed to send authentication message'));
        }
      });
      
    } catch (err) {
      console.error('[RemoteManagement] Failed to enable:', err);
      setError(err.message);
      setIsEnabling(false);
      setIsEnabled(false);
      
      // Clear JWT on error
      jwtTokenRef.current = null;
      jwtExpiryRef.current = null;
      setJwtToken(null);
      setJwtExpiry(null);
      
      return false;
    }
  }, [nodeReference, isNodeOnline, wsState.authenticated, isJwtValid, ensureSignature, remainingTimeFormatted]);
  
  /**
   * Execute remote command (for file manager and system info)
   */
  const executeCommand = useCallback(async (command, args = [], cwd = null) => {
    if (!isEnabled) {
      throw new Error('Remote management not enabled');
    }
    
    // Check and refresh JWT if needed
    if (!isJwtValid()) {
      console.log('[RemoteManagement] JWT expired, re-enabling');
      const success = await enableRemoteManagement();
      if (!success) {
        throw new Error('Failed to re-enable remote management');
      }
    }
    
    // Send command via WebSocket service
    return webSocketService.sendRequest({
      type: 'remote_command',
      node_reference: nodeReference,
      command: {
        type: 'execute',
        cmd: command,
        args: args,
        cwd: cwd
      }
    });
  }, [isEnabled, nodeReference, isJwtValid, enableRemoteManagement]);
  
  /**
   * Upload file (for file manager)
   */
  const uploadFile = useCallback(async (path, content, base64 = false) => {
    if (!isEnabled) {
      throw new Error('Remote management not enabled');
    }
    
    // Check and refresh JWT if needed
    if (!isJwtValid()) {
      console.log('[RemoteManagement] JWT expired, re-enabling');
      const success = await enableRemoteManagement();
      if (!success) {
        throw new Error('Failed to re-enable remote management');
      }
    }
    
    // Encode content if needed
    if (!base64) {
      content = btoa(unescape(encodeURIComponent(content)));
    }
    
    // Send upload command via WebSocket service
    return webSocketService.sendRequest({
      type: 'remote_command',
      node_reference: nodeReference,
      command: {
        type: 'upload',
        path: path,
        content: content,
        encoding: 'base64'
      }
    });
  }, [isEnabled, nodeReference, isJwtValid, enableRemoteManagement]);
  
  // ==================== Effects ====================
  
  /**
   * Initialize remote management when modal opens
   */
  useEffect(() => {
    if (isOpen && !isEnabled && !isEnabling && !initializationRef.current) {
      console.log('[RemoteManagement] Modal opened, initializing');
      initializationRef.current = true;
      
      enableRemoteManagement()
        .then((success) => {
          if (success) {
            console.log('[RemoteManagement] Successfully enabled');
          }
        })
        .catch((err) => {
          console.error('[RemoteManagement] Initialization failed:', err);
        })
        .finally(() => {
          initializationRef.current = false;
        });
    }
  }, [isOpen, isEnabled, isEnabling, enableRemoteManagement]);
  
  /**
   * Cleanup on close
   */
  const handleClose = useCallback(() => {
    console.log('[RemoteManagement] Closing modal');
    
    // Reset state
    setActiveTab('terminal');
    setError(null);
    initializationRef.current = false;
    
    // Note: Don't clear JWT token as it can be reused
    
    onClose();
  }, [onClose]);
  
  // ==================== Render ====================
  
  if (!isOpen) return null;
  
  const displayError = error || signatureError;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-black/90 border border-white/10 rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">
              Remote Management - {nodeReference}
            </h2>
            
            {/* Connection Status */}
            {isEnabled && (
              <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Connected
              </span>
            )}
            
            {/* Signature Status */}
            {remainingTimeFormatted && !isSignatureLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Key className="w-3 h-3" />
                <span>Signature: {remainingTimeFormatted}</span>
              </div>
            )}
          </div>
          
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        {/* Content */}
        {!isEnabled ? (
          // Loading/Error State
          <div className="flex-1 flex items-center justify-center">
            {isEnabling || isSignatureLoading ? (
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-4" />
                <p className="text-gray-400">
                  {isSignatureLoading ? 'Preparing signature...' : 'Enabling remote management...'}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {isSignatureLoading ? 'Please approve the signature request' : 'This may take a few seconds'}
                </p>
              </div>
            ) : displayError ? (
              // Error State
              <div className="text-center max-w-md">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <p className="text-red-400 mb-4">{displayError}</p>
                {!isNodeOnline && (
                  <p className="text-gray-400 text-sm mb-4">
                    The node must be online to use remote management features.
                  </p>
                )}
                <button
                  onClick={() => {
                    setError(null);
                    initializationRef.current = true;
                    enableRemoteManagement()
                      .then((success) => {
                        if (!success) {
                          console.log('[RemoteManagement] Retry failed');
                        }
                      })
                      .catch((err) => {
                        setError(err.message);
                      })
                      .finally(() => {
                        initializationRef.current = false;
                      });
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                  disabled={!isNodeOnline}
                >
                  Retry Connection
                </button>
              </div>
            ) : (
              // Initializing State
              <div className="text-center">
                <Terminal className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">Initializing remote management...</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setActiveTab('terminal')}
                className={clsx(
                  "px-6 py-3 flex items-center gap-2 transition-all",
                  activeTab === 'terminal'
                    ? "bg-white/10 text-white border-b-2 border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Terminal className="w-4 h-4" />
                Terminal
              </button>
              
              <button
                onClick={() => setActiveTab('files')}
                className={clsx(
                  "px-6 py-3 flex items-center gap-2 transition-all",
                  activeTab === 'files'
                    ? "bg-white/10 text-white border-b-2 border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Folder className="w-4 h-4" />
                File Manager
              </button>
              
              <button
                onClick={() => setActiveTab('system')}
                className={clsx(
                  "px-6 py-3 flex items-center gap-2 transition-all",
                  activeTab === 'system'
                    ? "bg-white/10 text-white border-b-2 border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Monitor className="w-4 h-4" />
                System Info
              </button>
            </div>
            
            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'terminal' ? (
                <div className="h-full p-4">
                  <TerminalContainer
                    nodeReference={nodeReference}
                    autoConnect={true}
                    showHeader={false}
                    className="h-full"
                  />
                </div>
              ) : activeTab === 'files' ? (
                <FileManager 
                  nodeReference={nodeReference}
                  executeCommand={executeCommand}
                  uploadFile={uploadFile}
                />
              ) : activeTab === 'system' ? (
                <SystemInfo
                  nodeReference={nodeReference}
                  executeCommand={executeCommand}
                />
              ) : null}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
