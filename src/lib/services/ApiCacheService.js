/**
 * API Cache Service for AeroNyx Platform
 * 
 * Manages API response caching with intelligent invalidation
 * 
 * @version 1.0.0
 */

class ApiCacheService {
  constructor() {
    this.cache = new Map();
    this.cacheConfig = {
      nodesOverview: 5 * 60 * 1000,      // 5 minutes
      nodeDetails: 2 * 60 * 1000,        // 2 minutes
      performanceHistory: 30 * 1000,      // 30 seconds
      nodeTypes: 60 * 60 * 1000,         // 1 hour
      nodeResources: 60 * 60 * 1000      // 1 hour
    };
  }

  /**
   * Generate cache key
   */
  getCacheKey(endpoint, params = {}) {
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${endpoint}|${paramString}`;
  }

  /**
   * Get cached data
   */
  getCachedData(endpoint, params = {}) {
    const key = this.getCacheKey(endpoint, params);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    const ttl = this.cacheConfig[endpoint] || 5 * 60 * 1000;
    const isExpired = Date.now() - cached.timestamp > ttl;
    
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Set cached data
   */
  setCachedData(endpoint, params, data) {
    const key = this.getCacheKey(endpoint, params);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      endpoint,
      params
    });
  }

  /**
   * Clear cache by pattern
   */
  clearCacheByPattern(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const stats = {
      totalEntries: this.cache.size,
      entries: []
    };
    
    for (const [key, value] of this.cache.entries()) {
      stats.entries.push({
        key,
        endpoint: value.endpoint,
        age: Date.now() - value.timestamp,
        expired: Date.now() - value.timestamp > (this.cacheConfig[value.endpoint] || 5 * 60 * 1000)
      });
    }
    
    return stats;
  }
}

export const apiCacheService = new ApiCacheService();
