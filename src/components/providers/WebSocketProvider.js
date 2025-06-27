/**
 * WebSocket Provider - Production Simplified Version
 * 
 * File Path: src/components/providers/WebSocketProvider.js
 * 
 * Following Occam's Razor - WebSocket logic is handled directly in components
 * This provider is kept for potential future centralized WebSocket management
 * 
 * @version 2.0.0
 */

'use client';

import React, { createContext, useContext } from 'react';

const WebSocketContext = createContext({});

/**
 * WebSocket Provider Component
 * Currently a placeholder - WebSocket connections are managed within individual components
 */
export function WebSocketProvider({ children }) {
  // WebSocket management has been simplified and moved to individual components
  // This provider remains for potential future centralized state management
  
  return (
    <WebSocketContext.Provider value={{}}>
      {children}
    </WebSocketContext.Provider>
  );
}

/**
 * Hook to access WebSocket context
 * Currently returns empty object as WebSocket is handled in components
 */
export const useWebSocket = () => {
  return useContext(WebSocketContext);
};
