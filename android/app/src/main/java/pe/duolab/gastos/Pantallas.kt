package pe.duolab.gastos

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun Logo(alto: Int = 26) {
    Image(painterResource(if (LocalTokens.current.oscuro) R.drawable.logo_blanco else R.drawable.logo_negro), "DUOLAB", Modifier.height(alto.dp))
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
    var verActualizacion by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) { Actualizacion.encontrada = Actualizacion.buscar() }
    Box(Modifier.fillMaxSize().background(LocalTokens.current.fondo)) {
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
    if (verActualizacion && Actualizacion.encontrada != null) DialogoActualizacion { verActualizacion = false }
}

/** Campo como los de la web: etiqueta encima y caja redondeada. */
@Composable
fun Campo(
    etiqueta: String, valor: String, alCambiar: (String) -> Unit, modifier: Modifier = Modifier,
    teclado: KeyboardType = KeyboardType.Text, clave: Boolean = false, pista: String? = null, habilitado: Boolean = true,
) {
    val t = LocalTokens.current
    Column(modifier.fillMaxWidth()) {
        Text(etiqueta, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = t.tinta, modifier = Modifier.padding(bottom = 6.dp))
        OutlinedTextField(
            value = valor, onValueChange = alCambiar, singleLine = true, enabled = habilitado,
            placeholder = pista?.let { { Text(it, color = t.tenue) } },
            visualTransformation = if (clave) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = teclado, imeAction = ImeAction.Next),
            shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Lima, unfocusedBorderColor = t.linea, focusedContainerColor = t.elev, unfocusedContainerColor = t.elev, disabledContainerColor = t.elev),
        )
    }
}

@Composable
fun BotonLima(texto: String, modifier: Modifier = Modifier, habilitado: Boolean = true, alTocar: () -> Unit) {
    Box(
        modifier.fillMaxWidth().height(52.dp).toque(habilitado, alTocar = alTocar).clip(RoundedCornerShape(50)).background(if (habilitado) Lima else Lima.copy(alpha = 0.4f)),
        contentAlignment = Alignment.Center,
    ) { TextoAjustable(texto, if (habilitado) SobreLima else SobreLima.copy(alpha = 0.6f), 16, 11, FontWeight.Bold, Modifier.padding(horizontal = 12.dp)) }
}

@Composable
fun BotonSuave(texto: String, modifier: Modifier = Modifier, peligro: Boolean = false, habilitado: Boolean = true, alTocar: () -> Unit) {
    val t = LocalTokens.current
    Box(
        modifier.height(46.dp).toque(habilitado, alTocar = alTocar).clip(RoundedCornerShape(50)).background(t.elev).padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) { TextoAjustable(texto, (if (peligro) Color(0xFFE5484D) else t.tinta).copy(alpha = if (habilitado) 1f else 0.4f), 15, 10, FontWeight.SemiBold) }
}

private enum class ModoEntrar { ENTRAR, CREAR, OLVIDE, CODIGO }

// ---------- entrar (igual que la pantalla de acceso de la web) ----------

