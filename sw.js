// ============================================================
// Friday Decider — service worker
// Cache-first for the app shell so the app opens instantly and
// offline. Weather uses network-first with a cache fallback.
// Firestore has its own offline persistence — we never touch its
// requests here (let the SDK manage them).
// Bump CACHE on any shell change to invalidate old caches.
// ============================================================
const CACHE = "friday-shell-v1";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./ui.js",
  "./firestore.js",
  "./weather.js",
  "./packing.js",
  "./data.js",
  "./util.js",
  "./config.js",
  "./manifest.json",
  "./icons/apple-touch-icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Let Firebase/Firestore + Google SDKs manage their own traffic.
  if (/firestore|googleapis|gstatic|firebaseio/.test(url.hostname)) return;

  // Weather: network-first, fall back to the last cached response.
  if (url.hostname.includes("open-meteo.com")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App shell + same-origin assets: cache-first, fill cache on miss.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }).catch(() => cached)
      )
    );
  }
});
