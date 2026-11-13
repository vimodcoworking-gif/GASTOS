import makeWASocket, {
  Browsers,
  BufferJSON,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestWaWebVersion,
  initAuthCreds,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isLidUser,
  jidDecode,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  proto,
} from 'baileys';
import QRCode from 'qrcode';
import { SesionWa, Usuario, Movimiento, MensajeBot } from './models.js';
import { responder, estadoDeCuenta, conversar, ejecutarAcciones, librosDe, libroActivo, textoMenu, registrarVarios, hoyLocal, leerCorreccion, editarMovimiento, anularMovimiento } from './bot.js';
import { iaDisponible, leerComprobante, transcribir, transcripcionDisponible, explicarError } from './ia.js';
import { comprobarLicencia } from './licencias.js';

// Estado visible para el panel del administrador.
export const wa = { estado: 'desconectado', qr: null, numero: null, aviso: '' };

let socket = null;
let reintento = null;
// Mensajes enviados por el bot: al usar la cuenta del administrador, sus propias respuestas
// vuelven como mensajes «míos» y hay que reconocerlas para no contestarse a sí mismo.
const enviados = new Set();
const ultimoMensaje = new Map();

const silencio = { level: 'silent', child: () => silencio, trace() {}, debug() {}, info() {}, warn() {}, error() {} };
const numeroDe = (jid) => jidDecode(jid)?.user?.replace(/\D/g, '') ?? '';

// ---------- sesión guardada en MongoDB ----------

async function sesionEnMongo() {
  const leer = async (id) => {
    const doc = await SesionWa.findById(id).lean();
    return doc ? JSON.parse(doc.datos, BufferJSON.reviver) : null;
  };
  const escribir = (id, valor) => SesionWa.findByIdAndUpdate(id, { datos: JSON.stringify(valor, BufferJSON.replacer) }, { upsert: true });

  const creds = (await leer('creds')) ?? initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (tipo, ids) => {
          const docs = await SesionWa.find({ _id: { $in: ids.map((id) => `${tipo}-${id}`) } }).lean();
          const porId = new Map(docs.map((d) => [d._id, JSON.parse(d.datos, BufferJSON.reviver)]));
          const resultado = {};
          for (const id of ids) {
            let valor = porId.get(`${tipo}-${id}`);
            if (valor && tipo === 'app-state-sync-key') valor = proto.Message.AppStateSyncKeyData.fromObject(valor);
            if (valor) resultado[id] = valor;
          }
          return resultado;
        },
        set: async (datos) => {
          const operaciones = [];
          for (const [tipo, valores] of Object.entries(datos)) {
            for (const [id, valor] of Object.entries(valores)) {
              const _id = `${tipo}-${id}`;
              operaciones.push(
                valor
                  ? { updateOne: { filter: { _id }, update: { datos: JSON.stringify(valor, BufferJSON.replacer) }, upsert: true } }
                  : { deleteOne: { filter: { _id } } },
              );
            }
          }
          if (operaciones.length) await SesionWa.bulkWrite(operaciones, { ordered: false });
        },
      },
    },
    guardarCredenciales: () => escribir('creds', creds),
  };
}

// La sesión se mantiene en memoria entre reconexiones: justo después de escanear el QR, WhatsApp
// obliga a reabrir la conexión, y releerla de la base podría devolver una copia aún sin guardar.
let sesion = null;

async function borrarSesion() {
  sesion = null;
  await SesionWa.deleteMany({});
}

// WhatsApp rechaza la vinculación de clientes que se presentan con una versión antigua de WhatsApp Web,
// así que se consulta la vigente (y se recuerda unas horas). Si falla, se usa la que trae la librería.
let versionWeb = { hasta: 0, version: undefined };
async function versionActual() {
  if (Date.now() < versionWeb.hasta) return versionWeb.version;
  try {
    const { version } = await fetchLatestWaWebVersion();
    if (Array.isArray(version)) versionWeb = { hasta: Date.now() + 6 * 60 * 60 * 1000, version };
  } catch {
    // Sin acceso a la versión vigente: se sigue con la última conocida.
  }
  return versionWeb.version;
}

// ---------- conexión ----------

function cerrarSocket() {
  clearTimeout(reintento);
  socket?.ev.removeAllListeners();
  try {
    socket?.end(undefined);
  } catch {
    // Ya estaba cerrado.
  }
  socket = null;
}

