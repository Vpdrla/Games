// ---------- Enemies: spawning, behaviour, bosses, stage hazards and the wave director ----------
const Q4 = new Array(4096);

// Later stages start a little tougher and ramp up much faster.
function hpMult(run) {
  const T = run.T, sh = run.stage.hp;
  let m = 1 + (sh - 1) * 0.12 + (Math.min(T, 900) / 60) * 0.12 * sh;
  if (T > 900) m *= 1 + ((T - 900) / 60) * 0.3;
  if (run.mods.giant) m *= 2;
  if (run.mode === 'quick') m *= 0.75;
  return m;
}

function dmgMult(run) {
  const T = run.T, sd = run.stage.dmg;
  let m = 1 + (sd - 1) * 0.15 + (Math.min(T, 900) / 900) * 0.6 * sd;
  m *= 0.6 + 0.4 * Math.min(1, T / 180); // a gentler first few minutes
  if (T > 900) m *= 1 + ((T - 900) / 60) * 0.08;
  if (run.mods.greedy) m *= 1.2;
  if (run.mode === 'quick') m *= 0.8;
  return m;
}

function spawnEnemy(run, type, x, y, o) {
  const def = ENEMIES[type];
  const hp = def.hp * (def.ai === 'prop' ? 1 : hpMult(run));
  const spd = def.spd * (run.mods.quick ? 1.25 : 1);
  const e = {
    id: run.nextId++, type, def, look: type, x, y, r: def.r, hp, maxHp: hp, spd, dmg: def.dmg * dmgMult(run),
    ai: def.ai, fly: !!def.fly, ghost: def.ai === 'ghost', shield: !!def.shield, prop: def.ai === 'prop',
    kres: def.kres == null ? 1 : def.kres, mass: def.r * def.r,
    kx: 0, ky: 0, fx: x < run.player.x ? 1 : -1, t: run.rng.range(0, 10), st: 0, sT: def.every ? def.every * run.rng.range(0.3, 1) : 0,
    side: run.rng.chance(0.5) ? 1 : -1, flash: 0, slow: 0, slowT: 0, frozen: 0, tcd: 0, hc: [0, 0, 0, 0, 0, 0, 0, 0],
    spawnT: 0, elite: false, boss: false, dead: false, noReward: false, vx: 0, vy: 0, life: 0,
  };
  if (o) Object.assign(e, o);
  run.enemies.push(e);
  return e;
}

function makeElite(e) {
  e.elite = true;
  e.hp = e.maxHp = e.maxHp * 14;
  e.r = Math.round(e.r * 1.45);
  e.dmg *= 1.5;
  e.mass *= 4;
  e.kres *= 0.25;
  return e;
}

// A point just outside the visible area, biased toward where the player is heading.
function spawnPoint(run, out) {
  const p = run.player, hw = run.viewW / 2 + 34, hh = run.viewH / 2 + 34;
  let a;
  if (p.moving && run.rng.chance(0.45)) a = Math.atan2(p.dirY, p.dirX) + run.rng.range(-1, 1);
  else a = run.rng.range(0, TAU);
  const c = Math.cos(a), s = Math.sin(a);
  const t = Math.min(hw / Math.max(1e-6, Math.abs(c)), hh / Math.max(1e-6, Math.abs(s)));
  out.x = p.x + c * t;
  out.y = p.y + s * t;
  return out;
}
const SPT = { x: 0, y: 0 };

function enemyShoot(run, e, dx, dy) {
  const sh = SHOTS[e.def.shot];
  const base = Math.atan2(dy, dx);
  for (let i = 0; i < sh.n; i++) {
    const a = base + (i - (sh.n - 1) / 2) * sh.spread;
    run.eprojs.push({ k: e.def.shot, x: e.x, y: e.y - 4, vx: Math.cos(a) * sh.spd, vy: Math.sin(a) * sh.spd, r: sh.r, dmg: e.dmg * sh.dmg, life: 4, t: 0, slow: !!sh.slow, dead: false });
  }
  run.events.push(['eshot', e.def.shot]);
}

