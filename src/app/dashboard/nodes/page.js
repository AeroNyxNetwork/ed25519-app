'use client';

/**
 * : src/app/dashboard/nodes/page.js
 * Enhanced Nodes Management Page with real API integration
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../../components/layout/Header';
import { useWallet } from '../../../components/wallet/WalletProvider';
import Link from 'next/link';
import NodeList from '../../../components/dashboard/NodeList';
import BlockchainIntegrationModule from '../../../components/dashboard/BlockchainIntegrationModule';
import nodeRegistrationService from '../../../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../../../lib/utils/walletSignature';

export default function NodesPage() {
  const { wallet } = useWallet();
  const router = useRouter();
  
  // 状态管理
  const [nodes, setNodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [showBlockchainModal, setShowBlockchainModal] = useState(false);
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

  // Check wallet connection on page load
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
      return;
    }

    // Fetch nodes data when wallet is connected
    fetchNodesData();
  }, [wallet.connected, wallet.address, router]);

  /**
   * 获取节点数据（使用新的 API）
   */
  const fetchNodesData = async () => {
    if (!wallet.connected || !wallet.address) return;

    setIsLoading(true);
    setError(null);

    try {
      // 1. 生成签名消息
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }

      const message = messageResponse.data.message;
      const formattedMessage = formatMessageForSigning(message);

      // 2. 获取钱包签名
      const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);

      // 3. 获取用户节点概览（使用新的 API）
      const overviewResponse = await nodeRegistrationService.getUserNodesOverview(
        wallet.address,
        signature,
        message,
        'okx'
      );

      if (overviewResponse.success && overviewResponse.data) {
        const { summary, nodes: nodesByStatus } = overviewResponse.data;
        
        // 合并所有状态的节点
        const allNodes = [
          ...(nodesByStatus.online || []),
          ...(nodesByStatus.active || []),
          ...(nodesByStatus.offline || [])
        ];

        // 转换节点数据格式以匹配现有组件
        const transformedNodes = allNodes.map(node => ({
          id: node.reference_code || node.id,
          name: node.name || 'Unnamed Node',
          status: node.status,
          type: node.node_type || 'general',
          registeredDate: node.created_at || new Date().toISOString(),
          lastSeen: node.last_heartbeat || null,
          uptime: calculateUptime(node.last_heartbeat, node.created_at),
          earnings: node.total_earnings || 0,
          resources: transformResources(node.resources),
          blockchainIntegrations: node.blockchain_integrations || [],
          referenceCode: node.reference_code
        }));

        setNodes(transformedNodes);
        
        // 设置节点统计
        setNodeStats({
          total: summary.total_nodes || 0,
          online: summary.online_nodes || 0,
          offline: summary.offline_nodes || 0,
          pending: (summary.total_nodes - summary.online_nodes - summary.offline_nodes) || 0
        });

        // 计算区块链统计
        const blockchainNodes = transformedNodes.filter(node => 
          node.blockchainIntegrations && node.blockchainIntegrations.length > 0
        ).length;
        
        const onlineNodes = transformedNodes.filter(node => 
          node.status === 'online' && node.blockchainIntegrations.length === 0
        );
        const potentialEarnings = onlineNodes.length * 12.5; // 简化估算

        setBlockchainStats({
          totalNodes: transformedNodes.length,
          blockchainNodes,
          potentialEarnings
        });
      }

    } catch (err) {
      console.error('Failed to fetch nodes:', err);
      setError(err.message || 'Failed to fetch nodes data');
      // 如果是新用户或者没有节点，设置空数组而不是错误
      if (err.message && err.message.includes('No nodes found')) {
        setNodes([]);
        setNodeStats({ total: 0, online: 0, offline: 0, pending: 0 });
        setBlockchainStats({ totalNodes: 0, blockchainNodes: 0, potentialEarnings: 0 });
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 计算节点运行时间
   */
  const calculateUptime = (lastHeartbeat, createdAt) => {
    if (!lastHeartbeat || !createdAt) return '0 days, 0 hours';
    
    const now = new Date();
    const created = new Date(createdAt);
    const lastSeen = new Date(lastHeartbeat);
    
    // 如果最后心跳超过10分钟，认为离线
    const isOnline = (now - lastSeen) < (10 * 60 * 1000);
    
    if (!isOnline) return '0 days, 0 hours';
    
    const diffMs = now - created;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days} days, ${hours} hours`;
  };

  /**
   * 转换资源数据格式
   */
  const transformResources = (resources) => {
    if (!resources) {
      return {
        cpu: { total: 'Unknown', usage: 0 },
        memory: { total: 'Unknown', usage: 0 },
        storage: { total: 'Unknown', usage: 0 },
        bandwidth: { total: 'Unknown', usage: 0 }
      };
    }

    return {
      cpu: {
        total: resources.cpu_cores ? `${resources.cpu_cores} cores` : 'Unknown',
        usage: resources.cpu_usage || 0
      },
      memory: {
        total: resources.memory_gb ? `${resources.memory_gb} GB` : 'Unknown',
        usage: resources.memory_usage || 0
      },
      storage: {
        total: resources.storage_gb ? `${resources.storage_gb} GB` : 'Unknown',
        usage: resources.storage_usage || 0
      },
      bandwidth: {
        total: resources.bandwidth_mbps ? `${resources.bandwidth_mbps} Mbps` : 'Unknown',
        usage: resources.bandwidth_usage || 0
      }
    };
  };

  /**
   * 刷新节点数据
   */
  const handleRefreshNodes = () => {
    fetchNodesData();
  };

  /**
   * 获取节点详细状态
   */
  const fetchNodeDetails = async (referenceCode) => {
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
  };

  // Filter nodes based on status and search term
  const filteredNodes = nodes.filter(node => {
    const matchesFilter = filter === 'all' || node.status === filter;
    const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          node.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Handle node selection for blockchain integration
  const handleNodeSelect = (node) => {
    setSelectedNode(node);
    setShowBlockchainModal(true);
  };

  if (!wallet.connected) {
    return null; // Will redirect to home
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-grow container-custom py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Link href="/dashboard" className="text-gray-400 hover:text-white">
              Dashboard
            </Link>
            <span className="text-gray-600">/</span>
            <span>My Nodes</span>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">My Nodes</h1>
              <p className="text-gray-400">
                Manage your registered nodes on the AeroNyx network
              </p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={handleRefreshNodes}
                disabled={isLoading}
                className="button-outline flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Refresh
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
            <p className="text-sm">{error}</p>
            <button 
              onClick={handleRefreshNodes}
              className="mt-2 text-sm underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Node Stats */}
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

        {/* Filter and Search */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex">
            <button 
              className={`px-4 py-2 rounded-l-md ${filter === 'all' ? 'bg-primary text-white' : 'bg-background-100 text-gray-300 hover:bg-background-200'}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button 
              className={`px-4 py-2 ${filter === 'online' ? 'bg-primary text-white' : 'bg-background-100 text-gray-300 hover:bg-background-200'}`}
              onClick={() => setFilter('online')}
            >
              Online
            </button>
            <button 
              className={`px-4 py-2 ${filter === 'offline' ? 'bg-primary text-white' : 'bg-background-100 text-gray-300 hover:bg-background-200'}`}
              onClick={() => setFilter('offline')}
            >
              Offline
            </button>
            <button 
              className={`px-4 py-2 rounded-r-md ${filter === 'pending' ? 'bg-primary text-white' : 'bg-background-100 text-gray-300 hover:bg-background-200'}`}
              onClick={() => setFilter('pending')}
            >
              Pending
            </button>
          </div>
          <div className="flex-grow">
            <div className="relative">
              <input
                type="text"
                className="input-field w-full pl-10"
                placeholder="Search nodes..."
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

        {/* Node List */}
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
                ? "You haven't registered any nodes yet."
                : "No nodes match your current filter criteria."
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
      </main>
      
      {/* Blockchain Integration Modal */}
      {showBlockchainModal && (
        <BlockchainIntegrationModule 
          isOpen={showBlockchainModal}
          onClose={() => setShowBlockchainModal(false)}
          selectedNode={selectedNode}
        />
      )}
      
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
