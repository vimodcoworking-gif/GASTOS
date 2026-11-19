package pe.duolab.gastos

import android.content.Context
import java.time.LocalTime

/**
 * Configuración de la app en este teléfono (Más → Configuración). Se guarda en SharedPreferences para que
 * también la lean los avisos en segundo plano (WorkManager y Firebase), que no tienen la pantalla abierta.
 */
data class Ajustes(
    val notificaciones: Boolean = true,
    val movimientos: Boolean = true,
    val pagos: Boolean = true,
    val actualizaciones: Boolean = true,
    val silencioNoche: Boolean = false,
    val seccionInicio: String = SeccionMes.CALENDARIO.name,
    val verMetas: Boolean = true,
    val verCategorias: Boolean = true,
    val verAsistente: Boolean = true,
) {
    fun guardar(contexto: Context) {
        contexto.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("notificaciones", notificaciones).putBoolean("movimientos", movimientos).putBoolean("pagos", pagos)
            .putBoolean("actualizaciones", actualizaciones).putBoolean("silencioNoche", silencioNoche).putString("seccionInicio", seccionInicio)
            .putBoolean("verMetas", verMetas).putBoolean("verCategorias", verCategorias).putBoolean("verAsistente", verAsistente)
            .apply()
    }

    /** ¿Se muestra este tipo de aviso? La prueba sale siempre, para poder comprobar que llegan. */
    fun permite(tipo: TipoAviso) = tipo == TipoAviso.PRUEBA || (notificaciones && when (tipo) {
        TipoAviso.MOVIMIENTO -> movimientos
        TipoAviso.PAGO -> pagos
        TipoAviso.ACTUALIZACION -> actualizaciones
        TipoAviso.PRUEBA -> true
    })

    /** De 22:00 a 7:00 los avisos llegan sin sonido ni vibración (si se activó «Silencio de noche»). */
    fun silenciarAhora(): Boolean {
        val h = LocalTime.now().hour
        return silencioNoche && (h >= 22 || h < 7)
    }

    val seccion: SeccionMes get() = SeccionMes.entries.firstOrNull { it.name == seccionInicio } ?: SeccionMes.CALENDARIO

    companion object {
        private const val PREFS = "ajustes"

        fun leer(contexto: Context): Ajustes {
            val p = contexto.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            return Ajustes(
                notificaciones = p.getBoolean("notificaciones", true), movimientos = p.getBoolean("movimientos", true),
                pagos = p.getBoolean("pagos", true), actualizaciones = p.getBoolean("actualizaciones", true),
                silencioNoche = p.getBoolean("silencioNoche", false),
                seccionInicio = p.getString("seccionInicio", null) ?: SeccionMes.CALENDARIO.name,
                verMetas = p.getBoolean("verMetas", true), verCategorias = p.getBoolean("verCategorias", true), verAsistente = p.getBoolean("verAsistente", true),
            )
        }
    }
}

enum class TipoAviso { MOVIMIENTO, PAGO, ACTUALIZACION, PRUEBA }

/** Tipo de un aviso del servidor según su etiqueta: «recordatorio» = pago por vencer, «prueba», y el resto movimientos. */
fun tipoDeEtiqueta(etiqueta: String) = when {
    etiqueta == "prueba" -> TipoAviso.PRUEBA
    etiqueta.startsWith("recordatorio") -> TipoAviso.PAGO
    else -> TipoAviso.MOVIMIENTO
}

/** Tema elegido: «claro», «oscuro» o «auto» (como el teléfono). */
enum class ModoTema(val clave: String, val nombre: String) {
    CLARO("claro", "Claro"), OSCURO("oscuro", "Oscuro"), AUTO("auto", "Automático");

    companion object { fun de(clave: String?) = entries.firstOrNull { it.clave == clave } ?: AUTO }
}
