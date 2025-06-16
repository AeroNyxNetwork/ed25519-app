'use client';

/**
 * AeroNyx Nodes Management Dashboard Page
 * 
 * File Path: src/app/dashboard/nodes/page.js
 * 
 * This component provides a comprehensive interface for managing user's nodes
 * in the AeroNyx network. It includes real-time status monitoring, performance
 * tracking, blockchain integration capabilities, and node management controls.
 * 
 * Features:
 * - Real-time node overview with status grouping
 * - Advanced filtering and search capabilities
 * - Blockchain integration management
 * - Performance monitoring and health scoring
 * - Comprehensive error handling and user feedback
 * - Responsive design for desktop and mobile
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../../components/layout/Header';
import { useWallet } from '../../../components/wallet/WalletProvider';
import Link from 'next/link';
import NodeList from '../../../components/dashboard/NodeList';
import BlockchainIntegrationModule from '../../../components/dashboard/BlockchainIntegrationModule';
import nodeRegistrationService from '../../../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../../../lib/utils/walletSignature';

/**
 * Constants for configuration and error messages
 */
const ERROR_MESSAGES = {
  WALLET_NOT_CONNECTED: 'Wallet not connected',
  SIGNATURE_FAILED: 'Failed to generate wallet signature',
  API_ERROR: 'Failed to fetch nodes data',
  NO_NODES_FOUND: 'No nodes found for this wallet',
  NETWORK_ERROR: 'Network connection error'
};

const CACHE_DURATION = {
  NODES_DATA: 5 * 60 * 1000, // 5 minutes
  PERFORMANCE_DATA: 2 * 60 * 1000 // 2 minutes
};

/**
 * Main Nodes Management Page Component
 */
