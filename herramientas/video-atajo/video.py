"""Video tutorial: atajo automático de iPhone para registrar los Yapes en DUOLAB (1080x1920, voz en español)."""
import json
import os
import subprocess
import sys
import wave

from PIL import Image, ImageDraw, ImageFont, ImageFilter

DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(DIR, '..', '..', 'public')
SALIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(DIR, 'tutorial-atajo-iphone.mp4')
SOLO = sys.argv[2] if len(sys.argv) > 2 else None  # «muestras»: solo cuadros de prueba
W, H, FPS = 1080, 1920, 30

FONDO = (18, 21, 14)
LIMA = (198, 244, 50)
BLANCO = (243, 246, 238)
TENUE = (167, 174, 155)
PANEL = (31, 35, 26)
PANEL2 = (43, 48, 36)
AZUL = (0, 122, 255)
IOS_FONDO = (242, 242, 247)
MORADO = (98, 32, 128)
VERDE = (34, 160, 90)
ROJO = (214, 60, 60)

_fuentes = {}


def F(t, negrita=False):
    clave = (t, negrita)
    if clave not in _fuentes:
        _fuentes[clave] = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf' if negrita else r'C:\Windows\Fonts\segoeui.ttf', t)
    return _fuentes[clave]


def suave(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def entre(t, a, b):
    return max(0.0, min(1.0, (t - a) / (b - a))) if b > a else float(t >= a)


def mezcla(c1, c2, k):
    return tuple(int(a + (b - a) * k) for a, b in zip(c1, c2))


def caja(d, box, r, fill=None, outline=None, ancho=1):
    d.rounded_rectangle(box, r, fill=fill, outline=outline, width=ancho)


def texto(d, xy, s, t, fill, negrita=False, anchor='la'):
    d.text(xy, s, font=F(t, negrita), fill=fill, anchor=anchor)


def envolver(s, t, ancho, negrita=False):
    palabras, lineas, actual = s.split(), [], ''
    for p in palabras:
        prueba = f'{actual} {p}'.strip()
        if F(t, negrita).getlength(prueba) <= ancho:
            actual = prueba
        else:
            lineas.append(actual)
            actual = p
    if actual:
        lineas.append(actual)
    return lineas


def palomita(d, cx, cy, r, fondo=LIMA, tinta=(20, 24, 16)):
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fondo)
    d.line([(cx - r * .45, cy + r * .02), (cx - r * .1, cy + r * .38), (cx + r * .5, cy - r * .35)], fill=tinta, width=max(3, int(r * .28)), joint='curve')


LOGO = Image.open(os.path.join(PUBLIC, 'logo-duolab-blanco.png')).convert('RGBA')
ICONO_APP = Image.open(os.path.join(PUBLIC, 'icons', 'app-duolab-192.png')).convert('RGBA')


def logo(alto):
    return LOGO.resize((round(LOGO.width * alto / LOGO.height), alto), Image.LANCZOS)


def icono_duolab(lado):
    im = ICONO_APP.resize((lado, lado), Image.LANCZOS)
    m = Image.new('L', (lado, lado), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, lado - 1, lado - 1), lado // 4, fill=255)
    out = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    out.paste(im, (0, 0), m)
    return out


