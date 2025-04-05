'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../../components/layout/Header';
import { useWallet } from '../../../components/wallet/WalletProvider';
import Link from 'next/link';
import NetworkStatusChart from '../../../components/dashboard/NetworkStatusChart';

// Mock data for network stats
const mockNetworkData = {
  activeNodes: 14758,
  totalNodes: 16502,
  totalStaked: 245678932,
  networkUtilization: 78.4,
  averageUptime: 97.2,
  regions: [
    { name: 'North America', nodes: 5248, percentage: 31.8 },
    { name: 'Europe', nodes: 4892, percentage: 29.6 },
    { name: 'Asia', nodes: 3621, percentage: 21.9 },
    { name: 'South America', nodes: 1485, percentage: 9.0 },
    { name: 'Oceania', nodes: 825, percentage: 5.0 },
    { name: 'Africa', nodes: 431, percentage: 2.7 },
  ],
  resourceTypes: [
    { name: 'CPU', total: '148.5 PFLOPS', usage: 82 },
    { name: 'GPU', total: '56.8 PFLOPS', usage: 91 },
    { name: 'Storage', total: '12.4 PB', usage: 68 },
    { name: 'Bandwidth', total: '845 Tbps', usage: 73 },
  ],
  nodesHistory: [
    { date: '2025-01', count: 8245 },
    { date: '2025-02', count: 10387 },
    { date: '2025-03', count: 13569 },
    { date: '2025-04', count: 16502 }
  ],
  utilizationHistory: [
    { date: '2025-01', value: 65.2 },
    { date: '2025-02', value: 72.8 },
    { date: '2025-03', value: 76.3 },
    { date: '2025-04', value: 78.4 }
  ],
  latestBlocks: [
    { id: '0x8f42...e91a', timestamp: '2025-04-06T08:55:22Z', nodes: 42, transactions: 128 },
    { id: '0x7b3d...a45c', timestamp: '2025-04-06T08:54:12Z', nodes: 39, transactions: 95 },
    { id: '0x6a1e...c23b', timestamp: '2025-04-06T08:53:02Z', nodes: 41, transactions: 112 },
    { id: '0x5f9c...d67d', timestamp: '2025-04-06T08:51:52Z', nodes: 40, transactions: 87 },
    { id: '0x4e8b...b34e', timestamp: '2025-04-06T08:50:42Z', nodes: 38, transactions: 103 },
  ]
};

