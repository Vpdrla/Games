// ---------- One run: player, pickups, levels, chests, damage (pure simulation, no DOM) ----------
// Shared query buffers. The simulation is single-threaded; each call site uses its own buffer so
// nested queries (an explosion triggered by a hit) never clobber a list that is being walked.
const Q1 = new Array(4096), Q2 = new Array(4096), Q3 = new Array(4096), QS = new Array(4096), QB = new Array(4096);

class Run {
  constructor(cfg) {
    this.cfg = cfg;
    this.rng = new RNG(cfg.seed || 1);
    this.stageIdx = cfg.stage || 0;
    this.stage = STAGES[this.stageIdx];
    this.charKey = cfg.char || 'lumen';
    this.char = CHARACTERS[this.charKey];
    this.mode = cfg.mode || 'normal'; // normal | quick | daily
    this.endless = !!cfg.endless;
    this.mods = {};
    for (const m of cfg.mods || []) this.mods[m] = true;
    this.scale = this.mode === 'quick' ? 3 : 1; // night seconds per real second
    this.viewW = cfg.viewW || 420;
    this.viewH = cfg.viewH || 900;
    this.time = 0; // real seconds
    this.T = 0; // night seconds (drives the spawner and enemy scaling)
    this.stepN = 0;
    this.over = false;
    this.won = false;
    this.dawnT = 0;
    this.events = [];
    this.enemies = [];
    this.projs = [];
    this.eprojs = [];
    this.zones = [];
    this.drops = [];
    this.booms = [];
    this.alive = 0;
    this.grid = new Grid(1400);
    this.nextId = 1;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpNeed(1);
    this.pendingLevels = 0;
    this.kills = 0;
    this.byType = {};
    this.gold = 0;
    this.chestsOpened = 0;
    this.hearts = 0;
    this.minis = 0;
    this.bosses = 0;
    this.evolved = {};
    this.weapons = [];
    this.passives = [];
    this.banished = {};
    this.dmgBy = {};
    this.hurtBy = {};
    this.chests = [];
    this.power = cfg.power || {};
    this.unlocked = (cfg.weapons || BASE_WEAPONS.slice(0, 8)).slice();
    this.rerolls = this.power.reroll || 0;
    this.skips = this.power.skip || 0;
    this.banishes = this.power.banish || 0;
    this.revivals = this.power.revival || 0;
    this.gemCount = 0;
    this.bigGem = null;
    this.vacuum = 0;
    this.boss = null;
    this.hasZero = false;
    this.wind = { x: 0, y: 0 };
    this.dmgEvents = 0;
    this.player = { x: 0, y: 0, r: 11, hp: 100, fx: 1, dirX: 1, dirY: 0, mx: 0, my: 0, moving: false, hurtT: 0, inv: 0, slowT: 0, walk: 0 };
    this.stats = null;
    if (!this.unlocked.includes(this.char.weapon)) this.unlocked.push(this.char.weapon);
    this.recalc();
    this.player.hp = this.stats.maxHp;
    this.addWeapon(this.char.weapon);
    this.director = new Director(this);
  }

  // ----- stats -----
  passiveLvl(k) {
    for (const p of this.passives) if (p.key === k) return p.lvl;
    return 0;
  }

