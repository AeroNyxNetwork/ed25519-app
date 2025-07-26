/**
 * Node Performance Chart Component with Fixed Layout
 * 
 * File Path: src/components/dashboard/NodePerformanceChart.js
 * 
 * Fixed issues:
 * - Time range buttons overflowing container
 * - Added responsive layout for mobile
 * - Better handling of loading states
 * 
 * @version 1.2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../wallet/WalletProvider';
import nodeRegistrationService from '../../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../../lib/utils/walletSignature';
import { useSignature } from '../../hooks/useSignature';

/**
 * Chart configuration constants
 */
const TIME_RANGES = [
  { value: 1, label: '1h' },
  { value: 6, label: '6h' },
  { value: 24, label: '24h' },
  { value: 72, label: '3d' },
  { value: 168, label: '7d' }
];

const CHART_TYPES = [
  { key: 'cpu', label: 'CPU', color: '#8B5CF6' },
  { key: 'memory', label: 'Memory', color: '#10B981' },
  { key: 'bandwidth', label: 'Bandwidth', color: '#F59E0B' },
  { key: 'storage', label: 'Storage', color: '#EF4444' }
];

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache duration

/**
 * Main NodePerformanceChart Component
 * 
 * @param {Object} props - Component props
 * @param {string} props.nodeId - Node reference code for fetching data
 * @param {number} props.height - Chart height in pixels (default: 300)
 * @param {string} props.signature - Optional pre-generated signature
 * @param {string} props.message - Optional pre-generated message
 */
