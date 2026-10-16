/* The animations: five ported from the public demo, and the steam of a mascot drawn with it.
 * Every one of them is skipped when the person has asked for less motion, and none of them
 * changes what the page says. */

import { el } from './dom.js';
import { drawCollection, hasSteam, outlineColour, spriteCanvas, steamCycle } from './pixels.js';

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/* ---------------------------------------------------------------- particles */

let living = [];
function sweep() {
  const now = Date.now();
  living = living.filter(particle => {
    if (now < particle.dieAt) return true;
    particle.node.remove();
    return false;
  });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) sweep(); });

function spawn(x, y, count, color, size, opts) {
  if (reducedMotion()) return;
  sweep();
  for (let index = 0; index < count; index += 1) {
    const node = el('div', { attrs: { class: 'particle', 'aria-hidden': 'true' } });
    node.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${color}`;
    document.body.append(node);
    const angle = opts.from + Math.random() * opts.arc;
    const distance = opts.distance * (0.5 + Math.random() * 0.8);
    const life = opts.duration + Math.random() * 250;
    const animation = node.animate([
      { transform: 'translate(0,0)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance + opts.gravity}px) rotate(${Math.random() * 180 - 90}deg)`, opacity: 0 },
    ], { duration: life, easing: 'cubic-bezier(.2,.6,.4,1)' });
    const particle = { node, dieAt: Date.now() + life + 200 };
    living.push(particle);
    animation.onfinish = animation.oncancel = () => {
      node.remove();
      living = living.filter(item => item !== particle);
    };
  }
}

/* Crumbs falling from a point on screen, for the mascot, in the colour given: the outline
 * colour of the mascot's drawing, so they look as if they came off it. A missing colour is
 * outlineColour()'s fallback, so they never come out with no colour, and so unseen. */
export function crumbs(x, y, color = outlineColour(), count = 9) {
  spawn(x, y, count, color, 5, { from: Math.PI * 0.15, arc: Math.PI * 0.7, distance: 46, gravity: 70, duration: 650 });
}

/* Shakes the mascot. A drawing marked with steam then steams for one cycle (a cup spilling
 * crumbs makes no sense); any other spills crumbs from it. The drawing decides, never the
 * theme. `spriteKey` is the drawing on the button, drawn at `size`. */
export function crackMascot(button, spriteKey, size = 3) {
  button.classList.remove('crack');
  void button.offsetWidth; // restart the animation when tapped again quickly
  button.classList.add('crack');
  if (hasSteam(spriteKey)) {
    steam(button.querySelector('canvas'), spriteKey, size);
    return;
  }
  const box = button.getBoundingClientRect();
  crumbs(box.left + box.width / 2, box.top + box.height / 2, outlineColour(spriteKey));
}

/* ---------------------------------------------------------------- steam */

/* The stop function of the steam running on each canvas: a new run there stops it first. */
const steaming = new WeakMap();

/**
 * Runs the steam of a drawing marked with it, on the canvas that shows it at `size`: the first
 * step at once, then one step every step length of sprites.js, and after `cycles` cycles
 * (Infinity: until stopped) the whole drawing again. Returns a function that stops it where it
 * is. With less motion asked for, without a canvas, or for a drawing with no steam, nothing
 * happens: the canvas keeps the whole drawing. A canvas that has left the page ends it, and is
 * drawn on no more.
 */
export function steam(canvas, spriteKey, size, { cycles = 1 } = {}) {
  if (!canvas || reducedMotion() || !hasSteam(spriteKey)) return () => {};
  steaming.get(canvas)?.();
  if (!canvas.isConnected) return () => {};
  const { steps, stepMs } = steamCycle();
  const last = cycles * steps;
  let step = 0;
  let timer = null;
  const stop = () => {
    window.clearInterval(timer);
    if (steaming.get(canvas) === stop) steaming.delete(canvas);
  };
  drawCollection(canvas, spriteKey, size, step);
  timer = window.setInterval(() => {
    if (!canvas.isConnected) {
      stop();
      return;
    }
    step += 1;
    if (step < last) {
      drawCollection(canvas, spriteKey, size, step % steps);
      return;
    }
    drawCollection(canvas, spriteKey, size);
    stop();
  }, stepMs);
  steaming.set(canvas, stop);
  return stop;
}

/* ---------------------------------------------------------------- the rolling number */

const rolling = new WeakMap();

