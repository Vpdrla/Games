// ---------- Bot motor: a thumb on a touch screen ----------
// Turns the mind's intent into input words the way a person's thumbs would: the move stick swings at
// a limited speed and jukes sideways in fights; aiming is a quick flick that overshoots a little and
// corrects (timed by Fitts' law), with an endpoint error that grows with distance, the target's
// sideways speed and stress; moving targets are led only partly. Shots only dodge projectiles the bot
// noticed in time. class Bot ties perception (08), mind (09) and motor together; it sees the world only
// through perceive(). Telemetry measures any slot (bot or human) the same way for tools/ai-test.cjs.

class Bot {
  constructor(slot, profile, seed) {
    this.slot = slot;
    this.prof = profile || {};
    this.rng = new RNG((seed ^ hashStr('bot:' + slot)) >>> 0);
    this.mind = new Mind(slot, this.prof, this.rng);
    this.p = this.mind.p;
    this.P = newPercept();
    this.kit = null;
    this.t = 0; this.n = 0; this.phase = slot % 2;
    // move stick
    this.mvA = 0; this.mvM = 0; this.jukeDir = this.rng.chance(0.5) ? 1 : -1; this.latV = 0; this.jukeT = 0;
    this.wiggleT = 0; this.wiggleA = 0;
    this.fidgetUntil = 0; this.fidgetNext = this.rng.range(1, 4); this.fidgetA = 0; // idle thumb fidgets
    this.hist = []; // recent positions for stuck detection { t, x, y, push }
    // aim
    this.aimA = 0; this.from = 0; this.to = 0; this.over = 0; this.flickT0 = -9; this.flickDur = 0; this.aimKey = -2;
    this.tapAt = 0; this.aimStopUntil = 0;
    this.aimGoal = 0; this.errOff = 0; this.depthErr = 0; this.corrAt = 0; // the aim's own error, kept until corrected
    this.prevAmmo = MAX_AMMO; this.ammoAt = 0; // a bar that just refilled is noticed a moment later
    // paths
    this.flow = null; this.flowKey = -1; this.flowT = -9; this._fd = { x: 0, y: 0, d: 0 };
    this.outPin = null; this.outEmote = null;
    this.tel = { dirCh: 0, fastRev: 0, idle: 0, alive: 0, bush: 0, ticks: 0, stuck: 0, supDelay: [], fires: 0, supers: 0, gadgets: 0, autoTaps: 0, lastA: null, lastAT: 0, jukeAt: -9, supReadyT: -1 };
  }

  get telemetry() {
    const T = this.tel, m = this.mind;
    return { reacts: m.reacts.slice(), retreatHPs: m.retreatHPs.slice(), dirChanges: T.dirCh, fastReversals: T.fastRev, idle: T.idle, alive: T.alive, bush: T.bush, ticks: T.ticks, stuck: T.stuck, superDelays: T.supDelay.slice(), fires: T.fires, supers: T.supers, gadgets: T.gadgets, autoTaps: T.autoTaps };
  }

  initKit(bk, gadget) {
    const D = BRAWLERS[bk];
    const sp = U(D.speed);
    this.kit = { bk, D, atkF: atkFacts(D.atk, sp), supF: atkFacts(D.sup, sp), gadF: atkFacts(D.gadgets && gadget >= 0 ? D.gadgets[gadget] : null, sp), speed: sp };
  }

  // One tick: called by the match right before sim.step(), returns this player's input word.
  tick(sim) {
    this.n++;
    this.t += SIM_DT;
    let fresh = false;
    if (!this.kit || this.n % 2 === this.phase) { perceive(sim, this.slot, this.P, this.rng); fresh = true; }
    return this.act(this.P, fresh);
  }

