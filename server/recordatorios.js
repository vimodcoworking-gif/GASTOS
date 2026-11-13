// Recordatorios por WhatsApp de los pagos pendientes: unos días antes del vencimiento y el mismo día.
import { config } from './config.js';
import { Libro, Movimiento, Usuario } from './models.js';
import { formateador } from './informe.js';
import { whatsappConectado, enviarANumero } from './whatsapp.js';

const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: config.zona }).format(new Date());
const horaLocal = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: config.zona, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const diasEntre = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const fechaLarga = (iso) => new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

// Ajuste de la persona (por defecto, 2 días antes y el mismo día).
const ajusteDe = (u) => ({ dias: u?.recordatorio?.dias ?? 2, mismoDia: u?.recordatorio?.mismoDia ?? true });

/**
 * Qué aviso toca hoy para un movimiento pendiente, o null.
 * Devuelve { clave, faltan } — «clave» se guarda en el movimiento para no repetir el aviso.
 */
export function avisoQueToca(mov, ajuste, hoy = hoyLocal()) {
  const vence = mov.fecha.toISOString().slice(0, 10);
  const faltan = diasEntre(hoy, vence);
  if (faltan < 0) return null;
  const dias = mov.recordar ?? ajuste.dias;
  if (dias < 0) return null; // sin recordatorio para este pago
  const yaEnviado = (clave) => (mov.recordado ?? []).includes(clave);
  // El mismo día: si se pidió (ajuste de la persona) o si el pago tiene su propio recordatorio de 0 días.
  if (faltan === 0) {
    const clave = `${vence}:0`;
    return (ajuste.mismoDia || mov.recordar === 0) && !yaEnviado(clave) ? { clave, faltan } : null;
  }
  // Unos días antes: se manda una vez en cuanto falten «dias» o menos (aunque el servidor estuviera dormido ese día).
  if (dias > 0 && faltan <= dias) {
    const clave = `${vence}:${dias}`;
    return yaEnviado(clave) ? null : { clave, faltan };
  }
  return null;
}

function textoAviso(nombre, items, moneda) {
  const dinero = formateador(moneda);
  const lineas = items.map(({ mov, faltan, libro }) => {
    const cuando = faltan === 0 ? '*vence hoy*' : faltan === 1 ? 'vence *mañana*' : `vence en *${faltan} días* (${fechaLarga(mov.fecha.toISOString().slice(0, 10))})`;
    return `• ${mov.descripcion}: *${dinero(mov.monto)}* — ${cuando}${libro ? ` · ${libro}` : ''}`;
  });
  const total = items.reduce((s, i) => s + i.mov.monto, 0);
  return [
    `⏰ *Recordatorio de ${items.length === 1 ? 'pago' : 'pagos'}*`,
    `Hola ${nombre.split(' ')[0]}, ${items.length === 1 ? 'tienes un pago pendiente' : `tienes ${items.length} pagos pendientes`}:`,
    '',
    ...lineas,
    ...(items.length > 1 ? ['', `Total: *${dinero(total)}*`] : []),
    '',
    'Cuando lo pagues, márcalo como pagado en la app para que no te lo vuelva a recordar.',
  ].join('\n');
}

let enCurso = false;

