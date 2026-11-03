const CACHE = "pondok-shell-v3";
const BASE = new URL("./", self.location.href);
const BASE_PATH = BASE.pathname;
const SHELL = [
  BASE.href,
  new URL("manifest.webmanifest", BASE).href,
  new URL("icon.svg", BASE).href
];
const STATIC_ASSET = /\.(?:js|css|woff2?|ttf|svg|png|webp|ico)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin
    || url.pathname.startsWith(`${BASE_PATH}v1/`)
    || url.pathname.startsWith(`${BASE_PATH}health/`)) return;

  if (STATIC_ASSET.test(url.pathname) || url.pathname.startsWith(`${BASE_PATH}assets/`)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") await cache.put(request, response.clone());
        return response;
      } catch {
        return cached || new Response("Aset belum tersedia secara offline.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match(BASE.href)) || Response.error()));
  }
});
