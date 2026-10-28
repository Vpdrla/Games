#!/usr/bin/env node
'use strict';
// Headless tests for the Blast Squad simulation (06-sim.js), its modes (07-modes.js) and the brawler
// data (03-brawlers.js). Loads only modules 01-07 into a strict vm (Math.random / Date / performance
// throw there), so it doesn't depend on the other modules being finished.
//   node blast-squad/tools/sim-test.cjs [--quick] [--verbose]
// 1. Targeted checks: auto-aim and bushes, spawn shield, reload, regen, lobs over walls, wall breaks,
//    invisibility, the arc primitive, Gem Rush countdown rules and safety cap, Showdown boxes and
//    cubes, round resets and the ball.
// 2. 3v3 Gem Rush and test-mode matches for every brawler with a scripted test driver (it may read
//    sim state: it is a test, not a bot), plus 10-player free-for-alls on a test Showdown map with
//    poison. Invariants are checked every half second.
// 3. Every brawler's attack, super and gadget must fire and have an effect; walls must break and
//    gems must drop. Determinism: same seed (and a replay of the recorded inputs) gives the same
//    final state, a different seed a different one.
// Prints per-brawler tables and ms per step. Exits non-zero on failure.
const { load, checkDeterministicSources } = require('./load.cjs');

const FILES = ['01-util.js', '02-const.js', '03-brawlers.js', '04-maps.js', '05-geo.js', '06-sim.js', '07-modes.js'];
const NAMES = [
  'Sim', 'RNG', 'BRAWLERS', 'BRAWLER_KEYS', 'MAPS', 'MODES', 'ModeKit', 'parseMap', 'packIn', 'unpackIn',
  'ACT', 'EV', 'K', 'PICK', 'TILE', 'TF_MOVE', 'TF_SHOT', 'TF_BUSH', 'flowField', 'flowDir', 'shotClear',
  'flagsAt', 'tileAt', 'SIM_DT', 'MAX_AMMO', 'REGEN_DELAY', 'REGEN_RATE', 'SPAWN_SHIELD_T', 'REVEAL_R',
  'LEVEL_MULT', 'CUBE_HP', 'CUBE_DMG', 'IN_IDLE', 'RESPAWN_T', 'brawlerKit', 'BRAWLER_R',
];
const A = load({ files: FILES, names: NAMES });
for (const n of NAMES) if (A[n] === undefined) { console.error('missing global ' + n); process.exit(1); }
const { Sim, ACT, EV, K, PICK, TILE, SIM_DT } = A;

const ARGS = process.argv.slice(2);
const QUICK = ARGS.includes('--quick');
const VERBOSE = ARGS.includes('--verbose');
const KEYS = A.BRAWLER_KEYS;

let failN = 0;
const fail = (msg) => { failN++; if (failN <= 60) console.log('  FAIL ' + msg); };
const check = (c, msg) => { if (!c) fail(msg); else if (VERBOSE) console.log("  ok   " + msg); return !!c; };
const section = (s) => console.log('\n== ' + s);
const fmt = (v, d) => (typeof v === 'number' ? v.toFixed(d == null ? 0 : d) : String(v));
const pad = (s, n) => String(s).padStart(n);

// ---------------------------------------------------------------- test Showdown map and mode
// A 44 x 44 free-for-all map with walls, bushes, water and power-cube boxes (4-fold symmetric), and a
// minimal Showdown-like mode: poison, no respawn, cubes dropped on death, last one standing wins.
// Test only: the real Showdown mode and maps come later; this also shows what they get from the sim.
function sdRows() {
  const W = 44, H = 44, g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill('.'));
  const put4 = (x, y, c) => {
    for (const [px, py] of [[x, y], [W - 1 - x, y], [x, H - 1 - y], [W - 1 - x, H - 1 - y]]) g[py][px] = c;
  };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put4(x, y, c); };
  rect(6, 6, 9, 7, '#'); rect(14, 3, 15, 6, '#'); rect(3, 14, 4, 17, '#'); rect(12, 12, 13, 13, 'X');
  rect(10, 8, 13, 10, '"'); rect(6, 18, 8, 20, '"'); rect(17, 15, 20, 17, '"');
  rect(18, 9, 20, 10, '~'); rect(8, 12, 8, 13, '=');
  for (const [x, y] of [[5, 10], [11, 4], [16, 12], [9, 16], [20, 20], [2, 2]]) put4(x, y, 'B');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const x = Math.round(21.5 + Math.cos(a) * 17.5), y = Math.round(21.5 + Math.sin(a) * 17.5);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g[y + dy][x + dx] = '.';
    g[y][x] = 'S';
  }
  return g.map((r) => r.join(''));
}
A.MAPS.zz_test_sd = { name: 'Test Showdown', modes: ['zz_sd'], full: true, rows: sdRows() };
// an open 21x21 box with a stone wall (row 8, x 11-19) that covers the right half of a wave fired
// straight up from (10.5, 13.5)
A.MAPS.zz_wall = { name: 'Test Wall', modes: ['test'], full: true, rows: (() => {
  const g = [];
  for (let y = 0; y < 21; y++) g.push([...Array(21)].map((_, x) => (x === 0 || y === 0 || x === 20 || y === 20 || (y === 8 && x >= 11 && x <= 19) ? 'X' : '.')));
  g[19][10] = '1'; g[1][10] = '2'; g[16][3] = '"';
  return g.map((r) => r.join(''));
})() };
// a 21x21 room with a breakable wall two tiles thick across the middle (rows 8-9, x 4..16)
A.MAPS.zz_brk = { name: 'Test Bricks', modes: ['test'], full: true, rows: (() => {
  const g = [];
  for (let y = 0; y < 21; y++) g.push([...Array(21)].map((_, x) => (x === 0 || y === 0 || x === 20 || y === 20 ? 'X' : (y === 8 || y === 9) && x >= 4 && x <= 16 ? '#' : '.')));
  g[19][10] = '1'; g[1][10] = '2';
  return g.map((r) => r.join(''));
})() };
A.MODES.zz_sd = A.ModeKit.make('zz_sd', {
  poison: { start: 12, shrink: 70, minHalf: 3, dmg: 1000 },
  cap: 200,
  canRespawn() { return false; },
  onKill(sim, v) { if (v.cubes > 0) sim.dropPickups(PICK.CUBE, v.cubes, v.x, v.y); },
  checkEnd(sim) {
    let alive = 0, last = null;
    for (const b of sim.brawlers) if (b.alive) { alive++; last = b; }
    if (alive > 1 && sim.t < this.cap) return null;
    const rank = [];
    for (const b of sim.brawlers) if (b.alive) rank.push(b.slot);
    for (let i = sim.deathOrder.length - 1; i >= 0; i--) if (!rank.includes(sim.deathOrder[i])) rank.push(sim.deathOrder[i]);
    return sim.makeResult(alive === 1 ? last.team : -1, alive === 1 ? 'last' : 'time', [0, 0], rank);
  },
  hud(sim) { let n = 0; for (const b of sim.brawlers) if (b.alive) n++; return { mode: 'sd', time: sim.t, alive: n, poison: sim.poison }; },
});

// ---------------------------------------------------------------- helpers
function mkSim(mode, map, bks, opt) {
  opt = opt || {};
  const slots = bks.map((bk, i) => ({
    team: opt.teams ? opt.teams[i] : i < bks.length / 2 ? 0 : 1, bk, lvl: opt.lvl || 9,
    gadget: opt.gadget == null ? 0 : opt.gadget, star: opt.star == null ? 0 : opt.star,
  }));
  return new Sim({ mode, map, seed: opt.seed || 1, slots });
}
function drain(sim) { const e = sim.events.slice(); sim.events.length = 0; return e; }
function stepN(sim, n, words) {
  const out = [];
  for (let k = 0; k < n && !sim.over; k++) {
    if (words) for (let i = 0; i < sim.brawlers.length; i++) sim.setInput(i, typeof words === 'function' ? words(i, k) : words[i] || 0);
    sim.step();
    for (const e of sim.events) out.push(e);
    sim.events.length = 0;
  }
  return out;
}
function place(sim, b, x, y) { b.x = b.px = x; b.y = b.py = y; sim.updateVision(); }
function ready(b) { b.ammo = b.maxAmmo; b.atkCd = 0; b.bqN = 0; b.stunT = 0; b.kbT = 0; b.dashT = 0; b.jumpT = 0; }
function unshield(b) { b.shieldT = 0; b.shieldF = 0; b.spawnSh = false; }
function tiles(m, pred) {
  const out = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (pred(m.tiles[y * m.w + x], x, y)) out.push({ x: x + 0.5, y: y + 0.5, ti: y * m.w + x });
  return out;
}
const free = (m, x, y) => !(A.flagsAt(m, x, y) & A.TF_MOVE);
const evs = (list, code) => list.filter((e) => e[0] === code);
const angErr = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// Non-finite numbers in an entity (top-level numbers, lob, stats). Returns a description or null.
function badNum(e) {
  for (const k in e) {
    const v = e[k];
    if (typeof v === 'number') { if (!Number.isFinite(v)) return k + '=' + v; }
    else if ((k === 'lob' || k === 'st') && v) for (const kk in v) if (typeof v[kk] === 'number' && !Number.isFinite(v[kk])) return k + '.' + kk + '=' + v[kk];
  }
  return null;
}

let invalidN = 0;
function validate(sim, label) {
  const m = sim.map;
  const bad = (msg) => { invalidN++; if (invalidN <= 12) fail(`${label} t=${sim.t.toFixed(2)}: ${msg}`); };
  for (const b of sim.brawlers) {
    const n = badNum(b);
    if (n) bad(`brawler ${b.slot} ${b.bk} ${n}`);
    if (b.dead) bad(`brawler ${b.slot} has dead=true`);
    if (b.hp < 0 || b.hp > b.maxHp) bad(`brawler ${b.slot} hp ${b.hp}/${b.maxHp}`);
    if (b.ammo < 0 || b.ammo > b.maxAmmo + 1e-9) bad(`brawler ${b.slot} ammo ${b.ammo}`);
    if (b.sup < 0 || b.sup > 1 || b.supReady !== (b.sup >= 1)) bad(`brawler ${b.slot} sup ${b.sup} ${b.supReady}`);
    if (b.gadLeft < 0 || b.gadLeft > 3) bad(`brawler ${b.slot} gadLeft ${b.gadLeft}`);
    if (b.alive && b.jumpT <= 0 && !(b.dashT > 0 && b.dashS && b.dashS.fly) && !free(m, b.x, b.y)) bad(`brawler ${b.slot} ${b.bk} inside a blocking tile at ${b.x.toFixed(2)},${b.y.toFixed(2)}`);
    if (b.alive && (b.x < 0 || b.y < 0 || b.x > m.w || b.y > m.h)) bad(`brawler ${b.slot} outside the map`);
  }
  for (const [name, arr] of [['shot', sim.shots], ['area', sim.areas], ['pickup', sim.pickups], ['deploy', sim.deploys]]) {
    for (const e of arr) {
      const n = badNum(e);
      if (n) bad(`${name} ${e.id} ${n}`);
      if (e.dead) bad(`dead ${name} ${e.id} left in the array`);
      if (name === 'deploy' && !free(m, e.x, e.y)) bad(`deploy ${e.id} inside a blocking tile`);
      if (name === 'pickup' && e.popT <= 0 && !free(m, e.x, e.y)) bad(`pickup ${e.id} on a blocking tile at ${e.x.toFixed(2)},${e.y.toFixed(2)}`);
    }
  }
  if (sim.ball) { const n = badNum(sim.ball); if (n) bad('ball ' + n); }
  const h = sim.hud();
  if (!h || typeof h.mode !== 'string' || !Number.isFinite(h.time)) bad('bad hud ' + JSON.stringify(h));
}

