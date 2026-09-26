// ---------- Level scene: gameplay ----------
class LevelScene {
  constructor(def, opts = {}) {
    this.def = def;
    this.opts = opts;
    this.region = REGIONS[def.region];
    this.tier = def.region;
    const extra = Math.max(0, def.diff - def.region);
    this.diff = def.diff;
    this.baseHpMul = TIER_HP[this.tier] * (1 + extra * 0.25);
    this.hpMul = this.baseHpMul;
    this.dmgMul = TIER_DMG[this.tier] * (1 + extra * 0.15);
    this.usesControls = true;
    const L = generateLevel(def);
    this.L = L;
    this.world = L.world;
    this.platforms = L.platforms.map((o) => new Platform(o));
    this.hazards = L.hazards.map((o) => new Hazard(o));
    this.props = [...L.crates.map((c) => new Crate(c.x, c.y)), ...L.chests.map((c) => new Chest(c.x, c.y, this.tier))];
    this.springs = L.springs.map((s) => new Spring(s.x, s.y));
    this.checkpoints = L.checkpoints.map((c) => new Checkpoint(c.x, c.y));
    this.signs = L.signs.map((s) => new Sign(s.x, s.y, s.text));
    this.goal = L.goal ? new Goal(L.goal.x, L.goal.y) : null;
    this.pickups = [
      ...L.coins.map((c) => new Pickup('coin', c.x, c.y, { fixed: true })),
      ...L.gems.map((g) => new Pickup('gem', g.x, g.y, { fixed: true, value: 10 + this.tier * 6 })),
    ];
    this.enemies = [];
    this.dormant = L.spawns.slice().sort((a, b) => a.x - b.x);
    this.projectiles = [];
    this.fx = new FX();
    this.timers = [];
    this.player = new Player(this, L.start.x, L.start.y);
    this.respawn = { x: L.start.x, y: L.start.y };
    this.cam = { x: 0, y: 0 };
    this.lookAhead = 0;
    this.refY = null;
    this.bounds = { x0: 0, x1: this.world.pw };
    this.arenas = L.arenas.map((a) => Object.assign({}, a, { wave: 0, started: false, done: false, nextT: null }));
    this.arena = null;
    this.boss = null;
    this.deaths = 0;
    this.stats = { kills: 0, coins: 0, dmgTaken: 0, maxCombo: 0, xp: 0, time: 0, skills: 0 };
    this.hitStopT = 0; this.slowT = 0; this.shakeT = 0; this.shakeMag = 0; this.shakeX = 0; this.shakeY = 0;
    this.state = 'play';
    this.stateT = 0;
    this.time = 0;
    this.paused = false;
    this.godMode = false;
    this.banner = null;
    this.backdrop = new Backdrop(this.region, def.seed || 1);
    this.weather = this.region.weather ? new Weather(this.region.weather, Game.W, Game.H) : null;
    this.groundGrad = null;
    this.lavaT = 0;
    const sub = def.kind === 'boss' ? 'Boss Stage' : def.kind === 'ambush' ? 'Defeat the ambushers!' : def.kind === 'challenge' ? 'Survive 5 waves!' : def.kind === 'endless' ? 'How long can you last?' : def.kind === 'treasure' ? 'Treasure Stage' : this.region.name;
    this.showBanner(def.name, sub, 2.2);
    this.updateCamera(0, true);
  }

  enter() {
    Input.active = true;
    Input.reset();
    UI.hideAll();
    const k = this.def.kind;
    Music.play(k === 'endless' || k === 'challenge' || k === 'ambush' ? 'arena' : this.region.music);
    Game.keepAwake(true);
  }
  exit() {
    Input.active = false;
    Game.keepAwake(false);
  }

