// App-shell service worker.
//
// What it does, and what it must never do:
//
//   · It caches this origin's static files — the page, scripts, styles, fonts,
//     icons, brand art, the self-hosted barcode decoder — so an installed app
//     opens with no network. Everything else passes through untouched:
//     Firestore, Storage, Cloud Functions and authentication are other
//     origins; customer exports are blobs made in the page; nothing private is
//     ever fetched from, or stored in, this cache.
//
//   · It is network-first for everything it handles. A deploy is never masked
//     by a cached copy, and a page is never assembled from one release's HTML
//     and another release's scripts; the cache is what answers only when the
//     network cannot.
//
//   · It never takes over a running app. A new version installs and waits;
//     the page offers "Update available" when nothing is half done (src/pwa.js)
//     and asks it to activate then, or it activates on its own the next time
//     the app is opened. It does not skipWaiting on install, because reloading
//     someone mid-form, mid-import or mid-restore to deliver an update is
//     exactly the wrong trade.

const VERSION = 'v10.14.0';
const CACHE = `nazm-shell-${VERSION}`;
const OLD_PREFIXES = ['almakhzan-shell-', 'nazm-shell-'];

// The minimum an offline launch needs before the first successful online run
// has cached the rest (modules, locales, icons are cached as they load).
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/tokens.css',
  './styles/main.css',
  './styles/layout.css',
  './src/boot-guard.js',
  './src/app.js',
  './public/fonts/tajawal-400.woff2',
  './public/fonts/tajawal-500.woff2',
  './public/fonts/tajawal-700.woff2',
  './public/fonts/tajawal-800.woff2',
  './public/icons/favicon.svg',
  './public/icons/apple-touch-icon.png',
  './public/icons/pwa-192.png',
  './public/icons/pwa-512.png',
];

/** Only static files of this app, by extension. */
const STATIC = /\.(?:html|js|mjs|css|woff2|png|svg|webmanifest|ico|jpg|jpeg|webp)$/i;

function cacheable(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  // A launch is always the one page, whatever its query (a shortcut, a share
  // target); it is stored and answered as ./index.html.
  if (request.mode === 'navigate') return true;
  if (url.search) return false;                 // anything parameterised is not the shell
  if (url.pathname.endsWith('/sw.js')) return false;
  return STATIC.test(url.pathname) || url.pathname.endsWith('/');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One by one: addAll fails the whole install on a single 404.
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (error) {
        console.warn('[sw] could not precache', url, error);
      }
    }));
    // No skipWaiting() here — see the header.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => OLD_PREFIXES.some((prefix) => name.startsWith(prefix)) && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

// The page asks for this only when it is safe to reload (src/pwa.js).
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!cacheable(request, url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      // Only complete, same-origin, successful answers are kept.
      if (response.ok && response.type === 'basic') {
        event.waitUntil(cache.put(request.mode === 'navigate' ? './index.html' : request, response.clone()));
      }
      return response;
    } catch (error) {
      const cached = request.mode === 'navigate'
        ? (await cache.match('./index.html')) || (await cache.match('./'))
        : await cache.match(request);
      return cached || Response.error();
    }
  })());
});
