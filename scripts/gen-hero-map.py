"""Hero map with app-accurate city cards; Dubai instead of China."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "assets"

day = Image.open(ROOT / "public/textures/earth-day.jpg").convert("RGB")
night = Image.open(ROOT / "public/textures/earth-night.jpg").convert("RGB")
clouds = Image.open(ROOT / "public/textures/earth-clouds.jpg").convert("L")

W, H = 2560, 1280
day = day.resize((W, H), Image.Resampling.LANCZOS)
night = night.resize((W, H), Image.Resampling.LANCZOS)
clouds = clouds.resize((W, H), Image.Resampling.LANCZOS)

xs = np.linspace(0, 1, W, dtype=np.float32)
split, soft = 0.48, 0.14
mask_1d = np.clip((xs - (split - soft)) / (2 * soft), 0, 1)
mask = Image.fromarray(np.tile((mask_1d * 255).astype(np.uint8), (H, 1)), mode="L")

night_base = ImageEnhance.Brightness(day).enhance(0.16)
night_base = ImageEnhance.Color(night_base).enhance(0.5)
lights = ImageEnhance.Brightness(night).enhance(1.7)
light_mask = night.convert("L").point(lambda p: min(255, int(p * 1.45)))
night_comp = Image.blend(night_base, Image.composite(lights, night_base, light_mask), 0.6)
base = Image.composite(day, night_comp, mask)
cloud_amt = Image.composite(clouds.point(lambda p: int(p * 0.2)), Image.new("L", (W, H), 0), mask)
base = Image.composite(Image.new("RGB", (W, H), (236, 242, 248)), base, cloud_amt)

vig = Image.new("L", (W, H), 0)
ImageDraw.Draw(vig).ellipse((-W * 0.02, -H * 0.1, W * 1.02, H * 1.12), fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(100))
base = Image.composite(base, Image.new("RGB", (W, H), (3, 6, 12)), vig)
base = ImageEnhance.Contrast(base).enhance(1.05)

SCALE = 1.35
CW = int(158 * SCALE)
PAD_X = int(14 * SCALE)
PAD_Y = int(12 * SCALE)
TIME_SIZE = int(20 * SCALE)
NAME_SIZE = int(10 * SCALE)
TZ_SIZE = int(9 * SCALE)
WX_SIZE = int(12 * SCALE)
ICON = int(14 * SCALE)
META_GAP = int(8 * SCALE)
STEM = int(12 * SCALE)
PIN = int(6 * SCALE)


def font(size: int) -> ImageFont.ImageFont:
    for path in (
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


FT = font(TIME_SIZE)
FN = font(NAME_SIZE)
FZ = font(TZ_SIZE)
FW = font(WX_SIZE)
CH = PAD_Y + int(TIME_SIZE * 1.1) + META_GAP + META_GAP + max(NAME_SIZE, TZ_SIZE) + META_GAP + max(ICON, WX_SIZE) + PAD_Y


def latlon_to_xy(lat: float, lon: float) -> tuple[int, int]:
    return int((lon + 180.0) / 360.0 * W), int((90.0 - lat) / 180.0 * H)


def draw_icon(draw: ImageDraw.ImageDraw, kind: str, x: float, y: float, color: tuple[int, int, int, int]) -> None:
    s = float(ICON)
    if kind == "clear":
        draw.ellipse([x + s * 0.28, y + s * 0.28, x + s * 0.72, y + s * 0.72], outline=color, width=2)
        for a in range(0, 360, 45):
            rad = math.radians(a)
            x0 = x + s / 2 + math.cos(rad) * s * 0.18
            y0 = y + s / 2 + math.sin(rad) * s * 0.18
            x1 = x + s / 2 + math.cos(rad) * s * 0.48
            y1 = y + s / 2 + math.sin(rad) * s * 0.48
            draw.line([(x0, y0), (x1, y1)], fill=color, width=2)
    elif kind == "partly":
        draw.ellipse([x + s * 0.12, y + s * 0.18, x + s * 0.48, y + s * 0.54], outline=color, width=2)
        draw.arc([x + s * 0.22, y + s * 0.42, x + s * 0.92, y + s * 0.95], 200, 340, fill=color, width=2)
        draw.line([(x + s * 0.28, y + s * 0.72), (x + s * 0.86, y + s * 0.72)], fill=color, width=2)
    elif kind == "rain":
        draw.arc([x + s * 0.15, y + s * 0.18, x + s * 0.9, y + s * 0.7], 200, 340, fill=color, width=2)
        draw.line([(x + s * 0.2, y + s * 0.55), (x + s * 0.85, y + s * 0.55)], fill=color, width=2)
        for dx in (0.28, 0.5, 0.72):
            draw.line([(x + s * dx, y + s * 0.62), (x + s * (dx - 0.06), y + s * 0.92)], fill=color, width=2)
    elif kind == "fog":
        for i, yy in enumerate((0.32, 0.52, 0.72)):
            inset = 0.12 + i * 0.05
            draw.line([(x + s * inset, y + s * yy), (x + s * (1 - inset), y + s * yy)], fill=color, width=2)
    else:
        draw.arc([x + s * 0.15, y + s * 0.22, x + s * 0.9, y + s * 0.82], 200, 340, fill=color, width=2)
        draw.line([(x + s * 0.2, y + s * 0.62), (x + s * 0.85, y + s * 0.62)], fill=color, width=2)


def paste_card(
    canvas: Image.Image,
    pin_xy: tuple[int, int],
    time: str,
    city: str,
    tz: str,
    temp: str,
    icon: str,
    home: bool = False,
) -> Image.Image:
    pin_x, pin_y = pin_xy
    x = pin_x - CW // 2
    y = pin_y - CH - STEM - PIN // 2
    x = max(12, min(W - CW - 12, x))
    y = max(12, min(H - CH - STEM - 20, y))

    region = canvas.crop((x, y, x + CW, y + CH)).filter(ImageFilter.GaussianBlur(18))
    region = ImageEnhance.Brightness(region).enhance(0.35 if home else 0.42)
    tint = Image.new("RGBA", (CW, CH), (6, 16, 26, 210) if home else (4, 10, 16, 190))
    frost = Image.alpha_composite(region.convert("RGBA"), tint)

    card = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    card.paste(frost, (0, 0))
    d = ImageDraw.Draw(card)

    border = (143, 214, 234, 180) if home else (220, 235, 245, 55)
    d.rectangle([0, 0, CW - 1, CH - 1], outline=border, width=1)
    d.line([(1, 1), (CW - 2, 1)], fill=(143, 214, 234, 35) if home else (255, 255, 255, 18), width=1)

    d.text((CW / 2, PAD_Y), time, fill=(247, 250, 252, 255), font=FT, anchor="mt")

    meta_top = PAD_Y + int(TIME_SIZE * 1.1) + META_GAP
    d.line([(PAD_X, meta_top), (CW - PAD_X, meta_top)], fill=(220, 235, 245, 40), width=1)

    name_y = meta_top + META_GAP
    name = city.upper()
    nb = d.textbbox((0, 0), name, font=FN)
    zb = d.textbbox((0, 0), tz.upper(), font=FZ)
    nw, zw = nb[2] - nb[0], zb[2] - zb[0]
    total = nw + META_GAP + zw
    nx = (CW - total) / 2
    d.text((nx, name_y), name, fill=(230, 240, 248, 225), font=FN, anchor="lt")
    d.text((nx + nw + META_GAP, name_y + 1), tz.upper(), fill=(160, 190, 210, 165), font=FZ, anchor="lt")

    wx_y = name_y + max(NAME_SIZE, TZ_SIZE) + META_GAP
    temp_bb = d.textbbox((0, 0), temp, font=FW)
    tw = temp_bb[2] - temp_bb[0]
    row_w = ICON + 6 + tw
    rx = (CW - row_w) / 2
    icon_color = (170, 210, 225, 230)
    draw_icon(d, icon, rx, wx_y, icon_color)
    d.text((rx + ICON + 6, wx_y + ICON / 2), temp, fill=(170, 210, 225, 242), font=FW, anchor="lm")

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rectangle([x + 4, y + 8, x + CW + 4, y + CH + 8], fill=(0, 0, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    out = Image.alpha_composite(canvas.convert("RGBA"), shadow)

    stem = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    st = ImageDraw.Draw(stem)
    cx = x + CW // 2
    stem_color = (143, 214, 234, 160) if home else (200, 220, 235, 110)
    st.line([(cx, y + CH), (cx, pin_y)], fill=stem_color, width=1)
    pr = PIN // 2 if not home else (PIN + 1) // 2 + 1
    pin_fill = (143, 214, 234, 255) if home else (232, 242, 248, 255)
    st.ellipse([pin_x - pr, pin_y - pr, pin_x + pr, pin_y + pr], fill=pin_fill)
    st.ellipse([pin_x - pr - 1, pin_y - pr - 1, pin_x + pr + 1, pin_y + pr + 1], outline=(4, 10, 16, 230), width=1)

    out.paste(card, (x, y), card)
    out = Image.alpha_composite(out, stem)
    return out.convert("RGB")


def main() -> None:
    canvas = base.copy()
    cities = [
        (51.5074, -0.1278, "09:42", "London", "BST", "14\u00b0C", "partly", True),
        (40.7128, -74.0060, "04:42", "New York", "EDT", "11\u00b0C", "rain", False),
        (35.6762, 139.6503, "17:42", "Tokyo", "JST", "19\u00b0C", "clear", False),
        (25.2048, 55.2708, "12:42", "Dubai", "GST", "33\u00b0C", "clear", False),
        (-33.8688, 151.2093, "18:42", "Sydney", "AEST", "22\u00b0C", "clear", False),
        (37.7749, -122.4194, "01:42", "San Francisco", "PDT", "13\u00b0C", "fog", False),
    ]
    for lat, lon, time, name, tz, temp, icon, home in cities:
        canvas = paste_card(canvas, latlon_to_xy(lat, lon), time, name, tz, temp, icon, home=home)

    OUT.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT / "hero-map.jpg", "JPEG", quality=88, optimize=True, progressive=True)
    og = canvas.resize((1200, 630), Image.Resampling.LANCZOS)
    og.save(OUT / "og-cover.jpg", "JPEG", quality=85, optimize=True)
    print("card", CW, CH, "bytes", (OUT / "hero-map.jpg").stat().st_size)


if __name__ == "__main__":
    main()
