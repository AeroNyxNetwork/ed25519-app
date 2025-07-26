/**
 * Enhanced Global Signature Manager
 * Prevents multiple signature requests
 * 
 * File Path: src/lib/utils/globalSignatureManager.js
 * 
 * @version 1.1.0
 */

import nodeRegistrationService from '../api/nodeRegistration';
import { signMessage, isValidSignatureFormat } from './walletSignature';

const SIGNATURE_VALIDITY = 10 * 60 * 1000; // 10 minutes
const STORAGE_KEY = 'aeronyx_global_signature';

class GlobalSignatureManager {
  constructor() {
    this.signature = null;
    this.message = null;
    this.expiresAt = null;
    this.walletAddress = null;
    this.walletType = null;
    this.isGenerating = false;
    this.listeners = new Set();
    this.generationPromise = null;
    this.initPromise = null;
    
    // Load from storage on initialization
    this.loadFromStorage();
  }

  /**
   * Initialize with wallet (ensures only one signature generation)
   */
  async initialize(wallet) {
    // If already initializing, return the promise
    if (this.initPromise) {
      console.log('[GlobalSignatureManager] Already initializing, waiting...');
      return this.initPromise;
    }

    // If already initialized for this wallet, return existing
    if (this.isValid() && this.walletAddress === wallet.address?.toLowerCase()) {
      console.log('[GlobalSignatureManager] Already initialized with valid signature');
      return {
        signature: this.signature,
        message: this.message,
        walletAddress: this.walletAddress,
        walletType: this.walletType,
        expiresAt: this.expiresAt
      };
    }

    // Start initialization
    console.log('[GlobalSignatureManager] Starting initialization');
    this.initPromise = this.getSignature(wallet);
    
    try {
      const result = await this.initPromise;
      return result;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Get current signature if valid, or generate new one
   */
  async getSignature(wallet) {
    if (!wallet?.connected || !wallet?.address) {
      throw new Error('Wallet not connected');
    }

    const walletAddress = wallet.address.toLowerCase();

    // Check if we have a valid signature for current wallet
    if (this.isValid() && this.walletAddress === walletAddress) {
      console.log('[GlobalSignatureManager] Using existing valid signature, expires in', this.getFormattedRemainingTime());
      return {
        signature: this.signature,
        message: this.message,
        walletAddress: this.walletAddress,
        walletType: this.walletType,
        expiresAt: this.expiresAt
      };
    }

    // Check if wallet changed
    if (this.walletAddress && this.walletAddress !== walletAddress) {
      console.log('[GlobalSignatureManager] Wallet changed, clearing old signature');
      this.clear();
    }

    // If already generating, wait for it
    if (this.isGenerating && this.generationPromise) {
      console.log('[GlobalSignatureManager] Waiting for ongoing signature generation');
      return this.generationPromise;
    }

    // Generate new signature
    console.log('[GlobalSignatureManager] No valid signature found, generating new one');
    return this.generateSignature(wallet);
  }

  /**
   * Wait for valid signature (useful for components that need to wait)
   */
  async waitForSignature(wallet) {
    // If initializing, wait for it
    if (this.initPromise) {
      console.log('[GlobalSignatureManager] Waiting for initialization');
      return this.initPromise;
    }

    // If generating, wait for it
    if (this.isGenerating && this.generationPromise) {
      console.log('[GlobalSignatureManager] Waiting for generation');
      return this.generationPromise;
    }

    // Otherwise get signature normally
    return this.getSignature(wallet);
  }

  /**
   * Generate new signature
   */
  async generateSignature(wallet) {
    if (!wallet?.connected || !wallet?.address) {
      throw new Error('Wallet not connected');
    }

    // Prevent concurrent generation
    if (this.isGenerating) {
      console.log('[GlobalSignatureManager] Already generating, returning existing promise');
      return this.generationPromise;
    }

    this.isGenerating = true;
    this.notifyListeners('generating');

    this.generationPromise = (async () => {
      try {
        console.log('[GlobalSignatureManager] Generating new signature');

        // Get signature message from API
        const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
        if (!messageResponse.success) {
          throw new Error(messageResponse.message || 'Failed to generate signature message');
        }

        const signatureMessage = messageResponse.data.message;

        // Sign the message
        const signedData = await signMessage(signatureMessage, wallet);
        
        if (!isValidSignatureFormat(signedData.signature, wallet.type)) {
          throw new Error('Invalid signature format received from wallet');
        }

        // Store the signature
        const now = Date.now();
        this.signature = signedData.signature;
        this.message = signedData.message;
        this.walletAddress = wallet.address.toLowerCase();
        this.walletType = wallet.type || 'okx';
        this.expiresAt = now + SIGNATURE_VALIDITY;

        // Save to storage
        this.saveToStorage();

        console.log('[GlobalSignatureManager] New signature generated, valid for 10 minutes');
        this.notifyListeners('generated');

        return {
          signature: this.signature,
          message: this.message,
          walletAddress: this.walletAddress,
          walletType: this.walletType,
          expiresAt: this.expiresAt
        };

      } catch (error) {
        console.error('[GlobalSignatureManager] Failed to generate signature:', error);
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
   * Check if current signature is valid
   */
  isValid() {
    if (!this.signature || !this.message || !this.expiresAt) {
      return false;
    }

    return Date.now() < this.expiresAt;
  }

  /**
   * Get remaining time in milliseconds
   */
  getRemainingTime() {
    if (!this.isValid()) return 0;
    return Math.max(0, this.expiresAt - Date.now());
  }

  /**
   * Format remaining time for display
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
   * Clear signature (e.g., on wallet disconnect)
   */
  clear() {
    console.log('[GlobalSignatureManager] Clearing signature');
    this.signature = null;
    this.message = null;
    this.expiresAt = null;
    this.walletAddress = null;
    this.walletType = null;
    this.isGenerating = false;
    this.generationPromise = null;
    this.initPromise = null;
    
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('[GlobalSignatureManager] Failed to clear storage:', err);
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
      console.log('[GlobalSignatureManager] Saved to storage');
    } catch (err) {
      console.error('[GlobalSignatureManager] Failed to save to storage:', err);
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
      if (data.expiresAt && Date.now() >= data.expiresAt) {
        console.log('[GlobalSignatureManager] Stored signature expired, clearing');
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      this.signature = data.signature;
      this.message = data.message;
      this.walletAddress = data.walletAddress;
      this.walletType = data.walletType;
      this.expiresAt = data.expiresAt;

      console.log('[GlobalSignatureManager] Loaded valid signature from storage, expires in', this.getFormattedRemainingTime());
    } catch (err) {
      console.error('[GlobalSignatureManager] Failed to load from storage:', err);
    }
  }

  /**
   * Add listener for signature events
   */
  addListener(callback) {
    this.listeners.add(callback);
  }

  /**
   * Remove listener
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (err) {
        console.error('[GlobalSignatureManager] Listener error:', err);
      }
    });
  }
}

// Create singleton instance
const globalSignatureManager = new GlobalSignatureManager();

// Export instance
export default globalSignatureManager;

// Export for testing
export { GlobalSignatureManager };
