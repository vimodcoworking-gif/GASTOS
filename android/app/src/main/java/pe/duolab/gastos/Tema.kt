package pe.duolab.gastos

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Colores de la marca DUOLAB (los mismos de la web).
val Lima = Color(0xFFC6F432)
val SobreLima = Color(0xFF141810)
val FondoOscuro = Color(0xFF12150E)
val PanelOscuro = Color(0xFF1F231A)
val PanelOscuro2 = Color(0xFF2B3024)
val Tenue = Color(0xFFA7AE9B)
val Rojo = Color(0xFFE5484D)
val Verde = Color(0xFF3FAE5A)
val Naranja = Color(0xFFF2A516)

private val Oscuro = darkColorScheme(
    primary = Lima, onPrimary = SobreLima,
    secondary = Lima, onSecondary = SobreLima,
    background = FondoOscuro, onBackground = Color(0xFFF3F6EE),
    surface = FondoOscuro, onSurface = Color(0xFFF3F6EE),
    surfaceVariant = PanelOscuro, onSurfaceVariant = Tenue,
    surfaceContainer = PanelOscuro, surfaceContainerHigh = PanelOscuro2, surfaceContainerLow = PanelOscuro,
    outline = Color(0xFF3A4031), error = Color(0xFFFF6B5B),
)

private val Claro = lightColorScheme(
    primary = Color(0xFF4F6B00), onPrimary = Color.White,
    primaryContainer = Lima, onPrimaryContainer = SobreLima,
    secondary = Lima, onSecondary = SobreLima,
    background = Color(0xFFEEF0E8), onBackground = Color(0xFF15180F),
    surface = Color(0xFFEEF0E8), onSurface = Color(0xFF15180F),
    surfaceVariant = Color.White, onSurfaceVariant = Color(0xFF656B5A),
    surfaceContainer = Color.White, surfaceContainerHigh = Color(0xFFF0F2EA), surfaceContainerLow = Color.White,
    outline = Color(0xFFD9DCD0), error = Rojo,
)

@Composable
fun DuolabTema(contenido: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Oscuro else Claro, content = contenido)
}
