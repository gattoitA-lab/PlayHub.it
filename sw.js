/* PlayHub service worker: riceve le notifiche push anche a sito chiuso. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Le risorse vanno risolte rispetto alla cartella del service worker: così
// funzionano sia su Render (radice) sia su GitHub Pages (/PlayHub.it/).
const scopeAsset = (value, fallback) => {
  if (value && /^https?:/i.test(value)) return value;
  const relative = String(value || fallback).replace(/^\//, "");
  return new URL(relative, self.registration.scope).href;
};

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const kind = data.kind || "info";
  const title = data.title || "PlayHub";
  const options = {
    body: data.body || "Hai una nuova notifica su PlayHub",
    icon: scopeAsset(data.icon, "icons/icon-192.png"),
    badge: scopeAsset(data.badge, "icons/badge-72.png"),
    tag: data.tag || `playhub-${kind}`,
    renotify: !!data.renotify,
    requireInteraction: !!data.requireInteraction,
    timestamp: Date.now(),
    vibrate: kind === "call" ? [500, 180, 500, 180, 500] : [90, 40, 90],
    data: {
      url: data.url || "/",
      kind,
    },
    actions: kind === "call" ? [{ action: "open", title: "Apri" }] : [],
  };

  event.waitUntil(
    (async () => {
      // La notifica va mostrata sempre, anche con l'app aperta: Safari su iOS
      // revoca il permesso se una push arriva senza avviso visibile.
      try {
        await self.registration.showNotification(title, options);
      } catch (error) {
        // Safari/iOS è più severo sulle opzioni: se una non è supportata
        // riprova con il minimo indispensabile, invece di perdere l'avviso.
        await self.registration.showNotification(title, {
          body: options.body,
          icon: options.icon,
          tag: options.tag,
          data: options.data,
        });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = event.notification.data?.url || "/";
  // "/" significa "la pagina dell'app": non la radice del dominio, che su
  // GitHub Pages non è PlayHub.
  const target =
    requested === "/"
      ? self.registration.scope
      : new URL(String(requested).replace(/^\//, ""), self.registration.scope).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Prendi una scheda di PlayHub, non la prima finestra qualsiasi.
      const appWindow = windows.find((client) =>
        client.url.startsWith(self.registration.scope),
      );
      if (appWindow) {
        await appWindow.focus();
        // Non ricaricare la pagina se è già quella giusta: una ricarica
        // interromperebbe la chiamata in corso.
        if ("navigate" in appWindow && appWindow.url !== target) {
          try {
            await appWindow.navigate(target);
          } catch {
            /* la scheda è già aperta: va bene così */
          }
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((windows) => {
      windows.forEach((client) => client.postMessage({ type: "playhub-resubscribe" }));
    }),
  );
});
