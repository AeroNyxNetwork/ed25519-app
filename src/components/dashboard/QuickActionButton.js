/**
 * Quick Action Button Component for AeroNyx Dashboard
 * 
 * File Path: src/components/dashboard/QuickActionButton.js
 * 
 * This component renders prominent action buttons for the dashboard that allow
 * users to quickly access primary functions like registering nodes, managing
 * existing nodes, or accessing important features. Each button includes an
 * icon, title, description, and supports different visual themes.
 * 
 * Features:
 * - Icon integration with predefined and custom icons
 * - Color theming support (primary, secondary, accent, etc.)
 * - Hover effects and smooth transitions
 * - Link integration with Next.js routing
 * - Keyboard accessibility support
 * - Loading states and disabled functionality
 * - Badge/notification support for action counts
 * - Responsive design optimization
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-01
 */

import React, { useMemo } from 'react';
import Link from 'next/link';

/**
 * Predefined icon components for quick action buttons
 */
const ACTION_ICONS = {
  plus: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  ),
  servers: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  settings: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  analytics: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  blockchain: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  network: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  external: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
  document: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
};

/**
 * Color theme configurations for quick action buttons
 */
const COLOR_THEMES = {
  primary: {
    bg: 'bg-primary-600',
    hover: 'hover:bg-primary-500',
    text: 'text-white',
    icon: 'text-white'
  },
  secondary: {
    bg: 'bg-secondary-600',
    hover: 'hover:bg-secondary-500',
    text: 'text-white',
    icon: 'text-white'
  },
  accent: {
    bg: 'bg-accent-600',
    hover: 'hover:bg-accent-500',
    text: 'text-background',
    icon: 'text-background'
  },
  success: {
    bg: 'bg-green-600',
    hover: 'hover:bg-green-500',
    text: 'text-white',
    icon: 'text-white'
  },
  warning: {
    bg: 'bg-yellow-600',
    hover: 'hover:bg-yellow-500',
    text: 'text-background',
    icon: 'text-background'
  },
  error: {
    bg: 'bg-red-600',
    hover: 'hover:bg-red-500',
    text: 'text-white',
    icon: 'text-white'
  },
  neutral: {
    bg: 'bg-background-100',
    hover: 'hover:bg-background-200',
    text: 'text-white',
    icon: 'text-gray-300'
  }
};

/**
 * Quick Action Button Component
 * 
 * @param {Object} props - Component properties
 * @param {string} props.href - Link destination URL (optional if onClick provided)
 * @param {string} props.icon - Icon identifier from ACTION_ICONS
 * @param {string} props.title - Button title text
 * @param {string} props.description - Button description text
 * @param {string} props.color - Color theme identifier (default: 'primary')
 * @param {React.ReactNode} props.customIcon - Custom icon component (overrides icon prop)
 * @param {boolean} props.loading - Whether to show loading state (default: false)
 * @param {boolean} props.disabled - Whether button is disabled (default: false)
 * @param {Function} props.onClick - Click handler for button actions (optional)
 * @param {boolean} props.external - Whether link opens in new tab (default: false)
 * @param {string|number} props.badge - Badge content to display (optional)
 * @param {string} props.badgeColor - Badge color theme (default: 'error')
 * @param {string} props.className - Additional CSS classes
 * @param {Object} props.ariaLabel - Accessibility label override
 * @returns {React.ReactElement} Quick action button component
 */
