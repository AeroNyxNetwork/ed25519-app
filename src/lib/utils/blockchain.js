/**
 * Blockchain utility functions for AeroNyx platform
 * Handles wallet interactions and blockchain transactions
 */

// AeroNyx Network contract address
const CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890'; // Replace with actual contract address

// Contract ABI for AeroNyx Node Registry
const CONTRACT_ABI = [
  // This would be the actual ABI from your smart contract
  // Just showing a simplified example here
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_registrationCode",
        "type": "string"
      }
    ],
    "name": "registerNode",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_nodeId",
        "type": "string"
      }
    ],
    "name": "deregisterNode",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

/**
 * Send a registration transaction to the blockchain
 * @param {Object} provider - Web3 provider from wallet
 * @param {string} registrationCode - Node registration code
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Object>} Transaction receipt
 */
export async function sendRegistrationTransaction(provider, registrationCode, walletAddress) {
  try {
    // This is a simplified example. In a real app, you would create the contract instance
    // and interact with it properly according to your Web3 library (ethers.js, web3.js, etc.)
    
    // Request the transaction
    const transactionParameters = {
      to: CONTRACT_ADDRESS, 
      from: walletAddress,
      data: encodeRegisterNodeFunction(registrationCode), // Helper function to encode the function call
    };

    // Send the transaction
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [transactionParameters],
    });

    // Wait for transaction to be mined
    const receipt = await waitForTransaction(provider, txHash);
    
    return receipt;
  } catch (error) {
    console.error('Blockchain transaction error:', error);
    throw error;
  }
}

/**
 * Send a deregistration transaction to the blockchain
 * @param {Object} provider - Web3 provider from wallet
 * @param {string} nodeId - Node ID
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Object>} Transaction receipt
 */
export async function sendDeregistrationTransaction(provider, nodeId, walletAddress) {
  try {
    // Similar to registration, but calling a different function
    const transactionParameters = {
      to: CONTRACT_ADDRESS,
      from: walletAddress,
      data: encodeDeregisterNodeFunction(nodeId),
    };

    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [transactionParameters],
    });

    const receipt = await waitForTransaction(provider, txHash);
    
    return receipt;
  } catch (error) {
    console.error('Blockchain transaction error:', error);
    throw error;
  }
}

/**
 * Wait for a transaction to be mined
 * @param {Object} provider - Web3 provider
 * @param {string} txHash - Transaction hash
 * @returns {Promise<Object>} Transaction receipt
 */
async function waitForTransaction(provider, txHash) {
  return new Promise((resolve, reject) => {
    const checkTransaction = async () => {
      try {
        const receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        });

        if (receipt) {
          if (receipt.status === '0x1') {
            resolve(receipt);
          } else {
            reject(new Error('Transaction failed'));
          }
        } else {
          // Transaction not yet mined, check again after 2 seconds
          setTimeout(checkTransaction, 2000);
        }
      } catch (error) {
        reject(error);
      }
    };

    checkTransaction();
  });
}

/**
 * Encode the registerNode function call
 * @param {string} registrationCode - Node registration code
 * @returns {string} Encoded function call
 */
function encodeRegisterNodeFunction(registrationCode) {
  // In a real app, you would use a library like ethers.js or web3.js to encode this
  // This is a simplified example
  const functionSignature = '0x123456'; // Function selector for registerNode
  const encodedParam = encodeString(registrationCode);
  
  return functionSignature + encodedParam;
}

/**
 * Encode the deregisterNode function call
 * @param {string} nodeId - Node ID
 * @returns {string} Encoded function call
 */
function encodeDeregisterNodeFunction(nodeId) {
  // Similar to above
  const functionSignature = '0x654321'; // Function selector for deregisterNode
  const encodedParam = encodeString(nodeId);
  
  return functionSignature + encodedParam;
}

/**
 * Simple string encoding (placeholder - use actual ABI encoding in production)
 * @param {string} str - String to encode
 * @returns {string} Encoded string
 */
function encodeString(str) {
  // In a real app, use proper ABI encoding
  // This is just a placeholder
  return '00'.repeat(32) + Buffer.from(str).toString('hex');
}

/**
 * Get current network ID from provider
 * @param {Object} provider - Web3 provider
 * @returns {Promise<string>} Network ID
 */
export async function getNetworkId(provider) {
  try {
    const chainId = await provider.request({ method: 'eth_chainId' });
    return parseInt(chainId, 16).toString();
  } catch (error) {
    console.error('Failed to get network ID:', error);
    throw error;
  }
}

/**
 * Check if currently connected to the correct network
 * @param {Object} provider - Web3 provider
 * @returns {Promise<boolean>} Whether connected to the correct network
 */
export async function isCorrectNetwork(provider) {
  try {
    const currentNetwork = await getNetworkId(provider);
    const requiredNetwork = process.env.NEXT_PUBLIC_NETWORK_ID || '1';
    
    return currentNetwork === requiredNetwork;
  } catch (error) {
    console.error('Network check error:', error);
    return false;
  }
}

/**
 * Format wallet address for display (abbrevation)
 * @param {string} address - Wallet address
 * @returns {string} Formatted address
 */
export function formatAddress(address) {
  if (!address) return '';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Format amount with token symbol
 * @param {number|string} amount - Token amount
 * @param {string} symbol - Token symbol
 * @returns {string} Formatted amount with symbol
 */
export function formatAmount(amount, symbol = 'AeroNyx') {
  if (amount === undefined || amount === null) return '0 ' + symbol;
  
  // Format number with comma separators
  const formatted = Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return `${formatted} ${symbol}`;
}
