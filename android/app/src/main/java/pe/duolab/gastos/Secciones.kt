package pe.duolab.gastos

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.YearMonth

/** Cabecera de sección como .periodo de la web: título y, a la derecha, lo que haga falta. */
@Composable
fun CabeceraSeccion(titulo: String, nota: String? = null, derecha: @Composable RowScope.() -> Unit = {}) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(t.sup).padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(titulo, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
            if (nota != null) Text(nota, color = t.tenue, fontSize = 12.sp)
        }
        derecha()
    }
}

private fun montoDe(s: String) = s.replace(",", ".").trim().toDoubleOrNull() ?: 0.0

// ---------- metas de ahorro ----------

@Composable
fun VistaMetas(vm: AppVM) {
    val t = LocalTokens.current
    LaunchedEffect(vm.libroId) { vm.cargarMetas() }
    var nueva by remember { mutableStateOf(false) }
    var moviendo by remember { mutableStateOf<Pair<Meta, Boolean>?>(null) }
    val editar = vm.libro?.puedeEditar == true
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            CabeceraSeccion("Metas de ahorro", "Ahorra para lo que quieres, paso a paso") {
                if (editar) Text("+ Nueva", fontWeight = FontWeight.Bold, color = SobreLima, modifier = Modifier.clip(RoundedCornerShape(50)).background(Lima).clickable { nueva = true }.padding(horizontal = 14.dp, vertical = 9.dp))
            }
        }
        val metas = vm.metas
        if (metas == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Lima) } }
        else if (metas.isEmpty()) item { Panel { Text("Aún no tienes metas. Crea una con «+ Nueva»: un viaje, un fondo de emergencia, una compra…", color = t.tenue) } }
        else items(metas, key = { it.id }) { m ->
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Anillo(m.progreso.toFloat(), if (m.completada) Color(0xFF55A630) else Lima)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(m.nombre, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text("${dinero(m.ahorrado, vm.moneda)} de ${dinero(m.objetivo, vm.moneda)}", color = t.tenue, fontSize = 13.sp)
                        val falta = (m.objetivo - m.ahorrado).coerceAtLeast(0.0)
                        val nota = when {
                            m.completada -> "¡Meta cumplida! 🎉"
                            m.fechaLimite != null -> {
                                val meses = java.time.Period.between(LocalDate.now(), m.fechaLimite).toTotalMonths().coerceAtLeast(1)
                                "Faltan ${dinero(falta, vm.moneda)} · ${dinero(falta / meses, vm.moneda)} al mes hasta ${fechaCorta(m.fechaLimite)}"
                            }
                            else -> "Faltan ${dinero(falta, vm.moneda)}"
                        }
                        Text(nota, color = t.tenue, fontSize = 12.sp)
                    }
                }
                if (editar) {
                    Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { moviendo = m to true }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(50), colors = ButtonDefaults.buttonColors(containerColor = Lima, contentColor = SobreLima)) { Text("Aportar", fontWeight = FontWeight.Bold) }
                        OutlinedButton(onClick = { moviendo = m to false }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(50), enabled = m.ahorrado > 0) { Text("Retirar") }
                    }
                }
            }
        }
    }
    if (nueva) DialogoNuevaMeta(vm) { nueva = false }
    moviendo?.let { (meta, aportar) -> DialogoMoverMeta(vm, meta, aportar) { moviendo = null } }
}

@Composable
private fun Anillo(progreso: Float, color: Color) {
    val t = LocalTokens.current
    Box(Modifier.size(64.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            drawArc(t.elev, -90f, 360f, false, style = Stroke(width = 14f))
            drawArc(color, -90f, 360f * progreso, false, style = Stroke(width = 14f, cap = StrokeCap.Round))
        }
        Text("${(progreso * 100).toInt()} %", fontWeight = FontWeight.Bold, fontSize = 13.sp)
    }
}

