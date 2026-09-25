import {
  DAY_SECONDS, MAX_HEARTS, PERKS, RANKS, TUTORIAL_BONUS, TUTORIAL_STEPS, UPGRADES,
  buyUpgrade, clockText, createGame, nextDay, skipTutorial, startDay, update,
} from "./game.js";
import { nextRank, upgradeCost } from "./progression.js";
import { createWorld } from "./world.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { isMuted, play, toggleMute, unlockAudio } from "./audio.js";
import { bubbleIcon, coinIcon, cupIcon, dropIcon, iconCanvas, paperIcon, viralIcon } from "./pixels.js";

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } },
};
const fmt = (n) => n.toLocaleString("id-ID");
// ?touch=1 forces touch UI (for testing on desktop / devices that misreport)
const coarse = new URLSearchParams(location.search).has("touch") ||
  window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

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
  const input = createInput(canvas, renderer.toWorld, $("joy"));
  const brand = level.brand;

  let choice = store.get("wue-mascot", "blue");
  if (!PERKS[choice]) choice = "blue";
  let game = createGame(level, world, { mascot: choice, best: +store.get("wue-best", 0) || 0 });

  // ---- layout + follow camera ------------------------------------------------
  const cw = canvas.width, ch = canvas.height;
  const zoomPref = store.get("wue-zoom");
  let zoom = zoomPref === null ? null : zoomPref === "1"; // null = auto
  const cam = { scale: 1, viewW: cw, viewH: ch, x: 0, y: 0, follow: false };

  function layout() {
    const hud = $("hud");
    const hudH = hud.hidden ? 0 : hud.offsetHeight + 6;
    const pad = coarse ? 4 : 16;
    const availW = window.innerWidth - pad, availH = window.innerHeight - hudH - pad;
    let fit = Math.min(availW / cw, availH / ch);
    if (fit >= 1) fit = Math.floor(fit);
    const auto = fit < 1.4;
    const wantZoom = zoom ?? auto;
    let scale = fit;
    if (wantZoom) scale = Math.max(fit, Math.min(3, availW / 200, availH / 180));
    cam.scale = scale;
    cam.viewW = Math.floor(Math.min(availW, cw * scale));
    cam.viewH = Math.floor(Math.min(availH, ch * scale));
    cam.follow = cw * scale > cam.viewW + 1 || ch * scale > cam.viewH + 1;
    canvas.style.width = `${Math.floor(cw * scale)}px`;
    canvas.style.height = `${Math.floor(ch * scale)}px`;
    const vp = $("viewport");
    vp.style.width = `${cam.viewW}px`;
    vp.style.height = `${cam.viewH}px`;
    $("stage").style.width = `${cam.viewW}px`;
    hud.style.width = `${Math.max(cam.viewW, Math.min(window.innerWidth - 8, 560))}px`;
    $("btn-zoom").classList.toggle("on", cam.follow);
    moveCamera(true);
  }

  function moveCamera(snap = false) {
    if (!cam.follow) {
      cam.x = cam.y = 0;
    } else {
      const p = game.player, o = level.origin;
      const sx = (o.x + p.x - p.y) * cam.scale, sy = (o.y + (p.x + p.y) / 2 - 10) * cam.scale;
      const maxX = cw * cam.scale - cam.viewW, maxY = ch * cam.scale - cam.viewH;
      const tx = Math.max(0, Math.min(maxX, sx - cam.viewW / 2));
      const ty = Math.max(0, Math.min(maxY, sy - cam.viewH / 2));
      const k = snap ? 1 : 0.12;
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
    }
    canvas.style.transform = `translate(${-Math.round(cam.x)}px, ${-Math.round(cam.y)}px)`;
  }
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", () => setTimeout(layout, 200));

  // ---- screens ---------------------------------------------------------------
  const screens = ["scr-title", "scr-howto", "scr-pause", "scr-dayend", "scr-over", "scr-rotate"];
  let howtoReturn = null;
  function show(id) {
    for (const s of screens) $(s).hidden = s !== id;
    $("hud").hidden = id === "scr-title" || (id === "scr-howto" && howtoReturn === "scr-title");
    syncPlayUi();
    layout();
  }
  function syncPlayUi() {
    const playing = game.mode === "playing";
    $("joy").hidden = !(coarse && playing);
    $("tutor").hidden = !(playing && game.tutorial);
    $("quest-panel").hidden = !(playing && !game.tutorial && questsOpen);
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

  function buildHowto() {
    const { w, h } = level.mascots;
    const mascotIcon = () => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(mascots, 0, 0, w, h, 0, 0, w, h);
      return iconCanvas(c, 2);
    };
    const cards = [
      [mascotIcon(), "Tujuan", "Jaga sosmed kantor tetap hidup dari <b>09:00 sampai 17:00</b>. Setiap hari makin sibuk. Bertahan selama mungkin dan naik jabatan dari Magang sampai <b>CEO</b>!"],
      [null, "Kontrol", coarse
        ? "<b>Joystick</b> kiri bawah untuk jalan, atau <b>tap lantai</b> untuk jalan otomatis ke sana. Tombol ⌕ = zoom kamera, ⛶ = layar penuh."
        : "<b>WASD / panah</b> untuk jalan, atau <b>klik lantai</b> untuk jalan otomatis. <b>P/Esc</b> jeda, <b>M</b> suara. Di HP ada joystick."],
      [bubbleIcon(brand.orange), "Post · Reply · DM", "Gelembung muncul di atas monitor. <b>Masuk ke cubicle yang lantainya menyala</b> dan diam sampai bar putih penuh. Bar warna = sisa waktu."],
      [paperIcon(), "Print", "Ambil kertas di <b>mesin fotokopi</b> (kanan atas), bawa ke cubicle yang minta print. Poinnya paling besar."],
      [viralIcon(), "VIRAL!", "Gelembung emas = konten viral. Waktunya singkat, tapi <b>poin ×2,5</b> dan koin ekstra."],
      [dropIcon(), "Energi", "Jalan & kerja bikin capek. Di bawah 20% kamu jadi lambat. <b>Isi di water cooler</b> di pojok kiri."],
      [cupIcon(), "Kopi", "Kopi muncul acak di lantai. Ambil untuk <b>ngebut & kerja 40% lebih cepat</b> beberapa detik, plus energi."],
      [null, "Reputasi ♥", "Tugas telat = −1 ♥ dan combo hilang. <b>Hari tanpa telat = +1 ♥</b>. Kalau ♥ habis: Burnout."],
      [coinIcon(), "Quest & Toko", "Tiap hari ada <b>3 quest</b>. Selesaikan untuk dapat <b>koin</b>, lalu belanja upgrade di <b>Toko Kantor</b> setelah jam pulang."],
    ];
    const grid = $("howto-grid");
    for (const [icon, title, text] of cards) {
      const card = document.createElement("div");
      card.className = "howto-card";
      const ic = document.createElement("div");
      ic.className = "hc-icon";
      if (icon) ic.append(icon instanceof HTMLCanvasElement && icon.className === "px-icon" ? icon : iconCanvas(icon, 3));
      else ic.textContent = title.includes("♥") ? "♥" : "✥";
      card.append(ic);
      const body = document.createElement("div");
      body.innerHTML = `<b>${title}</b><p>${text}</p>`;
      card.append(body);
      grid.append(card);
    }
  }

  function openHowto(from) {
    howtoReturn = from;
    show("scr-howto");
  }

  function newGame(tutorial) {
    unlockAudio();
    store.set("wue-mascot", choice);
    game = createGame(level, world, { mascot: choice, best: game.best, tutorial });
    startDay(game);
    input.clear();
    lastQuestSig = "";
    tutorShown = undefined;
    show(null);
    if (coarse && window.innerHeight > window.innerWidth && !sessionStorage.getItem("wue-rotate")) {
      game.mode = "paused";
      show("scr-rotate");
    }
  }

  function toMenu() {
    game = createGame(level, world, { mascot: choice, best: game.best });
    $("best-title").textContent = game.best ? `Skor terbaik: ${fmt(game.best)}` : "";
    show("scr-title");
  }

  function pause(on) {
    if (on && game.mode === "playing") {
      game.mode = "paused";
      renderQuestList($("pause-quests"), game.quests);
      $("pause-quests").hidden = !!game.tutorial;
      show("scr-pause");
    } else if (!on && game.mode === "paused") {
      game.mode = "playing"; input.clear(); show(null);
    }
  }

  function stats(el, rows) {
    el.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  }

  // ---- quests UI -------------------------------------------------------------
  let questsOpen = !coarse || window.innerWidth >= 900;
  let lastQuestSig = "";
  function renderQuestList(el, quests) {
    el.innerHTML = quests.map((q) => {
      const pct = Math.round((q.progress / q.target) * 100);
      const prog = q.endOnly && !q.done ? (q.progress ? "aman" : "gagal") : `${Math.min(q.progress, q.target)}/${q.target}`;
      return `<li class="${q.done ? "done" : ""}">
        <span class="q-check">${q.done ? "✓" : "·"}</span>
        <span class="q-text">${q.text}<i style="--p:${pct}%"></i></span>
        <span class="q-prog">${q.done ? `+${q.reward}` : prog}</span></li>`;
    }).join("");
  }
  function syncQuests() {
    const sig = JSON.stringify(game.quests.map((q) => [q.progress, q.done])) + game.rank;
    if (sig === lastQuestSig) return;
    lastQuestSig = sig;
    renderQuestList($("quest-list"), game.quests);
    $("hud-qcount").textContent = `${game.quests.filter((q) => q.done).length}/${game.quests.length}`;
    $("qp-rank").textContent = RANKS[game.rank].name;
  }

  // ---- tutorial banner -------------------------------------------------------
  let tutorShown = null;
  function syncTutor() {
    const step = game.tutorial ? game.tutorial.step : null;
    if (step === tutorShown) return;
    tutorShown = step;
    syncPlayUi();
    if (step === null) return;
    const s = TUTORIAL_STEPS[game.tutorial.step];
    $("tutor-step").textContent = `${game.tutorial.step + 1}/${TUTORIAL_STEPS.length}`;
    $("tutor-title").textContent = s.title;
    $("tutor-text").textContent = s.id === "move" && !coarse
      ? "Tekan WASD / panah, atau klik lantai untuk jalan ke sana."
      : s.text;
  }

  // ---- toasts ------------------------------------------------------------------
  function toast(html, cls = "") {
    const el = document.createElement("div");
    el.className = `toast ${cls}`;
    el.innerHTML = html;
    $("toasts").append(el);
    setTimeout(() => el.classList.add("out"), 2300);
    setTimeout(() => el.remove(), 2700);
    while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
  }

  // ---- day end + shop ----------------------------------------------------------
  function renderShop() {
    $("shop-coins").textContent = fmt(game.coins);
    const shop = $("shop");
    shop.innerHTML = "";
    for (const [id, u] of Object.entries(UPGRADES)) {
      const cost = upgradeCost(game.upgrades, id);
      const lvl = game.upgrades[id] || 0;
      const maxed = cost === null || (id === "dayoff" && game.hearts >= MAX_HEARTS);
      const card = document.createElement("button");
      card.className = "shop-item";
      card.disabled = maxed || game.coins < cost;
      const pips = u.repeatable ? "" : `<span class="pips">${"■".repeat(lvl)}${"□".repeat(u.costs.length - lvl)}</span>`;
      card.innerHTML = `<b>${u.name}</b><small>${u.desc}</small>${pips}
        <span class="price">${maxed ? (u.repeatable ? "♥ penuh" : "MAKS") : `${cost} koin`}</span>`;
      card.addEventListener("click", () => {
        if (buyUpgrade(game, id)) { play({ type: "buy" }); renderShop(); hud(); }
      });
      shop.append(card);
    }
  }

  function showDayEnd(perfect) {
    store.set("wue-best", game.best);
    $("dayend-title").textContent = `17:00 — HARI ${game.day} SELESAI!`;
    stats($("dayend-stats"), [
      ["Tugas selesai", game.dayStats.done],
      ["Telat", game.dayStats.missed],
      ["Poin hari ini", fmt(game.dayStats.points)],
      ["Koin hari ini", `+${game.dayStats.coins}`],
      ["Total skor", fmt(game.score)],
    ]);
    $("dayend-perfect").hidden = !perfect;
    renderQuestList($("dayend-quests"), game.quests);
    const nr = nextRank(game.score);
    const cur = RANKS[game.rank];
    const pct = nr ? Math.round(((game.score - cur.score) / (nr.score - cur.score)) * 100) : 100;
    $("dayend-career").innerHTML = `<span>Jabatan: <b>${cur.name}</b></span>
      <span class="career-bar"><i style="width:${pct}%"></i></span>
      <small>${nr ? `${fmt(nr.score - game.score)} poin lagi ke ${nr.name}` : "Puncak karier!"}</small>`;
    renderShop();
    show("scr-dayend");
  }

  // ---- wiring ----------------------------------------------------------------
  $("btn-start").addEventListener("click", () => newGame(store.get("wue-tut-done") !== "1"));
  $("btn-tutorial").addEventListener("click", () => newGame(true));
  $("btn-howto").addEventListener("click", () => openHowto("scr-title"));
  $("btn-pause-howto").addEventListener("click", () => openHowto("scr-pause"));
  $("btn-howto-close").addEventListener("click", () => show(howtoReturn || "scr-title"));
  $("btn-retry").addEventListener("click", () => newGame(false));
  $("btn-menu").addEventListener("click", toMenu);
  $("btn-quit").addEventListener("click", toMenu);
  $("btn-resume").addEventListener("click", () => pause(false));
  $("btn-pause").addEventListener("click", () => pause(true));
  $("btn-next").addEventListener("click", () => { nextDay(game); input.clear(); lastQuestSig = ""; show(null); });
  $("btn-skip-tut").addEventListener("click", () => { skipTutorial(game); onEvents(); });
  $("btn-rotate-ok").addEventListener("click", () => {
    sessionStorage.setItem("wue-rotate", "1");
    game.mode = "playing";
    show(null);
  });
  $("btn-quests").addEventListener("click", () => { questsOpen = !questsOpen; syncPlayUi(); });
  $("btn-zoom").addEventListener("click", () => {
    zoom = !cam.follow;
    store.set("wue-zoom", zoom ? "1" : "0");
    layout();
  });
  const fsBtn = $("btn-full");
  const root = document.documentElement;
  if (!(root.requestFullscreen || root.webkitRequestFullscreen)) fsBtn.hidden = true;
  fsBtn.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        await (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
        await screen.orientation?.lock?.("landscape").catch(() => {});
      }
    } catch { /* unsupported (e.g. iOS Safari) */ }
    setTimeout(layout, 250);
  });
  const muteBtn = $("btn-mute");
  const syncMute = () => { muteBtn.classList.toggle("off", isMuted()); };
  muteBtn.addEventListener("click", () => { unlockAudio(); toggleMute(); syncMute(); });
  syncMute();
  if (coarse && !window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches) {
    $("hint-install").hidden = false;
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyP" || e.code === "Escape") pause(game.mode === "playing");
    else if (e.code === "KeyM") { unlockAudio(); toggleMute(); syncMute(); }
    else if (e.code === "KeyQ" && game.mode === "playing") { questsOpen = !questsOpen; syncPlayUi(); }
    else if ((e.code === "Enter" || e.code === "Space") && !e.repeat) {
      if (!$("scr-title").hidden) $("btn-start").click();
      else if (!$("scr-howto").hidden) $("btn-howto-close").click();
      else if (!$("scr-dayend").hidden) $("btn-next").click();
      else if (!$("scr-over").hidden) newGame(false);
      else if (!$("scr-pause").hidden) pause(false);
      else if (!$("scr-rotate").hidden) $("btn-rotate-ok").click();
      else return;
      e.preventDefault();
    }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(true); });
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  // stop iOS double-tap zoom / pull-to-refresh while playing
  document.addEventListener("touchmove", (e) => { if (e.target.closest("#stage")) e.preventDefault(); }, { passive: false });
  document.addEventListener("dblclick", (e) => e.preventDefault());

  // ---- HUD ---------------------------------------------------------------------
  let last = {};
  function hud() {
    const next = {
      day: `HARI ${game.day}`,
      clock: game.tutorial ? "LATIHAN" : clockText(game),
      score: fmt(game.score),
      combo: game.combo > 1 ? `x${game.combo}` : "",
      coins: fmt(game.coins),
      hearts: "♥".repeat(Math.max(0, game.hearts)) + "♡".repeat(MAX_HEARTS - Math.max(0, game.hearts)),
      energy: Math.round(game.energy),
    };
    for (const k of ["day", "clock", "score", "combo", "coins", "hearts"]) {
      if (next[k] !== last[k]) $(`hud-${k}`).textContent = next[k];
    }
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
      switch (e.type) {
        case "dayend": showDayEnd(e.perfect); break;
        case "gameover":
          store.set("wue-best", game.best);
          stats($("over-stats"), [
            ["Bertahan", `${game.day} hari`],
            ["Jabatan", RANKS[game.rank].name],
            ["Tugas selesai", game.totals.done],
            ["Quest selesai", game.totals.quests],
            ["Skor", fmt(game.score)],
            ["Terbaik", fmt(game.best)],
          ]);
          show("scr-over");
          break;
        case "quest": toast(`<b>✓ QUEST</b> ${e.text} <span class="coins">+${e.reward}</span>`, "good"); break;
        case "rank": toast(`<b>NAIK JABATAN!</b> Sekarang kamu <b>${e.name}</b>`, "rank"); break;
        case "coffee": toast("<b>KOPI!</b> Ngebut sebentar ☕", "coffee"); break;
        case "spawn": if (e.viral) toast("<b>VIRAL!</b> Konten emas muncul — poin ×2,5", "viral"); break;
        case "tutorial": break; // banner follows game.tutorial.step each frame
        case "tutorialdone":
          store.set("wue-tut-done", "1");
          toast(e.completed
            ? `<b>Tutorial selesai!</b> Bonus <span class="coins">+${TUTORIAL_BONUS}</span>. Sekarang jam kerja dimulai — kejar 3 quest harian!`
            : "<b>Jam kerja dimulai!</b> Kejar 3 quest harian untuk dapat koin.", "good");
          lastQuestSig = "";
          syncPlayUi();
          break;
        default: break;
      }
    }
  }

  // ---- loop --------------------------------------------------------------------
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const inp = game.mode === "playing" ? input.read() : (input.read(), {});
    update(game, dt, inp);
    onEvents();
    renderer.draw(game);
    if (game.mode !== "title") { hud(); syncQuests(); syncTutor(); }
    moveCamera();
    requestAnimationFrame(frame);
  }

  buildPicker();
  buildHowto();
  toMenu();
  requestAnimationFrame(frame);

  // Handy for debugging / automated checks.
  window.__wue = { get game() { return game; }, DAY_SECONDS, cam };
}

boot().catch((err) => {
  document.body.innerHTML = `<pre class="boot-error">Gagal memuat game: ${err.message}</pre>`;
  console.error(err);
});
