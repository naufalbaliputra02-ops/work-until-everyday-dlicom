// Pure game rules (no DOM): tasks, energy, reputation, workday clock, NPCs.

export const DAY_SECONDS = 120; // 09:00 -> 17:00
export const MAX_HEARTS = 5;
export const MAX_ENERGY = 100;
const SPEED = 52; // world units / s
const NPC_SPEED = 30;
const PRINT_TIME = 1.1;
const DELIVER_TIME = 0.35;
const TIRED = 20;

// Social tasks, styled after the speech bubbles in the Dlicom banner.
export const TASK_TYPES = {
  post: { color: "orange", work: 1.8, points: 100, label: "Post" },
  reply: { color: "magenta", work: 1.0, points: 70, label: "Reply" },
  dm: { color: "royal", work: 1.4, points: 90, label: "DM" },
  print: { color: "cream", work: DELIVER_TIME, points: 150, label: "Print" },
};

// Blue works faster, Pink tires slower, Orange walks faster.
export const PERKS = {
  blue: { work: 1.15, drain: 1, speed: 1, name: "Blue", perk: "Kerja +15% lebih cepat" },
  pink: { work: 1, drain: 0.65, speed: 1, name: "Pink", perk: "Energi awet 35%" },
  orange: { work: 1, drain: 1, speed: 1.15, name: "Orange", perk: "Jalan +15% lebih cepat" },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const inRect = (r, x, y) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];

export function difficulty(day) {
  return {
    spawnEvery: Math.max(3.2, 8.5 - (day - 1) * 1.1),
    patience: Math.max(13, 30 - (day - 1) * 3),
    maxTasks: Math.min(6, 2 + day),
    printChance: day >= 2 ? Math.min(0.35, 0.15 + day * 0.04) : 0,
  };
}

export function createGame(level, world, { mascot = "blue", seed = Date.now(), best = 0 } = {}) {
  const rng = mulberry32(seed);
  const actor = (name) => {
    const [x, y] = level.spawns[name];
    return { mascot: name, x, y, facing: 1, moving: false, anim: 0, path: [], wait: 0, carrying: null };
  };
  const npcs = level.mascots.names.filter((n) => n !== mascot).map((n) => ({ ...actor(n), wait: 1 + rng() * 3 }));
  return {
    level, world, rng,
    perk: PERKS[mascot],
    mode: "title",
    day: 1, clock: 0, score: 0, best, combo: 0,
    hearts: MAX_HEARTS, energy: MAX_ENERGY,
    player: actor(mascot),
    npcs,
    tasks: [], nextId: 1, spawnTimer: 1.5, copierProgress: 0, refillCooldown: 0,
    dayStats: { done: 0, missed: 0, points: 0 },
    totals: { done: 0, missed: 0 },
    fx: [], events: [], time: 0,
  };
}

export function startDay(g) {
  g.mode = "playing";
  g.clock = 0;
  g.tasks = [];
  g.spawnTimer = 1.5;
  g.energy = MAX_ENERGY;
  g.player.carrying = null;
  g.copierProgress = 0;
  g.dayStats = { done: 0, missed: 0, points: 0 };
}

export function nextDay(g) {
  g.day += 1;
  startDay(g);
}

