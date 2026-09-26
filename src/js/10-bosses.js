// ---------- Bosses ----------
class Boss {
  constructor(scene, kind, arena, w, h) {
    const B = BOSSES[kind];
    this.scene = scene;
    this.kind = kind;
    this.B = B;
    this.isBoss = true;
    this.name = B.name;
    this.title = B.title;
    this.maxHp = B.hp;
    this.hp = B.hp;
    this.dmg = B.dmg;
    this.arena = arena;
    this.ax0 = arena.x0;
    this.ax1 = arena.x1;
    this.gy = arena.gy;
    this.w = w;
    this.h = h;
    this.x = arena.x1 - 150 - w / 2;
    this.y = arena.gy - h;
    this.vx = 0; this.vy = 0; this.facing = -1;
    this.onGround = false; this.plat = null;
    this.state = 'intro'; this.st = 0; this.t = 0;
    this.flash = 0; this.dead = false;
    this.phase = 1; this.stagger = 0; this.freezeT = 0;
    this.hidden = false; this.alpha = 1;
    this.last = '';
    this.didHit = false;
    this.T = { color: '#fff', ai: 'boss' };
    this.hpShow = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get feet() { return this.y + this.h; }
  get P() { return this.scene.player; }
  setState(s) { this.state = s; this.st = 0; this.didHit = false; this.n = 0; }
  spd() { return this.phase === 2 ? 1.25 : 1; }
  pick(opts) {
    const f = opts.filter((o) => o[0] !== this.last && o[1] > 0);
    const c = new RNG((Math.random() * 1e9) | 0).weighted(f.length ? f : opts);
    this.last = c;
    return c;
  }
  face() { this.facing = sign(this.P.cx - this.cx) || this.facing; }
  update(dt) {
    this.t += dt;
    this.st += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.stagger = Math.max(0, this.stagger - dt * 0.04);
    if (this.dead) return;
    if (this.state === 'intro') {
      this.introUpdate(dt);
      if (this.st > 2.0) this.setState('idle');
      return;
    }
    if (this.state === 'stagger') {
      this.vx = approach(this.vx, 0, 600 * dt);
      this.staggerUpdate(dt);
      if (this.st > 1.6) this.setState('idle');
      return;
    }
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      this.staggerUpdate(dt);
      return;
    }
    this.think(dt);
  }
  introUpdate(dt) { this.face(); this.phys(dt, true); }
  staggerUpdate(dt) { this.phys(dt, true); }
  phys(dt, gravity) {
    if (gravity) this.vy = Math.min(this.vy + GRAVITY * dt, 1000);
    moveActor(this, dt, this.scene.world, null);
    this.clampArena();
  }
  clampArena() {
    if (this.x < this.ax0 + 2) { this.x = this.ax0 + 2; this.hitEdge = -1; }
    else if (this.x + this.w > this.ax1 - 2) { this.x = this.ax1 - 2 - this.w; this.hitEdge = 1; }
    else this.hitEdge = 0;
  }
  contact(mul = 1, kb = 320) {
    const P = this.P;
    if (!this.hidden && overlap(this, P)) this.scene.hitPlayer(this, this.dmg * mul, this.cx, kb);
  }
  takeHit(h) {
    if (this.dead || this.state === 'intro' || this.hidden) return false;
    const S = this.scene;
    if (this.parry && this.parry(h)) return 'block';
    const dmg = Math.max(1, Math.round(h.dmg * (this.state === 'stagger' ? 1.25 : 1)));
    h.dealt = dmg;
    this.hp -= dmg;
    this.flash = 0.1;
    if (h.freeze) this.freezeT = Math.max(this.freezeT, 0.5);
    if (this.state !== 'stagger') {
      this.stagger += (dmg / this.maxHp) * (h.heavy ? 8 : 5.5);
      if (this.stagger >= 1) {
        this.stagger = 0;
        this.onStagger();
        this.setState('stagger');
        this.hidden = false;
        this.alpha = 1;
        this.vx = h.dir * 120;
        S.fx.text(this.cx, this.y - 20, 'STAGGERED!', '#ffd740', 16, { life: 1.2 });
        Sound.play('hitHeavy');
      }
    }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2;
      S.fx.text(this.cx, this.y - 34, 'ENRAGED!', '#ff5252', 18, { life: 1.4 });
      Sound.play('roar');
      S.shake(8, 0.6);
      S.fx.flash('#ff5252', 0.3);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      S.onBossDefeated(this);
    }
    return 'hit';
  }
  onStagger() {}
  deathSkel() { return null; }
  alert(ctx, x, y) {
    ctx.fillStyle = '#ff1744';
    ctx.font = '900 20px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', x, y);
  }
}

