import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../src/world.js";
import { freeSpotIn, level } from "./helpers.js";

const world = createWorld(level);

function walk(path, from) {
  let [x, y] = from;
  for (const [nx, ny] of path) {
    assert.ok(world.lineClear(x, y, nx, ny), `segment ${x},${y} -> ${nx},${ny} hits furniture`);
    [x, y] = [nx, ny];
  }
  return [x, y];
}

test("mascot spawns are standable", () => {
  for (const [name, [x, y]] of Object.entries(level.spawns)) {
    assert.equal(world.collides(x, y), false, name);
  }
});

test("every cubicle, the cooler and the copier are reachable", () => {
  const start = level.spawns.blue;
  const zones = [...level.cubicles.map((c) => c.zone), level.cooler.zone, level.copier.zone];
  for (const zone of zones) {
    const spot = freeSpotIn(world, zone);
    assert.ok(spot, `no free spot in ${zone}`);
    const path = world.findPath(start[0], start[1], spot[0], spot[1]);
    assert.ok(path.length > 0, `unreachable ${zone}`);
    const end = walk(path, start);
    assert.deepEqual(end, spot);
  }
});

test("all NPC points of interest are reachable", () => {
  for (const [x, y] of level.pois) {
    const path = world.findPath(...level.spawns.pink, x, y);
    assert.ok(path.length > 0, `poi ${x},${y}`);
    walk(path, level.spawns.pink);
  }
});

test("movement slides along furniture instead of passing through", () => {
  // walk straight into the first filing cabinet (x 36..50, y 0..12)
  const p = { x: 43, y: 24 };
  for (let i = 0; i < 100; i++) world.move(p, 0, -0.5);
  assert.ok(p.y >= 12 + 4 - 0.5, `ended inside cabinet at y=${p.y}`);
  const q = { x: 43, y: 24 };
  for (let i = 0; i < 100; i++) world.move(q, 0.5, -0.5);
  assert.ok(q.x > 43, "should slide sideways along the cabinet face");
});
