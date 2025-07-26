/**
 * Global Signature Manager
 * 
 * File Path: src/lib/utils/globalSignatureManager.js
 * 
 * Manages a single signature across the entire application
 * with 10-minute validity period
 * 
 * @version 1.0.0
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
    
    // Load from storage on initialization
    this.loadFromStorage();
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
      console.log('[GlobalSignatureManager] Using existing valid signature');
      return {
        signature: this.signature,
        message: this.message,
        walletAddress: this.walletAddress,
        walletType: this.walletType,
        expiresAt: this.expiresAt
      };
    }

    // If already generating, wait for it
    if (this.isGenerating && this.generationPromise) {
      console.log('[GlobalSignatureManager] Waiting for ongoing signature generation');
      return this.generationPromise;
    }

    // Generate new signature
    return this.generateSignature(wallet);
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
    this.signature = null;
    this.message = null;
    this.expiresAt = null;
    this.walletAddress = null;
    this.walletType = null;
    this.isGenerating = false;
    this.generationPromise = null;
    
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
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      this.signature = data.signature;
      this.message = data.message;
      this.walletAddress = data.walletAddress;
      this.walletType = data.walletType;
      this.expiresAt = data.expiresAt;

      console.log('[GlobalSignatureManager] Loaded valid signature from storage');
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
