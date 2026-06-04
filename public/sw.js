/* Helm service worker — app-shell cache for installable/offline use.
   Stale-while-revalidate for GET assets; always-fresh for live data. */
const CACHE = "helm-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never cache live data or the connectors — always pull fresh numbers.
  if (url.pathname.endsWith("/data.json")) return;
  if (url.pathname.startsWith("/api/")) return;
  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

/* ── Push: the morning Brief alert ("3 things need you") ──────────────────────
   Real web-push delivers a payload here; the in-app opt-in also uses
   showNotification directly for a demoable local notification without a push
   server. */
self.addEventListener("push", (event) => {
  let data = { title: "Helm", body: "Your morning brief is ready." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* non-JSON payload — keep the default */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: "helm-brief",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      return existing ? existing.focus() : self.clients.openWindow("/");
    }),
  );
});
