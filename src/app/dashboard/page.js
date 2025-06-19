/**
 * Dashboard Page Component for AeroNyx Platform
 * 
 * File Path: src/app/dashboard/page.js
 * 
 * Main dashboard page displaying real-time node statistics,
 * performance metrics, and system overview with WebSocket integration.
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '../../components/wallet/WalletProvider';

// Lazy load components to prevent SSR issues
const DashboardContent = React.lazy(() => import('../../components/dashboard/DashboardContent'));

/**
 * Main Dashboard Page Component
 */
export default function DashboardPage() {
  const { wallet } = useWallet();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  // Check if client-side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (isClient && !wallet.connected) {
      router.push('/');
    }
  }, [isClient, wallet.connected, router]);

  // Don't render anything on server side
  if (!isClient) {
    return null;
  }

  // Show loading while components are loading
  return (
    <React.Suspense fallback={
      <div className="py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="mb-8">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
          </div>
          <h2 className="text-xl font-bold mb-2">Loading Dashboard</h2>
          <p className="text-gray-400">Connecting to AeroNyx network...</p>
        </div>
      </div>
    }>
      <DashboardContent />
    </React.Suspense>
  );
}