// FNV-1a over a canonical dump of the state.
function stateHash(sim) {
  const parts = [sim.tick, sim.over ? 1 : 0, sim.nextId, JSON.stringify(sim.result), JSON.stringify(sim.ms)];
  for (const b of sim.brawlers) {
    parts.push(b.x, b.y, b.hp, b.maxHp, b.ammo, b.sup, b.carry, b.cubes, b.vis, b.face, b.respawnT, b.gadLeft, JSON.stringify(b.st));
  }
  for (const arr of [sim.shots, sim.areas, sim.pickups, sim.deploys]) for (const e of arr) parts.push(e.id, e.x, e.y, e.hp || 0, e.t || 0);
  parts.push(Array.from(sim.map.tiles).join(''));
  const s = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

// ---------------------------------------------------------------- navigation cache for the driver
class Nav {
  constructor(sim) {
    this.sim = sim;
    this.m = sim.map;
    this.enemy = new Array(sim.nTeams).fill(null);
    this.enemyT = new Array(sim.nTeams).fill(-99);
    this.pick = null;
    this.pickT = -99;
    this.fixed();
  }
  fixed() {
    const m = this.m;
    this.boxList = tiles(m, (t) => t === TILE.BOX);
    this.boxes = this.boxList.length ? A.flowField(m, this.boxList) : null;
    this.mine = m.mine ? A.flowField(m, [m.mine]) : null;
    this.home = m.spawns.length > 1 ? m.spawns.map((s) => A.flowField(m, s)) : null;
    this.center = A.flowField(m, [{ x: m.w / 2, y: m.h / 2 }]);
  }
  tilesChanged() { this.fixed(); this.enemyT.fill(-99); this.pickT = -99; }
  enemyField(team) {
    const sim = this.sim;
    if (sim.tick - this.enemyT[team] >= 12) {
      const g = [];
      for (const o of sim.brawlers) if (o.alive && o.team !== team) g.push({ x: o.x, y: o.y });
      this.enemy[team] = g.length ? A.flowField(this.m, g) : null;
      this.enemyT[team] = sim.tick;
    }
    return this.enemy[team];
  }
  pickField() {
    const sim = this.sim;
    if (sim.tick - this.pickT >= 6) {
      const g = [];
      for (const p of sim.pickups) if (p.t > 0.3) g.push({ x: p.x, y: p.y });
      this.pick = g.length ? A.flowField(this.m, g) : null;
      this.pickT = sim.tick;
    }
    return this.pick;
  }
}

// ---------------------------------------------------------------- scripted test driver
const specRange = (s) => s.range || s.dist || s.r || 0;
class Driver {
  constructor(slot, seed) {
    this.slot = slot;
    this.rng = new A.RNG(seed);
    this.side = 1;
    this.sideT = 0;
    this.lx = 0; this.ly = 0; this.stuckT = 0; this.wanderT = 0; this.wanderA = 0;
    this.fd = { x: 0, y: 0, d: 0 };
  }

  word(sim, nav) {
    const b = sim.brawlers[this.slot], m = sim.map, rng = this.rng, team = b.team;
    if (!b.alive) return A.IN_IDLE;
    const kit = b.kit, atk = kit.atk, R = specRange(atk), hpF = b.hp / b.maxHp;
    // nearest enemy brawler my team can see
    let e = null, ed = Infinity;
    for (const o of sim.brawlers) {
      if (!o.alive || o.team === team || !((o.vis >> team) & 1)) continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y);
      if (d < ed) { ed = d; e = o; }
    }
    const gem = sim.modeKey === 'gem', sd = sim.nTeams > 2;
    // ---- where to go
    let field = null, mvA = 0, mvM = 1, combat = false;
    const P = sim.poison;
    if (P && (b.x < P.x0 + 1 || b.x > P.x1 - 1 || b.y < P.y0 + 1 || b.y > P.y1 - 1)) field = nav.center;
    else if (gem && b.carry > 0 && (sim.ms.countTeam === team || hpF < 0.45)) field = nav.home[team];
    else if (hpF < 0.3 && nav.home) field = nav.home[team];
    else if (gem && sim.ms.countTeam === 1 - team) field = nav.enemyField(team);
    else {
      const pf = (gem || sd) ? nav.pickField() : null;
      const pd = pf ? A.flowDir(m, pf, b.x, b.y, this.fd).d : Infinity;
      if (pd < (sd ? 9 : 7) && !(e && ed < 3)) field = pf;
      else if (e && ed < R * 1.3 + 1) combat = true;
      else if (sd && nav.boxes && sim.t < 60) field = nav.boxes; // loot first, as players do
      else field = gem ? nav.mine : nav.enemyField(team);
    }
    if (combat) {
      const toE = Math.atan2(e.y - b.y, e.x - b.x);
      const want = R < 3.5 ? 0 : R * 0.65;
      this.sideT -= SIM_DT;
      if (this.sideT <= 0) { this.side = rng.chance(0.5) ? 1 : -1; this.sideT = rng.range(0.4, 1.4); }
      if (ed > want + 1) field = nav.enemyField(team);
      else if (ed < want - 1.5) mvA = toE + Math.PI + this.side * 0.6;
      else mvA = toE + this.side * Math.PI / 2;
    }
    if (field) {
      A.flowDir(m, field, b.x, b.y, this.fd);
      if (this.fd.x || this.fd.y) mvA = Math.atan2(this.fd.y, this.fd.x);
      else if (!combat) mvM = 0;
      if (field === nav.pick && this.fd.d < 2) {
        // the flow field ends at the pickup's tile: step onto the pickup itself
        let best = null, bd = Infinity;
        for (const p of sim.pickups) { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = p; } }
        if (best && bd < 2.5) { mvA = Math.atan2(best.y - b.y, best.x - b.x); mvM = 1; }
      }
    }
    // unstick: a random walk when the stick pushes but nothing moves
    if (this.wanderT > 0) { this.wanderT -= SIM_DT; mvA = this.wanderA; mvM = 1; }
    else if (mvM > 0 && b.dashT <= 0 && b.stunT <= 0) {
      this.stuckT += SIM_DT;
      if (this.stuckT >= 1) {
        if (Math.hypot(b.x - this.lx, b.y - this.ly) < 0.3) { this.wanderT = 0.6; this.wanderA = rng.range(0, Math.PI * 2); }
        this.stuckT = 0; this.lx = b.x; this.ly = b.y;
      }
    }
    // ---- what to fire
    let act = ACT.NONE, aimA = e ? Math.atan2(e.y - b.y, e.x - b.x) + rng.range(-0.06, 0.06) : b.face, aimD = 1, auto = 0;
    const dep = sim.deployOf(b.slot);
    let boxD = Infinity;
    if (sd) for (const t of nav.boxList) boxD = Math.min(boxD, Math.hypot(t.x - b.x, t.y - b.y));
    if (e && ed > R + 1 && boxD <= R && b.ammo >= 1 && rng.chance(0.2)) {
      act = ACT.ATTACK; auto = 1; // no enemy in reach: auto-aim falls back to the nearest power-cube box
    } else if (e) {
      const sup = kit.sup, gad = kit.gad;
      const sw = b.supReady ? this.wantSuper(b, sup, ed) : null;
      const gw = gad && b.gadLeft > 0 && b.gadT <= 0 && rng.chance(0.2) ? this.wantGadget(b, gad, e, ed, dep, sim) : null;
      if (sw) {
        act = ACT.SUPER;
        if (sw === 'away') aimA += Math.PI;
        aimD = sw === 'away' ? 1 : Math.min(1, ed / Math.max(1, specRange(sup)));
        auto = sw !== 'away' && rng.chance(0.2) ? 1 : 0;
      } else if (gw) {
        act = ACT.GADGET;
        aimD = Math.min(1, ed / Math.max(1, specRange(gad)));
      } else if (b.ammo >= 1 && ed <= R + 0.2 && (atk.t === 'lob' || A.shotClear(m, b.x, b.y, e.x, e.y)) && rng.chance(0.3)) {
        act = ACT.ATTACK;
        aimD = Math.min(1, ed / Math.max(1, R));
        auto = rng.chance(0.15) ? 1 : 0;
      }
    } else if (boxD <= R && b.ammo >= 1 && rng.chance(0.2)) {
      act = ACT.ATTACK; auto = 1;
    } else if (b.gadLeft > 0 && b.gadT <= 0 && kit.gad && kit.gad.t === 'heal' && hpF < 0.5) act = ACT.GADGET;
    return A.packIn(mvA, mvM, aimA, aimD, act, auto);
  }

  wantSuper(b, s, ed) {
    switch (s.t) {
      case 'leap': return s.away ? (ed < 4.5 ? 'away' : null) : ed <= s.range + 0.5 ? 'at' : null;
      case 'buff': return ed < 8 ? 'self' : null;
      case 'deploy': return ed < 9 ? 'at' : null;
      case 'pulse': return ed < s.r + 0.3 ? 'self' : null;
      default: return ed <= specRange(s) + 0.3 ? 'at' : null;
    }
  }

  wantGadget(b, g, e, ed, dep, sim) {
    if (g.req === 'deploy' && !dep) return null;
    const R = specRange(b.kit.atk);
    switch (g.t) {
      case 'heal': return b.hp < b.maxHp * 0.65 ? 'self' : null;
      case 'pulse': {
        if (g.heal) {
          if (b.hp < b.maxHp * 0.7) return 'self';
          for (const o of sim.brawlers) if (o !== b && o.alive && o.team === b.team && o.hp < o.maxHp * 0.7 && Math.hypot(o.x - b.x, o.y - b.y) < g.r) return 'self';
          return null;
        }
        return ed < g.r + 0.2 ? 'self' : null;
      }
      case 'dash': return ed < 6 ? 'at' : null;
      case 'buff':
        switch (g.what) {
          case 'ammo': return b.ammo < 1 ? 'self' : null;
          case 'shield': return ed < 4 ? 'self' : null;
          case 'speed': return ed < 7 ? 'self' : null;
          case 'nextStun': case 'nextSlow': return ed < R + 1 ? 'self' : null;
          default: return ed < 8 ? 'self' : null; // petStun, deployRate
        }
      default: return ed < 6 ? 'at' : null;
    }
  }
}

// ---------------------------------------------------------------- match runner
const statTotals = { stepNs: { 6: 0n, 10: 0n }, steps: { 6: 0, 10: 0 }, maxNs: { 6: 0n, 10: 0n } };
function runMatch(cfg, opt) {
  opt = opt || {};
  const sim = new Sim(cfg);
  const nav = new Nav(sim);
  const n = cfg.slots.length;
  const drivers = cfg.slots.map((s, i) => new Driver(i, (Math.imul(cfg.seed, 7919) + i * 104729) >>> 0));
  const rec = opt.record ? [] : null;
  const replay = opt.replay || null;
  const label = opt.label || `${cfg.mode}#${cfg.seed}`;
  const maxTicks = opt.maxTicks || Math.round(330 / SIM_DT);
  const st = { fired: new Array(n * 4).fill(0), walls: 0, boxes: 0, gemDrops: 0, cubePicks: 0, poisonHits: 0, countdowns: 0, kills: 0, events: 0 };
  let stepNs = 0n, maxNs = 0n, k = 0;
  const tiles0 = sim.tiles0;
  while (!sim.over && sim.tick < maxTicks) {
    for (let i = 0; i < n; i++) {
      const w = replay ? replay[k++] : drivers[i].word(sim, nav);
      sim.setInput(i, w);
      if (rec) rec.push(w);
    }
    const t0 = process.hrtime.bigint();
    sim.step();
    const dt = process.hrtime.bigint() - t0;
    stepNs += dt;
    if (dt > maxNs) maxNs = dt;
    let tilesChanged = false;
    for (const e of sim.events) {
      st.events++;
      switch (e[0]) {
        case EV.FIRE: st.fired[e[1] * 4 + e[2]]++; break;
        case EV.TILE: tilesChanged = true; if (tiles0[e[1]] === TILE.WALL) st.walls++; else if (tiles0[e[1]] === TILE.BOX) st.boxes++; break;
        case EV.DROP: if (e[1] === PICK.GEM) st.gemDrops += e[2]; break;
        case EV.PICKUP: if (e[2] === PICK.CUBE) st.cubePicks++; break;
        case EV.HIT: if (e[5] === -1) st.poisonHits++; break;
        case EV.COUNTDOWN: st.countdowns++; break;
        case EV.KILL: st.kills++; break;
        default: break;
      }
    }
    sim.events.length = 0;
    if (tilesChanged) nav.tilesChanged();
    if (sim.tick % 15 === 0 || sim.over) validate(sim, label);
  }
  check(sim.over, `${label}: match did not end within ${maxTicks} ticks`);
  const bucket = n >= 10 ? 10 : 6;
  if (!replay) { statTotals.stepNs[bucket] += stepNs; statTotals.steps[bucket] += sim.tick; if (maxNs > statTotals.maxNs[bucket]) statTotals.maxNs[bucket] = maxNs; }
  return { sim, st, rec, hash: stateHash(sim), msPerStep: Number(stepNs) / 1e6 / Math.max(1, sim.tick) };
}

