# Video tutorial del atajo de iPhone

Genera `public/videos/tutorial-atajo-iphone.mp4` (1080×1920, voz en español). Requiere Windows (voz «Microsoft Sabina»), Python con Pillow y ffmpeg.

1. Edita el texto de cada escena en `guion.json`.
2. Genera la voz de cada escena (PowerShell, en esta carpeta):
   ```powershell
   Add-Type -AssemblyName System.Speech
   foreach ($e in (Get-Content guion.json -Raw -Encoding UTF8 | ConvertFrom-Json)) {
     $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice('Microsoft Sabina Desktop'); $s.Rate = 1
     $s.SetOutputToWaveFile("$PWD\$($e.id).wav", (New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, 'Sixteen', 'Mono')))
     $s.Speak($e.texto); $s.Dispose()
   }
   ```
3. `python video.py ..\..\public\videos\tutorial-atajo-iphone.mp4` (o `python video.py x muestras` para ver cuadros de prueba).
4. Sube la versión de la caché en `public/sw.js`.
