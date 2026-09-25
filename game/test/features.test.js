import test from "node:test";
import assert from "node:assert/strict";
import {
  DAY_SECONDS, MAX_HEARTS, TASK_TYPES, TUTORIAL_BONUS, TUTORIAL_STEPS, _internal, buyUpgrade, createGame, nextDay, skipTutorial, startDay,
  stats, update,
} from "../src/game.js";
import { QUEST_POOL, checkQuests, freshDayStats, rankFor, rollQuests, upgradeCost } from "../src/progression.js";
import { mulberry32 } from "../src/game.js";
import { createWorld } from "../src/world.js";
import { freeSpotIn, level } from "./helpers.js";

const world = createWorld(level);
const CORRIDOR = [150, 116];

function fresh(opts = {}) {
  const g = createGame(level, world, { seed: 7, ...opts });
  startDay(g);
  if (!g.tutorial) g.spawnTimer = 999;
  g.coffeeTimer = 999;
  return g;
}
const at = (g, [x, y]) => { g.player.x = x; g.player.y = y; g.player.path = []; };
const toZone = (g, zone) => at(g, freeSpotIn(world, zone));
function run(g, seconds, input = {}, step = 1 / 60) {
  const ev = [];
  for (let t = 0; t < seconds; t += step) {
    update(g, step, input);
    ev.push(...g.events);
    if (g.mode !== "playing") break;
  }
  return ev;
}
function walkTo(g, [x, y], seconds = 20) {
  update(g, 1 / 60, { target: [x, y] });
  const ev = [...g.events];
  for (let t = 0; t < seconds && g.player.path.length; t += 1 / 60) {
    update(g, 1 / 60);
    ev.push(...g.events);
  }
  return ev;
}

test("each day rolls 3 distinct, day-appropriate quests", () => {
  for (let day = 1; day <= 6; day++) {
    for (let seed = 1; seed < 40; seed++) {
      const qs = rollQuests(day, mulberry32(seed));
      assert.equal(qs.length, 3);
      assert.equal(new Set(qs.map((q) => q.id)).size, 3);
      for (const q of qs) {
        const def = QUEST_POOL.find((d) => d.id === q.id);
        assert.ok((def.minDay || 1) <= day, `${q.id} too early on day ${day}`);
      }
    }
  }
});

test("quest progress is tracked and pays coins once", () => {
  const g = fresh();
  g.quests = rollQuests(1, mulberry32(1)).slice(0, 0);
  g.quests.push({ id: "post3", text: "x", target: 3, reward: 30, progress: 0, done: false });
  at(g, CORRIDOR);
  const coins0 = g.coins;
  let quests = 0;
  for (let i = 0; i < 3; i++) {
    const t = _internal.makeTask(g, "post", i);
    toZone(g, level.cubicles[t.cubicle].zone);
    quests += run(g, TASK_TYPES.post.work + 0.3).filter((e) => e.type === "quest").length;
  }
  assert.equal(quests, 1);
  assert.equal(g.quests[0].done, true);
  assert.equal(g.coins - coins0, 3 * 5 + 30);
  quests = run(g, 1).filter((e) => e.type === "quest").length;
  assert.equal(quests, 0, "no double payout");
});

test("the no-miss quest only resolves at 17:00", () => {
  const stats0 = freshDayStats();
  const qs = [{ id: "perfect", target: 1, reward: 60, endOnly: true, progress: 0, done: false }];
  assert.equal(checkQuests(qs, stats0).length, 0);
  assert.equal(checkQuests(qs, stats0, true).length, 1);
  const qs2 = [{ id: "perfect", target: 1, reward: 60, endOnly: true, progress: 0, done: false }];
  assert.equal(checkQuests(qs2, { ...stats0, missed: 1 }, true).length, 0);
});

test("career rank rises with score and announces it", () => {
  assert.equal(rankFor(0), 0);
  assert.equal(rankFor(1500), 1);
  assert.equal(rankFor(99999), 6);
  const g = fresh();
  g.score = 1490;
  const t = _internal.makeTask(g, "post", 0);
  toZone(g, level.cubicles[t.cubicle].zone);
  const ev = run(g, 2.2);
  assert.ok(ev.some((e) => e.type === "rank" && e.name === "Staf"));
});

test("viral tasks pay 2.5x", () => {
  const a = fresh(), b = fresh();
  for (const [g, viral] of [[a, false], [b, true]]) {
    const t = _internal.makeTask(g, "reply", 0, { viral, patience: 20 });
    toZone(g, level.cubicles[t.cubicle].zone);
    run(g, 1.2);
  }
  assert.ok(Math.abs(b.score / a.score - 2.5) < 0.05, `${a.score} vs ${b.score}`);
  assert.equal(b.dayStats.viral, 1);
});

