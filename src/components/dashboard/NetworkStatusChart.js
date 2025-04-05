'use client';

import React, { useState, useEffect } from 'react';

export default function NetworkStatusChart({ data, timeRange }) {
  const [chartType, setChartType] = useState('nodes');
  
  // This is a simplified chart component. In a real application, you would use a proper charting library
  // like recharts, Chart.js, or D3.js. For this demo, we'll create a simple visual representation.
  
  // We'll use different datasets based on the selected chart type
  const chartData = chartType === 'nodes' ? data.nodesHistory : data.utilizationHistory;
  
  // Calculate the max value for scaling
  const maxValue = Math.max(...chartData.map(item => chartType === 'nodes' ? item.count : item.value));
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-4">
          <button 
            className={`text-sm ${chartType === 'nodes' ? 'text-primary font-bold' : 'text-gray-400'}`}
            onClick={() => setChartType('nodes')}
          >
            Node Growth
          </button>
          <button 
            className={`text-sm ${chartType === 'utilization' ? 'text-primary font-bold' : 'text-gray-400'}`}
            onClick={() => setChartType('utilization')}
          >
            Utilization %
          </button>
        </div>
        <div className="text-sm text-gray-400">
          {timeRange === 'day' ? 'Last 24 hours' : 
           timeRange === 'week' ? 'Last 7 days' : 
           timeRange === 'month' ? 'Last 30 days' : 'All time'}
        </div>
      </div>
      
      <div className="h-64 relative">
        {/* Chart Container */}
        <div className="absolute inset-0">
          {/* Grid lines */}
          <div className="grid grid-cols-1 grid-rows-4 h-full">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border-t border-background-200 relative">
                <span className="absolute -top-3 -left-8 text-xs text-gray-400">
                  {chartType === 'nodes' 
                    ? Math.round(maxValue - (i * (maxValue / 4))).toLocaleString() 
                    : `${Math.round(maxValue - (i * (maxValue / 4)))}%`
                  }
                </span>
              </div>
            ))}
          </div>
          
          {/* Bars */}
          <div className="absolute inset-0 flex items-end pt-6">
            <div className="w-full h-full flex items-end justify-between">
              {chartData.map((item, index) => {
                const value = chartType === 'nodes' ? item.count : item.value;
                const height = `${(value / maxValue) * 100}%`;
                
                return (
                  <div key={index} className="flex flex-col items-center justify-end h-full" style={{ width: `${100 / chartData.length}%` }}>
                    <div 
                      className={`w-2/3 ${chartType === 'nodes' ? 'bg-primary' : 'bg-secondary'} rounded-t`} 
                      style={{ height }}
                    ></div>
                    <div className="mt-2 text-xs text-gray-400">{item.date}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      
      <div className="pt-8 text-center text-sm text-gray-400">
        {chartType === 'nodes' 
          ? 'Total registered nodes on the AeroNyx network over time'
          : 'Network-wide resource utilization percentage over time'
        }
      </div>
    </div>
  );
}
