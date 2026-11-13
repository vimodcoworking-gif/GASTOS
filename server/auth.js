import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { Usuario, Libro } from './models.js';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { ErrorHttp, texto } from './errores.js';
import { whatsappConectado, enviarANumero } from './whatsapp.js';
import { correoDisponible, enviarCorreo } from './correo.js';
import { comprobarLicencia, exigirLicencia } from './licencias.js';

const COOKIE = 'sesion';
const DURACION_MS = 30 * 24 * 60 * 60 * 1000;

export function iniciarSesion(res, usuario) {
  const token = jwt.sign({ id: usuario.id }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.produccion,
    maxAge: DURACION_MS,
  });
}

export async function esAdmin(usuario) {
  if (config.adminEmails.length) return config.adminEmails.includes(usuario.email);
  const primero = await Usuario.findOne().sort({ createdAt: 1 }).select('_id');
  return Boolean(primero?._id.equals(usuario._id));
}

export const publico = async (u) => ({
  id: u.id,
  nombre: u.nombre,
  email: u.email,
  whatsapp: u.whatsapp ?? '',
  recordatorio: { dias: u.recordatorio?.dias ?? 2, mismoDia: u.recordatorio?.mismoDia ?? true },
  esAdmin: await esAdmin(u),
  tienePassword: Boolean(u.passwordHash),
  google: Boolean(u.googleId),
  gmail: u.gmail?.token ? vistaGmail(u.gmail, 'principal') : null,
  // Todos los Gmail vinculados, el principal primero.
  correos: [
    ...(u.gmail?.token ? [vistaGmail(u.gmail, 'principal')] : []),
    ...(u.gmailExtra ?? []).filter((c) => c.token).map((c) => vistaGmail(c, String(c._id))),
  ],
});

const vistaGmail = (g, cuenta) => ({
  cuenta,
  email: g.email,
  activo: g.activo,
  desde: g.desde,
  ultimaRevision: g.ultimaRevision ?? null,
  registrados: g.registrados ?? 0,
  error: g.error ?? '',
  escaneo: g.escaneo?.estado ? g.escaneo : null,
});

// Deja el número solo con dígitos y código de país; devuelve null si viene vacío.
export function leerWhatsapp(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw new ErrorHttp(400, 'Número de WhatsApp inválido');
  let digitos = valor.replace(/\D/g, '');
  // Un celular peruano escrito sin prefijo (9 dígitos que empiezan por 9) recibe el 51.
  if (digitos.length === 9 && digitos.startsWith('9')) digitos = `51${digitos}`;
  if (digitos.length < 10 || digitos.length > 15) {
    throw new ErrorHttp(400, 'Escribe el WhatsApp con el código de país, por ejemplo 51 987 654 321');
  }
  return digitos;
}

async function whatsappLibre(whatsapp, exceptoId = null) {
  const otro = await Usuario.findOne({ whatsapp }).select('_id');
  if (otro && !otro._id.equals(exceptoId)) throw new ErrorHttp(409, 'Ese número de WhatsApp ya está en otra cuenta');
}

export async function requiereAdmin(req, res, next) {
  const usuario = await Usuario.findById(req.usuario.id);
  if (!usuario || !(await esAdmin(usuario))) throw new ErrorHttp(403, 'Solo el administrador puede ver esto');
  next();
}

// Id de la cuenta de la cookie de sesión, o undefined si no hay una válida.
export function idDeSesion(req) {
  try {
    return jwt.verify(req.cookies[COOKIE] ?? '', config.jwtSecret).id;
  } catch {
    // Sin cookie o con una caducada o manipulada.
    return undefined;
  }
}

export async function requiereSesion(req, res, next) {
  let id = idDeSesion(req);
  // Se comprueba que la cuenta siga existiendo, para que una eliminada pierda el acceso al momento.
  // La comprobación se recuerda un minuto: así no cuesta una consulta a la base en cada petición.
  // También se comprueba la licencia de VIMOD: si se suspende o vence, se pierde el acceso en un minuto.
  if (id && (cuentasVistas.get(id) ?? 0) < Date.now()) {
    const cuenta = await Usuario.findById(id).select('email altaAdmin');
    if (!cuenta) id = null;
    else {
      const licencia = await comprobarLicencia(cuenta);
      if (!licencia.ok) {
        res.clearCookie(COOKIE);
        return res.status(401).json({ error: licencia.motivo });
      }
      cuentasVistas.set(id, Date.now() + 60_000);
    }
  }
  if (!id) return res.status(401).json({ error: 'Inicia sesión para continuar' });
  req.usuario = { id };
  next();
}

