import { mkdirSync } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from './config.js';

const REINTENTO_MS = 15000;
let servidorLocal = null;

// Estado de la conexión; la API responde 503 con esta causa mientras no haya base de datos.
export const estadoBd = { lista: false, causa: 'Conectando con la base de datos. Prueba de nuevo en unos segundos.' };

mongoose.connection.on('connected', () => {
  estadoBd.lista = true;
  estadoBd.causa = '';
  console.log(`Conectado a MongoDB (${mongoose.connection.host}, base «${mongoose.connection.name}»)`);
});
mongoose.connection.on('disconnected', () => {
  if (estadoBd.lista) console.error('Se perdió la conexión con MongoDB; se reconectará sola.');
  estadoBd.lista = false;
  estadoBd.causa ||= 'Se perdió la conexión con la base de datos. Prueba de nuevo en unos segundos.';
});

// Si falla, no se cierra la app: se anota la causa y se vuelve a intentar.
async function intentarConexion(uri) {
  try {
    // Hasta 50 conexiones a la base en paralelo (muchas personas a la vez) y las que sobran se cierran solas;
    // una consulta colgada no retiene la conexión más de 45 s.
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 50, minPoolSize: 2, maxIdleTimeMS: 60_000, socketTimeoutMS: 45_000 });
  } catch (err) {
    estadoBd.causa = /auth/i.test(err.message)
      ? 'El usuario o la contraseña de MongoDB no son correctos (variables MONGODB_USER y MONGODB_PASSWORD).'
      : 'MongoDB Atlas no permite la IP de este servidor (en Atlas: Network Access → Add IP Address).';
    console.error(`No se pudo conectar a MongoDB: ${err.message}`);
    console.error(`CAUSA PROBABLE: ${estadoBd.causa}`);
    console.error(`Se reintentará en ${REINTENTO_MS / 1000} segundos.`);
    setTimeout(() => intentarConexion(uri), REINTENTO_MS);
  }
}

export async function conectar() {
  let uri = config.mongoUri;

  if (!uri) {
    // Sin datos de MongoDB: se levanta un mongod propio con los datos guardados en ./data/mongo
    // La variante "core" no descarga nada al instalar, solo la primera vez que se usa.
    const { MongoMemoryServer } = await import('mongodb-memory-server-core');
    const dbPath = path.resolve('data/mongo');
    mkdirSync(dbPath, { recursive: true });
    console.log('MongoDB no está configurado: iniciando uno local en', dbPath);
    console.log('(la primera vez descarga el binario de MongoDB y puede tardar unos minutos)');
    servidorLocal = await MongoMemoryServer.create({
      // Hasta 60 s para arrancar: con el PC ocupado (emulador, compilación) 10 s no siempre alcanzan.
      instance: { dbPath, storageEngine: 'wiredTiger', dbName: 'gastos', launchTimeout: 60_000 },
    });
    uri = servidorLocal.getUri('gastos');
  }

  console.log(`Conectando a MongoDB en ${uri.replace(/^.*@/, '').replace(/[/?].*$/, '')}...`);
  await intentarConexion(uri);
}

export async function desconectar() {
  await mongoose.disconnect();
  if (servidorLocal) await servidorLocal.stop({ doCleanup: false });
}
