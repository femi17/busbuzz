/* BusBuzz Parent PWA — service worker
   Handles Web Push delivery + notification taps. Offline caching can be
   layered on later (e.g. Serwist); kept push-focused for now. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
    icon: data.icon || "/icon.svg",
    badge: "/icon.svg",
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
