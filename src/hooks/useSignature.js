/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Unified signature management hook
 * Modification Reason: Optimized to match backend 30-minute caching
 * Main Functionality: Single source of truth for wallet signatures
 * Dependencies: globalSignatureManager, walletSignature utilities
 *
 * Main Logical Flow:
 * 1. Check if valid signature exists in global manager
 * 2. If not, check localStorage/sessionStorage caches
 * 3. Generate new signature only when necessary
 * 4. Cache signature for 30 minutes (matching backend)
 * 5. Auto-refresh before expiration
 *
 * ⚠️ Important Note for Next Developer:
 * - Backend supports 30-minute signature caching
 * - This hook is the ONLY signature hook that should be used
 * - Other hooks (useGlobalSignature, useCachedSignature) are deprecated wrappers
 * - Global manager ensures only ONE signature per wallet across all components
 *
 * Last Modified: v5.0.0 - Unified and optimized for 30-minute backend caching
 * ============================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { 
  signMessage, 
  isValidSignatureFormat,
  storeSignatureInfo,
  getStoredSignatureInfo,
  clearStoredSignatureInfo
} from '../lib/utils/walletSignature';

// Constants matching backend configuration
const SIGNATURE_VALIDITY_MS = 30 * 60 * 1000; // 30 minutes (matching backend)
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;   // Refresh when 5 minutes remaining
const STORAGE_KEY = 'aeronyx_unified_signature';

/**
 * Global signature state manager (singleton pattern)
 */
class GlobalSignatureState {
  constructor() {
    this.signature = null;
    this.message = null;
    this.walletAddress = null;
    this.walletType = null;
    this.expiresAt = null;
    this.isGenerating = false;
    this.generationPromise = null;
    this.listeners = new Set();
    this.refreshTimer = null;
    
    // Load from storage on initialization
    this.loadFromStorage();
    
    // Start expiration checker
    this.startExpirationChecker();
  }

  /**
   * Get or generate signature for wallet
   */
  async getSignature(wallet) {
    if (!wallet?.connected || !wallet?.address) {
      throw new Error('Wallet not connected');
    }

    const walletAddress = wallet.address.toLowerCase();

    // Check if we have valid signature for current wallet
    if (this.isValid() && this.walletAddress === walletAddress) {
      console.log('[GlobalSignature] Using existing signature, expires in', this.getFormattedRemainingTime());
      return {
        signature: this.signature,
        message: this.message,
        walletAddress: this.walletAddress,
        walletType: this.walletType
      };
    }

    // Check if wallet changed
    if (this.walletAddress && this.walletAddress !== walletAddress) {
      console.log('[GlobalSignature] Wallet changed, clearing old signature');
      this.clear();
    }

    // If already generating, wait for it
    if (this.isGenerating && this.generationPromise) {
      console.log('[GlobalSignature] Waiting for ongoing generation');
      return this.generationPromise;
    }

    // Generate new signature
    return this.generateSignature(wallet);
  }

  /**
   * Generate new signature
   */
  async generateSignature(wallet) {
    if (this.isGenerating) {
      return this.generationPromise;
    }

    this.isGenerating = true;
    this.notifyListeners('generating');

    this.generationPromise = (async () => {
      try {
        console.log('[GlobalSignature] Generating new signature for 30-minute validity');

        // Get message from backend
        const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
        if (!messageResponse.success) {
          throw new Error(messageResponse.message || 'Failed to generate signature message');
        }

        const signatureMessage = messageResponse.data.message;

        // Sign message
        const signedData = await signMessage(signatureMessage, wallet);
        
        if (!isValidSignatureFormat(signedData.signature, wallet.type)) {
          throw new Error('Invalid signature format');
        }

        // Store signature with 30-minute expiration
        const now = Date.now();
        this.signature = signedData.signature;
        this.message = signedData.message;
        this.walletAddress = wallet.address.toLowerCase();
        this.walletType = wallet.type || 'okx';
        this.expiresAt = now + SIGNATURE_VALIDITY_MS;

        // Save to storage
        this.saveToStorage();
        
        // Also save using legacy utilities for backward compatibility
        storeSignatureInfo({
          signature: this.signature,
          message: this.message,
          walletAddress: this.walletAddress,
          walletType: this.walletType,
          purpose: 'auth',
          timestamp: now
        });

        // Schedule refresh before expiration
        this.scheduleRefresh(wallet);

        console.log('[GlobalSignature] Signature generated, valid for 30 minutes');
        this.notifyListeners('generated');

        return {
          signature: this.signature,
          message: this.message,
          walletAddress: this.walletAddress,
          walletType: this.walletType
        };

      } catch (error) {
        console.error('[GlobalSignature] Generation failed:', error);
        this.notifyListeners('error', error);
        throw error;
      } finally {
        this.isGenerating = false;
        this.generationPromise = null;
      }
    })();

    return this.generationPromise;
  }

