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
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.runtime.saveable.rememberSaveable
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
                if (editar) Text("+ Nueva", fontWeight = FontWeight.Bold, color = SobreLima, modifier = Modifier.clip(RoundedCornerShape(50)).background(Lima).toque { nueva = true }.padding(horizontal = 14.dp, vertical = 9.dp))
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
                if (editar) Text("+ Nueva", fontWeight = FontWeight.Bold, color = SobreLima, modifier = Modifier.clip(RoundedCornerShape(50)).background(Lima).toque { nueva = true }.padding(horizontal = 14.dp, vertical = 9.dp))
            }
        }
        item {
            Row(Modifier.clip(RoundedCornerShape(50)).background(t.sup).padding(4.dp)) {
                listOf("gasto" to "Gastos", "ingreso" to "Ingresos").forEach { (v, n) ->
                    Text(n, fontWeight = FontWeight.Bold, color = if (tipo == v) SobreLima else t.tinta, textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f).clip(RoundedCornerShape(50)).background(if (tipo == v) Lima else Color.Transparent).toque { tipo = v }.padding(vertical = 10.dp))
                }
            }
        }
        val lista = vm.categorias?.filter { it.tipo == tipo }
        if (lista == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Lima) } }
        else if (lista.isEmpty()) item { Panel { Text("Aún no hay categorías de ${if (tipo == "gasto") "gastos" else "ingresos"}.", color = t.tenue) } }
        else items(lista, key = { it.tipo + it.nombre }) { c ->
            Panel(Modifier.toque(habilitado = editar) { editando = c }) {
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
                        Text("“$s”", modifier = Modifier.padding(top = 8.dp).clip(RoundedCornerShape(50)).background(t.elev).toque { vm.preguntar(s) }.padding(horizontal = 12.dp, vertical = 8.dp))
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

private enum class SeccionAnio(val titulo: String) { GRAFICA("Gráfica"), MESES("Por mes"), CATEGORIAS("Categorías") }

/** Vista Año como la web: «‹ Año 2026 ›», cuatro tarjetas y Gráfica / Por mes / Categorías. */
@Composable
fun VistaAnio(vm: AppVM) {
    val t = LocalTokens.current
    LaunchedEffect(vm.libroId) { vm.cargarAnio() }
    val r = vm.resumenAnio
    val m = vm.moneda
    var seccion by rememberSaveable { mutableStateOf(SeccionAnio.GRAFICA) }
    val anioActual = LocalDate.now().year
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            // .periodo de la web: botones redondos a los lados y el año al centro.
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(t.sup).padding(horizontal = 10.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                BotonRedondo("‹", "Año anterior") { vm.cargarAnio(vm.anio - 1) }
                Text("Año ${vm.anio}", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                if (vm.anio != anioActual) {
                    Text("Este año", fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(end = 6.dp).clip(RoundedCornerShape(50)).background(t.elev).toque { vm.cargarAnio(anioActual) }.padding(horizontal = 12.dp, vertical = 8.dp))
                }
                BotonRedondo("›", "Año siguiente") { vm.cargarAnio(vm.anio + 1) }
            }
        }
        val cargando = r == null
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.height(IntrinsicSize.Max)) {
                    TarjetaWeb("Ingresos del año", dinero(r?.ingresos ?: 0.0, m), if ((r?.ingresosPendientes ?: 0.0) > 0) "${dinero(r!!.ingresosPendientes, m)} por recibir" else "Todo recibido",
                        Iconos.entrada, Color(0xFFE3F1DA), Color(0xFF3E8E2F), t.tinta, Modifier.weight(1f).fillMaxHeight(), cargando = cargando)
                    TarjetaWeb("Gastos del año", dinero(r?.gastos ?: 0.0, m), "${dinero(r?.gastosPagados ?: 0.0, m)} ya pagado",
                        Iconos.salida, Color(0xFFFDE2E2), Color(0xFFE5484D), t.tinta, Modifier.weight(1f).fillMaxHeight(),
                        progreso = r?.let { if (it.gastos > 0) (it.gastosPagados / it.gastos).toFloat() else 0f } ?: 0f, colorBarra = Color(0xFFF04A50), cargando = cargando)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.height(IntrinsicSize.Max)) {
                    TarjetaWeb("Balance del año", dinero(r?.balance ?: 0.0, m), "Ingresos menos gastos",
                        Iconos.balanza, Color.Transparent, SobreLima, SobreLima, Modifier.weight(1f).fillMaxHeight(), cargando = cargando, destacada = true)
                    TarjetaWeb("Falta por pagar", dinero(r?.gastosPendientes ?: 0.0, m), "Gastos sin pagar del año",
                        Iconos.reloj, Color(0xFFFDE2E2), Color(0xFFE5484D), t.tinta, Modifier.weight(1f).fillMaxHeight(), cargando = cargando)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SeccionAnio.entries.forEach { s ->
                    val activo = s == seccion
                    Box(Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(16.dp)).background(if (activo) Lima else t.sup).toque { seccion = s }, contentAlignment = Alignment.Center) {
                        Text(s.titulo, fontWeight = if (activo) FontWeight.Bold else FontWeight.SemiBold, color = if (activo) SobreLima else t.tinta, fontSize = 14.sp, maxLines = 1)
                    }
                }
            }
        }
        if (r == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Lima) } }
        else when (seccion) {
            SeccionAnio.GRAFICA -> item { GraficaAnio(r) { vm.irAMes(it) } }
            SeccionAnio.MESES -> item { TablaMeses(r, m) { vm.irAMes(it) } }
            SeccionAnio.CATEGORIAS -> {
                item { TablaCategoriasAnio("Gastos por categoría", r.categorias.filter { it.tipo == "gasto" }, r.gastos, m) }
                item { TablaCategoriasAnio("Ingresos por categoría", r.categorias.filter { it.tipo == "ingreso" }, r.ingresos, m) }
            }
        }
    }
}

