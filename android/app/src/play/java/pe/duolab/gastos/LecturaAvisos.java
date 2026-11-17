package pe.duolab.gastos;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Lee las notificaciones de Yape, Plin, bancos y billeteras y manda a DUOLAB solo las que traen un monto
 * («¡Te yapearon S/ 3.50!», «Realizaste un consumo de S/ 45.90…»). El resto ni se lee ni sale del teléfono.
 */
public class LecturaAvisos extends NotificationListenerService {

    // Apps financieras de Perú, por una parte de su nombre de paquete.
    private static final String[][] APPS = {
            {"yape", "Yape"}, {"bcp", "BCP"}, {"bbva", "BBVA"}, {"interbank", "Interbank"},
            {"scotiabank", "Scotiabank"}, {"banbif", "BanBif"}, {"pichincha", "Pichincha"},
            {"bn.", "Banco de la Nación"}, {"bancodelanacion", "Banco de la Nación"}, {"mibanco", "Mibanco"},
            {"falabella", "Falabella"}, {"ripley", "Ripley"}, {"caja", "Caja"}, {"plin", "Plin"},
            {"tunki", "Tunki"}, {"mercadopago", "Mercado Pago"}, {"lemon", "Lemon"}, {"agora", "Agora"},
            {"bim", "BiM"}, {"izipay", "Izipay"}, {"diners", "Diners"}, {"banco", "Banco"}, {"bank", "Banco"},
    };

    // Solo avisos con un monto: S/ 3.50, S/. 20, US$ 15, $ 9.90, PEN 100.
    private static final Pattern MONTO = Pattern.compile("(S/\\.?|US\\$|\\$|PEN|USD)\\s?\\d", Pattern.CASE_INSENSITIVE);

    static String nombreApp(String paquete) {
        String p = paquete.toLowerCase(Locale.ROOT);
        for (String[] app : APPS) if (p.contains(app[0])) return app[1];
        return null;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String paquete = sbn.getPackageName();
            if (paquete == null || paquete.equals(getPackageName())) return;
            String app = nombreApp(paquete);
            if (app == null) return;
            Notification n = sbn.getNotification();
            if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle extras = n.extras;
            if (extras == null) return;
            String titulo = texto(extras.getCharSequence(Notification.EXTRA_TITLE));
            String cuerpo = texto(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
            if (cuerpo.isEmpty()) cuerpo = texto(extras.getCharSequence(Notification.EXTRA_TEXT));
            if (!MONTO.matcher(titulo + " " + cuerpo).find()) return;
            Enviador.enviar(this, titulo, cuerpo, app, null);
        } catch (Exception ignorado) {
            // Una notificación rara no debe tumbar el servicio.
        }
    }

    private static String texto(CharSequence s) {
        return s == null ? "" : s.toString().trim();
    }
}
