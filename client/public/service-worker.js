// Minimal app-shell cache so the installed PWA opens offline. The API is never
// cached (always network) so study data stays fresh.
//
// Caching strategy (v2):
//  - Navigations (the HTML shell) are NETWORK-FIRST with cache fallback.
//    Cache-first here froze the app on the version from install day — new
//    deploys never reached users, because index.html (and with it the hashed
//    bundle URLs) always came from the cache.
//  - Hashed build assets etc. stay cache-first: their URL changes with the
//    content, so a cached hit is always the correct version.
//  - Third-party origins (CDN, HuggingFace models) are left to the browser's
//    own HTTP cache — the neural TTS layer manages its audio via Cache Storage
//    itself.
const CACHE = '1kwords-shell-v2';
const SHELL = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return; // CDN/HF: browser cache handles it
  if (url.pathname.startsWith('/api/')) return; // never cache API

  // Navigations: network-first so a deploy is visible on the next reload;
  // the cached shell only serves as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Everything else (hashed assets, onnx/piper files): cache-first.
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    ),
  );
});