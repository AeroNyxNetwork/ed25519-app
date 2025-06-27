/**
 * Register Node Page - Modern UI Version
 * 
 * File Path: src/app/dashboard/register/page.js
 * 
 * Modernized with glassmorphic design matching DashboardContent
 * 
 * @version 3.0.0
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Server, 
  Cpu, 
  HardDrive, 
  Activity, 
  Shield,
  Lock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  Plus
} from 'lucide-react';
import clsx from 'clsx';

import { useWallet } from '../../../components/wallet/WalletProvider';
import nodeRegistrationService from '../../../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../../../lib/utils/walletSignature';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100
    }
  }
};

// Node type configuration
const NODE_TYPES = [
  { id: 'general', name: 'General Purpose', icon: Server, color: 'purple' },
  { id: 'compute', name: 'Compute Optimized', icon: Cpu, color: 'blue' },
  { id: 'storage', name: 'Storage Optimized', icon: HardDrive, color: 'green' },
  { id: 'ai', name: 'AI Training', icon: Cpu, color: 'orange' },
  { id: 'onion', name: 'Onion Routing', icon: Shield, color: 'yellow' },
  { id: 'privacy', name: 'Privacy Network', icon: Lock, color: 'indigo' }
];

const RESOURCES = [
  { id: 'cpu', name: 'CPU', available: true },
  { id: 'gpu', name: 'GPU', available: false },
  { id: 'storage', name: 'Storage', available: true },
  { id: 'bandwidth', name: 'Bandwidth', available: true }
];

export default function RegisterNode() {
  const { wallet } = useWallet();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [registrationCode, setRegistrationCode] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [nodeId, setNodeId] = useState(null);
  
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

  useEffect(() => {
    if (!wallet.connected) {
      router.push('/');
    }
  }, [wallet.connected, router]);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setNodeInfo(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  const handleResourceToggle = useCallback((resource) => {
    if (resource === 'gpu') {
      setError("GPU support is coming soon");
      return;
    }

    setNodeInfo(prev => ({
      ...prev,
      resources: {
        ...prev.resources,
        [resource]: !prev.resources[resource]
      }
    }));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get signature message
      const response = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      
      if (response.success && response.data) {
        const formattedMessage = formatMessageForSigning(response.data.message);
        const sig = await signMessage(wallet.provider, formattedMessage, wallet.address);
        
        // Transform resources
        const resourcesPayload = {};
        Object.keys(nodeInfo.resources).forEach(key => {
          resourcesPayload[key] = nodeInfo.resources[key];
        });
        
        // Create node
        const createResponse = await nodeRegistrationService.createNode(
          {
            name: nodeInfo.name,
            type: nodeInfo.type,
            resources: resourcesPayload
          },
          wallet.address,
          sig,
          response.data.message
        );
        
        if (createResponse.success && createResponse.data) {
          setNodeId(createResponse.data.id);
          setReferenceCode(createResponse.data.reference_code);
          
          // Generate registration code
          const codeResponse = await nodeRegistrationService.generateRegistrationCode(
            createResponse.data.id,
            wallet.address,
            sig,
            response.data.message,
            1
          );
          
          if (codeResponse.success && codeResponse.data) {
            setRegistrationCode(codeResponse.data.registration_code);
            setStep(2);
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to register node');
    } finally {
      setLoading(false);
    }
  }, [wallet, nodeInfo]);

  const completeRegistration = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const statusResponse = await nodeRegistrationService.checkNodeStatus(
        referenceCode,
        wallet.address
      );
      
      if (statusResponse.success) {
        setStep(3);
      } else {
        throw new Error(statusResponse.message || 'Failed to verify node status');
      }
    } catch (err) {
      setError(err.message || 'Failed to complete registration');
    } finally {
      setLoading(false);
    }
  }, [referenceCode, wallet.address]);

  if (!wallet.connected) {
    return null;
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Background effects */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>
      
      <div className="relative z-10 px-6 py-8 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-4 text-sm">
            <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="w-4 h-4 text-gray-600" />
            <span className="text-gray-300">Register New Node</span>
          </div>
          
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Register New Node
          </h1>
          <p className="text-gray-400 mt-2">
            Add a new device to the AeroNyx network and start earning rewards
          </p>
        </motion.div>

        {/* Progress Steps */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center mb-8"
        >
          {[1, 2, 3].map((num) => (
            <React.Fragment key={num}>
              <div className={clsx(
                "flex items-center justify-center w-10 h-10 rounded-full font-bold transition-all",
                step >= num 
                  ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white" 
                  : "bg-white/5 text-gray-500 border border-white/10"
              )}>
                {step > num ? <CheckCircle className="w-5 h-5" /> : num}
              </div>
              {num < 3 && (
                <div className={clsx(
                  "flex-1 h-1 mx-4 rounded-full transition-all",
                  step > num ? "bg-gradient-to-r from-purple-600 to-blue-600" : "bg-white/10"
                )} />
              )}
            </React.Fragment>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {/* Step 1: Node Information */}
          {step === 1 && (
            <motion.div
              key="step1"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <GlassCard>
                <h2 className="text-2xl font-bold mb-6">Node Information</h2>
                
                {/* Node Name */}
                <motion.div variants={itemVariants} className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Node Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={nodeInfo.name}
                    onChange={handleInputChange}
                    placeholder="e.g. My Home Server"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
                    required
                  />
                </motion.div>

                {/* Node Type */}
                <motion.div variants={itemVariants} className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Node Type
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {NODE_TYPES.map((type) => {
                      const Icon = type.icon;
                      const isSelected = nodeInfo.type === type.id;
                      
                      return (
                        <motion.button
                          key={type.id}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setNodeInfo(prev => ({ ...prev, type: type.id }))}
                          className={clsx(
                            "p-4 rounded-xl border transition-all",
                            isSelected
                              ? `bg-${type.color}-500/10 border-${type.color}-500/50`
                              : "bg-white/5 border-white/10 hover:border-white/20"
                          )}
                        >
                          <Icon className={clsx(
                            "w-6 h-6 mx-auto mb-2",
                            isSelected ? `text-${type.color}-400` : "text-gray-400"
                          )} />
                          <div className="text-sm font-medium">{type.name}</div>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Resources */}
                <motion.div variants={itemVariants} className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Available Resources
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {RESOURCES.map((resource) => {
                      const isSelected = nodeInfo.resources[resource.id];
                      const isAvailable = resource.available;
                      
                      return (
                        <motion.button
                          key={resource.id}
                          whileHover={isAvailable ? { scale: 1.02 } : {}}
                          whileTap={isAvailable ? { scale: 0.98 } : {}}
                          onClick={() => isAvailable && handleResourceToggle(resource.id)}
                          disabled={!isAvailable}
                          className={clsx(
                            "p-3 rounded-xl border transition-all flex items-center gap-3",
                            !isAvailable && "opacity-50 cursor-not-allowed",
                            isSelected && isAvailable
                              ? "bg-purple-500/10 border-purple-500/50"
                              : "bg-white/5 border-white/10 hover:border-white/20"
                          )}
                        >
                          <div className={clsx(
                            "w-5 h-5 rounded border-2 flex items-center justify-center",
                            isSelected && isAvailable
                              ? "bg-purple-500 border-purple-500"
                              : "border-gray-600"
                          )}>
                            {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                          <span className="font-medium">{resource.name}</span>
                          {!isAvailable && (
                            <span className="text-xs text-yellow-500 ml-auto">(Soon)</span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Error Message */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3"
                    >
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-300">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit Button */}
                <motion.button
                  variants={itemVariants}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit}
                  disabled={!nodeInfo.name || loading}
                  className={clsx(
                    "w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
                    "bg-gradient-to-r from-purple-600 to-blue-600 text-white",
                    "hover:from-purple-700 hover:to-blue-700",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Signing & Generating...
                    </>
                  ) : (
                    <>
                      Generate Registration Code
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </motion.button>
              </GlassCard>
            </motion.div>
          )}

          {/* Step 2: Registration Code */}
          {step === 2 && (
            <motion.div
              key="step2"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, x: -20 }}
            >
              <GlassCard>
                <motion.div variants={itemVariants} className="text-center mb-8">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold">Registration Code Generated</h2>
                  <p className="text-gray-400 mt-2">Use this code to configure your server node</p>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <div className="bg-black/50 border border-white/10 rounded-xl p-6 mb-6">
                    <p className="text-sm text-gray-400 mb-3">Run this command on your server:</p>
                    <code className="block bg-black/50 p-4 rounded-lg font-mono text-sm text-purple-400 break-all">
                      aeronyx-node setup --registration-code {registrationCode}
                    </code>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-300 mb-1">Important</h4>
                        <p className="text-sm text-blue-200/80">
                          This code is valid for 24 hours and can only be used once. Keep it secure.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <h3 className="font-semibold">Next Steps:</h3>
                    <ol className="space-y-2 text-sm text-gray-300">
                      {[
                        'Install the AeroNyx Node software on your server',
                        'Run the setup command with your registration code',
                        'Your server will collect system information and register',
                        'Complete registration by confirming below'
                      ].map((step, index) => (
                        <li key={index} className="flex gap-3">
                          <span className="text-purple-400 font-bold">{index + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={completeRegistration}
                    disabled={loading}
                    className={clsx(
                      "w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
                      "bg-gradient-to-r from-purple-600 to-blue-600 text-white",
                      "hover:from-purple-700 hover:to-blue-700",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Verifying Registration...
                      </>
                    ) : (
                      <>
                        Confirm Registration
                        <ChevronRight className="w-5 h-5" />
                      </>
                    )}
                  </motion.button>
                </motion.div>
              </GlassCard>
            </motion.div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <GlassCard>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle className="w-10 h-10 text-white" />
                </motion.div>

                <h2 className="text-3xl font-bold mb-4">Registration Successful!</h2>
                <p className="text-gray-300 mb-8 max-w-md mx-auto">
                  Your node "{nodeInfo.name}" has been successfully registered on the AeroNyx network.
                  It will appear in your dashboard once fully activated.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/dashboard/nodes">
                    <motion.a
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-white font-medium hover:from-purple-700 hover:to-blue-700 transition-all"
                    >
                      View My Nodes
                    </motion.a>
                  </Link>
                  
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setStep(1);
                      setNodeInfo({
                        name: '',
                        type: 'general',
                        resources: { cpu: true, gpu: false, storage: true, bandwidth: true }
                      });
                      setRegistrationCode('');
                      setReferenceCode('');
                      setNodeId(null);
                      setError(null);
                    }}
                    className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-medium hover:bg-white/10 transition-all"
                  >
                    Register Another Node
                  </motion.button>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Glass Card Component
function GlassCard({ children, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        "bg-white/5 backdrop-blur-md rounded-2xl border border-white/10",
        "shadow-[0_8px_32px_0_rgba(31,38,135,0.37)]",
        "p-8",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
