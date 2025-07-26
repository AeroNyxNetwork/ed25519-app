/**
 * Remote Management Component with Integrated Terminal
 * 
 * File Path: src/components/nodes/RemoteManagement.js
 * 
 * Provides terminal access and file management capabilities
 * for individual nodes using the remote management API
 * 
 * @version 4.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal,
  FileText,
  Folder,
  X,
  AlertCircle,
  Loader2,
  Monitor,
  HardDrive,
  Key,
  RefreshCw
} from 'lucide-react';
import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useRemoteManagement } from '../../hooks/useRemoteManagement';
import FileManager from './FileManager';

// Dynamically import WebTerminal to avoid SSR issues with xterm
const WebTerminal = dynamic(
  () => import('../terminal/WebTerminal'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    )
  }
);

export default function RemoteManagement({ nodeReference, isOpen, onClose }) {
  const {
    isEnabled,
    isEnabling,
    error: remoteError,
    sessionId,
    terminalSessions,
    enableRemoteManagement,
    initTerminal,
    sendTerminalInput,
    resizeTerminal,
    closeTerminal
  } = useRemoteManagement(nodeReference);
  
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('terminal');
  const [activeTerminalId, setActiveTerminalId] = useState(null);

  // Initialize remote management when modal opens
  useEffect(() => {
    if (isOpen && !isEnabled && !isEnabling && nodeReference) {
      enableRemoteManagement()
        .then((success) => {
          if (success) {
            console.log('[RemoteManagement] Remote management enabled successfully');
          }
        })
        .catch((err) => {
          console.error('[RemoteManagement] Failed to enable remote management:', err);
          setError(err.message);
        });
    }
  }, [isOpen, isEnabled, isEnabling, nodeReference, enableRemoteManagement]);

  // Handle terminal initialization
  const handleTerminalInit = useCallback(async (options) => {
    try {
      const termSessionId = await initTerminal(options);
      setActiveTerminalId(termSessionId);
      console.log('[RemoteManagement] Terminal initialized:', termSessionId);
    } catch (err) {
      console.error('[RemoteManagement] Failed to initialize terminal:', err);
      setError(err.message);
    }
  }, [initTerminal]);

  // Handle terminal close
  const handleTerminalClose = useCallback((termSessionId) => {
    closeTerminal(termSessionId);
    if (activeTerminalId === termSessionId) {
      setActiveTerminalId(null);
    }
  }, [closeTerminal, activeTerminalId]);

  // Close modal handler
  const handleClose = useCallback(() => {
    // Close all terminal sessions
    terminalSessions.forEach(session => {
      closeTerminal(session.sessionId);
    });
    onClose();
  }, [terminalSessions, closeTerminal, onClose]);

  if (!isOpen) return null;

  const displayError = error || remoteError;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-black/90 border border-white/10 rounded-2xl w-full max-w-6xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">
              Remote Management - {nodeReference}
            </h2>
            {isEnabled && (
              <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                Connected
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        {!isEnabled ? (
          <div className="flex-1 flex items-center justify-center">
            {isEnabling ? (
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-4" />
                <p className="text-gray-400">Enabling remote management...</p>
                <p className="text-xs text-gray-500 mt-2">This may take a few seconds</p>
              </div>
            ) : displayError ? (
              <div className="text-center max-w-md">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <p className="text-red-400 mb-4">{displayError}</p>
                <button
                  onClick={() => {
                    setError(null);
                    enableRemoteManagement()
                      .then((success) => {
                        if (success) {
                          console.log('[RemoteManagement] Retry successful');
                        }
                      })
                      .catch((err) => {
                        setError(err.message);
                      });
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                >
                  Retry Connection
                </button>
              </div>
            ) : (
              <div className="text-center">
                <Terminal className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">Initializing remote management...</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setActiveTab('terminal')}
                className={clsx(
                  "px-6 py-3 flex items-center gap-2 transition-all",
                  activeTab === 'terminal'
                    ? "bg-white/10 text-white border-b-2 border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Terminal className="w-4 h-4" />
                Terminal
              </button>
              <button
                onClick={() => setActiveTab('system')}
                className={clsx(
                  "px-6 py-3 flex items-center gap-2 transition-all",
                  activeTab === 'system'
                    ? "bg-white/10 text-white border-b-2 border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Monitor className="w-4 h-4" />
                System Info
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={clsx(
                  "px-6 py-3 flex items-center gap-2 transition-all",
                  activeTab === 'files'
                    ? "bg-white/10 text-white border-b-2 border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Folder className="w-4 h-4" />
                Files (Coming Soon)
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'terminal' ? (
                <div className="h-full p-4">
                  {activeTerminalId ? (
                    <WebTerminal
                      sessionId={activeTerminalId}
                      nodeReference={nodeReference}
                      isEnabled={isEnabled}
                      onInit={handleTerminalInit}
                      onInput={sendTerminalInput}
                      onResize={resizeTerminal}
                      onClose={() => handleTerminalClose(activeTerminalId)}
                      className="h-full"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <button
                        onClick={() => handleTerminalInit({
                          onOutput: null,
                          onError: null,
                          onClose: null
                        })}
                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg transition-all flex items-center gap-2"
                      >
                        <Terminal className="w-5 h-5" />
                        Start Terminal Session
                      </button>
                    </div>
                  )}
                </div>
              ) : activeTab === 'system' ? (
                <SystemInfo nodeReference={nodeReference} sessionId={sessionId} />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <HardDrive className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>File manager coming soon</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// System Information Component
function SystemInfo({ nodeReference, sessionId }) {
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real implementation, this would fetch system info via the remote management API
    setTimeout(() => {
      setSystemInfo({
        hostname: nodeReference,
        os: 'Linux 5.15.0-91-generic',
        uptime: '15 days, 4:23:15',
        cpu: {
          model: 'Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz',
          cores: 8,
          usage: 23.5
        },
        memory: {
          total: '16GB',
          used: '6.2GB',
          free: '9.8GB',
          usage: 38.8
        },
        disk: {
          total: '500GB',
          used: '123GB',
          free: '377GB',
          usage: 24.6
        },
        network: {
          interfaces: ['eth0', 'docker0'],
          ip: '192.168.1.100'
        }
      });
      setLoading(false);
    }, 1000);
  }, [nodeReference]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* System Overview */}
        <div className="bg-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4">System Overview</h3>
          <InfoRow label="Hostname" value={systemInfo.hostname} />
          <InfoRow label="Operating System" value={systemInfo.os} />
          <InfoRow label="Uptime" value={systemInfo.uptime} />
          <InfoRow label="Session ID" value={sessionId} />
        </div>

        {/* CPU Info */}
        <div className="bg-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4">CPU</h3>
          <InfoRow label="Model" value={systemInfo.cpu.model} />
          <InfoRow label="Cores" value={systemInfo.cpu.cores} />
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">Usage</span>
              <span className="text-white">{systemInfo.cpu.usage}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                style={{ width: `${systemInfo.cpu.usage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Memory Info */}
        <div className="bg-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4">Memory</h3>
          <InfoRow label="Total" value={systemInfo.memory.total} />
          <InfoRow label="Used" value={systemInfo.memory.used} />
          <InfoRow label="Free" value={systemInfo.memory.free} />
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">Usage</span>
              <span className="text-white">{systemInfo.memory.usage}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                style={{ width: `${systemInfo.memory.usage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Disk Info */}
        <div className="bg-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4">Disk</h3>
          <InfoRow label="Total" value={systemInfo.disk.total} />
          <InfoRow label="Used" value={systemInfo.disk.used} />
          <InfoRow label="Free" value={systemInfo.disk.free} />
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">Usage</span>
              <span className="text-white">{systemInfo.disk.usage}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                style={{ width: `${systemInfo.disk.usage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Network Info */}
        <div className="bg-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4">Network</h3>
          <InfoRow label="IP Address" value={systemInfo.network.ip} />
          <div>
            <span className="text-sm text-gray-400">Interfaces</span>
            <div className="mt-1 space-y-1">
              {systemInfo.network.interfaces.map(iface => (
                <div key={iface} className="text-sm text-white bg-white/10 px-2 py-1 rounded">
                  {iface}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium truncate ml-2">{value}</span>
    </div>
  }
