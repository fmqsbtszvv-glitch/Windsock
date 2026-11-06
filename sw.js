// Offline support: the app itself is cached; weather always comes from the network.
const CACHE = 'windsock-v1';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/scene.js',
  'js/sock.js',
  'js/sky.js',
  'js/wind.js',
  'js/weather.js',
  'js/solar.js',
  'js/sensors.js',
  'js/ui.js',
  'js/haptics.js',
  'js/wakelock.js',
  'js/settings.js',
  'js/palettes.js',
  'vendor/three.module.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first for app files so updates show up, cache as a fallback offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
