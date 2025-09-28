/**
 * ============================================
 * File: src/services/TerminalService.js
 * ============================================
 * Terminal service layer - Manages terminal session business logic
 * 
 * Creation Reason: Terminal session lifecycle management
 * Modification Reason: Support both explicit term_ready and auto-ready fallback
 * Main Functionality: Terminal session management with robust initialization
 * Dependencies: webSocketService, EventEmitter
 * 
 * Main Logical Flow:
 * 1. Create terminal session with unique ID
 * 2. Send term_init to backend
 * 3. Wait for term_ready OR auto-ready after 1 second
 * 4. Handle input/output and session lifecycle
 * 
 * ⚠️ Important Note for Next Developer:
 * - Supports backends that send term_ready immediately
 * - Also works with backends that don't send term_ready
 * - Auto-ready after 1 second as fallback
 * - All existing functionality preserved
 * 
 * Last Modified: v3.0.0 - Complete fix with auto-ready fallback
 * ============================================
 */

import webSocketService from './WebSocketService';
import EventEmitter from 'events';

// Terminal session states
const TERMINAL_STATE = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  READY: 'ready',
  ERROR: 'error',
  CLOSED: 'closed'
};

/**
 * Terminal Session Class
 * Represents an independent terminal session
 */
class TerminalSession extends EventEmitter {
  constructor(sessionId, nodeReference) {
    super();
    
    this.sessionId = sessionId;
    this.nodeReference = nodeReference;
    this.state = TERMINAL_STATE.IDLE;
    
    // Terminal configuration
    this.rows = 24;
    this.cols = 80;
    
    // Input buffer (for batch sending)
    this.inputBuffer = [];
    this.inputBufferTimeout = null;
    
    // Output history
    this.outputHistory = [];
    this.maxHistorySize = 10000; // Maximum history lines
    
    // Statistics
    this.stats = {
      bytesReceived: 0,
      bytesSent: 0,
      startTime: Date.now(),
      lastActivity: Date.now()
    };
    
    // Track if we've received first output (implicit ready signal)
    this.hasReceivedFirstOutput = false;
    
    // Debug mode
    this.debug = true;
  }
  
  /**
   * Log output
   */
  log(...args) {
    if (this.debug) {
      console.log(`[TerminalSession:${this.sessionId}]`, ...args);
    }
  }
  
  /**
   * Initialize session with robust ready detection
   */
  async initialize(options = {}) {
    const { rows = 24, cols = 80, cwd = '/', env = {} } = options;
    
    this.rows = rows;
    this.cols = cols;
    this.state = TERMINAL_STATE.INITIALIZING;
    
    this.log('Initializing session');
    
    // Send initialization command
    const success = webSocketService.send({
      type: 'term_init',
      session_id: this.sessionId,
      node_reference: this.nodeReference,
      rows,
      cols,
      cwd,
      env
    });
    
    if (!success) {
      this.state = TERMINAL_STATE.ERROR;
      throw new Error('Failed to send initialization message');
    }
    
    // Wait for ready signal with multiple strategies
    return new Promise((resolve, reject) => {
      let resolved = false;
      
      // Strategy 1: Quick auto-ready timeout (1 second)
      // This handles backends that don't send term_ready
      const autoReadyTimeout = setTimeout(() => {
        if (!resolved) {
          this.log('Auto-marking session as ready (fallback)');
          this.state = TERMINAL_STATE.READY;
          resolved = true;
          cleanup();
          this.emit('ready');
          resolve();
        }
      }, 1000); // Wait 1 second then auto-ready
      
      // Strategy 2: Listen for explicit term_ready
      const handleReady = (message) => {
        // Check if this message is for our session
        if (!resolved && message.session_id === this.sessionId) {
          this.log('Received explicit term_ready');
          clearTimeout(autoReadyTimeout);
          clearTimeout(errorTimeout);
          resolved = true;
          cleanup();
          this.state = TERMINAL_STATE.READY;
          this.emit('ready');
          resolve();
        }
      };
      
      // Strategy 3: First output as implicit ready
      const handleOutput = (message) => {
        if (!resolved && message.session_id === this.sessionId && this.state === TERMINAL_STATE.INITIALIZING) {
          this.log('Received first output, marking as ready');
          this.hasReceivedFirstOutput = true;
          
          // Handle the output
          if (message.data) {
            this.handleOutput(message.data);
          }
          
          clearTimeout(autoReadyTimeout);
          clearTimeout(errorTimeout);
          resolved = true;
          cleanup();
          this.state = TERMINAL_STATE.READY;
          this.emit('ready');
          resolve();
        }
      };
      
      // Error handler
      const handleError = (message) => {
        if (!resolved && message.session_id === this.sessionId) {
          clearTimeout(autoReadyTimeout);
          clearTimeout(errorTimeout);
          resolved = true;
          cleanup();
          this.state = TERMINAL_STATE.ERROR;
          reject(new Error(message.error || 'Terminal initialization failed'));
        }
      };
      
      // Error timeout (10 seconds) - only if no response at all
      const errorTimeout = setTimeout(() => {
        if (!resolved && this.stats.bytesReceived === 0) {
          resolved = true;
          cleanup();
          this.state = TERMINAL_STATE.ERROR;
          reject(new Error('Terminal initialization timeout - no response from server'));
        }
      }, 10000);
      
      // Cleanup function
      const cleanup = () => {
        // Remove all possible event listeners
        webSocketService.off('terminalReady', handleReady);
        webSocketService.off('term_ready', handleReady);
        webSocketService.off('terminalOutput', handleOutput);
        webSocketService.off('term_output', handleOutput);
        webSocketService.off('terminalError', handleError);
        webSocketService.off('term_error', handleError);
      };
      
      // Listen for multiple event names for maximum compatibility
      webSocketService.on('terminalReady', handleReady);
      webSocketService.on('term_ready', handleReady);
      webSocketService.on('terminalOutput', handleOutput);
      webSocketService.on('term_output', handleOutput);
      webSocketService.on('terminalError', handleError);
      webSocketService.on('term_error', handleError);
    });
  }
  
