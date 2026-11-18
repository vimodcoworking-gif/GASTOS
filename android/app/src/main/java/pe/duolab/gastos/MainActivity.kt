package pe.duolab.gastos

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels

class MainActivity : ComponentActivity() {
    private val vm: AppVM by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        recibir(intent)
        setContent { DuolabTema { Raiz(vm) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        recibir(intent)
    }

    // Al volver a la app se ponen al día los datos (un Yape registrado mientras tanto, otro dispositivo…).
    override fun onResume() {
        super.onResume()
        if (!vm.arrancando) vm.refrescar()
    }

    /** duolab://login?codigo=… (vuelta del acceso con Google) o ?error=… */
    private fun recibir(intent: Intent?) {
        val datos = intent?.data ?: return
        if (datos.scheme != "duolab" || datos.host != "login") return
        datos.getQueryParameter("codigo")?.let { vm.canjearCodigo(it) }
        datos.getQueryParameter("error")?.let { vm.aviso = it }
        setIntent(Intent(this, MainActivity::class.java))
    }
}
