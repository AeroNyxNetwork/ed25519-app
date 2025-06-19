/**
 * WebSocket Connection Pool Manager for AeroNyx Platform
 * 
 * File Path: src/lib/websocket/ConnectionPoolManager.js
 * 
 * Manages WebSocket connections with pooling, automatic cleanup,
 * and resource optimization based on API documentation limits:
 * - MAX_CONNECTIONS_PER_IP = 3 (user monitor)
 * - MAX_CONNECTIONS_PER_WALLET = 5
 * - MAX_NODE_CONNECTIONS_PER_IP = 10
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 */

import NodeWebSocketService from './NodeWebSocketService';
import UserMonitorWebSocketService from './UserMonitorWebSocketService';
import ErrorRecoveryStrategy from './ErrorRecoveryStrategy';

/**
 * Connection pool configuration based on API limits
 */
const POOL_CONFIG = {
  USER_MONITOR: {
    maxPerWallet: 5,
    maxPerIP: 3,
    idleTimeout: 5 * 60 * 1000,      // 5 minutes
    maxLifetime: 30 * 60 * 1000,     // 30 minutes
    cleanupInterval: 60 * 1000       // 1 minute
  },
  NODE: {
    maxPerIP: 10,
    maxTotal: 100,
    idleTimeout: 10 * 60 * 1000,     // 10 minutes
    maxLifetime: 60 * 60 * 1000,     // 1 hour
    cleanupInterval: 2 * 60 * 1000   // 2 minutes
  },
  SYSTEM: {
    maxTotal: 1,                      // Only one system monitor needed
    idleTimeout: null,                // Never idle timeout
    maxLifetime: null,                // Never expire
    cleanupInterval: 5 * 60 * 1000   // 5 minutes
  }
};

/**
 * Connection metadata for tracking
 */
class ConnectionMetadata {
  constructor(type, identifier) {
    this.type = type;
    this.identifier = identifier;
    this.createdAt = Date.now();
    this.lastUsedAt = Date.now();
    this.useCount = 0;
    this.errors = 0;
    this.state = 'initializing';
    this.tags = new Set();
  }
  
  use() {
    this.lastUsedAt = Date.now();
    this.useCount++;
  }
  
  recordError() {
    this.errors++;
    this.lastUsedAt = Date.now();
  }
  
  isIdle(timeout) {
    if (!timeout) return false;
    return (Date.now() - this.lastUsedAt) > timeout;
  }
  
  isExpired(lifetime) {
    if (!lifetime) return false;
    return (Date.now() - this.createdAt) > lifetime;
  }
  
  getAge() {
    return Date.now() - this.createdAt;
  }
  
  getIdleTime() {
    return Date.now() - this.lastUsedAt;
  }
}

/**
 * Main connection pool manager class
 */
export default class ConnectionPoolManager {
  constructor() {
    // Connection pools by type
    this.pools = {
      node: new Map(),        // Key: reference_code
      userMonitor: new Map(), // Key: wallet_address
      system: new Map()       // Key: 'system'
    };
    
    // Connection metadata
    this.metadata = new Map(); // Key: connection instance
    
    // IP tracking for rate limiting
    this.ipConnections = new Map(); // Key: IP address
    
    // Cleanup timers
    this.cleanupTimers = {};
    
    // Statistics
    this.stats = {
      connectionsCreated: 0,
      connectionsDestroyed: 0,
      connectionsFailed: 0,
      messagesProcessed: 0,
      errors: 0
    };
    
    // Start cleanup processes
    this._initializeCleanup();
  }
  
  /**
   * Get or create a node WebSocket connection
   * 
   * @param {string} referenceCode - Node reference code
   * @param {Object} options - Connection options
   * @param {string} options.clientIP - Client IP for rate limiting
   * @returns {NodeWebSocketService} WebSocket service instance
   */
  async getNodeConnection(referenceCode, options = {}) {
    const poolKey = referenceCode;
    const existing = this.pools.node.get(poolKey);
    
    // Return existing connection if healthy
    if (existing && this._isConnectionHealthy(existing)) {
      const meta = this.metadata.get(existing);
      meta.use();
      return existing;
    }
    
    // Check rate limits
    if (options.clientIP) {
      this._checkIPRateLimit(options.clientIP, 'node');
    }
    
    // Check pool limits
    if (this.pools.node.size >= POOL_CONFIG.NODE.maxTotal) {
      // Try to evict idle connection
      const evicted = this._evictIdleConnection('node');
      if (!evicted) {
        throw new Error('Node connection pool limit reached');
      }
    }
    
    // Create new connection
    const connection = await this._createNodeConnection(referenceCode, options);
    
    // Store in pool
    this.pools.node.set(poolKey, connection);
    
    // Track metadata
    const meta = new ConnectionMetadata('node', referenceCode);
    this.metadata.set(connection, meta);
    
    // Track IP connection
    if (options.clientIP) {
      this._trackIPConnection(options.clientIP, connection);
    }
    
    this.stats.connectionsCreated++;
    
    return connection;
  }
  
