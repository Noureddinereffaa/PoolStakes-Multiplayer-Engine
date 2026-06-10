const CACHE = 'pool-v7';
const PRECACHE_URLS = ['/', '/manifest.json', '/index.html'];

const STATIC_CACHE = 'pool-static-v1';
const DYNAMIC_CACHE = 'pool-dynamic-v1';
const API_CACHE = 'pool-api-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {}),
    ])
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== STATIC_CACHE && k !== DYNAMIC_CACHE && k !== API_CACHE).map((k) => caches.delete(k)))
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data?.type === 'CLEAR_CACHE') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const { pathname } = url;

  if (pathname.startsWith('/ws') || e.request.method === 'POST') return;

  if (pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const clone = r.clone();
          caches.open(API_CACHE).then((cache) => {
            cache.put(e.request, clone);
            cache.put('/api/laravel/users', clone);
          });
          return r;
        })
        .catch(() => caches.match(e.request).then((cached) => {
          return cached || new Response(JSON.stringify({ error: 'offline', users: [], currentUser: null }), {
            status: 503,
            headers: { 'Content-Type': 'application/json', 'X-Offline': 'true' }
          });
        }))
    );
    return;
  }

  if (pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((r) => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(e.request, clone));
          }
          return r;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  if (pathname.startsWith('/arena') || pathname.startsWith('/dashboard')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/').then((r) => r || new Response('Offline', { status: 503 })))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const clone = r.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(e.request, clone).catch(() => {}));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || new Response('Offline', { status: 503 })))
  );
});

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'sync-game-state') {
    e.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'PERIODIC_SYNC' }));
      })
    );
  }
});

self.addEventListener('push', (e) => {
  if (!e.data) return;
  try {
    const data = e.data.json();
    self.registration.showNotification(data.title || '8-Ball Pool', {
      body: data.body || 'Your turn!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'turn-notification',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
    });
  } catch (_) {}
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const urlToOpen = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});
