/**
 * AeroNyx Logo Component
 * 
 * File Path: src/components/common/Logo.js
 * 
 * Reusable logo component to avoid SSR/hydration issues
 * 
 * @version 1.0.0
 */

'use client';

import React from 'react';

export default function Logo({ className = "w-10 h-10", color = "#8A2BE2" }) {
  return (
    <div className={`relative ${className}`}>
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 512 512" 
        className="w-full h-full"
        aria-label="AeroNyx Logo"
      >
        <g transform="translate(0,512) scale(0.1,-0.1)" fill={color} stroke="none">
          <path d="M1277 3833 l-1277 -1278 0 -1275 0 -1275 1280 1280 1280 1280 -2 1273 -3 1272 -1278 -1277z"/>
          <path d="M3838 3833 l-1278 -1278 0 -1275 0 -1275 1280 1280 1280 1280 -2 1273 -3 1272 -1277 -1277z"/>
        </g>
      </svg>
    </div>
  );
}
