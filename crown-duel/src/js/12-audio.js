// ---------- Synthesized sound effects & music (no audio files needed) ----------
const Sound = {
  ctx: null, master: null, sfx: null, mus: null, noiseBuf: null,
  sfxOn: true, musicOn: true, last: {},

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
    this.master.gain.value = 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    this.master.connect(comp);
    comp.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.gain.value = this.sfxOn ? 0.55 : 0;
    this.sfx.connect(this.master);
    this.mus = c.createGain();
    this.mus.gain.value = this.musicOn ? 0.22 : 0;
    this.mus.connect(this.master);
    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (c.state === 'suspended') c.resume().catch(() => {});
    Music.onReady();
  },

  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.value = on ? 0.55 : 0; },
  setMusic(on) { this.musicOn = on; if (this.mus) this.mus.gain.value = on ? 0.22 : 0; },

  tone(f, dur, o = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(f, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, f + o.slide), t + dur);
    const v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
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

  play(name) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.05) return;
    this.last[name] = now;
    const T = (f, d, o) => this.tone(f, d, o);
    const N = (d, o) => this.noise(d, o);
    switch (name) {
      case 'click': T(900, 0.04, { type: 'square', vol: 0.05 }); break;
      case 'deploy': N(0.12, { vol: 0.14, freq: 700, slide: -400 }); T(220, 0.1, { type: 'triangle', vol: 0.1, slide: -80 }); break;
      case 'cast': T(500, 0.18, { type: 'sine', vol: 0.08, slide: 500 }); N(0.2, { vol: 0.08, freq: 3000, filter: 'highpass' }); break;
      case 'thud': T(90, 0.2, { type: 'sine', vol: 0.3, slide: -40 }); N(0.12, { vol: 0.14, freq: 400 }); break;
      case 'hit': N(0.06, { vol: 0.16, freq: 2600, filter: 'bandpass', q: 0.8 }); T(260, 0.05, { type: 'square', vol: 0.05, slide: -120 }); break;
      case 'hitHeavy': N(0.14, { vol: 0.26, freq: 1400 }); T(120, 0.16, { type: 'sawtooth', vol: 0.12, slide: -60 }); break;
      case 'punch': N(0.1, { vol: 0.22, freq: 600 }); T(110, 0.12, { type: 'sine', vol: 0.2, slide: -50 }); break;
      case 'swing': N(0.16, { vol: 0.14, freq: 1600, filter: 'bandpass', q: 0.7, slide: -900 }); break;
      case 'bow': N(0.07, { vol: 0.07, freq: 3200, filter: 'highpass' }); T(640, 0.05, { type: 'triangle', vol: 0.03, slide: -200 }); break;
      case 'gun': N(0.1, { vol: 0.16, freq: 2400, slide: -1800 }); T(180, 0.06, { type: 'square', vol: 0.05, slide: -100 }); break;
      case 'cannon': N(0.22, { vol: 0.22, freq: 800, slide: -600 }); T(80, 0.2, { type: 'sine', vol: 0.22, slide: -30 }); break;
      case 'spit': T(700, 0.08, { type: 'triangle', vol: 0.05, slide: -400 }); break;
      case 'magic': T(700, 0.2, { type: 'sine', vol: 0.06, slide: 500 }); T(1050, 0.18, { type: 'triangle', vol: 0.03, delay: 0.04, slide: -300 }); break;
      case 'boom': N(0.5, { vol: 0.4, freq: 900, slide: -800 }); T(70, 0.4, { type: 'sine', vol: 0.3, slide: -30 }); break;
      case 'fire': N(0.28, { vol: 0.18, freq: 700, filter: 'bandpass', q: 0.6 }); break;
      case 'pop': N(0.12, { vol: 0.14, freq: 1200, slide: -800 }); break;
      case 'zap': N(0.25, { vol: 0.22, freq: 4000, filter: 'highpass', slide: -2000 }); T(1500, 0.12, { type: 'sawtooth', vol: 0.04, slide: -1200 }); break;
      case 'ice': T(1800, 0.2, { type: 'sine', vol: 0.06, slide: -1000 }); N(0.15, { vol: 0.08, freq: 5000, filter: 'highpass' }); break;
      case 'freeze': T(2200, 0.5, { type: 'sine', vol: 0.08, slide: -1600 }); N(0.5, { vol: 0.14, freq: 5000, filter: 'highpass' }); break;
      case 'poison': N(0.6, { vol: 0.1, freq: 500, filter: 'bandpass', q: 3, attack: 0.1 }); T(160, 0.5, { type: 'sine', vol: 0.08, slide: 60 }); break;
      case 'volley': N(0.5, { vol: 0.1, freq: 2800, filter: 'highpass', attack: 0.15 }); break;
      case 'log': N(0.9, { vol: 0.16, freq: 300, attack: 0.05 }); T(70, 0.8, { type: 'triangle', vol: 0.12 }); break;
      case 'die': T(420, 0.14, { type: 'triangle', vol: 0.07, slide: -300 }); N(0.12, { vol: 0.08, freq: 1600, slide: -1000 }); break;
      case 'dieBig': T(160, 0.4, { type: 'sawtooth', vol: 0.12, slide: -100 }); N(0.4, { vol: 0.2, freq: 700, slide: -500 }); break;
      case 'towerDown': N(1.1, { vol: 0.45, freq: 700, slide: -600 }); T(55, 0.9, { type: 'sine', vol: 0.35, slide: -20 }); [523, 659, 784].forEach((f, i) => T(f, 0.25, { type: 'square', vol: 0.04, delay: 0.3 + i * 0.1 })); break;
      case 'king': T(220, 0.4, { type: 'sawtooth', vol: 0.08, slide: 110 }); T(330, 0.4, { type: 'square', vol: 0.05, delay: 0.1 }); break;
      case 'elixir': T(1320, 0.08, { type: 'sine', vol: 0.07 }); T(1760, 0.12, { type: 'sine', vol: 0.07, delay: 0.06 }); break;
      case 'charge': T(300, 0.3, { type: 'sawtooth', vol: 0.05, slide: 300 }); break;
      case 'summon': T(200, 0.3, { type: 'triangle', vol: 0.08, slide: 200 }); N(0.2, { vol: 0.06, freq: 900 }); break;
      case 'dig': N(0.3, { vol: 0.2, freq: 500, slide: -200 }); break;
      case 'warn': T(880, 0.12, { type: 'square', vol: 0.05 }); T(1175, 0.18, { type: 'square', vol: 0.05, delay: 0.14 }); break;
      case 'emote': T(1046, 0.08, { type: 'triangle', vol: 0.08 }); T(1568, 0.1, { type: 'triangle', vol: 0.07, delay: 0.07 }); break;
      case 'error': T(160, 0.14, { type: 'square', vol: 0.07 }); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => T(f, 0.24, { type: 'square', vol: 0.07, delay: i * 0.12 })); break;
      case 'defeat': [392, 349, 311, 262].forEach((f, i) => T(f, 0.34, { type: 'triangle', vol: 0.11, delay: i * 0.2 })); break;
      case 'chest': N(0.35, { vol: 0.18, freq: 1500 }); [523, 659, 784, 1046].forEach((f, i) => T(f, 0.16, { type: 'square', vol: 0.06, delay: 0.1 + i * 0.07 })); break;
      case 'cardflip': N(0.08, { vol: 0.12, freq: 3000, filter: 'bandpass' }); T(880, 0.08, { type: 'triangle', vol: 0.06, delay: 0.03 }); break;
      case 'epic': [659, 831, 988, 1318].forEach((f, i) => T(f, 0.2, { type: 'triangle', vol: 0.09, delay: i * 0.08 })); break;
      case 'legendary': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => T(f, 0.3, { type: 'square', vol: 0.06, delay: i * 0.09 })); N(0.8, { vol: 0.08, freq: 6000, filter: 'highpass', delay: 0.2 }); break;
      case 'upgrade': [392, 523, 659, 784].forEach((f, i) => T(f, 0.18, { type: 'square', vol: 0.06, delay: i * 0.07 })); break;
      case 'coin': T(1046, 0.07, { type: 'square', vol: 0.045 }); T(1568, 0.12, { type: 'square', vol: 0.045, delay: 0.06 }); break;
      case 'levelup': [523, 659, 784, 1046, 1318].forEach((f, i) => T(f, 0.2, { type: 'square', vol: 0.07, delay: i * 0.08 })); break;
    }
  },
};