export async function conectarWhatsapp() {
  if (socket) return;
  wa.estado = 'conectando';
  wa.aviso = '';
  sesion ??= await sesionEnMongo();
  const { state, guardarCredenciales } = sesion;
  const version = await versionActual();
  // Otra llamada pudo crear la conexión mientras se esperaba.
  if (socket) return;

  socket = makeWASocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, silencio) },
    ...(version && { version }),
    logger: silencio,
    browser: Browsers.ubuntu('Chrome'),
    // El teléfono sigue recibiendo notificaciones y no se descarga el historial de chats.
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    // Grupos, estados y canales no se leen: así no se guardan sus claves de cifrado en la base.
    shouldIgnoreJid: (jid) => isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid),
  });
  const actual = socket;

  actual.ev.on('creds.update', guardarCredenciales);

  actual.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (actual !== socket) return;
    if (qr) {
      wa.estado = 'esperando_qr';
      wa.qr = await QRCode.toDataURL(qr, { margin: 2, width: 320 });
    }
    if (connection === 'open') {
      wa.estado = 'conectado';
      wa.qr = null;
      wa.aviso = '';
      wa.numero = numeroDe(actual.user?.id);
      console.log(`WhatsApp conectado como ${wa.numero}`);
    }
    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      const vinculada = Boolean(state.creds.me);
      console.log(`WhatsApp: conexión cerrada (código ${codigo ?? 'desconocido'}, ${vinculada ? 'con' : 'sin'} sesión vinculada)`);
      cerrarSocket();
      wa.qr = null;
      wa.numero = null;

      if (codigo === DisconnectReason.loggedOut) {
        await borrarSesion();
        wa.estado = 'desconectado';
        wa.aviso = 'WhatsApp cerró la sesión (desde el teléfono o por rechazar la vinculación). Vuelve a conectar y escanea el código.';
        return;
      }
      // Antes de reabrir se asegura que la sesión recién creada queda guardada.
      if (vinculada) await guardarCredenciales().catch((err) => console.error('WhatsApp: no se pudo guardar la sesión:', err.message));

      if (codigo === DisconnectReason.connectionReplaced) {
        // Otra copia del servidor abrió la misma sesión (pasa durante un despliegue): no se compite con ella.
        wa.estado = 'desconectado';
        wa.aviso = 'La sesión se abrió desde otra instancia del servidor. Pulsa «Conectar» si el bot no responde.';
      } else if (codigo === DisconnectReason.restartRequired || vinculada) {
        // Tras escanear el QR WhatsApp pide reiniciar la conexión; con sesión vinculada se reintenta siempre.
        wa.estado = 'conectando';
        reintento = setTimeout(() => conectarWhatsapp().catch((err) => console.error('WhatsApp:', err.message)), codigo === DisconnectReason.restartRequired ? 1000 : 5000);
      } else {
        // QR sin escanear: se descarta la sesión a medias para empezar limpio la próxima vez.
        await borrarSesion();
        wa.estado = 'desconectado';
        wa.aviso = 'El código QR caducó sin escanearse. Pulsa «Conectar» para generar otro.';
      }
    }
  });

  actual.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const mensaje of messages) atender(actual, mensaje).catch((err) => console.error('WhatsApp (mensaje):', err.message));
  });
}

// Cierra la sesión en WhatsApp (el dispositivo desaparece del teléfono) y borra lo guardado.
export async function desconectarWhatsapp() {
  try {
    await socket?.logout();
  } catch {
    // Sin conexión: basta con borrar la sesión local.
  }
  cerrarSocket();
  await borrarSesion();
  Object.assign(wa, { estado: 'desconectado', qr: null, numero: null, aviso: '' });
}

// Al arrancar el servidor: si ya se escaneó el QR en otra ocasión, se reconecta solo.
export async function reanudarWhatsapp() {
  const guardada = await SesionWa.findById('creds').lean();
  if (!guardada) return;
  // Solo cuenta una sesión que llegó a vincularse; una a medias (QR sin escanear) se descarta.
  if (JSON.parse(guardada.datos, BufferJSON.reviver)?.me) await conectarWhatsapp();
  else await borrarSesion();
}

export function pararWhatsapp() {
  cerrarSocket();
}

// ---------- envío ----------

