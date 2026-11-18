package pe.duolab.gastos

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

data class Usuario(val id: String, val nombre: String, val email: String, val esAdmin: Boolean, val json: JSONObject = JSONObject())

data class Categoria(val nombre: String, val tipo: String?)

data class Libro(
    val id: String,
    val nombre: String,
    val moneda: String,
    val rol: String,
    val propietario: String,
    val categorias: List<Categoria>,
) {
    val puedeEditar get() = rol != "lector"
}

data class Movimiento(
    val id: String,
    val tipo: String,
    val descripcion: String,
    val categoria: String,
    val monto: Double,
    val fecha: LocalDate,
    val pagado: Boolean,
    val medio: String?,
    val entidad: String?,
    val desdeCorreo: Boolean,
    val enSerie: Boolean,
) {
    val esGasto get() = tipo == "gasto"
}

data class DatosMes(val actual: List<Movimiento>, val proximo: List<Movimiento>, val pendientes: List<Movimiento>)

/** Totales del mes, igual que en la web. */
data class Totales(val ingresos: Double, val gastos: Double, val gastosPendientes: Double, val ingresosPendientes: Double) {
    val balance get() = ingresos - gastos

    companion object {
        fun de(lista: List<Movimiento>) = Totales(
            ingresos = lista.filter { !it.esGasto }.sumOf { it.monto },
            gastos = lista.filter { it.esGasto }.sumOf { it.monto },
            gastosPendientes = lista.filter { it.esGasto && !it.pagado }.sumOf { it.monto },
            ingresosPendientes = lista.filter { !it.esGasto && !it.pagado }.sumOf { it.monto },
        )
    }
}

/** Datos del formulario de un movimiento (nuevo o editado). */
data class Borrador(
    val tipo: String = "gasto",
    val descripcion: String = "",
    val monto: String = "",
    val fecha: LocalDate = LocalDate.now(),
    val categoria: String = "",
    val medio: String = "",
    val entidad: String = "",
    val pagado: Boolean = true,
    // Como el formulario de la web: recordatorio por WhatsApp ("" = según mi ajuste) y repetición.
    val recordar: String = "",
    val repetir: String = "no",
    val veces: String = "11",
) {
    fun aJson(): JSONObject = JSONObject()
        .put("tipo", tipo)
        .put("descripcion", descripcion.trim())
        .put("monto", monto.replace(",", ".").trim().toDoubleOrNull() ?: 0.0)
        .put("fecha", fecha.toString())
        .put("categoria", categoria.trim())
        .put("medio", medio)
        .put("entidad", entidad.trim())
        .put("pagado", pagado)
        .apply {
            if (!pagado) put("recordar", recordar.toIntOrNull() ?: JSONObject.NULL)
            if (repetir != "no") { put("repetir", repetir); put("veces", veces.toIntOrNull() ?: 1) }
        }

    companion object {
        fun de(m: Movimiento) = Borrador(
            tipo = m.tipo, descripcion = m.descripcion, monto = formatoMontoEditable(m.monto), fecha = m.fecha,
            categoria = m.categoria, medio = m.medio.orEmpty(), entidad = m.entidad.orEmpty(), pagado = m.pagado,
        )
    }
}

// ---------- lectura del JSON de la API ----------

fun JSONObject.texto(clave: String): String? = if (!has(clave) || isNull(clave)) null else optString(clave)

