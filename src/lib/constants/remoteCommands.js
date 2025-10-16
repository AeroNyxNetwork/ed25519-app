/**
 * ============================================
 * File: src/lib/constants/remoteCommands.js
 * ============================================
 * Remote Command System Constants
 * 
 * Creation Reason: Centralized management of remote command types, timeout configurations, and validation rules
 * Main Functionality: Provides type-safe command constants and configurations
 * Dependencies: None
 * 
 * Main Logical Flow:
 * 1. Define all supported remote command types
 * 2. Configure timeout for each command
 * 3. Define file size and path validation rules
 * 
 * ⚠️ Important Note for Next Developer:
 * - These constants MUST match the backend Rust code exactly
 * - When adding new commands, synchronously update COMMAND_TIMEOUTS
 * - Consider backend configuration when modifying limits
 * 
 * Last Modified: v1.0.1 - Fixed path for lib/constants location
 * ============================================
 */

/**
 * Remote Command Type Enumeration
 * Must match backend RemoteCommandType enum
 */
export const REMOTE_COMMAND_TYPES = {
  // File operations
  UPLOAD: 'upload',
  DOWNLOAD: 'download',
  DELETE: 'delete',
  RENAME: 'rename',
  COPY: 'copy',
  MOVE: 'move',
  LIST: 'list',
  
  // Directory operations
  CREATE_DIRECTORY: 'create_directory',
  DELETE_DIRECTORY: 'delete_directory',
  
  // Search
  SEARCH: 'search',
  
  // Compression
  COMPRESS: 'compress',
  EXTRACT: 'extract',
  
  // Permissions
  CHMOD: 'chmod',
  CHOWN: 'chown',
  
  // Batch operations
  BATCH_DELETE: 'batch_delete',
  BATCH_MOVE: 'batch_move',
  BATCH_COPY: 'batch_copy',
  
  // System & Execution
  SYSTEM_INFO: 'system_info',
  EXECUTE: 'execute'
};

/**
 * Command Timeout Configuration (milliseconds)
 * Different timeouts based on operation complexity
 */
export const COMMAND_TIMEOUTS = {
  [REMOTE_COMMAND_TYPES.UPLOAD]: 120000,
  [REMOTE_COMMAND_TYPES.DOWNLOAD]: 120000,
  [REMOTE_COMMAND_TYPES.DELETE]: 30000,
  [REMOTE_COMMAND_TYPES.RENAME]: 10000,
  [REMOTE_COMMAND_TYPES.COPY]: 60000,
  [REMOTE_COMMAND_TYPES.MOVE]: 60000,
  [REMOTE_COMMAND_TYPES.LIST]: 30000,
  [REMOTE_COMMAND_TYPES.CREATE_DIRECTORY]: 10000,
  [REMOTE_COMMAND_TYPES.DELETE_DIRECTORY]: 60000,
  [REMOTE_COMMAND_TYPES.SEARCH]: 60000,
  [REMOTE_COMMAND_TYPES.COMPRESS]: 180000,
  [REMOTE_COMMAND_TYPES.EXTRACT]: 180000,
  [REMOTE_COMMAND_TYPES.CHMOD]: 10000,
  [REMOTE_COMMAND_TYPES.CHOWN]: 10000,
  [REMOTE_COMMAND_TYPES.BATCH_DELETE]: 120000,
  [REMOTE_COMMAND_TYPES.BATCH_MOVE]: 120000,
  [REMOTE_COMMAND_TYPES.BATCH_COPY]: 120000,
  [REMOTE_COMMAND_TYPES.SYSTEM_INFO]: 30000,
  [REMOTE_COMMAND_TYPES.EXECUTE]: 60000,
  DEFAULT: 30000
};

/**
 * File Size Limits (bytes)
 * Must match backend configuration
 */
export const FILE_SIZE_LIMITS = {
  MAX_UPLOAD_SIZE: 50 * 1024 * 1024,     // 50MB
  MAX_DOWNLOAD_SIZE: 50 * 1024 * 1024,   // 50MB
  WARN_SIZE: 10 * 1024 * 1024,           // 10MB (show warning)
};

/**
 * Batch Operation Limits
 */
export const BATCH_OPERATION_LIMITS = {
  MAX_FILES: 100,    // Maximum 100 files per batch operation
  WARN_COUNT: 20,    // Show warning when exceeding 20 files
};

/**
 * Supported Compression Formats
 * Must match backend CompressionFormat enum
 */