// Últimos mensajes que el bot mandó a cada chat mientras atendía a la persona.
const enviadosA = new Map();

async function enviar(jid, contenido, { deLaConversacion = true } = {}) {
  const enviado = await socket.sendMessage(jid, contenido);
  const id = enviado?.key?.id;
  if (id) {
    enviados.add(id);
    // No hace falta recordarlos mucho tiempo: el eco llega en segundos.
    setTimeout(() => enviados.delete(id), 5 * 60 * 1000);
    if (deLaConversacion) enviadosA.set(jid, [...(enviadosA.get(jid) ?? []), { id, cuando: Date.now() }].slice(-20));
  }
  return id;
}

/** Recuerda qué movimientos confirma un mensaje del bot: al responderle, se corrigen esos. */
async function vincularMensajes(ids, usuario, movimientos) {
  if (!ids.length || !movimientos.length) return;
  await MensajeBot.bulkWrite(ids.map((id) => ({
    updateOne: { filter: { _id: id }, update: { $set: { usuario: usuario._id, movimientos, cuando: new Date() } }, upsert: true },
  }))).catch((err) => console.error('WhatsApp (vincular mensaje):', err.message));
}

async function enviarRespuesta(jid, respuesta, opciones) {
  if (respuesta.pdf) {
    return enviar(jid, { document: respuesta.pdf.buffer, mimetype: 'application/pdf', fileName: respuesta.pdf.nombre, caption: respuesta.texto }, opciones);
  }
  return enviar(jid, { text: respuesta.texto }, opciones);
}

export const whatsappConectado = () => wa.estado === 'conectado';

// Envía un texto (y opcionalmente un PDF) a un número con código de país. Con «movimientos» (ids),
// el mensaje queda vinculado a ellos para poder corregirlos respondiéndole.
export async function enviarANumero(numero, respuesta, { movimientos = [] } = {}) {
  if (!whatsappConectado()) throw new Error('WhatsApp no está conectado');
  const [destino] = await socket.onWhatsApp(numero);
  if (!destino?.exists) throw new Error('Ese número no tiene WhatsApp');
  const id = await enviarRespuesta(destino.jid, respuesta, { deLaConversacion: false });
  if (id && movimientos.length) {
    const usuario = await Usuario.findOne({ whatsapp: numero }).select('_id');
    if (usuario) await vincularMensajes([id], usuario, movimientos);
  }
}

// Envía el estado de cuenta a un usuario por iniciativa del administrador.
export async function enviarEstadoDeCuenta(usuario) {
  if (wa.estado !== 'conectado') throw new Error('WhatsApp no está conectado');
  if (!usuario.whatsapp) throw new Error(`${usuario.nombre} no tiene número de WhatsApp`);
  const texto = await estadoDeCuenta(usuario);
  if (!texto) throw new Error(`${usuario.nombre} no tiene ningún libro`);
  const [destino] = await socket.onWhatsApp(usuario.whatsapp);
  if (!destino?.exists) throw new Error(`El número de ${usuario.nombre} no tiene WhatsApp`);
  await enviar(destino.jid, { text: texto });
}

// ---------- mensajes entrantes ----------

// Número de teléfono de quien escribe. WhatsApp identifica a veces los chats con un «LID»
// en lugar del número; en ese caso el número llega en remoteJidAlt o hay que resolverlo.
async function numeroDelChat(sock, clave) {
  const jid = clave.remoteJid;
  if (!isLidUser(jid)) return numeroDe(jid);
  if (clave.remoteJidAlt && !isLidUser(clave.remoteJidAlt)) return numeroDe(clave.remoteJidAlt);
  const pn = await sock.signalRepository?.lidMapping?.getPNForLID(jid).catch(() => null);
  return pn ? numeroDe(pn) : '';
}

function esMiPropioChat(sock, jid) {
  const chat = jidNormalizedUser(jid);
  return chat === jidNormalizedUser(sock.user?.id) || (sock.user?.lid && chat === jidNormalizedUser(sock.user.lid));
}

// El contenido real del mensaje: WhatsApp envuelve a veces el mensaje (mensajes temporales, «ver una vez»,
// documentos con texto).
function contenidoDe(mensaje) {
  let m = mensaje.message ?? {};
  for (let i = 0; i < 3; i += 1) {
    const dentro = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message ?? m.documentWithCaptionMessage?.message;
    if (!dentro) break;
    m = dentro;
  }
  return m;
}

