// ---------- Hero bots ----------
// A bot drives a hero through the same input a player uses (move, skill, ultimate, dash). It reacts
// to telegraphs and shots after a human-like delay, revives fallen allies, kites or dives depending
// on its hero, and spends its powers when they are worth it. skill: 0 easy, 1 normal, 2 hard.

const BOT_SKILL = [
  { react: 0.42, dodge: 0.45, think: 0.2, use: 0.6 },
  { react: 0.27, dodge: 0.78, think: 0.12, use: 0.9 },
  { react: 0.17, dodge: 0.95, think: 0.08, use: 1 },
];

class HeroBot {
  constructor(skill, seed) {
    this.k = BOT_SKILL[clamp(skill == null ? 1 : skill, 0, 2)];
    this.rng = new RNG(seed || 7);
    this.t = 0;
    this.mx = 0; this.my = 0;
    this.seen = new Map();
    this.strafe = this.rng.next() < 0.5 ? 1 : -1;
    this.tgt = null;
    this.wantSkill = 0;
    this.wantUlt = 0;
  }

  think(w, u, dt) {
    const inp = u.input;
    inp.skill = inp.ult = inp.dash = false;
    inp.aim = null;
    if (u.ko) { inp.mx = inp.my = 0; return; }
    if (u.downed) {
      const al = this.nearestAlly(w, u, 900);
      if (al) { const a = angTo(u.x, u.y, al.x, al.y); inp.mx = Math.cos(a); inp.my = Math.sin(a); } else inp.mx = inp.my = 0;
      return;
    }
    this.t -= dt;
    if (this.t <= 0) { this.t = this.k.think * (0.7 + this.rng.next() * 0.6); this.decide(w, u); }
    let mx = this.mx, my = this.my;
    const dg = this.danger(w, u, dt);
    if (dg) {
      mx = dg.x; my = dg.y;
      if (dg.urgent && u.cd.dash <= 0 && this.rng.next() < this.k.dodge * 0.5) {
        inp.dash = true;
        inp.mx = mx; inp.my = my;
      }
    }
    const k = Math.min(1, dt * 14);
    inp.mx = lerp(inp.mx, mx, k);
    inp.my = lerp(inp.my, my, k);
    if (this.wantSkill > 0) { this.wantSkill -= dt; if (this.wantSkill <= 0) { inp.skill = true; inp.aim = this.skillAim; } }
    if (this.wantUlt > 0) { this.wantUlt -= dt; if (this.wantUlt <= 0) { inp.ult = true; inp.aim = this.ultAim; } }
  }

