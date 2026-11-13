// Metas de ahorro y categorías de cada libro (con su presupuesto mensual).
import mongoose from 'mongoose';
import { Meta, Movimiento } from './models.js';
import { ErrorHttp, texto } from './errores.js';

const redondear = (n) => Math.round(n * 100) / 100;
const COLOR = /^#[0-9a-f]{6}$/i;

function leerMonto(valor, campo = 'el monto', { negativo = false } = {}) {
  const monto = redondear(Number(valor));
  if (typeof valor === 'boolean' || !Number.isFinite(monto) || monto === 0 || Math.abs(monto) > 1e12 || (!negativo && monto < 0)) {
    throw new ErrorHttp(400, `Revisa ${campo}`);
  }
  return monto;
}

function leerFechaOpcional(valor) {
  if (valor === null || valor === '' || valor === undefined) return null;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new ErrorHttp(400, 'La fecha no es válida');
  return new Date(`${valor}T00:00:00Z`);
}

const fechaIso = (f) => (f ? new Date(f).toISOString().slice(0, 10) : null);

export const metaPublica = (m) => {
  const ahorrado = redondear((m.aportes ?? []).reduce((s, a) => s + a.monto, 0));
  return {
    id: String(m._id),
    nombre: m.nombre,
    objetivo: m.objetivo,
    ahorrado,
    fechaLimite: fechaIso(m.fechaLimite),
    color: m.color ?? null,
    icono: m.icono ?? null,
    completada: ahorrado >= m.objetivo,
    aportes: (m.aportes ?? []).slice(-30).reverse().map((a) => ({ id: String(a._id), monto: a.monto, fecha: fechaIso(a.fecha), nota: a.nota ?? '', conMovimiento: Boolean(a.movimiento) })),
  };
};

async function cargarMeta(req) {
  const meta = mongoose.isValidObjectId(req.params.metaId) ? await Meta.findOne({ _id: req.params.metaId, libro: req.libro._id }) : null;
  if (!meta) throw new ErrorHttp(404, 'Meta no encontrada');
  return meta;
}

