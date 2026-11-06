'use strict';

const button = document.querySelector('#buddy');
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
function scheduleExpression() {
  setTimeout(() => {
    if (!pointer && resizing === null && !reducedMotion.matches && !document.hidden) {
      const expression = Math.random() < .18 ? 'wink' : 'blink';
      button.classList.add(expression);
      setTimeout(() => button.classList.remove(expression), 350);
    }
    scheduleExpression();
  }, 4000 + Math.random() * 5000);
}
scheduleExpression();
document.body.dataset.ready = 'true';
