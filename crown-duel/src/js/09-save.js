// ---------- Profile, collection, chests and rewards (saved in localStorage) ----------
const SAVE_KEY = 'crown-duel-save-v1'; // v2 saves keep this key; loadGame upgrades v1 data in place
let SAVE = null;

const CHESTS = {
  silver: { name: 'Silver Chest', time: 3 * 60, cards: 7, gold: [16, 28], col: '#c9d4de', dark: '#6d7c8a', rare: 0.14, epic: 0.012, leg: 0.0015 },
  gold: { name: 'Golden Chest', time: 8 * 60, cards: 22, gold: [60, 110], col: '#ffcf40', dark: '#a86a00', rare: 0.16, epic: 0.02, leg: 0.002 },
  magic: { name: 'Magical Chest', time: 20 * 60, cards: 50, gold: [180, 320], col: '#c15cff', dark: '#5a1a8f', rare: 0.2, epic: 0.05, leg: 0.006, minEpic: 2 },
  giant: { name: 'Giant Chest', time: 20 * 60, cards: 120, gold: [380, 640], col: '#4fb4ff', dark: '#1a5a9a', rare: 0.15, epic: 0.012, leg: 0.001 },
  epic: { name: 'Epic Chest', time: 30 * 60, cards: 10, gold: [0, 0], col: '#b04aff', dark: '#4a0f7a', only: 'epic' },
  legendary: { name: 'Legendary Chest', time: 60 * 60, cards: 1, gold: [0, 0], col: '#3ff0d0', dark: '#0f7a6b', only: 'legendary' },
  free: { name: 'Free Chest', time: 0, cards: 5, gold: [20, 40], col: '#7fe08a', dark: '#2a7a3a', rare: 0.14, epic: 0.01, leg: 0.001, gems: [0, 3] },
  crown: { name: 'Crown Chest', time: 0, cards: 30, gold: [120, 220], col: '#ffe070', dark: '#b07a00', rare: 0.18, epic: 0.03, leg: 0.004, gems: [4, 10] },
};
const CHEST_CYCLE = 'SSGSSSGSMSSGSSSGSSHSSGSSESSSGSSMSSGSSLSS'.split('').map((c) => ({ S: 'silver', G: 'gold', M: 'magic', H: 'giant', E: 'epic', L: 'legendary' }[c]));
const UNLOCK_LANES = 2; // won chests unlock by themselves, two at a time, in the order they were won
const FREE_CHEST_EVERY = 3 * 60 * 60 * 1000;
const FREE_CHEST_MAX = 3; // free chests waiting at most
const CROWNS_FOR_CHEST = 8;
const CROWN_BANK = 16; // crowns keep counting up to two Crown Chests' worth
const TOP_MIN = ARENAS[ARENAS.length - 1].min; // 2600: the top arena, where the Legend Road and the bounded ladder start

function defaultSave() {
  const cards = {};
  for (const k of STARTER_DECK) cards[k] = { lvl: 1, n: 0 };
  return {
    v: 2,
    name: 'Player' + randi(1000, 9999),
    trophies: 0, best: 0,
    gold: 150, gems: 60,
    king: 1, kingXp: 0,
    cards,
    decks: [STARTER_DECK.slice(), STARTER_DECK.slice(), STARTER_DECK.slice()],
    deck: 0,
    chests: [null, null, null, null], // { type, arena, seed, wonAt, unlockAt }
    cycle: 0,
    crowns: 0,
    free: null,
    shop: null,
    stats: { wins: 0, losses: 0, draws: 0, three: 0, onlineWins: 0, onlineLosses: 0, bestStreak: 0, streak: 0, played: 0, lstreak: 0, form: [] },
    settings: { sfx: true, music: true, vibrate: true },
    tutorial: false,
    arenaSeen: 0,
    fresh: {},
    road: 0, // Crown Road claim index: ROAD[0..road-1] are paid
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
      SAVE.v = d.v | 0;
      SAVE.stats = Object.assign(defaultSave().stats, d.stats || {});
      SAVE.settings = Object.assign(defaultSave().settings, d.settings || {});
      SAVE.fresh = d.fresh || {};
      for (const k of Object.keys(SAVE.cards)) if (!CARDS[k]) delete SAVE.cards[k];
      for (const k of STARTER_DECK) if (!SAVE.cards[k]) SAVE.cards[k] = { lvl: 1, n: 0 };
      if (!Array.isArray(SAVE.decks) || SAVE.decks.length !== 3) SAVE.decks = defaultSave().decks;
      SAVE.decks = SAVE.decks.map((dk) => (Array.isArray(dk) && dk.length === 8 && dk.every((k) => SAVE.cards[k]) && new Set(dk).size === 8 ? dk : STARTER_DECK.slice()));
      if (!(SAVE.deck >= 0 && SAVE.deck < 3)) SAVE.deck = 0;
      if (!Array.isArray(SAVE.chests) || SAVE.chests.length !== 4) SAVE.chests = [null, null, null, null];
    }
  } catch (e) { /* corrupted or unavailable storage: start fresh */ }
  // Older saves get the one-time Crown Road catch-up; the UI shows SAVE.pendingGift once, then deletes it.
  if (!(SAVE.v >= 2)) {
    try { SAVE.pendingGift = migrateV2(); } catch (e) { SAVE.v = 2; /* never pay the back-pay twice */ }
  }
  SAVE.road = SAVE.road | 0;
  SAVE.crowns = Math.min(CROWN_BANK, SAVE.crowns | 0);
  scheduleChests();
}

