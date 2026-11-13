import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// Una cuenta de Gmail vinculada para leer sus avisos de compras y pagos.
const cuentaGmail = () => ({
  email: String,
  // Nombre de la cuenta de Google, para reconocer transferencias a sus propias cuentas.
  nombre: String,
  // Token de actualización de Google, cifrado; con él se piden accesos nuevos sin volver a preguntar.
  token: String,
  activo: { type: Boolean, default: false },
  // Solo se leen correos recibidos desde este momento.
  desde: Date,
  ultimaRevision: Date,
  registrados: { type: Number, default: 0 },
  error: String,
  // Último escaneo de correos anteriores (pedido desde la app o el chat).
  escaneo: {
    estado: { type: String, enum: ['en curso', 'terminado', 'error'] },
    desde: Date,
    hasta: Date,
    revisados: Number,
    registrados: Number,
    duplicados: Number,
    // Correos del periodo que ya se habían revisado antes (por la revisión automática o otro escaneo).
    yaVistos: Number,
    // Se volvieron a leer los avisos ya vistos sin movimiento (escaneos cortos pedidos a mano).
    releido: Boolean,
    // Avance de la tanda en curso: cuántos avisos tiene y cuántos se han leído ya.
    porLeer: Number,
    leidos: Number,
    // Había más correos de los que se revisaron en esa vuelta.
    quedan: Boolean,
    inicio: Date,
    fin: Date,
    error: String,
  },
});

const usuarioSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    // Falta en las cuentas creadas con Google hasta que la persona se ponga una contraseña.
    passwordHash: String,
    // Cuenta dada de alta por el administrador: usa su licencia de VIMOD en vez de una propia.
    altaAdmin: { type: Boolean, default: false },
    // Identificador de la cuenta de Google vinculada («sub»), para poder entrar con ella.
    googleId: String,
    // Lectura de Gmail para registrar solos los gastos que llegan por correo (bancos, tiendas, apps).
    // «gmail» es la primera cuenta vinculada; «gmailExtra», las demás que se añadan.
    gmail: cuentaGmail(),
    gmailExtra: [new Schema(cuentaGmail())],
    // Solo dígitos con código de país (51987654321). El bot lo usa para saber quién escribe y a quién enviar.
    whatsapp: { type: String, match: /^\d{10,15}$/ },
    // Enlace personal para que el teléfono reenvíe los avisos de Yape, Plin o del banco (y capturas).
    tokenAvisos: String,
    // Recordatorios por WhatsApp de los pagos pendientes: cuántos días antes (0 = no avisar antes)
    // y si se avisa también el mismo día del vencimiento.
    recordatorio: {
      dias: { type: Number, min: 0, max: 7, default: 2 },
      mismoDia: { type: Boolean, default: true },
    },
    // Libro sobre el que responde el bot; si falta, el primero del usuario.
    libroBot: { type: ObjectId, ref: 'Libro' },
    // Recuperación de contraseña: huella del código enviado, su caducidad y los intentos fallidos.
    codigoHash: String,
    codigoExpira: Date,
    codigoIntentos: { type: Number, default: 0 },
  },
  { timestamps: true },
);
usuarioSchema.index({ whatsapp: 1 }, { unique: true, sparse: true });
usuarioSchema.index({ googleId: 1 }, { unique: true, sparse: true });
usuarioSchema.index({ tokenAvisos: 1 }, { unique: true, sparse: true });
usuarioSchema.index({ 'gmail.activo': 1 });
usuarioSchema.index({ 'gmailExtra.activo': 1 });

