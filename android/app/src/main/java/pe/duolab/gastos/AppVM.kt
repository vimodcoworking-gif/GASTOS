package pe.duolab.gastos

import android.app.Application
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth

/** Estado de la app: sesión, libro, mes y movimientos. Todo sale de la misma API que la web. */
class AppVM(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("app", Context.MODE_PRIVATE)

    var arrancando by mutableStateOf(true); private set
    var usuario by mutableStateOf<Usuario?>(null); private set
    var libros by mutableStateOf<List<Libro>>(emptyList()); private set
    var libroId by mutableStateOf<String?>(null); private set
    var mes by mutableStateOf(YearMonth.now()); private set
    var datos by mutableStateOf<DatosMes?>(null); private set
    var cargando by mutableStateOf(false); private set
    var ocupado by mutableStateOf(false); private set
    var aviso by mutableStateOf<String?>(null)

    val libro: Libro? get() = libros.firstOrNull { it.id == libroId }
    val moneda: String get() = libro?.moneda ?: "PEN"

    private var carga: Job? = null

    init {
        Api.iniciar(app)
        viewModelScope.launch {
            if (Api.haySesion()) {
                try {
                    usuario = usuarioDe(Api.get("/auth/yo").getJSONObject("usuario"))
                    alEntrar()
                } catch (e: ApiError) {
                    if (e.codigo == 401) Api.olvidarSesion() else aviso = e.message
                }
            }
            arrancando = false
        }
    }

    // ---------- sesión ----------

    fun entrar(email: String, password: String) = accion {
        val r = Api.post("/auth/login", JSONObject().put("email", email.trim()).put("password", password))
        usuario = usuarioDe(r.getJSONObject("usuario"))
        alEntrar()
    }

    /** Vuelta del acceso con Google en Chrome: duolab://login?codigo=… */
    fun canjearCodigo(codigo: String) = accion {
        val r = Api.post("/auth/app/canjear", JSONObject().put("codigo", codigo))
        usuario = usuarioDe(r.getJSONObject("usuario"))
        alEntrar()
    }

    fun cerrarSesion() {
        viewModelScope.launch { runCatching { Api.post("/auth/logout") } }
        Api.olvidarSesion()
        usuario = null
        libros = emptyList()
        datos = null
    }

    private suspend fun alEntrar() {
        cargarLibros()
        cargarMesAhora()
        conectarLectura()
    }

    /** Versión de Play Store: la lectura automática recibe el enlace personal sin que el usuario haga nada. */
    private suspend fun conectarLectura() {
        if (!Lectura.disponible) return
        runCatching {
            val enlace = Api.get("/avisos/enlace").optString("enlace").takeIf { it.startsWith("https://") }
                ?: Api.post("/avisos/enlace").optString("enlace")
            Lectura.guardarEnlace(getApplication(), enlace)
        }
    }

    // ---------- datos ----------

    private suspend fun cargarLibros() {
        libros = librosDe(Api.get("/libros"))
        val guardado = prefs.getString("libro", null)
        libroId = libros.firstOrNull { it.id == libroId || it.id == guardado }?.id ?: libros.firstOrNull()?.id
    }

    private suspend fun cargarMesAhora() {
        val id = libroId ?: return
        val hasta = LocalDate.now().plusDays(30)
        datos = datosMesDe(Api.get("/libros/$id/mes?mes=$mes&hasta=$hasta"))
    }

    fun refrescar() {
        if (usuario == null) return
        carga?.cancel()
        carga = viewModelScope.launch {
            cargando = true
            try {
                cargarLibros()
                cargarMesAhora()
            } catch (e: ApiError) {
                if (e.codigo == 401) cerrarSesion() else aviso = e.message
            } finally {
                cargando = false
            }
        }
    }

    fun cambiarMes(delta: Long) {
        mes = mes.plusMonths(delta)
        datos = null
        refrescar()
    }

    fun irAHoy() {
        if (mes != YearMonth.now()) {
            mes = YearMonth.now()
            datos = null
            refrescar()
        }
    }

    fun elegirLibro(id: String) {
        libroId = id
        prefs.edit().putString("libro", id).apply()
        datos = null
        refrescar()
    }

    // ---------- movimientos ----------

    fun guardar(borrador: Borrador, id: String?, alTerminar: () -> Unit) = accion {
        val libro = libroId ?: return@accion
        if (id == null) Api.post("/libros/$libro/movimientos", borrador.aJson())
        else Api.patch("/libros/$libro/movimientos/$id", borrador.aJson())
        aviso = if (id == null) (if (borrador.tipo == "gasto") "Gasto registrado" else "Ingreso registrado") else "Cambios guardados"
        alTerminar()
        cargarMesAhora()
    }

    fun eliminar(id: String, alTerminar: () -> Unit) = accion {
        Api.delete("/libros/${libroId ?: return@accion}/movimientos/$id")
        aviso = "Movimiento eliminado"
        alTerminar()
        cargarMesAhora()
    }

    fun marcarPagado(m: Movimiento) = accion {
        Api.patch("/libros/${libroId ?: return@accion}/movimientos/${m.id}", JSONObject().put("pagado", true))
        aviso = if (m.esGasto) "Marcado como pagado" else "Marcado como cobrado"
        cargarMesAhora()
    }

    /** Ejecuta una acción con el indicador de «ocupado» y muestra el error del servidor si falla. */
    private fun accion(bloque: suspend () -> Unit) {
        if (ocupado) return
        viewModelScope.launch {
            ocupado = true
            try {
                bloque()
            } catch (e: ApiError) {
                if (e.codigo == 401 && usuario != null) {
                    cerrarSesion()
                    aviso = "Tu sesión terminó. Vuelve a entrar."
                } else {
                    aviso = e.message
                }
            } finally {
                ocupado = false
            }
        }
    }
}
