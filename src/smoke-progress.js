'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { localDay, shiftDay } = require('./renderer/domain');

async function runProgressSmoke({ store, popup, showPopup, broadcast, captureDir }) {
  const original = store.snapshot();
  const read = expression => popup.webContents.executeJavaScript(expression);
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  try {
    const fixture = store.snapshot(), today = localDay(new Date(), fixture.settings.dayStartHour);
    fixture.settings.hatched = true;
    const habits = [
      { id: 'progress-water', name: 'Drink water', type: 'count', goal: 8, unit: 'glasses', archived: false, createdDay: shiftDay(today, -100) },
      { id: 'progress-reading', name: 'Read a few pages', type: 'minutes', goal: 15, unit: '', archived: false, createdDay: shiftDay(today, -100) },
      { id: 'progress-stretch', name: 'A little stretch', type: 'checkbox', goal: 1, unit: '', archived: false, createdDay: shiftDay(today, -100) },
    ];
    fixture.habits = habits; fixture.days = {};
    for (let i = -100; i <= 0; i++) fixture.days[shiftDay(today, i)] = habits.map((habit, index) => ({ ...habit, amount: index === 0 ? Math.min(habit.goal, (i + 105) % 10) : index === 1 ? (i + 105) % 22 : (i + 105) % 3 ? 1 : 0 }));
    store.commit(fixture); broadcast(); showPopup(); await pause();
    await read("document.querySelector('#progress-toggle').click()"); await pause();
    if (!await read("!document.querySelector('#progress').hidden && document.querySelector('#today').hidden && document.querySelector('#settings').hidden && document.querySelector('#collection').hidden && document.querySelector('#progress-chart').querySelectorAll('.progress-point').length === 7")) throw new Error('Progress must be a separate daily view with seven days');
    if (!await read("!document.querySelector('#progress-summary').textContent.includes('total') && !document.querySelector('#progress-insight').textContent.includes('Highest daily log')")) throw new Error('Count weeks should show completion days and a simple highlight, without totals');
    await read("document.querySelectorAll('#progress-chart .progress-point')[0].click()");
    if (!await read("document.querySelector('#progress-detail').textContent.includes('glasses') && document.querySelectorAll('#progress-chart [aria-pressed=true]').length === 1")) throw new Error('Chart points need exact, tappable details');
    await read("document.querySelector('.progress-point').focus();document.querySelector('.progress-point').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
    if (!await read("document.activeElement.dataset.point === '1' && document.activeElement.getAttribute('aria-pressed') === 'true'")) throw new Error('Chart points need keyboard navigation');
    await read("document.querySelector('[data-period=month]').click()");
    if (!await read("document.querySelectorAll('.progress-calendar-day').length >= 28 && document.querySelectorAll('.progress-calendar-day').length <= 31 && document.querySelectorAll('.progress-weekday').length === 7")) throw new Error('Month must show calendar dates with weekday headers');
    await read("document.querySelector('.progress-calendar-day').click()");
    if (!await read("document.querySelector('#progress-detail').textContent.includes('glasses') && !document.querySelector('#progress-content').textContent.includes('average')")) throw new Error('Calendar dates need exact logs without averages');
    if (!await read("document.querySelector('#progress-summary').textContent.startsWith('Goal met on') && !document.querySelector('#progress-summary').textContent.includes('total')")) throw new Error('Month must show goal completion days without count totals');
    await pause(); fs.writeFileSync(path.join(captureDir, 'progress-month-preview.png'), (await popup.webContents.capturePage()).toPNG());
    await read("document.querySelector('[data-period=quarter]').click()");
    if (!await read("document.querySelectorAll('.progress-month-card').length === 3 && document.querySelector('#progress-next').disabled")) throw new Error('Three months must have three monthly summaries and prevent future navigation');
    if (!await read("document.querySelectorAll('.progress-consistency-track').length === 3 && document.querySelector('.progress-month-value').textContent.includes('%') && document.querySelector('#progress-insight').textContent.includes('Longest run')")) throw new Error('Three months needs consistency comparisons and a longest-run statistic');
    await read("document.querySelector('.progress-month-card').click()");
    if (!await read("document.querySelector('[data-period=month]').getAttribute('aria-pressed') === 'true' && document.querySelectorAll('.progress-calendar-day').length >= 28")) throw new Error('Monthly summaries must open the exact month calendar');
    await read("document.querySelector('[data-period=quarter]').click()");
    await read("document.querySelector('#progress-previous').click()");
    if (!await read("!document.querySelector('#progress-next').disabled")) throw new Error('Previous periods must be browsable');
    await read("document.querySelector('#progress-habit').value='progress-reading';document.querySelector('#progress-habit').dispatchEvent(new Event('change'))");
    if (!await read("document.querySelector('#progress-summary').textContent.includes('min')")) throw new Error('Minutes need their own readable units');
    await read("document.querySelector('#progress-habit').value='progress-stretch';document.querySelector('#progress-habit').dispatchEvent(new Event('change'));document.querySelector('[data-period=week]').click()");
    if (!await read("document.querySelectorAll('.progress-day-square').length===7 && document.querySelector('#progress-summary').textContent.includes('Goal met on') && !document.querySelector('#progress-summary').textContent.includes('total')")) throw new Error('Yes/no week needs seven labeled day squares and completion days');
    const originalAmount = JSON.stringify(store.snapshot().days);
    await read("document.querySelector('.progress-point').click()");
    if (JSON.stringify(store.snapshot().days) !== originalAmount) throw new Error('Chart exploration must never log or change habits');
    const overflow = await read("document.documentElement.scrollWidth > innerWidth || document.querySelector('#progress-chart').scrollWidth > document.querySelector('#progress-chart').clientWidth+1");
    if (overflow) throw new Error('Progress chart must fit the existing popup');
    await pause(); fs.writeFileSync(path.join(captureDir, 'progress-week-preview.png'), (await popup.webContents.capturePage()).toPNG());
    await read("document.querySelector('#progress-habit').value='progress-water';document.querySelector('#progress-habit').dispatchEvent(new Event('change'));document.querySelector('[data-period=quarter]').click()");
    await pause(); fs.writeFileSync(path.join(captureDir, 'progress-quarter-preview.png'), (await popup.webContents.capturePage()).toPNG());
    const empty = store.snapshot(); empty.habits.forEach(habit => { habit.archived = true; }); store.commit(empty); broadcast(); await pause();
    if (!await read("!document.querySelector('#progress-empty').hidden && document.querySelector('#progress-content').hidden")) throw new Error('Deleted habits must disappear from progress');
    await read("document.querySelector('#back-home').click()");
    if (!await read("document.querySelector('#progress').hidden && !document.querySelector('#today').hidden")) throw new Error('Back must restore the habit view');
    console.log('PROGRESS UI CHECK PASSED: day squares, numeric bars, month calendar, three monthly summaries, drill-down, date navigation, exact details, units, empty state, read-only history and popup fit.');
  } finally { store.commit(original); broadcast(); }
}
module.exports = { runProgressSmoke };
