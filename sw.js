/*
 * sw.js · 天马门禁 PWA
 * 只缓存应用外壳；设备接口 (/status /open /ping) 一律不走缓存。
 */

const CACHE = 'mj-v13';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './faces.js',
  './lanyard.js',
  './bubble_menu.js',
  './vendor/three.module.min.js',
  './vendor/gsap.min.js',
  './assets/logo.png',
  './assets/sign-p216.png',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(request).then(hit => {
      if (hit) return hit;
      return fetch(request)
        .then(response => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