  /**
   * Get or create a user monitor WebSocket connection
   * 
   * @param {Object} walletCredentials - Wallet authentication data
   * @param {Object} options - Connection options
   * @returns {UserMonitorWebSocketService} WebSocket service instance
   */
  async getUserMonitorConnection(walletCredentials, options = {}) {
    const poolKey = walletCredentials.walletAddress;
    const existing = this.pools.userMonitor.get(poolKey);
    
    // Return existing connection if healthy
    if (existing && this._isConnectionHealthy(existing)) {
      const meta = this.metadata.get(existing);
      meta.use();
      return existing;
    }
    
    // Check rate limits
    if (options.clientIP) {
      this._checkIPRateLimit(options.clientIP, 'userMonitor');
    }
    
    // Check wallet connection limit
    const walletConnections = this._countWalletConnections(poolKey);
    if (walletConnections >= POOL_CONFIG.USER_MONITOR.maxPerWallet) {
      throw new Error(`Wallet connection limit (${POOL_CONFIG.USER_MONITOR.maxPerWallet}) exceeded`);
    }
    
    // Create new connection
    const connection = await this._createUserMonitorConnection(walletCredentials, options);
    
    // Store in pool
    this.pools.userMonitor.set(poolKey, connection);
    
    // Track metadata
    const meta = new ConnectionMetadata('userMonitor', poolKey);
    meta.tags.add(`wallet:${walletCredentials.walletType}`);
    this.metadata.set(connection, meta);
    
    // Track IP connection
    if (options.clientIP) {
      this._trackIPConnection(options.clientIP, connection);
    }
    
    this.stats.connectionsCreated++;
    
    return connection;
  }
  
  /**
   * Get or create system monitor connection (singleton)
   * 
   * @param {Object} options - Connection options
   * @returns {SystemMonitorWebSocketService} WebSocket service instance
   */
  async getSystemMonitorConnection(options = {}) {
    const poolKey = 'system';
    const existing = this.pools.system.get(poolKey);
    
    // Return existing connection if healthy
    if (existing && this._isConnectionHealthy(existing)) {
      const meta = this.metadata.get(existing);
      meta.use();
      return existing;
    }
    
    // Create new connection
    const connection = await this._createSystemMonitorConnection(options);
    
    // Store in pool
    this.pools.system.set(poolKey, connection);
    
    // Track metadata
    const meta = new ConnectionMetadata('system', poolKey);
    this.metadata.set(connection, meta);
    
    this.stats.connectionsCreated++;
    
    return connection;
  }
  
  /**
   * Remove a connection from the pool
   * 
   * @param {WebSocketService} connection - Connection to remove
   */
  removeConnection(connection) {
    const meta = this.metadata.get(connection);
    if (!meta) return;
    
    // Remove from appropriate pool
    switch (meta.type) {
      case 'node':
        this.pools.node.delete(meta.identifier);
        break;
      case 'userMonitor':
        this.pools.userMonitor.delete(meta.identifier);
        break;
      case 'system':
        this.pools.system.delete(meta.identifier);
        break;
    }
    
    // Remove metadata
    this.metadata.delete(connection);
    
    // Remove IP tracking
    this._removeIPTracking(connection);
    
    // Disconnect if still connected
    if (connection.state === 'OPEN') {
      connection.disconnect();
    }
    
    this.stats.connectionsDestroyed++;
  }
  
  /**
   * Get pool statistics
   * 
   * @returns {Object} Pool statistics
   */
  getStatistics() {
    const poolStats = {
      node: {
        active: 0,
        idle: 0,
        total: this.pools.node.size
      },
      userMonitor: {
        active: 0,
        idle: 0,
        total: this.pools.userMonitor.size
      },
      system: {
        active: 0,
        idle: 0,
        total: this.pools.system.size
      }
    };
    
    // Calculate active/idle counts
    for (const [connection, meta] of this.metadata) {
      const type = meta.type;
      const config = POOL_CONFIG[type.toUpperCase()];
      
      if (meta.isIdle(config.idleTimeout)) {
        poolStats[type].idle++;
      } else {
        poolStats[type].active++;
      }
    }
    
    return {
      pools: poolStats,
      connections: {
        total: this.metadata.size,
        byState: this._getConnectionsByState(),
        avgAge: this._calculateAverageAge(),
        avgErrors: this._calculateAverageErrors()
      },
      performance: this.stats,
      ipTracking: {
        uniqueIPs: this.ipConnections.size,
        topIPs: this._getTopIPs(5)
      }
    };
  }
  
