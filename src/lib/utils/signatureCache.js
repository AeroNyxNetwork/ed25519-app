/**
 * Signature Cache Manager
 * Manages signature caching to reduce signing frequency
 * 
 * File Path: src/lib/utils/signatureCache.js
 */

const SIGNATURE_CACHE_KEY = 'aeronyx_signature_cache';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

class SignatureCacheManager {
  constructor() {
    this.memoryCache = new Map();
  }

  /**
   * Get cached signature for a wallet address
   */
  getCachedSignature(walletAddress, purpose = 'default') {
    const cacheKey = `${walletAddress}_${purpose}`;
    
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && this.isValid(memoryEntry)) {
      console.log('[SignatureCache] Found valid signature in memory cache');
      return memoryEntry;
    }

    // Check localStorage
    try {
      const stored = localStorage.getItem(SIGNATURE_CACHE_KEY);
      if (stored) {
        const cache = JSON.parse(stored);
        const entry = cache[cacheKey];
        
        if (entry && this.isValid(entry)) {
          console.log('[SignatureCache] Found valid signature in localStorage');
          // Update memory cache
          this.memoryCache.set(cacheKey, entry);
          return entry;
        }
      }
    } catch (err) {
      console.error('[SignatureCache] Error reading from localStorage:', err);
    }

    return null;
  }

  /**
   * Store signature in cache
   */
  cacheSignature(walletAddress, signature, message, purpose = 'default') {
    const cacheKey = `${walletAddress}_${purpose}`;
    const entry = {
      signature,
      message,
      walletAddress,
      purpose,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_DURATION
    };

    // Update memory cache
    this.memoryCache.set(cacheKey, entry);

    // Update localStorage
    try {
      const stored = localStorage.getItem(SIGNATURE_CACHE_KEY);
      const cache = stored ? JSON.parse(stored) : {};
      cache[cacheKey] = entry;
      
      // Clean expired entries
      this.cleanExpiredEntries(cache);
      
      localStorage.setItem(SIGNATURE_CACHE_KEY, JSON.stringify(cache));
      console.log('[SignatureCache] Signature cached successfully');
    } catch (err) {
      console.error('[SignatureCache] Error writing to localStorage:', err);
    }

    return entry;
  }

  /**
   * Check if cache entry is still valid
   */
  isValid(entry) {
    if (!entry || !entry.expiresAt) return false;
    return Date.now() < entry.expiresAt;
  }

  /**
   * Clean expired entries from cache object
   */
  cleanExpiredEntries(cache) {
    const now = Date.now();
    Object.keys(cache).forEach(key => {
      if (!cache[key].expiresAt || cache[key].expiresAt < now) {
        delete cache[key];
      }
    });
  }

  /**
   * Clear all cached signatures
   */
  clearCache() {
    this.memoryCache.clear();
    try {
      localStorage.removeItem(SIGNATURE_CACHE_KEY);
    } catch (err) {
      console.error('[SignatureCache] Error clearing cache:', err);
    }
  }

  /**
   * Clear cache for specific wallet
   */
  clearWalletCache(walletAddress) {
    // Clear from memory
    Array.from(this.memoryCache.keys()).forEach(key => {
      if (key.startsWith(walletAddress)) {
        this.memoryCache.delete(key);
      }
    });

    // Clear from localStorage
    try {
      const stored = localStorage.getItem(SIGNATURE_CACHE_KEY);
      if (stored) {
        const cache = JSON.parse(stored);
        Object.keys(cache).forEach(key => {
          if (key.startsWith(walletAddress)) {
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
   * Get time until expiration
   */
  getTimeUntilExpiration(walletAddress, purpose = 'default') {
    const entry = this.getCachedSignature(walletAddress, purpose);
    if (!entry) return 0;
    
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
}

// Create singleton instance
const signatureCache = new SignatureCacheManager();

// Enhanced useSignature hook with caching
export function useCachedSignature(purpose = 'default') {
  const { wallet } = useWallet();
  const [signature, setSignature] = useState(null);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [remainingTime, setRemainingTime] = useState(0);

  // Check cache on mount and wallet change
  useEffect(() => {
    if (!wallet.connected || !wallet.address) {
      setSignature(null);
      setMessage(null);
      return;
    }

    const cached = signatureCache.getCachedSignature(wallet.address, purpose);
    if (cached) {
      setSignature(cached.signature);
      setMessage(cached.message);
      setRemainingTime(signatureCache.getTimeUntilExpiration(wallet.address, purpose));
    }
  }, [wallet.connected, wallet.address, purpose]);

  // Update remaining time
  useEffect(() => {
    if (!signature) return;

    const interval = setInterval(() => {
      const remaining = signatureCache.getTimeUntilExpiration(wallet.address, purpose);
      setRemainingTime(remaining);
      
      if (remaining <= 0) {
        setSignature(null);
        setMessage(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [signature, wallet.address, purpose]);

  // Generate new signature
  const generateSignature = useCallback(async (forceNew = false) => {
    if (!wallet.connected || !wallet.address) {
      setError('Wallet not connected');
      return null;
    }

    // Check cache first unless forced
    if (!forceNew) {
      const cached = signatureCache.getCachedSignature(wallet.address, purpose);
      if (cached) {
        setSignature(cached.signature);
        setMessage(cached.message);
        return cached;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get signature message from API
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }

      const signatureMessage = messageResponse.data.message;

      // Sign the message
      const signedData = await signMessage(signatureMessage, wallet);

      // Cache the signature
      const cached = signatureCache.cacheSignature(
        wallet.address,
        signedData.signature,
        signedData.message,
        purpose
      );

      setSignature(signedData.signature);
      setMessage(signedData.message);
      setRemainingTime(CACHE_DURATION);

      return cached;
    } catch (err) {
      console.error('[useCachedSignature] Error:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [wallet, purpose]);

  // Ensure valid signature (get from cache or generate new)
  const ensureSignature = useCallback(async () => {
    if (signature && message && remainingTime > 0) {
      return { signature, message };
    }

    return generateSignature();
  }, [signature, message, remainingTime, generateSignature]);

  return {
    signature,
    message,
    isLoading,
    error,
    remainingTime,
    remainingTimeFormatted: signatureCache.formatRemainingTime(wallet.address, purpose),
    generateSignature,
    ensureSignature,
    clearCache: () => signatureCache.clearWalletCache(wallet.address),
    isValid: remainingTime > 0
  };
}

export default signatureCache;
