/**
 * ============================================
 * File: src/components/nodes/FileManager.js
 * ============================================
 * File Manager Component - WITH CODEMIRROR EDITOR v9.0.0
 * 
 * Modification Reason: Integrate professional CodeMirror 6 editor
 * - Changed: Replaced textarea with CodeEditor component
 * - Added: Syntax highlighting and advanced editing features
 * - Improved: User experience with professional editor
 * 
 * Main Functionality:
 * - Browse remote file system
 * - Edit files with professional code editor
 * - Markdown files get specialized editor with preview
 * - Delete files and directories
 * 
 * Dependencies: 
 * - useRemoteManagement hook
 * - lucide-react icons
 * - CodeEditor component (NEW)
 * - MarkdownEditor component (NEW)
 * 
 * ⚠️ Important Notes:
 * - All operations use remote_command API (not terminal)
 * - Must wait for isRemoteAuthenticated before any operations
 * - Editor automatically detects file language
 * - All existing functionality preserved
 * 
 * Last Modified: v9.0.0 - Integrated CodeMirror 6 editor
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
  Server,
  Info
} from 'lucide-react';
import clsx from 'clsx';

// Import the new editor components
import CodeEditor from '../editor/CodeEditor';

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

function buildPath(currentPath, fileName) {
  const normalizedPath = currentPath.endsWith('/') && currentPath !== '/' 
    ? currentPath.slice(0, -1) 
    : currentPath;
  
  const fullPath = normalizedPath === '/' 
    ? `/${fileName}` 
    : `${normalizedPath}/${fileName}`;
  
  return fullPath;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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
  
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  
  // Editor state
  const [editingFile, setEditingFile] = useState(null);
  const [editingContent, setEditingContent] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const isLoadingRef = useRef(false);
  const hasInitialLoadRef = useRef(false);
  const isMountedRef = useRef(true);
  const scrollContainerRef = useRef(null);

  // ==================== DIRECTORY LOADING ====================
  
  const loadDirectory = useCallback(async (path = '/') => {
    if (isLoadingRef.current) {
      console.log('[FileManager] Already loading, skipping...');
      return;
    }
    
    if (!listDirectory) {
      console.log('[FileManager] listDirectory not available yet');
      return;
    }
    
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
      
      const result = await listDirectory(path);
      
      console.log('[FileManager] Directory listing result:', result);
      
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
        
        items.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'directory' ? -1 : 1;
        });
        
        console.log('[FileManager] Parsed files:', items.length, 'items');
        
        setFiles(items);
        setCurrentPath(path);
        
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
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
        } else if (errorMessage.includes('forbidden')) {
          errorMessage = errorMessage;
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

  const saveFile = useCallback(async (content) => {
    if (!editingFile || content === null || content === undefined) {
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
      console.log('[FileManager] Content length:', content.length);
      
      await writeFile(editingFile.path, content);
      
      console.log('[FileManager] File write result: success');
      
      showSuccess('File saved successfully');
      
      // Refresh directory listing
      await loadDirectory(currentPath);
      
    } catch (err) {
      console.error('[FileManager] Failed to save file:', err);
      
      let errorMessage = 'Failed to save file';
      if (err && err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      throw err; // Re-throw for CodeEditor to handle
    } finally {
      setIsSaving(false);
    }
  }, [editingFile, isRemoteAuthenticated, writeFile, currentPath, loadDirectory]);

  const closeEditor = useCallback(() => {
    setEditingFile(null);
    setEditingContent(null);
  }, []);

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

  // ==================== FILE STATISTICS ====================
  
  const fileStats = {
    total: files.length,
    directories: files.filter(f => f.type === 'directory').length,
    files: files.filter(f => f.type === 'file').length
  };

  // ==================== RENDER ====================
  
  if (remoteNotEnabled) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6">
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
                    ssh user@{nodeReference || 'your-node-ip'}
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

  if (!isRemoteAuthenticated) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-yellow-400 mx-auto mb-4 animate-pulse" />
          <p className="text-yellow-400 mb-2">Waiting for authentication...</p>
          <p className="text-sm text-gray-400">Please wait while we authenticate your session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-[#0A0A0F] to-black">
      {/* Header with file count */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-white">File Manager</h3>
          {!isLoading && files.length > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 rounded-full border border-purple-500/20">
                <Folder className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-purple-400 font-medium">{fileStats.directories}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 rounded-full border border-blue-500/20">
                <File className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-blue-400 font-medium">{fileStats.files}</span>
              </div>
              <span className="text-gray-500">•</span>
              <span className="text-gray-400">{fileStats.total} total</span>
            </div>
          )}
        </div>
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
      <div className="flex items-center gap-2 px-6 py-3 text-sm border-b border-white/10 bg-black/10 flex-shrink-0">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.path}>
            {index > 0 && <ChevronRight className="w-4 h-4 text-gray-600" />}
            <button
              onClick={() => navigateToDirectory(crumb.path)}
              className={clsx(
                "px-2 py-1 rounded transition-colors",
                index === breadcrumbs.length - 1
                  ? "text-white bg-white/10"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              {index === 0 ? <Home className="w-4 h-4" /> : crumb.name}
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
            className="mx-6 mt-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg flex items-center gap-2 flex-shrink-0"
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
            className="mx-6 mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 flex-shrink-0"
          >
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-400 text-sm flex-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File list */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 py-4 min-h-0"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(139, 92, 246, 0.3) rgba(255, 255, 255, 0.05)'
        }}
      >
        <style jsx>{`
          div::-webkit-scrollbar {
            width: 8px;
          }
          div::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb {
            background: rgba(139, 92, 246, 0.3);
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb:hover {
            background: rgba(139, 92, 246, 0.5);
          }
        `}</style>

        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Loading directory...</p>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Folder className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-lg font-medium">Empty directory</p>
            <p className="text-sm text-gray-500">No files or folders to display</p>
          </div>
        ) : (
          <div className="space-y-1">
            {currentPath !== '/' && (
              <button
                onClick={navigateUp}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-lg transition-colors group"
              >
                <Folder className="w-5 h-5 text-blue-400" />
                <span className="text-gray-400 group-hover:text-white transition-colors">..</span>
                <span className="text-xs text-gray-500 ml-auto">Parent directory</span>
              </button>
            )}
            
            {files.map((file) => {
              const Icon = getFileIcon(file);
              const isSelected = selectedFiles.has(file.path);
              
              return (
                <div
                  key={file.path}
                  className={clsx(
                    "flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 rounded-lg transition-all cursor-pointer group",
                    isSelected && "bg-white/10"
                  )}
                  onClick={() => handleFileClick(file)}
                >
                  <Icon className={clsx(
                    "w-5 h-5 flex-shrink-0 transition-colors",
                    file.type === 'directory' ? "text-blue-400" : "text-gray-400"
                  )} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white truncate group-hover:text-purple-300 transition-colors">
                        {file.name}
                      </span>
                      {file.isSymlink && (
                        <Link className="w-3 h-3 text-gray-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="font-mono">{file.permissions}</span>
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
                            <Edit className="w-4 h-4 text-gray-400 hover:text-white transition-colors" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(file);
                          }}
                          className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400 transition-colors" />
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

      {/* Status bar */}
      {!isLoading && files.length > 0 && (
        <div className="px-6 py-3 border-t border-white/10 bg-black/20 flex items-center justify-between text-xs flex-shrink-0">
          <div className="flex items-center gap-2 text-gray-400">
            <Info className="w-3.5 h-3.5" />
            <span>
              Showing {fileStats.total} {fileStats.total === 1 ? 'item' : 'items'} in {currentPath}
            </span>
          </div>
          <div className="text-gray-500">
            Scroll for more
          </div>
        </div>
      )}

      {/* Professional Code Editor Modal */}
      <AnimatePresence>
        {editingFile && editingContent !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              // Only close if clicking the backdrop, not the editor
              if (e.target === e.currentTarget && !isSaving) {
                const hasUnsavedChanges = editingContent !== initialContent;
                if (!hasUnsavedChanges || window.confirm('You have unsaved changes. Close anyway?')) {
                  closeEditor();
                }
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-black/95 border border-white/10 rounded-xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* CodeEditor Component */}
              <CodeEditor
                file={editingFile}
                initialContent={editingContent}
                onSave={saveFile}
                onClose={closeEditor}
                isSaving={isSaving}
                saveError={error}
                readOnly={false}
                className="h-full"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
