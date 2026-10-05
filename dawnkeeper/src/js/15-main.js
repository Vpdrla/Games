// ---------- Scenes and the game controller ----------
const GEM_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

// Animated night backdrop behind the menus.
class HomeScene {
  constructor() {
    this.t = 0;
    this.stars = [];
    for (let i = 0; i < 90; i++) this.stars.push({ x: Math.random(), y: Math.random() * 0.75, r: rand(0.5, 1.6), p: rand(0, TAU) });
    this.flies = [];
    for (let i = 0; i < 16; i++) this.flies.push({ x: Math.random(), y: rand(0.55, 0.95), p: rand(0, TAU), s: rand(0.3, 1) });
  }
  enter() {
    UI.showScreen('home');
    Music.play('menu');
    Music.intensity = null;
  }
  update(dt) { this.t += dt; }
  draw(ctx) {
    const W = Game.W, H = Game.H, t = this.t;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05061a');
    g.addColorStop(0.6, '#1a1c48');
    g.addColorStop(1, '#3a2a48');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of this.stars) {
      ctx.globalAlpha = 0.45 + Math.sin(t * 2 + s.p) * 0.35;
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // moon
    const mx = W * 0.78, my = H * 0.16, mr = Math.min(W, H) * 0.09;
    ctx.drawImage(Glow.get('#d8e0ff', 64), mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    ctx.fillStyle = '#f2f0ff';
    circle(ctx, mx, my, mr);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,180,220,0.5)';
    circle(ctx, mx - mr * 0.3, my - mr * 0.2, mr * 0.18);
    ctx.fill();
    circle(ctx, mx + mr * 0.25, my + mr * 0.3, mr * 0.12);
    ctx.fill();
    // bats crossing the moon
    for (let i = 0; i < 3; i++) {
      const u = ((t * 0.06 + i * 0.33) % 1);
      const bx = W * (1.1 - u * 1.3), by = H * (0.12 + i * 0.07) + Math.sin(t * 3 + i) * 8;
      const spr = Sprites.get('bat', 'bat', Math.floor(t * 8 + i) % 2, true, 'n', 8 * Game.dpr);
      const s = spr.width / Game.dpr;
      ctx.drawImage(spr, bx - s / 2, by - s / 2, s, s);
    }
    // hills and graves
    const hy = H * 0.5;
    ctx.fillStyle = '#10122c';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, hy + 20);
    for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, hy + Math.sin(x * 0.012) * 18 + Math.sin(x * 0.031) * 8);
    ctx.lineTo(W, H);
    ctx.fill();
    for (let i = 0; i < 7; i++) {
      const x = W * (0.06 + i * 0.15), y = hy + Math.sin(x * 0.012) * 18 + 4;
      ctx.fillStyle = '#0a0b20';
      roundRect(ctx, x - 9, y - 26 + (i % 3) * 4, 18, 30, 8);
      ctx.fill();
    }
    // hero with lantern
    const hx = W / 2, hyy = hy + 6;
    ctx.globalCompositeOperation = 'lighter';
    const fl = 1 + Math.sin(t * 8) * 0.05;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(Glow.get('#ffb050', 64), hx + 14 - 90 * fl, hyy - 30 - 90 * fl, 180 * fl, 180 * fl);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const ch = CHARACTERS[SAVE.sel.char] || CHARACTERS.lumen;
    const hs = Sprites.get('hero-home:' + SAVE.sel.char, ch.look, Math.floor(t * 2) % 2, false, 'n', 18 * Game.dpr);
    const s = hs.width / Game.dpr;
    ctx.drawImage(hs, hx - s / 2, hyy - s / 2 - 10, s, s);
    // fireflies
    for (const f of this.flies) {
      const x = (f.x * W + Math.sin(t * f.s + f.p) * 30 + W) % W, y = f.y * H + Math.cos(t * f.s * 1.3 + f.p) * 14;
      ctx.globalAlpha = 0.4 + Math.sin(t * 3 + f.p) * 0.4;
      ctx.drawImage(Glow.get('#ffe27a', 16), x - 6, y - 6, 12, 12);
    }
    ctx.globalAlpha = 1;
  }
}

