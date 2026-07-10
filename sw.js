const CACHE_NAME = "wh3pickle-cache-v1";
const APP_SHELL_FILES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/assets/wh3pickle/logo.png",
];
const IS_LOCALHOST =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname === "[::1]";

if (IS_LOCALHOST) {
  // Safety valve: never keep an SW active on localhost.
  self.addEventListener("install", () => {
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      self.registration.unregister().then(() => self.clients.claim())
    );
  });
} else {
  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
    );
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
    );
    self.clients.claim();
  });

  self.addEventListener("fetch", (event) => {
    // Ignore non-GET and problematic browser preload requests.
    if (event.request.method !== "GET") return;
    if (
      event.request.cache === "only-if-cached" &&
      event.request.mode !== "same-origin"
    ) {
      return;
    }

    // Always serve app shell for navigation requests while offline.
    if (event.request.mode === "navigate") {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put("/index.html", responseClone);
            });
            return response;
          })
          .catch(async () => {
            const cachedShell =
              (await caches.match("/index.html")) ||
              (await caches.match("/"));
            return (
              cachedShell ||
              new Response("Offline - app shell unavailable", {
                status: 503,
                headers: { "Content-Type": "text/plain" },
              })
            );
          })
      );
      return;
    }

    // Cache-first for static same-origin assets; network fallback for misses.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (
            response &&
            response.status === 200 &&
            new URL(event.request.url).origin === self.location.origin
          ) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
  });
}
