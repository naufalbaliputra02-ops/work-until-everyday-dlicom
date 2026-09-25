"""Palette, sprites and textures for the Dlicom retro office."""
from __future__ import annotations

import math
import random
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw

from iso import from_ascii, hex2rgb, outline_sprite, shift

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"

# Brand colours sampled from the supplied logo / banner / mascot art.
BRAND_BLACK = "#010101"
BRAND_NAVY = "#0a1041"
BRAND_BLUE = "#2a37b7"
BRAND_ROYAL = "#246dc5"
BRAND_CYAN = "#67c6dd"
BRAND_VIOLET = "#593bd3"
BRAND_MAGENTA = "#d43be0"
BRAND_ORANGE = "#f5a623"
BRAND_CREAM = "#f6e3c0"

# Muted retro-office base palette (grey / beige) + plant greens.
CARPET_A = "#8e8c87"
CARPET_B = "#878580"
CARPET_GROUT = "#7a7873"
CARPET_FLECK = "#96948f"
WOOD_A = "#b89f7a"
WOOD_B = "#ad936d"
WOOD_SEAM = "#977d59"
WALL_PAINT = "#d9cdb2"
WALL_STRIPE = "#d1c4a8"
WAINSCOT = "#a8a293"
WAINSCOT_DARK = "#958f80"
RAIL = "#e6dcc4"
BASEBOARD = "#6d655a"
WALL_CAP = "#5c554d"
FABRIC = "#8a8f99"
TRIM = "#d8cdb4"
DESK = "#c7b089"
CRT = "#d3c9ae"
METAL = "#a5a6a6"
CHAIR = "#4a4d57"
POT = "#b0714f"
GREENS = ["#24452e", "#356440", "#4f8a4a", "#79ae5a", "#a3cc72"]
OUTLINE = "#2b2a33"


def rgba(h, a=255):
    return (*hex2rgb(h), a) if isinstance(h, str) else (*h, a)


# --------------------------------------------------------------------------
# Mascots — pixel re-draws of the three Dlicom characters (small in-world
# size). The full-size originals are also used directly on the wall poster.
# --------------------------------------------------------------------------
_FEET = [
    ".....OOOOOOOOOO.....",
    ".....OMMO..OMMO.....",
    ".....ODDO..ODDO.....",
    "......OO....OO......",
]

MASCOT_ROWS = {
    # Blue: big diamond eyes, finger raised ("one more thing").
    "blue": [
        ".O...OOOOOOOOOO.....",
        "OMO.ODDDDDDDDDDO....",
        "OMOODDDDDDDDDDDDO...",
        "OMOOMLLMMMMMMMMMO...",
        "OMMOMMWMMMMMMWMMO...",
        "OMMOMWKWMMMMWKWMO...",
        "ODDOWKKKWMMWKKKWO...",
        ".OOOMWKWMMMMWKWMOMO.",
        "...OMMWMMKKMMWMMOMMO",
        "...OMMMMMMMMMMMMODDO",
        "...ODMMMMMMMMMMDOOO.",
        "....ODDDDDDDDDDO....",
    ] + _FEET,
    # Pink: shades on, cheeky toothy grin.
    "pink": [
        ".....OOOOOOOOOO.....",
        "....OLLLLLLLLLLO....",
        "...OLLLLLLLLLLLLO...",
        "...OMMMMMMMMMMMMO...",
        "...OMMMMMMMMMMMMO...",
        "...OMKKKKMMKKKKMO...",
        "...OMKWWKKKKWWKMO...",
        ".OOOMMKKMMMMKKMMOOO.",
        "OMMOMMMMKWWKMMMMOMMO",
        "ODDOMMMMMKKMMMMMODDO",
        ".OOODMMMMMMMMMMDOOO.",
        "....ODDDDDDDDDDO....",
    ] + _FEET,
    # Orange: diamond eyes and an office tie.
    "orange": [
        ".....OOOOOOOOOO.....",
        "....ODDDDDDDDDDO....",
        "...ODDDDDDDDDDDDO...",
        "...OMLLMMMMMMMMMO...",
        "...OMMWMMMMMMWMMO...",
        "...OMWKWMMMMWKWMO...",
        "...OWKKKWMMWKKKWO...",
        ".OOOMWKWMMMMWKWMOOO.",
        "OMMOMMWMMKKMMWMMOMMO",
        "OMMOMMMMWRRWMMMMOMMO",
        "ODDODMMMMRRMMMMDODDO",
        ".OO.ODDDDRRDDDDO.OO.",
        ".....OOOORROOOO.....",
    ] + _FEET[1:],
}