/**
 * Draws `to` on the canvas, rolling from `from` over 600 ms when they differ. `draw(canvas,
 * units)` paints one frame. A new roll on the same canvas cancels the one in flight, so a late
 * frame never paints an old value over a new one.
 */
export function rollNumber(canvas, from, to, draw) {
  const inFlight = rolling.get(canvas);
  if (inFlight !== undefined) cancelAnimationFrame(inFlight);
  rolling.delete(canvas);
  if (reducedMotion() || from === undefined || from === to) {
    draw(canvas, to);
    return;
  }
  let startedAt = null;
  const step = timestamp => {
    if (startedAt === null) startedAt = timestamp;
    const progress = Math.min((timestamp - startedAt) / 600, 1);
    const eased = 1 - (1 - progress) ** 3;
    draw(canvas, Math.round(from + (to - from) * eased));
    if (progress < 1) rolling.set(canvas, requestAnimationFrame(step));
    else rolling.delete(canvas);
  };
  rolling.set(canvas, requestAnimationFrame(step));
}

/* Makes the number dip (a deduction) or jump (an addition) once. */
export function bump(node, effect) {
  node.classList.remove('dip', 'jump');
  void node.offsetWidth;
  node.classList.add(effect);
}

/* ---------------------------------------------------------------- what this device saw last */

const SEEN = 'crumb.seen';

/* { balance, count, lifetime } for a member id, or null. Only these three numbers are stored. */
export function lastSeen(userId) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`${SEEN}.${userId}`) ?? 'null');
    if (saved && Number.isSafeInteger(saved.balance) && Number.isSafeInteger(saved.count) && Number.isSafeInteger(saved.lifetime)) return saved;
  } catch {
    // unreadable or blocked storage: behave as on a first visit
  }
  return null;
}

export function rememberSeen(userId, { balance, count, lifetime }) {
  try {
    window.localStorage.setItem(`${SEEN}.${userId}`, JSON.stringify({ balance, count, lifetime }));
  } catch {
    // not remembered: the next visit animates from scratch
  }
}

/* On signing out, before the page asks the server who is here now, so the numbers go even
 * when that question gets no answer. */
export function forgetSeen(userId) {
  try {
    window.localStorage.removeItem(`${SEEN}.${userId}`);
  } catch {
    // storage blocked: nothing was kept to remove
  }
}

/* Each time the page learns who is signed in here: the browser keeps that person's numbers
 * only, and none when no one is. So a phone or computer the team shares keeps no one's balance
 * after they leave, however they left: signing out, a new sign-in link made to cut off a lost
 * phone, a deactivated account or an expired session, also when the page was closed at the
 * time and only finds out on its next load. */
export function keepSeenOnlyFor(userId) {
  try {
    const own = userId ? `${SEEN}.${userId}` : null;
    const others = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(`${SEEN}.`) && key !== own) others.push(key);
    }
    for (const key of others) window.localStorage.removeItem(key);
  } catch {
    // storage blocked: nothing was kept to remove
  }
}

/* ---------------------------------------------------------------- the oven intro */

let introShown = false;

/**
 * The oven intro (its title is the caller's): under a second, once per page load, a tap skips
 * it. `mascot` is the sprite key of the team's mascot; one drawn with steam steams while the
 * intro shows. Resolves when it has left, so the page can start the tile's entrance after it.
 */
export function ovenIntro({ title, skip, mascot }) {
  if (introShown || reducedMotion()) {
    introShown = true;
    return Promise.resolve();
  }
  introShown = true;
  return new Promise(resolve => {
    const picture = spriteCanvas(mascot, 8);
    const node = el('div', { attrs: { class: 'oven', role: 'presentation' } }, [
      picture,
      el('p', { text: title, attrs: { class: 'oven-text' } }),
      el('p', { text: skip, attrs: { class: 'oven-sub' } }),
    ]);
    let done = false;
    let stopSteam = () => {};
    const dismiss = () => {
      if (done) return;
      done = true;
      // The cup leaves with the intro, its steam stopped where it is.
      stopSteam();
      node.classList.add('leaving');
      window.setTimeout(() => {
        node.remove();
        resolve();
      }, 420);
    };
    node.addEventListener('click', dismiss);
    document.body.append(node);
    // Only a canvas in the page steams, so it starts now.
    stopSteam = steam(picture, mascot, 8, { cycles: Infinity });
    // It starts to leave at 0.9 s, as in the demo: the pop-in alone takes 0.5 s, so leaving
    // any sooner would give the words no time to be read.
    window.setTimeout(dismiss, 900);
  });
}
