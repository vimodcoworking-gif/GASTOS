package pe.duolab.gastos

import android.content.Context
import android.content.Intent

/** Versión de Play Store: lectura automática de las notificaciones de Yape, Plin y bancos. */
object Lectura {
    const val disponible = true

    fun guardarEnlace(contexto: Context, enlace: String) {
        if (Enviador.enlaceValido(enlace)) Enviador.guardarEnlace(contexto, enlace)
    }

    fun abrir(contexto: Context) {
        contexto.startActivity(Intent(contexto, ConfigurarActivity::class.java))
    }
}
