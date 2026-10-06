// ---------- Input: floating thumb joystick, keyboard, gamepad ----------
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Escape: 'pause', KeyP: 'pause',
};

const Input = {
  key: {}, canvas: null, active: false,
  stick: { id: null, ox: 0, oy: 0, x: 0, y: 0, on: false },
  R: 52, // joystick radius in CSS pixels
  mx: 0, my: 0, moved: false, pauseLatch: false, padPause: false,

  init(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (a) {
        if (a === 'pause' && !e.repeat) this.pauseLatch = true;
        this.key[a] = true;
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
    this.key = {};
    this.pauseLatch = false;
    this.stick.id = null;
    this.stick.on = false;
    this.mx = this.my = 0;
  },

  down(e) {
    Sound.init();
    if (!this.active) return;
    e.preventDefault();
    const s = this.stick;
    if (s.id !== null) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    s.id = e.pointerId;
    s.ox = s.x = e.clientX;
    s.oy = s.y = e.clientY;
    s.on = true;
  },

  move(e) {
    const s = this.stick;
    if (e.pointerId !== s.id) return;
    e.preventDefault();
    s.x = e.clientX;
    s.y = e.clientY;
    // the base follows the thumb when it is dragged far away
    const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), lim = this.R * 1.4;
    if (d > lim) {
      s.ox = s.x - (dx / d) * lim;
      s.oy = s.y - (dy / d) * lim;
    }
  },

  up(e) {
    const s = this.stick;
    if (e.pointerId !== s.id) return;
    s.id = null;
    s.on = false;
  },

  // Movement vector with length 0..1.
  poll() {
    let x = 0, y = 0;
    const s = this.stick;
    if (s.on) {
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
      if (d > 5) {
        const m = Math.min(1, (d - 5) / (this.R * 0.7));
        x = (dx / d) * m;
        y = (dy / d) * m;
      }
    }
    const k = this.key;
    if (k.left) x -= 1;
    if (k.right) x += 1;
    if (k.up) y -= 1;
    if (k.down) y += 1;
    let pads = null;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch (err) { pads = null; }
    let padPause = false;
    if (pads) {
      for (const gp of pads) {
        if (!gp) continue;
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        if (Math.hypot(ax, ay) > 0.2) { x += ax; y += ay; }
        const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
        if (b(14)) x -= 1;
        if (b(15)) x += 1;
        if (b(12)) y -= 1;
        if (b(13)) y += 1;
        if (b(9)) padPause = true;
      }
    }
    if (padPause && !this.padPause) this.pauseLatch = true;
    this.padPause = padPause;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.mx = x;
    this.my = y;
    if (l > 0.1) this.moved = true;
  },

  takePause() {
    const p = this.pauseLatch;
    this.pauseLatch = false;
    return p;
  },

  draw(ctx) {
    const s = this.stick;
    if (!s.on) return;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(10,12,30,0.45)';
    circle(ctx, s.ox, s.oy, this.R);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,240,200,0.7)';
    ctx.stroke();
    const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), m = Math.min(d, this.R);
    const kx = d > 0 ? s.ox + (dx / d) * m : s.ox, ky = d > 0 ? s.oy + (dy / d) * m : s.oy;
    ctx.globalAlpha = 0.8;
    const g = ctx.createRadialGradient(kx - 6, ky - 6, 2, kx, ky, 24);
    g.addColorStop(0, '#fff6d8');
    g.addColorStop(1, '#ffb040');
    ctx.fillStyle = g;
    circle(ctx, kx, ky, 22);
    ctx.fill();
    ctx.restore();
  },
};
