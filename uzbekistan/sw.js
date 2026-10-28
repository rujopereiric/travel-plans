// Offline support: app files network-first (so edits to data.json show up when online),
// Leaflet and map tiles cache-first (tiles you've viewed stay available offline).
// Only uzbekistan-* caches are touched: the other planners on this origin keep theirs.
const APP = 'uzbekistan-app-v2', TILES = 'uzbekistan-tiles-v1', IMGS = 'uzbekistan-imgs-v1', MAX_TILES = 3000;
const SHELL = ['./', 'index.html', 'app.js', 'data.json', 'manifest.webmanifest', 'icon.svg', 'icon-192.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('uzbekistan-') && k !== APP && k !== TILES && k !== IMGS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trimCache(name, max) {
  const c = await caches.open(name), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}
const trimTiles = () => trimCache(TILES, MAX_TILES);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname.endsWith('tile.openstreetmap.org') || url.hostname === 'server.arcgisonline.com') {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      try {
        const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); // CORS: opaque responses count as MBs each
        if (res.ok) c.put(req.url, res.clone()).then(trimTiles).catch(() => {});
        return res;
      } catch (err) { try { return await fetch(req); } catch (e2) { return new Response('', { status: 504 }); } }
    }));
    return;
  }
  if (url.hostname === 'upload.wikimedia.org') { // place photos: keep for offline
    // fetch in CORS mode (Wikimedia allows it) so we can see the status and only cache real images,
    // never an opaque error page
    e.respondWith(caches.open(IMGS).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      try {
        const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
        if (res.ok) c.put(req.url, res.clone()).then(() => trimCache(IMGS, 200)).catch(() => {});
        return res;
      } catch (err) { return fetch(req); }
    }));
    return;
  }
  if (req.destination === 'image' && url.origin !== location.origin) { // other place photos (E29.eu albums, guide sites)
    // Only keep a photo when we can see it really loaded (a CORS response with an OK status and an image type).
    // Sites without CORS still show their photos online (plain request, no referrer, so hotlink checks pass), but an
    // opaque response could be an error page, so it's never cached: a failed load must not stick.
    e.respondWith(caches.open(IMGS).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      try {
        const res = await fetch(req.url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (res.ok && (res.headers.get('content-type') || '').startsWith('image/')) { c.put(req.url, res.clone()).then(() => trimCache(IMGS, 200)).catch(() => {}); return res; }
      } catch (err) { }
      try { return await fetch(req.url, { mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer' }); }
      catch (e2) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.hostname === 'unpkg.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(APP).then(c => c.put(req, copy)); } // never keep an error page
      return res;
    })));
    return;
  }
  if (url.origin === location.origin) {
    // revalidate with the server every time (cheap 304s) so a new deploy shows up immediately,
    // instead of waiting out GitHub Pages' 10-minute browser cache
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(APP).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
  }
});
