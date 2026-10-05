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

  play(name, pitch) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const gap = name === 'gem' ? 0.035 : name === 'hit' ? 0.06 : 0.05;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    const T = (f, d, o) => this.tone(f, d, o);
    const N = (d, o) => this.noise(d, o);
    const pm = pitch || 1;
    switch (name) {
      case 'click': T(900, 0.04, { type: 'square', vol: 0.05 }); break;
      case 'select': T(660, 0.08, { type: 'triangle', vol: 0.08 }); T(990, 0.12, { type: 'triangle', vol: 0.07, delay: 0.06 }); break;
      case 'gem': T(1046 * pm, 0.07, { type: 'sine', vol: 0.06 }); T(1568 * pm, 0.06, { type: 'triangle', vol: 0.025, delay: 0.02 }); break;
      case 'coin': T(1318, 0.06, { type: 'square', vol: 0.04 }); T(1976, 0.1, { type: 'square', vol: 0.04, delay: 0.05 }); break;
      case 'bolt': T(880, 0.07, { type: 'sine', vol: 0.035, slide: 600 }); break;
      case 'slash': N(0.14, { vol: 0.09, freq: 2400, filter: 'bandpass', q: 0.8, slide: -1400 }); break;
      case 'blades': T(1200, 0.25, { type: 'triangle', vol: 0.03, slide: 400 }); N(0.2, { vol: 0.04, freq: 5000, filter: 'highpass' }); break;
      case 'throw': N(0.12, { vol: 0.06, freq: 1500, filter: 'bandpass', q: 1, slide: 900 }); break;
      case 'zap': N(0.2, { vol: 0.12, freq: 4000, filter: 'highpass', slide: -2000 }); T(1400, 0.1, { type: 'sawtooth', vol: 0.03, slide: -1100 }); break;
      case 'flask': N(0.25, { vol: 0.09, freq: 700, filter: 'bandpass', q: 0.6 }); T(1800, 0.05, { type: 'triangle', vol: 0.03 }); break;
      case 'frost': T(2000, 0.35, { type: 'sine', vol: 0.05, slide: -1500 }); N(0.3, { vol: 0.07, freq: 5000, filter: 'highpass' }); break;
      case 'orb': T(520, 0.15, { type: 'sine', vol: 0.05, slide: 400 }); break;
      case 'beam': T(300, 0.5, { type: 'sawtooth', vol: 0.03, slide: 500, attack: 0.05 }); break;
      case 'missile': N(0.12, { vol: 0.04, freq: 1200, slide: -600 }); break;
      case 'hit': N(0.05, { vol: 0.06, freq: 2600, filter: 'bandpass', q: 0.8 }); break;
      case 'kill': T(320, 0.07, { type: 'triangle', vol: 0.04, slide: -200 }); break;
      case 'killBig': N(0.4, { vol: 0.25, freq: 900, slide: -700 }); T(90, 0.35, { type: 'sine', vol: 0.25, slide: -40 }); break;
      case 'boom': N(0.3, { vol: 0.16, freq: 900, slide: -700 }); T(80, 0.25, { type: 'sine', vol: 0.14, slide: -30 }); break;
      case 'spike': N(0.12, { vol: 0.1, freq: 3000, filter: 'bandpass', slide: -1500 }); T(260, 0.1, { type: 'square', vol: 0.04, slide: -100 }); break;
      case 'slam': N(0.5, { vol: 0.3, freq: 500, slide: -350 }); T(55, 0.45, { type: 'sine', vol: 0.3, slide: -20 }); break;
      case 'hurt': T(200, 0.12, { type: 'square', vol: 0.08, slide: -100 }); N(0.08, { vol: 0.1, freq: 900 }); break;
      case 'heal': [784, 988, 1318].forEach((f, i) => T(f, 0.12, { type: 'sine', vol: 0.06, delay: i * 0.05 })); break;
      case 'level': [523, 659, 784, 1046, 1318].forEach((f, i) => T(f, 0.16, { type: 'square', vol: 0.055, delay: i * 0.06 })); break;
      case 'chest': [392, 523, 659].forEach((f, i) => T(f, 0.14, { type: 'triangle', vol: 0.08, delay: i * 0.07 })); break;
      case 'chestOpen': N(0.35, { vol: 0.15, freq: 1500 }); [523, 659, 784, 1046, 1318].forEach((f, i) => T(f, 0.18, { type: 'square', vol: 0.055, delay: 0.1 + i * 0.08 })); break;
      case 'evolve': [392, 523, 659, 784, 1046, 1318, 1568].forEach((f, i) => T(f, 0.3, { type: 'square', vol: 0.06, delay: i * 0.09 })); N(1, { vol: 0.08, freq: 6000, filter: 'highpass', delay: 0.3 }); break;
      case 'magnet': T(300, 0.5, { type: 'sine', vol: 0.08, slide: 900 }); break;
      case 'bomb': N(0.9, { vol: 0.35, freq: 2500, slide: -2200 }); T(110, 0.8, { type: 'sine', vol: 0.3, slide: -60 }); [1046, 1318, 1568].forEach((f, i) => T(f, 0.4, { type: 'triangle', vol: 0.05, delay: 0.1 + i * 0.05 })); break;
      case 'eshot': T(440, 0.06, { type: 'triangle', vol: 0.025, slide: -150 }); break;
      case 'bossShot': T(220, 0.15, { type: 'sawtooth', vol: 0.04, slide: -80 }); break;
      case 'charge': N(0.25, { vol: 0.08, freq: 600, slide: 400 }); break;
      case 'blink': T(900, 0.18, { type: 'sine', vol: 0.05, slide: -700 }); break;
      case 'summon': T(150, 0.4, { type: 'sawtooth', vol: 0.05, slide: 120 }); break;
      case 'warn': T(880, 0.14, { type: 'square', vol: 0.06 }); T(660, 0.2, { type: 'square', vol: 0.06, delay: 0.16 }); T(880, 0.14, { type: 'square', vol: 0.06, delay: 0.38 }); T(660, 0.2, { type: 'square', vol: 0.06, delay: 0.54 }); break;
      case 'boss': T(110, 0.9, { type: 'sawtooth', vol: 0.12, slide: -30 }); T(165, 0.9, { type: 'sawtooth', vol: 0.08, delay: 0.1 }); N(0.8, { vol: 0.12, freq: 400 }); break;
      case 'swarm': N(0.8, { vol: 0.07, freq: 1800, filter: 'bandpass', q: 2, attack: 0.2 }); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046, 1318, 1568].forEach((f, i) => T(f, 0.26, { type: 'square', vol: 0.07, delay: i * 0.12 })); break;
      case 'defeat': [392, 349, 311, 262, 196].forEach((f, i) => T(f, 0.4, { type: 'triangle', vol: 0.1, delay: i * 0.22 })); break;
      case 'unlock': [784, 988, 1175, 1568].forEach((f, i) => T(f, 0.18, { type: 'triangle', vol: 0.08, delay: i * 0.07 })); break;
      case 'buy': T(988, 0.07, { type: 'square', vol: 0.05 }); T(1318, 0.1, { type: 'square', vol: 0.05, delay: 0.06 }); T(1760, 0.14, { type: 'square', vol: 0.05, delay: 0.12 }); break;
      case 'reroll': T(500, 0.2, { type: 'triangle', vol: 0.07, slide: 500 }); break;
      case 'banish': N(0.25, { vol: 0.1, freq: 1200, slide: -900 }); T(300, 0.2, { type: 'square', vol: 0.05, slide: -200 }); break;
      case 'error': T(160, 0.14, { type: 'square', vol: 0.07 }); break;
      case 'revive': [262, 392, 523, 784, 1046].forEach((f, i) => T(f, 0.3, { type: 'triangle', vol: 0.08, delay: i * 0.1 })); break;
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
  menu: { bpm: 84, root: 57, scale: 'minor', prog: [0, 5, 3, 4], drums: 0, arp: [0, 1, 2, 1], lead: 0.4, pad: true, seed: 7 },
  graveyard: { bpm: 122, root: 50, scale: 'dorian', prog: [0, 5, 3, 4], drums: 2, arp: [0, 1, 2, 3], lead: 0.55, pad: true, seed: 21 },
  frozen: { bpm: 112, root: 52, scale: 'minor', prog: [0, 3, 5, 4], drums: 2, arp: [0, 2, 1, 3], lead: 0.5, pad: true, seed: 33 },
  ember: { bpm: 136, root: 49, scale: 'minor', prog: [0, 1, 0, 6], drums: 3, arp: [0, 1, 2, 1], lead: 0.6, seed: 45 },
  void: { bpm: 128, root: 47, scale: 'dorian', prog: [0, 6, 5, 4], drums: 3, arp: [0, 3, 2, 1], lead: 0.6, pad: true, seed: 57 },
  boss: { bpm: 148, root: 45, scale: 'minor', prog: [0, 0, 5, 4], drums: 3, arp: [0, 1, 2, 3], lead: 0.7, seed: 69 },
  dawn: { bpm: 100, root: 60, scale: 'major', prog: [0, 4, 5, 3], drums: 1, arp: [0, 1, 2, 3], lead: 0.6, pad: true, seed: 81 },
};

const Music = {
  cur: null, name: null, timer: null, step: 0, next: 0, melody: null, want: null, intensity: null,
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
    const dr = this.intensity == null ? tr.drums || 0 : this.intensity;
    if (dr >= 1 && (s8 === 0 || (dr >= 2 && s8 === 4))) Sound.tone(110, 0.18, { type: 'sine', vol: 0.45, slide: -70, delay, bus });
    if (dr >= 2 && (s8 === 2 || s8 === 6)) Sound.noise(0.12, { vol: 0.16, freq: 1800, filter: 'bandpass', delay, bus });
    if (dr >= 3) Sound.noise(0.03, { vol: 0.05, freq: 7000, filter: 'highpass', delay, bus });
  },
};

function applySettings() {
  Sound.setSfx(SAVE.settings.sfx);
  Sound.setMusic(SAVE.settings.music);
}
