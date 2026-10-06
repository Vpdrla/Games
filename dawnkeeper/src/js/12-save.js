// ---------- Saved progress (localStorage), run results, achievements and the daily night ----------
const SAVE_KEY = 'dawnkeeper-save-v1';
let SAVE = null;

function defaultSave() {
  return {
    v: 1,
    gold: 0,
    power: {},
    chars: ['lumen', 'aria'],
    weapons: BASE_WEAPONS.slice(0, 8),
    stages: 1,
    ach: {},
    stats: {
      kills: 0, byType: {}, runs: 0, wins: 0, bestTime: 0, maxLevel: 0, minis: 0, bosses: 0, chests: 0, maxWeapons: 0,
      goldEarned: 0, dailies: 0, bestKills: 0, bestEndless: 0, noHealClear: 0, playTime: 0,
    },
    best: {},
    cleared: {},
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
      SAVE.stages = clamp(SAVE.stages | 0, 1, STAGES.length);
      if (!CHARACTERS[SAVE.sel.char] || !SAVE.chars.includes(SAVE.sel.char)) SAVE.sel.char = 'lumen';
      if (!(SAVE.sel.stage >= 0 && SAVE.sel.stage < SAVE.stages)) SAVE.sel.stage = 0;
      return;
    }
  } catch (e) { /* corrupted or unavailable storage: start fresh */ }
  SAVE = d0;
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
  if (r.gold) { SAVE.gold += r.gold; out.push(r.gold + ' gold'); }
  if (r.char && !SAVE.chars.includes(r.char)) { SAVE.chars.push(r.char); out.push('Hero: ' + CHARACTERS[r.char].name); }
  if (r.weapon && !SAVE.weapons.includes(r.weapon)) { SAVE.weapons.push(r.weapon); out.push('Weapon: ' + WEAPONS[r.weapon].name); }
  if (r.stage) { SAVE.stages = Math.max(SAVE.stages, Math.min(STAGES.length, r.stage + 1)); out.push('Stage: ' + STAGES[Math.min(STAGES.length - 1, r.stage)].name); }
  return out.join(', ');
}

function rewardText(a) {
  const r = a.reward, out = [];
  if (r.gold) out.push(r.gold + ' gold');
  if (r.char) out.push('Hero ' + CHARACTERS[r.char].name);
  if (r.weapon) out.push(WEAPONS[r.weapon].name);
  if (r.stage) out.push(STAGES[r.stage].name);
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

function powerRanks() {
  const p = {};
  for (const k of POWERUP_KEYS) p[k] = SAVE.power[k] || 0;
  return p;
}

// Fold a finished run into the save. Returns the gold earned (with bonuses).
function applyRunResult(run, quit) {
  const S = SAVE, st = S.stats, r = run.summary();
  let gold = run.gold;
  // a little gold for every minute survived, a lot for seeing the dawn
  gold += Math.floor(run.time / 60) * Math.round(10 * run.stage.gold);
  if (run.won) gold += Math.round(300 * (run.stageIdx + 1) * (run.mode === 'quick' ? 0.4 : 1));
  if (quit) gold = Math.round(gold * 0.5);
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
  if (!quit) st.bestTime = Math.max(st.bestTime, run.time);
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
    if (run.mode !== 'quick') {
      S.cleared[key] = 1;
      S.heroClears[run.charKey] = 1;
      if (!run.hearts) st.noHealClear = 1;
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
    }
  }
  const ach = checkAchievements(null);
  saveGame();
  return { gold, ach };
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
