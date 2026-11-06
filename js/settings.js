const KEY = 'windsock.settings.v1';

export const DEFAULTS = {
  style: 'cel',
  palette: 'classic',
  background: 'auto', // auto | oled | custom
  sceneWeather: 'clear',
  sceneTime: 'live',
  speedUnit: 'mph',
  tempUnit: 'F',
  panel: 'full',
  haptics: true,
  hGusts: true,
  hHeadwind: true,
  hDetents: false,
  hThunder: true,
  keepAwake: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

const CACHE_KEY = 'windsock.lastWeather.v1';

export function loadCachedWeather() {
  try {
    const w = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (w && Date.now() - w.fetchedAt < 6 * 3600e3) return w;
  } catch { /* ignore */ }
  return null;
}

export function saveCachedWeather(w) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(w)); } catch { /* ignore */ }
}
