// ---------- Hero kits: basic attacks, skills, ultimates and passives ----------
// KITS[id] = { basic(w, u, tgt, mul), skill(w, u), ult(w, u), tick?(w, u, dt), sr (skill range), ur (ult range) }
// A skill or ult returning false was not cast (no cooldown spent).

function heroColor(u) { return u.hero.color; }

function meleeBasic(w, u, tgt, mul) {
  const b = u.hero.basic, multi = u.s.multi;
  const range = b.range * (1 + 0.25 * multi) + u.r;
  const arc = b.arc * (1 + 0.25 * multi);
  const a = angTo(u.x, u.y, tgt.x, tgt.y);
  const fs = w.foesInCone(u.team, u.x, u.y, a, range, arc);
  if (!fs.includes(tgt)) fs.push(tgt);
  for (const f of fs) w.hit(u, f, b.dmg * (mul || 1), { kind: 'basic', knock: b.knock, ka: angTo(u.x, u.y, f.x, f.y) });
  w.emit('slash', u.x, u.y, a, range, arc, u.hero.look.wcol, u.id);
}

function shotBasic(w, u, tgt, mul, extra) {
  const b = u.hero.basic;
  const n = 1 + u.s.multi;
  const base = angTo(u.x, u.y, tgt.x, tgt.y);
  for (let i = 0; i < n; i++) {
    const ang = base + (i - (n - 1) / 2) * 0.17 + (b.spread ? (w.rand() - 0.5) * b.spread * 2 : 0);
    const p = {
      x: u.x + Math.cos(ang) * u.r, y: u.y + Math.sin(ang) * u.r, ang, spd: b.spd, r: b.r, dmg: b.dmg * (mul || 1), range: b.range * 1.15,
      pierce: (b.pierce || 0) + u.s.pierce, kind: b.fx, color: heroColor(u), homing: b.homing, o: { kind: 'basic' },
    };
    if (b.splash) p.explode = { r: b.splash, dmg: b.dmg * 0.5 * (mul || 1) };
    if (extra) Object.assign(p, extra);
    w.shoot(u, p);
  }
  w.emit('shoot', u.id, b.fx);
}

function dashHit(w, u, ang, speed, t, hitR, onHit, o) {
  u.dash = Object.assign({ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, t }, o || {});
  u.ang = ang;
  const seen = new Set();
  w.addArea({ team: u.team, follow: u, r: hitR, dur: t + 0.04, tick: 1 / 60, hidden: true, onTick: (w2, a) => {
    for (const f of w2.foesIn(u.team, a.x, a.y, hitR)) { if (seen.has(f.id)) continue; seen.add(f.id); onHit(f); }
  } });
}

function lob(w, u, x, y, T, H, kind, onLand, tele) {
  if (tele) w.tele(u.team, 'circle', x, y, T, null, { r: tele, friendly: true, kind });
  w.shoot(u, { x: u.x, y: u.y, ang: 0, spd: 0, r: 10, dmg: 0, life: 99, kind, color: heroColor(u), lob: { x0: u.x, y0: u.y, x1: x, y1: y, T, H }, onEnd: onLand });
}

function clampToRoom(w, x, y, r) {
  const b = w.bounds(r);
  x = clamp(x, b.x0, b.x1);
  y = clamp(y, b.y0, b.y1);
  if (w.room) for (const o of w.room.obst) {
    const dx = x - o.x, dy = y - o.y, m = o.r + r, d = Math.hypot(dx, dy);
    if (d < m) { const k = (d || 0.01); x = o.x + dx / k * m; y = o.y + dy / k * m; }
  }
  return { x: clamp(x, b.x0, b.x1), y: clamp(y, b.y0, b.y1) };
}

function cleanse(u) {
  const s = u.st;
  s.burn = s.poison = s.slow = s.freeze = s.stun = s.root = 0;
}

