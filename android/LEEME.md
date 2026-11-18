# App Android de DUOLAB (nativa)

App **nativa** en Kotlin con Jetpack Compose. Usa la misma API que la web (`https://gastos-g63s.onrender.com/api`), así que los datos son los mismos en el teléfono, la web y WhatsApp.

- Paquete: `pe.duolab.gastos` · Android 8 o posterior · versión 2.1 (`versionCode` 4).
- Se descarga desde la web: `https://gastos-g63s.onrender.com/descargas/duolab-gastos.apk` (Mi cuenta → Yape, Plin y avisos del teléfono → Android, y la ventana «Instala DUOLAB», pestaña Android).

> **Play Protect:** Google bloquea la instalación **fuera de Play Store** (desde Chrome, WhatsApp o un gestor de archivos) de apps que piden **acceso a notificaciones**. Por eso hay dos versiones: el APK de la web **no** lee notificaciones (se instala sin bloqueo) y la lectura automática de Yape queda para la versión de **Play Store**. No se debe pedir a los usuarios que desactiven Play Protect.

| Versión (flavor) | Dónde | Lectura de Yape, Plin y bancos |
| --- | --- | --- |
| `web` | APK en `/descargas/duolab-gastos.apk` | No (Yape automático con MacroDroid) |
| `play` | Play Store (`.aab`) | Sí: se conecta sola al entrar (pide el enlace personal a la API) |

## Qué es nativo (versión 2.1: igual que la web)

El diseño copia la web en teléfono: mismos colores (tokens de `styles.css`), mismos iconos (trazos SVG de la web dibujados como vectores en `Iconos.kt`), cabecera con «+ Nuevo», barra inferior oscura flotante (Mes, Metas, Categorías, Asistente, Más) y modo claro u oscuro.

| Vista | Qué hace (igual que la web) |
| --- | --- |
| **Entrar** | Correo y contraseña, o **Continuar con Google** (Chrome → `duolab://login?codigo=…` → `POST /api/auth/app/canjear`). Sesión de 30 días. |
| **Mes** | Tarjeta oscura con ‹ mes ›, descarga del PDF, balance, barras de 7 días con la línea lima, botones Gasto, Ingreso y **Subir captura de Yape o banco**; Ingresos, Gastos, Falta por pagar, Próximo mes; segmentos **Calendario** (rejilla con lo gastado y puntos, día elegido con Gastaste/Recibiste y «+ Añadir en este día»), **Pendientes**, **Movimientos** (por día, filtro por medio de pago) y **Gráficas** (datos del mes, acumulado, por categoría y por medio). |
| **Metas** | Metas con anillo de progreso, cuánto falta y al mes; crear, aportar y retirar (opcionalmente como gasto/ingreso). |
| **Categorías** | Gastos e ingresos por categoría del mes, presupuesto con barra (naranja cerca del límite, roja si te pasas), crear y renombrar. |
| **Asistente** | Chat con la IA (`POST /api/ia/chat`), con sugerencias. |
| **Más** | Año, Informe PDF (descarga con la sesión y abre el visor), Compartir, Mi cuenta y Admin (estos tres en la web), modo oscuro, libro y cerrar sesión. |
| **Notificaciones** | Pide el permiso al entrar. Cada 15 minutos (WorkManager) revisa si entraron movimientos nuevos por Gmail, MacroDroid, WhatsApp u otra persona del libro y los avisa. No avisa de lo que ya se vio en la app. |

**Pendiente:** Compartir, Mi cuenta y Admin nativos; notificaciones al instante (necesita Firebase Cloud Messaging); diseños de inicio alternativos.

## Código

| Archivo (`app/src/main/java/pe/duolab/gastos/`) | Qué es |
| --- | --- |
| `Api.kt` | Cliente OkHttp de la API y la cookie de sesión |
| `Modelos.kt` | Usuario, libros, movimientos, totales y borrador del formulario (lectura del JSON) |
| `AppVM.kt` | Estado de la app (ViewModel): sesión, libro, mes, datos y acciones |
| `Pantallas.kt`, `Principal.kt` | Entrar; cabecera, barra inferior, menú Más, captura y PDF |
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
3. Web: copia `app/build/outputs/apk/web/release/app-web-release.apk` a `public/descargas/duolab-gastos.apk`, sube la caché de `public/sw.js` y publica.
4. Play Store: sube `app/build/outputs/bundle/playRelease/app-play-release.aab` en Play Console. En la ficha hay que declarar el uso del acceso a notificaciones (registrar los pagos que el usuario recibe y envía).

`local.properties` (ruta del SDK) no se sube: `sdk.dir=C:/Users/<usuario>/AppData/Local/Android/Sdk`.
