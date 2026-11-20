# App Android de DUOLAB (nativa)

App **nativa** en Kotlin con Jetpack Compose. Usa la misma API que la web (`https://gastos-g63s.onrender.com/api`), así que los datos son los mismos en el teléfono, la web y WhatsApp.

- Paquete: `pe.duolab.gastos` · Android 8 o posterior · versión 2.16 (`versionCode` 20).
- Se descarga desde la web: `https://gastos-g63s.onrender.com/descargas/duolab-gastos.apk` (Mi cuenta → Yape, Plin y avisos del teléfono → Android, y la ventana «Instala DUOLAB», pestaña Android).

> **Play Protect:** Google bloquea la instalación **fuera de Play Store** (desde Chrome, WhatsApp o un gestor de archivos) de apps que piden **acceso a notificaciones**. Por eso hay dos versiones: el APK de la web **no** lee notificaciones (se instala sin bloqueo) y la lectura automática de Yape queda para la versión de **Play Store**. No se debe pedir a los usuarios que desactiven Play Protect.

| Versión (flavor) | Dónde | Lectura de Yape, Plin y bancos |
| --- | --- | --- |
| `web` | APK en `/descargas/duolab-gastos.apk` | No (Yape automático con MacroDroid) |
| `play` | Play Store (`.aab`) | Sí: se conecta sola al entrar (pide el enlace personal a la API) |

## Qué es nativo (desde la 2.2, toda la app)

Todo es nativo (Kotlin + Jetpack Compose) y con el diseño de la web en teléfono: mismos colores, iconos, cabecera («DUOLAB · Personal · PEN · diseño · + Nuevo») y barra inferior. Solo salen de la app las páginas de Google (entrar y vincular Gmail: Google obliga a usar Chrome), el enlace a MacroDroid en Play Store y la política de privacidad.

| Vista | Qué hace |
| --- | --- |
| **Entrar** | Entrar, **Crear cuenta** (nombre, correo, WhatsApp, contraseña), **¿Olvidaste tu contraseña?** (código por WhatsApp/correo y contraseña nueva) y **Continuar con Google**. |
| **Mes** | Igual que la web, con los 5 **diseños de inicio** (Automático, Clásico, Resumen primero, Pagos primero, Sencillo). El botón de cuadritos abre la ventana «Diseño de inicio» de la web: miniatura de cada diseño, «Ahora: …» en Automático, «★ Recomendado para ti» y el elegido con borde lima. |
| **Nuevo / Editar movimiento** | Los mismos campos y en el mismo orden que la web: Gasto/Ingreso, Descripción, Monto, Fecha (calendario), Categoría (con sugerencias), Medio de pago, Banco o entidad, «Ya está pagado», **Recordarme por WhatsApp** (si está pendiente), **Repetir** y «Cuántas veces más»; Eliminar al editar. |
| **Metas, Categorías, Asistente, Informe PDF** | Como en la web. |
| **Año** | Como la web: «‹ Año 2026 ›» (y «Este año»), tarjetas Ingresos, Gastos (con lo ya pagado), Balance (lima) y Falta por pagar, y las pestañas **Gráfica** (barras por mes, gastos rayados; toca un mes para abrirlo), **Por mes** (tabla con total) y **Categorías**. Los montos largos achican la letra (`TextoAjustable`) en vez de cortarse. |
| **Mi cuenta** | (2.12) Arriba, **cabecera** con la foto de Google, nombre, correo y el estado de WhatsApp, Gmail y notificaciones (toca uno para ir a su sección); debajo, **atajos** a cada sección. Secciones: **Tus datos** (nombre y WhatsApp editables; correo y forma de entrar como filas informativas; «Guardar cambios» solo se activa si cambiaste algo), **Recordatorios de pago** (cuándo avisar, «también el mismo día», Guardar y Probar), **Notificaciones** (estado «al instante» o «cada 15 minutos», Probar y Ajustes), **Gmail** (vincular con un código de 5 minutos `POST /api/auth/google/app/enlace-gmail`, revisar ahora, pausar, desvincular; escanear meses y correos revisados en «Más opciones», plegado) y **Yape, Plin y avisos** (enlace personal, pasos de MacroDroid plegados, lectura automática en `play`, últimos 4 envíos y «Ver los N»). |
| **Compartir** | Enviar el estado de cuenta por WhatsApp o correo; personas del libro (invitar, lector/editor, quitar). |
| **Administración** | Almacenamiento, usuarios (crear, eliminar), bot de WhatsApp con su **QR**, IA (proveedor, clave, modelo, probar) y atajo de iPhone. |
| **Más** | Hoja a pantalla completa (2.11), en este orden: **perfil** (foto de la cuenta de Google o la inicial sobre un color, nombre, correo, «Cuenta de Google»; toca para Mi cuenta), **Libro activo** (moneda y rol, «Cambiar libro» y «+ Nuevo libro»), **Mis finanzas** (Año, Informe PDF, Compartir), **Cuenta** (Mi cuenta, Lectura de Yape en `play`, Administración), **Preferencias** (Modo oscuro, Buscar actualizaciones) y **Cerrar sesión** aparte en rojo. Cada grupo es una tarjeta con separadores (como Ajustes del iPhone). La foto la da el servidor (`usuario.foto`) y `Perfil.kt` la guarda en el teléfono. El menú lateral tipo web (`MenuLateral`, 2.7–2.9) queda sin usar: el usuario prefirió la hoja. |
| **Configuración** | (2.13, Más → Preferencias → Configuración; `Configuracion.kt` y `Ajustes.kt`, guardado en SharedPreferences `ajustes`). **Apariencia:** tema Claro / Oscuro / **Automático** (sigue el modo del teléfono; es el valor por defecto) y Diseño de inicio. **Notificaciones:** permiso, recibir sí/no, por tipo (movimientos que llegan solos, pagos por vencer, actualizaciones de la app), **silencio de noche** (22:00–7:00 sin sonido), probar y ajustes del sistema. El tipo de los avisos de Firebase sale de su etiqueta (`recordatorio…` = pago, `prueba`, el resto movimientos). **Inicio y apartados:** pestaña que se abre primero (Calendario, Pendientes, Movimientos, Gráficas) y mostrar u ocultar Metas, Categorías y Asistente en la barra (lo oculto sigue en Más). **Datos en este teléfono:** actualizar ahora y borrar la copia local. **Acerca de:** versión, buscar actualizaciones, privacidad. |
| **Notificaciones** | Permiso al entrar. **Al instante** con Firebase Cloud Messaging cuando el servidor lo tiene configurado (ver abajo); si no, cada 15 minutos (WorkManager) avisa de los movimientos que entran solos. |

