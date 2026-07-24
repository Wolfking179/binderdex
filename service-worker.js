const CACHE_VERSION = 'binderdex-v7.0.0';
const APP_CACHE = `${CACHE_VERSION}-app`;
const API_CACHE = `${CACHE_VERSION}-api`;
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=7.0.0',
  './app.js?v=7.0.0',
  './manifest.json?v=7.0.0',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/card-placeholder.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'api.tcgdex.net') {
    const isListRequest = url.search || /\/(cards|sets)$/.test(url.pathname);
    event.respondWith(isListRequest
      ? staleWhileRevalidate(request, API_CACHE, 180)
      : networkFirst(request, API_CACHE, 9000));
    return;
  }

  if (url.hostname === 'api.pokemontcg.io') {
    event.respondWith(networkFirst(request, API_CACHE, 10000));
    return;
  }

  // Beide Kartenbild-CDNs werden direkt von Safari geladen. So greifen der
  // native Bildcache und die automatischen URL-Fallbacks ohne PWA-Proxy.
  if (url.hostname === 'assets.tcgdex.net' || url.hostname === 'images.pokemontcg.io') return;

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request, APP_CACHE, 4500, './index.html'));
    } else {
      event.respondWith(staleWhileRevalidate(request, APP_CACHE, 60));
    }
  }
});

async function networkFirst(request, cacheName, timeoutMs, fallbackUrl = null) {
  const cache = await caches.open(cacheName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal, cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone());
      trimCache(cacheName, maxEntries);
    }
    return response;
  }).catch(() => cached);
  return cached || network;
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}
