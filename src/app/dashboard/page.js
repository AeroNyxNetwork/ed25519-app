'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../components/layout/Header';
import { useWallet } from '../../components/wallet/WalletProvider';
import NodeStatusCard from '../../components/dashboard/NodeStatusCard';
import Link from 'next/link';

// Enhanced mock data for dashboard display
const mockData = {
  stats: {
    totalNodes: 4,
    activeNodes: 2,
    pendingNodes: 1,
    offlineNodes: 1,
    totalEarnings: 1245.78,
    networkContribution: '0.0023%',
    resourceUtilization: 78
  },
  nodes: [
    {
      id: 'aero-node-1a2b3c',
      name: 'Node Alpha',
      status: 'online',
      type: 'general',
      deviceId: 'aero-node-1a2b3c',
      uptime: '14 days, 7 hours',
      earnings: 542.12,
      cpu: 65,
      memory: 48
    },
    {
      id: 'aero-node-4d5e6f',
      name: 'Node Beta',
      status: 'online',
      type: 'compute',
      deviceId: 'aero-node-4d5e6f',
      uptime: '7 days, 3 hours',
      earnings: 286.45,
      cpu: 32,
      memory: 56
    },
    {
      id: 'aero-node-7g8h9i',
      name: 'Onion Router',
      status: 'pending',
      type: 'onion',
      deviceId: 'aero-node-7g8h9i',
      uptime: '0 days, 0 hours',
      earnings: 0,
      cpu: 0,
      memory: 0
    },
    {
      id: 'aero-node-j0k1l2',
      name: 'Privacy Guardian',
      status: 'offline',
      type: 'privacy',
      deviceId: 'aero-node-j0k1l2',
      uptime: '0 days, 0 hours',
      earnings: 417.23,
      cpu: 0,
      memory: 0
    }
  ]
};

export default function Dashboard() {
  const { wallet } = useWallet();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check wallet connection
    if (!wallet.connected) {
      router.push('/');
      return;
    }

    // Fetch dashboard data
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // In a real app, you would fetch this from your API
        // const response = await fetch('/api/dashboard', {
        //   headers: {
        //     'Authorization': `Bearer ${wallet.address}`
        //   }
        // });
        // const data = await response.json();
        
        // Using mock data for now
        setTimeout(() => {
          setDashboardData(mockData);
          setIsLoading(false);
        }, 1000);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [wallet.connected, wallet.address, router]);

  if (!wallet.connected) {
    return null; // Will redirect to home page
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-grow container-custom py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-gray-400">
            Welcome to your AeroNyx Node Management Dashboard
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : dashboardData ? (
          <>
            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <Link href="/dashboard/register" className="card glass-effect flex items-center gap-4 hover:bg-background-100 transition-colors">
                <div className="p-3 rounded-full bg-primary-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold">Register New Node</h3>
                  <p className="text-sm text-gray-400">Add a new device to the AeroNyx network</p>
                </div>
              </Link>
              
              <Link href="/dashboard/nodes" className="card glass-effect flex items-center gap-4 hover:bg-background-100 transition-colors">
                <div className="p-3 rounded-full bg-secondary-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold">Manage Nodes</h3>
                  <p className="text-sm text-gray-400">View and manage your registered nodes</p>
                </div>
              </Link>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="card glass-effect">
                <h3 className="text-gray-400 text-sm mb-1">Total Nodes</h3>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold">{dashboardData.stats.totalNodes}</span>
                </div>
              </div>
              
              <div className="card glass-effect">
                <h3 className="text-gray-400 text-sm mb-1">Node Status</h3>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-sm">{dashboardData.stats.activeNodes} Active</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-500"></span>
                    <span className="text-sm">{dashboardData.stats.pendingNodes} Pending</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
                    <span className="text-sm">{dashboardData.stats.offlineNodes} Offline</span>
                  </div>
                </div>
              </div>
              
              <div className="card glass-effect">
                <h3 className="text-gray-400 text-sm mb-1">Total Earnings</h3>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold">{dashboardData.stats.totalEarnings}</span>
                  <div className="text-xs text-gray-400 mb-1">AeroNyx</div>
                </div>
              </div>
              
              <div className="card glass-effect">
                <h3 className="text-gray-400 text-sm mb-1">Network Contribution</h3>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold">{dashboardData.stats.networkContribution}</span>
                  <div className="text-xs text-gray-400 mb-1">of Global Resources</div>
                </div>
              </div>
            </div>

            {/* Resource Utilization */}
            <div className="card glass-effect mb-8">
              <h2 className="text-xl font-bold mb-4">Resource Utilization</h2>
              <div className="w-full bg-background-200 rounded-full h-4 mb-2">
                <div 
                  className="bg-primary rounded-full h-4" 
                  style={{ width: `${dashboardData.stats.resourceUtilization}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-sm text-gray-400">
                <span>Current: {dashboardData.stats.resourceUtilization}%</span>
                <span>Target: 100%</span>
              </div>
            </div>

            {/* Node Status Overview */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Node Status</h2>
                <Link href="/dashboard/nodes" className="text-primary hover:text-primary-400 text-sm">
                  View All Nodes →
                </Link>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {dashboardData.nodes.map(node => (
                  <NodeStatusCard 
                    key={node.id}
                    name={node.name}
                    status={node.status}
                    deviceId={node.deviceId}
                    uptime={node.uptime}
                    earnings={node.earnings}
                    cpu={node.cpu}
                    memory={node.memory}
                    type={node.type}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="card glass-effect p-8 text-center">
            <h3 className="text-xl font-bold mb-4">No Data Available</h3>
            <p className="text-gray-400 mb-6">
              We couldn't retrieve your dashboard data. Please try again later.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="button-primary"
            >
              Refresh Dashboard
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
