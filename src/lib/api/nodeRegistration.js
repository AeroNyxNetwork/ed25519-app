/**
 * Node Registration API Service for AeroNyx platform
 * Handles registration-specific API communications with the backend
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.aeronyx.network';

/**
 * Generic request handler with authentication
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Request options
 * @returns {Promise<any>} Response data
 */
async function request(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);
    
    // Handle non-200 responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.message || `API request failed with status ${response.status}`);
    }
    
    // Parse JSON response or return text if not JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return await response.text();
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}

/**
 * Node Registration API Service
 */
const nodeRegistrationService = {
  /**
   * Create a new node (First step of registration)
   * @param {Object} nodeData - Node information including name, node_type_id, resources
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Message that was signed
   * @returns {Promise<Object>} Node creation response
   */
  createNode: async (nodeData, walletAddress, signature, message) => {
    // We're using the type directly as node_type_id based on AeroNyxNodeType model
    // where id is a CharField with values like 'general', 'compute', etc.
    const payload = {
      name: nodeData.name,
      wallet_address: walletAddress,
      blockchain_network_id: 1, // Default to main network
      node_type_id: nodeData.type,
      resources: nodeData.resources,
      wallet_type: 'okx',
      signature: signature,
      signature_message: message
    };
    
    return request('/api/aeronyx/nodes/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Generate signature message for wallet verification
   * @param {string} walletAddress - User's wallet address
   * @returns {Promise<Object>} Message details
   */
  generateSignatureMessage: async (walletAddress) => {
    return request('/api/aeronyx/generate-signature-message/', {
      method: 'POST',
      body: JSON.stringify({ wallet_address: walletAddress }),
    });
  },

  /**
   * Generate registration code after creating a node
   * @param {string} nodeId - Node ID
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Message that was signed
   * @param {number} blockchainNetworkId - Blockchain network ID
   * @returns {Promise<Object>} Registration code response
   */
  generateRegistrationCode: async (nodeId, walletAddress, signature, message, blockchainNetworkId = 1) => {
    const payload = {
      node_id: nodeId,
      wallet_address: walletAddress,
      signature: signature,
      message: message,
      blockchain_network_id: blockchainNetworkId,
      wallet_type: 'okx'
    };
    
    return request('/api/aeronyx/nodes/generate-registration-code/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Check node status by reference code and wallet address
   * @param {string} referenceCode - Node reference code
   * @param {string} walletAddress - User's wallet address
   * @returns {Promise<Object>} Node status
   */
  checkNodeStatus: async (referenceCode, walletAddress) => {
    return request('/api/aeronyx/check-node-status/', {
      method: 'POST',
      body: JSON.stringify({
        reference_code: referenceCode,
        wallet_address: walletAddress
      }),
    });
  },
  
  /**
   * Get all user's nodes by wallet address
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Message that was signed
   * @param {number} blockchainNetworkId - Blockchain network ID
   * @returns {Promise<Object>} List of nodes
   */
  getNodesByWallet: async (walletAddress, signature, message, blockchainNetworkId = 1) => {
    return request('/api/aeronyx/nodes/wallet-nodes/', {
      method: 'POST',
      body: JSON.stringify({
        wallet_address: walletAddress,
        blockchain_network_id: blockchainNetworkId,
        signature: signature,
        message: message
      }),
    });
  },
  
  /**
   * Get available node types
   * @returns {Promise<Array>} List of node types
   */
  getNodeTypes: async () => {
    return request('/api/aeronyx/node-types/', {
      method: 'GET',
    });
  },
  
  /**
   * Get available node resources
   * @returns {Promise<Array>} List of resources
   */
  getNodeResources: async () => {
    return request('/api/aeronyx/node-resources/', {
      method: 'GET',
    });
  }
};

export default nodeRegistrationService;
