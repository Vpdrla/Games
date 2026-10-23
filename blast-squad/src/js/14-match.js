// ---------- Match: runs one battle offline (or as the online host) ----------
// Every slot has a controller that produces its input word each tick: the local player (Input), a
// bot (class Bot: perception -> mind -> motor) or a remote friend (words from the network). The sim
// runs at SIM_HZ with a fixed-step accumulator; the view interpolates between ticks.
//   const m = new Match(cfg, { net: 'offline' | 'host', link }); m.update(dt); m.draw(ctx, opts);
//   m.onEnd(result) is called once, a moment after the sim ends (offline Showdown: 2.5 s after the
//   player is knocked out). A friendly battle's guest runs GuestMatch (13-sync.js) instead; the host's
//   SyncHost hooks onTick.

// The local player's words come from the touch / keyboard / pad layer.
class LocalCtrl {
  constructor(slot) { this.slot = slot; }
  word() { return Input.word(); }
}

// A remote player's words, queued by the network layer (redundant packets: only new seqs count).
// Actions are never dropped; when the queue runs dry the last movement repeats without an action.
// `applied` is the seq of the word used last (the match copies it to brawler.lastSeq, so the guest
// can match its predictions against the host's positions).
class RemoteCtrl {
  constructor(slot) { this.slot = slot; this.q = []; this.qs = []; this.last = 0; this.seq = -1; this.applied = 0; this.lastRecv = 0; this.bot = null; this.dry = 0; this.wait = 0; }
  push(seq, words) {
    // words[i] has sequence seq - (words.length - 1 - i)
    for (let i = 0; i < words.length; i++) {
      const s = seq - (words.length - 1 - i);
      if (s <= this.seq) continue;
      this.seq = s;
      this.q.push(words[i] >>> 0);
      this.qs.push(s);
    }
    // a long backlog: drop movement-only words but keep every action
    while (this.q.length > 4) {
      const i = this.q.findIndex((w) => !inAct(w));
      if (i < 0) break;
      this.q.splice(i, 1);
      this.qs.splice(i, 1);
    }
  }
  word(sim) {
    if (this.bot) return this.bot.tick(sim); // the friend dropped out: an AI holds the brawler
    // after running dry, wait (up to 2 ticks) for one word of cushion, so network jitter doesn't
    // starve the queue every other tick
    if (this.q.length && (this.wait <= 0 || this.q.length >= 2)) {
      this.wait = 0;
      const w = this.q.shift();
      this.applied = this.qs.shift();
      this.last = noAct(w);
      return w;
    }
    if (!this.q.length && this.wait <= 0) { this.dry++; this.wait = 3; }
    if (this.wait > 0) this.wait--;
    return this.last;
  }
}

// Used only if the bot modules are missing (keeps the match playable).
class IdleCtrl { word() { return IN_IDLE; } }

class Match {
  constructor(cfg, opts) {
    opts = opts || {};
    this.cfg = cfg;
    this.net = opts.net || 'offline';
    this.link = opts.link || null;
    this.local = cfg.localSlot || 0;
    this.sim = new Sim({ mode: cfg.mode, map: cfg.map, seed: cfg.seed, slots: cfg.slots.map((s) => ({ team: s.team, bk: s.bk, lvl: s.lvl, gadget: s.gadget, star: s.star, name: s.name })) });
    this.sim.pins = []; // recent quick-chat pins { slot, id, t } (bots read their team's)
    this.state = this.sim;
    this.ctrls = cfg.slots.map((s, i) => this.makeCtrl(s, i));
    this.acc = 0;
    this.speed = 1;
    this.paused = false;
    this.ended = false;
    this.endT = 0;
    this.onEnd = null;
    this.onTick = null; // host: called after every tick (snapshots)
    this.events = []; // this tick's events (host forwards them)
    this.telemetry = typeof Telemetry !== 'undefined' ? new Telemetry(this.sim, this.local) : null;
    const me = this.sim.brawlers[this.local];
    this.flip = me.team === 1 && cfg.mode !== MODE.SHOWDOWN;
    Input.reset();
    Input.setFlip(this.flip);
    Input.enabled = true;
    Input.onPin = (i) => this.pin(this.local, i);
    Input.onEmote = (i) => this.emote(this.local, i);
    View.reset(this.local);
    View.aim = Match.NO_AIM;
  }

  makeCtrl(s, i) {
    if (s.ctrl === 'local' && i === this.local) return new LocalCtrl(i);
    if (s.ctrl === 'remote') return new RemoteCtrl(i);
    if (typeof Bot !== 'undefined') return new Bot(i, s.profile || (typeof Meta !== 'undefined' ? Meta.botProfile(new RNG(this.cfg.seed + i), s.tro || 0, this.cfg.mode) : { skill: 0.5, traits: {} }), (this.cfg.seed ^ (i * 0x9e3779b1)) >>> 0);
    return new IdleCtrl();
  }

  pin(slot, id) {
    const sim = this.sim;
    sim.pins.push({ slot, id, t: sim.t });
    sim.ev(EV.PIN, slot, id);
  }
  emote(slot, id) { this.sim.ev(EV.EMOTE, slot, id); }

