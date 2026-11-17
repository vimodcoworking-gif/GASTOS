# 06 · Configuración y despliegue

## Dónde vive

- **Código:** GitHub `vimodcoworking-gif/GASTOS`, rama `main`.
- **Servidor:** Render, servicio web `nfta-gastos` (plan gratuito), definido en `render.yaml`. Compila con `npm ci --omit=dev` y arranca con `npm start` (`node server/index.js`).
- **Base de datos:** MongoDB Atlas, base `gastos` (plan gratuito, 512 MB).
- **URL pública:** <https://gastos-g63s.onrender.com>

## Publicar un cambio

1. Subir el cambio a `main` en GitHub.
2. Render compila y publica solo (unos 5 minutos; más si cambian dependencias, por ejemplo `sharp` o `web-push`).
3. Comprobar la versión publicada: <https://gastos-g63s.onrender.com/api/version> devuelve el commit (`version`) y la hora de arranque (`desde`).
4. En el navegador, recargar con **Ctrl + F5**. La app instalada se actualiza sola: abre la copia guardada, descarga la nueva por detrás y se recarga una vez (salvo con un formulario abierto).

Si cambia algo de `public/`, hay que subir la versión de caché en `public/sw.js` (`const CACHE = 'nfta-gastos-vNN'`) para que los teléfonos tomen los archivos nuevos.

## Variables de entorno

Se ponen en Render → Environment (y en local, en un archivo `.env` que nunca se sube a GitHub; plantilla en `.env.example`).

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `MONGODB_USER`, `MONGODB_PASSWORD`, `MONGODB_HOST`, `MONGODB_DB` | Sí (o `MONGODB_URI`) | Conexión a MongoDB Atlas |
| `JWT_SECRET` | Sí en producción | Firma de las sesiones (Render la genera) |
| `NODE_ENV=production` | Sí en producción | Cookies seguras |
| `APP_URL` | Recomendada | Dirección pública; necesaria para mantener despierto el servidor y para los enlaces |
| `ADMIN_EMAILS` | No | Quién ve Admin (si falta: la primera cuenta) |
| `ALMACENAMIENTO_MB` | No | Límite del plan de MongoDB (512) |
| `ZONA_HORARIA` | No | Por defecto `America/Lima` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Para Gmail | Entrar con Google y leer Gmail (Google Cloud: Gmail API, permiso `gmail.readonly`, redirección `https://<dominio>/api/auth/google/callback`) |
| `GMAIL_MINUTOS` | No | Cada cuántos minutos se revisa Gmail (por defecto 3, mínimo 2) |
| `ANTHROPIC_API_KEY`, `NVIDIA_API_KEY` | No | Claves de IA (también se pueden poner en Admin → IA) |
| `GROQ_API_KEY` u `OPENAI_API_KEY` | No | Audios de WhatsApp a texto |
| `CORREO_REMITENTE`, `CORREO_NOMBRE` + Cloudflare / Brevo / SMTP | No | Enviar correos (estado de cuenta, recuperar contraseña). Render gratuito bloquea los puertos SMTP. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` | No | Notificaciones push (si faltan, se generan solas y se guardan en la base) |
| `VIMOD_MONGODB_URI`, `VIMOD_MONGODB_DB`, `VIMOD_SOFTWARE`, `LICENCIA_LIBRE` | No | Licencias de VIMOD |

## App Android

El APK no lo compila Render: se compila en una PC con Android Studio ([android/LEEME.md](../android/LEEME.md)), se copia a `public/descargas/duolab-gastos.apk` y se publica como cualquier cambio. Variable opcional `ANDROID_SHA256`: huella de la firma para `/.well-known/assetlinks.json`.

## Trabajar en local

```bash
npm install
cp .env.example .env   # y rellenar
npm run dev            # http://localhost:3000, se reinicia al guardar
```

Sin datos de MongoDB, la app arranca una base local en `./data/mongo`.

## Plan gratuito de Render

Render apaga el servicio tras 15 minutos sin visitas. Mientras alguien tiene Gmail activo, el servidor se visita a sí mismo cada 4 minutos (necesita `APP_URL`) para no dormirse; así siguen funcionando la revisión de Gmail, los recordatorios y el bot.
