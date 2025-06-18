/**
 * WebSocket Data Transformer for AeroNyx Platform
 * 
 * File Path: src/lib/utils/websocketDataTransformer.js
 * 
 * Handles transformation between different data formats used by
 * REST API and WebSocket real-time updates based on the API documentation.
 * 
 * @version 1.0.0
 */

/**
 * Transform WebSocket real-time update to match REST API structure
 * 
 * @param {Object} wsData - WebSocket real_time_update data
 * @returns {Object} Transformed data matching REST API structure
 */
export function transformWebSocketToREST(wsData) {
  if (!wsData || !wsData.data) return null;
  
  const { data } = wsData;
  
  // Group nodes by their connection status
  const groupedNodes = groupNodesByConnectionStatus(data.nodes || []);
  
  return {
    // Summary remains mostly the same
    summary: {
      ...data.summary,
      // Ensure earnings is a string for consistency
      total_earnings: String(data.summary.total_earnings || 0),
      // Add real-time connections if not present
      real_time_connections: data.real_time_info?.websocket_connections || 0,
      last_activity: data.last_updated || null
    },
    
    // Group nodes like REST API does
    nodes: groupedNodes,
    
    // Performance stats from WebSocket overview
    performance_stats: transformPerformanceStats(data.performance_overview),
    
    // Additional WebSocket-specific info
    real_time_info: data.real_time_info,
    
    // Metadata
    metadata: {
      server_time: data.timestamp || wsData.timestamp,
      source: 'websocket',
      sequence: wsData.sequence
    }
  };
}

/**
 * Group nodes by connection status like REST API does
 * 
 * @param {Array} nodes - Flat array of nodes from WebSocket
 * @returns {Object} Grouped nodes { online: [], active: [], offline: [] }
 */
function groupNodesByConnectionStatus(nodes) {
  const online = [];  // WebSocket connected + status='active'
  const active = [];  // status='active' but no WebSocket
  const offline = []; // All other statuses
  
  nodes.forEach(node => {
    // Determine if node has WebSocket connection
    const hasWebSocketConnection = 
      (node.connection && node.connection.connected) ||
      (node.is_connected === true) ||
      (node.connection_status === 'online');
    
    if (hasWebSocketConnection && node.status === 'active') {
      online.push(transformNodeForREST(node, 'online'));
    } else if (node.status === 'active') {
      active.push(transformNodeForREST(node, 'active'));
    } else {
      offline.push(transformNodeForREST(node, 'offline'));
    }
  });
  
  return { online, active, offline };
}

/**
 * Transform individual node from WebSocket to REST format
 * 
 * @param {Object} wsNode - Node from WebSocket update
 * @param {string} category - Node category (online/active/offline)
 * @returns {Object} Transformed node
 */
function transformNodeForREST(wsNode, category) {
  const node = {
    // Basic info
    id: wsNode.id || generateNodeId(wsNode.reference_code),
    reference_code: wsNode.reference_code,
    name: wsNode.name,
    status: wsNode.status,
    
    // Node type - WebSocket sends string, REST expects object
    node_type: typeof wsNode.node_type === 'string' 
      ? { id: wsNode.node_type, name: formatNodeTypeName(wsNode.node_type) }
      : wsNode.node_type,
    
    // Time info
    created_at: wsNode.created_at,
    activated_at: wsNode.activated_at || null,
    last_seen: wsNode.last_seen || wsNode.connection?.last_seen || null,
    uptime: wsNode.uptime || '0 hours, 0 minutes',
    
    // Connection status
    is_connected: category === 'online',
    connection_status: category === 'online' ? 'online' : 'offline',
    
    // Performance data
    performance: {
      cpu_usage: wsNode.performance?.cpu_usage || 0,
      memory_usage: wsNode.performance?.memory_usage || 0,
      storage_usage: wsNode.performance?.storage_usage || 0,
      bandwidth_usage: wsNode.performance?.bandwidth_usage || 0
    },
    
    // Earnings
    earnings: String(wsNode.earnings || 0),
    
    // Connection details based on status
    connection_details: transformConnectionDetails(wsNode, category)
  };
  
  // Add registration status if available
  if (wsNode.registration_status) {
    node.registration_status = wsNode.registration_status;
  }
  
  return node;
}

/**
 * Transform connection details based on node status
 * 
 * @param {Object} wsNode - WebSocket node data
 * @param {string} category - Node category
 * @returns {Object} Connection details
 */
function transformConnectionDetails(wsNode, category) {
  if (category === 'online' && wsNode.connection) {
    return {
      last_heartbeat: wsNode.connection.last_heartbeat,
      heartbeat_count: wsNode.connection.heartbeat_count || 0,
      connection_duration_seconds: calculateConnectionDuration(wsNode)
    };
  } else {
    const offlineDuration = wsNode.connection?.offline_duration_seconds || 0;
    return {
      offline_duration_seconds: offlineDuration,
      offline_duration_formatted: formatDuration(offlineDuration)
    };
  }
}

/**
 * Transform performance overview to stats format
 * 
 * @param {Object} overview - Performance overview from WebSocket
 * @returns {Object} Performance stats matching REST format
 */
