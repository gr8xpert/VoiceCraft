/**
 * VoiceCraft Setup Module — R2 Archive Installer
 * Downloads pre-built archives from Cloudflare R2 instead of using pip.
 * Supports resume on interrupted downloads via HTTP Range requests.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { app } = require('electron');

// R2 CDN base URL — all setup downloads come from here
const R2_BASE_URL = 'https://pub-47fe74e29e49481c8ace643cd33ab71d.r2.dev/v1';

// Setup version — bump when archive format changes to force re-setup
const SETUP_VERSION = 2;

// Minimum free disk space required (GB)
const MIN_FREE_SPACE_GB = 10;

class SetupManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    const isDev = !app.isPackaged;
    this.backendDir = isDev
      ? path.join(__dirname, '..')
      : path.join(process.resourcesPath, 'backend');
    this.dataDir = app.getPath('userData');
    this.pythonDir = path.join(this.dataDir, 'python');
    this.modelsDir = path.join(this.dataDir, 'models');
    this.aborted = false;
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

    const MIN_VRAM_GB = 4;

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
        const nameResult = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', {
          encoding: 'utf8',
          timeout: 5000,
        });
        if (nameResult.trim()) {
          info.hasNvidiaGpu = true;
          info.gpuName = nameResult.trim().split('\n')[0];

          const vramResult = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits', {
            encoding: 'utf8',
            timeout: 5000,
          });
          const vramMB = parseInt(vramResult.trim().split('\n')[0]);
          info.gpuVram = Math.round(vramMB / 1024 * 10) / 10;
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
        info.hasEnoughSpace = freeGB >= MIN_FREE_SPACE_GB;
      }
    } catch (e) {
      // Couldn't check disk space
    }

    return info;
  }

  findPython() {
    const candidates = [];

    if (process.platform === 'win32') {
      candidates.push(path.join(this.dataDir, 'python', 'python.exe'));
      candidates.push(path.join(this.dataDir, 'venv', 'Scripts', 'python.exe'));
      candidates.push(path.join(this.backendDir, 'venv', 'Scripts', 'python.exe'));
    } else {
      candidates.push(path.join(this.dataDir, 'venv', 'bin', 'python'));
      candidates.push(path.join(this.backendDir, 'venv', 'bin', 'python'));
    }

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  // ─── R2 Archive Methods ───────────────────────────────────────────

  /**
   * Fetch manifest.json from R2. Contains archive list, sizes, and SHA-256 hashes.
   */
  async fetchManifest() {
    const url = `${R2_BASE_URL}/manifest.json`;
    console.log(`[Setup] Fetching manifest from ${url}`);

    return new Promise((resolve, reject) => {
      const get = url.startsWith('https') ? https.get : http.get;
      get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectGet = res.headers.location.startsWith('https') ? https.get : http.get;
          redirectGet(res.headers.location, (redirectRes) => {
            this._readJson(redirectRes, resolve, reject);
          }).on('error', reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to fetch manifest: HTTP ${res.statusCode}`));
          return;
        }
        this._readJson(res, resolve, reject);
      }).on('error', reject);
    });
  }

  _readJson(res, resolve, reject) {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error(`Invalid manifest JSON: ${e.message}`));
      }
    });
    res.on('error', reject);
  }

  /**
   * Download a file with HTTP Range resume support.
   * Writes to .partial file, renames on completion.
   */
  async downloadFileWithResume(url, destPath, expectedSize, progressCb) {
    const partialPath = destPath + '.partial';
    let startByte = 0;

    // Check for existing partial download
    if (fs.existsSync(partialPath)) {
      const stat = fs.statSync(partialPath);
      startByte = stat.size;
      if (expectedSize && startByte >= expectedSize) {
        // Partial is already full size, just rename
        fs.renameSync(partialPath, destPath);
        return;
      }
      console.log(`[Setup] Resuming download from byte ${startByte}`);
    }

    return new Promise((resolve, reject) => {
      const headers = {};
      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`;
      }

      const makeRequest = (requestUrl) => {
        const getFunc = requestUrl.startsWith('https') ? https.get : http.get;
        const urlObj = new URL(requestUrl);

        const req = getFunc({
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: urlObj.pathname + urlObj.search,
          headers,
        }, (res) => {
          // Handle redirects (up to 5 hops)
          if (res.statusCode === 301 || res.statusCode === 302) {
            makeRequest(res.headers.location);
            return;
          }

          // 200 = full content (server doesn't support Range or fresh start)
          // 206 = partial content (resume working)
          if (res.statusCode === 200) {
            startByte = 0; // Server sent full file, start from scratch
          } else if (res.statusCode !== 206) {
            reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            return;
          }

          const flags = startByte > 0 && res.statusCode === 206 ? 'a' : 'w';
          const file = fs.createWriteStream(partialPath, { flags });

          const totalSize = expectedSize || (parseInt(res.headers['content-length'], 10) + startByte);
          let downloaded = startByte;

          res.on('data', (chunk) => {
            downloaded += chunk.length;
            if (progressCb && totalSize) {
              progressCb(downloaded, totalSize);
            }
          });

          res.pipe(file);

          file.on('finish', () => {
            file.close(() => {
              try {
                if (fs.existsSync(destPath)) {
                  fs.unlinkSync(destPath);
                }
                fs.renameSync(partialPath, destPath);
                resolve();
              } catch (e) {
                reject(e);
              }
            });
          });

          file.on('error', (err) => {
            file.close();
            reject(err);
          });

          res.on('error', (err) => {
            file.close();
            reject(err);
          });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('Connection timed out'));
        });
      };

      makeRequest(url);
    });
  }

  /**
   * Verify SHA-256 checksum of a file.
   */
  async verifyChecksum(filePath, expectedSha256) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => {
        const actual = hash.digest('hex');
        if (actual === expectedSha256) {
          resolve(true);
        } else {
          reject(new Error(
            `Checksum mismatch for ${path.basename(filePath)}: expected ${expectedSha256.slice(0, 12)}..., got ${actual.slice(0, 12)}...`
          ));
        }
      });
      stream.on('error', reject);
    });
  }

  /**
   * Extract a zip archive using tar.exe (built into Windows 10+, much faster than PowerShell).
   * Falls back to PowerShell Expand-Archive if tar fails.
   */
  async extractZip(zipPath, destDir) {
    fs.mkdirSync(destDir, { recursive: true });

    try {
      // tar.exe handles zip files and is 10x faster than PowerShell
      execSync(`tar.exe -xf "${zipPath}" -C "${destDir}"`, {
        encoding: 'utf8',
        timeout: 600000, // 10 min timeout for large archives
        windowsHide: true,
      });
    } catch (tarError) {
      console.log('[Setup] tar.exe failed, falling back to PowerShell:', tarError.message);
      execSync(
        `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        {
          encoding: 'utf8',
          timeout: 1200000, // 20 min for PowerShell (slower)
          windowsHide: true,
        }
      );
    }
  }

  /**
   * Download, verify, extract, and clean up a single archive.
   * @param {string} uiStage — stage name for frontend indicators ('python', 'dependencies', 'model')
   */
  async downloadAndInstallArchive(archiveInfo, archiveKey, progressStart, progressEnd, uiStage) {
    const { filename, size, sha256 } = archiveInfo;
    const zipPath = path.join(this.dataDir, filename);
    const label = archiveKey.replace(/-/g, ' ');

    // Download
    this.sendProgress(uiStage, progressStart, `Downloading ${label}...`, `Starting download of ${filename}`);

    await this.downloadFileWithResume(
      `${R2_BASE_URL}/${filename}`,
      zipPath,
      size,
      (downloaded, total) => {
        const dlPct = downloaded / total;
        // Download takes 70% of this archive's progress range
        const pct = progressStart + (dlPct * (progressEnd - progressStart) * 0.7);
        const dlMB = (downloaded / (1024 * 1024)).toFixed(0);
        const totalMB = (total / (1024 * 1024)).toFixed(0);
        this.sendProgress(uiStage, Math.round(pct), `Downloading ${label}... ${dlMB}/${totalMB} MB`);
      }
    );

    // Verify checksum
    const verifyStart = progressStart + (progressEnd - progressStart) * 0.7;
    this.sendProgress(uiStage, Math.round(verifyStart), `Verifying ${label}...`, `Checking SHA-256 for ${filename}`);

    try {
      await this.verifyChecksum(zipPath, sha256);
      console.log(`[Setup] Checksum OK: ${filename}`);
    } catch (checksumErr) {
      // Checksum failed — delete and throw so caller can retry
      console.error(`[Setup] ${checksumErr.message}`);
      try { fs.unlinkSync(zipPath); } catch (e) {}
      throw checksumErr;
    }

    // Extract
    const extractStart = progressStart + (progressEnd - progressStart) * 0.8;
    this.sendProgress(uiStage, Math.round(extractStart), `Extracting ${label}...`, `Extracting ${filename}`);

    await this.extractZip(zipPath, this.dataDir);
    console.log(`[Setup] Extracted: ${filename}`);

    // Clean up zip
    try { fs.unlinkSync(zipPath); } catch (e) {}

    this.sendProgress(uiStage, Math.round(progressEnd), `${label} installed`, `Completed ${filename}`);
  }

  // ─── Main Setup Flow ──────────────────────────────────────────────

  async runSetup(options) {
    try {
      const { useGpu } = options;
      this.aborted = false;

      // Step 1: Fetch manifest
      this.sendProgress('python', 2, 'Fetching package manifest...', 'Connecting to download server');

      let manifest;
      try {
        manifest = await this.fetchManifest();
      } catch (err) {
        throw new Error(`Cannot reach download server: ${err.message}. Check your internet connection.`);
      }

      console.log(`[Setup] Manifest version: ${manifest.version}, build: ${manifest.buildDate}`);

      // Step 2: Build archive list
      const archiveKeys = ['python-core'];

      if (useGpu) {
        archiveKeys.push('pytorch-nvidia-cu121');
      } else {
        // Use CPU archive if available, otherwise skip (pytorch-cpu may not exist yet)
        if (manifest.archives['pytorch-cpu']) {
          archiveKeys.push('pytorch-cpu');
        } else {
          archiveKeys.push('pytorch-nvidia-cu121');
          console.log('[Setup] No CPU-only PyTorch archive available, using NVIDIA version');
        }
      }

      archiveKeys.push('packages');
      archiveKeys.push('models-turbo');

      // Validate all archives exist in manifest
      for (const key of archiveKeys) {
        if (!manifest.archives[key]) {
          throw new Error(`Archive "${key}" not found in manifest. The download server may need updating.`);
        }
      }

      // Calculate total download size
      const totalSize = archiveKeys.reduce((sum, key) => sum + manifest.archives[key].size, 0);
      const totalGB = (totalSize / (1024 ** 3)).toFixed(1);
      console.log(`[Setup] Total download: ${totalGB} GB (${archiveKeys.length} archives)`);

      // Step 3: Download + verify + extract each archive
      // Map archive keys to UI stage names and progress ranges
      // Frontend expects: 'python' (5-25%), 'dependencies' (25-70%), 'model' (70-95%)
      const archiveStageMap = {
        'python-core': { uiStage: 'python', pStart: 5, pEnd: 25 },
        'pytorch-nvidia-cu121': { uiStage: 'dependencies', pStart: 25, pEnd: 55 },
        'pytorch-cpu': { uiStage: 'dependencies', pStart: 25, pEnd: 55 },
        'packages': { uiStage: 'dependencies', pStart: 55, pEnd: 70 },
        'models-turbo': { uiStage: 'model', pStart: 70, pEnd: 95 },
      };

      for (let i = 0; i < archiveKeys.length; i++) {
        if (this.aborted) throw new Error('Setup cancelled');

        const key = archiveKeys[i];
        const info = manifest.archives[key];
        const stageInfo = archiveStageMap[key] || { uiStage: 'dependencies', pStart: 25, pEnd: 70 };

        console.log(`[Setup] Archive ${i + 1}/${archiveKeys.length}: ${key} (${(info.size / (1024 ** 2)).toFixed(0)} MB)`);
        await this.downloadAndInstallArchive(info, key, stageInfo.pStart, stageInfo.pEnd, stageInfo.uiStage);
      }

      // Step 4: Post-install fixups
      this.sendProgress('model', 96, 'Finalizing installation...', 'Writing setup config');

      // Ensure python310._pth has 'import site' uncommented
      const pthFile = path.join(this.pythonDir, 'python310._pth');
      if (fs.existsSync(pthFile)) {
        let content = fs.readFileSync(pthFile, 'utf8');
        if (content.includes('#import site')) {
          content = content.replace('#import site', 'import site');
          fs.writeFileSync(pthFile, content);
          console.log('[Setup] Enabled site-packages in python310._pth');
        }
      }

      // Step 5: Mark setup as complete
      const setupFlagPath = path.join(this.dataDir, '.setup-complete');
      fs.writeFileSync(setupFlagPath, JSON.stringify({
        setupVersion: SETUP_VERSION,
        model: options.model || 'turbo',
        useGpu,
        manifestVersion: manifest.version,
        buildDate: manifest.buildDate,
        timestamp: new Date().toISOString(),
      }));

      this.sendProgress('complete', 100, 'Setup complete!', 'VoiceCraft is ready to use');
      return { success: true };
    } catch (error) {
      console.error('[Setup] Error:', error.message);
      this.sendProgress('error', 0, error.message, error.stack);
      throw error;
    }
  }

  isSetupComplete() {
    const setupFlagPath = path.join(this.dataDir, '.setup-complete');
    if (!fs.existsSync(setupFlagPath)) {
      return false;
    }

    // Check setup version — old installs (no setupVersion) trigger re-setup
    try {
      const data = JSON.parse(fs.readFileSync(setupFlagPath, 'utf8'));
      if (!data.setupVersion || data.setupVersion < SETUP_VERSION) {
        console.log(`[Setup] Old setup version (${data.setupVersion || 'none'}), need re-setup`);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  abort() {
    this.aborted = true;
  }
}

module.exports = SetupManager;
