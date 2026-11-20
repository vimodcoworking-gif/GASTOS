package pe.duolab.gastos

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.graphics.graphicsLayer
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.io.File

/** Vistas de la app, las mismas que la web. */
enum class Vista { MES, METAS, CATEGORIAS, ASISTENTE, ANIO, INFORME, CUENTA, COMPARTIR, ADMIN, CONFIGURACION }

fun abrirEnWeb(contexto: Context, ruta: String) {
    contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Api.BASE + ruta)))
}

/** Reduce la captura como la web (lado mayor 1600 px, JPEG): la IA la lee igual y sube mucho más rápido. */
fun leerImagen(contexto: Context, uri: Uri): ByteArray? = runCatching {
    val original = contexto.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) } ?: return null
    val escala = minOf(1f, 1600f / maxOf(original.width, original.height))
    val img = if (escala < 1f) Bitmap.createScaledBitmap(original, (original.width * escala).toInt(), (original.height * escala).toInt(), true) else original
    ByteArrayOutputStream().use { out -> img.compress(Bitmap.CompressFormat.JPEG, 85, out); out.toByteArray() }
}.getOrNull()

private fun abrirPdf(contexto: Context, bytes: ByteArray, nombre: String) {
    val carpeta = File(contexto.cacheDir, "informes").apply { mkdirs() }
    val archivo = File(carpeta, nombre).apply { writeBytes(bytes) }
    val uri = FileProvider.getUriForFile(contexto, "${contexto.packageName}.archivos", archivo)
    val ver = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/pdf").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    runCatching { contexto.startActivity(Intent.createChooser(ver, "Abrir informe")) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Principal(vm: AppVM, avisos: SnackbarHostState) {
    val contexto = LocalContext.current
    val t = LocalTokens.current
    var vista by rememberSaveable { mutableStateOf(Vista.MES) }
    // La pestaña del inicio que se abre primero se elige en Configuración.
    var seccion by rememberSaveable { mutableStateOf(vm.ajustes.seccion) }
    var edicion by remember { mutableStateOf<Edicion?>(null) }
    var menu by remember { mutableStateOf(false) }
    var disenos by remember { mutableStateOf(false) }
    var actualizacionPedida by remember { mutableStateOf(true) }
    val editar = vm.libro?.puedeEditar == true
    val elegirCaptura = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) leerImagen(contexto, uri)?.let(vm::leerCaptura) ?: run { vm.aviso = "No se pudo abrir la imagen." }
    }
    val pedirCaptura = { elegirCaptura.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    PedirPermisoNotificaciones()
    // Historial de pantallas: «atrás» (gesto, botón del teléfono o la flecha de arriba) vuelve a la anterior,
    // y desde el Mes sale de la app. Ir al Mes desde la barra empieza de nuevo.
    val historial = rememberSaveable(saver = listSaver(save = { l -> l.map { it.name } }, restore = { l -> mutableStateListOf(*l.map(Vista::valueOf).toTypedArray()) })) { mutableStateListOf<Vista>() }
    var haciaAtras by remember { mutableStateOf(false) }
    val ir: (Vista) -> Unit = { v ->
        if (v != vista) {
            haciaAtras = false
            if (v == Vista.MES) historial.clear() else { historial.remove(v); historial.add(vista); while (historial.size > 12) historial.removeAt(0) }
            vista = v
        }
    }
    val volver: () -> Unit = { haciaAtras = true; vista = historial.removeLastOrNull() ?: Vista.MES }
    LaunchedEffect(vm.vistaPedida) { vm.vistaPedida?.let { ir(it); vm.vistaPedida = null } }
    BackHandler(enabled = menu) { menu = false }
    // Atrás predictivo (Android 13+): mientras se desliza desde el borde, la pantalla se encoge y se aparta;
    // al soltar vuelve a la anterior, y si se cancela, queda como estaba.
    var progresoAtras by remember { mutableFloatStateOf(0f) }
    PredictiveBackHandler(enabled = !menu && vista != Vista.MES) { eventos ->
        try {
            eventos.collect { progresoAtras = it.progress }
            volver()
        } catch (_: kotlin.coroutines.cancellation.CancellationException) {
        } finally {
            progresoAtras = 0f
        }
    }
    // Al volver a la app (desde el inicio del teléfono o las apps recientes) se ponen al día los datos.
    LifecycleResumeEffect(Unit) {
        vm.alVolverALaApp()
        TiempoReal.appVisible = true
        // Con la sesión iniciada, el modo «tiempo real» queda escuchando para cuando la app se cierre.
        TiempoReal.iniciar(contexto)
        onPauseOrDispose { TiempoReal.appVisible = false }
    }

    Scaffold(
        containerColor = t.fondo,
        snackbarHost = { SnackbarHost(avisos, Modifier.padding(bottom = 90.dp)) },
        topBar = {
            Box(Modifier.statusBarsPadding().fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            Row(Modifier.widthIn(max = ANCHO_MAX).fillMaxWidth().padding(horizontal = 16.dp, vertical = if (pantallaBaja()) 4.dp else 10.dp), verticalAlignment = Alignment.CenterVertically) {
                if (vista != Vista.MES) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(t.sup).toque(escala = 0.9f, alTocar = volver), contentAlignment = Alignment.Center) {
                        Icon(Iconos.flechaIzq, "Atrás", modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(10.dp))
                }
                Image(painterResource(if (t.oscuro) R.drawable.logo_blanco else R.drawable.logo_negro), "DUOLAB", Modifier.height(21.dp))
                Text(vm.libro?.let { "${it.nombre} · ${it.moneda}" }.orEmpty(), color = t.tenue, fontSize = 13.sp, maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, textAlign = androidx.compose.ui.text.style.TextAlign.End,
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp))
                if (vista == Vista.MES) {
                    Box(Modifier.size(42.dp).clip(RoundedCornerShape(14.dp)).background(t.sup).toque { disenos = true }, contentAlignment = Alignment.Center) {
                        Icon(Iconos.diseno, "Diseño de inicio", modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(8.dp))
                }
                if (editar) {
                    Text("+ Nuevo", fontWeight = FontWeight.Bold, color = SobreLima, fontSize = 15.sp, maxLines = 1, softWrap = false,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(Lima).toque { edicion = Edicion(null, "gasto") }.padding(horizontal = 14.dp, vertical = 10.dp))
                }
            }
            }
        },
    ) { relleno ->
        val lateral = pantallaBaja() && androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp >= 600
        Box(Modifier.padding(top = relleno.calculateTopPadding()).fillMaxSize().padding(start = if (lateral) 84.dp else 0.dp), contentAlignment = Alignment.TopCenter) {
            PullToRefreshBox(
                isRefreshing = vm.cargando, onRefresh = vm::refrescar,
                modifier = Modifier.widthIn(max = ANCHO_MAX).fillMaxSize().graphicsLayer {
                    val escala = 1f - progresoAtras * 0.08f
                    scaleX = escala; scaleY = escala
                    translationX = progresoAtras * 48.dp.toPx()
                    alpha = 1f - progresoAtras * 0.25f
                },
            ) {
                AnimatedContent(
                    targetState = vista,
                    // Hacia adelante entra desde la derecha; hacia atrás, desde la izquierda.
                    transitionSpec = {
                        val dir = if (haciaAtras) -1 else 1
                        (fadeIn(tween(220)) + slideInHorizontally(tween(260)) { dir * it / 10 }) togetherWith (fadeOut(tween(140)) + slideOutHorizontally(tween(260)) { -dir * it / 16 })
                    },
                    label = "vista",
                ) { v -> when (v) {
                    Vista.MES -> VistaMes(vm, seccion, { seccion = it }, { edicion = it }, pedirCaptura, { ir(Vista.INFORME) })
                    Vista.METAS -> VistaMetas(vm)
                    Vista.CATEGORIAS -> VistaCategorias(vm)
                    Vista.ASISTENTE -> VistaAsistente(vm)
                    Vista.ANIO -> VistaAnio(vm)
                    Vista.INFORME -> VistaInforme(vm) { bytes, nombre -> abrirPdf(contexto, bytes, nombre) }
                    Vista.CUENTA -> VistaCuenta(vm)
                    Vista.COMPARTIR -> VistaCompartir(vm)
                    Vista.ADMIN -> VistaAdmin(vm)
                    Vista.CONFIGURACION -> VistaConfiguracion(vm) { disenos = true }
                } }
            }
            if (!lateral) BarraInferior(vista, vm.ajustes, ir, { menu = true }, Modifier.align(Alignment.BottomCenter))
        }
        if (lateral) BarraInferior(vista, vm.ajustes, ir, { menu = true }, Modifier.padding(top = relleno.calculateTopPadding()), vertical = true)
    }
    edicion?.let { e -> if (editar) FormularioMovimiento(vm, e) { edicion = null } else edicion = null }
    DialogoCaptura(vm)
    // Menú «Más»: hoja con tarjetas grandes (el que eligió el usuario, el de la 2.4).
    if (menu) MenuMas(vm, { menu = false }) { ir(it); menu = false }
    if (Actualizacion.encontrada != null && (actualizacionPedida || Actualizacion.pedirInstalar)) DialogoActualizacion { actualizacionPedida = false; Actualizacion.pedirInstalar = false }
    if (disenos) DialogoDisenoWeb(vm) { disenos = false }
}

