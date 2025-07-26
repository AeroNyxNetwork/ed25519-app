/**
 * Enhanced Signature Cache Manager
 * Integrates with existing signature utilities
 * 
 * File Path: src/lib/utils/signatureCache.js
 */

import { 
  isValidSignatureFormat,
  storeSignatureInfo,
  getStoredSignatureInfo,
  clearStoredSignatureInfo
} from './walletSignature';

const SIGNATURE_CACHE_KEY = 'aeronyx_signature_cache';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

class SignatureCacheManager {
  constructor() {
    this.memoryCache = new Map();
    this.listeners = new Map(); // For real-time updates
  }

  /**
   * Get cached signature with purpose-based isolation
   */
  getCachedSignature(walletAddress, purpose = 'default') {
    if (!walletAddress) return null;
    
    const cacheKey = `${walletAddress.toLowerCase()}_${purpose}`;
    
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && this.isValid(memoryEntry)) {
      console.log('[SignatureCache] Found valid signature in memory cache for', purpose);
      return memoryEntry;
    }

    // Check localStorage via existing utilities
    const storedInfo = getStoredSignatureInfo();
    if (storedInfo && 
        storedInfo.walletAddress === walletAddress.toLowerCase() &&
        storedInfo.purpose === purpose &&
        this.isValid({ expiresAt: storedInfo.timestamp + CACHE_DURATION })) {
      
      const entry = {
        ...storedInfo,
        expiresAt: storedInfo.timestamp + CACHE_DURATION
      };
      
      // Update memory cache
      this.memoryCache.set(cacheKey, entry);
      console.log('[SignatureCache] Found valid signature in localStorage for', purpose);
      return entry;
    }

    // Also check the new cache storage
    try {
      const stored = localStorage.getItem(SIGNATURE_CACHE_KEY);
      if (stored) {
        const cache = JSON.parse(stored);
        const entry = cache[cacheKey];
        
        if (entry && this.isValid(entry)) {
          console.log('[SignatureCache] Found valid signature in cache storage for', purpose);
          // Update memory cache
          this.memoryCache.set(cacheKey, entry);
          return entry;
        }
      }
    } catch (err) {
      console.error('[SignatureCache] Error reading cache:', err);
    }

