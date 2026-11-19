@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package pe.duolab.gastos

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.border
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Tarjeta de sección (Mi cuenta, Compartir, Admin): icono, título y nota arriba, y el contenido debajo. */
@Composable
fun TarjetaCuenta(icono: ImageVector, titulo: String, nota: String, contenido: @Composable ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    Panel(relleno = 18) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconoCaja(icono, Lima.copy(alpha = if (t.oscuro) 0.13f else 0.35f), if (t.oscuro) Lima else SobreLima, 38, 12)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(titulo, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, lineHeight = 20.sp)
                if (nota.isNotBlank()) Text(nota, color = t.tenue, fontSize = 12.sp, lineHeight = 16.sp)
            }
        }
        Spacer(Modifier.height(14.dp))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp), content = contenido)
    }
}

/** Fila informativa dentro de una tarjeta: icono pequeño, etiqueta y valor (para datos que no se editan). */
@Composable
private fun FilaDato(icono: ImageVector, etiqueta: String, valor: String, colorValor: Color? = null) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(t.elev).padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icono, null, tint = t.tenue, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(etiqueta, color = t.tenue, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            Text(valor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = colorValor ?: t.tinta, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Bloque que se abre y se cierra (opciones que se usan poco), para que la tarjeta no se vea cargada. */
@Composable
private fun Desplegable(titulo: String, contenido: @Composable ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    var abierto by rememberSaveable(titulo) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).border(1.dp, t.linea, RoundedCornerShape(16.dp))) {
        Row(Modifier.fillMaxWidth().toque(escala = 0.99f) { abierto = !abierto }.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Icon(Iconos.flechaDer, null, tint = t.tenue, modifier = Modifier.size(16.dp).graphicsLayer(rotationZ = if (abierto) 90f else 0f))
        }
        AnimatedVisibility(abierto) {
            Column(Modifier.padding(start = 14.dp, end = 14.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = contenido)
        }
    }
}

/** Píldora de estado: punto de color y texto («Gmail · activo», «WhatsApp · falta»). */
@Composable
private fun Estado(texto: String, bien: Boolean, alTocar: () -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.clip(RoundedCornerShape(50)).background(t.elev).toque(alTocar = alTocar).padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(if (bien) Color(0xFF55A630) else Naranja))
        Text("  $texto", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

private fun copiar(contexto: Context, texto: String) {
    contexto.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("DUOLAB", texto))
}

private enum class SeccionCuenta(val titulo: String, val indice: Int) {
    DATOS("Tus datos", 2), RECORDATORIOS("Recordatorios", 3), NOTIFICACIONES("Notificaciones", 4), GMAIL("Gmail", 5), YAPE("Yape y avisos", 6)
}

@Composable
fun VistaCuenta(vm: AppVM) {
    val u = vm.usuario ?: return
    val contexto = LocalContext.current
    val lista = rememberLazyListState()
    val alcance = rememberCoroutineScope()
    val ir = { s: SeccionCuenta -> alcance.launch { lista.animateScrollToItem(s.indice) }; Unit }
    LazyColumn(state = lista, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Encabezado(u, contexto, ir) }
        item {
            // Atajos a cada sección.
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val t = LocalTokens.current
                SeccionCuenta.entries.forEach { s ->
                    Text(s.titulo, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(t.sup).toque { ir(s) }.padding(horizontal = 14.dp, vertical = 9.dp))
                }
            }
        }
        item { TusDatos(vm, u) }
        item { Recordatorios(vm, u) }
        item { AppNotificaciones() }
        item { Gmail(vm, u) }
        item { AvisosTelefono(vm) }
    }
}

