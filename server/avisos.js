import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import { config } from './config.js';
import { Usuario, CorreoVisto, Movimiento, AvisoRecibido } from './models.js';
import { archivoDeFormulario, ErrorImagen } from './imagen.js';
import { estadoBd } from './db.js';
import { requiereSesion } from './auth.js';
import { comprobarLicencia } from './licencias.js';
import { leerAvisoDePago, registrarVarios, librosDe, libroActivo, hoyLocal } from './bot.js';
import { notificarMensaje } from './push.js';
import { leerComprobante, iaDisponible } from './ia.js';
import { whatsappConectado, enviarANumero } from './whatsapp.js';

// El teléfono reenvía aquí, a un enlace personal, las notificaciones de Yape, Plin o del banco (Android, con
// MacroDroid u otra app) o una captura de la constancia (iPhone, con un atajo). Se registran como movimientos.
export const rutasAvisos = Router();

const MAX = 12 * 1024 * 1024;
rutasAvisos.use((req, res, next) => (estadoBd.lista ? next() : res.status(503).json({ error: 'Sin conexión con la base de datos.' })));
rutasAvisos.use(cookieParser());
rutasAvisos.use(express.json({ limit: MAX }));
rutasAvisos.use(express.urlencoded({ extended: false, limit: '100kb' }));
rutasAvisos.use(express.text({ type: 'text/*', limit: '100kb' }));
// Todo lo que no sea JSON, texto o formulario simple llega como archivo (imagen, PDF, multipart o sin tipo):
// el atajo de iPhone no siempre indica el tipo de la captura.
rutasAvisos.use(express.raw({ type: (req) => !req.is(['application/json', 'text/*', 'application/x-www-form-urlencoded']), limit: MAX }));

const urlBase = (req) => config.urlPublica || `${req.protocol}://${req.get('host')}`;
const enlaceDe = (req, token) => `${urlBase(req)}/api/avisos/${token}`;

// ---------- enlace personal (desde «Mi cuenta») ----------

rutasAvisos.get('/enlace', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id).select('tokenAvisos');
  res.json({ enlace: usuario?.tokenAvisos ? enlaceDe(req, usuario.tokenAvisos) : null });
});

// Crea el enlace o lo cambia por uno nuevo (el anterior deja de funcionar).
rutasAvisos.post('/enlace', requiereSesion, async (req, res) => {
  const token = randomBytes(18).toString('hex');
  await Usuario.updateOne({ _id: req.usuario.id }, { $set: { tokenAvisos: token } });
  res.json({ enlace: enlaceDe(req, token) });
});

rutasAvisos.delete('/enlace', requiereSesion, async (req, res) => {
  await Usuario.updateOne({ _id: req.usuario.id }, { $unset: { tokenAvisos: 1 } });
  res.json({ enlace: null });
});

// Últimos avisos recibidos y qué se hizo con cada uno (para «Mi cuenta»).
rutasAvisos.get('/historial', requiereSesion, async (req, res) => {
  const lista = await AvisoRecibido.find({ usuario: req.usuario.id }).sort({ cuando: -1 }).limit(15).lean();
  res.json({ avisos: lista.map((a) => ({ cuando: a.cuando, origen: a.origen, resultado: a.resultado, registrados: a.registrados ?? 0, ok: Boolean(a.ok) })) });
});

// ---------- recepción de avisos ----------

const limite = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiados avisos seguidos. Espera un minuto.' } });

// Campos que mandan las apps de automatización (MacroDroid, Tasker, Atajos…), con nombres en español o inglés.
function textoDelAviso(req) {
  if (typeof req.body === 'string') return { titulo: '', texto: req.body, app: '' };
  const b = req.body && !Buffer.isBuffer(req.body) && typeof req.body === 'object' ? req.body : {};
  const campo = (...nombres) => nombres.map((n) => b[n] ?? req.query[n]).find((v) => typeof v === 'string' && v.trim()) ?? '';
  return {
    titulo: campo('titulo', 'title', 'notification_title'),
    texto: campo('texto', 'text', 'mensaje', 'message', 'notification', 'notification_text', 'body'),
    app: campo('app', 'app_name', 'aplicacion', 'package'),
  };
}

// El aviso queda vinculado a lo que se registró desde «inicio», para corregirlo respondiendo al mensaje.
async function avisarPorWhatsapp(usuario, texto, inicio) {
  notificarMensaje(usuario._id, texto);
  if (!usuario.whatsapp || !whatsappConectado()) return;
  const movimientos = (await Movimiento.find({ creadoPor: usuario._id, createdAt: { $gte: inicio } }).select('_id').lean().catch(() => [])).map((m) => m._id);
  enviarANumero(usuario.whatsapp, { texto }, { movimientos }).catch((err) => console.error('Aviso del teléfono por WhatsApp:', err.message));
}

