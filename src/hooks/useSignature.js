/**
 * useSignature Hook
 * Manages wallet signature generation and caching for AeroNyx platform
 * Enhanced with global signature manager integration
 * 
 * @version 4.0.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { 
  signMessage, 
  formatMessageForSigning, 
  isValidSignatureFormat,
  storeSignatureInfo,
  getStoredSignatureInfo,
  clearStoredSignatureInfo,
  isSignatureNeeded
} from '../lib/utils/walletSignature';
import { STORAGE_KEYS, TIME_CONSTANTS } from '../lib/constants';
import globalSignatureManager from '../lib/utils/globalSignatureManager';

/**
 * Custom hook for managing wallet signatures
 * @param {string} purpose - Purpose of the signature (e.g., 'register', 'auth')
 * @param {boolean} useGlobal - Whether to use global signature manager (default: true)
 * @returns {Object} Signature state and methods
 */
export function useSignature(purpose = 'auth', useGlobal = true) {
  const { wallet } = useWallet();
  const [signature, setSignature] = useState(null);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSignatureTime, setLastSignatureTime] = useState(null);
  
  // Refs to prevent duplicate operations
  const isGeneratingRef = useRef(false);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Listen to global signature manager events if useGlobal is true
  useEffect(() => {
    if (!useGlobal) return;

    const handleGlobalEvent = (event, data) => {
      if (!mountedRef.current) return;

      switch (event) {
        case 'generating':
          setIsLoading(true);
          setError(null);
          break;
        case 'generated':
          if (globalSignatureManager.walletAddress === wallet.address?.toLowerCase()) {
            setSignature(globalSignatureManager.signature);
            setMessage(globalSignatureManager.message);
            setLastSignatureTime(Date.now());
            setIsLoading(false);
          }
          break;
        case 'error':
          setError(data?.message || 'Failed to generate signature');
          setIsLoading(false);
          break;
        case 'cleared':
          if (globalSignatureManager.walletAddress === wallet.address?.toLowerCase()) {
            setSignature(null);
            setMessage(null);
            setLastSignatureTime(null);
          }
          break;
      }
    };

    globalSignatureManager.addListener(handleGlobalEvent);
    
    return () => {
      globalSignatureManager.removeListener(handleGlobalEvent);
    };
  }, [useGlobal, wallet.address]);

  // Check for cached signature on mount and wallet changes
  useEffect(() => {
    if (!wallet.connected || !wallet.address) {
      // Clear signature if wallet disconnected
      clearSignature();
      return;
    }

    // If using global manager, check if it has a valid signature
    if (useGlobal && globalSignatureManager.isValid() && 
        globalSignatureManager.walletAddress === wallet.address.toLowerCase()) {
      setSignature(globalSignatureManager.signature);
      setMessage(globalSignatureManager.message);
      setLastSignatureTime(Date.now());
      console.log('[useSignature] Using global signature');
      return;
    }

    // Check stored signature info
    const storedInfo = getStoredSignatureInfo();
    
    if (storedInfo && 
        storedInfo.walletAddress === wallet.address.toLowerCase() &&
        storedInfo.purpose === purpose &&
        !isSignatureNeeded(storedInfo.timestamp)) {
      
      // Validate signature format
      if (isValidSignatureFormat(storedInfo.signature, wallet.type)) {
        setSignature(storedInfo.signature);
        setMessage(storedInfo.message);
        setLastSignatureTime(storedInfo.timestamp);
        console.log('[useSignature] Using valid stored signature');
        return;
      }
    }

    // Check session storage for temporary signature
    const cached = getCachedSignature(wallet.address, purpose);
    if (cached && !isSignatureExpired(cached.timestamp)) {
      setSignature(cached.signature);
      setMessage(cached.message);
      setLastSignatureTime(cached.timestamp);
      console.log('[useSignature] Using cached signature');
    } else if (!useGlobal) {
      // Only auto-generate if not using global manager
      generateSignature();
    }
  }, [wallet.connected, wallet.address, purpose, useGlobal]);

  /**
   * Generate a new signature
   */
  const generateSignature = useCallback(async () => {
    // If using global manager, delegate to it
    if (useGlobal) {
      try {
        const globalSig = await globalSignatureManager.getSignature(wallet);
        if (mountedRef.current) {
          setSignature(globalSig.signature);
          setMessage(globalSig.message);
          setLastSignatureTime(Date.now());
        }
        return globalSig;
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message);
        }
        throw err;
      }
    }

    // Original implementation for non-global usage
    // Prevent duplicate generation
    if (isGeneratingRef.current) {
      console.log('[useSignature] Already generating signature, skipping...');
      return;
    }

    if (!wallet.connected || !wallet.address) {
      setError('Wallet not connected');
      return;
    }

    isGeneratingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      console.log('[useSignature] Generating signature for:', wallet.address);

      // Step 1: Get signature message from backend
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(
        wallet.address
      );

      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }

      const signatureMessage = messageResponse.data.message;
      const messageTimestamp = messageResponse.data.timestamp;
      
      console.log('[useSignature] Got message to sign:', signatureMessage);

      // Check if component is still mounted
      if (!mountedRef.current) {
        return;
      }

      // Step 2: Sign the message with wallet
      const signedData = await signMessage(signatureMessage, wallet);
      
      // Validate the signature
      if (!isValidSignatureFormat(signedData.signature, wallet.type)) {
        throw new Error('Invalid signature format received from wallet');
      }

      // Check if component is still mounted
      if (!mountedRef.current) {
        return;
      }

      // Step 3: Store the signature
      const signatureInfo = {
        signature: signedData.signature,
        message: signedData.message,
        walletAddress: wallet.address.toLowerCase(),
        walletType: wallet.type,
        purpose: purpose,
        timestamp: Date.now(),
        messageTimestamp: messageTimestamp
      };

      // Store in both localStorage and sessionStorage
      storeSignatureInfo(signatureInfo);
      cacheSignature(wallet.address, purpose, signedData.signature, signedData.message);
      
      // Update state
      setSignature(signedData.signature);
      setMessage(signedData.message);
      setLastSignatureTime(Date.now());

      console.log('[useSignature] Signature generated successfully');
      
      return signedData;

    } catch (err) {
      console.error('[useSignature] Error generating signature:', err);
      
      // Check if user rejected
      if (err.code === 4001 || err.message?.includes('rejected')) {
        setError('Signature request rejected by user');
      } else if (err.message?.includes('timeout')) {
        setError('Signature request timed out');
      } else {
        setError(err.message || 'Failed to generate signature');
      }
      
      throw err;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        isGeneratingRef.current = false;
      }
    }
  }, [wallet, purpose, useGlobal]);

  /**
   * Clear the current signature
   */
  const clearSignature = useCallback(() => {
    setSignature(null);
    setMessage(null);
    setError(null);
    setLastSignatureTime(null);
    
    if (wallet.address) {
      clearCachedSignature(wallet.address, purpose);
      if (!useGlobal) {
        clearStoredSignatureInfo();
      }
    }

    // Clear global signature if using global manager
    if (useGlobal && wallet.address && 
        globalSignatureManager.walletAddress === wallet.address.toLowerCase()) {
      globalSignatureManager.clear();
    }
  }, [wallet.address, purpose, useGlobal]);

  /**
   * Refresh signature (force regenerate)
   */
  const refreshSignature = useCallback(async () => {
    if (useGlobal) {
      globalSignatureManager.clear();
    }
    clearSignature();
    return generateSignature();
  }, [clearSignature, generateSignature, useGlobal]);

  /**
   * Validate current signature
   */
  const validateSignature = useCallback(() => {
    if (!signature || !message) {
      return false;
    }

    // Check if signature is expired
    if (useGlobal && globalSignatureManager.isValid()) {
      return true;
    }

    if (isSignatureNeeded(lastSignatureTime)) {
      return false;
    }

    // Validate format
    if (!isValidSignatureFormat(signature, wallet.type)) {
      return false;
    }

    return true;
  }, [signature, message, lastSignatureTime, wallet.type, useGlobal]);

  /**
   * Get signature or generate if needed
   */
  const ensureSignature = useCallback(async () => {
    if (validateSignature()) {
      return { signature, message };
    }

    return generateSignature();
  }, [validateSignature, signature, message, generateSignature]);

  // Calculate remaining time
  const getRemainingTime = useCallback(() => {
    if (useGlobal) {
      return globalSignatureManager.getRemainingTime();
    }
    
    if (!lastSignatureTime) return 0;
    const elapsed = Date.now() - lastSignatureTime;
    const validity = TIME_CONSTANTS.SIGNATURE_VALIDITY_MINUTES * 60 * 1000;
    return Math.max(0, validity - elapsed);
  }, [useGlobal, lastSignatureTime]);

  return {
    signature,
    message,
    isLoading,
    error,
    lastSignatureTime,
    generateSignature,
    clearSignature,
    refreshSignature,
    validateSignature,
    ensureSignature,
    isValid: Boolean(signature && message && !error && validateSignature()),
    isExpired: isSignatureNeeded(lastSignatureTime),
    walletAddress: wallet.address,
    walletType: wallet.type,
    remainingTime: getRemainingTime(),
    remainingTimeFormatted: useGlobal ? 
      globalSignatureManager.getFormattedRemainingTime() : 
      formatRemainingTime(getRemainingTime()),
    isGenerating: isLoading // Add alias for compatibility
  };
}