/** Cabecera de Mi cuenta: foto de Google, nombre, correo y el estado de lo importante de un vistazo. */
@Composable
private fun Encabezado(u: Usuario, contexto: Context, ir: (SeccionCuenta) -> Unit) {
    val t = LocalTokens.current
    val conWhatsapp = u.json.optString("whatsapp").isNotBlank()
    val correos = u.json.optJSONArray("correos")?.length() ?: 0
    val notificaciones = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(contexto, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(t.sup).padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Avatar(u, 76)
        Spacer(Modifier.height(10.dp))
        Text(u.nombre, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, textAlign = TextAlign.Center)
        Text(u.email, color = t.tenue, fontSize = 13.sp, textAlign = TextAlign.Center)
        if (u.conGoogle) {
            Row(Modifier.padding(top = 8.dp).clip(RoundedCornerShape(50)).background(t.elev).padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(R.drawable.ic_google), "Google", Modifier.size(13.dp))
                Text("  Cuenta de Google", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = t.tenue)
            }
        }
        Spacer(Modifier.height(14.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Estado(if (conWhatsapp) "WhatsApp" else "Falta WhatsApp", conWhatsapp) { ir(SeccionCuenta.DATOS) }
            Estado(if (correos > 0) "Gmail · $correos" else "Sin Gmail", correos > 0) { ir(SeccionCuenta.GMAIL) }
            Estado(if (notificaciones) "Notificaciones" else "Sin notificaciones", notificaciones) { ir(SeccionCuenta.NOTIFICACIONES) }
        }
    }
}

@Composable
private fun TusDatos(vm: AppVM, u: Usuario) {
    val t = LocalTokens.current
    var nombre by remember(u.id, u.nombre) { mutableStateOf(u.nombre) }
    val guardado = u.json.optString("whatsapp")
    var whatsapp by remember(u.id, guardado) { mutableStateOf(guardado) }
    val cambiado = nombre.trim() != u.nombre || whatsapp.trim() != guardado
    TarjetaCuenta(Iconos.persona, "Tus datos", "El bot de WhatsApp te reconoce por tu número.") {
        Campo("Nombre", nombre, { nombre = it.take(60) })
        Campo("WhatsApp", whatsapp, { whatsapp = it.take(24) }, teclado = KeyboardType.Phone, pista = "51 987 654 321")
        FilaDato(Iconos.correo, "Correo", u.email)
        FilaDato(Iconos.escudo, "Cómo entras", when {
            u.conGoogle && !u.json.optBoolean("tienePassword") -> "Con Google"
            u.conGoogle -> "Con contraseña o con Google"
            else -> "Con correo y contraseña"
        })
        if (u.conGoogle && !u.json.optBoolean("tienePassword")) Text("Para entrar también con contraseña: «¿Olvidaste tu contraseña?» en la pantalla de entrar.", color = t.tenue, fontSize = 12.sp)
        BotonLima(if (cambiado) "Guardar cambios" else "Sin cambios", habilitado = cambiado && !vm.ocupado) {
            vm.hacer {
                vm.ponerUsuario(Api.patch("/auth/yo", JSONObject().put("nombre", nombre.trim()).put("whatsapp", whatsapp.trim())).getJSONObject("usuario"))
                vm.aviso = "Datos guardados"
            }
        }
    }
}

@Composable
private fun Recordatorios(vm: AppVM, u: Usuario) {
    val t = LocalTokens.current
    val r = u.json.optJSONObject("recordatorio")
    val diasG = r?.optInt("dias", 2) ?: 2
    val mismoG = r?.optBoolean("mismoDia", true) ?: true
    var dias by remember(u.id, diasG) { mutableStateOf(diasG) }
    var mismoDia by remember(u.id, mismoG) { mutableStateOf(mismoG) }
    val cambiado = dias != diasG || mismoDia != mismoG
    TarjetaCuenta(Iconos.reloj, "Recordatorios de pago", "Por WhatsApp y notificación, antes de que venza un pago.") {
        Text("¿Cuándo te aviso?", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(0 to "El mismo día", 1 to "1 día antes", 2 to "2 días antes", 3 to "3 días antes", 5 to "5 días antes", 7 to "1 semana antes").forEach { (d, n) ->
                val activo = dias == d
                Text(n, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (activo) SobreLima else t.tinta,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(if (activo) Lima else t.elev).toque { dias = d }.padding(horizontal = 12.dp, vertical = 8.dp))
            }
        }
        if (dias > 0) Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(t.elev).toque(escala = 0.99f) { mismoDia = !mismoDia }.padding(start = 12.dp, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Recordarme también el mismo día", fontSize = 14.sp, modifier = Modifier.weight(1f))
            Switch(mismoDia, { mismoDia = it }, colors = SwitchDefaults.colors(checkedTrackColor = Lima, checkedThumbColor = SobreLima))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BotonLima(if (cambiado) "Guardar" else "Guardado", Modifier.weight(1f), habilitado = cambiado && !vm.ocupado) {
                vm.hacer {
                    vm.ponerUsuario(Api.patch("/auth/yo", JSONObject().put("recordatorio", JSONObject().put("dias", dias).put("mismoDia", mismoDia))).getJSONObject("usuario"))
                    vm.aviso = "Recordatorios guardados"
                }
            }
            BotonSuave("Probar", Modifier.weight(1f).height(52.dp)) {
                vm.hacer { vm.aviso = Api.post("/recordatorios/prueba").optString("mensaje").ifBlank { "Mensaje de prueba enviado" } }
            }
        }
    }
}

