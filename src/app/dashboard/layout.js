/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Dashboard Layout Component - provides consistent header and footer
 * Modification Reason: Remove network stats navigation link as that feature is removed
 * Main Functionality: Consistent navigation and layout for dashboard pages
 * Dependencies: Next.js navigation, Framer Motion, ConnectWallet component
 *
 * Main Logical Flow:
 * 1. Render consistent header with navigation
 * 2. Wrap children content with background effects
 * 3. Display footer with copyright information
 *
 * ⚠️ Important Note for Next Developer:
 * - Navigation items are configured in navItems array
 * - Background effects are essential for visual consistency
 * - ConnectWallet component manages wallet connection state
 *
 * Last Modified: v2.1.0 - Removed network stats navigation link
 * ============================================
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Home, Server, Plus } from 'lucide-react';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import ConnectWallet from '../../components/wallet/ConnectWallet';
import Logo from '../../components/common/Logo';

/**
 * Navigation items configuration
 * Removed Network Stats as it's no longer functional
 */
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/dashboard/nodes', label: 'My Nodes', icon: Server },
  { href: '/dashboard/register', label: 'Register Node', icon: Plus }
];

/**
 * Dashboard Layout Component
 */
export default function DashboardLayout({ children }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      {/* Header */}
      <header className="relative z-50 bg-black/50 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/dashboard">
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

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                
                return (
                  <Link key={item.href} href={item.href}>
                    <motion.a
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={clsx(
                        "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-gray-400 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </motion.a>
                  </Link>
                );
              })}
            </nav>

            {/* Wallet */}
            <ConnectWallet />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative z-10 bg-black/50 backdrop-blur-md border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Logo className="w-8 h-8" />
              <span className="text-sm text-gray-400">
                © {new Date().getFullYear()} AeroNyx Network. All rights reserved.
              </span>
            </div>
            
            <div className="flex items-center gap-6">
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
              <Link href="https://support.aeronyx.com">
                <motion.a
                  whileHover={{ scale: 1.05 }}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Support
                </motion.a>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