// Un "libro" agrupa movimientos. Cada usuario tiene los suyos y puede compartirlos.
const libroSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 60 },
    moneda: { type: String, required: true, default: 'PEN', match: /^[A-Z]{3}$/ },
    propietario: { type: ObjectId, ref: 'Usuario', required: true, index: true },
    miembros: [
      {
        _id: false,
        usuario: { type: ObjectId, ref: 'Usuario', required: true },
        rol: { type: String, enum: ['lector', 'editor'], default: 'lector' },
      },
    ],
    // Categorías propias del libro, con su color y un presupuesto mensual opcional.
    categorias: [
      {
        _id: false,
        nombre: { type: String, required: true, trim: true, maxlength: 40 },
        tipo: { type: String, enum: ['gasto', 'ingreso'], default: 'gasto' },
        color: { type: String, match: /^#[0-9a-f]{6}$/i },
        presupuesto: { type: Number, min: 0 },
      },
    ],
  },
  { timestamps: true },
);
libroSchema.index({ 'miembros.usuario': 1 });

const movimientoSchema = new Schema(
  {
    libro: { type: ObjectId, ref: 'Libro', required: true },
    tipo: { type: String, enum: ['gasto', 'ingreso'], required: true },
    descripcion: { type: String, required: true, trim: true, maxlength: 120 },
    categoria: { type: String, trim: true, maxlength: 40, default: 'General' },
    // Siempre en la moneda del libro, para que los totales cuadren.
    monto: { type: Number, required: true, min: 0.01 },
    // Si se cobró en otra moneda (p. ej. una compra en dólares en un libro en soles): la moneda
    // y el importe tal como se cobraron. «monto» guarda su equivalente con el tipo de cambio del día.
    moneda: { type: String, match: /^[A-Z]{3}$/ },
    montoOriginal: Number,
    // Fecha del movimiento o de vencimiento, siempre a medianoche UTC.
    fecha: { type: Date, required: true },
    pagado: { type: Boolean, default: false },
    fechaPago: Date,
    // Movimientos creados juntos con "repetir cada mes" comparten la misma serie.
    serie: { type: ObjectId },
    creadoPor: { type: ObjectId, ref: 'Usuario' },
    // Id del correo de Gmail del que salió, si se registró solo a partir de un correo.
    correoId: String,
    // Con qué se pagó o cobró, y la entidad (banco, billetera), si se sabe.
    medio: { type: String, enum: ['yape', 'plin', 'tarjeta', 'transferencia', 'efectivo', 'otro'] },
    entidad: { type: String, trim: true, maxlength: 40 },
    // Recordatorio por WhatsApp: días antes del vencimiento (-1 = sin recordatorio; sin valor = el ajuste
    // de la persona). «recordado» guarda qué avisos ya se mandaron («2026-11-20:3»), para no repetirlos.
    recordar: { type: Number, min: -1, max: 7 },
    // Huella de un pago leído de una lista con hora (captura de «Movimientos» de Yape, Plin o el banco):
    // «fecha|hora|tipo|monto». Sirve para no repetirlo si la misma lista se envía otra vez.
    huella: String,
    recordado: { type: [String], default: undefined },
  },
  // Solo la fecha de creación (la usan los avisos para no repetir); «updatedAt» ocupaba sitio sin uso.
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
// Índices: el principal (libro + fecha) para todo; los demás solo incluyen los movimientos que tienen
// ese dato (índices parciales), así ocupan poco aunque haya muchos clientes.
movimientoSchema.index({ libro: 1, fecha: 1 });
movimientoSchema.index({ fecha: 1 }, { name: 'pendientes_por_fecha', partialFilterExpression: { pagado: false } });
movimientoSchema.index({ libro: 1, huella: 1 }, { name: 'huella', partialFilterExpression: { huella: { $type: 'string' } } });
movimientoSchema.index({ libro: 1, serie: 1 }, { name: 'serie', partialFilterExpression: { serie: { $type: 'objectId' } } });
movimientoSchema.index({ correoId: 1 }, { name: 'correo', partialFilterExpression: { correoId: { $type: 'string' } } });

// Ajustes del administrador (IA, bot), uno por clave.
const ajusteSchema = new Schema({ _id: String, valor: Schema.Types.Mixed }, { timestamps: true });

// Sesión de WhatsApp (credenciales y claves de cifrado), para no tener que escanear el QR en cada reinicio.
const sesionWaSchema = new Schema({ _id: String, datos: String });

// Correos de Gmail ya revisados (fueran gasto o no), para no leerlos ni registrarlos dos veces.
// Se borran solos a los 45 días.
const correoVistoSchema = new Schema({ _id: String, visto: { type: Date, default: Date.now, expires: 45 * 24 * 3600 } });

export const CorreoVisto = model('CorreoVisto', correoVistoSchema);

// Qué se decidió con cada correo revisado, para poder averiguar por qué un aviso no se registró.
// Se borra solo a los 8 días (algo más que la semana que se revisa).
const correoRevisadoSchema = new Schema({
  _id: String,
  usuario: ObjectId,
  asunto: String,
  remitente: String,
  resultado: String,
  registrado: Boolean,
  // De qué Gmail vino: «principal» o el id de la cuenta añadida, y su dirección.
  cuenta: String,
  buzon: String,
  extracto: String,
  cuando: { type: Date, default: Date.now, expires: 8 * 24 * 3600 },
});
export const CorreoRevisado = model('CorreoRevisado', correoRevisadoSchema);

// Mensajes de WhatsApp del bot y los movimientos que confirman: al responder a uno se corrigen esos.
// Se borran solos a los 45 días.
const mensajeBotSchema = new Schema({
  _id: String,
  usuario: ObjectId,
  movimientos: [ObjectId],
  cuando: { type: Date, default: Date.now, expires: 45 * 24 * 3600 },
});
export const MensajeBot = model('MensajeBot', mensajeBotSchema);
export const Ajuste = model('Ajuste', ajusteSchema);
export const SesionWa = model('SesionWa', sesionWaSchema);
export const Usuario = model('Usuario', usuarioSchema);
export const Libro = model('Libro', libroSchema);
export const Movimiento = model('Movimiento', movimientoSchema);

// Metas de ahorro de un libro: cuánto se quiere juntar, para cuándo, y los aportes (o retiros, en negativo).
const metaSchema = new Schema(
  {
    libro: { type: ObjectId, ref: 'Libro', required: true, index: true },
    nombre: { type: String, required: true, trim: true, maxlength: 60 },
    objetivo: { type: Number, required: true, min: 0.01 },
    fechaLimite: Date,
    color: { type: String, match: /^#[0-9a-f]{6}$/i },
    icono: { type: String, maxlength: 20 },
    aportes: [
      {
        monto: { type: Number, required: true },
        fecha: { type: Date, default: Date.now },
        nota: { type: String, trim: true, maxlength: 80 },
        movimiento: { type: ObjectId, ref: 'Movimiento' },
      },
    ],
    creadoPor: { type: ObjectId, ref: 'Usuario' },
  },
  { timestamps: true },
);
export const Meta = model('Meta', metaSchema);

// Dispositivos con las notificaciones push activadas (uno por navegador o app instalada).
const suscripcionPushSchema = new Schema(
  {
    usuario: { type: ObjectId, ref: 'Usuario', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    dispositivo: String,
  },
  { timestamps: true },
);
export const SuscripcionPush = model('SuscripcionPush', suscripcionPushSchema);

// Últimos avisos que llegaron al enlace personal (atajo del iPhone, MacroDroid…) y qué pasó con cada uno,
// para ver en «Mi cuenta» si funciona. Se borran solos a los 7 días.
const avisoRecibidoSchema = new Schema({
  usuario: { type: ObjectId, required: true, index: true },
  origen: String,
  resultado: String,
  registrados: Number,
  ok: Boolean,
  cuando: { type: Date, default: Date.now, expires: 7 * 24 * 3600 },
}, { versionKey: false });
export const AvisoRecibido = model('AvisoRecibido', avisoRecibidoSchema);
