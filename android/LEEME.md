# App Android de DUOLAB (nativa)

App **nativa** en Kotlin con Jetpack Compose. Usa la misma API que la web (`https://gastos-g63s.onrender.com/api`), así que los datos son los mismos en el teléfono, la web y WhatsApp.

- Paquete: `pe.duolab.gastos` · Android 8 o posterior · versión 2.4 (`versionCode` 8).
- Se descarga desde la web: `https://gastos-g63s.onrender.com/descargas/duolab-gastos.apk` (Mi cuenta → Yape, Plin y avisos del teléfono → Android, y la ventana «Instala DUOLAB», pestaña Android).

> **Play Protect:** Google bloquea la instalación **fuera de Play Store** (desde Chrome, WhatsApp o un gestor de archivos) de apps que piden **acceso a notificaciones**. Por eso hay dos versiones: el APK de la web **no** lee notificaciones (se instala sin bloqueo) y la lectura automática de Yape queda para la versión de **Play Store**. No se debe pedir a los usuarios que desactiven Play Protect.

| Versión (flavor) | Dónde | Lectura de Yape, Plin y bancos |
| --- | --- | --- |
| `web` | APK en `/descargas/duolab-gastos.apk` | No (Yape automático con MacroDroid) |
| `play` | Play Store (`.aab`) | Sí: se conecta sola al entrar (pide el enlace personal a la API) |

## Qué es nativo (versión 2.2: toda la app)

Todo es nativo (Kotlin + Jetpack Compose) y con el diseño de la web en teléfono: mismos colores, iconos, cabecera («DUOLAB · Personal · PEN · diseño · + Nuevo») y barra inferior. Solo salen de la app las páginas de Google (entrar y vincular Gmail: Google obliga a usar Chrome), el enlace a MacroDroid en Play Store y la política de privacidad.

| Vista | Qué hace |
| --- | --- |
| **Entrar** | Entrar, **Crear cuenta** (nombre, correo, WhatsApp, contraseña), **¿Olvidaste tu contraseña?** (código por WhatsApp/correo y contraseña nueva) y **Continuar con Google**. |
| **Mes** | Igual que la web, con los 5 **diseños de inicio** (Automático, Clásico, Resumen primero, Pagos primero, Sencillo) del botón de cuadritos. |
| **Metas, Categorías, Asistente, Año, Informe PDF** | Como en la web. |
| **Mi cuenta** | Tus datos y WhatsApp, recordatorios de pago (y Probar), notificaciones del teléfono, **Gmail** (vincular con un código de 5 minutos `POST /api/auth/google/app/enlace-gmail`, revisar ahora, pausar, desvincular, escanear meses, correos revisados y volver a revisar), **Yape y avisos del teléfono** (enlace personal, MacroDroid o lectura automática en la versión de Play Store, últimos envíos). |
| **Compartir** | Enviar el estado de cuenta por WhatsApp o correo; personas del libro (invitar, lector/editor, quitar). |
| **Administración** | Almacenamiento, usuarios (crear, eliminar), bot de WhatsApp con su **QR**, IA (proveedor, clave, modelo, probar) y atajo de iPhone. |
| **Más** | Año, Informe PDF, Compartir, Mi cuenta, Admin, modo oscuro, libro, **+ Nuevo libro**, cerrar sesión. |
| **Notificaciones** | Permiso al entrar; cada 15 minutos avisa de los movimientos que entran solos. |

**Igual que la web:** letra **Manrope** (la de la web, `res/font/manrope.ttf`, licencia OFL en `manrope-OFL.txt`), calendario con su navegación, leyenda y el día de hoy elegido, ↶ «Deshacer» en lo pagado, filtros con el icono de cada medio, insignia de «Falta por pagar».

**Actualizaciones:** `Actualizacion.kt` lee `/descargas/version.json`; si `versionCode` es mayor que el instalado, muestra el aviso, descarga el APK y abre el instalador (pide una vez «Instalar apps desconocidas» para DUOLAB). Solo en la versión `web`; la de Play Store se actualiza por la tienda. En Más → «Buscar actualizaciones».

