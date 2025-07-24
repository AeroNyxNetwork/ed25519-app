/**
 * Remote Management Component for Node Operations
 * 
 * File Path: src/components/nodes/RemoteManagement.js
 * 
 * Provides file listing and command execution capabilities
 * for individual nodes using the remote management API
 * 
 * @version 3.0.0
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
import { useRemoteManagement } from '../../hooks/useRemoteManagement';

// Main Component
export default function RemoteManagement({ nodeReference, isOpen, onClose }) {
  const {
    isEnabled,
    isEnabling,
    error: remoteError,
    enableRemoteManagement,
    executeCommand: executeRemoteCommand,
    uploadFile
  } = useRemoteManagement(nodeReference);
  
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

  // Initialize remote management when modal opens
  useEffect(() => {
    if (isOpen && !isEnabled && !isEnabling && nodeReference) {
      enableRemoteManagement()
        .then((success) => {
          if (success) {
            loadDirectory('/');
          }
        })
        .catch((err) => {
          setError(err.message);
        });
    }
  }, [isOpen, isEnabled, isEnabling, nodeReference, enableRemoteManagement]);

  // Execute command
  const executeCommand = useCallback(async (cmd) => {
    if (!isEnabled || !cmd.trim()) return;

    const [cmdName, ...args] = cmd.trim().split(' ');
    
    // Add to history
    const entry = {
      type: 'command',
      content: cmd,
      timestamp: new Date().toISOString()
    };
    setCommandHistory(prev => [...prev, entry]);

    try {
      const result = await executeRemoteCommand(cmdName, args, currentPath);

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
  }, [isEnabled, executeRemoteCommand, currentPath]);

  // Load directory contents
  const loadDirectory = useCallback(async (path) => {
    if (!isEnabled) return;
    
    setIsLoadingFiles(true);
    try {
      const result = await executeRemoteCommand('ls', ['-la', path]);

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
  }, [isEnabled, executeRemoteCommand]);

  // Handle file click
  const handleFileClick = useCallback(async (file) => {
    if (file.isDirectory) {
      loadDirectory(file.path);
    } else {
      setSelectedFile(file);
      // Load file content if it's a text file
      try {
        const result = await executeRemoteCommand('cat', [file.path]);
        setSelectedFile({
          ...file,
          content: result.stdout
        });
      } catch (err) {
        setError(`Failed to read file: ${err.message}`);
      }
    }
  }, [executeRemoteCommand, loadDirectory]);

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

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [commandHistory]);

  if (!isOpen) return null;

  const displayError = error || remoteError;

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
            {isEnabled && (
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
        {!isEnabled ? (
          <div className="flex-1 flex items-center justify-center">
            {isEnabling ? (
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-4" />
                <p className="text-gray-400">Enabling remote management...</p>
              </div>
            ) : displayError ? (
              <div className="text-center max-w-md">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <p className="text-red-400 mb-4">{displayError}</p>
                <button
                  onClick={() => {
                    setError(null);
                    enableRemoteManagement()
                      .then((success) => {
                        if (success) {
                          loadDirectory('/');
                        }
                      })
                      .catch((err) => {
                        setError(err.message);
                      });
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                >
                  Retry Connection
                </button>
              </div>
            ) : (
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
