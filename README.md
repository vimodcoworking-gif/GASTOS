# N.F.T.A Gastos

Aplicación web para llevar las finanzas personales o compartidas: gastos, ingresos, pagos pendientes y previsión de los meses siguientes. Tiene cuentas de usuario, libros que se pueden compartir, informes en PDF, un bot de WhatsApp con inteligencia artificial opcional y se puede instalar como app en el móvil o el ordenador.

## Contenido

1. [Qué hace](#qué-hace)
2. [Guía de uso](#guía-de-uso)
3. [Bot de WhatsApp](#bot-de-whatsapp)
4. [Panel del administrador](#panel-del-administrador)
5. [Instalación en tu equipo](#instalación-en-tu-equipo)
6. [Configuración](#configuración)
7. [Publicarla en internet](#publicarla-en-internet)
8. [Envío de correo](#envío-de-correo)
9. [Google y gastos desde Gmail](#google-y-gastos-desde-gmail)
10. [Cómo está hecha](#cómo-está-hecha)
11. [Mantenimiento](#mantenimiento)
12. [Problemas frecuentes](#problemas-frecuentes)
13. [Limitaciones y seguridad](#limitaciones-y-seguridad)

---

## Qué hace

| Área | Funciones |
|---|---|
| Movimientos | Gastos e ingresos con fecha, categoría y estado (pagado o pendiente). Repetición diaria, semanal, quincenal, mensual, cada 2, 3 o 6 meses, o anual. |
| Vista del mes | Totales, calendario con los días de pago marcados, pendientes y previsión del mes siguiente. |
| Vista del año | Totales anuales, gráfica mes a mes y reparto por categorías. |
| Informes | PDF de cualquier periodo con el resumen y la lista completa de gastos e ingresos. |
| Libros | Cada usuario puede tener varios (Personal, Casa…), cada uno con su moneda, y compartirlos con permiso de lectura o de edición. |
| Envíos | Estado de cuenta por WhatsApp, por correo o con el menú de compartir del dispositivo. |
| Bot de WhatsApp | Consulta de saldos y deudas, registro de movimientos y envío de PDF desde el chat. |
| Google (opcional) | Crear cuenta y entrar con Google. Al vincular Gmail, el bot registra solo los gastos que llegan por correo. |
| IA (opcional) | Conversación en lenguaje natural con Claude o con modelos de NVIDIA. |
| Administración | Uso del almacenamiento, alta y baja de usuarios, cambio de contraseñas, WhatsApp e IA. |
| App instalable | Funciona como aplicación (PWA) en Android, iPhone y ordenador, en modo claro u oscuro. |

---

## Guía de uso

### Cuenta

- **Crear cuenta:** en la pantalla de acceso, «Crear una». Pide nombre, correo, número de WhatsApp con código de país y una contraseña de al menos 8 caracteres. Un celular peruano de 9 dígitos recibe el prefijo 51 automáticamente.
- **Olvidé mi contraseña:** en la pantalla de acceso. Se envía un código de 6 dígitos, válido 15 minutos y con 5 intentos, por WhatsApp (si el bot está conectado y la cuenta tiene número) y por correo (si está configurado). Con el código se pone una contraseña nueva.
- **Continuar con Google:** en la pantalla de acceso, si Google está configurado. Entra en la cuenta con ese correo o crea una nueva (sin contraseña; se puede poner una después con «¿Olvidaste tu contraseña?»).
- **Mi cuenta:** en el menú. Permite cambiar el nombre y el número de WhatsApp, y vincular Gmail para que los gastos que llegan por correo se registren solos (ver [Google y gastos desde Gmail](#google-y-gastos-desde-gmail)).

### Fotos, PDF, audios y varios gastos por WhatsApp

- **Varios gastos en un mensaje**: uno por línea (*gasté 30 en pasajes* ↵ *gasté 100 en corte* ↵ *y 60 en desayuno*). Las líneas que empiezan por el monto siguen el tipo de la anterior. *deshacer* los borra todos juntos.
- **Fotos** (boletas, facturas, vouchers, capturas de Yape/Plin o del banco) y **PDF** (comprobantes, recibos, estados de cuenta): la IA lee los importes y registra cada movimiento. El texto que acompaña al archivo sirve de indicación («esto fue ayer», «es un ingreso»). Con Claude se leen también PDF escaneados; con NVIDIA se usa un modelo con visión para las fotos y el texto del PDF.
- **Audios**: se transcriben (requiere `GROQ_API_KEY` u `OPENAI_API_KEY`) y se tratan como un mensaje escrito.
- No se repiten movimientos ya anotados (mismo tipo, monto y fecha ±1 día).

### Asistente IA

En el menú, **Asistente IA** abre un chat (requiere la IA activada en Admin → IA). Se le puede preguntar por los gastos, pedir un análisis de los gastos que llegaron por Gmail (por comercio, categoría, suscripciones y cargos repetidos), registrar movimientos, pedir un PDF o pedir que la respuesta llegue por WhatsApp («mándamelo por WhatsApp»). Cada respuesta tiene además un botón «Enviar por WhatsApp». Conoce el resumen de cada mes (24 atrás y 12 adelante) y, si hace falta, consulta el detalle de cualquier periodo, así que se le puede preguntar por meses pasados o por todo el historial. También puede revisar los correos de Gmail de meses anteriores («escanea mis correos de los últimos 3 meses»), igual que el botón «Escanear correos» de *Mi cuenta*: de los meses elegidos o de todo el correo, por tandas de 100 avisos hasta terminar (máximo 5000 por escaneo), sin duplicar movimientos ya anotados (mismo tipo, monto y fecha ±1 día). Se puede detener, y si el servidor se reinicia sigue solo donde quedó. Mientras escanea, y siempre que haya algún Gmail activo, la app se visita a sí misma cada 4 minutos (con `APP_URL` o, en Render, `RENDER_EXTERNAL_URL`) para que Render no la apague y la sincronización automática siga funcionando. La conversación se comparte con el bot: se puede seguir en WhatsApp escribiendo «ia» y la pregunta. Trabaja sobre el libro elegido en la app.

### Menú

El botón de las tres rayas abre el menú lateral con las secciones (Mes, Año, Informe PDF, Compartir, Mi cuenta y, para el administrador, Admin), el libro activo, su moneda, el modo claro u oscuro, «Instalar app» y «Cerrar sesión».

### Libros y moneda

- Cada cuenta empieza con un libro «Personal» en soles (PEN).
- **+ Nuevo libro** crea otro, con su nombre y su moneda.
- El selector **Moneda del libro** cambia la moneda entre soles, dólares, euros o cualquier otra. Solo cambia el símbolo: no convierte los montos. Para llevar dos monedas, lo adecuado es un libro por cada una.

### Vista del mes

- **Tarjetas:** ingresos, gastos, balance y lo que falta por pagar.
- **Franja «Próximo mes»:** ingresos, gastos y balance previstos; al tocarla se abre ese mes.
- **Tres secciones**, para ver una cosa a la vez:
  - **Calendario:** un punto rojo marca los días con pagos sin hacer y uno gris los días con movimientos ya pagados o ingresos. Las flechas del propio calendario cambian de mes y «Hoy» vuelve al actual. Sin un día elegido, a la derecha se listan los pagos del mes, primero los pendientes; al tocar un día se ven solo los de esa fecha y se puede añadir uno ahí.
  - **Pendientes:** en el mes actual, lo vencido y lo que vence en los próximos 30 días; en otro mes, lo pendiente de ese mes.
  - **Movimientos:** todos los del mes.
- **Botón PDF:** descarga el informe del mes que se está viendo.

### Movimientos

- **+ Nuevo** abre el formulario: tipo, descripción, monto, fecha, categoría y si ya está pagado.
- **Tocar un movimiento** lo abre para editarlo; dentro está el botón **Eliminar**.
- **El botón de al lado** lo marca como pagado («Pagar» o «Cobrar») o lo desmarca («Deshacer»).

### Repetir

En el formulario, **Repetir** admite: cada día, cada semana, cada 2 semanas, cada mes, cada 2, 3 o 6 meses, y cada año. **Cuántas veces más** indica el número de repeticiones (hasta 366) y debajo se muestra la fecha de la última.

- Las repeticiones nacen pendientes, aunque el original esté pagado.
- Si el día no existe en un mes (por ejemplo el 31), se usa el último día de ese mes.
- Al editar un movimiento que ya se repetía y elegir una frecuencia, se **sustituyen sus repeticiones posteriores** por las nuevas. Para no tocarlas, se deja «No cambiar las repeticiones».
- Al eliminar un movimiento repetido, la app pregunta si borrar también las repeticiones siguientes.

### Vista del año

Totales del año y tres secciones: **Gráfica** (ingresos en barra sólida, gastos con trama), **Por mes** (tabla; al tocar un mes se abre) y **Categorías**.

### Informe PDF

- **Descarga rápida:** mes pasado, este mes, mes siguiente o todo el año.
- **Elegir fechas:** cualquier periodo de hasta 3 años, pasado o futuro.
- El PDF incluye el resumen del periodo y las listas de gastos y de ingresos con fecha, categoría, estado y monto. Los emojis de las descripciones se omiten porque el PDF no puede dibujarlos.

### Compartir

- **Enviar el estado de cuenta:** se elige el periodo (este mes, pasado, siguiente, año o fechas) y el destino:
  - **A mi WhatsApp:** el bot lo envía al número de la cuenta, con el PDF.
  - **Compartir…:** abre el menú del dispositivo (correo, WhatsApp, Drive…) con el PDF adjunto.
  - **Descargar PDF.**
  - **Enviar por correo:** a la dirección que se escriba.
- **Quién ve el libro:** lista de personas con acceso. El propietario puede cambiar permisos, quitar a alguien, renombrar o eliminar el libro.
- **Invitar a alguien:** por el correo con el que se registró, con acceso «Solo ver» o «Puede editar».

### Instalar como app

- **Ordenador (Chrome o Edge):** «Instalar app» en el menú, o el icono de instalar de la barra de direcciones.
- **Android:** menú del navegador → «Instalar aplicación».
- **iPhone/iPad (Safari):** Compartir → «Añadir a pantalla de inicio».

Solo se puede instalar desde una dirección **https** (o desde `http://localhost`).

---

## Bot de WhatsApp

El bot usa una cuenta de WhatsApp vinculada por código QR. Solo responde a los números registrados en la app; ignora los grupos y al resto de contactos.

### Vincularlo

1. En **Admin → WhatsApp**, pulsar «Conectar y mostrar código QR».
2. En el teléfono que hará de bot: WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escanear.
3. El estado pasa a «Conectado como +51…».

La sesión se guarda en MongoDB, así que sobrevive a reinicios y despliegues. «Desvincular» la cierra y la borra.

### Qué se le puede escribir

Al saludarlo («hola», «buenas tardes») responde según la hora y muestra un menú numerado. Durante 15 minutos se puede contestar solo con el número.

| N.º | Palabra | Qué hace |
|---|---|---|
| 1 | `resumen` | Estado de cuenta del mes |
| 2 | `deudas` | Pagos pendientes y vencidos, y lo que falta por cobrar |
| 3 | `proximo` | Previsión del mes siguiente |
| 4 | `año` | Totales del año |
| 5 | `pdf` | Informe del mes en PDF; también `pdf pasado` y `pdf siguiente` |
| 6 | `registrar` | Explica cómo anotar un movimiento |
| 7 | `libros` | Lista los libros; `libro 2` cambia al segundo |
| | `deshacer` | Borra el último movimiento registrado por el chat |
| | `menu` | Vuelve a mostrar las opciones |

### Registrar movimientos

```
gasto 25.50 almuerzo
ingreso 1200 salario
gasto 110 internet 28/10 #servicios pendiente
```

- **Monto:** admite decimales con punto o coma y separador de miles (`1,200`).
- **Fecha (opcional):** `hoy`, `ayer`, `anteayer`, `mañana` o `día/mes`. Sin fecha, es hoy.
- **Categoría (opcional):** con `#`, por ejemplo `#comida`.
- **Estado (opcional):** `pendiente` o `pagado`. Sin indicarlo, lo de hoy o antes queda pagado y lo futuro, pendiente.

Cada registro responde con una confirmación de lo guardado. Solo se puede registrar en libros propios o con permiso de edición.

### Inteligencia artificial

Con la IA activada (Admin → IA), se puede hablar con el bot en lenguaje natural empezando el mensaje por `ia`:

```
ia gasté 45 soles en gasolina ayer
ia ¿cuánto llevo gastado en comida?
ia mándame el pdf de septiembre
```

- **Qué puede hacer:** responder con los datos del libro, registrar gastos e ingresos, enviar el PDF de cualquier periodo y deshacer el último registro. Si falta el monto, pregunta en vez de suponerlo.
- **Qué no puede hacer:** editar movimientos existentes ni marcarlos como pagados; eso se hace en la app.
- **Cómo se protege:** la IA no escribe en la base de datos. Propone la acción y el servidor la valida (monto, fecha, permisos, máximo cinco por mensaje) antes de ejecutarla.
- **Sin el prefijo `ia`:** la opción «Responder a cualquier mensaje» hace que conteste a todo lo que escriban los usuarios registrados. Conviene activarla solo si el bot tiene un número dedicado.
- **Límite:** 40 mensajes a la IA por usuario y día.
- **Precisión:** un modelo puede equivocarse en alguna cuenta. Los comandos (`resumen`, `deudas`) siempre dan las cifras exactas.

### Para usarlo uno mismo

El dueño del número del bot puede escribirle desde su propio chat («Mensaje a ti mismo»). Su número debe estar en «Mi cuenta».

---

## Panel del administrador

El administrador es la primera cuenta registrada, o las que se indiquen en `ADMIN_EMAILS`. Ve la sección **Admin**, con cuatro apartados.

- **Almacenamiento:** espacio usado y libre en MongoDB (512 MB en el plan gratuito de Atlas), una estimación de cuántos movimientos caben y un aviso al superar el 80 %. Suma todas las bases de datos del clúster, porque el límite es compartido. También muestra el **tiempo de respuesta de la base de datos**: cada pantalla y cada respuesta del bot hacen varias consultas, así que si supera unos 150 ms conviene que el clúster de Atlas y el servidor estén en la misma región.
- **Usuarios:** lista con correo, WhatsApp, fecha de alta y número de libros. Permite crear cuentas, ponerles una contraseña nueva, enviarles su estado de cuenta por WhatsApp y eliminarlas. Al eliminar una cuenta se borran sus libros y movimientos, y pierde el acceso al instante.
- **WhatsApp:** vinculación del bot, estado y envío del estado de cuenta a todos los usuarios con número.
- **IA:** proveedor (Claude o NVIDIA), clave, modelo, activación y «Probar conexión». Las claves se guardan cifradas y solo se muestran sus cuatro últimos caracteres.

Cuando falla un envío de correo, al administrador se le muestra el motivo técnico en el aviso; los demás usuarios ven un mensaje genérico.

---

## Instalación en tu equipo

Requisitos: [Node.js](https://nodejs.org) 20.12 o superior.

```
npm install
npm start
```

Después se abre <http://localhost:3000>. Para desarrollar con reinicio automático: `npm run dev`.

Sin configurar MongoDB, la app arranca uno local y guarda los datos en `data/mongo` (la primera vez descarga el motor y tarda unos minutos).

> No arranques la app en tu equipo contra la misma base de datos que usa el servidor publicado mientras el bot de WhatsApp esté vinculado: las dos copias se disputarían la sesión.

---

## Configuración

Toda la configuración va en variables de entorno: en un archivo `.env` en tu equipo (copia `.env.example`) o en el panel del hosting. El archivo `.env` no se sube a GitHub.

### Base de datos

| Variable | Para qué sirve |
|---|---|
| `MONGODB_USER` | Usuario de la base de datos |
| `MONGODB_PASSWORD` | Contraseña. Se escribe tal cual, aunque tenga símbolos |
| `MONGODB_HOST` | Servidor del clúster, por ejemplo `cluster0.abcde.mongodb.net` |
| `MONGODB_DB` | Nombre de la base de datos (por defecto `gastos`) |
| `MONGODB_URI` | Alternativa: la cadena de conexión completa. Tiene prioridad sobre las anteriores |

### Servidor

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto (por defecto 3000; el hosting suele fijarlo) |
| `NODE_ENV` | `production` en el servidor publicado: activa cookies seguras y el modo tras proxy |
| `JWT_SECRET` | Clave para firmar las sesiones. Si falta, se genera y se guarda en `.env`. También cifra las claves de la IA: si cambia, hay que volver a escribirlas |

### Administración

| Variable | Para qué sirve |
|---|---|
| `ADMIN_EMAILS` | Correos de los administradores, separados por comas. Vacío: la primera cuenta registrada |
| `ALMACENAMIENTO_MB` | Espacio del plan de MongoDB en MB (por defecto 512) |

### Bot e IA

| Variable | Para qué sirve |
|---|---|
| `ZONA_HORARIA` | Zona con la que el bot decide qué día y hora es (por defecto `America/Lima`) |
| `ANTHROPIC_API_KEY` | Clave de Claude. Opcional: también se guarda desde Admin → IA |
| `NVIDIA_API_KEY` | Clave de NVIDIA. Opcional: también se guarda desde Admin → IA |

### Correo

| Variable | Para qué sirve |
|---|---|
| `CORREO_REMITENTE` | Dirección desde la que se envía. Obligatoria para cualquier método |
| `CORREO_NOMBRE` | Nombre visible del remitente (por defecto «N.F.T.A Gastos») |
| `BREVO_API_KEY` | Clave de la API de Brevo |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_TOKEN` | Cloudflare Email Service |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Servidor SMTP |

Si hay varios métodos configurados, se usa Brevo, después Cloudflare y por último SMTP.

### Google

| Variable | Para qué sirve |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ID de cliente OAuth de Google. Sin ellos no aparece el botón de Google |
| `APP_URL` | Dirección pública (`https://…`) para la vuelta desde Google. Si falta, se deduce de la petición |
| `GMAIL_MINUTOS` | Cada cuántos minutos se revisa el Gmail vinculado (por defecto 10, mínimo 2) |
| `GROQ_API_KEY` | Opcional. Para que el bot de WhatsApp entienda audios (Whisper en Groq, gratis en console.groq.com). También vale `OPENAI_API_KEY` |

---

## Publicarla en internet

La app necesita tres piezas: el código en GitHub, la base de datos en MongoDB Atlas y un hosting de Node (Render).

### 1. MongoDB Atlas

1. Crear un clúster gratuito en [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. En **Database Access**, crear un usuario de base de datos con contraseña.
3. En **Network Access**, permitir las IP del hosting. En Render aparecen en el servicio, en *Connect → Outbound*; la alternativa es `0.0.0.0/0`, que permite cualquier IP y deja la contraseña como única protección.

### 2. GitHub

```
git add -A
git commit -m "Descripción del cambio"
git push
```

No subas archivos arrastrándolos a la web de GitHub: ese método no respeta `.gitignore` y publicaría el archivo `.env` con las contraseñas.

### 3. Render

1. **New + → Web Service**, elegir el repositorio.
2. Ajustes: **Language** `Node`, **Branch** `main`, **Build Command** `npm ci --omit=dev`, **Start Command** `npm start`.
3. En **Environment**, añadir como mínimo:

   | Variable | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGODB_USER`, `MONGODB_PASSWORD`, `MONGODB_HOST`, `MONGODB_DB` | los de Atlas |
   | `JWT_SECRET` | un texto largo y aleatorio (botón *Generate*) |

4. Cada `git push` a `main` vuelve a desplegar automáticamente.

El archivo `render.yaml` permite crear el servicio como *Blueprint* con esos ajustes ya puestos.

### 4. Dominio propio (opcional)

1. En Render: *Settings → Custom Domains → Add Custom Domain*, por ejemplo `gastos.tu-dominio.com`.
2. En el proveedor del dominio: un registro `CNAME` con ese nombre apuntando a la dirección `…onrender.com` del servicio. En Cloudflare, con el proxy desactivado («Solo DNS») para que Render pueda verificarlo.
3. En Render, pulsar **Verify**.

### 5. Mantenerla despierta

En el plan gratuito de Render el servicio se duerme tras 15 minutos sin visitas. Dormido, la primera carga tarda cerca de un minuto y **el bot de WhatsApp no responde**. Se evita con un monitor gratuito (por ejemplo UptimeRobot) que visite la dirección cada 10 minutos, o con un plan de pago.

---

## Envío de correo

Sirve para enviar estados de cuenta por correo y el código de «olvidé mi contraseña». Sin configurarlo, esas funciones siguen disponibles por WhatsApp y con «Compartir…».

### Brevo (recomendado)

Gratis hasta 300 correos al día, a cualquier destinatario, y funciona en el plan gratuito de Render.

1. Crear una cuenta en [brevo.com](https://www.brevo.com) y verificar el teléfono.
2. **Autenticar el dominio:** engranaje → *Remitentes, dominios e IP → Dominios → Añadir un dominio*. Brevo crea los registros DNS de forma automática si el dominio está en Cloudflare, o los muestra para copiarlos. Los `CNAME` deben quedar con el proxy desactivado y solo puede existir un registro `_dmarc`.
3. **Crear el remitente:** pestaña *Remitentes → Añadir un remitente*, con una dirección del dominio.
4. **Crear la clave:** menú de la cuenta → *SMTP y API → Claves API*.
5. En el hosting: `BREVO_API_KEY` y `CORREO_REMITENTE`.

### Cloudflare Email Service

Requiere el dominio en Cloudflare y, para enviar a cualquier destinatario, el plan Workers Paid; sin él solo entrega a direcciones verificadas.

1. En Cloudflare: *Cómputo → Servicio de correo electrónico → Envío de correo electrónico → Incorporar dominio*.
2. Crear un token: *Mi perfil → Tokens de API → Crear token personalizado*, con el permiso **Cuenta → Envío de correo electrónico → Editar**, limitado a la cuenta y sin filtro de IP.
3. En el hosting: `CLOUDFLARE_EMAIL_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` y `CORREO_REMITENTE`.

El **ID de cuenta** es el código que aparece en la barra de direcciones tras `dash.cloudflare.com/`. No hay que confundirlo con el ID de zona del dominio: con el de zona, Cloudflare responde «Authentication error».

### SMTP

`SMTP_HOST`, `SMTP_PORT` (587, o 465 con cifrado directo), `SMTP_USER`, `SMTP_PASS` y `CORREO_REMITENTE`. El plan gratuito de Render bloquea los puertos de correo, así que esta opción es para otros hostings o para pruebas locales.

---

## Google y gastos desde Gmail

Con Google configurado aparecen dos cosas:

- **«Continuar con Google»** en la pantalla de acceso: entra o crea la cuenta solo con nombre y correo de Google.
- **«Vincular con Google»** en *Mi cuenta*: da permiso de solo lectura sobre Gmail. Cada `GMAIL_MINUTOS` (10 por defecto) el servidor busca correos nuevos de compras, consumos, pagos, Yape/Plin, transferencias, boletas y recibos, y registra cada gasto o ingreso (yapeos y transferencias recibidas, depósitos, sueldo, devoluciones) en el libro activo del bot, con la fecha del correo, así que aparece en el calendario marcado con 📧. No cuenta las transferencias entre cuentas propias ni los pagos de la tarjeta de crédito. Si la persona tiene WhatsApp, le llega un aviso y puede responder «deshacer».

Cómo decide si un correo es un gasto:

- **Con la IA activada** (Admin → IA), el modelo lee el correo y extrae monto, moneda, comercio, categoría y fecha; descarta publicidad, recordatorios, dinero recibido y devoluciones.
- **Sin IA**, solo se registran correos cuyo asunto dice claramente compra, consumo, pago o transferencia y que traen un importe en S/, US$, $ o €.

Solo se leen correos recibidos **después de vincular**. Cada correo se revisa una sola vez. Si el cobro está en otra moneda que la del libro, la descripción empieza por esa moneda (por ejemplo `[USD]`).

### Configurarlo en Google Cloud

1. En [console.cloud.google.com](https://console.cloud.google.com) crear un proyecto.
2. *APIs y servicios → Biblioteca* → activar **Gmail API**.
3. *Pantalla de consentimiento de OAuth*: tipo **Externo**, nombre de la app, correo de soporte y, en *Permisos (scopes)*, añadir `.../auth/gmail.readonly`. Mientras esté **en pruebas**, añadir en *Usuarios de prueba* los correos que lo vayan a usar (máximo 100).
4. *Credenciales → Crear credenciales → ID de cliente de OAuth* → **Aplicación web**, con este URI de redirección autorizado:
   - `https://TU-DOMINIO/api/auth/google/callback`
   - para pruebas locales, también `http://localhost:3000/api/auth/google/callback`
5. En el hosting: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `APP_URL` (la dirección pública, sin barra final).

`gmail.readonly` es un permiso «restringido»: para abrirlo a cualquier persona (no solo usuarios de prueba) Google exige verificar la app y una evaluación de seguridad. En modo pruebas, Google pide volver a vincular cada 7 días.

En el plan gratuito de Render el servicio se duerme sin visitas y mientras duerme no revisa el correo; al despertar recupera los correos pendientes de la última semana (ver [Mantenerla despierta](#5-mantenerla-despierta)).

---

## Cómo está hecha

### Tecnologías

- **Servidor:** Node.js con Express 5 y Mongoose (MongoDB).
- **Interfaz:** HTML, CSS y JavaScript sin frameworks ni paso de compilación.
- **Sesiones:** JWT en una cookie `httpOnly`, contraseñas con bcrypt.
- **PDF:** pdfkit. **WhatsApp:** Baileys. **Correo:** Nodemailer y las API de Brevo y Cloudflare. **IA:** SDK de Anthropic y la API de NVIDIA.

### Estructura

```
server/
  index.js      Arranque: seguridad, rutas y archivos estáticos
  config.js     Lectura de las variables de entorno
  db.js         Conexión a MongoDB, con reintentos
  models.js     Esquemas: Usuario, Libro, Movimiento, Ajuste, SesionWa, CorreoVisto
  auth.js       Registro, sesión, recuperación de contraseña y permisos de administrador
  routes.js     Libros, miembros, movimientos, resumen, informe PDF y envíos
  admin.js      Almacenamiento, usuarios, WhatsApp e IA
  bot.js        Lógica del bot: comandos, registro de movimientos e informes
  whatsapp.js   Conexión por QR, sesión en MongoDB y mensajes entrantes
  ia.js         Proveedores de IA, cifrado de claves y conversación
  informe.js    Generación del PDF
  correo.js     Envío de correo por Brevo, Cloudflare o SMTP
  google.js     Acceso con Google y lectura de Gmail para registrar gastos
  errores.js    Errores HTTP y validación de textos
public/
  index.html    Estructura de la página y los diálogos
  app.js        Toda la lógica de la interfaz
  styles.css    Estilos, modo claro y oscuro, adaptación a móvil
  tema.js       Aplica el tema guardado antes de pintar la página
  sw.js         Service worker: caché de la interfaz para la app instalada
  manifest.webmanifest, icons/   Datos e iconos de la app instalable
imag/           Logo original
render.yaml     Definición del servicio para Render
```

### Datos

| Colección | Contenido |
|---|---|
| `usuarios` | Nombre, correo, contraseña cifrada, WhatsApp, libro activo del bot y código de recuperación |
| `libros` | Nombre, moneda, propietario y miembros con su permiso (`lector` o `editor`) |
| `movimientos` | Libro, tipo, descripción, categoría, monto, fecha, si está pagado y la serie de repetición |
| `ajustes` | Configuración de la IA, con las claves cifradas |
| `sesionwas` | Sesión del bot de WhatsApp |

Las fechas de los movimientos se guardan a medianoche UTC y se manejan como `AAAA-MM-DD`.

### API

Todas las rutas empiezan por `/api`. Salvo las de acceso, requieren sesión.

**Acceso (`/api/auth`)**

| Método y ruta | Función |
|---|---|
| `POST /registro` | Crear cuenta |
| `POST /login`, `POST /logout` | Iniciar y cerrar sesión |
| `GET /yo`, `PATCH /yo` | Ver y cambiar los datos de la propia cuenta |
| `GET /recuperacion` | Canales disponibles para recuperar la contraseña |
| `POST /olvide` | Pedir el código de recuperación |
| `POST /restablecer` | Cambiar la contraseña con el código |

**Libros y movimientos**

| Método y ruta | Función |
|---|---|
| `GET /canales` | Canales de envío activos y datos de contacto propios |
| `GET /libros`, `POST /libros` | Listar y crear libros |
| `PATCH /libros/:id`, `DELETE /libros/:id` | Editar y eliminar (solo el propietario) |
| `GET`, `POST /libros/:id/miembros` | Ver e invitar miembros |
| `PATCH`, `DELETE /libros/:id/miembros/:usuarioId` | Cambiar permiso y quitar acceso |
| `GET /libros/:id/movimientos?mes=AAAA-MM` | Movimientos de un mes |
| `GET /libros/:id/pendientes?hasta=AAAA-MM-DD` | Pendientes hasta una fecha |
| `POST /libros/:id/movimientos` | Crear, con repetición opcional |
| `PATCH`, `DELETE /libros/:id/movimientos/:movId` | Editar y eliminar |
| `GET /libros/:id/resumen?anio=AAAA` | Totales del año por mes y categoría |
| `GET /libros/:id/informe.pdf?desde=…&hasta=…` | Informe en PDF |
| `POST /libros/:id/enviar` | Enviar el estado de cuenta por WhatsApp o correo |

**Administración (`/api/admin`, solo administradores)**

| Método y ruta | Función |
|---|---|
| `GET /almacenamiento` | Uso de la base de datos |
| `GET`, `POST /usuarios` | Listar y crear usuarios |
| `PATCH /usuarios/:id`, `DELETE /usuarios/:id` | Cambiar contraseña y eliminar |
| `GET /whatsapp`, `POST /whatsapp/conectar`, `POST /whatsapp/desconectar` | Estado y vinculación del bot |
| `POST /whatsapp/enviar` | Enviar estados de cuenta |
| `GET`, `PUT /ia`, `POST /ia/probar` | Ajustes y prueba de la IA |

### Seguridad

- Contraseñas con bcrypt; sesión en cookie `httpOnly` y `SameSite=Lax`, segura en producción.
- Cabeceras de seguridad con Helmet, incluida una política de contenido estricta.
- Límite de intentos en acceso, registro y recuperación; límite de envíos por usuario.
- Cada petición comprueba que la cuenta sigue existiendo y el permiso sobre el libro.
- Un libro ajeno responde 404, igual que uno inexistente.
- La recuperación de contraseña responde lo mismo exista o no la cuenta.
- Las claves de la IA se guardan cifradas (AES-256-GCM) y nunca se devuelven completas.
- La interfaz no usa `innerHTML`: el texto de los usuarios no se interpreta como HTML.

---

## Mantenimiento

- **Publicar cambios:** `git add -A`, `git commit -m "…"`, `git push`. Render despliega solo.
- **Tras cambiar archivos de `public/`:** subir el número de `CACHE` en `public/sw.js`. Así los dispositivos con la app instalada descargan la versión nueva.
- **Ver la versión nueva en una app instalada:** cerrarla y abrirla dos veces.
- **Añadir un administrador:** variable `ADMIN_EMAILS`. Conviene registrar la cuenta antes de añadir su correo, porque el registro no verifica que el correo sea de quien lo usa.
- **Copias de seguridad:** el plan gratuito de Atlas no las incluye. Se puede exportar con `mongodump` o con MongoDB Compass.

---

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Pantalla de Render «Application loading» que no termina | El servicio estaba dormido | Esperar hasta un minuto. Para evitarlo, un monitor que lo mantenga despierto |
| Aviso «MongoDB Atlas no permite la IP de este servidor» | La IP del hosting no está permitida | Atlas → Network Access → añadir la IP |
| Aviso «El usuario o la contraseña de MongoDB no son correctos» | Variables `MONGODB_USER` o `MONGODB_PASSWORD` | Corregirlas en el hosting |
| Al escanear el QR no se vincula | Código caducado o demasiados dispositivos vinculados | Escanear un código recién generado; quitar dispositivos en WhatsApp |
| El bot no responde | Servicio dormido, número sin registrar o sesión cerrada | Mantener el servicio activo; revisar «Mi cuenta»; reconectar en Admin → WhatsApp |
| El bot no responde a frases normales | La IA exige el prefijo `ia` | Empezar por `ia` o activar «Responder a cualquier mensaje» |
| «No se pudo enviar el correo» | Configuración del servicio de correo | El aviso del administrador muestra el motivo; también en los registros, línea `Correo:` |
| Correo: «Authentication error» con Cloudflare | Se puso el ID de zona en lugar del de cuenta | Usar el ID de cuenta |
| Correo: «sending_disabled» con Cloudflare | Dominio sin incorporar o plan sin envío | Incorporar el dominio o usar Brevo |
| La IA de NVIDIA dice que el modelo no está disponible | Ese modelo no está habilitado en la cuenta | Elegir otro y usar «Probar conexión» |
| No aparece la versión nueva en la app instalada | Caché del service worker | Cerrarla y abrirla dos veces |
| En GitHub: «Try uploading fewer than 100 at a time» | Se arrastró la carpeta completa a la web | Subir con `git push` |

En el servidor, los registros muestran el motivo de los fallos de conexión con líneas que empiezan por `CAUSA PROBABLE:`, `WhatsApp:`, `Correo:` o `IA:`.

---

## Limitaciones y seguridad

- **WhatsApp no oficial:** el bot usa WhatsApp Web mediante la librería Baileys, fuera de las condiciones de WhatsApp. El número puede ser bloqueado si se detecta automatización o muchos envíos seguidos, por lo que conviene un número dedicado.
- **El bot depende del servidor:** con el servicio dormido no contesta, y un mensaje de WhatsApp no lo despierta.
- **`deshacer` es de corto plazo:** recuerda solo el último registro y lo olvida si el servidor se reinicia.
- **Sin verificación de correo ni de teléfono:** al registrarse no se comprueba que sean de quien los escribe. Nadie puede ver datos ajenos por eso, pero alguien podría registrar un número que no es suyo e impedir que su dueño lo use.
- **Registro abierto:** cualquiera que conozca la dirección puede crearse una cuenta.
- **Sin conversión de moneda:** cambiar la moneda de un libro solo cambia el símbolo.
- **La IA puede equivocarse** en cálculos; las cifras de los comandos y de la app son las exactas.
- **Credenciales:** las claves y contraseñas que se hayan compartido por chat, capturas o repositorios públicos deben renovarse (contraseña de MongoDB, claves de IA, tokens de correo). Los archivos `.env` y `atlas-credentials.env` están en `.gitignore` y no deben subirse nunca.
