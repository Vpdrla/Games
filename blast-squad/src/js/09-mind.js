// ---------- Bot mind: memory, attention and utility decisions ----------
// A bot is modelled as a person playing on a phone. It sees only its percept (08-perceive.js), notices
// new things after a human reaction time, remembers enemies it lost sight of (with growing doubt),
// and picks a goal a few times a second by weighing options with its personality and skill. Coordination
// goes through quick-chat pins that arrive late and aren't always followed. Mistakes mostly come out of
// the parameters (slow reactions, narrow attention under stress, tilt), plus rare explicit lapses.

// Skill (0..1, from the trophy band) and traits -> the numbers that drive the bot.
function botParams(profile) {
  const s = clamp(profile && profile.skill != null ? profile.skill : 0.5, 0, 1);
  const tr = (profile && profile.traits) || {};
  const tv = (k, d) => (tr[k] != null ? clamp(tr[k], 0, 1) : d);
  const aggr = tv('aggr', 0.5);
  return {
    s,
    reactMed: lerp(0.4, 0.205, s), reactSig: 0.32, reactMin: 0.13, // reaction time (s), lognormal
    think: 1 / lerp(4, 8, s), // decision interval (s)
    commit: lerp(1.5, 0.6, s), // minimum time on a goal (s)
    temp: lerp(0.42, 0.24, s), // softmax temperature: beginners pick less sensibly (nobody is a perfect maximiser)
    memT: lerp(2.5, 6.5, s), // how long an unseen enemy is remembered (s)
    aimErr: lerp(3.6, 1.1, s), // scale of aim endpoint error (thumbs on glass are not mice)
    lead: lerp(0.15, 0.9, s), // share of the correct lead on moving targets
    flick: lerp(0.3, 0.16, s), fitts: lerp(0.11, 0.065, s), // aim movement time = flick + fitts*log2(1+D/W)
    autoAim: lerp(0.7, 0.12, s), // chance a shot is a plain auto-aim tap
    dodge: lerp(0.12, 0.7, s), // chance to sidestep a shot it noticed in time
    discipline: lerp(0.15, 0.9, s), // holds fire out of range / keeps ammo
    stickRate: lerp(5.5, 10, s), // how fast the thumb swings the move stick (rad/s)
    juke: lerp(0.35, 1.15, s) * (0.6 + aggr * 0.8), // sideways juke bursts per second in a fight
    aimStop: lerp(0.4, 0.1, s), // chance to stop walking while lining up a manual shot
    supNotice: lerp(4, 2.2, s), // typical seconds before a charged super gets used at all
    aggr, patience: tv('patience', 0.5), greed: tv('greed', 0.5), teamwork: tv('teamwork', 0.6), tilt: tv('tilt', 0.3),
    retreatHP: lerp(0.45, 0.26, aggr) * lerp(1, 1.08, s),
    lapse: lerp(2, 0.3, s) / 60 / lerp(4, 8, s), // explicit lapses: about 2 a minute for beginners, 0.3 for experts
  };
}

// Attack facts the bot knows about a brawler (its own kit, or what everyone knows about an enemy).
function atkFacts(spec, kitSpeed) {
  if (!spec) return { t: 'none', range: 0, spd: Infinity, lob: false, T: 0, melee: false, spread: 0, n: 1, eff: 0 };
  const t = spec.t;
  const range = spec.range || spec.dist || (spec.r && t === 'pulse' ? spec.r : 0) || 0;
  const lob = t === 'lob' || t === 'leap' || (t === 'deploy') || (t === 'area' && spec.at !== 'self');
  const spd = t === 'shot' ? spec.spd || 12 : t === 'dash' ? spec.spd || 14 : Infinity;
  const spread = spec.spread || 0;
  // effective range: shotguns want to be close, everything else near max range
  const eff = range * (t === 'shot' && spec.n >= 4 && spread > 0.3 ? 0.68 : t === 'dash' ? 0.9 : 0.93);
  return { t, range, spd, lob, T: spec.T || (lob ? 0.75 : 0), melee: t === 'dash' || t === 'arc' || range < 3.5, spread, n: spec.n || 1, eff, dmg: spec.dmg || 0, heal: spec.heal || spec.hps || 0, away: !!spec.away, what: spec.what, unit: spec.unit, sp: kitSpeed };
}