class RunScene {
  constructor(cfg) {
    this.cfg = cfg;
    this.run = new Run(Object.assign({ power: powerRanks(), weapons: SAVE.weapons.slice() }, cfg));
    this.view = new View(this.run);
    this.speed = 1;
    this.acc = 0;
    this.bot = null;
    this.autoPick = false;
    this.ended = false;
    this.endT = 0;
    this.quitRun = false;
    this.paused = false;
    this.achT = 2;
    this.achGot = [];
    this.gemStep = 0;
    this.gemT = 0;
    this.slow = 0;
    this.hintT = SAVE.tutorial ? -1 : 0;
    this.frames = 0;
    this.frameSum = 0;
    this.trackName = this.run.stage.key;
  }

  enter() {
    UI.showScreen('hud');
    Input.active = true;
    Input.reset();
    Input.moved = false;
    Music.play(this.trackName);
    Music.intensity = 1;
    Game.keepAwake(true);
    this.view.dmgNums = SAVE.settings.dmgNums;
    this.view.fx.low = SAVE.settings.quality === 'low' || Game.autoLow;
    const h = $('hint');
    if (this.hintT >= 0) {
      h.innerHTML = 'Drag anywhere to move<small>Your weapons attack on their own. Grab the gems!</small>';
      h.style.opacity = '1';
    } else h.style.opacity = '0';
    for (const k of Object.keys(this.run.mods)) this.view.say(DAILY_MODS[k].name, DAILY_MODS[k].desc, '#d8b0ff', 2.6);
  }

  exit() {
    Input.active = false;
    Game.keepAwake(false);
    $('hint').style.opacity = '0';
  }

  openPause() {
    if (this.ended || UI.modalOpen) return;
    this.paused = true;
    this.pauseOpen = true;
    UI.pause(this);
  }

  resume() {
    this.paused = false;
    this.pauseOpen = false;
    Input.reset();
  }

  pick(c) {
    this.run.applyChoice(c);
    Sound.play('select');
    this.resume();
  }

  quit() {
    if (this.ended) return;
    this.ended = true;
    this.quitRun = true;
    this.endT = 0.01;
  }

  sound(ev) {
    const run = this.run;
    switch (ev[0]) {
      case 'sfx': Sound.play(ev[1]); break;
      case 'gem': {
        const now = run.time;
        this.gemStep = now - this.gemT < 0.45 ? Math.min(GEM_STEPS.length - 1, this.gemStep + 1) : 0;
        this.gemT = now;
        Sound.play('gem', Math.pow(2, GEM_STEPS[this.gemStep] / 12));
        break;
      }
      case 'dmg': Sound.play('hit'); break;
      case 'kill':
        if (ev[4] === 2) { Sound.play('killBig'); Game.vibrate([60, 30, 90]); this.slow = 0.8; } else if (ev[4] === 1) Sound.play('boom');
        else Sound.play('kill');
        break;
      case 'hurt': Sound.play('hurt'); Game.vibrate(25); break;
      case 'heal': if (ev[1] >= 3) Sound.play('heal'); break;
      case 'coin': Sound.play('coin'); break;
      case 'chest': Sound.play('chest'); break;
      case 'boom': Sound.play('boom'); break;
      case 'spike': Sound.play('spike'); break;
      case 'slam': Sound.play('slam'); Game.vibrate(40); break;
      case 'blink': Sound.play('blink'); break;
      case 'summon': Sound.play('summon'); break;
      case 'eshot': Sound.play('eshot'); break;
      case 'magnet': Sound.play('magnet'); break;
      case 'bomb': Sound.play('bomb'); Game.vibrate(80); break;
      case 'prop': Sound.play('hit'); break;
      case 'boss': Sound.play('boss'); Music.play('boss'); Game.vibrate([60, 40, 60]); break;
      case 'bossWarn': Sound.play('warn'); break;
      case 'bossDown': Sound.play('unlock'); Music.play(this.trackName); break;
      case 'swarm': case 'ring': Sound.play('swarm'); break;
      case 'dawn': Sound.play('victory'); Music.play('dawn'); Music.intensity = null; break;
      case 'death':
        Sound.play('defeat');
        Music.stop();
        Game.vibrate([100, 50, 200]);
        this.view.fx.puff(run.player.x, run.player.y, 40, '#ffffff', 0.8);
        this.view.fx.sparks(run.player.x, run.player.y, 30, '#ffb050', 200);
        this.view.dead = true;
        break;
      case 'revive': Sound.play('revive'); break;
      case 'newWeapon': SAVE.seen.w[ev[1]] = 1; break;
    }
  }

