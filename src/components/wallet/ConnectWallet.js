/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Wallet Connection Component
 * Modification Reason: Update UI to match modern glassmorphic design system
 * Main Functionality: Handle wallet connection/disconnection with elegant UI
 * Dependencies: WalletProvider, framer-motion, lucide-react
 *
 * Design Philosophy:
 * 1. Glassmorphic design matching dashboard aesthetic
 * 2. Smooth animations and micro-interactions
 * 3. Clear visual feedback for all states
 * 4. Mobile-responsive design
 *
 * ⚠️ Important Note for Next Developer:
 * - This component uses framer-motion for animations
 * - Dropdown uses click-outside detection for better UX
 * - Error states are displayed as toasts
 *
 * Last Modified: v2.0.0 - Complete UI redesign with glassmorphic style
 * ============================================
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, 
  ChevronDown, 
  LogOut, 
  Copy, 
  CheckCircle,
  ExternalLink,
  AlertCircle,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';
import { useWallet } from './WalletProvider';

export default function ConnectWallet() {
  const { wallet, connectWallet, disconnectWallet } = useWallet();
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef(null);

  // Format address for display
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Copy address to clipboard
  const copyAddress = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle disconnect
  const handleDisconnect = () => {
    disconnectWallet();
    setShowDropdown(false);
  };

  // View on explorer (example with Etherscan)
  const viewOnExplorer = () => {
    if (wallet.address) {
      window.open(`https://etherscan.io/address/${wallet.address}`, '_blank');
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {wallet.connected ? (
        <>
          {/* Connected State Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowDropdown(!showDropdown)}
            className={clsx(
              "flex items-center gap-2.5 px-4 py-2.5 rounded-xl",
              "bg-white/5 backdrop-blur-md border border-white/10",
              "hover:bg-white/10 hover:border-white/20",
              "transition-all duration-200",
              "group"
            )}
          >
            {/* Wallet Icon with Status */}
            <div className="relative">
              <Wallet className="w-4 h-4 text-white" />
              <div className="absolute -bottom-1 -right-1">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping" />
              </div>
            </div>
            
            {/* Address */}
            <span className="text-sm font-medium text-white">
              {formatAddress(wallet.address)}
            </span>
            
            {/* Chevron */}
            <ChevronDown className={clsx(
              "w-4 h-4 text-gray-400 transition-transform duration-200",
              showDropdown && "rotate-180"
            )} />
          </motion.button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className={clsx(
                  "absolute right-0 mt-2 w-72",
                  "bg-black/90 backdrop-blur-xl",
                  "border border-white/10 rounded-2xl",
                  "shadow-2xl shadow-black/50",
                  "overflow-hidden",
                  "z-50"
                )}
              >
                {/* Header */}
                <div className="p-4 border-b border-white/10 bg-gradient-to-r from-purple-600/10 to-blue-600/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">Connected Account</span>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs text-green-400">Active</span>
                    </div>
                  </div>
                  <div className="font-mono text-sm text-white break-all">
                    {wallet.address}
                  </div>
                </div>

                {/* Actions */}
                <div className="p-2">
                  {/* Copy Address */}
                  <motion.button
                    whileHover={{ x: 4 }}
                    onClick={copyAddress}
                    className={clsx(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg",
                      "text-sm text-gray-300 hover:text-white",
                      "hover:bg-white/5 transition-all",
                      "group"
                    )}
                  >
                    {copied ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400 group-hover:text-white" />
                    )}
                    <span>{copied ? 'Copied!' : 'Copy Address'}</span>
                  </motion.button>

                  {/* View on Explorer */}
                  <motion.button
                    whileHover={{ x: 4 }}
                    onClick={viewOnExplorer}
                    className={clsx(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg",
                      "text-sm text-gray-300 hover:text-white",
                      "hover:bg-white/5 transition-all",
                      "group"
                    )}
                  >
                    <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-white" />
                    <span>View on Explorer</span>
                  </motion.button>

                  {/* Divider */}
                  <div className="my-2 border-t border-white/10" />

                  {/* Disconnect */}
                  <motion.button
                    whileHover={{ x: 4 }}
                    onClick={handleDisconnect}
                    className={clsx(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg",
                      "text-sm text-red-400 hover:text-red-300",
                      "hover:bg-red-500/10 transition-all",
                      "group"
                    )}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Disconnect</span>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        /* Disconnected State Button */
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={connectWallet}
          disabled={wallet.isConnecting}
          className={clsx(
            "flex items-center gap-2.5 px-5 py-2.5 rounded-xl",
            "bg-gradient-to-r from-purple-600 to-blue-600",
            "hover:from-purple-700 hover:to-blue-700",
            "text-white font-medium text-sm",
            "shadow-lg shadow-purple-500/25",
            "transition-all duration-200",
            wallet.isConnecting && "opacity-75 cursor-not-allowed"
          )}
        >
          {wallet.isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet</span>
            </>
          )}
        </motion.button>
      )}

      {/* Error Toast */}
      <AnimatePresence>
        {wallet.error && (
          <motion.div
            initial={{ opacity: 0, y: 10, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 10, x: '-50%' }}
            className={clsx(
              "absolute left-1/2 mt-2 w-80",
              "bg-red-500/10 backdrop-blur-xl",
              "border border-red-500/20 rounded-xl",
              "p-3 shadow-2xl",
              "z-50"
            )}
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">Connection Error</p>
                <p className="text-xs text-red-300/80 mt-1">{wallet.error}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Alternative Minimal Version for Mobile
 */
export function ConnectWalletMobile() {
  const { wallet, connectWallet, disconnectWallet } = useWallet();
  
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 4)}...${address.substring(address.length - 3)}`;
  };

  if (wallet.connected) {
    return (
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={disconnectWallet}
        className={clsx(
          "flex items-center gap-2 px-3 py-2 rounded-lg",
          "bg-white/5 backdrop-blur-md border border-white/10",
          "text-xs font-medium text-white"
        )}
      >
        <div className="relative">
          <Wallet className="w-3.5 h-3.5" />
          <div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full" />
        </div>
        <span>{formatAddress(wallet.address)}</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={connectWallet}
      disabled={wallet.isConnecting}
      className={clsx(
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-gradient-to-r from-purple-600 to-blue-600",
        "text-white font-medium text-xs",
        wallet.isConnecting && "opacity-75"
      )}
    >
      {wallet.isConnecting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Wallet className="w-3.5 h-3.5" />
      )}
      <span>{wallet.isConnecting ? 'Connecting' : 'Connect'}</span>
    </motion.button>
  );
}
