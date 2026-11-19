// Correos de Yape («¡Acabas de yapear exitosamente!») leídos campo por campo, sin IA, y yapes entre
// personas que usan la app: al que recibe también se le registra el ingreso y se le avisa.
import { Usuario } from './models.js';
import { registrarVarios, huellaDe } from './bot.js';
import { notificarMensaje } from './push.js';
import { whatsappConectado, enviarANumero } from './whatsapp.js';

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, setiembre: 9, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

const normal = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\*/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * ¿Es la misma persona? Yape recorta los nombres («Franko Val*», «Nilson Gon*»): coincide el primer nombre
 * y el apellido recortado es el principio de alguno de los apellidos.
 */
export function mismaPersona(recortado, completo) {
  const [n1, ...resto1] = normal(recortado).split(' ');
  const [n2, ...resto2] = normal(completo).split(' ');
  if (!n1 || !n2 || n1 !== n2) return false;
  if (!resto1.length) return true;
  const apellido = resto1[0];
  return resto2.some((a) => a.startsWith(apellido) || apellido.startsWith(a));
}

// Valor de un campo del correo: lo que sigue a la etiqueta hasta la siguiente etiqueta conocida.
const ETIQUETAS = 'Yapero|Tu n[uú]mero de celular|Fecha y Hora de la operaci[oó]n|Celular del Beneficiario|Nombre del Beneficiario|Destino|N[uú]mero de operaci[oó]n|N[º°o]\\.? de operaci[oó]n|Nro\\.? de operaci[oó]n|C[oó]digo de seguridad|Monto de yapeo|Mensaje|Agente|Comercio|\\*|$';
// Solo el nombre: sin el texto que el correo pone detrás (número de operación, avisos de seguridad).
const campo = (texto, etiqueta) => (new RegExp(`${etiqueta}\\s*:?\\s*(.+?)\\s*(?=(?:${ETIQUETAS}))`, 'i').exec(texto)?.[1] ?? '')
  .replace(/\s*(N[º°o]|Nro|N[uú]mero)\.?\s+de\s+operaci.*$/i, '').trim().slice(0, 40);

/**
 * Lee un correo de Yape. Devuelve los datos del movimiento visto desde la persona de la cuenta («nombre»)
 * o null si no es un correo de Yape con esos campos.
 */
export function leerCorreoYape(correo, nombre, whatsapp = '') {
  const todo = `${correo.asunto}\n${correo.texto}`.replace(/\s+/g, ' ');
  if (!/yape/i.test(`${correo.remitente} ${correo.asunto} ${todo.slice(0, 400)}`)) return null;
  const importe = /Monto(?: de(?:l)? yapeo| yapeado| del pago)?\s*\*?\s*S\/\.?\s*([\d.,]+)/i.exec(todo) ?? /S\/\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/.exec(todo);
  if (!importe) return null;
  const monto = Number(importe[1].replace(/,/g, ''));
  if (!(monto > 0)) return null;

  // «¡Hola, X!» es la persona del buzón, la que yapeó (el correo solo le llega a quien envía).
  const saludo = /Hola,?\s+([^!¡]{2,40})!/i.exec(todo)?.[1]?.trim() ?? '';
  const yapero = saludo || campo(todo, 'Yapero');
  const beneficiario = campo(todo, 'Nombre del Beneficiario');
  const cel3 = /Celular del Beneficiario\s*:?\s*[X*\d\s]*?(\d{3})(?!\d)/i.exec(todo)?.[1] ?? '';
  const celPropio3 = /Tu n[uú]mero de celular\s*:?\s*[X*\d\s]*?(\d{3})(?!\d)/i.exec(todo)?.[1] ?? '';
  const enviado = /acabas de yapear|yapeaste|enviaste un yape|yapeo exitoso/i.test(todo);
  const recibido = /te yapearon|recibiste un yape|te han yapeado|te ha yapeado/i.test(todo);
  if (!enviado && !recibido && !beneficiario) return null;

  // Fecha y hora: «13 noviembre 2026 - 06:34 p. m.»
  let fecha = correo.fecha;
  let hora = '';
  const fh = /(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})\s*[-–,]?\s*(\d{1,2}):(\d{2})\s*([ap])\.?\s*m/i.exec(todo);
  if (fh) {
    fecha = `${fh[3]}-${String(MESES[fh[2].toLowerCase()]).padStart(2, '0')}-${fh[1].padStart(2, '0')}`;
    let h = Number(fh[4]) % 12;
    if (fh[6].toLowerCase() === 'p') h += 12;
    hora = `${String(h).padStart(2, '0')}:${fh[5]}`;
  }

  // ¿Quién es quién? Primero por el celular (lo más fiable: Yape a veces pone otro nombre en «Beneficiario»):
  // si el WhatsApp de la cuenta termina como el celular del beneficiario, el dinero entra; si termina como
  // «Tu número de celular», sale. Si no se sabe, por los nombres.
  const mio3 = String(whatsapp ?? '').slice(-3);
  const esIngreso = mio3 && cel3 && mio3 === cel3 ? true
    : mio3 && celPropio3 && mio3 === celPropio3 ? false
      : (beneficiario && mismaPersona(beneficiario, nombre) && !mismaPersona(yapero, nombre)) || (recibido && !enviado);
  // El beneficiario solo se nombra si no es la misma persona que yapeó (Yape a veces repite el nombre).
  const nombreBeneficiario = beneficiario && !mismaPersona(beneficiario, yapero) ? beneficiario : '';
  const otro = esIngreso ? yapero : (nombreBeneficiario || (cel3 ? `***${cel3}` : ''));
  return {
    tipo: esIngreso ? 'ingreso' : 'gasto',
    monto,
    descripcion: `${esIngreso ? 'Yapeo de' : 'Yapeo a'} ${otro || 'Yape'}`.slice(0, 120),
    categoria: 'Transferencias',
    fecha,
    hora,
    medio: 'yape',
    pagado: true,
    huella: huellaDe({ fecha, hora, tipo: esIngreso ? 'ingreso' : 'gasto', monto }),
    decidido: true,
    yape: { yapero, beneficiario: nombreBeneficiario, cel3, celPropio3 },
  };
}

