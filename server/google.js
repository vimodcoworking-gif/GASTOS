import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import { Usuario, Libro, Movimiento, CorreoVisto, CorreoRevisado, Ajuste } from './models.js';
import { ErrorHttp } from './errores.js';
import { iniciarSesion, idDeSesion, publico, requiereSesion } from './auth.js';
import { cifrar, descifrar, leerGastoDeCorreo, explicarError } from './ia.js';
import { librosDe, libroActivo, registrarMovimiento, hoyLocal, puedeEscribir, leerAvisoDePago } from './bot.js';
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

rutasGoogle.get('/estado', (req, res) => res.json({ disponible: googleDisponible(), minutos: config.minutosGmail }));

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
    // «select_account» deja elegir otra cuenta de Google para vincular un correo más.
    ...(modo === 'gmail'
      ? { access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'true' }
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

      const datos = { email, nombre: perfil.name?.slice(0, 120), token: cifrar(tokens.refresh_token), activo: true };
      const ya = cuentasDe(usuario).find((c) => c.datos.email === email);
      if (ya) {
        // El mismo correo otra vez (p. ej. tras retirarse el permiso): se renueva el acceso y se conserva lo demás.
        Object.assign(ya.datos, datos);
        ya.datos.error = undefined;
        ya.datos.desde ??= new Date();
      } else if (!usuario.gmail?.token) {
        if (!usuario.googleId) usuario.googleId = perfil.sub;
        usuario.gmail = { ...datos, desde: new Date(), registrados: 0 };
      } else {
        if (cuentasDe(usuario).length >= MAX_CUENTAS) return volver('errorGoogle', `Puedes vincular como mucho ${MAX_CUENTAS} correos.`);
        usuario.gmailExtra.push({ ...datos, desde: new Date(), registrados: 0 });
      }
      await usuario.save();
      for (const c of cuentasDe(usuario)) accesos.delete(claveDe(usuario, c));
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

// La cuenta que indica la petición («cuenta»: «principal» o el id de un correo añadido); sin ella, la principal.
function cuentaPedida(usuario, req) {
  const cuenta = cuentaDe(usuario, req.body?.cuenta ?? req.query.cuenta);
  if (!cuenta) throw new ErrorHttp(400, cuentasDe(usuario).length ? 'Ese correo ya no está vinculado' : 'Primero vincula tu Gmail');
  return cuenta;
}

// Revisa el correo ahora mismo, sin esperar a la próxima vuelta.
rutasGoogle.post('/gmail/revisar', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  if (!cuentasDe(usuario).length) throw new ErrorHttp(400, 'Primero vincula tu Gmail');
  if (algunaEnCurso(usuario)) throw new ErrorHttp(409, 'Ya se está revisando tu correo. Espera unos segundos.');
  const nuevos = await revisarUsuario(usuario);
  res.json({ nuevos, usuario: await publico(await Usuario.findById(usuario._id)) });
});

// Los últimos correos revisados y qué se hizo con cada uno, para saber por qué un aviso no aparece.
rutasGoogle.get('/gmail/revisados', requiereSesion, async (req, res) => {
  const lista = await CorreoRevisado.find({ usuario: req.usuario.id }).sort('-cuando').limit(40).lean();
  res.json({
    correos: lista.map((c) => ({
      id: c._id.split(':')[1],
      asunto: c.asunto,
      remitente: c.remitente,
      buzon: c.buzon ?? '',
      resultado: c.resultado,
      registrado: c.registrado ?? Boolean(c.resultado?.startsWith('✅')),
      cuando: c.cuando,
    })),
  });
});

