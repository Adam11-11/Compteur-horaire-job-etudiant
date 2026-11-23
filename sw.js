// ==========================================
// SERVICE WORKER — CACHE APP SHELL (OFFLINE-FIRST)
// ==========================================
const CACHE_NAME = 'compteur-paella-v102';
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
  './css/base.css?v=186',
  './css/layout-v2.css?v=198',
  './css/calendar.css?v=197',
  './css/photos.css',
  './css/features.css?v=191',
  './css/pixel-polish.css?v=187',
  './js/config.js?v=193',
  './js/audio.js',
  './js/utils.js?v=196',
  './js/animations.js?v=193',
  './js/photos.js?v=198',
  './js/shifts.js?v=197',
  './js/render.js?v=197',
  './js/calendar.js?v=193',
  './js/features.js?v=196',
  './js/ai.js?v=188',
  './js/auth.js?v=188',
  './js/main.js?v=173'
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

