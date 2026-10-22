// Input and audio test: builds a standalone page from 01-util, 02-const (and 03-brawlers when it
// loads), 11-input and 21-audio, then drives Input with synthetic multi-touch pointer events, the
// real keyboard and mouse, and a stubbed gamepad, checking the input words it produces:
//   tap attack -> one ATTACK word with auto-aim, nothing on the next tick; drag-aim + release ->
//   manual angle; dragging back to the centre cancels; flip turns angles by PI; super only while
//   charged; move + aim with two thumbs; one action per tick; gadget greyed when out of uses;
//   quick-chat wheel; left-handed layout; keyboard + mouse; gamepad mapping.
// Audio: renders every Sound recipe and each music track (at low and high intensity) offline and
// checks they make sound without errors, then plays a little live after a user gesture.
// Saves screenshots of Input.draw at 844x390 (dpr 2).
// Usage: NODE_PATH=$(npm root -g) node blast-squad/tools/input-test.cjs [out-dir]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.cjs');

const JS = path.join(__dirname, '..', 'src', 'js');
const outDir = process.argv[2] || path.join(require('node:os').tmpdir(), 'bs-input');
fs.mkdirSync(outDir, { recursive: true });

const files = ['01-util.js', '02-const.js'];
try {
  const a = load({ files: ['01-util.js', '02-const.js', '03-brawlers.js'], names: ['BRAWLERS'], allowRandom: true });
  if (a.BRAWLERS && a.BRAWLERS.nova) files.push('03-brawlers.js');
} catch (e) {
  console.log('  (skipping 03-brawlers.js: ' + e.message.split('\n')[0] + ')');
}
files.push('11-input.js', '21-audio.js');
console.log('modules: ' + files.join(' '));
const code = files.map((f) => `// ===== ${f} =====\n` + fs.readFileSync(path.join(JS, f), 'utf8')).join('\n');

// every recipe name in Sound.recipe (the test renders each one)
const audioSrc = fs.readFileSync(path.join(JS, '21-audio.js'), 'utf8');
const recBody = audioSrc.slice(audioSrc.indexOf('recipe(name, o, out)'), audioSrc.indexOf('// ---------------- game wiring'));
const RECIPES = [...recBody.matchAll(/case '([A-Za-z]+)':/g)].map((m) => m[1]);

