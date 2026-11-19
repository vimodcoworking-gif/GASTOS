package pe.duolab.gastos

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch

/** Más → Configuración: apariencia, notificaciones, inicio y barra, datos del teléfono y acerca de la app. */
@Composable
fun VistaConfiguracion(vm: AppVM, alDiseno: () -> Unit) {
    val contexto = LocalContext.current
    val t = LocalTokens.current
    val a = vm.ajustes
    val cambiar = { nuevo: Ajustes -> vm.cambiarAjustes(nuevo) }
    val alcance = rememberCoroutineScope()
    var permitido by remember {
        mutableStateOf(Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(contexto, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
    }
    val pedir = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { permitido = it }
    var borrar by remember { mutableStateOf(false) }

    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { CabeceraSeccion("Configuración", "Cómo se ve y se comporta la app en este teléfono") }

        item {
            Grupo("Apariencia") {
                Column(Modifier.padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconoCaja(Iconos.luna, t.elev, t.tinta, 36, 11)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("Tema", fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                            Text(if (vm.tema == ModoTema.AUTO) "Cambia solo con el modo del teléfono" else "Siempre ${vm.tema.nombre.lowercase()}", color = t.tenue, fontSize = 12.sp)
                        }
                    }
                    SelectorTema(vm.tema, Modifier.padding(top = 12.dp)) { vm.elegirTema(it) }
                }
                Separador()
                Fila(Iconos.diseno, "Diseño de inicio", DISENOS.firstOrNull { it.id == vm.diseno }?.nombre ?: "Automático", alTocar = alDiseno)
            }
        }

        item {
            Grupo("Notificaciones") {
                if (!permitido) {
                    Fila(Iconos.campana, "Permiso desactivado", "Toca para permitir las notificaciones", colorNota = Color(0xFFE5484D)) {
                        if (Build.VERSION.SDK_INT >= 33) pedir.launch(Manifest.permission.POST_NOTIFICATIONS)
                        else contexto.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, contexto.packageName))
                    }
                    Separador()
                }
                Interruptor(Iconos.campana, "Recibir notificaciones", if (Push.activo(contexto)) "Llegan al instante" else "Se revisa cada 15 minutos", a.notificaciones) { cambiar(a.copy(notificaciones = it)) }
                Separador()
                Interruptor(Iconos.billetera, "Movimientos que llegan solos", "Gmail, Yape, WhatsApp u otra persona del libro", a.movimientos, habilitado = a.notificaciones) { cambiar(a.copy(movimientos = it)) }
                Separador()
                Interruptor(Iconos.reloj, "Pagos por vencer", "Recordatorios de tus pagos pendientes", a.pagos, habilitado = a.notificaciones) { cambiar(a.copy(pagos = it)) }
                Separador()
                Interruptor(Iconos.descargar, "Actualizaciones de la app", "Cuando hay una versión nueva", a.actualizaciones, habilitado = a.notificaciones) { cambiar(a.copy(actualizaciones = it)) }
                Separador()
                Interruptor(Iconos.luna, "Silencio de noche", "De 22:00 a 7:00 llegan sin sonido", a.silencioNoche, habilitado = a.notificaciones) { cambiar(a.copy(silencioNoche = it)) }
                Separador()
                Fila(Iconos.check, "Probar notificación", "Manda una de prueba a este teléfono") {
                    alcance.launch {
                        if (Push.activo(contexto)) runCatching { Api.post("/push/prueba") }.onFailure { vm.aviso = it.message }.onSuccess { vm.aviso = "Enviada: llega en unos segundos" }
                        else { Avisos.mostrar(contexto, "🔔 Notificaciones activadas", "Así te avisaré de cada gasto o ingreso que llegue solo.", "prueba"); vm.aviso = "Notificación de prueba enviada" }
                    }
                }
                Separador()
                Fila(Iconos.diseno, "Ajustes del teléfono", "Sonido, vibración y estilo de cada aviso") {
                    contexto.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, contexto.packageName))
                }
            }
        }

        item {
            Grupo("Inicio y apartados") {
                Column(Modifier.padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconoCaja(Iconos.casa, t.elev, t.tinta, 36, 11)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("Al abrir la app, mostrar", fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                            Text("La pestaña del inicio que se abre primero", color = t.tenue, fontSize = 12.sp)
                        }
                    }
                    FlowRowSimple(Modifier.padding(top = 12.dp)) {
                        SeccionMes.entries.forEach { s ->
                            val activo = a.seccion == s
                            Text(s.titulo, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (activo) SobreLima else t.tinta,
                                modifier = Modifier.clip(RoundedCornerShape(50)).background(if (activo) Lima else t.elev).toque { cambiar(a.copy(seccionInicio = s.name)) }.padding(horizontal = 12.dp, vertical = 8.dp))
                        }
                    }
                }
                Separador()
                Interruptor(Iconos.meta, "Metas en la barra", "Ahorros y objetivos", a.verMetas) { cambiar(a.copy(verMetas = it)) }
                Separador()
                Interruptor(Iconos.categorias, "Categorías en la barra", "Presupuesto por categoría", a.verCategorias) { cambiar(a.copy(verCategorias = it)) }
                Separador()
                Interruptor(Iconos.asistente, "Asistente en la barra", "Preguntas y registros con IA", a.verAsistente) { cambiar(a.copy(verAsistente = it)) }
            }
        }

        item {
            Grupo("Datos en este teléfono") {
                Fila(Iconos.deshacer, "Actualizar ahora", "Vuelve a traer tus datos del servidor") { vm.refrescar(); vm.aviso = "Datos actualizados" }
                Separador()
                Fila(Iconos.cerrar, "Borrar la copia del teléfono", "Libera espacio; tus datos siguen en tu cuenta", colorTitulo = Color(0xFFD92D20)) { borrar = true }
            }
        }

        item {
            Grupo("Acerca de") {
                Fila(Iconos.libro, "DUOLAB Gastos", "Versión ${BuildConfig.VERSION_NAME}", flecha = false) {}
                if (Actualizacion.disponible) {
                    Separador()
                    Fila(Iconos.descargar, "Buscar actualizaciones", "Descarga la versión más reciente") {
                        alcance.launch {
                            Actualizacion.encontrada = Actualizacion.buscar()
                            if (Actualizacion.encontrada == null) vm.aviso = "Tienes la última versión (${BuildConfig.VERSION_NAME})"
                        }
                    }
                }
                Separador()
                Fila(Iconos.escudo, "Privacidad y términos", "Cómo se usan y protegen tus datos") {
                    contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Api.BASE + "/privacidad")))
                }
            }
        }
    }

    if (borrar) {
        AlertDialog(
            onDismissRequest = { borrar = false },
            title = { Text("¿Borrar la copia del teléfono?") },
            text = { Text("La app volverá a descargar tus datos. No se borra nada de tu cuenta.") },
            confirmButton = { TextButton(onClick = { borrar = false; vm.borrarCopiaLocal() }) { Text("Borrar", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { borrar = false }) { Text("Cancelar") } },
        )
    }
}

