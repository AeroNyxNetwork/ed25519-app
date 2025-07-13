/**
 * Wallet Signature utilities for AeroNyx platform
 * Multi-wallet support with proper encoding
 * 
 * @version 3.1.0
 */

/**
 * Detect wallet type from available window objects
 * @returns {string} Detected wallet type
 */
function detectWalletType() {
  if (window.okxwallet && window.okxwallet.solana) {
    return 'okx';
  }
  if (window.solana && window.solana.isPhantom) {
    return 'phantom';
  }
  if (window.ethereum && window.ethereum.isMetaMask) {
    return 'metamask';
  }
  if (window.solana) {
    return 'solana';
  }
  if (window.ethereum) {
    return 'ethereum'; // Generic ethereum wallet
  }
  return 'unknown';
}

/**
 * Sign a message with the connected wallet
 * Supports multiple wallet types with proper encoding
 * 
 * @param {string} message - Message to sign
 * @param {Object} wallet - Wallet object from WalletProvider
 * @returns {Promise<Object>} Signed message data
 */
export async function signMessage(message, wallet) {
  if (!wallet.connected || !wallet.address) {
    throw new Error('Wallet not connected');
  }

  try {
    let signature;
    const normalizedAddress = wallet.address.toLowerCase();
    
    // If wallet type is not provided, try to detect it
    const walletType = wallet.type || detectWalletType();
    
    console.log('[WalletSignature] Detected wallet type:', walletType);
    console.log('[WalletSignature] Available window objects:', {
      okxwallet: !!window.okxwallet,
      solana: !!window.solana,
      ethereum: !!window.ethereum,
      phantom: window.solana?.isPhantom
    });

    switch (walletType) {
      case 'okx':
        if (!window.okxwallet || !window.okxwallet.solana) {
          throw new Error('OKX Wallet not found. Please ensure OKX Wallet extension is installed.');
        }
        
        // OKX wallet uses Solana-style signing
        const okxSigned = await window.okxwallet.solana.signMessage(
          new TextEncoder().encode(message)
        );
        // Convert Uint8Array to base64
        signature = btoa(String.fromCharCode(...okxSigned.signature));
        
        console.log('[WalletSignature] OKX signature generated');
        break;

      case 'metamask':
      case 'ethereum':
        if (!window.ethereum) {
          throw new Error('MetaMask not found. Please ensure MetaMask extension is installed.');
        }
        
        // MetaMask uses personal_sign
        signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, normalizedAddress]
        });
        
        // Ensure 0x prefix
        signature = signature.startsWith('0x') ? signature : `0x${signature}`;
        
        console.log('[WalletSignature] MetaMask/Ethereum signature generated');
        break;

      case 'phantom':
      case 'solana':
        if (!window.solana) {
          throw new Error('Solana wallet not found. Please ensure Phantom or another Solana wallet is installed.');
        }
        
        // Phantom/Solana uses Solana-style signing
        const encodedMessage = new TextEncoder().encode(message);
        const solanaSigned = await window.solana.signMessage(encodedMessage, 'utf8');
        // Convert Uint8Array to base64
        signature = btoa(String.fromCharCode(...solanaSigned.signature));
        
        console.log('[WalletSignature] Phantom/Solana signature generated');
        break;

      default:
        // Try to detect and use available wallet
        if (window.okxwallet && window.okxwallet.solana) {
          console.log('[WalletSignature] Falling back to OKX wallet');
          const okxSigned = await window.okxwallet.solana.signMessage(
            new TextEncoder().encode(message)
          );
          signature = btoa(String.fromCharCode(...okxSigned.signature));
          break;
        } else if (window.solana) {
          console.log('[WalletSignature] Falling back to Solana wallet');
          const solanaSigned = await window.solana.signMessage(
            new TextEncoder().encode(message),
            'utf8'
          );
          signature = btoa(String.fromCharCode(...solanaSigned.signature));
          break;
        } else if (window.ethereum) {
          console.log('[WalletSignature] Falling back to Ethereum wallet');
          signature = await window.ethereum.request({
            method: 'personal_sign',
            params: [message, normalizedAddress]
          });
          signature = signature.startsWith('0x') ? signature : `0x${signature}`;
          break;
        } else {
          throw new Error(`No supported wallet found. Please install OKX Wallet, MetaMask, or Phantom.`);
        }
    }

    console.log('[WalletSignature] Message signed successfully');

    return {
      signature,
      message,
      walletAddress: normalizedAddress,
      walletType: walletType !== 'unknown' ? walletType : detectWalletType()
    };

  } catch (error) {
    console.error('[WalletSignature] Signature error:', error);
    
    // Provide more helpful error messages
    if (error.code === 4001) {
      throw new Error('User rejected the signature request');
    }
    if (error.message?.includes('User denied')) {
      throw new Error('User denied the signature request');
    }
    
    throw error;
  }
}

/**
 * Sign a message with a specific provider (legacy support)
 * @deprecated Use signMessage with wallet object instead
 */
export async function signMessageWithProvider(provider, message, address) {
  try {
    if (!provider) {
      throw new Error('No wallet provider available');
    }
    
    const normalizedAddress = address.toLowerCase();
    
    const signature = await provider.request({
      method: 'personal_sign',
      params: [message, normalizedAddress]
    });
    
    const formattedSignature = signature.startsWith('0x') ? signature : `0x${signature}`;
    
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
 * Verify signature format based on wallet type
 * 
 * @param {string} signature - Signature to verify
 * @param {string} walletType - Type of wallet
 * @returns {boolean} Is valid format
 */
export function isValidSignatureFormat(signature, walletType = 'metamask') {
  if (!signature || typeof signature !== 'string') {
    return false;
  }
  
  // If wallet type is not provided, try to detect format
  if (!walletType || walletType === 'unknown') {
    // Check if it's hex format (Ethereum)
    if (signature.startsWith('0x') && /^0x[0-9a-fA-F]+$/.test(signature)) {
      return true;
    }
    // Check if it's base64 format (Solana)
    try {
      atob(signature);
      return true;
    } catch {
      return false;
    }
  }
  
  switch (walletType) {
    case 'metamask':
    case 'ethereum':
      // Must have 0x prefix and be valid hex
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
      break;
      
    case 'okx':
    case 'phantom':
    case 'solana':
      // Base64 format for Solana wallets
      try {
        // Check if it's valid base64
        atob(signature);
        return true;
      } catch {
        return false;
      }
      
    default:
      return true; // Be permissive for unknown wallet types
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

/**
 * Convert signature between formats if needed
 * @param {string} signature - Original signature
 * @param {string} fromType - Source wallet type
 * @param {string} toType - Target wallet type
 * @returns {string} Converted signature
 */
export function convertSignatureFormat(signature, fromType, toType) {
  // If same type, no conversion needed
  if (fromType === toType) {
    return signature;
  }
  
  // Convert from hex to base64
  if ((fromType === 'metamask' || fromType === 'ethereum') && ['okx', 'phantom', 'solana'].includes(toType)) {
    // Remove 0x prefix if present
    const hex = signature.startsWith('0x') ? signature.slice(2) : signature;
    // Convert hex to bytes then to base64
    const bytes = hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16));
    return btoa(String.fromCharCode(...bytes));
  }
  
  // Convert from base64 to hex
  if (['okx', 'phantom', 'solana'].includes(fromType) && (toType === 'metamask' || toType === 'ethereum')) {
    // Convert base64 to bytes
    const bytes = atob(signature).split('').map(char => char.charCodeAt(0));
    // Convert bytes to hex
    const hex = bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `0x${hex}`;
  }
  
  // Default: return as is
  return signature;
}