class Mind {
  constructor(slot, profile, rng) {
    this.slot = slot;
    this.prof = profile || {};
    this.p = botParams(profile);
    this.rng = rng;
    this.mem = {}; // enemy slot -> memory
    this.shotMem = new Map(); // shot id -> { noticeAt, dodge }
    this.intent = { goal: 'hold', gx: 0, gy: 0, target: -1, stance: 1, wantSuper: false, wantGadget: false, superMode: 'target', gadMode: 'target', bushShot: null, boxShot: null, kick: null };
    this.goalT = 0; // when the current goal started
    this.nextThink = 0;
    this.deaths = []; // times of own deaths (tilt)
    this.wasAlive = true;
    this.pinQ = []; // outgoing pins waiting for the thumb: { at, id }
    this.pinCd = 0;
    this.pinSeen = new Set();
    this.bias = { attack: 0, defend: 0, help: -1, helpT: 0, gems: 0 };
    this.outPin = null;
    this.outEmote = null;
    this.bushes = null;
    this.lastTarget = -1;
    this.lastTargetHp = 1;
    this.lastTargetT = 0;
    this.lapse = null; // { goal, until }
    this.supAt = -1; // when a charged super has been noticed
    this.retreatHPs = []; // telemetry: hp share when a retreat starts
    this.reacts = []; // telemetry: modelled reaction times
  }

  reaction(extra) {
    const p = this.p, r = this.rng;
    // lognormal around the median, never faster than a human can manage
    const z = Math.sqrt(-2 * Math.log(1 - r.next() * 0.999999)) * Math.cos(TAU * r.next());
    return Math.max(p.reactMin, p.reactMed * Math.exp(p.reactSig * z)) + (extra || 0);
  }

  // ---- memory & attention ----
  observe(P) {
    const t = P.t, me = P.me, p = this.p;
    if (this.wasAlive && !me.alive) { this.deaths.push(t); if (this.rng.chance(0.25 + p.tilt * 0.3)) this.outEmote = this.rng.pick([2, 3]); }
    this.wasAlive = me.alive;
    while (this.deaths.length && t - this.deaths[0] > 60) this.deaths.shift();
    const stress = me.alive && me.hp / me.maxHp < 0.35 && this.intent.target >= 0 ? 1 : 0;
    const seenNow = this._seenNow || (this._seenNow = new Set());
    seenNow.clear();
    for (const e of P.enemies) {
      seenNow.add(e.slot);
      let m = this.mem[e.slot];
      if (!m) m = this.mem[e.slot] = { x: e.x, y: e.y, vx: 0, vy: 0, t: t, first: t, noticeAt: 0, noticed: false, seen: false, hp: e.hp, maxHp: e.maxHp, bk: e.bk, carry: 0, inBush: false, team: e.team, bounty: 0 };
      if (!m.seen) {
        // a new sighting: notice it after a reaction time (slower when busy with another target)
        if (!m.noticed || t - m.t > 1.2) {
          m.noticed = false;
          const r = this.reaction(stress && this.intent.target !== e.slot ? 0.15 + 0.2 * (1 - p.s) : 0);
          m.noticeAt = t + r;
          this.reacts.push(r);
          if (this.reacts.length > 400) this.reacts.shift();
        }
        m.first = t;
        m.vx = m.vy = 0;
      } else {
        const dt = t - m.t;
        if (dt > 0) {
          const k = 0.45;
          m.vx = lerp(m.vx, (e.x - m.x) / dt, k);
          m.vy = lerp(m.vy, (e.y - m.y) / dt, k);
        }
      }
      m.x = e.x; m.y = e.y; m.t = t; m.seen = true; m.hp = e.hp; m.maxHp = e.maxHp; m.carry = e.carry; m.inBush = e.inBush; m.bk = e.bk; m.team = e.team; m.bounty = e.bounty || 0;
      if (!m.noticed && t >= m.noticeAt) m.noticed = true;
    }
    for (const k in this.mem) {
      const m = this.mem[k];
      if (seenNow.has(+k)) continue;
      if (m.seen) { m.seen = false; m.lostT = t; }
      if (!m.noticed && t >= m.noticeAt && t - m.t < 0.4) m.noticed = true;
      if (t - m.t > p.memT) delete this.mem[k];
    }
    // incoming shots: noticed after a (slightly quicker: they're bright and moving) reaction
    for (const s of P.shots) {
      if (!this.shotMem.has(s.id)) this.shotMem.set(s.id, { noticeAt: t + this.reaction() * 0.85, dodge: this.rng.chance(p.dodge), born: t });
    }
    if (this.shotMem.size > 80) for (const [id, v] of this.shotMem) if (t - v.born > 3) this.shotMem.delete(id);
    // teammates' pins (once each)
    for (const pin of P.pins) {
      const key = pin.slot * 1000 + Math.round((t - pin.age) * 10);
      if (this.pinSeen.has(key)) continue;
      this.pinSeen.add(key);
      if (!this.rng.chance(p.teamwork)) continue; // not everyone reads the chat
      if (pin.id === 0) this.bias.attack = t + 6;
      else if (pin.id === 1) this.bias.defend = t + 6;
      else if (pin.id === 2) { this.bias.help = pin.slot; this.bias.helpT = t + 5; } else if (pin.id === 6) this.bias.gems = t + 6;
    }
    if (this.pinSeen.size > 200) this.pinSeen.clear();
  }

