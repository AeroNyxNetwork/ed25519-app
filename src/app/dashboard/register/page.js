'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../../components/layout/Header';
import { useWallet } from '../../../components/wallet/WalletProvider';
import Link from 'next/link';
import nodeRegistrationService from '../../../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../../../lib/utils/walletSignature';

export default function RegisterNode() {
  const { wallet } = useWallet();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [registrationCode, setRegistrationCode] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [nodeId, setNodeId] = useState(null);
  const [showNodeTypeInfo, setShowNodeTypeInfo] = useState(false);
  const [selectedNodeTypeInfo, setSelectedNodeTypeInfo] = useState('');
  const [gpuFeatureAvailable, setGpuFeatureAvailable] = useState(false);
  const [availableNodeTypes, setAvailableNodeTypes] = useState([]);
  const [availableResources, setAvailableResources] = useState([]);
  const [signatureMessage, setSignatureMessage] = useState('');
  const [signature, setSignature] = useState('');
  
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

  // Node type descriptions
  const nodeTypeDescriptions = {
    general: "General purpose nodes provide a balanced mix of CPU, memory, storage, and bandwidth resources to the network. Suitable for most use cases.",
    compute: "Compute optimized nodes focus on providing high CPU and memory resources for computational tasks like data processing and simulations.",
    storage: "Storage optimized nodes provide large amounts of secure storage capacity to the network. Ideal for data redundancy and distributed storage.",
    ai: "AI Training nodes are equipped with specialized hardware for machine learning workloads. Requires high computational capacity.",
    onion: "Onion routing nodes help facilitate anonymous communication in the network. These nodes don't require a public IP address and focus on routing encrypted traffic.",
    privacy: "Privacy network nodes help encrypt and protect sensitive data across the network. They focus on implementing privacy-preserving protocols and techniques."
  };

  // Fetch available node types and resources on load
  useEffect(() => {
    async function fetchNodeTypesAndResources() {
      try {
        // Fetch node types
        const nodeTypesResponse = await nodeRegistrationService.getNodeTypes();
        if (nodeTypesResponse.success && nodeTypesResponse.data) {
          setAvailableNodeTypes(nodeTypesResponse.data);
        }
        
        // Fetch node resources
        const nodeResourcesResponse = await nodeRegistrationService.getNodeResources();
        if (nodeResourcesResponse.success && nodeResourcesResponse.data) {
          setAvailableResources(nodeResourcesResponse.data);
          
          // Check if GPU resources are available
          const gpuResource = nodeResourcesResponse.data.find(r => r.id === 'gpu');
          setGpuFeatureAvailable(gpuResource && gpuResource.is_available);
        }
      } catch (err) {
        console.error('Failed to fetch node types or resources:', err);
        // Don't show error to user, just use the default types
      }
    }
    
    fetchNodeTypesAndResources();
  }, []);

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

    // Show node type info when type changes
    if (name === 'type') {
      setSelectedNodeTypeInfo(nodeTypeDescriptions[value]);
      setShowNodeTypeInfo(true);
    }
  };

  const handleResourceToggle = (resource) => {
    if (resource === 'gpu' && !gpuFeatureAvailable) {
      // Show an info message that GPU support is coming soon
      setError("GPU support is coming soon and not currently available.");
      return;
    }

    setNodeInfo(prev => ({
      ...prev,
      resources: {
        ...prev.resources,
        [resource]: !prev.resources[resource]
      }
    }));
  };

  const generateSignatureMessage = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get signature message from the API
      const response = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      
      if (response.success && response.data) {
        // Format the message for better readability
        const formattedMessage = formatMessageForSigning(response.data.message);
        setSignatureMessage(response.data.message);
        
        // Get signature from wallet
        const sig = await signMessage(wallet.provider, formattedMessage, wallet.address);
        setSignature(sig);
        
        // Proceed to create the node
        await createNode(response.data.message, sig);
      } else {
        throw new Error(response.message || 'Failed to generate signature message');
      }
    } catch (err) {
      setError(err.message || 'Failed to sign message');
      setLoading(false);
    }
  };
  
  const createNode = async (message, signature) => {
    try {
      // Transform resources object to match API format
      const resourcesPayload = {};
      Object.keys(nodeInfo.resources).forEach(key => {
        resourcesPayload[key] = nodeInfo.resources[key];
      });
      
      // Create the node
      const createResponse = await nodeRegistrationService.createNode(
        {
          name: nodeInfo.name,
          type: nodeInfo.type,
          resources: resourcesPayload
        },
        wallet.address,
        signature,
        message
      );
      
      if (createResponse.success && createResponse.data) {
        // Store node ID and reference code
        setNodeId(createResponse.data.id);
        setReferenceCode(createResponse.data.reference_code);
        
        // Generate registration code
        await generateRegistrationCode(createResponse.data.id, message, signature);
      } else {
        throw new Error(createResponse.message || 'Failed to create node');
      }
    } catch (err) {
      setError(err.message || 'Failed to create node');
      setLoading(false);
    }
  };

  const generateRegistrationCode = async (nodeId, message, signature) => {
    try {
      // Generate registration code
      const codeResponse = await nodeRegistrationService.generateRegistrationCode(
        nodeId,
        wallet.address,
        signature,
        message,
        1 // Default blockchain network ID
      );
      
      if (codeResponse.success && codeResponse.data) {
        setRegistrationCode(codeResponse.data.registration_code);
        setLoading(false);
        setStep(2);
      } else {
        throw new Error(codeResponse.message || 'Failed to generate registration code');
      }
    } catch (err) {
      setError(err.message || 'Failed to generate registration code');
      setLoading(false);
    }
  };

  const completeRegistration = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Check node status
      const statusResponse = await nodeRegistrationService.checkNodeStatus(
        referenceCode,
        wallet.address
      );
      
      if (statusResponse.success) {
        setLoading(false);
        setStep(3);
      } else {
        throw new Error(statusResponse.message || 'Failed to verify node status');
      }
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
                  {availableNodeTypes.length > 0 ? (
                    availableNodeTypes.map(type => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))
                  ) : (
                    <>
                      <option value="general">General Purpose</option>
                      <option value="compute">Compute Optimized</option>
                      <option value="storage">Storage Optimized</option>
                      <option value="ai">AI Training</option>
                      <option value="onion">Onion Routing</option>
                      <option value="privacy">Privacy Network</option>
                    </>
                  )}
                </select>
                
                {showNodeTypeInfo && (
                  <div className="mt-2 p-3 bg-background-100 border border-background-200 rounded-md text-sm text-gray-300">
                    <div className="flex items-start">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary mr-2 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      <span>{selectedNodeTypeInfo}</span>
                    </div>
                  </div>
                )}
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
                    className={`p-3 rounded-md cursor-pointer border ${nodeInfo.resources.gpu ? 'border-primary bg-primary/20' : 'border-background-200 bg-background-100'} ${!gpuFeatureAvailable ? 'opacity-50' : ''}`}
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
                      {!gpuFeatureAvailable && (
                        <span className="text-xs text-yellow-500 ml-1">(Coming Soon)</span>
                      )}
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
                onClick={generateSignatureMessage}
                disabled={!nodeInfo.name || loading}
                className={`button-primary ${!nodeInfo.name || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing & Generating...
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
              
              <div className="bg-background-100 p-4 rounded-md font-mono mb-4">
                <p className="mb-2 text-gray-400">Node Reference Code:</p>
                <code className="text-white">{referenceCode}</code>
              </div>
            </div>
            
            <div className="mb-6">
              <h3 className="font-bold mb-2">Next Steps:</h3>
              <ol className="list-decimal pl-5 space-y-2 text-gray-300">
                <li>Install the AeroNyx Node software on your server</li>
                <li>Run the setup command with your registration code</li>
                <li>Your server will collect system information and register with the network</li>
                <li>Complete the registration by confirming below after setup is complete</li>
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
                    Verifying Registration...
                  </>
                ) : 'Confirm Registration'}
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
