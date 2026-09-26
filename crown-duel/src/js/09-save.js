// ---------- Profile, collection, chests and rewards (saved in localStorage) ----------
const SAVE_KEY = 'crown-duel-save-v1';
let SAVE = null;

const CHESTS = {
  silver: { name: 'Silver Chest', time: 3 * 60, cards: 7, gold: [16, 28], col: '#c9d4de', dark: '#6d7c8a', rare: 0.14, epic: 0.012, leg: 0.0015 },
  gold: { name: 'Golden Chest', time: 10 * 60, cards: 22, gold: [60, 110], col: '#ffcf40', dark: '#a86a00', rare: 0.16, epic: 0.02, leg: 0.002 },
  magic: { name: 'Magical Chest', time: 30 * 60, cards: 50, gold: [180, 320], col: '#c15cff', dark: '#5a1a8f', rare: 0.2, epic: 0.05, leg: 0.006, minEpic: 2 },
  giant: { name: 'Giant Chest', time: 30 * 60, cards: 120, gold: [380, 640], col: '#4fb4ff', dark: '#1a5a9a', rare: 0.15, epic: 0.012, leg: 0.001 },
  epic: { name: 'Epic Chest', time: 60 * 60, cards: 10, gold: [0, 0], col: '#b04aff', dark: '#4a0f7a', only: 'epic' },
  legendary: { name: 'Legendary Chest', time: 2 * 60 * 60, cards: 1, gold: [0, 0], col: '#3ff0d0', dark: '#0f7a6b', only: 'legendary' },
  free: { name: 'Free Chest', time: 0, cards: 5, gold: [20, 40], col: '#7fe08a', dark: '#2a7a3a', rare: 0.14, epic: 0.01, leg: 0.001, gems: [0, 3] },
  crown: { name: 'Crown Chest', time: 0, cards: 30, gold: [120, 220], col: '#ffe070', dark: '#b07a00', rare: 0.18, epic: 0.03, leg: 0.004, gems: [4, 10] },
};
const CHEST_CYCLE = 'SSGSSSGSMSSGSSSGSSHSSGSSESSSGSSMSSGSSLSS'.split('').map((c) => ({ S: 'silver', G: 'gold', M: 'magic', H: 'giant', E: 'epic', L: 'legendary' }[c]));
const FREE_CHEST_EVERY = 4 * 60 * 60 * 1000;
const CROWNS_FOR_CHEST = 10;

function defaultSave() {
  const cards = {};
  for (const k of STARTER_DECK) cards[k] = { lvl: 1, n: 0 };
  return {
    v: 1,
    name: 'Player' + randi(1000, 9999),
    trophies: 0, best: 0,
    gold: 150, gems: 60,
    king: 1, kingXp: 0,
    cards,
    decks: [STARTER_DECK.slice(), STARTER_DECK.slice(), STARTER_DECK.slice()],
    deck: 0,
    chests: [null, null, null, null],
    cycle: 0,
    crowns: 0,
    free: null,
    shop: null,
    stats: { wins: 0, losses: 0, draws: 0, three: 0, onlineWins: 0, onlineLosses: 0, bestStreak: 0, streak: 0, played: 0 },
    settings: { sfx: true, music: true, vibrate: true },
    tutorial: false,
    arenaSeen: 0,
    fresh: {},
  };
}

function loadGame() {
  const d0 = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      SAVE = Object.assign(d0, d);
      SAVE.stats = Object.assign(defaultSave().stats, d.stats || {});
      SAVE.settings = Object.assign(defaultSave().settings, d.settings || {});
      SAVE.fresh = d.fresh || {};
      for (const k of Object.keys(SAVE.cards)) if (!CARDS[k]) delete SAVE.cards[k];
      for (const k of STARTER_DECK) if (!SAVE.cards[k]) SAVE.cards[k] = { lvl: 1, n: 0 };
      if (!Array.isArray(SAVE.decks) || SAVE.decks.length !== 3) SAVE.decks = defaultSave().decks;
      SAVE.decks = SAVE.decks.map((dk) => (Array.isArray(dk) && dk.length === 8 && dk.every((k) => SAVE.cards[k]) && new Set(dk).size === 8 ? dk : STARTER_DECK.slice()));
      if (!(SAVE.deck >= 0 && SAVE.deck < 3)) SAVE.deck = 0;
      if (!Array.isArray(SAVE.chests) || SAVE.chests.length !== 4) SAVE.chests = [null, null, null, null];
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
  saveGame();
}

