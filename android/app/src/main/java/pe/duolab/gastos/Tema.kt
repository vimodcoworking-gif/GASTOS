package pe.duolab.gastos

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.material3.Typography
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight

// Colores de la marca DUOLAB: los mismos tokens que public/styles.css (--t-fondo, --t-sup, --t-elev…).
val Lima = Color(0xFFC6F432)
val SobreLima = Color(0xFF141810)
val FondoOscuro = Color(0xFF12150E)
val PanelOscuro = Color(0xFF1F231A)
val PanelOscuro2 = Color(0xFF2B3024)
val Tenue = Color(0xFFA7AE9B)
val Rojo = Color(0xFFE5484D)
val Verde = Color(0xFF3FAE5A)
val Naranja = Color(0xFFF2A516)

/** Tokens de la web para el tema activo. */
data class Tokens(val fondo: Color, val sup: Color, val elev: Color, val tinta: Color, val tenue: Color, val linea: Color, val oscuro: Boolean)

private val TokensOscuro = Tokens(FondoOscuro, PanelOscuro, PanelOscuro2, Color(0xFFF1F4EA), Color(0xFF959B8A), Color(0xFF30362A), true)
private val TokensClaro = Tokens(Color(0xFFEEF0E8), Color.White, Color(0xFFF0F2EA), Color(0xFF151810), Color(0xFF656B5A), Color(0xFFE2E5D9), false)

val LocalTokens = staticCompositionLocalOf { TokensClaro }

/** Manrope, la misma letra de la web (Google Fonts, licencia OFL), en sus pesos 400 a 800. */
@OptIn(ExperimentalTextApi::class)
val Manrope = FontFamily(
    listOf(400, 500, 600, 700, 800).map { w ->
        Font(R.font.manrope, FontWeight(w), variationSettings = FontVariation.Settings(FontVariation.weight(w)))
    } + Font(R.font.manrope, FontWeight.Black, variationSettings = FontVariation.Settings(FontVariation.weight(800))),
)

private fun TextStyle.conManrope() = copy(fontFamily = Manrope, letterSpacing = letterSpacing)

private val TipografiaWeb = Typography().run {
    Typography(
        displayLarge.conManrope(), displayMedium.conManrope(), displaySmall.conManrope(),
        headlineLarge.conManrope(), headlineMedium.conManrope(), headlineSmall.conManrope(),
        titleLarge.conManrope(), titleMedium.conManrope(), titleSmall.conManrope(),
        bodyLarge.conManrope(), bodyMedium.conManrope(), bodySmall.conManrope(),
        labelLarge.conManrope(), labelMedium.conManrope(), labelSmall.conManrope(),
    )
}

@Composable
fun DuolabTema(oscuroElegido: Boolean? = null, contenido: @Composable () -> Unit) {
    val t = if (oscuroElegido ?: isSystemInDarkTheme()) TokensOscuro else TokensClaro
    val esquema = if (t.oscuro) {
        darkColorScheme(
            primary = Lima, onPrimary = SobreLima, secondary = Lima, onSecondary = SobreLima,
            background = t.fondo, onBackground = t.tinta, surface = t.fondo, onSurface = t.tinta,
            surfaceVariant = t.sup, onSurfaceVariant = t.tenue, surfaceContainer = t.sup, surfaceContainerHigh = t.elev,
            surfaceContainerLow = t.sup, surfaceContainerHighest = t.elev, outline = t.linea, outlineVariant = t.linea, error = Color(0xFFFF6B5B),
        )
    } else {
        lightColorScheme(
            primary = Color(0xFF4F6B00), onPrimary = Color.White, primaryContainer = Lima, onPrimaryContainer = SobreLima,
            secondary = Lima, onSecondary = SobreLima, background = t.fondo, onBackground = t.tinta, surface = t.fondo, onSurface = t.tinta,
            surfaceVariant = t.sup, onSurfaceVariant = t.tenue, surfaceContainer = t.sup, surfaceContainerHigh = t.elev,
            surfaceContainerLow = t.sup, surfaceContainerHighest = t.elev, outline = t.linea, outlineVariant = t.linea, error = Rojo,
        )
    }
    CompositionLocalProvider(LocalTokens provides t) {
        MaterialTheme(colorScheme = esquema, typography = TipografiaWeb, content = contenido)
    }
}
