/**
 * ============================================
 * File: src/services/TerminalService.js
 * ============================================
 * Terminal service layer - Manages terminal session business logic
 * 
 * Creation Reason: Terminal session lifecycle management
 * Modification Reason: Fix terminal ready detection when backend doesn't send term_ready
 * Main Functionality: Terminal session management and I/O processing
 * Dependencies: webSocketService, EventEmitter
 * 
 * Main Logical Flow:
 * 1. Create terminal session with unique ID
 * 2. Send term_init to backend
 * 3. Wait for term_ready OR first term_output as ready signal
 * 4. Handle input/output and session lifecycle
 * 
 * ⚠️ Important Note for Next Developer:
 * - Some backends send term_output directly without term_ready
 * - We treat first term_output as implicit term_ready signal
 * - Session cleanup is automatic on idle timeout
 * - All existing functionality preserved
 * 
 * Last Modified: v2.1.0 - Fixed terminal ready detection for backends that don't send term_ready
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
   * Initialize session
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
    
    // Wait for ready signal (through events) OR first output
    return new Promise((resolve, reject) => {
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          // Check if we received output (implicit ready)
          if (this.hasReceivedFirstOutput || this.stats.bytesReceived > 0) {
            this.log('Session ready (inferred from output)');
            this.state = TERMINAL_STATE.READY;
            resolved = true;
            cleanup();
            this.emit('ready');
            resolve();
          } else {
            this.state = TERMINAL_STATE.ERROR;
            resolved = true;
            cleanup();
            reject(new Error('Terminal initialization timeout'));
          }
        }
      }, 10000);
      
      const handleReady = (message) => {
        if (!resolved && message.session_id === this.sessionId) {
          clearTimeout(timeout);
          resolved = true;
          cleanup();
          this.state = TERMINAL_STATE.READY;
          this.log('Session ready (explicit)');
          this.emit('ready');
          resolve();
        }
      };
      
      const handleOutput = (message) => {
        // If we receive output for this session during initialization, treat it as ready
        if (!resolved && message.session_id === this.sessionId && this.state === TERMINAL_STATE.INITIALIZING) {
          this.log('Received output during initialization, marking as ready');
          this.hasReceivedFirstOutput = true;
          
          // Handle the output
          if (message.data) {
            this.handleOutput(message.data);
          }
          
          // Mark as ready
          clearTimeout(timeout);
          resolved = true;
          cleanup();
          this.state = TERMINAL_STATE.READY;
          this.log('Session ready (from first output)');
          this.emit('ready');
          resolve();
        }
      };
      
      const handleError = (message) => {
        if (!resolved && message.session_id === this.sessionId) {
          clearTimeout(timeout);
          resolved = true;
          cleanup();
          this.state = TERMINAL_STATE.ERROR;
          reject(new Error(message.error || 'Terminal initialization failed'));
        }
      };
      
      const cleanup = () => {
        webSocketService.off('terminalReady', handleReady);
        webSocketService.off('terminalOutput', handleOutput);
        webSocketService.off('terminalError', handleError);
      };
      
      // Listen for both explicit ready and first output
      webSocketService.on('terminalReady', handleReady);
      webSocketService.on('terminalOutput', handleOutput);
      webSocketService.on('terminalError', handleError);
    });
  }
  
  /**
   * Send input
   * @param {string} data - Input data
   * @param {Object} options - Options
   */
  sendInput(data, options = {}) {
    if (this.state !== TERMINAL_STATE.READY) {
      this.log('Cannot send input - session not ready');
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
    if (this.state === TERMINAL_STATE.READY) {
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
      uptime: Date.now() - this.stats.startTime
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
    // Terminal output - handle even if session is initializing
    webSocketService.on('terminalOutput', (message) => {
      const session = this.sessions.get(message.session_id);
      if (session) {
        // If session is initializing and this is first output, it will trigger ready
        if (session.state === TERMINAL_STATE.INITIALIZING && !session.hasReceivedFirstOutput) {
          this.log(`First output received for initializing session ${message.session_id}`);
        }
        session.handleOutput(message.data);
      }
    });
    
    // Terminal error
    webSocketService.on('terminalError', (message) => {
      const session = this.sessions.get(message.session_id);
      if (session) {
        session.state = TERMINAL_STATE.ERROR;
        session.emit('error', message.error || message.message);
      }
    });
    
    // Terminal closed
    webSocketService.on('terminalClosed', (message) => {
      const session = this.sessions.get(message.session_id);
      if (session) {
        session.state = TERMINAL_STATE.CLOSED;
        session.emit('closed');
        this.sessions.delete(message.session_id);
      }
    });
    
    // Also handle term_ready if backend sends it
    webSocketService.on('term_ready', (message) => {
      const session = this.sessions.get(message.session_id);
      if (session && session.state === TERMINAL_STATE.INITIALIZING) {
        this.log(`Explicit term_ready received for session ${message.session_id}`);
        // The session's initialize promise will handle this
      }
    });
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
