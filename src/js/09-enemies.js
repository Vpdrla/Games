// ---------- Enemies ----------
class Enemy {
  constructor(scene, type, x, y, o = {}) {
    const T = ENEMIES[type];
    this.T = T;
    this.type = type;
    this.scene = scene;
    this.s = T.scale || 1;
    this.w = T.w || 18 * this.s;
    this.h = T.h || 44 * this.s;
    this.x = x - this.w / 2;
    this.y = y - this.h;
    const hpMul = o.hpMul || scene.hpMul;
    this.maxHp = Math.max(1, Math.round(T.hp * hpMul));
    this.hp = this.maxHp;
    this.dmg = Math.max(1, Math.round(T.dmg * scene.dmgMul));
    this.speed = T.speed * (1 + Math.min(0.25, scene.diff * 0.035));
    this.vx = 0; this.vy = 0; this.facing = -1;
    this.onGround = false; this.plat = null; this.dropping = 0;
    this.state = 'idle'; this.st = 0; this.t = rand(0, 10); this.cd = rand(0.6, 1.6);
    this.aggro = !!o.aggro;
    this.home = x;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.flash = 0; this.hurtT = 0; this.freezeT = 0; this.stunT = 0; this.airStun = false;
    this.hpShow = 0; this.dead = false; this.flying = !!T.flying; this.arena = o.arena || null;
    this.spawnT = o.drop ? 0.45 : 0;
    this.dodgeCd = 0; this.animPh = rand(0, 6); this.alpha = 1;
    this.baseY = this.y;
    this.didHit = false;
    this.squash = 0;
    this.lastK = null;
    if (T.ai === 'shade') { this.aggro = true; this.state = 'dash'; this.life = 1.4; }
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get feet() { return this.y + this.h; }

  setState(s) { this.state = s; this.st = 0; this.didHit = false; }

  update(dt) {
    const S = this.scene, P = S.player;
    this.t += dt;
    this.st += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.hpShow -= dt;
    this.cd -= dt;
    this.dodgeCd -= dt;
    this.squash = Math.max(0, this.squash - dt * 4);
    if (this.spawnT > 0) this.spawnT -= dt;
    if (Math.abs(this.vx) > 10 && this.onGround) this.animPh += Math.abs(this.vx) * dt * 0.06;
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      this.vx = approach(this.vx, 0, 900 * dt);
      if (this.flying) this.vy = approach(this.vy, 0, 900 * dt);
      this.phys(dt, !this.flying);
      return;
    }
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.vx = approach(this.vx, 0, 900 * dt);
      this.phys(dt, !this.flying);
      return;
    }
    if (this.hurtT > 0 || this.airStun) {
      this.hurtT -= dt;
      if (this.flying) {
        this.vx *= Math.max(0, 1 - 4 * dt);
        this.vy *= Math.max(0, 1 - 4 * dt);
        this.phys(dt, false);
        if (this.hurtT <= 0) this.airStun = false;
        return;
      }
      if (this.onGround) this.vx = approach(this.vx, 0, 700 * dt);
      const wasAir = !this.onGround;
      this.phys(dt, true, this.airStun ? 0.8 : 1);
      if (this.airStun && this.onGround && wasAir && this.hurtT <= 0.2) {
        this.airStun = false;
        this.stunT = 0.4;
        this.squash = 1;
        S.fx.dust(this.cx, this.feet, 5);
      }
      if (this.hurtT <= -1.5) this.airStun = false;
      return;
    }
    const dx = P.cx - this.cx, dy = P.cy - this.cy, adx = Math.abs(dx);
    if (!this.aggro && adx < 340 && Math.abs(dy) < 170 && !P.dead) this.aggro = true;
    if (P.dead) this.aggro = false;
    const fn = this['ai_' + this.T.ai];
    if (fn) fn.call(this, dt, dx, dy, adx, P, S);
    if (this.T.body || this.T.ai === 'shade') {
      if (!P.dead && this.hurtT <= 0 && overlap(this, P)) {
        S.hitPlayer(this, this.dmg, this.cx, 220, this.T.chill ? { slow: 1.5 } : {});
        if (this.T.ai === 'shade') this.vanish();
      }
    }
    if (!this.flying) this.phys(dt, true);
  }

  phys(dt, gravity, gmul = 1) {
    const S = this.scene;
    if (gravity) this.vy = Math.min(this.vy + GRAVITY * gmul * dt, 900);
    const wasGround = this.onGround;
    moveActor(this, dt, S.world, S.platforms);
    if (this.onGround && !wasGround && gravity) this.squash = 0.6;
    if (this.y > S.world.ph + 60 && !this.dead) {
      this.hp = 0;
      this.die(null, true);
    }
  }

  groundAhead(dir) {
    const W = this.scene.world;
    const fx = dir > 0 ? this.x + this.w + 3 : this.x - 3;
    const c = Math.floor(fx / TILE);
    const r = Math.floor((this.y + this.h + 4) / TILE);
    const t = W.get(c, r);
    if (!(t === T_SOLID || t === T_ICE || t === T_PLAT)) {
      // moving platforms count as ground too
      for (const p of this.scene.platforms) if (p.solid && fx > p.x && fx < p.x + p.w && Math.abs(p.y - (this.y + this.h)) < 8) return true;
      return false;
    }
    const inRow = W.get(c, r - 1);
    if (inRow === T_SPIKE || inRow === T_LAVA || inRow === T_SOLID || inRow === T_ICE) return false;
    if (W.solidAt(c, Math.floor((this.y + 4) / TILE))) return false;
    return true;
  }

  // Is it safe to step off the ledge ahead (solid landing within a few tiles, no hazards)?
  safeDrop(dir) {
    const W = this.scene.world;
    const c = Math.floor((dir > 0 ? this.x + this.w + 3 : this.x - 3) / TILE);
    const r0 = Math.floor((this.y + this.h + 4) / TILE);
    if (W.solidAt(c, Math.floor((this.y + 4) / TILE)) || W.solidAt(c, r0 - 1)) return false;
    for (let r = r0; r < Math.min(W.rows, r0 + 6); r++) {
      const t = W.get(c, r);
      if (t === T_SPIKE || t === T_LAVA) return false;
      if (t === T_SOLID || t === T_ICE || t === T_PLAT) return true;
    }
    return false;
  }

  walk(dt, dir, spd) {
    if (this.onGround && !this.groundAhead(dir)) {
      const P = this.scene.player;
      if (this.aggro && !P.dead && P.feet > this.feet + 24 && this.safeDrop(dir)) {
        this.vx = approach(this.vx, dir * spd, 1100 * dt);
        return true;
      }
      this.vx = approach(this.vx, 0, 1500 * dt);
      return false;
    }
    this.vx = approach(this.vx, dir * spd, 1100 * dt);
    return true;
  }

  patrol(dt) {
    if (Math.abs(this.cx - this.home) > 80) this.dir = sign(this.home - this.cx) || this.dir;
    this.facing = this.dir;
    if (!this.walk(dt, this.dir, this.speed * 0.35)) this.dir = -this.dir;
  }

  stop(dt) { this.vx = approach(this.vx, 0, 1300 * dt); }

  attackBox(reach, hmul = 0.62) {
    return { x: this.facing > 0 ? this.cx : this.cx - reach - 6, y: this.y + 3, w: reach + 6, h: this.h * hmul };
  }

  // ----- AI behaviours -----
  ai_melee(dt, dx, dy, adx, P, S) {
    const T = this.T;
    switch (this.state) {
      case 'idle':
      case 'chase':
        if (!this.aggro) { this.patrol(dt); return; }
        this.facing = sign(dx) || this.facing;
        if (adx > T.reach + 8 || Math.abs(dy) > 60) { this.walk(dt, this.facing, this.speed); this.state = 'chase'; }
        else {
          this.stop(dt);
          if (this.cd <= 0) this.setState('windup');
        }
        break;
      case 'windup':
        this.stop(dt);
        if (this.st >= T.windup) {
          this.setState('attack');
          this.vx = this.facing * 130;
          Sound.play('swing');
        }
        break;
      case 'attack':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (!this.didHit && S.hitPlayer(this.attackBox(T.reach), this.dmg, this.cx, 240)) this.didHit = true;
        if (this.st >= 0.16) this.setState('recover');
        break;
      case 'recover':
        this.stop(dt);
        if (this.st >= 0.42) { this.setState('chase'); this.cd = T.cd * rand(0.8, 1.3); }
        break;
      default: this.setState('chase');
    }
  }

  ai_shield(dt, dx, dy, adx, P, S) {
    const T = this.T;
    switch (this.state) {
      case 'idle':
      case 'chase':
        if (!this.aggro) { this.patrol(dt); return; }
        this.facing = sign(dx) || this.facing;
        if (adx > T.reach + 10) { this.walk(dt, this.facing, this.speed); this.state = 'chase'; }
        else { this.stop(dt); if (this.cd <= 0) this.setState('windup'); }
        break;
      case 'windup':
        this.stop(dt);
        if (this.st >= T.windup) { this.setState('attack'); this.vx = this.facing * 260; Sound.play('swingHeavy'); }
        break;
      case 'attack':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (!this.didHit && S.hitPlayer(this.attackBox(T.reach + 6, 0.8), this.dmg, this.cx, 360)) this.didHit = true;
        if (this.st >= 0.2) this.setState('recover');
        break;
      case 'recover':
        this.stop(dt);
        if (this.st >= 0.5) { this.setState('chase'); this.cd = T.cd * rand(0.8, 1.3); }
        break;
      default: this.setState('chase');
    }
  }

  ai_brute(dt, dx, dy, adx, P, S) {
    const T = this.T;
    switch (this.state) {
      case 'idle':
      case 'chase':
        if (!this.aggro) { this.patrol(dt); return; }
        this.facing = sign(dx) || this.facing;
        if (adx > T.reach + 14 || Math.abs(dy) > 80) { this.walk(dt, this.facing, this.speed); this.state = 'chase'; }
        else { this.stop(dt); if (this.cd <= 0) this.setState('windup'); }
        break;
      case 'windup':
        this.stop(dt);
        if (this.st >= T.windup) {
          this.setState('attack');
          Sound.play('hitHeavy');
          S.shake(5, 0.2);
          S.fx.dust(this.cx + this.facing * 30, this.feet, 8);
          S.addProjectile(new Projectile({ type: 'shock', x: this.cx + this.facing * 30, y: this.feet, vx: this.facing * 300, dmg: Math.round(this.dmg * 0.7), life: 0.8, r: 14, hgt: 28 }));
        }
        break;
      case 'attack':
        if (!this.didHit && S.hitPlayer(this.attackBox(T.reach * this.s * 0.8, 0.9), this.dmg, this.cx, 380)) this.didHit = true;
        if (this.st >= 0.2) this.setState('recover');
        break;
      case 'recover':
        this.stop(dt);
        if (this.st >= 0.7) { this.setState('chase'); this.cd = T.cd * rand(0.8, 1.2); }
        break;
      default: this.setState('chase');
    }
  }

  ai_archer(dt, dx, dy, adx, P, S) {
    const T = this.T;
    switch (this.state) {
      case 'idle':
      case 'chase':
        if (!this.aggro) { this.patrol(dt); return; }
        this.facing = sign(dx) || this.facing;
        if (adx < 150) { if (!this.walk(dt, -this.facing, this.speed)) this.stop(dt); }
        else if (adx > T.range) this.walk(dt, this.facing, this.speed);
        else this.stop(dt);
        if (this.cd <= 0 && adx < T.range + 40 && Math.abs(dy) < 220) this.setState('windup');
        break;
      case 'windup':
        this.stop(dt);
        this.facing = sign(dx) || this.facing;
        if (this.st >= T.windup) {
          const sx = this.cx + this.facing * 14, sy = this.y + 16 * this.s;
          const tx = P.cx, ty = P.cy;
          const d = Math.hypot(tx - sx, ty - sy) || 1;
          const spd = 440;
          const time = d / spd;
          S.addProjectile(new Projectile({ type: 'arrow', x: sx, y: sy, vx: ((tx - sx) / d) * spd, vy: ((ty - sy) / d) * spd - 0.5 * 300 * time, g: 300, r: 4, dmg: this.dmg, destroyable: true, life: 2.5, kb: 160 }));
          Sound.play('shoot');
          this.setState('recover');
        }
        break;
      case 'recover':
        this.stop(dt);
        if (this.st >= 0.45) { this.setState('chase'); this.cd = T.cd * rand(0.8, 1.3); }
        break;
      default: this.setState('chase');
    }
  }

  ai_bomber(dt, dx, dy, adx, P, S) {
    const T = this.T;
    switch (this.state) {
      case 'idle':
      case 'chase':
        if (!this.aggro) { this.patrol(dt); return; }
        this.facing = sign(dx) || this.facing;
        if (adx < 150) { if (!this.walk(dt, -this.facing, this.speed)) this.stop(dt); }
        else if (adx > T.range) this.walk(dt, this.facing, this.speed);
        else this.stop(dt);
        if (this.cd <= 0 && adx < T.range + 30 && Math.abs(dy) < 200) this.setState('windup');
        break;
      case 'windup':
        this.stop(dt);
        if (this.st >= T.windup) {
          const sx = this.cx + this.facing * 8, sy = this.y + 4;
          const time = 0.85;
          const g = 900;
          const vx = clamp((P.cx - sx) / time, -380, 380);
          const vy = (P.feet - 10 - sy - 0.5 * g * time * time) / time;
          S.addProjectile(new Projectile({ type: 'bomb', x: sx, y: sy, vx, vy: Math.max(-700, vy), g, r: 7, dmg: this.dmg, destroyable: true, life: 1.6 }));
          Sound.play('swing');
          this.setState('recover');
        }
        break;
      case 'recover':
        this.stop(dt);
        if (this.st >= 0.5) { this.setState('chase'); this.cd = T.cd * rand(0.8, 1.3); }
        break;
      default: this.setState('chase');
    }
  }

  ai_mage(dt, dx, dy, adx, P, S) {
    const T = this.T;
    switch (this.state) {
      case 'idle':
      case 'chase':
        if (!this.aggro) { this.patrol(dt); return; }
        this.facing = sign(dx) || this.facing;
        if (adx < 150 && this.dodgeCd <= 0) { this.setState('tpOut'); return; }
        if (adx > T.range) this.walk(dt, this.facing, this.speed);
        else if (adx < 160) { if (!this.walk(dt, -this.facing, this.speed)) this.stop(dt); }
        else this.stop(dt);
        if (this.cd <= 0 && adx < T.range && Math.abs(dy) < 220) this.setState('windup');
        break;
      case 'windup':
        this.stop(dt);
        this.facing = sign(dx) || this.facing;
        if (Math.random() < 0.5) S.fx.add({ type: 'dot', x: this.cx + rand(-14, 14), y: this.y + rand(-10, 20), vx: 0, vy: -40, g: 0, life: 0.4, color: '#80deea', size: 3 });
        if (this.st >= T.windup) {
          for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + (i - 1) * 0.7;
            S.addProjectile(new Projectile({ type: 'orb', x: this.cx + Math.cos(a) * 18, y: this.y + 6 + Math.sin(a) * 18, vx: Math.cos(a) * 160 + this.facing * 40, vy: Math.sin(a) * 160, home: 1.8, r: 7, dmg: this.dmg, destroyable: true, life: 4 }));
          }
          Sound.play('magic');
          this.setState('recover');
        }
        break;
      case 'recover':
        this.stop(dt);
        if (this.st >= 0.6) { this.setState('chase'); this.cd = T.cd * rand(0.8, 1.2); }
        break;
      case 'tpOut':
        this.stop(dt);
        this.alpha = 1 - this.st / 0.3;
        if (this.st >= 0.3) {
          const side = Math.random() < 0.5 ? -1 : 1;
          let placed = false;
          for (const sd of [side, -side]) {
            const nx = P.cx + sd * rand(190, 260);
            const gy = S.world.groundBelow(nx, P.y - 40);
            if (gy != null && Math.abs(gy - P.feet) < 140 && nx > S.bounds.x0 + 20 && nx < S.bounds.x1 - 20 && !S.world.solidPx(nx, gy - 20)) {
              this.x = nx - this.w / 2;
              this.y = gy - this.h;
              placed = true;
              break;
            }
          }
          if (!placed) this.x -= this.facing * 120;
          S.fx.smoke(this.cx, this.cy, 6, 'rgba(128,222,234,0.5)');
          Sound.play('teleport');
          this.dodgeCd = 3.5;
          this.setState('tpIn');
        }
        break;
      case 'tpIn':
        this.alpha = this.st / 0.3;
        if (this.st >= 0.3) { this.alpha = 1; this.setState('chase'); this.cd = Math.min(this.cd, 0.4); }
        break;
      default: this.setState('chase');
    }
  }

  ai_ninja(dt, dx, dy, adx, P, S) {
    const T = this.T;
    switch (this.state) {
      case 'idle':
      case 'chase':
        if (!this.aggro) { this.patrol(dt); return; }
        this.facing = sign(dx) || this.facing;
        if (adx > T.reach + 8) {
          const ok = this.walk(dt, this.facing, this.speed);
          if (!ok && this.onGround && Math.abs(dy) < 120 && adx < 260) { this.vy = -600; this.vx = this.facing * this.speed; this.onGround = false; }
          if (this.cd <= 0 && adx > 150 && adx < 330 && Math.random() < 0.02) this.setState('throw');
        } else {
          this.stop(dt);
          if (this.cd <= 0) this.setState('windup');
        }
        break;
      case 'windup':
        this.stop(dt);
        if (this.st >= T.windup) { this.setState('attack'); this.vx = this.facing * 240; Sound.play('swing'); }
        break;
      case 'attack':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (!this.didHit && S.hitPlayer(this.attackBox(T.reach), this.dmg, this.cx, 220)) this.didHit = true;
        if (this.st >= 0.15) {
          this.setState('retreat');
          if (this.onGround && this.groundAhead(-this.facing)) { this.vy = -480; this.vx = -this.facing * 230; this.onGround = false; }
        }
        break;
      case 'retreat':
        if (this.onGround && this.st > 0.15) { this.setState('chase'); this.cd = T.cd * rand(0.8, 1.4); }
        if (this.st > 1.2) this.setState('chase');
        break;
      case 'throw':
        this.stop(dt);
        if (this.st >= 0.3) {
          for (const a of [-0.12, 0.08]) {
            const d = Math.hypot(dx, dy) || 1;
            const ang = Math.atan2(dy, dx) + a;
            S.addProjectile(new Projectile({ type: 'shuriken', x: this.cx, y: this.y + 16, vx: Math.cos(ang) * 420, vy: Math.sin(ang) * 420, r: 5, dmg: Math.round(this.dmg * 0.8), destroyable: true, life: 1.6 }));
            void d;
          }
          Sound.play('shoot');
          this.setState('recover');
        }
        break;
      case 'recover':
        this.stop(dt);
        if (this.st >= 0.3) { this.setState('chase'); this.cd = T.cd * rand(0.8, 1.3); }
        break;
      default: this.setState('chase');
    }
  }

  ai_flyer(dt, dx, dy, adx, P, S) {
    const T = this.T;
    this.facing = sign(dx) || this.facing;
    if (!this.aggro) {
      this.vx = Math.sin(this.t * 1.3) * 30;
      this.vy = (this.baseY + Math.sin(this.t * 2.2) * 12 - this.y) * 3;
      this.phys(dt, false);
      return;
    }
    switch (this.state) {
      case 'idle':
      case 'chase': {
        const tx = P.cx - this.w / 2 + Math.sin(this.t * 0.9) * 90;
        const ty = P.y - 85 + Math.sin(this.t * 2.3) * 14;
        this.vx = approach(this.vx, clamp((tx - this.x) * 2.5, -T.speed, T.speed), 500 * dt);
        this.vy = approach(this.vy, clamp((ty - this.y) * 2.5, -T.speed, T.speed), 500 * dt);
        this.phys(dt, false);
        if (this.cd <= 0 && adx < 260 && !P.dead) this.setState(T.shoots ? 'windup' : 'swoopPrep');
        break;
      }
      case 'swoopPrep':
        this.vx *= 0.9;
        this.vy = approach(this.vy, -70, 700 * dt);
        this.phys(dt, false);
        if (this.st > 0.35) {
          this.setState('swoop');
          const d = Math.hypot(dx, dy) || 1;
          this.vx = (dx / d) * 320;
          this.vy = (dy / d) * 320;
        }
        break;
      case 'swoop':
        this.phys(dt, false);
        if (this.st > 0.75 || this.onGround || this.hitWall) this.setState('recover');
        break;
      case 'windup':
        this.vx *= 0.92;
        this.vy *= 0.92;
        this.phys(dt, false);
        if (this.st > 0.6) {
          const d = Math.hypot(dx, dy) || 1;
          S.addProjectile(new Projectile({ type: 'imp', x: this.cx, y: this.cy, vx: (dx / d) * 260, vy: (dy / d) * 260, r: 6, dmg: this.dmg, destroyable: true, life: 2.5 }));
          Sound.play('fire');
          this.setState('recover');
        }
        break;
      case 'recover':
        this.vy = approach(this.vy, -130, 700 * dt);
        this.vx *= 0.95;
        this.phys(dt, false);
        if (this.st > 0.6) { this.setState('chase'); this.cd = rand(1.6, 2.8); }
        break;
      default: this.setState('chase');
    }
  }

  ai_hopper(dt, dx, dy, adx, P, S) {
    if (this.onGround) {
      this.vx = approach(this.vx, 0, 1400 * dt);
      if (this.cd <= 0) {
        const dir = this.aggro ? sign(dx) || 1 : (this.dir = Math.abs(this.cx - this.home) > 60 ? sign(this.home - this.cx) : this.dir);
        this.facing = dir;
        if (this.groundAhead(dir) || this.aggro) {
          this.vx = dir * (this.aggro ? 150 : 70);
          this.vy = this.aggro ? -440 : -280;
          this.onGround = false;
        }
        this.cd = this.aggro ? rand(0.8, 1.3) : rand(1.2, 2.2);
      }
    }
  }

  ai_crawler(dt, dx, dy, adx, P, S) {
    const T = this.T;
    switch (this.state) {
      case 'idle':
      case 'chase':
        if (!this.aggro) { this.patrol(dt); return; }
        this.facing = sign(dx) || this.facing;
        if (adx < 100 && this.cd <= 0 && Math.abs(dy) < 50) this.setState('windup');
        else this.walk(dt, this.facing, this.speed);
        break;
      case 'windup':
        this.stop(dt);
        if (this.st >= 0.35) { this.setState('attack'); if (this.groundAhead(this.facing)) this.vx = this.facing * 380; }
        break;
      case 'attack':
        if (this.onGround && !this.groundAhead(this.facing)) this.vx = 0;
        if (this.st >= 0.3) this.setState('recover');
        break;
      case 'recover':
        this.stop(dt);
        if (this.st > 0.5) { this.setState('chase'); this.cd = rand(1.2, 2); }
        break;
      default: this.setState('chase');
    }
  }

  ai_shade(dt, dx, dy, adx, P, S) {
    this.life -= dt;
    if (this.state === 'dash') {
      if (this.st < 0.35) {
        this.vx = 0; this.vy = 0;
        this.facing = sign(dx) || this.facing;
        this.aim = { x: dx, y: dy };
      } else {
        const d = Math.hypot(this.aim.x, this.aim.y) || 1;
        this.vx = (this.aim.x / d) * this.T.speed;
        this.vy = (this.aim.y / d) * this.T.speed * 0.5;
        if (Math.random() < 0.6) S.fx.ghost(this.skel(), '#7b1fa2', 0.2);
      }
      this.phys(dt, false);
      this.y = clamp(this.y, 0, S.world.ph);
    }
    if (this.life <= 0 || this.hitWall) this.vanish();
  }

  vanish() {
    if (this.dead) return;
    this.dead = true;
    this.scene.fx.smoke(this.cx, this.cy, 8, 'rgba(74,20,140,0.6)');
  }

  // ----- damage -----
  takeHit(h) {
    if (this.dead || this.spawnT > 0.25) return false;
    const S = this.scene, T = this.T;
    if (T.ai === 'shade') { this.vanish(); return 'hit'; }
    const front = sign(h.dir) === -this.facing;
    const busy = this.state === 'attack' || this.state === 'windup';
    const canBlock = h.kind !== 'skill' && front && this.freezeT <= 0 && this.stunT <= 0 && this.hurtT <= 0 && !this.airStun;
    if (canBlock) {
      let blocked = false;
      if (T.ai === 'shield' && this.state !== 'attack') {
        if (h.heavy) {
          this.stunT = 0.9;
          this.setState('chase');
          S.fx.text(this.cx, this.y - 12, 'GUARD BREAK!', '#ffab40', 12);
        } else blocked = true;
      } else if (T.block && !busy && !h.heavy && Math.random() < T.block) blocked = true;
      if (blocked) {
        S.fx.spark(h.x, h.y, '#ffffff', 6, 200, h.dir > 0 ? Math.PI : 0, 1.6);
        S.fx.text(this.cx, this.y - 10, 'BLOCK', '#cfd8dc', 11);
        Sound.play('block');
        this.vx = h.dir * 140;
        this.hpShow = 2;
        this.aggro = true;
        if (T.ai !== 'shield') { this.setState('windup'); this.st = T.windup * 0.4; }
        return 'block';
      }
    }
    let dmg = h.dmg;
    if (this.freezeT > 0) dmg *= 1.3;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    h.dealt = dmg;
    this.flash = 0.12;
    this.hpShow = 3;
    this.aggro = true;
    if (h.freeze && !T.armor) this.freezeT = h.freeze;
    else if (h.freeze) this.stunT = Math.max(this.stunT, 0.8);
    if (h.stun) this.stunT = Math.max(this.stunT, h.stun);
    const armored = T.armor && !h.heavy;
    if (!armored) {
      if (busy) this.setState('chase');
      this.vx = h.dir * (h.kbx || 150) * (this.flying ? 0.8 : 1);
      if (h.kby && h.kby < 0) {
        this.vy = h.kby * (this.flying ? 0.5 : 1);
        if (!this.flying) this.airStun = true;
        this.onGround = false;
        this.plat = null;
      } else if (h.kby && h.kby > 0) this.vy = h.kby;
      else if (!this.onGround && !this.flying) { this.vy = Math.min(this.vy, -200); this.airStun = true; }
      this.hurtT = 0.28;
    } else {
      this.vx += h.dir * 40;
      if (h.freeze) this.freezeT = 0;
    }
    if (this.freezeT <= 0) this.facing = -sign(h.dir) || this.facing;
    if (this.hp <= 0) this.die(h);
    return 'hit';
  }

  die(h, fell) {
    if (this.dead) return;
    this.dead = true;
    const S = this.scene, T = this.T;
    S.onEnemyKilled(this);
    if (fell) return;
    const dir = h ? h.dir : 0;
    if (!T.body) S.fx.debris(this.lastK || this.skel(), T.color, dir * 240, -160);
    else S.fx.burst(this.cx, this.cy, T.color, 16, 220, 4);
    S.fx.burst(this.cx, this.cy, '#ffffff', 6, 200, 2);
    Sound.play('enemyDie');
    if (T.noLoot) return;
    const tier = S.tier;
    const coins = Math.round(randi(T.coin[0], T.coin[1]) * (1 + tier * 0.6));
    S.dropCoins(this.cx, this.cy, coins);
    const r = Math.random();
    if (r < 0.08) S.addPickup(new Pickup('heart', this.cx, this.cy, { vy: -260, vx: rand(-60, 60) }));
    else if (r < 0.2) S.addPickup(new Pickup('energy', this.cx, this.cy, { vy: -260, vx: rand(-60, 60) }));
    else if (r < 0.215) S.addPickup(new Pickup('potion', this.cx, this.cy, { vy: -260, vx: rand(-60, 60) }));
  }

  // ----- drawing -----
  getPose() {
    const T = this.T;
    if (this.freezeT > 0) return this.frozenPose || PZ.stand;
    this.frozenPose = null;
    if (this.hurtT > 0 || this.airStun) return PZ.hurt;
    if (this.stunT > 0) return lerpPose(PZ.stand, PZ.hurt, 0.35 + Math.sin(this.t * 8) * 0.1);
    const ai = T.ai;
    const wk = T.windup || 0.5;
    switch (this.state) {
      case 'windup': {
        const k = clamp(this.st / wk, 0, 1);
        if (ai === 'archer') return lerpPose(PZ.stand, PZ.aim, easeOut(k));
        if (ai === 'bomber') return lerpPose(PZ.stand, PZ.throwBack, easeOut(k));
        if (ai === 'mage') return lerpPose(PZ.stand, PZ.castUp, easeOut(k));
        if (ai === 'brute') return lerpPose(PZ.stand, PZ.castUp, easeOut(k));
        if (ai === 'shield') return lerpPose(PZ.stand, PZ.shieldUp, easeOut(k));
        return lerpPose(PZ.stand, PZ.windup, easeOut(k));
      }
      case 'attack':
        if (ai === 'brute') return mkPose(0.6, 1.2, 0.2, 1.3, 0.2, -0.6, 0.1, 0.8, -0.8);
        if (ai === 'shield') return mkPose(0.45, 1.6, 0.4, 0.3, 1.0, -0.6, 0.1, 0.7, -0.5);
        return PZ.strike;
      case 'recover':
        if (ai === 'archer') return lerpPose(PZ.aim, PZ.stand, clamp(this.st / 0.3, 0, 1));
        if (ai === 'bomber') return lerpPose(PZ.throwFwd, PZ.stand, clamp(this.st / 0.4, 0, 1));
        if (ai === 'mage') return lerpPose(PZ.cast, PZ.stand, clamp(this.st / 0.4, 0, 1));
        return lerpPose(PZ.strike, PZ.stand, clamp(this.st / 0.35, 0, 1));
      case 'throw': return PZ.throwFwd;
      case 'dash': return PZ.dash;
    }
    if (!this.onGround) return this.vy < 0 ? PZ.jump : PZ.fall;
    if (Math.abs(this.vx) > 15) return Math.abs(this.vx) > 120 ? runPose(this.animPh) : walkPose(this.animPh);
    if (ai === 'shield') return PZ.shieldUp;
    return idlePose(this.t);
  }

  skel() {
    const pose = this.getPose();
    if (this.freezeT > 0 && !this.frozenPose) this.frozenPose = pose;
    return skel(this.cx, this.feet, this.facing, this.s, pose, this.onGround || this.T.ai === 'shade');
  }

  draw(ctx) {
    const T = this.T;
    const S = this.scene;
    ctx.save();
    let a = this.alpha;
    if (this.spawnT > 0) a *= 1 - this.spawnT / 0.45;
    if (T.ai === 'shade') a *= 0.75;
    ctx.globalAlpha = clamp(a, 0, 1);
    const col = this.flash > 0 ? '#ffffff' : T.color;
    const warn = this.state === 'windup' && this.st > (T.windup || 0.5) - 0.18;
    if (T.body) {
      const x = this.cx;
      if (T.body === 'bat' || T.body === 'imp') drawBat(ctx, x, this.cy, T.body === 'imp' ? 1.05 : 1, this.t, col, this.facing, T.body === 'imp');
      else if (T.body === 'slime') {
        drawShadowEllipse(ctx, x, this.feet, 12, 0.2);
        drawSlime(ctx, x, this.feet, 1, this.t, col, this.onGround ? this.squash : -0.3, this.facing);
      } else if (T.body === 'spider' || T.body === 'scorpion') {
        drawShadowEllipse(ctx, x, this.feet, 14, 0.2);
        drawSpider(ctx, x, this.feet, 1, this.t, col, this.facing, Math.abs(this.vx) > 10, T.body === 'scorpion');
      }
      if (warn || this.state === 'swoopPrep') this.drawAlert(ctx, x, this.y - 12);
    } else {
      const k = this.skel();
      this.lastK = k;
      if (this.onGround) drawShadowEllipse(ctx, this.cx, this.feet, 12 * this.s, 0.22);
      if (warn) {
        ctx.save();
        ctx.globalAlpha *= 0.6;
        drawStick(ctx, k, '#ff1744', { lw: 6 });
        ctx.restore();
      }
      if (T.ai === 'shade') drawStick(ctx, k, '#4a148c', { outline: 'rgba(234,128,252,0.4)' });
      else drawStick(ctx, k, col, { outline: 'rgba(0,0,0,0.35)', back: shade(T.color, -0.25), eye: '#ffffff', angry: true });
      this.drawGear(ctx, k, col);
      if (this.state === 'windup' && this.st < 0.3) this.drawAlert(ctx, k.headX, k.headY - 16 * this.s);
    }
    if (this.freezeT > 0) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#b3e5fc';
      roundRect(ctx, this.x - 5, this.y - 8, this.w + 10, this.h + 10, 4);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#e1f5fe';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (this.stunT > 0 && !this.freezeT) {
      for (let i = 0; i < 3; i++) {
        const ang = this.t * 6 + (i * TAU) / 3;
        ctx.fillStyle = '#ffeb3b';
        ctx.fillRect(this.cx + Math.cos(ang) * 10 - 2, this.y - 8 + Math.sin(ang) * 3 - 2, 4, 4);
      }
    }
    if (this.hpShow > 0 && this.hp < this.maxHp && T.ai !== 'shade') {
      const bw = Math.max(26, this.w + 8), bx = this.cx - bw / 2, by = this.y - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = '#ef5350';
      ctx.fillRect(bx, by, bw * clamp(this.hp / this.maxHp, 0, 1), 3);
    }
    ctx.restore();
    void S;
  }

  drawAlert(ctx, x, y) {
    ctx.fillStyle = '#ff1744';
    ctx.font = '900 14px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', x, y);
  }

  drawGear(ctx, k, col) {
    const T = this.T;
    const s = this.s;
    if (T.weapon === 'bow') drawBow(ctx, k, this.state === 'windup');
    else if (T.weapon === 'shield') drawShield(ctx, k, '#1565c0');
    else if (T.weapon === 'bomb') { if (this.state === 'windup' || this.state === 'idle' || this.state === 'chase') drawWeapon(ctx, k, 'bomb', this.t); }
    else if (T.weapon) drawWeapon(ctx, k, T.weapon, this.t);
    if (T.helmet) {
      ctx.fillStyle = '#37474f';
      ctx.beginPath();
      ctx.arc(k.headX, k.headY, k.hr + 1.5, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(k.headX - k.hr - 1.5, k.headY - 1, (k.hr + 1.5) * 2, 4 * s);
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(k.headX + k.f * 1 * s - 3 * s, k.headY + 0.5, 6 * s, 1.5 * s);
      ctx.fillStyle = '#c62828';
      ctx.beginPath();
      ctx.moveTo(k.headX, k.headY - k.hr - 1);
      ctx.quadraticCurveTo(k.headX - k.f * 10 * s, k.headY - k.hr - 8 * s, k.headX - k.f * 14 * s, k.headY - k.hr + 2);
      ctx.lineTo(k.headX - k.f * 4 * s, k.headY - k.hr);
      ctx.fill();
    }
    if (T.bandage) {
      ctx.strokeStyle = 'rgba(120,100,90,0.8)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const tt = 0.2 + i * 0.28;
        const x = lerp(k.hx, k.nx, tt), y = lerp(k.hy, k.ny, tt);
        ctx.beginPath(); ctx.moveTo(x - 3, y - 1); ctx.lineTo(x + 3, y + 1.5); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(k.headX - k.hr, k.headY - 2); ctx.lineTo(k.headX + k.hr, k.headY + 1); ctx.stroke();
    }
    if (T.fur) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(k.headX, k.headY + 1, k.hr * 1.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0277bd';
      ctx.fillRect(k.headX + k.f * 2 * s - 4 * s, k.headY - 1, 8 * s, 4 * s);
    }
    if (T.ai === 'mage') {
      ctx.fillStyle = shade(T.color, -0.3);
      ctx.beginPath();
      ctx.moveTo(k.headX - k.hr - 2, k.headY - 2);
      ctx.lineTo(k.headX - k.f * 3, k.headY - k.hr - 14);
      ctx.lineTo(k.headX + k.hr + 2, k.headY - 2);
      ctx.fill();
    }
    if (T.ai === 'ninja') {
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(k.headX - k.f * k.hr, k.headY - 2);
      ctx.lineTo(k.headX - k.f * (k.hr + 9), k.headY - 4 + Math.sin(this.t * 12) * 2);
      ctx.stroke();
    }
    if (T.ai === 'bomber') {
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(k.headX - k.hr - 1, k.headY - k.hr - 1, (k.hr + 1) * 2, 4);
    }
  }
}