// Vuelve a leer un correo ya revisado (p. ej. uno descartado por error) y lo registra si procede.
rutasGoogle.post('/gmail/revisados/:id/reintentar', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  const id = String(req.params.id);
  if (!/^[0-9a-f]{6,32}$/i.test(id)) throw new ErrorHttp(400, 'Correo no válido');
  const previo = await CorreoRevisado.findById(`${usuario.id}:${id}`).lean();
  // Los registros antiguos no dicen de qué Gmail vinieron: eran del principal.
  const cuenta = cuentaDe(usuario, previo?.cuenta) ?? cuentasDe(usuario).find((c) => c.datos.email === previo?.buzon);
  if (!cuenta) throw new ErrorHttp(400, 'El Gmail de ese aviso ya no está vinculado');
  if (enCurso.has(claveDe(usuario, cuenta)) || escaneos.has(claveDe(usuario, cuenta))) throw new ErrorHttp(409, 'Ya se está revisando ese correo. Espera unos segundos.');
  if (await Movimiento.exists({ correoId: id, creadoPor: usuario._id })) throw new ErrorHttp(409, 'Ese correo ya está registrado en tu libro.');
  const resultado = { revisados: 0, registrados: 0, duplicados: 0 };
  enCurso.add(claveDe(usuario, cuenta));
  try {
    const { libro, autorizacion } = await prepararLectura(usuario, cuenta);
    await procesarUno(usuario, cuenta, libro, autorizacion, id, resultado);
  } catch (err) {
    throw new ErrorHttp(502, motivoDeError(err).motivo);
  } finally {
    enCurso.delete(claveDe(usuario, cuenta));
  }
  if (resultado.registrados) await actualizarCuenta(usuario, cuenta, { $inc: { registrados: resultado.registrados } });
  const revisado = await CorreoRevisado.findById(`${usuario.id}:${id}`).lean();
  res.json({ nuevos: resultado.registrados, resultado: revisado?.resultado ?? '', usuario: await publico(await Usuario.findById(usuario._id)) });
});

// Revisa los correos de los últimos meses (1, 3, 6, 12 o 24) o de todo el correo ("todo"),
// y registra los gastos e ingresos que encuentre. Sin «cuenta», en todos los Gmail vinculados.
rutasGoogle.post('/gmail/escanear', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  if (!cuentasDe(usuario).length) throw new ErrorHttp(400, 'Primero vincula tu Gmail');
  const cuenta = req.body.cuenta ? cuentaPedida(usuario, req).clave : null;
  const fecha = (t) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime());
  let desde = 'todo';
  let hasta = null;
  if (req.body.meses === 'fechas') {
    // Un periodo elegido a mano: «hasta» no puede pasar de hoy.
    if (!fecha(req.body.desde) || !fecha(req.body.hasta)) throw new ErrorHttp(400, 'Elige la fecha de inicio y la de fin.');
    if (req.body.desde > req.body.hasta) throw new ErrorHttp(400, 'La fecha de inicio debe ser anterior a la de fin.');
    if (req.body.desde > hoyLocal()) throw new ErrorHttp(400, 'La fecha de inicio no puede ser posterior a hoy.');
    desde = req.body.desde;
    hasta = req.body.hasta > hoyLocal() ? hoyLocal() : req.body.hasta;
  } else if (req.body.meses !== 'todo') {
    const meses = [1, 3, 6, 12, 24].includes(Number(req.body.meses)) ? Number(req.body.meses) : 1;
    desde = sumarDias(hoyLocal(), -Math.round(meses * 30.5));
  }
  const mensaje = await iniciarEscaneo(usuario, desde, hasta, { cuenta });
  res.json({ mensaje, usuario: await publico(await Usuario.findById(usuario._id)) });
});

rutasGoogle.delete('/gmail/escanear', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  const mensaje = detenerEscaneo(usuario)
    ? 'Deteniendo el escaneo: se para tras el correo que está leyendo. Lo ya registrado se queda.'
    : 'No hay ningún escaneo en marcha.';
  res.json({ mensaje });
});

// Pausa o reanuda la lectura de un Gmail sin desvincularlo.
rutasGoogle.patch('/gmail', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  const cuenta = cuentaPedida(usuario, req);
  if (typeof req.body.activo !== 'boolean') throw new ErrorHttp(400, 'Datos inválidos');
  cuenta.datos.activo = req.body.activo;
  if (req.body.activo) cuenta.datos.error = undefined;
  await usuario.save();
  res.json({ usuario: await publico(usuario) });
});

