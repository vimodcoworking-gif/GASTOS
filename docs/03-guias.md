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

## iPhone: atajo «DUOLAB Yape» (automático al abrir Yape)

Apple no deja que ninguna app lea las notificaciones de Yape. El atajo hace lo más cercano: **cada vez que se abre Yape** (también al tocar la notificación «Te yapearon»), espera 6 segundos, toma una captura de la lista de movimientos y la envía al enlace personal con `?silencioso=1`. Se registra todo lo nuevo, de cualquier monto, sin repetir; si no hay nada nuevo (pantalla de la clave, todo ya registrado) responde sin mensaje y el iPhone no muestra nada.

El tutorial está dentro de la app (se abre solo una vez en iPhone, y en Mi cuenta → Yape, Plin y avisos del teléfono → **Ver tutorial**).

**Video tutorial** (1:43, con voz): `public/videos/tutorial-atajo-iphone.mp4`, en https://gastos-g63s.onrender.com/videos/tutorial-atajo-iphone.mp4. En la app: botón **▶ Ver video** en Mi cuenta y en el primer paso del tutorial. Se genera con [herramientas/video-atajo](../herramientas/video-atajo/LEEME.md) (dibujos con Pillow, voz de Windows «Sabina», ffmpeg).

### Para el administrador: publicar el atajo una vez

Apple no permite crear atajos desde una web ni generarlos en un servidor (tienen que ir firmados). Por eso se crea **una vez** en un iPhone y se comparte por iCloud; desde entonces cada usuario lo añade con un toque.

1. En DUOLAB, Ver tutorial → **Copiar enlace** (se copia con `?silencioso=1`).
2. Atajos → «+» → nombre **DUOLAB Yape**.
3. **Texto**: el enlace copiado.
4. **Esperar**: 6 segundos.
5. **Hacer captura de pantalla**.
6. **Obtener contenido de URL**: URL = Texto; Método POST; Cuerpo Archivo = Captura de pantalla.
7. **Obtener valor del diccionario**: clave `mensaje`.
8. **Si** Valor del diccionario *tiene algún valor* → **Mostrar notificación** con ese valor.
9. «i» del atajo → **Configurar este atajo** (preguntas de importación) → pregunta para el campo Texto: «Pega tu enlace de DUOLAB (ya está copiado)».
10. Compartir → **Copiar enlace de iCloud** → pegarlo en **Admin → Atajo iPhone** → Guardar.

Sin enlace publicado, el tutorial explica cómo crear el atajo acción por acción.

### Para cada usuario

1. **Añadir el atajo**: en el tutorial, «Copiar enlace y añadir atajo» → **Añadir atajo** → pegar el enlace cuando lo pida.
2. **Automatización** (esto Apple no deja automatizarlo, son 5 toques): Atajos → Automatización → «+» → **App** → Yape → solo **«Se abre»** → **«Ejecutar inmediatamente»** (sin «Notificar al ejecutar») → Siguiente → **DUOLAB Yape**.
3. En Yape, dejar visibles los movimientos («Mostrar movimientos») si están ocultos.
4. La primera vez: **Permitir siempre** la conexión a `gastos-g63s.onrender.com`. Comprobar en Mi cuenta → **Últimos envíos** (los envíos automáticos sin nada nuevo aparecen como «(automático)»).

Opcional: el mismo atajo en **Ajustes → Accesibilidad → Tocar → Tocar atrás → Doble toque**, para enviarlo cuando se quiera.

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
