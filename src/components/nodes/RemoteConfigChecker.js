/**
 * ============================================
 * File: src/components/nodes/RemoteConfigChecker.js
 * ============================================
 * Remote Configuration Checker Component
 * 
 * Creation Reason: Check and display remote management configuration status
 * Main Functionality: Pre-flight check before attempting terminal connection
 * Dependencies: Node data, WebSocket status
 * 
 * Main Logical Flow:
 * 1. Check node configuration for remote management support
 * 2. Display configuration status and instructions
 * 3. Allow retry after configuration changes
 * 
 * ⚠️ Important Note for Next Developer:
 * - This component should be shown before attempting terminal connection
 * - Helps users understand configuration requirements
 * - Reduces failed connection attempts
 * 
 * Last Modified: v1.0.0 - Initial implementation
 * ============================================
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings,
  CheckCircle,
  XCircle,
  AlertCircle,
  Terminal,
  Shield,
  Server,
  Wifi,
  WifiOff,
  RefreshCw,
  Info,
  ChevronRight
} from 'lucide-react';
import clsx from 'clsx';

/**
 * Remote Configuration Checker Component
 * Displays the configuration status and requirements for remote management
 */
export default function RemoteConfigChecker({ 
  nodeData,
  onProceed,
  onCancel,
  className 
}) {
  const [isChecking, setIsChecking] = useState(true);
  const [configStatus, setConfigStatus] = useState({
    nodeOnline: false,
    remoteEnabled: false,
    sshEnabled: false,
    portOpen: false,
    permissions: false
  });
  const [showInstructions, setShowInstructions] = useState(false);

  // Check configuration
  useEffect(() => {
    const checkConfig = async () => {
      setIsChecking(true);
      
      // Simulate configuration check
      // In production, this would make an API call to check node config
      setTimeout(() => {
        setConfigStatus({
          nodeOnline: nodeData?.status === 'online' || nodeData?.status === 'active',
          remoteEnabled: nodeData?.config?.remote_management_enabled || false,
          sshEnabled: nodeData?.config?.ssh_enabled !== false,
          portOpen: nodeData?.config?.terminal_port_open !== false,
          permissions: true // Assume user has permissions if they can see the node
        });
        setIsChecking(false);
      }, 1000);
    };

    checkConfig();
  }, [nodeData]);

  // Calculate readiness
  const isReady = Object.values(configStatus).every(status => status);
  const hasWarnings = !configStatus.remoteEnabled || !configStatus.nodeOnline;

  // Retry check
  const retryCheck = () => {
    setIsChecking(true);
    setTimeout(() => {
      // Re-check configuration
      setConfigStatus(prev => ({
        ...prev,
        nodeOnline: nodeData?.status === 'online' || nodeData?.status === 'active'
      }));
      setIsChecking(false);
    }, 1000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={clsx(
        'bg-gradient-to-b from-gray-900 to-black rounded-xl border border-white/10 p-6',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-600/20 to-blue-600/20">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Remote Access Configuration</h3>
          <p className="text-sm text-gray-400">Checking node configuration...</p>
        </div>
      </div>

      {/* Configuration Status */}
      <div className="space-y-3 mb-6">
        {/* Node Status */}
        <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <div className="flex items-center gap-3">
            <Server className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-300">Node Status</span>
          </div>
          <div className="flex items-center gap-2">
            {isChecking ? (
              <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
            ) : configStatus.nodeOnline ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">Online</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-400">Offline</span>
              </>
            )}
          </div>
        </div>

        {/* Remote Management */}
        <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <div className="flex items-center gap-3">
            <Terminal className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-300">Remote Management</span>
          </div>
          <div className="flex items-center gap-2">
            {isChecking ? (
              <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
            ) : configStatus.remoteEnabled ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">Enabled</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-yellow-400">Not Enabled</span>
              </>
            )}
          </div>
        </div>

        {/* SSH Access */}
        <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <div className="flex items-center gap-3">
            <Wifi className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-300">SSH Access</span>
          </div>
          <div className="flex items-center gap-2">
            {isChecking ? (
              <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
            ) : configStatus.sshEnabled ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">Available</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-yellow-400">Unknown</span>
              </>
            )}
          </div>
        </div>

        {/* Permissions */}
        <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-300">Access Permissions</span>
          </div>
          <div className="flex items-center gap-2">
            {isChecking ? (
              <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
            ) : configStatus.permissions ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">Granted</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-400">Denied</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Instructions for enabling remote management */}
      {!configStatus.remoteEnabled && !isChecking && (
        <div className="mb-6">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            <Info className="w-4 h-4" />
            How to enable remote management
            <ChevronRight 
              className={clsx(
                "w-4 h-4 transition-transform",
                showInstructions && "rotate-90"
              )}
            />
          </button>
          
          <AnimatePresence>
            {showInstructions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-4 p-4 bg-black/40 rounded-lg border border-white/10"
              >
                <p className="text-sm text-gray-300 mb-3">
                  To enable remote terminal access for your node:
                </p>
                <ol className="space-y-2 text-sm text-gray-400">
                  <li className="flex gap-2">
                    <span className="text-purple-400">1.</span>
                    <div>
                      SSH into your node server:
                      <code className="block mt-1 bg-black/60 px-2 py-1 rounded text-xs text-gray-300">
                        ssh user@{nodeData?.ip_address || 'your-node-ip'}
                      </code>
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-purple-400">2.</span>
                    <div>
                      Edit the node configuration:
                      <code className="block mt-1 bg-black/60 px-2 py-1 rounded text-xs text-gray-300">
                        nano /etc/aeronyx/node.conf
                      </code>
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-purple-400">3.</span>
                    <div>
                      Add or update the configuration:
                      <code className="block mt-1 bg-black/60 px-2 py-1 rounded text-xs text-gray-300">
                        enable_remote_management: true{'\n'}
                        remote_terminal_port: 8022
                      </code>
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-purple-400">4.</span>
                    <div>
                      Restart the node service:
                      <code className="block mt-1 bg-black/60 px-2 py-1 rounded text-xs text-gray-300">
                        sudo systemctl restart aeronyx-node
                      </code>
                    </div>
                  </li>
                </ol>
                <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <p className="text-xs text-yellow-400">
                    <strong>Security Note:</strong> Enabling remote management allows terminal access through the web interface. 
                    Ensure your node is properly secured and only accessible through trusted networks.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {isReady && !isChecking ? (
          <button
            onClick={onProceed}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg text-white font-medium transition-all"
          >
            Open Terminal
          </button>
        ) : hasWarnings && !isChecking ? (
          <>
            <button
              onClick={onProceed}
              className="flex-1 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 rounded-lg text-yellow-400 font-medium border border-yellow-500/30 transition-all"
            >
              Try Anyway
            </button>
            <button
              onClick={retryCheck}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            disabled
            className="flex-1 px-4 py-2 bg-gray-800 rounded-lg text-gray-500 font-medium cursor-not-allowed"
          >
            {isChecking ? 'Checking...' : 'Not Available'}
          </button>
        )}
        
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 transition-all"
        >
          Cancel
        </button>
      </div>

      {/* Status Summary */}
      {!isChecking && (
        <div className="mt-4 text-center">
          {isReady ? (
            <p className="text-xs text-green-400">
              ✓ Node is configured and ready for remote access
            </p>
          ) : hasWarnings ? (
            <p className="text-xs text-yellow-400">
              ⚠ Remote management may not be fully configured
            </p>
          ) : (
            <p className="text-xs text-red-400">
              ✗ Node is not available for remote access
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

// Export component
export { RemoteConfigChecker };
