'use strict';

const button = document.querySelector('#buddy');
let buddyState;
let reactionTimer;
let reacting = false;
function idleState() {
  if (!buddyState) return;
  const gift = HabitDomain.mysteryStatus(buddyState).available;
  button.setAttribute('aria-label', gift ? 'Open your mystery box. Drag to move.' : 'Open or close Habit Buddy. Drag to move.');
  button.title = gift ? 'A little surprise is waiting. Click to open.' : 'Click for your day · drag to move';
  if (gift) { document.body.dataset.state = 'gift'; return; }
  const hour = new Date().getHours();
  const untouched = !HabitDomain.summary(buddyState).progress;
  document.body.dataset.state = hour >= 22 || hour < 6 || (hour >= 18 && untouched) ? 'sleepy' : 'idle';
}
function react({ state, followUp, direction = 1, hold = false }) {
  clearTimeout(reactionTimer);
  reacting = state !== 'idle';
  document.body.dataset.state = state;
  document.body.dataset.direction = direction;
  if (state === 'idle') { idleState(); return; }
  if (hold) return;
  reactionTimer = setTimeout(() => {
    reacting = false;
    if (followUp) react({ state: followUp }); else idleState();
  }, state === 'sleepy' ? 10000 : state === 'roll' ? 4100 : 2200);
}
window.buddy.onReaction(react);
let pointer = null;
let moved = false;
button.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pointer = { x: event.screenX, y: event.screenY, id: event.pointerId };
  moved = false;
  button.setPointerCapture(event.pointerId);
  window.buddy.drag('start');
});
button.addEventListener('pointermove', event => {
  if (!pointer) return;
  if (Math.hypot(event.screenX - pointer.x, event.screenY - pointer.y) > 4) moved = true;
  if (moved) window.buddy.drag('move');
});
function finish() {
  if (!pointer) return;
  pointer = null;
  window.buddy.drag('end');
}
button.addEventListener('pointerup', finish);
button.addEventListener('pointercancel', () => { moved = true; finish(); });
button.addEventListener('lostpointercapture', finish);
button.addEventListener('click', () => { if (!moved) window.buddy.togglePopup(); moved = false; });

const resizeEdges = document.querySelectorAll('.resize-edge');
let resizing = null;
let currentSize = 68;
function updateSize(state) {
  buddyState = state;
  BuddyTheme.apply(state.settings);
  document.body.dataset.avatar = state.settings.avatar;
  if (!reacting) idleState();
  currentSize = state.settings.avatarSize;
  for (const edge of resizeEdges) edge.setAttribute('aria-valuenow', currentSize);
}
window.buddy.onState(updateSize);
window.buddy.getState().then(updateSize).catch(console.error);
function setSize(size) {
  window.buddy.resizeAvatar(size).then(updateSize).catch(console.error);
}
for (const edge of resizeEdges) {
  edge.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    resizing = event.pointerId;
    edge.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');
    window.buddy.resizeDrag('start', edge.dataset.edge);
  });
  edge.addEventListener('pointermove', event => {
    if (resizing === event.pointerId) window.buddy.resizeDrag('move');
  });
  const finishResize = event => {
    if (resizing !== event.pointerId) return;
    resizing = null;
    document.body.classList.remove('resizing');
    window.buddy.resizeDrag('end');
  };
  edge.addEventListener('pointerup', finishResize);
  edge.addEventListener('pointercancel', finishResize);
  edge.addEventListener('lostpointercapture', finishResize);
  edge.addEventListener('dblclick', () => setSize(68));
  edge.addEventListener('keydown', event => {
    const direction = { ArrowUp: 4, ArrowRight: 4, ArrowDown: -4, ArrowLeft: -4 }[event.key];
    if (!direction && event.key !== 'Home') return;
    event.preventDefault();
    setSize(event.key === 'Home' ? 68 : Math.max(64, Math.min(160, currentSize + direction)));
  });
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
window.buddy.motionPreference(reducedMotion.matches);
reducedMotion.addEventListener('change', event => window.buddy.motionPreference(event.matches));
function scheduleExpression() {
  setTimeout(() => {
    if (!pointer && resizing === null && !reacting && document.body.dataset.state === 'idle' && !reducedMotion.matches && !document.hidden) {
      const expression = Math.random() < .18 ? 'wink' : 'blink';
      button.classList.add(expression);
      setTimeout(() => button.classList.remove(expression), 350);
    }
    scheduleExpression();
  }, 4000 + Math.random() * 5000);
}
scheduleExpression();
setInterval(() => {
  if (!reacting && !pointer && resizing === null) idleState();
}, 30000);
document.body.dataset.ready = 'true';
