// 2:1 isometric projection + painter's sort; mirrors tools/iso.py exactly so
// runtime sprites stack the same way as the pre-rendered scene.

export function project(o, x, y, z = 0) {
  return [o.x + x - y, o.y + Math.floor((x + y) / 2) - z];
}

/** Screen point -> world point on the floor plane (z = 0). */
export function unproject(o, sx, sy) {
  const a = sx - o.x;
  const b = 2 * (sy - o.y);
  return [(a + b) / 2, (b - a) / 2];
}

export function screenBBox(o, box) {
  const [x0, x1, y0, y1, z0, z1] = box;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
    const [sx, sy] = project(o, x, y, z);
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }
  return [minX, minY, maxX, maxY];
}

/** Topological painter's sort for axis-aligned boxes (items need `.box`). */
export function depthSort(o, items) {
  const n = items.length;
  const bbs = items.map((it) => it.bbox || screenBBox(o, it.box));
  const behind = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const a = items[i].box, ba = bbs[i];
    for (let j = i + 1; j < n; j++) {
      const b = items[j].box, bb = bbs[j];
      if (ba[2] < bb[0] || bb[2] < ba[0] || ba[3] < bb[1] || bb[3] < ba[1]) continue;
      if (a[1] <= b[0] || a[3] <= b[2] || a[5] <= b[4]) behind[j].push(i);
      else if (b[1] <= a[0] || b[3] <= a[2] || b[5] <= a[4]) behind[i].push(j);
      else if (a[0] + a[1] + a[2] + a[3] <= b[0] + b[1] + b[2] + b[3]) behind[j].push(i);
      else behind[i].push(j);
    }
  }
  const order = [...items.keys()].sort(
    (p, q) => items[p].box[1] + items[p].box[3] - (items[q].box[1] + items[q].box[3]) ||
      items[p].box[4] - items[q].box[4] || p - q,
  );
  const state = new Uint8Array(n);
  const out = [];
  const visit = (k) => {
    if (state[k]) return; // done, or on the stack (cycle: break it)
    state[k] = 1;
    for (const q of behind[k]) visit(q);
    state[k] = 2;
    out.push(items[k]);
  };
  for (const k of order) visit(k);
  return out;
}

/** Screen overlap bbox for an exported object: box silhouette ∪ sprite pixels
 * (billboards like plants overhang their footprint). */
export function objectBBox(o, ob) {
  const b = screenBBox(o, ob.box);
  return [
    Math.min(b[0], ob.at[0]),
    Math.min(b[1], ob.at[1]),
    Math.max(b[2], ob.at[0] + ob.src[2] - 1),
    Math.max(b[3], ob.at[1] + ob.src[3] - 1),
  ];
}