  handleEvents() {
    const evs = this.run.events;
    for (const ev of evs) {
      this.view.onEvent(ev);
      this.sound(ev);
    }
    evs.length = 0;
  }

  update(dt) {
    const run = this.run;
    if (Input.takePause()) {
      if (UI.modalOpen && this.pauseOpen) { UI.closeModal(); this.resume(); } else this.openPause();
    }
    if (this.ended) {
      this.view.update(dt);
      this.handleEvents();
      if (this.endT > 0) {
        this.endT -= dt;
        if (this.endT <= 0) Game.endRun(this, this.quitRun);
      }
      return;
    }
    if (this.paused || UI.modalOpen) return;
    // frame timing for automatic quality
    if (SAVE.settings.quality === 'auto' && !Game.autoLow && Game.dpr > 1) {
      this.frames++;
      this.frameSum += dt;
      if (this.frames >= 90) {
        if (this.frameSum / this.frames > 0.024) Game.lowerQuality();
        this.frames = 0;
        this.frameSum = 0;
      }
    }
    Input.poll();
    if (this.bot) this.bot.update(dt);
    else run.setMove(Input.mx, Input.my);
    if (this.hintT >= 0) {
      this.hintT += dt;
      if ((Input.moved && this.hintT > 2.5) || this.hintT > 9) {
        this.hintT = -1;
        $('hint').style.opacity = '0';
        SAVE.tutorial = true;
        saveGame();
      }
    }
    let sd = dt * this.speed;
    if (this.slow > 0) { this.slow -= dt; sd *= 0.3; }
    this.acc += sd;
    let n = 0;
    const maxSteps = 5 * this.speed;
    while (this.acc >= SIM_DT && n < maxSteps) {
      this.acc -= SIM_DT;
      run.step();
      n++;
      this.handleEvents();
      if (run.pendingLevels > 0 || run.chests.length || run.over) break;
    }
    if (this.acc > SIM_DT * 3) this.acc = 0;
    this.view.update(sd);
    const minute = run.T / 60;
    if (!run.boss) Music.intensity = minute < 2 ? 1 : minute < 7 ? 2 : 3;
    this.achT -= dt;
    if (this.achT <= 0) {
      this.achT = 2;
      const got = checkAchievements(run.summary());
      if (got.length) { this.achGot.push(...got); UI.achToasts(got); }
    }
    if (run.over) {
      this.ended = true;
      this.endT = run.won ? 2.2 : 1.8;
      return;
    }
    if (run.chests.length) {
      const ch = run.chests.shift();
      const res = run.openChest(ch);
      if (this.autoPick) return;
      this.paused = true;
      UI.chest(this, res, !!ch.boss);
    } else if (run.pendingLevels > 0) {
      const choices = run.rollChoices();
      if (this.autoPick) {
        run.applyChoice(this.bot ? this.bot.choose(choices) : choices[0]);
        return;
      }
      this.paused = true;
      Sound.play('level');
      Game.vibrate(30);
      UI.levelUp(this, choices);
    }
  }

  draw(ctx) {
    this.view.draw(ctx);
  }
}

