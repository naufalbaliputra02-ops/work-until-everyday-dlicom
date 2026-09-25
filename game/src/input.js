// Keyboard (screen-relative), click/tap-to-move and an on-screen joystick.

const KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
const DEADZONE = 0.22;

export function createInput(canvas, toWorld, joyEl) {
  const held = new Set();
  let target = null;
  const joy = { id: null, dx: 0, dy: 0 };

  window.addEventListener("keydown", (e) => {
    if (KEYS[e.code]) { held.add(e.code); e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => held.delete(e.code));
  window.addEventListener("blur", () => { held.clear(); releaseJoy(); });

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    target = toWorld(e.clientX, e.clientY);
  });

  // ---- joystick ----
  const knob = joyEl?.querySelector(".knob");
  function setJoy(e) {
    const r = joyEl.getBoundingClientRect();
    const rad = r.width / 2;
    let dx = (e.clientX - (r.left + rad)) / rad;
    let dy = (e.clientY - (r.top + rad)) / rad;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    knob.style.transform = `translate(${dx * rad * 0.55}px, ${dy * rad * 0.55}px)`;
    const m = Math.hypot(dx, dy);
    joy.dx = m < DEADZONE ? 0 : dx;
    joy.dy = m < DEADZONE ? 0 : dy;
  }
  function releaseJoy() {
    joy.id = null; joy.dx = 0; joy.dy = 0;
    if (knob) knob.style.transform = "";
    joyEl?.classList.remove("active");
  }
  if (joyEl) {
    joyEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      joy.id = e.pointerId;
      joyEl.setPointerCapture(e.pointerId);
      joyEl.classList.add("active");
      setJoy(e);
    });
    joyEl.addEventListener("pointermove", (e) => { if (e.pointerId === joy.id) setJoy(e); });
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) {
      joyEl.addEventListener(t, (e) => { if (e.pointerId === joy.id) releaseJoy(); });
    }
  }

  return {
    read() {
      let dx = 0, dy = 0;
      for (const k of held) { dx += KEYS[k][0]; dy += KEYS[k][1]; }
      dx = Math.sign(dx); dy = Math.sign(dy);
      if (!dx && !dy) { dx = joy.dx; dy = joy.dy; }
      const out = { dx, dy, target };
      target = null;
      return out;
    },
    clear() { held.clear(); target = null; releaseJoy(); },
  };
}
