package pe.duolab.gastos

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.time.LocalDate

// ---------- compartir ----------

@Composable
fun VistaCompartir(vm: AppVM) {
    val t = LocalTokens.current
    val libro = vm.libro ?: return
    var periodo by remember { mutableStateOf("mes") }
    var para by remember { mutableStateOf("") }
    var miembros by remember { mutableStateOf<List<JSONObject>?>(null) }
    var email by remember { mutableStateOf("") }
    var rol by remember { mutableStateOf("lector") }
    val propietario = libro.rol == "propietario"
    LaunchedEffect(libro.id) { runCatching { miembros = Api.get("/libros/${libro.id}/miembros").optJSONArray("miembros")?.objetos().orEmpty() } }
    fun rango(): Pair<LocalDate, LocalDate> = when (periodo) {
        "anterior" -> vm.mes.minusMonths(1).let { it.atDay(1) to it.atEndOfMonth() }
        "anio" -> LocalDate.of(vm.mes.year, 1, 1) to LocalDate.of(vm.mes.year, 12, 31)
        else -> vm.mes.atDay(1) to vm.mes.atEndOfMonth()
    }
    fun enviar(canal: String) = vm.hacer {
        val (desde, hasta) = rango()
        val cuerpo = JSONObject().put("desde", desde.toString()).put("hasta", hasta.toString()).put("canal", canal)
        if (canal == "correo") cuerpo.put("para", para.trim())
        val r = Api.post("/libros/${libro.id}/enviar", cuerpo)
        vm.aviso = "Enviado a ${r.optString("destino").ifBlank { if (canal == "correo") para else "tu WhatsApp" }}"
    }
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { CabeceraSeccion("Compartir", "${libro.nombre} · ${libro.moneda}") }
        item {
            TarjetaCuenta(Iconos.enviar, "Enviar el estado de cuenta", "Resumen y PDF del periodo por WhatsApp o correo.") {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("mes" to nombreMes(vm.mes), "anterior" to nombreMes(vm.mes.minusMonths(1)), "anio" to "Año ${vm.mes.year}").forEach { (v, n) ->
                        FilterChip(selected = periodo == v, onClick = { periodo = v }, label = { Text(n) }, colors = chipLima(), shape = RoundedCornerShape(50))
                    }
                }
                BotonLima("Enviar a mi WhatsApp", habilitado = !vm.ocupado) { enviar("whatsapp") }
                Campo("O por correo a", para, { para = it.trim() }, teclado = KeyboardType.Email, pista = "correo@ejemplo.com")
                BotonSuave("Enviar por correo", Modifier.fillMaxWidth(), habilitado = para.contains("@") && !vm.ocupado) { enviar("correo") }
            }
        }
        item {
            TarjetaCuenta(Iconos.billetera, "Personas con acceso al libro", if (propietario) "Invita por correo: lector solo ve, editor también anota." else "Este libro te lo compartió ${libro.propietario}.") {
                val lista = miembros
                if (lista == null) CircularProgressIndicator(color = Lima)
                else lista.forEach { m ->
                    val esDueno = m.optString("rol") == "propietario"
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(t.elev).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(34.dp).clip(CircleShape).background(Lima), contentAlignment = Alignment.Center) { Text(m.optString("nombre").take(1).uppercase(), color = SobreLima, fontWeight = FontWeight.Bold) }
                        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                            Text(m.optString("nombre"), fontWeight = FontWeight.SemiBold)
                            Text(m.optString("email"), color = t.tenue, fontSize = 12.sp)
                        }
                        if (esDueno || !propietario) Text(m.optString("rol").replaceFirstChar { it.uppercase() }, color = t.tenue, fontSize = 12.sp)
                        else {
                            Text(if (m.optString("rol") == "editor") "Editor" else "Lector", fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.toque {
                                vm.hacer {
                                    Api.patch("/libros/${libro.id}/miembros/${m.optString("id")}", JSONObject().put("rol", if (m.optString("rol") == "editor") "lector" else "editor"))
                                    miembros = Api.get("/libros/${libro.id}/miembros").optJSONArray("miembros")?.objetos().orEmpty()
                                }
                            }.padding(6.dp))
                            Text("Quitar", color = Color(0xFFE5484D), fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.toque {
                                vm.hacer {
                                    Api.delete("/libros/${libro.id}/miembros/${m.optString("id")}")
                                    miembros = Api.get("/libros/${libro.id}/miembros").optJSONArray("miembros")?.objetos().orEmpty()
                                }
                            }.padding(6.dp))
                        }
                    }
                }
                if (propietario) {
                    Campo("Invitar por correo", email, { email = it.trim() }, teclado = KeyboardType.Email, pista = "persona@correo.com")
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("lector" to "Lector (solo ve)", "editor" to "Editor (anota)").forEach { (v, n) ->
                            FilterChip(selected = rol == v, onClick = { rol = v }, label = { Text(n) }, colors = chipLima(), shape = RoundedCornerShape(50))
                        }
                    }
                    BotonLima("Invitar", habilitado = email.contains("@") && !vm.ocupado) {
                        vm.hacer {
                            Api.post("/libros/${libro.id}/miembros", JSONObject().put("email", email).put("rol", rol))
                            email = ""
                            vm.aviso = "Persona añadida al libro"
                            miembros = Api.get("/libros/${libro.id}/miembros").optJSONArray("miembros")?.objetos().orEmpty()
                        }
                    }
                }
            }
        }
    }
}