// Foto, audio o documento que trae el mensaje, o null. «texto» es lo que se escribió junto al archivo.
function archivoDe(m) {
  if (m.imageMessage) return { tipo: 'imagen', mime: m.imageMessage.mimetype || 'image/jpeg', texto: m.imageMessage.caption ?? '', tamano: Number(m.imageMessage.fileLength ?? 0) };
  if (m.audioMessage) return { tipo: 'audio', mime: m.audioMessage.mimetype || 'audio/ogg', texto: '', tamano: Number(m.audioMessage.fileLength ?? 0) };
  if (m.documentMessage) {
    const d = m.documentMessage;
    const mime = d.mimetype || '';
    const nombre = d.fileName || '';
    const tipo = mime === 'application/pdf' || /\.pdf$/i.test(nombre) ? 'pdf'
      : /^image\/(jpeg|png|webp|gif)$/.test(mime) ? 'imagen'
      : /^audio\//.test(mime) ? 'audio'
      : /^text\/|csv/.test(mime) || /\.(txt|csv)$/i.test(nombre) ? 'texto'
      : 'otro';
    return { tipo, mime, nombre, texto: d.caption ?? '', tamano: Number(d.fileLength ?? 0) };
  }
  return null;
}

const MAX_ARCHIVO = 15 * 1024 * 1024;

// Cada persona tiene su propia cola: si manda varias fotos seguidas, se leen una tras otra, sin perder ninguna.
const colas = new Map();
function enCola(numero, tarea) {
  const anterior = colas.get(numero) ?? Promise.resolve();
  const siguiente = anterior.catch(() => {}).then(tarea);
  colas.set(numero, siguiente);
  siguiente.finally(() => colas.get(numero) === siguiente && colas.delete(numero)).catch(() => {});
  return siguiente;
}

async function atender(sock, mensaje) {
  const { key } = mensaje;
  const jid = key.remoteJid;
  if (!jid || !mensaje.message || isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid)) return;
  if (enviados.has(key.id)) return;

  const contenido = contenidoDe(mensaje);
  const archivo = archivoDe(contenido);
  // Mensaje al que responde (deslizar o «Responder» en WhatsApp).
  const citado = [contenido.extendedTextMessage, contenido.audioMessage, contenido.imageMessage, contenido.documentMessage]
    .map((m) => m?.contextInfo?.stanzaId).find(Boolean);
  const texto = (contenido.conversation ?? contenido.extendedTextMessage?.text ?? '').trim();
  if (!archivo && (!texto || texto.length > 4000)) return;
  // Al reconectar pueden llegar mensajes atrasados: no se contestan los de hace más de dos minutos.
  if (Date.now() / 1000 - Number(mensaje.messageTimestamp ?? 0) > 120) return;

  // Lo que el administrador escribe a otras personas no es para el bot; solo su chat consigo mismo.
  let numero;
  if (key.fromMe) {
    if (!esMiPropioChat(sock, jid)) return;
    numero = numeroDe(sock.user.id);
  } else {
    numero = await numeroDelChat(sock, key);
  }
  if (!numero) return;

  // Solo se responde a números registrados en la app: el resto de contactos no nota nada.
  const usuario = await Usuario.findOne({ whatsapp: numero });
  if (!usuario) return;
  // Sin licencia de VIMOD vigente, el bot no atiende a esa cuenta.
  const licencia = await comprobarLicencia(usuario);
  if (!licencia.ok) return;

  if (!archivo) {
    // Freno sencillo contra ráfagas de texto: un mensaje por segundo y usuario.
    const ahora = Date.now();
    if (ahora - (ultimoMensaje.get(numero) ?? 0) < 1000) return;
    ultimoMensaje.set(numero, ahora);
  }

  return enCola(numero, async () => {
    // «Escribiendo…» aparece al momento, sin esperar a tener lista la respuesta.
    sock.sendPresenceUpdate('composing', jid).catch(() => {});
    const inicio = Date.now();
    const citados = citado ? (await MensajeBot.findOne({ _id: citado, usuario: usuario._id }).lean())?.movimientos ?? [] : [];
    try {
      if (archivo) await atenderArchivo(sock, jid, usuario, mensaje, archivo, { citados });
      else await atenderTexto(jid, usuario, texto, { citados, respondeAlBot: Boolean(citado) });
    } finally {
      // Las respuestas de esta vuelta quedan vinculadas a lo que se registró o corrigió en ella.
      const respuestas = (enviadosA.get(jid) ?? []).filter((e) => e.cuando >= inicio).map((e) => e.id);
      const nuevos = await Movimiento.find({ creadoPor: usuario._id, createdAt: { $gte: new Date(inicio) } }).select('_id').lean().catch(() => []);
      await vincularMensajes(respuestas, usuario, [...nuevos.map((m) => m._id), ...citados]);
    }
  });
}

