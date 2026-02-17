const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Backend communication
  getBackendPort: () => ipcRenderer.invoke('get-backend-port'),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),

  // App info
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // File dialogs
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // Shell operations
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),

  // Event listeners
  onBackendStatus: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on('backend-status', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('backend-status', handler);
  },

  onPythonLog: (callback) => {
    const handler = (_, log) => callback(log);
    ipcRenderer.on('python-log', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('python-log', handler);
  },

  // Setup wizard
  checkSystem: () => ipcRenderer.invoke('check-system'),
  startSetup: (options) => ipcRenderer.invoke('start-setup', options),
  isSetupComplete: () => ipcRenderer.invoke('is-setup-complete'),
  setupComplete: () => ipcRenderer.invoke('setup-complete'),

  onSetupProgress: (callback) => {
    const handler = (_, progress) => callback(progress);
    ipcRenderer.on('setup-progress', handler);
    return () => ipcRenderer.removeListener('setup-progress', handler);
  },

  onShowSetup: (callback) => {
    const handler = (_, show) => callback(show);
    ipcRenderer.on('show-setup', handler);
    return () => ipcRenderer.removeListener('show-setup', handler);
  },

  // Check if running in Electron
  isElectron: true,
});

// Also expose platform info
contextBridge.exposeInMainWorld('platformInfo', {
  platform: process.platform,
  arch: process.arch,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});
