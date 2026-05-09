const CACHE = 'tomatoclock-v1';
const URLS = ['/', '/index.html', '/app.js', '/manifest.json', '/icons/tomato.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => { if (k !== CACHE) return caches.delete(k); }))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
      if (res.ok && event.request.url.startsWith(self.location.origin)) {
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, clone));
      }
      return res;
    }))
  );
});
