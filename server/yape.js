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
export async function registrarAlBeneficiario(remitente, datos) {
  const { beneficiario, cel3, yapero } = datos.yape ?? {};
  if (datos.tipo !== 'gasto' || !/^\d{3}$/.test(cel3 ?? '')) return;
  try {
    const candidatos = await Usuario.find({ _id: { $ne: remitente._id }, whatsapp: new RegExp(`${cel3}$`) }).limit(20);
    // Una sola persona con ese final de celular: es ella. Si hay varias, desempata el nombre (si lo hay).
    const elegidos = candidatos.length === 1 ? candidatos : candidatos.filter((u) => beneficiario && mismaPersona(beneficiario, u.nombre));
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
