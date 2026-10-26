/*
 * BrewSite service worker.
 *
 * Deliberately minimal: when a customer-app page fails to load because the
 * phone is offline, show a friendly offline screen instead of the browser's
 * error page. Nothing else is intercepted or cached (no API calls, no
 * dashboard or sign-in pages), so menus, prices and order status are always
 * live, and staff screens behave like any other website.
 */
const CACHE = "brewsite-offline-v2";
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

/** Customer-app pages: the app itself and the table QR landing pages. */
function isCustomerPage(url) {
  const { pathname } = new URL(url);
  return pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/t/");
}

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || !isCustomerPage(event.request.url)) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((page) => page || Response.error())),
  );
});