function saveGame() {
  // pendingGift is UI state for this session only
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE, (k, v) => (k === 'pendingGift' ? undefined : v))); } catch (e) { /* storage unavailable */ }
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

// Mean level of your 8 best cards. New cards arrive one level below it, so they are playable at once.
function top8Avg() {
  const lv = Object.keys(SAVE.cards).map((k) => SAVE.cards[k].lvl).sort((a, b) => b - a).slice(0, 8);
  return lv.reduce((a, b) => a + b, 0) / Math.max(1, lv.length);
}

function newCardLevel() {
  return clamp(Math.floor(top8Avg()) - 1, 1, MAX_LEVEL - 1);
}

// Chest, shop and Instant Loot finds. Returns true when the card is new.
function addCards(k, n) {
  const had = !!SAVE.cards[k];
  if (!had) {
    SAVE.cards[k] = { lvl: newCardLevel(), n: n - 1 };
    SAVE.fresh[k] = true;
  } else SAVE.cards[k].n += n;
  return !had;
}

// Copies of a maxed card are worth 5 gold each.
function capCopies(k) {
  const rec = SAVE.cards[k];
  if (rec && rec.lvl >= MAX_LEVEL && rec.n > 0) { SAVE.gold += rec.n * 5; rec.n = 0; }
}

// Crown Road and arena gate grants. A new card comes with exactly one upgrade's worth of copies (it shows
// the upgrade arrow at once); an owned card gets one upgrade's worth. Returns null for a maxed card.
function grantCard(k) {
  const r = RARITY[CARDS[k].rarity];
  const c = SAVE.cards[k];
  if (!c) {
    const L = newCardLevel();
    SAVE.cards[k] = { lvl: L, n: r.copies[L - 1] };
    SAVE.fresh[k] = true;
    return { key: k, lvl: L, n: r.copies[L - 1] + 1, isNew: true };
  }
  if (c.lvl >= MAX_LEVEL) return null;
  const n = r.copies[c.lvl - 1];
  c.n += n;
  return { key: k, lvl: c.lvl, n, isNew: false };
}

// ---- chests ----
function rollChest(type, arena, seed) {
  const def = CHESTS[type];
  const rng = new RNG(seed || (Date.now() & 0xffffffff));
  // the arena's cards plus every card you own, so sneak-peek cards keep dropping before their arena
  const pool = CARD_KEYS.filter((k) => CARDS[k].arena <= arena || SAVE.cards[k]);
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
    capCopies(c.key);
    res.push({ key: c.key, n: c.n, isNew, lvl: SAVE.cards[c.key].lvl });
  }
  SAVE.gold += loot.gold;
  SAVE.gems += loot.gems;
  saveGame();
  return res;
}

function chestSlotFree() { return SAVE.chests.findIndex((c) => !c); }

// Returns null when all 4 slots are full (the caller pays Instant Loot instead; the cycle does not advance).
function awardChest() {
  const i = chestSlotFree();
  if (i < 0) return null;
  const type = CHEST_CYCLE[SAVE.cycle % CHEST_CYCLE.length];
  SAVE.cycle++;
  SAVE.chests[i] = { type, arena: curArena(), unlockAt: 0, seed: randi(1, 1e9), wonAt: Date.now() };
  scheduleChests();
  return SAVE.chests[i];
}