fun JSONArray.objetos(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

fun usuarioDe(j: JSONObject) = Usuario(
    id = j.optString("id"), nombre = j.optString("nombre"), email = j.optString("email"), esAdmin = j.optBoolean("esAdmin"), json = j,
)

fun librosDe(j: JSONObject): List<Libro> = j.optJSONArray("libros")?.objetos().orEmpty().map { l ->
    Libro(
        id = l.optString("id"),
        nombre = l.optString("nombre"),
        moneda = l.optString("moneda", "PEN"),
        rol = l.optString("rol"),
        propietario = l.optString("propietario"),
        categorias = l.optJSONArray("categorias")?.objetos().orEmpty().map { Categoria(it.optString("nombre"), it.texto("tipo")) },
    )
}

fun movimientoDe(j: JSONObject) = Movimiento(
    id = j.optString("id"),
    tipo = j.optString("tipo"),
    descripcion = j.optString("descripcion"),
    categoria = j.texto("categoria") ?: "General",
    monto = j.optDouble("monto", 0.0),
    fecha = LocalDate.parse(j.optString("fecha").take(10)),
    pagado = j.optBoolean("pagado"),
    medio = j.texto("medio"),
    entidad = j.texto("entidad"),
    desdeCorreo = j.optBoolean("desdeCorreo"),
    enSerie = j.optBoolean("enSerie"),
)

fun datosMesDe(j: JSONObject): DatosMes {
    fun lista(clave: String) = j.optJSONArray(clave)?.objetos().orEmpty().map(::movimientoDe)
    return DatosMes(lista("actual"), lista("proximo"), lista("pendientes"))
}

// ---------- metas, categorías, año y capturas ----------

data class Aporte(val id: String, val monto: Double, val fecha: LocalDate?, val nota: String)

data class Meta(
    val id: String, val nombre: String, val objetivo: Double, val ahorrado: Double,
    val fechaLimite: LocalDate?, val color: String?, val completada: Boolean, val aportes: List<Aporte>,
) {
    val progreso get() = if (objetivo > 0) (ahorrado / objetivo).coerceIn(0.0, 1.0) else 0.0
}

data class CategoriaMes(
    val nombre: String, val tipo: String, val color: String?, val presupuesto: Double?,
    val propia: Boolean, val movimientos: Int, val totalMes: Double, val cuantosMes: Int,
)

data class MesResumen(val mes: Int, val ingresos: Double, val gastos: Double)

data class ResumenAnio(val anio: Int, val meses: List<MesResumen>, val ingresos: Double, val gastos: Double)

/** Movimiento leído de una captura, antes de registrarlo. */
data class MovCaptura(val json: JSONObject, val elegido: Boolean) {
    val tipo: String get() = json.optString("tipo")
    val monto: Double get() = json.optDouble("monto", 0.0)
    val descripcion: String get() = json.optString("descripcion")
    val fecha: String get() = json.optString("fecha")
    val yaAnotado: Boolean get() = json.optBoolean("yaAnotado")
}

private fun fechaOpcional(s: String?) = s?.takeIf { it.length >= 10 }?.let { LocalDate.parse(it.take(10)) }

fun metasDe(j: JSONObject): List<Meta> = j.optJSONArray("metas")?.objetos().orEmpty().map { m ->
    Meta(
        id = m.optString("id"), nombre = m.optString("nombre"), objetivo = m.optDouble("objetivo", 0.0), ahorrado = m.optDouble("ahorrado", 0.0),
        fechaLimite = fechaOpcional(m.texto("fechaLimite")), color = m.texto("color"), completada = m.optBoolean("completada"),
        aportes = m.optJSONArray("aportes")?.objetos().orEmpty().map { a -> Aporte(a.optString("id"), a.optDouble("monto", 0.0), fechaOpcional(a.texto("fecha")), a.optString("nota")) },
    )
}

fun categoriasMesDe(j: JSONObject): List<CategoriaMes> = j.optJSONArray("categorias")?.objetos().orEmpty().map { c ->
    CategoriaMes(
        nombre = c.optString("nombre"), tipo = c.optString("tipo", "gasto"), color = c.texto("color"),
        presupuesto = if (c.isNull("presupuesto")) null else c.optDouble("presupuesto"), propia = c.optBoolean("propia"),
        movimientos = c.optInt("movimientos"), totalMes = c.optDouble("totalMes", 0.0), cuantosMes = c.optInt("cuantosMes"),
    )
}

fun resumenAnioDe(j: JSONObject): ResumenAnio {
    val meses = j.optJSONArray("meses")?.objetos().orEmpty().map { MesResumen(it.optInt("mes"), it.optDouble("ingresos", 0.0), it.optDouble("gastos", 0.0)) }
    val t = j.optJSONObject("totales")
    return ResumenAnio(j.optInt("anio"), meses, t?.optDouble("ingresos", 0.0) ?: meses.sumOf { it.ingresos }, t?.optDouble("gastos", 0.0) ?: meses.sumOf { it.gastos })
}