  act(P, fresh) {
    const mind = this.mind, me = P.me;
    if (!this.kit) this.initKit(me.bk, me.gadget);
    if (fresh) mind.observe(P);
    if (this.t >= mind.nextThink) {
      mind.decide(P, this.kit);
      mind.nextThink = this.t + this.p.think * this.rng.range(0.7, 1.3);
    }
    mind.flushPins(this.t);
    if (mind.outPin != null) { this.outPin = mind.outPin; mind.outPin = null; }
    if (mind.outEmote != null) { this.outEmote = mind.outEmote; mind.outEmote = null; }
    if (!me.alive) { this.mvM = 0; this.flickT0 = -9; this.aimKey = -2; this.telemetry_(P, 0); return IN_IDLE; }
    if (P.frozen) { this.mvM = 0; this.flickT0 = -9; this.aimKey = -2; this.hist.length = 0; return IN_IDLE; } // thumbs off during the banner
    this.move(P);
    const shot = this.aim(P);
    this.telemetry_(P, shot.act);
    return packIn(this.mvA, this.mvM, shot.ang, shot.d, shot.act, shot.auto);
  }

  // ---- movement ----
  move(P) {
    const me = P.me, I = this.mind.intent, p = this.p, r = this.rng, dt = SIM_DT;
    let dx = 0, dy = 0, want = 1;
    const m = I.target >= 0 ? this.mind.mem[I.target] : null;
    const fighting = m && m.noticed && (I.goal === 'fight' || I.goal === 'push' || I.goal === 'overextend' || I.goal === 'help' || I.goal === 'defend' || I.goal === 'escort');
    if (fighting && m.seen) {
      const d = Math.hypot(m.x - me.x, m.y - me.y) || 0.01;
      const ux = (m.x - me.x) / d, uy = (m.y - me.y) / d;
      const atk = this.kit.atkF;
      const role = this.kit.D.role;
      let pd = atk.eff * (role === 'tank' || role === 'assassin' ? 0.55 : role === 'sharp' || role === 'thrower' ? 0.92 : 0.8);
      pd /= Math.max(0.7, I.stance);
      if (P.me.hp / P.me.maxHp < 0.4) pd *= 1.25;
      if (!walkClear(P.map, me.x, me.y, m.x, m.y) && d > pd * 0.8 && !atk.lob) {
        this.pathTo(P, m.x, m.y);
        dx = this._fd.x; dy = this._fd.y;
      } else {
        const radial = clamp((d - pd) / 1.6, -1, 1);
        // sideways jukes: bursts in one direction, then a switch, plus a wobble
        this.jukeT -= dt;
        if (this.jukeT <= 0) { this.jukeDir = -this.jukeDir; this.jukeT = r.range(0.35, 1.2) / Math.max(0.3, p.juke); this.tel.jukeAt = this.t; }
        this.latV += (-this.latV * 2.5 + r.range(-1, 1) * 3) * dt;
        const lat = this.jukeDir * 0.85 + this.latV * 0.4;
        dx = ux * radial + -uy * lat;
        dy = uy * radial + ux * lat;
      }
    } else if (I.goal !== 'dead') {
      const fs = this.freeSpot(P.map, I.gx, I.gy);
      if (fs) { I.gx = fs.x; I.gy = fs.y; }
      const gd = Math.hypot(I.gx - me.x, I.gy - me.y);
      if (gd > 0.9) {
        this.pathTo(P, I.gx, I.gy);
        dx = this._fd.x; dy = this._fd.y;
        if (dx === 0 && dy === 0) { dx = I.gx - me.x; dy = I.gy - me.y; }
      } else {
        // arrived: with enemies on screen people keep shuffling sideways; otherwise mostly stand
        // (but not out of a bush they're hiding in), staying around their spot
        if (P.enemies.length && this.p.juke > 0.3 && !me.inBush && I.goal !== 'ambush') {
          this.jukeT -= dt;
          if (this.jukeT <= 0) { this.jukeDir = -this.jukeDir; this.jukeT = r.range(0.4, 1.3) / Math.max(0.3, p.juke); this.tel.jukeAt = this.t; }
          const e = P.enemies[0], ed = Math.hypot(e.x - me.x, e.y - me.y) || 1;
          dx = (-(e.y - me.y) / ed) * this.jukeDir + (I.gx - me.x) * 0.8; dy = ((e.x - me.x) / ed) * this.jukeDir + (I.gy - me.y) * 0.8;
          want = 0.5;
        } else if (this.t < this.fidgetUntil) {
          want = 0.5; dx = Math.cos(this.fidgetA); dy = Math.sin(this.fidgetA);
        } else {
          // standing: now and then a short fidget walk, like a thumb resting on the stick
          want = 0;
          if (this.t >= this.fidgetNext) { this.fidgetUntil = this.t + r.range(0.2, 0.6); this.fidgetNext = this.fidgetUntil + r.range(2, 5); this.fidgetA = r.range(0, TAU); }
        }
      }
      // carrying gems or retreating: keep away from enemies on screen
      if (I.goal === 'retreat' || I.goal === 'carry') {
        for (const e of P.enemies) {
          const ed = Math.hypot(e.x - me.x, e.y - me.y);
          if (ed < 7) { dx -= ((e.x - me.x) / ed) * (7 - ed) * 0.25; dy -= ((e.y - me.y) / ed) * (7 - ed) * 0.25; }
        }
      }
    }
    // dodge shots noticed in time
    for (const s of P.shots) {
      const sm = this.mind.shotMem.get(s.id);
      if (!sm || !sm.dodge || this.t < sm.noticeAt) continue;
      if (s.lob) {
        const ld = Math.hypot(s.lob.tx - me.x, s.lob.ty - me.y);
        if (ld < s.lob.r + 0.6 && s.lob.tLeft < 1.1) { dx += ((me.x - s.lob.tx) / (ld || 1)) * 2; dy += ((me.y - s.lob.ty) / (ld || 1)) * 2; }
        continue;
      }
      const vx = Math.cos(s.ang), vy = Math.sin(s.ang);
      const rx = me.x - s.x, ry = me.y - s.y;
      const along = rx * vx + ry * vy;
      if (along < 0 || along / Math.max(1, s.spd) > 0.9) continue;
      const side = rx * -vy + ry * vx + sm.err; // judged by eye: a little off
      if (Math.abs(side) > s.r + BRAWLER_R + 0.35) continue;
      const sgn = side >= 0 ? 1 : -1;
      dx += -vy * sgn * 2.2; dy += vx * sgn * 2.2;
      this.tel.jukeAt = this.t;
    }
    // step out of harmful zones (once noticed; they hurt as soon as your body touches them)
    for (const a of P.areas) {
      if (!a.harm || !(this.t >= this.mind.areaMem.get(a.id))) continue;
      const ad = Math.hypot(me.x - a.x, me.y - a.y);
      if (ad < a.r + BRAWLER_R + 0.15) { dx += ((me.x - a.x) / (ad || 1)) * 1.5; dy += ((me.y - a.y) / (ad || 1)) * 1.5; }
    }
    // stuck against something: wiggle like a person would
    if (this.wiggleT > 0) { this.wiggleT -= dt; dx = Math.cos(this.wiggleA); dy = Math.sin(this.wiggleA); want = 1; }
    // a wall in the way: switch the juke the other way, or follow the path instead
    if (dx || dy) {
      const l0 = Math.hypot(dx, dy), o = this._probe || (this._probe = { x: 0, y: 0 });
      moveCircle(P.map, me.x, me.y, BRAWLER_R, (dx / l0) * 0.3, (dy / l0) * 0.3, o);
      if (Math.hypot(o.x - me.x, o.y - me.y) < 0.08) {
        if (fighting) this.jukeDir = -this.jukeDir;
        this.pathTo(P, fighting ? m.x : I.gx, fighting ? m.y : I.gy);
        if (this._fd.x || this._fd.y) { dx = this._fd.x; dy = this._fd.y; }
      }
    }
    // lining up a manual shot: some players stop walking to aim
    if (this.aimStopUntil > this.t) want = 0;
    const l = Math.hypot(dx, dy);
    let tgtM = l > 0.05 ? want : 0;
    if (P.me.stunned) tgtM = 0;
    if (tgtM > 0) {
      const da = Math.atan2(dy, dx);
      if (this.mvM < 0.05) this.mvA = da + r.range(-0.12, 0.12); // a new thumb press lands roughly right
      else {
        const turn = angDiff(this.mvA, da);
        const maxT = p.stickRate * dt * r.range(0.7, 1.3);
        this.mvA = wrapAng(this.mvA + clamp(turn, -maxT, maxT) + r.range(-0.03, 0.03));
      }
    }
    this.mvM = approach(this.mvM, tgtM, dt * 7);
    if (this.mvM < 0.08 && tgtM === 0) this.mvM = 0;
  }

