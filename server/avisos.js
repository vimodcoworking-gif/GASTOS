import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import { config } from './config.js';
import { Usuario, CorreoVisto } from './models.js';
import { estadoBd } from './db.js';
import { requiereSesion } from './auth.js';
import { comprobarLicencia } from './licencias.js';
import { leerAvisoDePago, registrarVarios, librosDe, libroActivo, hoyLocal } from './bot.js';
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
rutasAvisos.use(express.raw({ type: ['image/*', 'application/pdf', 'application/octet-stream'], limit: MAX }));

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

function avisarPorWhatsapp(usuario, texto) {
  if (!usuario.whatsapp || !whatsappConectado()) return;
  enviarANumero(usuario.whatsapp, { texto }).catch((err) => console.error('Aviso del teléfono por WhatsApp:', err.message));
}

rutasAvisos.post('/:token', limite, async (req, res) => {
  const token = String(req.params.token);
  if (!/^[0-9a-f]{36}$/.test(token)) return res.status(404).json({ error: 'Enlace no válido' });
  const usuario = await Usuario.findOne({ tokenAvisos: token });
  if (!usuario) return res.status(404).json({ error: 'Enlace no válido o cambiado. Cópialo otra vez desde «Mi cuenta».' });
  const licencia = await comprobarLicencia(usuario);
  if (!licencia.ok) return res.status(403).json({ error: licencia.motivo });

  // Captura o PDF (p. ej. el atajo del iPhone al compartir la constancia de Yape).
  const binario = Buffer.isBuffer(req.body) && req.body.length ? req.body
    : typeof req.body?.imagen === 'string' ? Buffer.from(req.body.imagen.replace(/^data:[^,]+,/, ''), 'base64') : null;
  if (binario) {
    const tipo = req.is('application/pdf') || binario.subarray(0, 4).toString() === '%PDF' ? 'pdf' : 'imagen';
    const mime = tipo === 'pdf' ? 'application/pdf' : /^image\/(jpeg|png|webp|gif)/.exec(req.get('content-type') ?? '')?.[0] ?? (binario[0] === 0x89 ? 'image/png' : 'image/jpeg');
    if (!(await iaDisponible()).disponible) return res.status(400).json({ error: 'Para leer capturas hace falta tener activada la IA (Admin → IA).' });
    const libro = libroActivo(usuario, await librosDe(usuario));
    if (!libro) return res.status(400).json({ error: 'No tienes ningún libro.' });
    const entrada = tipo === 'pdf' ? { pdf: { base64: binario.toString('base64'), texto: '' } } : { imagen: { base64: binario.toString('base64'), mime } };
    try {
      const lectura = await leerComprobante(entrada, { hoy: hoyLocal(), moneda: libro.moneda, titular: usuario.nombre });
      if (!lectura?.movimientos.length) return res.json({ ok: false, mensaje: lectura?.nota || 'No encontré ningún pago en la captura.' });
      const mensaje = await registrarVarios(usuario, lectura.movimientos, { origen: 'desde tu captura' });
      avisarPorWhatsapp(usuario, `📲 ${mensaje}`);
      return res.json({ ok: true, mensaje: mensaje.replace(/\*/g, '') });
    } catch (err) {
      console.error('Aviso (captura):', err.message);
      return res.status(502).json({ error: 'No se pudo leer la captura. Inténtalo de nuevo.' });
    }
  }

  // Notificación en texto.
  const { titulo, texto, app } = textoDelAviso(req);
  const completo = `${titulo} ${texto}`.trim();
  if (!completo) return res.status(400).json({ error: 'El aviso llegó vacío. Revisa que la app envíe el texto de la notificación.' });
  if (completo.length > 2000) return res.status(400).json({ error: 'El aviso es demasiado largo.' });

  // La misma notificación puede llegar dos veces seguidas (al actualizarse en el teléfono): solo cuenta la primera.
  // Pasados unos minutos, el mismo texto sí es otro aviso («¡Te yapearon S/ 5!» dos veces en el día).
  const tramo = Math.floor(Date.now() / (3 * 60_000));
  const huella = createHash('sha256').update(`${usuario.id}|${tramo}|${completo}`).digest('hex').slice(0, 32);
  const nueva = await CorreoVisto.updateOne({ _id: `aviso:${huella}` }, { $setOnInsert: { visto: new Date() } }, { upsert: true });
  if (!nueva.upsertedCount) return res.json({ ok: false, mensaje: 'Ese aviso ya se había recibido.' });

  let movimiento = leerAvisoDePago(completo, { app });
  if (!movimiento && /\d/.test(completo) && (await iaDisponible()).disponible) {
    // Formatos que no se reconocen solos (otros bancos o apps): la IA los lee como un comprobante en texto.
    const libro = libroActivo(usuario, await librosDe(usuario));
    const lectura = libro && await leerComprobante({ texto: `${app ? `App: ${app}\n` : ''}${completo}` }, { hoy: hoyLocal(), moneda: libro.moneda, titular: usuario.nombre }).catch(() => null);
    [movimiento] = lectura?.movimientos ?? [];
  }
  if (!movimiento) return res.json({ ok: false, mensaje: 'No es un aviso de pago: no se registró nada.' });

  const mensaje = await registrarVarios(usuario, [{ ...movimiento, fecha: movimiento.fecha ?? hoyLocal() }], { origen: `desde ${app || 'tu teléfono'}`, repetidos: 'reciente' });
  if (mensaje.startsWith('✅')) avisarPorWhatsapp(usuario, `📲 ${mensaje}`);
  res.json({ ok: mensaje.startsWith('✅'), mensaje: mensaje.replace(/\*/g, '') });
});