def icono_yape(d, x, y, lado):
    caja(d, (x, y, x + lado, y + lado), lado // 4, fill=MORADO)
    texto(d, (x + lado / 2, y + lado / 2 + 2), 'Y', int(lado * .55), (255, 255, 255), True, 'mm')


def icono_atajos(d, x, y, lado):
    caja(d, (x, y, x + lado, y + lado), lado // 4, fill=(60, 70, 200))
    caja(d, (x + lado * .22, y + lado * .22, x + lado * .62, y + lado * .62), lado // 10, fill=(255, 120, 160))
    caja(d, (x + lado * .38, y + lado * .38, x + lado * .78, y + lado * .78), lado // 10, fill=(120, 210, 255))


# ---------------- pantalla del teléfono ----------------
SW, SH = 560, 1160


def barra_estado(d, claro=False):
    tinta = (0, 0, 0) if claro else (255, 255, 255)
    texto(d, (60, 38), '9:41', 26, tinta, True, 'lm')
    caja(d, (SW / 2 - 75, 16, SW / 2 + 75, 60), 22, fill=(0, 0, 0))
    caja(d, (SW - 92, 28, SW - 52, 48), 6, outline=tinta, ancho=2)
    caja(d, (SW - 88, 32, SW - 62, 44), 3, fill=tinta)


def toque(capa, x, y, t, cuando, larga=False):
    """Círculo que marca un toque (o una pulsación larga) en la pantalla."""
    dur = 1.1 if larga else 0.55
    k = (t - cuando) / dur
    if not (-0.15 <= k <= 1):
        return
    d = ImageDraw.Draw(capa, 'RGBA')
    if k < 0:
        r, a = 34, int(120 * (1 + k / 0.15))
    else:
        r = 34 + 40 * suave(k) if not larga else 34 + 10 * min(1, k * 2)
        a = int(170 * (1 - k)) if not larga else int(170 * (1 - max(0, k - .7) / .3))
    d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, max(0, a // 2)), outline=(198, 244, 50, max(0, a)), width=5)


def notificacion(d, capa, y, icono, app, titulo, cuerpo, k=1.0):
    """Notificación de iOS que baja desde arriba (k: 0 → 1)."""
    if k <= 0:
        return
    y = y - (1 - suave(k)) * 260
    caja(d, (20, y, SW - 20, y + 140), 30, fill=(245, 245, 245, int(235 * min(1, k * 2))))
    if icono == 'duolab':
        ic = icono_duolab(64)
        capa.paste(ic, (40, int(y + 20)), ic)
    else:
        icono_yape(d, 40, y + 20, 64)
    texto(d, (122, y + 32), app.upper(), 20, (110, 110, 115), True, 'lm')
    texto(d, (SW - 44, y + 32), 'ahora', 20, (110, 110, 115), False, 'rm')
    texto(d, (122, y + 66), titulo, 25, (0, 0, 0), True, 'lm')
    texto(d, (122, y + 102), cuerpo, 23, (40, 40, 45), False, 'lm')


def pantalla_bloqueo(capa, t, notis):
    d = ImageDraw.Draw(capa, 'RGBA')
    for yy in range(SH):  # fondo degradado
        d.line([(0, yy), (SW, yy)], fill=mezcla((26, 46, 30), (60, 34, 80), yy / SH))
    barra_estado(d)
    texto(d, (SW / 2, 150), 'sábado, 15 de noviembre', 26, (230, 230, 230), True, 'mm')
    texto(d, (SW / 2, 250), '9:41', 140, (245, 245, 245), True, 'mm')
    y = 420
    for n in notis:
        notificacion(d, capa, y, *n)
        y += 160


def pantalla_yape(capa, t, ocultos=False, mostrar_en=None, flash=None):
    d = ImageDraw.Draw(capa, 'RGBA')
    d.rectangle((0, 0, SW, SH), fill=(250, 248, 252))
    d.rectangle((0, 0, SW, 380), fill=MORADO)
    barra_estado(d)
    texto(d, (40, 110), 'Hola, Ana', 34, (255, 255, 255), True, 'lm')
    texto(d, (40, 160), 'Saldo: S/ ••••', 26, (230, 210, 240), False, 'lm')
    caja(d, (40, 220, SW - 40, 300), 40, fill=(0, 200, 160))
    texto(d, (SW / 2, 260), 'Yapear', 30, (255, 255, 255), True, 'mm')
    texto(d, (SW - 40, 345), 'Ejemplo', 20, (230, 210, 240), True, 'rm')
    texto(d, (40, 430), 'Movimientos', 30, (30, 20, 40), True, 'lm')
    visibles = not ocultos or (mostrar_en is not None and t >= mostrar_en)
    if not visibles:
        caja(d, (40, 490, SW - 40, 570), 40, fill=(235, 225, 242))
        texto(d, (SW / 2, 530), 'Mostrar movimientos', 28, MORADO, True, 'mm')
    else:
        filas = [('Ana Gómez*', 'Hoy 9:40 am', '+ S/ 3.50', VERDE), ('Bodega Don Lucho', 'Hoy 9:15 am', '- S/ 12.00', ROJO),
                 ('Luis Pérez*', 'Ayer 7:05 pm', '+ S/ 50.00', VERDE), ('*** *** 512', 'Ayer 1:20 pm', '- S/ 1.50', ROJO),
                 ('Plin - Rosa Díaz', '13 nov 6:34 pm', '- S/ 20.00', ROJO)]
        for i, (nombre, hora, monto, color) in enumerate(filas):
            y = 480 + i * 104
            caja(d, (30, y, SW - 30, y + 92), 22, fill=(255, 255, 255))
            texto(d, (54, y + 32), nombre, 26, (30, 20, 40), True, 'lm')
            texto(d, (54, y + 64), hora, 21, (120, 110, 130), False, 'lm')
            texto(d, (SW - 54, y + 46), monto, 27, color, True, 'rm')
    if flash is not None and 0 <= t - flash < 0.45:  # destello de captura
        a = int(230 * (1 - (t - flash) / 0.45))
        d.rectangle((0, 0, SW, SH), fill=(255, 255, 255, a))


def pantalla_duolab(capa, t, modo):
    d = ImageDraw.Draw(capa, 'RGBA')
    d.rectangle((0, 0, SW, SH), fill=FONDO)
    barra_estado(d)
    lg = logo(30)
    capa.paste(lg, (36, 86), lg)
    if modo == 'cuenta':
        texto(d, (36, 170), 'Mi cuenta', 40, BLANCO, True, 'lm')
        for i, (tit, sub) in enumerate([('Tus datos y WhatsApp', 'Ana Prueba'), ('Gastos desde tu Gmail', '1 cuenta vinculada')]):
            y = 220 + i * 120
            caja(d, (28, y, SW - 28, y + 104), 26, fill=PANEL)
            texto(d, (56, y + 36), tit, 25, BLANCO, True, 'lm')
            texto(d, (56, y + 70), sub, 21, TENUE, False, 'lm')
        y = 470
        caja(d, (28, y, SW - 28, y + 330), 26, fill=PANEL, outline=LIMA, ancho=2)
        texto(d, (56, y + 42), 'Yape, Plin y avisos', 27, BLANCO, True, 'lm')
        texto(d, (56, y + 76), 'del teléfono', 27, BLANCO, True, 'lm')
        texto(d, (56, y + 130), 'iPhone: automático al abrir Yape', 21, TENUE, False, 'lm')
        caja(d, (56, y + 190, SW - 56, y + 270), 40, fill=LIMA)
        texto(d, (SW / 2, y + 230), 'Ver tutorial', 28, (20, 24, 16), True, 'mm')
    elif modo == 'tutorial':
        caja(d, (20, 300, SW - 20, SH - 30), 40, fill=(250, 250, 246))
        caja(d, (50, 340, SW - 50, 520), 26, fill=PANEL)
        texto(d, (80, 395), 'https://gastos-g63s', 22, BLANCO, False, 'lm')
        texto(d, (80, 430), '.onrender.com/api/avisos/', 22, BLANCO, False, 'lm')
        texto(d, (80, 465), '•••••••?silencioso=1', 22, BLANCO, False, 'lm')
        caja(d, (50, 550, SW - 50, 640), 45, fill=LIMA)
        texto(d, (SW / 2, 595), 'Copiar enlace y añadir atajo', 25, (20, 24, 16), True, 'mm')
        texto(d, (50, 700), 'Paso 1 · Añade el atajo', 32, (20, 24, 16), True, 'lm')
        for i, l in enumerate(['Toca el botón: se copia tu enlace', 'y se abre «DUOLAB Yape».']):
            texto(d, (50, 760 + i * 36), l, 23, (70, 75, 65), False, 'lm')
    elif modo == 'envios':
        texto(d, (36, 170), 'Últimos envíos', 40, BLANCO, True, 'lm')
        filas = [('Captura', '1 movimiento registrado', 'hace 1 min', True), ('Captura (automático)', 'Nada nuevo', 'hace 2 h', None),
                 ('Captura', '2 movimientos registrados', 'ayer', True)]
        for i, (tit, res, cuando, ok) in enumerate(filas):
            k = suave(entre(t, 0.8 + i * 0.7, 1.4 + i * 0.7))
            if k <= 0:
                continue
            y = 230 + i * 140 + (1 - k) * 40
            caja(d, (28, y, SW - 28, y + 120), 26, fill=PANEL + (int(255 * k),))
            if ok:
                palomita(d, 72, y + 60, 22)
            else:
                d.ellipse((50, y + 38, 94, y + 82), fill=PANEL2)
            texto(d, (112, y + 40), tit, 25, BLANCO, True, 'lm')
            texto(d, (112, y + 80), res, 22, LIMA if ok else TENUE, False, 'lm')
            texto(d, (SW - 52, y + 40), cuando, 20, TENUE, False, 'rm')


def ios_celda(d, y, filas, x0=24, x1=SW - 24, alto=78):
    caja(d, (x0, y, x1, y + alto * len(filas)), 22, fill=(255, 255, 255))
    for i, f in enumerate(filas):
        yy = y + i * alto
        if i:
            d.line([(x0 + 24, yy), (x1, yy)], fill=(220, 220, 225), width=2)
        izq, der = (f + ('',))[:2] if isinstance(f, tuple) else (f, '')
        texto(d, (x0 + 28, yy + alto / 2), izq, 26, (0, 0, 0), False, 'lm')
        if der == '✓':
            d.line([(x1 - 52, yy + alto / 2), (x1 - 42, yy + alto / 2 + 11), (x1 - 24, yy + alto / 2 - 13)], fill=AZUL, width=5)
        elif der == '○':
            d.ellipse((x1 - 58, yy + alto / 2 - 16, x1 - 26, yy + alto / 2 + 16), outline=(190, 190, 195), width=3)
        elif der == '●':
            d.ellipse((x1 - 58, yy + alto / 2 - 16, x1 - 26, yy + alto / 2 + 16), fill=AZUL)
            d.line([(x1 - 50, yy + alto / 2), (x1 - 44, yy + alto / 2 + 7), (x1 - 33, yy + alto / 2 - 7)], fill=(255, 255, 255), width=4)
        elif der:
            texto(d, (x1 - 28, yy + alto / 2), der, 26, (140, 140, 145), False, 'rm')


def pantalla_atajos(capa, t, modo):
    d = ImageDraw.Draw(capa, 'RGBA')
    d.rectangle((0, 0, SW, SH), fill=IOS_FONDO)
    barra_estado(d, claro=True)
    if modo == 'anadir':
        caja(d, (0, 140, SW, SH), 36, fill=(255, 255, 255))
        icono_atajos(d, SW / 2 - 60, 220, 120)
        texto(d, (SW / 2, 390), 'DUOLAB Yape', 38, (0, 0, 0), True, 'mm')
        texto(d, (SW / 2, 440), 'Esperar · Captura · Obtener URL', 23, (120, 120, 125), False, 'mm')
        caja(d, (40, SH - 220, SW - 40, SH - 130), 26, fill=AZUL)
        texto(d, (SW / 2, SH - 175), 'Añadir atajo', 30, (255, 255, 255), True, 'mm')
    elif modo == 'pregunta':
        caja(d, (0, 140, SW, SH), 36, fill=(255, 255, 255))
        texto(d, (40, 220), 'Configurar este atajo', 32, (0, 0, 0), True, 'lm')
        for i, l in enumerate(envolver('Pega tu enlace de DUOLAB (ya está copiado)', 25, SW - 80)):
            texto(d, (40, 290 + i * 36), l, 25, (90, 90, 95), False, 'lm')
        lleno = t >= 6.2
        caja(d, (40, 380, SW - 40, 460), 18, fill=(242, 242, 247), outline=AZUL if t >= 4.0 else None, ancho=3)
        texto(d, (64, 420), 'https://gastos-g63s.onrender…' if lleno else 'Texto', 24, (0, 0, 0) if lleno else (170, 170, 175), False, 'lm')
        if 5.1 <= t < 6.2:  # globo «Pegar»
            caja(d, (90, 300, 230, 360), 14, fill=(40, 40, 42))
            texto(d, (160, 330), 'Pegar', 24, (255, 255, 255), True, 'mm')
        caja(d, (40, SH - 220, SW - 40, SH - 130), 26, fill=AZUL if lleno else (190, 205, 230))
        texto(d, (SW / 2, SH - 175), 'Añadir atajo', 30, (255, 255, 255), True, 'mm')
    elif modo in ('automatizacion', 'disparadores'):
        texto(d, (32, 130), 'Automatización', 44, (0, 0, 0), True, 'lm')
        d.ellipse((SW - 86, 108, SW - 34, 160), fill=(225, 230, 240))
        texto(d, (SW - 60, 132), '+', 40, AZUL, True, 'mm')
        texto(d, (SW / 2, 420), 'No tienes automatizaciones', 26, (140, 140, 145), False, 'mm')
        d.rectangle((0, SH - 110, SW, SH), fill=(250, 250, 250))
        for i, nombre in enumerate(['Atajos', 'Automatización', 'Galería']):
            x = SW * (i + .5) / 3
            activo = nombre == 'Automatización' and t >= 1.6
            texto(d, (x, SH - 56), nombre, 21, AZUL if activo else (140, 140, 145), activo, 'mm')
        if modo == 'disparadores' or t >= 3.3:
            k = suave(entre(t, 3.3, 3.8))
            y0 = 96 + (1 - k) * 900
            caja(d, (0, y0, SW, SH + 40), 36, fill=IOS_FONDO)
            texto(d, (SW / 2, y0 + 50), 'Nueva automatización', 28, (0, 0, 0), True, 'mm')
            ios_celda(d, y0 + 110, [('Hora del día', ''), ('Alarma', ''), ('Correo', ''), ('Mensaje', ''), ('App', ''), ('Wi-Fi', '')])
    elif modo == 'app':
        texto(d, (SW / 2, 120), 'App', 30, (0, 0, 0), True, 'mm')
        texto(d, (SW - 32, 120), 'Siguiente', 26, AZUL, True, 'rm')
        ios_celda(d, 190, [('App', 'Yape' if t >= 1.0 else 'Elegir')])
        ios_celda(d, 300, [('Se abre', '✓' if t >= 2.4 else ''), ('Se cierra', '')])
        texto(d, (40, 490), 'EJECUCIÓN', 21, (130, 130, 135), False, 'lm')
        inm = t >= 4.0
        ios_celda(d, 515, [('Ejecutar tras confirmación', '○' if inm else '●'), ('Ejecutar inmediatamente', '●' if inm else '○')])
        ios_celda(d, 690, [('Notificar al ejecutar', '')])
        x = SW - 110
        caja(d, (x, 707, x + 80, 751), 22, fill=(225, 225, 230) if inm else (52, 199, 89))
        d.ellipse((x + 3 if inm else x + 39, 710, x + 41 if inm else x + 77, 748), fill=(255, 255, 255))
    elif modo == 'elegir':
        texto(d, (SW / 2, 120), 'Cuando «Yape» se abra', 26, (0, 0, 0), True, 'mm')
        texto(d, (40, 210), 'MIS ATAJOS', 21, (130, 130, 135), False, 'lm')
        ios_celda(d, 235, [('Nuevo atajo en blanco', ''), ('DUOLAB Yape', '✓' if t >= 2.6 else ''), ('Registrar Yape', '')])
        if t >= 3.3:
            k = suave(entre(t, 3.3, 3.8))
            d.rectangle((0, 0, SW, SH), fill=IOS_FONDO + (int(255 * k),))
            texto(d, (32, 130), 'Automatización', 44, (0, 0, 0, int(255 * k)), True, 'lm')
            caja(d, (24, 200, SW - 24, 330), 24, fill=(255, 255, 255, int(255 * k)))
            icono_yape(d, 50, 230, 70)
            texto(d, (140, 248), 'Cuando «Yape» se abra', 25, (0, 0, 0, int(255 * k)), True, 'lm')
            texto(d, (140, 290), 'DUOLAB Yape', 23, (120, 120, 125, int(255 * k)), False, 'lm')


def permiso(capa, k):
    if k <= 0:
        return
    d = ImageDraw.Draw(capa, 'RGBA')
    d.rectangle((0, 0, SW, SH), fill=(0, 0, 0, int(110 * k)))
    y = 380 + (1 - suave(k)) * 40
    caja(d, (40, y, SW - 40, y + 400), 30, fill=(245, 245, 245, int(255 * min(1, k * 3))))
    for i, l in enumerate(['¿Permitir que «DUOLAB Yape»', 'se conecte a', 'gastos-g63s.onrender.com?']):
        texto(d, (SW / 2, y + 50 + i * 36), l, 24, (0, 0, 0), True, 'mm')
    for i, op in enumerate(['Permitir una vez', 'Permitir siempre', 'No permitir']):
        yy = y + 170 + i * 76
        d.line([(40, yy), (SW - 40, yy)], fill=(210, 210, 215), width=2)
        texto(d, (SW / 2, yy + 38), op, 26, AZUL, op == 'Permitir siempre', 'mm')


# ---------------- escenas ----------------

def escena_intro(capa, t):
    pantalla_bloqueo(capa, t, [('duolab', 'DUOLAB Yape', 'Ingreso registrado', 'S/ 3.50 · Yapeo de Ana Gómez', entre(t, 1.2, 1.9))])


def escena_como(capa, t):
    if t < 3.4:
        pantalla_bloqueo(capa, t, [('yape', 'Yape', '¡Te yapearon S/ 3.50!', 'Ana Gómez te envió un yape', entre(t, 0.6, 1.3))])
        toque(capa, SW / 2, 490, t, 2.6)
    else:
        pantalla_yape(capa, t, flash=6.6)
        d = ImageDraw.Draw(capa, 'RGBA')
        if t >= 8.6:
            notificacion(d, capa, 70, 'duolab', 'DUOLAB Yape', 'Ingreso registrado', 'S/ 3.50 · Yapeo de Ana Gómez', entre(t, 8.6, 9.3))


def escena_p1a(capa, t):
    if t < 5.6:
        pantalla_duolab(capa, t, 'cuenta')
        toque(capa, SW / 2, 700, t, 4.8)
    else:
        pantalla_duolab(capa, t, 'tutorial')
        toque(capa, SW / 2, 595, t, 8.6)
        if t >= 9.1:
            d = ImageDraw.Draw(capa, 'RGBA')
            caja(d, (80, SH - 160, SW - 80, SH - 90), 20, fill=(20, 24, 16, 235))
            palomita(d, 170, SH - 125, 16)
            texto(d, (SW / 2 + 16, SH - 125), 'Enlace copiado', 24, LIMA, True, 'mm')


def escena_p1b(capa, t):
    if t < 3.0:
        pantalla_atajos(capa, t, 'anadir')
        toque(capa, SW / 2, SH - 175, t, 2.2)
    else:
        pantalla_atajos(capa, t, 'pregunta')
        toque(capa, SW / 2, 420, t, 4.0, larga=True)
        toque(capa, 160, 330, t, 5.8)
        toque(capa, SW / 2, SH - 175, t, 8.4)


def escena_p2a(capa, t):
    pantalla_atajos(capa, t, 'automatizacion')
    toque(capa, SW / 2, SH - 56, t, 1.2)
    toque(capa, SW - 60, 132, t, 2.8)
    toque(capa, SW / 2, 140 + 110 + 4 * 78 + 39, t, 5.6)


def escena_p2b(capa, t):
    pantalla_atajos(capa, t, 'app')
    toque(capa, SW / 2, 229, t, 0.7)
    toque(capa, SW / 2, 339, t, 2.1)
    toque(capa, SW / 2, 515 + 117, t, 3.7)


def escena_p2c(capa, t):
    pantalla_atajos(capa, t, 'elegir')
    toque(capa, SW / 2, 235 + 117, t, 2.3)


def escena_p3(capa, t):
    pantalla_yape(capa, t, ocultos=True, mostrar_en=2.9)
    toque(capa, SW / 2, 530, t, 2.3)
    permiso(capa, entre(t, 5.6, 6.1))
    toque(capa, SW / 2, 380 + 170 + 76 + 38, t, 8.6)


def escena_prueba(capa, t):
    pantalla_duolab(capa, t, 'envios')


def escena_fin(capa, t):
    pantalla_bloqueo(capa, t, [
        ('duolab', 'DUOLAB Yape', 'Ingreso registrado', 'S/ 3.50 · Yapeo de Ana Gómez', entre(t, 0.5, 1.2)),
        ('duolab', 'DUOLAB Yape', 'Ingreso registrado', 'S/ 50.00 · Yapeo de Luis Pérez', entre(t, 2.0, 2.7)),
    ])


ESCENAS = {
    'intro': ('', 'Yapes automáticos en tu iPhone', escena_intro),
    'como': ('Así funciona', 'Tocas la notificación y se registra solo', escena_como),
    'p1a': ('Paso 1 de 3', 'Añade el atajo desde DUOLAB', escena_p1a),
    'p1b': ('Paso 1 de 3', 'Añadir atajo y pegar tu enlace', escena_p1b),
    'p2a': ('Paso 2 de 3', 'Automatización → «+» → App', escena_p2a),
    'p2b': ('Paso 2 de 3', 'Yape · Se abre · Ejecutar inmediatamente', escena_p2b),
    'p2c': ('Paso 2 de 3', 'Elige «DUOLAB Yape»', escena_p2c),
    'p3': ('Paso 3 de 3', 'Movimientos visibles y «Permitir siempre»', escena_p3),
    'prueba': ('Comprueba', 'Mi cuenta → Últimos envíos', escena_prueba),
    'fin': ('¡Listo!', 'Tus yapes siempre al día', escena_fin),
}

# ---------------- marco del video ----------------
PX, PY, PW, PH = (W - 600) // 2, 400, 600, 1200
MASCARA = Image.new('L', (SW, SH), 0)
ImageDraw.Draw(MASCARA).rounded_rectangle((0, 0, SW - 1, SH - 1), 62, fill=255)


def fondo_base():
    im = Image.new('RGB', (W, H), FONDO)
    brillo = Image.new('RGB', (W, H), FONDO)
    ImageDraw.Draw(brillo).ellipse((W / 2 - 520, 520, W / 2 + 520, 1500), fill=(56, 74, 24))
    im = Image.blend(im, brillo.filter(ImageFilter.GaussianBlur(160)), 0.85)
    d = ImageDraw.Draw(im)
    # Teléfono
    caja(d, (PX - 6, PY - 6, PX + PW + 6, PY + PH + 6), 92, fill=(70, 76, 62))
    caja(d, (PX, PY, PX + PW, PY + PH), 86, fill=(10, 11, 9))
    return im


BASE = fondo_base()
LOGO_CAB = logo(46)


def cuadro(id_, t, dur, partes):
    eti, titulo, dibujar = ESCENAS[id_]
    im = BASE.copy().convert('RGBA')
    d = ImageDraw.Draw(im, 'RGBA')
    im.alpha_composite(LOGO_CAB, (60, 74))
    a = int(255 * suave(entre(t, 0, 0.45)))
    if eti:
        ancho = F(30, True).getlength(eti) + 52
        caja(d, (W - 60 - ancho, 70, W - 60, 128), 29, fill=LIMA + (a,))
        texto(d, (W - 60 - ancho / 2, 99), eti, 30, (20, 24, 16, a), True, 'mm')
    for i, l in enumerate(envolver(titulo, 60, W - 120, True)[:2]):
        texto(d, (W / 2, 220 + i * 76), l, 60, BLANCO + (a,), True, 'mm')
    pantalla = Image.new('RGB', (SW, SH), (0, 0, 0))
    dibujar(pantalla, t)
    im.paste(pantalla, (PX + 20, PY + 20), MASCARA)
    # Subtítulo: la frase que se está diciendo.
    for (ini, fin, frase) in partes:
        if ini <= t < fin:
            lineas = envolver(frase, 44, W - 160, True)[:3]
            alto = len(lineas) * 58 + 44
            y0 = H - 110 - alto
            caja(d, (50, y0, W - 50, y0 + alto), 34, fill=(0, 0, 0, 175))
            for i, l in enumerate(lineas):
                texto(d, (W / 2, y0 + 22 + 29 + i * 58), l, 44, (255, 255, 255), True, 'mm')
            break
    return im.convert('RGB')


def frases(s):
    import re
    return [f.strip() for f in re.split(r'(?<=[.!?:])\s+', s) if f.strip()]


def main():
    guion = json.load(open(os.path.join(DIR, 'guion.json'), encoding='utf8'))
    ANTES, DESPUES = 0.5, 0.9
    plan, audio = [], []
    params = None
    for e in guion:
        with wave.open(os.path.join(DIR, f"{e['id']}.wav")) as w:
            params = w.getparams()
            datos = w.readframes(w.getnframes())
            voz = w.getnframes() / w.getframerate()
        dur = ANTES + voz + DESPUES
        # Cada frase en pantalla el tiempo que ocupa al decirla (proporcional a sus letras).
        fr = frases(e['texto'])
        total = sum(len(f) for f in fr)
        partes, t = [], ANTES
        for f in fr:
            d = voz * len(f) / total
            partes.append((t - 0.15, t + d, f))
            t += d
        partes[-1] = (partes[-1][0], dur, partes[-1][2])
        plan.append((e['id'], dur, partes))
        silencio = lambda s: b'\x00\x00' * int(s * params.framerate)
        audio.append(silencio(ANTES) + datos + silencio(DESPUES))

    if SOLO == 'muestras':
        for id_, dur, partes in plan:
            for t in (1.5, dur * 0.5, dur - 1.0):
                cuadro(id_, t, dur, partes).save(os.path.join(DIR, f'm-{id_}-{t:.1f}.png'))
        return

    with wave.open(os.path.join(DIR, 'voz.wav'), 'wb') as w:
        w.setparams(params)
        w.writeframes(b''.join(audio))

    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-i', os.path.join(DIR, 'voz.wav'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-pix_fmt', 'yuv420p',
                           '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-shortest', SALIDA], stdin=subprocess.PIPE)
    total = 0
    for id_, dur, partes in plan:
        for n in range(int(dur * FPS)):
            ff.stdin.write(cuadro(id_, n / FPS, dur, partes).tobytes())
            total += 1
    ff.stdin.close()
    ff.wait()
    print('cuadros', total, 'segundos', round(total / FPS, 1))


main()
