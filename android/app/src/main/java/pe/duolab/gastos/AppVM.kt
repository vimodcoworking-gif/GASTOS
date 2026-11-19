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

    // Copia local de lo último que se vio: la app abre al instante y se pone al día por detrás.
    private val cache = app.getSharedPreferences("cache", Context.MODE_PRIVATE)
    private fun claveMes(libro: String?, m: YearMonth) = "mes:$libro:$m"
    private fun mesGuardado(libro: String? = libroId, m: YearMonth = mes) = cache.getString(claveMes(libro, m), null)?.let { runCatching { datosMesDe(JSONObject(it)) }.getOrNull() }

    init {
        Api.iniciar(app)
        if (Api.haySesion()) {
            runCatching {
                cache.getString("yo", null)?.let { usuario = usuarioDe(JSONObject(it)) }
                cache.getString("libros", null)?.let { j ->
                    libros = librosDe(JSONObject(j))
                    val guardado = prefs.getString("libro", null)
                    libroId = libros.firstOrNull { it.id == guardado }?.id ?: libros.firstOrNull()?.id
                }
                datos = mesGuardado()
                if (usuario != null && datos != null) arrancando = false
            }
        }
        viewModelScope.launch {
            if (Api.haySesion()) {
                try {
                    fijarUsuario(Api.get("/auth/yo").getJSONObject("usuario"))
                    alEntrar()
                } catch (e: ApiError) {
                    if (e.codigo == 401) {
                        Api.olvidarSesion()
                        cache.edit().clear().apply()
                        usuario = null
                    } else if (usuario == null) aviso = e.message
                }
            }
            arrancando = false
        }
    }

    // ---------- sesión ----------

    fun entrar(email: String, password: String) = accion {
        val r = Api.post("/auth/login", JSONObject().put("email", email.trim()).put("password", password))
        fijarUsuario(r.getJSONObject("usuario"))
        alEntrar()
    }

    /** Vuelta del acceso con Google en Chrome: duolab://login?codigo=… */
    fun canjearCodigo(codigo: String) = accion {
        val r = Api.post("/auth/app/canjear", JSONObject().put("codigo", codigo))
        fijarUsuario(r.getJSONObject("usuario"))
        alEntrar()
    }

    fun registrar(nombre: String, email: String, password: String, whatsapp: String) = accion {
        val r = Api.post("/auth/registro", JSONObject().put("nombre", nombre.trim()).put("email", email.trim()).put("password", password).put("whatsapp", whatsapp.trim()))
        fijarUsuario(r.getJSONObject("usuario"))
        alEntrar()
    }

    /** Pide el código para cambiar la contraseña (llega por WhatsApp o correo). */
    fun olvide(email: String, alEnviar: () -> Unit) = accion {
        aviso = Api.post("/auth/olvide", JSONObject().put("email", email.trim())).optString("mensaje")
        alEnviar()
    }

    fun restablecer(email: String, codigo: String, password: String) = accion {
        val r = Api.post("/auth/restablecer", JSONObject().put("email", email.trim()).put("codigo", codigo.trim()).put("password", password))
        fijarUsuario(r.getJSONObject("usuario"))
        aviso = "Contraseña cambiada"
        alEntrar()
    }

    fun refrescarUsuario() = viewModelScope.launch {
        runCatching { fijarUsuario(Api.get("/auth/yo").getJSONObject("usuario")) }
    }

    /** Pone la cuenta y la guarda en el teléfono (para abrir al instante aunque el servidor tarde). */
    private fun fijarUsuario(j: JSONObject) {
        cache.edit().putString("yo", j.toString()).apply()
        usuario = usuarioDe(j)
    }

    fun ponerUsuario(j: JSONObject) {
        fijarUsuario(j)
    }

    // ---------- diseño de la pantalla de inicio (como el botón de cuadritos de la web) ----------

    var diseno by mutableStateOf(prefs.getString("disenoInicio", "auto") ?: "auto"); private set

    fun elegirDiseno(id: String) {
        diseno = id
        prefs.edit().putString("disenoInicio", id).apply()
    }

    /** Moneda del libro (solo la cambia su propietario), como el selector «Moneda» del menú de la web. */
    fun cambiarMoneda(moneda: String) = accion {
        Api.patch("/libros/${libroId ?: return@accion}", JSONObject().put("moneda", moneda))
        cargarLibros()
        aviso = "Moneda cambiada a $moneda"
    }

    fun crearLibro(nombre: String, moneda: String, alTerminar: () -> Unit) = accion {
        val r = Api.post("/libros", JSONObject().put("nombre", nombre.trim()).put("moneda", moneda))
        cargarLibros()
        r.optJSONObject("libro")?.optString("id")?.let { elegirLibro(it) }
        aviso = "Libro creado"
        alTerminar()
    }

    fun cerrarSesion() {
        val app = getApplication<Application>()
        // Primero se quita este teléfono de los avisos (hace falta la sesión), luego se cierra la sesión.
        viewModelScope.launch {
            try { Push.quitar(app); runCatching { Api.post("/auth/logout") } } finally { Api.olvidarSesion() }
        }
        cache.edit().clear().apply()
        usuario = null
        libros = emptyList()
        datos = null
    }

    private suspend fun alEntrar() {
        cargarLibros()
        cargarMesAhora()
        capturaPendiente?.let { capturaPendiente = null; leerCaptura(it) }
        conectarLectura()
        runCatching { Push.activar(getApplication()) }
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
        val j = Api.get("/libros")
        cache.edit().putString("libros", j.toString()).apply()
        libros = librosDe(j)
        val guardado = prefs.getString("libro", null)
        libroId = libros.firstOrNull { it.id == libroId || it.id == guardado }?.id ?: libros.firstOrNull()?.id
    }

    private suspend fun cargarMesAhora() {
        val id = libroId ?: return
        val hasta = LocalDate.now().plusDays(30)
        val pedido = mes
        val j = Api.get("/libros/$id/mes?mes=$pedido&hasta=$hasta")
        cache.edit().putString(claveMes(id, pedido), j.toString()).apply()
        val nuevos = datosMesDe(j)
        if (pedido == mes && id == libroId) datos = nuevos
        precargar(id, pedido)
        // Lo que ya está en pantalla no se vuelve a avisar como notificación.
        Avisos.marcarVistos(getApplication(), id, (nuevos.actual + nuevos.pendientes).map { it.id })
    }

    /** El mes anterior y el siguiente quedan guardados: cambiar de mes es instantáneo. */
    private fun precargar(id: String, centro: YearMonth) {
        viewModelScope.launch {
            for (m in listOf(centro.minusMonths(1), centro.plusMonths(1))) {
                // Solo los meses que aún no están en el teléfono: los demás se ponen al día al abrirlos.
                if (cache.contains(claveMes(id, m))) continue
                runCatching {
                    val j = Api.get("/libros/$id/mes?mes=$m&hasta=${LocalDate.now().plusDays(30)}")
                    cache.edit().putString(claveMes(id, m), j.toString()).apply()
                }
            }
        }
    }

    /**
     * Vuelve a traer los datos. «conLibros» = también la lista de libros (al abrir, al volver a la app);
     * al cambiar de mes basta el mes. «espera»: al pasar meses seguidos (deslizando) solo se pide el último.
     */
    fun refrescar(conLibros: Boolean = true, espera: Long = 0) {
        if (usuario == null) return
        ultimaCarga = System.currentTimeMillis()
        carga?.cancel()
        carga = viewModelScope.launch {
            if (espera > 0) kotlinx.coroutines.delay(espera)
            cargando = true
            try {
                if (conLibros || libros.isEmpty()) cargarLibros()
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
        datos = mesGuardado()
        refrescar(conLibros = false, espera = 250)
    }

    fun irAHoy() {
        if (mes != YearMonth.now()) {
            mes = YearMonth.now()
            datos = mesGuardado()
            refrescar()
        }
    }

    /** Una vista pide abrir otra (p. ej. Año → tocar un mes abre ese mes). Principal la atiende y la limpia. */
    var vistaPedida by mutableStateOf<Vista?>(null)

    private var ultimaCarga = 0L

    /** Al volver a la app tras un rato fuera, se ponen al día los datos (sin parpadeo: la copia sigue en pantalla). */
    fun alVolverALaApp() {
        if (usuario != null && System.currentTimeMillis() - ultimaCarga > 60_000) refrescar()
    }

    fun irAMes(nuevo: YearMonth) {
        mes = nuevo
        datos = mesGuardado()
        refrescar(conLibros = false)
    }

    fun elegirLibro(id: String) {
        libroId = id
        prefs.edit().putString("libro", id).apply()
        datos = mesGuardado()
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

    fun marcarPagado(m: Movimiento, pagado: Boolean = true) = accion {
        Api.patch("/libros/${libroId ?: return@accion}/movimientos/${m.id}", JSONObject().put("pagado", pagado))
        aviso = if (!pagado) "Vuelve a estar pendiente" else if (m.esGasto) "Marcado como pagado" else "Marcado como cobrado"
        cargarMesAhora()
    }

    // ---------- tema ----------

    /** Claro, Oscuro o Automático (como el teléfono). Sin elegir nada, Automático. */
    var tema by mutableStateOf(ModoTema.de(prefs.getString("tema", null))); private set

    /** null = como el teléfono; true/false = elegido. */
    val temaOscuro: Boolean? get() = when (tema) { ModoTema.OSCURO -> true; ModoTema.CLARO -> false; ModoTema.AUTO -> null }

    fun elegirTema(modo: ModoTema) {
        tema = modo
        prefs.edit().putString("tema", modo.clave).apply()
    }

    // ---------- configuración del teléfono (Más → Configuración) ----------

    var ajustes by mutableStateOf(Ajustes.leer(app)); private set

    fun cambiarAjustes(nuevo: Ajustes) {
        ajustes = nuevo
        nuevo.guardar(getApplication())
    }

    /** Borra la copia local (cuenta, libros y meses guardados) y vuelve a traer todo del servidor. */
    fun borrarCopiaLocal() {
        val yo = cache.getString("yo", null)
        cache.edit().clear().apply()
        yo?.let { cache.edit().putString("yo", it).apply() }
        refrescar()
        aviso = "Copia del teléfono borrada: datos actualizados"
    }

    // ---------- metas de ahorro ----------

    var metas by mutableStateOf<List<Meta>?>(null); private set

    fun cargarMetas() = viewModelScope.launch {
        val id = libroId ?: return@launch
        runCatching { metas = metasDe(Api.get("/libros/$id/metas")) }.onFailure { if (it is ApiError) aviso = it.message }
    }

    fun crearMeta(nombre: String, objetivo: Double, inicial: Double, fechaLimite: LocalDate?, alTerminar: () -> Unit) = accion {
        val cuerpo = JSONObject().put("nombre", nombre.trim()).put("objetivo", objetivo)
        if (inicial > 0) cuerpo.put("inicial", inicial)
        if (fechaLimite != null) cuerpo.put("fechaLimite", fechaLimite.toString())
        Api.post("/libros/${libroId ?: return@accion}/metas", cuerpo)
        aviso = "Meta creada"
        alTerminar()
        metas = metasDe(Api.get("/libros/$libroId/metas"))
    }

    /** Aportar (monto > 0) o retirar (monto < 0); opcionalmente queda también como gasto o ingreso. */
    fun moverMeta(meta: Meta, monto: Double, registrar: Boolean, alTerminar: () -> Unit) = accion {
        Api.post("/libros/${libroId ?: return@accion}/metas/${meta.id}/aportes", JSONObject().put("monto", monto).put("registrar", registrar))
        aviso = if (monto > 0) "Aporte guardado" else "Retiro guardado"
        alTerminar()
        metas = metasDe(Api.get("/libros/$libroId/metas"))
        if (registrar) cargarMesAhora()
    }

    fun eliminarMeta(meta: Meta) = accion {
        Api.delete("/libros/${libroId ?: return@accion}/metas/${meta.id}")
        aviso = "Meta eliminada"
        metas = metasDe(Api.get("/libros/$libroId/metas"))
    }

    // ---------- categorías y presupuestos ----------

    var categorias by mutableStateOf<List<CategoriaMes>?>(null); private set

    fun cargarCategorias() = viewModelScope.launch {
        val id = libroId ?: return@launch
        runCatching { categorias = categoriasMesDe(Api.get("/libros/$id/categorias?mes=$mes")) }.onFailure { if (it is ApiError) aviso = it.message }
    }

    fun guardarCategoria(nombre: String, tipo: String, presupuesto: Double?, antes: String?, alTerminar: () -> Unit) = accion {
        val cuerpo = JSONObject().put("nombre", nombre.trim()).put("tipo", tipo).put("presupuesto", presupuesto ?: JSONObject.NULL)
        if (antes != null) cuerpo.put("antes", antes)
        Api.put("/libros/${libroId ?: return@accion}/categorias", cuerpo)
        aviso = "Categoría guardada"
        alTerminar()
        categorias = categoriasMesDe(Api.get("/libros/$libroId/categorias?mes=$mes"))
        cargarLibros()
    }

    // ---------- año ----------

    var anio by mutableStateOf(LocalDate.now().year); private set
    var resumenAnio by mutableStateOf<ResumenAnio?>(null); private set

    fun cargarAnio(nuevo: Int = anio) = viewModelScope.launch {
        anio = nuevo
        resumenAnio = null
        val id = libroId ?: return@launch
        runCatching { resumenAnio = resumenAnioDe(Api.get("/libros/$id/resumen?anio=$nuevo")) }.onFailure { if (it is ApiError) aviso = it.message }
    }

    // ---------- asistente IA ----------

    data class Mensaje(val deMi: Boolean, val texto: String)

    var chat by mutableStateOf<List<Mensaje>>(emptyList()); private set
    var pensando by mutableStateOf(false); private set

    fun preguntar(texto: String) {
        if (texto.isBlank() || pensando) return
        chat = chat + Mensaje(true, texto.trim())
        viewModelScope.launch {
            pensando = true
            try {
                val r = Api.post("/ia/chat", JSONObject().put("mensaje", texto.trim()).put("libroId", libroId))
                chat = chat + Mensaje(false, r.optString("texto"))
                cargarMesAhora()
            } catch (e: ApiError) {
                chat = chat + Mensaje(false, e.message ?: "No se pudo responder.")
            } finally {
                pensando = false
            }
        }
    }

    // ---------- capturas de Yape, Plin o del banco ----------

    var captura by mutableStateOf<List<MovCaptura>?>(null)
    var notaCaptura by mutableStateOf("")
    var leyendoCaptura by mutableStateOf(false); private set

    fun leerCaptura(bytes: ByteArray) = viewModelScope.launch {
        val id = libroId ?: return@launch
        leyendoCaptura = true
        try {
            val r = Api.postImagen("/libros/$id/capturas", bytes)
            val lista = r.optJSONArray("movimientos")?.objetos().orEmpty().map { MovCaptura(it, !it.optBoolean("yaAnotado")) }
            notaCaptura = r.optString("nota")
            if (lista.isEmpty()) aviso = notaCaptura.ifBlank { "No encontré pagos en la captura." } else captura = lista
        } catch (e: ApiError) {
            aviso = e.message
        } finally {
            leyendoCaptura = false
        }
    }

    // Captura compartida a la app («Compartir → DUOLAB»): se lee al momento, o al entrar si aún no hay sesión.
    private var capturaPendiente: ByteArray? = null

    fun capturaCompartida(bytes: ByteArray) {
        if (usuario != null && libroId != null) leerCaptura(bytes) else capturaPendiente = bytes
    }

    fun registrarCaptura() = accion {
        val elegidos = captura.orEmpty().filter { it.elegido }
        val lista = org.json.JSONArray().apply { elegidos.forEach { put(it.json) } }
        val r = Api.post("/libros/${libroId ?: return@accion}/capturas/registrar", JSONObject().put("movimientos", lista))
        aviso = r.optString("mensaje").lineSequence().firstOrNull()?.ifBlank { null } ?: "Registrado"
        captura = null
        cargarMesAhora()
    }

    // ---------- informe PDF ----------

    fun descargarInforme(desde: LocalDate, hasta: LocalDate, alListo: (ByteArray) -> Unit) = accion {
        alListo(Api.descargar("/libros/${libroId ?: return@accion}/informe.pdf?desde=$desde&hasta=$hasta"))
    }

    /** Ejecuta una acción con el indicador de «ocupado» y muestra el error del servidor si falla. */
    fun hacer(bloque: suspend () -> Unit) = accion(bloque)

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
