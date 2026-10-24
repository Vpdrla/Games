// ---------- Simulation ----------
// Pure, deterministic game logic (no DOM, no clocks, only sim.rng): used offline, by the online host
// and by every headless test. One step() = one tick of SIM_DT, in the fixed phase order of DESIGN.md.
// Brawler kits are data (03-brawlers.js); the do*() methods below interpret its primitives.
// Telemetry: fxn[slot * 4 + act] counts effects (hits, heals, statuses, buffs, broken walls) and
// dmgBy[slot * 4 + act] damage dealt to enemy brawlers, per action (0 other, 1 attack, 2 super,
// 3 gadget). Box tiles show up in EV.HIT with the id -1 - tileIndex.

class Sim {
  constructor(cfg) {
    this.cfg = cfg;
    this.modeKey = cfg.mode;
    this.mode = MODES[cfg.mode];
    if (!this.mode) throw new Error('Unknown mode ' + cfg.mode);
    this.map = cloneMap(parseMap(cfg.map));
    this.tiles0 = new Uint8Array(this.map.tiles); // for round resets
    this.seed = cfg.seed >>> 0;
    this.rng = new RNG(this.seed);
    this.tick = 0;
    this.t = 0;
    this.roundT0 = 0; // the poison clock starts here (Knockout restarts it every round)
    this.freezeT = 0; // > 0: the world stands still (goal celebration, between rounds)
    this.playT = 0; // time spent playing (sim.t minus the frozen time): mode clocks use it
    this.events = [];
    this.over = false;
    this.result = null;
    this.nextId = 1;
    this.shots = [];
    this.areas = [];
    this.pickups = [];
    this.deploys = [];
    this.ball = null;
    this.poison = null; // current safe rect {x0, y0, x1, y1, k} when the mode has poison
    this.poisonStage = 0;
    this.deathOrder = []; // slots in the order they went down (Showdown placement)
    const n = cfg.slots.length;
    this.nTeams = 0;
    for (const s of cfg.slots) this.nTeams = Math.max(this.nTeams, s.team + 1);
    this.inputs = new Uint32Array(n);
    this.fxn = new Uint32Array(n * 4);
    this.dmgBy = new Float64Array(n * 4);
    const m = this.map;
    this.boxHp = new Float32Array(m.w * m.h);
    this.hasBox = false;
    for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === TILE.BOX) { this.boxHp[i] = Sim.BOX_HP; this.hasBox = true; }
    // scratch objects, so the step allocates nothing but events and new entities
    this._in = {};
    this._o = { x: 0, y: 0 };
    this._o2 = { x: 0, y: 0 };
    this._ray = { tx: 0, ty: 0 };
    this._tg = { x: 0, y: 0, r: 0 };
    this._xStun = 0;
    this._xSlow = 0;
    this.brawlers = [];
    for (let i = 0; i < n; i++) this.brawlers.push(this.newBrawler(i, cfg.slots[i]));
    this.ms = {};
    this.mode.init(this);
    for (const b of this.brawlers) this.spawn(b, false);
    if (this.mode.poison) this.poison = poisonRect(m, 0, this.mode.poison, {});
    this.updateVision();
  }

  ev(...a) { this.events.push(a); }
  hud() { return this.mode.hud(this); }
  visibleTo(team, e) { return e.kind === K.BRAWLER ? ((e.vis >> team) & 1) === 1 : true; }
  setInput(slot, w) { this.inputs[slot] = w >>> 0; }
  dmgMul(b) { return LEVEL_MULT(b.lvl) * (1 + CUBE_DMG * b.cubes); }
  canAct(b) { return b.alive && b.stunT <= 0 && b.kbT <= 0 && b.dashT <= 0 && b.jumpT <= 0; }
  hittable(b) { return b.alive && b.jumpT <= 0; }

  newBrawler(slot, c) {
    const star = c.star == null ? -1 : c.star, gad = c.gadget == null ? -1 : c.gadget;
    if (!Object.prototype.hasOwnProperty.call(BRAWLERS, c.bk)) c = Object.assign({}, c, { bk: 'nova' }); // a bad key (from the network) can't break the sim
    const kit = brawlerKit(c.bk, star, gad);
    const lvl = c.lvl || 1;
    const hp = Math.round(kit.hp * LEVEL_MULT(lvl));
    return {
      id: this.nextId++, kind: K.BRAWLER, team: c.team, x: 0, y: 0, px: 0, py: 0, r: BRAWLER_R, dead: false,
      slot, bk: c.bk, lvl, gadget: kit.gad ? gad : -1, star, name: c.name || kit.D.name,
      hp, maxHp: hp, alive: true, respawnT: 0, face: 0,
      ammo: MAX_AMMO, reload: kit.reload, sup: 0, supReady: false, gadLeft: kit.gad ? 3 : 0, gadT: 0,
      cubes: 0, carry: 0, bounty: 0,
      vis: 0, inBush: false, revealT: 0, quietT: 0, shieldT: 0,
      stunT: 0, slowT: 0, slowF: 0, kbT: 0, kbx: 0, kby: 0, dashT: 0,
      invisT: 0, speedT: 0, speedF: 0,
      mvx: 0, mvy: 0, lastSeq: 0,
      st: { kills: 0, deaths: 0, dmg: 0, heal: 0, gems: 0, goals: 0, stars: 0 },
      // sim-private (the view may read jumpT/jumpTT for the jump arc, aimA/fireT/lastAct for poses)
      kit, pk: [c.bk, c.bk + '.atk', c.bk + '.sup', c.bk + '.gad'], speed: kit.speed,
      shieldF: 0, spawnSh: false, fireT: 9, faceT: 0, atkCd: 0, lastAct: 0, aimA: 0,
      bqN: 0, bqI: 0, bqT: 0, bqS: null, bqA: 0, bqAct: 0, bqMul: 1, bqStun: 0,
      dvx: 0, dvy: 0, dashS: null, dashAct: 0, dashHit: 0, dashHitD: 0, dashMul: 1,
      jumpT: 0, jumpTT: 0, jx0: 0, jy0: 0, jx1: 0, jy1: 0, jumpS: null, jumpAct: 0, jumpMul: 1,
      nxStun: 0, nxSlow: 0, regenAcc: 0, passAcc: 0, poisAcc: 0, killer: -1, dying: false,
    };
  }

  // (Re)places a brawler at the mode's spawn point with full health and ammo. Super charge and
  // gadget uses carry over, as in the original.
  spawn(b, re) {
    const p = this.mode.spawnPoint(this, b);
    b.x = b.px = p.x;
    b.y = b.py = p.y;
    b.alive = true;
    b.respawnT = 0;
    b.hp = b.maxHp;
    b.ammo = MAX_AMMO;
    this.clearStatus(b);
    b.shieldT = SPAWN_SHIELD_T;
    b.shieldF = 1;
    b.spawnSh = true;
    b.quietT = 0;
    b.face = b.y > this.map.h / 2 ? -Math.PI / 2 : Math.PI / 2;
    b.inBush = inBushAt(this.map, b.x, b.y);
    if (re) this.ev(EV.RESPAWN, b.slot, b.x, b.y);
  }

  clearStatus(b) {
    b.stunT = b.slowT = b.slowF = b.kbT = b.kbx = b.kby = b.dashT = 0;
    b.invisT = b.speedT = b.speedF = b.shieldT = b.shieldF = b.revealT = 0;
    b.spawnSh = false;
    b.bqN = 0; b.bqS = null; b.dashS = null; b.jumpT = 0; b.jumpS = null;
    b.mvx = b.mvy = 0; b.nxStun = b.nxSlow = 0; b.atkCd = 0; b.faceT = 0;
    b.poisAcc = 0.5; b.regenAcc = 0; b.passAcc = 0; b.killer = -1; b.dying = false;
  }

  // ================= step =================
  step() {
    if (this.over) return;
    this.tick++;
    this.t = this.tick * SIM_DT;
    const B = this.brawlers;
    if (this.freezeT > 0) { // nothing moves; the mode's thaw() picks up from here
      for (let i = 0; i < B.length; i++) { const b = B[i]; this.inputs[i] = 0; b.px = b.x; b.py = b.y; b.mvx = b.mvy = 0; }
      this.freezeT -= SIM_DT;
      if (this.freezeT <= 1e-9) { this.freezeT = 0; this.mode.thaw(this); this.updateVision(); }
      return;
    }
    this.playT += SIM_DT;
    // 1. inputs: move, then fire, in a per-tick shuffled order (tickOrder), so no slot wins every
    // same-tick tie (two stuns pressed together, two players going down together)
    const ord = this.tickOrder();
    for (let j = 0; j < ord.length; j++) this.applyInput(B[ord[j]]);
    this.stepDeploys(); // 2
    this.stepShots(); // 3
    this.stepAreas(); // 4
    this.stepPickups(); // 5
    this.mode.tick(this); // 6
    this.stepTimers(); // 7
    if (this.mode.poison) this.stepPoison(); // 8
    this.stepDeaths(); // 9
    this.compact(this.shots); this.compact(this.areas); this.compact(this.pickups); this.compact(this.deploys);
    this.updateVision(); // 10
    const r = this.mode.checkEnd(this); // 11
    if (r) this.end(r);
  }

  compact(arr) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) { const e = arr[i]; if (!e.dead) arr[j++] = e; }
    arr.length = j;
  }

  // ---- 1. inputs ----
  applyInput(b) {
    const w = this.inputs[b.slot];
    this.inputs[b.slot] = noAct(w); // actions are edges: a word left in place doesn't fire again
    b.px = b.x;
    b.py = b.y;
    if (!b.alive) { b.mvx = b.mvy = 0; return; }
    const I = unpackIn(w, this._in);
    const m = this.map, o = this._o, dt = SIM_DT;
    if (b.jumpT > 0) this.stepJump(b);
    else if (b.kbT > 0) {
      const k = Math.min(dt, b.kbT);
      moveCircle(m, b.x, b.y, b.r, b.kbx * k, b.kby * k, o);
      b.x = o.x; b.y = o.y;
      b.kbT = Math.max(0, b.kbT - dt);
    } else if (b.dashT > 0) this.stepDash(b);
    else if (b.stunT <= 0 && I.mvM > 0) {
      let k = b.speed * dt;
      if (b.slowT > 0) k *= 1 - b.slowF;
      if (b.speedT > 0) k *= 1 + b.speedF;
      moveCircle(m, b.x, b.y, b.r, I.mx * k, I.my * k, o);
      b.x = o.x; b.y = o.y;
      if (b.faceT <= 0) b.face = I.mvA;
      if (m.pads.length && (flagsAt(m, b.x, b.y) & TF_PAD)) this.padJump(b);
    }
    if (I.act && this.canAct(b) && !(this.mode.onAction && this.mode.onAction(this, b, I.act, I))) this.tryFire(b, I.act, I);
    if (b.bqN > 0) this.stepBurst(b);
    b.mvx = (b.x - b.px) / dt;
    b.mvy = (b.y - b.py) / dt;
  }

  tryFire(b, act, I) {
    const kit = b.kit;
    let s;
    if (act === ACT.ATTACK) {
      if (b.ammo < 1 || b.atkCd > 0 || b.bqN > 0) return false;
      s = kit.atk;
    } else if (act === ACT.SUPER) {
      if (!b.supReady || b.bqN > 0) return false;
      s = kit.sup;
    } else {
      s = kit.gad;
      if (!s || b.gadLeft <= 0 || b.gadT > 0) return false;
      if (s.req === 'deploy' && !this.deployOf(b.slot)) return false;
    }
    const range = s.range || s.dist || 0;
    let ang, d;
    if (I.auto) {
      const tg = range > 0 ? this.autoTarget(b, range) : null;
      if (tg && s.away) { ang = Math.atan2(b.y - tg.y, b.x - tg.x); d = range; } // escapes jump away
      else if (tg) { ang = Math.atan2(tg.y - b.y, tg.x - b.x); d = Math.min(range, Math.hypot(tg.x - b.x, tg.y - b.y)); }
      else { ang = b.face; d = range; }
    } else {
      ang = I.aimA;
      d = I.aimD * range;
    }
    if (act === ACT.ATTACK) {
      b.ammo -= 1;
      b.atkCd = s.cd || (s.burst ? (s.n - 1) * s.burst + 0.15 : 0.3);
    } else if (act === ACT.SUPER) {
      b.sup = 0;
      b.supReady = false;
    } else {
      b.gadLeft--;
      b.gadT = s.cd || 5;
    }
    // any action ends the spawn shield (before the action's own shield, so a gadget can't stretch it)
    if (b.spawnSh) { b.shieldT = 0; b.shieldF = 0; b.spawnSh = false; }
    if (act !== ACT.GADGET) {
      // attacking breaks cover: reveals, stops regen, ends invisibility
      b.quietT = 0;
      b.regenAcc = 0;
      b.revealT = REVEAL_T;
      b.invisT = 0;
    }
    b.face = ang; b.aimA = ang; b.faceT = 0.35; b.fireT = 0; b.lastAct = act;
    this.ev(EV.FIRE, b.slot, act, b.x, b.y, ang, b.lastSeq);
    if (act === ACT.ATTACK) {
      this._xStun = b.nxStun; this._xSlow = b.nxSlow;
      b.nxStun = 0; b.nxSlow = 0;
    }
    this.exec(b, s, act, ang, d, this.dmgMul(b));
    this._xStun = 0; this._xSlow = 0;
    if (act === ACT.ATTACK && kit.pass.atkHeal) this.heal(b, kit.pass.atkHeal * LEVEL_MULT(b.lvl), b.slot, ACT.ATTACK);
    return true;
  }

  // Runs one primitive (and its `then` follow-ups) for brawler b.
  exec(b, s, act, ang, d, mul) {
    switch (s.t) {
      case 'shot': this.doShot(b, s, act, ang, mul); break;
      case 'lob': this.doLob(b, s, act, ang, d, mul); break;
      case 'beam': this.doBeam(b, s, act, ang, mul); break;
      case 'arc': this.doArc(b, s, act, ang, mul); break;
      case 'dash': this.doDash(b, s, act, ang, mul); break;
      case 'leap': this.doLeap(b, s, act, ang, d, mul); break;
      case 'deploy': this.doDeploy(b, s, act, ang, d, mul); break;
      case 'area': this.doArea(b, s, act, ang, d, mul); break;
      case 'pulse': this.doPulse(b, s, act, mul); break;
      case 'heal': this.heal(b, s.amt * LEVEL_MULT(b.lvl), b.slot, act); break;
      case 'buff': this.doBuff(b, s, act); break;
      default: throw new Error('Unknown primitive ' + s.t);
    }
    if (s.then) for (let i = 0; i < s.then.length; i++) this.exec(b, s.then[i], act, ang, d, mul);
  }

  // Nearest enemy the shooter's team can see within range + 1 (brawlers first, then units, then
  // Showdown boxes). Returns a scratch {x, y} or null.
  autoTarget(b, range) {
    const R = range + 1, tg = this._tg, B = this.brawlers;
    let bd = R * R, found = false;
    for (let i = 0; i < B.length; i++) {
      const e = B[i];
      if (!e.alive || e.team === b.team || !((e.vis >> b.team) & 1)) continue;
      const d2 = dist2(b.x, b.y, e.x, e.y);
      if (d2 < bd) { bd = d2; tg.x = e.x; tg.y = e.y; found = true; }
    }
    if (found) return tg;
    for (let i = 0; i < this.deploys.length; i++) {
      const e = this.deploys[i];
      if (e.dead || e.team === b.team) continue;
      const d2 = dist2(b.x, b.y, e.x, e.y);
      if (d2 < bd) { bd = d2; tg.x = e.x; tg.y = e.y; found = true; }
    }
    if (found || !this.hasBox) return found ? tg : null;
    const m = this.map;
    const tx0 = Math.max(0, Math.floor(b.x - R)), tx1 = Math.min(m.w - 1, Math.floor(b.x + R));
    const ty0 = Math.max(0, Math.floor(b.y - R)), ty1 = Math.min(m.h - 1, Math.floor(b.y + R));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (m.tiles[ty * m.w + tx] !== TILE.BOX) continue;
        const d2 = dist2(b.x, b.y, tx + 0.5, ty + 0.5);
        if (d2 < bd) { bd = d2; tg.x = tx + 0.5; tg.y = ty + 0.5; found = true; }
      }
    }
    return found ? tg : null;
  }

  // ---- primitives ----
  doShot(b, s, act, ang, mul) {
    const n = s.n || 1;
    if (s.burst > 0) {
      // fired over several ticks from wherever the brawler is, along the original aim
      b.bqN = n; b.bqI = 0; b.bqT = 0; b.bqS = s; b.bqA = ang; b.bqAct = act; b.bqMul = mul; b.bqStun = this._xStun;
      return;
    }
    const sp = n > 1 ? s.spread || 0 : 0;
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? ang + (i / (n - 1) - 0.5) * sp : ang;
      this.spawnShot(b.slot, b.team, s, act, a, b.x, b.y, mul, this._xStun);
    }
  }

  stepBurst(b) {
    if (!this.canAct(b)) { b.bqN = 0; return; } // stunned or knocked back: the rest of the burst is lost
    b.bqT -= SIM_DT;
    const s = b.bqS;
    while (b.bqN > 0 && b.bqT <= 0) {
      const side = (b.bqI & 1 ? 1 : -1) * (s.jit || 0);
      const ox = b.x - Math.sin(b.bqA) * side, oy = b.y + Math.cos(b.bqA) * side;
      this.spawnShot(b.slot, b.team, s, b.bqAct, b.bqA, ox, oy, b.bqMul, b.bqStun);
      b.bqI++;
      b.bqN--;
      b.bqT += s.burst;
    }
    if (b.bqN <= 0) b.bqS = null;
  }

  // The online host (13-sync.js) wraps spawnShot to stream new shots to the guest and calls
  // stepStraight / stepLob to fast-forward the guest's own shots: keep these names and signatures.
  spawnShot(owner, team, s, act, ang, x, y, mul, xstun) {
    const c = Math.cos(ang), sn = Math.sin(ang), r = s.r || 0.15;
    const ob = this.brawlers[owner];
    const e = {
      id: this.nextId++, kind: K.SHOT, team, x, y, px: x, py: y, r, dead: false,
      owner, pk: s.pk || ob.pk[act], x0: x, y0: y, ang, spd: s.spd || 0, range: s.range || 0, trav: 0,
      dmg: (s.dmg || 0) * mul, pierce: !!s.pierce, hitMask: 0, sup: act === ACT.SUPER, breaks: !!s.breaks, lob: null,
      act, s, vx: c, vy: sn, r0: r, hitD: 0, bnc: s.bounce ? s.bounce.n : 0,
      heal: (s.heal || 0) * LEVEL_MULT(ob.lvl), stun: Math.max(s.stun || 0, xstun || 0), xslow: 0, beam: 0, ttl: 0, mul,
    };
    this.shots.push(e);
    this.ev(EV.SPAWN, e.id, K.SHOT);
    return e;
  }

  doLob(b, s, act, ang, d, mul) {
    const n = s.n || 1, self = s.at === 'self', m = this.map;
    const dist = self ? 0 : clamp(d, 0, s.range);
    const T = s.T * (self ? 1 : 0.6 + 0.4 * (s.range > 0 ? dist / s.range : 1)); // short throws land sooner
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const cx = b.x + ca * dist, cy = b.y + sa * dist;
    for (let i = 0; i < n; i++) {
      let tx = cx, ty = cy;
      if (s.ring) {
        const a = ang + (i / n) * TAU;
        tx = b.x + Math.cos(a) * s.ring; ty = b.y + Math.sin(a) * s.ring;
      } else if (n > 1 && s.gap) {
        const off = (i - (n - 1) / 2) * s.gap;
        tx = cx - sa * off; ty = cy + ca * off;
      } else if (n > 1 && s.spread) {
        const a = ang + (i / (n - 1) - 0.5) * s.spread;
        tx = b.x + Math.cos(a) * dist; ty = b.y + Math.sin(a) * dist;
      }
      tx = clamp(tx, 0.3, m.w - 0.3);
      ty = clamp(ty, 0.3, m.h - 0.3);
      const e = this.spawnShot(b.slot, b.team, s, act, Math.atan2(ty - b.y, tx - b.x), b.x, b.y, mul, this._xStun);
      const L = Math.hypot(tx - b.x, ty - b.y);
      e.range = L;
      e.spd = L / T;
      e.lob = { tx, ty, T, t: 0 };
      e.xslow = this._xSlow;
    }
  }

  doBeam(b, s, act, ang, mul) {
    const m = this.map, B = this.brawlers, D = this.deploys;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ex = b.x + ca * s.range, ey = b.y + sa * s.range;
    const tw = rayHit(m, b.x, b.y, ex, ey, TF_SHOT, this._ray);
    const wtx = this._ray.tx, wty = this._ray.ty;
    const tEnd = tw < 0 ? 1 : tw;
    const dmg = s.dmg * mul, chg = act === ACT.ATTACK ? s.chg || 0 : 0, w = s.w || 0.25;
    let mask = 0, first = null, ft = 2, len = s.range * tEnd;
    for (let i = 0; i < B.length; i++) {
      const e = B[i];
      if (!this.hittable(e) || e.team === b.team) continue;
      const t = segCircle(b.x, b.y, ex, ey, e.x, e.y, e.r + w);
      if (t < 0 || t > tEnd) continue;
      if (s.pierce) { mask |= 1 << e.slot; this.hurt(e, dmg, b.slot, act, act === ACT.SUPER ? 1 : 0, chg); this.applyMods(e, s, b.slot, act, ca, sa, 0); }
      if (t < ft) { ft = t; first = e; }
    }
    let firstD = null;
    for (let i = 0; i < D.length; i++) {
      const e = D[i];
      if (e.dead || e.team === b.team) continue;
      const t = segCircle(b.x, b.y, ex, ey, e.x, e.y, e.r + w);
      if (t < 0 || t > tEnd) continue;
      if (s.pierce) this.hurt(e, dmg, b.slot, act, 0, 0);
      else if (t < ft) { ft = t; first = null; firstD = e; }
    }
    if (!s.pierce) {
      if (first) { mask |= 1 << first.slot; this.hurt(first, dmg, b.slot, act, 0, chg); this.applyMods(first, s, b.slot, act, ca, sa, 0); }
      else if (firstD) this.hurt(firstD, dmg, b.slot, act, 0, 0);
      if (first || firstD) len = s.range * ft;
    }
    if (tw >= 0 && len >= s.range * tEnd - 1e-6 && tileAtT(m, wtx, wty) === TILE.BOX) this.hurtBox(wty * m.w + wtx, dmg, b.slot, act);
    this.beamFx(b.slot, b.team, act, b.x, b.y, ang, len, s.pk);
    if (s.chain && first) {
      // jumps on from the nearest enemy hit to the closest enemy not hit yet
      let from = first;
      for (let c = 0; c < s.chain.n; c++) {
        let best = null, bd = s.chain.r * s.chain.r;
        for (let i = 0; i < B.length; i++) {
          const e = B[i];
          if (!this.hittable(e) || e.team === b.team || ((mask >> e.slot) & 1)) continue;
          const d2 = dist2(from.x, from.y, e.x, e.y);
          if (d2 < bd) { bd = d2; best = e; }
        }
        if (!best) break;
        mask |= 1 << best.slot;
        this.hurt(best, dmg * s.chain.mul, b.slot, act, 0, chg);
        this.beamFx(b.slot, b.team, act, from.x, from.y, Math.atan2(best.y - from.y, best.x - from.x), Math.sqrt(bd), s.pk);
        from = best;
      }
    }
  }

  // A short-lived shot that only carries the beam's picture: from x0,y0 to x,y (`beam` = length).
  beamFx(owner, team, act, x, y, ang, len, pk) {
    const e = this.spawnShot(owner, team, Sim.BEAM_FX, act, ang, x, y, 0, 0);
    if (pk) e.pk = pk;
    e.x = e.px = x + Math.cos(ang) * len;
    e.y = e.py = y + Math.sin(ang) * len;
    e.range = e.trav = len;
    e.beam = Math.max(len, 0.01);
    e.ttl = 0.15;
  }

  doArc(b, s, act, ang, mul) {
    const B = this.brawlers, dmg = s.dmg * mul, chg = act === ACT.ATTACK ? s.chg || 0 : 0;
    for (let i = 0; i < B.length; i++) {
      const e = B[i];
      if (!this.hittable(e) || e.team === b.team) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d > s.range + e.r) continue;
      const a = Math.atan2(e.y - b.y, e.x - b.x);
      if (Math.abs(angDiff(ang, a)) > s.half + Math.atan2(e.r, Math.max(d, 0.01))) continue;
      if (!shotClear(this.map, b.x, b.y, e.x, e.y)) continue;
      this.hurt(e, dmg, b.slot, act, 0, chg);
      this.applyMods(e, s, b.slot, act, Math.cos(a), Math.sin(a), 0);
    }
    for (let i = 0; i < this.deploys.length; i++) {
      const e = this.deploys[i];
      if (e.dead || e.team === b.team || dist2(b.x, b.y, e.x, e.y) > (s.range + e.r) * (s.range + e.r)) continue;
      if (Math.abs(angDiff(ang, Math.atan2(e.y - b.y, e.x - b.x))) <= s.half + 0.3) this.hurt(e, dmg, b.slot, act, 0, 0);
    }
  }

  doDash(b, s, act, ang, mul) {
    b.dashT = s.dist / s.spd;
    b.dvx = Math.cos(ang) * s.spd;
    b.dvy = Math.sin(ang) * s.spd;
    b.dashS = s; b.dashAct = act; b.dashHit = 0; b.dashHitD = 0; b.dashMul = mul;
    b.bqN = 0;
    if (s.inv) {
      b.shieldT = Math.max(b.shieldT, b.dashT + 0.1);
      b.shieldF = 1;
      b.spawnSh = false;
      this.ev(EV.STATUS, b.slot, 5, b.dashT + 0.1);
    }
    if (!s.dmg) this.fxn[b.slot * 4 + act]++;
  }

  stepDash(b) {
    const o = this._o, dt = Math.min(SIM_DT, b.dashT), x0 = b.x, y0 = b.y;
    moveCircle(this.map, x0, y0, b.r, b.dvx * dt, b.dvy * dt, o);
    b.x = o.x; b.y = o.y;
    b.dashT -= SIM_DT;
    const s = b.dashS;
    if (s && s.dmg) {
      const B = this.brawlers, w = s.w || 0.4, chg = b.dashAct === ACT.ATTACK ? s.chg || 0 : 0;
      for (let i = 0; i < B.length; i++) {
        const e = B[i];
        if (!this.hittable(e) || e.team === b.team || ((b.dashHit >> e.slot) & 1)) continue;
        if (segCircle(x0, y0, b.x, b.y, e.x, e.y, e.r + w) < 0) continue;
        b.dashHit |= 1 << e.slot;
        this.hurt(e, s.dmg * b.dashMul, b.slot, b.dashAct, 0, chg);
        this.applyMods(e, s, b.slot, b.dashAct, b.dvx / s.spd, b.dvy / s.spd, 0);
      }
      for (let i = 0; i < this.deploys.length; i++) {
        const e = this.deploys[i];
        if (e.dead || e.team === b.team || ((b.dashHitD >> e.owner) & 1)) continue;
        if (segCircle(x0, y0, b.x, b.y, e.x, e.y, e.r + w) < 0) continue;
        b.dashHitD |= 1 << e.owner;
        this.hurt(e, s.dmg * b.dashMul, b.slot, b.dashAct, 0, 0);
      }
    }
    // stopped by a wall
    const want = Math.hypot(b.dvx, b.dvy) * dt;
    if (Math.hypot(b.x - x0, b.y - y0) < want * 0.4) b.dashT = 0;
    if (b.dashT <= 0) { b.dashT = 0; b.dashS = null; }
  }

  doLeap(b, s, act, ang, d, mul) {
    const dist = clamp(d, 0, s.range);
    const o = this.freeSpot(b.x + Math.cos(ang) * dist, b.y + Math.sin(ang) * dist, b.r, this._o2);
    const L = Math.hypot(o.x - b.x, o.y - b.y);
    this.startJump(b, o.x, o.y, s.T || 0.45 + 0.055 * L, s, act, mul);
    if (!s.dmg && !s.heal) this.fxn[b.slot * 4 + act]++;
  }

  startJump(b, tx, ty, T, s, act, mul) {
    b.jumpT = b.jumpTT = T;
    b.jx0 = b.x; b.jy0 = b.y; b.jx1 = tx; b.jy1 = ty;
    b.jumpS = s; b.jumpAct = act; b.jumpMul = mul;
    b.bqN = 0; b.dashT = 0; b.kbT = 0;
  }

  stepJump(b) {
    b.jumpT -= SIM_DT;
    const k = b.jumpT <= 0 ? 1 : 1 - b.jumpT / b.jumpTT;
    b.x = b.jx0 + (b.jx1 - b.jx0) * k;
    b.y = b.jy0 + (b.jy1 - b.jy0) * k;
    if (b.jumpT > 0) return;
    b.jumpT = 0;
    const s = b.jumpS;
    b.jumpS = null;
    const o = this._o;
    o.x = b.x; o.y = b.y;
    pushOut(this.map, o, b.r, TF_MOVE);
    b.x = o.x; b.y = o.y;
    if (!s) return; // jump pad
    if (s.breaks) this.breakCircle(b.x, b.y, s.r || 1, b.slot, b.jumpAct);
    if (s.dmg) this.blast(b.slot, b.team, b.jumpAct, b.x, b.y, s.r || 1, s.dmg * b.jumpMul, s, 0, 0);
    if (s.heal) this.heal(b, s.heal * LEVEL_MULT(b.lvl), b.slot, b.jumpAct);
  }

  padJump(b) {
    const m = this.map, tx = Math.floor(b.x), ty = Math.floor(b.y);
    for (const p of m.pads) {
      if (Math.floor(p.x) !== tx || Math.floor(p.y) !== ty) continue;
      const L = Math.hypot(p.tx - b.x, p.ty - b.y);
      this.startJump(b, p.tx, p.ty, 0.5 + 0.045 * L, null, 0, 1);
      return;
    }
  }

  deployOf(slot) {
    for (let i = 0; i < this.deploys.length; i++) { const d = this.deploys[i]; if (!d.dead && d.owner === slot) return d; }
    return null;
  }

  doDeploy(b, s, act, ang, d, mul) {
    const old = this.deployOf(b.slot);
    if (old) this.killDeploy(old); // one unit per owner
    const dist = clamp(d, 0, s.range), r = s.rad || 0.5;
    const o = this.freeSpot(b.x + Math.cos(ang) * dist, b.y + Math.sin(ang) * dist, r, this._o2);
    const hp = Math.round(s.hp * LEVEL_MULT(b.lvl));
    const e = {
      id: this.nextId++, kind: K.DEPLOY, team: b.team, x: o.x, y: o.y, px: o.x, py: o.y, r, dead: false,
      owner: b.slot, dk: s.dk, hp, maxHp: hp, face: ang, t: 0,
      s, act, mul, cd: 0.5, tgt: null, mvx: 0, mvy: 0, rateT: 0, rateF: 1, stunNext: 0,
    };
    this.deploys.push(e);
    this.ev(EV.SPAWN, e.id, K.DEPLOY);
    this.fxn[b.slot * 4 + act]++;
    if (s.land) this.blast(b.slot, b.team, act, e.x, e.y, s.land.r, s.land.dmg * mul, s.land, 0, 0);
  }

  killDeploy(e) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    this.ev(EV.DESPAWN, e.id, K.DEPLOY);
  }

  doArea(b, s, act, ang, d, mul) {
    let x = b.x, y = b.y;
    if (s.at !== 'self') {
      const dist = clamp(d, 0, s.range || 0);
      x = clamp(x + Math.cos(ang) * dist, 0.3, this.map.w - 0.3);
      y = clamp(y + Math.sin(ang) * dist, 0.3, this.map.h - 0.3);
    }
    this.spawnArea(b.slot, b.team, s, act, x, y, mul, 0, 0);
  }

  spawnArea(owner, team, a, act, x, y, mul, xslow, chg) {
    const ob = this.brawlers[owner];
    const e = {
      id: this.nextId++, kind: K.AREA, team, x, y, px: x, py: y, r: a.r, dead: false,
      owner, ak: a.ak || ob.pk[act], t: a.T, T: a.T, dmg: (a.dps || 0) * mul, heal: (a.hps || 0) * LEVEL_MULT(ob.lvl),
      slow: Math.max(a.slow || 0, xslow || 0), act, tickT: 0, chg: chg || 0,
    };
    this.areas.push(e);
    this.ev(EV.SPAWN, e.id, K.AREA);
    return e;
  }

  // Instant ring around the user: damage/knockback/stun/slow enemies, heal allies (and self).
  doPulse(b, s, act, mul) {
    const B = this.brawlers;
    if (s.dmg || s.kb || s.stun || s.slow) {
      this.blast(b.slot, b.team, act, b.x, b.y, s.r, (s.dmg || 0) * mul, s, s.stun || 0, 0);
    }
    if (s.heal) {
      const h = s.heal * LEVEL_MULT(b.lvl);
      for (let i = 0; i < B.length; i++) {
        const e = B[i];
        if (e.alive && e.team === b.team && dist2(b.x, b.y, e.x, e.y) <= (s.r + e.r) * (s.r + e.r)) this.heal(e, h, b.slot, act);
      }
    }
  }

  doBuff(b, s, act) {
    const B = this.brawlers;
    switch (s.what) {
      case 'shield':
        b.shieldF = b.shieldT > 0 ? Math.max(b.shieldF, s.f) : s.f;
        b.shieldT = Math.max(b.shieldT, s.T);
        b.spawnSh = false;
        this.ev(EV.STATUS, b.slot, 5, s.T);
        break;
      case 'speed':
        for (let i = 0; i < B.length; i++) {
          const e = B[i];
          if (!e.alive || e.team !== b.team) continue;
          if (e !== b && (!s.r || dist2(b.x, b.y, e.x, e.y) > s.r * s.r)) continue;
          e.speedT = s.T; e.speedF = s.f;
          this.ev(EV.STATUS, e.slot, 6, s.T);
        }
        break;
      case 'invis':
        b.invisT = s.T;
        this.ev(EV.STATUS, b.slot, 4, s.T);
        break;
      case 'ammo': b.ammo = Math.min(MAX_AMMO, b.ammo + s.v); break;
      case 'nextStun': b.nxStun = s.v; break;
      case 'nextSlow': b.nxSlow = s.v; break;
      case 'petStun': { const d = this.deployOf(b.slot); if (d) d.stunNext = s.v; break; }
      case 'deployRate': { const d = this.deployOf(b.slot); if (d) { d.rateT = s.T; d.rateF = s.v; } break; }
      default: throw new Error('Unknown buff ' + s.what);
    }
    this.fxn[b.slot * 4 + act]++;
  }

  // Damage (and knockback/stun/slow from `o`) to every enemy in a circle, units and boxes included.
  blast(src, team, act, x, y, r, dmg, o, stun, chg) {
    const B = this.brawlers;
    for (let i = 0; i < B.length; i++) {
      const e = B[i];
      if (!this.hittable(e) || e.team === team) continue;
      const d2 = dist2(x, y, e.x, e.y), rr = r + e.r;
      if (d2 > rr * rr) continue;
      if (dmg > 0) this.hurt(e, dmg, src, act, act === ACT.SUPER ? 1 : 0, chg);
      const d = Math.sqrt(d2) || 1;
      this.applyMods(e, o, src, act, d2 > 1e-6 ? (e.x - x) / d : 1, d2 > 1e-6 ? (e.y - y) / d : 0, stun);
    }
    if (dmg > 0) {
      for (let i = 0; i < this.deploys.length; i++) {
        const e = this.deploys[i];
        if (e.dead || e.team === team || dist2(x, y, e.x, e.y) > (r + e.r) * (r + e.r)) continue;
        this.hurt(e, dmg, src, act, 0, 0);
      }
      if (this.hasBox) this.hurtBoxesIn(x, y, r, dmg, src, act);
    }
  }

  // Knockback along (dx, dy), stun and slow from a spec onto a brawler.
  applyMods(e, s, src, act, dx, dy, xstun) {
    if (!s) return;
    if (s.kb) this.knock(e, dx, dy, s.kb, src, act);
    const st = Math.max(s.stun || 0, xstun || 0);
    if (st) this.stun(e, st, src, act);
    if (s.slow && s.slow.T) this.slow(e, s.slow.T, s.slow.f, src, act);
  }

  // ---- damage, healing, statuses ----
  // Hurts a brawler or unit. src: attacker slot (-1 none, e.g. poison); act: action for telemetry;
  // chg: super charge for the attacker when the target is a brawler. Returns the damage dealt.
  hurt(e, amt, src, act, crit, chg) {
    if (e.kind === K.BRAWLER) {
      if (!e.alive) return 0;
      if (e.shieldT > 0) amt *= 1 - e.shieldF;
      amt = Math.round(amt);
      if (amt <= 0) return 0;
      e.quietT = 0;
      e.regenAcc = 0;
      e.revealT = REVEAL_T;
      const dealt = Math.min(amt, e.hp);
      e.hp -= amt;
      if (e.hp <= 0) {
        e.hp = 0;
        if (!e.dying) { e.dying = true; e.killer = src; }
      }
      this.ev(EV.HIT, e.id, amt, e.x, e.y, src, crit || 0, act | 0);
      if (src >= 0) {
        const sb = this.brawlers[src];
        if (sb.team !== e.team) { sb.st.dmg += dealt; this.dmgBy[src * 4 + act] += dealt; }
        this.fxn[src * 4 + act]++;
        if (chg > 0) {
          this.charge(sb, chg);
          if (act === ACT.ATTACK) this.onAtkHit(sb);
        }
      }
      return dealt;
    }
    if (e.kind === K.DEPLOY) {
      if (e.dead) return 0;
      amt = Math.round(amt);
      if (amt <= 0) return 0;
      const dealt = Math.min(amt, e.hp);
      e.hp -= amt;
      this.ev(EV.HIT, e.id, amt, e.x, e.y, src, crit || 0);
      if (src >= 0) this.fxn[src * 4 + act]++;
      if (e.hp <= 0) this.killDeploy(e);
      return dealt;
    }
    return 0;
  }

  // Star powers that trigger when a main attack lands on an enemy brawler.
  onAtkHit(b) {
    const p = b.kit.pass;
    if (p.ammoOnHit) b.ammo = Math.min(MAX_AMMO, b.ammo + p.ammoOnHit);
    if (p.deployHeal) {
      const d = this.deployOf(b.slot);
      if (d) d.hp = Math.min(d.maxHp, d.hp + Math.round(p.deployHeal * LEVEL_MULT(b.lvl)));
    }
  }

  charge(b, amt) {
    if (b.supReady) return;
    b.sup += amt;
    if (b.sup >= 1 - 1e-9) {
      b.sup = 1;
      b.supReady = true;
      this.ev(EV.SUPER_READY, b.slot);
    }
  }

  heal(b, amt, src, act) {
    if (!b.alive || b.hp <= 0 || amt <= 0) return 0; // at 0 HP it goes down this tick, whatever heals it
    const real = Math.min(Math.round(amt), b.maxHp - b.hp);
    if (real <= 0) return 0;
    b.hp += real;
    this.ev(EV.HEAL, b.slot, real, b.x, b.y);
    if (src >= 0) { this.brawlers[src].st.heal += real; this.fxn[src * 4 + act]++; }
    return real;
  }

  immune(b) { return b.shieldT > 0 && b.shieldF >= 1; }

  knock(b, dx, dy, dist, src, act) {
    if (!b.alive || this.immune(b) || b.jumpT > 0) return;
    const T = 0.12 + dist * 0.05;
    b.kbT = T;
    b.kbx = dx * dist / T;
    b.kby = dy * dist / T;
    b.dashT = 0; b.dashS = null; b.bqN = 0;
    this.ev(EV.STATUS, b.slot, 3, T);
    if (src >= 0) this.fxn[src * 4 + act]++;
  }

  stun(b, t, src, act) {
    if (!b.alive || this.immune(b)) return;
    b.stunT = Math.max(b.stunT, t);
    b.dashT = 0; b.dashS = null; b.bqN = 0;
    this.ev(EV.STATUS, b.slot, 1, t);
    if (src >= 0) this.fxn[src * 4 + act]++;
  }

  slow(b, T, f, src, act) {
    if (!b.alive || this.immune(b)) return;
    const was = b.slowT > 0;
    b.slowT = Math.max(b.slowT, T);
    b.slowF = was ? Math.max(b.slowF, f) : f;
    if (!was) this.ev(EV.STATUS, b.slot, 2, T);
    if (src >= 0) this.fxn[src * 4 + act]++;
  }

  // Showdown power-cube boxes
  addCube(b) {
    b.cubes++;
    b.maxHp += CUBE_HP;
    if (b.alive && b.hp > 0) b.hp += CUBE_HP; // not for someone already going down this tick
  }

  // ---- tiles ----
  setTile(ti, t) {
    this.map.tiles[ti] = t;
    this.ev(EV.TILE, ti, t);
  }

  hurtBox(ti, amt, src, act) {
    const m = this.map;
    if (m.tiles[ti] !== TILE.BOX) return;
    amt = Math.round(amt);
    if (amt <= 0) return;
    this.boxHp[ti] -= amt;
    this.ev(EV.HIT, -1 - ti, amt, (ti % m.w) + 0.5, Math.floor(ti / m.w) + 0.5, src, 0);
    if (src >= 0) this.fxn[src * 4 + act]++;
    if (this.boxHp[ti] <= 0) this.destroyBox(ti);
  }

  destroyBox(ti) {
    const m = this.map, x = (ti % m.w) + 0.5, y = Math.floor(ti / m.w) + 0.5;
    this.boxHp[ti] = 0;
    this.setTile(ti, TILE.FLOOR);
    this.spawnPickup(PICK.CUBE, 1, x, y, x, y);
  }

  breakTile(ti, src, act) {
    const t = this.map.tiles[ti];
    if (t === TILE.WALL) this.setTile(ti, TILE.FLOOR);
    else if (t === TILE.BOX) this.destroyBox(ti);
    else return;
    if (src >= 0) this.fxn[src * 4 + act]++;
  }

  // Breaks WALL/BOX tiles touched by a circle of radius r swept from (x0,y0) to (x1,y1).
  breakAlong(x0, y0, x1, y1, r, src, act) {
    const m = this.map;
    const tx0 = Math.max(0, Math.floor(Math.min(x0, x1) - r)), tx1 = Math.min(m.w - 1, Math.floor(Math.max(x0, x1) + r));
    const ty0 = Math.max(0, Math.floor(Math.min(y0, y1) - r)), ty1 = Math.min(m.h - 1, Math.floor(Math.max(y0, y1) + r));
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ti = ty * m.w + tx, t = m.tiles[ti];
        if (t !== TILE.WALL && t !== TILE.BOX) continue;
        // closest point of the segment to the tile centre, then circle-vs-box there
        let k = l2 > 1e-12 ? ((tx + 0.5 - x0) * dx + (ty + 0.5 - y0) * dy) / l2 : 0;
        k = clamp(k, 0, 1);
        const px = x0 + dx * k, py = y0 + dy * k;
        const nx = clamp(px, tx, tx + 1), ny = clamp(py, ty, ty + 1);
        if ((px - nx) * (px - nx) + (py - ny) * (py - ny) < r * r) this.breakTile(ti, src, act);
      }
    }
  }

  breakCircle(x, y, r, src, act) { this.breakAlong(x, y, x, y, r, src, act); }

  hurtBoxesIn(x, y, r, amt, src, act) {
    const m = this.map;
    const tx0 = Math.max(0, Math.floor(x - r)), tx1 = Math.min(m.w - 1, Math.floor(x + r));
    const ty0 = Math.max(0, Math.floor(y - r)), ty1 = Math.min(m.h - 1, Math.floor(y + r));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (m.tiles[ty * m.w + tx] !== TILE.BOX) continue;
        const nx = clamp(x, tx, tx + 1), ny = clamp(y, ty, ty + 1);
        if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) this.hurtBox(ty * m.w + tx, amt, src, act);
      }
    }
  }

  // Nearest spot to (x, y) where a circle of radius r can stand. Writes out.x/out.y.
  freeSpot(x, y, r, out) {
    const m = this.map;
    x = clamp(x, r, m.w - r);
    y = clamp(y, r, m.h - r);
    out.x = x; out.y = y;
    if (!(flagsAt(m, x, y) & TF_MOVE)) {
      pushOut(m, out, r, TF_MOVE);
      if (!(flagsAt(m, out.x, out.y) & TF_MOVE)) return out;
    }
    const tx = Math.floor(x), ty = Math.floor(y);
    let best = Infinity;
    for (let R = 1; R <= 16 && best === Infinity; R++) {
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== R) continue;
          const cx = tx + dx, cy = ty + dy;
          if (flagsAtT(m, cx, cy) & TF_MOVE) continue;
          const d2 = dist2(x, y, cx + 0.5, cy + 0.5);
          if (d2 < best) { best = d2; out.x = cx + 0.5; out.y = cy + 0.5; }
        }
      }
    }
    if (best === Infinity) { out.x = x; out.y = y; }
    pushOut(m, out, r, TF_MOVE);
    return out;
  }

  // ---- 2. deploys ----
  stepDeploys() {
    const D = this.deploys, dt = SIM_DT;
    for (let i = 0; i < D.length; i++) {
      const d = D[i];
      if (d.dead) continue;
      d.px = d.x; d.py = d.y;
      d.t += dt;
      d.cd -= dt;
      if (d.rateT > 0) d.rateT -= dt;
      if (d.s.unit === 'turret') this.stepTurret(d);
      else this.stepPet(d);
      d.mvx = (d.x - d.px) / dt;
      d.mvy = (d.y - d.py) / dt;
    }
  }

  // Nearest enemy a unit's team can see within R: brawlers first, then other units.
  unitTarget(d, R, needClear) {
    const B = this.brawlers;
    let best = null, bd = R * R;
    for (let i = 0; i < B.length; i++) {
      const e = B[i];
      if (!this.hittable(e) || e.team === d.team || !((e.vis >> d.team) & 1)) continue;
      const d2 = dist2(d.x, d.y, e.x, e.y);
      if (d2 < bd && (!needClear || shotClear(this.map, d.x, d.y, e.x, e.y))) { bd = d2; best = e; }
    }
    if (best) return best;
    for (let i = 0; i < this.deploys.length; i++) {
      const e = this.deploys[i];
      if (e.dead || e.team === d.team) continue;
      const d2 = dist2(d.x, d.y, e.x, e.y);
      if (d2 < bd && (!needClear || shotClear(this.map, d.x, d.y, e.x, e.y))) { bd = d2; best = e; }
    }
    return best;
  }

  stepTurret(d) {
    const s = d.s;
    const tg = this.unitTarget(d, s.aggro, true);
    if (!tg) return;
    d.face = Math.atan2(tg.y - d.y, tg.x - d.x);
    if (d.cd > 0) return;
    d.cd += s.rate / (d.rateT > 0 ? d.rateF : 1);
    if (d.cd < 0) d.cd = 0;
    const e = this.spawnShot(d.owner, d.team, s.shot, d.act, d.face, d.x, d.y, d.mul, 0);
    e.sup = false; // the unit's own fire: drawn and counted as plain shots
  }

  stepPet(d) {
    const s = d.s, owner = this.brawlers[d.owner], dt = SIM_DT;
    let tg = d.tgt;
    if (tg) {
      const ok = tg.kind === K.BRAWLER ? this.hittable(tg) && ((tg.vis >> d.team) & 1) : !tg.dead;
      if (!ok || dist2(d.x, d.y, tg.x, tg.y) > s.aggro * s.aggro * 2) tg = null;
    }
    if (!tg) tg = this.unitTarget(d, s.aggro, false);
    d.tgt = tg;
    let gx, gy, stop;
    if (tg) { gx = tg.x; gy = tg.y; stop = s.reach * 0.7 + tg.r; }
    else if (owner.alive) { gx = owner.x; gy = owner.y; stop = 1.6; }
    else return;
    const dx = gx - d.x, dy = gy - d.y, dd = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    if (dd > stop) this.unitMove(d, a, Math.min(s.spd * dt, dd - stop));
    d.face = a;
    if (!tg || d.cd > 0 || dist2(d.x, d.y, tg.x, tg.y) > (s.reach + tg.r) * (s.reach + tg.r)) return;
    d.cd = s.rate;
    const isB = tg.kind === K.BRAWLER;
    this.hurt(tg, s.dmg * d.mul, d.owner, d.act, 0, isB ? s.chg || 0 : 0);
    if (isB && d.stunNext) { this.stun(tg, d.stunNext, d.owner, ACT.GADGET); d.stunNext = 0; }
    if (owner.kit.pass.petHeal) this.heal(owner, owner.kit.pass.petHeal * LEVEL_MULT(owner.lvl), owner.slot, d.act);
  }

  // Steps a unit towards angle a, trying small detours when a wall is in the way.
  unitMove(d, a, step) {
    const m = this.map, o = this._o;
    let bx = d.x, by = d.y, bm = -1;
    for (let k = 0; k < 7; k++) {
      const off = k === 0 ? 0 : (k & 1 ? 1 : -1) * 0.5 * ((k + 1) >> 1);
      const aa = a + off;
      moveCircle(m, d.x, d.y, d.r, Math.cos(aa) * step, Math.sin(aa) * step, o);
      // progress towards the goal direction
      const prog = (o.x - d.x) * Math.cos(a) + (o.y - d.y) * Math.sin(a);
      if (prog > bm) { bm = prog; bx = o.x; by = o.y; }
      if (prog >= step * 0.6) break;
    }
    d.x = bx; d.y = by;
  }

  // ---- 3. shots ----
  stepShots() {
    const S = this.shots, n0 = S.length; // shots spawned during this phase move from the next tick
    for (let i = 0; i < n0; i++) {
      const s = S[i];
      if (s.dead) continue;
      s.px = s.x; s.py = s.y;
      if (s.beam > 0) {
        s.ttl -= SIM_DT;
        if (s.ttl <= 0) { s.dead = true; this.ev(EV.SHOT_END, s.id, s.x, s.y, 0); }
      } else if (s.lob) this.stepLob(s);
      else this.stepStraight(s);
    }
  }

  stepStraight(s) {
    const m = this.map, B = this.brawlers, D = this.deploys, sp = s.s;
    let step = s.spd * SIM_DT;
    if (s.trav + step > s.range) step = Math.max(0, s.range - s.trav);
    const x0 = s.x, y0 = s.y, x1 = x0 + s.vx * step, y1 = y0 + s.vy * step;
    if (sp.grow) s.r = s.r0 + sp.grow * s.trav;
    if (s.breaks) this.breakAlong(x0, y0, x1, y1, s.r, s.owner, s.act);
    const tw = rayHit(m, x0, y0, x1, y1, TF_SHOT, this._ray);
    const wtx = this._ray.tx, wty = this._ray.ty;
    const tEnd = tw < 0 ? 1 : tw;
    if (s.dmg > 0) {
      let bt = 2, best = null;
      for (let i = 0; i < B.length; i++) {
        const e = B[i];
        if (!this.hittable(e) || e.team === s.team || ((s.hitMask >> e.slot) & 1)) continue;
        const t = segCircle(x0, y0, x1, y1, e.x, e.y, e.r + s.r);
        if (t < 0 || t > tEnd) continue;
        if (s.pierce) { s.hitMask |= 1 << e.slot; this.shotHit(s, e); } else if (t < bt) { bt = t; best = e; }
      }
      for (let i = 0; i < D.length; i++) {
        const e = D[i];
        if (e.dead || e.team === s.team || ((s.hitD >> e.owner) & 1)) continue;
        const t = segCircle(x0, y0, x1, y1, e.x, e.y, e.r + s.r);
        if (t < 0 || t > tEnd) continue;
        if (s.pierce) { s.hitD |= 1 << e.owner; this.shotHit(s, e); } else if (t < bt) { bt = t; best = e; }
      }
      if (best) {
        s.x = x0 + (x1 - x0) * bt;
        s.y = y0 + (y1 - y0) * bt;
        s.trav += step * bt;
        if (best.kind === K.BRAWLER) s.hitMask |= 1 << best.slot; else s.hitD |= 1 << best.owner;
        this.shotHit(s, best);
        if (s.bnc > 0 && this.bounce(s)) return;
        this.endShot(s, 0);
        return;
      }
    }
    if (s.heal > 0) {
      for (let i = 0; i < B.length; i++) {
        const e = B[i];
        if (!e.alive || e.team !== s.team || ((s.hitMask >> e.slot) & 1) || (e.slot === s.owner && !sp.hself)) continue;
        const t = segCircle(x0, y0, x1, y1, e.x, e.y, e.r + s.r);
        if (t < 0 || t > tEnd) continue;
        s.hitMask |= 1 << e.slot;
        this.heal(e, s.heal, s.owner, s.act);
      }
    }
    s.x = x0 + (x1 - x0) * tEnd;
    s.y = y0 + (y1 - y0) * tEnd;
    s.trav += step * tEnd;
    if (tw >= 0) {
      if (s.dmg > 0 && tileAtT(m, wtx, wty) === TILE.BOX) this.hurtBox(wty * m.w + wtx, s.dmg, s.owner, s.act);
      this.endShot(s, 1);
    } else if (s.trav >= s.range - 1e-6) this.endShot(s, 0);
  }

  shotHit(s, e) {
    const sp = s.s;
    let dmg = s.dmg, crit = s.sup ? 1 : 0;
    if (sp.ramp) {
      const k = clamp(s.trav / (sp.range || s.range || 1), 0, 1);
      dmg *= sp.ramp[0] + (sp.ramp[1] - sp.ramp[0]) * k;
      if ((sp.ramp[1] > sp.ramp[0] && k > 0.85) || (sp.ramp[1] < sp.ramp[0] && k < 0.15)) crit = 1;
    }
    const isB = e.kind === K.BRAWLER;
    const dealt = this.hurt(e, dmg, s.owner, s.act, crit, isB && s.act === ACT.ATTACK ? sp.chg || 0 : 0);
    if (isB) this.applyMods(e, sp, s.owner, s.act, s.vx, s.vy, s.stun);
    if (sp.steal && dealt > 0) this.heal(this.brawlers[s.owner], dealt * sp.steal, s.owner, s.act);
  }

  // Sends a bouncing shot on to the nearest enemy brawler it hasn't hit. False when there is none.
  bounce(s) {
    const B = this.brawlers, R = s.s.bounce.r;
    let best = null, bd = R * R;
    for (let i = 0; i < B.length; i++) {
      const e = B[i];
      if (!this.hittable(e) || e.team === s.team || ((s.hitMask >> e.slot) & 1)) continue;
      const d2 = dist2(s.x, s.y, e.x, e.y);
      if (d2 < bd) { bd = d2; best = e; }
    }
    if (!best) return false;
    s.bnc--;
    s.x0 = s.x; s.y0 = s.y;
    s.ang = Math.atan2(best.y - s.y, best.x - s.x);
    s.vx = Math.cos(s.ang); s.vy = Math.sin(s.ang);
    s.trav = 0;
    s.range = Math.sqrt(bd) + 1;
    return true;
  }

  endShot(s, wall) {
    s.dead = true;
    this.ev(EV.SHOT_END, s.id, s.x, s.y, wall);
    const sp = s.s.split;
    if (!sp) return;
    // spikes start just in front of a wall, not inside it
    const x = wall ? s.x - s.vx * 0.15 : s.x, y = wall ? s.y - s.vy * 0.15 : s.y;
    for (let i = 0; i < sp.n; i++) {
      const e = this.spawnShot(s.owner, s.team, sp, s.act, s.ang + ((i + 0.5) / sp.n) * TAU, x, y, s.mul, 0);
      e.hitMask = s.hitMask;
      e.hitD = s.hitD;
    }
  }

  stepLob(s) {
    const L = s.lob;
    L.t += SIM_DT;
    const k = Math.min(1, L.t / L.T);
    s.x = s.x0 + (L.tx - s.x0) * k;
    s.y = s.y0 + (L.ty - s.y0) * k;
    s.trav = s.range * k;
    if (k < 1) return;
    const sp = s.s, chg = s.act === ACT.ATTACK ? sp.chg || 0 : 0;
    if (sp.breaks) this.breakCircle(s.x, s.y, sp.blast || 1, s.owner, s.act);
    if (sp.blast && (s.dmg > 0 || sp.kb || s.stun)) this.blast(s.owner, s.team, s.act, s.x, s.y, sp.blast, s.dmg, sp, s.stun, chg);
    if (sp.area) this.spawnArea(s.owner, s.team, sp.area, s.act, s.x, s.y, s.mul, s.xslow, chg);
    this.endShot(s, 0);
  }

  // ---- 4. areas ----
  stepAreas() {
    const A = this.areas, B = this.brawlers, dt = SIM_DT;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.dead) continue;
      a.t -= dt;
      a.tickT -= dt;
      if (a.slow > 0) {
        // slows act every tick so walking out frees you at once
        for (let j = 0; j < B.length; j++) {
          const e = B[j];
          if (this.hittable(e) && e.team !== a.team && dist2(a.x, a.y, e.x, e.y) <= (a.r + e.r) * (a.r + e.r)) {
            if (e.slowT < 0.2) this.slow(e, 0.3, a.slow, a.owner, a.act);
            else { e.slowT = Math.max(e.slowT, 0.3); e.slowF = Math.max(e.slowF, a.slow); }
          }
        }
      }
      if (a.tickT <= 0 && a.t > 1e-6) { // ticks at 0, 0.5, ... < T; the last one covers only what's left
        a.tickT += Sim.AREA_TICK;
        this.areaTick(a, Math.min(1, (a.t + dt) / Sim.AREA_TICK));
      }
      if (a.t <= 0) { a.dead = true; this.ev(EV.DESPAWN, a.id, K.AREA); }
    }
  }

  // frac: share of a full tick (the last tick of an area whose duration isn't a multiple of AREA_TICK).
  // Like blasts, an area reaches anyone whose body overlaps it, not only those whose centre is inside.
  areaTick(a, frac) {
    const B = this.brawlers, k = Sim.AREA_TICK * (frac == null ? 1 : frac), rb = a.r + BRAWLER_R, r2 = rb * rb;
    if (a.dmg > 0) {
      const chg = a.act === ACT.ATTACK ? a.chg : 0;
      for (let i = 0; i < B.length; i++) {
        const e = B[i];
        if (this.hittable(e) && e.team !== a.team && dist2(a.x, a.y, e.x, e.y) <= r2) this.hurt(e, a.dmg * k, a.owner, a.act, 0, chg);
      }
      for (let i = 0; i < this.deploys.length; i++) {
        const e = this.deploys[i];
        if (!e.dead && e.team !== a.team && dist2(a.x, a.y, e.x, e.y) <= (a.r + e.r) * (a.r + e.r)) this.hurt(e, a.dmg * k, a.owner, a.act, 0, 0);
      }
      if (this.hasBox) this.hurtBoxesIn(a.x, a.y, a.r, a.dmg * k, a.owner, a.act);
    }
    if (a.heal > 0) {
      for (let i = 0; i < B.length; i++) {
        const e = B[i];
        if (e.alive && e.team === a.team && dist2(a.x, a.y, e.x, e.y) <= r2) this.heal(e, a.heal * k, a.owner, a.act);
      }
    }
    const ob = this.brawlers[a.owner];
    if (ob.kit.pass.fieldHeal && a.act === ACT.SUPER && ob.alive && dist2(a.x, a.y, ob.x, ob.y) <= r2) {
      this.heal(ob, ob.kit.pass.fieldHeal * k * LEVEL_MULT(ob.lvl), ob.slot, a.act);
    }
  }

  // ---- 5. pickups ----
  spawnPickup(pick, n, x, y, tx, ty) {
    const T = 0.35, pop = tx !== x || ty !== y;
    const e = {
      id: this.nextId++, kind: K.PICKUP, team: -1, x, y, px: x, py: y, r: 0.3, dead: false,
      pick, n, vx: pop ? (tx - x) / T : 0, vy: pop ? (ty - y) / T : 0, t: 0, popT: pop ? T : 0,
    };
    this.pickups.push(e);
    this.ev(EV.SPAWN, e.id, K.PICKUP);
    return e;
  }

  // A random free point dmin..dmax tiles from (x, y) (sim.rng), for gems popping out and drops.
  scatterSpot(x, y, dmin, dmax, out) {
    const m = this.map;
    for (let k = 0; k < 12; k++) {
      const a = this.rng.range(0, TAU), d = this.rng.range(dmin, dmax);
      const tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d;
      if (tx < 0.5 || ty < 0.5 || tx > m.w - 0.5 || ty > m.h - 0.5) continue;
      if (flagsAt(m, tx, ty) & TF_MOVE) continue;
      out.x = tx; out.y = ty;
      pushOut(m, out, 0.3, TF_MOVE);
      if (!(flagsAt(m, out.x, out.y) & TF_MOVE)) return out;
    }
    return this.freeSpot(x, y, 0.3, out);
  }

  // One pickup popping out of (x, y) to a free spot dmin..dmax away (the gem mine).
  popPickup(pick, n, x, y, dmin, dmax) {
    const o = this.scatterSpot(x, y, dmin, dmax, this._o2);
    return this.spawnPickup(pick, n, x, y, o.x, o.y);
  }

  // `count` single pickups scattered around (x, y), e.g. the gems of a fallen carrier.
  dropPickups(pick, count, x, y) {
    if (count <= 0) return;
    for (let i = 0; i < count; i++) {
      const o = this.scatterSpot(x, y, 0.4, 1.4 + Math.min(1, count / 10), this._o2);
      this.spawnPickup(pick, 1, x, y, o.x, o.y);
    }
    this.ev(EV.DROP, pick, count, x, y);
  }

  stepPickups() {
    const P = this.pickups, B = this.brawlers, dt = SIM_DT, nb = B.length;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p.dead) continue;
      p.px = p.x; p.py = p.y;
      p.t += dt;
      if (p.popT > 0) {
        const k = Math.min(dt, p.popT);
        p.x += p.vx * k; p.y += p.vy * k;
        p.popT -= dt;
        if (p.popT <= 0) { p.popT = 0; p.vx = p.vy = 0; }
      }
      if (p.t < 0.3) continue;
      // rotate who gets the first try so no slot wins every tie
      for (let j = 0; j < nb; j++) {
        const b = B[(j + this.tick) % nb];
        if (!this.hittable(b) || b.hp <= 0 || dist2(b.x, b.y, p.x, p.y) > (b.r + p.r) * (b.r + p.r)) continue;
        if (!this.mode.onPickup(this, b, p)) continue;
        p.dead = true;
        this.ev(EV.PICKUP, b.slot, p.pick, p.n, p.x, p.y);
        this.ev(EV.DESPAWN, p.id, K.PICKUP);
        break;
      }
    }
  }

  // ---- 7. timers ----
  stepTimers() {
    const B = this.brawlers, dt = SIM_DT;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.alive) {
        if (b.respawnT > 0) {
          b.respawnT -= dt;
          if (b.respawnT <= 0) {
            if (this.mode.canRespawn(this, b)) this.spawn(b, true);
            else b.respawnT = -1;
          }
        }
        continue;
      }
      b.fireT += dt;
      b.quietT += dt;
      if (b.stunT > 0) b.stunT = Math.max(0, b.stunT - dt);
      if (b.slowT > 0) { b.slowT -= dt; if (b.slowT <= 0) { b.slowT = 0; b.slowF = 0; } }
      if (b.revealT > 0) b.revealT = Math.max(0, b.revealT - dt);
      if (b.invisT > 0) b.invisT = Math.max(0, b.invisT - dt);
      if (b.speedT > 0) { b.speedT -= dt; if (b.speedT <= 0) { b.speedT = 0; b.speedF = 0; } }
      if (b.shieldT > 0) { b.shieldT -= dt; if (b.shieldT <= 0) { b.shieldT = 0; b.shieldF = 0; b.spawnSh = false; } }
      if (b.faceT > 0) b.faceT = Math.max(0, b.faceT - dt);
      if (b.atkCd > 0) b.atkCd = Math.max(0, b.atkCd - dt);
      if (b.gadT > 0) b.gadT = Math.max(0, b.gadT - dt);
      const pass = b.kit.pass;
      if (b.ammo < MAX_AMMO) {
        let rate = 1 / b.reload;
        if (pass.moveReload && (b.mvx !== 0 || b.mvy !== 0)) rate *= 1 + pass.moveReload;
        b.ammo = Math.min(MAX_AMMO, b.ammo + rate * dt);
      }
      // regeneration comes in 1 s ticks once the brawler has been quiet for REGEN_DELAY
      if (b.quietT >= REGEN_DELAY && b.hp < b.maxHp) {
        b.regenAcc -= dt;
        if (b.regenAcc <= 0) { b.regenAcc += 1; this.heal(b, b.maxHp * REGEN_RATE, -1, 0); }
      } else b.regenAcc = 0;
      if (pass.invisHeal) {
        b.passAcc += dt;
        if (b.passAcc >= 0.5) {
          b.passAcc -= 0.5;
          if (b.invisT > 0) this.heal(b, pass.invisHeal * 0.5 * LEVEL_MULT(b.lvl), b.slot, ACT.SUPER);
        }
      }
    }
  }

  // ---- 8. poison ----
  stepPoison() {
    const sch = this.mode.poison, pt = this.t - this.roundT0, dt = SIM_DT;
    const P = (this.poison = poisonRect(this.map, pt, sch, this.poison || {}));
    if (pt < sch.start) return;
    if (this.poisonStage === 0) { this.poisonStage = 1; this.ev(EV.POISON, 1); }
    if (this.poisonStage === 1 && pt >= sch.start + sch.shrink) { this.poisonStage = 2; this.ev(EV.POISON, 2); }
    const B = this.brawlers;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.alive) continue;
      // inside: the clock winds back up to 0.5 s (a one-tick dip doesn't reset it)
      if (b.x >= P.x0 && b.x <= P.x1 && b.y >= P.y0 && b.y <= P.y1) { if (b.poisAcc < 0.5) b.poisAcc = Math.min(0.5, b.poisAcc + dt); continue; }
      b.poisAcc -= dt;
      if (b.poisAcc <= 0) {
        b.poisAcc += 1;
        this.hurt(b, sch.dmg || 1000, -1, 0, 0, 0);
      }
    }
  }

  // ---- 9. deaths ----
  stepDeaths() {
    const B = this.brawlers, ord = this._ord;
    for (let j = 0; j < ord.length; j++) {
      const b = B[ord[j]];
      if (b.alive && b.hp <= 0) this.die(b);
    }
  }

  // The slots in an order that changes every tick (a hash of tick and slot; no RNG draws, no
  // allocation). Fair to every pair of slots over time, unlike a plain rotation.
  tickOrder() {
    const n = this.brawlers.length;
    const ord = this._ord || (this._ord = new Int8Array(n)), key = this._ordK || (this._ordK = new Uint32Array(n));
    for (let i = 0; i < n; i++) {
      let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(this.tick, 0x85ebca6b)) >>> 0;
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
      h = (h ^ (h >>> 12)) >>> 0;
      key[i] = h;
      let j = i;
      while (j > 0 && key[ord[j - 1]] > h) { ord[j] = ord[j - 1]; j--; }
      ord[j] = i;
    }
    return ord;
  }

  die(b) {
    const k = b.killer >= 0 ? this.brawlers[b.killer] : null;
    const killer = k && k.team !== b.team ? k : null;
    b.alive = false;
    b.st.deaths++;
    if (killer) killer.st.kills++;
    this.ev(EV.KILL, b.slot, killer ? killer.slot : -1, b.x, b.y);
    this.deathOrder.push(b.slot);
    this.clearStatus(b);
    if (this.ball && this.ball.holder === b.slot) this.dropBall();
    this.mode.onKill(this, b, killer);
    if (killer && killer.alive && killer.kit.pass.killHeal) this.heal(killer, killer.kit.pass.killHeal * LEVEL_MULT(killer.lvl), killer.slot, 0);
    b.respawnT = this.mode.canRespawn(this, b) ? RESPAWN_T : -1;
  }

  // ---- 10. vision ----
  // Walls never block sight. Hidden from a team: in a bush (and not revealed) unless one of its
  // living members is within REVEAL_R, or invisible unless one is within INVIS_R.
  updateVision() {
    const B = this.brawlers, m = this.map, all = (1 << this.nTeams) - 1;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.alive) { b.inBush = false; b.vis = 1 << b.team; continue; }
      b.inBush = inBushAt(m, b.x, b.y);
      const bush = b.inBush && b.revealT <= 0, inv = b.invisT > 0;
      if (!bush && !inv) { b.vis = all; continue; }
      const R = inv ? Sim.INVIS_R : REVEAL_R, R2 = R * R;
      let vis = 1 << b.team;
      for (let j = 0; j < B.length; j++) {
        const o = B[j];
        if (o.alive && o.team !== b.team && dist2(b.x, b.y, o.x, o.y) <= R2) vis |= 1 << o.team;
      }
      b.vis = vis;
    }
  }

  // ---- 11. end ----
  // Result builder for modes: fills mvp, rank and stats.
  makeResult(winner, reason, score, rank) {
    return { winner, rank: rank || this.rankByScore(), mvp: this.mvpOf(winner), reason, score: score || [0, 0], stats: this.brawlers.map((b) => Object.assign({}, b.st)) };
  }

  end(r) {
    if (r.mvp == null) r.mvp = this.mvpOf(r.winner);
    if (!r.rank) r.rank = this.rankByScore();
    if (!r.stats) r.stats = this.brawlers.map((b) => Object.assign({}, b.st));
    if (!r.score) r.score = [0, 0];
    this.over = true;
    this.result = r;
    this.ev(EV.END);
  }

  perfScore(b) {
    const s = b.st;
    return s.kills * 3 + s.dmg / 1000 + s.heal / 1500 + s.gems * 1.5 + s.goals * 5 + s.stars * 1.5 - s.deaths * 0.5;
  }

  // Best performer of the winning team (of everyone on a draw or in Showdown).
  mvpOf(winner) {
    let best = -1, bs = -Infinity;
    for (const b of this.brawlers) {
      if (winner >= 0 && this.nTeams === 2 && b.team !== winner) continue;
      const s = this.perfScore(b);
      if (s > bs) { bs = s; best = b.slot; }
    }
    return best;
  }

  rankByScore() {
    return this.brawlers.map((b) => b.slot).sort((a, c) => this.perfScore(this.brawlers[c]) - this.perfScore(this.brawlers[a]) || a - c);
  }

  // ---- shared parts for later modes ----
  // Knockout: a new round. Clears shots, areas, pickups and units, puts every brawler back on its
  // spawn with full health (super charge and gadget uses carry over unless opts.resetSuper), and
  // restarts the poison clock. opts.tiles restores broken walls and boxes.
  resetRound(opts) {
    opts = opts || {};
    for (const arr of [this.shots, this.areas, this.pickups, this.deploys]) {
      for (const e of arr) if (!e.dead) { e.dead = true; this.ev(EV.DESPAWN, e.id, e.kind); }
      arr.length = 0;
    }
    this.deathOrder.length = 0;
    const m = this.map;
    if (opts.tiles) {
      for (let i = 0; i < m.tiles.length; i++) {
        if (m.tiles[i] === this.tiles0[i]) continue;
        this.setTile(i, this.tiles0[i]);
        if (this.tiles0[i] === TILE.BOX) this.boxHp[i] = Sim.BOX_HP;
      }
    }
    for (const b of this.brawlers) {
      if (opts.resetSuper) { b.sup = 0; b.supReady = false; }
      b.carry = 0;
      this.spawn(b, true);
    }
    this.roundT0 = this.t;
    this.poisonStage = 0;
    this.poison = this.mode.poison ? poisonRect(m, 0, this.mode.poison, this.poison || {}) : null;
    if (this.ball) this.placeBall(m.obj ? m.obj.x : m.w / 2, m.obj ? m.obj.y : m.h / 2);
    this.updateVision();
  }

  // Blast Ball: the ball entity and its physics. The mode calls stepBall() from its tick and
  // kickBall() from onAction; possession, goals and overtime are the mode's business.
  addBall(x, y) {
    this.ball = { id: this.nextId++, kind: K.BALL, team: -1, x, y, px: x, py: y, r: 0.35, dead: false, holder: -1, vx: 0, vy: 0, z: 0, vz: 0, kicker: -1, kickT: 0, fx: x, fy: y };
    this.ev(EV.SPAWN, this.ball.id, K.BALL);
    return this.ball;
  }

  placeBall(x, y) {
    const o = this.ball;
    o.x = o.px = x; o.y = o.py = y;
    o.holder = -1; o.vx = o.vy = o.z = o.vz = 0; o.kicker = -1; o.kickT = 0; o.fx = x; o.fy = y;
  }

  // what: EV.BALL code (2 kick, 3 pass). vz lifts it (lobbed passes fly over brawlers).
  kickBall(b, ang, spd, vz, what) {
    const o = this.ball;
    o.holder = -1;
    o.x = b.x; o.y = b.y;
    o.vx = Math.cos(ang) * spd; o.vy = Math.sin(ang) * spd;
    o.z = 0.3; o.vz = vz || 0;
    o.kicker = b.slot; o.kickT = 0.35;
    this.ev(EV.BALL, what || 2, b.slot);
  }

  dropBall() {
    const o = this.ball;
    if (!o || o.holder < 0) return;
    const s = o.holder;
    o.holder = -1; o.vx = o.vy = 0; o.kicker = s; o.kickT = 0.5;
    this.ev(EV.BALL, 4, s);
  }

  stepBall() {
    const o = this.ball, dt = SIM_DT, m = this.map;
    if (!o) return;
    o.px = o.x; o.py = o.y;
    if (o.holder >= 0) {
      const h = this.brawlers[o.holder];
      if (!h.alive || h.stunT > 0 || h.kbT > 0) this.dropBall();
      else {
        o.x = h.x + Math.cos(h.face) * 0.45; o.y = h.y + Math.sin(h.face) * 0.45; o.z = 0;
        o.fx = h.x; o.fy = h.y;
        return;
      }
    }
    if (o.kickT > 0) o.kickT -= dt;
    o.vz -= 22 * dt;
    o.z += o.vz * dt;
    if (o.z <= 0) { o.z = 0; o.vz = o.vz < -3 ? -o.vz * 0.35 : 0; }
    // walls bounce it back (axis by axis), unless it flies high over them (a lobbed pass); the map
    // edge always does. Water and fences don't stop a rolling ball.
    const high = o.z > 0.9, wall = (x, y) => (high ? x < 0 || y < 0 || x >= m.w || y >= m.h : (flagsAt(m, x, y) & TF_SHOT) !== 0);
    const nx = o.x + o.vx * dt;
    if (wall(nx + sign(o.vx) * o.r, o.y)) o.vx = -o.vx * 0.6; else o.x = nx;
    const ny = o.y + o.vy * dt;
    if (wall(o.x, ny + sign(o.vy) * o.r)) o.vy = -o.vy * 0.6; else o.y = ny;
    if (o.z === 0) {
      const f = Math.max(0, 1 - 2.2 * dt); o.vx *= f; o.vy *= f;
      // landed on (or rolled to a stop on) something nobody can stand on: it goes back to the last
      // open spot it crossed (never sideways through a goal frame into the goal)
      const fl = flagsAt(m, o.x, o.y);
      if ((fl & (TF_SHOT | TF_MOVE)) && ((fl & TF_SHOT) || o.vx * o.vx + o.vy * o.vy < 0.25)) {
        o.x = o.fx; o.y = o.fy; o.vx = o.vy = 0;
      }
    }
    if (!(flagsAt(m, o.x, o.y) & (TF_SHOT | TF_MOVE))) { o.fx = o.x; o.fy = o.y; }
    if (o.z > 0.8) return;
    const B = this.brawlers;
    for (let j = 0; j < B.length; j++) {
      const b = B[(j + this.tick) % B.length];
      if (!this.canAct(b) || (b.slot === o.kicker && o.kickT > 0)) continue;
      if (dist2(b.x, b.y, o.x, o.y) > (b.r + o.r) * (b.r + o.r)) continue;
      o.holder = b.slot; o.vx = o.vy = 0; o.kicker = -1;
      b.bqN = 0; // no more shots from a burst started before the pickup
      this.ev(EV.BALL, 1, b.slot);
      break;
    }
  }
}

Sim.BOX_HP = 6000; // Showdown power-cube box health
Sim.AREA_TICK = 0.5; // lasting zones deal damage / heal in ticks of this many seconds
Sim.INVIS_R = 1.6; // enemies this close see an invisible brawler
Sim.BEAM_FX = { pk: '', dmg: 0, spd: 0, range: 0, r: 0.1 };
