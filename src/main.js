'use strict';

const path = require('node:path');
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, dialog } = require('electron');
const { Store } = require('./store');
const { summary, mysteryStatus } = require('./renderer/domain');
const makeTrayIcon = require('./tray-icon');
const { startReminders } = require('./reminders');
const { formatSurprise } = require('./mystery');
const { startThoughts } = require('./thoughts');
const { runShopSmoke } = require('./smoke-shop');
const { RestClock, REST_AFTER } = require('./rest');
const { popupPosition, bubbleWithMenu, mouthPoint } = require('./popup-position');
const { chooseGreeting, giftSize, chooseEncouragement, encouragements } = require('./greetings');

let avatar, popup, effects, tray, store, drag, resize;
let quitting = false;
let rolling = null;
let stopReminders;
let stopThoughts;
let rewardOpen = false;
let hatchTimer;
let hatching = false;
let affectionAt = 0;
let reducedMotion = false;
let effectsTimer;
let effectId = 0;
let lastGreeting = '';
let lastEncouragement = '';
let bubbleSize = null;
let presentationTimer;
let celebrating = false;
let restClock;
let lastActivityPointer;
let effectState = null;
let celebrationTimer;
let reopenAfterCelebration = false;
let popupHeight = 340;
const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 620;
const shopSmoke = process.argv.includes('--shop-test');
const smokeTest = process.argv.includes('--smoke-test') || shopSmoke;
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
  popup.setBounds(popupPosition(bounds, area, { width: POPUP_WIDTH, height: popupHeight }));
  if (bubbleSize && effectState) positionBubble(bubbleSize);
}

function positionBubble(data) {
  const pet = avatar.getBounds();
  const isGift = rewardOpen || (!celebrating && mysteryStatus(store.snapshot()).available);
  const layout = bubbleWithMenu(pet, screen.getDisplayMatching(pet).workArea, data, popup.isVisible() ? popup.getBounds() : null, mouthPoint(pet, isGift ? .74 : .65));
  if (!layout) { effects.hide(); return; }
  if (layout.menu && popup.isVisible()) popup.setBounds(layout.menu);
  const { bubble, frame, tail } = layout;
  effects.setBounds(frame);
  const local = point => ({ x: point.x - frame.x, y: point.y - frame.y });
  effects.webContents.send('bubble:position', { id: effectId, width: bubble.width, height: bubble.height, left: bubble.x - frame.x + 12, top: bubble.y - frame.y + 12, tail: { a: local(tail.a), b: local(tail.b), tip: local(tail.tip) } });
  effects.showInactive();
}

function displayAvatarSize() {
  const state = store.snapshot();
  return state.settings.hatched && (rewardOpen || (!celebrating && mysteryStatus(state).available)) ? giftSize(state.settings.avatarSize) : state.settings.avatarSize;
}

function syncAvatarSize() {
  if (!avatar || avatar.isDestroyed() || resize || rolling || drag) return;
  const bounds = avatar.getBounds(), size = displayAvatarSize();
  if (Math.abs(bounds.width - size) <= 1 && Math.abs(bounds.height - size) <= 1) return;
  placeAvatar({ x: bounds.x + Math.round((bounds.width - size) / 2), y: bounds.y + bounds.height - size }, size);
  if (popup?.isVisible()) positionPopup();
}

function placeAvatar(position, size = displayAvatarSize()) {
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
  restClock?.touch();
  if (!store.snapshot().settings.hatched && !hatching) { hatchBuddy(); return; }
  closeReward(false);
  cancelCelebration();
  hideEffects();
  stopRoll();
  syncAvatarSize();
  positionPopup();
  popup.webContents.send('state:changed', store.snapshot());
  popup.show();
  popup.focus();
}

function hatchBuddy() {
  if (hatching) return;
  hatching = true;
  hideEffects(); popup.hide();
  avatar.webContents.send('avatar:reaction', { state: 'hatching', hold: true });
  hatchTimer = setTimeout(() => {
    avatar.webContents.send('avatar:reaction', { state: 'smile', hold: true });
    showPopup();
  }, reducedMotion ? 50 : 1250);
}

function cancelHatching() {
  if (!hatching) return;
  clearTimeout(hatchTimer); hatching = false;
  avatar.webContents.send('avatar:reaction', { state: 'idle' });
}

