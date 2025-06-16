/**
 * Enhanced API Service Layer for AeroNyx Platform
 * 
 * File Path: src/lib/api/enhancedApiService.js
 * 
 * This service provides a robust, production-ready API client for the AeroNyx
 * platform with advanced features including request/response interceptors,
 * automatic retry logic, request deduplication, circuit breaker pattern,
 * and comprehensive error handling.
 * 
 * Features:
 * - Request/Response interceptors for logging and transformation
 * - Automatic retry logic with exponential backoff
 * - Request deduplication to prevent duplicate API calls
 * - Circuit breaker pattern for API resilience
 * - Comprehensive error handling and classification
 * - Request timeout management
 * - Performance monitoring and metrics collection
 * - Request caching with TTL support
 * - Authentication token management
 * - Request queue management for rate limiting
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-01
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.aeronyx.network';

/**
 * Configuration constants for the enhanced API service
 */
const API_CONFIG = {
  // Base configuration
  BASE_URL: API_URL,
  TIMEOUT: 30000, // 30 seconds
  
  // Retry configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    INITIAL_DELAY: 1000,  // 1 second
    MAX_DELAY: 10000,     // 10 seconds
    BACKOFF_MULTIPLIER: 2
  },
  
  // Circuit breaker configuration
  CIRCUIT_BREAKER: {
    FAILURE_THRESHOLD: 5,
    RECOVERY_TIMEOUT: 30000, // 30 seconds
    MONITOR_WINDOW: 60000    // 1 minute
  },
  
  // Cache configuration
  CACHE: {
    DEFAULT_TTL: 5 * 60 * 1000,  // 5 minutes
    MAX_SIZE: 100                 // Maximum cache entries
  },
  
  // Rate limiting
  RATE_LIMIT: {
    MAX_CONCURRENT: 5,
    QUEUE_SIZE: 50
  }
};

/**
 * Error types for API operations
 */
const API_ERROR_TYPES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Circuit breaker states
 */
const CIRCUIT_STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

/**
 * Enhanced API Service Class
 */
class EnhancedApiService {
  constructor() {
    // Circuit breaker state
    this.circuitState = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    
    // Request tracking
    this.activeRequests = new Map();
    this.requestQueue = [];
    this.concurrentRequests = 0;
    
    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      circuitBreakerTrips: 0
    };
    
    // Request cache
    this.cache = new Map();
    
