# 04 · Administración

La pestaña **Admin** (menú ☰ → Configuración → Admin) solo la ven los correos de `ADMIN_EMAILS`; si esa variable está vacía, el administrador es la primera cuenta registrada.

## Almacenamiento

- Uso de la base de datos frente al límite (`ALMACENAMIENTO_MB`, 512 MB en el plan gratuito de MongoDB Atlas), con aviso al pasar del 80 %.
- Tiempo de respuesta de la base (si pasa de 150 ms, servidor y base están en regiones alejadas).
- Espacio medio por cliente y **cuántos clientes más caben**.
- **Qué ocupa cada parte**: documentos, datos e índices de cada colección.

Referencia: un movimiento ocupa unos 250 bytes con sus índices; 512 MB dan para unos 2 millones de movimientos.

## Usuarios

- Lista de cuentas con fecha de registro y libros.
- **Crear usuario**: las cuentas creadas por el administrador entran con su licencia de VIMOD.
- Editar o eliminar cuentas.

## WhatsApp

- **Conectar**: muestra un código QR que se escanea desde el WhatsApp del número del bot (Dispositivos vinculados).
- La sesión se guarda en la base y se reconecta sola en cada reinicio.
- **Desconectar** y **enviar** un mensaje de prueba.
- El bot ignora grupos, estados y canales.

## IA

- Proveedor: **Claude** (Anthropic) o **NVIDIA** (modelos abiertos). Clave, modelo y **Activar**.
- Con NVIDIA, las fotos se leen con el primer modelo con visión disponible en la cuenta; si NVIDIA retira uno, se prueba el siguiente.
- **Probar** comprueba la clave y el modelo.
- Las claves también pueden ir en `ANTHROPIC_API_KEY` o `NVIDIA_API_KEY` (la variable de entorno manda sobre lo guardado en el panel).
- Sin IA activa: no se leen capturas ni correos ambiguos, y el asistente no responde.

## Atajo iPhone

Pestaña **Admin → Atajo iPhone**: el enlace de iCloud del atajo «DUOLAB Yape» (`https://www.icloud.com/shortcuts/…`). Con el enlace guardado, el tutorial de cada usuario de iPhone muestra **«Copiar enlace y añadir atajo»** (un toque); sin él, explica cómo crear el atajo acción por acción.

- Apple no permite crear atajos desde una web ni generarlos en el servidor (tienen que ir firmados), por eso se crea **una vez** en un iPhone y se comparte por iCloud. Los pasos exactos están en la misma pestaña y en [03 · Guías](03-guias.md#para-el-administrador-publicar-el-atajo-una-vez).
- El atajo lleva una **pregunta de importación** en el campo Texto: al añadirlo, cada iPhone pide su propio enlace (el del administrador no se comparte).
- La **automatización** «al abrir Yape» no se puede compartir: cada usuario la crea en su iPhone (5 toques, explicados en el tutorial y en el video).
- Se guarda en la colección `ajustes` con la clave `atajo-iphone`. Dejar el campo vacío y guardar lo quita.

## App Android (APK)

Se publica como archivo en `public/descargas/duolab-gastos.apk`. La firma (`C:\Users\JANCA\.duolab\`) no está en el repositorio: **hay que guardar una copia**. Cómo compilar una versión nueva: [android/LEEME.md](../android/LEEME.md). `ANDROID_SHA256` (opcional) cambia la huella de `/.well-known/assetlinks.json`.

## Licencias de VIMOD

Si están `VIMOD_MONGODB_URI` y `VIMOD_SOFTWARE`, solo entran clientes con licencia activa de ese software en el Panel de VIMOD (se busca su cuenta por el correo). Si se suspende o vence, se pierde el acceso en un minuto. `LICENCIA_LIBRE` lista correos que entran sin licencia. Sin esas variables, la app queda abierta.