function updateEnemy(run, e, dt) {
  if (e.prop) {
    const p = run.player;
    if (Math.abs(p.x - e.x) > 1400 || Math.abs(p.y - e.y) > 1400) e.dead = true;
    return;
  }
  const p = run.player;
  e.t += dt;
  if (e.flash > 0) e.flash -= dt;
  if (e.tcd > 0) e.tcd -= dt;
  if (e.spawnT > 0) { e.spawnT -= dt; return; }
  let dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  let spd = e.spd;
  if (e.slowT > 0) { e.slowT -= dt; spd *= 1 - e.slow; if (e.slowT <= 0) e.slow = 0; }
  if (e.frozen > 0) { e.frozen -= dt; spd = 0; }
  if (e.boss) { bossUpdate(run, e, dt, d, dx, dy, spd); return; }
  let mx = dx, my = dy;
  switch (e.ai) {
    case 'bat': {
      const w = Math.sin(e.t * 4 + e.id) * 0.75, c = Math.cos(w), s = Math.sin(w);
      mx = dx * c - dy * s;
      my = dx * s + dy * c;
      break;
    }
    case 'ghost': {
      const w = Math.sin(e.t * 2 + e.id) * 0.35, c = Math.cos(w), s = Math.sin(w);
      mx = dx * c - dy * s;
      my = dx * s + dy * c;
      break;
    }
    case 'hop':
      spd *= Math.max(0, Math.sin(e.t * 5 + e.id)) * 2.1;
      break;
    case 'sweep':
      mx = e.vx;
      my = e.vy;
      e.life -= dt;
      if (e.life <= 0) { e.dead = true; return; }
      break;
    case 'ranged': {
      const R = e.def.range;
      if (d < R * 0.6) { mx = -dx; my = -dy; spd *= 0.8; } else if (d < R) { mx = -dy * e.side; my = dx * e.side; spd *= 0.4; }
      e.sT -= dt;
      if (e.sT <= 0 && d < R * 1.3 && e.frozen <= 0 && run.onScreen(e, -16)) { e.sT = e.def.every * run.rng.range(0.9, 1.2); enemyShoot(run, e, dx, dy); }
      break;
    }
    case 'charge':
      if (e.st === 0) {
        if (d < 170 && e.frozen <= 0) { e.st = 1; e.sT = 0.7; e.cx = dx; e.cy = dy; }
      } else if (e.st === 1) {
        spd = 0;
        e.sT -= dt;
        if (e.sT <= 0) { e.st = 2; e.sT = 0.55; run.events.push(['sfx', 'charge']); }
      } else if (e.st === 2) {
        mx = e.cx;
        my = e.cy;
        spd = e.spd * 5;
        e.sT -= dt;
        if (e.sT <= 0) { e.st = 3; e.sT = 0.8; }
      } else {
        spd *= 0.3;
        e.sT -= dt;
        if (e.sT <= 0) e.st = 0;
      }
      break;
    case 'bloat':
      if (e.st === 0 && d < 40) { e.st = 1; e.sT = 0.7; }
      if (e.st === 1) {
        spd *= 0.15;
        e.sT -= dt;
        if (e.sT <= 0) { run.kill(e); return; }
      }
      break;
    case 'summon':
      if (d < 150) { mx = -dx; my = -dy; spd *= 0.8; } else if (d < 210) spd = 0;
      e.sT -= dt;
      if (e.sT <= 0) {
        e.sT = 7;
        if (run.onScreen(e, 20)) {
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU + e.t;
            spawnEnemy(run, e.def.minion, e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, { spawnT: 0.6 });
          }
          run.events.push(['summon', e.x, e.y]);
        }
      }
      break;
    case 'blink':
      e.sT -= dt;
      if (e.sT <= 0) {
        e.sT = run.rng.range(3.5, 5);
        if (d > 150 && d < 420 && e.frozen <= 0) {
          const a = run.rng.range(0, TAU), ox = e.x, oy = e.y;
          e.x = p.x + Math.cos(a) * 120;
          e.y = p.y + Math.sin(a) * 120;
          e.spawnT = 0.5;
          run.events.push(['blink', ox, oy, e.x, e.y]);
          return;
        }
      }
      break;
  }
  const wf = e.fly ? 1.1 : 0.75;
  e.x += (mx * spd + e.kx + run.wind.x * wf) * dt;
  e.y += (my * spd + e.ky + run.wind.y * wf) * dt;
  const kd = Math.min(1, 9 * dt);
  e.kx -= e.kx * kd;
  e.ky -= e.ky * kd;
  if (e.ai === 'charge' && e.st === 2) e.fx = e.cx > 0 ? 1 : -1;
  else if (Math.abs(dx) > 0.15) e.fx = dx > 0 ? 1 : -1;
  // enemies left far behind come back in front of the player
  if (e.ai !== 'sweep' && (Math.abs(p.x - e.x) > run.viewW / 2 + 240 || Math.abs(p.y - e.y) > run.viewH / 2 + 240)) {
    spawnPoint(run, SPT);
    e.x = SPT.x;
    e.y = SPT.y;
  }
}

