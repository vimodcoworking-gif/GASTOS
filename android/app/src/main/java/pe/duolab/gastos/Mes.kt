package pe.duolab.gastos

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.YearMonth

/** Secciones de la vista Mes, como los segmentos de la web. */
enum class SeccionMes(val titulo: String) { CALENDARIO("Calendario"), PENDIENTES("Pendientes"), MOVIMIENTOS("Movimientos"), GRAFICAS("Gráficas") }

private val TINTA_HEROE = Color(0xFFF3F6EE)

// ---------- piezas de la web ----------

@Composable
fun IconoCaja(icono: ImageVector, fondo: Color, tinta: Color, lado: Int = 34, radio: Int = 12) {
    Box(Modifier.size(lado.dp).clip(RoundedCornerShape(radio.dp)).background(fondo), contentAlignment = Alignment.Center) {
        Icon(icono, null, tint = tinta, modifier = Modifier.size((lado * 0.55f).dp))
    }
}

@Composable
private fun BotonCirculo(icono: ImageVector, descripcion: String, alTocar: () -> Unit) {
    Box(
        Modifier.size(40.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.08f)).border(1.dp, Color.White.copy(alpha = 0.08f), CircleShape).clickable(onClick = alTocar),
        contentAlignment = Alignment.Center,
    ) { Icon(icono, descripcion, tint = TINTA_HEROE, modifier = Modifier.size(18.dp)) }
}

/** Panel blanco (o oscuro) redondeado, como .panel de la web. */
@Composable
fun Panel(modifier: Modifier = Modifier, relleno: Int = 16, contenido: @Composable ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(t.sup).padding(relleno.dp), content = contenido)
}

/** Chip de medio de pago con el color de la web (Yape morado, Plin celeste, tarjeta oscura, efectivo verde…). */
@Composable
fun ChipMedio(m: Movimiento) {
    val medio = m.medio ?: if (m.entidad != null) "otro" else return
    val (fondo, tinta) = when (medio) {
        "yape" -> Color(0xFF742284) to Color.White
        "plin" -> Color(0xFF00B4E6) to Color.White
        "tarjeta" -> Color(0xFF2E3A46) to Color.White
        "transferencia" -> Color(0xFF1E5AA8) to Color.White
        "efectivo" -> Color(0xFF2E7D32) to Color.White
        else -> Color(0xFF6B7280) to Color.White
    }
    val texto = if (m.entidad != null && medio in listOf("tarjeta", "transferencia", "otro")) m.entidad else nombreMedio(medio) ?: m.entidad.orEmpty()
    Text(texto, color = tinta, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(fondo).padding(horizontal = 8.dp, vertical = 2.dp))
}

/** Fila de movimiento de la web: descripción, fecha · categoría, chip del medio, estado, monto y ✓. */
@Composable
fun FilaWeb(m: Movimiento, moneda: String, alTocar: (() -> Unit)?, alPagar: (() -> Unit)?) {
    val t = LocalTokens.current
    val hoy = LocalDate.now()
    Row(
        Modifier.fillMaxWidth().then(if (alTocar != null) Modifier.clickable(onClick = alTocar) else Modifier).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(m.descripcion + if (m.desdeCorreo) "  ✉" else "", fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 3.dp)) {
                Text("${fechaCorta(m.fecha)} · ${m.categoria}", color = t.tenue, fontSize = 12.sp, maxLines = 1)
                ChipMedio(m)
            }
            if (!m.pagado) {
                val vencido = m.fecha.isBefore(hoy)
                Text(
                    if (vencido) (if (m.esGasto) "VENCIDO" else "ATRASADO") else if (m.esGasto) "POR PAGAR" else "POR COBRAR",
                    color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier.padding(top = 4.dp).clip(RoundedCornerShape(50)).background(if (vencido) Color(0xFFD32F2F) else Naranja).padding(horizontal = 8.dp, vertical = 2.dp),
                )
            } else {
                Text("Pagado", color = t.tenue, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp).clip(RoundedCornerShape(50)).background(t.elev).padding(horizontal = 8.dp, vertical = 2.dp))
            }
        }
        Text((if (m.esGasto) "-" else "+") + dinero(m.monto, moneda), fontWeight = FontWeight.Bold, color = if (m.esGasto) t.tinta else Color(0xFF3E8E2F), fontSize = 15.sp)
        if (alPagar != null && !m.pagado) {
            Spacer(Modifier.width(10.dp))
            Box(Modifier.size(42.dp).clip(CircleShape).background(Lima).clickable(onClick = alPagar), contentAlignment = Alignment.Center) {
                Icon(Iconos.check, if (m.esGasto) "Pagar" else "Cobrar", tint = SobreLima, modifier = Modifier.size(20.dp))
            }
        }
    }
}

// ---------- vista Mes ----------

