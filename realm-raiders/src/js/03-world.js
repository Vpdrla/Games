// ---------- World: the combat simulation ----------
// One World runs a room (or an arena) at a fixed 60 Hz. It owns every unit, projectile, area and
// pickup, and pushes events (w.ev) that the renderer, sound and the online sync consume.
// Teams: heroes and their summons are team 0 in adventures; monsters are team 1. In the arena every
// side has its own team number.

const isFoe = (a, b) => a.team !== b.team;
const alive = (u) => !u.dead && !u.downed && !u.ko;

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  let t = l > 0 ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t - px, y = ay + dy * t - py;
  return x * x + y * y;
}

function newStatus() {
  return { burn: 0, burnDps: 0, burnT: 0, burnSrc: null, poison: 0, poisonN: 0, poisonDps: 0, poisonT: 0, poisonSrc: null,
    slow: 0, slowAmt: 0, freeze: 0, stun: 0, root: 0, taunt: 0, tauntSrc: null, invis: 0, invuln: 0, voidMark: 0, cc: 0 };
}

class World {
  constructor(cfg) {
    this.cfg = cfg || {};
    this.rng = new RNG(this.cfg.seed || 12345);
    this.t = 0;
    this.tick = 0;
    this.units = [];
    this.projs = [];
    this.areas = [];
    this.picks = [];
    this.ev = [];
    this.nid = 1;
    this.players = [];
    this.room = null;
    this.mode = null;
    this.timeStop = null;
    this.combo = { n: 0, t: 0 };
    this.multi = { n: 0, t: 0 };
    this.gold = 0;
    this.teamFlags = {};
    this.arena = false;
    this.stats = { kills: 0, elites: 0, bosses: 0, ults: 0, gold: 0, chests: 0, rooms: 0, blessings: 0, revives: 0, abyss: 0,
      bestCombo: 0, bestMulti: 0, flawless: 0, bossNoDown: 0, legBless: 0, maxBless: 0, downs: 0 };
    this.hurtThisRoom = false;
  }

  emit(...a) { this.ev.push(a); }
  rand() { return this.rng.next(); }

  // ---------- room ----------
  setRoom(room) {
    this.room = room;
    this.projs.length = 0;
    this.areas.length = 0;
    this.picks.length = 0;
    this.units = this.units.filter((u) => u.kind === 'hero' || (u.kind === 'summon' && u.keep));
  }

  bounds(r) {
    const W = this.room ? this.room.w : ROOM_W, H = this.room ? this.room.h : ROOM_H;
    return { x0: 28 + r, y0: 28 + r, x1: W - 28 - r, y1: H - 28 - r };
  }

  // ---------- units ----------
  newUnit(kind, team, x, y, r) {
    const u = { id: this.nid++, kind, team, x, y, px: x, py: y, r, baseR: r, hp: 1, maxHp: 1, shield: 0, dead: false,
      ang: -Math.PI / 2, mx: 0, my: 0, kx: 0, ky: 0, spd: 100, spdMul: 1, mass: 1, flash: 0, st: newStatus(),
      buffs: [], bf: { dmg: 0, as: 0, ms: 0, dr: 0, ls: 0, size: 0, crit: 0 }, anim: 0, animK: 0, born: this.t };
    this.units.push(u);
    return u;
  }

  spawnHero(pl, x, y) {
    const h = HERO_BY_ID[pl.hero];
    const u = this.newUnit('hero', pl.team || 0, x, y, HERO_R);
    u.hero = h;
    u.pl = pl;
    u.kit = KITS[h.id];
    u.lvl = pl.lvl || 1;
    u.load = pl.load || { mods: {}, uniq: [] };
    u.bless = {};
    u.blessN = 0;
    u.cd = { skill: 1.2, dash: 0, skillMax: h.skill.cd };
    u.ult = pl.ultStart || 0;
    u.atkT = 0.3;
    u.basicN = 0;
    u.input = { mx: 0, my: 0, skill: false, ult: false, dash: false, aim: null, aimD: 0 };
    u.hist = [];
    u.histT = 0;
    u.lastHurt = -99;
    u.lastAtk = -99;
    u.downed = false;
    u.bleed = 0;
    u.reviveP = 0;
    u.counters = { crits: 0, storm: 0, ws: 0, rez: 0, swUsed: false, bulT: 0, stoneT: 0, frostT: 0 };
    u.mass = 3;
    u.target = null;
    u.channel = null;
    u.dash = null;
    u.ko = false;
    u.ccImmune = 0;
    u.summons = [];
    u.kos = 0; u.streak = 0; u.deaths = 0;
    this.recalc(u, true);
    u.counters.rez = (u.s.uq.has('phoenix') ? 1 : 0) + (pl.ankh ? 1 : 0);
    pl.unit = u;
    const f = this.teamFlags[u.team] || (this.teamFlags[u.team] = {});
    if (h.id === 'rime') f.shatter = true;
    if (h.id === 'vex') f.venom = true;
    if (h.id === 'ember') f.combust = true;
    return u;
  }

  // Rebuild a hero's stats from level, gear, camp upgrades and blessings.
  recalc(u, fill) {
    const h = u.hero, L = u.load || {}, M = L.mods || {};
    const B = {};
    for (const id in u.bless) {
      const b = BLESS_BY_ID[id];
      for (const k in b.m) B[k] = (B[k] || 0) + b.m[k] * u.bless[id];
    }
    const g = (k) => (M[k] || 0) + (B[k] || 0);
    const lv = (u.lvl || 1) - 1;
    const uq = new Set(L.uniq || []);
    const s = { uq };
    s.dmg = (1 + 0.06 * lv) * Math.max(0.2, 1 + g('dmg'));
    s.hpMul = (1 + 0.07 * lv) * Math.max(0.3, 1 + g('hp') + (uq.has('titan') ? 0.4 : 0));
    s.as = Math.max(0.3, 1 + g('as') + (h.id === 'chrona' ? 0.1 : 0));
    s.ms = clamp(1 + g('ms') + (uq.has('windcloak') ? 0.15 : 0), 0.6, 1.8);
    s.crit = 0.05 + g('crit') + (h.id === 'nyx' ? 0.25 : 0);
    s.critDmg = (h.id === 'nyx' ? 2.2 : 1.6) + g('critDmg');
    s.cdr = g('cdr') + (h.id === 'chrona' ? 0.15 : 0) + (uq.has('chrono') ? 0.2 : 0);
    s.ult = g('ult');
    s.ls = g('ls') + (uq.has('fang') ? 0.08 : 0);
    s.thorns = g('thorns') + (uq.has('thornmail') ? 0.8 : 0);
    s.dr = Math.min(0.8, 1 - (1 - h.armor) * (1 - clamp(g('armor'), 0, 0.6)) * (uq.has('titan') ? 0.9 : 1));
    s.regen = g('regen');
    s.gold = g('gold') + (uq.has('midas') ? 0.6 : 0);
    for (const k of ['multi', 'pierce', 'pIgnite', 'pChill', 'pStatic', 'pToxic', 'exec', 'bulwark', 'blades', 'wisps', 'echo', 'nova', 'ultDmg', 'size', 'secondwind', 'phoenix', 'storm', 'midas', 'avatar', 'twin']) s[k] = B[k] || 0;
    if (uq.has('stormring')) s.pStatic += 0.1;
    const arenaHp = this.arena ? 2.4 : 1;
    const oldMax = u.maxHp;
    u.s = s;
    u.maxHp = Math.round(h.hp * s.hpMul * arenaHp);
    if (fill || u.downed) u.hp = u.maxHp;
    else u.hp = clamp(u.hp + Math.max(0, u.maxHp - oldMax), 1, u.maxHp);
    u.spd = h.spd * s.ms;
    u.baseR = HERO_R * (1 + s.size);
    u.r = u.baseR * (1 + u.bf.size);
    u.ultScale = Math.max(1, h.basic.dmg * s.dmg / 2.2);
    if (!fill && u.s.phoenix && !u.counters.phoenixGiven) { u.counters.phoenixGiven = true; u.counters.rez++; }
    // spirit wisps follow their hero
    if (!this.arena || true) {
      u.summons = u.summons.filter((m) => !m.dead);
      const have = u.summons.filter((m) => m.stype === 'wisp').length;
      for (let i = have; i < s.wisps; i++) this.spawnSummon(u, 'wisp', u.x, u.y);
    }
  }

