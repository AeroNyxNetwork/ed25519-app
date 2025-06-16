/**
 * Enhanced Node Registration and Monitoring API Service for AeroNyx platform
 * 文件路径: src/lib/api/nodeRegistration.js
 * Handles registration-specific and monitoring API communications with the backend
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
 * Enhanced Node Registration and Monitoring API Service
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

  // ============= 新增的用户节点监控 API 方法 =============

  /**
   * 获取用户节点概览
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Message that was signed
   * @param {string} walletType - Wallet type (metamask, okx, etc.)
   * @returns {Promise<Object>} Nodes overview response
   */
  getUserNodesOverview: async (walletAddress, signature, message, walletType = 'okx') => {
    const payload = {
      wallet_address: walletAddress,
      signature: signature,
      message: message,
      wallet_type: walletType
    };

    return request('/api/aeronyx/user/nodes-overview/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * 获取节点详细状态
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Message that was signed
   * @param {string} referenceCode - Node reference code
   * @param {string} walletType - Wallet type (metamask, okx, etc.)
   * @returns {Promise<Object>} Node detailed status response
   */
  getNodeDetailedStatus: async (walletAddress, signature, message, referenceCode, walletType = 'okx') => {
    const payload = {
      wallet_address: walletAddress,
      signature: signature,
      message: message,
      wallet_type: walletType,
      reference_code: referenceCode
    };

    return request('/api/aeronyx/user/node-detailed-status/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * 获取节点性能历史数据
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Message that was signed
   * @param {string} referenceCode - Node reference code
   * @param {number} hours - Hours of history to retrieve (default 24)
   * @param {string} walletType - Wallet type (metamask, okx, etc.)
   * @returns {Promise<Object>} Node performance history response
   */
  getNodePerformanceHistory: async (walletAddress, signature, message, referenceCode, hours = 24, walletType = 'okx') => {
    const payload = {
      wallet_address: walletAddress,
      signature: signature,
      message: message,
      reference_code: referenceCode,
      hours: hours,
      wallet_type: walletType
    };

    return request('/api/aeronyx/user/node-performance-history/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // ============= 现有的 API 方法 =============
  
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
