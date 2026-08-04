const CACHE = 'pfc-log-shell-v1';
const ASSETS = ['./', './index.html'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(staleWhileRevalidate(req));
});

// キャッシュを即座に返し、更新の取得は裏で行う。起動時に通信を待たない。
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  const fetching = fetch(req).then(res => {
    if (!res || !res.ok) return res;
    const prevTag = cached && cached.headers.get('etag');
    const nextTag = res.headers.get('etag');
    cache.put(req, res.clone());
    if (cached && prevTag && nextTag && prevTag !== nextTag) notifyUpdate();
    return res;
  }).catch(() => null);

  if (cached) return cached;
  const res = await fetching;
  return res || new Response('オフラインのため読み込めませんでした', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

async function notifyUpdate() {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({ type: 'update-ready' }));
}