MASCOT_PAL = {
    "blue": {"O": "#0b2a78", "D": "#1f4fc8", "M": "#3b7cf0", "L": "#8bb0ea", "W": "#ffffff", "K": "#0a0a14"},
    "pink": {"O": "#6b1f5f", "D": "#c55ab5", "M": "#ff9ff0", "L": "#ffd3fa", "W": "#ffffff", "K": "#231020"},
    "orange": {"O": "#4d1f05", "D": "#9c4508", "M": "#d9690e", "L": "#f29a45", "W": "#ffffff", "K": "#140a05", "R": "#d7263d"},
}

# Last three rows of every mascot are its feet; walking swaps in a raised foot.
FEET_FRAMES = {
    "idle": [".....OMMO..OMMO.....", ".....ODDO..ODDO.....", "......OO....OO......"],
    "stepL": [".....OMMO..ODDO.....", ".....ODDO...OO......", "......OO............"],
    "stepR": [".....ODDO..OMMO.....", "......OO...ODDO.....", "............OO......"],
}
MASCOT_FRAMES = list(FEET_FRAMES)


@lru_cache(None)
def mascot(name: str, frame: str = "idle") -> Image.Image:
    rows = MASCOT_ROWS[name][:-3] + FEET_FRAMES[frame]
    return from_ascii(rows, MASCOT_PAL[name])


# --------------------------------------------------------------------------
# Plants (procedural, seeded => deterministic)
# --------------------------------------------------------------------------
def _shade_for(x, y, w, h):
    t = (y / h) * 0.75 + (x / w) * 0.35  # light from top-left
    return GREENS[4 - min(3, int(t * 4))]


@lru_cache(None)
def plant_bush(seed: int = 3) -> Image.Image:
    rnd = random.Random(seed)
    w, h = 20, 18
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    blobs = []
    for _ in range(26):
        a = rnd.uniform(0, 6.283)
        r = rnd.uniform(0, 1) ** 0.6
        cx = w / 2 + r * 8 * math.cos(a)
        cy = h * 0.55 + r * 6.5 * math.sin(a) - (1 - r) * 3
        blobs.append((cy, cx, rnd.choice([2, 2, 3])))
    for cy, cx, s in sorted(blobs):  # back to front
        col = _shade_for(cx, cy, w, h)
        d.ellipse([cx - s, cy - s * 0.8, cx + s, cy + s * 0.8], fill=rgba(col))
        d.point((round(cx - s / 2), round(cy - s / 2)), fill=rgba(shift(col, 0.08)))
    # leaf tips poking out
    for _ in range(9):
        x, y = rnd.randrange(2, w - 2), rnd.randrange(1, h - 5)
        if img.getpixel((x, y + 1))[3]:
            img.putpixel((x, y), rgba(GREENS[3]))
    return outline_sprite(img, hex2rgb(GREENS[0]))


@lru_cache(None)
def plant_tall(seed: int = 7) -> Image.Image:
    """Snake-plant: upright pointed blades with a pale edge stripe."""
    rnd = random.Random(seed)
    w, h = 16, 26
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pix = img.load()
    blades = [(3, 16), (5, 22), (7, 25), (9, 20), (11, 24), (13, 15), (6, 13), (10, 12)]
    for bx, bh in sorted(blades, key=lambda b: -b[1]):
        lean = rnd.choice([-1, 0, 0, 1])
        for y in range(h - bh, h):
            t = (y - (h - bh)) / bh
            width = 1 if t < 0.12 else 2 if t < 0.35 else 3
            cx = bx + round(lean * (1 - t) * 2)
            for k in range(width):
                x = cx - width // 2 + k
                if 0 <= x < w:
                    col = GREENS[2] if k == 0 else GREENS[1]
                    if k == width - 1 and width == 3:
                        col = GREENS[4] if (y // 3) % 2 else GREENS[3]
                    pix[x, y] = rgba(col)
    return outline_sprite(img, hex2rgb(GREENS[0]))


# --------------------------------------------------------------------------
# Brand images -> pixel art
# --------------------------------------------------------------------------
def pixelate(path: Path, size: tuple[int, int], colors: int) -> Image.Image:
    src = Image.open(path).convert("RGB")
    small = src.resize(size, Image.Resampling.BOX)
    q = small.quantize(colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return q.convert("RGBA")


def framed(img: Image.Image, frame=OUTLINE, mat=None) -> Image.Image:
    pad = 2 if mat else 1
    out = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), rgba(frame))
    if mat:
        ImageDraw.Draw(out).rectangle([1, 1, out.width - 2, out.height - 2], fill=rgba(mat))
    out.alpha_composite(img, (pad, pad))
    return out


