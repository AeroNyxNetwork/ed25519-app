/**
 * useSignature Hook
 * Manages wallet signature generation and caching for AeroNyx platform
 * Complete version with all features
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

/**
 * Custom hook for managing wallet signatures
 * @param {string} purpose - Purpose of the signature (e.g., 'register', 'auth')
 * @returns {Object} Signature state and methods
 */
export function useSignature(purpose = 'auth') {
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
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Check for cached signature on mount and wallet changes
  useEffect(() => {
    if (!wallet.connected || !wallet.address) {
      // Clear signature if wallet disconnected
      clearSignature();
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
    } else {
      // Auto-generate signature on mount
      generateSignature();
    }
  }, [wallet.connected, wallet.address, purpose]);

  /**
   * Generate a new signature
   */
  const generateSignature = useCallback(async () => {
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
  }, [wallet, purpose]);

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
      clearStoredSignatureInfo();
    }
  }, [wallet.address, purpose]);

  /**
   * Refresh signature (force regenerate)
   */
  const refreshSignature = useCallback(async () => {
    clearSignature();
    return generateSignature();
  }, [clearSignature, generateSignature]);

  /**
   * Validate current signature
   */
  const validateSignature = useCallback(() => {
    if (!signature || !message) {
      return false;
    }

    // Check if signature is expired
    if (isSignatureNeeded(lastSignatureTime)) {
      return false;
    }

    // Validate format
    if (!isValidSignatureFormat(signature, wallet.type)) {
      return false;
    }

    return true;
  }, [signature, message, lastSignatureTime, wallet.type]);

  /**
   * Get signature or generate if needed
   */
  const ensureSignature = useCallback(async () => {
    if (validateSignature()) {
      return { signature, message };
    }

    return generateSignature();
  }, [validateSignature, signature, message, generateSignature]);

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
    walletType: wallet.type
  };
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
  const expiryTime = TIME_CONSTANTS.SIGNATURE_VALIDITY_MINUTES * 60 * 1000;
  return Date.now() - timestamp > expiryTime;
}

// Export for external use
export default useSignature;

// Export utility to check if any signature exists for a wallet
export function hasStoredSignature(walletAddress) {
  const info = getStoredSignatureInfo();
  return info && info.walletAddress === walletAddress.toLowerCase() && !isSignatureNeeded(info.timestamp);
}

// Export utility to clear all signatures
export function clearAllSignatures() {
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
