/**
 * Simple WebSocket Dashboard Test
 * 
 * File Path: src/components/dashboard/SimpleWebSocketDashboard.js
 * 
 * Minimal implementation to test WebSocket connection
 * 
 * @version 1.0.0
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '../wallet/WalletProvider';

export default function SimpleWebSocketDashboard() {
  const { wallet } = useWallet();
  const [logs, setLogs] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [connectionState, setConnectionState] = useState('disconnected');
  const wsRef = useRef(null);
  
  // Add log message
  const addLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, data }].slice(-20));
    console.log(`[${timestamp}] ${message}`, data);
  };
  
  // Connect to WebSocket
  const connect = () => {
    if (!wallet.connected) {
      addLog('Wallet not connected');
      return;
    }
    
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    addLog('Connecting to WebSocket...');
    setConnectionState('connecting');
    
    const ws = new WebSocket('wss://api.aeronyx.network/ws/aeronyx/user-monitor/');
    wsRef.current = ws;
    
    ws.onopen = () => {
      addLog('WebSocket opened');
      setConnectionState('connected');
    };
    
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        addLog(`Received: ${data.type}`, data);
        
        switch (data.type) {
          case 'connected':
            // Step 1: Request signature message
            const getMessage = {
              type: 'get_message',
              wallet_address: wallet.address
            };
            addLog('Sending get_message', getMessage);
            ws.send(JSON.stringify(getMessage));
            break;
            
          case 'signature_message':
            // Step 2: Sign the message
            addLog('Signing message...', { message: data.message });
            
            try {
              // Sign with wallet
              const accounts = await window.ethereum.request({ 
                method: 'eth_requestAccounts' 
              });
              
              const signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [data.message, accounts[0]]
              });
              
              addLog('Signature obtained', signature);
              
              // Send auth
              const authMessage = {
                type: 'auth',
                wallet_address: wallet.address,
                signature: signature,
                message: data.message,
                wallet_type: 'okx'
              };
              
              addLog('Sending auth', authMessage);
              ws.send(JSON.stringify(authMessage));
              
            } catch (error) {
              addLog('Signing error', error.message);
              setConnectionState('error');
            }
            break;
            
          case 'auth_success':
            addLog('Authentication successful!', data);
            setConnectionState('authenticated');
            
            // Save initial nodes
            if (data.nodes) {
              setNodes(data.nodes);
            }
            
            // Start monitoring
            const startMonitor = { type: 'start_monitor' };
            addLog('Sending start_monitor', startMonitor);
            ws.send(JSON.stringify(startMonitor));
            break;
            
          case 'monitor_started':
            addLog('Monitoring started', data);
            setConnectionState('monitoring');
            break;
            
          case 'status_update':
            addLog('Status update received', { nodeCount: data.nodes?.length });
            if (data.nodes) {
              setNodes(data.nodes);
            }
            break;
            
          case 'error':
            addLog('Error received', data);
            setConnectionState('error');
            break;
            
          default:
            addLog(`Unknown message type: ${data.type}`, data);
        }
      } catch (error) {
        addLog('Message parsing error', error.message);
      }
    };
    
    ws.onerror = (error) => {
      addLog('WebSocket error', error);
      setConnectionState('error');
    };
    
    ws.onclose = (event) => {
      addLog('WebSocket closed', { code: event.code, reason: event.reason });
      setConnectionState('disconnected');
    };
  };
  
  // Disconnect
  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };
  
  // Auto-connect when wallet is ready
  useEffect(() => {
    if (wallet.connected) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [wallet.connected]);
  
  // Clear logs
  const clearLogs = () => {
    setLogs([]);
  };
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">WebSocket Dashboard Test</h1>
      
      {/* Connection Status */}
      <div className="mb-6 p-4 bg-background-100 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Connection Status</h2>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            connectionState === 'monitoring' ? 'bg-green-500' :
            connectionState === 'authenticated' ? 'bg-blue-500' :
            connectionState === 'connected' ? 'bg-yellow-500' :
            connectionState === 'error' ? 'bg-red-500' :
            'bg-gray-500'
          }`} />
          <span className="font-mono">{connectionState}</span>
        </div>
        <div className="mt-2 text-sm text-gray-400">
          Wallet: {wallet.connected ? wallet.address : 'Not connected'}
        </div>
      </div>
      
      {/* Controls */}
      <div className="mb-6 flex gap-2">
        <button onClick={connect} className="button-primary">
          Reconnect
        </button>
        <button onClick={disconnect} className="button-secondary">
          Disconnect
        </button>
        <button onClick={clearLogs} className="button-secondary">
          Clear Logs
        </button>
      </div>
      
      {/* Nodes */}
      {nodes.length > 0 && (
        <div className="mb-6 p-4 bg-background-100 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Nodes ({nodes.length})</h2>
          <div className="space-y-2">
            {nodes.map((node, index) => (
              <div key={node.code || index} className="p-2 bg-background-200 rounded">
                <div className="flex justify-between">
                  <span className="font-semibold">{node.name}</span>
                  <span className="text-sm text-gray-400">{node.code}</span>
                </div>
                {node.status && (
                  <div className="text-sm">
                    Status: <span className={node.status === 'active' ? 'text-green-400' : 'text-gray-400'}>
                      {node.status}
                    </span>
                  </div>
                )}
                {node.performance && (
                  <div className="text-xs text-gray-400 mt-1">
                    CPU: {node.performance.cpu}% | 
                    Memory: {node.performance.memory}% | 
                    Disk: {node.performance.disk}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Logs */}
      <div className="p-4 bg-background-100 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Logs</h2>
        <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-sm">
          {logs.map((log, index) => (
            <div key={index} className="flex gap-2">
              <span className="text-gray-500">[{log.timestamp}]</span>
              <span className={log.message.includes('error') ? 'text-red-400' : 'text-gray-300'}>
                {log.message}
              </span>
              {log.data && (
                <span className="text-gray-500 text-xs">
                  {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2).substring(0, 100) + '...' : log.data}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
