package pe.duolab.gastos

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/** Lista desplegable con el aspecto de los <select> de la web. */
@Composable
fun Selector(valor: String, opciones: List<Pair<String, String>>, modifier: Modifier = Modifier, habilitado: Boolean = true, alElegir: (String) -> Unit) {
    val t = LocalTokens.current
    var abierto by remember { mutableStateOf(false) }
    Box(modifier) {
        Row(
            Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(14.dp)).background(t.elev).border(1.dp, t.linea, RoundedCornerShape(14.dp))
                .toque(habilitado, escala = 0.99f) { abierto = true }.padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(opciones.firstOrNull { it.first == valor }?.second ?: valor, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = if (habilitado) t.tinta else t.tenue, fontSize = 15.sp)
            Text("⌄", fontSize = 18.sp, color = t.tenue)
        }
        DropdownMenu(expanded = abierto, onDismissRequest = { abierto = false }, containerColor = t.sup) {
            opciones.forEach { (clave, nombre) ->
                DropdownMenuItem(text = { Text(nombre, fontWeight = if (clave == valor) FontWeight.Bold else FontWeight.Normal) }, onClick = { abierto = false; alElegir(clave) })
            }
        }
    }
}

// ---------- menú lateral (como el «cajón» de la web) ----------

@Composable
fun MenuLateral(vm: AppVM, visible: Boolean, alCerrar: () -> Unit, alVista: (Vista) -> Unit, alNuevoLibro: () -> Unit, alSalir: () -> Unit) {
    val t = LocalTokens.current
    val contexto = LocalContext.current
    val alcance = rememberCoroutineScope()
    val u = vm.usuario ?: return
    AnimatedVisibility(visible, enter = fadeIn(tween(200)), exit = fadeOut(tween(160))) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)).toque(escala = 1f, alTocar = alCerrar))
    }
    AnimatedVisibility(
        visible,
        enter = slideInHorizontally(tween(260)) { -it },
        exit = slideOutHorizontally(tween(200)) { -it },
    ) {
        Column(
            Modifier.fillMaxHeight().fillMaxWidth(0.86f).background(t.sup).statusBarsPadding().navigationBarsPadding()
                .verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Logo(28)
                Spacer(Modifier.weight(1f))
                Box(Modifier.size(48.dp).clip(CircleShape).border(2.dp, Lima, CircleShape).toque(alTocar = alCerrar), contentAlignment = Alignment.Center) {
                    Icon(Iconos.cerrar, "Cerrar menú", modifier = Modifier.size(20.dp))
                }
            }
            Text("${u.nombre} · ${u.email}", color = t.tenue, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp, bottom = 6.dp))
            GrupoMenu("Mis finanzas")
            FilaMenu(Iconos.categorias, "Año") { alVista(Vista.ANIO) }
            GrupoMenu("Herramientas")
            FilaMenu(Iconos.documento, "Informe PDF") { alVista(Vista.INFORME) }
            FilaMenu(Iconos.compartir, "Compartir") { alVista(Vista.COMPARTIR) }
            if (Lectura.disponible) FilaMenu(Iconos.imagen, "Lectura automática de Yape") { Lectura.abrir(contexto) }
            GrupoMenu("Configuración")
            FilaMenu(Iconos.persona, "Mi cuenta") { alVista(Vista.CUENTA) }
            if (u.esAdmin) FilaMenu(Iconos.escudo, "Admin") { alVista(Vista.ADMIN) }
            FilaMenu(Iconos.luna, if (t.oscuro) "Modo claro" else "Modo oscuro") { vm.cambiarTema(!t.oscuro) }
            if (Actualizacion.disponible) FilaMenu(Iconos.descargar, "Buscar actualizaciones · ${BuildConfig.VERSION_NAME}") {
                alcance.launch {
                    Actualizacion.encontrada = Actualizacion.buscar()
                    if (Actualizacion.encontrada == null) vm.aviso = "Tienes la última versión (${BuildConfig.VERSION_NAME})"
                    alCerrar()
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 14.dp), color = t.linea)
            GrupoMenu("Libro")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Selector(vm.libroId.orEmpty(), vm.libros.map { it.id to (it.nombre + if (it.rol != "propietario") " (de ${it.propietario})" else "") }, Modifier.weight(1f)) { vm.elegirLibro(it) }
                Spacer(Modifier.width(10.dp))
                Box(Modifier.size(46.dp).clip(CircleShape).background(Color.White).border(1.dp, t.linea, CircleShape).toque(alTocar = alNuevoLibro), contentAlignment = Alignment.Center) {
                    Icon(Iconos.mas1, "Nuevo libro", tint = SobreLima, modifier = Modifier.size(20.dp))
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 10.dp)) {
                Text("Moneda", color = t.tenue, fontSize = 13.sp, modifier = Modifier.width(70.dp))
                Selector(vm.moneda, MONEDAS, Modifier.weight(1f), habilitado = vm.libro?.rol == "propietario") { vm.cambiarMoneda(it) }
            }
            HorizontalDivider(Modifier.padding(vertical = 14.dp), color = t.linea)
            Row(Modifier.fillMaxWidth().toque(escala = 0.98f, alTocar = alSalir).padding(vertical = 10.dp, horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Iconos.salir, null, tint = Color(0xFFD92D20), modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Text("Cerrar sesión", color = Color(0xFFD92D20), fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

val MONEDAS = listOf("PEN" to "PEN · sol peruano", "USD" to "USD · dólar", "EUR" to "EUR · euro", "MXN" to "MXN · peso mexicano", "COP" to "COP · peso colombiano", "CLP" to "CLP · peso chileno", "ARS" to "ARS · peso argentino")

@Composable
private fun GrupoMenu(titulo: String) {
    Text(titulo.uppercase(), color = LocalTokens.current.tenue, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, top = 14.dp, bottom = 4.dp))
}

@Composable
private fun FilaMenu(icono: ImageVector, titulo: String, alTocar: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).toque(escala = 0.98f, alTocar = alTocar).padding(vertical = 12.dp, horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icono, null, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(14.dp))
        Text(titulo, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}

// ---------- diseño de inicio (como la ventana de la web, con miniaturas) ----------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DialogoDisenoWeb(vm: AppVM, alCerrar: () -> Unit) {
    val t = LocalTokens.current
    val actual = vm.datos?.actual.orEmpty()
    val pendientes = (if (vm.mes == java.time.YearMonth.now()) vm.datos?.pendientes else actual.filter { !it.pagado }).orEmpty()
    val recomendado = disenoRecomendado(actual, pendientes)
    val nombreRecomendado = DISENOS.first { it.id == recomendado }.nombre
    ModalBottomSheet(onDismissRequest = alCerrar, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = t.sup, dragHandle = null) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Diseño de inicio", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
            Text("Elige cómo quieres ver tu pantalla de inicio. Puedes cambiarlo cuando quieras.", color = t.tenue, fontSize = 14.sp)
            DISENOS.forEach { d ->
                val activo = vm.diseno == d.id
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(t.sup)
                        .border(if (activo) 2.dp else 1.dp, if (activo) Lima else t.linea, RoundedCornerShape(18.dp))
                        .toque(escala = 0.98f) {
                            vm.elegirDiseno(d.id)
                            vm.aviso = if (d.id == "auto") "Diseño automático: ahora «$nombreRecomendado»" else "Diseño «${d.nombre}» aplicado"
                            alCerrar()
                        }
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    MiniaturaDiseno(d.id)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(d.nombre, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            if (d.id == "auto") Etiqueta("Ahora: $nombreRecomendado", t.elev, t.tenue)
                            if (d.id == recomendado) Etiqueta("★ Recomendado para ti", Lima, SobreLima)
                        }
                        Text(d.texto, color = t.tenue, fontSize = 13.sp, lineHeight = 17.sp)
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(50.dp).toque(alTocar = alCerrar).clip(RoundedCornerShape(50)).background(t.elev), contentAlignment = Alignment.Center) {
                Text("Cerrar", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun Etiqueta(texto: String, fondo: Color, tinta: Color) {
    Text(texto, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = tinta, maxLines = 1,
        modifier = Modifier.padding(start = 8.dp).clip(RoundedCornerShape(50)).background(fondo).padding(horizontal = 8.dp, vertical = 2.dp))
}

/** Miniatura del orden de cada diseño (la misma que dibuja la web con .diseno-mini). */
@Composable
private fun MiniaturaDiseno(id: String) {
    val t = LocalTokens.current
    val oscuro = Color(0xFF20251A)
    val gris = t.tenue.copy(alpha = 0.5f)
    @Composable fun Bloque(m: Modifier, color: Color) = Box(m.clip(RoundedCornerShape(3.dp)).background(color))
    @Composable fun Fila() = Row(Modifier.fillMaxWidth().height(9.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) { repeat(4) { Bloque(Modifier.weight(1f).fillMaxHeight(), gris) } }
    @Composable fun Lista() = Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(3.dp)) { repeat(3) { Bloque(Modifier.fillMaxWidth().height(4.dp), gris) } }
    Column(Modifier.size(width = 56.dp, height = 52.dp).clip(RoundedCornerShape(10.dp)).background(t.elev).padding(6.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        when (id) {
            "auto" -> Box(Modifier.fillMaxSize().clip(RoundedCornerShape(4.dp)).background(Brush.linearGradient(listOf(Lima, oscuro))))
            "clasico" -> {
                Row(Modifier.fillMaxWidth().height(21.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    Bloque(Modifier.weight(1f).fillMaxHeight(), oscuro)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) { repeat(3) { Bloque(Modifier.fillMaxWidth().height(5.dp), gris) } }
                }
                Bloque(Modifier.fillMaxWidth().height(9.dp), Lima)
            }
            "resumen" -> { Fila(); Bloque(Modifier.fillMaxWidth().height(12.dp), oscuro); Bloque(Modifier.fillMaxWidth().height(6.dp), Lima) }
            "pagos" -> { Fila(); Lista(); Bloque(Modifier.fillMaxWidth().height(9.dp), oscuro) }
            else -> { Bloque(Modifier.fillMaxWidth().height(6.dp), oscuro); Fila(); Lista() }
        }
    }
}