  // ----- helpers used by entities -----
  spawnEnemy(type, x, y, o = {}) {
    if (o.arena === undefined) o.arena = this.arena;
    const e = new Enemy(this, type, x, y, o);
    this.enemies.push(e);
    return e;
  }
  addProjectile(p) { this.projectiles.push(p); return p; }
  addPickup(p) { this.pickups.push(p); return p; }
  schedule(delay, fn) { this.timers.push({ t: delay, fn }); }
  shake(mag, dur) {
    if (!SAVE.settings.shake) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, dur);
  }
  hitstop(t) { this.hitStopT = Math.max(this.hitStopT, t); }
  showBanner(text, sub, dur, big) { this.banner = { text, sub: sub || '', t: 0, dur: dur || 1.5, big: !!big }; }

  dropCoins(x, y, total, big) {
    total = Math.max(0, Math.round(total));
    if (!total) return;
    const n = Math.min(big ? 16 : 10, total);
    const base = Math.floor(total / n);
    let extra = total - base * n;
    for (let i = 0; i < n; i++) {
      const v = base + (extra > 0 ? 1 : 0);
      extra--;
      this.pickups.push(new Pickup('coin', x, y, { vx: rand(-150, 150), vy: rand(-420, -220), value: v }));
    }
  }
  addCoins(n) {
    SAVE.coins += n;
    this.stats.coins += n;
  }
  gainXp(n) {
    this.stats.xp += n;
    SAVE.xp += n;
    let leveled = false;
    while (SAVE.xp >= xpNeed(SAVE.lvl)) {
      SAVE.xp -= xpNeed(SAVE.lvl);
      SAVE.lvl++;
      leveled = true;
    }
    if (leveled) {
      const P = this.player;
      P.refreshStats(false);
      if (!P.dead) P.hp = P.maxHp;
      this.fx.text(P.cx, P.y - 30, 'LEVEL UP!', '#ffd740', 20, { life: 1.6, vy: -40 });
      this.fx.ring(P.cx, P.cy, 10, 70, '#ffd740', 0.5, 4);
      this.fx.burst(P.cx, P.cy, '#ffd740', 20, 220, 3, -50);
      Sound.play('levelup');
      this.showBanner('LEVEL ' + SAVE.lvl + '!', 'HP & Attack increased', 1.6);
    }
  }

  hitPlayer(box, dmg, srcX, kb, o) {
    const P = this.player;
    if (P.dead || !overlap(box, P)) return false;
    return P.hurt(dmg, srcX, kb, o || {});
  }
  hurtPlayerCircle(x, y, r, dmg, srcX) {
    const P = this.player;
    if (!P.dead && circleRect(x, y, r, P)) P.hurt(dmg, srcX, 320);
  }
  playerHit(e, h) {
    const P = this.player;
    let dmg = h.dmg * rand(0.9, 1.1);
    const crit = Math.random() < 0.1;
    if (crit) dmg *= 1.6;
    h.dmg = dmg;
    const r = e.takeHit(h, this);
    if (!r) return false;
    if (r === 'block') { this.hitstop(0.04); return false; }
    const dealt = h.dealt || Math.round(dmg);
    this.fx.text(e.x + e.w / 2, e.y - 4, dealt, crit ? '#ffd740' : '#ffffff', crit ? 19 : 14);
    this.fx.spark(h.x != null ? h.x : e.x + e.w / 2, h.y != null ? h.y : e.y + e.h / 2, crit ? '#ffd740' : '#ffffff', crit ? 12 : 7, 280, h.dir > 0 ? 0 : Math.PI, 2.4);
    this.hitstop(h.heavy ? 0.085 : 0.05);
    this.shake(h.heavy ? 5 : 2.5, 0.12);
    Sound.play(crit ? 'crit' : h.heavy ? 'hitHeavy' : 'hit');
    P.en = Math.min(P.maxEn, P.en + (h.kind === 'skill' ? 1 : 3.5));
    P.addChain();
    return true;
  }
  playerAoE(x, y, r, h) {
    for (const e of this.enemies) {
      if (e.dead || !circleRect(x, y, r, e)) continue;
      this.playerHit(e, Object.assign({}, h, { dir: sign(e.x + e.w / 2 - x) || 1, x: e.x + e.w / 2, y: e.y + e.h / 2, kind: h.kind || 'skill' }));
    }
    for (const c of this.props) if (c.isProp && !c.dead && circleRect(x, y, r, c)) c.takeHit({ heavy: true }, this);
  }
  hazardHit(srcX, pct, bounce) {
    const P = this.player;
    if (P.dead) return;
    if (P.inv > 0 || P.state === 'dash' || P.state === 'whirl') {
      if (bounce && P.vy >= 0) P.vy = -420;
      return;
    }
    P.hurt(Math.max(5, Math.round(P.maxHp * pct)), srcX, 180, { vy: -480 });
  }
  lavaHit() {
    this.fx.burst(this.player.cx, this.player.feet, '#ff7043', 16, 220, 4);
    Sound.play('fire');
    this.respawnAtSafe(0.18);
  }
  playerFell() { this.respawnAtSafe(0.15); }
  respawnAtSafe(pct) {
    const P = this.player;
    if (P.dead) return;
    const dmg = this.godMode ? 0 : Math.max(5, Math.round(P.maxHp * pct * (1 - P.def)));
    P.x = P.safe.x;
    P.y = P.safe.y;
    P.vx = 0;
    P.vy = 0;
    P.cur = null;
    P.state = 'normal';
    P.plat = null;
    P.rot = 0;
    if (dmg) {
      P.hp -= dmg;
      this.stats.dmgTaken += dmg;
      this.fx.text(P.cx, P.y - 6, '-' + dmg, '#ff5252', 15);
      Sound.play('hurt');
      P.endChain();
    }
    if (P.hp <= 0) { P.hp = 0; P.die(); return; }
    P.inv = 1.3;
    this.fx.smoke(P.cx, P.cy, 8, 'rgba(255,255,255,0.5)');
    this.updateCamera(0, true);
  }

  onEnemyKilled(e) {
    this.stats.kills++;
    SAVE.stats.kills++;
    const xp = Math.round((e.T.xp || 0) * (1 + this.tier * 0.8));
    if (xp > 0) this.gainXp(xp);
  }

  onBossDefeated(b) {
    this.slowT = 1.8;
    this.fx.flash('#ffffff', 0.9);
    this.shake(14, 1.2);
    Sound.play('explode');
    Sound.play('roar');
    const k = b.deathSkel && b.deathSkel();
    if (k) this.fx.debris(k, '#1a1a1a', 0, -300);
    for (let i = 0; i < 5; i++) {
      this.schedule(i * 0.18, () => {
        this.fx.burst(b.cx + rand(-b.w / 2, b.w / 2), b.cy + rand(-b.h / 2, b.h / 2), choice(['#ffd740', '#ff7043', '#ffffff']), 20, 300, 4);
        this.fx.ring(b.cx, b.cy, 10, 120, '#ffffff', 0.5, 5);
        Sound.play('explode');
      });
    }
    for (const e of this.enemies) if (e !== b && !e.dead) { e.dead = true; this.fx.smoke(e.x + e.w / 2, e.y + e.h / 2, 5); }
    this.projectiles = this.projectiles.filter((p) => p.owner === 'player');
    Music.stop();
    const gy = this.world.groundBelow(b.cx, Math.min(b.y + b.h - 10, this.arena ? this.arena.gy - 10 : b.y)) || (this.arena ? this.arena.gy : b.feet);
    const sx = clamp(b.cx, this.bounds.x0 + 40, this.bounds.x1 - 40);
    this.schedule(1.4, () => {
      this.addPickup(new Pickup('shard', sx, gy - 40, { fixed: true }));
      this.fx.ring(sx, gy - 40, 10, 80, '#81d4fa', 0.6, 4);
      Sound.play('gem');
      this.showBanner('VICTORY!', 'Grab the Crystal Shard!', 2.2, true);
    });
  }
  collectShard() {
    this.fx.flash('#e1f5fe', 0.8);
    this.completeLevel();
  }

  setCheckpoint(cp) {
    this.respawn = { x: cp.x, y: cp.y };
    Sound.play('checkpoint');
    this.fx.text(cp.x, cp.y - 84, 'CHECKPOINT', '#69f0ae', 14, { life: 1.4 });
    const P = this.player;
    if (!P.dead && P.hp < P.maxHp) P.heal(Math.round(P.maxHp * 0.25));
  }

  // ----- arenas -----
  startArena(a) {
    a.started = true;
    this.arena = a;
    this.bounds = { x0: a.x0, x1: a.x1 };
    Sound.play('warn');
    if (a.boss) {
      this.boss = makeBoss(this, a.boss, a);
      this.enemies.push(this.boss);
      this.showBanner(this.boss.name, this.boss.title, 2.6, true);
      Music.play('boss');
      Sound.play('roar');
      this.shake(6, 0.8);
      return;
    }
    if (a.endless) {
      a.wave = 1;
      this.spawnWave(a, this.endlessWave(1));
    } else {
      a.wave = 0;
      this.spawnWave(a, a.waves[0]);
    }
  }
  spawnWave(a, list) {
    const P = this.player;
    const total = a.endless ? '' : '/' + a.waves.length;
    this.showBanner(a.endless ? 'WAVE ' + a.wave : a.wave === 0 && a.waves.length === 1 ? 'FIGHT!' : 'WAVE ' + (a.wave + 1) + total, '', 1.1);
    list.forEach((type, i) => {
      let x = a.x0 + 60;
      for (let k = 0; k < 8; k++) {
        x = rand(a.x0 + 40, a.x1 - 40);
        if (Math.abs(x - P.cx) > 150) break;
      }
      const fly = ENEMIES[type].flying;
      const y = fly ? a.gy - rand(100, 150) : a.gy - 150 - i * 6;
      this.schedule(i * 0.18, () => {
        if (this.arena !== a) return;
        const e = new Enemy(this, type, x, y, { aggro: true, drop: true, arena: a });
        this.enemies.push(e);
        this.fx.smoke(x, y - 20, 5, 'rgba(255,255,255,0.45)');
      });
    });
    a.pending = list.length * 0.18 + 0.1;
  }
  endlessWave(n) {
    this.hpMul = this.baseHpMul * (1 + (n - 1) * 0.09);
    const pool = this.region.pool;
    const rng = new RNG((Math.random() * 1e9) | 0);
    const list = [];
    const count = Math.min(8, 2 + Math.floor(n * 0.6));
    for (let i = 0; i < count; i++) list.push(rng.weighted(pool));
    if (n % 5 === 0) list.push(HEAVY_BY_REGION[this.tier], HEAVY_BY_REGION[Math.max(0, this.tier - 1)]);
    return list;
  }
  updateArenas(dt) {
    const P = this.player;
    if (!this.arena) {
      if (P.dead) return;
      for (const a of this.arenas) {
        if (a.done || a.started) continue;
        if (P.cx > a.x0 + 70 && P.cx < a.x1 - 10) { this.startArena(a); break; }
      }
      return;
    }
    const a = this.arena;
    if (P.x < a.x0 + 2) { P.x = a.x0 + 2; if (P.vx < 0) P.vx = 0; }
    if (P.x + P.w > a.x1 - 2) { P.x = a.x1 - 2 - P.w; if (P.vx > 0) P.vx = 0; }
    if (a.boss) return;
    if (a.pending > 0) { a.pending -= dt; return; }
    const alive = this.enemies.some((e) => !e.dead && e.arena === a);
    if (alive) return;
    if (a.nextT == null) a.nextT = 1.0;
    a.nextT -= dt;
    if (a.nextT > 0) return;
    a.nextT = null;
    if (a.endless) {
      a.wave++;
      if (a.wave % 5 === 1 && a.wave > 1) {
        this.dropCoins(P.cx, P.y - 20, 10 + this.tier * 5);
        this.addPickup(new Pickup('heart', P.cx, P.y - 40, { vy: -200 }));
      }
      this.spawnWave(a, this.endlessWave(a.wave));
    } else if (a.wave + 1 < a.waves.length) {
      a.wave++;
      this.spawnWave(a, a.waves[a.wave]);
    } else this.finishArena(a);
  }
  finishArena(a) {
    a.done = true;
    this.arena = null;
    this.bounds = { x0: 0, x1: this.world.pw };
    this.showBanner('CLEAR!', '', 1.3);
    Sound.play('chest');
    const P = this.player;
    this.dropCoins(P.cx, P.y - 30, Math.round(12 * (1 + this.tier)), true);
    const k = this.def.kind;
    if (k === 'challenge' || k === 'ambush') this.schedule(1.4, () => this.completeLevel());
  }

  // ----- flow -----
  completeLevel() {
    if (this.state !== 'play') return;
    this.state = 'complete';
    this.stateT = 0;
    const P = this.player;
    P.victory = true;
    P.inv = 999;
    P.endChain();
    Music.play('victory');
    Sound.play('victory');
    const st = this.stats;
    const kind = this.def.kind;
    const t = this.tier;
    const rewardCoins = Math.round((kind === 'boss' ? 150 : kind === 'challenge' ? 110 : kind === 'treasure' ? 40 : kind === 'ambush' ? 25 : 30) * (1 + t * 0.8));
    const rewardXp = Math.round((kind === 'boss' ? 110 : kind === 'challenge' ? 70 : kind === 'ambush' ? 25 : 30) * (1 + t));
    let score = 100;
    score -= (st.dmgTaken / P.maxHp) * 35;
    score -= this.deaths * 25;
    const par = this.world.pw / 120 + this.arenas.length * 22 + (kind === 'boss' ? 70 : 0) + (kind === 'challenge' ? 60 : 0);
    if (this.time > par) score -= Math.min(30, ((this.time - par) / par) * 40);
    score += Math.min(10, st.maxCombo / 3);
    const rank = score >= 90 ? 'S' : score >= 72 ? 'A' : score >= 52 ? 'B' : 'C';
    this.addCoins(rewardCoins);
    this.gainXp(rewardXp);
    let newSkill = null;
    const id = this.def.nodeId;
    if (id) {
      SAVE.done[id] = true;
      const order = ['C', 'B', 'A', 'S'];
      if (!SAVE.ranks[id] || order.indexOf(rank) > order.indexOf(SAVE.ranks[id])) SAVE.ranks[id] = rank;
    }
    if (kind === 'boss') {
      const sk = BOSS_REWARD[this.def.region];
      if (sk && !SAVE.skills.includes(sk)) {
        SAVE.skills.push(sk);
        if (!SAVE.slots[1]) SAVE.slots[1] = sk;
        newSkill = sk;
      }
      if (this.def.region === 5) SAVE.won = true;
    }
    if (st.maxCombo > SAVE.stats.bestCombo) SAVE.stats.bestCombo = st.maxCombo;
    saveGame();
    this.result = { rank, rewardCoins, rewardXp, newSkill, stats: Object.assign({}, st, { time: this.time }), kind, final: kind === 'boss' && this.def.region === 5 };
    this.schedule(1.7, () => UI.showResult(this));
  }

  onPlayerDeath() {
    this.state = 'dead';
    this.stateT = 0;
    this.deaths++;
    SAVE.stats.deaths++;
    Sound.play('gameover');
    if (this.def.kind === 'endless') {
      const a = this.arenas[0];
      const waves = Math.max(0, (a ? a.wave : 1) - 1);
      const reward = Math.round(waves * 8 * (1 + this.tier * 0.6));
      const best = waves > SAVE.arenaBest;
      if (best) SAVE.arenaBest = waves;
      SAVE.coins += reward;
      saveGame();
      this.result = { waves, reward, best, stats: Object.assign({}, this.stats, { time: this.time }) };
      this.schedule(1.5, () => UI.showEndless(this));
      return;
    }
    saveGame();
    this.schedule(1.4, () => UI.showDefeat(this));
  }

  retry() {
    if (this.arena) {
      const a = this.arena;
      for (const e of this.enemies) if (e.arena === a || e.isBoss) e.dead = true;
      a.started = false;
      a.wave = 0;
      a.nextT = null;
      a.pending = 0;
      this.arena = null;
      this.boss = null;
      this.bounds = { x0: 0, x1: this.world.pw };
      Music.play(this.def.kind === 'challenge' || this.def.kind === 'ambush' ? 'arena' : this.region.music);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = [];
    this.timers = [];
    const P = new Player(this, this.respawn.x, this.respawn.y);
    P.inv = 1.5;
    this.player = P;
    this.state = 'play';
    this.stateT = 0;
    this.updateCamera(0, true);
    Input.active = true;
    Input.reset();
    const k = this.def.kind;
    if ((k === 'challenge' || k === 'ambush') && this.arenas.every((a) => a.done)) this.schedule(0.8, () => this.completeLevel());
  }

  pause() {
    if (this.paused || this.state !== 'play') return;
    this.paused = true;
    Input.active = false;
    Input.reset();
    UI.showPause(this);
  }
  resume() {
    this.paused = false;
    Input.active = true;
    Input.reset();
  }
  onHidden() { if (this.state === 'play') this.pause(); }

  // ----- update -----
  update(dt) {
    if (this.paused) return;
    if (Input.pressed.pause && this.state === 'play') { this.pause(); return; }
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      return;
    }
    let sdt = dt;
    if (this.slowT > 0) { this.slowT -= dt; sdt = dt * 0.3; }
    this.time += sdt;
    this.stateT += dt;
    SAVE.stats.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= sdt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    for (const p of this.platforms) p.update(sdt, this);
    this.player.update(sdt);
    // activate enemies ahead of the camera
    const ax1 = this.cam.x + Game.W + 260;
    while (this.dormant.length && this.dormant[0].x < ax1) {
      const s = this.dormant.shift();
      this.enemies.push(new Enemy(this, s.type, s.x, s.y));
    }
    const cx0 = this.cam.x - 320, cx1 = this.cam.x + Game.W + 320;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.isBoss || e.arena || (e.x > cx0 && e.x < cx1)) e.update(sdt);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.updateProjectiles(sdt);
    for (const p of this.pickups) p.update(sdt, this);
    this.pickups = this.pickups.filter((p) => !p.dead);
    for (const c of this.props) c.update(sdt, this);
    this.props = this.props.filter((c) => !c.dead);
    for (const s of this.springs) s.update(sdt, this);
    for (const c of this.checkpoints) c.update(sdt, this);
    for (const s of this.signs) s.update(sdt, this);
    for (const h of this.hazards) if (Math.abs(h.x - this.player.cx) < Game.W + 200) h.update(sdt, this);
    if (this.goal && this.state === 'play') this.goal.update(sdt, this);
    if (this.state === 'play') this.updateArenas(sdt);
    this.fx.update(sdt, this.world);
    this.lavaT += sdt;
    const prevCam = this.cam.x;
    if (!this.player.dead) this.updateCamera(dt, false);
    if (this.weather) this.weather.update(sdt, this.cam.x - prevCam, Game.W, Game.H);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeMag * Math.min(1, this.shakeT * 5);
      this.shakeX = rand(-m, m);
      this.shakeY = rand(-m, m);
      if (this.shakeT <= 0) { this.shakeMag = 0; this.shakeX = this.shakeY = 0; }
    }
  }

  updateProjectiles(dt) {
    const P = this.player;
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.update(dt, this);
      if (p.dead || p.harmless) continue;
      if (p.owner === 'enemy') {
        if (P.dead) continue;
        const hit = p.rect ? overlap(p.rect, P) : circleRect(p.x, p.y, p.r, P);
        if (!hit) continue;
        if (p.boom) { if (P.inv <= 0 && P.state !== 'dash' && P.state !== 'whirl') p.explode(this, p.boom, p.dmg); continue; }
        if (p.type === 'bomb') { if (P.inv <= 0 && P.state !== 'dash' && P.state !== 'whirl') p.explode(this, 58, p.dmg); continue; }
        const persistent = p.type === 'tornado' || p.type === 'beam' || p.type === 'icespike' || p.type === 'shock' || p.type === 'wave' || p.type === 'flame';
        if (p.type === 'tornado') { if (p.tick > 0) continue; p.tick = 0.5; }
        const did = P.hurt(p.dmg, p.x, p.kb || 220, { slow: p.slow });
        if (did && !persistent) {
          p.dead = true;
          this.fx.spark(p.x, p.y, '#ffffff', 5, 150);
        }
      } else {
        if (p.noContact) continue;
        for (const e of this.enemies) {
          if (e.dead || p.hitSet.has(e)) continue;
          const hit = p.rect ? overlap(p.rect, e) : circleRect(p.x, p.y, p.r, e);
          if (!hit) continue;
          if (p.type === 'bomb') { p.explode(this, 58, p.dmg * 2); break; }
          p.hitSet.add(e);
          this.playerHit(e, { dmg: p.dmg, dir: sign(p.vx) || sign(e.x + e.w / 2 - p.x) || 1, kbx: p.kb || 200, kby: p.kby || (p.launch ? -380 : -60), heavy: !!p.heavy, launch: !!p.launch, x: p.x, y: p.y, kind: 'skill' });
          if (!p.pierce) { p.dead = true; break; }
        }
        if (!p.dead && p.hitSet) {
          for (const c of this.props) {
            if (!c.isProp || c.dead || p.hitSet.has(c)) continue;
            if (p.rect ? overlap(p.rect, c) : circleRect(p.x, p.y, p.r, c)) { p.hitSet.add(c); c.takeHit({ heavy: true }, this); }
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  updateCamera(dt, snap) {
    const P = this.player, W = Game.W, H = Game.H;
    this.lookAhead = snap ? P.facing * 40 : approach(this.lookAhead, P.facing * 40, 110 * dt);
    let tx = P.cx - W * 0.45 + this.lookAhead;
    // Vertical: anchor to the ground the player last stood on so jumps don't yank the view,
    // but never let the player leave the screen.
    if (snap || P.onGround || P.feet > this.refY || this.refY == null) this.refY = P.feet;
    let ty = this.refY - H * 0.64;
    if (P.y - 44 < ty) ty = P.y - 44;
    if (P.feet + 40 > ty + H) ty = P.feet + 40 - H;
    let minX = 0, maxX = this.world.pw - W;
    if (this.arena) {
      const a = this.arena, aw = a.x1 - a.x0;
      if (aw <= W) minX = maxX = (a.x0 + a.x1) / 2 - W / 2;
      else { minX = a.x0; maxX = a.x1 - W; }
    }
    tx = clamp(tx, minX, maxX);
    tx = clamp(tx, 0, Math.max(0, this.world.pw - W));
    ty = clamp(ty, 0, Math.max(0, this.world.ph - H));
    if (snap) { this.cam.x = tx; this.cam.y = ty; }
    else {
      this.cam.x += (tx - this.cam.x) * (1 - Math.exp(-dt * 7));
      this.cam.y += (ty - this.cam.y) * (1 - Math.exp(-dt * 5));
    }
  }

  // ----- drawing -----
  draw(ctx) {
    const W = Game.W, H = Game.H;
    const ps = Game.pxScale;
    const camX = Math.round(this.cam.x * ps) / ps;
    const camY = Math.round(this.cam.y * ps) / ps;
    this.backdrop.draw(ctx, camX, camY, W, H, this.time);
    ctx.save();
    ctx.translate(-camX + this.shakeX, -camY + this.shakeY);
    this.drawBridges(ctx, camX);
    this.drawTiles(ctx, camX, camY);
    this.drawDecor(ctx, camX);
    const vis = (x, m = 80) => x > camX - m && x < camX + W + m;
    for (const h of this.hazards) if (vis(h.x, 200)) h.draw(ctx);
    for (const p of this.platforms) if (vis(p.x, 120)) p.draw(ctx, this.region);
    for (const s of this.springs) if (vis(s.x)) s.draw(ctx);
    for (const c of this.checkpoints) if (vis(c.x)) c.draw(ctx);
    if (this.goal && vis(this.goal.x, 120)) this.goal.draw(ctx);
    for (const s of this.signs) if (vis(s.x)) s.draw(ctx);
    for (const c of this.props) if (vis(c.x)) c.draw(ctx);
    for (const p of this.pickups) if (vis(p.x, 40)) p.draw(ctx);
    if (this.arena) this.drawBarriers(ctx, this.arena);
    for (const e of this.enemies) if (!e.dead && (e.isBoss || vis(e.x, 140))) e.draw(ctx);
    this.player.draw(ctx);
    for (const p of this.projectiles) p.draw(ctx, this.time);
    this.fx.draw(ctx);
    for (const s of this.signs) s.drawBubble(ctx, this);
    this.fx.drawTexts(ctx);
    ctx.restore();
    if (this.weather) this.weather.draw(ctx);
    if (this.region.tint) { ctx.fillStyle = this.region.tint; ctx.fillRect(0, 0, W, H); }
    this.drawVignette(ctx, W, H);
    if (this.fx.flashA > 0) {
      ctx.globalAlpha = this.fx.flashA;
      ctx.fillStyle = this.fx.flashC;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    this.drawHUD(ctx, W, H);
    if (this.state === 'play' && !this.paused) Input.draw(ctx, this.controlInfo());
    else if (this.state === 'dead') {
      ctx.fillStyle = `rgba(40,0,0,${Math.min(0.5, this.stateT * 0.5)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  controlInfo() {
    const P = this.player;
    const skills = SAVE.slots.map((id, i) => {
      if (!id) return null;
      const sk = SKILLS[id];
      return { id, color: sk.color, ready: P.en >= sk.cost && P.skillCd[i] <= 0, cd: P.skillCd[i] > 0 ? P.skillCd[i] / sk.cd : 0 };
    });
    return { skills, potions: SAVE.potions, weapon: P.weaponId };
  }

  drawVignette(ctx, W, H) {
    const P = this.player;
    const low = !P.dead && P.hp / P.maxHp < 0.25;
    if (!this.vign || this.vign.W !== W || this.vign.H !== H) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.65);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      const r = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.6);
      r.addColorStop(0, 'rgba(255,0,0,0)');
      r.addColorStop(1, 'rgba(255,0,0,0.5)');
      this.vign = { W, H, g, r };
    }
    ctx.fillStyle = this.vign.g;
    ctx.fillRect(0, 0, W, H);
    if (low) {
      ctx.globalAlpha = 0.4 + Math.sin(this.time * 6) * 0.25;
      ctx.fillStyle = this.vign.r;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  drawBarriers(ctx, a) {
    const t = this.time;
    for (const x of [a.x0, a.x1]) {
      const g = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
      g.addColorStop(0, 'rgba(255,82,82,0)');
      g.addColorStop(0.5, `rgba(255,82,82,${0.45 + Math.sin(t * 6) * 0.15})`);
      g.addColorStop(1, 'rgba(255,82,82,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 10, a.gy - 400, 20, 400);
      ctx.fillStyle = 'rgba(255,205,210,0.8)';
      for (let i = 0; i < 6; i++) {
        const yy = a.gy - ((t * 80 + i * 70) % 400);
        ctx.fillRect(x - 1.5, yy, 3, 12);
      }
    }
  }

  drawTiles(ctx, camX, camY) {
    const w = this.world, R = this.region, W = Game.W, H = Game.H;
    const c0 = Math.max(0, Math.floor(camX / TILE) - 1), c1 = Math.min(w.cols - 1, Math.floor((camX + W) / TILE) + 1);
    const r0 = Math.max(0, Math.floor(camY / TILE)), r1 = Math.min(w.rows - 1, Math.floor((camY + H) / TILE) + 1);
    if (!this.groundGrad) {
      const g = ctx.createLinearGradient(0, 150, 0, w.ph);
      g.addColorStop(0, R.ground);
      g.addColorStop(1, R.groundDark);
      this.groundGrad = g;
    }
    ctx.fillStyle = this.groundGrad;
    for (let c = c0; c <= c1; c++) {
      let r = r0;
      while (r <= r1) {
        if (w.get(c, r) === T_SOLID) {
          const s = r;
          while (r <= r1 && w.get(c, r) === T_SOLID) r++;
          ctx.fillRect(c * TILE, s * TILE, TILE + 0.6, (r - s) * TILE);
        } else r++;
      }
    }
    const t = this.lavaT;
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const tt = w.get(c, r);
        if (!tt) continue;
        const x = c * TILE, y = r * TILE;
        if (tt === T_SOLID) {
          const above = w.get(c, r - 1);
          const surf = above !== T_SOLID && above !== T_ICE;
          if (surf) {
            ctx.fillStyle = R.top;
            ctx.fillRect(x, y, TILE + 0.6, 7);
            ctx.fillStyle = R.topDark;
            ctx.fillRect(x, y + 7, TILE + 0.6, 3);
            const h = hash2(c, r);
            ctx.fillStyle = R.top;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
              const bx = x + 3 + i * 8 + h * 3;
              ctx.moveTo(bx, y + 1);
              ctx.lineTo(bx + 2, y - 3 - ((h * 7 + i * 3) % 3));
              ctx.lineTo(bx + 4, y + 1);
            }
            ctx.fill();
          } else if (hash2(c * 7, r * 3) < 0.28) {
            ctx.fillStyle = 'rgba(0,0,0,0.16)';
            const h = hash2(c, r * 5);
            ctx.fillRect(x + 6 + h * 14, y + 8 + h * 10, 6, 4);
          }
          if (w.get(c - 1, r) === T_EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, y, 2, TILE); }
          if (w.get(c + 1, r) === T_EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + TILE - 2, y, 2, TILE); }
        } else if (tt === T_ICE) {
          ctx.fillStyle = '#9fd8f5';
          ctx.fillRect(x, y, TILE + 0.6, TILE);
          ctx.fillStyle = '#e1f5fe';
          ctx.fillRect(x, y, TILE + 0.6, 4);
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.beginPath();
          ctx.moveTo(x + 6, y + 26); ctx.lineTo(x + 12, y + 26); ctx.lineTo(x + 24, y + 8); ctx.lineTo(x + 18, y + 8);
          ctx.fill();
          ctx.strokeStyle = 'rgba(79,145,190,0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else if (tt === T_PLAT) {
          ctx.fillStyle = R.plat;
          ctx.fillRect(x, y, TILE + 0.6, 10);
          ctx.fillStyle = shade(R.plat, 0.25);
          ctx.fillRect(x, y, TILE + 0.6, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(x, y + 8, TILE + 0.6, 2);
          ctx.fillRect(x + TILE - 1, y + 1, 1, 8);
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.fillRect(x + 4, y + 4, 2, 2);
          ctx.fillRect(x + 26, y + 4, 2, 2);
        } else if (tt === T_SPIKE) {
          ctx.fillStyle = '#b0bec5';
          ctx.strokeStyle = '#37474f';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            ctx.moveTo(x + i * 10.67, y + TILE);
            ctx.lineTo(x + i * 10.67 + 5.33, y + 12);
            ctx.lineTo(x + (i + 1) * 10.67, y + TILE);
          }
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#eceff1';
          for (let i = 0; i < 3; i++) ctx.fillRect(x + i * 10.67 + 4.5, y + 14, 1.5, 5);
        } else if (tt === T_LAVA) {
          ctx.fillStyle = '#d84315';
          ctx.fillRect(x, y + 6, TILE + 0.6, TILE - 6);
          ctx.fillStyle = '#ff9800';
          ctx.beginPath();
          ctx.moveTo(x, y + TILE);
          for (let i = 0; i <= 4; i++) ctx.lineTo(x + i * 8, y + 6 + Math.sin(t * 3 + (c * 4 + i) * 0.9) * 2.5);
          ctx.lineTo(x + TILE + 0.6, y + TILE);
          ctx.fill();
          ctx.fillStyle = '#ffe082';
          ctx.fillRect(x + ((t * 20 + c * 13) % 28), y + 12 + ((c * 7) % 10), 3, 2);
          if (Math.random() < 0.01) this.fx.add({ type: 'dot', x: x + rand(0, 32), y: y + 6, vx: rand(-20, 20), vy: rand(-160, -80), g: 300, life: 0.6, color: '#ffab40', size: 3 });
        }
      }
    }
  }

  drawBridges(ctx, camX) {
    for (const b of this.L.bridges) {
      const x0 = b.c0 * TILE, x1 = b.c1 * TILE;
      if (x1 < camX - 50 || x0 > camX + Game.W + 50) continue;
      ctx.strokeStyle = '#8d6e63';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, b.y - 22);
      ctx.quadraticCurveTo((x0 + x1) / 2, b.y - 6, x1, b.y - 22);
      ctx.stroke();
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(x0 - 3, b.y - 26, 5, 28);
      ctx.fillRect(x1 - 2, b.y - 26, 5, 28);
      ctx.strokeStyle = 'rgba(141,110,99,0.7)';
      ctx.lineWidth = 1;
      for (let x = x0 + 16; x < x1; x += 16) {
        const t = (x - x0) / (x1 - x0);
        const ry = b.y - 22 + 16 * 4 * t * (1 - t) * 1;
        ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, b.y); ctx.stroke();
      }
    }
  }

  drawDecor(ctx, camX) {
    const t = this.time;
    for (const d of this.L.decor) {
      if (d.x < camX - 40 || d.x > camX + Game.W + 40) continue;
      const x = d.x, y = d.y, s = d.s;
      switch (d.type) {
        case 'grass':
          ctx.strokeStyle = this.region.topDark;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = -1; i <= 1; i++) { ctx.moveTo(x + i * 3, y); ctx.lineTo(x + i * 4 + Math.sin(t * 2 + d.v * 9) * 1.5, y - 8 * s); }
          ctx.stroke();
          break;
        case 'flower':
          ctx.strokeStyle = '#388e3c'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 9 * s); ctx.stroke();
          ctx.fillStyle = ['#ff4081', '#ffeb3b', '#e1f5fe', '#ff7043'][Math.floor(d.v * 4)];
          ctx.beginPath(); ctx.arc(x, y - 10 * s, 3 * s, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff59d'; ctx.beginPath(); ctx.arc(x, y - 10 * s, 1.2 * s, 0, TAU); ctx.fill();
          break;
        case 'rock':
          ctx.fillStyle = '#90a4ae';
          ctx.beginPath(); ctx.ellipse(x, y - 3 * s, 7 * s, 5 * s, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath(); ctx.ellipse(x - 2 * s, y - 5 * s, 2.5 * s, 1.5 * s, 0, 0, TAU); ctx.fill();
          break;
        case 'bush':
          ctx.fillStyle = '#43a047';
          ctx.beginPath(); ctx.arc(x - 6 * s, y - 5 * s, 6 * s, 0, TAU); ctx.arc(x + 5 * s, y - 5 * s, 7 * s, 0, TAU); ctx.arc(x, y - 10 * s, 7 * s, 0, TAU); ctx.fill();
          break;
        case 'mushroom':
          ctx.fillStyle = '#efebe9'; ctx.fillRect(x - 2 * s, y - 8 * s, 4 * s, 8 * s);
          ctx.fillStyle = d.v > 0.5 ? '#e53935' : '#8e24aa';
          ctx.beginPath(); ctx.ellipse(x, y - 8 * s, 8 * s, 6 * s, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillRect(x - 4 * s, y - 11 * s, 2, 2); ctx.fillRect(x + 2 * s, y - 12 * s, 2, 2);
          break;
        case 'fern':
          ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = 1.5;
          for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sd * 4 * s, y - 12 * s, x + sd * 10 * s, y - 10 * s); ctx.stroke(); }
          break;
        case 'stump':
          ctx.fillStyle = '#6d4c41'; ctx.fillRect(x - 7 * s, y - 9 * s, 14 * s, 9 * s);
          ctx.fillStyle = '#a1887f'; ctx.beginPath(); ctx.ellipse(x, y - 9 * s, 7 * s, 2.5 * s, 0, 0, TAU); ctx.fill();
          break;
        case 'cactus':
          ctx.fillStyle = '#558b2f';
          ctx.fillRect(x - 3 * s, y - 22 * s, 6 * s, 22 * s);
          ctx.fillRect(x - 10 * s, y - 16 * s, 4 * s, 8 * s); ctx.fillRect(x - 10 * s, y - 10 * s, 8 * s, 3 * s);
          ctx.fillRect(x + 6 * s, y - 19 * s, 4 * s, 8 * s); ctx.fillRect(x + 2 * s, y - 13 * s, 8 * s, 3 * s);
          break;
        case 'bones':
          ctx.fillStyle = '#efebe9';
          ctx.fillRect(x - 7 * s, y - 3 * s, 14 * s, 2 * s);
          ctx.beginPath(); ctx.arc(x + 9 * s, y - 4 * s, 3.5 * s, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3e2723'; ctx.fillRect(x + 8 * s, y - 5 * s, 1.5, 1.5);
          break;
        case 'snowpile':
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(x, y, 10 * s, 5 * s, 0, Math.PI, 0); ctx.fill();
          break;
        case 'pine':
          ctx.fillStyle = '#2e5d4b';
          ctx.fillRect(x - 1.5, y - 6 * s, 3, 6 * s);
          ctx.beginPath(); ctx.moveTo(x - 8 * s, y - 5 * s); ctx.lineTo(x, y - 26 * s); ctx.lineTo(x + 8 * s, y - 5 * s); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 3 * s, y - 19 * s); ctx.lineTo(x, y - 26 * s); ctx.lineTo(x + 3 * s, y - 19 * s); ctx.fill();
          break;
        case 'crystal':
          ctx.fillStyle = 'rgba(128,222,234,0.85)';
          ctx.beginPath(); ctx.moveTo(x - 5 * s, y); ctx.lineTo(x - 3 * s, y - 14 * s); ctx.lineTo(x, y - 18 * s); ctx.lineTo(x + 3 * s, y - 12 * s); ctx.lineTo(x + 5 * s, y); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - 1, y - 14 * s, 1.5, 10 * s);
          break;
        case 'lavarock':
          ctx.fillStyle = '#212121';
          ctx.beginPath(); ctx.ellipse(x, y - 3 * s, 8 * s, 6 * s, 0, Math.PI, 0); ctx.fill();
          ctx.strokeStyle = `rgba(255,111,0,${0.6 + Math.sin(t * 3 + d.v * 10) * 0.3})`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 2); ctx.lineTo(x, y - 6 * s); ctx.lineTo(x + 3 * s, y - 3); ctx.stroke();
          break;
        case 'torch': {
          ctx.fillStyle = '#5d4037'; ctx.fillRect(x - 1.5, y - 22 * s, 3, 22 * s);
          const fl = Math.sin(t * 15 + d.v * 20) * 1.5;
          const g = ctx.createRadialGradient(x, y - 26 * s, 1, x, y - 26 * s, 26);
          g.addColorStop(0, 'rgba(255,183,77,0.45)'); g.addColorStop(1, 'rgba(255,183,77,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 26 * s, 26, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ff9800'; ctx.beginPath(); ctx.ellipse(x, y - 26 * s + fl * 0.3, 3.5, 6 + fl, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.ellipse(x, y - 25 * s, 1.8, 3, 0, 0, TAU); ctx.fill();
          break;
        }
        case 'banner':
          ctx.fillStyle = '#424242'; ctx.fillRect(x - 1, y - 34 * s, 2, 34 * s);
          ctx.fillStyle = '#6a1b9a';
          ctx.beginPath(); ctx.moveTo(x + 1, y - 33 * s); ctx.lineTo(x + 13 * s + Math.sin(t * 2 + d.v) * 1.5, y - 31 * s); ctx.lineTo(x + 11 * s, y - 18 * s); ctx.lineTo(x + 6 * s, y - 21 * s); ctx.lineTo(x + 1, y - 18 * s); ctx.fill();
          break;
        case 'skull':
          ctx.fillStyle = '#e0e0e0';
          ctx.beginPath(); ctx.arc(x, y - 5 * s, 5 * s, 0, TAU); ctx.fill();
          ctx.fillRect(x - 3 * s, y - 2 * s, 6 * s, 3 * s);
          ctx.fillStyle = '#212121'; ctx.fillRect(x - 3 * s, y - 6 * s, 2, 2); ctx.fillRect(x + 1 * s, y - 6 * s, 2, 2);
          break;
      }
    }
  }

  drawHUD(ctx, W, H) {
    const P = this.player;
    const L = Input.safeL;
    const x = L + 10, y = 8;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,12,20,0.72)';
    roundRect(ctx, x, y, 182, 56, 9);
    ctx.fill();
    // level badge
    ctx.fillStyle = '#ffd740';
    ctx.beginPath(); ctx.arc(x + 20, y + 22, 14, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '900 12px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(SAVE.lvl, x + 20, y + 23);
    ctx.font = '700 7px system-ui,sans-serif';
    ctx.fillText('LV', x + 20, y + 13);
    // HP
    const bx = x + 40, bw = 132;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, bx, y + 7, bw, 13, 4); ctx.fill();
    const hpF = clamp(P.hp / P.maxHp, 0, 1);
    ctx.fillStyle = hpF > 0.5 ? '#66bb6a' : hpF > 0.25 ? '#ffca28' : '#ef5350';
    if (hpF > 0) { roundRect(ctx, bx + 1, y + 8, (bw - 2) * hpF, 11, 3); ctx.fill(); }
    ctx.fillStyle = '#fff';
    ctx.font = '800 9px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('HP ' + Math.ceil(P.hp) + '/' + P.maxHp, bx + 5, y + 14);
    // Energy
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, bx, y + 23, bw, 9, 3); ctx.fill();
    const enF = clamp(P.en / P.maxEn, 0, 1);
    ctx.fillStyle = '#29b6f6';
    if (enF > 0) { roundRect(ctx, bx + 1, y + 24, (bw - 2) * enF, 7, 2); ctx.fill(); }
    ctx.fillStyle = '#e1f5fe';
    ctx.font = '800 7px system-ui,sans-serif';
    ctx.fillText('EN ' + Math.floor(P.en), bx + 5, y + 28);
    // XP
    const xpF = clamp(SAVE.xp / xpNeed(SAVE.lvl), 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx, y + 36, bw, 4);
    ctx.fillStyle = '#ffd740';
    ctx.fillRect(bx, y + 36, bw * xpF, 4);
    // coins
    drawCoinIcon(ctx, bx + 6, y + 48, 5, 0);
    ctx.fillStyle = '#ffe082';
    ctx.font = '800 10px system-ui,sans-serif';
    ctx.fillText(fmtNum(SAVE.coins), bx + 14, y + 48);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '700 9px system-ui,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('KO ' + this.stats.kills, bx + bw, y + 48);
    // stage name
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '800 10px system-ui,sans-serif';
    const topLabel = this.arena && !this.arena.boss ? (this.arena.endless ? `WAVE ${this.arena.wave}  ·  BEST ${SAVE.arenaBest}` : `WAVE ${this.arena.wave + 1}/${this.arena.waves.length}`) : this.def.name;
    ctx.fillText(topLabel, W / 2, 14);
    // combo counter
    if (P.hitChain >= 3) {
      const k = clamp(P.hitChainT / 1.8, 0, 1);
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.textAlign = 'right';
      ctx.font = '900 26px system-ui,sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      const cx = W - Input.safeR - 16, cy = H * 0.34;
      ctx.strokeText(P.hitChain, cx - 42, cy);
      ctx.fillStyle = P.hitChain >= 20 ? '#ff5252' : P.hitChain >= 10 ? '#ffd740' : '#ffffff';
      ctx.fillText(P.hitChain, cx - 42, cy);
      ctx.font = '900 12px system-ui,sans-serif';
      ctx.strokeText('HITS', cx, cy + 2);
      ctx.fillText('HITS', cx, cy + 2);
      ctx.globalAlpha = 1;
    }
    // boss bar
    const B = this.boss;
    if (B && !B.dead && (B.state !== 'intro' || B.st > 0.8)) {
      const w = Math.min(360, W * 0.5);
      const bx2 = W / 2 - w / 2, by2 = 26;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      roundRect(ctx, bx2 - 4, by2 - 2, w + 8, 20, 6); ctx.fill();
      const f = clamp(B.hp / B.maxHp, 0, 1);
      ctx.fillStyle = B.phase === 2 ? '#ff1744' : '#e53935';
      ctx.fillRect(bx2, by2 + 9, w * f, 7);
      ctx.fillStyle = 'rgba(255,215,64,0.8)';
      ctx.fillRect(bx2, by2 + 16, w * clamp(B.stagger, 0, 1), 2);
      ctx.fillStyle = '#fff';
      ctx.font = '900 9px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(B.name, W / 2, by2 + 4);
    }
    // banner
    if (this.banner) {
      const b = this.banner;
      const a = b.t < 0.25 ? b.t / 0.25 : b.t > b.dur - 0.4 ? (b.dur - b.t) / 0.4 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      const sc = b.t < 0.25 ? 1.3 - b.t * 1.2 : 1;
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.round((b.big ? 34 : 26) * sc)}px system-ui,sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      const by = H * 0.3;
      ctx.strokeText(b.text, W / 2, by);
      ctx.fillStyle = b.big ? '#ffd740' : '#ffffff';
      ctx.fillText(b.text, W / 2, by);
      if (b.sub) {
        ctx.font = '700 13px system-ui,sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeText(b.sub, W / 2, by + 26);
        ctx.fillStyle = '#e0e0e0';
        ctx.fillText(b.sub, W / 2, by + 26);
      }
      ctx.globalAlpha = 1;
    }
    if (!Input.touchMode && this.time < 12 && this.state === 'play') {
      ctx.globalAlpha = clamp(12 - this.time, 0, 1) * 0.85;
      ctx.textAlign = 'center';
      ctx.font = '700 10px system-ui,sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const txt = 'Move: Arrows/WASD · Jump: Space/K · Attack: J · Dash: L/Shift · Skills: I, O · Potion: Q · Pause: Esc';
      const tw = ctx.measureText(txt).width + 16;
      roundRect(ctx, W / 2 - tw / 2, H - 26, tw, 18, 6); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(txt, W / 2, H - 17);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
