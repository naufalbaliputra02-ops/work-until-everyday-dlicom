import { depthSort, objectBBox, project, screenBBox, unproject } from "./iso.js";
import { DAY_SECONDS, PRINT_TIME, TASK_TYPES, TUTORIAL_STEPS, inRect } from "./game.js";
import {
  arrowIcon, bigArrowIcon, bubbleIcon, cupIcon, dropIcon, paperIcon, pixelText, printerIcon, sparkIcon, viralIcon,
} from "./pixels.js";

export function createRenderer(canvas, level, images) {
  const ctx = canvas.getContext("2d");
  canvas.width = level.canvas.w;
  canvas.height = level.canvas.h;
  ctx.imageSmoothingEnabled = false;
  const o = level.origin;
  const brand = level.brand;
  const colorOf = (name) => brand[name] || name;

  const statics = level.objects.map((ob) => ({ ...ob, bbox: objectBBox(o, ob) }));

  // Floor highlight for a world rect, rasterised pixel-exact (no AA).
  const floorCache = new Map();
  function floorMask(rect, color) {
    const key = rect.join() + color;
    if (floorCache.has(key)) return floorCache.get(key);
    const [x0, y0, x1, y1] = rect;
    const bb = screenBBox(o, [x0, x1, y0, y1, 0, 0]);
    const c = document.createElement("canvas");
    c.width = bb[2] - bb[0] + 1; c.height = bb[3] - bb[1] + 1;
    const cx = c.getContext("2d");
    const inside = (px, py) => {
      const [wx, wy] = unproject(o, px + bb[0] + 0.5, py + bb[1] + 0.5);
      return inRect(rect, wx, wy);
    };
    for (let py = 0; py < c.height; py++) {
      for (let px = 0; px < c.width; px++) {
        if (!inside(px, py)) continue;
        const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1);
        cx.globalAlpha = edge ? 1 : (px + py) % 2 ? 0.6 : 0.4;
        cx.fillStyle = color;
        cx.fillRect(px, py, 1, 1);
      }
    }
    const out = { canvas: c, x: bb[0], y: bb[1] };
    floorCache.set(key, out);
    return out;
  }

  function drawFloor(rect, color, alpha) {
    const m = floorMask(rect, color);
    ctx.globalAlpha = alpha;
    ctx.drawImage(m.canvas, m.x, m.y);
    ctx.globalAlpha = 1;
  }

  function drawActor(g, a, isPlayer) {
    const { w, h, names } = level.mascots;
    const row = names.indexOf(a.mascot);
    let frame = 0;
    if (a.moving) frame = [0, 1, 0, 2][Math.floor(a.anim * 8) % 4];
    const [sx, sy] = project(o, a.x, a.y, 0);
    const bob = a.moving && frame !== 0 ? -1 : 0;
    const busy = isPlayer && a.working;
    const hop = busy ? -((Math.floor(g.time * 6) % 2)) : 0;
    // shadow
    ctx.fillStyle = "rgba(26,22,40,0.45)";
    ctx.fillRect(sx - 5, sy - 1, 10, 2);
    ctx.fillRect(sx - 3, sy - 2, 6, 4);
    ctx.save();
    ctx.translate(sx, sy - h + 2 + bob + hop);
    if (a.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(images.mascots, frame * w, row * h, w, h, -w / 2, 0, w, h);
    ctx.restore();
    if (isPlayer && g.boost > 0) {
      const k = Math.floor(g.time * 10);
      const sp = sparkIcon();
      const ang = k * 0.9;
      const r = 9;
      ctx.drawImage(sp, Math.round(sx + Math.cos(ang) * r - 2), Math.round(sy - 10 + Math.sin(ang) * 5 - 2));
    }
  }

  function drawCoffee(g, c) {
    const [sx, sy] = project(o, c.x, c.y, 0);
    const blink = c.ttl < 4 && Math.floor(g.time * 8) % 2;
    ctx.fillStyle = "rgba(26,22,40,0.45)";
    ctx.fillRect(sx - 4, sy - 1, 8, 2);
    if (blink) return;
    const icon = cupIcon();
    const bob = Math.floor(g.time * 3) % 2;
    ctx.drawImage(icon, Math.round(sx - icon.width / 2), sy - icon.height - 2 - bob);
  }

  function iconAt(img, wx, wy, wz, dy = 0) {
    const [sx, sy] = project(o, wx, wy, wz);
    ctx.drawImage(img, Math.round(sx - img.width / 2), Math.round(sy - img.height + dy));
    return [sx, sy];
  }

  function bar(cx, y, w, frac, color, back = "#0a1041") {
    const x = Math.round(cx - w / 2);
    ctx.fillStyle = back;
    ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = "#2b2f55";
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(0, Math.round(w * Math.min(1, frac))), 2);
  }

  function patienceColor(f) {
    return f > 0.5 ? "#5bd36b" : f > 0.25 ? "#f5a623" : "#ff4a5a";
  }

  function draw(g) {
    ctx.drawImage(images.room, 0, 0);
    const pulse = 0.55 + 0.45 * Math.sin(g.time * 6);
    const p = g.player;
    const playing = g.mode === "playing" || g.mode === "paused";

    // floor guidance
    if (playing) {
      for (const t of g.tasks) {
        const c = level.cubicles[t.cubicle];
        const ready = t.kind !== "print" || p.carrying === t.id;
        drawFloor(c.zone, colorOf(TASK_TYPES[t.kind].color), ready ? pulse : 0.3);
      }
      const printJob = g.tasks.find((t) => t.kind === "print" && !t.printed);
      if (printJob && p.carrying === null) drawFloor(level.copier.zone, "#f4f1ea", pulse);
      if (g.energy < 35) drawFloor(level.cooler.zone, brand.cyan, pulse);
    }

    // world sprites
    const actors = [...g.npcs.map((n) => ({ a: n, player: false })), { a: p, player: true }]
      .map(({ a, player }) => ({ box: [a.x - 3, a.x + 3, a.y - 3, a.y + 3, 0, 16], actor: a, player }));
    const extra = playing && g.coffee
      ? [{ box: [g.coffee.x - 2, g.coffee.x + 2, g.coffee.y - 2, g.coffee.y + 2, 0, 8], coffee: g.coffee }]
      : [];
    for (const it of depthSort(o, [...statics, ...actors, ...extra])) {
      if (it.actor) drawActor(g, it.actor, it.player);
      else if (it.coffee) drawCoffee(g, it.coffee);
      else ctx.drawImage(images.objects, it.src[0], it.src[1], it.src[2], it.src[3], it.at[0], it.at[1], it.src[2], it.src[3]);
    }

    // UI layer (always on top)
    if (playing) {
      for (const t of g.tasks) {
        const c = level.cubicles[t.cubicle];
        const [x, y, z] = c.screen;
        const bounce = Math.floor(g.time * 3 + t.id) % 2;
        const f = t.patience / t.maxPatience;
        const urgent = f < 0.25 && Math.floor(g.time * 8) % 2;
        let icon;
        if (t.kind === "print") icon = t.printed ? paperIcon() : printerIcon();
        else if (t.viral) icon = viralIcon();
        else icon = bubbleIcon(colorOf(TASK_TYPES[t.kind].color));
        if (!urgent) {
          const [sx, sy] = iconAt(icon, x, y, z + 8, -bounce);
          if (t.viral && Math.floor(g.time * 4) % 2) {
            const sp = sparkIcon();
            ctx.drawImage(sp, Math.round(sx + 6), Math.round(sy - 14));
          }
          bar(sx, sy + 2, 14, f, patienceColor(f));
          if (t.progress > 0) bar(sx, sy + 6, 14, t.progress / TASK_TYPES[t.kind].work, "#ffffff");
        } else {
          const [sx, sy] = iconAt(icon, x, y, z + 8, 0);
          bar(sx, sy + 2, 14, f, patienceColor(f));
        }
      }
      const printJob = g.tasks.find((t) => t.kind === "print" && !t.printed);
      if (printJob && p.carrying === null) {
        const [x, y, z] = level.copier.icon;
        const [sx, sy] = iconAt(paperIcon(), x, y, z, -(Math.floor(g.time * 3) % 2));
        if (g.copierProgress > 0) bar(sx, sy + 2, 14, g.copierProgress / PRINT_TIME, "#ffffff");
      }
      if (g.energy < 35) {
        const [x, y, z] = level.cooler.icon;
        iconAt(dropIcon(), x, y, z, -(Math.floor(g.time * 3) % 2));
      }
      if (g.tutorial) drawTutorialPointer(g);

      // player marker + carried paper
      const head = project(o, p.x, p.y, 20);
      if (p.carrying !== null) {
        const icon = paperIcon();
        ctx.drawImage(icon, Math.round(head[0] - icon.width / 2), head[1] - icon.height - 1);
      } else if (g.time % 1 < 0.7) {
        const icon = arrowIcon("#ffe27a");
        ctx.drawImage(icon, Math.round(head[0] - icon.width / 2), head[1] - 4);
      }
      if (p.working === "cooler") {
        bar(head[0], head[1] - 8, 14, g.energy / 100, brand.cyan);
      }
      if (g.boost > 0) bar(head[0], head[1] + 2, 12, g.boost / 12, "#f5a623");
    }

    for (const f of g.fx) {
      const [sx, sy] = project(o, f.x, f.y, f.z + f.t * 14);
      if (f.t > 0.9 && Math.floor(f.t * 20) % 2) continue;
      pixelText(ctx, f.text, sx, sy, f.color);
    }

    // late-afternoon tint as the day winds down
    if (g.mode !== "title") {
      const late = Math.max(0, (g.clock / DAY_SECONDS - 0.7) / 0.3);
      if (late > 0) {
        ctx.fillStyle = `rgba(245,120,35,${(late * 0.12).toFixed(3)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

  function tutorialGoal(g) {
    const goal = TUTORIAL_STEPS[g.tutorial.step]?.goal;
    const p = g.player;
    if (goal === "task" || (goal === "copier" && p.carrying !== null)) {
      const t = g.tasks[0];
      return t ? level.cubicles[t.cubicle].screen.slice(0, 2).concat(62) : null;
    }
    if (goal === "copier") return [level.copier.icon[0], level.copier.icon[1], 44];
    if (goal === "cooler") return [level.cooler.icon[0], level.cooler.icon[1], 56];
    if (goal === "coffee" && g.coffee) return [g.coffee.x, g.coffee.y, 22];
    return null;
  }

  function drawTutorialPointer(g) {
    const at = tutorialGoal(g);
    if (!at) return;
    const icon = bigArrowIcon("#ffe27a");
    const bob = Math.round(Math.abs(Math.sin(g.time * 5)) * 4);
    const [sx, sy] = project(o, at[0], at[1], at[2]);
    ctx.drawImage(icon, Math.round(sx - icon.width / 2), sy - icon.height - bob);
  }

  function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * canvas.width;
    const sy = ((clientY - r.top) / r.height) * canvas.height;
    return unproject(o, sx, sy);
  }

  return { draw, toWorld, ctx };
}
