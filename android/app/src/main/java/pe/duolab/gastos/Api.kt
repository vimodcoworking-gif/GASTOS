package pe.duolab.gastos

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
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
            .build()
    }

    fun haySesion() = prefs.getString("cookie", null) != null

    fun olvidarSesion() = prefs.edit().remove("cookie").apply()

    suspend fun get(ruta: String) = pedir("GET", ruta, null)
    suspend fun post(ruta: String, cuerpo: JSONObject = JSONObject()) = pedir("POST", ruta, cuerpo)
    suspend fun patch(ruta: String, cuerpo: JSONObject) = pedir("PATCH", ruta, cuerpo)
    suspend fun delete(ruta: String) = pedir("DELETE", ruta, null)

    private suspend fun pedir(metodo: String, ruta: String, cuerpo: JSONObject?): JSONObject = withContext(Dispatchers.IO) {
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
