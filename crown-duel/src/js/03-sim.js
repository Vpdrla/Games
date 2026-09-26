// ---------- Battle simulation ----------
// Pure game logic with no DOM access: used for offline battles, by the online host, and by tests.
// World space: x 0..18 (left to right), y 0..32 (team 1 at the top, team 0 at the bottom).
const AW = 18, AH = 32;
const RIVER_TOP = 15, RIVER_BOT = 17, RIVER_MID = 16;
const BRIDGES = [3.5, 14.5];
const BRIDGE_HALF = 1.5;
const SIM_DT = 1 / 30;
const REG_TIME = 180, OT_TIME = 60, DOUBLE_AT = 120;
const ELIXIR_RATE = 1 / 2.8;
const MAX_ENTS = 260;
const DEPLOY_TIME = 1;

// Tower slots for team 0 (bottom). Team 1 mirrors them vertically.
const TOWER_SLOTS = [
  { tt: 'princess', lane: 0, x: 3.5, y: 25.5, half: 1.5 },
  { tt: 'princess', lane: 1, x: 14.5, y: 25.5, half: 1.5 },
  { tt: 'king', lane: -1, x: 9, y: 29, half: 2 },
];
const mirrorY = (team, y) => (team === 0 ? y : AH - y);
const sideOf = (y) => (y > RIVER_MID ? 0 : 1);
const nearestBridge = (x) => (Math.abs(x - BRIDGES[0]) < Math.abs(x - BRIDGES[1]) ? BRIDGES[0] : BRIDGES[1]);