/**
 * Yape de una persona de la app a otra: si el beneficiario también usa la app (mismo nombre y su WhatsApp
 * termina en los 3 dígitos del celular del beneficiario), se le registra el ingreso y se le avisa.
 */
export async function registrarAlBeneficiario(remitente, datos, { exigirNombre = false } = {}) {
  const { beneficiario, cel3, yapero } = datos.yape ?? {};
  const conCelular = /^\d{3}$/.test(cel3 ?? '');
  if (datos.tipo !== 'gasto' || (!conCelular && !beneficiario)) return;
  // Desde una captura (sin correo) se exige que el nombre coincida: el celular solo se ve a veces.
  if (exigirNombre && !beneficiario) return;
  try {
    const primerNombre = normal(beneficiario).split(' ')[0];
    const candidatos = conCelular
      ? await Usuario.find({ _id: { $ne: remitente._id }, whatsapp: new RegExp(`${cel3}$`) }).limit(20)
      : await Usuario.find({ _id: { $ne: remitente._id }, nombre: new RegExp(`^${primerNombre.replace(/[^a-z0-9ñ]/gi, '')}`, 'i') }).limit(50);
    const porNombre = candidatos.filter((u) => beneficiario && mismaPersona(beneficiario, u.nombre));
    // Correo: una sola persona con ese final de celular es ella (Yape a veces pone otro nombre); si hay varias,
    // desempata el nombre. Captura: siempre por nombre (y celular si se ve).
    const elegidos = exigirNombre || !conCelular ? porNombre : candidatos.length === 1 ? candidatos : porNombre;
    if (elegidos.length !== 1) return; // ninguno, o dudoso: mejor no registrar a quien no es
    const persona = elegidos[0];
    const quien = yapero || remitente.nombre;
    const mensaje = await registrarVarios(persona, [{
      tipo: 'ingreso', monto: datos.monto, fecha: datos.fecha, hora: datos.hora, descripcion: `Yapeo de ${quien}`, categoria: 'Transferencias', medio: 'yape', pagado: true,
    }], { origen: '(yape recibido)' });
    if (!mensaje.startsWith('✅')) return;
    notificarMensaje(persona._id, `💜 ${quien} te yapeó S/ ${datos.monto.toFixed(2)}\nRegistrado como ingreso en tu libro.`, { etiqueta: `yape-${datos.huella ?? Date.now()}` });
    if (persona.whatsapp && whatsappConectado()) {
      enviarANumero(persona.whatsapp, { texto: `💜 *${quien} te yapeó S/ ${datos.monto.toFixed(2)}*\n${mensaje.split('\n').slice(1).join('\n')}` }).catch(() => {});
    }
  } catch (err) {
    console.error('Yape al beneficiario:', err.message);
  }
}