  // Enemies the bot has noticed and still has in memory.
  known(onlySeen) {
    const out = this._known || (this._known = []);
    out.length = 0;
    for (const k in this.mem) { const m = this.mem[k]; if (m.noticed && (!onlySeen || m.seen)) { m.slot = +k; out.push(m); } }
    return out;
  }

  // ---- map knowledge ----
  base(P) {
    const sp = P.map.spawns[P.me.team] || P.map.spawns[0];
    if (!this._base || this._baseTeam !== P.me.team) {
      let x = 0, y = 0;
      for (const p of sp) { x += p.x; y += p.y; }
      this._base = { x: x / sp.length, y: y / sp.length };
      this._baseTeam = P.me.team;
    }
    return this._base;
  }
  bushList(P) {
    if (!this.bushes) {
      this.bushes = [];
      const m = P.map;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (TILE_FLAGS[m.tiles[y * m.w + x]] & TF_BUSH) this.bushes.push({ x: x + 0.5, y: y + 0.5 });
    }
    return this.bushes;
  }

  // ---- decisions ----
  decide(P, kit) {
    const t = P.t, me = P.me, p = this.p, I = this.intent, r = this.rng;
    if (!me.alive) { I.goal = 'dead'; I.target = -1; I.wantSuper = I.wantGadget = false; return; }
    const atk = kit.atkF, myHPf = me.hp / me.maxHp;
    const tilt = Math.min(1, this.deaths.length * 0.3) * p.tilt; // repeated deaths make some players reckless
    const known = this.known(false);
    const visible = known.filter((m) => m.seen);
    // danger: enemies that could hit me soon
    let danger = 0, near = 0;
    for (const m of visible) {
      const ef = atkFacts(BRAWLERS[m.bk] && BRAWLERS[m.bk].atk, 0);
      const d = Math.hypot(m.x - me.x, m.y - me.y);
      if (d < ef.range + 1.5) { danger += 1 - d / (ef.range + 1.5) + 0.3; near++; }
    }
    // target choice (sticky: tunnel vision grows under stress)
    let target = null, best = -1e9;
    const stress = myHPf < 0.4 ? 1 : 0;
    for (const m of visible) {
      const d = Math.hypot(m.x - me.x, m.y - me.y);
      let sc = 1.1 * (1 - m.hp / m.maxHp) + (1 - Math.min(1, d / 12)) * 1.1 + (m.carry || 0) * 0.06 + (m.bounty || 0) * 0.05;
      if (d < atk.range) sc += 0.4;
      if (m.slot === this.lastTarget) sc += 0.35 + stress * 0.4;
      if (P.ball && P.ball.holderSlot === m.slot) sc += 0.6;
      sc += r.range(-0.15, 0.15) * (1 - p.s);
      if (sc > best) { best = sc; target = m; }
    }
    const allies = P.allies.filter((a) => a.alive);
    const nearAllies = allies.filter((a) => Math.hypot(a.x - me.x, a.y - me.y) < 7).length;
    const opts = this._opts || (this._opts = []);
    opts.length = 0;
    const add = (goal, score, gx, gy, tg, stance) => opts.push({ goal, score, gx, gy, tg: tg ? tg.slot : -1, stance });
    const sd = P.mode === MODE.SHOWDOWN;
    const B = sd ? null : this.base(P);
    const hold = this.holdPoint(P, kit, B);
    // hold your lane / position
    add('hold', 0.32 + p.patience * 0.1, hold.x, hold.y, null, 1);
    // fight the chosen target
    if (target) {
      const d = Math.hypot(target.x - me.x, target.y - me.y);
      let f = 0.38 + p.aggr * 0.32 + tilt * 0.25 + (1 - target.hp / target.maxHp) * 0.3 + nearAllies * 0.06 - Math.max(0, near - 1 - nearAllies) * 0.14;
      f -= (1 - myHPf) * (0.55 - tilt * 0.3);
      if (me.ammo < 1 && !atk.melee) f -= 0.18;
      if (d > atk.range * 1.8) f -= 0.15;
      if (t < this.bias.attack) f += 0.2;
      if (sd) {
        // Showdown: a fight now invites a third party; most players farm cubes first and pick
        // fights they can win, more so as the poison squeezes everyone together
        const k = P.poison ? P.poison.k : 0, weak = target.hp / target.maxHp < 0.45, close = d < atk.range;
        f -= (weak || close ? 0.05 : 0.32) * (1 - k) + Math.max(0, visible.length - 1) * 0.09;
        f += (me.cubes - (target.cubes || 0)) * 0.05;
      }
      if (P.mode === MODE.KNOCKOUT) {
        // no respawns: don't take a fight you're likely to lose, and poke rather than charge
        const al = (P.hud && P.hud.alive) || [3, 3], mine = al[me.team], theirs = al[1 - me.team];
        f -= 0.12 + Math.max(0, theirs - mine) * 0.18 - Math.max(0, mine - theirs) * 0.1;
      }
      add('fight', f, target.x, target.y, target, (1 + p.aggr * 0.3 + tilt * 0.3) * (P.mode === MODE.KNOCKOUT ? 0.85 : 1));
    }
    // retreat to heal
    const rhp = p.retreatHP * (1 - tilt * 0.4);
    if (myHPf < rhp || (me.ammo < 0.6 && near > 0 && !atk.melee && myHPf < 0.7)) {
      const rx = sd ? me.x - (target ? target.x - me.x : 0) : B.x, ry = sd ? me.y - (target ? target.y - me.y : 0) : B.y;
      add('retreat', 0.62 + (rhp - myHPf) * 1.6 + danger * 0.25 - tilt * 0.25, rx, ry, null, 0);
    }
    // ambush from a bush near the hold point (assassins, tanks and patient players)
    const role = BRAWLERS[me.bk].role;
    if (!target && (role === 'assassin' || role === 'tank' || p.patience > 0.7)) {
      const bu = this.nearestBush(P, hold.x, hold.y, 4.5);
      if (bu) add('ambush', 0.24 + p.patience * 0.28 + (role === 'assassin' ? 0.12 : 0), bu.x, bu.y, null, 0.6);
    }
    // help a teammate who asked for it
    if (this.bias.help >= 0 && t < this.bias.helpT) {
      const a = P.allies.find((x) => x.slot === this.bias.help && x.alive);
      if (a) add('help', 0.45 + p.teamwork * 0.3, a.x, a.y, null, 1.1);
    }
    this.modeOptions(P, kit, add, target, danger, myHPf, hold);
    // poison: get out (and stay inside) before anything else
    if (P.poison) {
      const pz = P.poison;
      const margin = 1.6;
      if (me.x < pz.x0 + margin || me.x > pz.x1 - margin || me.y < pz.y0 + margin || me.y > pz.y1 - margin) {
        add('poison', 1.4, (pz.x0 + pz.x1) / 2, (pz.y0 + pz.y1) / 2, null, 0.5);
      }
    }
    // pick: softmax with commitment to the current goal
    const cur = I.goal;
    const committed = t - this.goalT < p.commit;
    let tot = 0;
    for (const o of opts) {
      let sc = o.score;
      if (o.goal === cur) sc += committed ? 0.35 : 0.12;
      o.w = Math.exp(sc / p.temp);
      tot += o.w;
    }
    let pick = opts[0], x = r.next() * tot;
    for (const o of opts) { x -= o.w; if (x <= 0) { pick = o; break; } }
    // rare lapses: overextend into enemy territory or forget the objective for a while
    if (this.lapse && t > this.lapse.until) this.lapse = null;
    if (!this.lapse && r.chance(p.lapse) && !sd && pick.goal !== 'poison') {
      const ex = P.map.w - B.x, ey = P.map.h - B.y;
      this.lapse = { until: t + r.range(2, 4.5), goal: { goal: 'overextend', gx: lerp(hold.x, ex, 0.7), gy: lerp(hold.y, ey, 0.7), tg: target ? target.slot : -1, stance: 1.4 } };
    }
    if (this.lapse && pick.goal !== 'poison' && pick.goal !== 'retreat') pick = this.lapse.goal;
    if (pick.goal !== cur) {
      this.goalT = t;
      if (pick.goal === 'retreat') { this.retreatHPs.push(myHPf); if (this.retreatHPs.length > 200) this.retreatHPs.shift(); }
      this.sayFor(pick.goal, P);
    }
    I.goal = pick.goal; I.gx = pick.gx; I.gy = pick.gy; I.stance = pick.stance;
    I.target = pick.tg >= 0 ? pick.tg : target && pick.goal !== 'retreat' && pick.goal !== 'carry' ? target.slot : -1;
    if (I.target >= 0) { this.lastTarget = I.target; const m = this.mem[I.target]; if (m) { this.lastTargetHp = m.hp / m.maxHp; this.lastTargetT = t; } }
    this.decideAbilities(P, kit, target, danger, myHPf, near);
    this.decideBushShot(P, kit, target);
  }

