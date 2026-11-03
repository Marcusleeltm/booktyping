const CACHE = 'epubtype-v3';
const ASSETS = [
  './', './index.html', './styles.css',
  './epub-parser.js', './storage.js', './audio.js', './charts.js',
  './sync.js', './app.js',
  './manifest.webmanifest', './icons/icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Never cache GitHub API responses
  if (e.request.url.includes('api.github.com')) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(caches.match(e.request).then((cached) => {
    if (cached) return cached;
    return fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => cached);
  }));
});
