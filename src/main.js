'use strict';

const path = require('node:path');
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, dialog, Notification } = require('electron');
const { Store } = require('./store');
const { summary } = require('./renderer/domain');
const makeTrayIcon = require('./tray-icon');
const { startReminders } = require('./reminders');

let avatar, popup, effects, tray, store, drag, resize;
let quitting = false;
let rolling = null;
let stopReminders;
let reducedMotion = false;
let effectsTimer;
let celebrationTimer;
let reopenAfterCelebration = false;
let popupHeight = 340;
const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 620;
const smokeTest = process.argv.includes('--smoke-test');
if (smokeTest) app.setPath('userData', path.join(app.getPath('temp'), `habit-buddy-smoke-${require('node:crypto').randomUUID()}`));

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
  const width = Math.min(POPUP_WIDTH, area.width - 16);
  const height = Math.min(popupHeight, area.height - 16);
  const above = bounds.y - height - 8;
  const position = clampPosition({ x: bounds.x, y: above >= area.y ? above : bounds.y + bounds.height + 8 }, width, height);
  popup.setBounds({ ...position, width, height });
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
  cancelCelebration();
  hideEffects();
  stopRoll();
  positionPopup();
  popup.webContents.send('state:changed', store.snapshot());
  popup.show();
  popup.focus();
}

function cancelCelebration() {
  clearTimeout(celebrationTimer);
  reopenAfterCelebration = false;
}

function stopRoll(completed = false) {
  if (!rolling) return;
  clearInterval(rolling.timer);
  placeAvatar(rolling.origin);
  const followUp = rolling.followUp;
  rolling = null;
  avatar.webContents.send('avatar:reaction', { state: completed && followUp ? followUp : 'idle' });
}

function startRoll(celebration = false, followUp = null) {
  if (reducedMotion || rolling || drag || resize || (!celebration && popup.isVisible())) return false;
  const bounds = avatar.getBounds();
  const size = store.snapshot().settings.avatarSize;
  const area = screen.getDisplayMatching(bounds).workArea;
  const left = bounds.x - area.x;
  const right = area.x + area.width - size - bounds.x;
  const direction = right >= left ? 1 : -1;
  const distance = Math.min(320, Math.max(left, right));
  if (distance < size) return false;
  const started = Date.now();
  rolling = { origin: { x: bounds.x, y: bounds.y }, followUp, timer: null };
  avatar.webContents.send('avatar:reaction', { state: 'roll', direction });
  rolling.timer = setInterval(() => {
    const fraction = Math.min(1, (Date.now() - started) / 4000);
    placeAvatar({ x: bounds.x + direction * distance * Math.sin(Math.PI * fraction), y: bounds.y }, size);
    if (fraction >= 1) stopRoll(true);
  }, 16);
  return true;
}

function reactToProgress(result, random = Math.random) {
  const reopen = popup.isVisible() || reopenAfterCelebration;
  cancelCelebration();
  hideEffects();
  stopRoll(); broadcast();
  const streak = summary(result.state).current;
  const followUp = result.completed && result.allComplete && [3, 7, 14, 30, 60, 100].includes(streak) ? 'wink' : null;
  if (result.completed) {
    popup.hide();
    reopenAfterCelebration = reopen;
    const roll = random() >= .5 && startRoll(true, followUp);
    if (!roll) avatar.webContents.send('avatar:reaction', { state: 'celebrate', followUp });
    showEffects(roll ? 'roll' : 'celebrate', '');
    celebrationTimer = setTimeout(() => {
      const restore = reopenAfterCelebration;
      cancelCelebration(); hideEffects(); stopRoll();
      if (restore && !quitting) showPopup();
    }, roll ? 4300 : 3100);
    return;
  }
  const state = result.completed ? 'celebrate' : result.halfway ? 'halfway' : 'smile';
  avatar.webContents.send('avatar:reaction', { state, followUp });
  if (result.completed || result.halfway) showEffects(state, result.halfway && !result.completed ? "You're halfway there!" : '');
}

function hideEffects() {
  clearTimeout(effectsTimer);
  if (effects && !effects.isDestroyed()) effects.hide();
}

