# 08 · Solución de problemas

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Un Yape que **recibí** no aparece | Yape no envía correo a quien recibe | Atajo de iPhone o MacroDroid; o que quien paga use DUOLAB con su Gmail y WhatsApp |
| Un Yape que **envié** no aparece | El correo de Yape va al correo registrado en la app de Yape, no al Gmail vinculado; o Yape no mandó correo | Revisar el correo del perfil de Yape; usar el atajo o **Subir captura** |
| Un aviso de banco no se registró | La IA lo descartó, o es de un remitente fuera del filtro | Mi cuenta → Gmail → **Ver correos revisados** → «Volver a revisar»; se recupera solo cada 6 horas si es un aviso claro |
| El atajo de iPhone no registra nada | No llegó al enlace, o falló la lectura | Mi cuenta → **Últimos envíos**: vacío = el atajo no llega (revisar URL, POST, Archivo); con error = dice el motivo |
| «Activa la IA» al subir una captura | IA desactivada | Admin → IA → elegir proveedor, clave y Activar |
| Una captura HEIC no se lee | Formato no compatible | En el atajo, añadir «Convertir imagen» a JPEG |
| No llega el recordatorio por WhatsApp | Bot desconectado o número no guardado | Admin → WhatsApp (conectar con QR); Mi cuenta → WhatsApp; **Probar** |
| No llegan notificaciones en iPhone | App sin instalar, iOS < 16.4 o permiso negado | Instalar desde Safari, abrir desde el icono, Activar; Ajustes → Notificaciones → DUOLAB |
| La app instalada muestra el logo o nombre viejo | El sistema guarda el icono de la instalación | Desinstalar y volver a instalar |
| No veo los últimos cambios | Copia guardada en el navegador | Ctrl + F5; comprobar `/api/version`; la app instalada se recarga sola tras una publicación |
| Un movimiento se registró al revés (gasto/ingreso) | Ambigüedad del aviso | Abrirlo y cambiar el tipo; en WhatsApp, responder «era ingreso» |
| Montos inflados o gastos que no hice | Avisos de deuda, pagos de tarjeta o estados de cuenta registrados por error | Eliminar el movimiento; avisar a desarrollo con la captura del correo revisado |
| Movimiento duplicado | Llegó por dos caminos con datos distintos | Eliminar uno; si se repite, avisar a desarrollo |
| Revisión de Gmail lenta | Render dormido o muchos correos | Revisar que `APP_URL` esté puesta; **Revisar ahora** en Mi cuenta |
| «Invalid media type» al probar recordatorios | Error ya corregido (versión `6faca2c`) | Comprobar que la versión publicada sea posterior |

## Dónde mirar

- **Mi cuenta → Gmail → Diagnóstico de hoy**: el primer lugar a mirar; avisos de las últimas 24 horas, qué pasó con cada uno, IA, bot y teléfono.
- **Mi cuenta → Últimos envíos**: todo lo que llegó del teléfono (7 días).
- **Mi cuenta → Gmail → Ver correos revisados**: qué se decidió con cada correo (8 días).
- **Render → Logs**: errores del servidor (`Aviso (captura)`, `Recordatorio a…`, `Push:`, `Corrección «…»`).
- **`/api/version`**: qué versión está publicada.