// Descripción de un pago con Yape o Plin registrado a mano o desde una captura: «Yape a número ***266»,
// «Yapeo a Franko Val*», «Plin - Raul Tovar», «Franko Val*» → { beneficiario, cel3 }.
export function beneficiarioDeDescripcion(descripcion) {
  const texto = String(descripcion ?? '').trim();
  const cel3 = /\*{2,}\s*(\d{3})\b/.exec(texto)?.[1] ?? '';
  const nombre = texto
    .replace(/^(?:yapeo|yape|plineo|plin)\s*(?:a|para|-)?\s*(?:n[uú]mero\s*)?/i, '')
    .replace(/[*\s]*\d{3}\s*$/, '')
    .replace(/^[*\s]+/, '')
    .trim();
  return { beneficiario: /[a-záéíóúñ]{2,}/i.test(nombre) ? nombre : '', cel3 };
}

// ---------- constancias de Plin y Yape que mandan los bancos y Yape (sin IA) ----------

const NOMBRE = String.raw`([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ'.*]*(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ'.*]*){0,4})`;
// Lo que corta un nombre: la siguiente etiqueta del correo, un importe o una palabra de enlace.
const FIN_NOMBRE = /\s+(?:por|con|a trav[eé]s|v[ií]a|el|en|desde|celular|n[uú]mero|nro|n[º°]|fecha|hora|monto|importe|banco|cuenta|operaci[oó]n|c[oó]digo|destino|mensaje|concepto|tu|su|de)\b.*$/i;
const limpiarNombre = (t) => String(t ?? '').replace(FIN_NOMBRE, '').replace(/[.:,;]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 40);

// Envío: «Realizaste un Plin», «Has enviado S/ 20 a…», «Monto enviado», «Destinatario: …».
const ENVIO = /(realizaste (?:un|una) (?:plin|yape|yapeo|plineo|pago|transferencia|env[ií]o)|has (?:enviado|realizado|pagado|transferido|yapeado|plineado)|enviaste|transferiste|plineaste|yapeaste|pagaste|acabas de (?:yapear|plinear|enviar|pagar)|monto (?:enviado|transferido|pagado)|importe (?:enviado|transferido))/i;
// Recepción: «Recibiste un Plin de…», «Has recibido S/ 20», «Te plinearon», «JUAN te envió…», «Monto recibido».
const RECEPCION = /(recibiste (?:un[ao]? )?(?:plin|plineo|yape|yapeo|pago|transferencia|dinero|env[ií]o|S\/|US\$)|has recibido (?:un[ao]? )?(?:plin|plineo|yape|yapeo|pago|transferencia|dinero|env[ií]o|S\/|US\$)|te (?:plinearon|yapearon|enviaron|transfirieron|pagaron)|te (?:pline[oó]|yape[oó]|envi[oó]|transfiri[oó]|pag[oó])|monto recibido|importe recibido|(?:plin|yape|transferencia) recibid[oa])/i;

/**
 * Constancia de Plin o Yape de un banco (Interbank, BBVA, Scotiabank, BCP…) o de Yape, sin IA.
 * Lee el importe de «Monto/Importe … S/ X» (o el primer importe del aviso), la dirección por las frases
 * de envío o recepción del inicio del correo, la otra persona por «Destinatario/Beneficiario» u
 * «Ordenante/Remitente» (o «a NOMBRE» / «de NOMBRE»), y la fecha y hora si vienen.
 * Devuelve los datos del movimiento o null si no es una constancia reconocible.
 */
