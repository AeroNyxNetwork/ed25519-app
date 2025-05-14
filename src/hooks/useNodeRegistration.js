import { useState, useEffect } from 'react';
import nodeRegistrationService from '../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../lib/utils/walletSignature';

/**
 * Custom hook for handling node registration status and processes
 * @param {Object} wallet - Wallet information containing address and provider
 * @returns {Object} Registration status and handlers
 */
export default function useNodeRegistration(wallet) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(null);
  
  // Load nodes when wallet is connected
  useEffect(() => {
    if (wallet?.connected) {
      refreshNodes();
    }
  }, [wallet?.connected, wallet?.address]);
  
  // Function to refresh nodes list
  const refreshNodes = async () => {
    if (!wallet?.connected) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Generate a signature message
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }
      
      const message = messageResponse.data.message;
      const formattedMessage = formatMessageForSigning(message);
      
      // Sign the message
      const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);
      
      // Get nodes by wallet
      const nodesResponse = await nodeRegistrationService.getNodesByWallet(
        wallet.address,
        signature,
        message,
        1 // Default blockchain network ID
      );
      
      if (nodesResponse.success && nodesResponse.data) {
        setNodes(nodesResponse.data.nodes || []);
      } else {
        throw new Error(nodesResponse.message || 'Failed to fetch nodes');
      }
      
      setLastRefresh(new Date());
      setLoading(false);
    } catch (err) {
      console.error('Error refreshing nodes:', err);
      setError(err.message || 'Failed to refresh nodes');
      setLoading(false);
    }
  };
  
  // Function to check a specific node's status
  const checkNodeStatus = async (referenceCode) => {
    if (!wallet?.connected || !referenceCode) return null;
    
    try {
      const statusResponse = await nodeRegistrationService.checkNodeStatus(
        referenceCode,
        wallet.address
      );
      
      if (statusResponse.success && statusResponse.data) {
        return statusResponse.data;
      }
      
      return null;
    } catch (err) {
      console.error('Error checking node status:', err);
      return null;
    }
  };
  
  return {
    loading,
    error,
    nodes,
    lastRefresh,
    refreshNodes,
    checkNodeStatus
  };
}
