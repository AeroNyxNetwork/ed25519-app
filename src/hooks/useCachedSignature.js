/**
 * Enhanced useSignature Hook with Cache Support
 * 
 * File Path: src/hooks/useCachedSignature.js
 * 
 * This is a wrapper around the existing useSignature hook
 * that adds caching functionality
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { signMessage, isValidSignatureFormat } from '../lib/utils/walletSignature';
import signatureCache from '../lib/utils/signatureCache';

export function useCachedSignature(purpose = 'default') {
  const { wallet } = useWallet();
  const [signature, setSignature] = useState(null);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [remainingTime, setRemainingTime] = useState(0);
  
  const mountedRef = useRef(true);
  const timerRef = useRef(null);

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

  // Load cached signature on mount or wallet change
  useEffect(() => {
    if (!wallet.connected || !wallet.address) {
      setSignature(null);
      setMessage(null);
      setRemainingTime(0);
      return;
    }

    // Try to get cached signature
    const cached = signatureCache.getCachedSignature(wallet.address, purpose);
    if (cached && cached.signature && cached.message) {
      console.log('[useCachedSignature] Using cached signature for', purpose);
      setSignature(cached.signature);
      setMessage(cached.message);
      updateRemainingTime();
    } else {
      // No valid cache, need to generate new signature
      console.log('[useCachedSignature] No valid cache found for', purpose);
    }

    // Set up cache update listener
    const handleCacheUpdate = () => {
      const updated = signatureCache.getCachedSignature(wallet.address, purpose);
      if (updated && updated.signature && updated.message) {
        setSignature(updated.signature);
        setMessage(updated.message);
      }
    };

    signatureCache.addListener(wallet.address, purpose, handleCacheUpdate);

    return () => {
      signatureCache.removeListener(wallet.address, purpose, handleCacheUpdate);
    };
  }, [wallet.connected, wallet.address, purpose]);

  // Update remaining time
  const updateRemainingTime = useCallback(() => {
    if (!wallet.address) return;
    
    const remaining = signatureCache.getTimeUntilExpiration(wallet.address, purpose);
    setRemainingTime(remaining);
    
    if (remaining <= 0 && signature) {
      // Cache expired, clear state
      setSignature(null);
      setMessage(null);
    }
  }, [wallet.address, purpose, signature]);

  // Set up timer to update remaining time
  useEffect(() => {
    if (signature && wallet.address) {
      updateRemainingTime();
      
      // Update every second
      timerRef.current = setInterval(updateRemainingTime, 1000);
      
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [signature, wallet.address, updateRemainingTime]);

  /**
   * Generate new signature and cache it
   */
  const generateSignature = useCallback(async (forceNew = false) => {
    if (!wallet.connected || !wallet.address) {
      setError('Wallet not connected');
      return null;
    }

    // Check cache first unless forced
    if (!forceNew) {
      const cached = signatureCache.getCachedSignature(wallet.address, purpose);
      if (cached && cached.signature && cached.message) {
        setSignature(cached.signature);
        setMessage(cached.message);
        updateRemainingTime();
        return cached;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[useCachedSignature] Generating new signature for', purpose);

      // Step 1: Get signature message from API
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }

      const signatureMessage = messageResponse.data.message;

      if (!mountedRef.current) return null;

      // Step 2: Sign the message
      const signedData = await signMessage(signatureMessage, wallet);
      
      if (!mountedRef.current) return null;

      // Step 3: Cache the signature
      const cached = signatureCache.cacheSignature(
        wallet.address,
        signedData.signature,
        signedData.message,
        purpose,
        wallet.type || 'okx'
      );

      // Update state
      setSignature(signedData.signature);
      setMessage(signedData.message);
      updateRemainingTime();

      console.log('[useCachedSignature] New signature generated and cached');
      return cached;

    } catch (err) {
      console.error('[useCachedSignature] Error generating signature:', err);
      
      if (err.code === 4001 || err.message?.includes('rejected')) {
        setError('Signature request rejected by user');
      } else {
        setError(err.message || 'Failed to generate signature');
      }
      
      throw err;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [wallet, purpose, updateRemainingTime]);

  /**
   * Ensure we have a valid signature (from cache or generate new)
   */
  const ensureSignature = useCallback(async () => {
    // Check if current signature is valid
    if (signature && message && remainingTime > 0) {
      return { signature, message };
    }

    // Try to get from cache
    const cached = signatureCache.getCachedSignature(wallet.address, purpose);
    if (cached && cached.signature && cached.message) {
      setSignature(cached.signature);
      setMessage(cached.message);
      updateRemainingTime();
      return cached;
    }

    // Generate new signature
    return generateSignature();
  }, [signature, message, remainingTime, wallet.address, purpose, generateSignature, updateRemainingTime]);

  /**
   * Clear cache for this purpose
   */
  const clearCache = useCallback(() => {
    if (wallet.address) {
      signatureCache.clearCacheForPurpose(wallet.address, purpose);
      setSignature(null);
      setMessage(null);
      setRemainingTime(0);
    }
  }, [wallet.address, purpose]);

  /**
   * Refresh signature (force new)
   */
  const refreshSignature = useCallback(async () => {
    clearCache();
    return generateSignature(true);
  }, [clearCache, generateSignature]);

  return {
    signature,
    message,
    isLoading,
    error,
    remainingTime,
    remainingTimeFormatted: wallet.address ? 
      signatureCache.formatRemainingTime(wallet.address, purpose) : 
      'N/A',
    generateSignature,
    ensureSignature,
    refreshSignature,
    clearCache,
    isValid: remainingTime > 0 && !!signature && !!message,
    walletAddress: wallet.address,
    walletType: wallet.type || 'okx'
  };
}

// Re-export for compatibility
export default useCachedSignature;
