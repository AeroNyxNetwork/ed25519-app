/**
 * Dashboard Statistics Card Component for AeroNyx Platform
 * 
 * File Path: src/components/dashboard/DashboardStatsCard.js
 * 
 * This component renders individual statistic cards for the dashboard overview.
 * Each card displays a key metric with customizable styling, icons, and formatting.
 * Supports both simple value display and custom content rendering.
 * 
 * Features:
 * - Flexible content rendering (value or custom content)
 * - Icon integration with multiple predefined options
 * - Color theming support (primary, secondary, accent, success, warning, error)
 * - Loading states and skeleton animations
 * - Responsive design for all screen sizes
 * - Accessibility compliance with ARIA labels
 * - Optional trending indicators and animations
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-01
 */

import React, { useMemo } from 'react';

/**
 * Predefined icon components for statistics cards
 */
const STAT_ICONS = {
  servers: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
    </svg>
  ),
  status: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  earnings: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
    </svg>
  ),
  network: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  performance: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  health: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
  plus: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  )
};

/**
 * Color theme configurations for statistics cards
 */
const COLOR_THEMES = {
  primary: {
    bg: 'bg-primary-900/30',
    border: 'border-primary-800',
    text: 'text-primary-400',
    icon: 'text-primary-500'
  },
  secondary: {
    bg: 'bg-secondary-900/30',
    border: 'border-secondary-800',
    text: 'text-secondary-400',
    icon: 'text-secondary-500'
  },
  accent: {
    bg: 'bg-accent-900/30',
    border: 'border-accent-800',
    text: 'text-accent',
    icon: 'text-accent'
  },
  success: {
    bg: 'bg-green-900/30',
    border: 'border-green-800',
    text: 'text-green-400',
    icon: 'text-green-500'
  },
  warning: {
    bg: 'bg-yellow-900/30',
    border: 'border-yellow-800',
    text: 'text-yellow-400',
    icon: 'text-yellow-500'
  },
  error: {
    bg: 'bg-red-900/30',
    border: 'border-red-800',
    text: 'text-red-400',
    icon: 'text-red-500'
  },
  neutral: {
    bg: 'bg-gray-900/30',
    border: 'border-gray-800',
    text: 'text-gray-400',
    icon: 'text-gray-500'
  }
};

/**
 * Dashboard Statistics Card Component
 * 
 * @param {Object} props - Component properties
 * @param {string} props.title - Card title text
 * @param {string|number} props.value - Primary value to display (optional if customContent provided)
 * @param {string} props.subtitle - Subtitle or description text
 * @param {string} props.icon - Icon identifier from STAT_ICONS
 * @param {string} props.color - Color theme identifier (default: 'neutral')
 * @param {React.ReactNode} props.customContent - Custom content to render instead of value
 * @param {boolean} props.loading - Whether to show loading state (default: false)
 * @param {string} props.trend - Trend indicator ('up', 'down', 'stable') (optional)
 * @param {number} props.trendValue - Numeric trend value for percentage change (optional)
 * @param {string} props.className - Additional CSS classes
 * @param {Function} props.onClick - Click handler for the entire card (optional)
 * @param {Object} props.ariaLabel - Accessibility label override
 * @returns {React.ReactElement} Dashboard statistics card component
 */
