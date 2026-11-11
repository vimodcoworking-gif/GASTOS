import { Router } from 'express';
import { leerMedio } from './medios.js';
import mongoose from 'mongoose';
import { Usuario, Libro, Movimiento } from './models.js';
import { ErrorHttp, texto } from './errores.js';
import rateLimit from 'express-rate-limit';
import { generarInforme } from './informe.js';
import { informePeriodo, conversar, ejecutarAcciones } from './bot.js';
import { iaDisponible } from './ia.js';
import { whatsappConectado, enviarANumero } from './whatsapp.js';
import { correoDisponible, enviarCorreo, metodoCorreo, sinFormatoWhatsapp } from './correo.js';
import { esAdmin } from './auth.js';

const MAX_REPETICIONES = 366;
const redondear = (n) => Math.round(n * 100) / 100;

// ---------- utilidades de fechas (todo en UTC, formato AAAA-MM-DD) ----------

function leerFecha(valor, campo = 'la fecha') {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new ErrorHttp(400, `Falta ${campo}`);
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) throw new ErrorHttp(400, `Falta ${campo}`);
  return fecha;
}

const fechaTexto = (fecha) => (fecha ? fecha.toISOString().slice(0, 10) : null);

// Misma fecha N meses después; si el día no existe (31 → febrero) usa el último del mes.
function sumarMeses(fecha, n) {
  const anio = fecha.getUTCFullYear();
  const mes = fecha.getUTCMonth() + n;
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes, Math.min(fecha.getUTCDate(), ultimoDia)));
}

function sumarDias(fecha, n) {
  const copia = new Date(fecha);
  copia.setUTCDate(copia.getUTCDate() + n);
  return copia;
}

// Fecha de la repetición número i según la frecuencia elegida.
const SALTOS = {
  dia: (fecha, i) => sumarDias(fecha, i),
  semana: (fecha, i) => sumarDias(fecha, 7 * i),
  quincena: (fecha, i) => sumarDias(fecha, 14 * i),
  mes: sumarMeses,
  bimestre: (fecha, i) => sumarMeses(fecha, 2 * i),
  trimestre: (fecha, i) => sumarMeses(fecha, 3 * i),
  semestre: (fecha, i) => sumarMeses(fecha, 6 * i),
  anio: (fecha, i) => sumarMeses(fecha, 12 * i),
};

// Lee { repetir: una clave de SALTOS, veces } del cuerpo; null si no se pide repetir.
function leerRepeticion(cuerpo) {
  let cada = cuerpo.repetir;
  let veces = Number(cuerpo.veces);
  // Formato anterior: solo «repetirMeses».
  if (cada === undefined && Number(cuerpo.repetirMeses) > 0) {
    cada = 'mes';
    veces = Number(cuerpo.repetirMeses);
  }
  if (cada === undefined || cada === null || cada === 'no' || cada === '') return null;
  if (!Object.hasOwn(SALTOS, cada)) throw new ErrorHttp(400, 'Frecuencia de repetición inválida');
  if (!Number.isInteger(veces) || veces < 1 || veces > MAX_REPETICIONES) {
    throw new ErrorHttp(400, `El número de repeticiones debe estar entre 1 y ${MAX_REPETICIONES}`);
  }
  return { cada, veces };
}

// Copias futuras de un movimiento; siempre nacen pendientes.
function copiasFuturas(base, repeticion) {
  return Array.from({ length: repeticion.veces }, (_, i) => ({
    ...base,
    fecha: SALTOS[repeticion.cada](base.fecha, i + 1),
    pagado: false,
    fechaPago: null,
  }));
}

// ---------- acceso a libros ----------

function rolEn(libro, usuarioId) {
  if (libro.propietario.equals(usuarioId)) return 'propietario';
  return libro.miembros.find((m) => m.usuario.equals(usuarioId))?.rol ?? null;
}

async function cargarLibro(req, res, next) {
  const libro = mongoose.isValidObjectId(req.params.libroId) ? await Libro.findById(req.params.libroId) : null;
  const rol = libro && rolEn(libro, req.usuario.id);
  // Mismo 404 exista o no el libro, para no revelar libros ajenos.
  if (!rol) throw new ErrorHttp(404, 'Libro no encontrado');
  req.libro = libro;
  req.rol = rol;
  next();
}

function puedeEditar(req, res, next) {
  if (req.rol === 'lector') throw new ErrorHttp(403, 'Solo tienes permiso de lectura en este libro');
  next();
}

