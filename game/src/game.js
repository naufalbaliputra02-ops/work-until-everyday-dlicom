// Pure game rules (no DOM): tasks, energy, reputation, workday clock, NPCs,
// quests, coins/upgrades, coffee power-up and the guided tutorial.
import {
  UPGRADES, checkQuests, freshDayStats, rankFor, rollQuests, upgradeCost, RANKS,
} from "./progression.js";

export const DAY_SECONDS = 120; // 09:00 -> 17:00
export const MAX_HEARTS = 5;
export const MAX_ENERGY = 100;
const SPEED = 52; // world units / s
const NPC_SPEED = 30;
export const PRINT_TIME = 1.1;
const DELIVER_TIME = 0.35;
const TIRED = 20;
const COFFEE_REACH = 9;

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

// Guided first shift. `goal` is what the UI points at.
export const TUTORIAL_STEPS = [
  { id: "move", title: "Jalan dulu", text: "Geser joystick / WASD, atau tap lantai untuk jalan ke sana.", goal: null },
  { id: "task", title: "Kerjakan tugas", text: "Ada gelembung Post! Masuk ke cubicle yang lantainya menyala dan diam sampai bar putih penuh.", goal: "task" },
  { id: "print", title: "Tugas print", text: "Ambil kertas di mesin fotokopi (kanan atas), lalu antar ke cubicle yang menyala.", goal: "copier" },
  { id: "cooler", title: "Isi energi", text: "Energimu tinggal sedikit. Berdiri di water cooler (pojok kiri) sampai penuh.", goal: "cooler" },
  { id: "coffee", title: "Power-up kopi", text: "Kopi muncul acak di lantai. Ambil untuk jalan & kerja lebih cepat sebentar!", goal: "coffee" },
];

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
    viralChance: Math.min(0.25, 0.08 + day * 0.03),
  };
}

export function createGame(level, world, { mascot = "blue", seed = Date.now(), best = 0, tutorial = false } = {}) {
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
    coins: 0, upgrades: {}, rank: 0,
    player: actor(mascot),
    npcs,
    tasks: [], nextId: 1, spawnTimer: 1.5, copierProgress: 0, refillCooldown: 0, refillGain: 0,
    coffee: null, coffeeTimer: 18, boost: 0,
    quests: [],
    dayStats: freshDayStats(),
    totals: { done: 0, missed: 0, quests: 0 },
    tutorial: tutorial ? { step: 0, moved: 0 } : null,
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
  g.player.path = [];
  g.copierProgress = 0;
  g.coffee = null;
  g.coffeeTimer = coffeeInterval(g) * 0.6;
  g.boost = 0;
  g.dayStats = freshDayStats();
  g.quests = rollQuests(g.day, g.rng);
  if (g.tutorial) enterTutorialStep(g);
}

export function nextDay(g) {
  g.day += 1;
  startDay(g);
}

// ---- derived stats ---------------------------------------------------------
const lvl = (g, id) => g.upgrades[id] || 0;
const boosted = (g) => g.boost > 0;
export function stats(g) {
  return {
    speed: SPEED * g.perk.speed * (1 + 0.1 * lvl(g, "shoes")) * (boosted(g) ? 1.35 : 1),
    work: g.perk.work * (1 + 0.12 * lvl(g, "keyboard")) * (boosted(g) ? 1.4 : 1),
    drain: g.perk.drain * (1 - 0.15 * lvl(g, "thermos")),
  };
}
const coffeeInterval = (g) => 26 - 5 * lvl(g, "barista");
const boostTime = (g) => 8 + 2 * lvl(g, "barista");

export function buyUpgrade(g, id) {
  const cost = upgradeCost(g.upgrades, id);
  if (cost === null || g.coins < cost) return false;
  if (id === "dayoff" && g.hearts >= MAX_HEARTS) return false;
  g.coins -= cost;
  if (id === "dayoff") g.hearts += 1;
  else g.upgrades[id] = lvl(g, id) + 1;
  emit(g, "buy", { id });
  return true;
}
export { UPGRADES, RANKS };