  /**
   * Initialize cleanup processes
   * @private
   */
  _initializeCleanup() {
    // Node connection cleanup
    this.cleanupTimers.node = setInterval(() => {
      this._cleanupPool('node', POOL_CONFIG.NODE);
    }, POOL_CONFIG.NODE.cleanupInterval);
    
    // User monitor cleanup
    this.cleanupTimers.userMonitor = setInterval(() => {
      this._cleanupPool('userMonitor', POOL_CONFIG.USER_MONITOR);
    }, POOL_CONFIG.USER_MONITOR.cleanupInterval);
    
    // System monitor cleanup
    this.cleanupTimers.system = setInterval(() => {
      this._cleanupPool('system', POOL_CONFIG.SYSTEM);
    }, POOL_CONFIG.SYSTEM.cleanupInterval);
  }
  
  /**
   * Cleanup a specific pool
   * @private
   */
  _cleanupPool(poolType, config) {
    const pool = this.pools[poolType];
    const toRemove = [];
    
    for (const [key, connection] of pool) {
      const meta = this.metadata.get(connection);
      if (!meta) continue;
      
      // Check if connection should be removed
      const shouldRemove = 
        !this._isConnectionHealthy(connection) ||
        meta.isExpired(config.maxLifetime) ||
        meta.isIdle(config.idleTimeout) ||
        meta.errors > 5;
      
      if (shouldRemove) {
        toRemove.push(connection);
      }
    }
    
    // Remove marked connections
    toRemove.forEach(connection => {
      this.removeConnection(connection);
    });
    
    if (toRemove.length > 0) {
      console.log(`[ConnectionPool] Cleaned up ${toRemove.length} ${poolType} connections`);
    }
  }
  
  /**
   * Create a new node connection
   * @private
   */
  async _createNodeConnection(referenceCode, options) {
    const connection = new NodeWebSocketService(referenceCode, {
      ...options,
      reconnect: true,
      maxReconnectAttempts: 3
    });
    
    // Setup error recovery
    connection.errorRecovery = new ErrorRecoveryStrategy();
    
    // Setup event handlers
    this._setupConnectionHandlers(connection);
    
    // Connect
    await connection.connect();
    
    return connection;
  }
  
  /**
   * Create a new user monitor connection
   * @private
   */
  async _createUserMonitorConnection(walletCredentials, options) {
    const connection = new UserMonitorWebSocketService(walletCredentials, {
      ...options,
      reconnect: true,
      maxReconnectAttempts: 5
    });
    
    // Setup error recovery
    connection.errorRecovery = new ErrorRecoveryStrategy();
    
    // Setup event handlers
    this._setupConnectionHandlers(connection);
    
    // Connect
    await connection.connect();
    
    return connection;
  }
  
  /**
   * Create a new system monitor connection
   * @private
   */
  async _createSystemMonitorConnection(options) {
    const connection = new SystemMonitorWebSocketService({
      ...options,
      reconnect: true,
      maxReconnectAttempts: Infinity // Always reconnect system monitor
    });
    
    // Setup error recovery
    connection.errorRecovery = new ErrorRecoveryStrategy({
      maxRetries: Infinity
    });
    
    // Setup event handlers
    this._setupConnectionHandlers(connection);
    
    // Connect
    await connection.connect();
    
    return connection;
  }
  
  /**
   * Setup common connection event handlers
   * @private
   */
  _setupConnectionHandlers(connection) {
    const meta = this.metadata.get(connection);
    
    connection.on('error', (error) => {
      if (meta) meta.recordError();
      this.stats.errors++;
    });
    
    connection.on('message', () => {
      if (meta) meta.use();
      this.stats.messagesProcessed++;
    });
    
    connection.on('disconnected', (event) => {
      if (meta) meta.state = 'disconnected';
      
      // Check if should remove from pool
      if (!connection.options.reconnect || 
          !connection.errorRecovery.shouldReconnect(event.code)) {
        this.removeConnection(connection);
      }
    });
    
    connection.on('connected', () => {
      if (meta) meta.state = 'connected';
    });
  }
  
  /**
   * Check if connection is healthy
   * @private
   */
  _isConnectionHealthy(connection) {
    return connection && 
           connection.state === 'OPEN' && 
           connection.authenticated;
  }
  