function onEnemyDeath(run, e) {
  const def = e.def;
  if (def.split) {
    for (let i = 0; i < 2; i++) {
      const s = spawnEnemy(run, def.split, e.x + (i ? 8 : -8), e.y, {});
      s.kx = (i ? 1 : -1) * 80;
      if (e.elite) makeElite(s);
    }
  }
  if (e.ai === 'bloat') run.booms.push({ x: e.x, y: e.y, r: e.elite ? 80 : 54, pdmg: e.dmg * 2, edmg: 30 * hpMult(run), col: '#d86ad0' });
  if (def.puddle) zone(run, { k: 'puddle', x: e.x, y: e.y, r: e.elite ? 36 : 22, life: 3, warn: 0, dmg: e.dmg * 0.6, cd: 0, fn: hazardFn });
}

// Explosions are resolved after the step so chains of exploding enemies never nest queries.
function processBooms(run) {
  let guard = 0;
  while (run.booms.length && guard++ < 40) {
    const b = run.booms.shift();
    const p = run.player;
    if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (b.r + p.r) ** 2) run.hurt(b.pdmg, 'boom');
    run.areaHit(b.x, b.y, b.r, b.edmg, null, 0, 1.5, Q4);
    run.events.push(['boom', b.x, b.y, b.r, b.col]);
  }
  run.booms.length = 0;
}

// Ground hazards that hurt the player (and sometimes enemies).
function hazardFn(run, z, dt) {
  if (z.cd > 0) z.cd -= dt;
  if (z.drift) {
    const p = run.player, dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1;
    z.x += (dx / d) * z.drift * dt;
    z.y += (dy / d) * z.drift * dt;
  }
  if (z.t < z.warn) return;
  const p = run.player;
  if ((p.x - z.x) ** 2 + (p.y - z.y) ** 2 < (z.r + p.r - 4) ** 2 && z.cd <= 0) {
    run.hurt(z.dmg, z.k);
    z.cd = 0.5;
  }
  if (z.edmg) run.areaHit(z.x, z.y, z.r, z.edmg, null, 0.5, 0, Q4);
}

// ----- bosses -----
function spawnBoss(run, key, final, loop) {
  const b = BOSSES[key];
  const bodyDef = ENEMIES[b.body];
  const baseR = bodyDef ? bodyDef.r : 14;
  const p = run.player;
  const x = p.x + run.rng.range(-60, 60), y = p.y - run.viewH / 2 - 40;
  let hp = b.hp * (0.6 + 0.02 * run.level) * (1 + (loop || 0) * 0.9);
  if (run.mode === 'quick') hp *= 0.7;
  if (run.mods.giant) hp *= 1.5;
  const e = spawnEnemy(run, bodyDef ? b.body : 'golem', x, y, {
    boss: true, bossKey: key, final: !!final, look: b.body, r: Math.min(44, Math.round(baseR * b.scale)), hp, maxHp: hp,
    spd: b.spd * (run.mods.quick ? 1.2 : 1), dmg: b.dmg * dmgMult(run) / run.stage.dmg * (0.7 + 0.3 * run.stage.dmg), mass: 1e6, kres: 0,
    ghost: !!b.ghost, shield: false, ai: 'boss', phase: 1, atkI: 0, sT: 2.2, act: null, aT: 0, aN: 0, spA: 0, def: bodyDef || ENEMIES.golem,
  });
  run.boss = e;
  run.events.push(['boss', key, !!final]);
  return e;
}