// 'empty' | 'ready' | 'unlocking' (timer running in a lane) | 'queued' (waiting for a lane) | 'locked' (legacy, no unlockAt)
function chestState(ch) {
  if (!ch) return 'empty';
  if (!ch.unlockAt) return 'locked';
  const now = Date.now();
  if (now >= ch.unlockAt) return 'ready';
  return now >= ch.unlockAt - CHESTS[ch.type].time * 1000 ? 'unlocking' : 'queued';
}

// Plans every waiting chest into UNLOCK_LANES lanes, oldest win first. unlockAt is set ahead of time,
// so the queue keeps running while the app is closed. Call after any change to the slots.
function scheduleChests() {
  const now = Date.now(), lanes = [], q = [];
  for (const c of SAVE.chests) {
    if (!c) continue;
    const s = chestState(c);
    if (s === 'unlocking') lanes.push(c.unlockAt);
    else if (s === 'queued' || s === 'locked') q.push(c);
  }
  while (lanes.length < UNLOCK_LANES) lanes.push(now);
  q.sort((a, b) => (a.wonAt || 0) - (b.wonAt || 0));
  for (const c of q) {
    lanes.sort((x, y) => x - y);
    c.unlockAt = lanes[0] + CHESTS[c.type].time * 1000;
    lanes[0] = c.unlockAt;
  }
}

// Kept for older callers; with the automatic queue it only reports whether a lane is busy.
function anyUnlocking() { return SAVE.chests.some((c) => chestState(c) === 'unlocking'); }

// Also prices queued chests (their whole remaining wait).
function gemsToOpen(ch) {
  const ms = ch.unlockAt ? Math.max(0, ch.unlockAt - Date.now()) : CHESTS[ch.type].time * 1000;
  return Math.max(1, Math.ceil(ms / 1000 / 60 / 6));
}

// Slot chests open at the arena they were won in or your current one, whichever is higher.
function chestOpenArena(ch) {
  return Math.max(ch.arena | 0, curArena());
}

// Takes the chest out of slot i (a ready one, or any one paid with gems when payGems is set) and
// re-plans the queue. Returns { type, arena, seed, gems } for the chest reveal, or null.
function takeSlotChest(i, payGems) {
  const ch = SAVE.chests[i];
  if (!ch) return null;
  let gems = 0;
  if (chestState(ch) !== 'ready') {
    if (!payGems) return null;
    gems = gemsToOpen(ch);
    if (SAVE.gems < gems) return null;
    SAVE.gems -= gems;
  }
  SAVE.chests[i] = null;
  scheduleChests();
  saveGame();
  return { type: ch.type, arena: chestOpenArena(ch), seed: ch.seed, gems };
}

// Free chests build up every few hours (at most FREE_CHEST_MAX waiting).
function freeState() {
  const now = Date.now();
  let f = SAVE.free;
  if (!f || typeof f.n !== 'number') f = SAVE.free = { n: 1, at: now + FREE_CHEST_EVERY };
  while (f.n < FREE_CHEST_MAX && now >= f.at) { f.n++; f.at += FREE_CHEST_EVERY; }
  if (f.n >= FREE_CHEST_MAX) f.at = now + FREE_CHEST_EVERY;
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

// Crown Chest: every CROWNS_FOR_CHEST crowns; a second chest's worth can be banked (CROWN_BANK).
function crownChestReady() { return SAVE.crowns >= CROWNS_FOR_CHEST; }

function takeCrownChest() {
  if (SAVE.crowns < CROWNS_FOR_CHEST) return false;
  SAVE.crowns -= CROWNS_FOR_CHEST;
  saveGame();
  return true;
}

// ---- shop ----
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

// Local calendar day as a number. The shop only re-rolls when it moves forward, so setting the
// clock back can't hand out another free pack or reset the Card Request limit.
function dayNum() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
}

