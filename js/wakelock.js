// Keeps the screen on while the app is open (Screen Wake Lock API).

let sentinel = null;
let wanted = false;

export const wakeLockSupported = 'wakeLock' in navigator;

async function acquire() {
  if (!wakeLockSupported || sentinel || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {
    sentinel = null;
  }
}

export async function setWakeLock(on) {
  wanted = on;
  if (on) return acquire();
  try { await sentinel?.release(); } catch { /* already released */ }
  sentinel = null;
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') acquire();
});
