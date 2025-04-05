'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../../components/layout/Header';
import { useWallet } from '../../../components/wallet/WalletProvider';
import Link from 'next/link';

export default function RegisterNode() {
  const { wallet } = useWallet();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [registrationCode, setRegistrationCode] = useState('');
  const [nodeInfo, setNodeInfo] = useState({
    name: '',
    type: 'general',
    resources: {
      cpu: true,
      gpu: false,
      storage: true,
      bandwidth: true
    }
  });

  // Check wallet connection on page load
  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
    }
  }, [wallet.connected, router]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNodeInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleResourceToggle = (resource) => {
    setNodeInfo(prev => ({
      ...prev,
      resources: {
        ...prev.resources,
        [resource]: !prev.resources[resource]
      }
    }));
  };

  const generateRegistrationCode = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // In a real app, this would be an API call
      // const response = await fetch('/api/nodes/register', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${wallet.address}`
      //   },
      //   body: JSON.stringify(nodeInfo)
      // });
      
      // if (!response.ok) {
      //   throw new Error('Failed to generate registration code');
      // }
      
      // const data = await response.json();
      // setRegistrationCode(data.registrationCode);
      
      // Simulating API response for demo
      setTimeout(() => {
        setRegistrationCode(`AERO-${wallet.address.substring(2, 8)}-${Date.now().toString(36).toUpperCase()}`);
        setLoading(false);
        setStep(2);
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to generate registration code');
      setLoading(false);
    }
  };

  const completeRegistration = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // In a real app, this would trigger a blockchain transaction
      // And then verify the transaction completed successfully
      
      // Simulating transaction delay for demo
      setTimeout(() => {
        setLoading(false);
        setStep(3);
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to complete registration');
      setLoading(false);
    }
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
            <span>Register New Node</span>
          </div>
          
          <h1 className="text-3xl font-bold mb-2">Register New Node</h1>
          <p className="text-gray-400">
            Add a new device to the AeroNyx network and start earning rewards
          </p>
        </div>

        {/* Registration Steps Indicator */}
        <div className="flex items-center mb-8">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-background-100'} text-white text-sm font-bold`}>
            1
          </div>
          <div className={`flex-grow h-1 mx-2 ${step >= 2 ? 'bg-primary' : 'bg-background-100'}`}></div>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-background-100'} text-white text-sm font-bold`}>
            2
          </div>
          <div className={`flex-grow h-1 mx-2 ${step >= 3 ? 'bg-primary' : 'bg-background-100'}`}></div>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 3 ? 'bg-primary' : 'bg-background-100'} text-white text-sm font-bold`}>
            3
          </div>
        </div>

        {/* Step 1: Node Information */}
        {step === 1 && (
          <div className="card glass-effect max-w-2xl mx-auto">
            <h2 className="text-xl font-bold mb-6">Node Information</h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                  Node Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={nodeInfo.name}
                  onChange={handleInputChange}
                  className="input-field w-full"
                  placeholder="e.g. My Home Server"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-300 mb-1">
                  Node Type
                </label>
                <select
                  id="type"
                  name="type"
                  value={nodeInfo.type}
                  onChange={handleInputChange}
                  className="input-field w-full"
                  required
                >
                  <option value="general">General Purpose</option>
                  <option value="compute">Compute Optimized</option>
                  <option value="storage">Storage Optimized</option>
                  <option value="ai">AI Training</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Available Resources
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div 
                    className={`p-3 rounded-md cursor-pointer border ${nodeInfo.resources.cpu ? 'border-primary bg-primary/20' : 'border-background-200 bg-background-100'}`}
                    onClick={() => handleResourceToggle('cpu')}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={nodeInfo.resources.cpu}
                        onChange={() => {}}
                        className="h-4 w-4 text-primary"
                      />
                      <span>CPU</span>
                    </div>
                  </div>
                  
                  <div 
                    className={`p-3 rounded-md cursor-pointer border ${nodeInfo.resources.gpu ? 'border-primary bg-primary/20' : 'border-background-200 bg-background-100'}`}
                    onClick={() => handleResourceToggle('gpu')}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={nodeInfo.resources.gpu}
                        onChange={() => {}}
                        className="h-4 w-4 text-primary"
                      />
                      <span>GPU</span>
                    </div>
                  </div>
                  
                  <div 
                    className={`p-3 rounded-md cursor-pointer border ${nodeInfo.resources.storage ? 'border-primary bg-primary/20' : 'border-background-200 bg-background-100'}`}
                    onClick={() => handleResourceToggle('storage')}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={nodeInfo.resources.storage}
                        onChange={() => {}}
                        className="h-4 w-4 text-primary"
                      />
                      <span>Storage</span>
                    </div>
                  </div>
                  
                  <div 
                    className={`p-3 rounded-md cursor-pointer border ${nodeInfo.resources.bandwidth ? 'border-primary bg-primary/20' : 'border-background-200 bg-background-100'}`}
                    onClick={() => handleResourceToggle('bandwidth')}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={nodeInfo.resources.bandwidth}
                        onChange={() => {}}
                        className="h-4 w-4 text-primary"
                      />
                      <span>Bandwidth</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {error && (
              <div className="mb-6 p-3 bg-red-900/50 border border-red-800 rounded-md text-red-200 text-sm">
                {error}
              </div>
            )}
            
            <div className="flex justify-end">
              <button
                onClick={generateRegistrationCode}
                disabled={!nodeInfo.name || loading}
                className={`button-primary ${!nodeInfo.name || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                  </>
                ) : 'Generate Registration Code'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Registration Code */}
        {step === 2 && (
          <div className="card glass-effect max-w-2xl mx-auto">
            <h2 className="text-xl font-bold mb-6">Registration Code Generated</h2>
            
            <div className="mb-6">
              <p className="text-gray-300 mb-4">
                Use the registration code below to configure your server node. Run the following command on your server:
              </p>
              
              <div className="bg-background-100 p-4 rounded-md font-mono mb-4 overflow-x-auto">
                <code>aeronyx-node setup --registration-code {registrationCode}</code>
              </div>
              
              <div className="bg-primary-900/30 border border-primary-800 p-4 rounded-md mb-4">
                <h4 className="text-primary-300 font-bold mb-2 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  Important
                </h4>
                <p className="text-sm">
                  This code is valid for 24 hours and can only be used once. Keep it confidential as it's linked to your wallet.
                </p>
              </div>
            </div>
            
            <div className="mb-6">
              <h3 className="font-bold mb-2">Next Steps:</h3>
              <ol className="list-decimal pl-5 space-y-2 text-gray-300">
                <li>Install the AeroNyx Node software on your server</li>
                <li>Run the setup command with your registration code</li>
                <li>Your server will collect system information and register with the network</li>
                <li>Complete the registration by signing the on-chain transaction</li>
              </ol>
            </div>
            
            {error && (
              <div className="mb-6 p-3 bg-red-900/50 border border-red-800 rounded-md text-red-200 text-sm">
                {error}
              </div>
            )}
            
            <div className="flex justify-end">
              <button
                onClick={completeRegistration}
                disabled={loading}
                className={`button-primary ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : 'Confirm On-Chain Registration'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Completion */}
        {step === 3 && (
          <div className="card glass-effect max-w-2xl mx-auto text-center">
            <div className="mb-6">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-2">Registration Successful!</h2>
              <p className="text-gray-300 mb-6">
                Your node "{nodeInfo.name}" has been successfully registered on the AeroNyx network.
                It will appear in your dashboard once it's fully activated.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                href="/dashboard/nodes" 
                className="button-primary"
              >
                View My Nodes
              </Link>
              <Link 
                href="/dashboard/register" 
                className="button-outline"
                onClick={() => {
                  setStep(1);
                  setRegistrationCode('');
                  setNodeInfo({
                    name: '',
                    type: 'general',
                    resources: {
                      cpu: true,
                      gpu: false,
                      storage: true,
                      bandwidth: true
                    }
                  });
                }}
              >
                Register Another Node
              </Link>
            </div>
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
