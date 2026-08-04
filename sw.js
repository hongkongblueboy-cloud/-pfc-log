const CACHE = 'pfc-log-shell-v2';
const ASSETS = ['./', './index.html'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.filter(k => k !== CACHE);
    await Promise.all(stale.map(k => caches.delete(k)));
    await self.clients.claim();
    // 古いキャッシュがあった = 版が入れ替わったので、開いている画面に知らせる
    if (stale.length) await notifyUpdate();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(staleWhileRevalidate(event));
});

// キャッシュを即座に返し、更新の取得は裏で行う。起動時に通信を待たない。
async function staleWhileRevalidate(event) {
  const req = event.request;
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });

  const fetching = fetch(req).then(async res => {
    if (!res || !res.ok) return res;
    const prevTag = cached && cached.headers.get('etag');
    const nextTag = res.headers.get('etag');
    await cache.put(req, res.clone());
    if (cached && prevTag && nextTag && prevTag !== nextTag) await notifyUpdate();
    return res;
  }).catch(() => null);

  // 応答を返した後もこの取得が打ち切られないようにする(これが無いと更新が永久に届かない)
  event.waitUntil(fetching);

  if (cached) return cached;
  const res = await fetching;
  return res || new Response('オフラインのため読み込めませんでした', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

async function notifyUpdate() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ type: 'update-ready' }));
}
