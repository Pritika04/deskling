'use strict';

const path = require('node:path');
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, dialog } = require('electron');
const { Store } = require('./store');
const makeTrayIcon = require('./tray-icon');

let avatar, popup, tray, store, drag, resize;
let quitting = false;
const POPUP_WIDTH = 340;
const POPUP_HEIGHT = 370;
const smokeTest = process.argv.includes('--smoke-test');
if (smokeTest) app.setPath('userData', path.join(app.getPath('temp'), `habit-buddy-smoke-${process.pid}`));

function clampPosition(position, width, height) {
  const area = screen.getDisplayNearestPoint(position).workArea;
  return {
    x: Math.round(Math.max(area.x, Math.min(position.x, area.x + Math.max(0, area.width - width)))),
    y: Math.round(Math.max(area.y, Math.min(position.y, area.y + Math.max(0, area.height - height)))),
  };
}

function positionPopup() {
  const bounds = avatar.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const above = bounds.y - POPUP_HEIGHT - 8;
  const position = clampPosition({ x: bounds.x, y: above >= area.y ? above : bounds.y + bounds.height + 8 }, POPUP_WIDTH, POPUP_HEIGHT);
  popup.setBounds({ ...position, width: POPUP_WIDTH, height: POPUP_HEIGHT });
}

function placeAvatar(position, size = store.snapshot().settings.avatarSize) {
  const next = clampPosition(position, size, size);
  // Supply the intended dimensions on every move. On Windows, repeated
  // setPosition calls can accumulate DPI rounding and grow the window.
  avatar.setBounds({ ...next, width: size, height: size });
}

function previewResize(cursor) {
  const delta = cursor.y - resize.cursor.y;
  const size = Math.max(64, Math.min(160, Math.round(resize.bounds.height + (resize.edge === 'top' ? -delta : delta))));
  resize.size = size;
  placeAvatar({
    x: resize.bounds.x + Math.round((resize.bounds.width - size) / 2),
    y: resize.edge === 'top' ? resize.bounds.y + resize.bounds.height - size : resize.bounds.y,
  }, size);
}

function showPopup() {
  positionPopup();
  popup.show();
  popup.focus();
}

function broadcast() {
  for (const window of [avatar, popup]) {
    if (window && !window.isDestroyed()) window.webContents.send('state:changed', store.snapshot());
  }
}

function trayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Habit Buddy', click: showPopup },
    { label: 'Pause reminders', type: 'checkbox', checked: store.snapshot().settings.remindersPaused, click: item => {
      try { store.updateSettings({ remindersPaused: item.checked }); broadcast(); }
      catch (error) { dialog.showErrorBox('Could not save your preference', error.message); }
      trayMenu();
    } },
    { label: 'Launch at login (coming in step 8)', enabled: false },
    { type: 'separator' },
    { label: 'Quit Habit Buddy', click: () => app.quit() },
  ]));
}

