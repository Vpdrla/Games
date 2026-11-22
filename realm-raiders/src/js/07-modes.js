// ---------- Modes: Adventure runs, the endless Abyss, and the hero Arena ----------

function makeRoom(rng, pal, type, W, H, realm) {
  const room = { w: W, h: H, obst: [], pal, type, deco: [], seed: rng.int(1, 1e9), realm };
  const n = type === 'boss' ? rng.int(2, 4) : type === 'calm' ? rng.int(2, 3) : rng.int(4, 8);
  const keepOut = [{ x: W / 2, y: H - 150, r: 220 }, { x: W / 2, y: 150, r: 190 }];
  if (type === 'boss') keepOut.push({ x: W / 2, y: H / 2, r: 330 });
  for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
    const r = rng.range(26, 46);
    const x = rng.range(150, W - 150), y = rng.range(150, H - 160);
    if (keepOut.some((k) => dist(k.x, k.y, x, y) < k.r + r)) continue;
    if (room.obst.some((o) => dist(o.x, o.y, x, y) < o.r + r + 110)) continue;
    room.obst.push({ x, y, r, k: rng.int(0, 3) });
    i++;
  }
  for (let i = 0; i < 46; i++) room.deco.push({ x: rng.range(40, W - 40), y: rng.range(40, H - 40), k: rng.int(0, 5), s: rng.range(0.6, 1.4) });
  return room;
}

function makeArenaRoom(rng) {
  const W = ARENA_W, H = ARENA_H;
  const room = { w: W, h: H, obst: [], pal: ARENA_PAL, type: 'arena', deco: [], seed: rng.int(1, 1e9) };
  const half = [[W * 0.3, H * 0.28, 40], [W * 0.3, H * 0.72, 40], [W * 0.42, H * 0.5, 30], [W * 0.2, H * 0.5, 34]];
  for (const [x, y, r] of half) { room.obst.push({ x, y, r, k: 0 }); room.obst.push({ x: W - x, y, r, k: 0 }); }
  room.obst.push({ x: W / 2, y: H * 0.2, r: 34, k: 1 }, { x: W / 2, y: H * 0.8, r: 34, k: 1 });
  for (let i = 0; i < 40; i++) room.deco.push({ x: rng.range(40, W - 40), y: rng.range(40, H - 40), k: rng.int(0, 5), s: rng.range(0.6, 1.4) });
  return room;
}

function rollBlessings(rng, u, n, luck) {
  const wts = BLESS_WEIGHT.map((x, i) => x * (i > 0 ? 1 + luck * 0.2 * i : 1));
  const pool = BLESSINGS.filter((b) => {
    if ((u.bless[b.id] || 0) >= b.max) return false;
    if (b.id === 'pierce' && u.hero.basic.kind !== 'shot') return false;
    return true;
  });
  const out = [];
  for (let k = 0; k < n && pool.length; k++) {
    const r = rng.weighted(wts.map((x, i) => [i, pool.some((b) => b.rar === i) ? x : 0]));
    const cands = pool.filter((b) => b.rar === r && !out.includes(b.id));
    const pick = cands.length ? rng.pick(cands) : pool.filter((b) => !out.includes(b.id))[0];
    if (!pick) break;
    out.push(pick.id);
  }
  return out;
}

function botPickBlessing(ids) {
  let best = ids[0], bs = -1;
  for (const id of ids) {
    const b = BLESS_BY_ID[id];
    let s = b.rar * 10 + (b.m.dmg ? 4 : 0) + (b.m.as ? 3 : 0) + (b.m.hp ? 2 : 0);
    if (id === 'greed' || id === 'swift') s -= 3;
    if (s > bs) { bs = s; best = id; }
  }
  return best;
}

class RunMode {
  // cfg: { kind: 'adventure' | 'abyss', realm, diff, luck }
  constructor(w, cfg) {
    this.w = w;
    this.cfg = cfg;
    this.kind = cfg.kind;
    this.abyss = cfg.kind === 'abyss';
    this.realmId = cfg.realm || 1;
    this.diff = cfg.diff || 0;
    this.roomIdx = -1;
    this.total = this.abyss ? 0 : 8;
    this.phase = 'travel';
    this.t = 0;
    this.portals = [];
    this.offers = {};
    this.waves = [];
    this.waveT = 0;
    this.next = { type: 'combat', reward: 'bless' };
    this.banner = null;
    this.result = null;
    this.downsAtBoss = 0;
    this.startT = 0;
    this.boss = null;
    this.travelT = 0.01;
    this.reward = null;
    this.clearT = 0;
  }

