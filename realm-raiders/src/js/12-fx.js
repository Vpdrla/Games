// ---------- FX: particles, damage numbers, rings, slashes, lightning, banners, screen shake ----------
// Purely visual; fed by world events. Lives in world coordinates except banners and flashes.

const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = makeCanvas(64, 64);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

const FX = {
  parts: [],
  nums: [],
  rings: [],
  slashes: [],
  zaps: [],
  texts: [],
  banners: [],
  flash: null,
  shake: 0,
  shakeX: 0,
  shakeY: 0,
  hitStop: 0,
  slowmo: 0,
  ultCast: null,
  feed: [],
  localTeam: 0,

  reset() { this.parts.length = this.nums.length = this.rings.length = this.slashes.length = this.zaps.length = this.texts.length = 0; this.banners.length = 0; this.flash = null; this.shake = 0; this.ultCast = null; this.feed.length = 0; },

  burst(x, y, n, color, spd, life, size, grav) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 700) this.parts.shift();
      const a = Math.random() * TAU, s = spd * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), color, grav: grav || 0 });
    }
  },

  num(x, y, v, crit, hurt, kind) {
    if (!Settings.nums) return;
    if (this.nums.length > 70) this.nums.shift();
    const color = hurt ? '#ff5a5a' : kind === 2 ? '#a8f05a' : kind === 3 ? '#ffa040' : crit ? '#ffd23f' : '#ffffff';
    this.nums.push({ x, y, vy: -60 - Math.random() * 30, vx: (Math.random() - 0.5) * 30, t: 0, life: crit ? 0.9 : 0.65, v: fmtNum(v), size: crit ? 22 : kind ? 12 : hurt ? 15 : 14, color, crit });
  },

  text(x, y, s, color, size) { this.texts.push({ x, y, s, color, size: size || 16, t: 0, life: 1.1 }); },

  banner(title, sub, color) { this.banners = [{ title, sub, color: color || '#ffd23f', t: 0, life: 2.4 }]; },

  ring(x, y, r, color, life, wid) { this.rings.push({ x, y, r, color, t: 0, life: life || 0.45, wid: wid || 6 }); },

  // Handles world events. view: the world or mirror (for unit lookups). me: local hero ids (for sounds).
  handle(evs, view, local) {
    for (const e of evs) {
      const k = e[0];
      switch (k) {
        case 'dmg': { const hurt = e[5] > 0 && e[5] - 1 === this.localTeam; this.num(e[1], e[2], e[3], e[4], hurt, e[6]); if (e[4]) Sound.play('crit', 0.5); else if (!e[6]) Sound.play(hurt ? 'hurt' : 'hit', 0.3); break; }
        case 'slash': this.slashes.push({ x: e[1], y: e[2], a: e[3], r: e[4], arc: e[5], color: e[6], t: 0, life: 0.18, uid: e[7] }); Sound.play('swing', 0.25); break;
        case 'thrust': this.slashes.push({ x: e[1], y: e[2], a: e[3], r: e[4], arc: 0, color: e[5], t: 0, life: 0.16, thrust: true }); Sound.play('swing', 0.25); break;
        case 'cone': this.slashes.push({ x: e[1], y: e[2], a: e[3], r: e[4], arc: e[5], color: e[6], t: 0, life: 0.35, cone: true }); this.burst(e[1] + Math.cos(e[3]) * e[4] * 0.5, e[2] + Math.sin(e[3]) * e[4] * 0.5, 14, e[6], 160, 0.5, 4); Sound.play('fire', 0.4); break;
        case 'boom': this.ring(e[1], e[2], e[3], e[4], 0.4, 10); this.burst(e[1], e[2], 18, e[4], e[3] * 3, 0.5, 5); this.burst(e[1], e[2], 6, '#ffffff', e[3] * 2, 0.3, 4); Sound.play('boom', 0.5); break;
        case 'ring': this.ring(e[1], e[2], e[3], e[4], 0.5, 8); Sound.play('whoosh', 0.35); break;
        case 'zap': this.zaps.push({ x1: e[1], y1: e[2], x2: e[3], y2: e[4], color: e[5], t: 0, life: e[6] === 0 ? 0.25 : 0.2, w: e[6] === 2 ? 5 : e[6] === 3 ? 3 : 2.5, soft: e[6] === 0 || e[6] === 3 }); if (e[6] === 1 || e[6] === 2) Sound.play('zap', 0.3); break;
        case 'bolt': this.zaps.push({ x1: e[1] + (Math.random() - 0.5) * 40, y1: e[2] - 420, x2: e[1], y2: e[2], color: e[3], t: 0, life: 0.22, w: 5 }); this.ring(e[1], e[2], 46, e[3], 0.3, 6); this.burst(e[1], e[2], 8, e[3], 160, 0.35, 3); Sound.play('zap', 0.45); break;
        case 'beam': this.zaps.push({ x1: e[1], y1: e[2], x2: e[1] + Math.cos(e[3]) * e[4], y2: e[2] + Math.sin(e[3]) * e[4], color: e[5], t: 0, life: 0.35, w: 18, beam: true }); this.shake = Math.max(this.shake, 5); Sound.play('beam', 0.5); break;
        case 'poof': this.burst(e[1], e[2], 8, e[3] || '#ffffff', 90, 0.35, 4); break;
        case 'hit': this.burst(e[1], e[2], 4, '#ffffff', 120, 0.2, 3); break;
        case 'die': this.burst(e[1], e[2], 14, e[3], 180, 0.55, 5); this.burst(e[1], e[2], 6, '#ffffff', 120, 0.3, 3); Sound.play('die', 0.35); break;
        case 'bossdie': this.burst(e[1], e[2], 80, e[3], 420, 1.2, 7); this.ring(e[1], e[2], 300, e[3], 1, 14); this.shake = 18; this.slowmo = 1.2; Sound.play('bossdie', 0.9); break;
        case 'text': this.text(e[1], e[2], e[3], e[4], e[5]); break;
        case 'heal': if (Settings.nums) this.nums.push({ x: e[1], y: e[2], vy: -40, vx: 0, t: 0, life: 0.8, v: '+' + e[3], size: 13, color: '#5df0b0' }); break;
        case 'coin': this.burst(e[1], e[2], 2, '#ffd23f', 60, 0.25, 3); Sound.play('coin', 0.25); break;
        case 'pick': this.text(e[1], e[2] - 30, e[4], e[3], 15); this.ring(e[1], e[2], 40, e[3], 0.35, 5); Sound.play('pickup', 0.5); break;
        case 'shake': this.shake = Math.max(this.shake, e[1] * Settings.shake); break;
        case 'flash': this.flash = { color: e[1], a: e[2], t: 0, life: 0.4 }; break;
        case 'banner': this.banner(e[1], e[2], e[3]); Sound.play('banner', 0.6); break;
        case 'down': { this.burst(e[2], e[3], 16, '#ff5a5a', 160, 0.6, 4); Sound.play('down', 0.7); break; }
        case 'revive': this.ring(e[2], e[3], 60, '#5df0b0', 0.5, 6); this.burst(e[2], e[3], 14, '#5df0b0', 140, 0.6, 4); Sound.play('revive', 0.6); break;
        case 'dash': { const a = e[4]; this.burst(e[2] - Math.cos(a) * 10, e[3] - Math.sin(a) * 10, 6, '#ffffff', 80, 0.3, 4); Sound.play('dash', 0.35); break; }
        case 'ult': {
          const u = view.byId ? view.byId.get(e[1]) : view.units.find((x) => x.id === e[1]);
          if (u) { this.ultCast = { name: e[2], hero: u.hero, t: 0, life: 1.2, local: local && local.has(e[1]) }; this.ring(u.x, u.y, 120, u.hero.color, 0.5, 10); this.burst(u.x, u.y, 24, u.hero.color, 260, 0.6, 5); }
          this.shake = Math.max(this.shake, 6 * Settings.shake);
          Sound.play('ult', 0.8);
          break;
        }
        case 'cast': Sound.play('cast', 0.35); break;
        case 'shoot': Sound.play(e[2] === 'zap' ? 'zap' : 'shoot', 0.15); break;
        case 'arrowfall': this.zaps.push({ x1: e[1] - 30, y1: e[2] - 120, x2: e[1], y2: e[2], color: '#d9ffb8', t: 0, life: 0.12, w: 2 }); this.burst(e[1], e[2], 2, '#d9ffb8', 60, 0.2, 2); break;
        case 'shatter': this.burst(e[1], e[2], 10, '#e8fbff', 160, 0.45, 4); Sound.play('ice', 0.3); break;
        case 'roots': for (let i = 0; i < 8; i++) { const d = e[4] * i / 8; this.burst(e[1] + Math.cos(e[3]) * d, e[2] + Math.sin(e[3]) * d, 3, '#7a5a2a', 120, 0.5, 5); } Sound.play('boom', 0.4); break;
        case 'raise': this.burst(e[1], e[2], 12, '#9affc6', 100, 0.6, 4, -60); Sound.play('raise', 0.4); break;
        case 'spawn': this.burst(e[1], e[2], 10, '#ff5a5a', 100, 0.4, 4); break;
        case 'notes': for (let i = 0; i < 8; i++) this.texts.push({ x: e[1] + (Math.random() - 0.5) * 120, y: e[2] + (Math.random() - 0.5) * 60, s: '♪', color: '#ff7ad1', size: 20, t: 0, life: 1 }); Sound.play('hymn', 0.6); break;
        case 'timestop': this.flash = { color: '#53e0d0', a: 0.4, t: 0, life: 0.5 }; Sound.play('timestop', 0.8); break;
        case 'multi': this.texts.push({ x: 0, y: 0, s: e[1] + 'x MULTI-KILL!', color: '#ff9a4a', size: 28, t: 0, life: 1.4, screen: true }); Sound.play('multi', 0.6); break;
        case 'chest': this.burst(e[1], e[2], 30, e[3] === 'gold' ? '#ffd23f' : '#c46bff', 260, 0.8, 5); Sound.play('chest', 0.7); break;
        case 'blessed': Sound.play('bless', 0.6); break;
        case 'ko': {
          const k1 = view.byId ? view.byId.get(e[1]) : view.units.find((x) => x.id === e[1]);
          const v = view.byId ? view.byId.get(e[2]) : view.units.find((x) => x.id === e[2]);
          this.feed.push({ k: k1 ? k1.hero : null, kn: k1 && k1.pl ? k1.pl.name : '', v: v ? v.hero : null, vn: v && v.pl ? v.pl.name : '', t: 0, streak: e[3] });
          if (this.feed.length > 4) this.feed.shift();
          if (e[3] >= 3) this.texts.push({ x: 0, y: 0, s: e[3] >= 5 ? 'UNSTOPPABLE!' : 'KILLING SPREE!', color: '#ff4f6d', size: 26, t: 0, life: 1.3, screen: true });
          Sound.play('ko', 0.7);
          break;
        }
        case 'room': this.reset(); break;
        case 'portals': Sound.play('portal', 0.5); break;
        case 'travel': Sound.play('travel', 0.6); break;
        case 'sfx': Sound.play(e[1], 0.6); break;
      }
    }
  },

  update(dt) {
    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 3; p.vy = p.vy * (1 - dt * 3) + p.grav * dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const n of this.nums) { n.t += dt; n.x += n.vx * dt; n.y += n.vy * dt; n.vy += 90 * dt; }
    this.nums = this.nums.filter((n) => n.t < n.life);
    for (const list of [this.rings, this.slashes, this.zaps, this.texts, this.banners]) for (const r of list) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    this.slashes = this.slashes.filter((r) => r.t < r.life);
    this.zaps = this.zaps.filter((r) => r.t < r.life);
    this.texts = this.texts.filter((r) => r.t < r.life);
    this.banners = this.banners.filter((r) => r.t < r.life);
    for (const f of this.feed) f.t += dt;
    this.feed = this.feed.filter((f) => f.t < 5);
    if (this.flash) { this.flash.t += dt; if (this.flash.t > this.flash.life) this.flash = null; }
    if (this.ultCast) { this.ultCast.t += dt; if (this.ultCast.t > this.ultCast.life) this.ultCast = null; }
    this.shake = Math.max(0, this.shake - dt * 30);
    const s = this.shake;
    this.shakeX = (Math.random() - 0.5) * s;
    this.shakeY = (Math.random() - 0.5) * s;
    if (this.slowmo > 0) this.slowmo -= dt;
  },

  drawWorld(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      const s = p.size * (0.5 + a * 0.5) * 3;
      ctx.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    for (const z of this.zaps) {
      const a = 1 - z.t / z.life;
      ctx.globalAlpha = a;
      ctx.strokeStyle = z.color;
      ctx.lineCap = 'round';
      if (z.beam) {
        ctx.lineWidth = z.w * (0.6 + a * 0.6);
        ctx.beginPath(); ctx.moveTo(z.x1, z.y1); ctx.lineTo(z.x2, z.y2); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = z.w * 0.3;
        ctx.beginPath(); ctx.moveTo(z.x1, z.y1); ctx.lineTo(z.x2, z.y2); ctx.stroke();
        continue;
      }
      ctx.lineWidth = z.w;
      ctx.beginPath();
      ctx.moveTo(z.x1, z.y1);
      const n = z.soft ? 1 : Math.max(2, Math.floor(dist(z.x1, z.y1, z.x2, z.y2) / 28));
      const nx = -(z.y2 - z.y1), ny = z.x2 - z.x1, l = Math.hypot(nx, ny) || 1;
      for (let i = 1; i < n; i++) {
        const k = i / n, j = (Math.random() - 0.5) * 22;
        ctx.lineTo(lerp(z.x1, z.x2, k) + nx / l * j, lerp(z.y1, z.y2, k) + ny / l * j);
      }
      ctx.lineTo(z.x2, z.y2);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = z.w * 0.4;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.wid * (1 - k * 0.6);
      circle(ctx, r.x, r.y, r.r * easeOut(Math.min(1, k * 1.4)));
      ctx.stroke();
    }
    for (const s of this.slashes) {
      const k = s.t / s.life;
      ctx.globalAlpha = (1 - k) * (s.cone ? 0.55 : 0.85);
      if (s.thrust) {
        ctx.strokeStyle = s.color; ctx.lineWidth = 8 * (1 - k); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s.x + Math.cos(s.a) * 14, s.y + Math.sin(s.a) * 14); ctx.lineTo(s.x + Math.cos(s.a) * s.r, s.y + Math.sin(s.a) * s.r); ctx.stroke();
        continue;
      }
      if (s.cone) {
        const g = ctx.createRadialGradient(s.x, s.y, 10, s.x, s.y, s.r);
        g.addColorStop(0, 'rgba(255,240,180,0.9)'); g.addColorStop(0.4, s.color); g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, s.r * (0.6 + k * 0.4), s.a - s.arc / 2, s.a + s.arc / 2); ctx.closePath(); ctx.fill();
        continue;
      }
      const sweep = s.arc;
      const a0 = s.a - sweep / 2, a1 = s.a - sweep / 2 + sweep * Math.min(1, k * 2.2);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 10 * (1 - k);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.82, a0, a1); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3 * (1 - k);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.82, a0, a1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      if (t.screen) continue;
      const k = t.t / t.life;
      ctx.globalAlpha = 1 - k * k;
      outlineText(ctx, t.s, t.x, t.y - k * 30, t.size, t.color);
    }
    for (const n of this.nums) {
      const k = n.t / n.life;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const sc = n.crit ? 1 + Math.max(0, 0.4 - n.t) * 1.5 : 1;
      outlineText(ctx, n.v, n.x, n.y, n.size * sc, n.color);
    }
    ctx.restore();
  },
};