@Composable
private fun DialogoNuevaMeta(vm: AppVM, alCerrar: () -> Unit) {
    var nombre by remember { mutableStateOf("") }
    var objetivo by remember { mutableStateOf("") }
    var inicial by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Nueva meta de ahorro") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(nombre, { nombre = it.take(60) }, label = { Text("Nombre (viaje, emergencia…)") }, singleLine = true)
                OutlinedTextField(objetivo, { objetivo = it }, label = { Text("Objetivo (${vm.moneda})") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                OutlinedTextField(inicial, { inicial = it }, label = { Text("Ya ahorrado (opcional)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
            }
        },
        confirmButton = { TextButton(enabled = nombre.isNotBlank() && montoDe(objetivo) > 0, onClick = { vm.crearMeta(nombre, montoDe(objetivo), montoDe(inicial), null, alCerrar) }) { Text("Crear") } },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

@Composable
private fun DialogoMoverMeta(vm: AppVM, meta: Meta, aportar: Boolean, alCerrar: () -> Unit) {
    var monto by remember { mutableStateOf("") }
    var registrar by remember { mutableStateOf(true) }
    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text(if (aportar) "Aportar a «${meta.nombre}»" else "Retirar de «${meta.nombre}»") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(monto, { monto = it }, label = { Text("Monto (${vm.moneda})") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(registrar, { registrar = it })
                    Text(if (aportar) "Registrarlo también como gasto «Ahorro»" else "Registrarlo también como ingreso")
                }
            }
        },
        confirmButton = { TextButton(enabled = montoDe(monto) > 0, onClick = { vm.moverMeta(meta, if (aportar) montoDe(monto) else -montoDe(monto), registrar, alCerrar) }) { Text("Guardar") } },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

// ---------- categorías y presupuestos ----------

@Composable
fun VistaCategorias(vm: AppVM) {
    val t = LocalTokens.current
    var tipo by remember { mutableStateOf("gasto") }
    var editando by remember { mutableStateOf<CategoriaMes?>(null) }
    var nueva by remember { mutableStateOf(false) }
    LaunchedEffect(vm.libroId, vm.mes) { vm.cargarCategorias() }
    val editar = vm.libro?.puedeEditar == true
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            CabeceraSeccion("Categorías y presupuestos", nombreMes(vm.mes)) {
                if (editar) Text("+ Nueva", fontWeight = FontWeight.Bold, color = SobreLima, modifier = Modifier.clip(RoundedCornerShape(50)).background(Lima).clickable { nueva = true }.padding(horizontal = 14.dp, vertical = 9.dp))
            }
        }
        item {
            Row(Modifier.clip(RoundedCornerShape(50)).background(t.sup).padding(4.dp)) {
                listOf("gasto" to "Gastos", "ingreso" to "Ingresos").forEach { (v, n) ->
                    Text(n, fontWeight = FontWeight.Bold, color = if (tipo == v) SobreLima else t.tinta, textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f).clip(RoundedCornerShape(50)).background(if (tipo == v) Lima else Color.Transparent).clickable { tipo = v }.padding(vertical = 10.dp))
                }
            }
        }
        val lista = vm.categorias?.filter { it.tipo == tipo }
        if (lista == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Lima) } }
        else if (lista.isEmpty()) item { Panel { Text("Aún no hay categorías de ${if (tipo == "gasto") "gastos" else "ingresos"}.", color = t.tenue) } }
        else items(lista, key = { it.tipo + it.nombre }) { c ->
            Panel(Modifier.clickable(enabled = editar) { editando = c }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(12.dp).clip(CircleShape).background(c.color?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() } ?: Lima))
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(c.nombre, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text("${c.cuantosMes} movimientos este mes", color = t.tenue, fontSize = 12.sp)
                    }
                    Text(dinero(c.totalMes, vm.moneda), fontWeight = FontWeight.Bold)
                }
                val p = c.presupuesto
                if (p != null && p > 0) {
                    val uso = (c.totalMes / p).toFloat()
                    val color = if (uso > 1f) Color(0xFFE5484D) else if (uso > 0.8f) Naranja else Lima
                    Box(Modifier.padding(top = 10.dp).fillMaxWidth().height(9.dp).clip(RoundedCornerShape(50)).background(t.elev)) {
                        Box(Modifier.fillMaxWidth(uso.coerceIn(0f, 1f)).height(9.dp).clip(RoundedCornerShape(50)).background(color))
                    }
                    Text(
                        if (c.totalMes > p) "Te pasaste ${dinero(c.totalMes - p, vm.moneda)} del presupuesto de ${dinero(p, vm.moneda)}" else "Quedan ${dinero(p - c.totalMes, vm.moneda)} de ${dinero(p, vm.moneda)}",
                        color = if (c.totalMes > p) Color(0xFFE5484D) else t.tenue, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp),
                    )
                } else if (editar) {
                    Text("Toca para ponerle un presupuesto mensual", color = t.tenue, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }
    }
    if (nueva) DialogoCategoria(vm, null, tipo) { nueva = false }
    editando?.let { DialogoCategoria(vm, it, it.tipo) { editando = null } }
}