  realm() {
    if (!this.abyss) return REALMS[this.realmId - 1];
    const f = Math.max(1, this.roomIdx + 1);
    return REALMS[Math.floor((f - 1) / 5) % 5];
  }

  partyN() { return Math.max(1, this.w.heroes().length); }

  mult(isBoss) {
    const R = this.realm(), D = DIFFS[this.diff], n = this.partyN();
    let hp, dmg;
    if (this.abyss) {
      const f = this.roomIdx;
      hp = 1.2 * Math.pow(1.14, f); dmg = 1.1 * Math.pow(1.075, f);
    } else {
      hp = R.hp * D.hp * (1 + 0.05 * this.roomIdx);
      dmg = R.dmg * D.dmg * (1 + 0.03 * this.roomIdx);
    }
    hp *= isBoss ? 0.55 + 0.45 * n : 0.85 + 0.15 * n;
    return { hp, dmg };
  }

  goldMul() { return (this.abyss ? 1 + this.roomIdx * 0.08 : this.realm().id * 0.6 + 0.4) * DIFFS[this.diff].gold; }
  ilvl() { return this.abyss ? 1 + Math.floor(this.roomIdx * 0.9) : (this.realm().id - 1) * 6 + 1 + Math.floor(this.roomIdx / 2) + DIFFS[this.diff].ilvl; }

  label() {
    if (this.abyss) return 'Abyss · Floor ' + (this.roomIdx + 1);
    return this.realm().name + ' · ' + (this.roomIdx >= this.total - 1 ? 'Boss' : 'Room ' + (this.roomIdx + 1) + '/' + (this.total - 1));
  }

  enterRoom() {
    const w = this.w;
    this.roomIdx++;
    const info = this.next;
    const isBoss = info.type === 'boss';
    const R = this.realm();
    const W = isBoss ? 1500 : info.type === 'calm' ? 1100 : ROOM_W, H = isBoss ? 1000 : info.type === 'calm' ? 760 : ROOM_H;
    w.setRoom(makeRoom(w.rng, R.pal, info.type, W, H, R.id));
    w.vacuum = false;
    w.hurtThisRoom = false;
    this.reward = info.reward;
    this.type = info.type;
    this.boss = null;
    this.portals = [];
    this.offers = {};
    this.phase = 'enter';
    this.t = 0;
    this.waves = [];
    this.waveT = 0;
    this.spawnLeft = 0;
    const hs = w.heroes();
    hs.forEach((h, i) => {
      h.x = h.px = W / 2 + (i - (hs.length - 1) / 2) * 56;
      h.y = h.py = H - 110;
      h.kx = h.ky = 0;
      h.dash = null;
      h.counters.swUsed = false;
      if (h.deadOut || h.downed) w.revive(h, 0.5, null);
      h.ang = -Math.PI / 2;
    });
    for (const s of w.units) if (s.kind === 'summon' && s.keep && s.owner) { s.x = s.owner.x; s.y = s.owner.y; }
    if (isBoss) w.emit('banner', BOSSES[this.bossId()].name, BOSSES[this.bossId()].title, '#ff4f6d');
    else if (info.type === 'calm') w.emit('banner', 'Healing Spring', 'Rest a moment', '#5df0b0');
    else w.emit('banner', this.abyss ? 'Floor ' + (this.roomIdx + 1) : R.name, this.abyss ? R.name : (info.type === 'elite' ? 'Elite Den' : 'Room ' + (this.roomIdx + 1)), info.type === 'elite' ? '#ff5a4a' : R.pal.accent);
    w.emit('room', this.roomIdx);
    if (this.roomIdx === 0) this.startT = w.t;
  }

  bossId() {
    if (!this.abyss) return this.realm().boss;
    return this.realm().boss;
  }

