package pe.duolab.gastos;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Envía los avisos de pago al enlace personal de DUOLAB (POST /api/avisos/&lt;token&gt;, el mismo que usa MacroDroid).
 * Si no hay conexión o el servidor está despertando, el aviso queda pendiente y se reintenta con el siguiente.
 */
final class Enviador {
    static final String PREFIJO = "https://gastos-g63s.onrender.com/api/avisos/";
    private static final String PREFS = "duolab";
    private static final int MAX_PENDIENTES = 30;
    private static final long REPETIDO_MS = 2 * 60_000;
    private static final ExecutorService HILO = Executors.newSingleThreadExecutor();

    interface Respuesta {
        void listo(boolean ok, String mensaje);
    }

    private Enviador() {
    }

    static boolean enlaceValido(String enlace) {
        return enlace != null && enlace.startsWith(PREFIJO) && enlace.substring(PREFIJO.length()).matches("[0-9a-f]{36}");
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String enlace(Context c) {
        return prefs(c).getString("enlace", null);
    }

    static void guardarEnlace(Context c, String enlace) {
        prefs(c).edit().putString("enlace", enlace).apply();
    }

    static String ultimoResultado(Context c) {
        return prefs(c).getString("ultimo", null);
    }

    /** Envía un aviso (título, texto y app de origen). La respuesta llega en el hilo principal. */
    static void enviar(Context contexto, String titulo, String texto, String app, Respuesta respuesta) {
        enviar(contexto, titulo, texto, app, null, respuesta);
    }

    /**
     * «id»: identidad de la notificación en Android (clave + hora en que se creó). La misma notificación
     * publicada otra vez (Android la actualiza) trae el mismo id y no se cuenta dos veces; dos yapes distintos
     * del mismo monto traen ids distintos y se registran los dos.
     */
    static void enviar(Context contexto, String titulo, String texto, String app, String id, Respuesta respuesta) {
        Context c = contexto.getApplicationContext();
        String enlace = enlace(c);
        if (!enlaceValido(enlace)) {
            avisar(respuesta, false, "Falta conectar la app con tu cuenta: abre DUOLAB → Mi cuenta → App Android → Conectar.");
            return;
        }
        // Android vuelve a publicar la misma notificación al actualizarla: se manda una sola vez.
        String huella = id != null ? id : app + "|" + titulo + "|" + texto;
        SharedPreferences p = prefs(c);
        long ahora = System.currentTimeMillis();
        if (respuesta == null && huella.equals(p.getString("huella", "")) && (id != null || ahora - p.getLong("huellaEn", 0) < REPETIDO_MS)) return;
        p.edit().putString("huella", huella).putLong("huellaEn", ahora).apply();

        HILO.execute(() -> {
            try {
                JSONObject aviso = new JSONObject().put("titulo", titulo).put("texto", texto).put("app", app);
                if (id != null) aviso.put("id", id);
                enviarPendientes(c, enlace);
                String[] r = post(enlace, aviso);
                if (r == null) {
                    guardarPendiente(c, aviso);
                    avisar(respuesta, false, "Sin conexión con DUOLAB. Se enviará con el próximo aviso.");
                    return;
                }
                p.edit().putString("ultimo", r[1]).apply();
                avisar(respuesta, "ok".equals(r[0]), r[1]);
            } catch (Exception e) {
                avisar(respuesta, false, "No se pudo enviar: " + e.getMessage());
            }
        });
    }

    private static void avisar(Respuesta respuesta, boolean ok, String mensaje) {
        if (respuesta != null) new Handler(Looper.getMainLooper()).post(() -> respuesta.listo(ok, mensaje));
    }

    /** Devuelve {"ok"|"no", mensaje} o null si hay que reintentar (sin red o error del servidor). */
    private static String[] post(String enlace, JSONObject aviso) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(enlace).openConnection();
            con.setRequestMethod("POST");
            // El plan gratuito de Render puede tardar hasta un minuto en despertar.
            con.setConnectTimeout(60_000);
            con.setReadTimeout(90_000);
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            try (OutputStream out = con.getOutputStream()) {
                out.write(aviso.toString().getBytes(StandardCharsets.UTF_8));
            }
            int codigo = con.getResponseCode();
            if (codigo >= 500) return null;
            InputStream in = codigo >= 400 ? con.getErrorStream() : con.getInputStream();
            String cuerpo = leer(in);
            String mensaje = cuerpo;
            boolean ok = codigo < 400;
            try {
                JSONObject json = new JSONObject(cuerpo);
                mensaje = json.optString("mensaje", cuerpo);
                ok = json.optBoolean("ok", ok);
            } catch (Exception ignorado) {
                // Respuesta sin JSON: se muestra tal cual.
            }
            return new String[]{ok ? "ok" : "no", mensaje};
        } catch (Exception e) {
            return null;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static String leer(InputStream in) throws Exception {
        if (in == null) return "";
        try (InputStream entrada = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = entrada.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    private static synchronized void guardarPendiente(Context c, JSONObject aviso) {
        try {
            JSONArray lista = new JSONArray(prefs(c).getString("pendientes", "[]"));
            lista.put(aviso);
            while (lista.length() > MAX_PENDIENTES) lista.remove(0);
            prefs(c).edit().putString("pendientes", lista.toString()).apply();
        } catch (Exception ignorado) {
            // Si la lista se corrompe se empieza de nuevo.
            prefs(c).edit().remove("pendientes").apply();
        }
    }

    private static synchronized void enviarPendientes(Context c, String enlace) {
        try {
            JSONArray lista = new JSONArray(prefs(c).getString("pendientes", "[]"));
            if (lista.length() == 0) return;
            JSONArray quedan = new JSONArray();
            for (int i = 0; i < lista.length(); i++) {
                JSONObject aviso = lista.getJSONObject(i);
                if (quedan.length() > 0 || post(enlace, aviso) == null) quedan.put(aviso);
            }
            prefs(c).edit().putString("pendientes", quedan.toString()).apply();
        } catch (Exception ignorado) {
            prefs(c).edit().remove("pendientes").apply();
        }
    }
}
