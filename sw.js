/* Kit Up offline support.
   Pages and data: network first, so you always get the latest meta and patches, with the saved copy as backup.
   Images and fonts: saved copy first, since they rarely change. */
const VERSION = 'kitup-2026-10-22c';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'icons/logo-96.webp', 'icons/logo-192.webp', 'icons/logo-512.webp', 'icons/logo-180.png', 'icons/logo-192.png',
  'data/game.json', 'data/news.json', 'data/patches.json', 'data/shop.json', 'data/meta.json', 'data/tiers.json',
  'data/maps.json', 'data/attachments.json', 'data/dmz.json', 'data/progress.json', 'data/history.json',
  'images/camos/mercurial-drift.webp', 'images/camos/polyatomic-reforged.webp'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// After the app shell is saved, quietly save gun and camo pictures too, so the Arsenal and Camos tabs work offline.
async function warmImages() {
  try {
    const c = await caches.open(VERSION);
    const res = await c.match('data/game.json');
    if (!res) return;
    const txt = await res.text();
    const urls = [...new Set(txt.match(/images\/(guns|camos)\/[\w.-]+\.(webp|png|jpg)/g) || [])];
    for (const u of urls) {
      if (!(await c.match(u))) { try { await c.add(u); } catch (err) {} }
    }
  } catch (err) {}
}

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('kitup-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => { warmImages(); })
  );
});

async function networkFirst(req) {
  const c = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res && res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const page = await c.match('index.html');
      if (page) return page;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const c = await caches.open(VERSION);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (req.mode === 'navigate' || (same && /\.(json|html|webmanifest)$/.test(url.pathname))) {
    e.respondWith(networkFirst(req));
  } else if ((same && /\.(webp|png|jpg|svg|woff2?)$/.test(url.pathname)) || /(^|\.)fonts\.(gstatic|googleapis)\.com$/.test(url.hostname)) {
    e.respondWith(cacheFirst(req));
  }
});