export default function NetworkPage() {
  const { wallet } = useWallet();
  const router = useRouter();
  const [networkData, setNetworkData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('day');

  // Check wallet connection on page load
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
      return;
    }

    // Fetch network data
    const fetchNetworkData = async () => {
      setIsLoading(true);
      try {
        // In a real app, this would be an API call
        // const response = await fetch('/api/network', {
        //   headers: {
        //     'Authorization': `Bearer ${wallet.address}`
        //   }
        // });
        // const data = await response.json();
        
        // Using mock data for now
        setTimeout(() => {
          setNetworkData(mockNetworkData);
          setIsLoading(false);
        }, 1000);
      } catch (error) {
        console.error('Failed to fetch network data:', error);
        setIsLoading(false);
      }
    };

    fetchNetworkData();
  }, [wallet.connected, wallet.address, router]);

  // Format date to readable string
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
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
            <span>Network Stats</span>
          </div>
          
          <h1 className="text-3xl font-bold mb-2">AeroNyx Network Statistics</h1>
          <p className="text-gray-400">
            Real-time statistics and insights about the global AeroNyx network
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : networkData ? (
          <>
            {/* Network Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="card glass-effect">
                <h3 className="text-sm text-gray-400 mb-1">Active Nodes</h3>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold">{networkData.activeNodes.toLocaleString()}</span>
                  <span className="text-sm text-gray-400">/ {networkData.totalNodes.toLocaleString()}</span>
                </div>
              </div>
              
              <div className="card glass-effect">
                <h3 className="text-sm text-gray-400 mb-1">Total Staked</h3>
                <div className="text-2xl font-bold">{networkData.totalStaked.toLocaleString()} AeroNyx</div>
              </div>
              
              <div className="card glass-effect">
                <h3 className="text-sm text-gray-400 mb-1">Network Utilization</h3>
                <div className="text-2xl font-bold">{networkData.networkUtilization}%</div>
              </div>
              
              <div className="card glass-effect">
                <h3 className="text-sm text-gray-400 mb-1">Average Uptime</h3>
                <div className="text-2xl font-bold">{networkData.averageUptime}%</div>
              </div>
            </div>

            {/* Chart Controls */}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Network Activity</h2>
              <div className="flex rounded-md overflow-hidden">
                <button 
                  className={`px-3 py-1 text-sm ${timeRange === 'day' ? 'bg-primary text-white' : 'bg-background-100 text-gray-300 hover:bg-background-200'}`}
                  onClick={() => setTimeRange('day')}
                >
                  Day
                </button>
                <button 
                  className={`px-3 py-1 text-sm ${timeRange === 'week' ? 'bg-primary text-white' : 'bg-background-100 text-gray-300 hover:bg-background-200'}`}
                  onClick={() => setTimeRange('week')}
                >
                  Week
                </button>
                <button 
                  className={`px-3 py-1 text-sm ${timeRange === 'month' ? 'bg-primary text-white' : 'bg-background-100 text-gray-300 hover:bg-background-200'}`}
                  onClick={() => setTimeRange('month')}
                >
                  Month
                </button>
                <button 
                  className={`px-3 py-1 text-sm ${timeRange === 'all' ? 'bg-primary text-white' : 'bg-background-100 text-gray-300 hover:bg-background-200'}`}
                  onClick={() => setTimeRange('all')}
                >
                  All
                </button>
              </div>
            </div>

            {/* Network Status Chart */}
            <div className="card glass-effect mb-8">
              <NetworkStatusChart data={networkData} timeRange={timeRange} />
            </div>

            {/* Resources Section */}
            <h2 className="text-xl font-bold mb-4">Resource Utilization</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {networkData.resourceTypes.map((resource) => (
                <div key={resource.name} className="card glass-effect">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold">{resource.name}</h3>
                    <span className="text-sm text-gray-400">{resource.total}</span>
                  </div>
                  <div className="w-full bg-background-200 rounded-full h-3 mb-2">
                    <div 
                      className={`rounded-full h-3 ${
                        resource.name === 'CPU' ? 'bg-primary' : 
                        resource.name === 'GPU' ? 'bg-secondary' : 
                        resource.name === 'Storage' ? 'bg-accent' : 
                        'bg-purple-500'
                      }`}
                      style={{ width: `${resource.usage}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Current Usage</span>
                    <span>{resource.usage}%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Geographic Distribution */}
            <h2 className="text-xl font-bold mb-4">Geographic Distribution</h2>
            <div className="card glass-effect mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <div className="aspect-square bg-background-100 rounded-lg flex items-center justify-center">
                    {/* In a real app, this would be a map visualization */}
                    <div className="text-center p-8">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-gray-400">Interactive map visualization would be displayed here</p>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold mb-4">Nodes by Region</h3>
                  <div className="space-y-4">
                    {networkData.regions.map((region) => (
                      <div key={region.name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{region.name}</span>
                          <span>{region.nodes.toLocaleString()} nodes ({region.percentage}%)</span>
                        </div>
                        <div className="w-full bg-background-200 rounded-full h-2">
                          <div 
                            className="bg-primary rounded-full h-2" 
                            style={{ width: `${region.percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Latest Blocks */}
            <h2 className="text-xl font-bold mb-4">Latest Blocks</h2>
            <div className="card glass-effect mb-8 overflow-x-auto">
              <table className="w-full min-w-full">
                <thead>
                  <tr className="border-b border-background-200">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Block ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Timestamp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Nodes</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {networkData.latestBlocks.map((block, index) => (
                    <tr 
                      key={block.id} 
                      className={index !== networkData.latestBlocks.length - 1 ? "border-b border-background-200" : ""}
                    >
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">{block.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">{formatDate(block.timestamp)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">{block.nodes}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">{block.transactions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="card glass-effect p-8 text-center">
            <h3 className="text-xl font-bold mb-4">No Network Data Available</h3>
            <p className="text-gray-400 mb-6">
              We couldn't retrieve the network statistics. Please try again later.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="button-primary"
            >
              Refresh Network Stats
            </button>
          </div>
        )}
      </main>
      
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
