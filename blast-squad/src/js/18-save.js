// ---------- Save ----------
// Everything the player owns lives in one localStorage entry. loadGame() merges the stored data over
// fresh defaults and sanitises it, so older or damaged saves still load.

const SAVE_KEY = 'blastsquad.v1';
const SAVE_VERSION = 1;
let SAVE = null;

// Per-brawler progress. gad/star: owned flags per gadget / star power; gadget/star: equipped index
// (-1 = none equipped).
const newBrawlerState = () => ({ tro: 0, best: 0, lvl: 1, gad: [], st: [], gadget: -1, star: -1, games: 0, wins: 0 });

function defaultSave() {
  return {
    v: SAVE_VERSION,
    name: 'Player' + (1000 + Math.floor(Math.random() * 9000)),
    icon: 'nova',
    coins: 150,
    gems: 30,
    credits: 0,
    pp: 0, // power points (one pool for all brawlers, as in the original today)
    brawlers: { nova: newBrawlerState() },
    sel: 'nova', // selected brawler
    ev: 0, // selected event slot
    road: 0, // Trophy Road nodes claimed (ROAD index)
    hiTotal: 0, // highest total trophies ever (the road never takes rewards back)
    pass: { xp: 0, claimed: 0 }, // free pass: tiers claimed in order
    drops: [], // pending drops (rarity floors, '' = random)
    daily: { day: '', wins: 0, quests: [], gift: false, bought: [] },
    stats: { played: 0, wins: 0, losses: 0, draws: 0, sdWins: 0, kills: 0, deaths: 0, mvps: 0, streak: 0, bestStreak: 0 },
    settings: { sound: true, music: true, vibrate: true, quality: 'auto', leftHanded: false, autoAimHint: true, btnSize: 1 },
    seen: {}, // one-time tips and "new" badges
    pending: null, // { cfg, local, result? } while a trophy match runs (closing the app mid-match is a loss)
  };
}

function loadGame() {
  const d0 = defaultSave();
  SAVE = d0;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      SAVE = Object.assign(d0, d);
      SAVE.v = SAVE_VERSION;
      SAVE.pass = Object.assign(defaultSave().pass, d.pass || {});
      SAVE.daily = Object.assign(defaultSave().daily, d.daily || {});
      SAVE.stats = Object.assign(defaultSave().stats, d.stats || {});
      SAVE.settings = Object.assign(defaultSave().settings, d.settings || {});
      SAVE.seen = d.seen && typeof d.seen === 'object' ? d.seen : {};
      if (!Array.isArray(SAVE.drops)) SAVE.drops = [];
      const bs = {};
      for (const k of Object.keys(d.brawlers || {})) {
        if (typeof BRAWLERS !== 'undefined' && !BRAWLERS[k]) continue;
        bs[k] = Object.assign(newBrawlerState(), d.brawlers[k]);
        const b = bs[k];
        b.lvl = clamp(b.lvl | 0, 1, MAX_POWER);
        b.tro = Math.max(0, b.tro | 0);
        b.best = Math.max(b.best | 0, b.tro);
        if (!Array.isArray(b.gad)) b.gad = [];
        if (!Array.isArray(b.st)) b.st = [];
      }
      if (!bs.nova) bs.nova = newBrawlerState();
      SAVE.brawlers = bs;
      if (!bs[SAVE.sel]) SAVE.sel = 'nova';
      for (const k of ['coins', 'gems', 'credits', 'pp', 'road', 'hiTotal']) SAVE[k] = Math.max(0, SAVE[k] | 0);
    }
  } catch (e) { /* corrupted or unavailable storage: start fresh */ }
  return SAVE;
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* storage full or blocked */ }
}
