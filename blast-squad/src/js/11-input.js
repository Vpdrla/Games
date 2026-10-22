// ---------- Input: twin-stick touch controls, keyboard + mouse and gamepad -> input words ----------
// Landscape layout like the original (CSS pixels of the canvas, mirrored when Input.leftHanded):
//   move    floating joystick that appears where the left thumb lands (left ~45% of the screen)
//   attack  fixed joystick at the bottom right. Tap = auto-aim (ACT.ATTACK, auto 1). Drag past a small
//           deadzone = manual aim with an indicator, release fires; dragging back into the centre
//           cancels.
//   super   same tap/drag behaviour, left of / above attack; only takes a thumb while me.supReady
//   gadget  small button, fires on press (aimed where you walk, else auto)
//   chat    quick-chat button: a wheel of PINS and EMOTES -> Input.onPin(i) / Input.onEmote(i)
// Keyboard + mouse: WASD / arrows move, the mouse aims (Input.setScreenToWorld gives world points),
// left click attack, right click or Space super, Q / E gadget, F auto-aim attack, T quick chat
// (1-8 pins, Shift+1-5 emotes). Gamepad: left stick move, right stick aim, R1/RT attack (auto-aim
// when the right stick is centred), L1/LT super, A gadget, Y quick chat (stick + A picks, B closes).
//
// API
//   Input.init(canvas)                 listeners (pointer events on the canvas, keys on window)
//   Input.layout(w, h, safe, dpr)      canvas size in CSS px, safe = {l, r, t, b} CSS px, dpr of the
//                                      backing store (Input.draw scales by it)
//   Input.setFlip(flip)                team 1 sees the map turned 180 degrees: screen angles are
//                                      rotated by PI before packing, so words carry world angles
//   Input.setLocal(me, brawlerData)    local brawler entity (null when none) and its BRAWLERS entry
//   Input.setScreenToWorld(fn)         fn(sx, sy) -> {x, y} world tiles, for mouse aiming
//   Input.word()                       the word for this tick (polls the pad; at most one action,
//                                      and an action is sent once)
//   Input.aim                          { act, ang (world), d (share of range) } | null while aiming
//   Input.draw(ctx, me)                joysticks, buttons and the chat wheel; ctx in device pixels
//                                      with any transform (it sets its own: dpr scale)
//   Input.reset()  Input.enabled  Input.leftHanded  Input.pollPad()  Input.onPin  Input.onEmote
//   Input.touchMode (touch controls drawn), Input.size (user scale), Input.opacity
const Input = {
  canvas: null, W: 844, H: 390, dpr: 1, s: 1,
  safe: { l: 0, r: 0, t: 0, b: 0 },
  size: 1, opacity: 1, leftHanded: false, _lh: false,
  flip: false, me: null, data: null, s2w: null,
  _en: false, touchMode: false, device: 'mouse', tick: 0, anim: 0,
  // controls (centres and radii in CSS px, filled by layout)
  btn: {
    atk: { x: 0, y: 0, r: 46, hit: 1.45 },
    sup: { x: 0, y: 0, r: 36, hit: 1.35 },
    gad: { x: 0, y: 0, r: 24, hit: 1.5 },
    chat: { x: 0, y: 0, r: 19, hit: 1.6 },
  },
  home: { x: 120, y: 290 }, // resting place of the move joystick
  R: 58, // joystick radius (move and aim drags)
  ptr: new Map(), // pointerId -> 'move' | 'atk' | 'sup' | 'gad' | 'chat' | 'none'
  mv: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
  st: {
    // aim sticks. st: 0 idle, 1 held in the centre (a tap so far), 2 aiming, 3 cancel
    atk: { id: null, ox: 0, oy: 0, x: 0, y: 0, st: 0, act: 1 },
    sup: { id: null, ox: 0, oy: 0, x: 0, y: 0, st: 0, act: 2 },
  },
  gadDown: false,
  keys: {}, // held movement keys: up / down / left / right
  mouse: { x: 0, y: 0, on: false },
  pad: { on: false, lx: 0, ly: 0, rx: 0, ry: 0, prev: [], held: [], sel: -1 },
  wheel: { open: false, x: 0, y: 0, R: 120, hover: -1, items: [] },
  pending: [], // queued actions {act, auto, ang, d, tick}; word() sends one per tick
  _aim: { act: 0, ang: 0, d: 1 },
  onPin(i) {}, // set by the match
  onEmote(i) {},

  get enabled() { return this._en; },
  set enabled(v) {
    v = !!v;
    if (v !== this._en) this.reset();
    this._en = v;
  },

  init(canvas) {
    this.canvas = canvas;
    try { this.touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; } catch (e) { this.touchMode = false; }
    this.device = this.touchMode ? 'touch' : 'mouse';
    const opt = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this.onDown(e), opt);
    canvas.addEventListener('pointermove', (e) => this.onMove(e), opt);
    canvas.addEventListener('pointerup', (e) => this.onUp(e, true), opt);
    canvas.addEventListener('pointercancel', (e) => this.onUp(e, false), opt);
    canvas.addEventListener('lostpointercapture', (e) => this.onUp(e, false), opt);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.mouse.on = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('touchstart', (e) => { if (this._en) e.preventDefault(); }, opt);
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    if (!this.btn.atk.x) this.layout(this.W, this.H, this.safe, this.dpr);
  },

  // Drops every held control and queued action (pause, blur, death screens, scene changes).
  reset() {
    this.ptr.clear();
    this.mv.id = null;
    for (const k in this.st) { const a = this.st[k]; a.id = null; a.st = 0; }
    this.keys = {};
    this.gadDown = false;
    this.pending.length = 0;
    this.wheel.open = false;
    this.wheel.hover = -1;
    this.pad.sel = -1;
    // a button still held on the pad must be released before it fires again
    for (let i = 0; i < this.pad.held.length; i++) this.pad.prev[i] = this.pad.held[i];
  },

  setFlip(flip) { this.flip = !!flip; },
  setLocal(me, data) {
    this.me = me || null;
    this.data = data || (me && typeof BRAWLERS !== 'undefined' ? BRAWLERS[me.bk] : null) || null;
  },
  setScreenToWorld(fn) { this.s2w = fn || null; },

  layout(w, h, safe, dpr) {
    this.W = w; this.H = h;
    if (safe) this.safe = { l: safe.l || 0, r: safe.r || 0, t: safe.t || 0, b: safe.b || 0 };
    if (dpr) this.dpr = dpr;
    this._lh = !!this.leftHanded;
    const sf = this.safe, lh = this._lh;
    const s = this.s = clamp(Math.min(w / 844, h / 390), 0.8, 1.5) * clamp(this.size || 1, 0.6, 1.6);
    // laid out right-handed with the safe insets swapped for the mirrored layout, then mirrored
    const L = lh ? sf.r : sf.l, R = lh ? sf.l : sf.r, B = Math.max(sf.b, 0);
    const mx = (x) => (lh ? w - x : x);
    const set = (b, x, y, r) => { b.x = mx(x); b.y = y; b.r = r; };
    const ax = w - R - 104 * s, ay = h - B - 92 * s;
    set(this.btn.atk, ax, ay, 46 * s);
    set(this.btn.sup, ax - 102 * s, ay - 34 * s, 36 * s);
    set(this.btn.gad, ax - 18 * s, ay - 96 * s, 24 * s);
    set(this.btn.chat, w - R - 30 * s, ay - 166 * s, 19 * s);
    this.R = 58 * s;
    this.home.x = mx(L + 128 * s);
    this.home.y = h - B - 104 * s;
    const wh = this.wheel;
    // upper right, clear of the player (the camera keeps the brawler at the middle of the screen)
    wh.R = Math.min(h * 0.34, 128 * s);
    wh.x = mx(Math.min(w * 0.69, w - R - wh.R - 70 * s));
    wh.y = clamp(h * 0.42, wh.R + 16 * s, h - wh.R - 16 * s);
    this.layoutWheel();
  },

  layoutWheel() {
    const wh = this.wheel, s = this.s;
    const items = wh.items;
    items.length = 0;
    // pins around the outside, emotes on an inner ring
    for (let i = 0; i < PINS.length; i++) {
      const a = -Math.PI / 2 + (i / PINS.length) * TAU;
      items.push({ kind: 'pin', i, x: wh.x + Math.cos(a) * wh.R * 0.78, y: wh.y + Math.sin(a) * wh.R * 0.78, w: 0, h: 24 * s, a });
    }
    for (let i = 0; i < EMOTES.length; i++) {
      const a = -Math.PI / 2 + (i / EMOTES.length) * TAU;
      items.push({ kind: 'emote', i, x: wh.x + Math.cos(a) * wh.R * 0.36, y: wh.y + Math.sin(a) * wh.R * 0.36, w: 0, h: 0, a });
    }
  },

  // ---------------- pointers ----------------
  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    const w = r.width || this.W, h = r.height || this.H;
    return { x: ((e.clientX - r.left) / w) * this.W, y: ((e.clientY - r.top) / h) * this.H };
  },

  noteDevice(e) {
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    this.device = touch ? 'touch' : 'mouse';
    this.touchMode = touch;
  },

  onDown(e) {
    this.wake();
    this.noteDevice(e);
    if (!this._en) return;
    e.preventDefault();
    if (this._lh !== this.leftHanded) this.layout(this.W, this.H, this.safe, this.dpr);
    const p = this.pos(e);
    if (e.pointerType === 'mouse') { this.mouseDown(e.button, p.x, p.y); return; }
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or gone */ }
    this.touchDown(e.pointerId, p.x, p.y);
  },

  onMove(e) {
    if (!this._en) return;
    const p = this.pos(e);
    if (e.pointerType === 'mouse') {
      if (this.device !== 'mouse' && (Math.abs(p.x - this.mouse.x) > 2 || Math.abs(p.y - this.mouse.y) > 2)) { this.device = 'mouse'; this.touchMode = false; }
      this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.on = true;
      if (this.wheel.open) this.wheel.hover = this.wheelItem(p.x, p.y);
      return;
    }
    if (!this.ptr.has(e.pointerId)) return;
    e.preventDefault();
    this.touchMove(e.pointerId, p.x, p.y);
  },

  onUp(e, fire) {
    if (e.pointerType === 'mouse') return;
    if (!this.ptr.has(e.pointerId)) return;
    const p = this.pos(e);
    this.touchUp(e.pointerId, p.x, p.y, fire);
  },

  // Which button a point lands on (nearest within its hit radius), or null.
  hitButton(x, y) {
    let best = null, bd = 1e9;
    for (const k in this.btn) {
      const b = this.btn[k];
      if (k === 'gad' && !this.hasGadget()) continue;
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r * b.hit && d / b.r < bd) { best = k; bd = d / b.r; }
    }
    return best;
  },

  inMoveZone(x, y) {
    if (y < this.H * 0.1) return false;
    return this._lh ? x > this.W * 0.55 : x < this.W * 0.45;
  },

  touchDown(id, x, y) {
    if (this.ptr.has(id)) this.touchUp(id, x, y, false);
    const wh = this.wheel;
    if (wh.open) {
      const it = this.wheelItem(x, y);
      if (it >= 0) { this.pickItem(it); this.ptr.set(id, 'none'); return; }
      const inside = Math.hypot(x - wh.x, y - wh.y) < wh.R + 24 * this.s;
      this.closeWheel();
      if (inside || this.hitButton(x, y) === 'chat') { this.ptr.set(id, 'none'); return; }
      // a touch outside the wheel closes it and still plays
    }
    const b = this.hitButton(x, y);
    if (b === 'chat') { this.openWheel(); this.ptr.set(id, 'chat'); return; }
    if (b === 'gad') { this.gadDown = true; this.queueGadget(); this.ptr.set(id, 'gad'); return; }
    if (b === 'sup' || b === 'atk') {
      const a = this.st[b];
      if (a.id !== null || (b === 'sup' && !this.superReady())) { this.ptr.set(id, 'none'); return; }
      a.id = id; a.ox = a.x = x; a.oy = a.y = y; a.st = 1;
      this.ptr.set(id, b);
      return;
    }
    if (this.mv.id === null && this.inMoveZone(x, y)) {
      const m = this.mv;
      m.id = id; m.ox = m.x = x; m.oy = m.y = y;
      this.ptr.set(id, 'move');
      return;
    }
    this.ptr.set(id, 'none');
  },

  touchMove(id, x, y) {
    const k = this.ptr.get(id);
    if (k === 'move') {
      const m = this.mv;
      m.x = x; m.y = y;
      // the base follows the thumb when it is dragged past the rim
      const dx = x - m.ox, dy = y - m.oy, d = Math.hypot(dx, dy), lim = this.R;
      if (d > lim) { m.ox = x - (dx / d) * lim; m.oy = y - (dy / d) * lim; }
    } else if (k === 'atk' || k === 'sup') {
      const a = this.st[k];
      a.x = x; a.y = y;
      const d = Math.hypot(x - a.ox, y - a.oy), dead = this.deadzone();
      if (d > dead) a.st = 2;
      else if (a.st === 2) a.st = 3; // came back into the centre: cancel
      if (k === 'sup' && !this.superReady()) a.st = 3;
    } else if (k === 'chat') {
      this.wheel.hover = this.wheelItem(x, y);
    }
  },

  touchUp(id, x, y, fire) {
    const k = this.ptr.get(id);
    this.ptr.delete(id);
    if (k === 'move') this.mv.id = null;
    else if (k === 'gad') this.gadDown = false;
    else if (k === 'atk' || k === 'sup') {
      const a = this.st[k];
      if (fire && a.id === id) {
        a.x = x; a.y = y;
        const d = Math.hypot(x - a.ox, y - a.oy);
        if (a.st === 2 && d <= this.deadzone()) a.st = 3;
        if (k === 'sup' && !this.superReady()) a.st = 3;
        if (a.st === 1) this.queue(a.act, 1, 0, 1);
        else if (a.st === 2) this.queue(a.act, 0, this.stickAng(a), this.stickD(a));
      }
      a.id = null; a.st = 0;
    } else if (k === 'chat') {
      // slide from the button onto an item and let go = pick it; a plain tap leaves the wheel open
      const it = this.wheelItem(x, y);
      if (fire && it >= 0) this.pickItem(it);
      this.wheel.hover = -1;
    }
  },

  deadzone() { return Math.max(9, this.R * 0.2); },
  stickAng(a) { return Math.atan2(a.y - a.oy, a.x - a.ox) + (this.flip ? Math.PI : 0); },
  stickD(a) { return clamp(Math.hypot(a.x - a.ox, a.y - a.oy) / this.R, 0, 1); },

  // ---------------- mouse ----------------
  mouseDown(button, x, y) {
    const m = this.mouse;
    m.x = x; m.y = y; m.on = true;
    if (this.wheel.open) {
      const it = this.wheelItem(x, y);
      if (it >= 0) this.pickItem(it);
      else this.closeWheel();
      return;
    }
    const b = this.hitButton(x, y);
    if (b === 'chat') { this.openWheel(); return; }
    if (b === 'gad') { this.queueGadget(); return; }
    // clicking the on-screen attack / super buttons works like a tap on them: auto-aim
    if (b === 'atk' && button === 0) { this.queue(ACT.ATTACK, 1, 0, 1); return; }
    if (b === 'sup' && button === 0) { if (this.superReady()) this.queue(ACT.SUPER, 1, 0, 1); return; }
    if (button === 0) this.queueMouse(ACT.ATTACK);
    else if (button === 2) { if (this.superReady()) this.queueMouse(ACT.SUPER); }
  },

  // World angle and range share from the local brawler to the mouse, or null if unknown.
  mouseAim(act) {
    const me = this.me, m = this.mouse;
    if (!me || !this.s2w || !m.on) return null;
    const p = this.s2w(m.x, m.y);
    if (!p) return null;
    const dx = p.x - me.x, dy = p.y - me.y;
    const range = this.rangeOf(act);
    const o = this._mAim || (this._mAim = { ang: 0, d: 1 });
    o.ang = Math.atan2(dy, dx);
    o.d = range > 0 ? clamp(Math.hypot(dx, dy) / range, 0, 1) : 1;
    return o;
  },

  queueMouse(act) {
    const a = this.mouseAim(act);
    if (a) this.queue(act, 0, a.ang, a.d);
    else this.queue(act, 1, 0, 1);
  },

  // ---------------- keyboard ----------------
  onKey(e, down) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (down) this.wake();
    if (!this._en) return;
    const c = e.code;
    const dir = c === 'KeyW' || c === 'ArrowUp' ? 'up' : c === 'KeyS' || c === 'ArrowDown' ? 'down'
      : c === 'KeyA' || c === 'ArrowLeft' ? 'left' : c === 'KeyD' || c === 'ArrowRight' ? 'right' : null;
    if (dir) {
      this.keys[dir] = down;
      if (down) { this.device = 'mouse'; this.touchMode = false; }
      e.preventDefault();
      return;
    }
    if (!down) return;
    let used = true;
    const digit = c.startsWith('Digit') ? +c.slice(5) : c.startsWith('Numpad') ? +c.slice(6) : NaN;
    if (this.wheel.open && digit >= 1) {
      if (e.shiftKey) { if (digit <= EMOTES.length) this.pickItem(PINS.length + digit - 1); }
      else if (digit <= PINS.length) this.pickItem(digit - 1);
    } else if (e.repeat) {
      used = c === 'Space';
    } else if (c === 'Space') {
      if (this.superReady()) this.queueMouse(ACT.SUPER);
    } else if (c === 'KeyQ' || c === 'KeyE') {
      this.queueGadget();
    } else if (c === 'KeyF') {
      this.queue(ACT.ATTACK, 1, 0, 1);
    } else if (c === 'KeyT') {
      if (this.wheel.open) this.closeWheel(); else this.openWheel();
    } else if (c === 'Escape' && this.wheel.open) {
      this.closeWheel();
    } else used = false;
    if (used) {
      if (!this.pad.on || c !== 'Space') { this.device = 'mouse'; this.touchMode = false; }
      e.preventDefault();
    }
  },

  // ---------------- gamepad ----------------
  getPads() {
    try { return navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { return null; }
  },

  // Reads the first connected pad: sticks every call, buttons as edges (safe to call every frame).
  pollPad() {
    const P = this.pad;
    const pads = this.getPads();
    let gp = null;
    if (pads) for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected !== false) { gp = pads[i]; break; }
    if (!gp) { P.on = false; P.lx = P.ly = P.rx = P.ry = 0; return; }
    P.on = true;
    const ax = gp.axes || [];
    P.lx = ax[0] || 0; P.ly = ax[1] || 0;
    P.rx = ax[2] || 0; P.ry = ax[3] || 0;
    const bs = gp.buttons || [];
    const n = Math.max(bs.length, 16);
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      P.held[i] = !!b && (b.pressed === true || (typeof b === 'number' ? b > 0.5 : b.value > 0.5));
    }
    const edge = (i) => P.held[i] && !P.prev[i];
    let any = Math.hypot(P.lx, P.ly) > 0.3 || Math.hypot(P.rx, P.ry) > 0.3;
    for (let i = 0; i < n; i++) if (edge(i)) any = true;
    if (any && this._en) { this.device = 'pad'; this.touchMode = false; }
    if (this._en) {
      const wh = this.wheel;
      if (wh.open && this.device === 'pad') {
        // either stick points at an item; inner ring for a half push, pins for a full push
        const sx = Math.abs(P.rx) + Math.abs(P.ry) > Math.abs(P.lx) + Math.abs(P.ly) ? P.rx : P.lx;
        const sy = sx === P.rx ? P.ry : P.ly;
        const mag = Math.hypot(sx, sy);
        if (mag > 0.35) {
          const a = Math.atan2(sy, sx), outer = mag > 0.8;
          let best = -1, bd = 9;
          wh.items.forEach((it, i) => {
            if ((it.kind === 'pin') !== outer) return;
            const d = Math.abs(angDiff(a, it.a));
            if (d < bd) { bd = d; best = i; }
          });
          P.sel = best;
          wh.hover = best;
        }
        if (edge(0) && P.sel >= 0) this.pickItem(P.sel);
        else if (edge(1) || edge(3)) this.closeWheel();
      } else {
        const rm = Math.hypot(P.rx, P.ry);
        const aimed = rm > 0.35;
        const ang = Math.atan2(P.ry, P.rx) + (this.flip ? Math.PI : 0), d = clamp(rm, 0, 1);
        if (edge(5) || edge(7)) {
          if (aimed) this.queue(ACT.ATTACK, 0, ang, d); else this.queue(ACT.ATTACK, 1, 0, 1);
        }
        if ((edge(4) || edge(6)) && this.superReady()) {
          if (aimed) this.queue(ACT.SUPER, 0, ang, d); else this.queue(ACT.SUPER, 1, 0, 1);
        }
        if (edge(0)) this.queueGadget();
        if (edge(3)) this.openWheel();
      }
    }
    for (let i = 0; i < n; i++) P.prev[i] = P.held[i];
  },

  // ---------------- actions ----------------
  queue(act, auto, ang, d) {
    if (!this._en) return;
    const q = this.pending;
    if (q.length >= 3) q.shift(); // a burst of presses: keep the latest few
    q.push({ act, auto: auto ? 1 : 0, ang: ang || 0, d: d == null ? 1 : d, tick: this.tick });
  },

  // Gadgets go where the brawler walks (or at the mouse); standing still they auto-aim.
  queueGadget() {
    if (!this.hasGadget()) return;
    const me = this.me;
    if (me && (me.gadLeft <= 0 || me.gadT > 0)) return;
    if (this.device === 'mouse') {
      const a = this.mouseAim(ACT.GADGET);
      if (a) { this.queue(ACT.GADGET, 0, a.ang, a.d); return; }
    }
    const mv = this.moveVec();
    if (mv.m > 0) this.queue(ACT.GADGET, 0, mv.a, 1);
    else this.queue(ACT.GADGET, 1, 0, 1);
  },

  superReady() { return !this.me || !!this.me.supReady; },
  hasGadget() {
    const me = this.me;
    if (!me) return !!(this.data && this.data.gadgets && this.data.gadgets.length);
    return me.kit ? !!me.kit.gad : me.gadget >= 0;
  },
  spec(act) {
    const me = this.me, D = this.data;
    if (me && me.kit) return act === ACT.SUPER ? me.kit.sup : act === ACT.GADGET ? me.kit.gad : me.kit.atk;
    if (!D) return null;
    return act === ACT.SUPER ? D.sup : act === ACT.GADGET ? D.gadgets && D.gadgets[Math.max(0, me ? me.gadget | 0 : 0)] : D.atk;
  },
  rangeOf(act) {
    const s = this.spec(act);
    return s ? s.range || s.dist || 0 : 0;
  },

  // Movement as a world angle and magnitude 0/1 (the original has no walking speed: any push is a run).
  _mv: { a: 0, m: 0 },
  moveVec() {
    const o = this._mv, m = this.mv;
    let x = 0, y = 0;
    if (m.id !== null) {
      const dx = m.x - m.ox, dy = m.y - m.oy;
      if (Math.hypot(dx, dy) > Math.max(6, this.R * 0.12)) { x = dx; y = dy; }
    } else {
      const k = this.keys;
      x = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      y = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      const P = this.pad;
      if (!x && !y && P.on) {
        if (Math.hypot(P.lx, P.ly) > 0.3) { x = P.lx; y = P.ly; }
      }
    }
    if (!x && !y) { o.m = 0; return o; }
    o.a = Math.atan2(y, x) + (this.flip ? Math.PI : 0);
    o.m = 1;
    return o;
  },

  // Current aim indicator: a dragged aim stick, else the pad's right stick.
  get aim() {
    if (!this._en) return null;
    const me = this.me;
    if (me && me.alive === false) return null;
    const o = this._aim;
    let best = null;
    for (const k in this.st) {
      const a = this.st[k];
      if (a.id !== null && a.st === 2 && (best === null || k === 'sup')) best = a;
    }
    if (best) {
      if (best.act === ACT.SUPER && !this.superReady()) return null;
      o.act = best.act; o.ang = wrapAng(this.stickAng(best)); o.d = this.stickD(best);
      return o;
    }
    const P = this.pad;
    if (P.on && this.device === 'pad' && !this.wheel.open && Math.hypot(P.rx, P.ry) > 0.35) {
      const sup = (P.held[4] || P.held[6]) && this.superReady();
      o.act = sup ? ACT.SUPER : ACT.ATTACK;
      o.ang = wrapAng(Math.atan2(P.ry, P.rx) + (this.flip ? Math.PI : 0));
      o.d = clamp(Math.hypot(P.rx, P.ry), 0, 1);
      return o;
    }
    return null;
  },

  // The word for this tick: movement, plus at most one queued action (sent once).
  word() {
    this.pollPad();
    this.tick++;
    if (!this._en) return IN_IDLE;
    const me = this.me;
    const mv = this.moveVec();
    let act = ACT.NONE, auto = 0, aimA = 0, aimD = 0;
    const cur = this.aim;
    if (cur) { aimA = cur.ang; aimD = cur.d; }
    if (me && me.alive === false) this.pending.length = 0;
    while (this.pending.length) {
      const a = this.pending.shift();
      if (this.tick - a.tick > 15) continue; // stale (half a second): drop it
      act = a.act; auto = a.auto; aimA = a.ang; aimD = a.d;
      break;
    }
    return packIn(mv.a, mv.m, aimA, aimD, act, auto);
  },

  // ---------------- quick chat ----------------
  openWheel() {
    if (this._lh !== this.leftHanded) this.layout(this.W, this.H, this.safe, this.dpr);
    this.wheel.open = true;
    this.wheel.hover = -1;
    this.pad.sel = -1;
    if (typeof Sound !== 'undefined') Sound.play('click');
  },
  closeWheel() { this.wheel.open = false; this.wheel.hover = -1; this.pad.sel = -1; },

  wheelItem(x, y) {
    const wh = this.wheel;
    if (!wh.open) return -1;
    const s = this.s;
    let best = -1, bd = 1e9;
    for (let i = 0; i < wh.items.length; i++) {
      const it = wh.items[i];
      let d;
      if (it.kind === 'pin') {
        const hw = Math.max(it.w, 60 * s) / 2 + 6 * s, hh = it.h / 2 + 6 * s;
        if (Math.abs(x - it.x) > hw || Math.abs(y - it.y) > hh) continue;
        d = Math.hypot(x - it.x, y - it.y);
      } else {
        d = Math.hypot(x - it.x, y - it.y);
        if (d > 22 * s) continue;
      }
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  },

  pickItem(i) {
    const it = this.wheel.items[i];
    this.closeWheel();
    if (!it) return;
    if (typeof Sound !== 'undefined') Sound.play('confirm');
    if (it.kind === 'pin') { if (this.onPin) this.onPin(it.i); }
    else if (this.onEmote) this.onEmote(it.i);
  },

  wake() { if (typeof Sound !== 'undefined' && Sound.init) Sound.init(); },

  // ---------------- drawing ----------------
  draw(ctx, me) {
    if (me === undefined) me = this.me;
    if (this._lh !== this.leftHanded) this.layout(this.W, this.H, this.safe, this.dpr);
    this.anim += 1 / 60;
    const op = clamp(this.opacity == null ? 1 : this.opacity, 0.2, 1);
    const dead = !!me && me.alive === false;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const touch = this.touchMode;
    const base = op * (dead ? 0.45 : 1) * (touch ? 1 : 0.75);
    if (touch) this.drawMove(ctx, base);
    this.drawAimBtn(ctx, 'atk', me, base);
    this.drawAimBtn(ctx, 'sup', me, base);
    if (this.hasGadget()) this.drawGadget(ctx, me, base);
    this.drawChat(ctx, op);
    if (!touch) this.drawHints(ctx, base);
    if (this.wheel.open) this.drawWheel(ctx);
    ctx.restore();
  },

  drawMove(ctx, op) {
    const m = this.mv, R = this.R, s = this.s;
    const on = m.id !== null;
    const ox = on ? m.ox : this.home.x, oy = on ? m.oy : this.home.y;
    ctx.globalAlpha = op * (on ? 0.9 : 0.4);
    circle(ctx, ox, oy, R);
    ctx.fillStyle = 'rgba(12,24,48,0.42)';
    ctx.fill();
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = 'rgba(120,200,255,0.75)';
    ctx.stroke();
    let kx = ox, ky = oy;
    if (on) {
      const dx = m.x - ox, dy = m.y - oy, d = Math.hypot(dx, dy), k = Math.min(d, R * 0.85);
      if (d > 0) { kx = ox + (dx / d) * k; ky = oy + (dy / d) * k; }
      // direction wedge on the rim
      if (d > Math.max(6, R * 0.12)) {
        const a = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.arc(ox, oy, R, a - 0.45, a + 0.45);
        ctx.lineWidth = 5 * s;
        ctx.strokeStyle = 'rgba(160,230,255,0.95)';
        ctx.stroke();
      }
    }
    ctx.globalAlpha = op * (on ? 0.95 : 0.55);
    circle(ctx, kx, ky, R * 0.42);
    ctx.fillStyle = '#5fb6ff';
    ctx.fill();
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = '#e6f6ff';
    ctx.stroke();
    circle(ctx, kx - R * 0.1, ky - R * 0.12, R * 0.16);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  },

  // Attack and super: a button at rest, a joystick while held.
  drawAimBtn(ctx, k, me, op) {
    const b = this.btn[k], a = this.st[k], s = this.s, R = this.R;
    const sup = k === 'sup';
    const ready = sup ? !!(me ? me.supReady : false) : true;
    const charge = sup ? (me ? clamp(me.sup || 0, 0, 1) : 0) : 1;
    const held = a.id !== null;
    const col = sup ? '#ffc21a' : '#ff5a3c';
    const pulse = 0.5 + 0.5 * Math.sin(this.anim * 6);
    // super-ready glow
    if (sup && ready) {
      ctx.globalAlpha = op * (0.35 + 0.3 * pulse);
      circle(ctx, b.x, b.y, b.r * (1.3 + 0.08 * pulse));
      ctx.fillStyle = 'rgba(255,214,60,0.55)';
      ctx.fill();
    }
    if (held) {
      // the drag area
      ctx.globalAlpha = op * 0.85;
      circle(ctx, b.x, b.y, R);
      ctx.fillStyle = 'rgba(20,10,10,0.38)';
      ctx.fill();
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = a.st === 3 ? 'rgba(255,80,80,0.9)' : sup ? 'rgba(255,220,90,0.85)' : 'rgba(255,140,120,0.85)';
      ctx.stroke();
      const dx = a.x - a.ox, dy = a.y - a.oy, d = Math.hypot(dx, dy), m = Math.min(d, R);
      const kx = d > 0 ? b.x + (dx / d) * m : b.x, ky = d > 0 ? b.y + (dy / d) * m : b.y;
      ctx.globalAlpha = op;
      circle(ctx, kx, ky, b.r * 0.62);
      ctx.fillStyle = a.st === 3 ? '#6b2a2a' : col;
      ctx.fill();
      ctx.lineWidth = 2.5 * s;
      ctx.strokeStyle = '#fff6e0';
      ctx.stroke();
      if (a.st === 3) {
        // back in the centre: releasing here cancels
        const c = b.r * 0.24;
        ctx.lineWidth = 4 * s;
        ctx.strokeStyle = '#ff6a6a';
        ctx.beginPath();
        ctx.moveTo(kx - c, ky - c); ctx.lineTo(kx + c, ky + c);
        ctx.moveTo(kx + c, ky - c); ctx.lineTo(kx - c, ky + c);
        ctx.stroke();
        outlineText(ctx, 'CANCEL', b.x, b.y - R - 10 * s, 12 * s, '#ff8a8a');
      } else this.icon(ctx, k, kx, ky, b.r * 0.62, true);
      return;
    }
    // resting button
    ctx.globalAlpha = op * (ready ? 0.95 : 0.7);
    circle(ctx, b.x, b.y, b.r);
    ctx.fillStyle = ready ? (sup ? 'rgba(255,194,26,0.9)' : 'rgba(240,64,48,0.66)') : 'rgba(40,40,48,0.6)';
    ctx.fill();
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = ready ? (sup ? '#fff1a8' : 'rgba(255,220,210,0.9)') : 'rgba(200,200,210,0.5)';
    ctx.stroke();
    if (sup && !ready) {
      // charge ring
      ctx.globalAlpha = op;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r - 1.5 * s, -Math.PI / 2, -Math.PI / 2 + TAU * charge);
      ctx.lineWidth = 5 * s;
      ctx.strokeStyle = col;
      ctx.stroke();
    }
    ctx.globalAlpha = op * (ready ? 1 : 0.55);
    this.icon(ctx, k, b.x, b.y, b.r, ready);
  },

  drawGadget(ctx, me, op) {
    const b = this.btn.gad, s = this.s;
    const left = me ? me.gadLeft | 0 : 0;
    const cd = me ? me.gadT || 0 : 0;
    const spec = this.spec(ACT.GADGET);
    const cdT = (spec && spec.cd) || 5;
    const ok = !!me && left > 0 && cd <= 0;
    ctx.globalAlpha = op * (ok ? 0.95 : 0.6);
    circle(ctx, b.x, b.y, b.r);
    ctx.fillStyle = ok ? (this.gadDown ? '#9dff8a' : '#3fc43a') : 'rgba(50,56,52,0.75)';
    ctx.fill();
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = ok ? '#d8ffd0' : 'rgba(190,200,190,0.5)';
    ctx.stroke();
    if (cd > 0 && left > 0) {
      ctx.globalAlpha = op * 0.6;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(cd / cdT, 0, 1));
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();
    }
    ctx.globalAlpha = op * (ok ? 1 : 0.5);
    this.icon(ctx, 'gad', b.x, b.y, b.r, ok);
    // uses left: small pips under the button
    ctx.globalAlpha = op;
    for (let i = 0; i < 3; i++) {
      const px = b.x + (i - 1) * 8 * s, py = b.y + b.r + 7 * s;
      circle(ctx, px, py, 3 * s);
      ctx.fillStyle = i < left ? '#7dff6a' : 'rgba(30,30,30,0.7)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
    }
  },

  drawChat(ctx, op) {
    const b = this.btn.chat, s = this.s;
    ctx.globalAlpha = op * (this.wheel.open ? 1 : 0.8);
    circle(ctx, b.x, b.y, b.r);
    ctx.fillStyle = this.wheel.open ? '#ffffff' : 'rgba(20,28,44,0.6)';
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke();
    this.icon(ctx, 'chat', b.x, b.y, b.r, true);
  },

  // Key / button names under the buttons for keyboard and gamepad players.
  drawHints(ctx, op) {
    const pad = this.device === 'pad', s = this.s;
    const lab = pad ? { atk: 'RT', sup: 'LT', gad: 'A', chat: 'Y' } : { atk: 'L-CLICK', sup: 'R-CLICK / SPACE', gad: 'Q', chat: 'T' };
    ctx.globalAlpha = Math.min(1, op + 0.2);
    ctx.font = `800 ${Math.round(9 * s)}px system-ui,sans-serif`;
    for (const k in lab) {
      if (k === 'gad' && !this.hasGadget()) continue;
      const b = this.btn[k];
      const y = k === 'gad' ? b.y - b.r - 7 * s : b.y + b.r + (k === 'chat' ? 9 : 11) * s;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(lab[k], b.x, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(lab[k], b.x, y);
    }
  },

  drawWheel(ctx) {
    const wh = this.wheel, s = this.s;
    ctx.globalAlpha = 0.85;
    circle(ctx, wh.x, wh.y, wh.R + 18 * s);
    ctx.fillStyle = 'rgba(8,14,30,0.72)';
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    // close cross in the middle
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = '#fff';
    const c = 6 * s;
    ctx.beginPath();
    ctx.moveTo(wh.x - c, wh.y - c); ctx.lineTo(wh.x + c, wh.y + c);
    ctx.moveTo(wh.x + c, wh.y - c); ctx.lineTo(wh.x - c, wh.y + c);
    ctx.stroke();
    ctx.font = `800 ${Math.round(12 * s)}px system-ui,sans-serif`;
    for (let i = 0; i < wh.items.length; i++) {
      const it = wh.items[i], hot = wh.hover === i;
      ctx.globalAlpha = 1;
      if (it.kind === 'pin') {
        const txt = PINS[it.i];
        it.w = ctx.measureText(txt).width + 18 * s;
        const w = Math.max(it.w, 60 * s), h = it.h;
        roundRect(ctx, it.x - w / 2, it.y - h / 2, w, h, h / 2);
        ctx.fillStyle = hot ? '#ffe46b' : '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2 * s;
        ctx.strokeStyle = hot ? '#b07a00' : 'rgba(0,0,0,0.5)';
        ctx.stroke();
        ctx.fillStyle = '#1b2236';
        ctx.fillText(txt, it.x, it.y + 0.5);
        if (this.device === 'mouse') {
          ctx.font = `800 ${Math.round(8 * s)}px system-ui,sans-serif`;
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText(String(it.i + 1), it.x - w / 2 - 7 * s, it.y);
          ctx.font = `800 ${Math.round(12 * s)}px system-ui,sans-serif`;
        }
      } else {
        const r = (hot ? 19 : 16) * s;
        this.emoteIcon(ctx, EMOTES[it.i], it.x, it.y, r);
        if (hot) {
          circle(ctx, it.x, it.y, r + 2 * s);
          ctx.lineWidth = 2.5 * s;
          ctx.strokeStyle = '#ffe46b';
          ctx.stroke();
        }
      }
    }
  },

  // Small face icons for the emote ring (drawn, not text, so they read at a glance).
  emoteIcon(ctx, key, x, y, r) {
    const face = { gg: '#ffd23f', happy: '#ffd23f', angry: '#ff6a4a', sad: '#7fb8ff', thumbs: '#ffd23f' }[key] || '#ffd23f';
    circle(ctx, x, y, r);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();
    ctx.fillStyle = '#2a1a10';
    ctx.strokeStyle = '#2a1a10';
    const ex = r * 0.33, ey = -r * 0.18, er = r * 0.11;
    if (key === 'gg') {
      ctx.font = `900 ${Math.round(r * 0.95)}px system-ui,sans-serif`;
      ctx.fillText('GG', x, y + r * 0.05);
      return;
    }
    if (key === 'thumbs') {
      // a fist with the thumb up
      ctx.fillStyle = '#fff3d6';
      roundRect(ctx, x - r * 0.42, y - r * 0.05, r * 0.7, r * 0.55, r * 0.15);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, x - r * 0.3, y - r * 0.62, r * 0.24, r * 0.62, r * 0.12);
      ctx.fill();
      ctx.stroke();
      return;
    }
    circle(ctx, x - ex, y + ey, er); ctx.fill();
    circle(ctx, x + ex, y + ey, er); ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.beginPath();
    if (key === 'happy') ctx.arc(x, y + r * 0.08, r * 0.42, 0.2, Math.PI - 0.2);
    else ctx.arc(x, y + r * 0.62, r * 0.36, Math.PI + 0.35, -0.35);
    ctx.stroke();
    if (key === 'angry') {
      ctx.beginPath();
      ctx.moveTo(x - ex - r * 0.2, y + ey - r * 0.28); ctx.lineTo(x - ex + r * 0.16, y + ey - r * 0.12);
      ctx.moveTo(x + ex + r * 0.2, y + ey - r * 0.28); ctx.lineTo(x + ex - r * 0.16, y + ey - r * 0.12);
      ctx.stroke();
    } else if (key === 'sad') {
      ctx.fillStyle = '#e8f6ff';
      ellipse(ctx, x + ex, y + ey + r * 0.3, r * 0.08, r * 0.14);
      ctx.fill();
    }
  },

  // Button pictograms: crosshair (attack), skull (super), bolt (gadget), speech bubble (chat).
  icon(ctx, k, x, y, r, lit) {
    const lw = Math.max(1.5, r * 0.11);
    ctx.lineWidth = lw;
    if (k === 'atk') {
      ctx.strokeStyle = '#fff';
      circle(ctx, x, y, r * 0.36);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.moveTo(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2);
        ctx.lineTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
      }
      ctx.stroke();
    } else if (k === 'sup') {
      const c = lit ? '#3a2400' : '#d8d8d8';
      ctx.fillStyle = c;
      ellipse(ctx, x, y - r * 0.08, r * 0.42, r * 0.38);
      ctx.fill();
      roundRect(ctx, x - r * 0.24, y + r * 0.12, r * 0.48, r * 0.3, r * 0.08);
      ctx.fill();
      ctx.fillStyle = lit ? '#ffc21a' : 'rgba(40,40,48,0.9)';
      circle(ctx, x - r * 0.16, y - r * 0.08, r * 0.11); ctx.fill();
      circle(ctx, x + r * 0.16, y - r * 0.08, r * 0.11); ctx.fill();
      ctx.fillRect(x - r * 0.03, y + r * 0.2, r * 0.06, r * 0.2);
    } else if (k === 'gad') {
      ctx.fillStyle = lit ? '#ffffff' : '#c8c8c8';
      ctx.beginPath();
      ctx.moveTo(x + r * 0.12, y - r * 0.6);
      ctx.lineTo(x - r * 0.32, y + r * 0.08);
      ctx.lineTo(x - r * 0.02, y + r * 0.08);
      ctx.lineTo(x - r * 0.14, y + r * 0.6);
      ctx.lineTo(x + r * 0.34, y - r * 0.12);
      ctx.lineTo(x + r * 0.04, y - r * 0.12);
      ctx.closePath();
      ctx.fill();
    } else if (k === 'chat') {
      const open = this.wheel.open;
      ctx.fillStyle = open ? '#1b2236' : '#ffffff';
      roundRect(ctx, x - r * 0.55, y - r * 0.42, r * 1.1, r * 0.72, r * 0.25);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.25, y + r * 0.25);
      ctx.lineTo(x - r * 0.38, y + r * 0.55);
      ctx.lineTo(x + r * 0.02, y + r * 0.27);
      ctx.fill();
      ctx.fillStyle = open ? '#ffffff' : '#1b2236';
      for (let i = -1; i <= 1; i++) { circle(ctx, x + i * r * 0.27, y - r * 0.06, r * 0.08); ctx.fill(); }
    }
  },
};
