// ---------- Input: touch, keyboard (three players on one keyboard), gamepads, mouse ----------
// Devices: 'touch', 'kb1', 'kb2', 'kb3', 'pad0'..'pad3'. Each local player owns one device.

const KEYMAP = {
  kb1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], skill: ['KeyQ'], ult: ['KeyE'], dash: ['Space', 'ShiftLeft'] },
  kb2: { up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], skill: ['KeyU'], ult: ['KeyO'], dash: ['Semicolon', 'KeyP'] },
  kb3: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], skill: ['Numpad1', 'Slash'], ult: ['Numpad2', 'Enter'], dash: ['Numpad0', 'ShiftRight'] },
};
// When only one keyboard player is in the game, they can use either hand.
const KB_SOLO = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], skill: ['KeyJ', 'Numpad1'], ult: ['KeyK', 'Numpad2'], dash: ['KeyL', 'Numpad0'] };
const KEY_HINT = { kb1: 'WASD · Q skill · E ult · Space dash', kb2: 'IJKL · U skill · O ult · ; dash', kb3: 'Arrows · 1 skill · 2 ult · 0 dash (numpad)', touch: 'Touch', pad0: 'Gamepad 1', pad1: 'Gamepad 2', pad2: 'Gamepad 3', pad3: 'Gamepad 4' };
const DEV_NAME = { kb1: 'Keyboard (left)', kb2: 'Keyboard (right)', kb3: 'Keyboard (arrows)', touch: 'Touch', pad0: 'Gamepad 1', pad1: 'Gamepad 2', pad2: 'Gamepad 3', pad3: 'Gamepad 4' };