export default function QuickActionButton({
  href,
  icon,
  title,
  description,
  color = 'primary',
  customIcon,
  loading = false,
  disabled = false,
  onClick,
  external = false,
  badge,
  badgeColor = 'error',
  className = '',
  ariaLabel
}) {
  
  // ==================== MEMOIZED VALUES ====================
  
  /**
   * Get the appropriate color theme configuration
   */
  const colorTheme = useMemo(() => {
    return COLOR_THEMES[color] || COLOR_THEMES.primary;
  }, [color]);

  /**
   * Get the appropriate icon component
   */
  const iconComponent = useMemo(() => {
    if (customIcon) return customIcon;
    return ACTION_ICONS[icon] || ACTION_ICONS.plus;
  }, [icon, customIcon]);

  /**
   * Get badge color configuration
   */
  const badgeTheme = useMemo(() => {
    const badgeColors = {
      primary: 'bg-primary-500 text-white',
      secondary: 'bg-secondary-500 text-white',
      accent: 'bg-accent text-background',
      success: 'bg-green-500 text-white',
      warning: 'bg-yellow-500 text-background',
      error: 'bg-red-500 text-white',
      neutral: 'bg-gray-500 text-white'
    };
    return badgeColors[badgeColor] || badgeColors.error;
  }, [badgeColor]);

  /**
   * Determine if this is a link or button interaction
   */
  const isLink = useMemo(() => {
    return href && !onClick && !disabled;
  }, [href, onClick, disabled]);

  /**
   * Generate accessibility label
   */
  const accessibilityLabel = useMemo(() => {
    if (ariaLabel) return ariaLabel;
    
    const parts = [title];
    if (description) {
      parts.push(description);
    }
    if (badge) {
      parts.push(`${badge} notifications`);
    }
    if (external) {
      parts.push('opens in new tab');
    }
    if (disabled) {
      parts.push('disabled');
    }
    
    return parts.join(', ');
  }, [ariaLabel, title, description, badge, external, disabled]);

  /**
   * Generate click handler
   */
  const handleClick = useMemo(() => {
    if (disabled || loading) return undefined;
    return onClick;
  }, [onClick, disabled, loading]);

  /**
   * Determine external link properties
   */
  const linkProps = useMemo(() => {
    if (!external) return {};
    return {
      target: '_blank',
      rel: 'noopener noreferrer'
    };
  }, [external]);

  // ==================== RENDER LOADING STATE ====================
  
  if (loading) {
    return (
      <div 
        className={`
          card glass-effect flex items-center gap-4 
          ${colorTheme.bg} ${colorTheme.text} 
          opacity-75 cursor-wait
          ${className}
        `}
        aria-label="Loading action"
      >
        <div className={`p-3 rounded-full bg-white/20 animate-pulse`}>
          <div className="h-6 w-6 bg-white/40 rounded"></div>
        </div>
        <div className="flex-1 animate-pulse">
          <div className="h-5 bg-white/40 rounded w-32 mb-2"></div>
          <div className="h-4 bg-white/20 rounded w-48"></div>
        </div>
      </div>
    );
  }

  // ==================== RENDER BUTTON CONTENT ====================
  
  const buttonContent = (
    <>
      <div className="relative">
        <div className={`p-3 rounded-full bg-white/20 ${colorTheme.icon}`}>
          {iconComponent}
        </div>
        
        {/* Badge */}
        {badge && (
          <div className={`
            absolute -top-1 -right-1 
            ${badgeTheme}
            text-xs font-bold 
            rounded-full min-w-[1.25rem] h-5 
            flex items-center justify-center
            border-2 border-current
          `}>
            {badge}
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-lg truncate">{title}</h3>
        <p className="text-sm opacity-80 truncate" title={description}>
          {description}
        </p>
      </div>
      
      {/* External link indicator */}
      {external && (
        <div className={`${colorTheme.icon} opacity-60`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
      )}
    </>
  );

  // ==================== RENDER MAIN COMPONENT ====================
  
  const baseClasses = `
    card glass-effect flex items-center gap-4 
    ${colorTheme.bg} ${colorTheme.hover} ${colorTheme.text}
    transition-all duration-200 
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 hover:shadow-lg cursor-pointer'}
    ${className}
  `;

  // Render as Link component
  if (isLink) {
    return (
      <Link 
        href={href}
        className={baseClasses}
        aria-label={accessibilityLabel}
        {...linkProps}
      >
        {buttonContent}
      </Link>
    );
  }

  // Render as button element
  return (
    <button
      className={baseClasses}
      onClick={handleClick}
      disabled={disabled}
      aria-label={accessibilityLabel}
      type="button"
    >
      {buttonContent}
    </button>
  );
}