  addBlessing(u, id) {
    u.bless[id] = (u.bless[id] || 0) + 1;
    u.blessN++;
    this.stats.blessings++;
    if (BLESS_BY_ID[id].rar >= 3) this.stats.legBless++;
    this.stats.maxBless = Math.max(this.stats.maxBless, u.blessN);
    this.recalc(u, false);
  }

  spawnMob(id, x, y, mult, elite) {
    const d = MOBS[id];
    const u = this.newUnit('mob', 1, x, y, d.r);
    u.mob = d;
    u.mid = id;
    u.mult = { hp: mult.hp, dmg: mult.dmg };
    u.elite = elite || null;
    let hp = d.hp * mult.hp;
    u.spd = d.spd * (0.92 + this.rand() * 0.16);
    u.mass = d.heavy ? 4 : 1;
    u.heavy = !!d.heavy;
    u.flyer = !!d.flyer;
    if (elite) {
      hp *= 3.6;
      u.r = u.baseR = d.r * 1.35;
      u.mass *= 2;
      if (elite === 'swift') u.spd *= 1.45;
      if (elite === 'brutal') u.mult.dmg *= 1.6;
      if (elite === 'armored') hp *= 1.4;
    }
    u.maxHp = u.hp = Math.round(hp);
    if (d.shield) u.shield = u.maxShield = Math.round(u.maxHp * d.shield);
    u.ai = { cd: 0.6 + this.rand() * 1.4, state: 'move', t: 0, tgt: null, retarget: 0, strafe: this.rand() < 0.5 ? 1 : -1, wob: this.rand() * TAU };
    u.contactT = {};
    return u;
  }

  spawnBoss(id, x, y, mult) {
    const d = BOSSES[id];
    const u = this.newUnit('boss', 1, x, y, d.r);
    u.boss = d;
    u.bid = id;
    u.mult = { hp: mult.hp, dmg: mult.dmg };
    u.maxHp = u.hp = Math.round(d.hp * mult.hp);
    u.spd = d.spd;
    u.mass = 50;
    u.heavy = true;
    u.ai = { cd: 2, move: null, t: 0, phase: 1, last: '', tgt: null, retarget: 0, spin: 0 };
    u.contactT = {};
    return u;
  }

  // stype: skeleton | champion | turret | wisp
  spawnSummon(owner, stype, x, y, o) {
    o = o || {};
    const u = this.newUnit('summon', owner.team, x, y, stype === 'champion' ? 18 : stype === 'turret' ? 15 : stype === 'wisp' ? 9 : 14);
    u.owner = owner;
    u.stype = stype;
    u.pow = owner.s ? owner.s.dmg : 1;
    const hpBase = { skeleton: 130, champion: 320, turret: 220, wisp: 1 }[stype];
    u.maxHp = u.hp = Math.round(hpBase * (owner.s ? owner.s.hpMul : 1) * (this.arena ? 1.5 : 1));
    u.spd = { skeleton: 175, champion: 165, turret: 0, wisp: 260 }[stype];
    u.life = o.life || (stype === 'wisp' ? 1e9 : 15);
    u.atkT = 0.5;
    u.mass = stype === 'turret' ? 99 : 1;
    u.untargetable = stype === 'wisp';
    u.flyer = stype === 'wisp';
    u.keep = stype === 'wisp';
    u.ai = { tgt: null, retarget: 0 };
    owner.summons.push(u);
    return u;
  }

  heroes() { return this.units.filter((u) => u.kind === 'hero'); }

  // ---------- queries ----------
  foesIn(team, x, y, r, fn) {
    const out = [];
    for (const u of this.units) {
      if (u.team === team || !alive(u) || u.untargetable) continue;
      const rr = r + u.r;
      if (dist2(x, y, u.x, u.y) <= rr * rr && (!fn || fn(u))) out.push(u);
    }
    return out;
  }

  alliesIn(team, x, y, r, heroesOnly) {
    const out = [];
    for (const u of this.units) {
      if (u.team !== team || !alive(u) || u.untargetable) continue;
      if (heroesOnly && u.kind !== 'hero') continue;
      const rr = r + u.r;
      if (dist2(x, y, u.x, u.y) <= rr * rr) out.push(u);
    }
    return out;
  }

  foesInLine(team, x, y, ang, len, wid) {
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    return this.units.filter((u) => u.team !== team && alive(u) && !u.untargetable && segDist2(u.x, u.y, x, y, ex, ey) <= (wid / 2 + u.r) * (wid / 2 + u.r));
  }

  foesInCone(team, x, y, ang, range, arc) {
    return this.units.filter((u) => {
      if (u.team === team || !alive(u) || u.untargetable) return false;
      const d = dist(x, y, u.x, u.y);
      if (d > range + u.r) return false;
      if (d < u.r + 4) return true;
      return Math.abs(angDiff(ang, angTo(x, y, u.x, u.y))) <= arc / 2 + Math.atan2(u.r, d);
    });
  }

  nearestFoe(u, range, fn) {
    let best = null, bd = range * range;
    for (const o of this.units) {
      if (o.team === u.team || !alive(o) || o.untargetable) continue;
      if (o.kind === 'hero' && o.st.invis > 0 && u.kind !== 'hero') continue;
      if (fn && !fn(o)) continue;
      const rr = range + o.r;
      const d = dist2(u.x, u.y, o.x, o.y);
      if (d <= rr * rr && d < bd + rr * rr - range * range) { bd = d; best = o; }
    }
    return best;
  }

  flag(u, f) { return !!(u && this.teamFlags[u.team] && this.teamFlags[u.team][f]); }

  timeFrozen(team) { return this.timeStop && this.timeStop.t > 0 && team !== this.timeStop.team; }

  lyraNear(u) {
    for (const o of this.units) if (o.kind === 'hero' && o.team === u.team && o.hero.id === 'lyra' && alive(o) && dist2(o.x, o.y, u.x, u.y) < 220 * 220) return true;
    return false;
  }

