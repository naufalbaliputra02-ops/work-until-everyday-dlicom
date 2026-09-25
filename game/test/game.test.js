import test from "node:test";
import assert from "node:assert/strict";
import { DAY_SECONDS, MAX_HEARTS, TASK_TYPES, _internal, clockText, createGame, startDay, update, zoneAt } from "../src/game.js";
import { createWorld } from "../src/world.js";
import { freeSpotIn, level } from "./helpers.js";

const world = createWorld(level);

function fresh(opts = {}) {
  const g = createGame(level, world, { seed: 42, ...opts });
  startDay(g);
  g.spawnTimer = 999;
  return g;
}

function teleport(g, zone) {
  const [x, y] = freeSpotIn(world, zone);
  g.player.x = x;
  g.player.y = y;
}

function run(g, seconds, step = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds; t += step) {
    update(g, step);
    events.push(...g.events.map((e) => e.type));
    if (g.mode !== "playing") break;
  }
  return events;
}

test("clock runs 09:00 to 17:00", () => {
  const g = fresh();
  assert.equal(clockText(g), "09:00");
  g.clock = DAY_SECONDS / 2;
  assert.equal(clockText(g), "13:00");
  g.clock = DAY_SECONDS;
  assert.equal(clockText(g), "17:00");
});

test("zones are detected", () => {
  const g = fresh();
  const c = level.cubicles[3];
  assert.deepEqual(zoneAt(g, (c.zone[0] + c.zone[2]) / 2, (c.zone[1] + c.zone[3]) / 2), { type: "cubicle", id: 3 });
  assert.deepEqual(zoneAt(g, 20, 20), { type: "cooler" });
  assert.equal(zoneAt(g, 150, 116), null);
});

test("standing in the cubicle completes its task and scores", () => {
  const g = fresh();
  const task = _internal.spawnTask(g);
  task.kind = "post";
  teleport(g, level.cubicles[task.cubicle].zone);
  const events = run(g, TASK_TYPES.post.work + 0.2);
  assert.ok(events.includes("done"));
  assert.equal(g.tasks.length, 0);
  assert.ok(g.score >= TASK_TYPES.post.points);
  assert.equal(g.combo, 1);
});

test("ignored tasks cost a heart and reset the combo", () => {
  const g = fresh();
  g.combo = 4;
  const task = _internal.spawnTask(g);
  g.player.x = 150; g.player.y = 116; // corridor, away from every zone
  const events = run(g, task.maxPatience + 0.5);
  assert.ok(events.includes("miss"));
  assert.equal(g.hearts, MAX_HEARTS - 1);
  assert.equal(g.combo, 0);
});

test("losing every heart ends the game", () => {
  const g = fresh();
  g.hearts = 1;
  _internal.spawnTask(g);
  g.player.x = 150; g.player.y = 116;
  run(g, 60);
  assert.equal(g.mode, "gameover");
});

test("print jobs need a trip to the copier first", () => {
  const g = fresh();
  const task = _internal.spawnTask(g);
  Object.assign(task, { kind: "print" });
  const cub = level.cubicles[task.cubicle].zone;
  teleport(g, cub);
  run(g, 2);
  assert.equal(g.tasks.length, 1, "can't deliver without paper");
  teleport(g, level.copier.zone);
  const ev = run(g, 1.5);
  assert.ok(ev.includes("print"));
  assert.equal(g.player.carrying, task.id);
  teleport(g, cub);
  assert.ok(run(g, 1).includes("done"));
  assert.equal(g.player.carrying, null);
});

test("water cooler refills energy", () => {
  const g = fresh();
  g.energy = 10;
  teleport(g, level.cooler.zone);
  run(g, 1);
  assert.ok(g.energy > 35);
});

test("a day ends at 17:00; a perfect day restores a heart", () => {
  const g = fresh();
  g.hearts = 3;
  g.player.x = 150; g.player.y = 116;
  const ev = run(g, DAY_SECONDS + 1, 0.05);
  assert.ok(ev.includes("dayend"));
  assert.equal(g.mode, "dayend");
  assert.equal(g.hearts, 4);
});

test("tasks keep spawning over a simulated day", () => {
  const g = fresh();
  g.spawnTimer = 0;
  g.player.x = 150; g.player.y = 116;
  let spawns = 0;
  for (let t = 0; t < 40; t += 0.05) {
    update(g, 0.05);
    spawns += g.events.filter((e) => e.type === "spawn").length;
  }
  assert.ok(spawns >= 3, `only ${spawns} spawns`);
  const cubicles = g.tasks.map((t) => t.cubicle);
  assert.equal(new Set(cubicles).size, cubicles.length, "one task per cubicle");
});

test("keyboard movement walks the player and can't enter furniture", () => {
  const g = fresh();
  const start = { ...g.player };
  for (let i = 0; i < 30; i++) update(g, 1 / 60, { dx: 1, dy: 0 });
  assert.ok(g.player.x > start.x && g.player.y < start.y, "screen-right = +x, -y");
  for (let i = 0; i < 600; i++) update(g, 1 / 60, { dx: 0, dy: -1 });
  assert.equal(world.collides(g.player.x, g.player.y), false);
});

test("tap-to-move pathfinds to the tapped spot", () => {
  const g = fresh();
  const target = freeSpotIn(world, level.cubicles[5].zone);
  update(g, 1 / 60, { target });
  for (let i = 0; i < 60 * 15 && g.player.path.length; i++) update(g, 1 / 60);
  assert.ok(Math.hypot(g.player.x - target[0], g.player.y - target[1]) < 0.5);
});