  /**
   * Schedule automatic refresh before expiration
   */
  scheduleRefresh(wallet) {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.expiresAt) return;

    const timeUntilRefresh = this.expiresAt - Date.now() - REFRESH_THRESHOLD_MS;
    
    if (timeUntilRefresh > 0) {
      console.log('[GlobalSignature] Scheduling refresh in', Math.round(timeUntilRefresh / 60000), 'minutes');
      
      this.refreshTimer = setTimeout(async () => {
        if (this.isValid() && wallet?.connected) {
          console.log('[GlobalSignature] Auto-refreshing signature');
          try {
            await this.generateSignature(wallet);
          } catch (error) {
            console.error('[GlobalSignature] Auto-refresh failed:', error);
          }
        }
      }, timeUntilRefresh);
    }
  }

  /**
   * Check if signature is valid
   */
  isValid() {
    if (!this.signature || !this.message || !this.expiresAt) {
      return false;
    }
    return Date.now() < this.expiresAt;
  }

  /**
   * Get remaining time in ms
   */
  getRemainingTime() {
    if (!this.isValid()) return 0;
    return Math.max(0, this.expiresAt - Date.now());
  }

  /**
   * Get formatted remaining time
   */
  getFormattedRemainingTime() {
    const ms = this.getRemainingTime();
    if (ms <= 0) return 'Expired';
    
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Clear signature
   */
  clear() {
    console.log('[GlobalSignature] Clearing signature');
    this.signature = null;
    this.message = null;
    this.walletAddress = null;
    this.walletType = null;
    this.expiresAt = null;
    this.isGenerating = false;
    this.generationPromise = null;
    
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    try {
      localStorage.removeItem(STORAGE_KEY);
      clearStoredSignatureInfo();
    } catch (err) {
      console.error('[GlobalSignature] Failed to clear storage:', err);
    }
    
    this.notifyListeners('cleared');
  }

  /**
   * Save to localStorage
   */
  saveToStorage() {
    try {
      const data = {
        signature: this.signature,
        message: this.message,
        walletAddress: this.walletAddress,
        walletType: this.walletType,
        expiresAt: this.expiresAt
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('[GlobalSignature] Failed to save:', err);
    }
  }

  /**
   * Load from localStorage
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const data = JSON.parse(stored);
      
      // Check if expired
      if (!data.expiresAt || Date.now() >= data.expiresAt) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      this.signature = data.signature;
      this.message = data.message;
      this.walletAddress = data.walletAddress;
      this.walletType = data.walletType;
      this.expiresAt = data.expiresAt;

      console.log('[GlobalSignature] Loaded from storage, expires in', this.getFormattedRemainingTime());
    } catch (err) {
      console.error('[GlobalSignature] Failed to load:', err);
    }
  }

  /**
   * Start periodic expiration checker
   */
  startExpirationChecker() {
    setInterval(() => {
      if (this.expiresAt && Date.now() >= this.expiresAt) {
        console.log('[GlobalSignature] Signature expired, clearing');
        this.clear();
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Add event listener
   */
  addListener(callback) {
    this.listeners.add(callback);
  }

  /**
   * Remove event listener
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Notify listeners
   */
  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (err) {
        console.error('[GlobalSignature] Listener error:', err);
      }
    });
  }
}

// Create singleton instance
const globalSignatureState = new GlobalSignatureState();

/**
 * Unified signature hook - main export
 * @param {string} purpose - Purpose identifier (for backward compatibility, ignored internally)
 * @returns {Object} Signature state and methods
 */
export function useSignature(purpose = 'auth') {
  const { wallet } = useWallet();
  const [signature, setSignature] = useState(null);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [remainingTime, setRemainingTime] = useState(0);
  
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Listen to global state events
  useEffect(() => {
    const handleEvent = (event, data) => {
      if (!mountedRef.current) return;

      switch (event) {
        case 'generating':
          setIsLoading(true);
          setError(null);
          break;
        case 'generated':
          if (globalSignatureState.walletAddress === wallet.address?.toLowerCase()) {
            setSignature(globalSignatureState.signature);
            setMessage(globalSignatureState.message);
            setRemainingTime(globalSignatureState.getRemainingTime());
          }
          setIsLoading(false);
          break;
        case 'error':
          setError(data?.message || 'Failed to generate signature');
          setIsLoading(false);
          break;
        case 'cleared':
          setSignature(null);
          setMessage(null);
          setRemainingTime(0);
          break;
      }
    };

    globalSignatureState.addListener(handleEvent);
    
    return () => {
      globalSignatureState.removeListener(handleEvent);
    };
  }, [wallet.address]);

  // Initialize state from global manager
  useEffect(() => {
    if (!wallet.connected || !wallet.address) {
      setSignature(null);
      setMessage(null);
      setRemainingTime(0);
      return;
    }

    // Check if manager has valid signature for current wallet
    if (globalSignatureState.isValid() && 
        globalSignatureState.walletAddress === wallet.address.toLowerCase()) {
      setSignature(globalSignatureState.signature);
      setMessage(globalSignatureState.message);
      setRemainingTime(globalSignatureState.getRemainingTime());
    }
  }, [wallet.connected, wallet.address]);

  // Update remaining time every second
  useEffect(() => {
    if (signature && wallet.address) {
      const updateTime = () => {
        const remaining = globalSignatureState.getRemainingTime();
        setRemainingTime(remaining);
        
        if (remaining <= 0) {
          setSignature(null);
          setMessage(null);
        }
      };

      updateTime();
      timerRef.current = setInterval(updateTime, 1000);
      
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [signature, wallet.address]);

  /**
   * Generate or get signature
   */
  const generateSignature = useCallback(async () => {
    try {
      const signatureData = await globalSignatureState.getSignature(wallet);
      
      if (!mountedRef.current) return null;

      setSignature(signatureData.signature);
      setMessage(signatureData.message);
      setRemainingTime(globalSignatureState.getRemainingTime());

      return signatureData;

    } catch (err) {
      console.error('[useSignature] Error:', err);
      
      if (!mountedRef.current) return null;

      if (err.code === 4001 || err.message?.includes('rejected')) {
        setError('Signature request rejected by user');
      } else {
        setError(err.message || 'Failed to generate signature');
      }
      
      throw err;
    }
  }, [wallet]);

  /**
   * Ensure we have a valid signature
   */
  const ensureSignature = useCallback(async () => {
    if (globalSignatureState.isValid() && 
        globalSignatureState.walletAddress === wallet.address?.toLowerCase()) {
      return {
        signature: globalSignatureState.signature,
        message: globalSignatureState.message
      };
    }

    return generateSignature();
  }, [wallet, generateSignature]);

  /**
   * Force refresh signature
   */
  const refreshSignature = useCallback(async () => {
    globalSignatureState.clear();
    return generateSignature();
  }, [generateSignature]);

  /**
   * Clear signature
   */
  const clearSignature = useCallback(() => {
    if (wallet.address && 
        globalSignatureState.walletAddress === wallet.address.toLowerCase()) {
      globalSignatureState.clear();
    }
  }, [wallet.address]);

  /**
   * Validate signature
   */
  const validateSignature = useCallback(() => {
    return globalSignatureState.isValid() && 
           globalSignatureState.walletAddress === wallet.address?.toLowerCase();
  }, [wallet.address]);

  return {
    signature,
    message,
    isLoading,
    error,
    remainingTime,
    remainingTimeFormatted: globalSignatureState.getFormattedRemainingTime(),
    generateSignature,
    ensureSignature,
    refreshSignature,
    clearSignature,
    validateSignature,
    isValid: remainingTime > 0 && !!signature && !!message,
    isExpired: remainingTime <= 0,
    walletAddress: wallet.address,
    walletType: wallet.type || 'okx',
    lastSignatureTime: globalSignatureState.expiresAt ? 
      globalSignatureState.expiresAt - SIGNATURE_VALIDITY_MS : null,
    isGenerating: isLoading
  };
}

// Default export
export default useSignature;

// Export backward-compatible wrappers (deprecated)
export function useGlobalSignature() {
  console.warn('[useGlobalSignature] Deprecated: Use useSignature() instead');
  return useSignature('global');
}

export function useCachedSignature(purpose = 'default') {
  console.warn('[useCachedSignature] Deprecated: Use useSignature() instead');
  return useSignature(purpose);
}

// Export utilities for external use
export function hasStoredSignature(walletAddress) {
  return globalSignatureState.isValid() && 
         globalSignatureState.walletAddress === walletAddress.toLowerCase();
}

export function clearAllSignatures() {
  globalSignatureState.clear();
}
