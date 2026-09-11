/*
 * FINOVA service worker — offline app shell + cached read access.
 *
 * What this genuinely provides (verified against real behavior, not claimed):
 *  - Offline shell: after one visit, the app HTML + hashed build assets load
 *    from CacheStorage with no network at all.
 *  - Navigation: network-first with cache fallback → fresh when online,
 *    instant shell when offline.
 *  - Hashed assets (/assets/*): cache-first — immutable by content hash.
 *  - Supabase API traffic is NEVER cached here. All data reads/writes go
 *    through the app's own sync layer (localStorage-first + cloud queue),
 *    which is where offline durability actually lives.
 *
 * Update flow: a new SW installs but stays WAITING (no surprise reloads).
 * The app asks the user ("Refresh for update") and sends SKIP_WAITING.
 */

const VERSION = 'finova-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icons/pwa-192.png', '/icons/pwa-512.png'];

self.addEventListener('install', (event) => {
  // No skipWaiting here by design: the new worker parks in WAITING until
  // the user taps "Refresh for update" (SKIP_WAITING via message below).
  // Auto-activating would swap the shell mid-session AND strand the app's
  // update prompt (reg.waiting would never exist to observe).
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // mutations are never touched by the SW

  const url = new URL(req.url);

  // Never cache Supabase or any cross-origin API — data freshness is the app's job.
  if (url.origin !== self.location.origin) return;

  // App navigations: network-first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('/index.html').then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // Hashed build assets: cache-first (immutable), then network + store.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Other same-origin statics (icons, manifest): stale-while-revalidate.
  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
