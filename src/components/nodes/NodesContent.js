/**
 * Nodes Content Component for AeroNyx Platform
 * 
 * File Path: src/components/nodes/NodesContent.js
 * 
 * Contains the main nodes management UI logic separated from the page component
 * to avoid circular dependencies and SSR issues.
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';

// Component imports
import NodeList from '../dashboard/NodeList';
import BlockchainIntegrationModule from '../dashboard/BlockchainIntegrationModule';

// Hook imports
import useNodeRegistration from '../../hooks/useNodeRegistration';
import { useWallet } from '../wallet/WalletProvider';

export default function NodesContent() {
  const { wallet } = useWallet();
  const [showBlockchainModal, setShowBlockchainModal] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Node registration hook
  const {
    loading,
    error,
    nodes,
    statistics,
    refreshNodesOverview,
    getNodeDetailedStatus
  } = useNodeRegistration(wallet);

  // Filter nodes based on status and search
  const filteredNodes = React.useMemo(() => {
    if (!nodes) return [];
    
    return nodes.filter(node => {
      // Status filter
      if (filterStatus !== 'all' && node.status !== filterStatus) {
        return false;
      }
      
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          node.name?.toLowerCase().includes(search) ||
          node.referenceCode?.toLowerCase().includes(search) ||
          node.id?.toString().includes(search)
        );
      }
      
      return true;
    });
  }, [nodes, filterStatus, searchTerm]);

  // Event handlers
  const handleBlockchainIntegration = useCallback((node) => {
    setSelectedNode(node);
    setShowBlockchainModal(true);
  }, []);

  const handleNodeDetails = useCallback(async (referenceCode) => {
    try {
      const details = await getNodeDetailedStatus(referenceCode);
      console.log('Node details:', details);
    } catch (error) {
      console.error('Failed to fetch node details:', error);
    }
  }, [getNodeDetailedStatus]);

  const handleRefresh = useCallback(() => {
    refreshNodesOverview();
  }, [refreshNodesOverview]);

  // Loading state
  if (loading && !nodes) {
    return (
      <div className="py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">My Nodes</h1>
          <p className="text-gray-400 mt-1">Loading your nodes...</p>
        </div>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card glass-effect h-48 bg-background-100"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">My Nodes</h1>
            <p className="text-gray-400 mt-1">Manage and monitor your AeroNyx nodes</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-2 rounded-md bg-background-100 hover:bg-background-200 transition-colors disabled:opacity-50"
              title="Refresh nodes"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} 
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>
            
            {/* Add Node Button */}
            <Link href="/dashboard/register">
              <button className="button-primary flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Register New Node
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="card glass-effect p-4">
          <div className="text-xs text-gray-400 mb-1">Total Nodes</div>
          <div className="text-2xl font-bold">{statistics.total}</div>
        </div>
        
        <div className="card glass-effect p-4">
          <div className="text-xs text-gray-400 mb-1">Online</div>
          <div className="text-2xl font-bold text-green-400">{statistics.online}</div>
        </div>
        
        <div className="card glass-effect p-4">
          <div className="text-xs text-gray-400 mb-1">Active</div>
          <div className="text-2xl font-bold text-blue-400">{statistics.active}</div>
        </div>
        
        <div className="card glass-effect p-4">
          <div className="text-xs text-gray-400 mb-1">Offline</div>
          <div className="text-2xl font-bold text-red-400">{statistics.offline}</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="card glass-effect p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-background-100 border border-background-200 rounded-md px-3 py-1 text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">All Nodes</option>
              <option value="active">Active</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by name or reference code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background-100 border border-background-200 rounded-md px-4 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="card glass-effect p-4 mb-6 border-red-800">
          <div className="flex items-center gap-2 text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Node List */}
      {filteredNodes.length > 0 ? (
        <NodeList
          nodes={filteredNodes}
          onBlockchainIntegrate={handleBlockchainIntegration}
          onNodeDetails={handleNodeDetails}
        />
      ) : (
        <div className="card glass-effect p-12 text-center">
          {nodes && nodes.length > 0 ? (
            <>
              <h3 className="text-xl font-bold mb-2">No Nodes Found</h3>
              <p className="text-gray-400">
                No nodes match your current filters. Try adjusting your search criteria.
              </p>
            </>
          ) : (
            <>
              <div className="mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold mb-2">No Nodes Yet</h3>
              <p className="text-gray-400 mb-6">
                Start building your node network by registering your first node.
              </p>
              
              <Link href="/dashboard/register">
                <button className="button-primary">
                  Register Your First Node
                </button>
              </Link>
            </>
          )}
        </div>
      )}

      {/* Node Statistics Summary */}
      {nodes && nodes.length > 0 && (
        <div className="mt-8 card glass-effect p-6">
          <h3 className="font-bold mb-4">Network Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Earnings */}
            <div>
              <div className="text-sm text-gray-400 mb-1">Total Earnings</div>
              <div className="text-xl font-bold text-green-400">
                ${statistics.totalEarnings.toFixed(2)}
              </div>
            </div>
            
            {/* Average Health */}
            <div>
              <div className="text-sm text-gray-400 mb-1">Average Health Score</div>
              <div className="text-xl font-bold">
                {statistics.avgHealthScore}%
              </div>
            </div>
            
            {/* Node Types */}
            <div>
              <div className="text-sm text-gray-400 mb-1">Node Distribution</div>
              <div className="flex gap-2 text-xs">
                {Object.entries(statistics.nodesByType).map(([type, count]) => (
                  <span key={type} className="px-2 py-1 bg-background-100 rounded">
                    {type}: {count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Blockchain Integration Modal */}
      {showBlockchainModal && selectedNode && (
        <BlockchainIntegrationModule
          isOpen={showBlockchainModal}
          onClose={() => {
            setShowBlockchainModal(false);
            setSelectedNode(null);
          }}
          selectedNode={selectedNode}
        />
      )}
    </div>
  );
}
