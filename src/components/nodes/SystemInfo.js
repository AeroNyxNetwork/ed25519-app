// src/components/nodes/SystemInfo.js
import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Cpu, HardDrive, Database, Clock } from 'lucide-react';

export default function SystemInfo({ nodeReference, executeCommand }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const loadSystemInfo = async () => {
    setLoading(true);
    try {
      const [hostname, uptime, memory, disk] = await Promise.all([
        executeCommand('hostname'),
        executeCommand('uptime'),
        executeCommand('free', ['-h']),
        executeCommand('df', ['-h', '/'])
      ]);
      
      setInfo({
        hostname: hostname.stdout?.trim() || 'Unknown',
        uptime: uptime.stdout?.trim() || 'Unknown',
        memory: memory.stdout || 'Unknown',
        disk: disk.stdout || 'Unknown'
      });
    } catch (error) {
      console.error('Failed to load system info:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadSystemInfo();
  }, []);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold text-white">System Information</h3>
        <button
          onClick={loadSystemInfo}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      
      <div className="space-y-4">
        <div className="bg-white/5 rounded-lg p-4">
          <h4 className="text-sm text-gray-400 mb-2">Hostname</h4>
          <p className="text-white font-mono">{info.hostname}</p>
        </div>
        
        <div className="bg-white/5 rounded-lg p-4">
          <h4 className="text-sm text-gray-400 mb-2">Uptime</h4>
          <p className="text-white font-mono">{info.uptime}</p>
        </div>
        
        <div className="bg-white/5 rounded-lg p-4">
          <h4 className="text-sm text-gray-400 mb-2">Memory</h4>
          <pre className="text-white font-mono text-xs">{info.memory}</pre>
        </div>
        
        <div className="bg-white/5 rounded-lg p-4">
          <h4 className="text-sm text-gray-400 mb-2">Disk Usage</h4>
          <pre className="text-white font-mono text-xs">{info.disk}</pre>
        </div>
      </div>
    </div>
  );
}