@Composable
private fun AppNotificaciones() {
    val contexto = LocalContext.current
    val t = LocalTokens.current
    var permitido by remember {
        mutableStateOf(Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(contexto, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
    }
    val pedir = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { permitido = it }
    val alInstante = remember { Push.activo(contexto) }
    TarjetaCuenta(Iconos.campana, "Notificaciones", "En este teléfono.") {
        FilaDato(Iconos.campana, if (permitido) "Activadas" else "Desactivadas",
            if (!permitido) "Actívalas para enterarte de cada gasto" else if (alInstante) "Te aviso al instante" else "Reviso cada 15 minutos",
            if (permitido) Color(0xFF3E8E2F) else Color(0xFFE5484D))
        Text(
            "Te aviso de cada gasto o ingreso que llegue solo (Gmail, Yape, WhatsApp u otra persona del libro) y de tus pagos por vencer.",
            color = t.tenue, fontSize = 12.sp,
        )
        if (!permitido) BotonLima("Activar notificaciones") {
            if (Build.VERSION.SDK_INT >= 33) pedir.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        val alcance = rememberCoroutineScope()
        var resultado by remember { mutableStateOf<String?>(null) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (permitido) BotonSuave("Probar", Modifier.weight(1f)) {
                alcance.launch {
                    resultado = if (alInstante) {
                        // Pasa por el servidor y Firebase: prueba el camino completo.
                        try { Api.post("/push/prueba"); "Enviada: debe llegarte en unos segundos." } catch (e: ApiError) { e.message }
                    } else {
                        Avisos.mostrar(contexto, "🔔 Notificaciones activadas", "Así te avisaré de cada gasto o ingreso que llegue solo.", "prueba")
                        "Listo. Los avisos llegan en la revisión de cada 15 minutos."
                    }
                }
            }
            BotonSuave("Ajustes", Modifier.weight(1f)) {
                contexto.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, contexto.packageName))
            }
        }
        resultado?.let { Text(it, color = t.tenue, fontSize = 12.sp) }
    }
}

@Composable
private fun Gmail(vm: AppVM, u: Usuario) {
    val contexto = LocalContext.current
    val t = LocalTokens.current
    val correos = u.json.optJSONArray("correos")?.objetos().orEmpty()
    var meses by remember { mutableStateOf("1") }
    var revisados by remember { mutableStateOf<List<JSONObject>?>(null) }
    val vincular = {
        vm.hacer {
            val url = Api.post("/auth/google/app/enlace-gmail").optString("url")
            contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
    }
    val cargarRevisados = { vm.hacer { revisados = Api.get("/auth/google/gmail/revisados").optJSONArray("correos")?.objetos().orEmpty() } }
    TarjetaCuenta(Iconos.correo, "Gmail", "Registra solos los avisos de bancos, Yape, tiendas y apps.") {
        if (correos.isEmpty()) {
            Text("Vincula tu Gmail y cada aviso de pago se registra solo (se revisa cada 3 minutos). Solo pedimos permiso de lectura.", color = t.tenue, fontSize = 13.sp)
            BotonLima("Vincular con Google") { vincular() }
        } else {
            correos.forEach { c ->
                val cuenta = c.optString("cuenta")
                val error = c.optString("error")
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(t.elev).padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(9.dp).clip(CircleShape).background(if (error.isNotBlank()) Color(0xFFE5484D) else if (c.optBoolean("activo")) Color(0xFF55A630) else Naranja))
                        Text("  " + c.optString("email"), fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    }
                    Text(
                        if (error.isNotBlank()) error else if (c.optBoolean("activo")) "Activo · ${c.optInt("registrados")} registrados" else "En pausa",
                        color = if (error.isNotBlank()) Color(0xFFE5484D) else t.tenue, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp),
                    )
                    c.optJSONObject("escaneo")?.let { e -> Text("Escaneo: ${e.optString("estado")} · ${e.optInt("registrados")} registrados de ${e.optInt("revisados")} revisados", color = t.tenue, fontSize = 12.sp) }
                    Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (error.isNotBlank()) BotonSuave("Volver a vincular", Modifier.weight(1f)) { vincular() }
                        else BotonSuave(if (c.optBoolean("activo")) "Pausar" else "Reanudar", Modifier.weight(1f)) {
                            vm.hacer { vm.ponerUsuario(Api.patch("/auth/google/gmail", JSONObject().put("cuenta", cuenta).put("activo", !c.optBoolean("activo"))).getJSONObject("usuario")) }
                        }
                        BotonSuave("Desvincular", Modifier.weight(1f), peligro = true) {
                            vm.hacer {
                                Api.delete("/auth/google/gmail?cuenta=${Uri.encode(cuenta)}")
                                vm.ponerUsuario(Api.get("/auth/yo").getJSONObject("usuario"))
                                vm.aviso = "Gmail desvinculado"
                            }
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BotonLima("Revisar ahora", Modifier.weight(1f), habilitado = !vm.ocupado) {
                    vm.hacer {
                        val r = Api.post("/auth/google/gmail/revisar")
                        vm.ponerUsuario(r.getJSONObject("usuario"))
                        val n = r.optInt("nuevos")
                        vm.aviso = if (n > 0) "$n movimientos nuevos registrados" else "No hay avisos nuevos"
                        vm.refrescar()
                    }
                }
                if (correos.size < 5) BotonSuave("+ Otro correo", Modifier.weight(1f)) { vincular() }
            }
            Desplegable("Más opciones: escanear y correos revisados") {
            Text("Escanear correos anteriores", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("1" to "Último mes", "3" to "3 meses", "6" to "6 meses", "12" to "Último año", "24" to "2 años", "todo" to "Todo").forEach { (v, n) ->
                    FilterChip(selected = meses == v, onClick = { meses = v }, label = { Text(n) }, colors = chipLima(), shape = RoundedCornerShape(50))
                }
            }
            BotonSuave("Escanear correos", Modifier.fillMaxWidth()) {
                vm.hacer {
                    val r = Api.post("/auth/google/gmail/escanear", JSONObject().put("meses", meses))
                    vm.ponerUsuario(r.getJSONObject("usuario"))
                    vm.aviso = r.optString("mensaje")
                }
            }
            BotonSuave(if (revisados == null) "Ver correos revisados" else "Actualizar correos revisados", Modifier.fillMaxWidth()) { cargarRevisados() }
            revisados?.let { lista ->
                if (lista.isEmpty()) Text("Aún no hay correos revisados esta semana.", color = t.tenue, fontSize = 13.sp)
                lista.take(30).forEach { c ->
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(t.elev).padding(10.dp)) {
                        Text(c.optString("asunto").ifBlank { "(sin asunto)" }, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 2)
                        Text(c.optString("resultado"), color = if (c.optBoolean("registrado")) Color(0xFF3E8E2F) else t.tenue, fontSize = 12.sp, maxLines = 3)
                        if (!c.optBoolean("registrado")) Text("Volver a revisar", fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp).toque {
                            vm.hacer {
                                val r = Api.post("/auth/google/gmail/revisados/${Uri.encode(c.optString("id"))}/reintentar")
                                vm.aviso = if (r.optInt("nuevos") > 0) "Registrado" else r.optString("resultado").ifBlank { "Revisado: no se registró" }
                                revisados = Api.get("/auth/google/gmail/revisados").optJSONArray("correos")?.objetos().orEmpty()
                                vm.refrescar()
                            }
                        })
                    }
                }
            }
            }
        }
    }
}

