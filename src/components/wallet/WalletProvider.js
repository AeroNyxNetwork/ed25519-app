/**
 * ============================================
 * File: src/components/wallet/WalletProvider.js
 * ============================================
 * Ethereum/OKX Wallet Provider for AeroNyx Platform
 * 
 * Purpose: Manage Ethereum-compatible wallet connections (OKX, MetaMask)
 * Main Functionality: Handle wallet connection, disconnection, and state persistence
 * Dependencies: No external wallet libraries needed - uses browser wallet APIs
 * 
 * Main Logical Flow:
 * 1. Check localStorage for previous wallet connection on mount
 * 2. Auto-reconnect if wallet was previously connected
 * 3. Maintain loading state during reconnection to prevent premature redirects
 * 4. Persist wallet state to localStorage on connection/disconnection
 * 
 * ⚠️ Important Notes:
 * - Works with OKX Wallet and MetaMask via window.okxwallet/window.ethereum
 * - The isInitializing state prevents redirects during wallet restoration
 * - localStorage keys must remain consistent for persistence
 * - Auto-reconnect logic must complete before authentication checks
 * 
 * Last Modified: v4.0.0 - Ethereum/OKX wallet implementation without external dependencies
 * ============================================
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

// Constants for localStorage keys
const STORAGE_KEYS = {
  WALLET_NAME: 'aeronyx_wallet_name',
  WALLET_ADDRESS: 'aeronyx_wallet_address',
  WALLET_CONNECTED: 'aeronyx_wallet_connected',
  WALLET_TYPE: 'aeronyx_wallet_type',
  LAST_CONNECTION: 'aeronyx_last_connection'
};

// Create the context
const WalletContext = createContext(null);

/**
 * Detect available wallet provider
 */
function detectWalletProvider() {
  if (typeof window === 'undefined') return null;
  
  if (window.okxwallet) {
    console.log('[WalletProvider] OKX Wallet detected');
    return { provider: window.okxwallet, type: 'okx', name: 'OKX Wallet' };
  }
  
  if (window.ethereum) {
    if (window.ethereum.isMetaMask) {
      console.log('[WalletProvider] MetaMask detected');
      return { provider: window.ethereum, type: 'metamask', name: 'MetaMask' };
    }
    console.log('[WalletProvider] Generic Ethereum wallet detected');
    return { provider: window.ethereum, type: 'ethereum', name: 'Ethereum Wallet' };
  }
  
  return null;
}

/**
 * Main Wallet Provider Component
 */