**Compartir → DUOLAB:** la app aparece al compartir una imagen (constancia de Yape, Plin o del banco) y la lee al momento (o al entrar, si no había sesión).

**Lectura de Yape:** solo en la versión `play` (Play Protect bloquea fuera de Play Store las apps con acceso a notificaciones). Para repartirla sin bloqueo: Play Console → **Prueba interna** (hasta 100 personas con un enlace) o instalarla por cable USB con `adb install`.

**Probar siempre el APK release (R8)** antes de publicar: ver `proguard-rules.pro`.

## Código

| Archivo (`app/src/main/java/pe/duolab/gastos/`) | Qué es |
| --- | --- |
| `Api.kt` | Cliente OkHttp de la API y la cookie de sesión |
| `Modelos.kt` | Usuario, libros, movimientos, totales y borrador del formulario (lectura del JSON) |
| `AppVM.kt` | Estado de la app (ViewModel): sesión, libro, mes, datos y acciones |
| `Pantallas.kt`, `Principal.kt` | Entrar; cabecera, barra inferior, menú Más, captura y PDF |
| `Cuenta.kt`, `Compartir.kt` | Mi cuenta; Compartir y Administración |
| `Mes.kt`, `Secciones.kt` | Vista Mes (tarjeta, tarjetas, segmentos, calendario, gráficas) y Metas, Categorías, Asistente, Año e Informe |
| `Iconos.kt`, `Avisos.kt` | Iconos de la web; notificaciones (WorkManager) |
| `Formulario.kt` | Formulario de movimiento (hoja inferior) |
| `Componentes.kt` | Fila de movimiento, selector de mes, tarjetas y gráfica |
| `Formato.kt`, `Tema.kt`, `MainActivity.kt` | Dinero y fechas en español, colores DUOLAB, actividad única |
| `src/web/…/Lectura.kt` | Versión web: sin lectura |
| `src/play/…` | `Lectura.kt`, `LecturaAvisos.java` (servicio de notificaciones: solo apps financieras y avisos con monto), `Enviador.java` (POST a `/api/avisos/<token>` con reintentos), `ConfigurarActivity.java` (permiso, batería y prueba) y su `AndroidManifest.xml` |

## Firma (importante)

La firma está **fuera del repositorio**: `C:\Users\JANCA\.duolab\duolab-release.jks` y `keystore.properties` (con la contraseña). **Guarda una copia segura**: sin la misma firma, una versión nueva no se instala encima de la anterior. Otra ruta: variable `DUOLAB_KEYSTORE` con la ruta del `keystore.properties`.

## Compilar una versión nueva

Requiere Android Studio (su JDK) y el SDK de Android. La primera vez descarga Kotlin 2.2.10 y Compose (BOM 2025.08.00).

1. Sube `versionCode` (y `versionName`) en `app/build.gradle`.
2. En esta carpeta (PowerShell):
   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
   .\gradlew.bat assembleWebRelease bundlePlayRelease
   ```
3. Web: copia `app/build/outputs/apk/web/release/app-web-release.apk` a `public/descargas/duolab-gastos.apk`, **pon el mismo `versionCode`, `versionName` y las novedades en `public/descargas/version.json`**, sube la caché de `public/sw.js` y publica. Desde la 2.4, las apps instaladas ven «Nueva actualización disponible» al abrirse (y una notificación en la revisión de cada 15 minutos), la descargan y abren el instalador de Android. La 2.3 y anteriores no tienen este aviso: hay que instalar la 2.4 a mano una vez.
4. Play Store: sube `app/build/outputs/bundle/playRelease/app-play-release.aab` en Play Console. En la ficha hay que declarar el uso del acceso a notificaciones (registrar los pagos que el usuario recibe y envía).

`local.properties` (ruta del SDK) no se sube: `sdk.dir=C:/Users/<usuario>/AppData/Local/Android/Sdk`.