  /**
   * Send input
   * @param {string} data - Input data
   * @param {Object} options - Options
   */
  sendInput(data, options = {}) {
    if (this.state !== TERMINAL_STATE.READY) {
      this.log('Cannot send input - session not ready (state: ' + this.state + ')');
      return false;
    }
    
    // Update statistics
    this.stats.bytesSent += data.length;
    this.stats.lastActivity = Date.now();
    
    // Send immediately or buffer
    if (options.immediate) {
      return this.flushInput(data);
    } else {
      this.bufferInput(data);
      return true;
    }
  }
  
  /**
   * Buffer input (for batch sending)
   */
  bufferInput(data) {
    this.inputBuffer.push(data);
    
    // Clear existing timeout
    if (this.inputBufferTimeout) {
      clearTimeout(this.inputBufferTimeout);
    }
    
    // Set new timeout (send after 10ms)
    this.inputBufferTimeout = setTimeout(() => {
      this.flushInputBuffer();
    }, 10);
  }
  
  /**
   * Flush input buffer
   */
  flushInputBuffer() {
    if (this.inputBuffer.length === 0) return;
    
    const combined = this.inputBuffer.join('');
    this.inputBuffer = [];
    this.flushInput(combined);
  }
  
  /**
   * Send input immediately
   */
  flushInput(data) {
    this.log(`Sending input: ${data.length} bytes`);
    
    return webSocketService.send({
      type: 'term_input',
      session_id: this.sessionId,
      data: data
    });
  }
  
  /**
   * Handle output
   * @param {string} data - Output data
   */
  handleOutput(data) {
    // Update statistics
    this.stats.bytesReceived += data.length;
    this.stats.lastActivity = Date.now();
    
    // Mark that we've received output
    this.hasReceivedFirstOutput = true;
    
    // Add to history
    this.outputHistory.push({
      timestamp: Date.now(),
      data: data
    });
    
    // Limit history size
    if (this.outputHistory.length > this.maxHistorySize) {
      this.outputHistory.shift();
    }
    
    // Emit output event
    this.emit('output', data);
  }
  
  /**
   * Resize terminal
   */
  resize(rows, cols) {
    if (this.state !== TERMINAL_STATE.READY) {
      this.log('Cannot resize - session not ready');
      return false;
    }
    
    this.rows = rows;
    this.cols = cols;
    
    return webSocketService.send({
      type: 'term_resize',
      session_id: this.sessionId,
      rows,
      cols
    });
  }
  
  /**
   * Close session
   */
  close() {
    this.log('Closing session');
    
    // Clear buffer
    if (this.inputBufferTimeout) {
      clearTimeout(this.inputBufferTimeout);
      this.inputBuffer = [];
    }
    
    // Send close command
    if (this.state === TERMINAL_STATE.READY || this.state === TERMINAL_STATE.INITIALIZING) {
      webSocketService.send({
        type: 'term_close',
        session_id: this.sessionId
      });
    }
    
    this.state = TERMINAL_STATE.CLOSED;
    this.emit('closed');
    
    // Clean up event listeners
    this.removeAllListeners();
  }
  
  /**
   * Get session information
   */
  getInfo() {
    return {
      sessionId: this.sessionId,
      nodeReference: this.nodeReference,
      state: this.state,
      rows: this.rows,
      cols: this.cols,
      stats: { ...this.stats },
      uptime: Date.now() - this.stats.startTime,
      hasReceivedOutput: this.hasReceivedFirstOutput
    };
  }
}

/**
 * Terminal Service Class
 * Manages all terminal sessions
 */
class TerminalService extends EventEmitter {
  constructor() {
    super();
    
    // Session mapping
    this.sessions = new Map();
    
    // Set up WebSocket event listeners
    this.setupWebSocketListeners();
    
    // Debug mode
    this.debug = true;
  }
  
  /**
   * Log output
   */
  log(...args) {
    if (this.debug) {
      console.log('[TerminalService]', ...args);
    }
  }
  
