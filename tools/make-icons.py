#!/usr/bin/env python3
"""Render the Page Saver toolbar icons.

Chrome needs opaque-free PNGs at 16/32/48/128 so the icon sits correctly on
both light and dark toolbars. Rather than downscaling artwork (which loses
legibility at 16px and drags a white matte along), the design is drawn here as
flat geometry: a folder tab above three list rows.

Stdlib only - no Pillow, no ImageMagick. Run from the extension root:

    python3 tools/make-icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

SIZES = (16, 32, 48, 128)

# 768 divides evenly by every target size, so downsampling is an exact box
# filter with no resampling error.
SUPER = 768

OUT_DIR = Path(__file__).resolve().parent.parent / "icons"

# Matches --accent in shared.css, then progressively lighter rows.
FOLDER = (11, 92, 171)
ROWS = (
    (20, 121, 232),
    (62, 146, 240),
    (122, 174, 245),
)


def rounded_rect(x0: float, y0: float, x1: float, y1: float, r: float):
    """Signed-inside test for an axis-aligned rounded rectangle."""

    def inside(x: float, y: float) -> bool:
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            return False
        cx = min(max(x, x0 + r), x1 - r)
        cy = min(max(y, y0 + r), y1 - r)
        dx = x - cx
        dy = y - cy
        return dx * dx + dy * dy <= r * r

    return inside


def circle(cx: float, cy: float, r: float):
    def inside(x: float, y: float) -> bool:
        dx = x - cx
        dy = y - cy
        return dx * dx + dy * dy <= r * r

    return inside


def build_shapes():
    """Geometry in a 0..1 square; returns (test, colour) pairs."""
    shapes = []

    # Folder: a small tab rounded rect unioned with the wider body below it.
    tab = rounded_rect(0.080, 0.055, 0.380, 0.140, 0.030)
    body = rounded_rect(0.080, 0.105, 0.920, 0.335, 0.038)
    shapes.append((lambda x, y: tab(x, y) or body(x, y), FOLDER))

    # Three list rows: bullet plus pill bar.
    for index, colour in enumerate(ROWS):
        cy = 0.470 + index * 0.185
        half = 0.0675
        bullet = circle(0.155, cy, 0.075)
        bar = rounded_rect(0.265, cy - half, 0.920, cy + half, half)
        shapes.append((lambda x, y, b=bullet, r=bar: b(x, y) or r(x, y), colour))

    return shapes


def render_master(n: int):
    """Hard-edged colour + coverage mask at n x n."""
    shapes = build_shapes()
    # Flat arrays of r, g, b, coverage.
    pixels = bytearray(n * n * 3)
    cover = bytearray(n * n)

    for py in range(n):
        y = (py + 0.5) / n
        row = py * n
        for px in range(n):
            x = (px + 0.5) / n
            for shape, colour in shapes:
                if shape(x, y):
                    i = row + px
                    pixels[i * 3] = colour[0]
                    pixels[i * 3 + 1] = colour[1]
                    pixels[i * 3 + 2] = colour[2]
                    cover[i] = 1
                    break

    return pixels, cover


def downsample(pixels: bytearray, cover: bytearray, n: int, size: int):
    """Box filter to size x size, producing straight-alpha RGBA rows."""
    factor = n // size
    area = factor * factor
    rows = []

    for oy in range(size):
        row = bytearray()
        for ox in range(size):
            r = g = b = hits = 0
            for sy in range(oy * factor, (oy + 1) * factor):
                base = sy * n
                for sx in range(ox * factor, (ox + 1) * factor):
                    i = base + sx
                    if cover[i]:
                        hits += 1
                        r += pixels[i * 3]
                        g += pixels[i * 3 + 1]
                        b += pixels[i * 3 + 2]
            if hits:
                # Average only covered subpixels so edges keep their hue
                # instead of darkening toward transparent black.
                row += bytes((r // hits, g // hits, b // hits, (hits * 255) // area))
            else:
                row += b"\x00\x00\x00\x00"
        rows.append(row)

    return rows


def write_png(path: Path, size: int, rows: list[bytearray]) -> None:
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type: none
        raw += row

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"rendering {SUPER}x{SUPER} master…")
    pixels, cover = render_master(SUPER)

    for size in SIZES:
        rows = downsample(pixels, cover, SUPER, size)
        path = OUT_DIR / f"icon-{size}.png"
        write_png(path, size, rows)
        print(f"wrote {path.relative_to(OUT_DIR.parent)} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