/** Añade al router de un libro las rutas de metas de ahorro y de categorías. */
export function montarExtras(libro, { puedeEditar }) {
  // ---------- metas de ahorro ----------
  libro.get('/metas', async (req, res) => {
    const metas = await Meta.find({ libro: req.libro._id }).sort({ createdAt: 1 }).lean();
    res.json({ metas: metas.map(metaPublica) });
  });

  libro.post('/metas', puedeEditar, async (req, res) => {
    if ((await Meta.countDocuments({ libro: req.libro._id })) >= 50) throw new ErrorHttp(400, 'Puedes tener hasta 50 metas por libro');
    const meta = await Meta.create({
      libro: req.libro._id,
      nombre: texto(req.body.nombre, 'el nombre', 60),
      objetivo: leerMonto(req.body.objetivo, 'el objetivo'),
      fechaLimite: leerFechaOpcional(req.body.fechaLimite),
      ...(COLOR.test(req.body.color ?? '') && { color: req.body.color }),
      ...(typeof req.body.icono === 'string' && /^[a-z-]{1,20}$/.test(req.body.icono) && { icono: req.body.icono }),
      ...(Number(req.body.inicial) > 0 && { aportes: [{ monto: leerMonto(req.body.inicial, 'lo ya ahorrado'), nota: 'Lo que ya tenía ahorrado' }] }),
      creadoPor: req.usuario.id,
    });
    res.status(201).json({ meta: metaPublica(meta) });
  });

  libro.patch('/metas/:metaId', puedeEditar, async (req, res) => {
    const meta = await cargarMeta(req);
    if (req.body.nombre !== undefined) meta.nombre = texto(req.body.nombre, 'el nombre', 60);
    if (req.body.objetivo !== undefined) meta.objetivo = leerMonto(req.body.objetivo, 'el objetivo');
    if (req.body.fechaLimite !== undefined) meta.fechaLimite = leerFechaOpcional(req.body.fechaLimite) ?? undefined;
    if (req.body.color !== undefined) meta.color = COLOR.test(req.body.color ?? '') ? req.body.color : undefined;
    if (req.body.icono !== undefined) meta.icono = /^[a-z-]{1,20}$/.test(req.body.icono ?? '') ? req.body.icono : undefined;
    await meta.save();
    res.json({ meta: metaPublica(meta) });
  });

  libro.delete('/metas/:metaId', puedeEditar, async (req, res) => {
    const meta = await cargarMeta(req);
    await meta.deleteOne();
    res.status(204).end();
  });

  // { monto (negativo = retiro), nota?, fecha?, registrar?: true } — «registrar» lo anota también como gasto
  // (categoría Ahorro) para que salga del balance del mes; un retiro registrado entra como ingreso.
  libro.post('/metas/:metaId/aportes', puedeEditar, async (req, res) => {
    const meta = await cargarMeta(req);
    const monto = leerMonto(req.body.monto, 'el monto', { negativo: true });
    const ahorrado = (meta.aportes ?? []).reduce((s, a) => s + a.monto, 0);
    if (monto < 0 && ahorrado + monto < -0.001) throw new ErrorHttp(400, 'No puedes retirar más de lo ahorrado');
    const fecha = leerFechaOpcional(req.body.fecha) ?? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const nota = typeof req.body.nota === 'string' ? req.body.nota.trim().slice(0, 80) : '';
    let movimiento;
    if (req.body.registrar === true) {
      movimiento = await Movimiento.create({
        libro: req.libro._id,
        tipo: monto > 0 ? 'gasto' : 'ingreso',
        descripcion: `${monto > 0 ? 'Ahorro' : 'Retiro de ahorro'}: ${meta.nombre}`.slice(0, 120),
        categoria: 'Ahorro',
        monto: Math.abs(monto),
        fecha,
        pagado: true,
        fechaPago: new Date(),
        creadoPor: req.usuario.id,
      });
    }
    meta.aportes.push({ monto, fecha, nota: nota || undefined, movimiento: movimiento?._id });
    await meta.save();
    res.status(201).json({ meta: metaPublica(meta) });
  });

  libro.delete('/metas/:metaId/aportes/:aporteId', puedeEditar, async (req, res) => {
    const meta = await cargarMeta(req);
    const aporte = meta.aportes.id(req.params.aporteId);
    if (!aporte) throw new ErrorHttp(404, 'Aporte no encontrado');
    if (aporte.movimiento) await Movimiento.deleteOne({ _id: aporte.movimiento, libro: req.libro._id });
    aporte.deleteOne();
    await meta.save();
    res.json({ meta: metaPublica(meta) });
  });

  // ---------- categorías ----------
  // Las del libro (con color y presupuesto) más las que usan sus movimientos; con lo de ?mes=AAAA-MM.
  libro.get('/categorias', async (req, res) => {
    const mes = typeof req.query.mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.mes) ? req.query.mes : new Date().toISOString().slice(0, 7);
    const inicio = new Date(`${mes}-01T00:00:00Z`);
    const fin = new Date(inicio);
    fin.setUTCMonth(fin.getUTCMonth() + 1);
    const [usadas, delMes] = await Promise.all([
      Movimiento.aggregate([
        { $match: { libro: req.libro._id } },
        { $group: { _id: { categoria: '$categoria', tipo: '$tipo' }, movimientos: { $sum: 1 } } },
      ]),
      Movimiento.aggregate([
        { $match: { libro: req.libro._id, fecha: { $gte: inicio, $lt: fin } } },
        { $group: { _id: { categoria: '$categoria', tipo: '$tipo' }, total: { $sum: '$monto' }, cuantos: { $sum: 1 } } },
      ]),
    ]);
    const lista = new Map();
    const clave = (nombre, tipo) => `${tipo}|${String(nombre).toLowerCase()}`;
    for (const c of req.libro.categorias ?? []) {
      lista.set(clave(c.nombre, c.tipo), { nombre: c.nombre, tipo: c.tipo, color: c.color ?? null, presupuesto: c.presupuesto ?? null, propia: true, movimientos: 0, totalMes: 0, cuantosMes: 0 });
    }
    for (const u of usadas) {
      const nombre = u._id.categoria || 'General';
      const k = clave(nombre, u._id.tipo);
      const c = lista.get(k) ?? { nombre, tipo: u._id.tipo, color: null, presupuesto: null, propia: false, movimientos: 0, totalMes: 0, cuantosMes: 0 };
      c.movimientos += u.movimientos;
      lista.set(k, c);
    }
    for (const d of delMes) {
      const c = lista.get(clave(d._id.categoria || 'General', d._id.tipo));
      if (c) Object.assign(c, { totalMes: redondear(c.totalMes + d.total), cuantosMes: c.cuantosMes + d.cuantos });
    }
    res.json({ mes, categorias: [...lista.values()].sort((a, b) => b.totalMes - a.totalMes || a.nombre.localeCompare(b.nombre)) });
  });

  // { nombre, tipo, color?, presupuesto?, antes? } — crea o edita. Con «antes» (otro nombre) se renombra
  // y los movimientos con el nombre anterior pasan al nuevo.
  libro.put('/categorias', puedeEditar, async (req, res) => {
    const nombre = texto(req.body.nombre, 'el nombre', 40);
    const tipo = req.body.tipo === 'ingreso' ? 'ingreso' : 'gasto';
    const presupuesto = req.body.presupuesto === null || req.body.presupuesto === '' || req.body.presupuesto === undefined ? undefined : leerMonto(req.body.presupuesto, 'el presupuesto');
    const color = COLOR.test(req.body.color ?? '') ? req.body.color : undefined;
    const antes = typeof req.body.antes === 'string' && req.body.antes.trim() ? req.body.antes.trim().slice(0, 40) : nombre;
    const igual = (a, b) => a.toLowerCase() === b.toLowerCase();
    const categorias = (req.libro.categorias ?? []).filter((c) => !(c.tipo === tipo && (igual(c.nombre, antes) || igual(c.nombre, nombre))));
    if (categorias.length >= 100) throw new ErrorHttp(400, 'Puedes tener hasta 100 categorías por libro');
    categorias.push({ nombre, tipo, ...(color && { color }), ...(presupuesto !== undefined && { presupuesto }) });
    req.libro.categorias = categorias;
    await req.libro.save();
    let movidos = 0;
    if (!igual(antes, nombre) || antes !== nombre) {
      const escapado = antes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const r = await Movimiento.updateMany({ libro: req.libro._id, tipo, categoria: new RegExp(`^${escapado}$`, 'i') }, { $set: { categoria: nombre } });
      movidos = r.modifiedCount;
    }
    res.json({ ok: true, movidos });
  });

  // Quita la categoría; sus movimientos pasan a «a» (por defecto «General»).
  libro.delete('/categorias', puedeEditar, async (req, res) => {
    const nombre = texto(req.body?.nombre ?? req.query.nombre, 'el nombre', 40);
    const tipo = (req.body?.tipo ?? req.query.tipo) === 'ingreso' ? 'ingreso' : 'gasto';
    const destino = typeof req.body?.a === 'string' && req.body.a.trim() ? req.body.a.trim().slice(0, 40) : 'General';
    req.libro.categorias = (req.libro.categorias ?? []).filter((c) => !(c.tipo === tipo && c.nombre.toLowerCase() === nombre.toLowerCase()));
    await req.libro.save();
    const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const r = await Movimiento.updateMany({ libro: req.libro._id, tipo, categoria: new RegExp(`^${escapado}$`, 'i') }, { $set: { categoria: destino } });
    res.json({ ok: true, movidos: r.modifiedCount });
  });
}
