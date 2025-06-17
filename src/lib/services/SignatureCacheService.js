/**
 * Signature Cache Service for AeroNyx Platform
 * 
 * Manages wallet signature caching to prevent repeated authorization requests
 * 
 * @version 1.0.0
 */

class SignatureCacheService {
  constructor() {
    this.cache = new Map();
    this.CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
    this.pendingRequests = new Map();
  }

  /**
   * Generate cache key
   */
  getCacheKey(walletAddress, action = 'default') {
    return `${walletAddress}:${action}`;
  }

  /**
   * Get cached signature
   */
  getCachedSignature(walletAddress, action = 'default') {
    const key = this.getCacheKey(walletAddress, action);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > this.CACHE_DURATION;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    return cached;
  }

  /**
   * Set cached signature
   */
  setCachedSignature(walletAddress, signature, message, action = 'default') {
    const key = this.getCacheKey(walletAddress, action);
    this.cache.set(key, {
      signature,
      message,
      timestamp: Date.now(),
      walletAddress
    });
  }

  /**
   * Get or generate signature (prevents concurrent requests)
   */
  async getOrGenerateSignature(walletAddress, generator, action = 'default') {
    const key = this.getCacheKey(walletAddress, action);
    
    // Check cache first
    const cached = this.getCachedSignature(walletAddress, action);
    if (cached) {
      return cached;
    }
    
    // Check if request is already pending
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }
    
    // Create new request
    const promise = generator().then(result => {
      this.setCachedSignature(walletAddress, result.signature, result.message, action);
      this.pendingRequests.delete(key);
      return result;
    }).catch(error => {
      this.pendingRequests.delete(key);
      throw error;
    });
    
    this.pendingRequests.set(key, promise);
    return promise;
  }

  /**
   * Clear cache for wallet
   */
  clearWalletCache(walletAddress) {
    for (const [key, value] of this.cache.entries()) {
      if (value.walletAddress === walletAddress) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.cache.clear();
    this.pendingRequests.clear();
  }
}

export const signatureCacheService = new SignatureCacheService();
