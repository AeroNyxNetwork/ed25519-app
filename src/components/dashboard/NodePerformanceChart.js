/**
 * src/components/dashboard/NodePerformanceChart.js
 * Node Performance Chart Component using the new performance history API
 */

import React, { useState, useEffect } from 'react';
import { useWallet } from '../wallet/WalletProvider';
import nodeRegistrationService from '../../lib/api/nodeRegistration';
import { signMessage, formatMessageForSigning } from '../../lib/utils/walletSignature';

export default function NodePerformanceChart({ nodeId, height = 300 }) {
  const { wallet } = useWallet();
  const [performanceData, setPerformanceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(24); // Default to 24 hours
  const [chartType, setChartType] = useState('cpu'); // cpu, memory, bandwidth, earnings

  useEffect(() => {
    if (nodeId && wallet.connected) {
      fetchPerformanceData();
    }
  }, [nodeId, wallet.connected, timeRange]);

  /**
   * Fetch performance history data from API
   */
  const fetchPerformanceData = async () => {
    if (!wallet.connected || !nodeId) return;

    setLoading(true);
    setError(null);

    try {
      // Generate signature message
      const messageResponse = await nodeRegistrationService.generateSignatureMessage(wallet.address);
      
      if (!messageResponse.success) {
        throw new Error(messageResponse.message || 'Failed to generate signature message');
      }

      const message = messageResponse.data.message;
      const formattedMessage = formatMessageForSigning(message);

      // Get wallet signature
      const signature = await signMessage(wallet.provider, formattedMessage, wallet.address);

      // Fetch performance history
      const performanceResponse = await nodeRegistrationService.getNodePerformanceHistory(
        wallet.address,
        signature,
        message,
        nodeId,
        timeRange,
        'okx'
      );

      if (performanceResponse.success && performanceResponse.data) {
        setPerformanceData(performanceResponse.data);
      } else {
        throw new Error(performanceResponse.message || 'Failed to fetch performance data');
      }

    } catch (err) {
      console.error('Failed to fetch performance data:', err);
      setError(err.message || 'Failed to load performance data');
      // Use mock data as fallback for demo
      setPerformanceData(generateMockData());
    } finally {
      setLoading(false);
    }
  };

  /**
   * Generate mock performance data for demonstration
   */
  const generateMockData = () => {
    const points = timeRange > 24 ? Math.min(timeRange, 168) : 24; // Limit to 1 week max
    const interval = timeRange > 24 ? 60 : timeRange; // minutes between points
    
    const data = [];
    const now = new Date();
    
    for (let i = points - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - (i * interval * 60 * 1000));
      
      // Generate realistic performance data with some variation
      const baseLoad = 40 + Math.sin(i * 0.2) * 15; // Base load with daily pattern
      const noise = (Math.random() - 0.5) * 20; // Random variation
      
      data.push({
        timestamp: timestamp.toISOString(),
        cpu_usage: Math.max(0, Math.min(100, baseLoad + noise)),
        memory_usage: Math.max(0, Math.min(100, baseLoad + noise + 10)),
        bandwidth_usage: Math.max(0, Math.min(100, (baseLoad + noise) * 0.6)),
        storage_usage: Math.max(0, Math.min(100, 35 + Math.sin(i * 0.05) * 5)), // Slower changing
        earnings_rate: Math.max(0, (baseLoad + noise) * 0.01), // AeroNyx per hour
        network_latency: Math.max(10, 50 + Math.sin(i * 0.3) * 20), // ms
        uptime: Math.random() > 0.05 ? 100 : 0 // 95% uptime
      });
    }
    
    return {
      node_id: nodeId,
      time_range_hours: timeRange,
      data_points: data.length,
      performance_history: data
    };
  };

  /**
   * Get chart data based on selected type
   */
  const getChartData = () => {
    if (!performanceData || !performanceData.performance_history) return [];
    
    return performanceData.performance_history.map(point => ({
      time: new Date(point.timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }),
      value: point[`${chartType}_usage`] || point[chartType] || 0,
      fullTime: point.timestamp
    }));
  };

  /**
   * Get chart color based on type
   */
  const getChartColor = () => {
    switch (chartType) {
      case 'cpu': return '#8B5CF6'; // Purple
      case 'memory': return '#10B981'; // Green
      case 'bandwidth': return '#F59E0B'; // Yellow
      case 'storage': return '#EF4444'; // Red
      case 'earnings': return '#3B82F6'; // Blue
      default: return '#8B5CF6';
    }
  };

  /**
   * Get max value for chart scaling
   */
  const getMaxValue = () => {
    const data = getChartData();
    if (data.length === 0) return 100;
    
    const maxValue = Math.max(...data.map(d => d.value));
    
    // For percentage metrics, cap at 100
    if (['cpu', 'memory', 'bandwidth', 'storage'].includes(chartType)) {
      return Math.max(maxValue, 100);
    }
    
    // For other metrics, add 20% padding
    return maxValue * 1.2;
  };

  /**
   * Render time range selector
   */
  const TimeRangeSelector = () => (
    <div className="flex gap-2 mb-4">
      {[1, 6, 24, 72, 168].map(hours => (
        <button
          key={hours}
          onClick={() => setTimeRange(hours)}
          className={`px-3 py-1 text-xs rounded ${
            timeRange === hours 
              ? 'bg-primary text-white' 
              : 'bg-background-100 text-gray-300 hover:bg-background-200'
          }`}
        >
          {hours === 1 ? '1h' : hours < 24 ? `${hours}h` : `${hours/24}d`}
        </button>
      ))}
    </div>
  );

  /**
   * Render chart type selector
   */
  const ChartTypeSelector = () => (
    <div className="flex gap-2 mb-4">
      {[
        { key: 'cpu', label: 'CPU' },
        { key: 'memory', label: 'Memory' },
        { key: 'bandwidth', label: 'Bandwidth' },
        { key: 'storage', label: 'Storage' }
      ].map(type => (
        <button
          key={type.key}
          onClick={() => setChartType(type.key)}
          className={`px-3 py-1 text-xs rounded ${
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
   * Render simple line chart
   */
  const SimpleLineChart = () => {
    const data = getChartData();
    const maxValue = getMaxValue();
    const color = getChartColor();
    
    if (data.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          No data available
        </div>
      );
    }

    // Create SVG path for the line
    const width = 100; // Percentage based
    const chartHeight = height - 60; // Account for labels
    
    const points = data.map((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = chartHeight - ((point.value / maxValue) * chartHeight);
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="relative" style={{ height: `${height}px` }}>
        <svg 
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(percent => (
            <line
              key={percent}
              x1="0"
              y1={chartHeight - (percent / 100) * chartHeight}
              x2="100"
              y2={chartHeight - (percent / 100) * chartHeight}
              stroke="#374151"
              strokeWidth="0.2"
              opacity="0.5"
            />
          ))}
          
          {/* Area under the line */}
          <polygon
            points={`0,${chartHeight} ${points} 100,${chartHeight}`}
            fill={color}
            opacity="0.1"
          />
          
          {/* Line */}
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="0.5"
          />
          
          {/* Data points */}
          {data.map((point, index) => {
            const x = (index / (data.length - 1)) * 100;
            const y = chartHeight - ((point.value / maxValue) * chartHeight);
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="0.3"
                fill={color}
              />
            );
          })}
        </svg>
        
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-400 -ml-8">
          {[100, 75, 50, 25, 0].map(value => (
            <div key={value} className="text-right">
              {chartType.includes('usage') ? `${Math.round((value / 100) * maxValue)}%` : Math.round((value / 100) * maxValue)}
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4" style={{ height: `${height}px` }}>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-800 rounded-md">
        <div className="text-red-400 text-sm">
          Failed to load performance data: {error}
        </div>
        <button 
          onClick={fetchPerformanceData}
          className="mt-2 text-xs text-red-300 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-background-100 rounded-lg p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <h5 className="font-medium">
          {chartType.charAt(0).toUpperCase() + chartType.slice(1)} Performance
        </h5>
        <div className="flex flex-col sm:flex-row gap-2">
          <ChartTypeSelector />
          <TimeRangeSelector />
        </div>
      </div>
      
      {performanceData && (
        <div className="mb-4 text-xs text-gray-400">
          Last updated: {new Date(performanceData.performance_history?.[performanceData.performance_history.length - 1]?.timestamp).toLocaleString()}
          <span className="ml-4">
            {performanceData.data_points} data points over {timeRange}h
          </span>
        </div>
      )}
      
      <SimpleLineChart />
    </div>
  );
}
