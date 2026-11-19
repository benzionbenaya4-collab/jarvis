// JARVIS PRIME service worker – offline app shell + only the features the user picked.
const CACHE = 'prime-v8';
const SHELL = [
  './', 'index.html', 'install.html', 'js/install.js', 'manifest.json', 'css/prime.css',
  'js/app.js', 'js/settings.js', 'js/setup.js', 'js/features.js', 'js/voice.js',
  'js/core.js', 'js/core2d.js', 'js/brain.js', 'js/diary.js', 'js/knowledge.js', 'js/camera.js', 'js/forge.js', 'js/challenges.js',
  '../icons/icon.svg', '../icons/icon-192.png', '../icons/icon-512.png',
];
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('prime-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'cache-features') return;
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(e.data.urls.map((u) => c.add(u).catch(() => {})))));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !CDN.includes(url.hostname)) return;
  const keep = (res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };
  if (url.origin === location.origin) {
    // our own files: always try the newest version first, fall back to the saved copy when offline
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(keep).catch(() => caches.match(req)));
  } else {
    // libraries from the CDN never change (fixed versions): saved copy first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(keep)));
  }
});
