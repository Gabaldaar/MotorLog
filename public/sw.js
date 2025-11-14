// public/sw.js

const CACHE_NAME = 'motorlog-cache-v2'; // Incrementado para forzar actualización
const urlsToCache = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

self.addEventListener('install', event => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('[Service Worker] Activate');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // IMPORTANT: Do not intercept Firestore API requests.
  // This allows Firestore's own offline persistence to work.
  if (request.url.includes('firestore.googleapis.com')) {
    return; // Let the network request happen.
  }
  
  // For navigation requests (e.g., loading a page), use Stale-While-Revalidate.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(request).then(cachedResponse => {
          const fetchPromise = fetch(request).then(networkResponse => {
            // If the network request is successful, update the cache.
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(error => {
            // The network failed, but this is not a fatal error if we have a cached response.
            console.warn('[Service Worker] Network request failed during revalidation:', error);
          });
          
          // Return the cached response immediately, then let the fetch happen in the background.
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // For other requests (CSS, JS, images), use Cache First strategy.
  event.respondWith(
    caches.match(request).then(response => {
      // Return from cache, or fetch from network if not in cache.
      return response || fetch(request).then(networkResponse => {
        // And cache the new resource for next time.
        if (networkResponse && networkResponse.status === 200) {
             caches.open(CACHE_NAME).then(cache => {
                cache.put(request, networkResponse.clone());
             });
        }
        return networkResponse;
      });
    })
  );
});


// === PUSH NOTIFICATION LOGIC ===
self.addEventListener('push', function (event) {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192x192.png',
    badge: '/icon-192x192.png',
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  // By default, focus the app window if it's already open.
  event.waitUntil(clients.matchAll({
    type: "window"
  }).then(function(clientList) {
    for (var i = 0; i < clientList.length; i++) {
      var client = clientList[i];
      if ('focus' in client) {
        return client.focus();
      }
    }
    if (clients.openWindow) {
      return clients.openWindow('/');
    }
  }));
});
