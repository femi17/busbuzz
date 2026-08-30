/* BusBuzz Parent PWA — service worker
   Handles Web Push delivery + notification taps. Offline caching can be
   layered on later (e.g. Serwist); kept push-focused for now. */

const OFFLINE_CACHE = "busbuzz-offline-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
      .catch(() => {
        // Offline fallback is additive — never block install on it.
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-first for page navigations; when the network is gone entirely,
// serve the cached offline screen instead of the browser error page.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached || Response.error()),
    ),
  );
});

self.addEventListener("push", function (event) {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "BusBuzz", body: event.data.text() };
  }
  const options = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [90, 40, 90],
    tag: data.tag,
    data: { url: data.url || "/", ...data.data },
  };
  event.waitUntil(
    self.registration.showNotification(data.title || "BusBuzz", options),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