export default function NodesPage() {
  const { wallet } = useWallet();
  const router = useRouter();
  
  // ==================== STATE MANAGEMENT ====================
  
  // Core data state
  const [nodes, setNodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  
  // UI state
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [showBlockchainModal, setShowBlockchainModal] = useState(false);
  
  // Statistics state
  const [nodeStats, setNodeStats] = useState({
    total: 0,
    online: 0,
    offline: 0,
    pending: 0
  });
  
  const [blockchainStats, setBlockchainStats] = useState({
    totalNodes: 0,
    blockchainNodes: 0,
    potentialEarnings: 0
  });
  
  // Debug state (removed in production)
  const [rawApiResponse, setRawApiResponse] = useState(null);

  // ==================== LIFECYCLE HOOKS ====================
  
  /**
   * Effect: Handle wallet connection and initial data loading
   */
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
      return;
    }

    // Load nodes data when wallet is connected
    fetchNodesData();
  }, [wallet.connected, wallet.address, router]);

  // ==================== DATA FETCHING METHODS ====================
  
  /**
   * Fetch comprehensive nodes data from the API
   * 
   * This is the main data fetching method that retrieves user's nodes,
   * transforms the data for UI consumption, and updates all related statistics.
   */
  const fetchNodesData = useCallback(async () => {
    if (!wallet.connected || !wallet.address) {
      setError(ERROR_MESSAGES.WALLET_NOT_CONNECTED);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Generate signature message for authentication
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || ERROR_MESSAGES.SIGNATURE_FAILED);
      }

      const message = messageResponse.data.message;
      const formattedMessage = formatMessageForSigning(message);

      // Step 2: Get wallet signature
      const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);

      // Step 3: Fetch user nodes overview
      const overviewResponse = await nodeRegistrationService.getUserNodesOverview(
        wallet.address,
        signature,
        message,
        'okx'
      );

      if (overviewResponse.success && overviewResponse.data) {
        // Store raw response for debugging (remove in production)
        if (process.env.NODE_ENV === 'development') {
          setRawApiResponse(overviewResponse.data);
        }
        
        // Process and transform the API response
        await processNodesData(overviewResponse.data);
        
        setLastRefresh(new Date());
      } else {
        throw new Error(overviewResponse.message || ERROR_MESSAGES.API_ERROR);
      }

    } catch (err) {
      console.error('Error fetching nodes data:', err);
      handleFetchError(err);
    } finally {
      setIsLoading(false);
    }
  }, [wallet.connected, wallet.address, wallet.provider]);

  /**
   * Process and transform API response data for UI consumption
   * 
   * @param {Object} apiData - Raw API response data
   */
  const processNodesData = async (apiData) => {
    const { summary, nodes: nodesByStatus } = apiData;
    
    // Combine all nodes from different status categories
    const allNodes = [
      ...(nodesByStatus.online || []),
      ...(nodesByStatus.active || []),
      ...(nodesByStatus.offline || [])
    ];

    // Transform nodes data to match UI component expectations
    const transformedNodes = allNodes.map(transformNodeData);

    setNodes(transformedNodes);
    
    // Calculate and update statistics
    updateNodeStatistics(transformedNodes);
    updateBlockchainStatistics(transformedNodes);
  };

  /**
   * Transform individual node data from API format to UI format
   * 
   * @param {Object} node - Raw node data from API
   * @returns {Object} Transformed node data for UI
   */
  const transformNodeData = (node) => ({
    // Core identifiers
    id: node.reference_code || node.id || `node-${Date.now()}-${Math.random()}`,
    referenceCode: node.reference_code || node.id,
    
    // Basic information
    name: node.name || 'Unnamed Node',
    status: node.status || 'unknown',
    type: node.node_type?.id || node.node_type || 'general',
    
    // Timestamps
    registeredDate: node.created_at || new Date().toISOString(),
    lastSeen: node.last_seen || null,
    activatedAt: node.activated_at || null,
    
    // Performance and connection
    uptime: node.uptime || calculateUptime(node.last_seen, node.created_at),
    earnings: parseEarnings(node.earnings),
    resources: transformResources(node.performance),
    
    // Connection status
    isConnected: node.is_connected || false,
    connectionStatus: node.connection_status || 'offline',
    offlineDuration: node.connection_details?.offline_duration_formatted || null,
    
    // Node type information
    nodeTypeInfo: node.node_type || null,
    
    // Additional features
    blockchainIntegrations: Array.isArray(node.blockchain_integrations) ? node.blockchain_integrations : [],
    
    // Extended information
    totalTasks: typeof node.total_tasks === 'number' ? node.total_tasks : 0,
    completedTasks: typeof node.completed_tasks === 'number' ? node.completed_tasks : 0,
    nodeVersion: node.node_version || 'Unknown',
    publicIp: node.public_ip || null,
    registrationStatus: node.registration_status || {}
  });

  /**
   * Transform performance data from API format to UI resources format
   * 
   * @param {Object} performance - Performance data from API
   * @returns {Object} Transformed resources data
   */
  const transformResources = (performance) => {
    if (!performance || typeof performance !== 'object') {
      return {
        cpu: { total: 'Unknown', usage: 0 },
        memory: { total: 'Unknown', usage: 0 },
        storage: { total: 'Unknown', usage: 0 },
        bandwidth: { total: 'Unknown', usage: 0 }
      };
    }

    return {
      cpu: {
        total: 'Unknown', // API doesn't provide total resource information
        usage: validateUsagePercentage(performance.cpu_usage)
      },
      memory: {
        total: 'Unknown',
        usage: validateUsagePercentage(performance.memory_usage)
      },
      storage: {
        total: 'Unknown',
        usage: validateUsagePercentage(performance.storage_usage)
      },
      bandwidth: {
        total: 'Unknown',
        usage: validateUsagePercentage(performance.bandwidth_usage)
      }
    };
  };

  /**
   * Validate and normalize usage percentage values
   * 
   * @param {number|string} usage - Raw usage value
   * @returns {number} Validated usage percentage (0-100)
   */
  const validateUsagePercentage = (usage) => {
    const numericUsage = Number(usage);
    if (isNaN(numericUsage)) return 0;
    return Math.max(0, Math.min(100, numericUsage));
  };

  /**
   * Parse earnings value from various formats
   * 
   * @param {string|number} earnings - Raw earnings value
   * @returns {number} Parsed earnings as number
   */
  const parseEarnings = (earnings) => {
    if (typeof earnings === 'string') {
      const parsed = parseFloat(earnings);
      return isNaN(parsed) ? 0 : parsed;
    }
    if (typeof earnings === 'number') {
      return earnings;
    }
    return 0;
  };

  /**
   * Calculate uptime based on timestamps
   * 
   * @param {string|null} lastSeen - Last seen timestamp
   * @param {string} createdAt - Creation timestamp
   * @returns {string} Formatted uptime string
   */
  const calculateUptime = (lastSeen, createdAt) => {
    if (!createdAt) return '0 days, 0 hours';
    
    const now = new Date();
    const created = new Date(createdAt);
    
    // If never seen or seen too long ago, consider as no uptime
    if (!lastSeen) return '0 days, 0 hours';
    
    const lastSeenDate = new Date(lastSeen);
    const isRecentlyActive = (now - lastSeenDate) < (10 * 60 * 1000); // 10 minutes threshold
    
    if (!isRecentlyActive) return '0 days, 0 hours';
    
    const diffMs = now - created;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days} days, ${hours} hours`;
  };

  /**
   * Update node statistics based on current nodes data
   * 
   * @param {Array} nodesData - Array of transformed node data
   */
  const updateNodeStatistics = (nodesData) => {
    const stats = {
      total: nodesData.length,
      online: nodesData.filter(node => node.status === 'online' || node.status === 'active').length,
      offline: nodesData.filter(node => node.status === 'offline').length,
      pending: nodesData.filter(node => node.status === 'pending' || node.status === 'registered').length
    };
    
    setNodeStats(stats);
  };

  /**
   * Update blockchain integration statistics
   * 
   * @param {Array} nodesData - Array of transformed node data
   */
  const updateBlockchainStatistics = (nodesData) => {
    const blockchainNodes = nodesData.filter(node => 
      node.blockchainIntegrations && node.blockchainIntegrations.length > 0
    ).length;
    
    // Calculate potential earnings for non-integrated online nodes
    const eligibleNodes = nodesData.filter(node => 
      (node.status === 'online' || node.status === 'active') && 
      node.blockchainIntegrations.length === 0
    );
    
    // Simplified earnings estimation (can be made more sophisticated)
    const potentialEarnings = eligibleNodes.length * 12.5; // $12.5 per month per node

    setBlockchainStats({
      totalNodes: nodesData.length,
      blockchainNodes,
      potentialEarnings
    });
  };

  /**
   * Handle errors during data fetching
   * 
   * @param {Error} err - The error object
   */
  const handleFetchError = (err) => {
    let errorMessage = err.message || ERROR_MESSAGES.API_ERROR;
    
    // Handle specific error cases
    if (err.message && err.message.includes('no nodes')) {
      // Not really an error - user just has no nodes yet
      setNodes([]);
      setNodeStats({ total: 0, online: 0, offline: 0, pending: 0 });
      setBlockchainStats({ totalNodes: 0, blockchainNodes: 0, potentialEarnings: 0 });
      setError(null);
      return;
    }
    
    if (err.message && err.message.includes('Network error')) {
      errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
    }
    
    setError(errorMessage);
  };

  // ==================== UI EVENT HANDLERS ====================
  
  /**
   * Handle manual refresh of nodes data
   */
  const handleRefreshNodes = useCallback(() => {
    fetchNodesData();
  }, [fetchNodesData]);

  /**
   * Handle node selection for blockchain integration
   * 
   * @param {Object} node - Selected node object
   */
  const handleNodeSelect = useCallback((node) => {
    setSelectedNode(node);
    setShowBlockchainModal(true);
  }, []);

  /**
   * Fetch detailed status for a specific node
   * 
   * @param {string} referenceCode - Node reference code
   * @returns {Promise<Object|null>} Node details or null
   */
  const fetchNodeDetails = useCallback(async (referenceCode) => {
    if (!wallet.connected || !referenceCode) return null;
    
    try {
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      const message = messageResponse.data.message;
      const formattedMessage = formatMessageForSigning(message);
      const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);

      const detailsResponse = await nodeRegistrationService.getNodeDetailedStatus(
        wallet.address,
        signature,
        message,
        referenceCode,
        'okx'
      );

      if (detailsResponse.success) {
        return detailsResponse.data;
      }
    } catch (err) {
      console.error('Failed to fetch node details:', err);
    }
    return null;
  }, [wallet.connected, wallet.address, wallet.provider]);

  // ==================== COMPUTED VALUES ====================
  
  /**
   * Filter nodes based on current filter and search criteria
   */
  const filteredNodes = React.useMemo(() => {
    return nodes.filter(node => {
      // Apply status filter
      let matchesFilter = false;
      
      switch (filter) {
        case 'all':
          matchesFilter = true;
          break;
        case 'online':
          matchesFilter = node.status === 'online' || node.status === 'active';
          break;
        case 'offline':
          matchesFilter = node.status === 'offline';
          break;
        case 'pending':
          matchesFilter = node.status === 'pending' || node.status === 'registered';
          break;
        default:
          matchesFilter = node.status === filter;
      }
      
      // Apply search filter
      const matchesSearch = searchTerm === '' || 
        node.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        node.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        node.referenceCode.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesFilter && matchesSearch;
    });
  }, [nodes, filter, searchTerm]);

  // ==================== RENDER GUARDS ====================
  
  // Redirect if wallet not connected
  if (!wallet.connected) {
    return null;
  }

  // ==================== RENDER COMPONENT ====================
  
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-grow container-custom py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
              Dashboard
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-white">My Nodes</span>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">My Nodes</h1>
              <p className="text-gray-400">
                Manage your registered nodes on the AeroNyx network
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-3">
              <button 
                onClick={handleRefreshNodes}
                disabled={isLoading}
                className={`button-outline flex items-center gap-2 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-label="Refresh nodes data"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              
              <Link 
                href="/dashboard/register"
                className="button-primary flex items-center gap-2 whitespace-nowrap"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Register New Node
              </Link>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-800 rounded-md text-red-200">
            <div className="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-bold">Error loading nodes</span>
            </div>
            <p className="text-sm mb-3">{error}</p>
            <button 
              onClick={handleRefreshNodes}
              className="text-sm underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Node Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Total Nodes</h3>
            <div className="text-2xl font-bold">{nodeStats.total}</div>
          </div>
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Online</h3>
            <div className="text-2xl font-bold text-green-500">{nodeStats.online}</div>
          </div>
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Offline</h3>
            <div className="text-2xl font-bold text-red-500">{nodeStats.offline}</div>
          </div>
          <div className="card glass-effect">
            <h3 className="text-sm text-gray-400 mb-1">Pending</h3>
            <div className="text-2xl font-bold text-yellow-500">{nodeStats.pending}</div>
          </div>
        </div>
        
        {/* Blockchain Integration Module */}
        <div className="mb-8">
          <div className="card glass-effect overflow-hidden">
            <div className="flex flex-col md:flex-row">
              {/* Stats and Info */}
              <div className="p-6 md:w-1/2">
                <div className="flex items-center gap-2 mb-3">
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-primary" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 5C4 4.44772 4.44772 4 5 4H19C19.5523 4 20 4.44772 20 5V7C20 7.55228 19.5523 8 19 8H5C4.44772 8 4 7.55228 4 7V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 13C4 12.4477 4.44772 12 5 12H11C11.5523 12 12 12.4477 12 13V19C12 19.5523 11.5523 20 11 20H5C4.44772 20 4 19.5523 4 19V13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 13C16 12.4477 16.4477 12 17 12H19C19.5523 12 20 12.4477 20 13V19C20 19.5523 19.5523 20 19 20H17C16.4477 20 16 19.5523 16 19V13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <h2 className="text-xl font-bold">Blockchain Integration</h2>
                </div>
                
                <p className="text-gray-300 mb-6">
                  Supercharge your AeroNyx nodes by integrating with leading blockchains. Unlock additional revenue streams and contribute to decentralized networks.
                </p>
                
                <div className="space-y-5 mb-6">
                  <div className="flex justify-between items-center">
                    <div className="text-sm">
                      <div className="text-gray-400">Nodes with blockchain integrations</div>
                      <div className="flex items-center gap-1">
                        <div className="font-bold text-lg">{blockchainStats.blockchainNodes}</div>
                        <div className="text-xs text-gray-400">of {blockchainStats.totalNodes}</div>
                      </div>
                    </div>
                    
                    <div className="h-10 w-10 rounded-full bg-background-100 flex items-center justify-center">
                      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold">
                        {blockchainStats.totalNodes > 0 ? Math.round((blockchainStats.blockchainNodes / blockchainStats.totalNodes) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Potential additional monthly earnings</div>
                    <div className="text-2xl font-bold">${blockchainStats.potentialEarnings.toFixed(2)}</div>
                  </div>
                </div>
                
                <button
                  onClick={() => setShowBlockchainModal(true)}
                  className="button-primary w-full py-3"
                >
                  Explore Blockchain Integration
                </button>
              </div>
              
              {/* Blockchain Logos */}
              <div className="md:w-1/2 bg-gradient-to-br from-background-100 via-background-50 to-background-100 p-6 flex flex-col justify-between">
                <div>
                  <div className="text-sm text-gray-400 mb-4">Compatible with leading blockchains</div>
                  
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 flex flex-col items-center">
                      <img src="/images/solana-logo.svg" alt="Solana" className="h-8 mb-2" />
                      <div className="text-xs font-medium text-center">Solana</div>
                    </div>
                    
                    <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 flex flex-col items-center">
                      <img src="/images/monad-logo.svg" alt="Monad" className="h-8 mb-2" />
                      <div className="text-xs font-medium text-center">Monad</div>
                    </div>
                    
                    <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 flex flex-col items-center">
                      <div className="h-8 mb-2 flex items-center justify-center text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <div className="text-xs font-medium text-center text-gray-400">Coming Soon</div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                    </svg>
                    <h4 className="font-bold">Pro tip</h4>
                  </div>
                  <p className="text-xs text-gray-300">
                    Nodes with blockchain integrations report 35% higher total earnings on average. Validators on multiple networks create resilient, diversified income streams.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter and Search Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          {/* Status Filter */}
          <div className="flex">
            {[
              { key: 'all', label: 'All' },
              { key: 'online', label: 'Online' },
              { key: 'offline', label: 'Offline' },
              { key: 'pending', label: 'Pending' }
            ].map(({ key, label }, index, array) => (
              <button 
                key={key}
                className={`px-4 py-2 ${
                  index === 0 ? 'rounded-l-md' : index === array.length - 1 ? 'rounded-r-md' : ''
                } ${
                  filter === key 
                    ? 'bg-primary text-white' 
                    : 'bg-background-100 text-gray-300 hover:bg-background-200'
                } transition-colors`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          
          {/* Search Input */}
          <div className="flex-grow">
            <div className="relative">
              <input
                type="text"
                className="input-field w-full pl-10"
                placeholder="Search nodes by name or reference code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Nodes List or Empty State */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : filteredNodes.length > 0 ? (
          <NodeList 
            nodes={filteredNodes} 
            onBlockchainIntegrate={handleNodeSelect}
            onNodeDetails={fetchNodeDetails}
          />
        ) : (
          <div className="card glass-effect p-8 text-center">
            <h3 className="text-xl font-bold mb-4">No Nodes Found</h3>
            <p className="text-gray-400 mb-6">
              {nodes.length === 0 
                ? "You haven't registered any nodes yet. Get started by registering your first node!"
                : "No nodes match your current filter criteria. Try adjusting your search or filter settings."
              }
            </p>
            {nodes.length === 0 && (
              <Link 
                href="/dashboard/register"
                className="button-primary inline-flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Register Your First Node
              </Link>
            )}
          </div>
        )}
        
        {/* Refresh Information */}
        {lastRefresh && (
          <div className="mt-6 text-center text-sm text-gray-400">
            Last updated: {lastRefresh.toLocaleString()}
          </div>
        )}
      </main>
      
      {/* Blockchain Integration Modal */}
      {showBlockchainModal && (
        <BlockchainIntegrationModule 
          isOpen={showBlockchainModal}
          onClose={() => setShowBlockchainModal(false)}
          selectedNode={selectedNode}
        />
      )}
      
      {/* Debug Component (Development Only) */}
      {process.env.NODE_ENV === 'development' && rawApiResponse && (
        <div className="fixed bottom-4 right-4 z-50">
          <details className="bg-black text-green-400 p-4 rounded-md border border-gray-600 font-mono text-xs max-w-md">
            <summary className="cursor-pointer text-white font-bold mb-2">🐛 Debug Data</summary>
            <pre className="whitespace-pre-wrap break-all max-h-64 overflow-auto">
              {JSON.stringify(rawApiResponse, null, 2)}
            </pre>
          </details>
        </div>
      )}
      
      {/* Footer */}
      <footer className="bg-background-100 border-t border-background-200 py-4">
        <div className="container-custom">
          <div className="text-sm text-gray-400 text-center">
            © {new Date().getFullYear()} AeroNyx Network. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
