"""Generate theme preview images using Orblune's shader grading (ported from shaders.ts)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

day_full = Image.open(ROOT / "public/textures/earth-day.jpg").convert("RGB")
night_full = Image.open(ROOT / "public/textures/earth-night.jpg").convert("RGB")
clouds_full = Image.open(ROOT / "public/textures/earth-clouds.jpg").convert("L")

THEMES = ["natural", "aqua", "atlas", "vivid", "noir", "ember", "frost", "verdant", "ink", "sand"]
THEME_INDEX = {name: float(i) for i, name in enumerate(THEMES)}

CROPS = {
    "atlantic": (0.28, 0.72, 0.12, 0.62),
    "pacific": (0.62, 0.98, 0.18, 0.58),
    "asia": (0.55, 0.95, 0.15, 0.55),
}


def crop_uv(img: Image.Image, u0: float, u1: float, v0: float, v1: float) -> Image.Image:
    return img.crop(
        (
            int(u0 * img.width),
            int(v0 * img.height),
            int(u1 * img.width),
            int(v1 * img.height),
        )
    )


def to_f(img: Image.Image) -> np.ndarray:
    return np.asarray(img, dtype=np.float32) / 255.0


def from_f(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(arr * 255.0, 0, 255).astype(np.uint8))


def luma(c: np.ndarray) -> np.ndarray:
    return 0.299 * c[..., 0] + 0.587 * c[..., 1] + 0.114 * c[..., 2]


def mix(a: np.ndarray | float, b: np.ndarray | float, t: np.ndarray | float) -> np.ndarray:
    return np.asarray(a, dtype=np.float32) * (1.0 - t) + np.asarray(b, dtype=np.float32) * t


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def apply_theme_day(c: np.ndarray, theme: float) -> np.ndarray:
    L = luma(c)[..., None]
    L1 = L[..., 0]
    water = (
        ((c[..., 2] >= c[..., 0] + 0.02) & (c[..., 2] >= c[..., 1] - 0.04) & (L1 <= 0.72)).astype(np.float32)
    )[..., None]
    cb = c[..., 2:3]

    if theme < 0.5:
        return c * 1.05
    if theme < 1.5:
        teal = mix(np.array([0.38, 0.78, 0.88]), np.array([0.22, 0.55, 0.70]), 1.0 - cb)
        land = mix(L, c, 0.9) * np.array([0.96, 1.06, 0.94]) * 1.05
        return np.clip(mix(land, teal, water * 0.82), 0.0, 1.0)
    if theme < 2.5:
        ocean = mix(np.array([0.58, 0.70, 0.74]), np.array([0.38, 0.52, 0.58]), 1.0 - cb)
        out = mix(c, ocean, water * 0.7)
        out = mix(L, out, 0.82)
        out = out * np.array([1.12, 1.04, 0.86])
        out = mix(out, out * out * (3.0 - 2.0 * out), 0.16)
        return np.clip(out, 0.0, 1.0)
    if theme < 3.5:
        out = c * 1.15 + (c - L) * 0.55
        out = out * mix(np.array([1.1, 1.12, 0.9]), np.array([0.75, 1.08, 1.35]), water)
        return np.clip(out, 0.0, 1.0)
    if theme < 4.5:
        return np.clip(L * np.array([0.78, 0.88, 1.05]) * 1.08, 0.0, 1.0)
    if theme < 5.5:
        ocean = mix(np.array([0.12, 0.18, 0.42]), np.array([0.05, 0.08, 0.22]), 1.0 - cb)
        land = mix(L, c, 0.55) * np.array([1.45, 0.78, 0.42])
        land = mix(land, np.stack([L1 * 1.2, L1 * 0.55, L1 * 0.22], axis=-1), 0.25)
        return np.clip(mix(land, ocean, water * 0.9), 0.0, 1.0)
    if theme < 6.5:
        ice = mix(np.array([0.45, 0.78, 0.92]), np.array([0.22, 0.48, 0.68]), 1.0 - cb)
        land = mix(L, c, 0.35) * np.array([0.82, 0.98, 1.2])
        land = mix(land, np.array([0.88, 0.94, 1.0]), smoothstep(0.4, 0.85, L1)[..., None] * 0.45)
        return np.clip(mix(land, ice, water * 0.85) * 1.06, 0.0, 1.0)
    if theme < 7.5:
        ocean = mix(np.array([0.1, 0.42, 0.55]), np.array([0.04, 0.22, 0.36]), 1.0 - cb)
        land = mix(L, c, 0.7) * np.array([0.7, 1.35, 0.65])
        g = np.clip(land[..., 1] - np.maximum(land[..., 0], land[..., 2]), 0.0, 1.0)[..., None]
        land = mix(land, np.array([0.25, 0.75, 0.28]) * (0.4 + L), 0.2 + g * 0.35)
        return np.clip(mix(land, ocean, water * 0.8), 0.0, 1.0)
    if theme < 8.5:
        ocean = mix(np.array([0.04, 0.12, 0.32]), np.array([0.01, 0.04, 0.14]), 1.0 - cb)
        land = L * np.array([0.45, 0.75, 1.15])
        land = mix(land, np.array([0.35, 0.7, 0.95]) * L, 0.35)
        return np.clip(mix(land, ocean, water * 0.92), 0.0, 1.0)

    ocean = mix(np.array([0.42, 0.58, 0.62]), np.array([0.28, 0.42, 0.48]), 1.0 - cb)
    land = mix(L, c, 0.5) * np.array([1.35, 1.08, 0.62])
    land = mix(land, np.array([0.95, 0.78, 0.45]) * (0.35 + L * 0.75), 0.32)
    return np.clip(mix(land, ocean, water * 0.72), 0.0, 1.0)


def apply_theme_night(day_graded: np.ndarray, lights: np.ndarray, theme: float) -> np.ndarray:
    L = luma(day_graded)[..., None]
    L1 = L[..., 0]
    lights2 = lights * lights

    if theme < 0.5:
        terrain = mix(np.array([0.02, 0.04, 0.07]), day_graded * np.array([0.18, 0.22, 0.30]), 0.85)
        city = lights2 * 1.8
    elif theme < 1.5:
        terrain = mix(np.array([0.02, 0.05, 0.08]), day_graded * np.array([0.14, 0.24, 0.32]), 0.82)
        city = lights2 * np.array([1.5, 1.7, 1.9]) * 1.5
    elif theme < 2.5:
        terrain = mix(np.array([0.04, 0.03, 0.02]), day_graded * np.array([0.28, 0.22, 0.16]), 0.8)
        city = lights2 * np.array([2.0, 1.5, 0.9]) * 1.6
    elif theme < 3.5:
        terrain = mix(np.array([0.01, 0.03, 0.08]), day_graded * np.array([0.12, 0.18, 0.36]), 0.85)
        city = lights2 * 2.1
    elif theme < 4.5:
        terrain = mix(np.array([0.02, 0.025, 0.04]), L * 0.22, 0.9)
        city = lights2 * np.array([1.9, 1.55, 0.85]) * 1.7
    elif theme < 5.5:
        terrain = mix(np.array([0.06, 0.015, 0.03]), day_graded * np.array([0.4, 0.12, 0.06]), 0.85)
        city = lights2 * np.array([2.6, 1.2, 0.35]) * 2.0
    elif theme < 6.5:
        terrain = mix(np.array([0.015, 0.04, 0.1]), day_graded * np.array([0.1, 0.22, 0.42]), 0.88)
        city = lights2 * np.array([1.15, 1.75, 2.4]) * 1.8
    elif theme < 7.5:
        terrain = mix(np.array([0.015, 0.05, 0.03]), day_graded * np.array([0.08, 0.32, 0.14]), 0.86)
        city = lights2 * np.array([1.85, 1.9, 0.95]) * 1.75
    elif theme < 8.5:
        terrain = mix(np.array([0.005, 0.015, 0.05]), day_graded * np.array([0.06, 0.12, 0.3]), 0.9)
        city = lights2 * np.array([0.9, 1.9, 2.6]) * 2.1
    else:
        terrain = mix(np.array([0.05, 0.03, 0.015]), day_graded * np.array([0.35, 0.22, 0.1]), 0.85)
        city = lights2 * np.array([2.4, 1.5, 0.55]) * 1.75
    return terrain + city


def render_theme(
    theme_name: str,
    day_img: Image.Image,
    night_img: Image.Image,
    cloud_img: Image.Image,
    split: float = 0.5,
    soft: float = 0.16,
) -> Image.Image:
    theme = THEME_INDEX[theme_name]
    day_c = to_f(day_img)
    lights = to_f(night_img)
    cloud = np.asarray(cloud_img, dtype=np.float32) / 255.0

    day_lit = apply_theme_day(day_c, theme)
    day_lit = mix(day_lit, day_lit * day_lit * (3.0 - 2.0 * day_lit), 0.05)
    night = apply_theme_night(day_lit, lights, theme)

    w = day_c.shape[1]
    xs = np.linspace(0, 1, w, dtype=np.float32)
    # Approximate terminator as a vertical softstep (marketing crop)
    day_factor = np.clip((xs - (split - soft)) / (2 * soft), 0.0, 1.0)[None, :, None]
    color = mix(night, day_lit, day_factor)

    cloud_amt = cloud[..., None] * 0.15 * day_factor
    if 3.5 < theme < 4.5:
        cloud_amt *= 0.5
    elif 4.5 < theme < 5.5:
        cloud_amt *= 0.65
    elif 7.5 < theme < 8.5:
        cloud_amt *= 0.5
    color = mix(color, np.array([0.94, 0.96, 0.98]), cloud_amt)
    return from_f(np.clip(color, 0.0, 1.0))


def themed_crop(theme: str, crop_key: str, size: tuple[int, int]) -> Image.Image:
    u0, u1, v0, v1 = CROPS[crop_key]
    d = crop_uv(day_full, u0, u1, v0, v1).resize(size, Image.Resampling.LANCZOS)
    n = crop_uv(night_full, u0, u1, v0, v1).resize(size, Image.Resampling.LANCZOS)
    c = crop_uv(clouds_full, u0, u1, v0, v1).resize(size, Image.Resampling.LANCZOS)
    split = 0.52 if crop_key == "atlantic" else 0.42
    return render_theme(theme, d, n, c, split=split, soft=0.16)


def main() -> None:
    crop_for = {
        "natural": "atlantic",
        "aqua": "pacific",
        "atlas": "atlantic",
        "vivid": "atlantic",
        "noir": "atlantic",
        "ember": "asia",
        "frost": "pacific",
        "verdant": "atlantic",
        "ink": "asia",
        "sand": "asia",
    }

    for theme in THEMES:
        img = themed_crop(theme, crop_for[theme], (960, 540))
        img = ImageEnhance.Contrast(img).enhance(1.02)
        path = OUT / f"theme-{theme}.jpg"
        img.save(path, "JPEG", quality=88, optimize=True, progressive=True)
        print("wrote", path.name)

    # Desktop showcase shots used on the site
    shots = [
        ("natural", "atlantic", "shot-desktop-natural.jpg"),
        ("aqua", "pacific", "shot-desktop-aqua.jpg"),
        ("ember", "asia", "shot-desktop-ember.jpg"),
    ]
    for theme, crop, name in shots:
        img = themed_crop(theme, crop, (1600, 900))
        img.save(OUT / name, "JPEG", quality=88, optimize=True, progressive=True)
        print("wrote", name)


if __name__ == "__main__":
    main()