// Deja de leer un Gmail y retira el permiso en Google. El acceso con Google a la app se mantiene.
// Si se quita el principal, el siguiente pasa a serlo.
rutasGoogle.delete('/gmail', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  const cuenta = cuentaPedida(usuario, req);
  if (enCurso.has(claveDe(usuario, cuenta)) || escaneos.has(claveDe(usuario, cuenta))) throw new ErrorHttp(409, 'Ese correo se está revisando ahora. Detén el escaneo o espera a que termine.');
  const token = descifrar(cuenta.datos.token);
  if (token) pedirGoogle('https://oauth2.googleapis.com/revoke', formulario({ token })).catch(() => {});
  for (const c of cuentasDe(usuario)) accesos.delete(claveDe(usuario, c));
  if (cuenta.clave === PRINCIPAL) {
    const [siguiente] = usuario.gmailExtra;
    if (siguiente) {
      const { _id, ...resto } = siguiente.toObject();
      usuario.gmail = resto;
      usuario.gmailExtra.pull(_id);
    } else {
      usuario.gmail = undefined;
    }
  } else {
    usuario.gmailExtra.pull(cuenta.datos._id);
  }
  await usuario.save();
  res.json({ usuario: await publico(usuario) });
});

// ---------- lectura de Gmail ----------

// ---------- varias cuentas de Gmail por persona ----------

// «gmail» es la cuenta principal; «gmailExtra», los correos que se añaden después.
const PRINCIPAL = 'principal';
const MAX_CUENTAS = 5;

/** Los Gmail vinculados de una persona: [{ clave: 'principal' | id, datos }], el principal primero. */
function cuentasDe(usuario) {
  const lista = [];
  if (usuario.gmail?.token) lista.push({ clave: PRINCIPAL, datos: usuario.gmail });
  for (const c of usuario.gmailExtra ?? []) if (c.token) lista.push({ clave: String(c._id), datos: c });
  return lista;
}

const cuentaDe = (usuario, clave) => cuentasDe(usuario).find((c) => c.clave === String(clave || PRINCIPAL));
// Identifica una cuenta de una persona en los registros en memoria (revisiones en curso, accesos).
const claveDe = (usuario, cuenta) => `${usuario.id}:${cuenta.clave}`;
const algunaEnCurso = (usuario) => cuentasDe(usuario).some((c) => enCurso.has(claveDe(usuario, c)));
// Para los avisos: «tu correo» si solo hay uno, o su dirección si hay varios.
const nombreCuenta = (usuario, cuenta) => (cuentasDe(usuario).length > 1 ? cuenta.datos.email : 'tu correo');

/** Cambia campos de una cuenta: actualizarCuenta(u, c, { $set: { error: 'x' } }) → «gmail.error» o «gmailExtra.$.error». */
function actualizarCuenta(usuario, cuenta, cambios) {
  const principal = cuenta.clave === PRINCIPAL;
  const prefijo = principal ? 'gmail.' : 'gmailExtra.$.';
  const orden = Object.fromEntries(Object.entries(cambios).map(([op, campos]) => [op, Object.fromEntries(Object.entries(campos).map(([k, v]) => [prefijo + k, v]))]));
  return Usuario.updateOne(principal ? { _id: usuario._id } : { _id: usuario._id, 'gmailExtra._id': cuenta.datos._id }, orden);
}

// Accesos de una hora que da Google a partir del token guardado, recordados en memoria por cuenta.
const accesos = new Map();

async function accesoGmail(usuario, cuenta) {
  const guardado = accesos.get(claveDe(usuario, cuenta));
  if (guardado && guardado.hasta > Date.now()) return guardado.token;
  const refresco = descifrar(cuenta.datos.token);
  if (!refresco) throw new ErrorGoogle(400, 'invalid_grant');
  const r = await pedirGoogle('https://oauth2.googleapis.com/token', formulario({
    client_id: config.google.clienteId,
    client_secret: config.google.secreto,
    refresh_token: refresco,
    grant_type: 'refresh_token',
  }));
  accesos.set(claveDe(usuario, cuenta), { token: r.access_token, hasta: Date.now() + (r.expires_in - 120) * 1000 });
  return r.access_token;
}