**Igual que la web:** letra **Manrope** (la de la web, `res/font/manrope.ttf`, licencia OFL en `manrope-OFL.txt`), calendario con su navegación, leyenda y el día de hoy elegido, ↶ «Deshacer» en lo pagado, filtros con el icono de cada medio, insignia de «Falta por pagar».

**Se adapta a la pantalla (2.10):** `Tema.kt` define `ANCHO_MAX` (680 dp), `ESCALA_LETRA_MAX` (1.3) y `pantallaBaja()`.
- **Tabletas y horizontal:** la cabecera y el contenido se centran con 680 dp como máximo (como la web en PC); la barra inferior mide como mucho 440 dp; el menú lateral, 420 dp; la pantalla de entrar, 480 dp.
- **Teléfono en horizontal** (alto < 520 dp y ancho ≥ 600 dp): la barra pasa a ser vertical, a la izquierda, para no tapar el contenido. Con poco alto la barra es más baja.
- **Teléfonos pequeños y letra grande:** se respeta el tamaño de letra del teléfono hasta 1.3×. Los montos, el mes del inicio, «Subir captura…» y las pestañas achican la letra (`TextoAjustable` en `Mes.kt`) en vez de cortarse; los títulos de las tarjetas usan hasta dos líneas; los botones tienen alto mínimo en vez de alto fijo.
- Para probar: `adb shell wm size 1600x2560` + `wm density 320` (tableta), `wm size 720x1600` + `wm density 360` + `settings put system font_scale 1.3` (pequeño con letra grande), `settings put system user_rotation 1` (horizontal); `wm size reset` y `wm density reset` para volver.