  planWaves() {
    const R = this.realm(), n = this.partyN();
    const cnt = 0.6 + 0.4 * n;
    const depth = this.abyss ? Math.min(10, 3 + this.roomIdx * 0.35) : this.roomIdx;
    const waves = this.type === 'elite' ? 2 : depth < 2 ? 2 : 3;
    const mobs = this.abyss ? [...new Set(R.mobs.concat(REALMS[(R.id) % 5].mobs.slice(0, this.roomIdx > 10 ? 3 : 1)))] : R.mobs;
    const out = [];
    for (let i = 0; i < waves; i++) {
      let budget = (5 + depth * 1.1 + i * 1.5) * cnt;
      const wave = [];
      if (this.type === 'elite' && i === waves - 1) {
        const ne = n >= 3 ? 2 : 1;
        for (let k = 0; k < ne; k++) wave.push({ id: this.w.rng.pick(mobs.filter((m) => !MOBS[m].heavy) .concat(mobs)), elite: this.w.rng.pick(ELITE_AFFIX).key });
        budget *= 0.5;
      }
      while (budget > 0) {
        const id = this.w.rng.pick(mobs);
        const cost = MOBS[id].heavy ? 3.5 : 1;
        if (cost > budget + 1) { budget -= 0.5; continue; }
        budget -= cost;
        const elite = depth >= 2 && this.w.rng.chance(0.06 + depth * 0.008) ? this.w.rng.pick(ELITE_AFFIX).key : null;
        wave.push({ id, elite });
      }
      out.push(wave);
    }
    return out;
  }

  spawnWave(list) {
    const w = this.w, room = w.room, mult = this.mult(false);
    const hs = w.heroes().filter(alive);
    for (const m of list) {
      let x = 0, y = 0;
      for (let k = 0; k < 30; k++) {
        x = w.rng.range(90, room.w - 90); y = w.rng.range(90, room.h - 90);
        if (hs.some((h) => dist(h.x, h.y, x, y) < 330)) continue;
        if (room.obst.some((o) => dist(o.x, o.y, x, y) < o.r + 40)) continue;
        break;
      }
      w.tele(1, 'circle', x, y, 0.9, (w2) => { w2.spawnMob(m.id, x, y, mult, m.elite); w2.emit('spawn', x, y); }, { r: 26, kind: 'spawn', small: true });
      this.spawnLeft++;
      w.later(0.95, () => { this.spawnLeft--; });
    }
  }

  mobsAlive() { return this.w.units.some((u) => (u.kind === 'mob' || u.kind === 'boss') && !u.dead); }

