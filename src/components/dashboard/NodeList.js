import React, { useState } from 'react';
import Link from 'next/link';

export default function NodeList({ nodes, onBlockchainIntegrate }) {
  const [expandedNode, setExpandedNode] = useState(null);

  // Format date to local string
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Get status badge styling
  const getStatusBadge = (status) => {
    switch (status) {
      case 'online':
        return 'bg-green-900/30 text-green-500 border border-green-800';
      case 'offline':
        return 'bg-red-900/30 text-red-500 border border-red-800';
      case 'pending':
        return 'bg-yellow-900/30 text-yellow-500 border border-yellow-800';
      default:
        return 'bg-gray-900/30 text-gray-500 border border-gray-800';
    }
  };

  // Toggle node details expansion
  const toggleNodeExpansion = (nodeId) => {
    if (expandedNode === nodeId) {
      setExpandedNode(null);
    } else {
      setExpandedNode(nodeId);
    }
  };

  // Get node type icon and color
  const getNodeTypeIcon = (type) => {
    switch (type) {
      case 'compute':
        return {
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          ),
          color: "text-primary"
        };
      case 'storage':
        return {
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          ),
          color: "text-secondary"
        };
      case 'ai':
        return {
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          ),
          color: "text-purple-500"
        };
      case 'onion':
        return {
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          ),
          color: "text-yellow-500"
        };
      case 'privacy':
        return {
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          ),
          color: "text-green-500"
        };
      default: // general
        return {
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
          ),
          color: "text-accent"
        };
    }
  };

  // Get node type description
  const getNodeTypeDescription = (type) => {
    switch (type) {
      case 'general':
        return "General purpose node providing a balanced mix of resources to the network.";
      case 'compute':
        return "Compute optimized node focusing on CPU and memory resources.";
      case 'storage':
        return "Storage optimized node providing large amounts of secure storage capacity.";
      case 'ai':
        return "AI training node equipped with specialized hardware for machine learning workloads.";
      case 'onion':
        return "Onion routing node helping facilitate anonymous communication. No public IP required.";
      case 'privacy':
        return "Privacy network node focused on encrypting and protecting sensitive data.";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      {nodes.map((node) => {
        const nodeTypeInfo = getNodeTypeIcon(node.type);
        const hasBlockchainIntegrations = node.blockchainIntegrations && node.blockchainIntegrations.length > 0;
        
        return (
          <div key={node.id} className="card glass-effect">
            <div 
              className="flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
              onClick={() => toggleNodeExpansion(node.id)}
            >
              <div className="flex items-start gap-4">
                {/* Node icon based on type */}
                <div className="p-3 rounded-full bg-background-200">
                  {nodeTypeInfo.icon}
                </div>
                
                <div>
                  <h3 className="font-bold text-lg">{node.name}</h3>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="font-mono text-xs text-gray-400">{node.id}</span>
                    <span className={`text-xs px-2 py-1 rounded ${getStatusBadge(node.status)}`}>
                      {node.status.charAt(0).toUpperCase() + node.status.slice(1)}
                    </span>
                    
                    {/* Blockchain indicator badge */}
                    {hasBlockchainIntegrations && (
                      <span className="text-xs px-2 py-1 rounded bg-blue-900/30 text-blue-400 border border-blue-800 flex items-center gap-1">
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M13 16H11V18H13V16Z" fill="currentColor"/>
                          <path d="M13 8H11V14H13V8Z" fill="currentColor"/>
                          <path fillRule="evenodd" clipRule="evenodd" d="M4 4H20V20H4V4ZM2 4C2 2.89543 2.89543 2 4 2H20C21.1046 2 22 2.89543 22 4V20C22 21.1046 21.1046 22 20 22H4C2.89543 22 2 21.1046 2 20V4Z" fill="currentColor"/>
                        </svg>
                        <span>Blockchain</span>
                      </span>
                    )}
                  </div>
                  <div className={`text-xs mt-1 ${nodeTypeInfo.color}`}>
                    {node.type.charAt(0).toUpperCase() + node.type.slice(1)} Node
                  </div>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4 md:gap-8">
                <div>
                  <div className="text-xs text-gray-400">Registration Date</div>
                  <div className="text-sm">{formatDate(node.registeredDate)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Last Seen</div>
                  <div className="text-sm">{formatDate(node.lastSeen)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Earnings</div>
                  <div className="text-sm">{node.earnings.toFixed(2)} AeroNyx</div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 self-center transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor" style={{ transform: expandedNode === node.id ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            
            {/* Expanded details */}
            {expandedNode === node.id && (
              <div className="mt-6 pt-6 border-t border-background-200">
                {/* Node Type Description */}
                <div className="mb-6 p-3 bg-background-100 rounded-md">
                  <h4 className="font-bold mb-2">Node Type: {node.type.charAt(0).toUpperCase() + node.type.slice(1)}</h4>
                  <p className="text-sm text-gray-300">{getNodeTypeDescription(node.type)}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Resources */}
                  <div>
                    <h4 className="font-bold mb-3">Resource Usage</h4>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400">CPU ({node.resources.cpu.total})</span>
                          <span>{node.resources.cpu.usage}%</span>
                        </div>
                        <div className="w-full bg-background-200 rounded-full h-2">
                          <div 
                            className="bg-primary-400 rounded-full h-2" 
                            style={{ width: `${node.resources.cpu.usage}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400">Memory ({node.resources.memory.total})</span>
                          <span>{node.resources.memory.usage}%</span>
                        </div>
                        <div className="w-full bg-background-200 rounded-full h-2">
                          <div 
                            className="bg-secondary-400 rounded-full h-2" 
                            style={{ width: `${node.resources.memory.usage}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400">Storage ({node.resources.storage.total})</span>
                          <span>{node.resources.storage.usage}%</span>
                        </div>
                        <div className="w-full bg-background-200 rounded-full h-2">
                          <div 
                            className="bg-accent rounded-full h-2" 
                            style={{ width: `${node.resources.storage.usage}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400">Bandwidth ({node.resources.bandwidth.total})</span>
                          <span>{node.resources.bandwidth.usage}%</span>
                        </div>
                        <div className="w-full bg-background-200 rounded-full h-2">
                          <div 
                            className="bg-purple-500 rounded-full h-2" 
                            style={{ width: `${node.resources.bandwidth.usage}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Controls and Actions */}
                  <div>
                    <h4 className="font-bold mb-3">Node Controls</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <button 
                        className={`py-2 px-4 rounded-md flex items-center justify-center gap-2 ${node.status === 'online' ? 'bg-red-900/30 text-red-500 border border-red-800 hover:bg-red-900/50' : 'bg-green-900/30 text-green-500 border border-green-800 hover:bg-green-900/50'}`}
                        disabled={node.status === 'pending'}
                      >
                        {node.status === 'online' ? (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                            </svg>
                            Stop Node
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                            Start Node
                          </>
                        )}
                      </button>
                      
                      <button className="py-2 px-4 rounded-md bg-background-100 text-white border border-background-200 hover:bg-background-200 flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                        </svg>
                        Restart
                      </button>
                      
                      <button className="py-2 px-4 rounded-md bg-background-100 text-white border border-background-200 hover:bg-background-200 flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                        Edit
                      </button>
                      
                      <button className="py-2 px-4 rounded-md bg-background-100 text-white border border-background-200 hover:bg-background-200 flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2h2a1 1 0 000-2H9z" clipRule="evenodd" />
                        </svg>
                        Details
                      </button>
                    </div>
                    
                    {/* Blockchain section */}
                    <div className="mt-4 pt-4 border-t border-background-200">
                      <h4 className="font-bold mb-3 flex items-center gap-2">
                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-blue-400" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4 5C4 4.44772 4.44772 4 5 4H19C19.5523 4 20 4.44772 20 5V7C20 7.55228 19.5523 8 19 8H5C4.44772 8 4 7.55228 4 7V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M4 13C4 12.4477 4.44772 12 5 12H11C11.5523 12 12 12.4477 12 13V19C12 19.5523 11.5523 20 11 20H5C4.44772 20 4 19.5523 4 19V13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M16 13C16 12.4477 16.4477 12 17 12H19C19.5523 12 20 12.4477 20 13V19C20 19.5523 19.5523 20 19 20H17C16.4477 20 16 19.5523 16 19V13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Blockchain Integration
                      </h4>
                      
                      {hasBlockchainIntegrations ? (
                        <div>
                          {/* Show existing blockchain integrations */}
                          <div className="space-y-3 mb-4">
                            {node.blockchainIntegrations.map((integration, idx) => (
                              <div key={idx} className="p-3 rounded-lg bg-background-100 border border-background-200 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                  <img 
                                    src={`/images/${integration.blockchain}-logo.svg`} 
                                    alt={integration.blockchain} 
                                    className="h-6 w-6" 
                                  />
                                  <div>
                                    <div className="font-medium">{integration.blockchain.charAt(0).toUpperCase() + integration.blockchain.slice(1)}</div>
                                    <div className="text-xs text-gray-400 font-mono truncate" style={{maxWidth: '200px'}}>
                                      {integration.validatorKey}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-xs px-2 py-1 rounded-full bg-green-900/30 text-green-400 border border-green-800">
                                    {integration.status}
                                  </div>
                                  <div className="text-sm font-medium">${integration.estimatedRewards}/mo</div>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          <button 
                            className="py-2 px-4 rounded-md bg-blue-900/30 text-blue-400 border border-blue-800 hover:bg-blue-900/50 flex items-center justify-center gap-2 w-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              onBlockchainIntegrate(node);
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                            Add More Blockchain Integration
                          </button>
                        </div>
                      ) : (
                        <div>
                          {/* Show blockchain integration CTA */}
                          <div className="p-4 rounded-lg bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-800 mb-4">
                            <p className="text-sm text-gray-300 mb-2">
                              Supercharge your node with blockchain validation capabilities to earn additional rewards while supporting decentralized networks.
                            </p>
                            <div className="flex gap-2 items-center text-xs text-gray-400 mb-4">
                              <span className="flex items-center gap-1">
                                <svg viewBox="0 0 24 24" className="h-4 w-4 text-green-500" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Diversified revenue
                              </span>
                              <span className="flex items-center gap-1">
                                <svg viewBox="0 0 24 24" className="h-4 w-4 text-green-500" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Maximize resources
                              </span>
                              <span className="flex items-center gap-1">
                                <svg viewBox="0 0 24 24" className="h-4 w-4 text-green-500" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Network governance
                              </span>
                            </div>
                            <button 
                              className="py-2 px-4 rounded-md bg-blue-700 hover:bg-blue-600 text-white flex items-center justify-center gap-2 w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                onBlockchainIntegrate(node);
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                              </svg>
                              Integrate Blockchain
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-6">
                      <button className="py-2 px-4 rounded-md bg-red-900/20 text-red-500 border border-red-900/30 hover:bg-red-900/30 w-full flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Deregister Node
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
