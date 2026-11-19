package pe.duolab.gastos

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import okhttp3.Cache
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Error de la API con el mensaje que manda el servidor («Correo o contraseña incorrectos»…). */
class ApiError(val codigo: Int, mensaje: String) : Exception(mensaje)

/**
 * Cliente de la API de DUOLAB (la misma que usa la web). La sesión es la cookie «sesion» del servidor,
 * guardada en el teléfono para no tener que entrar cada vez (dura 30 días).
 */
object Api {
    val BASE: String = BuildConfig.API_BASE
    private val JSON = "application/json; charset=utf-8".toMediaType()
    private lateinit var prefs: SharedPreferences
    private lateinit var cliente: OkHttpClient

    fun iniciar(contexto: Context) {
        if (::cliente.isInitialized) return
        prefs = contexto.applicationContext.getSharedPreferences("sesion", Context.MODE_PRIVATE)
        cliente = OkHttpClient.Builder()
            .cookieJar(Galletas(prefs))
            // El plan gratuito de Render puede tardar casi un minuto en despertar.
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            // Caché HTTP: si los datos no cambiaron, el servidor responde «304» sin mandarlos otra vez
            // (menos datos móviles y menos trabajo para el servidor con mucha gente a la vez).
            .cache(Cache(File(contexto.cacheDir, "http"), 10L * 1024 * 1024))
            .build()
    }

    fun haySesion() = prefs.getString("cookie", null) != null

    fun olvidarSesion() {
        prefs.edit().remove("cookie").apply()
        // Los datos de la cuenta anterior no se quedan en la caché del teléfono.
        runCatching { cliente.cache?.evictAll() }
    }

    suspend fun get(ruta: String) = pedir("GET", ruta, null)
    suspend fun post(ruta: String, cuerpo: JSONObject = JSONObject()) = pedir("POST", ruta, cuerpo)
    suspend fun patch(ruta: String, cuerpo: JSONObject) = pedir("PATCH", ruta, cuerpo)
    suspend fun put(ruta: String, cuerpo: JSONObject) = pedir("PUT", ruta, cuerpo)
    suspend fun delete(ruta: String) = pedir("DELETE", ruta, null)

    /** Sube una imagen (captura de Yape o del banco) tal cual, como hace la web. */
    suspend fun postImagen(ruta: String, bytes: ByteArray): JSONObject = withContext(Dispatchers.IO) {
        val peticion = Request.Builder().url("$BASE/api$ruta").post(bytes.toRequestBody("image/jpeg".toMediaType())).build()
        try {
            cliente.newCall(peticion).execute().use { r ->
                val json = runCatching { JSONObject(r.body?.string().orEmpty()) }.getOrNull()
                if (!r.isSuccessful) throw ApiError(r.code, json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Error del servidor (${r.code})")
                json ?: JSONObject()
            }
        } catch (e: IOException) {
            throw ApiError(0, "Sin conexión con DUOLAB. Revisa tu internet e inténtalo de nuevo.")
        }
    }

    /** Descarga un archivo (el informe PDF) con la sesión de la app. */
    suspend fun descargar(ruta: String): ByteArray = withContext(Dispatchers.IO) {
        try {
            cliente.newCall(Request.Builder().url("$BASE/api$ruta").build()).execute().use { r ->
                if (!r.isSuccessful) throw ApiError(r.code, runCatching { JSONObject(r.body?.string().orEmpty()).optString("error") }.getOrNull()?.takeIf { it.isNotBlank() } ?: "No se pudo descargar (${r.code})")
                r.body?.bytes() ?: ByteArray(0)
            }
        } catch (e: IOException) {
            throw ApiError(0, "Sin conexión con DUOLAB. Revisa tu internet e inténtalo de nuevo.")
        }
    }

    /**
     * Las consultas (GET) se reintentan una vez si el servidor está ocupado, reiniciándose (Render) o la red
     * falla un momento. Las que cambian datos no se repiten solas, para no registrar nada dos veces.
     */
    private suspend fun pedir(metodo: String, ruta: String, cuerpo: JSONObject?): JSONObject {
        if (metodo != "GET") return pedirUnaVez(metodo, ruta, cuerpo)
        return try {
            pedirUnaVez(metodo, ruta, cuerpo)
        } catch (e: ApiError) {
            if (e.codigo != 0 && e.codigo !in listOf(502, 503, 504)) throw e
            delay(1500)
            pedirUnaVez(metodo, ruta, cuerpo)
        }
    }

    private suspend fun pedirUnaVez(metodo: String, ruta: String, cuerpo: JSONObject?): JSONObject = withContext(Dispatchers.IO) {
        val peticion = Request.Builder()
            .url("$BASE/api$ruta")
            .header("Accept", "application/json")
            .method(metodo, cuerpo?.toString()?.toRequestBody(JSON))
            .build()
        try {
            cliente.newCall(peticion).execute().use { r ->
                val texto = r.body?.string().orEmpty()
                val json = runCatching { JSONObject(texto) }.getOrNull()
                if (!r.isSuccessful) {
                    throw ApiError(r.code, json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Error del servidor (${r.code})")
                }
                json ?: JSONObject()
            }
        } catch (e: IOException) {
            throw ApiError(0, "Sin conexión con DUOLAB. Revisa tu internet e inténtalo de nuevo.")
        }
    }

    @Volatile private var llamadaEventos: okhttp3.Call? = null

    /**
     * Escucha /api/eventos (Server-Sent Events) hasta que se corta la conexión. Llama a alEvento por cada
     * evento («aviso», «cambio»…). El servidor manda un latido cada 25 s: si en 75 s no llega nada, se corta.
     */
    fun escucharEventos(alEvento: (String, JSONObject) -> Unit) {
        val cliente = cliente.newBuilder().cache(null).readTimeout(75, TimeUnit.SECONDS).build()
        val llamada = cliente.newCall(Request.Builder().url("$BASE/api/eventos").header("Accept", "text/event-stream").build())
        llamadaEventos = llamada
        llamada.execute().use { r ->
            if (!r.isSuccessful) throw ApiError(r.code, "Eventos: ${r.code}")
            val fuente = r.body?.source() ?: return
            var evento = "message"
            val datos = StringBuilder()
            while (true) {
                val linea = fuente.readUtf8Line() ?: break
                when {
                    linea.isEmpty() -> {
                        if (datos.isNotEmpty()) runCatching { alEvento(evento, JSONObject(datos.toString())) }
                        evento = "message"; datos.setLength(0)
                    }
                    linea.startsWith("event:") -> evento = linea.substringAfter(':').trim()
                    linea.startsWith("data:") -> datos.append(linea.substringAfter(':').trim())
                }
            }
        }
    }

    fun cerrarEventos() { runCatching { llamadaEventos?.cancel() } }

    /** Guarda solo la cookie de sesión de DUOLAB. */
    private class Galletas(private val prefs: SharedPreferences) : CookieJar {
        private val url: HttpUrl = BASE.toHttpUrl()

        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            for (c in cookies) {
                if (c.name != "sesion") continue
                if (c.value.isEmpty() || c.expiresAt < System.currentTimeMillis()) prefs.edit().remove("cookie").apply()
                else prefs.edit().putString("cookie", c.toString()).apply()
            }
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            val guardada = prefs.getString("cookie", null) ?: return emptyList()
            val cookie = Cookie.parse(this.url, guardada) ?: return emptyList()
            if (cookie.expiresAt < System.currentTimeMillis()) return emptyList()
            return listOf(cookie)
        }
    }
}