export default function NodePerformanceChart({ 
  nodeId, 
  height = 300,
  signature: providedSignature,
  message: providedMessage 
}) {
  const { wallet } = useWallet();
  
  // ==================== STATE MANAGEMENT ====================
  
  const [performanceData, setPerformanceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(24); // Default to 24 hours
  const [chartType, setChartType] = useState('cpu'); // Default to CPU
  const [cache, setCache] = useState(new Map());

  // Use provided signature or generate new one
  const { 
    signature: generatedSignature, 
    message: generatedMessage,
    isLoading: isGeneratingSignature
  } = useSignature('performanceChart');
  
  const signature = providedSignature || generatedSignature;
  const message = providedMessage || generatedMessage;

  // ==================== MEMOIZED VALUES ====================
  
  /**
   * Generate cache key for performance data
   */
  const cacheKey = useMemo(() => 
    `${nodeId}_${timeRange}_${chartType}`, 
    [nodeId, timeRange, chartType]
  );

  /**
   * Check if cached data is still valid
   */
  const isCacheValid = useCallback((cacheEntry) => {
    if (!cacheEntry) return false;
    return (Date.now() - cacheEntry.timestamp) < CACHE_DURATION;
  }, []);

  // ==================== DATA FETCHING ====================
  
  /**
   * Fetch performance data from API with caching
   */
  const fetchPerformanceData = useCallback(async () => {
    if (!wallet.connected || !nodeId || !signature || !message) return;

    // Check cache first
    const cachedData = cache.get(cacheKey);
    if (cachedData && isCacheValid(cachedData)) {
      setPerformanceData(cachedData.data);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch performance history from API using provided or generated signature
      const performanceResponse = await nodeRegistrationService.getNodePerformanceHistory(
        wallet.address,
        signature,
        message,
        nodeId,
        timeRange,
        'okx'
      );

      if (performanceResponse.success && performanceResponse.data) {
        const data = performanceResponse.data;
        
        // Cache the successful response
        const newCache = new Map(cache);
        newCache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });
        setCache(newCache);
        
        setPerformanceData(data);
      } else {
        throw new Error(performanceResponse.message || 'Failed to fetch performance data');
      }

    } catch (err) {
      console.error('Failed to fetch performance data:', err);
      setError(err.message || 'Failed to load performance data');
      
      // Use mock data as fallback for demo purposes
      if (process.env.NODE_ENV === 'development') {
        const mockData = generateMockData(nodeId, timeRange);
        setPerformanceData(mockData);
      }
    } finally {
      setLoading(false);
    }
  }, [wallet.connected, wallet.address, nodeId, timeRange, cacheKey, cache, isCacheValid, signature, message]);

  /**
   * Generate mock performance data for development/demo
   */
  const generateMockData = useCallback((nodeId, hours) => {
    const points = Math.min(hours, 168); // Max 1 week of hourly data
    const interval = hours > 24 ? 60 : Math.max(1, hours); // Minutes between points
    
    const data = [];
    const now = new Date();
    
    for (let i = points - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - (i * interval * 60 * 1000));
      
      // Generate realistic performance data with patterns
      const baseLoad = 40 + Math.sin(i * 0.2) * 15; // Daily pattern
      const noise = (Math.random() - 0.5) * 20; // Random variation
      const trend = i * 0.1; // Slight upward trend
      
      data.push({
        timestamp: timestamp.toISOString(),
        cpu_usage: Math.max(0, Math.min(100, baseLoad + noise - trend)),
        memory_usage: Math.max(0, Math.min(100, baseLoad + noise + 10)),
        bandwidth_usage: Math.max(0, Math.min(100, (baseLoad + noise) * 0.6)),
        storage_usage: Math.max(0, Math.min(100, 35 + Math.sin(i * 0.05) * 5)), // Slower changing
        network_latency: Math.max(10, 50 + Math.sin(i * 0.3) * 20), // ms
        uptime: Math.random() > 0.05 ? 100 : 0 // 95% uptime
      });
    }
    
    return {
      node_id: nodeId,
      time_range_hours: hours,
      data_points: data.length,
      performance_history: data,
      cache_info: {
        generated_at: now.toISOString(),
        is_mock_data: true
      }
    };
  }, []);

  // ==================== CHART DATA PROCESSING ====================
  
  /**
   * Transform performance data for chart rendering
   */
  const chartData = useMemo(() => {
    if (!performanceData || !performanceData.performance_history) return [];
    
    return performanceData.performance_history.map(point => ({
      time: new Date(point.timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }),
      value: point[`${chartType}_usage`] || point[chartType] || 0,
      fullTime: point.timestamp,
      rawData: point
    }));
  }, [performanceData, chartType]);

  /**
   * Calculate chart dimensions and scaling
   */
  const chartConfig = useMemo(() => {
    const data = chartData;
    if (data.length === 0) return { maxValue: 100, color: '#8B5CF6' };
    
    const maxValue = Math.max(...data.map(d => d.value));
    const chartTypeConfig = CHART_TYPES.find(t => t.key === chartType);
    
    return {
      maxValue: chartType.includes('usage') ? Math.max(maxValue, 100) : maxValue * 1.2,
      color: chartTypeConfig?.color || '#8B5CF6'
    };
  }, [chartData, chartType]);

  // ==================== LIFECYCLE HOOKS ====================
  
  useEffect(() => {
    if (nodeId && wallet.connected && signature && message) {
      fetchPerformanceData();
    }
  }, [nodeId, wallet.connected, timeRange, signature, message, fetchPerformanceData]);

  // ==================== EVENT HANDLERS ====================
  
  const handleTimeRangeChange = useCallback((newRange) => {
    setTimeRange(newRange);
  }, []);

  const handleChartTypeChange = useCallback((newType) => {
    setChartType(newType);
  }, []);

  const handleRefresh = useCallback(() => {
    // Clear cache for current key and refetch
    const newCache = new Map(cache);
    newCache.delete(cacheKey);
    setCache(newCache);
    fetchPerformanceData();
  }, [cache, cacheKey, fetchPerformanceData]);

  // ==================== RENDER COMPONENTS ====================
  
  /**
   * Render time range selector with responsive layout
   */
  const TimeRangeSelector = () => (
    <div className="flex gap-1 flex-shrink-0 overflow-x-auto no-scrollbar">
      {TIME_RANGES.map(range => (
        <button
          key={range.value}
          onClick={() => handleTimeRangeChange(range.value)}
          className={`px-2 sm:px-3 py-1 text-xs rounded transition-colors whitespace-nowrap flex-shrink-0 ${
            timeRange === range.value 
              ? 'bg-primary text-white' 
              : 'bg-background-100 text-gray-300 hover:bg-background-200'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );

  /**
   * Render chart type selector
   */
  const ChartTypeSelector = () => (
    <div className="flex gap-1 flex-shrink-0 overflow-x-auto no-scrollbar">
      {CHART_TYPES.map(type => (
        <button
          key={type.key}
          onClick={() => handleChartTypeChange(type.key)}
          className={`px-2 sm:px-3 py-1 text-xs rounded transition-colors whitespace-nowrap flex-shrink-0 ${
            chartType === type.key 
              ? 'bg-secondary text-white' 
              : 'bg-background-100 text-gray-300 hover:bg-background-200'
          }`}
        >
          {type.label}
        </button>
      ))}
    </div>
  );

  /**
   * Render SVG line chart
   */
  const LineChart = () => {
    const data = chartData;
    const { maxValue, color } = chartConfig;
    
    if (data.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          No data available
        </div>
      );
    }

    const chartHeight = height - 80; // Account for labels and padding
    const chartWidth = 100; // Percentage based
    
    // Create SVG path for the line
    const points = data.map((point, index) => {
      const x = (index / Math.max(1, data.length - 1)) * chartWidth;
      const y = chartHeight - ((point.value / maxValue) * chartHeight);
      return `${x},${y}`;
    }).join(' ');

    // Y-axis grid values
    const gridValues = [100, 75, 50, 25, 0];

    return (
      <div className="relative" style={{ height: `${height}px` }}>
        <svg 
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${chartWidth} ${height}`}
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {gridValues.map(percent => {
            const y = chartHeight - (percent / 100) * chartHeight;
            return (
              <line
                key={percent}
                x1="0"
                y1={y}
                x2={chartWidth}
                y2={y}
                stroke="#374151"
                strokeWidth="0.2"
                opacity="0.5"
              />
            );
          })}
          
          {/* Area under the line */}
          <polygon
            points={`0,${chartHeight} ${points} ${chartWidth},${chartHeight}`}
            fill={color}
            opacity="0.1"
          />
          
          {/* Main line */}
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="0.5"
          />
          
          {/* Data points */}
          {data.map((point, index) => {
            const x = (index / Math.max(1, data.length - 1)) * chartWidth;
            const y = chartHeight - ((point.value / maxValue) * chartHeight);
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="0.3"
                fill={color}
                className="hover:r-0.5 transition-all"
              />
            );
          })}
        </svg>
        
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-400 -ml-8">
          {gridValues.map(value => (
            <div key={value} className="text-right">
              {chartType.includes('usage') ? 
                `${Math.round((value / 100) * maxValue)}%` : 
                Math.round((value / 100) * maxValue)
              }
            </div>
          ))}
        </div>
        
        {/* X-axis labels */}
        <div className="absolute bottom-0 left-0 w-full flex justify-between text-xs text-gray-400 mt-2">
          {data.length > 0 && (
            <>
              <span>{data[0].time}</span>
              {data.length > 2 && <span>{data[Math.floor(data.length / 2)].time}</span>}
              <span>{data[data.length - 1].time}</span>
            </>
          )}
        </div>
      </div>
    );
  };

  // ==================== MAIN RENDER ====================
  
  if (loading || isGeneratingSignature) {
    return (
      <div className="bg-background-100 rounded-lg p-4">
        <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-background-100 rounded-lg p-4">
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-md">
          <div className="text-red-400 text-sm mb-2">
            Failed to load performance data: {error}
          </div>
          <button 
            onClick={handleRefresh}
            className="text-xs text-red-300 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentChartType = CHART_TYPES.find(t => t.key === chartType);

  return (
    <div className="bg-background-100 rounded-lg p-4">
      {/* Chart Header */}
      <div className="flex flex-col gap-4 mb-4">
        {/* Title and refresh button */}
        <div className="flex items-center justify-between">
          <h5 className="font-medium">
            {currentChartType?.label || 'Performance'} Usage
          </h5>
          <button
            onClick={handleRefresh}
            className="text-gray-400 hover:text-white transition-colors"
            title="Refresh data"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Selectors with responsive layout */}
        <div className="flex flex-col sm:flex-row gap-2 overflow-hidden">
          <div className="flex-1 min-w-0">
            <ChartTypeSelector />
          </div>
          <div className="flex-1 min-w-0">
            <TimeRangeSelector />
          </div>
        </div>
      </div>
      
      {/* Chart Metadata */}
      {performanceData && (
        <div className="mb-4 text-xs text-gray-400 flex flex-col sm:flex-row sm:justify-between gap-1">
          <span className="truncate">
            Last updated: {performanceData.performance_history?.length > 0 && 
              new Date(performanceData.performance_history[performanceData.performance_history.length - 1]?.timestamp).toLocaleString()
            }
          </span>
          <span className="flex-shrink-0">
            {performanceData.data_points} data points over {timeRange}h
            {performanceData.cache_info?.is_mock_data && (
              <span className="ml-2 text-yellow-400">(Demo Data)</span>
            )}
          </span>
        </div>
      )}
      
      {/* Chart Visualization */}
      <LineChart />
      
      {/* Signature Status (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-2 text-xs text-gray-500">
          Using {providedSignature ? 'provided' : 'generated'} signature
        </div>
      )}
    </div>
  );
}

/* Add custom CSS for hiding scrollbar */
const style = document.createElement('style');
style.textContent = `
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`;
document.head.appendChild(style);
