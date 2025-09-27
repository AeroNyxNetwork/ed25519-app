/**
 * ============================================
 * File: src/components/nodes/RemoteManagement.js
 * ============================================
 * Remote Management Component - Terminal and Control Interface
 * 
 * Creation Reason: Provide terminal access to remote nodes
 * Modification Reason: Fixed import error and integrated with existing services
 * Main Functionality: Terminal interface for remote node management
 * Dependencies: TerminalContainer, terminalStore, webSocketService
 * 
 * Main Logical Flow:
 * 1. Check WebSocket authentication status
 * 2. Verify node is online before allowing terminal
 * 3. Create terminal session when user clicks connect
 * 4. Handle terminal lifecycle and cleanup
 * 
 * ⚠️ Important Note for Next Developer:
 * - This component no longer uses useRemoteManagement hook
 * - Terminal functionality is provided by TerminalContainer
 * - WebSocket state comes from terminalStore
 * - Must ensure WebSocket is authenticated before terminal init
 * 
 * Last Modified: v3.0.0 - Removed useRemoteManagement dependency
 * ============================================
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal,
  Power,
  RefreshCw,
  Download,
  Upload,
  Settings,
  Activity,
  HardDrive,
  Cpu,
  MemoryStick,
  Network,
  Shield,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  FileText,
  FolderOpen,
  Clock,
  Wifi,
  WifiOff,
  MonitorSpeaker,
  Database
} from 'lucide-react';
import clsx from 'clsx';

// Import Terminal Container and stores
import TerminalContainer from '../terminal/TerminalContainer';
import useTerminalStore from '../../stores/terminalStore';
import { useAeroNyxWebSocket } from '../../hooks/useAeroNyxWebSocket';

/**
 * Remote Management Component
 * Provides terminal and control interface for remote nodes
 */
