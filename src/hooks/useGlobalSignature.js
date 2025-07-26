/**
 * useGlobalSignature Hook
 * 
 * File Path: src/hooks/useGlobalSignature.js
 * 
 * React hook for accessing the global signature manager
 * Ensures only one signature is generated every 10 minutes
 * across the entire application
 * 
 * @version 1.0.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import globalSignatureManager from '../lib/utils/globalSignatureManager';

export function useGlobalSignature() {
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

  // Update remaining time
  const updateRemainingTime = useCallback(() => {
    const remaining = globalSignatureManager.getRemainingTime();
    setRemainingTime(remaining);
    
    if (remaining <= 0 && signature) {
      // Signature expired, clear state
      setSignature(null);
      setMessage(null);
    }
  }, [signature]);

  // Listen to signature manager events
  useEffect(() => {
    const handleEvent = (event, data) => {
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
            updateRemainingTime();
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

    globalSignatureManager.addListener(handleEvent);
    
    return () => {
      globalSignatureManager.removeListener(handleEvent);
    };
  }, [wallet.address, updateRemainingTime]);

  // Initialize state from manager
  useEffect(() => {
    if (!wallet.connected || !wallet.address) {
      setSignature(null);
      setMessage(null);
      setRemainingTime(0);
      return;
    }

    // Check if manager has valid signature for current wallet
    if (globalSignatureManager.isValid() && 
        globalSignatureManager.walletAddress === wallet.address.toLowerCase()) {
      setSignature(globalSignatureManager.signature);
      setMessage(globalSignatureManager.message);
      updateRemainingTime();
    }
  }, [wallet.connected, wallet.address, updateRemainingTime]);

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
   * Ensure we have a valid signature
   */
  const ensureSignature = useCallback(async () => {
    if (!wallet.connected || !wallet.address) {
      setError('Wallet not connected');
      return null;
    }

    try {
      const signatureData = await globalSignatureManager.getSignature(wallet);
      
      if (!mountedRef.current) return null;

      setSignature(signatureData.signature);
      setMessage(signatureData.message);
      updateRemainingTime();

      return signatureData;

    } catch (err) {
      console.error('[useGlobalSignature] Error:', err);
      
      if (!mountedRef.current) return null;

      if (err.code === 4001 || err.message?.includes('rejected')) {
        setError('Signature request rejected by user');
      } else {
        setError(err.message || 'Failed to generate signature');
      }
      
      throw err;
    }
  }, [wallet, updateRemainingTime]);

  /**
   * Force refresh signature (clear and regenerate)
   */
  const refreshSignature = useCallback(async () => {
    globalSignatureManager.clear();
    return ensureSignature();
  }, [ensureSignature]);

  /**
   * Clear signature (on wallet disconnect)
   */
  const clearSignature = useCallback(() => {
    if (wallet.address && 
        globalSignatureManager.walletAddress === wallet.address.toLowerCase()) {
      globalSignatureManager.clear();
    }
  }, [wallet.address]);

  return {
    signature,
    message,
    isLoading,
    error,
    remainingTime,
    remainingTimeFormatted: globalSignatureManager.getFormattedRemainingTime(),
    ensureSignature,
    refreshSignature,
    clearSignature,
    isValid: remainingTime > 0 && !!signature && !!message,
    walletAddress: wallet.address,
    walletType: wallet.type || 'okx'
  };
}

// Export as default for compatibility
export default useGlobalSignature;
