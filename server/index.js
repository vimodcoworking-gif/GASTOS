import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { config } from './config.js';
import { conectar, desconectar, estadoBd } from './db.js';
import { rutasAuth, requiereSesion, requiereAdmin } from './auth.js';
import { rutasAdmin } from './admin.js';
import { rutasApi } from './routes.js';
import { manejarErrores } from './errores.js';
import { reanudarWhatsapp, pararWhatsapp } from './whatsapp.js';
import { rutasGoogle, iniciarRevisionGmail, pararRevisionGmail } from './google.js';
import { prepararLicencias } from './licencias.js';
import { rutasAvisos } from './avisos.js';
import { iniciarRecordatorios } from './recordatorios.js';
import { rutasPush, prepararPush } from './push.js';
import { compactarUnaVez, iniciarMantenimiento } from './mantenimiento.js';
import { separarRegistrosUnidos, completarMedios, corregirMediosBilletera, corregirYapeosEnviados } from './bot.js';
import { Ajuste } from './models.js';

const publico = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const app = express();
app.disable('x-powered-by');
// En el hosting la app va detrás de un proxy: sin esto el límite de intentos vería a todos con la misma IP.
if (config.produccion) app.set('trust proxy', 1);
// Sin upgrade-insecure-requests para que funcione por http en la red local.
app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
// Respuestas comprimidas: la interfaz y los listados viajan en una fracción de su tamaño.
app.use(compression());
// Avisos del teléfono (Yape, Plin, capturas): lee su propio cuerpo, que puede ser una imagen.
app.use('/api/avisos', rutasAvisos);
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

// Sin base de datos la página sigue abriendo y la API explica qué pasa.
app.use('/api', (req, res, next) => {
  if (estadoBd.lista) return next();
  res.status(503).json({ error: `Sin conexión con la base de datos. ${estadoBd.causa}` });
});
app.use('/api/auth/google', rutasGoogle);
app.use('/api/auth', rutasAuth);
app.use('/api/admin', requiereSesion, requiereAdmin, rutasAdmin);
app.use('/api/push', requiereSesion, rutasPush);
app.use('/api', requiereSesion, rutasApi);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(express.static(publico, {
  // «/privacidad» y «/terminos» sirven privacidad.html y terminos.html.
  extensions: ['html'],
  setHeaders(res, ruta) {
    // Los iconos no cambian: el navegador puede guardarlos una semana sin volver a preguntar.
    if (ruta.includes(`${path.sep}icons${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=604800');
  },
}));
app.use(manejarErrores);

// Primero se abre el puerto (el hosting lo exige para dar el servicio por arrancado) y luego la base.
const servidor = app.listen(config.puerto, () => {
  console.log(`Registro de gastos escuchando en http://localhost:${config.puerto}`);
});
prepararLicencias();
conectar()
  .catch((err) => {
    estadoBd.causa = 'No se pudo iniciar la base de datos local.';
    console.error('No se pudo iniciar MongoDB:', err.message);
  })
  // Si el bot de WhatsApp ya estaba vinculado, se reconecta solo con la sesión guardada.
  .then(() => {
    if (!estadoBd.lista) return;
    // Correcciones de datos que se hacen una sola vez (quedan anotadas en Ajuste).
    corregirUnaVez('correccion:registros-unidos', separarRegistrosUnidos).then(() => corregirUnaVez('correccion:medios-de-pago-2', completarMedios))
      .then(() => corregirUnaVez('correccion:medios-yape-plin', corregirMediosBilletera))
      .then(() => corregirUnaVez('correccion:yapeos-enviados', corregirYapeosEnviados))
      .then(() => corregirUnaVez('mantenimiento:compactar-v1', compactarUnaVez));
    iniciarMantenimiento();
    // Revisión periódica del Gmail de quienes lo vincularon, para registrar sus gastos.
    iniciarRevisionGmail();
    // Recordatorios por WhatsApp de los pagos que vencen pronto.
    iniciarRecordatorios();
    prepararPush();
    return reanudarWhatsapp();
  })
  .catch((err) => console.error('No se pudo reanudar WhatsApp:', err.message));

async function corregirUnaVez(id, correccion) {
  try {
    if (await Ajuste.exists({ _id: id })) return;
    console.log(`Corrección «${id}»: empezando.`);
    const cuantos = await correccion();
    await Ajuste.updateOne({ _id: id }, { $set: { valor: new Date() } }, { upsert: true });
    console.log(`Corrección «${id}»: ${cuantos} registros arreglados.`);
  } catch (err) {
    console.error(`Corrección «${id}»:`, err.message);
  }
}

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, async () => {
    servidor.close();
    pararWhatsapp();
    pararRevisionGmail();
    await desconectar();
    process.exit(0);
  });
}