  recalc() {
    const P = this.power, ch = this.char.mods, pl = (k) => this.passiveLvl(k), M = this.mods;
    const s = {
      might: 1 + 0.05 * (P.might || 0) + 0.1 * pl('might'),
      cd: Math.max(0.35, 1 - 0.03 * (P.cd || 0) - 0.08 * pl('haste') + (ch.cd || 0)),
      area: 1 + 0.05 * (P.area || 0) + 0.1 * pl('area') + (ch.area || 0),
      dur: 1 + 0.06 * (P.dur || 0) + 0.12 * pl('duration'),
      amount: (P.amount || 0) + pl('multishot') + (ch.amount || 0),
      speed: 1 + 0.05 * (P.speed || 0) + 0.1 * pl('swiftness') + (ch.speed || 0),
      vel: 1 + 0.12 * pl('velocity'),
      maxHp: 100 * (1 + 0.1 * (P.maxHp || 0) + 0.2 * pl('vitality') + (ch.maxHp || 0)),
      regen: 0.1 * (P.regen || 0) + 0.25 * pl('regen'),
      armor: (P.armor || 0) + pl('armor') + (ch.armor || 0),
      magnet: 44 * (1 + 0.2 * (P.magnet || 0) + 0.35 * pl('magnet')),
      luck: 1 + 0.08 * (P.luck || 0) + 0.1 * pl('luck'),
      growth: 1 + 0.04 * (P.growth || 0),
      greed: (1 + 0.1 * (P.greed || 0)) * this.stage.gold,
    };
    if (M.glass) { s.might *= 1.6; s.maxHp *= 0.5; }
    if (M.lucky) s.luck += 0.5;
    if (M.swarm) s.growth *= 1.3;
    if (M.giant) s.growth *= 1.5;
    if (M.greedy) s.greed *= 2;
    if (M.quick) s.speed *= 1.25;
    if (this.mode === 'quick') { s.growth *= 2.4; s.greed *= 0.6; }
    s.maxHp = Math.round(s.maxHp);
    s.crit = 0.05 * s.luck;
    const p = this.player;
    if (this.stats) {
      const gain = s.maxHp - this.stats.maxHp;
      if (gain > 0) p.hp += gain;
    }
    p.hp = Math.min(p.hp, s.maxHp);
    this.stats = s;
    for (const w of this.weapons) w.st = this.weaponStats(w);
    this.hasZero = this.weapons.some((w) => w.key === 'zero');
  }

  weaponStats(w) {
    const d = WEAPONS[w.key], b = d.base, s = this.stats;
    let dmg = b.dmg, cd = 0, amount = b.amount, area = 0, speed = 0, dur = 0, pierce = b.pierce, chain = b.chain || 0;
    if (d.lv) {
      for (let i = 0; i < w.lvl - 1; i++) {
        const x = d.lv[i];
        dmg += x.dmg || 0; cd += x.cd || 0; amount += x.amount || 0; area += x.area || 0;
        speed += x.speed || 0; dur += x.dur || 0; pierce += x.pierce || 0; chain += x.chain || 0;
      }
    }
    return {
      dmg: dmg * s.might,
      cd: b.cd * (1 + cd) * s.cd,
      amount: b.amount > 0 ? amount + s.amount : 0,
      area: b.area * (1 + area) * s.area,
      speed: b.speed * (1 + speed) * s.vel,
      dur: b.dur * (1 + dur) * s.dur,
      pierce, chain,
      knock: b.knock,
      interval: b.interval || 0.5,
    };
  }

  // ----- inventory -----
  family(k) {
    for (const w of this.weapons) if (w.key === k || WEAPONS[w.key].evolved === k) return w;
    return null;
  }

  addWeapon(key) {
    const w = { key, lvl: 1, slot: this.weapons.length, t: 0.4, st: null, s: {} };
    this.weapons.push(w);
    w.st = this.weaponStats(w);
    this.events.push(['newWeapon', key]);
    return w;
  }

  addPassive(key) {
    this.passives.push({ key, lvl: 1 });
    this.recalc();
  }

  upgradable() {
    const out = [];
    for (const w of this.weapons) if (!WEAPONS[w.key].evolved && w.lvl < WEAPON_MAX) out.push({ kind: 'weapon', key: w.key, lvl: w.lvl + 1 });
    for (const p of this.passives) if (p.lvl < PASSIVES[p.key].max) out.push({ kind: 'passive', key: p.key, lvl: p.lvl + 1 });
    return out;
  }

  evolvable() {
    for (const w of this.weapons) {
      const d = WEAPONS[w.key];
      if (d.evo && w.lvl >= WEAPON_MAX && this.passiveLvl(d.pair) > 0) return w;
    }
    return null;
  }