function transformPerformanceStats(overview) {
  if (!overview) return null;
  
  return {
    cpu: {
      average: overview.avg_cpu || 0,
      maximum: 100, // Not provided in WebSocket, use default
      minimum: 0
    },
    memory: {
      average: overview.avg_memory || 0,
      maximum: 100,
      minimum: 0
    },
    storage: {
      average: overview.avg_storage || 0,
      maximum: 100,
      minimum: 0
    },
    bandwidth: {
      average: overview.avg_bandwidth || 0,
      maximum: 100,
      minimum: 0
    },
    sample_size: -1 // Unknown from WebSocket data
  };
}

/**
 * Transform REST API node data for WebSocket compatibility
 * 
 * @param {Object} restNode - Node from REST API
 * @returns {Object} Transformed node for WebSocket processing
 */
export function transformRESTToWebSocket(restNode) {
  return {
    reference_code: restNode.reference_code,
    name: restNode.name,
    status: restNode.status,
    node_type: typeof restNode.node_type === 'object' 
      ? restNode.node_type.id 
      : restNode.node_type,
    
    connection: {
      connected: restNode.is_connected,
      last_heartbeat: restNode.connection_details?.last_heartbeat,
      heartbeat_count: restNode.connection_details?.heartbeat_count || 0,
      last_seen: restNode.last_seen,
      offline_duration_seconds: restNode.connection_details?.offline_duration_seconds
    },
    
    performance: {
      cpu_usage: restNode.performance?.cpu_usage || 0,
      memory_usage: restNode.performance?.memory_usage || 0,
      storage_usage: restNode.performance?.storage_usage || 0,
      bandwidth_usage: restNode.performance?.bandwidth_usage || 0
    },
    
    uptime: restNode.uptime,
    earnings: restNode.earnings,
    created_at: restNode.created_at,
    last_updated: restNode.last_seen
  };
}

/**
 * Merge WebSocket update with existing REST data
 * 
 * @param {Object} existingData - Current data (REST format)
 * @param {Object} wsUpdate - WebSocket update
 * @returns {Object} Merged data maintaining REST format
 */
export function mergeWebSocketUpdate(existingData, wsUpdate) {
  if (!existingData || !wsUpdate) return existingData || wsUpdate;
  
  // Transform WebSocket data to REST format
  const transformedUpdate = transformWebSocketToREST(wsUpdate);
  
  if (!transformedUpdate) return existingData;
  
  // Merge summary data
  const mergedSummary = {
    ...existingData.summary,
    ...transformedUpdate.summary,
    // Preserve some fields from existing data if not in update
    last_activity: transformedUpdate.summary.last_activity || existingData.summary.last_activity
  };
  
  // Merge nodes - WebSocket data is authoritative for real-time status
  const mergedNodes = transformedUpdate.nodes;
  
  // Merge performance stats
  const mergedPerformanceStats = transformedUpdate.performance_stats || existingData.performance_stats;
  
  return {
    ...existingData,
    summary: mergedSummary,
    nodes: mergedNodes,
    performance_stats: mergedPerformanceStats,
    real_time_info: transformedUpdate.real_time_info,
    last_websocket_update: transformedUpdate.metadata.server_time
  };
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Generate a numeric ID from reference code
 * 
 * @param {string} referenceCode - Node reference code (e.g., "AERO-12345")
 * @returns {number} Numeric ID
 */
function generateNodeId(referenceCode) {
  if (!referenceCode) return 0;
  const match = referenceCode.match(/AERO-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Format node type name from ID
 * 
 * @param {string} typeId - Node type ID
 * @returns {string} Formatted name
 */
function formatNodeTypeName(typeId) {
  const typeNames = {
    'general': 'General Purpose',
    'compute': 'Compute Optimized',
    'storage': 'Storage Optimized',
    'ai': 'AI Training',
    'onion': 'Onion Routing',
    'privacy': 'Privacy Network'
  };
  
  return typeNames[typeId] || typeId.charAt(0).toUpperCase() + typeId.slice(1);
}

/**
 * Calculate connection duration from node data
 * 
 * @param {Object} node - Node data
 * @returns {number} Connection duration in seconds
 */
function calculateConnectionDuration(node) {
  if (!node.created_at) return 0;
  
  const created = new Date(node.created_at);
  const now = new Date();
  
  return Math.floor((now - created) / 1000);
}

/**
 * Format duration in seconds to human-readable string
 * 
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
  return `${Math.floor(seconds / 86400)} days`;
}

/**
 * Validate WebSocket message format
 * 
 * @param {Object} message - WebSocket message
 * @returns {boolean} Is valid
 */
export function isValidWebSocketMessage(message) {
  if (!message || typeof message !== 'object') return false;
  if (!message.type || typeof message.type !== 'string') return false;
  
  switch (message.type) {
    case 'real_time_update':
      return !!(message.data && 
                message.data.summary && 
                message.data.nodes && 
                Array.isArray(message.data.nodes));
    
    case 'auth_success':
      return !!(message.nodes_summary);
    
    case 'error':
      return !!(message.error_code && message.message);
    
    default:
      return true; // Allow other message types
  }
}

// Export all functions
export default {
  transformWebSocketToREST,
  transformRESTToWebSocket,
  mergeWebSocketUpdate,
  isValidWebSocketMessage
};
