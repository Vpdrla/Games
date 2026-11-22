// ---------- Game: scenes, the frame loop, local and online sessions ----------

const Game = {
  scene: 'menu', world: null, view: null, mirror: null, players: [], locals: [], online: null, host: null, guest: null,
  paused: false, acc: 0, last: 0, t: 0, demo: null, cfg: null, lastParty: null, loot: [], ended: false, endT: 0,
  guestInput: { mx: 0, my: 0, skill: false, ult: false, dash: false, aim: null, aimD: 0 }, guestDev: 'kb1', mood: null,

  init() {
    Meta.load();
    applySettings();
    View.init($('game'));
    Input.init($('game'));
    UI.init();
    Input.onPause = () => this.togglePause();
    const unlock = () => { Sound.unlock(); Music.start(this.mood || 'menu'); };
    addEventListener('pointerdown', unlock, true);
    addEventListener('keydown', unlock, true);
    addEventListener('orientationchange', () => setTimeout(() => View.resize(), 250));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.scene === 'play' && !this.online && !this.paused) UI.showPause(); });
    this.makeDemo();
    UI.showMenu();
    this.setMood('menu');
    Meta.connectCloud().then((r) => { if (r === 'loaded') { applySettings(); if (this.scene === 'menu' && !UI.cur) UI.showMenu(); UI.toast(tr('Progress loaded from your Claude account')); } });
    try {
      if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && !/claude\.(ai|site)|claudeusercontent/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
    } catch (e) { /* not available */ }
    requestAnimationFrame((t) => this.loop(t));
  },

  setMood(m) { if (this.mood !== m) { this.mood = m; Music.start(m); } },

  // ---------- menu background: bots raiding a realm ----------
  makeDemo() {
    const realm = 1 + Math.floor(Math.random() * Math.min(5, Meta.highestRealm() + 1));
    const w = new World({ seed: (Math.random() * 1e9) | 0 });
    w.mode = new RunMode(w, { kind: 'adventure', realm: Math.min(5, realm), diff: 0 });
    const picks = ['brand', 'ember', 'hawke', 'willow', 'volt', 'nyx', 'rime', 'krag', 'lyra', 'gizmo', 'umbra', 'drakon'];
    for (let i = 0; i < 4; i++) {
      const hero = picks[(Math.random() * picks.length) | 0];
      const pl = { slot: i, kind: 'bot', name: '', hero, lvl: 6 + realm * 4, load: { mods: { dmg: 0.4 * realm, hp: 0.4 * realm }, uniq: [] }, team: 0, bot: new HeroBot(2, i + 1) };
      w.players.push(pl);
      w.spawnHero(pl, 700, 800);
    }
    this.demo = w;
    View.floorRoom = null;
  },

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this.t += dt;
    Input.pollPads();
    UI.tickToasts();
    UI.tickSetup();
    UI.tickOffers();
    try {
      if (this.scene === 'play' || this.scene === 'results') this.playFrame(now, dt);
      else this.menuFrame(now, dt);
    } catch (e) {
      console.error(e);
      if (!this.crashed) { this.crashed = true; UI.toast(tr('Something went wrong: ') + esc(e.message)); }
    }
    Input.endFrame();
  },

  menuFrame(now, dt) {
    const w = this.demo;
    if (!w || w.mode.result || w.t > 300) this.makeDemo();
    const d = this.demo;
    this.acc += dt;
    let n = 0;
    while (this.acc >= SIM_DT && n < 3) {
      for (const pl of d.players) if (pl.unit) pl.bot.think(d, pl.unit, SIM_DT);
      d.step();
      n++;
      this.acc -= SIM_DT;
    }
    if (n === 3) this.acc = 0;
    const evs = d.ev; d.ev = [];
    Sound.muted = true;
    FX.localTeam = 0;
    FX.handle(evs, d, null);
    Sound.muted = false;
    FX.update(dt);
    const hs = d.heroes();
    View.updateCam(d, hs, dt);
    View.drawWorld(d, this.t, []);
    UI.tickMenu(this.t);
  },

  localUnits() {
    if (this.mirror) return this.mirror.me ? [this.mirror.me] : [];
    return this.locals.map((p) => p.unit).filter(Boolean);
  },

  playFrame(now, dt) {
    let evs = [];
    let view;
    if (this.mirror) {
      view = this.mirror;
      const inp = this.guestInput;
      if (this.scene === 'play') {
        Input.read(this.guestDev, inp);
        if (this.mirror.me) this.mouseAim(this.guestDev, this.mirror.me, inp);
        if (this.guest) this.guest.input(inp, dt);
      }
      this.mirror.frame(now, dt, inp);
      evs = this.mirror.ev;
      this.mirror.ev = [];
    } else {
      const w = this.world;
      view = w;
      if (this.scene === 'play' && (!this.paused || this.online)) {
        for (const pl of this.locals) if (pl.unit) { Input.read(pl.dev, pl.unit.input); this.mouseAim(pl.dev, pl.unit, pl.unit.input); }
        const sp = this.speed || 1;
        this.acc += dt * (FX.slowmo > 0 ? 0.35 : 1) * sp;
        let n = 0;
        while (this.acc >= SIM_DT && n < 4 * sp) {
          for (const pl of w.players) if (pl.kind === 'bot' && pl.unit) pl.bot.think(w, pl.unit, SIM_DT);
          if (this.autopilot) for (const pl of this.locals) if (pl.unit) { pl.ap = pl.ap || new HeroBot(2, 77); pl.ap.think(w, pl.unit, SIM_DT); }
          w.step();
          const e = w.ev; w.ev = [];
          if (this.host) this.host.afterStep(w, e);
          for (const x of e) evs.push(x);
          this.acc -= SIM_DT;
          n++;
        }
        if (n >= 4 * sp) this.acc = 0;
        if (this.autopilot && UI.offer) for (const r of UI.offer.rows) if (!r.done) UI.pickOffer(r.slot, 0);
      }
      if (w.mode.result && !this.ended) { this.ended = true; this.endT = 1.3; }
      if (this.ended && this.scene === 'play') { this.endT -= dt; if (this.endT <= 0) this.finishRun(); }
    }
    this.handleEvents(evs, view);
    const locals = this.localUnits();
    FX.localTeam = locals.length ? locals[0].team : 0;
    FX.handle(evs, view, new Set(locals.map((u) => u.id)));
    FX.update(dt);
    View.updateCam(view, locals, dt);
    View.drawWorld(view, this.t, locals);
    const devs = {};
    if (this.mirror) { if (this.mirror.me) devs[this.mirror.me.id] = this.guestDev; }
    else for (const p of this.locals) if (p.unit) devs[p.unit.id] = p.dev;
    const touch = this.mirror ? this.guestDev === 'touch' : this.locals.some((p) => p.dev === 'touch');
    if (this.scene === 'play') View.drawHud(view, this.t, locals, { touch, devs });
    const boss = view.mode && view.mode.hud ? view.mode.hud().boss : null;
    if (this.cfg) this.setMood(this.cfg.mode === 'arena' ? 'arena' : boss || (view.boss && !view.boss.dead) ? 'boss' : this.realmMood(view));
  },

  realmMood(view) {
    const r = view.room && view.room.realm ? REALMS[view.room.realm - 1] : null;
    return r ? r.key : 'woods';
  },

  mouseAim(dev, u, inp) {
    if (dev !== 'kb1' || Input.usedTouch || performance.now() - Input.mouse.t > 3000 || inp.aimStick) return;
    if (!inp.skill && !inp.ult) return;
    const sp = View.toScreen(u.x, u.y);
    const dx = Input.mouse.x - sp.x, dy = Input.mouse.y - sp.y;
    if (dx * dx + dy * dy < 400) return;
    inp.aim = Math.atan2(dy, dx);
    inp.aimD = clamp(Math.hypot(dx, dy) / (380 * View.cam.z), 0.15, 1);
  },

  handleEvents(evs, view) {
    for (const e of evs) {
      if (e[0] === 'offers' && !this.mirror) this.offerRows();
      else if (e[0] === 'loot' && !this.mirror) { if (this.locals.some((p) => p.slot === e[1])) this.gotLoot(e[2], e[3]); }
      else if (e[0] === 'room') View.floorRoom = null;
    }
  },

  gotLoot(ilvl, bonus) {
    const it = Meta.makeItem(ilvl, bonus, Meta.s.talents.luck || 0);
    this.loot.push(it);
    UI.lootToast(it);
  },

  offerRows() {
    const m = this.world.mode;
    const rows = [];
    for (const pl of this.locals) {
      const of = m.offers && m.offers[pl.slot];
      if (of && !of.done) rows.push({ slot: pl.slot, dev: pl.dev, name: pl.name, hero: pl.hero, ids: of.ids.slice(), rerolls: of.rerolls, have: pl.unit ? pl.unit.bless : null });
    }
    if (rows.length) UI.showOffers(rows);
  },

  pickBlessing(slot, idx) {
    if (this.mirror) { if (this.guest) this.guest.send({ t: 'pick', idx }); return; }
    if (this.world && this.world.mode.pick) this.world.mode.pick(slot, idx);
  },

  rerollBlessing(slot) {
    if (this.mirror) { if (this.guest) this.guest.send({ t: 'reroll' }); return; }
    if (this.world && this.world.mode.reroll) this.world.mode.reroll(slot);
  },

  togglePause() {
    if (this.scene !== 'play') return;
    if ($('pause').classList.contains('show')) UI.hidePause(); else UI.showPause();
  },

  // ---------- local games ----------
  startLocal(cfg, party) {
    this.leaveOnline(true);
    this.lastParty = party.map((p) => Object.assign({}, p));
    const seed = (Math.random() * 1e9) | 0;
    const players = [];
    let li = 0, bi = 0;
    party.forEach((p, i) => {
      const info = p.kind === 'local' ? Meta.playerInfo(p.hero) : Meta.botInfo(p.hero);
      const pl = Object.assign(info, { slot: i, kind: p.kind, dev: p.dev, team: cfg.mode === 'arena' ? p.team || 0 : 0 });
      pl.name = p.kind === 'local' ? (li === 0 ? Meta.s.name : 'P' + (li + 1)) : BOT_NAMES[(seed + bi++ * 7) % BOT_NAMES.length];
      if (p.kind === 'local') li++;
      if (p.kind === 'bot') pl.bot = new HeroBot(Meta.s.settings.botSkill, seed + i);
      players.push(pl);
    });
    this.begin(cfg, players, seed);
  },

  begin(cfg, players, seed) {
    const w = new World({ seed });
    w.players = players;
    if (cfg.mode === 'arena') {
      for (const p of players) { p.lvl = 10; p.load = { mods: {}, uniq: [] }; p.luck = 0; p.ankh = false; }
      w.mode = new ArenaMode(w, { teams: cfg.teams, target: cfg.target || 10, time: 180 });
    } else w.mode = new RunMode(w, { kind: cfg.mode, realm: cfg.realm, diff: cfg.diff || 0 });
    for (const pl of players) w.spawnHero(pl, 700, 800);
    if (cfg.mode === 'arena') w.mode.start();
    this.world = w;
    this.view = w;
    this.mirror = null;
    this.cfg = cfg;
    this.players = players;
    this.locals = players.filter((p) => p.kind === 'local');
    Input.soloKb = !this.locals.some((p) => p.dev === 'kb2' || p.dev === 'kb3');
    this.loot = [];
    this.ended = false;
    this.paused = false;
    this.acc = 0;
    this.scene = 'play';
    FX.reset();
    View.floorRoom = null;
    UI.hideAll();
    UI.offer = null;
    if (cfg.mode === 'arena') View.updateCam(w, this.localUnits(), 1, true);
    if (!Meta.s.tutorial && this.locals.length) {
      Meta.s.tutorial = true;
      Meta.save();
      const d = this.locals[0].dev;
      const how = d === 'touch' ? 'Drag on the left to move. Tap the skill, ultimate and dash buttons, or drag them to aim.' : d.startsWith('pad') ? 'Left stick moves. X skill, B ultimate, A dash.' : 'WASD to move. Q skill, E ultimate, Space dash. The mouse aims.';
      setTimeout(() => UI.toast(tr('Your hero attacks on its own.') + ' ' + tr(how)), 1800);
      setTimeout(() => UI.toast(tr('Step out of <b>red areas</b>: they are attacks about to land!')), 6500);
    }
  },

  playerBySlot(slot) { return this.world ? this.world.players.find((p) => p.slot === slot) : null; },

  finishRun() {
    const w = this.world, res = w.mode.result;
    if (!res) return;
    this.scene = 'results';
    UI.show('offers', false);
    UI.show('pause', false);
    const p1 = this.locals[0];
    const ws = Object.assign({}, w.stats);
    let won = null;
    if (res.kind === 'arena') won = !!(p1 && p1.team === res.winner);
    const humans = w.players.filter((p) => p.kind !== 'bot').length;
    const ctx = { coop: humans > 1, online: !!this.online, items: this.loot, bossKilled: w.bossKilled, won };
    if (res.kind === 'arena' && p1 && p1.unit) ws.bestStreak = p1.unit.bestStreakLocal || w.stats.bestStreak || 0;
    const out = p1 ? Meta.applyRun(res, ws, p1.hero, ctx) : null;
    for (const pl of this.locals.slice(1)) Meta.addXp(pl.hero, out ? out.xp : 0);
    if (this.locals.length > 1) Meta.save();
    if (this.host) this.host.broadcast({ t: 'end', res, ws, bossKilled: w.bossKilled || null });
    this.showResultsFor(res, ws, out, p1 ? p1.hero : Meta.s.sel, p1 ? p1.unit : null, won, true);
  },

  showResultsFor(res, ws, out, hero, unit, won, canAgain) {
    let title, sub = '';
    if (res.kind === 'arena') {
      const sc = res.score || {};
      if (this.cfg && !this.cfg.teams && unit) {
        const place = 1 + Object.values(sc).filter((v) => v > (sc[unit.team] || 0)).length;
        title = place === 1 ? tr('Champion!') : tr('Place #{n}', { n: place });
      } else title = won ? tr('Victory!') : tr('Defeat');
      sub = tr('Score') + ' ' + Object.values(sc).join(' : ');
    } else if (res.kind === 'abyss') { title = tr('The Abyss'); sub = tr('You cleared {n} floors', { n: res.floor || 0 }); }
    else { title = res.win ? tr('Realm cleared!') : tr('Defeated'); sub = tr(REALMS[(res.realm || 1) - 1].name) + ' · ' + tr(DIFFS[res.diff || 0].name); }
    UI.showResults({ title, sub, win: res.kind === 'arena' ? won : res.win || res.kind === 'abyss', res, ws, out, hero, kind: res.kind, time: res.time, canAgain: canAgain, kos: unit ? unit.kos : 0, deaths: unit ? unit.deaths : 0 });
    Sound.play(res.win || won ? 'win' : 'lose', 0.8);
  },

  abandon() {
    if (this.mirror) {
      for (const it of this.loot) Meta.addItem(it);
      Meta.save();
      this.leaveOnline(true);
      this.toMenu();
      return;
    }
    const m = this.world.mode;
    if (m.kind === 'arena') { m.winner = -1; m.finish(); }
    else m.finish(false);
    this.ended = true;
    this.endT = 0.1;
  },

  again() {
    if (this.online && this.online.role === 'host') { this.scene = 'menu'; this.world = null; UI.online.step = 'lobby'; UI.open('online'); this.onLobbyChange(); return; }
    if (this.cfg && this.lastParty) this.startLocal(this.cfg, this.lastParty.map((p) => (p.kind === 'local' && p === this.lastParty[0] ? Object.assign(p, { hero: Meta.s.sel }) : p)));
  },

  toMenu() {
    this.scene = 'menu';
    this.world = null;
    this.mirror = null;
    this.cfg = null;
    UI.offer = null;
    FX.reset();
    this.setMood('menu');
    View.floorRoom = null;
    if (this.online) { UI.hideAll(); UI.online = Object.assign(UI.online || {}, { step: 'lobby' }); UI.open('online'); if (this.host) this.onLobbyChange(); return; }
    UI.showMenu();
  },

  // ---------- online: host ----------
  hostOnline() {
    this.leaveOnline(true);
    UI.online = { step: 'wait', role: 'host', msg: 'Creating a room...' };
    UI.refresh();
    if (!Net.supported()) { UI.online = { step: 'error', msg: 'This browser cannot play online.' }; UI.refresh(); return; }
    const token = Net.token();
    const best = [5, 4, 3, 2, 1].find((r) => Meta.realmUnlocked(r)) || 1;
    this.online = { role: 'host', token, room: null, cfg: { mode: 'adventure', realm: best, diff: 0, bots: true, arena: 'team' } };
    this.host = new HostSync(this);
    Net.hostRoom(token, (code) => {
      UI.online = { step: 'lobby', role: 'host', code, slot: 0 };
      this.onLobbyChange();
    }, (link) => { if (this.host) { this.host.addGuest(link); this.onLobbyChange(); Sound.play('pickup', 0.6); } }, 3)
      .then((room) => { if (this.online) this.online.room = room; else room.close(); })
      .catch((e) => { if (e.code === 'cancelled') return; this.leaveOnline(true); UI.online = { step: 'error', msg: e.message }; UI.refresh(); });
  },

  lobbyPlayers() {
    const o = this.online, cfg = o.cfg;
    const list = [{ slot: 0, name: Meta.s.name, hero: Meta.s.sel, lvl: Meta.hero(Meta.s.sel).lvl, kind: 'host' }];
    for (const g of this.host.guests) if (g.info) list.push({ slot: g.slot, name: g.name, hero: g.info.hero, lvl: g.info.lvl, kind: 'guest' });
    const humans = list.length;
    let total = humans;
    if (cfg.mode !== 'arena') total = cfg.bots ? 4 : humans;
    else if (cfg.arena === 'team') total = cfg.bots ? Math.max(4, humans * 2) : humans * 2;
    else if (cfg.arena === 'versus') total = cfg.bots ? Math.max(4, humans + (humans % 2)) : humans + (humans % 2);
    else total = cfg.bots ? Math.max(4, humans) : Math.max(2, humans);
    const used = new Set(list.map((p) => p.hero));
    const picks = UI.botPicks(Meta.s.sel).filter((h) => !used.has(h)).concat(HEROES.map((h) => h.id));
    let slot = 4, k = 0;
    while (list.length < total) list.push({ slot: slot++, name: 'Bot', hero: picks[k++ % picks.length], lvl: 0, kind: 'bot' });
    // teams
    list.forEach((p, i) => {
      if (cfg.mode !== 'arena') p.team = 0;
      else if (cfg.arena === 'team') p.team = p.kind === 'bot' ? (list.filter((q) => q.team === 0).length < total / 2 ? 0 : 1) : 0;
      else if (cfg.arena === 'versus') p.team = i % 2;
      else p.team = i;
    });
    if (cfg.mode === 'arena' && cfg.arena === 'team') {
      const t0 = list.filter((p) => p.team === 0).length;
      if (t0 > total / 2) for (const p of list) if (p.kind === 'bot' && p.team === 0 && list.filter((q) => q.team === 0).length > total / 2) p.team = 1;
    }
    return list;
  },

  onLobbyChange() {
    if (!this.online || this.online.role !== 'host' || !this.host) return;
    if (this.scene === 'play') return;
    const players = this.lobbyPlayers();
    const msg = { t: 'lobby', players, cfg: this.online.cfg };
    this.host.broadcast(msg);
    if (UI.online && UI.online.role === 'host') { UI.online.lobby = msg; UI.online.step = UI.online.code ? 'lobby' : UI.online.step; if (UI.cur === 'online') UI.refresh(); }
  },

  lobbyCfg(patch) {
    if (!this.online || this.online.role !== 'host') return;
    Object.assign(this.online.cfg, patch);
    if (!Meta.diffUnlocked(this.online.cfg.realm, this.online.cfg.diff)) this.online.cfg.diff = 0;
    this.onLobbyChange();
  },

  lobbyHero(d) {
    const pool = HEROES.filter((h) => Meta.hero(h.id).unlocked);
    let k = pool.findIndex((h) => h.id === Meta.s.sel);
    Meta.s.sel = pool[(k + d + pool.length) % pool.length].id;
    Meta.save();
    if (this.online && this.online.role === 'host') this.onLobbyChange();
    else if (this.guest) {
      this.guest.send({ t: 'info', info: Meta.playerInfo(Meta.s.sel) });
      const L = UI.online && UI.online.lobby;
      if (L) { const me = L.players.find((p) => p.slot === this.guest.slot); if (me) me.hero = Meta.s.sel; UI.refresh(); }
    }
  },

  hostStart() {
    if (!this.online || !this.host) return;
    const cfg = this.online.cfg;
    const lp = this.lobbyPlayers();
    const seed = (Math.random() * 1e9) | 0;
    const players = lp.map((p, i) => {
      let pl;
      if (p.kind === 'host') pl = Object.assign(Meta.playerInfo(Meta.s.sel), { kind: 'local', dev: UI.defaultDev(), name: Meta.s.name });
      else if (p.kind === 'guest') { const g = this.host.guests.find((x) => x.slot === p.slot); pl = Object.assign({}, g.info, { kind: 'remote', name: g.name }); }
      else pl = Object.assign(Meta.botInfo(p.hero), { kind: 'bot', name: BOT_NAMES[(seed + i * 5) % BOT_NAMES.length], bot: new HeroBot(Meta.s.settings.botSkill, seed + i) });
      pl.slot = p.slot;
      pl.team = p.team;
      pl.load = pl.load || { mods: {}, uniq: [] };
      return pl;
    });
    const gcfg = { mode: cfg.mode, realm: cfg.realm, diff: cfg.diff, teams: cfg.mode === 'arena' && cfg.arena !== 'ffa' ? 2 : 0, target: 10 };
    if (this.online.room) this.online.room.full = true;
    this.host.broadcast({ t: 'start', cfg: gcfg, players: players.map((p) => ({ slot: p.slot, name: p.name, hero: p.hero, kind: p.kind === 'bot' ? 'bot' : 'remote', team: p.team })) });
    this.lastParty = null;
    this.begin(gcfg, players, seed);
  },

  // ---------- online: guest ----------
  joinOnline(code) {
    this.leaveOnline(true);
    UI.online = { step: 'wait', role: 'guest', msg: 'Joining room ' + code + '...' };
    UI.refresh();
    if (!Net.supported()) { UI.online = { step: 'error', msg: 'This browser cannot play online.' }; UI.refresh(); return; }
    const token = Net.token();
    this.online = { role: 'guest', token };
    Net.joinRoom(code, token).then((link) => {
      if (!this.online) { link.close(); return; }
      this.online.link = link;
      this.guest = new GuestSync(this, link);
      link.send({ t: 'hello', v: GAME_VER, name: Meta.s.name, info: Meta.playerInfo(Meta.s.sel) });
      UI.online = { step: 'wait', role: 'guest', msg: 'Connected! Waiting for the room...' };
      UI.refresh();
    }).catch((e) => { if (e.code === 'cancelled') return; this.leaveOnline(true); UI.online = { step: 'error', msg: e.message }; UI.refresh(); });
  },

  onWelcome(slot) { if (UI.online) UI.online.slot = slot; },

  onLobby(m) {
    UI.online = { step: 'lobby', role: 'guest', slot: this.guest ? this.guest.slot : -1, lobby: m };
    if (this.scene === 'play' || this.scene === 'results') return;
    if (UI.cur === 'online') UI.refresh();
  },

  onGuestStart(m, mirror) {
    this.mirror = mirror;
    this.view = mirror;
    this.world = null;
    this.cfg = m.cfg;
    this.loot = [];
    this.ended = false;
    this.scene = 'play';
    this.guestDev = UI.defaultDev();
    Input.soloKb = true;
    this.guestInput = { mx: 0, my: 0, skill: false, ult: false, dash: false, aim: null, aimD: 0 };
    this.myHero = (m.players.find((p) => this.guest && p.slot === this.guest.slot) || {}).hero || Meta.s.sel;
    FX.reset();
    View.floorRoom = null;
    UI.closePanels();
    UI.hideAll();
    UI.offer = null;
  },

  onOffer(m) {
    if (!this.guest) return;
    UI.showOffers([{ slot: this.guest.slot, dev: this.guestDev, name: Meta.s.name, hero: this.myHero, ids: m.ids, rerolls: m.rerolls, have: this.mirror && this.mirror.me ? null : null }]);
  },

  onLoot(ilvl, bonus) { this.gotLoot(ilvl, bonus); },

  onGuestEnd(m) {
    if (this.scene !== 'play') return;
    this.scene = 'results';
    UI.show('offers', false);
    UI.show('pause', false);
    const me = this.mirror && this.mirror.me;
    const won = m.res.kind === 'arena' ? !!(me && me.team === m.res.winner) : null;
    const out = Meta.applyRun(m.res, m.ws, this.myHero, { coop: true, online: true, items: this.loot, bossKilled: m.bossKilled, won });
    this.showResultsFor(m.res, m.ws, out, this.myHero, me, won, false);
  },

  onEmote() { /* reserved */ },

  onHostLeft(why) {
    const wasPlaying = this.scene === 'play';
    if (wasPlaying) { for (const it of this.loot) Meta.addItem(it); Meta.save(); }
    this.leaveOnline(true);
    if (wasPlaying || this.scene === 'results') { this.scene = 'menu'; this.mirror = null; UI.hideAll(); UI.showMenu(); UI.toast(this.loot.length ? tr('The host left the game. Your loot was saved.') : tr('The host left the game.')); this.setMood('menu'); return; }
    UI.online = { step: 'error', msg: why === 'version' ? 'Your friend is running a different version. Both of you should reload.' : 'The room was closed.' };
    if (UI.cur === 'online') UI.refresh();
  },

  onGuestLeft(g) {
    if (this.scene === 'play' && this.world) {
      const pl = this.playerBySlot(g.slot);
      if (pl && pl.kind === 'remote') { pl.kind = 'bot'; pl.bot = new HeroBot(1, g.slot + 99); UI.toast(tr('{name} left. A bot takes over.', { name: esc(g.name) })); }
      return;
    }
    this.onLobbyChange();
  },

  leaveOnline(silent) {
    const o = this.online;
    if (!o) return;
    this.online = null;
    try { o.token && o.token.cancel(); } catch (e) { /* ignore */ }
    try { if (o.room) o.room.close(); } catch (e) { /* ignore */ }
    if (this.host) { for (const g of this.host.guests) { try { g.link.send({ t: 'bye', why: 'closed' }); g.link.close('closed'); } catch (e) { /* ignore */ } } }
    if (this.guest) { try { this.guest.link.onclose = null; this.guest.link.close('closed'); } catch (e) { /* ignore */ } }
    this.host = null;
    this.guest = null;
    if (!silent && UI.online) UI.online = { step: 'menu' };
  },
};

// Test hooks for the headless browser tests.
window.__RR = { Game, Meta, UI, View, FX, Input, Sound, World, mockLinkPair, HostSync, GuestSync, Mirror };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Game.init()); else Game.init();