/** In-game wall clock for the HUD, e.g. "13:45". */
export function clockText(g) {
  const minutes = 9 * 60 + Math.floor((g.clock / DAY_SECONDS) * 8 * 60);
  const hh = Math.min(17, Math.floor(minutes / 60));
  const mm = hh === 17 ? 0 : minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm - (mm % 5)).padStart(2, "0")}`;
}

/** Screen-relative direction (arrow keys) -> normalised world direction. */
export function screenDirToWorld(dx, dy) {
  const wx = dx + dy, wy = dy - dx; // screen right = +x-y, screen down = +x+y
  const len = Math.hypot(wx, wy);
  return len ? [wx / len, wy / len] : [0, 0];
}

export function zoneAt(g, x, y) {
  const { level } = g;
  for (const c of level.cubicles) if (inRect(c.zone, x, y)) return { type: "cubicle", id: c.id };
  if (inRect(level.cooler.zone, x, y)) return { type: "cooler" };
  if (inRect(level.copier.zone, x, y)) return { type: "copier" };
  return null;
}

function emit(g, type, data = {}) { g.events.push({ type, ...data }); }

function fx(g, text, at, color = "#ffffff") {
  g.fx.push({ text, x: at[0], y: at[1], z: at[2] ?? 20, t: 0, color });
}

function spawnTask(g) {
  const d = difficulty(g.day);
  const busy = new Set(g.tasks.map((t) => t.cubicle));
  const free = g.level.cubicles.filter((c) => !busy.has(c.id));
  if (!free.length || g.tasks.length >= d.maxTasks) return null;
  const c = free[Math.floor(g.rng() * free.length)];
  const hasPrint = g.tasks.some((t) => t.kind === "print");
  let kind;
  if (!hasPrint && g.rng() < d.printChance) kind = "print";
  else kind = ["post", "reply", "dm"][Math.floor(g.rng() * 3)];
  const patience = d.patience * (kind === "print" ? 1.5 : kind === "reply" ? 0.8 : 1);
  const task = { id: g.nextId++, kind, cubicle: c.id, patience, maxPatience: patience, progress: 0, printed: false };
  g.tasks.push(task);
  emit(g, "spawn", { kind });
  return task;
}

function completeTask(g, task) {
  const type = TASK_TYPES[task.kind];
  g.combo += 1;
  const mult = 1 + Math.min(g.combo - 1, 10) * 0.1;
  const speedBonus = Math.round((task.patience / task.maxPatience) * 50);
  const pts = Math.round((type.points + speedBonus) * mult);
  g.score += pts;
  g.dayStats.done += 1;
  g.dayStats.points += pts;
  g.totals.done += 1;
  if (g.player.carrying === task.id) g.player.carrying = null;
  g.tasks = g.tasks.filter((t) => t !== task);
  const c = g.level.cubicles[task.cubicle];
  fx(g, `+${pts}`, [c.screen[0], c.screen[1], c.screen[2] + 10], "#ffe27a");
  if (g.combo > 1) fx(g, `x${g.combo}`, [c.screen[0] + 8, c.screen[1] - 8, c.screen[2] + 2], "#67c6dd");
  emit(g, "done", { combo: g.combo, pts });
}

function missTask(g, task) {
  g.hearts -= 1;
  g.combo = 0;
  g.dayStats.missed += 1;
  g.totals.missed += 1;
  if (g.player.carrying === task.id) g.player.carrying = null;
  g.tasks = g.tasks.filter((t) => t !== task);
  const c = g.level.cubicles[task.cubicle];
  fx(g, "-1", [c.screen[0], c.screen[1], c.screen[2] + 10], "#ff5a6a");
  emit(g, "miss");
  if (g.hearts <= 0) {
    g.mode = "gameover";
    g.best = Math.max(g.best, g.score);
    emit(g, "gameover");
  }
}

function followPath(g, a, speed, dt) {
  if (!a.path.length) return false;
  let budget = speed * dt;
  while (budget > 0 && a.path.length) {
    const [tx, ty] = a.path[0];
    const dx = tx - a.x, dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx - dy) > 0.01) a.facing = dx - dy > 0 ? 1 : -1;
    if (d <= budget) {
      a.x = tx; a.y = ty; budget -= d;
      a.path.shift();
    } else {
      a.x += (dx / d) * budget; a.y += (dy / d) * budget;
      budget = 0;
    }
  }
  return true;
}

function updatePlayer(g, dt, input) {
  const p = g.player;
  const tired = g.energy < TIRED;
  const speed = SPEED * g.perk.speed * (tired ? 0.6 : 1);
  if (input.target) {
    p.path = g.world.findPath(p.x, p.y, input.target[0], input.target[1]);
  }
  const [wx, wy] = screenDirToWorld(input.dx || 0, input.dy || 0);
  let moving = false;
  if (wx || wy) {
    p.path = [];
    moving = g.world.move(p, wx * speed * dt, wy * speed * dt);
    if (Math.abs(wx - wy) > 0.01) p.facing = wx - wy > 0 ? 1 : -1;
  } else {
    moving = followPath(g, p, speed, dt);
  }
  p.moving = moving;
  if (moving) {
    p.anim += dt;
    g.energy = Math.max(0, g.energy - 0.45 * g.perk.drain * dt);
  } else {
    p.anim = 0;
  }
}

function updateWork(g, dt) {
  const p = g.player;
  const z = zoneAt(g, p.x, p.y);
  const rate = g.perk.work * (g.energy < TIRED ? 0.55 : 1);
  p.working = null;

  if (z?.type === "cooler") {
    if (g.energy < MAX_ENERGY) {
      g.energy = Math.min(MAX_ENERGY, g.energy + 32 * dt);
      p.working = "cooler";
      g.refillCooldown -= dt;
      if (g.refillCooldown <= 0) { emit(g, "refill"); g.refillCooldown = 0.45; }
    }
  } else if (z?.type === "copier") {
    const job = g.tasks.find((t) => t.kind === "print" && !t.printed);
    if (job && p.carrying === null) {
      g.copierProgress += dt * rate;
      p.working = "copier";
      if (g.copierProgress >= PRINT_TIME) {
        job.printed = true;
        p.carrying = job.id;
        g.copierProgress = 0;
        emit(g, "print");
      }
    }
  } else if (z?.type === "cubicle") {
    const task = g.tasks.find((t) => t.cubicle === z.id);
    if (task && (task.kind !== "print" || p.carrying === task.id)) {
      task.progress += dt * rate;
      task.active = true;
      p.working = task.kind;
      g.energy = Math.max(0, g.energy - 2.4 * g.perk.drain * dt);
      if (task.progress >= TASK_TYPES[task.kind].work) completeTask(g, task);
    }
  }
  if (z?.type !== "copier") g.copierProgress = 0;
}

function updateNpc(g, n, dt) {
  if (followPath(g, n, NPC_SPEED, dt)) {
    n.moving = true;
    n.anim += dt;
    if (!n.path.length) n.wait = 2 + g.rng() * 4;
    return;
  }
  n.moving = false;
  n.anim = 0;
  n.wait -= dt;
  if (n.wait <= 0) {
    const pois = g.level.pois;
    const [tx, ty] = pois[Math.floor(g.rng() * pois.length)];
    n.path = g.world.findPath(n.x, n.y, tx, ty);
    n.wait = n.path.length ? 0 : 1;
  }
}

export function update(g, dt, input = {}) {
  g.events.length = 0;
  if (g.mode === "paused") return g;
  g.time += dt;
  for (const f of g.fx) f.t += dt;
  g.fx = g.fx.filter((f) => f.t < 1.2);
  for (const n of g.npcs) updateNpc(g, n, dt);
  if (g.mode !== "playing") return g;

  g.clock += dt;
  if (g.clock >= DAY_SECONDS) {
    g.clock = DAY_SECONDS;
    g.mode = "dayend";
    const perfect = g.dayStats.missed === 0;
    if (perfect) g.hearts = Math.min(MAX_HEARTS, g.hearts + 1);
    g.dayStats.perfect = perfect;
    g.tasks = [];
    g.player.carrying = null;
    g.best = Math.max(g.best, g.score);
    emit(g, "dayend", { perfect });
    return g;
  }

  updatePlayer(g, dt, input);
  for (const t of g.tasks) t.active = false;
  updateWork(g, dt);
  if (g.mode !== "playing") return g;

  for (const t of [...g.tasks]) {
    if (t.active) continue; // the clock pauses while you're on it
    t.patience -= dt;
    if (t.patience <= 0) {
      missTask(g, t);
      if (g.mode !== "playing") return g;
    }
  }

  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    spawnTask(g);
    const d = difficulty(g.day);
    g.spawnTimer = d.spawnEvery * (0.7 + g.rng() * 0.6);
  }
  return g;
}

// exposed for tests
export const _internal = { spawnTask, completeTask, missTask };
