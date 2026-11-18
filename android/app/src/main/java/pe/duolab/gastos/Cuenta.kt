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
import org.json.JSONObject

/** Tarjeta de Mi cuenta: icono, título y nota como .cuenta-tarjeta de la web. */
@Composable
fun TarjetaCuenta(icono: ImageVector, titulo: String, nota: String, contenido: @Composable ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconoCaja(icono, Lima.copy(alpha = if (t.oscuro) 0.13f else 0.35f), if (t.oscuro) Lima else SobreLima, 40, 13)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(titulo, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                Text(nota, color = t.tenue, fontSize = 12.sp)
            }
        }
        Spacer(Modifier.height(14.dp))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp), content = contenido)
    }
}

private fun copiar(contexto: Context, texto: String) {
    contexto.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("DUOLAB", texto))
}

@Composable
fun VistaCuenta(vm: AppVM) {
    val u = vm.usuario ?: return
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { CabeceraSeccion("Mi cuenta") }
        item { TusDatos(vm, u) }
        item { Recordatorios(vm, u) }
        item { AppNotificaciones() }
        item { Gmail(vm, u) }
        item { AvisosTelefono(vm) }
    }
}

@Composable
private fun TusDatos(vm: AppVM, u: Usuario) {
    var nombre by remember(u.id) { mutableStateOf(u.nombre) }
    var whatsapp by remember(u.id) { mutableStateOf(u.json.optString("whatsapp")) }
    TarjetaCuenta(Iconos.billetera, "Tus datos", "El bot de WhatsApp te reconoce por tu número.") {
        Campo("Nombre", nombre, { nombre = it.take(60) })
        Campo("Correo", u.email, {}, habilitado = false)
        Campo("WhatsApp", whatsapp, { whatsapp = it.take(24) }, teclado = KeyboardType.Phone, pista = "+51 987 654 321")
        BotonLima("Guardar", habilitado = !vm.ocupado) {
            vm.hacer {
                vm.ponerUsuario(Api.patch("/auth/yo", JSONObject().put("nombre", nombre.trim()).put("whatsapp", whatsapp.trim())).getJSONObject("usuario"))
                vm.aviso = "Datos guardados"
            }
        }
        val t = LocalTokens.current
        Text(
            when {
                u.json.optBoolean("google") && !u.json.optBoolean("tienePassword") -> "Entras con Google. Para usar contraseña: «¿Olvidaste tu contraseña?» al entrar."
                u.json.optBoolean("google") -> "Entras con tu contraseña o con Google."
                else -> "Entras con tu correo y contraseña."
            }, color = t.tenue, fontSize = 12.sp,
        )
    }
}

@Composable
private fun Recordatorios(vm: AppVM, u: Usuario) {
    val r = u.json.optJSONObject("recordatorio")
    var dias by remember(u.id) { mutableStateOf(r?.optInt("dias", 2) ?: 2) }
    var mismoDia by remember(u.id) { mutableStateOf(r?.optBoolean("mismoDia", true) ?: true) }
    TarjetaCuenta(Iconos.reloj, "Recordatorios de pago", "Te aviso por WhatsApp y notificación antes de que venza un pago.") {
        Text("Avisarme", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(0 to "Solo el mismo día", 1 to "1 día antes", 2 to "2 días antes", 3 to "3 días antes", 5 to "5 días antes", 7 to "1 semana antes").forEach { (d, n) ->
                FilterChip(selected = dias == d, onClick = { dias = d }, label = { Text(n) }, colors = chipLima(), shape = RoundedCornerShape(50))
            }
        }
        if (dias > 0) Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(mismoDia, { mismoDia = it })
            Text("Y también el mismo día")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BotonLima("Guardar", Modifier.weight(1f), habilitado = !vm.ocupado) {
                vm.hacer {
                    vm.ponerUsuario(Api.patch("/auth/yo", JSONObject().put("recordatorio", JSONObject().put("dias", dias).put("mismoDia", mismoDia))).getJSONObject("usuario"))
                    vm.aviso = "Recordatorios guardados"
                }
            }
            BotonSuave("Probar", Modifier.weight(1f)) {
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
    TarjetaCuenta(Iconos.casa, "App y notificaciones", "En este teléfono.") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(if (permitido) Color(0xFF55A630) else Color(0xFFE5484D)))
            Text(if (permitido) "  Notificaciones activadas" else "  Notificaciones desactivadas", fontWeight = FontWeight.SemiBold)
        }
        Text("Te aviso de cada gasto o ingreso que llegue solo (Gmail, Yape, WhatsApp u otra persona del libro). Se revisa cada 15 minutos.", color = t.tenue, fontSize = 12.sp)
        if (!permitido) BotonLima("Activar notificaciones") {
            if (Build.VERSION.SDK_INT >= 33) pedir.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        BotonSuave("Ajustes de notificaciones del teléfono", Modifier.fillMaxWidth()) {
            contexto.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, contexto.packageName))
        }
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
    TarjetaCuenta(Iconos.enviar, "Gastos desde tu Gmail", "Registra solos los avisos de bancos, Yape, tiendas y apps.") {
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
                        if (!c.optBoolean("registrado")) Text("Volver a revisar", fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp).clickable {
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
    TarjetaCuenta(Iconos.imagen, "Yape, Plin y avisos del teléfono", "Registra los yapes que no llegan por correo, sin duplicar.") {
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
            if (!Lectura.disponible) {
                Text("Yape automático con MacroDroid (de Play Store)", fontWeight = FontWeight.Bold, fontSize = 14.sp)
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
            Text("Actualizar", fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clip(RoundedCornerShape(50)).background(t.elev).clickable {
                vm.hacer { historial = Api.get("/avisos/historial").optJSONArray("avisos")?.objetos().orEmpty() }
            }.padding(horizontal = 12.dp, vertical = 7.dp))
        }
        if (historial.isEmpty()) Text("Todavía no llegó nada a tu enlace.", color = t.tenue, fontSize = 12.sp)
        historial.forEach { a ->
            Row(verticalAlignment = Alignment.Top) {
                Text(if (a.optBoolean("ok")) "✓" else "!", color = if (a.optBoolean("ok")) Color(0xFF3E8E2F) else Color(0xFFE5484D), fontWeight = FontWeight.Bold, modifier = Modifier.width(18.dp))
                Column {
                    Text("${a.optString("cuando").take(16).replace("T", " ")} · ${a.optString("origen")}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Text(a.optString("resultado"), fontSize = 12.sp, color = t.tenue, maxLines = 2)
                }
            }
        }
    }
}