  /**
   * Check IP rate limits
   * @private
   */
  _checkIPRateLimit(ip, connectionType) {
    const ipData = this.ipConnections.get(ip) || { connections: [] };
    
    const limits = {
      node: POOL_CONFIG.NODE.maxPerIP,
      userMonitor: POOL_CONFIG.USER_MONITOR.maxPerIP
    };
    
    const limit = limits[connectionType];
    if (!limit) return;
    
    const typeConnections = ipData.connections.filter(conn => {
      const meta = this.metadata.get(conn);
      return meta && meta.type === connectionType;
    });
    
    if (typeConnections.length >= limit) {
      throw new Error(`IP connection limit (${limit}) exceeded for ${connectionType}`);
    }
  }
  
  /**
   * Track IP connection
   * @private
   */
  _trackIPConnection(ip, connection) {
    let ipData = this.ipConnections.get(ip);
    if (!ipData) {
      ipData = { connections: [], firstSeen: Date.now() };
      this.ipConnections.set(ip, ipData);
    }
    
    ipData.connections.push(connection);
    ipData.lastSeen = Date.now();
  }
  
  /**
   * Remove IP tracking for connection
   * @private
   */
  _removeIPTracking(connection) {
    for (const [ip, ipData] of this.ipConnections) {
      const index = ipData.connections.indexOf(connection);
      if (index !== -1) {
        ipData.connections.splice(index, 1);
        
        // Remove IP entry if no more connections
        if (ipData.connections.length === 0) {
          this.ipConnections.delete(ip);
        }
        
        break;
      }
    }
  }
  
  /**
   * Count wallet connections
   * @private
   */
  _countWalletConnections(walletAddress) {
    let count = 0;
    
    for (const [conn, meta] of this.metadata) {
      if (meta.type === 'userMonitor' && meta.identifier === walletAddress) {
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * Evict idle connection from pool
   * @private
   */
  _evictIdleConnection(poolType) {
    const pool = this.pools[poolType];
    const config = POOL_CONFIG[poolType.toUpperCase()];
    
    let oldestIdle = null;
    let oldestIdleTime = 0;
    
    for (const [key, connection] of pool) {
      const meta = this.metadata.get(connection);
      if (!meta) continue;
      
      const idleTime = meta.getIdleTime();
      if (idleTime > oldestIdleTime) {
        oldestIdle = connection;
        oldestIdleTime = idleTime;
      }
    }
    
    if (oldestIdle && oldestIdleTime > (config.idleTimeout / 2)) {
      this.removeConnection(oldestIdle);
      return true;
    }
    
    return false;
  }
  
  /**
   * Get connections grouped by state
   * @private
   */
  _getConnectionsByState() {
    const byState = {};
    
    for (const [conn, meta] of this.metadata) {
      const state = meta.state;
      byState[state] = (byState[state] || 0) + 1;
    }
    
    return byState;
  }
  
  /**
   * Calculate average connection age
   * @private
   */
  _calculateAverageAge() {
    if (this.metadata.size === 0) return 0;
    
    let totalAge = 0;
    for (const [conn, meta] of this.metadata) {
      totalAge += meta.getAge();
    }
    
    return Math.round(totalAge / this.metadata.size / 1000); // in seconds
  }
  
  /**
   * Calculate average errors per connection
   * @private
   */
  _calculateAverageErrors() {
    if (this.metadata.size === 0) return 0;
    
    let totalErrors = 0;
    for (const [conn, meta] of this.metadata) {
      totalErrors += meta.errors;
    }
    
    return (totalErrors / this.metadata.size).toFixed(2);
  }
  
  /**
   * Get top IPs by connection count
   * @private
   */
  _getTopIPs(limit) {
    const ipCounts = [];
    
    for (const [ip, data] of this.ipConnections) {
      ipCounts.push({
        ip,
        count: data.connections.length,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen
      });
    }
    
    return ipCounts
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
  
  /**
   * Destroy all connections and cleanup
   */
  destroy() {
    // Clear all timers
    Object.values(this.cleanupTimers).forEach(timer => clearInterval(timer));
    
    // Disconnect all connections
    for (const [connection] of this.metadata) {
      connection.disconnect();
    }
    
    // Clear all data
    this.pools.node.clear();
    this.pools.userMonitor.clear();
    this.pools.system.clear();
    this.metadata.clear();
    this.ipConnections.clear();
    
    console.log('[ConnectionPool] Destroyed all connections');
  }
}

// Export singleton instance
export const connectionPool = new ConnectionPoolManager();
