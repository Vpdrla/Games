// ---------- Saved progress (localStorage), run results, achievements and the daily night ----------
const SAVE_KEY = 'dawnkeeper-save-v1';
let SAVE = null;

function defaultSave() {
  return {
    v: 2,
    gold: 0,
    power: {},
    limit: {}, // Limit Break ranks (opens once every power-up is maxed)
    chars: ['lumen', 'aria'],
    weapons: BASE_WEAPONS.slice(0, 8),
    stages: 1,
    ach: {},
    stats: {
      kills: 0, byType: {}, runs: 0, wins: 0, bestTime: 0, maxLevel: 0, minis: 0, bosses: 0, chests: 0, maxWeapons: 0,
      goldEarned: 0, dailies: 0, bestKills: 0, bestEndless: 0, noHealClear: 0, playTime: 0, bestNight: 0,
    },
    best: {},
    cleared: {},
    quickClears: {}, // Quick Night wins per stage; two count as a clear
    heroClears: {},
    evolved: {},
    seen: { w: {}, e: {} },
    sel: { char: 'lumen', stage: 0, mode: 'normal', endless: false },
    daily: { date: '', best: 0, rewarded: false },
    settings: { sfx: true, music: true, vibrate: true, dmgNums: true, quality: 'auto' },
    tutorial: false,
  };
}

function loadGame() {
  const d0 = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      SAVE = Object.assign(d0, d);
      const fresh = defaultSave();
      SAVE.stats = Object.assign(fresh.stats, d.stats || {});
      SAVE.settings = Object.assign(fresh.settings, d.settings || {});
      SAVE.sel = Object.assign(fresh.sel, d.sel || {});
      SAVE.seen = Object.assign(fresh.seen, d.seen || {});
      SAVE.daily = Object.assign(fresh.daily, d.daily || {});
      SAVE.chars = (SAVE.chars || []).filter((k) => CHARACTERS[k]);
      for (const k of ['lumen', 'aria']) if (!SAVE.chars.includes(k)) SAVE.chars.push(k);
      SAVE.weapons = (SAVE.weapons || []).filter((k) => BASE_WEAPONS.includes(k));
      for (const k of BASE_WEAPONS.slice(0, 8)) if (!SAVE.weapons.includes(k)) SAVE.weapons.push(k);
      for (const k of Object.keys(SAVE.power)) if (!POWERUPS[k]) delete SAVE.power[k];
      SAVE.limit = SAVE.limit || {};
      for (const k of Object.keys(SAVE.limit)) if (!LIMIT_BREAK_KEYS.includes(k)) delete SAVE.limit[k];
      SAVE.quickClears = SAVE.quickClears || {};
      SAVE.stages = clamp(SAVE.stages | 0, 1, STAGES.length);
      if (!CHARACTERS[SAVE.sel.char] || !SAVE.chars.includes(SAVE.sel.char)) SAVE.sel.char = 'lumen';
      if (!(SAVE.sel.stage >= 0 && SAVE.sel.stage < SAVE.stages)) SAVE.sel.stage = 0;
      // a failed migration must never fall through to the fresh save below
      if (!(SAVE.v >= 2)) try { migrateDK(); } catch (e) { SAVE.v = 2; }
      return;
    }
  } catch (e) { /* corrupted or unavailable storage: start fresh */ }
  SAVE = d0;
}

// v1 -> v2: hero unlocks moved to earlier achievements, Quick wins count toward clears and the
// survival goals use night time. Nothing is taken away; heroes already owned stay owned.
function migrateDK() {
  const S = SAVE, st = S.stats, notes = [];
  st.bestNight = Math.max(st.bestNight || 0, st.bestTime || 0);
  // a stage won but not cleared was won on Quick Night: that counts as the first of two Quick wins
  for (const s of STAGES) {
    const b = S.best[s.key];
    if (b && b.won && !S.cleared[s.key]) S.quickClears[s.key] = Math.max(S.quickClears[s.key] || 0, 1);
  }
  // achievements already earned whose reward is now a hero or weapon: grant it, without paying the gold again
  for (const a of ACHIEVEMENTS) {
    if (!S.ach[a.id]) continue;
    const r = a.reward, out = [];
    if (r.char && !S.chars.includes(r.char)) { S.chars.push(r.char); out.push('Hero: ' + CHARACTERS[r.char].name); }
    if (r.weapon && !S.weapons.includes(r.weapon)) { S.weapons.push(r.weapon); out.push('Weapon: ' + WEAPONS[r.weapon].name); }
    if (out.length) notes.push({ id: a.id, text: out.join(', ') });
  }
  S.limit = {};
  S.quickClears = S.quickClears || {};
  S.v = 2;
  // the new early achievements are claimed and paid normally
  for (const g of checkAchievements(null)) notes.push({ id: g.a.id, text: g.text });
  if (notes.length) S.pendingAch = notes;
  saveGame();
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* storage unavailable */ }
}

function resetGame() {
  const s = SAVE.settings;
  SAVE = defaultSave();
  SAVE.settings = s;
  SAVE.tutorial = true;
  saveGame();
}

function achReward(a) {
  const r = a.reward, out = [];
  if (r.char && !SAVE.chars.includes(r.char)) { SAVE.chars.push(r.char); out.push('Hero: ' + CHARACTERS[r.char].name); }
  if (r.weapon && !SAVE.weapons.includes(r.weapon)) { SAVE.weapons.push(r.weapon); out.push('Weapon: ' + WEAPONS[r.weapon].name); }
  if (r.stage) { SAVE.stages = Math.max(SAVE.stages, Math.min(STAGES.length, r.stage + 1)); out.push('Stage: ' + STAGES[Math.min(STAGES.length - 1, r.stage)].name); }
  if (r.gold) { SAVE.gold += r.gold; out.push(r.gold + ' gold'); }
  // older saves can already own a hero that moved to this achievement
  return out.join(', ') || rewardText(a) + ' (already yours)';
}

