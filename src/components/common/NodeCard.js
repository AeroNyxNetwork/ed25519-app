/**
 * ============================================
 * File Creation/Modification Notes
 * ============================================
 * Creation Reason: Simplified Node Card Component
 * Main Functionality: Display node status with actionable information only
 * Dependencies: None - Pure presentation component
 *
 * Design Philosophy:
 * 1. Show only what matters for decision making
 * 2. Visual indicators over numbers where possible
 * 3. One-click actions for common tasks
 *
 * ⚠️ Important Note for Next Developer:
 * - This is a pure presentation component
 * - No earnings or financial metrics
 * - Focus on operational status only
 *
 * Last Modified: v1.0.0 - Created simplified version
 * ============================================
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronRight,
  Cpu,
  HardDrive,
  Wifi,
  Activity
} from 'lucide-react';
import clsx from 'clsx';

/**
 * Get node health status based on performance metrics
 */
function getNodeHealth(node) {
  const status = (node.status || '').toLowerCase();
  const cpu = node.performance?.cpu || 0;
  const memory = node.performance?.memory || 0;
  
  // Offline takes priority
  if (status === 'offline' || status === 'disconnected') {
    return {
      level: 'critical',
      label: 'Offline',
      icon: XCircle,
      color: 'red',
      priority: 1
    };
  }
  
  // High resource usage
  if (cpu > 90 || memory > 90) {
    return {
      level: 'warning',
      label: 'High Load',
      icon: AlertTriangle,
      color: 'orange',
      priority: 2
    };
  }
  
  // Moderate resource usage or pending
  if (cpu > 70 || memory > 70 || status === 'pending') {
    return {
      level: 'attention',
      label: status === 'pending' ? 'Pending' : 'Moderate Load',
      icon: status === 'pending' ? Clock : Activity,
      color: 'yellow',
      priority: 3
    };
  }
  
  // Healthy
  return {
    level: 'healthy',
    label: 'Healthy',
    icon: CheckCircle,
    color: 'green',
    priority: 4
  };
}

/**
 * Simplified Node Card Component
 * Focus: Quick status assessment and navigation
 */
export default function NodeCard({ node, variant = 'default', onClick }) {
  const health = getNodeHealth(node);
  const HealthIcon = health.icon;
  
  // Determine if this node needs attention
  const needsAttention = health.priority <= 2;
  
  const cardContent = (
    <motion.div
      whileHover={{ x: variant === 'compact' ? 2 : 4 }}
      className={clsx(
        "relative group transition-all",
        variant === 'compact' 
          ? "flex items-center gap-3 p-3 rounded-lg"
          : "flex items-center justify-between p-4 rounded-xl",
        "bg-white/5 hover:bg-white/10",
        "border border-transparent hover:border-white/10",
        needsAttention && "ring-1 ring-red-500/20"
      )}
    >
      {/* Status Indicator */}
      <div className="flex items-center gap-3">
        <div className={clsx(
          "relative flex items-center justify-center",
          variant === 'compact' ? "w-10 h-10" : "w-12 h-12",
          "rounded-lg transition-all",
          `bg-${health.color}-500/10 group-hover:bg-${health.color}-500/20`
        )}>
          <HealthIcon className={clsx(
            variant === 'compact' ? "w-5 h-5" : "w-6 h-6",
            `text-${health.color}-400`
          )} />
          
          {/* Pulse animation for critical status */}
          {health.level === 'critical' && (
            <div className="absolute inset-0 rounded-lg animate-ping bg-red-500/20" />
          )}
        </div>
        
        {/* Node Info */}
        <div className="min-w-0 flex-1">
          <h3 className={clsx(
            "font-semibold truncate",
            variant === 'compact' ? "text-sm" : "text-base"
          )}>
            {node.name}
          </h3>
          
          {/* Quick Metrics Bar */}
          {variant !== 'compact' && node.performance && (
            <div className="flex items-center gap-4 mt-1">
              <QuickMetric
                icon={Cpu}
                value={node.performance.cpu}
                threshold={70}
                label="CPU"
              />
              <QuickMetric
                icon={HardDrive}
                value={node.performance.memory}
                threshold={70}
                label="MEM"
              />
              {node.performance.network !== undefined && (
                <QuickMetric
                  icon={Wifi}
                  value={node.performance.network}
                  threshold={80}
                  label="NET"
                />
              )}
            </div>
          )}
          
          {variant === 'compact' && (
            <p className="text-xs text-gray-500 truncate">
              {node.code || node.id}
            </p>
          )}
        </div>
      </div>
      
      {/* Right Side */}
      <div className="flex items-center gap-3">
        {/* Health Badge */}
        <div className={clsx(
          "px-2 py-1 rounded-full text-xs font-medium",
          `bg-${health.color}-500/20 text-${health.color}-400`
        )}>
          {health.label}
        </div>
        
        {/* Navigation Arrow */}
        <ChevronRight className={clsx(
          "w-4 h-4 text-gray-500",
          "group-hover:text-gray-300 transition-colors"
        )} />
      </div>
      
      {/* Attention Indicator */}
      {needsAttention && (
        <div className="absolute top-2 right-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        </div>
      )}
    </motion.div>
  );
  
  // If onClick is provided, make it a button
  if (onClick) {
    return (
      <button
        onClick={() => onClick(node)}
        className="w-full text-left"
      >
        {cardContent}
      </button>
    );
  }
  
  // Otherwise, make it a link
  return (
    <Link href={`/dashboard/nodes/${node.code || node.id}`}>
      {cardContent}
    </Link>
  );
}

