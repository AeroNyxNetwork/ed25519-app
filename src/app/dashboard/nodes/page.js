'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../../components/layout/Header';
import { useWallet } from '../../../components/wallet/WalletProvider';
import Link from 'next/link';
import NodeList from '../../../components/dashboard/NodeList';

// Mock data for nodes
const mockNodes = [
  {
    id: 'aero-node-1a2b3c',
    name: 'Node Alpha',
    status: 'online',
    type: 'general',
    registeredDate: '2025-03-12T14:32:21Z',
    lastSeen: '2025-04-06T08:45:12Z',
    uptime: '14 days, 7 hours',
    earnings: 542.12,
    resources: {
      cpu: { total: '8 cores', usage: 65 },
      memory: { total: '16 GB', usage: 48 },
      storage: { total: '500 GB', usage: 32 },
      bandwidth: { total: '1 Gbps', usage: 27 }
    }
  },
  {
    id: 'aero-node-4d5e6f',
    name: 'Node Beta',
    status: 'online',
    type: 'compute',
    registeredDate: '2025-03-29T09:15:42Z',
    lastSeen: '2025-04-06T08:42:33Z',
    uptime: '7 days, 3 hours',
    earnings: 286.45,
    resources: {
      cpu: { total: '12 cores', usage: 32 },
      memory: { total: '32 GB', usage: 56 },
      storage: { total: '1 TB', usage: 18 },
      bandwidth: { total: '1 Gbps', usage: 41 }
    }
  },
  {
    id: 'aero-node-7g8h9i',
    name: 'Node Gamma',
    status: 'pending',
    type: 'storage',
    registeredDate: '2025-04-06T07:22:10Z',
    lastSeen: null,
    uptime: '0 days, 0 hours',
    earnings: 0,
    resources: {
      cpu: { total: '4 cores', usage: 0 },
      memory: { total: '8 GB', usage: 0 },
      storage: { total: '2 TB', usage: 0 },
      bandwidth: { total: '500 Mbps', usage: 0 }
    }
  },
  {
    id: 'aero-node-j0k1l2',
    name: 'Node Delta',
    status: 'offline',
    type: 'general',
    registeredDate: '2025-02-18T11:05:37Z',
    lastSeen: '2025-04-02T22:17:45Z',
    uptime: '0 days, 0 hours',
    earnings: 417.23,
    resources: {
      cpu: { total: '6 cores', usage: 0 },
      memory: { total: '12 GB', usage: 0 },
      storage: { total: '250 GB', usage: 0 },
      bandwidth: { total: '750 Mbps', usage: 0 }
    }
  }
];

export default function NodesPage() {
  const { wallet } = useWallet();
  const router = useRouter();
  const [nodes, setNodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Check wallet connection on page load
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
      return;
    }

    // Fetch nodes data
    const fetchNodes = async () => {
      setIsLoading(true);
      try {
        // In a real app, this would be an API call
        // const response = await fetch('/api/nodes', {
        //   headers: {
        //     'Authorization': `Bearer ${wallet.address}`
        //   }
        // });
        // const data = await response.json();
        
        // Using mock data for now
        setTimeout(() => {
          setNodes(mockNodes);
          setIsLoading(false);
        }, 1000);
      } catch (error) {
        console.error('Failed to fetch nodes:', error);
        setIsLoading(false);
        setNodes([]);
      }
    };

    fetchNodes();
  }, [wallet.connected, wallet.address, router]);

  // Filter nodes based on status and search term
  const filteredNodes = nodes.filter(node => {
    const matchesFilter = filter === 'all' || node.status === filter;
    const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          node.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Calculate node stats
  const nodeStats = {
    total: nodes.length,
    online: nodes.filter(node => node.status === 'online').length,
    offline: nodes.filter(node => node.status === 'offline').length,
    pending: nodes.filter(node => node.status === 'pending').length
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
          <NodeList nodes={filteredNodes} />
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
