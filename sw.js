const CACHE_NAME = "focusdeck-shell-v9";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=7",
  "./app.js?v=7",
  "./manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache live Supabase API, Auth, or Edge Function calls
  if (url.hostname.endsWith("supabase.co")) {
    return;
  }

  // Same-origin HTML, CSS, JS, Manifest: Network-First so deploys show immediately, with offline cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request, { cache: "no-cache" })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            if (request.mode === "navigate") return caches.match("./index.html");
            return undefined;
          })
        )
    );
    return;
  }

  // Fonts & ESM CDN: Stale-While-Revalidate for fast offline boot
  const isExternalAsset =
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com" ||
    url.hostname === "cdn.jsdelivr.net" ||
    url.hostname === "esm.sh";

  if (!isExternalAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
