/**
 * textLove Scoped Progressive Web App Service Worker
 *
 * PRIVACY INVARIANT & ZERO RETENTION POLICY:
 * - This service worker caches ONLY static application shell assets (HTML, CSS, JS, fonts, icons).
 * - Under NO CIRCUMSTANCES does this service worker ever cache:
 *     1. Message plaintext or decrypted conversation transcripts.
 *     2. Message ciphertext or initialization vectors (IVs).
 *     3. WebSocket traffic or socket.io network packets.
 *     4. API responses (/api/*) or authentication tokens/cookies.
 *     5. User private or identity cryptographic keys.
 * - Offline messaging or store-and-forward queueing is strictly forbidden.
 */

const CACHE_NAME = 'textlove-static-v1';

const STATIC_PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/icon-maskable.svg',
];

// 1. Install Phase: Precache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 2. Activate Phase: Purge obsolete cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 3. Message Event: Safe update activation trigger
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch Interception with Strict Privacy Boundaries
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // A. EXCLUDE NON-GET REQUESTS
  if (request.method !== 'GET') {
    return;
  }

  // B. STRICT PRIVACY EXCLUSION: Never intercept or cache API or WebSocket requests
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io/') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:'
  ) {
    // Let all API and WebSocket requests pass straight through to network
    return;
  }

  // C. Navigation Requests (HTML App Shell)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((cached) => {
          if (cached) return cached;
          return caches.match('/');
        })
      )
    );
    return;
  }

  // D. Static Assets (JS, CSS, Images, Fonts, Manifest): Cache-first with network refresh
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached and refresh in background for non-sensitive static assets
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // Only cache static file extensions
        const pathname = url.pathname;
        if (
          pathname.endsWith('.js') ||
          pathname.endsWith('.css') ||
          pathname.endsWith('.svg') ||
          pathname.endsWith('.png') ||
          pathname.endsWith('.woff2') ||
          pathname.endsWith('.webmanifest')
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        }

        return networkResponse;
      });
    })
  );
});
