/**
 * Node Type Configuration for AeroNyx Platform
 * 
 * File Path: src/lib/constants/nodeTypes.js
 * 
 * Static configuration for node types to replace API calls
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 */

export const NODE_TYPES = [
  {
    id: 'general',
    name: 'General Purpose',
    description: 'General purpose nodes provide a balanced mix of CPU, memory, storage, and bandwidth resources to the network. Suitable for most use cases.',
    requirements: {
      cpu: '4+ cores',
      memory: '8GB+',
      storage: '500GB+',
      bandwidth: '100Mbps+'
    },
    icon: 'servers',
    color: 'accent'
  },
  {
    id: 'compute',
    name: 'Compute Optimized',
    description: 'Compute optimized nodes focus on providing high CPU and memory resources for computational tasks like data processing and simulations.',
    requirements: {
      cpu: '8+ cores',
      memory: '16GB+',
      storage: '250GB+',
      bandwidth: '100Mbps+'
    },
    icon: 'cpu',
    color: 'primary'
  },
  {
    id: 'storage',
    name: 'Storage Optimized',
    description: 'Storage optimized nodes provide large amounts of secure storage capacity to the network. Ideal for data redundancy and distributed storage.',
    requirements: {
      cpu: '2+ cores',
      memory: '4GB+',
      storage: '2TB+',
      bandwidth: '50Mbps+'
    },
    icon: 'database',
    color: 'secondary'
  },
  {
    id: 'ai',
    name: 'AI Training',
    description: 'AI Training nodes are equipped with specialized hardware for machine learning workloads. Requires high computational capacity.',
    requirements: {
      cpu: '8+ cores',
      memory: '32GB+',
      storage: '1TB+',
      bandwidth: '1Gbps+',
      gpu: 'Required'
    },
    icon: 'chip',
    color: 'purple'
  },
  {
    id: 'onion',
    name: 'Onion Routing',
    description: 'Onion routing nodes help facilitate anonymous communication in the network. These nodes don\'t require a public IP address and focus on routing encrypted traffic.',
    requirements: {
      cpu: '2+ cores',
      memory: '4GB+',
      storage: '100GB+',
      bandwidth: '50Mbps+'
    },
    icon: 'shield',
    color: 'yellow'
  },
  {
    id: 'privacy',
    name: 'Privacy Network',
    description: 'Privacy network nodes help encrypt and protect sensitive data across the network. They focus on implementing privacy-preserving protocols and techniques.',
    requirements: {
      cpu: '4+ cores',
      memory: '8GB+',
      storage: '250GB+',
      bandwidth: '100Mbps+'
    },
    icon: 'lock',
    color: 'green'
  }
];

export const NODE_RESOURCES = [
  {
    id: 'cpu',
    name: 'CPU',
    unit: 'cores',
    description: 'Processing power for computational tasks'
  },
  {
    id: 'memory',
    name: 'Memory',
    unit: 'GB',
    description: 'RAM for active processing'
  },
  {
    id: 'storage',
    name: 'Storage',
    unit: 'GB',
    description: 'Disk space for data storage'
  },
  {
    id: 'bandwidth',
    name: 'Bandwidth',
    unit: 'Mbps',
    description: 'Network throughput capacity'
  },
  {
    id: 'gpu',
    name: 'GPU',
    unit: 'units',
    description: 'Graphics processing for AI workloads'
  }
];

/**
 * Get node type by ID
 * @param {string} id - Node type ID
 * @returns {Object|null} Node type configuration
 */
export function getNodeTypeById(id) {
  return NODE_TYPES.find(type => type.id === id) || null;
}

/**
 * Get node resource by ID
 * @param {string} id - Resource ID
 * @returns {Object|null} Resource configuration
 */
export function getNodeResourceById(id) {
  return NODE_RESOURCES.find(resource => resource.id === id) || null;
}