// ---------- administración ----------

@Composable
fun VistaAdmin(vm: AppVM) {
    val t = LocalTokens.current
    var seccion by remember { mutableStateOf("almacenamiento") }
    var alm by remember { mutableStateOf<JSONObject?>(null) }
    var usuarios by remember { mutableStateOf<List<JSONObject>?>(null) }
    var wa by remember { mutableStateOf<JSONObject?>(null) }
    var ia by remember { mutableStateOf<JSONObject?>(null) }
    var atajo by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        runCatching { alm = Api.get("/admin/almacenamiento") }
        runCatching { usuarios = Api.get("/admin/usuarios").optJSONArray("usuarios")?.objetos().orEmpty() }
        runCatching { wa = Api.get("/admin/whatsapp") }
        runCatching { ia = Api.get("/admin/ia") }
        runCatching { atajo = Api.get("/admin/atajo").optString("url").takeIf { it != "null" }.orEmpty() }
    }
    // Mientras se espera el QR de WhatsApp, se consulta cada 3 segundos (como la web).
    LaunchedEffect(seccion, wa?.optString("estado")) {
        while (seccion == "whatsapp" && wa?.optString("estado") in listOf("conectando", "esperando-qr", "qr")) {
            delay(3000)
            runCatching { wa = Api.get("/admin/whatsapp") }
        }
    }
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { CabeceraSeccion("Administrador") }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("almacenamiento" to "Almacenamiento", "usuarios" to "Usuarios", "whatsapp" to "WhatsApp", "ia" to "IA", "atajo" to "Atajo iPhone").forEach { (v, n) ->
                    FilterChip(selected = seccion == v, onClick = { seccion = v }, label = { Text(n) }, colors = chipLima(), shape = RoundedCornerShape(50))
                }
            }
        }
        when (seccion) {
            "almacenamiento" -> item {
                val a = alm
                if (a == null) CircularProgressIndicator(color = Lima) else {
                    val tam = { b: Double -> if (b > 1e6) "%.1f MB".format(b / 1e6) else "%.0f KB".format(b / 1e3) }
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            DatoAdmin("Espacio libre", tam(a.optDouble("libre")), "de ${tam(a.optDouble("limite"))}", Modifier.weight(1f))
                            DatoAdmin("Usado", tam(a.optDouble("usado")), "%.1f %%".format(a.optDouble("porcentaje")), Modifier.weight(1f))
                        }
                        val tot = a.optJSONObject("totales")
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            DatoAdmin("Movimientos", "${tot?.optInt("movimientos")}", "${tot?.optInt("usuarios")} usuarios · ${tot?.optInt("libros")} libros", Modifier.weight(1f))
                            DatoAdmin("Caben aún", "≈ ${a.optLong("movimientosQueCaben")}", "movimientos · ${a.optInt("latenciaMs")} ms", Modifier.weight(1f))
                        }
                    }
                }
            }
            "usuarios" -> item { UsuariosAdmin(vm, usuarios) { usuarios = it } }
            "whatsapp" -> item {
                val w = wa
                TarjetaCuenta(Iconos.asistente, "Bot de WhatsApp", "El número que responde y envía los avisos.") {
                    if (w == null) CircularProgressIndicator(color = Lima) else {
                        val estado = w.optString("estado")
                        Text(when (estado) { "conectado" -> "✓ Conectado${w.optString("numero").takeIf { it.isNotBlank() && it != "null" }?.let { " como +$it" } ?: ""}"; "desconectado" -> "Desconectado"; else -> "Conectando… escanea el código" }, fontWeight = FontWeight.Bold)
                        w.optString("aviso").takeIf { it.isNotBlank() && it != "null" }?.let { Text(it, color = t.tenue, fontSize = 12.sp) }
                        w.optString("qr").takeIf { it.startsWith("data:image") }?.let { qr ->
                            val bytes = Base64.decode(qr.substringAfter(","), Base64.DEFAULT)
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.let { Image(it.asImageBitmap(), "Código QR de WhatsApp", Modifier.size(240.dp).align(Alignment.CenterHorizontally)) }
                            Text("En el teléfono del bot: WhatsApp → Dispositivos vinculados → Vincular un dispositivo.", color = t.tenue, fontSize = 12.sp)
                        }
                        Text("${w.optInt("conNumero")} usuarios con WhatsApp guardado", color = t.tenue, fontSize = 12.sp)
                        if (estado == "conectado") BotonSuave("Desconectar", Modifier.fillMaxWidth(), peligro = true) { vm.hacer { wa = Api.post("/admin/whatsapp/desconectar") } }
                        else BotonLima("Conectar (mostrar QR)") { vm.hacer { wa = Api.post("/admin/whatsapp/conectar") } }
                    }
                }
            }
            "ia" -> item { IaAdmin(vm, ia) { ia = it } }
            "atajo" -> item {
                TarjetaCuenta(Iconos.imagen, "Atajo de iPhone «DUOLAB Yape»", "Enlace de iCloud para que cada iPhone lo añada con un toque.") {
                    Campo("Enlace de iCloud del atajo", atajo, { atajo = it.trim() }, teclado = KeyboardType.Uri, pista = "https://www.icloud.com/shortcuts/…")
                    BotonLima("Guardar") { vm.hacer { atajo = Api.put("/admin/atajo", JSONObject().put("url", atajo)).optString("url").takeIf { it != "null" }.orEmpty(); vm.aviso = "Atajo guardado" } }
                }
            }
        }
    }
}

