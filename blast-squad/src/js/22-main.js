// ---------- Game: the loop, scenes, settings and test hooks ----------
// Flow: lobby (DOM) -> matchmaking -> VS -> match (canvas) -> result -> lobby. Friendly battles go
// through the network layer when it is present (Friend in 13-sync.js).

const Game = {
  canvas: null, ctx: null, W: 844, H: 390, dpr: 1,
  match: null, last: 0, errors: 0, autoLow: false, wakeLock: null, slowFrames: 0, frames: 0,

  init() {
    this.canvas = $('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    loadGame();
    const pend = SAVE.pending; // a trophy match that never finished (the app was closed): settle it
    if (pend) { SAVE.pending = null; this.settle(pend); }
    Input.init(this.canvas);
    Input.setScreenToWorld((sx, sy) => View.screenToWorld(sx, sy)); // mouse aiming
    UI.onPlay = (ev, bk) => this.play(ev, bk);
    UI.onSettings = (st) => this.applySettings(st);
    if (typeof Friend !== 'undefined') Friend.wire();
    UI.init();
    this.applySettings(SAVE.settings);
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        saveGame();
        if (this.match && !this.match.ended && this.match.net === 'offline') this.pause();
        if (typeof Sound !== 'undefined' && Sound.setMuted) Sound.setMuted(true);
      } else {
        if (typeof Sound !== 'undefined' && Sound.setMuted) Sound.setMuted(false);
        if (this.match) this.keepAwake(true);
      }
    });
    addEventListener('pagehide', () => saveGame());
    addEventListener('keydown', (e) => { if ((e.key === 'Escape' || e.key === 'p') && this.match && !this.match.ended) this.pause(); });
    const unlock = () => { if (typeof Sound !== 'undefined') Sound.init(); };
    addEventListener('pointerdown', unlock, { passive: true });
    addEventListener('touchend', unlock, { passive: true });
    const pb = $('pausebtn');
    if (pb) pb.addEventListener('click', () => this.pause());
    UI.showLobby();
    if (pend) setTimeout(() => UI.toast(pend.result ? 'Your last match was recorded.' : 'You left your last match: it counted as a loss.'), 600);
    if (typeof Music !== 'undefined') Music.play('menu');
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
    this.registerSW();
  },

  registerSW() {
    try {
      const embedded = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
      const ok = !embedded && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
      if (ok) navigator.serviceWorker.register('sw.js').catch(() => {});
    } catch (e) { /* not supported here */ }
  },

  keepAwake(on) {
    try {
      if (on && !this.wakeLock && navigator.wakeLock) {
        navigator.wakeLock.request('screen').then((l) => { this.wakeLock = l; l.addEventListener('release', () => { if (this.wakeLock === l) this.wakeLock = null; }); }).catch(() => {});
      } else if (!on && this.wakeLock) { this.wakeLock.release().catch(() => {}); this.wakeLock = null; }
    } catch (e) { /* unsupported */ }
  },

  vibrate(ms) {
    if (!SAVE.settings.vibrate) return;
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ }
  },

  safeArea() {
    const cs = getComputedStyle($('safe-probe'));
    return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  },

  applySettings(st) {
    if (typeof Sound !== 'undefined') {
      if (Sound.setSfx) Sound.setSfx(st.sound);
      if (Sound.setMusic) Sound.setMusic(st.music);
    }
    Input.leftHanded = !!st.leftHanded;
    this.autoLow = false;
    if (typeof FX !== 'undefined') FX.low = st.quality === 'low';
    this.resize();
  },

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H;
    const q = SAVE ? SAVE.settings.quality : 'auto';
    this.dpr = q === 'low' || (q === 'auto' && this.autoLow) ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const c = this.canvas;
    c.style.width = W + 'px';
    c.style.height = H + 'px';
    c.width = Math.round(W * this.dpr);
    c.height = Math.round(H * this.dpr);
    const safe = this.safeArea();
    View.resize(W, H, this.dpr);
    Input.layout(W, H, safe, this.dpr);
  },

  lowerQuality() {
    this.autoLow = true;
    if (typeof FX !== 'undefined') FX.low = true;
    this.resize();
  },

  // ---- matches ----
  play(ev, bk) {
    if (typeof Sound !== 'undefined') Sound.init();
    const cfg = Meta.matchCfg(ev, bk, Date.now());
    if (!cfg) { UI.toast('This event is not available'); return; }
    UI.showMatchmaking(cfg, () => UI.showVs(cfg, () => this.startMatch(cfg, { net: 'offline' })));
  },

  startMatch(cfg, opts) {
    UI.hideAll();
    // a friendly battle's guest mirrors the host's match (GuestMatch in 13-sync.js)
    this.match = opts && opts.net === 'guest' ? new GuestMatch(cfg, opts) : new Match(cfg, opts);
    this.match.onEnd = (result) => this.endMatch(result);
    // a trophy match is on record from the start: closing the app counts as leaving, and a result is
    // kept as soon as it is known (before its screen shows)
    if (!cfg.friendly) {
      SAVE.pending = { cfg, local: this.match.local };
      saveGame();
      this.match.onResult = (r) => { if (SAVE.pending) { SAVE.pending.result = r; saveGame(); } };
    }
    this.last = 0;
    this.slowFrames = 0;
    this.frames = 0;
    this.showPauseBtn(true);
    this.keepAwake(true);
    if (typeof Music !== 'undefined') Music.play(cfg.mode === MODE.SHOWDOWN ? 'showdown' : 'battle');
    return this.match;
  },

  endMatch(result) {
    const m = this.match;
    if (!m) return;
    const cfg = m.cfg;
    this.showPauseBtn(false);
    this.keepAwake(false);
    if (!cfg.friendly) SAVE.pending = null; // applyResult saves
    const summary = cfg.friendly ? { friendly: true, outcome: outcomeOf(cfg, result, m.local), rank: rankOf(cfg, result, m.local) } : Meta.applyResult(cfg, result, m.local, Date.now());
    if (typeof Music !== 'undefined') Music.play('menu');
    if (m.onFinished) m.onFinished(result);
    if (cfg.friendly && typeof Friend !== 'undefined') summary.rematch = Friend.canRematch();
    UI.showResult(summary, result, cfg, () => { this.match = null; if (cfg.friendly && typeof Friend !== 'undefined') { Friend.backToRoom(); return; } if (cfg.event) { const ev = Meta.events(Date.now()).find((e) => e.mode === cfg.mode && e.ready) || null; if (ev) this.play(ev, SAVE.sel); else UI.showLobby(); } else UI.showLobby(); }, () => { this.match = null; if (cfg.friendly && typeof Friend !== 'undefined') Friend.leave(); UI.showLobby(); });
  },

  pause() {
    const m = this.match;
    if (!m || m.ended) return;
    if (m.net === 'offline') m.paused = true;
    UI.showPause(() => { m.paused = false; }, () => this.leave());
  },

  leave() {
    const m = this.match;
    if (!m) return;
    m.quit();
    if (m.onLeave) m.onLeave();
    this.match = null;
    this.showPauseBtn(false);
    this.keepAwake(false);
    if (typeof Music !== 'undefined') Music.play('menu');
    // leaving a trophy match early counts as a loss (as in the original); a result already known (the
    // match just ended, or a Showdown placement) counts as it is
    const pend = SAVE.pending;
    if (pend && !m.cfg.friendly) {
      SAVE.pending = null;
      if (!pend.result) pend.stats = m.sim.brawlers.map((b) => Object.assign({}, b.st));
      this.settle(pend);
    }
    UI.showLobby();
  },

  // Applies a match that ended without its result screen: its known result, or an abandoned loss.
  settle(p) {
    try {
      const cfg = p.cfg, local = p.local | 0;
      if (p.result) { Meta.applyResult(cfg, p.result, local, Date.now()); return; }
      const r = { winner: cfg.mode === MODE.SHOWDOWN ? -1 : 1 - cfg.slots[local].team, rank: [], mvp: -1, stats: p.stats || [] };
      if (cfg.mode === MODE.SHOWDOWN) { r.rank = cfg.slots.map((s, i) => i).filter((i) => i !== local); r.rank.push(local); }
      Meta.applyResult(cfg, r, local, Date.now(), { abandoned: true });
    } catch (e) { saveGame(); }
  },

  showPauseBtn(on) { const b = $('pausebtn'); if (b) b.style.display = on ? 'block' : 'none'; },

  frame(now) {
    requestAnimationFrame(this.frame);
    let dt = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    const m = this.match;
    if (!m) return; // the lobby is DOM; the canvas sits idle underneath
    try { m.update(dt); } catch (e) { this.report(e); }
    const ctx = this.ctx;
    try { m.draw(ctx, { dt, safe: this.safeArea() }); } catch (e) { this.report(e); }
    // auto quality: a sustained slow frame rate drops the resolution and the particles
    if (SAVE.settings.quality === 'auto' && !this.autoLow && dt > 0) {
      this.frames++;
      if (dt > 0.03) this.slowFrames++;
      if (this.frames >= 120) {
        if (this.slowFrames > 60) this.lowerQuality();
        this.frames = 0; this.slowFrames = 0;
      }
    }
  },

  report(e) {
    this.errors++;
    if (this.errors < 5) console.error(e);
    window.__lastError = String((e && e.stack) || e);
  },
};

