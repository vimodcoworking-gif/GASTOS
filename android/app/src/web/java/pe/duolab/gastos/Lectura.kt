package pe.duolab.gastos

import android.content.Context

/** Versión «web» (APK fuera de Play Store): sin lectura de notificaciones (Play Protect la bloquearía). */
object Lectura {
    const val disponible = false

    fun guardarEnlace(contexto: Context, enlace: String) = Unit

    fun abrir(contexto: Context) = Unit
}
