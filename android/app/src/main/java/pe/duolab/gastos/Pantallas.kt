package pe.duolab.gastos

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.YearMonth

private fun abrirWeb(contexto: Context, ruta: String) {
    contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Api.BASE + ruta)))
}

@Composable
private fun Logo(alto: Int = 26) {
    Image(
        painterResource(if (isSystemInDarkTheme()) R.drawable.logo_blanco else R.drawable.logo_negro),
        contentDescription = "DUOLAB",
        modifier = Modifier.height(alto.dp),
    )
}

@Composable
fun Raiz(vm: AppVM) {
    val avisos = remember { SnackbarHostState() }
    LaunchedEffect(vm.aviso) {
        vm.aviso?.let {
            avisos.showSnackbar(it)
            vm.aviso = null
        }
    }
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        when {
            vm.arrancando -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Logo(40)
                    Spacer(Modifier.height(24.dp))
                    CircularProgressIndicator(color = Lima)
                }
            }
            vm.usuario == null -> PantallaEntrar(vm)
            else -> Principal(vm, avisos)
        }
        if (vm.usuario == null) SnackbarHost(avisos, Modifier.align(Alignment.BottomCenter).padding(16.dp))
    }
}

// ---------- entrar ----------

@Composable
fun PantallaEntrar(vm: AppVM) {
    val contexto = LocalContext.current
    var email by rememberSaveable { mutableStateOf("") }
    var clave by rememberSaveable { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().statusBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(32.dp))
        Logo(34)
        Text("Tus gastos, ingresos y pagos al día.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 16.sp)
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = { abrirWeb(contexto, "/api/auth/google?app=android") },
            modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(50),
            colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color(0xFF1F1F1F)),
        ) { Text("G   Continuar con Google", fontWeight = FontWeight.Bold, fontSize = 16.sp) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            HorizontalDivider(Modifier.weight(1f))
            Text("  o con tu correo  ", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            HorizontalDivider(Modifier.weight(1f))
        }
        OutlinedTextField(
            value = email, onValueChange = { email = it }, label = { Text("Correo") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
        )
        OutlinedTextField(
            value = clave, onValueChange = { clave = it }, label = { Text("Contraseña") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
        )
        Button(
            onClick = { vm.entrar(email, clave) },
            enabled = email.contains("@") && clave.isNotEmpty() && !vm.ocupado,
            modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(50),
            colors = ButtonDefaults.buttonColors(containerColor = Lima, contentColor = SobreLima),
        ) { Text(if (vm.ocupado) "Entrando…" else "Entrar", fontWeight = FontWeight.Bold, fontSize = 16.sp) }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { abrirWeb(contexto, "/") }) { Text("Crear una cuenta") }
            TextButton(onClick = { abrirWeb(contexto, "/") }) { Text("¿Olvidaste tu contraseña?") }
        }
        if (vm.ocupado) Text("Si DUOLAB estaba dormido puede tardar hasta un minuto la primera vez.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
    }
}

// ---------- estructura principal ----------

private enum class Seccion(val titulo: String) { INICIO("Inicio"), MOVIMIENTOS("Movimientos"), PENDIENTES("Pendientes"), MAS("Más") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Principal(vm: AppVM, avisos: SnackbarHostState) {
    var seccion by rememberSaveable { mutableStateOf(Seccion.INICIO) }
    var edicion by remember { mutableStateOf<Edicion?>(null) }
    val editar = vm.libro?.puedeEditar == true
    val pendientes = vm.datos?.pendientes?.size ?: 0

