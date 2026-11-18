#!/usr/bin/env python3
"""docs/readme/sponsor-de.png und sponsor-en.png: Knopf „Kaffee spendieren“ für die README (gleiche Gestaltung wie bei Jellyfin für Enigma2)."""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
W, H, SS = 720, 150, 4
PINK = (219, 61, 129)
PINK2 = (240, 98, 146)

TEXTS = {
	"sponsor-de.png": ("Kaffee spendieren", "Netzblick unterstützen über GitHub Sponsors"),
	"sponsor-en.png": ("Buy me a coffee", "Support Netzblick via GitHub Sponsors"),
}


def button(title, subtitle):
	img = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
	d = ImageDraw.Draw(img)
	# button with a soft vertical gradient
	grad = Image.new("RGBA", (W * SS, H * SS))
	gd = ImageDraw.Draw(grad)
	for y in range(H * SS):
		t = y / float(H * SS)
		gd.line([(0, y), (W * SS, y)], fill=tuple(int(PINK2[i] * (1 - t) + PINK[i] * t) for i in range(3)) + (255,))
	mask = Image.new("L", (W * SS, H * SS), 0)
	ImageDraw.Draw(mask).rounded_rectangle([0, 0, W * SS - 1, H * SS - 1], radius=36 * SS, fill=255)
	img.paste(grad, (0, 0), mask)
	# coffee cup
	s = SS
	cx, cy = 92 * s, 82 * s
	white = (255, 255, 255, 255)
	d.rounded_rectangle([cx - 40 * s, cy - 26 * s, cx + 30 * s, cy + 34 * s], radius=14 * s, fill=white)
	d.ellipse([cx + 16 * s, cy - 14 * s, cx + 54 * s, cy + 22 * s], outline=white, width=9 * s)
	d.rounded_rectangle([cx - 56 * s, cy + 38 * s, cx + 46 * s, cy + 48 * s], radius=5 * s, fill=white)
	for i, x in enumerate((-22, -4, 14)):
		x0 = cx + x * s
		d.arc([x0 - 9 * s, cy - 62 * s, x0 + 9 * s, cy - 44 * s], 90, 270, fill=white, width=5 * s)
		d.arc([x0 - 9 * s, cy - 46 * s, x0 + 9 * s, cy - 28 * s], 270, 90, fill=white, width=5 * s)
	# heart on the cup
	hx, hy = cx - 5 * s, cy + 6 * s
	d.ellipse([hx - 13 * s, hy - 11 * s, hx + 1 * s, hy + 3 * s], fill=PINK + (255,))
	d.ellipse([hx - 1 * s, hy - 11 * s, hx + 13 * s, hy + 3 * s], fill=PINK + (255,))
	d.polygon([(hx - 13 * s, hy - 3 * s), (hx + 13 * s, hy - 3 * s), (hx, hy + 14 * s)], fill=PINK + (255,))
	# text
	d.text((178 * s, 58 * s), title, font=ImageFont.truetype(FB, 46 * s), fill=white, anchor="lm")
	d.text((180 * s, 108 * s), subtitle, font=ImageFont.truetype(FR, 22 * s), fill=(255, 235, 244, 255), anchor="lm")
	return img.resize((W, H), Image.LANCZOS)


for name, (title, subtitle) in TEXTS.items():
	out = os.path.join(ROOT, "docs", "readme", name)
	button(title, subtitle).save(out, optimize=True)
	print(out)
