// ---------- Player attacks ----------
const hbox = (fx, y, w, h) => ({ fx, y, w, h });
const A = (o) => Object.assign({ dmg: 1, kb: [1, 0], lunge: 0, heavy: false, hit: [0.3, 0.55], sfx: 'swing', slash: null }, o);

const ATTACKS = {
  fist: {
    c1: A({ dur: 0.22, hit: [0.25, 0.55], box: (R) => hbox(2, -46, R + 6, 22), dmg: 1, kb: [0.8, 0], lunge: 70,
      poses: [mkPose(0.1, 0.5, 1.4, 1.0, 1.9, -0.2, 0.05, 0.3, -0.1), mkPose(0.28, 0.5, 1.4, 1.62, 0.0, -0.35, 0.05, 0.45, -0.25)], thrust: true }),
    c2: A({ dur: 0.24, hit: [0.25, 0.55], box: (R) => hbox(2, -46, R + 10, 24), dmg: 1.1, kb: [0.9, 0], lunge: 90,
      poses: [mkPose(0.0, 0.9, 1.8, 0.6, 1.4, -0.3, 0.05, 0.4, -0.2), mkPose(0.45, 1.62, 0.0, 0.4, 1.4, -0.55, 0.1, 0.55, -0.35)], thrust: true }),
    c3: A({ dur: 0.36, hit: [0.3, 0.6], box: (R) => hbox(0, -54, R + 18, 36), dmg: 1.7, kb: [1.8, -180], lunge: 130, heavy: true, sfx: 'swingHeavy',
      poses: [mkPose(-0.1, 1.2, 1.0, 1.0, 1.2, -0.1, 0, 0.9, -1.8), mkPose(-0.35, 1.4, 0.6, 1.9, 0.5, -0.15, 0, 1.75, 0.0)], slash: { r: 30, a0: -0.8, a1: 0.5, cy: -30 } }),
    air: A({ dur: 0.3, hit: [0.2, 0.6], box: (R) => hbox(-4, -50, R + 20, 50), dmg: 1.0, kb: [0.9, -80],
      poses: [mkPose(-0.1, 1.8, 0.5, 2.0, 0.5, 0.4, -1.4, 0.9, -1.5), mkPose(-0.25, 1.8, 0.5, 2.2, 0.5, 0.5, -1.6, 1.45, 0.0)], slash: { r: 28, a0: -0.4, a1: 0.9, cy: -20 } }),
    up: A({ dur: 0.34, hit: [0.2, 0.55], box: (R) => hbox(-6, -88, R + 16, 84), dmg: 1.2, kb: [0.3, -560], launch: true,
      poses: [mkPose(0.3, 0.5, 1.4, 0.3, 1.8, -0.4, -0.6, 0.9, -1.3), mkPose(-0.2, 0.6, 1.2, 3.0, 0.2, -0.1, 0, 0.4, -0.6)], slash: { r: 34, a0: 0.3, a1: -1.9, cy: -40 } }),
    dash: A({ dur: 0.32, hit: [0.1, 0.55], box: (R) => hbox(0, -48, R + 26, 30), dmg: 1.5, kb: [2.2, -120], heavy: true, sfx: 'swingHeavy',
      poses: [PZ.dash, mkPose(0.7, -0.8, 0.3, 1.6, 0.0, -0.9, -0.3, 0.4, -0.6)], thrust: true }),
    slam: mkPose(0.1, 2.6, 0.3, 2.8, 0.3, 0.1, -0.2, 0.2, -0.1),
  },
  blade: {
    c1: A({ dur: 0.3, hit: [0.3, 0.55], box: (R) => hbox(-2, -64, R + 10, 60), dmg: 1, kb: [0.9, 0], lunge: 80,
      poses: [mkPose(-0.12, 0.5, 1.0, 3.5, 0.4, -0.3, 0.0, 0.35, -0.2), mkPose(0.32, 0.2, 0.8, 1.15, 0.15, -0.5, 0.1, 0.6, -0.4)], slash: { a0: -2.1, a1: 0.7, cy: -34 } }),
    c2: A({ dur: 0.3, hit: [0.3, 0.55], box: (R) => hbox(-2, -72, R + 6, 68), dmg: 1.1, kb: [0.8, -140], lunge: 80,
      poses: [mkPose(0.25, 0.6, 1.0, 0.45, 0.25, -0.4, 0.05, 0.55, -0.35), mkPose(-0.15, 0.3, 1.0, 2.95, 0.2, -0.3, 0, 0.4, -0.2)], slash: { a0: 0.9, a1: -1.9, cy: -34 } }),
    c3: A({ dur: 0.44, hit: [0.35, 0.6], box: (R) => hbox(-4, -66, R + 18, 66), dmg: 1.7, kb: [1.8, -200], lunge: 150, heavy: true, sfx: 'swingHeavy',
      poses: [mkPose(-0.25, 1.0, 1.2, 3.8, 0.3, -0.4, 0.0, 0.5, -0.3), mkPose(0.55, -0.2, 1.0, 0.85, 0.0, -0.9, 0.2, 1.1, -0.9)], slash: { a0: -2.4, a1: 0.95, cy: -32, width: 10 } }),
    air: A({ dur: 0.32, hit: [0.15, 0.7], box: (R) => hbox(-R * 0.5 - 10, -66, R * 1.5 + 30, 74), dmg: 1.0, kb: [0.7, -90], spin: true,
      poses: [mkPose(0, 1.5, 0.5, 1.6, 0.0, 0.3, -1.2, 0.8, -1.4), mkPose(0, 1.5, 0.5, 1.6, 0.0, 0.3, -1.2, 0.8, -1.4)], slash: { a0: -Math.PI, a1: Math.PI, cy: -26, full: true } }),
    up: A({ dur: 0.36, hit: [0.2, 0.55], box: (R) => hbox(-8, -96, R + 14, 92), dmg: 1.2, kb: [0.3, -580], launch: true,
      poses: [mkPose(0.25, 0.5, 1.2, 0.3, 0.3, -0.5, -0.5, 0.8, -1.2), mkPose(-0.2, 0.5, 0.6, 3.1, 0.0, -0.1, 0.0, 0.5, -0.8)], slash: { a0: 0.8, a1: -2.0, cy: -40 } }),
    dash: A({ dur: 0.34, hit: [0.1, 0.55], box: (R) => hbox(0, -50, R + 30, 32), dmg: 1.5, kb: [2.2, -120], heavy: true, sfx: 'swingHeavy',
      poses: [PZ.dash, mkPose(0.6, -0.9, 0.3, 1.55, 0.0, -0.8, -0.2, 1.0, -0.4, { w: 1.57 })], thrust: true }),
    slam: mkPose(0.2, 1.8, 0.4, 0.2, 0.0, 0.5, -1.2, 1.0, -1.4, { w: 0.05 }),
  },
  spear: {
    c1: A({ dur: 0.3, hit: [0.3, 0.55], box: (R) => hbox(6, -48, R + 6, 20), dmg: 1, kb: [0.9, 0], lunge: 60,
      poses: [mkPose(0.0, 0.8, 1.2, 0.9, 1.7, -0.3, 0, 0.4, -0.2, { w: 1.57 }), mkPose(0.35, 0.9, 1.0, 1.55, 0.0, -0.6, 0.1, 0.7, -0.4, { w: 1.57 })], thrust: true }),
    c2: A({ dur: 0.3, hit: [0.3, 0.55], box: (R) => hbox(6, -64, R + 2, 26), dmg: 1.1, kb: [0.9, -120], lunge: 60,
      poses: [mkPose(0.05, 0.8, 1.2, 1.1, 1.6, -0.3, 0, 0.4, -0.2, { w: 1.95 }), mkPose(0.3, 1.0, 1.0, 1.95, 0.0, -0.5, 0, 0.6, -0.3, { w: 1.95 })], thrust: true }),
    c3: A({ dur: 0.46, hit: [0.35, 0.6], box: (R) => hbox(-6, -58, R + 12, 58), dmg: 1.7, kb: [1.8, -200], lunge: 120, heavy: true, sfx: 'swingHeavy',
      poses: [mkPose(-0.2, 1.2, 0.8, 3.4, 0.2, -0.3, 0, 0.5, -0.3, { w: 3.9 }), mkPose(0.5, 0.2, 1.0, 1.0, 0.0, -0.8, 0.2, 1.0, -0.8, { w: 1.1 })], slash: { a0: -2.2, a1: 0.8, cy: -30, width: 9 } }),
    air: A({ dur: 0.34, hit: [0.15, 0.7], box: (R) => hbox(-R * 0.6 - 10, -62, R * 1.6 + 20, 68), dmg: 1.0, kb: [0.7, -90], spin: true,
      poses: [mkPose(0, 1.5, 0.5, 1.6, 0, 0.3, -1.2, 0.8, -1.4, { w: 1.57 }), mkPose(0, 1.5, 0.5, 1.6, 0, 0.3, -1.2, 0.8, -1.4, { w: 1.57 })], slash: { a0: -Math.PI, a1: Math.PI, cy: -26, full: true } }),
    up: A({ dur: 0.36, hit: [0.2, 0.55], box: (R) => hbox(-10, -48 - R, 26, R + 44), dmg: 1.2, kb: [0.3, -580], launch: true,
      poses: [mkPose(0.2, 0.5, 1.2, 1.0, 1.5, -0.5, -0.5, 0.8, -1.2, { w: 2.4 }), mkPose(-0.15, 0.5, 0.6, 3.0, 0.0, -0.1, 0.0, 0.5, -0.8, { w: 3.14 })], thrust: true }),
    dash: A({ dur: 0.34, hit: [0.1, 0.55], box: (R) => hbox(0, -50, R + 34, 26), dmg: 1.5, kb: [2.2, -120], heavy: true, sfx: 'swingHeavy',
      poses: [PZ.dash, mkPose(0.6, -0.9, 0.3, 1.55, 0.0, -0.8, -0.2, 1.0, -0.4, { w: 1.57 })], thrust: true }),
    slam: mkPose(0.2, 1.8, 0.4, 0.2, 0.0, 0.5, -1.2, 1.0, -1.4, { w: 0.0 }),
  },
};
// Hammer uses the blade moves, but every hit is heavy and hits harder.
ATTACKS.hammer = {};
for (const k in ATTACKS.blade) {
  const a = ATTACKS.blade[k];
  ATTACKS.hammer[k] = a.dur ? Object.assign({}, a, { heavy: true, sfx: 'swingHeavy', kb: [a.kb[0] * 1.2, a.kb[1]] }) : a;
}

