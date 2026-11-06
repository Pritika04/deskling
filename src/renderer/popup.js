'use strict';
const $ = selector => document.querySelector(selector);
let state;
let editing = null;
let busy = false;
let calendarMode = 'month';
let draggedHabit = null;
let currentView = 'home';
let homeScroll = 0;
let bannerMessage = '';
let renderedDay = null;
let editingCompletedMinutes = null;
const clockSync = [];
function syncClocks() { clockSync.forEach(sync => sync()); }
function showView(view) {
  const scroller = document.querySelector('main');
  if (currentView === 'home') homeScroll = scroller.scrollTop;
  currentView = view;
  document.querySelectorAll('[data-home]').forEach(element => { element.hidden = view !== 'home'; });
  $('#settings').hidden = view !== 'settings'; $('#editor').hidden = view !== 'editor';
  $('#settings-toggle').hidden = view !== 'home'; $('#back-home').hidden = view === 'home';
  $('#settings-toggle').setAttribute('aria-expanded', String(view === 'settings'));
  scroller.scrollTo(0, view === 'home' ? homeScroll : 0);
  message('');
}
function refreshBanner() {
  const data = state ? HabitDomain.summary(state) : null;
  const halfway = data?.entries.some(entry => entry.amount >= entry.goal / 2 && entry.amount < entry.goal);
  $('#status').textContent = bannerMessage || (data?.allComplete ? 'Lovely. All done for today.' : halfway ? "You're halfway there. One little step at a time." : data?.progress ? 'A little progress, and it counts.' : 'Just on this device. Just for you.');
}
function message(text) { bannerMessage = text || ''; refreshBanner(); }
function progressMessage(result) { message(result.completed ? result.allComplete ? 'Lovely. All done for today.' : 'A little win. Nicely done.' : result.halfway ? "You're halfway there!" : 'A little progress, and it counts.'); }
async function perform(action) {
  try { return await action(); }
  catch (error) { message(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); return null; }
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function progressRing(amount, goal) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 28 28'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('progress-ring');
  for (const className of ['ring-track', 'ring-fill']) {
    const circle = document.createElementNS(namespace, 'circle');
    circle.setAttribute('cx', '14'); circle.setAttribute('cy', '14'); circle.setAttribute('r', '11'); circle.setAttribute('pathLength', '100'); circle.classList.add(className);
    if (className === 'ring-fill') circle.setAttribute('stroke-dasharray', `${Math.min(100, amount / goal * 100)} 100`);
    svg.append(circle);
  }
  return svg;
}
function countControl(habit, amount, log) {
  const water = /water|hydrat|glass|bottle/i.test(`${habit.name} ${habit.unit || ''}`);
  const dots = Number.isInteger(habit.goal) && habit.goal <= 12;
  const control = node('div', undefined, dots ? `count-dots${water ? ' water-drops' : ''}` : 'count-meter');
  const description = `${habit.name}: ${amount} of ${habit.goal}${habit.unit ? ` ${habit.unit}` : ''}`;
  control.setAttribute('role', 'group'); control.setAttribute('aria-label', description); control.title = description;
  if (dots) {
    for (let index = 0; index < habit.goal; index++) {
      const filled = index < amount;
      const slot = node(log && !filled ? 'button' : 'span', undefined, `count-slot${filled ? ' is-filled' : ''}`);
      if (log && !filled) {
        slot.type = 'button'; slot.title = `Record ${index + 1}${habit.unit ? ` ${habit.unit}` : ''}`;
        slot.setAttribute('aria-label', `Set ${habit.name} to ${index + 1} of ${habit.goal}`);
        slot.addEventListener('click', () => log(index + 1 - amount, slot));
      } else slot.setAttribute('aria-hidden', 'true');
      if (water) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 16 20'); svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M8 1C7 4 2 8 2 12a6 6 0 0 0 12 0C14 8 9 4 8 1Z'); svg.append(path); slot.append(svg);
      } else slot.append(node('span', undefined, 'count-dot-shape'));
      control.append(slot);
    }
  } else {
    const button = node(log ? 'button' : 'span', undefined, 'count-bar-button');
    const track = node('span', undefined, 'count-bar-track'), fill = node('span', undefined, 'count-bar-fill');
    fill.style.width = `${Math.min(100, amount / habit.goal * 100)}%`; track.append(fill); button.append(track);
    if (log) {
      button.type = 'button'; button.append(node('span', '+', 'count-bar-plus'));
      button.setAttribute('aria-label', `Add one to ${habit.name}. ${amount} of ${habit.goal} recorded`);
      button.addEventListener('click', () => log(Math.min(1, habit.goal - amount), button));
    }
    control.append(button);
  }
  return control;
}
async function logCount(habit, amount, button) {
  if (busy) return;
  busy = true; button.disabled = true;
  try {
    const result = await perform(() => window.buddy.logProgress(habit.id, amount));
    if (result) { render(result.state); progressMessage(result); }
    else button.disabled = false;
  } finally { busy = false; }
}
function render(next = state) {
  if (!next) return;
  state = next;
  BuddyTheme.apply(state.settings);
  const now = new Date();
  const data = HabitDomain.summary(state, now);
  if (renderedDay && renderedDay !== data.today) { bannerMessage = ''; editingCompletedMinutes = null; }
  renderedDay = data.today;
  $('#date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${data.today}T12:00:00`));
  const habits = HabitDomain.orderedHabits(state, now);
  const completedIds = new Set(habits.filter(habit => (data.entries.find(entry => entry.id === habit.id)?.amount || 0) >= habit.goal).map(habit => habit.id));
  $('#empty').hidden = habits.length > 0;
  $('#habit-section').hidden = habits.length === 0;
  $('#pending-title').textContent = 'Habits';
  const list = $('#habit-list'); list.replaceChildren();
  for (const habit of habits) {
    const amount = data.entries.find(item => item.id === habit.id)?.amount || 0;
    const complete = amount >= habit.goal;
    const row = node('article', undefined, `habit${complete ? ' is-complete' : ''}`); row.dataset.id = habit.id;
    row.draggable = true;
    if (complete) row.title = 'Lovely. All done';
    const heading = node('div', undefined, 'habit-heading');
    const handle = node('button', complete ? '✓' : '', `reorder-handle${complete ? ' done done-mark' : ''}`);
    handle.draggable = true;
    handle.title = 'Drag to reorder, or use the up and down arrow keys';
    handle.setAttribute('aria-label', `Reorder ${habit.name}. Drag, or use up and down arrows.`);
    if (complete && habit.type === 'minutes') {
      handle.title = 'Done for today. Click to adjust minutes, or drag to reorder.';
      handle.addEventListener('click', () => {
        editingCompletedMinutes = habit.id; render(state);
        const input = [...document.querySelectorAll('.habit')].find(card => card.dataset.id === habit.id)?.querySelector('.minutes-form input');
        input?.focus(); input?.select();
      });
    }
    row.addEventListener('dragstart', event => {
      if (event.target.closest('input, select, textarea, .habit-actions, .icon, .count-dots, .count-meter')) { event.preventDefault(); return; }
      draggedHabit = habit.id; event.dataTransfer.setData('text/plain', habit.id); event.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => { draggedHabit = null; row.classList.remove('dragging'); document.querySelectorAll('.drop-target').forEach(item => item.classList.remove('drop-target')); });
    handle.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const group = habits.filter(item => completedIds.has(item.id) === complete);
      const index = group.findIndex(item => item.id === habit.id);
      const neighbor = group[index + (event.key === 'ArrowUp' ? -1 : 1)];
      if (neighbor) moveHabit(habit.id, neighbor.id, event.key === 'ArrowDown');
    });
    row.addEventListener('dragover', event => { if (draggedHabit && draggedHabit !== habit.id && completedIds.has(draggedHabit) === complete) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; row.classList.add('drop-target'); } });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', event => {
      event.preventDefault(); row.classList.remove('drop-target');
      if (draggedHabit && completedIds.has(draggedHabit) === complete) moveHabit(draggedHabit, habit.id, habits.findIndex(item => item.id === draggedHabit) < habits.findIndex(item => item.id === habit.id));
      draggedHabit = null;
    });
    heading.append(handle);
    heading.append(node('span', habit.name, 'habit-name'));
    const edit = node('button', '···', 'icon'); edit.setAttribute('aria-label', `Edit ${habit.name}`);
    edit.addEventListener('click', () => openEditor(habit)); heading.append(edit);
    const info = node('div', undefined, 'habit-progress');
    if (habit.type === 'count' && !complete) info.append(countControl(habit, amount, (increment, button) => logCount(habit, increment, button)));
    const actions = node('div', undefined, 'habit-actions');
    if (habit.type === 'minutes' && (!complete || editingCompletedMinutes === habit.id)) {
      const minutesForm = node('form', undefined, 'minutes-form');
      const total = node('input'); total.type = 'number'; total.min = '0'; total.step = 'any'; total.value = amount;
      total.setAttribute('aria-label', `Total minutes spent on ${habit.name} today`);
      total.title = 'Edit your minutes here. Press Enter or click away to save.'; total.required = true;
      minutesForm.append(progressRing(amount, habit.goal), total, node('span', `/ ${habit.goal} min`, 'muted'));
      let saving = false;
      const commitMinutes = async () => {
        if (saving || busy || !total.checkValidity() || Number(total.value) === amount) return;
        busy = true; saving = true;
        try {
          const result = await perform(() => window.buddy.setMinutes(habit.id, Number(total.value)));
          if (result) { editingCompletedMinutes = null; render(result.state); progressMessage(result); }
        } finally { busy = false; saving = false; }
      };
      minutesForm.addEventListener('submit', event => { event.preventDefault(); commitMinutes(); });
      total.addEventListener('change', commitMinutes);
      total.addEventListener('blur', () => {
        if (complete && !saving && Number(total.value) === amount) { editingCompletedMinutes = null; render(state); }
        else commitMinutes();
      });
      total.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); total.value = amount; total.blur(); editingCompletedMinutes = null; render(state); } });
      info.append(minutesForm);
    }
    if (habit.type === 'checkbox' && !complete) {
      const button = node('button', 'Done'); button.setAttribute('aria-label', `Complete ${habit.name}`);
      button.addEventListener('click', () => logCount(habit, 1, button)); actions.append(button);
    }
    if (actions.childElementCount) info.append(actions);
    row.append(heading, info);
    list.append(row);
  }
  renderCalendar(data);
  $('#avatar-choice').value = state.settings.avatar; $('#palette').value = state.settings.palette;
  $('#accent').value = state.settings.accent || BuddyTheme.colors[state.settings.palette];
  refreshBanner();
}
async function moveHabit(id, targetId, after = false) {
  const ids = state.habits.filter(habit => !habit.archived).map(habit => habit.id);
  const index = ids.indexOf(id);
  if (index < 0 || !ids.includes(targetId) || id === targetId || busy) return;
  ids.splice(index, 1); ids.splice(ids.indexOf(targetId) + (after ? 1 : 0), 0, id); busy = true;
  try {
    const result = await perform(() => window.buddy.reorderHabits(ids));
    if (result) { render(result); [...document.querySelectorAll('.habit')].find(row => row.dataset.id === id)?.querySelector('.reorder-handle').focus(); }
  } finally { busy = false; }
}
function renderCalendar(data) {
  const calendar = HabitDomain.calendar(state, calendarMode);
  $('#calendar-title').textContent = calendar.title;
  $('#month-caption').textContent = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(`${data.today}T12:00:00`));
  $('#calendar-toggle').textContent = calendarMode === 'month' ? 'See whole year' : 'Back to this month';
  $('#streak-caption').textContent = data.current ? `${data.current} ${data.current === 1 ? 'day' : 'days'} of completing your habits. A lovely little rhythm.` : 'Each day is a fresh start.';
  $('#calendar-weekdays').hidden = calendarMode === 'year';
  const heatmap = $('#heatmap'); heatmap.replaceChildren();
  heatmap.classList.toggle('year', calendarMode === 'year');
  heatmap.style.setProperty('--weeks', calendar.cells.length / 7);
  heatmap.setAttribute('aria-label', `${calendar.title} habit progress`);
  for (const day of calendar.cells) {
    const cell = node('div', calendarMode === 'month' ? String(Number(day.day.slice(-2))) : undefined, `day${day.day === data.today ? ' today' : ''}`);
    cell.dataset.level = day.level; cell.dataset.outside = day.outside; cell.dataset.future = day.future;
    cell.title = day.future ? `${day.day}: a fresh day ahead` : `${day.day}: ${day.completed} of ${day.total} complete${day.progress ? ' · a little progress' : ''}`;
    cell.setAttribute('aria-label', cell.title); if (!day.outside && !day.future) cell.tabIndex = 0; heatmap.append(cell);
  }
  const months = $('#year-months'); months.hidden = calendarMode !== 'year'; months.replaceChildren();
  months.style.setProperty('--weeks', calendar.cells.length / 7);
  if (calendarMode === 'year') calendar.cells.forEach((day, index) => {
    if (day.day.endsWith('-01') && !day.outside) {
      const month = node('span', new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(`${day.day}T12:00:00`)));
      month.style.gridColumn = String(Math.floor(index / 7) + 1); months.append(month);
    }
  });
}
function typeChanged() {
  const type = $('#habit-type').value;
  const hasGoal = ['count', 'minutes'].includes(type); $('#goal-fields').hidden = !hasGoal;
  $('#habit-goal').required = hasGoal; $('#habit-goal').disabled = !hasGoal; $('#habit-goal').max = '100000';
  $('#habit-unit').hidden = type !== 'count'; $('#goal-unit').hidden = type === 'count';
  $('#goal-unit').textContent = type === 'minutes' ? 'minutes' : '';
  $('#goal-label').textContent = type === 'minutes' ? 'How many minutes would you like to make time for?' : 'How many each day?';
  $('#goal-help').textContent = type === 'minutes' ? 'Set a gentle daily aim. You can enter and edit your actual minutes anytime.' : 'For example, 8 glasses of water. Each tap logs one glass.';
  document.querySelectorAll('[data-type]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.type === type)));
  previewHabit();
}
function previewHabit() {
  const type = $('#habit-type').value;
  const name = $('#habit-name').value.trim() || 'Your habit';
  const goal = Number($('#habit-goal').value) || 1;
  const preview = $('#habit-preview');
  preview.replaceChildren(node('span', 'Your habit will look like this', 'muted small'), node('strong', name));
  const line = node('div', undefined, 'preview-line');
  if (type === 'checkbox') line.append(node('span', '☐ Done for today'));
  else if (type === 'minutes') {
    const minutes = node('span', undefined, 'preview-minutes'); minutes.append(progressRing(0, goal), node('span', '0', 'preview-field'), node('span', `/ ${goal} min`));
    line.append(minutes, node('span', 'Tap the number to edit', 'muted small'));
  } else {
    line.append(countControl({ name, goal, unit: $('#habit-unit').value }, 0, null));
  }
  preview.append(line);
}
function reminderChanged() {
  const mode = $('#reminder-mode').value;
  $('#reminder-controls').hidden = mode === 'off'; $('#repeat-controls').hidden = mode !== 'repeat';
  $('#reminder-time-label').textContent = mode === 'repeat' ? 'Starting at' : 'At';
  syncClocks();
}
function openEditor(habit = null) {
  editing = habit?.id || null; showView('editor');
  $('#form-title').textContent = habit ? 'A little adjustment' : 'A small new habit';
  $('#habit-name').value = habit?.name || ''; $('#habit-type').value = habit?.type || 'count'; $('#habit-goal').value = habit?.goal || 8; $('#habit-unit').value = habit?.unit || '';
  $('#reminder-mode').value = habit?.reminder?.mode || (habit?.reminderTimes?.length ? 'daily' : 'off');
  $('#reminder-time').value = habit?.reminder?.time || habit?.reminderTimes?.[0] || '09:00'; $('#reminder-until').value = habit?.reminder?.until || '20:00'; $('#reminder-frequency').value = habit?.reminder?.everyMinutes || 120;
  $('#remove-habit').hidden = !habit; $('#edit-note').hidden = !habit;
  typeChanged(); reminderChanged(); $('#habit-name').focus({ preventScroll: true });
}
$('#first-habit').addEventListener('click', () => openEditor()); $('#add-habit').addEventListener('click', () => openEditor());
$('#cancel-edit').addEventListener('click', () => { editing = null; showView('home'); });
$('#habit-type').addEventListener('change', typeChanged);
document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
  const type = button.dataset.type;
  if ($('#habit-type').value !== type) $('#habit-goal').value = { count: 8, checkbox: 1, minutes: 15 }[type];
  $('#habit-type').value = type; typeChanged();
}));
for (const selector of ['#habit-name', '#habit-goal', '#habit-unit']) $(selector).addEventListener('input', previewHabit);
$('#reminder-mode').addEventListener('change', reminderChanged);
$('#calendar-toggle').addEventListener('click', () => { calendarMode = calendarMode === 'month' ? 'year' : 'month'; renderCalendar(HabitDomain.summary(state)); });
$('#habit-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const mode = $('#reminder-mode').value;
  const reminder = mode === 'off' ? null : { mode, time: $('#reminder-time').value };
  if (mode === 'repeat') Object.assign(reminder, { everyMinutes: Number($('#reminder-frequency').value), until: $('#reminder-until').value });
  const data = { name: $('#habit-name').value.trim(), type: $('#habit-type').value, goal: Number($('#habit-goal').value), unit: $('#habit-type').value === 'count' ? $('#habit-unit').value : '', reminder };
  busy = true;
  try { const result = await perform(() => editing ? window.buddy.editHabit(editing, data) : window.buddy.addHabit(data));
    if (result) { render(result); editing = null; showView('home'); }
  } finally { busy = false; }
});
$('#remove-habit').addEventListener('click', async () => {
  if (busy || !editing) return; busy = true;
  try { const result = await perform(() => window.buddy.archiveHabit(editing));
    if (result) { render(result); editing = null; showView('home'); }
  } finally { busy = false; }
});
$('#settings-toggle').addEventListener('click', () => { showView('settings'); $('#avatar-choice').focus({ preventScroll: true }); });
$('#back-home').addEventListener('click', () => { editing = null; showView('home'); });
$('#settings-done').addEventListener('click', () => showView('home'));
for (const [selector, key, getValue] of [
  ['#avatar-choice', 'avatar', element => element.value], ['#palette', 'palette', element => element.value],
  ['#accent', 'accent', element => element.value],
]) $(selector).addEventListener('change', async event => {
  const patch = { [key]: getValue(event.target) }; if (key === 'palette') patch.accent = null;
  const result = await perform(() => window.buddy.updateSettings(patch)); render(result || state);
});
$('#reset-accent').addEventListener('click', async () => { const result = await perform(() => window.buddy.updateSettings({ accent: null })); if (result) render(result); });
$('#close').addEventListener('click', () => window.buddy.closePopup());
document.addEventListener('keydown', event => { if (event.key === 'Escape') {
  if (currentView !== 'home') { editing = null; showView('home'); } else window.buddy.closePopup();
} });
function makeClock(containerSelector, sourceSelector, label) {
  const container = $(containerSelector), source = $(sourceSelector);
  const svgNS = 'http://www.w3.org/2000/svg';
  const clock = document.createElementNS(svgNS, 'svg'); clock.setAttribute('viewBox', '0 0 32 32'); clock.setAttribute('aria-hidden', 'true'); clock.classList.add('clock-face');
  const circle = document.createElementNS(svgNS, 'circle'); circle.setAttribute('cx', '16'); circle.setAttribute('cy', '16'); circle.setAttribute('r', '13');
  const hourHand = document.createElementNS(svgNS, 'path'); hourHand.setAttribute('d', 'M16 16V9');
  const minuteHand = document.createElementNS(svgNS, 'path'); minuteHand.setAttribute('d', 'M16 16V6');
  clock.append(circle, hourHand, minuteHand); container.append(clock);
  const fields = {}, periods = {};
  const getMinutes = () => { const [hour, minute] = source.value.split(':').map(Number); return hour * 60 + minute; };
  const setMinutes = value => {
    const time = (value + 1440) % 1440;
    source.value = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
    source.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const sync = () => {
    const time = getMinutes(), hour = Math.floor(time / 60), minute = time % 60;
    fields.hour.value = String(hour % 12 || 12).padStart(2, '0'); fields.minute.value = String(minute).padStart(2, '0');
    periods.AM.setAttribute('aria-pressed', String(hour < 12)); periods.PM.setAttribute('aria-pressed', String(hour >= 12));
    hourHand.setAttribute('transform', `rotate(${(hour % 12) * 30 + minute / 2} 16 16)`); minuteHand.setAttribute('transform', `rotate(${minute * 6} 16 16)`);
  };
  for (const [index, field] of ['hour', 'minute'].entries()) {
    if (index) container.append(node('span', ':', 'clock-colon'));
    const stepper = node('div', undefined, 'clock-stepper');
    const input = node('input'); input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 2; input.autocomplete = 'off';
    input.setAttribute('aria-label', `${label} ${field}`); fields[field] = input;
    const up = node('button', '⌃'), down = node('button', '⌄');
    for (const [button, delta, direction] of [[up, 1, 'Increase'], [down, -1, 'Decrease']]) {
      button.type = 'button'; button.setAttribute('aria-label', `${direction} ${label.toLowerCase()} ${field}`);
      button.addEventListener('click', () => setMinutes(getMinutes() + delta * (field === 'hour' ? 60 : 1)));
    }
    const commit = () => {
      const value = Number(input.value);
      if (!/^\d{1,2}$/.test(input.value) || value < (field === 'hour' ? 1 : 0) || value > (field === 'hour' ? 12 : 59)) { sync(); return; }
      const time = getMinutes();
      setMinutes(field === 'hour' ? ((value % 12) + (time >= 720 ? 12 : 0)) * 60 + time % 60 : Math.floor(time / 60) * 60 + value);
    };
    input.addEventListener('change', commit); input.addEventListener('blur', sync); input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', event => {
      if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setMinutes(getMinutes() + (event.key === 'ArrowUp' ? 1 : -1) * (field === 'hour' ? 60 : 1)); }
      if (event.key === 'Enter') { event.preventDefault(); commit(); input.blur(); }
    });
    stepper.append(up, input, down); container.append(stepper);
  }
  const period = node('div', undefined, 'clock-period');
  for (const name of ['AM', 'PM']) {
    const button = node('button', name); button.type = 'button'; button.setAttribute('aria-label', `${label} ${name}`); periods[name] = button;
    button.addEventListener('click', () => setMinutes(getMinutes() % 720 + (name === 'PM' ? 720 : 0))); period.append(button);
  }
  container.append(period); source.addEventListener('change', sync); clockSync.push(sync); sync();
}
makeClock('#reminder-clock', '#reminder-time', 'Reminder');
makeClock('#until-clock', '#reminder-until', 'End time');
let fitTimer;
function scheduleFit() {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    const height = document.querySelector('header').getBoundingClientRect().height + document.querySelector('main').scrollHeight + document.querySelector('footer').getBoundingClientRect().height + 2;
    window.buddy.fitPopup(Math.ceil(height));
  }, 40);
}
const fitObserver = new ResizeObserver(scheduleFit);
for (const selector of ['header', 'main', 'footer']) fitObserver.observe(document.querySelector(selector));
const contentObserver = new MutationObserver(scheduleFit);
contentObserver.observe(document.querySelector('main'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
window.buddy.onState(render);
window.buddy.getState().then(next => { render(next); document.body.dataset.ready = 'true'; }).catch(() => message('Could not read your local data. Please restart your buddy.'));
setInterval(() => { if (!draggedHabit && !document.activeElement.closest('.minutes-form')) render(); }, 30000);
