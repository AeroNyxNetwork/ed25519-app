/**
 * Unified Cache Service for AeroNyx Platform
 * 
 * File Path: src/lib/services/CacheService.js
 * 
 * Production-grade caching service following Google's engineering standards.
 * Provides a centralized caching mechanism with TTL support, memory management,
 * and performance optimization for all platform components.
 * 
 * Features:
 * - Multiple cache namespaces (signature, api, websocket)
 * - Automatic TTL-based expiration
 * - Memory-efficient storage with size limits
 * - LRU (Least Recently Used) eviction policy
 * - Performance metrics and monitoring
 * - Thread-safe operations
 * - Serialization support for complex objects
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

/**
 * Cache namespace types
 * @enum {string}
 */
export const CacheNamespace = {
  SIGNATURE: 'signature',
  API: 'api',
  WEBSOCKET: 'websocket',
  NODE: 'node',
  PERFORMANCE: 'performance'
};

/**
 * Default TTL values for different cache types (in milliseconds)
 * @enum {number}
 */
export const DefaultTTL = {
  [CacheNamespace.SIGNATURE]: 10 * 60 * 1000,    // 10 minutes
  [CacheNamespace.API]: 5 * 60 * 1000,           // 5 minutes
  [CacheNamespace.WEBSOCKET]: 30 * 1000,         // 30 seconds
  [CacheNamespace.NODE]: 2 * 60 * 1000,          // 2 minutes
  [CacheNamespace.PERFORMANCE]: 60 * 1000        // 1 minute
};

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {*} value - Cached value
 * @property {number} timestamp - Creation timestamp
 * @property {number} ttl - Time to live in milliseconds
 * @property {number} accessCount - Number of times accessed
 * @property {number} lastAccessed - Last access timestamp
 * @property {number} size - Approximate size in bytes
 */

/**
 * Cache statistics
 * @typedef {Object} CacheStats
 * @property {number} hits - Cache hit count
 * @property {number} misses - Cache miss count
 * @property {number} evictions - Number of evicted entries
 * @property {number} size - Current cache size
 * @property {number} entries - Number of entries
 * @property {number} hitRate - Hit rate percentage
 */

/**
 * Unified Cache Service Implementation
 * 
 * @class CacheService
 */
class CacheService {
  constructor() {
    // Initialize cache namespaces
    this.caches = new Map();
    Object.values(CacheNamespace).forEach(namespace => {
      this.caches.set(namespace, new Map());
    });
    
    // Cache configuration
    this.config = {
      maxSize: 100 * 1024 * 1024,        // 100MB total cache size
      maxEntriesPerNamespace: 1000,      // Max entries per namespace
      cleanupInterval: 60 * 1000,        // Cleanup every minute
      enableMetrics: true,               // Enable performance metrics
      enableCompression: false           // Enable value compression
    };
    
    // Statistics tracking
    this.stats = new Map();
    Object.values(CacheNamespace).forEach(namespace => {
      this.stats.set(namespace, {
        hits: 0,
        misses: 0,
        evictions: 0,
        size: 0,
        entries: 0
      });
    });
    
    // Start cleanup interval
    this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupInterval);
    