const cuentasVistas = new Map();
// Al eliminar una cuenta se olvida al instante, sin esperar al minuto.
export const olvidarCuenta = (id) => cuentasVistas.delete(String(id));

// Alta de una cuenta con su libro «Personal»; la usan el registro y el administrador.
export async function crearUsuario(cuerpo, { whatsappObligatorio = false, altaAdmin = false } = {}) {
  const whatsapp = leerWhatsapp(cuerpo.whatsapp);
  if (whatsappObligatorio && !whatsapp) throw new ErrorHttp(400, 'Falta el número de WhatsApp');
  const nombre = texto(cuerpo.nombre, 'el nombre', 60);
  const email = texto(cuerpo.email, 'el correo').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorHttp(400, 'El correo no es válido');
  const password = leerPassword(cuerpo.password);
  if (await Usuario.exists({ email })) throw new ErrorHttp(409, 'Ya existe una cuenta con ese correo');
  if (whatsapp) await whatsappLibre(whatsapp);

  const usuario = await Usuario.create({
    nombre,
    email,
    passwordHash: await bcrypt.hash(password, 11),
    ...(whatsapp && { whatsapp }),
    ...(altaAdmin && { altaAdmin }),
  });
  await Libro.create({ nombre: 'Personal', propietario: usuario._id });
  return usuario;
}

const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Prueba de nuevo en unos minutos.' },
});

export const rutasAuth = Router();

rutasAuth.post('/registro', limite, async (req, res) => {
  await exigirLicencia(texto(req.body.email, 'el correo'));
  const usuario = await crearUsuario(req.body, { whatsappObligatorio: true });
  iniciarSesion(res, usuario);
  res.status(201).json({ usuario: await publico(usuario) });
});

rutasAuth.post('/login', limite, async (req, res) => {
  const email = texto(req.body.email, 'el correo').toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const usuario = await Usuario.findOne({ email });
  if (!usuario?.passwordHash || !(await bcrypt.compare(password, usuario.passwordHash))) {
    // El mismo mensaje exista o no la cuenta; la pista de Google sirve a quien se registró con ella.
    throw new ErrorHttp(401, `Correo o contraseña incorrectos${config.google.clienteId ? '. Si creaste la cuenta con Google, usa «Continuar con Google».' : ''}`);
  }
  await exigirLicencia(usuario);
  iniciarSesion(res, usuario);
  res.json({ usuario: await publico(usuario) });
});

rutasAuth.post('/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.status(204).end();
});

// ---------- recuperación de contraseña ----------

const MINUTOS_CODIGO = 15;
const MAX_INTENTOS_CODIGO = 5;
const huella = (usuarioId, codigo) => createHash('sha256').update(`${usuarioId}:${codigo}:${config.jwtSecret}`).digest();

function leerPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw new ErrorHttp(400, 'La contraseña debe tener entre 8 y 72 caracteres');
  }
  return password;
}

// La usan la recuperación por código y el administrador.
export async function cambiarPassword(usuario, password) {
  usuario.passwordHash = await bcrypt.hash(leerPassword(password), 11);
  usuario.codigoHash = undefined;
  usuario.codigoExpira = undefined;
  usuario.codigoIntentos = 0;
  await usuario.save();
}

// Por dónde puede llegar el código, para que la pantalla de acceso lo explique.
rutasAuth.get('/recuperacion', (req, res) => {
  res.json({ whatsapp: whatsappConectado(), correo: correoDisponible() });
});

