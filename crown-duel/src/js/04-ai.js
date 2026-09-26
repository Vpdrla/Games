// ---------- AI opponent ----------
// Controls one side of a Sim. It reasons in "local" coordinates where its own half is the bottom (y > 16).
const AI_TAGS = {
  knight: ['tank', 'melee'], archers: ['ranged', 'air'], goblins: ['swarm', 'dps'], skeletons: ['swarm', 'cycle'],
  giant: ['win', 'tank', 'slow'], musketeer: ['ranged', 'air', 'dps'], arrows: ['spell'], fireball: ['spell'],
  speargobs: ['ranged', 'air', 'swarm'], bomber: ['splash', 'ranged'], drakeling: ['air', 'splash', 'flying'], horde: ['swarm', 'dps'],
  imps: ['air', 'flying', 'swarm'], tombstone: ['building'], necro: ['splash', 'air', 'ranged'], maiden: ['splash', 'melee', 'tank'],
  barbarians: ['melee', 'dps', 'tank'], cannon: ['building'], berserker: ['dps', 'melee'], lancer: ['dps', 'melee', 'tank'],
  sprite: ['cycle', 'splash', 'air'], zap: ['spell'], freeze: ['spell'], frostmage: ['ranged', 'air', 'splash'],
  boar: ['win', 'fast'], inferno: ['building', 'air', 'dps'], balloon: ['win', 'flying'], poison: ['spell'],
  firemage: ['ranged', 'air', 'splash'], juggernaut: ['tank', 'dps', 'melee', 'slow'], golem: ['win', 'tank', 'slow'], pump: ['pump'],
  stormmage: ['ranged', 'air'], tunneler: ['win', 'anywhere'], log: ['spell'],
};
const hasTag = (k, t) => (AI_TAGS[k] || []).includes(t);

// Rough elixir worth of a single unit, used to judge threats and spell value.
const UNIT_VALUE = {
  knight: 3, archer: 1.5, goblin: 0.67, speargob: 0.67, skeleton: 0.33, bomber: 2, barbarian: 1.25, imp: 1, sprite: 1,
  giant: 5, musketeer: 4, maiden: 4, boar: 4, berserker: 4, firemage: 5, drakeling: 4, lancer: 5, balloon: 5, necro: 5,
  juggernaut: 7, golem: 8, golemite: 2, stormmage: 4, tunneler: 3, frostmage: 3, cannon: 3, inferno: 5, tombstone: 3, pump: 6,
};

const AI_NAMES = ['Sir Clank', 'Goblin Boss', 'Lady Ember', 'Count Bones', 'Grumble', 'Duke Frost', 'Madame Vex', 'Old Tusk',
  'Captain Hook-Hand', 'The Baron', 'Princess Pip', 'Mossbeard', 'Iron Nell', 'Sparky Sam', 'Lord Crumble', 'Queen Thorn'];

function buildAIDeck(arena, rng) {
  const pool = cardsForArena(arena);
  const deck = [];
  const add = (f) => {
    const c = rng.shuffle(pool.filter((k) => !deck.includes(k) && f(k)));
    if (c.length) deck.push(c[0]);
  };
  add((k) => hasTag(k, 'win') && k !== 'tunneler');
  add((k) => k === 'fireball' || k === 'poison');
  add((k) => k === 'arrows' || k === 'zap' || k === 'log');
  add((k) => hasTag(k, 'ranged') && hasTag(k, 'air'));
  add((k) => hasTag(k, 'air') && CARDS[k].type !== 'spell');
  add((k) => hasTag(k, 'splash') && CARDS[k].type !== 'spell');
  add((k) => hasTag(k, 'dps') || hasTag(k, 'swarm'));
  while (deck.length < 8) add((k) => CARDS[k].type !== 'spell' && k !== 'pump' && (rng.chance(0.4) || !hasTag(k, 'win')));
  return deck.slice(0, 8);
}

class AIPlayer {
  constructor(sim, team, skill, seed) {
    this.sim = sim;
    this.team = team;
    this.skill = clamp(skill, 0, 1);
    this.rng = new RNG(seed || 99);
    this.think = 1.5 + this.rng.next();
    this.pushLane = this.rng.int(0, 1);
    this.lastPlay = 0;
    const k = this.skill;
    this.cfg = {
      think: lerp(1.4, 0.35, k), defendAt: 1.8, pushAt: lerp(9.9, 8.3, k), supportAt: lerp(6, 3.5, k),
      spellNeed: lerp(2.2, 1.15, k), sloppy: (1 - k) * 0.45,
    };
  }

