// ---------- Monster and boss behaviour ----------
// Every dangerous attack is announced with a telegraph (a red area that fills up) so players and
// bots can step out of it.

function mobPickTarget(w, u, dt) {
  const ai = u.ai;
  if (u.st.taunt > 0 && u.st.tauntSrc && alive(u.st.tauntSrc)) return (ai.tgt = u.st.tauntSrc);
  ai.retarget -= dt;
  const t = ai.tgt;
  if (!t || !alive(t) || t.untargetable || (t.kind === 'hero' && t.st.invis > 0) || ai.retarget <= 0) {
    let best = null, bs = 1e18;
    for (const o of w.units) {
      if (o.team === u.team || !alive(o) || o.untargetable) continue;
      if (o.kind === 'hero' && o.st.invis > 0) continue;
      let s = dist2(u.x, u.y, o.x, o.y);
      if (o.kind === 'summon') s *= 1.6;
      if (s < bs) { bs = s; best = o; }
    }
    ai.tgt = best;
    ai.retarget = 0.8 + w.rand() * 0.8;
  }
  return ai.tgt;
}

// Walk towards (or away from) a point, sliding around obstacles.
function mobSteer(w, u, tx, ty, dir, mul) {
  let a = angTo(u.x, u.y, tx, ty);
  if (dir < 0) a += Math.PI;
  if (!u.flyer && w.room) {
    const ax = u.x + Math.cos(a) * 70, ay = u.y + Math.sin(a) * 70;
    for (const o of w.room.obst) {
      const rr = o.r + u.r + 4;
      if (dist2(o.x, o.y, u.x, u.y) > (rr + 90) * (rr + 90)) continue;
      if (segDist2(o.x, o.y, u.x, u.y, ax, ay) < rr * rr) {
        const cross = Math.cos(a) * (o.y - u.y) - Math.sin(a) * (o.x - u.x);
        a += cross > 0 ? -1.1 : 1.1;
        break;
      }
    }
  }
  u.mx = Math.cos(a) * (mul == null ? 1 : mul);
  u.my = Math.sin(a) * (mul == null ? 1 : mul);
}

function clearShot(w, x0, y0, x1, y1) {
  if (!w.room) return true;
  for (const o of w.room.obst) if (segDist2(o.x, o.y, x0, y0, x1, y1) < (o.r + 4) * (o.r + 4)) return false;
  return true;
}

function mobShot(w, u, ang, s) {
  const n = s.n || 1;
  for (let i = 0; i < n; i++) {
    const a = ang + (n > 1 ? (i - (n - 1) / 2) * (s.spread || 0.2) : 0);
    w.shoot(u, { x: u.x + Math.cos(a) * u.r, y: u.y + Math.sin(a) * u.r, ang: a, spd: s.spd, r: s.r, dmg: u.mob ? u.mob.dmg : s.dmg, range: s.range || 760, kind: s.kind, color: s.color, homing: s.homing,
      onHit: s.slow ? (w2, p, t) => w2.slow(t, 0.35, 1.5) : null, o: { kind: 'mob' } });
  }
}

function heroesOf(w, team) { return w.units.filter((h) => h.kind === 'hero' && h.team !== team && alive(h)); }

