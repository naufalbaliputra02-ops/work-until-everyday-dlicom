"""Furniture builders. Each returns Drawables positioned in world units."""
from __future__ import annotations

from iso import Drawable, Iso, Mat
import assets as A

M_DESK = Mat.of(A.DESK)
M_DESK_LEG = Mat.of("#8d7a5c")
M_CRT = Mat.of(A.CRT)
M_CRT_BACK = Mat.of("#bfb59a")
M_FABRIC = Mat.of(A.FABRIC)
M_TRIM = Mat.of(A.TRIM)
M_METAL = Mat.of(A.METAL)
M_CHAIR = Mat.of(A.CHAIR)
M_CHAIR_SEAT = Mat.of("#3a44a0")
M_POT = Mat.of(A.POT)
M_COOLER = Mat.of("#dcdcd6")
M_WATER = Mat.of(A.BRAND_CYAN, 0.7)
M_PAPER = Mat.of("#f1eee6", 0.5)
M_KEYS = Mat.of("#cfc6ab", 0.6)
M_COUCH = Mat.of("#3c46a8")
M_TABLE = Mat.of("#9b8160")
M_COPIER = Mat.of("#cbc4b0")
M_DARK = Mat.of("#3a3a40")


def D(box, fn, shadow=False, name=""):
    x0, y0, z0, w, d, h = box
    return Drawable((x0, x0 + w, y0, y0 + d, z0, z0 + h), fn, shadow, name)


def simple(x, y, z, w, d, h, m, name="", shadow=False):
    return D((x, y, z, w, d, h), lambda iso: iso.box(x, y, z, w, d, h, m), shadow, name)


# --- cubicle pieces --------------------------------------------------------
def partition(x, y, w, d, h=22, accent=None):
    def draw(iso: Iso):
        iso.box(x, y, 0, w, d, h - 2, M_FABRIC)
        iso.box(x, y, h - 2, w, d, 2, M_TRIM)
        if accent and w > d:  # pinned sticky notes on the inner (+y) face
            for i, (dx, dz) in enumerate(((6, 14), (9, 12), (30, 15))):
                iso.px(x + dx, y + d, dz, accent if i != 1 else A.BRAND_CREAM)
                iso.px(x + dx + 1, y + d, dz, accent if i != 1 else A.BRAND_CREAM)
    return D((x, y, 0, w, d, h), draw, name="partition")


def desk(x, y, w, d, h=14):
    def draw(iso: Iso):
        iso.box(x + 1, y + 1, 0, 2, 2, h - 2, M_DESK_LEG)
        iso.box(x + w - 3, y + d - 3, 0, 2, 2, h - 2, M_DESK_LEG)
        iso.box(x + w - 3, y + 1, 0, 2, 2, h - 2, M_DESK_LEG)
        iso.box(x + 1, y + d - 3, 0, 2, 2, h - 2, M_DESK_LEG)
        iso.box(x, y, h - 2, w, d, 2, M_DESK)
    return D((x, y, 0, w, d, h), draw, shadow=True, name="desk")


def pedestal(x, y, h=12):
    def draw(iso: Iso):
        iso.box(x, y, 0, 8, 10, h, M_METAL)
        for z in (4, 8):
            iso.line((x, y + 10, z), (x + 8, y + 10, z), M_METAL.line)
            iso.px(x + 4, y + 10, z + 2, M_METAL.line)
    return D((x, y, 0, 8, 10, h), draw, name="pedestal")


def crt(x, y, z, screen="logo"):
    """Beige CRT facing +y: bezel box + tube behind + screen image."""
    tex = A.screen_texture(screen)

    def draw(iso: Iso):
        iso.box(x + 1, y, z, 10, 8, 2, M_CRT_BACK)  # stand
        iso.box(x + 2, y, z + 2, 8, 6, 8, M_CRT_BACK)  # tube
        iso.box(x, y + 6, z + 1, 12, 4, 11, M_CRT)  # bezel
        iso.plane_y(tex, x + 2, y + 10, z + 10)
        iso.px(x + 10, y + 10, z + 2, "#5bd36b")  # power LED
    return D((x, y, z, 12, 10, 12), draw, name="crt")


