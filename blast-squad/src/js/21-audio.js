// ---------- Synthesized sound effects and music (no audio files) ----------
// Sound.init()                 create the AudioContext (call on the first user gesture; safe to repeat)
// Sound.play(name, opts)       opts: { pitch (x), vol (x), n (count/step), gap (s), x, y (world tiles,
//                              attenuated and panned around Sound.ear), delay (s) }
// Sound.ear(x, y, flip)        listener position for positional sounds (the local brawler / camera)
// Sound.onEvent(ev, state, local)  plays the right sound for a sim event (see EV in 02-const.js)
// Sound.onHud(hud, team)       per-frame: gem countdown ticks (each second) and the last seconds
// Sound.fire(bk, act, opts)    a brawler's attack / super / gadget sound
// Sound.setVolume(sfx, music)  0..1 each (undefined keeps); Sound.setSfx(on), Sound.setMusic(on),
//                              Sound.setMuted(on) (e.g. while the page is hidden)
// Music.play(name)  Music.stop()  Music.intensity = 0..1 (battle layers)  tracks: menu, battle, showdown
//
// Sound names
//   attack families: shotgun, shotgunBig, burst (n, gap), punch (n, gap), lob, boom, bigBoom, bottle,
//     smash (bottle smash + sizzle), zap, snipe, wave, quake, snow, swoosh (shovel dash), blaster,
//     blades, cactus (launch), pop (cactus burst), thud (shot into a wall)
//   supers and kits: super (layer for any super), superReady, gadget, leap, land, summon, build,
//     chord, storm, gust, bats, speed, vanish, spikes, heal, shield, stun, dash
//   combat: hit (dealt; opts.n = 1 for a big hit), hurt, kill (yours), down (someone else's), death
//     (your own), respawn
//   objectives: gemSpawn, gem (opts.n = gems carried: pitch rises), tick (gem countdown; opts.n =
//     seconds left, opts.pitch), countStart, countStop, horn (goal), kick, pass, ballPick, cube, box,
//     wall, poison, star, clock (last seconds), roundWin, roundLose, go, count (3-2-1)
//   jingles and UI: victory, defeat, draw, click, confirm, back, error, buy, unlock, drop (opts.n =
//     rarity step 0..5), dropOpen (opts.n = final rarity), trophyUp, trophyDown, pin, emote, levelUp
const Sound = {
  ctx: null, master: null, sfx: null, mus: null, noiseBuf: null,
  sfxOn: true, musicOn: true, muted: false, sfxVol: 0.8, musVol: 0.6,
  last: {}, voices: 0,
  earX: 0, earY: 0, earFlip: false, earSet: false,
  shotPk: new Map(), // shot id -> 'pk|lob' (remembered at spawn for the landing sound)
  boxHit: new Set(), // tile indices hit like boxes (a tile change there is a box, not a wall)
  hudCount: -1, hudClock: -1,

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    this.master.connect(comp);
    comp.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.mus = c.createGain();
    this.mus.connect(this.master);
    this.applyGains();
    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (c.state === 'suspended') c.resume().catch(() => {});
    Music.onReady();
  },

  applyGains() {
    if (!this.ctx) return;
    this.sfx.gain.value = this.sfxOn ? 0.6 * this.sfxVol : 0;
    this.mus.gain.value = this.musicOn ? 0.3 * this.musVol : 0;
    this.master.gain.value = this.muted ? 0 : 0.8;
  },
  setSfx(on) { this.sfxOn = !!on; this.applyGains(); },
  setMusic(on) { this.musicOn = !!on; this.applyGains(); },
  setMuted(on) { this.muted = !!on; this.applyGains(); },
  setVolume(sfx, music) {
    if (sfx != null) this.sfxVol = clamp(+sfx || 0, 0, 1);
    if (music != null) this.musVol = clamp(+music || 0, 0, 1);
    this.applyGains();
  },

  // o: type, vol, attack, slide (Hz added by the end), delay, bus, lp (lowpass Hz), q, det (cents),
  // vib [rate Hz, depth Hz], hold (s at full volume before the decay)
  tone(f, dur, o = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(f, t);
    if (o.det) osc.detune.setValueAtTime(o.det, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, f + o.slide), t + dur);
    let lfo = null;
    if (o.vib) {
      lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = o.vib[0];
      lg.gain.value = o.vib[1];
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const v = o.vol == null ? 0.2 : o.vol;
    const a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a);
    if (o.hold) g.gain.setValueAtTime(Math.max(0.0002, v), t + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + (o.hold || 0) + 0.01));
    let head = osc;
    if (o.lp) {
      const fl = c.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = o.lp;
      fl.Q.value = o.q || 0.8;
      osc.connect(fl);
      head = fl;
    }
    head.connect(g);
    g.connect(o.bus || this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  noise(dur, o = {}) {
    const c = this.ctx;
    if (!c || !this.noiseBuf) return;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    const f0 = o.freq || 1200;
    f.frequency.setValueAtTime(f0, t);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, f0 + o.slide), t + dur);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    const v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.bus || this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  },

  // A per-sound output (volume and stereo position), released a few seconds later.
  voice(vol, pan) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = vol;
    let p = null;
    if (pan && c.createStereoPanner) {
      p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      p.connect(this.sfx);
    } else g.connect(this.sfx);
    this.voices++;
    setTimeout(() => {
      this.voices--;
      try { g.disconnect(); if (p) p.disconnect(); } catch (e) { /* already gone */ }
    }, 3200);
    return g;
  },

  ear(x, y, flip) { this.earX = x; this.earY = y; this.earFlip = !!flip; this.earSet = true; },

  // minimum seconds between two plays of the same sound
  GAP: { hit: 0.05, hurt: 0.08, gem: 0.03, thud: 0.06, heal: 0.25, down: 0.08, box: 0.05, wall: 0.04, click: 0.03, tick: 0.2, clock: 0.3, poison: 1.5, snow: 0.04, burst: 0.04 },
  // these always play (UI, jingles, your own big moments) even when many voices are busy
  PRIO: { click: 1, confirm: 1, back: 1, error: 1, buy: 1, unlock: 1, drop: 1, dropOpen: 1, victory: 1, defeat: 1, draw: 1, trophyUp: 1, trophyDown: 1, death: 1, superReady: 1, kill: 1, horn: 1, levelUp: 1, roundWin: 1, roundLose: 1, go: 1, count: 1 },

  play(name, opts) {
    const c = this.ctx;
    if (!c || !this.sfxOn || this.muted || c.state !== 'running') return;
    const o = opts || {};
    const now = c.currentTime;
    const gap = this.GAP[name] != null ? this.GAP[name] : 0.03;
    if (this.last[name] && now - this.last[name] < gap) return;
    if (this.voices > 40 && !this.PRIO[name]) return;
    let vol = o.vol == null ? 1 : o.vol, pan = 0;
    if (o.x != null && this.earSet) {
      // falloff: full within 5 tiles, silent past 18; pan by the side of the screen
      const dx = o.x - this.earX, dy = o.y - this.earY, d = Math.hypot(dx, dy);
      const k = clamp(1 - (d - 5) / 13, 0, 1);
      if (k <= 0.02) return;
      vol *= Math.pow(k, 1.5);
      pan = clamp(dx / 10, -1, 1) * 0.7 * (this.earFlip ? -1 : 1);
    }
    if (vol <= 0.01) return;
    this.last[name] = now;
    const out = this.voice(vol, pan);
    this.recipe(name, o, out);
  },

  recipe(name, o, out) {
    const p = o.pitch || 1, d0 = o.delay || 0;
    const T = (f, d, q) => { q.bus = out; q.delay = (q.delay || 0) + d0; this.tone(f * p, d, q); };
    const N = (d, q) => { q.bus = out; q.delay = (q.delay || 0) + d0; if (q.freq) q.freq *= p; if (q.slide) q.slide *= p; this.noise(d, q); };
    const arp = (fs, step, d, q) => fs.forEach((f, i) => T(f, d, Object.assign({}, q, { delay: (q.delay || 0) + i * step })));
    const n = o.n | 0;
    switch (name) {
      // ---- attack families ----
      case 'shotgun':
        N(0.22, { vol: 0.3, freq: 1800, slide: -1500 });
        N(0.05, { vol: 0.22, freq: 4200, filter: 'highpass' });
        T(120, 0.12, { type: 'sine', vol: 0.3, slide: -70 });
        T(1600, 0.25, { type: 'triangle', vol: 0.025, slide: -1200, delay: 0.08 }); // shell clink
        break;
      case 'shotgunBig':
        N(0.45, { vol: 0.42, freq: 1500, slide: -1250 });
        N(0.08, { vol: 0.28, freq: 5000, filter: 'highpass' });
        T(80, 0.38, { type: 'sine', vol: 0.42, slide: -45 });
        T(160, 0.2, { type: 'square', vol: 0.06, slide: -100, lp: 900 });
        break;
      case 'burst': {
        const k = clamp(n || 3, 1, 12), g = o.gap || 0.08;
        for (let i = 0; i < k; i++) {
          N(0.05, { vol: 0.15, freq: 3200, filter: 'bandpass', q: 0.9, delay: i * g });
          T(240, 0.05, { type: 'square', vol: 0.045, slide: -130, delay: i * g, lp: 2400 });
        }
        break;
      }
      case 'punch': {
        const k = clamp(n || 1, 1, 6), g = o.gap || 0.07;
        for (let i = 0; i < k; i++) {
          N(0.07, { vol: 0.22, freq: 700, delay: i * g });
          T(150 + (i % 2) * 20, 0.08, { type: 'sine', vol: 0.22, slide: -80, delay: i * g });
        }
        break;
      }
      case 'lob':
        for (let i = 0; i < clamp(n || 1, 1, 5); i++) {
          N(0.18, { vol: 0.1, freq: 600, filter: 'bandpass', q: 1.2, slide: 1400, delay: i * 0.05 });
          T(300, 0.12, { type: 'triangle', vol: 0.05, slide: 260, delay: i * 0.05 });
        }
        break;
      case 'boom':
        N(0.5, { vol: 0.36, freq: 1000, slide: -850 });
        T(70, 0.4, { type: 'sine', vol: 0.36, slide: -35 });
        N(0.06, { vol: 0.14, freq: 3200, filter: 'highpass' });
        break;
      case 'bigBoom':
        N(0.9, { vol: 0.45, freq: 1300, slide: -1150 });
        T(60, 0.8, { type: 'sine', vol: 0.45, slide: -30 });
        N(0.1, { vol: 0.2, freq: 3500, filter: 'highpass' });
        N(0.5, { vol: 0.08, freq: 900, filter: 'bandpass', q: 0.7, delay: 0.25 }); // debris
        break;
      case 'bottle':
        for (let i = 0; i < clamp(n || 1, 1, 5); i++) {
          N(0.15, { vol: 0.08, freq: 900, filter: 'bandpass', q: 1, slide: 1000, delay: i * 0.04 });
          T(2200 + i * 120, 0.05, { type: 'triangle', vol: 0.035, delay: i * 0.04 });
        }
        break;
      case 'smash':
        N(0.12, { vol: 0.2, freq: 4500, filter: 'highpass' });
        T(2600, 0.08, { type: 'triangle', vol: 0.06, slide: -400 });
        T(3300, 0.06, { type: 'triangle', vol: 0.05, delay: 0.02 });
        T(4100, 0.05, { type: 'triangle', vol: 0.035, delay: 0.045 });
        N(0.8, { vol: 0.07, freq: 6000, filter: 'highpass', attack: 0.06, delay: 0.05 }); // sizzle
        break;
      case 'zap':
        T(1800, 0.16, { type: 'sawtooth', vol: 0.08, slide: -1500 });
        N(0.18, { vol: 0.14, freq: 3500, filter: 'highpass', slide: -1500 });
        T(90, 0.12, { type: 'square', vol: 0.06, lp: 600 });
        break;
      case 'snipe':
        N(0.03, { vol: 0.35, freq: 6000, filter: 'highpass' });
        N(0.3, { vol: 0.18, freq: 1600, slide: -1300 });
        T(900, 0.22, { type: 'sine', vol: 0.05, slide: -700 }); // ricochet ping
        break;
      case 'wave':
        T(440, 0.35, { type: 'triangle', vol: 0.09, slide: 220 });
        T(660, 0.35, { type: 'triangle', vol: 0.06, slide: 330, delay: 0.02 });
        T(447, 0.35, { type: 'sine', vol: 0.06, slide: 225, vib: [18, 12] });
        break;
      case 'quake':
        T(70, 0.4, { type: 'sawtooth', vol: 0.14, lp: 320, slide: -20 });
        N(0.35, { vol: 0.22, freq: 420, slide: -260 });
        N(0.2, { vol: 0.06, freq: 2400, filter: 'bandpass', delay: 0.04 }); // crackle of roots
        break;
      case 'snow':
        for (let i = 0; i < 3; i++) N(0.08, { vol: 0.1, freq: 2500, filter: 'bandpass', q: 0.6, delay: i * 0.025 });
        T(1200, 0.08, { type: 'sine', vol: 0.03, slide: -400 });
        break;
      case 'swoosh':
        N(0.25, { vol: 0.16, freq: 800, filter: 'bandpass', q: 1.5, slide: 2500 });
        T(1500, 0.12, { type: 'triangle', vol: 0.05, delay: 0.1 });
        T(2250, 0.1, { type: 'triangle', vol: 0.035, delay: 0.1 });
        break;
      case 'blaster':
        T(600, 0.15, { type: 'square', vol: 0.06, slide: 500, lp: 3000 });
        T(1200, 0.14, { type: 'sine', vol: 0.05, slide: -600, delay: 0.03 });
        N(0.08, { vol: 0.06, freq: 3000, filter: 'bandpass' });
        break;
      case 'blades':
        for (let i = 0; i < 4; i++) T(2400 + i * 220, 0.09, { type: 'triangle', vol: 0.04, slide: 600, delay: i * 0.02 });
        N(0.12, { vol: 0.07, freq: 6000, filter: 'highpass' });
        break;
      case 'cactus':
        T(260, 0.1, { type: 'sine', vol: 0.14, slide: 200 });
        N(0.08, { vol: 0.08, freq: 1500, filter: 'bandpass' });
        break;
      case 'pop':
        T(500, 0.06, { type: 'sine', vol: 0.12, slide: 600 });
        N(0.06, { vol: 0.12, freq: 2500, filter: 'bandpass' });
        N(0.14, { vol: 0.08, freq: 5000, filter: 'highpass', delay: 0.03 }); // spikes flying out
        break;
      case 'thud':
        N(0.06, { vol: 0.08, freq: 600 });
        break;

      // ---- supers and kits ----
      case 'super':
        T(220, 0.35, { type: 'sawtooth', vol: 0.06, slide: 440, lp: 2200 });
        N(0.3, { vol: 0.08, freq: 1500, filter: 'bandpass', slide: 3000 });
        arp([1318, 1760], 0.05, 0.18, { type: 'triangle', vol: 0.03, delay: 0.05 });
        break;
      case 'superReady':
        arp([784, 1175, 1568], 0.07, 0.25, { type: 'triangle', vol: 0.07 });
        T(2349, 0.4, { type: 'sine', vol: 0.03, delay: 0.21 });
        N(0.4, { vol: 0.03, freq: 7000, filter: 'highpass', attack: 0.1 });
        break;
      case 'gadget':
        T(880, 0.08, { type: 'square', vol: 0.05, slide: 880, lp: 4000 });
        T(1320, 0.12, { type: 'triangle', vol: 0.05, delay: 0.06 });
        N(0.15, { vol: 0.04, freq: 7000, filter: 'highpass' });
        break;
      case 'leap':
        N(0.3, { vol: 0.12, freq: 500, filter: 'bandpass', q: 1, slide: 1600 });
        T(200, 0.3, { type: 'triangle', vol: 0.06, slide: 300 });
        break;
      case 'land':
        N(0.35, { vol: 0.3, freq: 700, slide: -550 });
        T(60, 0.3, { type: 'sine', vol: 0.32, slide: -25 });
        break;
      case 'summon':
        T(110, 0.5, { type: 'sawtooth', vol: 0.1, lp: 700, slide: 40, vib: [9, 8] }); // a bear growl
        N(0.45, { vol: 0.1, freq: 500, filter: 'bandpass', q: 2, attack: 0.05 });
        break;
      case 'build':
        for (let i = 0; i < 3; i++) T(700 + i * 150, 0.05, { type: 'square', vol: 0.04, delay: i * 0.07, lp: 3000 });
        N(0.05, { vol: 0.1, freq: 2500, filter: 'bandpass', q: 3, delay: 0.24 });
        T(1500, 0.15, { type: 'sine', vol: 0.05, delay: 0.26 });
        break;
      case 'chord':
        arp([523, 659, 784, 1046], 0.04, 0.6, { type: 'triangle', vol: 0.05, attack: 0.03 });
        T(262, 0.6, { type: 'sine', vol: 0.06, attack: 0.05 });
        break;
      case 'storm':
        N(1.0, { vol: 0.12, freq: 600, attack: 0.15 });
        T(1200, 0.2, { type: 'sawtooth', vol: 0.05, slide: -1000, delay: 0.1 });
        N(0.25, { vol: 0.18, freq: 3000, filter: 'highpass', slide: -2000, delay: 0.1 });
        break;
      case 'gust':
        N(0.6, { vol: 0.16, freq: 400, filter: 'bandpass', q: 0.8, slide: 1800, attack: 0.08 });
        break;
      case 'bats':
        for (let i = 0; i < 5; i++) T(2600 + (i % 3) * 400, 0.06, { type: 'square', vol: 0.02, slide: -900, delay: i * 0.04, lp: 5000 });
        N(0.35, { vol: 0.1, freq: 1400, filter: 'bandpass', q: 2, slide: -700 });
        break;
      case 'speed':
        T(300, 0.35, { type: 'sawtooth', vol: 0.05, slide: 900, lp: 2500 });
        N(0.3, { vol: 0.08, freq: 1000, filter: 'bandpass', slide: 3000 });
        break;
      case 'vanish':
        T(1400, 0.4, { type: 'sine', vol: 0.06, slide: -1100 });
        N(0.4, { vol: 0.06, freq: 5000, filter: 'highpass', slide: -3000 });
        break;
      case 'spikes':
        N(0.2, { vol: 0.14, freq: 1800, filter: 'bandpass', slide: -800 });
        for (let i = 0; i < 4; i++) T(1800 + i * 300, 0.05, { type: 'triangle', vol: 0.03, delay: 0.03 + i * 0.03 });
        break;
      case 'heal':
        arp([784, 988, 1318], 0.05, 0.12, { type: 'sine', vol: 0.05 });
        break;
      case 'shield':
        T(500, 0.3, { type: 'triangle', vol: 0.06, slide: 300 });
        T(1000, 0.3, { type: 'sine', vol: 0.03, vib: [12, 20] });
        break;
      case 'stun':
        arp([1568, 1318, 1568, 1318], 0.06, 0.06, { type: 'triangle', vol: 0.04 });
        break;
      case 'dash':
        N(0.18, { vol: 0.12, freq: 900, filter: 'bandpass', q: 1.2, slide: 2200 });
        break;

      // ---- combat ----
      case 'hit':
        N(0.04, { vol: n ? 0.2 : 0.13, freq: n ? 1500 : 2200, filter: 'bandpass', q: 0.9 });
        T(n ? 900 : 1400, 0.035, { type: 'square', vol: 0.03, lp: 3500 });
        break;
      case 'hurt':
        T(180, 0.12, { type: 'square', vol: 0.09, slide: -80, lp: 1500 });
        N(0.1, { vol: 0.14, freq: 900 });
        break;
      case 'kill':
        N(0.2, { vol: 0.14, freq: 1500, filter: 'bandpass' });
        arp([660, 880, 1320], 0.05, 0.14, { type: 'square', vol: 0.05, lp: 4000 });
        break;
      case 'down':
        N(0.25, { vol: 0.12, freq: 900, slide: -600 });
        T(220, 0.2, { type: 'triangle', vol: 0.05, slide: -120 });
        break;
      case 'death':
        T(440, 0.6, { type: 'sawtooth', vol: 0.08, slide: -330, lp: 1500 });
        N(0.45, { vol: 0.15, freq: 600, slide: -400 });
        T(110, 0.6, { type: 'sine', vol: 0.2, slide: -60 });
        break;
      case 'respawn':
        arp([523, 659, 784, 1046], 0.06, 0.2, { type: 'sine', vol: 0.06 });
        N(0.4, { vol: 0.03, freq: 6000, filter: 'highpass', attack: 0.2 });
        break;

      // ---- objectives ----
      case 'gemSpawn':
        T(1568, 0.12, { type: 'sine', vol: 0.05 });
        T(2093, 0.16, { type: 'sine', vol: 0.04, delay: 0.05 });
        break;
      case 'gem': {
        // each gem carried lifts the chime a semitone (up to an octave and a half)
        const f = 880 * Math.pow(2, clamp(n, 0, 18) / 12);
        T(f, 0.08, { type: 'triangle', vol: 0.08 });
        T(f * 1.5, 0.12, { type: 'sine', vol: 0.05, delay: 0.04 });
        break;
      }
      case 'tick':
        T(n > 0 && n <= 3 ? 1500 : 1100, 0.05, { type: 'square', vol: 0.06, lp: 4000 });
        T(n > 0 && n <= 3 ? 750 : 550, 0.07, { type: 'triangle', vol: 0.05 });
        break;
      case 'countStart':
        arp([660, 880, 660, 880], 0.12, 0.1, { type: 'square', vol: 0.05, lp: 3000 });
        break;
      case 'countStop':
        arp([880, 660, 440], 0.08, 0.12, { type: 'triangle', vol: 0.06 });
        break;
      case 'horn':
        [220, 277, 330].forEach((f) => T(f, 1.0, { type: 'sawtooth', vol: 0.07, lp: 1400, attack: 0.03, hold: 0.6, vib: [5, 3] }));
        N(1.4, { vol: 0.08, freq: 1200, filter: 'bandpass', q: 0.5, attack: 0.25 }); // crowd
        break;
      case 'kick':
        T(130, 0.1, { type: 'sine', vol: 0.25, slide: -60 });
        N(0.05, { vol: 0.15, freq: 1500, filter: 'bandpass' });
        break;
      case 'pass':
        T(150, 0.08, { type: 'sine', vol: 0.18, slide: -50 });
        N(0.2, { vol: 0.05, freq: 800, filter: 'bandpass', slide: 900 });
        break;
      case 'ballPick':
        T(300, 0.06, { type: 'sine', vol: 0.12, slide: 100 });
        break;
      case 'cube':
        T(523, 0.1, { type: 'square', vol: 0.05, slide: 523, lp: 4000 });
        T(1046, 0.2, { type: 'triangle', vol: 0.06, delay: 0.07 });
        N(0.25, { vol: 0.03, freq: 7000, filter: 'highpass', delay: 0.07 });
        break;
      case 'box':
        N(0.25, { vol: 0.24, freq: 900, slide: -600 });
        N(0.05, { vol: 0.18, freq: 1800, filter: 'bandpass', q: 3 }); // wood crack
        T(160, 0.15, { type: 'triangle', vol: 0.09, slide: -60 });
        break;
      case 'wall':
        N(0.45, { vol: 0.28, freq: 700, slide: -500 });
        for (let i = 0; i < 4; i++) N(0.06, { vol: 0.09, freq: 900 + i * 300, filter: 'bandpass', delay: 0.05 + i * 0.06 });
        break;
      case 'poison':
        N(1.4, { vol: 0.08, freq: 3000, filter: 'highpass', attack: 0.3 });
        T(90, 1.2, { type: 'sawtooth', vol: 0.03, lp: 300, attack: 0.3 });
        break;
      case 'star':
        arp([1046, 1318, 1568, 2093], 0.04, 0.12, { type: 'sine', vol: 0.06 });
        break;
      case 'clock':
        T(n % 2 ? 1000 : 800, 0.04, { type: 'square', vol: 0.035, lp: 3000 });
        break;
      case 'roundWin':
        arp([523, 659, 784, 1046], 0.09, 0.25, { type: 'square', vol: 0.05, lp: 3500 });
        break;
      case 'roundLose':
        arp([392, 330, 262], 0.12, 0.3, { type: 'triangle', vol: 0.07 });
        break;
      case 'count':
        T(660, 0.12, { type: 'square', vol: 0.05, lp: 3000 });
        break;
      case 'go':
        T(1320, 0.3, { type: 'square', vol: 0.06, lp: 3500 });
        T(660, 0.3, { type: 'triangle', vol: 0.06 });
        N(0.3, { vol: 0.05, freq: 5000, filter: 'highpass' });
        break;

      // ---- jingles and UI ----
      case 'victory':
        arp([523, 659, 784, 1046], 0.1, 0.22, { type: 'square', vol: 0.06, lp: 3500 });
        arp([784, 1046], 0.16, 0.5, { type: 'square', vol: 0.06, lp: 3500, delay: 0.45 });
        [523, 659, 784].forEach((f) => T(f, 0.9, { type: 'triangle', vol: 0.05, delay: 0.62, attack: 0.02 }));
        T(131, 1.2, { type: 'sine', vol: 0.12, delay: 0.62 });
        N(0.8, { vol: 0.04, freq: 7000, filter: 'highpass', delay: 0.62, attack: 0.1 });
        break;
      case 'defeat':
        arp([392, 349, 311, 294], 0.2, 0.35, { type: 'triangle', vol: 0.08 });
        T(196, 1.0, { type: 'triangle', vol: 0.08, delay: 0.8 });
        T(98, 1.0, { type: 'sine', vol: 0.1, delay: 0.8 });
        break;
      case 'draw':
        arp([523, 392, 523], 0.16, 0.3, { type: 'triangle', vol: 0.07 });
        break;
      case 'click': T(1000, 0.035, { type: 'square', vol: 0.04, lp: 4000 }); break;
      case 'confirm':
        T(660, 0.06, { type: 'triangle', vol: 0.07 });
        T(990, 0.1, { type: 'triangle', vol: 0.07, delay: 0.05 });
        break;
      case 'back': T(700, 0.08, { type: 'triangle', vol: 0.06, slide: -250 }); break;
      case 'error': T(160, 0.14, { type: 'square', vol: 0.06, lp: 1200 }); break;
      case 'buy':
        T(988, 0.07, { type: 'square', vol: 0.045, lp: 4000 });
        T(1318, 0.1, { type: 'square', vol: 0.045, delay: 0.06, lp: 4000 });
        T(1760, 0.16, { type: 'square', vol: 0.045, delay: 0.12, lp: 4000 });
        N(0.12, { vol: 0.06, freq: 6000, filter: 'highpass', delay: 0.12 });
        break;
      case 'unlock':
        N(0.5, { vol: 0.08, freq: 600, filter: 'bandpass', slide: 3000, attack: 0.1 });
        arp([523, 659, 784, 1046, 1318], 0.08, 0.25, { type: 'square', vol: 0.05, lp: 4000, delay: 0.3 });
        [523, 659, 784, 1046].forEach((f) => T(f, 1.2, { type: 'triangle', vol: 0.045, delay: 0.75, attack: 0.03 }));
        T(131, 1.3, { type: 'sine', vol: 0.12, delay: 0.75 });
        N(1.0, { vol: 0.05, freq: 7000, filter: 'highpass', delay: 0.75, attack: 0.1 });
        break;
      case 'drop': {
        // one rarity step of a reward drop: each step is a fifth-stacked stab a whole tone higher
        const f = 392 * Math.pow(2, (clamp(n, 0, 5) * 2) / 12);
        N(0.25, { vol: 0.12, freq: 700, filter: 'bandpass', slide: 2000 });
        [1, 1.25, 1.5].forEach((m) => T(f * m, 0.3, { type: 'square', vol: 0.04, lp: 3000, delay: 0.08 }));
        T(f / 2, 0.35, { type: 'sine', vol: 0.12, delay: 0.08 });
        if (n >= 3) N(0.5, { vol: 0.04 + n * 0.01, freq: 7000, filter: 'highpass', delay: 0.08, attack: 0.05 });
        break;
      }
      case 'dropOpen': {
        const f = 523 * Math.pow(2, (clamp(n, 0, 5) * 2) / 12);
        N(0.35, { vol: 0.2, freq: 1500, slide: -1000 });
        arp([f, f * 1.25, f * 1.5, f * 2], 0.06, 0.3, { type: 'square', vol: 0.05, lp: 4000, delay: 0.05 });
        N(0.8, { vol: 0.05, freq: 7000, filter: 'highpass', delay: 0.2, attack: 0.1 });
        break;
      }
      case 'trophyUp':
        arp([784, 988, 1175], 0.06, 0.14, { type: 'square', vol: 0.045, lp: 4000 });
        T(1568, 0.25, { type: 'triangle', vol: 0.05, delay: 0.18 });
        break;
      case 'trophyDown':
        arp([523, 440, 349], 0.09, 0.2, { type: 'triangle', vol: 0.06 });
        break;
      case 'levelUp':
        arp([523, 659, 784, 1046, 1318], 0.06, 0.18, { type: 'square', vol: 0.05, lp: 4000 });
        break;
      case 'pin':
        T(880, 0.06, { type: 'sine', vol: 0.07, slide: 300 });
        T(1320, 0.08, { type: 'sine', vol: 0.05, delay: 0.05 });
        break;
      case 'emote':
        T(600, 0.1, { type: 'triangle', vol: 0.06, slide: 400 });
        break;
    }
  },

  // ---------------- game wiring ----------------
  // Attack / super sound per brawler: [recipe, opts]; land/supLand play where lobs come down.
  FAM: {
    nova: { atk: ['shotgun'], sup: ['shotgunBig'] },
    dax: { atk: ['burst', { n: 6, gap: 0.08 }], sup: ['burst', { n: 12, gap: 0.06, pitch: 0.85 }] },
    brick: { atk: ['punch', { n: 4, gap: 0.07 }], sup: ['leap'] },
    bramble: { atk: ['quake'], sup: ['summon'] },
    pip: { atk: ['lob', { n: 2 }], sup: ['lob', { pitch: 0.7 }], land: 'boom', supLand: 'bigBoom' },
    melody: { atk: ['wave'], sup: ['chord'] },
    sizzle: { atk: ['bottle'], sup: ['bottle', { n: 5 }], land: 'smash', supLand: 'smash' },
    gizmo: { atk: ['blaster'], sup: ['build'] },
    volt: { atk: ['zap'], sup: ['storm'] },
    hawk: { atk: ['snipe'], sup: ['leap'], supLand: 'boom' },
    frost: { atk: ['snow'], sup: ['gust'] },
    shade: { atk: ['swoosh'], sup: ['bats'] },
    zip: { atk: ['burst', { n: 4, gap: 0.05, pitch: 1.25 }], sup: ['speed'] },
    specter: { atk: ['blades'], sup: ['vanish'] },
    thorn: { atk: ['cactus'], sup: ['lob'], land: 'pop', supLand: 'spikes' },
  },

  fire(bk, act, opts) {
    const f = this.FAM[bk] || this.FAM.nova;
    if (act === ACT.GADGET) { this.play('gadget', opts); return; }
    const e = act === ACT.SUPER ? f.sup : f.atk;
    const o = Object.assign({}, e[1] || {}, opts || {});
    this.play(e[0], o);
    if (act === ACT.SUPER) this.play('super', opts);
  },

  // Turns one sim event into sound. `state` has the Sim's fields; `local` is the player's slot.
  onEvent(ev, state, local) {
    if (!this.ctx) return;
    const B = state.brawlers || [];
    const me = local >= 0 ? B[local] : null;
    if (!this.earSet && me) { this.earX = me.x; this.earY = me.y; }
    const myTeam = me ? me.team : -1;
    const at = (x, y, o) => { o = o || {}; o.x = x; o.y = y; return o; };
    switch (ev[0]) {
      case EV.FIRE: {
        const b = B[ev[1]];
        if (!b) break;
        this.fire(b.bk, ev[2], ev[1] === local ? null : at(ev[3], ev[4], { vol: 0.8 }));
        break;
      }
      case EV.SPAWN:
        if (ev[2] === K.SHOT && state.shots) {
          const ss = state.shots;
          for (let i = ss.length - 1; i >= 0; i--) {
            if (ss[i].id === ev[1]) { this.shotPk.set(ev[1], ss[i].pk + (ss[i].lob ? '|lob' : '')); break; }
          }
          if (this.shotPk.size > 400) this.shotPk.clear();
        }
        break;
      case EV.SHOT_END: {
        const pk = this.shotPk.get(ev[1]);
        this.shotPk.delete(ev[1]);
        if (!pk) break;
        const bk = pk.slice(0, pk.indexOf('.')), f = this.FAM[bk];
        const lob = pk.endsWith('|lob'), sup = pk.indexOf('.sup') > 0 || pk.indexOf('.nade') > 0;
        const snd = f ? (sup ? f.supLand : pk.startsWith(bk + '.atk') ? f.land : null) : null;
        if (snd && (lob || bk === 'thorn')) this.play(snd, at(ev[2], ev[3]));
        else if (ev[4]) this.play('thud', at(ev[2], ev[3], { vol: 0.6 }));
        break;
      }
      case EV.HIT: {
        const id = ev[1];
        if (id < 0) this.boxHit.add(-1 - id);
        if (me && id === me.id) { this.play('hurt'); break; }
        if (ev[5] === local) this.play('hit', { n: ev[6] ? 1 : 0 });
        break;
      }
      case EV.HEAL:
        if (ev[1] === local && ev[2] >= 300) this.play('heal', { vol: 0.6 });
        break;
      case EV.KILL:
        if (ev[1] === local) this.play('death');
        else if (ev[2] === local && local >= 0) this.play('kill');
        else this.play('down', at(ev[3], ev[4]));
        break;
      case EV.RESPAWN:
        if (ev[1] === local) this.play('respawn');
        break;
      case EV.PICKUP: {
        const own = ev[1] === local, o = own ? {} : at(ev[4], ev[5], { vol: 0.7 });
        if (ev[2] === PICK.GEM) { const b = B[ev[1]]; o.n = b ? b.carry : 0; this.play('gem', o); }
        else if (ev[2] === PICK.CUBE) this.play('cube', o);
        else if (ev[2] === PICK.STAR) this.play('star', o);
        break;
      }
      case EV.DROP:
        if (ev[1] === PICK.GEM) this.play('gemSpawn', at(ev[3], ev[4], { vol: 0.7 }));
        break;
      case EV.GOAL: this.play('horn', { pitch: ev[1] === myTeam || myTeam < 0 ? 1 : 0.89 }); break;
      case EV.TILE: {
        const ti = ev[1], w = state.map ? state.map.w : 1;
        const o = at((ti % w) + 0.5, Math.floor(ti / w) + 0.5);
        if (this.boxHit.has(ti)) { this.boxHit.delete(ti); this.play('box', o); } else this.play('wall', o);
        break;
      }
      case EV.SUPER_READY:
        if (ev[1] === local) this.play('superReady');
        break;
      case EV.PIN: this.play('pin', { vol: B[ev[1]] && B[ev[1]].team === myTeam ? 1 : 0.5 }); break;
      case EV.EMOTE: this.play('emote', { vol: 0.7 }); break;
      case EV.ROUND: this.play(ev[1] === myTeam ? 'roundWin' : 'roundLose'); break;
      case EV.BALL: {
        const b = B[ev[2]], o = b && ev[2] !== local ? at(b.x, b.y) : {};
        if (ev[1] === 1) this.play('ballPick', o);
        else if (ev[1] === 2) this.play('kick', o);
        else if (ev[1] === 3) this.play('pass', o);
        break;
      }
      case EV.STATUS:
        if (ev[1] !== local) break;
        if (ev[2] === 1) this.play('stun');
        else if (ev[2] === 5) this.play('shield', { vol: 0.6 });
        else if (ev[2] === 6) this.play('speed', { vol: 0.5 });
        break;
      case EV.COUNTDOWN:
        this.play(ev[1] < 0 ? 'countStop' : 'countStart', { pitch: ev[1] === myTeam ? 1.12 : 0.9 });
        break;
      case EV.POISON: this.play('poison'); break;
    }
  },

  // Per frame with the mode's HUD: the gem countdown ticks once a second (higher for your team),
  // and the clock ticks over the last 10 seconds.
  onHud(hud, team) {
    if (!hud) return;
    const c = hud.count > 0 ? Math.ceil(hud.count) : -1;
    if (c !== this.hudCount) {
      if (c > 0) this.play('tick', { n: c, pitch: hud.countTeam === team ? 1.12 : 0.85 });
      this.hudCount = c;
    }
    const t = hud.time != null && hud.time > 0 && hud.time <= 10 ? Math.ceil(hud.time) : -1;
    if (t !== this.hudClock) {
      if (t > 0 && c < 0) this.play('clock', { n: t });
      this.hudClock = t;
    }
  },

  // Forget per-match bookkeeping (call when a match starts).
  resetMatch() {
    this.shotPk.clear();
    this.boxHit.clear();
    this.hudCount = -1;
    this.hudClock = -1;
    this.earSet = false;
  },
};