/** Barra inferior flotante y oscura de la web: Mes, Metas, Categorías, Asistente y Más. */
@Composable
private fun BarraInferior(vista: Vista, ajustes: Ajustes, alElegir: (Vista) -> Unit, alMas: () -> Unit, modifier: Modifier, vertical: Boolean = false) {
    val baja = pantallaBaja()
    // Mes y Más siempre; Metas, Categorías y Asistente se pueden quitar de la barra en Configuración.
    val botones = listOfNotNull(
        Vista.MES to Iconos.casa,
        (Vista.METAS to Iconos.meta).takeIf { ajustes.verMetas },
        (Vista.CATEGORIAS to Iconos.categorias).takeIf { ajustes.verCategorias },
        (Vista.ASISTENTE to Iconos.asistente).takeIf { ajustes.verAsistente },
    )
    // Lo que no está en la barra se abre desde Más (la barra marca Más).
    val enMas = botones.none { it.first == vista }
    if (vertical) {
        Column(
            modifier.fillMaxHeight().navigationBarsPadding().padding(start = 16.dp, top = 4.dp, bottom = 12.dp).width(60.dp).wrapContentHeight(Alignment.CenterVertically)
                .shadow(16.dp, RoundedCornerShape(30.dp)).clip(RoundedCornerShape(30.dp)).background(Color(0xFF141810)).padding(vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            botones.forEach { (v, icono) -> BotonBarra(icono, v.name, vista == v, true) { alElegir(v) } }
            BotonBarra(Iconos.mas, "Más", enMas, true, alMas)
        }
        return
    }
    Row(
        modifier.navigationBarsPadding().padding(horizontal = 32.dp, vertical = if (baja) 6.dp else 12.dp).widthIn(max = 440.dp).fillMaxWidth().height(if (baja) 52.dp else 64.dp)
            .shadow(16.dp, RoundedCornerShape(50)).clip(RoundedCornerShape(50)).background(Color(0xFF141810)).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        botones.forEach { (v, icono) -> BotonBarra(icono, v.name, vista == v, baja) { alElegir(v) } }
        BotonBarra(Iconos.mas, "Más", enMas, baja, alMas)
    }
}

@Composable
private fun BotonBarra(icono: ImageVector, descripcion: String, activo: Boolean, baja: Boolean, alTocar: () -> Unit) {
    val fondo by animateColorAsState(if (activo) Lima else Color.Transparent, tween(220), label = "barra")
    val tinta by animateColorAsState(if (activo) SobreLima else Color(0xFFDFE5D6), tween(220), label = "barra-icono")
    Box(Modifier.size(if (baja) 42.dp else 50.dp).toque(escala = 0.88f, alTocar = alTocar).clip(CircleShape).background(fondo), contentAlignment = Alignment.Center) {
        Icon(icono, descripcion, tint = tinta, modifier = Modifier.size(22.dp))
    }
}

/** Menú «Más» con los mismos grupos que el menú lateral de la web. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MenuMas(vm: AppVM, alCerrar: () -> Unit, alVista: (Vista) -> Unit) {
    val contexto = LocalContext.current
    val t = LocalTokens.current
    var libros by remember { mutableStateOf(false) }
    var salir by remember { mutableStateOf(false) }
    var nuevoLibro by remember { mutableStateOf(false) }
    val u = vm.usuario ?: return
    val libro = vm.libro
    ModalBottomSheet(onDismissRequest = alCerrar, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = t.fondo) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).navigationBarsPadding().padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Perfil: foto de Google, nombre y correo; toca para abrir Mi cuenta.
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(t.sup).toque { alVista(Vista.CUENTA) }.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Avatar(u, 58)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(u.nombre, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    Text(u.email, color = t.tenue, fontSize = 13.sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    if (u.conGoogle) {
                        Row(Modifier.padding(top = 6.dp).clip(RoundedCornerShape(50)).background(t.elev).padding(horizontal = 8.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                            Image(painterResource(R.drawable.ic_google), "Google", Modifier.size(13.dp))
                            Text("  Cuenta de Google", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = t.tenue)
                        }
                    }
                }
                Icon(Iconos.flechaDer, "Mi cuenta", tint = t.tenue, modifier = Modifier.size(18.dp))
            }

            // Libro activo con sus dos acciones.
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(t.sup).padding(16.dp)) {
                Text("LIBRO ACTIVO", color = t.tenue, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconoCaja(Iconos.libro, Lima.copy(alpha = if (t.oscuro) 0.13f else 0.35f), if (t.oscuro) Lima else SobreLima, 42, 13)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(libro?.nombre ?: "—", fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1)
                        Text(listOfNotNull(libro?.moneda, when (libro?.rol) { "propietario" -> "Eres el dueño"; "editor" -> "Puedes editar"; "lector" -> "Solo lectura"; else -> null }).joinToString(" · "),
                            color = t.tenue, fontSize = 12.sp)
                    }
                }
                Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f).heightIn(min = 42.dp).clip(RoundedCornerShape(50)).background(t.elev).toque { libros = true }.padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                        TextoAjustable("Cambiar libro", t.tinta, 14, 10, FontWeight.SemiBold)
                    }
                    Box(Modifier.weight(1f).heightIn(min = 42.dp).clip(RoundedCornerShape(50)).background(Lima).toque { nuevoLibro = true }.padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                        TextoAjustable("+ Nuevo libro", SobreLima, 14, 10, FontWeight.Bold)
                    }
                }
            }

            SeccionMenu("Mis finanzas", listOf(
                { FilaMenu(Iconos.categorias, "Año", "Ingresos y gastos de cada mes") { alVista(Vista.ANIO) } },
                { FilaMenu(Iconos.documento, "Informe PDF", "Resumen de cualquier periodo") { alVista(Vista.INFORME) } },
                { FilaMenu(Iconos.compartir, "Compartir", "Estado de cuenta e invitar al libro") { alVista(Vista.COMPARTIR) } },
            ))

            SeccionMenu("Cuenta", listOfNotNull(
                { FilaMenu(Iconos.persona, "Mi cuenta", "WhatsApp, recordatorios, Gmail y Yape") { alVista(Vista.CUENTA) } },
                if (Lectura.disponible) ({ FilaMenu(Iconos.imagen, "Lectura de Yape", "Registra solos tus Yapes, Plin y avisos del banco") { Lectura.abrir(contexto) } }) else null,
                if (u.esAdmin) ({ FilaMenu(Iconos.escudo, "Administración", "Usuarios, WhatsApp, IA y almacenamiento") { alVista(Vista.ADMIN) } }) else null,
            ))

            // Una sola entrada a Configuración: ahí están el tema, las notificaciones, el inicio, los datos
            // y las actualizaciones (no se repiten aquí).
            SeccionMenu("Aplicación", listOf(
                { FilaMenu(Iconos.diseno, "Configuración", "Tema, notificaciones, inicio y datos") { alVista(Vista.CONFIGURACION) } },
            ))

            // Cerrar sesión, aparte y en rojo, para no tocarlo sin querer.
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(t.sup).toque { salir = true }.padding(vertical = 15.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
            ) {
                Icon(Iconos.salir, null, tint = Color(0xFFD92D20), modifier = Modifier.size(19.dp))
                Spacer(Modifier.width(8.dp))
                Text("Cerrar sesión", color = Color(0xFFD92D20), fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
            Text("DUOLAB Gastos · versión ${BuildConfig.VERSION_NAME}", color = t.tenue, fontSize = 11.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
    if (libros) {
        AlertDialog(
            onDismissRequest = { libros = false },
            title = { Text("Elige el libro") },
            text = {
                Column {
                    vm.libros.forEach { l ->
                        Text((if (l.id == vm.libroId) "✓  " else "     ") + "${l.nombre} · ${l.moneda}" + if (l.rol != "propietario") "  (de ${l.propietario})" else "",
                            fontWeight = if (l.id == vm.libroId) FontWeight.Bold else FontWeight.Normal,
                            modifier = Modifier.fillMaxWidth().toque { vm.elegirLibro(l.id); libros = false; alCerrar() }.padding(vertical = 12.dp))
                    }
                }
            },
            confirmButton = { TextButton(onClick = { libros = false }) { Text("Cerrar") } },
        )
    }
    if (nuevoLibro) {
        var nombre by remember { mutableStateOf("") }
        var moneda by remember { mutableStateOf("PEN") }
        AlertDialog(
            onDismissRequest = { nuevoLibro = false },
            title = { Text("Nuevo libro") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Un libro agrupa movimientos: por ejemplo «Personal», «Casa» o «Viaje».", color = t.tenue, fontSize = 13.sp)
                    Campo("Nombre", nombre, { nombre = it.take(60) })
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("PEN" to "S/ Soles", "USD" to "US$ Dólares", "EUR" to "€ Euros").forEach { (v, n) ->
                            FilterChip(selected = moneda == v, onClick = { moneda = v }, label = { Text(n, fontSize = 12.sp) }, colors = chipLima())
                        }
                    }
                }
            },
            confirmButton = { TextButton(enabled = nombre.isNotBlank(), onClick = { vm.crearLibro(nombre, moneda) { nuevoLibro = false; alCerrar() } }) { Text("Crear") } },
            dismissButton = { TextButton(onClick = { nuevoLibro = false }) { Text("Cancelar") } },
        )
    }
    if (salir) {
        AlertDialog(
            onDismissRequest = { salir = false },
            title = { Text("¿Cerrar sesión?") },
            text = { Text("Tendrás que volver a entrar con tu correo o con Google.") },
            confirmButton = { TextButton(onClick = { salir = false; alCerrar(); vm.cerrarSesion() }) { Text("Cerrar sesión", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { salir = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun Grupo(titulo: String) {
    Text(titulo.uppercase(), color = LocalTokens.current.tenue, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 6.dp, top = 12.dp, bottom = 2.dp))
}

@Composable
private fun ItemMenu(icono: ImageVector, titulo: String, nota: String, alTocar: () -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(t.sup).toque(alTocar = alTocar).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        IconoCaja(icono, t.elev, t.tinta, 36, 12)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(titulo, fontWeight = FontWeight.SemiBold)
            Text(nota, color = t.tenue, fontSize = 12.sp, maxLines = 2)
        }
    }
}


@Composable
private fun DialogoNuevoLibro(vm: AppVM, alCerrar: () -> Unit) {
    val t = LocalTokens.current
    var nombre by remember { mutableStateOf("") }
    var moneda by remember { mutableStateOf("PEN") }
    AlertDialog(
        onDismissRequest = alCerrar,
        containerColor = t.sup,
        title = { Text("Nuevo libro", fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Un libro agrupa movimientos: por ejemplo «Personal», «Casa» o «Viaje».", color = t.tenue, fontSize = 13.sp)
                Campo("Nombre", nombre, { nombre = it.take(60) })
                Text("Moneda", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Selector(moneda, MONEDAS) { moneda = it }
            }
        },
        confirmButton = { TextButton(enabled = nombre.isNotBlank(), onClick = { vm.crearLibro(nombre, moneda, alCerrar) }) { Text("Guardar", fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}


@Composable
private fun SeccionMenu(titulo: String, filas: List<@Composable () -> Unit>) {
    val t = LocalTokens.current
    if (filas.isEmpty()) return
    Column {
        Text(titulo.uppercase(), color = t.tenue, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 6.dp, bottom = 6.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(t.sup)) {
            filas.forEachIndexed { i, fila ->
                if (i > 0) HorizontalDivider(color = t.linea, modifier = Modifier.padding(start = 62.dp))
                fila()
            }
        }
    }
}

@Composable
private fun FilaMenu(icono: ImageVector, titulo: String, nota: String, alTocar: () -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().toque(escala = 0.99f, alTocar = alTocar).padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        IconoCaja(icono, t.elev, t.tinta, 36, 11)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
            Text(nota, color = t.tenue, fontSize = 12.sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        }
        Icon(Iconos.flechaDer, null, tint = t.tenue, modifier = Modifier.size(16.dp))
    }
}
