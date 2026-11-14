# Documentación de DUOLAB Gastos

DUOLAB Gastos es una app web instalable (PWA) que registra gastos, ingresos y pagos pendientes, y los llena sola desde Gmail, Yape, Plin, bancos y WhatsApp.

- App publicada: <https://gastos-g63s.onrender.com>
- Código: GitHub `vimodcoworking-gif/GASTOS` (rama `main`; Render publica cada cambio que se sube)
- Última revisión de esta documentación: 14 de noviembre de 2026 (versión `6cfb2b5`)

## Índice

| Documento | Para quién | Contenido |
| --- | --- | --- |
| [01 · Funciones](01-funciones.md) | Usuarios | Qué hace cada sección de la app |
| [02 · Registro automático](02-registro-automatico.md) | Usuarios y soporte | Gmail, Yape, atajo de iPhone, Android, WhatsApp, capturas, duplicados y límites |
| [03 · Guías paso a paso](03-guias.md) | Usuarios | Instalar la app, notificaciones, atajo y automatización de iPhone, MacroDroid, gestos |
| [04 · Administración](04-administracion.md) | Administrador | Panel Admin: IA, WhatsApp, usuarios, almacenamiento, licencias |
| [05 · Arquitectura](05-arquitectura.md) | Desarrollo | Tecnologías, módulos, base de datos, API y tiempo real |
| [06 · Configuración y despliegue](06-despliegue.md) | Desarrollo | Render, GitHub, variables de entorno, cómo publicar y comprobar la versión |
| [07 · Tareas automáticas y mantenimiento](07-mantenimiento.md) | Desarrollo y soporte | Revisiones periódicas, limpiezas y correcciones únicas |
| [08 · Solución de problemas](08-problemas.md) | Soporte | Síntomas frecuentes y qué revisar |
| [09 · Historial de cambios](09-cambios.md) | Todos | Cambios publicados, del más reciente al más antiguo |

## En una frase por parte

- **Datos:** todo se guarda en MongoDB (plan gratuito de 512 MB); cada movimiento ocupa unos 250 bytes.
- **Servidor:** Node.js 20 con Express 5, en Render.
- **App:** una sola página en JavaScript sin framework, con service worker para instalarla y abrirla al instante.
- **Fuentes automáticas:** Gmail cada 3 minutos, enlace personal para el teléfono, bot de WhatsApp y capturas leídas por IA.
- **Avisos:** notificaciones push y WhatsApp para movimientos nuevos y pagos por vencer.