// ---------- Player ----------
class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.w = 18; this.h = 46;
    this.x = x - this.w / 2; this.y = y - this.h;
    this.vx = 0; this.vy = 0; this.facing = 1;
    this.onGround = false; this.onIce = false; this.onPlat = false; this.plat = null;
    this.refreshStats(true);
    this.state = 'normal'; this.t = 0; this.animT = 0; this.runPh = 0;
    this.jumps = 0; this.coyote = 0; this.jumpBuf = 0; this.jumpHeld = false; this.dropping = 0; this.dashBuf = 0;
    this.airDash = true; this.airAtk = 0; this.dashCd = 0; this.dashT = 0;
    this.inv = 0; this.flash = 0; this.rot = 0; this.spinT = 0;
    this.combo = 0; this.comboWin = 0; this.cur = null; this.queued = false;
    this.skillCd = [0, 0]; this.slowT = 0;
    this.hitChain = 0; this.hitChainT = 0;
    this.dead = false; this.deadT = 0; this.victory = false;
    this.safe = { x: this.x, y: this.y };
    this.ghostT = 0; this.landT = 0; this.hurtT = 0; this.castT = 0; this.recoverT = 0; this.whirlT = 0; this.tick = 0;
    this.scarf = [];
    for (let i = 0; i < 7; i++) this.scarf.push({ x: this.x, y: this.y + 8 });
  }
  refreshStats(full) {
    const st = playerStats(SAVE);
    const oldMax = this.maxHp || st.maxHp;
    this.maxHp = st.maxHp; this.power = st.atk; this.def = st.def;
    this.maxEn = st.maxEn; this.enRegen = st.enRegen; this.potMax = st.potMax;
    if (full) { this.hp = this.maxHp; this.en = Math.round(this.maxEn * 0.6); }
    else this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - oldMax));
    this.weaponId = SAVE.weapon;
    this.weapon = WEAPONS[this.weaponId] || WEAPONS.fists;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get feet() { return this.y + this.h; }

  update(dt) {
    const I = Input;
    this.t += dt;
    this.animT += dt;
    this.inv = Math.max(0, this.inv - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.skillCd[0] = Math.max(0, this.skillCd[0] - dt);
    this.skillCd[1] = Math.max(0, this.skillCd[1] - dt);
    this.comboWin = Math.max(0, this.comboWin - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.dropping = Math.max(0, this.dropping - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.dashBuf = Math.max(0, this.dashBuf - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.landT = Math.max(0, this.landT - dt);
    if (this.hitChainT > 0) {
      this.hitChainT -= dt;
      if (this.hitChainT <= 0) this.endChain();
    }
    if (this.spinT > 0) {
      this.spinT -= dt;
      this.rot = (1 - Math.max(0, this.spinT) / 0.36) * TAU * this.facing;
      if (this.spinT <= 0) this.rot = 0;
    }
    if (this.dead) { this.deadT += dt; return; }
    if (this.victory) {
      this.state = 'normal';
      this.vx = approach(this.vx, 0, 1500 * dt);
      this.physics(dt);
      return;
    }
    this.en = Math.min(this.maxEn, this.en + this.enRegen * dt);
    if (I.pressed.jump) this.jumpBuf = 0.13;
    if (I.pressed.dash) this.dashBuf = 0.15;
    if (I.pressed.potion) this.usePotion();

    switch (this.state) {
      case 'normal': this.stNormal(dt); break;
      case 'attack': this.stAttack(dt); break;
      case 'dash': this.stDash(dt); break;
      case 'slam': this.stSlam(dt); break;
      case 'whirl': this.stWhirl(dt); break;
      case 'cast':
        this.castT -= dt;
        this.vx = approach(this.vx, 0, 1400 * dt);
        if (this.castT <= 0) this.state = 'normal';
        break;
      case 'recover':
        this.recoverT -= dt;
        this.vx = approach(this.vx, 0, 1800 * dt);
        if (this.recoverT <= 0) this.state = 'normal';
        break;
      case 'hurt':
        this.hurtT -= dt;
        this.vx = approach(this.vx, 0, 500 * dt);
        if (this.hurtT <= 0) this.state = 'normal';
        break;
    }
    if (this.state !== 'dead') this.physics(dt);
    if (Math.abs(this.vx) > 20 && this.onGround) {
      const prev = this.runPh;
      this.runPh += Math.abs(this.vx) * dt * 0.052;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.runPh / Math.PI)) Sound.play('step');
    }
  }

  physics(dt) {
    const S = this.scene;
    if (this.state !== 'dash' && this.state !== 'whirl') {
      let g = GRAVITY * (this.vy > 0 ? 1.15 : 1);
      if (this.state === 'attack' && !this.onGround) g *= 0.4;
      this.vy = Math.min(this.vy + g * dt, this.state === 'slam' ? 1100 : 900);
    }
    const wasGround = this.onGround;
    const prevVy = this.vy;
    moveActor(this, dt, S.world, S.platforms);
    if (this.onGround) {
      this.coyote = 0.1;
      this.jumps = 0;
      this.airDash = true;
      this.airAtk = 0;
      if (!wasGround) this.onLand(prevVy);
      if (!this.onPlat && this.state !== 'hurt') {
        const W = S.world;
        const c0 = Math.floor((this.x - 22) / TILE), c1 = Math.floor((this.x + this.w + 22) / TILE);
        const r = Math.floor((this.y + this.h + 2) / TILE);
        let ok = true;
        for (let c = c0; c <= c1; c++) {
          const t = W.get(c, r);
          if (t !== T_SOLID && t !== T_ICE) ok = false;
          const ta = W.get(c, r - 1);
          if (ta === T_SPIKE || ta === T_LAVA) ok = false;
        }
        if (ok) { this.safe.x = this.x; this.safe.y = this.y; }
      }
    }
    this.checkTiles();
    if (this.y > S.world.ph + 40 && !this.dead) S.playerFell();
  }

  onLand(prevVy) {
    if (prevVy > 420) {
      this.landT = 0.1;
      this.scene.fx.dust(this.cx, this.feet, 4);
      Sound.play('land');
    }
  }

  checkTiles() {
    const W = this.scene.world;
    const c0 = Math.floor((this.x + 3) / TILE), c1 = Math.floor((this.x + this.w - 3) / TILE);
    const r0 = Math.floor((this.y + 4) / TILE), r1 = Math.floor((this.y + this.h - 1) / TILE);
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const t = W.get(c, r);
        if (t === T_SPIKE && this.y + this.h > r * TILE + 12) { this.scene.hazardHit(c * TILE + 16, 0.12, true); return; }
        if (t === T_LAVA && this.y + this.h > r * TILE + 8) { this.scene.lavaHit(); return; }
      }
    }
  }

  moveInput() {
    const I = Input;
    return (I.held.right ? 1 : 0) - (I.held.left ? 1 : 0);
  }

  stNormal(dt) {
    const I = Input;
    const dir = this.moveInput();
    const spd = 235 * (this.slowT > 0 ? 0.55 : 1);
    let acc, fr;
    if (this.onGround) { acc = this.onIce ? 650 : 2400; fr = this.onIce ? 200 : 2600; }
    else { acc = 1500; fr = 500; }
    if (dir) {
      this.vx = approach(this.vx, dir * spd, acc * dt);
      this.facing = dir;
    } else this.vx = approach(this.vx, 0, fr * dt);
    if (this.jumpBuf > 0) this.tryJump();
    if (!I.held.jump && this.jumpHeld) {
      this.jumpHeld = false;
      if (this.vy < -330 && !Input.touchMode) this.vy = -330;
    }
    if (I.pressed.attack || (I.held.attack && this.canAutoAttack())) this.startAttack(false);
    else if (this.dashBuf > 0) this.startDash();
    else if (I.pressed.skill1) this.castSkill(0);
    else if (I.pressed.skill2) this.castSkill(1);
  }

  canJump() { return this.onGround || this.coyote > 0 || this.jumps < 2; }

  // Holding ATTACK keeps the combo going; in the air it only repeats while air attacks remain.
  canAutoAttack() { return this.onGround || this.airAtk < 3; }

  tryJump() {
    const I = Input;
    const S = this.scene;
    if (this.onGround || this.coyote > 0) {
      if (I.held.down && this.onGround && this.onPlat) {
        this.dropping = 0.28;
        this.onGround = false;
        this.jumpBuf = 0;
        this.plat = null;
        return;
      }
      this.vy = -640;
      this.jumps = 1;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.jumpHeld = true;
      this.onGround = false;
      this.plat = null;
      Sound.play('jump');
      S.fx.dust(this.cx, this.feet, 4);
    } else if (this.jumps < 2) {
      this.vy = -580;
      this.jumps = 2;
      this.jumpBuf = 0;
      this.jumpHeld = true;
      this.spinT = 0.36;
      Sound.play('djump');
      S.fx.ring(this.cx, this.feet, 4, 22, 'rgba(255,255,255,0.8)', 0.25, 2);
    }
  }

  startAttack(fromDash) {
    const I = Input;
    const style = this.weapon.style;
    let kind;
    if (fromDash) kind = 'dash';
    else if (!this.onGround) {
      if (I.held.down) kind = 'slam';
      else if (I.held.up) kind = 'up';
      else kind = 'air';
    } else if (I.held.up) kind = 'up';
    else kind = 'c' + (this.comboWin > 0 ? Math.min(3, this.combo + 1) : 1);
    if (!this.onGround && (kind === 'air' || kind === 'up')) {
      if (this.airAtk >= 3) return;
      this.airAtk++;
    }
    this.jumpHeld = false;
    if (kind === 'slam') {
      this.state = 'slam';
      this.vy = -160;
      this.vx = this.facing * 40;
      this.cur = { kind: 'slam', t: 0, hitSet: new Set() };
      Sound.play('swing');
      return;
    }
    const spec = ATTACKS[style][kind];
    this.cur = { kind, spec, t: 0, dur: spec.dur / this.weapon.speed, hitSet: new Set(), lunged: false };
    if (kind[0] === 'c') this.combo = +kind[1];
    this.state = 'attack';
    this.queued = false;
    if (kind === 'up') {
      this.vy = this.onGround ? -470 : Math.min(this.vy, -340);
      this.onGround = false;
      this.plat = null;
    }
    if (kind === 'air' && this.vy > -120) this.vy = -120;
    if (kind === 'dash') this.inv = Math.max(this.inv, 0.12);
  }

  hitboxFor(spec) {
    const b = spec.box(this.weapon.reach);
    return { x: this.facing > 0 ? this.cx + b.fx : this.cx - b.fx - b.w, y: this.feet + b.y, w: b.w, h: b.h };
  }

  stAttack(dt) {
    const I = Input;
    const a = this.cur;
    if (!a) { this.state = 'normal'; return; }
    const sp = a.spec;
    a.t += dt;
    const p = a.t / a.dur;
    if (this.onGround) this.vx = approach(this.vx, 0, 1700 * dt);
    else {
      const dir = this.moveInput();
      this.vx = approach(this.vx, dir * 160, 900 * dt);
    }
    if (!a.lunged && p >= sp.hit[0]) {
      a.lunged = true;
      if (sp.lunge) this.vx = this.facing * sp.lunge * (this.onGround ? 1 : 0.4);
      Sound.play(sp.sfx);
      this.spawnSwingFx(sp);
    }
    if (p >= sp.hit[0] && p <= sp.hit[1]) this.doMelee(sp, this.hitboxFor(sp));
    if (I.pressed.attack || (I.held.attack && p > sp.hit[1])) this.queued = true;
    if (p >= sp.hit[0] && this.dashBuf > 0 && this.dashCd <= 0 && (this.onGround || this.airDash)) { this.startDash(); return; }
    if (p > sp.hit[1]) {
      if (this.jumpBuf > 0 && this.canJump()) { this.state = 'normal'; this.cur = null; this.tryJump(); return; }
      if (I.pressed.skill1) { this.castSkill(0); if (this.state !== 'attack') return; }
      if (I.pressed.skill2) { this.castSkill(1); if (this.state !== 'attack') return; }
      if (this.queued && p > sp.hit[1] + 0.08) {
        if (a.kind[0] === 'c' && this.combo < 3 && this.onGround) { this.comboWin = 1; this.startAttack(false); return; }
        if ((a.kind === 'air' || a.kind === 'up') && !this.onGround && this.airAtk < 3) { this.startAttack(false); return; }
        if (a.kind === 'dash' && this.onGround) { this.comboWin = 0; this.startAttack(false); return; }
      }
    }
    if (p >= 1) {
      this.state = 'normal';
      if (a.kind[0] === 'c') this.comboWin = a.kind === 'c3' ? 0 : 0.35;
      this.cur = null;
      if (this.queued && this.onGround) { this.queued = false; this.startAttack(false); }
    }
  }

  spawnSwingFx(sp) {
    const S = this.scene;
    const col = this.weaponId === 'cosmic' ? '#d1b3ff' : this.weaponId === 'fists' ? 'rgba(255,224,130,0.9)' : 'rgba(255,255,255,0.85)';
    if (sp.slash) {
      const r = sp.slash.r || this.weapon.reach * 0.85 + 8;
      S.fx.slash(this.cx, this.feet + sp.slash.cy, r, sp.slash.a0, sp.slash.a1, this.facing, col, sp.slash.width || 7, sp.slash.full ? 0.22 : 0.16);
    } else if (sp.thrust) {
      const hb = this.hitboxFor(sp);
      const y = hb.y + hb.h / 2;
      for (let i = 0; i < 3; i++) {
        S.fx.add({ type: 'line', x: this.facing > 0 ? hb.x + hb.w : hb.x, y: y + rand(-5, 5), vx: this.facing * rand(500, 800), vy: 0, g: 0, drag: 8, life: 0.12, color: col, size: 2 });
      }
    }
  }

  doMelee(sp, hb) {
    const S = this.scene;
    const a = this.cur;
    const heavy = sp.heavy || !!this.weapon.heavy;
    let hitAny = false;
    for (const e of S.enemies) {
      if (e.dead || a.hitSet.has(e)) continue;
      if (!overlap(hb, e)) continue;
      a.hitSet.add(e);
      const r = S.playerHit(e, {
        dmg: this.power * this.weapon.dmg * sp.dmg, dir: this.facing, kbx: sp.kb[0] * this.weapon.kb, kby: sp.kb[1],
        heavy, launch: !!sp.launch, x: clamp(e.x + e.w / 2, hb.x, hb.x + hb.w), y: clamp(e.y + e.h * 0.4, hb.y, hb.y + hb.h), kind: 'melee',
      });
      if (r) hitAny = true;
    }
    for (const c of S.props) {
      if (c.dead || !c.isProp || a.hitSet.has(c)) continue;
      if (overlap(hb, c)) { a.hitSet.add(c); c.takeHit({ heavy }, S); }
    }
    for (const pr of S.projectiles) {
      if (pr.owner === 'enemy' && pr.destroyable && !pr.dead && circleRect(pr.x, pr.y, pr.r + 4, hb)) pr.hitBy(S, this.facing);
    }
    if (hitAny && !this.onGround && this.vy > -60) this.vy = -60;
  }

  startDash() {
    if (this.dashCd > 0) return;
    if (!this.onGround && !this.airDash) return;
    const dir = this.moveInput();
    if (dir) this.facing = dir;
    this.state = 'dash';
    this.cur = null;
    this.dashT = 0.2;
    this.vx = this.facing * 560;
    this.vy = 0;
    this.inv = Math.max(this.inv, 0.24);
    this.dashCd = 0.5;
    this.dashBuf = 0;
    if (!this.onGround) this.airDash = false;
    Sound.play('dash');
    this.scene.fx.dust(this.cx - this.facing * 6, this.feet, 4);
  }

  stDash(dt) {
    this.dashT -= dt;
    this.vy = 0;
    this.ghostT -= dt;
    if (this.ghostT <= 0) {
      this.ghostT = 0.035;
      this.scene.fx.ghost(this.skel(), '#90caf9', 0.2);
    }
    if (Input.pressed.attack) { this.startAttack(true); return; }
    if (this.jumpBuf > 0 && this.canJump()) { this.state = 'normal'; this.vx *= 0.7; this.tryJump(); return; }
    if (this.dashT <= 0) { this.state = 'normal'; this.vx = this.facing * 235; }
  }

  stSlam(dt) {
    const S = this.scene;
    const a = this.cur;
    a.t += dt;
    if (a.t > 0.08) this.vy = 1050;
    this.vx = approach(this.vx, 0, 400 * dt);
    const hb = { x: this.cx - 16, y: this.feet - 16, w: 32, h: 28 };
    for (const e of S.enemies) {
      if (e.dead || a.hitSet.has(e) || !overlap(hb, e)) continue;
      a.hitSet.add(e);
      S.playerHit(e, { dmg: this.power * this.weapon.dmg * 0.8, dir: this.facing, kbx: 60, kby: 300, heavy: false, x: this.cx, y: this.feet, kind: 'melee' });
    }
    if (this.onGround && a.t > 0.08) {
      const R = 62 + this.weapon.reach * 0.5;
      const q = { x: this.cx - R, y: this.feet - 40, w: R * 2, h: 44 };
      const heavyHit = new Set();
      for (const e of S.enemies) {
        if (e.dead || heavyHit.has(e) || !overlap(q, e)) continue;
        heavyHit.add(e);
        S.playerHit(e, { dmg: this.power * this.weapon.dmg * 1.5, dir: sign(e.x + e.w / 2 - this.cx) || this.facing, kbx: 160, kby: -380, heavy: true, launch: true, x: e.x + e.w / 2, y: this.feet - 10, kind: 'melee' });
      }
      for (const c of S.props) if (!c.dead && c.isProp && overlap(q, c)) c.takeHit({ heavy: true }, S);
      S.fx.ring(this.cx, this.feet, 8, R, 'rgba(255,255,255,0.8)', 0.3, 4);
      S.fx.dust(this.cx - 20, this.feet, 5);
      S.fx.dust(this.cx + 20, this.feet, 5);
      S.shake(7, 0.25);
      Sound.play('hitHeavy');
      this.state = 'recover';
      this.recoverT = 0.16;
      this.cur = null;
      return;
    }
    if (a.t > 1.6) { this.state = 'normal'; this.cur = null; }
  }

  stWhirl(dt) {
    const S = this.scene;
    this.whirlT -= dt;
    this.inv = Math.max(this.inv, 0.1);
    const dir = this.moveInput();
    if (dir) this.facing = dir;
    this.vx = approach(this.vx, dir * 270, 2000 * dt);
    this.vy = approach(this.vy, 110, 1500 * dt);
    this.rot += dt * 26 * this.facing;
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.11;
      const hb = { x: this.cx - 50, y: this.y - 10, w: 100, h: this.h + 20 };
      for (const e of S.enemies) {
        if (e.dead || !overlap(hb, e)) continue;
        S.playerHit(e, { dmg: this.power * (0.55 + this.weapon.dmg * 0.35), dir: sign(e.x + e.w / 2 - this.cx) || 1, kbx: 90, kby: -120, heavy: false, x: e.x + e.w / 2, y: e.y + e.h / 2, kind: 'skill' });
      }
      for (const c of S.props) if (!c.dead && c.isProp && overlap(hb, c)) c.takeHit({ heavy: true }, S);
      for (const pr of S.projectiles) if (pr.owner === 'enemy' && pr.destroyable && !pr.dead && circleRect(pr.x, pr.y, pr.r, hb)) pr.hitBy(S, this.facing);
      S.fx.slash(this.cx, this.cy, 40, -Math.PI, Math.PI, 1, 'rgba(174,213,129,0.8)', 6, 0.12);
      Sound.play('swing');
    }
    if (this.whirlT <= 0) { this.state = 'normal'; this.rot = 0; }
  }

  castSkill(slot) {
    const id = SAVE.slots[slot];
    if (!id) return;
    const sk = SKILLS[id];
    const S = this.scene;
    if (this.skillCd[slot] > 0) return;
    if (this.en < sk.cost) {
      S.fx.text(this.cx, this.y - 10, 'NO ENERGY', '#90caf9', 11);
      Sound.play('error');
      this.skillCd[slot] = 0.3;
      return;
    }
    this.en -= sk.cost;
    this.skillCd[slot] = sk.cd;
    this.cur = null;
    const f = this.facing, P = this.power;
    S.stats.skills++;
    switch (id) {
      case 'blast':
        S.addProjectile(new Projectile({ type: 'pblast', owner: 'player', x: this.cx + f * 16, y: this.y + 18, vx: f * 580, r: 11, dmg: P * 2.2, pierce: true, life: 1.1, kb: 200 }));
        this.state = 'cast'; this.castT = 0.2; this.castPose = PZ.cast;
        Sound.play('blast');
        S.fx.ring(this.cx + f * 16, this.y + 18, 4, 20, '#4fc3f7', 0.2, 3);
        break;
      case 'quake': {
        const gy = S.world.groundBelow(this.cx, this.feet - 4);
        const y = gy != null && gy - this.feet < 220 ? gy : this.feet;
        for (const d of [-1, 1]) {
          S.addProjectile(new Projectile({ type: 'pquake', owner: 'player', x: this.cx + d * 10, y, vx: d * 400, r: 16, dmg: P * 2.4, pierce: true, life: 0.95, hgt: 36, heavy: true, launch: true, kby: -420 }));
        }
        S.shake(8, 0.35);
        S.fx.ring(this.cx, y, 10, 70, '#ffb74d', 0.35, 5);
        Sound.play('quake');
        this.state = 'cast'; this.castT = 0.3; this.castPose = ATTACKS.fist.slam;
        break;
      }
      case 'whirl':
        this.state = 'whirl'; this.whirlT = 0.95; this.tick = 0;
        Sound.play('whirl');
        break;
      case 'thunder': {
        const targets = S.enemies.filter((e) => !e.dead && Math.abs(e.x + e.w / 2 - this.cx) < 430 && Math.abs(e.y - this.y) < 260)
          .sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x)).slice(0, 5);
        const spots = targets.length ? targets.map((e) => ({ e, x: e.x + e.w / 2 })) : [80, 170, 260].map((d) => ({ e: null, x: this.cx + f * d }));
        spots.forEach((s, i) => {
          S.schedule(i * 0.09, () => {
            const x = s.e && !s.e.dead ? s.e.x + s.e.w / 2 : s.x;
            const gy = S.world.groundBelow(x, (s.e ? s.e.y : this.y) - 10) || this.feet;
            S.fx.bolt(x, S.cam.y - 20, x, gy, '#fff59d', 0.3);
            S.fx.ring(x, gy, 4, 40, '#fff59d', 0.3, 3);
            S.playerAoE(x, gy - 30, 44, { dmg: P * 3.2, kbx: 60, kby: -200, heavy: true, stun: 0.6, kind: 'skill' });
          });
        });
        S.fx.flash('#fffde7', 0.35);
        S.shake(6, 0.3);
        Sound.play('thunder');
        this.state = 'cast'; this.castT = 0.3; this.castPose = PZ.castUp;
        break;
      }
      case 'frost': {
        S.fx.ring(this.cx, this.cy, 10, 190, '#80deea', 0.45, 8);
        S.fx.ring(this.cx, this.cy, 5, 140, '#e0f7fa', 0.35, 4);
        S.fx.shards(this.cx, this.cy, '#b2ebf2', 14, 320, 5);
        for (const e of S.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x + e.w / 2 - this.cx, e.y + e.h / 2 - this.cy) < 190) {
            S.playerHit(e, { dmg: P * 1.5, dir: sign(e.x + e.w / 2 - this.cx) || 1, kbx: 30, kby: 0, heavy: true, x: e.x + e.w / 2, y: e.y + e.h / 2, kind: 'skill', freeze: 2.8 });
          }
        }
        S.fx.flash('#e0f7fa', 0.3);
        Sound.play('freeze');
        this.state = 'cast'; this.castT = 0.3; this.castPose = PZ.castUp;
        break;
      }
      case 'meteor': {
        for (let i = 0; i < 9; i++) {
          const x = this.cx + f * rand(70, 470);
          const gy = S.world.groundBelow(x, S.cam.y + 40);
          if (gy == null) continue;
          const sy = S.cam.y - 60 - rand(0, 80);
          S.addProjectile(new Projectile({ type: 'marker', kind: 'meteor', owner: 'player', x: x - f * 90, tx: x, y: sy, vx: f * 90 * (900 / Math.max(200, gy - sy)), vy: 500, g: 400, gy, r: 12, dmg: P * 2.6, boom: 62, delay: i * 0.13, noContact: true, life: 5 }));
        }
        Sound.play('meteor');
        S.fx.flash('#ffccbc', 0.25);
        this.state = 'cast'; this.castT = 0.35; this.castPose = PZ.castUp;
        break;
      }
    }
  }

  usePotion() {
    if (this.dead || SAVE.potions <= 0) return;
    if (this.hp >= this.maxHp) { this.scene.fx.text(this.cx, this.y - 10, 'HP FULL', '#a5d6a7', 11); return; }
    SAVE.potions--;
    this.heal(Math.round(this.maxHp * 0.5));
    this.scene.fx.flash('#a5d6a7', 0.25);
  }

  heal(amt) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amt);
    const got = Math.round(this.hp - before);
    this.scene.fx.text(this.cx, this.y - 8, '+' + got, '#69f0ae', 14);
    this.scene.fx.burst(this.cx, this.cy, '#69f0ae', 10, 120, 3, -100);
    Sound.play('heal');
  }

  addChain() {
    const S = this.scene;
    this.hitChain++;
    this.hitChainT = 1.8;
    if (this.hitChain > S.stats.maxCombo) S.stats.maxCombo = this.hitChain;
    if (this.hitChain >= 5) Sound.play('combo', this.hitChain);
  }

  endChain() {
    const S = this.scene;
    if (this.hitChain >= 10) {
      const bonus = Math.floor(this.hitChain / 4);
      S.addCoins(bonus);
      S.fx.text(this.cx, this.y - 30, `COMBO BONUS +${bonus}`, '#ffd740', 13, { life: 1.2 });
    }
    this.hitChain = 0;
    this.hitChainT = 0;
  }

  hurt(dmg, srcX, kb = 220, o = {}) {
    const S = this.scene;
    if (this.dead || this.inv > 0 || this.state === 'dash' || this.state === 'whirl' || this.victory) return false;
    if (S.godMode) return false;
    dmg = Math.max(1, Math.round(dmg * (1 - this.def)));
    this.hp -= dmg;
    S.stats.dmgTaken += dmg;
    this.inv = o.inv || 1.0;
    this.flash = 0.15;
    const dir = sign(this.cx - srcX) || -this.facing;
    this.vx = dir * kb;
    this.vy = o.vy != null ? o.vy : -300;
    this.state = 'hurt';
    this.hurtT = 0.32;
    this.cur = null;
    this.rot = 0;
    this.spinT = 0;
    this.onGround = false;
    this.plat = null;
    S.fx.text(this.cx, this.y - 6, '-' + dmg, '#ff5252', 15);
    S.fx.burst(this.cx, this.cy, '#ff5252', 8, 160, 3);
    S.shake(6, 0.25);
    S.hitstop(0.06);
    Sound.play('hurt');
    Game.vibrate(dmg >= this.maxHp * 0.15 ? 60 : 25);
    if (o.slow) this.slowT = Math.max(this.slowT, o.slow);
    this.endChain();
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    this.hp = 0;
    this.dead = true;
    this.deadT = 0;
    this.state = 'dead';
    Sound.play('die');
    this.scene.fx.debris(this.skel(), '#141414', this.vx, -200);
    this.scene.fx.burst(this.cx, this.cy, '#ffffff', 16, 260, 3);
    this.scene.onPlayerDeath();
  }

  getPose() {
    switch (this.state) {
      case 'attack': {
        const a = this.cur;
        if (!a) break;
        const sp = a.spec;
        const p = clamp(a.t / a.dur, 0, 1);
        const [wp, sp2] = sp.poses;
        const h0 = sp.hit[0], h1 = sp.hit[1];
        if (p < h0) return lerpPose(PZ.stand, wp, easeOut(p / h0));
        if (p < h1) return lerpPose(wp, sp2, easeOut((p - h0) / (h1 - h0)));
        const r = clamp(((p - h1) / (1 - h1)) * 1.4 - 0.4, 0, 1);
        return lerpPose(sp2, this.onGround ? PZ.stand : PZ.fall, easeIn(r));
      }
      case 'dash': return PZ.dash;
      case 'slam': return ATTACKS[this.weapon.style].slam;
      case 'whirl': return mkPose(0, 1.57, 0, 1.57, 0, -0.3, -0.3, 0.3, -0.3);
      case 'cast': return this.castPose || PZ.cast;
      case 'hurt': return PZ.hurt;
      case 'recover': return PZ.crouch;
    }
    if (this.victory && this.onGround) return PZ.victory;
    if (!this.onGround) return this.vy < 0 ? PZ.jump : PZ.fall;
    if (this.landT > 0) return lerpPose(PZ.stand, PZ.crouch, this.landT / 0.1);
    if (Math.abs(this.vx) > 25) return runPose(this.runPh);
    if (Input.held.down) return PZ.crouch;
    return idlePose(this.animT);
  }

  skel() {
    return skel(this.cx, this.feet, this.facing, 1, this.getPose(), this.onGround && this.state !== 'whirl');
  }

  updScarf(k, dt) {
    const n = this.scarf.length;
    const ax = k.headX - k.f * 4, ay = k.headY + 1;
    this.scarf[0].x = ax;
    this.scarf[0].y = ay;
    for (let i = 1; i < n; i++) {
      const p = this.scarf[i], q = this.scarf[i - 1];
      p.x += -this.vx * 0.012 - this.facing * 0.25 + Math.sin(this.t * 11 + i) * 0.45;
      p.y += 0.5 + Math.cos(this.t * 9 + i) * 0.35 - this.vy * 0.004;
      const dx = p.x - q.x, dy = p.y - q.y;
      const d = Math.hypot(dx, dy) || 1;
      p.x = q.x + (dx / d) * 5;
      p.y = q.y + (dy / d) * 5;
    }
  }

  draw(ctx) {
    if (this.dead) return;
    const S = this.scene;
    const k = this.skel();
    this.updScarf(k, STEP);
    const gy = S.world.groundBelow(this.cx, this.feet - 2);
    if (gy != null && gy - this.feet < 200) drawShadowEllipse(ctx, this.cx, gy, 13 * (1 - (gy - this.feet) / 260), 0.28);
    const blink = this.inv > 0 && this.state !== 'dash' && this.state !== 'whirl' && this.state !== 'attack' && Math.floor(this.inv * 18) % 2 === 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.35;
    // scarf
    ctx.strokeStyle = '#e53935';
    ctx.lineCap = 'round';
    for (let i = 1; i < this.scarf.length; i++) {
      ctx.lineWidth = 4 - i * 0.4;
      ctx.beginPath();
      ctx.moveTo(this.scarf[i - 1].x, this.scarf[i - 1].y);
      ctx.lineTo(this.scarf[i].x, this.scarf[i].y);
      ctx.stroke();
    }
    let rot = this.rot;
    if (this.state === 'attack' && this.cur && this.cur.spec.spin && !this.onGround) rot = clamp(this.cur.t / this.cur.dur, 0, 1) * TAU * this.facing;
    if (rot) {
      const px = this.cx, py = this.feet - 24;
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.translate(-px, -py);
    }
    const col = this.flash > 0 ? '#ff8a80' : '#141414';
    drawStick(ctx, k, col, { outline: 'rgba(255,255,255,0.5)', back: this.flash > 0 ? '#ff8a80' : '#3b3b3b' });
    // headband
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(k.headX, k.headY, k.hr * 0.9, -2.6, -0.5);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(k.headX + k.f * k.hr * 0.4 - 1.2, k.headY - 1.5, 2.4, 2.6);
    drawWeapon(ctx, k, this.weaponId, this.t);
    ctx.restore();
  }
}