function bossShot(run, e, a, spd, big) {
  if (run.eprojs.length > 500) return;
  run.eprojs.push({ k: 'boss', x: e.x, y: e.y - e.r * 0.3, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: big ? 9 : 7, dmg: e.dmg * 0.65, life: 6, t: 0, dead: false, col: BOSSES[e.bossKey].tint || '#ff5a3a' });
}

function slamEnd(run, z) {
  const p = run.player;
  if ((p.x - z.x) ** 2 + (p.y - z.y) ** 2 < (z.r + p.r) ** 2) run.hurt(z.dmg, 'slam');
  run.events.push(['slam', z.x, z.y, z.r]);
}

function bossUpdate(run, e, dt, d, dx, dy, spd) {
  const p = run.player, B = BOSSES[e.bossKey];
  if (e.phase === 1 && e.hp < e.maxHp * 0.5) {
    e.phase = 2;
    e.spd *= 1.2;
    run.events.push(['enrage', e.x, e.y]);
  }
  const P2 = e.phase === 2;
  if (!e.act) {
    if (d > e.r + 20) {
      const fast = d > 240 ? 2.4 : 1; // bosses never fall far behind
      e.x += dx * spd * fast * dt;
      e.y += dy * spd * fast * dt;
    }
    if (Math.abs(dx) > 0.15) e.fx = dx > 0 ? 1 : -1;
    e.sT -= dt;
    if (e.sT <= 0 && e.frozen <= 0) {
      e.act = B.attacks[e.atkI++ % B.attacks.length];
      e.aT = 0;
      e.aN = 0;
    }
    return;
  }
  e.aT += dt;
  const done = () => { e.act = null; e.sT = P2 ? 1.3 : 2.1; };
  switch (e.act) {
    case 'slam': {
      const n = P2 ? 3 : 1;
      if (e.aN < n && e.aT >= e.aN * 0.5) {
        e.aN++;
        const r = 55 + e.r * 0.45;
        zone(run, { k: 'warn', x: p.x + p.mx * 30, y: p.y + p.my * 30, r, life: 1.0, dmg: e.dmg * 0.9, onEnd: slamEnd });
      }
      if (e.aT > n * 0.5 + 0.6) done();
      break;
    }
    case 'ring': {
      const n = P2 ? 2 : 1;
      if (e.aN < n && e.aT >= 0.35 + e.aN * 0.6) {
        e.aN++;
        const k = P2 ? 22 : 16, off = e.aN * 0.2;
        for (let i = 0; i < k; i++) bossShot(run, e, off + (i / k) * TAU, 115);
        run.events.push(['sfx', 'bossShot']);
      }
      if (e.aT > 0.35 + n * 0.6) done();
      break;
    }
    case 'spiral': {
      const len = 2.2;
      e.spT = (e.spT || 0) - dt;
      if (e.spT <= 0 && e.aT < len) {
        e.spT = 0.09;
        e.spA += 0.33;
        const arms = P2 ? 3 : 2;
        for (let i = 0; i < arms; i++) bossShot(run, e, e.spA + (i / arms) * TAU, 105);
      }
      if (e.aT > len + 0.3) done();
      break;
    }
    case 'volley': {
      if (e.aN < 3 && e.aT >= 0.3 + e.aN * 0.45) {
        e.aN++;
        const base = Math.atan2(p.y - e.y, p.x - e.x), k = P2 ? 7 : 5;
        for (let i = 0; i < k; i++) bossShot(run, e, base + (i - (k - 1) / 2) * 0.2, 150, true);
        run.events.push(['sfx', 'bossShot']);
      }
      if (e.aT > 1.8) done();
      break;
    }
    case 'dash': {
      const n = P2 ? 2 : 1;
      const cyc = 1.3, k = Math.floor(e.aT / cyc), u = e.aT - k * cyc;
      if (k >= n) { done(); break; }
      if (e.aN <= k) {
        e.aN = k + 1;
        e.cx = dx;
        e.cy = dy;
        zone(run, { k: 'warnLine', x: e.x, y: e.y, ang: Math.atan2(dy, dx), len: 300, w: e.r * 1.6, life: 0.65 });
      }
      if (u > 0.65 && u < 1.2) {
        e.x += e.cx * 440 * dt;
        e.y += e.cy * 440 * dt;
        e.fx = e.cx > 0 ? 1 : -1;
      }
      break;
    }
    case 'summon': {
      if (e.aN === 0 && e.aT > 0.4) {
        e.aN = 1;
        let alive = 0;
        for (const o of run.enemies) if (!o.dead && !o.prop) alive++;
        const k = Math.min(P2 ? 9 : 6, ENEMY_CAP - alive);
        for (let i = 0; i < k; i++) {
          const a = (i / k) * TAU;
          spawnEnemy(run, B.minion, e.x + Math.cos(a) * (e.r + 26), e.y + Math.sin(a) * (e.r + 26), { spawnT: 0.6 });
        }
        run.events.push(['summon', e.x, e.y]);
      }
      if (e.aT > 1.1) done();
      break;
    }
    case 'blink': {
      if (e.aN === 0 && e.aT > 0.45) {
        e.aN = 1;
        const a = run.rng.range(0, TAU), ox = e.x, oy = e.y;
        e.x = p.x + Math.cos(a) * 160;
        e.y = p.y + Math.sin(a) * 160;
        run.events.push(['blink', ox, oy, e.x, e.y]);
      }
      if (e.aN === 1 && e.aT > 0.75) {
        e.aN = 2;
        const k = P2 ? 12 : 8;
        for (let i = 0; i < k; i++) bossShot(run, e, (i / k) * TAU, 130);
      }
      if (e.aT > 1.2) done();
      break;
    }
    default:
      done();
  }
}

