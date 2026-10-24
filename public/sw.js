/*
 * BrewSite service worker.
 *
 * Deliberately minimal: when a page load fails because the phone is offline,
 * show a friendly offline screen instead of the browser's error page. Nothing
 * else is intercepted or cached (no API calls, no dashboard data), so menus,
 * prices and order status are always live.
 */
const CACHE = "brewsite-offline-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((page) => page || Response.error())),
  );
});