export function WalletProvider({ children }) {
  // Wallet state
  const [wallet, setWallet] = useState({
    connected: false,
    address: null,
    balance: null,
    network: null,
    chainId: null,
    type: null,
    name: null,
    provider: null,
    isInitializing: true,
    isReconnecting: false
  });

  // Error state
  const [error, setError] = useState(null);

  /**
   * Clear stored wallet data
   */
  const clearStoredWalletData = useCallback(() => {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    console.log('[WalletProvider] Cleared stored wallet data');
  }, []);

  /**
   * Get wallet balance
   */
  const fetchBalance = useCallback(async (address, provider) => {
    if (!address || !provider) return;
    
    try {
      const balance = await provider.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });
      
      // Convert from hex wei to ether
      const balanceInWei = parseInt(balance, 16);
      const balanceInEther = balanceInWei / 1e18;
      
      setWallet(prev => ({
        ...prev,
        balance: balanceInEther.toFixed(4)
      }));
    } catch (error) {
      console.error('[WalletProvider] Error fetching balance:', error);
    }
  }, []);

  /**
   * Get network information
   */
  const fetchNetworkInfo = useCallback(async (provider) => {
    if (!provider) return;
    
    try {
      const chainId = await provider.request({ method: 'eth_chainId' });
      const chainIdNum = parseInt(chainId, 16);
      
      let networkName = 'Unknown';
      switch (chainIdNum) {
        case 1:
          networkName = 'Ethereum Mainnet';
          break;
        case 5:
          networkName = 'Goerli Testnet';
          break;
        case 11155111:
          networkName = 'Sepolia Testnet';
          break;
        case 137:
          networkName = 'Polygon Mainnet';
          break;
        case 80001:
          networkName = 'Polygon Mumbai';
          break;
        case 56:
          networkName = 'BSC Mainnet';
          break;
        case 97:
          networkName = 'BSC Testnet';
          break;
        default:
          networkName = `Chain ID: ${chainIdNum}`;
      }
      
      setWallet(prev => ({
        ...prev,
        chainId: chainIdNum,
        network: networkName
      }));
    } catch (error) {
      console.error('[WalletProvider] Error fetching network info:', error);
    }
  }, []);

  /**
   * Handle account changes
   */
  const handleAccountsChanged = useCallback((accounts) => {
    console.log('[WalletProvider] Accounts changed:', accounts);
    
    if (accounts.length === 0) {
      // User disconnected wallet
      console.log('[WalletProvider] Wallet disconnected by user');
      clearStoredWalletData();
      setWallet(prev => ({
        ...prev,
        connected: false,
        address: null,
        balance: null,
        isInitializing: false,
        isReconnecting: false
      }));
    } else {
      // Account changed
      const newAddress = accounts[0].toLowerCase();
      console.log('[WalletProvider] Account changed to:', newAddress);
      
      setWallet(prev => ({
        ...prev,
        address: newAddress,
        connected: true
      }));
      
      // Update stored address
      localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, newAddress);
      
      // Fetch new balance
      const walletInfo = detectWalletProvider();
      if (walletInfo) {
        fetchBalance(newAddress, walletInfo.provider);
      }
    }
  }, [clearStoredWalletData, fetchBalance]);

  /**
   * Handle chain changes
   */
  const handleChainChanged = useCallback((chainId) => {
    console.log('[WalletProvider] Chain changed:', chainId);
    // Reload the page as recommended by MetaMask
    window.location.reload();
  }, []);

  /**
   * Setup wallet event listeners
   */
  const setupEventListeners = useCallback((provider) => {
    if (!provider) return;
    
    // Remove existing listeners first
    if (provider.removeListener) {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('chainChanged', handleChainChanged);
    }
    
    // Add new listeners
    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);
    
    console.log('[WalletProvider] Event listeners setup');
  }, [handleAccountsChanged, handleChainChanged]);

  /**
   * Connect wallet
   */
  const connectWallet = useCallback(async () => {
    try {
      setError(null);
      console.log('[WalletProvider] Connecting wallet...');
      
      const walletInfo = detectWalletProvider();
      
      if (!walletInfo) {
        throw new Error('No wallet detected. Please install OKX Wallet or MetaMask.');
      }
      
      const { provider, type, name } = walletInfo;
      
      // Request account access
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      
      if (accounts.length === 0) {
        throw new Error('No accounts found. Please unlock your wallet.');
      }
      
      const address = accounts[0].toLowerCase();
      console.log('[WalletProvider] Connected to:', address);
      
      // Store connection info
      localStorage.setItem(STORAGE_KEYS.WALLET_NAME, name);
      localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, address);
      localStorage.setItem(STORAGE_KEYS.WALLET_CONNECTED, 'true');
      localStorage.setItem(STORAGE_KEYS.WALLET_TYPE, type);
      localStorage.setItem(STORAGE_KEYS.LAST_CONNECTION, new Date().toISOString());
      
      // Update state
      setWallet({
        connected: true,
        address,
        balance: null,
        network: null,
        chainId: null,
        type,
        name,
        provider,
        isInitializing: false,
        isReconnecting: false
      });
      
      // Setup event listeners
      setupEventListeners(provider);
      
      // Fetch additional info
      await fetchBalance(address, provider);
      await fetchNetworkInfo(provider);
      
      return address;
      
    } catch (error) {
      console.error('[WalletProvider] Connection error:', error);
      setError(error.message || 'Failed to connect wallet');
      
      setWallet(prev => ({
        ...prev,
        connected: false,
        isInitializing: false,
        isReconnecting: false
      }));
      
      throw error;
    }
  }, [setupEventListeners, fetchBalance, fetchNetworkInfo]);

  /**
   * Disconnect wallet
   */
  const disconnectWallet = useCallback(async () => {
    try {
      console.log('[WalletProvider] Disconnecting wallet...');
      
      // Clear stored data
      clearStoredWalletData();
      
      // Remove event listeners
      if (wallet.provider && wallet.provider.removeListener) {
        wallet.provider.removeListener('accountsChanged', handleAccountsChanged);
        wallet.provider.removeListener('chainChanged', handleChainChanged);
      }
      
      // Reset state
      setWallet({
        connected: false,
        address: null,
        balance: null,
        network: null,
        chainId: null,
        type: null,
        name: null,
        provider: null,
        isInitializing: false,
        isReconnecting: false
      });
      
      setError(null);
      
    } catch (error) {
      console.error('[WalletProvider] Disconnect error:', error);
    }
  }, [wallet.provider, clearStoredWalletData, handleAccountsChanged, handleChainChanged]);

  /**
   * Sign message
   */
  const signMessage = useCallback(async (message) => {
    if (!wallet.connected || !wallet.address || !wallet.provider) {
      throw new Error('Wallet not connected');
    }
    
    try {
      const signature = await wallet.provider.request({
        method: 'personal_sign',
        params: [message, wallet.address]
      });
      
      return signature;
    } catch (error) {
      console.error('[WalletProvider] Sign message error:', error);
      throw error;
    }
  }, [wallet]);

  /**
   * Check for previous connection on mount
   */
  useEffect(() => {
    const checkPreviousConnection = async () => {
      console.log('[WalletProvider] Checking for previous connection...');
      
      try {
        const storedType = localStorage.getItem(STORAGE_KEYS.WALLET_TYPE);
        const storedAddress = localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESS);
        const wasConnected = localStorage.getItem(STORAGE_KEYS.WALLET_CONNECTED) === 'true';
        const lastConnection = localStorage.getItem(STORAGE_KEYS.LAST_CONNECTION);
        
        console.log('[WalletProvider] Stored wallet data:', {
          type: storedType,
          address: storedAddress,
          wasConnected,
          lastConnection
        });
        
        if (wasConnected && storedType && storedAddress) {
          const lastConnectionTime = lastConnection ? new Date(lastConnection).getTime() : 0;
          const hoursSinceLastConnection = (Date.now() - lastConnectionTime) / (1000 * 60 * 60);
          
          // Auto-reconnect if last connection was within 24 hours
          if (hoursSinceLastConnection < 24) {
            console.log('[WalletProvider] Attempting auto-reconnect...');
            
            setWallet(prev => ({
              ...prev,
              isReconnecting: true
            }));
            
            const walletInfo = detectWalletProvider();
            
            if (walletInfo && walletInfo.type === storedType) {
              try {
                const { provider, type, name } = walletInfo;
                
                // Check if already connected
                const accounts = await provider.request({ method: 'eth_accounts' });
                
                if (accounts.length > 0 && accounts[0].toLowerCase() === storedAddress) {
                  console.log('[WalletProvider] Auto-reconnect successful');
                  
                  setWallet({
                    connected: true,
                    address: storedAddress,
                    balance: null,
                    network: null,
                    chainId: null,
                    type,
                    name,
                    provider,
                    isInitializing: false,
                    isReconnecting: false
                  });
                  
                  // Setup event listeners
                  setupEventListeners(provider);
                  
                  // Fetch additional info
                  await fetchBalance(storedAddress, provider);
                  await fetchNetworkInfo(provider);
                } else {
                  console.log('[WalletProvider] Wallet not connected or address mismatch');
                  clearStoredWalletData();
                }
              } catch (error) {
                console.error('[WalletProvider] Auto-reconnect failed:', error);
                clearStoredWalletData();
              }
            } else {
              console.log('[WalletProvider] Wallet type mismatch or not found');
              clearStoredWalletData();
            }
          } else {
            console.log('[WalletProvider] Last connection too old, clearing stored data');
            clearStoredWalletData();
          }
        }
      } catch (error) {
        console.error('[WalletProvider] Error checking previous connection:', error);
      } finally {
        // Mark initialization as complete
        setTimeout(() => {
          setWallet(prev => ({
            ...prev,
            isInitializing: false,
            isReconnecting: false
          }));
          console.log('[WalletProvider] Initialization complete');
        }, 500);
      }
    };
    
    checkPreviousConnection();
  }, [clearStoredWalletData, setupEventListeners, fetchBalance, fetchNetworkInfo]);

  // Context value
  const value = useMemo(() => ({
    wallet,
    connectWallet,
    disconnectWallet,
    signMessage,
    error,
    isInitializing: wallet.isInitializing,
    isReconnecting: wallet.isReconnecting
  }), [wallet, connectWallet, disconnectWallet, signMessage, error]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

// Custom hook to use wallet context
export function useWallet() {
  const context = useContext(WalletContext);
  
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  
  return context;
}

// Export storage keys for use in other components if needed
export { STORAGE_KEYS };

// Export default for compatibility
export default WalletProvider;
