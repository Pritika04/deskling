'use strict';

const button = document.querySelector('#buddy');
let buddyState;
let reactionTimer;
let reacting = false;
let resting = false;
let gazeTarget = { x: 0, y: 0 };
let gazeEnabled = false;
function applyGaze() {
  const enabled = document.body.dataset.state === 'idle' && !reacting && !resting && !pointer && resizing === null && !reducedMotion.matches && !document.hidden;
  if (enabled !== gazeEnabled) { gazeEnabled = enabled; window.buddy.enableGaze(enabled); }
  if (!enabled) gazeTarget = { x: 0, y: 0 };
  document.documentElement.style.setProperty('--gaze-x', `${enabled ? gazeTarget.x : 0}px`);
  document.documentElement.style.setProperty('--gaze-y', `${enabled ? gazeTarget.y : 0}px`);
}
window.buddy.onGaze(gaze => { gazeTarget = gaze; applyGaze(); });
document.addEventListener('visibilitychange', applyGaze);
function updateRest(rest) {
  resting = rest.sleeping;
  if (!reacting) idleState();
}
window.buddy.onRest(updateRest);
window.buddy.getRest().then(updateRest).catch(console.error);
function idleState() {
  if (!buddyState) return;
  if (!buddyState.settings.hatched) {
    clearIdleFidget();
    document.body.dataset.state = 'egg';
    applyGaze();
    button.setAttribute('aria-label', 'Meet your buddy. Click to hatch.');
    button.title = 'Someone tiny is waiting. Click to hatch.';
    return;
  }
  const gift = HabitDomain.mysteryStatus(buddyState).available;
  button.setAttribute('aria-label', gift ? 'Open your mystery box. Drag to move.' : 'Open or close Habit Buddy. Drag to move.');
  button.title = gift ? 'A little surprise is waiting. Click to open.' : `${buddyState.settings.buddyName} · Click for your day · double-click for affection`;
  if (gift) { clearIdleFidget(); document.body.dataset.state = 'gift'; applyGaze(); return; }
  document.body.dataset.state = resting ? 'sleepy' : 'idle';
  if (resting) clearIdleFidget();
  applyGaze();
}
function react({ state, followUp, direction = 1, hold = false, duration = null, treatSize = 'small', food = null }) {
  clearIdleFidget();
  clearTimeout(reactionTimer);
  reacting = state !== 'idle';
  document.body.dataset.state = state;
  document.body.dataset.direction = direction;
  document.body.dataset.treatSize = treatSize;
  if (state === 'treat' && food) {
    const snack = document.querySelector('.treat-food');
    snack.textContent = food.emoji;
    snack.dataset.food = food.id;
    snack.setAttribute('aria-label', food.name);
  }
  applyGaze();
  if (state === 'idle') { idleState(); return; }
  if (hold) return;
  reactionTimer = setTimeout(() => {
    reacting = false;
    if (followUp) react({ state: followUp }); else idleState();
  }, duration ?? (state === 'sleepy' ? 10000 : state === 'roll' ? 4100 : 2200));
}
window.buddy.onReaction(react);
let pointer = null;
let moved = false;
button.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  clearTimeout(clickTimer);
  clearTimeout(petTimer);
  clearIdleFidget();
  pointer = { x: event.screenX, y: event.screenY, id: event.pointerId };
  document.body.classList.add('dragging');
  applyGaze();
  moved = false;
  button.setPointerCapture(event.pointerId);
  window.buddy.drag('start');
});
button.addEventListener('pointermove', event => {
  if (!pointer) return;
  if (Math.hypot(event.screenX - pointer.x, event.screenY - pointer.y) > 4) moved = true;
  if (moved) { clearTimeout(clickTimer); window.buddy.drag('move'); }
});
function finish() {
  if (!pointer) return;
  pointer = null;
  document.body.classList.remove('dragging');
  applyGaze();
  window.buddy.drag('end');
}
button.addEventListener('pointerup', finish);
button.addEventListener('pointercancel', () => { moved = true; finish(); });
button.addEventListener('lostpointercapture', finish);
let clickTimer;
button.addEventListener('click', event => {
  clearTimeout(clickTimer);
  if (moved) { moved = false; return; }
  if (event.detail > 1 && (!buddyState?.settings.hatched || document.body.dataset.state === 'gift')) return;
  if (!buddyState?.settings.hatched || document.body.dataset.state === 'gift' || event.detail === 0) {
    window.buddy.togglePopup(); return;
  }
  if (event.detail === 1) clickTimer = setTimeout(() => window.buddy.togglePopup(), 300);
});
button.addEventListener('dblclick', () => {
  clearTimeout(clickTimer);
  if (buddyState?.settings.hatched && document.body.dataset.state !== 'gift') window.buddy.affection().catch(console.error);
});
let petTimer;
let lastPet = 0;
let hovered = false;
function schedulePet(delay = 450) {
  clearTimeout(petTimer);
  petTimer = setTimeout(async () => {
    petTimer = null;
    if (!hovered || pointer || resizing !== null || !buddyState?.settings.hatched || document.body.dataset.state === 'gift') return;
    if (reacting || Date.now() - lastPet < 5000) { schedulePet(1000); return; }
    try {
      if (await window.buddy.affection('pet')) lastPet = Date.now();
      else if (hovered) schedulePet(1000);
    } catch (error) {
      console.error(error);
    }
  }, delay);
}
button.addEventListener('pointerenter', () => { hovered = true; schedulePet(); });
button.addEventListener('pointermove', () => {
  if (hovered && !pointer && !petTimer && Date.now() - lastPet >= 5000) schedulePet();
});
button.addEventListener('pointerleave', () => { hovered = false; clearTimeout(petTimer); petTimer = null; });

const resizeEdges = document.querySelectorAll('.resize-edge');
let resizing = null;
let currentSize = 68;
let renderedOutfit = '';
function updateSize(state) {
  buddyState = state;
  BuddyTheme.apply(state.settings);
  document.body.dataset.avatar = state.settings.avatar;
  const outfitKey = JSON.stringify([state.settings.avatar, state.collection.equipped]);
  if (outfitKey !== renderedOutfit) {
    document.querySelector('#character').innerHTML = BuddyWardrobe.buddyMarkup(state.settings.avatar, state.collection.equipped, true);
    renderedOutfit = outfitKey;
  }
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
    clearIdleFidget();
    applyGaze();
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
    applyGaze();
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
reducedMotion.addEventListener('change', event => { window.buddy.motionPreference(event.matches); if (event.matches) clearIdleFidget(); applyGaze(); });
let idleFidgetTimer;
function clearIdleFidget() {
  clearTimeout(idleFidgetTimer);
  document.body.classList.remove('idle-wobble', 'idle-bounce');
}
function playIdleFidget(kind = Math.random() < .5 ? 'wobble' : 'bounce') {
  if (!['wobble', 'bounce'].includes(kind) || pointer || resizing !== null || reacting || resting || hovered || reducedMotion.matches || document.hidden || document.body.dataset.state !== 'idle') return false;
  clearIdleFidget();
  document.body.classList.add(`idle-${kind}`);
  idleFidgetTimer = setTimeout(clearIdleFidget, 1800);
  return true;
}
function scheduleIdleFidget() {
  setTimeout(() => { playIdleFidget(); scheduleIdleFidget(); }, 12000 + Math.random() * 12000);
}
scheduleIdleFidget();
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