// Palabras de avisos de compra y pago; los demás correos ni se abren.
const FILTRO = '{category:purchases from:yape from:plin from:bcp from:viabcp from:interbank from:bbva from:scotiabank from:bancodelanacion from:bn.com.pe from:mibanco from:pichincha from:banbif from:falabella from:ripley from:izipay from:niubiz from:culqi from:mercadopago from:paypal from:rappi from:uber from:didi from:cabify from:pedidosya from:netflix from:spotify from:sunat yape yapeo compra compraste consumo consumiste cargo cargos pago pagaste pagado yapeaste plin transferencia transferiste constancia operación operacion movimiento boleta factura recibo comprobante voucher pedido orden viaje suscripción suscripcion renovación cobro débito debito purchase receipt payment order invoice charged recibiste yapearon plinearon abono depósito deposito sueldo haberes remuneración devolución reembolso}';

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
  // Los avisos de Yape y Plin («Yapeaste S/ 25 a…», «JUAN te envió un pago por S/ 10») se reconocen aunque la IA dude.
  if (!esGasto(gasto) && gasto?.tipo !== 'ingreso' && /yape|plin/i.test(`${correo.remitente} ${correo.asunto}`)) {
    const aviso = leerAvisoDePago(`${correo.asunto}\n${correo.texto}`, { app: correo.remitente });
    if (aviso) gasto = { ...aviso, fecha: correo.fecha };
  }
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

// Cuentas que se están revisando (revisión automática o «Volver a revisar») y cuentas con un escaneo en marcha.
const enCurso = new Set();
const escaneos = new Set();
const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

// Instante (en segundos) de la medianoche de un día «AAAA-MM-DD» en la zona horaria de la app.
function inicioDelDia(texto) {
  const utc = new Date(`${texto}T00:00:00Z`);
  const enZona = new Date(utc.toLocaleString('en-US', { timeZone: config.zona }));
  const enUtc = new Date(utc.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.floor((utc.getTime() - (enZona - enUtc)) / 1000);
}

// Quién es el titular, para que la IA reconozca las transferencias a sus propias cuentas.
const titularDe = (usuario) => [usuario.nombre, ...cuentasDe(usuario).flatMap((c) => [c.datos.nombre, c.datos.email && `correo ${c.datos.email}`])].filter(Boolean).join(' · ');
const DIA = 86400000;
// Los escaneos de meses anteriores avanzan por tandas hasta terminar, con este tope por escaneo.
const POR_TANDA = 100;
// Tope por escaneo (si quedan más, se puede pedir otra vez y sigue donde quedó).
const MAX_ESCANEO = 20000;
// Gmail existe desde 2004: «todo el correo» empieza ahí.
const INICIO_GMAIL = '2004-01-01';
// Escaneos que la persona pidió detener.
const detener = new Set();

const sumarDias = (texto, n) => new Date(new Date(`${texto}T00:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const fechaCorta = (texto) => new Date(`${texto}T00:00:00Z`).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Correos que cumplen la búsqueda y aún no se han revisado, recorriendo las páginas de Gmail
// hasta reunir «cuantos» (o uno más, para saber si quedan).
// Con «releer» (escaneos pedidos a mano) se vuelven a leer también los ya vistos que no dieron ningún
// movimiento; se saltan los ya registrados y los que este mismo escaneo ya leyó («hechos»).
async function buscarPendientes(usuario, autorizacion, q, cuantos, { releer = false, hechos = null } = {}) {
  const pendientes = [];
  let yaVistos = 0;
  let pagina;
  let paginas = 0;
  do {
    const parametros = new URLSearchParams({ q, maxResults: '100', ...(pagina && { pageToken: pagina }) });
    const r = await pedirGoogle(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${parametros}`, autorizacion);
    const ids = (r.messages ?? []).map((m) => m.id).filter((id) => !hechos?.has(id));
    let saltar;
    if (releer) {
      saltar = new Set((await Movimiento.find({ correoId: { $in: ids }, creadoPor: usuario._id }).select('correoId').lean()).map((m) => m.correoId));
      pendientes.push(...ids.filter((id) => !saltar.has(id)));
    } else {
      saltar = new Set((await CorreoVisto.find({ _id: { $in: ids.map((id) => `${usuario.id}:${id}`) } }).select('_id').lean()).map((v) => v._id));
      pendientes.push(...ids.filter((id) => !saltar.has(`${usuario.id}:${id}`)));
    }
    yaVistos += saltar.size;
    pagina = r.nextPageToken;
    paginas += 1;
  } while (pagina && pendientes.length <= cuantos && paginas < 300);
  return { pendientes, yaVistos };
}

