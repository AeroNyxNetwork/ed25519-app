/**
 * React Hook for Wallet Signature with Enhanced Caching
 * 
 * File Path: src/hooks/useSignature.js
 * 
 * Final version with proper error handling and caching
 * 
 * @version 4.0.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import { cacheService, CacheNamespace } from '../lib/services/CacheService';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { signMessage } from '../lib/utils/walletSignature';

// Global signature store to prevent multiple requests
const signatureStore = new Map();
const pendingRequests = new Map();

// Constants
const SIGNATURE_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export function useSignature(context = 'default') {
  const { wallet } = useWallet();
  const [state, setState] = useState({
    signature: null,
    message: null,
    isLoading: false,
    error: null
  });
  
  const mountedRef = useRef(true);
  const attemptCountRef = useRef(0);

  const generateSignature = useCallback(async () => {
    if (!wallet.connected || !wallet.address) {
      setState(prev => ({ ...prev, error: 'Wallet not connected' }));
      return null;
    }

    // Check if we already have a signature for this wallet
    const storeKey = wallet.address.toLowerCase();
    const existingSignature = signatureStore.get(storeKey);
    
    if (existingSignature) {
      if (mountedRef.current) {
        setState({
          signature: existingSignature.signature,
          message: existingSignature.message,
          isLoading: false,
          error: null
        });
      }
      return existingSignature;
    }

    // Check if there's already a pending request for this wallet
    const pendingRequest = pendingRequests.get(storeKey);
    if (pendingRequest) {
      try {
        const result = await pendingRequest;
        if (mountedRef.current) {
          setState({
            signature: result.signature,
            message: result.message,
            isLoading: false,
            error: null
          });
        }
        return result;
      } catch (err) {
        if (mountedRef.current) {
          setState(prev => ({ ...prev, error: err.message }));
        }
        return null;
      }
    }

    // Limit retry attempts
    if (attemptCountRef.current >= 3) {
      setState(prev => ({ ...prev, error: 'Maximum signature attempts exceeded' }));
      return null;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    // Create a new promise for this signature request
    const signaturePromise = (async () => {
      try {
        attemptCountRef.current++;
        
        // Check cache first
        const cacheKey = cacheService.generateKey('signature', storeKey, 'global');
        const cachedSignature = cacheService.get(CacheNamespace.SIGNATURE, cacheKey);
        
        if (cachedSignature && cachedSignature.signature && cachedSignature.message) {
          signatureStore.set(storeKey, cachedSignature);
          return cachedSignature;
        }

        // Generate new signature
        console.log('[useSignature] Generating new signature for:', storeKey);
        
        const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
        
        if (!messageResponse.success) {
          throw new Error(messageResponse.message || 'Failed to generate signature message');
        }

        const message = messageResponse.data.message;
        
        // Sign the message
        const signatureValue = await signMessage(wallet.provider, message, wallet.address);

        const result = { 
          signature: signatureValue, 
          message: message,
          timestamp: Date.now()
        };
        
        // Store in all caches
        signatureStore.set(storeKey, result);
        cacheService.set(CacheNamespace.SIGNATURE, cacheKey, result, SIGNATURE_CACHE_DURATION);
        
        console.log('[useSignature] Signature generated and cached successfully');

        return result;
      } catch (err) {
        console.error('[useSignature] Error generating signature:', err);
        // Clear from pending on error
        pendingRequests.delete(storeKey);
        throw err;
      }
    })();

    // Store the pending request
    pendingRequests.set(storeKey, signaturePromise);

    try {
      const result = await signaturePromise;
      if (mountedRef.current) {
        setState({
          signature: result.signature,
          message: result.message,
          isLoading: false,
          error: null
        });
      }
      // Clear from pending after success
      pendingRequests.delete(storeKey);
      attemptCountRef.current = 0; // Reset attempts on success
      return result;
    } catch (err) {
      if (mountedRef.current) {
        setState({
          signature: null,
          message: null,
          isLoading: false,
          error: err.message || 'Failed to generate signature'
        });
      }
      return null;
    }
  }, [wallet.connected, wallet.address, wallet.provider]);

  // Check for existing signature on mount or wallet change
  useEffect(() => {
    mountedRef.current = true;
    attemptCountRef.current = 0;
    
    if (wallet.connected && wallet.address) {
      const storeKey = wallet.address.toLowerCase();
      const existingSignature = signatureStore.get(storeKey);
      
      if (existingSignature) {
        setState({
          signature: existingSignature.signature,
          message: existingSignature.message,
          isLoading: false,
          error: null
        });
      } else {
        // Try to load from cache
        const cacheKey = cacheService.generateKey('signature', storeKey, 'global');
        const cachedSignature = cacheService.get(CacheNamespace.SIGNATURE, cacheKey);
        
        if (cachedSignature && cachedSignature.signature && cachedSignature.message) {
          signatureStore.set(storeKey, cachedSignature);
          setState({
            signature: cachedSignature.signature,
            message: cachedSignature.message,
            isLoading: false,
            error: null
          });
        } else {
          // Generate new signature
          generateSignature();
        }
      }
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, [wallet.connected, wallet.address, generateSignature]);

  // Clear signature when wallet disconnects
  useEffect(() => {
    if (!wallet.connected) {
      const storeKey = wallet.address?.toLowerCase();
      if (storeKey) {
        signatureStore.delete(storeKey);
        pendingRequests.delete(storeKey);
        
        // Clear from cache
        const cacheKey = cacheService.generateKey('signature', storeKey, 'global');
        cacheService.delete(CacheNamespace.SIGNATURE, cacheKey);
      }
      
      setState({
        signature: null,
        message: null,
        isLoading: false,
        error: null
      });
      
      attemptCountRef.current = 0;
    }
  }, [wallet.connected, wallet.address]);

  return {
    signature: state.signature,
    message: state.message,
    isLoading: state.isLoading,
    error: state.error,
    regenerate: generateSignature
  };
}

/**
 * Utility to clear all signatures (for logout/cleanup)
 */
export function clearAllSignatures() {
  signatureStore.clear();
  pendingRequests.clear();
  
  // Clear all signature cache entries
  cacheService.clear(CacheNamespace.SIGNATURE);
}

/**
 * Utility to get cached signature without generating new one
 */
export function getCachedSignature(walletAddress) {
  if (!walletAddress) return null;
  
  const storeKey = walletAddress.toLowerCase();
  return signatureStore.get(storeKey) || null;
}
