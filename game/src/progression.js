// Daily quests, career ranks and the between-days upgrade shop (pure data + rules).

export const QUEST_POOL = [
  { id: "post3", text: "Selesaikan 3 Post", target: 3, reward: 30, stat: (s) => s.byKind.post },
  { id: "reply4", text: "Balas 4 Reply", target: 4, reward: 30, stat: (s) => s.byKind.reply },
  { id: "dm3", text: "Kirim 3 DM", target: 3, reward: 30, stat: (s) => s.byKind.dm },
  { id: "print1", text: "Antar 1 Print", target: 1, reward: 35, minDay: 2, stat: (s) => s.byKind.print },
  { id: "print3", text: "Antar 3 Print", target: 3, reward: 70, minDay: 4, stat: (s) => s.byKind.print },
  { id: "combo4", text: "Capai Combo x4", target: 4, reward: 40, stat: (s) => s.maxCombo },
  { id: "combo7", text: "Capai Combo x7", target: 7, reward: 70, minDay: 3, stat: (s) => s.maxCombo },
  { id: "viral1", text: "Tangani 1 tugas VIRAL", target: 1, reward: 40, stat: (s) => s.viral },
  { id: "viral3", text: "Tangani 3 tugas VIRAL", target: 3, reward: 80, minDay: 3, stat: (s) => s.viral },
  { id: "coffee2", text: "Minum 2 kopi", target: 2, reward: 25, stat: (s) => s.coffees },
  { id: "refill1", text: "Isi energi penuh di water cooler", target: 1, reward: 20, stat: (s) => s.refills },
  { id: "tasks8", text: "Selesaikan 8 tugas", target: 8, reward: 40, stat: (s) => s.done },
  { id: "tasks14", text: "Selesaikan 14 tugas", target: 14, reward: 80, minDay: 3, stat: (s) => s.done },
  { id: "fast3", text: "3 tugas selesai saat bar masih hijau", target: 3, reward: 35, stat: (s) => s.fast },
  { id: "points1k", text: "Kumpulkan 1.000 poin hari ini", target: 1000, reward: 45, stat: (s) => s.points },
  { id: "perfect", text: "Tanpa telat sampai 17:00", target: 1, reward: 60, endOnly: true, stat: (s) => (s.missed ? 0 : 1) },
];
const QUEST_BY_ID = Object.fromEntries(QUEST_POOL.map((q) => [q.id, q]));

export const RANKS = [
  { name: "Magang", score: 0 },
  { name: "Staf", score: 1500 },
  { name: "Staf Senior", score: 4000 },
  { name: "Supervisor", score: 8000 },
  { name: "Manajer", score: 14000 },
  { name: "Direktur", score: 22000 },
  { name: "CEO", score: 32000 },
];

export function rankFor(score) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i].score) r = i;
  return r;
}

export function nextRank(score) {
  const r = rankFor(score);
  return RANKS[r + 1] || null;
}

export function freshDayStats() {
  return {
    done: 0, missed: 0, points: 0, maxCombo: 0, viral: 0, coffees: 0, refills: 0, fast: 0, coins: 0,
    byKind: { post: 0, reply: 0, dm: 0, print: 0 },
  };
}

/** Pick 3 distinct quests for the day; always one "big" one from day 2 on. */
export function rollQuests(day, rng) {
  const pool = QUEST_POOL.filter((q) => (q.minDay || 1) <= day);
  const picked = [];
  const take = (list) => {
    const avail = list.filter((q) => !picked.includes(q));
    if (avail.length) picked.push(avail[Math.floor(rng() * avail.length)]);
  };
  if (day >= 2) take(pool.filter((q) => q.reward >= 45));
  while (picked.length < 3) take(pool);
  return picked.map((q) => ({ id: q.id, text: q.text, target: q.target, reward: q.reward, endOnly: !!q.endOnly, progress: 0, done: false }));
}

/** Update progress; returns quests completed by this call. */
export function checkQuests(quests, stats, final = false) {
  const newly = [];
  for (const q of quests) {
    if (q.done) continue;
    const def = QUEST_BY_ID[q.id];
    q.progress = Math.min(q.target, def.stat(stats));
    if (q.endOnly && !final) continue;
    if (q.progress >= q.target) {
      q.done = true;
      newly.push(q);
    }
  }
  return newly;
}

export const UPGRADES = {
  shoes: { name: "Sepatu Lari", desc: "Jalan +10%", costs: [40, 90, 160] },
  keyboard: { name: "Keyboard Mekanik", desc: "Kerja +12%", costs: [50, 110, 190] },
  thermos: { name: "Termos", desc: "Energi awet +15%", costs: [40, 90, 160] },
  barista: { name: "Mesin Kopi", desc: "Kopi lebih sering & lebih lama", costs: [60, 130] },
  dayoff: { name: "Cuti Sehari", desc: "+1 ♥ reputasi", costs: [80], repeatable: true },
};

export function upgradeCost(upgrades, id) {
  const u = UPGRADES[id];
  const lvl = upgrades[id] || 0;
  if (u.repeatable) return u.costs[0];
  return lvl < u.costs.length ? u.costs[lvl] : null;
}