  // Nearest walkable tile centre to (gx, gy) (goals sometimes land on walls or water).
  freeSpot(map, gx, gy) {
    const tx = clamp(Math.floor(gx), 0, map.w - 1), ty = clamp(Math.floor(gy), 0, map.h - 1);
    if (!(TILE_FLAGS[map.tiles[ty * map.w + tx]] & TF_MOVE)) return null;
    for (let rad = 1; rad < 6; rad++) {
      let best = null, bd = 1e9;
      for (let y = ty - rad; y <= ty + rad; y++) for (let x = tx - rad; x <= tx + rad; x++) {
        if (x < 0 || y < 0 || x >= map.w || y >= map.h || (TILE_FLAGS[map.tiles[y * map.w + x]] & TF_MOVE)) continue;
        const d = dist2(x + 0.5, y + 0.5, gx, gy);
        if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
      }
      if (best) return best;
    }
    return null;
  }

  // Walks a flow field towards (gx, gy); recomputed when the goal tile changes (at most 2x a second).
  pathTo(P, gx, gy) {
    const map = P.map, me = P.me;
    const fs = this.freeSpot(map, gx, gy);
    if (fs) { gx = fs.x; gy = fs.y; }
    const key = Math.floor(clamp(gy, 0, map.h - 1)) * map.w + Math.floor(clamp(gx, 0, map.w - 1));
    if (key !== this.flowKey && (this.t - this.flowT > 0.5 || !this.flow)) {
      this.flow = flowField(map, [{ x: gx, y: gy }]);
      this.flowKey = key;
      this.flowT = this.t;
    }
    if (!this.flow) { this._fd.x = this._fd.y = 0; return; }
    flowDir(map, this.flow, me.x, me.y, this._fd);
    if (this._fd.d < 1.6 && walkClear(map, me.x, me.y, gx, gy)) { const d = Math.hypot(gx - me.x, gy - me.y) || 1; this._fd.x = (gx - me.x) / d; this._fd.y = (gy - me.y) / d; }
  }

