// ---------- Weapons: how each one fires, its projectiles and ground effects ----------
const TGT = [];

function proj(run, w, o) {
  const p = {
    k: 'bolt', x: 0, y: 0, vx: 0, vy: 0, r: 5, dmg: w.st.dmg, pierce: w.st.pierce || 1, life: 1, t: 0, w,
    knock: w.st.knock, hits: null, hm: null, rehit: 0, fn: null, onHit: null, onEnd: null, dead: false, ang: 0, noHit: false,
  };
  Object.assign(p, o);
  if (p.rehit > 0) p.hm = new Map();
  else p.hits = [];
  run.projs.push(p);
  return p;
}

function zone(run, o) {
  const z = { k: 'pool', x: 0, y: 0, r: 30, life: 1, t: 0, dead: false, fn: null, w: null };
  Object.assign(z, o);
  run.zones.push(z);
  return z;
}

function sfx(run, name) { run.events.push(['sfx', name]); }

// Cooldown helper: returns true when the weapon should fire now.
function ready(w, dt) {
  w.t -= dt;
  if (w.t > 0) return false;
  w.t = Math.max(0.05, w.t + w.st.cd);
  return true;
}

function ellipseHit(run, cx, cy, rx, ry, w, dirx) {
  const n = run.grid.query(cx, cy, Math.max(rx, ry) + 30, Q2);
  const st = w.st;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const e = Q2[i];
    if (e.dead || e.spawnT > 0) continue;
    const dx = (e.x - cx) / (rx + e.r), dy = (e.y - cy) / (ry + e.r);
    if (dx * dx + dy * dy > 1) continue;
    run.hit(e, st.dmg, w, dirx, 0, st.knock);
    hits++;
  }
  return hits;
}

function segmentHit(run, x0, y0, x1, y1, width, w, interval) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, L = Math.hypot(x1 - x0, y1 - y0) || 1;
  const n = run.grid.query(mx, my, L / 2 + 30, Q2);
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L, st = w.st;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const e = Q2[i];
    if (e.dead || e.spawnT > 0) continue;
    const ex = e.x - x0, ey = e.y - y0;
    const along = ex * ux + ey * uy;
    if (along < -e.r || along > L + e.r) continue;
    const perp = Math.abs(ex * uy - ey * ux);
    if (perp > width + e.r) continue;
    if (e.hc[w.slot] > run.time) continue;
    e.hc[w.slot] = run.time + interval;
    run.hit(e, st.dmg, w, -uy, ux, st.knock);
    hits++;
  }
  return hits;
}

function aimAt(run, maxR) {
  const p = run.player, e = run.nearest(p.x, p.y, maxR || 400);
  if (e) return Math.atan2(e.y - p.y, e.x - p.x);
  return Math.atan2(p.dirY, p.dirX);
}

// ----- individual weapons -----
function fireBolt(run, w, a, spd, r, life) {
  const p = run.player;
  proj(run, w, { k: w.key === 'storm' ? 'storm' : 'bolt', x: p.x, y: p.y - 4, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r, life, pierce: w.st.pierce, ang: a });
}

function slashAt(run, w, side, yoff, big) {
  const p = run.player, st = w.st;
  const rx = 58 * st.area, ry = 22 * st.area * (big ? 1.25 : 1);
  const cx = p.x + side * rx * 0.85, cy = p.y + yoff;
  ellipseHit(run, cx, cy, rx, ry, w, side);
  zone(run, { k: 'slash', x: cx, y: cy, ox: side * rx * 0.85, oy: yoff, rx, ry, side, life: 0.22, big: !!big, col: WEAPONS[w.key].col, fn: followPlayer });
}

function followPlayer(run, z) {
  z.x = run.player.x + z.ox;
  z.y = run.player.y + z.oy;
}

function boomerangFn(run, p, dt) {
  if (!p.back) {
    p.spd -= 600 * dt;
    if (p.spd <= 0) { p.back = true; p.spd = 0; p.hm.clear(); }
    p.vx = p.dx * p.spd;
    p.vy = p.dy * p.spd;
  } else {
    const pl = run.player, dx = pl.x - p.x, dy = pl.y - p.y, d = Math.hypot(dx, dy) || 1;
    p.spd = Math.min(p.maxSpd, p.spd + 800 * dt);
    p.vx = (dx / d) * p.spd;
    p.vy = (dy / d) * p.spd;
    if (d < 16) p.dead = true;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.ang += 16 * dt;
}

function throwBoomerang(run, w, a) {
  const st = w.st, p = run.player, big = w.key === 'moons';
  const spd = 340 * st.speed * (big ? 1.1 : 1);
  proj(run, w, {
    k: big ? 'moon' : 'boom', x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a), spd, maxSpd: spd * 1.3,
    r: 9 * st.area, life: 5, pierce: 999, rehit: 0.5, back: false, fn: boomerangFn,
  });
}

