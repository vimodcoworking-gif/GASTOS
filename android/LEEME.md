# App Android de DUOLAB (APK)

App nativa mínima: abre la web de DUOLAB a pantalla completa (Trusted Web Activity, con la sesión, las notificaciones push y todo lo de la web) y añade lo que la web no puede hacer: **leer las notificaciones de Yape, Plin y bancos** y mandarlas al enlace personal de cada usuario.

- Paquete: `pe.duolab.gastos` · Android 6 o posterior · ~1 MB.
- Se descarga desde la web: `https://gastos-g63s.onrender.com/descargas/duolab-gastos.apk` (Mi cuenta → Yape, Plin y avisos del teléfono → Android, y la ventana «Instala DUOLAB», pestaña Android).

## Piezas

| Archivo | Qué hace |
| --- | --- |
| `AndroidManifest.xml` | `LauncherActivity` (androidbrowserhelper) abre `https://gastos-g63s.onrender.com/?app=android`; `DelegationService` muestra las notificaciones push con el nombre de la app; `LecturaAvisos` y `ConfigurarActivity`. |
| `LecturaAvisos.java` | Servicio de escucha de notificaciones. Solo actúa con apps financieras (por el nombre del paquete: yape, bcp, bbva, interbank, scotiabank, banbif, pichincha, mibanco, falabella, ripley, caja, plin, tunki, mercadopago, banco, bank…) y solo si el aviso trae un monto (`S/`, `US$`, `$`, `PEN`, `USD`). Lo demás ni se lee ni sale del teléfono. |
| `Enviador.java` | `POST` JSON `{titulo, texto, app}` a `/api/avisos/<token>` (el mismo formato que MacroDroid). Si no hay red o el servidor está despertando, guarda el aviso (hasta 30) y lo reintenta con el siguiente. La misma notificación actualizada en 2 minutos se manda una vez. |
| `ConfigurarActivity.java` | Pantalla «Lectura de Yape»: recibe el enlace desde la web (`duolab://configurar?enlace=…`), muestra si está conectada y si tiene el permiso, y lleva a «Acceso a notificaciones», al ahorro de batería y a «Probar el envío». También se abre manteniendo pulsado el icono. |

La web detecta la app por `?app=android` (lo guarda en `localStorage` `apk`) y la primera vez ofrece **Conectar**, que abre `intent://configurar?enlace=…#Intent;scheme=duolab;package=pe.duolab.gastos;…`. El servidor ya registra, avisa por push y WhatsApp y evita duplicados con el correo.

## Sin barra de direcciones

Android comprueba `https://gastos-g63s.onrender.com/.well-known/assetlinks.json` (lo sirve `server/index.js`) con la huella SHA-256 de la firma. Huella actual:

`C9:78:E0:7F:66:60:89:37:51:58:F2:49:3B:D7:65:B1:1B:82:7B:95:5F:22:7D:D3:36:8F:43:B5:15:EA:BE:98`

Si cambia la firma, se pone la nueva en la variable `ANDROID_SHA256` de Render.

## Firma (importante)

La firma está **fuera del repositorio**: `C:\Users\JANCA\.duolab\duolab-release.jks` y `keystore.properties` (con la contraseña). **Guarda una copia segura**: sin la misma firma, una versión nueva no se instala encima de la anterior (habría que desinstalar) y cambiaría la huella de `assetlinks.json`. Otra ruta: variable `DUOLAB_KEYSTORE` con la ruta del `keystore.properties`.

## Compilar una versión nueva

Requiere Android Studio (su JDK) y el SDK de Android.

1. Sube `versionCode` (y `versionName`) en `app/build.gradle`.
2. En esta carpeta (PowerShell):
   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
   .\gradlew.bat assembleRelease
   ```
3. Copia `app/build/outputs/apk/release/app-release.apk` a `public/descargas/duolab-gastos.apk`, sube la caché de `public/sw.js` y publica.

`local.properties` (ruta del SDK) no se sube: `sdk.dir=C:/Users/<usuario>/AppData/Local/Android/Sdk`.