// ---------------------------------------------------------------- 1. targeted checks
function unitTests() {
  section('Targeted checks');
  const DT = SIM_DT;

  // -- auto-aim: nearest visible enemy within range + 1; bushes hide; out of range = facing
  {
    const sim = mkSim('test', 'crystal_cove', ['dax', 'nova']);
    const m = sim.map, [s, e] = sim.brawlers;
    unshield(s); unshield(e);
    const bush = tiles(m, (t) => t === TILE.BUSH);
    let spot = null, bt = null;
    for (const b of bush) {
      // a bush tile fully inside a bush patch, a free spot 4-6 tiles away
      if (!(A.flagsAt(m, b.x - 0.5, b.y) & A.TF_BUSH) || !(A.flagsAt(m, b.x + 0.5, b.y) & A.TF_BUSH)) continue;
      const f = tiles(m, (t, x, y) => t === TILE.FLOOR && Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y) > 4 && Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y) < 6);
      if (f.length) { spot = f[0]; bt = b; break; }
    }
    check(spot, 'auto-aim: found a bush and a spot near it');
    if (spot) {
      place(sim, s, spot.x, spot.y);
      place(sim, e, bt.x, bt.y);
      e.revealT = 0;
      sim.updateVision();
      check(((e.vis >> 0) & 1) === 0 && e.inBush, 'bush hides a brawler from enemies further than REVEAL_R');
      s.face = 0.5; s.faceT = 0;
      ready(s);
      let ev = stepN(sim, 1, [A.packIn(0, 0, 0, 0, ACT.ATTACK, 1), 0]);
      let f = evs(ev, EV.FIRE)[0];
      check(f && Math.abs(f[5] - 0.5) < 1e-9, `auto-aim ignores a hidden enemy and fires the way it faces (ang ${f && f[5]})`);
      // walking within REVEAL_R reveals the bush
      place(sim, s, bt.x + (spot.x > bt.x ? 1 : -1) * (A.REVEAL_R - 0.4), bt.y);
      e.revealT = 0;
      sim.updateVision();
      if (free(m, s.x, s.y)) check((e.vis & 1) === 1, 'an enemy within REVEAL_R sees into the bush');
      // open ground: aims straight at it
      const open = tiles(m, (t, x, y) => t === TILE.FLOOR && Math.hypot(x + 0.5 - spot.x, y + 0.5 - spot.y) > 5 && Math.hypot(x + 0.5 - spot.x, y + 0.5 - spot.y) < 7)[0];
      place(sim, s, spot.x, spot.y);
      place(sim, e, open.x, open.y);
      ready(s);
      ev = stepN(sim, 1, [A.packIn(0, 0, 0, 0, ACT.ATTACK, 1), 0]);
      f = evs(ev, EV.FIRE)[0];
      const want = Math.atan2(open.y - spot.y, open.x - spot.x);
      check(f && angErr(f[5], want) < 1e-6, 'auto-aim aims at the nearest visible enemy');
      // further than range + 1: no target
      const reach = s.kit.atk.range + 1; // range + 1 (the star power lengthens it)
      const far = tiles(m, (t, x, y) => t === TILE.FLOOR && Math.hypot(x + 0.5 - spot.x, y + 0.5 - spot.y) > reach + 0.3)[0];
      place(sim, e, far.x, far.y);
      ready(s); s.face = -2; s.faceT = 0;
      stepN(sim, 6, [0, 0]);
      ready(s); s.face = -2; s.faceT = 0;
      ev = stepN(sim, 1, [A.packIn(0, 0, 0, 0, ACT.ATTACK, 1), 0]);
      f = evs(ev, EV.FIRE)[0];
      check(f && Math.abs(f[5] + 2) < 1e-9, `auto-aim ignores enemies beyond range + 1 tile (${JSON.stringify(f)} s ${s.x},${s.y} e ${e.x},${e.y} alive ${e.alive})`);
    }
  }

  // -- spawn shield, reload, regen, actions as edges
  {
    const sim = mkSim('test', 'crystal_cove', ['nova', 'dax']);
    const [a, b] = sim.brawlers;
    check(sim.hurt(a, 1000, 1, 1, 0, 0) === 0 && a.hp === a.maxHp, 'spawn shield blocks damage');
    stepN(sim, Math.ceil((A.SPAWN_SHIELD_T + 0.05) / DT));
    check(sim.hurt(a, 1000, 1, 1, 0, 0) === 1000, 'spawn shield ends after SPAWN_SHIELD_T');
    // reload: 1 bar per `reload` seconds
    a.ammo = 0;
    stepN(sim, Math.round(a.reload / DT));
    check(Math.abs(a.ammo - 1) < 0.05, `reload: one bar per ${a.reload}s (got ${a.ammo.toFixed(3)})`);
    // regen: nothing for REGEN_DELAY s after a hit, then REGEN_RATE x max per second
    a.hp = Math.round(a.maxHp * 0.4);
    sim.hurt(a, 1, 1, 1, 0, 0);
    const h0 = a.hp;
    stepN(sim, Math.round((A.REGEN_DELAY - 0.2) / DT));
    check(a.hp === h0, 'regen waits REGEN_DELAY after being hit');
    stepN(sim, Math.round(2.3 / DT));
    const got = a.hp - h0, want = Math.round(a.maxHp * A.REGEN_RATE) * 3;
    check(Math.abs(got - want) <= 2, `regen: ${got} healed in ~2 s of regen, want ${want}`);
    // an action word left in place fires once (edge)
    ready(b); unshield(b);
    const w = A.packIn(0, 0, 0, 1, ACT.ATTACK, 0);
    sim.setInput(1, w);
    const ev = stepN(sim, 20);
    check(evs(ev, EV.FIRE).filter((e) => e[1] === 1).length === 1, 'an action is an edge: it fires once per word set');
    // no ammo: ignored
    b.ammo = 0.5; b.atkCd = 0; b.bqN = 0;
    const ev2 = stepN(sim, 1, [0, w]);
    check(evs(ev2, EV.FIRE).length === 0, 'attack without a full ammo bar is ignored');
  }

  // -- straight shots stop at walls; lobs fly over them and land on the aim point
  {
    const sim = mkSim('test', 'crystal_cove', ['dax', 'pip']);
    const m = sim.map, [d, p] = sim.brawlers;
    unshield(d); unshield(p);
    // a wall with free floor 2 tiles below and above it
    const w = tiles(m, (t, x, y) => t === TILE.WALL && x >= 3 && x < m.w - 3 && free(m, x + 0.5, y + 2.5) && free(m, x + 0.5, y + 1.5) &&
      free(m, x + 0.5, y - 1.5) && A.tileAt(m, x + 0.5, y - 0.5) === TILE.FLOOR)[0];
    check(w, 'found a wall to shoot at');
    if (w) {
      place(sim, d, w.x, w.y + 2);
      ready(d);
      let ev = stepN(sim, 30, (i, k) => (i === 0 && k === 0 ? A.packIn(0, 0, -Math.PI / 2, 1, ACT.ATTACK, 0) : 0));
      const ends = evs(ev, EV.SHOT_END);
      check(ends.length >= 6 && ends.every((e) => e[4] === 1 && e[3] > w.y - 0.6), `dax bullets stop at the wall (${ends.length} ends)`);
      check(m.tiles[w.ti] === TILE.WALL, 'main attacks do not break walls');
      // pip lobs over the wall onto a spot 3 tiles away
      place(sim, p, w.x, w.y + 2);
      ready(p);
      const pip = p.kit.atk, aimD = 3.5 / pip.range, qD = Math.round(aimD * 63) / 63, t0 = sim.t; // aim distance has 6 bits
      let lend = [], landAt = -1;
      for (let k = 0; k < 45; k++) {
        const e1 = stepN(sim, 1, [0, k === 0 ? A.packIn(0, 0, -Math.PI / 2, aimD, ACT.ATTACK, 0) : 0]);
        const ends = evs(e1, EV.SHOT_END);
        if (ends.length && landAt < 0) landAt = sim.t - t0;
        lend = lend.concat(ends);
      }
      check(lend.length === 2 && lend.every((e) => e[4] === 0 && Math.abs(e[3] - (w.y + 2 - qD * pip.range)) < 1e-6), `pip bombs fly over the wall and land on the aim point ${JSON.stringify(lend)} wall ${w.x},${w.y}`);
      const landT = Math.max(pip.fuse || 0, pip.T * (0.6 + 0.4 * qD)); // a fuse burst waits for the fuse
      check(Math.abs(landAt - landT) < 2 * DT, `lobs burst after their flight time or fuse (${landAt.toFixed(3)} s, want ${landT.toFixed(3)} s)`);
      // nova super breaks the wall
      const sim2 = mkSim('test', 'crystal_cove', ['nova', 'dax']);
      const nv = sim2.brawlers[0];
      place(sim2, nv, w.x, w.y + 2);
      nv.sup = 1; nv.supReady = true; unshield(nv);
      ev = stepN(sim2, 30, (i, k) => (i === 0 && k === 0 ? A.packIn(0, 0, -Math.PI / 2, 1, ACT.SUPER, 0) : 0));
      check(evs(ev, EV.TILE).some((e) => e[1] === w.ti && e[2] === TILE.FLOOR) && sim2.map.tiles[w.ti] === TILE.FLOOR, 'nova super breaks the wall (EV.TILE)');
      check(!nv.supReady && nv.sup === 0, 'using the super empties it');
    }
  }

  // -- invisibility: hidden beyond 1.6 tiles, attacking ends it
  {
    const sim = mkSim('test', 'crystal_cove', ['specter', 'nova']);
    const m = sim.map, [s, n] = sim.brawlers;
    const open = tiles(m, (t, x, y) => t === TILE.FLOOR && free(m, x + 3.5, y + 0.5) && free(m, x + 1.5, y + 0.5) && A.tileAt(m, x + 0.5, y + 0.5) === TILE.FLOOR && !(A.flagsAt(m, x + 3.5, y + 0.5) & A.TF_BUSH))[5];
    place(sim, s, open.x, open.y);
    place(sim, n, open.x + 4.6, open.y);
    s.sup = 1; s.supReady = true;
    stepN(sim, 2, (i, k) => (i === 0 && k === 0 ? A.packIn(0, 0, 0, 1, ACT.SUPER, 0) : 0));
    check(s.invisT > 0 && ((s.vis >> 1) & 1) === 0, 'invisible brawler is hidden from an enemy 4.6 tiles away');
    place(sim, n, open.x + 3, open.y);
    check(((s.vis >> 1) & 1) === 1, 'an enemy within 4 tiles sees an invisible brawler');
    ready(s); unshield(s);
    stepN(sim, 1, [A.packIn(0, 0, 0, 1, ACT.ATTACK, 0), 0]);
    check(s.invisT === 0, 'attacking ends invisibility');
  }

  // -- the arc (melee swipe) primitive, with knockback, on a test brawler
  {
    A.BRAWLERS.zz_arc = Object.assign({}, A.BRAWLERS.brick, {
      name: 'Arc Test', atk: { name: 'Swipe', text: '', t: 'arc', range: 2, half: 0.6, dmg: 1000, kb: 1.5, chg: 0.25 },
    });
    const sim = mkSim('test', 'crystal_cove', ['zz_arc', 'nova'], { lvl: 1, star: -1 });
    const m = sim.map, [a, n] = sim.brawlers;
    const open = tiles(m, (t, x, y) => t === TILE.FLOOR && free(m, x + 4.5, y + 0.5) && free(m, x + 2.5, y + 0.5) && free(m, x + 1.5, y + 0.5) && free(m, x + 3.5, y + 0.5))[3];
    place(sim, a, open.x, open.y);
    place(sim, n, open.x + 1.5, open.y);
    unshield(n); ready(a);
    const hp0 = n.hp;
    const ev = stepN(sim, 1, [A.packIn(0, 0, 0, 1, ACT.ATTACK, 0), 0]);
    check(evs(ev, EV.HIT).some((e) => e[1] === n.id && e[2] === 1000) && n.hp === hp0 - 1000, 'arc swipe hits an enemy in front');
    check(n.kbT > 0 && Math.abs(a.sup - 0.25) < 1e-9, 'arc swipe knocks back and charges the super');
    place(sim, n, open.x - 1.5, open.y);
    ready(a);
    const ev2 = stepN(sim, 1, [A.packIn(0, 0, 0, 1, ACT.ATTACK, 0), 0]);
    check(!evs(ev2, EV.HIT).length, 'arc swipe misses an enemy behind');
    delete A.BRAWLERS.zz_arc;
  }

  // -- Gem Rush: countdown rules, carrier death on the last tick, safety cap
  {
    const sim = mkSim('gem', 'crystal_cove', ['nova', 'dax', 'brick', 'pip', 'zip', 'frost'], { seed: 5 });
    const ms = sim.ms;
    let ev = stepN(sim, Math.round(2.2 / DT));
    check(sim.pickups.length === 1 && sim.pickups[0].pick === PICK.GEM, 'the mine pops a gem shortly after the start');
    const g = sim.pickups[0], mine = sim.map.mine;
    const gd = Math.hypot(g.x - mine.x, g.y - mine.y);
    check(gd > 1 && gd < 2.3 && free(sim.map, g.x, g.y), `the gem pops out to a free spot near the mine (${gd.toFixed(2)})`);
    ev = stepN(sim, Math.round(7 / DT));
    check(sim.pickups.length === 2, 'another gem 7 s later');
    const [a0, a1] = sim.brawlers;
    a0.carry = 6; a1.carry = 4;
    ev = stepN(sim, 1);
    check(ms.countTeam === 0 && evs(ev, EV.COUNTDOWN).some((e) => e[1] === 0 && e[2] === 15), 'a team with 10 gems and the lead starts the countdown');
    const h = sim.hud();
    check(h.mode === 'gem' && h.gems[0] === 10 && h.count === 15 && h.countTeam === 0, 'gem hud: ' + JSON.stringify(h));
    sim.brawlers[3].carry = 10;
    ev = stepN(sim, 1);
    check(ms.countTeam === -1 && evs(ev, EV.COUNTDOWN).some((e) => e[1] === -1), 'a tie stops the countdown');
    sim.brawlers[3].carry = 0;
    stepN(sim, Math.round(14.9 / DT) - 1);
    check(!sim.over && ms.countTeam === 0 && ms.count > 0 && ms.count < 0.2, `countdown runs (left ${ms.count.toFixed(3)})`);
    // the carrier falls on the tick the countdown would end: no win, gems drop
    while (ms.count > SIM_DT + 1e-9) stepN(sim, 1);
    a0.hp = 0;
    ev = stepN(sim, 1);
    check(!sim.over && ms.countTeam === -1, `a carrier falling on the last tick stops the countdown (over ${sim.over} ${JSON.stringify(sim.result && sim.result.reason)} team ${ms.countTeam} count ${ms.count} gems ${ms.gems})`);
    const drop = evs(ev, EV.DROP)[0];
    check(drop && drop[1] === PICK.GEM && drop[2] === 6 && a0.carry === 0, 'dying drops every carried gem (EV.DROP)');
    // win: hold 10+ for 15 s
    a1.carry = 10;
    ev = stepN(sim, Math.round(15.2 / DT));
    check(sim.over && sim.result.winner === 0 && sim.result.reason === 'gems' && evs(ev, EV.END).length === 1, 'holding 10+ gems for 15 s wins');
    const r = sim.result;
    check(r && r.stats.length === 6 && r.score[0] >= 10 && sim.brawlers[r.mvp].team === 0 && r.rank.length === 6, 'result has stats, score, rank and an MVP from the winners');
    // the 3:30 clock: nobody moves -> 3:30 -> equal gems, a draw on time
    const idle = mkSim('gem', 'crystal_cove', ['nova', 'dax', 'brick', 'pip', 'zip', 'frost'], { seed: 6 });
    check(Math.abs(idle.hud().time - 210) < 0.05, 'Gem Rush shows a 3:30 clock');
    stepN(idle, Math.round(211 / DT));
    check(idle.over && idle.result.reason === 'time' && idle.result.winner === -1 && Math.abs(idle.t - 210) < 0.05, `the 3:30 clock ends an idle match in a draw (t=${idle.t.toFixed(2)})`);
    // never more than 29 gems in play: a team carrying 28 gets one more, then the mine waits
    const cap = mkSim('gem', 'crystal_cove', ['nova', 'dax', 'brick', 'pip', 'zip', 'frost'], { seed: 7 });
    cap.brawlers[0].carry = 14; cap.brawlers[3].carry = 14;
    stepN(cap, Math.round(30 / DT));
    const inPlay = cap.brawlers.reduce((n, o) => n + o.carry, 0) + cap.pickups.filter((q) => !q.dead && q.pick === PICK.GEM).reduce((n, q) => n + q.n, 0);
    check(inPlay === 29, `the mine stops at 29 gems in play (${inPlay})`);
  }

  // -- Showdown support: boxes drop cubes, cubes add health and damage, poison hurts
  {
    const bks = ['nova', 'dax', 'brick', 'pip', 'zip', 'frost', 'volt', 'hawk', 'shade', 'thorn'];
    const sim = mkSim('zz_sd', 'zz_test_sd', bks, { teams: bks.map((_, i) => i) });
    const m = sim.map, b = sim.brawlers[0];
    check(sim.nTeams === 10 && sim.hasBox, 'free-for-all with 10 teams and boxes');
    const box = tiles(m, (t) => t === TILE.BOX)[0];
    check(sim.boxMax === 4500 + 400 * 8 && sim.boxHp[box.ti] === sim.boxMax, `boxes have 4500 health plus 400 per average power level above 1 (${sim.boxMax} at power 9)`);
    sim.hurtBox(box.ti, 1000, 0, 1);
    check(sim.boxHp[box.ti] === sim.boxMax - 1000, 'boxes take damage');
    sim.hurtBox(box.ti, sim.boxMax, 0, 1);
    let ev = drain(sim);
    check(m.tiles[box.ti] === TILE.FLOOR && evs(ev, EV.TILE).length === 1 && sim.pickups.some((p) => p.pick === PICK.CUBE), 'a destroyed box turns to floor and drops a power cube');
    const hp0 = b.maxHp, mul0 = sim.dmgMul(b);
    place(sim, b, box.x, box.y);
    ev = stepN(sim, 15);
    check(b.cubes === 1 && b.maxHp === hp0 + A.CUBE_HP && Math.abs(sim.dmgMul(b) - mul0 * (1 + A.CUBE_DMG)) < 1e-9, 'a power cube adds CUBE_HP and CUBE_DMG');
    check(evs(ev, EV.PICKUP).some((e) => e[1] === 0 && e[2] === PICK.CUBE), 'EV.PICKUP for the cube');
    // poison: after its start, standing outside the safe zone hurts (everyone waits in the middle)
    for (const o of sim.brawlers) place(sim, o, m.w / 2 + 2.5, m.h / 2 + 0.5);
    stepN(sim, Math.round(60 / DT));
    check(sim.poison && sim.poison.k > 0 && b.alive, 'poison closes in');
    place(sim, b, 1.5, 1.5);
    b.hp = b.maxHp;
    const ph = b.hp;
    unshield(b);
    ev = stepN(sim, 31);
    check(b.hp < ph, 'poison hurts outside the safe zone');
    check(evs(ev, EV.HIT).some((e) => e[1] === b.id && e[5] === -1), `poison damage has source -1 (${JSON.stringify(evs(ev, EV.HIT).slice(0, 3))} b ${b.id} alive ${b.alive} hp ${ph}->${b.hp} poison ${JSON.stringify(sim.poison)} t ${sim.t})`);
  }

  // -- Knockout support: resetRound restores tiles and puts everyone back
  {
    const sim = mkSim('test', 'crystal_cove', ['nova', 'dax', 'brick', 'pip', 'zip', 'frost']);
    const m = sim.map;
    const w = tiles(m, (t) => t === TILE.WALL)[0];
    sim.breakTile(w.ti, 0, 2);
    drain(sim);
    const b = sim.brawlers[0];
    stepN(sim, 20, (i) => (i === 0 ? A.packIn(0, 1, 0, 0, ACT.ATTACK, 1) : 0));
    b.hp = 0; stepN(sim, 1);
    check(!b.alive, 'brawler down before the reset');
    sim.resetRound({ tiles: true });
    const ev = drain(sim);
    check(m.tiles[w.ti] === TILE.WALL && evs(ev, EV.TILE).some((e) => e[1] === w.ti && e[2] === TILE.WALL), 'resetRound({tiles}) restores broken walls');
    check(sim.brawlers.every((o) => o.alive && o.hp === o.maxHp) && sim.shots.length === 0, 'resetRound respawns everyone at full health');
    check(evs(ev, EV.RESPAWN).length === 6 && sim.roundT0 === sim.t, 'resetRound emits respawns and restarts the round clock');
  }

  // -- Blast Ball support: pick up, carry, kick, wall bounce
  {
    const sim = mkSim('test', 'crystal_cove', ['nova', 'dax']);
    const m = sim.map, b = sim.brawlers[0];
    const open = tiles(m, (t, x, y) => t === TILE.FLOOR && y > 18 && free(m, x + 3.5, y + 0.5) && free(m, x + 1.5, y + 0.5))[0];
    place(sim, b, open.x, open.y);
    const ball = sim.addBall(open.x + 0.3, open.y);
    sim.stepBall();
    check(ball.holder === 0, 'touching the ball picks it up');
    sim.stepBall();
    check(Math.hypot(ball.x - b.x, ball.y - b.y) < 0.6, 'the holder carries the ball');
    sim.kickBall(b, 0, 9, 0, 2);
    for (let k = 0; k < 60; k++) { sim.step(); sim.stepBall(); }
    check(ball.holder !== 0 && Math.hypot(ball.x - open.x, ball.y - open.y) > 1.5 && free(m, ball.x, ball.y) && !badNum(ball), `a kick sends the ball away (${ball.x.toFixed(2)},${ball.y.toFixed(2)})`);
  }

  // -- data sanity: every brawler builds a kit, every primitive and buff is known
  {
    const prims = new Set(['shot', 'lob', 'beam', 'arc', 'dash', 'leap', 'deploy', 'area', 'pulse', 'heal', 'buff']);
    const buffs = new Set(['shield', 'speed', 'invis', 'ammo', 'nextStun', 'nextSlow', 'petStun', 'deployRate', 'unitShield', 'block', 'nextAtk']);
    const walk = (s, where) => {
      check(prims.has(s.t), `${where}: primitive ${s.t}`);
      if (s.t === 'buff') check(buffs.has(s.what), `${where}: buff ${s.what}`);
      for (const x of s.then || []) walk(x, where + '.then');
    };
    check(KEYS.length === 15 && KEYS.every((k) => A.BRAWLERS[k]), '15 roster entries');
    for (const k of KEYS) {
      const D = A.BRAWLERS[k];
      for (const f of ['name', 'rarity', 'role', 'desc', 'hp', 'speed', 'reload']) check(D[f] != null, `${k}.${f}`);
      // the original's speeds since September 2026 (normal, fast, very fast) and its health / reload spans
      check([750, 800, 855].includes(D.speed) && D.hp >= 2400 && D.hp <= 7000 && D.reload >= 0.7 && D.reload <= 2.5, `${k}: stats in range`);
      check(D.atk.text && D.sup.text && D.gadgets[0].text && D.stars[0].text, `${k}: UI texts`);
      check(D.atk.chg > 0 || (D.atk.split && D.atk.split.chg > 0), `${k}: main attack charges the super`);
      walk(D.atk, k + '.atk'); walk(D.sup, k + '.sup'); walk(D.gadgets[0], k + '.gad');
      check(D.gadgets[0].cd > 0, `${k}: gadget cooldown`);
      for (const star of [-1, 0]) {
        const kit = A.brawlerKit(k, star, 0);
        check(kit.atk.t && kit.sup.t && kit.gad && kit.speed > 2 && kit.speed < 3, `${k}: kit with star ${star}`);
      }
    }
  }
}

