// Service Worker — Struktogramm PWA
// v4: does NOT call skipWaiting() automatically on install.
// The client (main.js) posts 'SKIP_WAITING' after the user confirms the reload.

const CACHE_NAME = 'struktogramm-pwa-v4';

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  // ES modules
  './js/main.js',
  './js/constants.js',
  './js/i18n.js',
  './js/state.js',
  './js/store.js',
  './js/layout.js',
  './js/validation.js',
  './js/svg-render.js',
  './js/export.js',
  './js/events.js',
];

// ── Install: pre-cache all app shell resources ────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  // Do NOT call self.skipWaiting() here.
  // The new SW waits until main.js posts 'SKIP_WAITING' (after user confirms).
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// ── Fetch: cache-first strategy ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});

// ── Message: allow client to trigger activation ───────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
