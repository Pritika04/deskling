'use strict';
const canvas = document.querySelector('#confetti');
const context = canvas.getContext('2d');
const message = document.querySelector('#message');
const tail = document.querySelector('#bubble-tail');
let frame;
let bubbleId;
window.buddy.onBubblePosition(position => {
  if (position.id !== bubbleId) return;
  message.style.maxWidth = `${Math.min(250, Math.max(60, position.width - 24))}px`;
  message.style.left = `${position.left}px`; message.style.top = `${position.top}px`;
  const { a, b, tip } = position.tail;
  const path = `M${a.x} ${a.y}L${tip.x} ${tip.y}L${b.x} ${b.y}`;
  document.querySelector('#tail-fill').setAttribute('d', `${path}Z`);
  document.querySelector('#tail-outline').setAttribute('d', path);
  const width = message.offsetWidth + 24, height = message.offsetHeight + 24;
  if (width !== position.width || height !== position.height) window.buddy.fitBubble({ id: bubbleId, width, height });
});
window.buddy.onReaction(reaction => {
  cancelAnimationFrame(frame);
  context.clearRect(0, 0, canvas.width, canvas.height);
  document.body.dataset.state = reaction.state;
  document.documentElement.style.setProperty('--accent', reaction.accent);
  message.hidden = !reaction.bubble;
  tail.toggleAttribute('hidden', !reaction.bubble);
  message.textContent = reaction.bubble ? reaction.message : '';
  message.style.left = '12px'; message.style.top = '12px';
  message.style.maxWidth = '250px';
  if (reaction.bubble) {
    bubbleId = reaction.id;
    window.buddy.fitBubble({ id: reaction.id, width: message.offsetWidth + 24, height: message.offsetHeight + 24 });
  }
  if (reaction.state !== 'celebrate') return;
  const colors = [reaction.accent, '#d69165', '#9a79bc', '#dbb84d', '#5e9fa5'];
  const particles = Array.from({ length: 40 }, (_, index) => ({
    x: reaction.x, y: reaction.y - 10,
    vx: (Math.random() - .5) * 210, vy: -80 - Math.random() * 150,
    size: 6 + Math.random() * 4, spin: Math.random() * 6, color: colors[index % colors.length],
  }));
  const began = performance.now();
  function draw(now) {
    const time = (now - began) / 1000;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const particle of particles) {
      const x = reaction.reducedMotion ? particle.x + particle.vx * .55 : particle.x + particle.vx * time;
      const y = reaction.reducedMotion ? particle.y + particle.vy * .35 : particle.y + particle.vy * time + 75 * time * time;
      context.save(); context.translate(x, y); context.rotate(particle.spin + (reaction.reducedMotion ? 0 : time * 3));
      context.globalAlpha = Math.min(1, Math.max(0, (2.8 - time) / .7));
      context.fillStyle = particle.color; context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * .65);
      context.restore();
    }
    if (time < 2.8) frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
});
document.body.dataset.ready = 'true';