function rewardText(a) {
  const r = a.reward, out = [];
  if (r.char) out.push('Hero ' + CHARACTERS[r.char].name);
  if (r.weapon) out.push(WEAPONS[r.weapon].name);
  if (r.stage) out.push(STAGES[r.stage].name);
  if (r.gold) out.push(r.gold + ' gold');
  return out.join(' + ');
}

// Claims every achievement that is now complete. r = live run summary or null.
function checkAchievements(r) {
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (SAVE.ach[a.id]) continue;
    const [cur, goal] = a.prog(SAVE, r);
    if (cur >= goal) {
      SAVE.ach[a.id] = 1;
      got.push({ a, text: achReward(a) });
    }
  }
  if (got.length) saveGame();
  return got;
}

// Power-up ranks for a run. Each Limit Break rank adds a fifth of a normal rank; the run's
// stat formulas are linear, so fractional ranks just work.
function powerRanks() {
  const p = {};
  for (const k of POWERUP_KEYS) p[k] = (SAVE.power[k] || 0) + 0.2 * (SAVE.limit[k] || 0);
  return p;
}

const allPowerMaxed = () => POWERUP_KEYS.every((k) => (SAVE.power[k] || 0) >= POWERUPS[k].max);

// How many power-ups (or Limit Break ranks, once open) the current gold can buy one rank of.
function affordablePowers() {
  let n = 0;
  for (const k of POWERUP_KEYS) {
    const rank = SAVE.power[k] || 0;
    if (rank < POWERUPS[k].max && SAVE.gold >= powerCost(k, rank)) n++;
  }
  if (allPowerMaxed()) {
    for (const k of LIMIT_BREAK_KEYS) {
      const rank = SAVE.limit[k] || 0;
      if (rank < LIMIT_RANKS && SAVE.gold >= limitCost(k, rank)) n++;
    }
  }
  return n;
}

// Fold a finished run into the save. Returns the gold earned (with bonuses) and its parts.
function applyRunResult(run, quit) {
  const S = SAVE, st = S.stats, r = run.summary(), quick = run.mode === 'quick';
  // gold for every second survived (prorated), a lot for seeing the dawn, and never less than 40
  const pickups = run.gold;
  const survival = Math.round(run.time / 60 * 20 * run.stage.gold);
  const dawn = run.won ? Math.round(300 * (run.stageIdx + 1) * (quick ? 0.4 : 1)) : 0;
  const parts = { pickups, survival, dawn, daily: 0, minimum: 0, halved: 0 };
  let gold = pickups + survival + dawn;
  if (quit) {
    parts.halved = gold - Math.round(gold * 0.5);
    gold -= parts.halved;
  } else if (gold < 40) {
    parts.minimum = 40 - gold;
    gold = 40;
  }
  S.gold += gold;
  st.goldEarned += gold;
  st.runs++;
  st.kills += run.kills;
  for (const [k, v] of Object.entries(run.byType)) st.byType[k] = (st.byType[k] || 0) + v;
  st.bestKills = Math.max(st.bestKills, run.kills);
  st.maxLevel = Math.max(st.maxLevel, run.level);
  st.minis += run.minis;
  st.bosses += run.bosses;
  st.chests += run.chestsOpened;
  st.maxWeapons = Math.max(st.maxWeapons, run.weapons.length);
  st.playTime += run.time;
  if (!quit) {
    st.bestTime = Math.max(st.bestTime, run.time);
    st.bestNight = Math.max(st.bestNight || 0, run.T);
  }
  if (run.endless) st.bestEndless = Math.max(st.bestEndless, run.time);
  for (const k of Object.keys(run.evolved)) S.evolved[k] = 1;
  for (const w of run.weapons) S.seen.w[w.key] = 1;
  for (const k of Object.keys(run.byType)) S.seen.e[k] = 1;
  const key = run.stage.key;
  const b = S.best[key] || (S.best[key] = { time: 0, won: false, char: '' });
  if (run.mode !== 'quick' && run.time > b.time) { b.time = run.time; b.char = run.charKey; }
  if (run.won) {
    st.wins++;
    b.won = true;
    if (!quick) {
      S.cleared[key] = 1;
      S.heroClears[run.charKey] = 1;
      if (!run.hearts) st.noHealClear = 1;
    } else {
      // two Quick wins count as one clear, so Quick Night can't replace the Full Night 1:1
      S.quickClears[key] = (S.quickClears[key] || 0) + 1;
      if (S.quickClears[key] >= 2) S.cleared[key] = 1;
      S.heroClears[run.charKey] = 1;
    }
  }
  if (run.mode === 'daily') {
    st.dailies++;
    const today = dailyKey();
    if (S.daily.date !== today) S.daily = { date: today, best: 0, rewarded: false };
    S.daily.best = Math.max(S.daily.best, run.time);
    if (!S.daily.rewarded) {
      S.daily.rewarded = true;
      S.gold += 150;
      gold += 150;
      parts.daily = 150;
    }
  }
  const ach = checkAchievements(null);
  saveGame();
  return { gold, ach, parts };
}

// ----- the daily night: same seed for everyone on a given date -----
function dailyKey(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dailyInfo() {
  const key = dailyKey();
  const rng = new RNG(hashStr('dawnkeeper:' + key));
  const stage = rng.int(0, STAGES.length - 1);
  const char = rng.pick(CHAR_KEYS);
  const mods = rng.shuffle(DAILY_MOD_KEYS.slice()).slice(0, 2);
  return { key, stage, char, mods, seed: hashStr('night:' + key) };
}