export function leerConstanciaBilletera(correo) {
  const todo = `${correo.asunto}\n${correo.texto}`.replace(/[ \t]+/g, ' ');
  const plano = todo.replace(/\s+/g, ' ');
  // El aviso va al principio; el final suele traer textos legales («has recibido este correo porque…»).
  const inicio = plano.slice(0, 900);
  // Plin o Yape solo por el remitente, el asunto o el arranque del aviso (no por publicidad más abajo).
  const cabecera = `${correo.remitente} ${correo.asunto} ${inicio.slice(0, 300)}`;
  const billetera = /plin/i.test(cabecera) ? 'plin' : /yape/i.test(cabecera) ? 'yape' : /transferencia(?:s)? a celular|a un celular/i.test(cabecera) ? 'plin' : '';
  if (!billetera) return null;
  // Avisos que no son una operación hecha (códigos, claves, promociones, recordatorios).
  if (/c[oó]digo de verificaci|clave|contrase[ñn]a|token|promo|oferta|sorteo|gana|descuento|cup[oó]n|recordatorio|vence|afiliaci|activa(?:ste)? tu|bienvenid/i.test(correo.asunto)) return null;

  const recepcion = RECEPCION.test(inicio);
  const envio = ENVIO.test(inicio);
  if (!recepcion && !envio) return null;
  // Si dice las dos cosas, manda la primera que aparece.
  const esIngreso = recepcion && (!envio || inicio.search(RECEPCION) < inicio.search(ENVIO));

  const conEtiqueta = /(?:monto|importe|total)(?:\s+(?:enviado|recibido|transferido|pagado|de\s+(?:la\s+)?operaci[oó]n|del\s+(?:plin|yape|pago|env[ií]o)))?\s*:?\s*(S\/\.?|US\$|USD|PEN)\s*([\d.,]+)/i.exec(plano);
  const libre = /(S\/\.?|US\$)\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i.exec(inicio);
  const importe = conEtiqueta ?? libre;
  if (!importe) return null;
  const numero = importe[2].replace(/[.,]$/, '');
  const monto = Number(/^\d+,\d{1,2}$/.test(numero) ? numero.replace(',', '.') : numero.replace(/,/g, ''));
  if (!(monto > 0)) return null;
  const moneda = /^(US\$|USD)$/i.test(importe[1]) ? 'USD' : 'PEN';

  // La otra persona.
  const etiqueta = esIngreso
    ? new RegExp(String.raw`(?:ordenante|remitente|enviado por|de parte de|nombre del (?:ordenante|remitente))\s*:?\s*${NOMBRE}`, 'i')
    : new RegExp(String.raw`(?:destinatario|beneficiario|enviado a|para|nombre del (?:destinatario|beneficiario))\s*:?\s*${NOMBRE}`, 'i');
  const frase = esIngreso
    ? new RegExp(String.raw`(?:(?:recibiste|has recibido)[^!\n]{0,60}?\s+de\s+${NOMBRE}|^\s*${NOMBRE}\s+te\s+(?:pline[oó]|yape[oó]|envi[oó]|transfiri[oó]|pag[oó]))`, 'im')
    : new RegExp(String.raw`(?:enviaste|has enviado|plineaste|yapeaste|pagaste|transferiste|realizaste un[ao]? (?:plin|yape|pago|transferencia)|has (?:pagado|transferido))[^!\n]{0,60}?\s+(?:a|para)\s+${NOMBRE}`, 'i');
  const m = etiqueta.exec(plano) ?? frase.exec(inicio) ?? frase.exec(correo.texto.trim());
  let otro = limpiarNombre(m?.[1] ?? m?.[2]);
  if (/^(ti|usted|tu|su|el|la|un|una|celular|cuenta|yape|plin)$/i.test(otro)) otro = '';

  // Fecha y hora: «19/11/2026 10:30 a. m.», «19-11-2026 - 22:15» o «19 de noviembre de 2026 a las 10:30 p. m.».
  let fecha = correo.fecha;
  let hora = '';
  const num = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s*(?:[-–,]|a las)?\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?\s*m?)?/i.exec(plano);
  const txt = /(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+|del\s+)?(\d{4})(?:\s*(?:[-–,]|a las)?\s*(\d{1,2}):(\d{2})\s*([ap])?\.?\s*m?)?/i.exec(plano);
  const poner = (d, mes, a, h, min, ap) => {
    const f = `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    // Solo fechas razonables (cerca de cuando llegó el correo).
    if (Math.abs(new Date(`${f}T00:00:00Z`) - new Date(`${correo.fecha}T00:00:00Z`)) > 3 * 86400000) return;
    fecha = f;
    if (h !== undefined && min !== undefined) {
      let hh = Number(h);
      if (ap) hh = (hh % 12) + (ap.toLowerCase() === 'p' ? 12 : 0);
      if (hh < 24) hora = `${String(hh).padStart(2, '0')}:${min}`;
    }
  };
  if (num) poner(num[1], num[2], num[3], num[4], num[5], num[6]);
  else if (txt) poner(txt[1], MESES[txt[2].toLowerCase()], txt[3], txt[4], txt[5], txt[6]);

  const marca = billetera === 'plin' ? 'Plin' : 'Yape';
  const tipo = esIngreso ? 'ingreso' : 'gasto';
  return {
    tipo,
    monto,
    moneda,
    descripcion: (otro ? `${billetera === 'plin' ? 'Plineo' : 'Yapeo'} ${esIngreso ? 'de' : 'a'} ${otro}` : `${marca} ${esIngreso ? 'recibido' : 'enviado'}`).slice(0, 120),
    categoria: 'Transferencias',
    fecha,
    hora,
    medio: billetera,
    pagado: true,
    huella: huellaDe({ fecha, hora, tipo, monto }),
    decidido: true,
  };
}