  // Where to stand when nothing is happening: your lane, at a depth set by your role.
  holdPoint(P, kit, B) {
    const me = P.me, m = P.map, role = BRAWLERS[me.bk].role;
    if (P.mode === MODE.SHOWDOWN) {
      const pz = P.poison;
      const cx = pz ? (pz.x0 + pz.x1) / 2 : m.w / 2, cy = pz ? (pz.y0 + pz.y1) / 2 : m.h / 2;
      // roam near where you are early on; drift inwards as the poison closes
      const k = pz ? pz.k : 0, pull = 0.12 + 0.6 * k;
      if (!this._roam || P.t > this._roamT) { this._roam = { x: lerp(me.x, cx, pull) + this.rng.range(-4, 4), y: lerp(me.y, cy, pull) + this.rng.range(-4, 4) }; this._roamT = P.t + this.rng.range(4, 9); }
      return this._roam;
    }
    const lane = [0.22, 0.5, 0.78][(this.slot % 3)];
    const mid = { x: m.w / 2, y: m.h / 2 };
    let depth = role === 'sharp' || role === 'thrower' ? 0.55 : role === 'support' ? 0.62 : role === 'tank' || role === 'assassin' ? 0.86 : 0.74;
    depth += (this.p.aggr - 0.5) * 0.2;
    if (P.t < this.bias.defend) depth -= 0.25;
    // Knockout: nobody can wait forever; as a round goes on, everyone creeps forward
    if (P.mode === MODE.KNOCKOUT && P.hud) depth += Math.min(0.3, Math.max(0, 120 - P.hud.time) / 45 * 0.3);
    // nobody holds a spot perfectly still: drift a little around it every few seconds
    if (!this._hOff || P.t > this._hOffT) {
      const R = 1 + 1.6 * (1 - this.p.patience);
      this._hOff = { x: this.rng.range(-R, R), y: this.rng.range(-R, R) * 0.6 };
      this._hOffT = P.t + this.rng.range(1.3, 3.2);
    }
    const x = lerp(m.w * lane, mid.x, 0.25) + this._hOff.x, y = lerp(B.y, mid.y, depth) + this._hOff.y;
    return { x: clamp(x, 1, m.w - 1), y: clamp(y, 1, m.h - 1) };
  }

