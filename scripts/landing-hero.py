"""Bygger landningssidans hjältebild: lägger in en aktuell skärmbild av appen i telefonen på mossfotot.

  npm run build && node tests/preview/landing-shots.cjs && python3 scripts/landing-hero.py
"""
import glob, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = 3  # förstoring av grundbilden
# Telefonskärmens hörn i grundbilden (vänster-upp, höger-upp, höger-ned, vänster-ned)
QUAD = [(224.0, 86.4), (396.0, 67.8), (538.4, 475.6), (366.0, 507.4)]

base = Image.open(os.path.join(ROOT, "assets/landing/moss-phone.webp")).convert("RGB")
big = base.resize((base.width * K, base.height * K), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2))
quad = [(x * K, y * K) for x, y in QUAD]

shot = Image.open(os.path.join(ROOT, "public/landing/app-home.jpg")).convert("RGB")
W, H = shot.size
d = ImageDraw.Draw(shot)
d.rounded_rectangle((W / 2 - 124, 24, W / 2 + 124, 96), radius=36, fill=(4, 4, 6))  # dynamisk ö
font = ImageFont.truetype(glob.glob(os.path.join(ROOT, "node_modules/@fontsource-variable/geist/files/*latin-wght-normal.woff2"))[0], 30)
d.text((64, 44), "9:41", font=font, fill=(245, 243, 238))
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, W, H), radius=122, fill=255)
glare = Image.new("L", (W, H), 0)
gd = ImageDraw.Draw(glare)
for i in range(H):
    gd.line([(0, i), (W, i)], fill=int(22 * max(0, 1 - i / (H * 0.55))))
shot = Image.composite(Image.new("RGB", (W, H), (255, 255, 255)), shot, glare)


def coeffs(dst, src):
    a, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b += [u, v]
    return tuple(np.linalg.solve(np.array(a, float), np.array(b, float)))


SS = 2
size = (big.width * SS, big.height * SS)
src = [(0, 0), (W, 0), (W, H), (0, H)]
warp = lambda im, q: im.transform(size, Image.PERSPECTIVE, coeffs([(x * SS, y * SS) for x, y in q], src), Image.BICUBIC).resize(big.size, Image.LANCZOS)

# Mörka först originalskärmens ljusa yta så att inget vitt lyser igenom i kanterna
grow = [(q[0] + (2 if i in (1, 2) else -2), q[1] + (2 if i in (2, 3) else -2)) for i, q in enumerate(quad)]
dmask = Image.new("L", (W, H), 0)
ImageDraw.Draw(dmask).rounded_rectangle((-6, -6, W + 6, H + 6), radius=128, fill=255)
big = Image.composite(warp(Image.new("RGB", (W, H), (14, 15, 13)), grow), big, warp(dmask, grow))
out = Image.composite(warp(shot, quad), big, warp(mask, quad))
out.save(os.path.join(ROOT, "public/landing/hero.jpg"), quality=86, optimize=True, progressive=True)
print("public/landing/hero.jpg", out.size)
