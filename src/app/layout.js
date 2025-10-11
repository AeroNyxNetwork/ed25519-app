/**
 * ============================================
 * File: src/app/layout.js
 * Path: src/app/layout.js
 * ============================================
 * SIMPLIFIED VERSION - v5.0.0
 * 
 * Creation Reason: Root layout for Next.js app
 * Modification Reason: Simplified for direct-to-dashboard flow
 * Main Functionality: Global layout with wallet provider
 * Dependencies: WalletProvider, global styles
 *
 * Design Philosophy:
 * - Minimal layout for professional tool
 * - No unnecessary header/footer on root
 * - Dashboard has its own layout
 * - Keep it simple and fast
 *
 * ⚠️ Important Note for Next Developer:
 * - Root layout only provides WalletProvider
 * - Dashboard layout handles navigation
 * - Don't add marketing components here
 * - This is NOT a consumer app
 *
 * Last Modified: v5.0.0 - Removed Header import (not needed)
 * ============================================
 */

import '../styles/globals.css'
import { Inter } from 'next/font/google'
import { WalletProvider } from '../components/wallet/WalletProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'AeroNyx Network - Infrastructure Management',
  description: 'Professional node infrastructure management platform',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className={inter.className}>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  )
}
