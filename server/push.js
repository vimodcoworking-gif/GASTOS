// Notificaciones push de la app instalada (iPhone con iOS 16.4 o posterior, Android y PC):
// movimientos registrados solos (correo, avisos del teléfono) y recordatorios de pago.
import webpush from 'web-push';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { Ajuste, SuscripcionPush, TokenApp, Usuario } from './models.js';
import { avisarUsuario } from './eventos.js';
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

// ---------- App Android nativa: Firebase Cloud Messaging (FCM, API HTTP v1) ----------
// Se activa con dos variables de entorno, pegando el contenido de los archivos que da Firebase:
//   FIREBASE_SERVICE_ACCOUNT  → la clave de la cuenta de servicio (JSON, secreta)
//   FIREBASE_GOOGLE_SERVICES  → google-services.json de la app Android (no es secreto: va dentro de la app)
// Sin ellas la app sigue revisando cada 15 minutos.
const PAQUETE = 'pe.duolab.gastos';
const leerJson = (v) => {
  const t = String(v ?? '').trim();
  if (!t) return null;
  try { return JSON.parse(t.startsWith('{') ? t : Buffer.from(t, 'base64').toString('utf8')); } catch { return null; }
};

/** Datos públicos de Firebase que la app necesita para recibir avisos, o null si no está configurado. */
export function configFirebaseApp() {
  const cuenta = leerJson(process.env.FIREBASE_SERVICE_ACCOUNT);
  const servicios = leerJson(process.env.FIREBASE_GOOGLE_SERVICES);
  if (!cuenta?.private_key || !cuenta?.client_email || !servicios?.project_info) return null;
  const cliente = (servicios.client ?? []).find((c) => c.client_info?.android_client_info?.package_name === PAQUETE);
  const config = {
    apiKey: cliente?.api_key?.[0]?.current_key,
    appId: cliente?.client_info?.mobilesdk_app_id,
    projectId: servicios.project_info.project_id,
    senderId: servicios.project_info.project_number,
  };
  return Object.values(config).every(Boolean) ? config : null;
}

let accesoFcm = { token: null, vence: 0 };
async function tokenAccesoFcm() {
  if (accesoFcm.token && Date.now() < accesoFcm.vence) return accesoFcm.token;
  const cuenta = leerJson(process.env.FIREBASE_SERVICE_ACCOUNT);
  const ahora = Math.floor(Date.now() / 1000);
  const afirmacion = jwt.sign(
    { iss: cuenta.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 },
    cuenta.private_key,
    { algorithm: 'RS256' },
  );
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: afirmacion }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`FCM sin acceso: ${d.error_description ?? d.error ?? r.status}`);
  accesoFcm = { token: d.access_token, vence: Date.now() + (Math.min(d.expires_in ?? 3600, 3600) - 300) * 1000 };
  return accesoFcm.token;
}

async function enviarFcm(usuarioId, datos) {
  const config = configFirebaseApp();
  if (!config) return 0;
  const tokens = await TokenApp.find({ usuario: usuarioId }).lean();
  if (!tokens.length) return 0;
  const acceso = await tokenAccesoFcm();
  let enviadas = 0;
  await Promise.all(tokens.map(async (t) => {
    try {
      // Solo datos (sin «notification»): la app arma el aviso con su canal, icono y color, también cerrada.
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${acceso}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: t.token, data: datos, android: { priority: 'HIGH', ttl: '86400s' } } }),
      });
      if (r.ok) { enviadas += 1; return; }
      const err = await r.json().catch(() => ({}));
      const codigo = err.error?.details?.find?.((x) => x.errorCode)?.errorCode;
      // La app se desinstaló o el código caducó: se olvida ese teléfono.
      if (r.status === 404 || codigo === 'UNREGISTERED') await TokenApp.deleteOne({ _id: t._id });
      else console.error('FCM:', r.status, err.error?.status ?? '', err.error?.message?.slice?.(0, 120) ?? '');
    } catch (e) {
      console.error('FCM:', e.message);
    }
  }));
  return enviadas;
}

/**
 * Manda una notificación a todos los dispositivos de la persona. Nunca lanza error.
 * { titulo, cuerpo, url?, etiqueta? } — «etiqueta» agrupa: una nueva con la misma sustituye a la anterior.
 */
export async function notificar(usuarioId, { titulo, cuerpo, url = '/', etiqueta } = {}) {
  try {
    // La misma etiqueta en todos los caminos: si el aviso llega por Firebase y por tiempo real, el teléfono
    // lo muestra una sola vez (el segundo reemplaza al primero).
    const contenido = { titulo: plano(titulo).slice(0, 80), cuerpo: plano(cuerpo).slice(0, 300), url, etiqueta: etiqueta || `aviso-${Date.now()}` };
    // Tiempo real: la app abierta o la app Android en segundo plano (sin depender de Firebase).
    let enviadas = avisarUsuario(usuarioId, contenido);
    enviadas += await enviarFcm(usuarioId, contenido).catch((err) => { console.error('FCM:', err.message); return 0; });
    const subs = await SuscripcionPush.find({ usuario: usuarioId }).lean();
    if (!subs.length) return enviadas;
    await clavesVapid();
    const datos = JSON.stringify(contenido);
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

// App Android nativa: si el servidor tiene Firebase, sus datos públicos para registrarse.
rutasPush.get('/app', (req, res) => {
  const config = configFirebaseApp();
  res.json({ activo: Boolean(config), config });
});

// { token, dispositivo? }: el teléfono avisa su código de FCM (al entrar y cuando Firebase lo cambia).
rutasPush.post('/app', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!/^[\w:.-]{20,4096}$/.test(token)) throw new ErrorHttp(400, 'Código de notificaciones no válido');
  const dispositivo = typeof req.body.dispositivo === 'string' ? req.body.dispositivo.slice(0, 60) : '';
  if ((await TokenApp.countDocuments({ usuario: req.usuario.id, token: { $ne: token } })) >= 10) {
    // Como mucho 10 teléfonos: se quita el más antiguo.
    const viejo = await TokenApp.findOne({ usuario: req.usuario.id, token: { $ne: token } }).sort({ updatedAt: 1 });
    if (viejo) await viejo.deleteOne();
  }
  // Si el teléfono era de otra cuenta, pasa a esta (un teléfono, una sesión).
  await TokenApp.updateOne({ token }, { $set: { usuario: req.usuario.id, dispositivo } }, { upsert: true });
  res.json({ ok: true });
});

// Al cerrar sesión en la app: ese teléfono deja de recibir avisos de la cuenta.
rutasPush.post('/app/quitar', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  if (token) await TokenApp.deleteOne({ token, usuario: req.usuario.id });
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
