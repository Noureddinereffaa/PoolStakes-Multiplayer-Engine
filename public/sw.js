const CACHE = 'pool-v1';
const ASSETS = ['/', '/manifest.json'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).catch(() => new Response('', { status: 503 })))
  );
});