  // ---- aiming and firing ----
  // Returns { ang, d, act, auto } for this tick.
  aim(P) {
    const me = P.me, I = this.mind.intent, p = this.p, r = this.rng, t = this.t;
    const out = this._shot || (this._shot = { ang: 0, d: 1, act: 0, auto: 0 });
    out.act = 0; out.auto = 0;
    if (me.ammo >= 1 && this.prevAmmo < 1) this.ammoAt = t + r.range(0.06, 0.3) * lerp(1.4, 0.8, p.s);
    this.prevAmmo = me.ammo;
    const holding = P.ball && P.ball.holderSlot === me.slot;
    const m = I.target >= 0 && !holding ? this.mind.mem[I.target] : null;
    let spec = this.kit.atkF, act = 0, tx = 0, ty = 0, key = -1, has = false, range = 0;
    // what to point at (with the ball: a teammate to pass to, or the goal; never a brawler)
    if (holding) {
      const eg = P.map.goals.find((g) => g.team !== me.team);
      const ks = !I.passTo && !I.clearTo && eg ? this.kickSpot(P, eg) : null;
      if (I.passTo) { has = true; key = 102; tx = I.passTo.x; ty = I.passTo.y; act = ACT.SUPER; range = Bot.PASS_RANGE; } else if (I.clearTo) { has = true; key = 103; tx = I.clearTo.x; ty = I.clearTo.y; act = ACT.ATTACK; range = Bot.KICK_RANGE; } else if (ks) { has = true; key = 101; tx = ks.x; ty = ks.y; range = Bot.KICK_RANGE; }
    } else {
      const dp = this.deployTarget(P, m && m.noticed && m.seen ? Math.hypot(m.x - me.x, m.y - me.y) : Infinity);
      if (dp) { has = true; key = 104; tx = dp.x; ty = dp.y; } else if (m && m.noticed && m.seen) { has = true; key = I.target; tx = m.x; ty = m.y; } else if (I.bushShot) { has = true; key = 100; tx = I.bushShot.x; ty = I.bushShot.y; }
    }
    // with the ball only a buff gadget; on a pet or turret only the main attack
    if (holding) { if (I.wantGadget && me.gadReady && this.kit.gadF.t === 'buff') { act = ACT.GADGET; spec = this.kit.gadF; } } else if (key === 104) { /* main attack */ } else if (I.wantGadget && me.gadReady && this.kit.gadF.t !== 'none') { act = ACT.GADGET; spec = this.kit.gadF; } else if (I.wantSuper && me.supReady) { act = ACT.SUPER; spec = this.kit.supF; }
    if (!has) {
      // nothing to shoot: aim drifts where you walk
      this.aimA = wrapAng(this.aimA + angDiff(this.aimA, this.mvA) * 0.1);
      out.ang = this.aimA; out.d = 1;
      if (act && (act === ACT.GADGET ? I.gadMode : I.superMode) === 'self') { out.act = act; this.fired(act, false); }
      return out;
    }
    const d = Math.hypot(tx - me.x, ty - me.y) || 0.01;
    // lead: aim where it will be, partly (people under-lead). A lob's flight time depends on how far
    // it's thrown (short throws land sooner), and the throw goes to the led spot, not the target.
    let tf = spec.lob ? spec.T : spec.spd === Infinity ? 0.05 : d / spec.spd;
    let px = tx, py = ty;
    if (m && key === I.target) {
      px = tx + m.vx * tf * p.lead; py = ty + m.vy * tf * p.lead;
      if (spec.lob && spec.range > 0) {
        for (let i = 0; i < 2; i++) {
          tf = spec.T * (0.6 + 0.4 * Math.min(1, Math.hypot(px - me.x, py - me.y) / spec.range));
          px = tx + m.vx * tf * p.lead; py = ty + m.vy * tf * p.lead;
        }
      }
    }
    const dl = Math.hypot(px - me.x, py - me.y) || 0.01;
    let ang = Math.atan2(py - me.y, px - me.x);
    const mode = key >= 101 ? 'target' : act === ACT.GADGET ? I.gadMode : act === ACT.SUPER ? I.superMode : 'target';
    if (mode === 'away') ang = wrapAng(ang + Math.PI + r.range(-0.4, 0.4));
    // a new target or a big swing: flick there (with overshoot), else follow smoothly
    const goalAng = ang;
    if (key !== this.aimKey || Math.abs(angDiff(this.aimGoal, goalAng)) > 0.45) {
      const lateral = m && key === I.target ? Math.abs((m.vx * -(py - me.y) + m.vy * (px - me.x)) / d) : 0;
      const stress = me.hp / me.maxHp < 0.35 ? 0.5 : 0;
      const errTiles = p.aimErr * (0.1 + 0.045 * d + 0.12 * lateral) * (1 + stress);
      const g1 = Math.sqrt(-2 * Math.log(1 - r.next() * 0.999999)), g2 = TAU * r.next();
      this.from = this.aimA;
      this.errOff = (g1 * Math.cos(g2) * errTiles) / Math.max(1, d); // sideways miss (angle)
      this.depthErr = g1 * Math.sin(g2) * errTiles * 0.8; // and too short / too long (tiles: lobs, leaps)
      this.aimGoal = goalAng;
      this.to = wrapAng(goalAng + this.errOff);
      const D = Math.abs(angDiff(this.from, this.to)) * Math.max(1, d);
      this.flickDur = p.flick + p.fitts * Math.log2(1 + D / 0.6);
      this.over = angDiff(this.from, this.to) * r.range(0.1, 0.2);
      this.flickT0 = t;
      this.corrAt = t + this.flickDur + r.range(0.15, 0.35); // noticing the aim is off takes a moment
      this.aimKey = key;
      if (key < 100 && r.chance(p.aimStop)) this.aimStopUntil = t + this.flickDur * r.range(0.4, 0.9);
    } else {
      // smooth pursuit of a moving target keeps the aim's own error; it's corrected only after a
      // moment, and slowly by weaker players
      this.aimGoal = goalAng;
      if (t > this.corrAt) { const f = Math.exp(-lerp(0.8, 3, p.s) * SIM_DT); this.errOff *= f; this.depthErr *= f; }
      this.to = wrapAng(goalAng + this.errOff);
    }
    const k = (t - this.flickT0) / Math.max(0.05, this.flickDur);
    if (k < 0.75) {
      const u = k / 0.75, mj = u * u * u * (10 - 15 * u + 6 * u * u); // minimum-jerk profile
      this.aimA = wrapAng(this.from + (angDiff(this.from, this.to) + this.over) * mj);
    } else if (k < 1) {
      this.aimA = wrapAng(this.aimA + angDiff(this.aimA, this.to) * 0.35);
    } else this.aimA = this.to;
    const settled = k >= 1;
    out.ang = this.aimA;
    if (!range) range = spec.range || this.kit.atkF.range || 1;
    out.d = clamp((dl + (spec.lob ? this.depthErr : 0)) / range, 0.05, 1);
    if (t < this.tapAt) return out;
    // decide to shoot (a kick: in range, with a clear line to the goal mouth)
    if (act === 0 && key === 101) {
      if (d > range * lerp(0.85, 1, p.s) || !shotClear(P.map, me.x, me.y, tx, ty)) return out;
      act = ACT.ATTACK;
    } else if (act === 0) {
      const atk = this.kit.atkF;
      if (me.ammo < 1 || t < this.ammoAt) return out;
      const reach = atk.range * lerp(1.15, 0.98, p.discipline);
      if (d > reach) return out;
      if (!atk.lob && atk.t === 'shot' && !shotClear(P.map, me.x, me.y, tx, ty)) return out;
      act = ACT.ATTACK;
    }
    // auto-aim taps skip the flick (and aim at the target's current spot, chosen by the sim)
    const auto = act === ACT.ATTACK && (key < 100 || key === 101) && r.chance(p.autoAim);
    if (!settled && !auto) return out;
    out.act = act;
    out.auto = auto ? 1 : 0;
    this.fired(act, auto);
    return out;
  }

