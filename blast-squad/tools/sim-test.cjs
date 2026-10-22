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
  'LEVEL_MULT', 'CUBE_HP', 'CUBE_DMG', 'IN_IDLE', 'RESPAWN_T', 'brawlerKit',
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
const check = (c, msg) => { if (!c) fail(msg); return !!c; };
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
function ready(b) { b.ammo = A.MAX_AMMO; b.atkCd = 0; b.bqN = 0; b.stunT = 0; b.kbT = 0; b.dashT = 0; b.jumpT = 0; }
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
    if (b.ammo < 0 || b.ammo > A.MAX_AMMO + 1e-9) bad(`brawler ${b.slot} ammo ${b.ammo}`);
    if (b.sup < 0 || b.sup > 1 || b.supReady !== (b.sup >= 1)) bad(`brawler ${b.slot} sup ${b.sup} ${b.supReady}`);
    if (b.gadLeft < 0 || b.gadLeft > 3) bad(`brawler ${b.slot} gadLeft ${b.gadLeft}`);
    if (b.alive && b.jumpT <= 0 && !free(m, b.x, b.y)) bad(`brawler ${b.slot} ${b.bk} inside a blocking tile at ${b.x.toFixed(2)},${b.y.toFixed(2)}`);
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
      const landT = pip.T * (0.6 + 0.4 * qD);
      check(Math.abs(landAt - landT) < 2 * DT, `lobs land after their flight time (${landAt.toFixed(3)} s, want ${landT.toFixed(3)} s)`);
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
    place(sim, n, open.x + 3, open.y);
    s.sup = 1; s.supReady = true;
    stepN(sim, 2, (i, k) => (i === 0 && k === 0 ? A.packIn(0, 0, 0, 1, ACT.SUPER, 0) : 0));
    check(s.invisT > 0 && ((s.vis >> 1) & 1) === 0, 'invisible brawler is hidden from an enemy 3 tiles away');
    place(sim, n, open.x + 1.2, open.y);
    check(((s.vis >> 1) & 1) === 1, 'an enemy within 1.6 tiles sees an invisible brawler');
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
    // safety cap: nobody moves -> 5 minutes -> draw on time
    const idle = mkSim('gem', 'crystal_cove', ['nova', 'dax', 'brick', 'pip', 'zip', 'frost'], { seed: 6 });
    stepN(idle, Math.round(301 / DT));
    check(idle.over && idle.result.reason === 'time' && idle.result.winner === -1 && Math.abs(idle.t - 300) < 0.05, `hidden 5-minute cap ends an idle match in a draw (t=${idle.t.toFixed(2)})`);
  }

  // -- Showdown support: boxes drop cubes, cubes add health and damage, poison hurts
  {
    const bks = ['nova', 'dax', 'brick', 'pip', 'zip', 'frost', 'volt', 'hawk', 'shade', 'thorn'];
    const sim = mkSim('zz_sd', 'zz_test_sd', bks, { teams: bks.map((_, i) => i) });
    const m = sim.map, b = sim.brawlers[0];
    check(sim.nTeams === 10 && sim.hasBox, 'free-for-all with 10 teams and boxes');
    const box = tiles(m, (t) => t === TILE.BOX)[0];
    sim.hurtBox(box.ti, 1000, 0, 1);
    check(sim.boxHp[box.ti] === Sim.BOX_HP - 1000, 'boxes take damage');
    sim.hurtBox(box.ti, Sim.BOX_HP, 0, 1);
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
    const buffs = new Set(['shield', 'speed', 'invis', 'ammo', 'nextStun', 'nextSlow', 'petStun', 'deployRate']);
    const walk = (s, where) => {
      check(prims.has(s.t), `${where}: primitive ${s.t}`);
      if (s.t === 'buff') check(buffs.has(s.what), `${where}: buff ${s.what}`);
      for (const x of s.then || []) walk(x, where + '.then');
    };
    check(KEYS.length === 15 && KEYS.every((k) => A.BRAWLERS[k]), '15 roster entries');
    for (const k of KEYS) {
      const D = A.BRAWLERS[k];
      for (const f of ['name', 'rarity', 'role', 'desc', 'hp', 'speed', 'reload']) check(D[f] != null, `${k}.${f}`);
      check([720, 770, 820].includes(D.speed) && D.hp >= 2400 && D.hp <= 6000 && D.reload >= 0.9 && D.reload <= 2.4, `${k}: stats in range`);
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
function cfg3v3(mode, i, seed, offs, star) {
  const bks = lineup(i, offs);
  return { mode, map: 'crystal_cove', seed, slots: bks.map((bk, j) => ({ team: j < 3 ? 0 : 1, bk, lvl: 9 + (j % 3), gadget: 0, star, name: bk })) };
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
    const c = cfg3v3('test', QUICK ? i * 3 : i, 2000 + i, [0, 4, 8, 1, 6, 11], i & 1 ? -1 : 0);
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
  check(world.poisonHits > 0, 'poison deals damage in the Showdown test');
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

const T0 = Date.now();
unitTests();
matches();
determinism();
report();
console.log(`\n${failN ? 'FAILED: ' + failN + ' check(s)' : 'All sim tests passed'} (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(failN ? 1 : 0);