/** Corrige o anula los movimientos del mensaje citado. Devuelve true si lo resolvió sin la IA. */
async function corregirCitados(jid, usuario, texto, citados) {
  const correccion = leerCorreccion(texto, hoyLocal());
  // Con varios movimientos en el mensaje, un cambio sin decir cuál («son 30») lo resuelve la IA.
  if (!correccion || (!correccion.borrar && citados.length > 1)) return false;
  const textos = [];
  for (const id of citados.slice(0, 30)) textos.push(correccion.borrar ? await anularMovimiento(usuario, id) : await editarMovimiento(usuario, id, correccion.cambios));
  await enviar(jid, { text: textos.join('\n\n') });
  return true;
}

/** Responde a un texto (escrito o sacado de un audio). Con «forzarIa» se habla con la IA aunque no empiece por «ia». */
async function atenderTexto(jid, usuario, texto, { forzarIa = false, citados = [], respondeAlBot = false } = {}) {
  const ia = await iaDisponible();
  // Respuesta a una confirmación: «anúlalo», «era gasto», «son 30»… sobre esos movimientos.
  if (citados.length) {
    if (await corregirCitados(jid, usuario, texto, citados)) return;
    if (ia.disponible) {
      const respuesta = await conversar(usuario, texto, { citados });
      if (respuesta) {
        const { textos, pdfs } = await ejecutarAcciones(usuario, respuesta.acciones);
        const mensaje = [respuesta.texto, ...textos].filter(Boolean).join('\n\n');
        if (mensaje) await enviar(jid, { text: mensaje });
        for (const informe of pdfs) await enviarRespuesta(jid, informe);
        return;
      }
    }
    return enviar(jid, { text: 'Para corregirlo dime, por ejemplo: «era ingreso», «son 30», «fue ayer», «pendiente» o «anúlalo».' });
  }
  // Responde a un mensaje del bot que no confirma ningún movimiento: se le habla a la IA sin pedir «ia».
  if (respondeAlBot) forzarIa = true;
  const comando = await responder(usuario, texto, { conIa: ia.disponible });
  if (comando) return enviarRespuesta(jid, comando);

  // No es un comando. A la IA se le habla empezando por «ia» o «bot», salvo que esté puesta a responder todo.
  const conPrefijo = /^(ia|bot)\b[\s,:]*/i.exec(texto);
  if (!conPrefijo && !ia.responderTodo && !forzarIa) return;
  const pregunta = conPrefijo ? texto.slice(conPrefijo[0].length).trim() : texto;

  if (ia.disponible && pregunta) {
    const respuesta = await conversar(usuario, pregunta);
    if (respuesta) {
      // Lo que la IA propone hacer (registrar, PDF, deshacer) se valida y ejecuta aquí, no en el modelo.
      const { textos, pdfs } = await ejecutarAcciones(usuario, respuesta.acciones);
      const mensaje = [respuesta.texto, ...textos].filter(Boolean).join('\n\n');
      if (mensaje) await enviar(jid, { text: mensaje });
      for (const informe of pdfs) await enviarRespuesta(jid, informe);
      return;
    }
  }
  if (forzarIa) return enviar(jid, { text: 'No supe qué hacer con eso. Dime, por ejemplo: *gasté 30 en taxi*, o escribe *menu*.' });
  // Se dirigió al bot pero no hay IA (o no escribió nada tras «ia»): se le muestra el menú.
  if (conPrefijo) {
    const [libro] = await librosDe(usuario);
    if (libro) await enviar(jid, { text: textoMenu(usuario, libro, ia.disponible) });
  }
}

