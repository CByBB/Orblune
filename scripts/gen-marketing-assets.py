"""Generate Orblune marketing screenshots from Earth textures."""

from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

day = Image.open(ROOT / "public/textures/earth-day.jpg").convert("RGB")
night = Image.open(ROOT / "public/textures/earth-night.jpg").convert("RGB")

CROPS = {
    "atlantic": (0.28, 0.72, 0.12, 0.62),
    "pacific": (0.62, 0.98, 0.18, 0.58),
    "asia": (0.55, 0.95, 0.15, 0.55),
}


def crop_uv(img: Image.Image, u0: float, u1: float, v0: float, v1: float) -> Image.Image:
    x0, x1 = int(u0 * img.width), int(u1 * img.width)
    y0, y1 = int(v0 * img.height), int(v1 * img.height)
    return img.crop((x0, y0, x1, y1))


def blend_day_night(day_c: Image.Image, night_c: Image.Image, split: float = 0.48, soft: float = 0.18) -> Image.Image:
    if night_c.size != day_c.size:
        night_c = night_c.resize(day_c.size, Image.Resampling.LANCZOS)
    w, h = day_c.size
    xs = np.linspace(0, 1, w, dtype=np.float32)
    mask_1d = np.clip((xs - (split - soft)) / (2 * soft), 0, 1)
    mask = Image.fromarray(np.tile((mask_1d * 255).astype(np.uint8), (h, 1)), mode="L")

    night_base = ImageEnhance.Brightness(day_c).enhance(0.18)
    night_base = ImageEnhance.Color(night_base).enhance(0.55)
    lights = ImageEnhance.Brightness(night_c).enhance(1.55)
    light_mask = night_c.convert("L").point(lambda p: min(255, int(p * 1.35)))
    night_comp = Image.blend(night_base, Image.composite(lights, night_base, light_mask), 0.55)
    return Image.composite(day_c, night_comp, mask)