// ----- BIG BRUTO -----
class BossBruto extends Boss {
  constructor(scene, arena) { super(scene, 'bruto', arena, 44, 100); this.s = 2.2; }
  think(dt) {
    const S = this.scene, P = this.P;
    const dx = P.cx - this.cx, adx = Math.abs(dx);
    const k = this.spd();
    switch (this.state) {
      case 'idle':
        this.face();
        this.vx = approach(this.vx, adx > 90 ? this.facing * 75 * k : 0, 600 * dt);
        this.phys(dt, true);
        if (this.st > (this.phase === 2 ? 0.55 : 0.95)) {
          if (adx < 125) this.setState('swing');
          else this.setState(this.pick([['chargePrep', 3], ['poundPrep', 3], ['swing', adx < 200 ? 1 : 0]]));
        }
        break;
      case 'swing':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.phys(dt, true);
        if (this.st > 0.6 / k && !this.didHit) {
          this.didHit = true;
          Sound.play('swingHeavy');
          S.shake(6, 0.2);
          const hb = { x: this.facing > 0 ? this.cx : this.cx - 125, y: this.y, w: 125, h: this.h };
          S.hitPlayer(hb, this.dmg, this.cx, 420);
          S.fx.slash(this.cx, this.y + 40, 80, -2.0, 0.8, this.facing, 'rgba(255,255,255,0.8)', 10, 0.2);
        }
        if (this.st > 1.1 / k) this.setState('idle');
        break;
      case 'chargePrep':
        this.face();
        this.vx = 0;
        this.phys(dt, true);
        if (this.st < dt * 1.5) Sound.play('warn');
        if (Math.random() < 0.3) S.fx.dust(this.cx - this.facing * 20, this.feet, 1);
        if (this.st > 0.75 / k) { this.setState('charge'); Sound.play('roar'); }
        break;
      case 'charge':
        this.vx = this.facing * 440 * k;
        this.phys(dt, true);
        this.contact(1, 460);
        if (Math.random() < 0.6) S.fx.dust(this.cx - this.facing * 20, this.feet, 1);
        if (this.hitEdge || this.hitWall || this.st > 2.4) {
          S.shake(10, 0.4);
          Sound.play('hitHeavy');
          S.fx.shards(this.cx + this.facing * 24, this.y + 30, '#9e9e9e', 8, 260, 6);
          this.setState('dizzy');
          this.vx = -this.facing * 120;
          this.vy = -200;
        }
        break;
      case 'dizzy':
        this.vx = approach(this.vx, 0, 400 * dt);
        this.phys(dt, true);
        if (this.st > (this.phase === 2 ? 1.1 : 1.6)) this.setState('idle');
        break;
      case 'poundPrep':
        this.face();
        this.vx = 0;
        this.phys(dt, true);
        if (this.st > 0.35 / k) {
          this.vy = -820;
          this.vx = clamp((P.cx - this.cx) / 0.9, -420, 420);
          this.onGround = false;
          this.setState('poundAir');
        }
        break;
      case 'poundAir':
        this.phys(dt, true);
        if (this.onGround && this.st > 0.1) {
          S.shake(10, 0.4);
          Sound.play('quake');
          S.fx.dust(this.cx - 20, this.feet, 8);
          S.fx.dust(this.cx + 20, this.feet, 8);
          S.fx.ring(this.cx, this.feet, 10, 90, 'rgba(255,255,255,0.7)', 0.4, 5);
          S.hitPlayer({ x: this.cx - 60, y: this.feet - 30, w: 120, h: 30 }, this.dmg, this.cx, 360);
          for (const d of [-1, 1]) S.addProjectile(new Projectile({ type: 'shock', x: this.cx + d * 30, y: this.feet, vx: d * 330, dmg: Math.round(this.dmg * 0.8), life: 1.4, r: 14, hgt: 34 }));
          if (this.phase === 2) {
            for (let i = 0; i < 4; i++) {
              const x = rand(this.ax0 + 40, this.ax1 - 40);
              S.addProjectile(new Projectile({ type: 'marker', kind: 'rock', x, tx: x, y: S.cam.y - 40, vx: 0, vy: 100, g: 900, gy: this.gy, r: 10, dmg: Math.round(this.dmg * 0.7), boom: 38, delay: 0.3 + i * 0.2, life: 6 }));
            }
          }
          this.vx = 0;
          this.setState('recover');
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.phys(dt, true);
        if (this.st > 0.8 / k) this.setState('idle');
        break;
      default: this.setState('idle');
    }
  }
  pose() {
    switch (this.state) {
      case 'swing': {
        const w = 0.6 / this.spd();
        if (this.st < w) return lerpPose(PZ.stand, mkPose(-0.2, 0.6, 1.3, 3.6, 0.3, -0.35, 0.05, 0.4, -0.3), easeOut(this.st / w));
        return mkPose(0.45, 0.3, 1.0, 1.0, 0.1, -0.6, 0.1, 0.7, -0.6);
      }
      case 'chargePrep': return mkPose(0.5, -0.4, 0.8, -0.2, 0.8, -0.4, -0.6, 0.9, -1.2);
      case 'charge': return runPose(this.t * 16, 0.6);
      case 'dizzy': case 'stagger': return lerpPose(PZ.stand, PZ.hurt, 0.4 + Math.sin(this.t * 6) * 0.15);
      case 'poundPrep': return PZ.crouch;
      case 'poundAir': return this.vy < 0 ? PZ.castUp : ATTACKS.fist.slam;
      case 'recover': return PZ.crouch;
      case 'intro': return this.st > 1 ? PZ.castUp : PZ.stand;
    }
    return Math.abs(this.vx) > 10 ? walkPose(this.t * 5) : idlePose(this.t);
  }
  deathSkel() { return skel(this.cx, this.feet, this.facing, this.s, PZ.hurt, true); }
  draw(ctx) {
    const k = skel(this.cx, this.feet, this.facing, this.s, this.pose(), this.onGround);
    drawShadowEllipse(ctx, this.cx, this.gy, 34, 0.3);
    const col = this.flash > 0 ? '#ffffff' : this.freezeT > 0 ? '#b3e5fc' : '#8d2a1a';
    if (this.state === 'chargePrep' || (this.state === 'swing' && this.st < 0.6 / this.spd() && this.st > 0.3)) {
      ctx.globalAlpha = 0.5;
      drawStick(ctx, k, '#ff1744', { lw: 6 });
      ctx.globalAlpha = 1;
    }
    drawStick(ctx, k, col, { outline: 'rgba(0,0,0,0.4)', back: '#5d1a10', eye: '#ffeb3b', angry: true });
    // horned helmet
    ctx.fillStyle = '#616161';
    ctx.beginPath(); ctx.arc(k.headX, k.headY, k.hr + 2, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#eeeeee';
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(k.headX + sd * k.hr, k.headY - 4);
      ctx.quadraticCurveTo(k.headX + sd * (k.hr + 12), k.headY - 10, k.headX + sd * (k.hr + 8), k.headY - 24);
      ctx.lineTo(k.headX + sd * (k.hr - 2), k.headY - 8);
      ctx.fill();
    }
    drawWeapon(ctx, k, 'club', this.t);
    if (this.state === 'dizzy' || this.state === 'stagger') {
      for (let i = 0; i < 4; i++) {
        const a = this.t * 5 + (i * TAU) / 4;
        ctx.fillStyle = '#ffeb3b';
        ctx.fillRect(k.headX + Math.cos(a) * 20 - 3, k.headY - 26 + Math.sin(a) * 5 - 3, 6, 6);
      }
    }
    if (this.state === 'chargePrep' || this.state === 'poundPrep') this.alert(ctx, k.headX, k.headY - 34);
  }
}

// ----- ARACHNA (spider queen) -----
class BossSpider extends Boss {
  constructor(scene, arena) { super(scene, 'spider', arena, 90, 52); }
  think(dt) {
    const S = this.scene, P = this.P;
    const dx = P.cx - this.cx, adx = Math.abs(dx);
    const k = this.spd();
    switch (this.state) {
      case 'idle': {
        this.face();
        const want = adx > 190 ? this.facing : adx < 120 ? -this.facing : 0;
        this.vx = approach(this.vx, want * 120 * k, 700 * dt);
        this.phys(dt, true);
        if (this.st > (this.phase === 2 ? 0.6 : 1.0)) {
          const spiders = S.enemies.filter((e) => !e.dead && e.type === 'spider').length;
          this.setState(this.pick([['web', 3], ['lunge', adx < 260 ? 3 : 1], ['climb', 2], ['summon', spiders < 3 ? 1.5 : 0]]));
        }
        break;
      }
      case 'web':
        this.face();
        this.vx = approach(this.vx, 0, 900 * dt);
        this.phys(dt, true);
        if (this.st > 0.5 / k && !this.didHit) {
          this.didHit = true;
          const n = this.phase === 2 ? 5 : 3;
          const base = Math.atan2(P.cy - (this.y + 10), P.cx - (this.cx + this.facing * 40));
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.22;
            S.addProjectile(new Projectile({ type: 'web', x: this.cx + this.facing * 40, y: this.y + 10, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 8, dmg: Math.round(this.dmg * 0.6), slow: 2.0, destroyable: true, life: 2.5 }));
          }
          Sound.play('shoot');
        }
        if (this.st > 1.0 / k) this.setState('idle');
        break;
      case 'lunge':
        if (this.st < 0.45 / k) {
          this.face();
          this.vx = approach(this.vx, 0, 900 * dt);
        } else if (this.st < 0.45 / k + 0.5) {
          if (!this.didHit) { this.didHit = true; Sound.play('dash'); }
          this.vx = this.facing * 540 * k;
          this.contact(1, 380);
        } else this.vx = approach(this.vx, 0, 1200 * dt);
        this.phys(dt, true);
        if (this.st > 0.45 / k + 1.0) this.setState('idle');
        break;
      case 'climb':
        this.vx = 0;
        this.vy = -650;
        moveActor(this, dt, S.world, null);
        if (this.y < S.cam.y - 140 || this.st > 1.2) {
          this.hidden = true;
          this.setState('hang');
        }
        break;
      case 'hang': {
        this.hidden = true;
        this.vy = 0;
        this.y = S.cam.y - 160;
        this.x = approach(this.x, P.cx - this.w / 2, 260 * k * dt);
        this.clampArena();
        if (this.st > 1.3 / k) { this.setState('drop'); this.hidden = false; this.vy = 200; Sound.play('warn'); }
        break;
      }
      case 'drop':
        this.hidden = false;
        this.vy = Math.min(this.vy + 2600 * dt, 1300);
        this.y += this.vy * dt;
        this.contact(1.2, 300);
        if (this.y + this.h >= this.gy) {
          this.y = this.gy - this.h;
          this.vy = 0;
          this.onGround = true;
          S.shake(9, 0.35);
          Sound.play('quake');
          S.fx.dust(this.cx, this.feet, 10);
          for (const d of [-1, 1]) S.addProjectile(new Projectile({ type: 'shock', x: this.cx + d * 40, y: this.feet, vx: d * 300, dmg: Math.round(this.dmg * 0.7), life: 1.0, r: 14, hgt: 26 }));
          this.setState('recover');
        }
        break;
      case 'summon':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.phys(dt, true);
        if (this.st > 0.6 && !this.didHit) {
          this.didHit = true;
          const n = this.phase === 2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const e = S.spawnEnemy('spider', this.cx + (i - (n - 1) / 2) * 40, this.feet, { aggro: true, drop: true });
            e.vy = -300;
            e.vx = rand(-150, 150);
          }
          Sound.play('magic');
          S.fx.smoke(this.cx, this.cy, 8, 'rgba(120,80,60,0.5)');
        }
        if (this.st > 1.1) this.setState('idle');
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.phys(dt, true);
        if (this.st > 1.0 / k) this.setState('idle');
        break;
      default: this.setState('idle');
    }
  }
  onStagger() { if (this.state === 'hang' || this.state === 'climb') { this.y = this.gy - this.h - 80; this.vy = 0; } }
  draw(ctx) {
    const S = this.scene;
    if (this.state === 'hang') {
      const x = this.cx;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, S.cam.y); ctx.lineTo(x, S.cam.y + 40); ctx.stroke();
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 14);
      ctx.fillStyle = `rgba(255,23,68,${0.25 + pulse * 0.25})`;
      ctx.beginPath(); ctx.ellipse(x, this.gy, 50, 8, 0, 0, TAU); ctx.fill();
      return;
    }
    if (this.state === 'climb' || this.state === 'drop') {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(this.cx, S.cam.y - 10); ctx.lineTo(this.cx, this.y + 10); ctx.stroke();
    }
    drawShadowEllipse(ctx, this.cx, this.gy, 50, 0.3);
    const col = this.flash > 0 ? '#ffffff' : this.freezeT > 0 ? '#b3e5fc' : '#3e2723';
    ctx.save();
    const moving = Math.abs(this.vx) > 20;
    ctx.translate(this.cx, this.feet);
    const rear = this.state === 'web' || (this.state === 'lunge' && this.st < 0.45 / this.spd());
    if (rear) ctx.rotate(-this.facing * 0.2);
    drawSpider(ctx, 0, 0, 3.2, this.t, col, this.facing, moving || this.state === 'drop', false);
    // crown & glowing eyes
    const hx = this.facing * 16, hy = -32;
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.moveTo(hx - 10, hy - 10); ctx.lineTo(hx - 8, hy - 20); ctx.lineTo(hx - 3, hy - 13); ctx.lineTo(hx, hy - 22);
    ctx.lineTo(hx + 3, hy - 13); ctx.lineTo(hx + 8, hy - 20); ctx.lineTo(hx + 10, hy - 10);
    ctx.fill();
    ctx.fillStyle = this.phase === 2 ? '#ff1744' : '#ff5252';
    for (let i = 0; i < 3; i++) ctx.fillRect(hx + this.facing * (6 + i * 3) - 2, hy - 4 + (i % 2) * 3, 3, 3);
    // abdomen pattern
    ctx.fillStyle = 'rgba(255,82,82,0.8)';
    ctx.beginPath(); ctx.moveTo(-this.facing * 20, -40); ctx.lineTo(-this.facing * 14, -30); ctx.lineTo(-this.facing * 20, -20); ctx.lineTo(-this.facing * 26, -30); ctx.fill();
    ctx.restore();
    if (this.state === 'lunge' && this.st < 0.45 / this.spd()) this.alert(ctx, this.cx, this.y - 16);
  }
}

