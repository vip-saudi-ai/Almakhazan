// App-shell service worker.
//
// Deliberately conservative: it caches only this origin's static shell, serves
// navigations network-first so a deployed update is never masked by a cached
// page, and never touches Firestore, Storage or Cloud Function traffic — those
// have their own offline story and must not be served stale.

const VERSION = 'v8.0.0';
const SHELL_CACHE = `almakhzan-shell-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './src/app.js',
  './src/config.js',
  './src/utils.js',
  './src/validation.js',
  './src/search.js',
  './src/firebase.js',
  './src/auth.js',
  './src/repository.js',
  './src/local-store.js',
  './src/storage.js',
  './src/ai.js',
  './src/migration.js',
  './src/exporting.js',
  './src/xlsx-writer.js',
  './src/navigation.js',
  './src/ui.js',
  './src/views/home.js',
  './src/views/detail.js',
  './src/views/item-form.js',
  './src/views/overview.js',
  './src/views/manage.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll fails the whole install if any entry 404s; add individually so a
    // single renamed file cannot brick the installation.
    await Promise.all(SHELL.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (error) {
        console.warn('[sw] could not precache', url, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('almakhzan-shell-') && name !== SHELL_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Firebase, fonts, APIs

  // Navigations: always try the network first so a new deploy wins.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match('./index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Static shell: serve from cache, then refresh it in the background.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => null);

    return cached || (await network) || Response.error();
  })());
});