function zapChain(run, w, first, strikes) {
  const st = w.st, hitIds = [first.id];
  const pts = [first.x + run.rng.range(-30, 30), first.y - 260, first.x, first.y];
  let cur = first, dmg = st.dmg;
  const boom = w.key === 'tempest';
  run.hit(first, dmg, w, 0, 0, st.knock);
  if (boom) run.areaHit(first.x, first.y, 40 * st.area, dmg * 0.5, w, 0, 0.5, Q3);
  for (let c = 0; c < st.chain; c++) {
    const n = run.grid.query(cur.x, cur.y, 95 * st.area, Q3);
    let best = null, bd = 1e9;
    for (let i = 0; i < n; i++) {
      const e = Q3[i];
      if (!run.isTarget(e) || hitIds.indexOf(e.id) >= 0) continue;
      const d = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
      if (d < bd && d < (95 * st.area) ** 2) { bd = d; best = e; }
    }
    if (!best) break;
    hitIds.push(best.id);
    pts.push(best.x, best.y);
    dmg *= 0.85;
    run.hit(best, dmg, w, 0, 0, st.knock);
    if (boom) run.areaHit(best.x, best.y, 32 * st.area, dmg * 0.4, w, 0, 0.5, Q3);
    cur = best;
  }
  run.events.push(['zap', pts, boom]);
  strikes.n++;
}

function poolFn(run, z, dt) {
  if (z.creep) {
    const e = run.nearest(z.x, z.y, 220);
    if (e) {
      const dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy) || 1;
      z.x += (dx / d) * 34 * dt;
      z.y += (dy / d) * 34 * dt;
    }
  }
  run.areaHit(z.x, z.y, z.r, z.w.st.dmg, z.w, z.w.st.interval, 0, Q1);
}

function flaskLand(run, p) {
  const st = p.w.st, inferno = p.w.key === 'inferno';
  zone(run, { k: 'pool', x: p.tx, y: p.ty, r: 34 * st.area, life: 2.4 * st.dur, w: p.w, fn: poolFn, creep: inferno, inferno });
  sfx(run, 'flask');
}

function flaskFn(run, p) {
  const u = Math.min(1, p.t / p.life);
  p.x = p.sx + (p.tx - p.sx) * u;
  p.y = p.sy + (p.ty - p.sy) * u - Math.sin(u * Math.PI) * 60;
  p.ang += 0.3;
}

function novaFn(run, z) {
  const u = Math.min(1, z.t / 0.45);
  z.cur = z.r * easeOut(u);
  if (u >= 1) return;
  const zero = z.w.key === 'zero', st = z.w.st;
  run.areaHit(z.x, z.y, z.cur, st.dmg, z.w, 0.6, st.knock, Q1, (e) => {
    if (zero && !e.boss) { e.frozen = Math.max(e.frozen, 2 * st.dur); }
    e.slow = Math.max(e.slow, e.boss ? 0.3 : 0.45);
    e.slowT = Math.max(e.slowT, 1.6 * st.dur);
  });
}

function orbFn(run, p, dt) {
  const pl = run.player, hw = run.viewW / 2 - 6, hh = run.viewH / 2 - 6;
  if (p.seek) {
    p.st -= dt;
    if (p.st <= 0) {
      p.st = 0.25;
      const e = run.nearest(p.x, p.y, 200);
      if (e) {
        const sp = Math.hypot(p.vx, p.vy), a0 = Math.atan2(p.vy, p.vx), a1 = Math.atan2(e.y - p.y, e.x - p.x);
        let da = a1 - a0;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const a = a0 + clamp(da, -0.5, 0.5);
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp;
      }
    }
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.x > pl.x + hw) { p.x = pl.x + hw; p.vx = -Math.abs(p.vx); p.bounce = 0.15; }
  if (p.x < pl.x - hw) { p.x = pl.x - hw; p.vx = Math.abs(p.vx); p.bounce = 0.15; }
  if (p.y > pl.y + hh) { p.y = pl.y + hh; p.vy = -Math.abs(p.vy); p.bounce = 0.15; }
  if (p.y < pl.y - hh) { p.y = pl.y - hh; p.vy = Math.abs(p.vy); p.bounce = 0.15; }
  if (p.bounce > 0) p.bounce -= dt;
}