@Composable
private fun DialogoCategoria(vm: AppVM, c: CategoriaMes?, tipo: String, alCerrar: () -> Unit) {
    var nombre by remember { mutableStateOf(c?.nombre ?: "") }
    var presupuesto by remember { mutableStateOf(c?.presupuesto?.let(::formatoMontoEditable) ?: "") }
    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text(if (c == null) "Nueva categoría" else "Editar «${c.nombre}»") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(nombre, { nombre = it.take(40) }, label = { Text("Nombre") }, singleLine = true)
                if (tipo == "gasto") OutlinedTextField(presupuesto, { presupuesto = it }, label = { Text("Presupuesto mensual (opcional)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                if (c != null && !c.nombre.equals(nombre, true)) Text("Sus movimientos pasarán al nuevo nombre.", fontSize = 12.sp, color = LocalTokens.current.tenue)
            }
        },
        confirmButton = { TextButton(enabled = nombre.isNotBlank(), onClick = { vm.guardarCategoria(nombre, tipo, montoDe(presupuesto).takeIf { it > 0 }, c?.nombre, alCerrar) }) { Text("Guardar") } },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

// ---------- asistente IA ----------

@Composable
fun VistaAsistente(vm: AppVM) {
    val t = LocalTokens.current
    var texto by remember { mutableStateOf("") }
    val lista = rememberLazyListState()
    LaunchedEffect(vm.chat.size, vm.pensando) { if (vm.chat.isNotEmpty()) lista.animateScrollToItem(vm.chat.size + 1) }
    Column(Modifier.fillMaxSize().imePadding()) {
        LazyColumn(Modifier.weight(1f), state = lista, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { CabeceraSeccion("Asistente IA", "Pregúntale por tus gastos, pídele un resumen o el PDF") }
            if (vm.chat.isEmpty()) item {
                Panel {
                    Text("Prueba con:", fontWeight = FontWeight.Bold)
                    listOf("¿Cuánto gasté este mes?", "¿En qué gasto más?", "¿Qué pagos tengo pendientes?", "Envíame el resumen por WhatsApp").forEach { s ->
                        Text("“$s”", modifier = Modifier.padding(top = 8.dp).clip(RoundedCornerShape(50)).background(t.elev).clickable { vm.preguntar(s) }.padding(horizontal = 12.dp, vertical = 8.dp))
                    }
                }
            }
            items(vm.chat) { m ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (m.deMi) Arrangement.End else Arrangement.Start) {
                    Text(m.texto, color = if (m.deMi) SobreLima else t.tinta,
                        modifier = Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(18.dp)).background(if (m.deMi) Lima else t.sup).padding(12.dp))
                }
            }
            if (vm.pensando) item { Text("Escribiendo…", color = t.tenue, modifier = Modifier.padding(start = 8.dp)) }
        }
        Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 100.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(texto, { texto = it.take(1000) }, placeholder = { Text("Escribe tu pregunta…") }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(26.dp), maxLines = 4)
            Spacer(Modifier.width(8.dp))
            Box(Modifier.size(52.dp).clip(CircleShape).background(if (texto.isBlank()) t.elev else Lima).clickable(enabled = texto.isNotBlank() && !vm.pensando) { vm.preguntar(texto); texto = "" }, contentAlignment = Alignment.Center) {
                Icon(Iconos.enviar, "Enviar", tint = SobreLima, modifier = Modifier.size(20.dp))
            }
        }
    }
}

// ---------- año ----------

@Composable
fun VistaAnio(vm: AppVM) {
    val t = LocalTokens.current
    LaunchedEffect(vm.libroId) { vm.cargarAnio() }
    val r = vm.resumenAnio
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            CabeceraSeccion("Resumen del ${vm.anio}") {
                Text("‹", fontSize = 26.sp, modifier = Modifier.clickable { vm.cargarAnio(vm.anio - 1) }.padding(horizontal = 12.dp))
                Text("›", fontSize = 26.sp, modifier = Modifier.clickable { vm.cargarAnio(vm.anio + 1) }.padding(horizontal = 12.dp))
            }
        }
        if (r == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Lima) } }
        else {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    listOf(Triple("Ingresos", r.ingresos, Color(0xFF3E8E2F)), Triple("Gastos", r.gastos, Color(0xFFE5484D)), Triple("Balance", r.ingresos - r.gastos, t.tinta)).forEach { (n, v, c) ->
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(22.dp)).background(t.sup).padding(12.dp)) {
                            Text(n, color = t.tenue, fontSize = 12.sp)
                            Text(dinero(v, vm.moneda), color = c, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, maxLines = 1)
                        }
                    }
                }
            }
            item {
                Panel {
                    val maximo = r.meses.maxOfOrNull { maxOf(it.ingresos, it.gastos) }?.coerceAtLeast(1.0) ?: 1.0
                    r.meses.forEach { m ->
                        val ym = YearMonth.of(r.anio, m.mes)
                        Row(Modifier.fillMaxWidth().clickable { vm.irAMes(ym) }.padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(nombreMesCorto(ym).take(3), fontWeight = FontWeight.Bold, modifier = Modifier.width(40.dp))
                            Column(Modifier.weight(1f)) {
                                Box(Modifier.fillMaxWidth((m.ingresos / maximo).toFloat().coerceAtLeast(0.01f)).height(8.dp).clip(RoundedCornerShape(50)).background(Color(0xFF55A630)))
                                Spacer(Modifier.height(3.dp))
                                Box(Modifier.fillMaxWidth((m.gastos / maximo).toFloat().coerceAtLeast(0.01f)).height(8.dp).clip(RoundedCornerShape(50)).background(Color(0xFFF04A50)))
                            }
                            Text(dinero(m.ingresos - m.gastos, vm.moneda), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = if (m.ingresos - m.gastos < 0) Color(0xFFE5484D) else t.tinta, modifier = Modifier.width(96.dp), textAlign = TextAlign.End)
                        }
                    }
                }
            }
        }
    }
}

