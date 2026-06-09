const CACHE = 'pool-v4';
const PRECACHE_URLS = ['/', '/manifest.json', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  // Do NOT call self.skipWaiting() — wait for user to reload or for message
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never cache API or WebSocket requests
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;

  // Only cache GET requests for same-origin static assets
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Skip cache for non-static paths (game state should always be fresh)
  if (url.pathname.startsWith('/arena') || url.pathname.startsWith('/dashboard')) {
    e.respondWith(fetch(e.request).catch(() => caches.match('/').then((r) => r || new Response('Offline', { status: 503 }))));
    return;
  }

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
