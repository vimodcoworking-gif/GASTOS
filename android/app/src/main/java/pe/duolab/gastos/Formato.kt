package pe.duolab.gastos

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.abs

val ES: Locale = Locale.forLanguageTag("es-PE")

private val NUMERO = DecimalFormat("#,##0.00", DecimalFormatSymbols(Locale.US))

private fun simbolo(moneda: String) = when (moneda) {
    "PEN" -> "S/"
    "USD" -> "US$"
    "EUR" -> "€"
    "MXN", "COP", "CLP", "ARS" -> "$"
    else -> moneda
}

/** «S/ 1,234.50» o «-S/ 20.00», como en la web. */
fun dinero(monto: Double, moneda: String): String = (if (monto < 0) "-" else "") + "${simbolo(moneda)} ${NUMERO.format(abs(monto))}"

fun formatoMontoEditable(monto: Double): String = if (monto % 1.0 == 0.0) monto.toLong().toString() else "%.2f".format(Locale.US, monto)

private fun mayuscula(s: String) = s.replaceFirstChar { it.titlecase(ES) }

/** «Noviembre de 2026». */
fun nombreMes(mes: YearMonth) = "${mayuscula(mes.month.getDisplayName(TextStyle.FULL, ES))} de ${mes.year}"

fun nombreMesCorto(mes: YearMonth) = mayuscula(mes.month.getDisplayName(TextStyle.FULL, ES))

/** «Sábado 14 de noviembre». */
fun fechaLarga(d: LocalDate): String = mayuscula(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", ES).format(d))

/** «14 nov». */
fun fechaCorta(d: LocalDate): String = DateTimeFormatter.ofPattern("d MMM", ES).format(d).replace(".", "")

/** Inicial del día para la gráfica: «L», «M», «X»… */
fun inicialDia(d: LocalDate): String = when (d.dayOfWeek.value) {
    1 -> "L"; 2 -> "M"; 3 -> "X"; 4 -> "J"; 5 -> "V"; 6 -> "S"; else -> "D"
}

val MEDIOS = listOf("yape" to "Yape", "plin" to "Plin", "tarjeta" to "Tarjeta", "transferencia" to "Transferencia", "efectivo" to "Efectivo", "otro" to "Otro")

fun nombreMedio(medio: String?) = MEDIOS.firstOrNull { it.first == medio }?.second
