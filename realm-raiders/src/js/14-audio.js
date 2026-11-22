// ---------- Audio: synthesized sound effects and a little music per realm ----------

const Sound = {
  ac: null, out: null, noise: null, last: {}, vol: 0.8, budget: 0,

  unlock() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.out = this.ac.createGain();
      this.out.gain.value = this.vol;
      const comp = this.ac.createDynamicsCompressor();
      this.out.connect(comp);
      comp.connect(this.ac.destination);
      const len = this.ac.sampleRate;
      const b = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
      Music.attach(this.ac, comp);
    } catch (e) { this.ac = null; }
  },

  setVol(v) { this.vol = v; if (this.out) this.out.gain.value = v; },

  tone(type, f0, f1, dur, vol, t0, dest) {
    const ac = this.ac, t = t0 || ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.out);
    o.start(t); o.stop(t + dur + 0.02);
  },

  hiss(dur, vol, ftype, f0, f1, t0) {
    const ac = this.ac, t = t0 || ac.currentTime;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noise;
    f.type = ftype || 'lowpass';
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },

  arp(notes, step, type, vol, dur) {
    const t = this.ac.currentTime;
    notes.forEach((n, i) => this.tone(type || 'square', n, n, dur || 0.12, vol, t + i * step));
  },

  play(name, v) {
    if (!this.ac || this.vol <= 0 || this.muted) return;
    const now = this.ac.currentTime;
    if (this.last[name] && now - this.last[name] < 0.045) return;
    this.last[name] = now;
    const vol = (v == null ? 0.5 : v) * 0.5;
    try {
      switch (name) {
        case 'hit': this.hiss(0.05, vol * 0.5, 'bandpass', 1800, 900); this.tone('sine', 160, 90, 0.06, vol * 0.5); break;
        case 'crit': this.hiss(0.06, vol * 0.6, 'bandpass', 3000, 1500); this.tone('square', 1200, 600, 0.08, vol * 0.3); break;
        case 'hurt': this.tone('square', 240, 110, 0.13, vol * 0.45); break;
        case 'swing': this.hiss(0.07, vol * 0.35, 'highpass', 2000, 5000); break;
        case 'shoot': this.tone('square', 700, 380, 0.05, vol * 0.18); break;
        case 'zap': this.tone('sawtooth', 900 + Math.random() * 600, 200, 0.09, vol * 0.25); break;
        case 'fire': this.hiss(0.28, vol * 0.5, 'lowpass', 1600, 300); break;
        case 'boom': this.hiss(0.4, vol * 0.8, 'lowpass', 900, 120); this.tone('sine', 110, 40, 0.35, vol * 0.8); break;
        case 'whoosh': this.hiss(0.3, vol * 0.4, 'bandpass', 400, 2400); break;
        case 'die': this.tone('triangle', 320, 70, 0.16, vol * 0.4); break;
        case 'coin': this.tone('square', 988, 988, 0.05, vol * 0.25); this.tone('square', 1319, 1319, 0.08, vol * 0.25, now + 0.05); break;
        case 'pickup': this.arp([660, 880, 1175], 0.05, 'sine', vol * 0.5); break;
        case 'banner': this.tone('triangle', 392, 392, 0.3, vol * 0.3); this.tone('triangle', 523, 523, 0.35, vol * 0.3, now + 0.08); break;
        case 'down': this.arp([440, 349, 262], 0.12, 'triangle', vol * 0.5, 0.2); break;
        case 'revive': this.arp([523, 659, 784, 1047], 0.07, 'triangle', vol * 0.5, 0.15); break;
        case 'dash': this.hiss(0.12, vol * 0.4, 'highpass', 1200, 4000); break;
        case 'ult': this.tone('sawtooth', 180, 720, 0.4, vol * 0.4); this.tone('square', 360, 1440, 0.4, vol * 0.2); this.hiss(0.5, vol * 0.5, 'bandpass', 300, 3000); break;
        case 'cast': this.tone('sine', 520, 820, 0.12, vol * 0.4); break;
        case 'ice': this.arp([1568, 2093, 2637], 0.03, 'triangle', vol * 0.3, 0.08); break;
        case 'beam': this.tone('sawtooth', 140, 90, 0.4, vol * 0.4); break;
        case 'bossdie': this.hiss(1.4, vol, 'lowpass', 1200, 60); this.tone('sine', 120, 30, 1.2, vol); this.arp([523, 659, 784, 1047, 1319], 0.12, 'square', vol * 0.25, 0.3); break;
        case 'roar': this.tone('sawtooth', 110, 55, 0.9, vol * 0.6); this.hiss(0.9, vol * 0.5, 'lowpass', 500, 100); break;
        case 'clear': this.arp([523, 659, 784, 1047], 0.09, 'square', vol * 0.3, 0.18); break;
        case 'chest': this.arp([784, 988, 1175, 1568, 1976], 0.06, 'triangle', vol * 0.45, 0.15); break;
        case 'bless': this.arp([880, 1109, 1319, 1760], 0.07, 'sine', vol * 0.5, 0.3); break;
        case 'portal': this.tone('sine', 300, 600, 0.5, vol * 0.3); break;
        case 'travel': this.hiss(0.6, vol * 0.5, 'bandpass', 200, 3000); this.tone('sine', 200, 800, 0.6, vol * 0.3); break;
        case 'hymn': this.arp([523, 659, 784, 659, 1047], 0.08, 'triangle', vol * 0.45, 0.2); break;
        case 'timestop': this.tone('sine', 900, 120, 0.8, vol * 0.5); this.tone('triangle', 1800, 240, 0.8, vol * 0.2); break;
        case 'multi': this.arp([392, 523, 659, 784], 0.05, 'square', vol * 0.3, 0.1); break;
        case 'ko': this.tone('square', 660, 220, 0.2, vol * 0.4); this.hiss(0.15, vol * 0.5, 'lowpass', 2000, 200); break;
        case 'raise': this.tone('sine', 200, 400, 0.3, vol * 0.35); this.tone('sine', 205, 410, 0.3, vol * 0.35); break;
        case 'win': this.arp([523, 659, 784, 1047, 784, 1047], 0.12, 'square', vol * 0.35, 0.25); break;
        case 'lose': this.arp([392, 349, 311, 262], 0.2, 'triangle', vol * 0.5, 0.35); break;
        case 'click': this.tone('square', 1200, 1200, 0.025, vol * 0.2); break;
        case 'level': this.arp([523, 659, 784, 1047, 1319], 0.07, 'square', vol * 0.35, 0.18); break;
        case 'ach': this.arp([1047, 1319, 1568, 2093], 0.08, 'triangle', vol * 0.5, 0.3); break;
        case 'bash': this.hiss(0.12, vol * 0.6, 'lowpass', 1500, 200); this.tone('square', 200, 80, 0.12, vol * 0.4); break;
        case 'buy': this.arp([784, 1175], 0.06, 'square', vol * 0.3, 0.1); break;
        case 'legend': this.arp([523, 784, 1047, 1568, 2093, 2637], 0.08, 'triangle', vol * 0.55, 0.4); break;
      }
    } catch (e) { /* audio glitch */ }
  },
};

