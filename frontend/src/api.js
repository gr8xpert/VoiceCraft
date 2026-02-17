// API client for VoiceCraft backend

let BACKEND_URL = 'http://127.0.0.1:8000';
let initialized = false;

/**
 * Initialize the API with the correct backend URL
 * In Electron, gets port from IPC; in browser, uses default
 */
export async function initAPI() {
  if (initialized) return BACKEND_URL;

  if (window.electronAPI) {
    try {
      const port = await window.electronAPI.getBackendPort();
      if (port) {
        BACKEND_URL = `http://127.0.0.1:${port}`;
        console.log(`[API] Backend URL set to: ${BACKEND_URL}`);
      }
    } catch (error) {
      console.error('[API] Failed to get backend port:', error);
    }
  }

  initialized = true;
  return BACKEND_URL;
}

/**
 * Get the current backend URL
 */
export function getBackendURL() {
  return BACKEND_URL;
}

/**
 * Fetch initial data needed for the UI
 * Returns config, voices, presets, and model info
 */
export async function getInitialData() {
  await initAPI();
  const res = await fetch(`${BACKEND_URL}/api/ui/initial-data`);
  if (!res.ok) {
    throw new Error(`Failed to fetch initial data: ${res.status}`);
  }
  return res.json();
}

/**
 * Get model information
 */
export async function getModelInfo() {
  await initAPI();
  const res = await fetch(`${BACKEND_URL}/api/model-info`);
  if (!res.ok) {
    throw new Error(`Failed to fetch model info: ${res.status}`);
  }
  return res.json();
}

/**
 * Generate speech from text
 * @param {Object} params - Generation parameters
 * @param {string} params.text - Text to synthesize
 * @param {string} params.voice_mode - 'predefined' or 'clone'
 * @param {string} [params.predefined_voice_id] - Voice file name for predefined mode
 * @param {string} [params.reference_audio_filename] - Reference audio for clone mode
 * @param {number} [params.exaggeration] - Exaggeration level (0-1)
 * @param {number} [params.cfg_weight] - CFG/Pace weight (0-1)
 * @param {number} [params.temperature] - Temperature (0.1-2.0)
 * @param {number} [params.speed_factor] - Speed factor (0.5-2.0)
 * @param {number} [params.seed] - Random seed (-1 for random)
 * @param {boolean} [params.split_text] - Whether to split text into chunks
 * @param {number} [params.chunk_size] - Chunk size for text splitting
 * @param {string} [params.output_format] - Output format (wav, mp3, opus)
 * @param {string} [params.language] - Language code for multilingual model
 * @returns {Promise<string>} - Object URL for the generated audio blob
 */
export async function generateSpeech(params) {
  await initAPI();

  const res = await fetch(`${BACKEND_URL}/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: params.text,
      voice_mode: params.voice_mode || 'predefined',
      predefined_voice_id: params.predefined_voice_id,
      reference_audio_filename: params.reference_audio_filename,
      exaggeration: params.exaggeration,
      cfg_weight: params.cfg_weight,
      temperature: params.temperature,
      speed_factor: params.speed_factor,
      seed: params.seed,
      split_text: params.split_text ?? true,
      chunk_size: params.chunk_size ?? 250,
      output_format: params.output_format || 'wav',
      language: params.language || 'en',
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(errorData.detail || `Generation failed: ${res.status}`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Reload/switch the TTS model (hot-swap)
 */
export async function reloadModel() {
  await initAPI();
  const res = await fetch(`${BACKEND_URL}/restart_server`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(errorData.detail || `Model reload failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Save settings to config.yaml
 * @param {Object} settings - Partial settings object to merge
 */
export async function saveSettings(settings) {
  await initAPI();
  const res = await fetch(`${BACKEND_URL}/save_settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(errorData.detail || `Save settings failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Reset settings to defaults
 */
export async function resetSettings() {
  await initAPI();
  const res = await fetch(`${BACKEND_URL}/reset_settings`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(errorData.detail || `Reset settings failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Upload a reference audio file for voice cloning
 * @param {File} file - Audio file to upload
 */
export async function uploadReferenceAudio(file) {
  await initAPI();
  const formData = new FormData();
  formData.append('files', file);

  const res = await fetch(`${BACKEND_URL}/upload_reference`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(errorData.detail || `Upload failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Get list of reference audio files
 */
export async function getReferenceAudioList() {
  await initAPI();
  const res = await fetch(`${BACKEND_URL}/get_reference_files`);
  if (!res.ok) {
    throw new Error(`Failed to fetch reference files: ${res.status}`);
  }
  return res.json();
}

/**
 * Get list of predefined voices
 */
export async function getPredefinedVoices() {
  await initAPI();
  const res = await fetch(`${BACKEND_URL}/get_predefined_voices`);
  if (!res.ok) {
    throw new Error(`Failed to fetch predefined voices: ${res.status}`);
  }
  return res.json();
}
