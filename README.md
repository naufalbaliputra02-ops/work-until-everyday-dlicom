# Dlicom Pixel Office

Top-down 2.5D isometric pixel-art office in a 16-bit SNES style: retro cubicles,
beige CRT monitors, filing cabinets, a water cooler in the corner and green house
plants on a clean grid, in muted grey/beige with Dlicom brand accents.

![Dlicom pixel office](dist/office_scene@4x.png)

## Game: Work Until Everyday

A small browser game set in the office (`game/`, no build step, no dependencies).

```sh
npm start          # serves game/ on http://localhost:3000 (PORT overrides)
```

Pick Blue, Pink or Orange (each has a perk), then keep the office's social
channels alive from 09:00 to 17:00:

- **Move:** WASD / arrow keys, or click / tap the floor to walk there.
- **Work:** speech bubbles (post, reply, DM) pop up over cubicle CRTs. Stand in
  the highlighted cubicle until the job is done. Faster finishes and combos
  score more.
- **Print jobs:** grab the paper at the copier, then carry it to the cubicle.
- **Energy:** walking and working tire you out. Refill at the water cooler.
- **Reputation:** a job that times out costs a heart, and a day with no misses
  gives one back. At zero hearts it's burnout. Every day gets busier.
- `P` / `Esc` pauses, `M` mutes. Your best score is kept in `localStorage`.

The game draws the same pre-rendered art as the scene. `tools/build.py` exports
`game/assets/room.png` (floor, walls, shadows), `objects.png` (one sprite per
piece of furniture), `mascots.png` (3 mascots × idle/step frames) and
`level.json` (boxes, collision, zones). At runtime `game/src/iso.js` depth-sorts
the furniture and the walking mascots with the same algorithm as the Python
renderer, and `world.js` does collision and A* pathfinding.

```sh
npm test           # node --test: depth sort, reachability, game rules
```

## Brand assets used

Everything is generated from the files in [`brand/`](brand/):

| Source | Where it shows up |
| --- | --- |
| `dlicom-logo.png` | Framed wall poster, the white mark on the lounge rug, the diamond on CRT screens |
| `dlicom-banner.png` | "Own your social" poster above the filing cabinets |
| `dlicom-mascots.png` | Mascot poster on the wall, plus pixel re-draws of Blue, Pink and Orange walking around the office |

Brand colours (black, navy, blue `#2a37b7`, royal `#246dc5`, cyan `#67c6dd`,
violet, magenta, orange, cream) are sampled from those images and live in
`tools/assets.py`. They're used for the background gradient, the rug, window
skylines, the couch, chairs and the accents on each cubicle.

## Output (`dist/`)

| File | What |
| --- | --- |
| `office_scene.png` / `office_scene@4x.png` | Full scene on a brand gradient (native 520×350, and 4× nearest-neighbour) |
| `office_scene_transparent.png` | Scene on a transparent background |
| `tileset.png` / `tileset@3x.png` | Every piece packed onto one sheet |
| `tileset.json` | Atlas: frame rects plus the world-origin anchor for each piece |
| `tiles/*.png` | Each piece as its own PNG |
| `index.html` | Gallery page (open it directly in a browser) |

Projection: 2:1 isometric, 1 tile = 32×16 px (16 world units). A frame's
`anchor` is the pixel where the tile's back corner at floor level sits, so to
place a piece at tile `(tx, ty)`, draw it at
`(ox + (tx - ty) * 16 - anchor.x, oy + (tx + ty) * 8 - anchor.y)`.

## Rebuild

```sh
uv run python tools/build.py
```

Output is deterministic (seeded). `tools/iso.py` is the tiny renderer (boxes,
plane-mapped textures, depth sort), `tools/assets.py` has the palette, sprites and
textures, `tools/objects.py` has the furniture, and `tools/build.py` lays out
the room, packs the tileset and exports the game assets.
