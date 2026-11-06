// Haptics for iPhone web apps.
//
// Safari has no vibration API. Since iOS 18, toggling an <input type="checkbox" switch>
// plays the system "tick" on the Taptic Engine, and that also happens when the
// switch's label is clicked from code. Each call = one tick, so richer feedback
// is built from timed sequences of ticks. Android falls back to navigator.vibrate.

const isIOS =
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let lastTick = 0;
const timers = new Set();

function tickNow() {
  const now = performance.now();
  if (now - lastTick < 28) return; // ticks closer than this blur together
  lastTick = now;
  if (!isIOS && navigator.vibrate) {
    navigator.vibrate(10);
    return;
  }
  try {
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.body.appendChild(label);
    label.click();
    label.remove();
  } catch {
    /* not supported */
  }
}

function play(offsets) {
  for (const ms of offsets) {
    if (ms <= 0) { tickNow(); continue; }
    const id = setTimeout(() => { timers.delete(id); tickNow(); }, ms);
    timers.add(id);
  }
}

export const haptics = {
  supported: isIOS || 'vibrate' in navigator,

  tap() { play([0]); },

  // A gust builds: ticks speed up and the count grows with strength.
  gust(strength = 0.5) {
    const n = 2 + Math.round(strength * 5);
    const out = [];
    let t = 0;
    for (let i = 0; i < n; i++) {
      out.push(t);
      t += 140 - (i / n) * 95;
    }
    play(out);
  },

  // Facing straight into the wind
  headwind() { play([0]); },

  // Wind directly at your back
  tailwind() { play([0, 130]); },

  // Passing N / E / S / W
  detent() { play([0]); },

  // Thunder: a rolling, uneven rumble that tails off
  thunder() {
    const out = [];
    let t = 0;
    const n = 9 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      out.push(t);
      t += 32 + i * i * 2.2 + Math.random() * 30;
    }
    play(out);
  },

  // Short demo for the settings screen
  demo() {
    this.gust(0.8);
    setTimeout(() => this.tailwind(), 1100);
    setTimeout(() => this.thunder(), 1800);
  },

  cancel() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  },
};
