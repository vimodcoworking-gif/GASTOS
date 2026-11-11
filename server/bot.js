import { PassThrough } from 'node:stream';
import { config } from './config.js';
import { Libro, Movimiento } from './models.js';
import { generarInforme, formateador } from './informe.js';
import { preguntar } from './ia.js';
import { convertir } from './cambio.js';
import { detectarMedio, leerMedio, sinMedioEnDescripcion } from './medios.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------- fechas (el servidor va en UTC; «hoy» se decide en la zona horaria configurada) ----------

export const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: config.zona }).format(new Date());
const horaLocal = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: config.zona, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const aFecha = (texto) => new Date(`${texto}T00:00:00Z`);
const aTexto = (fecha) => fecha.toISOString().slice(0, 10);
const diaMes = (fecha) => `${fecha.getUTCDate()} ${MESES[fecha.getUTCMonth()].slice(0, 3)}`;
const fechaLarga = (fecha) => `${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()]} de ${fecha.getUTCFullYear()}`;

function sumarDias(texto, n) {
  const fecha = aFecha(texto);
  fecha.setUTCDate(fecha.getUTCDate() + n);
  return aTexto(fecha);
}

function moverMes(mes, n) {
  const [anio, m] = mes.split('-').map(Number);
  return aTexto(new Date(Date.UTC(anio, m - 1 + n, 1))).slice(0, 7);
}

// Primer y último día de un mes «AAAA-MM».
export function rangoMes(mes) {
  const desde = aFecha(`${mes}-01`);
  const hasta = aFecha(`${moverMes(mes, 1)}-01`);
  hasta.setUTCDate(0);
  return [desde, hasta];
}

const nombreMes = (mes) => `${MESES[Number(mes.slice(5)) - 1]} de ${mes.slice(0, 4)}`;

// «octubre de 2026» si el periodo es un mes completo; si no, «del 1 al 15 de octubre de 2026».
function nombrePeriodo(desde, hasta) {
  const [inicio, fin] = rangoMes(aTexto(desde).slice(0, 7));
  if (desde.getTime() === inicio.getTime() && hasta.getTime() === fin.getTime()) return nombreMes(aTexto(desde).slice(0, 7));
  return `del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`;
}

export function saludoSegunHora() {
  const hora = horaLocal();
  if (hora >= 5 && hora < 12) return 'Buenos días ☀️';
  if (hora >= 12 && hora < 19) return 'Buenas tardes 🌤️';
  return 'Buenas noches 🌙';
}

// ---------- datos ----------

function totales(movimientos) {
  const t = { ingresos: 0, gastos: 0, gastosPendientes: 0, ingresosPendientes: 0 };
  for (const m of movimientos) {
    if (m.tipo === 'gasto') {
      t.gastos += m.monto;
      if (!m.pagado) t.gastosPendientes += m.monto;
    } else {
      t.ingresos += m.monto;
      if (!m.pagado) t.ingresosPendientes += m.monto;
    }
  }
  for (const clave of Object.keys(t)) t[clave] = Math.round(t[clave] * 100) / 100;
  t.balance = Math.round((t.ingresos - t.gastos) * 100) / 100;
  return t;
}

// Libros a los que el usuario tiene acceso, los propios primero.
export async function librosDe(usuario) {
  const libros = await Libro.find({ $or: [{ propietario: usuario._id }, { 'miembros.usuario': usuario._id }] }).sort('createdAt');
  return [...libros.filter((l) => l.propietario.equals(usuario._id)), ...libros.filter((l) => !l.propietario.equals(usuario._id))];
}

export const libroActivo = (usuario, libros) => libros.find((l) => l._id.equals(usuario.libroBot)) ?? libros[0];

export function puedeEscribir(usuario, libro) {
  if (libro.propietario.equals(usuario._id)) return true;
  return libro.miembros.some((m) => m.usuario.equals(usuario._id) && m.rol === 'editor');
}

// Todo lo que el bot (o la IA) necesita saber de un libro para responder.
export async function datosDe(libro) {
  const hoy = hoyLocal();
  const mes = hoy.slice(0, 7);
  const proximo = moverMes(mes, 1);
  const anio = Number(mes.slice(0, 4));
  const entre = ([desde, hasta]) => ({ $gte: desde, $lte: hasta });

  const [delMes, delProximo, pendientes, delAnio] = await Promise.all([
    Movimiento.find({ libro: libro._id, fecha: entre(rangoMes(mes)) }).sort('fecha').lean(),
    Movimiento.find({ libro: libro._id, fecha: entre(rangoMes(proximo)) }).sort('fecha').lean(),
    Movimiento.find({ libro: libro._id, pagado: false, fecha: { $lte: aFecha(sumarDias(hoy, 30)) } }).sort('fecha').limit(60).lean(),
    Movimiento.find({ libro: libro._id, fecha: { $gte: new Date(Date.UTC(anio, 0, 1)), $lt: new Date(Date.UTC(anio + 1, 0, 1)) } })
      .select('tipo monto pagado')
      .lean(),
  ]);

  return { hoy, mes, proximo, anio, delMes, delProximo, pendientes, totalMes: totales(delMes), totalProximo: totales(delProximo), totalAnio: totales(delAnio) };
}

// ---------- textos (formato de WhatsApp: *negrita*) ----------

function lineaMovimiento(m, dinero, hoy) {
  const vencido = !m.pagado && aTexto(m.fecha) < hoy;
  return `• ${diaMes(m.fecha)} — ${m.descripcion}: ${m.tipo === 'gasto' ? '-' : '+'}${dinero(m.monto)}${m.moneda ? ` (${m.moneda} ${m.montoOriginal.toFixed(2)})` : ''}${vencido ? ' ⚠️ vencido' : ''}`;
}

function textoTotales(titulo, libro, t, dinero) {
  return [
    titulo,
    `Libro: ${libro.nombre}`,
    '',
    `Ingresos: *${dinero(t.ingresos)}*${t.ingresosPendientes ? ` (${dinero(t.ingresosPendientes)} por recibir)` : ''}`,
    `Gastos: *${dinero(t.gastos)}*`,
    `Balance: *${dinero(t.balance)}*`,
    `Falta por pagar: *${dinero(t.gastosPendientes)}*`,
  ].join('\n');
}

const textoResumen = (libro, d, dinero) => textoTotales(`📊 *Estado de cuenta · ${nombreMes(d.mes)}*`, libro, d.totalMes, dinero);
const textoAnio = (libro, d, dinero) => textoTotales(`📅 *Año ${d.anio}*`, libro, d.totalAnio, dinero);

function textoDeudas(libro, d, dinero) {
  const deudas = d.pendientes.filter((m) => m.tipo === 'gasto');
  const cobros = d.pendientes.filter((m) => m.tipo === 'ingreso');
  if (deudas.length === 0 && cobros.length === 0) return `✅ *${libro.nombre}*: no tienes pagos ni cobros pendientes en los próximos 30 días.`;

  const suma = (lista) => lista.reduce((total, m) => total + m.monto, 0);
  const vencidas = deudas.filter((m) => aTexto(m.fecha) < d.hoy);
  const lineas = [`💳 *Pagos pendientes · ${libro.nombre}*`, 'Vencidos y próximos 30 días', ''];
  if (deudas.length) {
    lineas.push(...deudas.slice(0, 25).map((m) => lineaMovimiento(m, dinero, d.hoy)));
    if (deudas.length > 25) lineas.push(`… y ${deudas.length - 25} más`);
    lineas.push('', `Total por pagar: *${dinero(suma(deudas))}*`);
    if (vencidas.length) lineas.push(`De eso, ya vencido: *${dinero(suma(vencidas))}* (${vencidas.length})`);
  } else {
    lineas.push('No tienes pagos pendientes. ✅');
  }
  if (cobros.length) {
    lineas.push('', '*Por cobrar*', ...cobros.slice(0, 10).map((m) => lineaMovimiento(m, dinero, d.hoy)), `Total por cobrar: *${dinero(suma(cobros))}*`);
  }
  return lineas.join('\n');
}

