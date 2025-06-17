/**
 * Real-time Dashboard Component
 * 
 * Displays real-time node status and metrics using WebSocket connections
 * 
 * @version 1.0.0
 */

import React, { useEffect, useState } from 'react';
import { useUserMonitorWebSocket } from '../../hooks/useWebSocket';
import { useWallet } from '../wallet/WalletProvider';
import { signMessage, formatMessageForSigning } from '../../lib/utils/walletSignature';
import nodeRegistrationService from '../../lib/api/nodeRegistration';

export default function RealTimeDashboard() {
  const { wallet } = useWallet();
  const [walletCredentials, setWalletCredentials] = useState(null);
  
  // Initialize wallet credentials
  useEffect(() => {
    const initCredentials = async () => {
      if (!wallet.connected) return;
      
      try {
        const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
        const message = messageResponse.data.message;
        const formattedMessage = formatMessageForSigning(message);
        const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);
        
        setWalletCredentials({
          walletAddress: wallet.address,
          signature,
          message,
          walletType: 'okx'
        });
      } catch (error) {
        console.error('Failed to initialize credentials:', error);
      }
    };
    
    initCredentials();
  }, [wallet.connected, wallet.address, wallet.provider]);

  const {
    connected,
    authenticated,
    monitoring,
    nodes,
    summary,
    error,
    startMonitoring,
    stopMonitoring
  } = useUserMonitorWebSocket(walletCredentials);

  useEffect(() => {
    if (authenticated && !monitoring) {
      startMonitoring();
    }
  }, [authenticated, monitoring, startMonitoring]);

  if (!wallet.connected) {
    return (
      <div className="card glass-effect p-8 text-center">
        <h3 className="text-xl font-bold mb-4">Connect Wallet</h3>
        <p className="text-gray-400">Please connect your wallet to view real-time data</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card glass-effect p-8 text-center border-red-800">
        <h3 className="text-xl font-bold mb-4 text-red-400">Connection Error</h3>
        <p className="text-gray-400">{error}</p>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="card glass-effect p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-gray-400">Connecting to real-time service...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="card glass-effect p-8 text-center">
        <div className="animate-pulse">
          <p className="text-gray-400">Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="card glass-effect p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
            <span className="font-medium">Real-time Connection</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {monitoring ? 'Monitoring Active' : 'Monitoring Inactive'}
            </span>
            <button
              onClick={monitoring ? stopMonitoring : startMonitoring}
              className={`px-3 py-1 rounded text-sm ${
                monitoring 
                  ? 'bg-red-900/30 text-red-400 border border-red-800' 
                  : 'bg-green-900/30 text-green-400 border border-green-800'
              }`}
            >
              {monitoring ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Total Nodes</h3>
            <div className="text-2xl font-bold">{summary.total_nodes}</div>
          </div>
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Online</h3>
            <div className="text-2xl font-bold text-green-500">{summary.online_nodes}</div>
          </div>
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Active</h3>
            <div className="text-2xl font-bold text-blue-500">{summary.active_nodes}</div>
          </div>
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Offline</h3>
            <div className="text-2xl font-bold text-red-500">{summary.offline_nodes}</div>
          </div>
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Earnings</h3>
            <div className="text-2xl font-bold text-primary">
              {summary.total_earnings?.toFixed(4) || '0.0000'}
            </div>
          </div>
        </div>
      )}

      {/* Real-time Nodes List */}
      <div className="card glass-effect">
        <h2 className="text-xl font-bold mb-4">Real-time Node Status</h2>
        
        {nodes.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No nodes found</p>
        ) : (
          <div className="space-y-3">
            {nodes.map(node => (
              <div 
                key={node.reference_code}
                className="p-4 bg-background-100 rounded-lg border border-background-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      node.status === 'active' ? 'bg-green-500' :
                      node.status === 'online' ? 'bg-blue-500' :
                      'bg-red-500'
                    }`}></div>
                    <h3 className="font-bold">{node.name}</h3>
                    <span className="text-xs text-gray-400 font-mono">
                      {node.reference_code}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400">
                    Last seen: {node.connection?.last_heartbeat 
                      ? new Date(node.connection.last_heartbeat).toLocaleTimeString()
                      : 'Never'
                    }
                  </div>
                </div>
                
                {node.performance && (
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400">CPU:</span>
                      <span className="ml-1">{node.performance.cpu_usage}%</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Memory:</span>
                      <span className="ml-1">{node.performance.memory_usage}%</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Storage:</span>
                      <span className="ml-1">{node.performance.storage_usage}%</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Network:</span>
                      <span className="ml-1">{node.performance.bandwidth_usage}%</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
