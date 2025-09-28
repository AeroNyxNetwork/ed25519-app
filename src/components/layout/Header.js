/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Header Component for Landing Page
 * Modification Reason: Update to modern glassmorphic design with mobile support
 * Main Functionality: Navigation header with wallet connection
 * Dependencies: framer-motion, ConnectWallet, Logo components
 *
 * Design Philosophy:
 * 1. Consistent glassmorphic design
 * 2. Mobile-first responsive approach
 * 3. Smooth animations and transitions
 * 4. Clear visual hierarchy
 *
 * ⚠️ Important Note for Next Developer:
 * - This header is only used on landing page
 * - Dashboard has its own layout component
 * - Mobile menu uses portal for better z-index management
 *
 * Last Modified: v3.0.0 - Complete redesign with mobile support
 * ============================================
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Menu, 
  X, 
  ExternalLink,
  FileText,
  Github,
  Twitter,
  MessageCircle
} from 'lucide-react';
import clsx from 'clsx';
import ConnectWallet, { ConnectWalletMobile } from '../wallet/ConnectWallet';
import Logo from '../common/Logo';

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  // Navigation items
  const navItems = [
    {
      label: 'Documentation',
      href: 'https://docs.aeronyx.network',
      icon: FileText,
      external: true
    },
    {
      label: 'GitHub',
      href: 'https://github.com/aeronyx',
      icon: Github,
      external: true
    },
    {
      label: 'Community',
      href: 'https://discord.gg/aeronyx',
      icon: MessageCircle,
      external: true
    }
  ];

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={clsx(
          "fixed top-0 left-0 right-0 z-50",
          "transition-all duration-300",
          scrolled ? [
            "bg-black/80 backdrop-blur-xl",
            "border-b border-white/10",
            "shadow-lg shadow-black/50"
          ] : [
            "bg-transparent",
            "border-b border-transparent"
          ]
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/">
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 sm:gap-3"
              >
                <Logo className="w-8 h-8 sm:w-10 sm:h-10" />
                <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                  AeroNyx
                </span>
              </motion.a>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              {navItems.map((item) => (
                <Link key={item.label} href={item.href}>
                  <motion.a
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={clsx(
                      "flex items-center gap-1.5",
                      "text-sm text-gray-400 hover:text-white",
                      "transition-colors duration-200"
                    )}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {item.external && (
                      <ExternalLink className="w-3 h-3 opacity-50" />
                    )}
                  </motion.a>
                </Link>
              ))}
            </nav>

            {/* Right Side Actions */}
            <div className="flex items-center gap-3">
              {/* Desktop Wallet */}
              <div className="hidden md:block">
                <ConnectWallet />
              </div>

              {/* Mobile Wallet */}
              <div className="md:hidden">
                <ConnectWalletMobile />
              </div>

              {/* Mobile Menu Button */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={clsx(
                  "md:hidden",
                  "p-2 rounded-lg",
                  "bg-white/5 backdrop-blur-md border border-white/10",
                  "hover:bg-white/10 transition-colors"
                )}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5 text-white" />
                ) : (
                  <Menu className="w-5 h-5 text-white" />
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Mobile Navigation Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            />

            {/* Menu Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={clsx(
                "fixed right-0 top-0 bottom-0 w-80 max-w-[85vw]",
                "bg-black/95 backdrop-blur-xl",
                "border-l border-white/10",
                "shadow-2xl shadow-black/50",
                "z-50 md:hidden",
                "overflow-y-auto"
              )}
            >
              {/* Mobile Menu Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <span className="text-lg font-bold text-white">Menu</span>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setMobileMenuOpen(false)}
                  className={clsx(
                    "p-2 rounded-lg",
                    "bg-white/5 hover:bg-white/10",
                    "transition-colors"
                  )}
                >
                  <X className="w-5 h-5 text-white" />
                </motion.button>
              </div>

              {/* Mobile Menu Items */}
              <div className="p-6 space-y-2">
                {navItems.map((item, index) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Link href={item.href}>
                      <motion.a
                        whileTap={{ scale: 0.98 }}
                        className={clsx(
                          "flex items-center gap-3 p-3 rounded-xl",
                          "bg-white/5 hover:bg-white/10",
                          "border border-transparent hover:border-white/10",
                          "transition-all duration-200"
                        )}
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noopener noreferrer" : undefined}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <div className="p-2 rounded-lg bg-white/10">
                          <item.icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="text-white font-medium">
                            {item.label}
                          </div>
                          {item.external && (
                            <div className="text-xs text-gray-500">
                              External link
                            </div>
                          )}
                        </div>
                        {item.external && (
                          <ExternalLink className="w-4 h-4 text-gray-500" />
                        )}
                      </motion.a>
                    </Link>
                  </motion.div>
                ))}
              </div>

              {/* Mobile Menu Footer */}
              <div className="p-6 border-t border-white/10 mt-auto">
                <div className="flex items-center gap-4 justify-center">
                  <Link href="https://twitter.com/aeronyx">
                    <motion.a
                      whileTap={{ scale: 0.95 }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Twitter className="w-5 h-5 text-gray-400" />
                    </motion.a>
                  </Link>
                  <Link href="https://github.com/aeronyx">
                    <motion.a
                      whileTap={{ scale: 0.95 }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Github className="w-5 h-5 text-gray-400" />
                    </motion.a>
                  </Link>
                  <Link href="https://discord.gg/aeronyx">
                    <motion.a
                      whileTap={{ scale: 0.95 }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="w-5 h-5 text-gray-400" />
                    </motion.a>
                  </Link>
                </div>
                <p className="text-xs text-center text-gray-500 mt-4">
                  © 2025 AeroNyx Network
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Spacer for fixed header */}
      <div className="h-16" />
    </>
  );
}
