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

