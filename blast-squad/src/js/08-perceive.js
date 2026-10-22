// ---------- Perception: what one player can see (the only bridge from the sim to a bot) ----------
// perceive(sim, slot, P, rng) fills P with what that player's screen shows: the camera rectangle the
// view would draw (cameraRect), the HUD, and their own brawler. Enemies count only if the team can see
// them (bushes, invisibility) AND they are on this player's screen. No velocities: bots must estimate
// motion from successive sightings, like people do. Sound cues for unseen shooters are blurred.
// Bots get nothing else from the sim.

const CUE_R = 7; // unseen enemy shots this close to you are heard
const CUE_JIT = 1.5; // ... and placed this far off (tiles)

function newPercept() {
  return {
    tick: 0, t: 0, mode: '', map: null, cam: { x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0 }, flip: false,
    me: { slot: 0, team: 0, bk: '', x: 0, y: 0, hp: 0, maxHp: 1, ammo: 0, sup: 0, supReady: false, gadLeft: 0, gadReady: false, carry: 0, cubes: 0, alive: false, respawnT: 0, inBush: false, invis: false, stunned: false, face: 0, lvl: 1, shield: false },
    allies: [], enemies: [], shots: [], areas: [], pickups: [], deploys: [], cues: [], pins: [],
    ball: null, hud: null, poison: null, nTeams: 2,
  };
}

function perceive(sim, slot, P, rng) {
  const B = sim.brawlers, me = B[slot], map = sim.map;
  const sd = sim.modeKey === MODE.SHOWDOWN;
  P.tick = sim.tick;
  P.t = sim.t;
  P.mode = sim.modeKey;
  P.map = map;
  P.nTeams = sim.nTeams;
  P.flip = me.team === 1 && !sd;
  // the camera follows you while alive; when down it stays where you fell (as on screen)
  cameraRect(map, me.x, me.y, P.flip, sd, P.cam);
  const cam = P.cam;
  const m = P.me;
  m.slot = slot; m.team = me.team; m.bk = me.bk; m.x = me.x; m.y = me.y; m.hp = me.hp; m.maxHp = me.maxHp;
  m.ammo = me.ammo; m.sup = me.sup; m.supReady = me.supReady; m.gadLeft = me.gadLeft; m.gadReady = me.gadLeft > 0 && me.gadT <= 0 && me.gadget >= 0;
  m.carry = me.carry; m.cubes = me.cubes; m.alive = me.alive; m.respawnT = me.respawnT; m.inBush = me.inBush;
  m.invis = me.invisT > 0; m.stunned = me.stunT > 0; m.face = me.face; m.lvl = me.lvl; m.shield = me.shieldT > 0; m.bounty = me.bounty;
  P.allies.length = 0;
  P.enemies.length = 0;
  const seen = P._seen || (P._seen = new Uint8Array(16));
  seen.fill(0);
  for (const b of B) {
    if (b.slot === slot) continue;
    if (b.team === me.team) {
      P.allies.push({ slot: b.slot, bk: b.bk, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, alive: b.alive, respawnT: b.respawnT, carry: b.carry, inBush: b.inBush, supReady: b.supReady, bounty: b.bounty });
    } else if (b.alive && sim.visibleTo(me.team, b) && inRect(cam, b.x, b.y, 0.3)) {
      seen[b.slot] = 1;
      P.enemies.push({ slot: b.slot, team: b.team, bk: b.bk, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, carry: b.carry, cubes: b.cubes, inBush: b.inBush, bounty: b.bounty, lvl: b.lvl, shield: b.shieldT > 0 });
    }
  }
  // shots: enemy projectiles on screen (lobs show their landing spot); unseen shooters become cues
  P.shots.length = 0;
  P.cues.length = 0;
  for (const s of sim.shots) {
    if (s.dead || s.team === me.team || s.beam > 0) continue;
    if (!inRect(cam, s.x, s.y, 0.5) && !(s.lob && inRect(cam, s.lob.tx, s.lob.ty, 0.5))) continue;
    P.shots.push({ id: s.id, x: s.x, y: s.y, ang: s.ang, spd: s.spd, r: s.r, team: s.team, owner: s.owner, lob: s.lob ? { tx: s.lob.tx, ty: s.lob.ty, tLeft: Math.max(0, s.lob.T - s.lob.t), r: s.s && s.s.blast ? s.s.blast : 1 } : null });
    if (!seen[s.owner] && rng && s.trav < 1.5 && dist2(s.x0, s.y0, me.x, me.y) < CUE_R * CUE_R) {
      P.cues.push({ x: s.x0 + rng.range(-CUE_JIT, CUE_JIT), y: s.y0 + rng.range(-CUE_JIT, CUE_JIT), owner: s.owner });
    }
  }
  P.areas.length = 0;
  for (const a of sim.areas) {
    if (a.dead || !inRect(cam, a.x, a.y, a.r)) continue;
    P.areas.push({ x: a.x, y: a.y, r: a.r, team: a.team, harm: a.team !== me.team && (a.dmg > 0 || a.slow > 0), heal: a.team === me.team && a.heal > 0 });
  }
  P.pickups.length = 0;
  for (const p of sim.pickups) {
    if (p.dead || !inRect(cam, p.x, p.y, 0)) continue;
    P.pickups.push({ id: p.id, pick: p.pick, x: p.x, y: p.y, n: p.n });
  }
  P.deploys.length = 0;
  for (const d of sim.deploys) {
    if (d.dead || !inRect(cam, d.x, d.y, 0.5)) continue;
    P.deploys.push({ id: d.id, team: d.team, owner: d.owner, dk: d.dk, x: d.x, y: d.y, hp: d.hp, maxHp: d.maxHp });
  }
  const bl = sim.ball;
  if (bl && !bl.dead) {
    const h = bl.holder >= 0 ? B[bl.holder] : null;
    P.ball = P.ball || {};
    P.ball.x = bl.x; P.ball.y = bl.y; P.ball.holderSlot = bl.holder; P.ball.holderTeam = h ? h.team : -1; P.ball.z = bl.z || 0;
  } else P.ball = null;
  P.hud = sim.hud();
  P.poison = sim.poison;
  // quick-chat pins from teammates (the last few seconds)
  P.pins.length = 0;
  if (sim.pins) for (const p of sim.pins) if (p.slot !== slot && B[p.slot].team === me.team) P.pins.push({ slot: p.slot, id: p.id, age: sim.t - p.t });
  return P;
}
