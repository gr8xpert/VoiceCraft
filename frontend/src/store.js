import { create } from 'zustand';

/**
 * Global application state store using Zustand
 */
export const useStore = create((set, get) => ({
  // Backend status
  backendStatus: 'loading', // 'loading' | 'ready' | 'error' | 'restarting'
  backendMessage: 'Initializing...',
  backendPort: null,

  // Initial data from backend
  config: null,
  predefinedVoices: [],
  referenceFiles: [],
  presets: [],
  modelInfo: null,

  // Current generation state
  isGenerating: false,
  generationProgress: null,
  currentAudioUrl: null,
  generationError: null,

  // Text input
  text: '',

  // Voice settings
  voiceMode: 'predefined', // 'predefined' | 'clone'
  selectedVoice: null,
  selectedReferenceAudio: null,

  // Generation parameters
  exaggeration: 0.5,
  cfgWeight: 0.5,
  temperature: 0.8,
  speedFactor: 1.0,
  seed: 0,
  splitText: true,
  chunkSize: 250,
  outputFormat: 'wav',
  language: 'en',

  // Actions
  setBackendStatus: (status, message = '', port = null) =>
    set({
      backendStatus: status,
      backendMessage: message,
      backendPort: port ?? get().backendPort,
    }),

  setInitialData: (data) =>
    set({
      config: data.config,
      predefinedVoices: data.predefined_voices || [],
      referenceFiles: data.reference_files || [],
      presets: data.presets || [],
      modelInfo: data.model_info,
      // Set defaults from config
      exaggeration: data.config?.generation_defaults?.exaggeration ?? 0.5,
      cfgWeight: data.config?.generation_defaults?.cfg_weight ?? 0.5,
      temperature: data.config?.generation_defaults?.temperature ?? 0.8,
      speedFactor: data.config?.generation_defaults?.speed_factor ?? 1.0,
      seed: data.config?.generation_defaults?.seed ?? 0,
      language: data.config?.generation_defaults?.language ?? 'en',
      chunkSize: data.config?.ui_state?.last_chunk_size ?? 250,
      splitText: data.config?.ui_state?.last_split_text_enabled ?? true,
      outputFormat: data.config?.audio_output?.format ?? 'wav',
      // Set last used voice if available
      voiceMode: data.config?.ui_state?.last_voice_mode ?? 'predefined',
      text: data.config?.ui_state?.last_text ?? '',
    }),

  setModelInfo: (info) => set({ modelInfo: info }),

  setText: (text) => set({ text }),

  setVoiceMode: (mode) => set({ voiceMode: mode }),

  setSelectedVoice: (voice) => set({ selectedVoice: voice }),

  setSelectedReferenceAudio: (file) => set({ selectedReferenceAudio: file }),

  setGenerationParams: (params) => set(params),

  startGeneration: () =>
    set({
      isGenerating: true,
      generationError: null,
      generationProgress: 0,
    }),

  finishGeneration: (audioUrl) =>
    set({
      isGenerating: false,
      currentAudioUrl: audioUrl,
      generationProgress: null,
    }),

  failGeneration: (error) =>
    set({
      isGenerating: false,
      generationError: error,
      generationProgress: null,
    }),

  clearAudio: () => {
    const currentUrl = get().currentAudioUrl;
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }
    set({ currentAudioUrl: null });
  },

  addReferenceFile: (filename) =>
    set((state) => ({
      referenceFiles: [...state.referenceFiles, filename],
    })),

  // Reset generation state
  resetGeneration: () =>
    set({
      isGenerating: false,
      generationProgress: null,
      generationError: null,
    }),
}));
