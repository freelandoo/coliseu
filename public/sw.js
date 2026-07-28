// Service worker mínimo do Coliseu.
// Objetivo: habilitar a instalação como PWA ("Adicionar à tela inicial") e dar
// um fallback offline básico — SEM cachear conteúdo dinâmico/autenticado.
//
// Estratégias:
//  - navegações (HTML): network-first, cai pra /offline.html se sem rede.
//  - estáticos imutáveis (/_next/static, /icons, ícones): cache-first.
//  - /api/*, cross-origin e métodos não-GET: passam direto (nunca cacheados).
//
// Bump CACHE_VERSION ao mudar a lista de precache ou a lógica abaixo.
const CACHE_VERSION = "coliseu-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isImmutableStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Só lida com same-origin; ignora API e qualquer cross-origin (Evolution, Asaas etc.)
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navegações (páginas): network-first + fallback offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match("/offline.html")),
      ),
    );
    return;
  }

  // Estáticos imutáveis: cache-first.
  if (isImmutableStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((resp) => {
            if (resp.ok) {
              const copy = resp.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return resp;
          }),
      ),
    );
  }
});