// ---------- Game controller ----------
const Game = {
  canvas: null, ctx: null, W: 360, H: 640, dpr: 1,
  scene: null, last: 0, errors: 0,
  installPrompt: null, offlineReady: false, autoLow: false, wakeLock: null,

  init() {
    this.canvas = $('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    loadGame();
    UI.init();
    Input.init(this.canvas);
    applySettings();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.scene instanceof RunScene) this.scene.openPause();
        saveGame();
        if (Sound.ctx && Sound.ctx.state === 'running') Sound.ctx.suspend().catch(() => {});
      } else {
        if (Sound.ctx) Sound.ctx.resume().catch(() => {});
        if (this.scene instanceof RunScene) this.keepAwake(true);
      }
    });
    addEventListener('pagehide', () => saveGame());
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt = e;
      if (UI.cur === 'home') UI.renderFoot();
    });
    const unlock = () => Sound.init();
    addEventListener('pointerdown', unlock, { passive: true });
    addEventListener('touchend', unlock, { passive: true });
    this.setScene(new HomeScene());
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
          if (w) w.addEventListener('statechange', () => { if (w.state === 'activated') this.offlineReady = true; });
        });
      }).catch(() => {});
    } catch (e) { /* not supported here */ }
  },

  // Inside another page's frame the game can't be installed or cached offline.
  isEmbedded() { try { return window.self !== window.top; } catch (e) { return true; } },
  isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
  isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; },

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

  applyQuality() {
    this.autoLow = false;
    this.resize();
    if (this.scene instanceof RunScene) this.scene.view.fx.low = SAVE.settings.quality === 'low';
  },

  lowerQuality() {
    this.autoLow = true;
    this.resize();
    if (this.scene instanceof RunScene) this.scene.view.fx.low = true;
  },

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W;
    this.H = H;
    const q = SAVE ? SAVE.settings.quality : 'auto';
    this.dpr = q === 'low' || (q === 'auto' && this.autoLow) ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const c = this.canvas;
    c.style.width = W + 'px';
    c.style.height = H + 'px';
    c.width = Math.round(W * this.dpr);
    c.height = Math.round(H * this.dpr);
    if (this.scene && this.scene.view) this.scene.view.layout(W, H, this.safeArea(), this.dpr);
  },

  setScene(s) {
    if (this.scene && this.scene.exit) this.scene.exit();
    this.scene = s;
    if (s.view) s.view.layout(this.W, this.H, this.safeArea(), this.dpr);
    if (s.enter) s.enter();
  },

  startRun(cfg) {
    Sound.init();
    const c = Object.assign({ seed: randi(1, 1e9) }, cfg);
    if (c.mode !== 'daily') c.seed = randi(1, 1e9);
    this.setScene(new RunScene(c));
  },

  endRun(scene, quit) {
    const out = applyRunResult(scene.run, quit);
    out.ach = scene.achGot.concat(out.ach);
    UI.result(scene, out, quit);
  },

  toHome() {
    this.setScene(new HomeScene());
  },

  frame(now) {
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    try { this.scene.update(dt); } catch (e) { this.report(e); }
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
window.__DK = {
  Game, UI, Sprites,
  save: () => SAVE,
  scene: () => Game.scene,
  run: () => (Game.scene && Game.scene.run) || null,
  speed: (n) => { if (Game.scene) Game.scene.speed = n; },
  autoplay: (autoPick) => { const s = Game.scene; if (s && s.run) { s.bot = new Bot(s.run, 1); s.autoPick = !!autoPick; } },
  giveXp: (v) => { const r = __DK.run(); if (r) r.gainXp(v); },
  setTime: (t) => { const r = __DK.run(); if (r) { r.T = t; r.time = t / r.scale; } },
  spawn: (type, n) => {
    const r = __DK.run();
    if (!r) return;
    for (let i = 0; i < (n || 1); i++) { spawnPoint(r, SPT); spawnEnemy(r, type, SPT.x, SPT.y); }
  },
  hurt: (v) => { const r = __DK.run(); if (r) r.hurt(v); },
};

Game.init();
