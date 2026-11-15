// Service worker de Cobrandoo: permite abrir la app sin internet.
// - Archivos estáticos (_next/static, íconos): caché primero.
// - Páginas: red primero; sin red, la última versión guardada o la página /offline.
// - APIs y escrituras: nunca se cachean (la cola de la app se encarga de reintentar).
const VERSION = "v1";
const ESTATICOS = `cobrandoo-estaticos-${VERSION}`;
const PAGINAS = `cobrandoo-paginas-${VERSION}`;
const ESENCIALES = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png"];
const ESPERA_RED_MS = 6000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGINAS).then((c) => c.addAll(ESENCIALES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith("cobrandoo-") && ![ESTATICOS, PAGINAS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Mensajes desde la app: precargar pantallas clave o borrar todo al cerrar sesión
self.addEventListener("message", (e) => {
  const { tipo, rutas } = e.data ?? {};
  if (tipo === "precargar" && Array.isArray(rutas)) {
    e.waitUntil(
      caches.open(PAGINAS).then((c) =>
        Promise.all(
          rutas.map((r) =>
            fetch(r, { credentials: "same-origin", redirect: "manual" })
              .then((res) => res.ok && res.type === "basic" && c.put(clave(r), res))
              .catch(() => {})
          )
        )
      )
    );
  }
  if (tipo === "limpiar") {
    e.waitUntil(caches.delete(PAGINAS).then(() => caches.open(PAGINAS)).then((c) => c.addAll(ESENCIALES)));
  }
});

/** Clave de caché de una página: solo la ruta (sin ?query), para que /prestamos/nuevo?cliente=x use el mismo cascarón. */
function clave(url) {
  const u = new URL(url, self.location.origin);
  return new Request(u.origin + u.pathname);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Estáticos con hash: caché primero
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) caches.open(ESTATICOS).then((c) => c.put(req, res.clone()));
            return res;
          })
      )
    );
    return;
  }

  // Peticiones RSC de la navegación interna de Next: solo red. Si falla, Next hace una
  // navegación completa y esa sí la atiende el bloque de abajo con la página guardada.
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (req.mode === "navigate") {
    e.respondWith(paginaRedPrimero(req));
  }
});

async function paginaRedPrimero(req) {
  const cache = await caches.open(PAGINAS);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("lento")), ESPERA_RED_MS)),
    ]);
    // Guardar solo páginas propias exitosas (no redirecciones al login)
    if (res.ok && !res.redirected && res.type === "basic") cache.put(clave(req.url), res.clone());
    return res;
  } catch {
    return (await cache.match(clave(req.url))) ?? (await cache.match("/offline")) ?? Response.error();
  }
}
