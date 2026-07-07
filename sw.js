const CACHE = 'promptr-v1';
const ASSETS = [
  './',
  './index.html',
  './prompter.html',
  './remote.html',
  './style.css',
  './icon.svg',
  './manifest.json',
  './js/db.js',
  './js/index.js',
  './js/prompter.js',
  './js/remote.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Only cache same-origin static assets; let Firebase/CDN requests go through
  const url = new URL(e.request.url);
  if (url.origin !== location.origin && !url.hostname.endsWith('gstatic.com')) return;
  if (url.hostname.endsWith('firebaseio.com')) return;

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
