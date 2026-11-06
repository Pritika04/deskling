'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  getState: () => ipcRenderer.invoke('state:get'),
  logProgress: (habitId, amount) => ipcRenderer.invoke('progress:log', habitId, amount),
  togglePopup: () => ipcRenderer.send('popup:toggle'),
  closePopup: () => ipcRenderer.send('popup:close'),
  drag: phase => ipcRenderer.send('avatar:drag', phase),
  resizeAvatar: size => ipcRenderer.invoke('avatar:resize', size),
  resizeDrag: (phase, edge) => ipcRenderer.send('avatar:resize-drag', phase, edge),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
});
