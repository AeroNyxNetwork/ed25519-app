'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BlockchainIntegrationModule({ isOpen, onClose, selectedNode }) {
  const router = useRouter();
  const [selectedBlockchain, setSelectedBlockchain] = useState(null);
  const [step, setStep] = useState(1);
  
  // Reset state when modal is opened
  useEffect(() => {
    if (isOpen) {
      setSelectedBlockchain(null);
      setStep(1);
    }
  }, [isOpen]);

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
  
  // Handle blockchain selection
  const handleSelectBlockchain = (blockchain) => {
    if (blockchain.status === 'coming-soon') {
      return;
    }
    
    setSelectedBlockchain(blockchain);
    setStep(2);
  };
  
  // Handle proceeding to setup
  const handleProceedToSetup = () => {
    // Close modal and redirect to specific blockchain setup page
    onClose();
    router.push(`/dashboard/blockchain-integration/${selectedBlockchain.id}?nodeId=${selectedNode?.id || ''}`);
  };

  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-background-200 flex justify-between items-center">
          <h2 className="text-xl font-bold">
            {step === 1 ? 'Blockchain Integration' : `${selectedBlockchain?.name} Integration`}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-grow overflow-y-auto">
          {step === 1 && (
            <div className="p-6">
              <div className="mb-6">
                <p className="text-gray-300">
                  Integrate your AeroNyx node with leading blockchain networks to create multiple revenue streams and maximize your hardware's potential.
                </p>
                
                {selectedNode && (
                  <div className="mt-4 p-3 bg-background-100 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="font-bold">Selected Node: {selectedNode.name}</span>
                    </div>
                    <p className="text-sm text-gray-400">
                      ID: {selectedNode.id}, Status: {selectedNode.status}
                    </p>
                  </div>
                )}
              </div>
              
              <h3 className="text-lg font-bold mb-4">Available Blockchain Networks</h3>
              
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
              
              <div className="bg-background-100 rounded-lg p-4">
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
          )}
          
          {step === 2 && selectedBlockchain && (
            <div className="p-6">
              <div className="mb-8">
                <div className={`p-4 rounded-lg bg-${selectedBlockchain.color}-900/20 border border-${selectedBlockchain.color}-800/50 mb-6 flex items-center gap-4`}>
                  <img src={selectedBlockchain.logo} alt={selectedBlockchain.name} className="h-10 w-10" />
                  <div>
                    <h3 className="font-bold text-lg">{selectedBlockchain.name} Validator</h3>
                    <p className="text-sm text-gray-300">{selectedBlockchain.description}</p>
                  </div>
                </div>
                
                <h3 className="font-bold mb-3">Integration Benefits</h3>
                <div className="space-y-3 mb-6">
                  <div className="flex items-start gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-medium">Diversified Revenue Streams</p>
                      <p className="text-sm text-gray-400">Earn both AeroNyx rewards and blockchain validator incentives</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-medium">Network Governance Rights</p>
                      <p className="text-sm text-gray-400">Participate in blockchain governance and protocol decisions</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-medium">Optimized Resource Utilization</p>
                      <p className="text-sm text-gray-400">Maximize your hardware's potential with dual-purpose operation</p>
                    </div>
                  </div>
                </div>
                
                <h3 className="font-bold mb-3">Requirements Check</h3>
                <div className="space-y-4 mb-6">
                  <div>
                    <div className="text-sm mb-1">System Resources</div>
                    <div className="w-full bg-background-200 rounded-full h-2.5 mb-1">
                      <div className={`rounded-full h-2.5 bg-${selectedBlockchain.color}-600`} style={{ width: '85%' }}></div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Current: {selectedNode?.resources.cpu.total}, {selectedNode?.resources.memory.total} RAM</span>
                      <span>Required: {selectedBlockchain.requirements.split(',')[0]}, {selectedBlockchain.requirements.split(',')[1]}</span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm mb-1">Network Connectivity</div>
                    <div className="w-full bg-background-200 rounded-full h-2.5 mb-1">
                      <div className={`rounded-full h-2.5 bg-${selectedBlockchain.color}-600`} style={{ width: '90%' }}></div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Current: {selectedNode?.resources.bandwidth.total}</span>
                      <span>Required: {selectedBlockchain.requirements.split(',')[3]}</span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm mb-1">Storage</div>
                    <div className="w-full bg-background-200 rounded-full h-2.5 mb-1">
                      <div className={`rounded-full h-2.5 bg-${selectedBlockchain.color}-600`} style={{ width: '75%' }}></div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Current: {selectedNode?.resources.storage.total}</span>
                      <span>Required: {selectedBlockchain.requirements.split(',')[2]}</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-yellow-900/30 border border-yellow-800 p-4 rounded-md mb-6">
                  <h4 className="font-bold flex items-center gap-2 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Important Note
                  </h4>
                  <p className="text-sm text-gray-300">
                    Running a {selectedBlockchain.name} validator requires careful setup and maintenance. Please ensure your system meets all requirements and you're prepared to maintain high uptime.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-background-200 flex justify-between">
          <button
            onClick={() => step === 1 ? onClose() : setStep(1)}
            className="button-outline"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          
          {step === 2 && (
            <button
              onClick={handleProceedToSetup}
              className={`button-primary bg-${selectedBlockchain?.color}-700 hover:bg-${selectedBlockchain?.color}-600`}
            >
              Proceed to Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
