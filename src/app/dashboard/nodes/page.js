/**
 * Nodes Management Page for AeroNyx Platform
 * 
 * File Path: src/app/dashboard/nodes/page.js
 * 
 * Comprehensive node management interface with real-time monitoring,
 * performance tracking, and blockchain integration capabilities.
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '../../../components/wallet/WalletProvider';
import { useRouter } from 'next/navigation';

// Lazy load the content component
const NodesContent = React.lazy(() => import('../../../components/nodes/NodesContent'));

export default function NodesPage() {
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

  return (
    <React.Suspense fallback={
      <div className="py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="mb-8">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
          </div>
          <h2 className="text-xl font-bold mb-2">Loading Nodes</h2>
          <p className="text-gray-400">Fetching your nodes...</p>
        </div>
      </div>
    }>
      <NodesContent />
    </React.Suspense>
  );
}