// ---------- informe PDF ----------

@Composable
fun VistaInforme(vm: AppVM, alPdf: (ByteArray, String) -> Unit) {
    val t = LocalTokens.current
    val hoy = LocalDate.now()
    val opciones = listOf(
        "Este mes" to (vm.mes.atDay(1) to vm.mes.atEndOfMonth()),
        "Mes anterior" to (vm.mes.minusMonths(1).atDay(1) to vm.mes.minusMonths(1).atEndOfMonth()),
        "Últimos 3 meses" to (hoy.minusMonths(3).plusDays(1) to hoy),
        "Este año" to (LocalDate.of(hoy.year, 1, 1) to LocalDate.of(hoy.year, 12, 31)),
    )
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        CabeceraSeccion("Informe PDF", "Resumen y lista completa del periodo")
        opciones.forEach { (nombre, rango) ->
            Panel(Modifier.clickable(enabled = !vm.ocupado) { vm.descargarInforme(rango.first, rango.second) { alPdf(it, "DUOLAB-${rango.first}-a-${rango.second}.pdf") } }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconoCaja(Iconos.descargar, Lima, SobreLima)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(nombre, fontWeight = FontWeight.Bold)
                        Text("${fechaCorta(rango.first)} – ${fechaCorta(rango.second)} ${rango.second.year}", color = t.tenue, fontSize = 12.sp)
                    }
                }
            }
        }
        if (vm.ocupado) Text("Preparando el PDF…", color = t.tenue)
    }
}

// ---------- captura de Yape, Plin o del banco ----------

@Composable
fun DialogoCaptura(vm: AppVM) {
    val lista = vm.captura ?: return
    val repetidos = lista.count { it.yaAnotado }
    AlertDialog(
        onDismissRequest = { vm.captura = null },
        title = { Text("Encontré ${lista.size} ${if (lista.size == 1) "movimiento" else "movimientos"}") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text(if (repetidos > 0) "Marca los que quieras registrar. $repetidos ya estaba${if (repetidos == 1) "" else "n"} en el libro y van sin marcar." else "Marca los que quieras registrar.", fontSize = 13.sp, color = LocalTokens.current.tenue)
                if (vm.notaCaptura.isNotBlank()) Text(vm.notaCaptura, fontSize = 12.sp, color = LocalTokens.current.tenue, modifier = Modifier.padding(top = 6.dp))
                lista.forEachIndexed { i, m ->
                    Row(Modifier.fillMaxWidth().clickable { vm.captura = lista.toMutableList().also { it[i] = m.copy(elegido = !m.elegido) } }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(m.elegido, { vm.captura = lista.toMutableList().also { l -> l[i] = m.copy(elegido = it) } })
                        Column(Modifier.weight(1f)) {
                            Text(m.descripcion, fontWeight = FontWeight.SemiBold, maxLines = 1)
                            Text(m.fecha + if (m.yaAnotado) " · ya registrado" else "", fontSize = 12.sp, color = LocalTokens.current.tenue)
                        }
                        Text((if (m.tipo == "gasto") "-" else "+") + dinero(m.monto, vm.moneda), fontWeight = FontWeight.Bold, color = if (m.tipo == "gasto") LocalTokens.current.tinta else Color(0xFF3E8E2F))
                    }
                }
            }
        },
        confirmButton = {
            val n = lista.count { it.elegido }
            TextButton(enabled = n > 0 && !vm.ocupado, onClick = { vm.registrarCaptura() }) { Text(if (n > 0) "Registrar $n" else "Registrar") }
        },
        dismissButton = { TextButton(onClick = { vm.captura = null }) { Text("Cancelar") } },
    )
}