function missileFn(run, p, dt) {
  if (!p.tgt || p.tgt.dead) {
    p.rt -= dt;
    if (p.rt <= 0) { p.rt = 0.15; p.tgt = run.nearest(p.x, p.y, 320); }
  }
  if (p.tgt && !p.tgt.dead) {
    const a0 = Math.atan2(p.vy, p.vx), a1 = Math.atan2(p.tgt.y - p.y, p.tgt.x - p.x);
    let da = a1 - a0;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    const a = a0 + clamp(da, -7 * dt, 7 * dt);
    p.vx = Math.cos(a) * p.spd;
    p.vy = Math.sin(a) * p.spd;
  }
  p.spd = Math.min(p.spd + 300 * dt, p.maxSpd);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.ang = Math.atan2(p.vy, p.vx);
}

function missileHit(run, p) {
  const st = p.w.st;
  run.areaHit(p.x, p.y, 26 * st.area, st.dmg, p.w, 0, st.knock, Q2);
  run.events.push(['boom', p.x, p.y, 26 * st.area, '#8affc1']);
}

function runeFn(run, z, dt) {
  if (z.cool > 0) { z.cool -= dt; return; }
  const n = run.grid.query(z.x, z.y, 40, Q1);
  for (let i = 0; i < n; i++) {
    const e = Q1[i];
    if (!run.isTarget(e)) continue;
    const dx = e.x - z.x, dy = e.y - z.y, rr = 12 + e.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    const st = z.w.st;
    run.areaHit(z.x, z.y, 30 * st.area, st.dmg, z.w, 0, st.knock, Q2);
    run.events.push(['spike', z.x, z.y, 30 * st.area, z.glyph]);
    if (z.glyph) z.cool = 0.8;
    else z.dead = true;
    return;
  }
}

