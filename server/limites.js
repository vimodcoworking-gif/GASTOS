// Límites de trabajo pesado para que muchas personas a la vez no tumben el servidor: como mucho N tareas de
// un tipo en marcha (leer capturas, generar PDF, llamar a la IA) y las demás esperan su turno en una cola.
// Si la cola se llena, se responde «ocupado» (503) en vez de acumular memoria hasta caerse.
import { AsyncLocalStorage } from 'node:async_hooks';
import { ErrorHttp } from './errores.js';

/**
 * limitador('ia', 4, 60) → función que ejecuta tareas con esos límites.
 * Una tarea que ya va dentro del mismo limitador (p. ej. un reintento de la IA) no vuelve a hacer cola:
 * así no se bloquea a sí misma.
 */
export function limitador(nombre, maxEnCurso, maxEnCola = 100) {
  const dentro = new AsyncLocalStorage();
  const cola = [];
  let enCurso = 0;

  const siguiente = () => {
    if (enCurso >= maxEnCurso || !cola.length) return;
    enCurso += 1;
    const { tarea, ok, error } = cola.shift();
    dentro.run(true, () => Promise.resolve().then(tarea))
      .then(ok, error)
      .finally(() => {
        enCurso -= 1;
        siguiente();
      });
  };

  const ejecutar = (tarea) => {
    if (dentro.getStore()) return tarea();
    if (cola.length >= maxEnCola) {
      return Promise.reject(new ErrorHttp(503, 'Hay mucha gente usando DUOLAB en este momento. Inténtalo de nuevo en unos segundos.'));
    }
    return new Promise((ok, error) => {
      cola.push({ tarea, ok, error });
      siguiente();
    });
  };
  ejecutar.estado = () => ({ nombre, enCurso, enCola: cola.length, maxEnCurso });
  return ejecutar;
}

// Capturas: sharp usa mucha memoria por imagen (una foto de 12 MP ocupa ~50 MB al decodificarse).
export const turnoImagen = limitador('imagen', 2, 60);
// PDF: se genera en el hilo principal; dos a la vez como mucho para que la app siga respondiendo.
export const turnoPdf = limitador('pdf', 2, 30);
// IA: son llamadas externas (esperan red, no CPU), pero los proveedores limitan cuántas se hacen a la vez.
export const turnoIa = limitador('ia', 6, 120);

/** Estado de las colas, para el panel de administración y los registros. */
export const estadoColas = () => [turnoImagen.estado(), turnoPdf.estado(), turnoIa.estado()];
