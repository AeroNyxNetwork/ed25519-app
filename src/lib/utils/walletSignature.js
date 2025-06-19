/**
 * Wallet Signature utilities for AeroNyx platform
 * Fixed signature format to match backend expectations
 * 
 * @version 2.0.0
 */

/**
 * Sign a message with a wallet provider
 * Ensures proper encoding and format for backend verification
 * 
 * @param {Object} provider - Web3 provider from wallet
 * @param {string} message - Message to sign
 * @param {string} address - Wallet address
 * @returns {Promise<string>} Signature with 0x prefix
 */
export async function signMessage(provider, message, address) {
  try {
    if (!provider) {
      throw new Error('No wallet provider available');
    }
    
    // Ensure address is lowercase for consistency
    const normalizedAddress = address.toLowerCase();
    
    // Sign the message exactly as received from backend
    const signature = await provider.request({
      method: 'personal_sign',
      params: [message, normalizedAddress]
    });
    
    // Ensure signature has 0x prefix
    const formattedSignature = signature.startsWith('0x') ? signature : `0x${signature}`;
    
    console.log('[WalletSignature] Message signed successfully');
    
    return formattedSignature;
  } catch (error) {
    console.error('[WalletSignature] Signature error:', error);
    throw error;
  }
}

/**
 * Format message for signing - returns message as-is
 * The backend expects the exact message without modifications
 * 
 * @param {string} message - Raw message from backend
 * @returns {string} Message unchanged
 */
export function formatMessageForSigning(message) {
  // Return the message exactly as received from backend
  // No formatting or modifications
  return message;
}

/**
 * Verify signature format
 * Ensures signature meets backend requirements
 * 
 * @param {string} signature - Signature to verify
 * @returns {boolean} Is valid format
 */
export function isValidSignatureFormat(signature) {
  if (!signature || typeof signature !== 'string') {
    return false;
  }
  
  // Must have 0x prefix
  if (!signature.startsWith('0x')) {
    return false;
  }
  
  // Must be at least 132 characters (0x + 130 hex chars)
  if (signature.length < 132) {
    return false;
  }
  
  // Must be valid hex
  const hexRegex = /^0x[0-9a-fA-F]+$/;
  if (!hexRegex.test(signature)) {
    return false;
  }
  
  return true;
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

/**
 * Clear stored signature information
 */
export function clearStoredSignatureInfo() {
  try {
    localStorage.removeItem('aeroNyxSignatureInfo');
  } catch (error) {
    console.error('Failed to clear signature info:', error);
  }
}
