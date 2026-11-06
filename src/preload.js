'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  getState: () => ipcRenderer.invoke('state:get'),
  addHabit: data => ipcRenderer.invoke('habit:add', data),
  editHabit: (id, data) => ipcRenderer.invoke('habit:edit', id, data),
  archiveHabit: id => ipcRenderer.invoke('habit:archive', id),
  reorderHabits: ids => ipcRenderer.invoke('habit:reorder', ids),
  roll: () => ipcRenderer.invoke('avatar:roll'),
  updateSettings: patch => ipcRenderer.invoke('settings:update', patch),
  play: state => ipcRenderer.invoke('avatar:play', state),
  onReaction: callback => {
    const listener = (_event, reaction) => callback(reaction);
    ipcRenderer.on('avatar:reaction', listener);
    return () => ipcRenderer.removeListener('avatar:reaction', listener);
  },
  logProgress: (habitId, amount) => ipcRenderer.invoke('progress:log', habitId, amount),
  setMinutes: (habitId, total) => ipcRenderer.invoke('progress:minutes', habitId, total),
  motionPreference: reduced => ipcRenderer.send('avatar:motion', reduced),
  togglePopup: () => ipcRenderer.send('popup:toggle'),
  closePopup: () => ipcRenderer.send('popup:close'),
  fitPopup: height => ipcRenderer.send('popup:fit', height),
  drag: phase => ipcRenderer.send('avatar:drag', phase),
  resizeAvatar: size => ipcRenderer.invoke('avatar:resize', size),
  resizeDrag: (phase, edge) => ipcRenderer.send('avatar:resize-drag', phase, edge),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
});
