const CACHE_NAME = 'family-quiz-pwa-preview-v1';
const APP_SCOPE = self.registration.scope;

const STATIC_ASSETS = [
  new URL('./', APP_SCOPE).toString(),
  new URL('./index.html', APP_SCOPE).toString(),
  new URL('./manifest.webmanifest', APP_SCOPE).toString(),
  new URL('./icon.svg', APP_SCOPE).toString(),
  new URL('./icon.png', APP_SCOPE).toString(),
  new URL('./pwa-192.png', APP_SCOPE).toString(),
  new URL('./pwa-512.png', APP_SCOPE).toString(),
  new URL('./apple-touch-icon.png', APP_SCOPE).toString(),
  new URL('./favicon.png', APP_SCOPE).toString(),
  new URL('./icon.jpg', APP_SCOPE).toString()
];

// Install Event - cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA Service Worker: Static asset pre-caching partial error:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - clean obsolete caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Dynamic Stale-while-revalidate & SPA offline navigation fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle API routes when offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ 
            offline: true, 
            error: 'You are currently offline. AI question generation and online AI translations require internet connection, but all saved quizzes, cached translations, GPS map stations, and offline grading continue to work 100% offline.' 
          }),
          { 
            status: 503, 
            headers: { 'Content-Type': 'application/json' } 
          }
        );
      })
    );
    return;
  }

  // Non-GET requests (POST, etc.) ignore caching
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle SPA navigation requests (e.g. page loads or reloads)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(new URL('./index.html', APP_SCOPE).toString()) ||
          caches.match(new URL('./', APP_SCOPE).toString());
      })
    );
    return;
  }

  // Stale-While-Revalidate for standard assets (scripts, styles, images, fonts)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse && 
            networkResponse.status === 200 && 
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
