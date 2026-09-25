"""Render the Dlicom isometric pixel office scene + tileset into dist/.

    uv run python tools/build.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))

import assets as A  # noqa: E402
import objects as O  # noqa: E402
from iso import Iso, Mat, depth_sort, hex2rgb  # noqa: E402

DIST = A.ROOT / "dist"
T = 16
WX, WY = 16 * T, 14 * T  # room footprint (world units)
WALL_H = 64
THICK = 6
SLAB = 8

M_SLAB = Mat(top=hex2rgb("#6b645a"), left=hex2rgb("#5f5850"), right=hex2rgb("#4f4942"),
             line=hex2rgb("#2e2a27"), hi=hex2rgb("#7d766b"))
M_WALL = Mat(top=hex2rgb(A.WALL_CAP), left=hex2rgb("#7a7268"), right=hex2rgb("#6a635a"),
             line=hex2rgb("#2e2a27"), hi=hex2rgb("#766e64"))

WOOD_ZONE = (0, 76, 40, WY)  # lounge floor: x0, x1, y0, y1
RUG = (26, 70)  # 48x48 logo rug origin
MARGIN = 14

# cubicle farm: 2 rows x 3 pods, each pod accented with a brand colour
CUBICLES = [
    {"x": 80 + k * 48, "y": y, "accent": accent, "screen": screen, "mug": mug, "right_wall": k == 2}
    for y, pods in [
        (48, [(A.BRAND_BLUE, "logo", A.BRAND_ORANGE), (A.BRAND_MAGENTA, "code", None), (A.BRAND_ORANGE, "chat", A.BRAND_MAGENTA)]),
        (136, [(A.BRAND_CYAN, "logo", None), (A.BRAND_VIOLET, "off", A.BRAND_BLUE), (A.BRAND_ORANGE, "code", A.BRAND_CYAN)]),
    ]
    for k, (accent, screen, mug) in enumerate(pods)
]
MASCOT_SPOTS = {"blue": (26, 16), "orange": (72, 22), "pink": (44, 116)}


# --------------------------------------------------------------------------
def room_items(include_mascots=True):
    it = []
    # back corner: the water cooler, with Blue hanging out beside it
    it.append(O.water_cooler(4, 4))
    if include_mascots:
        it.append(O.mascot("blue", *MASCOT_SPOTS["blue"]))
    # filing cabinets under the "Own your social" banner, Orange on files duty
    for i in range(5):
        it.append(O.filing_cabinet(36 + i * 14, 0))
    if include_mascots:
        it.append(O.mascot("orange", *MASCOT_SPOTS["orange"]))
    it.append(O.plant(114, 4, "bush"))
    it.append(O.plant(240, 6, "tall"))
    it.append(O.copier(226, 44))

    for c in CUBICLES:
        it += O.cubicle(c["x"], c["y"], c["accent"], c["screen"], right_wall=c["right_wall"], mug_color=c["mug"])
    it.append(O.plant(234, 110, "bush"))
    it.append(O.plant(238, 204, "bush"))
    it.append(O.plant(186, 106, "tall", 6))

    # lounge: couch, logo rug, coffee table, Pink in shades
    it.append(O.couch(2, 60, 64))
    it.append(O.coffee_table(22, 136, 20, 20))
    if include_mascots:
        it.append(O.mascot("pink", *MASCOT_SPOTS["pink"]))
    it.append(O.plant(4, 46, "bush"))
    it.append(O.plant(4, 206, "tall"))
    return it


def wall_decor(iso: Iso):
    # +y facing wall (screen upper-right), measured along x
    iso.plane_y(A.poster_banner(), 33, 0, 61)
    iso.plane_y(A.window_texture(), 134, 0, 54)
    iso.plane_y(A.window_texture(), 182, 0, 54)
    # +x facing wall (screen upper-left), measured along y
    iso.plane_x(A.poster_mascots(), 0, 18, 54)
    iso.plane_x(A.poster_logo(), 0, 82, 56)
    iso.plane_x(A.whiteboard_texture(), 0, 150, 50)
    iso.plane_x(A.clock_texture(), 0, 196, 52)


def draw_shadows(iso: Iso, items):
    mask = Image.new("L", iso.img.size, 0)
    m = Iso(mask, iso.ox, iso.oy)
    for it in items:
        if not it.shadow:
            continue
        x0, x1, y0, y1, _, _ = it.box
        m.floor_quad(x0, y0, 0, x1 - x0 + 2, y1 - y0 + 2, 90)
    shade = Image.new("RGBA", iso.img.size, (26, 22, 40, 255))
    iso.img.paste(shade, (0, 0), mask)  # opaque blend via mask alpha


def brand_background(size) -> Image.Image:
    """Dithered black -> navy -> blue gradient with the mascot-art grid."""
    w, h = size
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    stops = [A.BRAND_BLACK, "#05081f", A.BRAND_NAVY, "#171e67", A.BRAND_BLUE]
    img = Image.new("RGBA", size)
    pix = img.load()
    for y in range(h):
        t = (y / (h - 1)) ** 1.6 * (len(stops) - 1)
        i = min(int(t), len(stops) - 2)
        f = t - i
        for x in range(w):
            c = stops[i + 1] if f * 16 > bayer[y % 4][x % 4] + 0.5 else stops[i]
            pix[x, y] = A.rgba(c)
    d = ImageDraw.Draw(img)
    for gx in range(0, w, 24):
        d.line([(gx, 0), (gx, h)], fill=(22, 30, 90, 255))
    for gy in range(0, h, 24):
        d.line([(0, gy), (w, gy)], fill=(22, 30, 90, 255))
    return img


def scene_frame():
    """(width, height, origin_x, origin_y) of the scene canvas."""
    ox = MARGIN + THICK + WY
    oy = MARGIN + THICK + WALL_H + 4
    w = (WX + THICK) + (WY + THICK) + MARGIN * 2
    h = oy + (WX + WY) // 2 + SLAB + MARGIN
    return w, h, ox, oy


def new_canvas():
    w, h, ox, oy = scene_frame()
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    return img, Iso(img, ox, oy)


def render_room_base(iso: Iso, items):
    """Everything that never moves or occludes: slab, floor, shadows, walls."""
    iso.box(-THICK, -THICK, -SLAB, WX + THICK, WY + THICK, SLAB, M_SLAB)
    iso.plane_z(A.floor_texture(WX, WY, WOOD_ZONE), 0, 0, 0)
    iso.plane_z(A.logo_rug(48), *RUG, 0)
    draw_shadows(iso, items)

    iso.box(-THICK, -THICK, 0, WX + THICK, THICK, WALL_H, M_WALL)
    iso.plane_y(A.wall_texture(WX, WALL_H), 0, 0, WALL_H)
    iso.box(-THICK, 0, 0, THICK, WY, WALL_H, M_WALL)
    iso.plane_x(A.wall_texture(WY, WALL_H), 0, 0, WALL_H)
    wall_decor(iso)


def render_scene() -> Image.Image:
    img, iso = new_canvas()
    items = room_items()
    render_room_base(iso, items)
    for it in depth_sort(iso, items):
        it.draw(iso)
    return img


# --------------------------------------------------------------------------
# Tileset: every piece rendered on its own, cropped, packed + atlas JSON
# --------------------------------------------------------------------------
def _render_piece(fn) -> tuple[Image.Image, tuple[int, int]]:
    img = Image.new("RGBA", (320, 320), (0, 0, 0, 0))
    iso = Iso(img, 160, 200)
    fn(iso)
    bb = img.getbbox()
    return img.crop(bb), (160 - bb[0], 200 - bb[1])


def _draw_items(items):
    def fn(iso):
        for it in depth_sort(iso, items):
            it.draw(iso)
    return fn


def _floor(tex, size=16):
    def fn(iso):
        iso.box(0, 0, -4, size, size, 4, M_SLAB)
        iso.plane_z(tex, 0, 0, 0)
    return fn


def _wall_y(decor=None):
    def fn(iso):
        iso.box(0, -THICK, 0, 32, THICK, WALL_H, M_WALL)
        iso.plane_y(A.wall_texture(32, WALL_H), 0, 0, WALL_H)
        if decor:
            iso.plane_y(decor, (32 - decor.width) // 2, 0, 54)
    return fn


def _wall_x(decor=None, top=56):
    def fn(iso):
        iso.box(-THICK, 0, 0, THICK, 32, WALL_H, M_WALL)
        iso.plane_x(A.wall_texture(32, WALL_H), 0, 0, WALL_H)
        if decor:
            iso.plane_x(decor, 0, (32 - decor.width) // 2, top)
    return fn


def tileset_pieces():
    carpet = A.floor_texture(16, 16)
    wood = A.floor_texture(16, 16, (0, 16, 0, 16))
    return [
        ("floor_carpet", _floor(carpet)),
        ("floor_wood", _floor(wood)),
        ("floor_logo_rug_3x3", _floor(A.logo_rug(48), 48)),
        ("wall_right_2t", _wall_y()),
        ("wall_left_2t", _wall_x()),
        ("wall_right_window", _wall_y(A.window_texture(28, 28))),
        ("wall_left_logo_poster", _wall_x(A.poster_logo())),
        ("wall_left_whiteboard", _wall_x(A.whiteboard_texture(28, 20), 50)),
        ("cubicle_pod_3x3", _draw_items(O.cubicle(0, 0, A.BRAND_BLUE, "logo", mug_color=A.BRAND_ORANGE))),
        ("desk", _draw_items([O.desk(0, 0, 44, 14)])),
        ("crt_monitor_logo", _draw_items([O.crt(0, 0, 0, "logo")])),
        ("crt_monitor_code", _draw_items([O.crt(0, 0, 0, "code")])),
        ("crt_monitor_chat", _draw_items([O.crt(0, 0, 0, "chat")])),
        ("office_chair", _draw_items([O.chair(0, 0)])),
        ("filing_cabinet", _draw_items([O.filing_cabinet(0, 0)])),
        ("water_cooler", _draw_items([O.water_cooler(0, 0)])),
        ("plant_bush", _draw_items([O.plant(0, 0, "bush")])),
        ("plant_tall", _draw_items([O.plant(0, 0, "tall")])),
        ("couch", _draw_items([O.couch(0, 0, 64)])),
        ("coffee_table", _draw_items([O.coffee_table(0, 0)])),
        ("copier", _draw_items([O.copier(0, 0)])),
        ("partition", _draw_items([O.partition(0, 0, 48, 2, accent=A.BRAND_MAGENTA)])),
        ("mascot_blue", lambda iso: iso.sprite(A.mascot("blue"), 0, 0)),
        ("mascot_pink", lambda iso: iso.sprite(A.mascot("pink"), 0, 0)),
        ("mascot_orange", lambda iso: iso.sprite(A.mascot("orange"), 0, 0)),
        ("poster_banner", lambda iso: iso.sprite(A.poster_banner(), 0, 0)),
        ("poster_logo", lambda iso: iso.sprite(A.poster_logo(), 0, 0)),
        ("poster_mascots", lambda iso: iso.sprite(A.poster_mascots(), 0, 0)),
    ]


def shelf_pack(sizes, sheet_w, pad=4):
    """Pack (w, h) rects in order onto shelves; returns positions + height."""
    x = y = pad
    shelf = 0
    pos = []
    for w, h in sizes:
        if x + w + pad > sheet_w:
            x, y, shelf = pad, y + shelf + pad, 0
        pos.append((x, y))
        x += w + pad
        shelf = max(shelf, h)
    return pos, y + shelf + pad


def build_tileset(out_dir: Path):
    pieces = [(n, *_render_piece(fn)) for n, fn in tileset_pieces()]
    sheet_w = 400
    pos, sheet_h = shelf_pack([img.size for _, img, _ in pieces], sheet_w)
    frames = {
        name: {"x": x, "y": y, "w": img.width, "h": img.height,
               "anchor": {"x": anchor[0], "y": anchor[1]}}
        for (name, img, anchor), (x, y) in zip(pieces, pos)
    }
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    tiles_dir = out_dir / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    for old in tiles_dir.glob("*.png"):
        old.unlink()
    for name, img, _ in pieces:
        f = frames[name]
        sheet.alpha_composite(img, (f["x"], f["y"]))
        img.save(tiles_dir / f"{name}.png")
    sheet.save(out_dir / "tileset.png")
    atlas = {
        "meta": {
            "image": "tileset.png",
            "size": {"w": sheet.width, "h": sheet.height},
            "projection": "2:1 isometric, 1 tile = 32x16 px",
            "anchor": "pixel of world origin (tile back corner, floor level) inside the frame",
        },
        "frames": frames,
    }
    (out_dir / "tileset.json").write_text(json.dumps(atlas, indent=2) + "\n")
    return sheet


def upscale(img: Image.Image, k: int) -> Image.Image:
    return img.resize((img.width * k, img.height * k), Image.Resampling.NEAREST)


# --------------------------------------------------------------------------
# Game export: static background + one sprite per occluding object + level data
# --------------------------------------------------------------------------
GAME = A.ROOT / "game" / "assets"


def build_game_assets(out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    w, h, ox, oy = scene_frame()
    items = room_items(include_mascots=False)

    base, iso = new_canvas()
    render_room_base(iso, items)
    room = brand_background((w, h))
    room.alpha_composite(base)
    room.save(out_dir / "room.png")

    sprites = []
    for it in depth_sort(iso, items):  # authoring order = a valid static order
        img, piso = new_canvas()
        it.draw(piso)
        bb = img.getbbox()
        if bb:
            sprites.append((it, img.crop(bb), bb))
    pos, sheet_h = shelf_pack([s.size for _, s, _ in sprites], 512, pad=1)
    sheet = Image.new("RGBA", (512, sheet_h), (0, 0, 0, 0))
    objects = []
    for (it, spr, bb), (x, y) in zip(sprites, pos):
        sheet.alpha_composite(spr, (x, y))
        objects.append({
            "name": it.name,
            "box": list(it.box),
            "src": [x, y, spr.width, spr.height],
            "at": [bb[0], bb[1]],
            "solid": it.box[4] == 0,
        })
    sheet.save(out_dir / "objects.png")

    names = ["blue", "pink", "orange"]
    fw, fh = A.mascot("blue").size
    ms = Image.new("RGBA", (fw * len(A.MASCOT_FRAMES), fh * len(names)), (0, 0, 0, 0))
    for r, n in enumerate(names):
        for c, f in enumerate(A.MASCOT_FRAMES):
            ms.alpha_composite(A.mascot(n, f), (c * fw, r * fh))
    ms.save(out_dir / "mascots.png")
    upscale(ms, 4).save(out_dir / "mascots@4x.png")

    for src in ("dlicom-logo.png", "dlicom-banner.png"):
        (out_dir / src).write_bytes((A.BRAND / src).read_bytes())
    logo = Image.open(A.BRAND / "dlicom-logo.png").convert("RGB")
    for size in (192, 512):
        logo.resize((size, size), Image.Resampling.LANCZOS).save(out_dir / f"icon-{size}.png")

    cubicles = [
        {
            "id": i,
            "accent": c["accent"],
            # walkable interior in front of the L-desk
            "zone": [c["x"] + 16, c["y"] + 16, c["x"] + 48, c["y"] + 48],
            "screen": [c["x"] + 24, c["y"] + 8, 30],
        }
        for i, c in enumerate(CUBICLES)
    ]
    level = {
        "canvas": {"w": w, "h": h},
        "origin": {"x": ox, "y": oy},
        "world": {"w": WX, "h": WY},
        "objects": objects,
        "cubicles": cubicles,
        "cooler": {"zone": [0, 0, 26, 26], "icon": [10, 9, 38]},
        "copier": {"zone": [214, 34, 256, 72], "icon": [236, 52, 26]},
        "spawns": {k: list(v) for k, v in MASCOT_SPOTS.items()},
        "pois": [[24, 20], [60, 22], [100, 30], [44, 100], [50, 190], [150, 116], [200, 124],
                 [236, 76], [244, 160], [120, 206], [200, 208]]
                + [[c["x"] + 38, c["y"] + 40] for c in CUBICLES],
        "mascots": {"names": names, "frames": A.MASCOT_FRAMES, "w": fw, "h": fh},
        "brand": {"black": A.BRAND_BLACK, "navy": A.BRAND_NAVY, "blue": A.BRAND_BLUE,
                  "royal": A.BRAND_ROYAL, "cyan": A.BRAND_CYAN, "violet": A.BRAND_VIOLET,
                  "magenta": A.BRAND_MAGENTA, "orange": A.BRAND_ORANGE, "cream": A.BRAND_CREAM},
    }
    (out_dir / "level.json").write_text(json.dumps(level, indent=1) + "\n")
    return level


def write_gallery(out_dir: Path, frames: dict, scene_w: int):
    cards = "\n".join(
        f'      <figure><img src="tiles/{n}.png" width="{f["w"] * 3}" height="{f["h"] * 3}" alt="{n}">'
        f"<figcaption>{n}<br><small>{f['w']}&times;{f['h']}</small></figcaption></figure>"
        for n, f in frames.items()
    )
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dlicom Pixel Office — isometric tileset</title>
  <style>
    :root {{ color-scheme: dark; --blue: {A.BRAND_BLUE}; --cyan: {A.BRAND_CYAN}; }}
    body {{ margin: 0; background: {A.BRAND_BLACK}; color: #e8e6f0;
           font: 14px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    header {{ padding: 20px 24px; background: linear-gradient(180deg, #000, var(--blue)); }}
    h1 {{ margin: 0; font-size: 20px; }} h2 {{ margin: 32px 24px 12px; font-size: 16px; color: var(--cyan); }}
    img {{ image-rendering: pixelated; }}
    .scene {{ padding: 0 24px; }} .scene img {{ width: min(100%, 2080px); height: auto; border: 2px solid #1e2780; }}
    .grid {{ display: flex; flex-wrap: wrap; gap: 16px; padding: 0 24px 40px; align-items: flex-end; }}
    figure {{ margin: 0; padding: 12px; background: #11142e; border: 1px solid #1e2780; text-align: center; }}
    figcaption {{ margin-top: 8px; color: #b9bce0; }} small {{ color: #6f74a8; }}
  </style>
</head>
<body>
  <header><h1>Dlicom Pixel Office</h1><div>2.5D isometric &middot; 16-bit SNES style &middot; 32&times;16 px tiles</div></header>
  <h2>Scene</h2>
  <div class="scene"><img src="office_scene.png" width="{scene_w * 4}" alt="Isometric pixel-art Dlicom office"></div>
  <h2>Tileset ({len(frames)} pieces &middot; tileset.png + tileset.json)</h2>
  <div class="grid">
{cards}
  </div>
</body>
</html>
"""
    (out_dir / "index.html").write_text(html)


def main():
    DIST.mkdir(exist_ok=True)
    scene = render_scene()
    scene.save(DIST / "office_scene_transparent.png")
    hero = brand_background(scene.size)
    hero.alpha_composite(scene)
    hero.save(DIST / "office_scene.png")
    upscale(hero, 4).save(DIST / "office_scene@4x.png")
    sheet = build_tileset(DIST)
    upscale(sheet, 3).save(DIST / "tileset@3x.png")
    frames = json.loads((DIST / "tileset.json").read_text())["frames"]
    write_gallery(DIST, frames, scene.width)
    level = build_game_assets(GAME)
    print(f"scene {scene.size}, tileset {sheet.size} -> {DIST}")
    print(f"game: {len(level['objects'])} objects, {len(level['cubicles'])} cubicles -> {GAME}")


if __name__ == "__main__":
    main()
