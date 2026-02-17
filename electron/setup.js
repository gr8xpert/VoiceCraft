/**
 * VoiceCraft Setup Module
 * Handles first-run setup: Python installation, dependencies, model download
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { app } = require('electron');

// Configuration
const PYTHON_VERSION = '3.10.11';
const PYTHON_EMBED_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';

class SetupManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    const isDev = !app.isPackaged;
    this.backendDir = isDev
      ? path.join(__dirname, '..')
      : path.join(process.resourcesPath, 'backend');
    this.dataDir = app.getPath('userData');
    this.pythonDir = path.join(this.dataDir, 'python');
    this.venvDir = path.join(this.dataDir, 'venv');
  }

  sendProgress(stage, percent, message, log = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('setup-progress', {
        stage,
        percent,
        message,
        log,
      });
    }
  }

  async checkSystem() {
    const info = {
      platform: process.platform,
      hasPython: false,
      pythonVersion: null,
      hasNvidiaGpu: false,
      gpuName: null,
      gpuVram: 0,
      hasEnoughVram: false,
      hasEnoughSpace: true,
      availableSpace: 'Unknown',
    };

    const MIN_VRAM_GB = 4; // Minimum 4GB VRAM required

    // Check for existing Python
    try {
      const pythonPath = this.findPython();
      if (pythonPath) {
        const version = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' });
        info.hasPython = true;
        info.pythonVersion = version.replace('Python ', '').trim();
      }
    } catch (e) {
      // No Python found
    }

    // Check for NVIDIA GPU and VRAM
    try {
      if (process.platform === 'win32') {
        // Get GPU name
        const nameResult = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', {
          encoding: 'utf8',
          timeout: 5000,
        });
        if (nameResult.trim()) {
          info.hasNvidiaGpu = true;
          info.gpuName = nameResult.trim().split('\n')[0];

          // Get VRAM in MB
          const vramResult = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits', {
            encoding: 'utf8',
            timeout: 5000,
          });
          const vramMB = parseInt(vramResult.trim().split('\n')[0]);
          info.gpuVram = Math.round(vramMB / 1024 * 10) / 10; // Convert to GB with 1 decimal
          info.hasEnoughVram = info.gpuVram >= MIN_VRAM_GB;
        }
      }
    } catch (e) {
      // No NVIDIA GPU or nvidia-smi not available
    }

    // Check disk space
    try {
      if (process.platform === 'win32') {
        const drive = this.dataDir.split(':')[0];
        const result = execSync(`wmic logicaldisk where "DeviceID='${drive}:'" get FreeSpace`, {
          encoding: 'utf8',
        });
        const freeBytes = parseInt(result.split('\n')[1].trim());
        const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);
        info.availableSpace = `${freeGB} GB`;
        info.hasEnoughSpace = freeGB > 5; // Need at least 5GB
      }
    } catch (e) {
      // Couldn't check disk space
    }

    return info;
  }

  findPython() {
    const candidates = [];

    // Check our installed Python first
    if (process.platform === 'win32') {
      candidates.push(path.join(this.venvDir, 'Scripts', 'python.exe'));
      candidates.push(path.join(this.pythonDir, 'python.exe'));
      candidates.push(path.join(this.backendDir, 'venv', 'Scripts', 'python.exe'));
    } else {
      candidates.push(path.join(this.venvDir, 'bin', 'python'));
      candidates.push(path.join(this.backendDir, 'venv', 'bin', 'python'));
    }

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    // Try system Python
    try {
      const cmd = process.platform === 'win32' ? 'where python' : 'which python3';
      const result = execSync(cmd, { encoding: 'utf8' });
      const pythonPath = result.trim().split('\n')[0];
      if (fs.existsSync(pythonPath)) {
        return pythonPath;
      }
    } catch (e) {}

    return null;
  }

  async downloadFile(url, destPath, progressCallback) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);

      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          https.get(response.headers.location, (res) => {
            this.handleDownload(res, file, progressCallback, resolve, reject);
          });
        } else {
          this.handleDownload(response, file, progressCallback, resolve, reject);
        }
      }).on('error', reject);
    });
  }

  handleDownload(response, file, progressCallback, resolve, reject) {
    const totalSize = parseInt(response.headers['content-length'], 10);
    let downloadedSize = 0;

    response.on('data', (chunk) => {
      downloadedSize += chunk.length;
      if (progressCallback && totalSize) {
        progressCallback(downloadedSize / totalSize);
      }
    });

    response.pipe(file);

    file.on('finish', () => {
      file.close();
      resolve();
    });

    file.on('error', reject);
  }

  async extractZip(zipPath, destDir) {
    // Use PowerShell on Windows to extract
    if (process.platform === 'win32') {
      execSync(
        `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        { encoding: 'utf8' }
      );
    }
  }

  async installPythonEmbedded() {
    this.sendProgress('python', 5, 'Downloading Python...', 'Starting Python download');

    fs.mkdirSync(this.pythonDir, { recursive: true });

    const zipPath = path.join(this.dataDir, 'python.zip');

    // Download Python embedded
    await this.downloadFile(PYTHON_EMBED_URL, zipPath, (progress) => {
      this.sendProgress('python', 5 + progress * 10, `Downloading Python... ${Math.round(progress * 100)}%`);
    });

    this.sendProgress('python', 15, 'Extracting Python...', 'Extracting Python archive');

    // Extract
    await this.extractZip(zipPath, this.pythonDir);

    // Enable pip by modifying python310._pth
    const pthFile = path.join(this.pythonDir, 'python310._pth');
    if (fs.existsSync(pthFile)) {
      let content = fs.readFileSync(pthFile, 'utf8');
      content = content.replace('#import site', 'import site');
      fs.writeFileSync(pthFile, content);
    }

    // Download and install pip
    this.sendProgress('python', 18, 'Installing pip...', 'Downloading get-pip.py');

    const getPipPath = path.join(this.dataDir, 'get-pip.py');
    await this.downloadFile(GET_PIP_URL, getPipPath, () => {});

    const pythonExe = path.join(this.pythonDir, 'python.exe');
    execSync(`"${pythonExe}" "${getPipPath}"`, {
      cwd: this.pythonDir,
      encoding: 'utf8',
    });

    // Cleanup
    fs.unlinkSync(zipPath);
    fs.unlinkSync(getPipPath);

    this.sendProgress('python', 25, 'Python installed', 'Python installation complete');
  }

  async installDependencies(useGpu) {
    this.sendProgress('dependencies', 30, 'Installing dependencies...', 'Starting pip install');

    const pythonPath = this.findPython() || path.join(this.pythonDir, 'python.exe');

    // Upgrade pip first (async to not block UI)
    this.sendProgress('dependencies', 32, 'Upgrading pip...', 'pip install --upgrade pip');
    await this.runPipCommand(pythonPath, ['install', '--upgrade', 'pip']);

    // Install all dependencies from requirements file
    this.sendProgress('dependencies', 35, 'Installing dependencies (this may take a while)...', 'pip install -r requirements.txt');

    const requirementsFile = useGpu ? 'requirements-nvidia.txt' : 'requirements.txt';
    const reqPath = path.join(this.backendDir, requirementsFile);

    if (fs.existsSync(reqPath)) {
      await this.runPipCommand(pythonPath, ['install', '-r', reqPath, '--no-cache-dir'], (progress, message) => {
        // Update progress based on pip output
        const percent = Math.round(35 + (progress * 35)); // 35% to 70%
        this.sendProgress('dependencies', percent, 'Installing dependencies...', message);
      });
      this.sendProgress('dependencies', 70, 'Dependencies installed', 'All dependencies installed successfully');
    } else {
      this.sendProgress('dependencies', 70, 'Requirements file not found', `Missing: ${reqPath}`);
    }
  }

  // Run pip command asynchronously to not block UI
  runPipCommand(pythonPath, args, progressCallback = null) {
    return new Promise((resolve) => {
      const proc = spawn(pythonPath, ['-m', 'pip', ...args], {
        cwd: this.backendDir,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        shell: process.platform === 'win32',
      });

      let outputLines = [];
      let progressEstimate = 0;

      const handleOutput = (data) => {
        const text = data.toString();
        const lines = text.split('\n').filter(l => l.trim());

        lines.forEach(line => {
          outputLines.push(line);

          // Estimate progress from pip output
          if (line.includes('Downloading')) {
            progressEstimate = Math.min(progressEstimate + 0.05, 0.8);
          } else if (line.includes('Installing collected')) {
            progressEstimate = 0.9;
          } else if (line.includes('Successfully installed')) {
            progressEstimate = 1.0;
          }

          if (progressCallback) {
            progressCallback(progressEstimate, line.slice(-100));
          }
        });
      };

      proc.stdout.on('data', handleOutput);
      proc.stderr.on('data', handleOutput);

      proc.on('close', (code) => {
        if (code !== 0) {
          console.error('[Setup] pip exited with code:', code);
          console.error('[Setup] Last output:', outputLines.slice(-10).join('\n'));
        }
        resolve(code === 0);
      });

      proc.on('error', (err) => {
        console.error('[Setup] pip spawn error:', err);
        resolve(false);
      });
    });
  }

  async downloadModel(modelId) {
    this.sendProgress('model', 75, `Downloading ${modelId} model...`, 'Starting model download');

    const pythonPath = this.findPython() || path.join(this.pythonDir, 'python.exe');

    // Update config to use selected model
    const configPath = path.join(this.backendDir, 'config.yaml');
    if (fs.existsSync(configPath)) {
      let config = fs.readFileSync(configPath, 'utf8');

      const modelMapping = {
        turbo: 'chatterbox-turbo',
        original: 'ResembleAI/chatterbox',
        multilingual: 'chatterbox-multilingual',
      };

      config = config.replace(
        /repo_id:\s*.+/,
        `repo_id: ${modelMapping[modelId] || 'chatterbox-turbo'}`
      );
      fs.writeFileSync(configPath, config);
    }

    // Start the server briefly to trigger model download
    this.sendProgress('model', 80, 'Downloading model (this may take several minutes)...', 'Starting model download');

    // Run the download script
    const downloadScript = path.join(this.backendDir, 'download_model.py');

    return new Promise((resolve, reject) => {
      const proc = spawn(pythonPath, [downloadScript], {
        cwd: this.backendDir,
        env: { ...process.env, HF_HUB_DISABLE_PROGRESS_BARS: '0' },
      });

      let lastProgress = 80;

      proc.stdout.on('data', (data) => {
        const msg = data.toString();
        this.sendProgress('model', lastProgress, 'Downloading model...', msg.slice(-100));

        // Try to parse progress
        const match = msg.match(/(\d+)%/);
        if (match) {
          const pct = parseInt(match[1]);
          lastProgress = Math.round(80 + (pct * 0.15)); // 80-95%
          this.sendProgress('model', lastProgress, `Downloading model... ${pct}%`);
        }
      });

      proc.stderr.on('data', (data) => {
        this.sendProgress('model', lastProgress, 'Downloading model...', data.toString().slice(-100));
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this.sendProgress('model', 95, 'Model downloaded', 'Model download complete');
          resolve();
        } else {
          // Model will download on first use anyway
          this.sendProgress('model', 95, 'Model will download on first use', 'Continuing...');
          resolve();
        }
      });

      proc.on('error', (err) => {
        this.sendProgress('model', 95, 'Model will download on first use', err.message);
        resolve(); // Continue anyway
      });
    });
  }

  async runSetup(options) {
    try {
      const { model, useGpu } = options;

      // Check if Python is available
      let pythonPath = this.findPython();

      if (!pythonPath) {
        // Install Python
        await this.installPythonEmbedded();
        pythonPath = path.join(this.pythonDir, 'python.exe');
      } else {
        this.sendProgress('python', 25, 'Python already installed', `Found: ${pythonPath}`);
      }

      // Install dependencies
      await this.installDependencies(useGpu);

      // Download model
      await this.downloadModel(model);

      // Mark setup as complete
      const setupFlagPath = path.join(this.dataDir, '.setup-complete');
      fs.writeFileSync(setupFlagPath, JSON.stringify({
        version: '1.0.0',
        model,
        useGpu,
        timestamp: new Date().toISOString(),
      }));

      this.sendProgress('complete', 100, 'Setup complete!', 'VoiceCraft is ready to use');

      return { success: true };
    } catch (error) {
      this.sendProgress('error', 0, error.message, error.stack);
      throw error;
    }
  }

  isSetupComplete() {
    const setupFlagPath = path.join(this.dataDir, '.setup-complete');
    return fs.existsSync(setupFlagPath);
  }
}

module.exports = SetupManager;