@Composable
private fun DatoAdmin(titulo: String, valor: String, nota: String, modifier: Modifier) {
    val t = LocalTokens.current
    Column(modifier.clip(RoundedCornerShape(22.dp)).background(t.sup).padding(14.dp)) {
        Text(titulo, color = t.tenue, fontSize = 12.sp)
        Text(valor, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, maxLines = 1)
        Text(nota, color = t.tenue, fontSize = 11.sp, maxLines = 2)
    }
}

@Composable
private fun UsuariosAdmin(vm: AppVM, usuarios: List<JSONObject>?, alCambiar: (List<JSONObject>) -> Unit) {
    val t = LocalTokens.current
    var nombre by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var clave by remember { mutableStateOf("") }
    var whatsapp by remember { mutableStateOf("") }
    var borrar by remember { mutableStateOf<JSONObject?>(null) }
    val recargar = suspend { alCambiar(Api.get("/admin/usuarios").optJSONArray("usuarios")?.objetos().orEmpty()) }
    TarjetaCuenta(Iconos.billetera, "Usuarios", "${usuarios?.size ?: 0} cuentas") {
        usuarios?.forEach { u ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(t.elev).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(u.optString("nombre"), fontWeight = FontWeight.SemiBold)
                    Text("${u.optString("email")} · ${u.optInt("libros")} libros", color = t.tenue, fontSize = 12.sp)
                }
                if (u.optString("id") != vm.usuario?.id) Text("Eliminar", color = Color(0xFFE5484D), fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.toque { borrar = u }.padding(6.dp))
            }
        }
        Text("Crear usuario", fontWeight = FontWeight.Bold)
        Campo("Nombre", nombre, { nombre = it.take(60) })
        Campo("Correo", email, { email = it.trim() }, teclado = KeyboardType.Email)
        Campo("WhatsApp (opcional)", whatsapp, { whatsapp = it.take(24) }, teclado = KeyboardType.Phone)
        Campo("Contraseña (mínimo 8)", clave, { clave = it.take(72) }, clave = true)
        BotonLima("Crear usuario", habilitado = nombre.isNotBlank() && email.contains("@") && clave.length >= 8 && !vm.ocupado) {
            vm.hacer {
                Api.post("/admin/usuarios", JSONObject().put("nombre", nombre).put("email", email).put("password", clave).put("whatsapp", whatsapp))
                nombre = ""; email = ""; clave = ""; whatsapp = ""
                vm.aviso = "Usuario creado"
                recargar()
            }
        }
    }
    borrar?.let { u ->
        AlertDialog(
            onDismissRequest = { borrar = null },
            title = { Text("¿Eliminar a ${u.optString("nombre")}?") },
            text = { Text("Se borrarán también sus libros y todos sus movimientos. No se puede deshacer.") },
            confirmButton = { TextButton(onClick = { borrar = null; vm.hacer { Api.delete("/admin/usuarios/${u.optString("id")}"); vm.aviso = "Cuenta eliminada"; recargar() } }) { Text("Eliminar", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { borrar = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun IaAdmin(vm: AppVM, ia: JSONObject?, alCambiar: (JSONObject) -> Unit) {
    val t = LocalTokens.current
    if (ia == null) { CircularProgressIndicator(color = Lima); return }
    var proveedor by remember(ia) { mutableStateOf(ia.optString("proveedor")) }
    var clave by remember { mutableStateOf("") }
    var activa by remember(ia) { mutableStateOf(ia.optBoolean("activa")) }
    var todo by remember(ia) { mutableStateOf(ia.optBoolean("responderTodo")) }
    val provs = ia.optJSONObject("proveedores")
    val prov = provs?.optJSONObject(proveedor)
    var modelo by remember(ia, proveedor) { mutableStateOf(prov?.optString("modelo").orEmpty()) }
    TarjetaCuenta(Iconos.asistente, "Inteligencia artificial", if (ia.optBoolean("disponible")) "Activada · ${provs?.optJSONObject(ia.optString("proveedor"))?.optString("nombre")}" else "Desactivada") {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            provs?.keys()?.forEach { id ->
                FilterChip(selected = proveedor == id, onClick = { proveedor = id }, label = { Text(provs.optJSONObject(id)?.optString("nombre") ?: id) }, colors = chipLima(), shape = RoundedCornerShape(50))
            }
        }
        Campo("Clave de la API", clave, { clave = it.take(300) }, clave = true,
            pista = if (prov?.optBoolean("tieneClave") == true) "Guardada (termina en ${prov.optString("finalClave")})" else prov?.optString("ejemploClave"))
        Text("Modelo", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        val modelos = prov?.optJSONObject("modelos")
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            modelos?.keys()?.asSequence()?.take(12)?.forEach { id ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (modelo == id) Lima.copy(alpha = 0.35f) else t.elev).toque { modelo = id }.padding(10.dp)) {
                    Text(modelos.optString(id), fontSize = 13.sp)
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(activa, { activa = it }); Text("Activar la IA en el bot de WhatsApp") }
        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(todo, { todo = it }); Text("Responder a cualquier mensaje de un usuario", fontSize = 13.sp) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BotonLima("Guardar", Modifier.weight(1f), habilitado = !vm.ocupado) {
                vm.hacer {
                    val cuerpo = JSONObject().put("proveedor", proveedor).put("modelo", modelo).put("activa", activa).put("responderTodo", todo)
                    if (clave.isNotBlank()) cuerpo.put("clave", clave.trim())
                    alCambiar(Api.put("/admin/ia", cuerpo))
                    clave = ""
                    vm.aviso = "Ajustes de IA guardados"
                }
            }
            BotonSuave("Probar", Modifier.weight(1f)) { vm.hacer { vm.aviso = Api.post("/admin/ia/probar").optString("mensaje") } }
        }
    }
}
