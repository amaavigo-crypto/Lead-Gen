const CACHE_NAME = 'amaavigo-lead-shell-v2';
const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/amaavigo-logo.png',
  '/icons/amaavigo-app.svg',
  '/icons/amaavigo-app-192.png',
  '/icons/amaavigo-app-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL_ASSETS.map(async (path) => {
      try {
        const response = await fetch(path, { cache: 'reload' });
        if (response.ok && response.type === 'basic') await cache.put(path, response);
      } catch {
        // A failed optional shell asset must not prevent installation.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('amaavigo-lead-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache API calls, auth endpoints, customer records, conversations or other dynamic data.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
      }
      return response;
    }).catch(async () => {
      const cachedShell = await caches.match('/');
      return cachedShell || new Response('Amaavigo is offline. Reconnect to load your workspace.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }));
    return;
  }

  const isStaticAsset = url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/amaavigo-logo.png';

  if (isStaticAsset) {
    event.respondWith(caches.match(request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }));
  }
});