function refreshShop() {
  const day = todayKey(), dn = dayNum();
  if (SAVE.shop && (SAVE.shop.day === day || (SAVE.shop.dn | 0) >= dn)) {
    // a shop rolled before v2 gets today's free pack too
    if (!SAVE.shop.offers.some((o) => o.kind === 'pack')) SAVE.shop.offers.unshift({ kind: 'pack', n: 1, price: 0, cur: 'free', bought: false });
    SAVE.shop.req = SAVE.shop.req | 0;
    return SAVE.shop;
  }
  const rng = new RNG(hashStr(day + SAVE.name));
  const pool = cardsForArena(curArena());
  const pick = (r) => { const l = pool.filter((k) => CARDS[k].rarity === r); return l.length ? rng.pick(l) : null; };
  const offers = [{ kind: 'pack', n: 1, price: 0, cur: 'free' }]; // one free Deck Pack a day
  const c1 = pick('common'), c2 = pick('common'), r1 = pick('rare'), e1 = pick('epic');
  if (c1) offers.push({ kind: 'card', key: c1, n: 10, price: 150, cur: 'gold' });
  if (r1) offers.push({ kind: 'card', key: r1, n: 3, price: 360, cur: 'gold' });
  if (e1) offers.push({ kind: 'card', key: e1, n: 1, price: 1200, cur: 'gold' });
  if (c2 && c2 !== c1) offers.push({ kind: 'card', key: c2, n: 20, price: 280, cur: 'gold' });
  SAVE.shop = { day, dn, offers: offers.map((o) => Object.assign(o, { bought: false })), req: 0 };
  saveGame();
  return SAVE.shop;
}

// Today's free Deck Pack. Returns the copies granted (deckPack list) or null if already taken.
function claimFreePack() {
  const o = refreshShop().offers.find((x) => x.kind === 'pack');
  if (!o || o.bought) return null;
  o.bought = true;
  const got = deckPack(curArena(), o.n || 1);
  saveGame();
  return got;
}

// Buys daily offer i. Returns { kind: 'pack', cards } or { kind: 'card', key, n, isNew }, or null.
function buyOffer(i) {
  const o = refreshShop().offers[i];
  if (!o || o.bought) return null;
  if (o.kind === 'pack') { const cards = claimFreePack(); return cards && { kind: 'pack', cards }; }
  if (SAVE.gold < o.price) return null;
  SAVE.gold -= o.price;
  o.bought = true;
  const isNew = addCards(o.key, o.n);
  capCopies(o.key);
  saveGame();
  return { kind: 'card', key: o.key, n: o.n, isNew };
}

// Card Request: a gem sink for copies of any card in the current deck that is not maxed.
const CARD_REQUEST = {
  common: { n: 20, gems: 30 },
  rare: { n: 6, gems: 40 },
  epic: { n: 2, gems: 60 },
  legendary: { n: 1, gems: 120 },
};
const CARD_REQUESTS_PER_DAY = 3;

function cardRequestsLeft() {
  return Math.max(0, CARD_REQUESTS_PER_DAY - (refreshShop().req | 0));
}

// What a request for card k would give: { key, n, gems }, or null if k is not a current deck card or is maxed.
function cardRequestOffer(k) {
  const c = SAVE.cards[k];
  if (!c || c.lvl >= MAX_LEVEL || !curDeck().includes(k)) return null;
  const q = CARD_REQUEST[CARDS[k].rarity];
  return { key: k, n: q.n, gems: q.gems };
}

function buyCardRequest(k) {
  const o = cardRequestOffer(k);
  const shop = refreshShop();
  if (!o || (shop.req | 0) >= CARD_REQUESTS_PER_DAY || SAVE.gems < o.gems) return null;
  SAVE.gems -= o.gems;
  shop.req = (shop.req | 0) + 1;
  SAVE.cards[k].n += o.n;
  saveGame();
  return o;
}

const SHOP_CHESTS = [
  { type: 'magic', gems: 40 },
  { type: 'giant', gems: 60 },
  { type: 'epic', gems: 80 },
  { type: 'legendary', gems: 150 },
];
const GOLD_PACKS = [{ gold: 500, gems: 25 }, { gold: 3000, gems: 120 }];

// Pays for SHOP_CHESTS[i]. Returns { type, arena } for the chest reveal, or null.
function buyShopChest(i) {
  const c = SHOP_CHESTS[i];
  if (!c || SAVE.gems < c.gems) return null;
  SAVE.gems -= c.gems;
  saveGame();
  return { type: c.type, arena: curArena() };
}

// Buys GOLD_PACKS[i]. Returns the gold added, or 0.
function buyGoldPack(i) {
  const g = GOLD_PACKS[i];
  if (!g || SAVE.gems < g.gems) return 0;
  SAVE.gems -= g.gems;
  SAVE.gold += g.gold;
  saveGame();
  return g.gold;
}