def keyboard(x, y, z):
    def draw(iso: Iso):
        iso.box(x, y, z, 10, 4, 1, M_KEYS)
        for k in range(1, 10, 2):
            iso.px(x + k, y + 2, z + 1, M_KEYS.line)
    return D((x, y, z, 10, 4, 1), draw, name="keyboard")


def mug(x, y, z, color):
    m = Mat.of(color)
    return D((x, y, z, 2, 2, 3), lambda iso: iso.box(x, y, z, 2, 2, 3, m), name="mug")


def papers(x, y, z, n=2):
    return simple(x, y, z, 6, 8, n, M_PAPER, "papers")


def chair(x, y, facing="-y"):
    """Office chair; backrest on the side away from the desk."""
    def draw(iso: Iso):
        iso.box(x + 1, y + 1, 0, 8, 8, 1, M_DARK)  # star base
        iso.box(x + 4, y + 4, 1, 2, 2, 5, M_DARK)  # gas lift
        iso.box(x, y, 6, 10, 10, 3, M_CHAIR_SEAT)
        if facing == "-y":
            iso.box(x + 1, y + 8, 9, 8, 2, 10, M_CHAIR_SEAT)
        else:
            iso.box(x + 8, y + 1, 9, 2, 8, 10, M_CHAIR_SEAT)
    return D((x, y, 0, 10, 10, 19), draw, shadow=True, name="chair")


def cubicle(x, y, accent, screen="logo", *, right_wall=True, mug_color=None, extra=None):
    """3x3-tile cubicle: back + left (+ right) partitions, L-desk, CRT, chair."""
    s = 48
    out = [
        partition(x, y, s, 2, accent=accent),
        partition(x, y + 2, 2, s - 2),
        desk(x + 2, y + 2, s - 4, 14),
        desk(x + 2, y + 16, 14, 22),
        pedestal(x + 36, y + 4),
        crt(x + 18, y + 2, 14, screen),
        keyboard(x + 19, y + 13, 14),
        papers(x + 5, y + 22, 14),
        chair(x + 20, y + 22),
    ]
    if mug_color:
        out.append(mug(x + 34, y + 8, 14, mug_color))
    if right_wall:
        out.append(partition(x + s, y, 2, s))
    if extra:
        out += extra
    return out


# --- room furniture ---------------------------------------------------------
def filing_cabinet(x, y, h=30):
    def draw(iso: Iso):
        iso.box(x, y, 0, 14, 12, h, M_METAL)
        for z in range(2, h - 2, 7):
            top = z + 6
            iso.line((x + 1, y + 12, top), (x + 13, y + 12, top), M_METAL.line)
            iso.line((x + 1, y + 12, z), (x + 13, y + 12, z), M_METAL.hi)
            iso.line((x + 5, y + 12, z + 3), (x + 9, y + 12, z + 3), "#5d5f63")  # handle
            iso.px(x + 6, y + 12, z + 5, "#f1eee6")  # label
            iso.px(x + 8, y + 12, z + 5, "#f1eee6")
    return D((x, y, 0, 14, 12, h), draw, shadow=True, name="filing_cabinet")


def water_cooler(x, y):
    def draw(iso: Iso):
        iso.box(x, y, 0, 10, 10, 18, M_COOLER)
        iso.line((x, y + 10, 12), (x + 10, y + 10, 12), M_COOLER.line)  # drip tray
        iso.px(x + 3, y + 10, 15, "#3b7cf0")  # cold tap
        iso.px(x + 7, y + 10, 15, "#d7263d")  # hot tap
        iso.box(x + 2, y + 2, 18, 6, 6, 1, M_COOLER)
        iso.box(x + 1, y + 1, 19, 8, 8, 10, M_WATER)
        iso.box(x + 3, y + 3, 29, 4, 4, 2, M_WATER)
        for z in (21, 22, 23, 24, 25, 26, 27):  # glassy glint
            iso.px(x + 2, y + 9, z, "#c8f2fb")
        iso.box(x + 10, y + 3, 10, 2, 3, 5, M_PAPER)  # cup dispenser
    return D((x, y, 0, 12, 10, 31), draw, shadow=True, name="water_cooler")


