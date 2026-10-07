// Travel Plans home screen: keeps the trip list working offline.
// Each destination (iceland/, egypt/, portugal/, portugal-kids/, jordan/, uzbekistan/, ireland/, netherlands/, denmark/) has its own service worker; this one only touches tp-home-* caches.
const HOME = 'tp-home-v4';
const SHELL = ['./', 'index.html', 'home.js', 'trips.json', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'shortcut-iceland.png', 'shortcut-egypt.png', 'shortcut-portugal.png', 'shortcut-portugal-kids.png', 'shortcut-jordan.png', 'shortcut-uzbekistan.png', 'shortcut-ireland.png', 'shortcut-netherlands.png', 'shortcut-denmark.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(HOME).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('tp-home-') && k !== HOME).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // only the home screen's own files (the destinations' service workers handle their folders)
  const rel = url.pathname.slice(new URL('./', location.href).pathname.length);
  if (rel.includes('/') && !rel.endsWith('data.json')) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(HOME).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