@Composable
private fun AvisosTelefono(vm: AppVM) {
    val contexto = LocalContext.current
    val t = LocalTokens.current
    var enlace by remember { mutableStateOf<String?>(null) }
    var cargado by remember { mutableStateOf(false) }
    var historial by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    LaunchedEffect(Unit) {
        runCatching {
            enlace = Api.get("/avisos/enlace").optString("enlace").takeIf { it.startsWith("http") }
            historial = Api.get("/avisos/historial").optJSONArray("avisos")?.objetos().orEmpty()
        }
        cargado = true
    }
    TarjetaCuenta(Iconos.movil, "Yape, Plin y avisos", "Los yapes que no llegan por correo, sin duplicar.") {
        if (Lectura.disponible) {
            Text("Esta app lee sola los avisos de Yape, Plin y tu banco que traen un monto.", color = t.tenue, fontSize = 13.sp)
            BotonLima("Lectura automática de Yape") { Lectura.abrir(contexto) }
        }
        if (!cargado) CircularProgressIndicator(color = Lima)
        else if (enlace == null) {
            Text("Crea tu enlace personal: tu teléfono (MacroDroid) manda ahí los avisos de Yape, Plin y tu banco.", color = t.tenue, fontSize = 13.sp)
            BotonLima("Crear mi enlace") { vm.hacer { enlace = Api.post("/avisos/enlace").optString("enlace") } }
        } else {
            Text("Tu enlace personal (no lo compartas)", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Text(enlace!!, fontFamily = FontFamily.Monospace, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(t.elev).padding(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BotonLima("Copiar", Modifier.weight(1f)) { copiar(contexto, enlace!!); vm.aviso = "Enlace copiado" }
                BotonSuave("Cambiar", Modifier.weight(1f)) { vm.hacer { enlace = Api.post("/avisos/enlace").optString("enlace"); vm.aviso = "Enlace nuevo: pégalo en MacroDroid" } }
            }
            if (!Lectura.disponible) Desplegable("Cómo hacerlo automático con MacroDroid") {
                listOf(
                    "Instala MacroDroid y crea una macro.",
                    "Disparador: Notificación recibida → Yape (y Plin o tu banco).",
                    "Acción: Solicitud HTTP · POST · URL: tu enlace · Cuerpo JSON: {\"titulo\":\"[notification_title]\",\"texto\":\"[notification]\",\"app\":\"[app_name]\"}",
                    "Dale permiso de notificaciones y haz un yape de prueba.",
                ).forEachIndexed { i, paso -> Text("${i + 1}. $paso", fontSize = 13.sp) }
                BotonSuave("Abrir MacroDroid en Play Store", Modifier.fillMaxWidth()) {
                    contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid")))
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Últimos envíos", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text("Actualizar", fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clip(RoundedCornerShape(50)).background(t.elev).toque {
                vm.hacer { historial = Api.get("/avisos/historial").optJSONArray("avisos")?.objetos().orEmpty() }
            }.padding(horizontal = 12.dp, vertical = 7.dp))
        }
        if (historial.isEmpty()) Text("Todavía no llegó nada a tu enlace.", color = t.tenue, fontSize = 12.sp)
        var todos by remember { mutableStateOf(false) }
        (if (todos) historial else historial.take(4)).forEach { a ->
            Row(verticalAlignment = Alignment.Top) {
                Text(if (a.optBoolean("ok")) "✓" else "!", color = if (a.optBoolean("ok")) Color(0xFF3E8E2F) else Color(0xFFE5484D), fontWeight = FontWeight.Bold, modifier = Modifier.width(18.dp))
                Column {
                    Text("${a.optString("cuando").take(16).replace("T", " ")} · ${a.optString("origen")}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Text(a.optString("resultado"), fontSize = 12.sp, color = t.tenue, maxLines = 2)
                }
            }
        }
        if (historial.size > 4) Text(if (todos) "Ver menos" else "Ver los ${historial.size}", fontWeight = FontWeight.Bold, fontSize = 13.sp,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(t.elev).toque { todos = !todos }.padding(horizontal = 12.dp, vertical = 7.dp))
    }
}
