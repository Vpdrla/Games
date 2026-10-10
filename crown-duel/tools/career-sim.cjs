'use strict';
// Headless career simulator: plays whole Crown Duel careers through the real save code (applyResult, Crown
// Road, chest queue, chest opening, upgrades) with real Sim battles. The player is the built-in AIPlayer;
// a simple bot opens every chest, builds a deck from its best cards and upgrades the cheapest deck cards.
// Usage: node crown-duel/tools/career-sim.cjs [battles=300] [skills=0.55] [seeds=1,2,3,4] [sched=spec]
//          [handicaps=0] [policy=attentive] [--assert] [--targets=1,5,...] [--no-upgrade] [--free-pack]
//          [--migrate-from=<save.json>] [--rev=<git rev>] [--par=<n>] [--json]
//   sched     spec (8 battles, then 3 h: about 54 a day) · casual (3 sessions of 5 a day) · binge (30, then 10 h)
//   handicaps the player's cards and towers fight this many levels below their real level (a weaker human)
//   policy    attentive (chests and upgrades before every battle) · lazy (only when a session starts and ends)
//   --assert  checks the pacing targets (1-17) that apply to each group of careers, prints PASS/FAIL per
//             target and exits 1 on any FAIL. --targets limits the check to the listed targets.
//   --no-upgrade never upgrades · --free-pack also claims the shop's free daily Deck Pack
//   --migrate-from loads a save first (raw localStorage JSON, or { now, save }); v1 saves get migrateV2
//   --rev runs the careers on an older commit's code instead (e.g. --rev=HEAD for before/after numbers)
//   CD_JS_DIR=<dir> runs tuned copies of the five modules (try AI_GAP changes without touching src/js)
// One child process per career, as many at once as there are CPUs (about 60 s per 4 x 300 battles on 4 CPUs).
// Targets 1-13 are for the reference player (skill 0.55, spec, handicap 0, attentive); whole-career ones
// (5, 6, 8, 12, 13) are only checked on 250-400 battle runs. Examples:
//   node crown-duel/tools/career-sim.cjs 300 0.55 1,2,3,4,5,6,7,8 spec 0 attentive --assert   (1-10, 12, 13)
//   node crown-duel/tools/career-sim.cjs 800 0.55 11,12,13,14 --assert --targets=10,11         (deck max, ladder)
//   node crown-duel/tools/career-sim.cjs 300 0.55 1,2,3,4 spec 0.5,1 attentive --assert       (14)
//   node crown-duel/tools/career-sim.cjs 250 --no-upgrade --assert                            (15)
//   node crown-duel/tools/career-sim.cjs 250 0.55 5,6,7,8 casual 0 lazy --assert               (16, 9)
//   node crown-duel/tools/career-sim.cjs 300 0.55 1,2,3,4 binge 0 attentive --assert          (9)
//   node crown-duel/tools/career-sim.cjs 300 0.75 1,2,3,4 --assert                            (17)
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const JS_DIR = process.env.CD_JS_DIR || path.join(__dirname, '..', 'src', 'js'); // CD_JS_DIR: try tuned copies of the modules
const FILES = ['01-util.js', '02-cards.js', '03-sim.js', '04-ai.js', '09-save.js'];
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const CHECKPOINTS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 175, 200, 250, 300, 400, 500, 600, 700, 800];
// Everything the bot needs from the game. Names missing from older code come back undefined.
const API = ['Sim', 'AIPlayer', 'CARDS', 'CARD_KEYS', 'ARENAS', 'RARITY', 'CHESTS', 'MAX_LEVEL', 'SIM_DT', 'SAVE_KEY',
  'CROWNS_FOR_CHEST', 'ROAD', 'loadGame', 'curDeck', 'cardLvl', 'curArena', 'arenaIndex', 'deckLevels', 'avgDeckLevel',
  'upgradeCost', 'canUpgrade', 'upgradeCard', 'rollChest', 'grantChest', 'chestState', 'anyUnlocking', 'takeFreeChest',
  'aiOpponent', 'applyResult', 'cardsForArena', 'randi', 'hasTag', 'scheduleChests', 'takeSlotChest', 'takeCrownChest',
  'claimFreePack', 'top8Avg'];

