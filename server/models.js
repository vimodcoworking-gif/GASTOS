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
    fechaPago: { type: Date, default: null },
    // Movimientos creados juntos con "repetir cada mes" comparten la misma serie.
    serie: { type: ObjectId, default: null },
    creadoPor: { type: ObjectId, ref: 'Usuario' },
    // Id del correo de Gmail del que salió, si se registró solo a partir de un correo.
    correoId: String,
  },
  { timestamps: true },
);
movimientoSchema.index({ libro: 1, fecha: 1 });
movimientoSchema.index({ libro: 1, serie: 1 });
movimientoSchema.index({ correoId: 1 }, { sparse: true });

// Ajustes del administrador (IA, bot), uno por clave.
const ajusteSchema = new Schema({ _id: String, valor: Schema.Types.Mixed }, { timestamps: true });

// Sesión de WhatsApp (credenciales y claves de cifrado), para no tener que escanear el QR en cada reinicio.
const sesionWaSchema = new Schema({ _id: String, datos: String });

// Correos de Gmail ya revisados (fueran gasto o no), para no leerlos ni registrarlos dos veces.
// Se borran solos a los 60 días.
const correoVistoSchema = new Schema({ _id: String, visto: { type: Date, default: Date.now, expires: 60 * 24 * 3600 } });

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
export const Ajuste = model('Ajuste', ajusteSchema);
export const SesionWa = model('SesionWa', sesionWaSchema);
export const Usuario = model('Usuario', usuarioSchema);
export const Libro = model('Libro', libroSchema);
export const Movimiento = model('Movimiento', movimientoSchema);
