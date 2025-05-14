/**
 * AeroNyx Platform Constants
 */

// API URLs
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.aeronyx.network';
export const API_BASE_PATH = '/api';
export const API_AERONYX_PATH = '/api/aeronyx';

// Node Status Constants
export const NODE_STATUS = {
  PENDING: 'pending',
  REGISTERED: 'registered',
  ACTIVE: 'online',
  OFFLINE: 'offline',
  SUSPENDED: 'suspended'
};

// Node Types
export const NODE_TYPES = {
  GENERAL: 'general',
  COMPUTE: 'compute',
  STORAGE: 'storage',
  AI: 'ai',
  ONION: 'onion',
  PRIVACY: 'privacy'
};

// Node Resources
export const NODE_RESOURCES = {
  CPU: 'cpu',
  GPU: 'gpu',
  STORAGE: 'storage',
  BANDWIDTH: 'bandwidth'
};

// Node Type Descriptions
export const NODE_TYPE_DESCRIPTIONS = {
  general: "General purpose nodes provide a balanced mix of CPU, memory, storage, and bandwidth resources to the network. Suitable for most use cases.",
  compute: "Compute optimized nodes focus on providing high CPU and memory resources for computational tasks like data processing and simulations.",
  storage: "Storage optimized nodes provide large amounts of secure storage capacity to the network. Ideal for data redundancy and distributed storage.",
  ai: "AI Training nodes are equipped with specialized hardware for machine learning workloads. Requires high computational capacity.",
  onion: "Onion routing nodes help facilitate anonymous communication in the network. These nodes don't require a public IP address and focus on routing encrypted traffic.",
  privacy: "Privacy network nodes help encrypt and protect sensitive data across the network. They focus on implementing privacy-preserving protocols and techniques."
};

// Wallet Types
export const WALLET_TYPES = {
  OKX: 'okx',
  SOLANA: 'solana',
  METAMASK: 'metamask',
  PHANTOM: 'phantom',
  OTHERS: 'others'
};

// Local Storage Keys
export const STORAGE_KEYS = {
  WALLET_INFO: 'aeroNyxWalletInfo',
  SIGNATURE_INFO: 'aeroNyxSignatureInfo',
  NODE_CACHE: 'aeroNyxNodeCache',
  USER_PREFERENCES: 'aeroNyxUserPreferences'
};

// Network Configuration
export const BLOCKCHAIN_NETWORKS = {
  MAINNET: 1,
  TESTNET: 2,
  DEVNET: 3
};

// Time Constants
export const TIME_CONSTANTS = {
  SIGNATURE_VALIDITY_MINUTES: 15,
  REGISTRATION_CODE_VALIDITY_HOURS: 24,
  DEFAULT_CACHE_MINUTES: 5
};

// Feature Flags
export const FEATURES = {
  GPU_AVAILABLE: false,
  ONCHAIN_REGISTRATION: false,
  NODE_MONITORING: true,
  ADVANCED_STATS: false
};
