import mongoose from 'mongoose';
import { config } from './config.js';
import { ErrorHttp } from './errores.js';
import { Usuario } from './models.js';

// Acceso por licencia de VIMOD.
// La app se vende desde el Panel administrador de VIMOD: allí se crea el software, y cada cliente
// recibe una licencia. Aquí se consulta esa base (solo lectura) para dejar entrar solo a quien
// tenga una licencia activa y sin vencer de este software, buscándolo por su correo.
// Si VIMOD_MONGODB_URI o VIMOD_SOFTWARE no están definidos, el control no se aplica y la app queda abierta.

const RECUERDO_MS = 60_000; // cada resultado se recuerda un minuto
const GRACIA_MS = 24 * 60 * 60_000; // si la base de VIMOD falla, vale una respuesta positiva de hasta un día

export const licenciasActivas = () => Boolean(config.vimod.uri && config.vimod.software);

let conexion = null;
function bd() {
  if (!conexion) {
    conexion = mongoose.createConnection(config.vimod.uri, { dbName: config.vimod.db, serverSelectionTimeoutMS: 10000 });
    conexion.on('error', (err) => console.error('Base de VIMOD:', err.message));
    conexion.asPromise()
      .then(() => console.log(`Licencias: conectado a la base de VIMOD («${config.vimod.db}»)`))
      .catch(() => {});
  }
  return conexion;
}

// Abre la conexión al arrancar, para que el primer acceso no espere.
export function prepararLicencias() {
  if (!licenciasActivas()) return console.log('Licencias de VIMOD: desactivadas (falta VIMOD_MONGODB_URI o VIMOD_SOFTWARE).');
  idSoftware()
    .then((id) => console.log(`Licencias de VIMOD: activas para «${config.vimod.software}» (${id})`))
    .catch((err) => console.error('Licencias de VIMOD:', err.message));
}

// Id del software en el catálogo del Panel, buscado por id o por nombre (sin distinguir mayúsculas).
let softwareId = null;
async function idSoftware() {
  if (softwareId) return softwareId;
  const c = await bd().asPromise();
  const valor = config.vimod.software;
  const escapado = valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filtro = mongoose.isValidObjectId(valor) ? { _id: new mongoose.Types.ObjectId(valor) } : { nombre: new RegExp(`^\\s*${escapado}\\s*$`, 'i') };
  const encontrados = await c.collection('sistemas').find(filtro, { projection: { _id: 1 } }).limit(2).toArray();
  if (!encontrados.length) throw new Error(`No hay ningún software «${valor}» en el Panel de VIMOD (variable VIMOD_SOFTWARE).`);
  if (encontrados.length > 1) throw new Error(`Hay varios softwares llamados «${valor}» en el Panel de VIMOD; pon su id en VIMOD_SOFTWARE.`);
  softwareId = encontrados[0]._id;
  return softwareId;
}

const recuerdo = new Map(); // email -> { ok, motivo, hasta, ultimoOk }

async function consultar(email) {
  const c = await bd().asPromise();
  const cliente = await c.collection('usuarios').findOne({ email }, { projection: { _id: 1, activo: 1 } });
  if (!cliente) return { ok: false, sinCuenta: true, motivo: `No hay una cuenta de VIMOD con el correo ${email}. Entra con el mismo correo con el que contrataste el software.` };
  if (cliente.activo === false) return { ok: false, motivo: 'Tu cuenta de VIMOD está desactivada. Escríbenos para reactivarla.' };

  const licencias = await c.collection('licencias')
    .find({ usuario: cliente._id, sistema: await idSoftware() }, { projection: { estado: 1, fechaVencimiento: 1 } })
    .toArray();
  if (!licencias.length) return { ok: false, motivo: 'Tu cuenta de VIMOD no tiene licencia de este software. Puedes contratarlo desde la web de VIMOD.' };
  const ahora = new Date();
  if (licencias.some((l) => l.estado === 'activa' && (!l.fechaVencimiento || l.fechaVencimiento > ahora))) return { ok: true };
  if (licencias.some((l) => l.estado === 'suspendida')) return { ok: false, motivo: 'Tu licencia de este software está suspendida. Escríbenos para reactivarla.' };
  return { ok: false, motivo: 'Tu licencia de este software ha vencido. Renuévala desde la web de VIMOD para seguir usándolo.' };
}

// Correos de los administradores de esta app (ADMIN_EMAILS o, si falta, la primera cuenta).
async function correosAdmin() {
  if (config.adminEmails.length) return config.adminEmails;
  const primero = await Usuario.findOne().sort({ createdAt: 1 }).select('email');
  return primero ? [primero.email] : [];
}

// Recibe un correo o una cuenta. Las cuentas que crea el administrador («Añadir usuario»)
// no tienen cuenta propia en el Panel de VIMOD: entran con la licencia del administrador.
// { ok: true } o { ok: false, motivo }. Las cuentas de LICENCIA_LIBRE entran siempre.
export async function comprobarLicencia(cuentaOEmail) {
  if (cuentaOEmail && typeof cuentaOEmail === 'object') {
    if (!licenciasActivas()) return { ok: true };
    if (!cuentaOEmail.altaAdmin) {
      // Una cuenta de esta app sin cuenta en el Panel de VIMOD es de alguien que añadió el
      // administrador (o de antes de las licencias): también entra con la licencia del administrador.
      const propia = await comprobarLicencia(cuentaOEmail.email);
      if (propia.ok || !propia.sinCuenta) return propia;
    }
    const admins = await correosAdmin();
    let ultimo = { ok: false, motivo: 'La licencia de VIMOD del administrador no está vigente. Avisa al administrador.' };
    for (const correo of admins) {
      const r = await comprobarLicencia(correo);
      if (r.ok) return { ok: true };
      ultimo = { ok: false, motivo: `La licencia de VIMOD del administrador no está vigente (${r.motivo}). Avisa al administrador.` };
    }
    return ultimo;
  }
  let email = String(cuentaOEmail || '').toLowerCase();
  if (!licenciasActivas() || config.vimod.libres.includes(email)) return { ok: true };

  const previo = recuerdo.get(email);
  if (previo && previo.hasta > Date.now()) return previo;
  try {
    const r = await consultar(email);
    const guardado = { ...r, hasta: Date.now() + RECUERDO_MS, ultimoOk: r.ok ? Date.now() : previo?.ultimoOk };
    recuerdo.set(email, guardado);
    return guardado;
  } catch (err) {
    console.error('No se pudo comprobar la licencia:', err.message);
    // Un fallo pasajero de la base de VIMOD no echa a quien ya tenía licencia confirmada.
    if (previo?.ultimoOk && Date.now() - previo.ultimoOk < GRACIA_MS) return { ok: true };
    return { ok: false, motivo: 'No se pudo comprobar tu licencia de VIMOD. Prueba de nuevo en unos minutos.' };
  }
}

// Para las rutas de acceso: lanza un 403 con el motivo si no hay licencia.
export async function exigirLicencia(cuentaOEmail) {
  const r = await comprobarLicencia(cuentaOEmail);
  if (!r.ok) throw new ErrorHttp(403, r.motivo);
}