def plant(x, y, kind="bush", size=8):
    spr = A.plant_bush() if kind == "bush" else A.plant_tall()

    def draw(iso: Iso):
        iso.box(x, y, 0, size, size, 7, M_POT)
        iso.box(x + 1, y + 1, 7, size - 2, size - 2, 0, Mat.of("#4a3426"), outline=False)
        iso.sprite(spr, x + size // 2, y + size // 2, 6)
    return D((x, y, 0, size, size, 7 + spr.height), draw, shadow=True, name=f"plant_{kind}")


def couch(x, y, length=64):
    """Couch against a +x-facing wall, seat facing +x."""
    def draw(iso: Iso):
        iso.box(x, y, 0, 6, length, 18, M_COUCH)  # back
        iso.box(x + 6, y, 0, 12, 6, 12, M_COUCH)  # arm (back end)
        iso.box(x + 6, y + 6, 0, 12, length - 12, 7, M_COUCH)  # seat
        for k in range(1, 3):
            yy = y + 6 + k * (length - 12) // 3
            iso.line((x + 7, yy, 7), (x + 18, yy, 7), M_COUCH.line)
        iso.box(x + 6, y + length - 6, 0, 12, 6, 12, M_COUCH)  # arm (front end)
    return D((x, y, 0, 18, length, 18), draw, shadow=True, name="couch")


def coffee_table(x, y, w=22, d=26):
    def draw(iso: Iso):
        iso.box(x + 1, y + 1, 0, 2, 2, 6, M_DARK)
        iso.box(x + w - 3, y + d - 3, 0, 2, 2, 6, M_DARK)
        iso.box(x + w - 3, y + 1, 0, 2, 2, 6, M_DARK)
        iso.box(x + 1, y + d - 3, 0, 2, 2, 6, M_DARK)
        iso.box(x, y, 6, w, d, 2, M_TABLE)
        iso.box(x + 4, y + 4, 8, 7, 9, 1, Mat.of(A.BRAND_MAGENTA, 0.6))  # magazines
        iso.box(x + 6, y + 6, 9, 7, 9, 1, Mat.of(A.BRAND_ORANGE, 0.6))
        iso.box(x + 14, y + 14, 8, 3, 3, 3, Mat.of(A.BRAND_BLUE))  # mug
    return D((x, y, 0, w, d, 11), draw, shadow=True, name="coffee_table")


def copier(x, y):
    def draw(iso: Iso):
        iso.box(x, y, 0, 18, 16, 16, M_COPIER)
        iso.box(x + 2, y + 2, 16, 14, 11, 3, M_COPIER)
        iso.box(x + 3, y + 13, 16, 12, 3, 1, M_DARK)  # control panel
        iso.px(x + 5, y + 16, 17, "#5bd36b")
        iso.px(x + 7, y + 16, 17, A.BRAND_ORANGE)
        iso.box(x + 18, y + 3, 8, 3, 10, 1, M_PAPER)  # output tray
        iso.line((x, y + 16, 8), (x + 18, y + 16, 8), M_COPIER.line)
    return D((x, y, 0, 21, 16, 19), draw, shadow=True, name="copier")


def mascot(name, x, y, z=0):
    spr = A.mascot(name)
    return D((x - 3, y - 3, z, 6, 6, spr.height),
             lambda iso: iso.sprite(spr, x, y, z, anchor=(spr.width // 2, spr.height - 2)),
             shadow=True, name=f"mascot_{name}")
