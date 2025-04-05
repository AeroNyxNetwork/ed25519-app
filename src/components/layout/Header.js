'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ConnectWallet from '../wallet/ConnectWallet';
import { useWallet } from '../wallet/WalletProvider';

export default function Header() {
  const { wallet } = useWallet();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-background-100">
      <div className="container-custom mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 relative">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-full h-full">
                <g transform="translate(0,512) scale(0.1,-0.1)" fill="#8A2BE2" stroke="none">
                  <path d="M1277 3833 l-1277 -1278 0 -1275 0 -1275 1280 1280 1280 1280 -2 1273 -3 1272 -1278 -1277z"/>
                  <path d="M3838 3833 l-1278 -1278 0 -1275 0 -1275 1280 1280 1280 1280 -2 1273 -3 1272 -1277 -1277z"/>
                </g>
              </svg>
            </div>
            <span className="text-xl font-bold text-white">AeroNyx</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {wallet.connected && (
              <>
                <Link href="/dashboard" className="text-gray-300 hover:text-white transition-colors">
                  Dashboard
                </Link>
                <Link href="/dashboard/nodes" className="text-gray-300 hover:text-white transition-colors">
                  My Nodes
                </Link>
                <Link href="/dashboard/register" className="text-gray-300 hover:text-white transition-colors">
                  Register Node
                </Link>
                <Link href="/dashboard/network" className="text-gray-300 hover:text-white transition-colors">
                  Network Stats
                </Link>
              </>
            )}
          </nav>

          {/* Wallet Connection */}
          <div className="flex items-center">
            <ConnectWallet />
            
            {/* Mobile menu button */}
            <button 
              className="ml-4 md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-background-50 border-t border-background-100">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {wallet.connected ? (
              <>
                <Link 
                  href="/dashboard" 
                  className="block px-3 py-2 rounded-md text-white hover:bg-background-100 transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link 
                  href="/dashboard/nodes" 
                  className="block px-3 py-2 rounded-md text-white hover:bg-background-100 transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  My Nodes
                </Link>
                <Link 
                  href="/dashboard/register" 
                  className="block px-3 py-2 rounded-md text-white hover:bg-background-100 transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Register Node
                </Link>
                <Link 
                  href="/dashboard/network" 
                  className="block px-3 py-2 rounded-md text-white hover:bg-background-100 transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Network Stats
                </Link>
              </>
            ) : (
              <div className="px-3 py-2 text-gray-400">
                Connect your wallet to access the dashboard
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
