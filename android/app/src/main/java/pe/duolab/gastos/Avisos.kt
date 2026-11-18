package pe.duolab.gastos

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.LocalDate
import java.time.YearMonth
import java.util.concurrent.TimeUnit

/**
 * Notificaciones de la app: cada 15 minutos (lo mínimo que permite Android en segundo plano) revisa si
 * entraron movimientos nuevos por Gmail, MacroDroid, WhatsApp u otra persona del libro y los avisa.
 * Lo que se ve en la app se marca como visto: no se avisa de lo que uno mismo acaba de registrar.
 */
object Avisos {
    private const val CANAL = "movimientos"
    private const val PREFS = "avisos"

    fun programar(contexto: Context) {
        val tarea = PeriodicWorkRequestBuilder<RevisarMovimientos>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(contexto).enqueueUniquePeriodicWork("revisar-movimientos", ExistingPeriodicWorkPolicy.KEEP, tarea)
    }

    /** Marca como vistos los movimientos del mes (los que la persona ya tiene en pantalla). */
    fun marcarVistos(contexto: Context, libroId: String, ids: Collection<String>) {
        val p = contexto.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val antes = p.getStringSet("vistos:$libroId", emptySet()).orEmpty()
        p.edit().putStringSet("vistos:$libroId", (antes + ids).toList().takeLast(600).toSet()).apply()
    }

    internal suspend fun revisar(contexto: Context) {
        Api.iniciar(contexto)
        if (!Api.haySesion()) return
        val p = contexto.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val hasta = LocalDate.now().plusDays(30)
        for (libro in librosDe(Api.get("/libros"))) {
            val datos = datosMesDe(Api.get("/libros/${libro.id}/mes?mes=${YearMonth.now()}&hasta=$hasta"))
            val todos = datos.actual + datos.pendientes
            val clave = "vistos:${libro.id}"
            if (!p.contains(clave)) { marcarVistos(contexto, libro.id, todos.map { it.id }); continue }
            val vistos = p.getStringSet(clave, emptySet()).orEmpty()
            val nuevos = todos.distinctBy { it.id }.filter { it.id !in vistos }
            if (nuevos.isEmpty()) continue
            marcarVistos(contexto, libro.id, nuevos.map { it.id })
            notificar(contexto, libro, nuevos)
        }
    }

    private fun notificar(contexto: Context, libro: Libro, nuevos: List<Movimiento>) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(contexto, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        crearCanal(contexto)
        val abrir = PendingIntent.getActivity(contexto, 0, Intent(contexto, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_IMMUTABLE)
        val (titulo, texto) = if (nuevos.size == 1) {
            val m = nuevos.first()
            (if (m.esGasto) "💸 Gasto registrado" else "💰 Ingreso registrado") to "${m.descripcion} · ${dinero(m.monto, libro.moneda)}"
        } else {
            "🔔 ${nuevos.size} movimientos nuevos" to nuevos.take(4).joinToString("\n") { "${if (it.esGasto) "-" else "+"}${dinero(it.monto, libro.moneda)} ${it.descripcion}" }
        }
        val aviso = NotificationCompat.Builder(contexto, CANAL)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setColor(0xFFC6F432.toInt())
            .setContentTitle(titulo)
            .setContentText(texto.lineSequence().first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .setSubText(libro.nombre)
            .setContentIntent(abrir)
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(contexto).notify(libro.id.hashCode(), aviso) }
    }

    private fun crearCanal(contexto: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val gestor = contexto.getSystemService(NotificationManager::class.java)
        if (gestor.getNotificationChannel(CANAL) == null) {
            gestor.createNotificationChannel(NotificationChannel(CANAL, "Movimientos registrados", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Gastos e ingresos que llegan solos: Gmail, Yape, WhatsApp u otra persona del libro"
            })
        }
    }
}

class RevisarMovimientos(contexto: Context, parametros: WorkerParameters) : CoroutineWorker(contexto, parametros) {
    override suspend fun doWork(): Result = try {
        Avisos.revisar(applicationContext)
        Result.success()
    } catch (e: ApiError) {
        if (e.codigo == 0) Result.retry() else Result.success()
    }
}

/** Android 13 o posterior: pide el permiso de notificaciones una vez, al entrar. */
@Composable
fun PedirPermisoNotificaciones() {
    val contexto = LocalContext.current
    val lanzador = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        Avisos.programar(contexto)
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(contexto, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            lanzador.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
