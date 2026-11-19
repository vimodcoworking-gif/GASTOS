# 01 · Funciones de la app

Todo se organiza por **libros** (por ejemplo «Personal» o «Negocio»). Cada libro tiene su moneda y puede compartirse con otras personas como lector o editor. El libro activo se elige en el menú ☰ → **Libro**.

## Secciones

| Sección | Qué muestra o permite |
| --- | --- |
| **Mes** (inicio) | Tarjeta principal con el balance del mes, la gráfica de gastos de los últimos 7 días (con curva y el día de más gasto resaltado), promedio diario y día con más gasto. A la derecha: Ingresos, Gastos, Balance y Falta por pagar. Debajo, el resumen del próximo mes. Botones **Añadir gasto**, **Añadir ingreso** y **Subir captura de Yape, Plin o del banco**. |
| **Calendario** | Cada día muestra lo gastado en pequeño (por ejemplo «805» o «1.3k»). Al tocar un día: **Gastaste**, **Recibiste**, número de movimientos y la lista, con filtros por medio (Yape, Plin, Tarjeta, Efectivo) y por banco. |
| **Pendientes** | Pagos y cobros sin marcar, vencidos y de los próximos 30 días. Botón ✓ para marcarlos pagados o cobrados. |
| **Movimientos** | Todos los movimientos del mes agrupados por día, con totales. |
| **Gráficas** | Gastos por categoría y evolución del mes. |
| **Año** | Ingresos y gastos de cada mes del año y totales. |
| **Categorías y presupuestos** | Categorías propias con color y presupuesto mensual. La barra se pone naranja cerca del límite y roja con «Te pasaste S/ X». Renombrar una categoría mueve sus movimientos; quitarla los pasa a «General». |
| **Metas de ahorro** | Meta con objetivo, lo ya ahorrado, fecha límite, icono y color. Anillo de progreso, cuánto falta y cuánto ahorrar al mes. **Aportar** y **Retirar** (opcionalmente registrados como gasto «Ahorro» o ingreso). |
| **Asistente IA** | Preguntas sobre los gastos («¿cuánto gasté este mes?»), análisis de los gastos del correo, envío de resúmenes o PDF por WhatsApp. |
| **Informe PDF** | Descarga del informe de cualquier periodo con resumen y lista completa. |
| **Compartir** | Enviar el estado de cuenta por WhatsApp o correo; invitar personas al libro y cambiar sus permisos. |
| **Mi cuenta** | Tus datos y WhatsApp, recordatorios de pago, app y notificaciones del dispositivo, Gmail vinculado (con escaneo y correos revisados), enlace de avisos del teléfono y **Últimos envíos**. |
| **Admin** | Solo para administradores; ver [04 · Administración](04-administracion.md). |

## Movimientos

Cada movimiento tiene: tipo (gasto o ingreso), descripción, monto, fecha, categoría, medio de pago (Yape, Plin, tarjeta, transferencia, efectivo, otro), banco o entidad, si está pagado y, si es un gasto pendiente, cuándo recordarlo.

- Tocar un movimiento lo abre para **editarlo o eliminarlo**.
- Un movimiento puede **repetirse** (cada día, semana, 2 semanas, mes, 2 meses, 3 meses, 6 meses o año).
- El icono ✉ indica que vino del correo; la campana, que tiene recordatorio.

## Recordatorios de pago

- En **Mi cuenta → Recordatorios de pago** eliges cuándo avisar: 1, 2, 3, 5 o 7 días antes, y si también el mismo día. Por defecto: 2 días antes y el mismo día.
- En cada gasto pendiente puedes cambiarlo en **Recordarme por WhatsApp** o desactivarlo.
- El aviso llega por **WhatsApp** y por **notificación** (si está activada), de 8:00 a 21:00, una sola vez por cada aviso. Al marcar el pago como pagado deja de recordarse.

## Notificaciones

Avisan de cada movimiento registrado solo (correo, teléfono, capturas, otra persona del libro) y de los recordatorios. Se activan por dispositivo en **Mi cuenta → App y notificaciones**, donde **Probar notificación** manda una de prueba. En iPhone solo funcionan con la app instalada (iOS 16.4 o posterior).

En la app Android, **Más → Configuración** permite elegir qué avisos llegan (movimientos, pagos por vencer, actualizaciones) y silenciarlos de noche; también el tema (Claro, Oscuro o Automático), la pestaña de inicio y qué apartados se ven en la barra.

En la **app Android nativa** llegan **al instante** (Firebase Cloud Messaging) cuando el servidor tiene Firebase configurado ([06 · Firebase](06-despliegue.md#firebase-notificaciones-al-instante-en-la-app-android)); si no, la app revisa cada 15 minutos. Mi cuenta dice cuál de los dos está activo.

## Tiempo real

La app abierta se actualiza sola cuando entra un movimiento nuevo y muestra «🔔 Nuevo movimiento registrado». Si hay un formulario abierto, espera a que se cierre. Al volver a la app desde segundo plano también se ponen al día los datos.

## Diseño de la pantalla de inicio

El botón de cuadritos de la barra de arriba (al lado de «+ Nuevo», solo en Mes) abre **Diseño de inicio**:

| Diseño | Orden |
| --- | --- |
| **Automático** (por defecto) | Elige solo el que mejor va con tus datos: con pagos vencidos o 3+ pendientes → Pagos primero; 40+ movimientos en el mes → Resumen primero; menos de 10 → Sencillo; si no, Clásico. Se recomienda con «★ Recomendado para ti». |
| **Clásico** | Tarjeta del mes con la gráfica y los totales al lado, próximo mes y pestañas. |
| **Resumen primero** | Los cuatro totales en una fila arriba, luego la tarjeta del mes y las pestañas. |
| **Pagos primero** | Totales y la lista de lo que falta pagar o cobrar arriba, luego la tarjeta del mes. |
| **Sencillo** | Tarjeta del mes sin gráfica, totales y los últimos 8 movimientos. |

La elección se guarda en cada dispositivo.

## Apariencia

- Tema claro (por defecto) u oscuro desde el menú ☰ → **Modo oscuro**.
- Diseño adaptado de 320 px (teléfonos pequeños) a 1920 px (monitores).
- En teléfono y tableta, la **barra inferior** es la navegación principal (Mes, Metas, Categorías, Asistente) y **Más** abre el menú solo con lo que no está en la barra (Año, Informe PDF, Compartir, Mi cuenta, tema, libro, cerrar sesión). En PC no hay barra inferior y el menú ☰ tiene todas las secciones.