function cancelCelebration() {
  clearTimeout(celebrationTimer);
  celebrating = false;
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
  stopRoll(); celebrating = !!result.completed; broadcast();
  const streak = summary(result.state).current;
  const followUp = result.completed && result.allComplete && [3, 7, 14, 30, 60, 100].includes(streak) ? 'wink' : null;
  if (result.completed) {
    popup.hide();
    reopenAfterCelebration = reopen && !result.allComplete;
    const roll = random() >= .5 && startRoll(true, followUp);
    if (!roll) avatar.webContents.send('avatar:reaction', { state: 'celebrate', followUp });
    showEffects(roll ? 'roll' : 'celebrate', '');
    celebrationTimer = setTimeout(() => {
      const restore = reopenAfterCelebration;
      cancelCelebration(); hideEffects(); stopRoll();
      syncAvatarSize();
      if (restore && !quitting) showPopup();
      else if (!quitting && result.allComplete && mysteryStatus(store.snapshot()).available) {
        avatar.webContents.send('avatar:reaction', { state: 'idle' });
        showEffects('reminder', 'You earned a little surprise. Click to unwrap ✨');
      }
    }, roll ? 4300 : 3100);
    return;
  }
  const state = result.completed ? 'celebrate' : result.halfway ? 'halfway' : 'smile';
  avatar.webContents.send('avatar:reaction', { state, followUp });
  if (result.halfway && !result.completed) {
    lastEncouragement = chooseEncouragement(lastEncouragement);
    showEffects('halfway', lastEncouragement);
  }
}

function hideEffects() {
  clearTimeout(effectsTimer);
  effectId++;
  effectState = null;
  bubbleSize = null;
  if (effects && !effects.isDestroyed()) effects.hide();
}

function showEffects(state, message) {
  clearTimeout(effectsTimer);
  const id = ++effectId;
  effectState = state;
  bubbleSize = null;
  const bubble = ['halfway', 'reminder', 'mystery', 'greeting'].includes(state);
  if (bubble) effects.hide();
  const bounds = avatar.getBounds();
  const height = state === 'mystery' ? 300 : 220;
  const position = clampPosition({ x: bounds.x + bounds.width / 2 - 160, y: bounds.y + bounds.height - height }, 320, height);
  effects.setBounds({ ...position, width: 320, height });
  effects.webContents.send('avatar:reaction', {
    id, bubble, state, message, reducedMotion, height,
    x: bounds.x + bounds.width / 2 - position.x,
    y: bounds.y + bounds.height / 2 - position.y,
    accent: store.snapshot().settings.accent || { sage: '#789568', lavender: '#9582b4', peach: '#c58c70', ocean: '#67989f' }[store.snapshot().settings.palette],
  });
  if (!bubble) effects.showInactive();
  effectsTimer = setTimeout(hideEffects, state === 'roll' ? 4200 : 3000);
}

function showReminder(habit) {
  if (!store.snapshot().settings.hatched) return false;
  if (quitting || rolling || drag || resize || reopenAfterCelebration || popup.isVisible() || effectState || effects.webContents.isLoading()) return false;
  const wording = /water|hydrat/i.test(habit.name) ? 'A little water break? Whenever you feel ready. 💧' : `A little moment for ${habit.name}? Whenever you're ready. 🌱`;
  avatar.webContents.send('avatar:reaction', { state: 'smile', duration: 3000 });
  showEffects('reminder', wording);
  return true;
}

function openMystery() {
  if (!store.snapshot().settings.hatched) return { opened: false, state: store.snapshot() };
  const reward = store.openMystery();
  if (!reward.opened) return reward;
  cancelCelebration(); hideEffects(); stopRoll(); popup.hide(); broadcast();
  rewardOpen = true;
  syncAvatarSize();
  avatar.webContents.send('avatar:reaction', { state: 'gift', hold: true });
  popup.webContents.send('mystery:reveal', reward.item);
  positionPopup(); popup.show(); popup.focus();
  return reward;
}

function closeReward(greet = true) {
  if (!rewardOpen) return;
  rewardOpen = false;
  syncAvatarSize();
  popup.hide();
  popup.webContents.send('mystery:reveal', null);
  avatar.webContents.send('avatar:reaction', { state: 'idle' });
  if (greet && !quitting) {
    const greeting = chooseGreeting(new Date(), lastGreeting);
    lastGreeting = greeting.text;
    showEffects('greeting', greeting.text);
  }
}

function showThought(item, checkOnly = false) {
  if (!store.snapshot().settings.hatched) return false;
  if (quitting || rewardOpen || rolling || drag || resize || reopenAfterCelebration || popup.isVisible() || effectState || effects.webContents.isLoading() || mysteryStatus(store.snapshot()).available) return false;
  if (!checkOnly) {
    avatar.webContents.send('avatar:reaction', { state: 'smile', duration: 3000 });
    showEffects('mystery', formatSurprise(item));
  }
  return true;
}

function broadcast() {
  syncAvatarSize();
  for (const window of [avatar, popup]) {
    if (window && !window.isDestroyed()) window.webContents.send('state:changed', store.snapshot());
  }
}

function trayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Habit Buddy', click: showPopup },
    { label: 'Pause reminders', type: 'checkbox', checked: store.snapshot().settings.remindersPaused, click: item => {
      restClock.touch();
      try {
        store.updateSettings({ remindersPaused: item.checked });
        if (item.checked) { store.clearReminderQueue(); if (effectState === 'reminder') hideEffects(); }
        broadcast();
      }
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
    if (!quitting) {
      event.preventDefault();
      if (window === popup) { cancelHatching(); closeReward(); }
      window.hide();
    }
  });
  window.loadFile(path.join(__dirname, 'renderer', page)).catch(error => {
    console.error(error);
    app.exit(1);
  });
  return window;
}

function registerIpc() {
  const trusted = event => [avatar, popup].some(window => window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame);
  ipcMain.on('buddy:activity', (event, kind) => {
    if (!trusted(event)) return;
    const cursor = screen.getCursorScreenPoint();
    const moved = !lastActivityPointer || cursor.x !== lastActivityPointer.x || cursor.y !== lastActivityPointer.y;
    lastActivityPointer = cursor;
    // A window appearing beneath a stationary cursor is not a new hover.
    if (['pointermove', 'pointerover'].includes(kind) && !moved) return;
    restClock.touch();
  });
  ipcMain.handle('buddy:rest', event => {
    if (!trusted(event)) throw new Error('Unknown window.');
    return { sleeping: restClock.check() };
  });
  ipcMain.on('effects:fit', (event, data) => {
    if (event.sender !== effects.webContents || event.senderFrame !== effects.webContents.mainFrame || !effectState || data?.id !== effectId || !Number.isFinite(data.width) || !Number.isFinite(data.height)) return;
    bubbleSize = { width: Math.max(40, Math.min(320, Math.ceil(data.width))), height: Math.max(40, Math.min(600, Math.ceil(data.height))) };
    positionBubble(bubbleSize);
  });
  ipcMain.handle('state:get', event => {
    if (!trusted(event)) throw new Error('Unknown window.');
    return store.snapshot();
  });
  ipcMain.handle('mystery:open', event => {
    if (!trusted(event)) throw new Error('Unknown window.');
    restClock.touch();
    return openMystery();
  });
  ipcMain.handle('buddy:name', (event, name) => {
    if (!trusted(event)) throw new Error('Unknown window.');
    restClock.touch();
    const next = store.nameBuddy(name);
    cancelHatching(); broadcast();
    return next;
  });
  ipcMain.handle('avatar:affection', (event, kind) => {
    if (!trusted(event) || event.sender !== avatar.webContents) return false;
    if (!['pet', 'play'].includes(kind)) return false;
    restClock.touch();
    if (!store.snapshot().settings.hatched || rewardOpen || rolling || drag || resize || reopenAfterCelebration || effects.isVisible() || mysteryStatus(store.snapshot()).available || Date.now() - affectionAt < 2500) return false;
    affectionAt = Date.now();
    if (kind === 'play') popup.hide();
    const states = ['boop', 'cuddle', 'wiggle'];
    avatar.webContents.send('avatar:reaction', { state: states[Math.floor(Math.random() * states.length)] });
    return true;
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
    restClock.touch();
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
    'collection:buy': id => store.buyAccessory(id),
    'collection:equip': outfit => store.equipOutfit(outfit),
    'settings:update': patch => {
      if (!patch || Object.keys(patch).some(key => !['avatar', 'palette', 'accent'].includes(key))) throw new Error('Unknown setting.');
      return store.updateSettings(patch);
    },
  })) ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Unknown window.');
    restClock.touch();
    action(...args); broadcast(); return store.snapshot();
  });
  ipcMain.handle('avatar:play', (event, state) => {
    if (!trusted(event) || !['sleepy', 'wink', 'idle'].includes(state)) throw new Error('Unknown buddy state.');
    restClock.touch();
    avatar.webContents.send('avatar:reaction', { state });
  });
  ipcMain.handle('avatar:roll', event => {
    if (event.sender !== avatar.webContents) throw new Error('Unknown window.');
    restClock.touch();
    return startRoll();
  });
  ipcMain.handle('avatar:resize', (event, size) => {
    if (!trusted(event)) throw new Error('Unknown window.');
    restClock.touch();
    stopRoll();
    store.updateSettings({ avatarSize: size });
    syncAvatarSize();
    savePosition();
    if (popup.isVisible()) positionPopup();
    broadcast();
    return store.snapshot();
  });
  ipcMain.on('avatar:resize-drag', (event, phase, edge) => {
    if (event.sender !== avatar.webContents) return;
    restClock.touch();
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
    if (!trusted(event)) return;
    restClock.touch();
    if (!store.snapshot().settings.hatched) { if (popup.isVisible()) { cancelHatching(); popup.hide(); } else showPopup(); return; }
    if (rewardOpen) { closeReward(); return; }
    if (event.sender === avatar.webContents && mysteryStatus(store.snapshot()).available) {
      try { openMystery(); } catch (error) { dialog.showErrorBox('Your surprise is safe', error.message); }
    } else popup.isVisible() ? popup.hide() : showPopup();
  });
  ipcMain.on('popup:close', event => { if (trusted(event)) { restClock.touch(); cancelHatching(); cancelCelebration(); hideEffects(); stopRoll(); popup.hide(); closeReward(); } });
  ipcMain.on('avatar:drag', (event, phase) => {
    if (event.sender !== avatar.webContents) return;
    restClock.touch();
    if (phase === 'start') {
      cancelCelebration();
      hideEffects();
      stopRoll();
      syncAvatarSize();
      resize = null;
      drag = { cursor: screen.getCursorScreenPoint(), origin: avatar.getPosition() };
    } else if (phase === 'move' && drag) {
      cancelHatching();
      closeReward(false);
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
  app.on('before-quit', () => { quitting = true; restClock?.stop(); clearInterval(presentationTimer); clearTimeout(hatchTimer); cancelCelebration(); hideEffects(); stopRoll(); if (stopReminders) stopReminders(); if (stopThoughts) stopThoughts(); });
  app.on('window-all-closed', () => {});
  app.on('activate', () => { if (popup) showPopup(); });
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.habitbuddy.desktop');
    if (process.platform === 'darwin') app.dock.hide();
    store = new Store(path.join(app.getPath('userData'), 'habit-buddy.json'));
    store.refreshRewards();
    lastActivityPointer = screen.getCursorScreenPoint();
    restClock = new RestClock({ onChange: rest => {
      if (!quitting && avatar && !avatar.isDestroyed()) avatar.webContents.send('buddy:rest', rest);
    } });
    const area = screen.getPrimaryDisplay().workArea;
    const saved = store.snapshot().settings.avatarPosition;
    const size = store.snapshot().settings.avatarSize;
    const position = clampPosition(saved || { x: area.x + 20, y: area.y + area.height - size - 16 }, size, size);
    avatar = createWindow({ ...position, width: size, height: size, transparent: true, thickFrame: false, hasShadow: false, title: 'Habit Buddy' }, 'avatar.html');
    popup = createWindow({ width: POPUP_WIDTH, height: popupHeight, transparent: true, thickFrame: false, hasShadow: false, backgroundColor: '#00000000', title: 'Your day · Habit Buddy' }, 'popup.html');
    effects = createWindow({ width: 320, height: 220, transparent: true, thickFrame: false, hasShadow: false, focusable: false, title: 'A little celebration' }, 'effects.html');
    effects.setIgnoreMouseEvents(true);
    registerIpc();
    avatar.once('ready-to-show', () => { syncAvatarSize(); avatar.showInactive(); });
    presentationTimer = setInterval(() => {
      try { restClock.check(); if (store.refreshRewards()) broadcast(); else syncAvatarSize(); }
      catch (error) { console.error('Could not save buddy rewards:', error.message); }
    }, 30000);
    popup.on('blur', () => {
      if (popup.isFocused()) return;
      // Leave avatar clicks to the toggle handler, avoiding hide-then-reopen.
      const cursor = screen.getCursorScreenPoint();
      const bounds = avatar.getBounds();
      if (cursor.x < bounds.x || cursor.x >= bounds.x + bounds.width || cursor.y < bounds.y || cursor.y >= bounds.y + bounds.height) { cancelHatching(); closeReward(); popup.hide(); }
    });
    const icon = makeTrayIcon(nativeImage);
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip('Habit Buddy · a little company for your day');
    tray.on('click', showPopup);
    trayMenu();
    if (!smokeTest) stopReminders = startReminders(store, showReminder);
    if (!smokeTest) stopThoughts = startThoughts(store, showThought);
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
      if (shopSmoke) {
        store.nameBuddy('Miso'); broadcast();
        const captureDir = path.join(__dirname, '..', '.npm');
        require('node:fs').mkdirSync(captureDir, { recursive: true });
        await runShopSmoke({ avatar, popup, store, closeReward, hideEffects, broadcast, showPopup }, captureDir);
        app.quit(); return;
      }
      const shellDeadline = Date.now() + 5000;
      while (!avatar.isVisible() && Date.now() < shellDeadline) await new Promise(resolve => setTimeout(resolve, 25));
      if (icon.isEmpty() || !avatar.isAlwaysOnTop() || !avatar.isVisible()) throw new Error('Desktop shell did not initialize.');
      if (store.snapshot().settings.avatarSize !== 160 || Math.abs(avatar.getBounds().width - 160) > 1) throw new Error('First launch must use the largest buddy size');
      const waitForBubble = async () => {
        const deadline = Date.now() + 2000;
        while (await effects.webContents.executeJavaScript('document.body.dataset.placementId') !== String(effectId)) {
          if (Date.now() > deadline) throw new Error('Speech bubble did not finish positioning');
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      };
      const onboardingFs = require('node:fs');
      const onboardingCaptures = path.join(__dirname, '..', '.npm');
      onboardingFs.mkdirSync(onboardingCaptures, { recursive: true });
      if (await avatar.webContents.executeJavaScript('document.body.dataset.state') !== 'egg') throw new Error('First launch must start with an egg');
      onboardingFs.writeFileSync(path.join(onboardingCaptures, 'egg-preview.png'), (await avatar.webContents.capturePage()).toPNG());
      await avatar.webContents.executeJavaScript("document.querySelector('#buddy').click()");
      await avatar.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 1400))');
      if (!popup.isVisible() || await popup.webContents.executeJavaScript("document.querySelector('#welcome').hidden")) throw new Error('Hatching must open the naming view');
      onboardingFs.writeFileSync(path.join(onboardingCaptures, 'welcome-preview.png'), (await popup.webContents.capturePage()).toPNG());
      await popup.webContents.executeJavaScript("document.querySelector('#buddy-name').value = 'Miso'; document.querySelector('#name-form').requestSubmit()");
      await avatar.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 100))');
      if (!new Store(store.filePath).snapshot().settings.hatched || store.snapshot().settings.buddyName !== 'Miso') throw new Error('Buddy name and hatch must persist');
      if (await popup.webContents.executeJavaScript("document.querySelector('#today').hidden")) throw new Error('Naming must show habits');
      if (await popup.webContents.executeJavaScript("document.querySelector('#home-title').textContent") !== 'Miso’s little space.') throw new Error('Named buddy must appear in the menu');
      showPopup();
      affectionAt = 0;
      await avatar.webContents.executeJavaScript("lastPet = 0; react({ state: 'idle' }); document.querySelector('#buddy').dispatchEvent(new PointerEvent('pointerenter'))");
      await avatar.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 650))');
      if (!popup.isVisible() || !['boop', 'cuddle', 'wiggle'].includes(await avatar.webContents.executeJavaScript('document.body.dataset.state'))) throw new Error('Hover must pet the buddy while keeping the menu open');
      await avatar.webContents.executeJavaScript("document.querySelector('#buddy').dispatchEvent(new PointerEvent('pointerleave'))");
      affectionAt = 0;
      await avatar.webContents.executeJavaScript(`(() => {
        const buddy = document.querySelector('#buddy');
        buddy.dispatchEvent(new MouseEvent('click', { detail: 1 }));
        buddy.dispatchEvent(new MouseEvent('click', { detail: 2 }));
        buddy.dispatchEvent(new MouseEvent('dblclick', { detail: 2 }));
      })()`);
      await avatar.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 400))');
      if (popup.isVisible() || !['boop', 'cuddle', 'wiggle'].includes(await avatar.webContents.executeJavaScript('document.body.dataset.state'))) throw new Error('Double-click must give affection without opening habits');
      onboardingFs.writeFileSync(path.join(onboardingCaptures, 'affection-preview.png'), (await avatar.webContents.capturePage()).toPNG());
      await avatar.webContents.executeJavaScript("document.querySelector('#buddy').dispatchEvent(new MouseEvent('click', { detail: 1 }))");
      await avatar.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 350))');
      if (!popup.isVisible()) throw new Error('Single click must still open habits');
      const actualRestNow = restClock.now;
      let restTestTime = actualRestNow();
      restClock.now = () => restTestTime;
      try {
        restClock.touch(); avatar.webContents.send('avatar:reaction', { state: 'idle' });
        restTestTime += REST_AFTER + 1; restClock.check();
        await new Promise(resolve => setTimeout(resolve, 50));
        if (!popup.isVisible() || await avatar.webContents.executeJavaScript('document.body.dataset.state') !== 'sleepy') throw new Error('Buddy must nap after ten idle minutes even with the menu open');
        onboardingFs.writeFileSync(path.join(onboardingCaptures, 'sleep-preview.png'), (await avatar.webContents.capturePage()).toPNG());
        await popup.webContents.executeJavaScript('window.buddy.activity()');
        await new Promise(resolve => setTimeout(resolve, 50));
        if (restClock.sleeping || await avatar.webContents.executeJavaScript('document.body.dataset.state') !== 'idle') throw new Error('Menu activity must wake the buddy');
        restTestTime += REST_AFTER + 1; restClock.check();
        popup.hide(); hideEffects();
        const idleDeadline = restClock.lastActivity;
        if (!showReminder({ name: 'Water' })) throw new Error('Reminder must be allowed while napping');
        await waitForBubble();
        const reminderExpression = await avatar.webContents.executeJavaScript('document.body.dataset.state');
        if (!restClock.sleeping || restClock.lastActivity !== idleDeadline || reminderExpression !== 'smile') throw new Error(`Reminder must wake the expression without resetting inactivity: ${JSON.stringify({ sleeping: restClock.sleeping, last: restClock.lastActivity, idleDeadline, reminderExpression })}`);
        await new Promise(resolve => setTimeout(resolve, 3100));
        if (await avatar.webContents.executeJavaScript('document.body.dataset.state') !== 'sleepy') throw new Error('Buddy must return to its nap after the reminder');
        const napThought = require('./thoughts').pool[0];
        if (!showThought(napThought)) throw new Error('Daytime thoughts must be allowed while napping');
        await waitForBubble();
        if (restClock.lastActivity !== idleDeadline || await avatar.webContents.executeJavaScript('document.body.dataset.state') !== 'smile') throw new Error('Thoughts must briefly wake without counting as user activity');
        await new Promise(resolve => setTimeout(resolve, 3100));
        if (await avatar.webContents.executeJavaScript('document.body.dataset.state') !== 'sleepy') throw new Error('Buddy must settle back down after a thought');
        affectionAt = 0;
        await avatar.webContents.executeJavaScript("lastPet = 0; document.querySelector('#buddy').dispatchEvent(new PointerEvent('pointerenter'))");
        await new Promise(resolve => setTimeout(resolve, 600));
        if (restClock.sleeping || !['boop', 'cuddle', 'wiggle'].includes(await avatar.webContents.executeJavaScript('document.body.dataset.state'))) throw new Error('Petting must wake the buddy');
        await avatar.webContents.executeJavaScript("document.querySelector('#buddy').dispatchEvent(new PointerEvent('pointerleave'))");
      } finally {
        restClock.now = actualRestNow; restClock.touch(); hideEffects();
        avatar.webContents.send('avatar:reaction', { state: 'idle' }); showPopup();
      }
      const layoutOrigin = avatar.getBounds();
      const layoutArea = screen.getDisplayMatching(layoutOrigin).workArea;
      placeAvatar({ x: layoutArea.x + Math.round(layoutArea.width / 2), y: layoutArea.y + Math.round(layoutArea.height / 2) });
      popupHeight = 620; positionPopup();
      const petBounds = avatar.getBounds(), menuBounds = popup.getBounds();
      if (menuBounds.x < petBounds.x + petBounds.width && menuBounds.x + menuBounds.width > petBounds.x && menuBounds.y < petBounds.y + petBounds.height && menuBounds.y + menuBounds.height > petBounds.y) throw new Error('Tall menu must never cover the pet');
      placeAvatar({ x: layoutOrigin.x, y: layoutOrigin.y }); positionPopup();
      await popup.webContents.executeJavaScript('window.buddy.resizeAvatar(80)');
      const start = avatar.getBounds();
      for (let index = 0; index < 80; index++) placeAvatar({ x: start.x + index % 2, y: start.y });
      const end = avatar.getBounds();
      if (Math.abs(end.width - 80) > 1 || Math.abs(end.height - 80) > 1) throw new Error(`Buddy size drifted: ${JSON.stringify(end)}`);
      if (new Store(store.filePath).snapshot().settings.avatarSize !== 80) throw new Error('Buddy size was not saved.');
      await popup.webContents.executeJavaScript('window.buddy.resizeAvatar(68)');
      const bubbleOrigin = avatar.getBounds();
      const bubbleArea = screen.getDisplayMatching(bubbleOrigin).workArea;
      for (const size of [68, 160, 192]) for (const [xRatio, yRatio] of [[0, 0], [.5, .5], [1, 1]]) for (const state of ['halfway', 'reminder', 'mystery', 'greeting']) {
        placeAvatar({ x: bubbleArea.x + Math.round((bubbleArea.width - size) * xRatio), y: bubbleArea.y + Math.round((bubbleArea.height - size) * yRatio) }, size);
        positionPopup();
        showEffects(state, state === 'mystery' ? 'A little thought for your day. Take a breath, stretch your shoulders, and enjoy a moment of company.' : 'You earned a little surprise. Click to unwrap ✨');
        await waitForBubble();
        const pet = avatar.getBounds(), frame = effects.getBounds();
        const body = await effects.webContents.executeJavaScript("(() => { const r = document.querySelector('#message').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()");
        const bubble = { ...body, x: frame.x + body.x, y: frame.y + body.y };
        if (!effects.isVisible() || (bubble.x < pet.x + pet.width && bubble.x + bubble.width > pet.x && bubble.y < pet.y + pet.height && bubble.y + bubble.height > pet.y)) throw new Error(`Bubble text overlaps pet: ${JSON.stringify({ size, state, pet, bubble })}`);
        const arrow = await effects.webContents.executeJavaScript("document.querySelector('#tail-fill').getAttribute('d').match(/-?\\d+(?:\\.\\d+)?/g).map(Number)");
        if (Math.abs(Math.hypot(arrow[2] - (arrow[0] + arrow[4]) / 2, arrow[3] - (arrow[1] + arrow[5]) / 2) - 8) > 1) throw new Error('Bubble arrow must stay short at every pet size');
        const tip = { x: frame.x + arrow[2], y: frame.y + arrow[3] };
        if (tip.x > pet.x - 3 && tip.x < pet.x + pet.width + 3 && tip.y > pet.y - 3 && tip.y < pet.y + pet.height + 3) throw new Error('Bubble arrow must leave a visible gap from the pet');
        const clipped = await effects.webContents.executeJavaScript("(() => { const r = document.querySelector('#message').getBoundingClientRect(); return r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight; })()");
        if (clipped) throw new Error('Bubble text must fit within the effects window');
      }
      hideEffects(); placeAvatar({ x: bubbleOrigin.x, y: bubbleOrigin.y }, 68);
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
      await waitForBubble();
      if (!encouragements.includes(await effects.webContents.executeJavaScript("document.querySelector('#message').textContent"))) throw new Error('Random halfway encouragement missing.');
      const halfwayFrame = effects.getBounds(), halfwayMenu = popup.getBounds();
      const halfwayBody = await effects.webContents.executeJavaScript("(() => { const r = document.querySelector('#message').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()");
      const halfwayBubble = { ...halfwayBody, x: halfwayFrame.x + halfwayBody.x, y: halfwayFrame.y + halfwayBody.y };
      if (!popup.isVisible() || (halfwayBubble.x < halfwayMenu.x + halfwayMenu.width && halfwayBubble.x + halfwayBubble.width > halfwayMenu.x && halfwayBubble.y < halfwayMenu.y + halfwayMenu.height && halfwayBubble.y + halfwayBubble.height > halfwayMenu.y)) throw new Error('Halfway bubble must stay clear of the open habit menu');
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
        for (let expected = 1; expected <= 3; expected++) {
          const current = [...document.querySelectorAll('.habit')].find(card => card.dataset.id === water.dataset.id);
          current.querySelector('button.count-slot:last-child').click();
          const until = Date.now() + 5000;
          while (document.querySelectorAll('.water-drops .is-filled').length !== expected || busy) {
            if (Date.now() > until) throw new Error('Each droplet click must add exactly one glass');
            await new Promise(resolve => setTimeout(resolve, 25));
          }
          const recorded = HabitDomain.todayEntries(await window.buddy.getState()).find(entry => entry.id === water.dataset.id);
          if (recorded.amount !== expected || recorded.amount >= recorded.goal || document.hidden) throw new Error('Clicking the last droplet must not complete water prematurely');
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
      cancelCelebration(); hideEffects(); stopRoll(); popup.hide();
      const reminderHabit = store.snapshot().habits.find(habit => !habit.archived && habit.name === 'Water');
      if (!showReminder(reminderHabit)) throw new Error('Buddy reminder bubble did not show');
      await waitForBubble();
      if (await effects.webContents.executeJavaScript('document.body.dataset.state') !== 'reminder') throw new Error('Wrong reminder bubble state');
      if (!(await effects.webContents.executeJavaScript("document.querySelector('#message').textContent")).includes('water break')) throw new Error('Gentle reminder wording missing');
      if (showReminder(reminderHabit)) throw new Error('Reminder bubbles must not overlap');
      fs.writeFileSync(path.join(captureDir, 'reminder-preview.png'), (await effects.webContents.capturePage()).toPNG());
      hideEffects();
      showPopup();
      let finalResult;
      for (const habit of store.snapshot().habits.filter(habit => !habit.archived)) finalResult = store.logProgress(habit.id, habit.goal);
      reactToProgress(finalResult, () => 0);
      if (reopenAfterCelebration || popup.isVisible()) throw new Error('Final habit must keep the menu closed');
      await new Promise(resolve => setTimeout(resolve, 3300));
      if (popup.isVisible()) throw new Error('Menu reopened after the final habit');
      if (await avatar.webContents.executeJavaScript('document.body.dataset.state') !== 'gift') throw new Error('All habits complete should reveal the gift');
      const preferredSize = store.snapshot().settings.avatarSize;
      if (Math.abs(avatar.getBounds().width - giftSize(preferredSize)) > 1) throw new Error('Earned present must be temporarily bigger');
      if (new Store(store.filePath).snapshot().settings.avatarSize !== preferredSize) throw new Error('Present must not overwrite preferred size');
      fs.writeFileSync(path.join(captureDir, 'gift-preview.png'), (await avatar.webContents.capturePage()).toPNG());
      await avatar.webContents.executeJavaScript("document.querySelector('#buddy').click()");
      await effects.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 120))');
      if (mysteryStatus(store.snapshot()).opened !== 1 || mysteryStatus(store.snapshot()).available) throw new Error('Mystery box was not consumed once');
      if (!popup.isVisible()) throw new Error('Reward view must open');
      if (await popup.webContents.executeJavaScript("document.querySelector('#reward').hidden")) throw new Error('Reward view is missing');
      const mysteryText = await popup.webContents.executeJavaScript("document.querySelector('#reward-text').textContent");
      const latestReward = store.snapshot().mystery.days[mysteryStatus(store.snapshot()).day].claims.at(-1);
      if (mysteryText !== latestReward.text) throw new Error('Reward text is incorrect');
      if (await avatar.webContents.executeJavaScript('document.body.dataset.state') !== 'gift') throw new Error('Gift must stay until reward closes');
      const repeatOpen = await popup.webContents.executeJavaScript('window.buddy.openMystery()');
      if (repeatOpen.opened || new Store(store.filePath).openMystery().opened) throw new Error('An opened box must not reopen after restart');
      fs.writeFileSync(path.join(captureDir, 'mystery-preview.png'), (await popup.webContents.capturePage()).toPNG());
      await popup.webContents.executeJavaScript("document.querySelector('#reward-close').click()");
      const greetingDeadline = Date.now() + 2000;
      while ((effectState !== 'greeting' || !effects.isVisible()) && Date.now() < greetingDeadline) await new Promise(resolve => setTimeout(resolve, 25));
      await waitForBubble();
      if (popup.isVisible() || await avatar.webContents.executeJavaScript('document.body.dataset.state') === 'gift') throw new Error('Closing the reward must bring the buddy back');
      if (Math.abs(avatar.getBounds().width - preferredSize) > 1) throw new Error('Buddy must return to preferred size');
      if (effectState !== 'greeting' || !effects.isVisible() || !(await effects.webContents.executeJavaScript("document.querySelector('#message').textContent"))) throw new Error('Reward close must show a time-of-day greeting');
      await new Promise(resolve => setTimeout(resolve, 200));
      fs.writeFileSync(path.join(captureDir, 'greeting-preview.png'), (await effects.webContents.capturePage()).toPNG());
      await new Promise(resolve => setTimeout(resolve, 3050));
      if (effects.isVisible() || effectState) throw new Error('Speech bubbles must dismiss after about three seconds');
      hideEffects();
      const thought = require('./thoughts').pool.find(item => item.answer);
      if (!showThought(thought, true) || !showThought(thought)) throw new Error('Daytime thought should appear in a quiet moment');
      await new Promise(resolve => setTimeout(resolve, 80));
      if (await effects.webContents.executeJavaScript("document.querySelector('#message').textContent") !== formatSurprise(thought)) throw new Error('Daytime thought lost its punchline');
      if (popup.isVisible() || showThought(thought, true)) throw new Error('Thoughts must use one bubble at a time');
      hideEffects();
      showPopup();
      const afterAdd = await popup.webContents.executeJavaScript("window.buddy.addHabit({ name: 'A little stretch', type: 'checkbox' })");
      if (mysteryStatus(afterAdd).available) throw new Error('New habit must be complete before another box is earned');
      const added = afterAdd.habits.find(habit => habit.name === 'A little stretch');
      await popup.webContents.executeJavaScript(`window.buddy.logProgress('${added.id}', 1)`);
      cancelCelebration(); hideEffects(); stopRoll(); avatar.webContents.send('avatar:reaction', { state: 'idle' });
      await new Promise(resolve => setTimeout(resolve, 80));
      if (await avatar.webContents.executeJavaScript('document.body.dataset.state') !== 'gift') throw new Error('Completing the new habit must earn another box');
      await avatar.webContents.executeJavaScript("document.querySelector('#buddy').click()");
      await new Promise(resolve => setTimeout(resolve, 80));
      if (mysteryStatus(store.snapshot()).opened !== 2 || mysteryStatus(store.snapshot()).available) throw new Error('Second mystery box lifecycle failed');
      if (!popup.isVisible()) throw new Error('Second reward view must open');
      await runShopSmoke({ avatar, popup, store, closeReward, hideEffects, broadcast, showPopup }, captureDir);
      console.log('SMOKE TEST PASSED: habits, reactions, speech bubbles, rewards, shop preview and purchases, mix-and-match outfits on all buddies, and collection persistence.');
      app.quit();
    }
  }).catch(error => {
    console.error(error);
    if (!smokeTest) dialog.showErrorBox('Habit Buddy needs a moment', error.message);
    app.exit(1);
  });
}
