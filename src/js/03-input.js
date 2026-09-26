// ---------- Input: touch (virtual joystick + buttons), keyboard, gamepad ----------
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyK: 'jump', KeyZ: 'jump',
  KeyJ: 'attack', KeyX: 'attack',
  KeyL: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyC: 'dash',
  KeyI: 'skill1', KeyV: 'skill1', KeyU: 'skill1',
  KeyO: 'skill2', KeyB: 'skill2',
  KeyQ: 'potion', KeyH: 'potion',
  Escape: 'pause', KeyP: 'pause',
};
const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'skill1', 'skill2', 'potion', 'pause'];

const Input = {
  key: {}, touch: {}, pad: {}, held: {}, prev: {}, pressed: {}, latch: {},
  active: false, touchMode: false, detectedTouch: false, canvas: null,
  view: { W: 640, H: 360 },
  stick: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
  stickHome: { x: 90, y: 280 },
  buttons: [], btnPtr: new Map(),
  size: 1, alpha: 0.5, safeL: 0, safeR: 0,

  init(canvas) {
    this.canvas = canvas;
    try { this.detectedTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; } catch (e) { this.detectedTouch = false; }
    this.touchMode = this.detectedTouch;
    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (a) {
        if (!e.repeat) { this.key[a] = true; this.latch[a] = true; }
        if (this.active) e.preventDefault();
      }
      Sound.init();
    });
    addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.key[a] = false;
    });
    addEventListener('blur', () => this.reset());
    const opt = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this.down(e), opt);
    canvas.addEventListener('pointermove', (e) => this.move(e), opt);
    canvas.addEventListener('pointerup', (e) => this.up(e), opt);
    canvas.addEventListener('pointercancel', (e) => this.up(e), opt);
    canvas.addEventListener('lostpointercapture', (e) => this.up(e), opt);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), opt);
  },

  reset() {
    this.key = {}; this.touch = {}; this.pad = {}; this.latch = {};
    this.stick.id = null;
    this.btnPtr.clear();
  },

  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * this.view.W, y: ((e.clientY - r.top) / r.height) * this.view.H };
  },

  down(e) {
    if (e.pointerType === 'touch' && !this.detectedTouch) {
      this.detectedTouch = true;
      if (!SAVE || !SAVE.settings.touch || SAVE.settings.touch === 'auto') this.touchMode = true;
    }
    Sound.init();
    const p = this.pos(e);
    if (!this.active) {
      if (Game.scene && Game.scene.onPointer) Game.scene.onPointer('down', p, e);
      return;
    }
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    let best = null, bd = 1e9;
    for (const b of this.buttons) {
      if (b.hidden) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < b.r + 12 * this.size && d < bd) { best = b; bd = d; }
    }
    if (best) {
      this.btnPtr.set(e.pointerId, best.name);
      this.touch[best.name] = true;
      this.latch[best.name] = true;
      return;
    }
    if (p.x < this.view.W * 0.5 && this.stick.id === null) {
      const s = this.stick;
      s.id = e.pointerId;
      s.ox = p.x; s.oy = p.y; s.x = p.x; s.y = p.y;
      this.updStick();
    }
  },

  move(e) {
    const p = this.pos(e);
    if (!this.active) {
      if (Game.scene && Game.scene.onPointer) Game.scene.onPointer('move', p, e);
      return;
    }
    e.preventDefault();
    const s = this.stick;
    if (e.pointerId === s.id) {
      s.x = p.x; s.y = p.y;
      const R = 46 * this.size;
      const dx = s.x - s.ox, dy = s.y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > R * 1.5) {
        s.ox = s.x - (dx / d) * R * 1.5;
        s.oy = s.y - (dy / d) * R * 1.5;
      }
      this.updStick();
    }
  },

  up(e) {
    const p = this.pos(e);
    if (!this.active) {
      if (e.type !== 'lostpointercapture' && Game.scene && Game.scene.onPointer) Game.scene.onPointer('up', p, e);
      return;
    }
    const name = this.btnPtr.get(e.pointerId);
    if (name) {
      this.btnPtr.delete(e.pointerId);
      let still = false;
      for (const v of this.btnPtr.values()) if (v === name) still = true;
      if (!still) this.touch[name] = false;
    }
    if (e.pointerId === this.stick.id) {
      this.stick.id = null;
      this.touch.left = this.touch.right = this.touch.up = this.touch.down = false;
    }
  },

  updStick() {
    const s = this.stick;
    const dx = s.x - s.ox, dy = s.y - s.oy;
    const T = 13 * this.size;
    const wasUp = this.touch.up, wasDown = this.touch.down;
    this.touch.left = dx < -T;
    this.touch.right = dx > T;
    this.touch.up = dy < -T * 2 && Math.abs(dy) > Math.abs(dx) * 0.85;
    this.touch.down = dy > T * 2 && Math.abs(dy) > Math.abs(dx) * 0.85;
    if (this.touch.up && !wasUp) this.latch.up = true;
    if (this.touch.down && !wasDown) this.latch.down = true;
  },

  pollPad() {
    const p = this.pad;
    for (const a of ACTIONS) p[a] = false;
    let pads = null;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { pads = null; }
    if (!pads) return;
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      p.left = p.left || ax < -0.4 || b(14);
      p.right = p.right || ax > 0.4 || b(15);
      p.up = p.up || ay < -0.6 || b(12);
      p.down = p.down || ay > 0.6 || b(13);
      p.jump = p.jump || b(0);
      p.attack = p.attack || b(2);
      p.dash = p.dash || b(1) || b(7);
      p.skill1 = p.skill1 || b(3);
      p.skill2 = p.skill2 || b(5);
      p.potion = p.potion || b(4);
      p.pause = p.pause || b(9);
    }
  },

  poll() {
    this.pollPad();
    for (const a of ACTIONS) {
      const h = !!(this.key[a] || this.touch[a] || this.pad[a]);
      this.pressed[a] = (h && !this.prev[a]) || !!this.latch[a];
      this.held[a] = h;
      this.prev[a] = h;
      this.latch[a] = false;
    }
  },

  clearPressed() {
    for (const a of ACTIONS) this.pressed[a] = false;
  },

  layout(W, H) {
    const s = this.size, L = this.safeL, R = this.safeR;
    this.buttons = [
      { name: 'attack', x: W - R - 72 * s, y: H - 72 * s, r: 38 * s },
      { name: 'jump', x: W - R - 160 * s, y: H - 46 * s, r: 31 * s },
      { name: 'dash', x: W - R - 156 * s, y: H - 128 * s, r: 25 * s },
      { name: 'skill1', x: W - R - 88 * s, y: H - 158 * s, r: 25 * s },
      { name: 'skill2', x: W - R - 30 * s, y: H - 140 * s, r: 22 * s },
      { name: 'potion', x: L + 26, y: 88, r: 17 },
      { name: 'pause', x: W - R - 24, y: 22, r: 17 },
    ];
    this.stickHome = { x: L + 88 * s, y: H - 78 * s };
  },

  btn(name) { return this.buttons.find((b) => b.name === name); },

  draw(ctx, info) {
    const showTouch = this.touchMode;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const b of this.buttons) {
      if (!showTouch && b.name !== 'pause' && b.name !== 'potion') continue;
      const on = !!this.touch[b.name] || !!this.key[b.name];
      let dim = false, cd = 0, color = '#ffffff';
      if (b.name === 'skill1' || b.name === 'skill2') {
        const si = b.name === 'skill1' ? 0 : 1;
        const sk = info.skills[si];
        if (!sk) { dim = true; }
        else {
          color = sk.color;
          dim = !sk.ready;
          cd = sk.cd;
        }
      }
      if (b.name === 'potion' && info.potions <= 0) dim = true;
      const a = this.alpha * (dim ? 0.55 : 1);
      ctx.globalAlpha = Math.min(1, a + (on ? 0.35 : 0));
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fillStyle = on ? 'rgba(255,255,255,0.35)' : 'rgba(10,14,22,0.45)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = b.name.startsWith('skill') && !dim ? color : 'rgba(255,255,255,0.75)';
      ctx.stroke();
      if (cd > 0) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + TAU * cd);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill();
      }
      ctx.globalAlpha = Math.min(1, this.alpha + 0.3) * (dim ? 0.6 : 1);
      drawButtonIcon(ctx, b, info);
    }
    if (showTouch) {
      const s = this.stick;
      const R = 46 * this.size;
      const active = s.id !== null;
      const ox = active ? s.ox : this.stickHome.x;
      const oy = active ? s.oy : this.stickHome.y;
      ctx.globalAlpha = this.alpha * (active ? 1 : 0.7);
      ctx.beginPath();
      ctx.arc(ox, oy, R, 0, TAU);
      ctx.fillStyle = 'rgba(10,14,22,0.35)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        const cx = ox + Math.cos(ang) * (R - 10), cy = oy + Math.sin(ang) * (R - 10);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * 6, cy + Math.sin(ang) * 6);
        ctx.lineTo(cx + Math.cos(ang + 2.3) * 5, cy + Math.sin(ang + 2.3) * 5);
        ctx.lineTo(cx + Math.cos(ang - 2.3) * 5, cy + Math.sin(ang - 2.3) * 5);
        ctx.fill();
      }
      let kx = ox, ky = oy;
      if (active) {
        const dx = s.x - ox, dy = s.y - oy;
        const d = Math.hypot(dx, dy);
        const m = Math.min(d, R * 0.8);
        if (d > 0) { kx = ox + (dx / d) * m; ky = oy + (dy / d) * m; }
      }
      ctx.globalAlpha = Math.min(1, this.alpha + 0.2);
      ctx.beginPath();
      ctx.arc(kx, ky, R * 0.42, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
    }
    ctx.restore();
  },
};

