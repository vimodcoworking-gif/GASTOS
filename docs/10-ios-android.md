# 10 · iPhone, Android y apps nativas

Qué se puede registrar solo en cada teléfono, con qué herramientas, y qué cambiaría con una app nativa.

## Resumen

| Movimiento | iPhone | Android |
| --- | --- | --- |
| Yape **enviado** | Correo de Yape → Gmail (0 toques) | Correo de Yape, o notificación con MacroDroid (0 toques) |
| Yape **recibido** | Atajo «DUOLAB Yape» al abrir Yape: tocar la notificación (1 toque) | MacroDroid, o la app DUOLAB de Play Store (0 toques) |
| Yape de alguien que usa DUOLAB | Correo del que paga (0 toques) | Igual |
| Plin y transferencias | Correo de alerta del banco (0 toques, si el banco lo envía) | Notificación del banco con MacroDroid, o correo (0 toques) |
| Captura, boleta, constancia | Subir captura, WhatsApp o tocar atrás | Igual |

## Por qué el iPhone no puede ser 100 % automático

Apple no deja que **ninguna** app (web o nativa) lea las notificaciones ni la pantalla de otra app. No hay permiso ni excepción. Por eso ninguna app de finanzas en iPhone registra solos los Yapes recibidos: Yape solo envía correo a quien paga, y su notificación no es accesible.

## Atajos de iPhone que sí sirven

| Disparador (Atajos → Automatización) | Uso en DUOLAB | Estado |
| --- | --- | --- |
| **App → Yape → Se abre** | Captura de la lista de movimientos y envío al enlace personal (`?silencioso=1`) | **Activo**: atajo «DUOLAB Yape», tutorial y video en la app |
| Tocar atrás (doble toque) | Captura y envío cuando se quiera | Opcional, con el mismo atajo |
| Mensaje (SMS) que contiene «Plin» | Enviar el texto del SMS del banco al enlace (se lee sin IA) | Posible: requiere alertas por SMS del banco; no está en el tutorial |
| Transacción (Wallet) | Monto y comercio de cada pago con Apple Pay | Posible si la tarjeta está en Apple Wallet; no está en el tutorial |
| Correo | No hace falta: Gmail ya se revisa cada 3 minutos | — |

No existe el disparador «al recibir una notificación».

## Apps nativas

### Android: app DUOLAB

> **Play Protect:** desde 2025, Google bloquea la instalación **fuera de Play Store** (desde Chrome, WhatsApp o un gestor de archivos) de apps que piden **acceso a notificaciones**, «para proteger el dispositivo». Por eso hay dos versiones: el APK de la web **no** lee notificaciones (se instala sin bloqueo) y la lectura automática queda para la versión de **Play Store**. No se debe pedir a los usuarios que desactiven Play Protect.

- **App nativa** (Kotlin + Jetpack Compose, versión 2.1), APK en <https://gastos-g63s.onrender.com/descargas/duolab-gastos.apk>: el mismo diseño que la web en teléfono — Mes con calendario, pendientes, movimientos y gráficas, subir captura de Yape, Metas, Categorías, Asistente IA, Año, Informe PDF, modo oscuro — y notificaciones de los movimientos que entran solos (cada 15 minutos). Compartir, Mi cuenta y Admin se abren en la web. Yape automático con **MacroDroid** (de Play Store).
- **Versión de Play Store** (pendiente de publicar): además lee sola las notificaciones de Yape, Plin y bancos. Tras instalarla: abrir DUOLAB → **Conectar** → **Activar acceso a notificaciones**. Requiere cuenta de Google Play (US$ 25, un pago) y declarar el uso del acceso a notificaciones.

Detalles técnicos, firma y cómo compilar: [android/LEEME.md](../android/LEEME.md).

### Android: por qué aporta

Android permite leer las notificaciones de otras apps (servicio de escucha de notificaciones, con el permiso «Acceso a notificaciones»). Una app DUOLAB nativa (por ejemplo, la misma web dentro de Capacitor más ese servicio) registraría al instante los Yapes, Plin y avisos de banco **de cualquier monto, enviados y recibidos**, sin MacroDroid. El servidor ya sabe leer esos textos (`POST /api/avisos/<token>`) y evita duplicados con el correo.

Condiciones: dar el permiso una vez; notificaciones de Yape activadas; en Xiaomi, Huawei u Oppo, quitar el ahorro de batería a DUOLAB. Si Yape no muestra notificación de un movimiento, no hay nada que leer.

Costo: cuenta de Google Play (US$ 25, un solo pago) o instalar el APK directo. Play Store pide justificar el uso del acceso a notificaciones.

### iPhone: aporta poco

Seguiría sin leer las notificaciones de Yape. Solo sumaría «Compartir → DUOLAB» desde la constancia, Siri y widgets, y lectura de la captura en el propio teléfono. Exige una Mac para compilar y la cuenta de Apple (US$ 99 al año). Mientras tanto, la app instalada desde la web con el atajo cubre lo mismo.

### Recomendación

- **Android:** APK de la web + MacroDroid hoy; versión con lector propio cuando se publique en Play Store (fuera de Play Store la bloquea Play Protect).
- **iPhone:** seguir con la app web instalada + atajo automático al abrir Yape + correo de Yape + alertas de banco por correo.