  rollChoices() {
    const opts = [];
    for (const o of this.upgradable()) if (!this.banished[o.key]) { o.w = o.kind === 'weapon' ? 1.3 : 1.1; opts.push(o); }
    if (this.weapons.length < MAX_WEAPONS) {
      for (const k of this.unlocked) if (!this.family(k) && !this.banished[k]) opts.push({ kind: 'weapon', key: k, lvl: 1, isNew: true, w: 1 });
    }
    if (this.passives.length < MAX_PASSIVES) {
      for (const k of PASSIVE_KEYS) if (!this.passiveLvl(k) && !this.banished[k]) opts.push({ kind: 'passive', key: k, lvl: 1, isNew: true, w: 0.8 });
    }
    const n = this.rng.next() < Math.min(0.6, (this.stats.luck - 1) * 1.2) ? 4 : 3;
    const out = [];
    while (out.length < n && opts.length) {
      let tot = 0;
      for (const o of opts) tot += o.w;
      let r = this.rng.next() * tot, i = 0;
      for (; i < opts.length - 1; i++) { r -= opts[i].w; if (r <= 0) break; }
      out.push(opts[i]);
      opts.splice(i, 1);
    }
    if (!out.length) out.push({ kind: 'gold', v: 25 }, { kind: 'heal', v: 30 });
    return out;
  }

  applyChoice(c) {
    this.upgrade(c);
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
  }

  upgrade(c) {
    if (c.kind === 'weapon') {
      const w = this.family(c.key);
      if (w) { w.lvl = Math.min(WEAPON_MAX, w.lvl + 1); w.st = this.weaponStats(w); } else this.addWeapon(c.key);
    } else if (c.kind === 'passive') {
      const p = this.passives.find((x) => x.key === c.key);
      if (p) p.lvl = Math.min(PASSIVES[p.key].max, p.lvl + 1);
      else this.passives.push({ key: c.key, lvl: 1 });
      this.recalc();
    } else if (c.kind === 'gold') {
      this.gold += Math.round(c.v * this.stats.greed);
    } else if (c.kind === 'heal') {
      this.heal(c.v);
    }
  }

  skipLevel() {
    if (this.skips <= 0) return false;
    this.skips--;
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    return true;
  }

  evolve(w) {
    const from = w.key, to = WEAPONS[from].evo;
    w.key = to;
    w.lvl = WEAPON_MAX;
    w.s = {};
    w.t = 0.2;
    this.dmgBy[to] = this.dmgBy[from] || 0;
    this.evolved[to] = 1;
    this.recalc();
    this.events.push(['evolve', from, to]);
    return to;
  }

  // Chests evolve weapons when a recipe is ready, otherwise they upgrade random items.
  openChest(chest) {
    this.chestsOpened++;
    const L = this.stats.luck, r = this.rng.next();
    let n = chest.boss ? (r < 0.3 * L ? 5 : 3) : (r < 0.03 * L ? 5 : r < 0.13 * L ? 3 : 1);
    const items = [];
    for (let i = 0; i < n; i++) {
      const ew = this.evolvable();
      if (ew) {
        const from = ew.key;
        items.push({ kind: 'evolve', key: this.evolve(ew), from });
        continue;
      }
      const ups = this.upgradable();
      if (!ups.length) break;
      const c = ups[this.rng.int(0, ups.length - 1)];
      this.upgrade(c);
      items.push(c);
    }
    const gold = Math.round(this.rng.int(25, 60) * (chest.boss ? 3 : 1) * this.stats.greed);
    this.gold += gold;
    return { items, gold, boss: !!chest.boss };
  }

  // ----- player -----
  heal(v) {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(this.stats.maxHp, p.hp + v);
    if (p.hp - before >= 1) this.events.push(['heal', p.hp - before]);
  }

  hurt(dmg, src) {
    const p = this.player;
    if (p.inv > 0 || this.over || this.dawnT > 0) return;
    const d = Math.max(1, dmg - this.stats.armor);
    if (src) this.hurtBy[src] = (this.hurtBy[src] || 0) + d;
    p.hp -= d;
    p.hurtT = 0.22;
    p.inv = 0.06;
    this.events.push(['hurt', d]);
    if (p.hp <= 0) {
      if (this.revivals > 0) {
        this.revivals--;
        p.hp = this.stats.maxHp * 0.5;
        p.inv = 2;
        this.blast(p.x, p.y, 160, 9999, true);
        this.events.push(['revive']);
      } else {
        p.hp = 0;
        this.over = true;
        this.won = false;
        this.events.push(['death']);
      }
    }
  }