const curDeck = () => SAVE.decks[SAVE.deck];
const cardLvl = (k) => (SAVE.cards[k] ? SAVE.cards[k].lvl : 1);
const curArena = () => arenaIndex(SAVE.trophies);

function deckLevels() {
  const lv = {};
  for (const k of CARD_KEYS) lv[k] = cardLvl(k);
  return lv;
}

function avgDeckLevel(deck) {
  return deck.reduce((a, k) => a + cardLvl(k), 0) / deck.length;
}

function avgElixir(deck) {
  return deck.reduce((a, k) => a + CARDS[k].cost, 0) / deck.length;
}

// ---- upgrades ----
function upgradeCost(k) {
  const c = SAVE.cards[k];
  if (!c || c.lvl >= MAX_LEVEL) return null;
  const r = RARITY[CARDS[k].rarity];
  return { copies: r.copies[c.lvl - 1], gold: UPGRADE_GOLD[c.lvl - 1], xp: Math.round(UPGRADE_XP[c.lvl - 1] * r.xp) };
}

function canUpgrade(k) {
  const u = upgradeCost(k);
  return !!u && SAVE.cards[k].n >= u.copies && SAVE.gold >= u.gold;
}

function upgradeCard(k) {
  const u = upgradeCost(k);
  if (!u || !canUpgrade(k)) return null;
  const c = SAVE.cards[k];
  c.n -= u.copies;
  c.lvl++;
  SAVE.gold -= u.gold;
  const kingUps = addKingXp(u.xp);
  saveGame();
  return { lvl: c.lvl, xp: u.xp, kingUps };
}

function addKingXp(n) {
  SAVE.kingXp += n;
  let ups = 0;
  while (SAVE.king < MAX_LEVEL && SAVE.kingXp >= KING_XP[SAVE.king - 1]) {
    SAVE.kingXp -= KING_XP[SAVE.king - 1];
    SAVE.king++;
    SAVE.gems += 10;
    ups++;
  }
  if (SAVE.king >= MAX_LEVEL) SAVE.kingXp = 0;
  return ups;
}

function addCards(k, n) {
  const had = !!SAVE.cards[k];
  if (!had) {
    SAVE.cards[k] = { lvl: 1, n: n - 1 };
    SAVE.fresh[k] = true;
  } else SAVE.cards[k].n += n;
  return !had;
}

// ---- chests ----
function rollChest(type, arena, seed) {
  const def = CHESTS[type];
  const rng = new RNG(seed || (Date.now() & 0xffffffff));
  const pool = cardsForArena(arena);
  const byR = (r) => pool.filter((k) => CARDS[k].rarity === r);
  const out = [];
  const addStack = (rar, n) => {
    const list = byR(rar);
    if (!list.length || n <= 0) return;
    const k = rng.pick(list);
    const ex = out.find((o) => o.key === k);
    if (ex) ex.n += n; else out.push({ key: k, n });
  };
  const mult = 1 + arena * 0.35;
  if (def.only) {
    const n = Math.max(1, Math.round(def.cards * (def.only === 'legendary' ? 1 : mult * 0.6)));
    if (!byR(def.only).length) addStack('epic', Math.max(1, Math.round(n * 0.5)) || 1);
    else if (def.only === 'legendary') addStack('legendary', n);
    else { const a = Math.ceil(n / 2); addStack('epic', a); addStack('epic', n - a); }
  } else {
    let total = Math.round(def.cards * mult);
    let leg = 0, epic = def.minEpic || 0, rare = 0;
    for (let i = 0; i < total; i++) {
      const r = rng.next();
      if (r < def.leg) leg++; else if (r < def.leg + def.epic) epic++; else if (r < def.leg + def.epic + def.rare) rare++;
    }
    if (total >= 20) rare = Math.max(rare, Math.floor(total * 0.1));
    if (!byR('legendary').length) { epic += leg; leg = 0; }
    const common = Math.max(0, total - leg - epic - rare);
    const stacks = total >= 100 ? 4 : total >= 40 ? 3 : total >= 15 ? 3 : 2;
    let left = common;
    for (let i = 0; i < stacks; i++) {
      const n = i === stacks - 1 ? left : Math.round(left * rng.range(0.3, 0.55));
      addStack('common', n);
      left -= n;
    }
    if (rare) { const a = Math.ceil(rare * rng.range(0.5, 0.75)); addStack('rare', a); addStack('rare', rare - a); }
    if (epic) addStack('epic', epic);
    if (leg) addStack('legendary', leg);
  }
  const gold = Math.round(rng.range(def.gold[0], def.gold[1]) * (1 + arena * 0.5));
  const gems = def.gems ? rng.int(def.gems[0], def.gems[1]) : 0;
  out.sort((a, b) => RARITY_ORDER.indexOf(CARDS[a.key].rarity) - RARITY_ORDER.indexOf(CARDS[b.key].rarity));
  return { cards: out, gold, gems };
}

