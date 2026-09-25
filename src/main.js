import { DAY_SECONDS, MAX_HEARTS, PERKS, clockText, createGame, nextDay, startDay, update } from "./game.js";
import { createWorld } from "./world.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { isMuted, play, toggleMute, unlockAudio } from "./audio.js";

const $ = (id) => document.getElementById(id);
const BEST_KEY = "wue-best";

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

async function boot() {
  const [level, room, objects, mascots] = await Promise.all([
    fetch("assets/level.json").then((r) => r.json()),
    loadImage("assets/room.png"),
    loadImage("assets/objects.png"),
    loadImage("assets/mascots.png"),
  ]);
  const world = createWorld(level);
  const canvas = $("game");
  const renderer = createRenderer(canvas, level, { room, objects, mascots });
  const input = createInput(canvas, renderer.toWorld);

  let choice = localStorage.getItem("wue-mascot") || "blue";
  let game = createGame(level, world, { mascot: choice, best: +localStorage.getItem(BEST_KEY) || 0 });

  // ---- layout: integer scaling when there is room, otherwise fit ----------
  function layout() {
    const hud = $("hud");
    const hudH = hud.hidden ? 0 : hud.offsetHeight;
    const availW = window.innerWidth - 16, availH = window.innerHeight - hudH - 16;
    let s = Math.min(availW / canvas.width, availH / canvas.height);
    if (s >= 1) s = Math.floor(s);
    const w = Math.floor(canvas.width * s), h = Math.floor(canvas.height * s);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    $("stage").style.width = `${w}px`;
    hud.style.width = `${Math.max(w, Math.min(window.innerWidth - 16, 520))}px`;
  }
  window.addEventListener("resize", layout);

  // ---- screens ------------------------------------------------------------
  const screens = ["scr-title", "scr-pause", "scr-dayend", "scr-over"];
  function show(id) {
    for (const s of screens) $(s).hidden = s !== id;
    $("hud").hidden = id === "scr-title";
    layout();
  }

  function buildPicker() {
    const pick = $("pick");
    const { w, h, names } = level.mascots;
    for (const [row, name] of names.entries()) {
      const btn = document.createElement("button");
      btn.className = "mascot";
      btn.setAttribute("role", "radio");
      btn.dataset.name = name;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(mascots, 0, row * h, w, h, 0, 0, w, h);
      btn.append(c);
      const label = document.createElement("span");
      label.innerHTML = `<b>${PERKS[name].name}</b><small>${PERKS[name].perk}</small>`;
      btn.append(label);
      btn.addEventListener("click", () => { choice = name; syncPicker(); play({ type: "click" }); });
      pick.append(btn);
    }
    syncPicker();
  }
  function syncPicker() {
    for (const b of $("pick").children) b.setAttribute("aria-checked", String(b.dataset.name === choice));
  }

  function newGame() {
    unlockAudio();
    localStorage.setItem("wue-mascot", choice);
    game = createGame(level, world, { mascot: choice, best: game.best });
    startDay(game);
    input.clear();
    show(null);
  }

  function toMenu() {
    game = createGame(level, world, { mascot: choice, best: game.best });
    $("best-title").textContent = game.best ? `Skor terbaik: ${game.best}` : "";
    show("scr-title");
  }

  function pause(on) {
    if (on && game.mode === "playing") { game.mode = "paused"; show("scr-pause"); }
    else if (!on && game.mode === "paused") { game.mode = "playing"; input.clear(); show(null); }
  }

  function stats(el, rows) {
    el.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  }

  $("btn-start").addEventListener("click", newGame);
  $("btn-retry").addEventListener("click", newGame);
  $("btn-menu").addEventListener("click", toMenu);
  $("btn-quit").addEventListener("click", toMenu);
  $("btn-resume").addEventListener("click", () => pause(false));
  $("btn-pause").addEventListener("click", () => pause(true));
  $("btn-next").addEventListener("click", () => { nextDay(game); input.clear(); show(null); });
  const muteBtn = $("btn-mute");
  const syncMute = () => { muteBtn.classList.toggle("off", isMuted()); };
  muteBtn.addEventListener("click", () => { unlockAudio(); toggleMute(); syncMute(); });
  syncMute();

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyP" || e.code === "Escape") pause(game.mode === "playing");
    else if (e.code === "KeyM") { unlockAudio(); toggleMute(); syncMute(); }
    else if ((e.code === "Enter" || e.code === "Space") && !e.repeat) {
      if (!$("scr-title").hidden) newGame();
      else if (!$("scr-dayend").hidden) $("btn-next").click();
      else if (!$("scr-over").hidden) newGame();
      else if (!$("scr-pause").hidden) pause(false);
      else return;
      e.preventDefault();
    }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(true); });
  window.addEventListener("pointerdown", unlockAudio, { once: true });

  // ---- HUD ------------------------------------------------------------------
  let last = {};
  function hud() {
    const next = {
      day: `HARI ${game.day}`,
      clock: clockText(game),
      score: game.score.toLocaleString("id-ID"),
      combo: game.combo > 1 ? `x${game.combo}` : "",
      hearts: "♥".repeat(Math.max(0, game.hearts)) + "♡".repeat(MAX_HEARTS - Math.max(0, game.hearts)),
      energy: Math.round(game.energy),
    };
    if (next.day !== last.day) $("hud-day").textContent = next.day;
    if (next.clock !== last.clock) $("hud-clock").textContent = next.clock;
    if (next.score !== last.score) $("hud-score").textContent = next.score;
    if (next.combo !== last.combo) $("hud-combo").textContent = next.combo;
    if (next.hearts !== last.hearts) $("hud-hearts").textContent = next.hearts;
    if (next.energy !== last.energy) {
      const bar = $("hud-energy");
      bar.style.width = `${next.energy}%`;
      bar.parentElement.classList.toggle("low", next.energy < 20);
    }
    last = next;
  }

  function onEvents() {
    for (const e of game.events) {
      play(e);
      if (e.type === "dayend") {
        localStorage.setItem(BEST_KEY, String(game.best));
        $("dayend-title").textContent = `17:00 — HARI ${game.day} SELESAI!`;
        stats($("dayend-stats"), [
          ["Tugas selesai", game.dayStats.done],
          ["Telat", game.dayStats.missed],
          ["Poin hari ini", game.dayStats.points.toLocaleString("id-ID")],
          ["Total skor", game.score.toLocaleString("id-ID")],
        ]);
        $("dayend-perfect").hidden = !e.perfect;
        show("scr-dayend");
      } else if (e.type === "gameover") {
        localStorage.setItem(BEST_KEY, String(game.best));
        stats($("over-stats"), [
          ["Bertahan", `${game.day} hari`],
          ["Tugas selesai", game.totals.done],
          ["Skor", game.score.toLocaleString("id-ID")],
          ["Terbaik", game.best.toLocaleString("id-ID")],
        ]);
        show("scr-over");
      }
    }
  }

  // ---- loop -----------------------------------------------------------------
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const inp = game.mode === "playing" ? input.read() : (input.read(), {});
    update(game, dt, inp);
    onEvents();
    renderer.draw(game);
    if (game.mode !== "title") hud();
    requestAnimationFrame(frame);
  }

  buildPicker();
  toMenu();
  requestAnimationFrame(frame);

  // Handy for debugging / automated checks.
  window.__wue = { get game() { return game; }, DAY_SECONDS };
}

boot().catch((err) => {
  document.body.innerHTML = `<pre class="boot-error">Gagal memuat game: ${err.message}</pre>`;
  console.error(err);
});
