// ==========================================
// SERVICE WORKER — CACHE APP SHELL (OFFLINE-FIRST)
// ==========================================
const CACHE_NAME = 'compteur-paella-v45';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-192.png',
  './assets/icon-maskable-512.png',
  './css/base.css',
  './css/layout-v2.css',
  './css/calendar.css',
  './css/photos.css',
  './css/features.css',
  './css/pixel-polish.css',
  './js/config.js',
  './js/audio.js',
  './js/utils.js',
  './js/animations.js',
  './js/photos.js',
  './js/shifts.js',
  './js/render.js',
  './js/calendar.js',
  './js/features.js',
  './js/ai.js',
  './js/auth.js',
  './js/main.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => { })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Ne pas intercepter les appels API Supabase (gérés par le mode offline-first JS)
  if (url.hostname.includes('supabase.co')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && (url.origin === self.location.origin || url.hostname.includes('fonts.g') || url.hostname.includes('cdn.jsdelivr.net'))) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => { });
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});

