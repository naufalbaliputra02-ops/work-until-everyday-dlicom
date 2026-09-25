// Collision against furniture footprints + A* on a 4-unit grid.

export const CELL = 4;
export const RADIUS = 4;

export function createWorld(level) {
  const W = level.world.w, H = level.world.h;
  const solids = level.objects
    .filter((o) => o.solid)
    .map((o) => [o.box[0], o.box[2], o.box[1], o.box[3]]); // x0, y0, x1, y1
  const cols = W / CELL, rows = H / CELL;

  const collides = (x, y, r = RADIUS) => {
    if (x < r || y < r || x > W - r || y > H - r) return true;
    for (const [x0, y0, x1, y1] of solids) {
      if (x > x0 - r && x < x1 + r && y > y0 - r && y < y1 + r) return true;
    }
    return false;
  };

  const blocked = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      blocked[j * cols + i] = collides(i * CELL + CELL / 2, j * CELL + CELL / 2) ? 1 : 0;
    }
  }

  const cellOf = (x, y) => [
    Math.min(cols - 1, Math.max(0, Math.floor(x / CELL))),
    Math.min(rows - 1, Math.max(0, Math.floor(y / CELL))),
  ];
  const center = (i, j) => [i * CELL + CELL / 2, j * CELL + CELL / 2];

  function nearestFree(i, j) {
    if (!blocked[j * cols + i]) return [i, j];
    const seen = new Uint8Array(cols * rows);
    const q = [[i, j]];
    seen[j * cols + i] = 1;
    while (q.length) {
      const [a, b] = q.shift();
      if (!blocked[b * cols + a]) return [a, b];
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const na = a + da, nb = b + db;
        if (na < 0 || nb < 0 || na >= cols || nb >= rows || seen[nb * cols + na]) continue;
        seen[nb * cols + na] = 1;
        q.push([na, nb]);
      }
    }
    return null;
  }

  function lineClear(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(d / 2);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (collides(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  /** World-space waypoints from (sx, sy) to (tx, ty), or [] if unreachable. */
  function findPath(sx, sy, tx, ty) {
    const start = nearestFree(...cellOf(sx, sy));
    const goal = nearestFree(...cellOf(tx, ty));
    if (!start || !goal) return [];
    const N = cols * rows;
    const g = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const s = start[1] * cols + start[0], e = goal[1] * cols + goal[0];
    const h = (k) => {
      const dx = Math.abs((k % cols) - goal[0]), dy = Math.abs(((k / cols) | 0) - goal[1]);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };
    const heap = new MinHeap();
    g[s] = 0;
    heap.push(h(s), s);
    while (heap.size) {
      const k = heap.pop();
      if (k === e) break;
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % cols, j = (k / cols) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
          const nk = nj * cols + ni;
          if (blocked[nk]) continue;
          if (di && dj && (blocked[j * cols + ni] || blocked[nj * cols + i])) continue; // no corner cutting
          const ng = g[k] + (di && dj ? Math.SQRT2 : 1);
          if (ng < g[nk]) {
            g[nk] = ng;
            from[nk] = k;
            heap.push(ng + h(nk), nk);
          }
        }
      }
    }
    if (s !== e && from[e] < 0) return [];
    const cells = [];
    for (let k = e; k !== s; k = from[k]) cells.push(center(k % cols, (k / cols) | 0));
    cells.reverse();
    if (!collides(tx, ty)) cells.push([tx, ty]);
    // string-pull: keep only waypoints needed for line of sight
    const out = [];
    let cx = sx, cy = sy;
    for (let k = 0; k < cells.length; k++) {
      const next = cells[k + 1];
      if (next && lineClear(cx, cy, next[0], next[1])) continue;
      out.push(cells[k]);
      [cx, cy] = cells[k];
    }
    return out;
  }

  /** Move with axis-separated sliding. Returns true if any movement happened. */
  function move(p, dx, dy) {
    let moved = false;
    if (dx && !collides(p.x + dx, p.y)) { p.x += dx; moved = true; }
    if (dy && !collides(p.x, p.y + dy)) { p.y += dy; moved = true; }
    return moved;
  }

  return { W, H, cols, rows, solids, blocked, collides, findPath, move, lineClear };
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.v.length; }
  push(key, val) {
    const { k, v } = this;
    let i = v.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const { k, v } = this;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (v.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < v.length && k[l] < k[m]) m = l;
        if (r < v.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}
