// ---------- Modes ----------
// Each mode is a set of hooks the sim calls (see DESIGN.md "Modes"); its state lives in sim.ms.
// ModeKit.make(key, hooks) fills in defaults, so a mode only writes what differs.
//
// What the sim offers modes:
//   - spawns: ModeKit.spawnPoint picks map.spawns by team (3v3) or by slot / sim.ms.order (Showdown).
//   - poison: `poison: { start, shrink, minHalf, pct }`. The sim keeps sim.poison (the safe rect),
//     deals `pct` (default 20%) of max health per second outside it, 5% more each second after
//     the first 5, halves healing there, emits EV.POISON, and measures time from sim.roundT0
//     (restarted by sim.resetRound()).
//   - respawn: seconds before the fallen come back (RESPAWN_T if not set).
//   - freeze: setting sim.freezeT stops the world (goal celebrations, between rounds); when it runs
//     out the sim calls thaw(sim). Mode clocks use sim.playT, which doesn't run while frozen.
//   - boxes: map BOX tiles have sim.boxHp and drop PICK.CUBE pickups (ModeKit.cube takes them).
//   - every mode: hud(sim) returns the HUD object of DESIGN.md; checkEnd returns
//     sim.makeResult(winner, reason, score, rank) or null.

const ModeKit = {
  base: {
    poison: null,
    onAction: null,
    init() {},
    spawnPoint(sim, b) { return ModeKit.spawnPoint(sim, b); },
    tick() {},
    onKill() {},
    onPickup(sim, b, p) { return ModeKit.cube(sim, b, p); },
    canRespawn() { return true; },
    thaw() {}, // the sim's freeze (sim.freezeT) just ended
    checkEnd() { return null; },
    hud(sim) { return { mode: this.key, time: sim.t }; },
  },

  make(key, hooks) { return Object.assign({}, ModeKit.base, { key }, hooks); },

  // Index of b among its team's slots (0 for the lowest slot).
  teamIndex(sim, b) {
    let i = 0;
    for (const o of sim.brawlers) if (o.team === b.team && o.slot < b.slot) i++;
    return i;
  },

  // Team maps: the team's spawn markers in order. One-list maps (Showdown): by sim.ms.order[slot] or
  // slot. More players than markers share them on a small ring.
  spawnPoint(sim, b) {
    const sp = sim.map.spawns;
    let list, i;
    if (sp.length > 1) { list = sp[Math.min(b.team, sp.length - 1)]; i = ModeKit.teamIndex(sim, b); }
    else { list = sp[0]; i = sim.ms.order ? sim.ms.order[b.slot] : b.slot; }
    if (!list.length) return { x: sim.map.w / 2, y: sim.map.h / 2 };
    const p = list[i % list.length], lap = Math.floor(i / list.length);
    if (!lap) return { x: p.x, y: p.y };
    const a = lap * 2.4;
    return sim.freeSpot(p.x + Math.cos(a) * 0.8, p.y + Math.sin(a) * 0.8, BRAWLER_R, { x: 0, y: 0 });
  },

  cube(sim, b, p) {
    if (p.pick !== PICK.CUBE) return false;
    sim.addCube(b);
    return true;
  },

  // Index of the single highest value, or -1 on a tie.
  leader(arr) {
    let best = -1, bv = -Infinity, tie = false;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > bv) { bv = arr[i]; best = i; tie = false; } else if (arr[i] === bv) tie = true;
    }
    return tie ? -1 : best;
  },
};