function textoProximo(libro, d, dinero) {
  const gastos = d.delProximo.filter((m) => m.tipo === 'gasto');
  return [
    textoTotales(`🗓️ *Previsión · ${nombreMes(d.proximo)}*`, libro, d.totalProximo, dinero),
    ...(gastos.length ? ['', '*Pagos programados*', ...gastos.slice(0, 20).map((m) => lineaMovimiento(m, dinero, d.hoy))] : []),
  ].join('\n');
}

const AYUDA_REGISTRAR = [
  '✍️ *Registrar un movimiento*',
  'Escribe el tipo, el monto y una descripción:',
  '• *gasto 25.50 almuerzo*',
  '• *ingreso 1200 salario*',
  '',
  'Opcional: una fecha (*ayer*, *mañana* o *15/10*), la categoría con # (*#comida*) y la palabra *pendiente* si aún no está pagado.',
  'Ejemplo: *gasto 110 internet 28/10 #servicios pendiente*',
  '',
  'Varios a la vez: uno por línea (*gasté 30 en pasajes* ↵ *gasté 60 en desayuno*).',
  'También puedes mandar una *foto* de la boleta o del Yape, un *PDF* o un *audio*.',
  '',
  'Si te equivocas, escribe *deshacer*.',
].join('\n');

// Saludo con menú numerado; durante unos minutos se puede contestar solo con el número.
const OPCIONES_MENU = ['resumen', 'deudas', 'proximo', 'anio', 'pdf', 'registrar', 'libros'];
const menuReciente = new Map();
const MINUTOS_MENU = 15;

export function textoMenu(usuario, libro, conIa) {
  menuReciente.set(usuario.id, Date.now());
  return [
    `¡Hola, ${usuario.nombre}! ${saludoSegunHora()}`,
    'Soy tu asistente de *N.F.T.A Gastos*. ¿Qué quieres hacer hoy?',
    '',
    '1️⃣ Ver el *resumen* del mes',
    '2️⃣ Ver mis *deudas* y pagos pendientes',
    '3️⃣ Ver la previsión del *próximo* mes',
    '4️⃣ Ver los totales del *año*',
    '5️⃣ Recibir el informe en *PDF*',
    '6️⃣ *Registrar* un gasto o un ingreso',
    '7️⃣ Cambiar de *libro*',
    '',
    '📷 También puedes mandarme una *foto* de la boleta o del Yape, un *PDF* o un *audio*.',
    '✏️ Para *corregir o anular* algo, responde (desliza) al mensaje donde te lo confirmé.',
    '',
    `Respóndeme con el número o con la palabra. Libro actual: *${libro.nombre}*.`,
    ...(conIa ? ['', 'También puedes escribirme con tus propias palabras empezando por *ia*, por ejemplo: «ia gasté 30 soles en taxi ayer» o «ia mándame el PDF de septiembre».'] : []),
  ].join('\n');
}

// ---------- informes ----------

function pdfBuffer(libro, desde, hasta, movimientos) {
  const trozos = [];
  const flujo = new PassThrough();
  flujo.on('data', (trozo) => trozos.push(trozo));
  const listo = new Promise((resolve, reject) => flujo.on('end', resolve).on('error', reject));
  generarInforme(flujo, { libro, desde, hasta, movimientos });
  return listo.then(() => Buffer.concat(trozos));
}

/**
 * Estado de cuenta de un periodo cualquiera: texto con los totales y el PDF con el detalle.
 * Lo usan el bot, la IA y el envío desde «Compartir».
 */