  update(dt) {
    const w = this.w;
    this.t += dt;
    if (this.result) return;
    if (this.phase === 'travel') {
      this.travelT -= dt;
      if (this.travelT <= 0) this.enterRoom();
      return;
    }
    // defeat
    const hs = w.heroes();
    if (hs.length && hs.every((h) => h.downed && !(h.autoRev > 0)) && this.phase !== 'won') {
      if (!this.loseT) this.loseT = 1.6;
      this.loseT -= dt;
      if (this.loseT <= 0) this.finish(false);
      return;
    }
    this.loseT = 0;
    if (this.phase === 'enter') {
      if (this.t > 1.1) {
        if (this.type === 'boss') {
          const id = this.bossId();
          w.tele(1, 'circle', w.room.w / 2, 230, 1.2, (w2) => { this.boss = w2.spawnBoss(id, w2.room.w / 2, 230, this.mult(true)); w2.emit('shake', 10); w2.emit('sfx', 'roar'); }, { r: 80, kind: 'spawn' });
          this.phase = 'boss';
          this.downsAtBoss = w.stats.downs;
          this.bossT = 0;
        } else if (this.type === 'calm') {
          this.phase = 'clear';
          this.grant();
        } else {
          this.waves = this.planWaves();
          this.spawnWave(this.waves.shift());
          this.phase = 'fight';
          this.waveT = 0;
        }
      }
      return;
    }
    if (this.phase === 'fight') {
      this.waveT += dt;
      const left = w.units.filter((u) => u.kind === 'mob').length;
      if (this.waves.length && this.spawnLeft <= 0 && (left <= 2 || this.waveT > 16)) { this.spawnWave(this.waves.shift()); this.waveT = 0; }
      if (!this.waves.length && this.spawnLeft <= 0 && !this.mobsAlive()) this.roomClear();
      return;
    }
    if (this.phase === 'boss') {
      this.bossT += dt;
      if (this.boss && this.boss.dead) {
        this.phase = 'won';
        this.t = 0;
        for (const m of w.units) if (m.kind === 'mob') { m.dead = true; w.emit('die', m.x, m.y, m.mob.look.color, m.r, m.mid); }
        w.projs.length = 0;
        w.areas = w.areas.filter((a) => a.team !== 1);
        w.emit('bossdie', this.boss.x, this.boss.y, this.boss.boss.color2);
        w.emit('banner', this.abyss ? 'FLOOR ' + (this.roomIdx + 1) + ' CLEARED' : 'VICTORY!', this.boss.boss.name + ' falls', '#ffd23f');
        w.stats.bosses++;
        if (w.stats.downs === this.downsAtBoss) w.stats.bossNoDown++;
        const g = 160 * this.goldMul();
        for (let i = 0; i < 30; i++) w.drop('gold', this.boss.x, this.boss.y, g / 30);
        w.vacuum = true;
        this.lootAll(2, 1);
        for (const h of w.heroes()) if (h.downed) w.revive(h, 0.5, null);
        w.bossKilled = this.bossId();
      }
      return;
    }
    if (this.phase === 'won') {
      if (this.abyss) { if (this.t > 2.5) { w.stats.abyss++; this.afterReward(); } }
      else if (this.t > 4) this.finish(true);
      return;
    }
    if (this.phase === 'reward') {
      const pend = Object.keys(this.offers).filter((k) => !this.offers[k].done);
      this.rewardT += dt;
      for (const k of pend) {
        const of = this.offers[k];
        if (of.bot && this.rewardT > of.delay) this.pick(+k, 0);
      }
      if (this.rewardT > 40) for (const k of pend) this.pick(+k, 0);
      if (!Object.keys(this.offers).some((k) => !this.offers[k].done)) this.afterReward();
      return;
    }
    if (this.phase === 'portal') {
      const humans = hs.filter((h) => h.pl && h.pl.kind !== 'bot' && alive(h));
      const counted = humans.length ? humans : hs.filter(alive);
      for (const p of this.portals) {
        const on = counted.some((h) => dist(h.x, h.y, p.x, p.y) < 52);
        p.prog = on ? p.prog + dt : Math.max(0, p.prog - dt * 2);
        if (p.prog >= 1) { this.choose(p); break; }
      }
    }
  }

  roomClear() {
    const w = this.w;
    this.phase = 'clear';
    w.stats.rooms++;
    if (this.abyss) w.stats.abyss++;
    if (!w.hurtThisRoom) w.stats.flawless++;
    w.vacuum = true;
    w.emit('banner', 'ROOM CLEAR', w.hurtThisRoom ? '' : 'Flawless!', '#ffd23f');
    w.emit('sfx', 'clear');
    for (const h of w.heroes()) if (h.downed) w.revive(h, 0.35, null);
    this.grant();
  }

  // Hands out the reward promised by the portal the party took.
  grant() {
    const w = this.w, r = this.reward;
    const hs = w.heroes();
    if (r === 'gold') {
      const g = 70 * this.goldMul() * (0.8 + 0.2 * hs.length);
      for (let i = 0; i < 26; i++) w.drop('gold', w.room.w / 2, w.room.h / 2, g / 26);
      w.emit('chest', w.room.w / 2, w.room.h / 2, 'gold');
    }
    if (r === 'gear' || r === 'elite') { this.lootAll(1, r === 'elite' ? 1 : 0); w.emit('chest', w.room.w / 2, w.room.h / 2, 'gear'); }
    if (r === 'heal') {
      for (const h of hs) { if (h.downed) w.revive(h, 1, null); w.heal(h, h.maxHp); }
      w.emit('flash', '#5df0b0', 0.25);
      w.emit('ring', w.room.w / 2, w.room.h / 2, 300, '#5df0b0');
      for (const h of hs) h.ult = Math.min(100, h.ult + 30);
    }
    if (r === 'bless' || r === 'elite') {
      this.phase = 'reward';
      this.rewardT = 0;
      for (const h of hs) {
        const pl = h.pl;
        this.offers[pl.slot] = { ids: rollBlessings(w.rng, h, 3, (pl.luck || 0) + (r === 'elite' ? 2 : 0)), done: false, bot: pl.kind === 'bot', delay: 0.6 + w.rng.next(), rerolls: pl.rerolls || 0 };
      }
      w.emit('offers');
      return;
    }
    this.afterReward();
  }

