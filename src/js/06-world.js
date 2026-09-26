// ---------- Tile world, collision & level generation ----------
const T_EMPTY = 0, T_SOLID = 1, T_PLAT = 2, T_SPIKE = 3, T_LAVA = 4, T_ICE = 5;
const ROWS = 15;

class World {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.t = new Uint8Array(cols * rows);
    this.pw = cols * TILE;
    this.ph = rows * TILE;
  }
  get(c, r) {
    if (c < 0 || c >= this.cols) return T_SOLID;
    if (r < 0 || r >= this.rows) return T_EMPTY;
    return this.t[r * this.cols + c];
  }
  set(c, r, v) {
    if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) this.t[r * this.cols + c] = v;
  }
  solidAt(c, r) {
    const v = this.get(c, r);
    return v === T_SOLID || v === T_ICE;
  }
  solidPx(x, y) { return this.solidAt(Math.floor(x / TILE), Math.floor(y / TILE)); }
  standablePx(x, y) {
    const v = this.get(Math.floor(x / TILE), Math.floor(y / TILE));
    return v === T_SOLID || v === T_ICE || v === T_PLAT;
  }
  // y (px) of the first walkable surface at/below y in column of x, or null
  groundBelow(x, y) {
    const c = Math.floor(x / TILE);
    for (let r = Math.max(0, Math.floor(y / TILE)); r < this.rows; r++) {
      const v = this.get(c, r);
      if (v === T_SOLID || v === T_ICE || v === T_PLAT) return r * TILE;
      if (v === T_LAVA) return r * TILE;
    }
    return null;
  }
}

function moveActor(a, dt, world, platforms) {
  a.hitWall = 0;
  a.hitCeil = false;
  if (a.plat) {
    const p = a.plat;
    if (p.solid && a.x + a.w > p.x && a.x < p.x + p.w && Math.abs(a.y + a.h - p.prevY) < 4) {
      a.x += p.dx;
      a.y += p.dy;
    }
  }
  a.plat = null;
  // horizontal
  let nx = a.x + a.vx * dt;
  const r0 = Math.floor((a.y + 1) / TILE), r1 = Math.floor((a.y + a.h - 1) / TILE);
  if (a.vx > 0) {
    const c = Math.floor((nx + a.w) / TILE);
    for (let r = r0; r <= r1; r++) {
      if (world.solidAt(c, r)) { nx = c * TILE - a.w - 0.01; a.vx = 0; a.hitWall = 1; break; }
    }
  } else if (a.vx < 0) {
    const c = Math.floor(nx / TILE);
    for (let r = r0; r <= r1; r++) {
      if (world.solidAt(c, r)) { nx = (c + 1) * TILE + 0.01; a.vx = 0; a.hitWall = -1; break; }
    }
  }
  a.x = nx;
  // vertical
  const prevBottom = a.y + a.h;
  let ny = a.y + a.vy * dt;
  a.onGround = false;
  a.onIce = false;
  a.onPlat = false;
  const c0 = Math.floor((a.x + 2) / TILE), c1 = Math.floor((a.x + a.w - 2) / TILE);
  if (a.vy >= 0) {
    const r = Math.floor((ny + a.h) / TILE);
    let land = false, ice = false, plat = false;
    for (let c = c0; c <= c1; c++) {
      const t = world.get(c, r);
      if (t === T_SOLID || t === T_ICE) { land = true; if (t === T_ICE) ice = true; }
      else if (t === T_PLAT && !(a.dropping > 0) && prevBottom <= r * TILE + 1) { land = true; plat = true; }
    }
    if (land) {
      ny = r * TILE - a.h;
      a.vy = 0;
      a.onGround = true;
      a.onIce = ice;
      a.onPlat = plat && !ice;
    }
  } else {
    const r = Math.floor(ny / TILE);
    for (let c = c0; c <= c1; c++) {
      if (world.solidAt(c, r)) { ny = (r + 1) * TILE; a.vy = 0; a.hitCeil = true; break; }
    }
  }
  a.y = ny;
  if (platforms && a.vy >= 0 && !(a.dropping > 0)) {
    for (const p of platforms) {
      if (!p.solid) continue;
      if (a.x + a.w > p.x + 2 && a.x < p.x + p.w - 2) {
        const top = p.y;
        if (prevBottom <= Math.max(top, p.prevY) + 2 && a.y + a.h >= top) {
          a.y = top - a.h;
          a.vy = 0;
          a.onGround = true;
          a.onPlat = true;
          a.onIce = false;
          a.plat = p;
        }
      }
    }
  }
}

