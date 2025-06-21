/**
 * Enhanced Node Registration and Monitoring API Service for AeroNyx Platform
 * 
 * File Path: src/lib/api/nodeRegistration.js
 * 
 * Production-ready API service with only used endpoints
 * Follows Google's API design standards
 * 
 * @version 2.0.0
 * @author AeroNyx Development Team
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.aeronyx.network';

/**
 * API response type definition
 * @typedef {Object} APIResponse
 * @property {boolean} success - Operation success status
 * @property {*} data - Response data
 * @property {string} [message] - Error or info message
 * @property {number} [code] - Error code
 */

/**
 * Generic HTTP request handler with comprehensive error handling
 * 
 * @param {string} endpoint - API endpoint path
 * @param {Object} options - Fetch options
 * @returns {Promise<APIResponse>} Standardized response
 */
async function request(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'AeroNyx-Web-Client/2.0.0',
    ...options.headers,
  };

  const config = {
    method: 'GET',
    ...options,
    headers,
  };

  try {
    // Add timeout with AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    config.signal = controller.signal;
    
    const response = await fetch(url, config);
    
    clearTimeout(timeoutId);
    
    // Parse response
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    // Handle HTTP errors
    if (!response.ok) {
      const errorMessage = data?.message || 
                          data?.error || 
                          `Request failed with status ${response.status}`;
      
      return {
        success: false,
        data: null,
        message: errorMessage,
        code: response.status
      };
    }
    
    // Standardize successful response
    return {
      success: true,
      data: data,
      message: null,
      code: response.status
    };
    
  } catch (error) {
    // Handle network and timeout errors
    if (error.name === 'AbortError') {
      return {
        success: false,
        data: null,
        message: 'Request timeout - please try again',
        code: 408
      };
    }
    
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return {
        success: false,
        data: null,
        message: 'Network error - please check your connection',
        code: 0
      };
    }
    
    console.error('API request error:', {
      endpoint,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: false,
      data: null,
      message: error.message || 'An unexpected error occurred',
      code: 500
    };
  }
}

/**
 * Node Registration and Monitoring API Service
 */
const nodeRegistrationService = {
  
  /**
   * Create a new node in the system
   * 
   * @param {Object} nodeData - Node configuration
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Signed message
   * @returns {Promise<APIResponse>} Node creation response
   */
  createNode: async (nodeData, walletAddress, signature, message) => {
    if (!nodeData?.name || !nodeData?.type) {
      return {
        success: false,
        data: null,
        message: 'Node name and type are required'
      };
    }
    
    if (!walletAddress || !signature || !message) {
      return {
        success: false,
        data: null,
        message: 'Wallet authentication parameters are required'
      };
    }
    
    const payload = {
      name: nodeData.name.trim(),
      wallet_address: walletAddress.toLowerCase(),
      blockchain_network_id: 1,
      node_type_id: nodeData.type,
      resources: nodeData.resources || {},
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
   * Generate a signature message for wallet verification
   * 
   * @param {string} walletAddress - User's wallet address
   * @returns {Promise<APIResponse>} Signature message response
   */
  generateSignatureMessage: async (walletAddress) => {
    if (!walletAddress) {
      return {
        success: false,
        data: null,
        message: 'Wallet address is required'
      };
    }
    
    return request('/api/aeronyx/generate-signature-message/', {
      method: 'POST',
      body: JSON.stringify({ 
        wallet_address: walletAddress.toLowerCase() 
      }),
    });
  },

  /**
   * Generate registration code for node setup
   * 
   * @param {string} nodeId - Node ID
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Signed message
   * @param {number} blockchainNetworkId - Network ID
   * @returns {Promise<APIResponse>} Registration code response
   */
  generateRegistrationCode: async (nodeId, walletAddress, signature, message, blockchainNetworkId = 1) => {
    if (!nodeId || !walletAddress || !signature || !message) {
      return {
        success: false,
        data: null,
        message: 'All authentication parameters are required'
      };
    }
    
    const payload = {
      node_id: nodeId,
      wallet_address: walletAddress.toLowerCase(),
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
   * Get comprehensive overview of user's nodes
   * 
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Signed message
   * @param {string} walletType - Wallet type
   * @returns {Promise<APIResponse>} Nodes overview response
   */
  getUserNodesOverview: async (walletAddress, signature, message, walletType = 'okx') => {
    if (!walletAddress || !signature || !message) {
      return {
        success: false,
        data: null,
        message: 'Complete wallet authentication is required'
      };
    }
    
    const payload = {
      wallet_address: walletAddress.toLowerCase(),
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
   * Get detailed status for a specific node
   * 
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Signed message
   * @param {string} referenceCode - Node reference code
   * @param {string} walletType - Wallet type
   * @returns {Promise<APIResponse>} Node status response
   */
  getNodeDetailedStatus: async (walletAddress, signature, message, referenceCode, walletType = 'okx') => {
    if (!walletAddress || !signature || !message || !referenceCode) {
      return {
        success: false,
        data: null,
        message: 'All parameters are required for node status check'
      };
    }
    
    const payload = {
      wallet_address: walletAddress.toLowerCase(),
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
   * Get performance history for a node
   * 
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Signed message
   * @param {string} referenceCode - Node reference code
   * @param {number} hours - Hours of history (1-168)
   * @param {string} walletType - Wallet type
   * @returns {Promise<APIResponse>} Performance history response
   */
  getNodePerformanceHistory: async (walletAddress, signature, message, referenceCode, hours = 24, walletType = 'okx') => {
    if (!walletAddress || !signature || !message || !referenceCode) {
      return {
        success: false,
        data: null,
        message: 'All authentication parameters and reference code are required'
      };
    }
    
    const validHours = Math.max(1, Math.min(168, Number(hours) || 24));
    
    const payload = {
      wallet_address: walletAddress.toLowerCase(),
      signature: signature,
      message: message,
      reference_code: referenceCode,
      hours: validHours,
      wallet_type: walletType
    };

    return request('/api/aeronyx/user/node-performance-history/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
};

// Export the service
export default nodeRegistrationService;

// Export specific methods for tree-shaking
export {
  nodeRegistrationService as nodeAPI,
  request as apiRequest
};
