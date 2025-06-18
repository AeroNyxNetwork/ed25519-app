/**
 * WebSocket Error Recovery Strategy for AeroNyx Platform
 * 
 * File Path: src/lib/websocket/ErrorRecoveryStrategy.js
 * 
 * Implements intelligent error recovery mechanisms for WebSocket connections
 * based on the API documentation's specific error codes and connection limits.
 * 
 * Features:
 * - Exponential backoff with jitter for reconnection attempts
 * - Error classification (temporary vs permanent)
 * - Connection state management
 * - Rate limiting and quota tracking
 * - Performance metrics collection
 * - Adaptive recovery strategies based on error patterns
 * 
 * Based on API Error Codes:
 * - 4000: Connection setup failed (temporary)
 * - 4001: Authentication timeout (temporary)
 * - 4002: Connection inactive (temporary)
 * - 4005: Too many security violations (permanent)
 * - 4006: Account locked due to failed attempts (permanent)
 * - 4007: Authentication attempts exceeded (permanent)
 * - 4008: Too many connections from this IP (temporary)
 * - 4009: Server connection limit reached (temporary)
 * - 4010: Invalid client (permanent)
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

/**
 * Error classification constants
 */
const ERROR_TYPES = {
  TEMPORARY: 'temporary',
  PERMANENT: 'permanent',
  RATE_LIMIT: 'rate_limit',
  AUTH_FAILURE: 'auth_failure',
  NETWORK: 'network',
  UNKNOWN: 'unknown'
};

/**
 * WebSocket close codes from API documentation
 */
const CLOSE_CODES = {
  // Standard WebSocket codes
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  ABNORMAL_CLOSURE: 1006,
  
  // Custom AeroNyx codes
  CONNECTION_SETUP_FAILED: 4000,
  AUTH_TIMEOUT: 4001,
  CONNECTION_INACTIVE: 4002,
  SECURITY_VIOLATIONS: 4005,
  ACCOUNT_LOCKED: 4006,
  AUTH_ATTEMPTS_EXCEEDED: 4007,
  IP_CONNECTION_LIMIT: 4008,
  SERVER_CONNECTION_LIMIT: 4009,
  INVALID_CLIENT: 4010
};

/**
 * Default configuration for error recovery
 */
const DEFAULT_CONFIG = {
  maxRetries: 5,
  initialDelay: 1000,              // 1 second
  maxDelay: 30000,                 // 30 seconds
  backoffMultiplier: 1.5,
  jitterFactor: 0.3,               // 30% jitter
  rateLimitWindow: 60000,          // 1 minute
  maxRateLimitErrors: 3,
  permanentErrorCooldown: 300000,  // 5 minutes
  performanceWindow: 3600000,      // 1 hour
  adaptiveBackoff: true
};

/**
 * Error recovery strategy implementation
 */
export default class ErrorRecoveryStrategy {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // State management
    this.state = {
      retryCount: 0,
      lastError: null,
      lastErrorTime: null,
      isRecovering: false,
      permanentFailure: false,
      cooldownUntil: null
    };
    
    // Error tracking
    this.errorHistory = [];
    this.rateLimitErrors = [];
    
    // Performance metrics
    this.metrics = {
      totalErrors: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      averageRecoveryTime: 0,
      errorsByType: {},
      connectionStability: 100
    };
    
