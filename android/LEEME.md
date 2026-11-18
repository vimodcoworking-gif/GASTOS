# App Android de DUOLAB (nativa)

App **nativa** en Kotlin con Jetpack Compose. Usa la misma API que la web (`https://gastos-g63s.onrender.com/api`), así que los datos son los mismos en el teléfono, la web y WhatsApp.

- Paquete: `pe.duolab.gastos` · Android 8 o posterior · versión 2.0 (`versionCode` 3).
- Se descarga desde la web: `https://gastos-g63s.onrender.com/descargas/duolab-gastos.apk` (Mi cuenta → Yape, Plin y avisos del teléfono → Android, y la ventana «Instala DUOLAB», pestaña Android).

> **Play Protect:** Google bloquea la instalación **fuera de Play Store** (desde Chrome, WhatsApp o un gestor de archivos) de apps que piden **acceso a notificaciones**. Por eso hay dos versiones: el APK de la web **no** lee notificaciones (se instala sin bloqueo) y la lectura automática de Yape queda para la versión de **Play Store**. No se debe pedir a los usuarios que desactiven Play Protect.

| Versión (flavor) | Dónde | Lectura de Yape, Plin y bancos |
| --- | --- | --- |
| `web` | APK en `/descargas/duolab-gastos.apk` | No (Yape automático con MacroDroid) |
| `play` | Play Store (`.aab`) | Sí: se conecta sola al entrar (pide el enlace personal a la API) |

## Qué es nativo (fase 1)

| Pantalla | Qué hace |
| --- | --- |
| **Entrar** | Correo y contraseña (`POST /auth/login`) o **Continuar con Google**: abre Chrome en `/api/auth/google?app=android`; al terminar, el servidor vuelve a la app con `duolab://login?codigo=…` (2 minutos, un solo uso) y la app lo canjea en `POST /api/auth/app/canjear`. La sesión es la cookie `sesion` (30 días), guardada en el teléfono. |
| **Inicio** | Mes con ‹ ›, balance, gráfica de los últimos 7 días, botones Gasto e Ingreso, Ingresos, Gastos, Falta por pagar, Próximo mes, lo que falta pagar (con ✓) y los últimos movimientos. Deslizar hacia abajo actualiza. |
| **Movimientos** | Movimientos del mes por día, con totales y filtro Todos / Gastos / Ingresos. |
| **Pendientes** | Vencidos y próximos 30 días, con ✓ para marcar pagado o cobrado. |
| **Formulario** | Nuevo, editar y eliminar: tipo, monto, descripción, fecha, categoría (las del libro), medio de pago, banco y pagado. |
| **Más** | Cuenta, cambiar de libro, lectura automática (Play Store) y enlaces a lo que sigue en la web: calendario y gráficas, año, metas, categorías, asistente IA, informe PDF y compartir, Mi cuenta y administración. Cerrar sesión. |

Al volver a la app se actualizan los datos. Tema claro u oscuro según el teléfono.

**Pendiente (fases siguientes):** notificaciones push propias (Firebase Cloud Messaging; mientras tanto avisan WhatsApp y la web), subir capturas de Yape, calendario, gráficas, metas, categorías y asistente en nativo.

## Código

| Archivo (`app/src/main/java/pe/duolab/gastos/`) | Qué es |
| --- | --- |
| `Api.kt` | Cliente OkHttp de la API y la cookie de sesión |
| `Modelos.kt` | Usuario, libros, movimientos, totales y borrador del formulario (lectura del JSON) |
| `AppVM.kt` | Estado de la app (ViewModel): sesión, libro, mes, datos y acciones |
| `Pantallas.kt` | Entrar, estructura con barra inferior, Inicio, Movimientos, Pendientes y Más |
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
