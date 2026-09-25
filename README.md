# Dlicom Pixel Office

Top-down 2.5D isometric pixel-art office in a 16-bit SNES style: retro cubicles,
beige CRT monitors, filing cabinets, a water cooler in the corner and green house
plants on a clean grid, in muted grey/beige with Dlicom brand accents.

![Dlicom pixel office](dist/office_scene@4x.png)

## Game: Work Until Everyday

**Main di browser / HP:** https://naufalbaliputra02-ops.github.io/work-until-everyday-dlicom/

A small browser game set in the office (`game/`, no build step, no dependencies).
It works with keyboard, mouse, and touch (landscape or portrait), and you can add
it to your home screen to play fullscreen.

```sh
npm start          # serves game/ on http://localhost:3000 (PORT overrides)
```

Pick Blue, Pink or Orange (each has a perk), then keep the office's social
channels alive from 09:00 to 17:00:

- **Tutorial:** the first time you play, a 5-step practice shift covers moving,
  tasks, print jobs, the water cooler and coffee. Replay it from the menu anytime.
  **Cara Main** (how to play) explains everything on one screen.
- **Move:** WASD / arrow keys, click / tap the floor, or the on-screen joystick
  on phones. ⌕ toggles the follow camera and ⛶ goes fullscreen.
- **Work:** speech bubbles (post, reply, DM) pop up over cubicle CRTs. Stand in
  the highlighted cubicle until the job is done. Faster finishes and combos
  score more.
- **VIRAL:** gold bubbles give less time but 2.5× points and extra coins.
- **Print jobs:** grab the paper at the copier, then carry it to the cubicle.
- **Energy and coffee:** walking and working tire you out, so refill at the
  water cooler. Coffee cups appear on the floor; grab one for a speed and work
  boost.
- **Daily quests:** 3 each day, e.g. "Combo x4", "Antar 1 Print", "Tanpa telat
  sampai 17:00". Finishing them earns coins.
- **Office shop (after work):** Sepatu Lari (running shoes), Keyboard Mekanik
  (mechanical keyboard), Termos (thermos), Mesin Kopi (coffee machine), Cuti
  Sehari (a day off, +1 ♥).
- **Career:** your score moves you up from Magang (intern) to CEO.
- **Reputation:** a job that times out costs a heart, and a day with no misses
  gives one back. At zero hearts it's burnout. Every day gets busier.
- `P` / `Esc` pauses, `M` mutes, `Q` shows or hides the quest panel.
  Add `?touch=1` to the URL to force the touch UI.

The game draws the same pre-rendered art as the scene. `tools/build.py` exports
`game/assets/room.png` (floor, walls, shadows), `objects.png` (one sprite per
piece of furniture), `mascots.png` (3 mascots × idle/step frames), app icons and
`level.json` (boxes, collision, zones). At runtime `game/src/iso.js` depth-sorts
the furniture and the walking mascots with the same algorithm as the Python
renderer, and `world.js` does collision and A* pathfinding. `game.js` and
`progression.js` hold the rules (no DOM), so they run under `node --test`.

```sh
npm test           # depth sort, reachability, game rules, quests, tutorial, shop
npm run deploy     # publish game/ to the gh-pages branch (GitHub Pages)
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
