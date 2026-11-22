"""Bygger landningssidans bild: telefonen (assets/landing/phone.png) läggs in i blomsterspiralen.

Telefonen vilar bakåtlutad mot den mörka grenen, med toppen uppåt vänster och foten i lavendeln.

  npm run build && node tests/preview/landing-shots.cjs && node scripts/landing-phone.cjs && python3 scripts/landing-hero.py
"""
import math, os
import numpy as np
from PIL import Image, ImageFilter, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)
K = 2  # arbetsskala

marked = Image.open(A("assets/landing/spiral-marked.jpg")).convert("RGB")
clean = Image.open(A("assets/landing/spiral-clean.webp")).convert("RGB").resize(marked.size, Image.LANCZOS)
base = clean.resize((clean.width * K, clean.height * K), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))

# Telefonens fyra hörn, avlästa ur förlagan assets/landing/phone-placement.png (878 x 1536):
# vänster-upp, höger-upp, höger-ned, vänster-ned.
REF_W = 878
pts = [(280, 503), (377, 500), (441, 716), (347, 729)]
f = marked.width / REF_W
cx, cy = sum(p[0] for p in pts) / 4, sum(p[1] for p in pts) / 4
quad = [(x * f * K, y * f * K) for x, y in pts]
CX, CY = cx * f, cy * f

phone = Image.open(A("assets/landing/phone.png")).convert("RGBA")
phone = phone.crop(phone.getbbox())
PW, PH = phone.size


def coeffs(dst, src):
    a, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b += [u, v]
    return tuple(np.linalg.solve(np.array(a, float), np.array(b, float)))


SS = 2
big = (base.width * SS, base.height * SS)
src = [(0, 0), (PW, 0), (PW, PH), (0, PH)]


def warp(im, q):
    return im.transform(big, Image.PERSPECTIVE, coeffs([(x * SS, y * SS) for x, y in q], src), Image.BICUBIC).resize(base.size, Image.LANCZOS)


layer = warp(phone, quad)
alpha = layer.split()[3]

# Skugga på grenen: tät nära telefonen (den ligger an), mjukare längre ut
out = base
for dx, dy, blur, strength in ((-10, 12, 22, 0.42), (-3, 5, 6, 0.5)):
    sh = Image.new("L", base.size, 0)
    sh.paste(alpha, (dx * K, dy * K))
    sh = sh.filter(ImageFilter.GaussianBlur(blur * K)).point(lambda v, s=strength: int(v * s))
    out = Image.composite(Image.new("RGB", base.size, (14, 18, 16)), out, sh)
# Kantens tjocklek: en mörk kopia strax nedanför till vänster
edge = Image.new("L", base.size, 0)
edge.paste(alpha, (-3 * K, 4 * K))
out = Image.composite(Image.new("RGB", base.size, (26, 28, 30)), out, edge)
out.paste(layer, (0, 0), layer)

# Blommorna runt telefonen ska ligga framför dess kanter, som i ett foto: lavendel och orange blommor
# (inte den mörka grenen, som telefonen vilar mot), plus växtligheten allra längst ned vid foten.
b = np.array(base).astype(int)
R, G, B = b[..., 0], b[..., 1], b[..., 2]
lavender = (B > G + 14) & (R > G - 4) & (R + G + B > 200)
poppy = (R > 170) & (G > 70) & (G < 175) & (B < 110) & (R > G + 40)
pale = (R > 150) & (G > 120) & (B > 110) & (R > B + 12) & (np.abs(b - np.median(b[: 200 * K : 7, :: 7].reshape(-1, 3), axis=0)).sum(axis=2) > 70)
flowers = Image.fromarray((lavender * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.6))
sky = np.median(b[: 200 * K : 7, :: 7].reshape(-1, 3), axis=0)
foliage = ((np.abs(b - sky).sum(axis=2) > 95) | (b.sum(axis=2) < sky.sum() - 110)).astype(np.uint8) * 255
fol = Image.fromarray(foliage).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
ys = np.arange(base.height)[:, None]
y_bot = max(q[1] for q in quad)
ramp = np.clip((ys - (y_bot - 30 * K)) / (20 * K), 0, 1) * np.ones((1, base.width))
foot = ImageChops.multiply(fol, Image.fromarray((ramp * 255).astype(np.uint8)))
front = ImageChops.lighter(flowers, foot)
out = Image.composite(base, out, front)

W = 2000
out = out.resize((W, int(out.height * W / out.width)), Image.LANCZOS)
out.save(A("public/landing/spiral.jpg"), quality=84, optimize=True, progressive=True)
print("public/landing/spiral.jpg", out.size, os.path.getsize(A("public/landing/spiral.jpg")) // 1024, "kB")
s = W / 1143
check = os.environ.get("CHECK")
if check:
    out.crop((int((CX - 330) * s), int((CY - 360) * s), int((CX + 330) * s), int((CY + 300) * s))).resize((900, 900)).save(check, quality=88)