const MODES = {
  // Gem Rush (Gem Grab): the mine spits a gem every 7 s (not while 15 lie around, nor with 29 in
  // play); a team holding 10+ gems and more than the other starts a 15 s countdown that resets as
  // soon as that stops being true. 3:30 on the clock: then the team holding more gems wins (equal: a
  // draw). The fallen come back after 5 s.
  gem: ModeKit.make(MODE.GEM, {
    first: 2, // s until the first gem
    every: 7,
    goal: 10,
    count: 15,
    loose: 15, // the mine waits while this many gems lie on the ground ...
    inPlay: 29, // ... or while this many are carried or lying around
    respawn: 5,
    len: 210,

    init(sim) {
      sim.ms = { gems: [0, 0], mineT: this.first, count: 0, countTeam: -1, spawned: 0 };
    },

    tick(sim) {
      const ms = sim.ms, mine = sim.map.mine;
      ms.mineT -= SIM_DT;
      if (ms.mineT <= 0) {
        ms.mineT += this.every;
        let loose = 0, held = 0;
        for (const p of sim.pickups) if (!p.dead && p.pick === PICK.GEM) loose += p.n;
        for (const b of sim.brawlers) held += b.carry;
        if (mine && loose < this.loose && loose + held < this.inPlay) { sim.popPickup(PICK.GEM, 1, mine.x, mine.y, 1.1, 2.1); ms.spawned++; }
      }
      if (!this.recount(sim) && ms.countTeam >= 0) ms.count -= SIM_DT;
    },

    // Recounts the gems each team carries and starts/stops the countdown. True when it changed.
    recount(sim) {
      const ms = sim.ms;
      let a = 0, c = 0;
      for (const b of sim.brawlers) {
        if (!b.alive) continue;
        if (b.team === 0) a += b.carry; else c += b.carry;
      }
      ms.gems[0] = a;
      ms.gems[1] = c;
      const lead = a >= this.goal && a > c ? 0 : c >= this.goal && c > a ? 1 : -1;
      if (lead === ms.countTeam) return false;
      ms.countTeam = lead;
      ms.count = lead >= 0 ? this.count : 0;
      sim.ev(EV.COUNTDOWN, lead, ms.count);
      return true;
    },

    onKill(sim, v) {
      if (v.carry > 0) sim.dropPickups(PICK.GEM, v.carry, v.x, v.y);
      v.carry = 0;
      // deaths come after the mode's tick: recount now so a carrier who falls on the countdown's
      // last tick doesn't still win it
      this.recount(sim);
    },

    onPickup(sim, b, p) {
      if (p.pick !== PICK.GEM) return false;
      b.carry += p.n;
      b.st.gems += p.n;
      return true;
    },

    checkEnd(sim) {
      const ms = sim.ms;
      if (ms.countTeam >= 0 && ms.count <= 1e-6) return sim.makeResult(ms.countTeam, 'gems', ms.gems.slice());
      if (sim.playT >= this.len) return sim.makeResult(ModeKit.leader(ms.gems), 'time', ms.gems.slice());
      return null;
    },

    hud(sim) {
      const ms = sim.ms;
      return { mode: 'gem', time: Math.max(0, this.len - sim.playT), gems: [ms.gems[0], ms.gems[1]], count: ms.countTeam >= 0 ? Math.max(0, Math.ceil(ms.count - 1e-6)) : 0, countTeam: ms.countTeam };
    },
  }),

  // Showdown (solo): 10 players, no respawns, power cubes from boxes and from the fallen, poison
  // closing in from every side. Placement: the survivors first, then the fallen, last one down first.
  sd: ModeKit.make(MODE.SHOWDOWN, {
    poison: { start: 30, shrink: 100, minHalf: 0.5, pct: 0.2 },
    cap: 300, // the poison covers everything long before this; a safety net

    init(sim) {
      // who starts at which spawn (a map may have more spawns than players: any of them)
      const n = Math.max(sim.map.spawns[0].length, sim.brawlers.length), idx = [];
      for (let i = 0; i < n; i++) idx.push(i);
      sim.rng.shuffle(idx);
      sim.ms = { order: sim.brawlers.map((b) => idx[b.slot]) };
    },

    canRespawn() { return false; },

    // the fallen drop 1 power cube plus a third of theirs, 5 at most (the original's rule)
    onKill(sim, v) {
      sim.dropPickups(PICK.CUBE, Math.min(5, 1 + Math.floor(v.cubes / 3)), v.x, v.y);
    },

    // Placement right now: the living by health (most first), then the fallen in reverse order.
    rankNow(sim) {
      const rank = sim.brawlers.filter((b) => b.alive).sort((a, c) => c.hp - a.hp || a.slot - c.slot).map((b) => b.slot);
      for (let i = sim.deathOrder.length - 1; i >= 0; i--) if (!rank.includes(sim.deathOrder[i])) rank.push(sim.deathOrder[i]);
      for (const b of sim.brawlers) if (!rank.includes(b.slot)) rank.push(b.slot);
      return rank;
    },

    checkEnd(sim) {
      let alive = 0;
      for (const b of sim.brawlers) if (b.alive) alive++;
      if (alive > 1 && sim.t < this.cap) return null;
      const rank = this.rankNow(sim);
      // the last ones going down together still end it 'last' (the tie is broken by tick order)
      return sim.makeResult(sim.brawlers[rank[0]].team, alive <= 1 ? 'last' : 'time', [0, 0], rank);
    },

    hud(sim) {
      let n = 0;
      for (const b of sim.brawlers) if (b.alive) n++;
      return { mode: 'sd', time: sim.t, alive: n, poison: sim.poison };
    },
  }),

  // Blast Ball: first to 2 goals. Holding the ball, attack kicks it and uses an ammo bar; a charged
  // super kicks it further and faster and is used up (either aimed, or with a tap at the enemy
  // goal); gadgets are off while holding it. After a goal the world freezes for the celebration,
  // then everyone and the ball go back to the start. Tied at the end of the clock: sudden-death
  // overtime with every breakable wall gone; still tied, a draw.
  ball: ModeKit.make(MODE.BALL, {
    respawn: 5,
    len: 150,
    otLen: 60,
    goal: 2,
    celebrate: 2.5,
    kickSpd: 14, // rolls about 10 tiles
    superKickSpd: 20, // about 15

    init(sim) {
      const m = sim.map, o = m.obj || { x: m.w / 2, y: m.h / 2 };
      sim.ms = { goals: [0, 0], ot: false };
      sim.addBall(o.x, o.y);
    },

    goalCentre(sim, team) {
      const g = sim.map.goals.find((q) => q.team === team);
      return g ? { x: (g.x0 + g.x1) / 2, y: (g.y0 + g.y1) / 2 } : { x: sim.map.w / 2, y: team === 1 ? 0 : sim.map.h };
    },

    onAction(sim, b, act, I) {
      const o = sim.ball;
      if (!o || o.holder !== b.slot) return false;
      if (act === ACT.GADGET) return true; // as in the original: no gadgets while holding the ball
      if (act !== ACT.ATTACK && act !== ACT.SUPER) return false;
      if (act === ACT.ATTACK ? b.ammo < 1 || b.atkCd > 0 : !b.supReady) return true; // nothing to kick with
      const eg = this.goalCentre(sim, 1 - b.team);
      const ang = I.auto ? Math.atan2(eg.y - b.y, eg.x - b.x) : I.aimA;
      if (act === ACT.ATTACK) {
        b.ammo -= 1;
        b.atkCd = 0.3;
        sim.kickBall(b, ang, this.kickSpd, 0, 2);
      } else {
        b.sup = 0;
        b.supReady = false;
        sim.kickBall(b, ang, this.superKickSpd, 0, 3);
      }
      b.face = ang;
      b.faceT = 0.25;
      return true;
    },

    tick(sim) {
      const ms = sim.ms, o = sim.ball;
      sim.stepBall();
      // a carrier going down this very tick doesn't score (the ball drops with them)
      const dying = o.holder >= 0 && sim.brawlers[o.holder].hp <= 0;
      for (const g of sim.map.goals) {
        if (dying || o.x < g.x0 || o.x > g.x1 || o.y < g.y0 || o.y > g.y1) continue;
        this.score(sim, 1 - g.team, o.holder >= 0 ? o.holder : o.kicker);
        break;
      }
      if (!ms.ot && sim.playT >= this.len && ms.goals[0] === ms.goals[1]) {
        ms.ot = true;
        const m = sim.map;
        for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === TILE.WALL) sim.setTile(i, TILE.FLOOR);
      }
    },

    score(sim, team, slot) {
      const ms = sim.ms, o = sim.ball;
      ms.goals[team]++;
      const sc = slot >= 0 ? sim.brawlers[slot] : null;
      const own = !sc || sc.team !== team; // an own goal: nobody gets the credit
      if (!own) sc.st.goals++;
      if (o.holder >= 0) sim.dropBall();
      o.vx = o.vy = o.vz = 0;
      sim.ev(EV.GOAL, team, own ? -1 : slot);
      sim.freezeT = this.celebrate;
    },

    thaw(sim) { sim.resetRound({}); },

    checkEnd(sim) {
      const ms = sim.ms, g = ms.goals, lead = ModeKit.leader(g);
      if (g[0] >= this.goal || g[1] >= this.goal) return sim.makeResult(lead, 'goals', g.slice());
      if (ms.ot && lead >= 0) return sim.makeResult(lead, 'goals', g.slice());
      if (!ms.ot && sim.playT >= this.len && lead >= 0) return sim.makeResult(lead, 'time', g.slice());
      if (sim.playT >= this.len + this.otLen) return sim.makeResult(-1, 'time', g.slice());
      return null;
    },

    hud(sim) {
      const ms = sim.ms;
      return { mode: 'ball', time: Math.max(0, (ms.ot ? this.len + this.otLen : this.len) - sim.playT), goals: [ms.goals[0], ms.goals[1]], ot: ms.ot };
    },
  }),

  // Knockout: best of 3 rounds, no respawns. A round goes to the team that knocks out the other;
  // poison closes in after 45 s. Between rounds the world freezes, then the map and everyone reset.
  ko: ModeKit.make(MODE.KNOCKOUT, {
    poison: { start: 45, shrink: 40, minHalf: 1, pct: 0.2 },
    roundCap: 120, // the poison has won by then; a safety net decided by who is still standing
    need: 2,
    maxRounds: 5, // drawn rounds don't count
    pause: 3,

    init(sim) { sim.ms = { round: 1, rounds: [0, 0], alive: [0, 0] }; },
    canRespawn() { return false; },

    tick(sim) {
      const a = sim.ms.alive;
      a[0] = a[1] = 0;
      for (const b of sim.brawlers) if (b.alive) a[b.team]++;
    },

    checkEnd(sim) {
      const ms = sim.ms, a = [0, 0], hp = [0, 0];
      for (const b of sim.brawlers) if (b.alive) { a[b.team]++; hp[b.team] += b.hp / b.maxHp; }
      ms.alive[0] = a[0]; ms.alive[1] = a[1];
      let w;
      if (!a[0] && !a[1]) w = -1;
      else if (!a[0]) w = 1;
      else if (!a[1]) w = 0;
      else if (sim.t - sim.roundT0 >= this.roundCap) w = a[0] !== a[1] ? (a[0] > a[1] ? 0 : 1) : hp[0] !== hp[1] ? (hp[0] > hp[1] ? 0 : 1) : -1;
      else return null;
      if (w >= 0) ms.rounds[w]++;
      sim.ev(EV.ROUND, w, ms.round);
      if (ms.rounds[0] >= this.need || ms.rounds[1] >= this.need || ms.round >= this.maxRounds) {
        return sim.makeResult(ModeKit.leader(ms.rounds), 'rounds', ms.rounds.slice());
      }
      ms.round++;
      sim.freezeT = this.pause;
      return null;
    },

    thaw(sim) { sim.resetRound({ tiles: true }); },

    hud(sim) {
      const ms = sim.ms;
      return { mode: 'ko', time: Math.max(0, this.roundCap - (sim.t - sim.roundT0)), round: ms.round, rounds: [ms.rounds[0], ms.rounds[1]], alive: [ms.alive[0], ms.alive[1]], poison: sim.poison && sim.poison.k > 0 ? sim.poison : null };
    },
  }),

  // Bounty: everyone wears 2 stars, +1 per takedown (up to 7). Taking someone down scores their
  // stars for your team and puts them back to 2. The blue centre star is worth 1 to the team that
  // takes it and breaks a tie; it changes hands when its carrier is taken down. The first team to 20
  // stars wins, else the most stars after 2 minutes (equal: the blue star's team; nobody took it: a
  // draw). Respawns take only 3 s here.
  bounty: ModeKit.make(MODE.BOUNTY, {
    len: 120,
    base: 2,
    max: 7,
    win: 20,
    respawn: 3,

    init(sim) {
      sim.ms = { stars: [0, 0], blue: -1, blueSlot: -1 };
      for (const b of sim.brawlers) b.bounty = this.base;
      const o = sim.map.obj;
      if (o) sim.spawnPickup(PICK.STAR, 1, o.x, o.y, o.x, o.y);
    },

    onKill(sim, v, k) {
      const ms = sim.ms;
      if (k) {
        ms.stars[k.team] += v.bounty;
        k.st.stars += v.bounty;
        // a killer who is down too (a same-tick trade, a turret or pet of the fallen) gets no star
        if (k.alive && k.hp > 0) k.bounty = Math.min(this.max, k.bounty + 1);
      }
      // the blue star's carrier went down: it goes to the other team (to the one who took them down)
      if (ms.blueSlot === v.slot) {
        ms.blue = k ? k.team : 1 - v.team;
        ms.blueSlot = k && k.alive && k.hp > 0 ? k.slot : -1;
      }
      v.bounty = this.base;
    },

    onPickup(sim, b, p) {
      if (p.pick !== PICK.STAR) return false;
      sim.ms.stars[b.team] += p.n;
      b.st.stars += p.n;
      sim.ms.blue = b.team; // the tie-breaker, carried by whoever took it (their bounty stays)
      sim.ms.blueSlot = b.slot;
      return true;
    },

    checkEnd(sim) {
      const ms = sim.ms, s = ms.stars;
      if (s[0] >= this.win || s[1] >= this.win) return sim.makeResult(ModeKit.leader(s), 'stars', s.slice());
      if (sim.playT < this.len) return null;
      const w = ModeKit.leader(s);
      return sim.makeResult(w >= 0 ? w : ms.blue, 'stars', s.slice());
    },

    hud(sim) {
      const ms = sim.ms, s = ms.stars;
      return { mode: 'bounty', time: Math.max(0, this.len - sim.playT), stars: [s[0], s[1]], blue: ms.blue };
    },
  }),

  // Test deathmatch (headless tests only): 2 minutes, respawns, most kills wins. Works for any number
  // of teams (team = slot gives a free-for-all on one-list maps).
  test: ModeKit.make('test', {
    len: 120,
    init(sim) { sim.ms = { kills: new Array(sim.nTeams).fill(0) }; },
    onKill(sim, v, k) { if (k) sim.ms.kills[k.team]++; },
    checkEnd(sim) {
      if (sim.t < this.len) return null;
      return sim.makeResult(ModeKit.leader(sim.ms.kills), 'time', sim.ms.kills.slice(0, 2));
    },
    hud(sim) {
      const h = { mode: 'test', time: Math.max(0, this.len - sim.t), kills: sim.ms.kills.slice() };
      if (sim.poison) h.poison = sim.poison;
      return h;
    },
  }),
};
