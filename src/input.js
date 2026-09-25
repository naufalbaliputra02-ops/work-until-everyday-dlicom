// Keyboard (screen-relative) + click/tap-to-move.

const KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

export function createInput(canvas, toWorld) {
  const held = new Set();
  let target = null;

  window.addEventListener("keydown", (e) => {
    if (KEYS[e.code]) { held.add(e.code); e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => held.delete(e.code));
  window.addEventListener("blur", () => held.clear());

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    target = toWorld(e.clientX, e.clientY);
  });

  return {
    read() {
      let dx = 0, dy = 0;
      for (const k of held) { dx += KEYS[k][0]; dy += KEYS[k][1]; }
      const out = { dx: Math.sign(dx), dy: Math.sign(dy), target };
      target = null;
      return out;
    },
    clear() { held.clear(); target = null; },
  };
}
