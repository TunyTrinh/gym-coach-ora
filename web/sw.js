const CACHE_NAME = "coachora-shell-e4c8b6719778de2c86ba";
const APP_SHELL = ["/", "/offline.html", "/manifest.json", "/release.json", "/favicon-32.png", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png"];

function isCacheableAsset(requestUrl) {
  return requestUrl.pathname.startsWith("/_expo/")
    || requestUrl.pathname === "/manifest.json"
    || requestUrl.pathname === "/release.json"
    || requestUrl.pathname === "/offline.html"
    || /\.(?:css|js|png|svg|ico|woff2?)$/i.test(requestUrl.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put("/", response.clone()));
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || caches.match("/offline.html")))
    );
    return;
  }

  if (!isCacheableAsset(requestUrl)) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