  // Shared aim for skills and ultimates: manual aim if given, else the best target in range.
  aim(u, range, wantCluster) {
    const inp = u.input || {};
    if (inp.aim != null) {
      const d = inp.aimD ? clamp(inp.aimD, 0.15, 1) * range : range * 0.75;
      return { ang: inp.aim, x: u.x + Math.cos(inp.aim) * d, y: u.y + Math.sin(inp.aim) * d, tgt: null };
    }
    let tgt = null;
    if (wantCluster) {
      let best = 0;
      for (const o of this.units) {
        if (o.team === u.team || !alive(o) || o.untargetable) continue;
        const d = dist(u.x, u.y, o.x, o.y);
        if (d > range * 1.15) continue;
        let sc = o.kind === 'boss' ? 6 : o.elite ? 3 : 1;
        for (const p of this.units) if (p !== o && p.team === o.team && alive(p) && dist2(p.x, p.y, o.x, o.y) < 120 * 120) sc++;
        sc -= d / range;
        if (sc > best) { best = sc; tgt = o; }
      }
    } else tgt = (u.target && alive(u.target) && dist(u.x, u.y, u.target.x, u.target.y) < range * 1.15) ? u.target : this.nearestFoe(u, range * 1.15);
    if (tgt) {
      const a = angTo(u.x, u.y, tgt.x, tgt.y);
      return { ang: a, x: tgt.x, y: tgt.y, tgt };
    }
    return { ang: u.ang, x: u.x + Math.cos(u.ang) * range * 0.6, y: u.y + Math.sin(u.ang) * range * 0.6, tgt: null };
  }

  // ---------- damage ----------
  dmgPow(src, o) {
    if (!src) return 1;
    if (src.kind === 'hero') {
      let m = src.s.dmg * (1 + src.bf.dmg);
      if (o.kind === 'ult') m *= 1 + src.s.ultDmg;
      if (src.hero.id === 'krag') m *= 1 + 0.5 * (1 - src.hp / src.maxHp);
      if (this.lyraNear(src)) m *= 1.1;
      return m;
    }
    if (src.kind === 'summon') return src.pow * (1 + (src.owner ? src.owner.bf.dmg : 0));
    return src.mult ? src.mult.dmg : 1;
  }

  // amt is the base value of the attack; o: { kind: basic|skill|ult|proc|dot|mob, raw, noCrit, knock, ka, fx, dist }
  hit(src, tgt, amt, o) {
    o = o || {};
    if (!tgt || tgt.dead || tgt.downed || tgt.ko) return 0;
    if (tgt.st.invuln > 0) return 0;
    if (!o.raw) amt *= this.dmgPow(src, o);
    let crit = false;
    const hsrc = src && src.kind === 'hero' ? src : null;
    if (hsrc && !o.noCrit) {
      let c = hsrc.s.crit + hsrc.bf.crit;
      if (hsrc.counters.crits > 0 && o.kind === 'basic') { c = 1; hsrc.counters.crits--; }
      if (this.rand() < c) { crit = true; amt *= hsrc.s.critDmg; }
      if (hsrc.s.exec && tgt.hp < tgt.maxHp * 0.3) amt *= 1 + hsrc.s.exec;
      if (hsrc.s.uq.has('voidorb') && (tgt.kind === 'boss' || tgt.elite)) amt *= 1.25;
      if (hsrc.hero.id === 'drakon' && tgt.st.burn > 0) amt *= 1.15;
      if (hsrc.hero.id === 'hawke') amt *= 1 + clamp((dist(hsrc.x, hsrc.y, tgt.x, tgt.y) - 150) / 900, 0, 0.3);
    }
    if (tgt.st.freeze > 0 && this.flag(src, 'shatter')) amt *= 1.4;
    if (tgt.st.voidMark > 0 && src && src.team !== tgt.team) amt *= 1.25;
    if (tgt.kind === 'hero') {
      if (tgt.hero.id === 'gale' && !o.noDodge && o.kind !== 'dot' && this.rand() < 0.15) { this.emit('text', tgt.x, tgt.y - 28, 'DODGE', '#9be7ff', 13); return 0; }
      amt *= (1 - tgt.s.dr) * (1 - clamp(tgt.bf.dr, 0, 0.8));
      if (src && src.kind !== 'hero' && src.st.poison > 0 && this.flag(tgt, 'venom')) amt *= 0.8;
      if (this.arena && src && src.kind === 'hero') amt *= 0.85;
    } else if (tgt.elite === 'armored') amt *= 0.7;
    if (tgt.kind === 'boss' && tgt.ai.shielded) amt *= 0.25;
    amt = Math.max(1, amt);
    let left = amt;
    if (tgt.shield > 0) { const a = Math.min(tgt.shield, left); tgt.shield -= a; left -= a; }
    tgt.hp -= left;
    tgt.flash = 0.12;
    const shown = Math.round(amt);
    const ht = tgt.kind === 'hero' ? tgt.team + 1 : 0;
    if (o.kind === 'dot') this.emit('dmg', tgt.x, tgt.y - tgt.r, shown, 0, ht, o.fx === 'poison' ? 2 : 3);
    else this.emit('dmg', tgt.x + (this.rand() - 0.5) * tgt.r, tgt.y - tgt.r, shown, crit ? 1 : 0, ht, 0);
    if (tgt.kind === 'hero') {
      tgt.lastHurt = this.t;
      tgt.counters.stoneT = 0;
      tgt.ult = Math.min(100, tgt.ult + amt / tgt.maxHp * 22);
      if (tgt.team === 0) this.hurtThisRoom = true;
      if (src && src.team !== tgt.team && src.kind !== 'hero' && tgt.s.uq.has('frostheart')) this.slow(src, 0.4, 2);
      if (tgt.s.uq.has('frostheart') && tgt.hp < tgt.maxHp * 0.3 && this.t - tgt.counters.frostT > 15) {
        tgt.counters.frostT = this.t;
        for (const f of this.foesIn(tgt.team, tgt.x, tgt.y, 170)) this.freeze(f, 2);
        this.emit('ring', tgt.x, tgt.y, 170, '#a8eaff');
      }
      if (tgt.s.thorns > 0 && src && src.kind !== 'hero' && !o.thorn && o.kind !== 'dot' && alive(src)) this.hit(tgt, src, amt * tgt.s.thorns, { raw: true, kind: 'proc', thorn: true, noCrit: true });
    }
    // attacker side effects
    const owner = hsrc || (src && src.kind === 'summon' ? src.owner : null);
    if (owner && owner.kind === 'hero') {
      if (o.kind !== 'ult') {
        const mul = o.kind === 'dot' ? 0.35 : hsrc ? 1 : 0.5;
        owner.ult = Math.min(100, owner.ult + clamp(amt / owner.ultScale, 0, 7) * (1 + owner.s.ult) * mul * (this.arena ? 0.7 : 1));
      }
      if (hsrc && o.kind !== 'dot') {
        const ls = hsrc.s.ls + hsrc.bf.ls;
        if (ls > 0) this.heal(hsrc, amt * ls);
        if (crit && hsrc.s.uq.has('fang')) this.heal(hsrc, hsrc.maxHp * 0.02);
      }
      if (hsrc && (o.kind === 'basic' || o.kind === 'skill') && !o.noProc) this.procs(hsrc, tgt, o);
      if (tgt.team !== owner.team && owner.team === 0 && o.kind !== 'dot') { this.combo.n++; this.combo.t = 2.4; if (this.combo.n > this.stats.bestCombo) this.stats.bestCombo = this.combo.n; }
    }
    if (o.knock && !tgt.heavy && tgt.kind !== 'boss' && tgt.kind !== 'summon' || (o.knock && tgt.kind === 'summon' && tgt.stype !== 'turret')) {
      const a = o.ka != null ? o.ka : src ? angTo(src.x, src.y, tgt.x, tgt.y) : 0;
      const f = o.knock / (tgt.mass || 1) * (tgt.kind === 'hero' ? 0.5 : 1);
      tgt.kx += Math.cos(a) * f * 3;
      tgt.ky += Math.sin(a) * f * 3;
    }
    if (tgt.elite === 'vampiric' && src) this.heal(tgt, 0);
    if (src && src.elite === 'vampiric' && tgt.team !== src.team) this.heal(src, amt * 0.5);
    if (tgt.hp <= 0) this.onZero(tgt, src, o);
    return amt;
  }

