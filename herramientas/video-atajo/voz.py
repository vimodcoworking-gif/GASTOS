"""Genera la voz de cada escena con una voz neuronal de Microsoft (edge-tts) y la deja en WAV 24 kHz mono.

Uso: python voz.py [carpeta_destino] [voz]
Voz por defecto: es-PE-CamilaNeural (mujer, español de Perú). Alternativa: es-MX-DaliaNeural.
Solo se envía el texto de guion.json al servicio de voz.
"""
import asyncio
import json
import os
import subprocess
import sys

import edge_tts

DIR = os.path.dirname(os.path.abspath(__file__))
DESTINO = sys.argv[1] if len(sys.argv) > 1 else DIR
VOZ = sys.argv[2] if len(sys.argv) > 2 else 'es-PE-CamilaNeural'


async def main():
    guion = json.load(open(os.path.join(DIR, 'guion.json'), encoding='utf8'))
    for e in guion:
        mp3 = os.path.join(DESTINO, f"{e['id']}.mp3")
        await edge_tts.Communicate(e['texto'], VOZ, rate='+4%').save(mp3)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ar', '24000', '-ac', '1', '-sample_fmt', 's16',
                        os.path.join(DESTINO, f"{e['id']}.wav")], check=True)
        os.remove(mp3)
        print(e['id'])


asyncio.run(main())