rutasAuth.post('/olvide', limite, async (req, res) => {
  const email = texto(req.body.email, 'el correo').toLowerCase();
  const porWhatsapp = whatsappConectado();
  const porCorreo = correoDisponible();
  if (!porWhatsapp && !porCorreo) {
    throw new ErrorHttp(503, 'La recuperación automática no está disponible ahora. Pide al administrador que te ponga una contraseña nueva.');
  }

  const usuario = await Usuario.findOne({ email });
  if (usuario) {
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    usuario.codigoHash = huella(usuario.id, codigo).toString('hex');
    usuario.codigoExpira = new Date(Date.now() + MINUTOS_CODIGO * 60000);
    usuario.codigoIntentos = 0;
    await usuario.save();

    const mensaje = `Tu código para cambiar la contraseña de N.F.T.A Gastos es *${codigo}*. Caduca en ${MINUTOS_CODIGO} minutos. Si no lo pediste, ignora este mensaje.`;
    // Los envíos no se esperan: así la respuesta tarda lo mismo exista o no la cuenta.
    if (porWhatsapp && usuario.whatsapp) {
      enviarANumero(usuario.whatsapp, { texto: `🔐 ${mensaje}` }).catch((err) => console.error('Código por WhatsApp:', err.message));
    }
    if (porCorreo) {
      enviarCorreo({ para: usuario.email, asunto: 'Tu código para cambiar la contraseña', texto: mensaje.replace(/\*/g, '') })
        .catch((err) => console.error('Código por correo:', err.message));
    }
  }

  // Misma respuesta exista o no la cuenta, para no revelar qué correos están registrados.
  const canales = [porWhatsapp && 'WhatsApp', porCorreo && 'correo'].filter(Boolean).join(' y por ');
  res.json({ mensaje: `Si hay una cuenta con ese correo, le hemos enviado un código por ${canales}. Caduca en ${MINUTOS_CODIGO} minutos.` });
});

rutasAuth.post('/restablecer', limite, async (req, res) => {
  const email = texto(req.body.email, 'el correo').toLowerCase();
  const codigo = typeof req.body.codigo === 'string' ? req.body.codigo.replace(/\D/g, '') : '';
  const password = leerPassword(req.body.password);
  const invalido = new ErrorHttp(400, 'El código no es correcto o ha caducado. Pide uno nuevo.');

  const usuario = await Usuario.findOne({ email });
  if (!usuario?.codigoHash || !usuario.codigoExpira || usuario.codigoExpira < new Date() || usuario.codigoIntentos >= MAX_INTENTOS_CODIGO) throw invalido;

  const esperado = Buffer.from(usuario.codigoHash, 'hex');
  const recibido = huella(usuario.id, codigo);
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) {
    usuario.codigoIntentos += 1;
    await usuario.save();
    throw invalido;
  }

  await cambiarPassword(usuario, password);
  await exigirLicencia(usuario);
  iniciarSesion(res, usuario);
  res.json({ usuario: await publico(usuario) });
});

// Cambiar el nombre o el WhatsApp de la propia cuenta (un WhatsApp vacío lo quita).
rutasAuth.patch('/yo', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  if (req.body.nombre !== undefined) usuario.nombre = texto(req.body.nombre, 'el nombre', 60);
  if (req.body.whatsapp !== undefined) {
    const whatsapp = leerWhatsapp(req.body.whatsapp);
    if (whatsapp) await whatsappLibre(whatsapp, usuario._id);
    usuario.whatsapp = whatsapp ?? undefined;
  }
  // { recordatorio: { dias: 0-7, mismoDia: bool } }
  if (req.body.recordatorio !== undefined) {
    const dias = Number(req.body.recordatorio?.dias);
    if (!Number.isInteger(dias) || dias < 0 || dias > 7) throw new ErrorHttp(400, 'Elige de 0 a 7 días para el recordatorio');
    usuario.recordatorio = { dias, mismoDia: req.body.recordatorio?.mismoDia !== false };
  }
  await usuario.save();
  res.json({ usuario: await publico(usuario) });
});

rutasAuth.get('/yo', requiereSesion, async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  if (!usuario) {
    res.clearCookie(COOKIE);
    throw new ErrorHttp(401, 'Inicia sesión para continuar');
  }
  res.json({ usuario: await publico(usuario) });
});
