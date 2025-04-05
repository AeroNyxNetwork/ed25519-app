'use client';

import React, { useState } from 'react';
import { useWallet } from './WalletProvider';

export default function ConnectWallet() {
  const { wallet, connectWallet, disconnectWallet } = useWallet();
  const [showDropdown, setShowDropdown] = useState(false);

  // Format address to show only first 6 and last 4 characters
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const handleConnect = () => {
    connectWallet();
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setShowDropdown(false);
  };

  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
  };

  return (
    <div className="relative">
      {wallet.connected ? (
        <div>
          <button
            onClick={toggleDropdown}
            className="flex items-center gap-2 bg-primary-700 hover:bg-primary-600 text-white rounded-full py-2 px-4 transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4z" />
              <path d="M2 8v2a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2H4a2 2 0 00-2 2z" />
            </svg>
            <span>{formatAddress(wallet.address)}</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-background-50 rounded-lg shadow-lg z-10 border border-background-200">
              <div className="py-2 px-4 border-b border-background-200">
                <p className="text-sm text-gray-400">Connected as</p>
                <p className="font-mono text-sm truncate">{wallet.address}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={handleDisconnect}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-background-100 transition-colors"
                >
                  Disconnect Wallet
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={wallet.isConnecting}
          className={`flex items-center gap-2 bg-primary hover:bg-primary-600 text-white rounded-full py-2 px-4 transition-all duration-200 ${
            wallet.isConnecting ? 'opacity-75 cursor-not-allowed' : ''
          }`}
        >
          {wallet.isConnecting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4z" />
                <path d="M2 8v2a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2H4a2 2 0 00-2 2z" />
              </svg>
              Connect Wallet
            </>
          )}
        </button>
      )}

      {wallet.error && (
        <div className="absolute right-0 mt-2 w-64 bg-red-900/80 text-white p-3 rounded-lg text-sm">
          {wallet.error}
        </div>
      )}
    </div>
  );
}
