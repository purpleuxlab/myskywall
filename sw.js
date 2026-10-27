// Offline support: the app files are cached on install, so the wall opens
// without internet. Your skies themselves live in IndexedDB, not here.
// Bump VERSION whenever index.html / style.css / script.js change.
const VERSION = 'sky-wall-v2';
const FONT_CACHE = 'sky-wall-fonts';
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Google Fonts: serve the saved copy, refresh it in the background
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async cache => {
        const cached = await cache.match(request);
        const fresh = fetch(request)
          .then(res => { if (res.ok || res.type === 'opaque') cache.put(request, res.clone()); return res; })
          .catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  // app files: network first so updates show up, cache when offline
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then(cache => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
    );
  }
});
