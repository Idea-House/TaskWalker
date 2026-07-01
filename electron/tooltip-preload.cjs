const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskWalkerTooltip', {
  onShow: (callback) => {
    const listener = (_event, title) => callback(title);
    ipcRenderer.on('tooltip:show', listener);
    return () => ipcRenderer.removeListener('tooltip:show', listener);
  },
  reportSize: (size) => ipcRenderer.send('tooltip:size', size),
});
