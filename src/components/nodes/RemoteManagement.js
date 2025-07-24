/**
 * Remote Management Component for Node Operations
 * 
 * File Path: src/components/nodes/RemoteManagement.js
 * 
 * Provides file listing and command execution capabilities
 * for individual nodes using the remote management API
 * 
 * @version 2.0.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal,
  FileText,
  Folder,
  Download,
  Upload,
  RefreshCw,
  X,
  ChevronRight,
  File,
  AlertCircle,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';
import { useWallet } from '../wallet/WalletProvider';
import nodeRegistrationService from '../../lib/api/nodeRegistration';

// Remote Management Service Class
class RemoteManagementService {
  constructor(apiBaseUrl = 'https://api.aeronyx.network/api/aeronyx') {
    this.apiBaseUrl = apiBaseUrl;
    this.wsUrl = 'wss://api.aeronyx.network/ws/aeronyx/user-monitor/';
    this.ws = null;
    this.jwtToken = null;
    this.isAuthenticated = false;
    this.isRemoteEnabled = false;
    this.pendingRequests = new Map();
  }

  async getRemoteManagementToken(walletAddress, signature, message, walletType, referenceCode) {
    const response = await nodeRegistrationService.generateRemoteManagementToken(
      walletAddress,
      signature,
      message,
      walletType,
      referenceCode
    );

    if (!response.success) {
      throw new Error(response.message || 'Failed to generate remote management token');
    }

    this.jwtToken = response.data.token;
    return response.data;
  }

  async connectWebSocket(walletAddress, signature, message, walletType) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      let authSteps = {
        connected: false,
        messageRequested: false,
        authenticated: false
      };

      this.ws.onopen = () => {
        console.log('Remote WebSocket opened');
        // Wait for 'connected' message from server
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Remote WebSocket message:', data);

        switch (data.type) {
          case 'connected':
            // Step 1: Connection established, request signature message
            authSteps.connected = true;
            this.ws.send(JSON.stringify({
              type: 'get_message',
              wallet_address: walletAddress.toLowerCase()
            }));
            authSteps.messageRequested = true;
            break;
            
          case 'signature_message':
            // Step 2: Received message to sign, send authentication
            // Extract wallet address from message for consistency
            const walletMatch = data.message.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/);
            const messageWallet = walletMatch ? walletMatch[1] : walletAddress;
            
            this.ws.send(JSON.stringify({
              type: 'auth',
              wallet_address: messageWallet.toLowerCase(),
              signature: signature,
              message: message,
              wallet_type: walletType
            }));
            break;

          case 'auth_success':
            // Step 3: Authentication successful, enable remote management
            this.isAuthenticated = true;
            authSteps.authenticated = true;
            
            // Send remote_auth with JWT token
            if (this.jwtToken) {
              this.ws.send(JSON.stringify({
                type: 'remote_auth',
                jwt_token: this.jwtToken
              }));
            } else {
              reject(new Error('JWT token not available'));
            }
            break;

          case 'remote_auth_success':
            // Step 4: Remote management enabled
            this.isRemoteEnabled = true;
            resolve(data);
            break;

          case 'remote_command_response':
            // Handle command responses
            this.handleCommandResponse(data);
            break;

          case 'error':
            console.error('Remote WebSocket error:', data);
            reject(new Error(data.message || 'WebSocket error'));
            break;
            
          case 'pong':
            // Handle ping/pong keepalive
            console.log('Pong received');
            break;
        }
      };

      this.ws.onerror = (error) => {
        console.error('Remote WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('Remote WebSocket disconnected');
        this.isAuthenticated = false;
        this.isRemoteEnabled = false;
      };

      // Set up ping interval to keep connection alive
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    });
  }

  async executeCommand(nodeReference, command, args = [], cwd = null) {
    if (!this.isRemoteEnabled) {
      throw new Error('Remote management not enabled');
    }

    const requestId = this.generateRequestId();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Command timeout'));
      }, 30000);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
      });

      this.ws.send(JSON.stringify({
        type: 'remote_command',
        node_reference: nodeReference,
        request_id: requestId,
        command: {
          type: 'execute',
          cmd: command,
          args: args,
          cwd: cwd,
        },
      }));
    });
  }

  async uploadFile(nodeReference, path, content, base64 = false) {
    if (!this.isRemoteEnabled) {
      throw new Error('Remote management not enabled');
    }

    const requestId = this.generateRequestId();

    if (!base64) {
      content = btoa(unescape(encodeURIComponent(content)));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Upload timeout'));
      }, 60000);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
      });

      this.ws.send(JSON.stringify({
        type: 'remote_command',
        node_reference: nodeReference,
        request_id: requestId,
        command: {
          type: 'upload',
          path: path,
          content: content,
          encoding: 'base64',
        },
      }));
    });
  }

  handleCommandResponse(data) {
    const { request_id, success, result, error } = data;
    const pending = this.pendingRequests.get(request_id);

    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(request_id);

      if (success) {
        pending.resolve(result);
      } else {
        pending.reject(new Error(error || 'Command failed'));
      }
    }
  }

  generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  disconnect() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isAuthenticated = false;
    this.isRemoteEnabled = false;
  }
}

// Main Component
export default function RemoteManagement({ nodeReference, isOpen, onClose }) {
  const { wallet } = useWallet();
  const [remoteService, setRemoteService] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  
  // Terminal state
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [currentPath, setCurrentPath] = useState('/');
  
  // File browser state
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState('terminal');
  
  const terminalRef = useRef(null);
  const historyIndexRef = useRef(-1);

  // Initialize remote management
  const initializeRemoteManagement = useCallback(async () => {
    if (!wallet.connected || !nodeReference) return;
    
    setIsConnecting(true);
    setError(null);
    
    try {
      const service = new RemoteManagementService();

      // Step 1: Generate signature message
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }
      const signatureMessage = messageResponse.data.message;

      // Step 2: Sign message with wallet
      const signature = await wallet.provider.request({
        method: 'personal_sign',
        params: [signatureMessage, wallet.address]
      });

      // Step 3: Get JWT Token for remote management
      await service.getRemoteManagementToken(
        wallet.address,
        signature,
        signatureMessage,
        'okx',
        nodeReference
      );

      // Step 4: Connect WebSocket with proper authentication flow
      await service.connectWebSocket(
        wallet.address, 
        signature, 
        signatureMessage, 
        'okx'
      );

      setRemoteService(service);
      setIsConnected(true);
      
      // Load initial directory
      loadDirectory('/');
    } catch (err) {
      console.error('Failed to initialize remote management:', err);
      setError(err.message);
    } finally {
      setIsConnecting(false);
    }
  }, [wallet, nodeReference]);

  // Execute command
  const executeCommand = useCallback(async (cmd) => {
    if (!remoteService || !cmd.trim()) return;

    const [cmdName, ...args] = cmd.trim().split(' ');
    
    // Add to history
    const entry = {
      type: 'command',
      content: cmd,
      timestamp: new Date().toISOString()
    };
    setCommandHistory(prev => [...prev, entry]);

    try {
      const result = await remoteService.executeCommand(
        nodeReference,
        cmdName,
        args,
        currentPath
      );

      // Add result to history
      setCommandHistory(prev => [...prev, {
        type: 'output',
        content: result.stdout || '',
        error: result.stderr || '',
        timestamp: new Date().toISOString()
      }]);

      // Handle cd command
      if (cmdName === 'cd' && result.success) {
        const newPath = args[0] || '/';
        setCurrentPath(newPath.startsWith('/') ? newPath : `${currentPath}/${newPath}`);
        loadDirectory(newPath);
      }
    } catch (err) {
      setCommandHistory(prev => [...prev, {
        type: 'error',
        content: err.message,
        timestamp: new Date().toISOString()
      }]);
    }
  }, [remoteService, nodeReference, currentPath]);

  // Load directory contents
  const loadDirectory = useCallback(async (path) => {
    if (!remoteService) return;
    
    setIsLoadingFiles(true);
    try {
      const result = await remoteService.executeCommand(
        nodeReference,
        'ls',
        ['-la', path]
      );

      // Parse ls output
      const lines = result.stdout.split('\n').slice(1).filter(line => line.trim());
      const parsedFiles = lines.map(line => {
        const parts = line.split(/\s+/);
        const name = parts.slice(8).join(' ');
        return {
          permissions: parts[0],
          owner: parts[2],
          group: parts[3],
          size: parseInt(parts[4]),
          date: `${parts[5]} ${parts[6]} ${parts[7]}`,
          name: name,
          isDirectory: parts[0].startsWith('d'),
          path: `${path}/${name}`.replace('//', '/')
        };
      }).filter(f => f.name !== '.' && f.name !== '..');

      setFiles(parsedFiles);
      setCurrentPath(path);
    } catch (err) {
      setError(`Failed to load directory: ${err.message}`);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [remoteService, nodeReference]);

  // Handle file click
  const handleFileClick = useCallback(async (file) => {
    if (file.isDirectory) {
      loadDirectory(file.path);
    } else {
      setSelectedFile(file);
      // Load file content if it's a text file
      try {
        const result = await remoteService.executeCommand(
          nodeReference,
          'cat',
          [file.path]
        );
        setSelectedFile({
          ...file,
          content: result.stdout
        });
      } catch (err) {
        setError(`Failed to read file: ${err.message}`);
      }
    }
  }, [remoteService, nodeReference, loadDirectory]);

  // Handle command input
  const handleCommandSubmit = useCallback((e) => {
    e.preventDefault();
    if (command.trim()) {
      executeCommand(command);
      setCommand('');
      historyIndexRef.current = -1;
    }
  }, [command, executeCommand]);

  // Handle key navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const commands = commandHistory.filter(h => h.type === 'command');
      if (commands.length > 0 && historyIndexRef.current < commands.length - 1) {
        historyIndexRef.current++;
        setCommand(commands[commands.length - 1 - historyIndexRef.current].content);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const commands = commandHistory.filter(h => h.type === 'command');
      if (historyIndexRef.current > 0) {
        historyIndexRef.current--;
        setCommand(commands[commands.length - 1 - historyIndexRef.current].content);
      } else {
        historyIndexRef.current = -1;
        setCommand('');
      }
    }
  }, [commandHistory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (remoteService) {
        remoteService.disconnect();
      }
    };
  }, [remoteService]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [commandHistory]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-black/90 border border-white/10 rounded-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">
              Remote Management - {nodeReference}
            </h2>
            {isConnected && (
              <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                Connected
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        {!isConnected ? (
          <div className="flex-1 flex items-center justify-center">
            {isConnecting ? (
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-4" />
                <p className="text-gray-400">Establishing secure connection...</p>
              </div>
            ) : error ? (
              <div className="text-center max-w-md">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={initializeRemoteManagement}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                >
                  Retry Connection
                </button>
              </div>
            ) : (
              <div className="text-center">
                <Terminal className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">Connect to manage your node remotely</p>
                <button
                  onClick={initializeRemoteManagement}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg transition-all"
                >
                  Enable Remote Management
                </button>
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
                File Browser
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'terminal' ? (
                <div className="h-full flex flex-col bg-black">
                  {/* Terminal Output */}
                  <div
                    ref={terminalRef}
                    className="flex-1 overflow-y-auto p-4 font-mono text-sm"
                  >
                    <div className="text-green-400 mb-2">
                      Welcome to AeroNyx Remote Terminal
                    </div>
                    <div className="text-gray-400 mb-4">
                      Connected to node: {nodeReference}
                    </div>
                    
                    {commandHistory.map((entry, index) => (
                      <div key={index} className="mb-2">
                        {entry.type === 'command' && (
                          <div className="flex items-start gap-2">
                            <span className="text-green-400">$</span>
                            <span className="text-white">{entry.content}</span>
                          </div>
                        )}
                        {entry.type === 'output' && (
                          <div className="text-gray-300 whitespace-pre-wrap pl-4">
                            {entry.content}
                            {entry.error && (
                              <div className="text-red-400">{entry.error}</div>
                            )}
                          </div>
                        )}
                        {entry.type === 'error' && (
                          <div className="text-red-400 pl-4">{entry.content}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Command Input */}
                  <form onSubmit={handleCommandSubmit} className="border-t border-white/10 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">$</span>
                      <input
                        type="text"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter command..."
                        className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none font-mono"
                        autoFocus
                      />
                    </div>
                  </form>
                </div>
              ) : (
                <div className="h-full flex">
                  {/* File List */}
                  <div className="w-80 border-r border-white/10 flex flex-col">
                    <div className="p-4 border-b border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-white">Files</h3>
                        <button
                          onClick={() => loadDirectory(currentPath)}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                          <RefreshCw className={clsx(
                            "w-4 h-4 text-gray-400",
                            isLoadingFiles && "animate-spin"
                          )} />
                        </button>
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {currentPath}
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-2">
                      {currentPath !== '/' && (
                        <button
                          onClick={() => {
                            const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
                            loadDirectory(parentPath);
                          }}
                          className="w-full text-left p-2 hover:bg-white/5 rounded flex items-center gap-2 text-gray-400"
                        >
                          <Folder className="w-4 h-4" />
                          <span>..</span>
                        </button>
                      )}
                      
                      {files.map((file, index) => (
                        <button
                          key={index}
                          onClick={() => handleFileClick(file)}
                          className={clsx(
                            "w-full text-left p-2 hover:bg-white/5 rounded flex items-center gap-2 transition-colors",
                            selectedFile?.path === file.path && "bg-white/10"
                          )}
                        >
                          {file.isDirectory ? (
                            <Folder className="w-4 h-4 text-yellow-400" />
                          ) : (
                            <File className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="text-sm text-gray-300 truncate">{file.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* File Content */}
                  <div className="flex-1 flex flex-col">
                    {selectedFile ? (
                      <>
                        <div className="p-4 border-b border-white/10">
                          <h3 className="font-semibold text-white truncate">
                            {selectedFile.name}
                          </h3>
                          <div className="text-xs text-gray-400 mt-1">
                            {selectedFile.size} bytes • {selectedFile.date}
                          </div>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                          {selectedFile.content ? (
                            <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                              {selectedFile.content}
                            </pre>
                          ) : (
                            <div className="text-center text-gray-400 py-8">
                              {selectedFile.isDirectory ? 'This is a directory' : 'Select a text file to view its content'}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-gray-400">
                        Select a file to view its content
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