  ly(y) { return this.team === 0 ? y : AH - y; }

  update(dt) {
    const s = this.sim;
    if (s.over) return;
    this.think -= dt;
    if (this.think > 0) return;
    this.think = this.cfg.think * this.rng.range(0.75, 1.25);
    this.decide();
  }

  decide() {
    const s = this.sim, p = s.p[this.team];
    const lanes = this.threats();
    // 1) defend the lane under the biggest threat
    const order = lanes.slice().sort((a, b) => b.danger - a.danger);
    const defendAt = this.cfg.defendAt;
    for (const g of order) {
      if (g.danger < defendAt) continue;
      if (this.trySpell(g)) return;
      if (this.tryDefend(g)) return;
    }
    // 2) spell anything juicy anywhere
    if (this.trySpell(null)) return;
    // 3) support a push already rolling
    if (this.trySupport()) return;
    // 4) start a push when rich enough (or about to waste elixir)
    const pushAt = this.cfg.pushAt;
    if (p.elixir >= pushAt && order[0].danger < defendAt) {
      if (this.tryPush()) return;
    }
    if (p.elixir >= 9.8) this.dump();
  }

  threats() {
    const s = this.sim;
    const lanes = [0, 1].map((lane) => ({ lane, units: [], danger: 0, value: 0, air: 0, ground: 0, small: 0, tank: 0, bld: 0, front: 0, fx: lane ? 14.5 : 3.5, frontUnit: null }));
    for (const e of s.ents) {
      if (e.dead || e.team === this.team || e.kind !== 'troop' || e.untarget) continue;
      const ly = this.ly(e.y);
      if (ly < 11) continue;
      const g = lanes[e.x < 9 ? 0 : 1];
      const v = (UNIT_VALUE[e.u] || 2) * (e.hp / e.maxHp);
      g.units.push(e);
      g.value += v;
      g.danger += v * (ly > RIVER_BOT ? 1.3 : 0.8);
      if (e.air) g.air++; else g.ground++;
      if (e.maxHp < 320) g.small++;
      if (e.hp > 1400) g.tank++;
      if (e.st.targets === 'buildings') g.bld++;
      if (ly > g.front) { g.front = ly; g.frontUnit = e; g.fx = e.x; }
    }
    return lanes;
  }

  handOptions(filter) {
    const p = this.sim.p[this.team];
    const out = [];
    p.hand.forEach((k, i) => {
      if (k && CARDS[k].cost <= p.elixir && filter(k)) out.push({ k, i });
    });
    return out;
  }