/** Revisa los pagos pendientes de los próximos 7 días y manda los recordatorios que toquen. */
export async function revisarRecordatorios({ forzarHora = false } = {}) {
  if (enCurso || !whatsappConectado()) return 0;
  // Solo de 8:00 a 21:00 (hora de Lima), para no escribir de madrugada.
  const hora = horaLocal();
  if (!forzarHora && (hora < 8 || hora >= 21)) return 0;
  enCurso = true;
  let enviados = 0;
  try {
    const hoy = hoyLocal();
    const hasta = new Date(`${hoy}T00:00:00Z`);
    hasta.setUTCDate(hasta.getUTCDate() + 8);
    const pendientes = await Movimiento.find({ pagado: false, tipo: 'gasto', fecha: { $gte: new Date(`${hoy}T00:00:00Z`), $lt: hasta } }).limit(5000);
    if (!pendientes.length) return 0;

    const libros = new Map((await Libro.find({ _id: { $in: [...new Set(pendientes.map((m) => String(m.libro)))] } }).lean()).map((l) => [String(l._id), l]));
    const idsUsuarios = new Set();
    for (const m of pendientes) {
      const libro = libros.get(String(m.libro));
      if (libro) idsUsuarios.add(String(m.creadoPor ?? libro.propietario));
      if (libro) idsUsuarios.add(String(libro.propietario));
    }
    const usuarios = new Map((await Usuario.find({ _id: { $in: [...idsUsuarios] } }).select('nombre whatsapp recordatorio').lean()).map((u) => [String(u._id), u]));

    // Cada aviso va a quien registró el pago (si tiene WhatsApp) o, si no, al dueño del libro.
    const porPersona = new Map();
    for (const mov of pendientes) {
      const libro = libros.get(String(mov.libro));
      if (!libro) continue;
      const creador = usuarios.get(String(mov.creadoPor));
      const persona = creador?.whatsapp ? creador : usuarios.get(String(libro.propietario));
      if (!persona?.whatsapp) continue;
      const toca = avisoQueToca(mov, ajusteDe(persona), hoy);
      if (!toca) continue;
      const lista = porPersona.get(String(persona._id)) ?? { persona, items: [], moneda: libro.moneda, libros: new Set() };
      lista.items.push({ mov, faltan: toca.faltan, clave: toca.clave, libroNombre: libro.nombre });
      lista.libros.add(libro.nombre);
      porPersona.set(String(persona._id), lista);
    }

    for (const { persona, items, moneda, libros: nombres } of porPersona.values()) {
      items.sort((a, b) => a.faltan - b.faltan);
      const variosLibros = nombres.size > 1;
      try {
        await enviarANumero(persona.whatsapp, textoAviso(persona.nombre, items.map((i) => ({ ...i, libro: variosLibros ? i.libroNombre : '' })), moneda), { movimientos: items.map((i) => i.mov._id) });
        await Promise.all(items.map((i) => Movimiento.updateOne({ _id: i.mov._id }, { $addToSet: { recordado: i.clave } })));
        enviados += 1;
      } catch (err) {
        console.error(`Recordatorio a ${persona.whatsapp.slice(0, 4)}…:`, err.message);
      }
    }
    if (enviados) console.log(`Recordatorios de pago enviados: ${enviados}`);
    return enviados;
  } finally {
    enCurso = false;
  }
}

/** Mensaje de prueba con los próximos pagos de la persona (desde «Mi cuenta»). */
export async function recordatorioDePrueba(usuario) {
  if (!whatsappConectado()) throw new Error('El bot de WhatsApp no está conectado ahora mismo.');
  if (!usuario.whatsapp) throw new Error('Primero guarda tu número de WhatsApp en «Mi cuenta».');
  const hoy = hoyLocal();
  const hasta = new Date(`${hoy}T00:00:00Z`);
  hasta.setUTCDate(hasta.getUTCDate() + 31);
  const libros = await Libro.find({ $or: [{ propietario: usuario._id }, { 'miembros.usuario': usuario._id }] }).lean();
  const pendientes = await Movimiento.find({ libro: { $in: libros.map((l) => l._id) }, pagado: false, tipo: 'gasto', fecha: { $gte: new Date(`${hoy}T00:00:00Z`), $lt: hasta } }).sort({ fecha: 1 }).limit(10);
  const { dias, mismoDia } = ajusteDe(usuario);
  const cuando = [dias > 0 && `${dias === 1 ? '1 día' : `${dias} días`} antes`, mismoDia && 'el mismo día'].filter(Boolean).join(' y ') || 'nunca (están desactivados)';
  const texto = pendientes.length
    ? textoAviso(usuario.nombre, pendientes.map((mov) => ({ mov, faltan: diasEntre(hoy, mov.fecha.toISOString().slice(0, 10)) })), libros[0]?.moneda ?? 'PEN')
    : `⏰ *Recordatorios activados*\nHola ${usuario.nombre.split(' ')[0]}, no tienes pagos pendientes en los próximos 30 días.`;
  await enviarANumero(usuario.whatsapp, `${texto}\n\n_Mensaje de prueba. Te avisaré ${cuando} de cada pago pendiente._`);
}

let temporizador;
export function iniciarRecordatorios() {
  clearInterval(temporizador);
  // Cada 20 minutos; la primera vez, al minuto de arrancar (cuando WhatsApp ya se reconectó).
  setTimeout(() => revisarRecordatorios().catch((err) => console.error('Recordatorios:', err.message)), 60_000);
  temporizador = setInterval(() => revisarRecordatorios().catch((err) => console.error('Recordatorios:', err.message)), 20 * 60_000);
}
