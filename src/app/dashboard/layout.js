/**
 * Dashboard Layout Component for AeroNyx Platform
 * 
 * File Path: src/app/dashboard/layout.js
 * 
 * Provides the main layout structure for dashboard pages with
 * WebSocket provider integration for real-time data updates.
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

'use client';

import React from 'react';
import { WebSocketProvider } from '../../components/providers/WebSocketProvider';

/**
 * Dashboard Layout Component
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @returns {React.ReactElement} Dashboard layout with providers
 */
export default function DashboardLayout({ children }) {
  return (
    <WebSocketProvider>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto">
          {children}
        </div>
      </div>
    </WebSocketProvider>
  );
}
