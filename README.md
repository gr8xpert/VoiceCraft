# VoiceCraft - AI Text-to-Speech Desktop App

A powerful desktop application for AI-powered text-to-speech with voice cloning capabilities. Built with Electron, React, and Python (Chatterbox TTS).

## Features

- **High-Quality TTS**: Natural-sounding voice synthesis using Chatterbox TTS models
- **Voice Cloning**: Clone any voice with just a 5-30 second audio sample
- **28 Predefined Voices**: Ready-to-use voice presets
- **GPU Accelerated**: NVIDIA CUDA support for fast generation (fp16 optimized)
- **One-Click Installer**: ~93MB installer, automatic setup downloads ~7GB of pre-built packages from CDN
- **Resume-Capable Downloads**: Setup downloads can resume if interrupted — no need to start over
- **Compact UI**: Clean, modern interface with orange/dark theme

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows 10 64-bit | Windows 11 |
| GPU | NVIDIA GPU with **4GB+ VRAM** | RTX 3060+ (6GB+ VRAM) |
| RAM | 8GB | 16GB |
| Storage | 10GB free space | 15GB free space |
| GPU Driver | CUDA 12.1+ | Latest NVIDIA Driver |

### Supported GPUs
- GTX 1650+ (4GB)
- RTX 2060+ (6GB+)
- RTX 3060+ (6GB+)
- RTX 4060+ (8GB+)

### NOT Supported
- MX series (MX150, MX250, MX330, MX450) - insufficient VRAM
- GTX 1050 and below - insufficient VRAM
- AMD GPUs - CUDA required
- Intel GPUs - CUDA required

## Installation

### From Installer (Recommended)