    Scaffold(
        snackbarHost = { SnackbarHost(avisos) },
        floatingActionButton = {
            if (editar && (seccion == Seccion.INICIO || seccion == Seccion.MOVIMIENTOS)) {
                FloatingActionButton(onClick = { edicion = Edicion(null, "gasto") }, containerColor = Lima, contentColor = SobreLima) { Icon(Icons.Filled.Add, "Nuevo movimiento") }
            }
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                val colores = NavigationBarItemDefaults.colors(selectedIconColor = SobreLima, indicatorColor = Lima)
                NavigationBarItem(seccion == Seccion.INICIO, { seccion = Seccion.INICIO }, { Icon(Icons.Filled.Home, null) }, label = { Text("Inicio") }, colors = colores)
                NavigationBarItem(seccion == Seccion.MOVIMIENTOS, { seccion = Seccion.MOVIMIENTOS }, { Icon(Icons.Filled.List, null) }, label = { Text("Movimientos") }, colors = colores)
                NavigationBarItem(
                    seccion == Seccion.PENDIENTES, { seccion = Seccion.PENDIENTES },
                    {
                        BadgedBox(badge = { if (pendientes > 0) Badge(containerColor = Rojo, contentColor = Color.White) { Text("$pendientes") } }) {
                            Icon(Icons.Filled.CheckCircle, null)
                        }
                    },
                    label = { Text("Pendientes", maxLines = 1) }, colors = colores,
                )
                NavigationBarItem(seccion == Seccion.MAS, { seccion = Seccion.MAS }, { Icon(Icons.Filled.Menu, null) }, label = { Text("Más") }, colors = colores)
            }
        },
    ) { relleno ->
        PullToRefreshBox(isRefreshing = vm.cargando, onRefresh = vm::refrescar, modifier = Modifier.padding(relleno).fillMaxSize()) {
            when (seccion) {
                Seccion.INICIO -> Inicio(vm, alEditar = { edicion = it }, alVer = { seccion = it })
                Seccion.MOVIMIENTOS -> ListaMovimientos(vm) { edicion = Edicion(it) }
                Seccion.PENDIENTES -> ListaPendientes(vm) { edicion = Edicion(it) }
                Seccion.MAS -> Mas(vm)
            }
        }
    }
    edicion?.let { e -> if (editar) FormularioMovimiento(vm, e) { edicion = null } else edicion = null }
}

/** Cabecera de cada sección: logo y libro activo. */
private fun LazyListScope.cabecera(vm: AppVM) {
    item {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Logo()
            Spacer(Modifier.weight(1f))
            vm.libro?.let { Text("${it.nombre} · ${it.moneda}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp) }
        }
    }
}

private val RELLENO_LISTA = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp)

// ---------- inicio ----------

