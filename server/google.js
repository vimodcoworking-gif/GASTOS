import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import { Usuario, Libro, Movimiento, CorreoVisto, CorreoRevisado, Ajuste } from './models.js';
import { ErrorHttp } from './errores.js';
import { iniciarSesion, idDeSesion, publico, requiereSesion } from './auth.js';
import { cifrar, descifrar, leerGastoDeCorreo, explicarError } from './ia.js';
import { librosDe, libroActivo, registrarMovimiento, hoyLocal } from './bot.js';
import { whatsappConectado, enviarANumero } from './whatsapp.js';
import { comprobarLicencia } from './licencias.js';
import { convertir, ErrorCambio } from './cambio.js';

const GMAIL_LECTURA = 'https://www.googleapis.com/auth/gmail.readonly';
const COOKIE_ESTADO = 'google_estado';
const RUTA = '/api/auth/google';
// Como mucho estos correos por persona en cada revisión, para no gastar la IA de golpe.
const MAX_CORREOS = 15;

export const googleDisponible = () => Boolean(config.google.clienteId && config.google.secreto);

const urlBase = (req) => config.urlPublica || `${req.protocol}://${req.get('host')}`;

class ErrorGoogle extends Error {
  constructor(estado, codigo, detalle) {
    super(detalle || codigo || `Google respondió ${estado}`);
    this.estado = estado;
    this.codigo = codigo;
  }
}

async function pedirGoogle(url, opciones = {}) {
  const res = await fetch(url, { ...opciones, signal: AbortSignal.timeout(20000) });
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) throw new ErrorGoogle(res.status, cuerpo?.error?.status ?? cuerpo?.error, cuerpo?.error_description ?? cuerpo?.error?.message);
  return cuerpo;
}

const formulario = (datos) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(datos),
});

// ---------- acceso con Google ----------

export const rutasGoogle = Router();

rutasGoogle.get('/estado', (req, res) => res.json({ disponible: googleDisponible() }));