function showEffects(state, message) {
  const bounds = avatar.getBounds();
  const position = clampPosition({ x: bounds.x + bounds.width / 2 - 160, y: bounds.y + bounds.height - 220 }, 320, 220);
  effects.setBounds({ ...position, width: 320, height: 220 });
  effects.webContents.send('avatar:reaction', {
    state, message, reducedMotion,
    x: bounds.x + bounds.width / 2 - position.x,
    y: bounds.y + bounds.height / 2 - position.y,
    accent: store.snapshot().settings.accent || { sage: '#789568', lavender: '#9582b4', peach: '#c58c70', ocean: '#67989f' }[store.snapshot().settings.palette],
  });
  effects.showInactive();
  effectsTimer = setTimeout(hideEffects, state === 'halfway' ? 3300 : state === 'roll' ? 4200 : 3000);
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
  ipcMain.on('popup:fit', (event, height) => {
    if (event.sender !== popup.webContents || !Number.isFinite(height)) return;
    const next = Math.max(220, Math.min(POPUP_HEIGHT, Math.ceil(height)));
    if (next === popupHeight) return;
    popupHeight = next;
    if (popup.isVisible()) positionPopup();
  });
  const log = (event, habitId, amount, replace = false) => {
    if (!trusted(event) || typeof habitId !== 'string') throw new Error('Invalid progress request.');
    const result = store.logProgress(habitId, amount, { replace });
    reactToProgress(result);
    return result;
  };
  ipcMain.handle('progress:log', (event, id, amount) => log(event, id, amount));
  ipcMain.handle('progress:minutes', (event, id, amount) => log(event, id, amount, true));
  ipcMain.on('avatar:motion', (event, value) => {
    if (event.sender === avatar.webContents && typeof value === 'boolean') {
      reducedMotion = value;
      if (reducedMotion) stopRoll();
    }
  });
  for (const [channel, action] of Object.entries({
    'habit:add': data => store.addHabit(data),
    'habit:edit': (id, data) => store.editHabit(id, data),
    'habit:archive': id => store.archiveHabit(id),
    'habit:reorder': ids => store.reorderHabits(ids),
    'settings:update': patch => {
      if (!patch || Object.keys(patch).some(key => !['avatar', 'palette', 'accent'].includes(key))) throw new Error('Unknown setting.');
      return store.updateSettings(patch);
    },
  })) ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Unknown window.');
    action(...args); broadcast(); return store.snapshot();
  });
  ipcMain.handle('avatar:play', (event, state) => {
    if (!trusted(event) || !['sleepy', 'wink', 'idle'].includes(state)) throw new Error('Unknown buddy state.');
    avatar.webContents.send('avatar:reaction', { state });
  });
  ipcMain.handle('avatar:roll', event => {
    if (event.sender !== avatar.webContents) throw new Error('Unknown window.');
    return startRoll();
  });
  ipcMain.handle('avatar:resize', (event, size) => {
    if (!trusted(event)) throw new Error('Unknown window.');
    stopRoll();
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
      cancelCelebration();
      hideEffects();
      stopRoll();
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
  ipcMain.on('popup:close', event => { if (trusted(event)) { cancelCelebration(); hideEffects(); stopRoll(); popup.hide(); } });
  ipcMain.on('avatar:drag', (event, phase) => {
    if (event.sender !== avatar.webContents) return;
    if (phase === 'start') {
      cancelCelebration();
      hideEffects();
      stopRoll();
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
  app.on('before-quit', () => { quitting = true; cancelCelebration(); hideEffects(); stopRoll(); if (stopReminders) stopReminders(); });
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
    popup = createWindow({ width: POPUP_WIDTH, height: popupHeight, transparent: true, thickFrame: false, hasShadow: false, backgroundColor: '#00000000', title: 'Your day · Habit Buddy' }, 'popup.html');
    effects = createWindow({ width: 320, height: 220, transparent: true, thickFrame: false, hasShadow: false, focusable: false, title: 'A little celebration' }, 'effects.html');
    effects.setIgnoreMouseEvents(true);
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
    if (!smokeTest) stopReminders = startReminders(store, habit => {
      if (!Notification.isSupported()) return false;
      const notification = new Notification({ title: 'A little nudge 🌱', body: `A moment for ${habit.name.toLowerCase()}? Whenever you're ready.`, silent: true });
      notification.on('click', showPopup);
      notification.on('failed', (_event, error) => console.error('Reminder could not be shown:', error));
      notification.show();
      return true;
    });
    for (const event of ['display-removed', 'display-metrics-changed']) screen.on(event, () => {
      stopRoll();
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
      const flow = await popup.webContents.executeJavaScript(`(async () => {
        const waitFor = async predicate => {
          const deadline = Date.now() + 8000;
          while (!await predicate()) {
            if (Date.now() > deadline) throw new Error('UI check timed out: ' + predicate.toString());
            await new Promise(resolve => setTimeout(resolve, 25));
          }
        };
        const q = selector => document.querySelector(selector);
        if (document.querySelector('[data-type="percent"]')) throw new Error('Percentage category is still visible');
        for (const [index, type] of ['count', 'checkbox', 'minutes'].entries()) {
          q(index === 0 ? '#first-habit' : '#add-habit').click();
          if (!q('#today').hidden || !q('#history').hidden || !q('#settings').hidden) throw new Error('Editor is not an isolated view');
          q('#habit-name').value = 'Test ' + type;
          q('#habit-type').value = type;
          q('#habit-type').dispatchEvent(new Event('change'));
          q('#habit-goal').value = type === 'checkbox' ? 1 : 2;
          q('#habit-form').requestSubmit();
          await waitFor(() => document.querySelectorAll('.habit').length === index + 1 && q('#editor').hidden);
        }
        document.querySelector('.habit .count-dots button').click();
        await waitFor(async () => Object.values((await window.buddy.getState()).days).flat().some(entry => entry.type === 'count' && entry.halfwayCelebrated));
        await waitFor(() => !busy);
        await waitFor(() => q('#status').textContent.includes("You're halfway there!"));
        const savedOrder = (await window.buddy.getState()).habits.map(habit => habit.id);
        const checkboxRow = [...document.querySelectorAll('.habit')].find(row => row.textContent.includes('Test checkbox'));
        checkboxRow.querySelector('.habit-actions button').click();
        await waitFor(() => [...document.querySelectorAll('.habit')].some(row => row.textContent.includes('Test checkbox') && row.querySelector('.done')));
        if (!document.querySelector('#habit-list .habit.is-complete .done-mark') || document.querySelector('#completed-title')) throw new Error('Completed cards must stay in one list without a done subheading');
        if (!document.querySelector('#habit-list .habit:last-child').classList.contains('is-complete')) throw new Error('Completed habit did not move to bottom');
        if (JSON.stringify(savedOrder) !== JSON.stringify((await window.buddy.getState()).habits.map(habit => habit.id))) throw new Error('Completion changed the preferred order');
        await waitFor(() => !busy);
        await new Promise(resolve => setTimeout(resolve, 150));
        await waitFor(() => !document.hidden);
        const minutesRow = [...document.querySelectorAll('.habit')].find(row => row.textContent.includes('Test minutes'));
        const minutesId = minutesRow.dataset.id;
        minutesRow.querySelector('.minutes-form input').value = '7.5'; minutesRow.querySelector('.minutes-form').requestSubmit();
        await waitFor(async () => Object.values((await window.buddy.getState()).days).flat().some(entry => entry.id === minutesId && entry.amount === 7.5));
        await waitFor(() => !busy);
        await new Promise(resolve => setTimeout(resolve, 150));
        await waitFor(() => !document.hidden);
        const updatedMinutes = [...document.querySelectorAll('.habit')].find(row => row.dataset.id === minutesId);
        if (!updatedMinutes.matches('#habit-list .is-complete') || !updatedMinutes.querySelector('.done-mark') || updatedMinutes.querySelector('.toggle-completed')) throw new Error('Completed minute card must show a left check mark without a dropdown');
        if (getComputedStyle(updatedMinutes.querySelector('.habit-name')).textDecorationLine.includes('line-through')) throw new Error('Completed names should not be crossed out');
        if (updatedMinutes.querySelector('.minutes-form')) throw new Error('Completed minutes must show only a check');
        updatedMinutes.querySelector('.done-mark').click();
        const reopenedMinutes = [...document.querySelectorAll('.habit')].find(row => row.dataset.id === minutesId);
        reopenedMinutes.querySelector('.minutes-form input').value = '1'; reopenedMinutes.querySelector('.minutes-form input').dispatchEvent(new Event('change'));
        await waitFor(async () => Object.values((await window.buddy.getState()).days).flat().some(entry => entry.id === minutesId && entry.amount === 1));
        await waitFor(() => !!document.querySelector('#habit-list .minutes-form'));
        if (document.querySelector('.remaining') || document.querySelector('.habit progress')) throw new Error('Redundant progress labels or bars remain');
        const countRow = [...document.querySelectorAll('.habit')].find(row => row.textContent.includes('Test count'));
        countRow.querySelector('.habit-heading .icon').click();
        q('#habit-name').value = 'Water edited'; q('#habit-form').requestSubmit();
        await waitFor(() => q('#editor').hidden && q('#habit-list').textContent.includes('Water edited'));
        q('#settings-toggle').click();
        if (!q('#today').hidden || !q('#history').hidden || !q('#editor').hidden) throw new Error('Settings is not an isolated view');
        if (q('#avatar-choice').options.length !== 3) throw new Error('Avatar choices were not simplified');
        q('#avatar-choice').value = 'pineapple'; q('#avatar-choice').dispatchEvent(new Event('change'));
        await waitFor(async () => (await window.buddy.getState()).settings.avatar === 'pineapple');
        q('#palette').value = 'lavender'; q('#palette').dispatchEvent(new Event('change'));
        await waitFor(async () => (await window.buddy.getState()).settings.palette === 'lavender');
        q('#settings-done').click();
        q('#history').open = true;
        if (document.querySelectorAll('#heatmap .day[data-outside="false"]').length < 28) throw new Error('Monthly calendar missing');
        q('#calendar-toggle').click();
        if (document.querySelectorAll('#heatmap .day[data-outside="false"]').length < 365) throw new Error('Year calendar missing');
        q('#calendar-toggle').click();
        if (q('#playtime') || q('#day-start')) throw new Error('Removed controls are still present');
        const reorder = document.querySelector('.habit .reorder-handle');
        const firstId = reorder.closest('.habit').dataset.id;
        reorder.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitFor(() => document.querySelector('#habit-list .habit').dataset.id !== firstId);
        await waitFor(() => !busy);
        const completeCard = document.querySelector('.habit.is-complete');
        const completeId = completeCard.dataset.id;
        const target = document.querySelector('.habit:not(.is-complete)');
        const orderBeforeDrop = (await window.buddy.getState()).habits.map(habit => habit.id);
        const transfer = new DataTransfer();
        completeCard.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: transfer, cancelable: true }));
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer, cancelable: true }));
        await waitFor(() => document.querySelector('#habit-list .habit:last-child').dataset.id === completeId);
        if (JSON.stringify(orderBeforeDrop) !== JSON.stringify((await window.buddy.getState()).habits.map(habit => habit.id))) throw new Error('Completed cards must remain below unfinished cards today');
        const edited = [...document.querySelectorAll('.habit')].find(row => row.textContent.includes('Water edited'));
        edited.querySelector('.habit-heading .icon').click();
        q('#reminder-mode').value = 'repeat'; q('#reminder-mode').dispatchEvent(new Event('change'));
        q('#reminder-time').value = '10:30'; q('#reminder-time').dispatchEvent(new Event('change'));
        q('#reminder-clock button[aria-label="Increase reminder minute"]').click();
        if (q('#reminder-time').value !== '10:31') throw new Error('Themed clock control failed');
        q('#reminder-clock button[aria-label="Reminder PM"]').click();
        if (q('#reminder-time').value !== '22:31') throw new Error('Clock AM/PM failed');
        q('#reminder-clock button[aria-label="Reminder AM"]').click();
        q('#reminder-frequency').value = '60'; q('#reminder-until').value = '19:00';
        q('#habit-form').requestSubmit();
        await waitFor(async () => (await window.buddy.getState()).habits.find(habit => habit.id === firstId).reminder?.everyMinutes === 60);
        [...document.querySelectorAll('.habit')].find(row => row.textContent.includes('Water edited')).querySelector('.habit-heading .icon').click();
        q('#remove-habit').click();
        await waitFor(() => document.querySelectorAll('.habit').length === 2 && q('#editor').hidden);
        return true;
      })()`);
      if (!flow) throw new Error('Habit UI check failed.');
      for (const state of ['sleepy', 'wink']) {
        await popup.webContents.executeJavaScript(`window.buddy.play('${state}')`);
        await avatar.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 30))');
        if (await avatar.webContents.executeJavaScript('document.body.dataset.state') !== state) throw new Error(`Missing reaction: ${state}`);
      }
      if (await avatar.webContents.executeJavaScript('document.body.dataset.avatar') !== 'pineapple') throw new Error('Avatar change not applied.');
      popup.hide();
      const rollOrigin = avatar.getBounds();
      if (!await avatar.webContents.executeJavaScript('window.buddy.roll()')) throw new Error('Desktop rolling did not start.');
      await new Promise(resolve => setTimeout(resolve, 300));
      const duringRoll = avatar.getBounds();
      if (Math.abs(duringRoll.x - rollOrigin.x) < 10 || Math.abs(duringRoll.y - rollOrigin.y) > 1) throw new Error('Roll did not travel horizontally.');
      stopRoll();
      showPopup();
      reactToProgress({ state: store.snapshot(), completed: true, allComplete: false }, () => 1);
      if (!rolling) throw new Error('Completion roll must work with the popup open');
      if (popup.isVisible()) throw new Error('Menu must hide during completion roll');
      await effects.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 40))');
      if (await effects.webContents.executeJavaScript("document.querySelector('#message').textContent") !== '') throw new Error('Roll must not show completion text');
      stopRoll();
      reactToProgress({ state: store.snapshot(), completed: true, allComplete: false }, () => 0);
      await avatar.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 30))');
      if (await avatar.webContents.executeJavaScript('document.body.dataset.state') !== 'celebrate' || rolling) throw new Error('Confetti celebration failed');
      if (popup.isVisible()) throw new Error('Menu must hide during completion confetti');
      const fs = require('node:fs');
      const captureDir = path.join(__dirname, '..', '.npm');
      fs.mkdirSync(captureDir, { recursive: true });
      fs.writeFileSync(path.join(captureDir, 'buddy-preview.png'), (await avatar.webContents.capturePage()).toPNG());
      await effects.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 120))');
      const hasConfetti = await effects.webContents.executeJavaScript("document.querySelector('canvas').getContext('2d').getImageData(0, 0, 320, 220).data.some((value, index) => index % 4 === 3 && value > 0)");
      if (!effects.isVisible() || !hasConfetti) throw new Error('Larger desktop confetti did not render.');
      fs.writeFileSync(path.join(captureDir, 'confetti-preview.png'), (await effects.webContents.capturePage()).toPNG());
      const reopenDeadline = Date.now() + 5000;
      while (!popup.isVisible()) {
        if (Date.now() > reopenDeadline) throw new Error('Menu did not reopen after celebration');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      showPopup();
      await popup.webContents.executeJavaScript("document.querySelector('#history').open = false; window.scrollTo(0, 0); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      fs.writeFileSync(path.join(captureDir, 'popup-preview.png'), (await popup.webContents.capturePage()).toPNG());
      reactToProgress({ state: store.snapshot(), completed: false, halfway: true, allComplete: false });
      await effects.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 60))');
      if (await effects.webContents.executeJavaScript("document.querySelector('#message').textContent") !== "You're halfway there!") throw new Error('Halfway speech bubble missing.');
      if (await avatar.webContents.executeJavaScript('document.body.dataset.state') !== 'halfway') throw new Error('Halfway happy reaction missing.');
      fs.writeFileSync(path.join(captureDir, 'halfway-preview.png'), (await effects.webContents.capturePage()).toPNG());
      hideEffects();
      await popup.webContents.executeJavaScript(`(async () => {
        const active = (await window.buddy.getState()).habits.filter(habit => !habit.archived);
        const keep = active.find(habit => habit.type === 'minutes') || active[0];
        for (const habit of active.filter(habit => habit.id !== keep.id)) await window.buddy.archiveHabit(habit.id);
        document.querySelector('#history').open = false;
        await new Promise(resolve => setTimeout(resolve, 200));
        if (document.querySelectorAll('.habit').length !== 1) throw new Error('One-habit view failed');
        if (document.querySelector('.minutes-form button')) throw new Error('Separate minute save button remains');
      })()`);
      await new Promise(resolve => setTimeout(resolve, 200));
      if (popup.getBounds().height >= POPUP_HEIGHT - 10) throw new Error('One-habit popup did not shrink to content');
      fs.writeFileSync(path.join(captureDir, 'compact-preview.png'), (await popup.webContents.capturePage()).toPNG());
      const compactHeight = popup.getBounds().height;
      await popup.webContents.executeJavaScript("document.querySelector('#history').open = true; new Promise(resolve => setTimeout(resolve, 200))");
      if (popup.getBounds().height <= compactHeight) throw new Error('Rounded popup did not expand for the calendar');
      await popup.webContents.executeJavaScript("document.querySelector('#history').open = false; new Promise(resolve => setTimeout(resolve, 200))");
      if (Math.abs(popup.getBounds().height - compactHeight) > 2) throw new Error('Rounded popup did not shrink after closing calendar');
      await popup.webContents.executeJavaScript("window.buddy.addHabit({ name: 'Water', type: 'count', goal: 8, unit: 'glasses' })");
      await popup.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 200))');
      await popup.webContents.executeJavaScript(`(async () => {
        const water = [...document.querySelectorAll('.habit')].find(card => card.textContent.includes('Water'));
        if (water.querySelectorAll('.water-drops .count-slot').length !== 8) throw new Error('Water droplets missing');
        water.querySelectorAll('.count-slot button, button.count-slot')[2].click();
        const until = Date.now() + 5000;
        while (document.querySelectorAll('.water-drops .is-filled').length !== 3) {
          if (Date.now() > until) throw new Error('Droplet logging failed');
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        await window.buddy.addHabit({ name: 'Reading', type: 'count', goal: 30, unit: 'pages' });
        await new Promise(resolve => setTimeout(resolve, 50));
        const bar = document.querySelector('.count-bar-button');
        if (!bar) throw new Error('Large count progress bar missing');
        bar.click();
        if (document.querySelector('.habit-count') || document.querySelector('#habit-list').textContent.includes('Log one')) throw new Error('Old counters remain');
        if (!document.querySelector('.minutes-form .progress-ring')) throw new Error('Minutes progress ring missing');
      })()`);
      await popup.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 200))');
      fs.writeFileSync(path.join(captureDir, 'cards-preview.png'), (await popup.webContents.capturePage()).toPNG());
      const roundedCapture = await popup.webContents.capturePage();
      if (roundedCapture.toBitmap()[3] !== 0) throw new Error('Outer popup corner is opaque instead of transparent');
      await popup.webContents.executeJavaScript("document.querySelector('#history').open = false; document.querySelector('#add-habit').click(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      fs.writeFileSync(path.join(captureDir, 'form-preview.png'), (await popup.webContents.capturePage()).toPNG());
      await popup.webContents.executeJavaScript("document.querySelector('#reminder-mode').value = 'daily'; document.querySelector('#reminder-mode').dispatchEvent(new Event('change')); document.querySelector('#reminder-clock').scrollIntoView({block:'center'}); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      fs.writeFileSync(path.join(captureDir, 'clock-preview.png'), (await popup.webContents.capturePage()).toPNG());
      console.log('SMOKE TEST PASSED: dots and water droplets, visual count logging, large-goal bars, editable minutes with rings, check-only completion, correction, reorder, and celebrations.');
      app.quit();
    }
  }).catch(error => {
    console.error(error);
    if (!smokeTest) dialog.showErrorBox('Habit Buddy needs a moment', error.message);
    app.exit(1);
  });
}
