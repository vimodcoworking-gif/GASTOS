package pe.duolab.gastos

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/** Foto de perfil de Google (la URL la da el servidor en `usuario.foto`) y si la cuenta usa Google. */
val Usuario.foto: String get() = json.optString("foto")
val Usuario.conGoogle: Boolean get() = json.optBoolean("google")

/**
 * Descarga la foto de perfil una vez y la guarda en el teléfono: así se ve al instante y sin conexión.
 * Solo fotos de Google (googleusercontent.com); sin la cookie de la app (es otro servidor).
 */
object FotoPerfil {
    private val cliente by lazy { OkHttpClient.Builder().callTimeout(15, TimeUnit.SECONDS).build() }
    private val memoria = mutableMapOf<String, ImageBitmap>()

    private fun archivo(contexto: Context, url: String) = File(contexto.cacheDir, "perfil-${url.hashCode().toUInt()}.img")

    suspend fun cargar(contexto: Context, url: String): ImageBitmap? = withContext(Dispatchers.IO) {
        if (!Regex("^https://[a-z0-9-]+\\.googleusercontent\\.com/").containsMatchIn(url)) return@withContext null
        memoria[url]?.let { return@withContext it }
        val guardado = archivo(contexto, url)
        val bytes = if (guardado.exists()) guardado.readBytes() else runCatching {
            cliente.newCall(Request.Builder().url(url).build()).execute().use { r -> if (r.isSuccessful) r.body?.bytes() else null }
        }.getOrNull()?.also { runCatching { guardado.writeBytes(it) } }
        bytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size)?.asImageBitmap() }?.also { memoria[url] = it }
    }
}

// Colores de fondo como los avatares de Google cuando no hay foto (según la inicial).
private val COLORES_AVATAR = listOf(0xFF1A73E8, 0xFF188038, 0xFFD93025, 0xFFE37400, 0xFF9334E6, 0xFF007B83, 0xFFC5221F, 0xFF3C4043)

/** Avatar del perfil: la foto de la cuenta de Google o, si no hay, la inicial sobre un color (estilo Google). */
@Composable
fun Avatar(u: Usuario, lado: Int) {
    val contexto = LocalContext.current
    val url = u.foto
    val foto by produceState<ImageBitmap?>(null, url) { value = if (url.isNotBlank()) FotoPerfil.cargar(contexto, url) else null }
    val inicial = u.nombre.trim().firstOrNull()?.uppercaseChar() ?: '?'
    Box(
        Modifier.size(lado.dp).clip(CircleShape).background(Color(COLORES_AVATAR[inicial.code % COLORES_AVATAR.size]))
            .border(2.dp, Color.White.copy(alpha = 0.9f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        val imagen = foto
        if (imagen != null) Image(imagen, "Foto de perfil", Modifier.size(lado.dp).clip(CircleShape), contentScale = ContentScale.Crop)
        else Text(inicial.toString(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = (lado * 0.42f).sp)
    }
}
