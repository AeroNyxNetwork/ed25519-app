/**
 * Enhanced Node Registration and Monitoring API Service for AeroNyx Platform
 * 
 * File Path: src/lib/api/nodeRegistration.js
 * 
 * This service handles all API communications related to node registration,
 * monitoring, and performance tracking with the AeroNyx backend.
 * 
 * Features:
 * - Node registration and management
 * - User nodes overview with real-time status
 * - Detailed node status monitoring
 * - Performance history tracking
 * - Wallet signature verification
 * - Comprehensive error handling
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.aeronyx.network';

/**
 * Generic HTTP request handler with comprehensive error handling
 * 
 * @param {string} endpoint - API endpoint path
 * @param {Object} options - Fetch options (method, headers, body, etc.)
 * @returns {Promise<Object>} Parsed response data
 * @throws {Error} Network or API errors
 */
async function request(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'AeroNyx-Web-Client/1.0.0',
    ...options.headers,
  };

  const config = {
    method: 'GET',
    ...options,
    headers,
  };

  try {
    // Add timeout for requests (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    config.signal = controller.signal;
    
    const response = await fetch(url, config);
    
    clearTimeout(timeoutId);
    
    // Handle HTTP errors
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      const errorMessage = errorData?.message || 
                          errorData?.error || 
                          `API request failed with status ${response.status}`;
      
      throw new Error(errorMessage);
    }
    
    // Parse and return response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return await response.text();
    
  } catch (error) {
    // Handle different types of errors
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - please try again');
    }
    
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error - please check your connection');
    }
    
    console.error('API request error:', {
      endpoint,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    throw error;
  }
}

/**
 * Node Registration and Monitoring API Service
 * 
 * Provides methods for all node-related API operations including registration,
 * monitoring, and performance tracking.
 */