  lootAll(n, bonus) {
    for (const h of this.w.heroes()) {
      if (h.pl.kind === 'bot') continue;
      for (let i = 0; i < n; i++) this.w.emit('loot', h.pl.slot, this.ilvl(), bonus);
    }
    this.w.stats.chests++;
  }

  pick(slot, idx) {
    const of = this.offers[slot];
    if (!of || of.done) return;
    const pl = this.w.players.find((p) => p.slot === slot);
    const u = pl && pl.unit;
    if (!u) { of.done = true; return; }
    const id = of.bot ? botPickBlessing(of.ids) : of.ids[clamp(idx, 0, of.ids.length - 1)];
    of.done = true;
    of.picked = id;
    if (id) {
      this.w.addBlessing(u, id);
      this.w.emit('blessed', slot, id);
    }
  }

  reroll(slot) {
    const of = this.offers[slot];
    if (!of || of.done || of.rerolls <= 0) return;
    const pl = this.w.players.find((p) => p.slot === slot);
    of.rerolls--;
    pl.rerolls = of.rerolls;
    of.ids = rollBlessings(this.w.rng, pl.unit, 3, pl.luck || 0);
    this.w.emit('offers');
  }

  afterReward() {
    const w = this.w;
    this.phase = 'portal';
    const room = w.room;
    const nextIdx = this.roomIdx + 1;
    let opts;
    if (!this.abyss && nextIdx === this.total - 1) opts = [{ type: 'boss', reward: 'boss' }];
    else if (this.abyss && (nextIdx + 1) % 5 === 0) opts = [{ type: 'boss', reward: 'boss' }];
    else {
      const n = w.rng.chance(0.3) ? 3 : 2;
      const pool = [['bless', 40], ['gold', 18], ['gear', 18]];
      if (nextIdx >= 2) pool.push(['elite', 12]);
      if (w.heroes().some((h) => h.downed || h.hp < h.maxHp * 0.6)) pool.push(['heal', 20]); else pool.push(['heal', 5]);
      opts = [];
      for (let i = 0; i < n * 4 && opts.length < n; i++) {
        const r = w.rng.weighted(pool);
        if (opts.some((o) => o.reward === r)) continue;
        opts.push({ type: r === 'heal' ? 'calm' : r === 'elite' ? 'elite' : 'combat', reward: r });
      }
      if (!opts.some((o) => o.reward === 'bless') && w.rng.chance(0.6)) opts[0] = { type: 'combat', reward: 'bless' };
    }
    this.portals = opts.map((o, i) => ({ x: room.w / 2 + (i - (opts.length - 1) / 2) * 230, y: 120, type: o.type, reward: o.reward, prog: 0 }));
    w.emit('portals');
  }

  choose(p) {
    this.next = { type: p.type, reward: p.reward };
    this.portals = [];
    this.phase = 'travel';
    this.travelT = 0.7;
    this.w.emit('travel');
    // turrets and raised skeletons stay behind
    for (const u of this.w.units) if (u.kind === 'summon' && !u.keep) u.dead = true;
  }

  finish(win) {
    if (this.result) return;
    const w = this.w;
    this.phase = win ? 'done' : 'lost';
    if (!win) w.emit('banner', 'DEFEATED', this.abyss ? 'Floor ' + (this.roomIdx + 1) : 'Room ' + (this.roomIdx + 1), '#ff4f6d');
    this.result = {
      win, kind: this.kind, realm: this.realmId, diff: this.diff, rooms: w.stats.rooms, floor: this.abyss ? w.stats.abyss : 0,
      time: w.t - this.startT, gold: Math.round(w.gold), boss: win ? this.bossId() : null,
    };
    w.emit('end', win ? 1 : 0);
  }

