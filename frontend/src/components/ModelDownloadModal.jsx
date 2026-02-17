import React, { useState, useEffect } from 'react';
import {
  Download,
  CheckCircle,
  AlertCircle,
  Cpu,
  HardDrive,
  Loader2,
  Volume2,
} from 'lucide-react';

/**
 * First-run experience modal for model download
 */
function ModelDownloadModal({ apiUrl, onComplete }) {
  const [systemCheck, setSystemCheck] = useState({
    gpu: { status: 'checking', name: '', vram: '' },
    backend: { status: 'checking' },
    models: { status: 'checking', downloaded: false },
  });

  const [selectedModels, setSelectedModels] = useState(['original']);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState('');
  const [error, setError] = useState(null);

  const models = [
    {
      id: 'original',
      name: 'Original',
      description: 'Best quality English TTS (0.5B params)',
      size: '~1.5 GB',
      recommended: true,
    },
    {
      id: 'multilingual',
      name: 'Multilingual',
      description: '23 languages supported (0.5B params)',
      size: '~1.5 GB',
    },
  ];

  // Run system checks
  useEffect(() => {
    const runChecks = async () => {
      // Check backend
      try {
        const res = await fetch(`${apiUrl}/api/ui/initial-data`);
        if (res.ok) {
          const data = await res.json();

          setSystemCheck((prev) => ({
            ...prev,
            backend: { status: 'ok' },
            gpu: {
              status: 'ok',
              name: data.model_info?.gpu_name || data.model_info?.device || 'CPU',
              vram: data.model_info?.vram_total
                ? `${(data.model_info.vram_total / 1024).toFixed(1)} GB`
                : '',
            },
            models: {
              status: data.model_info?.loaded ? 'ok' : 'missing',
              downloaded: data.model_info?.loaded || false,
            },
          }));

          // If models are already downloaded, auto-complete
          if (data.model_info?.loaded) {
            setTimeout(() => onComplete(), 1500);
          }
        } else {
          throw new Error('Backend not responding');
        }
      } catch (err) {
        setSystemCheck((prev) => ({
          ...prev,
          backend: { status: 'error' },
        }));
        setError('Cannot connect to backend. Please check if the server is running.');
      }
    };

    runChecks();
  }, [apiUrl]);

  const toggleModel = (modelId) => {
    setSelectedModels((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId]
    );
  };

  const handleDownload = async () => {
    if (selectedModels.length === 0) return;

    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);
    setDownloadMessage('Connecting to HuggingFace Hub...');

    try {
      // Start progress animation
      let progress = 0;
      const progressInterval = setInterval(() => {
        if (progress < 90) {
          progress += 2;
          setDownloadProgress(progress);
          if (progress < 20) {
            setDownloadMessage('Connecting to HuggingFace Hub...');
          } else if (progress < 50) {
            setDownloadMessage('Downloading model files (~1.5 GB)...');
          } else if (progress < 80) {
            setDownloadMessage('Loading model into GPU memory...');
          } else {
            setDownloadMessage('Initializing TTS engine...');
          }
        }
      }, 1000);

      // Trigger model reload which will download if needed
      const res = await fetch(`${apiUrl}/restart_server`, {
        method: 'POST',
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorDetail = errorData.detail || 'Unknown error';

        // Provide helpful error messages
        if (errorDetail.includes('network') || errorDetail.includes('connection')) {
          throw new Error('Network error: Please check your internet connection and try again.');
        } else if (errorDetail.includes('space') || errorDetail.includes('disk')) {
          throw new Error('Disk space error: Please free up at least 5GB of disk space.');
        } else if (errorDetail.includes('CUDA') || errorDetail.includes('GPU')) {
          throw new Error('GPU error: ' + errorDetail);
        } else {
          throw new Error('Download failed: ' + errorDetail);
        }
      }

      setDownloadProgress(100);
      setDownloadMessage('Model loaded successfully!');
      await new Promise((r) => setTimeout(r, 1000));

      onComplete();
    } catch (err) {
      let errorMessage = err.message;

      // Add helpful suggestions based on error type
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        errorMessage = 'Network error: Cannot connect to backend server. Please restart the app.';
      } else if (err.message.includes('timeout')) {
        errorMessage = 'Download timed out. Please check your internet connection and try again.';
      }

      setError(errorMessage);
      setIsDownloading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
      case 'missing':
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case 'checking':
      default:
        return <Loader2 className="w-5 h-5 text-[var(--color-accent)] animate-spin" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--color-bg-primary)] flex items-center justify-center z-50">
      <div className="max-w-lg w-full mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <Volume2 className="w-16 h-16 mx-auto text-[var(--color-accent)] mb-4" />
          <h1 className="text-3xl font-bold">Welcome to VoiceCraft</h1>
          <p className="text-[var(--color-text-muted)] mt-2">
            AI-powered text-to-speech with voice cloning
          </p>
        </div>

        {/* System Check */}
        <div className="card mb-6">
          <h2 className="font-semibold mb-4">System Check</h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-[var(--color-text-muted)]" />
                <span>GPU</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--color-text-muted)]">
                  {systemCheck.gpu.name}
                  {systemCheck.gpu.vram && ` (${systemCheck.gpu.vram})`}
                </span>
                {getStatusIcon(systemCheck.gpu.status)}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-[var(--color-text-muted)]" />
                <span>Backend Server</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--color-text-muted)]">
                  {systemCheck.backend.status === 'ok' ? 'Running' : 'Checking...'}
                </span>
                {getStatusIcon(systemCheck.backend.status)}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Download className="w-5 h-5 text-[var(--color-text-muted)]" />
                <span>TTS Models</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--color-text-muted)]">
                  {systemCheck.models.downloaded ? 'Ready' : 'Not downloaded'}
                </span>
                {getStatusIcon(systemCheck.models.status)}
              </div>
            </div>
          </div>
        </div>

        {/* Model Selection (only if models not downloaded) */}
        {!systemCheck.models.downloaded && systemCheck.backend.status === 'ok' && (
          <div className="card mb-6">
            <h2 className="font-semibold mb-4">Select Models to Download</h2>

            <div className="space-y-2">
              {models.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedModels.includes(model.id)
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                      : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(model.id)}
                    onChange={() => toggleModel(model.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{model.name}</span>
                      {model.recommended && (
                        <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-500 rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {model.description}
                    </p>
                  </div>
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {model.size}
                  </span>
                </label>
              ))}
            </div>

            <p className="text-xs text-[var(--color-text-muted)] mt-3">
              Models will be downloaded from HuggingFace Hub
            </p>
          </div>
        )}

        {/* Download Progress */}
        {isDownloading && (
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">{downloadMessage}</span>
              <span className="text-sm text-[var(--color-text-muted)]">
                {downloadProgress}%
              </span>
            </div>
            <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-accent)] transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 mb-6 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500">
            {error}
          </div>
        )}

        {/* Action Button */}
        {!systemCheck.models.downloaded && systemCheck.backend.status === 'ok' && (
          <button
            onClick={handleDownload}
            disabled={isDownloading || selectedModels.length === 0}
            className="btn-primary w-full text-lg py-4 flex items-center justify-center gap-2"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Download Selected Models
              </>
            )}
          </button>
        )}

        {/* Auto-continue message */}
        {systemCheck.models.downloaded && (
          <div className="text-center text-[var(--color-text-muted)]">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading VoiceCraft...
          </div>
        )}
      </div>
    </div>
  );
}

export default ModelDownloadModal;
