'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../../components/layout/Header';
import { useWallet } from '../../../components/wallet/WalletProvider';
import Link from 'next/link';

export default function BlockchainIntegrationPage() {
  const { wallet } = useWallet();
  const router = useRouter();
  const [selectedNode, setSelectedNode] = useState(null);
  
  // Check wallet connection on page load
  React.useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
    }
  }, [wallet.connected, router]);

  // Blockchains available for integration
  const blockchains = [
    {
      id: 'solana',
      name: 'Solana',
      logo: '/images/solana-logo.svg',
      description: 'High-throughput blockchain optimized for scalability and speed',
      requirements: '12+ CPU cores, 24GB+ RAM, 2TB+ SSD, 1Gbps bandwidth',
      estimatedRewards: '$150-500/month',
      status: 'production',
      color: 'purple'
    },
    {
      id: 'monad',
      name: 'Monad',
      logo: '/images/monad-logo.svg',
      description: 'Next-gen blockchain for high-frequency trading and DeFi',
      requirements: '8+ CPU cores, 16GB+ RAM, 1TB+ SSD, 500Mbps bandwidth',
      estimatedRewards: 'Early adopter rewards + future airdrops',
      status: 'testnet',
      color: 'blue'
    },
    {
      id: 'ethereum',
      name: 'Ethereum',
      logo: '/images/ethereum-logo.svg',
      description: 'Leading smart contract platform for decentralized applications',
      requirements: '16+ CPU cores, 32GB+ RAM, 4TB+ SSD, 1Gbps bandwidth',
      estimatedRewards: '$200-800/month (varies with stake)',
      status: 'coming-soon',
      color: 'teal'
    }
  ];
  
  // Handle blockchain selection and redirect to specific integration page
  const handleSelectBlockchain = (blockchain) => {
    if (blockchain.status === 'coming-soon') {
      return;
    }
    
    // Navigate to the blockchain-specific page
    router.push(`/dashboard/blockchain-integration/${blockchain.id}`);
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
            <Link href="/dashboard/nodes" className="text-gray-400 hover:text-white">
              My Nodes
            </Link>
            <span className="text-gray-600">/</span>
            <span>Blockchain Integration</span>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Blockchain Integration</h1>
              <p className="text-gray-400">
                Integrate your AeroNyx nodes with blockchain networks to earn additional rewards
              </p>
            </div>
          </div>
        </div>

        {/* Select Node Prompt (if needed) */}
        {!selectedNode && (
          <div className="card glass-effect mb-8">
            <h2 className="text-xl font-bold mb-4">Select a Node</h2>
            <p className="text-gray-300 mb-6">
              Please select one of your nodes to integrate with a blockchain network, or proceed to browse available blockchains.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => router.push('/dashboard/nodes')}
                className="button-outline mr-4"
              >
                View My Nodes
              </button>
              <button
                onClick={() => window.scrollTo({top: document.getElementById('blockchains').offsetTop - 100, behavior: 'smooth'})}
                className="button-primary"
              >
                Browse Blockchains
              </button>
            </div>
          </div>
        )}

        {/* Available Blockchains */}
        <div id="blockchains">
          <h2 className="text-xl font-bold mb-4">Available Blockchain Networks</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {blockchains.map(blockchain => (
              <div 
                key={blockchain.id}
                className={`rounded-xl border overflow-hidden transition-all ${
                  blockchain.status === 'coming-soon' 
                    ? 'border-gray-700 opacity-60 cursor-not-allowed' 
                    : `border-${blockchain.color}-800/50 hover:border-${blockchain.color}-600 cursor-pointer`
                }`}
                onClick={() => handleSelectBlockchain(blockchain)}
              >
                <div className={`py-4 px-5 border-b border-background-200 flex items-center gap-3 ${
                  blockchain.status === 'coming-soon' ? '' : `bg-${blockchain.color}-900/20`
                }`}>
                  <img src={blockchain.logo} alt={blockchain.name} className="h-8 w-8" />
                  <div>
                    <h4 className="font-bold">{blockchain.name}</h4>
                    <div className="flex items-center gap-2">
                      {blockchain.status === 'production' && (
                        <span className="text-xs py-0.5 px-2 rounded-full bg-green-900/50 text-green-400">Production</span>
                      )}
                      
                      {blockchain.status === 'testnet' && (
                        <span className="text-xs py-0.5 px-2 rounded-full bg-yellow-900/50 text-yellow-400">Testnet</span>
                      )}
                      
                      {blockchain.status === 'coming-soon' && (
                        <span className="text-xs py-0.5 px-2 rounded-full bg-gray-800 text-gray-400">Coming Soon</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="p-5 h-64 flex flex-col">
                  <p className="text-sm text-gray-300 mb-4">
                    {blockchain.description}
                  </p>
                  
                  <div className="space-y-4 mt-auto">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">System Requirements</div>
                      <div className="text-sm">{blockchain.requirements}</div>
                    </div>
                    
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Estimated Rewards</div>
                      <div className="text-sm font-bold">{blockchain.estimatedRewards}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="card glass-effect p-4">
            <h4 className="font-bold flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Important Considerations
            </h4>
            <ul className="text-sm text-gray-300 space-y-2 list-disc pl-5">
              <li>Running a validator node typically requires staking tokens</li>
              <li>Nodes must maintain high uptime to avoid penalties</li>
              <li>Hardware requirements vary by blockchain</li>
              <li>Earnings depend on network participation and token price</li>
            </ul>
          </div>
        </div>
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
