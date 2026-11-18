package pe.duolab.gastos

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.YearMonth

/** «‹ Noviembre de 2026 ›» con «Hoy» si no es el mes actual. */
@Composable
fun SelectorMes(mes: YearMonth, alCambiar: (Long) -> Unit, alHoy: () -> Unit, color: Color = MaterialTheme.colorScheme.onSurface) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        IconButton(onClick = { alCambiar(-1) }) { Icon(Icons.Filled.KeyboardArrowLeft, "Mes anterior", tint = color) }
        Text(nombreMes(mes), color = color, fontWeight = FontWeight.Bold, fontSize = 17.sp, modifier = Modifier.weight(1f), maxLines = 1)
        if (mes != YearMonth.now()) {
            Text("Hoy", color = Lima, fontWeight = FontWeight.Bold, modifier = Modifier.clip(RoundedCornerShape(50)).toque(alTocar = alHoy).padding(horizontal = 10.dp, vertical = 6.dp))
        }
        IconButton(onClick = { alCambiar(1) }) { Icon(Icons.Filled.KeyboardArrowRight, "Mes siguiente", tint = color) }
    }
}

/** Una fila de movimiento: icono de entrada o salida, descripción, datos y monto. */
@Composable
fun FilaMovimiento(m: Movimiento, moneda: String, alTocar: (() -> Unit)?, alPagar: (() -> Unit)? = null) {
    val hoy = LocalDate.now()
    val color = if (m.esGasto) Rojo else Verde
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .then(if (alTocar != null) Modifier.toque(alTocar = alTocar) else Modifier)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(40.dp).clip(CircleShape).background(color.copy(alpha = 0.14f)),
        ) { Text(if (m.esGasto) "↗" else "↙", color = color, fontWeight = FontWeight.Bold, fontSize = 18.sp) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(m.descripcion, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val partes = listOfNotNull(fechaCorta(m.fecha), m.categoria, nombreMedio(m.medio) ?: m.entidad, if (m.desdeCorreo) "✉" else null)
            Text(partes.joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!m.pagado) {
                val vencido = m.fecha.isBefore(hoy)
                Text(
                    if (vencido) "VENCIDO" else if (m.esGasto) "POR PAGAR" else "POR COBRAR",
                    color = if (vencido) Color.White else SobreLima, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 3.dp).clip(RoundedCornerShape(50)).background(if (vencido) Rojo else Naranja).padding(horizontal = 7.dp, vertical = 1.dp),
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        Text((if (m.esGasto) "-" else "+") + dinero(m.monto, moneda), color = if (m.esGasto) MaterialTheme.colorScheme.onSurface else Verde, fontWeight = FontWeight.Bold)
        if (alPagar != null && !m.pagado) {
            Spacer(Modifier.width(8.dp))
            FilledIconButton(onClick = alPagar, colors = IconButtonDefaults.filledIconButtonColors(containerColor = Lima, contentColor = SobreLima), modifier = Modifier.size(38.dp)) {
                Icon(Icons.Filled.Check, if (m.esGasto) "Marcar pagado" else "Marcar cobrado")
            }
        }
    }
}

/** Tarjeta pequeña de total («Ingresos S/ 550.00»). */
@Composable
fun TarjetaTotal(titulo: String, valor: String, nota: String, color: Color, modifier: Modifier = Modifier, progreso: Float? = null) {
    Surface(shape = RoundedCornerShape(22.dp), color = MaterialTheme.colorScheme.surfaceContainer, modifier = modifier) {
        Column(Modifier.padding(14.dp)) {
            Text(titulo, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text(valor, color = color, fontWeight = FontWeight.ExtraBold, fontSize = 19.sp, maxLines = 1)
            Text(nota, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 2)
            if (progreso != null) {
                Spacer(Modifier.height(8.dp))
                Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.outline)) {
                    Box(Modifier.fillMaxWidth(progreso.coerceIn(0f, 1f)).height(6.dp).clip(RoundedCornerShape(50)).background(color))
                }
            }
        }
    }
}

/** Gastos de los últimos 7 días: barras, hoy y el día de más gasto en lima. */
@Composable
fun GraficaSemana(dias: List<Pair<LocalDate, Double>>, modifier: Modifier = Modifier) {
    val maximo = (dias.maxOfOrNull { it.second } ?: 0.0).coerceAtLeast(1.0)
    val hoy = LocalDate.now()
    Column(modifier) {
        Canvas(Modifier.fillMaxWidth().height(92.dp)) {
            val ancho = size.width / dias.size
            val barra = ancho * 0.52f
            dias.forEachIndexed { i, (fecha, total) ->
                val alto = if (total > 0) (total / maximo).toFloat() * size.height else 4f
                val destacado = fecha == hoy || (total > 0 && total == maximo)
                drawRoundRect(
                    color = if (destacado) Lima else Color.White.copy(alpha = 0.16f),
                    topLeft = Offset(i * ancho + (ancho - barra) / 2, size.height - alto.coerceAtLeast(4f)),
                    size = Size(barra, alto.coerceAtLeast(4f)),
                    cornerRadius = CornerRadius(10f, 10f),
                )
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceAround) {
            dias.forEach { (fecha, _) ->
                Text(inicialDia(fecha), color = if (fecha == hoy) Color.White else Tenue, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}