// ---------------------------------------------------------------- 2. matches
const agg = {};
for (const k of KEYS) agg[k] = { games: 0, wins: 0, draws: 0, dmg: 0, kills: 0, deaths: 0, heal: 0, gems: 0, fired: [0, 0, 0, 0], eff: [0, 0, 0, 0], dmgA: [0, 0, 0, 0], sdGames: 0, sdPlace: 0 };
const modeAgg = { gem: { n: 0, byGems: 0, byTime: 0, draws: 0, t: 0, wins: [0, 0] }, test: { n: 0, t: 0, wins: [0, 0], draws: 0 }, zz_sd: { n: 0, t: 0, last: 0 } };
const world = { walls: 0, boxes: 0, gemDrops: 0, cubePicks: 0, poisonHits: 0, countdowns: 0 };

function account(cfg, res) {
  const { sim, st } = res, r = sim.result;
  for (let i = 0; i < cfg.slots.length; i++) {
    const s = cfg.slots[i], a = agg[s.bk], b = sim.brawlers[i];
    if (!a) continue;
    for (let act = 1; act <= 3; act++) { a.fired[act] += st.fired[i * 4 + act]; a.eff[act] += sim.fxn[i * 4 + act]; a.dmgA[act] += sim.dmgBy[i * 4 + act]; }
    a.dmg += b.st.dmg; a.kills += b.st.kills; a.deaths += b.st.deaths; a.heal += b.st.heal; a.gems += b.st.gems;
    if (cfg.mode === 'zz_sd') { a.sdGames++; a.sdPlace += r ? r.rank.indexOf(i) + 1 : 10; continue; }
    a.games++;
    if (!r || r.winner < 0) a.draws++; else if (r.winner === s.team) a.wins++;
  }
  for (const k in world) world[k] += st[k];
  const ma = modeAgg[cfg.mode];
  ma.n++; ma.t += sim.t;
  if (cfg.mode === 'gem') { if (r.reason === 'gems') ma.byGems++; else ma.byTime++; }
  if (cfg.mode === 'zz_sd') { if (r.reason === 'last') ma.last++; }
  else if (r.winner < 0) ma.draws++; else ma.wins[r.winner]++;
}

function lineup(i, offs) { return offs.map((o) => KEYS[(i + o) % KEYS.length]); }
function cfg3v3(mode, i, seed, offs, star, gadget) {
  const bks = lineup(i, offs);
  return { mode, map: 'crystal_cove', seed, slots: bks.map((bk, j) => ({ team: j < 3 ? 0 : 1, bk, lvl: 9 + (j % 3), gadget: gadget || 0, star, name: bk })) };
}