const pagina = (titulo, texto) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;background:#f1f1f1;color:#0b0b0b}@media(prefers-color-scheme:dark){body{background:#000;color:#fff}}</style></head><body><h1>${titulo}</h1>${texto}</body></html>`;

// Al abrir el enlace en el navegador se explica para qué sirve (los avisos llegan por POST).
rutasAvisos.get('/:token', limite, async (req, res) => {
  const token = String(req.params.token);
  const usuario = /^[0-9a-f]{36}$/.test(token) ? await Usuario.findOne({ tokenAvisos: token }).select('nombre') : null;
  if (!usuario) {
    return res.status(404).type('html').send(pagina('Enlace no válido', '<p>Este enlace no existe o se cambió por otro. Cópialo otra vez desde <b>Mi cuenta → Yape, Plin y avisos del teléfono</b>.</p>'));
  }
  res.type('html').send(pagina('✅ Tu enlace funciona', `<p>Este es el enlace de avisos de <b>${usuario.nombre.replace(/[<>&"]/g, '')}</b>. No hace falta abrirlo: pégalo en <b>MacroDroid</b> (Android) o en el atajo del <b>iPhone</b>, que le enviarán cada aviso de Yape, Plin o del banco, o la captura de la constancia.</p><p>Los pasos están en la app, en <b>Mi cuenta → Yape, Plin y avisos del teléfono</b>.</p>`));
});

// Respuesta para el atajo o MacroDroid: siempre con «mensaje» (lo que enseña la notificación del atajo),
// también cuando algo falla, y queda anotada en el historial de la persona.
async function responderAviso(res, usuario, { estado = 200, ok, mensaje, origen, inicio }) {
  const limpio = String(mensaje ?? '').replace(/\*/g, '').trim();
  let registrados = 0;
  if (usuario) {
    registrados = inicio ? await Movimiento.countDocuments({ creadoPor: usuario._id, createdAt: { $gte: inicio } }).catch(() => 0) : 0;
    AvisoRecibido.create({ usuario: usuario._id, origen, resultado: limpio.split('\n')[0].slice(0, 200), registrados, ok }).catch(() => {});
  }
  return res.status(estado).json({ ok, mensaje: limpio, registrados, ...(!ok && estado >= 400 && { error: limpio }) });
}