function outcomeOf(cfg, result, slot) {
  if (cfg.mode === MODE.SHOWDOWN) return rankOf(cfg, result, slot) <= 4 ? 'win' : 'loss';
  return result.winner === -1 ? 'draw' : result.winner === cfg.slots[slot].team ? 'win' : 'loss';
}
function rankOf(cfg, result, slot) {
  return result.rank && result.rank.indexOf(slot) >= 0 ? result.rank.indexOf(slot) + 1 : 0;
}

// Debug / test hooks (harmless in normal play)
window.__BS = {
  Game, UI, Meta, View, Input,
  save: () => SAVE,
  match: () => Game.match,
  sim: () => (Game.match ? Game.match.sim : null),
  speed: (n) => { if (Game.match) Game.match.speed = n; },
  // the local brawler plays itself (for tests): a bot takes over the local slot
  autoplay: (skill) => {
    const m = Game.match;
    if (!m || typeof Bot === 'undefined') return false;
    m.ctrls[m.local] = new Bot(m.local, { name: 'auto', skill: skill == null ? 0.6 : skill, traits: { aggr: 0.6, patience: 0.5, greed: 0.5, teamwork: 0.7, tilt: 0.2 }, fav: [] }, 4242);
    return true;
  },
  telemetry: () => (Game.match && Game.match.telemetry ? Game.match.telemetry.report() : null),
  modes: () => Object.keys(MODES),
  friend: () => (typeof Friend !== 'undefined' ? Friend : null),
  // friendly battles: snapshot sizes on the host, prediction error on the guest
  net: () => { const m = Game.match; return !m ? null : m.sync ? Object.assign({ role: 'host', rtt: m.sync.link.rtt }, m.sync.stats) : m.report ? Object.assign({ role: 'guest', rtt: m.link.rtt }, m.report()) : null; },
  give: (o) => { Object.assign(SAVE, o); saveGame(); UI.refresh(); },
};

Game.init();
