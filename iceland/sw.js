// The Iceland planner moved to ../iceland-planner/. This replaces the old service worker at /iceland/:
// it deletes the old 'iceland-*' caches, unregisters itself and sends open pages to the new address.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('iceland-')) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(new URL('../iceland-planner/', self.registration.scope).href);
  })());
});
