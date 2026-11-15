# Video tutorial del atajo de iPhone

Genera `public/videos/tutorial-atajo-iphone.mp4` (1080×1920, voz en español). Requiere Python con Pillow y edge-tts, ffmpeg e internet (solo para la voz).

1. Edita el texto de cada escena en `guion.json`.
2. Genera la voz de cada escena (voz neuronal «Camila», español de Perú; requiere `pip install edge-tts` e internet):
   ```
   python voz.py
   ```
   Otra voz: `python voz.py . es-MX-DaliaNeural`.
3. `python video.py ..\..\public\videos\tutorial-atajo-iphone.mp4` (o `python video.py x muestras` para ver cuadros de prueba).
4. Sube la versión de la caché en `public/sw.js`.
