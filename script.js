import { mountReel, sleep } from './reel/reel.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const root = document.querySelector('.pay');
const button = root.querySelector('.pay-btn');
const fill = root.querySelector('.pay-fill');
const text = root.querySelector('.pay-text');
const wrap = root.querySelector('.receipt-wrap');
const amount = root.querySelector('.r-amount');
const qr = root.querySelector('.r-qr');
const stamp = root.querySelector('.stamp');
const confetti = root.querySelector('.confetti');
const status = root.querySelector('[role="status"]');

const HOLD_MS = 900;
const TOTAL = 108;
const SAND = '#f0ede4';
const SLOT = '#001f1c';
const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';
const FOLD = 'cubic-bezier(.75, 0, .2, 1)';

const setState = (state) => { root.dataset.state = state; };
const money = (n) => `$${n.toFixed(2)}`;

/* ---------- QR code: a seeded pattern with the three finder squares ---------- */

function buildQr() {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const finder = (x, y) => {
    for (const [fx, fy] of [[0, 0], [8, 0], [0, 8]]) {
      const dx = x - fx;
      const dy = y - fy;
      if (dx >= 0 && dx < 5 && dy >= 0 && dy < 5) return dx === 0 || dy === 0 || dx === 4 || dy === 4 || (dx === 2 && dy === 2);
    }
    return null;
  };
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x < 13; x++) {
      const cell = document.createElement('i');
      const f = finder(x, y);
      if (f === false || (f === null && rand() > 0.52)) cell.className = 'off';
      qr.append(cell);
    }
  }
}
buildQr();
const qrCells = [...qr.querySelectorAll('i:not(.off)')];

/* ---------- Hold to pay ---------- */

let hold = null;

function startHold() {
  if (root.dataset.state !== 'idle') return;
  setState('holding');
  hold = fill.animate([{ scale: '0 1' }, { scale: '1 1' }], { duration: HOLD_MS, easing: 'cubic-bezier(.3,0,.6,1)', fill: 'forwards' });
  hold.finished.then(pay, () => {});
}

function cancelHold() {
  if (root.dataset.state !== 'holding') return;
  const progress = (hold.currentTime ?? 0) / HOLD_MS;
  hold.cancel();
  fill.animate([{ scale: `${progress} 1` }, { scale: '0 1' }], { duration: 260, easing: 'ease-out' });
  setState('idle');
}

button.addEventListener('pointerdown', (e) => {
  try { button.setPointerCapture(e.pointerId); } catch { /* synthetic events have no capturable pointer */ }
  startHold();
});
button.addEventListener('pointerup', cancelHold);
button.addEventListener('pointercancel', cancelHold);
button.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(); } });
button.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') cancelHold(); });

/* ---------- The sequence ---------- */