@lru_cache(None)
def logo_mark(size: int) -> Image.Image:
    """White Dlicom mark extracted from the logo artwork (alpha mask)."""
    src = Image.open(BRAND / "dlicom-logo.png").convert("L")
    bbox = src.point(lambda v: 255 if v > 200 else 0).getbbox()
    crop = src.crop(bbox)
    side = max(crop.size)
    sq = Image.new("L", (side, side), 0)
    sq.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    m = sq.resize((size, size), Image.Resampling.BOX).point(lambda v: 255 if v > 140 else 0)
    return m


@lru_cache(None)
def poster_banner() -> Image.Image:
    return framed(pixelate(BRAND / "dlicom-banner.png", (72, 24), 14), mat="#e8e2d2")


@lru_cache(None)
def poster_logo() -> Image.Image:
    return framed(pixelate(BRAND / "dlicom-logo.png", (26, 26), 12), mat="#e8e2d2")


@lru_cache(None)
def poster_mascots() -> Image.Image:
    return framed(pixelate(BRAND / "dlicom-mascots.png", (54, 16), 14), mat="#e8e2d2")


def logo_rug(size: int = 48) -> Image.Image:
    """Floor rug: brand-blue field, cyan border, white Dlicom mark."""
    img = Image.new("RGBA", (size, size), rgba(BRAND_BLUE))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, size - 1, size - 1], outline=rgba(BRAND_NAVY))
    d.rectangle([2, 2, size - 3, size - 3], outline=rgba(BRAND_CYAN))
    # soft vertical "light bars" like the logo background
    for x in range(4, size - 4):
        if x % 3 == 0:
            for y in range(size - 16, size - 4):
                if (x + y) % 2 == 0:
                    img.putpixel((x, y), rgba(BRAND_ROYAL))
    mark = logo_mark(size - 14)
    white = Image.new("RGBA", mark.size, rgba("#f4f1ea"))
    img.paste(white, (7, 7), mark)
    return img


# --------------------------------------------------------------------------
# Surface textures
# --------------------------------------------------------------------------
def floor_texture(w: int, h: int, wood_zone=None) -> Image.Image:
    rnd = random.Random(11)
    img = Image.new("RGBA", (w, h))
    pix = img.load()
    for y in range(h):
        for x in range(w):
            tx, ty = x // 16, y // 16
            in_wood = wood_zone and wood_zone[0] <= x < wood_zone[1] and wood_zone[2] <= y < wood_zone[3]
            if in_wood:
                # planks run along x, 8 wide, staggered joints
                plank = y // 8
                joint = (x + plank * 21) % 40 == 0
                col = WOOD_SEAM if y % 8 == 0 or joint else (WOOD_A if plank % 2 else WOOD_B)
                if col != WOOD_SEAM and rnd.random() < 0.04:
                    col = shift(col, -0.03)
            else:
                col = CARPET_A if (tx + ty) % 2 == 0 else CARPET_B
                if x % 16 == 0 or y % 16 == 0:
                    col = CARPET_GROUT
                elif rnd.random() < 0.06:
                    col = CARPET_FLECK
            pix[x, y] = rgba(col)
    return img


def wall_texture(w: int, h: int) -> Image.Image:
    img = Image.new("RGBA", (w, h))
    pix = img.load()
    for y in range(h):
        z = h - 1 - y  # height above floor
        for x in range(w):
            if z < 3:
                col = BASEBOARD
            elif z < 20:
                col = WAINSCOT_DARK if x % 16 in (0, 15) or z in (3, 18) else WAINSCOT
            elif z < 22:
                col = RAIL
            else:
                col = WALL_STRIPE if x % 6 == 0 else WALL_PAINT
            pix[x, y] = rgba(col)
    return img


