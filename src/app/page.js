/**
 * ============================================
 * File: src/app/page.js
 * Path: src/app/page.js
 * ============================================
 * SIMPLIFIED VERSION - v5.0.0
 * 
 * Creation Reason: Root page - Direct login interface
 * Modification Reason: Remove marketing fluff, focus on utility
 * Main Functionality: Clean wallet connection interface
 * Dependencies: WalletProvider, Next.js router
 *
 * Design Philosophy:
 * - Professional tool = Direct login, no marketing
 * - Like GitHub/AWS Console/Datadog - straight to work
 * - VCs respect tools that don't waste time
 * - B2B infrastructure tools don't need landing pages
 *
 * Main Logical Flow:
 * 1. Show clean login interface
 * 2. User connects wallet
 * 3. Redirect to dashboard immediately
 * 4. That's it. No fluff.
 *
 * ⚠️ Important Note for Next Developer:
 * - This is NOT a marketing page
 * - Keep it minimal and professional
 * - Auto-redirect if already connected
 * - Think AWS Console, not consumer app
 *
 * Last Modified: v5.0.0 - Removed all marketing content
 * Previous Version: v4.0.0 - Had hero sections, features, CTAs (removed)
 * ============================================
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '../components/wallet/WalletProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Shield, Zap, ArrowRight, Loader2 } from 'lucide-react';

export default function Home() {
  const { wallet, connectWallet } = useWallet();
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);

  // Auto-redirect if already connected
  useEffect(() => {
    if (wallet.connected) {
      router.push('/dashboard');
    }
  }, [wallet.connected, router]);

  // Handle wallet connection
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await connectWallet();
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-blue-900/10" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[128px]" />
      </div>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md px-6"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Server className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            AeroNyx Network
          </h1>
          <p className="text-gray-400 text-sm">
            Infrastructure Management Platform
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">
            Connect to Continue
          </h2>

          {/* Connect Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl text-white font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                Connect Wallet
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </motion.button>

          {/* Info Pills */}
          <div className="mt-6 space-y-2">
            <InfoPill icon={Shield} text="Secure wallet authentication" />
            <InfoPill icon={Server} text="Monitor your infrastructure" />
            <InfoPill icon={Zap} text="Real-time diagnostics" />
          </div>

          {/* Footer Links */}
          <div className="mt-6 pt-6 border-t border-white/10 flex justify-center gap-6 text-sm">
            <a
              href="https://docs.aeronyx.network"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Documentation
            </a>
            <a
              href="https://support.aeronyx.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Support
            </a>
          </div>
        </div>

        {/* Bottom Note */}
        <p className="text-center text-xs text-gray-500 mt-6">
          Professional infrastructure management for Web3
        </p>
      </motion.div>
    </div>
  );
}

// Info Pill Component
function InfoPill({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <Icon className="w-4 h-4 text-gray-500" />
      <span>{text}</span>
    </div>
  );
}
