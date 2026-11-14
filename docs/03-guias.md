# 03 · Guías paso a paso

## Instalar la app

La app avisa una sola vez con la ventana **«Instala DUOLAB Gastos»**; se puede volver a ver en el menú ☰ → **Instalar app**.

| Dispositivo | Cómo |
| --- | --- |
| iPhone / iPad | En **Safari**: Compartir → **Agregar a inicio** → Agregar. Abrirla desde el icono. |
| Android | En Chrome: menú ⋮ → **Instalar app** (o el botón «Instalar ahora» de la ventana). |
| PC / Mac | En Chrome o Edge: icono **Instalar** de la barra de direcciones. |

Si cambia el logo o el nombre, una app ya instalada puede seguir mostrando los viejos: hay que desinstalarla y volver a instalarla.

## Activar las notificaciones

1. **Mi cuenta → App y notificaciones → Activar** y permitir el aviso del navegador.
2. **Probar** envía una notificación de prueba.
3. Se activan **por dispositivo** (hasta 10 por persona).

En iPhone solo funcionan con la app **instalada desde Safari y abierta desde su icono** (iOS 16.4 o posterior). Si se negó el permiso: Ajustes → Notificaciones → DUOLAB.

## iPhone: atajo «Registrar Yape»

El tutorial está también dentro de la app: Mi cuenta → Yape, Plin y avisos del teléfono → iPhone → **Ver tutorial**.

**Parte 1 · El atajo**

1. En DUOLAB, Mi cuenta → Yape, Plin y avisos del teléfono → **Copiar** el enlace.
2. App **Atajos** → pestaña Atajos → **«+»**.
3. Añadir acción **«Hacer captura de pantalla»**.
4. Añadir **«Obtener contenido de URL»**: URL = tu enlace; tocar «>»: **Método POST**, **Cuerpo de la solicitud: Archivo**, Archivo = **Captura de pantalla**.
5. (Opcional) **«Obtener valor del diccionario»** con la clave `mensaje` y **«Mostrar notificación»** con ese valor.
6. Nombre: **Registrar Yape** → OK.
7. **Ajustes → Accesibilidad → Tocar → Tocar atrás → Doble toque** → Registrar Yape.

Uso: en Yape, con la constancia o «Mostrar movimientos» en pantalla, tocar dos veces la parte de atrás del iPhone.

**Parte 2 · Envío automático al cerrar Yape (recomendado)**

1. Atajos → pestaña **Automatización** → «+» → **App** → Yape.
2. Marcar **«Se cierra»** (desmarcar «Se abre») → **«Ejecutar inmediatamente»** → Siguiente → **Nuevo atajo en blanco**.
3. Añadir **«Obtener las últimas capturas de pantalla»** (cantidad 1) y **«Obtener contenido de URL»** con el enlace, POST, Archivo → Capturas de pantalla. OK.

Uso: después de yapear o recibir un Yape, hacer una captura y cerrar Yape. Si no hay captura nueva, no se repite nada.

**La primera vez** el iPhone pregunta si el atajo puede conectarse a `gastos-g63s.onrender.com` y ver las capturas: **Permitir siempre**. Comprobar en Mi cuenta → **Últimos envíos**.

## Android: MacroDroid (automático)

1. Instalar **MacroDroid** y crear una macro.
2. Disparador: **Notificación recibida** → Yape (y Plin o el banco).
3. Acción: **Solicitud HTTP**, método POST, URL = tu enlace, cuerpo JSON:
   `{"titulo":"[notification_title]","texto":"[notification]","app":"[app_name]"}`
4. Dar a MacroDroid permiso de acceso a notificaciones y hacer un Yape de prueba.

## Gmail

1. Mi cuenta → **Vincular con Google** y aceptar el permiso de lectura.
2. Para sumar otro correo: **+ Añadir otro correo**.
3. Para traer correos antiguos: **Correos anteriores** → periodo → **Escanear correos**.

## Gestos en la app instalada

| Gesto | Qué hace |
| --- | --- |
| Botón o gesto **atrás** (Android, navegador) | Cierra la ventana o el menú abierto; si no hay, vuelve a la sección anterior. |
| **Deslizar desde el borde izquierdo** (iPhone instalado) | Atrás. |
| **Tirar hacia abajo** arriba del todo | Actualiza los datos. |
| Botón **casa** de la barra inferior | Vuelve a Mes. |
