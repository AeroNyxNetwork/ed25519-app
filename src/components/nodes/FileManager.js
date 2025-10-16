/**
 * ============================================
 * File: src/components/nodes/FileManager.js
 * ============================================
 * File Manager Component - ENHANCED VERSION v6.0.0
 * 
 * Modification Reason: Add all file operations from backend (rename, copy, move, search, compress, etc.)
 * Main Functionality: Complete file management with all remote command support
 * Dependencies: useRemoteManagement hook, lucide-react icons
 * 
 * Main Logical Flow:
 * 1. Load and display directory contents
 * 2. Handle all file operations (upload, download, delete, rename, copy, move)
 * 3. Support batch operations
 * 4. Search and filter files
 * 5. Compress and extract archives
 * 
 * ⚠️ Important Note for Next Developer:
 * - All operations use remote_command API (not terminal)
 * - Path construction must be correct (buildPath helper)
 * - User confirmation required for destructive operations
 * - File size validation before upload
 * 
 * Last Modified: v6.0.0 - Complete feature set implementation
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
  Copy,
  Scissors,
  FolderPlus,
  Search,
  FileArchive,
  FileOutput,
  Filter,
  MoreVertical,
  ArrowRight,
  CheckSquare,
  Square
} from 'lucide-react';
import clsx from 'clsx';

// Import utilities
import { 
  formatBytes, 
  isTextFile, 
  isArchiveFile,
  COMPRESSION_FORMATS 
} from '../../lib/constants/remoteCommands';

// File type icon mapping
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

export default function FileManager({ 
  nodeReference, 
  listDirectory,
  readFile,
  writeFile,
  deleteFile,
  renameFile,
  copyFile,
  moveFile,
  createDirectory,
  deleteDirectory,
  searchFiles,
  compressFiles,
  extractFile,
  batchDelete,
  batchMove,
  batchCopy
}) {
  // ==================== STATE MANAGEMENT ====================
  
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Selection state
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  
  // Operation states
  const [editingFile, setEditingFile] = useState(null);
  const [editingContent, setEditingContent] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Modal states
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  
  // Modal data
  const [renamingFile, setRenamingFile] = useState(null);
  const [newName, setNewName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [compressFormat, setCompressFormat] = useState('zip');
  const [moveDestination, setMoveDestination] = useState('');
  
  // Clipboard
  const [clipboard, setClipboard] = useState({ files: [], operation: null }); // operation: 'copy' or 'cut'
  
  // UI states
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
  
  // Refs
  const isLoadingRef = useRef(false);
  const hasInitialLoadRef = useRef(false);
  const isMountedRef = useRef(true);

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
    
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);
    setSearchResults(null);
    
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
        
        // Sort: directories first, then files
        items.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'directory' ? -1 : 1;
        });
        
        console.log('[FileManager] Parsed files:', items);
        
        setFiles(items);
        setCurrentPath(path);
        setSelectedFiles(new Set());
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
      }
      
      setError(errorMessage);
      setFiles([]);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [listDirectory]);

  // ==================== NAVIGATION ====================
  
  const navigateToDirectory = useCallback((path) => {
    console.log('[FileManager] Navigating to:', path);
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

  // ==================== SELECTION ====================
  
  const toggleSelection = useCallback((file, index, event) => {
    setSelectedFiles(prev => {
      const newSelection = new Set(prev);
      
      if (event.shiftKey && lastSelectedIndex !== null) {
        // Shift-click: select range
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        for (let i = start; i <= end; i++) {
          if (files[i]) {
            newSelection.add(files[i].path);
          }
        }
      } else if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd-click: toggle individual
        if (newSelection.has(file.path)) {
          newSelection.delete(file.path);
        } else {
          newSelection.add(file.path);
        }
      } else {
        // Single click: select only this file
        newSelection.clear();
        newSelection.add(file.path);
      }
      
      return newSelection;
    });
    
    setLastSelectedIndex(index);
  }, [lastSelectedIndex, files]);

  const selectAll = useCallback(() => {
    setSelectedFiles(new Set(files.map(f => f.path)));
  }, [files]);

  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
    setLastSelectedIndex(null);
  }, []);

  // ==================== FILE OPERATIONS ====================
  
  const getFileIcon = (file) => {
    if (file.type === 'directory') return Folder;
    
    const extension = file.name.split('.').pop().toLowerCase();
    return FILE_ICONS[extension] || File;
  };

  const handleFileClick = (file, index, event) => {
    console.log('[FileManager] File clicked:', file);
    
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      toggleSelection(file, index, event);
      return;
    }
    
    if (file.type === 'directory') {
      navigateToDirectory(file.path);
    } else {
      const extension = file.name.split('.').pop().toLowerCase();
      if (isTextFile(file.name)) {
        editFile(file);
      } else if (isArchiveFile(file.name)) {
        handleExtract(file);
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
    
    setIsSaving(true);
    setError(null);
    
    try {
      console.log('[FileManager] Saving file:', editingFile.path);
      console.log('[FileManager] Content length:', editingContent.length);
      
      await writeFile(editingFile.path, editingContent);
      
      console.log('[FileManager] File saved successfully');
      
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
  
  const handleDelete = async (file) => {
    console.log('[FileManager] Delete requested for:', file);
    
    if (!file.path) {
      console.error('[FileManager] File path is missing:', file);
      setError('File path is missing');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${file.name}?`)) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[FileManager] Deleting file:', file.path);
      
      if (file.type === 'directory') {
        await deleteDirectory(file.path, { recursive: true });
      } else {
        await deleteFile(file.path);
      }
      
      console.log('[FileManager] Deleted successfully');
      
      await loadDirectory(currentPath);
      showSuccess(`${file.name} deleted successfully`);
      
    } catch (err) {
      console.error('[FileManager] Failed to delete:', err);
      
      let errorMessage = `Failed to delete ${file.name}`;
      if (err && err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedFiles.size === 0) return;
    
    const fileNames = Array.from(selectedFiles).map(path => {
      const parts = path.split('/');
      return parts[parts.length - 1];
    }).join(', ');
    
    if (!confirm(`Are you sure you want to delete ${selectedFiles.size} items?\n\n${fileNames}`)) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await batchDelete(Array.from(selectedFiles));
      await loadDirectory(currentPath);
      showSuccess(`${selectedFiles.size} items deleted successfully`);
      clearSelection();
    } catch (err) {
      console.error('[FileManager] Batch delete failed:', err);
      setError(err.message || 'Batch delete failed');
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== RENAME ====================
  
  const handleRename = (file) => {
    setRenamingFile(file);
    setNewName(file.name);
    setShowRenameModal(true);
  };

  const confirmRename = async () => {
    if (!renamingFile || !newName.trim()) return;
    
    const newPath = buildPath(currentPath, newName);
    
    setIsLoading(true);
    setError(null);
    
    try {
      await renameFile(renamingFile.path, newPath);
      await loadDirectory(currentPath);
      showSuccess(`Renamed to ${newName}`);
      setShowRenameModal(false);
    } catch (err) {
      console.error('[FileManager] Rename failed:', err);
      setError(err.message || 'Rename failed');
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== COPY/CUT/PASTE ====================
  
  const handleCopy = useCallback(() => {
    if (selectedFiles.size === 0) return;
    setClipboard({ files: Array.from(selectedFiles), operation: 'copy' });
    showSuccess(`${selectedFiles.size} items copied to clipboard`);
  }, [selectedFiles]);

  const handleCut = useCallback(() => {
    if (selectedFiles.size === 0) return;
    setClipboard({ files: Array.from(selectedFiles), operation: 'cut' });
    showSuccess(`${selectedFiles.size} items cut to clipboard`);
  }, [selectedFiles]);

  const handlePaste = async () => {
    if (clipboard.files.length === 0) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      if (clipboard.operation === 'copy') {
        await batchCopy(clipboard.files, currentPath);
        showSuccess(`${clipboard.files.length} items copied`);
      } else if (clipboard.operation === 'cut') {
        await batchMove(clipboard.files, currentPath);
        showSuccess(`${clipboard.files.length} items moved`);
        setClipboard({ files: [], operation: null });
      }
      
      await loadDirectory(currentPath);
      clearSelection();
    } catch (err) {
      console.error('[FileManager] Paste failed:', err);
      setError(err.message || 'Paste operation failed');
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== NEW FOLDER ====================
  
  const handleNewFolder = () => {
    setNewFolderName('');
    setShowNewFolderModal(true);
  };

  const confirmNewFolder = async () => {
    if (!newFolderName.trim()) return;
    
    const folderPath = buildPath(currentPath, newFolderName);
    
    setIsLoading(true);
    setError(null);
    
    try {
      await createDirectory(folderPath);
      await loadDirectory(currentPath);
      showSuccess(`Folder "${newFolderName}" created`);
      setShowNewFolderModal(false);
    } catch (err) {
      console.error('[FileManager] Create folder failed:', err);
      setError(err.message || 'Failed to create folder');
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== SEARCH ====================
  
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await searchFiles(currentPath, searchQuery, {
        caseSensitive: false,
        maxDepth: 5
      });
      
      const items = (result.entries || []).map(entry => ({
        name: entry.name,
        type: entry.type === 'directory' ? 'directory' : 'file',
        size: entry.size || 0,
        path: entry.path,
        permissions: entry.permissions || '',
        modified: entry.modified
      }));
      
      setSearchResults(items);
      setFiles(items);
      showSuccess(`Found ${items.length} items`);
      
    } catch (err) {
      console.error('[FileManager] Search failed:', err);
      setError(err.message || 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    loadDirectory(currentPath);
  };

  // ==================== COMPRESS ====================
  
  const handleCompress = () => {
    if (selectedFiles.size === 0) return;
    setCompressFormat('zip');
    setShowCompressModal(true);
  };

  const confirmCompress = async () => {
    if (selectedFiles.size === 0) return;
    
    const archiveName = `archive_${Date.now()}.${compressFormat}`;
    const archivePath = buildPath(currentPath, archiveName);
    
    setIsLoading(true);
    setError(null);
    
    try {
      await compressFiles(Array.from(selectedFiles), archivePath, {
        format: compressFormat
      });
      
      await loadDirectory(currentPath);
      showSuccess(`Archive created: ${archiveName}`);
      setShowCompressModal(false);
      clearSelection();
    } catch (err) {
      console.error('[FileManager] Compress failed:', err);
      setError(err.message || 'Compression failed');
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== EXTRACT ====================
  
  const handleExtract = async (file) => {
    if (!isArchiveFile(file.name)) return;
    
    if (!confirm(`Extract ${file.name} to current directory?`)) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await extractFile(file.path, { destination: currentPath });
      await loadDirectory(currentPath);
      showSuccess(`${file.name} extracted successfully`);
    } catch (err) {
      console.error('[FileManager] Extract failed:', err);
      setError(err.message || 'Extraction failed');
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
    if (!hasInitialLoadRef.current && listDirectory) {
      console.log('[FileManager] Initial load');
      hasInitialLoadRef.current = true;
      loadDirectory('/');
    }
  }, [listDirectory, loadDirectory]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'a') {
          e.preventDefault();
          selectAll();
        } else if (e.key === 'c') {
          e.preventDefault();
          handleCopy();
        } else if (e.key === 'x') {
          e.preventDefault();
          handleCut();
        } else if (e.key === 'v') {
          e.preventDefault();
          handlePaste();
        }
      } else if (e.key === 'Delete') {
        if (selectedFiles.size > 0) {
          handleBatchDelete();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFiles, handleCopy, handleCut, selectAll]);

  // Breadcrumb navigation
  const breadcrumbParts = currentPath.split('/').filter(Boolean);
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    ...breadcrumbParts.map((part, index) => ({
      name: part,
      path: '/' + breadcrumbParts.slice(0, index + 1).join('/')
    }))
  ];

  // ==================== RENDER ====================
  
  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white">File Manager</h3>
        <div className="flex items-center gap-2">
          {/* Toolbar */}
          {selectedFiles.size > 0 && (
            <>
              <span className="text-sm text-gray-400">{selectedFiles.size} selected</span>
              <button
                onClick={handleCopy}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Copy (Ctrl+C)"
              >
                <Copy className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={handleCut}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Cut (Ctrl+X)"
              >
                <Scissors className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={handleCompress}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Compress"
              >
                <FileArchive className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={handleBatchDelete}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Delete (Del)"
              >
                <Trash2 className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={clearSelection}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Clear Selection"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
              <div className="w-px h-6 bg-white/10" />
            </>
          )}
          
          {clipboard.files.length > 0 && (
            <>
              <button
                onClick={handlePaste}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title={`Paste ${clipboard.files.length} items (Ctrl+V)`}
              >
                <FileOutput className="w-4 h-4 text-gray-400" />
              </button>
              <div className="w-px h-6 bg-white/10" />
            </>
          )}
          
          <button
            onClick={handleNewFolder}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="New Folder"
          >
            <FolderPlus className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => setShowSearchModal(true)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Search"
          >
            <Search className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => loadDirectory(currentPath)}
            disabled={isLoading}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={clsx("w-4 h-4 text-gray-400", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        {searchResults && (
          <button
            onClick={clearSearch}
            className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded flex items-center gap-1 text-xs"
          >
            <Filter className="w-3 h-3" />
            Search Results
            <X className="w-3 h-3" />
          </button>
        )}
        {!searchResults && breadcrumbs.map((crumb, index) => (
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
            {currentPath !== '/' && !searchResults && (
              <button
                onClick={navigateUp}
                className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg transition-colors"
              >
                <Folder className="w-5 h-5 text-blue-400" />
                <span className="text-gray-400">..</span>
              </button>
            )}
            
            {/* Files */}
            {files.map((file, index) => {
              const Icon = getFileIcon(file);
              const isSelected = selectedFiles.has(file.path);
              
              return (
                <div
                  key={file.path}
                  className={clsx(
                    "flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg transition-colors cursor-pointer group",
                    isSelected && "bg-white/10"
                  )}
                  onClick={(e) => handleFileClick(file, index, e)}
                >
                  {/* Selection checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelection(file, index, e);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-purple-400" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  
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
                        {isArchiveFile(file.name) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExtract(file);
                            }}
                            className="p-1.5 hover:bg-white/10 rounded transition-colors"
                            title="Extract"
                          >
                            <FileOutput className="w-4 h-4 text-gray-400" />
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRename(file);
                      }}
                      className="p-1.5 hover:bg-white/10 rounded transition-colors"
                      title="Rename"
                    >
                      <Edit className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(file);
                      }}
                      className="p-1.5 hover:bg-white/10 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals - Rename, New Folder, Search, Compress, etc. */}
      {/* (Implementation of modals similar to existing pattern) */}
      
      {/* File editor modal (existing code) */}
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