@Composable
private fun Inicio(vm: AppVM, alEditar: (Edicion) -> Unit, alVer: (Seccion) -> Unit) {
    val datos = vm.datos
    val actual = datos?.actual.orEmpty()
    val t = Totales.de(actual)
    val esMesActual = vm.mes == YearMonth.now()
    val fin = if (esMesActual) LocalDate.now() else vm.mes.atEndOfMonth()
    val semana = (6 downTo 0).map { fin.minusDays(it.toLong()) }.map { d -> d to actual.filter { it.esGasto && it.fecha == d }.sumOf { it.monto } }
    val editar = vm.libro?.puedeEditar == true

    LazyColumn(contentPadding = RELLENO_LISTA, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        cabecera(vm)
        item {
            Surface(shape = RoundedCornerShape(30.dp), color = Color.Transparent) {
                Column(
                    Modifier
                        .background(Brush.verticalGradient(listOf(Color(0xFF262B21), Color(0xFF13160F))))
                        .padding(16.dp),
                ) {
                    SelectorMes(vm.mes, vm::cambiarMes, vm::irAHoy, color = Color.White)
                    Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(top = 6.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(dinero(t.balance, vm.moneda), color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
                            Text(
                                if (t.balance < 0) "↗ Gastas más de lo que entra" else "↙ Balance del mes en positivo",
                                color = if (t.balance < 0) Color(0xFFFF8A7A) else Lima, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    GraficaSemana(semana)
                    Text(
                        "Últimos 7 días: ${dinero(semana.sumOf { it.second }, vm.moneda)}",
                        color = Tenue, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp),
                    )
                    if (editar) {
                        Spacer(Modifier.height(14.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Button(
                                onClick = { alEditar(Edicion(null, "gasto")) }, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(50),
                                colors = ButtonDefaults.buttonColors(containerColor = Lima, contentColor = SobreLima),
                            ) { Text("↗  Gasto", fontWeight = FontWeight.Bold, fontSize = 16.sp) }
                            OutlinedButton(onClick = { alEditar(Edicion(null, "ingreso")) }, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(50)) {
                                Text("↙  Ingreso", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color.White)
                            }
                        }
                    }
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TarjetaTotal(
                    "Ingresos", dinero(t.ingresos, vm.moneda),
                    if (t.ingresosPendientes > 0) "${dinero(t.ingresosPendientes, vm.moneda)} por recibir" else "Todo recibido",
                    Verde, Modifier.weight(1f), progreso = if (t.ingresos > 0) ((t.ingresos - t.ingresosPendientes) / t.ingresos).toFloat() else 0f,
                )
                TarjetaTotal(
                    "Gastos", dinero(t.gastos, vm.moneda),
                    "${if (t.gastos > 0) ((t.gastos - t.gastosPendientes) / t.gastos * 100).toInt() else 0} % pagado",
                    Rojo, Modifier.weight(1f), progreso = if (t.gastos > 0) ((t.gastos - t.gastosPendientes) / t.gastos).toFloat() else 0f,
                )
            }
        }
        item {
            val proximo = Totales.de(datos?.proximo.orEmpty())
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TarjetaTotal(
                    "Falta por pagar", dinero(t.gastosPendientes, vm.moneda),
                    "${actual.count { it.esGasto && !it.pagado }} pagos pendientes", Naranja, Modifier.weight(1f).clickable { alVer(Seccion.PENDIENTES) },
                )
                TarjetaTotal(
                    "Próximo mes", dinero(proximo.balance, vm.moneda),
                    "${nombreMesCorto(vm.mes.plusMonths(1))}: ${dinero(proximo.gastos, vm.moneda)} en gastos",
                    if (proximo.balance < 0) Rojo else MaterialTheme.colorScheme.onSurface, Modifier.weight(1f).clickable { vm.cambiarMes(1) },
                )
            }
        }
        if (datos == null) {
            item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Lima) } }
        } else {
            val porPagar = datos.pendientes.take(3)
            if (porPagar.isNotEmpty()) {
                item { TituloLista("Lo que falta pagar o cobrar", "Ver todo") { alVer(Seccion.PENDIENTES) } }
                items(porPagar, key = { "p" + it.id }) { m ->
                    Tarjeta { FilaMovimiento(m, vm.moneda, alTocar = { alEditar(Edicion(m)) }, alPagar = if (editar) ({ vm.marcarPagado(m) }) else null) }
                }
            }
            item { TituloLista("Últimos movimientos", if (actual.size > 8) "Ver todos" else null) { alVer(Seccion.MOVIMIENTOS) } }
            val ultimos = actual.sortedWith(compareByDescending<Movimiento> { it.fecha }).take(8)
            if (ultimos.isEmpty()) item { Vacio("Aún no hay movimientos en ${nombreMesCorto(vm.mes).lowercase(ES)}.") }
            items(ultimos, key = { it.id }) { m -> Tarjeta { FilaMovimiento(m, vm.moneda, alTocar = { alEditar(Edicion(m)) }) } }
        }
    }
}

@Composable
private fun Tarjeta(contenido: @Composable () -> Unit) {
    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainer, modifier = Modifier.fillMaxWidth()) { contenido() }
}

@Composable
private fun TituloLista(titulo: String, accion: String?, alTocar: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(top = 8.dp, start = 4.dp)) {
        Text(titulo, fontWeight = FontWeight.Bold, fontSize = 17.sp, modifier = Modifier.weight(1f))
        if (accion != null) TextButton(onClick = alTocar) { Text(accion) }
    }
}

