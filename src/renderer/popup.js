'use strict';

function update(state) {
  document.querySelector('#status').textContent = state.settings.remindersPaused
    ? 'Reminders paused · saved on this device'
    : 'Just on this device. Just for you.';
}
function updateDate() {
  document.querySelector('#date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}
document.querySelector('#close').addEventListener('click', () => window.buddy.closePopup());
document.addEventListener('keydown', event => { if (event.key === 'Escape') window.buddy.closePopup(); });
window.buddy.onState(update);
window.buddy.getState().then(state => {
  update(state);
  document.body.dataset.ready = 'true';
}).catch(() => { document.querySelector('#status').textContent = 'Could not read your local data. Please restart your buddy.'; });
updateDate();
setInterval(updateDate, 30000);