const WEAPON_IMPL = {
  bolt(run, w, dt) {
    const s = w.s;
    if (s.burst > 0) {
      s.bt -= dt;
      if (s.bt <= 0) {
        s.bt = 0.07;
        const tg = s.tg[(s.i++) % s.tg.length];
        const p = run.player;
        const a = tg && !tg.dead ? Math.atan2(tg.y - p.y, tg.x - p.x) : s.a;
        s.a = a;
        fireBolt(run, w, a + run.rng.range(-0.04, 0.04), 300 * w.st.speed, 5 * w.st.area, 1.6 * w.st.dur);
        s.burst--;
        sfx(run, 'bolt');
      }
      return;
    }
    w.t -= dt;
    if (w.t > 0) return;
    const p = run.player;
    const tg = run.nearestList(p.x, p.y, 420, w.st.amount, TGT);
    if (!tg.length) { w.t = 0.1; return; }
    w.t = w.st.cd;
    s.tg = tg.slice();
    s.i = 0;
    s.a = 0;
    s.burst = w.st.amount;
    s.bt = 0;
  },

  storm(run, w, dt) {
    if (!ready(w, dt)) return;
    const p = run.player;
    const tg = run.nearestList(p.x, p.y, 420, 6, TGT);
    if (!tg.length) { w.t = 0.1; return; }
    for (let i = 0; i < w.st.amount; i++) {
      const e = tg[run.rng.int(0, tg.length - 1)];
      fireBolt(run, w, Math.atan2(e.y - p.y, e.x - p.x) + run.rng.range(-0.08, 0.08), 380 * w.st.speed, 6 * w.st.area, 1.4 * w.st.dur);
    }
    sfx(run, 'bolt');
  },

  slash(run, w, dt) {
    const s = w.s;
    if (s.q && s.q.length) {
      s.qt -= dt;
      if (s.qt <= 0) {
        const side = s.q.shift();
        const yoff = s.n < 2 ? 0 : Math.floor(s.n / 2) % 2 ? -24 : 24;
        slashAt(run, w, side, yoff, w.key === 'dawn');
        s.n++;
        s.qt = 0.12;
        sfx(run, 'slash');
      }
    }
    if (!ready(w, dt)) return;
    const f = run.player.fx;
    s.q = [];
    for (let i = 0; i < w.st.amount; i++) s.q.push(i % 2 ? -f : f);
    s.qt = 0;
    s.n = 0;
  },

  dawn(run, w, dt) {
    WEAPON_IMPL.slash(run, w, dt);
    if (w.s.n === 1 && !w.s.launched) {
      w.s.launched = true;
      const p = run.player, st = w.st;
      for (const side of [-1, 1]) {
        proj(run, w, { k: 'crescent', x: p.x + side * 20, y: p.y, vx: side * 300 * st.speed, vy: 0, r: 18 * st.area, life: 1.1 * st.dur, pierce: 999, rehit: 99, ang: side });
      }
    }
    if (w.s.n === 0) w.s.launched = false;
  },

  blades(run, w, dt) {
    const s = w.s, st = w.st, p = run.player;
    const always = w.key === 'halo';
    if (s.ang == null) { s.ang = 0; s.on = false; s.tt = 0.3; }
    if (!always) {
      s.tt -= dt;
      if (s.tt <= 0) {
        s.on = !s.on;
        s.tt = s.on ? 3 * st.dur : st.cd;
        if (s.on) sfx(run, 'blades');
      }
    } else s.on = true;
    if (!s.on) return;
    s.n = st.amount;
    s.rad = 62 * st.area;
    s.size = 9 * st.area;
    s.ang += 3.4 * st.speed * dt;
    for (let i = 0; i < s.n; i++) {
      const a = s.ang + (i * TAU) / s.n;
      run.areaHit(p.x + Math.cos(a) * s.rad, p.y + Math.sin(a) * s.rad, s.size, st.dmg, w, st.interval, st.knock, Q1);
    }
  },
  halo(run, w, dt) { WEAPON_IMPL.blades(run, w, dt); },

  aura(run, w, dt) {
    const s = w.s, st = w.st, p = run.player, sanct = w.key === 'sanctum';
    s.r = 44 * st.area;
    s.pulse = Math.max(0, (s.pulse || 0) - dt * 3);
    if (!ready(w, dt)) return;
    s.pulse = 1;
    const hits = run.areaHit(p.x, p.y, s.r, st.dmg, w, 0, st.knock, Q1, sanct ? (e) => { e.slow = Math.max(e.slow, 0.4); e.slowT = Math.max(e.slowT, 0.8); } : null);
    if (sanct && hits > 0) run.heal(Math.min(2, 0.4 + hits * 0.05));
  },
  sanctum(run, w, dt) { WEAPON_IMPL.aura(run, w, dt); },

  boomerang(run, w, dt) {
    const s = w.s;
    if (s.burst > 0) {
      s.bt -= dt;
      if (s.bt <= 0) {
        s.bt = 0.12;
        s.burst--;
        throwBoomerang(run, w, aimAt(run, 360) + run.rng.range(-0.1, 0.1));
        sfx(run, 'throw');
      }
      return;
    }
    if (!ready(w, dt)) return;
    s.burst = w.st.amount;
    s.bt = 0;
  },

  moons(run, w, dt) {
    if (!ready(w, dt)) return;
    const a = aimAt(run, 360), n = w.st.amount;
    for (let i = 0; i < n; i++) throwBoomerang(run, w, a + (i * TAU) / n);
    sfx(run, 'throw');
  },

  lightning(run, w, dt) {
    if (!ready(w, dt)) return;
    const strikes = { n: 0 };
    for (let i = 0; i < w.st.amount; i++) {
      const e = run.randomOnScreen();
      if (e) zapChain(run, w, e, strikes);
    }
    if (!strikes.n) w.t = 0.15;
    else sfx(run, 'zap');
  },
  tempest(run, w, dt) { WEAPON_IMPL.lightning(run, w, dt); },

  flask(run, w, dt) {
    if (!ready(w, dt)) return;
    const p = run.player, st = w.st;
    for (let i = 0; i < st.amount; i++) {
      const e = run.randomOnScreen();
      let tx, ty;
      if (e) { tx = e.x + run.rng.range(-12, 12); ty = e.y + run.rng.range(-12, 12); }
      else { const a = run.rng.range(0, TAU), d = run.rng.range(40, 140); tx = p.x + Math.cos(a) * d; ty = p.y + Math.sin(a) * d; }
      proj(run, w, { k: 'flask', x: p.x, y: p.y, sx: p.x, sy: p.y, tx, ty, life: 0.45 + i * 0.06, noHit: true, fn: flaskFn, onEnd: flaskLand });
    }
    sfx(run, 'throw');
  },
  inferno(run, w, dt) { WEAPON_IMPL.flask(run, w, dt); },

  frost(run, w, dt) {
    if (!ready(w, dt)) return;
    const p = run.player;
    zone(run, { k: 'nova', x: p.x, y: p.y, r: 120 * w.st.area, cur: 0, life: 0.6, w, fn: novaFn, zero: w.key === 'zero' });
    sfx(run, 'frost');
  },
  zero(run, w, dt) { WEAPON_IMPL.frost(run, w, dt); },

  orb(run, w, dt) {
    if (!ready(w, dt)) return;
    const p = run.player, st = w.st, prism = w.key === 'prism';
    const base = aimAt(run, 400);
    for (let i = 0; i < st.amount; i++) {
      const a = base + (i * TAU) / st.amount + run.rng.range(-0.3, 0.3), spd = 250 * st.speed;
      proj(run, w, { k: prism ? 'prism' : 'orb', x: p.x, y: p.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 9 * st.area, life: 2.8 * st.dur, pierce: 999, rehit: 0.45, fn: orbFn, seek: prism, st: 0, bounce: 0 });
    }
    sfx(run, 'orb');
  },
  prism(run, w, dt) { WEAPON_IMPL.orb(run, w, dt); },

  beam(run, w, dt) {
    const s = w.s, st = w.st, p = run.player, solar = w.key === 'solar';
    if (s.ang == null) { s.ang = 0; s.on = false; s.tt = 0.5; }
    if (!solar) {
      s.tt -= dt;
      if (s.tt <= 0) {
        s.on = !s.on;
        s.tt = s.on ? 1.6 * st.dur : st.cd;
        if (s.on) sfx(run, 'beam');
      }
    } else s.on = true;
    if (!s.on) return;
    s.n = Math.max(1, st.amount);
    s.len = 150 * st.area;
    s.width = 9 * st.area;
    s.ang += 3.6 * st.speed * dt;
    let hits = 0;
    for (let i = 0; i < s.n; i++) {
      const a = s.ang + (i * TAU) / s.n;
      hits += segmentHit(run, p.x, p.y, p.x + Math.cos(a) * s.len, p.y + Math.sin(a) * s.len, s.width, w, st.interval);
    }
    if (solar && hits > 0) run.heal(Math.min(0.5, hits * 0.08));
  },
  solar(run, w, dt) { WEAPON_IMPL.beam(run, w, dt); },

  drones(run, w, dt) {
    const s = w.s, st = w.st, p = run.player, hive = w.key === 'hive';
    if (!s.d) { s.d = []; s.a = 0; }
    while (s.d.length < st.amount) s.d.push({ x: p.x, y: p.y, t: 0.3 + s.d.length * 0.25 });
    s.a += 1.3 * dt;
    const n = s.d.length;
    for (let i = 0; i < n; i++) {
      const d = s.d[i];
      const a = s.a + (i * TAU) / n, rad = 34 + (n > 3 ? 10 : 0);
      const tx = p.x + Math.cos(a) * rad, ty = p.y - 10 + Math.sin(a) * rad * 0.6;
      d.x += (tx - d.x) * Math.min(1, 8 * dt);
      d.y += (ty - d.y) * Math.min(1, 8 * dt);
      d.t -= dt;
      if (d.t <= 0) {
        const e = run.nearest(d.x, d.y, 320);
        if (!e) { d.t = 0.2; continue; }
        d.t = st.cd;
        const ang = Math.atan2(e.y - d.y, e.x - d.x) + run.rng.range(-0.6, 0.6), spd = 140 * st.speed;
        proj(run, w, { k: 'missile', x: d.x, y: d.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, spd, maxSpd: 300 * st.speed, r: 5, life: 2.6, pierce: 1, tgt: e, rt: 0, fn: missileFn, onHit: missileHit, ang });
        sfx(run, 'missile');
      }
      if (hive && (run.stepN + i) % 4 === 0) {
        for (const g of run.drops) {
          if (g.mag || g.k !== 'gem') continue;
          const dx = g.x - d.x, dy = g.y - d.y;
          if (dx * dx + dy * dy < 50 * 50) { g.mag = true; g.sp = 120; }
        }
      }
    }
  },
  hive(run, w, dt) { WEAPON_IMPL.drones(run, w, dt); },

  runes(run, w, dt) {
    if (!ready(w, dt)) return;
    const p = run.player, st = w.st, glyph = w.key === 'glyph';
    let active = 0;
    for (const z of run.zones) if (z.k === 'rune' && z.w === w && !z.dead) active++;
    const max = (glyph ? 8 : 4) + 2 * st.amount;
    for (let i = 0; i < st.amount && active < max; i++, active++) {
      const e = run.randomOnScreen();
      let x, y;
      if (e && Math.hypot(e.x - p.x, e.y - p.y) < 220) { x = e.x + run.rng.range(-26, 26); y = e.y + run.rng.range(-26, 26); }
      else { const a = run.rng.range(0, TAU), d = run.rng.range(30, 130); x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d; }
      zone(run, { k: 'rune', x, y, r: 14, life: 8 * st.dur, w, fn: runeFn, cool: 0.25, glyph });
    }
  },
  glyph(run, w, dt) { WEAPON_IMPL.runes(run, w, dt); },
};

function updateWeapon(run, w, dt) {
  const fn = WEAPON_IMPL[w.key];
  if (fn) fn(run, w, dt);
}