// Texto de un PDF (para la IA de NVIDIA, que no abre PDF). Se carga solo al usarlo.
async function textoDePdf(buffer) {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text ?? '').replace(/[ \t]+/g, ' ').trim();
  } catch (err) {
    console.error('WhatsApp (PDF):', err.message);
    return '';
  }
}

/** Foto, PDF o audio: se lee con la IA (o se transcribe) y se registran los movimientos que haya. */
async function atenderArchivo(sock, jid, usuario, mensaje, archivo, { citados = [] } = {}) {
  const responderTexto = (text) => enviar(jid, { text });
  if (archivo.tipo === 'otro') return responderTexto('Ese tipo de archivo no lo puedo leer. Mándame una *foto* (boleta, voucher, captura de Yape), un *PDF* o un *audio*.');
  if (archivo.tamano > MAX_ARCHIVO) return responderTexto('El archivo es demasiado grande (máximo 15 MB).');

  const ia = await iaDisponible();
  if (archivo.tipo === 'audio' && !transcripcionDisponible()) {
    return responderTexto('Todavía no puedo escuchar audios: el administrador debe añadir la clave *GROQ_API_KEY* en el servidor. Mientras tanto, escríbeme el gasto (por ejemplo *gasté 30 en taxi*).');
  }
  if (archivo.tipo !== 'audio' && !ia.disponible) {
    return responderTexto('Para leer fotos y PDF hace falta tener activada la IA (Admin → IA). Mientras tanto, escríbeme el gasto (por ejemplo *gasté 30 en taxi*).');
  }

  let buffer;
  try {
    buffer = await downloadMediaMessage(mensaje, 'buffer', {}, { logger: silencio, reuploadRequest: sock.updateMediaMessage });
  } catch (err) {
    console.error('WhatsApp (descarga):', err.message);
    return responderTexto('No pude descargar el archivo. Vuelve a enviarlo, por favor.');
  }
  if (!buffer?.length) return responderTexto('El archivo llegó vacío. Vuelve a enviarlo, por favor.');
  if (buffer.length > MAX_ARCHIVO) return responderTexto('El archivo es demasiado grande (máximo 15 MB).');

  try {
    if (archivo.tipo === 'audio') {
      const dicho = await transcribir(buffer, archivo.mime);
      if (!dicho) return responderTexto('No entendí el audio. ¿Puedes repetirlo o escribírmelo?');
      await responderTexto(`🎙️ Entendí: «${dicho}»`);
      return atenderTexto(jid, usuario, dicho, { forzarIa: true, citados });
    }

    const entrada = archivo.tipo === 'imagen'
      ? { imagen: { base64: buffer.toString('base64'), mime: archivo.mime.split(';')[0] } }
      : archivo.tipo === 'pdf'
        ? { pdf: { base64: buffer.toString('base64'), texto: await textoDePdf(buffer) } }
        : { texto: buffer.toString('utf8') };
    const libros = await librosDe(usuario);
    const libro = libroActivo(usuario, libros);
    if (!libro) return responderTexto('Todavía no tienes ningún libro. Entra en la app y crea uno.');
    const lectura = await leerComprobante(entrada, { hoy: hoyLocal(), moneda: libro.moneda, titular: usuario.nombre, mensaje: archivo.texto });
    if (!lectura) return responderTexto('La IA no está disponible ahora mismo. Escríbeme el gasto, por ejemplo *gasté 30 en taxi*.');
    if (!lectura.movimientos.length) return responderTexto(lectura.nota || 'No encontré ningún pago ni ingreso en ese archivo. Si es un gasto, escríbemelo (por ejemplo *gasté 30 en taxi*).');
    const origen = archivo.tipo === 'pdf' ? 'desde tu PDF' : archivo.tipo === 'imagen' ? 'desde tu foto' : 'desde tu archivo';
    const resultado = await registrarVarios(usuario, lectura.movimientos, { origen });
    return responderTexto(`${resultado}${lectura.nota ? `\n\n📝 ${lectura.nota}` : ''}`);
  } catch (err) {
    console.error(`WhatsApp (${archivo.tipo}):`, err.message);
    const motivo = err.message?.startsWith('El servicio de audio') ? err.message : explicarError(err);
    return responderTexto(`No pude leer ${archivo.tipo === 'audio' ? 'el audio' : 'el archivo'}. Motivo: ${motivo}\nMientras tanto, escríbeme el gasto (por ejemplo *gasté 30 en taxi*).`);
  }
}