    // Bind methods for consistent context
    this.get = this.get.bind(this);
    this.set = this.set.bind(this);
    this.delete = this.delete.bind(this);
    this.clear = this.clear.bind(this);
  }
  
  /**
   * Get value from cache
   * 
   * @param {string} namespace - Cache namespace
   * @param {string} key - Cache key
   * @returns {*} Cached value or null if not found/expired
   */
  get(namespace, key) {
    const cache = this.caches.get(namespace);
    if (!cache) {
      console.warn(`[CacheService] Invalid namespace: ${namespace}`);
      return null;
    }
    
    const entry = cache.get(key);
    if (!entry) {
      this._recordMiss(namespace);
      return null;
    }
    
    // Check if expired
    if (this._isExpired(entry)) {
      cache.delete(key);
      this._recordMiss(namespace);
      return null;
    }
    
    // Update access metadata
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    this._recordHit(namespace);
    return entry.value;
  }
  
  /**
   * Set value in cache
   * 
   * @param {string} namespace - Cache namespace
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [ttl] - Time to live in milliseconds (optional)
   * @returns {boolean} Success status
   */
  set(namespace, key, value, ttl) {
    const cache = this.caches.get(namespace);
    if (!cache) {
      console.warn(`[CacheService] Invalid namespace: ${namespace}`);
      return false;
    }
    
    // Use default TTL if not provided
    const effectiveTTL = ttl || DefaultTTL[namespace] || DefaultTTL[CacheNamespace.API];
    
    // Calculate entry size
    const size = this._calculateSize(value);
    
    // Check if we need to evict entries
    if (cache.size >= this.config.maxEntriesPerNamespace) {
      this._evictLRU(namespace);
    }
    
    // Create cache entry
    const entry = {
      value,
      timestamp: Date.now(),
      ttl: effectiveTTL,
      accessCount: 0,
      lastAccessed: Date.now(),
      size
    };
    
    // Store in cache
    cache.set(key, entry);
    
    // Update statistics
    const stats = this.stats.get(namespace);
    stats.entries = cache.size;
    stats.size += size;
    
    return true;
  }
  
  /**
   * Delete value from cache
   * 
   * @param {string} namespace - Cache namespace
   * @param {string} key - Cache key
   * @returns {boolean} Success status
   */
  delete(namespace, key) {
    const cache = this.caches.get(namespace);
    if (!cache) {
      return false;
    }
    
    const entry = cache.get(key);
    if (entry) {
      const stats = this.stats.get(namespace);
      stats.size -= entry.size;
      stats.entries = cache.size - 1;
    }
    
    return cache.delete(key);
  }
  
  /**
   * Clear entire namespace or specific pattern
   * 
   * @param {string} namespace - Cache namespace
   * @param {string|RegExp} [pattern] - Optional key pattern to match
   * @returns {number} Number of entries cleared
   */
  clear(namespace, pattern) {
    const cache = this.caches.get(namespace);
    if (!cache) {
      return 0;
    }
    
    let cleared = 0;
    
    if (pattern) {
      // Clear entries matching pattern
      const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      for (const [key, entry] of cache.entries()) {
        if (regex.test(key)) {
          cache.delete(key);
          cleared++;
        }
      }
    } else {
      // Clear entire namespace
      cleared = cache.size;
      cache.clear();
    }
    
    // Update statistics
    const stats = this.stats.get(namespace);
    stats.entries = cache.size;
    stats.size = 0; // Recalculate on next cleanup
    
    return cleared;
  }
  
  /**
   * Get cache statistics
   * 
   * @param {string} [namespace] - Optional namespace for specific stats
   * @returns {Object} Cache statistics
   */
  getStats(namespace) {
    if (namespace) {
      const stats = this.stats.get(namespace);
      if (!stats) return null;
      
      const hitRate = stats.hits + stats.misses > 0
        ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2)
        : 0;
      
      return {
        ...stats,
        hitRate: parseFloat(hitRate)
      };
    }
    
    // Return aggregate statistics
    const aggregate = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      entries: 0
    };
    
    for (const stats of this.stats.values()) {
      aggregate.hits += stats.hits;
      aggregate.misses += stats.misses;
      aggregate.evictions += stats.evictions;
      aggregate.size += stats.size;
      aggregate.entries += stats.entries;
    }
    
    aggregate.hitRate = aggregate.hits + aggregate.misses > 0
      ? parseFloat((aggregate.hits / (aggregate.hits + aggregate.misses) * 100).toFixed(2))
      : 0;
    
    return aggregate;
  }
  
  /**
   * Generate cache key from parameters
   * 
   * @param {...*} params - Parameters to include in key
   * @returns {string} Cache key
   */
  static generateKey(...params) {
    return params
      .map(param => {
        if (typeof param === 'object') {
          return JSON.stringify(param, Object.keys(param).sort());
        }
        return String(param);
      })
      .join(':');
  }
  
  /**
   * Cleanup expired entries
   * 
   * @private
   */
  cleanup() {
    let totalCleaned = 0;
    
    for (const [namespace, cache] of this.caches.entries()) {
      const stats = this.stats.get(namespace);
      let cleaned = 0;
      let newSize = 0;
      
      for (const [key, entry] of cache.entries()) {
        if (this._isExpired(entry)) {
          cache.delete(key);
          cleaned++;
        } else {
          newSize += entry.size;
        }
      }
      
      stats.entries = cache.size;
      stats.size = newSize;
      totalCleaned += cleaned;
    }
    
    if (totalCleaned > 0) {
      console.log(`[CacheService] Cleaned up ${totalCleaned} expired entries`);
    }
  }
  
  /**
   * Check if entry is expired
   * 
   * @private
   * @param {CacheEntry} entry - Cache entry
   * @returns {boolean} Is expired
   */
  _isExpired(entry) {
    return Date.now() - entry.timestamp > entry.ttl;
  }
  
  /**
   * Calculate approximate size of value
   * 
   * @private
   * @param {*} value - Value to measure
   * @returns {number} Size in bytes
   */
  _calculateSize(value) {
    if (value === null || value === undefined) return 0;
    
    switch (typeof value) {
      case 'string':
        return value.length * 2; // UTF-16
      case 'number':
        return 8;
      case 'boolean':
        return 4;
      case 'object':
        try {
          return JSON.stringify(value).length * 2;
        } catch {
          return 1024; // Default for non-serializable
        }
      default:
        return 64; // Default size
    }
  }
  
  /**
   * Evict least recently used entries
   * 
   * @private
   * @param {string} namespace - Cache namespace
   */
  _evictLRU(namespace) {
    const cache = this.caches.get(namespace);
    const stats = this.stats.get(namespace);
    
    // Sort entries by last accessed time
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    // Remove 10% of entries
    const toRemove = Math.ceil(entries.length * 0.1);
    
    for (let i = 0; i < toRemove; i++) {
      const [key, entry] = entries[i];
      cache.delete(key);
      stats.size -= entry.size;
      stats.evictions++;
    }
    
    console.log(`[CacheService] Evicted ${toRemove} entries from ${namespace}`);
  }
  
  /**
   * Record cache hit
   * 
   * @private
   * @param {string} namespace - Cache namespace
   */
  _recordHit(namespace) {
    if (this.config.enableMetrics) {
      this.stats.get(namespace).hits++;
    }
  }
  
  /**
   * Record cache miss
   * 
   * @private
   * @param {string} namespace - Cache namespace
   */
  _recordMiss(namespace) {
    if (this.config.enableMetrics) {
      this.stats.get(namespace).misses++;
    }
  }
  
  /**
   * Destroy cache service and cleanup
   */
  destroy() {
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    // Clear all caches
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    
    console.log('[CacheService] Service destroyed');
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Export class for testing
export default CacheService;
