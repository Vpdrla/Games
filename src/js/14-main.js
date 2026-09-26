// ---------- Save data ----------
let SAVE = null;
const SAVE_KEY = 'stickman-odyssey-save-v1';

function loadGame() {
  const d0 = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      SAVE = Object.assign(d0, d);
      SAVE.up = Object.assign(defaultSave().up, d.up || {});
      SAVE.settings = Object.assign(defaultSave().settings, d.settings || {});
      SAVE.stats = Object.assign(defaultSave().stats, d.stats || {});
      SAVE.done = d.done || {};
      SAVE.ranks = d.ranks || {};
      SAVE.seen = d.seen || {};
      if (!WEAPONS[SAVE.weapon]) SAVE.weapon = 'fists';
      if (!Array.isArray(SAVE.slots) || SAVE.slots.length !== 2) SAVE.slots = ['blast', null];
      if (!MAP.nodes[SAVE.at]) SAVE.at = 'r0-town';
      SAVE.done['r0-town'] = true;
      return;
    }
  } catch (e) { /* corrupted or unavailable storage: start fresh */ }
  SAVE = d0;
  SAVE.done['r0-town'] = true;
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* storage unavailable */ }
}

function newGame() {
  const s = SAVE ? SAVE.settings : null;
  SAVE = defaultSave();
  if (s) SAVE.settings = s;
  SAVE.done['r0-town'] = true;
  SAVE.started = true;
  saveGame();
}

function grantXp(n) {
  SAVE.xp += n;
  let lv = 0;
  while (SAVE.xp >= xpNeed(SAVE.lvl)) {
    SAVE.xp -= xpNeed(SAVE.lvl);
    SAVE.lvl++;
    lv++;
  }
  saveGame();
  return lv;
}

// ---------- Game controller ----------
const Game = {
  canvas: null, ctx: null, W: 640, H: 360, pxScale: 1,
  scene: null, last: 0, acc: 0, errors: 0,
  installPrompt: null, offlineReady: false,

  init() {
    this.canvas = $('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    loadGame();
    Input.init(this.canvas);
    UI.init();
    this.resize();
    applySettings();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.scene && this.scene.onHidden) this.scene.onHidden();
        saveGame();
        if (Sound.ctx && Sound.ctx.state === 'running') Sound.ctx.suspend().catch(() => {});
      } else {
        if (Sound.ctx) Sound.ctx.resume().catch(() => {});
        if (this.scene && this.scene.usesControls) this.keepAwake(true);
      }
    });
    addEventListener('pagehide', () => saveGame());
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt = e;
      UI.refreshTitleFoot();
    });
    const unlock = () => Sound.init();
    addEventListener('pointerdown', unlock, { passive: true });
    addEventListener('touchend', unlock, { passive: true });
    this.setScene(new TitleScene());
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
    this.registerSW();
  },

  registerSW() {
    try {
      const ok = !this.isEmbedded() && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
      if (!ok) return;
      navigator.serviceWorker.register('sw.js').then((reg) => {
        if (navigator.serviceWorker.controller) this.offlineReady = true;
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (w) w.addEventListener('statechange', () => {
            if (w.state === 'activated') { this.offlineReady = true; UI.refreshTitleFoot(); }
          });
        });
        UI.refreshTitleFoot();
      }).catch(() => {});
    } catch (e) { /* not supported here */ }
  },

  // Inside another page's frame the game can't be installed or cached offline.
  isEmbedded() { try { return window.self !== window.top; } catch (e) { return true; } },
  isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
  isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; },

  tryFullscreen() {
    if (!Input.touchMode || this.isStandalone()) return;
    const d = document.documentElement;
    const req = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      const p = req.call(d, { navigationUI: 'hide' });
      const lock = () => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* unsupported */ } };
      if (p && p.then) p.then(lock).catch(() => {});
      else lock();
    } catch (e) { /* denied */ }
  },
  toggleFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const d = document.documentElement;
      const req = d.requestFullscreen || d.webkitRequestFullscreen;
      if (req) { try { const p = req.call(d); if (p && p.catch) p.catch(() => {}); } catch (e) { /* denied */ } }
    }
  },

  // Keep the phone screen on while a stage is being played.
  keepAwake(on) {
    try {
      if (on && !this.wakeLock && navigator.wakeLock) {
        navigator.wakeLock.request('screen').then((l) => {
          this.wakeLock = l;
          l.addEventListener('release', () => { if (this.wakeLock === l) this.wakeLock = null; });
        }).catch(() => {});
      } else if (!on && this.wakeLock) {
        this.wakeLock.release().catch(() => {});
        this.wakeLock = null;
      }
    } catch (e) { /* unsupported */ }
  },

  vibrate(ms) {
    if (!SAVE.settings.shake) return;
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ }
  },

  safeArea() {
    const probe = $('safe-probe');
    if (!probe) return { left: 0, right: 0 };
    const cs = getComputedStyle(probe);
    return { left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0 };
  },

  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const a = vw / vh;
    let cw = vw, ch = vh;
    if (a < 1.3) ch = Math.round(vw / 1.3);
    else if (a > 2.4) cw = Math.round(vh * 2.4);
    const c = this.canvas;
    c.style.width = cw + 'px';
    c.style.height = ch + 'px';
    c.style.left = Math.round((vw - cw) / 2) + 'px';
    c.style.top = Math.round((vh - ch) / 2) + 'px';
    this.H = 360;
    this.W = Math.round((360 * cw) / ch);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);
    this.pxScale = c.height / this.H;
    const sa = this.safeArea();
    const cssPerLogical = ch / this.H;
    const cl = (vw - cw) / 2;
    Input.safeL = Math.max(0, sa.left - cl) / cssPerLogical;
    Input.safeR = Math.max(0, sa.right - cl) / cssPerLogical;
    Input.view = { W: this.W, H: this.H };
    Input.layout(this.W, this.H);
    UI.setPortrait(a < 1);
  },

  setScene(s) {
    if (this.scene && this.scene.exit) this.scene.exit();
    Input.reset();
    this.scene = s;
    Input.active = !!s.usesControls;
    if (s.enter) s.enter();
  },

  startLevel(def) {
    this.setScene(new LevelScene(def));
  },

  toMap(after) {
    saveGame();
    const m = new MapScene();
    this.setScene(m);
    if (after) after(m);
  },

  finishLevel(scene) {
    const r = scene.result;
    if (scene.def.kind === 'ambush') { this.toMap((m) => m.afterArrive()); return; }
    if (r && r.final) { this.toMap(() => UI.ending()); return; }
    this.toMap();
  },

  frame(now) {
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      Input.poll();
      try { this.scene.update(STEP); } catch (e) { this.report(e); }
      this.acc -= STEP;
      steps++;
    }
    if (steps >= 5) this.acc = 0;
    const ctx = this.ctx;
    ctx.setTransform(this.pxScale, 0, 0, this.pxScale, 0, 0);
    try { this.scene.draw(ctx); } catch (e) { this.report(e); }
  },

  report(e) {
    this.errors++;
    if (this.errors < 5) console.error(e);
    window.__lastError = String(e && e.stack || e);
  },
};

// Debug / test hooks (harmless in normal play)
window.__SO = {
  Game, MAP, REGIONS, Input, generateLevel, levelDefFor,
  save: () => SAVE,
  play: (nodeId) => Game.startLevel(levelDefFor(MAP.nodes[nodeId])),
};

Game.init();
