/**
 * React Hook for Wallet Signature with Caching
 * 
 * File Path: src/hooks/useSignature.js
 * 
 * Prevents repeated signature requests using the unified cache service
 * 
 * @version 2.0.0
 */

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import { cacheService, CacheNamespace } from '../lib/services/CacheService';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../lib/utils/walletSignature';

export function useSignature(action = 'default') {
  const { wallet } = useWallet();
  const [signature, setSignature] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateSignature = useCallback(async () => {
    if (!wallet.connected || !wallet.address) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check cache first
      const cacheKey = cacheService.generateKey('signature', wallet.address, action);
      const cachedSignature = cacheService.get(CacheNamespace.SIGNATURE, cacheKey);
      
      if (cachedSignature) {
        setSignature(cachedSignature);
        return cachedSignature;
      }

      // Generate new signature
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }

      const message = messageResponse.data.message;
      const formattedMessage = formatMessageForSigning(message);
      const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);

      const result = { signature, message };
      
      // Cache the signature
      cacheService.set(CacheNamespace.SIGNATURE, cacheKey, result, 10 * 60 * 1000); // 10 minutes

      setSignature(result);
      return result;
    } catch (err) {
      setError(err.message || 'Failed to generate signature');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [wallet.connected, wallet.address, wallet.provider, action]);

  // Auto-generate on mount if wallet connected
  useEffect(() => {
    if (wallet.connected && !signature) {
      generateSignature();
    }
  }, [wallet.connected, generateSignature, signature]);

  // Clear cache on wallet change
  useEffect(() => {
    if (!wallet.connected && signature) {
      setSignature(null);
      // Clear signature cache for this wallet
      const pattern = new RegExp(`signature:${wallet.address}:`);
      cacheService.clear(CacheNamespace.SIGNATURE, pattern);
    }
  }, [wallet.connected, wallet.address, signature]);

  return {
    signature: signature?.signature,
    message: signature?.message,
    isLoading,
    error,
    regenerate: generateSignature
  };
}