@Composable
private fun BotonRedondo(texto: String, descripcion: String, alTocar: () -> Unit) {
    val t = LocalTokens.current
    Box(Modifier.size(42.dp).clip(CircleShape).background(t.elev).toque(alTocar = alTocar), contentAlignment = Alignment.Center) {
        Text(texto, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 3.dp))
    }
}

/** Mes corto en mayúsculas como la web: ENE, FEB, MAR… (SEPT en es-PE se deja en SET). */
private fun mesCorto(mes: Int) = listOf("ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DIC")[mes - 1]

/** «Ingresos y gastos por mes»: columnas por mes, ingresos llenos y gastos rayados (.trama-gasto). */
@Composable
private fun GraficaAnio(r: ResumenAnio, alMes: (YearMonth) -> Unit) {
    val t = LocalTokens.current
    val maximo = r.meses.maxOfOrNull { maxOf(it.ingresos, it.gastos) }?.takeIf { it > 0 } ?: 1.0
    val raya = t.tenue.copy(alpha = 0.75f)
    Panel {
        Text("Ingresos y gastos por mes", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Row(Modifier.padding(top = 8.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(12.dp).clip(RoundedCornerShape(3.dp)).background(t.tinta))
            Text("  Ingresos", fontSize = 12.sp, color = t.tenue)
            Spacer(Modifier.width(16.dp))
            Canvas(Modifier.size(12.dp)) { rayado(raya, 0f, 0f, size.width, size.height) }
            Text("  Gastos", fontSize = 12.sp, color = t.tenue)
        }
        Row(Modifier.fillMaxWidth().height(180.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            r.meses.forEach { mes ->
                Column(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(6.dp)).toque { alMes(YearMonth.of(r.anio, mes.mes)) }) {
                    val tinta = t.tinta
                    Canvas(Modifier.fillMaxWidth().weight(1f)) {
                        val ancho = (size.width * 0.38f).coerceAtMost(20.dp.toPx())
                        val hueco = 2.dp.toPx()
                        val x0 = size.width / 2 - ancho - hueco / 2
                        val hi = (mes.ingresos / maximo).toFloat() * size.height
                        val hg = (mes.gastos / maximo).toFloat() * size.height
                        val radio = androidx.compose.ui.geometry.CornerRadius(3.dp.toPx())
                        if (hi > 0) drawRoundRect(tinta, Offset(x0, size.height - hi), androidx.compose.ui.geometry.Size(ancho, hi), radio)
                        if (hg > 0) rayado(raya, x0 + ancho + hueco, size.height - hg, ancho, hg)
                        drawLine(raya, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx())
                    }
                    Text(mesCorto(mes.mes), fontSize = 9.sp, fontWeight = FontWeight.SemiBold, color = t.tenue, textAlign = TextAlign.Center, maxLines = 1, softWrap = false,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp))
                }
            }
        }
    }
}