  onKill(u, src) {
    if (u.kind === 'mob') onMobDeath(this.w, u, src, this.goldMul());
    if (u.kind === 'boss') { this.w.countKill(u); this.w.emit('die', u.x, u.y, u.boss.color2, u.r, u.bid); }
  }

  onDown(u) { this.w.emit('text', u.x, u.y - 30, 'DOWN!', '#ff5a4a', 15); }

  botGoal(u) {
    const w = this.w;
    const humans = w.heroes().filter((h) => h !== u && h.pl && h.pl.kind !== 'bot' && alive(h));
    const lead = u.pl && u.pl.kind !== 'bot';
    if (humans.length && !lead) {
      let best = humans[0], bd = 1e9;
      for (const h of humans) { const d = dist2(h.x, h.y, u.x, u.y); if (d < bd) { bd = d; best = h; } }
      return { x: best.x, y: best.y + 40, stop: 90 };
    }
    if (this.phase === 'portal' && this.portals.length) {
      if (!this.botPortal || !this.portals.includes(this.botPortal)) {
        const order = ['bless', 'elite', 'gear', 'boss', 'heal', 'gold'];
        this.botPortal = this.portals.slice().sort((a, b) => order.indexOf(a.reward) - order.indexOf(b.reward))[0];
      }
      return { x: this.botPortal.x, y: this.botPortal.y, stop: 10 };
    }
    if (this.phase === 'clear' || this.phase === 'reward') return { x: w.room.w / 2, y: w.room.h / 2, stop: 120 };
    return null;
  }

  hud() {
    return { label: this.label(), phase: this.phase, boss: this.boss && !this.boss.dead ? this.boss : null };
  }
}

// ---------- Arena ----------
class ArenaMode {
  // cfg: { teams: 2 | 0 (free for all), target, time }
  constructor(w, cfg) {
    this.w = w;
    this.cfg = cfg;
    this.kind = 'arena';
    this.ffa = !cfg.teams;
    this.target = cfg.target || 10;
    this.timeLeft = cfg.time || 180;
    this.score = {};
    this.phase = 'enter';
    this.t = 0;
    this.result = null;
    this.feed = [];
    this.puT = 6;
    w.arena = true;
  }

  start() {
    const w = this.w;
    w.setRoom(makeArenaRoom(w.rng));
    for (const h of w.heroes()) { this.score[h.team] = this.score[h.team] || 0; this.place(h); }
    w.emit('banner', 'ARENA', this.ffa ? 'Free for all · first to ' + this.target : 'Team battle · first to ' + this.target, '#ffd23f');
  }

  spawnPoint(team, i) {
    const W = ARENA_W, H = ARENA_H;
    if (this.ffa) {
      const ids = Object.keys(this.score).map(Number).sort((a, b) => a - b);
      const k = ids.indexOf(team), n = Math.max(2, ids.length);
      const a = k / n * TAU + Math.PI;
      return { x: W / 2 + Math.cos(a) * W * 0.4, y: H / 2 + Math.sin(a) * H * 0.38 };
    }
    return { x: team === 0 ? 110 : W - 110, y: H / 2 + ((i % 4) - 1.5) * 90 };
  }

  place(h) {
    const mates = this.w.heroes().filter((o) => o.team === h.team);
    const p = this.spawnPoint(h.team, mates.indexOf(h));
    h.x = h.px = p.x; h.y = h.py = p.y;
    h.kx = h.ky = 0;
    h.ang = h.x < ARENA_W / 2 ? 0 : Math.PI;
  }