  nearestBush(P, x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const b of this.bushList(P)) { const d = dist2(b.x, b.y, x, y); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  // ---- mode objectives ----
  modeOptions(P, kit, add, target, danger, myHPf, hold) {
    const me = P.me, p = this.p, h = P.hud || {}, t = P.t, map = P.map, r = this.rng;
    if (P.mode === MODE.GEM) {
      const team = me.team, my = h.gems ? h.gems[team] : 0, their = h.gems ? h.gems[1 - team] : 0;
      const mine = map.mine || { x: map.w / 2, y: map.h / 2 };
      const gems = P.pickups.filter((q) => q.pick === PICK.GEM);
      // the collector: the living teammate closest to the mine (that might be me)
      const dMe = Math.hypot(mine.x - me.x, mine.y - me.y);
      const closer = P.allies.filter((a) => a.alive && Math.hypot(mine.x - a.x, mine.y - a.y) < dMe - 1).length;
      const collector = closer === 0;
      if (gems.length) {
        let g = gems[0], gd = 1e9;
        for (const q of gems) { const d = Math.hypot(q.x - me.x, q.y - me.y); if (d < gd) { gd = d; g = q; } }
        // a teammate is closer to that gem: leave it to them (mostly)
        const beaten = P.allies.some((a) => a.alive && Math.hypot(g.x - a.x, g.y - a.y) < gd - 1);
        add('collect', 0.5 + p.greed * 0.3 + (collector ? 0.2 : 0) - (beaten ? 0.3 : 0) - danger * 0.3 + (t < this.bias.gems ? 0.2 : 0) - Math.min(0.3, gd / 30), g.x, g.y, null, 0.8);
      } else if (collector && dMe > 2.5) add('collect', 0.42 + p.greed * 0.2 - danger * 0.25, mine.x, mine.y + (me.team === 0 ? 1.6 : -1.6), null, 0.9);
      // carrying a pile, or our countdown is running: get it home safely
      const B = this.base(P);
      if (me.carry >= 4 || (h.countTeam === team && me.carry > 0)) {
        add('carry', 0.7 + me.carry * 0.03 + (h.countTeam === team ? 0.25 : 0) - (target && myHPf > 0.7 && p.aggr > 0.7 ? 0.25 : 0), lerp(B.x, mine.x, 0.25), lerp(B.y, mine.y, 0.25), null, 0.3);
      }
      // their countdown: everyone pushes the carriers
      if (h.countTeam === 1 - team) {
        let carrier = null;
        for (const m of this.known(false)) if (m.carry > 0 && (!carrier || m.carry > carrier.carry)) carrier = m;
        const gx = carrier ? carrier.x : lerp(mine.x, map.w - B.x, 0.5), gy = carrier ? carrier.y : lerp(mine.y, map.h - B.y, 0.5);
        add('push', 0.85 + p.aggr * 0.15, gx, gy, carrier, 1.5);
        if (this.pinCd < t && r.chance(p.teamwork * 0.4)) this.pin(0, t);
      } else if (h.countTeam === team && me.carry === 0) {
        add('defend', 0.6 + p.teamwork * 0.2, lerp(hold.x, this.base(P).x, 0.3), lerp(hold.y, this.base(P).y, 0.3), null, 0.7);
      }
      if (their > my + 3 && my + their > 6) add('push', 0.55 + p.aggr * 0.2, mine.x, mine.y, null, 1.3);
    } else if (P.mode === MODE.BALL && P.ball) {
      const ball = P.ball, enemyGoal = map.goals.find((g) => g.team !== me.team), ownGoal = map.goals.find((g) => g.team === me.team);
      const eg = enemyGoal ? { x: (enemyGoal.x0 + enemyGoal.x1) / 2, y: (enemyGoal.y0 + enemyGoal.y1) / 2 } : { x: map.w / 2, y: me.team === 0 ? 0 : map.h };
      const og = ownGoal ? { x: (ownGoal.x0 + ownGoal.x1) / 2, y: (ownGoal.y0 + ownGoal.y1) / 2 } : this.base(P);
      const I = this.intent;
      if (ball.holderSlot !== me.slot) I.passTo = null;
      if (ball.holderSlot === me.slot) {
        add('dribble', 1.6, eg.x, eg.y, null, 1.2);
        // pressed by an enemy: pass to a teammate further up who is in the open (if I think of it)
        const dGoal = Math.hypot(eg.x - me.x, eg.y - me.y);
        const press = this.known(true).filter((q) => Math.hypot(q.x - me.x, q.y - me.y) < 3.2).length;
        if (!I.passTo && press && dGoal > Bot.KICK_RANGE * 0.8 && r.chance(0.2 + p.teamwork * 0.45)) {
          let best = null, bs = 2;
          for (const a of P.allies) {
            if (!a.alive) continue;
            const da = Math.hypot(a.x - me.x, a.y - me.y), gain = dGoal - Math.hypot(eg.x - a.x, eg.y - a.y);
            const open = !this.known(true).some((q) => Math.hypot(q.x - a.x, q.y - a.y) < 2.2);
            if (da > 2.5 && da < Bot.PASS_RANGE + 0.5 && open && gain > bs) { bs = gain; best = a; }
          }
          if (best) I.passTo = { x: best.x, y: best.y };
        }
      } else if (ball.holderSlot < 0) {
        const dMe = Math.hypot(ball.x - me.x, ball.y - me.y);
        const closer = P.allies.filter((a) => a.alive && Math.hypot(ball.x - a.x, ball.y - a.y) < dMe - 0.5).length;
        add('ball', (closer === 0 ? 0.95 : 0.45) + p.greed * 0.1, ball.x, ball.y, null, 1.1);
      } else if (ball.holderTeam === me.team) add('escort', 0.55 + p.teamwork * 0.2, lerp(ball.x, eg.x, 0.35), lerp(ball.y, eg.y, 0.35), null, 1.1);
      else {
        add('defend', 0.65 + p.teamwork * 0.15, lerp(og.x, ball.x, 0.5), lerp(og.y, ball.y, 0.5), null, 0.9);
        const holder = this.mem[ball.holderSlot];
        if (holder && holder.noticed) add('fight', 0.9, holder.x, holder.y, holder, 1.4);
      }
    } else if (P.mode === MODE.SHOWDOWN) {
      const cubes = P.pickups.filter((q) => q.pick === PICK.CUBE);
      if (cubes.length) {
        let c = cubes[0], cd = 1e9;
        for (const q of cubes) { const d = Math.hypot(q.x - me.x, q.y - me.y); if (d < cd) { cd = d; c = q; } }
        add('collect', 0.62 + p.greed * 0.3 - danger * 0.2, c.x, c.y, null, 0.8);
      }
      const box = this.nearestBox(P, 10);
      const td = target ? Math.hypot(target.x - me.x, target.y - me.y) : 99;
      if (box && td > kit.atkF.range + 1.5) add('box', 0.5 + p.greed * 0.25 - (target ? 0.12 : 0), box.x, box.y, null, 0.9);
    } else if (P.mode === MODE.BOUNTY) {
      if ((me.bounty || 0) >= 4) add('hold', 0.55 + (me.bounty || 0) * 0.05, lerp(hold.x, this.base(P).x, 0.4), lerp(hold.y, this.base(P).y, 0.4), null, 0.6);
      const star = P.pickups.find((q) => q.pick === PICK.STAR);
      if (star) add('collect', 0.6 + p.greed * 0.2, star.x, star.y, null, 1);
    } else if (P.mode === MODE.KNOCKOUT) {
      // no respawns: a little more careful
      if (target && myHPf < 0.55) add('retreat', 0.5 + (0.55 - myHPf), this.base(P).x, this.base(P).y, null, 0.3);
    }
  }

  nearestBox(P, maxD) {
    const m = P.map, me = P.me;
    let best = null, bd = maxD * maxD;
    const x0 = Math.max(0, Math.floor(me.x - maxD)), x1 = Math.min(m.w - 1, Math.ceil(me.x + maxD));
    const y0 = Math.max(0, Math.floor(me.y - maxD)), y1 = Math.min(m.h - 1, Math.ceil(me.y + maxD));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (m.tiles[y * m.w + x] !== TILE.BOX) continue;
      const d = dist2(x + 0.5, y + 0.5, me.x, me.y);
      if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
    }
    return best;
  }