    // Recovery callbacks
    this.onRecoveryStart = null;
    this.onRecoverySuccess = null;
    this.onRecoveryFailed = null;
    this.onPermanentFailure = null;
  }

  /**
   * Determine if connection should be retried based on error
   * 
   * @param {number|Error} errorOrCode - Error object or WebSocket close code
   * @returns {boolean} Whether to attempt reconnection
   */
  shouldReconnect(errorOrCode) {
    // Check if in cooldown period
    if (this.state.cooldownUntil && Date.now() < this.state.cooldownUntil) {
      return false;
    }
    
    // Check if permanently failed
    if (this.state.permanentFailure) {
      return false;
    }
    
    // Check retry limit
    if (this.state.retryCount >= this.config.maxRetries) {
      this.handlePermanentFailure('Max retries exceeded');
      return false;
    }
    
    // Classify error
    const errorType = this.classifyError(errorOrCode);
    
    // Don't retry permanent errors
    if (errorType === ERROR_TYPES.PERMANENT) {
      this.handlePermanentFailure('Permanent error encountered');
      return false;
    }
    
    // Check rate limit
    if (errorType === ERROR_TYPES.RATE_LIMIT) {
      if (!this.checkRateLimit()) {
        this.handlePermanentFailure('Rate limit exceeded');
        return false;
      }
    }
    
    return true;
  }

  /**
   * Calculate next retry delay with exponential backoff and jitter
   * 
   * @returns {number} Delay in milliseconds
   */
  getNextDelay() {
    let delay = this.config.initialDelay;
    
    // Exponential backoff
    if (this.state.retryCount > 0) {
      delay = Math.min(
        this.config.initialDelay * Math.pow(this.config.backoffMultiplier, this.state.retryCount),
        this.config.maxDelay
      );
    }
    
    // Adaptive backoff based on error patterns
    if (this.config.adaptiveBackoff) {
      delay = this.applyAdaptiveBackoff(delay);
    }
    
    // Add jitter to prevent thundering herd
    const jitter = delay * this.config.jitterFactor * (Math.random() * 2 - 1);
    delay = Math.round(delay + jitter);
    
    return Math.max(delay, 0);
  }

  /**
   * Record an error and update metrics
   * 
   * @param {number|Error} errorOrCode - Error object or WebSocket close code
   */
  recordError(errorOrCode) {
    const now = Date.now();
    const errorType = this.classifyError(errorOrCode);
    
    // Update state
    this.state.lastError = errorOrCode;
    this.state.lastErrorTime = now;
    this.state.retryCount++;
    
    // Track error
    const errorEntry = {
      type: errorType,
      code: this.getErrorCode(errorOrCode),
      message: this.getErrorMessage(errorOrCode),
      timestamp: now,
      retryCount: this.state.retryCount
    };
    
    this.errorHistory.push(errorEntry);
    
    // Maintain history size
    if (this.errorHistory.length > 100) {
      this.errorHistory.shift();
    }
    
    // Track rate limit errors
    if (errorType === ERROR_TYPES.RATE_LIMIT) {
      this.rateLimitErrors.push(now);
      this.cleanupRateLimitErrors();
    }
    
    // Update metrics
    this.metrics.totalErrors++;
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
    this.updateConnectionStability();
  }

  /**
   * Record successful recovery
   */
  recordSuccess() {
    const recoveryTime = this.state.lastErrorTime ? Date.now() - this.state.lastErrorTime : 0;
    
    // Update metrics
    this.metrics.successfulRecoveries++;
    this.updateAverageRecoveryTime(recoveryTime);
    
    // Reset state
    this.resetState();
    
    // Update connection stability
    this.updateConnectionStability();
    
    // Trigger callback
    if (this.onRecoverySuccess) {
      this.onRecoverySuccess({
        recoveryTime,
        attempts: this.state.retryCount
      });
    }
  }

  /**
   * Record failed recovery attempt
   */
  recordFailure() {
    this.metrics.failedRecoveries++;
    
    if (this.onRecoveryFailed) {
      this.onRecoveryFailed({
        attempts: this.state.retryCount,
        lastError: this.state.lastError
      });
    }
  }

  /**
   * Start recovery process
   */
  startRecovery() {
    this.state.isRecovering = true;
    
    if (this.onRecoveryStart) {
      this.onRecoveryStart({
        retryCount: this.state.retryCount,
        nextDelay: this.getNextDelay()
      });
    }
  }

  /**
   * Reset recovery state
   */
  resetState() {
    this.state = {
      retryCount: 0,
      lastError: null,
      lastErrorTime: null,
      isRecovering: false,
      permanentFailure: false,
      cooldownUntil: null
    };
  }

  /**
   * Classify error type based on code or error object
   * 
   * @private
   * @param {number|Error} errorOrCode - Error object or close code
   * @returns {string} Error type from ERROR_TYPES
   */
  classifyError(errorOrCode) {
    const code = this.getErrorCode(errorOrCode);
    
    // Permanent errors
    const permanentCodes = [
      CLOSE_CODES.SECURITY_VIOLATIONS,
      CLOSE_CODES.ACCOUNT_LOCKED,
      CLOSE_CODES.AUTH_ATTEMPTS_EXCEEDED,
      CLOSE_CODES.INVALID_CLIENT
    ];
    
    if (permanentCodes.includes(code)) {
      return ERROR_TYPES.PERMANENT;
    }
    
    // Auth failures
    const authCodes = [
      CLOSE_CODES.AUTH_TIMEOUT,
      CLOSE_CODES.AUTH_ATTEMPTS_EXCEEDED
    ];
    
    if (authCodes.includes(code)) {
      return ERROR_TYPES.AUTH_FAILURE;
    }
    
    // Rate limit errors
    const rateLimitCodes = [
      CLOSE_CODES.IP_CONNECTION_LIMIT,
      CLOSE_CODES.SERVER_CONNECTION_LIMIT
    ];
    
    if (rateLimitCodes.includes(code)) {
      return ERROR_TYPES.RATE_LIMIT;
    }
    
    // Network errors
    if (code === CLOSE_CODES.ABNORMAL_CLOSURE || 
        (errorOrCode instanceof Error && errorOrCode.message?.includes('network'))) {
      return ERROR_TYPES.NETWORK;
    }
    
    // Temporary errors
    const temporaryCodes = [
      CLOSE_CODES.CONNECTION_SETUP_FAILED,
      CLOSE_CODES.CONNECTION_INACTIVE,
      CLOSE_CODES.GOING_AWAY
    ];
    
    if (temporaryCodes.includes(code)) {
      return ERROR_TYPES.TEMPORARY;
    }
    
    return ERROR_TYPES.UNKNOWN;
  }

  /**
   * Get error code from error or code
   * 
   * @private
   * @param {number|Error} errorOrCode - Error object or close code
   * @returns {number} Error code
   */
  getErrorCode(errorOrCode) {
    if (typeof errorOrCode === 'number') {
      return errorOrCode;
    }
    
    if (errorOrCode && typeof errorOrCode === 'object') {
      return errorOrCode.code || 0;
    }
    
    return 0;
  }

  /**
   * Get error message
   * 
   * @private
   * @param {number|Error} errorOrCode - Error object or close code
   * @returns {string} Error message
   */
  getErrorMessage(errorOrCode) {
    if (typeof errorOrCode === 'number') {
      return this.getMessageForCode(errorOrCode);
    }
    
    if (errorOrCode && typeof errorOrCode === 'object') {
      return errorOrCode.message || this.getMessageForCode(errorOrCode.code);
    }
    
    return 'Unknown error';
  }

  /**
   * Get human-readable message for error code
   * 
   * @private
   * @param {number} code - Error code
   * @returns {string} Error message
   */
  getMessageForCode(code) {
    const messages = {
      [CLOSE_CODES.CONNECTION_SETUP_FAILED]: 'Connection setup failed',
      [CLOSE_CODES.AUTH_TIMEOUT]: 'Authentication timeout',
      [CLOSE_CODES.CONNECTION_INACTIVE]: 'Connection inactive',
      [CLOSE_CODES.SECURITY_VIOLATIONS]: 'Too many security violations',
      [CLOSE_CODES.ACCOUNT_LOCKED]: 'Account locked due to failed attempts',
      [CLOSE_CODES.AUTH_ATTEMPTS_EXCEEDED]: 'Authentication attempts exceeded',
      [CLOSE_CODES.IP_CONNECTION_LIMIT]: 'Too many connections from this IP',
      [CLOSE_CODES.SERVER_CONNECTION_LIMIT]: 'Server connection limit reached',
      [CLOSE_CODES.INVALID_CLIENT]: 'Invalid client'
    };
    
    return messages[code] || `Error code: ${code}`;
  }

  /**
   * Apply adaptive backoff based on error patterns
   * 
   * @private
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {number} Adjusted delay
   */
  applyAdaptiveBackoff(baseDelay) {
    // Increase delay for frequent errors
    const recentErrors = this.getRecentErrorCount(60000); // Last minute
    if (recentErrors > 5) {
      baseDelay *= 2;
    }
    
    // Increase delay for auth failures
    const authFailures = this.getErrorCountByType(ERROR_TYPES.AUTH_FAILURE, 300000); // Last 5 minutes
    if (authFailures > 2) {
      baseDelay *= 3;
    }
    
    // Decrease delay for good connection stability
    if (this.metrics.connectionStability > 80) {
      baseDelay *= 0.8;
    }
    
    return baseDelay;
  }

  /**
   * Check rate limit
   * 
   * @private
   * @returns {boolean} Whether within rate limit
   */
  checkRateLimit() {
    this.cleanupRateLimitErrors();
    return this.rateLimitErrors.length < this.config.maxRateLimitErrors;
  }

  /**
   * Clean up old rate limit errors
   * 
   * @private
   */
  cleanupRateLimitErrors() {
    const cutoff = Date.now() - this.config.rateLimitWindow;
    this.rateLimitErrors = this.rateLimitErrors.filter(time => time > cutoff);
  }

  /**
   * Handle permanent failure
   * 
   * @private
   * @param {string} reason - Failure reason
   */
  handlePermanentFailure(reason) {
    this.state.permanentFailure = true;
    this.state.cooldownUntil = Date.now() + this.config.permanentErrorCooldown;
    
    if (this.onPermanentFailure) {
      this.onPermanentFailure({
        reason,
        cooldownUntil: this.state.cooldownUntil,
        errorHistory: this.errorHistory.slice(-10) // Last 10 errors
      });
    }
  }

  /**
   * Get count of recent errors
   * 
   * @private
   * @param {number} windowMs - Time window in milliseconds
   * @returns {number} Error count
   */
  getRecentErrorCount(windowMs) {
    const cutoff = Date.now() - windowMs;
    return this.errorHistory.filter(error => error.timestamp > cutoff).length;
  }

  /**
   * Get error count by type
   * 
   * @private
   * @param {string} type - Error type
   * @param {number} windowMs - Time window in milliseconds
   * @returns {number} Error count
   */
  getErrorCountByType(type, windowMs) {
    const cutoff = Date.now() - windowMs;
    return this.errorHistory.filter(
      error => error.type === type && error.timestamp > cutoff
    ).length;
  }

  /**
   * Update average recovery time
   * 
   * @private
   * @param {number} recoveryTime - Recovery time in milliseconds
   */
  updateAverageRecoveryTime(recoveryTime) {
    const total = this.metrics.successfulRecoveries;
    const currentAvg = this.metrics.averageRecoveryTime;
    
    this.metrics.averageRecoveryTime = 
      (currentAvg * (total - 1) + recoveryTime) / total;
  }

  /**
   * Update connection stability metric
   * 
   * @private
   */
  updateConnectionStability() {
    const recentErrors = this.getRecentErrorCount(this.config.performanceWindow);
    const maxExpectedErrors = 10; // Threshold for 0% stability
    
    this.metrics.connectionStability = Math.max(
      0,
      100 - (recentErrors / maxExpectedErrors * 100)
    );
  }

  /**
   * Get recovery statistics
   * 
   * @returns {Object} Recovery statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      currentRetryCount: this.state.retryCount,
      isRecovering: this.state.isRecovering,
      permanentFailure: this.state.permanentFailure,
      lastError: this.state.lastError ? {
        type: this.classifyError(this.state.lastError),
        code: this.getErrorCode(this.state.lastError),
        message: this.getErrorMessage(this.state.lastError),
        time: this.state.lastErrorTime
      } : null,
      recentErrors: this.getRecentErrorCount(300000), // Last 5 minutes
      errorTrend: this.calculateErrorTrend()
    };
  }

  /**
   * Calculate error trend (increasing/decreasing/stable)
   * 
   * @private
   * @returns {string} Trend indicator
   */
  calculateErrorTrend() {
    const window = 300000; // 5 minutes
    const midpoint = Date.now() - (window / 2);
    
    const firstHalf = this.errorHistory.filter(
      e => e.timestamp < midpoint && e.timestamp > (Date.now() - window)
    ).length;
    
    const secondHalf = this.errorHistory.filter(
      e => e.timestamp >= midpoint
    ).length;
    
    if (secondHalf > firstHalf * 1.5) return 'increasing';
    if (secondHalf < firstHalf * 0.5) return 'decreasing';
    return 'stable';
  }

  /**
   * Export error history for analysis
   * 
   * @param {number} limit - Maximum number of entries
   * @returns {Array} Error history
   */
  exportErrorHistory(limit = 100) {
    return this.errorHistory.slice(-limit).map(error => ({
      ...error,
      formattedTime: new Date(error.timestamp).toISOString()
    }));
  }

  /**
   * Clear error history and reset metrics
   */
  clearHistory() {
    this.errorHistory = [];
    this.rateLimitErrors = [];
    this.metrics = {
      totalErrors: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      averageRecoveryTime: 0,
      errorsByType: {},
      connectionStability: 100
    };
  }
}

// Export error classification constants for external use
export { ERROR_TYPES, CLOSE_CODES };