  update(dt) {
    const w = this.w;
    this.t += dt;
    if (this.result) return;
    if (this.phase === 'enter') { if (this.t > 1.5) this.phase = 'fight'; return; }
    if (this.phase === 'over') { this.overT -= dt; if (this.overT <= 0) this.finish(); return; }
    this.timeLeft -= dt;
    for (const h of w.heroes()) {
      if (!h.ko) continue;
      h.respawn -= dt;
      if (h.respawn <= 0) {
        h.ko = false;
        h.hp = h.maxHp;
        h.st = newStatus();
        h.st.invuln = 2;
        h.ult = Math.max(h.ult, 20);
        this.place(h);
        w.emit('revive', h.id, h.x, h.y);
      }
    }
    this.puT -= dt;
    if (this.puT <= 0) {
      this.puT = 11;
      if (w.picks.length < 3) {
        const spots = [[ARENA_W / 2, ARENA_H / 2], [ARENA_W / 2, ARENA_H * 0.32], [ARENA_W / 2, ARENA_H * 0.68]];
        const s = w.rng.pick(spots.filter((s) => !w.picks.some((p) => dist(p.x, p.y, s[0], s[1]) < 30)) .concat([spots[0]]));
        const kind = w.rng.pick(['heal', 'power', 'ultorb']);
        w.picks.push({ id: w.nid++, kind, x: s[0], y: s[1], vx: 0, vy: 0, val: 1, t: 0 });
      }
    }
    const best = Math.max(...Object.values(this.score));
    if (best >= this.target || this.timeLeft <= 0) {
      const leaders = Object.keys(this.score).filter((k) => this.score[k] === best);
      if (leaders.length === 1 || this.timeLeft < -30) {
        this.winner = +leaders[0];
        this.phase = 'over';
        this.overT = 3;
        w.emit('banner', this.teamName(this.winner) + ' WINS!', '', '#ffd23f');
        w.emit('sfx', 'win');
      } else if (this.timeLeft <= 0 && !this.ot) { this.ot = true; w.emit('banner', 'OVERTIME', 'Next knockout wins', '#ff4f6d'); }
    }
  }

  teamName(team) {
    if (!this.ffa) return team === 0 ? 'BLUE TEAM' : 'RED TEAM';
    const h = this.w.heroes().find((o) => o.team === team);
    return h ? (h.pl.name || h.hero.name).toUpperCase() : 'PLAYER';
  }

  onKO(v, src) {
    const w = this.w;
    if (v.ko) return;
    const killer = src && src.kind === 'summon' ? src.owner : src;
    v.ko = true;
    v.respawn = 3.5;
    v.deaths++;
    v.streak = 0;
    v.channel = null;
    v.dash = null;
    v.buffs.length = 0;
    w.emit('die', v.x, v.y, v.hero.color, v.r, 'hero');
    if (killer && killer.kind === 'hero' && killer.team !== v.team) {
      this.score[killer.team] = (this.score[killer.team] || 0) + 1;
      killer.kos++;
      killer.streak++;
      if (killer.team === 0 || true) w.stats.bestStreak = Math.max(w.stats.bestStreak || 0, killer.pl.kind !== 'bot' ? killer.streak : 0);
      killer.ult = Math.min(100, killer.ult + 25);
      this.feed.push({ t: w.t, k: killer.id, v: v.id });
      w.emit('ko', killer.id, v.id, killer.streak);
    } else {
      const other = Object.keys(this.score).map(Number).filter((t) => t !== v.team);
      if (!this.ffa && other.length) this.score[other[0]]++;
      w.emit('ko', 0, v.id, 0);
    }
    if (this.feed.length > 5) this.feed.shift();
  }

  onKill(u) { if (u.kind === 'summon') w2poof(this.w, u); }

  finish() {
    const w = this.w;
    this.result = { win: null, kind: 'arena', winner: this.winner, score: Object.assign({}, this.score), time: this.t, gold: 0 };
    w.emit('end', 1);
  }

  botGoal(u) {
    const w = this.w;
    if (u.hp < u.maxHp * 0.7 || u.ult < 100) {
      let best = null, bd = 700 * 700;
      for (const p of w.picks) { const d = dist2(p.x, p.y, u.x, u.y); if (d < bd && (p.kind !== 'heal' || u.hp < u.maxHp * 0.7)) { bd = d; best = p; } }
      if (best) return { x: best.x, y: best.y, stop: 4 };
    }
    return { x: ARENA_W / 2, y: ARENA_H / 2, stop: 160 };
  }

  hud() { return { label: this.ffa ? 'Arena · Free for all' : 'Arena · Team battle', phase: this.phase, boss: null }; }
}

function w2poof(w, u) { w.emit('poof', u.x, u.y, '#ffffff'); }