def apply_theme(img: Image.Image, theme: str) -> Image.Image:
    if theme == "natural":
        return img.copy()

    arr = np.asarray(img, dtype=np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    L = 0.299 * r + 0.587 * g + 0.114 * b
    water = ((b > r + 5) & (b >= g - 10) & (L < 184)).astype(np.float32)

    if theme == "aqua":
        r = r * (1 - 0.22 * water) * 0.94 + 10
        g = g * (1 + 0.08 * water) * 1.02 + 6
        b = np.minimum(255, b * (1 + 0.22 * water) * 1.08 + 18)
    elif theme == "noir":
        r, g, b = L * 0.9, L * 0.94, np.minimum(255, L * 1.08 + 10)
    elif theme == "ember":
        r, g, b = r * 1.12 + 18, g * 0.92, b * 0.76
    elif theme == "frost":
        r, g, b = r * 0.82 + 18, g * 1.05 + 16, b * 1.18 + 28
    elif theme == "vivid":
        r, g, b = (r - L) * 1.4 + L, (g - L) * 1.4 + L, (b - L) * 1.4 + L
    elif theme == "atlas":
        r, g, b = r * 1.05 + 22, g * 1.0 + 14, b * 0.88
    elif theme == "verdant":
        r, g, b = r * 0.9, g * 1.18 + 10, b * 0.92
    elif theme == "ink":
        r, g, b = r * 0.55 + 8, g * 0.65 + 18, b * 0.95 + 42
    elif theme == "sand":
        r, g, b = r * 1.08 + 28, g * 1.02 + 18, b * 0.75 + 8

    out = np.stack([r, g, b], axis=-1)
    np.clip(out, 0, 255, out=out)
    return Image.fromarray(out.astype(np.uint8))


def themed_crop(theme: str, crop_key: str = "atlantic", size: tuple[int, int] = (1600, 900)) -> Image.Image:
    u0, u1, v0, v1 = CROPS[crop_key]
    d = crop_uv(day, u0, u1, v0, v1).resize(size, Image.Resampling.LANCZOS)
    n = crop_uv(night, u0, u1, v0, v1).resize(size, Image.Resampling.LANCZOS)
    split = 0.52 if crop_key == "atlantic" else 0.4
    base = blend_day_night(d, n, split=split, soft=0.16)
    return apply_theme(base, theme)


def fonts(scale: float):
    try:
        return (
            ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", int(22 * scale)),
            ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", int(10 * scale)),
            ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", int(11 * scale)),
        )
    except OSError:
        d = ImageFont.load_default()
        return d, d, d


def draw_card(draw: ImageDraw.ImageDraw, xy, time, city, tz, weather, home=False, scale=1.0):
    x, y = xy
    w, h = int(158 * scale), int(96 * scale)
    fill = (6, 16, 26, 224) if home else (4, 10, 16, 204)
    outline = (143, 214, 234, 190) if home else (220, 235, 245, 72)
    draw.rounded_rectangle([x + 3, y + 5, x + w + 3, y + h + 5], radius=2, fill=(0, 0, 0, 95))
    draw.rounded_rectangle([x, y, x + w, y + h], radius=2, fill=fill, outline=outline, width=1)
    cx = x + w // 2
    draw.line([(cx, y + h), (cx, y + h + int(12 * scale))], fill=(200, 220, 235, 110), width=1)
    r = max(2, int(3 * scale))
    pin_y = y + h + int(12 * scale)
    draw.ellipse([cx - r, pin_y - r, cx + r, pin_y + r], fill=(232, 242, 248, 255))
    font_time, font_meta, font_wx = fonts(scale)
    draw.text((x + w / 2, y + int(12 * scale)), time, fill=(247, 250, 252, 255), font=font_time, anchor="mt")
    draw.text(
        (x + w / 2, y + int(42 * scale)),
        f"{city}  ·  {tz}",
        fill=(190, 210, 222, 210),
        font=font_meta,
        anchor="mt",
    )
    draw.text((x + w / 2, y + int(66 * scale)), weather, fill=(170, 210, 225, 245), font=font_wx, anchor="mt")


def make_desktop_shot(theme: str, path: Path, crop_key: str = "atlantic"):
    wall = themed_crop(theme, crop_key, size=(1920, 1080))
    vig = Image.new("L", wall.size, 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-220, -140, 2140, 1220], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(90))
    dark = Image.new("RGB", wall.size, (3, 6, 12))
    wall = Image.composite(wall, dark, vig)

    rgba = wall.convert("RGBA")
    overlay = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    cards = [
        ((820, 280), "09:42", "LONDON", "BST", "14°  partly cloudy", True),
        ((1180, 360), "10:42", "PARIS", "CEST", "16°  clear", False),
        ((520, 420), "04:42", "NEW YORK", "EDT", "11°  rain", False),
        ((1400, 520), "12:42", "MOSCOW", "MSK", "8°  overcast", False),
    ]
    for args in cards:
        draw_card(d, *args, scale=1.05)

    d.rectangle([0, 1040, 1920, 1080], fill=(10, 16, 24, 220))
    d.rounded_rectangle([14, 1048, 46, 1072], radius=4, fill=(143, 214, 234, 210))
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
    d.text((58, 1054), "Orblune", fill=(210, 225, 235, 200), font=font)
    d.text((1780, 1054), "10:42", fill=(210, 225, 235, 180), font=font)

    composed = Image.alpha_composite(rgba, overlay).convert("RGB")
    composed.save(path, "JPEG", quality=88, optimize=True)
    print("wrote", path, composed.size)


def make_theme_thumb(theme: str, path: Path):
    crop = "asia" if theme in ("ink", "sand", "ember") else "atlantic"
    if theme in ("aqua", "frost"):
        crop = "pacific"
    img = themed_crop(theme, crop, size=(960, 540))
    img = ImageEnhance.Contrast(img).enhance(1.06)
    img.save(path, "JPEG", quality=86, optimize=True)
    print("wrote", path)


def main():
    make_desktop_shot("natural", OUT / "shot-desktop-natural.jpg")
    make_desktop_shot("aqua", OUT / "shot-desktop-aqua.jpg", "pacific")
    make_desktop_shot("ember", OUT / "shot-desktop-ember.jpg", "asia")

    themes = ["natural", "aqua", "atlas", "vivid", "noir", "ember", "frost", "verdant", "ink", "sand"]
    for t in themes:
        make_theme_thumb(t, OUT / f"theme-{t}.jpg")

    # Compact hero strip for mobile og / social
    hero = themed_crop("natural", "atlantic", size=(1400, 788))
    hero.save(OUT / "og-cover.jpg", "JPEG", quality=85, optimize=True)

    icon = Image.open(ROOT / "src-tauri/icons/icon-transparent.png").convert("RGBA")
    icon.resize((192, 192), Image.Resampling.LANCZOS).save(OUT / "icon-192.png")
    icon.resize((64, 64), Image.Resampling.LANCZOS).save(OUT / "favicon.png")
    shutil.copy(ROOT / "public/orblune.svg", OUT / "orblune.svg")
    print("done")


if __name__ == "__main__":
    main()