// ---- Crown Road ----
// A named reward track claimed in order as your BEST trophy count passes each node (so a loss never takes
// anything back and nothing is paid twice). Rewards: ['card', keys] those cards (one upgrade's worth of
// copies if owned) · ['gate', a] every card of arena a not owned yet · ['chest', type] opened on the spot
// at the node's arena · ['gold', n] · ['gems', n] · ['pack', n] n Deck Packs.
const CROWN_ROAD = [
  // Meadow Grounds
  { t: 30, rewards: [['card', ['speargobs']]] },
  { t: 60, rewards: [['chest', 'gold']] },
  { t: 90, rewards: [['card', ['bomber']]] },
  { t: 120, rewards: [['pack', 1]] },
  { t: 150, rewards: [['card', ['horde']]] },
  { t: 175, rewards: [['card', ['drakeling']]] },
  { t: 200, rewards: [['gate', 1]] }, // Bone Pit: Imps, Tombstone, Necromancer, Shieldmaiden
  { t: 250, rewards: [['pack', 1]] },
  { t: 300, rewards: [['chest', 'gold']] },
  { t: 350, rewards: [['card', ['barbarians', 'cannon']]] }, // sneak peek
  { t: 400, rewards: [['gold', 150], ['gems', 10]] },
  { t: 450, rewards: [['gate', 2], ['chest', 'gold']] }, // Barbarian Bowl: Berserker, Lancer
  { t: 500, rewards: [['pack', 1]] },
  { t: 550, rewards: [['chest', 'gold']] },
  { t: 600, rewards: [['card', ['sprite', 'zap']]] },
  { t: 650, rewards: [['pack', 1]] },
  { t: 700, rewards: [['gold', 250], ['gems', 10]] },
  { t: 750, rewards: [['gate', 3], ['chest', 'magic']] }, // Frozen Peak: Freeze, Frost Mage
  { t: 800, rewards: [['pack', 1]] },
  { t: 860, rewards: [['chest', 'gold']] },
  { t: 920, rewards: [['card', ['boar', 'inferno']]] },
  { t: 980, rewards: [['pack', 1]] },
  { t: 1040, rewards: [['gold', 350], ['gems', 15]] },
  { t: 1100, rewards: [['gate', 4], ['chest', 'gold']] }, // Jungle Temple: Bomb Balloon, Poison
  { t: 1170, rewards: [['pack', 1]] },
  { t: 1240, rewards: [['chest', 'gold']] },
  { t: 1310, rewards: [['card', ['firemage', 'pump']]] },
  { t: 1380, rewards: [['pack', 1]] },
  { t: 1440, rewards: [['gold', 450], ['gems', 15]] },
  { t: 1500, rewards: [['gate', 5], ['chest', 'giant']] }, // Lava Forge: Juggernaut, Stone Golem
  { t: 1580, rewards: [['pack', 1]] },
  { t: 1660, rewards: [['chest', 'gold']] },
  { t: 1740, rewards: [['card', ['log']]] },
  { t: 1820, rewards: [['pack', 1]] },
  { t: 1900, rewards: [['gold', 550], ['gems', 20]] },
  { t: 2000, rewards: [['gate', 6], ['chest', 'magic']] }, // Storm Summit: Storm Mage
  { t: 2090, rewards: [['pack', 1]] },
  { t: 2180, rewards: [['chest', 'gold']] },
  { t: 2270, rewards: [['chest', 'magic']] },
  { t: 2360, rewards: [['pack', 1]] },
  { t: 2450, rewards: [['gold', 700], ['gems', 20]] },
  { t: 2530, rewards: [['chest', 'epic']] },
  { t: 2600, rewards: [['gate', 7], ['chest', 'legendary'], ['gems', 50]] }, // Royal Crown: Tunneler
];

// Legend Road after the top arena: every 100 trophies from 2700 to 9900, a Legendary Chest on each 1000.
const LEGEND_CYCLE = [['pack', 2], ['chest', 'gold'], ['gold', 1000], ['chest', 'magic']];
const ROAD = CROWN_ROAD.concat((() => {
  const out = [];
  let n = 0;
  for (let t = TOP_MIN + 100; t <= 9900; t += 100) {
    out.push({ t, rewards: [t % 1000 === 0 ? ['chest', 'legendary'] : LEGEND_CYCLE[n++ % LEGEND_CYCLE.length]] });
  }
  return out;
})());

