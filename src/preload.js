'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Only real input counts: layout, animations, and scheduled messages stay quiet.
let lastMotionAt = 0;
function recordActivity(event) {
  if (!event.isTrusted) return;
  const now = Date.now();
  if (['pointermove', 'pointerover'].includes(event.type) && now - lastMotionAt < 1000) return;
  lastMotionAt = now;
  ipcRenderer.send('buddy:activity', event.type);
}
for (const type of ['pointerdown', 'pointermove', 'pointerover', 'keydown', 'input', 'wheel']) {
  document.addEventListener(type, recordActivity, { capture: true, passive: true });
}

contextBridge.exposeInMainWorld('buddy', {
  getState: () => ipcRenderer.invoke('state:get'),
  activity: () => ipcRenderer.send('buddy:activity'),
  getRest: () => ipcRenderer.invoke('buddy:rest'),
  onRest: callback => {
    const listener = (_event, rest) => callback(rest);
    ipcRenderer.on('buddy:rest', listener);
    return () => ipcRenderer.removeListener('buddy:rest', listener);
  },
  nameBuddy: name => ipcRenderer.invoke('buddy:name', name),
  buyAccessory: id => ipcRenderer.invoke('collection:buy', id),
  equipOutfit: outfit => ipcRenderer.invoke('collection:equip', outfit),
  affection: (kind = 'play') => ipcRenderer.invoke('avatar:affection', kind),
  openMystery: () => ipcRenderer.invoke('mystery:open'),
  onReward: callback => {
    const listener = (_event, item) => callback(item);
    ipcRenderer.on('mystery:reveal', listener);
    return () => ipcRenderer.removeListener('mystery:reveal', listener);
  },
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
  enableGaze: enabled => ipcRenderer.send('avatar:gaze-enabled', enabled),
  onGaze: callback => {
    const listener = (_event, gaze) => callback(gaze);
    ipcRenderer.on('avatar:gaze', listener);
    return () => ipcRenderer.removeListener('avatar:gaze', listener);
  },
  togglePopup: () => ipcRenderer.send('popup:toggle'),
  closePopup: () => ipcRenderer.send('popup:close'),
  fitPopup: height => ipcRenderer.send('popup:fit', height),
  fitBubble: size => ipcRenderer.send('effects:fit', size),
  onBubblePosition: callback => {
    const listener = (_event, position) => callback(position);
    ipcRenderer.on('bubble:position', listener);
    return () => ipcRenderer.removeListener('bubble:position', listener);
  },
  drag: phase => ipcRenderer.send('avatar:drag', phase),
  resizeAvatar: size => ipcRenderer.invoke('avatar:resize', size),
  resizeDrag: (phase, edge) => ipcRenderer.send('avatar:resize-drag', phase, edge),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
});