// ----- SETH-RA (pharaoh) -----
class BossPharaoh extends Boss {
  constructor(scene, arena) { super(scene, 'pharaoh', arena, 30, 76); this.s = 1.6; this.hover = 44; }
  think(dt) {
    const S = this.scene, P = this.P;
    const dx = P.cx - this.cx, adx = Math.abs(dx);
    const k = this.spd();
    const floatY = this.gy - this.h - this.hover + Math.sin(this.t * 2) * 8;
    this.y = approach(this.y, floatY, 200 * dt);
    this.onGround = false;
    switch (this.state) {
      case 'idle': {
        this.face();
        const want = adx > 260 ? this.facing : adx < 170 ? -this.facing : 0;
        this.vx = approach(this.vx, want * 110 * k, 500 * dt);
        this.x += this.vx * dt;
        this.clampArena();
        if (this.hitEdge && adx < 170) { this.setState('tpOut'); break; }
        if (this.st > (this.phase === 2 ? 0.7 : 1.0)) {
          const mummies = S.enemies.filter((e) => !e.dead && e.type === 'mummy').length;
          this.setState(this.pick([['orbs', 3], ['tornado', 2], ['summon', mummies < 2 ? 1.2 : 0], ['tpOut', 1.5], ['beams', this.phase === 2 ? 2.5 : 0]]));
        }
        break;
      }
      case 'tpOut':
        this.alpha = 1 - this.st / 0.35;
        if (this.st > 0.35) {
          let nx = this.cx;
          for (let i = 0; i < 10; i++) {
            nx = rand(this.ax0 + 60, this.ax1 - 60);
            if (Math.abs(nx - P.cx) > 170) break;
          }
          this.x = nx - this.w / 2;
          this.hidden = true;
          S.fx.smoke(this.cx, this.cy, 8, 'rgba(255,213,79,0.5)');
          Sound.play('teleport');
          this.setState('tpIn');
        }
        break;
      case 'tpIn':
        this.hidden = this.st < 0.15;
        this.alpha = this.st / 0.35;
        if (this.st > 0.35) { this.alpha = 1; this.hidden = false; this.setState('idle'); this.st = 0.5; }
        break;
      case 'orbs':
        this.face();
        this.vx = 0;
        if (this.st > 0.6 / k && !this.didHit) {
          this.didHit = true;
          const n = this.phase === 2 ? 7 : 5;
          const sx = this.cx + this.facing * 16, sy = this.y + 6;
          const base = Math.atan2(P.cy - sy, P.cx - sx);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.2;
            S.addProjectile(new Projectile({ type: 'sandorb', x: sx, y: sy, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, r: 7, dmg: Math.round(this.dmg * 0.7), destroyable: true, life: 3 }));
          }
          Sound.play('magic');
        }
        if (this.st > 1.1 / k) this.setState('idle');
        break;
      case 'tornado':
        this.vx = 0;
        if (this.st > 0.5 / k && !this.didHit) {
          this.didHit = true;
          const dirs = this.phase === 2 ? [-1, 1] : [sign(dx) || 1];
          for (const d of dirs) S.addProjectile(new Projectile({ type: 'tornado', x: this.cx + d * 20, y: this.gy, vx: d * 160, r: 18, dmg: Math.round(this.dmg * 0.8), life: 4.5 }));
          Sound.play('whirl');
        }
        if (this.st > 1.0) this.setState('idle');
        break;
      case 'summon':
        if (this.st > 0.6 && !this.didHit) {
          this.didHit = true;
          for (let i = 0; i < 2; i++) {
            const x = clamp(P.cx + (i ? 1 : -1) * rand(110, 180), this.ax0 + 30, this.ax1 - 30);
            S.spawnEnemy('mummy', x, this.gy, { aggro: true, drop: true });
            S.fx.dust(x, this.gy, 8, 'rgba(230,200,150,0.8)');
          }
          Sound.play('magic');
        }
        if (this.st > 1.2) this.setState('idle');
        break;
      case 'beams':
        if (this.st > 0.4 && !this.didHit) {
          this.didHit = true;
          for (let i = 0; i < 3; i++) {
            S.schedule(i * 0.35, () => {
              S.addProjectile(new Projectile({ type: 'beam', x: this.P.cx + (i - 1) * 20, y: 0, r: 20, bw: 22, dmg: Math.round(this.dmg * 0.8), life: 1.2, warn: 0.75, color: '#ffd54f' }));
            });
          }
          Sound.play('warn');
        }
        if (this.st > 1.8) this.setState('idle');
        break;
      default: this.setState('idle');
    }
  }
  staggerUpdate(dt) {
    this.alpha = 1;
    this.hidden = false;
    this.y = approach(this.y, this.gy - this.h - 6, 300 * dt);
  }
  introUpdate(dt) { this.face(); this.y = approach(this.y, this.gy - this.h - this.hover, 120 * dt); }
  draw(ctx) {
    if (this.alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = clamp(this.alpha, 0, 1);
    drawShadowEllipse(ctx, this.cx, this.gy, 22, 0.25);
    const casting = (this.state === 'orbs' || this.state === 'beams' || this.state === 'summon' || this.state === 'tornado');
    const pose = this.state === 'stagger' ? PZ.hurt : casting ? PZ.castUp : mkPose(0.05, 0.4, 1.2, 1.2, 0.8, -0.1, 0, 0.1, 0);
    const k = skel(this.cx, this.feet, this.facing, this.s, pose, false);
    const col = this.flash > 0 ? '#ffffff' : this.freezeT > 0 ? '#b3e5fc' : '#3e2723';
    // robe
    ctx.fillStyle = this.flash > 0 ? '#fff' : '#f5f5f5';
    ctx.beginPath();
    ctx.moveTo(k.hx - 8, k.hy - 6);
    ctx.lineTo(k.hx + 8, k.hy - 6);
    ctx.lineTo(k.hx + 16 + Math.sin(this.t * 3) * 2, this.feet + 4);
    ctx.lineTo(k.hx - 16 + Math.sin(this.t * 3 + 1) * 2, this.feet + 4);
    ctx.fill();
    ctx.fillStyle = '#1565c0';
    ctx.fillRect(k.hx - 12, k.hy + 6, 24, 4);
    drawStick(ctx, k, col, { outline: 'rgba(255,213,79,0.4)', eye: '#ffeb3b', angry: true });
    // nemes headdress
    ctx.fillStyle = '#ffca28';
    ctx.beginPath();
    ctx.moveTo(k.headX - k.hr - 2, k.headY - 4);
    ctx.lineTo(k.headX + k.hr + 2, k.headY - 4);
    ctx.lineTo(k.headX + k.hr + 7, k.headY + 16);
    ctx.lineTo(k.headX - k.hr - 7, k.headY + 16);
    ctx.fill();
    ctx.fillStyle = '#1565c0';
    for (let i = 0; i < 3; i++) ctx.fillRect(k.headX - k.hr - 4 - i, k.headY + 1 + i * 5, (k.hr + 4 + i) * 2, 2);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(k.headX, k.headY, k.hr * 0.85, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(k.headX + k.f * 3 - 2, k.headY - 2, 4, 3);
    ctx.fillStyle = '#ffca28';
    ctx.beginPath(); ctx.arc(k.headX, k.headY - k.hr, 3, 0, TAU); ctx.fill();
    // staff with sun disc
    const hx = k.fa[2], hy = k.fa[3];
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx, hy + 30); ctx.lineTo(hx, hy - 30); ctx.stroke();
    const glow = casting ? 1 : 0.5;
    ctx.fillStyle = `rgba(255,213,79,${0.3 * glow})`;
    ctx.beginPath(); ctx.arc(hx, hy - 36, 14, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath(); ctx.arc(hx, hy - 36, 7, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ----- GLACIUS (frost golem) -----
class BossGolem extends Boss {
  constructor(scene, arena) { super(scene, 'golem', arena, 70, 118); }
  think(dt) {
    const S = this.scene, P = this.P;
    const dx = P.cx - this.cx, adx = Math.abs(dx);
    const k = this.spd();
    switch (this.state) {
      case 'idle':
        this.face();
        this.vx = approach(this.vx, adx > 110 ? this.facing * 55 * k : 0, 400 * dt);
        this.phys(dt, true);
        if (this.st > (this.phase === 2 ? 0.8 : 1.2)) {
          if (adx < 130) this.setState(this.pick([['punch', 4], ['spikes', 1], ['icicles', 1]]));
          else this.setState(this.pick([['boulder', 3], ['spikes', 3], ['icicles', 2], ['punch', adx < 200 ? 1 : 0]]));
        }
        break;
      case 'punch':
        this.vx = approach(this.vx, 0, 600 * dt);
        this.phys(dt, true);
        if (this.st > 0.7 / k && !this.didHit) {
          this.didHit = true;
          S.shake(8, 0.3);
          Sound.play('hitHeavy');
          S.hitPlayer({ x: this.facing > 0 ? this.cx : this.cx - 140, y: this.y + 30, w: 140, h: this.h - 30 }, this.dmg, this.cx, 460);
          S.fx.shards(this.cx + this.facing * 90, this.y + 60, '#e1f5fe', 6, 200, 5);
        }
        if (this.st > 1.4 / k) this.setState('idle');
        break;
      case 'boulder':
        this.face();
        this.vx = 0;
        this.phys(dt, true);
        if (this.st > 0.75 / k && !this.didHit) {
          this.didHit = true;
          const sx = this.cx, sy = this.y - 10;
          const time = 1.0, g = 700;
          const vx = clamp((P.cx - sx) / time, -500, 500);
          const vy = (P.feet - 20 - sy - 0.5 * g * time * time) / time;
          S.addProjectile(new Projectile({ type: 'boulder', x: sx, y: sy, vx, vy, g, r: 16, dmg: this.dmg, life: 3 }));
          Sound.play('swingHeavy');
        }
        if (this.st > 1.3 / k) this.setState('idle');
        break;
      case 'spikes':
        this.face();
        this.vx = 0;
        this.phys(dt, true);
        if (this.st > 0.6 / k && !this.didHit) {
          this.didHit = true;
          S.shake(8, 0.3);
          Sound.play('quake');
          const n = this.phase === 2 ? 9 : 7;
          const dirs = this.phase === 2 ? [-1, 1] : [this.facing];
          for (const d of dirs) {
            for (let i = 1; i <= n; i++) {
              const x = this.cx + d * (40 + i * 46);
              if (x < this.ax0 + 10 || x > this.ax1 - 10) continue;
              S.schedule(i * 0.1, () => S.addProjectile(new Projectile({ type: 'icespike', x, y: this.gy, r: 12, dmg: Math.round(this.dmg * 0.8), life: 1.25 })));
            }
          }
        }
        if (this.st > 1.6) this.setState('idle');
        break;
      case 'icicles':
        this.vx = 0;
        this.phys(dt, true);
        if (this.st < dt * 1.5) Sound.play('roar');
        if (this.st > 0.8 && !this.didHit) {
          this.didHit = true;
          S.shake(6, 0.6);
          const n = this.phase === 2 ? 10 : 7;
          for (let i = 0; i < n; i++) {
            const x = i === 0 ? P.cx : rand(this.ax0 + 30, this.ax1 - 30);
            S.addProjectile(new Projectile({ type: 'marker', kind: 'icicle', x, tx: x, y: S.cam.y - 40, vx: 0, vy: 150, g: 1100, gy: this.gy, r: 8, dmg: Math.round(this.dmg * 0.7), delay: 0.2 + i * 0.16, life: 8, color: '#b3e5fc' }));
          }
        }
        if (this.st > 1.6) this.setState('idle');
        break;
      default: this.setState('idle');
    }
  }
  draw(ctx) {
    const x = this.cx, y = this.feet, f = this.facing;
    drawShadowEllipse(ctx, x, this.gy, 48, 0.3);
    const base = this.flash > 0 ? '#ffffff' : '#90caf9';
    const dark = this.flash > 0 ? '#ffffff' : '#5c8fc2';
    const walk = Math.abs(this.vx) > 5 ? Math.sin(this.t * 6) : 0;
    const stag = this.state === 'stagger' ? Math.sin(this.t * 20) * 3 : 0;
    ctx.save();
    ctx.translate(stag, 0);
    // legs
    ctx.fillStyle = dark;
    ctx.fillRect(x - 26 + walk * 4, y - 36, 18, 36);
    ctx.fillRect(x + 8 - walk * 4, y - 36, 18, 36);
    // torso
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.moveTo(x - 34, y - 36); ctx.lineTo(x + 34, y - 36); ctx.lineTo(x + 40, y - 96); ctx.lineTo(x - 40, y - 96); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e3f2fd';
    ctx.lineWidth = 2;
    ctx.stroke();
    // cracks / crystals
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.moveTo(x - 10, y - 90); ctx.lineTo(x - 2, y - 70); ctx.lineTo(x - 12, y - 50); ctx.stroke();
    ctx.fillStyle = '#e1f5fe';
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + sd * 32, y - 96); ctx.lineTo(x + sd * 40, y - 122); ctx.lineTo(x + sd * 46, y - 96);
      ctx.fill();
    }
    // head
    ctx.fillStyle = base;
    ctx.fillRect(x - 16 + f * 4, y - 118, 32, 24);
    ctx.fillStyle = this.phase === 2 ? '#ff1744' : '#00e5ff';
    ctx.fillRect(x + f * 8 - 4, y - 110, 8, 4);
    ctx.fillRect(x + f * 8 - 14 * (f > 0 ? 1 : -1) - 3, y - 110, 6, 4);
    // arms
    let armAng = 0.2 + Math.sin(this.t * 2) * 0.05;
    let armFwd = 0;
    if (this.state === 'punch') {
      const w = 0.7 / this.spd();
      armFwd = this.st < w ? -0.8 * (this.st / w) : 1.5;
    } else if (this.state === 'boulder') armAng = this.st < 0.75 / this.spd() ? 3.0 : 1.2;
    else if (this.state === 'spikes') armAng = this.st < 0.6 / this.spd() ? 2.8 : 0.1;
    else if (this.state === 'icicles') armAng = 2.6;
    for (const sd of [-1, 1]) {
      const front = sd === f;
      const ang = front ? armAng + armFwd : armAng * 0.8;
      const sx = x + sd * 36, sy = y - 88;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-ang * f);
      ctx.fillStyle = front ? base : dark;
      ctx.fillRect(-9, 0, 18, 44);
      ctx.fillRect(-12, 40, 24, 22);
      ctx.restore();
    }
    if (this.state === 'boulder' && this.st < 0.75 / this.spd()) {
      ctx.fillStyle = '#b3e5fc';
      ctx.beginPath(); ctx.arc(x, y - 138, 16, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if ((this.state === 'punch' && this.st < 0.5) || (this.state === 'spikes' && this.st < 0.4)) this.alert(ctx, x, y - 132);
  }
}

// ----- IGNIVORE (dragon) -----
class BossDragon extends Boss {
  constructor(scene, arena) {
    super(scene, 'dragon', arena, 110, 54);
    this.y = arena.gy - 200;
    this.flying = true;
  }
  hoverY() { return this.gy - 185 + Math.sin(this.t * 2) * 12; }
  moveTo(tx, ty, spd, dt) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return true;
    const m = Math.min(d, spd * dt);
    this.x += (dx / d) * m;
    this.y += (dy / d) * m;
    this.clampArena();
    return d < 8;
  }
  introUpdate(dt) { this.face(); this.y = approach(this.y, this.hoverY(), 100 * dt); }
  staggerUpdate(dt) {
    this.y = Math.min(this.gy - this.h, this.y + 400 * dt);
  }
  think(dt) {
    const S = this.scene, P = this.P;
    const dx = P.cx - this.cx;
    const k = this.spd();
    this.contact(0.6, 260);
    switch (this.state) {
      case 'idle': {
        this.face();
        const side = this.cx < P.cx ? -1 : 1;
        const tx = clamp(P.cx + side * 190 - this.w / 2, this.ax0 + 10, this.ax1 - this.w - 10);
        this.moveTo(tx, this.hoverY(), 160 * k, dt);
        if (this.st > (this.phase === 2 ? 0.8 : 1.2)) this.setState(this.pick([['fireballs', 3], ['breath', 2], ['dive', 2], ['meteor', this.phase === 2 ? 2 : 0]]));
        break;
      }
      case 'fireballs':
        this.face();
        this.moveTo(this.x, this.hoverY(), 100, dt);
        if (this.st > 0.5 / k) {
          const i = Math.floor((this.st - 0.5 / k) / 0.18);
          if (i < 3 && this.n <= i) {
            this.n = i + 1;
            const mx = this.cx + this.facing * 60, my = this.y + 20;
            const a = Math.atan2(P.cy - my, P.cx - mx) + (i - 1) * 0.12;
            S.addProjectile(new Projectile({ type: 'fireball', x: mx, y: my, vx: Math.cos(a) * 310, vy: Math.sin(a) * 310, r: 10, dmg: Math.round(this.dmg * 0.7), destroyable: true, life: 3 }));
            Sound.play('fire');
          }
        }
        if (this.st > 1.3) this.setState('idle');
        break;
      case 'breath': {
        if (this.n === 0) {
          this.sideDir = this.cx < (this.ax0 + this.ax1) / 2 ? 1 : -1;
          this.n = 1;
        }
        const startX = this.sideDir > 0 ? this.ax0 + 10 : this.ax1 - this.w - 10;
        const endX = this.sideDir > 0 ? this.ax1 - this.w - 10 : this.ax0 + 10;
        if (this.n === 1) {
          this.facing = this.sideDir;
          if (this.moveTo(startX, this.gy - 175, 320 * k, dt) || this.st > 1.6) { this.n = 2; this.st = 0; Sound.play('roar'); }
        } else if (this.n === 2) {
          this.facing = this.sideDir;
          if (this.st > 0.4) {
            const done = this.moveTo(endX, this.gy - 175, 210 * k, dt);
            this.fireT = (this.fireT || 0) - dt;
            if (this.fireT <= 0) {
              this.fireT = 0.035;
              const mx = this.cx + this.facing * 62, my = this.y + 34;
              S.addProjectile(new Projectile({ type: 'flame', x: mx, y: my, vx: this.facing * rand(40, 120), vy: rand(300, 380), g: 150, r: 12, dmg: Math.round(this.dmg * 0.55), life: 0.55 }));
            }
            if (Math.random() < 0.1) Sound.play('fire');
            if (done) this.setState('idle');
          }
        }
        if (this.st > 5) this.setState('idle');
        break;
      }
      case 'dive':
        if (this.n === 0) {
          this.moveTo(this.x, this.gy - 260, 200, dt);
          this.face();
          if (this.st > 0.55 / k) {
            this.n = 1;
            this.tx = P.cx - this.w / 2;
            Sound.play('roar');
          }
        } else if (this.n === 1) {
          const done = this.moveTo(clamp(this.tx, this.ax0 + 2, this.ax1 - this.w - 2), this.gy - this.h, 560 * k, dt);
          this.contact(1, 400);
          if (done || this.y + this.h >= this.gy - 2) {
            this.y = this.gy - this.h;
            this.n = 2;
            this.st = 0;
            S.shake(10, 0.4);
            Sound.play('quake');
            S.fx.dust(this.cx, this.gy, 12);
            for (const d of [-1, 1]) S.addProjectile(new Projectile({ type: 'shock', x: this.cx + d * 50, y: this.gy, vx: d * 320, dmg: Math.round(this.dmg * 0.7), life: 1.2, r: 14, hgt: 30, color: '#ff8a65' }));
          }
        } else if (this.n === 2) {
          if (this.st > 1.4 / k) { this.n = 3; this.st = 0; }
        } else {
          this.moveTo(this.x, this.hoverY(), 220, dt);
          if (this.st > 0.8) this.setState('idle');
        }
        break;
      case 'meteor':
        this.moveTo(this.x, this.gy - 250, 120, dt);
        if (this.st < dt * 1.5) Sound.play('roar');
        if (this.st > 0.7 && !this.didHit) {
          this.didHit = true;
          for (let i = 0; i < 8; i++) {
            const x = i === 0 ? P.cx : rand(this.ax0 + 30, this.ax1 - 30);
            S.addProjectile(new Projectile({ type: 'marker', kind: 'meteor', x: x - 60, tx: x, y: S.cam.y - 60, vx: 60 * (900 / 450), vy: 450, g: 0, gy: this.gy, r: 11, dmg: Math.round(this.dmg * 0.7), boom: 46, delay: i * 0.22, life: 8 }));
          }
        }
        if (this.st > 2.2) this.setState('idle');
        break;
      default: this.setState('idle');
    }
  }
  draw(ctx) {
    const x = this.cx, y = this.cy, f = this.facing, t = this.t;
    const S = this.scene;
    drawShadowEllipse(ctx, x, this.gy, 50 * clamp(1 - (this.gy - this.feet) / 400, 0.3, 1), 0.25);
    const body = this.flash > 0 ? '#ffffff' : this.freezeT > 0 ? '#b3e5fc' : '#c62828';
    const belly = this.flash > 0 ? '#ffffff' : '#ffb74d';
    const wingC = this.flash > 0 ? '#ffffff' : '#8e1b1b';
    const grounded = this.state === 'dive' && this.n === 2;
    const flap = grounded ? 0.2 : Math.sin(t * (this.state === 'breath' ? 7 : 9));
    // far wing
    ctx.fillStyle = shade(wingC, -0.25);
    ctx.beginPath();
    ctx.moveTo(x - f * 8, y - 10);
    ctx.lineTo(x - f * 30, y - 60 - flap * 30);
    ctx.lineTo(x - f * 70, y - 40 - flap * 36);
    ctx.lineTo(x - f * 40, y - 6);
    ctx.fill();
    // tail
    ctx.strokeStyle = body;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - f * 40, y + 4);
    ctx.quadraticCurveTo(x - f * 80, y + 20 + Math.sin(t * 3) * 8, x - f * 110, y - 4 + Math.sin(t * 3 + 1) * 10);
    ctx.stroke();
    ctx.fillStyle = body;
    const tx = x - f * 110, ty = y - 4 + Math.sin(t * 3 + 1) * 10;
    ctx.beginPath(); ctx.moveTo(tx, ty - 10); ctx.lineTo(tx - f * 16, ty); ctx.lineTo(tx, ty + 10); ctx.fill();
    // body
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(x, y, 52, 24, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(x + f * 6, y + 10, 38, 11, 0, 0, TAU); ctx.fill();
    // legs
    ctx.strokeStyle = body;
    ctx.lineWidth = 7;
    for (const o of [-22, 18]) {
      ctx.beginPath(); ctx.moveTo(x + o, y + 14); ctx.lineTo(x + o + f * 6, y + 26 + (grounded ? 4 : 0)); ctx.stroke();
    }
    // neck & head
    const breathing = this.state === 'breath' && this.n === 2 && this.st > 0.4;
    const hx = x + f * 66, hy = y - 22 + (breathing ? 26 : 0) + Math.sin(t * 2.5) * 3;
    ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(x + f * 36, y - 6); ctx.quadraticCurveTo(x + f * 58, y - 30, hx, hy); ctx.stroke();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(hx + f * 8, hy, 18, 11, f * (breathing ? 0.5 : 0.1), 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(hx + f * 8 - 2, hy - 6, 5, 3);
    ctx.fillStyle = '#fff3e0';
    ctx.beginPath(); ctx.moveTo(hx - f * 2, hy - 8); ctx.lineTo(hx - f * 14, hy - 24); ctx.lineTo(hx - f * 4, hy - 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx + f * 4, hy - 9); ctx.lineTo(hx - f * 4, hy - 26); ctx.lineTo(hx + f * 8, hy - 11); ctx.fill();
    if (breathing || (this.state === 'fireballs' && this.st > 0.3)) {
      ctx.fillStyle = 'rgba(255,152,0,0.8)';
      ctx.beginPath(); ctx.arc(hx + f * 24, hy + 4, 7 + Math.random() * 3, 0, TAU); ctx.fill();
    }
    // near wing
    ctx.fillStyle = wingC;
    ctx.beginPath();
    ctx.moveTo(x + f * 4, y - 12);
    ctx.lineTo(x - f * 10, y - 70 - flap * 34);
    ctx.lineTo(x - f * 56, y - 52 - flap * 40);
    ctx.lineTo(x - f * 30, y - 4);
    ctx.fill();
    ctx.strokeStyle = shade(wingC, -0.4);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + f * 4, y - 12); ctx.lineTo(x - f * 10, y - 70 - flap * 34); ctx.lineTo(x - f * 56, y - 52 - flap * 40); ctx.stroke();
    if (this.state === 'dive' && this.n === 0) this.alert(ctx, x, this.y - 30);
    void S;
  }
}

// ----- THE SHADOW LORD -----
class BossShadow extends Boss {
  constructor(scene, arena) {
    super(scene, 'shadow', arena, 24, 60);
    this.s = 1.35;
    this.parryCd = 2;
    this.cape = [];
    for (let i = 0; i < 6; i++) this.cape.push({ x: this.cx, y: this.y + 10 });
  }
  parry(h) {
    if (this.state === 'idle' && this.parryCd <= 0 && h.kind === 'melee' && Math.random() < 0.22) {
      this.parryCd = 3.5;
      const S = this.scene;
      S.fx.text(this.cx, this.y - 16, 'PARRY!', '#ea80fc', 14);
      S.fx.spark(h.x, h.y, '#ea80fc', 10, 260);
      Sound.play('block');
      this.setState('tpOut');
      return true;
    }
    return false;
  }
  think(dt) {
    const S = this.scene, P = this.P;
    const dx = P.cx - this.cx, adx = Math.abs(dx);
    const k = this.spd();
    this.parryCd -= dt;
    switch (this.state) {
      case 'idle':
        this.face();
        this.vx = approach(this.vx, adx > 110 ? this.facing * 130 * k : 0, 800 * dt);
        this.phys(dt, true);
        if (this.st > (this.phase === 2 ? 0.45 : 0.75)) {
          this.setState(this.pick([
            ['combo', adx < 170 ? 4 : 0], ['tpOut', 2.5], ['wave', 3], ['clones', 1.5],
            ['orbs', this.phase === 2 ? 2 : 0], ['beams', this.phase === 2 ? 2 : 0],
          ]));
        }
        break;
      case 'tpOut':
        this.alpha = 1 - this.st / 0.25;
        this.vx = 0;
        if (this.st > 0.25) {
          const side = -P.facing;
          let nx = P.cx + side * 55;
          if (nx < this.ax0 + 20 || nx > this.ax1 - 20) nx = P.cx - side * 55;
          this.x = clamp(nx - this.w / 2, this.ax0 + 4, this.ax1 - this.w - 4);
          this.y = this.gy - this.h;
          this.hidden = true;
          S.fx.smoke(this.cx, this.cy, 8, 'rgba(74,20,140,0.6)');
          Sound.play('teleport');
          this.setState('tpIn');
        }
        break;
      case 'tpIn':
        this.hidden = this.st < 0.1;
        this.alpha = this.st / 0.2;
        this.face();
        if (this.st > 0.2) { this.alpha = 1; this.hidden = false; this.setState('combo'); }
        break;
      case 'combo': {
        const W = 0.28 / k, HIT = 0.14;
        const seg = W + HIT + 0.08;
        const i = Math.floor(this.st / seg);
        const local = this.st - i * seg;
        if (i < 3) {
          if (local < W) { this.face(); this.vx = approach(this.vx, 0, 1200 * dt); }
          else if (local < W + HIT) {
            if (this.n <= i) {
              this.n = i + 1;
              this.didHit = false;
              this.vx = this.facing * 260;
              Sound.play('swingHeavy');
              S.fx.slash(this.cx, this.y + 26, 56, i === 1 ? 0.9 : -2.1, i === 1 ? -1.9 : 0.8, this.facing, 'rgba(234,128,252,0.9)', 9, 0.18);
            }
            if (!this.didHit && S.hitPlayer({ x: this.facing > 0 ? this.cx : this.cx - 72, y: this.y - 6, w: 72, h: this.h + 6 }, this.dmg * (i === 2 ? 1.2 : 0.8), this.cx, i === 2 ? 420 : 240)) this.didHit = true;
            this.vx = approach(this.vx, 0, 1400 * dt);
          }
        }
        this.phys(dt, true);
        if (this.st > seg * 3 + 0.55 / k) this.setState('idle');
        break;
      }
      case 'wave':
        this.face();
        this.vx = 0;
        this.phys(dt, true);
        if (this.st > 0.5 / k && this.n === 0) {
          this.n = 1;
          this.fireWave(S);
        }
        if (this.phase === 2 && this.st > 0.85 / k && this.n === 1) {
          this.n = 2;
          this.face();
          this.fireWave(S);
        }
        if (this.st > 1.3 / k) this.setState('idle');
        break;
      case 'clones':
        this.vx = 0;
        this.phys(dt, true);
        if (this.st > 0.6 && !this.didHit) {
          this.didHit = true;
          const n = this.phase === 2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const x = i % 2 === 0 ? this.ax0 + 40 + i * 30 : this.ax1 - 40 - i * 30;
            const e = S.spawnEnemy('shade', x, this.gy - rand(0, 60), { aggro: true });
            e.dmg = Math.round(this.dmg * 0.6);
            e.life = 1.5 + i * 0.3;
            e.st = -i * 0.25;
            S.fx.smoke(x, this.gy - 30, 6, 'rgba(74,20,140,0.6)');
          }
          Sound.play('magic');
        }
        if (this.st > 1.3) this.setState('idle');
        break;
      case 'orbs':
        this.vx = 0;
        this.phys(dt, true);
        if (this.st > 0.6 && !this.didHit) {
          this.didHit = true;
          const n = 9;
          for (let i = 0; i < n; i++) {
            const x = this.ax0 + 30 + ((this.ax1 - this.ax0 - 60) * (i + rand(0.2, 0.8))) / n;
            S.addProjectile(new Projectile({ type: 'marker', kind: 'darkorb', x, tx: x, y: S.cam.y - 40, vx: 0, vy: 200, g: 700, gy: this.gy, r: 10, dmg: Math.round(this.dmg * 0.6), boom: 34, delay: 0.3 + (i % 3) * 0.35, life: 8 }));
          }
          Sound.play('magic');
        }
        if (this.st > 1.6) this.setState('idle');
        break;
      case 'beams':
        this.vx = 0;
        this.phys(dt, true);
        if (this.st > 0.4 && !this.didHit) {
          this.didHit = true;
          for (let i = 0; i < 4; i++) {
            S.schedule(i * 0.45, () => {
              S.addProjectile(new Projectile({ type: 'beam', x: this.P.cx, y: 0, r: 20, bw: 20, dmg: Math.round(this.dmg * 0.7), life: 1.1, warn: 0.65, color: '#ea80fc' }));
            });
          }
          Sound.play('warn');
        }
        if (this.st > 2.4) this.setState('idle');
        break;
      default: this.setState('idle');
    }
  }
  fireWave(S) {
    S.addProjectile(new Projectile({ type: 'wave', x: this.cx + this.facing * 24, y: this.gy - 26, vx: this.facing * 380, r: 18, dmg: Math.round(this.dmg * 0.8), life: 2.2 }));
    Sound.play('swingHeavy');
    S.fx.slash(this.cx, this.y + 26, 50, -1.2, 1.2, this.facing, 'rgba(234,128,252,0.9)', 9, 0.2);
  }
  pose() {
    switch (this.state) {
      case 'combo': {
        const W = 0.28 / this.spd();
        const seg = W + 0.22;
        const i = Math.min(2, Math.floor(this.st / seg));
        const local = this.st - i * seg;
        const wind = i === 1 ? mkPose(0.25, 0.6, 1.0, 0.45, 0.25, -0.4, 0.05, 0.55, -0.35) : mkPose(-0.12, 0.5, 1.0, 3.5, 0.4, -0.3, 0.0, 0.35, -0.2);
        const strike = i === 1 ? mkPose(-0.15, 0.3, 1.0, 2.95, 0.2, -0.3, 0, 0.4, -0.2) : mkPose(0.4, 0.2, 0.8, 1.1, 0.15, -0.6, 0.1, 0.7, -0.5);
        return local < W ? lerpPose(PZ.stand, wind, easeOut(local / W)) : strike;
      }
      case 'wave': return this.st < 0.5 / this.spd() ? mkPose(-0.2, 0.5, 1.0, 3.6, 0.3, -0.3, 0, 0.4, -0.2) : mkPose(0.45, 0.2, 0.8, 1.0, 0.1, -0.6, 0.1, 0.7, -0.5);
      case 'clones': case 'orbs': case 'beams': return PZ.castUp;
      case 'stagger': return lerpPose(PZ.stand, PZ.hurt, 0.5);
      case 'intro': return this.st > 1.2 ? PZ.castUp : PZ.stand;
    }
    return Math.abs(this.vx) > 20 ? runPose(this.t * 10, 0.35) : idlePose(this.t);
  }
  deathSkel() { return skel(this.cx, this.feet, this.facing, this.s, PZ.hurt, true); }
  draw(ctx) {
    if (this.alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = clamp(this.alpha, 0, 1);
    const k = skel(this.cx, this.feet, this.facing, this.s, this.pose(), this.onGround);
    // cape physics
    const ax = k.nx - k.f * 2, ay = k.ny + 2;
    this.cape[0].x = ax;
    this.cape[0].y = ay;
    for (let i = 1; i < this.cape.length; i++) {
      const p = this.cape[i], q = this.cape[i - 1];
      p.x += -this.vx * 0.01 - this.facing * 0.5 + Math.sin(this.t * 6 + i) * 0.6;
      p.y += 1.2;
      const d = Math.hypot(p.x - q.x, p.y - q.y) || 1;
      p.x = q.x + ((p.x - q.x) / d) * 8;
      p.y = q.y + ((p.y - q.y) / d) * 8;
    }
    drawShadowEllipse(ctx, this.cx, this.gy, 20, 0.3);
    ctx.fillStyle = this.flash > 0 ? '#fff' : '#311b92';
    ctx.beginPath();
    ctx.moveTo(ax + 4, ay);
    for (const p of this.cape) ctx.lineTo(p.x, p.y);
    const last = this.cape[this.cape.length - 1];
    ctx.lineTo(last.x + k.f * 14, last.y + 4);
    ctx.lineTo(ax + k.f * 6, ay + 4);
    ctx.fill();
    const col = this.flash > 0 ? '#ffffff' : this.freezeT > 0 ? '#b3e5fc' : '#1a0033';
    const aura = this.phase === 2 ? 'rgba(255,23,68,0.5)' : 'rgba(213,0,249,0.45)';
    drawStick(ctx, k, col, { outline: aura, eye: '#ff1744', angry: true });
    // crown
    ctx.fillStyle = '#d500f9';
    ctx.beginPath();
    ctx.moveTo(k.headX - k.hr, k.headY - k.hr + 2);
    ctx.lineTo(k.headX - k.hr + 2, k.headY - k.hr - 9);
    ctx.lineTo(k.headX - 2, k.headY - k.hr - 2);
    ctx.lineTo(k.headX, k.headY - k.hr - 12);
    ctx.lineTo(k.headX + 2, k.headY - k.hr - 2);
    ctx.lineTo(k.headX + k.hr - 2, k.headY - k.hr - 9);
    ctx.lineTo(k.headX + k.hr, k.headY - k.hr + 2);
    ctx.fill();
    drawWeapon(ctx, k, 'darksword', this.t);
    if (Math.random() < 0.3) this.scene.fx.add({ type: 'dot', x: this.cx + rand(-14, 14), y: this.y + rand(0, this.h), vx: 0, vy: -40, g: 0, life: 0.5, color: this.phase === 2 ? '#ff1744' : '#aa00ff', size: 3 });
    ctx.restore();
    if (this.state === 'combo' && this.st < 0.15) this.alert(ctx, k.headX, k.headY - 24);
  }
}

function makeBoss(scene, kind, arena) {
  switch (kind) {
    case 'bruto': return new BossBruto(scene, arena);
    case 'spider': return new BossSpider(scene, arena);
    case 'pharaoh': return new BossPharaoh(scene, arena);
    case 'golem': return new BossGolem(scene, arena);
    case 'dragon': return new BossDragon(scene, arena);
    case 'shadow': return new BossShadow(scene, arena);
  }
  return null;
}
