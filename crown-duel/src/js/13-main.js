// ---------- Home backdrop scene ----------
class HomeScene {
  constructor() { this.t = 0; }
  enter() {
    UI.showScreen('home');
    Music.play('menu');
  }
  update(dt) { this.t += dt; }
  draw(ctx) {
    const W = Game.W, H = Game.H;
    const th = ARENAS[curArena()];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 18; i++) {
      const x = ((i * 97.3 + this.t * (8 + (i % 5) * 3)) % (W + 80)) - 40;
      const y = (i * 53.7) % H;
      ctx.fillStyle = `rgba(255,255,255,${0.03 + (i % 4) * 0.012})`;
      circle(ctx, x, y, 14 + (i % 6) * 9);
      ctx.fill();
    }
  }
  pointer() {}
}

// ---------- Game controller ----------
const Game = {
  canvas: null, ctx: null, W: 360, H: 640, dpr: 1,
  scene: null, last: 0, errors: 0, tickT: 0, ptrId: null,
  installPrompt: null, offlineReady: false,

  init() {
    this.canvas = $('game');
    this.ctx = this.canvas.getContext('2d');
    loadGame();
    UI.init();
    applySettings();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.scene && this.scene.onHidden) this.scene.onHidden();
        saveGame();
        if (Sound.ctx && Sound.ctx.state === 'running') Sound.ctx.suspend().catch(() => {});
      } else {
        if (Sound.ctx) Sound.ctx.resume().catch(() => {});
        if (this.scene instanceof BattleScene) this.keepAwake(true);
        if (this.scene instanceof HomeScene) UI.render();
      }
    });
    addEventListener('pagehide', () => saveGame());
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt = e;
      if (UI.pageName === 'more' && this.scene instanceof HomeScene) UI.renderMore();
    });
    const unlock = () => Sound.init();
    addEventListener('pointerdown', unlock, { passive: true });
    addEventListener('touchend', unlock, { passive: true });
    const c = this.canvas;
    const pos = (e) => [e.clientX, e.clientY];
    c.addEventListener('pointerdown', (e) => {
      if (this.ptrId != null && this.ptrId !== e.pointerId) return;
      this.ptrId = e.pointerId;
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.pointer('down', ...pos(e));
    });
    c.addEventListener('pointermove', (e) => { if (e.pointerId === this.ptrId) this.pointer('move', ...pos(e)); });
    c.addEventListener('pointerup', (e) => { if (e.pointerId === this.ptrId) { this.ptrId = null; this.pointer('up', ...pos(e)); } });
    c.addEventListener('pointercancel', (e) => { if (e.pointerId === this.ptrId) { this.ptrId = null; this.pointer('cancel', ...pos(e)); } });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this.setScene(new HomeScene());
    const room = new URLSearchParams(location.search).get('room');
    if (room && /^[A-Za-z0-9]{4}$/.test(room)) {
      Lobby.pendingCode = room.toUpperCase();
      UI.page('online');
      setTimeout(() => Lobby.start('join', Lobby.pendingCode), 300);
      try { history.replaceState(null, '', location.pathname + location.search.replace(/[?&]room=[^&]*/, '').replace(/^&/, '?')); } catch (e) { /* ignore */ }
    }
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
    this.registerSW();
  },

  pointer(type, x, y) {
    if (this.scene && this.scene.pointer) {
      try { this.scene.pointer(type, x, y); } catch (e) { this.report(e); }
    }
  },

  registerSW() {
    try {
      const ok = !this.isEmbedded() && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
      if (!ok) return;
      navigator.serviceWorker.register('sw.js').then((reg) => {
        if (navigator.serviceWorker.controller) this.offlineReady = true;
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (w) w.addEventListener('statechange', () => { if (w.state === 'activated') this.offlineReady = true; });
        });
      }).catch(() => {});
    } catch (e) { /* not supported here */ }
  },

  // Inside another page's frame the game can't be installed or cached offline.
  isEmbedded() { try { return window.self !== window.top; } catch (e) { return true; } },

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
    if (!SAVE.settings.vibrate) return;
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ }
  },

  safeArea() {
    const cs = getComputedStyle($('safe-probe'));
    return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  },

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W;
    this.H = H;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = this.canvas;
    c.style.width = W + 'px';
    c.style.height = H + 'px';
    c.width = Math.round(W * this.dpr);
    c.height = Math.round(H * this.dpr);
    if (this.scene && this.scene.view) this.scene.view.layout(W, H, this.safeArea());
  },

  setScene(s) {
    if (this.scene && this.scene.exit) this.scene.exit();
    this.ptrId = null;
    this.scene = s;
    if (s.view) s.view.layout(this.W, this.H, this.safeArea());
    if (s.enter) s.enter();
  },

  startAIBattle(training) {
    Sound.init();
    const opp = aiOpponent(training);
    this.setScene(new BattleScene({
      mode: training ? 'training' : 'ai',
      decks: [curDeck().slice(), opp.deck], levels: [deckLevels(), opp.levels], kings: [SAVE.king, opp.king],
      names: [SAVE.name, opp.name], subs: ['', training ? 'Practice match' : '🏆 ' + opp.trophies],
      arena: training ? 0 : curArena(), seed: randi(1, 1e9), aiSkill: opp.skill, oppTrophies: opp.trophies,
    }));
  },

  battleOver(scene) {
    const res = scene.result, my = scene.myTeam;
    const r = { mode: scene.mode, win: res.winner === my, draw: res.winner === -1, myCrowns: res.crowns[my], theirCrowns: res.crowns[1 - my], oppTrophies: scene.cfg.oppTrophies || SAVE.trophies };
    const rw = applyResult(r);
    UI.resultModal(scene, r, rw);
  },

  toHome(arenaUp) {
    this.setScene(new HomeScene());
    UI.page('battle');
    if (arenaUp != null) setTimeout(() => UI.arenaUnlocked(arenaUp), 250);
  },

  frame(now) {
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    try { this.scene.update(dt); } catch (e) { this.report(e); }
    this.tickT += dt;
    if (this.tickT >= 1) { this.tickT = 0; try { UI.tick(); } catch (e) { this.report(e); } }
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    try { this.scene.draw(ctx); } catch (e) { this.report(e); }
  },

  report(e) {
    this.errors++;
    if (this.errors < 5) console.error(e);
    window.__lastError = String((e && e.stack) || e);
  },
};

// Debug / test hooks (harmless in normal play)
window.__CD = {
  Game, UI, Lobby, Net,
  save: () => SAVE,
  scene: () => Game.scene,
  speed: (n) => { if (Game.scene) Game.scene.speed = n; },
  // lets tests hand the player's side to an AI
  autoplay: (skill) => { const s = Game.scene; if (s && s.sim) s.bot = new AIPlayer(s.sim, s.myTeam, skill == null ? 0.7 : skill, 4242); },
};

Game.init();
