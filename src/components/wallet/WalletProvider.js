/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Core wallet management for Web3 integration
 * Modification Reason: Fix page refresh redirect issue by implementing persistent wallet connection
 * Main Functionality: Manages Solana wallet connection state across the application
 * Dependencies: @solana/wallet-adapter-react, localStorage for persistence
 *
 * Main Logical Flow:
 * 1. Check localStorage for previous wallet connection on mount
 * 2. Auto-reconnect if wallet was previously connected
 * 3. Maintain loading state during reconnection to prevent premature redirects
 * 4. Persist wallet state to localStorage on connection/disconnection
 *
 * ⚠️ Important Note for Next Developer:
 * - The isInitializing state is critical - it prevents redirects during wallet restoration
 * - localStorage keys must remain consistent for persistence to work
 * - Auto-reconnect logic must complete before authentication checks
 * - DO NOT remove the loading states as they prevent race conditions
 *
 * Last Modified: v3.0.0 - Added persistent connection with isInitializing state
 * ============================================
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ConnectionProvider, 
  WalletProvider as SolanaWalletProvider,
  useWallet as useSolanaWallet,
  useConnection
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

// Constants for localStorage keys
const STORAGE_KEYS = {
  WALLET_NAME: 'aeronyx_wallet_name',
  WALLET_ADDRESS: 'aeronyx_wallet_address',
  WALLET_CONNECTED: 'aeronyx_wallet_connected',
  LAST_CONNECTION: 'aeronyx_last_connection'
};

// Create the context
const WalletContext = createContext(null);