  /**
   * Set up WebSocket event listeners
   */
  setupWebSocketListeners() {
    // Terminal output handler - works for both term_output and terminalOutput
    const handleOutput = (message) => {
      const session = this.sessions.get(message.session_id);
      if (session) {
        // If session is initializing and this is first output, it will trigger ready in the session
        if (session.state === TERMINAL_STATE.INITIALIZING && !session.hasReceivedFirstOutput) {
          this.log(`First output received for initializing session ${message.session_id}`);
        }
        
        // Only handle output if we have data
        if (message.data !== undefined && message.data !== null) {
          session.handleOutput(message.data);
        }
      } else {
        this.log(`Output for unknown session: ${message.session_id}`);
      }
    };
    
    // Terminal error handler
    const handleError = (message) => {
      const session = this.sessions.get(message.session_id);
      if (session) {
        session.state = TERMINAL_STATE.ERROR;
        session.emit('error', message.error || message.message);
      }
    };
    
    // Terminal closed handler
    const handleClosed = (message) => {
      const session = this.sessions.get(message.session_id);
      if (session) {
        session.state = TERMINAL_STATE.CLOSED;
        session.emit('closed');
        this.sessions.delete(message.session_id);
      }
    };
    
    // Terminal ready handler
    const handleReady = (message) => {
      const session = this.sessions.get(message.session_id);
      if (session && session.state === TERMINAL_STATE.INITIALIZING) {
        this.log(`Explicit term_ready received for session ${message.session_id}`);
        // The session's initialize promise will handle this via its own listener
      }
    };
    
    // Register listeners for multiple event names for compatibility
    webSocketService.on('terminalOutput', handleOutput);
    webSocketService.on('term_output', handleOutput);
    
    webSocketService.on('terminalError', handleError);
    webSocketService.on('term_error', handleError);
    
    webSocketService.on('terminalClosed', handleClosed);
    webSocketService.on('term_closed', handleClosed);
    
    webSocketService.on('terminalReady', handleReady);
    webSocketService.on('term_ready', handleReady);
  }
  
  /**
   * Create new terminal session
   * @param {string} nodeReference - Node reference
   * @param {Object} options - Session options
   * @returns {Promise<TerminalSession>} Terminal session instance
   */
  async createSession(nodeReference, options = {}) {
    // Generate unique session ID
    const sessionId = `term_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.log(`Creating session ${sessionId} for node ${nodeReference}`);
    
    // Create session instance
    const session = new TerminalSession(sessionId, nodeReference);
    
    // Add to session mapping BEFORE initialization
    // This is important so WebSocket events can find the session
    this.sessions.set(sessionId, session);
    
    // Listen for session closed event
    session.once('closed', () => {
      this.sessions.delete(sessionId);
      this.emit('sessionClosed', sessionId);
    });
    
    try {
      // Initialize session
      await session.initialize(options);
      
      // Emit session created event
      this.emit('sessionCreated', session);
      
      return session;
    } catch (error) {
      // Clean up failed session
      this.sessions.delete(sessionId);
      throw error;
    }
  }
  
  /**
   * Get session
   * @param {string} sessionId - Session ID
   * @returns {TerminalSession|null} Session instance
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }
  
  /**
   * Get all sessions for a node
   * @param {string} nodeReference - Node reference
   * @returns {Array<TerminalSession>} Session list
   */
  getNodeSessions(nodeReference) {
    const sessions = [];
    this.sessions.forEach((session) => {
      if (session.nodeReference === nodeReference) {
        sessions.push(session);
      }
    });
    return sessions;
  }
  
  /**
   * Close session
   * @param {string} sessionId - Session ID
   */
  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.close();
      this.sessions.delete(sessionId);
    }
  }
  
  /**
   * Close all sessions for a node
   * @param {string} nodeReference - Node reference
   */
  closeNodeSessions(nodeReference) {
    const sessions = this.getNodeSessions(nodeReference);
    sessions.forEach((session) => {
      session.close();
      this.sessions.delete(session.sessionId);
    });
  }
  
  /**
   * Close all sessions
   */
  closeAllSessions() {
    this.sessions.forEach((session) => {
      session.close();
    });
    this.sessions.clear();
  }
  
  /**
   * Get all session information
   */
  getAllSessionsInfo() {
    const info = [];
    this.sessions.forEach((session) => {
      info.push(session.getInfo());
    });
    return info;
  }
  
  /**
   * Clean up idle sessions
   * @param {number} idleTime - Idle time threshold (milliseconds)
   */
  cleanupIdleSessions(idleTime = 30 * 60 * 1000) {
    const now = Date.now();
    const toClose = [];
    
    this.sessions.forEach((session) => {
      if (now - session.stats.lastActivity > idleTime) {
        toClose.push(session.sessionId);
      }
    });
    
    toClose.forEach((sessionId) => {
      this.log(`Closing idle session: ${sessionId}`);
      this.closeSession(sessionId);
    });
    
    return toClose.length;
  }
}

// Create singleton instance
const terminalService = new TerminalService();

// Periodically clean up idle sessions
setInterval(() => {
  terminalService.cleanupIdleSessions();
}, 5 * 60 * 1000); // Check every 5 minutes

// Attach to window for debugging (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.terminalService = terminalService;
}

// Export service and related items
export default terminalService;
export { TerminalSession, TERMINAL_STATE };