  procs(h, tgt, o) {
    const s = h.s, base = h.hero.basic.dmg;
    if (s.pIgnite && this.rand() < s.pIgnite) this.burn(tgt, h, 3, base * 0.35 * s.dmg);
    if (s.uq.has('emberblade')) this.burn(tgt, h, 2.5, base * 0.25 * s.dmg);
    if (s.pChill && this.rand() < s.pChill) this.slow(tgt, 0.35, 1.6);
    if (s.pToxic && this.rand() < s.pToxic) this.poison(tgt, h, 1, base * 0.16 * s.dmg);
    if (s.pStatic && this.rand() < s.pStatic) this.chain(h, tgt, base * 0.7, 3, 170, { kind: 'proc' });
    if (s.storm && o.kind === 'basic') {
      h.counters.storm++;
      if (h.counters.storm % 3 === 0) this.strike(h, tgt.x, tgt.y, 46, base * 1.4, '#fff36a');
    }
    if (s.uq.has('worldsplit') && o.kind === 'basic') {
      h.counters.ws++;
      if (h.counters.ws % 5 === 0) {
        for (const f of this.foesIn(h.team, tgt.x, tgt.y, 120)) this.hit(h, f, base * 1.2, { kind: 'proc', knock: 120 });
        this.emit('ring', tgt.x, tgt.y, 120, '#ffd23f');
      }
    }
    if (h.hero.id === 'sol' && o.kind === 'basic') {
      let low = null, lr = 1;
      for (const a of this.alliesIn(h.team, h.x, h.y, 320, true)) { const r = a.hp / a.maxHp; if (r < lr) { lr = r; low = a; } }
      if (low) { this.heal(low, low.maxHp * 0.025); this.emit('zap', h.x, h.y, low.x, low.y, '#fff1a0', 0); }
    }
  }

  // instant lightning strike at a point (proc damage)
  strike(src, x, y, r, dmg, color) {
    for (const f of this.foesIn(src.team, x, y, r)) this.hit(src, f, dmg, { kind: 'proc' });
    this.emit('bolt', x, y, color || '#fff36a');
  }

  chain(src, first, dmg, jumps, range, o) {
    let cur = first;
    const hitSet = new Set([first.id]);
    let fx = src.x, fy = src.y, d = dmg;
    for (let i = 0; i <= jumps && cur; i++) {
      this.emit('zap', fx, fy, cur.x, cur.y, '#fff36a', 1);
      this.hit(src, cur, d, Object.assign({ noProc: i > 0 }, o));
      fx = cur.x; fy = cur.y;
      hitSet.add(cur.id);
      d *= 0.85;
      let next = null, bd = range * range;
      for (const u of this.units) {
        if (u.team === src.team || !alive(u) || hitSet.has(u.id) || u.untargetable) continue;
        const dd = dist2(fx, fy, u.x, u.y);
        if (dd < bd) { bd = dd; next = u; }
      }
      cur = next;
    }
  }

  onZero(u, src, o) {
    if (u.kind === 'hero') {
      if (this.arena) { u.hp = 0; this.mode.onKO(u, src); return; }
      if (u.s.secondwind && !u.counters.swUsed) {
        u.counters.swUsed = true;
        u.hp = 1;
        u.st.invuln = 2;
        this.emit('text', u.x, u.y - 34, 'SECOND WIND', '#ffd23f', 16);
        return;
      }
      this.down(u);
      return;
    }
    if (u.dead) return;
    u.dead = true;
    u.hp = 0;
    if (this.mode && this.mode.onKill) this.mode.onKill(u, src, o);
  }

  down(u) {
    u.downed = true;
    u.hp = 0;
    u.shield = 0;
    u.bleed = BLEED_TIME;
    u.reviveP = 0;
    u.channel = null;
    u.dash = null;
    u.st = newStatus();
    u.buffs.length = 0;
    this.stats.downs++;
    this.emit('down', u.id, u.x, u.y);
    if (u.counters.rez > 0) { u.counters.rez--; u.autoRev = 1.4; }
    if (this.mode && this.mode.onDown) this.mode.onDown(u);
  }

  revive(u, frac, by) {
    if (!u.downed && !u.deadOut) return;
    u.downed = false;
    u.deadOut = false;
    u.autoRev = 0;
    u.hp = Math.max(1, Math.round(u.maxHp * frac));
    u.st.invuln = 1.6;
    u.reviveP = 0;
    this.emit('revive', u.id, u.x, u.y);
    if (by && by !== u && by.team === 0) this.stats.revives++;
  }