  // Play a card at local coordinates, nudging the spot until it is legal.
  playAt(slot, lx, ly) {
    const s = this.sim;
    const key = s.p[this.team].hand[slot];
    const tries = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [0, 2], [2, 0], [-2, 0], [0, -2], [1.5, 2], [-1.5, 2]];
    for (const [ox, oy] of tries) {
      const x = clamp(lx + ox, 0.5, AW - 0.5), y = clamp(ly + oy, 0.5, AH - 0.5);
      const wy = this.team === 0 ? y : AH - y;
      if (!s.canPlace(this.team, key, s.snap(x), s.snap(wy))) continue;
      if (s.play(this.team, slot, x, wy) === 'ok') { this.lastPlay = s.t; return true; }
    }
    return false;
  }

  sloppy() { return this.rng.chance(this.cfg.sloppy); }

  tryDefend(g) {
    const opts = this.handOptions((k) => CARDS[k].type !== 'spell' && k !== 'pump');
    if (!opts.length) return false;
    let best = null, bs = -Infinity;
    for (const o of opts) {
      const sc = this.sloppy() ? this.rng.range(-2, 2) : this.scoreDefender(o.k, g) + this.rng.range(-0.6, 0.6);
      if (sc > bs) { bs = sc; best = o; }
    }
    if (!best || bs < -3) return false;
    const [lx, ly] = this.defendSpot(best.k, g);
    return this.playAt(best.i, lx, ly);
  }

  scoreDefender(k, g) {
    const c = CARDS[k], u = UNITS[c.unit];
    let s = 0;
    const hitsAir = u.targets === 'any';
    if (g.air > 0) s += hitsAir ? 2 + g.air * 0.6 : g.ground > 0 ? -2 : -9;
    if (u.targets === 'buildings') s -= 5;
    if (g.small >= 3 && hasTag(k, 'splash')) s += 4;
    if (g.small >= 3 && hasTag(k, 'swarm')) s -= 1.5;
    if (g.tank && hasTag(k, 'dps')) s += 3.5;
    if (g.tank && hasTag(k, 'swarm') && g.small < 3) s += 2.5;
    if (g.bld && c.type === 'building') s += 4;
    if (g.bld && hasTag(k, 'dps')) s += 1.5;
    if (hasTag(k, 'tank') && !g.tank) s += 1;
    if (hasTag(k, 'ranged')) s += 0.5;
    s -= Math.max(0, c.cost - g.value - 1) * 0.8;
    return s;
  }

  defendSpot(k, g) {
    const c = CARDS[k], u = UNITS[c.unit];
    const lx = g.lane === 0 ? 3.5 : 14.5;
    const fx = g.fx, fy = g.front;
    if (this.cfg.oldPlace) {
      if (c.type === 'building') return [g.lane === 0 ? 7.5 : 10.5, 21];
      if (u.range >= 3) return [lx + (g.lane === 0 ? 2 : -2), clamp(fy + 5, 22.5, 29)];
      if (hasTag(k, 'swarm') && g.tank && fy > RIVER_BOT) return [fx, clamp(fy + 0.5, 18, 30)];
      if (fy < RIVER_BOT + 0.5) return [clamp(fx, 1, 17), 19];
      return [clamp(fx, 1, 17), clamp(fy + 2, 18, 30)];
    }
    // buildings in the middle pull attackers into range of both towers
    if (c.type === 'building') return [g.bld ? 9 : g.lane === 0 ? 7 : 11, 21.5];
    // ranged units stay behind the tower, out of reach
    if (u.range >= 3) return [lx + (g.lane === 0 ? 2.5 : -2.5), clamp(fy + 6, 24, 29.5)];
    // swarms go right onto big tanks
    if (hasTag(k, 'swarm') && g.tank && fy > RIVER_BOT) return [fx, clamp(fy + 0.5, 18, 30)];
    // melee: meet the attacker inside our tower's range, pulled toward the middle
    const mx = clamp(fx + (g.lane === 0 ? 1.5 : -1.5), 1, 17);
    if (fy < RIVER_BOT + 1) return [mx, 21.5];
    return [mx, clamp(fy + 2, 19, 30)];
  }

  trySpell(g) {
    const s = this.sim;
    const opts = this.handOptions((k) => CARDS[k].type === 'spell');
    let best = null, bv = 0;
    for (const o of opts) {
      const sp = spellStats(o.k, s.lvl(this.team, o.k));
      const need = o.k === 'freeze' ? 5 : sp.cost * this.cfg.spellNeed;
      for (const e of s.ents) {
        if (e.dead || e.team === this.team || (e.kind !== 'troop' && e.kind !== 'building' && e.kind !== 'tower') || e.untarget) continue;
        if (g && e.kind === 'tower') continue;
        if (g && !g.units.includes(e)) continue;
        let x = e.x, y = e.y;
        if (sp.spell === 'fireball' && e.moving) {
          const k = s.towers[this.team][2];
          const tt = Math.hypot(k.x - x, k.y - y) / 10;
          x += e.fx * e.st.speed * tt;
          y += e.fy * e.st.speed * tt;
        }
        const v = this.spellValue(sp, x, y);
        if (v > need && v - need > bv) { bv = v - need; best = { o, x, y, sp }; }
      }
    }
    if (!best) return false;
    const wy = best.y;
    const lx = best.x, lyv = this.team === 0 ? wy : AH - wy;
    if (best.sp.spell === 'log') return this.playAt(best.o.i, lx, lyv + 1.5);
    return this.playAt(best.o.i, lx, lyv);
  }

  spellValue(sp, x, y) {
    const s = this.sim;
    let v = 0, mine = 0;
    const total = sp.spell === 'arrows' ? sp.dmg * sp.waves : sp.spell === 'poison' ? sp.dmg * sp.dur * 0.6 : sp.dmg;
    for (const e of s.ents) {
      if (e.dead || e.untarget) continue;
      if (e.kind !== 'troop' && e.kind !== 'building' && e.kind !== 'tower') continue;
      let inside;
      if (sp.spell === 'log') {
        const dir = this.team === 0 ? -1 : 1;
        const along = (e.y - y) * dir;
        inside = !e.air && Math.abs(e.x - x) <= sp.halfW && along > -0.5 && along < sp.travel;
      } else inside = Math.hypot(e.x - x, e.y - y) - e.r <= sp.radius;
      if (!inside) continue;
      if (e.team === this.team) { if (e.kind === 'troop' && e.attacking) mine++; continue; }
      if (e.kind === 'tower') {
        const d = total * sp.towerMult;
        v += (d / e.maxHp) * 6 + (d >= e.hp ? 12 : 0);
        continue;
      }
      const val = UNIT_VALUE[e.u] || 2;
      if (sp.spell === 'freeze') { v += val * 0.5; continue; }
      const frac = Math.min(total, e.hp) / e.maxHp;
      v += frac * val * (e.hp / e.maxHp) + (total >= e.hp ? val * 0.35 : 0);
      if (sp.spell === 'zap' && (e.st.beam || e.charging)) v += 2;
    }
    if (sp.spell === 'freeze') v += mine >= 2 ? mine * 1.2 : -3;
    return v;
  }

  // Back up troops that are already pushing across the river.
  trySupport() {
    const s = this.sim, p = s.p[this.team];
    if (p.elixir < this.cfg.supportAt) return false;
    let tank = null;
    for (const e of s.ents) {
      if (e.dead || e.team !== this.team || e.kind !== 'troop') continue;
      const ly = this.ly(e.y);
      if (ly > 13 && ly < 25 && e.maxHp >= 1000 && e.moving && (!tank || e.maxHp > tank.maxHp)) tank = e;
    }
    if (!tank) return false;
    const recent = s.ents.some((e) => !e.dead && e.team === this.team && e.kind === 'troop' && e !== tank && Math.hypot(e.x - tank.x, e.y - tank.y) < 3.5 && e.maxHp < 1000);
    if (recent && this.rng.chance(0.6)) return false;
    const opts = this.handOptions((k) => CARDS[k].type === 'troop' && (hasTag(k, 'ranged') || hasTag(k, 'splash') || hasTag(k, 'dps')) && !hasTag(k, 'win'));
    if (!opts.length) return false;
    const o = this.rng.pick(opts);
    const ly = this.ly(tank.y);
    return this.playAt(o.i, tank.x, Math.max(RIVER_BOT + 0.5, ly + 2.5));
  }

  tryPush() {
    const s = this.sim, p = s.p[this.team];
    const enemy = s.towers[1 - this.team];
    let lane = this.pushLane;
    if (enemy[0].dead !== enemy[1].dead) lane = enemy[0].dead ? 0 : 1;
    else if (!enemy[0].dead && Math.abs(enemy[0].hp - enemy[1].hp) > 300) lane = enemy[0].hp < enemy[1].hp ? 0 : 1;
    if (this.rng.chance(0.15)) this.pushLane = 1 - this.pushLane;
    const lx = lane === 0 ? 3.5 : 14.5;
    let opts = this.handOptions((k) => hasTag(k, 'win'));
    if (!opts.length) opts = this.handOptions((k) => hasTag(k, 'tank') || k === 'pump');
    if (!opts.length) {
      if (p.elixir < 9.5) return false;
      opts = this.handOptions((k) => CARDS[k].type === 'troop');
    }
    if (!opts.length) return false;
    const o = this.rng.pick(opts);
    const k = o.k;
    if (k === 'pump') return this.playAt(o.i, lane === 0 ? 6.5 : 11.5, 29.5);
    if (k === 'tunneler') {
      const t = enemy[lane].dead ? enemy[2] : enemy[lane];
      return this.playAt(o.i, t.x, this.ly(t.y) + (enemy[lane].dead ? 2.8 : 2.2));
    }
    if (hasTag(k, 'slow') && p.elixir >= 9) return this.playAt(o.i, lane === 0 ? 6 : 12, 30);
    return this.playAt(o.i, lx, 18);
  }

  dump() {
    const opts = this.handOptions((k) => CARDS[k].type === 'troop' && k !== 'tunneler');
    if (!opts.length) return false;
    opts.sort((a, b) => CARDS[a.k].cost - CARDS[b.k].cost);
    const o = opts[0];
    const lane = this.rng.int(0, 1);
    return this.playAt(o.i, lane === 0 ? 3.5 : 14.5, this.rng.chance(0.5) ? 28.5 : 18.5);
  }
}