async function pay() {
  setState('paying');
  status.textContent = 'Payment confirmed, printing receipt';
  if (reducedMotion) {
    wrap.style.translate = '0 0';
    root.classList.add('is-slot', 'is-free');
    stamp.style.opacity = '0.9';
    setState('paid');
    return;
  }

  // 1. The button folds up into a printer slot.
  text.animate([{ opacity: 1 }, { opacity: 0, scale: 0.9 }], { duration: 180, fill: 'forwards' });
  fill.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
  await button.animate([
    { top: getComputedStyle(root).getPropertyValue('--btn-top').trim(), width: '300px', height: '64px', borderRadius: '32px', backgroundColor: SAND },
    { top: '0px', width: '340px', height: '20px', borderRadius: '10px', backgroundColor: SLOT },
  ], { duration: 620, easing: FOLD, fill: 'forwards' }).finished;
  root.classList.add('is-slot');
  button.animate([{ scale: '1 1' }, { scale: '1.03 0.8' }, { scale: '1 1' }], { duration: 260, easing: 'ease-out' });
  await sleep(160);

  // 2. Thermal printing: paper feeds out in small eased steps; QR dots pop, the total counts up.
  setState('printing');
  await Promise.all([feedPaper(2300), countTotal(2300), popQr(2300)]);

  // 3. Tear-off: the paper is free, drops a little and swings.
  setState('torn');
  root.classList.add('is-free');
  button.animate([{ translate: '-50% 0' }, { translate: '-50% -3px' }, { translate: '-50% 0' }], { duration: 160 });
  await wrap.animate([
    { translate: '0 0', rotate: '0deg' },
    { translate: '0 26px', rotate: '-4deg', offset: 0.45 },
    { translate: '0 16px', rotate: '2.5deg', offset: 0.75 },
    { translate: '0 18px', rotate: '-1.5deg' },
  ], { duration: 820, easing: 'ease-in-out', fill: 'forwards' }).finished;

  // 4. PAID stamp slams down; the paper jolts and confetti bursts from the slot.
  await stamp.animate([
    { opacity: 0, transform: 'translate(-50%, -50%) rotate(-26deg) scale(2.6)' },
    { opacity: 1, transform: 'translate(-50%, -50%) rotate(-12deg) scale(0.92)', offset: 0.7 },
    { opacity: 0.92, transform: 'translate(-50%, -50%) rotate(-14deg) scale(1)' },
  ], { duration: 380, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).finished;
  wrap.animate([
    { scale: 1 }, { scale: 0.975 }, { scale: 1.01 }, { scale: 1 },
  ], { duration: 320, easing: 'ease-out', composite: 'add' });
  burst();
  setState('paid');
  status.textContent = 'Paid. Receipt printed.';
}

/** Paper feed: N quick eased moves with tiny pauses, like a thermal printer stepping. */
function feedPaper(duration) {
  const steps = 18;
  const frames = [];
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    frames.push({ translate: `0 ${(-101 + 101 * p).toFixed(2)}%`, offset: p, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  return wrap.animate(frames, { duration, fill: 'forwards' }).finished;
}

/** Counts the total up while it prints, landing exactly on $108.00. */
function countTotal(duration) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      amount.textContent = money(TOTAL * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

/** QR modules pop in, in a shuffled order, while the bottom of the receipt is feeding out. */
function popQr(duration) {
  const order = [...qrCells].sort(() => Math.random() - 0.5);
  return Promise.all(order.map((cell, i) => cell.animate(
    [{ scale: 0, opacity: 0 }, { scale: 1.4, opacity: 1, offset: 0.6 }, { scale: 1, opacity: 1 }],
    { duration: 260, delay: (i / order.length) * duration * 0.5, easing: 'ease-out', fill: 'backwards' },
  ).finished));
}

/** Confetti: sand and cyprus tints fly up out of the slot, then tumble down. */
function burst() {
  const colors = [SAND, '#ddd6c4', '#8fbfb6', '#2e7b72', '#ffffff'];
  const shapes = ['', 'dot', 'strip'];
  const cx = root.offsetWidth / 2;
  for (let i = 0; i < 64; i++) {
    const piece = document.createElement('i');
    piece.className = shapes[i % 3];
    piece.style.background = colors[i % colors.length];
    confetti.append(piece);
    const angle = (-90 + (Math.random() - 0.5) * 150) * (Math.PI / 180);
    const power = 180 + Math.random() * 260;
    const x0 = cx + (Math.random() - 0.5) * 260;
    const y0 = 10;
    const peakX = x0 + Math.cos(angle) * power;
    const peakY = y0 + Math.sin(angle) * power * 0.7;
    const spin = (Math.random() - 0.5) * 1440;
    piece.animate([
      { transform: `translate(${x0}px, ${y0}px) rotate(0deg) scale(0.4)`, opacity: 1 },
      { transform: `translate(${peakX}px, ${peakY}px) rotate(${spin * 0.4}deg) scale(1)`, opacity: 1, offset: 0.32, easing: 'cubic-bezier(.3,0,.7,1)' },
      { transform: `translate(${peakX + (Math.random() - 0.5) * 120}px, ${peakY + 520 + Math.random() * 180}px) rotate(${spin}deg) scale(0.9)`, opacity: 0 },
    ], { duration: 1700 + Math.random() * 900, easing: 'cubic-bezier(.15,.7,.3,1)' }).finished.then(() => piece.remove());
  }
}

function reset() {
  for (const el of [button, fill, text, wrap, stamp, ...qrCells]) el.getAnimations().forEach((a) => a.cancel());
  confetti.replaceChildren();
  root.classList.remove('is-slot', 'is-free');
  wrap.style.translate = '';
  stamp.style.opacity = '';
  amount.textContent = money(TOTAL);
  status.textContent = '';
  setState('idle');
}

// Click the finished receipt to start over.
wrap.addEventListener('click', () => { if (root.dataset.state === 'paid') reset(); });

/* ---------- Reel mode ---------- */

mountReel({
  eyebrow: 'UI animation #06',
  title: 'Payment',
  accent: 'received.',
  demo: root,
  demoScale: 1.5,
  file: 'payment-receipt-animation/script.js',
  code: `
// Thermal printer feed: quick eased steps, tiny pauses
function feedPaper(duration) {
  const steps = 18, frames = [];
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    frames.push({
      translate: \`0 \${-101 + 101 * p}%\`,
      offset: p,
      easing: 'cubic-bezier(.2,.8,.2,1)',
    });
  }
  return wrap.animate(frames, { duration }).finished;
}`,
  reset,
  async play({ cursor, sleep, waitFor }) {
    await cursor.moveTo(button);
    await cursor.click(null);                       // press ripple
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    await waitFor(() => root.dataset.state === 'paying');
    button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    cursor.park();
    await waitFor(() => root.dataset.state === 'paid', 15000);
    await sleep(2400);
  },
});
