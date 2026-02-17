const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');
const http = require('http');
const SetupManager = require('./setup');

let mainWindow;
let pythonProcess;
let backendPort;
let setupManager;

// Determine if running in development or production
const isDev = !app.isPackaged;
const backendDir = isDev
  ? path.join(__dirname, '..')
  : path.join(process.resourcesPath, 'backend');

// Find a free port
function findFreePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

// Determine Python path
function getPythonPath() {
  const isWin = process.platform === 'win32';
  const dataDir = app.getPath('userData');

  // Check paths in order of preference
  const candidates = isWin ? [
    path.join(dataDir, 'venv', 'Scripts', 'python.exe'),
    path.join(dataDir, 'python', 'python.exe'),
    path.join(backendDir, 'venv', 'Scripts', 'python.exe'),
  ] : [
    path.join(dataDir, 'venv', 'bin', 'python'),
    path.join(backendDir, 'venv', 'bin', 'python'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`[Electron] Found Python at: ${p}`);
      return p;
    }
  }

  // Fallback to system python
  return isWin ? 'python' : 'python3';
}

// Spawn Python backend
async function startBackend(port) {
  const pythonPath = getPythonPath();
  const serverScript = path.join(backendDir, 'server.py');
  const dataDir = app.getPath('userData');

  console.log(`[Electron] Starting backend on port ${port}`);
  console.log(`[Electron] Python path: ${pythonPath}`);
  console.log(`[Electron] Server script: ${serverScript}`);
  console.log(`[Electron] Backend dir: ${backendDir}`);

  // Build PYTHONPATH to include backend dir and site-packages
  const pythonSitePackages = path.join(dataDir, 'python', 'Lib', 'site-packages');
  const pythonPath2 = [backendDir, pythonSitePackages].join(path.delimiter);

  const env = {
    ...process.env,
    VOICECRAFT_PORT: port.toString(),
    VOICECRAFT_DATA_DIR: dataDir,
    VOICECRAFT_ELECTRON: '1',  // Signal to server.py to skip browser auto-open
    PYTHONPATH: pythonPath2,
    PYTHONIOENCODING: 'utf-8',
  };

  console.log(`[Electron] PYTHONPATH: ${pythonPath2}`);

  pythonProcess = spawn(pythonPath, [serverScript], {
    cwd: backendDir,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  pythonProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    console.log(`[Python] ${message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('python-log', { type: 'stdout', message });
    }
  });

  pythonProcess.on('error', (error) => {
    console.error(`[Electron] Failed to start Python: ${error.message}`);
    console.error(`[Electron] Python path was: ${pythonPath}`);
    console.error(`[Electron] Server script was: ${serverScript}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-status', {
        status: 'error',
        message: `Failed to start Python: ${error.message}\nPath: ${pythonPath}`,
      });
    }
  });

  let stderrBuffer = '';
  let restartCount = 0;
  const maxRestarts = 3;

  pythonProcess.stderr.on('data', (data) => {
    const message = data.toString().trim();
    stderrBuffer += message + '\n';
    // Keep last 2000 chars
    if (stderrBuffer.length > 2000) {
      stderrBuffer = stderrBuffer.slice(-2000);
    }
    console.error(`[Python] ${message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('python-log', { type: 'stderr', message });
    }
  });

  pythonProcess.on('exit', (code) => {
    console.log(`[Electron] Python exited with code ${code}`);
    if (code !== 0 && !app.isQuitting) {
      restartCount++;
      if (restartCount <= maxRestarts) {
        console.log(`[Electron] Auto-restarting backend (attempt ${restartCount}/${maxRestarts})...`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-status', {
            status: 'restarting',
            message: `Backend crashed. Restarting... (${restartCount}/${maxRestarts})`,
          });
        }
        setTimeout(() => startBackend(port), 3000);
      } else {
        console.error('[Electron] Backend crashed too many times. Last error:', stderrBuffer);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-status', {
            status: 'error',
            message: `Backend crashed ${maxRestarts} times.\n\nError:\n${stderrBuffer.slice(-500)}`,
          });
        }
      }
    }
  });

  await waitForBackend(port);
}

// Poll until backend responds - no fixed timeout, waits as long as Python is running
async function waitForBackend(port) {
  console.log(`[Electron] Waiting for backend on port ${port}...`);

  let lastError = '';
  let attempts = 0;

  while (true) {
    attempts++;

    // Check if Python process crashed
    if (pythonProcess && pythonProcess.exitCode !== null) {
      throw new Error(`Python process exited with code ${pythonProcess.exitCode}. Check logs for details.`);
    }

    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/ui/initial-data`, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', (e) => {
          lastError = e.message;
          reject(e);
        });
        req.setTimeout(2000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      console.log(`[Electron] Backend ready on port ${port}`);
      return true;
    } catch (e) {
      lastError = e.message;
    }

    await new Promise((r) => setTimeout(r, 2000));

    // Update UI with progress (no max, just show attempts)
    if (mainWindow && !mainWindow.isDestroyed()) {
      const minutes = Math.floor((attempts * 2) / 60);
      const seconds = (attempts * 2) % 60;
      mainWindow.webContents.send('backend-status', {
        status: 'loading',
        message: `Starting backend... ${minutes}m ${seconds}s (loading model...)`,
        progress: Math.min(attempts, 100),
      });
    }
  }
}