test("coffee spawns, can be picked up and boosts speed + work", () => {
  const g = fresh();
  g.coffeeTimer = 0.01;
  const ev = run(g, 0.1);
  assert.ok(ev.some((e) => e.type === "coffeespawn"));
  assert.ok(g.coffee);
  const base = stats(g);
  const pick = walkTo(g, [g.coffee.x, g.coffee.y]);
  assert.ok(pick.some((e) => e.type === "coffee"));
  assert.ok(g.boost > 0);
  const boosted = stats(g);
  assert.ok(boosted.speed > base.speed * 1.3 && boosted.work > base.work * 1.3);
  run(g, 12);
  assert.equal(g.boost, 0);
});

test("uncollected coffee disappears", () => {
  const g = fresh();
  _internal.spawnCoffee(g, [200, 208]);
  at(g, CORRIDOR);
  run(g, 20);
  assert.equal(g.coffee, null);
});

test("shop: upgrades cost coins, stack, cap, and dayoff heals", () => {
  const g = fresh();
  g.coins = 1000;
  const s0 = stats(g).speed;
  assert.ok(buyUpgrade(g, "shoes"));
  assert.ok(stats(g).speed > s0);
  assert.ok(buyUpgrade(g, "shoes") && buyUpgrade(g, "shoes"));
  assert.equal(upgradeCost(g.upgrades, "shoes"), null);
  assert.equal(buyUpgrade(g, "shoes"), false, "maxed");
  assert.equal(g.coins, 1000 - 40 - 90 - 160);
  assert.equal(buyUpgrade(g, "dayoff"), false, "hearts already full");
  g.hearts = 3;
  assert.ok(buyUpgrade(g, "dayoff"));
  assert.equal(g.hearts, 4);
  g.coins = 10;
  assert.equal(buyUpgrade(g, "keyboard"), false, "too poor");
});

test("upgrades survive into the next day", () => {
  const g = fresh();
  g.coins = 100;
  buyUpgrade(g, "keyboard");
  nextDay(g);
  assert.equal(g.upgrades.keyboard, 1);
  assert.equal(g.day, 2);
  assert.equal(g.quests.length, 3);
});

test("tutorial walks through every step by actually playing it", () => {
  const g = fresh({ tutorial: true });
  assert.equal(g.tutorial.step, 0);
  const steps = [];
  const record = (ev) => ev.filter((e) => e.type === "tutorial").forEach((e) => steps.push(e.step));

  record(run(g, 1.5, { dx: 0, dy: 1 })); // move (screen-down = open floor)
  assert.equal(g.tutorial.step, 1);
  assert.equal(g.tasks[0].kind, "post");

  toZone(g, level.cubicles[g.tasks[0].cubicle].zone);
  record(run(g, 2.5)); // task
  assert.equal(g.tutorial.step, 2);
  const print = g.tasks[0];
  assert.equal(print.kind, "print");

  toZone(g, level.copier.zone);
  run(g, 1.5);
  toZone(g, level.cubicles[print.cubicle].zone);
  record(run(g, 1)); // print
  assert.equal(g.tutorial.step, 3);
  assert.ok(g.energy <= 30);

  toZone(g, level.cooler.zone);
  record(run(g, 3)); // cooler
  assert.equal(g.tutorial.step, 4);
  assert.ok(g.coffee);

  const ev = walkTo(g, [g.coffee.x, g.coffee.y]);
  assert.ok(ev.some((e) => e.type === "tutorialdone"));
  assert.equal(g.tutorial, null);
  assert.deepEqual(steps, [1, 2, 3, 4]);
  assert.ok(g.clock < 2, "real day starts fresh"); // walkTo keeps walking a moment after pickup
  assert.equal(g.hearts, MAX_HEARTS);
  assert.equal(g.score, 0, "practice points don't count");
  assert.equal(g.coins, TUTORIAL_BONUS);
  assert.ok(g.quests.every((q) => !q.done));
});

test("tutorial never costs hearts or advances the clock", () => {
  const g = fresh({ tutorial: true });
  g.tutorial.step = 1;
  skipTutorial(g); // reset path
  const h = fresh({ tutorial: true });
  run(h, 1, {}); // idle on step 0
  update(h, 1 / 60, { dx: 1 });
  run(h, 1.5, { dx: 1 });
  at(h, CORRIDOR);
  run(h, 200);
  assert.equal(h.hearts, MAX_HEARTS);
  assert.equal(h.clock, 0);
  assert.equal(h.mode, "playing");
  assert.ok(h.tutorial, "still waiting for the player");
  assert.ok(TUTORIAL_STEPS.length >= 5);
  assert.equal(g.tutorial, null);
});

test("a full simulated day with an idle player ends in dayend or gameover", () => {
  const g = fresh();
  g.spawnTimer = 0;
  g.coffeeTimer = 5;
  at(g, CORRIDOR);
  run(g, DAY_SECONDS + 1, {}, 0.05);
  assert.ok(["dayend", "gameover"].includes(g.mode));
});
