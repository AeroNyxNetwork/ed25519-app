/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Enhanced Node List Component for Dashboard
 * Modification Reason: Remove earnings displays, focus on operational metrics
 * Main Functionality: Display and manage nodes with resource monitoring
 * Dependencies: NodePerformanceChart, useSignature hook, Next.js routing
 *
 * Main Logical Flow:
 * 1. Display list of registered nodes with status
 * 2. Show resource utilization for each node
 * 3. Provide expandable details with performance charts
 * 4. Enable blockchain integration management
 *
 * ⚠️ Important Note for Next Developer:
 * - Node type configuration determines visual styling
 * - Performance charts use cached signature for optimization
 * - Resource monitoring is critical for node health assessment
 *
 * Last Modified: v3.1.0 - Removed earnings displays, kept functional metrics
 * ============================================
 */

import React, { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import NodePerformanceChart from './NodePerformanceChart';
import { useSignature } from '../../hooks/useSignature';

// Node type configuration
const NODE_TYPE_CONFIG = {
  general: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
      </svg>
    ),
    color: "accent",
    description: "General purpose node providing balanced resources"
  },
  compute: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
    color: "primary",
    description: "Optimized for computational tasks"
  },
  storage: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
    ),
    color: "secondary",
    description: "High capacity storage node"
  },
  ai: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    color: "purple",
    description: "AI and machine learning workloads"
  },
  onion: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    color: "yellow",
    description: "Privacy-focused routing node"
  },
  privacy: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    color: "green",
    description: "Enhanced privacy and encryption"
  }
};

// Status configuration
const STATUS_CONFIG = {
  online: { bg: 'bg-green-900/30', text: 'text-green-500', border: 'border-green-800' },
  active: { bg: 'bg-green-900/30', text: 'text-green-500', border: 'border-green-800' },
  offline: { bg: 'bg-red-900/30', text: 'text-red-500', border: 'border-red-800' },
  pending: { bg: 'bg-yellow-900/30', text: 'text-yellow-500', border: 'border-yellow-800' },
  registered: { bg: 'bg-blue-900/30', text: 'text-blue-500', border: 'border-blue-800' }
};