/** Columna con rayas a 135° y borde, como .trama-gasto de la web. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.rayado(color: Color, x: Float, y: Float, w: Float, h: Float) {
    if (w <= 0f || h <= 0f) return
    val paso = 5.dp.toPx()
    clipRect(x, y, x + w, y + h) {
        var d = -h
        while (d < w) {
            drawLine(color, Offset(x + d, y + h), Offset(x + d + h, y), 1.6.dp.toPx())
            d += paso
        }
    }
    drawRect(color, Offset(x, y), androidx.compose.ui.geometry.Size(w, h), style = Stroke(1.dp.toPx()))
}

/** «Detalle por mes»: mes, ingresos, gastos y balance; toca un mes para abrirlo. */
@Composable
private fun TablaMeses(r: ResumenAnio, moneda: String, alMes: (YearMonth) -> Unit) {
    val t = LocalTokens.current
    Panel {
        Row(verticalAlignment = Alignment.Bottom) {
            Text("Detalle por mes", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text("  toca un mes para abrirlo", color = t.tenue, fontSize = 11.sp)
        }
        Spacer(Modifier.height(8.dp))
        @Composable
        fun Fila(c1: String, c2: String, c3: String, c4: String, color4: Color, negrita: Boolean, modifier: Modifier = Modifier) {
            val peso = if (negrita) FontWeight.Bold else FontWeight.Medium
            Row(modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(c1, fontWeight = peso, fontSize = 13.sp, modifier = Modifier.weight(1.05f), maxLines = 1)
                TextoAjustable(c2, t.tinta, 12, 9, peso, Modifier.weight(1f).wrapContentWidth(Alignment.End))
                TextoAjustable(c3, t.tinta, 12, 9, peso, Modifier.weight(1f).wrapContentWidth(Alignment.End))
                TextoAjustable(c4, color4, 12, 9, FontWeight.Bold, Modifier.weight(1f).wrapContentWidth(Alignment.End))
            }
        }
        Fila("Mes", "Ingresos", "Gastos", "Balance", t.tenue, true)
        HorizontalDivider(color = t.linea)
        r.meses.forEach { mes ->
            val ym = YearMonth.of(r.anio, mes.mes)
            Fila(nombreMesCorto(ym), dinero(mes.ingresos, moneda), dinero(mes.gastos, moneda), dinero(mes.balance, moneda),
                if (mes.balance < 0) Color(0xFFE5484D) else if (mes.balance > 0) Color(0xFF3E8E2F) else t.tinta, false, Modifier.toque { alMes(ym) })
            HorizontalDivider(color = t.linea)
        }
        Fila("Total ${r.anio}", dinero(r.ingresos, moneda), dinero(r.gastos, moneda), dinero(r.balance, moneda), t.tinta, true)
    }
}

/** «Gastos / Ingresos por categoría» del año: nombre con barra, monto y porcentaje. */
@Composable
private fun TablaCategoriasAnio(titulo: String, lista: List<CategoriaAnio>, total: Double, moneda: String) {
    val t = LocalTokens.current
    Panel {
        Text(titulo, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Spacer(Modifier.height(6.dp))
        if (lista.isEmpty()) {
            Text("Sin movimientos este año.", color = t.tenue, modifier = Modifier.padding(vertical = 12.dp))
            return@Panel
        }
        val mayor = lista.maxOf { it.total }.takeIf { it > 0 } ?: 1.0
        lista.forEach { c ->
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(c.categoria, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                    Spacer(Modifier.height(4.dp))
                    Box(Modifier.fillMaxWidth((c.total / mayor).toFloat().coerceIn(0.02f, 1f)).height(5.dp).clip(RoundedCornerShape(50)).background(Lima))
                }
                Text(dinero(c.total, moneda), fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.padding(start = 10.dp))
                Text("${if (total > 0) Math.round(c.total / total * 100) else 0} %", color = t.tenue, fontSize = 12.sp, textAlign = TextAlign.End, modifier = Modifier.width(46.dp))
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
            Panel(Modifier.toque(habilitado = !vm.ocupado) { vm.descargarInforme(rango.first, rango.second) { alPdf(it, "DUOLAB-${rango.first}-a-${rango.second}.pdf") } }) {
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
                    Row(Modifier.fillMaxWidth().toque { vm.captura = lista.toMutableList().also { it[i] = m.copy(elegido = !m.elegido) } }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
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
