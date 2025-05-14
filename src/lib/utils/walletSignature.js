/**
 * Wallet Signature utilities for AeroNyx platform
 * Handles message signing and verification for wallet authentication
 */

/**
 * Sign a message with a wallet provider
 * @param {Object} provider - Web3 provider from wallet
 * @param {string} message - Message to sign
 * @param {string} address - Wallet address
 * @returns {Promise<string>} Signature
 */
export async function signMessage(provider, message, address) {
  try {
    if (!provider) {
      throw new Error('No wallet provider available');
    }
    
    const signature = await provider.request({
      method: 'personal_sign',
      params: [message, address]
    });
    
    return signature;
  } catch (error) {
    console.error('Signature error:', error);
    throw error;
  }
}

/**
 * Format message for better readability before signing
 * @param {string} message - Raw message
 * @returns {string} Formatted message
 */
export function formatMessageForSigning(message) {
  // Return the message as is to match exactly what the backend expects
  return message;
}

/**
 * Generate a random nonce for signature security
 * @returns {string} Random nonce
 */
export function generateNonce() {
  return Math.floor(Math.random() * 1000000).toString();
}

/**
 * Create a signature request message with timestamp
 * @param {string} action - Action being performed
 * @param {string} walletAddress - User's wallet address
 * @returns {string} Signature message
 */
export function createSignatureMessage(action, walletAddress) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = generateNonce();
  
  return `${action}:${walletAddress}:${timestamp}:${nonce}`;
}

/**
 * Check if a signature is needed based on last signature time
 * @param {number} lastSignatureTime - Timestamp of last signature
 * @returns {boolean} Whether a new signature is needed
 */
export function isSignatureNeeded(lastSignatureTime) {
  // Signatures are valid for 15 minutes (900 seconds)
  const signatureValidityPeriod = 15 * 60 * 1000;
  const now = Date.now();
  
  if (!lastSignatureTime) return true;
  
  return (now - lastSignatureTime) > signatureValidityPeriod;
}

/**
 * Store signature information in local storage
 * @param {Object} signatureInfo - Signature information
 */
export function storeSignatureInfo(signatureInfo) {
  try {
    localStorage.setItem('aeroNyxSignatureInfo', JSON.stringify({
      ...signatureInfo,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Failed to store signature info:', error);
  }
}

/**
 * Get stored signature information from local storage
 * @returns {Object|null} Signature information
 */
export function getStoredSignatureInfo() {
  try {
    const info = localStorage.getItem('aeroNyxSignatureInfo');
    return info ? JSON.parse(info) : null;
  } catch (error) {
    console.error('Failed to retrieve signature info:', error);
    return null;
  }
}