@Composable
fun VistaMes(vm: AppVM, seccion: SeccionMes, alSeccion: (SeccionMes) -> Unit, alEditar: (Edicion) -> Unit, alCaptura: () -> Unit, alInforme: () -> Unit) {
    val datos = vm.datos
    val actual = datos?.actual.orEmpty()
    val t = Totales.de(actual)
    val editar = vm.libro?.puedeEditar == true
    var dia by rememberSaveable { mutableStateOf<String?>(null) }
    var filtro by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(vm.mes) { dia = null }

    val pendientesVista = (if (vm.mes == YearMonth.now()) datos?.pendientes else actual.filter { !it.pagado }).orEmpty()
    val diseno = disenoEfectivo(vm.diseno, disenoRecomendado(actual, pendientesVista))
    val tenue = LocalTokens.current.tenue
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val heroe: LazyListScope.() -> Unit = { item { Heroe(vm, actual, t, editar, alEditar, alCaptura, alInforme, sinGrafica = diseno == "simple") } }
        val tarjetas: LazyListScope.() -> Unit = { item { TarjetasMes(vm, actual, t) { alSeccion(SeccionMes.PENDIENTES) } } }
        val tira: LazyListScope.() -> Unit = { item { TiraProximo(vm) } }
        val pestanas: LazyListScope.() -> Unit = {
            item { Segmentos(seccion, pendientesVista.size, actual.size, alSeccion) }
            if (datos == null) {
                item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Lima) } }
            } else when (seccion) {
                SeccionMes.CALENDARIO -> calendario(vm, actual, dia, { dia = it }, filtro, { filtro = it }, editar, alEditar)
                SeccionMes.PENDIENTES -> pendientes(vm, editar, alEditar)
                SeccionMes.MOVIMIENTOS -> movimientos(vm, actual, filtro, { filtro = it }, editar, alEditar)
                SeccionMes.GRAFICAS -> item { Graficas(vm, actual) }
            }
        }
        // Mismo orden que los diseños de inicio de la web.
        when (diseno) {
            "resumen" -> { tarjetas(); heroe(); pestanas(); tira() }
            "pagos" -> {
                tarjetas()
                item {
                    Panel {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Lo que falta pagar o cobrar", fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                            Text(if (pendientesVista.isEmpty()) "todo al día" else "${pendientesVista.size} pendientes", color = tenue, fontSize = 12.sp)
                        }
                        if (pendientesVista.isEmpty()) Text("¡Todo al día! No hay nada pendiente.", color = tenue, modifier = Modifier.padding(vertical = 12.dp))
                        pendientesVista.take(6).forEach { m -> FilaWeb(m, vm.moneda, { alEditar(Edicion(m)) }, if (editar) ({ vm.marcarPagado(m) }) else null) }
                    }
                }
                heroe(); tira(); pestanas()
            }
            "simple" -> {
                heroe(); tarjetas()
                item {
                    Panel {
                        Text("Últimos movimientos", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        val ultimos = actual.sortedByDescending { it.fecha }.take(8)
                        if (ultimos.isEmpty()) Text("Aún no hay movimientos este mes.", color = tenue, modifier = Modifier.padding(vertical = 12.dp))
                        ultimos.forEach { m -> FilaWeb(m, vm.moneda, { alEditar(Edicion(m)) }, null) }
                    }
                }
                pestanas(); tira()
            }
            else -> { heroe(); tarjetas(); tira(); pestanas() }
        }
    }
}