// Trophies of the road node that first hands over card k (null for starter cards).
function roadNodeFor(k) {
  for (const node of CROWN_ROAD) {
    for (const [kind, arg] of node.rewards) {
      if ((kind === 'card' && arg.includes(k)) || (kind === 'gate' && CARDS[k].arena === arg)) return node.t;
    }
  }
  return null;
}

// Trophies a win is worth before the opponent adjustment (shrinks on the ladder above 2600).
function winTrophies(t) {
  return t >= TOP_MIN ? Math.max(10, 30 - Math.floor((t - TOP_MIN) / 100)) : 30;
}

// Rough number of wins from the current trophies to t.
function winsTo(t) {
  return Math.max(0, Math.ceil((t - SAVE.trophies) / winTrophies(SAVE.trophies)));
}

// Deck Pack: copies of every card in the current deck, scaled by arena a (5/2/1/0 at A1, 16/5/1/1 at A7).
function deckPack(a, count) {
  const m = 20 + 7 * a, got = []; // 20 x (1 + 0.35a), kept whole so halves round up exactly (5 x 3.1 = 15.5 -> 16)
  for (const k of curDeck()) {
    const r = CARDS[k].rarity;
    const n = (r === 'common' ? Math.round(m / 4) : r === 'rare' ? Math.round((3 * m) / 40) : r === 'epic' ? Math.max(1, Math.round(m / 50)) : a >= 6 ? 1 : 0) * (count || 1);
    if (n <= 0) continue;
    const isNew = addCards(k, n);
    capCopies(k);
    got.push({ key: k, n, isNew, lvl: SAVE.cards[k].lvl });
  }
  return got;
}

// Pays every road node up to SAVE.best that has not been paid yet. Called from applyResult (AI battles)
// and migrateV2 only. Returns one entry per node for the result screen:
// { t, rewards, cards: [{ key, n, isNew, lvl }], gold, gems, chest: type|null, packs }.
function claimRoad() {
  const out = [];
  while (SAVE.road < ROAD.length && ROAD[SAVE.road].t <= SAVE.best) {
    const node = ROAD[SAVE.road++];
    const a = arenaIndex(node.t);
    const g = { t: node.t, rewards: node.rewards, cards: [], gold: 0, gems: 0, chest: null, packs: 0 };
    const add = (list) => {
      for (const x of list) {
        if (!x) continue;
        const ex = g.cards.find((c) => c.key === x.key);
        if (ex) { ex.n += x.n; ex.isNew = ex.isNew || x.isNew; ex.lvl = SAVE.cards[x.key].lvl; } else g.cards.push(Object.assign({}, x));
      }
    };
    for (const [kind, arg] of node.rewards) {
      if (kind === 'card') add(arg.map((k) => grantCard(k)));
      else if (kind === 'gate') add(CARD_KEYS.filter((k) => CARDS[k].arena === arg && !SAVE.cards[k]).map((k) => grantCard(k)));
      else if (kind === 'chest') {
        const loot = rollChest(arg, a, randi(1, 1e9));
        add(grantChest(loot));
        g.gold += loot.gold;
        g.gems += loot.gems;
        g.chest = arg;
      } else if (kind === 'gold') { SAVE.gold += arg; g.gold += arg; }
      else if (kind === 'gems') { SAVE.gems += arg; g.gems += arg; }
      else if (kind === 'pack') { add(deckPack(a, arg)); g.packs += arg; }
    }
    out.push(g);
  }
  return out;
}

// ---- opponents & rewards ----
// AI mean card level for the current trophies before any mercy. It follows your 8 best cards, not the
// deck you picked, so stuffing the deck with low-level cards can't make every opponent weak.
function aiBaseMean() {
  const t = SAVE.trophies, a = arenaIndex(t), mine = top8Avg(), E = expectedLevel(t);
  const ramp = Math.min(AI_TOP_RAMP_MAX, Math.max(0, t - TOP_MIN) * AI_TOP_RAMP);
  let base = 0.5 * E + 0.5 * mine + AI_GAP[a] + ramp; // you keep half of every upgrade
  base = Math.min(base, mine + AI_CAP_ABOVE + ramp); // never more than +0.3 above you below 2600
  if (t < TOP_MIN) base += formEase(); // struggling? the AI eases off (not in the top arena)
  base = Math.max(base, E - AI_FLOOR_BELOW); // arena floor: only binds for decks far below the curve
  return base + (t < 60 ? -1 : 0);
}