function mobTick(w, u, dt) {
  const d = u.mob, ai = u.ai;
  u.mx = u.my = 0;
  u.spdMul = 1;
  if (u.elite === 'frozen' && w.tick % 18 === 0) for (const h of w.foesIn(u.team, u.x, u.y, 130)) w.slow(h, 0.35, 0.5);
  if (w.cantAct(u)) { if (ai.state !== 'move') { ai.state = 'move'; ai.cd = Math.max(ai.cd, 0.4); } return; }
  if (u.dash) return;
  ai.cd -= dt * (u.elite === 'swift' ? 1.35 : 1);
  ai.t -= dt;
  const t = mobPickTarget(w, u, dt);
  if (!t) { ai.wob += dt; u.mx = Math.cos(ai.wob) * 0.3; u.my = Math.sin(ai.wob) * 0.3; return; }
  const dd = dist(u.x, u.y, t.x, t.y);
  const face = angTo(u.x, u.y, t.x, t.y);
  if (ai.state === 'move') u.ang = face;
  const mult = u.mult.dmg;
  const keep = d.keep || 0;
  const strafe = () => {
    if (w.rand() < dt * 0.4) ai.strafe = -ai.strafe;
    const a = face + Math.PI / 2 * ai.strafe;
    u.mx = Math.cos(a) * 0.55; u.my = Math.sin(a) * 0.55;
  };
  const keepDist = () => {
    if (dd > keep + 40) mobSteer(w, u, t.x, t.y, 1);
    else if (dd < keep - 70) mobSteer(w, u, t.x, t.y, -1, 0.8);
    else strafe();
  };

  switch (d.ai) {
    case 'contact': {
      mobSteer(w, u, t.x, t.y, 1);
      if (dd < u.r + t.r + 5 && (u.contactT[t.id] || 0) < w.t) {
        u.contactT[t.id] = w.t + 0.85;
        w.hit(u, t, d.dmg, { kind: 'mob', knock: 40 });
        u.anim = 1;
      }
      break;
    }
    case 'melee':
    case 'blinker': {
      if (ai.state === 'wind') {
        if (ai.t <= 0) {
          ai.state = 'move';
          ai.cd = d.cd;
          u.anim = 1;
          for (const h of w.foesInCone(u.team, u.x, u.y, ai.ang, u.r + d.reach + 12, 1.7)) w.hit(u, h, d.dmg, { kind: 'mob', knock: 60 });
          w.emit('slash', u.x, u.y, ai.ang, u.r + d.reach + 12, 1.7, '#ff8a7a', u.id);
        }
        break;
      }
      if (ai.state === 'blink') {
        if (ai.t <= 0) {
          ai.state = 'move';
          w.emit('poof', u.x, u.y, '#7a4dff');
          u.x = u.px = ai.bx; u.y = u.py = ai.by;
          w.emit('poof', u.x, u.y, '#7a4dff');
          ai.cd = 0;
        }
        break;
      }
      if (d.ai === 'blinker' && (ai.blinkCd = (ai.blinkCd == null ? 3 : ai.blinkCd) - dt) <= 0 && dd > 140) {
        ai.blinkCd = 5 + w.rand() * 2;
        const back = angTo(t.x, t.y, u.x, u.y) + Math.PI;
        const p = clampToRoom(w, t.x + Math.cos(back) * (t.r + u.r + 20), t.y + Math.sin(back) * (t.r + u.r + 20), u.r);
        ai.bx = p.x; ai.by = p.y; ai.state = 'blink'; ai.t = 0.55;
        w.tele(u.team, 'circle', p.x, p.y, 0.55, null, { r: u.r + 10, kind: 'blink' });
        break;
      }
      if (dd < u.r + t.r + d.reach && ai.cd <= 0) {
        ai.state = 'wind';
        ai.t = d.wind;
        ai.ang = face;
        w.tele(u.team, 'cone', u.x, u.y, d.wind, null, { len: u.r + d.reach + 12, arc: 1.7, ang: face, follow: u, small: true });
      } else mobSteer(w, u, t.x, t.y, 1);
      break;
    }
    case 'ranged': {
      if (ai.state === 'aim') {
        if (ai.t <= 0) {
          ai.state = 'move';
          ai.cd = d.cd * (0.8 + w.rand() * 0.4);
          mobShot(w, u, angTo(u.x, u.y, t.x, t.y), d.shot);
          u.anim = 1;
        }
        break;
      }
      keepDist();
      if (ai.cd <= 0 && dd < keep + 200 && clearShot(w, u.x, u.y, t.x, t.y)) { ai.state = 'aim'; ai.t = 0.35; }
      break;
    }
    case 'charger': {
      if (ai.state === 'wind') {
        if (ai.t <= 0) {
          ai.state = 'move';
          ai.cd = d.cd;
          const a = ai.ang, sp = 720;
          u.dash = { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.48 };
          const seen = new Set();
          w.addArea({ team: u.team, follow: u, r: u.r + 6, dur: 0.5, tick: 1 / 60, hidden: true, onTick: (w2, ar) => {
            for (const h of w2.foesIn(u.team, ar.x, ar.y, ar.r)) { if (seen.has(h.id)) continue; seen.add(h.id); w2.hit(u, h, d.dmg, { kind: 'mob', knock: 140, ka: a }); if (d.slowHit) w2.slow(h, 0.4, 1.5); }
            if (d.trail && w2.tick % 6 === 0) fireZone(w2, u, ar.x, ar.y, 34, 2.2, d.dmg * 0.25);
          } });
        }
        break;
      }
      if (dd < 320 && ai.cd <= 0 && clearShot(w, u.x, u.y, t.x, t.y)) {
        ai.state = 'wind'; ai.t = 0.6; ai.ang = face;
        w.tele(u.team, 'line', u.x, u.y, 0.6, null, { ang: face, len: 350, wid: u.r * 2 + 8, follow: u });
      } else if (dd < 180) strafe(); else mobSteer(w, u, t.x, t.y, 1);
      break;
    }
    case 'caster': {
      keepDist();
      if (ai.cd <= 0 && dd < keep + 220) {
        ai.cd = d.cd * (0.85 + w.rand() * 0.3);
        const c = d.cast, tx = t.x + t.mx * 40, ty = t.y + t.my * 40;
        u.anim = 1;
        w.tele(u.team, 'circle', tx, ty, c.delay, (w2, a) => {
          if (c.zone === 'spore') {
            w2.addArea({ team: u.team, x: a.x, y: a.y, r: c.r, dur: c.dur, tick: 0.5, kind: 'spore', color: '#d65a8a', hostile: true, onTick: (w3, z) => {
              for (const h of w3.foesInArea(z)) { w3.hit(u, h, d.dmg, { kind: 'mob', raw: true, noDodge: true }); w3.slow(h, 0.3, 0.6); }
            } });
          } else if (c.zone === 'gravity') {
            w2.addArea({ team: u.team, x: a.x, y: a.y, r: c.r, dur: c.dur, tick: 0.5, kind: 'gravity', color: '#b48aff', hostile: true,
              onUpdate: (w3, z, dt2) => { for (const h of w3.foesIn(u.team, z.x, z.y, z.r + 40)) { const g = angTo(h.x, h.y, z.x, z.y); h.kx += Math.cos(g) * 160 * dt2; h.ky += Math.sin(g) * 160 * dt2; } },
              onTick: (w3, z) => { for (const h of w3.foesInArea(z)) w3.hit(u, h, d.dmg * 0.5, { kind: 'mob' }); } });
          } else {
            for (const h of w2.foesInArea(a)) { w2.hit(u, h, d.dmg, { kind: 'mob' }); w2.burn(h, u, 2, d.dmg * mult * 0.2); }
            w2.emit('boom', a.x, a.y, a.r, '#ffb02e');
          }
        }, { r: c.r });
      }
      break;
    }
    case 'bomber': {
      if (ai.state === 'fuse') {
        if (ai.t <= 0) {
          for (const h of w.foesIn(u.team, u.x, u.y, 88)) { w.hit(u, h, d.dmg, { kind: 'mob', knock: 160 }); w.freeze(h, 0.9); }
          w.emit('boom', u.x, u.y, 88, d.look.color);
          u.noGold = false;
          w.onZero(u, null, {});
        }
        break;
      }
      mobSteer(w, u, t.x, t.y, 1);
      u.spdMul = 1.15;
      if (dd < 70) { ai.state = 'fuse'; ai.t = 0.65; w.tele(u.team, 'circle', u.x, u.y, 0.65, null, { r: 88, follow: u }); }
      break;
    }
    case 'leaper': {
      if (ai.state === 'air') break;
      if (dd < 340 && dd > 80 && ai.cd <= 0) {
        ai.cd = d.cd;
        const T = 0.75, tx = t.x, ty = t.y, a = angTo(u.x, u.y, tx, ty), l = dist(u.x, u.y, tx, ty);
        ai.state = 'air';
        w.tele(u.team, 'circle', tx, ty, T, null, { r: 78 });
        u.dash = { vx: Math.cos(a) * l / T, vy: Math.sin(a) * l / T, t: T, air: true, onEnd: (w2, me) => {
          ai.state = 'move';
          for (const h of w2.foesIn(u.team, me.x, me.y, 78)) w2.hit(u, h, d.dmg, { kind: 'mob', knock: 120 });
          w2.emit('boom', me.x, me.y, 78, '#8a8f9e');
          w2.emit('shake', 3);
        } };
      } else mobSteer(w, u, t.x, t.y, 1);
      break;
    }
    case 'summoner': {
      keepDist();
      if (ai.cd <= 0) {
        ai.cd = d.cd;
        const s = d.summon;
        const have = w.units.filter((m) => m.kind === 'mob' && m.mid === s.id && m.summoner === u.id).length;
        for (let i = 0; i < s.n && have + i < s.max; i++) {
          const a = w.rand() * TAU;
          const p = clampToRoom(w, u.x + Math.cos(a) * (u.r + 24), u.y + Math.sin(a) * (u.r + 24), 12);
          const m = w.spawnMob(s.id, p.x, p.y, u.mult);
          m.summoner = u.id;
          m.noGold = true;
          w.emit('raise', p.x, p.y);
        }
        u.anim = 1;
      }
      break;
    }
    case 'ringer': {
      if (ai.state === 'aim') {
        if (ai.t <= 0) {
          ai.state = 'move';
          ai.cd = d.cd;
          const r = d.ring, off = w.rand() * TAU;
          for (let i = 0; i < r.n; i++) w.shoot(u, { x: u.x, y: u.y, ang: off + i / r.n * TAU, spd: r.spd, r: r.r, dmg: d.dmg, range: 600, kind: 'orb', color: r.color, o: { kind: 'mob' } });
          u.anim = 1;
        }
        break;
      }
      keepDist();
      if (ai.cd <= 0 && dd < keep + 260) { ai.state = 'aim'; ai.t = 0.5; w.tele(u.team, 'circle', u.x, u.y, 0.5, null, { r: u.r + 16, follow: u, small: true }); }
      break;
    }
    case 'laser': {
      if (ai.state === 'aim') {
        if (ai.t <= 0) {
          ai.state = 'move';
          ai.cd = d.cd;
          const a = { shape: 'line', x: u.x, y: u.y, ang: ai.ang, len: 760, wid: 28 };
          for (const h of w.units) if (h.team !== u.team && alive(h) && !h.untargetable && w.inArea(a, h)) w.hit(u, h, d.dmg, { kind: 'mob' });
          w.emit('beam', u.x, u.y, ai.ang, 760, d.look.color);
        }
        break;
      }
      keepDist();
      if (ai.cd <= 0 && dd < keep + 260) {
        ai.state = 'aim'; ai.t = 0.95; ai.ang = face;
        w.tele(u.team, 'line', u.x, u.y, 0.95, null, { ang: face, len: 760, wid: 28 });
      }
      break;
    }
    case 'slammer': {
      if (ai.state === 'wind') {
        if (ai.t <= 0) {
          ai.state = 'move';
          ai.cd = d.cd;
          for (const h of w.foesIn(u.team, u.x, u.y, 118)) w.hit(u, h, d.dmg, { kind: 'mob', knock: 220 });
          w.emit('boom', u.x, u.y, 118, d.look.color);
          w.emit('shake', 5);
          u.anim = 1;
        }
        break;
      }
      if (dd < 135 && ai.cd <= 0) { ai.state = 'wind'; ai.t = 0.85; w.tele(u.team, 'circle', u.x, u.y, 0.85, null, { r: 118, follow: u }); }
      else mobSteer(w, u, t.x, t.y, 1);
      break;
    }
    case 'lobber': {
      keepDist();
      if (ai.cd <= 0 && dd < keep + 260) {
        ai.cd = d.cd;
        const tx = t.x + t.mx * 50, ty = t.y + t.my * 50;
        u.anim = 1;
        w.tele(u.team, 'circle', tx, ty, 0.9, (w2, a) => {
          for (const h of w2.foesInArea(a)) { w2.hit(u, h, d.dmg, { kind: 'mob', knock: 100 }); w2.stun(h, 0.7); }
          w2.emit('boom', a.x, a.y, a.r, '#eef6ff');
        }, { r: 74 });
        w.shoot(u, { x: u.x, y: u.y, ang: 0, spd: 0, r: 14, dmg: 0, life: 9, kind: 'snowball', color: '#ffffff', lob: { x0: u.x, y0: u.y, x1: tx, y1: ty, T: 0.9, H: 120 } });
      }
      break;
    }
  }
}

