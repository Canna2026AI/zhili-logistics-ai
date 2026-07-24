const CACHE = 'zhili-pda-shell-v2';
const SHELL = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

async function cacheProductionShell() {
  const cache = await caches.open(CACHE);
  const index = await fetch('/', { cache: 'reload' });
  if (!index.ok) throw new Error(`PDA shell fetch failed: ${index.status}`);
  await cache.put('/', index.clone());
  const html = await index.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)["?#]/g)].map(
    (match) => match[1]
  );
  await Promise.all(
    [...SHELL, ...new Set(assets)].map(async (path) => {
      const response = await fetch(path, { cache: 'reload' });
      if (!response.ok) throw new Error(`PDA shell asset fetch failed: ${path} ${response.status}`);
      await cache.put(path, response);
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheProductionShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('zhili-pda-shell-') && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put('/', response.clone()));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }
  const staticAllowed =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest';
  if (!staticAllowed || request.headers.has('authorization')) return;
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic')
            caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        })
    )
  );
});
