/**
 * ============================================
 * File: src/stores/terminalStore.js
 * ============================================
 * Zustand Store - Terminal state management
 * 
 * Responsibilities:
 * 1. Manage terminal session state
 * 2. Provide global state access
 * 3. Handle state update logic
 * 4. Coordinate service layer and UI layer
 * 
 * Features:
 * - Immutable state updates (using immer)
 * - Automatic persistence (optional)
 * - DevTools integration
 * ============================================
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import terminalService, { TERMINAL_STATE } from '../services/TerminalService';
import webSocketService from '../services/WebSocketService';

/**
 * Terminal Store
 * Uses Zustand to manage global terminal state
 */
const useTerminalStore = create(
  devtools(
    immer((set, get) => ({
      // ==================== State ====================
      
      /**
       * Terminal session mapping
       * key: sessionId
       * value: { sessionId, nodeReference, state, rows, cols, ... }
       */
      sessions: {},
      
      /**
       * Currently active session ID
       */
      activeSessionId: null,
      
      /**
       * Global loading state
       */
      isLoading: false,
      
      /**
       * Global error message
       */
      error: null,
      
      /**
       * WebSocket connection state
       */
      wsState: {
        connected: false,
        authenticated: false,
        monitoring: false
      },
      
      /**
       * Node state mapping
       * key: nodeReference
       * value: { status, lastSeen, performance, ... }
       */
      nodes: {},
      
      // ==================== Actions ====================
      
      /**
       * Create new terminal session
       * @param {string} nodeReference - Node reference
       * @param {Object} options - Session options
       * @returns {Promise<string>} Session ID
       */
      createSession: async (nodeReference, options = {}) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });
        
        try {
          // Check if node is online
          const node = get().nodes[nodeReference];
          if (node && node.status !== 'online' && node.status !== 'active') {
            throw new Error('Node is not online');
          }
          
          // Create session
          const session = await terminalService.createSession(nodeReference, options);
          
          // Set session event listeners
          session.on('output', (data) => {
            get().handleSessionOutput(session.sessionId, data);
          });
          
          session.on('error', (error) => {
            get().handleSessionError(session.sessionId, error);
          });
          
          session.on('closed', () => {
            get().handleSessionClosed(session.sessionId);
          });
          
          // Update state
          set((state) => {
            state.sessions[session.sessionId] = {
              sessionId: session.sessionId,
              nodeReference: nodeReference,
              state: TERMINAL_STATE.READY,
              rows: session.rows,
              cols: session.cols,
              createdAt: Date.now(),
              lastActivity: Date.now()
            };
            
            // Set as active session
            state.activeSessionId = session.sessionId;
            state.isLoading = false;
          });
          
          return session.sessionId;
          
        } catch (error) {
          set((state) => {
            state.isLoading = false;
            state.error = error.message;
          });
          throw error;
        }
      },
      
      /**
       * Send input to session
       * @param {string} sessionId - Session ID
       * @param {string} data - Input data
       */
      sendInput: (sessionId, data) => {
        const session = terminalService.getSession(sessionId);
        if (session) {
          session.sendInput(data);
          
          // Update activity time
          set((state) => {
            if (state.sessions[sessionId]) {
              state.sessions[sessionId].lastActivity = Date.now();
            }
          });
        }
      },
      
      /**
       * Resize terminal
       * @param {string} sessionId - Session ID
       * @param {number} rows - Number of rows
       * @param {number} cols - Number of columns
       */
      resizeSession: (sessionId, rows, cols) => {
        const session = terminalService.getSession(sessionId);
        if (session) {
          session.resize(rows, cols);
          
          // Update state
          set((state) => {
            if (state.sessions[sessionId]) {
              state.sessions[sessionId].rows = rows;
              state.sessions[sessionId].cols = cols;
            }
          });
        }
      },
      
      /**
       * Close session
       * @param {string} sessionId - Session ID
       */
      closeSession: (sessionId) => {
        terminalService.closeSession(sessionId);
        
        set((state) => {
          delete state.sessions[sessionId];
          
          // If it's the active session, switch to another
          if (state.activeSessionId === sessionId) {
            const sessionIds = Object.keys(state.sessions);
            state.activeSessionId = sessionIds.length > 0 ? sessionIds[0] : null;
          }
        });
      },
      
      /**
       * Close all sessions for a node
       * @param {string} nodeReference - Node reference
       */
      closeNodeSessions: (nodeReference) => {
        const sessions = Object.values(get().sessions).filter(
          s => s.nodeReference === nodeReference
        );
        
        sessions.forEach(session => {
          get().closeSession(session.sessionId);
        });
      },
      
      /**
       * Set active session
       * @param {string} sessionId - Session ID
       */
      setActiveSession: (sessionId) => {
        set((state) => {
          if (state.sessions[sessionId]) {
            state.activeSessionId = sessionId;
          }
        });
      },
      
      /**
       * Get session information
       * @param {string} sessionId - Session ID
       * @returns {Object|null} Session information
       */
      getSession: (sessionId) => {
        return get().sessions[sessionId] || null;
      },
      
      /**
       * Get node's session list
       * @param {string} nodeReference - Node reference
       * @returns {Array} Session list
       */
      getNodeSessions: (nodeReference) => {
        return Object.values(get().sessions).filter(
          s => s.nodeReference === nodeReference
        );
      },
      
      // ==================== Internal Handlers ====================
      
      /**
       * Handle session output
       * @private
       */
      handleSessionOutput: (sessionId, data) => {
        // UI components receive output through event subscription
        // Here we only update activity time
        set((state) => {
          if (state.sessions[sessionId]) {
            state.sessions[sessionId].lastActivity = Date.now();
          }
        });
      },
      
      /**
       * Handle session error
       * @private
       */
      handleSessionError: (sessionId, error) => {
        set((state) => {
          if (state.sessions[sessionId]) {
            state.sessions[sessionId].state = TERMINAL_STATE.ERROR;
            state.sessions[sessionId].error = error;
          }
        });
      },
      
      /**
       * Handle session closed
       * @private
       */
      handleSessionClosed: (sessionId) => {
        set((state) => {
          if (state.sessions[sessionId]) {
            state.sessions[sessionId].state = TERMINAL_STATE.CLOSED;
          }
        });
      },
      
      // ==================== WebSocket State Updates ====================
      
      /**
       * Update WebSocket state
       * @param {Object} wsState - WebSocket state
       */
      updateWsState: (wsState) => {
        set((state) => {
          state.wsState = { ...state.wsState, ...wsState };
        });
      },
      
      /**
       * Update node state
       * @param {Array} nodes - Node list
       */
      updateNodes: (nodes) => {
        set((state) => {
          state.nodes = {};
          nodes.forEach(node => {
            state.nodes[node.code] = {
              ...node,
              status: normalizeNodeStatus(node)
            };
          });
        });
      },
      
      // ==================== Utility Functions ====================
      
      /**
       * Clear error
       */
      clearError: () => {
        set((state) => {
          state.error = null;
        });
      },
      
      /**
       * Reset Store
       */
      reset: () => {
        // Close all sessions
        terminalService.closeAllSessions();
        
        set((state) => {
          state.sessions = {};
          state.activeSessionId = null;
          state.isLoading = false;
          state.error = null;
          state.nodes = {};
        });
      }
    })),
    {
      name: 'terminal-store' // Name in DevTools
    }
  )
);

