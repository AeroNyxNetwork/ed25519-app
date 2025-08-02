/**
 * File Manager Component
 * Complete implementation with all fixes
 * 
 * File Path: src/components/nodes/FileManager.js
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
  Link
} from 'lucide-react';
import clsx from 'clsx';

// File type icon mapping
const FILE_ICONS = {
  // Folders
  directory: Folder,
  
  // Code files
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  py: FileCode,
  java: FileCode,
  cpp: FileCode,
  c: FileCode,
  h: FileCode,
  hpp: FileCode,
  go: FileCode,
  rs: FileCode,
  php: FileCode,
  rb: FileCode,
  
  // Text files
  txt: FileText,
  md: FileText,
  log: FileText,
  csv: FileText,
  json: FileCode,
  xml: FileCode,
  yaml: FileCode,
  yml: FileCode,
  toml: FileCode,
  ini: FileCode,
  conf: FileCode,
  config: FileCode,
  
  // Images
  jpg: Image,
  jpeg: Image,
  png: Image,
  gif: Image,
  svg: Image,
  webp: Image,
  ico: Image,
  bmp: Image,
  
  // Videos
  mp4: Film,
  avi: Film,
  mov: Film,
  wmv: Film,
  flv: Film,
  mkv: Film,
  webm: Film,
  
  // Audio
  mp3: Music,
  wav: Music,
  flac: Music,
  aac: Music,
  ogg: Music,
  m4a: Music,
  
  // Archives
  zip: Archive,
  tar: Archive,
  gz: Archive,
  rar: Archive,
  '7z': Archive,
  bz2: Archive,
  xz: Archive
};

// Editable file types
const EDITABLE_EXTENSIONS = [
  'txt', 'md', 'log', 'csv', 'json', 'xml', 'yaml', 'yml', 
  'toml', 'ini', 'conf', 'config', 'js', 'jsx', 'ts', 'tsx', 
  'py', 'java', 'cpp', 'c', 'h', 'hpp', 'go', 'rs', 'php', 
  'rb', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'sh', 
  'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'env', 'gitignore',
  'dockerfile', 'makefile', 'readme', 'license'
];

export default function FileManager({ nodeReference, sessionId, executeCommand, uploadFile }) {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [editingFile, setEditingFile] = useState(null);
  const [editingContent, setEditingContent] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Add refs to prevent multiple loads
  const isLoadingRef = useRef(false);
  const hasInitialLoadRef = useRef(false);

  // Load directory contents with duplicate prevention
  const loadDirectory = useCallback(async (path = '/') => {
    // Prevent multiple simultaneous loads
    if (isLoadingRef.current) {
      console.log('[FileManager] Already loading, skipping...');
      return;
    }
    
    // Check if executeCommand is available
    if (!executeCommand) {
      console.log('[FileManager] executeCommand not available yet');
      return;
    }
    
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[FileManager] Loading directory:', path);
      
      const result = await executeCommand('ls', ['-la', path]);
      console.log('[FileManager] Directory listing result:', result);
      
      // Check if result is in ApiResponse format
      if (result && result.success === false) {
        throw new Error(result.message || 'Failed to load directory');
      }
      
      // Extract the actual result data
      const output = result.data?.stdout || result.stdout || '';
      
      if (!output) {
        setFiles([]);
        setCurrentPath(path);
        return;
      }
      
      // Parse ls output
      const lines = output.split('\n').filter(line => line.trim());
      const items = [];
      
      // Skip the first line (total) and process file entries
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const parts = line.split(/\s+/);
        
        if (parts.length >= 9) {
          const permissions = parts[0];
          const size = parts[4];
          const name = parts.slice(8).join(' ');
          
          // Skip . and .. entries
          if (name === '.' || name === '..') continue;
          
          const isDirectory = permissions.startsWith('d');
          const isSymlink = permissions.startsWith('l');
          
          items.push({
            name,
            type: isDirectory ? 'directory' : 'file',
            size: parseInt(size) || 0,
            permissions,
            isSymlink,
            path: path === '/' ? `/${name}` : `${path}/${name}`
          });
        }
      }
      
      // Sort: directories first, then files
      items.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
      });
      
      setFiles(items);
      setCurrentPath(path);
      
    } catch (err) {
      console.error('[FileManager] Failed to load directory:', err);
      
      let errorMessage = 'Failed to load directory';
      
      // Handle ApiResponse error format
      if (err && typeof err === 'object' && err.message) {
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setFiles([]);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [executeCommand]);

  // Navigate to directory
  const navigateToDirectory = useCallback((path) => {
    setSelectedFiles(new Set());
    loadDirectory(path);
  }, [loadDirectory]);

  // Navigate to parent directory
  const navigateUp = useCallback(() => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    navigateToDirectory(parentPath);
  }, [currentPath, navigateToDirectory]);

  // Get file icon
  const getFileIcon = (file) => {
    if (file.type === 'directory') return Folder;
    
    const extension = file.name.split('.').pop().toLowerCase();
    return FILE_ICONS[extension] || File;
  };

  // Format file size
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Handle file click
  const handleFileClick = (file) => {
    if (file.type === 'directory') {
      navigateToDirectory(file.path);
    } else {
      // Check if file is editable
      const extension = file.name.split('.').pop().toLowerCase();
      if (EDITABLE_EXTENSIONS.includes(extension) || !extension) {
        editFile(file);
      }
    }
  };

  // Edit file
  const editFile = async (file) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await executeCommand('cat', [file.path]);
      
      // Check if result is in ApiResponse format
      if (result && result.success === false) {
        throw new Error(result.message || 'Failed to read file');
      }
      
      const content = result.data?.stdout || result.stdout || '';
      
      setEditingFile(file);
      setEditingContent(content);
    } catch (err) {
      console.error('[FileManager] Failed to read file:', err);
      
      let errorMessage = 'Failed to read file';
      if (err && typeof err === 'object' && err.message) {
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Save file
  const saveFile = async () => {
    if (!editingFile || editingContent === null) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      console.log('[FileManager] Saving file:', editingFile.path);
      
      // Call uploadFile from useRemoteManagement
      const response = await uploadFile(editingFile.path, editingContent, false);
      
      console.log('[FileManager] Upload response:', response);
      
      // Check if response indicates success
      if (response && response.success === true) {
        // Success - close editor and show success message
        setEditingFile(null);
        setEditingContent(null);
        setSuccessMessage(response.message || 'File saved successfully');
        setShowSuccessMessage(true);
        
        // Refresh current directory
        await loadDirectory(currentPath);
        
        // Hide success message after 3 seconds
        setTimeout(() => {
          setShowSuccessMessage(false);
          setSuccessMessage('');
        }, 3000);
      } else {
        // This shouldn't happen if uploadFile is working correctly
        throw new Error('Unexpected response format');
      }
    } catch (err) {
      console.error('[FileManager] Failed to save file:', err);
      
      // Extract error message properly
      let errorMessage = 'Failed to save file';
      
      // Check if it's an ApiResponse error format
      if (err && typeof err === 'object' && err.message) {
        errorMessage = err.message;
      } else if (err && typeof err === 'object' && err.error && err.error.message) {
        errorMessage = err.error.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete file
  const deleteFile = async (file) => {
    if (!confirm(`Are you sure you want to delete ${file.name}?`)) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const command = file.type === 'directory' ? 'rmdir' : 'rm';
      const args = file.type === 'directory' ? [file.path] : ['-f', file.path];
      
      const result = await executeCommand(command, args);
      
      if (result && result.success === false) {
        throw new Error(result.message || 'Failed to delete file');
      }
      
      // Refresh directory
      await loadDirectory(currentPath);
      
      setSuccessMessage(`${file.name} deleted successfully`);
      setShowSuccessMessage(true);
      setTimeout(() => {
        setShowSuccessMessage(false);
        setSuccessMessage('');
      }, 3000);
      
    } catch (err) {
      console.error('[FileManager] Failed to delete file:', err);
      
      let errorMessage = `Failed to delete ${file.name}`;
      if (err && typeof err === 'object' && err.message) {
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load - only once when executeCommand becomes available
  useEffect(() => {
    if (executeCommand && !hasInitialLoadRef.current) {
      hasInitialLoadRef.current = true;
      loadDirectory('/');
    }
  }, [executeCommand, loadDirectory]);

  // Breadcrumb navigation
  const breadcrumbParts = currentPath.split('/').filter(Boolean);
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    ...breadcrumbParts.map((part, index) => ({
      name: part,
      path: '/' + breadcrumbParts.slice(0, index + 1).join('/')
    }))
  ];

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white">File Manager</h3>
        <button
          onClick={() => loadDirectory(currentPath)}
          disabled={isLoading}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
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
                    "flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg transition-colors cursor-pointer",
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
                      {file.type === 'file' && <span>{formatSize(file.size)}</span>}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {file.type === 'file' && (
                      <>
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteFile(file);
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
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
