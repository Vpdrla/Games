// ---------- Battle scene: runs one match in offline, host or guest mode ----------
// offline ('ai' / 'training'): local Sim + AI.  host: local Sim, the remote player is team 1 and
// receives snapshots.  guest: no Sim; draws the host's snapshots and sends card plays.
const KINDS = ['troop', 'building', 'tower', 'proj', 'area'];
const UKEYS = Object.keys(UNITS).concat(['princess', 'king']);
const PKEYS = ['arrow', 'spear', 'bullet', 'cannonball', 'bomb', 'spit', 'orb', 'ice', 'flame', 'fireorb', 'fireball', 'log'];
const AKEYS = ['arrows', 'freeze', 'poison'];
const SNAP_EVERY = 2; // sim ticks per snapshot (15 per second)

const r2 = (v) => Math.round(v * 100);

class BattleScene {
  constructor(cfg) {
    this.cfg = cfg;
    this.mode = cfg.mode;
    this.myTeam = this.mode === 'guest' ? 1 : 0;
    this.view = new BattleView(this, { myTeam: this.myTeam, arena: cfg.arena });
    this.link = cfg.link || null;
    this.acc = 0;
    this.intro = 1.8;
    this.ended = false;
    this.endT = 0;
    this.result = null;
    this.paused = false;
    this.speed = 1;
    this.names = cfg.names;
    this.subs = cfg.subs || ['', ''];
    this.dblShown = false;
    this.outEv = [];
    this.snapTick = 0;
    this.pending = new Map();
    this.playSeq = 0;
    if (this.mode !== 'guest') {
      this.sim = new Sim({ decks: cfg.decks, levels: cfg.levels, kings: cfg.kings, seed: cfg.seed });
      if (this.mode === 'ai' || this.mode === 'training') this.ai = new AIPlayer(this.sim, 1, cfg.aiSkill, cfg.seed + 7);
    } else {
      this.g = { ents: new Map(), t: 0, ot: false, crowns: [0, 0], elixir: 5, hand: [null, null, null, null], next: null, lastAt: 0, period: 66, tick: -1, over: false };
    }
  }

  enter() {
    UI.showScreen(null);
    Music.play('battle');
    Game.keepAwake(true);
    if (this.link) {
      this.link.listen((m) => this.onNet(m));
      this.link.onclose = () => Lobby.onClose();
    }
    if (this.mode === 'ai' && !SAVE.tutorial) this.view.message('Drag a card onto your side!', '#ffe082', 4);
  }

  exit() {
    Game.keepAwake(false);
    if (this.link) this.link.onmsg = null;
  }

  onHidden() {
    if ((this.mode === 'ai' || this.mode === 'training') && !this.ended) this.openMenu();
  }