  // An enemy pet closing in on me, or a turret within reach, that's nearer than the brawler I'm after
  // (md): people shoot those down first rather than let them chew on them.
  deployTarget(P, md) {
    const me = P.me, reach = this.kit.atkF.range * 0.9;
    let best = null, bd = md;
    for (const d of P.deploys) {
      if (d.team === me.team) continue;
      const dd = Math.hypot(d.x - me.x, d.y - me.y);
      if (dd < bd && dd < (d.dk.includes('bear') ? 3.5 : reach)) { bd = dd; best = d; }
    }
    return best;
  }

  // A point in the goal mouth with an open lane: no wall, and no enemy I know of standing in the way
  // (a kick into a defender is just a gift). Centre first, then the posts.
  kickSpot(P, g) {
    const me = P.me, gy = (g.y0 + g.y1) / 2, foes = this.mind.known(true);
    for (const gx of [(g.x0 + g.x1) / 2, g.x0 + 0.7, g.x1 - 0.7]) {
      if (!shotClear(P.map, me.x, me.y, gx, gy)) continue;
      const dx = gx - me.x, dy = gy - me.y, L2 = dx * dx + dy * dy || 1;
      let open = true;
      for (const f of foes) {
        const k = ((f.x - me.x) * dx + (f.y - me.y) * dy) / L2;
        if (k < 0.05 || k > 1) continue;
        const px = me.x + dx * k - f.x, py = me.y + dy * k - f.y;
        if (px * px + py * py < 0.85) { open = false; break; }
      }
      if (open) {
        const o = this._ks || (this._ks = { x: 0, y: 0 });
        o.x = gx; o.y = gy;
        return o;
      }
    }
    return null;
  }

