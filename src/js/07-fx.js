// ---------- Particles & visual effects ----------
class FX {
  constructor() {
    this.list = [];
    this.texts = [];
    this.flashA = 0;
    this.flashC = '#ffffff';
  }
  add(p) {
    if (this.list.length > 500) this.list.splice(0, 50);
    p.t = 0;
    this.list.push(p);
    return p;
  }
  spark(x, y, color, n = 8, spd = 260, dir = 0, spread = TAU) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const v = spd * rand(0.4, 1);
      this.add({ type: 'line', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 300, drag: 3, life: rand(0.18, 0.35), color, size: rand(1.5, 2.5) });
    }
  }
  burst(x, y, color, n = 10, spd = 180, size = 3, g = 400, life = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = spd * rand(0.3, 1);
      this.add({ type: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.3, g, drag: 1.5, life: rand(life * 0.6, life), color, size: size * rand(0.6, 1.3) });
    }
  }
  dust(x, y, n = 6, color = 'rgba(230,220,200,0.7)') {
    for (let i = 0; i < n; i++) {
      this.add({ type: 'puff', x: x + rand(-8, 8), y: y - rand(0, 6), vx: rand(-60, 60), vy: rand(-40, -5), g: -20, drag: 3, life: rand(0.3, 0.55), color, size: rand(3, 6) });
    }
  }
  smoke(x, y, n = 8, color = 'rgba(80,80,90,0.55)') {
    for (let i = 0; i < n; i++) {
      this.add({ type: 'puff', x: x + rand(-10, 10), y: y + rand(-10, 10), vx: rand(-50, 50), vy: rand(-60, 0), g: -40, drag: 2, life: rand(0.4, 0.8), color, size: rand(6, 11) });
    }
  }
  ring(x, y, r0, r1, color, life = 0.35, width = 3) {
    this.add({ type: 'ring', x, y, r0, r1, color, life, width });
  }
  slash(x, y, r, a0, a1, f, color, width = 7, life = 0.16) {
    this.add({ type: 'slash', x, y, r, a0, a1, f, color, width, life });
  }
  text(x, y, str, color = '#fff', size = 14, opt = {}) {
    if (this.texts.length > 60) this.texts.shift();
    this.texts.push({ x: x + rand(-6, 6), y, vy: opt.vy != null ? opt.vy : -70, str: String(str), color, size, life: opt.life || 0.8, t: 0, stroke: opt.stroke !== false });
  }
  ghost(k, color, life = 0.25, weapon = null) {
    this.add({ type: 'ghost', k, color, life, weapon });
  }
  bolt(x0, y0, x1, y1, color = '#fff59d', life = 0.25) {
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([lerp(x0, x1, t) + (i === 0 || i === n ? 0 : rand(-14, 14)), lerp(y0, y1, t)]);
    }
    this.add({ type: 'bolt', pts, color, life });
  }
  flash(color, a = 0.5) {
    this.flashC = color;
    this.flashA = Math.max(this.flashA, a);
  }
  debris(k, color, vx, vy) {
    const segs = [
      [k.hx, k.hy, k.nx, k.ny],
      [k.shx, k.shy, k.ba[0], k.ba[1]], [k.ba[0], k.ba[1], k.ba[2], k.ba[3]],
      [k.shx, k.shy, k.fa[0], k.fa[1]], [k.fa[0], k.fa[1], k.fa[2], k.fa[3]],
      [k.hx, k.hy, k.bl[0], k.bl[1]], [k.bl[0], k.bl[1], k.bl[2], k.bl[3]],
      [k.hx, k.hy, k.fl[0], k.fl[1]], [k.fl[0], k.fl[1], k.fl[2], k.fl[3]],
    ];
    for (const s of segs) {
      const cx = (s[0] + s[2]) / 2, cy = (s[1] + s[3]) / 2;
      const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
      const ang = Math.atan2(s[3] - s[1], s[2] - s[0]);
      this.add({ type: 'seg', x: cx, y: cy, len, ang, vx: vx * rand(0.5, 1.2) + rand(-80, 80), vy: vy * rand(0.6, 1.2) + rand(-160, -40), va: rand(-14, 14), g: 1100, life: 1.8, color, lw: 3.2 * k.s });
    }
    this.add({ type: 'head', x: k.headX, y: k.headY, r: k.hr, vx: vx * 1.2 + rand(-60, 60), vy: vy - rand(120, 240), g: 1100, life: 1.8, color });
  }
  shards(x, y, color, n = 6, spd = 220, size = 5) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-1.4, 1.4);
      const v = spd * rand(0.4, 1);
      this.add({ type: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1000, life: rand(0.6, 1.1), color, size: size * rand(0.6, 1.2), ang: rand(0, TAU), va: rand(-12, 12) });
    }
  }
  update(dt, world) {
    this.flashA = Math.max(0, this.flashA - dt * 2.5);
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      if (p.vx !== undefined) {
        if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
        p.vy += (p.g || 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === 'seg' || p.type === 'head' || p.type === 'shard') {
          if (p.va) p.ang += p.va * dt;
          if (world && world.standablePx(p.x, p.y + 2) && p.vy > 0) {
            p.y = Math.floor((p.y + 2) / TILE) * TILE - 2;
            p.vy *= -0.3;
            p.vx *= 0.6;
            if (p.va) p.va *= 0.5;
          }
        }
      }
      L[j++] = p;
    }
    L.length = j;
    const T = this.texts;
    j = 0;
    for (let i = 0; i < T.length; i++) {
      const p = T[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      p.y += p.vy * dt;
      p.vy *= Math.max(0, 1 - 3 * dt);
      T[j++] = p;
    }
    T.length = j;
  }
  draw(ctx) {
    ctx.lineCap = 'round';
    for (const p of this.list) {
      const k = 1 - p.t / p.life;
      switch (p.type) {
        case 'dot':
          ctx.globalAlpha = Math.min(1, k * 1.5);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size * k + 0.5, p.size * k + 0.5);
          break;
        case 'puff':
          ctx.globalAlpha = k * 0.9;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - k * 0.5), 0, TAU); ctx.fill();
          break;
        case 'line':
          ctx.globalAlpha = Math.min(1, k * 1.6);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
          break;
        case 'ring': {
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.width * k + 0.5;
          const r = lerp(p.r0, p.r1, easeOut(p.t / p.life));
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
          break;
        }
        case 'slash': {
          ctx.globalAlpha = k * 0.9;
          const a0 = p.f > 0 ? p.a0 : Math.PI - p.a0;
          const a1 = p.f > 0 ? p.a1 : Math.PI - p.a1;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.width * (0.4 + k * 0.6);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = Math.max(1, p.width * 0.3 * k);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + p.width * 0.2, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
          break;
        }
        case 'ghost':
          ctx.globalAlpha = k * 0.35;
          drawStick(ctx, p.k, p.color);
          if (p.weapon) drawWeapon(ctx, p.k, p.weapon, 0);
          break;
        case 'bolt': {
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 5 * k + 1;
          ctx.beginPath();
          ctx.moveTo(p.pts[0][0], p.pts[0][1]);
          for (const q of p.pts) ctx.lineTo(q[0], q[1]);
          ctx.stroke();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          break;
        }
        case 'seg':
          ctx.globalAlpha = Math.min(1, k * 3);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.lw;
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(p.ang) * p.len / 2, p.y - Math.sin(p.ang) * p.len / 2);
          ctx.lineTo(p.x + Math.cos(p.ang) * p.len / 2, p.y + Math.sin(p.ang) * p.len / 2);
          ctx.stroke();
          break;
        case 'head':
          ctx.globalAlpha = Math.min(1, k * 3);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
          break;
        case 'shard':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.ang);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          ctx.restore();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.texts) {
      const k = p.t / p.life;
      const pop = k < 0.15 ? 1 + (0.15 - k) * 4 : 1;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `900 ${Math.round(p.size * pop)}px system-ui,-apple-system,Segoe UI,Roboto,sans-serif`;
      if (p.stroke) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(p.str, p.x, p.y);
      }
      ctx.fillStyle = p.color;
      ctx.fillText(p.str, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- Projectiles ----------
class Projectile {
  constructor(o) {
    Object.assign(this, {
      x: 0, y: 0, vx: 0, vy: 0, r: 6, g: 0, life: 3, t: 0, owner: 'enemy', dmg: 10, type: 'arrow',
      dead: false, pierce: false, destroyable: false, kb: 200, harmless: false, rect: null, heavy: false,
    }, o);
    if (this.owner === 'player') this.hitSet = new Set();
  }
  explode(scene, radius, dmg) {
    this.dead = true;
    scene.fx.ring(this.x, this.y, 6, radius, '#ffcc80', 0.35, 5);
    scene.fx.burst(this.x, this.y, '#ff9800', 14, 240, 4);
    scene.fx.smoke(this.x, this.y, 6);
    scene.shake(5, 0.25);
    Sound.play('explode');
    if (this.owner === 'enemy') scene.hurtPlayerCircle(this.x, this.y, radius, dmg, this.x);
    else scene.playerAoE(this.x, this.y, radius, { dmg, kbx: 260, kby: -380, heavy: true, launch: true });
  }
  update(dt, scene) {
    this.t += dt;
    const W = scene.world;
    switch (this.type) {
      case 'tornado': {
        this.x += this.vx * dt;
        const gyy = W.groundBelow(this.x, this.y - 40);
        if (gyy != null) this.y = gyy;
        if (W.solidPx(this.x + sign(this.vx) * 14, this.y - 20)) this.vx = -this.vx;
        this.rect = { x: this.x - 16, y: this.y - 64, w: 32, h: 64 };
        this.tick = (this.tick || 0) - dt;
        if (this.t > this.life) this.dead = true;
        return;
      }
      case 'shock':
      case 'pquake': {
        this.x += this.vx * dt;
        this.rect = { x: this.x - 12, y: this.y - (this.hgt || 26), w: 24, h: this.hgt || 26 };
        if (W.solidPx(this.x + sign(this.vx) * 12, this.y - 10) || !W.standablePx(this.x, this.y + 4)) this.dead = true;
        if (Math.random() < 0.6) scene.fx.dust(this.x, this.y, 1, this.type === 'pquake' ? 'rgba(255,183,77,0.8)' : 'rgba(210,190,160,0.8)');
        if (this.t > this.life) this.dead = true;
        return;
      }
      case 'icespike': {
        const warn = 0.55;
        this.harmless = this.t < warn;
        const h = this.t < warn ? 0 : Math.min(1, (this.t - warn) * 8) * (this.t > this.life - 0.2 ? (this.life - this.t) / 0.2 : 1);
        this.rect = { x: this.x - 11, y: this.y - 48 * h, w: 22, h: 48 * h };
        if (this.t >= warn && !this.sfx) { this.sfx = true; Sound.play('freeze'); scene.fx.shards(this.x, this.y - 10, '#b3e5fc', 4, 180, 4); }
        if (this.t > this.life) this.dead = true;
        return;
      }
      case 'beam': {
        const warn = this.warn || 0.8;
        this.harmless = this.t < warn;
        this.rect = { x: this.x - (this.bw || 22), y: -40, w: (this.bw || 22) * 2, h: W.ph + 80 };
        if (this.t >= warn && !this.sfx) { this.sfx = true; Sound.play('thunder'); scene.shake(4, 0.2); }
        if (this.t > this.life) this.dead = true;
        return;
      }
      case 'marker': {
        // falling object with ground marker (icicle, darkorb, meteor, rock)
        if (this.t < (this.delay || 0)) { this.harmless = true; return; }
        this.harmless = false;
        this.vy += (this.g || 900) * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.y > this.gy - 4) {
          this.y = this.gy;
          if (this.boom) this.explode(scene, this.boom, this.dmg);
          else {
            this.dead = true;
            scene.fx.shards(this.x, this.y - 4, this.color || '#b3e5fc', 7, 240, 5);
            Sound.play('break');
          }
        }
        return;
      }
    }
    // generic ballistic
    if (this.home && scene.player && !scene.player.dead) {
      const p = scene.player;
      const ang = Math.atan2(p.y + p.h / 2 - this.y, p.x + p.w / 2 - this.x);
      const cur = Math.atan2(this.vy, this.vx);
      let d = ang - cur;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const na = cur + clamp(d, -this.home * dt, this.home * dt);
      const sp = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(na) * sp;
      this.vy = Math.sin(na) * sp;
    }
    this.vy += this.g * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.type === 'fireball' || this.type === 'pmeteor' || this.type === 'imp') {
      if (Math.random() < 0.7) scene.fx.add({ type: 'dot', x: this.x + rand(-4, 4), y: this.y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-40, 0), g: -60, life: 0.3, color: Math.random() < 0.5 ? '#ffab40' : '#ff5722', size: rand(3, 6) });
    }
    if (this.type === 'pblast' && Math.random() < 0.8) {
      scene.fx.add({ type: 'dot', x: this.x - this.vx * 0.02, y: this.y + rand(-5, 5), vx: 0, vy: 0, g: 0, life: 0.25, color: '#81d4fa', size: rand(3, 6) });
    }
    const hitWall = W.solidPx(this.x, this.y);
    const hitGround = this.vy > 0 && W.standablePx(this.x, this.y + this.r * 0.5) && !W.solidPx(this.x, this.y - this.r);
    if (hitWall || (this.type !== 'pblast' && hitGround && this.g > 0) || this.t > this.life || this.y > W.ph + 60) {
      this.onEnd(scene, hitWall || hitGround);
    }
  }
  onEnd(scene, hit) {
    if (this.dead) return;
    switch (this.type) {
      case 'bomb': this.explode(scene, 58, this.dmg); return;
      case 'pmeteor': this.explode(scene, 64, this.dmg); return;
      case 'fireball':
      case 'imp':
        this.dead = true;
        scene.fx.burst(this.x, this.y, '#ff7043', 10, 160, 3);
        if (hit) Sound.play('fire');
        return;
      case 'boulder':
        this.dead = true;
        scene.fx.shards(this.x, this.y, '#b3e5fc', 8, 260, 6);
        Sound.play('break');
        scene.shake(4, 0.2);
        for (let i = 0; i < 4; i++) {
          scene.addProjectile(new Projectile({ type: 'shard', x: this.x, y: this.y - 10, vx: (i - 1.5) * 120, vy: -300 - Math.random() * 120, g: 900, r: 5, dmg: this.dmg * 0.5, life: 1.2 }));
        }
        return;
    }
    this.dead = true;
    if (hit) scene.fx.spark(this.x, this.y, '#ffffff', 4, 120);
  }
  hitBy(scene, dir) {
    // player's melee struck this projectile
    if (!this.destroyable || this.owner !== 'enemy') return false;
    if (this.type === 'bomb') {
      this.owner = 'player';
      this.hitSet = new Set();
      this.vx = dir * 420;
      this.vy = -260;
      this.t = Math.min(this.t, this.life - 0.8);
      scene.fx.text(this.x, this.y - 10, 'DEFLECT!', '#ffe082', 11);
      Sound.play('block');
      return true;
    }
    this.dead = true;
    scene.fx.spark(this.x, this.y, '#ffffff', 6, 180);
    Sound.play('block');
    return true;
  }
  draw(ctx, t) {
    const x = this.x, y = this.y;
    switch (this.type) {
      case 'arrow': {
        const a = Math.atan2(this.vy, this.vx);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.strokeStyle = '#d7ccc8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.fillStyle = '#cfd8dc';
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(6, -3.5); ctx.lineTo(6, 3.5); ctx.fill();
        ctx.fillStyle = '#e53935'; ctx.fillRect(-13, -3, 4, 6);
        ctx.restore();
        break;
      }
      case 'shuriken': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 20);
        ctx.fillStyle = '#cfd8dc';
        for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(8, 0); ctx.lineTo(0, 2); ctx.fill(); }
        ctx.fillStyle = '#37474f'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'bomb': {
        ctx.fillStyle = '#212121';
        ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
        ctx.fillStyle = '#616161'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 2, 0, TAU); ctx.fill();
        ctx.fillStyle = (t * 10) % 1 > 0.5 ? '#ffeb3b' : '#ff5722';
        ctx.beginPath(); ctx.arc(x + 4, y - 7, 2.5, 0, TAU); ctx.fill();
        break;
      }
      case 'orb':
      case 'sandorb':
      case 'darkorb':
      case 'web': {
        const c = { orb: '#26c6da', sandorb: '#ffca28', darkorb: '#d500f9', web: '#eceff1' }[this.type];
        ctx.fillStyle = rgba(c, 0.35);
        ctx.beginPath(); ctx.arc(x, y, this.r * 1.7, 0, TAU); ctx.fill();
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(x, y, this.r, 0, TAU); ctx.fill();
        if (this.type === 'web') {
          ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 1;
          for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 4; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * this.r, y - Math.sin(a) * this.r); ctx.lineTo(x + Math.cos(a) * this.r, y + Math.sin(a) * this.r); ctx.stroke(); }
        } else {
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - this.r * 0.3, y - this.r * 0.3, this.r * 0.35, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'fireball':
      case 'imp':
      case 'pmeteor': {
        const r = this.r;
        ctx.fillStyle = 'rgba(255,87,34,0.35)'; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff7043'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffe082'; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.fill();
        break;
      }
      case 'pblast': {
        const r = this.r;
        ctx.fillStyle = 'rgba(79,195,247,0.3)'; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#4fc3f7'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e1f5fe'; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.fill();
        break;
      }
      case 'shock':
      case 'pquake': {
        const h = this.hgt || 26;
        const col = this.type === 'pquake' ? '#ffb74d' : (this.color || '#d7ccc8');
        const k = 1 - this.t / this.life;
        ctx.globalAlpha = 0.5 + k * 0.5;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x - 14, y);
        ctx.lineTo(x - 6, y - h * 0.6);
        ctx.lineTo(x, y - h);
        ctx.lineTo(x + 6, y - h * 0.5);
        ctx.lineTo(x + 14, y);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'tornado': {
        ctx.strokeStyle = 'rgba(255,224,178,0.8)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          const yy = y - i * 11;
          const rr = 6 + i * 3.2;
          const ph = t * 12 + i;
          ctx.beginPath(); ctx.ellipse(x + Math.sin(ph) * 3, yy, rr, 3, 0, 0, TAU); ctx.stroke();
        }
        break;
      }
      case 'boulder': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 5);
        ctx.fillStyle = '#b3e5fc';
        ctx.beginPath();
        for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; const rr = this.r * (0.8 + ((i * 37) % 10) / 30); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.fill();
        ctx.strokeStyle = '#e1f5fe'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        break;
      }
      case 'shard': {
        ctx.fillStyle = '#e1f5fe';
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 10);
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
        break;
      }
      case 'icespike': {
        const warn = 0.55;
        if (this.t < warn) {
          ctx.strokeStyle = `rgba(179,229,252,${0.4 + 0.4 * Math.sin(t * 30)})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x - 12, y - 1); ctx.lineTo(x - 3, y - 4); ctx.lineTo(x + 4, y - 1); ctx.lineTo(x + 12, y - 3); ctx.stroke();
        } else if (this.rect && this.rect.h > 0) {
          const h = this.rect.h;
          ctx.fillStyle = '#b3e5fc';
          ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x - 2, y - h); ctx.lineTo(x + 11, y); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 2, y - h); ctx.lineTo(x + 2, y); ctx.fill();
        }
        break;
      }
      case 'beam': {
        const warn = this.warn || 0.8;
        const bw = this.bw || 22;
        const col = this.color || '#ea80fc';
        if (this.t < warn) {
          ctx.fillStyle = rgba(col, 0.15 + 0.15 * Math.sin(t * 25));
          ctx.fillRect(x - bw, 0, bw * 2, 2000);
          ctx.strokeStyle = rgba(col, 0.6);
          ctx.lineWidth = 1;
          ctx.strokeRect(x - bw, -10, bw * 2, 2000);
        } else {
          const k = 1 - (this.t - warn) / (this.life - warn);
          ctx.fillStyle = rgba(col, 0.55 * k + 0.2);
          ctx.fillRect(x - bw * k, -10, bw * 2 * k, 2000);
          ctx.fillStyle = `rgba(255,255,255,${0.8 * k})`;
          ctx.fillRect(x - bw * 0.35 * k, -10, bw * 0.7 * k, 2000);
        }
        break;
      }
      case 'wave': {
        const f = sign(this.vx) || 1;
        ctx.fillStyle = 'rgba(213,0,249,0.75)';
        ctx.beginPath();
        ctx.moveTo(x - f * 6, y - 26);
        ctx.quadraticCurveTo(x + f * 18, y, x - f * 6, y + 26);
        ctx.quadraticCurveTo(x + f * 6, y, x - f * 6, y - 26);
        ctx.fill();
        break;
      }
      case 'flame': {
        const k = this.t / this.life;
        ctx.fillStyle = k < 0.3 ? '#ffe082' : k < 0.6 ? '#ff9800' : 'rgba(244,67,54,0.7)';
        ctx.beginPath(); ctx.arc(x, y, this.r * (0.6 + k * 0.8), 0, TAU); ctx.fill();
        break;
      }
      case 'marker': {
        if (this.gy != null) {
          const k = clamp(1 - (this.gy - this.y) / 500, 0.2, 1);
          ctx.fillStyle = `rgba(255,50,50,${0.25 + 0.25 * k})`;
          ctx.beginPath(); ctx.ellipse(this.tx != null ? this.tx : x, this.gy, 18 * k + 6, 4, 0, 0, TAU); ctx.fill();
        }
        if (this.t < (this.delay || 0)) break;
        if (this.kind === 'icicle') {
          ctx.fillStyle = '#b3e5fc';
          ctx.beginPath(); ctx.moveTo(x - 7, y - 26); ctx.lineTo(x + 7, y - 26); ctx.lineTo(x, y + 4); ctx.fill();
        } else if (this.kind === 'darkorb') {
          ctx.fillStyle = 'rgba(213,0,249,0.4)'; ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.fill();
          ctx.fillStyle = '#6a1b9a'; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill();
        } else if (this.kind === 'rock') {
          ctx.fillStyle = '#6d4c41'; ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ff7043'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 4, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255,87,34,0.35)'; ctx.beginPath(); ctx.arc(x, y, 20, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ff7043'; ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffe082'; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
        }
        break;
      }
    }
  }
}

// ---------- Pickups ----------
class Pickup {
  constructor(type, x, y, o = {}) {
    this.type = type;
    this.x = x; this.y = y;
    this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.fixed = !!o.fixed;
    this.value = o.value || 1;
    this.t = rand(0, 10);
    this.age = 0;
    this.dead = false;
    this.r = type === 'shard' ? 14 : 8;
    this.life = o.life || (this.fixed ? 1e9 : 14);
  }
  update(dt, scene) {
    this.t += dt;
    this.age += dt;
    const p = scene.player;
    if (!this.fixed) {
      this.vy += 900 * dt;
      this.vx *= Math.max(0, 1 - 1.5 * dt);
      const nx = this.x + this.vx * dt;
      if (!scene.world.solidPx(nx, this.y)) this.x = nx; else this.vx = -this.vx * 0.4;
      const ny = this.y + this.vy * dt;
      if (this.vy > 0 && scene.world.standablePx(this.x, ny + 6)) {
        this.y = Math.floor((ny + 6) / TILE) * TILE - 6;
        this.vy = -this.vy * 0.35;
        if (Math.abs(this.vy) < 40) this.vy = 0;
        this.vx *= 0.7;
      } else this.y = ny;
      if (this.y > scene.world.ph + 40) this.dead = true;
    }
    if (p && !p.dead && this.age > 0.25) {
      const dx = p.x + p.w / 2 - this.x, dy = p.y + p.h / 2 - this.y;
      const d = Math.hypot(dx, dy);
      const magnet = this.type === 'coin' || this.type === 'gem' ? 80 : 40;
      if (d < magnet && this.type !== 'shard') {
        this.fixed = true;
        const sp = 520 * dt;
        this.x += (dx / d) * sp;
        this.y += (dy / d) * sp;
      }
      if (d < 22) this.collect(scene);
    }
    if (this.age > this.life) this.dead = true;
  }
  collect(scene) {
    if (this.dead) return;
    const p = scene.player;
    switch (this.type) {
      case 'coin':
        scene.addCoins(this.value);
        Sound.play('coin');
        scene.fx.spark(this.x, this.y, '#ffeb3b', 4, 100);
        break;
      case 'gem':
        scene.addCoins(this.value);
        Sound.play('gem');
        scene.fx.text(this.x, this.y - 10, '+' + this.value, '#80deea', 13);
        scene.fx.spark(this.x, this.y, '#80deea', 8, 140);
        break;
      case 'heart': {
        const amt = Math.round(p.maxHp * 0.2);
        p.heal(amt);
        break;
      }
      case 'energy':
        p.en = Math.min(p.maxEn, p.en + 30);
        Sound.play('magic');
        scene.fx.text(this.x, this.y - 10, '+30 EN', '#4fc3f7', 12);
        break;
      case 'potion':
        if (SAVE.potions < p.potMax) {
          SAVE.potions++;
          scene.fx.text(this.x, this.y - 10, '+1 POTION', '#ff80ab', 12);
        } else {
          scene.addCoins(20);
          scene.fx.text(this.x, this.y - 10, 'BAG FULL +20', '#ffeb3b', 11);
        }
        Sound.play('heal');
        break;
      case 'shard':
        scene.collectShard();
        break;
    }
    this.dead = true;
  }
  draw(ctx) {
    if (this.age > this.life - 2 && Math.floor(this.age * 10) % 2 === 0) return;
    const bob = this.fixed && this.type !== 'coin' ? Math.sin(this.t * 3) * 3 : 0;
    const x = this.x, y = this.y + bob;
    switch (this.type) {
      case 'coin':
        drawCoinIcon(ctx, x, y, this.value >= 5 ? 7.5 : 6, this.t * 4);
        break;
      case 'gem': {
        ctx.fillStyle = '#26c6da';
        ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 8, y - 2); ctx.lineTo(x, y + 9); ctx.lineTo(x - 8, y - 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b2ebf2';
        ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 3, y - 2); ctx.lineTo(x, y + 3); ctx.lineTo(x - 3, y - 2); ctx.closePath(); ctx.fill();
        break;
      }
      case 'heart':
        drawHeartIcon(ctx, x, y, 7);
        break;
      case 'energy':
        ctx.fillStyle = 'rgba(79,195,247,0.35)'; ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill();
        ctx.fillStyle = '#4fc3f7'; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 2, 0, TAU); ctx.fill();
        break;
      case 'potion':
        drawPotionIcon(ctx, x, y, 11);
        break;
      case 'shard': {
        const g = ctx.createRadialGradient(x, y, 2, x, y, 40);
        g.addColorStop(0, 'rgba(255,255,255,0.8)');
        g.addColorStop(1, 'rgba(129,212,250,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 40, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(this.t * 2) * 0.3);
        ctx.fillStyle = '#81d4fa';
        ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(9, -3); ctx.lineTo(4, 16); ctx.lineTo(-5, 14); ctx.lineTo(-9, -4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e1f5fe';
        ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(3, -2); ctx.lineTo(-2, 12); ctx.lineTo(-5, -4); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
    }
  }
}

// ---------- Level props ----------
class Crate {
  constructor(x, y) {
    this.w = 28; this.h = 28;
    this.x = x - 14; this.y = y - 28;
    this.hp = 2; this.dead = false; this.flash = 0; this.isProp = true;
  }
  takeHit(h, scene) {
    if (this.dead) return false;
    this.hp -= h.heavy ? 2 : 1;
    this.flash = 0.1;
    if (this.hp <= 0) {
      this.dead = true;
      Sound.play('break');
      scene.fx.shards(this.x + 14, this.y + 14, '#a1887f', 8, 260, 6);
      const cx = this.x + 14, cy = this.y + 10;
      scene.dropCoins(cx, cy, randi(3, 7));
      const r = Math.random();
      if (r < 0.15) scene.addPickup(new Pickup('heart', cx, cy, { vy: -250 }));
      else if (r < 0.27) scene.addPickup(new Pickup('energy', cx, cy, { vy: -250 }));
      else if (r < 0.32) scene.addPickup(new Pickup('potion', cx, cy, { vy: -250 }));
    } else Sound.play('hit');
    return 'hit';
  }
  update(dt) { this.flash = Math.max(0, this.flash - dt); }
  draw(ctx) {
    const x = this.x, y = this.y;
    ctx.fillStyle = this.flash > 0 ? '#fff' : '#a1887f';
    ctx.fillRect(x, y, 28, 28);
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, 26, 26);
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 26, y + 26);
    ctx.moveTo(x + 26, y + 2); ctx.lineTo(x + 2, y + 26);
    ctx.stroke();
    if (this.hp < 2) {
      ctx.strokeStyle = '#3e2723';
      ctx.beginPath(); ctx.moveTo(x + 8, y + 3); ctx.lineTo(x + 13, y + 12); ctx.lineTo(x + 9, y + 18); ctx.stroke();
    }
  }
}

class Chest {
  constructor(x, y, tier) {
    this.w = 30; this.h = 22;
    this.x = x - 15; this.y = y - 22;
    this.open = false; this.t = 0; this.tier = tier; this.isProp = true;
  }
  update(dt, scene) {
    this.t += dt;
    const p = scene.player;
    if (!this.open && overlap(this, p)) {
      this.open = true;
      Sound.play('chest');
      const cx = this.x + 15, cy = this.y;
      const val = Math.round((20 + Math.random() * 25) * (1 + this.tier * 0.8));
      scene.dropCoins(cx, cy, val, true);
      if (Math.random() < 0.3) scene.addPickup(new Pickup('potion', cx, cy, { vy: -320, vx: rand(-60, 60) }));
      scene.fx.burst(cx, cy, '#ffeb3b', 16, 220, 3);
      scene.fx.text(cx, cy - 20, 'TREASURE!', '#ffd54f', 14);
    }
  }
  takeHit() { return false; }
  draw(ctx) {
    const x = this.x, y = this.y;
    ctx.fillStyle = '#8d5524';
    ctx.fillRect(x, y + 8, 30, 14);
    ctx.fillStyle = '#ffca28';
    ctx.fillRect(x, y + 8, 30, 2);
    ctx.fillRect(x + 13, y + 10, 4, 6);
    if (this.open) {
      ctx.fillStyle = '#6d3f19';
      ctx.fillRect(x, y - 2, 30, 6);
      ctx.fillStyle = 'rgba(255,235,59,0.5)';
      ctx.fillRect(x + 3, y + 4, 24, 5);
    } else {
      ctx.fillStyle = '#a0632b';
      ctx.beginPath(); ctx.moveTo(x, y + 9); ctx.quadraticCurveTo(x + 15, y - 3, x + 30, y + 9); ctx.fill();
      ctx.fillStyle = '#ffca28';
      ctx.fillRect(x + 12, y + 4, 6, 6);
      if (Math.sin(this.t * 4) > 0.8) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 22, y + 2, 2, 2); }
    }
  }
}

class Spring {
  constructor(x, y) {
    this.w = 28; this.h = 10;
    this.x = x - 14; this.y = y - 10;
    this.t = 1;
  }
  update(dt, scene) {
    this.t += dt;
    const p = scene.player;
    if (p.vy > 50 && p.x + p.w > this.x + 2 && p.x < this.x + this.w - 2 && p.y + p.h >= this.y && p.y + p.h <= this.y + 16) {
      p.vy = -980;
      p.y = this.y - p.h - 1;
      p.jumps = 1;
      p.airDash = true;
      p.airAtk = 0;
      p.jumpHeld = false;
      this.t = 0;
      Sound.play('spring');
      scene.fx.dust(this.x + 14, this.y + 8, 6);
    }
  }
  draw(ctx) {
    const x = this.x, y = this.y;
    const k = this.t < 0.25 ? Math.sin((this.t / 0.25) * Math.PI) : 0;
    ctx.fillStyle = '#546e7a';
    ctx.fillRect(x, y + 6, 28, 4);
    ctx.strokeStyle = '#b0bec5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const top = y - k * 10;
    for (let i = 0; i <= 4; i++) { const yy = lerp(y + 6, top + 3, i / 4); ctx.lineTo(x + 14 + (i % 2 ? 7 : -7), yy); }
    ctx.stroke();
    ctx.fillStyle = '#e53935';
    ctx.fillRect(x + 1, top, 26, 4);
  }
}

class Checkpoint {
  constructor(x, y) {
    this.x = x; this.y = y; this.active = false; this.t = 0; this.raise = 0;
  }
  update(dt, scene) {
    this.t += dt;
    if (this.active) this.raise = Math.min(1, this.raise + dt * 2);
    const p = scene.player;
    if (!this.active && Math.abs(p.x + p.w / 2 - this.x) < 20 && Math.abs(p.y + p.h - this.y) < 60) {
      this.active = true;
      scene.setCheckpoint(this);
    }
  }
  draw(ctx) {
    const x = this.x, y = this.y;
    ctx.fillStyle = '#9e9e9e';
    ctx.fillRect(x - 2, y - 64, 4, 64);
    ctx.fillStyle = '#757575';
    ctx.fillRect(x - 6, y - 4, 12, 4);
    const fy = y - 24 - this.raise * 36;
    const wave = Math.sin(this.t * 6) * 2;
    ctx.fillStyle = this.active ? '#43a047' : '#e53935';
    ctx.beginPath();
    ctx.moveTo(x + 2, fy);
    ctx.lineTo(x + 24, fy + 6 + wave);
    ctx.lineTo(x + 2, fy + 14);
    ctx.fill();
  }
}

class Goal {
  constructor(x, y) { this.x = x; this.y = y; this.t = 0; this.reached = false; }
  update(dt, scene) {
    this.t += dt;
    const p = scene.player;
    if (!this.reached && Math.abs(p.x + p.w / 2 - this.x) < 26 && p.y + p.h > this.y - 110) {
      this.reached = true;
      scene.completeLevel();
    }
  }
  draw(ctx) {
    const x = this.x, y = this.y, t = this.t;
    // glowing portal arch
    const g = ctx.createRadialGradient(x, y - 48, 4, x, y - 48, 60);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.5, 'rgba(255,215,64,0.35)');
    g.addColorStop(1, 'rgba(255,215,64,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y - 48, 60, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff8e1';
    ctx.beginPath(); ctx.ellipse(x, y - 46, 20, 44, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffc107';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(x, y - 46, 22 + Math.sin(t * 4) * 1.5, 46, 0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const a = t * 2 + i * 1.26;
      ctx.fillStyle = '#ffe082';
      ctx.fillRect(x + Math.cos(a) * 26 - 1.5, y - 46 + Math.sin(a) * 50 - 1.5, 3, 3);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 11px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GOAL', x, y - 100);
  }
}

class Sign {
  constructor(x, y, text) { this.x = x; this.y = y; this.text = text; this.show = 0; }
  update(dt, scene) {
    const p = scene.player;
    const near = Math.abs(p.x + p.w / 2 - this.x) < 110 && Math.abs(p.y + p.h - this.y) < 120;
    this.show = clamp(this.show + (near ? dt * 5 : -dt * 5), 0, 1);
  }
  draw(ctx) {
    const x = this.x, y = this.y;
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(x - 2, y - 26, 4, 26);
    ctx.fillStyle = '#a1887f';
    ctx.fillRect(x - 12, y - 34, 24, 14);
    ctx.fillStyle = '#4e342e';
    ctx.fillRect(x - 8, y - 30, 16, 2);
    ctx.fillRect(x - 8, y - 25, 12, 2);
  }
  drawBubble(ctx, scene) {
    if (this.show <= 0) return;
    const txt = resolveKeys(this.text);
    ctx.font = '600 11px system-ui,-apple-system,sans-serif';
    const lines = wrapText(ctx, txt, 200);
    const w = Math.min(220, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16);
    const h = lines.length * 14 + 10;
    let bx = this.x - w / 2;
    const camX = scene.cam.x;
    bx = clamp(bx, camX + 6, camX + Game.W - w - 6);
    const by = this.y - 48 - h;
    ctx.globalAlpha = this.show;
    ctx.fillStyle = 'rgba(15,20,30,0.88)';
    roundRect(ctx, bx, by, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + 8, by + 6 + i * 14));
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }
}

function resolveKeys(text) {
  const touch = Input.touchMode;
  const map = touch
    ? { MOVE: 'Drag the joystick on the LEFT side of the screen to move.', JUMP: 'JUMP (arrow button)', ATTACK: 'ATTACK (big button)', DASH: 'DASH (>> button)', SKILL: 'the SKILL button' }
    : { MOVE: 'Move with Arrow keys / WASD.', JUMP: 'SPACE / K', ATTACK: 'J / X', DASH: 'L / SHIFT', SKILL: 'I (skill 1) / O (skill 2)' };
  return text.replace(/\{(\w+)\}/g, (m, k) => map[k] || m);
}

// ---------- Moving & falling platforms ----------
class Platform {
  constructor(o) {
    Object.assign(this, o);
    this.u = 0; this.dir = 1; this.wait = 0.5;
    this.prevY = this.y; this.dx = 0; this.dy = 0;
    this.solid = true; this.state = 'idle'; this.standT = 0; this.vy = 0; this.timer = 0;
    this.len = Math.hypot(this.bx - this.ax, this.by - this.ay);
  }
  update(dt, scene) {
    const ox = this.x, oy = this.y;
    this.prevY = this.y;
    if (this.kind === 'move') {
      if (this.len > 0) {
        if (this.wait > 0) this.wait -= dt;
        else {
          this.u += (this.dir * this.speed * dt) / this.len;
          if (this.u >= 1) { this.u = 1; this.dir = -1; this.wait = 0.7; }
          if (this.u <= 0) { this.u = 0; this.dir = 1; this.wait = 0.7; }
        }
        this.x = lerp(this.ax, this.bx, easeInOut(this.u));
        this.y = lerp(this.ay, this.by, easeInOut(this.u));
      }
    } else if (this.kind === 'fall') {
      const p = scene.player;
      if (this.state === 'idle') {
        if (p.plat === this) {
          this.standT += dt;
          if (this.standT > 0.45) { this.state = 'falling'; this.vy = 0; }
        } else this.standT = Math.max(0, this.standT - dt);
      } else if (this.state === 'falling') {
        this.vy += 1300 * dt;
        this.y += this.vy * dt;
        if (this.y > scene.world.ph + 60) { this.state = 'gone'; this.solid = false; this.timer = 2.5; }
      } else if (this.state === 'gone') {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'idle'; this.solid = true; this.x = this.ax; this.y = this.ay; this.prevY = this.y; this.standT = 0;
          scene.fx.smoke(this.x + this.w / 2, this.y, 5, 'rgba(255,255,255,0.4)');
        }
      }
    }
    this.dx = this.x - ox;
    this.dy = this.y - oy;
  }
  draw(ctx, R) {
    if (this.state === 'gone') return;
    let x = this.x, y = this.y;
    if (this.kind === 'fall' && this.state === 'idle' && this.standT > 0) x += Math.sin(this.standT * 80) * 1.5;
    ctx.fillStyle = this.kind === 'fall' ? shade(R.plat, -0.15) : R.plat;
    ctx.fillRect(x, y, this.w, this.h);
    ctx.fillStyle = shade(R.plat, 0.25);
    ctx.fillRect(x, y, this.w, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y + this.h - 3, this.w, 3);
    if (this.kind === 'move') {
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(x + 4, y + 5, 4, 3);
      ctx.fillRect(x + this.w - 8, y + 5, 4, 3);
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + this.w * 0.4, y + 2); ctx.lineTo(x + this.w * 0.5, y + 7); ctx.lineTo(x + this.w * 0.45, y + 11); ctx.stroke();
    }
  }
}

// ---------- Hazards ----------
class Hazard {
  constructor(o) {
    Object.assign(this, o);
    this.t = 0;
    if (this.type === 'saw') { this.x = this.x0; this.dir = 1; }
    if (this.type === 'icicle') { this.state = 'hang'; this.hy = this.y; this.vy = 0; this.timer = 0; }
  }
  update(dt, scene) {
    this.t += dt;
    const p = scene.player;
    switch (this.type) {
      case 'saw': {
        this.x += this.dir * this.speed * dt;
        if (this.x > this.x1) { this.x = this.x1; this.dir = -1; }
        if (this.x < this.x0) { this.x = this.x0; this.dir = 1; }
        if (circleRect(this.x, this.y, this.r - 3, p)) scene.hazardHit(this.x, 0.12);
        if (Math.random() < 0.3) scene.fx.add({ type: 'line', x: this.x - this.dir * 10, y: this.y + this.r - 2, vx: -this.dir * rand(60, 160), vy: rand(-120, -30), g: 500, life: 0.2, color: '#ffe082', size: 1.5 });
        break;
      }
      case 'fire': {
        const c = (this.t + this.phase) % this.period;
        this.stage = c < 1.2 ? 'off' : c < 1.75 ? 'warn' : 'on';
        if (this.stage === 'warn' && Math.random() < 0.3) scene.fx.smoke(this.x, this.y - 4, 1, 'rgba(90,90,90,0.5)');
        if (this.stage === 'on') {
          const rect = { x: this.x - 11, y: this.y - 92, w: 22, h: 92 };
          if (overlap(rect, p)) scene.hazardHit(this.x, 0.12);
          if (Math.random() < 0.9) scene.fx.add({ type: 'dot', x: this.x + rand(-8, 8), y: this.y - rand(0, 20), vx: rand(-20, 20), vy: rand(-320, -200), g: 0, drag: 1, life: 0.35, color: Math.random() < 0.5 ? '#ffab40' : '#ff5722', size: rand(5, 9) });
          if (!this.snd) { this.snd = true; Sound.play('fire'); }
        } else this.snd = false;
        break;
      }
      case 'icicle': {
        if (this.state === 'hang') {
          if (Math.abs(p.x + p.w / 2 - this.x) < 44 && p.y > this.hy) { this.state = 'shake'; this.timer = 0.35; }
        } else if (this.state === 'shake') {
          this.timer -= dt;
          if (this.timer <= 0) { this.state = 'fall'; this.vy = 0; }
        } else if (this.state === 'fall') {
          this.vy += 1500 * dt;
          this.y += this.vy * dt;
          if (circleRect(this.x, this.y + 18, 7, p)) scene.hazardHit(this.x, 0.12);
          if (scene.world.standablePx(this.x, this.y + 26)) {
            scene.fx.shards(this.x, this.y + 20, '#b3e5fc', 7, 200, 5);
            Sound.play('break');
            this.state = 'gone';
            this.timer = 3;
          }
        } else if (this.state === 'gone') {
          this.timer -= dt;
          if (this.timer <= 0) { this.state = 'hang'; this.y = this.hy; }
        }
        break;
      }
    }
  }
  draw(ctx) {
    switch (this.type) {
      case 'saw': {
        const x = this.x, y = this.y, r = this.r;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(this.x0, y); ctx.lineTo(this.x1, y); ctx.stroke();
        ctx.save(); ctx.translate(x, y); ctx.rotate(this.t * 14 * this.dir);
        ctx.fillStyle = '#b0bec5';
        ctx.beginPath();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; const rr = i % 2 ? r : r * 0.78; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#607d8b'; ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'fire': {
        const x = this.x, y = this.y;
        ctx.fillStyle = '#424242';
        ctx.fillRect(x - 12, y - 6, 24, 6);
        ctx.fillStyle = this.stage === 'warn' ? '#ff9800' : '#212121';
        ctx.fillRect(x - 7, y - 7, 14, 3);
        if (this.stage === 'on') {
          const g = ctx.createLinearGradient(x, y, x, y - 92);
          g.addColorStop(0, 'rgba(255,235,59,0.95)');
          g.addColorStop(0.5, 'rgba(255,111,0,0.8)');
          g.addColorStop(1, 'rgba(244,67,54,0)');
          ctx.fillStyle = g;
          const wob = Math.sin(this.t * 40) * 2;
          ctx.beginPath(); ctx.moveTo(x - 10, y - 6); ctx.quadraticCurveTo(x - 14 + wob, y - 50, x + wob, y - 96); ctx.quadraticCurveTo(x + 14 - wob, y - 50, x + 10, y - 6); ctx.fill();
        }
        break;
      }
      case 'icicle': {
        if (this.state === 'gone') return;
        let x = this.x;
        if (this.state === 'shake') x += Math.sin(this.t * 90) * 1.5;
        const y = this.y;
        ctx.fillStyle = '#b3e5fc';
        ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 28); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 1, y); ctx.lineTo(x - 1, y + 20); ctx.fill();
        break;
      }
    }
  }
}