def window_texture(w: int = 36, h: int = 28) -> Image.Image:
    """Blinds half open over a brand-gradient night skyline."""
    img = Image.new("RGBA", (w, h), rgba("#e9e4d8"))
    d = ImageDraw.Draw(img)
    sky = [BRAND_BLACK, BRAND_NAVY, BRAND_BLUE, BRAND_ROYAL, BRAND_CYAN]
    gx0, gy0, gx1, gy1 = 2, 2, w - 3, h - 3
    for y in range(gy0, gy1 + 1):
        t = (y - gy0) / (gy1 - gy0)
        d.line([(gx0, y), (gx1, y)], fill=rgba(sky[min(4, int(t * 5))]))
    rnd = random.Random(5)
    x = gx0
    while x <= gx1:  # skyline blocks
        bw, bh = rnd.randint(3, 6), rnd.randint(5, 12)
        d.rectangle([x, gy1 - bh, min(gx1, x + bw - 1), gy1], fill=rgba("#0d1233"))
        for wy in range(gy1 - bh + 2, gy1, 2):
            for wx in range(x + 1, min(gx1, x + bw - 1), 2):
                if rnd.random() < 0.35:
                    d.point((wx, wy), fill=rgba(BRAND_ORANGE if rnd.random() < 0.3 else BRAND_CREAM))
        x += bw + 1
    for y in range(gy0, gy0 + 11, 2):  # blinds pulled down over the top
        d.line([(gx0, y), (gx1, y)], fill=rgba("#d8d0bd"))
    d.line([(gx0, gy0 + 11), (gx1, gy0 + 11)], fill=rgba("#b5ab94"))
    d.line([(w // 2, gy0), (w // 2, gy1)], fill=rgba("#e9e4d8"))
    d.rectangle([0, 0, w - 1, h - 1], outline=rgba("#8f887a"))
    d.line([(1, h - 2), (w - 2, h - 2)], fill=rgba("#f5f1e8"))
    return img


def whiteboard_texture(w: int = 40, h: int = 22) -> Image.Image:
    img = Image.new("RGBA", (w, h), rgba("#f4f3ee"))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], outline=rgba("#8c8f94"))
    d.line([(1, h - 2), (w - 2, h - 2)], fill=rgba("#b9bcc1"))
    # tiny rising bar chart in brand colours + scribbles
    for i, (hgt, col) in enumerate([(4, BRAND_MAGENTA), (7, BRAND_ORANGE), (10, BRAND_BLUE), (13, BRAND_CYAN)]):
        x = 4 + i * 5
        d.rectangle([x, h - 4 - hgt, x + 2, h - 4], fill=rgba(col))
    d.line([(3, h - 4), (24, h - 4)], fill=rgba("#44464d"))
    for y, ln in ((4, 9), (7, 7), (10, 10)):
        d.line([(27, y), (27 + ln, y)], fill=rgba("#5c6ab0"))
    d.point((30, 14), fill=rgba(BRAND_MAGENTA))
    d.line([(28, 15), (35, 15)], fill=rgba("#44464d"))
    return img


def clock_texture() -> Image.Image:
    return from_ascii([
        "..OOO..",
        ".OWWWO.",
        "OWWKWWO",
        "OWWKKWO",
        "OWWWWWO",
        ".OWWWO.",
        "..OOO..",
    ], {"O": "#44464d", "W": "#f4f3ee", "K": "#1b1b22"})


def screen_texture(kind: str, w: int = 8, h: int = 6) -> Image.Image:
    img = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(img)
    if kind == "logo":
        rows = [BRAND_NAVY, BRAND_BLUE, BRAND_BLUE, BRAND_ROYAL, BRAND_ROYAL, BRAND_CYAN]
        for y in range(h):
            d.line([(0, y), (w - 1, y)], fill=rgba(rows[min(len(rows) - 1, y * len(rows) // h)]))
        cx, cy = w // 2, h // 2  # the diamond at the heart of the mark
        for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
            d.point((cx + dx - 1, cy + dy), fill=rgba("#ffffff"))
    elif kind == "code":
        d.rectangle([0, 0, w, h], fill=rgba("#0c2415"))
        for y, ln in ((1, 5), (2, 3), (3, 6), (4, 2)):
            d.line([(1, y), (ln, y)], fill=rgba("#58d27a"))
    elif kind == "chat":
        d.rectangle([0, 0, w, h], fill=rgba(BRAND_BLACK))
        d.rectangle([1, 1, 3, 2], fill=rgba(BRAND_ORANGE))
        d.rectangle([4, 3, 6, 4], fill=rgba(BRAND_MAGENTA))
        d.point((1, 4), fill=rgba("#4b5cff"))
    else:  # off / screensaver
        d.rectangle([0, 0, w, h], fill=rgba("#15192a"))
        d.point((2, 1), fill=rgba("#3a4270"))
    img.putpixel((0, 0), rgba("#5a6070"))  # glass glint
    return img
