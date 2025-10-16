/**
 * ============================================
 * File: src/components/nodes/FileManager.js
 * ============================================
 * File Manager Component - PRODUCTION VERSION v7.0.0
 * 
 * Main Functionality:
 * - Browse remote file system
 * - Edit text files
 * - Delete files and directories
 * - Handle REMOTE_NOT_ENABLED error gracefully
 * - Wait for authentication before operations
 * 
 * Dependencies: useRemoteManagement hook, lucide-react icons
 * 
 * ⚠️ Important Notes:
 * - All operations use remote_command API (not terminal)
 * - Must wait for isRemoteAuthenticated before any operations
 * - Gracefully handles backend configuration errors
 * 
 * Last Modified: v7.0.0 - Production complete with error handling
 * ============================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  File,
  FileText,
  FileCode,
  Image,
  Film,
  Music,
  Archive,
  ChevronRight,
  Home,
  RefreshCw,
  Upload,
  Download,
  Edit,
  Trash2,
  X,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Link,
  Settings,
  Terminal,
  Shield,
  Server
} from 'lucide-react';
import clsx from 'clsx';

// ==================== FILE TYPE ICONS ====================

const FILE_ICONS = {
  directory: Folder,
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  py: FileCode,
  java: FileCode,
  cpp: FileCode,
  c: FileCode,
  h: FileCode,
  go: FileCode,
  rs: FileCode,
  php: FileCode,
  rb: FileCode,
  txt: FileText,
  md: FileText,
  log: FileText,
  csv: FileText,
  json: FileCode,
  xml: FileCode,
  yaml: FileCode,
  yml: FileCode,
  jpg: Image,
  jpeg: Image,
  png: Image,
  gif: Image,
  svg: Image,
  mp4: Film,
  avi: Film,
  mov: Film,
  mp3: Music,
  wav: Music,
  zip: Archive,
  tar: Archive,
  gz: Archive
};

// Editable file types
const EDITABLE_EXTENSIONS = [
  'txt', 'md', 'log', 'csv', 'json', 'xml', 'yaml', 'yml', 
  'toml', 'ini', 'conf', 'config', 'js', 'jsx', 'ts', 'tsx', 
  'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'php', 
  'rb', 'html', 'htm', 'css', 'scss', 'sass', 'sh', 
  'bash', 'env', 'gitignore', 'dockerfile'
];

// ==================== HELPER FUNCTIONS ====================

/**
 * Build full file path
 */
