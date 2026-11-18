package pe.duolab.gastos

import android.app.Application
import android.content.Context
import android.os.Build
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import kotlin.coroutines.resume

/**
 * Notificaciones al instante con Firebase Cloud Messaging: el servidor avisa al teléfono en cuanto registra
 * un gasto (Gmail, Yape, WhatsApp) o vence un pago. Los datos de Firebase los da el servidor
 * (GET /api/push/app), así que se activa sin publicar otra versión de la app: basta configurar Firebase en
 * el servidor. Mientras no esté, sigue la revisión cada 15 minutos (Avisos).
 */
object Push {
    private const val PREFS = "push"
    private val alcance = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** ¿Este teléfono recibe avisos al instante? */
    fun activo(contexto: Context) = contexto.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", null) != null

    /** Al abrir la app (también cuando la despierta un aviso): prepara Firebase con los datos guardados. */
    fun iniciar(contexto: Context): Boolean {
        if (FirebaseApp.getApps(contexto).isNotEmpty()) return true
        val guardada = contexto.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("config", null) ?: return false
        return runCatching { FirebaseApp.initializeApp(contexto, opciones(JSONObject(guardada))); true }.getOrDefault(false)
    }

    private fun opciones(c: JSONObject) = FirebaseOptions.Builder()
        .setApiKey(c.getString("apiKey"))
        .setApplicationId(c.getString("appId"))
        .setProjectId(c.getString("projectId"))
        .setGcmSenderId(c.getString("senderId"))
        .build()

    /** Tras entrar: pide al servidor los datos de Firebase, obtiene el código del teléfono y lo registra. */
    suspend fun activar(contexto: Context) {
        val p = contexto.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val r = Api.get("/push/app")
        val config = r.optJSONObject("config")
        if (!r.optBoolean("activo") || config == null) {
            p.edit().remove("token").apply()
            return
        }
        val antes = p.getString("config", null)
        if (antes != null && antes != config.toString()) {
            // Cambió el proyecto de Firebase: hace falta reiniciar la app para usar el nuevo.
            p.edit().putString("config", config.toString()).remove("token").apply()
            return
        }
        p.edit().putString("config", config.toString()).apply()
        if (!iniciar(contexto)) return
        val token = codigo() ?: return
        registrar(contexto, token)
    }

    private suspend fun codigo(): String? = suspendCancellableCoroutine { c ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { t -> c.resume(if (t.isSuccessful) t.result else null) }
    }

    internal suspend fun registrar(contexto: Context, token: String) {
        if (!Api.haySesion()) return
        Api.post("/push/app", JSONObject().put("token", token).put("dispositivo", "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(60)))
        contexto.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("token", token).apply()
    }

    /** Antes de cerrar sesión: este teléfono deja de recibir los avisos de la cuenta. */
    suspend fun quitar(contexto: Context) {
        val p = contexto.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val token = p.getString("token", null) ?: return
        p.edit().remove("token").apply()
        runCatching { Api.post("/push/app/quitar", JSONObject().put("token", token)) }
    }

    internal fun enSegundoPlano(bloque: suspend () -> Unit) {
        alcance.launch { runCatching { bloque() } }
    }
}

/** Arranca Firebase antes que nada, para que los avisos lleguen aunque la app esté cerrada. */
class DuolabApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Push.iniciar(this)
    }
}

class ServicioPush : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Api.iniciar(applicationContext)
        Push.enSegundoPlano { Push.registrar(applicationContext, token) }
    }

    override fun onMessageReceived(mensaje: RemoteMessage) {
        Api.iniciar(applicationContext)
        if (!Api.haySesion()) return
        val d = mensaje.data
        val titulo = d["titulo"].orEmpty().ifBlank { mensaje.notification?.title.orEmpty() }
        if (titulo.isBlank()) return
        Avisos.mostrar(applicationContext, titulo, d["cuerpo"].orEmpty().ifBlank { mensaje.notification?.body.orEmpty() }, d["etiqueta"].orEmpty())
        // Lo que ya se avisó al instante no se vuelve a avisar en la revisión de cada 15 minutos.
        Push.enSegundoPlano { Avisos.revisar(applicationContext, avisar = false) }
    }
}