**Gestos (2.14):** «atrás» (gesto desde el borde, botón del teléfono o la flecha que aparece arriba fuera del Mes) vuelve a la **pantalla anterior** (historial en `Principal.kt`), y desde el Mes sale de la app. **Atrás predictivo** de Android 13+ (`enableOnBackInvokedCallback` + `PredictiveBackHandler`): mientras se desliza, la pantalla se encoge y se aparta; si se cancela, queda igual. Las transiciones van hacia la derecha al avanzar y hacia la izquierda al volver. **Deslizar** a los lados la tarjeta del mes cambia de mes, y la cabecera de Año cambia de año (`Modifier.deslizar` en `Toque.kt`, 72 dp, vibración suave). Tocar un mes en Año abre ese mes (`vm.vistaPedida`). Al volver a la app desde el inicio del teléfono o las recientes, si pasó más de un minuto, se ponen al día los datos. Las hojas (menú, formulario) se cierran con atrás o deslizando hacia abajo.

**Liviana con mucha gente (2.14):** caché HTTP de OkHttp (10 MB; los datos sin cambios llegan como «304»), un reintento automático de las consultas si el servidor responde 502/503/504 o falla la red, al pasar meses seguidos solo se pide el último (250 ms de espera) y sin volver a pedir los libros, la precarga solo baja meses que no están en el teléfono, y con avisos al instante la revisión en segundo plano pasa a una vez por hora.

**Rápida:** guarda en el teléfono la cuenta, los libros y cada mes visto (`cache` en `AppVM.kt`): abre al instante, también sin conexión, y precarga el mes anterior y el siguiente.

**Toque iOS:** `Toque.kt` (el elemento se hunde con un resorte y vibra, sin la onda de Android) y transiciones suaves entre vistas. **Icono adaptable** (`mipmap-anydpi-v26`, con monocromo para iconos temáticos).

**Actualizaciones:** `Actualizacion.kt` lee `/descargas/version.json`; si `versionCode` es mayor que el instalado, muestra el aviso, descarga el APK y abre el instalador (pide una vez «Instalar apps desconocidas» para DUOLAB). Solo en la versión `web`; la de Play Store se actualiza por la tienda. En Más → «Buscar actualizaciones».

**Avisos en tiempo real con la app cerrada (2.15):** `TiempoReal.kt`. Un servicio en primer plano (`ServicioTiempoReal`, tipo `specialUse`, con la notificación fija y silenciosa «DUOLAB te avisa al instante» en el canal de importancia mínima) queda conectado a `/api/eventos` (SSE, `Api.escucharEventos`). El servidor manda ahí cada aviso (`notificar()` en `push.js` → evento `aviso` con título, texto y etiqueta) y la app lo muestra al momento, **sin depender de Firebase**; con el evento `cambio` (otra persona del libro) revisa y avisa si no llegó un aviso propio. Se reconecta solo (3 s, y hasta 1 min sin internet), vuelve tras reiniciar el teléfono o actualizar la app (`AlIniciarTelefono`, `BOOT_COMPLETED` y `MY_PACKAGE_REPLACED`) y se apaga al cerrar sesión. Con la app en pantalla no notifica (`TiempoReal.appVisible`). Si el aviso llega también por Firebase, la misma etiqueta hace que se vea una sola vez. Configuración → Notificaciones: «Avisos en tiempo real» (activado por defecto), «Quitar el ahorro de batería» y «Inicio de apps (Honor, Huawei)».

