'use strict';
const canvas = document.querySelector('#confetti');
const context = canvas.getContext('2d');
const message = document.querySelector('#message');
let frame;
window.buddy.onReaction(reaction => {
  cancelAnimationFrame(frame);
  context.clearRect(0, 0, canvas.width, canvas.height);
  document.body.dataset.state = reaction.state;
  document.documentElement.style.setProperty('--accent', reaction.accent);
  message.hidden = !['halfway', 'reminder', 'mystery'].includes(reaction.state);
  message.textContent = reaction.state === 'halfway' ? "You're halfway there!" : ['reminder', 'mystery'].includes(reaction.state) ? reaction.message : '';
  const left = Math.max(8, Math.min(canvas.width - message.offsetWidth - 8, reaction.x - message.offsetWidth / 2));
  message.style.left = `${left}px`;
  message.style.setProperty('--tail-left', `${Math.max(14, Math.min(message.offsetWidth - 24, reaction.x - left - 5))}px`);
  const above = reaction.y - message.offsetHeight - 32;
  message.dataset.below = above < 8;
  message.style.top = `${Math.max(8, Math.min((reaction.height || canvas.height) - message.offsetHeight - 8, above >= 8 ? above : reaction.y + 32))}px`;
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
