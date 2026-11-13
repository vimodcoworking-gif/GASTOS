// Notificaciones push de la app instalada (iPhone con iOS 16.4 o posterior, Android y PC):
// movimientos registrados solos (correo, avisos del teléfono) y recordatorios de pago.
import webpush from 'web-push';
import { Router } from 'express';
import { Ajuste, SuscripcionPush, Usuario } from './models.js';
import { ErrorHttp } from './errores.js';

let claves = null;

// Claves VAPID: las de las variables de entorno o, si no hay, unas generadas una vez y guardadas en la base.
async function clavesVapid() {
  if (claves) return claves;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    claves = { publica: process.env.VAPID_PUBLIC_KEY.trim(), privada: process.env.VAPID_PRIVATE_KEY.trim() };
  } else {
    let guardadas = (await Ajuste.findById('vapid').lean())?.valor;
    if (!guardadas?.publica) {
      const nuevas = webpush.generateVAPIDKeys();
      guardadas = { publica: nuevas.publicKey, privada: nuevas.privateKey };
      await Ajuste.updateOne({ _id: 'vapid' }, { valor: guardadas }, { upsert: true });
    }
    claves = guardadas;
  }
  webpush.setVapidDetails(`mailto:${process.env.VAPID_EMAIL?.trim() || 'avisos@vimod.app'}`, claves.publica, claves.privada);
  return claves;
}

// Texto con formato de WhatsApp (*negrita*, _cursiva_) → texto plano para la notificación.
const plano = (t) => String(t ?? '').replace(/[*_~]/g, '').replace(/\n{2,}/g, '\n').trim();

/**
 * Manda una notificación a todos los dispositivos de la persona. Nunca lanza error.
 * { titulo, cuerpo, url?, etiqueta? } — «etiqueta» agrupa: una nueva con la misma sustituye a la anterior.
 */
export async function notificar(usuarioId, { titulo, cuerpo, url = '/', etiqueta } = {}) {
  try {
    const subs = await SuscripcionPush.find({ usuario: usuarioId }).lean();
    if (!subs.length) return 0;
    await clavesVapid();
    const datos = JSON.stringify({ titulo: plano(titulo).slice(0, 80), cuerpo: plano(cuerpo).slice(0, 300), url, etiqueta });
    let enviadas = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, datos, { TTL: 24 * 3600, urgency: 'normal' });
        enviadas += 1;
      } catch (err) {
        // El dispositivo retiró el permiso o desinstaló la app: se olvida esa suscripción.
        if (err.statusCode === 404 || err.statusCode === 410) await SuscripcionPush.deleteOne({ _id: s._id });
        else console.error('Push:', err.statusCode ?? '', err.body?.slice?.(0, 120) ?? err.message);
      }
    }));
    return enviadas;
  } catch (err) {
    console.error('Push:', err.message);
    return 0;
  }
}

/** Notificación a partir de un mensaje del bot (primera línea = título, el resto = cuerpo). */
export function notificarMensaje(usuarioId, texto, { etiqueta, url } = {}) {
  const lineas = plano(texto).split('\n').map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^(para corregirlo|si algo no es correcto|si sí eran otros)/i.test(l));
  if (!lineas.length) return Promise.resolve(0);
  return notificar(usuarioId, { titulo: lineas[0], cuerpo: lineas.slice(1, 5).join('\n'), etiqueta, url });
}

export const rutasPush = Router();

rutasPush.get('/clave', async (req, res) => {
  res.json({ clave: (await clavesVapid()).publica });
});

// { suscripcion: PushSubscription.toJSON(), dispositivo? }
rutasPush.post('/suscribir', async (req, res) => {
  const s = req.body?.suscripcion;
  const endpoint = typeof s?.endpoint === 'string' ? s.endpoint : '';
  if (!/^https:\/\/[^\s]{10,800}$/.test(endpoint) || typeof s?.keys?.p256dh !== 'string' || typeof s?.keys?.auth !== 'string') {
    throw new ErrorHttp(400, 'Suscripción no válida');
  }
  const dispositivo = typeof req.body.dispositivo === 'string' ? req.body.dispositivo.slice(0, 60) : '';
  if ((await SuscripcionPush.countDocuments({ usuario: req.usuario.id })) >= 10) {
    // Como mucho 10 dispositivos: se quita el más antiguo.
    const viejo = await SuscripcionPush.findOne({ usuario: req.usuario.id }).sort({ createdAt: 1 });
    if (viejo && viejo.endpoint !== endpoint) await viejo.deleteOne();
  }
  await SuscripcionPush.updateOne(
    { endpoint },
    { $set: { usuario: req.usuario.id, keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) }, dispositivo } },
    { upsert: true },
  );
  res.json({ ok: true });
});

rutasPush.delete('/suscribir', async (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  if (endpoint) await SuscripcionPush.deleteOne({ endpoint, usuario: req.usuario.id });
  res.json({ ok: true });
});

rutasPush.post('/prueba', async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id).select('nombre');
  const enviadas = await notificar(req.usuario.id, {
    titulo: '🔔 Notificaciones activadas',
    cuerpo: `Hola ${usuario?.nombre?.split(' ')[0] ?? ''}, aquí te avisaré de cada gasto que llegue por correo o del teléfono y de tus pagos por vencer.`,
    etiqueta: 'prueba',
  });
  if (!enviadas) throw new ErrorHttp(400, 'Este dispositivo todavía no tiene las notificaciones activadas.');
  res.json({ ok: true, enviadas });
});

// Se prepara al arrancar para que la primera suscripción no espere.
export const prepararPush = () => clavesVapid().catch((err) => console.error('Push (claves):', err.message));