// Helper function to format remaining time
function formatRemainingTime(ms) {
  if (ms <= 0) return 'Expired';
  
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

// Session Storage Cache utility functions (for temporary storage)
function getCacheKey(walletAddress, purpose) {
  return `${STORAGE_KEYS.SIGNATURE_INFO}_${walletAddress}_${purpose}`;
}

function getCachedSignature(walletAddress, purpose) {
  try {
    const key = getCacheKey(walletAddress, purpose);
    const cached = sessionStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.error('[useSignature] Error reading cache:', err);
    return null;
  }
}

function cacheSignature(walletAddress, purpose, signature, message) {
  try {
    const key = getCacheKey(walletAddress, purpose);
    const data = {
      signature,
      message,
      timestamp: Date.now(),
      walletAddress: walletAddress.toLowerCase(),
      purpose
    };
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error('[useSignature] Error caching signature:', err);
  }
}

function clearCachedSignature(walletAddress, purpose) {
  try {
    const key = getCacheKey(walletAddress, purpose);
    sessionStorage.removeItem(key);
  } catch (err) {
    console.error('[useSignature] Error clearing cache:', err);
  }
}

function isSignatureExpired(timestamp) {
  // Use 10 minutes for global signature
  const expiryTime = 10 * 60 * 1000; // 10 minutes
  return Date.now() - timestamp > expiryTime;
}

// Export for external use
export default useSignature;

// Export utility to check if any signature exists for a wallet
export function hasStoredSignature(walletAddress) {
  // First check global signature
  if (globalSignatureManager.isValid() && 
      globalSignatureManager.walletAddress === walletAddress.toLowerCase()) {
    return true;
  }
  
  // Then check local storage
  const info = getStoredSignatureInfo();
  return info && info.walletAddress === walletAddress.toLowerCase() && !isSignatureNeeded(info.timestamp);
}

// Export utility to clear all signatures
export function clearAllSignatures() {
  // Clear global signature
  globalSignatureManager.clear();
  
  // Clear local storage
  clearStoredSignatureInfo();
  
  // Clear all session storage signatures
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.includes(STORAGE_KEYS.SIGNATURE_INFO)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (err) {
    console.error('[useSignature] Error clearing all signatures:', err);
  }
}
