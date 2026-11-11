import { Router } from 'express';
import mongoose from 'mongoose';
import { config } from './config.js';
import { Usuario, Libro, Movimiento } from './models.js';
import { crearUsuario, cambiarPassword, olvidarCuenta, esAdmin } from './auth.js';
import { ErrorHttp } from './errores.js';
import { wa, conectarWhatsapp, desconectarWhatsapp, enviarEstadoDeCuenta } from './whatsapp.js';
import { estadoIa, guardarIa, probarIa } from './ia.js';

const BASES_DEL_SISTEMA = ['admin', 'local', 'config'];

// El límite del plan se aplica a todo el clúster, así que se suman todas sus bases de datos.
// Si el usuario de MongoDB no tiene permiso para listarlas, se mide solo la de esta app.
async function usoDelCluster() {
  const cliente = mongoose.connection.getClient();
  let nombres = [mongoose.connection.name];
  let completo = false;
  try {
    const { databases } = await cliente.db().admin().listDatabases({ nameOnly: true });
    nombres = databases.map((d) => d.name).filter((n) => !BASES_DEL_SISTEMA.includes(n));
    if (!nombres.includes(mongoose.connection.name)) nombres.push(mongoose.connection.name);
    completo = true;
  } catch {
    // Sin permiso: se sigue con la base propia.
  }

  const bases = [];
  for (const nombre of nombres) {
    const s = await cliente.db(nombre).stats();
    bases.push({ nombre, bytes: s.dataSize + s.indexSize, documentos: s.objects, propia: nombre === mongoose.connection.name });
  }
  return { bases, completo };
}

export const rutasAdmin = Router();

rutasAdmin.get('/almacenamiento', async (req, res) => {
  // Tiempo de ida y vuelta a la base: si es alto, el servidor y la base están en regiones alejadas.
  const inicio = performance.now();
  await mongoose.connection.db.admin().ping();
  const latenciaMs = Math.round(performance.now() - inicio);

  const [{ bases, completo }, usuarios, libros, movimientos, statsMov] = await Promise.all([
    usoDelCluster(),
    Usuario.countDocuments(),
    Libro.countDocuments(),
    Movimiento.countDocuments(),
    mongoose.connection.db.command({ collStats: Movimiento.collection.name }).catch(() => null),
  ]);

  const limite = config.almacenamientoMb * 1024 * 1024;
  const usado = bases.reduce((total, b) => total + b.bytes, 0);
  const libre = Math.max(0, limite - usado);
  // Tamaño medio de un movimiento con sus índices. Con pocos datos la media engaña
  // (los índices tienen un tamaño mínimo), así que hasta 1000 movimientos se usa un valor fijo prudente.
  const porMovimiento = movimientos >= 1000 && statsMov ? (statsMov.size + statsMov.totalIndexSize) / movimientos : 400;

  res.json({
    limite,
    usado,
    libre,
    porcentaje: Math.min(100, (usado / limite) * 100),
    movimientosQueCaben: Math.floor(libre / porMovimiento),
    clusterCompleto: completo,
    latenciaMs,
    bases: bases.sort((a, b) => b.bytes - a.bytes),
    totales: { usuarios, libros, movimientos },
  });
});

rutasAdmin.post('/usuarios', async (req, res) => {
  const usuario = await crearUsuario(req.body, { altaAdmin: true });
  res.status(201).json({ usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email } });
});

// El administrador pone una contraseña nueva a quien la olvidó.
rutasAdmin.patch('/usuarios/:id', async (req, res) => {
  const usuario = mongoose.isValidObjectId(req.params.id) ? await Usuario.findById(req.params.id) : null;
  if (!usuario) throw new ErrorHttp(404, 'Usuario no encontrado');
  await cambiarPassword(usuario, req.body.password);
  // Si el administrador gestiona la cuenta, entra con su licencia de VIMOD (sirve también para las
  // cuentas que creó antes de existir esta marca).
  if (!usuario.altaAdmin && !(await esAdmin(usuario))) {
    usuario.altaAdmin = true;
    await usuario.save();
    olvidarCuenta(usuario.id);
  }
  res.status(204).end();
});

