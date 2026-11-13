// Cambia la versión al publicar cambios para que se descarte la caché anterior.
const CACHE = 'nfta-gastos-v64';
const ARCHIVOS = ['/', '/styles.css', '/app.js', '/tema.js', '/manifest.webmanifest', '/logo-duolab.png', '/logo-duolab-blanco.png', '/icons/app-duolab-192.png', '/icons/app-duolab-512.png'];

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

  // Interfaz: se enseña al instante la copia guardada y se actualiza por detrás (la versión nueva entra
  // al volver a abrir). Cada publicación cambia CACHE, así que la app completa se renueva junta.
  ev.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const deRed = fetch(ev.request).then((res) => {
        if (res.ok) cache.put(clave, res.clone());
        return res;
      });
      const guardado = await cache.match(clave);
      if (!guardado) return deRed;
      ev.waitUntil(deRed.catch(() => {}));
      return guardado;
    }),
  );
});

// ---------- notificaciones push ----------
self.addEventListener('push', (ev) => {
  let datos = {};
  try {
    datos = ev.data ? ev.data.json() : {};
  } catch {
    datos = { cuerpo: ev.data ? ev.data.text() : '' };
  }
  ev.waitUntil(self.registration.showNotification(datos.titulo || 'DUOLAB Gastos', {
    body: datos.cuerpo || '',
    icon: '/icons/notificacion-duolab-256.png',
    badge: '/icons/insignia-duolab-96.png',
    tag: datos.etiqueta || undefined,
    renotify: Boolean(datos.etiqueta),
    data: { url: datos.url || '/' },
  }));
});

// Tocar la notificación abre la app (o la trae al frente) en la parte indicada.
self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const destino = new URL(ev.notification.data?.url || '/', self.location.origin).href;
  ev.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const abierta = ventanas.find((c) => new URL(c.url).origin === self.location.origin);
    if (abierta) {
      await abierta.focus();
      if (destino !== self.location.origin + '/') return abierta.navigate(destino).catch(() => {});
      return undefined;
    }
    return self.clients.openWindow(destino);
  })());
});
