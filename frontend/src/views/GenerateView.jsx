import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { generateSpeech, uploadReferenceAudio, getInitialData, saveSettings } from '../api';
import AudioPlayer from '../components/AudioPlayer';
import {
  Volume2,
  Mic,
  Upload,
  Loader2,
  AlertCircle,
  Zap,
  Shuffle,
  StopCircle,
} from 'lucide-react';

// Engine options - Original and Multilingual only (GPU optimized)
const ENGINES = [
  { id: 'original', name: 'Original', description: 'Best English TTS', repo: 'chatterbox' },
  { id: 'multilingual', name: 'Multilingual', description: '23 languages', repo: 'chatterbox-multilingual' },
];

function GenerateView() {
  const {
    predefinedVoices,
    referenceFiles,
    modelInfo,
    text,
    setText,
    voiceMode,
    setVoiceMode,
    selectedVoice,
    setSelectedVoice,
    selectedReferenceAudio,
    setSelectedReferenceAudio,
    exaggeration,
    cfgWeight,
    temperature,
    speedFactor,
    seed,
    splitText,
    chunkSize,
    outputFormat,
    setGenerationParams,
    isGenerating,
    startGeneration,
    finishGeneration,
    failGeneration,
    currentAudioUrl,
    generationError,
    clearAudio,
    addReferenceFile,
    setInitialData,
  } = useStore();

  const [isUploading, setIsUploading] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [engineError, setEngineError] = useState(null);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const currentEngine = modelInfo?.type?.toLowerCase() || 'turbo';

  // Handle engine change - show error if model not available
  const handleEngineChange = async (engineId) => {
    if (isReloading) return;

    // Check if already on this engine
    if (currentEngine.includes(engineId)) return;

    setIsReloading(true);
    setEngineError(null);

    try {
      // Try to switch model by updating config
      const engine = ENGINES.find(e => e.id === engineId);
      await saveSettings({ model: { repo_id: engine.repo } });

      // Reload to get new model info
      const data = await getInitialData();
      setInitialData(data);

      // Check if model actually loaded
      if (!data.model_info?.loaded) {
        setEngineError(`${engine.name} model not downloaded. Please download it first or use Turbo.`);
      }
    } catch (error) {
      setEngineError(`Failed to switch to ${engineId}: ${error.message}`);
    } finally {
      setIsReloading(false);
    }
  };

  // Handle file upload for voice cloning
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const result = await uploadReferenceAudio(file);
      if (result.uploaded_files?.length > 0) {
        addReferenceFile(result.uploaded_files[0]);
        setSelectedReferenceAudio(result.uploaded_files[0]);
      }
    } catch (error) {
      // Parse the error for better messages
      let errorMsg = error.message;
      if (errorMsg.includes('duration')) {
        if (errorMsg.includes('exceeds')) {
          errorMsg = 'Audio too long. Maximum 30 seconds allowed.';
        } else if (errorMsg.includes('zero') || errorMsg.includes('negative')) {
          errorMsg = 'Invalid audio file. Could not read duration.';
        }
      } else if (errorMsg.includes('too short') || errorMsg.includes('minimum')) {
        errorMsg = 'Audio too short. Minimum 5 seconds required for voice cloning.';
      }
      setUploadError(errorMsg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle generate button click
  const handleGenerate = async () => {
    if (!text.trim()) return;

    if (voiceMode === 'predefined' && !selectedVoice) {
      failGeneration('Please select a voice');
      return;
    }

    if (voiceMode === 'clone' && !selectedReferenceAudio) {
      failGeneration('Please select or upload a reference audio file');
      return;
    }

    clearAudio();
    startGeneration();

    abortControllerRef.current = new AbortController();

    try {
      const audioUrl = await generateSpeech({
        text,
        voice_mode: voiceMode,
        predefined_voice_id: voiceMode === 'predefined' ? selectedVoice : undefined,
        reference_audio_filename: voiceMode === 'clone' ? selectedReferenceAudio : undefined,
        exaggeration,
        cfg_weight: cfgWeight,
        temperature,
        speed_factor: speedFactor,
        seed: seed,
        split_text: splitText,
        chunk_size: chunkSize,
        output_format: outputFormat,
      });

      finishGeneration(audioUrl);
    } catch (error) {
      if (error.name !== 'AbortError') {
        // Parse error for better messages
        let errorMsg = error.message;
        if (errorMsg.includes('reference audio')) {
          if (errorMsg.includes('duration') && errorMsg.includes('exceeds')) {
            errorMsg = 'Reference audio too long (max 30 seconds). Please use shorter audio.';
          } else if (errorMsg.includes('not found')) {
            errorMsg = 'Reference audio file not found. Please re-upload.';
          } else if (errorMsg.includes('minimum') || errorMsg.includes('too short')) {
            errorMsg = 'Reference audio too short. Minimum 5 seconds required.';
          }
        } else if (errorMsg.includes('chunk')) {
          errorMsg = 'Text processing failed. Try shorter text or different chunk size.';
        }
        failGeneration(errorMsg);
      }
    }
  };

  // Handle stop generation
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    finishGeneration(null);
  };

  // Generate random seed
  const generateRandomSeed = () => {
    setGenerationParams({ seed: Math.floor(Math.random() * 2147483647) });
  };

  return (
    <div className="h-full flex flex-col p-3 gap-3 overflow-hidden">
      {/* Top Row: Engine + Voice side by side */}
      <div className="flex gap-3">
        {/* Engine Selector - Compact */}
        <div className="card flex-1 !p-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-[var(--color-accent)]" />
            <span className="font-medium text-sm">TTS Engine</span>
            {isReloading && <Loader2 className="w-3 h-3 animate-spin text-[var(--color-accent)]" />}
          </div>
          <div className="flex gap-1">
            {ENGINES.map((engine) => (
              <button
                key={engine.id}
                onClick={() => handleEngineChange(engine.id)}
                disabled={isReloading}
                className={`flex-1 px-2 py-1.5 rounded text-xs transition-all ${
                  currentEngine.includes(engine.id)
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] text-[var(--color-text-secondary)]'
                }`}
              >
                {engine.name}
              </button>
            ))}
          </div>
          {engineError && (
            <p className="text-xs text-[var(--color-error)] mt-1">{engineError}</p>
          )}
        </div>

        {/* Voice Selection - Compact */}
        <div className="card flex-[2] !p-3">
          <div className="flex items-center gap-2 mb-2">
            <Mic className="w-4 h-4 text-[var(--color-accent)]" />
            <span className="font-medium text-sm">Voice</span>
            <div className="flex gap-1 ml-auto">
              <button
                className={`px-2 py-1 rounded text-xs ${
                  voiceMode === 'predefined'
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                }`}
                onClick={() => setVoiceMode('predefined')}
              >
                Predefined
              </button>
              <button
                className={`px-2 py-1 rounded text-xs ${
                  voiceMode === 'clone'
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                }`}
                onClick={() => setVoiceMode('clone')}
              >
                Clone
              </button>
            </div>
          </div>

          {voiceMode === 'predefined' ? (
            <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
              {predefinedVoices.map((voice) => (
                <button
                  key={voice.filename}
                  onClick={() => setSelectedVoice(voice.filename)}
                  className={`px-2 py-1 rounded text-xs ${
                    selectedVoice === voice.filename
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)]'
                  }`}
                >
                  {voice.display_name}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select
                className="select flex-1 !py-1 text-sm"
                value={selectedReferenceAudio || ''}
                onChange={(e) => setSelectedReferenceAudio(e.target.value)}
              >
                <option value="">Select reference...</option>
                {referenceFiles.map((file) => (
                  <option key={file} value={file}>{file}</option>
                ))}
              </select>
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="btn-secondary !py-1 !px-2 text-xs flex items-center gap-1"
              >
                {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Upload
              </button>
            </div>
          )}
          {uploadError && (
            <p className="text-xs text-[var(--color-error)] mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{uploadError}
            </p>
          )}
        </div>
      </div>

      {/* Middle: Text + Settings side by side */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Text Input */}
        <div className="card flex-[2] !p-3 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-sm">Text</span>
            <span className="text-xs text-[var(--color-text-muted)]">{text.length} chars</span>
          </div>
          <textarea
            className="input flex-1 resize-none text-sm font-mono"
            placeholder="Enter text to convert to speech...

Line breaks add natural pauses between sentences."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        {/* Settings - Compact Grid */}
        <div className="card flex-1 !p-3 flex flex-col">
          <span className="font-medium text-sm mb-2">Settings</span>
          <div className="grid grid-cols-2 gap-2 text-xs flex-1">
            {/* Exaggeration */}
            <div>
              <label className="text-[var(--color-text-muted)]">Exaggeration</label>
              <input
                type="range" min="0" max="1" step="0.01"
                value={exaggeration}
                onChange={(e) => setGenerationParams({ exaggeration: parseFloat(e.target.value) })}
                className="w-full"
              />
              <span className="text-[var(--color-text-secondary)]">{exaggeration.toFixed(2)}</span>
            </div>

            {/* CFG */}
            <div>
              <label className="text-[var(--color-text-muted)]">CFG/Pace</label>
              <input
                type="range" min="0" max="1" step="0.01"
                value={cfgWeight}
                onChange={(e) => setGenerationParams({ cfgWeight: parseFloat(e.target.value) })}
                className="w-full"
              />
              <span className="text-[var(--color-text-secondary)]">{cfgWeight.toFixed(2)}</span>
            </div>

            {/* Temperature */}
            <div>
              <label className="text-[var(--color-text-muted)]">Temperature</label>
              <input
                type="range" min="0.1" max="2" step="0.01"
                value={temperature}
                onChange={(e) => setGenerationParams({ temperature: parseFloat(e.target.value) })}
                className="w-full"
              />
              <span className="text-[var(--color-text-secondary)]">{temperature.toFixed(2)}</span>
            </div>

            {/* Speed */}
            <div>
              <label className="text-[var(--color-text-muted)]">Speed</label>
              <input
                type="range" min="0.5" max="2" step="0.01"
                value={speedFactor}
                onChange={(e) => setGenerationParams({ speedFactor: parseFloat(e.target.value) })}
                className="w-full"
              />
              <span className="text-[var(--color-text-secondary)]">{speedFactor.toFixed(1)}x</span>
            </div>

            {/* Seed */}
            <div>
              <label className="text-[var(--color-text-muted)]">Seed</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  className="input !py-0.5 !px-1 flex-1 text-xs"
                  placeholder="0=random"
                  value={seed}
                  onChange={(e) => setGenerationParams({ seed: parseInt(e.target.value) || 0 })}
                />
                <button onClick={generateRandomSeed} className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded">
                  <Shuffle className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Format */}
            <div>
              <label className="text-[var(--color-text-muted)]">Format</label>
              <select
                className="select !py-0.5 text-xs"
                value={outputFormat}
                onChange={(e) => setGenerationParams({ outputFormat: e.target.value })}
              >
                <option value="wav">WAV</option>
                <option value="mp3">MP3</option>
                <option value="opus">Opus</option>
              </select>
            </div>

            {/* Chunking */}
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={splitText}
                onChange={(e) => setGenerationParams({ splitText: e.target.checked })}
                className="w-3 h-3"
              />
              <span className="text-[var(--color-text-muted)]">Split text</span>
              {splitText && (
                <input
                  type="number"
                  className="input !py-0.5 !px-1 w-14 text-xs"
                  value={chunkSize}
                  onChange={(e) => setGenerationParams({ chunkSize: parseInt(e.target.value) || 250 })}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Generate Button + Audio Player */}
      <div className="flex gap-3 items-center">
        <button
          className="btn-primary flex-1 py-2 flex items-center justify-center gap-2"
          onClick={isGenerating ? handleStop : handleGenerate}
          disabled={!text.trim()}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
              <StopCircle className="w-4 h-4" />
            </>
          ) : (
            <>
              <Volume2 className="w-5 h-5" />
              Generate Speech
            </>
          )}
        </button>
      </div>

      {/* Error Message */}
      {generationError && (
        <div className="p-2 bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[var(--color-error)] flex-shrink-0" />
          <p className="text-sm text-[var(--color-error)]">{generationError}</p>
        </div>
      )}

      {/* Audio Player */}
      {currentAudioUrl && <AudioPlayer audioUrl={currentAudioUrl} />}
    </div>
  );
}

export default GenerateView;