function drawButtonIcon(ctx, b, info) {
  const x = b.x, y = b.y, r = b.r;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(2, r * 0.1);
  switch (b.name) {
    case 'attack': {
      if (info.weapon === 'fists') {
        ctx.beginPath();
        roundRect(ctx, x - r * 0.32, y - r * 0.28, r * 0.64, r * 0.56, r * 0.18);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        for (let i = 0; i < 3; i++) ctx.fillRect(x - r * 0.2 + i * r * 0.16, y - r * 0.26, 1.5, r * 0.22);
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 4);
        ctx.fillRect(-r * 0.07, -r * 0.55, r * 0.14, r * 0.75);
        ctx.fillRect(-r * 0.28, r * 0.18, r * 0.56, r * 0.1);
        ctx.fillRect(-r * 0.05, r * 0.26, r * 0.1, r * 0.24);
        ctx.restore();
      }
      break;
    }
    case 'jump':
      ctx.beginPath();
      ctx.moveTo(x - r * 0.4, y + r * 0.15);
      ctx.lineTo(x, y - r * 0.3);
      ctx.lineTo(x + r * 0.4, y + r * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.4, y + r * 0.45);
      ctx.lineTo(x, y);
      ctx.lineTo(x + r * 0.4, y + r * 0.45);
      ctx.globalAlpha *= 0.5;
      ctx.stroke();
      break;
    case 'dash':
      for (let i = 0; i < 2; i++) {
        const ox = (i - 0.5) * r * 0.45;
        ctx.beginPath();
        ctx.moveTo(x + ox - r * 0.2, y - r * 0.35);
        ctx.lineTo(x + ox + r * 0.18, y);
        ctx.lineTo(x + ox - r * 0.2, y + r * 0.35);
        ctx.stroke();
      }
      break;
    case 'skill1':
    case 'skill2': {
      const sk = info.skills[b.name === 'skill1' ? 0 : 1];
      if (!sk) {
        ctx.beginPath();
        ctx.arc(x, y - r * 0.12, r * 0.22, Math.PI, 0);
        ctx.stroke();
        ctx.fillRect(x - r * 0.3, y - r * 0.1, r * 0.6, r * 0.45);
      } else {
        drawSkillGlyph(ctx, sk.id, x, y, r * 0.55, sk.color);
      }
      break;
    }
    case 'potion':
      drawPotionIcon(ctx, x, y + 1, r * 0.9);
      ctx.font = 'bold 11px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText('x' + info.potions, x + r * 0.95, y + r + 4);
      if (!Input.touchMode) {
        ctx.font = '9px system-ui,sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('[Q]', x, y + r + 14);
      }
      break;
    case 'pause':
      ctx.fillRect(x - r * 0.3, y - r * 0.38, r * 0.2, r * 0.76);
      ctx.fillRect(x + r * 0.1, y - r * 0.38, r * 0.2, r * 0.76);
      break;
  }
}
