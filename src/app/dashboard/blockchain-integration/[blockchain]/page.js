'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Header from '../../../../components/layout/Header';
import { useWallet } from '../../../../components/wallet/WalletProvider';
import Link from 'next/link';

export default function BlockchainIntegrationPage() {
  const { wallet } = useWallet();
  const router = useRouter();
  const { blockchain } = useParams();
  const searchParams = useSearchParams();
  const nodeId = searchParams.get('nodeId');
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [nodeInfo, setNodeInfo] = useState(null);
  const [walletKey, setWalletKey] = useState('');
  const [voteAccountKey, setVoteAccountKey] = useState('');
  const [blockchainMetadata, setBlockchainMetadata] = useState(null);

  // Supported blockchains data
  const blockchainData = {
    'solana': {
      name: 'Solana',
      logo: '/images/solana-logo.svg',
      description: 'High-throughput blockchain optimized for scalability and speed',
      color: 'purple',
      requirements: [
        '12+ CPU cores',
        '24GB+ RAM',
        '2TB+ SSD',
        '1Gbps bandwidth'
      ],
      estimatedRewards: '$150-500/month',
      setupCommands: [
        { 
          label: "Install Solana CLI", 
          code: "sh -c \"$(curl -sSfL https://release.solana.com/v1.16.0/install)\"" 
        },
        { 
          label: "Create identity keypair", 
          code: "solana-keygen new -o ~/validator-keypair.json" 
        },
        { 
          label: "Create vote account", 
          code: "solana-keygen new -o ~/vote-account-keypair.json" 
        },
        { 
          label: "Start validator", 
          code: "solana-validator \\\n  --identity ~/validator-keypair.json \\\n  --vote-account ~/vote-account-keypair.json \\\n  --known-validator 7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2 \\\n  --known-validator 5D1fNXzvv5NjV1ysLjirC4WY92RNsVGiKPvbrmqRHyem \\\n  --log ~/validator-log.log \\\n  --ledger ~/validator-ledger \\\n  --rpc-port 8899" 
        }
      ]
    },
    'monad': {
      name: 'Monad',
      logo: '/images/monad-logo.svg',
      description: 'Next-generation blockchain for high-frequency financial applications',
      color: 'blue',
      requirements: [
        '8+ CPU cores',
        '16GB+ RAM',
        '1TB+ SSD',
        '500Mbps bandwidth'
      ],
      estimatedRewards: 'Early adopter rewards + future airdrops',
      setupCommands: [
        { 
          label: "Install Monad CLI", 
          code: "curl -L https://get.monad.network/install.sh | sh" 
        },
        { 
          label: "Initialize validator", 
          code: "monad init --validator" 
        },
        { 
          label: "Generate validator key", 
          code: "monad keys generate" 
        },
        { 
          label: "Start validator", 
          code: "monad validator start \\\n  --key-path ~/.monad/validator-key.json \\\n  --network testnet" 
        }
      ]
    }
  };
  
  // Check if blockchain is supported
  useEffect(() => {
    if (!blockchainData[blockchain]) {
      router.push('/dashboard/blockchain-integration');
      return;
    }
    
    setBlockchainMetadata(blockchainData[blockchain]);
    
    // In a real implementation, fetch node data from API
    if (nodeId) {
      // Simulate API call
      setTimeout(() => {
        setNodeInfo({
          id: nodeId,
          name: "Node Alpha",
          status: "active",
          reference_code: "AERO-12345",
          resources: {
            cpu: { total: "8 cores", usage: 65 },
            memory: { total: "16 GB", usage: 48 },
            storage: { total: "1 TB", usage: 32 },
            bandwidth: { total: "1 Gbps", usage: 27 }
          }
        });
        setLoading(false);
      }, 1000);
    } else {
      router.push('/dashboard/blockchain-integration');
    }
  }, [blockchain, nodeId, router]);

  // Handle wallet connection check
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
    }
  }, [wallet.connected, router]);

  // Handle key input
  const handleKeyChange = (e, setter) => {
    setter(e.target.value);
  };
  
  // Handle form submission at each step
  const handleContinue = () => {
    setLoading(true);
    
    // Simulate API call to save data
    setTimeout(() => {
      setLoading(false);
      
      if (step < 3) {
        setStep(step + 1);
      } else {
        // Final step - redirect to nodes page
        router.push('/dashboard/nodes');
      }
    }, 1500);
  };
  
  const handleGoBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      router.push('/dashboard/blockchain-integration');
    }
  };

  if (!wallet.connected || !blockchainMetadata) {
    return null;
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
            <Link href="/dashboard/blockchain-integration" className="text-gray-400 hover:text-white">
              Blockchain Integration
            </Link>
            <span className="text-gray-600">/</span>
            <span>{blockchainMetadata.name}</span>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                <img src={blockchainMetadata.logo} alt={blockchainMetadata.name} className="h-8 w-8" />
                {blockchainMetadata.name} Integration
              </h1>
              <p className="text-gray-400">
                Connect your AeroNyx node to the {blockchainMetadata.name} network
              </p>
            </div>
          </div>
        </div>
        
        {/* Steps indicator */}
        <div className="flex items-center mb-8">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 1 ? `bg-${blockchainMetadata.color}-700` : 'bg-background-100'} text-white text-sm font-bold`}>
            1
          </div>
          <div className={`flex-grow h-1 mx-2 ${step >= 2 ? `bg-${blockchainMetadata.color}-700` : 'bg-background-100'}`}></div>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 2 ? `bg-${blockchainMetadata.color}-700` : 'bg-background-100'} text-white text-sm font-bold`}>
            2
          </div>
          <div className={`flex-grow h-1 mx-2 ${step >= 3 ? `bg-${blockchainMetadata.color}-700` : 'bg-background-100'}`}></div>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 3 ? `bg-${blockchainMetadata.color}-700` : 'bg-background-100'} text-white text-sm font-bold`}>
            3
          </div>
        </div>
        
        {/* Loading state */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {/* Step 1: Requirements check */}
            {step === 1 && (
              <div className="card glass-effect max-w-3xl mx-auto">
                <h2 className="text-xl font-bold mb-6">System Requirements Check</h2>
                
                {nodeInfo && (
                  <div className={`p-4 rounded-lg bg-${blockchainMetadata.color}-900/20 border border-${blockchainMetadata.color}-800/50 mb-6`}>
                    <h3 className="font-bold mb-2">Selected Node: {nodeInfo.name}</h3>
                    <p className="text-sm text-gray-300">
                      ID: {nodeInfo.id}, Status: {nodeInfo.status}
                    </p>
                  </div>
                )}
                
                <div className="space-y-6 mb-6">
                  <div>
                    <h3 className="font-bold mb-3">Hardware Requirements</h3>
                    <div className="space-y-4">
                      {blockchainMetadata.requirements.map((req, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <div className="mt-0.5">
                            <svg viewBox="0 0 24 24" className="h-5 w-5 text-green-500" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div className="flex-grow">
                            <p className="font-medium">{req}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-bold mb-3">Compatibility Check</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span>CPU Resources</span>
                        <div className="w-32 bg-background-200 h-2 rounded-full">
                          <div className="h-2 rounded-full bg-green-500" style={{ width: '85%' }}></div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Memory Allocation</span>
                        <div className="w-32 bg-background-200 h-2 rounded-full">
                          <div className="h-2 rounded-full bg-green-500" style={{ width: '90%' }}></div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Storage Space</span>
                        <div className="w-32 bg-background-200 h-2 rounded-full">
                          <div className="h-2 rounded-full bg-yellow-500" style={{ width: '70%' }}></div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Network Bandwidth</span>
                        <div className="w-32 bg-background-200 h-2 rounded-full">
                          <div className="h-2 rounded-full bg-green-500" style={{ width: '95%' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className={`p-4 rounded-lg bg-${blockchainMetadata.color}-900/20 border border-${blockchainMetadata.color}-800/50`}>
                    <h3 className="font-bold mb-2">Estimated Rewards</h3>
                    <p className="text-lg">{blockchainMetadata.estimatedRewards}</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Actual rewards may vary based on network participation, token price, and validator performance.
                    </p>
                  </div>
                  
                  <div className="bg-yellow-900/30 border border-yellow-800 p-4 rounded-md">
                    <h4 className="text-yellow-500 font-bold mb-2 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Important Note
                    </h4>
                    <p className="text-sm text-gray-300">
                      Running a {blockchainMetadata.name} validator node requires technical knowledge and continuous monitoring.
                      Validators typically need to stake tokens as collateral, and may be subject to slashing penalties if they
                      fail to maintain proper uptime or violate network rules.
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-between">
                  <button
                    onClick={handleGoBack}
                    className="button-outline"
                  >
                    Back
                  </button>
                  
                  <button
                    onClick={handleContinue}
                    className={`button-primary bg-${blockchainMetadata.color}-700 hover:bg-${blockchainMetadata.color}-600`}
                  >
                    Continue to Setup
                  </button>
                </div>
              </div>
            )}
            
            {/* Step 2: Setup instructions */}
            {step === 2 && (
              <div className="card glass-effect max-w-3xl mx-auto">
                <h2 className="text-xl font-bold mb-6">Setup Instructions</h2>
                
                <div className="space-y-6 mb-6">
                  <p className="text-gray-300">
                    Follow these steps on your node server to set up the {blockchainMetadata.name} validator software.
                    Once completed, enter the required keys in the form below to continue.
                  </p>
                  
                  <div className="space-y-6">
                    {blockchainMetadata.setupCommands.map((command, index) => (
                      <div key={index}>
                        <h3 className="font-bold mb-2">{index + 1}. {command.label}</h3>
                        <div className="bg-background-100 p-3 rounded-md font-mono text-sm mb-4 overflow-x-auto">
                          <code>{command.code}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div>
                    <h3 className="font-bold mb-3">Enter Your Keys</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Validator Public Key
                        </label>
                        <input
                          type="text"
                          value={walletKey}
                          onChange={(e) => handleKeyChange(e, setWalletKey)}
                          placeholder={`Enter your ${blockchainMetadata.name} validator public key`}
                          className="input-field w-full"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Vote Account Public Key
                        </label>
                        <input
                          type="text"
                          value={voteAccountKey}
                          onChange={(e) => handleKeyChange(e, setVoteAccountKey)}
                          placeholder={`Enter your ${blockchainMetadata.name} vote account public key`}
                          className="input-field w-full"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between">
                  <button
                    onClick={handleGoBack}
                    className="button-outline"
                  >
                    Back
                  </button>
                  
                  <button
                    onClick={handleContinue}
                    disabled={!walletKey || !voteAccountKey || loading}
                    className={`button-primary bg-${blockchainMetadata.color}-700 hover:bg-${blockchainMetadata.color}-600 ${
                      !walletKey || !voteAccountKey || loading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : 'Save and Continue'}
                  </button>
                </div>
              </div>
            )}
            
            {/* Step 3: Integration complete */}
            {step === 3 && (
              <div className="card glass-effect max-w-3xl mx-auto text-center">
                <div className="mb-6">
                  <div className={`w-20 h-20 mx-auto rounded-full bg-${blockchainMetadata.color}-900/50 flex items-center justify-center mb-4`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-10 w-10 text-${blockchainMetadata.color}-400`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Integration Complete!</h2>
                  <p className="text-gray-300 mb-6 max-w-xl mx-auto">
                    Your AeroNyx node "{nodeInfo?.name}" has been successfully integrated with the {blockchainMetadata.name} network.
                    The validator will now begin syncing with the blockchain and participating in consensus.
                  </p>
                </div>
                
                <div className={`p-6 rounded-lg bg-${blockchainMetadata.color}-900/20 border border-${blockchainMetadata.color}-800/50 mb-8 max-w-lg mx-auto`}>
                  <h3 className="font-bold mb-3">Next Steps</h3>
                  <ul className="text-left space-y-3">
                    <li className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">
                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-green-500" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium">Monitor Sync Progress</p>
                        <p className="text-sm text-gray-400">Your node is now syncing with the {blockchainMetadata.name} blockchain. This may take several hours to complete.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">
                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-green-500" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
                          <text x="12" y="16" textAnchor="middle" fontSize="12" fill="currentColor">2</text>
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium">Stake Your Tokens</p>
                        <p className="text-sm text-gray-400">After syncing, stake tokens to activate your validator and begin earning rewards.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">
                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-green-500" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
                          <text x="12" y="16" textAnchor="middle" fontSize="12" fill="currentColor">3</text>
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium">Watch Your Earnings</p>
                        <p className="text-sm text-gray-400">Track your validator performance and earnings in the AeroNyx dashboard.</p>
                      </div>
                    </li>
                  </ul>
                </div>
                
                <div className="flex justify-center gap-4">
                  <Link
                    href="/dashboard/nodes"
                    className={`button-primary bg-${blockchainMetadata.color}-700 hover:bg-${blockchainMetadata.color}-600`}
                  >
                    View My Nodes
                  </Link>
                  
                  <Link 
                    href={`/learn/validator-guides/${blockchain}`}
                    className="button-outline"
                  >
                    View Full Guide
                  </Link>
                </div>
              </div>
            )}
          </>
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
