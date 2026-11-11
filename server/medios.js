// Medio de pago de cada movimiento (Yape, Plin, tarjeta, transferencia, efectivo…) y entidad (BCP, Interbank…).
// Se deduce del texto del aviso, del correo o de lo que escribe la persona; también se puede elegir a mano.

export const MEDIOS = ['yape', 'plin', 'tarjeta', 'transferencia', 'efectivo', 'otro'];

const ENTIDADES = [
  [/\bbcp\b|viabcp|banco de cr[eé]dito/i, 'BCP'],
  [/interbank/i, 'Interbank'],
  [/\bbbva\b|continental/i, 'BBVA'],
  [/scotiabank|\bscotia\b/i, 'Scotiabank'],
  [/banco de la naci[oó]n|bn\.com\.pe/i, 'Banco de la Nación'],
  [/mibanco/i, 'Mibanco'],
  [/pichincha/i, 'Pichincha'],
  [/banbif/i, 'BanBif'],
  [/falabella|\bcmr\b/i, 'Falabella'],
  [/ripley/i, 'Ripley'],
  [/caja arequipa/i, 'Caja Arequipa'],
  [/caja huancayo/i, 'Caja Huancayo'],
  [/caja piura/i, 'Caja Piura'],
  [/caja cusco/i, 'Caja Cusco'],
  [/mercado ?pago/i, 'Mercado Pago'],
  [/paypal/i, 'PayPal'],
];

// Por orden: lo más concreto primero (Yape antes que «transferencia», tarjeta antes que banco).
const PATRONES_MEDIO = [
  ['yape', /\byape(?:o|aste|aron|ar|[oó])?\b|\byapeo/i],
  ['plin', /\bplin(?:e?aste|earon|eo)?\b/i],
  ['tarjeta', /tarjeta|consumo|consumiste|\bvisa\b|mastercard|\bamex\b|american express|\bcmr\b|\bpos\b|cargo autom[aá]tico|cargo recurrente/i],
  ['transferencia', /transferencia|transferiste|transfiri[oó]|transfirieron|dep[oó]sito|depositaron|abono|interbancari|\bcci\b|pago de haberes|planilla/i],
  ['efectivo', /efectivo|\bcash\b|en mano/i],
];

/**
 * Deduce { medio, entidad } a partir de uno o varios textos, del más fiable al menos fiable
 * (p. ej. remitente y asunto del correo antes que su cuerpo). Lo que no se sepa queda en null.
 */
export function detectarMedio(...fuentes) {
  const textos = fuentes.filter((t) => typeof t === 'string' && t.trim());
  // Yape y Plin dichos en cualquier texto corto (descripción, asunto) mandan: un Plin pagado desde la
  // cuenta del BCP llega en un correo de «Tarjeta de Débito», pero es un Plin.
  const billetera = textos.filter((t) => t.length <= 200).map((t) => PATRONES_MEDIO.slice(0, 2).find(([, p]) => p.test(t))?.[0]).find(Boolean);
  let medio = billetera ?? null;
  for (const texto of textos) {
    if (medio) break;
    medio = PATRONES_MEDIO.find(([, patron]) => patron.test(texto))?.[0] ?? null;
  }
  let entidad = null;
  for (const texto of textos) {
    entidad = ENTIDADES.find(([patron]) => patron.test(texto))?.[1] ?? null;
    if (entidad) break;
  }
  // Un aviso del banco sin más pistas (p. ej. «Constancia de operación BCP») es una transferencia o pago bancario.
  if (!medio && entidad) medio = 'transferencia';
  return { medio, entidad };
}

/** Normaliza lo que llega de la IA o del formulario: { medio, entidad } válidos o null. */
export function leerMedio(medio, entidad) {
  const m = typeof medio === 'string' ? medio.trim().toLowerCase() : '';
  const e = typeof entidad === 'string' ? entidad.trim().slice(0, 40) : '';
  // La IA puede escribir el nombre de la entidad: se pasa al nombre habitual («banco de credito» → «BCP»).
  const conocida = e ? ENTIDADES.find(([patron]) => patron.test(e))?.[1] : null;
  return {
    medio: MEDIOS.includes(m) ? m : null,
    entidad: conocida ?? (e || null),
  };
}

// Quita del final de la descripción el medio dicho al registrar («Taxi con yape» → «Taxi»).
export const sinMedioEnDescripcion = (texto) => String(texto ?? '')
  .replace(/\s+(?:con|por|en|via|vía|desde|pagado con|pagu[eé] con)\s+(?:mi\s+|la\s+|el\s+)?(?:yape|plin|tarjeta(?:\s+de\s+(?:cr[eé]dito|d[eé]bito))?|efectivo|transferencia|cash)(?:\s+(?:del?\s+)?(?:bcp|interbank|bbva|scotiabank|scotia|falabella|ripley))?\s*$/i, '')
  .trim();
