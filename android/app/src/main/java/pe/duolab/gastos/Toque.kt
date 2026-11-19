package pe.duolab.gastos

import androidx.compose.ui.unit.dp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback

/**
 * Toque al estilo iOS: al presionar, el elemento se hunde un poco (resorte suave) y vibra levemente,
 * sin la onda de Android. Sustituye a `clickable` en botones, tarjetas y filas.
 */
fun Modifier.toque(habilitado: Boolean = true, escala: Float = 0.96f, alTocar: () -> Unit): Modifier = composed {
    val interaccion = remember { MutableInteractionSource() }
    val presionado by interaccion.collectIsPressedAsState()
    val s by animateFloatAsState(
        if (presionado && habilitado) escala else 1f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "toque",
    )
    val vibrar = LocalHapticFeedback.current
    this
        .graphicsLayer { scaleX = s; scaleY = s }
        .clickable(interactionSource = interaccion, indication = null, enabled = habilitado) {
            vibrar.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            alTocar()
        }
}


/**
 * Deslizar a los lados (como pasar páginas): hacia la izquierda → siguiente, hacia la derecha → anterior.
 * Hace falta recorrer 72 dp; vibra suave al cambiar. No choca con el gesto «atrás» del sistema, que nace en el borde.
 */
fun Modifier.deslizar(alSiguiente: () -> Unit, alAnterior: () -> Unit): Modifier = composed {
    val vista = androidx.compose.ui.platform.LocalView.current
    val umbral = with(androidx.compose.ui.platform.LocalDensity.current) { 72.dp.toPx() }
    val siguiente by androidx.compose.runtime.rememberUpdatedState(alSiguiente)
    val anterior by androidx.compose.runtime.rememberUpdatedState(alAnterior)
    pointerInput(Unit) {
        var total = 0f
        detectHorizontalDragGestures(
            onDragStart = { total = 0f },
            onDragEnd = {
                if (total <= -umbral) { vista.performHapticFeedback(android.view.HapticFeedbackConstants.CONTEXT_CLICK); siguiente() }
                else if (total >= umbral) { vista.performHapticFeedback(android.view.HapticFeedbackConstants.CONTEXT_CLICK); anterior() }
            },
            onHorizontalDrag = { cambio, dx -> total += dx; cambio.consume() },
        )
    }
}