export default function NodeList({ nodes, onBlockchainIntegrate, onNodeDetails }) {
  const [expandedNode, setExpandedNode] = useState(null);
  const [performanceData, setPerformanceData] = useState({});
  
  // Use cached signature
  const { signature, message } = useSignature('nodeList');

  // Utility functions
  const formatDate = useCallback((dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  }, []);

  const getNodeTypeConfig = useCallback((type) => {
    const nodeType = type ? String(type).toLowerCase() : 'general';
    return NODE_TYPE_CONFIG[nodeType] || NODE_TYPE_CONFIG.general;
  }, []);

  const getConnectionStatus = useCallback((node) => {
    if (node.connectionStatus === 'offline' || node.status === 'offline') {
      return { color: 'text-red-500', text: node.offlineDuration ? `Offline ${node.offlineDuration}` : 'Disconnected' };
    }
    
    if (node.status === 'pending') {
      return { color: 'text-yellow-500', text: 'Waiting activation' };
    }
    
    if (node.isConnected) {
      return { color: 'text-green-500', text: 'Connected' };
    }
    
    if (!node.lastSeen) {
      return { color: 'text-gray-500', text: 'Never connected' };
    }

    const now = new Date();
    const lastSeenDate = new Date(node.lastSeen);
    const diffMinutes = Math.floor((now - lastSeenDate) / (1000 * 60));

    if (diffMinutes < 5) {
      return { color: 'text-green-500', text: 'Connected' };
    } else if (diffMinutes < 30) {
      return { color: 'text-yellow-500', text: `Last seen ${diffMinutes}m ago` };
    } else {
      return { color: 'text-red-500', text: 'Connection lost' };
    }
  }, []);

  const calculateHealthScore = useCallback((node) => {
    let score = 100;
    
    // Status impact
    if (node.status === 'offline') score -= 50;
    else if (node.status === 'pending') score -= 20;
    
    // Resource usage impact
    const cpuUsage = node.resources?.cpu?.usage || 0;
    const memoryUsage = node.resources?.memory?.usage || 0;
    
    if (cpuUsage > 90) score -= 15;
    else if (cpuUsage > 80) score -= 10;
    
    if (memoryUsage > 90) score -= 15;
    else if (memoryUsage > 80) score -= 10;
    
    // Connection impact
    const connectionStatus = getConnectionStatus(node);
    if (connectionStatus.text.includes('Offline') || connectionStatus.text.includes('lost')) score -= 30;
    else if (connectionStatus.text === 'Never connected') score -= 40;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [getConnectionStatus]);

  const getHealthScoreColor = useCallback((score) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  }, []);

  const getResourceBarColor = useCallback((usage) => {
    if (usage > 80) return 'bg-red-500';
    if (usage > 60) return 'bg-yellow-500';
    return 'bg-green-500';
  }, []);

  // Event handlers
  const toggleNodeExpansion = useCallback(async (nodeId) => {
    if (expandedNode === nodeId) {
      setExpandedNode(null);
      return;
    }

    setExpandedNode(nodeId);
    
    if (onNodeDetails) {
      const node = nodes.find(n => n.id === nodeId);
      if (node && node.referenceCode) {
        try {
          const details = await onNodeDetails(node.referenceCode);
          if (details) {
            setPerformanceData(prev => ({
              ...prev,
              [nodeId]: details
            }));
          }
        } catch (error) {
          console.error('Failed to load node details:', error);
        }
      }
    }
  }, [expandedNode, nodes, onNodeDetails]);

  const handleBlockchainIntegration = useCallback((event, node) => {
    event.stopPropagation();
    if (onBlockchainIntegrate) {
      onBlockchainIntegrate(node);
    }
  }, [onBlockchainIntegrate]);

  // Computed values for each node
  const nodesWithComputedData = useMemo(() => {
    return nodes.map(node => {
      const nodeTypeConfig = getNodeTypeConfig(node.type);
      const connectionStatus = getConnectionStatus(node);
      const healthScore = calculateHealthScore(node);
      const hasBlockchainIntegrations = node.blockchainIntegrations && node.blockchainIntegrations.length > 0;
      
      return {
        ...node,
        nodeTypeConfig,
        connectionStatus,
        healthScore,
        hasBlockchainIntegrations
      };
    });
  }, [nodes, getNodeTypeConfig, getConnectionStatus, calculateHealthScore]);

  // Render methods
  const renderResourceUsage = useCallback((resources) => (
    <div className="space-y-3">
      {[
        { key: 'cpu', label: 'CPU', icon: '🔥' },
        { key: 'memory', label: 'Memory', icon: '💾' },
        { key: 'storage', label: 'Storage', icon: '💿' },
        { key: 'bandwidth', label: 'Bandwidth', icon: '📡' }
      ].map(({ key, label, icon }) => {
        const resource = resources?.[key];
        const usage = resource?.usage || 0;
        const barColor = getResourceBarColor(usage);
        
        return (
          <div key={key}>
            <div className="flex justify-between items-center text-sm mb-1">
              <span className="text-gray-400 flex items-center gap-1">
                <span>{icon}</span> {label}
              </span>
              <span className={`font-mono ${usage > 80 ? 'text-red-400' : ''}`}>{usage}%</span>
            </div>
            <div className="w-full bg-background-200 rounded-full h-1.5">
              <div 
                className={`rounded-full h-1.5 transition-all duration-300 ${barColor}`}
                style={{ width: `${Math.min(100, Math.max(0, usage))}%` }}
              ></div>
            </div>
          </div>
        );
      })}
    </div>
  ), [getResourceBarColor]);

  const renderNodeHeader = useCallback((node) => (
    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-background-50 transition-colors"
         onClick={() => toggleNodeExpansion(node.id)}>
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg bg-${node.nodeTypeConfig.color}-900/20 border border-${node.nodeTypeConfig.color}-800/50`}>
          {React.cloneElement(node.nodeTypeConfig.icon, { 
            className: `h-6 w-6 text-${node.nodeTypeConfig.color}-400` 
          })}
        </div>
        
        <div className="min-w-0">
          <h3 className="font-bold text-lg truncate">{node.name}</h3>
          <div className="flex items-center gap-3 mt-1 text-sm">
            <span className="font-mono text-xs text-gray-500">{node.referenceCode}</span>
            <span className={`px-2 py-0.5 rounded text-xs ${STATUS_CONFIG[node.status]?.bg} ${STATUS_CONFIG[node.status]?.text} ${STATUS_CONFIG[node.status]?.border} border`}>
              {node.status?.charAt(0).toUpperCase() + node.status?.slice(1)}
            </span>
            <span className={`text-xs ${node.connectionStatus.color}`}>
              {node.connectionStatus.text}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-xs text-gray-400">Health</div>
          <div className={`text-lg font-bold ${getHealthScoreColor(node.healthScore)}`}>
            {node.healthScore}%
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-xs text-gray-400">Uptime</div>
          <div className="text-sm font-mono">{node.uptime || '99.9%'}</div>
        </div>
        
        {node.hasBlockchainIntegrations && (
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-900/30 text-blue-400 border border-blue-800">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
            </svg>
            <span className="text-xs">Blockchain</span>
          </div>
        )}
        
        <svg 
          className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
            expandedNode === node.id ? 'rotate-180' : ''
          }`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  ), [expandedNode, getHealthScoreColor, toggleNodeExpansion]);

  const renderNodeDetails = useCallback((node) => (
    <div className="p-6 border-t border-background-200 bg-background-50/50">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resources */}
        <div className="card bg-background-100 p-4">
          <h4 className="font-bold mb-3 flex items-center gap-2">
            <span>📊</span> Resource Usage
          </h4>
          {renderResourceUsage(node.resources)}
        </div>
        
        {/* Performance Chart */}
        {node.referenceCode && (
          <div className="card bg-background-100 p-4">
            <h4 className="font-bold mb-3 flex items-center gap-2">
              <span>📈</span> 24h Performance
            </h4>
            <NodePerformanceChart 
              nodeId={node.referenceCode}
              height={180}
              signature={signature}
              message={message}
            />
          </div>
        )}
      </div>
      
      {/* Actions */}
      <div className="mt-6 flex gap-3">
        <Link href={`/dashboard/nodes/${node.referenceCode}`}>
          <button className="button-secondary flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View Details
          </button>
        </Link>
        
        <button 
          onClick={(e) => handleBlockchainIntegration(e, node)}
          className="button-primary flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {node.hasBlockchainIntegrations ? 'Manage' : 'Add'} Blockchain
        </button>
      </div>
    </div>
  ), [renderResourceUsage, signature, message, handleBlockchainIntegration]);

  return (
    <div className="space-y-4">
      {nodesWithComputedData.map((node) => (
        <div key={node.id} className="card glass-effect overflow-hidden">
          {renderNodeHeader(node)}
          {expandedNode === node.id && renderNodeDetails(node)}
        </div>
      ))}
    </div>
  );
}
