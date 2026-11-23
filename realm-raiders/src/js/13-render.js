// ---------- View: camera, world rendering and the in-game HUD ----------

const PLAYER_COLORS = ['#4fb3ff', '#ff5d6d', '#7be06a', '#ffd23f'];
const REWARD_ICON = { bless: 'star', gold: 'coin', gear: 'chest', heal: 'heart', elite: 'skull', boss: 'crown' };

function hsh(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

const View = {
  cv: null, ctx: null, W: 0, H: 0, dpr: 1,
  cam: { x: 700, y: 450, z: 1 },
  floor: null, floorRoom: null,
  safe: { t: 0, r: 0, b: 0, l: 0 },
  comboPulse: 0, lastCombo: 0,

  init(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
  },

  // A phone held upright still plays sideways: the whole game is turned 90 degrees.
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vw = innerWidth, vh = innerHeight;
    const touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    const rot = vh > vw && touch;
    const W = rot ? vh : vw, H = rot ? vw : vh;
    this.rot = rot;
    this.W = W; this.H = H; this.dpr = dpr;
    const app = document.getElementById('app');
    if (app) {
      app.style.width = W + 'px'; app.style.height = H + 'px';
      app.style.transform = rot ? 'rotate(90deg) translateY(-100%)' : 'none';
    }
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    const p = document.getElementById('safe-probe');
    let sf = { t: 0, r: 0, b: 0, l: 0 };
    if (p) { const cs = getComputedStyle(p); sf = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 }; }
    this.safe = rot ? { l: sf.t, r: sf.b, t: sf.r, b: sf.l } : sf;
    if (app) {
      for (const k of ['t', 'r', 'b', 'l']) app.style.setProperty('--sa' + k, this.safe[k] + 'px');
      app.style.setProperty('--vw', W / 100 + 'px');
      app.style.setProperty('--vh', H / 100 + 'px');
      app.style.setProperty('--fs', clamp(Math.min(H * 0.041, W * 0.022), 14, 22).toFixed(1) + 'px');
    }
    Input.rot = rot;
    Input.setLayout(W, H, this.safe);
    this.ui = clamp(Math.min(W, H) / 330, 1, 1.7);
  },

  baseZoom() { return Math.min(this.H / 430, this.W / 760); },

  // world-space text is scaled so it stays readable on small screens
  textK() { return clamp(1 / (this.cam.z || 1), 0.9, 1.8); },

  updateCam(view, locals, dt, snap) {
    const room = view.room;
    if (!room) return;
    const us = locals.filter((u) => u && !u.ko);
    let cx = room.w / 2, cy = room.h / 2, z = this.baseZoom();
    if (us.length) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const u of us) { x0 = Math.min(x0, u.x); y0 = Math.min(y0, u.y); x1 = Math.max(x1, u.x); y1 = Math.max(y1, u.y); }
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
      if (us.length > 1) z = Math.max(z * 0.5, Math.min(z, this.W / (x1 - x0 + 360), this.H / (y1 - y0 + 300)));
      const boss = view.boss && !view.boss.dead ? view.boss : view.mode && view.mode.boss && !view.mode.boss.dead ? view.mode.boss : null;
      if (boss) {
        const bx = lerp(cx, boss.x, 0.3), by = lerp(cy, boss.y, 0.3);
        z = Math.max(z * 0.72, Math.min(z, this.W / (Math.abs(boss.x - cx) * 2 * 0.7 + 300), this.H / (Math.abs(boss.y - cy) * 2 * 0.7 + 260)));
        cx = bx; cy = by;
      }
    }
    const hw = this.W / (2 * z), hh = this.H / (2 * z);
    cx = room.w + 80 > hw * 2 ? clamp(cx, hw - 60, room.w - hw + 60) : room.w / 2;
    cy = room.h + 80 > hh * 2 ? clamp(cy, hh - 60, room.h - hh + 60) : room.h / 2;
    const c = this.cam;
    if (snap) { c.x = cx; c.y = cy; c.z = z; return; }
    const k = Math.min(1, dt * 7);
    c.x += (cx - c.x) * k; c.y += (cy - c.y) * k; c.z += (z - c.z) * Math.min(1, dt * 3);
  },

  toScreen(x, y) { const c = this.cam; return { x: (x - c.x) * c.z + this.W / 2, y: (y - c.y) * c.z + this.H / 2 }; },

  // ---------- floor ----------
  buildFloor(room) {
    const sc = clamp(this.baseZoom() * this.dpr, 1, 2);
    const k = Math.min(sc, Math.sqrt(4.2e6 / (room.w * room.h)));
    const c = makeCanvas(room.w * k, room.h * k);
    const x = c.getContext('2d');
    x.scale(k, k);
    const p = room.pal, W = room.w, H = room.h;
    const rng = new RNG(room.seed || 1);
    x.fillStyle = p.f1;
    x.fillRect(0, 0, W, H);
    const T = 80;
    for (let ty = 0; ty < H; ty += T) for (let tx = 0; tx < W; tx += T) {
      const v = rng.next();
      if (((tx + ty) / T) % 2 === 0) { x.fillStyle = p.f2; x.globalAlpha = 0.55 + v * 0.3; x.fillRect(tx, ty, T, T); }
      else if (v < 0.25) { x.fillStyle = shade(p.f1, -0.12); x.globalAlpha = 0.5; x.fillRect(tx, ty, T, T); }
    }
    x.globalAlpha = 1;
    x.strokeStyle = p.line;
    x.lineWidth = 2;
    for (let ty = 0; ty <= H; ty += T) { x.beginPath(); x.moveTo(0, ty); x.lineTo(W, ty); x.stroke(); }
    for (let tx = 0; tx <= W; tx += T) { x.beginPath(); x.moveTo(tx, 0); x.lineTo(tx, H); x.stroke(); }
    const key = room.type === 'arena' ? 'arena' : (REALMS.find((r) => r.pal === p) || REALMS[0]).key;
    if (key === 'arena') {
      x.globalAlpha = 0.16;
      x.fillStyle = '#4fb3ff'; x.fillRect(0, 0, W / 2, H);
      x.fillStyle = '#ff5d6d'; x.fillRect(W / 2, 0, W / 2, H);
      x.globalAlpha = 0.5;
      x.strokeStyle = '#ffd23f'; x.lineWidth = 6;
      circle(x, W / 2, H / 2, 150); x.stroke();
      x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();
      x.globalAlpha = 1;
    }
    for (const d of room.deco) this.drawDeco(x, key, d, p, rng);
    // walls
    x.fillStyle = p.wall;
    x.fillRect(0, 0, W, 28); x.fillRect(0, H - 28, W, 28); x.fillRect(0, 0, 28, H); x.fillRect(W - 28, 0, 28, H);
    x.fillStyle = shade(p.wall, 0.15);
    for (let i = 0; i < W; i += 56) { x.fillRect(i + 2, 2, 52, 10); x.fillRect(i + 2, H - 12, 52, 10); }
    for (let i = 0; i < H; i += 56) { x.fillRect(2, i + 2, 10, 52); x.fillRect(W - 12, i + 2, 10, 52); }
    x.strokeStyle = shade(p.wall, -0.4); x.lineWidth = 4; x.strokeRect(28, 28, W - 56, H - 56);
    const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    this.floor = c; this.floorRoom = room; this.floorK = k;
  },

  drawDeco(x, key, d, p, rng) {
    const s = d.s;
    x.save();
    x.translate(d.x, d.y);
    if (key === 'woods' || key === 'arena') {
      if (d.k < 3) { x.strokeStyle = d.k === 0 ? p.deco : shade(p.deco, 0.2); x.lineWidth = 2.5; x.lineCap = 'round'; for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 4 * s, 0); x.lineTo(i * 6 * s, -10 * s - Math.abs(i) * -2); x.stroke(); } }
      else if (d.k === 3) { x.fillStyle = ['#ffd84a', '#ff7ad1', '#ffffff'][Math.floor(rng.next() * 3)]; for (let i = 0; i < 3; i++) { circle(x, (i - 1) * 7 * s, (i % 2) * 5 * s, 2.6 * s); x.fill(); } }
      else { x.fillStyle = shade(p.f1, -0.25); ellipse(x, 0, 0, 9 * s, 6 * s); x.fill(); }
    } else if (key === 'crypt') {
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2;
      if (d.k < 2) { x.beginPath(); x.moveTo(-14 * s, 0); x.lineTo(-3 * s, 4 * s); x.lineTo(6 * s, -3 * s); x.lineTo(16 * s, 2 * s); x.stroke(); }
      else if (d.k < 4) { x.fillStyle = '#d8d2c0'; x.globalAlpha = 0.5; x.fillRect(-8 * s, -1.5 * s, 16 * s, 3 * s); circle(x, -8 * s, 0, 3 * s); x.fill(); circle(x, 8 * s, 0, 3 * s); x.fill(); }
      else { x.fillStyle = 'rgba(154,255,198,0.25)'; circle(x, 0, 0, 10 * s); x.fill(); x.fillStyle = '#f0e6c0'; x.fillRect(-2, -8, 4, 8); }
    } else if (key === 'ember') {
      if (d.k < 3) { x.strokeStyle = 'rgba(255,120,30,0.55)'; x.lineWidth = 3; x.beginPath(); x.moveTo(-16 * s, -4 * s); x.lineTo(-4 * s, 3 * s); x.lineTo(4 * s, -2 * s); x.lineTo(15 * s, 5 * s); x.stroke(); x.strokeStyle = 'rgba(255,220,120,0.6)'; x.lineWidth = 1; x.stroke(); }
      else { x.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(x, 0, 0, 14 * s, 8 * s); x.fill(); }
    } else if (key === 'frost') {
      if (d.k < 3) { x.fillStyle = 'rgba(240,250,255,0.35)'; ellipse(x, 0, 0, 22 * s, 10 * s); x.fill(); ellipse(x, 10 * s, 4 * s, 12 * s, 6 * s); x.fill(); }
      else { x.strokeStyle = 'rgba(200,240,255,0.4)'; x.lineWidth = 2; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(i * 2.1) * 12 * s, Math.sin(i * 2.1) * 12 * s); x.stroke(); } }
    } else if (key === 'void') {
      if (d.k < 2) { x.strokeStyle = 'rgba(176,123,255,0.35)'; x.lineWidth = 2; circle(x, 0, 0, 12 * s); x.stroke(); x.beginPath(); x.moveTo(-8 * s, 0); x.lineTo(8 * s, 0); x.moveTo(0, -8 * s); x.lineTo(0, 8 * s); x.stroke(); }
      else { x.fillStyle = 'rgba(255,255,255,0.5)'; circle(x, 0, 0, 1.4 * s); x.fill(); }
    }
    x.restore();
  },

  // ---------- obstacles ----------
  drawObst(x, o, pal) {
    const r = o.r, t = pal.obst;
    x.save();
    x.translate(o.x, o.y);
    if (t === 'tree') {
      x.fillStyle = '#5a3a22'; x.fillRect(-r * 0.22, -r * 0.6, r * 0.44, r * 0.7);
      const g = shade(pal.deco, -0.2);
      x.fillStyle = 'rgba(0,0,0,0.25)'; circle(x, 0, -r * 0.7, r * 1.05); x.fill();
      x.fillStyle = g; circle(x, -r * 0.35, -r * 0.75, r * 0.7); x.fill(); circle(x, r * 0.38, -r * 0.8, r * 0.68); x.fill();
      x.fillStyle = pal.deco; circle(x, 0, -r * 1.05, r * 0.78); x.fill();
      x.fillStyle = shade(pal.deco, 0.25); circle(x, -r * 0.2, -r * 1.25, r * 0.35); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; circle(x, 0, -r * 1.05, r * 0.78); x.stroke();
    } else if (t === 'pillar') {
      x.fillStyle = shade(pal.deco, -0.25); x.fillRect(-r * 0.75, -r * 1.6, r * 1.5, r * 1.6);
      x.fillStyle = shade(pal.deco, 0.05); ellipse(x, 0, -r * 1.6, r * 0.85, r * 0.35); x.fill();
      x.fillStyle = shade(pal.deco, -0.1); ellipse(x, 0, 0, r * 0.8, r * 0.32); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 2; x.beginPath(); x.moveTo(-r * 0.3, -r * 1.3); x.lineTo(-r * 0.1, -r * 0.8); x.lineTo(-r * 0.35, -r * 0.4); x.stroke();
      if (pal === ARENA_PAL) { x.fillStyle = '#ffd23f'; x.globalAlpha = 0.6; x.fillRect(-r * 0.75, -r * 0.9, r * 1.5, 5); x.globalAlpha = 1; }
    } else if (t === 'rock') {
      x.fillStyle = '#2a1a16';
      x.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU - Math.PI / 2, rr = r * (0.85 + hsh(o.x + i) * 0.35); x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8 - r * 0.4); } x.closePath(); x.fill();
      x.strokeStyle = '#ff7b2e'; x.lineWidth = 2.5; x.shadowColor = '#ff7b2e'; x.shadowBlur = 0;
      x.beginPath(); x.moveTo(-r * 0.5, -r * 0.6); x.lineTo(-r * 0.1, -r * 0.3); x.lineTo(r * 0.2, -r * 0.7); x.lineTo(r * 0.5, -r * 0.2); x.stroke();
    } else if (t === 'crystal') {
      for (const [dx, h, w2] of [[-0.45, 1.3, 0.38], [0.4, 1.05, 0.34], [0, 1.8, 0.45]]) {
        x.fillStyle = 'rgba(168,234,255,0.85)';
        x.beginPath(); x.moveTo(dx * r - w2 * r, 0); x.lineTo(dx * r, -h * r); x.lineTo(dx * r + w2 * r, 0); x.closePath(); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.55)';
        x.beginPath(); x.moveTo(dx * r - w2 * r * 0.4, -r * 0.1); x.lineTo(dx * r, -h * r * 0.9); x.lineTo(dx * r, -r * 0.1); x.closePath(); x.fill();
      }
    } else if (t === 'obelisk') {
      x.fillStyle = '#120c22';
      x.beginPath(); x.moveTo(-r * 0.6, 0); x.lineTo(-r * 0.4, -r * 2); x.lineTo(0, -r * 2.4); x.lineTo(r * 0.4, -r * 2); x.lineTo(r * 0.6, 0); x.closePath(); x.fill();
      const gl = 0.5 + 0.5 * Math.sin(performance.now() / 500 + o.x);
      x.fillStyle = `rgba(176,123,255,${0.4 + gl * 0.5})`;
      x.fillRect(-r * 0.12, -r * 1.7, r * 0.24, r * 0.5); circle(x, 0, -r * 0.8, r * 0.14); x.fill();
    }
    x.restore();
  },

  // ---------- units ----------
  shadow(x, u) {
    x.fillStyle = 'rgba(0,0,0,0.28)';
    const lift = u.dash && u.dash.air ? 0.6 : 1;
    ellipse(x, u.x, u.y + u.r * 0.78, u.r * 0.9 * lift, u.r * 0.34 * lift);
    x.fill();
  },

  body(x, cx, cy, r, col, sq) {
    const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.1, cx, cy, r * 1.05);
    g.addColorStop(0, shade(col, 0.35)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.35));
    x.fillStyle = g;
    ellipse(x, cx, cy, r * (sq || 1), r / (sq || 1));
    x.fill();
    x.lineWidth = Math.max(2, r * 0.12);
    x.strokeStyle = 'rgba(10,8,20,0.75)';
    x.stroke();
  },

  eyes(x, cx, cy, r, ang, col, sz) {
    const ex = Math.cos(ang) * r * 0.22, ey = Math.sin(ang) * r * 0.16;
    const s = sz || 1;
    for (const side of [-1, 1]) {
      const px = cx + side * r * 0.3 + ex, py = cy - r * 0.08 + ey;
      x.fillStyle = col || '#ffffff';
      ellipse(x, px, py, r * 0.17 * s, r * 0.21 * s); x.fill();
      x.fillStyle = '#14101e';
      circle(x, px + Math.cos(ang) * r * 0.06, py + Math.sin(ang) * r * 0.05, r * 0.09 * s); x.fill();
    }
  },

  weapon(x, u, cx, cy, kind, col, t) {
    const r = u.r;
    const melee = u.hero && (u.hero.basic.kind === 'melee' || u.hero.basic.kind === 'thrust');
    let a = u.ang;
    if (u.anim > 0 && melee) a += (u.anim - 0.5) * 2.2;
    const hx = cx + Math.cos(u.ang + 0.9) * r * 0.85, hy = cy + Math.sin(u.ang + 0.9) * r * 0.85;
    const recoil = !melee && u.anim > 0 ? -u.anim * 5 : 0;
    x.save();
    x.translate(hx + Math.cos(a) * recoil, hy + Math.sin(a) * recoil);
    x.rotate(a);
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(10,8,20,0.8)';
    const L = r * 1.1;
    switch (kind) {
      case 'sword': x.fillStyle = col; x.fillRect(2, -2.5, L, 5); x.strokeRect(2, -2.5, L, 5); x.fillStyle = '#7a5a2a'; x.fillRect(-4, -6, 6, 12); break;
      case 'staff': x.strokeStyle = '#6a4a2a'; x.lineWidth = 4; x.beginPath(); x.moveTo(-6, 0); x.lineTo(L + 4, 0); x.stroke(); x.drawImage(glowSprite(col), L - 8, -14, 28, 28); x.fillStyle = col; circle(x, L + 6, 0, 5.5); x.fill(); break;
      case 'wand': x.strokeStyle = '#d8c8a8'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.lineTo(L * 0.8, 0); x.stroke(); x.drawImage(glowSprite(col), L * 0.8 - 10, -10, 20, 20); break;
      case 'bow': x.strokeStyle = col; x.lineWidth = 3.5; x.beginPath(); x.arc(0, 0, L * 0.7, -1.2, 1.2); x.stroke(); x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 1; x.beginPath(); x.moveTo(Math.cos(-1.2) * L * 0.7, Math.sin(-1.2) * L * 0.7); x.lineTo(Math.cos(1.2) * L * 0.7, Math.sin(1.2) * L * 0.7); x.stroke(); break;
      case 'fist': x.fillStyle = col; circle(x, 6, 0, r * 0.34); x.fill(); x.lineWidth = 2; x.stroke(); break;
      case 'gun': x.fillStyle = '#6a7484'; x.fillRect(0, -4, L * 0.85, 8); x.strokeRect(0, -4, L * 0.85, 8); x.fillStyle = '#ffb02e'; x.fillRect(L * 0.6, -6, 6, 4); break;
      case 'daggers': x.fillStyle = col; x.beginPath(); x.moveTo(0, -3); x.lineTo(L * 0.8, 0); x.lineTo(0, 3); x.closePath(); x.fill(); x.stroke(); break;
      case 'axe': x.strokeStyle = '#6a4a2a'; x.lineWidth = 4; x.beginPath(); x.moveTo(-4, 0); x.lineTo(L, 0); x.stroke(); x.fillStyle = col; x.beginPath(); x.moveTo(L - 12, -2); x.quadraticCurveTo(L + 4, -16, L + 6, -2); x.lineTo(L + 6, 2); x.quadraticCurveTo(L + 4, 16, L - 12, 2); x.closePath(); x.fill(); x.lineWidth = 1.5; x.strokeStyle = 'rgba(10,8,20,0.8)'; x.stroke(); break;
      case 'scythe': x.strokeStyle = '#3a3048'; x.lineWidth = 4; x.beginPath(); x.moveTo(-6, 0); x.lineTo(L + 4, 0); x.stroke(); x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.arc(L + 4, 12, 14, -Math.PI / 2, 0.4); x.stroke(); break;
      case 'lute': x.fillStyle = col; ellipse(x, 6, 0, 10, 8); x.fill(); x.stroke(); x.fillStyle = '#6a4a2a'; x.fillRect(12, -2, L * 0.7, 4); break;
      case 'orb': { const fl = Math.sin(t * 3) * 3; x.drawImage(glowSprite(col), 0, -16 + fl, 32, 32); x.fillStyle = '#1a0f2e'; circle(x, 16, fl, 6); x.fill(); break; }
      case 'spear': x.strokeStyle = '#8a6a3a'; x.lineWidth = 3.5; x.beginPath(); x.moveTo(-8, 0); x.lineTo(L * 1.3, 0); x.stroke(); x.fillStyle = col; x.beginPath(); x.moveTo(L * 1.3 - 2, -5); x.lineTo(L * 1.3 + 12, 0); x.lineTo(L * 1.3 - 2, 5); x.closePath(); x.fill(); break;
    }
    x.restore();
  },

  hat(x, u, cx, cy, t) {
    const r = u.r, h = u.hero, c = h.color, c2 = h.color2;
    const top = cy - r * 0.62;
    x.lineWidth = 2;
    x.strokeStyle = 'rgba(10,8,20,0.75)';
    switch (h.look.hat) {
      case 'helm':
        x.fillStyle = '#c8d0e0'; x.beginPath(); x.arc(cx, cy - r * 0.05, r * 1.0, Math.PI * 1.05, Math.PI * 1.95); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = c2; x.beginPath(); x.moveTo(cx, top - r * 0.35); x.quadraticCurveTo(cx - r * 0.6, top - r * 0.9, cx - r * 0.9, top - r * 0.2); x.quadraticCurveTo(cx - r * 0.3, top - r * 0.3, cx, top - r * 0.2); x.fill();
        break;
      case 'wizard':
        x.fillStyle = shade(c, -0.25); x.beginPath(); x.moveTo(cx - r * 0.95, top + r * 0.12); x.lineTo(cx + r * 0.95, top + r * 0.12); x.lineTo(cx + r * 0.2, top - r * 1.25); x.quadraticCurveTo(cx + r * 0.7, top - r * 1.35, cx + r * 0.75, top - r * 1.05); x.lineTo(cx + r * 0.15, top - r * 1.5); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = '#ffd84a'; circle(x, cx - r * 0.05, top - r * 0.4, r * 0.13); x.fill();
        break;
      case 'feather':
        x.fillStyle = shade(c, -0.3); x.beginPath(); x.ellipse(cx, top + r * 0.05, r * 0.85, r * 0.42, 0, Math.PI, TAU); x.fill(); x.stroke();
        x.strokeStyle = '#ff5a4a'; x.lineWidth = 3.5; x.beginPath(); x.moveTo(cx + r * 0.3, top); x.quadraticCurveTo(cx + r * 1.1, top - r * 0.9, cx + r * 1.4, top - r * 0.2); x.stroke();
        break;
      case 'leaves':
        for (let i = 0; i < 6; i++) { const a = Math.PI + i / 5 * Math.PI; x.fillStyle = i % 2 ? '#7be06a' : '#3fbf5a'; ellipse(x, cx + Math.cos(a) * r * 0.75, cy - r * 0.25 + Math.sin(a) * r * 0.75, r * 0.26, r * 0.16); x.fill(); }
        x.fillStyle = '#ff7ad1'; circle(x, cx + r * 0.5, top - r * 0.05, r * 0.14); x.fill();
        break;
      case 'icecrown':
        x.fillStyle = '#e8fbff';
        for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(cx + i * r * 0.3 - r * 0.13, top + r * 0.1); x.lineTo(cx + i * r * 0.3, top - r * (0.55 - Math.abs(i) * 0.12)); x.lineTo(cx + i * r * 0.3 + r * 0.13, top + r * 0.1); x.closePath(); x.fill(); x.stroke(); }
        break;
      case 'band': {
        x.fillStyle = '#ff5a4a'; x.fillRect(cx - r * 0.9, top + r * 0.15, r * 1.8, r * 0.25); x.strokeRect(cx - r * 0.9, top + r * 0.15, r * 1.8, r * 0.25);
        const fl = Math.sin(t * 9) * r * 0.2;
        x.strokeStyle = '#ff5a4a'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx - r * 0.9, top + r * 0.28); x.lineTo(cx - r * 1.5, top + r * 0.1 + fl); x.moveTo(cx - r * 0.9, top + r * 0.28); x.lineTo(cx - r * 1.4, top + r * 0.6 - fl); x.stroke();
        break;
      }
      case 'goggles':
        x.fillStyle = '#6a4a2a'; x.fillRect(cx - r * 0.9, top + r * 0.1, r * 1.8, r * 0.18);
        for (const s of [-1, 1]) { x.fillStyle = '#8ad8ff'; circle(x, cx + s * r * 0.33, top + r * 0.18, r * 0.24); x.fill(); x.stroke(); }
        break;
      case 'spikes':
        x.fillStyle = '#ffe23f'; x.beginPath(); x.moveTo(cx - r * 0.95, top + r * 0.3);
        for (let i = 0; i <= 6; i++) { const px = cx - r * 0.95 + i * r * 0.32; x.lineTo(px, top + (i % 2 ? -r * 0.55 : r * 0.05)); }
        x.lineTo(cx + r * 0.95, top + r * 0.3); x.closePath(); x.fill(); x.stroke();
        break;
      case 'hood':
        x.fillStyle = shade(c, -0.45); x.beginPath(); x.arc(cx, cy, r * 1.08, Math.PI * 0.95, Math.PI * 2.05); x.quadraticCurveTo(cx, cy - r * 0.15, cx - r * 1.08, cy + r * 0.05); x.fill(); x.stroke();
        break;
      case 'horns':
        x.fillStyle = '#9aa2b0'; x.beginPath(); x.arc(cx, cy - r * 0.05, r * 0.98, Math.PI * 1.05, Math.PI * 1.95); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = '#f0e6c8';
        for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * r * 0.6, top + r * 0.1); x.quadraticCurveTo(cx + s * r * 1.5, top - r * 0.1, cx + s * r * 1.25, top - r * 0.85); x.quadraticCurveTo(cx + s * r * 1.1, top - r * 0.2, cx + s * r * 0.4, top - r * 0.05); x.fill(); x.stroke(); }
        break;
      case 'witch':
        x.fillStyle = '#2a3a1a'; ellipse(x, cx, top + r * 0.1, r * 1.25, r * 0.28); x.fill(); x.stroke();
        x.beginPath(); x.moveTo(cx - r * 0.6, top + r * 0.05); x.lineTo(cx + r * 0.6, top + r * 0.05); x.lineTo(cx + r * 0.1, top - r * 1.1); x.lineTo(cx + r * 0.8, top - r * 1.2); x.lineTo(cx - r * 0.1, top - r * 1.25); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = '#b6ff4a'; x.fillRect(cx - r * 0.55, top - r * 0.15, r * 1.1, r * 0.15);
        break;
      case 'bard':
        x.fillStyle = '#7a2a6a'; ellipse(x, cx - r * 0.1, top, r * 0.95, r * 0.4); x.fill(); x.stroke();
        x.strokeStyle = '#ffd84a'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx + r * 0.3, top - r * 0.1); x.quadraticCurveTo(cx + r, top - r * 0.8, cx + r * 1.3, top - r * 0.6); x.stroke();
        break;
      case 'rock':
        x.fillStyle = shade(c, -0.15);
        for (let i = 0; i < 4; i++) { circle(x, cx + (i - 1.5) * r * 0.45, top + r * 0.05 - (i % 2) * r * 0.2, r * 0.3); x.fill(); }
        break;
      case 'halo':
        x.strokeStyle = '#fff1a0'; x.lineWidth = 3.5; ellipse(x, cx, top - r * 0.45 + Math.sin(t * 3) * 2, r * 0.7, r * 0.2); x.stroke();
        break;
      case 'clock': {
        x.fillStyle = 'rgba(255,224,138,0.35)'; circle(x, cx, top - r * 0.2, r * 0.75); x.fill();
        x.strokeStyle = '#ffe08a'; x.lineWidth = 2; circle(x, cx, top - r * 0.2, r * 0.75); x.stroke();
        x.beginPath(); x.moveTo(cx, top - r * 0.2); x.lineTo(cx + Math.cos(t * 2) * r * 0.55, top - r * 0.2 + Math.sin(t * 2) * r * 0.55); x.moveTo(cx, top - r * 0.2); x.lineTo(cx + Math.cos(t / 3) * r * 0.35, top - r * 0.2 + Math.sin(t / 3) * r * 0.35); x.stroke();
        break;
      }
      case 'voideye':
        x.fillStyle = '#1a0f2e'; ellipse(x, cx, top + r * 0.12, r * 0.3, r * 0.2); x.fill();
        x.fillStyle = '#ff8af0'; circle(x, cx, top + r * 0.12, r * 0.11); x.fill();
        for (let i = 0; i < 3; i++) { const a = t * 1.5 + i * TAU / 3; x.drawImage(glowSprite('#b07bff'), cx + Math.cos(a) * r * 1.3 - 6, cy + Math.sin(a) * r * 0.5 - r - 6, 12, 12); }
        break;
      case 'dragon':
        x.fillStyle = '#c84a2a'; x.beginPath(); x.arc(cx, cy - r * 0.05, r * 1.0, Math.PI * 1.05, Math.PI * 1.95); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = '#ffcf6a';
        for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * r * 0.45, top); x.lineTo(cx + s * r * 0.85, top - r * 0.75); x.lineTo(cx + s * r * 0.2, top - r * 0.1); x.closePath(); x.fill(); x.stroke(); }
        break;
    }
  },

  status(x, u, t) {
    const st = u.st, r = u.r;
    if (u.shield > 0) { x.strokeStyle = 'rgba(140,220,255,0.75)'; x.lineWidth = 3; circle(x, u.x, u.y, r + 6); x.stroke(); }
    if (st.invuln > 0 && u.kind === 'hero') { x.strokeStyle = `rgba(255,230,120,${0.5 + 0.3 * Math.sin(t * 20)})`; x.lineWidth = 3; circle(x, u.x, u.y, r + 9); x.stroke(); }
    if (st.freeze > 0) { x.fillStyle = 'rgba(170,230,255,0.45)'; x.strokeStyle = 'rgba(230,250,255,0.9)'; x.lineWidth = 2; x.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; x.lineTo(u.x + Math.cos(a) * r * 1.2, u.y + Math.sin(a) * r * 1.2); } x.closePath(); x.fill(); x.stroke(); }
    if (st.stun > 0) for (let i = 0; i < 3; i++) { const a = t * 6 + i * TAU / 3; x.fillStyle = '#ffe23f'; circle(x, u.x + Math.cos(a) * r * 0.8, u.y - r * 1.25 + Math.sin(a) * r * 0.25, 3.2); x.fill(); }
    if (st.burn > 0 && Math.random() < 0.35) FX.burst(u.x + (Math.random() - 0.5) * r, u.y - r * 0.3, 1, '#ff7b2e', 30, 0.4, 3, -80);
    if (st.poison > 0 && Math.random() < 0.2) FX.burst(u.x + (Math.random() - 0.5) * r, u.y - r * 0.2, 1, '#8fe03a', 20, 0.5, 3, -50);
    if (st.root > 0) { x.strokeStyle = '#7a5a2a'; x.lineWidth = 3; for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; x.beginPath(); x.moveTo(u.x + Math.cos(a) * r * 1.2, u.y + r * 0.6); x.quadraticCurveTo(u.x + Math.cos(a) * r * 0.6, u.y - r * 0.2, u.x + Math.cos(a) * r * 0.3, u.y + r * 0.3); x.stroke(); } }
    if (st.voidMark > 0) { x.strokeStyle = 'rgba(176,123,255,0.6)'; x.lineWidth = 2; circle(x, u.x, u.y, r + 3); x.stroke(); }
    if (st.slow > 0 && u.kind !== 'hero') { x.fillStyle = 'rgba(140,200,255,0.18)'; circle(x, u.x, u.y, r); x.fill(); }
  },

  drawHero(x, u, t, view) {
    const r = u.r, h = u.hero;
    if (u.ko) return;
    if (u.downed) {
      x.save();
      x.globalAlpha = u.deadOut ? 0.5 : 0.85;
      if (u.deadOut) {
        x.fillStyle = '#6a6f80'; roundRect(x, u.x - 12, u.y - 26, 24, 30, 10); x.fill();
        x.strokeStyle = '#2a2d38'; x.lineWidth = 2; x.stroke();
        x.fillStyle = '#2a2d38'; x.fillRect(u.x - 2, u.y - 20, 4, 14); x.fillRect(u.x - 7, u.y - 15, 14, 4);
      } else {
        this.body(x, u.x, u.y + 4, r, shade(h.color, -0.35), 1.25);
        x.strokeStyle = '#14101e'; x.lineWidth = 2.5;
        for (const s of [-1, 1]) { x.beginPath(); x.moveTo(u.x + s * r * 0.3 - 4, u.y - 2); x.lineTo(u.x + s * r * 0.3 + 4, u.y + 6); x.moveTo(u.x + s * r * 0.3 + 4, u.y - 2); x.lineTo(u.x + s * r * 0.3 - 4, u.y + 6); x.stroke(); }
        // revive ring
        x.globalAlpha = 1;
        x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 6; circle(x, u.x, u.y, r + 14); x.stroke();
        if (u.reviveP > 0) { x.strokeStyle = '#5df0b0'; x.lineWidth = 6; x.beginPath(); x.arc(u.x, u.y, r + 14, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(u.reviveP / REVIVE_TIME, 0, 1)); x.stroke(); }
        else { x.strokeStyle = '#ff5a5a'; x.lineWidth = 3; x.beginPath(); x.arc(u.x, u.y, r + 14, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(u.bleed / BLEED_TIME, 0, 1)); x.stroke(); }
        if (!u.autoRev) outlineText(x, '+', u.x, u.y - r - 26 + Math.sin(t * 6) * 3, 22, '#5df0b0');
      }
      x.restore();
      return;
    }
    const moving = Math.abs(u.x - (u.px || u.x)) + Math.abs(u.y - (u.py || u.y)) > 0.3;
    const bob = moving ? Math.sin(t * 14 + u.id) * 1.6 : Math.sin(t * 3 + u.id) * 0.6;
    const cx = u.x, cy = u.y - bob - (u.dash && u.dash.air ? 26 : 0);
    x.save();
    if (u.st.invis > 0) x.globalAlpha = 0.38;
    if (u.formT > (view.t || 0)) { x.drawImage(glowSprite('#ff7b2e'), cx - r * 2, cy - r * 2, r * 4, r * 4); }
    if (u.buffs.some((b) => b.id === 'rage')) x.drawImage(glowSprite('#ff3b3b'), cx - r * 1.8, cy - r * 1.8, r * 3.6, r * 3.6);
    if (u.channel && u.channel.kind === 'lotus') { for (let i = 0; i < 6; i++) { const a = t * 12 + i * TAU / 6; x.fillStyle = '#d6c8ff'; x.save(); x.translate(cx + Math.cos(a) * r * 2.5, cy + Math.sin(a) * r * 2.5); x.rotate(a); x.fillRect(-9, -2, 18, 4); x.restore(); } }
    if (u.channel && u.channel.kind === 'whirl') { x.strokeStyle = 'rgba(220,225,240,0.5)'; x.lineWidth = 5; x.beginPath(); x.arc(cx, cy, r * 2.6, t * 14, t * 14 + 4); x.stroke(); }
    const ang = u.angLocal != null && view.me === u ? u.angLocal : u.ang;
    const uu = ang === u.ang ? u : Object.assign({}, u, { ang });
    if (Math.sin(ang) < -0.2) this.weapon(x, uu, cx, cy, h.look.weapon, h.look.wcol, t);
    this.body(x, cx, cy, r, h.color);
    x.fillStyle = shade(h.color2, -0.05);
    ellipse(x, cx, cy + r * 0.38, r * 0.55, r * 0.32); x.fill();
    this.eyes(x, cx, cy, r, ang, h.look.hat === 'hood' ? '#ffe0ff' : null);
    this.hat(x, u, cx, cy, t);
    if (Math.sin(ang) >= -0.2) this.weapon(x, uu, cx, cy, h.look.weapon, h.look.wcol, t);
    if (u.flash > 0) { x.globalAlpha = 0.6; x.fillStyle = '#ffffff'; circle(x, cx, cy, r); x.fill(); }
    x.restore();
    this.status(x, u, t);
  },

  drawMob(x, u, t) {
    const d = u.mob, L = d.look, r = u.r, c = L.color;
    const wob = Math.sin(t * 8 + u.id) * 0.06;
    const cx = u.x, cy = u.y - (u.dash && u.dash.air ? 30 : 0);
    if (u.elite) { const ec = (ELITE_AFFIX.find((e) => e.key === u.elite) || {}).color || '#fff'; x.drawImage(glowSprite(ec), cx - r * 2, cy - r * 2, r * 4, r * 4); }
    if (L.glow) x.drawImage(glowSprite(c), cx - r * 1.7, cy - r * 1.7, r * 3.4, r * 3.4);
    x.save();
    const a = u.ang;
    switch (L.shape) {
      case 'slime': {
        const sq = 1 + wob * 2;
        x.fillStyle = c; x.globalAlpha = 0.92;
        x.beginPath(); x.ellipse(cx, cy + r * 0.15, r * 1.08 * sq, r * 0.9 / sq, 0, Math.PI, 0); x.lineTo(cx + r * 1.08 * sq, cy + r * 0.5); x.quadraticCurveTo(cx, cy + r * 0.8, cx - r * 1.08 * sq, cy + r * 0.5); x.closePath(); x.fill();
        x.globalAlpha = 1; x.strokeStyle = 'rgba(10,8,20,0.7)'; x.lineWidth = 2; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.45)'; ellipse(x, cx - r * 0.4, cy - r * 0.35, r * 0.25, r * 0.15); x.fill();
        this.eyes(x, cx, cy + r * 0.05, r * 0.9, a);
        break;
      }
      case 'goblin': case 'tree': {
        this.body(x, cx, cy, r, c);
        if (L.shape === 'tree') { x.fillStyle = '#3f7a2a'; circle(x, cx, cy - r * 0.9, r * 0.6); x.fill(); circle(x, cx - r * 0.5, cy - r * 0.6, r * 0.4); x.fill(); circle(x, cx + r * 0.5, cy - r * 0.6, r * 0.4); x.fill(); }
        else if (L.hood) { x.fillStyle = shade(c, -0.4); x.beginPath(); x.arc(cx, cy, r * 1.06, Math.PI, TAU); x.fill(); }
        else { x.fillStyle = c; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * r * 0.7, cy - r * 0.3); x.lineTo(cx + s * r * 1.5, cy - r * 0.75); x.lineTo(cx + s * r * 0.8, cy + r * 0.1); x.fill(); } }
        this.eyes(x, cx, cy, r, a, '#ffe07a');
        this.mobWeapon(x, u, cx, cy, L.weapon || 'dagger');
        break;
      }
      case 'shroom':
        this.body(x, cx, cy + r * 0.2, r * 0.75, '#efe2c8');
        x.fillStyle = c; x.beginPath(); x.ellipse(cx, cy - r * 0.15, r * 1.25, r * 0.85, 0, Math.PI, 0); x.closePath(); x.fill(); x.strokeStyle = 'rgba(10,8,20,0.7)'; x.lineWidth = 2; x.stroke();
        x.fillStyle = '#ffffff'; circle(x, cx - r * 0.5, cy - r * 0.5, r * 0.18); x.fill(); circle(x, cx + r * 0.3, cy - r * 0.7, r * 0.14); x.fill(); circle(x, cx + r * 0.6, cy - r * 0.3, r * 0.12); x.fill();
        this.eyes(x, cx, cy + r * 0.25, r * 0.75, a);
        break;
      case 'wolf': {
        x.translate(cx, cy); x.rotate(a);
        x.fillStyle = shade(c, -0.1); x.strokeStyle = 'rgba(10,8,20,0.75)'; x.lineWidth = 2;
        const leg = Math.sin(t * 16 + u.id) * r * 0.25;
        x.fillRect(-r * 0.6 + leg, -r * 0.75, r * 0.2, r * 1.5); x.fillRect(r * 0.4 - leg, -r * 0.75, r * 0.2, r * 1.5);
        ellipse(x, 0, 0, r * 1.15, r * 0.7); x.fillStyle = c; x.fill(); x.stroke();
        x.beginPath(); x.moveTo(-r * 1.1, 0); x.lineTo(-r * 1.7, -r * 0.3 + Math.sin(t * 10) * 4); x.lineWidth = 5; x.strokeStyle = c; x.stroke();
        x.fillStyle = c; ellipse(x, r * 1.0, 0, r * 0.55, r * 0.5); x.fill(); x.strokeStyle = 'rgba(10,8,20,0.75)'; x.lineWidth = 2; x.stroke();
        x.fillStyle = shade(c, -0.3); x.beginPath(); x.moveTo(r * 0.8, -r * 0.35); x.lineTo(r * 0.95, -r * 0.8); x.lineTo(r * 1.15, -r * 0.35); x.fill(); x.beginPath(); x.moveTo(r * 0.8, r * 0.35); x.lineTo(r * 0.95, r * 0.8); x.lineTo(r * 1.15, r * 0.35); x.fill();
        x.fillStyle = L.glow ? '#ffe07a' : '#ff4a4a'; circle(x, r * 1.25, -r * 0.18, r * 0.1); x.fill(); circle(x, r * 1.25, r * 0.18, r * 0.1); x.fill();
        break;
      }
      case 'skull':
        if (L.hat === 'mage') { x.fillStyle = '#3a2a5a'; x.beginPath(); x.moveTo(cx - r * 1.1, cy + r * 1.0); x.lineTo(cx + r * 1.1, cy + r * 1.0); x.lineTo(cx, cy - r * 0.2); x.closePath(); x.fill(); }
        this.body(x, cx, cy, r, c);
        x.fillStyle = '#1a1420'; ellipse(x, cx - r * 0.33, cy - r * 0.1, r * 0.22, r * 0.26); x.fill(); ellipse(x, cx + r * 0.33, cy - r * 0.1, r * 0.22, r * 0.26); x.fill();
        x.fillStyle = L.hat === 'mage' ? '#9affc6' : '#ff5a4a'; circle(x, cx - r * 0.33, cy - r * 0.08, r * 0.08); x.fill(); circle(x, cx + r * 0.33, cy - r * 0.08, r * 0.08); x.fill();
        x.fillStyle = '#1a1420'; for (let i = -2; i <= 2; i++) x.fillRect(cx + i * r * 0.16 - 1.5, cy + r * 0.35, 3, r * 0.25);
        if (L.hat === 'mage') { x.fillStyle = shade(c, -0.6); x.beginPath(); x.moveTo(cx - r * 0.9, cy - r * 0.55); x.lineTo(cx + r * 0.9, cy - r * 0.55); x.lineTo(cx + r * 0.1, cy - r * 1.7); x.closePath(); x.fill(); }
        if (L.weapon) this.mobWeapon(x, u, cx, cy, L.weapon);
        break;
      case 'ghost': {
        x.globalAlpha = 0.75;
        x.fillStyle = c; x.beginPath(); x.arc(cx, cy - r * 0.1, r, Math.PI, 0);
        for (let i = 0; i <= 4; i++) x.lineTo(cx + r - i * r / 2, cy + r * 0.8 + (i % 2 ? -r * 0.25 : 0) + Math.sin(t * 8 + i) * 3);
        x.closePath(); x.fill();
        x.globalAlpha = 1;
        x.fillStyle = '#1a1830'; ellipse(x, cx - r * 0.3, cy - r * 0.15, r * 0.16, r * 0.24); x.fill(); ellipse(x, cx + r * 0.3, cy - r * 0.15, r * 0.16, r * 0.24); x.fill();
        break;
      }
      case 'gargoyle': case 'imp': {
        const flap = Math.sin(t * 14 + u.id) * 0.4;
        x.fillStyle = shade(c, -0.25);
        for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * r * 0.5, cy - r * 0.2); x.lineTo(cx + s * r * 1.8, cy - r * (0.9 + flap)); x.lineTo(cx + s * r * 1.4, cy + r * 0.2); x.closePath(); x.fill(); }
        this.body(x, cx, cy, r, c);
        x.fillStyle = L.shape === 'imp' ? '#2a1010' : '#5a5e6a';
        for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * r * 0.35, cy - r * 0.75); x.lineTo(cx + s * r * 0.6, cy - r * 1.35); x.lineTo(cx + s * r * 0.7, cy - r * 0.6); x.fill(); }
        this.eyes(x, cx, cy, r, a, '#ffe07a');
        break;
      }
      case 'flame': {
        x.drawImage(glowSprite(c), cx - r * 2, cy - r * 2, r * 4, r * 4);
        x.fillStyle = c; x.beginPath(); x.moveTo(cx - r, cy + r * 0.6);
        for (let i = 0; i <= 5; i++) { const px = cx - r + i * r * 0.4; x.lineTo(px, cy - r * (0.6 + 0.7 * hsh(i + Math.floor(t * 10))) ); }
        x.lineTo(cx + r, cy + r * 0.6); x.quadraticCurveTo(cx, cy + r * 1.2, cx - r, cy + r * 0.6); x.fill();
        x.fillStyle = '#fff6b0'; ellipse(x, cx, cy + r * 0.2, r * 0.5, r * 0.45); x.fill();
        this.eyes(x, cx, cy + r * 0.1, r * 0.8, a, '#3a1008');
        break;
      }
      case 'brute': case 'yeti': case 'knight': {
        const big = L.shape !== 'knight';
        for (const s of [-1, 1]) { x.fillStyle = shade(c, -0.15); circle(x, cx + s * r * 0.95, cy + r * 0.15 + (u.anim > 0 ? -u.anim * 8 : 0), r * (big ? 0.42 : 0.34)); x.fill(); x.strokeStyle = 'rgba(10,8,20,0.7)'; x.lineWidth = 2; x.stroke(); }
        this.body(x, cx, cy, r, c);
        if (L.shape === 'yeti') { x.fillStyle = '#8fb0d8'; ellipse(x, cx, cy + r * 0.05, r * 0.55, r * 0.45); x.fill(); this.eyes(x, cx, cy, r * 0.8, a); }
        else if (L.shape === 'brute') { x.fillStyle = '#2a1010'; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * r * 0.4, cy - r * 0.7); x.quadraticCurveTo(cx + s * r * 1.1, cy - r * 1.4, cx + s * r * 0.75, cy - r * 1.6); x.lineTo(cx + s * r * 0.6, cy - r * 0.75); x.fill(); } this.eyes(x, cx, cy, r * 0.8, a, '#ffb02e'); x.fillStyle = '#2a1010'; x.fillRect(cx - r * 0.35, cy + r * 0.35, r * 0.7, r * 0.15); }
        else { x.fillStyle = shade(c, -0.5); x.fillRect(cx - r * 0.6, cy - r * 0.2, r * 1.2, r * 0.18); x.fillStyle = u.mid === 'shadowknight' ? '#b07bff' : '#e8fbff'; x.fillRect(cx - r * 0.4, cy - r * 0.17, r * 0.25, r * 0.1); x.fillRect(cx + r * 0.15, cy - r * 0.17, r * 0.25, r * 0.1); this.mobWeapon(x, u, cx, cy, 'sword'); }
        if (u.shield > 0 && u.maxShield) { x.strokeStyle = 'rgba(200,240,255,0.8)'; x.lineWidth = 3; circle(x, cx, cy, r + 5); x.stroke(); }
        break;
      }
      case 'wisp':
        x.drawImage(glowSprite(c), cx - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8);
        x.fillStyle = '#ffffff'; circle(x, cx, cy, r * 0.6); x.fill();
        this.eyes(x, cx, cy, r * 0.8, a, '#ffffff', 0.8);
        break;
      case 'voidling':
        x.fillStyle = c; x.beginPath();
        for (let i = 0; i < 10; i++) { const aa = i / 10 * TAU + t * 2, rr = i % 2 ? r * 0.7 : r * 1.25; x.lineTo(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr); }
        x.closePath(); x.fill(); x.strokeStyle = 'rgba(10,8,20,0.7)'; x.lineWidth = 2; x.stroke();
        x.fillStyle = '#ff8af0'; circle(x, cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2, r * 0.3); x.fill();
        break;
      case 'eye': {
        for (let i = 0; i < 5; i++) { const aa = Math.PI * 0.2 + i / 4 * Math.PI * 0.6; x.strokeStyle = shade(c, -0.4); x.lineWidth = 4; x.beginPath(); x.moveTo(cx + Math.cos(aa) * r * 0.8, cy + Math.sin(aa) * r * 0.8); x.quadraticCurveTo(cx + Math.cos(aa) * r * 1.5, cy + Math.sin(aa) * r * 1.3 + Math.sin(t * 5 + i) * 5, cx + Math.cos(aa) * r * 1.7, cy + Math.sin(aa) * r * 1.8); x.stroke(); }
        this.body(x, cx, cy, r, '#f4ecf0');
        x.fillStyle = c; circle(x, cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35, r * 0.45); x.fill();
        x.fillStyle = '#14101e'; circle(x, cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.2); x.fill();
        break;
      }
      case 'horror': {
        for (let i = 0; i < 7; i++) { const aa = i / 7 * TAU + Math.sin(t + i) * 0.3; x.strokeStyle = shade(c, 0.2); x.lineWidth = 6; x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + Math.cos(aa) * r * 1.3, cy + Math.sin(aa) * r * 1.3, cx + Math.cos(aa + Math.sin(t * 3 + i) * 0.5) * r * 1.7, cy + Math.sin(aa + Math.sin(t * 3 + i) * 0.5) * r * 1.7); x.stroke(); }
        this.body(x, cx, cy, r, c);
        for (let i = 0; i < 4; i++) { const ex = cx + (hsh(i + 3) - 0.5) * r * 1.2, ey = cy + (hsh(i + 9) - 0.5) * r * 1.0; x.fillStyle = '#ff8af0'; circle(x, ex, ey, r * 0.14); x.fill(); x.fillStyle = '#14101e'; circle(x, ex + Math.cos(a) * 2, ey + Math.sin(a) * 2, r * 0.06); x.fill(); }
        break;
      }
      default: this.body(x, cx, cy, r, c); this.eyes(x, cx, cy, r, a);
    }
    if (u.flash > 0) { x.globalAlpha = 0.55; x.fillStyle = '#ffffff'; circle(x, cx, cy, r); x.fill(); }
    x.restore();
    this.status(x, u, t);
  },

  mobWeapon(x, u, cx, cy, kind) {
    const r = u.r;
    let a = u.ang + (u.anim > 0 ? (u.anim - 0.5) * 2 : 0);
    x.save();
    x.translate(cx + Math.cos(u.ang + 0.9) * r * 0.85, cy + Math.sin(u.ang + 0.9) * r * 0.85);
    x.rotate(a);
    x.strokeStyle = 'rgba(10,8,20,0.8)'; x.lineWidth = 1.5;
    if (kind === 'bow') { x.strokeStyle = '#a8723c'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, r * 0.7, -1.2, 1.2); x.stroke(); }
    else if (kind === 'sword') { x.fillStyle = '#c8ccd8'; x.fillRect(2, -2, r * 1.1, 4); x.strokeRect(2, -2, r * 1.1, 4); }
    else { x.fillStyle = '#c8ccd8'; x.beginPath(); x.moveTo(0, -2.5); x.lineTo(r * 0.8, 0); x.lineTo(0, 2.5); x.fill(); x.stroke(); }
    x.restore();
  },

  drawBoss(x, u, t) {
    const B = u.boss, r = u.r, cx = u.x, cy = u.y - (u.dash && u.dash.air ? 30 : 0), a = u.ang;
    const enr = u.hp < u.maxHp * 0.5;
    x.drawImage(glowSprite(enr ? '#ff4f6d' : B.color2), cx - r * 1.9, cy - r * 1.9, r * 3.8, r * 3.8);
    x.save();
    switch (B.shape) {
      case 'treant':
        for (const s of [-1, 1]) { x.strokeStyle = '#4a2e18'; x.lineWidth = 12; x.beginPath(); x.moveTo(cx + s * r * 0.7, cy); x.quadraticCurveTo(cx + s * r * 1.4, cy - r * 0.2 + Math.sin(t * 2) * 8, cx + s * r * 1.6, cy - r * 0.8); x.stroke(); x.fillStyle = B.color2; circle(x, cx + s * r * 1.6, cy - r * 0.85, r * 0.3); x.fill(); }
        this.body(x, cx, cy, r, '#6a4628');
        x.fillStyle = B.color; circle(x, cx, cy - r * 0.9, r * 0.85); x.fill(); circle(x, cx - r * 0.6, cy - r * 0.6, r * 0.55); x.fill(); circle(x, cx + r * 0.6, cy - r * 0.6, r * 0.55); x.fill();
        x.fillStyle = B.color2; circle(x, cx - r * 0.2, cy - r * 1.2, r * 0.35); x.fill();
        x.strokeStyle = '#3a2412'; x.lineWidth = 3; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(cx - r * 0.5 + i * r * 0.5, cy + r * 0.1); x.lineTo(cx - r * 0.4 + i * r * 0.5, cy + r * 0.8); x.stroke(); }
        this.eyes(x, cx, cy + r * 0.05, r * 0.8, a, enr ? '#ff4f6d' : '#d6ff6a');
        break;
      case 'lich':
        x.fillStyle = '#1e1a30'; x.beginPath(); x.moveTo(cx - r * 1.1, cy + r * 1.1); x.quadraticCurveTo(cx, cy + r * 1.5 + Math.sin(t * 4) * 5, cx + r * 1.1, cy + r * 1.1); x.lineTo(cx + r * 0.6, cy - r * 0.3); x.lineTo(cx - r * 0.6, cy - r * 0.3); x.closePath(); x.fill();
        this.body(x, cx, cy - r * 0.2, r * 0.7, B.color);
        x.fillStyle = '#14101e'; ellipse(x, cx - r * 0.25, cy - r * 0.3, r * 0.15, r * 0.2); x.fill(); ellipse(x, cx + r * 0.25, cy - r * 0.3, r * 0.15, r * 0.2); x.fill();
        x.fillStyle = B.color2; circle(x, cx - r * 0.25, cy - r * 0.28, r * 0.07); x.fill(); circle(x, cx + r * 0.25, cy - r * 0.28, r * 0.07); x.fill();
        x.fillStyle = '#ffd23f'; x.beginPath(); x.moveTo(cx - r * 0.55, cy - r * 0.65); for (let i = 0; i <= 4; i++) x.lineTo(cx - r * 0.55 + i * r * 0.275, cy - r * (i % 2 ? 0.85 : 1.15)); x.lineTo(cx + r * 0.55, cy - r * 0.65); x.closePath(); x.fill();
        for (const s of [-1, 1]) { const hy = cy + Math.sin(t * 3 + s) * 8; x.fillStyle = B.color; circle(x, cx + s * r * 1.15, hy, r * 0.18); x.fill(); }
        x.strokeStyle = '#4a3a2a'; x.lineWidth = 5; x.beginPath(); x.moveTo(cx + r * 1.15, cy + r); x.lineTo(cx + r * 1.15, cy - r * 1.1); x.stroke();
        x.drawImage(glowSprite(B.color2), cx + r * 1.15 - 18, cy - r * 1.1 - 18, 36, 36);
        break;
      case 'golem':
        for (const s of [-1, 1]) { x.fillStyle = '#3a2420'; circle(x, cx + s * r * 1.05, cy + r * 0.2 + (u.anim > 0 ? -u.anim * 12 : 0), r * 0.45); x.fill(); }
        this.body(x, cx, cy, r, '#4a2a22');
        x.strokeStyle = enr ? '#ffe07a' : B.color2; x.lineWidth = 4;
        x.beginPath(); x.moveTo(cx - r * 0.6, cy - r * 0.4); x.lineTo(cx - r * 0.1, cy); x.lineTo(cx - r * 0.3, cy + r * 0.5); x.moveTo(cx + r * 0.5, cy - r * 0.6); x.lineTo(cx + r * 0.2, cy - r * 0.1); x.lineTo(cx + r * 0.6, cy + r * 0.4); x.stroke();
        x.drawImage(glowSprite(B.color2), cx - r * 0.5, cy - r * 0.3, r, r);
        this.eyes(x, cx, cy - r * 0.2, r * 0.7, a, '#ffe07a');
        break;
      case 'wyrm':
        for (const s of [-1, 1]) { x.fillStyle = 'rgba(106,184,232,0.7)'; x.beginPath(); x.moveTo(cx + s * r * 0.5, cy - r * 0.2); x.lineTo(cx + s * r * 2.0, cy - r * (1.2 + Math.sin(t * 4) * 0.2)); x.lineTo(cx + s * r * 1.7, cy + r * 0.3); x.lineTo(cx + s * r * 1.1, cy + r * 0.1); x.closePath(); x.fill(); }
        x.strokeStyle = B.color; x.lineWidth = r * 0.5; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx, cy + r * 0.5); x.quadraticCurveTo(cx + Math.sin(t * 3) * r, cy + r * 1.5, cx - Math.sin(t * 3) * r * 0.5, cy + r * 2.1); x.stroke();
        this.body(x, cx, cy, r, B.color);
        x.fillStyle = B.color2; for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(cx + i * r * 0.3 - 6, cy - r * 0.8); x.lineTo(cx + i * r * 0.3, cy - r * 1.3 + Math.abs(i) * 6); x.lineTo(cx + i * r * 0.3 + 6, cy - r * 0.8); x.fill(); }
        x.fillStyle = '#ffffff'; x.drawImage(glowSprite('#a8eaff'), cx + Math.cos(a) * r * 0.7 - 16, cy + Math.sin(a) * r * 0.5 - 16, 32, 32);
        this.eyes(x, cx, cy - r * 0.1, r * 0.75, a, '#e8fbff');
        break;
      case 'king':
        x.fillStyle = '#3a1a5a'; x.beginPath(); x.moveTo(cx - r * 0.9, cy - r * 0.3); x.quadraticCurveTo(cx - r * 1.4, cy + r * 1.2, cx - r * 0.9 + Math.sin(t * 3) * 6, cy + r * 1.5); x.lineTo(cx + r * 0.9 + Math.sin(t * 3) * 6, cy + r * 1.5); x.quadraticCurveTo(cx + r * 1.4, cy + r * 1.2, cx + r * 0.9, cy - r * 0.3); x.closePath(); x.fill();
        this.body(x, cx, cy, r, '#2a2440');
        x.fillStyle = '#14101e'; x.fillRect(cx - r * 0.6, cy - r * 0.25, r * 1.2, r * 0.3);
        x.fillStyle = B.color2; x.fillRect(cx - r * 0.45, cy - r * 0.18, r * 0.3, r * 0.14); x.fillRect(cx + r * 0.15, cy - r * 0.18, r * 0.3, r * 0.14);
        x.fillStyle = B.color2; x.beginPath(); x.moveTo(cx - r * 0.7, cy - r * 0.7); for (let i = 0; i <= 6; i++) x.lineTo(cx - r * 0.7 + i * r * 0.233, cy - r * (i % 2 ? 0.95 : 1.4)); x.lineTo(cx + r * 0.7, cy - r * 0.7); x.closePath(); x.fill();
        x.save(); x.translate(cx + Math.cos(a + 0.9) * r, cy + Math.sin(a + 0.9) * r); x.rotate(a + (u.anim > 0 ? (u.anim - 0.5) * 2 : 0)); x.fillStyle = '#b07bff'; x.fillRect(0, -5, r * 1.6, 10); x.fillStyle = '#e8d8ff'; x.fillRect(0, -2, r * 1.6, 4); x.restore();
        break;
    }
    if (u.flash > 0) { x.globalAlpha = 0.4; x.fillStyle = '#ffffff'; circle(x, cx, cy, r); x.fill(); }
    if (u.ai && u.ai.shielded) { x.globalAlpha = 0.6; x.strokeStyle = '#ffffff'; x.lineWidth = 5; circle(x, cx, cy, r + 10); x.stroke(); }
    x.restore();
    this.status(x, u, t);
  },

  drawSummon(x, u, t) {
    const r = u.r, cx = u.x, cy = u.y;
    if (u.stype === 'wisp') { x.drawImage(glowSprite('#bff8ff'), cx - 18, cy - 18, 36, 36); x.fillStyle = '#ffffff'; circle(x, cx, cy, 4); x.fill(); return; }
    if (u.stype === 'turret') {
      x.fillStyle = '#4a5260'; x.beginPath(); for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + Math.PI / 2; x.lineTo(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 1.2); } x.closePath(); x.fill();
      this.body(x, cx, cy - 4, r * 0.8, '#ffb02e');
      x.save(); x.translate(cx, cy - 4); x.rotate(u.ang); x.fillStyle = '#2a3038'; x.fillRect(0, -3.5, r * 1.3, 7); x.restore();
      x.fillStyle = '#ff4a4a'; circle(x, cx, cy - 6, 3); x.fill();
      return;
    }
    this.body(x, cx, cy, r, u.stype === 'champion' ? '#bfe8d0' : '#e8e4d8');
    x.fillStyle = '#1a1420'; ellipse(x, cx - r * 0.33, cy - r * 0.1, r * 0.2, r * 0.24); x.fill(); ellipse(x, cx + r * 0.33, cy - r * 0.1, r * 0.2, r * 0.24); x.fill();
    x.fillStyle = '#9affc6'; circle(x, cx - r * 0.33, cy - r * 0.08, r * 0.08); x.fill(); circle(x, cx + r * 0.33, cy - r * 0.08, r * 0.08); x.fill();
    this.mobWeapon(x, u, cx, cy, 'sword');
  },

  // ---------- areas ----------
  areaPath(x, a, scale) {
    const s = scale == null ? 1 : scale;
    x.beginPath();
    if (a.shape === 'circle') x.arc(a.x, a.y, Math.max(0.1, a.r * s), 0, TAU);
    else if (a.shape === 'line') {
      const c = Math.cos(a.ang), sn = Math.sin(a.ang), w = a.wid / 2 * (a.beam ? 1 : s), L = a.len * (a.beam ? 1 : 1);
      x.moveTo(a.x - sn * w, a.y + c * w); x.lineTo(a.x + c * L - sn * w, a.y + sn * L + c * w); x.lineTo(a.x + c * L + sn * w, a.y + sn * L - c * w); x.lineTo(a.x + sn * w, a.y - c * w); x.closePath();
    } else if (a.shape === 'cone') { x.moveTo(a.x, a.y); x.arc(a.x, a.y, Math.max(0.1, a.len * s), a.ang - a.arc / 2, a.ang + a.arc / 2); x.closePath(); }
  },

  drawArea(x, a, t) {
    if (a.hidden) return;
    const k = a.dur > 0 ? clamp(a.t / a.dur, 0, 1) : 0;
    if (a.tele && !a.fired && !a.beam || (a.beam && !a.fired)) {
      const p = a.delay ? clamp(a.t / a.delay, 0, 1) : k;
      if (a.friendly) {
        x.strokeStyle = 'rgba(255,240,170,0.7)'; x.lineWidth = 2; x.setLineDash([8, 6]); this.areaPath(x, a); x.stroke(); x.setLineDash([]);
        x.fillStyle = 'rgba(255,240,170,0.15)'; this.areaPath(x, a, p); x.fill();
        if (a.kind === 'meteor') { const h = (1 - p) * 400; x.drawImage(glowSprite('#ff7b2e'), a.x - 26 + h * 0.3, a.y - h - 26, 52, 52); }
        return;
      }
      if (a.kind === 'spawn') {
        x.save(); x.translate(a.x, a.y); x.rotate(t * 4);
        x.strokeStyle = `rgba(255,80,110,${0.4 + p * 0.5})`; x.lineWidth = 3;
        for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(0, 0, a.r * (0.5 + p * 0.6), i * 2.1, i * 2.1 + 1.3); x.stroke(); }
        x.restore();
        return;
      }
      const sm = a.small ? 0.6 : 1;
      x.fillStyle = `rgba(255,50,40,${(0.1 + p * 0.12) * sm})`;
      this.areaPath(x, a); x.fill();
      x.fillStyle = `rgba(255,60,40,${0.28 * sm})`;
      this.areaPath(x, a, p); x.fill();
      x.strokeStyle = `rgba(255,90,70,${(0.6 + p * 0.4) * sm})`; x.lineWidth = a.small ? 1.5 : 2.5;
      this.areaPath(x, a); x.stroke();
      return;
    }
    if (a.beam) {
      x.save(); x.globalCompositeOperation = 'lighter';
      x.fillStyle = 'rgba(255,80,160,0.55)'; this.areaPath(x, Object.assign({}, a, { wid: a.wid * (1 + Math.sin(t * 30) * 0.1) })); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.8)'; this.areaPath(x, Object.assign({}, a, { wid: a.wid * 0.3 })); x.fill();
      x.restore();
      return;
    }
    const fade = Math.min(1, (a.dur - a.t) * 3, a.t * 6);
    const col = a.color || '#ffffff';
    x.save();
    x.globalAlpha = clamp(fade, 0, 1);
    switch (a.kind) {
      case 'banner': {
        x.fillStyle = rgba(col, 0.12); circle(x, a.x, a.y, a.r); x.fill();
        x.strokeStyle = rgba(col, 0.6); x.lineWidth = 3; x.setLineDash([10, 8]); circle(x, a.x, a.y, a.r); x.stroke(); x.setLineDash([]);
        x.fillStyle = '#6a4a2a'; x.fillRect(a.x - 2, a.y - 70, 4, 70);
        x.fillStyle = col; x.beginPath(); x.moveTo(a.x + 2, a.y - 70); x.lineTo(a.x + 40 + Math.sin(t * 6) * 4, a.y - 62); x.lineTo(a.x + 2, a.y - 46); x.fill();
        break;
      }
      case 'bloom': case 'grove': {
        x.fillStyle = rgba('#5df0b0', 0.14); circle(x, a.x, a.y, a.r); x.fill();
        x.strokeStyle = rgba('#5df0b0', 0.6); x.lineWidth = 2; circle(x, a.x, a.y, a.r); x.stroke();
        for (let i = 0; i < 10; i++) { const aa = i / 10 * TAU + t * 0.5, d = a.r * (0.3 + hsh(i) * 0.6); x.fillStyle = i % 2 ? '#ff7ad1' : '#ffffff'; circle(x, a.x + Math.cos(aa) * d, a.y + Math.sin(aa) * d, 3.5); x.fill(); }
        break;
      }
      case 'blizzard': {
        x.fillStyle = 'rgba(200,240,255,0.16)'; circle(x, a.x, a.y, a.r); x.fill();
        x.strokeStyle = 'rgba(220,245,255,0.5)'; x.lineWidth = 2; circle(x, a.x, a.y, a.r); x.stroke();
        x.fillStyle = '#ffffff';
        for (let i = 0; i < 26; i++) { const aa = hsh(i) * TAU + t * (1 + hsh(i + 5)), d = a.r * Math.sqrt(hsh(i + 2)); circle(x, a.x + Math.cos(aa) * d, a.y + Math.sin(aa) * d, 2.2); x.fill(); }
        break;
      }
      case 'arrowrain': case 'storm':
        x.strokeStyle = rgba(col, 0.35); x.lineWidth = 2; x.setLineDash([6, 10]); circle(x, a.x, a.y, a.r); x.stroke(); x.setLineDash([]);
        break;
      case 'tornado': {
        x.translate(a.x, a.y);
        for (let i = 0; i < 5; i++) { x.strokeStyle = `rgba(200,240,255,${0.55 - i * 0.08})`; x.lineWidth = 4; x.beginPath(); x.ellipse(0, -i * 14, a.r * (0.4 + i * 0.18), a.r * (0.15 + i * 0.05), 0, t * 8 + i, t * 8 + i + 4.4); x.stroke(); }
        break;
      }
      case 'toxic': case 'spore': {
        const c2 = a.kind === 'toxic' ? '#8fe03a' : '#d65a8a';
        for (let i = 0; i < 7; i++) { const aa = i / 7 * TAU + t * 0.4, d = a.r * 0.5; x.fillStyle = rgba(c2, 0.18); circle(x, a.x + Math.cos(aa) * d, a.y + Math.sin(aa) * d, a.r * (0.5 + Math.sin(t * 2 + i) * 0.08)); x.fill(); }
        if (a.kind === 'spore') { x.strokeStyle = 'rgba(255,90,70,0.5)'; x.lineWidth = 2; circle(x, a.x, a.y, a.r); x.stroke(); }
        break;
      }
      case 'blackhole': case 'collapse': case 'gravity': {
        x.translate(a.x, a.y);
        const g = x.createRadialGradient(0, 0, 4, 0, 0, a.r);
        g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.35, 'rgba(40,10,70,0.6)'); g.addColorStop(1, 'rgba(106,60,255,0.05)');
        x.fillStyle = g; circle(x, 0, 0, a.r); x.fill();
        x.strokeStyle = a.kind === 'gravity' ? 'rgba(255,90,90,0.6)' : 'rgba(176,123,255,0.7)'; x.lineWidth = 2.5;
        for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(0, 0, a.r * (0.3 + i * 0.18), -t * 5 + i, -t * 5 + i + 2); x.stroke(); }
        break;
      }
      case 'lava': {
        const g = x.createRadialGradient(a.x, a.y, 2, a.x, a.y, a.r);
        g.addColorStop(0, 'rgba(255,220,120,0.8)'); g.addColorStop(0.5, 'rgba(255,100,30,0.6)'); g.addColorStop(1, 'rgba(160,30,10,0.2)');
        x.fillStyle = g; circle(x, a.x, a.y, a.r); x.fill();
        break;
      }
      default:
        x.fillStyle = rgba(col, 0.12); this.areaPath(x, a); x.fill();
    }
    x.restore();
  },

  // ---------- projectiles & pickups ----------
  drawProj(x, p, t) {
    const a = Math.atan2(p.vy || 0, p.vx || 1), c = p.color || '#ffffff';
    if (p.lob) {
      const hy = p.y - (p.h || 0);
      x.fillStyle = 'rgba(0,0,0,0.25)'; ellipse(x, p.x, p.y, p.r, p.r * 0.4); x.fill();
      if (p.kind === 'boulder') { this.body(x, p.x, hy, 16, '#8d7a62'); }
      else if (p.kind === 'snowball') { this.body(x, p.x, hy, 14, '#ffffff'); }
      else { x.drawImage(glowSprite(c), p.x - 16, hy - 16, 32, 32); }
      return;
    }
    switch (p.kind) {
      case 'arrow': case 'bone':
        x.save(); x.translate(p.x, p.y); x.rotate(a);
        x.strokeStyle = p.kind === 'bone' ? '#f0ead8' : '#e8d5a0'; x.lineWidth = 3; x.beginPath(); x.moveTo(-14, 0); x.lineTo(8, 0); x.stroke();
        x.fillStyle = p.team === 1 || p.kind === 'bone' ? '#ff8a7a' : c; x.beginPath(); x.moveTo(12, 0); x.lineTo(5, -4); x.lineTo(5, 4); x.fill();
        x.restore();
        break;
      case 'ice':
        x.save(); x.translate(p.x, p.y); x.rotate(a);
        x.drawImage(glowSprite('#a8eaff'), -14, -14, 28, 28);
        x.fillStyle = '#e8fbff'; x.beginPath(); x.moveTo(10, 0); x.lineTo(0, -4); x.lineTo(-8, 0); x.lineTo(0, 4); x.closePath(); x.fill();
        x.restore();
        break;
      case 'leaf':
        x.save(); x.translate(p.x, p.y); x.rotate(t * 10);
        x.fillStyle = '#7be06a'; ellipse(x, 0, 0, 8, 4); x.fill(); x.restore();
        break;
      case 'sound':
        x.strokeStyle = rgba('#ff7ad1', 0.8); x.lineWidth = 3;
        for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(p.x - Math.cos(a) * i * 7, p.y - Math.sin(a) * i * 7, p.r * (1 - i * 0.2), a - 0.9, a + 0.9); x.stroke(); }
        break;
      case 'rocket':
        x.save(); x.translate(p.x, p.y); x.rotate(a);
        x.drawImage(glowSprite('#ff7b2e'), -26, -10, 20, 20);
        x.fillStyle = '#c8ccd8'; x.fillRect(-8, -3.5, 16, 7); x.fillStyle = '#ff4a4a'; x.beginPath(); x.moveTo(8, -3.5); x.lineTo(13, 0); x.lineTo(8, 3.5); x.fill();
        x.restore();
        break;
      case 'crescent':
        x.save(); x.translate(p.x, p.y); x.rotate(a);
        x.drawImage(glowSprite(c), -p.r * 1.6, -p.r * 1.6, p.r * 3.2, p.r * 3.2);
        x.fillStyle = '#e8d8ff'; x.beginPath(); x.arc(0, 0, p.r, -1.3, 1.3); x.arc(-p.r * 0.5, 0, p.r * 0.85, 1.1, -1.1, true); x.fill();
        x.restore();
        break;
      default: {
        const hostile = p.team === 1;
        const s = p.r * (hostile ? 2.6 : 2.4);
        x.drawImage(glowSprite(c), p.x - s, p.y - s, s * 2, s * 2);
        x.fillStyle = hostile ? '#ffffff' : c;
        circle(x, p.x, p.y, p.r * (hostile ? 0.55 : 0.6)); x.fill();
        if (hostile) { x.strokeStyle = c; x.lineWidth = 2; circle(x, p.x, p.y, p.r * 0.85); x.stroke(); }
      }
    }
  },

  drawPick(x, p, t) {
    const bob = Math.sin(t * 5 + p.id) * 3;
    if (p.kind === 'gold') {
      const w = Math.abs(Math.cos(t * 6 + p.id)) * 6 + 1.5;
      x.fillStyle = '#b87a00'; ellipse(x, p.x, p.y + bob + 1, w, 7); x.fill();
      x.fillStyle = '#ffd23f'; ellipse(x, p.x, p.y + bob, w * 0.8, 6); x.fill();
      return;
    }
    const col = p.kind === 'heal' ? '#5df0b0' : p.kind === 'power' ? '#ff5a4a' : '#ffd23f';
    x.drawImage(glowSprite(col), p.x - 22, p.y - 22 + bob, 44, 44);
    x.fillStyle = '#ffffff';
    if (p.kind === 'heal') { x.fillRect(p.x - 2.5, p.y - 8 + bob, 5, 16); x.fillRect(p.x - 8, p.y - 2.5 + bob, 16, 5); }
    else if (p.kind === 'power') { x.beginPath(); x.moveTo(p.x, p.y - 9 + bob); x.lineTo(p.x + 7, p.y + bob); x.lineTo(p.x + 3, p.y + bob); x.lineTo(p.x + 3, p.y + 8 + bob); x.lineTo(p.x - 3, p.y + 8 + bob); x.lineTo(p.x - 3, p.y + bob); x.lineTo(p.x - 7, p.y + bob); x.closePath(); x.fill(); }
    else this.star(x, p.x, p.y + bob, 9, 4, '#ffffff');
  },

  star(x, cx, cy, R, r, col) {
    x.fillStyle = col; x.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.closePath(); x.fill();
  },

  icon(x, kind, cx, cy, s, col) {
    x.save();
    x.lineWidth = 2; x.strokeStyle = 'rgba(10,8,20,0.8)';
    switch (kind) {
      case 'star': this.star(x, cx, cy, s, s * 0.45, col || '#ffd23f'); x.stroke(); break;
      case 'coin': for (let i = 0; i < 3; i++) { x.fillStyle = '#ffd23f'; ellipse(x, cx, cy + s * 0.4 - i * s * 0.35, s * 0.75, s * 0.32); x.fill(); x.stroke(); } break;
      case 'chest': x.fillStyle = '#a86a2a'; x.fillRect(cx - s, cy - s * 0.5, s * 2, s * 1.2); x.strokeRect(cx - s, cy - s * 0.5, s * 2, s * 1.2); x.fillStyle = '#c46bff'; x.fillRect(cx - s, cy - s * 0.15, s * 2, s * 0.25); x.fillStyle = '#ffd23f'; x.fillRect(cx - s * 0.2, cy - s * 0.25, s * 0.4, s * 0.45); break;
      case 'heart': x.fillStyle = '#5df0b0'; x.beginPath(); x.moveTo(cx, cy + s * 0.8); x.bezierCurveTo(cx - s * 1.4, cy - s * 0.2, cx - s * 0.6, cy - s * 1.2, cx, cy - s * 0.4); x.bezierCurveTo(cx + s * 0.6, cy - s * 1.2, cx + s * 1.4, cy - s * 0.2, cx, cy + s * 0.8); x.fill(); x.stroke(); break;
      case 'skull': x.fillStyle = '#ff5a4a'; circle(x, cx, cy - s * 0.15, s * 0.8); x.fill(); x.stroke(); x.fillRect(cx - s * 0.45, cy + s * 0.4, s * 0.9, s * 0.4); x.fillStyle = '#1a0f2e'; circle(x, cx - s * 0.3, cy - s * 0.2, s * 0.2); x.fill(); circle(x, cx + s * 0.3, cy - s * 0.2, s * 0.2); x.fill(); break;
      case 'crown': x.fillStyle = '#ffd23f'; x.beginPath(); x.moveTo(cx - s, cy + s * 0.6); x.lineTo(cx - s, cy - s * 0.4); x.lineTo(cx - s * 0.5, cy + s * 0.1); x.lineTo(cx, cy - s * 0.7); x.lineTo(cx + s * 0.5, cy + s * 0.1); x.lineTo(cx + s, cy - s * 0.4); x.lineTo(cx + s, cy + s * 0.6); x.closePath(); x.fill(); x.stroke(); break;
      case 'dash': x.strokeStyle = col || '#ffffff'; x.lineWidth = s * 0.3; x.lineCap = 'round'; for (const o of [-0.4, 0.4]) { x.beginPath(); x.moveTo(cx - s * 0.5 + o * s, cy - s * 0.6); x.lineTo(cx + o * s + s * 0.1, cy); x.lineTo(cx - s * 0.5 + o * s, cy + s * 0.6); x.stroke(); } break;
    }
    x.restore();
  },

  drawPortal(x, p, t) {
    const R = REWARDS[p.reward] || { color: '#ff4f6d', name: 'Boss' };
    const col = p.reward === 'boss' ? '#ff4f6d' : R.color;
    x.save();
    x.drawImage(glowSprite(col), p.x - 70, p.y - 50, 140, 100);
    x.translate(p.x, p.y);
    x.strokeStyle = col; x.lineWidth = 5;
    x.beginPath(); x.ellipse(0, 0, 46, 22, 0, 0, TAU); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 2;
    for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse(0, 0, 40 - i * 10, 18 - i * 4, 0, t * 3 + i, t * 3 + i + 3.5); x.stroke(); }
    if (p.prog > 0) { x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.beginPath(); x.ellipse(0, 0, 54, 28, 0, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p.prog, 0, 1)); x.stroke(); }
    x.restore();
    const by = p.y - 52 + Math.sin(t * 3 + p.x) * 4;
    x.fillStyle = 'rgba(10,8,20,0.7)'; circle(x, p.x, by, 24); x.fill();
    x.strokeStyle = col; x.lineWidth = 3; circle(x, p.x, by, 24); x.stroke();
    this.icon(x, REWARD_ICON[p.reward] || 'skull', p.x, by, 13);
    outlineText(x, p.reward === 'boss' ? tr('BOSS') : tr(R.name), p.x, p.y + 40, 16 * this.textK(), col);
  },

  // ---------- world ----------
  drawWorld(view, t, locals) {
    const x = this.ctx, room = view.room;
    const c = this.cam;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.fillStyle = room ? room.pal.sky : '#07090d';
    x.fillRect(0, 0, this.W, this.H);
    if (!room) return;
    if (this.floorRoom !== room) this.buildFloor(room);
    const z = c.z * this.dpr;
    x.setTransform(z, 0, 0, z, this.dpr * (this.W / 2 - c.x * c.z + FX.shakeX), this.dpr * (this.H / 2 - c.y * c.z + FX.shakeY));
    x.drawImage(this.floor, 0, 0, room.w, room.h);
    for (const a of view.areas) if (!a.tele || a.friendly || a.kind === 'spawn') this.drawArea(x, a, t);
    for (const p of view.picks) this.drawPick(x, p, t);
    if (view.mode && view.mode.portals) for (const p of view.mode.portals) this.drawPortal(x, p, t);
    for (const a of view.areas) if (a.tele && !a.friendly && a.kind !== 'spawn') this.drawArea(x, a, t);
    // depth-sorted things
    const list = [];
    for (const o of room.obst) list.push({ y: o.y, o });
    for (const u of view.units) { if (u.kind === 'summon' && u.stype === 'wisp') continue; list.push({ y: u.y, u }); this.shadow(x, u); }
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.o) { this.drawObst(x, it.o, room.pal); continue; }
      const u = it.u;
      if (u.kind === 'hero') this.drawHero(x, u, t, view);
      else if (u.kind === 'mob') this.drawMob(x, u, t);
      else if (u.kind === 'boss') this.drawBoss(x, u, t);
      else this.drawSummon(x, u, t);
    }
    for (const u of view.units) if (u.stype === 'wisp') this.drawSummon(x, u, t);
    // spirit blades
    for (const u of view.units) if (u.kind === 'hero' && u.s && u.s.blades && alive(u)) for (let i = 0; i < u.s.blades; i++) {
      const a = view.t * 3.2 + (i / u.s.blades) * TAU;
      x.save(); x.translate(u.x + Math.cos(a) * 62, u.y + Math.sin(a) * 62); x.rotate(a + Math.PI / 2);
      x.drawImage(glowSprite('#bff8ff'), -14, -14, 28, 28); x.fillStyle = '#e8fbff'; x.fillRect(-2, -10, 4, 20); x.restore();
    }
    for (const p of view.projs) this.drawProj(x, p, t);
    FX.drawWorld(x);
    // overhead bars and names
    for (const u of view.units) {
      if (u.kind === 'hero' && !u.downed && !u.ko) this.heroTag(x, u, locals);
      else if (u.kind === 'mob' && (u.hp < u.maxHp || u.elite)) {
        const w = Math.max(26, u.r * 2), y = u.y - u.r - 12;
        x.fillStyle = 'rgba(10,8,20,0.75)'; x.fillRect(u.x - w / 2 - 1, y - 1, w + 2, 6);
        x.fillStyle = u.elite ? '#ff9a4a' : '#ff4f5a'; x.fillRect(u.x - w / 2, y, w * clamp(u.hp / u.maxHp, 0, 1), 4);
        if (u.shield > 0 && u.maxShield) { x.fillStyle = '#c8f0ff'; x.fillRect(u.x - w / 2, y - 3, w * clamp(u.shield / u.maxShield, 0, 1), 2); }
        if (u.elite) { const ea = ELITE_AFFIX.find((e) => e.key === u.elite); outlineText(x, ea ? tr(ea.name) : '', u.x, y - 10, 12 * this.textK(), ea ? ea.color : '#fff'); }
      } else if (u.kind === 'summon' && u.stype !== 'wisp' && u.hp < u.maxHp) {
        const w = 22, y = u.y - u.r - 9;
        x.fillStyle = 'rgba(10,8,20,0.75)'; x.fillRect(u.x - w / 2 - 1, y - 1, w + 2, 5);
        x.fillStyle = '#7be06a'; x.fillRect(u.x - w / 2, y, w * clamp(u.hp / u.maxHp, 0, 1), 3);
      }
    }
  },

  heroTag(x, u, locals) {
    const w = 44, y = u.y - u.r - 18 - (u.dash && u.dash.air ? 26 : 0);
    const slot = u.pl ? u.pl.slot : 0;
    const isBot = u.pl && u.pl.kind === 'bot';
    const col = isBot ? '#a0a8c0' : PLAYER_COLORS[slot % 4];
    x.fillStyle = 'rgba(10,8,20,0.8)'; x.fillRect(u.x - w / 2 - 1.5, y - 1.5, w + 3, 8);
    const team0 = !view_arenaFoe(u, locals);
    x.fillStyle = team0 ? '#5be36a' : '#ff4f5a';
    x.fillRect(u.x - w / 2, y, w * clamp(u.hp / u.maxHp, 0, 1), 5);
    if (u.shield > 0) { x.fillStyle = 'rgba(160,230,255,0.9)'; x.fillRect(u.x - w / 2, y, w * clamp(u.shield / u.maxHp, 0, 1), 2); }
    x.fillStyle = u.ult >= 100 ? '#ffd23f' : 'rgba(255,210,63,0.55)';
    x.fillRect(u.x - w / 2, y + 5, w * clamp(u.ult / 100, 0, 1), 1.5);
    const tag = isBot ? tr('BOT') : (u.pl && u.pl.name ? trx(u.pl.name) : 'P' + (slot + 1));
    outlineText(x, tag, u.x, y - 9, 13 * this.textK(), col);
  },

  // ---------- HUD ----------
  drawHud(view, t, locals, opts) {
    const x = this.ctx, W = this.W, H = this.H, s = this.ui, sf = this.safe;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (view.timeStop) {
      x.save(); x.globalCompositeOperation = 'saturation'; x.fillStyle = '#808080'; x.globalAlpha = 0.85; x.fillRect(0, 0, W, H); x.restore();
      x.fillStyle = 'rgba(40,200,190,0.10)'; x.fillRect(0, 0, W, H);
      outlineText(x, tr('TIME STOP') + ' ' + Math.ceil(view.timeStop.t), W / 2, 92 * s, 18 * s, '#53e0d0');
    }
    if (FX.flash) { x.globalAlpha = FX.flash.a * (1 - FX.flash.t / FX.flash.life); x.fillStyle = FX.flash.color; x.fillRect(0, 0, W, H); x.globalAlpha = 1; }
    const me = locals[0];
    if (me && me.downed && !me.ko && locals.length === 1) {
      const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, 'rgba(160,0,0,0.5)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      outlineText(x, tr(me.deadOut ? 'You are out until the next room' : me.autoRev ? 'Rising again...' : 'You are down! Allies can revive you'), W / 2, H * 0.32, 17 * s, '#ffb0b0');
    }
    // party frames
    const hs = view.units.filter((u) => u.kind === 'hero');
    hs.sort((a, b) => (locals.includes(b) ? 1 : 0) - (locals.includes(a) ? 1 : 0) || a.pl.slot - b.pl.slot);
    let fy = 10 * s + sf.t, fx = 10 * s + sf.l;
    const fw = 140 * s, fh = 31 * s;
    const maxFrames = view.arena ? 0 : 4;
    for (let i = 0; i < Math.min(hs.length, maxFrames); i++) {
      const u = hs[i], loc = locals.includes(u);
      x.fillStyle = loc ? 'rgba(20,16,40,0.42)' : 'rgba(10,8,20,0.28)';
      roundRect(x, fx, fy, fw, fh, 8 * s); x.fill();
      if (loc) { x.strokeStyle = PLAYER_COLORS[u.pl.slot % 4]; x.lineWidth = 2; x.stroke(); }
      const pr = 11 * s;
      this.body(x, fx + pr + 4 * s, fy + fh / 2, pr, u.hero.color);
      outlineText(x, tr(u.hero.name)[0], fx + pr + 4 * s, fy + fh / 2 + 1, 12 * s, '#fff');
      const bx = fx + pr * 2 + 9 * s, bw = fw - (bx - fx) - 7 * s;
      const nm = u.pl.kind === 'bot' ? tr(u.hero.name) + ' · ' + tr('BOT') : trx(u.pl.name || 'P' + (u.pl.slot + 1)) + ' · ' + tr(u.hero.name);
      x.font = `800 ${11 * s}px system-ui,sans-serif`; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff';
      x.lineWidth = 3 * s * 0.6; x.strokeStyle = 'rgba(10,8,20,0.85)';
      const nmt = nm.length > 16 ? nm.slice(0, 15) + '…' : nm;
      x.strokeText(nmt, bx, fy + 8 * s); x.fillText(nmt, bx, fy + 8 * s);
      x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(bx, fy + 14 * s, bw, 6 * s);
      x.fillStyle = u.downed ? '#ff4f5a' : '#5be36a'; x.fillRect(bx, fy + 14 * s, bw * clamp(u.hp / u.maxHp, 0, 1), 6 * s);
      if (u.shield > 0) { x.fillStyle = 'rgba(160,230,255,0.9)'; x.fillRect(bx, fy + 14 * s, bw * clamp(u.shield / u.maxHp, 0, 1), 2.5 * s); }
      x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(bx, fy + 22 * s, bw, 3 * s);
      x.fillStyle = u.ult >= 100 ? `hsl(${45 + Math.sin(t * 8) * 10},100%,60%)` : '#d8a020'; x.fillRect(bx, fy + 22 * s, bw * clamp(u.ult / 100, 0, 1), 3 * s);
      if (u.downed) outlineText(x, tr(u.deadOut ? 'OUT' : 'DOWN'), fx + fw - 24 * s, fy + 9 * s, 11 * s, '#ff5a5a');
      if (loc && opts.devs && opts.devs[u.id] && opts.devs[u.id] !== 'touch') {
        const cx = fx + fw + 14 * s, cy = fy + fh / 2;
        x.fillStyle = 'rgba(10,8,20,0.7)'; circle(x, cx, cy, 11 * s); x.fill();
        if (u.cd.skill > 0) { x.fillStyle = 'rgba(255,255,255,0.25)'; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, 11 * s, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - u.cd.skill / (u.cd.skillMax || 1))); x.fill(); }
        else { x.strokeStyle = u.hero.color; x.lineWidth = 2.5; circle(x, cx, cy, 11 * s); x.stroke(); }
        outlineText(x, opts.devs[u.id] === 'kb2' ? 'U' : opts.devs[u.id] === 'kb3' ? '1' : opts.devs[u.id].startsWith('pad') ? 'X' : 'Q', cx, cy + 1, 10 * s, '#fff');
      }
      fy += fh + 5 * s;
    }
    // top centre: room label / boss bar / arena score
    const hud = view.mode && view.mode.hud ? view.mode.hud() : { label: '' };
    if (view.arena) this.arenaHud(x, view, s, t);
    else {
      outlineText(x, trx(hud.label || ''), W / 2, 16 * s + sf.t, 14 * s, '#ffffff');
      const m = view.mode;
      if (m && m.total && m.roomIdx >= 0) {
        const n = m.total, pw = 13 * s;
        for (let i = 0; i < n; i++) {
          const px = W / 2 + (i - (n - 1) / 2) * pw * 1.4, py = 32 * s + sf.t;
          x.fillStyle = i < m.roomIdx ? '#ffd23f' : i === m.roomIdx ? '#ffffff' : 'rgba(255,255,255,0.25)';
          if (i === n - 1) this.icon(x, 'crown', px, py, 5 * s, i <= m.roomIdx ? '#ffd23f' : 'rgba(255,255,255,0.3)');
          else { circle(x, px, py, 3.5 * s); x.fill(); }
        }
      }
      const boss = hud.boss || view.boss;
      if (boss && !boss.dead) {
        const bw = Math.min(W * (opts.touch ? 0.36 : 0.5), 420 * s), bx = W / 2 - bw / 2, by = H - sf.b - 30 * s;
        x.fillStyle = 'rgba(10,8,20,0.8)'; roundRect(x, bx - 3, by - 3, bw + 6, 16 * s + 6, 6); x.fill();
        x.fillStyle = '#5a1020'; x.fillRect(bx, by, bw, 16 * s);
        const g = x.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#ff4f6d'); g.addColorStop(1, '#ff9a4a');
        x.fillStyle = g; x.fillRect(bx, by, bw * clamp(boss.hp / boss.maxHp, 0, 1), 16 * s);
        x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = 1; x.beginPath(); x.moveTo(bx + bw / 2, by); x.lineTo(bx + bw / 2, by + 16 * s); x.stroke();
        outlineText(x, tr(boss.boss.name) + '  ' + Math.ceil(boss.hp / boss.maxHp * 100) + '%', W / 2, by + 8 * s, 12 * s, '#ffffff');
      }
    }
    // gold
    if (!view.arena) {
    const gx = W - sf.r - (opts.touch ? 74 : 20) * s, gy = 18 * s + sf.t;
    this.icon(x, 'coin', gx - 30 * s, gy, 7 * s);
    x.font = `900 ${14 * s}px system-ui,sans-serif`; x.textAlign = 'right'; x.textBaseline = 'middle'; x.fillStyle = '#ffd23f';
    x.fillText(fmtNum(view.gold || 0), gx + 8 * s, gy);
    if (!opts.touch) { x.font = `700 ${9 * s}px system-ui,sans-serif`; x.fillStyle = 'rgba(255,255,255,0.45)'; x.fillText(tr('Esc: menu'), gx + 8 * s, gy + 16 * s); }
    }
    // combo
    const n = view.combo ? view.combo.n : 0;
    if (n !== this.lastCombo) { if (n > this.lastCombo) this.comboPulse = 0.25; this.lastCombo = n; }
    this.comboPulse = Math.max(0, this.comboPulse - 1 / 60);
    if (n >= 8 && !view.arena) {
      const cx = W - sf.r - 70 * s, cy = H * 0.36, sc = 1 + this.comboPulse * 1.2;
      const col = n >= 200 ? '#ff4f6d' : n >= 100 ? '#ff9a4a' : n >= 50 ? '#ffd23f' : '#ffffff';
      outlineText(x, n + '', cx, cy, 28 * s * sc, col);
      outlineText(x, tr('COMBO'), cx, cy + 22 * s, 11 * s, col);
    }
    // ult banner
    if (FX.ultCast) {
      const u = FX.ultCast, k = u.t / u.life;
      const slide = k < 0.15 ? (1 - k / 0.15) * W * 0.4 : 0;
      x.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      x.fillStyle = rgba(u.hero.color, 0.55);
      x.save(); x.translate(W / 2 + slide, H * 0.24); x.transform(1, 0, -0.25, 1, 0, 0); x.fillRect(-170 * s, -20 * s, 340 * s, 40 * s); x.restore();
      outlineText(x, (Lang.ko ? tr(u.name) : u.name.toUpperCase()) + '!', W / 2 + slide, H * 0.24, 22 * s, '#ffffff');
      x.globalAlpha = 1;
    }
    // banners
    for (const b of FX.banners) {
      const k = b.t / b.life;
      const a = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
      x.globalAlpha = a;
      const sc = k < 0.1 ? 1.4 - k * 4 : 1;
      outlineText(x, trx(b.title), W / 2, H * 0.17, 30 * s * sc, b.color);
      if (b.sub) outlineText(x, trx(b.sub), W / 2, H * 0.17 + 28 * s, 15 * s, '#ffffff');
      x.globalAlpha = 1;
    }
    for (const tx of FX.texts) {
      if (!tx.screen) continue;
      const k = tx.t / tx.life;
      x.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      outlineText(x, trx(tx.s), W / 2, H * 0.3 - k * 20, tx.size * s, tx.color);
      x.globalAlpha = 1;
    }
    // off-screen pointers to allies and portals
    const pointers = [];
    for (const u of hs) if (!locals.includes(u) && !u.ko && (!view.arena || !view_arenaFoe(u, locals))) pointers.push({ x: u.x, y: u.y, col: u.downed ? '#ff5a5a' : u.hero.color });
    if (view.mode && view.mode.portals) for (const p of view.mode.portals) pointers.push({ x: p.x, y: p.y, col: '#ffd23f' });
    for (const p of pointers) {
      const sp = this.toScreen(p.x, p.y);
      if (sp.x > 0 && sp.x < W && sp.y > 0 && sp.y < H) continue;
      const a = Math.atan2(sp.y - H / 2, sp.x - W / 2);
      const m = 24 * s;
      const px = clamp(sp.x, m, W - m), py = clamp(sp.y, m + 40 * s, H - m);
      x.save(); x.translate(px, py); x.rotate(a);
      x.fillStyle = p.col; x.beginPath(); x.moveTo(10 * s, 0); x.lineTo(-6 * s, -7 * s); x.lineTo(-6 * s, 7 * s); x.closePath(); x.fill();
      x.restore();
    }
    if (opts.touch && me) this.touchControls(x, me, t, s);
  },

  arenaHud(x, view, s, t) {
    const m = view.mode, W = this.W, sf = this.safe;
    const tl = Math.max(0, Math.ceil(m.timeLeft || 0));
    outlineText(x, fmtTime(tl), W / 2, 16 * s + sf.t, 14 * s, tl <= 10 ? '#ff4f6d' : '#ffffff');
    const sc = m.score || {};
    if (!m.ffa) {
      outlineText(x, String(sc[0] || 0), W / 2 - 46 * s, 34 * s + sf.t, 24 * s, '#4fb3ff');
      outlineText(x, String(sc[1] || 0), W / 2 + 46 * s, 34 * s + sf.t, 24 * s, '#ff5d6d');
      outlineText(x, tr('first to {n}', { n: m.target || 10 }), W / 2, 38 * s + sf.t, 10 * s, '#c8c0e8');
    } else {
      const hs = view.units.filter((u) => u.kind === 'hero').sort((a, b) => (sc[b.team] || 0) - (sc[a.team] || 0)).slice(0, 4);
      hs.forEach((u, i) => {
        const name = u.pl && u.pl.kind !== 'bot' ? trx(u.pl.name || 'P' + (u.pl.slot + 1)) : tr(u.hero.name);
        x.font = `800 ${11 * s}px system-ui,sans-serif`; x.textAlign = 'left'; x.fillStyle = u.hero.color;
        x.fillText((i + 1) + '. ' + name + '  ' + (sc[u.team] || 0), 12 * s + sf.l, 18 * s + i * 14 * s + sf.t);
      });
    }
    let fy = 50 * s + sf.t;
    for (const f of FX.feed) {
      x.globalAlpha = f.t > 4 ? 5 - f.t : 1;
      x.font = `800 ${10.5 * s}px system-ui,sans-serif`; x.textAlign = 'right'; x.fillStyle = '#ffffff';
      x.fillText((f.k ? trx(f.kn || tr(f.k.name)) : tr('The arena')) + '  ⚔  ' + (f.v ? trx(f.vn || tr(f.v.name)) : ''), W - 14 * s - sf.r, fy);
      x.globalAlpha = 1;
      fy += 14 * s;
    }
  },

  touchControls(x, me, t, s) {
    const L = Input.layout;
    if (!L) return;
    // joystick
    const st = Input.stick;
    const bx = st ? st.x0 : 110 * L.s + this.safe.l, by = st ? st.y0 : this.H - 110 * L.s - this.safe.b;
    const A = Settings.btnAlpha || 0.35;
    x.globalAlpha = st ? 0.3 + A * 0.5 : 0.12 + A * 0.3;
    x.fillStyle = 'rgba(10,8,20,0.5)'; circle(x, bx, by, L.stickR); x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 2; x.stroke();
    let kx = bx, ky = by;
    if (st) { const d = dist(st.x0, st.y0, st.x, st.y), a = angTo(st.x0, st.y0, st.x, st.y), m = Math.min(d, L.stickR); kx = bx + Math.cos(a) * m; ky = by + Math.sin(a) * m; }
    x.fillStyle = 'rgba(255,255,255,0.75)'; circle(x, kx, ky, L.stickR * 0.42); x.fill();
    x.globalAlpha = 1;
    const btn = (b, label, col, cd, cdMax, ready, aim) => {
      const held = !!aim;
      x.fillStyle = `rgba(10,8,20,${0.2 + A * 0.4})`; circle(x, b.x, b.y, b.r); x.fill();
      if (cd > 0) { x.fillStyle = rgba(col, A * 0.7); x.beginPath(); x.moveTo(b.x, b.y); x.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd / (cdMax || 1))); x.closePath(); x.fill(); }
      else { x.fillStyle = rgba(col, Math.min(0.95, (held ? 0.35 : 0.1) + A + (ready ? Math.sin(t * 8) * 0.08 : 0))); circle(x, b.x, b.y, b.r * 0.88); x.fill(); }
      x.strokeStyle = ready ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'; x.lineWidth = ready ? 3 : 2; circle(x, b.x, b.y, b.r); x.stroke();
      x.globalAlpha = 0.65 + A * 0.35;
      if (label === 'dash') this.icon(x, 'dash', b.x, b.y, b.r * 0.5, '#ffffff');
      else outlineText(x, label, b.x, b.y, b.r * (label.length > 4 ? 0.3 : label.length > 2 ? 0.38 : 0.48), '#ffffff');
      if (cd > 0) outlineText(x, cd.toFixed(cd < 1 ? 1 : 0), b.x, b.y + b.r * 0.55, b.r * 0.34, '#ffffff');
      x.globalAlpha = 1;
      if (aim && (Math.abs(aim.dx) > 20 || Math.abs(aim.dy) > 20)) {
        const a = Math.atan2(aim.dy, aim.dx);
        x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 3; x.beginPath(); x.moveTo(b.x, b.y); x.lineTo(b.x + Math.cos(a) * b.r * 1.8, b.y + Math.sin(a) * b.r * 1.8); x.stroke();
        const sp = this.toScreen(me.x, me.y);
        x.strokeStyle = rgba(col, 0.8); x.setLineDash([8, 6]); x.beginPath(); x.moveTo(sp.x, sp.y); x.lineTo(sp.x + Math.cos(a) * 160 * this.cam.z, sp.y + Math.sin(a) * 160 * this.cam.z); x.stroke(); x.setLineDash([]);
      }
    };
    const h = me.hero;
    const sk = tr(h.skill.name).split(' ')[0];
    btn(L.skill, Lang.ko ? sk.slice(0, 4) : sk.toUpperCase().slice(0, 6), h.color, me.cd.skill, me.cd.skillMax, me.cd.skill <= 0, Input.btn.skill);
    btn(L.ult, me.ult >= 100 ? tr('ULT') : Math.floor(me.ult) + '%', '#ffd23f', 0, 1, me.ult >= 100, Input.btn.ult);
    btn(L.dash, 'dash', '#9be7ff', me.cd.dash, DASH_CD, me.cd.dash <= 0, null);
    const p = L.pause;
    x.fillStyle = `rgba(10,8,20,${0.2 + A * 0.4})`; circle(x, p.x, p.y, p.r); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(p.x - p.r * 0.35, p.y - p.r * 0.4, p.r * 0.25, p.r * 0.8); x.fillRect(p.x + p.r * 0.1, p.y - p.r * 0.4, p.r * 0.25, p.r * 0.8);
  },
};

// In the arena, is this hero an enemy of the (first) local player?
function view_arenaFoe(u, locals) {
  if (!locals.length) return false;
  return u.team !== locals[0].team;
}