const MIDI = (m) => 440 * Math.pow(2, (m - 69) / 12);
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10],
};
const TRACKS = {
  menu: { bpm: 96, root: 60, scale: 'major', prog: [0, 5, 3, 4], drums: 1, arp: [0, 1, 2, 1], lead: 0.45, pad: true, seed: 3 },
  battle: { bpm: 132, root: 57, scale: 'dorian', prog: [0, 3, 6, 4], drums: 3, arp: [0, 1, 2, 3], lead: 0.65, seed: 11 },
};

const Music = {
  cur: null, name: null, timer: null, step: 0, next: 0, melody: null, want: null,
  onReady() {
    if (this.want) {
      const w = this.want;
      this.want = null;
      this.play(w);
    }
  },
  play(name) {
    if (!Sound.ctx) { this.want = name; return; }
    if (this.name === name) return;
    this.stop();
    this.name = name;
    this.cur = TRACKS[name];
    if (!this.cur) return;
    const rng = new RNG(this.cur.seed || 1);
    this.melody = [];
    for (let i = 0; i < 32; i++) this.melody.push(rng.chance(this.cur.lead || 0.5) ? rng.int(0, 7) : -1);
    this.step = 0;
    this.next = Sound.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 45);
  },
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.name = null;
    this.cur = null;
    this.want = null;
  },
  tick() {
    const c = Sound.ctx;
    if (!c || !this.cur) return;
    if (c.state !== 'running' || !Sound.musicOn) { this.next = c.currentTime + 0.05; return; }
    const sd = 60 / this.cur.bpm / 2;
    if (this.next < c.currentTime - 0.3) this.next = c.currentTime + 0.02;
    while (this.next < c.currentTime + 0.18) {
      this.playStep(this.step, this.next, sd);
      this.next += sd;
      this.step++;
    }
  },
  playStep(step, t, sd) {
    const tr = this.cur;
    const sc = SCALES[tr.scale];
    const bar = Math.floor(step / 8) % tr.prog.length;
    const s8 = step % 8;
    const deg = tr.prog[bar];
    const note = (d, oct) => tr.root + sc[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
    const bus = Sound.mus;
    const delay = Math.max(0, t - Sound.ctx.currentTime);
    if (s8 === 0 || s8 === 3 || s8 === 4 || s8 === 6) Sound.tone(MIDI(note(deg, -2)), sd * 1.5, { type: 'triangle', vol: 0.3, delay, bus });
    const arp = tr.arp;
    const ct = [0, 2, 4, 7][arp[step % arp.length] % 4];
    Sound.tone(MIDI(note(deg + ct, 0)), sd * 0.9, { type: 'square', vol: 0.03, delay, bus });
    if (step % 2 === 0) {
      const m = this.melody[(step / 2) % 32];
      if (m >= 0) Sound.tone(MIDI(note(deg + m, 1)), sd * 1.8, { type: 'triangle', vol: 0.08, delay, bus });
    }
    if (tr.pad && s8 === 0) Sound.tone(MIDI(note(deg + 2, -1)), sd * 8, { type: 'sine', vol: 0.07, attack: 0.25, delay, bus });
    const dr = tr.drums || 0;
    if (dr >= 1 && (s8 === 0 || (dr >= 2 && s8 === 4))) Sound.tone(110, 0.18, { type: 'sine', vol: 0.45, slide: -70, delay, bus });
    if (dr >= 2 && (s8 === 2 || s8 === 6)) Sound.noise(0.12, { vol: 0.16, freq: 1800, filter: 'bandpass', delay, bus });
    if (dr >= 3) Sound.noise(0.03, { vol: 0.05, freq: 7000, filter: 'highpass', delay, bus });
  },
};

function applySettings() {
  Sound.setSfx(SAVE.settings.sfx);
  Sound.setMusic(SAVE.settings.music);
}