// Apply a chest's contents; returns the list with "new" markers for the reveal screen.
function grantChest(loot) {
  const res = [];
  for (const c of loot.cards) {
    const isNew = addCards(c.key, c.n);
    const rec = SAVE.cards[c.key];
    if (rec.lvl >= MAX_LEVEL && rec.n > 0) { SAVE.gold += rec.n * 5; rec.n = 0; }
    res.push({ key: c.key, n: c.n, isNew });
  }
  SAVE.gold += loot.gold;
  SAVE.gems += loot.gems;
  saveGame();
  return res;
}

function chestSlotFree() { return SAVE.chests.findIndex((c) => !c); }

function awardChest() {
  const i = chestSlotFree();
  if (i < 0) return null;
  const type = CHEST_CYCLE[SAVE.cycle % CHEST_CYCLE.length];
  SAVE.cycle++;
  SAVE.chests[i] = { type, arena: curArena(), unlockAt: 0, seed: randi(1, 1e9) };
  return SAVE.chests[i];
}

function chestState(ch) {
  if (!ch) return 'empty';
  if (!ch.unlockAt) return 'locked';
  return Date.now() >= ch.unlockAt ? 'ready' : 'unlocking';
}

function anyUnlocking() { return SAVE.chests.some((c) => chestState(c) === 'unlocking'); }

function gemsToOpen(ch) {
  const ms = ch.unlockAt ? Math.max(0, ch.unlockAt - Date.now()) : CHESTS[ch.type].time * 1000;
  return Math.max(1, Math.ceil(ms / 1000 / 60 / 6));
}

// Free chests build up every few hours (at most two waiting).
function freeState() {
  const now = Date.now();
  let f = SAVE.free;
  if (!f || typeof f.n !== 'number') f = SAVE.free = { n: 1, at: now + FREE_CHEST_EVERY };
  while (f.n < 2 && now >= f.at) { f.n++; f.at += FREE_CHEST_EVERY; }
  if (f.n >= 2) f.at = now + FREE_CHEST_EVERY;
  return f;
}

function takeFreeChest() {
  const f = freeState();
  if (f.n <= 0) return false;
  f.n--;
  saveGame();
  return true;
}

function nextFreeChestIn() {
  const f = freeState();
  return f.n > 0 ? 0 : Math.max(0, f.at - Date.now());
}

// ---- shop ----
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function refreshShop() {
  const day = todayKey();
  if (SAVE.shop && SAVE.shop.day === day) return SAVE.shop;
  const rng = new RNG(hashStr(day + SAVE.name));
  const pool = cardsForArena(curArena());
  const pick = (r) => { const l = pool.filter((k) => CARDS[k].rarity === r); return l.length ? rng.pick(l) : null; };
  const offers = [];
  const c1 = pick('common'), c2 = pick('common'), r1 = pick('rare'), e1 = pick('epic');
  if (c1) offers.push({ key: c1, n: 10, price: 150, cur: 'gold' });
  if (r1) offers.push({ key: r1, n: 3, price: 360, cur: 'gold' });
  if (e1) offers.push({ key: e1, n: 1, price: 1200, cur: 'gold' });
  if (c2 && c2 !== c1) offers.push({ key: c2, n: 20, price: 280, cur: 'gold' });
  SAVE.shop = { day, offers: offers.map((o) => Object.assign(o, { bought: false })) };
  saveGame();
  return SAVE.shop;
}