  // ---- supers & gadgets: used at moments that look worth it ----
  decideAbilities(P, kit, target, danger, myHPf, near) {
    const I = this.intent, me = P.me, r = this.rng;
    I.wantSuper = false; I.wantGadget = false; I.superMode = 'target'; I.gadMode = 'target';
    const sup = kit.supF, gad = kit.gadF;
    // a charged super is noticed (and trusted) only after a while, like a person glancing at the button
    if (!me.supReady) this.supAt = -1;
    else if (this.supAt < 0) this.supAt = P.t + this.reaction() + r.range(0.3, 1) * this.p.supNotice;
    const td = target ? Math.hypot(target.x - me.x, target.y - me.y) : 99;
    if (me.supReady && P.t >= this.supAt) {
      if (sup.heal > 0 && (myHPf < 0.6 || P.allies.some((a) => a.alive && a.hp / a.maxHp < 0.5 && Math.hypot(a.x - me.x, a.y - me.y) < sup.range))) { I.wantSuper = true; I.superMode = 'self'; } else if (sup.t === 'leap' && sup.away) { if (myHPf < 0.45 && danger > 0.6) { I.wantSuper = true; I.superMode = 'away'; } } else if (sup.t === 'buff') { if ((sup.what === 'invis' || sup.what === 'speed') && target && td < 10 && myHPf > 0.4) { I.wantSuper = true; I.superMode = 'self'; } } else if (sup.t === 'deploy') { if (target && td < sup.range + 3) { I.wantSuper = true; I.superMode = 'target'; } } else if (target && td < sup.range * 0.95) {
        const enemiesNear = this.known(true).filter((m) => Math.hypot(m.x - target.x, m.y - target.y) < 2.5).length;
        if (target.hp / target.maxHp < 0.55 || enemiesNear >= 2 || r.chance(0.35)) { I.wantSuper = true; I.superMode = 'target'; }
      }
    }
    if (me.gadReady && gad.t !== 'none') {
      if (gad.t === 'heal' || (gad.t === 'pulse' && gad.heal > 0)) I.wantGadget = myHPf < 0.5;
      else if (gad.t === 'buff' && gad.what === 'ammo') I.wantGadget = me.ammo < 0.8 && target && td < kit.atkF.range;
      else if (gad.t === 'buff' && gad.what === 'shield') I.wantGadget = danger > 0.8 && myHPf < 0.7;
      else if (gad.t === 'buff') I.wantGadget = target && td < 8 && r.chance(0.5);
      else if (gad.t === 'dash') { I.wantGadget = (myHPf < 0.35 && danger > 0.5) || (target && target.hp / target.maxHp < 0.3 && td < 6); I.gadMode = myHPf < 0.35 ? 'away' : 'target'; } else if (gad.t === 'pulse') I.wantGadget = target && td < (gad.range || 2.5);
      else if (gad.t === 'deploy') I.wantGadget = target && td < 9;
      else I.wantGadget = target && td < (gad.range || 6) && r.chance(0.4);
      I.wantGadget = !!I.wantGadget;
    }
  }

