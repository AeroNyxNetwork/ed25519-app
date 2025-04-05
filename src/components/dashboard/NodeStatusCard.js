import React from 'react';

export default function NodeStatusCard({ name, status, deviceId, uptime, earnings, cpu, memory }) {
  // Status styling
  const getStatusColor = (status) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'offline':
        return 'bg-red-500';
      case 'pending':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'offline':
        return 'Offline';
      case 'pending':
        return 'Pending Activation';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="card glass-effect">
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-bold text-lg">{name}</h3>
        <div className="flex items-center">
          <span className={`inline-block w-2 h-2 rounded-full ${getStatusColor(status)} mr-2`}></span>
          <span className="text-sm text-gray-300">{getStatusText(status)}</span>
        </div>
      </div>
      
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-1">Device ID</div>
        <div className="font-mono text-sm truncate">{deviceId}</div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs text-gray-400 mb-1">Uptime</div>
          <div className="text-sm">{uptime}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-1">Earnings</div>
          <div className="text-sm">{earnings} AeroNyx</div>
        </div>
      </div>
      
      {status === 'online' && (
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">CPU</span>
              <span>{cpu}%</span>
            </div>
            <div className="w-full bg-background-200 rounded-full h-2">
              <div 
                className="bg-primary-400 rounded-full h-2" 
                style={{ width: `${cpu}%` }}
              ></div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">Memory</span>
              <span>{memory}%</span>
            </div>
            <div className="w-full bg-background-200 rounded-full h-2">
              <div 
                className="bg-secondary-400 rounded-full h-2" 
                style={{ width: `${memory}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}
      
      {status === 'pending' && (
        <div className="text-center py-2 px-4 bg-background-100 rounded-md text-sm text-yellow-400">
          Waiting for on-chain confirmation
        </div>
      )}
    </div>
  );
}
