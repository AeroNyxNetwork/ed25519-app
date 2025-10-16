/**
 * ============================================
 * File: src/lib/utils/remoteCommandErrors.js
 * ============================================
 * Remote Command Error Handling System
 * 
 * Creation Reason: Unified handling of backend error codes and messages
 * Main Functionality: Error code mapping, user-friendly messages, error classification
 * Dependencies: None
 * 
 * Main Logical Flow:
 * 1. Define all error code constants
 * 2. Map error codes to user-friendly messages
 * 3. Provide error object creation and conversion methods
 * 4. Classify error severity levels
 * 
 * ⚠️ Important Note for Next Developer:
 * - Error codes MUST match backend Rust code exactly
 * - When adding new error codes, synchronously update ERROR_MESSAGES
 * - User messages should be clear and actionable
 * 
 * Last Modified: v1.0.0 - Initial implementation
 * ============================================
 */

/**
 * Error Code Enumeration
 * Must match backend RemoteCommandError structure
 */
export const ERROR_CODES = {
  // Command-related errors
  INVALID_COMMAND: 'INVALID_COMMAND',
  INVALID_PARAMETERS: 'INVALID_PARAMETERS',
  COMMAND_FAILED: 'COMMAND_FAILED',
  
  // Permission-related errors
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  
  // File-related errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_EXISTS: 'FILE_EXISTS',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_PATH: 'INVALID_PATH',
  DIRECTORY_NOT_EMPTY: 'DIRECTORY_NOT_EMPTY',
  
  // Operation-related errors
  OPERATION_FAILED: 'OPERATION_FAILED',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
  
  // System-related errors
  NODE_OFFLINE: 'NODE_OFFLINE',
  NODE_NOT_FOUND: 'NODE_NOT_FOUND',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  
  // Network-related errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_LOST: 'CONNECTION_LOST',
  
  // Authentication-related errors
  AUTH_FAILED: 'AUTH_FAILED',
  INVALID_JWT: 'INVALID_JWT',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  REMOTE_NOT_ENABLED: 'REMOTE_NOT_ENABLED',
  
  // Resource-related errors
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  DISK_FULL: 'DISK_FULL',
  MEMORY_ERROR: 'MEMORY_ERROR',
  
  // Unknown error
  UNKNOWN: 'UNKNOWN'
};

/**
 * Error Message Mapping
 * Provides user-friendly error descriptions
 */
export const ERROR_MESSAGES = {
  // Command-related errors
  [ERROR_CODES.INVALID_COMMAND]: 'Invalid command type',
  [ERROR_CODES.INVALID_PARAMETERS]: 'Invalid command parameters',
  [ERROR_CODES.COMMAND_FAILED]: 'Command execution failed',
  
  // Permission-related errors
  [ERROR_CODES.PERMISSION_DENIED]: 'Permission denied',
  [ERROR_CODES.UNAUTHORIZED]: 'Unauthorized access',
  [ERROR_CODES.ACCESS_DENIED]: 'Access denied',
  
  // File-related errors
  [ERROR_CODES.FILE_NOT_FOUND]: 'File or directory not found',
  [ERROR_CODES.FILE_EXISTS]: 'File already exists',
  [ERROR_CODES.FILE_TOO_LARGE]: 'File size exceeds limit',
  [ERROR_CODES.INVALID_PATH]: 'Invalid file path',
  [ERROR_CODES.DIRECTORY_NOT_EMPTY]: 'Directory is not empty',
  
  // Operation-related errors
  [ERROR_CODES.OPERATION_FAILED]: 'Operation failed',
  [ERROR_CODES.TIMEOUT]: 'Operation timed out',
  [ERROR_CODES.CANCELLED]: 'Operation cancelled',
  
  // System-related errors
  [ERROR_CODES.NODE_OFFLINE]: 'Node is offline',
  [ERROR_CODES.NODE_NOT_FOUND]: 'Node not found',
  [ERROR_CODES.SYSTEM_ERROR]: 'System error occurred',
  [ERROR_CODES.INTERNAL_ERROR]: 'Internal server error',
  
  // Network-related errors
  [ERROR_CODES.NETWORK_ERROR]: 'Network error',
  [ERROR_CODES.CONNECTION_LOST]: 'Connection lost',
  
  // Authentication-related errors
  [ERROR_CODES.AUTH_FAILED]: 'Authentication failed',
  [ERROR_CODES.INVALID_JWT]: 'Invalid authentication token',
  [ERROR_CODES.TOKEN_EXPIRED]: 'Authentication token expired',
  [ERROR_CODES.REMOTE_NOT_ENABLED]: 'Remote management is not enabled',
  
  // Resource-related errors
  [ERROR_CODES.RESOURCE_EXHAUSTED]: 'System resources exhausted',
  [ERROR_CODES.DISK_FULL]: 'Disk space full',
  [ERROR_CODES.MEMORY_ERROR]: 'Memory allocation error',
  
  // Unknown error
  [ERROR_CODES.UNKNOWN]: 'An unknown error occurred'
};

