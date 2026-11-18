# El servicio y la pantalla de lectura (versión de Play Store) se declaran en el manifiesto: R8 ya los conserva.
# OkHttp trae sus propias reglas.
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# WorkManager (notificaciones cada 15 min) crea su base de datos Room y los trabajos por reflexión:
# sin esto R8 borra los constructores y la app se cierra al abrir («WorkDatabase_Impl.<init>»).
-keep class * extends androidx.room.RoomDatabase { <init>(...); }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class * extends androidx.work.ListenableWorker { <init>(android.content.Context, androidx.work.WorkerParameters); }
-keep class pe.duolab.gastos.RevisarMovimientos { *; }