/**
 * Normalize node status
 * @param {Object} node - Node object
 * @returns {string} Normalized status
 */
function normalizeNodeStatus(node) {
  if (!node) return 'unknown';
  
  const status = (node.status || '').toLowerCase().trim();
  
  const statusMap = {
    'active': 'online',
    'online': 'online',
    'running': 'online',
    'connected': 'online',
    'pending': 'pending',
    'starting': 'pending',
    'connecting': 'pending',
    'inactive': 'offline',
    'offline': 'offline',
    'disconnected': 'offline',
    'stopped': 'offline',
    'error': 'error',
    'failed': 'error'
  };
  
  return statusMap[status] || status || 'unknown';
}

// Set up WebSocket event listeners
webSocketService.on('statusUpdate', (message) => {
  if (message.nodes) {
    useTerminalStore.getState().updateNodes(message.nodes);
  }
});

webSocketService.on('stateChange', ({ newState }) => {
  const wsStateMap = {
    connected: { connected: true },
    authenticated: { authenticated: true },
    monitoring: { monitoring: true },
    closed: { connected: false, authenticated: false, monitoring: false },
    error: { connected: false }
  };
  
  if (wsStateMap[newState]) {
    useTerminalStore.getState().updateWsState(wsStateMap[newState]);
  }
});

// Export Store
export default useTerminalStore;
