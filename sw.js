/* Cache offline de arquivos estáticos; nunca interceptar API de downloads. */
const VERSION = 'termo-github-releases-v2';
const CORE = [
  '/', '/index.html', '/manifest.webmanifest', '/assets/icon.svg',
  '/windows-download.js', '/windows-download.css', '/termo-abrir-direto.html'
];
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(VERSION);
  await cache.addAll(CORE);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith('termo-') && key !== VERSION) await caches.delete(key);
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(event.request, {ignoreSearch: event.request.mode === 'navigate'});
    if (cached) return cached;
    try {
      const result = await fetch(event.request);
      if (result.ok) cache.put(event.request, result.clone()).catch(() => {});
      return result;
    } catch {
      if (event.request.mode === 'navigate') {
        const home = await cache.match('/index.html');
        if (home) return home;
      }
      return Response.error();
    }
  })());
});