function formation(n) {
  if (n === 1) return [[0, 0]];
  if (n === 2) return [[-0.5, 0], [0.5, 0]];
  if (n === 3) return [[0, -0.45], [-0.5, 0.35], [0.5, 0.35]];
  if (n === 4) return [[-0.55, -0.45], [0.55, -0.45], [-0.55, 0.45], [0.55, 0.45]];
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = 0.42 * Math.sqrt(i + 0.5), a = i * 2.39996;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

class Sim {
  // o: { decks: [keys[8], keys[8]], levels: [{key: lvl}, {key: lvl}], kings: [lvl, lvl], seed }
  constructor(o) {
    this.rng = new RNG(o.seed || 1);
    this.t = 0;
    this.tick = 0;
    this.ents = [];
    this.nextId = 1;
    this.events = [];
    this.over = false;
    this.winner = -1;
    this.ot = false;
    this.endReason = '';
    this.anyDead = false;
    this.p = [0, 1].map((team) => {
      const deck = this.rng.shuffle(o.decks[team].slice());
      return {
        team, deck: o.decks[team].slice(), levels: o.levels[team] || {}, king: (o.kings && o.kings[team]) || 1,
        elixir: 5, hand: deck.slice(0, 4), queue: deck.slice(4), crowns: 0, spent: 0, leaked: 0, plays: 0,
      };
    });
    this.towers = [[], []];
    for (const team of [0, 1]) for (const s of TOWER_SLOTS) this.addTower(team, s);
  }

  ev(...a) { this.events.push(a); }
  lvl(team, key) { return this.p[team].levels[key] || 1; }
  elixirMult() { return this.t >= DOUBLE_AT ? 2 : 1; }
  timeLeft() { return this.ot ? REG_TIME + OT_TIME - this.t : REG_TIME - this.t; }

  addTower(team, s) {
    const lvl = this.p[team].king;
    const st = towerStats(s.tt, lvl);
    const y = mirrorY(team, s.y);
    const e = {
      id: this.nextId++, kind: 'tower', tt: s.tt, u: s.tt, lane: s.lane, team, lvl, st, x: s.x, y, px: s.x, py: y,
      r: st.r, half: s.half, hp: st.hp, maxHp: st.hp, air: false, mass: 999, active: s.tt !== 'king',
      cd: 0, target: null, attacking: false, stunT: 0, freezeT: 0, slowT: 0, slowAmt: 0, deployT: 0,
      fx: 0, fy: team === 0 ? -1 : 1, dead: false,
    };
    this.ents.push(e);
    this.towers[team].push(e);
  }

  // ---- deploying cards ----
  snap(v) { return Math.round(v * 2) / 2; }

  canPlace(team, key, x, y) {
    const c = CARDS[key];
    if (!c) return false;
    if (x < 0.5 || x > AW - 0.5 || y < 0.5 || y > AH - 0.5) return false;
    if (c.type === 'spell') return true;
    const r = c.type === 'building' ? UNITS[c.unit].r : 0.3;
    if (y + r > RIVER_TOP && y - r < RIVER_BOT) return false;
    for (const t of this.ents) {
      if (t.dead) continue;
      if (t.kind === 'tower') {
        if (Math.abs(x - t.x) < t.half + r && Math.abs(y - t.y) < t.half + r) return false;
      } else if (t.kind === 'building' && c.type === 'building') {
        if (Math.hypot(x - t.x, y - t.y) < t.r + r) return false;
      }
    }
    if (c.anywhere) return true;
    const ly = mirrorY(team, y);
    if (ly > RIVER_BOT) return true;
    if (ly < 10) return false;
    const enemy = this.towers[1 - team];
    if (x <= 9 && enemy[0].dead) return true;
    if (x >= 9 && enemy[1].dead) return true;
    return false;
  }

  play(team, slot, x, y) {
    if (this.over) return 'over';
    const p = this.p[team];
    const key = p.hand[slot];
    if (!key) return 'card';
    const c = CARDS[key];
    if (p.elixir < c.cost) return 'elixir';
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 'place';
    x = clamp(this.snap(x), 0.5, AW - 0.5);
    y = clamp(this.snap(y), 0.5, AH - 0.5);
    if (!this.canPlace(team, key, x, y)) return 'place';
    p.elixir -= c.cost;
    p.spent += c.cost;
    p.plays++;
    p.hand[slot] = p.queue.shift();
    p.queue.push(key);
    this.deploy(team, key, x, y, this.lvl(team, key));
    this.ev('play', team, key, x, y);
    return 'ok';
  }

  deploy(team, key, x, y, lvl) {
    const c = CARDS[key];
    if (c.type === 'spell') { this.castSpell(team, key, x, y, lvl); return; }
    if (c.anywhere) {
      const k = this.towers[team][2];
      const e = this.spawnUnit(team, c.unit, k.x, k.y, lvl, 0);
      if (e) { e.tunnel = { x, y }; e.untarget = true; }
      return;
    }
    const n = c.count || 1;
    const offs = formation(n);
    for (let i = 0; i < n; i++) {
      const o = offs[i];
      this.spawnUnit(team, c.unit, x + o[0], y + (team === 0 ? o[1] : -o[1]), lvl, DEPLOY_TIME + i * 0.03, sideOf(y));
    }
  }

  spawnUnit(team, ukey, x, y, lvl, deploy, side) {
    if (this.ents.length >= MAX_ENTS) return null;
    const st = unitStats(ukey, lvl);
    const e = {
      id: this.nextId++, kind: st.kind, u: ukey, team, lvl, st,
      x: clamp(x, st.r, AW - st.r), y: clamp(y, st.r, AH - st.r), px: 0, py: 0,
      r: st.r, mass: st.mass, air: !!st.air, hp: st.hp, maxHp: st.hp,
      deployT: deploy, target: null, attacking: false, cd: 0, retarget: 0,
      fx: 0, fy: team === 0 ? -1 : 1, stunT: 0, freezeT: 0, slowT: 0, slowAmt: 0,
      spawnT: st.spawn ? st.spawn.first : 0, pumpT: st.pump || 0, chargeD: 0, charging: false,
      rampT: 0, jumping: false, moving: false, dead: false, age: 0, lastAtk: -9,
    };
    if (!e.air && e.kind === 'troop' && e.y > RIVER_TOP && e.y < RIVER_BOT) {
      const s = side == null ? sideOf(e.y) : side;
      e.y = s === 0 ? RIVER_BOT + 0.05 : RIVER_TOP - 0.05;
    }
    e.px = e.x;
    e.py = e.y;
    this.ents.push(e);
    return e;
  }

  castSpell(team, key, x, y, lvl) {
    const s = spellStats(key, lvl);
    const k = this.towers[team][2];
    const kx = k.x, ky = k.y;
    this.ev('spell', team, s.spell, x, y, s.radius || 0);
    switch (s.spell) {
      case 'fireball':
        this.addProj(team, 'fireball', kx, ky, null, x, y, 10, s.dmg, { splash: s.radius, targets: 'any', towerMult: s.towerMult, knock: s.knock, h0: 3.2, h1: 0.2 });
        break;
      case 'arrows':
        this.addArea(team, 'arrows', x, y, s.radius, 1.1, { dmg: s.dmg, waves: [0.45, 0.7, 0.95], wi: 0, towerMult: s.towerMult });
        break;
      case 'zap':
        this.splash(team, x, y, s.radius, s.dmg, 'any', s.towerMult, { stun: s.stun });
        break;
      case 'freeze':
        this.splash(team, x, y, s.radius, s.dmg, 'any', s.towerMult, { freeze: s.freeze });
        this.addArea(team, 'freeze', x, y, s.radius, s.freeze, {});
        break;
      case 'poison':
        this.addArea(team, 'poison', x, y, s.radius, s.dur, { dps: s.dmg, slow: s.slow, towerMult: s.towerMult, tickT: 0.3 });
        break;
      case 'log': {
        const p = this.addProj(team, 'log', x, y, null, x, y, s.speed, s.dmg, { towerMult: s.towerMult, knock: s.knock, h0: 0, h1: 0 });
        p.dir = team === 0 ? -1 : 1;
        p.halfW = s.halfW;
        p.travel = s.travel;
        p.hit = new Set();
        break;
      }
    }
  }

  addProj(team, pt, x, y, tgt, tx, ty, speed, dmg, o) {
    const p = {
      id: this.nextId++, kind: 'proj', pt, team, x, y, px: x, py: y, sx: x, sy: y, tgt, tx, ty, speed, dmg,
      splash: o.splash || 0, targets: o.targets || 'any', towerMult: o.towerMult == null ? 1 : o.towerMult,
      slow: o.slow || 0, slowT: o.slowT || 0, knock: o.knock || 0, trav: 0, dead: false,
      h0: o.h0 == null ? 0.8 : o.h0, h1: o.h1 == null ? (tgt && tgt.air ? 1.5 : 0.5) : o.h1,
    };
    p.d0 = Math.max(0.1, Math.hypot(tx - x, ty - y));
    this.ents.push(p);
    return p;
  }

  addArea(team, sp, x, y, r, dur, o) {
    const a = Object.assign({ id: this.nextId++, kind: 'area', sp, team, x, y, px: x, py: y, r, dur, t: 0, dead: false }, o);
    this.ents.push(a);
    return a;
  }

  // ---- main update ----
  step() {
    if (this.over) return;
    const dt = SIM_DT;
    this.t += dt;
    this.tick++;
    const mult = this.elixirMult();
    for (const p of this.p) {
      const v = p.elixir + ELIXIR_RATE * mult * dt;
      if (v > 10) { p.leaked += v - 10; p.elixir = 10; } else p.elixir = v;
    }
    const n = this.ents.length;
    for (let i = 0; i < n; i++) {
      const e = this.ents[i];
      if (e.dead) continue;
      e.px = e.x;
      e.py = e.y;
      switch (e.kind) {
        case 'troop': this.updTroop(e, dt); break;
        case 'building': this.updBuilding(e, dt); break;
        case 'tower': this.updTower(e, dt); break;
        case 'proj': this.updProj(e, dt); break;
        case 'area': this.updArea(e, dt); break;
      }
    }
    this.collide();
    if (this.anyDead) {
      this.anyDead = false;
      this.ents = this.ents.filter((e) => !e.dead);
    }
    this.checkEnd();
  }

  checkEnd() {
    if (this.over) return;
    const c0 = this.p[0].crowns, c1 = this.p[1].crowns;
    if (this.towers[0][2].dead || this.towers[1][2].dead) {
      this.finish(this.towers[1][2].dead ? 0 : 1, 'king');
      return;
    }
    if (!this.ot && this.t >= REG_TIME) {
      if (c0 !== c1) { this.finish(c0 > c1 ? 0 : 1, 'time'); return; }
      this.ot = true;
      this.ev('ot');
    }
    if (this.ot) {
      if (c0 !== c1) { this.finish(c0 > c1 ? 0 : 1, 'ot'); return; }
      if (this.t >= REG_TIME + OT_TIME) {
        const low = (team) => Math.min(...this.towers[team].filter((t) => !t.dead).map((t) => Math.ceil(t.hp)));
        const a = low(0), b = low(1);
        this.finish(a === b ? -1 : a > b ? 0 : 1, 'tiebreak');
      }
    }
  }

  finish(w, why) {
    this.over = true;
    this.winner = w;
    this.endReason = why;
    this.ev('end', w, why);
  }

  // ---- status effects ----
  tickStatus(e, dt) {
    if (e.stunT > 0) e.stunT -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.freezeT > 0) { e.freezeT -= dt; return false; }
    return true;
  }
  stunEnt(o, t) {
    o.stunT = Math.max(o.stunT || 0, t);
    o.rampT = 0;
    o.charging = false;
    o.chargeD = 0;
    if (o.st && o.cd != null) o.cd = Math.max(o.cd, o.st.load || 0.3);
  }
  freezeEnt(o, t) {
    o.freezeT = Math.max(o.freezeT || 0, t);
    o.rampT = 0;
    o.charging = false;
    o.chargeD = 0;
  }
  slowEnt(o, amt, t) {
    o.slowAmt = Math.max(o.slowT > 0 ? o.slowAmt : 0, amt);
    o.slowT = Math.max(o.slowT || 0, t);
  }

  // ---- targeting ----
  validTarget(e, o) {
    if (o.dead || o.team === e.team || o.untarget || o.deployT > 0) return false;
    const k = o.kind;
    if (k !== 'troop' && k !== 'building' && k !== 'tower') return false;
    const tg = e.st.targets || 'any';
    if (tg === 'buildings') return k !== 'troop';
    if (o.air && tg === 'ground') return false;
    return true;
  }

  gap(e, o) {
    return Math.hypot(o.x - e.x, o.y - e.y) - o.r - (e.kind === 'tower' ? 0 : e.r);
  }

  inRange(e, o) { return this.gap(e, o) <= e.st.range; }

  findTarget(e, rangeOnly) {
    let best = null, bd = Infinity;
    const st = e.st, bOnly = st.targets === 'buildings';
    const lim = rangeOnly ? st.range : bOnly ? 99 : st.sight;
    for (const o of this.ents) {
      if (!this.validTarget(e, o)) continue;
      const d = this.gap(e, o);
      if (d > lim || d >= bd) continue;
      bd = d;
      best = o;
    }
    return best;
  }

  laneGoal(e) {
    const tw = this.towers[1 - e.team];
    const lane = e.x < 9 ? 0 : 1;
    return !tw[lane].dead ? tw[lane] : tw[2];
  }

  face(e, dx, dy) {
    const d = Math.hypot(dx, dy);
    if (d > 1e-5) { e.fx = dx / d; e.fy = dy / d; }
  }

  // ---- troops ----
  updTroop(e, dt) {
    e.age += dt;
    if (e.tunnel) { this.updTunnel(e, dt); return; }
    if (e.deployT > 0) {
      e.deployT -= dt;
      if (e.deployT <= 0) this.onLanded(e);
      return;
    }
    if (!this.tickStatus(e, dt)) { e.moving = false; return; }
    const st = e.st;
    if (st.spawn) this.tickSpawner(e, dt);
    if (e.stunT > 0) { e.moving = false; return; }
    const sm = e.slowT > 0 ? 1 - e.slowAmt : 1;
    let tg = e.target;
    if (tg && (!this.validTarget(e, tg) || (st.targets !== 'buildings' && this.gap(e, tg) > st.sight + 2))) {
      tg = e.target = null;
      e.attacking = false;
    }
    if (!e.attacking) {
      e.retarget -= dt;
      if (!tg || e.retarget <= 0) {
        e.retarget = 0.25;
        const nt = this.findTarget(e);
        if (nt) tg = e.target = nt;
      }
    }
    if (tg && this.inRange(e, tg)) {
      if (!e.attacking) { e.attacking = true; e.cd = Math.max(e.cd, st.load); }
      this.face(e, tg.x - e.x, tg.y - e.y);
      e.moving = false;
      e.cd -= dt * sm;
      if (e.cd <= 0) { e.cd += st.hs; this.attack(e, tg); }
      if (!e.charging) e.chargeD = 0;
    } else {
      e.attacking = false;
      if (e.cd > 0) e.cd = Math.max(0, e.cd - dt * sm);
      const g = tg || this.laneGoal(e);
      this.moveToward(e, g.x, g.y, dt, sm, tg);
    }
  }

  updTunnel(e, dt) {
    const t = e.tunnel;
    const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy), step = 4.5 * dt;
    this.face(e, dx, dy);
    e.moving = true;
    if (d <= step) {
      e.x = t.x;
      e.y = t.y;
      e.tunnel = null;
      e.untarget = false;
      e.deployT = 0.4;
      e.moving = false;
      this.ev('dig', e.id, e.x, e.y);
    } else {
      e.x += (dx / d) * step;
      e.y += (dy / d) * step;
    }
  }

  onLanded(e) {
    const z = e.st.deployZap;
    if (z) {
      this.splash(e.team, e.x, e.y, z.r, z.dmg, 'any', 0.35, { stun: z.stun, slow: z.slow, slowT: z.slowT });
      this.ev(z.stun ? 'zapfx' : 'frostfx', e.x, e.y, z.r);
    }
    this.ev('land', e.id, e.x, e.y, e.u);
  }

  tickSpawner(e, dt) {
    const sp = e.st.spawn;
    e.spawnT -= dt;
    if (e.spawnT > 0) return;
    e.spawnT += sp.every;
    const fy = e.team === 0 ? -1 : 1;
    for (let i = 0; i < sp.count; i++) {
      const ox = (i - (sp.count - 1) / 2) * 0.7;
      this.spawnUnit(e.team, sp.unit, e.x + ox, e.y + fy * (e.r + 0.35), e.lvl, 0.35, sideOf(e.y));
    }
    this.ev('summon', e.id, e.x, e.y);
  }

  moveToward(e, tx, ty, dt, sm, tgt) {
    const st = e.st;
    let spd = st.speed * sm;
    if (st.charge && e.charging) spd = st.charge.speed * sm;
    let wx = tx, wy = ty;
    if (!e.air && !st.jump) {
      const w = this.waypoint(e, tx, ty);
      wx = w[0];
      wy = w[1];
    }
    let dx = wx - e.x, dy = wy - e.y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-4) { e.moving = false; return; }
    dx /= d;
    dy /= d;
    // steer around towers and buildings that stand in the way
    if (!e.air) {
      for (const o of this.ents) {
        if (o.dead || o === tgt || (o.kind !== 'tower' && o.kind !== 'building')) continue;
        const vx = o.x - e.x, vy = o.y - e.y;
        const vd = Math.hypot(vx, vy);
        const clear = vd - o.r - e.r;
        if (clear > 0.9 || vd < 1e-4) continue;
        if (dx * vx + dy * vy <= 0) continue;
        let px = -vy / vd, py = vx / vd;
        if (px * dx + py * dy < 0 || (Math.abs(px * dx + py * dy) < 0.05 && px * (wx - o.x) < 0)) { px = -px; py = -py; }
        const k = 1.4 * (1 - Math.max(0, clear) / 0.9);
        dx += px * k;
        dy += py * k;
        const n2 = Math.hypot(dx, dy) || 1;
        dx /= n2;
        dy /= n2;
      }
    }
    const step = Math.min(d, spd * dt);
    e.x += dx * step;
    e.y += dy * step;
    this.face(e, dx, dy);
    e.moving = true;
    if (st.charge) {
      e.chargeD += step;
      if (!e.charging && e.chargeD >= st.charge.dist) { e.charging = true; this.ev('charge', e.id); }
    }
    if (st.jump) e.jumping = e.y > RIVER_TOP - 0.4 && e.y < RIVER_BOT + 0.4 && Math.abs(e.x - nearestBridge(e.x)) > BRIDGE_HALF - 0.3;
  }

  // Route ground troops over a bridge when their goal is across the river.
  waypoint(e, tx, ty) {
    const s1 = ty > RIVER_MID ? 0 : 1;
    const span = Math.max(0.05, BRIDGE_HALF - e.r * 0.6);
    if (e.y > RIVER_TOP - 0.05 && e.y < RIVER_BOT + 0.05) {
      const b = nearestBridge(e.x);
      if (Math.abs(e.x - b) <= BRIDGE_HALF + 0.2) {
        return [clamp(e.x, b - span, b + span), s1 === 0 ? RIVER_BOT + 0.7 : RIVER_TOP - 0.7];
      }
    }
    const s0 = e.y > RIVER_MID ? 0 : 1;
    if (s0 === s1) return [tx, ty];
    let best = BRIDGES[0], bc = Infinity;
    for (const b of BRIDGES) {
      const c = Math.abs(e.x - b) + Math.abs(tx - b);
      if (c < bc) { bc = c; best = b; }
    }
    const entryY = s0 === 0 ? RIVER_BOT + 0.3 : RIVER_TOP - 0.3;
    if (Math.abs(e.x - best) <= span && Math.abs(e.y - entryY) < 1.0) {
      return [clamp(e.x, best - span, best + span), s1 === 0 ? RIVER_BOT + 0.7 : RIVER_TOP - 0.7];
    }
    return [best, entryY];
  }

  attack(e, tg) {
    const st = e.st;
    let dmg = st.dmg;
    e.lastAtk = this.t;
    if (e.charging) {
      dmg *= st.charge.mult;
      e.charging = false;
      e.chargeD = 0;
      this.ev('lance', tg.id, tg.x, tg.y);
    }
    const tm = (o) => (o.kind === 'tower' ? st.towerMult : 1);
    if (st.kamikaze) {
      this.splash(e.team, tg.x, tg.y, st.splash, dmg, st.targets, 1, { freeze: st.freeze });
      this.ev('frostfx', tg.x, tg.y, st.splash);
      this.kill(e, true);
      return;
    }
    if (st.beam) {
      const stage = e.rampT < 2 ? 0 : e.rampT < 4 ? 1 : 2;
      this.hurt(tg, st.beam[stage] * tm(tg));
      return;
    }
    if (st.chain) {
      const list = [tg];
      for (const o of this.ents) {
        if (list.length >= st.chain) break;
        if (o !== tg && this.validTarget(e, o) && this.inRange(e, o)) list.push(o);
      }
      for (const o of list) {
        this.hurt(o, dmg * tm(o));
        this.stunEnt(o, st.stun);
        this.ev('bolt', e.x, e.y, o.x, o.y);
      }
      return;
    }
    if (st.proj) {
      const p = this.addProj(e.team, st.proj, e.x, e.y, tg, tg.x, tg.y, st.pspeed, dmg, {
        splash: st.splash, targets: st.targets, towerMult: st.towerMult, slow: st.slow, slowT: st.slowT,
        h0: e.air ? 1.6 : e.kind === 'building' ? 0.9 : 0.75, h1: tg.air ? 1.5 : tg.kind === 'tower' ? 1.2 : 0.45,
      });
      p.src = e.id;
      this.ev('shoot', e.id, st.proj);
      return;
    }
    if (st.splashSelf) {
      this.splash(e.team, e.x, e.y, e.r + st.splash, dmg, st.targets, st.towerMult);
      this.ev('spin', e.id, e.x, e.y);
      return;
    }
    this.hurt(tg, dmg * tm(tg));
    this.ev('hit', tg.id, tg.x, tg.y, st.dmg >= 300 ? 2 : 1, e.u);
  }

  // ---- buildings & towers ----
  updBuilding(e, dt) {
    e.age += dt;
    if (e.deployT > 0) {
      e.deployT -= dt;
      if (e.deployT <= 0) this.onLanded(e);
      return;
    }
    e.hp -= (e.maxHp / e.st.life) * dt;
    if (e.hp <= 0) { this.kill(e); return; }
    if (!this.tickStatus(e, dt)) { e.rampT = 0; return; }
    const st = e.st;
    if (st.spawn) this.tickSpawner(e, dt);
    if (st.pump) {
      e.pumpT -= dt;
      if (e.pumpT <= 0) {
        e.pumpT += st.pump;
        const p = this.p[e.team];
        p.elixir = Math.min(10, p.elixir + 1);
        this.ev('elx', e.team, e.x, e.y);
      }
    }
    if (!st.dmg) return;
    if (e.stunT > 0) { e.rampT = 0; return; }
    this.turretLogic(e, dt);
  }

  turretLogic(e, dt) {
    const st = e.st;
    let tg = e.target;
    if (tg && (!this.validTarget(e, tg) || !this.inRange(e, tg))) { tg = e.target = null; }
    if (!tg) {
      tg = e.target = this.findTarget(e, true);
      e.rampT = 0;
    }
    if (tg) {
      if (!e.attacking) { e.attacking = true; e.cd = Math.max(e.cd, st.load || 0); }
      this.face(e, tg.x - e.x, tg.y - e.y);
      if (st.beam) e.rampT += dt;
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd += st.hs;
        if (e.kind === 'tower') {
          const p = this.addProj(e.team, st.proj, e.x, e.y, tg, tg.x, tg.y, st.pspeed, st.dmg, { targets: 'any', h0: e.tt === 'king' ? 2.7 : 2.9, h1: tg.air ? 1.5 : 0.45 });
          p.src = e.id;
          this.ev('shoot', e.id, st.proj);
        } else this.attack(e, tg);
      }
    } else {
      e.attacking = false;
      if (e.cd > 0) e.cd = Math.max(0, e.cd - dt);
    }
  }

  updTower(e, dt) {
    if (!this.tickStatus(e, dt)) return;
    if (!e.active || e.stunT > 0) return;
    this.turretLogic(e, dt);
  }

  activateKing(k) {
    if (k.active || k.dead) return;
    k.active = true;
    this.ev('king', k.team);
  }

  // ---- projectiles & spell areas ----
  updProj(p, dt) {
    if (p.pt === 'log') { this.updLog(p, dt); return; }
    if (p.tgt) {
      if (!p.tgt.dead && !p.tgt.untarget) { p.tx = p.tgt.x; p.ty = p.tgt.y; } else p.tgt = null;
    }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
    if (d <= step + 0.05) {
      p.x = p.tx;
      p.y = p.ty;
      p.trav += d;
      this.impact(p);
      p.dead = true;
      this.anyDead = true;
      return;
    }
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    p.trav += step;
  }

  impact(p) {
    if (p.splash) {
      this.splash(p.team, p.tx, p.ty, p.splash, p.dmg, p.targets, p.towerMult, { slow: p.slow, slowT: p.slowT, knock: p.knock });
      this.ev('boom', p.tx, p.ty, p.splash, p.pt);
    } else if (p.tgt && !p.tgt.dead) {
      const o = p.tgt;
      this.hurt(o, p.dmg * (o.kind === 'tower' ? p.towerMult : 1));
      if (p.slow) this.slowEnt(o, p.slow, p.slowT);
      this.ev('phit', o.id, p.pt, o.x, o.y);
    }
  }

  updLog(p, dt) {
    const step = p.speed * dt;
    p.y += p.dir * step;
    p.trav += step;
    for (const o of this.ents) {
      if (o.dead || o.team === p.team || o.air || o.untarget) continue;
      if (o.kind !== 'troop' && o.kind !== 'building' && o.kind !== 'tower') continue;
      if (p.hit.has(o.id)) continue;
      if (Math.abs(o.x - p.x) <= p.halfW + o.r * 0.5 && Math.abs(o.y - p.y) <= 0.6 + o.r) {
        p.hit.add(o.id);
        this.hurt(o, p.dmg * (o.kind === 'tower' ? p.towerMult : 1));
        if (o.kind === 'troop' && o.mass < 15 && !o.dead) o.y = clamp(o.y + p.dir * p.knock, o.r, AH - o.r);
      }
    }
    if (p.trav >= p.travel || p.y < 0.5 || p.y > AH - 0.5) { p.dead = true; this.anyDead = true; }
  }

  updArea(a, dt) {
    a.t += dt;
    if (a.sp === 'arrows') {
      while (a.wi < a.waves.length && a.t >= a.waves[a.wi]) {
        this.splash(a.team, a.x, a.y, a.r, a.dmg, 'any', a.towerMult);
        a.wi++;
      }
    } else if (a.sp === 'poison') {
      a.tickT -= dt;
      if (a.tickT <= 0) {
        a.tickT += 1;
        this.splash(a.team, a.x, a.y, a.r, a.dps, 'any', a.towerMult, { slow: a.slow, slowT: 1.1 });
      }
    }
    if (a.t >= a.dur) { a.dead = true; this.anyDead = true; }
  }

  // ---- damage ----
  splash(team, x, y, r, dmg, targets, towerMult, eff) {
    for (const o of this.ents) {
      if (o.dead || o.team === team || o.untarget) continue;
      const k = o.kind;
      if (k !== 'troop' && k !== 'building' && k !== 'tower') continue;
      if (o.air && targets === 'ground') continue;
      if (targets === 'buildings' && k === 'troop') continue;
      const dd = Math.hypot(o.x - x, o.y - y);
      if (dd - o.r > r) continue;
      this.hurt(o, dmg * (k === 'tower' ? towerMult : 1));
      if (!eff || o.dead) continue;
      if (eff.stun) this.stunEnt(o, eff.stun);
      if (eff.freeze) this.freezeEnt(o, eff.freeze);
      if (eff.slow) this.slowEnt(o, eff.slow, eff.slowT);
      if (eff.knock && k === 'troop' && o.mass < 15) {
        const nx = dd > 0.01 ? (o.x - x) / dd : 0, ny = dd > 0.01 ? (o.y - y) / dd : (team === 0 ? -1 : 1);
        o.x = clamp(o.x + nx * eff.knock, o.r, AW - o.r);
        o.y = clamp(o.y + ny * eff.knock, o.r, AH - o.r);
      }
    }
  }

  hurt(o, dmg) {
    if (o.dead || dmg <= 0) return;
    o.hp -= Math.round(dmg);
    o.hurtT = this.t;
    if (o.kind === 'tower' && o.tt === 'king' && !o.active) this.activateKing(o);
    if (o.hp <= 0) this.kill(o);
  }

  kill(o, silent) {
    if (o.dead) return;
    o.dead = true;
    o.hp = 0;
    this.anyDead = true;
    if (o.kind === 'tower') { this.towerDown(o); return; }
    this.ev('die', o.id, o.u, o.x, o.y, o.air ? 1 : 0, o.team);
    if (silent) return;
    const st = o.st;
    if (st.deathDmg) {
      this.splash(o.team, o.x, o.y, st.deathDmg.r, st.deathDmg.dmg, 'ground', 1);
      this.ev('boom', o.x, o.y, st.deathDmg.r, o.u === 'balloon' ? 'bigbomb' : 'rock');
    }
    if (st.deathSpawn) {
      const ds = st.deathSpawn;
      const offs = formation(ds.count);
      for (let i = 0; i < ds.count; i++) {
        const f = offs[i];
        this.spawnUnit(o.team, ds.unit, o.x + f[0] * 1.3, o.y + f[1] * 1.3, o.lvl, 0.5, sideOf(o.y));
      }
    }
  }

  towerDown(o) {
    const other = 1 - o.team;
    this.ev('tower', o.id, o.team, o.tt, o.x, o.y);
    if (o.tt === 'king') {
      this.p[other].crowns = 3;
      for (const t of this.towers[o.team]) {
        if (t.dead) continue;
        t.dead = true;
        t.hp = 0;
        this.ev('tower', t.id, t.team, t.tt, t.x, t.y);
      }
    } else {
      this.p[other].crowns++;
      this.activateKing(this.towers[o.team][2]);
    }
  }

  // ---- collisions ----
  collide() {
    const tr = [], statics = [];
    for (const e of this.ents) {
      if (e.dead) continue;
      if (e.kind === 'troop') { if (e.deployT <= 0 && !e.tunnel) tr.push(e); } else if (e.kind === 'tower' || e.kind === 'building') statics.push(e);
    }
    const n = tr.length;
    for (let i = 0; i < n; i++) {
      const a = tr[i];
      if (a.jumping) continue;
      for (let j = i + 1; j < n; j++) {
        const b = tr[j];
        if (a.air !== b.air || b.jumping) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        if (dx >= rr || dx <= -rr || dy >= rr || dy <= -rr) continue;
        let d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        if (d2 < 1e-8) { dx = this.rng.next() - 0.5; dy = this.rng.next() - 0.5; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2), push = (rr - d) * 0.5;
        const ma = a.mass * (a.attacking ? 3 : 1), mb = b.mass * (b.attacking ? 3 : 1);
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push * wa;
        a.y -= ny * push * wa;
        b.x += nx * push * wb;
        b.y += ny * push * wb;
      }
    }
    for (const e of tr) {
      if (!e.air && !e.jumping) {
        for (const o of statics) {
          const rr = e.r + o.r;
          const dx = e.x - o.x, dy = e.y - o.y;
          if (dx >= rr || dx <= -rr || dy >= rr || dy <= -rr) continue;
          const d = Math.hypot(dx, dy);
          if (d >= rr) continue;
          if (d < 1e-4) { e.x += 0.05; continue; }
          e.x = o.x + (dx / d) * rr;
          e.y = o.y + (dy / d) * rr;
        }
        if (!e.st.jump) this.riverClamp(e);
      }
      e.x = clamp(e.x, e.r, AW - e.r);
      e.y = clamp(e.y, e.r, AH - e.r);
    }
  }

  riverClamp(e) {
    if (e.y <= RIVER_TOP || e.y >= RIVER_BOT) return;
    const b = nearestBridge(e.x);
    const span = BRIDGE_HALF - e.r * 0.5;
    if (Math.abs(e.x - b) <= span) return;
    if (e.py > RIVER_TOP && e.py < RIVER_BOT && Math.abs(e.px - b) <= span + 0.3) e.x = clamp(e.x, b - span, b + span);
    else e.y = e.py <= RIVER_MID ? RIVER_TOP : RIVER_BOT;
  }
}