  // Shooting into a bush where an enemy was last seen (people check bushes).
  decideBushShot(P, kit, target) {
    const I = this.intent, me = P.me;
    I.bushShot = null;
    if (target || me.ammo < 2.5) return;
    for (const k in this.mem) {
      const m = this.mem[k];
      if (m.seen || !m.noticed || !m.inBush) continue;
      const d = Math.hypot(m.x - me.x, m.y - me.y);
      if (d < kit.atkF.range * 0.95 && P.t - m.t < 3 && this.rng.chance(0.25 + this.p.aggr * 0.3)) { I.bushShot = { x: m.x, y: m.y }; return; }
    }
    for (const c of P.cues) {
      const d = Math.hypot(c.x - me.x, c.y - me.y);
      if (d < kit.atkF.range && this.rng.chance(0.3 * this.p.s)) { I.bushShot = { x: c.x, y: c.y }; return; }
    }
    // in Showdown, crack boxes when nothing else is going on
    if (P.mode === MODE.SHOWDOWN && I.goal === 'box') {
      const b = this.nearestBox(P, kit.atkF.range * 0.9);
      if (b) I.bushShot = b;
    }
  }

  // ---- quick chat ----
  pin(id, t) {
    this.pinQ.push({ at: t + this.rng.range(0.5, 1.5), id });
    this.pinCd = t + this.rng.range(4, 9);
  }
  sayFor(goal, P) {
    const t = P.t, p = this.p, r = this.rng;
    if (this.pinCd > t || !r.chance(p.teamwork * 0.35)) return;
    if (goal === 'retreat' && P.me.hp / P.me.maxHp < 0.3 && P.allies.some((a) => a.alive)) this.pin(2, t);
    else if (goal === 'push') this.pin(0, t);
    else if (goal === 'defend') this.pin(1, t);
    else if (goal === 'collect' && P.mode === MODE.GEM && r.chance(0.3)) this.pin(6, t);
  }
  flushPins(t) {
    if (this.pinQ.length && this.pinQ[0].at <= t) { this.outPin = this.pinQ.shift().id; }
  }
}
