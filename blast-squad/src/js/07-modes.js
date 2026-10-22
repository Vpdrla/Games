// ---------- Modes ----------
// Each mode is a set of hooks the sim calls (see DESIGN.md "Modes"); its state lives in sim.ms.
// ModeKit.make(key, hooks) fills in defaults, so a mode only writes what differs.
//
// Adding a mode (Showdown, Blast Ball, Knockout, Bounty come in a later wave) — what the sim offers:
//   - spawns: ModeKit.spawnPoint picks map.spawns by team (3v3) or by slot / sim.ms.order (Showdown).
//   - poison: set `poison: { start, shrink, minHalf, dmg }` on the mode. The sim keeps sim.poison
//     (the safe rect), deals `dmg` per second outside it, emits EV.POISON, and measures time from
//     sim.roundT0 (restarted by sim.resetRound()).
//   - Showdown: map BOX tiles have sim.boxHp and drop PICK.CUBE pickups when destroyed; take them in
//     onPickup with ModeKit.cube (sim.addCube adds CUBE_HP and CUBE_DMG). sim.deathOrder lists the
//     slots in the order they went down; return `rank` (1st first) from checkEnd. canRespawn: false.
//     Drop cubes on death with sim.dropPickups(PICK.CUBE, n, x, y).
//   - Knockout: canRespawn false; when a team is wiped, EV.ROUND then sim.resetRound({ tiles }).
//   - Blast Ball: sim.addBall(x, y) in init, sim.stepBall() in tick, onAction(sim, b, act, input)
//     returning true when the holder kicks (sim.kickBall) instead of attacking. Goal rects are in
//     map.goals; count b.st.goals and emit EV.GOAL.
//   - Bounty: b.bounty (stars on the head), PICK.STAR pickups at map.obj, b.st.stars.
//   - every mode: hud(sim) returns the HUD object of DESIGN.md; checkEnd returns
//     sim.makeResult(winner, reason, score, rank) or null.
//   tools/sim-test.cjs registers a minimal Showdown-like mode ('zz_sd': poison, no respawn, cubes
//   dropped on death, placement from sim.deathOrder) on a generated 44 x 44 map: a working sketch.

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
  // Gem Rush (Gem Grab): the mine spits a gem every 7 s; a team holding 10+ gems and more than the
  // other starts a 15 s countdown that resets as soon as that stops being true.
  gem: ModeKit.make(MODE.GEM, {
    first: 2, // s until the first gem
    every: 7,
    goal: 10,
    count: 15,
    cap: 300, // hidden safety cap: no visible clock, but a match can't run forever

    init(sim) {
      sim.ms = { gems: [0, 0], mineT: this.first, count: 0, countTeam: -1, spawned: 0 };
    },

    tick(sim) {
      const ms = sim.ms, mine = sim.map.mine;
      ms.mineT -= SIM_DT;
      if (ms.mineT <= 0) {
        ms.mineT += this.every;
        if (mine) { sim.popPickup(PICK.GEM, 1, mine.x, mine.y, 1.1, 2.1); ms.spawned++; }
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
      if (sim.t >= this.cap) return sim.makeResult(ModeKit.leader(ms.gems), 'time', ms.gems.slice());
      return null;
    },

    hud(sim) {
      const ms = sim.ms;
      // no visible clock in Gem Rush: time is the elapsed time
      return { mode: 'gem', time: sim.t, gems: [ms.gems[0], ms.gems[1]], count: ms.countTeam >= 0 ? Math.max(0, Math.ceil(ms.count - 1e-6)) : 0, countTeam: ms.countTeam };
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