    return null;
  }

  /**
   * Store signature with automatic expiry
   */
  cacheSignature(walletAddress, signature, message, purpose = 'default', walletType = 'okx') {
    if (!walletAddress || !signature || !message) {
      console.warn('[SignatureCache] Invalid parameters for caching');
      return null;
    }

    const cacheKey = `${walletAddress.toLowerCase()}_${purpose}`;
    const now = Date.now();
    
    const entry = {
      signature,
      message,
      walletAddress: walletAddress.toLowerCase(),
      walletType,
      purpose,
      timestamp: now,
      expiresAt: now + CACHE_DURATION
    };

    // Update memory cache
    this.memoryCache.set(cacheKey, entry);

    // Store using existing utility
    storeSignatureInfo(entry);

    // Also store in our cache storage
    try {
      const stored = localStorage.getItem(SIGNATURE_CACHE_KEY) || '{}';
      const cache = JSON.parse(stored);
      cache[cacheKey] = entry;
      
      // Clean expired entries
      this.cleanExpiredEntries(cache);
      
      localStorage.setItem(SIGNATURE_CACHE_KEY, JSON.stringify(cache));
      console.log('[SignatureCache] Signature cached successfully for', purpose);
      
      // Notify listeners
      this.notifyListeners(walletAddress, purpose);
    } catch (err) {
      console.error('[SignatureCache] Error caching signature:', err);
    }

    return entry;
  }

  /**
   * Check if cache entry is still valid
   */
  isValid(entry) {
    if (!entry) return false;
    
    // Check expiry
    if (entry.expiresAt && Date.now() >= entry.expiresAt) {
      return false;
    }
    
    // Check if it has required fields
    if (!entry.signature || !entry.message) {
      return false;
    }
    
    // Validate signature format if wallet type is provided
    if (entry.walletType && entry.signature) {
      return isValidSignatureFormat(entry.signature, entry.walletType);
    }
    
    return true;
  }

  /**
   * Get remaining time in milliseconds
   */
  getTimeUntilExpiration(walletAddress, purpose = 'default') {
    const entry = this.getCachedSignature(walletAddress, purpose);
    if (!entry || !entry.expiresAt) return 0;
    
    const remaining = entry.expiresAt - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Format remaining time for display
   */
  formatRemainingTime(walletAddress, purpose = 'default') {
    const ms = this.getTimeUntilExpiration(walletAddress, purpose);
    if (ms <= 0) return 'Expired';
    
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Clean expired entries from cache object
   */
  cleanExpiredEntries(cache) {
    const now = Date.now();
    Object.keys(cache).forEach(key => {
      const entry = cache[key];
      if (!entry || (entry.expiresAt && entry.expiresAt < now)) {
        delete cache[key];
      }
    });
  }

  /**
   * Clear cache for specific purpose
   */
  clearCacheForPurpose(walletAddress, purpose) {
    const cacheKey = `${walletAddress.toLowerCase()}_${purpose}`;
    
    // Clear from memory
    this.memoryCache.delete(cacheKey);
    
    // Clear from storage
    try {
      const stored = localStorage.getItem(SIGNATURE_CACHE_KEY);
      if (stored) {
        const cache = JSON.parse(stored);
        delete cache[cacheKey];
        localStorage.setItem(SIGNATURE_CACHE_KEY, JSON.stringify(cache));
      }
    } catch (err) {
      console.error('[SignatureCache] Error clearing cache:', err);
    }
  }

  /**
   * Clear all cached signatures for a wallet
   */
  clearWalletCache(walletAddress) {
    if (!walletAddress) return;
    
    const prefix = walletAddress.toLowerCase() + '_';
    
    // Clear from memory
    Array.from(this.memoryCache.keys()).forEach(key => {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    });

    // Clear from existing storage
    clearStoredSignatureInfo();

    // Clear from cache storage
    try {
      const stored = localStorage.getItem(SIGNATURE_CACHE_KEY);
      if (stored) {
        const cache = JSON.parse(stored);
        Object.keys(cache).forEach(key => {
          if (key.startsWith(prefix)) {
            delete cache[key];
          }
        });
        localStorage.setItem(SIGNATURE_CACHE_KEY, JSON.stringify(cache));
      }
    } catch (err) {
      console.error('[SignatureCache] Error clearing wallet cache:', err);
    }
  }

  /**
   * Add listener for cache updates
   */
  addListener(walletAddress, purpose, callback) {
    const key = `${walletAddress.toLowerCase()}_${purpose}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
  }

  /**
   * Remove listener
   */
  removeListener(walletAddress, purpose, callback) {
    const key = `${walletAddress.toLowerCase()}_${purpose}`;
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Notify listeners of cache updates
   */
  notifyListeners(walletAddress, purpose) {
    const key = `${walletAddress.toLowerCase()}_${purpose}`;
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.forEach(callback => callback());
    }
  }

  /**
   * Get all cached entries for debugging
   */
  getAllCachedEntries() {
    const entries = [];
    
    // From memory cache
    this.memoryCache.forEach((value, key) => {
      entries.push({ source: 'memory', key, ...value });
    });
    
    // From localStorage
    try {
      const stored = localStorage.getItem(SIGNATURE_CACHE_KEY);
      if (stored) {
        const cache = JSON.parse(stored);
        Object.entries(cache).forEach(([key, value]) => {
          entries.push({ source: 'storage', key, ...value });
        });
      }
    } catch (err) {
      console.error('[SignatureCache] Error reading all entries:', err);
    }
    
    return entries;
  }
}

// Create singleton instance
const signatureCache = new SignatureCacheManager();

// Export instance
export default signatureCache;

// Export utility functions
export { SignatureCacheManager };
