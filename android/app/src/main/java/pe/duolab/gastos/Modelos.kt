package pe.duolab.gastos

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

data class Usuario(val id: String, val nombre: String, val email: String, val esAdmin: Boolean)

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

    companion object {
        fun de(m: Movimiento) = Borrador(
            tipo = m.tipo, descripcion = m.descripcion, monto = formatoMontoEditable(m.monto), fecha = m.fecha,
            categoria = m.categoria, medio = m.medio.orEmpty(), entidad = m.entidad.orEmpty(), pagado = m.pagado,
        )
    }
}

// ---------- lectura del JSON de la API ----------

private fun JSONObject.texto(clave: String): String? = if (!has(clave) || isNull(clave)) null else optString(clave)

private fun JSONArray.objetos(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

fun usuarioDe(j: JSONObject) = Usuario(
    id = j.optString("id"), nombre = j.optString("nombre"), email = j.optString("email"), esAdmin = j.optBoolean("esAdmin"),
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