export default function RemoteManagement({ 
  nodeCode,
  nodeData,
  className 
}) {
  // ==================== State Management ====================
  
  // Terminal state
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalSessionId, setTerminalSessionId] = useState(null);
  
  // Control panel state
  const [activeTab, setActiveTab] = useState('terminal');
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  const [commandOutput, setCommandOutput] = useState('');
  
  // File browser state
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  
  // Get store state
  const { wsState, nodes, getNodeSessions } = useTerminalStore();
  
  // Get WebSocket state
  const { 
    wsState: wsConnectionState,
    nodes: wsNodes 
  } = useAeroNyxWebSocket({
    autoConnect: true,
    autoMonitor: true
  });
  
  // Determine node status
  const node = nodes[nodeCode] || wsNodes?.find(n => n.code === nodeCode) || nodeData;
  const isNodeOnline = node && (
    node.status === 'online' || 
    node.status === 'active' ||
    node.status === 'running'
  );
  
  const isWebSocketReady = (
    wsState?.authenticated || 
    wsConnectionState?.authenticated
  );
  
  // Get existing sessions for this node
  const nodeSessions = getNodeSessions(nodeCode);
  const hasActiveSession = nodeSessions.some(s => s.state === 'ready');
  
  // ==================== Command Execution ====================
  
  /**
   * Execute remote command
   */
  const executeCommand = useCallback(async (command) => {
    setIsExecutingCommand(true);
    setCommandOutput('');
    
    try {
      // Here you would integrate with your command execution service
      // For now, we'll show a placeholder
      setCommandOutput(`Executing: ${command}\n\nThis feature requires backend integration.`);
      
      // Simulate command execution
      setTimeout(() => {
        setCommandOutput(prev => prev + '\n\nCommand completed successfully.');
        setIsExecutingCommand(false);
      }, 2000);
      
    } catch (error) {
      console.error('[RemoteManagement] Command execution error:', error);
      setCommandOutput(`Error: ${error.message}`);
      setIsExecutingCommand(false);
    }
  }, []);
  
  /**
   * Quick actions
   */
  const handleRestart = useCallback(() => {
    executeCommand('sudo systemctl restart aeronyx-node');
  }, [executeCommand]);
  
  const handleUpdate = useCallback(() => {
    executeCommand('aeronyx-node update');
  }, [executeCommand]);
  
  const handleViewLogs = useCallback(() => {
    executeCommand('tail -n 100 /var/log/aeronyx-node/node.log');
  }, [executeCommand]);
  
  // ==================== File Browser ====================
  
  /**
   * Load files for current path
   */
  const loadFiles = useCallback(async (path) => {
    setIsLoadingFiles(true);
    
    try {
      // Here you would integrate with your file browser service
      // For now, we'll show mock data
      setFiles([
        { name: '..', type: 'directory', size: 0 },
        { name: 'var', type: 'directory', size: 4096 },
        { name: 'etc', type: 'directory', size: 4096 },
        { name: 'home', type: 'directory', size: 4096 },
        { name: 'node.conf', type: 'file', size: 2048 },
        { name: 'startup.log', type: 'file', size: 10240 },
      ]);
      
    } catch (error) {
      console.error('[RemoteManagement] Failed to load files:', error);
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);
  
  /**
   * Navigate to path
   */
  const navigateToPath = useCallback((path) => {
    setCurrentPath(path);
    loadFiles(path);
  }, [loadFiles]);
  
  // Load initial files
  useEffect(() => {
    if (activeTab === 'files' && files.length === 0) {
      loadFiles(currentPath);
    }
  }, [activeTab, currentPath, files.length, loadFiles]);
  
  // ==================== Terminal Management ====================
  
  /**
   * Handle terminal close
   */
  const handleTerminalClose = useCallback(() => {
    setShowTerminal(false);
    setTerminalSessionId(null);
  }, []);
  
  /**
   * Handle terminal error
   */
  const handleTerminalError = useCallback((error) => {
    console.error('[RemoteManagement] Terminal error:', error);
  }, []);
  
  // ==================== Render Helpers ====================
  
  /**
   * Render connection status
   */
  const renderConnectionStatus = () => {
    if (!isWebSocketReady) {
      return (
        <div className="flex items-center gap-2 text-yellow-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Connecting to WebSocket...</span>
        </div>
      );
    }
    
    if (!isNodeOnline) {
      return (
        <div className="flex items-center gap-2 text-red-500">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm">Node Offline</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-2 text-green-500">
        <Wifi className="w-4 h-4" />
        <span className="text-sm">Ready</span>
      </div>
    );
  };
  
  /**
   * Render system info
   */
  const renderSystemInfo = () => {
    const systemInfo = node?.system_info || {};
    const performance = node?.performance || {};
    
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-400">CPU Usage</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {performance.cpu || 0}%
          </div>
        </div>
        
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <MemoryStick className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-400">Memory</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {performance.memory || 0}%
          </div>
        </div>
        
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-400">Storage</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {performance.storage || 0}%
          </div>
        </div>
        
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Network className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-gray-400">Network</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {performance.network || 0} Mbps
          </div>
        </div>
      </div>
    );
  };
  
  // ==================== Main Render ====================
  
  return (
    <div className={clsx('remote-management', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white">Remote Management</h3>
        {renderConnectionStatus()}
      </div>
      
      {/* System Info */}
      <div className="mb-6">
        {renderSystemInfo()}
      </div>
      
      {/* Control Tabs */}
      <div className="mb-4 border-b border-white/10">
        <nav className="flex gap-4">
          {[
            { id: 'terminal', label: 'Terminal', icon: Terminal },
            { id: 'commands', label: 'Commands', icon: Settings },
            { id: 'files', label: 'Files', icon: FolderOpen },
            { id: 'logs', label: 'Logs', icon: FileText }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              )}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
      
      {/* Tab Content */}
      <div className="min-h-[400px]">
        {/* Terminal Tab */}
        {activeTab === 'terminal' && (
          <div>
            {!showTerminal ? (
              <div className="text-center py-12">
                <Terminal className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-white mb-2">
                  Terminal Access
                </h4>
                <p className="text-gray-400 mb-6 max-w-md mx-auto">
                  Connect to the node's terminal for direct command-line access.
                  {!isNodeOnline && ' Node must be online to establish connection.'}
                  {!isWebSocketReady && ' Waiting for WebSocket authentication...'}
                </p>
                
                <button
                  onClick={() => setShowTerminal(true)}
                  disabled={!isNodeOnline || !isWebSocketReady}
                  className={clsx(
                    'px-6 py-2 rounded-lg font-medium transition-all',
                    isNodeOnline && isWebSocketReady
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  )}
                >
                  {!isWebSocketReady ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </span>
                  ) : !isNodeOnline ? (
                    'Node Offline'
                  ) : hasActiveSession ? (
                    'Reconnect to Terminal'
                  ) : (
                    'Open Terminal'
                  )}
                </button>
              </div>
            ) : (
              <TerminalContainer
                nodeReference={nodeCode}
                sessionId={terminalSessionId}
                autoConnect={true}
                theme="dark"
                onClose={handleTerminalClose}
                onError={handleTerminalError}
                className="h-[500px]"
              />
            )}
          </div>
        )}
        
        {/* Commands Tab */}
        {activeTab === 'commands' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={handleRestart}
                disabled={!isNodeOnline || isExecutingCommand}
                className="flex items-center gap-3 p-4 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-5 h-5 text-blue-400" />
                <div className="text-left">
                  <p className="font-medium text-white">Restart Node</p>
                  <p className="text-xs text-gray-400">Restart the node service</p>
                </div>
              </button>
              
              <button
                onClick={handleUpdate}
                disabled={!isNodeOnline || isExecutingCommand}
                className="flex items-center gap-3 p-4 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
              >
                <Download className="w-5 h-5 text-green-400" />
                <div className="text-left">
                  <p className="font-medium text-white">Update Node</p>
                  <p className="text-xs text-gray-400">Check for updates</p>
                </div>
              </button>
              
              <button
                onClick={handleViewLogs}
                disabled={!isNodeOnline || isExecutingCommand}
                className="flex items-center gap-3 p-4 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
              >
                <FileText className="w-5 h-5 text-purple-400" />
                <div className="text-left">
                  <p className="font-medium text-white">View Logs</p>
                  <p className="text-xs text-gray-400">Show recent logs</p>
                </div>
              </button>
            </div>
            
            {/* Command Output */}
            {commandOutput && (
              <div className="bg-black/50 rounded-lg p-4 font-mono text-sm">
                <pre className="text-gray-300 whitespace-pre-wrap">{commandOutput}</pre>
              </div>
            )}
          </div>
        )}
        
        {/* Files Tab */}
        {activeTab === 'files' && (
          <div>
            {/* Path breadcrumb */}
            <div className="flex items-center gap-2 mb-4 text-sm">
              <FolderOpen className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400">Current path:</span>
              <span className="text-white font-mono">{currentPath}</span>
            </div>
            
            {/* File list */}
            <div className="bg-gray-800/30 rounded-lg overflow-hidden">
              {isLoadingFiles ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-2 text-sm text-gray-400">Name</th>
                      <th className="text-left px-4 py-2 text-sm text-gray-400">Type</th>
                      <th className="text-left px-4 py-2 text-sm text-gray-400">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file, index) => (
                      <tr
                        key={index}
                        className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                        onClick={() => {
                          if (file.type === 'directory') {
                            if (file.name === '..') {
                              const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
                              navigateToPath(parentPath);
                            } else {
                              navigateToPath(`${currentPath}/${file.name}`.replace('//', '/'));
                            }
                          }
                        }}
                      >
                        <td className="px-4 py-2 text-sm text-white flex items-center gap-2">
                          {file.type === 'directory' ? (
                            <FolderOpen className="w-4 h-4 text-yellow-400" />
                          ) : (
                            <FileText className="w-4 h-4 text-gray-400" />
                          )}
                          {file.name}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-400">
                          {file.type}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-400">
                          {file.size > 0 ? `${(file.size / 1024).toFixed(1)} KB` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
        
        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="bg-black/50 rounded-lg p-4 h-[400px] overflow-auto">
            <pre className="text-xs text-gray-300 font-mono">
              {`[2024-01-10 10:30:45] INFO: Node started successfully
[2024-01-10 10:30:46] INFO: Connected to network
[2024-01-10 10:30:47] INFO: Synchronizing with peers
[2024-01-10 10:30:48] INFO: Ready to accept connections
[2024-01-10 10:31:00] INFO: Health check passed
[2024-01-10 10:32:00] INFO: Performance metrics updated
[2024-01-10 10:33:00] INFO: Processed 1024 requests
[2024-01-10 10:34:00] INFO: Memory usage: 45%
[2024-01-10 10:35:00] INFO: CPU usage: 32%
[2024-01-10 10:36:00] INFO: Active connections: 12`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