// Tiny step sequencer: bass, arpeggio and soft drums. One mood per realm.
const MOODS = {
  menu: { bpm: 92, root: 57, prog: [0, 5, 3, 4], scale: [0, 2, 4, 7, 9], lead: 'triangle' },
  woods: { bpm: 112, root: 55, prog: [0, 4, 5, 3], scale: [0, 2, 4, 7, 9], lead: 'square' },
  crypt: { bpm: 100, root: 57, prog: [0, 5, 3, 4], scale: [0, 3, 5, 7, 10], lead: 'triangle' },
  ember: { bpm: 126, root: 50, prog: [0, 1, 0, 6], scale: [0, 1, 3, 5, 7, 8, 10], lead: 'sawtooth' },
  frost: { bpm: 104, root: 52, prog: [0, 3, 5, 4], scale: [0, 2, 3, 7, 10], lead: 'triangle' },
  void: { bpm: 118, root: 47, prog: [0, 1, 5, 4], scale: [0, 1, 3, 6, 8], lead: 'square' },
  arena: { bpm: 132, root: 52, prog: [0, 3, 4, 3], scale: [0, 3, 5, 7, 10], lead: 'square' },
  boss: { bpm: 140, root: 45, prog: [0, 1, 0, 3], scale: [0, 1, 3, 5, 7, 8], lead: 'sawtooth' },
};

const Music = {
  ac: null, dest: null, gain: null, mood: null, step: 0, nextT: 0, timer: null, vol: 0.45,

  attach(ac, dest) {
    this.ac = ac;
    this.gain = ac.createGain();
    this.gain.gain.value = this.vol * 0.22;
    this.gain.connect(dest);
    if (this.mood) this.start(this.mood, true);
  },

  setVol(v) { this.vol = v; if (this.gain) this.gain.gain.value = v * 0.22; },

  start(mood, force) {
    if (this.mood === mood && this.timer && !force) return;
    this.mood = mood;
    if (!this.ac) return;
    clearInterval(this.timer);
    this.step = 0;
    this.nextT = this.ac.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), 50);
  },

  stop() { clearInterval(this.timer); this.timer = null; this.mood = null; },

  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); },

  tick() {
    if (!this.ac || this.vol <= 0) return;
    const M = MOODS[this.mood] || MOODS.menu;
    const st = 60 / M.bpm / 4;
    while (this.nextT < this.ac.currentTime + 0.15) {
      const t = this.nextT, s = this.step;
      const bar = Math.floor(s / 16) % M.prog.length, beat = s % 16;
      const chord = M.root + (M.scale[M.prog[bar] % M.scale.length] || 0) + (M.prog[bar] >= M.scale.length ? 12 : 0);
      if (beat % 4 === 0) this.note('triangle', this.midi(chord - 12), st * 3.5, 0.5, t);
      if (beat % 2 === 0) {
        const sc = M.scale;
        const idx = [0, 2, 4, 2, 1, 3, 4, 3][(s / 2) % 8 | 0];
        this.note(M.lead, this.midi(chord + 12 + sc[idx % sc.length]), st * 1.6, M.lead === 'sawtooth' ? 0.12 : 0.17, t);
      }
      if (beat % 8 === 0) this.kick(t);
      if (beat % 4 === 2) this.hat(t, 0.08);
      if (beat === 12 && this.mood !== 'menu') this.hat(t, 0.14);
      this.nextT += st;
      this.step++;
    }
  },

  note(type, f, dur, vol, t) {
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + dur + 0.02);
  },

  kick(t) {
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.2);
  },

  hat(t, v) {
    if (!Sound.noise) return;
    const s = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    s.buffer = Sound.noise; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(this.gain); s.start(t, Math.random()); s.stop(t + 0.06);
  },
};