1. Download `VoiceCraft Setup 1.0.0.exe` from [Releases](https://github.com/gr8xpert/VoiceCraft/releases)
2. Run the installer
3. The setup wizard will automatically:
   - Check system requirements (GPU, VRAM, disk space)
   - Download Python runtime (~22 MB)
   - Download PyTorch + CUDA 12.1 (~2.9 GB)
   - Download Python packages (~313 MB)
   - Download TTS model (~4 GB)
4. All downloads come from a single CDN with resume support — if your connection drops, setup picks up where it left off
5. Launch VoiceCraft and start generating!

> **Note**: First-run setup downloads ~7 GB total. Ensure a stable internet connection. The setup wizard shows real-time progress for each stage.

### From Source (Developers)

#### Prerequisites

- Node.js 18+
- Python 3.10+
- NVIDIA GPU with CUDA support (4GB+ VRAM)
- Git

#### Setup

```bash
# Clone the repository
git clone https://github.com/gr8xpert/VoiceCraft.git
cd VoiceCraft

# Install Node.js dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..

# Install Electron dependencies
cd electron
npm install
cd ..

# Create Python virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install Python dependencies (GPU version)
pip install -r requirements-nvidia.txt
```

#### Development

```bash
# Run in development mode (frontend + Electron concurrently)
npm run dev
```

#### Build Installer

```bash
# Build frontend
cd frontend
npm run build

# Build Electron installer
cd electron
npx electron-builder --win
```

The installer will be created at `dist-electron/VoiceCraft Setup 1.0.0.exe`

## Project Structure

```
VoiceCraft/
├── electron/              # Electron main process
│   ├── main.js           # Main entry point
│   ├── preload.js        # Preload script for IPC
│   ├── setup.js          # First-run setup (R2 CDN downloads)
│   └── package.json      # Electron config & build settings
├── frontend/             # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   │   ├── Layout.jsx
│   │   │   ├── StatusBar.jsx
│   │   │   ├── SetupWizard.jsx
│   │   │   ├── AudioPlayer.jsx
│   │   │   └── ModelDownloadModal.jsx
│   │   ├── views/
│   │   │   └── GenerateView.jsx
│   │   ├── App.jsx       # Main app component
│   │   ├── store.js      # Zustand state management
│   │   ├── api.js        # Backend API client
│   │   └── index.css     # Tailwind CSS styles
│   ├── index.html
│   └── package.json
├── server.py             # FastAPI backend server
├── engine.py             # TTS engine wrapper (fp16 optimized)
├── config.py             # Configuration management
├── utils.py              # Utility functions
├── models.py             # Pydantic models
├── requirements.txt      # Python dependencies (CPU)
├── requirements-nvidia.txt # Python dependencies (GPU)
└── voices/               # Predefined voice samples (28 voices)
```

## Configuration

Configuration is stored in `config.yaml` (created on first run):

```yaml
server:
  host: "0.0.0.0"
  port: 8004

model:
  repo_id: "chatterbox"

tts_engine:
  device: "cuda"  # auto, cuda, cpu

generation_defaults:
  temperature: 0.8
  exaggeration: 0.5
  cfg_weight: 0.5
  speed_factor: 1.0

audio_output:
  format: "wav"
  sample_rate: 24000
```

## Usage

### Basic Text-to-Speech

1. Select a voice from predefined voices or clone your own
2. Type or paste text in the text area
3. Adjust settings (optional):
   - **Exaggeration**: Controls expressiveness (0-1)
   - **CFG/Pace**: Controls adherence to voice style (0-1)
   - **Temperature**: Controls randomness (0.1-2.0)
   - **Speed**: Playback speed (0.5x-2x)
4. Click "Generate Speech"
5. Play or download the generated audio

### Voice Cloning

1. Click "Clone Voice"
2. Upload a WAV/MP3 file (5-30 seconds, clear audio)
3. Generate speech using the cloned voice

### Tips for Best Results

- Use 10-20 second reference audio for voice cloning
- Clear audio without background noise works best
- For long texts, enable "Split text" option (default chunk: 250 chars)
- Use seed value for reproducible results
- Line breaks in text add natural pauses

## Performance

VoiceCraft uses half precision (fp16) for 2x faster inference on NVIDIA GPUs.

Expected generation times (RTX 3060):
- Short text (<100 chars): ~2-3 seconds
- Medium text (100-500 chars): ~5-10 seconds
- Long text (500+ chars): ~15-30 seconds

## API Reference

The backend exposes a REST API at `http://localhost:PORT`:

### Generate Speech
```http
POST /tts
Content-Type: application/json

{
  "text": "Hello, world!",
  "voice_mode": "predefined",
  "predefined_voice_id": "Emily.wav",
  "temperature": 0.8,
  "exaggeration": 0.5,
  "cfg_weight": 0.5,
  "speed_factor": 1.0,
  "split_text": true,
  "chunk_size": 250,
  "output_format": "wav"
}
```

### Upload Reference Audio (Voice Cloning)
```http
POST /upload_reference
Content-Type: multipart/form-data

files: <audio file>
```

### Get Model Info
```http
GET /api/model-info
```

### Get Initial Data
```http
GET /api/ui/initial-data
```

## Troubleshooting

### "GPU not detected"
- Ensure NVIDIA drivers are installed
- Run `nvidia-smi` in terminal to verify GPU is working
- Update to latest NVIDIA drivers

### "Insufficient GPU Memory" (4GB+ required)
- Your GPU has less than 4GB VRAM
- VoiceCraft requires GTX 1650+ or RTX series
- MX series GPUs are not supported

### Setup download stuck or failed
- Setup supports automatic resume — restart the app and it will continue from where it left off
- Ensure stable internet connection (~7 GB total download)
- Check disk space (need ~10 GB free)

### "Generation takes too long"
- Ensure CUDA is being used (check green "NVIDIA GPU" in status bar)
- Reduce text length or increase chunk size
- Close other GPU-intensive applications
- Check GPU utilization in Task Manager

### "Model failed to load"
- Delete `%APPDATA%\voicecraft` folder and restart to trigger fresh setup
- Check disk space (need ~10 GB free)

### "Reference audio too short/long"
- Voice cloning requires 5-30 seconds of audio
- Use clear audio without background noise
- WAV or MP3 format supported

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Zustand
- **Desktop**: Electron 34
- **Backend**: Python 3.10, FastAPI, Uvicorn
- **TTS Engine**: Chatterbox TTS (PyTorch, fp16)
- **CDN**: Cloudflare R2 (setup downloads)
- **Build**: electron-builder (NSIS)

## License

This project is for educational purposes. The Chatterbox TTS model has its own license terms from [Resemble AI](https://github.com/resemble-ai/chatterbox).

## Credits

- [Chatterbox TTS](https://github.com/resemble-ai/chatterbox) - TTS Engine by Resemble AI
- [Electron](https://www.electronjs.org/) - Desktop Framework
- [React](https://react.dev/) - UI Framework
- [FastAPI](https://fastapi.tiangolo.com/) - Backend Framework
- [Tailwind CSS](https://tailwindcss.com/) - CSS Framework

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Author

Created by [@gr8xpert](https://github.com/gr8xpert)

---

**Note**: This application requires an NVIDIA GPU with at least 4GB VRAM for reasonable performance.