// ---------- game code in a sandbox ----------
// The five modules as one script, from src/js or from a git revision.
function loadSources(rev) {
  const read = (f) => (rev ? execFileSync('git', ['show', `${rev}:crown-duel/src/js/${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })
    : fs.readFileSync(path.join(JS_DIR, f), 'utf8'));
  return FILES.map(read).join('\n') +
    '\n;globalThis.__api = { getSave: () => SAVE, ' + API.map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ') + ' };';
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fresh game world: seeded Math.random, a clock the driver moves by hand, in-memory localStorage.
function makeWorld(code, seed, now) {
  const clock = { now: now != null ? now : Date.UTC(2026, 0, 1, 9, 0, 0) + seed * 1000003 };
  const M = {};
  for (const k of Object.getOwnPropertyNames(Math)) M[k] = Math[k];
  M.random = mulberry((seed * 2654435761) >>> 0);
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.now); }
    static now() { return clock.now; }
  }
  const store = {};
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const ctx = { console, Math: M, Date: FakeDate, localStorage, Set, Map, Object, Array, JSON, Number, String, Infinity, NaN, isFinite, parseInt, parseFloat, Error };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { A: ctx.__api, clock, store };
}

// ---------- the player ----------
const RBON = { common: 0, rare: 0.3, epic: 0.6, legendary: 0.9 }; // deck-building preference for rarer cards
const SCHED = {
  spec: { per: 8, gap: () => 3 * HOUR },
  casual: { per: 5, gap: (si) => [4 * HOUR, 6 * HOUR, 14 * HOUR - 3 * 5 * 4 * MIN][si % 3] }, // morning, lunch, evening
  binge: { per: 30, gap: () => 10 * HOUR },
};

// A career driver. attach() a world, play(n) up to n battles in total, finish() for the summary.
// Works on today's code (chest queue, Crown Road) and on v1 code (one chest unlocking at a time, started by hand).
// cfg: { skill, seed, battles, sched, hc, policy, noUpgrade, freePack }
function makeCareer(cfg) {
  const sched = SCHED[cfg.sched] || SCHED.spec;
  const hc = cfg.hc || 0;
  const lazy = cfg.policy === 'lazy';
  const jit = mulberry((cfg.seed * 7919 + 13) >>> 0);
  let W = null, A = null, played = 0, b = 0, session = 0, maxArena = 0, t0 = 0, goldStart = 0;
  const S = () => A.getSave();
  const out = {
    skill: cfg.skill, seed: cfg.seed, sched: cfg.sched, battles: cfg.battles, hc, policy: cfg.policy, noUpgrade: !!cfg.noUpgrade,
    freePack: !!cfg.freePack, rev: cfg.rev || '', migrated: !!cfg.migrateFrom,
    arenaReach: [], checkpoints: {},
    wins: 0, losses: 0, draws: 0, winsNoChest: 0, wasted: 0, instant: 0,
    chestsWon: {}, chestsOpened: {}, freeOpened: 0, crownOpened: 0, packs: 0,
    gold: { battle: 0, slot: 0, free: 0, crown: 0, road: 0, bonus: 0, overflow: 0, spent: 0, earned: 0 },
    cardsFrom: { slot: 0, free: 0, crown: 0, road: 0, bonus: 0, pack: 0 },
    upgrades: 0, block: { copies: 0, gold: 0, max: 0, ok: 0 },
    arena: {}, newCards: [], trophyTrace: [], gapHist: {},
    swaps: 0, roadClaims: 0, roadClaims2600: 0, mercy: 0, mercyPre: 0, preTop: 0,
    slotsAtStart: 0, chestWaitMin: 0, chestOpenedN: 0,
    deck9At: null, deckMaxAt: null, moments: 0, dry: 0, dryMax: 0,
  };
  const ar = (a) => (out.arena[a] = out.arena[a] || { b: 0, w: 0, l: 0, d: 0, trW: 0, trL: 0, myLvl: 0, aiLvl: 0, myKing: 0, aiKing: 0, aiSkill: 0, myCrowns: 0, theirCrowns: 0, gold: 0 });
  const day = () => (W.clock.now - t0) / DAY;

  // level a card could reach with the copies it already has (what the player sees as "upgradable")
  const potLevel = (k) => {
    const c = S().cards[k];
    if (!c) return 0;
    let lvl = c.lvl, n = c.n;
    const cp = A.RARITY[A.CARDS[k].rarity].copies;
    while (lvl < A.MAX_LEVEL && n >= cp[lvl - 1]) { n -= cp[lvl - 1]; lvl++; }
    return lvl;
  };
  const noteNew = (key, src) => out.newCards.push({ key, battle: played, rarity: A.CARDS[key].rarity, deckLvl: A.avgDeckLevel(A.curDeck()), lvl: potLevel(key), usable: null, inDeck: null, src });
  const countCards = (list) => list.reduce((x, c) => x + c.n, 0);

  const openChest = (type, arena, cseed, src, wonAt) => {
    const loot = A.rollChest(type, arena, cseed);
    const g0 = S().gold;
    const res = A.grantChest(loot);
    out.gold[src] += loot.gold;
    out.gold.overflow += S().gold - g0 - loot.gold; // copies of maxed cards turned into gold
    out.cardsFrom[src] += countCards(loot.cards);
    for (const r of res) if (r.isNew) noteNew(r.key, src);
    if (src === 'slot') {
      out.chestsOpened[type] = (out.chestsOpened[type] || 0) + 1;
      if (wonAt) { out.chestWaitMin += (W.clock.now - wonAt) / MIN; out.chestOpenedN++; }
    }
  };

  // Win condition, big spell, small spell, an air-hitting ranged troop, then the best of the rest.
  const rebuildDeck = () => {
    const deck = A.curDeck();
    const inDeck = new Set(deck);
    const owned = Object.keys(S().cards);
    const score = (k) => potLevel(k) + RBON[A.CARDS[k].rarity] + (inDeck.has(k) ? 0.49 : 0);
    const chosen = [];
    const pick = (f) => {
      const c = owned.filter((k) => !chosen.includes(k) && f(k)).sort((x, y) => score(y) - score(x) || (x < y ? -1 : 1));
      if (c.length) chosen.push(c[0]);
    };
    const isSpell = (k) => A.CARDS[k].type === 'spell';
    pick((k) => A.hasTag(k, 'win'));
    pick((k) => k === 'fireball' || k === 'poison');
    pick((k) => k === 'arrows' || k === 'zap' || k === 'log');
    pick((k) => A.hasTag(k, 'ranged') && A.hasTag(k, 'air') && !isSpell(k));
    while (chosen.length < 8) {
      const before = chosen.length;
      pick((k) => !isSpell(k) && k !== 'pump');
      if (chosen.length === before) { pick(() => true); if (chosen.length === before) break; }
    }
    if (chosen.length === 8) {
      const add = chosen.filter((k) => !inDeck.has(k));
      out.swaps += add.length;
      let j = 0;
      for (let i = 0; i < 8; i++) if (!chosen.includes(deck[i])) deck[i] = add[j++]; // in place: deck order stays stable
    }
  };

  // Cheapest, lowest deck card first, as long as copies and gold allow; then note what blocks each card.
  const doUpgrades = () => {
    if (cfg.noUpgrade) return;
    for (;;) {
      const c = A.curDeck().filter((k) => A.canUpgrade(k)).sort((x, y) => A.cardLvl(x) - A.cardLvl(y) || A.upgradeCost(x).gold - A.upgradeCost(y).gold);
      if (!c.length) break;
      out.gold.spent += A.upgradeCost(c[0]).gold;
      out.upgrades++;
      A.upgradeCard(c[0]);
    }
    for (const k of A.curDeck()) {
      const u = A.upgradeCost(k);
      if (!u) out.block.max++;
      else if (S().cards[k].n < u.copies) out.block.copies++;
      else if (S().gold < u.gold) out.block.gold++;
      else out.block.ok++;
    }
  };

  // The home screen: open what is ready, start an unlock (v1 only), rebuild the deck and upgrade.
  const menu = (leaving) => {
    const sv = S();
    const queue = typeof A.takeSlotChest === 'function';
    for (let i = 0; i < 4; i++) {
      const ch = sv.chests[i];
      if (A.chestState(ch) !== 'ready') continue;
      if (queue) { const r = A.takeSlotChest(i, false); openChest(r.type, r.arena, r.seed, 'slot', ch.wonAt); }
      else { sv.chests[i] = null; openChest(ch.type, ch.arena, ch.seed, 'slot'); }
    }
    while (A.takeFreeChest()) { out.freeOpened++; openChest('free', A.curArena(), A.randi(1, 1e9), 'free'); }
    if (A.takeCrownChest) {
      while (A.takeCrownChest()) { out.crownOpened++; openChest('crown', A.curArena(), A.randi(1, 1e9), 'crown'); }
    } else if (sv.crowns >= A.CROWNS_FOR_CHEST) { sv.crowns = 0; out.crownOpened++; openChest('crown', A.curArena(), A.randi(1, 1e9), 'crown'); }
    if (!queue && !A.anyUnlocking()) {
      // v1: one chest at a time, started by hand; the shortest one between battles, the longest when leaving
      const locked = [0, 1, 2, 3].filter((i) => A.chestState(sv.chests[i]) === 'locked');
      if (locked.length) {
        locked.sort((x, y) => (A.CHESTS[sv.chests[x].type].time - A.CHESTS[sv.chests[y].type].time) * (leaving ? -1 : 1));
        const ch = sv.chests[locked[0]];
        ch.unlockAt = W.clock.now + A.CHESTS[ch.type].time * 1000;
      }
    }
    if (cfg.freePack && A.claimFreePack) {
      const got = A.claimFreePack();
      if (got) { out.packs++; out.cardsFrom.pack += countCards(got); }
    }
    rebuildDeck();
    doUpgrades();
  };

  const checkUsable = () => {
    const deck = A.curDeck(), dAvg = A.avgDeckLevel(deck);
    for (const nc of out.newCards) {
      if (nc.usable == null && (deck.includes(nc.key) || potLevel(nc.key) >= dAvg - 1)) nc.usable = played;
      if (nc.inDeck == null && deck.includes(nc.key)) nc.inDeck = played;
    }
  };

  const battle = () => {
    const sv = S();
    out.slotsAtStart += sv.chests.filter((c) => c).length;
    const a = A.curArena();
    const opp = A.aiOpponent(false);
    if (opp.comeback) out.mercy++;
    if (a < 7) { out.preTop++; if (opp.comeback) out.mercyPre++; }
    const bseed = A.randi(1, 1e9);
    const deck = A.curDeck().slice();
    const myLv = A.deckLevels();
    if (hc) for (const k of Object.keys(myLv)) myLv[k] = Math.max(1, myLv[k] - hc);
    const sim = new A.Sim({ decks: [deck, opp.deck], levels: [myLv, opp.levels], kings: [Math.max(1, sv.king - hc), opp.king], seed: bseed });
    const me = new A.AIPlayer(sim, 0, cfg.skill, bseed + 3);
    const foe = new A.AIPlayer(sim, 1, opp.skill, bseed + 7);
    let steps = 0;
    while (!sim.over && steps < 30 * 400) { me.update(A.SIM_DT); foe.update(A.SIM_DT); sim.step(); sim.events.length = 0; steps++; }
    W.clock.now += 4 * MIN + Math.round((jit() - 0.5) * 60000);
    const r = { mode: 'ai', win: sim.winner === 0, draw: sim.winner === -1, myCrowns: sim.p[0].crowns, theirCrowns: sim.p[1].crowns, oppTrophies: opp.trophies };
    const trBefore = sv.trophies;
    const rw = A.applyResult(r);
    played++;
    const st = ar(a);
    st.b++;
    st.myLvl += A.avgDeckLevel(deck);
    st.aiLvl += opp.deck.reduce((s, k) => s + opp.levels[k], 0) / opp.deck.length;
    st.myKing += sv.king; st.aiKing += opp.king; st.aiSkill += opp.skill;
    st.myCrowns += r.myCrowns; st.theirCrowns += r.theirCrowns;
    st.gold += rw.gold;
    {
      // win rate by the level gap the battle was actually fought at
      const gp = opp.deck.reduce((s, k) => s + opp.levels[k], 0) / 8 - A.avgDeckLevel(deck) + hc;
      const key = (a < 3 ? 'A1-3' : a < 6 ? 'A4-6' : 'A7-8') + '|' + (Math.round(gp * 4) / 4).toFixed(2);
      const h = (out.gapHist[key] = out.gapHist[key] || [0, 0, 0]);
      h[0]++; if (r.win) h[1]++; h[2] += opp.king - sv.king + hc;
    }
    out.gold.battle += rw.gold;
    if (rw.bonus) {
      out.instant++;
      out.gold.bonus += rw.bonus.loot.gold;
      out.cardsFrom.bonus += countCards(rw.bonus.loot.cards);
      for (const g of rw.bonus.got) if (g.isNew) noteNew(g.key, 'bonus');
    }
    for (const g of rw.road || []) {
      out.roadClaims++;
      if (g.t <= 2600) out.roadClaims2600++;
      out.gold.road += g.gold;
      out.cardsFrom.road += countCards(g.cards);
      for (const c of g.cards) if (c.isNew) noteNew(c.key, 'road');
    }
    if (rw.chest || rw.bonus || (rw.road && rw.road.length)) { out.moments++; out.dry = 0; } else { out.dry++; out.dryMax = Math.max(out.dryMax, out.dry); }
    if (r.win) {
      st.w++; out.wins++; st.trW += S().trophies - trBefore;
      if (rw.chest) out.chestsWon[rw.chest.type] = (out.chestsWon[rw.chest.type] || 0) + 1;
      else { out.winsNoChest++; if (!rw.bonus) out.wasted++; }
    } else if (r.draw) { st.d++; out.draws++; } else { st.l++; out.losses++; st.trL += S().trophies - trBefore; }
    while (A.curArena() > maxArena) { maxArena++; out.arenaReach[maxArena] = { battle: played, day: day() }; }
    if (played % 10 === 0) out.trophyTrace.push(S().trophies);
    if (!lazy) rebuildDeck();
    const dAvg = A.avgDeckLevel(A.curDeck());
    if (dAvg >= 9 && out.deck9At == null) out.deck9At = played;
    if (dAvg >= 10 && out.deckMaxAt == null) out.deckMaxAt = played;
    checkUsable();
    if (CHECKPOINTS.includes(played)) {
      const ownedLv = Object.keys(S().cards).map((k) => S().cards[k].lvl);
      out.checkpoints[played] = {
        owned: ownedLv.length, usable: Object.keys(S().cards).filter((k) => potLevel(k) >= dAvg - 1).length,
        trophies: S().trophies, best: S().best, arena: A.curArena(), deckLvl: +dAvg.toFixed(2), king: S().king,
        gold: S().gold, gems: S().gems, day: +day().toFixed(2), wins: out.wins,
        chestsInSlots: S().chests.filter((c) => c).length, minOwnedLvl: Math.min(...ownedLv),
      };
    }
  };

  return {
    out,
    // Switches to another world (same save, new code) without breaking the session in progress.
    attach(world) {
      W = world; A = world.A;
      if (!t0) t0 = world.clock.now;
      goldStart = S().gold - out.gold.earned + out.gold.spent; // keeps the running totals across a switch
      maxArena = Math.max(maxArena, A.curArena());
      for (let a = 0; a <= maxArena; a++) if (!out.arenaReach[a]) out.arenaReach[a] = { battle: played, day: day() };
    },
    play(total) {
      while (played < total) {
        if (!lazy || b === 0) menu(false);
        battle();
        if (++b >= sched.per) { menu(true); W.clock.now += sched.gap(session); session++; b = 0; }
        out.gold.earned = S().gold - goldStart + out.gold.spent;
      }
    },
    finish() {
      if (b > 0) { menu(true); W.clock.now += sched.gap(session); session++; b = 0; }
      checkUsable();
      out.gold.earned = S().gold - goldStart + out.gold.spent;
      out.final = {
        trophies: S().trophies, best: S().best, arena: A.curArena(), king: S().king, gold: S().gold, gems: S().gems, owned: Object.keys(S().cards).length,
        deck: A.curDeck().map((k) => k + ':' + A.cardLvl(k)), deckLvl: A.avgDeckLevel(A.curDeck()), days: day(), road: S().road,
      };
      return out;
    },
  };
}

// Short summary of a migrateV2 gift for the report.
function giftSummary(g) {
  if (!g) return null;
  return {
    newCards: g.cards.filter((c) => c.isNew).length, raised: g.raised.length, raisedLv: g.raised.reduce((x, y) => x + y.to - y.from, 0),
    road: g.road.length, gold: g.gold, gems: g.gems, copies: g.copies,
  };
}

// One whole career in this process.
function career(cfg) {
  const code = loadSources(cfg.rev);
  let now = null, raw = null;
  if (cfg.migrateFrom) {
    const j = JSON.parse(fs.readFileSync(cfg.migrateFrom, 'utf8'));
    if (j && j.save && j.now) { now = j.now; raw = JSON.stringify(j.save); } else raw = JSON.stringify(j);
  }
  const world = makeWorld(code, cfg.seed, now);
  if (raw) world.store[world.A.SAVE_KEY] = raw;
  const c = makeCareer(cfg);
  let before = null;
  if (raw) {
    const s = JSON.parse(raw);
    before = { v: s.v, trophies: s.trophies, best: s.best, owned: Object.keys(s.cards).length, gold: s.gold, gems: s.gems };
  }
  world.A.loadGame();
  if (raw) {
    const sv = world.A.getSave();
    c.out.migration = { before, gift: giftSummary(sv.pendingGift), deckAfterLoad: +world.A.avgDeckLevel(world.A.curDeck()).toFixed(2) };
    delete sv.pendingGift;
  }
  c.attach(world);
  c.play(cfg.battles);
  return c.finish();
}

// ---------- driver ----------
function runChildren(jobs, par) {
  return new Promise((resolve) => {
    const results = new Array(jobs.length);
    let next = 0, done = 0;
    const launch = () => {
      if (next >= jobs.length) return;
      const i = next++;
      const p = spawn(process.execPath, [__filename, '--child', JSON.stringify(jobs[i])], { env: process.env });
      let buf = '', err = '';
      p.stdout.on('data', (d) => (buf += d));
      p.stderr.on('data', (d) => (err += d));
      p.on('close', () => {
        try { results[i] = JSON.parse(buf); } catch (e) { results[i] = { error: (err || buf).slice(0, 1500), job: jobs[i] }; }
        if (++done === jobs.length) resolve(results); else launch();
      });
    };
    for (let k = 0; k < Math.min(par, jobs.length); k++) launch();
    if (!jobs.length) resolve(results);
  });
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => (x === y ? 0 : x - y)); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const f0 = (v) => (Number.isFinite(v) ? v.toFixed(0) : v === Infinity ? 'never' : '-');
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : v === Infinity ? 'never' : '-');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '-');
const pct = (v) => (Number.isFinite(v) ? (v * 100).toFixed(0) + '%' : '-');
const pct1 = (v) => (Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '-');
const range = (a) => (a.length ? `${Math.min(...a)}-${Math.max(...a)}` : '-');
const reachB = (r, a) => (r.arenaReach[a] ? r.arenaReach[a].battle : Infinity); // battles to reach arena index a
const groupKey = (r) => `${r.rev ? 'rev ' + r.rev + ' ' : ''}${r.migrated ? 'migrated ' : ''}skill ${r.skill} / ${r.sched} / hc ${r.hc} / ${r.policy}${r.noUpgrade ? ' / no-upgrade' : ''}${r.freePack ? ' / free-pack' : ''}`;

// Pooled per-arena totals.
function arenaTotals(rs, a) {
  const sts = rs.map((r) => r.arena[a]).filter(Boolean);
  if (!sts.length) return null;
  const s = {};
  for (const k of Object.keys(sts[0])) s[k] = sts.reduce((x, y) => x + y[k], 0);
  return s;
}

// Shared numbers for the report and the targets.
function stats(rs) {
  const n = rs[0].battles;
  const g = {};
  g.n = n;
  g.goldPerBattle = mean(rs.map((r) => r.gold.earned / n));
  g.cardsPerBattle = mean(rs.map((r) => Object.values(r.cardsFrom).reduce((x, y) => x + y, 0) / n));
  g.ckpt = (c, k) => { const cs = rs.map((r) => r.checkpoints[c]).filter(Boolean); return cs.length === rs.length ? mean(cs.map((x) => x[k])) : NaN; };
  g.wr = (a) => { const s = arenaTotals(rs, a); return s ? { wr: s.w / s.b, b: s.b } : null; };
  const allNc = rs.flatMap((r) => r.newCards.filter((c) => c.battle > 0));
  g.newCards = allNc;
  g.toUsable = allNc.filter((c) => c.usable != null).map((c) => c.usable - c.battle);
  g.neverUsable = allNc.length - g.toUsable.length;
  g.instantShare = rs.reduce((x, r) => x + r.instant, 0) / Math.max(1, rs.reduce((x, r) => x + r.wins, 0));
  g.wasted = rs.reduce((x, r) => x + r.wasted, 0);
  g.mercyPre = rs.reduce((x, r) => x + r.mercyPre, 0) / Math.max(1, rs.reduce((x, r) => x + r.preTop, 0));
  g.moments = mean(rs.map((r) => r.moments / n));
  g.dryMax = mean(rs.map((r) => r.dryMax));
  return g;
}

function report(rs) {
  const n = rs[0].battles;
  const g = stats(rs);
  const L = [];
  L.push(`\n===== ${groupKey(rs[0])}  (${rs.length} careers x ${n} battles; seeds ${rs.map((r) => r.seed).join(',')}) =====`);
  const reach = [];
  for (let a = 1; a < 8; a++) {
    const bs = rs.map((r) => reachB(r, a)), hit = rs.filter((r) => r.arenaReach[a]);
    reach.push(`A${a + 1} ${hit.length ? f1(mean(hit.map((r) => r.arenaReach[a].battle))) + ' med ' + f1(median(bs)) + ' [' + range(hit.map((r) => r.arenaReach[a].battle)) + '] d' + f2(mean(hit.map((r) => r.arenaReach[a].day))) : 'never'} ${hit.length}/${rs.length}`);
  }
  L.push('Arena reach (battles: mean, median, [range], day): ' + reach.join(' | '));
  L.push('ckpt | day | trophies | arena | owned [range] | usable | deckLvl | king | gold | gems | slots full');
  for (const c of CHECKPOINTS) {
    const cs = rs.map((r) => r.checkpoints[c]).filter(Boolean);
    if (!cs.length) continue;
    const m = (k) => mean(cs.map((x) => x[k]));
    L.push(`  ${String(c).padStart(4)} | ${f2(m('day'))} | ${f1(m('trophies'))} | ${f2(m('arena') + 1)} | ${f1(m('owned'))} [${range(cs.map((x) => x.owned))}] | ${f1(m('usable'))} | ${f2(m('deckLvl'))} | ${f2(m('king'))} | ${f1(m('gold'))} | ${f1(m('gems'))} | ${f2(m('chestsInSlots'))}`);
  }
  const W = mean(rs.map((r) => r.wins)), Ls = mean(rs.map((r) => r.losses)), D = mean(rs.map((r) => r.draws));
  L.push(`Overall W ${f1(W)} L ${f1(Ls)} D ${f1(D)} WR ${pct(W / n)}; wins without a slot chest ${f1(mean(rs.map((r) => r.winsNoChest)))}, Instant Loot ${pct1(g.instantShare)} of wins, wasted wins ${f1(g.wasted / rs.length)}; ` +
    `chests in slots at battle start ${f2(mean(rs.map((r) => r.slotsAtStart / n)))}; minutes win->open ${f1(mean(rs.filter((r) => r.chestOpenedN).map((r) => r.chestWaitMin / r.chestOpenedN)))}`);
  L.push(`Comeback matches ${f1(mean(rs.map((r) => r.mercy)))} per career; ${pct1(g.mercyPre)} of ${f1(mean(rs.map((r) => r.preTop)))} pre-A8 battles`);
  L.push(`Reward moments ${pct(g.moments)} of battles; longest dry stretch ${f1(g.dryMax)} [${range(rs.map((r) => r.dryMax))}]; deck >= 9 at ${rs.map((r) => r.deck9At).join(',')}; deck max at ${rs.map((r) => r.deckMaxAt).join(',')}`);
  const gk = ['battle', 'slot', 'free', 'crown', 'road', 'bonus', 'overflow'];
  L.push(`Gold earned ${f0(mean(rs.map((r) => r.gold.earned)))} (${f1(g.goldPerBattle)}/battle) = ${gk.map((k) => k + ' ' + f0(mean(rs.map((r) => r.gold[k])))).join(', ')}; spent ${f0(mean(rs.map((r) => r.gold.spent)))}; final ${f0(mean(rs.map((r) => r.final.gold)))}`);
  L.push(`Upgrades ${f1(mean(rs.map((r) => r.upgrades)))}; deck upgrade checks blocked by copies ${f0(mean(rs.map((r) => r.block.copies)))}, by gold ${f0(mean(rs.map((r) => r.block.gold)))}, maxed ${f0(mean(rs.map((r) => r.block.max)))}`);
  const ckeys = ['silver', 'gold', 'magic', 'giant', 'epic', 'legendary'];
  L.push(`Slot chests won ${ckeys.map((k) => k + ' ' + f1(mean(rs.map((r) => r.chestsWon[k] || 0)))).join(', ')}; free ${f1(mean(rs.map((r) => r.freeOpened)))}, crown ${f1(mean(rs.map((r) => r.crownOpened)))}, road claims ${f1(mean(rs.map((r) => r.roadClaims)))} (to 2600: ${f1(mean(rs.map((r) => r.roadClaims2600)))})${rs[0].freePack ? ', free packs ' + f1(mean(rs.map((r) => r.packs))) : ''}`);
  const cf = Object.keys(rs[0].cardsFrom);
  L.push(`Cards ${f1(g.cardsPerBattle)}/battle: ${cf.map((k) => k + ' ' + f0(mean(rs.map((r) => r.cardsFrom[k])))).join(', ')}; gems at end ${f0(mean(rs.map((r) => r.final.gems)))}`);
  L.push('Per arena (pooled): battles | WR | tr/win | tr/loss | net/battle | my deck lvl | AI card lvl | my king | AI king | AI skill | crowns me-them');
  for (let a = 0; a < 8; a++) {
    const s = arenaTotals(rs, a);
    if (!s) continue;
    L.push(`  A${a + 1}: ${String(s.b).padStart(5)} | ${pct(s.w / s.b)} | ${f1(s.trW / s.w)} | ${f1(s.trL / s.l)} | ${f2((s.trW + s.trL) / s.b)} | ${f2(s.myLvl / s.b)} | ${f2(s.aiLvl / s.b)} | ${f2(s.myKing / s.b)} | ${f2(s.aiKing / s.b)} | ${f2(s.aiSkill / s.b)} | ${f2(s.myCrowns / s.b)}-${f2(s.theirCrowns / s.b)}`);
  }
  const ind = g.newCards.filter((c) => c.inDeck != null).map((c) => c.inDeck - c.battle);
  L.push(`New cards after battle 0: ${f1(g.newCards.length / rs.length)} per career; deck lvl at unlock ${f2(mean(g.newCards.map((c) => c.deckLvl)))}, card lvl ${f2(mean(g.newCards.map((c) => c.lvl)))}; ` +
    `battles to usable ${f1(mean(g.toUsable))} (never ${g.neverUsable}/${g.newCards.length}); entered the deck ${ind.length}/${g.newCards.length} after ${f1(mean(ind))}`);
  {
    const H = {};
    for (const r of rs) for (const [k, v] of Object.entries(r.gapHist)) { const h = (H[k] = H[k] || [0, 0, 0]); h[0] += v[0]; h[1] += v[1]; h[2] += v[2]; }
    const ks = Object.keys(H).filter((k) => H[k][0] >= 15).sort((x, y) => x.split('|')[0].localeCompare(y.split('|')[0]) || parseFloat(x.split('|')[1]) - parseFloat(y.split('|')[1]));
    L.push('WR by level gap (AI minus me) [battles, WR, king gap]: ' + ks.map((k) => k + ' ' + H[k][0] + ' ' + pct(H[k][1] / H[k][0]) + ' k' + f1(H[k][2] / H[k][0])).join('; '));
  }
  for (const r of rs) if (r.migration) L.push(`Migration seed ${r.seed}: before ${JSON.stringify(r.migration.before)} gift ${JSON.stringify(r.migration.gift)} deck after load ${r.migration.deckAfterLoad}`);
  L.push(`Final trophies ${rs.map((r) => r.final.trophies).join(',')}; best ${rs.map((r) => r.final.best).join(',')}; deck ${rs.map((r) => r.final.deckLvl.toFixed(2)).join(',')}; king ${rs.map((r) => r.final.king).join(',')}; days ${rs.map((r) => r.final.days.toFixed(1)).join(',')}`);
  L.push(`Final deck (seed ${rs[0].seed}): ${rs[0].final.deck.join(' ')}`);
  L.push(`Trophies every 10 battles (seed ${rs[0].seed}): ${rs[0].trophyTrace.join(',')}`);
  return L.join('\n');
}

// ---------- pacing targets (spec.pacingTargets 1-17) ----------
// Each check returns null when it does not apply to this group, else { ok, text }. Brackets in the spec are
// means unless a target says otherwise; an arena never reached counts as "never" in a median.
function targets(rs) {
  const r0 = rs[0], n = r0.battles, g = stats(rs);
  const base = !r0.rev && !r0.migrated && !r0.noUpgrade && !r0.freePack;
  const ref = base && r0.skill === 0.55 && r0.sched === 'spec' && r0.hc === 0 && r0.policy === 'attentive';
  const out = [];
  const T = (id, name, parts) => {
    const ps = parts.filter(Boolean);
    if (ps.length) out.push({ id, name, ok: ps.every((p) => p.ok), text: ps.map((p) => (p.ok ? '' : '!') + p.text).join('; ') });
  };
  const P = (ok, text) => ({ ok, text });
  const fracWithin = (a, lim) => rs.filter((r) => reachB(r, a) <= lim).length;
  if (ref) {
    if (n >= 250) {
      const k = fracWithin(7, 250), med = median(rs.map((r) => reachB(r, 7)));
      T(1, 'A8 pace', [P(k / rs.length >= 7 / 8, `A8 within 250 in ${k}/${rs.length} (need >= 7/8)`), P(med >= 110 && med <= 160, `median ${f1(med)} (110-160)`)]);
    }
    if (n >= 125) { const med = median(rs.map((r) => reachB(r, 6))); T(2, 'A7 pace', [P(med >= 80 && med <= 125, `A7 median ${f1(med)} (80-125)`)]); }
    if (n >= 95) { const med = median(rs.map((r) => reachB(r, 5))); T(3, 'A6 pace', [P(med <= 95, `A6 median ${f1(med)} (<= 95)`)]); }
    if (n >= 73) {
      T(4, 'A2-A5 pace', [9, 22, 38, 56].map((want, i) => {
        const bs = rs.map((r) => reachB(r, i + 1)), m = mean(bs);
        return P(m >= want * 0.7 && m <= want * 1.3, `A${i + 2} mean ${f1(m)} (${(want * 0.7).toFixed(1)}-${(want * 1.3).toFixed(1)})`);
      }));
    }
  }
  // whole-career numbers (win rates, economy, rewards) were calibrated on 300-battle careers
  const career300 = ref && n >= 250 && n <= 400;
  if (ref && n > 400) out.push({ id: 0, name: 'note', ok: true, text: 'targets 5, 6, 8, 12 and 13 are whole-career numbers calibrated on 300-battle careers; not checked on longer runs' });
  if (career300) {
    const wrLim = [[0.7, 1], [0.7, 1], [0.65, 0.82], [0.65, 0.82], [0.65, 0.82], [0.65, 0.82], [0.58, 0.75], [0.45, 0.6]];
    // the narrow per-arena windows need the full 8-career sample; fewer careers are mostly noise
    if (rs.length < 8) out.push({ id: 0, name: 'note', ok: true, text: 'target 5 needs 8 careers (for example seeds 1-8); not checked' });
    else T(5, 'win rate by arena', wrLim.map(([lo, hi], a) => {
      const w = g.wr(a);
      return w && P(w.wr >= lo && w.wr <= hi, `A${a + 1} ${pct1(w.wr)} of ${w.b}${hi < 1 ? ` (${pct(lo)}-${pct(hi)})` : ` (>= ${pct(lo)})`}`);
    }));
    T(6, 'comeback share', [P(g.mercyPre <= 0.15, `${pct1(g.mercyPre)} of pre-A8 battles (<= 15%)`)]);
    if (g.newCards.length) T(8, 'new cards usable', [P(g.neverUsable === 0, `never usable ${g.neverUsable}/${g.newCards.length}`), P(mean(g.toUsable) <= 1, `mean battles to usable ${f2(mean(g.toUsable))} (<= 1)`)]);
  }
  if (ref) {
    T(7, 'cards owned', [[10, 14], [20, 18], [50, 25], [100, 32]].filter(([c]) => n >= c).map(([c, want]) => {
      const m = g.ckpt(c, 'owned');
      return P(m >= want, `${f1(m)} at ${c} (>= ${want})`);
    }).concat(n >= 175 ? [(() => {
      // every card of the arenas reached by battle 175: Tunneler only comes with the 2600 gate, and target 1
      // (not this one) bounds when A8 arrives
      const need = (r) => (reachB(r, 7) <= 175 ? 35 : 34);
      const short = rs.filter((r) => r.checkpoints[175].owned < need(r)).map((r) => `seed ${r.seed}: ${r.checkpoints[175].owned}/${need(r)}`);
      return P(!short.length, `${rs.map((r) => r.checkpoints[175].owned).join(',')} at 175 (34, or 35 once in A8)${short.length ? ' [' + short.join(', ') + ']' : ''}`);
    })()] : []));
    const maxObs = Math.min(550, n);
    T(10, 'deck level curve', [
      n >= 50 && P(g.ckpt(50, 'deckLvl') >= 6, `${f2(g.ckpt(50, 'deckLvl'))} at 50 (>= 6.0)`),
      n >= 300 && P(g.ckpt(300, 'deckLvl') >= 8.5 && g.ckpt(300, 'deckLvl') <= 9.3, `${f2(g.ckpt(300, 'deckLvl'))} at 300 (8.5-9.3)`),
      P(rs.every((r) => r.deckMaxAt == null || r.deckMaxAt >= 550), `deck maxed at ${rs.map((r) => (r.deckMaxAt == null ? '-' : r.deckMaxAt)).join(',')} (not before 550${n < 550 ? `; only ${maxObs} battles seen` : ''})`),
    ]);
    if (n >= 400) {
      T(11, 'bounded ladder', [P(g.ckpt(400, 'trophies') <= 3400, `${f0(g.ckpt(400, 'trophies'))} trophies at 400 (<= 3400)`),
        n >= 800 && P(g.ckpt(800, 'trophies') <= 3800, `${f0(g.ckpt(800, 'trophies'))} at 800 (<= 3800)`)]);
    }
  }
  if (career300) {
    const ck = CHECKPOINTS.filter((c) => c <= Math.min(300, n)), mx = Math.max(...ck.map((c) => g.ckpt(c, 'gold')));
    const bc = mean(rs.map((r) => r.block.copies)), bg = mean(rs.map((r) => r.block.gold));
    T(12, 'economy', [P(g.goldPerBattle >= 220 && g.goldPerBattle <= 320, `gold ${f1(g.goldPerBattle)}/battle (220-320)`),
      P(g.cardsPerBattle >= 35 && g.cardsPerBattle <= 50, `cards ${f1(g.cardsPerBattle)}/battle (35-50)`),
      P(mx <= 6000, `gold balance up to battle ${Math.min(300, n)} peaks at ${f0(mx)} (<= 6000)`),
      P(bg > bc, `upgrade checks blocked by gold ${f0(bg)} vs copies ${f0(bc)} (gold > copies)`)]);
    T(13, 'reward moments', [P(g.moments >= 0.55, `${pct(g.moments)} of battles (>= 55%)`), P(g.dryMax <= 7, `longest dry stretch ${f1(g.dryMax)} (<= 7)`)]);
  }
  // 9: every win pays something; Instant Loot share depends on how the player plays
  if (!r0.rev) {
    let lim = null;
    if (r0.policy === 'attentive' && r0.sched === 'spec') lim = 0.01;
    else if (r0.policy === 'attentive' && r0.sched === 'binge') lim = 0.02;
    else if (r0.policy === 'lazy' && r0.sched === 'casual') lim = 0.08;
    T(9, 'every win pays', [P(g.wasted === 0, `wasted wins ${g.wasted} in all careers (0)`), lim != null && P(g.instantShare <= lim, `Instant Loot ${pct1(g.instantShare)} of wins (<= ${lim * 100}%)`)]);
  }
  if (base && r0.skill === 0.55 && r0.sched === 'spec' && r0.policy === 'attentive' && (r0.hc === 0.5 || r0.hc === 1)) {
    const k = rs.filter((r) => r.arenaReach[6]).length;
    T(14, `handicap ${r0.hc}`, [P(k / rs.length >= 3 / 4, `A7 reached in ${k}/${rs.length} (>= 3/4); A8 in ${rs.filter((r) => r.arenaReach[7]).length}/${rs.length}`)]);
  }
  if (!r0.rev && !r0.migrated && r0.noUpgrade) {
    const best = rs.map((r) => r.final.best);
    T(15, 'upgrades matter', [P(Math.max(...best) <= 1100, `never-upgrade best trophies ${best.join(',')} (<= 1100)`)]);
  }
  if (base && r0.sched === 'casual' && r0.policy === 'lazy' && r0.hc === 0 && r0.skill === 0.55) {
    const hit = rs.filter((r) => r.arenaReach[7]), d = mean(hit.map((r) => r.arenaReach[7].day));
    T(16, 'casual lazy A8', [P(hit.length === rs.length, `A8 reached in ${hit.length}/${rs.length}`), P(d <= 10, `mean day ${f2(d)} [${hit.map((r) => r.arenaReach[7].day.toFixed(2)).join(',')}] (<= 10)`)]);
  }
  if (base && r0.skill === 0.75 && r0.sched === 'spec' && r0.policy === 'attentive' && r0.hc === 0) {
    const k = fracWithin(7, 250);
    T(17, 'skill 0.75', [P(k === rs.length, `A8 within 250 in ${k}/${rs.length} (all); mean ${f1(mean(rs.filter((r) => r.arenaReach[7]).map((r) => r.arenaReach[7].battle)))}`)]);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--child') {
    process.stdout.write(JSON.stringify(career(JSON.parse(args[1]))));
    return;
  }
  const opt = (name) => { const a = args.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : null; };
  const pos = args.filter((a) => !a.startsWith('--'));
  const battles = parseInt(pos[0] || '300', 10);
  const skills = (pos[1] || '0.55').split(',').map(Number);
  const seeds = (pos[2] || '1,2,3,4').split(',').map(Number);
  const sched = pos[3] || 'spec';
  const hcs = (pos[4] || '0').split(',').map(Number);
  const policy = pos[5] || 'attentive';
  if (!SCHED[sched] || !['attentive', 'lazy'].includes(policy)) { console.error('sched must be spec|casual|binge and policy attentive|lazy'); process.exit(2); }
  const common = { battles, sched, policy, noUpgrade: args.includes('--no-upgrade'), freePack: args.includes('--free-pack'), rev: opt('rev') || '', migrateFrom: opt('migrate-from') ? path.resolve(opt('migrate-from')) : null };
  const jobs = [];
  for (const skill of skills) for (const hc of hcs) for (const seed of seeds) jobs.push(Object.assign({ skill, seed, hc }, common));
  const t = Date.now();
  const results = await runChildren(jobs, parseInt(opt('par') || '0', 10) || Math.max(1, os.cpus().length));
  const bad = results.filter((r) => r.error);
  for (const b of bad) console.error('career failed', JSON.stringify(b.job), '\n', b.error);
  const ok = results.filter((r) => !r.error);
  console.log(`${jobs.length} careers in ${((Date.now() - t) / 1000).toFixed(0)}s`);
  const groups = {};
  for (const r of ok) (groups[groupKey(r)] = groups[groupKey(r)] || []).push(r);
  for (const rs of Object.values(groups)) console.log(report(rs));
  let failed = bad.length > 0;
  if (args.includes('--assert')) {
    const only = opt('targets') ? opt('targets').split(',').map(Number) : null;
    let checked = 0;
    for (const [k, rs] of Object.entries(groups)) {
      const ts = targets(rs).filter((x) => !only || !x.id || only.includes(x.id)).sort((x, y) => x.id - y.id);
      if (!ts.length) continue;
      console.log(`\nPacing targets: ${k}`);
      for (const x of ts) {
        if (!x.id) { console.log(`  NOTE  ${x.text}`); continue; }
        checked++;
        if (!x.ok) failed = true;
        console.log(`  ${x.ok ? 'PASS' : 'FAIL'}  ${String(x.id).padStart(2)} ${x.name}: ${x.text}`);
      }
    }
    if (!checked) console.log('\nNo pacing target applies to this run.');
    console.log(failed ? '\nSome targets FAILED.' : '\nAll checked targets passed.');
  }
  if (args.includes('--json')) console.log(JSON.stringify(results));
  if (failed) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { loadSources, makeWorld, makeCareer, career, giftSummary, CHECKPOINTS, mulberry };
