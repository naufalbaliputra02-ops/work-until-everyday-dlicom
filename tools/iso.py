"""Tiny pixel-exact 2:1 isometric renderer on top of Pillow.

World units: 1 tile = 16 units. +x runs screen right-down, +y runs screen
left-down, +z is up. Screen: sx = ox + x - y, sy = oy + (x + y) / 2 - z.
Keep x + y even on box corners so every edge lands on the pixel grid.
"""
from __future__ import annotations

import colorsys
from dataclasses import dataclass
from typing import Callable

from PIL import Image, ImageDraw, ImageOps

TILE = 16


def hex2rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def shift(rgb, dl: float, dh: float = 0.0, ds: float = 0.0):
    """Lightness shift with a hue nudge (cool shadows, warm lights)."""
    if isinstance(rgb, str):
        rgb = hex2rgb(rgb)
    r, g, b = (c / 255 for c in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    h = (h + dh) % 1.0
    l = min(1.0, max(0.0, l + dl))
    s = min(1.0, max(0.0, s + ds))
    return tuple(round(c * 255) for c in colorsys.hls_to_rgb(h, l, s))


@dataclass(frozen=True)
class Mat:
    top: tuple
    left: tuple  # +y face
    right: tuple  # +x face
    line: tuple  # silhouette outline
    hi: tuple  # top front edge highlight

    @staticmethod
    def of(base: str, contrast: float = 1.0) -> "Mat":
        c = hex2rgb(base)
        k = contrast
        return Mat(
            top=shift(c, 0.07 * k, -0.005),
            left=c,
            right=shift(c, -0.09 * k, 0.012),
            line=shift(c, -0.30 * k, 0.02, -0.05),
            hi=shift(c, 0.15 * k, -0.01),
        )


@dataclass
class Drawable:
    box: tuple  # x0, x1, y0, y1, z0, z1
    draw: Callable[["Iso"], None]
    shadow: bool = False
    name: str = ""


class Iso:
    def __init__(self, img: Image.Image, ox: int, oy: int):
        self.img = img
        self.ox, self.oy = ox, oy
        self.d = ImageDraw.Draw(img)

    # --- projection -------------------------------------------------------
    def p(self, x, y, z=0):
        return (self.ox + x - y, self.oy + (x + y) // 2 - z)

    def screen_bbox(self, box):
        x0, x1, y0, y1, z0, z1 = box
        pts = [self.p(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
        xs, ys = [q[0] for q in pts], [q[1] for q in pts]
        return min(xs), min(ys), max(xs), max(ys)

    # --- primitives -------------------------------------------------------
    def poly(self, pts, fill):
        self.d.polygon([self.p(*q) for q in pts], fill=fill)

    def line(self, a, b, fill):
        self.d.line([self.p(*a), self.p(*b)], fill=fill)

    def px(self, x, y, z, fill):
        self.d.point(self.p(x, y, z), fill=fill)

    def box(self, x, y, z, w, d, h, m: Mat, outline=True, top=True):
        X, Y, Z = x + w, y + d, z + h
        self.poly([(x, Y, Z), (X, Y, Z), (X, Y, z), (x, Y, z)], m.left)
        self.poly([(X, y, Z), (X, Y, Z), (X, Y, z), (X, y, z)], m.right)
        if top:
            self.poly([(x, y, Z), (X, y, Z), (X, Y, Z), (x, Y, Z)], m.top)
        self.line((x, Y, Z), (X, Y, Z), m.hi)
        self.line((X, y, Z), (X, Y, Z), m.hi)
        if outline:
            hexa = [(x, y, Z), (X, y, Z), (X, y, z), (X, Y, z), (x, Y, z), (x, Y, Z), (x, y, Z)]
            for a, b in zip(hexa, hexa[1:]):
                self.line(a, b, m.line)

    def floor_quad(self, x, y, z, w, d, fill):
        self.poly([(x, y, z), (x + w, y, z), (x + w, y + d, z), (x, y + d, z)], fill)

    # --- texture mapping onto planes (1 image px = 1 world unit) ---------
    def _paste(self, src: Image.Image, data):
        layer = src.convert("RGBA").transform(
            self.img.size, Image.Transform.AFFINE, data, Image.Resampling.NEAREST,
            fillcolor=(0, 0, 0, 0),
        )
        self.img.alpha_composite(layer)

    def plane_z(self, src, x0, y0, z):
        ox, oy = self.ox, self.oy
        # inverse of sx = ox + u - v + x0 - y0, sy = oy + (u + v + x0 + y0) / 2 - z
        self._paste(src, (
            0.5, 1, (-ox - 2 * oy + 2 * z - 2 * x0) / 2 + 0.25,
            -0.5, 1, (ox - 2 * oy + 2 * z - 2 * y0) / 2 + 0.25,
        ))

    def plane_y(self, src, x0, y, ztop):
        """Image on a wall facing +y, left edge at x0, top edge at ztop."""
        ox, oy = self.ox, self.oy
        self._paste(src, (1, 0, -ox - x0 + y, -0.5, 1, -oy + ox / 2 - y + ztop + 0.25))

    def plane_x(self, src, x, y0, ztop):
        """Image on a wall facing +x; image right edge sits at y0 (back)."""
        ox, oy = self.ox, self.oy
        src = ImageOps.mirror(src.convert("RGBA"))
        self._paste(src, (-1, 0, ox + x - y0 + 1, 0.5, 1, -oy - x - ox / 2 + ztop + 0.25))

    def sprite(self, spr: Image.Image, x, y, z=0, anchor=None):
        """Billboard sprite; bottom-centre anchored at the world point."""
        sx, sy = self.p(x, y, z)
        ax, ay = anchor if anchor else (spr.width // 2, spr.height - 1)
        self.img.alpha_composite(spr.convert("RGBA"), (sx - ax, sy - ay))


def depth_sort(iso: Iso, items: list[Drawable]) -> list[Drawable]:
    """Topological painter's sort for axis-aligned boxes."""
    bbs = [iso.screen_bbox(it.box) for it in items]
    behind: list[list[int]] = [[] for _ in items]
    n = len(items)
    for i in range(n):
        a, ba = items[i].box, bbs[i]
        for j in range(i + 1, n):
            b, bb = items[j].box, bbs[j]
            if ba[2] < bb[0] or bb[2] < ba[0] or ba[3] < bb[1] or bb[3] < ba[1]:
                continue
            if a[1] <= b[0] or a[3] <= b[2] or a[5] <= b[4]:
                behind[j].append(i)
            elif b[1] <= a[0] or b[3] <= a[2] or b[5] <= a[4]:
                behind[i].append(j)
            elif sum(a[:4]) <= sum(b[:4]):
                behind[j].append(i)
            else:
                behind[i].append(j)
    out, state = [], [0] * n

    def visit(k):
        if state[k]:  # done, or on the stack (cycle: break it)
            return
        state[k] = 1
        for q in behind[k]:
            visit(q)
        state[k] = 2
        out.append(items[k])

    for k in sorted(range(n), key=lambda k: (items[k].box[1] + items[k].box[3], items[k].box[4])):
        visit(k)
    return out


def outline_sprite(spr: Image.Image, color) -> Image.Image:
    """Add a 1px outline around opaque pixels (4-neighbourhood)."""
    src = spr.convert("RGBA")
    w, h = src.size
    out = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    out.alpha_composite(src, (1, 1))
    a, s = out.load(), src.load()
    for y in range(h + 2):
        for x in range(w + 2):
            if a[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                u, v = x + dx - 1, y + dy - 1
                if 0 <= u < w and 0 <= v < h and s[u, v][3]:
                    a[x, y] = (*color, 255)
                    break
    return out


def from_ascii(rows: list[str], pal: dict[str, str]) -> Image.Image:
    w, h = max(len(r) for r in rows), len(rows)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pix = img.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in pal:
                pix[x, y] = (*hex2rgb(pal[ch]), 255)
    return img
