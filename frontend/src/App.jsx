import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import { initAPI, getInitialData } from './api';

// Layout components
import Layout from './components/Layout';
import ModelDownloadModal from './components/ModelDownloadModal';
import SetupWizard from './components/SetupWizard';

// Views
import GenerateView from './views/GenerateView';

import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

function App() {
  const {
    backendStatus,
    backendMessage,
    setBackendStatus,
    setInitialData,
    config,
    predefinedVoices,
    selectedVoice,
    setSelectedVoice,
  } = useStore();

  const [activeView, setActiveView] = useState('generate');
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [apiUrl, setApiUrl] = useState('http://127.0.0.1:8000');

  // Listen for backend status from Electron
  useEffect(() => {
    if (window.electronAPI) {
      const cleanup = window.electronAPI.onBackendStatus((status) => {
        console.log('[App] Backend status:', status);
        setBackendStatus(status.status, status.message, status.port);

        if (status.port) {
          setApiUrl(`http://127.0.0.1:${status.port}`);
        }

        if (status.status === 'ready') {
          loadInitialData();
        }
      });

      return cleanup;
    } else {
      // Running in browser without Electron
      loadInitialData();
    }
  }, []);

  // Listen for show-setup event from Electron (first-run)
  useEffect(() => {
    if (window.electronAPI?.onShowSetup) {
      const cleanup = window.electronAPI.onShowSetup((show) => {
        console.log('[App] Show setup wizard:', show);
        setShowSetupWizard(show);
      });
      return cleanup;
    }
  }, []);

  // Load initial data from backend
  async function loadInitialData() {
    try {
      await initAPI();
      const data = await getInitialData();
      console.log('[App] Initial data loaded:', data);
      setInitialData(data);
      setBackendStatus('ready', 'Connected');

      // Set default voice if available
      if (data.predefined_voices?.length > 0 && !selectedVoice) {
        setSelectedVoice(data.predefined_voices[0].filename);
      }

      // Check if model is loaded
      if (!data.model_info?.loaded) {
        setShowFirstRun(true);
      }
    } catch (error) {
      console.error('[App] Failed to load initial data:', error);
      setBackendStatus('error', error.message);
    }
  }

  // Keyboard shortcuts removed - single view app

  // First-time setup wizard (downloads Python, dependencies, models)
  if (showSetupWizard) {
    return (
      <SetupWizard
        onComplete={() => {
          setShowSetupWizard(false);
          // Backend will start after setup and send 'ready' status
        }}
      />
    );
  }

  // First-run model download screen (when backend is ready but model not loaded)
  if (showFirstRun) {
    return (
      <ModelDownloadModal
        apiUrl={apiUrl}
        onComplete={() => {
          setShowFirstRun(false);
          loadInitialData();
        }}
      />
    );
  }

  // Loading screen
  if (backendStatus === 'loading' || backendStatus === 'restarting') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-[var(--color-accent)] animate-spin" />
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            VoiceCraft
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            {backendMessage || 'Starting backend...'}
          </p>
        </div>
      </div>
    );
  }

  // Error screen
  if (backendStatus === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-[var(--color-error)]" />
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Connection Error
          </h1>
          <p className="text-[var(--color-text-secondary)]">{backendMessage}</p>
          <button onClick={loadInitialData} className="btn-primary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Render the generate view (single view app)
  const renderView = () => <GenerateView />;

  return (
    <Layout activeView={activeView} onViewChange={setActiveView}>
      {renderView()}
    </Layout>
  );
}

export default App;