function buildPath(currentPath, fileName) {
  const normalizedPath = currentPath.endsWith('/') && currentPath !== '/' 
    ? currentPath.slice(0, -1) 
    : currentPath;
  
  const fullPath = normalizedPath === '/' 
    ? `/${fileName}` 
    : `${normalizedPath}/${fileName}`;
  
  return fullPath;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Check if file is text/editable
 */
function isTextFile(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  return EDITABLE_EXTENSIONS.includes(extension) || !extension;
}

// ==================== MAIN COMPONENT ====================

export default function FileManager({ 
  nodeReference, 
  listDirectory,
  readFile,
  writeFile,
  deleteFile,
  isRemoteAuthenticated
}) {
  // ==================== STATE MANAGEMENT ====================
  
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [remoteNotEnabled, setRemoteNotEnabled] = useState(false);
  
  // Selection state
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  
  // Editor state
  const [editingFile, setEditingFile] = useState(null);
  const [editingContent, setEditingContent] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // UI state
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Refs
  const isLoadingRef = useRef(false);
  const hasInitialLoadRef = useRef(false);
  const isMountedRef = useRef(true);

  // ==================== DIRECTORY LOADING ====================
  
  const loadDirectory = useCallback(async (path = '/') => {
    // Prevent multiple simultaneous loads
    if (isLoadingRef.current) {
      console.log('[FileManager] Already loading, skipping...');
      return;
    }
    
    // Check if functions are available
    if (!listDirectory) {
      console.log('[FileManager] listDirectory not available yet');
      return;
    }
    
    // Check authentication
    if (!isRemoteAuthenticated) {
      console.log('[FileManager] Not authenticated yet, waiting...');
      setError('Waiting for authentication...');
      return;
    }
    
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);
    setRemoteNotEnabled(false);
    
    try {
      console.log('[FileManager] Loading directory:', path);
      
      // Call remote command API
      const result = await listDirectory(path);
      
      console.log('[FileManager] Directory listing result:', result);
      
      // Parse response
      if (result && result.entries) {
        const items = result.entries.map(entry => {
          const fullPath = buildPath(path, entry.name);
          
          return {
            name: entry.name,
            type: entry.type === 'directory' || entry.is_directory ? 'directory' : 'file',
            size: entry.size || 0,
            permissions: entry.permissions || '',
            isSymlink: entry.permissions?.startsWith('l') || false,
            path: fullPath,
            modified: entry.modified,
            owner: entry.owner,
            group: entry.group
          };
        });
        
        // Sort: directories first, then files
        items.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'directory' ? -1 : 1;
        });
        
        console.log('[FileManager] Parsed files:', items.length, 'items');
        
        setFiles(items);
        setCurrentPath(path);
      } else {
        console.log('[FileManager] No entries in result');
        setFiles([]);
        setCurrentPath(path);
      }
      
    } catch (err) {
      console.error('[FileManager] Failed to load directory:', err);
      
      let errorMessage = 'Failed to load directory';
      
      if (err && err.message) {
        errorMessage = err.message;
        
        // Check for specific error types
        if (errorMessage.includes('Remote management not enabled') || 
            errorMessage.includes('REMOTE_NOT_ENABLED')) {
          setRemoteNotEnabled(true);
          errorMessage = 'Remote management is not enabled on this node';
        } else if (errorMessage.includes('Not authenticated') ||
                   errorMessage.includes('AUTH_FAILED')) {
          errorMessage = 'Please wait for authentication to complete';
        } else if (errorMessage.includes('timeout')) {
          errorMessage = 'Request timeout. The server may be slow to respond.';
        } else if (errorMessage.includes('not found')) {
          errorMessage = 'Directory not found';
        } else if (errorMessage.includes('permission')) {
          errorMessage = 'Permission denied';
        }
      }
      
      setError(errorMessage);
      setFiles([]);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [listDirectory, isRemoteAuthenticated]);

  // ==================== NAVIGATION ====================
  
  const navigateToDirectory = useCallback((path) => {
    console.log('[FileManager] Navigating to:', path);
    setSelectedFiles(new Set());
    loadDirectory(path);
  }, [loadDirectory]);

  const navigateUp = useCallback(() => {
    const parts = currentPath.split('/').filter(Boolean);
    const parentPath = parts.length > 0 
      ? '/' + parts.slice(0, -1).join('/') 
      : '/';
    console.log('[FileManager] Navigating up from', currentPath, 'to', parentPath);
    navigateToDirectory(parentPath);
  }, [currentPath, navigateToDirectory]);

  // ==================== FILE OPERATIONS ====================
  
  const getFileIcon = (file) => {
    if (file.type === 'directory') return Folder;
    
    const extension = file.name.split('.').pop().toLowerCase();
    return FILE_ICONS[extension] || File;
  };

  const handleFileClick = (file) => {
    console.log('[FileManager] File clicked:', file);
    
    if (file.type === 'directory') {
      navigateToDirectory(file.path);
    } else {
      const extension = file.name.split('.').pop().toLowerCase();
      if (isTextFile(file.name)) {
        editFile(file);
      } else {
        showInfo(`Cannot preview ${extension} files. Use download to save locally.`);
      }
    }
  };

  // ==================== EDIT FILE ====================
  
  const editFile = async (file) => {
    console.log('[FileManager] Editing file:', file);
    
    if (!file.path) {
      console.error('[FileManager] File path is missing:', file);
      setError('File path is missing');
      return;
    }
    
    if (!isRemoteAuthenticated) {
      setError('Not authenticated. Please wait for authentication to complete.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[FileManager] Reading file with path:', file.path);
      
      const result = await readFile(file.path);
      
      console.log('[FileManager] File read result:', result);
      
      const content = result.content || '';
      
      console.log('[FileManager] File content length:', content.length);
      
      setEditingFile(file);
      setEditingContent(content);
    } catch (err) {
      console.error('[FileManager] Failed to read file:', err);
      
      let errorMessage = 'Failed to read file';
      if (err && err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const saveFile = async () => {
    if (!editingFile || editingContent === null) {
      console.error('[FileManager] Cannot save: missing file or content');
      return;
    }
    
    if (!editingFile.path) {
      console.error('[FileManager] File path is missing:', editingFile);
      setError('File path is missing');
      return;
    }
    
    if (!isRemoteAuthenticated) {
      setError('Not authenticated. Please wait for authentication to complete.');
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      console.log('[FileManager] Saving file:', editingFile.path);
      console.log('[FileManager] Content length:', editingContent.length);
      
      await writeFile(editingFile.path, editingContent);
      
      console.log('[FileManager] File write result: success');
      
      setEditingFile(null);
      setEditingContent(null);
      showSuccess('File saved successfully');
      
      await loadDirectory(currentPath);
      
    } catch (err) {
      console.error('[FileManager] Failed to save file:', err);
      
      let errorMessage = 'Failed to save file';
      if (err && err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // ==================== DELETE ====================
  
  const handleDeleteFile = async (file) => {
    console.log('[FileManager] Delete requested for:', file);
    
    if (!file.path) {
      console.error('[FileManager] File path is missing:', file);
      setError('File path is missing');
      return;
    }
    
    if (!isRemoteAuthenticated) {
      setError('Not authenticated. Please wait for authentication to complete.');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${file.name}?`)) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[FileManager] Deleting file:', file.path);
      
      await deleteFile(file.path);
      
      console.log('[FileManager] File deleted successfully');
      
      await loadDirectory(currentPath);
      
      showSuccess(`${file.name} deleted successfully`);
      
    } catch (err) {
      console.error('[FileManager] Failed to delete file:', err);
      
      let errorMessage = `Failed to delete ${file.name}`;
      if (err && err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== UTILITIES ====================
  
  const showSuccess = (message) => {
    setSuccessMessage(message);
    setShowSuccessMessage(true);
    setTimeout(() => {
      if (isMountedRef.current) {
        setShowSuccessMessage(false);
        setSuccessMessage('');
      }
    }, 3000);
  };

  const showInfo = (message) => {
    setError(message);
    setTimeout(() => {
      if (isMountedRef.current) {
        setError(null);
      }
    }, 3000);
  };

  // ==================== EFFECTS ====================
  
  useEffect(() => {
    if (!hasInitialLoadRef.current && listDirectory && isRemoteAuthenticated) {
      console.log('[FileManager] Initial load with authentication');
      hasInitialLoadRef.current = true;
      // Delay to ensure everything is ready
      setTimeout(() => {
        if (isMountedRef.current) {
          loadDirectory('/');
        }
      }, 1000);
    }
  }, [listDirectory, isRemoteAuthenticated, loadDirectory]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ==================== BREADCRUMB NAVIGATION ====================
  
  const breadcrumbParts = currentPath.split('/').filter(Boolean);
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    ...breadcrumbParts.map((part, index) => ({
      name: part,
      path: '/' + breadcrumbParts.slice(0, index + 1).join('/')
    }))
  ];

  // ==================== RENDER ====================
  
  // Remote management not enabled state
  if (remoteNotEnabled) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-2xl">
          <div className="w-20 h-20 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Settings className="w-10 h-10 text-yellow-400" />
          </div>
          <h3 className="text-2xl font-semibold text-white mb-3">Remote Management Not Enabled</h3>
          <p className="text-gray-400 mb-6">
            This node does not have remote management enabled. To use file management features, 
            you need to enable it in the node configuration.
          </p>
          
          <div className="bg-black/40 rounded-xl p-6 text-left border border-white/10">
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-5 h-5 text-purple-400" />
              <h4 className="font-medium text-white">How to Enable Remote Management</h4>
            </div>
            
            <ol className="space-y-3 text-sm text-gray-300">
              <li className="flex gap-3">
                <span className="text-purple-400 font-bold">1.</span>
                <div className="flex-1">
                  SSH into your node server:
                  <code className="block mt-2 bg-black/60 px-3 py-2 rounded text-xs text-gray-300 font-mono">
                    ssh user@{node?.ip_address || 'your-node-ip'}
                  </code>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-purple-400 font-bold">2.</span>
                <div className="flex-1">
                  Edit the node configuration file:
                  <code className="block mt-2 bg-black/60 px-3 py-2 rounded text-xs text-gray-300 font-mono">
                    nano /etc/aeronyx/node.conf
                  </code>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-purple-400 font-bold">3.</span>
                <div className="flex-1">
                  Add or update the configuration:
                  <code className="block mt-2 bg-black/60 px-3 py-2 rounded text-xs text-gray-300 font-mono">
                    enable_remote_management: true
                  </code>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-purple-400 font-bold">4.</span>
                <div className="flex-1">
                  Restart the node service:
                  <code className="block mt-2 bg-black/60 px-3 py-2 rounded text-xs text-gray-300 font-mono">
                    sudo systemctl restart aeronyx-node
                  </code>
                </div>
              </li>
            </ol>
            
            <div className="mt-6 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
              <p className="text-xs text-yellow-400">
                <strong>Security Note:</strong> Enabling remote management allows file access through the web interface. 
                Ensure your node is properly secured and only accessible through trusted networks.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Waiting for authentication state
  if (!isRemoteAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield className="w-12 h-12 text-yellow-400 mx-auto mb-4 animate-pulse" />
          <p className="text-yellow-400 mb-2">Waiting for authentication...</p>
          <p className="text-sm text-gray-400">Please wait while we authenticate your session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white">File Manager</h3>
        <button
          onClick={() => loadDirectory(currentPath)}
          disabled={isLoading}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={clsx("w-4 h-4 text-gray-400", isLoading && "animate-spin")} />
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.path}>
            {index > 0 && <ChevronRight className="w-4 h-4 text-gray-500" />}
            <button
              onClick={() => navigateToDirectory(crumb.path)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {crumb.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Success Message */}
      <AnimatePresence>
        {showSuccessMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg flex items-center gap-2"
          >
            <CheckCircle className="w-5 h-5 text-green-400" />
            <p className="text-green-400 text-sm">{successMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2"
          >
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto p-1 hover:bg-white/10 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Folder className="w-12 h-12 mb-2" />
            <p>Empty directory</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Parent directory link */}
            {currentPath !== '/' && (
              <button
                onClick={navigateUp}
                className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg transition-colors"
              >
                <Folder className="w-5 h-5 text-blue-400" />
                <span className="text-gray-400">..</span>
              </button>
            )}
            
            {/* Files */}
            {files.map((file) => {
              const Icon = getFileIcon(file);
              const isSelected = selectedFiles.has(file.path);
              
              return (
                <div
                  key={file.path}
                  className={clsx(
                    "flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg transition-colors cursor-pointer group",
                    isSelected && "bg-white/10"
                  )}
                  onClick={() => handleFileClick(file)}
                >
                  <Icon className={clsx(
                    "w-5 h-5 flex-shrink-0",
                    file.type === 'directory' ? "text-blue-400" : "text-gray-400"
                  )} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white truncate">{file.name}</span>
                      {file.isSymlink && <Link className="w-3 h-3 text-gray-500" />}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{file.permissions}</span>
                      {file.type === 'file' && <span>{formatBytes(file.size)}</span>}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {file.type === 'file' && (
                      <>
                        {isTextFile(file.name) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              editFile(file);
                            }}
                            className="p-1.5 hover:bg-white/10 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4 text-gray-400" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(file);
                          }}
                          className="p-1.5 hover:bg-white/10 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-gray-400" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* File editor modal */}
      <AnimatePresence>
        {editingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              if (!isSaving) {
                setEditingFile(null);
                setEditingContent(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-black/90 border border-white/10 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Editor header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-purple-400" />
                  <span className="text-white font-medium">{editingFile.name}</span>
                  <span className="text-xs text-gray-500">{editingFile.path}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveFile}
                    disabled={isSaving}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save
                  </button>
                  <button
                    onClick={() => {
                      if (!isSaving) {
                        setEditingFile(null);
                        setEditingContent(null);
                      }
                    }}
                    disabled={isSaving}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>
              
              {/* Editor content */}
              <div className="flex-1 p-4 overflow-hidden">
                <textarea
                  value={editingContent || ''}
                  onChange={(e) => setEditingContent(e.target.value)}
                  className="w-full h-full bg-black/50 border border-white/10 rounded-lg p-4 text-sm text-white font-mono resize-none focus:outline-none focus:border-purple-500"
                  spellCheck={false}
                  placeholder="File content will appear here..."
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
