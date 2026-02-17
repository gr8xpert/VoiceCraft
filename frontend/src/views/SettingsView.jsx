import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { saveSettings, resetSettings } from '../api';
import {
  Settings,
  Sliders,
  Volume2,
  Cpu,
  Folder,
  Palette,
  Trash2,
  RotateCcw,
  Save,
  Loader2,
  ExternalLink,
  Info,
  Check,
} from 'lucide-react';

function SettingsView() {
  const { config, setInitialData, backendPort } = useStore();

  const [settings, setSettings] = useState({
    // General
    theme: 'dark',

    // Audio defaults
    defaultFormat: 'wav',
    defaultSampleRate: 24000,
    autoNormalize: false,
    normalizeLufs: -16,
    autoTrimSilence: false,
    trimThreshold: -40,
    fadeInMs: 0,
    fadeOutMs: 0,

    // Generation defaults
    defaultExaggeration: 0.5,
    defaultCfgWeight: 0.5,
    defaultTemperature: 0.8,
    defaultSpeedFactor: 1.0,
    defaultChunkSize: 120,
    defaultSeed: 0,

    // Advanced
    silenceGapMs: 500,
    saveToDisk: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load settings from config
  useEffect(() => {
    if (config) {
      setSettings({
        theme: config.ui_state?.theme || 'dark',
        defaultFormat: config.audio_output?.format || 'wav',
        defaultSampleRate: config.audio_output?.sample_rate || 24000,
        autoNormalize: false,
        normalizeLufs: -16,
        autoTrimSilence: false,
        trimThreshold: -40,
        fadeInMs: 0,
        fadeOutMs: 0,
        defaultExaggeration: config.generation_defaults?.exaggeration ?? 0.5,
        defaultCfgWeight: config.generation_defaults?.cfg_weight ?? 0.5,
        defaultTemperature: config.generation_defaults?.temperature ?? 0.8,
        defaultSpeedFactor: config.generation_defaults?.speed_factor ?? 1.0,
        defaultChunkSize: config.ui_state?.last_chunk_size ?? 120,
        defaultSeed: config.generation_defaults?.seed ?? 0,
        silenceGapMs: 500,
        saveToDisk: config.audio_output?.save_to_disk ?? false,
      });
    }
  }, [config]);

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await saveSettings({
        ui_state: {
          theme: settings.theme,
          last_chunk_size: settings.defaultChunkSize,
        },
        audio_output: {
          format: settings.defaultFormat,
          sample_rate: settings.defaultSampleRate,
          save_to_disk: settings.saveToDisk,
        },
        generation_defaults: {
          exaggeration: settings.defaultExaggeration,
          cfg_weight: settings.defaultCfgWeight,
          temperature: settings.defaultTemperature,
          speed_factor: settings.defaultSpeedFactor,
          seed: settings.defaultSeed,
        },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;

    try {
      await resetSettings();
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  };

  const handleOpenExternal = (url) => {
    if (window.electronAPI) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <Settings className="w-7 h-7 text-[var(--color-accent)]" />
            Settings
          </h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Configure app behavior and defaults
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary flex items-center gap-2"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saveSuccess ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* General Settings */}
        <section className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Palette className="w-5 h-5 text-[var(--color-accent)]" />
            General
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                Theme
              </label>
              <div className="flex gap-2">
                {['dark', 'light'].map((theme) => (
                  <button
                    key={theme}
                    onClick={() => updateSetting('theme', theme)}
                    className={`px-4 py-2 rounded-lg capitalize ${
                      settings.theme === theme
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Light theme coming soon
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-[var(--color-text-primary)]">
                  Auto-save generations to history
                </label>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Automatically save all generated audio to history
                </p>
              </div>
              <input
                type="checkbox"
                checked={true}
                disabled
                className="w-5 h-5"
              />
            </div>
          </div>
        </section>

        {/* Audio Output Settings */}
        <section className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-[var(--color-accent)]" />
            Audio Output
          </h2>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                Default Format
              </label>
              <select
                className="select"
                value={settings.defaultFormat}
                onChange={(e) => updateSetting('defaultFormat', e.target.value)}
              >
                <option value="wav">WAV (best quality)</option>
                <option value="mp3">MP3 (compressed)</option>
                <option value="opus">Opus (smallest)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                Sample Rate
              </label>
              <select
                className="select"
                value={settings.defaultSampleRate}
                onChange={(e) => updateSetting('defaultSampleRate', parseInt(e.target.value))}
              >
                <option value={22050}>22050 Hz</option>
                <option value={24000}>24000 Hz (default)</option>
                <option value={44100}>44100 Hz</option>
                <option value={48000}>48000 Hz</option>
              </select>
            </div>

            <div className="col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm text-[var(--color-text-primary)]">
                    Save to disk
                  </label>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Also save generated audio to outputs folder
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.saveToDisk}
                  onChange={(e) => updateSetting('saveToDisk', e.target.checked)}
                  className="w-5 h-5"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Generation Defaults */}
        <section className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[var(--color-accent)]" />
            Generation Defaults
          </h2>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                Exaggeration: {settings.defaultExaggeration.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.defaultExaggeration}
                onChange={(e) => updateSetting('defaultExaggeration', parseFloat(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                CFG/Pace: {settings.defaultCfgWeight.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.defaultCfgWeight}
                onChange={(e) => updateSetting('defaultCfgWeight', parseFloat(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                Temperature: {settings.defaultTemperature.toFixed(2)}
              </label>
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.01"
                value={settings.defaultTemperature}
                onChange={(e) => updateSetting('defaultTemperature', parseFloat(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                Speed Factor: {settings.defaultSpeedFactor.toFixed(2)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.01"
                value={settings.defaultSpeedFactor}
                onChange={(e) => updateSetting('defaultSpeedFactor', parseFloat(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                Default Chunk Size
              </label>
              <input
                type="number"
                className="input"
                min="50"
                max="500"
                value={settings.defaultChunkSize}
                onChange={(e) => updateSetting('defaultChunkSize', parseInt(e.target.value) || 120)}
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                Default Seed
              </label>
              <input
                type="number"
                className="input"
                value={settings.defaultSeed}
                onChange={(e) => updateSetting('defaultSeed', parseInt(e.target.value) || 0)}
                placeholder="0 = random"
              />
            </div>
          </div>
        </section>

        {/* Advanced */}
        <section className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[var(--color-accent)]" />
            Advanced
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                Backend Port
              </label>
              <input
                type="text"
                className="input w-32"
                value={backendPort || 'Auto'}
                disabled
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Automatically assigned by Electron
              </p>
            </div>

            <div className="pt-4 border-t border-[var(--color-border)]">
              <button
                onClick={handleReset}
                className="btn-secondary flex items-center gap-2 text-red-500 hover:border-red-500/50"
              >
                <RotateCcw className="w-4 h-4" />
                Reset All Settings to Defaults
              </button>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-[var(--color-accent)]" />
            About
          </h2>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">App Version</span>
              <span>1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)]">Engine</span>
              <span>Chatterbox TTS</span>
            </div>

            <div className="pt-4 border-t border-[var(--color-border)] flex gap-4">
              <button
                onClick={() => handleOpenExternal('https://github.com/gr8xpert/Chatterbox-TTS-Server')}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                GitHub
              </button>
              <button
                onClick={() => handleOpenExternal('https://github.com/gr8xpert/Chatterbox-TTS-Server/issues')}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Report Issue
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default SettingsView;