// Level offset from your last AI battles: 0 at a win rate of AI_FORM_TARGET or better, down to AI_FORM_MAX.
function formEase() {
  const f = Array.isArray(SAVE.stats.form) ? SAVE.stats.form : [];
  if (f.length < 5) return 0;
  const wr = f.reduce((s, x) => s + x, 0) / f.length;
  return clamp((wr - AI_FORM_TARGET) * AI_FORM_SLOPE, AI_FORM_MAX, 0);
}

// "Comeback match": after 2 straight AI losses (3 in the top arena) the next opponent is a bit weaker.
// Only announced when the mercy actually changes the opponent (not when its level is already at 1 or 10).
function comebackDue() {
  if ((SAVE.stats.lstreak || 0) < (SAVE.trophies >= TOP_MIN ? 3 : 2)) return false;
  const b = aiBaseMean();
  return clamp(b + AI_MERCY, 1, MAX_LEVEL) < clamp(b, 1, MAX_LEVEL);
}

function aiOpponent(training) {
  const t = SAVE.trophies;
  const a = arenaIndex(t);
  const rng = new RNG(Date.now() & 0xffffff);
  const deck = buildAIDeck(training ? 0 : a, rng);
  const comeback = !training && comebackDue();
  const mean = training ? Math.max(1, avgDeckLevel(curDeck()) - 1) : clamp(aiBaseMean() + (comeback ? AI_MERCY : 0), 1, MAX_LEVEL);
  const levels = {};
  for (const k of CARD_KEYS) levels[k] = clamp(Math.round(mean + rng.range(-0.5, 0.5)), 1, MAX_LEVEL);
  const king = clamp(Math.round(training ? SAVE.king - 1 : 0.5 * SAVE.king + 0.5 * mean), 1, MAX_LEVEL);
  const skill = training ? 0.05 : t < 60 ? 0.1 : Math.min(AI_SKILL_CAP, 0.18 + a * AI_SKILL_STEP);
  const name = training ? 'Training Dummy' : rng.pick(AI_NAMES);
  const trophies = training ? 0 : Math.max(0, t + rng.int(-40, 40));
  return { deck, levels, king, skill, name, trophies, comeback };
}