@Composable
private fun Vacio(texto: String) {
    Text(texto, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth().padding(24.dp))
}

// ---------- movimientos ----------

@Composable
private fun ListaMovimientos(vm: AppVM, alTocar: (Movimiento) -> Unit) {
    var filtro by rememberSaveable { mutableStateOf("todos") }
    val actual = vm.datos?.actual.orEmpty().filter { filtro == "todos" || it.tipo == filtro }
    val porDia = actual.groupBy { it.fecha }.toSortedMap(compareByDescending { it })
    val t = Totales.de(vm.datos?.actual.orEmpty())

    LazyColumn(contentPadding = RELLENO_LISTA, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        cabecera(vm)
        item { SelectorMes(vm.mes, vm::cambiarMes, vm::irAHoy) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                listOf("todos" to "Todos", "gasto" to "Gastos · ${dinero(t.gastos, vm.moneda)}", "ingreso" to "Ingresos · ${dinero(t.ingresos, vm.moneda)}").forEach { (clave, texto) ->
                    FilterChip(selected = filtro == clave, onClick = { filtro = clave }, label = { Text(texto, maxLines = 1) }, colors = chipLima())
                }
            }
        }
        if (vm.datos == null) item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Lima) } }
        else if (porDia.isEmpty()) item { Vacio("No hay movimientos este mes.") }
        porDia.forEach { (dia, lista) ->
            item(key = "d$dia") {
                val gasto = lista.filter { it.esGasto }.sumOf { it.monto }
                val ingreso = lista.filter { !it.esGasto }.sumOf { it.monto }
                Row(Modifier.fillMaxWidth().padding(start = 4.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(fechaLarga(dia), fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    if (ingreso > 0) Text("+${dinero(ingreso, vm.moneda)}  ", color = Verde, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    if (gasto > 0) Text("-${dinero(gasto, vm.moneda)}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            items(lista, key = { it.id }) { m -> Tarjeta { FilaMovimiento(m, vm.moneda, alTocar = { alTocar(m) }) } }
        }
    }
}

// ---------- pendientes ----------

@Composable
private fun ListaPendientes(vm: AppVM, alTocar: (Movimiento) -> Unit) {
    val lista = vm.datos?.pendientes.orEmpty()
    val editar = vm.libro?.puedeEditar == true
    val hoy = LocalDate.now()
    LazyColumn(contentPadding = RELLENO_LISTA, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        cabecera(vm)
        item {
            Column(Modifier.padding(4.dp)) {
                Text("Pagos y cobros pendientes", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                Text("Vencidos y de los próximos 30 días. Toca ✓ cuando lo pagues o cobres.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            }
        }
        if (vm.datos == null) item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Lima) } }
        else if (lista.isEmpty()) item { Vacio("No hay nada pendiente. ¡Todo al día!") }
        val vencidos = lista.filter { it.fecha.isBefore(hoy) }
        val proximos = lista.filter { !it.fecha.isBefore(hoy) }
        if (vencidos.isNotEmpty()) item { Text("Vencidos", color = Rojo, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 4.dp, top = 8.dp)) }
        items(vencidos, key = { it.id }) { m -> Tarjeta { FilaMovimiento(m, vm.moneda, { alTocar(m) }, if (editar) ({ vm.marcarPagado(m) }) else null) } }
        if (proximos.isNotEmpty()) item { Text("Próximos", fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 4.dp, top = 8.dp)) }
        items(proximos, key = { it.id }) { m -> Tarjeta { FilaMovimiento(m, vm.moneda, { alTocar(m) }, if (editar) ({ vm.marcarPagado(m) }) else null) } }
    }
}

// ---------- más ----------

@Composable
private fun Mas(vm: AppVM) {
    val contexto = LocalContext.current
    var eligiendoLibro by remember { mutableStateOf(false) }
    var confirmarSalir by remember { mutableStateOf(false) }
    val u = vm.usuario ?: return

    LazyColumn(contentPadding = RELLENO_LISTA, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        cabecera(vm)
        item {
            Tarjeta {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(48.dp).clip(RoundedCornerShape(50)).background(Lima), contentAlignment = Alignment.Center) {
                        Text(u.nombre.take(1).uppercase(), color = SobreLima, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    }
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(u.nombre, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                        Text(u.email, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                    }
                }
            }
        }
        item { Opcion("Libro", vm.libro?.let { "${it.nombre} · ${it.moneda}" } ?: "—") { eligiendoLibro = true } }
        item {
            if (Lectura.disponible) {
                Opcion("Lectura automática de Yape", "Registra solos los avisos de Yape, Plin y tu banco") { Lectura.abrir(contexto) }
            } else {
                Opcion("Yape automático", "Con MacroDroid o el atajo de iPhone: ver cómo en Mi cuenta") { abrirWeb(contexto, "/?vista=cuenta") }
            }
        }
        item { Text("Más funciones (se abren en la web)", fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
        val web = buildList {
            add(Triple("Calendario y gráficas", "Gastos por día, categoría y medio de pago", "/?vista=mes&seccion=calendario"))
            add(Triple("Resumen del año", "Ingresos y gastos de cada mes", "/?vista=anio"))
            add(Triple("Metas de ahorro", "Objetivos, aportes y retiros", "/?vista=metas"))
            add(Triple("Categorías y presupuestos", "Límite mensual por categoría", "/?vista=categorias"))
            add(Triple("Asistente IA", "Pregúntale por tus gastos", "/?vista=asistente"))
            add(Triple("Informe PDF y compartir", "Estado de cuenta por WhatsApp o correo", "/?vista=informe"))
            add(Triple("Mi cuenta", "WhatsApp, recordatorios, Gmail y avisos del teléfono", "/?vista=cuenta"))
            if (u.esAdmin) add(Triple("Administración", "Usuarios, WhatsApp, IA y almacenamiento", "/?vista=admin"))
        }
        items(web) { (titulo, nota, ruta) -> Opcion(titulo, nota) { abrirWeb(contexto, ruta) } }
        item {
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { confirmarSalir = true }, modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(50)) {
                Text("Cerrar sesión", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
            }
            Text("DUOLAB para Android · versión ${version(contexto)}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp, start = 4.dp))
        }
    }

    if (eligiendoLibro) {
        AlertDialog(
            onDismissRequest = { eligiendoLibro = false },
            title = { Text("Elige el libro") },
            text = {
                Column {
                    vm.libros.forEach { l ->
                        Text(
                            (if (l.id == vm.libroId) "✓  " else "     ") + "${l.nombre} · ${l.moneda}" + if (l.rol != "propietario") "  (de ${l.propietario})" else "",
                            modifier = Modifier.fillMaxWidth().clickable { vm.elegirLibro(l.id); eligiendoLibro = false }.padding(vertical = 12.dp),
                            fontWeight = if (l.id == vm.libroId) FontWeight.Bold else FontWeight.Normal,
                        )
                    }
                }
            },
            confirmButton = { TextButton(onClick = { eligiendoLibro = false }) { Text("Cerrar") } },
        )
    }
    if (confirmarSalir) {
        AlertDialog(
            onDismissRequest = { confirmarSalir = false },
            title = { Text("¿Cerrar sesión?") },
            text = { Text("Tendrás que volver a entrar con tu correo o con Google.") },
            confirmButton = { TextButton(onClick = { confirmarSalir = false; vm.cerrarSesion() }) { Text("Cerrar sesión", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { confirmarSalir = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun Opcion(titulo: String, nota: String, alTocar: () -> Unit) {
    Tarjeta {
        Row(Modifier.clickable(onClick = alTocar).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(titulo, fontWeight = FontWeight.SemiBold)
                Text(nota, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            }
            Text("›", fontSize = 22.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun version(contexto: Context): String =
    runCatching { contexto.packageManager.getPackageInfo(contexto.packageName, 0).versionName }.getOrNull() ?: ""