const Input = {
  keys: new Set(),
  pressed: new Set(),
  pads: [],
  padPrev: [],
  mouse: { x: 0, y: 0, t: -1e9, down: 0, l: false, r: false },
  touches: new Map(),
  stick: null,
  btn: { skill: null, ult: null, dash: null },
  edge: { skill: false, ult: false, dash: false, pause: false },
  touchAim: { skill: null, ult: null },
  usedTouch: false,
  soloKb: true,
  canvas: null,
  enabled: true,
  layout: null,
  rot: false,
  onPause: null,

  init(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape' && this.onPause) this.onPause();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.touches.clear(); this.stick = null; });
    canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.offsetX; this.mouse.y = e.offsetY; this.mouse.t = performance.now(); });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.x = e.offsetX; this.mouse.y = e.offsetY; this.mouse.t = performance.now();
      if (e.button === 0) this.mouse.l = true;
      if (e.button === 2) this.mouse.r = true;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    const opt = { passive: false };
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); this.usedTouch = true; for (const t of e.changedTouches) this.tStart(t); }, opt);
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) this.tMove(t); }, opt);
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); for (const t of e.changedTouches) this.tEnd(t); }, opt);
    canvas.addEventListener('touchcancel', (e) => { for (const t of e.changedTouches) this.tEnd(t, true); }, opt);
  },

  // Button positions in CSS pixels, recomputed by the view on resize.
  setLayout(W, H, safe) {
    const s = clamp(Math.min(W, H) / 390, 0.8, 1.35);
    const R = safe ? safe.r : 0, B = safe ? safe.b : 0;
    this.layout = {
      s, W, H,
      skill: { x: W - R - 92 * s, y: H - B - 88 * s, r: 44 * s },
      ult: { x: W - R - 190 * s, y: H - B - 58 * s, r: 36 * s },
      dash: { x: W - R - 66 * s, y: H - B - 186 * s, r: 31 * s },
      pause: { x: W - R - 34 * s, y: 34 * s + (safe ? safe.t : 0), r: 23 * s },
      stickR: 60 * s,
    };
  },

  hitBtn(x, y) {
    const L = this.layout;
    if (!L) return null;
    for (const k of ['skill', 'ult', 'dash', 'pause']) { const b = L[k]; if (dist(x, y, b.x, b.y) < b.r * 1.25) return k; }
    return null;
  },

  // With the game turned sideways on an upright phone, screen x/y map to the game's y/x.
  tPos(t) {
    if (this.rot) return { x: t.clientY, y: innerWidth - t.clientX };
    const r = this.canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  },

  tStart(t) {
    const p = this.tPos(t);
    if (this.touchHook && this.touchHook(p.x, p.y)) return;
    const b = this.hitBtn(p.x, p.y);
    if (b === 'pause') { if (this.onPause) this.onPause(); return; }
    if (b === 'dash') { this.edge.dash = true; this.touches.set(t.identifier, { kind: 'dash' }); return; }
    if (b === 'skill' || b === 'ult') { this.touches.set(t.identifier, { kind: b, x0: p.x, y0: p.y, x: p.x, y: p.y }); this.btn[b] = { x: p.x, y: p.y, dx: 0, dy: 0 }; return; }
    if (!this.stick && p.x < this.layout.W * 0.55) {
      this.stick = { id: t.identifier, x0: p.x, y0: p.y, x: p.x, y: p.y };
      this.touches.set(t.identifier, { kind: 'stick' });
    }
  },

  tMove(t) {
    const tt = this.touches.get(t.identifier);
    if (!tt) return;
    const p = this.tPos(t);
    if (tt.kind === 'stick' && this.stick) {
      this.stick.x = p.x; this.stick.y = p.y;
      const R = this.layout.stickR, d = dist(this.stick.x0, this.stick.y0, p.x, p.y);
      if (d > R * 1.4) { const a = angTo(p.x, p.y, this.stick.x0, this.stick.y0); this.stick.x0 = p.x + Math.cos(a) * R * 1.4; this.stick.y0 = p.y + Math.sin(a) * R * 1.4; }
    } else if (tt.kind === 'skill' || tt.kind === 'ult') {
      tt.x = p.x; tt.y = p.y;
      const b = this.btn[tt.kind];
      if (b) { b.dx = p.x - tt.x0; b.dy = p.y - tt.y0; }
    }
  },

  tEnd(t, cancel) {
    const tt = this.touches.get(t.identifier);
    if (!tt) return;
    this.touches.delete(t.identifier);
    if (tt.kind === 'stick') this.stick = null;
    if (tt.kind === 'skill' || tt.kind === 'ult') {
      const dx = tt.x - tt.x0, dy = tt.y - tt.y0, d = Math.hypot(dx, dy);
      this.btn[tt.kind] = null;
      if (cancel) return;
      if (d > 20) this.touchAim[tt.kind] = { ang: Math.atan2(dy, dx), d: clamp(d / (95 * this.layout.s), 0.15, 1) };
      else this.touchAim[tt.kind] = null;
      this.edge[tt.kind] = true;
    }
  },

  pollPads() {
    let list = [];
    try { list = navigator.getGamepads ? navigator.getGamepads() || [] : []; } catch (e) { list = []; }
    for (let i = 0; i < 4; i++) {
      const g = list[i];
      this.padPrev[i] = this.pads[i] ? this.pads[i].b.slice() : [];
      if (!g || !g.connected) { this.pads[i] = null; continue; }
      this.pads[i] = { ax: g.axes.slice(0, 4), b: g.buttons.map((b) => b.pressed || b.value > 0.5) };
    }
  },

  padDown(i, b) { const p = this.pads[i]; return !!(p && p.b[b]); },
  padHit(i, b) { const p = this.pads[i]; return !!(p && p.b[b] && !(this.padPrev[i] || [])[b]); },

  keyAny(list) { for (const k of list) if (this.keys.has(k)) return true; return false; },
  keyHit(list) { for (const k of list) if (this.pressed.has(k)) return true; return false; },

  map(dev) {
    const m = KEYMAP[dev];
    if (dev === 'kb1' && this.soloKb) {
      const o = {};
      for (const k in m) o[k] = m[k].concat(KB_SOLO[k]);
      return o;
    }
    return m;
  },

  // Reads one device into an input record { mx, my, skill, ult, dash, aim, aimD }.
  read(dev, out) {
    out.skill = out.skill || false;
    out.ult = out.ult || false;
    out.dash = out.dash || false;
    if (!this.enabled) { out.mx = out.my = 0; return out; }
    let mx = 0, my = 0;
    if (dev === 'touch') {
      if (this.stick) {
        const R = this.layout.stickR;
        const dx = this.stick.x - this.stick.x0, dy = this.stick.y - this.stick.y0, d = Math.hypot(dx, dy);
        if (d > 6) { const m = Math.min(1, d / R); mx = dx / d * m; my = dy / d * m; }
      }
      if (this.edge.skill) { out.skill = true; out.aim = this.touchAim.skill ? this.touchAim.skill.ang : null; out.aimD = this.touchAim.skill ? this.touchAim.skill.d : 0; }
      if (this.edge.ult) { out.ult = true; out.aim = this.touchAim.ult ? this.touchAim.ult.ang : null; out.aimD = this.touchAim.ult ? this.touchAim.ult.d : 0; }
      if (this.edge.dash) out.dash = true;
      this.edge.skill = this.edge.ult = this.edge.dash = false;
    } else if (dev.startsWith('kb')) {
      const m = this.map(dev);
      if (this.keyAny(m.left)) mx -= 1;
      if (this.keyAny(m.right)) mx += 1;
      if (this.keyAny(m.up)) my -= 1;
      if (this.keyAny(m.down)) my += 1;
      if (mx && my) { mx *= 0.7071; my *= 0.7071; }
      if (this.keyHit(m.skill)) out.skill = true;
      if (this.keyHit(m.ult)) out.ult = true;
      if (this.keyHit(m.dash)) out.dash = true;
      if (dev === 'kb1') {
        if (this.mouse.l) { out.skill = true; this.mouse.l = false; }
        if (this.mouse.r) { out.ult = true; this.mouse.r = false; }
      }
    } else if (dev.startsWith('pad')) {
      const i = +dev.slice(3), p = this.pads[i];
      if (p) {
        mx = p.ax[0] || 0; my = p.ax[1] || 0;
        const d = Math.hypot(mx, my);
        if (d < 0.22) { mx = my = 0; } else if (d > 1) { mx /= d; my /= d; }
        if (p.b[14]) mx = -1; if (p.b[15]) mx = 1; if (p.b[12]) my = -1; if (p.b[13]) my = 1;
        const rx = p.ax[2] || 0, ry = p.ax[3] || 0;
        if (Math.hypot(rx, ry) > 0.5) { out.aim = Math.atan2(ry, rx); out.aimD = 0.8; out.aimStick = true; }
        if (this.padHit(i, 2) || this.padHit(i, 5)) out.skill = true;
        if (this.padHit(i, 1) || this.padHit(i, 3) || this.padHit(i, 7)) out.ult = true;
        if (this.padHit(i, 0) || this.padHit(i, 4) || this.padHit(i, 6)) out.dash = true;
        if (this.padHit(i, 9) && this.onPause) this.onPause();
      }
    }
    out.mx = mx; out.my = my;
    return out;
  },

  // Edges for menus: { left, right, up, down, ok, alt, back }
  menu(dev) {
    const o = { left: false, right: false, up: false, down: false, ok: false, alt: false };
    if (dev.startsWith('kb')) {
      const m = this.map(dev);
      o.left = this.keyHit(m.left); o.right = this.keyHit(m.right); o.up = this.keyHit(m.up); o.down = this.keyHit(m.down);
      o.ok = this.keyHit(m.skill) || this.keyHit(m.dash) || (dev === 'kb1' && this.keyHit(['Enter']) && !KEYMAP.kb3.ult.includes('Enter'));
      o.alt = this.keyHit(m.ult);
    } else if (dev.startsWith('pad')) {
      const i = +dev.slice(3), p = this.pads[i];
      if (p) {
        const px = p.ax[0] || 0;
        const st = this.padStick || (this.padStick = {});
        const dir = px < -0.6 ? -1 : px > 0.6 ? 1 : 0;
        if (dir !== (st[i] || 0)) { if (dir < 0) o.left = true; if (dir > 0) o.right = true; }
        st[i] = dir;
        if (this.padHit(i, 14)) o.left = true;
        if (this.padHit(i, 15)) o.right = true;
        o.ok = this.padHit(i, 0) || this.padHit(i, 2);
        o.alt = this.padHit(i, 3);
      }
    }
    return o;
  },

  // A device that pressed an action this frame (to join a local game), or null.
  joinPress() {
    for (const dev of ['kb1', 'kb2', 'kb3']) {
      const m = KEYMAP[dev];
      if (this.keyHit(m.skill) || this.keyHit(m.ult) || this.keyHit(m.dash)) return dev;
    }
    for (let i = 0; i < 4; i++) if (this.pads[i] && (this.padHit(i, 0) || this.padHit(i, 2) || this.padHit(i, 9))) return 'pad' + i;
    return null;
  },

  endFrame() { this.pressed.clear(); this.mouse.l = this.mouse.r = false; },
};
