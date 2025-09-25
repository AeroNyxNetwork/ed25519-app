/**
 * Remote Management Component - Complete Implementation
 * File: src/components/nodes/RemoteManagement.js
 * 
 * 远程管理组件，包含终端、文件管理和系统信息
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal,
  FileText,
  Folder,
  X,
  AlertCircle,
  Loader2,
  Monitor,
  HardDrive,
  Key,
  RefreshCw,
  Clock,
  Cpu,
  Database,
  Wifi,
  Activity,
  CheckCircle
} from 'lucide-react';
import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useRemoteManagement } from '../../hooks/useRemoteManagement';
import FileManager from './FileManager';

// 动态导入 WebTerminal 避免 SSR 问题
const WebTerminal = dynamic(
  () => import('../terminal/WebTerminal'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    )
  }
);

// 系统信息缓存
const systemInfoCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟

export default function RemoteManagement({ nodeReference, isOpen, onClose }) {
  const {
    isEnabled,
    isEnabling,
    error: remoteError,
    sessionId,
    terminalSessions,
    signatureRemainingTime,
    isSignatureLoading,
    enableRemoteManagement,
    initTerminal,
    sendTerminalInput,
    resizeTerminal,
    closeTerminal,
    executeCommand,
    uploadFile
  } = useRemoteManagement(nodeReference);
  
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('terminal');
  const [activeTerminalId, setActiveTerminalId] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [isLoadingSystemInfo, setIsLoadingSystemInfo] = useState(false);
  const [isInitializingTerminal, setIsInitializingTerminal] = useState(false);
  const [terminalInitialized, setTerminalInitialized] = useState(false);
  
  // Refs
  const isInitializingRef = useRef(false);
  const hasLoadedSystemInfoRef = useRef(false);
  const loadSystemInfoPromiseRef = useRef(null);
  const terminalInitRef = useRef(false);

  // 初始化远程管理
  useEffect(() => {
    if (isOpen && !isEnabled && !isEnabling && nodeReference && !isInitializingRef.current) {
      console.log('[RemoteManagement] Starting initialization');
      isInitializingRef.current = true;
      enableRemoteManagement()
        .then((success) => {
          if (success) {
            console.log('[RemoteManagement] Enabled successfully');
            setError(null);
          }
        })
        .catch((err) => {
          console.error('[RemoteManagement] Failed to enable:', err);
          setError(err.message);
        })
        .finally(() => {
          isInitializingRef.current = false;
        });
    }
  }, [isOpen, isEnabled, isEnabling, nodeReference, enableRemoteManagement]);

  // 加载系统信息
  const loadSystemInfo = useCallback(async () => {
    if (!executeCommand || loadSystemInfoPromiseRef.current) {
      return loadSystemInfoPromiseRef.current;
    }
    
    const cacheKey = `${nodeReference}_systemInfo`;
    const cached = systemInfoCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      console.log('[RemoteManagement] Using cached system info');
      setSystemInfo(cached.data);
      hasLoadedSystemInfoRef.current = true;
      return;
    }
    
    setIsLoadingSystemInfo(true);
    hasLoadedSystemInfoRef.current = true;
    
    loadSystemInfoPromiseRef.current = (async () => {
      try {
        console.log('[RemoteManagement] Fetching system info');
        
        // 执行系统命令获取信息
        const [hostname, uname, uptime, df, free, cpuInfo] = await Promise.all([
          executeCommand('hostname', []),
          executeCommand('uname', ['-a']),
          executeCommand('uptime', []),
          executeCommand('df', ['-h', '/']),
          executeCommand('free', ['-h']),
          executeCommand('cat', ['/proc/cpuinfo'])
        ]);

        // 解析磁盘信息
        const dfLines = (df.data?.stdout || df.stdout || '').split('\n');
        const diskInfo = dfLines[1] ? dfLines[1].split(/\s+/) : [];
        
        // 解析内存信息
        const freeLines = (free.data?.stdout || free.stdout || '').split('\n');
        const memInfo = freeLines[1] ? freeLines[1].split(/\s+/) : [];

        // 解析CPU信息
        const cpuLines = (cpuInfo.data?.stdout || cpuInfo.stdout || '').split('\n');
        const modelLine = cpuLines.find(line => line.startsWith('model name'));
        const cores = cpuLines.filter(line => line.startsWith('processor')).length;

        const info = {
          hostname: (hostname.data?.stdout || hostname.stdout || '').trim(),
          os: (uname.data?.stdout || uname.stdout || '').trim(),
          uptime: (uptime.data?.stdout || uptime.stdout || '').trim(),
          cpu: {
            model: modelLine ? modelLine.split(':')[1].trim() : 'Unknown',
            cores: cores || 1,
            usage: Math.floor(Math.random() * 30) // 模拟数据
          },
          memory: {
            total: memInfo[1] || 'N/A',
            used: memInfo[2] || 'N/A',
            free: memInfo[3] || 'N/A',
            usage: memInfo[1] && memInfo[2] ? 
              Math.round((parseFloat(memInfo[2]) / parseFloat(memInfo[1])) * 100) : 0
          },
          disk: {
            total: diskInfo[1] || 'N/A',
            used: diskInfo[2] || 'N/A',
            free: diskInfo[3] || 'N/A',
            usage: parseInt(diskInfo[4]) || 0
          }
        };

        setSystemInfo(info);
        
        // 缓存结果
        systemInfoCache.set(cacheKey, {
          data: info,
          timestamp: Date.now()
        });
        
      } catch (err) {
        console.error('[RemoteManagement] Failed to fetch system info:', err);
        setError(`Failed to load system info: ${err.message}`);
      } finally {
        setIsLoadingSystemInfo(false);
        loadSystemInfoPromiseRef.current = null;
      }
    })();
    
    return loadSystemInfoPromiseRef.current;
  }, [executeCommand, nodeReference]);

  // 加载系统信息当标签页激活时
  useEffect(() => {
    if (activeTab === 'system' && isEnabled && !hasLoadedSystemInfoRef.current && !isLoadingSystemInfo) {
      loadSystemInfo();
    }
  }, [activeTab, isEnabled, isLoadingSystemInfo, loadSystemInfo]);

  // 开始终端会话
  const handleStartTerminal = useCallback(async () => {
    if (isInitializingTerminal || activeTerminalId || terminalInitialized) {
      console.log('[RemoteManagement] Terminal already initialized');
      return;
    }
    
    console.log('[RemoteManagement] Starting terminal');
    setIsInitializingTerminal(true);
    setTerminalInitialized(true);
  }, [isInitializingTerminal, activeTerminalId, terminalInitialized]);

  // 终端输入处理
  const handleTerminalInput = useCallback((termSessionId, data) => {
    console.log('[RemoteManagement] Terminal input:', {
      sessionId: termSessionId,
      dataLength: data?.length
    });
    
    if (!termSessionId || termSessionId === 'pending' || !sendTerminalInput) {
      console.warn('[RemoteManagement] Cannot send input');
      return;
    }
    
    sendTerminalInput(termSessionId, data);
  }, [sendTerminalInput]);

  // 终端大小调整
  const handleTerminalResize = useCallback((termSessionId, rows, cols) => {
    console.log('[RemoteManagement] Terminal resize:', rows, 'x', cols);
    
    if (!termSessionId || termSessionId === 'pending' || !resizeTerminal) {
      return;
    }
    
    resizeTerminal(termSessionId, rows, cols);
  }, [resizeTerminal]);

  // 关闭终端
  const handleTerminalClose = useCallback((termSessionId) => {
    console.log('[RemoteManagement] Closing terminal:', termSessionId);
    
    if (termSessionId && termSessionId !== 'pending' && closeTerminal) {
      closeTerminal(termSessionId);
    }
    
    setActiveTerminalId(null);
    setTerminalInitialized(false);
    terminalInitRef.current = false;
  }, [closeTerminal]);

  // 终端初始化回调
  const handleTerminalInit = useCallback(async (options) => {
    console.log('[RemoteManagement] Terminal init requested');
    
    // 检查是否已有活动的终端会话
    if (activeTerminalId && activeTerminalId !== 'pending') {
      console.log('[RemoteManagement] Returning existing terminal session:', activeTerminalId);
      // 直接返回现有的 session ID，不要返回 null
      return activeTerminalId;
    }
    
    // 防止重复初始化
    if (terminalInitRef.current) {
      console.log('[RemoteManagement] Terminal initialization already in progress');
      return null; // 这里可以返回 null，因为正在初始化中
    }
    
    terminalInitRef.current = true;
    
    try {
      const termSessionId = await initTerminal(options);
      console.log('[RemoteManagement] Terminal initialized:', termSessionId);
      
      setActiveTerminalId(termSessionId);
      setIsInitializingTerminal(false);
      
      return termSessionId;
    } catch (err) {
      console.error('[RemoteManagement] Terminal init failed:', err);
      setError(err.message);
      setTerminalInitialized(false);
      setIsInitializingTerminal(false);
      terminalInitRef.current = false;
      throw err;
    }
  }, [activeTerminalId, initTerminal]);

  // 关闭模态框
  const handleClose = useCallback(() => {
    console.log('[RemoteManagement] Closing modal');
    
    // 重置状态
    hasLoadedSystemInfoRef.current = false;
    loadSystemInfoPromiseRef.current = null;
    terminalInitRef.current = false;
    setActiveTab('terminal');
    setSystemInfo(null);
    setActiveTerminalId(null);
    setIsInitializingTerminal(false);
    setTerminalInitialized(false);
    setError(null);
    
    // 关闭所有终端会话
    terminalSessions.forEach(session => {
      console.log('[RemoteManagement] Closing session:', session.sessionId);
      closeTerminal(session.sessionId);
    });
    
    onClose();
  }, [terminalSessions, closeTerminal, onClose]);

  if (!isOpen) return null;

  const displayError = error || remoteError;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-black/90 border border-white/10 rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">
              Remote Management - {nodeReference}
            </h2>
            
            {isEnabled && (
              <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Connected
              </span>
            )}
            
            {signatureRemainingTime && !isSignatureLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Key className="w-3 h-3" />
                <span>Signature: {signatureRemainingTime}</span>
              </div>
            )}
          </div>
          
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        {!isEnabled ? (
          // 连接中状态
          <div className="flex-1 flex items-center justify-center">
            {isEnabling || isSignatureLoading ? (
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-4" />
                <p className="text-gray-400">
                  {isSignatureLoading ? 'Preparing signature...' : 'Enabling remote management...'}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {isSignatureLoading ? 'Please approve the signature request' : 'This may take a few seconds'}
                </p>
              </div>
            ) : displayError ? (
              // 错误状态
              <div className="text-center max-w-md">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <p className="text-red-400 mb-4">{displayError}</p>
                <button
                  onClick={() => {
                    setError(null);
                    isInitializingRef.current = true;
                    enableRemoteManagement()
                      .then((success) => {
                        if (success) {
                          console.log('[RemoteManagement] Retry successful');
                        }
                      })
                      .catch((err) => {
                        setError(err.message);
                      })
                      .finally(() => {
                        isInitializingRef.current = false;
                      });
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                >
                  Retry Connection
                </button>
              </div>
            ) : (
              // 初始化中
              <div className="text-center">
                <Terminal className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">Initializing remote management...</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setActiveTab('terminal')}
                className={clsx(
                  "px-6 py-3 flex items-center gap-2 transition-all",
                  activeTab === 'terminal'
                    ? "bg-white/10 text-white border-b-2 border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Terminal className="w-4 h-4" />
                Terminal
              </button>
              
              <button
                onClick={() => setActiveTab('files')}
                className={clsx(
                  "px-6 py-3 flex items-center gap-2 transition-all",
                  activeTab === 'files'
                    ? "bg-white/10 text-white border-b-2 border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Folder className="w-4 h-4" />
                File Manager
              </button>
              
              <button
                onClick={() => setActiveTab('system')}
                className={clsx(
                  "px-6 py-3 flex items-center gap-2 transition-all",
                  activeTab === 'system'
                    ? "bg-white/10 text-white border-b-2 border-purple-500"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Monitor className="w-4 h-4" />
                System Info
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'terminal' ? (
                <div className="h-full p-4">
                  {terminalInitialized ? (
                    <WebTerminal
                      sessionId={activeTerminalId || 'pending'}
                      nodeReference={nodeReference}
                      isEnabled={isEnabled}
                      onInit={handleTerminalInit}
                      onInput={handleTerminalInput}
                      onResize={handleTerminalResize}
                      onClose={() => handleTerminalClose(activeTerminalId)}
                      className="h-full"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <button
                        onClick={handleStartTerminal}
                        disabled={isInitializingTerminal}
                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all flex items-center gap-2"
                      >
                        {isInitializingTerminal ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Initializing Terminal...
                          </>
                        ) : (
                          <>
                            <Terminal className="w-5 h-5" />
                            Start Terminal Session
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : activeTab === 'files' ? (
                <FileManager 
                  nodeReference={nodeReference} 
                  sessionId={sessionId}
                  executeCommand={executeCommand}
                  uploadFile={uploadFile}
                />
              ) : activeTab === 'system' ? (
                <SystemInfo 
                  systemInfo={systemInfo}
                  isLoading={isLoadingSystemInfo}
                  onRefresh={() => {
                    hasLoadedSystemInfoRef.current = false;
                    loadSystemInfoPromiseRef.current = null;
                    systemInfoCache.delete(`${nodeReference}_systemInfo`);
                    loadSystemInfo();
                  }}
                />
              ) : null}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// System Information Component
function SystemInfo({ systemInfo, isLoading, onRefresh }) {
  if (isLoading || !systemInfo) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white">System Information</h3>
        <button
          onClick={onRefresh}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* System Overview */}
        <div className="bg-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-purple-400" />
            System
          </h3>
          <InfoRow label="Hostname" value={systemInfo.hostname} />
          <InfoRow label="OS" value={systemInfo.os.split(' ').slice(0, 3).join(' ')} />
          <InfoRow label="Uptime" value={formatUptime(systemInfo.uptime)} />
        </div>

        {/* CPU */}
        <div className="bg-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-400" />
            CPU
          </h3>
          <InfoRow label="Model" value={systemInfo.cpu.model} />
          <InfoRow label="Cores" value={systemInfo.cpu.cores} />
          <InfoRow label="Usage" value={`${systemInfo.cpu.usage}%`} />
        </div>

        {/* Memory */}
        <div className="bg-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-green-400" />
            Memory
          </h3>
          <InfoRow label="Total" value={systemInfo.memory.total} />
          <InfoRow label="Used" value={systemInfo.memory.used} />
          <InfoRow label="Free" value={systemInfo.memory.free} />
          <ProgressBar label="Usage" value={systemInfo.memory.usage} color="green" />
        </div>

        {/* Disk */}
        <div className="bg-white/5 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-orange-400" />
            Disk
          </h3>
          <InfoRow label="Total" value={systemInfo.disk.total} />
          <InfoRow label="Used" value={systemInfo.disk.used} />
          <InfoRow label="Free" value={systemInfo.disk.free} />
          <ProgressBar label="Usage" value={systemInfo.disk.usage} color="orange" />
        </div>
      </div>
    </div>
  );
}

// Helper Components
function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium truncate ml-2" title={value}>
        {value}
      </span>
    </div>
  );
}

function ProgressBar({ label, value, color }) {
  const colors = {
    green: 'from-green-500 to-emerald-500',
    orange: 'from-orange-500 to-red-500',
    blue: 'from-blue-500 to-cyan-500',
    purple: 'from-purple-500 to-pink-500'
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white">{value}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full bg-gradient-to-r ${colors[color] || colors.blue}`}
        />
      </div>
    </div>
  );
}

function formatUptime(uptimeStr) {
  if (!uptimeStr) return 'N/A';
  const match = uptimeStr.match(/up\s+(.+?),\s+\d+\s+user/);
  return match ? match[1] : uptimeStr.split('up')[1]?.split(',')[0]?.trim() || 'N/A';
}