export default function DashboardStatsCard({
  title,
  value,
  subtitle,
  icon,
  color = 'neutral',
  customContent,
  loading = false,
  trend,
  trendValue,
  className = '',
  onClick,
  ariaLabel
}) {
  
  // ==================== MEMOIZED VALUES ====================
  
  /**
   * Get the appropriate color theme configuration
   */
  const colorTheme = useMemo(() => {
    return COLOR_THEMES[color] || COLOR_THEMES.neutral;
  }, [color]);

  /**
   * Get the appropriate icon component
   */
  const iconComponent = useMemo(() => {
    return STAT_ICONS[icon] || STAT_ICONS.status;
  }, [icon]);

  /**
   * Format the display value with proper number formatting
   */
  const formattedValue = useMemo(() => {
    if (value === null || value === undefined) return '—';
    
    if (typeof value === 'number') {
      // Handle large numbers with appropriate abbreviations
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`;
      } else if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
      } else if (value % 1 !== 0) {
        return value.toFixed(2);
      }
      return value.toLocaleString();
    }
    
    return String(value);
  }, [value]);

  /**
   * Generate trend indicator component
   */
  const trendIndicator = useMemo(() => {
    if (!trend || loading) return null;

    const trendConfig = {
      up: {
        icon: (
          <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L10 4.414 4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        ),
        color: 'text-green-500'
      },
      down: {
        icon: (
          <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L10 15.586l5.293-5.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ),
        color: 'text-red-500'
      },
      stable: {
        icon: (
          <svg className="h-4 w-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        ),
        color: 'text-gray-500'
      }
    };

    const config = trendConfig[trend];
    if (!config) return null;

    return (
      <div className="flex items-center gap-1 text-xs">
        {config.icon}
        {trendValue !== undefined && (
          <span className={config.color}>
            {trendValue > 0 ? '+' : ''}{trendValue}%
          </span>
        )}
      </div>
    );
  }, [trend, trendValue, loading]);

  /**
   * Determine if the card should be interactive
   */
  const isInteractive = useMemo(() => {
    return typeof onClick === 'function';
  }, [onClick]);

  /**
   * Generate accessibility label
   */
  const accessibilityLabel = useMemo(() => {
    if (ariaLabel) return ariaLabel;
    
    const parts = [title];
    if (!loading && !customContent) {
      parts.push(`value ${formattedValue}`);
    }
    if (subtitle) {
      parts.push(subtitle);
    }
    if (trend && trendValue !== undefined) {
      parts.push(`trending ${trend} by ${trendValue}%`);
    }
    
    return parts.join(', ');
  }, [ariaLabel, title, formattedValue, subtitle, trend, trendValue, loading, customContent]);

  // ==================== RENDER LOADING STATE ====================
  
  if (loading) {
    return (
      <div 
        className={`card glass-effect ${colorTheme.bg} border ${colorTheme.border} ${className}`}
        aria-label="Loading statistics"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-20 mb-2"></div>
            <div className="h-8 bg-gray-700 rounded w-16"></div>
          </div>
          <div className={`p-2 rounded-full ${colorTheme.bg} animate-pulse`}>
            <div className="h-6 w-6 bg-gray-700 rounded"></div>
          </div>
        </div>
        <div className="animate-pulse">
          <div className="h-3 bg-gray-700 rounded w-24"></div>
        </div>
      </div>
    );
  }

  // ==================== RENDER MAIN COMPONENT ====================
  
  return (
    <div 
      className={`
        card glass-effect ${colorTheme.bg} border ${colorTheme.border} 
        transition-all duration-200 
        ${isInteractive ? 'cursor-pointer hover:bg-opacity-80 hover:scale-105 hover:shadow-lg' : ''}
        ${className}
      `}
      onClick={isInteractive ? onClick : undefined}
      role={isInteractive ? 'button' : 'article'}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={accessibilityLabel}
      onKeyPress={isInteractive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e);
        }
      } : undefined}
    >
      {/* Header Section */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm text-gray-400 font-medium truncate">{title}</h3>
          <div className="flex items-center gap-2 mt-1">
            {customContent ? (
              <div className="text-2xl font-bold text-white">
                {customContent}
              </div>
            ) : (
              <div className="text-2xl font-bold text-white">
                {formattedValue}
              </div>
            )}
            {trendIndicator}
          </div>
        </div>
        
        {/* Icon Section */}
        <div className={`p-2 rounded-full ${colorTheme.bg} ${colorTheme.icon} flex-shrink-0`}>
          {iconComponent}
        </div>
      </div>
      
      {/* Subtitle Section */}
      {subtitle && (
        <div className="text-xs text-gray-400 truncate" title={subtitle}>
          {subtitle}
        </div>
      )}
      
      {/* Custom Content Section */}
      {customContent && !value && (
        <div className="mt-2">
          {customContent}
        </div>
      )}
    </div>
  );
}
