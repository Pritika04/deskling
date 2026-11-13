'use strict';
window.createProgressView = function ({ getState, onAdd }) {
  const q = selector => document.querySelector(selector);
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const at = key => new Date(`${key}T12:00:00`);
  const fullDate = key => new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(at(key));
  const dates = (start, end) => start === end ? fullDate(start) : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).formatRange(at(start), at(end));
  let habitId = null, range = 'week', offset = 0, selected = null, model = null;
  const amount = value => `${HabitProgress.format(value)}${model.unit ? ` ${model.unit}` : ' logged'}`;
  function detail(point) {
    const label = dates(point.start, point.end);
    if (point.future) return `${label} · Yet to come.`;
    if (point.untracked) return `${label} · No comparable history yet.`;
    if (range === 'quarter') return `${label} · Goal met on ${point.completed} ${point.completed === 1 ? 'day' : 'days'} this month${point.end >= model.today ? ' so far' : ''}${model.habit.type === 'minutes' ? ` · ${amount(point.total)} in total` : ''}. Open this month to see its days.`;
    if (model.habit.type === 'checkbox') return `${label} · ${point.completed ? 'Completed.' : 'Not checked off.'}`;
    return `${label} · ${amount(point.value)} · Goal: ${HabitProgress.format(point.goal)}`;
  }
  function select(index) {
    selected = index;
    q('#progress-detail').textContent = index === null ? '' : detail(model.points[index]);
    q('#progress-chart').querySelectorAll('.progress-point').forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }
  function render(state = getState()) {
    if (!state) return;
    const habits = state.habits.filter(habit => !habit.archived);
    q('#progress-empty').hidden = habits.length > 0;
    q('#progress-content').hidden = habits.length === 0;
    if (!habits.length) { habitId = null; model = null; return; }
    if (!habits.some(habit => habit.id === habitId)) { habitId = habits[0].id; selected = null; }
    const picker = q('#progress-habit');
    const signature = JSON.stringify(habits.map(habit => [habit.id, habit.name]));
    if (picker.dataset.options !== signature) {
      picker.replaceChildren(...habits.map(habit => { const option = element('option', habit.name); option.value = habit.id; return option; }));
      picker.dataset.options = signature;
    }
    picker.value = habitId;
    model = HabitProgress.buildProgress(state, habitId, range, offset);
    const chart = q('#progress-chart');
    const focused = document.activeElement?.closest('.progress-point')?.dataset.point;
    chart.replaceChildren();
    chart.className = range === 'month' ? 'progress-calendar' : range === 'quarter' ? 'progress-months' : model.habit.type === 'checkbox' ? 'progress-days' : 'progress-bars';
    chart.style.gridTemplateColumns = `repeat(${range === 'month' ? 7 : range === 'quarter' ? 1 : model.points.length}, minmax(0, 1fr))`;
    chart.setAttribute('aria-label', `${model.habit.name}: ${range === 'quarter' ? 'monthly summaries' : 'daily progress'}`);
    q('#progress-range').textContent = range === 'month' ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(at(model.start)) : dates(model.start, model.end);
    q('#progress-previous').disabled = !model.previousAvailable;
    q('#progress-next').disabled = offset === 0;
    q('#progress-chart-caption').textContent = range === 'month' ? 'Tap a date for its exact log · ✓ goal met' : range === 'quarter' ? 'Progress toward each full month · tap for dates' : model.habit.type === 'checkbox' ? 'Days you checked off' : `Daily progress${model.unit ? ` · ${model.unit}` : ''}`;
    document.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.period === range)));
    const max = model.maximum * 1.15;
    if (model.guide !== null && chart.className === 'progress-bars') {
      const guide = element('div', undefined, 'progress-goal');
      guide.style.top = `${14 + 128 * (1 - model.guide / max)}px`;
      guide.setAttribute('aria-hidden', 'true');
      guide.append(element('span', `Goal: ${HabitProgress.format(model.guide)}`)); chart.append(guide);
    }
    if (range === 'month') {
      for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) { const header = element('span', label, 'progress-weekday'); header.setAttribute('aria-hidden', 'true'); chart.append(header); }
      for (let i = 0; i < (at(model.start).getDay() + 6) % 7; i++) { const blank = element('span'); blank.setAttribute('aria-hidden', 'true'); chart.append(blank); }
    }
    model.points.forEach((point, index) => {
      const button = element('button', undefined, `progress-point${point.future ? ' is-future' : point.untracked ? ' is-untracked' : ''}`);
      button.type = 'button'; button.dataset.point = index;
      button.setAttribute('aria-label', detail(point)); button.setAttribute('aria-pressed', 'false'); button.title = detail(point);
      if (range === 'quarter') {
        button.classList.add('progress-month-card');
        const current = point.start <= model.today && point.end >= model.today;
        button.append(element('span', `${new Intl.DateTimeFormat(undefined, { month: 'long' }).format(at(point.start))}${current ? ' so far' : ''}`, 'progress-month-name'));
        button.append(element('span', point.untracked ? '—' : `${point.consistency}%`, 'progress-month-value'));
        const track = element('span', undefined, 'progress-consistency-track'), fill = element('span');
        fill.style.width = `${point.consistency || 0}%`; track.append(fill); button.append(track);
        button.append(element('span', point.untracked ? 'No history yet' : `Goal met on ${point.completed} ${point.completed === 1 ? 'day' : 'days'} this month`, 'progress-month-note'));
      } else if (range === 'month') {
        button.classList.add('progress-calendar-day'); button.classList.toggle('is-complete', point.completed === 1);
        if (point.start === model.today) { button.classList.add('is-today'); button.setAttribute('aria-current', 'date'); }
        button.append(element('span', String(at(point.start).getDate())));
        if (point.completed) button.append(element('span', '✓', 'progress-calendar-mark'));
        if (model.habit.type !== 'checkbox' && point.value > 0) { const meter = element('span', undefined, 'progress-calendar-meter'); meter.style.width = `${Math.min(100, point.value / point.goal * 100)}%`; button.append(meter); }
      } else if (chart.className === 'progress-days') {
        button.classList.toggle('is-complete', point.completed === 1);
        button.append(element('span', point.completed ? '✓' : point.untracked ? '–' : '', 'progress-day-square'));
      } else {
        const slot = element('span', undefined, 'progress-slot');
        const fill = element('span', undefined, 'progress-fill'); fill.style.height = `${point.value === null ? 0 : Math.max(0, point.value / max * 100)}%`;
        slot.append(fill); button.append(slot);
      }
      if (range === 'week') { const tick = element('span', new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(at(point.start)), 'progress-tick'); tick.setAttribute('aria-hidden', 'true'); button.append(tick); }
      button.addEventListener('click', () => {
        if (range !== 'quarter') { select(index); return; }
        const target = at(point.start), current = at(model.today);
        offset = (target.getFullYear() - current.getFullYear()) * 12 + target.getMonth() - current.getMonth();
        range = 'month'; selected = null; render();
      });
      chart.append(button);
    });
    if (selected !== null && selected >= model.points.length) selected = null;
    select(selected);
    const completed = `Goal met on ${model.completed} ${model.completed === 1 ? 'day' : 'days'}`;
    q('#progress-summary').textContent = !model.eligible ? 'No history in this period yet' : `${completed}${model.habit.type === 'minutes' ? ` · ${amount(model.total)} in total` : ''}`;
    q('#progress-insight').textContent = range === 'quarter' ? `Longest run: ${model.longestRun} ${model.longestRun === 1 ? 'day' : 'days'} in a row.` : model.insight;
    q('#progress-insight').hidden = range === 'month' || range === 'quarter' && !model.eligible;
    if (focused !== undefined) chart.querySelector(`[data-point="${focused}"]`)?.focus({ preventScroll: true });
  }
  q('#progress-habit').addEventListener('change', event => { habitId = event.target.value; offset = 0; selected = null; render(); });
  document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => { range = button.dataset.period; offset = 0; selected = null; render(); }));
  q('#progress-previous').addEventListener('click', () => { offset--; selected = null; render(); });
  q('#progress-next').addEventListener('click', () => { offset = Math.min(0, offset + 1); selected = null; render(); });
  q('#progress-add').addEventListener('click', onAdd);
  q('#progress-chart').addEventListener('keydown', event => {
    const button = event.target.closest('.progress-point');
    const moves = { ArrowLeft: -1, ArrowRight: 1, ...(range === 'month' ? { ArrowUp: -7, ArrowDown: 7 } : {}) };
    if (!button || !Object.hasOwn(moves, event.key)) return;
    event.preventDefault(); const index = Math.max(0, Math.min(model.points.length - 1, Number(button.dataset.point) + moves[event.key]));
    q('#progress-chart').querySelector(`[data-point="${index}"]`).focus(); if (range !== 'quarter') select(index);
  });
  return { render };
};
