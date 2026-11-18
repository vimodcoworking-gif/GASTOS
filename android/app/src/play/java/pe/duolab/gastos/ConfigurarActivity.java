package pe.duolab.gastos;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Pantalla «Lectura de Yape»: guarda el enlace personal que manda la web (duolab://configurar?enlace=…),
 * pide el permiso de acceso a notificaciones y deja probar el envío.
 */
public class ConfigurarActivity extends Activity {
    private static final int FONDO = Color.rgb(18, 21, 14);
    private static final int PANEL = Color.rgb(31, 35, 26);
    private static final int LIMA = Color.rgb(198, 244, 50);
    private static final int BLANCO = Color.rgb(243, 246, 238);
    private static final int TENUE = Color.rgb(167, 174, 155);

    private TextView estadoEnlace;
    private TextView estadoPermiso;
    private TextView resultado;
    private Button botonPermiso;

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        recibirEnlace(getIntent());
        construir();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        recibirEnlace(intent);
        refrescar();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refrescar();
    }

    private void recibirEnlace(Intent intent) {
        Uri datos = intent == null ? null : intent.getData();
        if (datos == null) return;
        String enlace = datos.getQueryParameter("enlace");
        if (Enviador.enlaceValido(enlace)) Enviador.guardarEnlace(this, enlace);
    }

    private boolean permisoActivo() {
        String activos = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return activos != null && activos.contains(new ComponentName(this, LecturaAvisos.class).flattenToString());
    }

    private void refrescar() {
        if (estadoEnlace == null) return;
        boolean enlace = Enviador.enlaceValido(Enviador.enlace(this));
        boolean permiso = permisoActivo();
        estadoEnlace.setText(enlace ? "✓  Conectada a tu cuenta de DUOLAB"
                : "✗  Falta conectar: abre DUOLAB y entra con tu cuenta (se conecta sola).");
        estadoEnlace.setTextColor(enlace ? LIMA : Color.rgb(255, 120, 100));
        estadoPermiso.setText(permiso ? "✓  Acceso a notificaciones activado"
                : "✗  Falta el acceso a notificaciones: tócalo abajo y activa «DUOLAB».");
        estadoPermiso.setTextColor(permiso ? LIMA : Color.rgb(255, 120, 100));
        botonPermiso.setText(permiso ? "Acceso a notificaciones (activado)" : "Activar acceso a notificaciones");
        String ultimo = Enviador.ultimoResultado(this);
        if (ultimo != null && resultado.getText().length() == 0) resultado.setText("Último envío: " + ultimo);
    }

    private void construir() {
        int pad = dp(20);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(FONDO);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(pad, dp(28), pad, pad);
        scroll.addView(col);

        col.addView(texto("Lectura automática", 26, BLANCO, true));
        col.addView(texto("DUOLAB registra solo los avisos de Yape, Plin y tu banco que traen un monto. Nada más sale de tu teléfono.", 15, TENUE, false));

        LinearLayout panel = panel();
        estadoEnlace = texto("", 15, BLANCO, true);
        estadoPermiso = texto("", 15, BLANCO, true);
        panel.addView(estadoEnlace);
        panel.addView(estadoPermiso);
        col.addView(panel);

        botonPermiso = boton("Activar acceso a notificaciones", true, v -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        col.addView(botonPermiso);
        col.addView(boton("Quitar el ahorro de batería a DUOLAB", false, v -> {
            if (Build.VERSION.SDK_INT >= 23) startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }));
        col.addView(texto("En Xiaomi, Huawei u Oppo, quita también el ahorro de batería para que el sistema no cierre la lectura.", 13, TENUE, false));

        col.addView(boton("Probar el envío", false, v -> {
            resultado.setText("Enviando prueba…");
            Enviador.enviar(this, "Prueba de DUOLAB", "Prueba de la app Android", "DUOLAB", (ok, mensaje) ->
                    resultado.setText(mensaje == null || mensaje.isEmpty() ? (ok ? "Conexión correcta" : "No se pudo enviar") : "Respuesta: " + mensaje));
        }));
        resultado = texto("", 14, TENUE, false);
        col.addView(resultado);

        col.addView(boton("Abrir DUOLAB", true, v -> {
            Intent abrir = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (abrir != null) startActivity(abrir);
            finish();
        }));
        setContentView(scroll);
        refrescar();
    }

    private TextView texto(String s, int sp, int color, boolean negrita) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (negrita) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(6), 0, dp(6));
        t.setLineSpacing(0, 1.15f);
        return t;
    }

    private LinearLayout panel() {
        LinearLayout p = new LinearLayout(this);
        p.setOrientation(LinearLayout.VERTICAL);
        p.setPadding(dp(16), dp(12), dp(16), dp(12));
        GradientDrawable fondo = new GradientDrawable();
        fondo.setColor(PANEL);
        fondo.setCornerRadius(dp(18));
        p.setBackground(fondo);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(14), 0, dp(14));
        p.setLayoutParams(lp);
        return p;
    }

    private Button boton(String s, boolean principal, View.OnClickListener accion) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(16);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(principal ? FONDO : BLANCO);
        b.setGravity(Gravity.CENTER);
        GradientDrawable fondo = new GradientDrawable();
        fondo.setColor(principal ? LIMA : PANEL);
        fondo.setCornerRadius(dp(28));
        b.setBackground(fondo);
        b.setMinHeight(dp(54));
        b.setOnClickListener(accion);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(8), 0, dp(4));
        b.setLayoutParams(lp);
        return b;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
