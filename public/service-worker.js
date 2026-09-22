const CACHE = 'foco-v2';
const ASSETS = ['/','/index.html','/style.css','/app.js','/ai.js','/reading.js','/reading-model.js','/storage.js','/ui.js','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => { if (event.request.method !== 'GET') return; event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))); });