/**
 * Error Severity Levels
 */
export const ERROR_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * Error Severity Mapping
 * Maps error codes to severity levels
 */
export const ERROR_SEVERITY_MAP = {
  // Info level - typically user errors that can be corrected
  [ERROR_CODES.FILE_EXISTS]: ERROR_SEVERITY.INFO,
  [ERROR_CODES.DIRECTORY_NOT_EMPTY]: ERROR_SEVERITY.INFO,
  [ERROR_CODES.CANCELLED]: ERROR_SEVERITY.INFO,
  
  // Warning level - issues that should be noted but aren't critical
  [ERROR_CODES.FILE_TOO_LARGE]: ERROR_SEVERITY.WARNING,
  [ERROR_CODES.TIMEOUT]: ERROR_SEVERITY.WARNING,
  [ERROR_CODES.TOKEN_EXPIRED]: ERROR_SEVERITY.WARNING,
  
  // Error level - standard errors that prevent operation
  [ERROR_CODES.INVALID_COMMAND]: ERROR_SEVERITY.ERROR,
  [ERROR_CODES.INVALID_PARAMETERS]: ERROR_SEVERITY.ERROR,
  [ERROR_CODES.PERMISSION_DENIED]: ERROR_SEVERITY.ERROR,
  [ERROR_CODES.FILE_NOT_FOUND]: ERROR_SEVERITY.ERROR,
  [ERROR_CODES.INVALID_PATH]: ERROR_SEVERITY.ERROR,
  [ERROR_CODES.COMMAND_FAILED]: ERROR_SEVERITY.ERROR,
  [ERROR_CODES.OPERATION_FAILED]: ERROR_SEVERITY.ERROR,
  [ERROR_CODES.AUTH_FAILED]: ERROR_SEVERITY.ERROR,
  [ERROR_CODES.INVALID_JWT]: ERROR_SEVERITY.ERROR,
  
  // Critical level - serious system issues
  [ERROR_CODES.NODE_OFFLINE]: ERROR_SEVERITY.CRITICAL,
  [ERROR_CODES.NODE_NOT_FOUND]: ERROR_SEVERITY.CRITICAL,
  [ERROR_CODES.SYSTEM_ERROR]: ERROR_SEVERITY.CRITICAL,
  [ERROR_CODES.INTERNAL_ERROR]: ERROR_SEVERITY.CRITICAL,
  [ERROR_CODES.CONNECTION_LOST]: ERROR_SEVERITY.CRITICAL,
  [ERROR_CODES.RESOURCE_EXHAUSTED]: ERROR_SEVERITY.CRITICAL,
  [ERROR_CODES.DISK_FULL]: ERROR_SEVERITY.CRITICAL,
  [ERROR_CODES.MEMORY_ERROR]: ERROR_SEVERITY.CRITICAL
};

/**
 * Actionable Error Suggestions
 * Provides helpful suggestions for common errors
 */
export const ERROR_SUGGESTIONS = {
  [ERROR_CODES.PERMISSION_DENIED]: 'Check file permissions or try with administrator privileges',
  [ERROR_CODES.FILE_NOT_FOUND]: 'Verify the file path and try again',
  [ERROR_CODES.FILE_EXISTS]: 'Choose a different name or enable overwrite option',
  [ERROR_CODES.FILE_TOO_LARGE]: 'Try compressing the file or splitting it into smaller parts',
  [ERROR_CODES.NODE_OFFLINE]: 'Check node connection and try again later',
  [ERROR_CODES.TIMEOUT]: 'The operation took too long. Try again or increase timeout',
  [ERROR_CODES.TOKEN_EXPIRED]: 'Your session has expired. Please re-authenticate',
  [ERROR_CODES.DISK_FULL]: 'Free up disk space on the remote node',
  [ERROR_CODES.DIRECTORY_NOT_EMPTY]: 'Use recursive delete option or empty the directory first',
  [ERROR_CODES.REMOTE_NOT_ENABLED]: 'Enable remote management in node configuration'
};

/**
 * Remote Command Error Class
 * Enhanced error object with additional metadata
 */
export class RemoteCommandError extends Error {
  /**
   * Constructor
   * @param {string} code - Error code from ERROR_CODES
   * @param {string} message - Error message (optional, will use default if not provided)
   * @param {Object} details - Additional error details
   */
  constructor(code, message = null, details = {}) {
    const errorMessage = message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN];
    super(errorMessage);
    