function fireZone(w, src, x, y, r, dur, dmg) {
  w.addArea({ team: src.team, x, y, r, dur, tick: 0.5, kind: 'lava', color: '#ff6a1e', hostile: true, onTick: (w2, a) => {
    for (const h of w2.foesInArea(a)) { w2.hit(src, h, dmg, { kind: 'mob', raw: true, noDodge: true }); }
  } });
}

// Monster death: drops, splits, death effects and party passives that trigger on kills.
function onMobDeath(w, u, src, goldMul) {
  const d = u.mob;
  w.countKill(u);
  w.emit('die', u.x, u.y, d.look.color, u.r, u.mid);
  const owner = src && src.kind === 'summon' ? src.owner : src;
  if (!u.noGold) {
    let g = (d.gold || 1) * goldMul * (u.elite ? 4 : 1);
    if (owner && owner.kind === 'hero' && owner.s.midas && u.elite) g *= 3;
    const n = Math.min(8, Math.max(1, Math.round(g / 3)));
    for (let i = 0; i < n; i++) w.drop('gold', u.x, u.y, g / n);
    if (w.rand() < (u.elite ? 0.5 : 0.025)) w.drop('heal', u.x, u.y);
  }
  if (d.split) for (let i = 0; i < d.split.n; i++) {
    const m = w.spawnMob(d.split.id, u.x + (i ? 12 : -12), u.y, u.mult);
    m.kx = (i ? 1 : -1) * 220;
  }
  if (d.deathZone === 'lava') fireZone(w, u, u.x, u.y, 46, 3, d.dmg * u.mult.dmg * 0.3);
  if (u.elite === 'volatile') {
    const x = u.x, y = u.y, m = u.mult.dmg;
    w.tele(1, 'circle', x, y, 0.8, (w2, a) => {
      for (const h of w2.foesInArea(a)) w2.hit(null, h, 30 * m, { kind: 'mob', raw: true });
      w2.emit('boom', a.x, a.y, a.r, '#ffb02e');
    }, { r: 110 });
  }
  if (u.st.burn > 0 && w.flag(owner || u.st.burnSrc, 'combust')) {
    const by = (owner && owner.kind === 'hero') ? owner : u.st.burnSrc;
    if (by) for (const f of w.foesIn(by.team, u.x, u.y, 75)) if (f !== u) w.hit(by, f, 28, { kind: 'proc' });
    w.emit('boom', u.x, u.y, 75, '#ff7b2e');
  }
  if (owner && owner.kind === 'hero' && owner.hero.id === 'morrow' && w.rand() < 0.2) {
    const sk = owner.summons.filter((m) => !m.dead && m.stype === 'skeleton');
    if (sk.length < 6) { w.spawnSummon(owner, 'skeleton', u.x, u.y, { life: 8 }); w.emit('raise', u.x, u.y); }
  }
}