function soloPropietario(req, res, next) {
  if (req.rol !== 'propietario') throw new ErrorHttp(403, 'Solo el propietario puede hacer esto');
  next();
}

function leerMoneda(valor) {
  if (typeof valor !== 'string' || !/^[A-Z]{3}$/.test(valor)) throw new ErrorHttp(400, 'Moneda inválida');
  return valor;
}

function leerRol(valor) {
  if (valor !== 'lector' && valor !== 'editor') throw new ErrorHttp(400, 'Rol inválido');
  return valor;
}

const libroPublico = (libro, usuarioId) => ({
  id: libro.id,
  nombre: libro.nombre,
  moneda: libro.moneda,
  rol: rolEn(libro, usuarioId),
});

export const rutasApi = Router();

// Por dónde se puede enviar un estado de cuenta ahora mismo, y los datos de contacto de quien pregunta.
rutasApi.get('/canales', async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id).select('email whatsapp');
  res.json({ correo: correoDisponible(), whatsapp: whatsappConectado(), miCorreo: usuario.email, miWhatsapp: usuario.whatsapp ?? '' });
});

// ---------- libros ----------

rutasApi.get('/libros', async (req, res) => {
  const uid = req.usuario.id;
  const libros = await Libro.find({ $or: [{ propietario: uid }, { 'miembros.usuario': uid }] })
    .populate('propietario', 'nombre')
    .sort('createdAt');
  res.json({
    libros: libros.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      moneda: l.moneda,
      rol: rolEn({ propietario: l.propietario._id, miembros: l.miembros }, uid),
      propietario: l.propietario.nombre,
    })),
  });
});

rutasApi.post('/libros', async (req, res) => {
  const libro = await Libro.create({
    nombre: texto(req.body.nombre, 'el nombre', 60),
    moneda: leerMoneda(req.body.moneda),
    propietario: req.usuario.id,
  });
  res.status(201).json({ libro: libroPublico(libro, req.usuario.id) });
});

const libro = Router({ mergeParams: true });
rutasApi.use('/libros/:libroId', cargarLibro, libro);

libro.patch('/', soloPropietario, async (req, res) => {
  if (req.body.nombre !== undefined) req.libro.nombre = texto(req.body.nombre, 'el nombre', 60);
  if (req.body.moneda !== undefined) req.libro.moneda = leerMoneda(req.body.moneda);
  await req.libro.save();
  res.json({ libro: libroPublico(req.libro, req.usuario.id) });
});

libro.delete('/', soloPropietario, async (req, res) => {
  const propios = await Libro.countDocuments({ propietario: req.usuario.id });
  if (propios <= 1) throw new ErrorHttp(400, 'No puedes eliminar tu único libro');
  await Movimiento.deleteMany({ libro: req.libro._id });
  await req.libro.deleteOne();
  res.status(204).end();
});

// ---------- compartir ----------

libro.get('/miembros', async (req, res) => {
  await req.libro.populate([
    { path: 'propietario', select: 'nombre email' },
    { path: 'miembros.usuario', select: 'nombre email' },
  ]);
  const { propietario, miembros } = req.libro;
  res.json({
    miembros: [
      { id: propietario.id, nombre: propietario.nombre, email: propietario.email, rol: 'propietario' },
      ...miembros
        .filter((m) => m.usuario)
        .map((m) => ({ id: m.usuario.id, nombre: m.usuario.nombre, email: m.usuario.email, rol: m.rol })),
    ],
  });
});

libro.post('/miembros', soloPropietario, async (req, res) => {
  const email = texto(req.body.email, 'el correo').toLowerCase();
  const rol = leerRol(req.body.rol);
  const invitado = await Usuario.findOne({ email });
  if (!invitado) throw new ErrorHttp(404, 'No hay ninguna cuenta con ese correo. Pídele que se registre primero.');
  if (rolEn(req.libro, invitado._id)) throw new ErrorHttp(409, 'Esa persona ya tiene acceso a este libro');
  req.libro.miembros.push({ usuario: invitado._id, rol });
  await req.libro.save();
  res.status(201).json({ miembro: { id: invitado.id, nombre: invitado.nombre, email: invitado.email, rol } });
});

libro.patch('/miembros/:usuarioId', soloPropietario, async (req, res) => {
  const miembro = req.libro.miembros.find((m) => m.usuario.equals(req.params.usuarioId));
  if (!miembro) throw new ErrorHttp(404, 'Miembro no encontrado');
  miembro.rol = leerRol(req.body.rol);
  await req.libro.save();
  res.status(204).end();
});