// ---------- Music: a small step sequencer with original tunes ----------
// Each track: bpm, swing, chords (one per bar, e.g. 'Dm', 'Bb', 'A'), bass (per-bar pattern on 8ths:
// R root, 3 third, 5 fifth, O octave, - hold, . rest), lead (8th-note tokens over the whole loop: a
// note like 'F5', '-' hold, '.' rest), drum layers (16 steps per bar) switched on by Music.intensity.
const Music = {
  cur: null, name: null, timer: null, step: 0, next: 0, want: null, intensity: 0,
  NOTE: { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 },
  TRACKS: {
    menu: {
      bpm: 112, swing: 0.14, fixed: 0.62,
      chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C'],
      bass: ['R.5.O-5R', 'R.5.O.3.', 'R.5.O-5R', 'R.5.O53.'],
      lead: 'C5 - A4 C5 F5 - E5 - | D5 - - F5 E5 D5 C5 - | D5 - Bb4 D5 F5 - G5 F5 | E5 - - - C5 - . . | ' +
        'C5 - A4 C5 F5 - A5 - | G5 - E5 - C5 - E5 - | F5 - D5 Bb4 D5 - G5 - | G5 - E5 - C5 - . .',
      leadMin: 0, arpMin: 0.5, padMin: 0, leadType: 'square',
      drums: [
        { min: 0, k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        { min: 0.6, h: '.......x.......x' },
      ],
    },
    battle: {
      bpm: 132, swing: 0, fast: 0.06,
      chords: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'A'],
      bass: ['RROR.RO5', 'RROR.R5O', 'RROR.RO5', 'RROR5.O3'],
      lead: 'D5 - F5 - A5 - G5 F5 | E5 - D5 - C5 - D5 - | F5 - D5 - Bb4 - D5 F5 | G5 - - E5 - C5 E5 G5 | ' +
        'A5 - G5 F5 - D5 F5 A5 | C6 - A5 - G5 - F5 - | G5 - F5 D5 - Bb4 D5 F5 | E5 - - C#5 - E5 A5 -',
      leadMin: 0.45, arpMin: 0.72, padMin: 0, padMax: 0.8, leadType: 'square',
      drums: [
        { min: 0, h: 'x.x.x.x.x.x.x.x.' },
        { min: 0.22, k: 'x.......x.......', s: '....x.......x...' },
        { min: 0.5, k: '......x.....x...' },
        { min: 0.72, h: '.x.x.x.x.x.x.x.x', o: '..x...x...x...x.' },
        { min: 0.9, k: '....x.......x...', s: '..............xx' },
      ],
    },
    showdown: {
      bpm: 120, swing: 0.08, fast: 0.05,
      chords: ['Em', 'C', 'Am', 'B', 'Em', 'C', 'D', 'B'],
      bass: ['R..R5.O.', 'R..R5.3.', 'R..R5.O.', 'R.5.O.5.'],
      lead: 'E5 - - G5 F#5 - E5 - | E5 - - - . . B4 - | C5 - E5 - A5 - G5 E5 | F#5 - - - D#5 - . . | ' +
        'E5 - - G5 B5 - A5 G5 | G5 - E5 - C5 - E5 - | F#5 - A5 - D6 - C6 A5 | B5 - - - F#5 - D#5 -',
      leadMin: 0.4, arpMin: 0.7, padMin: 0, leadType: 'triangle',
      drums: [
        { min: 0, h: '..x...x...x...x.' },
        { min: 0.25, k: 'x.........x.....', s: '........x.......' },
        { min: 0.55, k: '......x.........', h: 'x.x.x.x.x.x.x.x.' },
        { min: 0.8, s: '....x..........x', o: '..............x.' },
      ],
    },
  },

  onReady() {
    if (this.want) {
      const w = this.want;
      this.want = null;
      this.play(w);
    }
  },

  play(name) {
    if (!Sound.ctx) { this.want = name; return; }
    if (this.name === name && this.timer) return;
    this.stop();
    const tr = this.TRACKS[name];
    if (!tr) return;
    this.name = name;
    this.cur = this.compile(tr);
    this.step = 0;
    this.next = Sound.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 40);
  },

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.name = null;
    this.cur = null;
    this.want = null;
  },

  // Parses a track once: chord roots/tones, lead notes with lengths (in 16ths), drum masks.
  compile(tr) {
    const c = Object.assign({}, tr);
    c.bars = tr.chords.length;
    c.ch = tr.chords.map((s) => {
      const m = /^([A-G][#b]?)(m?)$/.exec(s);
      const root = 36 + this.NOTE[m[1]]; // bass octave (C2..B2)
      return { root: root > 45 ? root - 12 : root, third: m[2] ? 3 : 4 };
    });
    const toks = tr.lead.split(/\s+/).filter((t) => t && t !== '|');
    const lead = new Array(c.bars * 16).fill(null);
    let lastAt = -1;
    toks.forEach((t, i) => {
      const at = i * 2;
      if (t === '-') { if (lastAt >= 0) lead[lastAt].len += 2; return; }
      lastAt = -1;
      if (t === '.') return;
      const m = /^([A-G][#b]?)(\d)$/.exec(t);
      if (!m) return;
      lead[at] = { midi: 12 * (+m[2] + 1) + this.NOTE[m[1]], len: 2 };
      lastAt = at;
    });
    c.leadNotes = lead;
    return c;
  },

  tick() {
    const c = Sound.ctx;
    if (!c || !this.cur) return;
    if (c.state !== 'running' || !Sound.musicOn || Sound.muted) { this.next = c.currentTime + 0.05; return; }
    if (this.next < c.currentTime - 0.3) this.next = c.currentTime + 0.02;
    while (this.next < c.currentTime + 0.16) {
      const sd = this.stepDur();
      this.playStep(this.step, this.next, sd);
      this.next += sd;
      this.step = (this.step + 1) % (this.cur.bars * 16);
    }
  },

  level() {
    const tr = this.cur;
    return tr && tr.fixed != null ? tr.fixed : clamp(+this.intensity || 0, 0, 1);
  },
  stepDur() {
    const tr = this.cur, I = this.level();
    return 60 / (tr.bpm * (1 + (tr.fast || 0) * Math.max(0, I - 0.85) / 0.15)) / 4;
  },

  playStep(step, t, sd) {
    const tr = this.cur, I = this.level(), bus = Sound.mus;
    const s16 = step % 16, bar = Math.floor(step / 16) % tr.bars;
    const ch = tr.ch[bar];
    const swing = s16 % 2 === 1 ? (tr.swing || 0) * sd : 0;
    const delay = Math.max(0, t + swing - Sound.ctx.currentTime);
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const T = (m, d, o) => { o.bus = bus; o.delay = delay; Sound.tone(mf(m), d, o); };
    const N = (d, o) => { o.bus = bus; o.delay = delay; Sound.noise(d, o); };
    // bass on 8ths, the filter opens with intensity
    if (s16 % 2 === 0) {
      const pat = tr.bass[bar % tr.bass.length];
      const tok = pat[s16 / 2];
      const off = { R: 0, 3: ch.third, 5: 7, O: 12 }[tok];
      if (off != null) {
        let len = 1;
        for (let j = s16 / 2 + 1; j < 8 && pat[j] === '-'; j++) len++;
        T(ch.root + off, sd * 2 * len * 0.9, { type: 'sawtooth', vol: 0.22, lp: 380 + 900 * I, q: 2 });
        T(ch.root + off - 12, sd * 2 * len * 0.9, { type: 'sine', vol: 0.18 });
      }
    }
    // pad: the chord, held over the bar
    if (s16 === 0 && I >= (tr.padMin || 0) && I <= (tr.padMax == null ? 1 : tr.padMax)) {
      [0, ch.third, 7].forEach((o, i) => T(ch.root + 24 + o, sd * 15, { type: 'triangle', vol: 0.045, attack: 0.25, det: i * 4 - 4 }));
    }
    // lead melody (with a quiet echo a dotted 8th later)
    const ln = tr.leadNotes[step];
    if (ln && I >= tr.leadMin) {
      T(ln.midi, sd * ln.len * 0.95, { type: tr.leadType || 'square', vol: 0.06, lp: 2600, attack: 0.01, vib: ln.len >= 4 ? [5.5, 4] : null });
      Sound.tone(mf(ln.midi), sd * ln.len * 0.8, { type: 'triangle', vol: 0.02, bus, delay: delay + sd * 3 });
    }
    // arpeggio of chord tones on 16ths at high intensity
    if (I >= tr.arpMin) {
      const seq = [0, 7, 12, ch.third + 12, 7, 12, 19, ch.third + 12];
      T(ch.root + 24 + seq[s16 % 8], sd * 0.8, { type: 'square', vol: 0.018, lp: 1800 + 1500 * I });
    }
    // drums: every layer up to the current intensity plays
    for (const L of tr.drums) {
      if (I < L.min) continue;
      if (L.k && L.k[s16] === 'x') Sound.tone(150, 0.16, { type: 'sine', vol: 0.5, slide: -105, bus, delay });
      if (L.s && L.s[s16] === 'x') { N(0.13, { vol: 0.17, freq: 1900, filter: 'bandpass', q: 0.8 }); T(55, 0.06, { type: 'triangle', vol: 0.06 }); }
      if (L.h && L.h[s16] === 'x') N(0.03, { vol: 0.045, freq: 8000, filter: 'highpass' });
      if (L.o && L.o[s16] === 'x') N(0.14, { vol: 0.04, freq: 7000, filter: 'highpass' });
    }
    if (step === 0 && I >= 0.85) N(1.2, { vol: 0.07, freq: 5000, filter: 'highpass' }); // crash at the top of the loop
  },
};
