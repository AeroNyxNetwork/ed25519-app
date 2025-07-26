/**
 * Fixed File Manager Component
 * Prevents circular loading and duplicate requests
 * 
 * File Path: src/components/nodes/FileManager.js
 * 
 * @version 1.2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  File,
  FileText,
  FileCode,
  FileImage,
  FileArchive,
  Download,
  Upload,
  Edit,
  Trash2,
  Save,
  X,
  Search,
  Grid,
  List,
  ChevronRight,
  ChevronDown,
  Home,
  RefreshCw,
  FolderPlus,
  FilePlus,
  Copy,
  Scissors,
  Clipboard,
  Eye,
  Terminal,
  AlertCircle
} from 'lucide-react';

export default function FileManager({ nodeReference, sessionId, executeCommand, uploadFile }) {
  // State
  const [currentPath, setCurrentPath] = useState('/home');
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [viewMode, setViewMode] = useState('list'); // list or grid
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingFile, setEditingFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [clipboard, setClipboard] = useState({ action: null, files: [] });
  
  // Refs to prevent duplicate operations
  const loadingRef = useRef(false);
  const lastLoadedPath = useRef(null);
  const hasInitialLoad = useRef(false);
  
  // File operations with duplicate prevention
  const loadDirectory = useCallback(async (path) => {
    if (!executeCommand) {
      setError('Execute command function not available');
      return;
    }

    // Prevent duplicate loads
    if (loadingRef.current || lastLoadedPath.current === path) {
      console.log('[FileManager] Skipping duplicate load for path:', path);
      return;
    }

    loadingRef.current = true;
    lastLoadedPath.current = path;
    setIsLoading(true);
    setError(null);
    
    try {
      // Get directory listing with detailed info
      const result = await executeCommand('ls', ['-la', '--color=never', path]);
      const lines = result.stdout.split('\n').filter(line => line.trim());
      
      // Parse ls output
      const parsedFiles = [];
      for (let i = 1; i < lines.length; i++) { // Skip 'total' line
        const line = lines[i];
        const parts = line.split(/\s+/);
        if (parts.length < 9) continue;
        
        const name = parts.slice(8).join(' ');
        if (name === '.' || name === '..') continue;
        
        const permissions = parts[0];
        const isDirectory = permissions.startsWith('d');
        const isSymlink = permissions.startsWith('l');
        
        parsedFiles.push({
          name,
          path: `${path}/${name}`.replace(/\/+/g, '/'),
          type: isDirectory ? 'directory' : 'file',
          permissions,
          owner: parts[2],
          group: parts[3],
          size: parseInt(parts[4]) || 0,
          modified: `${parts[5]} ${parts[6]} ${parts[7]}`,
          isSymlink,
          extension: isDirectory ? null : name.split('.').pop().toLowerCase()
        });
      }
      
      setFiles(parsedFiles.sort((a, b) => {
        // Directories first, then alphabetical
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      }));
      
      setCurrentPath(path);
    } catch (err) {
      setError(`Failed to load directory: ${err.message}`);
      // Reset last loaded path on error
      lastLoadedPath.current = null;
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [executeCommand]);

  // Initial load - only once
  useEffect(() => {
    if (executeCommand && !hasInitialLoad.current) {
      console.log('[FileManager] Initial load');
      hasInitialLoad.current = true;
      loadDirectory(currentPath);
    }
  }, [executeCommand]); // Remove other dependencies

  // Handle path changes after initial load
  useEffect(() => {
    if (hasInitialLoad.current && currentPath !== lastLoadedPath.current) {
      console.log('[FileManager] Path changed to:', currentPath);
      loadDirectory(currentPath);
    }
  }, [currentPath, loadDirectory]);

  // File type icon
  const getFileIcon = (file) => {
    if (file.type === 'directory') return Folder;
    
    const ext = file.extension;
    if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'go', 'rs'].includes(ext)) {
      return FileCode;
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
      return FileImage;
    }
    if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) {
      return FileArchive;
    }
    if (['txt', 'md', 'doc', 'docx', 'pdf'].includes(ext)) {
      return FileText;
    }
    return File;
  };

  // Handle file click
  const handleFileClick = async (file) => {
    if (file.type === 'directory') {
      // Update path, which will trigger loadDirectory via useEffect
      setCurrentPath(file.path);
    } else {
      // Preview or download based on file type
      if (isTextFile(file)) {
        await openFileEditor(file);
      } else {
        await downloadFile(file);
      }
    }
  };

  // Check if file is editable text
  const isTextFile = (file) => {
    const textExtensions = ['txt', 'md', 'js', 'jsx', 'ts', 'tsx', 'json', 'xml', 'html', 'css', 'py', 'yml', 'yaml', 'conf', 'sh', 'env'];
    return textExtensions.includes(file.extension) || file.size < 1024 * 1024; // < 1MB
  };

  // Open file editor
  const openFileEditor = async (file) => {
    setIsLoading(true);
    try {
      const result = await executeCommand('cat', [file.path]);
      setFileContent(result.stdout);
      setEditingFile(file);
    } catch (err) {
      setError(`Failed to open file: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Save file
  const saveFile = async () => {
    if (!editingFile || !uploadFile) return;
    
    setIsLoading(true);
    try {
      // Upload the file content
      await uploadFile(editingFile.path, fileContent, false);
      
      setEditingFile(null);
      // Force reload of current directory
      lastLoadedPath.current = null;
      loadDirectory(currentPath);
    } catch (err) {
      setError(`Failed to save file: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Download file
  const downloadFile = async (file) => {
    try {
      const result = await executeCommand('base64', [file.path]);
      const base64Data = result.stdout.trim();
      
      // Create download link
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray]);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Failed to download file: ${err.message}`);
    }
  };

  // Create new folder
  const createFolder = async (name) => {
    if (!name) return;
    
    try {
      await executeCommand('mkdir', [`${currentPath}/${name}`]);
      // Force reload
      lastLoadedPath.current = null;
      loadDirectory(currentPath);
    } catch (err) {
      setError(`Failed to create folder: ${err.message}`);
    }
  };

  // Delete files
  const deleteFiles = async () => {
    if (selectedFiles.size === 0) return;
    
    if (!confirm(`Delete ${selectedFiles.size} item(s)?`)) return;
    
    try {
      for (const filePath of selectedFiles) {
        const file = files.find(f => f.path === filePath);
        if (file.type === 'directory') {
          await executeCommand('rm', ['-rf', filePath]);
        } else {
          await executeCommand('rm', ['-f', filePath]);
        }
      }
      setSelectedFiles(new Set());
      // Force reload
      lastLoadedPath.current = null;
      loadDirectory(currentPath);
    } catch (err) {
      setError(`Failed to delete files: ${err.message}`);
    }
  };

  // Copy/Cut files
  const copyFiles = (cut = false) => {
    setClipboard({
      action: cut ? 'cut' : 'copy',
      files: Array.from(selectedFiles).map(path => files.find(f => f.path === path))
    });
  };

  // Paste files
  const pasteFiles = async () => {
    if (!clipboard.files.length) return;
    
    try {
      for (const file of clipboard.files) {
        const destPath = `${currentPath}/${file.name}`;
        if (clipboard.action === 'copy') {
          await executeCommand('cp', ['-r', file.path, destPath]);
        } else {
          await executeCommand('mv', [file.path, destPath]);
        }
      }
      
      setClipboard({ action: null, files: [] });
      // Force reload
      lastLoadedPath.current = null;
      loadDirectory(currentPath);
    } catch (err) {
      setError(`Failed to paste files: ${err.message}`);
    }
  };

  // Manual refresh
  const handleRefresh = useCallback(() => {
    console.log('[FileManager] Manual refresh');
    lastLoadedPath.current = null;
    loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  // Breadcrumb navigation
  const breadcrumbs = currentPath.split('/').filter(Boolean);

  return (
    <div className="h-full flex flex-col bg-black/50 rounded-xl border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-white">File Manager</h3>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setCurrentPath('/')}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              disabled={isLoading}
            >
              <Home className="w-4 h-4 text-gray-400" />
            </button>
            <span className="text-gray-500">/</span>
            {breadcrumbs.map((part, index) => (
              <React.Fragment key={index}>
                <button
                  onClick={() => {
                    const newPath = '/' + breadcrumbs.slice(0, index + 1).join('/');
                    setCurrentPath(newPath);
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                  disabled={isLoading}
                >
                  {part}
                </button>
                {index < breadcrumbs.length - 1 && (
                  <span className="text-gray-500">/</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            {viewMode === 'list' ? (
              <Grid className="w-4 h-4 text-gray-400" />
            ) : (
              <List className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-white/10">
        <button
          onClick={() => {
            const name = prompt('Folder name:');
            if (name) createFolder(name);
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
          disabled={isLoading}
        >
          <FolderPlus className="w-4 h-4" />
          New Folder
        </button>
        
        {selectedFiles.size > 0 && (
          <>
            <div className="h-6 w-px bg-white/10 mx-2" />
            <button
              onClick={() => copyFiles(false)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              disabled={isLoading}
            >
              <Copy className="w-4 h-4 text-gray-400" />
            </button>
            <button
              onClick={() => copyFiles(true)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              disabled={isLoading}
            >
              <Scissors className="w-4 h-4 text-gray-400" />
            </button>
            <button
              onClick={deleteFiles}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              disabled={isLoading}
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          </>
        )}
        
        {clipboard.files.length > 0 && (
          <button
            onClick={pasteFiles}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            disabled={isLoading}
          >
            <Clipboard className="w-4 h-4 text-green-400" />
          </button>
        )}
        
        <div className="ml-auto flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* File list/grid */}
      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-sm text-red-300">{error}</span>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : viewMode === 'list' ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-white/10">
                <th className="pb-2 w-8">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFiles(new Set(files.map(f => f.path)));
                      } else {
                        setSelectedFiles(new Set());
                      }
                    }}
                    className="rounded border-gray-600"
                  />
                </th>
                <th className="pb-2">Name</th>
                <th className="pb-2 w-24">Size</th>
                <th className="pb-2 w-32">Modified</th>
                <th className="pb-2 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files
                .filter(file => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(file => {
                  const Icon = getFileIcon(file);
                  return (
                    <tr
                      key={file.path}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-2">
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.path)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedFiles);
                            if (e.target.checked) {
                              newSelected.add(file.path);
                            } else {
                              newSelected.delete(file.path);
                            }
                            setSelectedFiles(newSelected);
                          }}
                          className="rounded border-gray-600"
                        />
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => handleFileClick(file)}
                          className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
                          disabled={isLoading}
                        >
                          <Icon className="w-4 h-4 text-gray-500" />
                          {file.name}
                        </button>
                      </td>
                      <td className="py-2 text-gray-400">
                        {file.type === 'directory' ? '-' : formatFileSize(file.size)}
                      </td>
                      <td className="py-2 text-gray-400 text-xs">
                        {file.modified}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1">
                          {file.type === 'file' && (
                            <>
                              {isTextFile(file) && (
                                <button
                                  onClick={() => openFileEditor(file)}
                                  className="p-1 hover:bg-white/10 rounded transition-colors"
                                  disabled={isLoading}
                                >
                                  <Edit className="w-3 h-3 text-gray-400" />
                                </button>
                              )}
                              <button
                                onClick={() => downloadFile(file)}
                                className="p-1 hover:bg-white/10 rounded transition-colors"
                                disabled={isLoading}
                              >
                                <Download className="w-3 h-3 text-gray-400" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {files
              .filter(file => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(file => {
                const Icon = getFileIcon(file);
                return (
                  <motion.div
                    key={file.path}
                    whileHover={{ scale: 1.05 }}
                    className={`p-4 rounded-lg border ${
                      selectedFiles.has(file.path)
                        ? 'bg-purple-500/20 border-purple-500/40'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    } cursor-pointer transition-all`}
                    onClick={() => handleFileClick(file)}
                  >
                    <Icon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-center text-gray-300 truncate">
                      {file.name}
                    </p>
                  </motion.div>
                );
              })}
          </div>
        )}
      </div>

      {/* File Editor Modal */}
      <AnimatePresence>
        {editingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-gray-900 rounded-xl w-full max-w-4xl h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="text-lg font-semibold text-white">
                  Editing: {editingFile.name}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveFile}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm transition-colors"
                    disabled={isLoading}
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                  <button
                    onClick={() => setEditingFile(null)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-hidden p-4">
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="w-full h-full p-4 bg-black text-white font-mono text-sm resize-none focus:outline-none rounded-lg border border-white/10"
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

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
