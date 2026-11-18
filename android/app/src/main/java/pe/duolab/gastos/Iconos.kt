package pe.duolab.gastos

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Los mismos iconos de la web (trazos SVG de 24×24 de public/app.js e index.html), dibujados como vectores
 * nativos. Cada elemento es «M…» (path), «c cx cy r» (círculo) o «r x y ancho alto radio» (rectángulo).
 */
private fun icono(nombre: String, vararg elementos: String): ImageVector {
    val b = ImageVector.Builder(name = nombre, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
    for (e in elementos) {
        val d = when {
            e.startsWith("c ") -> e.drop(2).split(" ").map(String::toFloat).let { (cx, cy, r) ->
                "M${cx - r},$cy a$r,$r 0 1,0 ${2 * r},0 a$r,$r 0 1,0 ${-2 * r},0"
            }
            e.startsWith("r ") -> e.drop(2).split(" ").map(String::toFloat).let { (x, y, w, h, rx) ->
                "M${x + rx},$y h${w - 2 * rx} a$rx,$rx 0 0 1 $rx,$rx v${h - 2 * rx} a$rx,$rx 0 0 1 ${-rx},$rx h${-(w - 2 * rx)} a$rx,$rx 0 0 1 ${-rx},${-rx} v${-(h - 2 * rx)} a$rx,$rx 0 0 1 $rx,${-rx} z"
            }
            else -> e
        }
        b.addPath(
            pathData = addPathNodes(d),
            fill = null,
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 1.9f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        )
    }
    return b.build()
}

object Iconos {
    val casa = icono("casa", "M3 11.5 12 4l9 7.5", "M5 10v10h14V10", "M10 20v-6h4v6")
    val meta = icono("meta", "c 12 12 8.5", "c 12 12 4.5", "c 12 12 1")
    val categorias = icono("categorias", "M4 20V10M10 20V4M16 20v-7M22 20H2")
    val asistente = icono("asistente", "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z")
    val mas = icono("mas", "c 5 12 1.3", "c 12 12 1.3", "c 19 12 1.3")
    val entrada = icono("entrada", "M17 7 7 17", "M17 17H7V7")
    val salida = icono("salida", "M7 17 17 7", "M7 7h10v10")
    val balanza = icono("balanza", "M12 3v18", "M7 21h10", "M4 7h16", "m7 7-3 7a3 3 0 0 0 6 0z", "m17 7-3 7a3 3 0 0 0 6 0z")
    val reloj = icono("reloj", "c 12 12 9", "M12 7v5l3 2")
    val calendario = icono("calendario", "r 3 5 18 16 2.5", "M3 10h18M8 3v4M16 3v4")
    val billetera = icono("billetera", "M20 7H5a2 2 0 0 1 0-4h13v4", "M3 5v14a2 2 0 0 0 2 2h15V7", "M16 14h.01")
    val imagen = icono("imagen", "r 3 3 18 18 3", "c 9 9 1.8", "m21 15-4.5-4.5L6 21")
    val flechaIzq = icono("flechaIzq", "M15 18l-6-6 6-6")
    val flechaDer = icono("flechaDer", "M9 18l6-6-6-6")
    val descargar = icono("descargar", "M12 4v11", "m7 10 5 5 5-5", "M5 20h14")
    val check = icono("check", "M5 12.5l4.5 4.5L19 7.5")
    val mas1 = icono("mas1", "M12 5v14M5 12h14")
    val enviar = icono("enviar", "M22 2 11 13", "M22 2 15 22l-4-9-9-4z")
    val cerrar = icono("cerrar", "M6 6l12 12M18 6 6 18")
    val diseno = icono("diseno", "r 3 3 8 8 2", "r 13 3 8 5 2", "r 13 10 8 11 2", "r 3 13 8 8 2")
    val libro = icono("libro", "M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z", "M8 7h6")
}