  nearestAlly(w, u, r) {
    let best = null, bd = r * r;
    for (const o of w.units) if (o !== u && o.kind === 'hero' && o.team === u.team && alive(o)) { const d = dist2(o.x, o.y, u.x, u.y); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  // Returns an escape direction when the bot stands in (or in the path of) something dangerous.
  danger(w, u, dt) {
    let best = null, urgency = 9;
    for (const a of w.areas) {
      if (a.team === u.team || a.friendly || a.hidden) continue;
      if (!a.tele && !a.hostile) continue;
      const left = a.tele && !a.fired ? a.delay - a.t : 0;
      if (a.tele && a.fired && !a.beam && !a.hostile) continue;
      const m = { x: u.x, y: u.y, r: u.r + 14 };
      if (!w.inArea(a, m)) { this.seen.delete(a.id); continue; }
      if (!this.seen.has(a.id)) this.seen.set(a.id, w.t);
      if (w.t - this.seen.get(a.id) < this.k.react) continue;
      let ex, ey;
      if (a.shape === 'circle') {
        let ang = angTo(a.x, a.y, u.x, u.y);
        if (dist2(a.x, a.y, u.x, u.y) < 16) ang = this.rng.next() * TAU;
        ex = Math.cos(ang); ey = Math.sin(ang);
      } else if (a.shape === 'line' || a.shape === 'cone') {
        const n = a.ang + Math.PI / 2;
        const side = Math.cos(n) * (u.x - a.x) + Math.sin(n) * (u.y - a.y) >= 0 ? 1 : -1;
        ex = Math.cos(n) * side; ey = Math.sin(n) * side;
        if (a.shape === 'cone') { const aw = angTo(a.x, a.y, u.x, u.y); ex = ex * 0.7 + Math.cos(aw) * 0.3; ey = ey * 0.7 + Math.sin(aw) * 0.3; }
      } else { ex = 0; ey = 0; }
      const urg = left;
      if (urg < urgency) { urgency = urg; best = { x: ex, y: ey, urgent: urg < 0.32 }; }
    }
    // incoming shots
    for (const p of w.projs) {
      if (p.team === u.team || p.lob || !p.dmg) continue;
      const rx = u.x - p.x, ry = u.y - p.y;
      if (rx * rx + ry * ry > 230 * 230) continue;
      const v2 = p.vx * p.vx + p.vy * p.vy;
      if (v2 < 1) continue;
      const tc = (rx * p.vx + ry * p.vy) / v2;
      if (tc < 0 || tc > 0.65) continue;
      const cx = p.x + p.vx * tc - u.x, cy = p.y + p.vy * tc - u.y;
      if (cx * cx + cy * cy > (u.r + p.r + 8) * (u.r + p.r + 8)) continue;
      if (this.rng.next() > this.k.dodge * 0.35) continue;
      const n = Math.atan2(p.vy, p.vx) + Math.PI / 2;
      const side = Math.cos(n) * rx + Math.sin(n) * ry >= 0 ? 1 : -1;
      if (tc < urgency) { urgency = tc; best = { x: Math.cos(n) * side, y: Math.sin(n) * side, urgent: tc < 0.2 }; }
    }
    if (best) {
      // stay inside the room
      const b = w.bounds(u.r + 30);
      if (u.x < b.x0 && best.x < 0) best.x = 0.6;
      if (u.x > b.x1 && best.x > 0) best.x = -0.6;
      if (u.y < b.y0 && best.y < 0) best.y = 0.6;
      if (u.y > b.y1 && best.y > 0) best.y = -0.6;
    }
    return best;
  }

  decide(w, u) {
    const h = u.hero, hint = AI_HINT[h.id], kit = u.kit;
    const melee = h.basic.kind === 'melee' || h.basic.kind === 'thrust';
    const hpr = u.hp / u.maxHp;
    let foes = [], near150 = 0, near300 = 0, boss = null;
    for (const o of w.units) {
      if (o.team === u.team || !alive(o) || o.untargetable) continue;
      const d = dist(u.x, u.y, o.x, o.y);
      if (d > 900) continue;
      foes.push({ o, d });
      if (d < 150 + o.r) near150++;
      if (d < 300 + o.r) near300++;
      if (o.kind === 'boss') boss = o;
    }
    foes.sort((a, b) => a.d - b.d);
    const allies = w.units.filter((o) => o.kind === 'hero' && o.team === u.team && o !== u);
    // 1) revive fallen allies
    const down = allies.filter((o) => o.downed && !o.deadOut && !(o.autoRev > 0)).sort((a, b) => dist2(a.x, a.y, u.x, u.y) - dist2(b.x, b.y, u.x, u.y))[0];
    let goal = null;
    if (down && !w.arena) {
      let threat = 0;
      for (const f of foes) if (dist(f.o.x, f.o.y, down.x, down.y) < 170) threat++;
      if (threat <= 2 || hpr > 0.55 || h.role === 'Tank' || h.role === 'Healer') goal = { x: down.x, y: down.y, stop: 20 };
    }
    // 2) pick a target
    let tgt = this.tgt && alive(this.tgt) && dist(u.x, u.y, this.tgt.x, this.tgt.y) < 620 ? this.tgt : null;
    if (!tgt || this.rng.next() < 0.08) {
      let best = null, bs = 1e9;
      for (const f of foes) {
        let s = f.d;
        if (f.o.kind === 'boss') s -= 120;
        if (f.o.elite) s -= 40;
        if (f.o.kind === 'hero') s -= (1 - f.o.hp / f.o.maxHp) * 160;
        if (f.o.kind === 'summon') s += 150;
        if (s < bs) { bs = s; best = f.o; }
      }
      tgt = best;
    }
    this.tgt = tgt;
    if (tgt) u.target = tgt;
    // 3) movement
    let mx = 0, my = 0;
    const retreat = hpr < 0.3 && near300 > 0 && !w.arena || (w.arena && hpr < 0.25 && near300 > 1);
    if (goal) {
      const d = dist(u.x, u.y, goal.x, goal.y);
      if (d > goal.stop) { const a = angTo(u.x, u.y, goal.x, goal.y); mx = Math.cos(a); my = Math.sin(a); }
    } else if (retreat) {
      let cx = 0, cy = 0;
      for (const f of foes) if (f.d < 320) { cx += f.o.x - u.x; cy += f.o.y - u.y; }
      const a = Math.atan2(-cy, -cx);
      mx = Math.cos(a); my = Math.sin(a);
      const healer = allies.find((o) => alive(o) && (o.hero.role === 'Healer'));
      if (healer) { const b = angTo(u.x, u.y, healer.x, healer.y); mx = (mx + Math.cos(b)) / 2; my = (my + Math.sin(b)) / 2; }
    } else if (tgt) {
      const d = dist(u.x, u.y, tgt.x, tgt.y);
      const want = melee ? tgt.r + u.r + h.basic.range * 0.45 : Math.min(h.basic.range * 0.72, 330);
      const a = angTo(u.x, u.y, tgt.x, tgt.y);
      if (this.rng.next() < 0.05) this.strafe = -this.strafe;
      if (d > want + 30) { mx = Math.cos(a); my = Math.sin(a); }
      else if (d < want - 50 && !melee) { mx = -Math.cos(a); my = -Math.sin(a); }
      else { const s = a + Math.PI / 2 * this.strafe; mx = Math.cos(s) * 0.6; my = Math.sin(s) * 0.6; }
      // ranged heroes back off from anything in their face
      if (!melee && foes.length && foes[0].d < 110 + foes[0].o.r) {
        const f = foes[0].o, b = angTo(f.x, f.y, u.x, u.y);
        mx = mx * 0.3 + Math.cos(b); my = my * 0.3 + Math.sin(b);
      }
    } else {
      const g = w.mode && w.mode.botGoal ? w.mode.botGoal(u) : null;
      if (g) {
        const d = dist(u.x, u.y, g.x, g.y);
        if (d > (g.stop || 30)) { const a = angTo(u.x, u.y, g.x, g.y); mx = Math.cos(a); my = Math.sin(a); }
      }
    }
    // avoid hugging walls
    const b = w.bounds(u.r + 40);
    if (u.x < b.x0) mx += 0.5; if (u.x > b.x1) mx -= 0.5; if (u.y < b.y0) my += 0.5; if (u.y > b.y1) my -= 0.5;
    this.mx = mx; this.my = my;

    // 4) powers
    if (this.wantSkill <= 0 && u.cd.skill <= 0 && !u.channel && this.rng.next() < this.k.use) {
      if (this.shouldSkill(w, u, hint.skill, kit.sr, tgt, foes, allies, hpr, near150, boss)) { this.wantSkill = this.k.react * 0.6; }
    }
    if (this.wantUlt <= 0 && u.ult >= 100 && !u.channel && this.rng.next() < this.k.use) {
      if (this.shouldUlt(w, u, hint.ult, kit.ur, tgt, foes, allies, hpr, boss)) { this.wantUlt = this.k.react * 0.6; this.ultAim = null; }
    }
  }

  shouldSkill(w, u, kind, range, tgt, foes, allies, hpr, near150, boss) {
    const inR = (r) => foes.filter((f) => f.d < r + f.o.r).length;
    const td = tgt ? dist(u.x, u.y, tgt.x, tgt.y) : 1e9;
    this.skillAim = null;
    switch (kind) {
      case 'engage':
        if (u.hero.id === 'volt' && hpr < 0.35 && foes.length && foes[0].d < 160) { this.skillAim = angTo(foes[0].o.x, foes[0].o.y, u.x, u.y); return true; }
        return tgt && td < range && td > 70 && hpr > 0.3;
      case 'cone': return tgt && td < range && (inR(range) >= 2 || tgt.kind === 'boss' || tgt.elite || tgt.kind === 'hero');
      case 'target': return tgt && td < range * 1.05 && (inR(range) >= 2 || tgt.kind === 'boss' || tgt.elite || tgt.kind === 'hero' || tgt.heavy);
      case 'heal': return allies.concat([u]).some((a) => alive(a) && a.hp / a.maxHp < 0.65 && dist(a.x, a.y, u.x, u.y) < 420);
      case 'nova': return inR(range) >= 2 || (tgt && td < range && (tgt.kind === 'boss' || tgt.elite || tgt.kind === 'hero'));
      case 'summon': return foes.some((f) => f.d < 520);
      case 'buff': return inR(450) >= 2 || !!boss;
      case 'shield': return allies.concat([u]).some((a) => alive(a) && a.hp / a.maxHp < 0.7 && dist(a.x, a.y, u.x, u.y) < 280) || near150 >= 4;
      case 'escape': return hpr < 0.45 && u.hist.length > 6 && u.hist[0].hp > u.hp * 1.3;
      case 'leap': return tgt && td < range && td > 90;
    }
    return false;
  }

  shouldUlt(w, u, kind, range, tgt, foes, allies, hpr, boss) {
    const inR = (r) => foes.filter((f) => f.d < r + f.o.r).length;
    const bossIn = (r) => boss && dist(u.x, u.y, boss.x, boss.y) < r + boss.r;
    switch (kind) {
      case 'aoe': return inR(range) >= 4 || bossIn(range) || (tgt && tgt.elite && inR(range) >= 2) || (w.arena && inR(range) >= 1);
      case 'tank': return inR(300) >= 4 || bossIn(300) || (w.arena && inR(250) >= 1);
      case 'revive': return allies.some((a) => a.downed) || allies.filter((a) => alive(a) && a.hp / a.maxHp < 0.45).length >= 2 || hpr < 0.3 || (w.arena && hpr < 0.4);
      case 'melee': return inR(150) >= 3 || bossIn(150) || (w.arena && inR(150) >= 1);
      case 'buff': return inR(320) >= 3 || bossIn(400) || (w.arena && inR(300) >= 1);
      case 'poison': return foes.filter((f) => f.d < 650 && f.o.st.poison > 0).length >= 4 || (boss && boss.st.poisonN >= 6) || (w.arena && foes.some((f) => f.d < 600 && f.o.st.poisonN >= 4));
    }
    return false;
  }
}