  fired(act, auto) {
    const r = this.rng;
    this.tapAt = this.t + (act === ACT.ATTACK ? r.range(0.17, 0.34) : r.range(0.3, 0.6));
    this.aimKey = -2; // the next shot starts with a fresh (small) flick
    const T = this.tel;
    if (act === ACT.ATTACK) { T.fires++; if (auto) T.autoTaps++; } else if (act === ACT.SUPER) { T.supers++; if (T.supReadyT >= 0) { T.supDelay.push(this.t - T.supReadyT); T.supReadyT = -1; } } else if (act === ACT.GADGET) T.gadgets++;
    if (act === ACT.SUPER) this.mind.intent.wantSuper = false;
    if (act === ACT.GADGET) this.mind.intent.wantGadget = false;
    if (act === ACT.SUPER) this.mind.intent.passTo = null;
    if (act === ACT.ATTACK) this.mind.intent.clearTo = null;
  }

  // ---- telemetry (and getting unstuck) ----
  telemetry_(P, act) {
    const T = this.tel, me = P.me, t = this.t;
    T.ticks++;
    if (!me.alive) { this.hist.length = 0; return; }
    T.alive++;
    if (this.mvM === 0) T.idle++;
    if (me.inBush) T.bush++;
    if (me.supReady && T.supReadyT < 0) T.supReadyT = t;
    if (!me.supReady && T.supReadyT >= 0 && act !== ACT.SUPER) T.supReadyT = -1;
    // stick direction changes, sampled every 0.25 s
    if (this.mvM > 0.3) {
      if (T.lastA == null) { T.lastA = this.mvA; T.lastAT = t; T.prevA = this.mvA; T.prevAT = t; }
      if (t - T.lastAT >= 0.25) {
        const ch = Math.abs(angDiff(T.lastA, this.mvA));
        if (ch > Math.PI / 6) T.dirCh++;
        // sudden about-turns outside fights and dodges (in a fight, strafing back and forth is normal)
        if (ch > (150 / 180) * Math.PI && t - T.lastAT < 0.31 && t - T.jukeAt > 0.35 && this.mind.intent.target < 0) T.fastRev++;
        T.lastA = this.mvA; T.lastAT = t;
      }
    }
    // stuck: pushing the stick but hardly moving (path length, so turning back isn't "stuck")
    const hl = this.hist, prev = hl.length ? hl[hl.length - 1] : null;
    hl.push({ t, x: me.x, y: me.y, push: this.mvM > 0.5, step: prev ? Math.hypot(me.x - prev.x, me.y - prev.y) : 0 });
    while (hl.length && t - hl[0].t > 3) hl.shift();
    if (hl.length > 80 && t - hl[0].t > 2.9) {
      let pushing = 0, path = 0;
      for (const h of hl) { if (h.push) pushing++; path += h.step; }
      if (pushing > hl.length * 0.8 && path < 0.3) { T.stuck++; hl.length = 0; }
    }
    if (hl.length > 40 && this.wiggleT <= 0 && this.mvM > 0.5) {
      let path = 0;
      for (let i = hl.length - 40; i < hl.length; i++) path += hl[i].step;
      if (path < 0.15) { this.wiggleT = 0.35; this.wiggleA = this.rng.range(0, TAU); }
    }
  }
}

