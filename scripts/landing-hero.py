"""Bygger landningssidans bild: telefonen (assets/landing/phone.png) läggs in i blomsterspiralen.

  npm run build && node tests/preview/landing-shots.cjs && node scripts/landing-phone.cjs && python3 scripts/landing-hero.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)
K = 3  # arbetsskala
# Telefonens läge i originalbilden (1143 x 1996): mittpunkt och höjd
CX, CY, PH = 500, 772, 500

marked = Image.open(A("assets/landing/spiral-marked.jpg")).convert("RGB")
clean = Image.open(A("assets/landing/spiral-clean.webp")).convert("RGB").resize(marked.size, Image.LANCZOS)
# Ta bort den röda markeringen: ersätt de röda pixlarna med den rena bildens
m = np.array(marked).astype(int)
red = ((m[..., 0] > 170) & (m[..., 1] < 75) & (m[..., 2] < 75)).astype(np.uint8) * 255
redmask = Image.fromarray(red).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(2))
base = Image.composite(clean, marked, redmask)
base = base.resize((base.width * K, base.height * K), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=3, percent=95, threshold=2)).filter(ImageFilter.UnsharpMask(radius=1, percent=40, threshold=3))

phone = Image.open(A("assets/landing/phone.png")).convert("RGBA")
h = PH * K
phone = phone.resize((int(phone.width * h / phone.height), h), Image.LANCZOS)
x0, y0 = CX * K - phone.width // 2, CY * K - phone.height // 2

# Skugga bakom telefonen
alpha = phone.split()[3]
shadow = Image.new("L", base.size, 0)
shadow.paste(alpha, (x0 + 14 * K, y0 + 18 * K))
shadow = shadow.filter(ImageFilter.GaussianBlur(16 * K)).point(lambda v: int(v * 0.42))
out = Image.composite(Image.new("RGB", base.size, (20, 24, 22)), base, shadow)
out.paste(phone, (x0, y0), phone)

# Växtligheten i förgrunden ska ligga framför telefonens nedre del, så att den sitter i spiralen.
b = np.array(base).astype(int)
sky = np.median(b[: 200 * K : 7, :: 7].reshape(-1, 3), axis=0)
dist = np.abs(b - sky).sum(axis=2)
dark = b.sum(axis=2) < sky.sum() - 110
foliage = ((dist > 95) | dark).astype(np.uint8) * 255
fol = Image.fromarray(foliage).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
ramp = np.zeros((base.height, base.width), np.float32)
top, bot = y0 + int(phone.height * 0.80), y0 + int(phone.height * 0.90)
ys = np.arange(base.height)[:, None]
ramp[:] = np.clip((ys - top) / max(1, bot - top), 0, 1)
front = ImageChops.multiply(fol, Image.fromarray((ramp * 255).astype(np.uint8)))
out = Image.composite(base, out, front)

W = 2800
out = out.resize((W, int(out.height * W / out.width)), Image.LANCZOS)
out.save(A("public/landing/spiral.jpg"), quality=86, optimize=True, progressive=True)
print("public/landing/spiral.jpg", out.size, os.path.getsize(A("public/landing/spiral.jpg")) // 1024, "kB")
s = W / 1143
out.crop((int((CX - 330) * s), int((CY - 330) * s), int((CX + 330) * s), int((CY + 330) * s))).resize((900, 900)).save("/tmp/claude-0/-home-user-ryms-app/065d15f7-ef26-57a3-a390-63ae83b79f8d/scratchpad/spiral-check.jpg", quality=88)
