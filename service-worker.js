// J.A.R.V.I.S service worker: offline app shell + cached CDN libraries.
// Bump CACHE_VERSION whenever you change front-end files.
const CACHE_VERSION = 'jarvis-v7';
// Relative paths, so the same files work at a site root (PC edition) or in a sub-folder (web hosting).
const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/main.js',
  'js/scene.js',
  'js/audio.js',
  'js/speech.js',
  'js/gestures.js',
  'js/colorPicker.js',
  'js/terminal.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache the API or the live event stream.
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

  // Versioned CDN files (three.js, MediaPipe, fonts): cache-first.
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }

  // App shell: network-first so edits show up immediately, cache as offline fallback.
  if (url.origin === location.origin) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html'))),
    );
  }
});
