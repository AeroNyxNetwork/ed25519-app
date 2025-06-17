/**
 * React Hook for Wallet Signature with Caching
 * 
 * Prevents repeated signature requests
 * 
 * @version 1.0.0
 */

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../components/wallet/WalletProvider';
import { signatureCacheService } from '../lib/services/SignatureCacheService';
import nodeRegistrationCachedService from '../lib/api/nodeRegistrationCached';
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
      const result = await signatureCacheService.getOrGenerateSignature(
        wallet.address,
        async () => {
          const messageResponse = await nodeRegistrationCachedService.generateSignatureMessage(wallet.address);
          
          if (!messageResponse.success) {
            throw new Error(messageResponse.message || 'Failed to generate signature message');
          }

          const message = messageResponse.data.message;
          const formattedMessage = formatMessageForSigning(message);
          const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);

          return { signature, message };
        },
        action
      );

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
      signatureCacheService.clearWalletCache(wallet.address);
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
