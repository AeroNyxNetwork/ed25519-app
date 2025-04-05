/**
 * API Service for AeroNyx platform
 * Handles communication with the backend API
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.aeronyx.network';

/**
 * Generic request handler with authentication
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Request options
 * @param {string} walletAddress - User's wallet address for authentication
 * @returns {Promise<any>} Response data
 */
async function request(endpoint, options = {}, walletAddress = null) {
  const url = `${API_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add wallet address as authentication if provided
  if (walletAddress) {
    headers['Authorization'] = `Bearer ${walletAddress}`;
  }

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
 * API service object with methods for different endpoints
 */
const apiService = {
  /**
   * Authentication & User endpoints
   */
  auth: {
    /**
     * Verify wallet connection
     * @param {string} walletAddress - User's wallet address
     * @returns {Promise<Object>} User data
     */
    verifyWallet: (walletAddress) => 
      request('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ walletAddress }),
      }),
  },

  /**
   * Node management endpoints
   */
  nodes: {
    /**
     * Get all nodes for a user
     * @param {string} walletAddress - User's wallet address
     * @returns {Promise<Array>} List of nodes
     */
    getAll: (walletAddress) => 
      request('/nodes', {
        method: 'GET',
      }, walletAddress),
    
    /**
     * Get details for a specific node
     * @param {string} nodeId - Node ID
     * @param {string} walletAddress - User's wallet address
     * @returns {Promise<Object>} Node details
     */
    getById: (nodeId, walletAddress) => 
      request(`/nodes/${nodeId}`, {
        method: 'GET',
      }, walletAddress),
    
    /**
     * Register a new node
     * @param {Object} nodeData - Node information
     * @param {string} walletAddress - User's wallet address
     * @returns {Promise<Object>} Registration data with code
     */
    register: (nodeData, walletAddress) => 
      request('/resources/register', {
        method: 'POST',
        body: JSON.stringify(nodeData),
      }, walletAddress),
    
    /**
     * Update node information
     * @param {string} nodeId - Node ID
     * @param {Object} nodeData - Updated node data
     * @param {string} walletAddress - User's wallet address
     * @returns {Promise<Object>} Updated node data
     */
    update: (nodeId, nodeData, walletAddress) => 
      request(`/nodes/${nodeId}`, {
        method: 'PUT',
        body: JSON.stringify(nodeData),
      }, walletAddress),
    
    /**
     * Deregister a node
     * @param {string} nodeId - Node ID
     * @param {string} walletAddress - User's wallet address
     * @returns {Promise<Object>} Deregistration result
     */
    deregister: (nodeId, walletAddress) => 
      request(`/nodes/${nodeId}`, {
        method: 'DELETE',
      }, walletAddress),
  },

  /**
   * Network statistics endpoints
   */
  network: {
    /**
     * Get global network statistics
     * @param {string} walletAddress - User's wallet address
     * @returns {Promise<Object>} Network statistics
     */
    getStats: (walletAddress) => 
      request('/network/stats', {
        method: 'GET',
      }, walletAddress),
    
    /**
     * Get time-series network data
     * @param {string} timeRange - Time range (day, week, month, all)
     * @param {string} walletAddress - User's wallet address
     * @returns {Promise<Object>} Time-series data
     */
    getHistoricalData: (timeRange, walletAddress) => 
      request(`/network/history?range=${timeRange}`, {
        method: 'GET',
      }, walletAddress),
  },

  /**
   * User dashboard endpoints
   */
  dashboard: {
    /**
     * Get user dashboard summary data
     * @param {string} walletAddress - User's wallet address
     * @returns {Promise<Object>} Dashboard data
     */
    getSummary: (walletAddress) => 
      request('/dashboard', {
        method: 'GET',
      }, walletAddress),
  }
};

export default apiService;