// El propietario puede quitar a cualquiera; un miembro solo puede salirse a sí mismo.
libro.delete('/miembros/:usuarioId', async (req, res) => {
  const objetivo = req.params.usuarioId;
  if (req.rol !== 'propietario' && objetivo !== req.usuario.id) {
    throw new ErrorHttp(403, 'Solo el propietario puede quitar a otros miembros');
  }
  const antes = req.libro.miembros.length;
  req.libro.miembros = req.libro.miembros.filter((m) => !m.usuario.equals(objetivo));
  if (req.libro.miembros.length === antes) throw new ErrorHttp(404, 'Miembro no encontrado');
  await req.libro.save();
  res.status(204).end();
});

// ---------- movimientos ----------

// Vale tanto para documentos de Mongoose como para los objetos planos de las consultas «lean».
const movPublico = (m) => ({
  id: String(m._id),
  tipo: m.tipo,
  descripcion: m.descripcion,
  categoria: m.categoria,
  monto: m.monto,
  // Cobrado en otra moneda: «monto» es su equivalente en la moneda del libro.
  ...(m.moneda && { moneda: m.moneda, montoOriginal: m.montoOriginal }),
  fecha: fechaTexto(m.fecha),
  pagado: m.pagado,
  fechaPago: fechaTexto(m.fechaPago),
  enSerie: Boolean(m.serie),
  // Registrado solo a partir de un correo de Gmail.
  desdeCorreo: Boolean(m.correoId),
  medio: m.medio ?? null,
  entidad: m.entidad ?? null,
});

function leerMovimiento(cuerpo, parcial = false) {
  const datos = {};
  const viene = (campo) => !parcial || cuerpo[campo] !== undefined;

  if (viene('tipo')) {
    if (cuerpo.tipo !== 'gasto' && cuerpo.tipo !== 'ingreso') throw new ErrorHttp(400, 'Tipo inválido');
    datos.tipo = cuerpo.tipo;
  }
  if (viene('descripcion')) datos.descripcion = texto(cuerpo.descripcion, 'la descripción', 120);
  if (viene('categoria')) {
    datos.categoria = typeof cuerpo.categoria === 'string' && cuerpo.categoria.trim()
      ? texto(cuerpo.categoria, 'la categoría', 40)
      : 'General';
  }
  if (viene('monto')) {
    const monto = redondear(Number(cuerpo.monto));
    if (typeof cuerpo.monto === 'boolean' || !Number.isFinite(monto) || monto <= 0 || monto > 1e12) {
      throw new ErrorHttp(400, 'El monto debe ser mayor que cero');
    }
    datos.monto = monto;
  }
  if (viene('fecha')) datos.fecha = leerFecha(cuerpo.fecha);
  if (cuerpo.pagado !== undefined) {
    datos.pagado = cuerpo.pagado === true;
    datos.fechaPago = datos.pagado ? new Date() : null;
  }
  // Medio de pago y entidad: vacíos quitan el dato.
  if (cuerpo.medio !== undefined || cuerpo.entidad !== undefined) {
    const { medio, entidad } = leerMedio(cuerpo.medio, cuerpo.entidad);
    if (cuerpo.medio !== undefined) datos.medio = medio ?? undefined;
    if (cuerpo.entidad !== undefined) datos.entidad = entidad ?? undefined;
  }
  return datos;
}

async function cargarMovimiento(req) {
  const mov = mongoose.isValidObjectId(req.params.id)
    ? await Movimiento.findOne({ _id: req.params.id, libro: req.libro._id })
    : null;
  if (!mov) throw new ErrorHttp(404, 'Movimiento no encontrado');
  return mov;
}

// Todo lo que pinta la vista del mes en una sola petición: el mes pedido, el siguiente y los pendientes.
// ?mes=AAAA-MM&hasta=AAAA-MM-DD
libro.get('/mes', async (req, res) => {
  const mes = req.query.mes;
  if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ErrorHttp(400, 'Mes inválido');
  const hasta = leerFecha(req.query.hasta, 'la fecha límite');
  const inicio = new Date(`${mes}-01T00:00:00Z`);
  const siguiente = sumarMeses(inicio, 1);
  const delLibro = { libro: req.libro._id };

  // Las tres consultas van a la vez y sin convertir a documentos de Mongoose, que aquí no hacen falta.
  const [actual, proximo, pendientes] = await Promise.all([
    Movimiento.find({ ...delLibro, fecha: { $gte: inicio, $lt: siguiente } }).sort({ fecha: 1, createdAt: 1 }).lean(),
    Movimiento.find({ ...delLibro, fecha: { $gte: siguiente, $lt: sumarMeses(inicio, 2) } }).sort({ fecha: 1, createdAt: 1 }).lean(),
    Movimiento.find({ ...delLibro, pagado: false, fecha: { $lte: hasta } }).sort({ fecha: 1 }).limit(100).lean(),
  ]);
  res.json({ actual: actual.map(movPublico), proximo: proximo.map(movPublico), pendientes: pendientes.map(movPublico) });
});

