// ---------- Perception: what one player can see (the only bridge from the sim to a bot) ----------
// perceive(sim, slot, P, rng) fills P with what that player's screen shows: the camera rectangle the
// view would draw (cameraRect), the HUD, and their own brawler. Enemies count only if the team can see
// them (bushes, invisibility) AND they are on this player's screen. No velocities: bots must estimate
// motion from successive sightings, like people do. Sound cues for unseen shooters are blurred.
// Bots get nothing else from the sim. What has left the screen (a teammate, the ball) is reported
// where it was last seen, flagged seen: false; a lob's landing spot is only an estimate.

const CUE_R = 7; // unseen enemy shots this close to you are heard
const CUE_JIT = 1.5; // ... and placed this far off (tiles)
const LOB_JUDGE = 0.35; // a bottle's landing spot is judged from its shadow to within ~this share of the way left

// Stable noise in [-1, 1] per (shot, viewer, component): the same misjudgement every percept.
function percNoise(id, slot, k) {
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(slot * 31 + k + 1, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

function newPercept() {
  return {
    tick: 0, t: 0, mode: '', map: null, cam: { x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0 }, flip: false,
    me: { slot: 0, team: 0, bk: '', x: 0, y: 0, hp: 0, maxHp: 1, ammo: 0, sup: 0, supReady: false, gadLeft: 0, gadReady: false, gadget: -1, carry: 0, cubes: 0, alive: false, respawnT: 0, inBush: false, invis: false, stunned: false, face: 0, lvl: 1, shield: false },
    allies: [], enemies: [], shots: [], areas: [], pickups: [], deploys: [], cues: [], pins: [],
    ball: null, hud: null, poison: null, nTeams: 2, frozen: false,
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
  m.ammo = me.ammo; m.sup = me.sup; m.supReady = me.supReady; m.gadLeft = me.gadLeft; m.gadReady = me.gadLeft > 0 && me.gadT <= 0 && me.gadget >= 0; m.gadget = me.gadget; // own loadout
  m.carry = me.carry; m.cubes = me.cubes; m.alive = me.alive; m.respawnT = me.respawnT; m.inBush = me.inBush;
  m.invis = me.invisT > 0; m.stunned = me.stunT > 0; m.face = me.face; m.lvl = me.lvl; m.shield = me.shieldT > 0; m.bounty = me.bounty;
  P.frozen = sim.freezeT > 0; // the GOAL / ROUND banner is up: nothing moves
  P.allies.length = 0;
  P.enemies.length = 0;
  const seen = P._seen || (P._seen = new Uint8Array(16));
  seen.fill(0);
  const AL = P._ally || (P._ally = {});
  for (const b of B) {
    if (b.slot === slot) continue;
    if (b.team === me.team) {
      // teammates: alive / respawning is on the HUD; where they are and how they're doing only while on
      // screen (and right after a respawn: everyone knows where the spawn is)
      let a = AL[b.slot];
      const fresh = !a || (!a.alive && b.alive) || !b.alive || inRect(cam, b.x, b.y, 0.3);
      if (!a) a = AL[b.slot] = { slot: b.slot, bk: b.bk, x: 0, y: 0, hp: 0, maxHp: 1, alive: true, respawnT: 0, carry: 0, inBush: false, supReady: false, bounty: 0, seen: false };
      a.alive = b.alive; a.respawnT = b.respawnT; a.seen = fresh;
      if (fresh) { a.x = b.x; a.y = b.y; a.hp = b.hp; a.maxHp = b.maxHp; a.carry = b.carry; a.inBush = b.inBush; a.supReady = b.supReady; a.bounty = b.bounty; }
      P.allies.push(a);
    } else if (b.alive && sim.visibleTo(me.team, b) && inRect(cam, b.x, b.y, 0.3)) {
      seen[b.slot] = 1;
      P.enemies.push({ slot: b.slot, team: b.team, bk: b.bk, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, carry: b.carry, cubes: b.cubes, inBush: b.inBush, bounty: b.bounty, lvl: b.lvl, shield: b.shieldT > 0 });
    }
  }
  // shots: enemy projectiles on screen (a lob's bottle; where it lands is judged from its shadow, more
  // closely as it comes down); unseen shooters become cues
  P.shots.length = 0;
  P.cues.length = 0;
  for (const s of sim.shots) {
    if (s.dead || s.team === me.team || s.beam > 0) continue;
    if (!inRect(cam, s.x, s.y, 0.5)) continue;
    let lob = null;
    if (s.lob) {
      const rem = Math.hypot(s.lob.tx - s.x, s.lob.ty - s.y) * LOB_JUDGE;
      lob = {
        tx: s.lob.tx + (percNoise(s.id, slot, 1) + percNoise(s.id, slot, 2)) * rem, ty: s.lob.ty + (percNoise(s.id, slot, 3) + percNoise(s.id, slot, 4)) * rem,
        tLeft: Math.max(0, s.lob.T - s.lob.t), r: s.s && s.s.blast ? s.s.blast : 1,
      };
    }
    P.shots.push({ id: s.id, x: s.x, y: s.y, ang: s.ang, spd: s.spd, r: s.r, team: s.team, owner: s.owner, lob });
    if (!seen[s.owner] && rng && s.trav < 1.5 && dist2(s.x0, s.y0, me.x, me.y) < CUE_R * CUE_R) {
      P.cues.push({ x: s.x0 + rng.range(-CUE_JIT, CUE_JIT), y: s.y0 + rng.range(-CUE_JIT, CUE_JIT), owner: s.owner });
    }
  }
  P.areas.length = 0;
  for (const a of sim.areas) {
    if (a.dead || !inRect(cam, a.x, a.y, a.r)) continue;
    P.areas.push({ id: a.id, x: a.x, y: a.y, r: a.r, team: a.team, harm: a.team !== me.team && (a.dmg > 0 || a.slow > 0), heal: a.team === me.team && a.heal > 0 });
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
  // the ball: while on screen, as it is; off screen, where it was last seen (everyone knows it starts,
  // and restarts after a goal, on its spot)
  const bl = sim.ball;
  if (bl && !bl.dead) {
    const mb = P._ball || (P._ball = { x: 0, y: 0, holderSlot: -1, holderTeam: -1, z: 0, seen: false, init: false });
    if (!mb.init || P.frozen) {
      const o = map.obj || { x: map.w / 2, y: map.h / 2 };
      mb.x = o.x; mb.y = o.y; mb.holderSlot = -1; mb.holderTeam = -1; mb.z = 0; mb.init = true;
    }
    mb.seen = inRect(cam, bl.x, bl.y, 0.3) || bl.holder === slot;
    if (mb.seen) {
      const h = bl.holder >= 0 ? B[bl.holder] : null;
      mb.x = bl.x; mb.y = bl.y; mb.holderSlot = bl.holder; mb.holderTeam = h ? h.team : -1; mb.z = bl.z || 0;
    }
    P.ball = mb;
  } else P.ball = null;
  P.hud = sim.hud();
  P.poison = sim.poison;
  // quick-chat pins from teammates (the last few seconds)
  P.pins.length = 0;
  if (sim.pins) for (const p of sim.pins) if (p.slot !== slot && B[p.slot].team === me.team) P.pins.push({ slot: p.slot, id: p.id, age: sim.t - p.t });
  return P;
}