// ---------- Bosses ----------
function bossShootRing(w, u, n, spd, off, r, color, dmg) {
  for (let i = 0; i < n; i++) w.shoot(u, { x: u.x, y: u.y, ang: off + i / n * TAU, spd, r: r || 9, dmg: dmg || u.boss.dmg, range: 900, kind: 'orb', color: color || u.boss.color2, o: { kind: 'mob' } });
}

const BOSS_MOVES = {
  roots(w, u, t, p2) {
    const hs = heroesOf(w, u.team);
    for (const h of hs) {
      const per = p2 ? 2 : 1;
      for (let k = 0; k < per; k++) {
        const a = angTo(u.x, u.y, h.x, h.y) + (per > 1 ? (k ? 0.2 : -0.2) : 0);
        w.tele(u.team, 'line', u.x, u.y, 0.95, (w2, ar) => {
          for (const x of w2.foesInArea(ar)) { w2.hit(u, x, u.boss.dmg * 1.3, { kind: 'mob' }); w2.root(x, 1.1); }
          w2.emit('roots', ar.x, ar.y, ar.ang, ar.len);
        }, { ang: a, len: 640, wid: 46 });
      }
    }
    return 1.4;
  },
  ring(w, u, t, p2, big) {
    const waves = big ? 4 : 3, n = big ? 24 : 18;
    for (let i = 0; i < waves; i++) w.later(i * 0.45, () => bossShootRing(w, u, n, 210, (i % 2) * Math.PI / n), u.team);
    w.tele(u.team, 'circle', u.x, u.y, 0.4, null, { r: u.r + 20, follow: u, small: true });
    return waves * 0.45 + 0.5;
  },
  ring2(w, u, t) { return BOSS_MOVES.ring(w, u, t, true, true); },
  summon(w, u, t, p2) {
    const mobs = w.units.filter((m) => m.kind === 'mob').length;
    const n = Math.min(p2 ? 5 : 3, 14 - mobs);
    for (let i = 0; i < n; i++) {
      const a = i / Math.max(1, n) * TAU + w.rand();
      const p = clampToRoom(w, u.x + Math.cos(a) * (u.r + 50), u.y + Math.sin(a) * (u.r + 50), 16);
      w.tele(u.team, 'circle', p.x, p.y, 0.7, (w2) => { const m = w2.spawnMob(u.boss.summon, p.x, p.y, { hp: u.mult.hp * 0.5, dmg: u.mult.dmg * 0.8 }); m.noGold = true; w2.emit('raise', p.x, p.y); }, { r: 26, small: true });
    }
    return 1.2;
  },
  slam(w, u, t) {
    const a = angTo(u.x, u.y, t.x, t.y);
    u.dash = { vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, t: Math.min(0.7, Math.max(0, dist(u.x, u.y, t.x, t.y) - 80) / 300) };
    w.later(0.7, () => {
      w.tele(u.team, 'circle', u.x, u.y, 0.8, (w2, ar) => {
        for (const h of w2.foesInArea(ar)) w2.hit(u, h, u.boss.dmg * 1.6, { kind: 'mob', knock: 260 });
        w2.emit('boom', ar.x, ar.y, ar.r, u.boss.color2);
        w2.emit('shake', 9);
      }, { r: 175, follow: u });
    }, u.team);
    return 1.9;
  },
  charge(w, u, t) {
    const a = angTo(u.x, u.y, t.x, t.y);
    w.tele(u.team, 'line', u.x, u.y, 0.75, null, { ang: a, len: 620, wid: u.r * 2, follow: u });
    w.later(0.75, () => {
      const seen = new Set();
      u.dash = { vx: Math.cos(a) * 950, vy: Math.sin(a) * 950, t: 0.62 };
      w.addArea({ team: u.team, follow: u, r: u.r + 6, dur: 0.64, tick: 1 / 60, hidden: true, onTick: (w2, ar) => {
        for (const h of w2.foesIn(u.team, ar.x, ar.y, ar.r)) { if (seen.has(h.id)) continue; seen.add(h.id); w2.hit(u, h, u.boss.dmg * 1.5, { kind: 'mob', knock: 300, ka: a }); }
      } });
    }, u.team);
    return 1.8;
  },
  spiral(w, u, t, p2, arms) {
    arms = arms || (p2 ? 3 : 2);
    const dur = 2.8;
    let ang = w.rand() * TAU;
    for (let i = 0; i < dur / 0.09; i++) {
      w.later(i * 0.09, () => {
        ang += 0.23;
        for (let k = 0; k < arms; k++) w.shoot(u, { x: u.x, y: u.y, ang: ang + k / arms * TAU, spd: 230, r: 8, dmg: u.boss.dmg * 0.8, range: 900, kind: 'orb', color: u.boss.color2, o: { kind: 'mob' } });
      }, u.team);
    }
    return dur + 0.4;
  },
  spiral2(w, u, t) { return BOSS_MOVES.spiral(w, u, t, true, 4); },
  blink(w, u, t) {
    const a = w.rand() * TAU;
    const p = clampToRoom(w, t.x + Math.cos(a) * 260, t.y + Math.sin(a) * 260, u.r);
    w.tele(u.team, 'circle', p.x, p.y, 0.7, (w2) => {
      w2.emit('poof', u.x, u.y, u.boss.color2);
      u.x = u.px = p.x; u.y = u.py = p.y;
      w2.emit('poof', u.x, u.y, u.boss.color2);
      w2.tele(u.team, 'circle', u.x, u.y, 0.55, (w3, ar) => {
        for (const h of w3.foesInArea(ar)) w3.hit(u, h, u.boss.dmg * 1.3, { kind: 'mob', knock: 200 });
        w3.emit('ring', ar.x, ar.y, ar.r, u.boss.color2);
      }, { r: 160, follow: u });
    }, { r: u.r + 10 });
    return 1.6;
  },
  fan(w, u, t, p2) {
    for (let k = 0; k < 3; k++) w.later(k * 0.4, () => {
      const tt = u.ai.tgt && alive(u.ai.tgt) ? u.ai.tgt : t;
      const a = angTo(u.x, u.y, tt.x, tt.y), n = p2 ? 9 : 7;
      for (let i = 0; i < n; i++) w.shoot(u, { x: u.x, y: u.y, ang: a + (i - (n - 1) / 2) * 0.15, spd: 320, r: 8, dmg: u.boss.dmg, range: 900, kind: 'orb', color: u.boss.color2, o: { kind: 'mob' } });
    }, u.team);
    return 1.5;
  },
  beam(w, u, t) {
    const a = angTo(u.x, u.y, t.x, t.y);
    w.tele(u.team, 'line', u.x, u.y, 1.1, (w2, ar) => {
      for (const h of w2.foesInArea(ar)) w2.hit(u, h, u.boss.dmg * 2, { kind: 'mob' });
      w2.emit('beam', ar.x, ar.y, ar.ang, ar.len, u.boss.color2);
    }, { ang: a, len: 1000, wid: 46, follow: u });
    return 1.6;
  },
  meteors(w, u, t, p2, many) {
    const n = many ? 14 : 8;
    const hs = heroesOf(w, u.team);
    for (let i = 0; i < n; i++) w.later(i * 0.16, () => {
      const h = hs.length ? hs[i % hs.length] : t;
      const x = h.x + (w.rand() - 0.5) * 220, y = h.y + (w.rand() - 0.5) * 220;
      w.tele(u.team, 'circle', x, y, 0.85, (w2, ar) => {
        for (const x2 of w2.foesInArea(ar)) { w2.hit(u, x2, u.boss.dmg * 1.2, { kind: 'mob' }); w2.burn(x2, u, 2, u.boss.dmg * u.mult.dmg * 0.15); }
        w2.emit('boom', ar.x, ar.y, ar.r, '#ff7b2e');
        w2.emit('shake', 3);
      }, { r: 78 });
    }, u.team);
    return n * 0.16 + 1;
  },
  meteors2(w, u, t) { return BOSS_MOVES.meteors(w, u, t, true, true); },
  pools(w, u, t) {
    for (const h of heroesOf(w, u.team)) {
      w.tele(u.team, 'circle', h.x, h.y, 0.8, (w2, ar) => fireZone(w2, u, ar.x, ar.y, 92, 6, u.boss.dmg * u.mult.dmg * 0.35), { r: 92 });
    }
    return 1.2;
  },
  breath(w, u, t, p2) {
    const a = angTo(u.x, u.y, t.x, t.y), arc = p2 ? 1.3 : 0.95;
    w.tele(u.team, 'cone', u.x, u.y, 1.0, (w2, ar) => {
      for (const h of w2.foesInArea(ar)) { w2.hit(u, h, u.boss.dmg * 1.7, { kind: 'mob' }); w2.slow(h, 0.5, 2); }
      w2.emit('cone', ar.x, ar.y, ar.ang, ar.len, ar.arc, '#a8eaff');
    }, { ang: a, len: 400, arc, follow: u });
    return 1.6;
  },
  icicles(w, u, t, p2, many) {
    const n = many ? 22 : 13;
    const hs = heroesOf(w, u.team);
    for (let i = 0; i < n; i++) w.later(i * 0.08, () => {
      const h = hs.length ? hs[i % hs.length] : t;
      const x = h.x + (w.rand() - 0.5) * 300, y = h.y + (w.rand() - 0.5) * 300;
      w.tele(u.team, 'circle', x, y, 0.9, (w2, ar) => {
        for (const x2 of w2.foesInArea(ar)) { w2.hit(u, x2, u.boss.dmg, { kind: 'mob' }); w2.slow(x2, 0.4, 1.5); }
        w2.emit('shatter', ar.x, ar.y);
      }, { r: 50 });
    }, u.team);
    return n * 0.08 + 1.1;
  },
  icicles2(w, u, t) { return BOSS_MOVES.icicles(w, u, t, true, true); },
  orbs(w, u, t, p2) {
    const n = p2 ? 7 : 5;
    for (let i = 0; i < n; i++) w.shoot(u, { x: u.x, y: u.y, ang: i / n * TAU, spd: 150, r: 13, dmg: u.boss.dmg * 1.2, life: 6, homing: 1.3, kind: 'frostorb', color: '#a8eaff', noObst: true, onHit: (w2, p, h) => w2.slow(h, 0.5, 2), o: { kind: 'mob' } });
    return 1.3;
  },
  sweep(w, u) {
    w.tele(u.team, 'circle', u.x, u.y, 0.8, (w2, ar) => {
      for (const h of w2.foesInArea(ar)) w2.hit(u, h, u.boss.dmg * 1.4, { kind: 'mob', knock: 320 });
      w2.emit('ring', ar.x, ar.y, ar.r, u.boss.color2);
    }, { r: 225, follow: u });
    return 1.3;
  },
  waves(w, u, t, p2, many) {
    const vol = many ? 2 : 1;
    for (let v = 0; v < vol; v++) w.later(v * 0.6, () => {
      const tt = u.ai.tgt && alive(u.ai.tgt) ? u.ai.tgt : t;
      const a = angTo(u.x, u.y, tt.x, tt.y), n = many ? 5 : 3;
      for (let i = 0; i < n; i++) w.shoot(u, { x: u.x, y: u.y, ang: a + (i - (n - 1) / 2) * 0.32, spd: 340, r: 22, dmg: u.boss.dmg * 1.3, range: 1000, kind: 'crescent', color: '#b07bff', pierce: 99, noObst: true, o: { kind: 'mob' } });
    }, u.team);
    return 1 + vol * 0.6;
  },
  waves2(w, u, t) { return BOSS_MOVES.waves(w, u, t, true, true); },
  beams(w, u, t, p2, many) {
    const n = many ? 6 : 4, spd = many ? 0.75 : 0.55, dir = w.rand() < 0.5 ? 1 : -1, off = w.rand() * TAU;
    for (let i = 0; i < n; i++) {
      w.addArea({ team: u.team, x: u.x, y: u.y, follow: u, shape: 'line', ang: off + i / n * TAU, len: 900, wid: 30, dur: 4.2, delay: 1.1, tele: true, beam: true, tick: 0.2, hostile: true,
        onUpdate: (w2, ar, dt) => { ar.ang += spd * dir * dt; },
        onTick: (w2, ar) => { for (const h of w2.foesInArea(ar)) w2.hit(u, h, u.boss.dmg * 0.55, { kind: 'mob' }); },
      });
    }
    return 4.6;
  },
  beams2(w, u, t) { return BOSS_MOVES.beams(w, u, t, true, true); },
};