function createWindow() {
  // Remove the default menu bar (File, Edit, View, etc.)
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: 'VoiceCraft',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: '#1B1B1B',
  });

  // Load UI
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log(`[Electron] Loading dev server: ${process.env.VITE_DEV_SERVER_URL}`);
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = isDev
      ? path.join(__dirname, '..', 'frontend', 'dist', 'index.html')
      : path.join(process.resourcesPath, 'frontend', 'dist', 'index.html');
    console.log(`[Electron] Loading: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }

  // DevTools - only enable for debugging (uncomment line below)
  // mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Initialize setup manager
  setupManager = new SetupManager(mainWindow);
}

// Check if first-run setup is needed
function needsSetup() {
  const setupFlagPath = path.join(app.getPath('userData'), '.setup-complete');
  return !fs.existsSync(setupFlagPath);
}

app.whenReady().then(async () => {
  try {
    createWindow();

    // Wait for the window to finish loading before sending messages
    mainWindow.webContents.on('did-finish-load', async () => {
      // Check if setup is needed
      if (needsSetup()) {
        console.log('[Electron] First run - showing setup wizard');
        mainWindow.webContents.send('show-setup', true);
      } else {
        // Start backend normally
        backendPort = await findFreePort();
        console.log(`[Electron] Found free port: ${backendPort}`);

        await startBackend(backendPort);

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-status', {
            status: 'ready',
            port: backendPort,
          });
        }
      }
    });
  } catch (error) {
    console.error(`[Electron] Startup failed: ${error.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-status', {
        status: 'error',
        message: error.message,
      });
    }
  }
});

app.isQuitting = false;

app.on('before-quit', () => {
  app.isQuitting = true;
  if (pythonProcess) {
    console.log('[Electron] Stopping Python backend...');
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t']);
    } else {
      pythonProcess.kill('SIGTERM');
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ============ IPC Handlers ============

// Backend communication
ipcMain.handle('get-backend-port', () => backendPort);

ipcMain.handle('restart-backend', async () => {
  if (pythonProcess) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t']);
    } else {
      pythonProcess.kill('SIGTERM');
    }
  }
  await new Promise((r) => setTimeout(r, 1000));
  await startBackend(backendPort);
  return { success: true, port: backendPort };
});

// App info
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));
ipcMain.handle('get-app-version', () => app.getVersion());

// File dialogs
ipcMain.handle('show-open-dialog', async (event, options) => {
  return dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  return dialog.showSaveDialog(mainWindow, options);
});

// Shell operations
ipcMain.handle('open-external', async (event, url) => {
  return shell.openExternal(url);
});

ipcMain.handle('open-path', async (event, filePath) => {
  return shell.openPath(filePath);
});

// Setup handlers
ipcMain.handle('check-system', async () => {
  return setupManager.checkSystem();
});

ipcMain.handle('start-setup', async (event, options) => {
  return setupManager.runSetup(options);
});

ipcMain.handle('is-setup-complete', () => {
  return !needsSetup();
});

// After setup completes, start the backend
ipcMain.handle('setup-complete', async () => {
  backendPort = await findFreePort();
  await startBackend(backendPort);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backend-status', {
      status: 'ready',
      port: backendPort,
    });
  }

  return { success: true, port: backendPort };
});
