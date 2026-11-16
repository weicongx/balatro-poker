// Service worker: the only place the app caches anything.
//
// VERSION is the single source of truth for the app version. Bump it with
// every deploy. Changing this file makes browsers install the new worker,
// which then deletes the previous version's cache. The page asks the worker
// for VERSION to show it in the footer.
const VERSION = '31';
const CACHE = `balatro-v${VERSION}`;

// Versioned CDN files never change at a given URL: cache-first.
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
];
// The app shell. index.html is stored under SHELL whatever URL it was loaded from.
const SHELL = new URL('./', self.location).href;
const PRECACHE = [SHELL, new URL('manifest.json', self.location).href];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the HTTP cache so a new version gets fresh files.
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    await cache.addAll(CDN);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') event.respondWith(networkFirst(event));
  else if (CDN.includes(url.href)) event.respondWith(cacheFirst(req));
  else if (url.origin === self.location.origin) event.respondWith(staleWhileRevalidate(event));
  // Anything else goes straight to the network.
});

// Pages: try the network so updates show up on the next launch; fall back to
// the cached shell when offline or when the network takes too long.
async function networkFirst(event) {
  const cache = await caches.open(CACHE);
  const network = fetch(event.request).then((res) => {
    if (res.ok) cache.put(SHELL, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  try {
    return await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
  } catch {
    const cached = await cache.match(SHELL);
    return cached || network;
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

// Other same-origin files (manifest.json): answer from cache, refresh in the background.
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const network = fetch(event.request).then((res) => {
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}
