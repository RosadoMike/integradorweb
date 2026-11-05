const CACHE_NAME = 'campolisto-shell-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('campolisto-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) await (await caches.open(CACHE_NAME)).put('/index.html', response.clone());
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) ?? Response.error())
    );
    return;
  }

  const refreshPromise = fetch(event.request).then((response) => {
    if (response.ok) {
      return caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone())).then(() => response);
    }
    return response;
  });
  event.waitUntil(refreshPromise.then(() => undefined, () => undefined));
  event.respondWith(caches.match(event.request).then((cachedResponse) => cachedResponse ?? refreshPromise));
});