function bossTick(w, u, dt) {
  const ai = u.ai, B = u.boss;
  u.mx = u.my = 0;
  if (ai.shieldT > 0) { ai.shieldT -= dt; if (ai.shieldT <= 0) ai.shielded = false; }
  if (ai.phase === 1 && u.hp < u.maxHp * 0.5) {
    ai.phase = 2;
    u.spd = B.spd * 1.25;
    ai.cd = 1.2;
    ai.shielded = true;
    ai.shieldT = 1.5;
    w.emit('banner', B.name.toUpperCase() + ' IS ENRAGED!', '', '#ff4f6d');
    w.emit('shake', 12);
    w.emit('sfx', 'roar');
  }
  // contact damage
  for (const h of w.foesIn(u.team, u.x, u.y, 6)) {
    if ((u.contactT[h.id] || 0) < w.t) { u.contactT[h.id] = w.t + 0.8; w.hit(u, h, B.dmg * 0.5, { kind: 'mob', knock: 200 }); }
  }
  if (w.cantAct(u) || u.dash) return;
  const t = mobPickTarget(w, u, dt);
  if (!t) return;
  ai.busy = Math.max(0, (ai.busy || 0) - dt);
  if (ai.busy > 0) return;
  ai.cd -= dt;
  const dd = dist(u.x, u.y, t.x, t.y);
  u.ang = angTo(u.x, u.y, t.x, t.y);
  if (dd > 210) mobSteer(w, u, t.x, t.y, 1); else if (dd < 140) mobSteer(w, u, t.x, t.y, -1, 0.5);
  if (ai.cd <= 0) {
    const list = ai.phase === 2 ? B.p2 : B.moves;
    let m;
    for (let k = 0; k < 4; k++) { m = list[Math.floor(w.rand() * list.length)]; if (m !== ai.last) break; }
    ai.last = m;
    const dur = BOSS_MOVES[m](w, u, t, ai.phase === 2);
    ai.busy = dur * 0.75;
    ai.cd = (ai.phase === 2 ? 0.7 : 1.2) + w.rand() * 0.6;
    u.anim = 1;
  }
}
