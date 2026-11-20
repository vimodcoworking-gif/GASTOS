package pe.duolab.gastos

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Avisos en tiempo real con la app cerrada: un servicio en primer plano (con su notificación fija, como
 * exige Android) queda conectado al canal de eventos del servidor (/api/eventos). Cada aviso del servidor
 * (yape recibido, gasto de Gmail, recordatorio de pago…) llega al instante, sin depender de Firebase.
 * Se activa o desactiva en Configuración → «Avisos en tiempo real» y vuelve solo tras reiniciar el teléfono.
 */
object TiempoReal {
    /** true mientras la app está en pantalla: entonces no hace falta notificar (la app se actualiza sola). */
    @Volatile var appVisible = false

    /** La app en pantalla se pone al día cuando el servidor avisa de un cambio. */
    @Volatile var alCambio: (() -> Unit)? = null

    fun iniciar(contexto: Context) {
        if (!Api.haySesion() || !Ajustes.leer(contexto).segundoPlano) return
        runCatching { ContextCompat.startForegroundService(contexto, Intent(contexto, ServicioTiempoReal::class.java)) }
    }

    fun detener(contexto: Context) {
        runCatching { contexto.stopService(Intent(contexto, ServicioTiempoReal::class.java)) }
    }

    /** Pantalla del sistema para quitar el ahorro de batería a DUOLAB (sin permisos especiales). */
    fun abrirBateria(contexto: Context) {
        val opciones = listOf(
            Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${contexto.packageName}")),
        )
        for (i in opciones) if (runCatching { contexto.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess) return
    }

    /** Honor y Huawei: «Inicio de apps», donde se permite que DUOLAB siga activa. Si no existe, los ajustes de la app. */
    fun abrirInicioDeApps(contexto: Context) {
        val opciones = listOf(
            Intent().setComponent(ComponentName("com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity")),
            Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")),
            Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")),
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${contexto.packageName}")),
        )
        for (i in opciones) if (runCatching { contexto.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess) return
    }
}

class ServicioTiempoReal : Service() {
    private val alcance = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var escucha: Job? = null
    @Volatile private var ultimoAviso = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        primerPlano()
        if (escucha?.isActive != true) escucha = alcance.launch { escuchar() }
        // Si Android la cierra por falta de memoria, la vuelve a abrir cuando puede.
        return START_STICKY
    }

    override fun onDestroy() {
        Api.cerrarEventos()
        alcance.cancel()
        super.onDestroy()
    }

    private fun primerPlano() {
        if (Build.VERSION.SDK_INT >= 26) {
            val gestor = getSystemService(NotificationManager::class.java)
            if (gestor.getNotificationChannel(CANAL) == null) {
                gestor.createNotificationChannel(NotificationChannel(CANAL, "App activa en segundo plano", NotificationManager.IMPORTANCE_MIN).apply {
                    description = "Notificación fija mientras DUOLAB te avisa en tiempo real. Puedes ocultarla aquí sin apagar los avisos."
                    setShowBadge(false)
                })
            }
        }
        val abrir = PendingIntent.getActivity(this, 2, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
        val aviso = NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setColor(0xFFC6F432.toInt())
            .setContentTitle("DUOLAB te avisa al instante")
            .setContentText("Yapes, pagos y movimientos en tiempo real")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setContentIntent(abrir)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, aviso, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(ID, aviso)
    }

    private suspend fun escuchar() {
        Api.iniciar(applicationContext)
        var espera = 3_000L
        while (alcance.isActive) {
            if (!Api.haySesion() || !Ajustes.leer(this).segundoPlano) { stopSelf(); return }
            val conectado = System.currentTimeMillis()
            try {
                Api.escucharEventos { evento, datos -> manejar(evento, datos) }
            } catch (e: ApiError) {
                if (e.codigo == 401) { stopSelf(); return }
            } catch (_: Exception) {
            }
            // Se reconecta: rápido si la conexión duró (cierre normal del proxy), y cada vez más espaciado si
            // falla al conectar (sin internet), hasta 1 minuto, para no gastar batería.
            espera = if (System.currentTimeMillis() - conectado > 60_000) 3_000L else (espera * 2).coerceAtMost(60_000L)
            delay(espera)
        }
    }

    private fun manejar(evento: String, datos: JSONObject) {
        when (evento) {
            "aviso" -> {
                ultimoAviso = System.currentTimeMillis()
                if (!TiempoReal.appVisible) Avisos.mostrar(applicationContext, datos.optString("titulo"), datos.optString("cuerpo"), datos.optString("etiqueta"))
                // Lo avisado no se repite en la revisión de cada 15 minutos.
                alcance.launch { delay(1500); runCatching { Avisos.revisar(applicationContext, avisar = false) } }
            }
            "cambio" -> if (TiempoReal.appVisible) TiempoReal.alCambio?.let { f -> android.os.Handler(android.os.Looper.getMainLooper()).post { f() } }
            else if (datos.optInt("nuevos") > 0) alcance.launch {
                // Movimientos de otra persona del libro (no traen aviso propio): se avisan si en 10 s no llegó uno.
                delay(3000)
                val yaAvisado = System.currentTimeMillis() - ultimoAviso < 10_000
                runCatching { Avisos.revisar(applicationContext, avisar = !yaAvisado && !TiempoReal.appVisible) }
            }
        }
    }

    companion object {
        private const val CANAL = "tiempo_real"
        private const val ID = 7001
    }
}

/** Al encender el teléfono o actualizar la app, el modo «tiempo real» vuelve solo (si estaba activado). */
class AlIniciarTelefono : BroadcastReceiver() {
    override fun onReceive(contexto: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        Api.iniciar(contexto)
        Avisos.programar(contexto)
        TiempoReal.iniciar(contexto)
    }
}
