import React, { useState, useEffect } from 'react';
import {
  Download,
  CheckCircle,
  AlertCircle,
  Cpu,
  HardDrive,
  Loader2,
  Volume2,
  ChevronRight,
  ChevronLeft,
  Settings,
  Globe,
  XCircle,
} from 'lucide-react';

/**
 * First-run setup wizard for downloading and configuring VoiceCraft
 * Requires NVIDIA GPU for installation
 */
function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [systemInfo, setSystemInfo] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const [selectedModel, setSelectedModel] = useState('original');
  const [installProgress, setInstallProgress] = useState({ stage: '', percent: 0, message: '' });
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);

  // Only Original and Multilingual - removed Turbo
  const models = [
    {
      id: 'original',
      name: 'Original',
      description: 'Best quality English TTS, most natural sounding',
      size: '~1.5 GB',
      icon: Volume2,
      recommended: true,
      color: 'text-[var(--color-accent)]',
    },
    {
      id: 'multilingual',
      name: 'Multilingual',
      description: 'Supports 23 languages including Spanish, French, German, Chinese',
      size: '~1.5 GB',
      icon: Globe,
      color: 'text-blue-500',
    },
  ];

  // Check system on mount
  useEffect(() => {
    checkSystem();
  }, []);

  // Listen for setup progress from Electron
  useEffect(() => {
    if (window.electronAPI?.onSetupProgress) {
      const cleanup = window.electronAPI.onSetupProgress((progress) => {
        setInstallProgress(progress);
        if (progress.log) {
          setLogs(prev => [...prev.slice(-50), progress.log]);
        }
        if (progress.stage === 'complete') {
          // Start the backend after setup completes
          setTimeout(async () => {
            try {
              if (window.electronAPI?.setupComplete) {
                await window.electronAPI.setupComplete();
              }
              onComplete();
            } catch (err) {
              console.error('Failed to start backend after setup:', err);
              onComplete();
            }
          }, 1500);
        }
        if (progress.stage === 'error') {
          setError(progress.message);
          setIsInstalling(false);
        }
      });
      return cleanup;
    }
  }, [onComplete]);

  async function checkSystem() {
    setIsChecking(true);
    try {
      if (window.electronAPI?.checkSystem) {
        const info = await window.electronAPI.checkSystem();
        setSystemInfo(info);
      } else {
        // Fallback for browser testing
        setSystemInfo({
          platform: 'win32',
          hasPython: false,
          pythonVersion: null,
          hasNvidiaGpu: true,
          gpuName: 'NVIDIA GPU',
          hasEnoughSpace: true,
          availableSpace: '50 GB',
        });
      }
    } catch (err) {
      setError('Failed to check system: ' + err.message);
    } finally {
      setIsChecking(false);
    }
  }

  async function startInstallation() {
    setIsInstalling(true);
    setError(null);
    setLogs([]);

    try {
      if (window.electronAPI?.startSetup) {
        await window.electronAPI.startSetup({
          model: selectedModel,
          useGpu: true, // Always use GPU
        });
      } else {
        // Simulate for browser testing
        for (let i = 0; i <= 100; i += 5) {
          await new Promise(r => setTimeout(r, 200));
          setInstallProgress({
            stage: i < 30 ? 'python' : i < 60 ? 'dependencies' : i < 90 ? 'model' : 'complete',
            percent: i,
            message: i < 30 ? 'Setting up Python...' : i < 60 ? 'Installing dependencies...' : i < 90 ? 'Downloading model...' : 'Complete!',
          });
        }
        setTimeout(() => onComplete(), 1500);
      }
    } catch (err) {
      setError(err.message);
      setIsInstalling(false);
    }
  }

  // Step 1: Welcome & System Check
  const renderStep1 = () => (
    <div className="text-center">
      <Volume2 className="w-20 h-20 mx-auto text-[var(--color-accent)] mb-6" />
      <h1 className="text-3xl font-bold mb-2">Welcome to VoiceCraft</h1>
      <p className="text-[var(--color-text-muted)] mb-8">
        AI-powered text-to-speech with voice cloning
      </p>

      <div className="card text-left mb-6">
        <h2 className="font-semibold mb-4">System Requirements</h2>

        {isChecking ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
          </div>
        ) : systemInfo ? (
          <div className="space-y-3">
            {/* GPU - Required */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-[var(--color-text-muted)]" />
                <span>NVIDIA GPU</span>
                <span className="text-xs text-red-400">(4GB+ VRAM)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--color-text-muted)]">
                  {systemInfo.hasNvidiaGpu
                    ? `${systemInfo.gpuName} (${systemInfo.gpuVram || '?'}GB)`
                    : 'Not detected'}
                </span>
                {systemInfo.hasNvidiaGpu && systemInfo.hasEnoughVram ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-[var(--color-text-muted)]" />
                <span>Python</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--color-text-muted)]">
                  {systemInfo.hasPython ? `v${systemInfo.pythonVersion}` : 'Will be installed'}
                </span>
                {systemInfo.hasPython ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <Download className="w-5 h-5 text-blue-500" />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-[var(--color-text-muted)]" />
                <span>Disk Space</span>
                <span className="text-xs text-[var(--color-text-muted)]">(~5GB needed)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--color-text-muted)]">
                  {systemInfo.availableSpace} available
                </span>
                {systemInfo.hasEnoughSpace ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* GPU Required Error */}
        {!systemInfo?.hasNvidiaGpu && !isChecking && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-500">NVIDIA GPU Required</p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  VoiceCraft requires an NVIDIA graphics card with at least 4GB VRAM for fast AI voice generation.
                </p>
                <p className="text-sm text-[var(--color-text-muted)] mt-2">
                  Supported: GTX 1650+, RTX series (4GB+ VRAM)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Not Enough VRAM Error */}
        {systemInfo?.hasNvidiaGpu && !systemInfo?.hasEnoughVram && !isChecking && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-500">Insufficient GPU Memory</p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Your GPU ({systemInfo.gpuName}) has only {systemInfo.gpuVram}GB VRAM.
                  VoiceCraft requires at least 4GB VRAM for reasonable performance.
                </p>
                <p className="text-sm text-[var(--color-text-muted)] mt-2">
                  Recommended: GTX 1650+ or RTX series with 4GB+ VRAM
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Space Error */}
        {!systemInfo?.hasEnoughSpace && systemInfo?.hasNvidiaGpu && !isChecking && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-500">
            Not enough disk space. Please free up at least 5GB and try again.
          </div>
        )}
      </div>

      <button
        onClick={() => setStep(2)}
        disabled={isChecking || !systemInfo?.hasNvidiaGpu || !systemInfo?.hasEnoughVram || !systemInfo?.hasEnoughSpace}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {(!systemInfo?.hasNvidiaGpu || !systemInfo?.hasEnoughVram) && !isChecking ? 'GPU 4GB+ Required' : 'Continue'}
        {((systemInfo?.hasNvidiaGpu && systemInfo?.hasEnoughVram) || isChecking) && <ChevronRight className="w-5 h-5" />}
      </button>
    </div>
  );

  // Step 2: Model Selection
  const renderStep2 = () => (
    <div>
      <button
        onClick={() => setStep(1)}
        className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] mb-6"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <h1 className="text-2xl font-bold mb-2">Choose Your TTS Model</h1>
      <p className="text-[var(--color-text-muted)] mb-6">
        Select the model that best fits your needs.
      </p>

      <div className="space-y-3 mb-6">
        {models.map((model) => {
          const Icon = model.icon;
          return (
            <button
              key={model.id}
              onClick={() => setSelectedModel(model.id)}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                selectedModel === model.id
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                  : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/50'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg bg-[var(--color-bg-tertiary)] ${model.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{model.name}</span>
                    {model.recommended && (
                      <span className="text-xs px-2 py-0.5 bg-[var(--color-accent)]/20 text-[var(--color-accent)] rounded-full">
                        Recommended
                      </span>
                    )}
                    <span className="text-sm text-[var(--color-text-muted)] ml-auto">
                      {model.size}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    {model.description}
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedModel === model.id
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
                    : 'border-[var(--color-border)]'
                }`}>
                  {selectedModel === model.id && (
                    <CheckCircle className="w-4 h-4 text-white" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setStep(3)}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        Continue
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );

  // Step 3: Installation
  const renderStep3 = () => (
    <div>
      {!isInstalling && (
        <button
          onClick={() => setStep(2)}
          className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
      )}

      <h1 className="text-2xl font-bold mb-2">
        {isInstalling ? 'Installing VoiceCraft' : 'Ready to Install'}
      </h1>
      <p className="text-[var(--color-text-muted)] mb-6">
        {isInstalling
          ? 'Please wait while we set everything up...'
          : 'Click install to download and configure VoiceCraft.'}
      </p>

      {/* Summary */}
      {!isInstalling && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-3">Installation Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Model</span>
              <span>{models.find(m => m.id === selectedModel)?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">GPU</span>
              <span>{systemInfo?.gpuName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Estimated Download</span>
              <span>~{systemInfo?.hasPython ? '' : '100 MB + '}{models.find(m => m.id === selectedModel)?.size}</span>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {isInstalling && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{installProgress.message || 'Starting...'}</span>
            <span className="text-sm text-[var(--color-text-muted)]">{installProgress.percent}%</span>
          </div>
          <div className="h-3 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-[var(--color-accent)] transition-all duration-300"
              style={{ width: `${installProgress.percent}%` }}
            />
          </div>

          {/* Stage indicators */}
          <div className="flex justify-between text-xs">
            {['python', 'dependencies', 'model', 'complete'].map((stage, i) => (
              <div
                key={stage}
                className={`flex items-center gap-1 ${
                  installProgress.stage === stage
                    ? 'text-[var(--color-accent)]'
                    : ['python', 'dependencies', 'model', 'complete'].indexOf(installProgress.stage) > i
                    ? 'text-green-500'
                    : 'text-[var(--color-text-muted)]'
                }`}
              >
                {['python', 'dependencies', 'model', 'complete'].indexOf(installProgress.stage) > i ? (
                  <CheckCircle className="w-4 h-4" />
                ) : installProgress.stage === stage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-current" />
                )}
                <span className="capitalize">{stage === 'complete' ? 'Done' : stage}</span>
              </div>
            ))}
          </div>

          {/* Logs */}
          {logs.length > 0 && (
            <div className="mt-4 p-2 bg-[var(--color-bg-tertiary)] rounded-lg max-h-32 overflow-y-auto">
              <pre className="text-xs text-[var(--color-text-muted)] font-mono">
                {logs.slice(-10).join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 mb-6 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500">
          <p className="font-medium">Installation Failed</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {!isInstalling && (
        <button
          onClick={startInstallation}
          className="btn-primary w-full flex items-center justify-center gap-2 text-lg py-4"
        >
          <Download className="w-5 h-5" />
          Install VoiceCraft
        </button>
      )}

      {installProgress.stage === 'complete' && (
        <div className="text-center">
          <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-semibold">Installation Complete!</h2>
          <p className="text-[var(--color-text-muted)]">Starting VoiceCraft...</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-[var(--color-bg-primary)] flex items-center justify-center p-4 overflow-auto">
      <div className="max-w-lg w-full">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  );
}

export default SetupWizard;
