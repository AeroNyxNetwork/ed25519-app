import React from 'react';

export default function NodeStatusCard({ name, status, deviceId, uptime, earnings, cpu, memory, type = 'general' }) {
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
  
  // Node type icon and badge color
  const getNodeTypeBadge = (type) => {
    switch (type) {
      case 'compute':
        return {
          color: 'bg-primary-900/30 text-primary-400 border border-primary-800',
          label: 'Compute'
        };
      case 'storage':
        return {
          color: 'bg-secondary-900/30 text-secondary-400 border border-secondary-800',
          label: 'Storage'
        };
      case 'ai':
        return {
          color: 'bg-purple-900/30 text-purple-400 border border-purple-800',
          label: 'AI Training'
        };
      case 'onion':
        return {
          color: 'bg-yellow-900/30 text-yellow-400 border border-yellow-800',
          label: 'Onion Routing'
        };
      case 'privacy':
        return {
          color: 'bg-green-900/30 text-green-400 border border-green-800',
          label: 'Privacy'
        };
      default:
        return {
          color: 'bg-accent-900/30 text-accent border border-accent-800',
          label: 'General'
        };
    }
  };

  const typeBadge = getNodeTypeBadge(type);

  return (
    <div className="card glass-effect">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-bold text-lg">{name}</h3>
        <div className="flex items-center">
          <span className={`inline-block w-2 h-2 rounded-full ${getStatusColor(status)} mr-2`}></span>
          <span className="text-sm text-gray-300">{getStatusText(status)}</span>
        </div>
      </div>
      
      <div className="mb-1">
        <span className={`text-xs px-2 py-1 rounded-md ${typeBadge.color} inline-block mb-2`}>
          {typeBadge.label}
        </span>
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