// ----- the wave director -----
class Director {
  constructor(run) {
    this.run = run;
    this.acc = 0;
    this.nextElite = 50;
    this.nextSwarm = 75;
    this.nextRing = 140;
    this.nextProp = 8;
    this.nextHazard = 30;
    this.hazardOn = 0;
    this.loop = 0;
    const st = run.stage;
    this.bossQ = [
      { t: 300, k: st.minis[0] },
      { t: 600, k: st.minis[1] },
      { t: 900, k: st.boss, final: true },
    ];
  }

  pick(minute) {
    const pool = this.run.stage.pools[Math.min(minute, this.run.stage.pools.length - 1)];
    return this.run.rng.weighted(pool);
  }

  update(dt) {
    const run = this.run, T = run.T, M = run.mods;
    const minute = Math.floor(T / 60);
    const tm = Math.min(T, 960) / 60;
    let rate = 1.1 + (0.42 * tm + 0.035 * tm * tm) * run.stage.rate;
    let cap = Math.min(ENEMY_CAP, 30 + 24 * tm + 0.6 * tm * tm);
    if (M.swarm) { rate *= 1.6; cap = Math.min(ENEMY_CAP, cap * 1.4); }
    if (run.boss && run.boss.final) rate *= 0.5;
    let alive = 0, props = 0;
    for (const e of run.enemies) { if (e.prop) props++; else if (!e.dead) alive++; }
    run.alive = alive;
    this.acc += rate * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (alive >= cap) { this.acc = 0; break; }
      spawnPoint(run, SPT);
      spawnEnemy(run, this.pick(minute), SPT.x, SPT.y);
      alive++;
    }
    if (T >= this.nextElite) {
      this.nextElite += M.bounty ? 30 : 60;
      let type = this.pick(minute);
      for (let i = 0; i < 4 && (type === 'bat' || type === 'wisp' || type === 'slimelet'); i++) type = this.pick(minute);
      spawnPoint(run, SPT);
      makeElite(spawnEnemy(run, type, SPT.x, SPT.y));
      run.events.push(['elite']);
    }
    if (T >= this.nextSwarm) { this.nextSwarm += 120; this.swarm(minute); }
    if (T >= this.nextRing) { this.nextRing += 120; this.ring(minute); }
    if (run.time >= this.nextProp) {
      this.nextProp = run.time + 18;
      if (props < 3) {
        const p = run.player, hw = run.viewW / 2, hh = run.viewH / 2;
        const side = run.rng.chance(0.5) ? 1 : -1;
        spawnEnemy(run, 'brazier', p.x + run.rng.range(-hw * 0.8, hw * 0.8), p.y + side * run.rng.range(hh * 0.45, hh * 0.85));
      }
    }
    const b = this.bossQ[0];
    if (b) {
      if (T >= b.t - 4 && !b.warned) { b.warned = true; run.events.push(['bossWarn', b.k, !!b.final]); }
      if (T >= b.t) { this.bossQ.shift(); spawnBoss(run, b.k, b.final, b.loop || 0); }
    } else if (run.endless) {
      this.loop++;
      const st = run.stage, keys = [st.minis[0], st.minis[1], st.boss];
      const k = keys[this.loop % 3];
      this.bossQ.push({ t: 900 + this.loop * 180, k, final: k === st.boss, loop: Math.ceil(this.loop / 3) });
    }
    this.hazard(dt);
  }

  swarm(minute) {
    const run = this.run, p = run.player, type = run.stage.swarm;
    const n = Math.min(40, 10 + minute * 3);
    const horiz = run.rng.chance(0.6), dir = run.rng.chance(0.5) ? 1 : -1;
    const hw = run.viewW / 2 + 50, hh = run.viewH / 2 + 50;
    for (let i = 0; i < n; i++) {
      const off = (i - n / 2) * 11 + run.rng.range(-6, 6), lag = run.rng.range(0, 60);
      const x = horiz ? p.x - dir * (hw + lag) : p.x + off;
      const y = horiz ? p.y + off : p.y - dir * (hh + lag);
      const e = spawnEnemy(run, type, x, y, { ai: 'sweep', vx: horiz ? dir : 0, vy: horiz ? 0 : dir, spd: 125, life: 14, ghost: true });
      e.dmg *= 0.6;
    }
    run.events.push(['swarm']);
  }

  ring(minute) {
    const run = this.run, p = run.player, type = run.stage.ring;
    const n = Math.min(40, 22 + minute);
    const R = Math.min(run.viewW, run.viewH) * 0.5 + 90;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      spawnEnemy(run, type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, { spawnT: 0.6 });
    }
    run.events.push(['ring']);
  }

  hazard(dt) {
    const run = this.run, hz = run.stage.hazard;
    if (!hz) return;
    if (this.hazardOn > 0) {
      this.hazardOn -= dt;
      if (this.hazardOn <= 0) { run.wind.x = run.wind.y = 0; run.events.push(['blizzard', 0]); }
    }
    if (run.time < this.nextHazard) return;
    const p = run.player, dm = dmgMult(run) / run.stage.dmg;
    if (hz === 'vents') {
      this.nextHazard = run.time + run.rng.range(13, 19);
      const n = run.rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const a = run.rng.range(0, TAU), d = i === 0 ? 0 : run.rng.range(60, 170);
        zone(run, { k: 'vent', x: p.x + p.mx * 50 + Math.cos(a) * d, y: p.y + p.my * 50 + Math.sin(a) * d, r: 34, life: 3.6, warn: 1.2, dmg: 10 * dm, edmg: 25 * hpMult(run) / run.stage.hp, cd: 0, fn: hazardFn });
      }
      run.events.push(['vents']);
    } else if (hz === 'blizzard') {
      this.nextHazard = run.time + run.rng.range(55, 75);
      this.hazardOn = 9;
      const a = run.rng.range(0, TAU);
      run.wind.x = Math.cos(a) * 46;
      run.wind.y = Math.sin(a) * 46;
      run.events.push(['blizzard', 1]);
    } else if (hz === 'rifts') {
      this.nextHazard = run.time + run.rng.range(26, 36);
      for (let i = 0; i < 2; i++) {
        const a = run.rng.range(0, TAU), d = 230;
        zone(run, { k: 'rift', x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: 26, life: 10, warn: 0.6, dmg: 9 * dm, cd: 0, drift: 26, fn: hazardFn });
      }
      run.events.push(['rifts']);
    }
  }
}