// Un movimiento igual (mismo tipo y monto, un día arriba o abajo) ya anotado, por ejemplo a mano: no se duplica.
// En otra moneda se compara el importe cobrado, que no depende del tipo de cambio.
async function yaRegistrado(libro, datos) {
  const fecha = new Date(`${datos.fecha}T00:00:00Z`).getTime();
  return Movimiento.findOne({
    libro: libro._id,
    tipo: datos.tipo,
    ...(datos.moneda ? { moneda: datos.moneda, montoOriginal: datos.montoOriginal } : { monto: Math.round(datos.monto * 100) / 100 }),
    fecha: { $gte: new Date(fecha - DIA), $lte: new Date(fecha + DIA) },
  }).select('descripcion fecha').lean();
}

// Lee un correo y registra el gasto o ingreso que avise, anotando en «resultado» lo hecho.
async function procesarUno(usuario, cuenta, libro, autorizacion, id, resultado, alRegistrar) {
  // Ya hay un movimiento sacado de este correo (p. ej. si se vuelve a revisar): no se lee otra vez.
  if (await Movimiento.exists({ correoId: id, creadoPor: usuario._id })) {
    await CorreoVisto.updateOne({ _id: `${usuario.id}:${id}` }, { $setOnInsert: { visto: new Date() } }, { upsert: true });
    return;
  }
  const correo = leerMensaje(await pedirGoogle(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, autorizacion));
  // Si la IA falla, el correo no se marca como visto y se vuelve a intentar en la próxima revisión.
  const datos = await interpretar(correo, libro.moneda, titularDe(usuario));
  await CorreoVisto.updateOne({ _id: `${usuario.id}:${id}` }, { $setOnInsert: { visto: new Date() } }, { upsert: true });
  resultado.revisados += 1;
  let decision = 'No es un gasto ni un ingreso';
  let registrado = false;
  if (datos) {
    const igual = await yaRegistrado(libro, datos);
    if (igual) {
      resultado.duplicados += 1;
      decision = `No se anotó: ya había un ${datos.tipo} de ${datos.monto} en «${libro.nombre}» (${igual.descripcion}, ${igual.fecha.toISOString().slice(0, 10)})`;
    } else {
      const confirmacion = await registrarMovimiento(usuario, libro, datos, { correoId: id });
      decision = confirmacion.split('\n').slice(0, 2).join(' · ').replace(/\*/g, '');
      if (confirmacion.startsWith('✅')) {
        registrado = true;
        resultado.registrados += 1;
        alRegistrar?.(confirmacion, correo);
      }
    }
  }
  await CorreoRevisado.updateOne({ _id: `${usuario.id}:${id}` }, {
    $set: { usuario: usuario._id, asunto: correo.asunto, remitente: correo.remitente, resultado: decision, registrado, cuenta: cuenta.clave, buzon: cuenta.datos.email, extracto: `${correo.resumen}\n---\n${correo.texto}`.slice(0, 400), cuando: new Date() },
  }, { upsert: true }).catch(() => {});
}

/**
 * Revisa una tanda de correos que cumplen «q» y registra los gastos e ingresos, los más antiguos primero.
 * Va anotando en «resultado» { revisados, registrados, duplicados, quedan }: así se sabe lo hecho aunque falle a mitad.
 */