  // ---- per-frame ----
  update(dt) {
    const st = this.state();
    this.view.update(dt, st);
    if (this.intro > 0) { this.intro -= dt; return; }
    if (this.paused) return;
    if (this.sim) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= SIM_DT && n < 8 * this.speed) {
        this.acc -= SIM_DT;
        if (this.sim.over) break;
        if (this.ai) this.ai.update(SIM_DT);
        if (this.bot) this.bot.update(SIM_DT);
        this.sim.step();
        this.drain();
        n++;
        if (this.mode === 'host' && ++this.snapTick % SNAP_EVERY === 0) this.sendSnap();
      }
      if (this.acc > SIM_DT * 2) this.acc = SIM_DT * 2;
      if (!this.dblShown && this.sim.t >= DOUBLE_AT) { this.dblShown = true; this.view.onEvent(['dbl']); }
      if (this.sim.over && !this.ended) {
        const s = this.sim;
        const res = { winner: s.winner, crowns: [s.p[0].crowns, s.p[1].crowns], reason: s.endReason };
        if (this.mode === 'host') { this.sendSnap(); this.link.send({ t: 'end', w: res.winner, c: res.crowns, why: res.reason }); }
        this.finish(res);
      }
    } else {
      if (!this.dblShown && this.g.t >= DOUBLE_AT) { this.dblShown = true; this.view.onEvent(['dbl']); }
      for (const [slot, p] of this.pending) if (performance.now() - p.at > 2500) this.pending.delete(slot);
    }
    if (this.ended) {
      this.endT += dt;
      if (this.endT > 2.6 && !this.resultShown) {
        this.resultShown = true;
        Game.battleOver(this);
      }
    }
  }

  draw(ctx) { this.view.draw(ctx, this.state()); }

  pointer(type, x, y) {
    if (UI.modalOpen()) return;
    if (type === 'down' && this.view.hitMenu(x, y)) { Sound.play('click'); this.openMenu(); return; }
    if (this.ended) return;
    this.view.pointer(type, x, y, this.state());
  }

  drain() {
    const evs = this.sim.events;
    for (const ev of evs) {
      this.view.onEvent(ev);
      if (this.ai && ev[0] === 'tower' && Math.random() < 0.6) {
        const lostByAi = ev[2] === 1;
        setTimeout(() => this.view.showEmote(1, lostByAi ? choice([2, 3]) : choice([0, 1, 4])), 700);
      }
      if (this.mode === 'host') this.outEv.push(ev.map((v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v)));
    }
    evs.length = 0;
  }

  state() {
    if (this.sim) {
      const s = this.sim, me = s.p[this.myTeam], foe = s.p[1 - this.myTeam];
      return {
        ents: s.ents, alpha: clamp(this.acc / SIM_DT, 0, 1), t: s.t, timeLeft: s.timeLeft(), ot: s.ot, dbl: s.t >= DOUBLE_AT, over: s.over,
        intro: this.intro, tutorial: this.mode === 'ai' && !SAVE.tutorial && s.p[0].plays === 0 && s.t > 1.5,
        me: { elixir: me.elixir, hand: me.hand, next: me.queue[0], crowns: me.crowns, name: this.names[this.myTeam] },
        foe: { crowns: foe.crowns, name: this.names[1 - this.myTeam], sub: this.subs[1 - this.myTeam] },
        canPlace: (k, x, y) => s.canPlace(this.myTeam, k, x, y),
      };
    }
    const g = this.g;
    const now = performance.now();
    const alpha = clamp((now - g.lastAt) / g.period, 0, 1);
    const extra = g.over || !g.lastAt ? 0 : Math.min(0.5, (now - g.lastAt) / 1000);
    const mult = g.t >= DOUBLE_AT ? 2 : 1;
    const t = g.t + extra;
    return {
      ents: this.gList || [], alpha, t, timeLeft: g.ot ? REG_TIME + OT_TIME - t : REG_TIME - t, ot: g.ot, dbl: g.t >= DOUBLE_AT, over: g.over,
      intro: this.intro, stalled: !g.over && this.intro <= 0 && now - g.lastAt > 1500,
      me: { elixir: Math.min(10, g.elixir + extra * ELIXIR_RATE * mult), hand: g.hand, next: g.next, crowns: g.crowns[1], name: this.names[1], pending: new Set(this.pending.keys()) },
      foe: { crowns: g.crowns[0], name: this.names[0], sub: this.subs[0] },
      canPlace: (k, x, y) => this.guestCanPlace(k, x, y),
    };
  }

  // ---- player actions ----
  tryPlay(slot, x, y) {
    if (this.ended || this.intro > 0) return false;
    if (this.mode === 'guest') {
      const key = this.g.hand[slot];
      if (!key || this.pending.has(slot)) return false;
      const n = ++this.playSeq;
      this.pending.set(slot, { n, at: performance.now(), key });
      this.link.send({ t: 'play', s: slot, k: key, x, y, n });
      this.view.fx.puff(x, y, 3, 'rgba(255,255,255,0.6)', 0.4);
      return true;
    }
    const r = this.sim.play(this.myTeam, slot, x, y);
    if (r === 'ok') {
      if (!SAVE.tutorial && this.mode === 'ai') { SAVE.tutorial = true; saveGame(); }
      return true;
    }
    if (r === 'elixir') this.view.message('Not enough elixir', '#ff9cf2', 1.1);
    else if (r === 'place') this.view.badSpot = 0.6;
    Sound.play('error');
    return false;
  }

  sendEmote(i) {
    this.view.showEmote(this.myTeam, i);
    if (this.link) this.link.send({ t: 'emo', i });
    else if (this.ai && Math.random() < 0.5) setTimeout(() => this.view.showEmote(1, choice([0, 1, 2, 4])), 900);
  }

  surrender() {
    if (this.ended) return;
    if (this.link) this.link.send({ t: 'bye' });
    const s = this.sim;
    const crowns = s ? [s.p[0].crowns, s.p[1].crowns] : this.g.crowns.slice();
    crowns[1 - this.myTeam] = 3;
    this.finish({ winner: 1 - this.myTeam, crowns, reason: 'surrender' });
  }

  openMenu() {
    if (this.ended) return;
    const offline = !this.link;
    if (offline) this.paused = true;
    UI.battleMenu(this, offline);
  }

  resume() { this.paused = false; }

  finish(res) {
    if (this.ended) return;
    this.ended = true;
    this.result = res;
    if (this.g) this.g.over = true;
    const won = res.winner === this.myTeam, draw = res.winner === -1;
    this.view.message(draw ? 'DRAW' : won ? 'VICTORY!' : 'DEFEAT', draw ? '#fff' : won ? '#8fd0ff' : '#ff8a8a', 3);
    Sound.play(draw ? 'warn' : won ? 'victory' : 'defeat');
    Music.stop();
  }

  onDisconnect() {
    if (this.ended) return;
    this.view.message('Opponent disconnected', '#ffe082', 3);
    const crowns = this.sim ? [this.sim.p[0].crowns, this.sim.p[1].crowns] : this.g.crowns.slice();
    this.finish({ winner: this.myTeam, crowns, reason: 'disconnect' });
  }

  // ---- networking ----
  onNet(m) {
    switch (m.t) {
      case 's': if (this.mode === 'guest') this.applySnap(m); break;
      case 'play':
        if (this.mode === 'host' && !this.ended) {
          const p = this.sim.p[1];
          const r = p.hand[m.s] === m.k ? this.sim.play(1, m.s, +m.x, +m.y) : 'card';
          if (r !== 'ok') this.link.send({ t: 'rej', n: m.n, s: m.s, why: r });
        }
        break;
      case 'rej':
        this.pending.delete(m.s);
        if (m.why === 'elixir') this.view.message('Not enough elixir', '#ff9cf2', 1.1);
        else if (m.why === 'place') this.view.badSpot = 0.6;
        Sound.play('error');
        break;
      case 'emo': this.view.showEmote(1 - this.myTeam, m.i | 0); break;
      case 'end':
        if (this.mode === 'guest') this.finish({ winner: m.w, crowns: m.c, reason: m.why });
        break;
      case 'bye':
        if (!this.ended) {
          this.view.message('Opponent surrendered', '#ffe082', 3);
          const crowns = this.sim ? [this.sim.p[0].crowns, this.sim.p[1].crowns] : this.g.crowns.slice();
          crowns[this.myTeam] = 3;
          if (this.mode === 'host') this.link.send({ t: 'end', w: 0, c: crowns, why: 'surrender' });
          this.finish({ winner: this.myTeam, crowns, reason: 'surrender' });
        } else Lobby.onPeerMessage(m);
        break;
      default:
        Lobby.onPeerMessage(m);
    }
  }

  sendSnap() {
    const s = this.sim;
    const E = [];
    for (const e of s.ents) {
      if (e.dead) continue;
      const a = [e.id, KINDS.indexOf(e.kind), e.team, r2(e.x), r2(e.y)];
      if (e.kind === 'troop' || e.kind === 'building' || e.kind === 'tower') {
        const fl = (e.deployT > 0 ? 1 : 0) | (e.freezeT > 0 ? 2 : 0) | (e.stunT > 0 ? 4 : 0) | (e.slowT > 0 ? 8 : 0) | (e.attacking ? 16 : 0) |
          (e.moving ? 32 : 0) | (e.charging ? 64 : 0) | (e.jumping ? 128 : 0) | (e.tunnel ? 256 : 0) | (e.active ? 512 : 0) | (e.air ? 1024 : 0);
        const atk = e.attacking && e.st.hs ? Math.round(clamp(1 - e.cd / e.st.hs, 0, 1) * 99) : -1;
        a.push(UKEYS.indexOf(e.u), Math.ceil(e.hp), e.maxHp, e.lvl, fl, r2(e.fx), r2(e.fy), atk, r2(Math.max(0, e.deployT || 0)));
        if (e.kind === 'tower') a.push(e.lane);
        else if (e.u === 'inferno' && e.target && e.attacking) a.push(r2(e.target.x), r2(e.target.y), e.rampT < 2 ? 0 : e.rampT < 4 ? 1 : 2, e.target.air ? 1 : 0);
      } else if (e.kind === 'proj') {
        a.push(PKEYS.indexOf(e.pt), r2(e.trav), r2(e.d0), r2(e.h0 == null ? 0.8 : e.h0), r2(e.h1 == null ? 0.5 : e.h1), r2(e.tx), r2(e.ty));
      } else if (e.kind === 'area') {
        a.push(AKEYS.indexOf(e.sp), r2(e.r), r2(e.t), r2(e.dur));
      }
      E.push(a);
    }
    const p = s.p[1];
    this.link.send({ t: 's', k: s.tick, tm: r2(s.t), ot: s.ot ? 1 : 0, c: [s.p[0].crowns, s.p[1].crowns], el: r2(p.elixir), h: p.hand, n: p.queue[0], E, V: this.outEv }, true);
    this.outEv = [];
  }

  applySnap(m) {
    const g = this.g;
    if (m.k <= g.tick) return;
    const now = performance.now();
    const alphaNow = clamp((now - g.lastAt) / g.period, 0, 1);
    if (g.lastAt) g.period = clamp(lerp(g.period, now - g.lastAt, 0.2), 40, 250);
    g.lastAt = now;
    g.tick = m.k;
    g.t = m.tm / 100;
    g.ot = !!m.ot;
    g.crowns = m.c;
    g.elixir = m.el / 100;
    // cards we played have left the hand once the host confirms them
    for (const [slot, p] of this.pending) if (m.h[slot] !== p.key || now - p.at > 2500) this.pending.delete(slot);
    g.hand = m.h;
    g.next = m.n;
    const seen = new Set();
    for (const a of m.E) {
      const id = a[0];
      seen.add(id);
      let e = g.ents.get(id);
      const x = a[3] / 100, y = a[4] / 100;
      if (!e) { e = { id, x, y, px: x, py: y }; g.ents.set(id, e); } else {
        e.px = lerp(e.px, e.x, alphaNow);
        e.py = lerp(e.py, e.y, alphaNow);
        e.x = x;
        e.y = y;
      }
      e.kind = KINDS[a[1]];
      e.team = a[2];
      if (e.kind === 'troop' || e.kind === 'building' || e.kind === 'tower') {
        e.u = UKEYS[a[5]];
        e.hp = a[6];
        e.maxHp = a[7];
        e.lvl = a[8];
        const fl = a[9];
        e.deployT = fl & 1 ? a[13] / 100 : 0;
        e.freezeT = fl & 2 ? 1 : 0;
        e.stunT = fl & 4 ? 1 : 0;
        e.slowT = fl & 8 ? 1 : 0;
        e.attacking = !!(fl & 16);
        e.moving = !!(fl & 32);
        e.charging = !!(fl & 64);
        e.jumping = !!(fl & 128);
        e.tunnel = !!(fl & 256);
        e.active = !!(fl & 512);
        e.air = !!(fl & 1024);
        e.fx = a[10] / 100;
        e.fy = a[11] / 100;
        e.atk = a[12] < 0 ? -1 : a[12] / 99;
        if (e.kind === 'tower') {
          e.tt = e.u;
          e.lane = a[14];
          const ts = TOWER_STATS[e.tt];
          e.r = ts.r;
          e.half = e.tt === 'king' ? 2 : 1.5;
        } else {
          const u = UNITS[e.u];
          e.r = u ? u.r : 0.5;
          e.spd = u ? u.speed || 1 : 1;
          if (a.length > 14) { e.tgx = a[14] / 100; e.tgy = a[15] / 100; e.ramp = a[16]; e.tgAir = !!a[17]; } else e.tgx = null;
        }
      } else if (e.kind === 'proj') {
        e.pt = PKEYS[a[5]];
        e.trav = a[6] / 100;
        e.d0 = a[7] / 100;
        e.h0 = a[8] / 100;
        e.h1 = a[9] / 100;
        e.tx = a[10] / 100;
        e.ty = a[11] / 100;
        if (e.pt === 'log') e.dir = 1;
      } else if (e.kind === 'area') {
        e.sp = AKEYS[a[5]];
        e.r = a[6] / 100;
        e.t = a[7] / 100;
        e.dur = a[8] / 100;
      }
    }
    for (const id of g.ents.keys()) if (!seen.has(id)) g.ents.delete(id);
    this.gList = Array.from(g.ents.values());
    for (const ev of m.V || []) this.view.onEvent(ev);
  }

  guestCanPlace(key, x, y) {
    const list = this.gList || [];
    const towers = [0, 1].map((team) => [0, 1, -1].map((lane) => list.find((e) => e.kind === 'tower' && e.team === team && e.lane === lane) || { dead: true }));
    return Sim.prototype.canPlace.call({ ents: list, towers }, 1, key, Math.round(x * 2) / 2, Math.round(y * 2) / 2);
  }
}
