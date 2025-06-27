/**
 * Simplified Header Component for Non-Dashboard Pages
 * 
 * File Path: src/components/layout/Header.js
 * 
 * Only used on landing page, not in dashboard
 * 
 * @version 2.0.0
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import ConnectWallet from '../wallet/ConnectWallet';
import Logo from '../common/Logo';

export default function Header() {
  return (
    <header className="relative z-50 bg-black/50 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/">
            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-3"
            >
              <Logo className="w-10 h-10" />
              <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                AeroNyx
              </span>
            </motion.a>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-6">
              <Link href="https://docs.aeronyx.network">
                <motion.a
                  whileHover={{ scale: 1.05 }}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Documentation
                </motion.a>
              </Link>
            </nav>
            <ConnectWallet />
          </div>
        </div>
      </div>
    </header>
  );
}
