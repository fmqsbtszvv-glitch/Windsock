import { WindScene } from './scene.js';
import { WindSim } from './wind.js';
import { Compass, Locator, distanceKm } from './sensors.js';
import { fetchWeather, describeCode } from './weather.js';
import { sunPosition } from './solar.js';
import { loadSettings, saveSettings, loadCachedWeather, saveCachedWeather } from './settings.js';
import { haptics } from './haptics.js';
import { setWakeLock } from './wakelock.js';
import { UI, angleDiff, norm } from './ui.js';

const REFRESH_MS = 10 * 60e3;
const DEMO = { speedKn: 9, gustKn: 17, fromDeg: 250, tempC: 18, code: 2, cloud: 40 };

const settings = loadSettings();
const state = {
  weather: null,
  demo: true,
  lat: null,
  lon: null,
  locationError: null,
  heading: 0,
  manualHeading: Number(new URLSearchParams(location.search).get('heading')) || 35,
  fetching: false,
};

const hapticOn = (k) => settings.haptics && settings[k];

const view = new WindScene(document.getElementById('view'), {
  onThunder: () => hapticOn('hThunder') && haptics.thunder(),
});
const wind = new WindSim();
wind.onGust = (s) => hapticOn('hGusts') && haptics.gust(s);
const compass = new Compass();

const cached = loadCachedWeather();
if (cached) {
  state.weather = cached;
  state.lat = cached.lat;
  state.lon = cached.lon;
  wind.setData(cached, true);
} else {
  wind.setData(DEMO, true);
}

const ui = new UI(settings, {
  onChange(key, value) {
    saveSettings(settings);
    if (key === 'style' || key === 'palette') view.setStyle(settings.style, settings.palette);
    if (['background', 'sceneWeather', 'sceneTime'].includes(key)) updateEnv();
    if (key === 'keepAwake') setWakeLock(value);
    if (key === 'haptics' && value) haptics.tap();
  },
  onStart: start,
  onHapticTest: () => haptics.demo(),
});

/* ----- environment (sky, weather scene) ----- */

function updateEnv() {
  const lat = state.lat ?? 39.5;
  const lon = state.lon ?? -98.35;
  const sun = sunPosition(new Date(), lat, lon);
  const w = state.weather ?? DEMO;
  let weather = describeCode(w.code).scene;
  let cloud = w.cloud;
  let sunElev = sun.elevation;
  let sunAz = sun.azimuth;
  if (settings.background === 'custom') {
    weather = settings.sceneWeather;
    cloud = null;
    const t = settings.sceneTime;
    if (t === 'day') { sunElev = 45; sunAz = 160; }
    if (t === 'sunset') { sunElev = 1.5; sunAz = 255; }
    if (t === 'night') { sunElev = -25; sunAz = 0; }
  }
  view.setEnv({ mode: settings.background, weather, cloud, sunElev, sunAz });
}

updateEnv();
view.setStyle(settings.style, settings.palette);
setInterval(updateEnv, 60e3);
window.addEventListener('resize', () => view.resize());

/* ----- start: permissions, location, weather ----- */

let started = false;
function start() {
  if (started) return;
  started = true;
  // iPhone needs this call to happen directly inside the tap
  compass
    .requestPermission()
    .then((ok) => {
      if (ok) compass.start();
      else ui.toast('Motion access was declined, so drag to turn instead.');
    })
    .catch(() => ui.toast('Compass not available. Drag to turn.'));

  haptics.tap();
  if (settings.keepAwake) setWakeLock(true);
  ui.hideStart();

  const locator = new Locator(
    (lat, lon) => {
      const moved = state.lat == null || distanceKm(state.lat, state.lon, lat, lon) > 2;
      state.lat = lat;
      state.lon = lon;
      state.locationError = null;
      if (moved || state.demo || !state.weather) refresh();
    },
    (err) => {
      state.locationError = err?.code === 1 ? 'location is off' : 'no location yet';
      if (!state.weather) state.demo = true;
      if (err?.code === 1) ui.toast('Location is off. Showing demo wind.');
    }
  );
  locator.start();
}

async function refresh() {
  if (state.lat == null || state.fetching) return;
  state.fetching = true;
  try {
    const w = await fetchWeather(state.lat, state.lon);
    const first = state.demo && !state.weather;
    state.weather = w;
    state.demo = false;
    wind.setData(w, first);
    saveCachedWeather(w);
    updateEnv();
  } catch {
    ui.toast("Couldn't reach the weather service. Trying again soon.");
  } finally {
    state.fetching = false;
  }
}

setInterval(() => {
  if (!started) return;
  const age = state.weather ? Date.now() - state.weather.fetchedAt : Infinity;
  if (age > REFRESH_MS || state.demo) refresh();
}, 30e3);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !started) return;
  const age = state.weather ? Date.now() - state.weather.fetchedAt : Infinity;
  if (age > REFRESH_MS) refresh();
  updateEnv();
});

/* ----- drag to turn when there's no compass ----- */

let dragX = null;
const canvas = document.getElementById('view');
canvas.addEventListener('pointerdown', (e) => { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (dragX == null || compass.active) return;
  state.manualHeading = norm(state.manualHeading - (e.clientX - dragX) * 0.3);
  dragX = e.clientX;
});
canvas.addEventListener('pointerup', () => { dragX = null; });
canvas.addEventListener('pointercancel', () => { dragX = null; });

/* ----- haptic cues tied to where you face ----- */

const cue = { head: true, tail: true, quadrant: null };
function headingCues(heading, meanFrom, meanKn) {
  if (!settings.haptics) return;
  if (settings.hHeadwind && meanKn >= 1) {
    const d = Math.abs(angleDiff(heading, meanFrom));
    if (d < 4 && cue.head) { haptics.headwind(); cue.head = false; }
    else if (d > 12) cue.head = true;
    if (d > 176 && cue.tail) { haptics.tailwind(); cue.tail = false; }
    else if (d < 168) cue.tail = true;
  }
  if (settings.hDetents) {
    // which quarter (N-E, E-S, ...) we're in, with a little hysteresis
    const q = Math.floor(norm(heading) / 90);
    if (cue.quadrant == null) cue.quadrant = q;
    else if (q !== cue.quadrant) {
      const inside = norm(heading) - q * 90;
      if (inside > 2 && inside < 88) {
        haptics.detent();
        cue.quadrant = q;
      }
    }
  }
}

/* ----- main loop ----- */

let last = performance.now();
let uiTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  const target = compass.active ? compass.heading : state.manualHeading;
  const d = angleDiff(target, state.heading);
  state.heading = norm(state.heading + d * (1 - Math.exp(-dt / 0.08)));

  const w = wind.update(dt);
  view.update(dt, { heading: state.heading, windKn: w.speedKn, windFrom: w.fromDeg });
  if (started) headingCues(state.heading, w.meanFrom, w.meanKn);

  uiTimer -= dt;
  if (uiTimer <= 0) {
    uiTimer = 0.2;
    const src = state.weather ?? DEMO;
    ui.update({
      meanKn: state.weather ? state.weather.speedKn : DEMO.speedKn,
      gustKn: state.weather ? state.weather.gustKn : DEMO.gustKn,
      fromDeg: state.weather ? state.weather.fromDeg : DEMO.fromDeg,
      tempC: src.tempC,
      condLabel: describeCode(src.code).label,
      heading: state.heading,
      compassActive: compass.active,
      demo: state.demo && !state.weather,
      locationError: state.locationError,
      updatedAt: state.weather?.fetchedAt,
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.windsock = { view, wind, state, settings }; // handy for debugging

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
