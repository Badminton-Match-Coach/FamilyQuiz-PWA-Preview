const CACHE_VERSION = 'family-quiz-v6';
const STATIC_CACHE = `${CACHE_VERSION}-shell`;
const TILES_CACHE = `${CACHE_VERSION}-tiles`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const MAX_CACHED_TILES = 120; // Cap map raster tiles to prevent mobile storage bloating
const MAX_RUNTIME_ITEMS = 60; // Cap other dynamic assets

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

// Helper: Trim cache to max item count (LRU eviction) to protect mobile storage
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const deleteCount = keys.length - maxItems;
      for (let i = 0; i < deleteCount; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch (err) {
    console.warn('Cache trim error:', err);
  }
}

// Install Event - cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA Service Worker: Static asset pre-caching partial error:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - clean obsolete caches
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, TILES_CACHE, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!currentCaches.includes(key)) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept or cache Vite development / source modules
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.includes('/node_modules/') ||
    url.searchParams.has('import')
  ) {
    return;
  }

  // Handle API routes when offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ 
            offline: true, 
            error: 'You are currently offline. AI features require internet connection, but all saved quizzes, cached translations, GPS map stations, and offline grading continue to work 100% offline.' 
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

  // Non-GET requests ignore caching
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

  // Map tile caching with quota limit (OpenStreetMap / Carto / etc.)
  if (url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('basemaps.cartocdn.com') || url.pathname.includes('/tiles/')) {
    event.respondWith(
      caches.match(event.request).then((cachedTile) => {
        if (cachedTile) return cachedTile;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(TILES_CACHE).then((cache) => {
              cache.put(event.request, copy);
              trimCache(TILES_CACHE, MAX_CACHED_TILES);
            });
          }
          return networkResponse;
        }).catch(() => cachedTile);
      })
    );
    return;
  }

  // Cache-first for immutable hashed Vite assets in /assets/
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        });
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
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(event.request, responseToCache);
              trimCache(RUNTIME_CACHE, MAX_RUNTIME_ITEMS);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
