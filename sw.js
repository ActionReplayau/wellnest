// Wellnest service worker: keeps the app itself on the phone so it opens fast.
// It never stores health data. Entries always come straight from the database.
const VERSION = 'wellnest-v5';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/design.css', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/util.js', 'js/store.js', 'js/body.js', 'js/charts.js', 'js/cycle.js', 'js/hormones.js', 'js/csv.js', 'js/steps.js',
  'js/screens/today.js', 'js/screens/history.js', 'js/screens/family.js', 'js/screens/report.js',
  'js/screens/settings.js', 'js/screens/trackers.js', 'js/lib/supabase.js', 'js/lib/fflate.js',
  'img/body.png', 'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// App files: try the network first so updates show up, fall back to the saved copy when offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