async function procesarCorreos(usuario, cuenta, libro, autorizacion, q, resultado, { maxCorreos, alRegistrar, alAvanzar, debeParar, releer = false, hechos = null }) {
  const busqueda = await buscarPendientes(usuario, autorizacion, q, maxCorreos, { releer, hechos });
  const pendientes = busqueda.pendientes.reverse();
  // Solo en la primera tanda: en las siguientes ya se cuentan también los que acaba de leer.
  resultado.yaVistos ??= busqueda.yaVistos;
  resultado.quedan = pendientes.length > maxCorreos;
  // Cuántos avisos tiene esta tanda y por cuál va: así la pantalla muestra que avanza.
  const tanda = pendientes.slice(0, maxCorreos);
  resultado.porLeer = tanda.length;
  resultado.leidos = 0;
  await alAvanzar?.();

  for (const id of tanda) {
    if (debeParar?.()) return;
    await procesarUno(usuario, cuenta, libro, autorizacion, id, resultado, alRegistrar);
    hechos?.add(id);
    resultado.leidos += 1;
    // Cada aviso pasa por la IA y tarda unos segundos: se guarda el avance tras cada uno.
    await alAvanzar?.();
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

async function prepararLectura(usuario, cuenta) {
  // El libro elegido en WhatsApp; si en ese solo puede leer, el primero donde pueda escribir (los suyos van antes).
  const libros = await librosDe(usuario);
  const activo = libroActivo(usuario, libros);
  const libro = activo && puedeEscribir(usuario, activo) ? activo : libros.find((l) => puedeEscribir(usuario, l));
  if (!libro) throw new Error('No tienes ningún libro donde puedas registrar los movimientos.');
  return { libro, autorizacion: { headers: { Authorization: `Bearer ${await accesoGmail(usuario, cuenta)}` } } };
}

const BUSQUEDA = `-in:sent -in:drafts -in:chats ${FILTRO}`;

/** Lee los correos nuevos de una cuenta de Gmail y registra gastos e ingresos. Devuelve cuántos registró. */
async function revisarCuenta(usuario, cuenta) {
  const clave = claveDe(usuario, cuenta);
  if (enCurso.has(clave) || escaneos.has(clave) || !googleDisponible()) return 0;
  enCurso.add(clave);
  const resultado = { revisados: 0, registrados: 0, duplicados: 0, quedan: false };
  try {
    const { libro, autorizacion } = await prepararLectura(usuario, cuenta);
    // Desde la vinculación (como mucho una semana atrás), sin los correos que envió la propia persona.
    const desde = Math.floor(Math.max(cuenta.datos.desde?.getTime() ?? 0, Date.now() - 7 * DIA) / 1000);
    const desdeDonde = cuentasDe(usuario).length > 1 ? ` (${cuenta.datos.email})` : '';
    await procesarCorreos(usuario, cuenta, libro, autorizacion, `after:${desde} ${BUSQUEDA}`, resultado, {
      maxCorreos: MAX_CORREOS,
      alRegistrar: (confirmacion, correo) => avisarPorWhatsapp(usuario, `📧 *Desde tu correo*${desdeDonde} (${correo.asunto.slice(0, 80)})\n${confirmacion}\nYa está en tu calendario de la app.`),
    });
    await actualizarCuenta(usuario, cuenta, { $set: { ultimaRevision: new Date() }, $unset: { error: 1 }, $inc: { registrados: resultado.registrados } });
  } catch (err) {
    const { motivo, permisoRetirado } = motivoDeError(err);
    console.error(`Gmail (${usuario.email} · ${cuenta.datos.email}):`, err.message);
    await actualizarCuenta(usuario, cuenta, {
      $set: { error: motivo, ultimaRevision: new Date(), ...(permisoRetirado && { activo: false }) },
      $inc: { registrados: resultado.registrados },
    });
    if (permisoRetirado) accesos.delete(clave);
  } finally {
    enCurso.delete(clave);
  }
  return resultado.registrados;
}

/** Lee los correos nuevos de todos los Gmail activos de una persona. Devuelve cuántos movimientos registró. */
export async function revisarUsuario(usuario) {
  let total = 0;
  for (const cuenta of cuentasDe(usuario)) if (cuenta.datos.activo) total += await revisarCuenta(usuario, cuenta);
  return total;
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
 * Sin «cuenta», en todos los Gmail activos de la persona; cada uno avanza por tandas hasta terminar.
 * «previo» continúa los contadores de un escaneo interrumpido.
 * Devuelve el texto para la persona; el resultado llega por WhatsApp y se ve en «Mi cuenta».
 */
export async function iniciarEscaneo(usuario, desdeTexto, hastaTexto, { cuenta: claveCuenta = null, previo = null } = {}) {
  const todas = cuentasDe(usuario);
  if (!todas.length) return 'Primero vincula tu Gmail en «Mi cuenta» de la app.';
  if (!googleDisponible()) return 'La lectura de Gmail no está configurada en el servidor.';
  const elegidas = claveCuenta ? todas.filter((c) => c.clave === String(claveCuenta)) : todas.filter((c) => c.datos.activo);
  if (!elegidas.length) return 'Tus correos vinculados están en pausa o sin permiso. Reanúdalos o vuelve a vincularlos en «Mi cuenta».';

  const hoy = hoyLocal();
  const valida = (t) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime());
  let desde = desdeTexto === 'todo' ? INICIO_GMAIL : valida(desdeTexto) ? desdeTexto : sumarDias(hoy, -30);
  const hasta = valida(hastaTexto) && hastaTexto <= hoy ? hastaTexto : hoy;
  if (desde < INICIO_GMAIL) desde = INICIO_GMAIL;
  if (desde > hasta) return 'Las fechas para revisar el correo no son válidas.';
  const todo = desde === INICIO_GMAIL;
  // Un escaneo pedido a mano mira TODOS los avisos del periodo: también los ya vistos que no dieron ningún
  // movimiento (descartados antes por error). Solo se saltan los que ya están registrados.
  const releer = true;
  const periodo = todo ? 'de todo tu correo' : `del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;

  const libres = elegidas.filter((c) => !escaneos.has(claveDe(usuario, c)));
  if (!libres.length) return '⏳ Ya estoy revisando tu correo. Te aviso cuando termine.';
  for (const cuenta of libres) await escanearCuenta(usuario, cuenta, desde, hasta, periodo, previo, releer);

  if (previo) return '';
  const donde = todas.length > 1
    ? ` en ${libres.length === 1 ? libres[0].datos.email : `tus ${libres.length} correos (${libres.map((c) => c.datos.email).join(', ')})`}`
    : '';
  return `📧 Empecé a revisar ${periodo}${donde}, en tandas de ${POR_TANDA} avisos de compras, pagos e ingresos. ${todo ? 'Si tienes muchos correos puede tardar bastante (incluso horas); ' : 'Puede tardar varios minutos; '}${usuario.whatsapp && whatsappConectado() ? 'te aviso por WhatsApp cuando termine' : 'verás el avance en «Mi cuenta»'}. Puedes seguir usando la app mientras tanto.`;
}

// Arranca en segundo plano el escaneo de una cuenta; vuelve en cuanto queda guardado su estado inicial.
async function escanearCuenta(usuario, cuenta, desde, hasta, periodo, previo, releer) {
  const clave = claveDe(usuario, cuenta);
  escaneos.add(clave);
  detener.delete(clave);
  mantenerDespierto(true);
  const estado = {
    estado: 'en curso',
    desde: new Date(desde),
    hasta: new Date(hasta),
    revisados: previo?.revisados ?? 0,
    registrados: previo?.registrados ?? 0,
    duplicados: previo?.duplicados ?? 0,
    ...(previo?.yaVistos != null && { yaVistos: previo.yaVistos }),
    quedan: false,
    releido: releer,
    inicio: previo?.inicio ?? new Date(),
  };
  const yaRegistrados = estado.registrados;
  const guardar = () => actualizarCuenta(usuario, cuenta, { $set: { escaneo: estado } });
  const donde = cuentasDe(usuario).length > 1 ? ` (${cuenta.datos.email})` : '';
  try {
    await guardar();
  } catch (err) {
    escaneos.delete(clave);
    mantenerDespierto(false);
    throw err;
  }

  (async () => {
    try {
      // Con fechas en texto Gmail usa la medianoche de California (las 3:00 en Lima) y se perdían los
      // correos de madrugada: se le pasa el instante exacto de la medianoche en la zona de la app.
      const q = `after:${inicioDelDia(desde)} before:${inicioDelDia(sumarDias(hasta, 1))} ${BUSQUEDA}`;
      const hechos = new Set();
      do {
        // Si la revisión automática está leyendo esta cuenta, se espera a que termine (como mucho 5 minutos).
        for (let i = 0; enCurso.has(clave) && i < 150; i += 1) await esperar(2000);
        // Cada tanda pide un acceso al día: los de Google caducan a la hora.
        const { libro, autorizacion } = await prepararLectura(usuario, cuenta);
        await procesarCorreos(usuario, cuenta, libro, autorizacion, q, estado, { maxCorreos: POR_TANDA, alAvanzar: guardar, debeParar: () => detener.has(clave), releer, hechos });
        await guardar();
      } while (estado.quedan && !detener.has(clave) && estado.revisados < MAX_ESCANEO);

      const detenido = detener.has(clave);
      Object.assign(estado, { estado: 'terminado', fin: new Date(), ...(detenido && { quedan: true }) });
      avisarPorWhatsapp(usuario, [
        `📧 *Revisión ${periodo}${donde} ${detenido ? 'detenida' : 'terminada'}*`,
        `Revisé ${estado.revisados} correos y registré *${estado.registrados} movimientos*${estado.duplicados ? `; ${estado.duplicados} ya estaban anotados` : ''}.${estado.yaVistos ? ` Otros ${estado.yaVistos} ${estado.releido ? 'ya estaban registrados' : 'ya se habían revisado antes'}.` : ''} Ya están en tu calendario de la app.`,
        ...(estado.quedan ? ['Quedan correos por revisar: pídemelo otra vez y sigo donde quedé.'] : []),
        'Pregúntame por cualquier mes, por ejemplo: «ia ¿cuánto gasté en septiembre?».',
      ].join('\n'));
    } catch (err) {
      console.error(`Escaneo de Gmail (${usuario.email} · ${cuenta.datos.email}):`, err.message);
      const { motivo, permisoRetirado } = motivoDeError(err);
      Object.assign(estado, { estado: 'error', fin: new Date(), error: motivo });
      if (permisoRetirado) {
        accesos.delete(clave);
        await actualizarCuenta(usuario, cuenta, { $set: { activo: false, error: motivo } }).catch(() => {});
      }
    } finally {
      await guardar().catch(() => {});
      await actualizarCuenta(usuario, cuenta, { $inc: { registrados: estado.registrados - yaRegistrados } }).catch(() => {});
      detener.delete(clave);
      mantenerDespierto(false);
      escaneos.delete(clave);
    }
  })();
}

/** Pide detener los escaneos en curso de una persona; cada uno se para tras el correo que esté leyendo. */
export function detenerEscaneo(usuario) {
  const enMarcha = cuentasDe(usuario).map((c) => claveDe(usuario, c)).filter((clave) => escaneos.has(clave));
  for (const clave of enMarcha) detener.add(clave);
  return enMarcha.length > 0;
}


let temporizador = null;
let revisando = false;

async function revisarTodos() {
  if (revisando) return;
  revisando = true;
  try {
    const usuarios = await Usuario.find({ $or: [{ 'gmail.activo': true, 'gmail.token': { $exists: true } }, { 'gmailExtra.activo': true }] }).limit(500);
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
    const usuarios = await Usuario.find({ $or: [{ 'gmail.escaneo.estado': 'en curso' }, { 'gmailExtra.escaneo.estado': 'en curso' }] }).limit(50);
    const texto = (f) => f.toISOString().slice(0, 10);
    for (const usuario of usuarios) {
      for (const cuenta of cuentasDe(usuario)) {
        const e = cuenta.datos.escaneo;
        if (e?.estado !== 'en curso') continue;
        console.log(`Gmail: se reanuda el escaneo de ${usuario.email} · ${cuenta.datos.email}.`);
        await iniciarEscaneo(usuario, texto(e.desde), texto(e.hasta), {
          cuenta: cuenta.clave,
          previo: { revisados: e.revisados, registrados: e.registrados, duplicados: e.duplicados, yaVistos: e.yaVistos, inicio: e.inicio },
        });
      }
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
  // El plan gratuito de Render apaga la app tras 15 minutos sin visitas y con ella la revisión
  // automática: mientras haya algún Gmail activo, la app se visita sola para seguir despierta.
  setTimeout(vigilarDespierto, 40_000);
  setInterval(vigilarDespierto, 30 * 60_000);
}

let despiertoPorGmail = false;
async function vigilarDespierto() {
  try {
    const hayActivos = Boolean(await Usuario.exists({ $or: [{ 'gmail.activo': true, 'gmail.token': { $exists: true } }, { 'gmailExtra.activo': true }] }));
    if (hayActivos !== despiertoPorGmail) {
      despiertoPorGmail = hayActivos;
      mantenerDespierto(hayActivos);
      if (hayActivos && !config.urlPublica) console.warn('Gmail: falta APP_URL; Render puede apagar la app y parar la revisión automática.');
    }
  } catch (err) {
    console.error('Gmail (mantener despierto):', err.message);
  }
}

export function pararRevisionGmail() {
  clearInterval(temporizador);
  temporizador = null;
}
