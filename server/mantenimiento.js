// Mantenimiento de la base de datos para que ocupe poco (plan gratuito de MongoDB: 512 MB para todos).
import mongoose from 'mongoose';
import { Movimiento, SesionWa, Ajuste } from './models.js';

/** Una sola vez: quita datos que ya no se usan y rehace los índices como índices parciales. */
export async function compactarUnaVez() {
  const r1 = await Movimiento.updateMany({ serie: null }, { $unset: { serie: 1 } });
  const r2 = await Movimiento.updateMany({ $or: [{ updatedAt: { $exists: true } }, { __v: { $exists: true } }] }, { $unset: { updatedAt: 1, __v: 1 } }, { strict: false });
  const r3 = await Movimiento.updateMany({ fechaPago: null }, { $unset: { fechaPago: 1 } });
  // Claves de cifrado de grupos de WhatsApp (el bot ya no los lee).
  const r4 = await SesionWa.deleteMany({ _id: /^sender-key/ });
  await Movimiento.syncIndexes();
  console.log(`Base compactada: ${r1.modifiedCount + r2.modifiedCount + r3.modifiedCount} movimientos aligerados, ${r4.deletedCount} claves de grupos borradas.`);
  return r1.modifiedCount + r2.modifiedCount + r3.modifiedCount;
}

/** Cada día: borra lo que ya no sirve. */
export async function limpiezaDiaria() {
  try {
    const ayer = new Date(Date.now() - 2 * 86400000);
    // Los avisos ya enviados de pagos que vencieron: no se van a volver a mandar.
    await Movimiento.updateMany({ recordado: { $exists: true }, fecha: { $lt: ayer } }, { $unset: { recordado: 1 } });
    await Ajuste.updateOne({ _id: 'mantenimiento' }, { valor: { ultima: new Date() } }, { upsert: true });
  } catch (err) {
    console.error('Mantenimiento:', err.message);
  }
}

export function iniciarMantenimiento() {
  setTimeout(limpiezaDiaria, 5 * 60_000);
  setInterval(limpiezaDiaria, 24 * 3600_000);
}

/** Tamaño de cada colección (datos e índices), para el panel de administración. */
export async function tamanos() {
  const db = mongoose.connection.db;
  const colecciones = await db.listCollections().toArray();
  const lista = await Promise.all(colecciones.map(async (c) => {
    const s = await db.command({ collStats: c.name }).catch(() => null);
    return s && { nombre: c.name, documentos: s.count, datos: s.size, almacenado: s.storageSize, indices: s.totalIndexSize };
  }));
  return lista.filter(Boolean).sort((a, b) => (b.almacenado + b.indices) - (a.almacenado + a.indices));
}
