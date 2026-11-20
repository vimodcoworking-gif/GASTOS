package pe.duolab.gastos

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/** Versión publicada en la web (public/descargas/version.json). */
data class VersionNueva(val codigo: Int, val nombre: String, val notas: String, val url: String)

/**
 * Actualizaciones del APK de la web: la app mira cada vez que se abre (y la revisión en segundo plano) si hay
 * una versión más nueva publicada; avisa «Nueva actualización disponible», la descarga y abre el instalador.
 * La versión de Play Store se actualiza por la tienda.
 */
object Actualizacion {
    val disponible = BuildConfig.FLAVOR == "web"
    private val cliente by lazy { OkHttpClient.Builder().connectTimeout(60, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS).build() }

    var encontrada by mutableStateOf<VersionNueva?>(null)
    // Pedir mostrar el diálogo de instalar (p. ej. desde Configuración → Buscar actualizaciones).
    var pedirInstalar by mutableStateOf(false)
    var progreso by mutableStateOf<Float?>(null)

    suspend fun buscar(): VersionNueva? = withContext(Dispatchers.IO) {
        if (!disponible) return@withContext null
        runCatching {
            cliente.newCall(Request.Builder().url("${Api.BASE}/descargas/version.json?t=${System.currentTimeMillis()}").build()).execute().use { r ->
                val j = JSONObject(r.body?.string().orEmpty())
                val v = VersionNueva(j.optInt("versionCode"), j.optString("versionName"), j.optString("notas"), "${Api.BASE}${j.optString("apk", "/descargas/duolab-gastos.apk")}")
                if (v.codigo > BuildConfig.VERSION_CODE) v else null
            }
        }.getOrNull()
    }

    /** Desde la revisión en segundo plano: una notificación por versión nueva. */
    suspend fun avisarSiHay(contexto: Context) {
        val v = buscar() ?: return
        val prefs = contexto.getSharedPreferences("avisos", Context.MODE_PRIVATE)
        if (prefs.getInt("actualizacionAvisada", 0) >= v.codigo) return
        // Configuración → «Actualizaciones de la app» apagado: no se avisa (el aviso al abrir la app sigue).
        if (!Ajustes.leer(contexto).permite(TipoAviso.ACTUALIZACION)) return
        prefs.edit().putInt("actualizacionAvisada", v.codigo).apply()
        if (Build.VERSION.SDK_INT >= 26) {
            val gestor = contexto.getSystemService(NotificationManager::class.java)
            if (gestor.getNotificationChannel("actualizaciones") == null) {
                gestor.createNotificationChannel(NotificationChannel("actualizaciones", "Actualizaciones de la app", NotificationManager.IMPORTANCE_DEFAULT))
            }
        }
        val abrir = PendingIntent.getActivity(contexto, 1, Intent(contexto, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
        val aviso = NotificationCompat.Builder(contexto, "actualizaciones")
            .setSmallIcon(R.drawable.ic_notificacion).setColor(0xFFC6F432.toInt())
            .setContentTitle("Nueva actualización disponible")
            .setContentText("DUOLAB ${v.nombre}: toca para actualizar")
            .setStyle(NotificationCompat.BigTextStyle().bigText("DUOLAB ${v.nombre}: toca para actualizar.\n${v.notas}"))
            .setContentIntent(abrir).setAutoCancel(true).build()
        runCatching { NotificationManagerCompat.from(contexto).notify(9001, aviso) }
    }

    /** Descarga el APK nuevo y abre el instalador de Android (que pide confirmar la actualización). */
    suspend fun descargarEInstalar(contexto: Context, v: VersionNueva): String? {
        if (Build.VERSION.SDK_INT >= 26 && !contexto.packageManager.canRequestPackageInstalls()) {
            contexto.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${contexto.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return "Permite «Instalar apps desconocidas» para DUOLAB y vuelve a tocar «Actualizar ahora»."
        }
        val archivo = withContext(Dispatchers.IO) {
            runCatching {
                // Se descarga a un archivo temporal y, solo si llegó completo, se renombra con un nombre nuevo:
                // así un segundo toque no pisa el archivo que el instalador ya está leyendo.
                val carpeta = File(contexto.cacheDir, "actualizaciones").apply { mkdirs() }
                carpeta.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 10 * 60_000 }?.forEach { it.delete() }
                val parcial = File(carpeta, "duolab-${v.codigo}-${System.currentTimeMillis()}.part")
                val destino = File(carpeta, parcial.name.removeSuffix(".part") + ".apk")
                cliente.newCall(Request.Builder().url(v.url).build()).execute().use { r ->
                    if (!r.isSuccessful) return@runCatching null
                    val cuerpo = r.body ?: return@runCatching null
                    val largo = cuerpo.contentLength()
                    val total = largo.takeIf { it > 0 } ?: 2_000_000L
                    parcial.outputStream().use { out ->
                        cuerpo.byteStream().use { entrada ->
                            val buf = ByteArray(16 * 1024)
                            var leido = 0L
                            while (true) {
                                val n = entrada.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                leido += n
                                progreso = (leido.toFloat() / total).coerceAtMost(1f)
                            }
                        }
                    }
                    if (largo > 0 && parcial.length() != largo) { parcial.delete(); return@runCatching null }
                }
                if (!parcial.renameTo(destino)) return@runCatching null
                destino
            }.getOrNull()
        }
        progreso = null
        if (archivo == null) return "No se pudo descargar la actualización. Revisa tu internet."
        val uri = FileProvider.getUriForFile(contexto, "${contexto.packageName}.archivos", archivo)
        contexto.startActivity(
            Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        return null
    }
}

@Composable
fun DialogoActualizacion(alCerrar: () -> Unit) {
    val v = Actualizacion.encontrada ?: return
    val contexto = LocalContext.current
    val alcance = rememberCoroutineScope()
    var mensaje by androidx.compose.runtime.remember { mutableStateOf<String?>(null) }
    val descargando = Actualizacion.progreso != null
    AlertDialog(
        onDismissRequest = { if (!descargando) alCerrar() },
        title = { Text("Nueva actualización disponible", fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("DUOLAB ${v.nombre} (tienes la ${BuildConfig.VERSION_NAME}).", fontWeight = FontWeight.SemiBold)
                if (v.notas.isNotBlank()) Text(v.notas, fontSize = 14.sp)
                Actualizacion.progreso?.let {
                    Text("Descargando… ${(it * 100).toInt()} %", fontSize = 13.sp)
                    LinearProgressIndicator(progress = { it }, modifier = Modifier.fillMaxWidth(), color = Lima)
                }
                mensaje?.let { Text(it, fontSize = 13.sp, color = LocalTokens.current.tenue) }
                Text("Tus datos no se borran: se instala encima de la versión actual.", fontSize = 12.sp, color = LocalTokens.current.tenue)
            }
        },
        confirmButton = {
            TextButton(enabled = !descargando, onClick = { alcance.launch { mensaje = Actualizacion.descargarEInstalar(contexto, v) } }) {
                Text("Actualizar ahora", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = { TextButton(enabled = !descargando, onClick = alCerrar) { Text("Más tarde") } },
    )
}
