import { Ajuste } from './models.js';

// Tipo de cambio para pasar a la moneda del libro los cobros hechos en otra moneda (p. ej. dólares).
// Se consulta una API pública sin clave, se recuerda unas horas y se guarda el último valor conseguido
// por si la API falla más adelante.
const API = 'https://open.er-api.com/v6/latest';
const HORAS = 6;
const enMemoria = new Map();

export class ErrorCambio extends Error {}

async function tasasDe(base) {
  const guardado = enMemoria.get(base);
  if (guardado && guardado.hasta > Date.now()) return guardado.tasas;
  try {
    const res = await fetch(`${API}/${base}`, { signal: AbortSignal.timeout(10000) });
    const cuerpo = await res.json();
    if (!res.ok || cuerpo?.result !== 'success' || typeof cuerpo.rates !== 'object') throw new Error(`respuesta ${res.status}`);
    enMemoria.set(base, { tasas: cuerpo.rates, hasta: Date.now() + HORAS * 3600_000 });
    await Ajuste.updateOne({ _id: `cambio:${base}` }, { $set: { valor: cuerpo.rates } }, { upsert: true }).catch(() => {});
    return cuerpo.rates;
  } catch (err) {
    console.error(`Tipo de cambio (${base}):`, err.message);
    const ultimo = (await Ajuste.findById(`cambio:${base}`).lean().catch(() => null))?.valor;
    if (ultimo) {
      // Se usa el último conocido y se vuelve a intentar dentro de unos minutos.
      enMemoria.set(base, { tasas: ultimo, hasta: Date.now() + 10 * 60_000 });
      return ultimo;
    }
    return null;
  }
}

/**
 * Cuántas unidades de «a» vale una unidad de «de».
 * Devuelve null si alguna de las dos monedas no existe; lanza ErrorCambio si la API no responde
 * y no hay ningún valor guardado (el correo se reintenta en la próxima revisión).
 */
export async function tipoDeCambio(de, a) {
  if (de === a) return 1;
  const tasas = await tasasDe(de);
  if (!tasas) {
    // Sin tasas para «de»: puede que la API no responda o que la moneda no exista. Se prueba con el dólar.
    if (!(await tasasDe('USD'))) throw new ErrorCambio(`No se pudo obtener el tipo de cambio de ${de} a ${a}. Se reintentará solo.`);
    return null;
  }
  const tasa = Number(tasas[a]);
  return Number.isFinite(tasa) && tasa > 0 ? tasa : null;
}

/** Pasa un monto de una moneda a otra, redondeado a céntimos; null si la moneda no existe. */
export async function convertir(monto, de, a) {
  const tasa = await tipoDeCambio(de, a);
  return tasa === null ? null : Math.round(monto * tasa * 100) / 100;
}
