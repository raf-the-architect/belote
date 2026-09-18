#!/usr/bin/env python3
"""Génère les icônes PNG de l'application (aucune dépendance externe).

Dessin géométrique : feutrine verte, cadre doré, carte ivoire légèrement inclinée
portant un cœur, un carreau et un trèfle. Utilisé pour le favicon, l'icône
« ajouter à l'écran d'accueil » et le manifeste.

    python3 scripts/make_icons.py
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')

WOOD = (26, 14, 7)
FELT_A = (12, 62, 45)
FELT_B = (6, 30, 22)
GOLD = (224, 178, 92)
GOLD_DARK = (140, 96, 36)
IVORY = (251, 247, 238)
IVORY_EDGE = (216, 204, 180)
RED = (196, 54, 46)
INK = (27, 28, 30)


def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def mix(a, b, t):
    t = clamp(t)
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def round_rect(x, y, cx, cy, w, h, r):
    """Vrai si le point est dans un rectangle arrondi."""
    dx = abs(x - cx) - (w / 2 - r)
    dy = abs(y - cy) - (h / 2 - r)
    if dx <= 0 and dy <= 0:
        return True
    dx = max(dx, 0.0)
    dy = max(dy, 0.0)
    return dx * dx + dy * dy <= r * r


def heart(x, y, cx, cy, s):
    """Cœur : deux lobes + pointe (coordonnées normalisées)."""
    u = (x - cx) / s
    v = (cy - y) / s
    # lobes
    r = 0.42
    if math.hypot(u + 0.42, v - 0.30) <= r or math.hypot(u - 0.42, v - 0.30) <= r:
        return True
    # pointe : large sous les lobes, fine en bas
    if -1.25 <= v <= 0.34:
        half = 0.80 * (v + 1.25) / 1.59 + 0.04
        return abs(u) <= min(half, 0.84)
    return False


def diamond(x, y, cx, cy, s):
    u = abs(x - cx) / s
    v = abs(y - cy) / s
    return u + v <= 1.0


def club(x, y, cx, cy, s):
    u = (x - cx) / s
    v = (cy - y) / s
    r = 0.40
    if math.hypot(u, v - 0.34) <= r:
        return True
    if math.hypot(u + 0.44, v + 0.14) <= r or math.hypot(u - 0.44, v + 0.14) <= r:
        return True
    if -0.85 <= v <= 0.05:
        half = 0.15 + 0.05 * (v + 0.85)
        return abs(u) <= half
    return False


def pixel(x, y, size):
    """Couleur du pixel (x, y) pour une icône de côté `size`."""
    c = size / 2.0
    # fond : feutrine dégradée
    t = clamp((y / size) * 1.05)
    col = mix(FELT_A, FELT_B, t)
    # halo doré au centre
    d = math.hypot(x - c, y - c) / (size * 0.62)
    col = mix(col, GOLD_DARK, max(0.0, 0.34 * (1 - d) ** 2))

    # cadre doré
    outer = round_rect(x, y, c, c, size * 0.90, size * 0.90, size * 0.20)
    inner = round_rect(x, y, c, c, size * 0.82, size * 0.82, size * 0.165)
    if outer and not inner:
        col = mix(col, GOLD, 0.92)

    # carte ivoire inclinée
    ang = math.radians(-9)
    dx, dy = x - c, y - c + size * 0.01
    rx = dx * math.cos(ang) + dy * math.sin(ang)
    ry = -dx * math.sin(ang) + dy * math.cos(ang)
    if round_rect(rx, ry, 0, 0, size * 0.50, size * 0.70, size * 0.075):
        col = IVORY
        # liseré intérieur
        if not round_rect(rx, ry, 0, 0, size * 0.44, size * 0.64, size * 0.062):
            col = IVORY_EDGE

    # cœur (rouge), carreau (rouge), trèfle (encre) sur la carte
    hx, hy = c + size * 0.002, c - size * 0.155
    if heart(x, y, hx, hy, size * 0.150):
        col = RED
    lx, ly = c - size * 0.128, c + size * 0.112
    if diamond(x, y, lx, ly, size * 0.098):
        col = RED
    cx2, cy2 = c + size * 0.130, c + size * 0.125
    if club(x, y, cx2, cy2, size * 0.105):
        col = INK
    return col


def write_png(path, size):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            r, g, b = pixel(x + 0.5, y + 0.5, size)
            row += bytes((r, g, b, 255))
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    return len(png)


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in (512, 192, 180, 32):
        path = os.path.join(OUT, f'icon-{size}.png')
        print(f'{path}  {size}×{size}  {write_png(path, size)} octets')


if __name__ == '__main__':
    main()