// ?mes=AAAA-MM
libro.get('/movimientos', async (req, res) => {
  const mes = req.query.mes;
  if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ErrorHttp(400, 'Mes inválido');
  const inicio = new Date(`${mes}-01T00:00:00Z`);
  const movimientos = await Movimiento.find({
    libro: req.libro._id,
    fecha: { $gte: inicio, $lt: sumarMeses(inicio, 1) },
  }).sort({ fecha: 1, createdAt: 1 });
  res.json({ movimientos: movimientos.map(movPublico) });
});

// Pagos y cobros sin marcar con fecha hasta ?hasta=AAAA-MM-DD (incluye los vencidos).
libro.get('/pendientes', async (req, res) => {
  const hasta = leerFecha(req.query.hasta, 'la fecha límite');
  const movimientos = await Movimiento.find({ libro: req.libro._id, pagado: false, fecha: { $lte: hasta } })
    .sort({ fecha: 1 })
    .limit(100);
  res.json({ movimientos: movimientos.map(movPublico) });
});

libro.post('/movimientos', puedeEditar, async (req, res) => {
  const datos = leerMovimiento(req.body);
  const repeticion = leerRepeticion(req.body);

  const base = { ...datos, libro: req.libro._id, creadoPor: req.usuario.id };
  if (repeticion) base.serie = new mongoose.Types.ObjectId();

  const creados = await Movimiento.insertMany([base, ...(repeticion ? copiasFuturas(base, repeticion) : [])]);
  res.status(201).json({ movimiento: movPublico(creados[0]), creados: creados.length });
});

// Al editar también se puede pedir repetir: se generan las repeticiones a partir de este movimiento.
// Si ya pertenecía a una serie, las posteriores se sustituyen por las nuevas.
libro.patch('/movimientos/:id', puedeEditar, async (req, res) => {
  const mov = await cargarMovimiento(req);
  const repeticion = leerRepeticion(req.body);
  const cambios = leerMovimiento(req.body, true);
  // El formulario usa la moneda del libro: si se cambia el monto, deja de contar el importe en la otra moneda.
  if (mov.moneda && cambios.monto !== undefined && cambios.monto !== mov.monto) {
    mov.moneda = undefined;
    mov.montoOriginal = undefined;
  }
  Object.assign(mov, cambios);

  let creados = 0;
  if (repeticion) {
    if (mov.serie) {
      await Movimiento.deleteMany({ libro: req.libro._id, serie: mov.serie, _id: { $ne: mov._id }, fecha: { $gt: mov.fecha } });
    } else {
      mov.serie = new mongoose.Types.ObjectId();
    }
  }
  await mov.save();
  if (repeticion) {
    const base = {
      libro: mov.libro, tipo: mov.tipo, descripcion: mov.descripcion, categoria: mov.categoria,
      monto: mov.monto, fecha: mov.fecha, serie: mov.serie, creadoPor: req.usuario.id, medio: mov.medio, entidad: mov.entidad,
    };
    creados = (await Movimiento.insertMany(copiasFuturas(base, repeticion))).length;
  }
  res.json({ movimiento: movPublico(mov), creados });
});

// ?siguientes=1 elimina también las repeticiones posteriores de la misma serie.
libro.delete('/movimientos/:id', puedeEditar, async (req, res) => {
  const mov = await cargarMovimiento(req);
  if (req.query.siguientes === '1' && mov.serie) {
    await Movimiento.deleteMany({ libro: req.libro._id, serie: mov.serie, fecha: { $gte: mov.fecha } });
  } else {
    await mov.deleteOne();
  }
  res.status(204).end();
});

// ---------- informe en PDF ----------

// ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (cualquier periodo: pasado, actual o futuro)
libro.get('/informe.pdf', async (req, res) => {
  const desde = leerFecha(req.query.desde, 'la fecha inicial');
  const hasta = leerFecha(req.query.hasta, 'la fecha final');
  if (hasta < desde) throw new ErrorHttp(400, 'La fecha final debe ser posterior a la inicial');
  if (hasta - desde > 3 * 366 * 24 * 60 * 60 * 1000) throw new ErrorHttp(400, 'El periodo no puede superar los 3 años');

  const movimientos = await Movimiento.find({ libro: req.libro._id, fecha: { $gte: desde, $lte: hasta } })
    .sort({ fecha: 1, createdAt: 1 })
    .limit(10000);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="gastos_${fechaTexto(desde)}_a_${fechaTexto(hasta)}.pdf"`);
  generarInforme(res, { libro: req.libro, desde, hasta, movimientos });
});

// ---------- enviar el estado de cuenta ----------

const limiteEnvios = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.usuario.id,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Has hecho muchos envíos seguidos. Prueba de nuevo dentro de una hora.' },
});

// { canal: 'whatsapp' | 'correo', desde, hasta, para? }. Por WhatsApp solo se envía al número de quien lo pide.
libro.post('/enviar', limiteEnvios, async (req, res) => {
  const desde = leerFecha(req.body.desde, 'la fecha inicial');
  const hasta = leerFecha(req.body.hasta, 'la fecha final');
  if (hasta < desde) throw new ErrorHttp(400, 'La fecha final debe ser posterior a la inicial');
  if (hasta - desde > 3 * 366 * 24 * 60 * 60 * 1000) throw new ErrorHttp(400, 'El periodo no puede superar los 3 años');

  const usuario = await Usuario.findById(req.usuario.id);
  const { canal } = req.body;

  if (canal === 'whatsapp') {
    if (!usuario.whatsapp) throw new ErrorHttp(400, 'Añade tu número de WhatsApp en «Mi cuenta» para recibirlo ahí');
    if (!whatsappConectado()) throw new ErrorHttp(409, 'El bot de WhatsApp no está conectado ahora');
    const informe = await informePeriodo(req.libro, desde, hasta);
    try {
      await enviarANumero(usuario.whatsapp, informe);
    } catch (err) {
      throw new ErrorHttp(502, `No se pudo enviar por WhatsApp: ${err.message}`);
    }
    return res.json({ destino: `+${usuario.whatsapp}` });
  }

  if (canal === 'correo') {
    const para = texto(req.body.para, 'el correo de destino').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) throw new ErrorHttp(400, 'El correo de destino no es válido');
    if (!correoDisponible()) throw new ErrorHttp(409, 'El envío por correo no está configurado en el servidor');
    const informe = await informePeriodo(req.libro, desde, hasta);
    try {
      await enviarCorreo({
        para,
        asunto: `Estado de cuenta · ${req.libro.nombre} · ${informe.periodo}`,
        texto: `${sinFormatoWhatsapp(informe.texto).replace(/^\S+\s/, '')}\n\nEl detalle de gastos e ingresos va en el PDF adjunto.\nEnviado por ${usuario.nombre} desde N.F.T.A Gastos.`,
        adjuntos: [informe.pdf],
      });
    } catch (err) {
      console.error('Correo:', err.message);
      // El motivo técnico solo se le enseña al administrador, que es quien puede arreglar la configuración.
      const motivo = (await esAdmin(usuario)) ? ` Motivo (${metodoCorreo()}): ${err.message}` : ' Avisa al administrador.';
      throw new ErrorHttp(502, `No se pudo enviar el correo.${motivo}`);
    }
    return res.json({ destino: para });
  }

  throw new ErrorHttp(400, 'Canal de envío inválido');
});

// ---------- resumen anual ----------

libro.get('/resumen', async (req, res) => {
  const anio = Number(req.query.anio);
  if (!Number.isInteger(anio) || anio < 1970 || anio > 2200) throw new ErrorHttp(400, 'Año inválido');
  const filtro = {
    libro: req.libro._id,
    fecha: { $gte: new Date(Date.UTC(anio, 0, 1)), $lt: new Date(Date.UTC(anio + 1, 0, 1)) },
  };

  const [porMes, porCategoria] = await Promise.all([
    Movimiento.aggregate([
      { $match: filtro },
      { $group: { _id: { mes: { $month: '$fecha' }, tipo: '$tipo', pagado: '$pagado' }, total: { $sum: '$monto' } } },
    ]),
    Movimiento.aggregate([
      { $match: filtro },
      { $group: { _id: { tipo: '$tipo', categoria: '$categoria' }, total: { $sum: '$monto' } } },
      { $sort: { total: -1 } },
    ]),
  ]);

  const vacio = () => ({ ingresos: 0, gastos: 0, gastosPagados: 0, gastosPendientes: 0, ingresosRecibidos: 0, ingresosPendientes: 0 });
  const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ...vacio() }));
  for (const { _id, total } of porMes) {
    const m = meses[_id.mes - 1];
    if (_id.tipo === 'gasto') {
      m.gastos += total;
      m[_id.pagado ? 'gastosPagados' : 'gastosPendientes'] += total;
    } else {
      m.ingresos += total;
      m[_id.pagado ? 'ingresosRecibidos' : 'ingresosPendientes'] += total;
    }
  }

  const totales = vacio();
  for (const m of meses) {
    for (const campo of Object.keys(totales)) {
      m[campo] = redondear(m[campo]);
      totales[campo] = redondear(totales[campo] + m[campo]);
    }
    m.balance = redondear(m.ingresos - m.gastos);
  }
  totales.balance = redondear(totales.ingresos - totales.gastos);

  res.json({
    anio,
    meses,
    totales,
    categorias: porCategoria.map((c) => ({ tipo: c._id.tipo, categoria: c._id.categoria, total: redondear(c.total) })),
  });
});

// ---------- asistente de IA en la app ----------

// Puede recibir por WhatsApp si el bot está conectado y la cuenta tiene número.
const recibeWhatsapp = (usuario) => whatsappConectado() && Boolean(usuario.whatsapp);

rutasApi.get('/ia/estado', async (req, res) => {
  const usuario = await Usuario.findById(req.usuario.id);
  const ia = await iaDisponible();
  res.json({ disponible: ia.disponible, whatsapp: recibeWhatsapp(usuario), gmail: Boolean(usuario.gmail?.token || usuario.gmailExtra?.some((c) => c.token)) });
});

// Una pregunta al asistente. Comparte la memoria de la conversación con el bot de WhatsApp.
rutasApi.post('/ia/chat', async (req, res) => {
  const mensaje = texto(req.body.mensaje, 'el mensaje', 1000);
  const libroId = mongoose.isValidObjectId(req.body.libroId) ? req.body.libroId : undefined;
  const usuario = await Usuario.findById(req.usuario.id);
  if (!(await iaDisponible()).disponible) throw new ErrorHttp(503, 'La IA no está activada. El administrador puede activarla en Admin → IA.');

  const puedeRecibirWhatsapp = recibeWhatsapp(usuario);
  const respuesta = await conversar(usuario, mensaje, { libroId, canal: 'web', puedeRecibirWhatsapp });
  if (!respuesta) throw new ErrorHttp(503, 'La IA no está disponible ahora mismo, o aún no tienes ningún libro.');

  const { textos, pdfs } = await ejecutarAcciones(usuario, respuesta.acciones, { libroId });
  let contestacion = [respuesta.texto, ...textos].filter(Boolean).join('\n\n');

  // Si pidió recibirlo por WhatsApp, se envía la respuesta y los PDF a su propio número.
  let enviadoWhatsapp = false;
  if (puedeRecibirWhatsapp && respuesta.acciones.some((a) => a?.tipo === 'whatsapp')) {
    try {
      if (contestacion) await enviarANumero(usuario.whatsapp, { texto: contestacion });
      for (const informe of pdfs) await enviarANumero(usuario.whatsapp, informe);
      enviadoWhatsapp = true;
      contestacion += '\n\n📲 Enviado a tu WhatsApp.';
    } catch (err) {
      contestacion += `\n\nNo se pudo enviar por WhatsApp: ${err.message}`;
    }
  }

  res.json({
    texto: contestacion,
    enviadoWhatsapp,
    pdfs: pdfs.map((p) => ({ nombre: p.pdf.nombre, datos: p.pdf.buffer.toString('base64') })),
  });
});

// Reenvía a tu propio WhatsApp una respuesta del asistente.
rutasApi.post('/ia/whatsapp', async (req, res) => {
  const mensaje = texto(req.body.texto, 'el texto', 4000);
  const usuario = await Usuario.findById(req.usuario.id);
  if (!usuario.whatsapp) throw new ErrorHttp(400, 'Añade tu número de WhatsApp en «Mi cuenta».');
  if (!whatsappConectado()) throw new ErrorHttp(503, 'El bot de WhatsApp no está conectado ahora mismo.');
  await enviarANumero(usuario.whatsapp, { texto: `🤖 *Asistente N.F.T.A*\n\n${mensaje}` });
  res.status(204).end();
});