// Inner component that uses the Solana wallet hooks
function WalletContextProvider({ children }) {
  const solanaWallet = useSolanaWallet();
  const { connection } = useConnection();
  
  // Local state for wallet info with initialization tracking
  const [wallet, setWallet] = useState({
    connected: false,
    address: null,
    balance: null,
    network: 'mainnet-beta',
    isInitializing: true, // Critical: tracks if we're still checking for previous connection
    isReconnecting: false // Tracks active reconnection attempts
  });

  // Check for previous wallet connection on mount
  useEffect(() => {
    const checkPreviousConnection = async () => {
      console.log('[WalletProvider] Checking for previous wallet connection...');
      
      try {
        const storedWalletName = localStorage.getItem(STORAGE_KEYS.WALLET_NAME);
        const storedAddress = localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESS);
        const wasConnected = localStorage.getItem(STORAGE_KEYS.WALLET_CONNECTED) === 'true';
        const lastConnection = localStorage.getItem(STORAGE_KEYS.LAST_CONNECTION);
        
        console.log('[WalletProvider] Stored wallet data:', {
          walletName: storedWalletName,
          address: storedAddress,
          wasConnected,
          lastConnection
        });

        // Check if we should attempt auto-reconnect
        if (wasConnected && storedWalletName && !solanaWallet.connected) {
          const lastConnectionTime = lastConnection ? new Date(lastConnection).getTime() : 0;
          const hoursSinceLastConnection = (Date.now() - lastConnectionTime) / (1000 * 60 * 60);
          
          // Auto-reconnect if last connection was within 24 hours
          if (hoursSinceLastConnection < 24) {
            console.log('[WalletProvider] Attempting auto-reconnect...');
            
            setWallet(prev => ({
              ...prev,
              isReconnecting: true
            }));

            // Find the wallet adapter
            const walletToConnect = solanaWallet.wallets.find(
              w => w.adapter.name === storedWalletName
            );
            
            if (walletToConnect) {
              try {
                await solanaWallet.select(walletToConnect.adapter.name);
                // Give the wallet adapter time to initialize
                await new Promise(resolve => setTimeout(resolve, 500));
                
                if (solanaWallet.publicKey) {
                  console.log('[WalletProvider] Auto-reconnect successful');
                }
              } catch (error) {
                console.error('[WalletProvider] Auto-reconnect failed:', error);
                // Clear stored data if reconnection fails
                clearStoredWalletData();
              }
            }
          } else {
            console.log('[WalletProvider] Last connection too old, clearing stored data');
            clearStoredWalletData();
          }
        }
      } catch (error) {
        console.error('[WalletProvider] Error checking previous connection:', error);
      } finally {
        // Mark initialization as complete after a short delay
        // This ensures wallet adapters have time to initialize
        setTimeout(() => {
          setWallet(prev => ({
            ...prev,
            isInitializing: false,
            isReconnecting: false
          }));
          console.log('[WalletProvider] Initialization complete');
        }, 1000);
      }
    };

    checkPreviousConnection();
  }, []); // Only run once on mount

  // Update wallet state when Solana wallet changes
  useEffect(() => {
    if (solanaWallet.publicKey) {
      const address = solanaWallet.publicKey.toString();
      
      console.log('[WalletProvider] Wallet connected:', address);
      
      // Store wallet data for persistence
      localStorage.setItem(STORAGE_KEYS.WALLET_NAME, solanaWallet.wallet?.adapter.name || '');
      localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, address);
      localStorage.setItem(STORAGE_KEYS.WALLET_CONNECTED, 'true');
      localStorage.setItem(STORAGE_KEYS.LAST_CONNECTION, new Date().toISOString());
      
      setWallet(prev => ({
        ...prev,
        connected: true,
        address: address,
        isInitializing: false,
        isReconnecting: false
      }));
      
      // Fetch balance
      fetchBalance(address);
    } else if (!wallet.isInitializing && !wallet.isReconnecting) {
      // Only clear if we're not in the middle of initialization or reconnection
      console.log('[WalletProvider] Wallet disconnected');
      
      clearStoredWalletData();
      
      setWallet(prev => ({
        ...prev,
        connected: false,
        address: null,
        balance: null,
        isInitializing: false,
        isReconnecting: false
      }));
    }
  }, [solanaWallet.publicKey, wallet.isInitializing, wallet.isReconnecting]);

  // Clear stored wallet data
  const clearStoredWalletData = () => {
    localStorage.removeItem(STORAGE_KEYS.WALLET_NAME);
    localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
    localStorage.removeItem(STORAGE_KEYS.WALLET_CONNECTED);
    localStorage.removeItem(STORAGE_KEYS.LAST_CONNECTION);
  };

  // Fetch wallet balance
  const fetchBalance = async (address) => {
    try {
      const publicKey = solanaWallet.publicKey;
      if (publicKey && connection) {
        const balance = await connection.getBalance(publicKey);
        const solBalance = balance / 1e9; // Convert lamports to SOL
        
        setWallet(prev => ({
          ...prev,
          balance: solBalance.toFixed(4)
        }));
      }
    } catch (error) {
      console.error('[WalletProvider] Error fetching balance:', error);
    }
  };

  // Connect wallet function
  const connectWallet = useCallback(async () => {
    try {
      console.log('[WalletProvider] Connecting wallet...');
      
      if (!solanaWallet.wallet) {
        // If no wallet is selected, select Phantom by default
        const phantomWallet = solanaWallet.wallets.find(
          w => w.adapter.name === 'Phantom'
        );
        
        if (phantomWallet) {
          await solanaWallet.select(phantomWallet.adapter.name);
        } else {
          throw new Error('No wallet found. Please install Phantom wallet.');
        }
      }
      
      await solanaWallet.connect();
    } catch (error) {
      console.error('[WalletProvider] Error connecting wallet:', error);
      clearStoredWalletData();
      throw error;
    }
  }, [solanaWallet]);

  // Disconnect wallet function
  const disconnectWallet = useCallback(async () => {
    try {
      console.log('[WalletProvider] Disconnecting wallet...');
      
      await solanaWallet.disconnect();
      clearStoredWalletData();
      
      setWallet({
        connected: false,
        address: null,
        balance: null,
        network: 'mainnet-beta',
        isInitializing: false,
        isReconnecting: false
      });
    } catch (error) {
      console.error('[WalletProvider] Error disconnecting wallet:', error);
    }
  }, [solanaWallet]);

  // Sign message function
  const signMessage = useCallback(async (message) => {
    if (!solanaWallet.signMessage) {
      throw new Error('Wallet does not support message signing');
    }
    
    try {
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await solanaWallet.signMessage(encodedMessage);
      return Buffer.from(signature).toString('base64');
    } catch (error) {
      console.error('[WalletProvider] Error signing message:', error);
      throw error;
    }
  }, [solanaWallet]);

  // Context value
  const value = useMemo(() => ({
    wallet,
    connectWallet,
    disconnectWallet,
    signMessage,
    isInitializing: wallet.isInitializing,
    isReconnecting: wallet.isReconnecting,
    solanaWallet // Expose the underlying Solana wallet for advanced usage
  }), [wallet, connectWallet, disconnectWallet, signMessage, solanaWallet]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

// Main provider component
export function WalletProvider({ children }) {
  // Configure wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
      new LedgerWalletAdapter()
    ],
    []
  );

  // Use mainnet-beta by default
  const endpoint = useMemo(() => {
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet-beta';
    
    // Use custom RPC if provided
    if (process.env.NEXT_PUBLIC_SOLANA_RPC_URL) {
      return process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    }
    
    // Otherwise use default endpoints
    return clusterApiUrl(network);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <WalletContextProvider>
            {children}
          </WalletContextProvider>
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
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