@Composable
private fun Heroe(vm: AppVM, actual: List<Movimiento>, t: Totales, editar: Boolean, alEditar: (Edicion) -> Unit, alCaptura: () -> Unit, alInforme: () -> Unit, sinGrafica: Boolean = false) {
    val esMesActual = vm.mes == YearMonth.now()
    val fin = if (esMesActual) LocalDate.now() else vm.mes.atEndOfMonth()
    val semana = (6 downTo 0).map { fin.minusDays(it.toLong()) }.map { d -> d to actual.filter { it.esGasto && it.fecha == d }.sumOf { it.monto } }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(30.dp))
            .background(Brush.verticalGradient(listOf(Color(0xFF262B21), Color(0xFF13160F))))
            .drawBehind {
                drawCircle(Brush.radialGradient(listOf(Lima.copy(alpha = 0.16f), Color.Transparent), center = Offset(size.width * 0.85f, size.height), radius = size.width * 0.8f), radius = size.width * 0.8f, center = Offset(size.width * 0.85f, size.height))
            }
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            BotonCirculo(Iconos.flechaIzq, "Mes anterior") { vm.cambiarMes(-1) }
            Row(
                Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.05f)).border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(50)),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
            ) {
                Icon(Iconos.calendario, null, tint = Lima, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(7.dp))
                Text(nombreMesCorto(vm.mes).take(3) + " " + vm.mes.year, color = TINTA_HEROE, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
            BotonCirculo(Iconos.flechaDer, "Mes siguiente") { vm.cambiarMes(1) }
            if (!esMesActual) {
                Text("Hoy", color = TINTA_HEROE, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.08f)).clickable { vm.irAHoy() }.padding(horizontal = 12.dp, vertical = 9.dp))
            }
            BotonCirculo(Iconos.descargar, "Descargar PDF del mes", alInforme)
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 16.dp)) {
            Box(Modifier.size(54.dp).clip(RoundedCornerShape(18.dp)).background(Lima.copy(alpha = 0.13f)).border(1.dp, Lima.copy(alpha = 0.28f), RoundedCornerShape(18.dp)), contentAlignment = Alignment.Center) {
                Icon(Iconos.billetera, null, tint = Lima, modifier = Modifier.size(26.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column {
                Text(dinero(t.balance, vm.moneda), color = TINTA_HEROE, fontWeight = FontWeight.ExtraBold, fontSize = 32.sp, maxLines = 1)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (t.balance < 0) Iconos.salida else Iconos.entrada, null, tint = if (t.balance < 0) Color(0xFFFF6B5B) else Lima, modifier = Modifier.size(14.dp))
                    Text(if (t.balance < 0) " Balance del mes: gastas más de lo que entra" else " Balance del mes: vas en positivo", color = Color(0xFFA7AE9B), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        if (!sinGrafica) GraficaHeroe(semana, Modifier.padding(top = 16.dp))
        if (editar) {
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PildoraHeroe("Gasto", Iconos.salida, lima = true, Modifier.weight(1f)) { alEditar(Edicion(null, "gasto")) }
                PildoraHeroe("Ingreso", Iconos.entrada, lima = false, Modifier.weight(1f)) { alEditar(Edicion(null, "ingreso")) }
            }
            Spacer(Modifier.height(10.dp))
            Row(
                Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(50))
                    .drawBehind {
                        drawRoundRect(Color.White.copy(alpha = 0.18f), style = Stroke(width = 2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))), cornerRadius = CornerRadius(size.height / 2))
                    }
                    .clickable(onClick = alCaptura),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
            ) {
                Box(Modifier.size(26.dp).border(1.5.dp, Color(0xFFDFE5D6), CircleShape), contentAlignment = Alignment.Center) { Icon(Iconos.imagen, null, tint = Color(0xFFDFE5D6), modifier = Modifier.size(14.dp)) }
                Spacer(Modifier.width(10.dp))
                Text(if (vm.leyendoCaptura) "Leyendo la captura…" else "Subir captura de Yape o banco", color = Color(0xFFDFE5D6), fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun PildoraHeroe(texto: String, icono: ImageVector, lima: Boolean, modifier: Modifier, alTocar: () -> Unit) {
    val tinta = if (lima) SobreLima else TINTA_HEROE
    Row(
        modifier.height(54.dp).clip(RoundedCornerShape(50))
            .background(if (lima) Lima else Color.White.copy(alpha = 0.05f))
            .then(if (lima) Modifier else Modifier.border(1.5.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(50)))
            .clickable(onClick = alTocar),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) {
        Box(Modifier.size(28.dp).border(1.5.dp, tinta, CircleShape), contentAlignment = Alignment.Center) { Icon(icono, null, tint = tinta, modifier = Modifier.size(15.dp)) }
        Spacer(Modifier.width(10.dp))
        Text(texto, color = tinta, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
    }
}

/** Barras de los últimos 7 días con la línea lima y el punto brillante en el día de más gasto (como la web). */
@Composable
private fun GraficaHeroe(dias: List<Pair<LocalDate, Double>>, modifier: Modifier = Modifier) {
    val maximo = (dias.maxOfOrNull { it.second } ?: 0.0).coerceAtLeast(1.0)
    val iMax = dias.indexOfFirst { it.second == maximo && it.second > 0 }
    val hoy = LocalDate.now()
    Column(modifier) {
        Canvas(Modifier.fillMaxWidth().height(120.dp)) {
            val ancho = size.width / dias.size
            val barra = ancho * 0.56f
            val puntos = dias.mapIndexed { i, (_, total) ->
                val alto = if (total > 0) (total / maximo).toFloat() * size.height * 0.92f else 4f
                Offset(i * ancho + ancho / 2, size.height - alto)
            }
            dias.forEachIndexed { i, (fecha, total) ->
                val alto = (size.height - puntos[i].y).coerceAtLeast(4f)
                val destacado = i == iMax || fecha == hoy
                drawRoundRect(
                    brush = if (i == iMax) Brush.verticalGradient(listOf(Color(0xFFE4FF7A), Lima.copy(alpha = 0.55f))) else Brush.verticalGradient(listOf(if (destacado) Lima else Color.White.copy(alpha = 0.13f), if (destacado) Lima else Color.White.copy(alpha = 0.13f))),
                    topLeft = Offset(i * ancho + (ancho - barra) / 2, size.height - alto),
                    size = Size(barra, alto),
                    cornerRadius = CornerRadius(12f, 12f),
                )
            }
            // Curva suave por la parte de arriba de las barras.
            val camino = Path().apply {
                moveTo(puntos.first().x, puntos.first().y)
                for (i in 1 until puntos.size) {
                    val a = puntos[i - 1]; val b = puntos[i]; val mx = (a.x + b.x) / 2
                    cubicTo(mx, a.y, mx, b.y, b.x, b.y)
                }
            }
            drawPath(camino, Lima.copy(alpha = 0.22f), style = Stroke(width = 14f, cap = StrokeCap.Round))
            drawPath(camino, Lima, style = Stroke(width = 5f, cap = StrokeCap.Round))
            if (iMax >= 0) {
                drawCircle(Lima.copy(alpha = 0.3f), radius = 18f, center = puntos[iMax])
                drawCircle(Color(0xFFE4FF7A), radius = 10f, center = puntos[iMax])
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
            dias.forEach { (fecha, _) ->
                Text(inicialDia(fecha), color = if (fecha == hoy) TINTA_HEROE else Color(0xFFA7AE9B), fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun TarjetaWeb(titulo: String, valor: String, nota: String, icono: ImageVector, fondoIcono: Color, tintaIcono: Color, colorValor: Color, modifier: Modifier, progreso: Float? = null, colorBarra: Color = Lima) {
    val t = LocalTokens.current
    Column(modifier.clip(RoundedCornerShape(24.dp)).background(t.sup).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconoCaja(icono, fondoIcono, tintaIcono, 30, 10)
            Spacer(Modifier.width(8.dp))
            Text(titulo, color = t.tinta, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(10.dp))
        Text(valor, color = colorValor, fontWeight = FontWeight.ExtraBold, fontSize = 19.sp, maxLines = 1)
        Text(nota, color = t.tenue, fontSize = 11.sp, maxLines = 2, lineHeight = 14.sp)
        if (progreso != null) {
            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50)).background(t.linea)) {
                Box(Modifier.fillMaxWidth(progreso.coerceIn(0f, 1f)).height(6.dp).clip(RoundedCornerShape(50)).background(colorBarra))
            }
        }
    }
}

@Composable
private fun TarjetasMes(vm: AppVM, actual: List<Movimiento>, t: Totales, alPendientes: () -> Unit) {
    val m = vm.moneda
    val pendientesGasto = actual.count { it.esGasto && !it.pagado }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TarjetaWeb("Ingresos", dinero(t.ingresos, m), if (t.ingresosPendientes > 0) "${dinero(t.ingresos - t.ingresosPendientes, m)} recibido · ${dinero(t.ingresosPendientes, m)} por recibir" else "Todo recibido",
                Iconos.entrada, Color(0xFFE3F1DA), Color(0xFF3E8E2F), LocalTokens.current.tinta, Modifier.weight(1f), if (t.ingresos > 0) ((t.ingresos - t.ingresosPendientes) / t.ingresos).toFloat() else 0f, Color(0xFF55A630))
            TarjetaWeb("Gastos", dinero(t.gastos, m), "${dinero(t.gastos - t.gastosPendientes, m)} pagado · ${if (t.gastos > 0) ((t.gastos - t.gastosPendientes) / t.gastos * 100).toInt() else 0} %",
                Iconos.salida, Color(0xFFFDE2E2), Color(0xFFE5484D), LocalTokens.current.tinta, Modifier.weight(1f), if (t.gastos > 0) ((t.gastos - t.gastosPendientes) / t.gastos).toFloat() else 0f, Color(0xFFF04A50))
        }
        // «Falta por pagar»: tarjeta oscura a todo el ancho con la insignia del número de pagos.
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.horizontalGradient(listOf(Color(0xFF1F231A), Color(0xFF2B3024)))).clickable(onClick = alPendientes).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconoCaja(Iconos.reloj, Lima.copy(alpha = 0.13f), Lima, 30, 10)
                    Spacer(Modifier.width(8.dp))
                    Text("Falta por pagar", color = Color(0xFFDFE5D6), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(10.dp))
                Text(dinero(t.gastosPendientes, m), color = TINTA_HEROE, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                Text(if (pendientesGasto > 0) "$pendientesGasto pagos pendientes este mes" else "Nada pendiente este mes", color = Color(0xFFA7AE9B), fontSize = 11.sp)
            }
            if (pendientesGasto > 0) {
                Box(Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(Color(0xFF3A2A22)).border(1.dp, Color(0xFFFF8A65).copy(alpha = 0.6f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
                    Text("$pendientesGasto", color = Color(0xFFFF8A65), fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                }
            } else {
                // Nada pendiente: el check en un cuadro lima, como la web.
                Box(Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(Lima.copy(alpha = 0.12f)).border(1.dp, Lima.copy(alpha = 0.6f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
                    Box(Modifier.size(28.dp).border(1.5.dp, Color(0xFFDFE5D6), CircleShape), contentAlignment = Alignment.Center) { Icon(Iconos.check, null, tint = Color(0xFFDFE5D6), modifier = Modifier.size(16.dp)) }
                }
            }
        }
    }
}

@Composable
private fun TiraProximo(vm: AppVM) {
    val t = LocalTokens.current
    val p = Totales.de(vm.datos?.proximo.orEmpty())
    val siguiente = vm.mes.plusMonths(1)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(t.sup).clickable { vm.cambiarMes(1) }.padding(horizontal = 14.dp, vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconoCaja(Iconos.calendario, t.elev, t.tinta, 34, 11)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("Próximo mes", color = t.tenue, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                Text(nombreMesCorto(siguiente), fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
            Box(Modifier.size(32.dp).clip(CircleShape).background(t.elev), contentAlignment = Alignment.Center) { Icon(Iconos.flechaDer, null, modifier = Modifier.size(16.dp)) }
        }
        Row(Modifier.padding(top = 10.dp, start = 44.dp)) {
            listOf("Ingresos" to p.ingresos, "Gastos" to p.gastos, "Balance" to p.balance).forEach { (titulo, valor) ->
                Column(Modifier.weight(1f)) {
                    Text(titulo, color = t.tenue, fontSize = 11.sp)
                    Text(dinero(valor, vm.moneda), fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, color = if (titulo == "Balance" && valor < 0) Color(0xFFE5484D) else t.tinta)
                }
            }
        }
    }
}

@Composable
private fun Segmentos(actual: SeccionMes, pendientes: Int, movimientos: Int, alElegir: (SeccionMes) -> Unit) {
    val t = LocalTokens.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SeccionMes.entries.chunked(2).forEach { fila ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                fila.forEach { s ->
                    val activo = s == actual
                    Row(
                        Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(16.dp)).background(if (activo) Lima else t.sup).clickable { alElegir(s) },
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
                    ) {
                        Text(s.titulo, fontWeight = if (activo) FontWeight.Bold else FontWeight.SemiBold, color = if (activo) SobreLima else t.tinta, fontSize = 14.sp)
                        val n = if (s == SeccionMes.PENDIENTES) pendientes else if (s == SeccionMes.MOVIMIENTOS) movimientos else 0
                        if (n > 0) {
                            Spacer(Modifier.width(6.dp))
                            Text("$n", color = if (s == SeccionMes.PENDIENTES) Color.White else t.tinta, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                                modifier = Modifier.clip(RoundedCornerShape(50)).background(if (s == SeccionMes.PENDIENTES) Color(0xFFE5484D) else t.elev).padding(horizontal = 7.dp, vertical = 1.dp))
                        }
                    }
                }
            }
        }
    }
}

/** Filtro por medio de pago (Todos, Yape, Tarjeta…), con cuántos hay de cada uno. */
@Composable
private fun FiltroMedios(lista: List<Movimiento>, filtro: String, alCambiar: (String) -> Unit) {
    val opciones = listOf("" to "Todos") + MEDIOS.filter { (k, _) -> lista.any { it.medio == k } } + (if (lista.any { it.medio == null }) listOf("sin" to "Sin indicar") else emptyList())
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        opciones.forEach { (clave, nombre) ->
            val n = if (clave == "") lista.size else if (clave == "sin") lista.count { it.medio == null } else lista.count { it.medio == clave }
            FilterChip(selected = filtro == clave, onClick = { alCambiar(clave) }, label = { Text("$nombre  $n", fontSize = 12.sp) }, colors = chipLima(), shape = RoundedCornerShape(50))
        }
    }
}

private fun pasaFiltro(m: Movimiento, filtro: String) = filtro == "" || (filtro == "sin" && m.medio == null) || m.medio == filtro

private fun LazyListScope.calendario(
    vm: AppVM, actual: List<Movimiento>, dia: String?, alDia: (String?) -> Unit, filtro: String, alFiltro: (String) -> Unit, editar: Boolean, alEditar: (Edicion) -> Unit,
) {
    item { Panel { Calendario(vm.mes, actual, dia, alDia) } }
    item {
        Panel {
            val delDia = if (dia != null) actual.filter { it.fecha.toString() == dia } else emptyList()
            if (dia != null) {
                val fecha = LocalDate.parse(dia)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(fechaLarga(fecha), fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                    Text("Ver todo ${nombreMesCorto(vm.mes).lowercase(ES)}", fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(LocalTokens.current.elev).clickable { alDia(null) }.padding(horizontal = 12.dp, vertical = 8.dp))
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DatoDia("Gastaste", dinero(delDia.filter { it.esGasto }.sumOf { it.monto }, vm.moneda), Color(0xFFE5484D), Modifier.weight(1f))
                    DatoDia("Recibiste", dinero(delDia.filter { !it.esGasto }.sumOf { it.monto }, vm.moneda), Color(0xFF3E8E2F), Modifier.weight(1f))
                    DatoDia("Movimientos", "${delDia.size}", LocalTokens.current.tinta, Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
                FiltroMedios(delDia, filtro, alFiltro)
                val lista = delDia.filter { pasaFiltro(it, filtro) }
                if (lista.isEmpty()) Text("No hay movimientos este día con ese filtro.", color = LocalTokens.current.tenue, modifier = Modifier.padding(vertical = 14.dp))
                lista.forEach { m -> FilaWeb(m, vm.moneda, { alEditar(Edicion(m)) }, if (editar) ({ vm.marcarPagado(m) }) else null) }
                if (editar) {
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { alEditar(Edicion(null, "gasto", fecha)) }, modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(50),
                        colors = ButtonDefaults.buttonColors(containerColor = Lima, contentColor = SobreLima)) { Text("+ Añadir en este día", fontWeight = FontWeight.Bold) }
                }
            } else {
                val sinPagar = actual.filter { !it.pagado }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Pagos de ${nombreMesCorto(vm.mes).lowercase(ES)}", fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                    Text(if (sinPagar.isNotEmpty()) "${sinPagar.size} pendientes · ${dinero(Totales.de(actual).gastosPendientes, vm.moneda)} por pagar" else if (actual.isNotEmpty()) "todo al día" else "",
                        color = LocalTokens.current.tenue, fontSize = 11.sp)
                }
                Spacer(Modifier.height(10.dp))
                FiltroMedios(actual, filtro, alFiltro)
                val lista = (sinPagar + actual.filter { it.pagado }).filter { pasaFiltro(it, filtro) }
                if (lista.isEmpty()) Text("No hay movimientos este mes con ese filtro.", color = LocalTokens.current.tenue, modifier = Modifier.padding(vertical = 14.dp))
                lista.forEach { m -> FilaWeb(m, vm.moneda, { alEditar(Edicion(m)) }, if (editar) ({ vm.marcarPagado(m) }) else null) }
                Text("Toca un día del calendario para ver solo los de esa fecha.", color = LocalTokens.current.tenue, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
private fun DatoDia(titulo: String, valor: String, color: Color, modifier: Modifier) {
    val t = LocalTokens.current
    Column(modifier.clip(RoundedCornerShape(14.dp)).background(t.elev).padding(10.dp)) {
        Text(titulo, color = t.tenue, fontSize = 11.sp)
        Text(valor, color = color, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
    }
}

/** Rejilla del mes: lo gastado cada día en pequeño y puntos (rojo = pago pendiente, gris = otros, lima = correo). */
@Composable
private fun Calendario(mes: YearMonth, actual: List<Movimiento>, dia: String?, alDia: (String?) -> Unit) {
    val t = LocalTokens.current
    val hoy = LocalDate.now()
    val huecos = mes.atDay(1).dayOfWeek.value - 1
    val celdas = List(huecos) { null } + (1..mes.lengthOfMonth()).map { mes.atDay(it) }
    Row(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
        listOf("L", "M", "X", "J", "V", "S", "D").forEach { Text(it, color = t.tenue, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f)) }
    }
    celdas.chunked(7).forEach { semana ->
        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            semana.forEach { fecha ->
                if (fecha == null) { Spacer(Modifier.weight(1f)); return@forEach }
                val delDia = actual.filter { it.fecha == fecha }
                val gasto = delDia.filter { it.esGasto }.sumOf { it.monto }
                val elegido = fecha.toString() == dia
                Column(
                    Modifier.weight(1f).height(58.dp).clip(RoundedCornerShape(14.dp))
                        .background(if (elegido) Lima else t.elev)
                        .then(if (fecha == hoy) Modifier.border(1.5.dp, Lima, RoundedCornerShape(14.dp)) else Modifier)
                        .clickable { alDia(if (elegido) null else fecha.toString()) },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                ) {
                    Text("${fecha.dayOfMonth}", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = if (elegido) SobreLima else t.tinta)
                    if (gasto > 0) Text(montoCorto(gasto), fontSize = 9.sp, color = if (elegido) SobreLima else Color(0xFFE5484D), fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.padding(top = 2.dp)) {
                        if (delDia.any { it.esGasto && !it.pagado }) Box(Modifier.size(5.dp).clip(CircleShape).background(Color(0xFFE5484D)))
                        if (delDia.any { (it.pagado || !it.esGasto) && !it.desdeCorreo }) Box(Modifier.size(5.dp).clip(CircleShape).background(t.tenue))
                        if (delDia.any { it.desdeCorreo }) Box(Modifier.size(5.dp).clip(CircleShape).background(Color(0xFF7FA800)))
                    }
                }
            }
            repeat(7 - semana.size) { Spacer(Modifier.weight(1f)) }
        }
    }
}

/** 805 → «805», 1250 → «1.3k», como la web. */
private fun montoCorto(n: Double): String = if (n >= 1000) {
    val k = n / 1000
    (if (n >= 10000) "%.0f".format(k) else "%.1f".format(k)).replace(",", ".").removeSuffix(".0") + "k"
} else "%.0f".format(n)

private fun LazyListScope.pendientes(vm: AppVM, editar: Boolean, alEditar: (Edicion) -> Unit) {
    val esMesActual = vm.mes == YearMonth.now()
    val lista = if (esMesActual) vm.datos?.pendientes.orEmpty() else vm.datos?.actual.orEmpty().filter { !it.pagado }
    item {
        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Pagos y cobros pendientes", fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                Text(if (esMesActual) "vencidos y próximos 30 días" else "de ${nombreMes(vm.mes)}", color = LocalTokens.current.tenue, fontSize = 11.sp)
            }
            if (lista.isEmpty()) Text(if (esMesActual) "No hay nada pendiente. ¡Todo al día!" else "No hay nada pendiente en ${nombreMesCorto(vm.mes).lowercase(ES)}.", color = LocalTokens.current.tenue, modifier = Modifier.padding(vertical = 16.dp))
            lista.forEachIndexed { i, m ->
                if (i > 0) HorizontalDivider(color = LocalTokens.current.linea)
                FilaWeb(m, vm.moneda, { alEditar(Edicion(m)) }, if (editar) ({ vm.marcarPagado(m) }) else null)
            }
        }
    }
}

private fun LazyListScope.movimientos(vm: AppVM, actual: List<Movimiento>, filtro: String, alFiltro: (String) -> Unit, editar: Boolean, alEditar: (Edicion) -> Unit) {
    val porDia = actual.filter { pasaFiltro(it, filtro) }.groupBy { it.fecha }.toSortedMap(compareByDescending { it })
    item {
        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Movimientos del mes", fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                Text("del más reciente al más antiguo", color = LocalTokens.current.tenue, fontSize = 11.sp)
            }
            Spacer(Modifier.height(10.dp))
            FiltroMedios(actual, filtro, alFiltro)
            if (porDia.isEmpty()) Text("No hay movimientos este mes con ese filtro.", color = LocalTokens.current.tenue, modifier = Modifier.padding(vertical = 16.dp))
            porDia.forEach { (dia, lista) ->
                Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(fechaLarga(dia), fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    val ing = lista.filter { !it.esGasto }.sumOf { it.monto }
                    val gas = lista.filter { it.esGasto }.sumOf { it.monto }
                    if (ing > 0) Text("+${dinero(ing, vm.moneda)}  ", color = Color(0xFF3E8E2F), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    if (gas > 0) Text("-${dinero(gas, vm.moneda)}", color = LocalTokens.current.tenue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
                lista.forEach { m -> FilaWeb(m, vm.moneda, { alEditar(Edicion(m)) }, if (editar) ({ vm.marcarPagado(m) }) else null) }
            }
        }
    }
}

// ---------- gráficas ----------

@Composable
private fun Graficas(vm: AppVM, actual: List<Movimiento>) {
    val t = LocalTokens.current
    var tipo by rememberSaveable { mutableStateOf("gasto") }
    if (actual.isEmpty()) {
        Panel { Text("No hay movimientos este mes para mostrar gráficas.", color = t.tenue, modifier = Modifier.padding(vertical = 20.dp)) }
        return
    }
    val gastos = actual.filter { it.esGasto }
    val esActual = vm.mes == YearMonth.now()
    val dias = if (esActual) LocalDate.now().dayOfMonth else vm.mes.lengthOfMonth()
    val hechos = gastos.filter { !esActual || !it.fecha.isAfter(LocalDate.now()) }
    val mayor = gastos.maxByOrNull { it.monto }
    val porDia = hechos.groupBy { it.fecha }.maxByOrNull { (_, l) -> l.sumOf { it.monto } }
    val tot = Totales.de(actual)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Dato("Gasto promedio por día", dinero(hechos.sumOf { it.monto } / dias.coerceAtLeast(1), vm.moneda), if (esActual) "en los $dias días que van del mes" else "en $dias días", Modifier.weight(1f))
            Dato("Mayor gasto", mayor?.let { dinero(it.monto, vm.moneda) } ?: "—", mayor?.let { "${it.descripcion} · ${fechaCorta(it.fecha)}" } ?: "Sin gastos", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Dato("Día con más gasto", porDia?.let { fechaCorta(it.key) } ?: "—", porDia?.let { "${dinero(it.value.sumOf { m -> m.monto }, vm.moneda)} en ${it.value.size} movimiento${if (it.value.size == 1) "" else "s"}" } ?: "Sin gastos", Modifier.weight(1f))
            Dato("Ahorro del mes", dinero(tot.balance, vm.moneda), if (tot.ingresos > 0) (if (tot.balance >= 0) "${(tot.balance / tot.ingresos * 100).toInt()} % de lo que entró" else "Este mes sale más de lo que entra") else "Sin ingresos este mes", Modifier.weight(1f))
        }
        Panel {
            Text("Cómo va el mes", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text("ingresos y gastos acumulados día a día", color = t.tenue, fontSize = 11.sp)
            Acumulada(vm.mes, actual, Modifier.padding(top = 12.dp))
        }
        Panel {
            Text(if (tipo == "gasto") "Gastos por categoría" else "Ingresos por categoría", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Row(Modifier.padding(top = 8.dp)) {
                Row(Modifier.clip(RoundedCornerShape(50)).background(t.elev).padding(3.dp)) {
                    listOf("gasto" to "Gastos", "ingreso" to "Ingresos").forEach { (v, n) ->
                        Text(n, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (tipo == v) SobreLima else t.tinta,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(if (tipo == v) Lima else Color.Transparent).clickable { tipo = v }.padding(horizontal = 10.dp, vertical = 6.dp))
                    }
                }
            }
            val deTipo = actual.filter { it.tipo == tipo }
            BarrasHorizontales(deTipo.groupBy { it.categoria.ifBlank { "General" } }.mapValues { (_, l) -> l.sumOf { it.monto } }, vm.moneda, tipo, if (tipo == "gasto") "Sin gastos este mes." else "Sin ingresos este mes.")
        }
        Panel {
            Text(if (tipo == "gasto") "Gastos por medio de pago" else "Ingresos por medio", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            val deTipo = actual.filter { it.tipo == tipo }
            BarrasHorizontales(deTipo.groupBy { m -> m.medio?.let { listOfNotNull(nombreMedio(it), if (it in listOf("tarjeta", "transferencia")) m.entidad else null).joinToString(" · ") } ?: "Sin indicar" }.mapValues { (_, l) -> l.sumOf { it.monto } }, vm.moneda, tipo, "Sin datos este mes.")
        }
    }
}

@Composable
private fun Dato(titulo: String, valor: String, nota: String, modifier: Modifier) {
    val t = LocalTokens.current
    Column(modifier.clip(RoundedCornerShape(22.dp)).background(t.sup).padding(14.dp)) {
        Text(titulo, color = t.tenue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, lineHeight = 15.sp)
        Text(valor, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, maxLines = 1, modifier = Modifier.padding(top = 4.dp))
        Text(nota, color = t.tenue, fontSize = 11.sp, maxLines = 2, lineHeight = 14.sp)
    }
}

@Composable
private fun BarrasHorizontales(grupos: Map<String, Double>, moneda: String, tipo: String, vacio: String) {
    val t = LocalTokens.current
    val lista = grupos.entries.sortedByDescending { it.value }
    if (lista.isEmpty()) { Text(vacio, color = t.tenue, modifier = Modifier.padding(vertical = 14.dp)); return }
    val total = lista.sumOf { it.value }
    val maximo = lista.first().value.coerceAtLeast(1.0)
    lista.forEach { (nombre, valor) ->
        Column(Modifier.padding(top = 12.dp)) {
            Row {
                Text(nombre, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${dinero(valor, moneda)} · ${(valor / total * 100).toInt()} %", fontSize = 12.sp, color = t.tenue)
            }
            Box(Modifier.padding(top = 5.dp).fillMaxWidth().height(9.dp).clip(RoundedCornerShape(50)).background(t.elev)) {
                Box(Modifier.fillMaxWidth((valor / maximo).toFloat()).height(9.dp).clip(RoundedCornerShape(50)).background(if (tipo == "gasto") Color(0xFFF04A50) else Color(0xFF55A630)))
            }
        }
    }
}

/** Ingresos y gastos acumulados día a día (líneas verde y roja). */
@Composable
private fun Acumulada(mes: YearMonth, actual: List<Movimiento>, modifier: Modifier) {
    val t = LocalTokens.current
    val dias = mes.lengthOfMonth()
    val hasta = if (mes == YearMonth.now()) LocalDate.now().dayOfMonth else dias
    fun serie(tipo: String): List<Double> {
        var acum = 0.0
        return (1..hasta).map { d -> acum += actual.filter { it.tipo == tipo && it.fecha.dayOfMonth == d }.sumOf { it.monto }; acum }
    }
    val ing = serie("ingreso")
    val gas = serie("gasto")
    val maximo = (ing + gas).maxOrNull()?.coerceAtLeast(1.0) ?: 1.0
    Column(modifier) {
        Canvas(Modifier.fillMaxWidth().height(150.dp)) {
            for (k in 0..3) {
                val y = size.height * k / 3
                drawLine(t.linea, Offset(0f, y), Offset(size.width, y), strokeWidth = 2f)
            }
            fun trazar(s: List<Double>, color: Color) {
                if (s.isEmpty()) return
                val p = Path()
                s.forEachIndexed { i, v ->
                    val x = if (dias <= 1) 0f else size.width * i / (dias - 1)
                    val y = size.height - (v / maximo).toFloat() * size.height
                    if (i == 0) p.moveTo(x, y) else p.lineTo(x, y)
                }
                drawPath(p, color, style = Stroke(width = 5f, cap = StrokeCap.Round))
            }
            trazar(ing, Color(0xFF55A630))
            trazar(gas, Color(0xFFF04A50))
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Leyenda(Color(0xFF55A630), "Ingresos ${dinero(ing.lastOrNull() ?: 0.0, "PEN").removePrefix("S/ ")}")
            Leyenda(Color(0xFFF04A50), "Gastos ${dinero(gas.lastOrNull() ?: 0.0, "PEN").removePrefix("S/ ")}")
        }
    }
}

@Composable
private fun Leyenda(color: Color, texto: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(color))
        Text("  $texto", fontSize = 12.sp, color = LocalTokens.current.tenue)
    }
}


// ---------- diseños de inicio (los mismos de la web) ----------

data class Diseno(val id: String, val nombre: String, val texto: String)

val DISENOS = listOf(
    Diseno("auto", "Automático", "Se adapta solo a ti según tus movimientos y pendientes."),
    Diseno("clasico", "Clásico", "Tarjeta del mes con la gráfica y los totales al lado."),
    Diseno("resumen", "Resumen primero", "Ingresos, gastos, balance y pendientes de un vistazo, arriba."),
    Diseno("pagos", "Pagos primero", "Lo que falta pagar o cobrar arriba, para no olvidar nada."),
    Diseno("simple", "Sencillo", "Sin gráfica: balance, botones y tus últimos movimientos."),
)

/** El que mejor se adapta: pagos por hacer → pagos primero; muchos movimientos → resumen; pocos → sencillo. */
fun disenoRecomendado(actual: List<Movimiento>, pendientes: List<Movimiento>): String {
    val vencidos = pendientes.count { !it.fecha.isAfter(LocalDate.now()) }
    return when {
        pendientes.size >= 3 || vencidos >= 1 -> "pagos"
        actual.size >= 40 -> "resumen"
        actual.size < 10 -> "simple"
        else -> "clasico"
    }
}

fun disenoEfectivo(elegido: String, recomendado: String) = if (elegido == "auto" || DISENOS.none { it.id == elegido }) recomendado else elegido

@Composable
fun DialogoDiseno(vm: AppVM, alCerrar: () -> Unit) {
    val t = LocalTokens.current
    val actual = vm.datos?.actual.orEmpty()
    val pendientes = (if (vm.mes == YearMonth.now()) vm.datos?.pendientes else actual.filter { !it.pagado }).orEmpty()
    val recomendado = disenoRecomendado(actual, pendientes)
    val nombreRecomendado = DISENOS.first { it.id == recomendado }.nombre
    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Diseño de inicio", fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Elige cómo quieres ver tu pantalla de inicio. Puedes cambiarlo cuando quieras.", color = t.tenue, fontSize = 13.sp)
                DISENOS.forEach { d ->
                    val activo = vm.diseno == d.id
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (activo) Lima.copy(alpha = 0.25f) else t.elev)
                            .border(1.5.dp, if (activo) Lima else Color.Transparent, RoundedCornerShape(16.dp))
                            .clickable {
                                vm.elegirDiseno(d.id)
                                vm.aviso = if (d.id == "auto") "Diseño automático: ahora «$nombreRecomendado»" else "Diseño «${d.nombre}» aplicado"
                                alCerrar()
                            }
                            .padding(12.dp),
                    ) {
                        Text(d.nombre, fontWeight = FontWeight.Bold)
                        if (d.id == recomendado) {
                            Text("★ Recomendado para ti", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = SobreLima,
                                modifier = Modifier.padding(vertical = 3.dp).clip(RoundedCornerShape(50)).background(Lima).padding(horizontal = 8.dp, vertical = 1.dp))
                        }
                        if (d.id == "auto") Text("Ahora: $nombreRecomendado", fontSize = 11.sp, color = t.tenue)
                        Text(d.texto, color = t.tenue, fontSize = 12.sp)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = alCerrar) { Text("Cerrar") } },
    )
}