  setMove(x, y) {
    this.player.mx = x;
    this.player.my = y;
  }

  setView(w, h) {
    this.viewW = w;
    this.viewH = h;
  }

  updatePlayer(dt) {
    const p = this.player, s = this.stats;
    let spd = 105 * s.speed;
    if (p.slowT > 0) { spd *= 0.6; p.slowT -= dt; }
    p.x += (p.mx * spd + this.wind.x) * dt;
    p.y += (p.my * spd + this.wind.y) * dt;
    const l = Math.hypot(p.mx, p.my);
    p.moving = l > 0.1;
    if (p.moving) {
      p.dirX = p.mx / l;
      p.dirY = p.my / l;
      if (Math.abs(p.mx) > 0.15) p.fx = p.mx > 0 ? 1 : -1;
      p.walk += dt * (4 + 6 * l);
    }
    if (s.regen > 0 && p.hp < s.maxHp) p.hp = Math.min(s.maxHp, p.hp + s.regen * dt);
    if (p.inv > 0) p.inv -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (this.vacuum > 0) this.vacuum -= dt;
  }

  // ----- XP, drops and pickups -----
  gainXp(v) {
    this.xp += v * this.stats.growth;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpNeed(this.level);
      this.pendingLevels++;
      this.events.push(['level', this.level]);
    }
  }

  drop(k, x, y, v) {
    const d = { k, x, y, v: v || 0, mag: false, sp: 0, t: 0, dead: false };
    this.drops.push(d);
    return d;
  }

  dropGem(x, y, v) {
    if (this.gemCount >= 300) {
      if (!this.bigGem || this.bigGem.dead) {
        this.bigGem = this.drop('gem', x, y, 0);
        this.bigGem.big = true;
        this.gemCount++;
      }
      this.bigGem.v += v;
      return;
    }
    this.gemCount++;
    this.drop('gem', x + this.rng.range(-3, 3), y + this.rng.range(-3, 3), v);
  }

  collect(d) {
    d.dead = true;
    switch (d.k) {
      case 'gem':
        this.gemCount--;
        this.gainXp(d.v);
        this.events.push(['gem', d.v]);
        break;
      case 'heart':
        this.hearts++;
        this.heal(30);
        break;
      case 'coin':
      case 'bag': {
        const g = Math.max(1, Math.round(d.v * this.stats.greed));
        this.gold += g;
        this.events.push(['coin', g]);
        break;
      }
      case 'magnet':
        this.vacuum = 3;
        this.events.push(['magnet']);
        break;
      case 'bomb':
        this.blast(this.player.x, this.player.y, Math.max(this.viewW, this.viewH) * 0.75, 9999, false);
        this.events.push(['bomb', this.player.x, this.player.y]);
        break;
      case 'chest':
        this.chests.push(d);
        this.events.push(['chest']);
        break;
    }
  }

  updateDrops(dt) {
    const p = this.player, mr = this.stats.magnet, mr2 = mr * mr, vac = this.vacuum > 0;
    for (const d of this.drops) {
      if (d.dead) continue;
      d.t += dt;
      const dx = p.x - d.x, dy = p.y - d.y, d2 = dx * dx + dy * dy;
      if (d.k === 'chest') {
        if (d2 < (p.r + 16) * (p.r + 16)) this.collect(d);
        continue;
      }
      if (!d.mag && (d2 < mr2 || (vac && d.k === 'gem'))) {
        d.mag = true;
        d.sp = -70;
      }
      if (d.mag) {
        d.sp = Math.min(900, d.sp + 1300 * dt);
        const dist = Math.sqrt(d2) || 1;
        const mv = Math.min(dist, d.sp * dt);
        d.x += (dx / dist) * mv;
        d.y += (dy / dist) * mv;
        if (dist < p.r + 6) this.collect(d);
      } else if (d.k !== 'gem' && d.t > 60) {
        d.dead = true; // stray items fade after a minute; gems stay
      }
    }
  }

  // ----- combat helpers -----
  onScreen(e, margin) {
    const p = this.player, m = margin || 0;
    return Math.abs(e.x - p.x) < this.viewW / 2 + m && Math.abs(e.y - p.y) < this.viewH / 2 + m;
  }

  isTarget(e) { return !e.dead && !e.prop && e.spawnT <= 0; }

  // Up to n distinct targets sorted by distance (repeats the list if there are fewer).
  nearestList(x, y, maxR, n, out) {
    let r = 140, cnt = 0;
    out.length = 0;
    while (true) {
      cnt = this.grid.query(x, y, r, Q2);
      const r2 = r * r;
      for (let i = 0; i < cnt; i++) {
        const e = Q2[i];
        if (!this.isTarget(e)) continue;
        const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        e._d = d2;
        out.push(e);
      }
      if (out.length >= n || r >= maxR) break;
      out.length = 0;
      r = Math.min(maxR, r * 2);
    }
    out.sort((a, b) => a._d - b._d);
    if (out.length > n) out.length = n;
    return out;
  }

  nearest(x, y, maxR) {
    const l = this.nearestList(x, y, maxR, 1, NEAR_TMP);
    return l.length ? l[0] : null;
  }

  randomOnScreen() {
    const es = this.enemies, n = es.length;
    if (!n) return null;
    for (let tries = 0; tries < 24; tries++) {
      const e = es[this.rng.int(0, n - 1)];
      if (this.isTarget(e) && this.onScreen(e, -10)) return e;
    }
    return null;
  }

  hit(e, dmg, w, kx, ky, knock) {
    if (e.dead) return;
    if (e.prop) { this.kill(e); return; }
    let crit = false;
    if (this.rng.next() < this.stats.crit) { dmg *= 2; crit = true; }
    if (e.shield && kx * e.fx < -0.3) dmg *= 0.35;
    if (e.frozen > 0 && this.hasZero) dmg *= 1.5;
    e.hp -= dmg;
    e.flash = 0.12;
    if (w) this.dmgBy[w.key] = (this.dmgBy[w.key] || 0) + dmg;
    if (knock && !e.boss) {
      const k = knock * 55 * e.kres;
      e.kx += kx * k;
      e.ky += ky * k;
    }
    if (this.dmgEvents < 30) {
      this.dmgEvents++;
      this.events.push(['dmg', e.x, e.y - e.r, dmg, crit]);
    }
    if (e.hp <= 0) this.kill(e);
  }

  // Damage every enemy touching a circle. interval > 0 limits repeat hits per weapon slot.
  areaHit(x, y, r, dmg, w, interval, knock, buf, onEach) {
    const n = this.grid.query(x, y, r + 30, buf);
    const slot = w ? w.slot : 6;
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const e = buf[i];
      if (e.dead || e.spawnT > 0) continue;
      const dx = e.x - x, dy = e.y - y, rr = r + e.r, d2 = dx * dx + dy * dy;
      if (d2 > rr * rr) continue;
      if (interval > 0) {
        if (e.hc[slot] > this.time) continue;
        e.hc[slot] = this.time + interval;
      }
      const d = Math.sqrt(d2) || 1;
      if (onEach) onEach(e);
      this.hit(e, dmg, w, dx / d, dy / d, knock);
      hits++;
    }
    return hits;
  }

  // Holy bomb / revive blast: kills ordinary enemies, chunks bosses.
  blast(x, y, r, dmg, quiet) {
    const n = this.grid.query(x, y, r, QB);
    for (let i = 0; i < n; i++) {
      const e = QB[i];
      if (e.dead || e.prop) continue;
      if (Math.abs(e.x - x) > r || Math.abs(e.y - y) > r) continue;
      if (e.boss) this.hit(e, e.maxHp * 0.04, null, 0, 0, 0);
      else this.hit(e, dmg, null, 0, 0, 0);
    }
    if (!quiet) this.events.push(['flash']);
  }

  kill(e) {
    if (e.dead) return;
    e.dead = true;
    if (e.prop) {
      this.propDrop(e);
      this.events.push(['prop', e.x, e.y]);
      return;
    }
    this.events.push(['kill', e.x, e.y, e.type, e.boss ? 2 : e.elite ? 1 : 0, e.r]);
    if (e.noReward) return;
    this.kills++;
    this.byType[e.type] = (this.byType[e.type] || 0) + 1;
    if (e.boss) { this.onBossDead(e); return; }
    const def = e.def;
    this.dropGem(e.x, e.y, e.elite ? def.xp * 12 + 10 : def.xp);
    if (e.elite) this.drop('chest', e.x, e.y);
    const L = this.stats.luck, r = this.rng.next();
    if (r < 0.0035 * L) this.drop('heart', e.x + 6, e.y);
    else if (r < 0.0235 * L) this.drop('coin', e.x + 6, e.y, this.rng.int(1, 2));
    else if (r < 0.026 * L) this.drop('bag', e.x + 6, e.y, 20);
    else if (r < 0.027 * L) this.drop('magnet', e.x + 6, e.y);
    onEnemyDeath(this, e);
  }

  propDrop(e) {
    const k = this.rng.weighted([['coin', 30], ['heart', 26], ['magnet', 14], ['bomb', 10], ['bag', 12], ['chest', 3]]);
    this.drop(k, e.x, e.y, k === 'coin' ? 5 : k === 'bag' ? 25 : 0);
  }

  onBossDead(e) {
    if (this.boss === e) this.boss = null;
    const ch = this.drop('chest', e.x, e.y);
    ch.boss = true;
    this.dropGem(e.x, e.y + 14, 60);
    if (e.final) {
      this.bosses++;
      if (!this.endless) {
        this.dawnT = 3.5;
        for (const o of this.enemies) if (!o.dead && !o.prop) { o.noReward = true; this.kill(o); }
        this.eprojs.length = 0;
        this.events.push(['dawn']);
        return;
      }
    } else this.minis++;
    this.events.push(['bossDown', e.bossKey, !!e.final]);
  }

  // ----- the main step -----
  step() {
    if (this.over) return;
    const dt = SIM_DT;
    this.stepN++;
    this.time += dt;
    if (this.dawnT <= 0) this.T += dt * this.scale;
    this.dmgEvents = 0;
    const g = this.grid;
    g.clear();
    for (const e of this.enemies) g.insert(e);
    this.updatePlayer(dt);
    if (this.dawnT <= 0) this.director.update(dt);
    for (const e of this.enemies) if (!e.dead) updateEnemy(this, e, dt);
    this.separate();
    this.contact();
    for (const w of this.weapons) updateWeapon(this, w, dt);
    this.updateProjs(dt);
    this.updateZones(dt);
    this.updateEProjs(dt);
    this.updateDrops(dt);
    processBooms(this);
    compact(this.enemies);
    compact(this.projs);
    compact(this.eprojs);
    compact(this.zones);
    compact(this.drops);
    if (this.dawnT > 0) {
      this.dawnT -= dt;
      this.player.hp = Math.min(this.stats.maxHp, this.player.hp + 20 * dt);
      if (this.dawnT <= 0) {
        // collect everything left on the field before the sun is up
        for (const d of this.drops) if (!d.dead) this.collect(d);
        for (const c of this.chests) this.openChest(c);
        this.chests.length = 0;
        this.over = true;
        this.won = true;
        this.events.push(['win']);
      }
    }
  }

  separate() {
    const es = this.enemies, g = this.grid, p = this.player;
    for (const a of es) {
      if (a.dead || a.prop) continue;
      // keep out of the player's body (the player is never blocked)
      const px = a.x - p.x, py = a.y - p.y, pr = a.r + p.r - 4, pd2 = px * px + py * py;
      if (pd2 < pr * pr && pd2 > 0.01) {
        const pd = Math.sqrt(pd2), push = (pr - pd) * 0.5;
        a.x += (px / pd) * push;
        a.y += (py / pd) * push;
      }
      if (a.ghost) continue;
      const n = g.query(a.x, a.y, a.r + 26, QS);
      for (let i = 0; i < n; i++) {
        const b = QS[i];
        if (b === a || b.dead || b.ghost || b.prop) continue;
        let dx = a.x - b.x, dy = a.y - b.y;
        const rr = a.r + b.r;
        let d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        if (d2 < 0.0001) { dx = (a.id % 7) - 3 + 0.5; dy = (a.id % 5) - 2 + 0.5; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2), over = rr - d;
        if (a.boss) {
          if (!b.boss) { b.x -= (dx / d) * over * 0.6; b.y -= (dy / d) * over * 0.6; }
          continue;
        }
        if (b.boss) continue;
        const wa = b.mass / (a.mass + b.mass);
        a.x += (dx / d) * over * 0.5 * wa;
        a.y += (dy / d) * over * 0.5 * wa;
      }
    }
  }

  contact() {
    const p = this.player;
    const n = this.grid.query(p.x, p.y, 70, Q3);
    for (let i = 0; i < n; i++) {
      const e = Q3[i];
      if (e.dead || e.prop || e.tcd > 0 || e.spawnT > 0) continue;
      const dx = e.x - p.x, dy = e.y - p.y, rr = e.r + p.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      e.tcd = e.ai === 'sweep' ? 99 : 0.5; // a passing swarm only bites once
      this.hurt(e.dmg, e.boss ? 'boss' : e.type);
    }
  }

  updateProjs(dt) {
    const g = this.grid;
    for (const p of this.projs) {
      if (p.dead) continue;
      p.t += dt;
      if (p.fn) p.fn(this, p, dt);
      else { p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.dead) continue;
      if (p.t >= p.life) {
        p.dead = true;
        if (p.onEnd) p.onEnd(this, p);
        continue;
      }
      if (p.noHit) continue;
      const n = g.query(p.x, p.y, p.r + 30, Q1);
      for (let i = 0; i < n; i++) {
        const e = Q1[i];
        if (e.dead || e.spawnT > 0) continue;
        const dx = e.x - p.x, dy = e.y - p.y, rr = p.r + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        if (p.hm) {
          const last = p.hm.get(e.id);
          if (last !== undefined && this.time < last) continue;
          p.hm.set(e.id, this.time + p.rehit);
        } else {
          if (p.hits.indexOf(e.id) >= 0) continue;
          p.hits.push(e.id);
        }
        const sp = Math.hypot(p.vx, p.vy) || 1;
        if (p.onHit) p.onHit(this, p, e);
        else this.hit(e, p.dmg, p.w, p.vx / sp, p.vy / sp, p.knock);
        if (--p.pierce <= 0) {
          p.dead = true;
          if (p.onEnd) p.onEnd(this, p);
          break;
        }
      }
    }
  }

  updateZones(dt) {
    for (const z of this.zones) {
      if (z.dead) continue;
      z.t += dt;
      if (z.fn) z.fn(this, z, dt);
      if (z.t >= z.life) {
        z.dead = true;
        if (z.onEnd) z.onEnd(this, z);
      }
    }
  }

  updateEProjs(dt) {
    const p = this.player;
    for (const b of this.eprojs) {
      if (b.dead) continue;
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.t >= b.life) { b.dead = true; continue; }
      const dx = b.x - p.x, dy = b.y - p.y, rr = b.r + p.r - 2;
      if (dx * dx + dy * dy < rr * rr) {
        b.dead = true;
        this.hurt(b.dmg, b.k);
        if (b.slow) p.slowT = 1.2;
      }
    }
  }

  // Live numbers used by achievements while a run is in progress.
  summary() {
    return {
      time: this.time, level: this.level, kills: this.kills, byType: this.byType, minis: this.minis, bosses: this.bosses,
      evolved: this.evolved, chests: this.chestsOpened, weapons: this.weapons.length, gold: this.gold, won: this.won,
      stage: this.stage.key, char: this.charKey, endless: this.endless, hearts: this.hearts, mode: this.mode,
    };
  }
}

const NEAR_TMP = [];

function compact(arr) {
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (!o.dead) arr[n++] = o;
  }
  arr.length = n;
}