const KITS = {
  brand: {
    sr: 200, ur: 200,
    basic: meleeBasic,
    skill(w, u) {
      const a = w.aim(u, 240).ang;
      u.ccImmune = 0.3;
      dashHit(w, u, a, 900, 0.2, u.r + 24, (f) => { w.hit(u, f, 60, { kind: 'skill', knock: 240, ka: a }); w.stun(f, 1.2); });
      w.emit('sfx', 'bash');
    },
    ult(w, u) {
      const x = u.x, y = u.y;
      w.addArea({ team: u.team, x, y, r: 185, dur: 8, tick: 0.5, kind: 'banner', color: u.hero.color, onTick: (w2, a) => {
        for (const al of w2.alliesIn(u.team, a.x, a.y, a.r, false)) { w2.buff(al, 'banner', 0.7, { dr: 0.5 }); w2.heal(al, al.maxHp * 0.025); }
      } });
      for (const f of w.foesIn(u.team, x, y, 330)) w.taunt(f, u, 4);
      w.shieldUp(u, u.maxHp * 0.4, 8);
      w.emit('ring', x, y, 330, u.hero.color);
    },
  },

  ember: {
    sr: 230, ur: 450,
    basic(w, u, tgt, mul) {
      shotBasic(w, u, tgt, mul, { onHit: (w2, p, f) => w2.burn(f, u, 2, 8 * u.s.dmg) });
    },
    skill(w, u) {
      const a = w.aim(u, 230).ang;
      for (const f of w.foesInCone(u.team, u.x, u.y, a, 240, 1.15)) { w.hit(u, f, 72, { kind: 'skill', knock: 60 }); w.burn(f, u, 3.5, 14 * u.s.dmg); }
      w.emit('cone', u.x, u.y, a, 240, 1.15, '#ff7b2e');
    },
    ult(w, u) {
      const c = w.aim(u, 450, true);
      for (let i = 0; i < 11; i++) {
        w.later(i * 0.22, () => {
          const fs = w.foesIn(u.team, c.x, c.y, 380);
          const t = fs.length && w.rand() < 0.7 ? fs[Math.floor(w.rand() * fs.length)] : null;
          const x = t ? t.x + (w.rand() - 0.5) * 30 : c.x + (w.rand() - 0.5) * 300, y = t ? t.y + (w.rand() - 0.5) * 30 : c.y + (w.rand() - 0.5) * 300;
          w.tele(u.team, 'circle', x, y, 0.55, (w2, a) => {
            for (const f of w2.foesIn(u.team, a.x, a.y, a.r)) { w2.hit(u, f, 115, { kind: 'ult', knock: 120, ka: angTo(a.x, a.y, f.x, f.y) }); w2.burn(f, u, 3, 14 * u.s.dmg); }
            w2.emit('boom', a.x, a.y, a.r, '#ff7b2e');
            w2.emit('shake', 4);
          }, { r: 85, friendly: true, kind: 'meteor' });
        });
      }
    },
  },

  hawke: {
    sr: 420, ur: 480,
    basic: shotBasic,
    skill(w, u) {
      const a = w.aim(u, 420).ang;
      for (let i = 0; i < 7; i++) {
        const ang = a + (i - 3) * 0.14;
        w.shoot(u, { x: u.x, y: u.y, ang, spd: 860, r: 6, dmg: 32, range: 500, pierce: 1 + u.s.pierce, kind: 'arrow', color: u.hero.color, knock: 70, o: { kind: 'skill' } });
      }
      w.emit('shoot', u.id, 'arrow');
    },
    ult(w, u) {
      const c = w.aim(u, 480, true);
      w.addArea({ team: u.team, x: c.x, y: c.y, r: 220, dur: 3, tick: 0.07, kind: 'arrowrain', color: u.hero.color, onTick: (w2, a) => {
        const ang = w2.rand() * TAU, d = Math.sqrt(w2.rand()) * a.r;
        const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
        for (const f of w2.foesIn(u.team, x, y, 36)) w2.hit(u, f, 30, { kind: 'ult' });
        w2.emit('arrowfall', x, y);
      } });
    },
  },

  willow: {
    sr: 420, ur: 450,
    basic: shotBasic,
    skill(w, u) {
      let t = u, lr = 2;
      for (const a of w.alliesIn(u.team, u.x, u.y, 420, true)) { const r = a.hp / a.maxHp; if (r < lr) { lr = r; t = a; } }
      w.addArea({ team: u.team, x: t.x, y: t.y, r: 155, dur: 4.5, tick: 0.5, kind: 'bloom', color: '#5df0b0', onTick: (w2, a) => {
        for (const al of w2.alliesIn(u.team, a.x, a.y, a.r, false)) w2.heal(al, al.maxHp * 0.045);
      } });
    },
    ult(w, u) {
      for (const h of w.heroes()) {
        if (h.team !== u.team) continue;
        if (h.downed && dist(h.x, h.y, u.x, u.y) < 480) w.revive(h, 0.5, u);
        if (alive(h) && dist(h.x, h.y, u.x, u.y) < 650) w.heal(h, h.maxHp * 0.5);
      }
      for (const f of w.foesIn(u.team, u.x, u.y, 270)) { w.root(f, 2.4); w.hit(u, f, 40, { kind: 'ult' }); }
      w.addArea({ team: u.team, x: u.x, y: u.y, r: 270, dur: 2.2, kind: 'grove', color: '#5df0b0' });
      w.emit('flash', '#5df0b0', 0.25);
    },
    tick(w, u, dt) {
      u.counters.aura = (u.counters.aura || 0) + dt;
      if (u.counters.aura >= 0.5) {
        u.counters.aura = 0;
        for (const al of w.alliesIn(u.team, u.x, u.y, 230, true)) w.heal(al, al.maxHp * 0.006);
      }
    },
  },

  rime: {
    sr: 160, ur: 450,
    basic(w, u, tgt, mul) { shotBasic(w, u, tgt, mul, { onHit: (w2, p, f) => w2.slow(f, 0.3, 1.5) }); },
    skill(w, u) {
      for (const f of w.foesIn(u.team, u.x, u.y, 175)) { w.hit(u, f, 42, { kind: 'skill' }); w.freeze(f, 1.7); }
      w.emit('ring', u.x, u.y, 175, '#a8eaff');
      w.emit('sfx', 'ice');
    },
    ult(w, u) {
      const c = w.aim(u, 450, true);
      let k = 0;
      w.addArea({ team: u.team, x: c.x, y: c.y, r: 215, dur: 5, tick: 0.25, kind: 'blizzard', color: '#a8eaff', onTick: (w2, a) => {
        k++;
        for (const f of w2.foesInArea(a)) {
          w2.hit(u, f, 14, { kind: 'ult' });
          w2.slow(f, 0.55, 0.5);
          if (k % 5 === 0) w2.freeze(f, 0.8);
        }
      } });
    },
  },

  gale: {
    sr: 200, ur: 450,
    basic: meleeBasic,
    skill(w, u) {
      const a = w.aim(u, 220).ang;
      u.st.invuln = Math.max(u.st.invuln, 0.32);
      dashHit(w, u, a, 920, 0.22, u.r + 26, (f) => w.hit(u, f, 46, { kind: 'skill', knock: 280, ka: angTo(u.x, u.y, f.x, f.y) }));
      w.emit('ring', u.x, u.y, 60, '#9be7ff');
    },
    ult(w, u) {
      const c = w.aim(u, 450, true);
      const a0 = angTo(u.x, u.y, c.x, c.y);
      const st = { vx: Math.cos(a0) * 170, vy: Math.sin(a0) * 170 };
      w.addArea({ team: u.team, x: u.x + Math.cos(a0) * 40, y: u.y + Math.sin(a0) * 40, r: 72, dur: 5.5, tick: 0.2, kind: 'tornado', color: '#9be7ff',
        onUpdate: (w2, a, dt) => {
          const t = w2.nearestFoe(a, 500) ;
          if (t) { const want = angTo(a.x, a.y, t.x, t.y); st.vx = lerp(st.vx, Math.cos(want) * 170, dt * 1.5); st.vy = lerp(st.vy, Math.sin(want) * 170, dt * 1.5); }
          const p = clampToRoom(w2, a.x + st.vx * dt, a.y + st.vy * dt, 20);
          a.x = p.x; a.y = p.y;
          for (const f of w2.foesIn(u.team, a.x, a.y, 210)) {
            if (f.kind === 'boss') continue;
            const g = angTo(f.x, f.y, a.x, a.y), m = f.heavy ? 0.35 : 1;
            f.kx += Math.cos(g) * 520 * dt * m; f.ky += Math.sin(g) * 520 * dt * m;
          }
        },
        onTick: (w2, a) => { for (const f of w2.foesIn(u.team, a.x, a.y, a.r)) w2.hit(u, f, 17, { kind: 'ult' }); },
      });
    },
  },

  gizmo: {
    sr: 300, ur: 500,
    basic: shotBasic,
    skill(w, u) {
      const ts = u.summons.filter((m) => !m.dead && m.stype === 'turret');
      if (ts.length >= 2) { ts[0].dead = true; w.emit('poof', ts[0].x, ts[0].y, '#ffb02e'); }
      const p = clampToRoom(w, u.x + Math.cos(u.ang) * 34, u.y + Math.sin(u.ang) * 34, 16);
      w.spawnSummon(u, 'turret', p.x, p.y, { life: 14 });
      w.emit('ring', p.x, p.y, 40, '#ffb02e');
    },
    ult(w, u) {
      for (let i = 0; i < 18; i++) {
        w.later(i * 0.09, () => {
          if (u.downed || u.ko) return;
          const fs = w.foesIn(u.team, u.x, u.y, 560);
          const t = fs.length ? fs[Math.floor(w.rand() * fs.length)] : null;
          const ang = t ? angTo(u.x, u.y, t.x, t.y) + (w.rand() - 0.5) * 1.6 : u.ang + (w.rand() - 0.5) * 1.2;
          const p = w.shoot(u, { x: u.x, y: u.y, ang, spd: 380, accel: 1.6, homing: 6, r: 7, dmg: 18, range: 700, kind: 'rocket', color: '#ffb02e', noObst: true, explode: { r: 52, dmg: 40, all: true }, o: { kind: 'ult' } });
          p.tgt = t;
        });
      }
    },
  },

  volt: {
    sr: 220, ur: 420,
    basic(w, u, tgt, mul) {
      const b = u.hero.basic;
      const over = u.basicN % 4 === 3;
      w.chain(u, tgt, b.dmg * (mul || 1), (over ? 5 : b.jumps) + u.s.multi, b.jump, { kind: 'basic' });
      w.emit('shoot', u.id, 'zap');
    },
    skill(w, u) {
      const a = w.aim(u, 240).ang;
      const p = clampToRoom(w, u.x + Math.cos(a) * 230, u.y + Math.sin(a) * 230, u.r);
      for (const f of w.foesInLine(u.team, u.x, u.y, angTo(u.x, u.y, p.x, p.y), dist(u.x, u.y, p.x, p.y), 56)) { w.hit(u, f, 56, { kind: 'skill' }); w.stun(f, 0.6); }
      w.emit('zap', u.x, u.y, p.x, p.y, '#fff36a', 2);
      u.x = u.px = p.x; u.y = u.py = p.y;
      u.st.invuln = Math.max(u.st.invuln, 0.2);
      u.ang = a;
    },
    ult(w, u) {
      w.addArea({ team: u.team, follow: u, x: u.x, y: u.y, r: 420, dur: 3.6, tick: 0.24, kind: 'storm', color: '#fff36a', onTick: (w2, a) => {
        const fs = w2.foesIn(u.team, a.x, a.y, a.r);
        if (!fs.length) return;
        const t = fs[Math.floor(w2.rand() * fs.length)];
        for (const f of w2.foesIn(u.team, t.x, t.y, 52)) { w2.hit(u, f, 88, { kind: 'ult' }); w2.stun(f, 0.4); }
        w2.emit('bolt', t.x, t.y, '#fff36a');
      } });
    },
  },

  nyx: {
    sr: 380, ur: 140,
    basic: meleeBasic,
    skill(w, u) {
      const c = w.aim(u, 380);
      const t = c.tgt;
      let p;
      if (t) {
        const a = angTo(u.x, u.y, t.x, t.y);
        p = clampToRoom(w, t.x + Math.cos(a) * (t.r + u.r + 8), t.y + Math.sin(a) * (t.r + u.r + 8), u.r);
        u.target = t;
      } else p = clampToRoom(w, u.x + Math.cos(c.ang) * 170, u.y + Math.sin(c.ang) * 170, u.r);
      w.emit('poof', u.x, u.y, '#a24dff');
      u.x = u.px = p.x; u.y = u.py = p.y;
      if (t) u.ang = angTo(u.x, u.y, t.x, t.y);
      u.st.invis = 1.6;
      u.counters.crits = 3;
      u.atkT = 0;
      for (const m of w.units) if (m.kind !== 'hero' && m.ai && m.ai.tgt === u) m.ai.tgt = null;
      w.emit('poof', u.x, u.y, '#a24dff');
    },
    ult(w, u) {
      u.st.invuln = Math.max(u.st.invuln, 2.3);
      let acc = 0;
      u.channel = { t: 2.3, speed: 0.85, noBasic: true, kind: 'lotus', onTick: (w2, me, dt) => {
        acc += dt;
        while (acc >= 0.14) {
          acc -= 0.14;
          for (const f of w2.foesIn(u.team, u.x, u.y, 145)) w2.hit(u, f, 19, { kind: 'ult' });
          w2.emit('slash', u.x, u.y, w2.t * 9, 145, 2.2, '#d6c8ff', u.id);
        }
      } };
    },
  },

  krag: {
    sr: 110, ur: 150,
    basic: meleeBasic,
    skill(w, u) {
      u.ccImmune = 2;
      let acc = 0;
      u.channel = { t: 2, speed: 1.15, noBasic: true, kind: 'whirl', onTick: (w2, me, dt) => {
        acc += dt;
        while (acc >= 0.25) {
          acc -= 0.25;
          for (const f of w2.foesIn(u.team, u.x, u.y, 112)) w2.hit(u, f, 23, { kind: 'skill', knock: 60 });
          w2.emit('slash', u.x, u.y, w2.t * 12, 112, 3.2, u.hero.look.wcol, u.id);
        }
      } };
    },
    ult(w, u) {
      w.buff(u, 'rage', 8, { as: 0.6, ms: 0.3, ls: 0.22, size: 0.28, dmg: 0.3 });
      u.ccImmune = 3;
      w.heal(u, u.maxHp * 0.25);
      w.emit('ring', u.x, u.y, 120, '#ff3b3b');
    },
  },

  vex: {
    sr: 420, ur: 650,
    basic(w, u, tgt, mul) { shotBasic(w, u, tgt, mul, { onHit: (w2, p, f) => w2.poison(f, u, 1, 5 * u.s.dmg) }); },
    skill(w, u) {
      const c = w.aim(u, 420, true);
      lob(w, u, c.x, c.y, 0.42, 60, 'poison', (w2) => {
        w2.addArea({ team: u.team, x: c.x, y: c.y, r: 145, dur: 5, tick: 0.5, kind: 'toxic', color: '#8fe03a', onTick: (w3, a) => {
          for (const f of w3.foesInArea(a)) { w3.poison(f, u, 2, 5 * u.s.dmg); w3.slow(f, 0.25, 0.6); }
        } });
      });
    },
    ult(w, u) {
      const fs = w.foesIn(u.team, u.x, u.y, 650, (f) => f.st.poison > 0);
      if (!fs.length) {
        for (const f of w.foesIn(u.team, u.x, u.y, 420)) w.poison(f, u, 4, 5 * u.s.dmg);
        w.emit('ring', u.x, u.y, 420, '#8fe03a');
        return;
      }
      for (const f of fs) {
        const pending = f.st.poisonN * f.st.poisonDps * f.st.poison;
        w.hit(u, f, 60, { kind: 'ult' });
        w.hit(u, f, pending * 1.6, { kind: 'ult', raw: true, noCrit: true });
        w.emit('boom', f.x, f.y, 70, '#8fe03a');
        for (const g of w.foesIn(u.team, f.x, f.y, 140)) if (g !== f) w.poison(g, u, 3, 5 * u.s.dmg);
        f.st.poisonN = Math.min(f.st.poisonN, 3);
      }
    },
  },

  morrow: {
    sr: 400, ur: 520,
    basic: shotBasic,
    skill(w, u) {
      const sk = u.summons.filter((m) => !m.dead && m.stype === 'skeleton');
      while (sk.length > 4) { const o = sk.shift(); o.dead = true; }
      for (let i = 0; i < 2; i++) {
        const p = clampToRoom(w, u.x + Math.cos(u.ang + (i ? 1 : -1)) * 40, u.y + Math.sin(u.ang + (i ? 1 : -1)) * 40, 14);
        w.spawnSummon(u, 'skeleton', p.x, p.y, { life: 15 });
        w.emit('raise', p.x, p.y);
      }
    },
    ult(w, u) {
      let total = 0;
      for (const f of w.foesIn(u.team, u.x, u.y, 520)) { total += w.hit(u, f, 92, { kind: 'ult' }); w.emit('zap', f.x, f.y, u.x, u.y, '#9affc6', 3); }
      const al = w.alliesIn(u.team, u.x, u.y, 650, true);
      for (const a of al) w.heal(a, total * 0.35 / Math.max(1, al.length));
      for (let i = 0; i < 2; i++) {
        const p = clampToRoom(w, u.x + (i ? 50 : -50), u.y + 20, 18);
        w.spawnSummon(u, 'champion', p.x, p.y, { life: 12 });
        w.emit('raise', p.x, p.y);
      }
      w.emit('flash', '#9affc6', 0.2);
    },
  },

  lyra: {
    sr: 420, ur: 520,
    basic: shotBasic,
    skill(w, u) {
      for (const a of w.alliesIn(u.team, u.x, u.y, 430, false)) w.buff(a, 'hymn', 6, { as: 0.3, ms: 0.2, dmg: 0.15 });
      w.emit('ring', u.x, u.y, 430, '#ff7ad1');
      w.emit('notes', u.x, u.y);
    },
    ult(w, u) {
      for (const f of w.foesIn(u.team, u.x, u.y, 540)) { w.hit(u, f, 120, { kind: 'ult', knock: 160 }); w.stun(f, 1.6); }
      for (const a of w.alliesIn(u.team, u.x, u.y, 650, true)) { w.heal(a, a.maxHp * 0.3); if (a !== u) a.ult = Math.min(100, a.ult + 15); }
      w.emit('ring', u.x, u.y, 540, '#ff7ad1');
      w.emit('shake', 8);
      w.emit('flash', '#ff7ad1', 0.2);
    },
  },

  atlas: {
    sr: 420, ur: 300,
    basic: meleeBasic,
    skill(w, u) {
      const c = w.aim(u, 420, true);
      lob(w, u, c.x, c.y, 0.6, 110, 'boulder', (w2) => {
        for (const f of w2.foesIn(u.team, c.x, c.y, 96)) { w2.hit(u, f, 82, { kind: 'skill', knock: 120, ka: angTo(c.x, c.y, f.x, f.y) }); w2.stun(f, 1.3); }
        w2.emit('boom', c.x, c.y, 96, '#b08a5a');
        w2.emit('shake', 5);
      }, 96);
    },
    ult(w, u) {
      [170, 275, 380].forEach((r, i) => {
        w.later(i * 0.4, () => {
          if (u.downed || u.ko) return;
          for (const f of w.foesIn(u.team, u.x, u.y, r)) { w.hit(u, f, 72, { kind: 'ult', knock: 140, ka: angTo(u.x, u.y, f.x, f.y) }); w.stun(f, 0.85); }
          w.emit('ring', u.x, u.y, r, '#c89a5a');
          w.emit('shake', 7);
        });
      });
    },
    tick(w, u, dt) {
      u.counters.stoneT += dt;
      if (u.counters.stoneT >= 4 && u.shield < u.maxHp * 0.12) { u.counters.stoneT = 0; w.shieldUp(u, u.maxHp * 0.16, 30); w.emit('text', u.x, u.y - 34, 'STONE SKIN', '#d8c8a8', 12); }
    },
  },

  sol: {
    sr: 280, ur: 2000,
    basic: shotBasic,
    skill(w, u) {
      for (const a of w.alliesIn(u.team, u.x, u.y, 290, true)) { w.shieldUp(a, a.maxHp * 0.26, 5); cleanse(a); }
      w.emit('ring', u.x, u.y, 290, '#ffd23f');
    },
    ult(w, u) {
      for (const h of w.heroes()) {
        if (h.team !== u.team) continue;
        if (h.downed) w.revive(h, 0.6, u);
        if (alive(h)) { h.st.invuln = Math.max(h.st.invuln, w.arena ? 2 : 3.2); w.heal(h, h.maxHp * 0.4); cleanse(h); }
      }
      w.emit('flash', '#fff6c0', 0.35);
    },
  },

  chrona: {
    sr: 200, ur: 2000,
    basic(w, u, tgt, mul) { shotBasic(w, u, tgt, mul, { onHit: (w2, p, f) => w2.slow(f, 0.2, 1) }); },
    skill(w, u) {
      if (u.hist.length < 4) return false;
      const old = u.hist[0];
      for (const f of w.foesIn(u.team, u.x, u.y, 140)) { w.hit(u, f, 40, { kind: 'skill' }); w.slow(f, 0.5, 2); }
      w.emit('ring', u.x, u.y, 140, '#53e0d0');
      w.emit('zap', u.x, u.y, old.x, old.y, '#53e0d0', 3);
      u.x = u.px = old.x; u.y = u.py = old.y;
      u.hp = Math.max(u.hp, Math.min(u.maxHp, old.hp));
      cleanse(u);
      u.st.invuln = Math.max(u.st.invuln, 0.6);
      u.hist.length = 0;
    },
    ult(w, u) {
      w.timeStop = { t: w.arena ? 2.4 : 4.2, team: u.team, max: w.arena ? 2.4 : 4.2 };
      w.emit('timestop', u.x, u.y);
    },
  },

  umbra: {
    sr: 420, ur: 450,
    basic: shotBasic,
    skill(w, u) {
      const c = w.aim(u, 420, true);
      w.addArea({ team: u.team, x: c.x, y: c.y, r: 175, dur: 2.7, tick: 0.25, kind: 'blackhole', color: '#6a3cff',
        onUpdate: (w2, a, dt) => {
          for (const f of w2.foesIn(u.team, a.x, a.y, a.r + 30)) {
            if (f.kind === 'boss') continue;
            const g = angTo(f.x, f.y, a.x, a.y), d = dist(f.x, f.y, a.x, a.y), m = (f.heavy ? 0.3 : 1) * Math.min(1, d / 40);
            f.kx += Math.cos(g) * 700 * dt * m; f.ky += Math.sin(g) * 700 * dt * m;
            f.st.voidMark = Math.max(f.st.voidMark, 0.4);
          }
        },
        onTick: (w2, a) => { for (const f of w2.foesInArea(a)) w2.hit(u, f, 12, { kind: 'skill' }); },
      });
    },
    ult(w, u) {
      const c = w.aim(u, 450, true);
      w.addArea({ team: u.team, x: c.x, y: c.y, r: 320, dur: 3, tick: 0.25, kind: 'collapse', color: '#6a3cff',
        onUpdate: (w2, a, dt) => {
          for (const f of w2.foesIn(u.team, a.x, a.y, a.r)) {
            if (f.kind === 'boss') { f.st.voidMark = 0.4; continue; }
            const g = angTo(f.x, f.y, a.x, a.y), d = dist(f.x, f.y, a.x, a.y), m = (f.heavy ? 0.4 : 1) * Math.min(1, d / 50);
            f.kx += Math.cos(g) * 900 * dt * m; f.ky += Math.sin(g) * 900 * dt * m;
            f.st.voidMark = Math.max(f.st.voidMark, 0.4);
          }
        },
        onTick: (w2, a) => { for (const f of w2.foesInArea(a)) w2.hit(u, f, 12, { kind: 'ult' }); },
        onEnd: (w2, a) => {
          for (const f of w2.foesIn(u.team, a.x, a.y, a.r)) w2.hit(u, f, 230, { kind: 'ult', knock: 200, ka: angTo(a.x, a.y, f.x, f.y) });
          w2.emit('boom', a.x, a.y, a.r, '#b07bff');
          w2.emit('shake', 10);
        },
      });
    },
  },

  drakon: {
    sr: 280, ur: 200,
    basic(w, u, tgt, mul) {
      if (u.formT > w.t) {
        const a = angTo(u.x, u.y, tgt.x, tgt.y);
        for (const f of w.foesInCone(u.team, u.x, u.y, a, 215, 0.95)) { w.hit(u, f, 15 * (mul || 1), { kind: 'basic' }); w.burn(f, u, 2, 10 * u.s.dmg); }
        w.emit('cone', u.x, u.y, a, 215, 0.95, '#ff7b2e');
        return;
      }
      const b = u.hero.basic;
      const a = angTo(u.x, u.y, tgt.x, tgt.y);
      const fs = w.foesInLine(u.team, u.x, u.y, a, b.range + u.r, b.width * (1 + 0.4 * u.s.multi));
      if (!fs.includes(tgt)) fs.push(tgt);
      for (const f of fs) w.hit(u, f, b.dmg * (mul || 1), { kind: 'basic', knock: b.knock, ka: a });
      w.emit('thrust', u.x, u.y, a, b.range + u.r, u.hero.look.wcol, u.id);
    },
    skill(w, u) {
      const c = w.aim(u, 280, true);
      const p = clampToRoom(w, c.x, c.y, u.r);
      const T = 0.45, d = dist(u.x, u.y, p.x, p.y), a = angTo(u.x, u.y, p.x, p.y);
      u.st.invuln = Math.max(u.st.invuln, T + 0.05);
      w.tele(u.team, 'circle', p.x, p.y, T, null, { r: 115, friendly: true, kind: 'leap' });
      u.dash = { vx: Math.cos(a) * d / T, vy: Math.sin(a) * d / T, t: T, air: true, onEnd: (w2, me) => {
        for (const f of w2.foesIn(u.team, me.x, me.y, 115)) { w2.hit(u, f, 72, { kind: 'skill', knock: 160, ka: angTo(me.x, me.y, f.x, f.y) }); w2.burn(f, u, 3, 14 * u.s.dmg); }
        w2.emit('boom', me.x, me.y, 115, '#ff7b2e');
        w2.emit('shake', 6);
      } };
      u.ang = a;
    },
    ult(w, u) {
      u.formT = w.t + 8;
      u.rateMul = 3.4;
      u.basicRange = 200;
      w.buff(u, 'dragon', 8, { size: 0.45 });
      w.shieldUp(u, u.maxHp * 0.5, 8);
      w.emit('ring', u.x, u.y, 140, '#ff7b2e');
    },
    tick(w, u) {
      if (u.formT && u.formT <= w.t) { u.formT = 0; u.rateMul = 1; u.basicRange = 0; }
    },
  },
};

// Hero bots read a few facts about each power.
const AI_HINT = {
  brand: { skill: 'engage', ult: 'tank' }, ember: { skill: 'cone', ult: 'aoe' }, hawke: { skill: 'target', ult: 'aoe' },
  willow: { skill: 'heal', ult: 'revive' }, rime: { skill: 'nova', ult: 'aoe' }, gale: { skill: 'engage', ult: 'aoe' },
  gizmo: { skill: 'summon', ult: 'aoe' }, volt: { skill: 'engage', ult: 'aoe' }, nyx: { skill: 'engage', ult: 'melee' },
  krag: { skill: 'nova', ult: 'buff' }, vex: { skill: 'target', ult: 'poison' }, morrow: { skill: 'summon', ult: 'aoe' },
  lyra: { skill: 'buff', ult: 'aoe' }, atlas: { skill: 'target', ult: 'aoe' }, sol: { skill: 'shield', ult: 'revive' },
  chrona: { skill: 'escape', ult: 'aoe' }, umbra: { skill: 'target', ult: 'aoe' }, drakon: { skill: 'leap', ult: 'buff' },
};