/** Claro · Oscuro · Automático, como un control segmentado. */
@Composable
fun SelectorTema(actual: ModoTema, modifier: Modifier = Modifier, alElegir: (ModoTema) -> Unit) {
    val t = LocalTokens.current
    Row(modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(t.elev).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        ModoTema.entries.forEach { m ->
            val activo = m == actual
            Box(Modifier.weight(1f).heightIn(min = 38.dp).clip(RoundedCornerShape(50)).background(if (activo) Lima else Color.Transparent).toque { alElegir(m) }.padding(horizontal = 6.dp),
                contentAlignment = Alignment.Center) {
                TextoAjustable(m.nombre, if (activo) SobreLima else t.tinta, 14, 10, if (activo) FontWeight.Bold else FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun Grupo(titulo: String, contenido: @Composable ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    Column {
        Text(titulo.uppercase(), color = t.tenue, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 6.dp, bottom = 6.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(t.sup), content = contenido)
    }
}

@Composable
private fun Separador() = HorizontalDivider(color = LocalTokens.current.linea, modifier = Modifier.padding(start = 62.dp))

@Composable
private fun Fila(icono: ImageVector, titulo: String, nota: String, colorTitulo: Color? = null, colorNota: Color? = null, flecha: Boolean = true, alTocar: () -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().toque(escala = 0.99f, alTocar = alTocar).padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        IconoCaja(icono, t.elev, colorTitulo ?: t.tinta, 36, 11)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = colorTitulo ?: t.tinta, maxLines = 1)
            Text(nota, color = colorNota ?: t.tenue, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (flecha) Icon(Iconos.flechaDer, null, tint = t.tenue, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun Interruptor(icono: ImageVector, titulo: String, nota: String, valor: Boolean, habilitado: Boolean = true, alCambiar: (Boolean) -> Unit) {
    val t = LocalTokens.current
    val alfa = if (habilitado) 1f else 0.45f
    Row(Modifier.fillMaxWidth().toque(habilitado, escala = 0.99f) { alCambiar(!valor) }.padding(start = 14.dp, end = 10.dp, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        IconoCaja(icono, t.elev, t.tinta.copy(alpha = alfa), 36, 11)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = t.tinta.copy(alpha = alfa))
            Text(nota, color = t.tenue.copy(alpha = alfa), fontSize = 12.sp, maxLines = 2)
        }
        Switch(valor, alCambiar, enabled = habilitado, colors = SwitchDefaults.colors(checkedTrackColor = Lima, checkedThumbColor = SobreLima))
    }
}

/** Fila que pasa a la siguiente línea cuando no caben los elementos. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRowSimple(modifier: Modifier = Modifier, contenido: @Composable () -> Unit) {
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { contenido() }
}