    this.name = 'RemoteCommandError';
    this.code = code || ERROR_CODES.UNKNOWN;
    this.details = details;
    this.severity = ERROR_SEVERITY_MAP[code] || ERROR_SEVERITY.ERROR;
    this.suggestion = ERROR_SUGGESTIONS[code] || null;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RemoteCommandError);
    }
  }
  
  /**
   * Create RemoteCommandError from backend response
   * @param {Object|string} error - Error from backend response
   * @returns {RemoteCommandError}
   */
  static fromResponse(error) {
    if (typeof error === 'string') {
      return new RemoteCommandError(ERROR_CODES.UNKNOWN, error);
    }
    
    if (!error) {
      return new RemoteCommandError(ERROR_CODES.UNKNOWN, 'Unknown error occurred');
    }
    
    return new RemoteCommandError(
      error.code || ERROR_CODES.UNKNOWN,
      error.message,
      error.details || {}
    );
  }
  
  /**
   * Check if error is retryable
   * @returns {boolean}
   */
  isRetryable() {
    const retryableCodes = [
      ERROR_CODES.TIMEOUT,
      ERROR_CODES.NETWORK_ERROR,
      ERROR_CODES.CONNECTION_LOST,
      ERROR_CODES.TOKEN_EXPIRED
    ];
    
    return retryableCodes.includes(this.code);
  }
  
  /**
   * Check if error requires re-authentication
   * @returns {boolean}
   */
  requiresReauth() {
    const reauthCodes = [
      ERROR_CODES.AUTH_FAILED,
      ERROR_CODES.INVALID_JWT,
      ERROR_CODES.TOKEN_EXPIRED,
      ERROR_CODES.UNAUTHORIZED
    ];
    
    return reauthCodes.includes(this.code);
  }
  
  /**
   * Get user-friendly error display object
   * @returns {Object}
   */
  toDisplay() {
    return {
      message: this.message,
      suggestion: this.suggestion,
      severity: this.severity,
      code: this.code,
      retryable: this.isRetryable(),
      requiresReauth: this.requiresReauth()
    };
  }
  
  /**
   * Convert to JSON for logging
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      severity: this.severity,
      suggestion: this.suggestion,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Error Handler Utility Functions
 */

/**
 * Handle remote command error with retry logic
 * @param {Error} error - Error object
 * @param {Function} retryFn - Retry function
 * @param {Object} options - Options
 * @returns {Promise}
 */
export async function handleErrorWithRetry(error, retryFn, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    onRetry = null
  } = options;
  
  const remoteError = error instanceof RemoteCommandError 
    ? error 
    : RemoteCommandError.fromResponse(error);
  
  if (!remoteError.isRetryable()) {
    throw remoteError;
  }
  
  let lastError = remoteError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (onRetry) {
        onRetry(i + 1, maxRetries);
      }
      
      await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
      
      return await retryFn();
    } catch (err) {
      lastError = err instanceof RemoteCommandError 
        ? err 
        : RemoteCommandError.fromResponse(err);
      
      if (!lastError.isRetryable()) {
        throw lastError;
      }
    }
  }
  
  throw lastError;
}

/**
 * Log error with proper formatting
 * @param {Error} error - Error to log
 * @param {string} context - Context information
 */
export function logError(error, context = '') {
  const remoteError = error instanceof RemoteCommandError 
    ? error 
    : RemoteCommandError.fromResponse(error);
  
  const logData = {
    context,
    ...remoteError.toJSON()
  };
  
  // Use appropriate console method based on severity
  switch (remoteError.severity) {
    case ERROR_SEVERITY.CRITICAL:
      console.error('[CRITICAL]', logData);
      break;
    case ERROR_SEVERITY.ERROR:
      console.error('[ERROR]', logData);
      break;
    case ERROR_SEVERITY.WARNING:
      console.warn('[WARNING]', logData);
      break;
    default:
      console.log('[INFO]', logData);
  }
}

/**
 * Get error color for UI display
 * @param {string} severity - Error severity level
 * @returns {string} Tailwind color class
 */
export function getErrorColor(severity) {
  const colorMap = {
    [ERROR_SEVERITY.INFO]: 'blue',
    [ERROR_SEVERITY.WARNING]: 'yellow',
    [ERROR_SEVERITY.ERROR]: 'red',
    [ERROR_SEVERITY.CRITICAL]: 'red'
  };
  
  return colorMap[severity] || 'red';
}

/**
 * Get error icon for UI display
 * @param {string} severity - Error severity level
 * @returns {string} Icon name
 */
export function getErrorIcon(severity) {
  const iconMap = {
    [ERROR_SEVERITY.INFO]: 'info',
    [ERROR_SEVERITY.WARNING]: 'alert-triangle',
    [ERROR_SEVERITY.ERROR]: 'alert-circle',
    [ERROR_SEVERITY.CRITICAL]: 'x-octagon'
  };
  
  return iconMap[severity] || 'alert-circle';
}

// Export everything
export default {
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_SEVERITY,
  ERROR_SEVERITY_MAP,
  ERROR_SUGGESTIONS,
  RemoteCommandError,
  handleErrorWithRetry,
  logError,
  getErrorColor,
  getErrorIcon
};