export const COMPRESSION_FORMATS = {
  ZIP: 'zip',
  TAR: 'tar',
  TAR_GZ: 'tar.gz',
  TAR_BZ2: 'tar.bz2',
  TAR_XZ: 'tar.xz',
};

/**
 * Path Validation
 * @param {string} path - Path to validate
 * @returns {Object} { valid: boolean, error: string }
 */
export function validatePath(path) {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'Path cannot be empty' };
  }
  if (path.length > 4096) {
    return { valid: false, error: 'Path is too long' };
  }
  if (path.includes('..') || path.includes('\0')) {
    return { valid: false, error: 'Path contains illegal characters' };
  }
  return { valid: true, error: null };
}

/**
 * Format Bytes to Human Readable String
 * @param {number} bytes - Byte count
 * @returns {string} Formatted size string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate File Size
 * @param {number} size - File size in bytes
 * @param {string} operation - Operation type ('upload' or 'download')
 * @returns {Object} { valid: boolean, warning: boolean, error: string }
 */
export function validateFileSize(size, operation = 'upload') {
  const maxSize = operation === 'upload' 
    ? FILE_SIZE_LIMITS.MAX_UPLOAD_SIZE 
    : FILE_SIZE_LIMITS.MAX_DOWNLOAD_SIZE;
  
  if (size > maxSize) {
    return { 
      valid: false, 
      warning: false,
      error: `File size exceeds limit (max ${formatBytes(maxSize)})` 
    };
  }
  
  if (size > FILE_SIZE_LIMITS.WARN_SIZE) {
    return { 
      valid: true, 
      warning: true,
      error: `Large file (${formatBytes(size)}), transfer may take longer` 
    };
  }
  
  return { valid: true, warning: false, error: null };
}

/**
 * Validate Batch Operation
 * @param {Array} items - Array of items
 * @returns {Object} { valid: boolean, warning: boolean, error: string }
 */
export function validateBatchOperation(items) {
  if (!Array.isArray(items)) {
    return { valid: false, warning: false, error: 'Invalid items list' };
  }
  
  if (items.length === 0) {
    return { valid: false, warning: false, error: 'No items selected' };
  }
  
  if (items.length > BATCH_OPERATION_LIMITS.MAX_FILES) {
    return { 
      valid: false, 
      warning: false,
      error: `Batch operation supports maximum ${BATCH_OPERATION_LIMITS.MAX_FILES} files` 
    };
  }
  
  if (items.length > BATCH_OPERATION_LIMITS.WARN_COUNT) {
    return { 
      valid: true, 
      warning: true,
      error: `Operating on ${items.length} files, this may take longer` 
    };
  }
  
  return { valid: true, warning: false, error: null };
}

/**
 * Get File Extension
 * @param {string} filename - File name
 * @returns {string} Extension (lowercase)
 */
export function getFileExtension(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * Check if Text File
 * @param {string} filename - File name
 * @returns {boolean}
 */
export function isTextFile(filename) {
  const textExtensions = [
    'txt', 'md', 'log', 'csv', 'json', 'xml', 'yaml', 'yml', 
    'toml', 'ini', 'conf', 'config', 'js', 'jsx', 'ts', 'tsx', 
    'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'php', 
    'rb', 'html', 'htm', 'css', 'scss', 'sass', 'sh', 
    'bash', 'env', 'gitignore', 'dockerfile'
  ];
  
  const ext = getFileExtension(filename);
  return textExtensions.includes(ext);
}

/**
 * Check if Editable File
 * @param {string} filename - File name
 * @returns {boolean}
 */
export function isEditableFile(filename) {
  return isTextFile(filename);
}

/**
 * Check if Archive File
 * @param {string} filename - File name
 * @returns {boolean}
 */
export function isArchiveFile(filename) {
  const archiveExtensions = ['zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z'];
  const ext = getFileExtension(filename);
  return archiveExtensions.includes(ext);
}

/**
 * Get Command Timeout
 * @param {string} commandType - Command type
 * @returns {number} Timeout in milliseconds
 */
export function getCommandTimeout(commandType) {
  return COMMAND_TIMEOUTS[commandType] || COMMAND_TIMEOUTS.DEFAULT;
}

// Export everything
export default {
  REMOTE_COMMAND_TYPES,
  COMMAND_TIMEOUTS,
  FILE_SIZE_LIMITS,
  BATCH_OPERATION_LIMITS,
  COMPRESSION_FORMATS,
  validatePath,
  validateFileSize,
  validateBatchOperation,
  formatBytes,
  getFileExtension,
  isTextFile,
  isEditableFile,
  isArchiveFile,
  getCommandTimeout,
};
