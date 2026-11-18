package pe.duolab.gastos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Qué se está editando: un movimiento nuevo (con su tipo) o uno existente. */
data class Edicion(val movimiento: Movimiento?, val tipo: String = "gasto", val fecha: LocalDate? = null)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun FormularioMovimiento(vm: AppVM, edicion: Edicion, alCerrar: () -> Unit) {
    val inicial = remember(edicion) { edicion.movimiento?.let(Borrador::de) ?: Borrador(tipo = edicion.tipo, fecha = edicion.fecha ?: LocalDate.now()) }
    var b by remember(edicion) { mutableStateOf(inicial) }
    var eligiendoFecha by remember { mutableStateOf(false) }
    var confirmarBorrar by remember { mutableStateOf(false) }
    val estado = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val esGasto = b.tipo == "gasto"
    val montoValido = (b.monto.replace(",", ".").toDoubleOrNull() ?: 0.0) > 0
    val listo = b.descripcion.isNotBlank() && montoValido
    // Las categorías del libro y las que ya se usaron este mes para ese tipo, las más usadas primero.
    val categorias = remember(vm.libro, vm.datos, b.tipo) {
        val usadas = vm.datos?.actual.orEmpty().filter { it.tipo == b.tipo }.groupingBy { it.categoria }.eachCount().entries.sortedByDescending { it.value }.map { it.key }
        (listOf("General") + vm.libro?.categorias.orEmpty().filter { it.tipo == null || it.tipo == b.tipo }.map { it.nombre } + usadas).distinctBy { it.lowercase() }.take(12)
    }

    ModalBottomSheet(onDismissRequest = alCerrar, sheetState = estado) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).imePadding().navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(if (edicion.movimiento == null) (if (esGasto) "Nuevo gasto" else "Nuevo ingreso") else "Editar movimiento", fontSize = 22.sp, fontWeight = FontWeight.Bold)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                listOf("gasto" to "Gasto", "ingreso" to "Ingreso").forEachIndexed { i, (valor, texto) ->
                    SegmentedButton(
                        selected = b.tipo == valor, onClick = { b = b.copy(tipo = valor) }, shape = SegmentedButtonDefaults.itemShape(i, 2),
                        colors = SegmentedButtonDefaults.colors(activeContainerColor = Lima, activeContentColor = SobreLima),
                    ) { Text(texto, fontWeight = FontWeight.SemiBold) }
                }
            }
            OutlinedTextField(
                value = b.monto, onValueChange = { v -> b = b.copy(monto = v.filter { it.isDigit() || it == '.' || it == ',' }.take(12)) },
                label = { Text("Monto (${vm.moneda})") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                textStyle = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            )
            OutlinedTextField(
                value = b.descripcion, onValueChange = { b = b.copy(descripcion = it.take(120)) },
                label = { Text("Descripción") }, placeholder = { Text(if (esGasto) "Taxi, almuerzo, luz…" else "Sueldo, Yapeo de Ana…") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Fecha", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                OutlinedButton(onClick = { eligiendoFecha = true }) { Text(fechaLarga(b.fecha)) }
            }
            Text("Categoría", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                categorias.forEach { c ->
                    FilterChip(selected = b.categoria.equals(c, true) || (b.categoria.isBlank() && c == "General"), onClick = { b = b.copy(categoria = c) }, label = { Text(c) }, colors = chipLima())
                }
            }
            OutlinedTextField(value = b.categoria, onValueChange = { b = b.copy(categoria = it.take(40)) }, label = { Text("U otra categoría") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Text("Medio de pago", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MEDIOS.forEach { (clave, nombre) ->
                    FilterChip(selected = b.medio == clave, onClick = { b = b.copy(medio = if (b.medio == clave) "" else clave) }, label = { Text(nombre) }, colors = chipLima())
                }
            }
            OutlinedTextField(value = b.entidad, onValueChange = { b = b.copy(entidad = it.take(40)) }, label = { Text("Banco o entidad (opcional)") }, placeholder = { Text("BCP, Interbank…") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (esGasto) "Ya está pagado" else "Ya lo recibí", modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                Switch(checked = b.pagado, onCheckedChange = { b = b.copy(pagado = it) })
            }
            if (!b.pagado) Text(if (esGasto) "Quedará en Pendientes y te recordaremos el pago por WhatsApp." else "Quedará en Pendientes como cobro por recibir.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)

            Button(
                onClick = { vm.guardar(b, edicion.movimiento?.id, alCerrar) },
                enabled = listo && !vm.ocupado,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors(containerColor = Lima, contentColor = SobreLima),
            ) { Text(if (vm.ocupado) "Guardando…" else "Guardar", fontWeight = FontWeight.Bold, fontSize = 16.sp) }
            if (edicion.movimiento != null) {
                TextButton(onClick = { confirmarBorrar = true }, modifier = Modifier.fillMaxWidth()) { Text("Eliminar", color = MaterialTheme.colorScheme.error) }
            }
            Spacer(Modifier.height(12.dp))
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