function pageMain() {
  const cv = document.getElementById('c');
  const DPR = window.devicePixelRatio || 1;
  cv.width = 844 * DPR;
  cv.height = 390 * DPR;
  const ctx = cv.getContext('2d');
  const D = typeof BRAWLERS !== 'undefined' ? BRAWLERS.nova
    : { atk: { t: 'shot', range: 7.67 }, sup: { t: 'shot', range: 7.67 }, gadgets: [{ t: 'dash', dist: 2.5, cd: 5 }] };
  const me = { id: 7, kind: 1, slot: 0, team: 0, bk: 'nova', x: 10, y: 8, alive: true, hp: 3600, maxHp: 3600, sup: 0.4, supReady: false, gadget: 0, gadLeft: 3, gadT: 0 };
  Input.init(cv);
  Input.layout(844, 390, { l: 0, r: 0, t: 0, b: 0 }, DPR);
  Input.enabled = true;
  Input.setLocal(me, D);
  // the world is 24 CSS px per tile with no camera offset: the brawler at (10, 8) sits at (240, 192)
  Input.setScreenToWorld((sx, sy) => ({ x: sx / 24, y: sy / 24 }));
  const pins = [], emotes = [];
  Input.onPin = (i) => pins.push(i);
  Input.onEmote = (i) => emotes.push(i);
  const ev = (type, id, x, y, pt, button) => cv.dispatchEvent(new PointerEvent(type, {
    pointerId: id, clientX: x, clientY: y, pointerType: pt || 'touch', isPrimary: id === 1,
    bubbles: true, cancelable: true, button: button || 0, buttons: type === 'pointerup' ? 0 : 1,
  }));
  let pad = null;
  try { navigator.getGamepads = () => (pad ? [pad] : []); } catch (e) { Input.getPads = () => (pad ? [pad] : []); }
  if (navigator.getGamepads && navigator.getGamepads().length !== 0) Input.getPads = () => (pad ? [pad] : []);

  // a stand-in battlefield so the controls are judged against something game-like
  function backdrop() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (let y = 0; y < 390; y += 24) {
      for (let x = 0; x < 844; x += 24) {
        ctx.fillStyle = ((x + y) / 24) % 2 ? '#5aa04a' : '#64ac52';
        ctx.fillRect(x, y, 24, 24);
      }
    }
    ctx.fillStyle = '#c98a4a';
    ctx.fillRect(360, 96, 120, 48);
    ctx.fillStyle = '#2f7a2f';
    ctx.fillRect(96, 48, 96, 72);
    ctx.fillStyle = '#3d9bff';
    circle(ctx, 422, 230, 12);
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  window.__T = {
    me, pins, emotes,
    btn: (k) => ({ x: Input.btn[k].x, y: Input.btn[k].y, r: Input.btn[k].r }),
    R: () => Input.R,
    home: () => ({ x: Input.home.x, y: Input.home.y }),
    wheel: () => ({ open: Input.wheel.open, items: Input.wheel.items.map((it) => ({ kind: it.kind, i: it.i, x: it.x, y: it.y })) }),
    down: (id, x, y, pt, b) => ev('pointerdown', id, x, y, pt, b),
    move: (id, x, y, pt) => ev('pointermove', id, x, y, pt),
    up: (id, x, y, pt, b) => ev('pointerup', id, x, y, pt, b),
    cancel: (id, x, y) => ev('pointercancel', id, x, y, 'touch'),
    word: () => {
      const w = Input.word();
      const o = unpackIn(w, {});
      o.w = w;
      return o;
    },
    aim: () => (Input.aim ? { act: Input.aim.act, ang: Input.aim.ang, d: Input.aim.d } : null),
    set: (o) => { Object.assign(me, o); return true; },
    setFlip: (f) => { Input.setFlip(f); return true; },
    setLH: (v) => { Input.leftHanded = v; Input.layout(844, 390, { l: 0, r: 0, t: 0, b: 0 }, DPR); return true; },
    reset: () => { Input.reset(); pins.length = 0; emotes.length = 0; return true; },
    enable: (v) => { Input.enabled = v; return true; },
    state: () => ({ device: Input.device, touchMode: Input.touchMode, pending: Input.pending.length, ptr: Input.ptr.size }),
    padSet(axes, pressed) {
      if (!axes) { pad = null; return true; }
      const buttons = [];
      for (let i = 0; i < 17; i++) { const p = pressed.indexOf(i) >= 0; buttons.push({ pressed: p, value: p ? 1 : 0 }); }
      pad = { id: 'stub', index: 0, connected: true, mapping: 'standard', axes: axes.slice(), buttons };
      return true;
    },
    draw(opts) {
      backdrop();
      Input.draw(ctx, opts && opts.noMe ? null : me);
      return true;
    },
    touchMode(v) { Input.touchMode = v; Input.device = v ? 'touch' : 'mouse'; return true; },
    setDevice(d) { Input.device = d; Input.touchMode = d === 'touch'; return true; },
    openWheel() { Input.openWheel(); return true; },
  };

  // ---------------- audio ----------------
  const rms = (buf) => {
    const d = buf.getChannelData(0);
    let s = 0, pk = 0, bad = 0;
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) { bad++; continue; }
      s += v * v;
      if (Math.abs(v) > pk) pk = Math.abs(v);
    }
    return { rms: Math.sqrt(s / d.length), peak: pk, bad };
  };
  // Points Sound at an OfflineAudioContext for one render, then restores it.
  async function offline(seconds, fn) {
    const off = new OfflineAudioContext(1, Math.ceil(22050 * seconds), 22050);
    const keep = { ctx: Sound.ctx, sfx: Sound.sfx, mus: Sound.mus, noiseBuf: Sound.noiseBuf };
    const nb = off.createBuffer(1, 22050, 22050);
    const nd = nb.getChannelData(0);
    let r = 12345;
    for (let i = 0; i < nd.length; i++) { r = (r * 1103515245 + 12345) >>> 0; nd[i] = (r / 4294967296) * 2 - 1; }
    const out = off.createGain();
    out.connect(off.destination);
    Sound.ctx = off; Sound.sfx = out; Sound.mus = out; Sound.noiseBuf = nb;
    let err = null;
    try { fn(off, out); } catch (e) { err = e.message; }
    Object.assign(Sound, keep);
    if (err) return { err };
    const buf = await off.startRendering();
    return rms(buf);
  }
  window.__A = {
    async recipes(names) {
      const res = {};
      for (const n of names) {
        res[n] = await offline(2.6, (off, out) => Sound.recipe(n, { n: 3 }, out));
      }
      return res;
    },
    async music(name, intensity) {
      const tr = Music.TRACKS[name];
      const keep = { cur: Music.cur, intensity: Music.intensity };
      Music.cur = Music.compile(tr);
      Music.intensity = intensity;
      const steps = Music.cur.bars * 16;
      const sd = Music.stepDur();
      const r = await offline(steps * sd + 1.5, () => {
        for (let s = 0; s < steps; s++) Music.playStep(s, s * sd, sd);
      });
      Music.cur = keep.cur; Music.intensity = keep.intensity;
      r.len = steps * sd;
      return r;
    },
    startLive() {
      Music.play('battle');
      Music.intensity = 0.8;
      Sound.play('superReady');
      Sound.play('gem', { n: 5 });
      Sound.ear(10, 8, false);
      Sound.play('boom', { x: 14, y: 8 });
      return true;
    },
    stopLive() { Music.play('menu'); Music.stop(); return true; },
    live() {
      return { ctx: !!Sound.ctx, state: Sound.ctx ? Sound.ctx.state : 'none', step: Music.step, name: Music.name, voices: Sound.voices };
    },
  };
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block;width:844px;height:390px;touch-action:none}</style></head>
<body><canvas id="c"></canvas><script>
window.__errors = [];
window.onerror = (m, s, l) => { window.__errors.push(m + ' @' + l); };
(function () {
${code}
(${pageMain.toString()})();
})();
</script></body></html>`;
const pagePath = path.join(outDir, 'input-test.html');
fs.writeFileSync(pagePath, html);

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const ok = (cond, msg, extra) => {
    if (!cond) errors.push('FAILED: ' + msg + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''));
    else console.log('ok -', msg);
  };
  const E = (fn, arg) => page.evaluate(fn, arg);
  const word = () => E(() => window.__T.word());
  const near = (a, b, tol) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < (tol || 0.02);
  const tap = async (id, x, y) => { await E(([i, a, b]) => { window.__T.down(i, a, b); window.__T.up(i, a, b); }, [id, x, y]); };
  const ACT = { NONE: 0, ATTACK: 1, SUPER: 2, GADGET: 3 };

  await page.goto('file://' + pagePath);
  const started = await E(() => !!window.__T);
  if (!started) {
    console.log('page did not start: ' + JSON.stringify(await E(() => window.__errors)));
    process.exit(1);
  }
  const atk = await E(() => window.__T.btn('atk'));
  const sup = await E(() => window.__T.btn('sup'));
  const gad = await E(() => window.__T.btn('gad'));
  const chat = await E(() => window.__T.btn('chat'));
  const R = await E(() => window.__T.R());
  console.log(`layout 844x390: attack (${atk.x.toFixed(0)},${atk.y.toFixed(0)}) r${atk.r.toFixed(0)}, super (${sup.x.toFixed(0)},${sup.y.toFixed(0)}) r${sup.r.toFixed(0)}, gadget (${gad.x.toFixed(0)},${gad.y.toFixed(0)}), chat (${chat.x.toFixed(0)},${chat.y.toFixed(0)}), stick R ${R.toFixed(0)}`);
  ok(atk.x > 844 * 0.75 && atk.y > 390 * 0.6 && atk.y + R < 390, 'attack joystick sits at the bottom right and its drag area fits the screen');
  ok(sup.x < atk.x && sup.y <= atk.y, 'super button is left of / above attack');

  // ---- 1. tap attack: one ATTACK word with auto-aim, then nothing ----
  await word();
  await tap(1, atk.x + 3, atk.y - 2);
  let w = await word();
  ok(w.act === ACT.ATTACK && w.auto === 1, 'tap on attack -> ACT.ATTACK with auto=1', w);
  w = await word();
  ok(w.act === ACT.NONE, 'the action is sent once (next tick has no action)', w);

  // ---- 2. drag-aim then release: manual angle and distance ----
  await E(([x, y]) => { window.__T.down(2, x, y); window.__T.move(2, x + 20, y - 20); window.__T.move(2, x + 30, y - 30); }, [atk.x, atk.y]);
  let a = await E(() => window.__T.aim());
  ok(a && a.act === ACT.ATTACK && near(a.ang, -Math.PI / 4), 'dragging the attack stick shows a manual aim (Input.aim) at the drag angle', a);
  ok(a && Math.abs(a.d - Math.hypot(30, 30) / R) < 0.02, 'aim distance is the drag share of the stick radius', a);
  w = await word();
  ok(w.act === ACT.NONE, 'no action while still aiming', w);
  await E(([x, y]) => window.__T.up(2, x + 30, y - 30), [atk.x, atk.y]);
  w = await word();
  ok(w.act === ACT.ATTACK && w.auto === 0 && near(w.aimA, -Math.PI / 4, 0.01), 'release fires a manual attack at the aimed angle', w);
  ok(Math.abs(w.aimD - Math.hypot(30, 30) / R) < 0.03, 'released word carries the aim distance', w);
  ok((await E(() => window.__T.aim())) === null, 'Input.aim is null after release');

  // ---- 3. dragging back into the centre cancels ----
  await E(([x, y]) => { window.__T.down(3, x, y); window.__T.move(3, x - 45, y); window.__T.move(3, x - 2, y + 1); window.__T.up(3, x - 2, y + 1); }, [atk.x, atk.y]);
  w = await word();
  ok(w.act === ACT.NONE, 'drag out and back to the centre, then release -> cancelled (no action)', w);
  await E(([x, y]) => { window.__T.down(3, x, y); window.__T.move(3, x - 45, y); window.__T.cancel(3, x - 45, y); }, [atk.x, atk.y]);
  w = await word();
  ok(w.act === ACT.NONE, 'pointercancel never fires', w);

  // ---- 4. flip: angles turn by PI (screen -> world for team 1) ----
  await E(() => window.__T.setFlip(true));
  await E(([x, y]) => { window.__T.down(4, x, y); window.__T.move(4, x + 50, y); }, [atk.x, atk.y]);
  a = await E(() => window.__T.aim());
  ok(a && near(a.ang, Math.PI), 'flipped: aim indicator angle is the world angle (screen right = world left)', a);
  await E(([x, y]) => window.__T.up(4, x + 50, y), [atk.x, atk.y]);
  w = await word();
  ok(w.act === ACT.ATTACK && near(w.aimA, Math.PI, 0.01), 'flipped: released aim angle rotated by PI', w);
  const home = await E(() => window.__T.home());
  await E(([x, y]) => { window.__T.down(5, x, y); window.__T.move(5, x, y + 40); }, [home.x, home.y]);
  w = await word();
  ok(w.mvM === 1 && near(w.mvA, -Math.PI / 2, 0.03), 'flipped: moving down the screen moves up the world', w);
  await E(([x, y]) => window.__T.up(5, x, y + 40), [home.x, home.y]);
  await E(() => window.__T.setFlip(false));
  w = await word();
  ok(w.mvM === 0, 'releasing the move stick stops', w);

  // ---- 5. super only while charged ----
  await E(() => window.__T.set({ supReady: false, sup: 0.6 }));
  await tap(6, sup.x, sup.y);
  await E(([x, y]) => { window.__T.down(7, x, y); window.__T.move(7, x, y - 50); }, [sup.x, sup.y]);
  a = await E(() => window.__T.aim());
  await E(([x, y]) => window.__T.up(7, x, y - 50), [sup.x, sup.y]);
  w = await word();
  ok(w.act === ACT.NONE && a === null, 'super does nothing while not charged (tap or drag)', { w, a });
  await E(() => window.__T.set({ supReady: true, sup: 1 }));
  await tap(6, sup.x + 2, sup.y);
  w = await word();
  ok(w.act === ACT.SUPER && w.auto === 1, 'charged: tap on super -> ACT.SUPER auto', w);
  await E(([x, y]) => { window.__T.down(7, x, y); window.__T.move(7, x, y - 50); }, [sup.x, sup.y]);
  a = await E(() => window.__T.aim());
  ok(a && a.act === ACT.SUPER && near(a.ang, -Math.PI / 2), 'charged: dragging super shows a super aim', a);
  await E(([x, y]) => window.__T.up(7, x, y - 50), [sup.x, sup.y]);
  w = await word();
  ok(w.act === ACT.SUPER && w.auto === 0 && near(w.aimA, -Math.PI / 2, 0.01), 'charged: super released at the aimed angle', w);
  await E(() => window.__T.set({ supReady: false, sup: 0 }));

  // ---- 6. two thumbs: move + aim at once ----
  await E(([hx, hy, ax, ay]) => {
    window.__T.down(11, hx, hy);
    window.__T.move(11, hx + 45, hy);
    window.__T.down(12, ax, ay);
    window.__T.move(12, ax, ay - 50);
  }, [home.x, home.y, atk.x, atk.y]);
  w = await word();
  a = await E(() => window.__T.aim());
  ok(w.mvM === 1 && near(w.mvA, 0, 0.03) && a && a.act === ACT.ATTACK && near(a.ang, -Math.PI / 2), 'move stick and attack stick work together', { w, a });
  await E(([ax, ay]) => window.__T.up(12, ax, ay - 50), [atk.x, atk.y]);
  w = await word();
  ok(w.act === ACT.ATTACK && w.auto === 0 && near(w.aimA, -Math.PI / 2, 0.01) && w.mvM === 1 && near(w.mvA, 0, 0.03), 'firing while moving keeps the movement', w);
  await E(([hx, hy]) => window.__T.move(11, hx, hy - 45), [home.x, home.y]);
  w = await word();
  ok(w.mvM === 1 && near(w.mvA, -Math.PI / 2, 0.05), 'move stick follows the thumb', w);
  await E(([hx, hy]) => window.__T.up(11, hx, hy - 45), [home.x, home.y]);
  w = await word();
  ok(w.mvM === 0 && (await E(() => window.__T.state())).ptr === 0, 'all pointers released', w);
  // a touch in the empty right side is ignored; a second touch in the move zone doesn't steal the stick
  await E(() => { window.__T.down(13, 150, 300); window.__T.move(13, 200, 300); window.__T.down(14, 80, 200); window.__T.move(14, 80, 150); });
  w = await word();
  ok(w.mvM === 1 && near(w.mvA, 0, 0.03), 'the move stick belongs to the first thumb', w);
  await E(() => { window.__T.up(13, 200, 300); window.__T.up(14, 80, 150); });
  await word();

  // ---- 7. one action per tick ----
  await tap(15, atk.x, atk.y);
  await tap(16, gad.x, gad.y);
  const w1 = await word(), w2 = await word(), w3 = await word();
  ok(w1.act === ACT.ATTACK && w2.act === ACT.GADGET && w3.act === ACT.NONE, 'two presses in one tick go out on two ticks, once each', [w1.act, w2.act, w3.act]);

  // ---- 8. gadget greyed when out of uses or cooling down ----
  await E(() => window.__T.set({ gadLeft: 0 }));
  await tap(17, gad.x, gad.y);
  w = await word();
  ok(w.act === ACT.NONE, 'gadget with no uses left does nothing', w);
  await E(() => window.__T.set({ gadLeft: 2, gadT: 3 }));
  await tap(17, gad.x, gad.y);
  w = await word();
  ok(w.act === ACT.NONE, 'gadget on cooldown does nothing', w);
  await E(() => window.__T.set({ gadLeft: 2, gadT: 0 }));
  await E(([hx, hy, gx, gy]) => { window.__T.down(18, hx, hy); window.__T.move(18, hx - 40, hy); window.__T.down(19, gx, gy); window.__T.up(19, gx, gy); }, [home.x, home.y, gad.x, gad.y]);
  w = await word();
  ok(w.act === ACT.GADGET && w.auto === 0 && near(w.aimA, Math.PI, 0.03), 'gadget while walking goes the way you walk', w);
  await E(([hx, hy]) => window.__T.up(18, hx - 40, hy), [home.x, home.y]);
  await word();

  // ---- 9. quick chat ----
  await tap(20, chat.x, chat.y);
  let wh = await E(() => window.__T.wheel());
  ok(wh.open, 'chat button opens the wheel');
  const pin3 = wh.items.find((it) => it.kind === 'pin' && it.i === 3);
  await tap(21, pin3.x, pin3.y);
  let pins = await E(() => window.__T.pins.slice());
  wh = await E(() => window.__T.wheel());
  ok(pins.length === 1 && pins[0] === 3 && !wh.open, 'tapping a pin reports Input.onPin(3) and closes the wheel', pins);
  await E(([cx, cy]) => window.__T.down(22, cx, cy), [chat.x, chat.y]);
  wh = await E(() => window.__T.wheel());
  const emo1 = wh.items.find((it) => it.kind === 'emote' && it.i === 1);
  await E(([x, y]) => { window.__T.move(22, x, y); window.__T.up(22, x, y); }, [emo1.x, emo1.y]);
  let emotes = await E(() => window.__T.emotes.slice());
  ok(emotes.length === 1 && emotes[0] === 1, 'slide from the chat button onto an emote and let go -> Input.onEmote(1)', emotes);
  w = await word();
  ok(w.act === ACT.NONE, 'quick chat never produces an action', w);
  await tap(23, chat.x, chat.y);
  await tap(24, 120, 330); // outside the wheel: closes it and still plays
  wh = await E(() => window.__T.wheel());
  ok(!wh.open, 'a touch outside the wheel closes it');
  await E(() => window.__T.up(24, 120, 330));
  await E(() => window.__T.reset());

  // ---- 10. left-handed layout ----
  await E(() => window.__T.setLH(true));
  const atkL = await E(() => window.__T.btn('atk'));
  const homeL = await E(() => window.__T.home());
  ok(atkL.x < 844 / 2 && homeL.x > 844 / 2, 'left-handed: attack on the left, move stick on the right');
  await tap(25, atkL.x, atkL.y);
  w = await word();
  ok(w.act === ACT.ATTACK, 'left-handed: tap on the mirrored attack button', w);
  await E(([x, y]) => { window.__T.down(26, x, y); window.__T.move(26, x + 40, y); }, [homeL.x, homeL.y]);
  w = await word();
  ok(w.mvM === 1 && near(w.mvA, 0, 0.03), 'left-handed: move stick on the right half', w);
  await E(([x, y]) => window.__T.up(26, x + 40, y), [homeL.x, homeL.y]);
  await E(() => window.__T.setLH(false));
  await word();

  // ---- 11. keyboard ----
  await page.keyboard.down('KeyD');
  w = await word();
  ok(w.mvM === 1 && near(w.mvA, 0, 0.03), 'D moves right', w);
  await page.keyboard.down('KeyW');
  w = await word();
  ok(w.mvM === 1 && near(w.mvA, -Math.PI / 4, 0.03), 'W+D moves up-right', w);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  await page.keyboard.down('ArrowLeft');
  w = await word();
  ok(w.mvM === 1 && near(w.mvA, Math.PI, 0.03), 'arrow keys move', w);
  await page.keyboard.up('ArrowLeft');
  w = await word();
  ok(w.mvM === 0, 'keys released: stand still', w);
  await page.keyboard.press('KeyF');
  w = await word();
  ok(w.act === ACT.ATTACK && w.auto === 1, 'F = auto-aim attack', w);
  await page.keyboard.press('Space');
  w = await word();
  ok(w.act === ACT.NONE, 'Space does nothing while the super is not charged', w);
  await E(() => window.__T.set({ supReady: true, sup: 1 }));
  await page.keyboard.press('Space');
  w = await word();
  ok(w.act === ACT.SUPER, 'Space = super when charged', w);
  await E(() => window.__T.set({ supReady: false, sup: 0 }));
  await page.keyboard.press('KeyQ');
  w = await word();
  ok(w.act === ACT.GADGET, 'Q = gadget', w);
  await page.keyboard.press('KeyT');
  await page.keyboard.press('Digit5');
  await page.keyboard.press('KeyT');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Digit2');
  await page.keyboard.up('Shift');
  pins = await E(() => window.__T.pins.slice());
  emotes = await E(() => window.__T.emotes.slice());
  ok(pins[0] === 4 && emotes[0] === 1, 'T opens quick chat; 5 picks pin 5, Shift+2 emote 2', { pins, emotes });
  await E(() => window.__T.reset());

  // ---- 12. mouse aim ----
  // the brawler is at world (10, 8) = screen (240, 192); 24 px per tile
  await page.mouse.move(240 + 96, 192 + 96);
  await page.mouse.down();
  await page.mouse.up();
  w = await word();
  ok(w.act === ACT.ATTACK && w.auto === 0 && near(w.aimA, Math.PI / 4, 0.01), 'left click attacks toward the mouse', w);
  ok(Math.abs(w.aimD - Math.hypot(4, 4) / 7.67) < 0.03, 'mouse aim distance = distance / range', w);
  await page.mouse.click(240, 10, { button: 'right' });
  w = await word();
  ok(w.act === ACT.NONE, 'right click does nothing while the super is not charged', w);
  await E(() => window.__T.set({ supReady: true, sup: 1 }));
  await page.mouse.click(240, 10, { button: 'right' });
  w = await word();
  ok(w.act === ACT.SUPER && near(w.aimA, -Math.PI / 2, 0.01), 'right click = super toward the mouse', w);
  await E(() => window.__T.set({ supReady: false, sup: 0.3 }));
  await page.mouse.move(240 - 48, 192);
  await page.keyboard.press('KeyE');
  w = await word();
  ok(w.act === ACT.GADGET && w.auto === 0 && near(w.aimA, Math.PI, 0.01), 'E = gadget toward the mouse', w);
  ok((await E(() => window.__T.state())).device === 'mouse', 'mouse use switches to mouse/keyboard mode (touch controls hidden)');
  await E(() => window.__T.setFlip(true));
  await page.mouse.click(240 + 96, 192);
  w = await word();
  ok(w.act === ACT.ATTACK && near(w.aimA, 0, 0.01), 'mouse aim uses world points, so flip does not turn it', w);
  await E(() => window.__T.setFlip(false));

  // ---- 13. gamepad (stub) ----
  await E(() => window.__T.padSet([1, 0, 0, 0], []));
  w = await word();
  ok(w.mvM === 1 && near(w.mvA, 0, 0.03), 'pad: left stick moves', w);
  await E(() => window.__T.padSet([0, 0, 0, 0], [7]));
  w = await word();
  ok(w.act === ACT.ATTACK && w.auto === 1 && w.mvM === 0, 'pad: RT with the right stick centred = auto-aim attack', w);
  w = await word();
  ok(w.act === ACT.NONE, 'pad: holding RT does not fire again', w);
  await E(() => window.__T.padSet([0, 0, 0, -1], []));
  w = await word();
  a = await E(() => window.__T.aim());
  ok(w.act === ACT.NONE && a && a.act === ACT.ATTACK && near(a.ang, -Math.PI / 2), 'pad: right stick shows the aim', { w, a });
  await E(() => window.__T.padSet([0, 0, 0, -1], [5]));
  w = await word();
  ok(w.act === ACT.ATTACK && w.auto === 0 && near(w.aimA, -Math.PI / 2, 0.01), 'pad: R1 with the right stick held = manual attack', w);
  await E(() => window.__T.padSet([0, 0, 0, 0], [4]));
  w = await word();
  ok(w.act === ACT.NONE, 'pad: L1 does nothing while the super is not charged', w);
  await E(() => window.__T.set({ supReady: true, sup: 1 }));
  await E(() => window.__T.padSet([0, 0, -1, 0], []));
  await word();
  await E(() => window.__T.padSet([0, 0, -1, 0], [6]));
  w = await word();
  ok(w.act === ACT.SUPER && w.auto === 0 && near(w.aimA, Math.PI, 0.01), 'pad: LT = super toward the right stick', w);
  await E(() => window.__T.set({ supReady: false, sup: 0 }));
  await E(() => window.__T.padSet([0, 0, 0, 0], []));
  await word();
  await E(() => window.__T.padSet([0, 0, 0, 0], [0]));
  w = await word();
  ok(w.act === ACT.GADGET, 'pad: A = gadget', w);
  await E(() => window.__T.padSet([0, 0, 0, 0], [3]));
  await word();
  wh = await E(() => window.__T.wheel());
  ok(wh.open, 'pad: Y opens quick chat');
  await E(() => window.__T.padSet([0, 0, 1, 0], []));
  await word();
  await E(() => window.__T.padSet([0, 0, 1, 0], [0]));
  w = await word();
  pins = await E(() => window.__T.pins.slice());
  ok(pins[0] === 2 && w.act === ACT.NONE, 'pad: right stick points at a pin, A sends it (not a gadget)', { pins, act: w.act });
  await E(() => window.__T.padSet(null));
  await word();
  ok((await E(() => window.__T.state())).device === 'pad', 'pad use switches the hints to the pad');

  // ---- 14. disabled / dead ----
  await E(() => window.__T.enable(false));
  await E(() => window.__T.touchMode(true));
  await tap(30, atk.x, atk.y);
  w = await word();
  ok(w.w === 0, 'Input.enabled = false: idle words only', w);
  await E(() => window.__T.enable(true));
  await E(() => window.__T.set({ alive: false }));
  await tap(31, atk.x, atk.y);
  w = await word();
  ok(w.act === ACT.NONE, 'dead: no actions', w);
  await E(() => window.__T.set({ alive: true }));

  // ---- screenshots of Input.draw ----
  const shot = async (name) => page.screenshot({ path: path.join(outDir, name + '.png') });
  await E(() => { window.__T.reset(); window.__T.touchMode(true); window.__T.set({ sup: 0.4, supReady: false, gadLeft: 3, gadT: 0 }); return window.__T.draw(); });
  await shot('01-touch-idle');
  await E(([hx, hy, ax, ay]) => {
    window.__T.set({ sup: 1, supReady: true, gadLeft: 2, gadT: 2.2 });
    window.__T.down(40, hx + 10, hy - 10); window.__T.move(40, hx + 50, hy - 35);
    window.__T.down(41, ax, ay); window.__T.move(41, ax - 30, ay - 40);
    return window.__T.draw();
  }, [home.x, home.y, atk.x, atk.y]);
  await shot('02-touch-move-aim-super-ready');
  await E(([sx, sy, ax, ay]) => {
    window.__T.up(41, ax - 30, ay - 40);
    window.__T.down(42, sx, sy); window.__T.move(42, sx - 45, sy - 20);
    window.__T.down(43, ax, ay); window.__T.move(43, ax - 40, ay); window.__T.move(43, ax - 2, ay);
    return window.__T.draw();
  }, [sup.x, sup.y, atk.x, atk.y]);
  await shot('03-touch-super-aim-attack-cancel');
  await E(() => { window.__T.reset(); window.__T.word(); window.__T.word(); window.__T.openWheel(); return window.__T.draw(); });
  await shot('04-quick-chat-wheel');
  await E(() => { window.__T.reset(); window.__T.setDevice('mouse'); window.__T.set({ sup: 0.75, supReady: false, gadLeft: 0 }); return window.__T.draw(); });
  await shot('05-mouse-keyboard-hints');
  await E(() => { window.__T.reset(); window.__T.setLH(true); window.__T.touchMode(true); window.__T.set({ sup: 0.2, gadLeft: 1 }); return window.__T.draw(); });
  await shot('06-left-handed');
  await E(() => { window.__T.setLH(false); window.__T.set({ alive: false }); return window.__T.draw(); });
  await shot('07-dead');
  await E(() => { window.__T.set({ alive: true }); window.__T.reset(); return true; });

  // ---- audio: every recipe and each track rendered offline ----
  const rec = await E((names) => window.__A.recipes(names), RECIPES);
  const silent = [], broken = [], loud = [];
  for (const n of RECIPES) {
    const r = rec[n];
    if (r.err) broken.push(n + ': ' + r.err);
    else if (r.bad) broken.push(n + ': non-finite samples');
    else if (r.peak < 0.002) silent.push(n);
    else if (r.peak > 1.6) loud.push(n + ' ' + r.peak.toFixed(2));
  }
  ok(RECIPES.length >= 60, `${RECIPES.length} sound recipes found`);
  ok(!broken.length, 'every recipe renders without errors', broken);
  ok(!silent.length, 'every recipe makes sound', silent);
  ok(!loud.length, 'no recipe peaks far above full scale before the compressor', loud);
  const peaks = RECIPES.map((n) => [n, rec[n].peak || 0]).sort((x, y) => y[1] - x[1]);
  console.log('  loudest recipes: ' + peaks.slice(0, 5).map((p) => p[0] + ' ' + p[1].toFixed(2)).join(', ') + '; quietest: ' + peaks.slice(-4).map((p) => p[0] + ' ' + p[1].toFixed(3)).join(', '));
  for (const tr of ['menu', 'battle', 'showdown']) {
    const lo = await E(([t]) => window.__A.music(t, 0), [tr]);
    const hi = await E(([t]) => window.__A.music(t, 1), [tr]);
    ok(!lo.err && !hi.err && !lo.bad && !hi.bad && lo.rms > 0.005, `music '${tr}' renders a ${lo.len ? lo.len.toFixed(1) : '?'} s loop`, { lo, hi });
    if (tr !== 'menu') ok(hi.rms > lo.rms * 1.15, `music '${tr}': intensity 1 is fuller than 0 (rms ${lo.rms.toFixed(3)} -> ${hi.rms.toFixed(3)})`);
  }
  // live: the first gesture starts audio; music steps advance
  await page.mouse.click(420, 60);
  await E(() => window.__A.startLive());
  await page.waitForTimeout(700);
  const live = await E(() => window.__A.live());
  ok(live.ctx && (live.state !== 'running' || live.step > 0), 'live audio: context created on the first gesture and music steps advance', live);
  await E(() => window.__A.stopLive());

  const pe = await E(() => window.__errors.splice(0));
  for (const e of pe) errors.push('page: ' + e);
  await browser.close();
  console.log('screenshots in ' + outDir);
  if (errors.length) {
    console.log('\n' + errors.length + ' problem(s):\n' + errors.slice(0, 40).join('\n'));
    process.exit(1);
  }
  console.log('input test: OK');
})();
