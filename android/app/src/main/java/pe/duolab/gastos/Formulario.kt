package pe.duolab.gastos

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** Qué se está editando: un movimiento nuevo (con su tipo y, si se eligió, el día) o uno existente. */
data class Edicion(val movimiento: Movimiento?, val tipo: String = "gasto", val fecha: LocalDate? = null)

private val REPETIR = listOf(
    "no" to "No repetir", "dia" to "Cada día", "semana" to "Cada semana", "quincena" to "Cada 2 semanas", "mes" to "Cada mes",
    "bimestre" to "Cada 2 meses", "trimestre" to "Cada 3 meses", "semestre" to "Cada 6 meses", "anio" to "Cada año",
)
private val RECORDAR = listOf(
    "" to "Según mi ajuste", "-1" to "No recordar este pago", "0" to "Solo el mismo día", "1" to "1 día antes",
    "2" to "2 días antes", "3" to "3 días antes", "5" to "5 días antes", "7" to "1 semana antes",
)

/** Formulario de movimiento: los mismos campos y el mismo orden que la ventana «Nuevo movimiento» de la web. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FormularioMovimiento(vm: AppVM, edicion: Edicion, alCerrar: () -> Unit) {
    val t = LocalTokens.current
    val inicial = remember(edicion) { edicion.movimiento?.let(Borrador::de) ?: Borrador(tipo = edicion.tipo, fecha = edicion.fecha ?: LocalDate.now()) }
    var b by remember(edicion) { mutableStateOf(inicial) }
    var eligiendoFecha by remember { mutableStateOf(false) }
    var confirmarBorrar by remember { mutableStateOf(false) }
    val esGasto = b.tipo == "gasto"
    val listo = b.descripcion.isNotBlank() && (b.monto.replace(",", ".").toDoubleOrNull() ?: 0.0) > 0
    val sugerencias = remember(vm.libro, vm.datos, b.tipo) {
        val usadas = vm.datos?.actual.orEmpty().filter { it.tipo == b.tipo }.groupingBy { it.categoria }.eachCount().entries.sortedByDescending { it.value }.map { it.key }
        (vm.libro?.categorias.orEmpty().filter { it.tipo == null || it.tipo == b.tipo }.map { it.nombre } + usadas).distinctBy { it.lowercase() }.take(10)
    }

    ModalBottomSheet(onDismissRequest = alCerrar, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = t.sup, dragHandle = null) {
        Column(
            Modifier.fillMaxWidth().statusBarsPadding().padding(top = 8.dp).verticalScroll(rememberScrollState()).padding(20.dp).imePadding().navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(if (edicion.movimiento == null) "Nuevo movimiento" else "Editar movimiento", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
            // Gasto / Ingreso: dos píldoras, la elegida en lima con borde oscuro (como la web).
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(t.elev).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf("gasto" to "Gasto", "ingreso" to "Ingreso").forEach { (v, n) ->
                    val activo = b.tipo == v
                    Box(
                        Modifier.weight(1f).height(44.dp).toque(escala = 0.97f) { b = b.copy(tipo = v) }.clip(RoundedCornerShape(50))
                            .background(if (activo) Lima else t.sup).border(if (activo) 2.dp else 1.dp, if (activo) SobreLima else t.linea, RoundedCornerShape(50)),
                        contentAlignment = Alignment.Center,
                    ) { Text(n, fontWeight = FontWeight.SemiBold, color = if (activo) SobreLima else t.tinta) }
                }
            }
            Campo("Descripción", b.descripcion, { b = b.copy(descripcion = it.take(120)) })
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Campo("Monto", b.monto, { v -> b = b.copy(monto = v.filter { it.isDigit() || it == '.' || it == ',' }.take(12)) }, Modifier.weight(1f), teclado = KeyboardType.Decimal)
                Column(Modifier.weight(1f)) {
                    Text("Fecha", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
                    Row(
                        Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(14.dp)).background(t.elev).border(1.dp, t.linea, RoundedCornerShape(14.dp))
                            .toque(escala = 0.99f) { eligiendoFecha = true }.padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(b.fecha.format(DateTimeFormatter.ofPattern("dd/MM/yyyy")), modifier = Modifier.weight(1f))
                        Icon(Iconos.calendario, null, modifier = Modifier.size(18.dp))
                    }
                }
            }
            Column {
                Campo("Categoría", b.categoria, { b = b.copy(categoria = it.take(40)) }, pista = "General")
                if (sugerencias.isNotEmpty()) Row(Modifier.padding(top = 8.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    sugerencias.forEach { c ->
                        val activo = b.categoria.equals(c, true)
                        Text(c, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (activo) SobreLima else t.tinta,
                            modifier = Modifier.toque { b = b.copy(categoria = c) }.clip(RoundedCornerShape(50)).background(if (activo) Lima else t.elev).padding(horizontal = 12.dp, vertical = 7.dp))
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("Medio de pago", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
                    Selector(b.medio, listOf("" to "Sin indicar") + MEDIOS.map { (k, n) -> k to (if (k == "transferencia") "Transferencia o depósito" else n) }) { b = b.copy(medio = it) }
                }
                Campo("Banco o entidad", b.entidad, { b = b.copy(entidad = it.take(40)) }, Modifier.weight(1f), pista = "BCP, Interbank…")
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.toque(escala = 0.99f) { b = b.copy(pagado = !b.pagado) }) {
                Checkbox(b.pagado, { b = b.copy(pagado = it) }, colors = CheckboxDefaults.colors(checkedColor = Lima, checkmarkColor = SobreLima))
                Text(if (esGasto) "Ya está pagado" else "Ya lo recibí", fontWeight = FontWeight.Medium)
            }
            if (!b.pagado) Column {
                Text("Recordarme por WhatsApp", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
                Selector(b.recordar, RECORDAR) { b = b.copy(recordar = it) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text("Repetir", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
                    Selector(b.repetir, REPETIR) { b = b.copy(repetir = it) }
                }
                if (b.repetir != "no") Campo("Cuántas veces más", b.veces, { v -> b = b.copy(veces = v.filter(Char::isDigit).take(3)) }, Modifier.weight(1f), teclado = KeyboardType.Number)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                if (edicion.movimiento != null) {
                    Text("Eliminar", color = Color(0xFFD92D20), fontWeight = FontWeight.Bold, modifier = Modifier.toque { confirmarBorrar = true }.padding(horizontal = 8.dp, vertical = 12.dp))
                }
                BotonSuave("Cancelar", Modifier.weight(1f).height(52.dp), alTocar = alCerrar)
                Box(Modifier.weight(1f)) { BotonLima(if (vm.ocupado) "Guardando…" else "Guardar", habilitado = listo && !vm.ocupado) { vm.guardar(b, edicion.movimiento?.id, alCerrar) } }
            }
        }
    }

    if (eligiendoFecha) {
        val estadoFecha = rememberDatePickerState(initialSelectedDateMillis = b.fecha.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { eligiendoFecha = false },
            confirmButton = {
                TextButton(onClick = {
                    estadoFecha.selectedDateMillis?.let { b = b.copy(fecha = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                    eligiendoFecha = false
                }) { Text("Listo") }
            },
            dismissButton = { TextButton(onClick = { eligiendoFecha = false }) { Text("Cancelar") } },
        ) { DatePicker(state = estadoFecha) }
    }

    if (confirmarBorrar && edicion.movimiento != null) {
        val m = edicion.movimiento
        AlertDialog(
            onDismissRequest = { confirmarBorrar = false },
            title = { Text("¿Eliminar este movimiento?") },
            text = { Text("${m.descripcion} · ${dinero(m.monto, vm.moneda)}. No se puede deshacer.") },
            confirmButton = { TextButton(onClick = { confirmarBorrar = false; vm.eliminar(m.id, alCerrar) }) { Text("Eliminar", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { confirmarBorrar = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
fun chipLima() = FilterChipDefaults.filterChipColors(selectedContainerColor = Lima, selectedLabelColor = SobreLima)