// Called once a battle has ended; returns what was earned for the result screen.
// AI battles pay trophies, gold, a chest (or Instant Loot when the slots are full), king XP and Crown Road
// nodes. Training pays 5 gold for a win. Online battles pay gold and a chest only (no trophies or road).
function applyResult(r) {
  // r: { mode, win (bool), draw (bool), myCrowns, theirCrowns, oppTrophies, reason }
  const out = { trophies: 0, gold: 0, chest: null, bonus: null, crowns: 0, crownsLost: 0, arenaUp: null, crownChest: false, xp: 0, kingUps: 0, road: [], protected: false, comeback: false };
  const st = SAVE.stats;
  st.played++;
  if (r.mode === 'training') {
    if (r.win) out.gold = 5;
    SAVE.gold += out.gold;
    saveGame();
    return out;
  }
  const online = r.mode === 'host' || r.mode === 'guest';
  const t = SAVE.trophies;
  const a = curArena();
  const myCrowns = r.myCrowns | 0;
  // giving up pays nothing, so surrender loops can't farm loss gold, XP or comeback matches
  const quit = !online && !r.win && !r.draw && r.reason === 'surrender';
  if (r.win) {
    if (online) st.onlineWins++; else st.wins++;
    st.streak++;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    if (myCrowns >= 3) st.three++;
    out.chest = awardChest();
    if (online) out.gold = 15 + a * 6 + myCrowns * 3;
    else {
      out.gold = 20 + a * 8 + myCrowns * 4;
      const opp = Number.isFinite(r.oppTrophies) ? r.oppTrophies : t;
      out.trophies = winTrophies(t) + clamp(Math.round((opp - t) / 25), -3, 3);
      st.lstreak = 0;
      // Instant Loot: with every slot full the win pays a Silver Chest on the spot (the cycle does not advance)
      if (!out.chest) {
        const loot = rollChest('silver', a, randi(1, 1e9));
        out.bonus = { loot, got: grantChest(loot) };
      }
    }
  } else if (r.draw) {
    st.draws++;
    st.streak = 0;
    out.gold = online ? 5 : 8 + a * 2;
  } else {
    if (online) st.onlineLosses++; else st.losses++;
    st.streak = 0;
    if (!online) {
      out.gold = quit ? 0 : 4 + a * 2 + myCrowns * 2;
      if (!quit) st.lstreak = (st.lstreak || 0) + 1;
      // never below the arena floor; out.protected tells the result screen the loss was cut short
      const want = t >= TOP_MIN ? 30 : 12;
      out.trophies = -Math.min(want, Math.max(0, t - ARENAS[a].min));
      out.protected = -out.trophies < want;
    }
  }
  if (!online && !quit) st.form = (Array.isArray(st.form) ? st.form : []).concat(r.win ? 1 : r.draw ? 0.5 : 0).slice(-AI_FORM_WINDOW);
  const before = arenaIndex(SAVE.trophies);
  SAVE.trophies = Math.max(0, SAVE.trophies + out.trophies);
  SAVE.best = Math.max(SAVE.best, SAVE.trophies);
  const after = arenaIndex(SAVE.trophies);
  if (after > before && after > SAVE.arenaSeen) { out.arenaUp = after; SAVE.arenaSeen = after; }
  SAVE.gold += out.gold;
  // crowns: an AI win always counts at least one; up to two chests' worth are banked
  const earned = !online && r.win ? Math.max(1, myCrowns) : myCrowns;
  const prev = SAVE.crowns;
  SAVE.crowns = Math.min(CROWN_BANK, prev + earned);
  out.crowns = SAVE.crowns - prev; // banked
  out.crownsLost = earned - out.crowns; // past the full bank
  out.crownChest = Math.floor(SAVE.crowns / CROWNS_FOR_CHEST) > Math.floor(prev / CROWNS_FOR_CHEST);
  if (!online) {
    out.xp = r.win ? 4 : quit ? 0 : 2;
    out.kingUps = addKingXp(out.xp);
    out.road = claimRoad();
    out.comeback = comebackDue();
  }
  saveGame();
  return out;
}

// ---- save upgrade ----
// v1 -> v2, run once from loadGame: hand over missing arena cards, raise lagging cards, back-pay the Crown
// Road up to your best, and put waiting chests into the automatic queue. Nothing is reset or lowered.
// Returns the gift for one "Crown Road catch-up" modal:
// { cards: [grantCard result], raised: [{ key, from, to }], road: [claimRoad entry], gold, gems, copies }.
function migrateV2() {
  if (SAVE.v >= 2) return null;
  const gift = { cards: [], raised: [], road: [], gold: 0, gems: 0, copies: 0 };
  // 1. every card of the arenas you have reached (Tunneler only at 2600 now)
  const ab = arenaIndex(SAVE.best);
  for (const k of CARD_KEYS) {
    if (CARDS[k].arena <= ab && !SAVE.cards[k]) { const g = grantCard(k); if (g) gift.cards.push(g); }
  }
  // 2. no card more than 2 levels under your best 8 (copies are kept)
  const floorL = clamp(Math.floor(top8Avg()) - 2, 1, MAX_LEVEL);
  for (const k of Object.keys(SAVE.cards)) {
    const c = SAVE.cards[k];
    if (c.lvl < floorL) { gift.raised.push({ key: k, from: c.lvl, to: floorL }); c.lvl = floorL; }
  }
  // 3. every road node up to your best trophies, exactly once
  SAVE.road = 0;
  gift.road = claimRoad();
  for (const g of gift.road) {
    gift.gold += g.gold;
    gift.gems += g.gems;
    for (const c of g.cards) gift.copies += c.n;
  }
  // 4. chests: ready and unlocking ones keep their timer (never longer than the new one); locked ones queue up
  const now = Date.now();
  SAVE.chests.forEach((ch, i) => {
    if (!ch) return;
    if (!ch.wonAt) ch.wonAt = now - (4 - i) * 1000;
    if (ch.unlockAt > now) ch.unlockAt = Math.min(ch.unlockAt, now + CHESTS[ch.type].time * 1000);
  });
  scheduleChests();
  // 5-6. crowns bank, new fields
  SAVE.crowns = Math.min(CROWN_BANK, SAVE.crowns | 0);
  SAVE.stats.lstreak = 0;
  SAVE.v = 2;
  saveGame();
  return gift;
}
