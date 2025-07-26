//src/components/wallet/WalletProvider.js
'use client';

import React, { createContext, useState, useEffect, useCallback } from 'react';

// Create a context for wallet data
export const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [wallet, setWallet] = useState({
    connected: false,
    address: null,
    provider: null,
    chainId: null,
    isConnecting: false,
    error: null
  });

  // Initialize wallet connection when browser loads
  useEffect(() => {
    const checkExistingConnection = async () => {
      // Check if OKX wallet is available
      if (typeof window !== 'undefined' && window.okxwallet) {
        try {
          // Check if already connected
          const accounts = await window.okxwallet.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            const chainId = await window.okxwallet.request({ method: 'eth_chainId' });
            setWallet({
              connected: true,
              address: accounts[0],
              provider: window.okxwallet,
              chainId,
              isConnecting: false,
              error: null
            });
          }
        } catch (error) {
          console.error('Failed to check existing connection:', error);
        }
      }
    };

    checkExistingConnection();
  }, []);

  // Connect wallet function
  const connectWallet = useCallback(async () => {
    if (typeof window === 'undefined') return;

    setWallet(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Check if OKX wallet is installed
      if (!window.okxwallet) {
        throw new Error('OKX Wallet is not installed. Please install it from the OKX website.');
      }

      // Request account access
      const accounts = await window.okxwallet.request({ method: 'eth_requestAccounts' });
      const chainId = await window.okxwallet.request({ method: 'eth_chainId' });

      setWallet({
        connected: true,
        address: accounts[0],
        provider: window.okxwallet,
        chainId,
        isConnecting: false,
        error: null
      });

      // Setup listener for account changes
      window.okxwallet.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          // User disconnected their wallet
          disconnectWallet();
        } else {
          // User switched accounts
          setWallet(prev => ({
            ...prev,
            address: accounts[0]
          }));
        }
      });

      // Setup listener for chain changes
      window.okxwallet.on('chainChanged', (chainId) => {
        setWallet(prev => ({
          ...prev,
          chainId
        }));
      });

    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setWallet(prev => ({
        ...prev,
        connected: false,
        isConnecting: false,
        error: error.message || 'Failed to connect wallet'
      }));
    }
  }, []);

  // Disconnect wallet function
  const disconnectWallet = useCallback(() => {
    // Note: Most wallets don't provide a direct disconnect method
    // We simply clear the local state
    setWallet({
      connected: false,
      address: null,
      provider: null,
      chainId: null,
      isConnecting: false,
      error: null
    });
  }, []);

  // Create the value object for the context
  const value = {
    wallet,
    connectWallet,
    disconnectWallet
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

// Custom hook to use the wallet context
export function useWallet() {
  const context = React.useContext(WalletContext);
  if (context === null) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