/**
 * Quick Metric Component
 * Visual representation of resource usage
 */
function QuickMetric({ icon: Icon, value = 0, threshold = 70, label }) {
  const isHigh = value > threshold;
  const isCritical = value > 90;
  
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon className={clsx(
        "w-3 h-3",
        isCritical ? "text-red-400" :
        isHigh ? "text-yellow-400" :
        "text-gray-400"
      )} />
      <span className="text-gray-500">{label}</span>
      <span className={clsx(
        "font-mono font-medium",
        isCritical ? "text-red-400" :
        isHigh ? "text-yellow-400" :
        "text-gray-300"
      )}>
        {value}%
      </span>
    </div>
  );
}

/**
 * Node Card Skeleton for loading states
 */
export function NodeCardSkeleton({ variant = 'default' }) {
  return (
    <div className={clsx(
      "animate-pulse",
      variant === 'compact' 
        ? "flex items-center gap-3 p-3 rounded-lg"
        : "flex items-center justify-between p-4 rounded-xl",
      "bg-white/5 border border-white/10"
    )}>
      <div className="flex items-center gap-3">
        <div className={clsx(
          variant === 'compact' ? "w-10 h-10" : "w-12 h-12",
          "rounded-lg bg-gray-700"
        )} />
        <div>
          <div className="h-4 w-32 bg-gray-700 rounded mb-2" />
          {variant !== 'compact' && (
            <div className="h-3 w-24 bg-gray-700 rounded" />
          )}
        </div>
      </div>
      <div className="h-6 w-16 bg-gray-700 rounded-full" />
    </div>
  );
}

/**
 * Empty State Component
 */
export function NoNodesMessage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-12"
    >
      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Activity className="w-8 h-8 text-gray-600" />
      </div>
      <h3 className="text-lg font-medium text-white mb-2">No Nodes Yet</h3>
      <p className="text-gray-400 mb-6">
        Start by registering your first node
      </p>
      <Link href="/dashboard/register">
        <motion.a
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl text-white font-medium hover:from-purple-700 hover:to-blue-700 transition-all"
        >
          Register Node
        </motion.a>
      </Link>
    </motion.div>
  );
}
