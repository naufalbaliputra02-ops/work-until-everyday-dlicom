import test from "node:test";
import assert from "node:assert/strict";
import { depthSort, objectBBox, project, screenBBox, unproject } from "../src/iso.js";
import { level } from "./helpers.js";

const o = level.origin;

test("unproject inverts project on the floor plane", () => {
  for (const [x, y] of [[0, 0], [16, 32], [255, 1], [100, 223]]) {
    const [sx, sy] = project(o, x, y, 0);
    const [wx, wy] = unproject(o, sx, sy);
    assert.ok(Math.abs(wx - x) <= 1 && Math.abs(wy - y) <= 1, `${x},${y} -> ${wx},${wy}`);
  }
});

test("exported sprites sit on their boxes; only plants overhang", () => {
  for (const ob of level.objects) {
    const ob2 = objectBBox(o, ob);
    const bb = screenBBox(o, ob.box);
    const overhang = Math.max(bb[0] - ob2[0], ob2[2] - bb[2], bb[1] - ob2[1], ob2[3] - bb[3]);
    if (ob.name.startsWith("plant")) assert.ok(overhang <= 8, `${ob.name} overhang ${overhang}`);
    else assert.ok(overhang <= 1, `${ob.name} overhang ${overhang}`);
  }
});

function assertValidOrder(items) {
  const sorted = depthSort(o, items);
  assert.equal(sorted.length, items.length);
  const idx = new Map(sorted.map((it, i) => [it, i]));
  const bbox = (it) => it.bbox || screenBBox(o, it.box);
  for (const a of items) {
    for (const b of items) {
      if (a === b) continue;
      const ba = bbox(a), bb = bbox(b);
      if (ba[2] < bb[0] || bb[2] < ba[0] || ba[3] < bb[1] || bb[3] < ba[1]) continue;
      const A = a.box, B = b.box;
      const aBehind = A[1] <= B[0] || A[3] <= B[2] || A[5] <= B[4];
      const bBehind = B[1] <= A[0] || B[3] <= A[2] || B[5] <= A[4];
      if (aBehind && !bBehind) {
        assert.ok(idx.get(a) < idx.get(b), `${a.name} should draw before ${b.name}`);
      }
    }
  }
}

test("depth sort puts every occluded object first (static level)", () => {
  assertValidOrder(level.objects.map((ob) => ({ ...ob, bbox: objectBBox(o, ob) })));
});

test("depth sort handles actors walking between furniture", () => {
  const actors = [[40, 20], [120, 110], [110, 90], [150, 180], [236, 80], [60, 140]].map(([x, y], i) => ({
    name: `actor${i}`,
    box: [x - 3, x + 3, y - 3, y + 3, 0, 16],
  }));
  assertValidOrder([...level.objects.map((ob) => ({ ...ob, bbox: objectBBox(o, ob) })), ...actors]);
});
