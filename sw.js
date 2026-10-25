const CACHE_NAME = "summon-pwa-v1.10";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg"
];

// 1. Install & cache initial shell
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting(); // Force active immediately
});

// 2. Clean up old version caches automatically
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// 3. NETWORK-FIRST STRATEGY (Prevents stale cache lockup)
self.addEventListener("fetch", (e) => {
  // Let Firebase and ntfy requests pass directly through
  if (e.request.url.includes("firestore") || e.request.url.includes("ntfy.sh")) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // If network fetch succeeds, update the local cache in the background
        if (networkResponse && networkResponse.status === 200 && e.request.method === "GET") {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If offline / no internet, fall back to the cached copy
        return caches.match(e.request);
      })
  );
});
