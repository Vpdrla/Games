// ---------- Autopilot: steers and picks upgrades. Used by the balance tests and the demo. ----------
const BQ = new Array(4096);
const BOT_PASSIVES = ['might', 'haste', 'area', 'vitality', 'armor', 'duration', 'multishot', 'regen', 'magnet', 'swiftness', 'luck', 'velocity'];

class Bot {
  constructor(run, skill) {
    this.run = run;
    this.skill = skill == null ? 1 : skill;
    this.t = 0;
    this.mx = 0;
    this.my = 0;
    this.wa = Math.random() * TAU;
    this.dir = 1;
    this.flip = 50;
  }

  update(dt) {
    const run = this.run;
    this.t -= dt;
    if (this.t > 0) { run.setMove(this.mx, this.my); return; }
    this.t = 0.08 + (1 - this.skill) * 0.25;
    const p = run.player;
    // enemy pressure: rx/ry points away from the horde
    let rx = 0, ry = 0, danger = 0;
    const n = run.grid.query(p.x, p.y, 170, BQ);
    for (let i = 0; i < n; i++) {
      const e = BQ[i];
      if (e.dead || e.prop) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (d > 170) continue;
      const gap = Math.max(6, d - e.r - p.r);
      const w = (e.boss ? 5 : e.elite ? 2 : 1) * 900 / (gap * gap);
      rx += (dx / d) * w;
      ry += (dy / d) * w;
      danger += w;
    }
    // hard dangers: shots and hazards
    let hx = 0, hy = 0;
    for (const b of run.eprojs) {
      const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 > 110 * 110) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      if (dx * b.vx + dy * b.vy <= 0) continue; // moving away
      // sidestep perpendicular to the shot, away from its path
      const side = (dx * b.vy - dy * b.vx) > 0 ? -1 : 1;
      const w = (500 / Math.max(64, d2)) * 40;
      hx += (-b.vy / sp) * side * w;
      hy += (b.vx / sp) * side * w;
      danger += w * 0.5;
    }
    for (const z of run.zones) {
      if (z.k !== 'vent' && z.k !== 'rift' && z.k !== 'puddle' && z.k !== 'warn') continue;
      const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1;
      if (d > z.r + 50) continue;
      const w = 30 * (1 - (d - z.r) / 60);
      hx += (dx / d) * w;
      hy += (dy / d) * w;
      danger += w;
    }
    let fx = hx, fy = hy;
    // circle around the horde: the classic way to keep enemies inside your weapons' reach
    const rl = Math.hypot(rx, ry);
    if (rl > 0.01) {
      this.flip -= 1;
      if (this.flip <= 0) { this.flip = 40 + Math.random() * 60; if (Math.random() < 0.35) this.dir = -this.dir; }
      const away = Math.min(2, rl / 2.5);
      fx += (rx / rl) * away + (-ry / rl) * this.dir;
      fy += (ry / rl) * away + (rx / rl) * this.dir;
    }
    // go for pickups when it is safe enough
    let best = null, bd = 1e9;
    for (const d of run.drops) {
      if (d.mag) continue;
      const dist = Math.hypot(d.x - p.x, d.y - p.y);
      const want = d.k === 'chest' ? 0.35 : d.k === 'heart' ? (p.hp < run.stats.maxHp * 0.6 ? 0.4 : 3) : d.k === 'gem' ? 1 : 0.7;
      const score = dist * want;
      if (score < bd && dist < 320) { bd = score; best = d; }
    }
    if (best && danger < 12) {
      const dx = best.x - p.x, dy = best.y - p.y, d = Math.hypot(dx, dy) || 1;
      const w = (best.k === 'chest' ? 3 : 1.2) * (danger < 3 ? 2 : 1);
      fx += (dx / d) * w;
      fy += (dy / d) * w;
    }
    this.wa += 0.03;
    fx += Math.cos(this.wa) * 0.25;
    fy += Math.sin(this.wa) * 0.25;
    if (this.skill < 1) {
      fx += (Math.random() - 0.5) * (1 - this.skill) * 3;
      fy += (Math.random() - 0.5) * (1 - this.skill) * 3;
    }
    const l = Math.hypot(fx, fy);
    this.mx = l > 0.05 ? fx / l : 0;
    this.my = l > 0.05 ? fy / l : 0;
    run.setMove(this.mx, this.my);
  }

  score(c) {
    const run = this.run;
    if (c.kind === 'gold') return 1;
    if (c.kind === 'heal') return run.player.hp < run.stats.maxHp * 0.5 ? 3 : 0.5;
    if (c.kind === 'weapon') {
      if (!c.isNew) return 10 + c.lvl * 0.3;
      return run.weapons.length < 4 ? 9 : 7;
    }
    // passives: prefer the ones that evolve a weapon we own
    const owned = PAIR_OF[c.key] && run.family(PAIR_OF[c.key]);
    const pri = BOT_PASSIVES.length - BOT_PASSIVES.indexOf(c.key);
    return (owned ? 9.5 : 4) + pri * 0.1 + (c.isNew ? 0 : 0.5);
  }

  choose(choices) {
    let best = choices[0], bs = -1;
    for (const c of choices) {
      const s = this.score(c) + Math.random() * 0.5;
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }
}
