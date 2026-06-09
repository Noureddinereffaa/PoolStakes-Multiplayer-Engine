const CACHE = 'pool-v3';
const PRECACHE_URLS = ['/', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const clone = r.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone).catch(() => {}));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || new Response('Offline', { status: 503 })))
  );
});