/** In-game wall clock for the HUD, e.g. "13:45". */
export function clockText(g) {
  const minutes = 9 * 60 + Math.floor((g.clock / DAY_SECONDS) * 8 * 60);
  const hh = Math.min(17, Math.floor(minutes / 60));
  const mm = hh === 17 ? 0 : minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm - (mm % 5)).padStart(2, "0")}`;
}

/** Screen-relative direction (keys / joystick) -> normalised world direction. */
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

function makeTask(g, kind, cubicle, { viral = false, patience } = {}) {
  const d = difficulty(g.day);
  const base = patience ?? d.patience * (kind === "print" ? 1.5 : kind === "reply" ? 0.8 : 1) * (viral ? 0.75 : 1);
  const task = { id: g.nextId++, kind, cubicle, viral, patience: base, maxPatience: base, progress: 0, printed: false };
  g.tasks.push(task);
  emit(g, "spawn", { kind, viral });
  return task;
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
  const viral = kind !== "print" && g.rng() < d.viralChance;
  return makeTask(g, kind, c.id, { viral });
}

function addCoins(g, n) {
  g.coins += n;
  g.dayStats.coins += n;
}

function completeTask(g, task) {
  const type = TASK_TYPES[task.kind];
  g.combo += 1;
  const mult = (1 + Math.min(g.combo - 1, 10) * 0.1) * (task.viral ? 2.5 : 1);
  const frac = task.patience / task.maxPatience;
  const pts = Math.round((type.points + Math.round(frac * 50)) * mult);
  const s = g.dayStats;
  g.score += pts;
  s.done += 1;
  s.points += pts;
  s.byKind[task.kind] += 1;
  s.maxCombo = Math.max(s.maxCombo, g.combo);
  if (task.viral) s.viral += 1;
  if (frac > 0.5) s.fast += 1;
  g.totals.done += 1;
  addCoins(g, task.viral ? 15 : 5);
  if (g.player.carrying === task.id) g.player.carrying = null;
  g.tasks = g.tasks.filter((t) => t !== task);
  const c = g.level.cubicles[task.cubicle];
  fx(g, `+${pts}`, [c.screen[0], c.screen[1], c.screen[2] + 10], task.viral ? "#ffb63a" : "#ffe27a");
  if (g.combo > 1) fx(g, `x${g.combo}`, [c.screen[0] + 8, c.screen[1] - 8, c.screen[2] + 2], "#67c6dd");
  emit(g, "done", { combo: g.combo, pts, viral: task.viral, kind: task.kind });
  const r = rankFor(g.score);
  if (r > g.rank) {
    g.rank = r;
    emit(g, "rank", { name: RANKS[r].name });
  }
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
  const st = stats(g);
  const speed = st.speed * (g.energy < TIRED ? 0.6 : 1);
  if (input.target) {
    p.path = g.world.findPath(p.x, p.y, input.target[0], input.target[1]);
  }
  const [wx, wy] = screenDirToWorld(input.dx || 0, input.dy || 0);
  const ox = p.x, oy = p.y;
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
    g.energy = Math.max(0, g.energy - 0.45 * st.drain * dt);
    if (g.tutorial) g.tutorial.moved += Math.hypot(p.x - ox, p.y - oy);
  } else {
    p.anim = 0;
  }
}

function updateWork(g, dt) {
  const p = g.player;
  const z = zoneAt(g, p.x, p.y);
  const st = stats(g);
  const rate = st.work * (g.energy < TIRED ? 0.55 : 1);
  p.working = null;

  if (z?.type === "cooler") {
    if (g.energy < MAX_ENERGY) {
      const gain = Math.min(MAX_ENERGY - g.energy, 32 * dt);
      g.energy += gain;
      g.refillGain += gain;
      p.working = "cooler";
      g.refillCooldown -= dt;
      if (g.refillCooldown <= 0) { emit(g, "refill"); g.refillCooldown = 0.45; }
      if (g.energy >= MAX_ENERGY && g.refillGain >= 25) {
        g.dayStats.refills += 1;
        g.refillGain = 0;
        emit(g, "full");
      }
    }
  } else {
    g.refillGain = 0;
  }
  if (z?.type === "copier") {
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
      g.energy = Math.max(0, g.energy - 2.4 * st.drain * dt);
      if (task.progress >= TASK_TYPES[task.kind].work) completeTask(g, task);
    }
  }
  if (z?.type !== "copier") g.copierProgress = 0;
}

function spawnCoffee(g, at) {
  const pois = g.level.pois;
  const [x, y] = at || pois[Math.floor(g.rng() * pois.length)];
  g.coffee = { x, y, ttl: 14 + 3 * lvl(g, "barista") };
  emit(g, "coffeespawn");
}

function updateCoffee(g, dt) {
  const hadBoost = g.boost > 0;
  g.boost = Math.max(0, g.boost - dt);
  if (hadBoost && g.boost === 0) emit(g, "boostend");
  if (g.coffee) {
    const p = g.player;
    if (Math.hypot(p.x - g.coffee.x, p.y - g.coffee.y) < COFFEE_REACH) {
      g.boost = boostTime(g);
      g.energy = Math.min(MAX_ENERGY, g.energy + 25);
      g.dayStats.coffees += 1;
      fx(g, "+", [g.coffee.x, g.coffee.y, 16], "#f5a623");
      g.coffee = null;
      emit(g, "coffee");
      return;
    }
    if (!g.tutorial) {
      g.coffee.ttl -= dt;
      if (g.coffee.ttl <= 0) g.coffee = null;
    }
  } else if (!g.tutorial) {
    g.coffeeTimer -= dt;
    if (g.coffeeTimer <= 0) {
      spawnCoffee(g);
      g.coffeeTimer = coffeeInterval(g) * (0.8 + g.rng() * 0.4);
    }
  }
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

// ---- tutorial ----------------------------------------------------------------
function enterTutorialStep(g) {
  const step = TUTORIAL_STEPS[g.tutorial.step];
  g.tasks = [];
  g.player.carrying = null;
  if (step.id === "task") makeTask(g, "post", 0, { patience: 99 });
  if (step.id === "print") makeTask(g, "print", 1, { patience: 99 });
  if (step.id === "cooler") g.energy = 30;
  if (step.id === "coffee") { g.energy = Math.min(g.energy, 70); spawnCoffee(g, [150, 116]); }
  emit(g, "tutorial", { step: g.tutorial.step });
}

function tutorialDone(g) {
  const id = TUTORIAL_STEPS[g.tutorial.step].id;
  if (id === "move") return g.tutorial.moved > 40;
  if (id === "task" || id === "print") return g.tasks.length === 0;
  if (id === "cooler") return g.energy >= 95;
  if (id === "coffee") return g.boost > 0;
  return true;
}

export const TUTORIAL_BONUS = 20;

/** End the practice shift; the real day starts clean (bonus coins if completed). */
export function skipTutorial(g, completed = false) {
  if (!g.tutorial) return;
  g.tutorial = null;
  g.tasks = [];
  g.player.carrying = null;
  g.energy = MAX_ENERGY;
  g.coffee = null;
  g.boost = 0;
  g.spawnTimer = 1.5;
  g.clock = 0;
  g.score = 0;
  g.combo = 0;
  g.rank = 0;
  g.coins = completed ? TUTORIAL_BONUS : 0;
  g.dayStats = freshDayStats();
  for (const q of g.quests) { q.progress = 0; q.done = false; }
  emit(g, "tutorialdone", { completed });
}

function updateTutorial(g) {
  if (!tutorialDone(g)) return;
  g.tutorial.step += 1;
  if (g.tutorial.step >= TUTORIAL_STEPS.length) skipTutorial(g, true);
  else enterTutorialStep(g);
}

// ---- main tick -----------------------------------------------------------
function endDay(g) {
  g.clock = DAY_SECONDS;
  for (const q of checkQuests(g.quests, g.dayStats, true)) rewardQuest(g, q);
  g.mode = "dayend";
  const perfect = g.dayStats.missed === 0;
  if (perfect) g.hearts = Math.min(MAX_HEARTS, g.hearts + 1);
  g.dayStats.perfect = perfect;
  g.tasks = [];
  g.coffee = null;
  g.boost = 0;
  g.player.carrying = null;
  g.best = Math.max(g.best, g.score);
  emit(g, "dayend", { perfect });
}

function rewardQuest(g, q) {
  addCoins(g, q.reward);
  g.totals.quests += 1;
  emit(g, "quest", { text: q.text, reward: q.reward });
}

export function update(g, dt, input = {}) {
  g.events.length = 0;
  if (g.mode === "paused") return g;
  g.time += dt;
  for (const f of g.fx) f.t += dt;
  g.fx = g.fx.filter((f) => f.t < 1.2);
  for (const n of g.npcs) updateNpc(g, n, dt);
  if (g.mode !== "playing") return g;

  if (!g.tutorial) {
    g.clock += dt;
    if (g.clock >= DAY_SECONDS) { endDay(g); return g; }
  }

  updatePlayer(g, dt, input);
  for (const t of g.tasks) t.active = false;
  updateWork(g, dt);
  updateCoffee(g, dt);
  if (g.mode !== "playing") return g;

  if (g.tutorial) {
    updateTutorial(g);
    return g;
  }

  for (const q of checkQuests(g.quests, g.dayStats)) rewardQuest(g, q);

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
export const _internal = { spawnTask, completeTask, missTask, spawnCoffee, makeTask };