// Lleva a la pantalla de Google. modo=entrar (iniciar sesión o crear cuenta) o modo=gmail (vincular el correo).
rutasGoogle.get('/', (req, res) => {
  if (!googleDisponible()) return res.redirect(`/?errorGoogle=${encodeURIComponent('El acceso con Google no está configurado.')}`);
  const modo = req.query.modo === 'gmail' ? 'gmail' : 'entrar';
  const uid = idDeSesion(req);
  if (modo === 'gmail' && !uid) return res.redirect(`/?errorGoogle=${encodeURIComponent('Inicia sesión antes de vincular Gmail.')}`);

  const nonce = randomBytes(16).toString('hex');
  const redirectUri = `${urlBase(req)}${RUTA}/callback`;
  // El estado viaja firmado en una cookie: así la vuelta solo se acepta desde este mismo navegador.
  res.cookie(COOKIE_ESTADO, jwt.sign({ nonce, modo, uid: modo === 'gmail' ? uid : undefined, redirectUri }, config.jwtSecret, { expiresIn: '10m' }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.produccion,
    maxAge: 10 * 60 * 1000,
    path: RUTA,
  });

  const parametros = new URLSearchParams({
    client_id: config.google.clienteId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ['openid', 'email', 'profile', ...(modo === 'gmail' ? [GMAIL_LECTURA] : [])].join(' '),
    state: nonce,
    ...(modo === 'gmail'
      ? { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' }
      : { prompt: 'select_account' }),
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${parametros}`);
});

rutasGoogle.get('/callback', async (req, res) => {
  const volver = (parametro, texto) => res.redirect(`/?${parametro}=${encodeURIComponent(texto)}`);
  let estado;
  try {
    estado = jwt.verify(req.cookies[COOKIE_ESTADO] ?? '', config.jwtSecret);
  } catch {
    return volver('errorGoogle', 'El acceso con Google caducó. Inténtalo de nuevo.');
  }
  res.clearCookie(COOKIE_ESTADO, { path: RUTA });
  if (req.query.error) return volver('errorGoogle', req.query.error === 'access_denied' ? 'Cancelaste el acceso con Google.' : 'Google no permitió el acceso.');
  if (typeof req.query.code !== 'string' || req.query.state !== estado.nonce) return volver('errorGoogle', 'La respuesta de Google no es válida. Inténtalo de nuevo.');

  try {
    const tokens = await pedirGoogle('https://oauth2.googleapis.com/token', formulario({
      code: req.query.code,
      client_id: config.google.clienteId,
      client_secret: config.google.secreto,
      redirect_uri: estado.redirectUri,
      grant_type: 'authorization_code',
    }));
    const perfil = await pedirGoogle('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!perfil.sub || !perfil.email) return volver('errorGoogle', 'Google no compartió tu correo.');
    const email = perfil.email.toLowerCase();

    if (estado.modo === 'gmail') {
      const usuario = estado.uid && (await Usuario.findById(estado.uid));
      if (!usuario) return volver('errorGoogle', 'Inicia sesión antes de vincular Gmail.');
      const otro = await Usuario.findOne({ googleId: perfil.sub }).select('_id');
      if (otro && !otro._id.equals(usuario._id)) return volver('errorGoogle', `La cuenta de Google ${email} ya está vinculada a otra cuenta de la app.`);
      if (!String(tokens.scope ?? '').split(' ').includes(GMAIL_LECTURA)) return volver('errorGoogle', 'No marcaste el permiso para leer tus correos. Vuelve a vincular y marca la casilla de Gmail.');
      if (!tokens.refresh_token) return volver('errorGoogle', 'Google no dio acceso permanente. Quita la app en myaccount.google.com/permissions y vuelve a vincular.');

      usuario.googleId = perfil.sub;
      usuario.gmail = { email, nombre: perfil.name?.slice(0, 120), token: cifrar(tokens.refresh_token), activo: true, desde: new Date(), registrados: 0 };
      await usuario.save();
      accesos.delete(usuario.id);
      return volver('google', 'gmail');
    }

    // Entrar: la cuenta vinculada a ese Google, o la que tenga ese mismo correo verificado, o una nueva.
    let usuario = await Usuario.findOne({ googleId: perfil.sub });
    // Hace falta licencia de VIMOD para la cuenta (la suya, o la del administrador si él la creó),
    // o para el correo de Google si la cuenta es nueva.
    const existente = usuario ?? (perfil.email_verified ? await Usuario.findOne({ email }) : null);
    const licencia = await comprobarLicencia(existente ?? email);
    if (!licencia.ok) return volver('errorGoogle', licencia.motivo);
    let nueva = false;
    if (!usuario && perfil.email_verified) {
      usuario = await Usuario.findOne({ email });
      if (usuario) {
        usuario.googleId = perfil.sub;
        await usuario.save();
      }
    }
    if (!usuario) {
      if (!perfil.email_verified) return volver('errorGoogle', 'Tu correo de Google no está verificado.');
      usuario = await Usuario.create({ nombre: (perfil.name || email.split('@')[0]).trim().slice(0, 60), email, googleId: perfil.sub });
      await Libro.create({ nombre: 'Personal', propietario: usuario._id });
      nueva = true;
    }
    iniciarSesion(res, usuario);
    return volver('google', nueva ? 'nueva' : 'entrar');
  } catch (err) {
    console.error('Google:', err.message);
    return volver('errorGoogle', 'No se pudo completar el acceso con Google. Inténtalo de nuevo.');
  }
});

// Revisa el correo ahora mismo, sin esperar a la próxima vuelta.
rutasGoogle.post('/gmail/revisar', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  if (!usuario.gmail?.token) throw new ErrorHttp(400, 'Primero vincula tu Gmail');
  if (enCurso.has(usuario.id)) throw new ErrorHttp(409, 'Ya se está revisando tu correo. Espera unos segundos.');
  const nuevos = await revisarUsuario(usuario);
  res.json({ nuevos, usuario: await publico(await Usuario.findById(usuario._id)) });
});

// Revisa los correos de los últimos meses (1, 3, 6, 12 o 24) o de todo el correo ("todo"),
// y registra los gastos e ingresos que encuentre.
rutasGoogle.post('/gmail/escanear', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  if (!usuario.gmail?.token) throw new ErrorHttp(400, 'Primero vincula tu Gmail');
  let desde = 'todo';
  if (req.body.meses !== 'todo') {
    const meses = [1, 3, 6, 12, 24].includes(Number(req.body.meses)) ? Number(req.body.meses) : 1;
    desde = sumarDias(hoyLocal(), -Math.round(meses * 30.5));
  }
  const mensaje = await iniciarEscaneo(usuario, desde);
  res.json({ mensaje, usuario: await publico(await Usuario.findById(usuario._id)) });
});

rutasGoogle.delete('/gmail/escanear', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  const mensaje = detenerEscaneo(usuario)
    ? 'Deteniendo el escaneo: se para tras el correo que está leyendo. Lo ya registrado se queda.'
    : 'No hay ningún escaneo en marcha.';
  res.json({ mensaje });
});

// Pausa o reanuda la lectura sin desvincular.
rutasGoogle.patch('/gmail', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  if (!usuario.gmail?.token) throw new ErrorHttp(400, 'Primero vincula tu Gmail');
  if (typeof req.body.activo !== 'boolean') throw new ErrorHttp(400, 'Datos inválidos');
  usuario.gmail.activo = req.body.activo;
  if (req.body.activo) usuario.gmail.error = undefined;
  await usuario.save();
  res.json({ usuario: await publico(usuario) });
});

// Deja de leer el correo y retira el permiso en Google. El acceso con Google a la app se mantiene.
rutasGoogle.delete('/gmail', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  const token = usuario.gmail?.token && descifrar(usuario.gmail.token);
  if (token) pedirGoogle('https://oauth2.googleapis.com/revoke', formulario({ token })).catch(() => {});
  usuario.gmail = undefined;
  await usuario.save();
  accesos.delete(usuario.id);
  res.json({ usuario: await publico(usuario) });
});

// ---------- lectura de Gmail ----------

// Accesos de una hora que da Google a partir del token guardado, recordados en memoria.
const accesos = new Map();

async function accesoGmail(usuario) {
  const guardado = accesos.get(usuario.id);
  if (guardado && guardado.hasta > Date.now()) return guardado.token;
  const refresco = descifrar(usuario.gmail.token);
  if (!refresco) throw new ErrorGoogle(400, 'invalid_grant');
  const r = await pedirGoogle('https://oauth2.googleapis.com/token', formulario({
    client_id: config.google.clienteId,
    client_secret: config.google.secreto,
    refresh_token: refresco,
    grant_type: 'refresh_token',
  }));
  accesos.set(usuario.id, { token: r.access_token, hasta: Date.now() + (r.expires_in - 120) * 1000 });
  return r.access_token;
}

// Palabras de avisos de compra y pago; los demás correos ni se abren.
const FILTRO = '{category:purchases compra compraste consumo consumiste cargo pago pagaste yapeaste plin transferencia transferiste boleta factura recibo comprobante voucher pedido orden viaje suscripcion purchase receipt payment order invoice recibiste yapearon plinearon abono depósito deposito sueldo haberes remuneración devolución reembolso}';

const base64url = (datos) => Buffer.from(datos.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

function cuerpos(parte, tipo, lista = []) {
  if (parte.mimeType === tipo && parte.body?.data) lista.push(base64url(parte.body.data));
  for (const hija of parte.parts ?? []) cuerpos(hija, tipo, lista);
  return lista;
}

const ENTIDADES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü' };

function htmlATexto(html) {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, n) => String.fromCodePoint(parseInt(n, hex ? 16 : 10)))
    .replace(/&([a-z]+);/gi, (todo, nombre) => ENTIDADES[nombre] ?? todo);
}

function leerMensaje(mensaje) {
  const cabecera = (nombre) => mensaje.payload?.headers?.find((h) => h.name.toLowerCase() === nombre)?.value ?? '';
  // Espacios raros e invisibles (de ancho cero, guiones suaves) que usan los bancos y cortan las frases.
  const limpiar = (t) => t
    .replace(/[\u200b-\u200d\u2060\ufeff\u00ad\u034f]/g, '')
    .replace(/&(shy|zwnj|zwj|#8203|#x200b);/gi, '')
    .replace(/[ \t\u00a0\u2000-\u200a\u202f]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  const plano = limpiar(cuerpos(mensaje.payload ?? {}, 'text/plain').join('\n'));
  const html = limpiar(htmlATexto(cuerpos(mensaje.payload ?? {}, 'text/html').join('\n')));
  // Muchos avisos traen un texto plano de relleno («activa HTML para ver este correo»): se usa el HTML
  // cuando el texto plano es mucho más corto o no trae ningún importe.
  const usarHtml = html && (!plano || plano.length < html.length / 3 || (!/\d/.test(plano) && /\d/.test(html)));
  const texto = (usarHtml ? html : plano).slice(0, 6000);
  const recibido = new Date(Number(mensaje.internalDate) || Date.now());
  const resumen = limpiar(htmlATexto(mensaje.snippet ?? ''));
  return {
    asunto: cabecera('subject').slice(0, 200),
    remitente: cabecera('from').slice(0, 200),
    fecha: new Intl.DateTimeFormat('en-CA', { timeZone: config.zona }).format(recibido),
    texto: texto || resumen,
    // El resumen de Gmail (primeras líneas del correo): sirve de respaldo si el cuerpo no se lee bien.
    resumen,
  };
}

// Sin IA: solo avisos claros de compra o pago con un importe en soles, dólares o euros.
function gastoSinIa(correo) {
  const todo = `${correo.asunto}\n${correo.texto}`;
  if (!/(compra|consumo|pago|pagaste|cargo|yapeaste|transferencia|transferiste)/i.test(correo.asunto)) return null;
  if (/(recibiste|te yapearon|te transfirieron|abono|dep[oó]sito|devoluci|reembolso|oferta|promo|descuento|recordatorio|vence)/i.test(correo.asunto)) return null;
  const importe = new RegExp(`${SIMBOLO}\\s?${NUMERO}`, 'i').exec(todo);
  if (!importe) return null;
  const quien = correo.remitente.replace(/<.*>/, '').replace(/"/g, '').trim();
  return { tipo: 'gasto', ...leerImporte(importe[1], importe[2]), descripcion: `${quien ? `${quien}: ` : ''}${correo.asunto}`, categoria: 'Otros', fecha: correo.fecha };
}

const SIMBOLO = '(S\\/\\.?|PEN|US\\$|USD|\\$|€|EUR)';
const NUMERO = '(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)\\b';

// «S/ 1,234.50» o «US$ 12,99» → { monto, moneda }.
function leerImporte(simbolo, numero) {
  const decimales = /[.,]\d{1,2}$/.exec(numero)?.[0] ?? '';
  const limpio = numero.slice(0, numero.length - decimales.length).replace(/[.,]/g, '') + decimales.replace(',', '.');
  const s = simbolo.toUpperCase();
  const moneda = s.startsWith('S') || s === 'PEN' ? 'PEN' : s === '€' || s === 'EUR' ? 'EUR' : 'USD';
  return { monto: Number(limpio), moneda };
}

// Avisos de consumo con tarjeta que no dejan dudas («Realizaste un consumo de S/ 12.99 con tu Tarjeta
// de Crédito BCP en CARGO DA 7021988.»). Se registran aunque la IA los descarte: algunos modelos los
// confunden con avisos de seguridad («Por tu seguridad, te enviamos…») o con pagos de la tarjeta.
const AVISO_CONSUMO = new RegExp(
  `(?:realizaste|hiciste|has realizado|se (?:ha )?realizado|se registr[oó])\\s+(?:un|una)\\s+(?:consumo|compra|cargo)\\s+(?:de|por)\\s+${SIMBOLO}\\s?${NUMERO}([^\\n]{0,160})`,
  'i',
);

function avisoDeConsumo(correo) {
  const aviso = AVISO_CONSUMO.exec(`${correo.asunto}\n${correo.texto}`) ?? AVISO_CONSUMO.exec(correo.resumen ?? '');
  if (!aviso) return null;
  const { monto, moneda } = leerImporte(aviso[1], aviso[2]);
  if (!(monto > 0)) return null;
  // El comercio suele venir tras «en»: «… con tu Tarjeta de Crédito BCP en CARGO DA 7021988.»
  const comercio = /\ben\s+(.{2,60}?)(?:\.\s|\.$|,|$)/i.exec(aviso[3])?.[1]?.trim();
  const banco = correo.remitente.replace(/<.*>/, '').replace(/"/g, '').replace(/notificaciones?/i, '').trim();
  return {
    tipo: 'gasto',
    monto,
    moneda,
    descripcion: comercio ? `${comercio}${banco ? ` (${banco})` : ''}` : correo.asunto || 'Consumo con tarjeta',
    categoria: 'Compras',
    fecha: correo.fecha,
  };
}

const dias = (a, b) => Math.abs(new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000;

// Convierte lo que dijo la IA (o el filtro sin IA) en datos para registrar, o null si no es un gasto.
async function interpretar(correo, monedaLibro, titular) {
  let gasto = await leerGastoDeCorreo(correo, titular);
  const esGasto = (g) => g?.tipo === 'gasto' || g?.esGasto === true;
  // Un aviso de consumo con tarjeta inequívoco se registra aunque la IA diga otra cosa.
  if (!esGasto(gasto)) gasto = avisoDeConsumo(correo) ?? gasto;
  gasto ??= gastoSinIa(correo);
  // «esGasto» es el formato anterior de la respuesta; se sigue aceptando.
  const tipo = gasto?.tipo === 'ingreso' ? 'ingreso' : esGasto(gasto) ? 'gasto' : null;
  if (!tipo) return null;
  const monto = Math.round(Number(gasto.monto) * 100) / 100;
  if (!Number.isFinite(monto) || monto <= 0) return null;
  const descripcion = typeof gasto.descripcion === 'string' && gasto.descripcion.trim() ? gasto.descripcion.trim() : correo.asunto || (tipo === 'gasto' ? 'Gasto por correo' : 'Ingreso por correo');
  // La fecha de la IA solo se acepta si cuadra con la del correo.
  const fecha = typeof gasto.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(gasto.fecha) && gasto.fecha <= correo.fecha && dias(gasto.fecha, correo.fecha) <= 3 ? gasto.fecha : correo.fecha;
  const datos = { tipo, monto, descripcion: descripcion.slice(0, 120), categoria: typeof gasto.categoria === 'string' ? gasto.categoria : 'Otros', fecha, pagado: true };

  // Cobrado en otra moneda (p. ej. dólares en un libro en soles): se guarda tal cual se cobró
  // y, para los totales, su equivalente en la moneda del libro.
  const moneda = normalizarMoneda(gasto.moneda) ?? monedaLibro;
  if (moneda !== monedaLibro) {
    const equivalente = await convertir(monto, moneda, monedaLibro);
    if (equivalente !== null) Object.assign(datos, { moneda, montoOriginal: monto, monto: Math.max(equivalente, 0.01) });
  }
  return datos;
}

// La IA a veces responde «SOL», «S/» o «US$» en vez del código ISO.
function normalizarMoneda(valor) {
  if (typeof valor !== 'string') return null;
  const v = valor.trim().toUpperCase();
  if (/^(S\/\.?|SOL|SOLES|PEN)$/.test(v)) return 'PEN';
  if (/^(US\$|\$|USD|DOLAR|DÓLAR|DOLARES|DÓLARES)$/.test(v)) return 'USD';
  if (/^(€|EUR|EUROS?)$/.test(v)) return 'EUR';
  return /^[A-Z]{3}$/.test(v) ? v : null;
}

const enCurso = new Set();

// Quién es el titular, para que la IA reconozca las transferencias a sus propias cuentas.
const titularDe = (usuario) => [usuario.nombre, usuario.gmail?.nombre, usuario.gmail?.email && `correo ${usuario.gmail.email}`].filter(Boolean).join(' · ');
const DIA = 86400000;
// Los escaneos de meses anteriores avanzan por tandas hasta terminar, con este tope por escaneo.
const POR_TANDA = 100;
const MAX_ESCANEO = 5000;
// Gmail existe desde 2004: «todo el correo» empieza ahí.
const INICIO_GMAIL = '2004-01-01';
// Escaneos que la persona pidió detener.
const detener = new Set();

const sumarDias = (texto, n) => new Date(new Date(`${texto}T00:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const fechaCorta = (texto) => new Date(`${texto}T00:00:00Z`).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Correos que cumplen la búsqueda y aún no se han revisado, recorriendo las páginas de Gmail
// hasta reunir «cuantos» (o uno más, para saber si quedan).
async function buscarPendientes(usuario, autorizacion, q, cuantos) {
  const pendientes = [];
  let pagina;
  let paginas = 0;
  do {
    const parametros = new URLSearchParams({ q, maxResults: '100', ...(pagina && { pageToken: pagina }) });
    const r = await pedirGoogle(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${parametros}`, autorizacion);
    const ids = (r.messages ?? []).map((m) => m.id);
    const vistos = new Set((await CorreoVisto.find({ _id: { $in: ids.map((id) => `${usuario.id}:${id}`) } }).select('_id').lean()).map((v) => v._id));
    pendientes.push(...ids.filter((id) => !vistos.has(`${usuario.id}:${id}`)));
    pagina = r.nextPageToken;
    paginas += 1;
  } while (pagina && pendientes.length <= cuantos && paginas < 300);
  return pendientes;
}

// Un movimiento igual (mismo tipo y monto, un día arriba o abajo) ya anotado, por ejemplo a mano: no se duplica.
// En otra moneda se compara el importe cobrado, que no depende del tipo de cambio.
async function yaRegistrado(libro, datos) {
  const fecha = new Date(`${datos.fecha}T00:00:00Z`).getTime();
  return Movimiento.exists({
    libro: libro._id,
    tipo: datos.tipo,
    ...(datos.moneda ? { moneda: datos.moneda, montoOriginal: datos.montoOriginal } : { monto: Math.round(datos.monto * 100) / 100 }),
    fecha: { $gte: new Date(fecha - DIA), $lte: new Date(fecha + DIA) },
  });
}

/**
 * Revisa una tanda de correos que cumplen «q» y registra los gastos e ingresos, los más antiguos primero.
 * Va anotando en «resultado» { revisados, registrados, duplicados, quedan }: así se sabe lo hecho aunque falle a mitad.
 */
async function procesarCorreos(usuario, libro, autorizacion, q, resultado, { maxCorreos, alRegistrar, alAvanzar, debeParar }) {
  const pendientes = (await buscarPendientes(usuario, autorizacion, q, maxCorreos)).reverse();
  resultado.quedan = pendientes.length > maxCorreos;

  for (const id of pendientes.slice(0, maxCorreos)) {
    if (debeParar?.()) return;
    // Ya hay un movimiento sacado de este correo (p. ej. si se vuelve a revisar): no se lee otra vez.
    if (await Movimiento.exists({ correoId: id, creadoPor: usuario._id })) {
      await CorreoVisto.updateOne({ _id: `${usuario.id}:${id}` }, { $setOnInsert: { visto: new Date() } }, { upsert: true });
      continue;
    }
    const correo = leerMensaje(await pedirGoogle(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, autorizacion));
    // Si la IA falla, el correo no se marca como visto y se vuelve a intentar en la próxima revisión.
    const datos = await interpretar(correo, libro.moneda, titularDe(usuario));
    await CorreoVisto.updateOne({ _id: `${usuario.id}:${id}` }, { $setOnInsert: { visto: new Date() } }, { upsert: true });
    resultado.revisados += 1;
    let decision = 'no es gasto ni ingreso';
    if (datos) {
      if (await yaRegistrado(libro, datos)) {
        resultado.duplicados += 1;
        decision = `duplicado: ${datos.tipo} ${datos.monto}`;
      } else {
        const confirmacion = await registrarMovimiento(usuario, libro, datos, { correoId: id });
        decision = confirmacion.split('\n').slice(0, 2).join(' · ');
        if (confirmacion.startsWith('✅')) {
          resultado.registrados += 1;
          alRegistrar?.(confirmacion, correo);
        }
      }
    }
    await CorreoRevisado.updateOne({ _id: `${usuario.id}:${id}` }, {
      $set: { usuario: usuario._id, asunto: correo.asunto, remitente: correo.remitente, resultado: decision, extracto: `${correo.resumen}\n---\n${correo.texto}`.slice(0, 400), cuando: new Date() },
    }, { upsert: true }).catch(() => {});
    if (resultado.revisados % 10 === 0) await alAvanzar?.();
  }
}

function avisarPorWhatsapp(usuario, texto) {
  if (!usuario.whatsapp || !whatsappConectado()) return;
  enviarANumero(usuario.whatsapp, { texto }).catch((err) => console.error('Aviso de Gmail por WhatsApp:', err.message));
}

// Explicación de un fallo al leer el correo, y si Google retiró el permiso.
function motivoDeError(err) {
  const permisoRetirado = err instanceof ErrorGoogle && (err.codigo === 'invalid_grant' || err.estado === 401 || err.estado === 403);
  const motivo = permisoRetirado
    ? 'Google retiró el permiso para leer tu correo. Vuelve a vincular Gmail.'
    : err instanceof ErrorGoogle ? `Gmail respondió con un error (${err.estado}). Se reintentará solo.`
    : err.message?.startsWith('No tienes') || err instanceof ErrorCambio ? err.message
    : `No se pudo consultar la IA: ${explicarError(err)}`;
  return { motivo, permisoRetirado };
}

async function prepararLectura(usuario) {
  const libro = libroActivo(usuario, await librosDe(usuario));
  if (!libro) throw new Error('No tienes ningún libro donde registrar los movimientos.');
  return { libro, autorizacion: { headers: { Authorization: `Bearer ${await accesoGmail(usuario)}` } } };
}

const BUSQUEDA = `-in:sent -in:drafts -in:chats ${FILTRO}`;

/** Lee los correos nuevos de una persona y registra gastos e ingresos. Devuelve cuántos registró. */
export async function revisarUsuario(usuario) {
  if (enCurso.has(usuario.id) || !usuario.gmail?.token || !googleDisponible()) return 0;
  enCurso.add(usuario.id);
  const resultado = { revisados: 0, registrados: 0, duplicados: 0, quedan: false };
  try {
    const { libro, autorizacion } = await prepararLectura(usuario);
    // Desde la vinculación (como mucho una semana atrás), sin los correos que envió la propia persona.
    const desde = Math.floor(Math.max(usuario.gmail.desde?.getTime() ?? 0, Date.now() - 7 * DIA) / 1000);
    await procesarCorreos(usuario, libro, autorizacion, `after:${desde} ${BUSQUEDA}`, resultado, {
      maxCorreos: MAX_CORREOS,
      alRegistrar: (confirmacion, correo) => avisarPorWhatsapp(usuario, `📧 *Desde tu correo* (${correo.asunto.slice(0, 80)})\n${confirmacion}\nYa está en tu calendario de la app.`),
    });
    await Usuario.updateOne({ _id: usuario._id }, { $set: { 'gmail.ultimaRevision': new Date() }, $unset: { 'gmail.error': 1 }, $inc: { 'gmail.registrados': resultado.registrados } });
  } catch (err) {
    const { motivo, permisoRetirado } = motivoDeError(err);
    console.error(`Gmail (${usuario.email}):`, err.message);
    await Usuario.updateOne({ _id: usuario._id }, {
      $set: { 'gmail.error': motivo, 'gmail.ultimaRevision': new Date(), ...(permisoRetirado && { 'gmail.activo': false }) },
      $inc: { 'gmail.registrados': resultado.registrados },
    });
    if (permisoRetirado) accesos.delete(usuario.id);
  } finally {
    enCurso.delete(usuario.id);
  }
  return resultado.registrados;
}

// Mientras escanea, la app se visita a sí misma cada pocos minutos: el plan gratuito de Render
// apaga el servicio tras 15 minutos sin visitas y cortaría el escaneo.
let despiertos = 0;
let despertador = null;
function mantenerDespierto(activar) {
  despiertos += activar ? 1 : -1;
  if (despiertos > 0 && !despertador && config.urlPublica) {
    despertador = setInterval(() => fetch(`${config.urlPublica}/api/auth/google/estado`).catch(() => {}), 4 * 60_000);
  } else if (despiertos <= 0 && despertador) {
    clearInterval(despertador);
    despertador = null;
  }
}

/**
 * Empieza a revisar en segundo plano los correos de un periodo pasado (o de todo el correo).
 * Avanza por tandas hasta terminar. «previo» continúa los contadores de un escaneo interrumpido.
 * Devuelve el texto para la persona; el resultado llega por WhatsApp y se ve en «Mi cuenta».
 */
export async function iniciarEscaneo(usuario, desdeTexto, hastaTexto, previo = null) {
  if (!usuario.gmail?.token) return 'Primero vincula tu Gmail en «Mi cuenta» de la app.';
  if (!googleDisponible()) return 'La lectura de Gmail no está configurada en el servidor.';
  if (enCurso.has(usuario.id)) return '⏳ Ya estoy revisando tu correo. Te aviso cuando termine.';

  const hoy = hoyLocal();
  const valida = (t) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime());
  let desde = desdeTexto === 'todo' ? INICIO_GMAIL : valida(desdeTexto) ? desdeTexto : sumarDias(hoy, -30);
  const hasta = valida(hastaTexto) && hastaTexto <= hoy ? hastaTexto : hoy;
  if (desde < INICIO_GMAIL) desde = INICIO_GMAIL;
  if (desde > hasta) return 'Las fechas para revisar el correo no son válidas.';
  const todo = desde === INICIO_GMAIL;
  const periodo = todo ? 'de todo tu correo' : `del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;

  enCurso.add(usuario.id);
  detener.delete(usuario.id);
  mantenerDespierto(true);
  const estado = {
    estado: 'en curso',
    desde: new Date(desde),
    hasta: new Date(hasta),
    revisados: previo?.revisados ?? 0,
    registrados: previo?.registrados ?? 0,
    duplicados: previo?.duplicados ?? 0,
    quedan: false,
    inicio: previo?.inicio ?? new Date(),
  };
  const yaRegistrados = estado.registrados;
  const guardar = () => Usuario.updateOne({ _id: usuario._id }, { $set: { 'gmail.escaneo': estado } });
  await guardar();

  (async () => {
    try {
      // Gmail interpreta estas fechas en la zona de la cuenta; «before» no incluye ese día.
      const q = `after:${desde.replace(/-/g, '/')} before:${sumarDias(hasta, 1).replace(/-/g, '/')} ${BUSQUEDA}`;
      do {
        // Cada tanda pide un acceso al día: los de Google caducan a la hora.
        const { libro, autorizacion } = await prepararLectura(usuario);
        await procesarCorreos(usuario, libro, autorizacion, q, estado, { maxCorreos: POR_TANDA, alAvanzar: guardar, debeParar: () => detener.has(usuario.id) });
        await guardar();
      } while (estado.quedan && !detener.has(usuario.id) && estado.revisados < MAX_ESCANEO);

      const detenido = detener.has(usuario.id);
      Object.assign(estado, { estado: 'terminado', fin: new Date(), ...(detenido && { quedan: true }) });
      avisarPorWhatsapp(usuario, [
        `📧 *Revisión ${periodo} ${detenido ? 'detenida' : 'terminada'}*`,
        `Revisé ${estado.revisados} correos y registré *${estado.registrados} movimientos*${estado.duplicados ? `; ${estado.duplicados} ya estaban anotados` : ''}. Ya están en tu calendario de la app.`,
        ...(estado.quedan ? ['Quedan correos por revisar: pídemelo otra vez y sigo donde quedé.'] : []),
        'Pregúntame por cualquier mes, por ejemplo: «ia ¿cuánto gasté en septiembre?».',
      ].join('\n'));
    } catch (err) {
      console.error(`Escaneo de Gmail (${usuario.email}):`, err.message);
      Object.assign(estado, { estado: 'error', fin: new Date(), error: motivoDeError(err).motivo });
    } finally {
      await guardar().catch(() => {});
      await Usuario.updateOne({ _id: usuario._id }, { $inc: { 'gmail.registrados': estado.registrados - yaRegistrados } }).catch(() => {});
      detener.delete(usuario.id);
      mantenerDespierto(false);
      enCurso.delete(usuario.id);
    }
  })();

  if (previo) return '';
  return `📧 Empecé a revisar ${periodo}, en tandas de ${POR_TANDA} avisos de compras, pagos e ingresos. ${todo ? 'Si tienes muchos correos puede tardar bastante (incluso horas); ' : 'Puede tardar varios minutos; '}${usuario.whatsapp && whatsappConectado() ? 'te aviso por WhatsApp cuando termine' : 'verás el avance en «Mi cuenta»'}. Puedes seguir usando la app mientras tanto.`;
}

/** Pide detener el escaneo en curso; se para tras el correo que esté leyendo. */
export function detenerEscaneo(usuario) {
  if (!enCurso.has(usuario.id)) return false;
  detener.add(usuario.id);
  return true;
}


let temporizador = null;
let revisando = false;

async function revisarTodos() {
  if (revisando) return;
  revisando = true;
  try {
    const usuarios = await Usuario.find({ 'gmail.activo': true, 'gmail.token': { $exists: true } }).limit(500);
    // Sin licencia de VIMOD vigente no se sigue leyendo su correo.
    for (const usuario of usuarios) if ((await comprobarLicencia(usuario)).ok) await revisarUsuario(usuario);
  } catch (err) {
    console.error('Revisión de Gmail:', err.message);
  } finally {
    revisando = false;
  }
}

async function reanudarEscaneos() {
  try {
    const usuarios = await Usuario.find({ 'gmail.escaneo.estado': 'en curso', 'gmail.token': { $exists: true } }).limit(50);
    for (const usuario of usuarios) {
      const e = usuario.gmail.escaneo;
      const texto = (f) => f.toISOString().slice(0, 10);
      console.log(`Gmail: se reanuda el escaneo de ${usuario.email}.`);
      await iniciarEscaneo(usuario, texto(e.desde), texto(e.hasta), { revisados: e.revisados, registrados: e.registrados, duplicados: e.duplicados, inicio: e.inicio });
    }
  } catch (err) {
    console.error('Reanudar escaneos de Gmail:', err.message);
  }
}

/**
 * Correcciones que se hacen una sola vez (se anotan en Ajuste para no repetirlas):
 * - Los gastos en otra moneda se guardaban con el importe tal cual y «[USD]» delante de la descripción,
 *   como si fueran de la moneda del libro. Se pasan al formato nuevo: moneda e importe originales
 *   y su equivalente en la moneda del libro.
 * - Los correos de la última semana se vuelven a mirar, para recoger los avisos de consumo que la IA
 *   descartó. Los que ya dieron un movimiento se saltan sin leerse.
 */
async function correccionesUnicas() {
  const hecha = async (id) => Boolean(await Ajuste.exists({ _id: id }));
  const marcar = (id) => Ajuste.updateOne({ _id: id }, { $set: { valor: new Date() } }, { upsert: true });
  try {
    if (!(await hecha('correccion:moneda-correo'))) {
      const antiguos = await Movimiento.find({ correoId: { $exists: true }, moneda: { $exists: false }, descripcion: /^\[[A-Z]{3}\] / });
      const monedas = new Map();
      for (const mov of antiguos) {
        const moneda = mov.descripcion.slice(1, 4);
        if (!monedas.has(String(mov.libro))) monedas.set(String(mov.libro), (await Libro.findById(mov.libro).select('moneda').lean())?.moneda);
        const monedaLibro = monedas.get(String(mov.libro));
        if (!monedaLibro) continue;
        const descripcion = mov.descripcion.slice(6).trim() || mov.descripcion;
        const equivalente = moneda === monedaLibro ? null : await convertir(mov.monto, moneda, monedaLibro);
        await Movimiento.updateOne({ _id: mov._id }, {
          $set: { descripcion, ...(equivalente !== null && { moneda, montoOriginal: mov.monto, monto: Math.max(equivalente, 0.01) }) },
        });
      }
      await marcar('correccion:moneda-correo');
      if (antiguos.length) console.log(`Gmail: ${antiguos.length} movimientos en otra moneda corregidos.`);
    }
    // La segunda vuelta es para los avisos cuyo texto no se leía bien (texto plano de relleno, caracteres invisibles).
    if (!(await hecha('correccion:avisos-consumo-2'))) {
      const { deletedCount } = await CorreoVisto.deleteMany({ visto: { $gte: new Date(Date.now() - 7 * DIA) } });
      await marcar('correccion:avisos-consumo');
      await marcar('correccion:avisos-consumo-2');
      console.log(`Gmail: ${deletedCount} correos de la última semana se volverán a revisar.`);
    }
  } catch (err) {
    console.error('Correcciones de Gmail:', err.message);
  }
}

// Revisa el correo de todos los que lo vincularon cada pocos minutos.
export function iniciarRevisionGmail() {
  if (!googleDisponible() || temporizador) return;
  // Antes de la primera revisión (que empieza a los 30 segundos).
  setTimeout(correccionesUnicas, 5_000);
  // Los escaneos que estaban en marcha cuando se reinició el servidor siguen solos donde quedaron.
  setTimeout(reanudarEscaneos, 20_000);
  setTimeout(revisarTodos, 30_000);
  temporizador = setInterval(revisarTodos, config.minutosGmail * 60_000);
}

export function pararRevisionGmail() {
  clearInterval(temporizador);
  temporizador = null;
}
