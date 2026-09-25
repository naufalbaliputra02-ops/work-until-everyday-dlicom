// Tiny square-wave SFX; the AudioContext is created on first user gesture.

let ac = null;
let muted = localStorage.getItem("wue-muted") === "1";

export function unlockAudio() {
  if (!ac) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) ac = new Ctx();
  }
  if (ac?.state === "suspended") ac.resume();
}

export function toggleMute() {
  muted = !muted;
  localStorage.setItem("wue-muted", muted ? "1" : "0");
  return muted;
}
export const isMuted = () => muted;

function tone(freq, start, dur, { type = "square", vol = 0.06, slide = 0 } = {}) {
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const SFX = {
  spawn: () => { tone(880, 0, 0.07); tone(1320, 0.07, 0.09); },
  done: (e) => {
    const base = 523 * Math.pow(2, Math.min(e.combo - 1, 7) / 12);
    [0, 4, 7, 12].forEach((s, i) => tone(base * Math.pow(2, s / 12), i * 0.05, 0.08));
  },
  miss: () => { tone(220, 0, 0.25, { type: "sawtooth", slide: -120, vol: 0.05 }); },
  print: () => { tone(330, 0, 0.05); tone(440, 0.06, 0.05); tone(660, 0.12, 0.08); },
  refill: () => { tone(1200, 0, 0.04, { type: "triangle", vol: 0.05, slide: 300 }); },
  dayend: () => { [0, 4, 7, 12, 7, 12].forEach((s, i) => tone(392 * Math.pow(2, s / 12), i * 0.11, 0.12)); },
  gameover: () => { [7, 4, 0, -5].forEach((s, i) => tone(330 * Math.pow(2, s / 12), i * 0.16, 0.2, { type: "triangle", vol: 0.08 })); },
  click: () => tone(660, 0, 0.04),
};

export function play(evt) {
  if (muted || !ac || ac.state !== "running") return;
  SFX[evt.type]?.(evt);
}