const SHOP_CHESTS = [
  { type: 'magic', gems: 90 },
  { type: 'giant', gems: 140 },
  { type: 'epic', gems: 180 },
  { type: 'legendary', gems: 350 },
];
const GOLD_PACKS = [{ gold: 250, gems: 20 }, { gold: 1500, gems: 100 }];

// ---- opponents & rewards ----
function aiOpponent(training) {
  const t = SAVE.trophies;
  const a = arenaIndex(t);
  const rng = new RNG(Date.now() & 0xffffff);
  const deck = buildAIDeck(training ? 0 : a, rng);
  const expected = 1 + t / 330;
  const mine = avgDeckLevel(curDeck());
  const offset = [-1, -0.5, -0.2, 0, 0.2, 0.4, 0.6, 0.8][a];
  const mean = training ? Math.max(1, mine - 1) : clamp(0.5 * expected + 0.5 * mine + offset + (t < 60 ? -1 : 0), 1, MAX_LEVEL);
  const levels = {};
  for (const k of CARD_KEYS) levels[k] = clamp(Math.round(mean + rng.range(-0.5, 0.5)), 1, MAX_LEVEL);
  const king = clamp(Math.round(training ? SAVE.king - 1 : 0.5 * SAVE.king + 0.5 * mean + (a >= 5 ? 0.5 : 0)), 1, MAX_LEVEL);
  const skill = training ? 0.05 : t < 60 ? 0.1 : clamp(0.18 + a * 0.115, 0, 1);
  const name = training ? 'Training Dummy' : rng.pick(AI_NAMES);
  const trophies = training ? 0 : Math.max(0, t + rng.int(-40, 40));
  return { deck, levels, king, skill, name, trophies };
}

// Called once a battle has ended; returns what was earned for the result screen.
function applyResult(r) {
  // r: { mode, win (bool), draw (bool), myCrowns, theirCrowns }
  const out = { trophies: 0, gold: 0, chest: null, crowns: 0, arenaUp: null, crownChest: false };
  const st = SAVE.stats;
  st.played++;
  if (r.mode === 'training') {
    if (r.win) out.gold = 5;
    SAVE.gold += out.gold;
    saveGame();
    return out;
  }
  const online = r.mode === 'host' || r.mode === 'guest';
  const a = curArena();
  if (r.win) {
    if (online) st.onlineWins++; else st.wins++;
    st.streak++;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    if (r.myCrowns >= 3) st.three++;
    out.gold = 15 + a * 6 + r.myCrowns * 3;
    if (!online) out.trophies = 28 + Math.min(4, Math.max(-4, Math.round((r.oppTrophies - SAVE.trophies) / 25)));
    out.chest = awardChest();
  } else if (r.draw) {
    st.draws++;
    st.streak = 0;
    out.gold = 5;
  } else {
    if (online) st.onlineLosses++; else st.losses++;
    st.streak = 0;
    if (!online) {
      const floor = ARENAS[arenaIndex(SAVE.trophies)].min;
      out.trophies = -Math.min(16, Math.max(0, SAVE.trophies - floor));
    }
  }
  const before = arenaIndex(SAVE.trophies);
  SAVE.trophies = Math.max(0, SAVE.trophies + out.trophies);
  SAVE.best = Math.max(SAVE.best, SAVE.trophies);
  const after = arenaIndex(SAVE.trophies);
  if (after > before && after > SAVE.arenaSeen) { out.arenaUp = after; SAVE.arenaSeen = after; }
  SAVE.gold += out.gold;
  out.crowns = r.myCrowns;
  const prev = SAVE.crowns;
  SAVE.crowns = Math.min(CROWNS_FOR_CHEST, SAVE.crowns + r.myCrowns);
  out.crownChest = prev < CROWNS_FOR_CHEST && SAVE.crowns >= CROWNS_FOR_CHEST;
  saveGame();
  return out;
}