// ---------- Level generator ----------
const HEAVY_BY_REGION = ['grunt', 'sword', 'mummy', 'yeti', 'brute', 'knight'];

function makeWaves(n, diff, region, rng) {
  const pool = REGIONS[region].pool;
  const waves = [];
  for (let i = 0; i < n; i++) {
    const cnt = Math.min(7, 2 + Math.floor(diff * 0.45) + i);
    const wv = [];
    for (let k = 0; k < cnt; k++) wv.push(rng.weighted(pool));
    if (i === n - 1 && diff >= 1.2) wv.push(HEAVY_BY_REGION[region]);
    waves.push(wv);
  }
  return waves;
}

function generateLevel(def) {
  const R = REGIONS[def.region];
  const rng = new RNG(def.seed || 1);
  const kind = def.kind;
  const diff = def.diff;
  const maxCols = (def.len || 40) + 160;
  const w = new World(maxCols, ROWS);
  const L = {
    spawns: [], coins: [], gems: [], crates: [], chests: [], springs: [], platforms: [], hazards: [],
    decor: [], signs: [], checkpoints: [], arenas: [], bridges: [], goal: null, start: null,
  };
  let x = 0, g = 11;
  const hz = R.hazards;
  const pool = R.pool;
  const lava = hz.includes('lava');
  const ground = (c, top, tile) => { for (let r = top; r < ROWS; r++) w.set(c, r, tile || T_SOLID); };
  const flat = (n, tile) => { for (let i = 0; i < n; i++) ground(x + i, g, tile); x += n; };
  const px = (c) => c * TILE + TILE / 2;
  const gy = () => g * TILE;
  const enemyScale = kind === 'treasure' ? 0.3 : 1;
  const pickEnemy = (fly) => {
    let t = 'grunt';
    for (let i = 0; i < 12; i++) {
      t = rng.weighted(pool);
      if (fly === undefined || !!ENEMIES[t].flying === fly) return t;
    }
    return fly ? 'bat' : 'grunt';
  };
  const enemy = (c, type, groundY) => {
    type = type || pickEnemy();
    const fly = !!ENEMIES[type].flying;
    const yy = groundY != null ? groundY : gy();
    L.spawns.push({ type, x: px(c), y: fly ? yy - rng.int(70, 120) : yy });
  };
  const enemiesFor = (n) => {
    const per = diff < 1 ? 9.5 : diff < 3 ? 7.5 : 6.5;
    return Math.floor((n / per) * enemyScale + rng.next());
  };
  const coinArc = (c0, c1, baseY, hgt) => {
    const n = c1 - c0;
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0.5;
      L.coins.push({ x: px(c0 + i), y: baseY - 22 - Math.sin(t * Math.PI) * hgt });
    }
  };
  const coinLine = (c0, n, y) => { for (let i = 0; i < n; i++) L.coins.push({ x: px(c0 + i), y }); };
  const lavaPit = (c0, n) => {
    if (!lava) return;
    for (let i = 0; i < n; i++) { w.set(c0 + i, ROWS - 2, T_LAVA); w.set(c0 + i, ROWS - 1, T_SOLID); }
  };
  const addSign = (c, text) => L.signs.push({ x: px(c), y: gy(), text });
  const checkpoint = () => { flat(3); L.checkpoints.push({ x: px(x - 2), y: gy() }); };

  const C = {
    flat() {
      const n = rng.int(6, 10), c0 = x;
      flat(n);
      const ne = enemiesFor(n);
      for (let i = 0; i < ne; i++) enemy(c0 + rng.int(2, n - 2));
      if (rng.chance(kind === 'treasure' ? 0.9 : 0.4)) coinLine(c0 + 2, Math.min(4, n - 3), gy() - 22);
    },
    step() {
      let dy = rng.pick([-2, -1, 1, 2]);
      if (g <= 7) dy = Math.abs(dy);
      if (g >= 11) dy = -Math.abs(dy);
      const ng = clamp(g + dy, 6, 12);
      flat(2);
      if (ng < g) coinArc(x - 1, x + 1, ng * TILE, 30);
      g = ng;
      const c0 = x, n = rng.int(4, 7);
      flat(n);
      if (rng.chance(0.5 * enemyScale)) enemy(c0 + rng.int(1, n - 1));
    },
    gap() {
      flat(2);
      let gw = rng.int(2, diff < 0.5 ? 3 : 4);
      const ng = clamp(g + rng.int(-1, 1), 6, 12);
      if (ng < g) gw = Math.min(gw, 3);
      const c0 = x;
      lavaPit(c0, gw);
      x += gw;
      coinArc(c0 - 1, c0 + gw, Math.min(g, ng) * TILE, 64);
      g = ng;
      flat(3);
    },
    platGap() {
      flat(1);
      const gw = rng.int(6, 9), c0 = x;
      const pr = g - rng.int(1, 2);
      lavaPit(c0, gw);
      if (gw <= 7) {
        const pc = c0 + Math.floor((gw - 3) / 2);
        for (let i = 0; i < 3; i++) w.set(pc + i, pr, T_PLAT);
        coinLine(pc, 3, pr * TILE - 22);
      } else {
        const a = c0 + 2, b = c0 + gw - 3;
        for (let i = 0; i < 2; i++) { w.set(a + i, pr, T_PLAT); w.set(b + i, pr, T_PLAT); }
        coinLine(a, 2, pr * TILE - 22);
        coinLine(b, 2, pr * TILE - 22);
      }
      if (rng.chance(0.35 * enemyScale)) enemy(c0 + Math.floor(gw / 2), pickEnemy(true));
      x += gw;
      flat(2);
    },
    moving() {
      flat(1);
      const gw = rng.int(6, 9), c0 = x;
      const pw = 3 * TILE;
      lavaPit(c0, gw);
      L.platforms.push({ kind: 'move', x: c0 * TILE + 4, y: gy(), w: pw, h: 12, ax: c0 * TILE + 4, bx: (c0 + gw) * TILE - pw - 4, ay: gy(), by: gy(), speed: 70 + diff * 6 });
      coinLine(c0 + 1, gw - 2, gy() - 60);
      x += gw;
      flat(2);
    },
    spikes() {
      const n = rng.int(8, 11), c0 = x;
      flat(n);
      let c = c0 + 2;
      const maxS = diff < 1 ? 2 : 3;
      while (c < c0 + n - 2) {
        const s = rng.int(1, maxS);
        if (c + s > c0 + n - 2) break;
        for (let i = 0; i < s; i++) w.set(c + i, g - 1, T_SPIKE);
        coinArc(c - 1, c + s, gy(), 56);
        c += s + rng.int(2, 4);
      }
    },
    upper() {
      const n = rng.int(11, 14), c0 = x;
      flat(n);
      const p1 = c0 + 2, r1 = g - 3;
      for (let i = 0; i < 3; i++) w.set(p1 + i, r1, T_PLAT);
      const p2 = c0 + 6, r2 = g - 5;
      for (let i = 0; i < 3; i++) w.set(p2 + i, r2, T_PLAT);
      if (rng.chance(kind === 'treasure' ? 0.8 : 0.35)) L.chests.push({ x: px(p2 + 1), y: r2 * TILE });
      else coinLine(p2, 3, r2 * TILE - 22);
      coinLine(p1, 3, r1 * TILE - 22);
      if (n >= 13 && rng.chance(0.5)) {
        for (let i = 0; i < 2; i++) w.set(c0 + 10 + i, r1, T_PLAT);
        if (rng.chance(0.5)) L.gems.push({ x: px(c0 + 10) + 16, y: r1 * TILE - 24 });
      }
      const ne = enemiesFor(n);
      for (let i = 0; i < ne; i++) enemy(c0 + rng.int(1, n - 2));
    },
    wall() {
      flat(2);
      const h = rng.int(2, 3), wd = rng.int(2, 4), c0 = x;
      for (let i = 0; i < wd; i++) ground(x + i, g - h);
      x += wd;
      coinLine(c0, wd, (g - h) * TILE - 22);
      if (rng.chance(0.45 * enemyScale)) {
        const t = pool.some((p) => p[0] === 'archer') ? 'archer' : pickEnemy(false);
        enemy(c0 + Math.floor(wd / 2), t, (g - h) * TILE);
      }
      flat(3);
    },
    crates() {
      const n = rng.int(7, 9), c0 = x;
      flat(n);
      const k = rng.int(2, 4);
      for (let i = 0; i < k; i++) L.crates.push({ x: px(c0 + 1 + i * 2), y: gy() });
      if (rng.chance(0.4 * enemyScale)) enemy(c0 + n - 2);
    },
    spring() {
      flat(2);
      const c0 = x;
      flat(7);
      L.springs.push({ x: px(c0 + 1), y: gy() });
      const pr = Math.max(1, g - 7);
      for (let i = 0; i < 4; i++) w.set(c0 + 3 + i, pr, T_PLAT);
      for (let k = 2; k <= 5; k++) L.coins.push({ x: px(c0 + 1), y: gy() - k * 38 });
      if (rng.chance(0.5)) L.chests.push({ x: px(c0 + 5), y: pr * TILE });
      else L.gems.push({ x: px(c0 + 5), y: pr * TILE - 24 });
      coinLine(c0 + 3, 2, pr * TILE - 22);
    },
    falling() {
      flat(1);
      const gw = rng.int(7, 10), c0 = x;
      lavaPit(c0, gw);
      const count = gw >= 9 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const cx = c0 + Math.round(((i + 1) * gw) / (count + 1)) - 1;
        L.platforms.push({ kind: 'fall', x: cx * TILE, y: gy(), w: 64, h: 12, ax: cx * TILE, bx: cx * TILE, ay: gy(), by: gy(), speed: 0 });
        L.coins.push({ x: cx * TILE + 32, y: gy() - 40 });
      }
      x += gw;
      flat(2);
    },
    bridge() {
      flat(2);
      const gw = rng.int(8, 12), c0 = x;
      for (let i = 0; i < gw; i++) w.set(x + i, g, T_PLAT);
      L.bridges.push({ c0, c1: c0 + gw, y: gy() });
      lavaPit(c0, gw);
      x += gw;
      const ne = Math.max(1, enemiesFor(gw));
      for (let i = 0; i < ne; i++) enemy(c0 + rng.int(2, gw - 2), pickEnemy(false));
      coinLine(c0 + 2, gw - 4, gy() - 22);
      flat(2);
    },
    stairs() {
      const steps = rng.int(2, 3);
      const dir = g - steps >= 6 && (g >= 10 || rng.chance(0.5)) ? -1 : 1;
      for (let s = 0; s < steps; s++) {
        flat(2);
        g = clamp(g + dir, 6, 12);
      }
      flat(3);
      if (rng.chance(0.5 * enemyScale)) enemy(x - 2);
    },
    saw() {
      const n = rng.int(10, 12), c0 = x;
      flat(n);
      L.hazards.push({ type: 'saw', x0: px(c0 + 2), x1: px(c0 + n - 3), y: gy() - 15, r: 16, speed: 90 + diff * 10 });
      coinLine(c0 + 3, n - 6, gy() - 90);
    },
    fire() {
      const n = rng.int(10, 12), c0 = x;
      flat(n);
      const k = rng.int(2, 3);
      for (let i = 0; i < k; i++) L.hazards.push({ type: 'fire', x: px(c0 + 2 + i * 3), y: gy(), phase: i * 0.7, period: 2.8 });
    },
    icicle() {
      const n = rng.int(10, 12), c0 = x;
      flat(n);
      const cr = g - 5;
      for (let i = 1; i < n - 1; i++) w.set(c0 + i, cr, T_ICE);
      for (let k = 0; k < 3; k++) L.hazards.push({ type: 'icicle', x: px(c0 + 2 + k * 3), y: (cr + 1) * TILE });
      coinLine(c0 + 2, n - 4, cr * TILE - 22);
    },
    lava() {
      const n = rng.int(10, 12), c0 = x;
      flat(n);
      let c = c0 + 2;
      while (c < c0 + n - 3) {
        const s = rng.int(2, 3);
        if (c + s > c0 + n - 2) break;
        for (let i = 0; i < s; i++) w.set(c + i, g, T_LAVA);
        coinArc(c - 1, c + s, gy(), 56);
        c += s + rng.int(2, 3);
      }
    },
    iceRun() {
      const n = rng.int(10, 14), c0 = x;
      flat(n, T_ICE);
      const ne = enemiesFor(n);
      for (let i = 0; i < ne; i++) enemy(c0 + rng.int(2, n - 2));
    },
    lift() {
      const rise = rng.int(3, 4);
      if (g - rise < 5) { C.step(); return; }
      flat(2);
      const c0 = x, sw = 3;
      lavaPit(c0, sw);
      L.platforms.push({ kind: 'move', x: c0 * TILE, y: gy(), w: sw * TILE, h: 12, ax: c0 * TILE, bx: c0 * TILE, ay: gy(), by: (g - rise) * TILE, speed: 60 });
      x += sw;
      g -= rise;
      flat(5);
      coinLine(c0 + sw, 3, gy() - 22);
    },
  };

  const arenaChunk = (waves) => {
    flat(2);
    const n = 22, c0 = x;
    flat(n);
    if (rng.chance(0.6)) {
      for (let i = 0; i < 3; i++) { w.set(c0 + 4 + i, g - 3, T_PLAT); w.set(c0 + n - 7 + i, g - 3, T_PLAT); }
    }
    L.arenas.push({ x0: c0 * TILE, x1: (c0 + n) * TILE, gy: gy(), waves: waves || makeWaves(diff < 1 ? 2 : 3, diff, def.region, rng), done: false });
    flat(2);
  };

  const weights = () => {
    const tr = kind === 'treasure';
    return [
      ['flat', tr ? 2 : 3], ['step', 3], ['gap', 3], ['platGap', 2], ['spikes', hz.includes('spikes') ? 2 : 0.6],
      ['upper', tr ? 4 : 2], ['wall', 1.5], ['crates', tr ? 3 : 1.5], ['moving', diff >= 0.6 ? 2 : 0],
      ['spring', tr ? 3 : 1], ['falling', hz.includes('fall') ? 2 : 0], ['bridge', def.region === 1 ? 2.5 : 0.7],
      ['stairs', 1], ['saw', hz.includes('saw') ? 2 : 0], ['fire', hz.includes('fire') ? 2 : 0],
      ['icicle', hz.includes('icicle') ? 2 : 0], ['lava', lava ? 2.5 : 0], ['iceRun', hz.includes('ice') ? 1.5 : 0],
      ['lift', diff >= 1 ? 1 : 0],
    ].filter((e) => e[1] > 0);
  };

  const levelTo = (target) => {
    while (g < target) { flat(2); g++; }
    while (g > target) { flat(2); g--; }
  };

  if (kind === 'normal' || kind === 'treasure' || kind === 'boss') {
    flat(10);
    L.start = { x: px(3), y: gy() };
    if (def.tutorial) {
      addSign(5, 'Welcome, hero! {MOVE}');
      flat(6);
      addSign(x - 2, 'Press {JUMP} to jump. Press it again in mid-air to DOUBLE JUMP!');
      flat(2); g -= 2; flat(5);
      C.gap();
      flat(2);
      addSign(x - 1, 'An enemy! Press {ATTACK} repeatedly for a 3-hit combo.');
      flat(4); enemy(x + 3, 'grunt'); flat(8);
      addSign(x - 1, 'Hold UP + {ATTACK} for an uppercut launcher. In the air, hold DOWN + {ATTACK} to slam!');
      flat(3); enemy(x + 4, 'grunt'); enemy(x + 8, 'slime'); flat(12);
      addSign(x - 1, 'Smash crates for coins and loot!');
      C.crates();
      addSign(x, 'Use {DASH} to zip past danger. You are invincible while dashing!');
      flat(2);
      C.spikes();
      addSign(x + 1, 'Skills use ENERGY (blue bar). Hits recharge it. Try {SKILL}!');
      flat(4); enemy(x + 4, 'slime'); enemy(x + 7, 'grunt'); enemy(x + 10, 'bat'); flat(13);
      checkpoint();
      C.platGap();
      addSign(x + 1, 'Hold DOWN + {JUMP} to drop through wooden platforms.');
      C.upper();
      addSign(x + 1, 'Arenas lock you in until every enemy is defeated!');
      flat(3);
      arenaChunk([['grunt', 'slime'], ['grunt', 'grunt', 'bat']]);
      addSign(x + 1, 'Hurt? Drink a potion with the flask button (top-left). Now go reach the flag!');
      flat(4);
    } else {
      const target = def.len;
      let arenaPlaced = kind !== 'normal';
      let cpPlaced = kind === 'boss';
      let last = '';
      while (x < target) {
        if (!cpPlaced && x > target * 0.48) { levelTo(clamp(g, 8, 11)); checkpoint(); cpPlaced = true; }
        if (!arenaPlaced && x > target * 0.55) { arenaChunk(); arenaPlaced = true; continue; }
        const ws = weights().filter((e) => e[0] !== last);
        const ch = rng.weighted(ws);
        last = ch;
        C[ch]();
      }
    }
    if (kind === 'boss') {
      levelTo(11);
      flat(3);
      checkpoint();
      flat(2);
      const n = 26, c0 = x;
      flat(n);
      L.arenas.push({ x0: c0 * TILE, x1: (c0 + n) * TILE, gy: gy(), boss: def.boss, waves: [], done: false });
    } else {
      levelTo(clamp(g, 8, 11));
      flat(4);
      L.goal = { x: px(x + 3), y: gy() };
      flat(10);
    }
  } else {
    // arena-only stages: challenge / ambush / endless
    g = 11;
    const n = 30;
    flat(n);
    for (let i = 0; i < 4; i++) { w.set(5 + i, g - 3, T_PLAT); w.set(n - 9 + i, g - 3, T_PLAT); }
    for (let i = 0; i < 4; i++) w.set(13 + i, g - 5, T_PLAT);
    L.start = { x: px(Math.floor(n / 2)), y: gy() };
    const waves = kind === 'endless' ? [] : makeWaves(def.waves || 3, diff, def.region, rng);
    L.arenas.push({ x0: 0, x1: n * TILE, gy: gy(), waves, done: false, endless: kind === 'endless' });
  }

  // trim to used width
  const cols = x;
  const fw = new World(cols, ROWS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < cols; c++) fw.t[r * cols + c] = w.t[r * maxCols + c];
  L.world = fw;
  L.cols = cols;

  // decorations on walkable surfaces
  const decoRng = new RNG((def.seed || 1) + 99);
  for (let c = 0; c < cols; c++) {
    for (let r = 1; r < ROWS; r++) {
      const t = fw.get(c, r);
      if (t === T_SOLID) {
        const above = fw.get(c, r - 1);
        if (above === T_EMPTY && decoRng.chance(0.32)) {
          L.decor.push({ type: decoRng.pick(R.decor), x: c * TILE + decoRng.range(4, 28), y: r * TILE, s: decoRng.range(0.75, 1.2), v: decoRng.next() });
        }
        break;
      }
      if (t !== T_EMPTY) break;
    }
  }
  return L;
}
