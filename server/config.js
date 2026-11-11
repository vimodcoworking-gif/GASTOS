import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan los valores por defecto.
}

// La clave de sesión debe sobrevivir a los reinicios, así que se guarda en .env la primera vez.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  appendFileSync('.env', `\nJWT_SECRET=${process.env.JWT_SECRET}\n`);
}

// La conexión se puede dar entera (MONGODB_URI) o por partes (usuario, contraseña, servidor).
function uriDeMongo() {
  const dato = (nombre) => process.env[nombre]?.trim() || '';
  if (dato('MONGODB_URI')) return dato('MONGODB_URI');

  const host = dato('MONGODB_HOST').replace(/^mongodb(\+srv)?:\/\//, '').replace(/\/.*$/, '');
  if (!host) return '';
  // Atlas usa nombres tipo cluster0.xxxxx.mongodb.net (srv); un servidor con puerto o local, no.
  const local = host.includes(':') || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(host);
  const usuario = dato('MONGODB_USER');
  // encodeURIComponent permite contraseñas con símbolos como @ : / #
  const acceso = usuario ? `${encodeURIComponent(usuario)}:${encodeURIComponent(dato('MONGODB_PASSWORD'))}@` : '';
  const base = dato('MONGODB_DB') || 'gastos';
  return `${local ? 'mongodb' : 'mongodb+srv'}://${acceso}${host}/${base}?retryWrites=true&w=majority`;
}

export const config = {
  puerto: Number(process.env.PORT) || 3000,
  mongoUri: uriDeMongo(),
  jwtSecret: process.env.JWT_SECRET,
  // Correos con acceso al panel de administrador. Si está vacío, lo es la primera cuenta registrada.
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  // Espacio contratado en MongoDB; 512 MB es el plan gratuito de Atlas.
  almacenamientoMb: Number(process.env.ALMACENAMIENTO_MB) || 512,
  // Zona horaria para decidir qué día es «hoy» en los informes del bot.
  zona: process.env.ZONA_HORARIA?.trim() || 'America/Lima',
  // Clave de la API de Claude. Si no está aquí, el administrador puede guardarla desde el panel.
  claveIa: process.env.ANTHROPIC_API_KEY?.trim() || '',
  // Clave de la API de NVIDIA (build.nvidia.com), la alternativa a Claude para la IA del bot.
  claveNvidia: process.env.NVIDIA_API_KEY?.trim() || '',
  // Envío de correo: clave de Brevo (por HTTPS) o un servidor SMTP. Hace falta el remitente en ambos casos.
  correo: {
    remitente: process.env.CORREO_REMITENTE?.trim() || '',
    nombreRemitente: process.env.CORREO_NOMBRE?.trim() || 'N.F.T.A Gastos',
    cuentaCloudflare: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || '',
    tokenCloudflare: process.env.CLOUDFLARE_EMAIL_TOKEN?.trim() || '',
    claveBrevo: process.env.BREVO_API_KEY?.trim() || '',
    smtpHost: process.env.SMTP_HOST?.trim() || '',
    smtpPuerto: Number(process.env.SMTP_PORT) || 587,
    smtpUsuario: process.env.SMTP_USER?.trim() || '',
    smtpClave: process.env.SMTP_PASS || '',
  },
  // Acceso con Google y lectura de Gmail (Google Cloud Console → Credenciales → ID de cliente OAuth).
  google: {
    clienteId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
    secreto: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
  },
  // Dirección pública de la app (https://…), para la vuelta desde Google. Si falta, se deduce de la petición.
  urlPublica: (process.env.APP_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || '').replace(/\/+$/, ''),
  // Cada cuántos minutos se revisa el Gmail de quienes lo vincularon.
  minutosGmail: Math.max(2, Number(process.env.GMAIL_MINUTOS) || 10),
  produccion: process.env.NODE_ENV === 'production',
  // Licencias de VIMOD: la base del Panel administrador y el software de esta app en su catálogo
  // (su nombre tal como aparece en «Softwares y planes», o su id).
  // Sin VIMOD_MONGODB_URI la app no pide licencia.
  vimod: {
    uri: process.env.VIMOD_MONGODB_URI?.trim() || '',
    db: process.env.VIMOD_MONGODB_DB?.trim() || 'vimod',
    software: process.env.VIMOD_SOFTWARE?.trim() || '',
    // Correos que entran sin licencia (cuentas propias), separados por comas.
    libres: (process.env.LICENCIA_LIBRE || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  },
};