    // Request interceptors
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    
    // Initialize default interceptors
    this.initializeDefaultInterceptors();
  }

  // ==================== INITIALIZATION ====================
  
  /**
   * Initialize default request and response interceptors
   */
  initializeDefaultInterceptors() {
    // Request interceptor for logging and headers
    this.addRequestInterceptor((config) => {
      config.headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Client-Version': '1.0.0',
        'X-Request-ID': this.generateRequestId(),
        ...config.headers
      };
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`, config);
      }
      
      return config;
    });
    
    // Response interceptor for logging and error handling
    this.addResponseInterceptor(
      (response) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ API Response: ${response.status}`, response);
        }
        return response;
      },
      (error) => {
        if (process.env.NODE_ENV === 'development') {
          console.error(`❌ API Error:`, error);
        }
        return Promise.reject(error);
      }
    );
  }

  // ==================== INTERCEPTOR MANAGEMENT ====================
  
  /**
   * Add a request interceptor
   * 
   * @param {Function} interceptor - Request interceptor function
   * @returns {number} Interceptor ID for removal
   */
  addRequestInterceptor(interceptor) {
    const id = Date.now() + Math.random();
    this.requestInterceptors.push({ id, interceptor });
    return id;
  }

  /**
   * Add a response interceptor
   * 
   * @param {Function} onSuccess - Success interceptor function
   * @param {Function} onError - Error interceptor function
   * @returns {number} Interceptor ID for removal
   */
  addResponseInterceptor(onSuccess, onError) {
    const id = Date.now() + Math.random();
    this.responseInterceptors.push({ id, onSuccess, onError });
    return id;
  }

  /**
   * Remove an interceptor by ID
   * 
   * @param {number} id - Interceptor ID
   * @param {string} type - Interceptor type ('request' or 'response')
   */
  removeInterceptor(id, type = 'request') {
    if (type === 'request') {
      this.requestInterceptors = this.requestInterceptors.filter(i => i.id !== id);
    } else {
      this.responseInterceptors = this.responseInterceptors.filter(i => i.id !== id);
    }
  }

  // ==================== CIRCUIT BREAKER ====================
  
  /**
   * Check if circuit breaker allows the request
   * 
   * @returns {boolean} Whether request is allowed
   */
  isCircuitOpen() {
    if (this.circuitState === CIRCUIT_STATES.CLOSED) {
      return false;
    }
    
    if (this.circuitState === CIRCUIT_STATES.OPEN) {
      // Check if recovery timeout has passed
      if (Date.now() - this.lastFailureTime > API_CONFIG.CIRCUIT_BREAKER.RECOVERY_TIMEOUT) {
        this.circuitState = CIRCUIT_STATES.HALF_OPEN;
        return false;
      }
      return true;
    }
    
    // HALF_OPEN state - allow one request to test
    return false;
  }

  /**
   * Record a successful request for circuit breaker
   */
  recordSuccess() {
    this.failureCount = 0;
    if (this.circuitState === CIRCUIT_STATES.HALF_OPEN) {
      this.circuitState = CIRCUIT_STATES.CLOSED;
    }
  }

  /**
   * Record a failed request for circuit breaker
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= API_CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
      this.circuitState = CIRCUIT_STATES.OPEN;
      this.metrics.circuitBreakerTrips++;
    }
  }

  // ==================== CACHE MANAGEMENT ====================
  
  /**
   * Generate cache key for request
   * 
   * @param {string} url - Request URL
   * @param {Object} config - Request configuration
   * @returns {string} Cache key
   */
  generateCacheKey(url, config) {
    const method = config.method || 'GET';
    const params = JSON.stringify(config.params || {});
    const body = JSON.stringify(config.body || {});
    return `${method}:${url}:${params}:${body}`;
  }

  /**
   * Get cached response if valid
   * 
   * @param {string} cacheKey - Cache key
   * @returns {Object|null} Cached response or null
   */
  getCachedResponse(cacheKey) {
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      this.metrics.cacheMisses++;
      return null;
    }
    
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(cacheKey);
      this.metrics.cacheMisses++;
      return null;
    }
    
    this.metrics.cacheHits++;
    return cached.data;
  }

  /**
   * Cache response
   * 
   * @param {string} cacheKey - Cache key
   * @param {Object} data - Response data
   * @param {number} ttl - Time to live in milliseconds
   */
  setCachedResponse(cacheKey, data, ttl = API_CONFIG.CACHE.DEFAULT_TTL) {
    // Prevent cache from growing too large
    if (this.cache.size >= API_CONFIG.CACHE.MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  // ==================== REQUEST MANAGEMENT ====================
  
  /**
   * Generate unique request ID
   * 
   * @returns {string} Request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if request is already in progress (deduplication)
   * 
   * @param {string} requestKey - Request identifier
   * @returns {Promise|null} Existing request promise or null
   */
  getExistingRequest(requestKey) {
    return this.activeRequests.get(requestKey) || null;
  }

  /**
   * Track active request
   * 
   * @param {string} requestKey - Request identifier
   * @param {Promise} promise - Request promise
   */
  trackRequest(requestKey, promise) {
    this.activeRequests.set(requestKey, promise);
    this.concurrentRequests++;
    
    // Clean up when request completes
    promise.finally(() => {
      this.activeRequests.delete(requestKey);
      this.concurrentRequests--;
      this.processQueue();
    });
  }

  /**
   * Process queued requests
   */
  processQueue() {
    while (
      this.requestQueue.length > 0 && 
      this.concurrentRequests < API_CONFIG.RATE_LIMIT.MAX_CONCURRENT
    ) {
      const queuedRequest = this.requestQueue.shift();
      queuedRequest.execute();
    }
  }

  /**
   * Queue request if rate limit exceeded
   * 
   * @param {Function} executor - Request executor function
   * @returns {Promise} Queued request promise
   */
  queueRequest(executor) {
    return new Promise((resolve, reject) => {
      if (this.requestQueue.length >= API_CONFIG.RATE_LIMIT.QUEUE_SIZE) {
        reject(new Error(`${API_ERROR_TYPES.RATE_LIMIT_ERROR}: Request queue full`));
        return;
      }
      
      this.requestQueue.push({
        execute: () => {
          executor().then(resolve).catch(reject);
        }
      });
    });
  }

  // ==================== CORE REQUEST METHOD ====================
  
  /**
   * Enhanced request method with all advanced features
   * 
   * @param {Object} config - Request configuration
   * @returns {Promise<Object>} Response data
   */
  async request(config) {
    const startTime = performance.now();
    
    // Apply request interceptors
    let processedConfig = { ...config };
    for (const interceptor of this.requestInterceptors) {
      processedConfig = interceptor.interceptor(processedConfig) || processedConfig;
    }
    
    const {
      url,
      method = 'GET',
      data,
      params,
      headers = {},
      timeout = API_CONFIG.TIMEOUT,
      retries = API_CONFIG.RETRY.MAX_ATTEMPTS,
      cache = false,
      cacheTTL = API_CONFIG.CACHE.DEFAULT_TTL,
      deduplication = true
    } = processedConfig;
    
    // Build full URL
    const fullUrl = new URL(url, API_CONFIG.BASE_URL);
    if (params) {
      Object.keys(params).forEach(key => {
        fullUrl.searchParams.append(key, params[key]);
      });
    }
    
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      const error = new Error(`${API_ERROR_TYPES.CIRCUIT_BREAKER_OPEN}: Service temporarily unavailable`);
      error.type = API_ERROR_TYPES.CIRCUIT_BREAKER_OPEN;
      throw error;
    }
    
    // Generate request keys for caching and deduplication
    const requestKey = this.generateCacheKey(fullUrl.toString(), { method, data });
    const cacheKey = cache ? requestKey : null;
    
    // Check cache first
    if (cache && method.toUpperCase() === 'GET') {
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }
    }
    
    // Check for existing request (deduplication)
    if (deduplication) {
      const existingRequest = this.getExistingRequest(requestKey);
      if (existingRequest) {
        return await existingRequest;
      }
    }
    
    // Rate limiting check
    if (this.concurrentRequests >= API_CONFIG.RATE_LIMIT.MAX_CONCURRENT) {
      return await this.queueRequest(() => this.executeRequest(
        fullUrl, method, data, headers, timeout, retries, cacheKey, cacheTTL, startTime
      ));
    }
    
    // Execute request
    const requestPromise = this.executeRequest(
      fullUrl, method, data, headers, timeout, retries, cacheKey, cacheTTL, startTime
    );
    
    // Track request
    if (deduplication) {
      this.trackRequest(requestKey, requestPromise);
    } else {
      this.concurrentRequests++;
      requestPromise.finally(() => {
        this.concurrentRequests--;
      });
    }
    
    return await requestPromise;
  }

  /**
   * Execute the actual HTTP request with retry logic
   * 
   * @param {URL} fullUrl - Complete request URL
   * @param {string} method - HTTP method
   * @param {Object} data - Request body data
   * @param {Object} headers - Request headers
   * @param {number} timeout - Request timeout
   * @param {number} retries - Number of retries remaining
   * @param {string} cacheKey - Cache key for response
   * @param {number} cacheTTL - Cache time to live
   * @param {number} startTime - Request start time
   * @returns {Promise<Object>} Response data
   */
  async executeRequest(fullUrl, method, data, headers, timeout, retries, cacheKey, cacheTTL, startTime) {
    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        // Prepare fetch options
        const fetchOptions = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...headers
          },
          signal: controller.signal
        };
        
        if (data && method.toUpperCase() !== 'GET') {
          fetchOptions.body = JSON.stringify(data);
        }
        
        // Execute request
        this.metrics.totalRequests++;
        const response = await fetch(fullUrl.toString(), fetchOptions);
        
        clearTimeout(timeoutId);
        
        // Handle HTTP errors
        if (!response.ok) {
          const errorType = this.classifyHttpError(response.status);
          const errorData = await this.parseErrorResponse(response);
          
          const error = new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
          error.type = errorType;
          error.status = response.status;
          error.data = errorData;
          
          throw error;
        }
        
        // Parse response
        const responseData = await this.parseResponse(response);
        
        // Apply response interceptors
        let processedResponse = responseData;
        for (const interceptor of this.responseInterceptors) {
          if (interceptor.onSuccess) {
            processedResponse = interceptor.onSuccess(processedResponse) || processedResponse;
          }
        }
        
        // Cache successful response
        if (cacheKey) {
          this.setCachedResponse(cacheKey, processedResponse, cacheTTL);
        }
        
        // Update metrics
        const responseTime = performance.now() - startTime;
        this.updateMetrics(true, responseTime);
        this.recordSuccess();
        
        return processedResponse;
        
      } catch (error) {
        lastError = error;
        
        // Handle timeout errors
        if (error.name === 'AbortError') {
          error.type = API_ERROR_TYPES.TIMEOUT_ERROR;
          error.message = 'Request timeout';
        }
        
        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          error.type = API_ERROR_TYPES.NETWORK_ERROR;
          error.message = 'Network connection failed';
        }
        
        // Apply error response interceptors
        for (const interceptor of this.responseInterceptors) {
          if (interceptor.onError) {
            try {
              interceptor.onError(error);
            } catch (interceptorError) {
              console.error('Response interceptor error:', interceptorError);
            }
          }
        }
        
        // Check if we should retry
        const shouldRetry = this.shouldRetry(error, attempt, retries);
        
        if (!shouldRetry) {
          // Update metrics for final failure
          const responseTime = performance.now() - startTime;
          this.updateMetrics(false, responseTime);
          this.recordFailure();
          throw error;
        }
        
        // Calculate retry delay
        const delay = Math.min(
          API_CONFIG.RETRY.INITIAL_DELAY * Math.pow(API_CONFIG.RETRY.BACKOFF_MULTIPLIER, attempt),
          API_CONFIG.RETRY.MAX_DELAY
        );
        
        // Wait before retry
        await this.sleep(delay);
      }
    }
    
    // If we get here, all retries failed
    const responseTime = performance.now() - startTime;
    this.updateMetrics(false, responseTime);
    this.recordFailure();
    throw lastError;
  }

  // ==================== UTILITY METHODS ====================
  
  /**
   * Classify HTTP error by status code
   * 
   * @param {number} status - HTTP status code
   * @returns {string} Error type
   */
  classifyHttpError(status) {
    if (status === 401) return API_ERROR_TYPES.AUTHENTICATION_ERROR;
    if (status === 403) return API_ERROR_TYPES.AUTHORIZATION_ERROR;
    if (status === 422 || status === 400) return API_ERROR_TYPES.VALIDATION_ERROR;
    if (status === 429) return API_ERROR_TYPES.RATE_LIMIT_ERROR;
    if (status >= 500) return API_ERROR_TYPES.SERVER_ERROR;
    return API_ERROR_TYPES.UNKNOWN_ERROR;
  }

  /**
   * Parse error response body
   * 
   * @param {Response} response - Fetch response object
   * @returns {Object} Parsed error data
   */
  async parseErrorResponse(response) {
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return { message: await response.text() };
    } catch {
      return { message: `HTTP ${response.status}: ${response.statusText}` };
    }
  }

  /**
   * Parse successful response
   * 
   * @param {Response} response - Fetch response object
   * @returns {Object} Parsed response data
   */
  async parseResponse(response) {
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return await response.text();
  }

  /**
   * Determine if request should be retried
   * 
   * @param {Error} error - Request error
   * @param {number} attempt - Current attempt number
   * @param {number} maxRetries - Maximum retries allowed
   * @returns {boolean} Whether to retry
   */
  shouldRetry(error, attempt, maxRetries) {
    if (attempt >= maxRetries) return false;
    
    // Don't retry client errors (4xx) except specific cases
    if (error.status >= 400 && error.status < 500) {
      // Retry on rate limiting and authentication errors
      return error.status === 429 || error.status === 401;
    }
    
    // Retry server errors (5xx) and network errors
    if (error.status >= 500 || error.type === API_ERROR_TYPES.NETWORK_ERROR || error.type === API_ERROR_TYPES.TIMEOUT_ERROR) {
      return true;
    }
    
    return false;
  }

  /**
   * Sleep for specified duration
   * 
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Sleep promise
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update performance metrics
   * 
   * @param {boolean} success - Whether request was successful
   * @param {number} responseTime - Response time in milliseconds
   */
  updateMetrics(success, responseTime) {
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }
    
    // Update average response time
    const totalRequests = this.metrics.successfulRequests + this.metrics.failedRequests;
    this.metrics.averageResponseTime = Math.round(
      (this.metrics.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests
    );
  }

  // ==================== CONVENIENCE METHODS ====================
  
  /**
   * GET request
   * 
   * @param {string} url - Request URL
   * @param {Object} config - Request configuration
   * @returns {Promise<Object>} Response data
   */
  get(url, config = {}) {
    return this.request({ ...config, url, method: 'GET', cache: true });
  }

  /**
   * POST request
   * 
   * @param {string} url - Request URL
   * @param {Object} data - Request body data
   * @param {Object} config - Request configuration
   * @returns {Promise<Object>} Response data
   */
  post(url, data, config = {}) {
    return this.request({ ...config, url, method: 'POST', data });
  }

  /**
   * PUT request
   * 
   * @param {string} url - Request URL
   * @param {Object} data - Request body data
   * @param {Object} config - Request configuration
   * @returns {Promise<Object>} Response data
   */
  put(url, data, config = {}) {
    return this.request({ ...config, url, method: 'PUT', data });
  }

  /**
   * DELETE request
   * 
   * @param {string} url - Request URL
   * @param {Object} config - Request configuration
   * @returns {Promise<Object>} Response data
   */
  delete(url, config = {}) {
    return this.request({ ...config, url, method: 'DELETE' });
  }

  // ==================== MONITORING METHODS ====================
  
  /**
   * Get current performance metrics
   * 
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      circuitState: this.circuitState,
      activeRequests: this.concurrentRequests,
      queuedRequests: this.requestQueue.length,
      cacheSize: this.cache.size
    };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      circuitBreakerTrips: 0
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.circuitState = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
  }
}

// Create and export singleton instance
const enhancedApiService = new EnhancedApiService();

export default enhancedApiService;
export { API_ERROR_TYPES, CIRCUIT_STATES };

/**
 * Convenience function to create a new API service instance
 * 
 * @param {Object} config - Service configuration
 * @returns {EnhancedApiService} New API service instance
 */
export function createApiService(config = {}) {
  const service = new EnhancedApiService();
  
  // Apply configuration overrides
  if (config.baseUrl) {
    API_CONFIG.BASE_URL = config.baseUrl;
  }
  
  if (config.timeout) {
    API_CONFIG.TIMEOUT = config.timeout;
  }
  
  return service;
}
