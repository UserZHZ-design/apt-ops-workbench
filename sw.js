// Service Worker for 长租公寓运营工作台 PWA
const CACHE_NAME = 'apt-ops-v57';
const OFFLINE_URL = '/index.html';

const PRE_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: pre-cache core assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching core assets');
      return cache.addAll(PRE_CACHE).catch((err) => {
        console.warn('[SW] Some pre-cache items failed:', err);
      });
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first with cache fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // For navigation requests (HTML), network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh response
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // 周更数据 / 外部热榜接口：只走网络、不缓存，避免定时更新被 Service Worker 缓存成旧数据
  const reqUrl = event.request.url;
  if (reqUrl.includes('/data/') || reqUrl.includes('uapis.cn')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify({ error: 'offline', timestamp: Date.now() }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // For static assets (JS, CSS, images, fonts), cache-first
  if (
    event.request.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|json)$/) ||
    event.request.url.includes('cdnjs') ||
    event.request.url.includes('googleapis')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // For API/dynamic requests, network-only with timeout fallback
  event.respondWith(
    new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        caches.match(event.request).then((cached) => {
          if (cached) resolve(cached);
          else resolve(new Response(JSON.stringify({ error: 'offline', timestamp: Date.now() }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }));
        });
      }, 3000);

      fetch(event.request)
        .then((response) => {
          clearTimeout(timeoutId);
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          resolve(response);
        })
        .catch(() => {
          clearTimeout(timeoutId);
          caches.match(event.request).then((cached) => {
            if (cached) resolve(cached);
            else resolve(new Response(JSON.stringify({ error: 'offline', timestamp: Date.now() }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }));
          });
        });
    })
  );
});

// Push notification (reserved for future)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || '有新的运营动态',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'apt-ops',
    data: data.url || '/',
    actions: [{ action: 'open', title: '查看详情' }],
  };
  event.waitUntil(
    self.registration.showNotification(data.title || '长租公寓工作台', options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data || '/');
      }
    })
  );
});