**Notificaciones al instante (2.8):** `Push.kt`. Firebase Cloud Messaging **sin** el plugin `google-services` ni `google-services.json` dentro de la app: al entrar, la app pide los datos públicos de Firebase a `GET /api/push/app`, inicia Firebase con ellos (`FirebaseApp.initializeApp`), obtiene el código del teléfono y lo registra con `POST /api/push/app`. Los datos se guardan (`push` en SharedPreferences) y `DuolabApp` inicia Firebase al arrancar, para que el aviso llegue con la app cerrada. El servidor manda mensajes **solo de datos** (título, cuerpo, etiqueta) con prioridad alta y `ServicioPush` arma la notificación con el canal, icono y color de DUOLAB; luego marca como vistos esos movimientos para que la revisión de cada 15 minutos no los repita. Al cerrar sesión se quita el código (`POST /api/push/app/quitar`). Activarlo: [docs/06 · Firebase](../docs/06-despliegue.md#firebase-notificaciones-al-instante-en-la-app-android). En Honor, Huawei, Xiaomi u Oppo conviene quitar el ahorro de batería a DUOLAB.

**Compartir → DUOLAB:** la app aparece al compartir una imagen (constancia de Yape, Plin o del banco) y la lee al momento (o al entrar, si no había sesión).

**Lectura de Yape:** solo en la versión `play` (Play Protect bloquea fuera de Play Store las apps con acceso a notificaciones). Para repartirla sin bloqueo: Play Console → **Prueba interna** (hasta 100 personas con un enlace) o instalarla por cable USB con `adb install`.

**Probar siempre el APK release (R8)** antes de publicar: ver `proguard-rules.pro`.

## Código

| Archivo (`app/src/main/java/pe/duolab/gastos/`) | Qué es |
| --- | --- |
| `Api.kt` | Cliente OkHttp de la API y la cookie de sesión |
| `Modelos.kt` | Usuario, libros, movimientos, totales y borrador del formulario (lectura del JSON) |
| `AppVM.kt` | Estado de la app (ViewModel): sesión, libro, mes, datos y acciones |
| `Pantallas.kt`, `Principal.kt` | Entrar; cabecera, barra inferior, captura, PDF y «Nuevo libro» |
| `Menus.kt` | Menús como la web: menú lateral (Más), selector tipo `<select>` y ventana «Diseño de inicio» con miniaturas |
| `Push.kt` | Notificaciones al instante (Firebase Cloud Messaging): `Push`, `DuolabApp`, `ServicioPush` |
| `Cuenta.kt`, `Compartir.kt` | Mi cuenta; Compartir y Administración |
| `Mes.kt`, `Secciones.kt` | Vista Mes (tarjeta, tarjetas, segmentos, calendario, gráficas) y Metas, Categorías, Asistente, Año e Informe |
| `Iconos.kt`, `Avisos.kt` | Iconos de la web; notificaciones (revisión cada 15 minutos con WorkManager y `Avisos.mostrar` para las de Firebase) |
| `Formulario.kt` | Formulario de movimiento (hoja inferior, mismos campos que la web) |
| `Componentes.kt` | Fila de movimiento, selector de mes, tarjetas y gráfica |
| `Formato.kt`, `Tema.kt`, `MainActivity.kt` | Dinero y fechas en español, colores DUOLAB, actividad única |
| `src/web/…/Lectura.kt` | Versión web: sin lectura |
| `src/play/…` | `Lectura.kt`, `LecturaAvisos.java` (servicio de notificaciones: solo apps financieras y avisos con monto), `Enviador.java` (POST a `/api/avisos/<token>` con reintentos), `ConfigurarActivity.java` (permiso, batería y prueba) y su `AndroidManifest.xml` |

## Firma (importante)

La firma está **fuera del repositorio**: `C:\Users\JANCA\.duolab\duolab-release.jks` y `keystore.properties` (con la contraseña). **Guarda una copia segura**: sin la misma firma, una versión nueva no se instala encima de la anterior. Otra ruta: variable `DUOLAB_KEYSTORE` con la ruta del `keystore.properties`.

## Compilar una versión nueva

Requiere Android Studio (su JDK) y el SDK de Android. La primera vez descarga Kotlin 2.2.10, Compose (BOM 2025.08.00) y `firebase-messaging` 24.1.0.

1. Sube `versionCode` (y `versionName`) en `app/build.gradle`.
2. En esta carpeta (PowerShell):
   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
   .\gradlew.bat assembleWebRelease bundlePlayRelease
   ```
3. Web: copia `app/build/outputs/apk/web/release/app-web-release.apk` a `public/descargas/duolab-gastos.apk`, **pon el mismo `versionCode`, `versionName` y las novedades en `public/descargas/version.json`**, sube la caché de `public/sw.js` y publica. Desde la 2.4, las apps instaladas ven «Nueva actualización disponible» al abrirse (y una notificación en la revisión de cada 15 minutos), la descargan y abren el instalador de Android. La 2.3 y anteriores no tienen este aviso: hay que instalar la 2.4 a mano una vez.
4. Play Store: sube `app/build/outputs/bundle/playRelease/app-play-release.aab` en Play Console. En la ficha hay que declarar el uso del acceso a notificaciones (registrar los pagos que el usuario recibe y envía).

`local.properties` (ruta del SDK) no se sube: `sdk.dir=C:/Users/<usuario>/AppData/Local/Android/Sdk`.
