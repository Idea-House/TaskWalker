const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskWalker', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  listWindows: () => ipcRenderer.invoke('windows:list'),
  activateWindow: (hwnd) => ipcRenderer.invoke('windows:activate', hwnd),
  closeWindow: (hwnd) => ipcRenderer.invoke('windows:close', hwnd),
  hideOverlay: () => ipcRenderer.send('window:hide'),
  onOpenView: (callback) => {
    const listener = (_event, view) => callback(view);
    ipcRenderer.on('window:open-view', listener);
    return () => ipcRenderer.removeListener('window:open-view', listener);
  },
  onThemeChanged: (callback) => {
    const listener = (_event, theme) => callback(theme);
    ipcRenderer.on('theme:changed', listener);
    return () => ipcRenderer.removeListener('theme:changed', listener);
  },
});