  // Hands a remote slot to an AI while its player is away, and back when they return.
  setAway(slot, away) {
    const c = this.ctrls[slot];
    if (!(c instanceof RemoteCtrl)) return;
    if (away && !c.bot && typeof Bot !== 'undefined') c.bot = new Bot(slot, { name: 'AI', skill: 0.55, traits: { aggr: 0.5, patience: 0.5, greed: 0.5, teamwork: 0.8, tilt: 0.2 }, fav: [] }, (this.cfg.seed ^ 0xabc) >>> 0);
    if (!away) c.bot = null;
  }

  step() {
    const sim = this.sim;
    const me = sim.brawlers[this.local];
    Input.setLocal(me.alive ? me : null, typeof BRAWLERS !== 'undefined' ? BRAWLERS[me.bk] : null);
    for (let i = 0; i < this.ctrls.length; i++) {
      const c = this.ctrls[i];
      const w = c.tick ? c.tick(sim) : c.word(sim);
      sim.setInput(i, w);
      if (c instanceof RemoteCtrl) sim.brawlers[i].lastSeq = c.applied;
      if (c.outPin != null) { this.pin(i, c.outPin); c.outPin = null; }
      if (c.outEmote != null) { this.emote(i, c.outEmote); c.outEmote = null; }
    }
    sim.step();
    if (sim.pins.length && sim.t - sim.pins[0].t > 4) sim.pins.shift();
    const evs = sim.events;
    this.events = evs.slice();
    for (const ev of evs) this.onEvent(ev);
    if (this.telemetry) this.telemetry.tick(evs);
    evs.length = 0;
    if (this.onTick) this.onTick(this);
  }

  onEvent(ev) {
    const sim = this.sim;
    View.onEvent(ev, sim);
    if (typeof Sound !== 'undefined') Sound.onEvent(ev, sim, this.local);
    if (ev[0] === EV.HIT && ev[1] === sim.brawlers[this.local].id && typeof Game !== 'undefined') Game.vibrate(18);
    else if (ev[0] === EV.KILL && ev[1] === this.local && typeof Game !== 'undefined') Game.vibrate(70);
  }

  update(dt) {
    if (this.paused) return;
    const sim = this.sim;
    if (this.ended) { this.endT += dt; return; }
    this.acc += dt * this.speed;
    let n = 0;
    const maxSteps = 5 * this.speed;
    while (this.acc >= SIM_DT && n < maxSteps && !sim.over) { this.step(); this.acc -= SIM_DT; n++; }
    if (this.acc > SIM_DT * 3) this.acc = SIM_DT; // a long hitch: drop the backlog instead of fast-forwarding
    const me = sim.brawlers[this.local];
    if (typeof Sound !== 'undefined') {
      Sound.ear(me.x, me.y, this.flip);
      Sound.onHud(sim.hud(), me.team);
    }
    if (typeof Music !== 'undefined') Music.intensity = this.intensity();
    if (sim.over && !this.ended) {
      this.ended = true;
      this.endT = 0;
      Input.enabled = false;
      setTimeout(() => { if (this.onEnd) this.onEnd(sim.result); }, 1800);
    } else if (!this.ended && this.net === 'offline' && this.cfg.mode === MODE.SHOWDOWN) this.sdOut(dt);
  }

  // Offline Showdown: once the player is knocked out the match ends for them 2.5 s later (game time),
  // placed behind everyone still standing, as in the original.
  sdOut(dt) {
    const me = this.sim.brawlers[this.local];
    if (this.outT == null) { if (me.alive) return; this.outT = 0; }
    this.outT += dt * this.speed;
    if (this.outT < 2.5) return;
    const r = this.earlyResult();
    this.ended = true;
    this.endT = 0;
    Input.enabled = false;
    if (this.onEnd) this.onEnd(r);
  }

  // The placement right now: the mode's own ranking, else alive slots then the fallen, last down first.
  earlyResult() {
    const sim = this.sim;
    let rank = sim.mode.rankNow ? sim.mode.rankNow(sim) : null;
    if (!rank) {
      rank = sim.brawlers.filter((b) => b.alive).map((b) => b.slot);
      for (let i = sim.deathOrder.length - 1; i >= 0; i--) if (rank.indexOf(sim.deathOrder[i]) < 0) rank.push(sim.deathOrder[i]);
      for (const b of sim.brawlers) if (rank.indexOf(b.slot) < 0) rank.push(b.slot);
    }
    return sim.makeResult(-1, 'out', [0, 0], rank);
  }

  // Music gets busier when it matters: a gem countdown, overtime, a close end, few players left.
  intensity() {
    const h = this.sim.hud();
    if (!h) return 0.5;
    if (h.mode === 'gem') return h.count > 0 ? 1 : 0.55;
    if (h.mode === 'sd') return h.alive <= 4 ? 1 : 0.6;
    if (h.mode === 'ball') return h.ot ? 1 : 0.6;
    return h.time != null && h.time < 30 ? 1 : 0.6;
  }

  draw(ctx, opts) {
    const sim = this.sim;
    View.aim = Input.aim || Match.NO_AIM;
    View.draw(ctx, sim, this.local, this.acc / SIM_DT, opts);
    const me = sim.brawlers[this.local];
    if (!this.ended) Input.draw(ctx, me.alive ? me : null);
  }

  quit() {
    this.paused = true;
    Input.enabled = false;
  }
}
Match.NO_AIM = { act: 0, ang: 0, d: 1 };
