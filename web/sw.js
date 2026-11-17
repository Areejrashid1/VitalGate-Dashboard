// Service worker: makes the console installable and keeps the app shell (HTML/CSS/JS/icons) available when the
// server restarts. API data is never cached: security data must always be live or clearly unavailable.
const V = "vg-shell-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || !u.pathname.startsWith("/static/")) return;   // API + pages: network only
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const c = r.clone(); caches.open(V).then((cache) => cache.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
