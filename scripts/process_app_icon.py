#!/usr/bin/env python3
"""
Recadre les marges noires d'une icône carrée, redimensionne en 1024,
puis exporte icon-512.png et apple-touch-icon.png (180) pour PWA / iOS.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image
import numpy as np


def trim_non_black(im: Image.Image, threshold: int = 28) -> Image.Image:
    """Recadre sur la zone où le pixel n'est pas (quasi) noir opaque."""
    rgba = im.convert("RGBA")
    arr = np.array(rgba)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    # Visible et pas noir pur (marges)
    mask = (a > 10) & ((r + g + b) > threshold)
    if not np.any(mask):
        return im
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    row_idx = np.where(rows)[0]
    col_idx = np.where(cols)[0]
    y0, y1 = int(row_idx[0]), int(row_idx[-1]) + 1
    x0, x1 = int(col_idx[0]), int(col_idx[-1]) + 1
    return rgba.crop((x0, y0, x1, y1))


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    public = root / "public"

    src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if src is None or not src.is_file():
        print("Usage: process_app_icon.py <source-1024.png>", file=sys.stderr)
        sys.exit(1)

    im = Image.open(src)
    trimmed = trim_non_black(im)
    # Remplit tout le carré 1024 (évite l'effet « petite icône au milieu »)
    w, h = trimmed.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - w) // 2
    oy = (side - h) // 2
    canvas.paste(trimmed, (ox, oy), trimmed if trimmed.mode == "RGBA" else None)

    final = canvas.resize((1024, 1024), Image.Resampling.LANCZOS)

    final.save(public / "icon-1024.png", "PNG", optimize=True)

    # PWA / navigateurs
    final.resize((512, 512), Image.Resampling.LANCZOS).save(
        public / "icon-512.png", "PNG", optimize=True
    )
    final.resize((192, 192), Image.Resampling.LANCZOS).save(
        public / "icon-192.png", "PNG", optimize=True
    )

    # iOS écran d'accueil (180×180 recommandé)
    final.resize((180, 180), Image.Resampling.LANCZOS).save(
        public / "apple-touch-icon.png", "PNG", optimize=True
    )

    print(f"OK: icon-1024.png, icon-512.png, icon-192.png, apple-touch-icon.png")


if __name__ == "__main__":
    main()