  heal(u, amt) {
    if (!u || u.dead || u.downed || u.ko || amt <= 0) return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amt);
    const got = u.hp - before;
    if (got > 0 && u.kind === 'hero') {
      u.healAcc = (u.healAcc || 0) + got;
    }
  }

  shieldUp(u, amt, dur) {
    u.shield = Math.max(u.shield, amt);
    u.shieldT = Math.max(u.shieldT || 0, dur || 6);
  }

  // ---------- statuses ----------
  ccScale(t) { return t.kind === 'boss' ? 0.25 : t.kind === 'hero' ? 0.5 : t.heavy || t.elite ? 0.6 : 1; }
  burn(t, src, dur, dps) {
    if (!t || t.dead || (t.kind === 'hero' && t.hero.id === 'drakon')) return;
    if (t.st.burn <= 0) t.st.burnDps = 0;
    t.st.burn = Math.max(t.st.burn, dur);
    t.st.burnDps = Math.max(t.st.burnDps, dps);
    t.st.burnSrc = src;
  }
  poison(t, src, stacks, dps) {
    if (!t || t.dead) return;
    if (t.st.poison <= 0) { t.st.poisonN = 0; t.st.poisonDps = 0; }
    t.st.poisonN = Math.min(12, t.st.poisonN + stacks);
    t.st.poison = 4.5;
    t.st.poisonDps = Math.max(t.st.poisonDps, dps);
    t.st.poisonSrc = src;
  }
  slow(t, amt, dur) {
    if (!t || t.dead) return;
    if (t.kind === 'boss') amt *= 0.5;
    if (t.st.slow <= 0 || amt >= t.st.slowAmt) t.st.slowAmt = amt;
    t.st.slow = Math.max(t.st.slow, dur);
  }
  freeze(t, dur) {
    if (!t || t.dead || t.ccImmune > 0) return;
    t.st.freeze = Math.max(t.st.freeze, dur * this.ccScale(t));
  }
  stun(t, dur) {
    if (!t || t.dead || t.ccImmune > 0) return;
    t.st.stun = Math.max(t.st.stun, dur * this.ccScale(t));
  }
  root(t, dur) {
    if (!t || t.dead || t.ccImmune > 0) return;
    t.st.root = Math.max(t.st.root, dur * this.ccScale(t));
  }
  taunt(t, src, dur) {
    if (!t || t.dead || t.kind === 'hero') return;
    t.st.taunt = dur * (t.kind === 'boss' ? 0.4 : 1);
    t.st.tauntSrc = src;
  }
  buff(u, id, t, mods) {
    const b = u.buffs.find((x) => x.id === id);
    if (b) { b.t = Math.max(b.t, t); Object.assign(b, mods); return; }
    u.buffs.push(Object.assign({ id, t }, mods));
  }

  tickStatus(u, dt) {
    const st = u.st;
    if (st.slow > 0) st.slow -= dt;
    if (st.freeze > 0) st.freeze -= dt;
    if (st.stun > 0) st.stun -= dt;
    if (st.root > 0) st.root -= dt;
    if (st.taunt > 0) st.taunt -= dt;
    if (st.invis > 0) st.invis -= dt;
    if (st.invuln > 0) st.invuln -= dt;
    if (st.voidMark > 0) st.voidMark -= dt;
    if (u.ccImmune > 0) u.ccImmune -= dt;
    if (u.flash > 0) u.flash -= dt;
    if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = u.kind === 'mob' && u.maxShield ? u.shield : 0; }
    if (st.burn > 0) {
      st.burn -= dt;
      st.burnT += dt;
      if (st.burnT >= 0.5) { st.burnT -= 0.5; this.hit(st.burnSrc, u, st.burnDps * 0.5, { raw: true, kind: 'dot', noCrit: true, fx: 'burn' }); }
    }
    if (st.poison > 0 && !u.dead) {
      st.poison -= dt;
      st.poisonT += dt;
      if (st.poisonT >= 0.5) { st.poisonT -= 0.5; this.hit(st.poisonSrc, u, st.poisonDps * st.poisonN * 0.5, { raw: true, kind: 'dot', noCrit: true, fx: 'poison' }); }
    }
    // buffs
    const bf = u.bf;
    bf.dmg = bf.as = bf.ms = bf.dr = bf.ls = bf.size = bf.crit = 0;
    for (let i = u.buffs.length - 1; i >= 0; i--) {
      const b = u.buffs[i];
      b.t -= dt;
      if (b.t <= 0) { u.buffs.splice(i, 1); continue; }
      if (b.dmg) bf.dmg += b.dmg;
      if (b.as) bf.as += b.as;
      if (b.ms) bf.ms += b.ms;
      if (b.dr) bf.dr = Math.max(bf.dr, b.dr);
      if (b.ls) bf.ls += b.ls;
      if (b.size) bf.size += b.size;
      if (b.crit) bf.crit += b.crit;
    }
    u.r = u.baseR * (1 + bf.size);
  }

  cantAct(u) { return u.st.freeze > 0 || u.st.stun > 0 || (u.kind === 'hero' && (u.downed || u.ko)); }

  // ---------- projectiles ----------
  // p: { x, y, ang, spd, r, dmg, life|range, pierce, kind, color, o, homing, src, onHit, onEnd, explode, noObst, lob }
  shoot(src, p) {
    p.id = this.nid++;
    p.team = src.team;
    p.src = src;
    p.vx = Math.cos(p.ang) * p.spd;
    p.vy = Math.sin(p.ang) * p.spd;
    if (p.life == null) p.life = (p.range || 400) / p.spd;
    p.pierce = p.pierce || 0;
    p.hits = new Set();
    p.t = 0;
    p.o = p.o || { kind: src.kind === 'hero' ? 'basic' : 'mob' };
    this.projs.push(p);
    return p;
  }

  updateProjs(dt) {
    const b = this.bounds(0);
    for (const p of this.projs) {
      if (p.done) continue;
      if (this.timeFrozen(p.team)) continue;
      p.t += dt;
      if (p.lob) {
        const k = clamp(p.t / p.lob.T, 0, 1);
        p.x = lerp(p.lob.x0, p.lob.x1, k);
        p.y = lerp(p.lob.y0, p.lob.y1, k);
        p.h = Math.sin(k * Math.PI) * p.lob.H;
        if (k >= 1) { p.done = true; if (p.onEnd) p.onEnd(this, p); }
        continue;
      }
      if (p.homing) {
        const tgt = (p.tgt && alive(p.tgt)) ? p.tgt : this.nearestFoe(p, 320);
        p.tgt = tgt;
        if (tgt) {
          const a = Math.atan2(p.vy, p.vx);
          const want = angTo(p.x, p.y, tgt.x, tgt.y);
          const na = a + clamp(angDiff(a, want), -p.homing * dt, p.homing * dt);
          const sp = Math.hypot(p.vx, p.vy);
          p.vx = Math.cos(na) * sp;
          p.vy = Math.sin(na) * sp;
        }
      }
      if (p.accel) { p.vx *= 1 + p.accel * dt; p.vy *= 1 + p.accel * dt; }
      if (p.curve) {
        const a = Math.atan2(p.vy, p.vx) + p.curve * dt, sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.x < b.x0 - 10 || p.x > b.x1 + 10 || p.y < b.y0 - 10 || p.y > b.y1 + 10) { this.endProj(p); continue; }
      if (!p.noObst && this.room) {
        let blocked = false;
        for (const ob of this.room.obst) if (dist2(p.x, p.y, ob.x, ob.y) < (ob.r + p.r * 0.5) * (ob.r + p.r * 0.5)) { blocked = true; break; }
        if (blocked) { this.endProj(p); continue; }
      }
      for (const u of this.units) {
        if (u.team === p.team || !alive(u) || u.untargetable || p.hits.has(u.id)) continue;
        if (u.kind === 'hero' && u.st.invuln > 0 && p.team !== 0 && !this.arena) continue;
        const rr = u.r + p.r;
        if (dist2(p.x, p.y, u.x, u.y) > rr * rr) continue;
        p.hits.add(u.id);
        const o = Object.assign({}, p.o);
        if (p.knock) { o.knock = p.knock; o.ka = Math.atan2(p.vy, p.vx); }
        if (p.src && alive(p.src) || p.src) this.hit(p.src, u, p.dmg, o);
        if (p.onHit) p.onHit(this, p, u);
        if (p.pierce-- <= 0) { this.endProj(p); break; }
      }
    }
    this.projs = this.projs.filter((p) => !p.done);
  }

  endProj(p) {
    if (p.done) return;
    p.done = true;
    if (p.explode) {
      for (const u of this.foesIn(p.team, p.x, p.y, p.explode.r)) if (!p.hits.has(u.id) || p.explode.all) this.hit(p.src, u, p.explode.dmg, Object.assign({}, p.o, { noProc: true }));
      this.emit('boom', p.x, p.y, p.explode.r, p.color);
    } else this.emit('poof', p.x, p.y, p.color);
    if (p.onEnd) p.onEnd(this, p);
  }

  // ---------- areas (zones, telegraphs, beams) ----------
  // a: { team, x, y, r, dur, delay, tele, shape: circle|line|cone, ang, len, wid, arc, tick, onTick, onFire, onUpdate, onEnd, follow, kind }
  addArea(a) {
    a.id = this.nid++;
    a.t = 0;
    a.tickT = 0;
    a.shape = a.shape || 'circle';
    if (a.dur == null) a.dur = a.delay || 1;
    this.areas.push(a);
    return a;
  }

  // A warning marker that deals its effect when the delay runs out.
  tele(team, shape, x, y, delay, onFire, o) {
    return this.addArea(Object.assign({ team, shape, x, y, delay, dur: delay, tele: true, onFire, r: 60 }, o));
  }

  inArea(a, u) {
    if (a.shape === 'circle') return dist2(a.x, a.y, u.x, u.y) <= (a.r + u.r) * (a.r + u.r);
    if (a.shape === 'ring') { const d = dist(a.x, a.y, u.x, u.y); return d >= a.r - a.wid / 2 - u.r && d <= a.r + a.wid / 2 + u.r; }
    if (a.shape === 'line') {
      const ex = a.x + Math.cos(a.ang) * a.len, ey = a.y + Math.sin(a.ang) * a.len;
      return segDist2(u.x, u.y, a.x, a.y, ex, ey) <= (a.wid / 2 + u.r) * (a.wid / 2 + u.r);
    }
    if (a.shape === 'cone') {
      const d = dist(a.x, a.y, u.x, u.y);
      if (d > a.len + u.r) return false;
      return d < u.r || Math.abs(angDiff(a.ang, angTo(a.x, a.y, u.x, u.y))) <= a.arc / 2 + Math.atan2(u.r, d);
    }
    return false;
  }

  foesInArea(a) { return this.units.filter((u) => u.team !== a.team && alive(u) && !u.untargetable && this.inArea(a, u)); }

  updateAreas(dt) {
    for (const a of this.areas) {
      if (a.done) continue;
      if (a.team !== -1 && this.timeFrozen(a.team)) continue;
      a.t += dt;
      if (a.follow) {
        if (a.follow.dead || a.follow.downed) { if (a.endOnOwner !== false) { a.done = true; if (a.onEnd) a.onEnd(this, a); continue; } } else { a.x = a.follow.x; a.y = a.follow.y; }
      }
      if (a.onUpdate) a.onUpdate(this, a, dt);
      if (a.delay && !a.fired && a.t >= a.delay) { a.fired = true; if (a.onFire) a.onFire(this, a); }
      if (a.tick && (!a.delay || a.fired)) {
        a.tickT += dt;
        while (a.tickT >= a.tick && !a.done) { a.tickT -= a.tick; if (a.onTick) a.onTick(this, a); }
      }
      if (a.t >= a.dur && !a.done) { a.done = true; if (a.onEnd) a.onEnd(this, a); }
    }
    this.areas = this.areas.filter((a) => !a.done);
  }

  // ---------- pickups ----------
  drop(kind, x, y, val) {
    const a = this.rand() * TAU, s = 60 + this.rand() * 120;
    this.picks.push({ id: this.nid++, kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, val: val || 1, t: 0 });
  }

  updatePicks(dt) {
    const hs = this.units.filter((u) => u.kind === 'hero' && alive(u) && (u.team === 0 || this.arena));
    for (const p of this.picks) {
      p.t += dt;
      p.vx *= Math.exp(-dt * 4);
      p.vy *= Math.exp(-dt * 4);
      let near = null, nd = 1e9;
      for (const h of hs) { const d = dist2(h.x, h.y, p.x, p.y); if (d < nd) { nd = d; near = h; } }
      const pull = p.kind === 'gold' ? (this.vacuum ? 5000 : 150) : 60;
      if (near && p.t > 0.35 && nd < pull * pull) {
        const a = angTo(p.x, p.y, near.x, near.y), sp = this.vacuum && p.kind === 'gold' ? 900 : 520;
        p.vx = lerp(p.vx, Math.cos(a) * sp, Math.min(1, dt * 7));
        p.vy = lerp(p.vy, Math.sin(a) * sp, Math.min(1, dt * 7));
        if (nd < (near.r + 10) * (near.r + 10)) { p.done = true; this.collect(near, p); }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const b = this.bounds(6);
      p.x = clamp(p.x, b.x0, b.x1);
      p.y = clamp(p.y, b.y0, b.y1);
      if (p.kind !== 'gold' && p.t > 30) p.done = true;
    }
    this.picks = this.picks.filter((p) => !p.done);
  }

  collect(h, p) {
    if (p.kind === 'gold') {
      const v = p.val * (1 + h.s.gold);
      this.gold += v;
      this.stats.gold += v;
      this.emit('coin', p.x, p.y, Math.round(v));
    } else if (p.kind === 'heal') {
      this.heal(h, h.maxHp * 0.2);
      this.emit('pick', h.x, h.y, '#5df0b0', 'HEAL');
    } else if (p.kind === 'power') {
      this.buff(h, 'power', 8, { dmg: 0.4, ms: 0.2 });
      this.emit('pick', h.x, h.y, '#ff5a4a', 'POWER!');
    } else if (p.kind === 'ultorb') {
      h.ult = Math.min(100, h.ult + 35);
      this.emit('pick', h.x, h.y, '#ffd23f', 'ULT +35');
    }
  }

  // ---------- hero turn ----------
  heroTick(u, dt) {
    const inp = u.input;
    if (u.ko) { inp.skill = inp.ult = inp.dash = false; return; }
    if (u.downed) {
      if (u.autoRev > 0) { u.autoRev -= dt; if (u.autoRev <= 0) { this.revive(u, 0.6, u); this.emit('text', u.x, u.y - 40, 'REBORN!', '#ffb22e', 18); } }
      else if (!u.deadOut) {
        u.bleed -= dt;
        if (u.bleed <= 0) { u.deadOut = true; this.emit('text', u.x, u.y - 30, 'OUT', '#ff5a4a', 14); }
      }
      u.mx = inp.mx * 0.25; u.my = inp.my * 0.25;
      inp.skill = inp.ult = inp.dash = false;
      return;
    }
    const s = u.s;
    u.cd.skill = Math.max(0, u.cd.skill - dt);
    u.cd.dash = Math.max(0, u.cd.dash - dt);
    u.atkT -= dt * (1 + u.bf.as) * (u.hero.id === 'gizmo' ? 1 + 0.15 * u.summons.filter((m) => !m.dead && m.stype === 'turret').length : 1);
    // regeneration, healer aura, shields
    let regen = s.regen;
    if (!this.arena && this.t - u.lastHurt > 5) regen += 0.01;
    if (regen > 0) this.heal(u, u.maxHp * regen * dt);
    if (s.bulwark) { u.counters.bulT += dt; if (u.counters.bulT >= 10) { u.counters.bulT = 0; this.shieldUp(u, u.maxHp * s.bulwark, 8); } }
    if (u.healAcc >= 1 && (this.tick % 20 === 0)) { this.emit('heal', u.x, u.y - u.r - 8, Math.round(u.healAcc)); u.healAcc = 0; }
    if (u.kit.tick) u.kit.tick(this, u, dt);
    // history for Rewind
    u.histT += dt;
    if (u.histT >= 0.1) { u.histT = 0; u.hist.push({ x: u.x, y: u.y, hp: u.hp }); if (u.hist.length > 32) u.hist.shift(); }
    // spirit blades
    if (s.blades) this.bladesTick(u, dt);

    const stunned = this.cantAct(u);
    u.mx = 0; u.my = 0;
    if (!stunned) {
      let mx = inp.mx, my = inp.my;
      const m = Math.hypot(mx, my);
      if (m > 1) { mx /= m; my /= m; }
      u.mx = mx; u.my = my;
      if (u.channel && u.channel.speed != null) { u.mx *= u.channel.speed; u.my *= u.channel.speed; }
      if (m > 0.2 && this.t - u.lastAtk > 0.35) u.ang = Math.atan2(my, mx);
      // dash
      if (inp.dash && u.cd.dash <= 0 && !u.dash) {
        const a = m > 0.2 ? Math.atan2(my, mx) : u.ang;
        u.dash = { vx: Math.cos(a) * 820, vy: Math.sin(a) * 820, t: 0.17 };
        u.st.invuln = Math.max(u.st.invuln, 0.26);
        u.cd.dash = DASH_CD * (s.uq.has('windcloak') ? 0.5 : 1);
        u.ang = a;
        this.emit('dash', u.id, u.x, u.y, a);
      }
      // skill
      if (inp.skill && u.cd.skill <= 0 && !u.channel) {
        if (u.kit.skill(this, u) !== false) {
          u.cd.skillMax = u.hero.skill.cd / (1 + s.cdr);
          u.cd.skill = u.cd.skillMax;
          if (s.echo && this.rand() < s.echo) { u.cd.skill = 0.25; this.emit('text', u.x, u.y - 34, 'ECHO!', '#c46bff', 14); }
          if (s.nova) {
            const n = s.nova;
            for (const f of this.foesIn(u.team, u.x, u.y, 130 + 20 * n)) this.hit(u, f, u.hero.basic.dmg * (1.2 + 0.6 * n), { kind: 'proc', knock: 140 });
            this.emit('ring', u.x, u.y, 130 + 20 * n, u.hero.color);
          }
          this.emit('cast', u.id, 'skill');
        }
      }
      // ultimate
      if (inp.ult && u.ult >= 100 && !u.channel) {
        if (u.kit.ult(this, u) !== false) {
          u.ult = 0;
          if (u.team === 0 || this.arena) this.stats.ults++;
          if (s.avatar) this.buff(u, 'avatar', 6, { dmg: 0.5, ms: 0.3 });
          this.emit('ult', u.id, u.hero.ult.name);
        }
      }
      // channel
      if (u.channel) {
        u.channel.t -= dt;
        if (u.channel.onTick) u.channel.onTick(this, u, dt);
        if (u.channel.t <= 0) { const c = u.channel; u.channel = null; if (c.onEnd) c.onEnd(this, u); }
      }
      // basic attack (automatic)
      if (u.atkT <= 0 && !(u.channel && u.channel.noBasic)) {
        const rng = u.basicRange ? u.basicRange : u.hero.basic.range;
        let tgt = u.target && alive(u.target) && dist(u.x, u.y, u.target.x, u.target.y) <= rng + u.target.r ? u.target : null;
        if (!tgt) tgt = this.nearestFoe(u, rng);
        if (tgt && u.st.invis > 0 && u.counters.crits <= 0 && false) tgt = null;
        if (tgt) {
          u.target = tgt;
          u.ang = angTo(u.x, u.y, tgt.x, tgt.y);
          u.lastAtk = this.t;
          u.kit.basic(this, u, tgt);
          u.basicN++;
          if (s.twin) {
            const t2 = tgt;
            this.later(0.12, () => { if (alive(u) && alive(t2)) u.kit.basic(this, u, t2, 0.5); });
          }
          u.anim = 1;
          u.animK = 0;
          u.atkT = 1 / (u.hero.basic.rate * s.as * (u.rateMul || 1));
        } else u.atkT = Math.max(u.atkT, 0);
      }
    }
    if (u.anim > 0) u.anim = Math.max(0, u.anim - dt * 5);
    inp.skill = inp.ult = inp.dash = false;
  }

  bladesTick(u, dt) {
    const n = u.s.blades;
    u.counters.bladeHit = u.counters.bladeHit || {};
    for (let i = 0; i < n; i++) {
      const a = this.t * 3.2 + (i / n) * TAU;
      const bx = u.x + Math.cos(a) * 62, by = u.y + Math.sin(a) * 62;
      for (const f of this.foesIn(u.team, bx, by, 12)) {
        const k = f.id;
        if ((u.counters.bladeHit[k] || 0) > this.t) continue;
        u.counters.bladeHit[k] = this.t + 0.45;
        this.hit(u, f, u.hero.basic.dmg * 0.55, { kind: 'proc', knock: 60 });
      }
    }
  }

  // run fn after a delay in sim time. A team other than -1 pauses while that team is frozen in time.
  later(delay, fn, team) { this.addArea({ team: team == null ? -1 : team, x: 0, y: 0, r: 0, dur: delay, hidden: true, onEnd: fn }); }

  summonTick(u, dt) {
    u.life -= dt;
    if (u.life <= 0 || (u.owner && u.owner.dead) || (u.stype === 'wisp' && u.owner && u.owner.ko)) { u.dead = true; this.emit('poof', u.x, u.y, '#9affc6'); return; }
    u.mx = u.my = 0;
    if (this.cantAct(u)) return;
    const o = u.owner;
    u.atkT -= dt;
    if (u.stype === 'wisp') {
      if (!o || o.downed) return;
      const a = this.t * 1.6 + u.id;
      const tx = o.x + Math.cos(a) * 44, ty = o.y - 30 + Math.sin(a) * 14;
      u.x = lerp(u.x, tx, Math.min(1, dt * 6));
      u.y = lerp(u.y, ty, Math.min(1, dt * 6));
      if (u.atkT <= 0) {
        const t = this.nearestFoe(u, 360);
        if (t) {
          u.atkT = 0.9;
          this.shoot(u, { x: u.x, y: u.y, ang: angTo(u.x, u.y, t.x, t.y), spd: 520, r: 6, dmg: o.hero.basic.dmg * 0.45, range: 380, kind: 'wisp', color: '#bff8ff', o: { kind: 'proc' }, homing: 4 });
        }
      }
      return;
    }
    u.ai.retarget -= dt;
    if (!u.ai.tgt || !alive(u.ai.tgt) || u.ai.retarget <= 0) { u.ai.tgt = this.nearestFoe(u, u.stype === 'turret' ? 400 : 600); u.ai.retarget = 0.6; }
    const t = u.ai.tgt;
    if (u.stype === 'turret') {
      if (t && u.atkT <= 0) {
        u.atkT = 1 / 3;
        u.ang = angTo(u.x, u.y, t.x, t.y);
        this.shoot(u, { x: u.x + Math.cos(u.ang) * 14, y: u.y + Math.sin(u.ang) * 14, ang: u.ang + (this.rand() - 0.5) * 0.1, spd: 700, r: 5, dmg: 13, range: 420, kind: 'rivet', color: '#ffd27a', o: { kind: 'proc' } });
      }
      return;
    }
    // skeleton warriors
    if (t) {
      const d = dist(u.x, u.y, t.x, t.y);
      u.ang = angTo(u.x, u.y, t.x, t.y);
      if (d > u.r + t.r + 18) { u.mx = Math.cos(u.ang); u.my = Math.sin(u.ang); }
      else if (u.atkT <= 0) {
        u.atkT = 0.85;
        u.anim = 1;
        this.hit(u, t, u.stype === 'champion' ? 34 : 15, { kind: 'proc', knock: 40 });
        this.emit('slash', u.x, u.y, u.ang, u.r + 22, 1.4, '#cfe8d8');
      }
    } else if (o && alive(o)) {
      const d = dist(u.x, u.y, o.x, o.y);
      if (d > 90) { const a = angTo(u.x, u.y, o.x, o.y); u.mx = Math.cos(a); u.my = Math.sin(a); }
    }
    if (u.anim > 0) u.anim = Math.max(0, u.anim - dt * 5);
  }

  // ---------- movement & collisions ----------
  moveUnits(dt) {
    const ob = this.room ? this.room.obst : [];
    for (const u of this.units) {
      if (u.dead) continue;
      if (this.timeFrozen(u.team) && u.kind !== 'hero') { u.px = u.x; u.py = u.y; continue; }
      if (this.timeFrozen(u.team) && u.kind === 'hero') { u.px = u.x; u.py = u.y; continue; }
      u.px = u.x; u.py = u.y;
      if (u.stype === 'wisp') continue;
      let vx = 0, vy = 0;
      const st = u.st;
      if (u.dash) {
        vx = u.dash.vx; vy = u.dash.vy;
        u.dash.t -= dt;
        if (u.dash.t <= 0) { const dd = u.dash; u.dash = null; if (dd.onEnd) dd.onEnd(this, u); }
      } else if (!(st.freeze > 0 || st.stun > 0 || st.root > 0)) {
        const sp = u.spd * u.spdMul * (1 - (st.slow > 0 ? st.slowAmt : 0)) * (1 + u.bf.ms) * (u.downed ? 0.35 : 1);
        vx = u.mx * sp; vy = u.my * sp;
      }
      vx += u.kx; vy += u.ky;
      const damp = Math.exp(-dt * 9);
      u.kx *= damp; u.ky *= damp;
      u.x += vx * dt;
      u.y += vy * dt;
      if (!u.flyer && !(u.dash && u.dash.air)) {
        for (const o of ob) {
          const dx = u.x - o.x, dy = u.y - o.y, m = u.r + o.r;
          const d2 = dx * dx + dy * dy;
          if (d2 < m * m) {
            const d = Math.sqrt(d2) || 0.01;
            u.x = o.x + dx / d * m;
            u.y = o.y + dy / d * m;
          }
        }
      }
      const b = this.bounds(u.r);
      u.x = clamp(u.x, b.x0, b.x1);
      u.y = clamp(u.y, b.y0, b.y1);
    }
    // separation
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (a.dead || a.downed || a.ko || a.stype === 'wisp' || (a.dash && a.dash.air)) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (b.dead || b.downed || b.ko || b.stype === 'wisp' || (b.dash && b.dash.air)) continue;
        if (a.flyer !== b.flyer && (a.kind === 'mob' || b.kind === 'mob')) continue;
        const dx = b.x - a.x, dy = b.y - a.y, m = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= m * m || d2 === 0) continue;
        const d = Math.sqrt(d2), push = (m - d);
        const sameHeroTeam = a.kind === 'hero' && b.kind === 'hero' && a.team === b.team;
        const k = sameHeroTeam ? 0.15 : 0.5;
        const ma = a.mass, mb = b.mass, tot = ma + mb;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push * (mb / tot) * k * 2;
        a.y -= ny * push * (mb / tot) * k * 2;
        b.x += nx * push * (ma / tot) * k * 2;
        b.y += ny * push * (ma / tot) * k * 2;
      }
    }
  }

  // ---------- main step ----------
  step() {
    const dt = SIM_DT;
    this.t += dt;
    this.tick++;
    if (this.timeStop) { this.timeStop.t -= dt; if (this.timeStop.t <= 0) this.timeStop = null; }
    if (this.mode) this.mode.update(dt);
    for (const u of this.units) {
      if (u.dead) continue;
      if (this.timeFrozen(u.team)) { if (u.flash > 0) u.flash -= dt; continue; }
      this.tickStatus(u, dt);
      if (u.dead) continue;
      if (u.kind === 'hero') this.heroTick(u, dt);
      else if (u.kind === 'mob') mobTick(this, u, dt);
      else if (u.kind === 'boss') bossTick(this, u, dt);
      else if (u.kind === 'summon') this.summonTick(u, dt);
    }
    this.moveUnits(dt);
    this.updateProjs(dt);
    this.updateAreas(dt);
    this.updatePicks(dt);
    this.reviveTick(dt);
    if (this.units.some((u) => u.dead)) this.units = this.units.filter((u) => !u.dead);
    if (this.combo.t > 0) { this.combo.t -= dt; if (this.combo.t <= 0) this.combo.n = 0; }
    if (this.multi.t > 0) { this.multi.t -= dt; if (this.multi.t <= 0) { if (this.multi.n >= 6) this.emit('multi', this.multi.n); this.multi.n = 0; } }
  }

  reviveTick(dt) {
    if (this.arena) return;
    for (const u of this.units) {
      if (u.kind !== 'hero' || !u.downed || u.deadOut || u.autoRev > 0) continue;
      let helper = null;
      for (const o of this.units) if (o !== u && o.kind === 'hero' && o.team === u.team && alive(o) && dist2(o.x, o.y, u.x, u.y) < 72 * 72) { helper = o; break; }
      if (helper) {
        u.reviveP += dt;
        u.reviver = helper;
        if (u.reviveP >= REVIVE_TIME) this.revive(u, 0.4, helper);
      } else u.reviveP = Math.max(0, u.reviveP - dt * 0.5);
    }
  }

  // counts a monster kill towards streaks and multi-kills
  countKill(u) {
    this.stats.kills++;
    this.multi.n++;
    this.multi.t = 0.8;
    if (this.multi.n > this.stats.bestMulti) this.stats.bestMulti = this.multi.n;
    if (u.elite) this.stats.elites++;
  }
}
