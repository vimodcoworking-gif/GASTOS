// Cambia la versión al publicar cambios para que se descarte la caché anterior.
const CACHE = 'nfta-gastos-v47';
const ARCHIVOS = ['/', '/styles.css', '/app.js', '/tema.js', '/manifest.webmanifest', '/logo-vimod.png', '/icons/icon-192.png', '/icons/icon-512.png'];
// Si la red tarda más que esto (servidor dormido), se enseña la copia guardada.
const ESPERA_RED_MS = 4000;

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  // Los datos (/api) siempre van a la red: nunca se guardan gastos en la caché.
  if (ev.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Otras páginas (privacidad, términos) van directas a la red: no deben guardarse como la app.
  if (ev.request.mode === 'navigate' && url.pathname !== '/' && url.pathname !== '/index.html') return;

  // La página se guarda siempre como «/», aunque llegue con parámetros (?google=…).
  const clave = ev.request.mode === 'navigate' ? '/' : ev.request;

  // Interfaz: primero la red, para ver siempre la última versión; sin red o si tarda, la copia guardada.
  ev.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const deRed = fetch(ev.request).then((res) => {
        if (res.ok) cache.put(clave, res.clone());
        return res;
      });
      const guardado = await cache.match(clave);
      if (!guardado) return deRed;
      const tarde = new Promise((resolver) => setTimeout(() => resolver(guardado), ESPERA_RED_MS));
      return Promise.race([deRed.catch(() => guardado), tarde]);
    }),
  );
});