function matches() {
  section('Matches');
  const N = QUICK ? 5 : KEYS.length;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const c = cfg3v3('gem', QUICK ? i * 3 : i, 1000 + i, [0, 1, 2, 3, 4, 5], 0);
    const res = runMatch(c);
    account(c, res);
    if (VERBOSE) console.log(`  gem #${c.seed} ${c.slots.map((s) => s.bk).join(',')}: ${res.sim.result.reason} winner ${res.sim.result.winner} at ${res.sim.t.toFixed(0)}s gems ${res.sim.ms.gems}`);
  }
  for (let i = 0; i < N; i++) {
    // the test matches also play everyone's second gadget and star power (where they have one)
    const c = cfg3v3('test', QUICK ? i * 3 : i, 2000 + i, [0, 4, 8, 1, 6, 11], i % 3 === 2 ? -1 : 1, 1);
    for (const sl of c.slots) { if (sl.gadget >= A.BRAWLERS[sl.bk].gadgets.length) sl.gadget = 0; if (sl.star >= A.BRAWLERS[sl.bk].stars.length) sl.star = 0; }
    const res = runMatch(c);
    account(c, res);
    if (VERBOSE) console.log(`  test #${c.seed}: winner ${res.sim.result.winner} kills ${res.sim.ms.kills}`);
  }
  const SDN = QUICK ? 1 : 3;
  for (let i = 0; i < SDN; i++) {
    const bks = [];
    for (let j = 0; j < 10; j++) bks.push(KEYS[(i * 5 + j) % KEYS.length]);
    const c = { mode: 'zz_sd', map: 'zz_test_sd', seed: 3000 + i, slots: bks.map((bk, j) => ({ team: j, bk, lvl: 10, gadget: 0, star: 0 })) };
    const res = runMatch(c, { maxTicks: Math.round(230 / SIM_DT) });
    account(c, res);
    if (VERBOSE) console.log(`  sd #${c.seed}: ${res.sim.result.reason}, 1st ${bks[res.sim.result.rank[0]]} at ${res.sim.t.toFixed(0)}s`);
  }
  console.log(`  ${2 * N + SDN} matches in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ---------------------------------------------------------------- 3. determinism
function determinism() {
  section('Determinism');
  const c = cfg3v3('gem', 3, 777, [0, 1, 2, 3, 4, 5], 0);
  const a = runMatch(c, { record: true, label: 'det-a' });
  const b = runMatch(c, { label: 'det-b' });
  const r = runMatch(c, { replay: a.rec, label: 'det-replay' });
  const d = runMatch(Object.assign({}, c, { seed: 778 }), { label: 'det-c' });
  check(a.hash === b.hash, `same seed, same final state (${a.hash} vs ${b.hash})`);
  check(a.hash === r.hash, `replaying the recorded inputs gives the same final state (${a.hash} vs ${r.hash})`);
  check(a.hash !== d.hash, `a different seed gives a different final state (${a.hash} vs ${d.hash})`);
  // the same seed in a fresh vm context (no hidden state shared between sims)
  const B = load({ files: FILES, names: ['Sim'] });
  const s1 = new B.Sim(c), s2 = new Sim(c);
  for (let k = 0; k < 600; k++) {
    const w = A.packIn(k * 0.01, 1, k * 0.03, 0.7, k % 20 === 0 ? ACT.ATTACK : k % 211 === 0 ? ACT.SUPER : 0, (k >> 4) & 1);
    for (let i = 0; i < 6; i++) { s1.setInput(i, w); s2.setInput(i, w); }
    s1.step(); s2.step(); s1.events.length = 0; s2.events.length = 0;
  }
  check(stateHash(s1) === stateHash(s2), 'two vm contexts agree');
  console.log(`  hashes: ${a.hash} ${b.hash} replay ${r.hash}, other seed ${d.hash}`);
  const bad = checkDeterministicSources();
  check(bad.length === 0, 'checkDeterministicSources(): ' + bad.join('; '));
  console.log(`  checkDeterministicSources(): ${bad.length ? bad.length + ' problems' : 'clean'}`);
}

// ---------------------------------------------------------------- report
function report() {
  section('Per brawler (3v3 gem + test matches; Showdown test: mean place)');
  console.log('  brawler   games  win%  draw  dmg/g  kills/g deaths/g heal/g gems/g | fired atk/sup/gad | effects atk/sup/gad | dmg by atk/sup/gad (k) | sd place');
  for (const k of KEYS) {
    const a = agg[k], g = Math.max(1, a.games);
    console.log(
      '  ' + k.padEnd(9) + pad(a.games, 5) + pad(fmt((a.wins / g) * 100), 6) + pad(a.draws, 6) + pad(fmt(a.dmg / g), 7) +
      pad(fmt(a.kills / g, 1), 8) + pad(fmt(a.deaths / g, 1), 9) + pad(fmt(a.heal / g), 7) + pad(fmt(a.gems / g, 1), 7) + ' |' +
      pad(`${a.fired[1]}/${a.fired[2]}/${a.fired[3]}`, 18) + ' |' + pad(`${a.eff[1]}/${a.eff[2]}/${a.eff[3]}`, 20) + ' |' +
      pad(`${fmt(a.dmgA[1] / 1000)}/${fmt(a.dmgA[2] / 1000)}/${fmt(a.dmgA[3] / 1000)}`, 23) + ' |' + pad(a.sdGames ? fmt(a.sdPlace / a.sdGames, 1) : '-', 9),
    );
    check(a.fired[1] > 0 && a.eff[1] > 0, `${k}: main attack fired (${a.fired[1]}) and had an effect (${a.eff[1]})`);
    check(a.fired[2] > 0 && a.eff[2] > 0, `${k}: super fired (${a.fired[2]}) and had an effect (${a.eff[2]})`);
    check(a.fired[3] > 0 && a.eff[3] > 0, `${k}: gadget fired (${a.fired[3]}) and had an effect (${a.eff[3]})`);
    check(a.dmgA[1] > 0, `${k}: main attack dealt damage`);
  }
  const G = modeAgg.gem, T = modeAgg.test, S = modeAgg.zz_sd;
  section('Modes');
  console.log(`  gem:  ${G.n} matches, ${G.byGems} won by gems, ${G.byTime} hit the 5-min cap, draws ${G.draws}, team wins ${G.wins.join('/')}, mean length ${fmt(G.t / Math.max(1, G.n))} s`);
  console.log(`  test: ${T.n} matches, team wins ${T.wins.join('/')}, draws ${T.draws}, mean length ${fmt(T.t / Math.max(1, T.n))} s`);
  console.log(`  sd test: ${S.n} matches, ${S.last} ended with one survivor, mean length ${fmt(S.t / Math.max(1, S.n))} s`);
  console.log(`  walls broken ${world.walls}, boxes destroyed ${world.boxes}, cubes picked ${world.cubePicks}, gems dropped ${world.gemDrops}, countdowns ${world.countdowns}, poison hits ${world.poisonHits}`);
  check(G.byGems > 0, 'some gem matches are won by gems');
  check(world.walls > 0, 'walls break');
  check(world.gemDrops > 0, 'gems drop on death');
  check(world.boxes > 0 && world.cubePicks > 0, 'boxes break and cubes get picked up in the Showdown test');
  // Poison damage itself is checked deterministically ("poison hurts outside the safe zone", the poison
  // dip check). Whether these few scripted Showdown matches last until the poison reaches anyone
  // depends on the brawler numbers, so the count above is information only.
  if (!world.poisonHits) console.log('  (no poison hits: the Showdown test matches ended before the poison reached anyone)');
  section('Speed (sim.step only)');
  for (const n of [6, 10]) {
    const steps = statTotals.steps[n];
    if (!steps) continue;
    const ms = Number(statTotals.stepNs[n]) / 1e6 / steps, max = Number(statTotals.maxNs[n]) / 1e6;
    const budget = n === 6 ? 0.2 : 0.4;
    console.log(`  ${n} brawlers: ${ms.toFixed(4)} ms per step over ${steps} steps (budget ${budget} ms, worst single step ${max.toFixed(2)} ms)`);
    check(ms < budget * 2, `${n} brawlers: ${ms.toFixed(4)} ms per step is far over the ${budget} ms budget`);
    if (ms >= budget) console.log(`  WARN ${n} brawlers: over the ${budget} ms budget`);
  }
}


// ---------------------------------------------------------------- 1b. maps and mode rules
function modeRules() {
  section('Maps');
  for (const key of Object.keys(A.MAPS)) {
    if (key.startsWith('zz_')) continue;
    const m = A.parseMap(key), modes = A.MAPS[key].modes;
    const team = m.spawns.length === 2;
    if (team) {
      check(m.spawns[0].length === 3 && m.spawns[1].length === 3, `${key}: 3 spawns per team`);
      // mirrored top to bottom, so both sides are the same map
      const mir = m.spawns[1].map((p) => `${p.x},${m.h - p.y}`).sort().join(' '), own = m.spawns[0].map((p) => `${p.x},${p.y}`).sort().join(' ');
      check(mir === own, `${key}: team spawns mirror each other`);
    } else check(m.spawns[0].length >= 10, `${key}: at least 10 Showdown spawns (${m.spawns[0].length})`);
    if (modes.includes('gem')) check(!!m.mine, `${key}: a gem mine`);
    if (modes.includes('ball')) check(m.goals.length === 2 && !!m.obj, `${key}: two goals and a ball spot`);
    if (modes.includes('bounty')) check(!!m.obj, `${key}: a centre star spot`);
    const all = m.spawns.flat();
    const d = A.flowField(m, [all[0]]);
    const at = (x, y) => d[Math.floor(y) * m.w + Math.floor(x)];
    const targets = all.slice(1).concat(m.obj ? [m.obj] : [], m.goals.map((g) => ({ x: (g.x0 + g.x1) / 2, y: (g.y0 + g.y1) / 2 })));
    check(targets.every((p) => Number.isFinite(at(p.x, p.y))), `${key}: every spawn and objective can be walked to`);
    if (m.mine) check([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => Number.isFinite(at(m.mine.x + dx, m.mine.y + dy))), `${key}: the gem mine can be reached`);
    let open = 0, reach = 0;
    for (let i = 0; i < m.w * m.h; i++) if (!(A.flagsAt(m, (i % m.w) + 0.5, Math.floor(i / m.w) + 0.5) & A.TF_MOVE)) { open++; if (Number.isFinite(d[i])) reach++; }
    check(open === reach, `${key}: no walled-off pockets (${open - reach} unreachable tiles)`);
    console.log(`  ${key.padEnd(14)} ${m.w}x${m.h} ${modes.join(',')} spawns ${all.length}`);
  }
  for (const mode of ['gem', 'sd', 'ball', 'ko', 'bounty']) check(Object.keys(A.MAPS).filter((k) => A.MAPS[k].modes.includes(mode)).length >= 2, `${mode}: at least two maps`);

  const kill = (sim, v, k) => { v.killer = k ? k.slot : -1; v.hp = 0; v.shieldT = 0; };

  section('Showdown rules');
  {
    const sim = mkSim('sd', 'skull_creek', KEYS.slice(0, 10), { teams: KEYS.slice(0, 10).map((_, i) => i) });
    const B = sim.brawlers;
    check(new Set(B.map((b) => `${b.x},${b.y}`)).size === 10, 'ten different spawn points');
    check(sim.hud().mode === 'sd' && sim.hud().alive === 10 && sim.poison, 'HUD: 10 alive, poison rect');
    sim.addCube(B[3]); sim.addCube(B[3]); sim.addCube(B[3]);
    drain(sim);
    kill(sim, B[3], B[4]);
    let ev = stepN(sim, 1);
    // the original's rule: 1 cube plus a third of theirs (3 -> 2), at most 5
    check(!B[3].alive && B[3].respawnT < 0 && sim.pickups.filter((p) => p.pick === PICK.CUBE).length === 2, 'no respawn; a fallen brawler drops 1 + a third of their cubes');
    check(B[4].st.kills === 1 && evs(ev, EV.KILL).length === 1, 'the takedown is credited');
    const order = [];
    for (const b of B) if (b.slot !== 3 && b.slot !== 7) { kill(sim, b, null); stepN(sim, 1); order.push(b.slot); }
    check(sim.over && sim.result.reason === 'last' && sim.result.winner === B[7].team, `the last one standing wins (${sim.result && sim.result.reason})`);
    check(sim.result.rank[0] === 7 && sim.result.rank[1] === order[order.length - 1] && sim.result.rank[9] === 3, `placement: survivor, then last one down first (${sim.result.rank})`);
    const s2 = mkSim('sd', 'cavern_ring', KEYS.slice(0, 10), { teams: KEYS.slice(0, 10).map((_, i) => i), seed: 3 });
    stepN(s2, Math.round(40 / SIM_DT));
    check(s2.poison.k > 0 && s2.poisonStage >= 1, 'the poison starts closing after 30 s');
  }

  section('Blast Ball rules');
  {
    const sim = mkSim('ball', 'pinball_pitch', KEYS.slice(0, 6));
    const m = sim.map, ball = sim.ball, B = sim.brawlers;
    check(ball && Math.abs(ball.x - m.obj.x) < 1e-9 && Math.abs(ball.y - m.obj.y) < 1e-9, 'the ball starts on its spot');
    let h = sim.hud();
    check(h.mode === 'ball' && h.goals[0] === 0 && !h.ot && Math.abs(h.time - 150) < 0.1, 'HUD: 0-0, 2:30 on the clock');
    // pick up, then a tap kicks at the enemy goal (team 1 defends the top)
    const b = B[0];
    for (const o of B) if (o !== b) place(sim, o, 2.5, o.team ? 3.5 : 29.5);
    place(sim, b, ball.x + 0.3, ball.y + 0.2);
    stepN(sim, 2);
    check(ball.holder === 0, 'touching the ball picks it up');
    ready(b);
    let ev = stepN(sim, 1, (i) => (i === 0 ? A.packIn(0, 0, 0, 1, ACT.ATTACK, 1) : 0));
    check(ball.holder < 0 && ball.vy < -5 && evs(ev, EV.FIRE).length === 0 && evs(ev, EV.BALL).some((e) => e[1] === 2), `holding the ball, attack kicks it (towards the top goal) instead of shooting (vy ${ball.vy.toFixed(1)})`);
    // a goal: the ball in team 1's goal mouth scores for team 0, credited to the kicker
    ball.x = 10.5; ball.y = 0.6; ball.vx = ball.vy = 0; ball.kicker = 0; ball.holder = -1;
    ev = stepN(sim, 1);
    check(sim.ms.goals[0] === 1 && evs(ev, EV.GOAL).some((e) => e[1] === 0 && e[2] === 0) && b.st.goals === 1, 'a ball in the goal scores for the attackers');
    check(sim.freezeT > 0, 'the world freezes for the celebration');
    const bx = b.x, by = b.y;
    stepN(sim, 30, (i) => A.packIn(0, 1, 0, 1, ACT.ATTACK, 0));
    check(b.x === bx && b.y === by && sim.ms.goals[0] === 1, 'nothing moves (or scores again) while frozen');
    ev = stepN(sim, Math.round(2.6 / SIM_DT));
    check(sim.freezeT === 0 && Math.abs(ball.x - m.obj.x) < 1e-9 && ball.holder < 0 && evs(ev, EV.RESPAWN).length === 6, 'after the celebration, the ball and everyone go back to the start');
    // an own goal: team 1 knocks it into its own goal; no credit
    ball.x = 10.5; ball.y = 0.6; ball.kicker = 3; ball.holder = -1; ball.vx = ball.vy = 0;
    ev = stepN(sim, 1);
    check(sim.over && sim.result.winner === 0 && sim.result.reason === 'goals' && B[3].st.goals === 0 && evs(ev, EV.GOAL).some((e) => e[2] === -1), 'second goal wins; an own goal counts for the other team without credit');
    // a lobbed pass flies over walls
    const s2 = mkSim('ball', 'center_kick', KEYS.slice(0, 6));
    const c = s2.brawlers[0];
    for (const o of s2.brawlers) place(s2, o, 0.5 + o.slot, 31.5);
    place(s2, c, 10.5, 13.5);
    s2.kickBall(c, Math.PI / 2, 6, 9, 3);
    for (let k = 0; k < 75; k++) s2.stepBall();
    check(s2.ball.y > 17.5 && !(A.flagsAt(s2.map, s2.ball.x, s2.ball.y) & A.TF_MOVE), `a lobbed pass clears the wall rows (lands at y ${s2.ball.y.toFixed(1)})`);
    // tied at the end: sudden-death overtime with the breakable walls gone, then a draw
    const s3 = mkSim('ball', 'center_kick', KEYS.slice(0, 6));
    s3.playT = 150 - SIM_DT / 2;
    stepN(s3, 2);
    check(s3.ms.ot && s3.hud().ot && !tiles(s3.map, (t) => t === TILE.WALL).length && !s3.over, 'tied after 2:30: overtime, walls removed');
    s3.playT = 210 - SIM_DT / 2;
    stepN(s3, 2);
    check(s3.over && s3.result.winner === -1, 'still tied after overtime: a draw');
  }

  section('Knockout rules');
  {
    const sim = mkSim('ko', 'canyon_cross', KEYS.slice(0, 6));
    const B = sim.brawlers, m = sim.map;
    const w = tiles(m, (t) => t === TILE.WALL)[0];
    sim.breakTile(w.ti, 0, 2);
    let h = sim.hud();
    check(h.mode === 'ko' && h.round === 1 && h.rounds[0] === 0, 'HUD: round 1, 0-0');
    for (const b of B) if (b.team === 1) kill(sim, b, B[0]);
    let ev = stepN(sim, 1);
    check(evs(ev, EV.ROUND).some((e) => e[1] === 0 && e[2] === 1) && sim.ms.rounds[0] === 1 && sim.freezeT > 0 && !sim.over, 'a wiped team loses the round; the world freezes');
    check(B.filter((b) => b.team === 1).every((b) => !b.alive && b.respawnT < 0), 'no respawns in Knockout');
    stepN(sim, Math.round(3.1 / SIM_DT));
    check(B.every((b) => b.alive && b.hp === b.maxHp) && m.tiles[w.ti] === TILE.WALL && sim.hud().round === 2, 'next round: everyone back, the map restored');
    // a double knockout is a drawn round
    for (const b of B) kill(sim, b, null);
    ev = stepN(sim, 1);
    check(evs(ev, EV.ROUND).some((e) => e[1] === -1) && sim.ms.rounds[0] === 1 && sim.ms.rounds[1] === 0, 'everyone down at once: a drawn round');
    stepN(sim, Math.round(3.1 / SIM_DT));
    // the round cap: more brawlers standing wins
    kill(sim, B[4], B[0]);
    stepN(sim, 1);
    sim.roundT0 = sim.t - 120;
    stepN(sim, 1);
    check(sim.over && sim.result.winner === 0 && sim.result.reason === 'rounds' && sim.result.score[0] === 2, `at the round cap the team with more standing wins; 2 rounds win the match (${JSON.stringify(sim.result && sim.result.score)})`);
    const s2 = mkSim('ko', 'dry_gulch', KEYS.slice(0, 6));
    stepN(s2, Math.round(50 / SIM_DT), (i) => 0);
    check(s2.poison.k > 0 && s2.hud().poison, 'the poison closes in after 45 s of a round');
  }

  section('Review fixes (edge cases)');
  {
    // a gadget shield used under spawn protection replaces it (no extra immunity)
    const s1 = mkSim('test', 'crystal_cove', ['zip', 'dax']);
    const br = s1.brawlers[0];
    check(br.spawnSh && br.shieldF === 1, 'spawn protection is up at the start');
    stepN(s1, 1, (i) => (i === 0 ? A.packIn(0, 0, 0, 1, ACT.GADGET, 1) : 0));
    check(!br.spawnSh && br.shieldT <= 0.5 + 1e-9, `Blink ends the spawn shield instead of stretching it: only its own half second is left (shieldT ${br.shieldT.toFixed(2)})`);
    // a cube on the tick a brawler goes down doesn't save them
    const s2 = mkSim('sd', 'skull_creek', KEYS.slice(0, 10), { teams: KEYS.slice(0, 10).map((_, i) => i) });
    const v = s2.brawlers[2];
    const cube = s2.spawnPickup(PICK.CUBE, 1, v.x, v.y, v.x, v.y);
    cube.t = 1;
    kill(s2, v, s2.brawlers[5]);
    stepN(s2, 1);
    check(!v.alive && !cube.dead, 'a power cube touched at 0 health is not picked up');
    // Bounty: a same-tick trade scores both sides the same, and no one dead gets a star
    for (const [a, b] of [[0, 3], [3, 0]]) {
      const s3 = mkSim('bounty', 'snake_meadow', KEYS.slice(0, 6));
      kill(s3, s3.brawlers[a], s3.brawlers[b]); kill(s3, s3.brawlers[b], s3.brawlers[a]);
      stepN(s3, 1);
      check(s3.ms.stars[0] === 2 && s3.ms.stars[1] === 2 && s3.brawlers[a].bounty === 2 && s3.brawlers[b].bounty === 2, `Bounty trade ${a}<->${b}: stars ${s3.ms.stars}, bounties ${s3.brawlers[a].bounty}/${s3.brawlers[b].bounty}`);
    }
    // Showdown: the last two going down together end it 'last', and slot 0 doesn't always lose the tie
    let zeroWins = 0;
    for (let k = 0; k < 6; k++) {
      const s4 = mkSim('sd', 'cavern_ring', KEYS.slice(0, 10), { teams: KEYS.slice(0, 10).map((_, i) => i) });
      for (const b of s4.brawlers) if (b.slot !== 0 && b.slot !== 7) kill(s4, b, null);
      stepN(s4, 1 + k);
      kill(s4, s4.brawlers[0], null); kill(s4, s4.brawlers[7], null);
      stepN(s4, 1);
      check(s4.over && s4.result.reason === 'last', 'a double knockout at the end is still last-standing');
      if (s4.result.rank[0] === 0) zeroWins++;
    }
    check(zeroWins > 0 && zeroWins < 6, `same-tick ties don't always go to the same slot (slot 0 won ${zeroWins}/6)`);
    // poison: dipping into the safe zone for a tick every half second doesn't stop the damage
    const s5 = mkSim('sd', 'skull_creek', KEYS.slice(0, 10), { teams: KEYS.slice(0, 10).map((_, i) => i) });
    s5.roundT0 = -80; // 80 s into the round: the poison is closing
    for (const b of s5.brawlers) { b.hp = b.maxHp = 1e6; unshield(b); }
    stepN(s5, 1);
    const p = s5.brawlers[0], cx = (s5.poison.x0 + s5.poison.x1) / 2, cy = (s5.poison.y0 + s5.poison.y1) / 2;
    for (const b of s5.brawlers) if (b !== p) place(s5, b, cx, cy);
    let dmg = 0;
    for (let k = 0; k < 150; k++) {
      const inside = k % 15 === 14;
      place(s5, p, inside ? cx : 1.5, inside ? cy : 1.5);
      const h = p.hp;
      stepN(s5, 1);
      dmg += Math.max(0, h - p.hp);
      p.quietT = 0;
    }
    check(dmg >= 3000, `poison keeps hurting someone who dips in for a tick (${dmg} in 5 s)`);
    // a burst started before picking up the ball stops when the ball is picked up
    const s6 = mkSim('ball', 'pinball_pitch', ['dax', 'nova', 'brick', 'pip', 'zip', 'frost']);
    const dx = s6.brawlers[0];
    for (const b of s6.brawlers) if (b !== dx) place(s6, b, 2.5, b.team ? 3.5 : 29.5);
    place(s6, dx, s6.ball.x, s6.ball.y + 3);
    dx.sup = 1; dx.supReady = true; ready(dx);
    drain(s6);
    let ev = stepN(s6, 1, (i) => (i === 0 ? A.packIn(0, 0, -Math.PI / 2, 1, ACT.SUPER, 0) : 0));
    place(s6, dx, s6.ball.x, s6.ball.y);
    ev = stepN(s6, 30);
    const after = evs(ev, EV.SPAWN).filter((e) => e[2] === K.SHOT).length;
    check(s6.ball.holder === 0 && after <= 2, `no burst shots while holding the ball (${after} after the pickup)`);
    // a lob that comes down on the goal frame doesn't get pushed into the goal
    const s7 = mkSim('ball', 'pinball_pitch', KEYS.slice(0, 6));
    for (const b of s7.brawlers) place(s7, b, 10.5, 25.5);
    const kb = s7.brawlers[0];
    place(s7, kb, 4.5, 2.1);
    s7.kickBall(kb, Math.atan2(0.49 - 2.1, 7.5 - 4.5), 3.3 / 1.0, 9, 3);
    for (let k = 0; k < 90 && !s7.over; k++) { s7.stepBall(); s7.mode.tick.call(s7.mode, s7); if (s7.freezeT > 0) break; }
    check(s7.ms.goals[0] === 0 && s7.ms.goals[1] === 0 && !(A.flagsAt(s7.map, s7.ball.x, s7.ball.y) & A.TF_MOVE), `a lob landing on the goal frame doesn't score (goals ${s7.ms.goals}, ball ${s7.ball.x.toFixed(2)},${s7.ball.y.toFixed(2)})`);
    // lasting areas tick once a second from the landing, a whole second's worth each (1.6 s: 2 ticks)
    const s8 = mkSim('test', 'crystal_cove', ['sizzle', 'brick']);
    const tg = s8.brawlers[1];
    unshield(tg); tg.hp = tg.maxHp = 1e6;
    place(s8, tg, 10.5, 22.5);
    s8.areas.push({ id: 999, kind: K.AREA, team: 0, owner: 0, x: 10.5, y: 22.5, r: 1.2, t: 1.6, T: 1.6, dmg: 1000, heal: 0, slow: 0, act: ACT.ATTACK, tickT: 0, chg: 0, dead: false, pk: 'sizzle.atk' });
    const h0 = tg.hp;
    stepN(s8, 60);
    check(Math.abs(h0 - tg.hp - 2000) <= 5, `an area of 1000/s for 1.6 s ticks twice: 2000 (dealt ${h0 - tg.hp})`);
    // like blasts, an area reaches a body that overlaps its edge, not only a centre inside it
    const edge = (off) => {
      const s9 = mkSim('test', 'crystal_cove', ['sizzle', 'brick']);
      const t9 = s9.brawlers[1];
      unshield(t9); t9.hp = t9.maxHp = 1e6;
      place(s9, t9, 10.5 + 1.2 + off, 22.5);
      s9.areas.push({ id: 999, kind: K.AREA, team: 0, owner: 0, x: 10.5, y: 22.5, r: 1.2, t: 1, T: 1, dmg: 1000, heal: 0, slow: 0, act: ACT.ATTACK, tickT: 0, chg: 0, dead: false, pk: 'sizzle.atk' });
      stepN(s9, 5);
      return 1e6 - t9.hp;
    };
    const inEdge = edge(A.BRAWLER_R - 0.1), outEdge = edge(A.BRAWLER_R + 0.1);
    check(inEdge > 0 && outEdge === 0, `an area hits a body overlapping its edge (${inEdge}) and not one just clear of it (${outEdge})`);
  }

  section('Original kits and rules');
  {
    const free = (m, x, y) => !(A.flagsAt(m, x, y) & (A.TF_MOVE | A.TF_SHOT));
    // a straight open run of L tiles (with the rows above and below open too when wide)
    const openRow = (m, L, wide) => {
      for (let y = 2; y < m.h - 2; y++) {
        for (let x = 2; x < m.w - L - 2; x++) {
          let ok = true;
          for (let i = 0; i <= L && ok; i++) for (const dy of wide ? [-1, 0, 1] : [0]) if (!free(m, x + i + 0.5, y + dy + 0.5)) ok = false;
          if (ok) return { x: x + 0.5, y: y + 0.5 };
        }
      }
      return null;
    };
    // 4 open tiles with a wall right after them, going +x
    const wallAhead = (m) => {
      for (let y = 1; y < m.h - 1; y++) {
        for (let x = 1; x < m.w - 6; x++) {
          let ok = true;
          for (let i = 0; i < 4 && ok; i++) if (!free(m, x + i + 0.5, y + 0.5)) ok = false;
          if (ok && (A.flagsAt(m, x + 4.5, y + 0.5) & A.TF_SHOT)) return { x: x + 0.5, y: y + 0.5 };
        }
      }
      return null;
    };
    const off = (b) => { b.alive = false; b.hp = 0; b.respawnT = 0; }; // out of the way for good
    const fire = (sim, slot, act, ang, d) => stepN(sim, 1, (i) => (i === slot ? A.packIn(0, 0, ang, d, act, 0) : 0));
    const LM = A.LEVEL_MULT(9);

    { // Rico-style bolts bounce off walls and fly on
      const sim = mkSim('test', 'crystal_cove', ['volt', 'dax']);
      const v = sim.brawlers[0]; off(sim.brawlers[1]);
      const p = wallAhead(sim.map);
      place(sim, v, p.x, p.y); ready(v);
      fire(sim, 0, ACT.ATTACK, 0, 1);
      let back = false;
      for (let k = 0; k < 40; k++) { stepN(sim, 1); for (const e of sim.shots) if (e.owner === 0 && !e.dead && e.wallBnc > 0 && e.vx < 0) back = true; }
      check(back, 'a ricochet bolt fired at a wall bounces back off it and flies on');
    }
    { // Mortis-style lunge: long after a rest, short right after another
      const sim = mkSim('test', 'crystal_cove', ['shade', 'dax']);
      const b = sim.brawlers[0]; off(sim.brawlers[1]);
      const p = openRow(sim.map, 10, false);
      place(sim, b, p.x, p.y); ready(b);
      const lunge = () => { const x0 = b.x; fire(sim, 0, ACT.ATTACK, 0, 1); stepN(sim, 30); ready(b); return b.x - x0; };
      const d1 = lunge(), d2 = lunge();
      check(Math.abs(d1 - 4.67) < 0.35 && Math.abs(d2 - 2.67) < 0.35, `a lunge after a rest reaches 4.67 tiles, one right after only 2.67 (${d1.toFixed(2)}, ${d2.toFixed(2)})`);
    }
    { // Hot Landing (star 0): Big Drop's landing burns for 900 over 4 s
      const sim = mkSim('test', 'crystal_cove', ['brick', 'dax'], { star: 0 });
      const [b, e] = sim.brawlers;
      const p = openRow(sim.map, 6, true);
      place(sim, b, p.x, p.y); place(sim, e, p.x + 4, p.y); unshield(e);
      e.hp = e.maxHp = 1e6;
      b.sup = 1; b.supReady = true;
      fire(sim, 0, ACT.SUPER, 0, 4 / 9);
      stepN(sim, 30 * 5);
      const dealt = 1e6 - e.hp, want = (960 + 900) * LM;
      check(Math.abs(dealt - want) < want * 0.06, `Big Drop + Hot Landing deal ${Math.round(want)} (dealt ${dealt})`);
    }
    { // Iron Hide (gadget 1): bullets that reach Brick for a second are destroyed
      const sim = mkSim('test', 'crystal_cove', ['brick', 'dax'], { gadget: 1 });
      const [b, e] = sim.brawlers;
      unshield(b); unshield(e);
      const p = openRow(sim.map, 6, true);
      place(sim, b, p.x + 5, p.y); place(sim, e, p.x, p.y); ready(e);
      const h0 = b.hp;
      stepN(sim, 1, (i) => A.packIn(0, 0, i === 0 ? Math.PI : 0, 1, i === 0 ? ACT.GADGET : ACT.ATTACK, 0));
      stepN(sim, 24);
      const blocked = b.hp === h0;
      ready(e);
      fire(sim, 1, ACT.ATTACK, 0, 1);
      stepN(sim, 24);
      check(blocked && b.hp < h0, `Iron Hide destroys bullets for 1 s, then they hit again (${h0} -> ${b.hp})`);
    }
    { // Choke (gadget 1): the next 3 attacks reach 10 tiles, the 4th is back to 7.67
      const sim = mkSim('test', 'crystal_cove', ['nova', 'dax'], { gadget: 1 });
      const b = sim.brawlers[0]; off(sim.brawlers[1]);
      const p = openRow(sim.map, 3, false);
      place(sim, b, p.x, p.y); ready(b);
      fire(sim, 0, ACT.GADGET, 0, 1);
      const ranges = [];
      for (let k = 0; k < 4; k++) {
        ready(b);
        const n0 = sim.nextId;
        fire(sim, 0, ACT.ATTACK, 0, 1);
        const mine = sim.shots.filter((e) => e.id >= n0 && e.owner === 0);
        ranges.push(mine.length ? mine[0].range : 0);
        stepN(sim, 40);
      }
      check(ranges.join() === '10,10,10,7.67', `Choke: 3 long attacks, then normal (${ranges.join()})`);
    }
    { // Heavy Paws (gadget 0): the bear stuns enemies around it
      const sim = mkSim('test', 'crystal_cove', ['bramble', 'dax'], { gadget: 0 });
      const [b, e] = sim.brawlers;
      unshield(e);
      const p = openRow(sim.map, 6, true);
      place(sim, b, p.x, p.y); place(sim, e, p.x + 4, p.y);
      b.sup = 1; b.supReady = true;
      fire(sim, 0, ACT.SUPER, 0, 3 / 5);
      stepN(sim, 2);
      fire(sim, 0, ACT.GADGET, 0, 1);
      stepN(sim, 25);
      const early = e.stunT > 0;
      stepN(sim, 6);
      check(!early && e.stunT > 0, 'Heavy Paws: 1 second later the bear stuns enemies around it');
    }
    { // Steady Beat (gadget 1): a thrown circle that frees allies in it and keeps them immune while they stay
      const sim = mkSim('test', 'crystal_cove', ['melody', 'nova', 'dax'], { gadget: 1, teams: [0, 0, 1] });
      const [m, a] = sim.brawlers;
      off(sim.brawlers[2]);
      const p = openRow(sim.map, 5, false);
      place(sim, m, p.x, p.y); place(sim, a, p.x + 4, p.y); unshield(a);
      sim.stun(a, 3, 2, 1);
      fire(sim, 0, ACT.GADGET, 0, 4 / 6);
      stepN(sim, 1);
      const freed = a.stunT === 0;
      sim.stun(a, 2, 2, 1);
      const immune = a.stunT === 0;
      place(sim, a, p.x - 4, p.y);
      stepN(sim, 5);
      sim.stun(a, 2, 2, 1);
      check(freed && immune && a.stunT > 0, `Steady Beat frees an ally in its circle and keeps them immune only while inside (${freed}, ${immune}, ${a.stunT.toFixed(2)})`);
    }
    { // the gas: 20% of max health a second, healing halved in it
      const sim = mkSim('sd', 'skull_creek', KEYS.slice(0, 10), { teams: KEYS.slice(0, 10).map((_, i) => i) });
      const b = sim.brawlers[0];
      for (const o of sim.brawlers) unshield(o);
      sim.roundT0 = -200; // fully closed in
      stepN(sim, 1);
      const P = sim.poison, inGas = !(b.x >= P.x0 && b.x <= P.x1 && b.y >= P.y0 && b.y <= P.y1);
      b.hp = b.maxHp;
      stepN(sim, 30 * 3); // ticks at 0.5, 1.5 and 2.5 s
      const lost = (b.maxHp - b.hp) / b.maxHp;
      const h0 = b.hp, got = sim.heal(b, 1000, -1, 0);
      check(inGas && Math.abs(lost - 0.6) < 0.01 && got === 500 && b.hp === h0 + 500, `the gas takes 20% a second (3 s: ${(lost * 100).toFixed(0)}%) and halves healing (${got})`);
    }
    { // the gem mine waits while 15 gems lie around
      const sim = mkSim('gem', 'crystal_cove', KEYS.slice(0, 6));
      const mine = sim.map.mine;
      for (let i = 0; i < 15; i++) sim.spawnPickup(A.PICK.GEM, 1, mine.x, mine.y, mine.x, mine.y);
      stepN(sim, 30 * 3);
      const n = sim.pickups.filter((q) => q.pick === A.PICK.GEM).length;
      check(n === 15 && sim.ms.spawned === 0, `no new gems while 15 lie on the ground (${n}, spawned ${sim.ms.spawned})`);
    }
    { // respawn times: 5 s in Gem Rush and Blast Ball, 3 s in Bounty
      const t = {};
      for (const [mode, map] of [['gem', 'crystal_cove'], ['ball', 'pinball_pitch'], ['bounty', 'snake_meadow']]) {
        const sim = mkSim(mode, map, KEYS.slice(0, 6));
        const v = sim.brawlers[3];
        v.hp = 0; v.killer = 0; v.shieldT = 0;
        stepN(sim, 1);
        t[mode] = Math.round(v.respawnT * 10) / 10;
      }
      check(t.gem === 5 && t.ball === 5 && t.bounty === 3, `respawn in ${JSON.stringify(t)}`);
    }
    { // Bounty: 20 stars wins at once
      const sim = mkSim('bounty', 'snake_meadow', KEYS.slice(0, 6));
      sim.ms.stars[1] = 20;
      stepN(sim, 1);
      check(sim.over && sim.result.winner === 1, 'Bounty: the first team to 20 stars wins');
    }
    { // Rocket Boots (star 0): Pip caught in his own blast is flung away from it, 3 tiles (5 by Big Barrel)
      const sim = mkSim('test', 'crystal_cove', ['pip', 'dax'], { star: 0 });
      const b = sim.brawlers[0]; off(sim.brawlers[1]);
      const p = openRow(sim.map, 6, true);
      place(sim, b, p.x, p.y); ready(b);
      fire(sim, 0, ACT.ATTACK, Math.PI, 1 / 7.33); // the sticks land a tile behind him
      stepN(sim, 45);
      const stick = b.x - p.x;
      place(sim, b, p.x, p.y); b.sup = 1; b.supReady = true;
      fire(sim, 0, ACT.SUPER, Math.PI, 1 / 7.33);
      stepN(sim, 60);
      check(stick > 2.5 && stick < 3.5 && b.x - p.x > 4.5, `Rocket Boots: Pip is flung away from his own blast (${stick.toFixed(2)} tiles by a stick, ${(b.x - p.x).toFixed(2)} by Big Barrel)`);
    }
    { // Hard Gust (star 0): pushed into a wall, enemies are stunned
      const sim = mkSim('test', 'crystal_cove', ['frost', 'dax'], { star: 0 });
      const [b, e] = sim.brawlers;
      unshield(e);
      const p = wallAhead(sim.map);
      place(sim, b, p.x, p.y); place(sim, e, p.x + 2.5, p.y);
      b.sup = 1; b.supReady = true;
      fire(sim, 0, ACT.SUPER, 0, 1);
      let stunned = false;
      for (let k = 0; k < 20; k++) { stepN(sim, 1); if (e.stunT > 0) stunned = true; }
      check(stunned, 'Hard Gust: Gale Wall stuns an enemy it pushes into a wall');
    }
    { // Whirlwind (gadget 0): the twister shoves enemies away
      const sim = mkSim('test', 'crystal_cove', ['frost', 'dax']);
      const [b, e] = sim.brawlers;
      unshield(e);
      const p = openRow(sim.map, 8, true);
      place(sim, b, p.x, p.y); place(sim, e, p.x + 3, p.y);
      fire(sim, 0, ACT.GADGET, 0, 2.6 / 6);
      stepN(sim, 30);
      check(e.x - (p.x + 3) > 0.5, `Whirlwind pushes enemies out (${(e.x - p.x - 3).toFixed(2)} tiles)`);
    }
    { // Sap (gadget 1): the cactus heals nearby allies when it breaks
      const sim = mkSim('test', 'crystal_cove', ['thorn', 'nova', 'dax'], { gadget: 1, teams: [0, 0, 1] });
      const [t, a] = sim.brawlers;
      off(sim.brawlers[2]);
      const p = openRow(sim.map, 4, true);
      place(sim, t, p.x, p.y); place(sim, a, p.x + 2, p.y);
      fire(sim, 0, ACT.GADGET, 0, 3 / 7.33);
      const plant = sim.deployOf(0);
      a.hp = 1000;
      sim.hurt(plant, 1e7, 2, 1, 0, 0);
      check(plant.dead && a.hp === 1000 + Math.round(900 * LM), `Sap heals ${Math.round(900 * LM)} when it breaks (${a.hp - 1000})`);
    }
    { // Bolt Box (gadget 0): stands as cover; destroyed, it bursts into 8 piercing bouncing bolts
      const sim = mkSim('test', 'crystal_cove', ['volt', 'dax']);
      const b = sim.brawlers[0]; off(sim.brawlers[1]);
      const p = openRow(sim.map, 4, true);
      place(sim, b, p.x, p.y);
      fire(sim, 0, ACT.GADGET, 0, 2 / 7.33);
      stepN(sim, 60);
      const box = sim.deployOf(0), standing = !!box;
      const n0 = sim.nextId;
      if (box) sim.hurt(box, 1e7, 1, 1, 0, 0);
      const bolts = sim.shots.filter((e) => e.id >= n0 && e.s.ricochet && e.s.pierce).length;
      check(standing && !sim.deployOf(0) && bolts === 8, `Bolt Box stands for 2 s, and destroyed bursts into 8 bolts (${standing}, ${bolts})`);
    }
    { // Needle Ball: a direct hit is the ball plus the one or two spikes that burst at the target
      const sim = mkSim('test', 'crystal_cove', ['thorn', 'dax']);
      const [b, e] = sim.brawlers;
      unshield(e); e.hp = e.maxHp = 1e6;
      const p = openRow(sim.map, 6, true);
      place(sim, b, p.x, p.y); place(sim, e, p.x + 4, p.y); ready(b);
      fire(sim, 0, ACT.ATTACK, 0, 1);
      stepN(sim, 30);
      const hits = Math.round((1e6 - e.hp) / (540 * LM));
      check(hits >= 2 && hits <= 3, `a direct Needle Ball hit counts the ball and 1-2 spikes (${hits} hits)`);
    }
    { // a wave: a wall stops only the part of it that runs into the wall, and nobody is hit twice
      const sim = mkSim('test', 'zz_wall', ['melody', 'dax', 'nova'], { teams: [0, 1, 1] });
      const [m, a, c] = sim.brawlers;
      for (const e of [a, c]) { unshield(e); e.hp = e.maxHp = 1e6; }
      place(sim, m, 10.5, 13.5); place(sim, a, 12.5, 7.0); place(sim, c, 8.0, 7.0); ready(m);
      fire(sim, 0, ACT.ATTACK, -Math.PI / 2, 1);
      stepN(sim, 40);
      const hitA = 1e6 - a.hp, hitC = 1e6 - c.hp, one = Math.round(760 * LM);
      check(hitA === 0 && hitC === one, `Sonic Chord: the enemy behind the wall is safe (${hitA}), the one in the open half is hit once (${hitC} = ${one})`);
      // Gale Wall goes through walls and carries the enemy behind it away
      const s2 = mkSim('test', 'zz_wall', ['frost', 'dax'], { star: -1 });
      const [f, e2] = s2.brawlers;
      unshield(e2); e2.hp = e2.maxHp = 1e6;
      place(s2, f, 10.5, 13.5); place(s2, e2, 12.5, 7.0);
      f.sup = 1; f.supReady = true;
      fire(s2, 0, ACT.SUPER, -Math.PI / 2, 1);
      stepN(s2, 45);
      check(1e6 - e2.hp === Math.round(800 * LM) && e2.y < 5.5, `Gale Wall passes the wall, hits once and carries the enemy away (y ${e2.y.toFixed(2)})`);
    }
    { // Dynamike-style fuse: the sticks land, lie lit on the ground and burst 1 s after the throw
      const sim = mkSim('test', 'zz_wall', ['pip', 'dax'], { star: -1 });
      const [b, e] = sim.brawlers;
      unshield(e); e.hp = e.maxHp = 1e6;
      place(sim, b, 10.5, 15.5); place(sim, e, 10.5, 13.5); ready(b);
      fire(sim, 0, ACT.ATTACK, -Math.PI / 2, 2 / 7.33);
      stepN(sim, 22);
      const lit = sim.shots.filter((s) => s.lob && !s.dead);
      check(lit.length === 2 && lit.every((s) => s.lob.t >= s.lob.T && s.lob.fuse === 1) && e.hp === 1e6, `Fuse Pair: 0.75 s after a short throw both sticks lie lit on the ground, no damage yet (${lit.length})`);
      stepN(sim, 10);
      check(1e6 - e.hp === Math.round(2 * 800 * LM) && !sim.shots.some((s) => s.lob && !s.dead), `Fuse Pair: they burst together 1 s after the throw (${1e6 - e.hp})`);
      // stepping off a lit stick before it goes off
      ready(b); e.hp = 1e6; place(sim, e, 10.5, 13.5);
      fire(sim, 0, ACT.ATTACK, -Math.PI / 2, 2 / 7.33);
      stepN(sim, 22);
      place(sim, e, 10.5, 10.0);
      stepN(sim, 12);
      check(e.hp === 1e6, 'Fuse Pair: walking away from a lit stick before it bursts avoids the damage');
      // Big Barrel: 1.3 s fuse, 2.67 blast, knocks back
      b.sup = 1; b.supReady = true; place(sim, e, 10.5, 11.5); e.hp = 1e6;
      fire(sim, 0, ACT.SUPER, -Math.PI / 2, 3 / 8.33);
      stepN(sim, 35);
      const hp1 = e.hp;
      stepN(sim, 8);
      check(hp1 === 1e6 && 1e6 - e.hp === Math.round(2200 * LM) && e.y < 10, `Big Barrel bursts 1.3 s after the throw and knocks back (${hp1 === 1e6}, ${1e6 - e.hp}, y ${e.y.toFixed(2)})`);
    }
    { // Big Drop: flies at 9 tiles a second and the landing knocks enemies back 2.6 tiles
      const sim = mkSim('test', 'zz_wall', ['brick', 'dax'], { star: -1 });
      const [b, e] = sim.brawlers;
      unshield(e); e.hp = e.maxHp = 1e6;
      place(sim, b, 10.5, 17.5); place(sim, e, 10.5, 11.0);
      b.sup = 1; b.supReady = true;
      fire(sim, 0, ACT.SUPER, -Math.PI / 2, 6 / 9);
      stepN(sim, 31);
      const air = b.jumpT > 0;
      stepN(sim, 4);
      const landed = b.jumpT <= 0 && Math.abs(b.y - 11.5) < 0.2;
      stepN(sim, 20);
      check(air && landed && 1e6 - e.hp === Math.round(960 * LM) && Math.abs(e.y - (11.0 - 2.6)) < 0.3, `Big Drop: 6 tiles take ~1.1 s (5.33 tiles/s), then the slam knocks back (${air}, ${b.y.toFixed(2)}, ${1e6 - e.hp}, enemy y ${e.y.toFixed(2)})`);
    }
    { // Soul Swarm: a fixed 2.67-wide swarm that flies through walls
      const sim = mkSim('test', 'zz_wall', ['shade', 'dax', 'nova'], { teams: [0, 1, 1], star: -1 });
      const [b, a, c] = sim.brawlers;
      for (const o of [a, c]) { unshield(o); o.hp = o.maxHp = 1e6; }
      place(sim, b, 10.5, 13.5); place(sim, a, 11.6, 6.0); place(sim, c, 12.9, 6.0);
      b.sup = 1; b.supReady = true;
      fire(sim, 0, ACT.SUPER, -Math.PI / 2, 1);
      stepN(sim, 40);
      check(1e6 - a.hp === Math.round(900 * LM) && c.hp === 1e6, `Soul Swarm passes the wall and hits within 1.33 tiles of its line (${1e6 - a.hp}, ${1e6 - c.hp})`);
    }
    { // Pop-Up: the grenades left behind burst 0.3 s after they come down, 2 tiles round
      const sim = mkSim('test', 'zz_wall', ['hawk', 'dax'], { star: -1 });
      const [b, e] = sim.brawlers;
      unshield(e); e.hp = e.maxHp = 1e6;
      place(sim, b, 10.5, 15.5); place(sim, e, 9.0, 15.5);
      b.sup = 1; b.supReady = true;
      fire(sim, 0, ACT.SUPER, -Math.PI / 2, 1);
      stepN(sim, 19);
      const hp1 = e.hp;
      stepN(sim, 8);
      check(hp1 === 1e6 && 1e6 - e.hp === Math.round(4 * 900 * LM), `Pop-Up grenades burst 0.8 s after the leap, all four within reach (${1e6 - e.hp})`);
    }
    { // vision: an invisible brawler shows within 4 tiles; one in a bush within 2
      const sim = mkSim('test', 'zz_wall', ['specter', 'dax'], { star: -1 });
      const [b, e] = sim.brawlers;
      b.invisT = 5;
      place(sim, e, 10.5, 15.5);
      place(sim, b, 10.5, 12.0);
      const near = sim.visibleTo(1, b);
      place(sim, b, 10.5, 11.0);
      check(near && !sim.visibleTo(1, b), 'Fade: enemies see Specter within 4 tiles (3.5: seen, 4.5: hidden)');
      b.invisT = 0;
      place(sim, b, 3.5, 16.5); b.revealT = 0; b.lastAtk = -9;
      place(sim, e, 3.5, 14.7);
      const nearB = sim.visibleTo(1, b);
      place(sim, e, 3.5, 14.2);
      check(b.inBush && nearB && !sim.visibleTo(1, b), 'a bush hides a brawler from enemies more than 2 tiles away (1.8: seen, 2.3: hidden)');
    }
    { // Blast Ball: no gadgets while holding the ball
      const sim = mkSim('ball', 'pinball_pitch', KEYS.slice(0, 6));
      const b = sim.brawlers[0], ball = sim.ball;
      for (const o of sim.brawlers) if (o !== b) place(sim, o, 2.5, o.team ? 3.5 : 29.5);
      place(sim, b, ball.x + 0.3, ball.y + 0.2);
      stepN(sim, 2);
      b.gadT = 0; const left = b.gadLeft;
      const ev = fire(sim, 0, ACT.GADGET, 0, 1);
      check(ball.holder === 0 && b.gadLeft === left && evs(ev, EV.FIRE).length === 0, 'Blast Ball: a gadget does nothing while holding the ball');
    }
    // ---- checked against the Brawl Stars wiki (October 2026) ----
    const wallAt = (sim, x, y) => sim.map.tiles[y * sim.map.w + x] === TILE.WALL;
    { // a wall-breaker's shots each destroy the wall they reach and stop there; Silver Bullet tears through
      const sim = mkSim('test', 'zz_brk', ['nova', 'dax'], { star: -1 });
      const [b] = sim.brawlers; off(sim.brawlers[1]);
      place(sim, b, 10.5, 12.5);
      const pel = sim.spawnShot(0, 0, b.kit.sup, ACT.SUPER, -Math.PI / 2, 10.5, 12.5, 1, 0); // one pellet
      stepN(sim, 40);
      check(pel.dead && !wallAt(sim, 10, 9) && wallAt(sim, 10, 8), `Big Bang: a pellet breaks the wall it reaches and is spent there (front ${wallAt(sim, 10, 9)}, back ${wallAt(sim, 10, 8)})`);
      const s2 = mkSim('test', 'zz_brk', ['dax', 'nova'], { gadget: 1, star: -1 });
      const [c] = s2.brawlers; off(s2.brawlers[1]);
      place(s2, c, 10.5, 12.5); ready(c);
      const am = c.ammo;
      fire(s2, 0, ACT.GADGET, -Math.PI / 2, 1);
      const am1 = c.ammo;
      stepN(s2, 40);
      check(!wallAt(s2, 10, 9) && !wallAt(s2, 10, 8) && Math.abs(am - 1 - am1) < 0.05, `Silver Bullet tears through both layers and uses an ammo bar (ammo ${am.toFixed(2)} -> ${am1.toFixed(2)})`);
    }
    { // Bullet Storm: 12 bullets, 1.4 s; no reloading meanwhile
      const sim = mkSim('test', 'crystal_cove', ['dax', 'nova'], { star: -1 });
      const [b] = sim.brawlers; off(sim.brawlers[1]);
      const p = openRow(sim.map, 6, true);
      place(sim, b, p.x, p.y); b.ammo = 1; b.sup = 1; b.supReady = true;
      const n0 = sim.nextId;
      fire(sim, 0, ACT.SUPER, 0, 1);
      stepN(sim, 20);
      const mid = sim.shots.filter((e) => e.id >= n0).length + 0, a1 = b.ammo;
      stepN(sim, 30);
      check(mid > 4 && mid < 12 && Math.abs(a1 - 1) < 1e-9, `Bullet Storm takes about 1.4 s and stops reloading meanwhile (${mid} of 12 after 0.7 s, ammo ${a1.toFixed(2)})`);
    }
    { // Rico: each wall bounce adds 1.67 tiles of range
      const sim = mkSim('test', 'zz_wall', ['volt', 'dax'], { star: -1 });
      const [b] = sim.brawlers; off(sim.brawlers[1]);
      place(sim, b, 15.5, 11.5); ready(b);
      const n0 = sim.nextId;
      fire(sim, 0, ACT.ATTACK, -Math.PI / 2, 1);
      stepN(sim, 12);
      const bolt = sim.shots.find((e) => e.id === n0);
      check(bolt && bolt.wallBnc === 1 && Math.abs(bolt.range - (9.67 - (11.5 - 9) + 1.67)) < 0.15, `Ricochet Bolts gain 1.67 tiles of range when they bounce (left ${bolt ? bolt.range.toFixed(2) : '-'})`);
    }
    { // spread bursts sweep left to right (Spectral Blades)
      const sim = mkSim('test', 'crystal_cove', ['specter', 'dax'], { star: -1 });
      const [b] = sim.brawlers; off(sim.brawlers[1]);
      const p = openRow(sim.map, 6, true);
      place(sim, b, p.x, p.y); ready(b);
      const n0 = sim.nextId;
      fire(sim, 0, ACT.ATTACK, 0, 1);
      stepN(sim, 12);
      const angs = sim.shots.filter((e) => e.id >= n0).sort((x, y) => x.id - y.id).map((e) => e.ang);
      check(angs.length === 4 && angs.every((a, i) => i === 0 || a > angs[i - 1]) && Math.abs(angs[3] - angs[0] - 0.305) < 0.01, `Spectral Blades sweep 17.5° left to right, one after another (${angs.map((a) => a.toFixed(3)).join(', ')})`);
    }
    { // Zip has 4 ammo bars; Leon-style ramps: 480 up to 15% of range, 168 at full range
      const sim = mkSim('test', 'crystal_cove', ['zip', 'specter'], { star: -1 });
      check(sim.brawlers[0].maxAmmo === 4 && sim.brawlers[0].ammo === 4 && sim.brawlers[1].maxAmmo === 3, 'Zip has 4 ammo bars, everyone else 3');
    }
    { // Needle Ball bursts for one spike's damage within 1 tile
      const sim = mkSim('test', 'zz_wall', ['thorn', 'dax', 'nova'], { teams: [0, 1, 1], star: -1 });
      const [t, a, c] = sim.brawlers;
      for (const o of [a, c]) { unshield(o); o.hp = o.maxHp = 1e6; }
      place(sim, t, 10.5, 15.5); place(sim, a, 3.5, 15.5); place(sim, c, 4.2, 16.4); ready(t);
      fire(sim, 0, ACT.ATTACK, Math.PI, 1);
      stepN(sim, 40);
      check(1e6 - c.hp >= Math.round(540 * LM), `Needle Ball: someone within a tile of the burst takes a spike's damage from the ball itself (${1e6 - c.hp})`);
    }
    { // Soul Swarm heals the full damage per enemy brawler, nothing from units
      const sim = mkSim('test', 'zz_wall', ['shade', 'dax'], { star: -1 });
      const [b, e] = sim.brawlers;
      unshield(e); e.hp = 200; e.maxHp = 200;
      place(sim, b, 10.5, 15.5); place(sim, e, 10.5, 12.5);
      b.hp = 100; b.sup = 1; b.supReady = true;
      fire(sim, 0, ACT.SUPER, -Math.PI / 2, 1);
      stepN(sim, 20);
      check(b.hp === Math.min(b.maxHp, 100 + Math.round(900 * LM)), `Soul Swarm heals the full ${Math.round(900 * LM)} even from a nearly beaten enemy (${b.hp - 100})`);
    }
    { // Repair Kit: Spark Orb mends its own turret by half its damage, then bounces on to an enemy
      const sim = mkSim('test', 'zz_wall', ['gizmo', 'dax'], { star: 0 });
      const [g, e] = sim.brawlers;
      unshield(e); e.hp = e.maxHp = 1e6;
      place(sim, g, 10.5, 16.5); place(sim, e, 13.5, 11.5);
      g.sup = 1; g.supReady = true;
      fire(sim, 0, ACT.SUPER, -Math.PI / 2, 3 / 5);
      const tur = sim.deployOf(0);
      tur.hp = 100; ready(g);
      fire(sim, 0, ACT.ATTACK, -Math.PI / 2, 1);
      stepN(sim, 40);
      check(tur.hp === 100 + Math.round(1060 * LM * 0.5) && e.hp < 1e6, `Repair Kit: the orb repairs the turret by ${Math.round(1060 * LM * 0.5)} (${tur.hp - 100}) and bounces on to the enemy (${1e6 - e.hp})`);
    }
    { // Lullaby: three waves 2 s apart
      const sim = mkSim('test', 'crystal_cove', ['melody', 'nova', 'dax'], { gadget: 0, teams: [0, 0, 1] });
      const [m, a] = sim.brawlers; off(sim.brawlers[2]);
      const p = openRow(sim.map, 3, true);
      place(sim, m, p.x, p.y); place(sim, a, p.x + 1, p.y);
      a.maxHp = 1e6; a.hp = 1000;
      fire(sim, 0, ACT.GADGET, 0, 1);
      const h1 = a.hp;
      a.quietT = -99; // no regeneration in the way
      stepN(sim, 75);
      const h2 = a.hp;
      a.quietT = -99;
      stepN(sim, 60);
      const one = Math.round(700 * LM);
      check(h1 === 1000 + one && h2 === 1000 + 2 * one && a.hp === 1000 + 3 * one, `Lullaby heals in 3 waves, 2 s apart (${h1 - 1000}, ${h2 - 1000}, ${a.hp - 1000})`);
    }
    { // House Special: a healing puddle under Sizzle and every ally within 10 tiles; they don't stack
      const sim = mkSim('test', 'zz_wall', ['sizzle', 'nova', 'brick', 'dax'], { gadget: 1, teams: [0, 0, 0, 1] });
      const [z, a, f] = sim.brawlers; off(sim.brawlers[3]);
      place(sim, z, 10.5, 15.5); place(sim, a, 11.5, 15.5); place(sim, f, 10.5, 2.5);
      for (const o of [z, a, f]) { o.maxHp = 1e6; o.hp = 1000; o.quietT = -99; }
      fire(sim, 0, ACT.GADGET, 0, 1);
      check(sim.areas.length === 2, `House Special drops puddles under Sizzle and the ally within 10 tiles, not the one 13 away (${sim.areas.length})`);
      stepN(sim, Math.round(5 / SIM_DT));
      check(a.hp === 1000 + 5 * Math.round(405 * LM), `standing in two healing puddles heals once a tick: 5 ticks over 4.5 s (${a.hp - 1000})`);
    }
    { // Spin Cycle: 20 sticks over 2 s in a widening spiral, the first 2.33 tiles to his right
      const sim = mkSim('test', 'zz_wall', ['pip', 'dax'], { gadget: 0 });
      const [b] = sim.brawlers; off(sim.brawlers[1]);
      place(sim, b, 10.5, 15.5);
      const n0 = sim.nextId;
      fire(sim, 0, ACT.GADGET, -Math.PI / 2, 1);
      const first = sim.shots.find((e) => e.id >= n0 && e.lob);
      let sticks = first ? 1 : 0, blocked = true;
      for (let k = 0; k < 60; k++) {
        const ev = stepN(sim, 1, k === 30 ? (i) => (i === 0 ? A.packIn(0, 0, 0, 1, ACT.ATTACK, 0) : 0) : null);
        sticks += evs(ev, EV.SPAWN).filter((e) => e[2] === K.SHOT && sim.shots.some((o) => o.id === e[1] && o.lob)).length;
        if (k === 30 && evs(ev, EV.FIRE).length) blocked = false;
      }
      check(first && Math.abs(first.lob.tx - 12.83) < 0.05 && Math.abs(first.lob.ty - 15.5) < 0.05 && sticks === 20 && blocked, `Spin Cycle: 20 sticks in 2 s (${sticks}), the first 2.33 tiles to his right, no attacks meanwhile (${first ? first.lob.tx.toFixed(2) + ',' + first.lob.ty.toFixed(2) : '-'})`);
    }
    { // Big Barrel: 7.33 tiles, like his sticks
      check(A.BRAWLERS.pip.sup.range === 7.33 && A.BRAWLERS.pip.atk.range === 7.33, 'Big Barrel reaches 7.33 tiles, like the sticks');
    }
    { // Briar Patch ticks 5 times in 4.5 s; Green Thumb heals 75% of the damage it deals
      const sim = mkSim('test', 'zz_wall', ['thorn', 'dax'], { star: 0 });
      const [t, e] = sim.brawlers;
      unshield(e); e.hp = e.maxHp = 1e6;
      place(sim, t, 10.5, 15.5); place(sim, e, 10.5, 12.5);
      t.maxHp = 1e6; t.hp = 1000; t.quietT = -99;
      t.sup = 1; t.supReady = true;
      fire(sim, 0, ACT.SUPER, -Math.PI / 2, 3 / 7.67);
      stepN(sim, Math.round(6 / SIM_DT));
      const dealt = 1e6 - e.hp, tick = Math.round(400 * LM);
      check(dealt === 5 * tick && Math.abs(t.st.heal - 0.75 * dealt) <= 5, `Briar Patch: 5 ticks of ${tick} (${dealt}); Green Thumb heals 75% of it (${t.st.heal})`);
    }
    { // Bat Form flies over walls; Back Off needs an enemy within 7 tiles
      const sim = mkSim('test', 'zz_wall', ['shade', 'hawk'], { gadget: 1, teams: [0, 1] });
      const [b, h] = sim.brawlers;
      place(sim, b, 15.5, 11.0); place(sim, h, 2.5, 2.5);
      fire(sim, 0, ACT.GADGET, -Math.PI / 2, 1);
      stepN(sim, 20);
      check(b.y < 7.5 && free(sim.map, b.x, b.y), `Bat Form flies over the wall and lands on open ground (y ${b.y.toFixed(2)})`);
      const s2 = mkSim('test', 'zz_wall', ['hawk', 'dax'], { gadget: 0 });
      const [p, q] = s2.brawlers;
      place(s2, p, 10.5, 15.5); place(s2, q, 10.5, 6.5);
      let ev = fire(s2, 0, ACT.GADGET, 0, 1);
      const far = evs(ev, EV.FIRE).length;
      place(s2, q, 10.5, 10.5);
      ev = fire(s2, 0, ACT.GADGET, 0, 1);
      check(far === 0 && evs(ev, EV.FIRE).length === 1, `Back Off only fires with an enemy within 7 tiles (9 away: ${far}, 5 away: ${evs(ev, EV.FIRE).length})`);
    }
    { // Double: the copy has Specter's health now, takes double damage and shoots from range
      const sim = mkSim('test', 'zz_wall', ['specter', 'dax'], { star: -1 });
      const [b, e] = sim.brawlers;
      unshield(e); e.hp = e.maxHp = 1e6;
      place(sim, b, 10.5, 15.5); place(sim, e, 10.5, 9.5);
      b.hp = 1234;
      fire(sim, 0, ACT.GADGET, 0, 1);
      const cl = sim.deployOf(0);
      const hp0 = cl.hp;
      sim.hurt(cl, 100, 1, 1, 0, 0);
      stepN(sim, 60);
      check(hp0 === 1234 && cl.hp === 1234 - 200 && e.hp < 1e6, `Double: copies his health (${hp0}), takes double damage (${1234 - cl.hp}) and shoots the enemy 6 tiles away (${1e6 - e.hp})`);
    }
    { // Blast Ball: a kick takes an ammo bar; the super kick needs a charged super
      const sim = mkSim('ball', 'pinball_pitch', KEYS.slice(0, 6));
      const b = sim.brawlers[0], ball = sim.ball;
      for (const o of sim.brawlers) if (o !== b) place(sim, o, 2.5, o.team ? 3.5 : 29.5);
      place(sim, b, ball.x + 0.3, ball.y + 0.2);
      stepN(sim, 2);
      b.ammo = 0;
      fire(sim, 0, ACT.ATTACK, -Math.PI / 2, 1);
      const kept = ball.holder === 0;
      fire(sim, 0, ACT.SUPER, -Math.PI / 2, 1);
      const kept2 = ball.holder === 0;
      b.sup = 1; b.supReady = true;
      fire(sim, 0, ACT.SUPER, -Math.PI / 2, 1);
      check(kept && kept2 && ball.holder < 0 && ball.vy < -15 && !b.supReady, `Blast Ball: no kick without ammo or a charged super; a super kick is fast (vy ${ball.vy.toFixed(1)})`);
    }
    { // Bounty: the blue star breaks a tie, and changes hands with its carrier
      const sim = mkSim('bounty', 'snake_meadow', KEYS.slice(0, 6));
      const [a0] = sim.brawlers, b0 = sim.brawlers[3];
      const star = sim.pickups.find((q) => q.pick === PICK.STAR);
      place(sim, a0, star.x, star.y);
      stepN(sim, 15);
      const took = sim.ms.blue === 0 && sim.ms.stars[0] === 1 && sim.ms.blueSlot === a0.slot;
      unshield(a0); sim.hurt(a0, 1e7, b0.slot, 1, 0, 0);
      stepN(sim, 1);
      const moved = sim.ms.blue === 1;
      sim.ms.stars[0] = sim.ms.stars[1] = 5;
      sim.playT = 121;
      stepN(sim, 1);
      check(took && moved && sim.over && sim.result.winner === 1, `Bounty: the blue star counts 1, moves to the team that takes its carrier down, and wins a tie (${took}, ${moved}, ${sim.result && sim.result.winner})`);
    }
    { // gear: every gadget and star power index builds a kit (and a missing one is no gear)
      let ok = true;
      for (const k of KEYS) {
        const D = A.BRAWLERS[k];
        for (let g = -1; g <= D.gadgets.length; g++) for (let st = -1; st <= D.stars.length; st++) {
          const kit = A.brawlerKit(k, st, g);
          if ((g >= 0 && g < D.gadgets.length) !== !!kit.gad) ok = false;
        }
      }
      check(ok, 'every gadget / star power index gives a kit; one out of range gives none');
    }
  }

  section('Bounty rules');
  {
    const sim = mkSim('bounty', 'snake_meadow', KEYS.slice(0, 6));
    const B = sim.brawlers, m = sim.map;
    check(B.every((b) => b.bounty === 2) && sim.pickups.some((p) => p.pick === PICK.STAR), 'everyone starts with 2 stars; a star waits in the middle');
    kill(sim, B[3], B[0]);
    stepN(sim, 1);
    check(sim.ms.stars[0] === 2 && B[0].bounty === 3 && B[3].bounty === 2 && B[0].st.stars === 2, 'a takedown scores the victim\'s stars and raises the bounty');
    for (let k = 0; k < 6; k++) { stepN(sim, Math.round(3.2 / SIM_DT)); kill(sim, B[4], B[0]); stepN(sim, 1); }
    check(B[0].bounty === 7 && sim.ms.stars[0] === 14, `the bounty stops at 7 (${B[0].bounty}, stars ${sim.ms.stars[0]})`);
    kill(sim, B[0], B[5]);
    stepN(sim, 1);
    check(sim.ms.stars[1] === 7 && B[0].bounty === 2, 'taking down a 7-star brawler scores 7');
    stepN(sim, Math.round(3.2 / SIM_DT));
    place(sim, B[1], m.obj.x, m.obj.y);
    stepN(sim, 12);
    check(sim.ms.stars[0] === 15 && !sim.pickups.some((p) => p.pick === PICK.STAR), 'the centre star is worth 1');
    check(Math.abs(sim.hud().time - (120 - sim.playT)) < 1e-6, 'HUD clock counts down from 2:00');
    sim.playT = 120 - SIM_DT / 2;
    stepN(sim, 1);
    check(sim.over && sim.result.winner === 0 && sim.result.reason === 'stars', 'most stars after 2:00 wins');
  }
}

const T0 = Date.now();
unitTests();
modeRules();
matches();
determinism();
report();
console.log(`\n${failN ? 'FAILED: ' + failN + ' check(s)' : 'All sim tests passed'} (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(failN ? 1 : 0);