// Measures one player (bot or human) from the sim and its events, the same way for both, so bot
// behaviour can be compared with real play (window.__BS.telemetry()).
Bot.KICK_RANGE = 9; // a kicked ball rolls about 10 tiles (MODES.ball.kickSpd)
Bot.PASS_RANGE = 8; // MODES.ball.passRange

class Telemetry {
  constructor(sim, slot) {
    this.sim = sim; this.slot = slot;
    this.t = 0; this.alive = 0; this.idle = 0; this.bush = 0; this.dirCh = 0; this.lastA = null; this.lastAT = 0;
    this.fires = []; // { t, d, flight, hit }
    this.appear = new Map(); // enemy slot -> time it appeared on screen
    this.responses = []; // first shot after an enemy appeared (s)
    this.cam = {};
    this.supReadyT = -1; this.supDelays = []; this.deaths = 0; this.kills = 0; this._in = {};
  }
  tick(evs) {
    const sim = this.sim, b = sim.brawlers[this.slot], t = sim.t;
    this.t = t;
    if (b.alive && !(sim.freezeT > 0)) { // a frozen world (goal, round end) isn't play time
      this.alive++;
      const w = sim.inputs[this.slot];
      const I = unpackIn(w, this._in);
      if (I.mvM === 0) this.idle++;
      if (b.inBush) this.bush++;
      if (I.mvM > 0.3) {
        if (this.lastA == null) { this.lastA = I.mvA; this.lastAT = t; }
        if (t - this.lastAT >= 0.25) { if (Math.abs(angDiff(this.lastA, I.mvA)) > Math.PI / 6) this.dirCh++; this.lastA = I.mvA; this.lastAT = t; }
      }
      if (b.supReady && this.supReadyT < 0) this.supReadyT = t;
      // enemies appearing on this player's screen
      const sd = sim.modeKey === MODE.SHOWDOWN;
      cameraRect(sim.map, b.x, b.y, b.team === 1 && !sd, sd, this.cam);
      for (const e of sim.brawlers) {
        if (e.team === b.team) continue;
        const on = e.alive && sim.visibleTo(b.team, e) && inRect(this.cam, e.x, e.y, 0.3);
        if (on && !this.appear.has(e.slot)) this.appear.set(e.slot, t);
        if (!on) this.appear.delete(e.slot);
      }
    }
    for (const ev of evs) {
      if (ev[0] === EV.FIRE && ev[1] === this.slot) {
        if (ev[2] === ACT.ATTACK) {
          let nd = 99;
          for (const e of sim.brawlers) if (e.team !== b.team && e.alive && sim.visibleTo(b.team, e)) nd = Math.min(nd, Math.hypot(e.x - b.x, e.y - b.y));
          const D = BRAWLERS[b.bk].atk;
          const flight = D.t === 'lob' ? D.T || 0.8 : D.t === 'shot' ? nd / (D.spd || 12) : 0.1;
          // "multi": anything but one narrow projectile (spreads, bursts, beams, dashes, wide or widening
          // waves, puddles): hitting with those says little about aim
          const wide = (D.r || 0) >= 0.5 || !!D.grow || !!D.area;
          this.fires.push({ t, d: nd, flight, hit: false, multi: (D.n || 1) > 1 || D.t === 'beam' || D.t === 'dash' || wide });
          for (const [slot, at] of this.appear) { if (at >= 0) { this.responses.push(t - at); this.appear.set(slot, -1); } }
        } else if (ev[2] === ACT.SUPER && this.supReadyT >= 0) { this.supDelays.push(t - this.supReadyT); this.supReadyT = -1; }
      } else if (ev[0] === EV.HIT && ev[5] === this.slot && ev[7] === ACT.ATTACK) {
        const tg = sim.brawlers.find((x) => x.id === ev[1]);
        if (tg && tg.team !== b.team) {
          for (let i = this.fires.length - 1; i >= 0 && i >= this.fires.length - 6; i--) {
            const f = this.fires[i];
            if (t >= f.t && t <= f.t + f.flight + 0.3) { f.hit = true; break; }
          }
        }
      } else if (ev[0] === EV.KILL) {
        if (ev[1] === this.slot) this.deaths++;
        if (ev[2] === this.slot) this.kills++;
      }
    }
  }
  report() {
    const mins = Math.max(1e-6, (this.alive * SIM_DT) / 60);
    // hit rates by distance for single-projectile attacks (a spread or burst counts as a hit if any of it hits)
    const band = (a, b, multi) => { const f = this.fires.filter((x) => x.d >= a && x.d < b && !!x.multi === !!multi); return { n: f.length, hit: f.length ? f.filter((x) => x.hit).length / f.length : null }; };
    const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    return {
      aliveMin: +mins.toFixed(2), idle: this.alive ? this.idle / this.alive : 0, bush: this.alive ? this.bush / this.alive : 0,
      dirChangesPerMin: this.dirCh / mins, fires: this.fires.length, hitNear: band(0, 3), hitMid: band(3, 6), hitFar: band(6, 99),
      multiNear: band(0, 3, true), multiMid: band(3, 6, true), multiFar: band(6, 99, true),
      responseMedian: med(this.responses), superDelayMedian: med(this.supDelays), kills: this.kills, deaths: this.deaths,
    };
  }
}