const nodeRegistrationService = {
  
  // ==================== NODE REGISTRATION METHODS ====================
  
  /**
   * Create a new node in the system (Step 1 of registration process)
   * 
   * @param {Object} nodeData - Node configuration data
   * @param {string} nodeData.name - Human-readable node name
   * @param {string} nodeData.type - Node type ID (general, compute, storage, ai, onion, privacy)
   * @param {Object} nodeData.resources - Available resources configuration
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Cryptographic signature from wallet
   * @param {string} message - Original message that was signed
   * @returns {Promise<Object>} Node creation response with node ID and reference code
   * @throws {Error} Validation or API errors
   */
  createNode: async (nodeData, walletAddress, signature, message) => {
    // Validate input parameters
    if (!nodeData?.name || !nodeData?.type) {
      throw new Error('Node name and type are required');
    }
    
    if (!walletAddress || !signature || !message) {
      throw new Error('Wallet authentication parameters are required');
    }
    
    const payload = {
      name: nodeData.name.trim(),
      wallet_address: walletAddress.toLowerCase(),
      blockchain_network_id: 1, // Default to mainnet
      node_type_id: nodeData.type,
      resources: nodeData.resources || {},
      wallet_type: 'okx', // Currently supporting OKX wallet
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
   * @returns {Promise<Object>} Response containing message to sign
   * @throws {Error} API or validation errors
   */
  generateSignatureMessage: async (walletAddress) => {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }
    
    return request('/api/aeronyx/generate-signature-message/', {
      method: 'POST',
      body: JSON.stringify({ 
        wallet_address: walletAddress.toLowerCase() 
      }),
    });
  },

  /**
   * Generate registration code for node setup (Step 2 of registration)
   * 
   * @param {string} nodeId - Node ID from createNode response
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Signed message
   * @param {number} blockchainNetworkId - Target blockchain network (default: 1)
   * @returns {Promise<Object>} Registration code for node setup
   * @throws {Error} API or validation errors
   */
  generateRegistrationCode: async (nodeId, walletAddress, signature, message, blockchainNetworkId = 1) => {
    if (!nodeId || !walletAddress || !signature || !message) {
      throw new Error('All authentication parameters are required');
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
   * Check node status by reference code (Legacy compatibility method)
   * 
   * @param {string} referenceCode - Node reference code (e.g., AERO-12345)
   * @param {string} walletAddress - User's wallet address
   * @returns {Promise<Object|null>} Node status information or null if not found
   */
  checkNodeStatus: async (referenceCode, walletAddress) => {
    if (!referenceCode || !walletAddress) {
      throw new Error('Reference code and wallet address are required');
    }
    
    try {
      return await request('/api/aeronyx/check-node-status/', {
        method: 'POST',
        body: JSON.stringify({
          reference_code: referenceCode,
          wallet_address: walletAddress.toLowerCase()
        }),
      });
    } catch (error) {
      console.warn('Node status check failed:', error.message);
      return null;
    }
  },
  
  /**
   * Get all nodes associated with a wallet (Legacy method)
   * 
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Signed message
   * @param {number} blockchainNetworkId - Blockchain network ID
   * @returns {Promise<Object>} List of user's nodes
   */
  getNodesByWallet: async (walletAddress, signature, message, blockchainNetworkId = 1) => {
    if (!walletAddress || !signature || !message) {
      throw new Error('Wallet authentication is required');
    }
    
    return request('/api/aeronyx/nodes/wallet-nodes/', {
      method: 'POST',
      body: JSON.stringify({
        wallet_address: walletAddress.toLowerCase(),
        blockchain_network_id: blockchainNetworkId,
        signature: signature,
        message: message
      }),
    });
  },

  // ==================== NODE MONITORING METHODS ====================

  /**
   * Get comprehensive overview of user's nodes with status grouping
   * 
   * This is the primary method for fetching user's nodes in the dashboard.
   * Returns nodes grouped by status (online, active, offline) with summary statistics.
   * 
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Cryptographic signature for authentication
   * @param {string} message - Original message that was signed
   * @param {string} walletType - Wallet type identifier (default: 'okx')
   * @returns {Promise<Object>} Complete nodes overview with grouped status
   * @throws {Error} Authentication or API errors
   */
  getUserNodesOverview: async (walletAddress, signature, message, walletType = 'okx') => {
    if (!walletAddress || !signature || !message) {
      throw new Error('Complete wallet authentication is required');
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
   * Get detailed status information for a specific node
   * 
   * Provides comprehensive information about a single node including
   * connection status, performance metrics, and operational details.
   * 
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Signed message
   * @param {string} referenceCode - Node reference code (e.g., AERO-12345)
   * @param {string} walletType - Wallet type identifier
   * @returns {Promise<Object>} Detailed node status information
   * @throws {Error} Authentication or node not found errors
   */
  getNodeDetailedStatus: async (walletAddress, signature, message, referenceCode, walletType = 'okx') => {
    if (!walletAddress || !signature || !message || !referenceCode) {
      throw new Error('All parameters are required for node status check');
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
   * Get historical performance data for a node
   * 
   * Retrieves time-series performance data for monitoring and analysis.
   * Supports various time ranges from 1 hour to 7 days.
   * 
   * @param {string} walletAddress - User's wallet address
   * @param {string} signature - Wallet signature
   * @param {string} message - Signed message
   * @param {string} referenceCode - Node reference code
   * @param {number} hours - Number of hours of history to retrieve (1-168)
   * @param {string} walletType - Wallet type identifier
   * @returns {Promise<Object>} Performance history data with time series
   * @throws {Error} Authentication or data retrieval errors
   */
  getNodePerformanceHistory: async (walletAddress, signature, message, referenceCode, hours = 24, walletType = 'okx') => {
    if (!walletAddress || !signature || !message || !referenceCode) {
      throw new Error('All authentication parameters and reference code are required');
    }
    
    // Validate hours parameter
    const validHours = Math.max(1, Math.min(168, Number(hours) || 24)); // 1 hour to 7 days
    
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
  },

  // ==================== CONFIGURATION METHODS ====================
  
  /**
   * Get available node types from the platform
   * 
   * @returns {Promise<Array>} List of supported node types with descriptions
   */
  getNodeTypes: async () => {
    return request('/api/aeronyx/node-types/', {
      method: 'GET',
    });
  },
  
  /**
   * Get available node resource types
   * 
   * @returns {Promise<Array>} List of supported resource types
   */
  getNodeResources: async () => {
    return request('/api/aeronyx/node-resources/', {
      method: 'GET',
    });
  }
};

/**
 * Export the service as default
 * This allows for easy importing and potential future enhancement
 * with additional services or middleware.
 */
export default nodeRegistrationService;

/**
 * Export specific methods for tree-shaking optimization
 * Allows importing only needed methods in production builds
 */
export {
  nodeRegistrationService as nodeAPI,
  request as apiRequest
};