@Composable
fun PantallaEntrar(vm: AppVM) {
    val contexto = LocalContext.current
    val t = LocalTokens.current
    var modo by rememberSaveable { mutableStateOf(ModoEntrar.ENTRAR) }
    var nombre by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var whatsapp by rememberSaveable { mutableStateOf("") }
    var codigo by rememberSaveable { mutableStateOf("") }
    var clave by rememberSaveable { mutableStateOf("") }
    val correoOk = email.contains("@") && email.contains(".")

    Column(
        Modifier.fillMaxSize().statusBarsPadding().imePadding().verticalScroll(rememberScrollState()).wrapContentWidth().widthIn(max = 480.dp).padding(horizontal = 20.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(24.dp))
        Logo(44)
        Text("Registro de gastos, ingresos y próximos pagos.", color = t.tenue, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 10.dp, bottom = 22.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(t.sup).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                when (modo) { ModoEntrar.ENTRAR -> "Entrar"; ModoEntrar.CREAR -> "Crear cuenta"; ModoEntrar.OLVIDE -> "Recuperar contraseña"; ModoEntrar.CODIGO -> "Nueva contraseña" },
                fontWeight = FontWeight.ExtraBold, fontSize = 22.sp,
            )
            if (modo == ModoEntrar.CREAR) Campo("Nombre", nombre, { nombre = it.take(60) })
            Campo("Correo", email, { email = it.trim() }, teclado = KeyboardType.Email, habilitado = modo != ModoEntrar.CODIGO)
            if (modo == ModoEntrar.CREAR) Campo("WhatsApp (con código de país)", whatsapp, { whatsapp = it.take(24) }, teclado = KeyboardType.Phone, pista = "51 987 654 321")
            if (modo == ModoEntrar.CODIGO) Campo("Código de 6 dígitos", codigo, { codigo = it.filter(Char::isDigit).take(8) }, teclado = KeyboardType.Number, pista = "123456")
            if (modo != ModoEntrar.OLVIDE) Campo(if (modo == ModoEntrar.ENTRAR) "Contraseña" else "Contraseña nueva (mínimo 8)", clave, { clave = it.take(72) }, teclado = KeyboardType.Password, clave = true)
            if (modo == ModoEntrar.OLVIDE) Text("Te enviaremos un código por WhatsApp o correo para poner una contraseña nueva.", color = t.tenue, fontSize = 13.sp)
            when (modo) {
                ModoEntrar.ENTRAR -> BotonLima(if (vm.ocupado) "Entrando…" else "Entrar", habilitado = correoOk && clave.isNotEmpty() && !vm.ocupado) { vm.entrar(email, clave) }
                ModoEntrar.CREAR -> BotonLima(if (vm.ocupado) "Creando…" else "Crear cuenta", habilitado = nombre.isNotBlank() && correoOk && clave.length >= 8 && whatsapp.count(Char::isDigit) >= 8 && !vm.ocupado) { vm.registrar(nombre, email, clave, whatsapp) }
                ModoEntrar.OLVIDE -> BotonLima(if (vm.ocupado) "Enviando…" else "Enviarme el código", habilitado = correoOk && !vm.ocupado) { vm.olvide(email) { modo = ModoEntrar.CODIGO } }
                ModoEntrar.CODIGO -> BotonLima(if (vm.ocupado) "Guardando…" else "Cambiar contraseña y entrar", habilitado = codigo.length >= 6 && clave.length >= 8 && !vm.ocupado) { vm.restablecer(email, codigo, clave) }
            }
            if (modo == ModoEntrar.ENTRAR) {
                Text("¿Olvidaste tu contraseña?", color = t.tinta, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().toque { modo = ModoEntrar.OLVIDE }.padding(6.dp))
            }
            if (modo == ModoEntrar.ENTRAR || modo == ModoEntrar.CREAR) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    HorizontalDivider(Modifier.weight(1f), color = t.linea)
                    Text("  o  ", color = t.tenue)
                    HorizontalDivider(Modifier.weight(1f), color = t.linea)
                }
                Row(
                    Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(50)).background(Color.White).border(1.dp, t.linea, RoundedCornerShape(50))
                        .toque { contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Api.BASE + "/api/auth/google?app=android"))) },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
                ) {
                    androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(R.drawable.ic_google), "Google", Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                    Text("Continuar con Google", color = Color(0xFF1F1F1F), fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
            if (vm.ocupado) Text("Si DUOLAB estaba dormido puede tardar hasta un minuto la primera vez.", color = t.tenue, fontSize = 12.sp)
        }
        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(when (modo) { ModoEntrar.ENTRAR -> "¿No tienes cuenta? "; ModoEntrar.CREAR -> "¿Ya tienes cuenta? "; else -> "" }, color = t.tenue)
            Text(
                when (modo) { ModoEntrar.ENTRAR -> "Crear una"; else -> "Volver a entrar" },
                fontWeight = FontWeight.Bold, color = t.tinta,
                modifier = Modifier.toque { modo = if (modo == ModoEntrar.ENTRAR) ModoEntrar.CREAR else ModoEntrar.ENTRAR }.padding(6.dp),
            )
        }
        Text("Política de privacidad · Términos de uso", color = t.tenue, fontSize = 12.sp, modifier = Modifier.padding(top = 18.dp).toque {
            contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Api.BASE + "/privacidad")))
        })
    }
}