rutasAvisos.post('/:token', limite, async (req, res) => {
  const inicio = new Date();
  const token = String(req.params.token);
  if (!/^[0-9a-f]{36}$/.test(token)) return res.status(404).json({ ok: false, mensaje: 'Enlace no válido. Cópialo otra vez desde Mi cuenta.', error: 'Enlace no válido' });
  const usuario = await Usuario.findOne({ tokenAvisos: token });
  if (!usuario) return res.status(404).json({ ok: false, mensaje: 'Enlace no válido o cambiado. Cópialo otra vez desde Mi cuenta.', error: 'Enlace no válido' });
  const licencia = await comprobarLicencia(usuario);
  if (!licencia.ok) return responderAviso(res, usuario, { estado: 403, ok: false, mensaje: licencia.motivo, origen: 'aviso' });

  // Captura o PDF (el atajo del iPhone). Puede llegar como archivo directo, en un formulario o en base64.
  let binario = Buffer.isBuffer(req.body) && req.body.length ? req.body
    : typeof req.body?.imagen === 'string' ? Buffer.from(req.body.imagen.replace(/^data:[^,]+,/, ''), 'base64') : null;
  if (binario && req.is('multipart/form-data')) binario = archivoDeFormulario(binario, req.get('content-type'))?.datos ?? null;
  if (binario && binario.length < 64) binario = null;
  if (binario) {
    const esPdf = binario.subarray(0, 4).toString() === '%PDF';
    const origen = esPdf ? 'PDF' : 'Captura';
    // La misma captura enviada otra vez (la automatización «al cerrar Yape» manda la última captura aunque
    // no haya una nueva): se contesta al momento, sin volver a leerla con la IA.
    const huellaArchivo = createHash('sha256').update(usuario.id).update(binario).digest('hex').slice(0, 40);
    const yaVista = await CorreoVisto.exists({ _id: `captura:${huellaArchivo}` });
    if (yaVista) return responderAviso(res, usuario, { ok: true, mensaje: 'Esa captura ya se había registrado. Haz una nueva después de yapear.', origen: 'Captura repetida' });
    if (!(await iaDisponible()).disponible) return responderAviso(res, usuario, { estado: 400, ok: false, mensaje: 'Para leer capturas hace falta activar la IA (Admin → IA).', origen });
    const libro = libroActivo(usuario, await librosDe(usuario));
    if (!libro) return responderAviso(res, usuario, { estado: 400, ok: false, mensaje: 'No tienes ningún libro.', origen });
    // El formato real se mira en los bytes (el atajo puede mandar la captura sin tipo o con otro).
    const entrada = esPdf ? { pdf: { base64: binario.toString('base64'), texto: '' } } : { imagen: { base64: binario.toString('base64'), mime: 'image/png' } };
    try {
      const lectura = await leerComprobante(entrada, { hoy: hoyLocal(), moneda: libro.moneda, titular: usuario.nombre });
      if (!lectura?.movimientos.length) return responderAviso(res, usuario, { ok: false, mensaje: lectura?.nota || 'No encontré pagos en la captura. Abre «Mostrar movimientos» en Yape antes de enviarla.', origen });
      const mensaje = await registrarVarios(usuario, lectura.movimientos, { origen: 'desde tu captura' });
      await CorreoVisto.updateOne({ _id: `captura:${huellaArchivo}` }, { $setOnInsert: { visto: new Date() } }, { upsert: true }).catch(() => {});
      // Si todo ya estaba registrado (la misma lista enviada otra vez), no se avisa: la respuesta lo dice.
      if (mensaje.startsWith('✅')) avisarPorWhatsapp(usuario, `📲 ${mensaje}`, inicio);
      return responderAviso(res, usuario, { ok: true, mensaje, origen, inicio });
    } catch (err) {
      console.error('Aviso (captura):', err.message);
      const motivo = err instanceof ErrorImagen ? err.message : `No se pudo leer la captura (${String(err.message).slice(0, 120)}). Inténtalo de nuevo.`;
      return responderAviso(res, usuario, { estado: err instanceof ErrorImagen ? 400 : 502, ok: false, mensaje: motivo, origen });
    }
  }

  // Notificación en texto.
  const { titulo, texto, app } = textoDelAviso(req);
  const completo = `${titulo} ${texto}`.trim();
  if (!completo) return responderAviso(res, usuario, { estado: 400, ok: false, mensaje: 'El aviso llegó vacío. En el atajo, el cuerpo de la solicitud debe ser «Archivo» con la captura de pantalla.', origen: 'Vacío' });
  if (completo.length > 2000) return responderAviso(res, usuario, { estado: 400, ok: false, mensaje: 'El aviso es demasiado largo.', origen: 'Texto' });

  // La misma notificación puede llegar dos veces seguidas (al actualizarse en el teléfono): solo cuenta la primera.
  // Pasados unos minutos, el mismo texto sí es otro aviso («¡Te yapearon S/ 5!» dos veces en el día).
  const tramo = Math.floor(Date.now() / (3 * 60_000));
  const huella = createHash('sha256').update(`${usuario.id}|${tramo}|${completo}`).digest('hex').slice(0, 32);
  const nueva = await CorreoVisto.updateOne({ _id: `aviso:${huella}` }, { $setOnInsert: { visto: new Date() } }, { upsert: true });
  if (!nueva.upsertedCount) return responderAviso(res, usuario, { ok: false, mensaje: 'Ese aviso ya se había recibido.', origen: app || 'Notificación' });

  let movimiento = leerAvisoDePago(completo, { app });
  if (!movimiento && /\d/.test(completo) && (await iaDisponible()).disponible) {
    // Formatos que no se reconocen solos (otros bancos o apps): la IA los lee como un comprobante en texto.
    const libro = libroActivo(usuario, await librosDe(usuario));
    const lectura = libro && await leerComprobante({ texto: `${app ? `App: ${app}\n` : ''}${completo}` }, { hoy: hoyLocal(), moneda: libro.moneda, titular: usuario.nombre }).catch(() => null);
    [movimiento] = lectura?.movimientos ?? [];
  }
  if (!movimiento) return responderAviso(res, usuario, { ok: false, mensaje: 'No es un aviso de pago: no se registró nada.', origen: app || 'Notificación' });

  const mensaje = await registrarVarios(usuario, [{ ...movimiento, fecha: movimiento.fecha ?? hoyLocal(), pistas: `${app} ${completo}` }], { origen: `desde ${app || 'tu teléfono'}`, repetidos: 'reciente' });
  if (mensaje.startsWith('✅')) avisarPorWhatsapp(usuario, `📲 ${mensaje}`, inicio);
  return responderAviso(res, usuario, { ok: mensaje.startsWith('✅'), mensaje, origen: app || 'Notificación', inicio });
});