function createWindow(options, page) {
  const window = new BrowserWindow({
    frame: false, resizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    ...options,
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.on('close', event => {
    if (!quitting) { event.preventDefault(); window.hide(); }
  });
  window.loadFile(path.join(__dirname, 'renderer', page)).catch(error => {
    console.error(error);
    app.exit(1);
  });
  return window;
}

function registerIpc() {
  const trusted = event => [avatar, popup].some(window => window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame);
  ipcMain.handle('state:get', event => {
    if (!trusted(event)) throw new Error('Unknown window.');
    return store.snapshot();
  });
  ipcMain.handle('progress:log', (event, habitId, amount) => {
    if (!trusted(event) || typeof habitId !== 'string') throw new Error('Invalid progress request.');
    const result = store.logProgress(habitId, amount);
    broadcast();
    // Future reactions and rewards subscribe here, after the durable save.
    return result;
  });
  ipcMain.handle('avatar:resize', (event, size) => {
    if (!trusted(event)) throw new Error('Unknown window.');
    store.updateSettings({ avatarSize: size });
    const bounds = avatar.getBounds();
    placeAvatar({ x: bounds.x, y: bounds.y + bounds.height - size });
    savePosition();
    if (popup.isVisible()) positionPopup();
    broadcast();
    return store.snapshot();
  });
  ipcMain.on('avatar:resize-drag', (event, phase, edge) => {
    if (event.sender !== avatar.webContents) return;
    if (phase === 'start' && ['top', 'bottom'].includes(edge)) {
      drag = null;
      resize = { cursor: screen.getCursorScreenPoint(), bounds: avatar.getBounds(), size: store.snapshot().settings.avatarSize, edge };
      popup.hide();
    } else if (phase === 'move' && resize) {
      previewResize(screen.getCursorScreenPoint());
    } else if (phase === 'end' && resize) {
      const size = resize.size;
      resize = null;
      const [x, y] = avatar.getPosition();
      try {
        store.updateSettings({ avatarSize: size, avatarPosition: { x, y } });
        broadcast();
      } catch (error) {
        placeAvatar({ x, y });
        dialog.showErrorBox('Could not remember buddy size', error.message);
      }
    }
  });
  ipcMain.on('popup:toggle', event => {
    if (trusted(event)) popup.isVisible() ? popup.hide() : showPopup();
  });
  ipcMain.on('popup:close', event => { if (trusted(event)) popup.hide(); });
  ipcMain.on('avatar:drag', (event, phase) => {
    if (event.sender !== avatar.webContents) return;
    if (phase === 'start') {
      resize = null;
      drag = { cursor: screen.getCursorScreenPoint(), origin: avatar.getPosition() };
    } else if (phase === 'move' && drag) {
      popup.hide();
      const cursor = screen.getCursorScreenPoint();
      placeAvatar({ x: drag.origin[0] + cursor.x - drag.cursor.x, y: drag.origin[1] + cursor.y - drag.cursor.y });
    } else if (phase === 'end' && drag) {
      drag = null;
      savePosition();
    }
  });
}

function savePosition() {
  const [x, y] = avatar.getPosition();
  try { store.updateSettings({ avatarPosition: { x, y } }); }
  catch (error) { dialog.showErrorBox('Could not remember this position', error.message); }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (popup) showPopup(); });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => {});
  app.on('activate', () => { if (popup) showPopup(); });
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.habitbuddy.desktop');
    if (process.platform === 'darwin') app.dock.hide();
    store = new Store(path.join(app.getPath('userData'), 'habit-buddy.json'));
    const area = screen.getPrimaryDisplay().workArea;
    const saved = store.snapshot().settings.avatarPosition;
    const size = store.snapshot().settings.avatarSize;
    const position = clampPosition(saved || { x: area.x + 20, y: area.y + area.height - size - 16 }, size, size);
    avatar = createWindow({ ...position, width: size, height: size, transparent: true, thickFrame: false, hasShadow: false, title: 'Habit Buddy' }, 'avatar.html');
    popup = createWindow({ width: POPUP_WIDTH, height: POPUP_HEIGHT, backgroundColor: '#faf8f3', title: 'Your day · Habit Buddy' }, 'popup.html');
    registerIpc();
    avatar.once('ready-to-show', () => avatar.showInactive());
    popup.on('blur', () => {
      // Leave avatar clicks to the toggle handler, avoiding hide-then-reopen.
      const cursor = screen.getCursorScreenPoint();
      const bounds = avatar.getBounds();
      if (cursor.x < bounds.x || cursor.x >= bounds.x + bounds.width || cursor.y < bounds.y || cursor.y >= bounds.y + bounds.height) popup.hide();
    });
    const icon = makeTrayIcon(nativeImage);
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip('Habit Buddy · a little company for your day');
    tray.on('click', showPopup);
    trayMenu();
    for (const event of ['display-removed', 'display-metrics-changed']) screen.on(event, () => {
      const [x, y] = avatar.getPosition();
      placeAvatar({ x, y });
      if (popup.isVisible()) positionPopup();
      savePosition();
    });
    if (smokeTest) {
      // Exercise both sandboxed renderers and their real preload/IPC bridge.
      for (const window of [avatar, popup]) {
        if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
        const result = await window.webContents.executeJavaScript('window.buddy.getState()');
        if (result.version !== 1 || result.habits.length !== 0) throw new Error('Smoke test state mismatch.');
        if (await window.webContents.executeJavaScript('document.body.dataset.ready') !== 'true') throw new Error('Renderer did not initialize.');
      }
      if (icon.isEmpty() || !avatar.isAlwaysOnTop() || !avatar.isVisible()) throw new Error('Desktop shell did not initialize.');
      await popup.webContents.executeJavaScript('window.buddy.resizeAvatar(80)');
      const start = avatar.getBounds();
      for (let index = 0; index < 80; index++) placeAvatar({ x: start.x + index % 2, y: start.y });
      const end = avatar.getBounds();
      if (Math.abs(end.width - 80) > 1 || Math.abs(end.height - 80) > 1) throw new Error(`Buddy size drifted: ${JSON.stringify(end)}`);
      if (new Store(store.filePath).snapshot().settings.avatarSize !== 80) throw new Error('Buddy size was not saved.');
      await popup.webContents.executeJavaScript('window.buddy.resizeAvatar(68)');
      for (const edge of ['top', 'bottom']) {
        await avatar.webContents.executeJavaScript(`window.buddy.resizeDrag('start', '${edge}'); window.buddy.getState()`);
        const initialSize = resize.bounds.height;
        previewResize({ y: resize.cursor.y + (edge === 'top' ? -24 : 24) });
        const expected = Math.round(initialSize + 24);
        if (Math.abs(avatar.getBounds().height - expected) > 1) throw new Error('Resize preview did not follow vertical drag.');
        await avatar.webContents.executeJavaScript("window.buddy.resizeDrag('end'); window.buddy.getState()");
        if (new Store(store.filePath).snapshot().settings.avatarSize !== expected) throw new Error('Drag size did not persist.');
      }
      const grips = await avatar.webContents.executeJavaScript("document.querySelectorAll('.resize-edge').length");
      if (grips !== 2) throw new Error('Resize grips are missing.');
      if (await popup.webContents.executeJavaScript("!!document.querySelector('input[type=range]')")) throw new Error('Old slider is still present.');
      await avatar.webContents.executeJavaScript('window.buddy.resizeAvatar(68)');
      showPopup();
      console.log('SMOKE TEST PASSED: windows, tray, IPC, resize grips, live vertical resize, saved size, no slider, and 80 moves without size drift.');
      app.quit();
    }
  }).catch(error => {
    console.error(error);
    if (!smokeTest) dialog.showErrorBox('Habit Buddy needs a moment', error.message);
    app.exit(1);
  });
}
