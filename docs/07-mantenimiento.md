# 07 · Tareas automáticas y mantenimiento

## Tareas periódicas

| Tarea | Frecuencia | Archivo |
| --- | --- | --- |
| Revisar los Gmail activos | Cada 3 min (`GMAIL_MINUTOS`) | `google.js` (`revisarTodos`) |
| Mantener despierto el servidor mientras hay Gmail activo | Cada 4 min (comprobación cada 30 min) | `google.js` |
| Recordatorios de pago (8:00–21:00) | Cada 20 min; la primera al minuto de arrancar | `recordatorios.js` |
| Recuperar avisos de banco/billetera de los últimos 3 días que no se registraron | Cada 6 horas | `google.js` (`recuperarAvisosRecientes`) |
| Limpieza diaria (avisos de recordatorio de pagos ya vencidos) | Cada 24 h; la primera a los 5 min | `mantenimiento.js` |
| Reanudar escaneos de correo cortados por un reinicio | Al arrancar | `google.js` |
| Reconectar el bot de WhatsApp | Al arrancar | `whatsapp.js` |

## Correcciones únicas

Se ejecutan una sola vez al arrancar, en este orden; cada una queda anotada en la colección `ajustes` con su nombre y no se repite.

| Nombre | Qué hizo |
| --- | --- |
| `correccion:registros-unidos` | Separó registros que se habían guardado unidos en uno solo |
| `correccion:medios-de-pago-2` | Completó el medio de pago de movimientos antiguos |
| `correccion:medios-yape-plin` | Marcó como Yape o Plin los que lo dicen en su descripción |
| `correccion:yapeos-enviados` | Pasó a gasto los «Yapeo a…» guardados como ingreso |
| `mantenimiento:compactar-v1` | Quitó campos vacíos y rehízo los índices como parciales; borró claves de grupos de WhatsApp |
| `correccion:yapes-correo-v3` | Releyó los yapes de correo de las últimas 2 semanas con el lector exacto y recuperó los del último mes sin registrar |
| `limpieza:registros-correo-v1` | Revisó de nuevo lo registrado desde el correo desde el 14/11/2026 00:05 UTC: borró lo que no eran movimientos, corrigió tipo y monto y quitó duplicados |

Para repetir una corrección: cambiar su nombre en `server/index.js` (por ejemplo `-v2`) y publicar.

## Ahorro de espacio

- Los movimientos no guardan campos vacíos (`serie`, `fechaPago`, `updatedAt`, `__v`).
- Índices parciales: solo incluyen los movimientos que tienen ese dato (pendientes, series, huellas, correos).
- Datos temporales con caducidad: correos vistos 45 días, correos revisados 8 días, mensajes del bot 45 días, envíos del teléfono 7 días.
- El bot ignora grupos, estados y canales de WhatsApp.
- Admin → Almacenamiento muestra el tamaño de cada colección.