// ---------- bot de WhatsApp ----------

const estadoWhatsapp = async () => ({ ...wa, conNumero: await Usuario.countDocuments({ whatsapp: { $exists: true } }) });

rutasAdmin.get('/whatsapp', async (req, res) => res.json(await estadoWhatsapp()));

rutasAdmin.post('/whatsapp/conectar', async (req, res) => {
  await conectarWhatsapp();
  res.json(await estadoWhatsapp());
});

rutasAdmin.post('/whatsapp/desconectar', async (req, res) => {
  await desconectarWhatsapp();
  res.json(await estadoWhatsapp());
});

// Envía el estado de cuenta a un usuario (usuarioId) o a todos los que tienen número («todos»).
rutasAdmin.post('/whatsapp/enviar', async (req, res) => {
  if (wa.estado !== 'conectado') throw new ErrorHttp(409, 'WhatsApp no está conectado');
  const { usuarioId } = req.body;
  let destinatarios;
  if (usuarioId === 'todos') {
    destinatarios = await Usuario.find({ whatsapp: { $exists: true } }).limit(200);
  } else {
    const usuario = mongoose.isValidObjectId(usuarioId) ? await Usuario.findById(usuarioId) : null;
    if (!usuario) throw new ErrorHttp(404, 'Usuario no encontrado');
    destinatarios = [usuario];
  }

  const fallos = [];
  let enviados = 0;
  for (const [i, usuario] of destinatarios.entries()) {
    // Una pausa entre envíos: mandar muchos mensajes seguidos es lo que más bloqueos provoca.
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      await enviarEstadoDeCuenta(usuario);
      enviados += 1;
    } catch (err) {
      fallos.push(err.message);
    }
  }
  res.json({ enviados, fallos });
});

// ---------- inteligencia artificial ----------

rutasAdmin.get('/ia', async (req, res) => res.json(await estadoIa()));

rutasAdmin.put('/ia', async (req, res) => {
  const { proveedor, clave, modelo, activa, responderTodo } = req.body;
  if (clave !== undefined && clave !== null && (typeof clave !== 'string' || clave.length > 300)) throw new ErrorHttp(400, 'Clave inválida');
  res.json(await guardarIa({ proveedor, clave, modelo, activa, responderTodo }));
});

rutasAdmin.post('/ia/probar', async (req, res) => res.json(await probarIa()));

// Elimina la cuenta con sus libros y movimientos, y la quita de los libros que le compartieron.
rutasAdmin.delete('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  if (id === req.usuario.id) throw new ErrorHttp(400, 'No puedes eliminar tu propia cuenta desde aquí');
  const usuario = mongoose.isValidObjectId(id) ? await Usuario.findById(id) : null;
  if (!usuario) throw new ErrorHttp(404, 'Usuario no encontrado');

  const libros = await Libro.find({ propietario: usuario._id }).distinct('_id');
  const { deletedCount: movimientos } = await Movimiento.deleteMany({ libro: { $in: libros } });
  await Libro.deleteMany({ _id: { $in: libros } });
  await Libro.updateMany({ 'miembros.usuario': usuario._id }, { $pull: { miembros: { usuario: usuario._id } } });
  await usuario.deleteOne();
  olvidarCuenta(usuario.id);
  res.json({ eliminado: { nombre: usuario.nombre, libros: libros.length, movimientos } });
});

rutasAdmin.get('/usuarios', async (req, res) => {
  const [usuarios, librosPorUsuario] = await Promise.all([
    Usuario.find().sort({ createdAt: 1 }).select('nombre email whatsapp createdAt').limit(500),
    Libro.aggregate([{ $group: { _id: '$propietario', total: { $sum: 1 } } }]),
  ]);
  const libros = new Map(librosPorUsuario.map((l) => [String(l._id), l.total]));
  res.json({
    usuarios: usuarios.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      whatsapp: u.whatsapp ?? '',
      registro: u.createdAt.toISOString().slice(0, 10),
      libros: libros.get(u.id) ?? 0,
    })),
  });
});