export async function informePeriodo(libro, desde, hasta) {
  const movimientos = await Movimiento.find({ libro: libro._id, fecha: { $gte: desde, $lte: hasta } }).sort({ fecha: 1, createdAt: 1 }).limit(10000).lean();
  const periodo = nombrePeriodo(desde, hasta);
  const dinero = formateador(libro.moneda);
  return {
    periodo,
    texto: textoTotales(`📊 *Estado de cuenta · ${periodo}*`, libro, totales(movimientos), dinero),
    pdf: { nombre: `Gastos ${libro.nombre} ${periodo}.pdf`.replace(/[\\/:*?"<>|]/g, ''), buffer: await pdfBuffer(libro, desde, hasta, movimientos) },
  };
}

// ---------- registrar movimientos ----------

// Último movimiento creado por el bot para cada usuario, por si pide deshacerlo.
const ultimoRegistrado = new Map();

/**
 * Crea un movimiento a petición del usuario (por comando o a través de la IA) y devuelve la confirmación.
 * Valida todo aquí: lo que llega puede venir de un modelo de lenguaje.
 */
export async function registrarMovimiento(usuario, libro, datos, extra = {}) {
  if (!puedeEscribir(usuario, libro)) return `🔒 En el libro *${libro.nombre}* solo tienes permiso de lectura; no puedo registrar nada ahí.`;

  const hoy = hoyLocal();
  const tipo = datos.tipo === 'ingreso' ? 'ingreso' : datos.tipo === 'gasto' ? 'gasto' : null;
  const monto = Math.round(Number(datos.monto) * 100) / 100;
  const fechaTexto = typeof datos.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? datos.fecha : hoy;
  const fecha = aFecha(fechaTexto);
  if (!tipo) return 'No me quedó claro si es un gasto o un ingreso.';
  if (!Number.isFinite(monto) || monto <= 0 || monto > 1e9) return 'Necesito un monto válido, mayor que cero.';
  if (Number.isNaN(fecha.getTime()) || Math.abs(fecha - aFecha(hoy)) > 5 * 366 * 86400000) return 'La fecha no es válida.';

  const limpiar = (valor, max, porDefecto) => (typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, max) : porDefecto);
  // Sin indicación expresa: lo de hoy o antes se da por pagado y lo futuro queda pendiente.
  const pagado = typeof datos.pagado === 'boolean' ? datos.pagado : fechaTexto <= hoy;
  // Medio de pago: el indicado (IA, formulario) o el que se deduzca de las pistas (aviso, correo, mensaje) y de la descripción.
  const indicado = leerMedio(datos.medio, datos.entidad);
  const deducido = detectarMedio(...(extra.pistas ?? []), datos.pistas, datos.descripcion);
  const medio = indicado.medio ?? deducido.medio;
  const entidad = indicado.entidad ?? deducido.entidad;
  if (typeof datos.descripcion === 'string') datos.descripcion = sinMedioEnDescripcion(datos.descripcion) || datos.descripcion;

  const mov = await Movimiento.create({
    libro: libro._id,
    tipo,
    descripcion: limpiar(datos.descripcion, 120, tipo === 'gasto' ? 'Gasto por WhatsApp' : 'Ingreso por WhatsApp'),
    categoria: limpiar(datos.categoria, 40, 'General'),
    monto,
    fecha,
    pagado,
    fechaPago: pagado ? new Date() : null,
    creadoPor: usuario._id,
    ...(medio && { medio }),
    ...(entidad && { entidad }),
    ...(extra.correoId && { correoId: extra.correoId }),
    // Cobrado en otra moneda: «monto» ya viene convertido a la del libro.
    ...(/^[A-Z]{3}$/.test(datos.moneda ?? '') && datos.moneda !== libro.moneda && datos.montoOriginal > 0
      && { moneda: datos.moneda, montoOriginal: Math.round(datos.montoOriginal * 100) / 100 }),
  });
  ultimoRegistrado.set(usuario.id, { id: mov._id, cuando: Date.now() });

  const dinero = formateador(libro.moneda);
  const estado = tipo === 'gasto' ? (pagado ? 'pagado' : 'pendiente de pago') : pagado ? 'recibido' : 'por recibir';
  return [
    `✅ *${tipo === 'gasto' ? 'Gasto' : 'Ingreso'} registrado* en ${libro.nombre}`,
    mov.moneda
      ? `${mov.descripcion}: *${mov.moneda} ${mov.montoOriginal.toFixed(2)}* (≈ ${dinero(monto)})`
      : `${mov.descripcion}: *${dinero(monto)}*`,
    `${fechaLarga(fecha)} · ${mov.categoria}${textoMedio(mov) ? ` · ${textoMedio(mov)}` : ""} · ${estado}`,
    'Para corregirlo, responde a este mensaje: «era ingreso», «son 30», «fue ayer» o «anúlalo».',
  ].join('\n');
}

export async function deshacerUltimo(usuario) {
  const ultimo = ultimoRegistrado.get(usuario.id);
  if (ultimo?.ids && Date.now() - ultimo.cuando <= 24 * 3600 * 1000) {
    const { deletedCount } = await Movimiento.deleteMany({ _id: { $in: ultimo.ids }, creadoPor: usuario._id });
    ultimoRegistrado.delete(usuario.id);
    return deletedCount ? `↩️ Borrados los ${deletedCount} movimientos que acababa de registrar.` : 'Esos movimientos ya no existen.';
  }
  if (!ultimo || Date.now() - ultimo.cuando > 24 * 3600 * 1000) return 'No tengo ningún registro reciente tuyo que deshacer. Para borrar otros movimientos usa la app.';
  const mov = await Movimiento.findOneAndDelete({ _id: ultimo.id, creadoPor: usuario._id });
  ultimoRegistrado.delete(usuario.id);
  return mov ? `↩️ Borrado: ${mov.descripcion} (${mov.monto}).` : 'Ese movimiento ya no existe.';
}

// ---------- corrección única de registros unidos ----------

/**
 * Antes, un mensaje con varias líneas («gasté 30 en pasajes ↵ gasté 100 en corte…») se guardaba como un
 * solo gasto con todo el texto en la descripción. Se separan: el primero se queda con su descripción
 * y los demás se crean aparte, salvo que ese día ya exista uno parecido (p. ej. registrado otra vez después).
 */
export async function separarRegistrosUnidos() {
  const unidos = await Movimiento.find({ correoId: { $exists: false }, descripcion: /\s(gast[eé]|pagu[eé]|ingreso|cobr[eé]|recib[ií])\s+(s\/\.?\s?)?\d/i }).limit(500);
  let separados = 0;
  for (const mov of unidos) {
    // «Pasajes Gasté 100 en corte de cabello Gasté 60 en desayuno» → «Pasajes», «Gasté 100 en corte…», «Gasté 60 en…»
    const trozos = mov.descripcion.split(/\s(?=(?:gast[eé]|pagu[eé]|ingreso|cobr[eé]|recib[ií])\s+(?:s\/\.?\s?)?\d)/i);
    const extras = trozos.slice(1).map((t) => leerRegistro(t, aTexto(mov.fecha))).filter(Boolean);
    if (!extras.length || !trozos[0].trim()) continue;
    const dia = mov.fecha.getTime();
    for (const extra of extras) {
      const palabra = sinAcentos(extra.descripcion ?? '').split(/\s+/)[0];
      // Ya hay uno del mismo concepto ese día (p. ej. «Desayuno» registrado otra vez después): no se crea otro.
      const parecidos = await Movimiento.find({ libro: mov.libro, _id: { $ne: mov._id }, tipo: extra.tipo, fecha: { $gte: new Date(dia - 86400000), $lte: new Date(dia + 86400000) } }).select('descripcion').lean();
      if (palabra.length > 2 && parecidos.some((p) => sinAcentos(p.descripcion).includes(palabra))) continue;
      await Movimiento.create({
        libro: mov.libro,
        tipo: extra.tipo,
        descripcion: extra.descripcion ?? (extra.tipo === 'gasto' ? 'Gasto por WhatsApp' : 'Ingreso por WhatsApp'),
        categoria: extra.categoria ?? mov.categoria,
        monto: extra.monto,
        fecha: mov.fecha,
        pagado: true,
        fechaPago: mov.createdAt ?? new Date(),
        creadoPor: mov.creadoPor,
      });
    }
    mov.descripcion = trozos[0].trim().slice(0, 120);
    await mov.save();
    separados += 1;
  }
  return separados;
}

// ---------- corregir y anular movimientos ya registrados ----------

/** Un movimiento que la persona puede cambiar (está en un libro donde puede escribir), o null. */
async function movimientoEditable(usuario, id) {
  const mov = await Movimiento.findById(id).catch(() => null);
  if (!mov) return null;
  const libro = await Libro.findById(mov.libro);
  return libro && puedeEscribir(usuario, libro) ? { mov, libro } : null;
}

const NOMBRE_MEDIO = { yape: 'Yape', plin: 'Plin', tarjeta: 'Tarjeta', transferencia: 'Transferencia', efectivo: 'Efectivo', otro: 'Otro medio' };
const textoMedio = (mov) => [NOMBRE_MEDIO[mov.medio], mov.entidad].filter(Boolean).join(' ');

const describir = (mov, libro) => {
  const dinero = formateador(libro.moneda);
  return `${mov.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} · ${mov.descripcion}: *${mov.moneda ? `${mov.moneda} ${mov.montoOriginal.toFixed(2)} (≈ ${dinero(mov.monto)})` : dinero(mov.monto)}* · ${fechaLarga(mov.fecha)} · ${mov.categoria}${textoMedio(mov) ? ` · ${textoMedio(mov)}` : ''} · ${mov.pagado ? (mov.tipo === 'gasto' ? 'pagado' : 'recibido') : 'pendiente'}`;
};

/**
 * Cambia un movimiento ya registrado. «cambios» puede traer tipo, monto, descripcion, categoria,
 * fecha (AAAA-MM-DD) y pagado. Devuelve el texto de confirmación.
 */
export async function editarMovimiento(usuario, id, cambios = {}) {
  const editable = await movimientoEditable(usuario, id);
  if (!editable) return '⚠️ No encontré ese movimiento o no tienes permiso para cambiarlo.';
  const { mov, libro } = editable;
  const hecho = [];
  if (cambios.tipo === 'gasto' || cambios.tipo === 'ingreso') {
    if (mov.tipo !== cambios.tipo) hecho.push(`ahora es ${cambios.tipo}`);
    mov.tipo = cambios.tipo;
  }
  if (cambios.monto !== undefined && cambios.monto !== null) {
    const monto = Math.round(Number(cambios.monto) * 100) / 100;
    if (!Number.isFinite(monto) || monto <= 0 || monto > 1e9) return '⚠️ Ese monto no es válido.';
    if (mov.moneda && mov.moneda !== libro.moneda) {
      // Cobrado en otra moneda: el monto dicho es en esa moneda y se vuelve a convertir.
      const equivalente = await convertir(monto, mov.moneda, libro.moneda).catch(() => null);
      if (equivalente === null) return `⚠️ No pude convertir ${mov.moneda} a ${libro.moneda} ahora mismo. Inténtalo más tarde.`;
      mov.montoOriginal = monto;
      mov.monto = Math.max(equivalente, 0.01);
    } else {
      mov.monto = monto;
    }
    hecho.push('monto');
  }
  if (typeof cambios.descripcion === 'string' && cambios.descripcion.trim()) {
    mov.descripcion = cambios.descripcion.trim().slice(0, 120);
    hecho.push('descripción');
  }
  if (typeof cambios.categoria === 'string' && cambios.categoria.trim()) {
    mov.categoria = cambios.categoria.trim().slice(0, 40);
    hecho.push('categoría');
  }
  if (typeof cambios.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cambios.fecha) && !Number.isNaN(aFecha(cambios.fecha).getTime())) {
    mov.fecha = aFecha(cambios.fecha);
    hecho.push('fecha');
  }
  if (cambios.medio !== undefined || cambios.entidad !== undefined) {
    const { medio, entidad } = leerMedio(cambios.medio, cambios.entidad);
    if (medio) mov.medio = medio;
    if (entidad) mov.entidad = entidad;
    if (medio || entidad) hecho.push('medio de pago');
  }
  if (typeof cambios.pagado === 'boolean') {
    mov.pagado = cambios.pagado;
    mov.fechaPago = cambios.pagado ? (mov.fechaPago ?? new Date()) : null;
    hecho.push(cambios.pagado ? 'marcado como pagado' : 'marcado como pendiente');
  }
  if (!hecho.length) return 'No vi qué querías cambiar. Dime, por ejemplo: «era ingreso», «son 30», «fue ayer», «categoría comida» o «anúlalo».';
  await mov.save();
  return `✏️ *Corregido* en ${libro.nombre}\n${describir(mov, libro)}`;
}

/**
 * Corrección única: pone el medio de pago a los movimientos que no lo tienen, deducido de su descripción
 * y, si vinieron del correo y aún se guarda su registro, del remitente y el asunto.
 */
export async function corregirMediosBilletera() {
  let hechos = 0;
  for (const [medio, patron] of [['yape', /yape/i], ['plin', /\bplin/i]]) {
    const r = await Movimiento.updateMany({ descripcion: patron, medio: { $ne: medio } }, { $set: { medio } });
    hechos += r.modifiedCount;
  }
  return hechos;
}

export async function completarMedios() {
  const { CorreoRevisado } = await import('./models.js');
  let hechos = 0;
  const cursor = Movimiento.find({ medio: { $exists: false } }).select('descripcion correoId creadoPor').lean().cursor();
  for await (const mov of cursor) {
    const correo = mov.correoId && mov.creadoPor
      ? await CorreoRevisado.findById(`${mov.creadoPor}:${mov.correoId}`).select('remitente asunto extracto').lean()
      : null;
    const { medio, entidad } = detectarMedio(correo?.remitente, correo?.asunto, mov.descripcion, correo?.extracto);
    if (!medio && !entidad) continue;
    await Movimiento.updateOne({ _id: mov._id }, { $set: { ...(medio && { medio }), ...(entidad && { entidad }) } });
    hechos += 1;
  }
  return hechos;
}

/** Borra un movimiento ya registrado (en un libro donde la persona puede escribir). */
export async function anularMovimiento(usuario, id) {
  const editable = await movimientoEditable(usuario, id);
  if (!editable) return '⚠️ No encontré ese movimiento (quizá ya estaba anulado) o no tienes permiso para borrarlo.';
  const { mov, libro } = editable;
  await mov.deleteOne();
  return `🗑️ *Anulado* en ${libro.nombre}\n${describir(mov, libro)}`;
}

/**
 * Correcciones cortas, sin IA, al responder a un mensaje del bot: «anúlalo», «era gasto», «son 30»,
 * «fue ayer», «pendiente». Devuelve { borrar: true }, { cambios } o null si no es una de ellas.
 */
export function leerCorreccion(texto, hoy) {
  // Sin signos, pero conservando el punto o la coma decimal («45.50»).
  const t = sinAcentos(texto).replace(/[!¡¿?]/g, ' ').replace(/[.,](?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(anula(lo|la|los|las)?|anular|borra(lo|la|los|las)?|borrar|elimina(lo|la|los|las)?|eliminar|cancela(lo|la)?|cancelar|quita(lo|la)?|deshacer|no va|no lo registres)( (por favor|porfa))?$/.test(t)) return { borrar: true };
  const tipo = /^(?:(?:es|era|son|fue|eran|fueron|cambia(?:lo|la)? a|ponlo como|registralo como|como|no es \w+ es)\s+)?(?:un |una )?(gasto|ingreso)s?$/.exec(t);
  if (tipo) return { cambios: { tipo: tipo[1] } };
  const monto = /^(?:(?:el )?monto (?:es|era|son|de)|son|eran|era|es|fueron|fue|cambia(?:lo)? a)?\s*(?:s\/?\s?)?(\d+(?:[.,]\d{1,2})?)(?: soles| sol| lucas)?$/.exec(t);
  if (monto) return { cambios: { monto: Number(monto[1].replace(',', '.')) } };
  const dia = /^(?:(?:fue|era|es|cambia(?:lo)? a|ponlo)\s+)?(?:de |el |del )?(hoy|ayer|anteayer|manana)$/.exec(t);
  if (dia) return { cambios: { fecha: { hoy, ayer: sumarDias(hoy, -1), anteayer: sumarDias(hoy, -2), manana: sumarDias(hoy, 1) }[dia[1]] } };
  if (/^(esta |esta )?(pendiente|no (lo )?he pagado|falta pagar|por pagar)$/.test(t)) return { cambios: { pagado: false } };
  // «fue con yape», «con tarjeta bcp», «en efectivo», «fue por plin»
  const medioDicho = /^(?:(?:fue|era|es|lo pague|pague|pagado)\s+)?(?:con|por|en|via)\s+(?:mi\s+|la\s+|el\s+)?(yape|plin|tarjeta|efectivo|transferencia)(?:\s+(?:de\s+|del\s+)?(.{2,30}))?$/.exec(t);
  if (medioDicho) return { cambios: { medio: medioDicho[1], ...(medioDicho[2] && { entidad: medioDicho[2] }) } };
  if (/^(ya )?(esta |lo )?(pagado|pague|cobrado|recibido)$/.test(t)) return { cambios: { pagado: true } };
  return null;
}

// Referencias cortas («r1», «c1») que la IA usa para nombrar movimientos sin ver sus ids reales.
const referenciasIa = new Map();

// ---------- comandos ----------

const sinAcentos = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const COMANDOS = [
  { accion: 'menu', palabras: ['hola', 'holi', 'buenas', 'buenos', 'buen', 'hey', 'menu', 'ayuda', 'help', 'inicio', 'opciones', 'comandos'] },
  { accion: 'resumen', palabras: ['resumen', 'estado', 'saldo', 'balance', 'mes', 'cuenta'] },
  { accion: 'deudas', palabras: ['deudas', 'deuda', 'pendientes', 'pendiente', 'pagos', 'debo', 'vencidos'] },
  { accion: 'proximo', palabras: ['proximo', 'siguiente', 'prevision'] },
  { accion: 'anio', palabras: ['ano', 'anual', 'anio'] },
  { accion: 'pdf', palabras: ['pdf', 'informe', 'reporte'] },
  { accion: 'registrar', palabras: ['registrar', 'anotar', 'agregar'] },
  // Solo la palabra exacta: borrar algo no debe dispararse con un mensaje corriente.
  { accion: 'deshacer', palabras: ['deshacer'] },
  { accion: 'libros', palabras: ['libros', 'libro'] },
];

const TIPOS_REGISTRO = { gasto: 'gasto', gaste: 'gasto', pague: 'gasto', compre: 'gasto', yapee: 'gasto', ingreso: 'ingreso', cobre: 'ingreso', recibi: 'ingreso' };

// «25», «25.50», «25,5», «S/30», «1,200», «1.200,50», «1,200.50» → número; null si no es un monto.
function leerMonto(ficha) {
  const texto = ficha.replace(/^(s\/\.?|\$|€)/i, '');
  let normal;
  if (/^\d{1,3}([.,]\d{3})+([.,]\d{1,2})?$/.test(texto)) {
    // Con separador de miles: el último signo solo es decimal si le siguen una o dos cifras.
    const decimales = /[.,]\d{1,2}$/.exec(texto)?.[0] ?? '';
    normal = texto.slice(0, texto.length - decimales.length).replace(/[.,]/g, '') + decimales.replace(',', '.');
  } else if (/^\d{1,9}([.,]\d{1,2})?$/.test(texto)) {
    normal = texto.replace(',', '.');
  } else {
    return null;
  }
  return Number(normal);
}

// «gasto 25.50 almuerzo ayer #comida pendiente» → datos del movimiento, o null si no es un registro.
function leerRegistro(mensaje, hoy) {
  const frase = mensaje.trim()
    .replace(/[.!¡¿?]+$/, '')
    .replace(/^(?:(?:por\s+favor|porfa)[,\s]+)?(?:(?:registra(?:me)?|anota(?:me)?|apunta(?:me)?|agrega(?:me)?|añade(?:me)?|pon(?:me)?)\s+)?(?:(?:un|una|el|mi)\s+)?/i, '')
    .replace(/\bel\s+d[ií]a\s+de\s+(hoy|ayer|anteayer|ma[nñ]ana)\b/gi, '$1')
    .replace(/\bd[ií]a\s+de\s+(hoy|ayer)\b/gi, '$1');
  const fichas = frase.split(/\s+/);
  const tipo = TIPOS_REGISTRO[sinAcentos(fichas[0] ?? '')];
  if (!tipo) return null;
  // El monto debe venir entre las primeras palabras; si no, es una frase normal que empieza por «gasto».
  const posMonto = fichas.findIndex((f, i) => i >= 1 && i <= 3 && leerMonto(f) !== null);
  if (posMonto === -1) return null;

  const datos = { tipo, monto: leerMonto(fichas[posMonto]) };
  const descripcion = [];
  fichas.forEach((ficha, i) => {
    if (i === 0 || i === posMonto) return;
    // Sin la puntuación final («hoy,» o «taxi.»).
    const llana = sinAcentos(ficha).replace(/[.,;:!?]+$/, '');
    const dia = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(ficha);
    if (llana === 'hoy') datos.fecha = hoy;
    else if (llana === 'ayer') datos.fecha = sumarDias(hoy, -1);
    else if (llana === 'anteayer') datos.fecha = sumarDias(hoy, -2);
    else if (llana === 'manana') datos.fecha = sumarDias(hoy, 1);
    else if (dia) {
      const anio = dia[3] ? (dia[3].length === 2 ? `20${dia[3]}` : dia[3]) : hoy.slice(0, 4);
      datos.fecha = `${anio}-${dia[2].padStart(2, '0')}-${dia[1].padStart(2, '0')}`;
    } else if (llana === 'pendiente') datos.pagado = false;
    else if (llana === 'pagado' || llana === 'recibido') datos.pagado = true;
    else if (ficha.startsWith('#') && ficha.length > 1) datos.categoria = ficha[1].toUpperCase() + ficha.slice(2);
    // Palabras de relleno al principio: «gasté 30 en taxi», «soles».
    else if (!(descripcion.length === 0 && ['en', 'de', 'del', 'por', 'para', 'soles', 'sol', 'dolares', 'lucas', 'el', 'la', 'un', 'una'].includes(llana))) descripcion.push(ficha);
  });
  if (descripcion.length) datos.descripcion = descripcion.join(' ').replace(/^./, (c) => c.toUpperCase());
  datos.pistas = frase;
  return datos;
}

// Solo los mensajes cortos se tratan como comandos; lo demás es conversación (para la IA o para ignorar).
function reconocer(usuario, texto) {
  const palabras = sinAcentos(texto).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(Boolean);
  if (palabras.length === 0 || palabras.length > 3) return null;
  // Un número suelto vale como opción del menú si se mostró hace poco.
  if (palabras.length === 1 && /^[1-7]$/.test(palabras[0]) && Date.now() - (menuReciente.get(usuario.id) ?? 0) < MINUTOS_MENU * 60000) {
    return { accion: OPCIONES_MENU[Number(palabras[0]) - 1], resto: [] };
  }
  const comando = COMANDOS.find((c) => c.palabras.includes(palabras[0]));
  return comando ? { accion: comando.accion, resto: palabras.slice(1) } : null;
}

// Varias líneas, un movimiento por línea: «gasté 30 en pasajes ↵ gasté 100 en corte ↵ y 60 en desayuno».
// Las líneas que empiezan por el monto heredan el tipo de la anterior. Si alguna no se entiende, null.
function leerVarios(mensaje, hoy) {
  const lineas = mensaje.split(/\n+/).map((l) => l.trim().replace(/^[-•*·]\s*/, '')).filter(Boolean);
  if (lineas.length < 2 || lineas.length > 30) return null;
  const registros = [];
  let anterior = null;
  for (const linea of lineas) {
    const texto = linea.replace(/^(y|tambi[eé]n|adem[aá]s|luego)\s+/i, '');
    let registro = leerRegistro(texto, hoy);
    if (!registro && anterior && leerMonto(texto.split(/\s+/)[0]) !== null) registro = leerRegistro(`${anterior} ${texto}`, hoy);
    if (!registro) return null;
    registros.push(registro);
    anterior = registro.tipo;
  }
  return registros;
}

/**
 * Registra varios movimientos de una vez (un mensaje con varias líneas, una boleta, un estado de cuenta).
 * Convierte los cobrados en otra moneda y se salta los que ya estaban anotados (mismo tipo, monto y fecha ±1 día).
 * Devuelve el texto de confirmación; «deshacer» los borra todos juntos.
 */
export async function registrarVarios(usuario, movimientos, { origen = '', libro: fijo = null, repetidos: modoRepetidos = 'dia' } = {}) {
  const libros = await librosDe(usuario);
  // El libro abierto en la app (si se pide desde allí) o el elegido en WhatsApp.
  const elegido = fijo ?? libroActivo(usuario, libros);
  const libro = elegido && puedeEscribir(usuario, elegido) ? elegido : libros.find((l) => puedeEscribir(usuario, l));
  if (!libro) return libros.length ? '🔒 No tienes ningún libro donde puedas registrar movimientos.' : 'Todavía no tienes ningún libro. Entra en la app y crea uno.';
  const dinero = formateador(libro.moneda);
  const hoy = hoyLocal();
  const hechos = [];
  const repetidos = [];
  const fallos = [];
  const ids = [];

  for (const original of movimientos.slice(0, 30)) {
    const tipo = original?.tipo === 'ingreso' ? 'ingreso' : original?.tipo === 'gasto' ? 'gasto' : null;
    const monto = Math.round(Number(original?.monto) * 100) / 100;
    if (!tipo || !Number.isFinite(monto) || monto <= 0 || monto > 1e9) continue;
    const fecha = typeof original.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(original.fecha) ? original.fecha : hoy;
    const datos = { ...original, tipo, monto, fecha };
    const moneda = normalizarMoneda(original.moneda) ?? libro.moneda;
    delete datos.moneda;
    delete datos.montoOriginal;
    if (moneda !== libro.moneda) {
      const equivalente = await convertir(monto, moneda, libro.moneda).catch(() => null);
      if (equivalente === null) {
        fallos.push(`${datos.descripcion ?? 'Movimiento'}: no pude convertir ${moneda} ${monto} a ${libro.moneda}`);
        continue;
      }
      Object.assign(datos, { moneda, montoOriginal: monto, monto: Math.max(equivalente, 0.01) });
    }
    // Mismo movimiento ya anotado (p. ej. la misma boleta enviada dos veces, o ya llegado por correo).
    // Qué cuenta como «ya anotado» según de dónde viene:
    // - «dia» (boletas, fotos, correos): mismo tipo y monto con un día de diferencia como mucho.
    // - «reciente» (notificaciones del teléfono): lo anotado en los últimos 20 minutos.
    // - «manual» (lo que la persona escribe o dicta): solo el doble envío accidental, mismo monto y descripción
    //   en los últimos 3 minutos. Si alguien dice «gasté 30 en taxi», se registra aunque ya haya otro de 30.
    const dia = aFecha(fecha).getTime();
    const igual = await Movimiento.exists({
      libro: libro._id,
      tipo,
      ...(datos.moneda ? { moneda: datos.moneda, montoOriginal: datos.montoOriginal } : { monto: datos.monto }),
      ...(modoRepetidos === 'manual'
        ? { createdAt: { $gte: new Date(Date.now() - 3 * 60_000) }, descripcion: String(datos.descripcion ?? '').trim().slice(0, 120) }
        : modoRepetidos === 'reciente'
          ? { createdAt: { $gte: new Date(Date.now() - 20 * 60_000) } }
          : { fecha: { $gte: new Date(dia - 86400000), $lte: new Date(dia + 86400000) } }),
    });
    if (igual) {
      repetidos.push(`${datos.descripcion ?? tipo}: ${datos.moneda ? `${datos.moneda} ${monto.toFixed(2)}` : dinero(monto)}`);
      continue;
    }
    const confirmacion = await registrarMovimiento(usuario, libro, datos);
    if (!confirmacion.startsWith('✅')) {
      fallos.push(confirmacion);
      continue;
    }
    ids.push(ultimoRegistrado.get(usuario.id)?.id);
    hechos.push({ tipo, linea: confirmacion.split('\n')[1], monto: datos.monto });
  }
  if (ids.length > 1) ultimoRegistrado.set(usuario.id, { ids: ids.filter(Boolean), cuando: Date.now() });

  const gastos = hechos.filter((h) => h.tipo === 'gasto').reduce((t, h) => t + h.monto, 0);
  const ingresos = hechos.filter((h) => h.tipo === 'ingreso').reduce((t, h) => t + h.monto, 0);
  const lineas = [];
  if (hechos.length) {
    const cuantos = hechos.length === 1 ? `1 ${hechos[0].tipo} registrado` : `${hechos.length} movimientos registrados`;
    lineas.push(`✅ *${cuantos}* en ${libro.nombre}${origen ? ` ${origen}` : ''}`, ...hechos.map((h) => `• ${h.tipo === 'ingreso' ? '➕ ' : ''}${h.linea}`));
    if (hechos.length > 1) lineas.push('', [gastos && `Total gastos: *${dinero(gastos)}*`, ingresos && `Total ingresos: *${dinero(ingresos)}*`].filter(Boolean).join(' · '));
  }
  if (repetidos.length) {
    lineas.push('', modoRepetidos === 'manual' ? '↪️ Me los acabas de mandar, no los repetí:' : '↪️ Ya estaban anotados (mismo monto y fecha), no los repetí:', ...repetidos.map((r) => `• ${r}`));
    if (modoRepetidos !== 'manual') lineas.push('Si sí eran otros, escríbemelos (p. ej. *gasté 30 en taxi*) y los registro.');
  }
  if (fallos.length) lineas.push('', '⚠️ No pude registrar:', ...fallos.map((f) => `• ${f}`));
  if (!lineas.length) return 'No encontré ningún monto válido para registrar.';
  if (hechos.length) lineas.push('', hechos.length > 1 ? 'Si algo no es correcto, responde a este mensaje (p. ej. «el de 30 era ingreso» o «anula el segundo») o escribe *deshacer* para borrarlos todos.' : 'Para corregirlo, responde a este mensaje: «era gasto», «son 30», «fue ayer» o «anúlalo».');
  return lineas.join('\n').trim();
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

/**
 * Responde a un mensaje de un usuario registrado.
 * Devuelve { texto, pdf? } si era un comando, o null si no lo era.
 */
export async function responder(usuario, mensaje, { conIa = false } = {}) {
  const hoy = hoyLocal();
  const varios = leerVarios(mensaje, hoy);
  if (varios) return { texto: await registrarVarios(usuario, varios, { repetidos: 'manual' }) };
  // Un solo movimiento en varias líneas no se toma como registro: es otra cosa (p. ej. para la IA).
  const registro = mensaje.trim().includes('\n') ? null : leerRegistro(mensaje, hoy);
  const comando = registro ? { accion: 'crear' } : reconocer(usuario, mensaje);
  if (!comando) return null;

  const libros = await librosDe(usuario);
  if (libros.length === 0) return { texto: 'Todavía no tienes ningún libro. Entra en la app y crea uno.' };
  let libro = libroActivo(usuario, libros);

  if (comando.accion === 'crear') return { texto: await registrarMovimiento(usuario, libro, registro) };
  if (comando.accion === 'registrar') return { texto: AYUDA_REGISTRAR };
  if (comando.accion === 'deshacer') return { texto: await deshacerUltimo(usuario) };
  if (comando.accion === 'menu') return { texto: textoMenu(usuario, libro, conIa) };

  if (comando.accion === 'libros') {
    const elegido = Number(comando.resto[0]);
    if (Number.isInteger(elegido) && elegido >= 1 && elegido <= libros.length) {
      libro = libros[elegido - 1];
      usuario.libroBot = libro._id;
      await usuario.save();
      return { texto: `✅ Ahora te respondo sobre el libro *${libro.nombre}*.` };
    }
    return {
      texto: ['📚 *Tus libros*', ...libros.map((l, i) => `${i + 1}. ${l.nombre} (${l.moneda})${l._id.equals(libro._id) ? ' ← actual' : ''}`), '', 'Para cambiar escribe, por ejemplo: *libro 2*'].join('\n'),
    };
  }

  if (comando.accion === 'pdf') {
    const desplazamiento = { pasado: -1, anterior: -1, siguiente: 1, proximo: 1 }[comando.resto[0]] ?? 0;
    const { texto, pdf } = await informePeriodo(libro, ...rangoMes(moverMes(hoy.slice(0, 7), desplazamiento)));
    return { texto, pdf };
  }

  const dinero = formateador(libro.moneda);
  const datos = await datosDe(libro);
  const textos = { resumen: textoResumen, deudas: textoDeudas, proximo: textoProximo, anio: textoAnio };
  return { texto: textos[comando.accion](libro, datos, dinero) };
}

// Estado de cuenta que el administrador envía por iniciativa propia: resumen del mes más los pagos pendientes.
export async function estadoDeCuenta(usuario) {
  const libros = await librosDe(usuario);
  if (libros.length === 0) return null;
  const libro = libroActivo(usuario, libros);
  const dinero = formateador(libro.moneda);
  const datos = await datosDe(libro);
  return [textoResumen(libro, datos, dinero), '', textoDeudas(libro, datos, dinero), '', 'Escribe *menu* para ver más opciones.'].join('\n');
}

// ---------- IA: contexto y ejecución de lo que pide ----------

// Libro sobre el que trabaja la IA: el elegido en la app (si se indica y tiene acceso) o el activo del bot.
async function libroParaIa(usuario, libroId) {
  const libros = await librosDe(usuario);
  return libros.find((l) => libroId && String(l._id) === String(libroId)) ?? libroActivo(usuario, libros);
}

const corto = (m) => ({ fecha: aTexto(m.fecha), tipo: m.tipo, descripcion: m.descripcion, categoria: m.categoria, monto: m.monto, ...(m.moneda && { cobradoEn: `${m.moneda} ${m.montoOriginal}` }), pagado: m.pagado, ...(() => { const d = m.medio || m.entidad ? m : detectarMedio(m.descripcion); return { ...(d.medio && { medio: d.medio }), ...(d.entidad && { entidad: d.entidad }) }; })(), ...(m.correoId && { desdeCorreo: true }) });
const redondear = (n) => Math.round(n * 100) / 100;

// Totales mes a mes (24 meses atrás y 12 adelante, donde hay pagos programados): ingresos, gastos,
// gastos por categoría y cuánto llegó por correo.
async function resumenHistorico(libro, hoy) {
  const desde = aFecha(`${moverMes(hoy.slice(0, 7), -23)}-01`);
  const [grupos, primero] = await Promise.all([
    Movimiento.aggregate([
      { $match: { libro: libro._id, fecha: { $gte: desde, $lt: aFecha(`${moverMes(hoy.slice(0, 7), 13)}-01`) } } },
      {
        $group: {
          _id: {
            mes: { $dateToString: { format: '%Y-%m', date: '$fecha' } },
            tipo: '$tipo',
            categoria: '$categoria',
            correo: { $toBool: { $ifNull: ['$correoId', false] } },
          },
          total: { $sum: '$monto' },
          cantidad: { $sum: 1 },
        },
      },
    ]),
    Movimiento.findOne({ libro: libro._id }).sort('fecha').select('fecha').lean(),
  ]);
  const meses = new Map();
  for (const { _id: g, total, cantidad } of grupos) {
    const m = meses.get(g.mes) ?? { mes: g.mes, ingresos: 0, gastos: 0, movimientos: 0, gastosDesdeCorreo: 0, gastosPorCategoria: {} };
    m.movimientos += cantidad;
    if (g.tipo === 'ingreso') m.ingresos += total;
    else {
      m.gastos += total;
      m.gastosPorCategoria[g.categoria] = (m.gastosPorCategoria[g.categoria] ?? 0) + total;
      if (g.correo) m.gastosDesdeCorreo += total;
    }
    meses.set(g.mes, m);
  }
  return {
    primerMovimiento: primero ? aTexto(primero.fecha) : null,
    meses: [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => ({
      ...m,
      ingresos: redondear(m.ingresos),
      gastos: redondear(m.gastos),
      balance: redondear(m.ingresos - m.gastos),
      gastosDesdeCorreo: redondear(m.gastosDesdeCorreo),
      gastosPorCategoria: Object.fromEntries(Object.entries(m.gastosPorCategoria).map(([c, t]) => [c, redondear(t)]).sort((a, b) => b[1] - a[1])),
    })),
  };
}

// Contexto compacto para la IA: totales y movimientos del libro activo, más los gastos llegados por correo.
// «canal» es "whatsapp" o "web"; desde la web la IA puede pedir que su respuesta se envíe por WhatsApp.
export async function contextoParaIa(usuario, { libroId, canal = 'whatsapp', puedeRecibirWhatsapp = false, citados = [] } = {}) {
  const libro = await libroParaIa(usuario, libroId);
  if (!libro) return null;
  // Para corregir o anular: los últimos registrados en este libro y los del mensaje al que responde.
  const [ultimos, deLaCita] = await Promise.all([
    Movimiento.find({ libro: libro._id }).sort('-createdAt').limit(15).lean(),
    citados.length ? Movimiento.find({ _id: { $in: citados } }).lean() : [],
  ]);
  const refs = {};
  const conRef = (prefijo) => (m, i) => {
    refs[`${prefijo}${i + 1}`] = String(m._id);
    return { ref: `${prefijo}${i + 1}`, ...corto(m), registrado: m.createdAt?.toISOString().slice(0, 16).replace('T', ' ') };
  };
  const ultimosRegistrados = ultimos.map(conRef('r'));
  const movimientosCitados = deLaCita.map(conRef('c'));
  referenciasIa.set(usuario.id, refs);
  const d = await datosDe(libro);
  // Todos los Gmail vinculados: el principal y los añadidos.
  const buzones = [usuario.gmail, ...(usuario.gmailExtra ?? [])].filter((g) => g?.token);
  const [delCorreo, historico, recientes] = await Promise.all([
    buzones.length
      ? Movimiento.find({ libro: libro._id, correoId: { $exists: true } }).sort('-fecha').limit(150).lean()
      : [],
    resumenHistorico(libro, d.hoy),
    Movimiento.find({ libro: libro._id, fecha: { $gte: aFecha(sumarDias(d.hoy, -6)), $lte: aFecha(d.hoy) } }).sort({ fecha: 1, createdAt: 1 }).limit(300).lean(),
  ]);
  // Días recientes ya separados y sumados, para responder «¿qué gasté hoy?» sin que la IA tenga que filtrar.
  const delDia = (fecha) => {
    const lista = recientes.filter((m) => aTexto(m.fecha) === fecha);
    return { fecha, totales: totales(lista), movimientos: lista.map(corto) };
  };
  const ayer = sumarDias(d.hoy, -1);
  return {
    canal,
    ...(canal === 'web' && { puedeRecibirWhatsapp }),
    libro: libro.nombre,
    moneda: libro.moneda,
    puedeRegistrar: puedeEscribir(usuario, libro),
    hoy: d.hoy,
    saludoPorLaHora: saludoSegunHora(),
    correo: buzones.length
      ? {
          vinculado: true,
          cuentas: buzones.map((g) => ({
            cuenta: g.email,
            activo: g.activo,
            desde: aTexto(g.desde ?? new Date()),
            ...(g.error && { problema: g.error }),
            ...(g.escaneo?.estado && {
              ultimoEscaneo: { estado: g.escaneo.estado, desde: aTexto(g.escaneo.desde), hasta: aTexto(g.escaneo.hasta), revisados: g.escaneo.revisados, registrados: g.escaneo.registrados, quedanMas: g.escaneo.quedan },
            }),
          })),
          gastosRegistrados: delCorreo.map(corto),
        }
      : { vinculado: false },
    diaDeHoy: delDia(d.hoy),
    diaDeAyer: delDia(ayer),
    ultimos7Dias: { desde: sumarDias(d.hoy, -6), hasta: d.hoy, totales: totales(recientes), movimientos: recientes.map(corto) },
    mesActual: { mes: d.mes, totales: d.totalMes, movimientos: d.delMes.slice(0, 200).map(corto) },
    mesSiguiente: { mes: d.proximo, totales: d.totalProximo, movimientos: d.delProximo.slice(0, 100).map(corto) },
    pendientesVencidosYProximos30Dias: d.pendientes.map(corto),
    totalesDelAnio: { anio: d.anio, ...d.totalAnio },
    resumenMensual: historico,
    ultimosRegistrados,
    ...(movimientosCitados.length && { movimientosCitados }),
  };
}

const fechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(aFecha(f).getTime());

/**
 * Conversa con la IA sobre las finanzas del usuario, por WhatsApp o desde la app.
 * Si la IA necesita el detalle de un periodo que no tiene (acción «consultar»), se le dan esos
 * movimientos y se le vuelve a preguntar una vez. Devuelve { texto, acciones } o null.
 */
export async function conversar(usuario, pregunta, { libroId, canal = 'whatsapp', puedeRecibirWhatsapp = false, citados = [] } = {}) {
  const contexto = await contextoParaIa(usuario, { libroId, canal, puedeRecibirWhatsapp, citados });
  if (!contexto) return null;
  const respuesta = await preguntar(usuario, contexto, pregunta);
  const consulta = respuesta?.acciones.find((a) => a?.tipo === 'consultar');
  if (!consulta) return respuesta;

  const libro = await libroParaIa(usuario, libroId);
  const [mesDesde, mesHasta] = rangoMes(contexto.hoy.slice(0, 7));
  let desde = fechaValida(consulta.desde) ? aFecha(consulta.desde) : mesDesde;
  let hasta = fechaValida(consulta.hasta) ? aFecha(consulta.hasta) : mesHasta;
  if (hasta < desde) [desde, hasta] = [hasta, desde];
  if (hasta - desde > 3 * 366 * 86400000) desde = new Date(hasta.getTime() - 3 * 366 * 86400000);
  const movimientos = await Movimiento.find({ libro: libro._id, fecha: { $gte: desde, $lte: hasta } }).sort({ fecha: 1, createdAt: 1 }).limit(400).lean();
  contexto.periodoConsultado = {
    desde: aTexto(desde),
    hasta: aTexto(hasta),
    totales: totales(movimientos),
    movimientos: movimientos.map(corto),
    ...(movimientos.length === 400 && { aviso: 'Solo se incluyen los primeros 400 movimientos del periodo.' }),
  };
  const segunda = await preguntar(usuario, contexto, `Ya tienes en «periodoConsultado» los movimientos que pediste. Responde ahora a mi pregunta: ${pregunta}`);
  if (segunda) segunda.acciones = segunda.acciones.filter((a) => a?.tipo !== 'consultar');
  return segunda;
}

/**
 * Ejecuta las acciones que propuso la IA, validándolas una a una.
 * Devuelve los textos de confirmación y los PDF que hay que enviar.
 */
export async function ejecutarAcciones(usuario, acciones, { libroId } = {}) {
  const textos = [];
  const pdfs = [];
  if (!Array.isArray(acciones) || acciones.length === 0) return { textos, pdfs };

  const libro = await libroParaIa(usuario, libroId);
  if (!libro) return { textos, pdfs };

  // Varios gastos en un mismo mensaje («gasté 30 en taxi y 20 en almuerzo»): se registran juntos.
  const registros = acciones.filter((a) => a?.tipo === 'registrar' && a.movimiento && typeof a.movimiento === 'object').map((a) => a.movimiento);
  if (registros.length > 1) textos.push(await registrarVarios(usuario, registros.slice(0, 20), { libro, repetidos: 'manual' }));
  // Como mucho unas pocas acciones por mensaje: un modelo confundido no debe llenar el libro.
  for (const accion of acciones.filter((a) => a?.tipo !== 'registrar' || registros.length <= 1).slice(0, 10)) {
    if (accion?.tipo === 'registrar' && accion.movimiento && typeof accion.movimiento === 'object') {
      textos.push(await registrarMovimiento(usuario, libro, accion.movimiento));
    } else if ((accion?.tipo === 'editar' || accion?.tipo === 'borrar') && typeof accion.ref === 'string') {
      const id = referenciasIa.get(usuario.id)?.[accion.ref];
      if (!id) textos.push('⚠️ No supe qué movimiento corregir. Responde (desliza) al mensaje donde te lo confirmé y dime qué cambiar.');
      else textos.push(accion.tipo === 'borrar' ? await anularMovimiento(usuario, id) : await editarMovimiento(usuario, id, accion.cambios ?? {}));
    } else if (accion?.tipo === 'deshacer') {
      textos.push(await deshacerUltimo(usuario));
    } else if (accion?.tipo === 'pdf' && pdfs.length < 2) {
      const [mesDesde, mesHasta] = rangoMes(hoyLocal().slice(0, 7));
      const desde = fechaValida(accion.desde) ? aFecha(accion.desde) : mesDesde;
      const hasta = fechaValida(accion.hasta) ? aFecha(accion.hasta) : mesHasta;
      if (hasta >= desde && hasta - desde <= 3 * 366 * 86400000) pdfs.push(await informePeriodo(libro, desde, hasta));
    } else if (accion?.tipo === 'escanearCorreo') {
      // Se carga al usarlo: el módulo de Google depende de este.
      const { iniciarEscaneo } = await import('./google.js');
      textos.push(await iniciarEscaneo(usuario, accion.desde, accion.hasta));
    }
  }
  return { textos, pdfs };
}

// ---------- avisos de Yape, Plin y transferencias (notificaciones del teléfono y correos) ----------

const IMPORTE = '(S\\/\\.?|US\\$|\\$)\\s?(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
const AVISOS_DE_PAGO = [
  // «Yape! JUAN PEREZ te envió un pago por S/ 25. El cód. de seguridad es: 427»
  { tipo: 'ingreso', patron: new RegExp(`(?:^|[!:]\\s*|\\.\\s+)([^!:\\n]{2,60}?)\\s+te\\s+(?:envi[oó]|yape[oó]|pline[oó]|pag[oó]|transfiri[oó]|deposit[oó])\\s+(?:un\\s+(?:pago|yape|plin|dinero)\\s+)?(?:de|por)\\s+${IMPORTE}`, 'i'), quien: 1, simbolo: 2, numero: 3 },
  // «¡Te yapearon S/ 25!», «Te plinearon S/ 10 de MARIA»
  { tipo: 'ingreso', patron: new RegExp(`te\\s+(?:yapearon|plinearon|transfirieron|depositaron|pagaron)\\s+${IMPORTE}(?:\\s+(?:de|desde)\\s+([^.!\\n]{2,60}))?`, 'i'), simbolo: 1, numero: 2, quien: 3 },
  // «Recibiste un yape de S/ 25 de JUAN», «Recibiste S/ 10 de MARIA»
  { tipo: 'ingreso', patron: new RegExp(`recibiste\\s+(?:un\\s+(?:yape|plin|pago|dep[oó]sito|abono|transferencia)\\s+(?:de|por)\\s+)?${IMPORTE}(?:\\s+(?:de|desde)\\s+([^.!\\n]{2,60}))?`, 'i'), simbolo: 1, numero: 2, quien: 3 },
  // «Yapeaste S/ 25 a NILSON GON», «¡Yapeaste! S/ 25 Nilson Gon*», «Plineaste S/ 10 a…», «Enviaste S/ 50 a…»
  { tipo: 'gasto', patron: new RegExp(`(?:yapeaste|plineaste|enviaste|transferiste|pagaste)[!¡]?\\s+(?:un\\s+(?:yape|plin|pago)\\s+(?:de|por)\\s+)?${IMPORTE}(?:\\s+(?:(?:a|para)\\s+)?([A-Za-zÁÉÍÓÚÑáéíóúñ][^.!\\n]{1,60}))?`, 'i'), simbolo: 1, numero: 2, quien: 3 },
];

/**
 * Lee un aviso de pago corto (notificación de Yape/Plin, asunto o texto de un correo) sin IA.
 * Devuelve { tipo, monto, moneda, descripcion, categoria } o null si no es un aviso reconocible.
 */
export function leerAvisoDePago(texto, { app = '' } = {}) {
  const limpio = String(texto ?? '').replace(/[​-‍﻿ ]/g, ' ').replace(/[ \t]+/g, ' ');
  for (const aviso of AVISOS_DE_PAGO) {
    const m = aviso.patron.exec(limpio);
    if (!m) continue;
    const numero = m[aviso.numero];
    // «1,234.50» → 1234.50 ; «12,50» → 12.50
    const monto = Number(/^\d+,\d{1,2}$/.test(numero) ? numero.replace(',', '.') : numero.replace(/,/g, ''));
    if (!(monto > 0)) continue;
    const simbolo = m[aviso.simbolo];
    const quien = (m[aviso.quien] ?? '').replace(/^(yape|plin|bcp|interbank|bbva)\s*[!:.-]?\s*/i, '').replace(/\s+/g, ' ').trim();
    const origen = /plin/i.test(`${app} ${limpio}`) ? 'Plin' : /yape/i.test(`${app} ${limpio}`) ? 'Yape' : '';
    return {
      tipo: aviso.tipo,
      monto,
      moneda: simbolo.startsWith('S') ? 'PEN' : 'USD',
      descripcion: [origen, quien].filter(Boolean).join(aviso.tipo === 'ingreso' ? ' de ' : ' a ').slice(0, 60) || (aviso.tipo === 'ingreso' ? 'Pago recibido' : 'Pago enviado'),
      categoria: 'Transferencias',
    };
  }
  return null;
}
