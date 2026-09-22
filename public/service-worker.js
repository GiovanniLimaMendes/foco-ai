const CACHE = 'foco-v12';
const ASSETS = ['/','/index.html','/style.css','/app.js','/ai.js','/reading.js','/reading-model.js','/storage.js','/ui.js','/executive.js','/focus-core.js','/manifest.webmanifest','/icon-192.png','/icon-512.png','/foco-ai-logo.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('foco-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => { if (event.request.method !== 'GET') return; event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))); });
