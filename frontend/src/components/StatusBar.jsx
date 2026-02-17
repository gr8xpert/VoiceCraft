import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { getInitialData } from '../api';
import {
  Cpu,
  HardDrive,
  Zap,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

/**
 * Status bar component showing system info and backend status
 */
function StatusBar() {
  const {
    backendStatus,
    modelInfo,
    isGenerating,
    setInitialData,
    setModelInfo,
  } = useStore();

  const [systemInfo, setSystemInfo] = useState(null);

  // Poll for system info every 5 seconds
  useEffect(() => {
    if (backendStatus !== 'ready') return;

    const pollSystemInfo = async () => {
      try {
        const data = await getInitialData();
        if (data.model_info) {
          setModelInfo(data.model_info);
          setSystemInfo(data.model_info);
        }
      } catch (error) {
        console.error('Failed to poll system info:', error);
      }
    };

    // Initial fetch
    pollSystemInfo();

    // Set up polling interval
    const interval = setInterval(pollSystemInfo, 5000);

    return () => clearInterval(interval);
  }, [backendStatus]);

  const getStatusIcon = () => {
    if (isGenerating) {
      return <Loader2 className="w-4 h-4 animate-spin text-[var(--color-warning)]" />;
    }
    switch (backendStatus) {
      case 'ready':
        return <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />;
      case 'loading':
      case 'restarting':
        return <RefreshCw className="w-4 h-4 animate-spin text-[var(--color-warning)]" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-[var(--color-error)]" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    if (isGenerating) return 'Generating...';
    switch (backendStatus) {
      case 'ready':
        return 'Ready';
      case 'loading':
        return 'Loading...';
      case 'restarting':
        return 'Restarting...';
      case 'error':
        return 'Error';
      default:
        return backendStatus;
    }
  };

  const getDeviceDisplay = () => {
    if (!modelInfo) return 'Unknown';
    const device = modelInfo.device || 'auto';
    if (device === 'cuda') {
      return modelInfo.gpu_name || 'NVIDIA GPU';
    } else if (device === 'mps') {
      return 'Apple Silicon (MPS)';
    } else {
      return 'CPU';
    }
  };

  const getEngineType = () => {
    if (!modelInfo) return 'Unknown';
    return modelInfo.type || modelInfo.class_name || 'Chatterbox';
  };

  const getEngineColor = () => {
    const type = modelInfo?.type?.toLowerCase() || '';
    if (type.includes('turbo')) return 'text-[var(--color-success)]';
    if (type.includes('multilingual')) return 'text-blue-400';
    return 'text-[var(--color-accent)]';
  };

  return (
    <footer className="h-10 px-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center text-xs">
      {/* Left side - System info */}
      <div className="flex items-center gap-6 flex-1">
        {/* Device/GPU - Green when CUDA is active */}
        <div className={`flex items-center gap-2 ${modelInfo?.device === 'cuda' ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}>
          <Cpu className="w-4 h-4" />
          <span>{getDeviceDisplay()}</span>
        </div>

        {/* VRAM (only for CUDA) */}
        {modelInfo?.device === 'cuda' && modelInfo?.vram_used && (
          <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <HardDrive className="w-4 h-4" />
            <span>
              {(modelInfo.vram_used / 1024).toFixed(1)} / {(modelInfo.vram_total / 1024).toFixed(1)} GB
            </span>
          </div>
        )}

        {/* Engine Type */}
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${getEngineColor()}`} />
          <span className={getEngineColor()}>{getEngineType()}</span>
        </div>
      </div>

      {/* Center - Credits */}
      <div className="flex-1 text-center text-[var(--color-text-muted)]">
        Helpful? Keep me in your prayers - Regards Shahzaib Aslam
      </div>

      {/* Right side - Status */}
      <div className="flex items-center gap-2 flex-1 justify-end">
        {getStatusIcon()}
        <span
          className={`${
            backendStatus === 'ready' && !isGenerating
              ? 'text-[var(--color-success)]'
              : backendStatus === 'error'
              ? 'text-[var(--color-error)]'
              : 'text-[var(--color-warning)]'
          }`}
        >
          {getStatusText()}
        </span>
      </div>
    </footer>
  );
}

export default StatusBar;
