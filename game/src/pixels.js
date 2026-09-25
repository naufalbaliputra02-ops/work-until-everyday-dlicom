// Hand-placed pixel icons + a 3x5 bitmap font, rasterised once to canvases.

const cache = new Map();

export function fromAscii(rows, pal) {
  const key = rows.join("\n") + JSON.stringify(pal);
  if (cache.has(key)) return cache.get(key);
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(x, y, 1, 1); }
  }));
  cache.set(key, c);
  return c;
}

// Speech bubble with the mascot-style diamond eyes from the banner.
const BUBBLE = [
  "..OOOOOOOOOO..",
  ".OCCCCCCCCCCO.",
  "OCCCWCCCCWCCCO",
  "OCCWKWCCWKWCCO",
  "OCCCWCCCCWCCCO",
  "OCCCCCKKCCCCCO",
  ".OCCCCCCCCCCO.",
  "..OOCOOOOOOO..",
  "...OCO........",
  "...OO.........",
];

const PAPER = [
  ".OOOOOOO.",
  ".OWWWWWO.",
  ".OWKKKWO.",
  ".OWWWWWO.",
  ".OWKKWWO.",
  ".OWWWWWO.",
  ".OWKKKWO.",
  ".OOOOOOO.",
];

const PRINTER = [
  "...OOOOOOOO...",
  "...OWWWWWWO...",
  ".OOOOOOOOOOOO.",
  "OCCCCCCCCCCGCO",
  "OCCCCCCCCCCCCO",
  "OCCOOOOOOOOCCO",
  "OCCOWWWWWWOCCO",
  ".OOOWKKKKWOOO.",
  "...OWWWWWWO...",
  "...OOOOOOOO...",
];

const DROP = [
  "...O...",
  "..OCO..",
  ".OCCCO.",
  "OCWCCCO",
  "OCWCCCO",
  "OCCCCCO",
  ".OCCCO.",
  "..OOO..",
];

const ARROW = ["OOOOOOO", ".OWWWO.", "..OWO..", "...O..."];

const BIG_ARROW = [
  "OOOOOOOOO",
  "OWWWWWWWO",
  ".OWWWWWO.",
  "..OWWWO..",
  "...OWO...",
  "....O....",
];

const CUP = [
  "..S.S...",
  "...S.S..",
  "OOOOOOO.",
  "OWWWWWOO",
  "OCCCCCO.O",
  "OWWWWWOO",
  ".OWWWO..",
  "..OOO...",
];

const COIN = [
  ".OOOO.",
  "OYYYWO",
  "OYDYYO",
  "OYDYYO",
  "OYYYYO",
  ".OOOO.",
];

const SPARK = ["..W..", ".WYW.", "WYYYW", ".WYW.", "..W.."];

export function bubbleIcon(color) {
  return fromAscii(BUBBLE, { O: "#0a1041", C: color, W: "#ffffff", K: "#0a0a14" });
}
export const paperIcon = () => fromAscii(PAPER, { O: "#2b2a33", W: "#f4f1ea", K: "#8b93b8" });
export const printerIcon = () => fromAscii(PRINTER, { O: "#2b2a33", W: "#f4f1ea", C: "#cbc4b0", G: "#5bd36b", K: "#8b93b8" });
export const dropIcon = () => fromAscii(DROP, { O: "#0a1041", C: "#67c6dd", W: "#e6fbff" });
export const arrowIcon = (color) => fromAscii(ARROW, { O: "#0a1041", W: color });
export const bigArrowIcon = (color) => fromAscii(BIG_ARROW, { O: "#0a1041", W: color });
export const cupIcon = () => fromAscii(CUP, { O: "#2b1a10", W: "#f4f1ea", C: "#7a4a24", S: "#e6e6f0" });
export const coinIcon = () => fromAscii(COIN, { O: "#5a3a05", Y: "#ffcf3a", D: "#c98a10", W: "#fff6c8" });
export const sparkIcon = () => fromAscii(SPARK, { W: "#ffffff", Y: "#ffcf3a" });
/** Gold "viral" bubble with a flame-orange rim. */
export const viralIcon = () => fromAscii(BUBBLE, { O: "#c8102e", C: "#fff15a", W: "#ffffff", K: "#0a0a14" });

/** Copy a (cached) pixel icon into a fresh canvas scaled up for DOM use. */
export function iconCanvas(icon, scale = 3) {
  const c = document.createElement("canvas");
  c.width = icon.width * scale; c.height = icon.height * scale;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(icon, 0, 0, c.width, c.height);
  c.className = "px-icon";
  return c;
}

const GLYPHS = {
  0: ["###", "#.#", "#.#", "#.#", "###"],
  1: [".#.", "##.", ".#.", ".#.", "###"],
  2: ["###", "..#", "###", "#..", "###"],
  3: ["###", "..#", ".##", "..#", "###"],
  4: ["#.#", "#.#", "###", "..#", "..#"],
  5: ["###", "#..", "###", "..#", "###"],
  6: ["###", "#..", "###", "#.#", "###"],
  7: ["###", "..#", ".#.", ".#.", ".#."],
  8: ["###", "#.#", "###", "#.#", "###"],
  9: ["###", "#.#", "###", "..#", "###"],
  "+": ["...", ".#.", "###", ".#.", "..."],
  "-": ["...", "...", "###", "...", "..."],
  x: ["...", "#.#", ".#.", "#.#", "..."],
  "!": [".#.", ".#.", ".#.", "...", ".#."],
};

/** Draw pixel text centred at (cx, y) with a 1px dark outline. */
export function pixelText(ctx, text, cx, y, color) {
  const w = text.length * 4 - 1;
  let x = Math.round(cx - w / 2);
  y = Math.round(y);
  for (const pass of ["#0a1041", color]) {
    ctx.fillStyle = pass;
    let px = x;
    for (const ch of text) {
      const g = GLYPHS[ch];
      if (g) {
        g.forEach((row, gy) => [...row].forEach((c, gx) => {
          if (c !== "#") return;
          if (pass === color) ctx.fillRect(px + gx, y + gy, 1, 1);
          else ctx.fillRect(px + gx - 1, y + gy - 1, 3, 3);
        }));
      }
      px += 4;
    }
  }
}
