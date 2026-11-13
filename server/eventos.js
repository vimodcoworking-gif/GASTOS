// Avisos en tiempo real a la app abierta (Server-Sent Events): cuando entra un movimiento por correo,
// por el atajo del iPhone, por WhatsApp o lo registra otra persona del libro, la app se actualiza sola.
import { Router } from 'express';
import { Libro } from './models.js';

const conexiones = new Map(); // id de usuario → Set de respuestas abiertas

export const rutasEventos = Router();

rutasEventos.get('/', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Que ningún intermediario (proxy de Render) guarde los mensajes antes de enviarlos.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  const id = String(req.usuario.id);
  const lista = conexiones.get(id) ?? new Set();
  lista.add(res);
  conexiones.set(id, lista);
  escribir(res, 'hola', { ok: true });
  // Latido cada 25 s: mantiene viva la conexión a través de los proxies.
  const latido = setInterval(() => escribir(res, 'latido', {}), 25_000);
  req.on('close', () => {
    clearInterval(latido);
    lista.delete(res);
    if (!lista.size) conexiones.delete(id);
  });
});

function escribir(res, evento, datos) {
  try {
    res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
    res.flush?.(); // compression: envía ya, sin esperar a llenar el búfer
  } catch {
    // Conexión cerrada: se limpia en «close».
  }
}

// Varios cambios seguidos del mismo libro (una lista de 10 yapes) se avisan una sola vez.
const pendientes = new Map();

/** Avisa a todas las personas con acceso al libro de que sus movimientos cambiaron. */
export function avisarCambio(libroId, detalle = {}) {
  if (!libroId || !conexiones.size) return;
  const clave = String(libroId);
  clearTimeout(pendientes.get(clave)?.t);
  const acumulado = (pendientes.get(clave)?.nuevos ?? 0) + (detalle.nuevos ?? 0);
  pendientes.set(clave, {
    nuevos: acumulado,
    t: setTimeout(async () => {
      pendientes.delete(clave);
      try {
        const libro = await Libro.findById(clave).select('propietario miembros').lean();
        if (!libro) return;
        const personas = [libro.propietario, ...(libro.miembros ?? []).map((m) => m.usuario)].map(String);
        for (const p of personas) for (const res of conexiones.get(p) ?? []) escribir(res, 'cambio', { libro: clave, nuevos: acumulado });
      } catch {
        // Sin base de datos: la app se actualizará al volver a abrirla.
      }
    }, 600),
  });
}
