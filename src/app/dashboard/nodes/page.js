/**
 * ============================================
 * File: src/app/dashboard/nodes/page.js
 * ============================================
 * Nodes Management Page - PRODUCTION OPTIMIZED v3.0.0
 * 
 * Modification Reason: Add proper error handling and connection state
 * - Added: useConnectionState for unified state management
 * - Added: Comprehensive error handling with retry
 * - Added: Connection status display
 * - Improved: Loading states with clear messaging
 * - Enhanced: User feedback and recovery options
 * 
 * Key Changes:
 * 1. No more silent redirects - show error screens
 * 2. Retry functionality on connection errors
 * 3. Clear loading states with progress indication
 * 4. Better user guidance
 * 5. Graceful degradation
 * 
 * Main Functionality: Display all user's nodes with real-time monitoring
 * Dependencies: useConnectionState, NodesContent, WalletProvider
 * 
 * ⚠️ Important Notes:
 * - Uses lazy loading for performance
 * - Handles all connection states gracefully
 * - Provides clear user feedback
 * - All existing functionality preserved
 * 
 * Last Modified: v3.0.0 - Production-ready with error handling
 * ============================================
 */

'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useWallet } from '../../../components/wallet/WalletProvider';
import { useConnectionState } from '../../../hooks/useConnectionState';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Server,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  Loader2,
  Shield,
  Home,
  ChevronRight
} from 'lucide-react';
import clsx from 'clsx';

// Lazy load the content component for better performance
const NodesContent = React.lazy(() => import('../../../components/nodes/NodesContent'));

// ==================== LOADING SCREEN ====================

function LoadingScreen({ message = 'Loading...', status = 'connecting' }) {
  const messages = {
    connecting: 'Connecting to AeroNyx Network...',
    authenticating: 'Authenticating your session...',
    loading: 'Loading your nodes...',
    syncing: 'Syncing node data...'
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
      <div className="text-center max-w-md">
        <motion.div
          className="w-20 h-20 mx-auto mb-8"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <div className="w-full h-full rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 p-[2px]">
            <div className="w-full h-full rounded-2xl bg-[#0A0A0F] flex items-center justify-center">
              <Server className="w-10 h-10 text-white" />
            </div>
          </div>
        </motion.div>
        
        <motion.h2 
          className="text-2xl font-bold text-white mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {messages[status] || message}
        </motion.h2>
        
        <div className="flex items-center justify-center gap-1">
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ==================== WALLET DISCONNECTED SCREEN ====================

function WalletDisconnectedScreen() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
      <motion.div 
        className="text-center max-w-md"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <div className="w-20 h-20 bg-yellow-500/10 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6 border border-yellow-500/20">
          <Shield className="w-10 h-10 text-yellow-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Wallet Not Connected</h2>
        <p className="text-gray-400 mb-8">
          Please connect your wallet to access node management
        </p>
        
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl transition-all font-medium"
        >
          <Home className="w-4 h-4" />
          Go to Home
        </button>
      </motion.div>
    </div>
  );
}

// ==================== CONNECTION ERROR SCREEN ====================

function ConnectionErrorScreen({ error, onRetry, isRetrying }) {
  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
      <motion.div 
        className="text-center max-w-md"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <div className="w-20 h-20 bg-red-500/10 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
          {isRetrying ? (
            <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
          ) : (
            <AlertCircle className="w-10 h-10 text-red-400" />
          )}
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-3">
          {isRetrying ? 'Reconnecting...' : 'Connection Error'}
        </h2>
        
        <p className="text-gray-400 mb-8">
          {isRetrying 
            ? 'Attempting to reconnect to AeroNyx Network...'
            : (error || 'Unable to connect to AeroNyx Network')
          }
        </p>
        
        {!isRetrying && (
          <div className="flex gap-4 justify-center">
            <button
              onClick={onRetry}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl transition-all font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Connection
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

export default function NodesPage() {
  const { wallet, isInitializing } = useWallet();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  
  // ✅ NEW: Use unified connection state
  const {
    status: connectionStatus,
    isReady,
    isWebSocketConnected,
    isWebSocketAuthenticated,
    error: connectionError,
    isLoading: isConnecting,
    isReconnecting,
    fullReconnect
  } = useConnectionState();

  // Check if client-side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // ==================== Render Logic ====================
  
  // Server-side: render nothing
  if (!isClient) {
    return null;
  }

  // Wallet initializing
  if (isInitializing) {
    return <LoadingScreen message="Initializing wallet..." status="connecting" />;
  }

  // Wallet not connected
  if (!wallet.connected) {
    return <WalletDisconnectedScreen />;
  }

  // Connection error
  if (connectionError && !isReconnecting && !isReady) {
    return (
      <ConnectionErrorScreen 
        error={connectionError}
        onRetry={fullReconnect}
        isRetrying={isReconnecting}
      />
    );
  }

  // Still connecting
  if (isConnecting && !isReady) {
    const statusMap = {
      connecting: 'connecting',
      authenticating: 'authenticating',
      authenticated: 'loading',
      ready: 'syncing'
    };
    
    return <LoadingScreen status={statusMap[connectionStatus] || 'connecting'} />;
  }

  // Reconnecting
  if (isReconnecting) {
    return (
      <ConnectionErrorScreen 
        error="Connection lost"
        onRetry={fullReconnect}
        isRetrying={true}
      />
    );
  }

  // ==================== Main Content ====================
  
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-blue-900/10" />
      </div>

      <div className="relative z-10">
        {/* Connection Status Banner (if issues) */}
        {connectionError && isReady && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-6 py-3 bg-yellow-500/10 border-b border-yellow-500/20"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2 text-yellow-400">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Connection unstable: {connectionError}</span>
              </div>
              <button
                onClick={fullReconnect}
                className="text-sm text-yellow-300 hover:text-yellow-200 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Reconnect
              </button>
            </div>
          </motion.div>
        )}

        {/* Main Content - Suspense Wrapper */}
        <Suspense fallback={<LoadingScreen message="Loading nodes interface..." status="loading" />}>
          <NodesContent />
        </Suspense>
      </div>
    </div>
  );
}
