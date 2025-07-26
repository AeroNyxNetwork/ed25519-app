/**
 * Beautiful Performance Chart Component
 * Using Recharts for better visualization
 * 
 * File Path: src/components/dashboard/BeautifulPerformanceChart.js
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function BeautifulPerformanceChart({ 
  nodeId, 
  height = 400,
  performanceData,
  timeRange = 24
}) {
  const [chartType, setChartType] = useState('area'); // area or line
  const [selectedMetrics, setSelectedMetrics] = useState(['cpu', 'memory']);

  // Process data for Recharts
  const chartData = useMemo(() => {
    if (!performanceData?.performance_history) return [];
    
    return performanceData.performance_history.map(point => ({
      time: new Date(point.timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }),
      cpu: point.cpu_usage || 0,
      memory: point.memory_usage || 0,
      bandwidth: point.bandwidth_usage || 0,
      disk: point.storage_usage || 0,
      timestamp: point.timestamp
    }));
  }, [performanceData]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (chartData.length === 0) return {};
    
    const metrics = ['cpu', 'memory', 'bandwidth', 'disk'];
    const result = {};
    
    metrics.forEach(metric => {
      const values = chartData.map(d => d[metric]);
      const current = values[values.length - 1];
      const previous = values[values.length - 2] || current;
      const change = ((current - previous) / previous * 100).toFixed(1);
      
      result[metric] = {
        current,
        average: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
        max: Math.max(...values),
        min: Math.min(...values),
        change: isNaN(change) ? 0 : change,
        trend: current > previous ? 'up' : current < previous ? 'down' : 'stable'
      };
    });
    
    return result;
  }, [chartData]);

  // Metric configuration
  const metrics = [
    { key: 'cpu', label: 'CPU', color: '#8B5CF6', gradient: 'url(#cpuGradient)' },
    { key: 'memory', label: 'Memory', color: '#10B981', gradient: 'url(#memoryGradient)' },
    { key: 'bandwidth', label: 'Bandwidth', color: '#F59E0B', gradient: 'url(#bandwidthGradient)' },
    { key: 'disk', label: 'Disk', color: '#EF4444', gradient: 'url(#diskGradient)' }
  ];

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;
    
    return (
      <div className="bg-gray-900 border border-white/20 rounded-lg p-3 shadow-xl">
        <p className="text-sm text-gray-400 mb-2">{label}</p>
        {payload.map(entry => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-sm">
            <span style={{ color: entry.color }}>{entry.name}</span>
            <span className="text-white font-medium">{entry.value}%</span>
          </div>
        ))}
      </div>
    );
  };

  // Toggle metric selection
  const toggleMetric = (metric) => {
    setSelectedMetrics(prev => {
      if (prev.includes(metric)) {
        return prev.filter(m => m !== metric);
      }
      return [...prev, metric];
    });
  };

  return (
    <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-white mb-2">Performance History</h3>
        <p className="text-sm text-gray-400">Real-time resource utilization over {timeRange} hours</p>
      </div>

      {/* Metric Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {metrics.map(metric => {
          const stat = stats[metric.key] || {};
          const isSelected = selectedMetrics.includes(metric.key);
          
          return (
            <motion.button
              key={metric.key}
              onClick={() => toggleMetric(metric.key)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`p-4 rounded-xl border transition-all ${
                isSelected 
                  ? 'bg-white/10 border-white/20' 
                  : 'bg-white/5 border-white/10 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: metric.color }}>
                  {metric.label}
                </span>
                {stat.trend === 'up' ? (
                  <TrendingUp className="w-4 h-4 text-green-400" />
                ) : stat.trend === 'down' ? (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                ) : (
                  <Minus className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <p className="text-2xl font-bold text-white text-left">
                {stat.current || 0}%
              </p>
              <p className="text-xs text-gray-400 text-left mt-1">
                Avg: {stat.average || 0}%
              </p>
            </motion.button>
          );
        })}
      </div>

      {/* Chart Type Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setChartType('area')}
          className={`px-3 py-1 rounded-lg text-sm transition-colors ${
            chartType === 'area' 
              ? 'bg-purple-600 text-white' 
              : 'bg-white/10 text-gray-400 hover:bg-white/20'
          }`}
        >
          Area Chart
        </button>
        <button
          onClick={() => setChartType('line')}
          className={`px-3 py-1 rounded-lg text-sm transition-colors ${
            chartType === 'line' 
              ? 'bg-purple-600 text-white' 
              : 'bg-white/10 text-gray-400 hover:bg-white/20'
          }`}
        >
          Line Chart
        </button>
      </div>

      {/* Chart */}
      <div style={{ height: `${height}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                {metrics.map(metric => (
                  <linearGradient key={`${metric.key}Gradient`} id={`${metric.key}Gradient`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={metric.color} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={metric.color} stopOpacity={0.1}/>
                  </linearGradient>
                ))}
              </defs>
              
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              
              <XAxis 
                dataKey="time" 
                stroke="#9CA3AF"
                fontSize={12}
                tickLine={false}
              />
              
              <YAxis 
                stroke="#9CA3AF"
                fontSize={12}
                tickLine={false}
                domain={[0, 100]}
              />
              
              <Tooltip content={<CustomTooltip />} />
              
              {metrics.map(metric => (
                selectedMetrics.includes(metric.key) && (
                  <Area
                    key={metric.key}
                    type="monotone"
                    dataKey={metric.key}
                    stroke={metric.color}
                    fill={metric.gradient}
                    strokeWidth={2}
                    name={metric.label}
                  />
                )
              ))}
            </AreaChart>
          ) : (
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              
              <XAxis 
                dataKey="time" 
                stroke="#9CA3AF"
                fontSize={12}
                tickLine={false}
              />
              
              <YAxis 
                stroke="#9CA3AF"
                fontSize={12}
                tickLine={false}
                domain={[0, 100]}
              />
              
              <Tooltip content={<CustomTooltip />} />
              
              {metrics.map(metric => (
                selectedMetrics.includes(metric.key) && (
                  <Line
                    key={metric.key}
                    type="monotone"
                    dataKey={metric.key}
                    stroke={metric.color}
                    strokeWidth={2}
                    dot={false}
                    name={metric.label}
                  />
                )
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 justify-center">
        {metrics.filter(m => selectedMetrics.includes(m.key)).map(metric => (
          <div key={metric.key} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: metric.color }}
            />
            <span className="text-sm text-gray-400">{metric.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
