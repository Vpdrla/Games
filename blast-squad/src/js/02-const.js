// ---------- Shared constants and contracts (frozen: other modules build on these) ----------
// World units: 1 unit = 1 tile. Data tables are written in the original game's units (1 tile = 300)
// and converted once with U(). x grows to the right, y grows downwards. Team 0 starts at the bottom.

const SIM_HZ = 30;
const SIM_DT = 1 / SIM_HZ;
const TILE_UNITS = 300;
const U = (v) => v / TILE_UNITS; // original units -> tiles

const BRAWLER_R = 0.42; // body radius (movement and hit circle)
const MAX_AMMO = 3;
const REGEN_DELAY = 3; // s without attacking or taking damage before health regenerates
const REGEN_RATE = 0.13; // share of max health regenerated per second
const RESPAWN_T = 3; // s (3v3 modes with respawn)
const SPAWN_SHIELD_T = 1.5; // s of spawn protection after (re)spawning
const REVEAL_R = 2.6; // tiles: an enemy this close sees into your bush
const REVEAL_T = 1.0; // s visible after attacking or being hit while in a bush
const LEVEL_MULT = (lvl) => 1 + 0.1 * (lvl - 1); // health and damage per power level (11 = x2)
const MAX_POWER = 11;
const CUBE_HP = 400; // Showdown power cube: +400 max health (original units) ...
const CUBE_DMG = 0.1; // ... and +10% damage each

// The camera a player sees (and the only part of the world a bot may look at). Height in tiles; the
// width follows a 16:9 phone in landscape. The player sits CAM_AHEAD of the way down the screen in
// 3v3 modes (more room towards the enemy), in the middle in Showdown.
const CAM_H = 16;
const CAM_W = CAM_H * 16 / 9;
const CAM_AHEAD = 0.62;

// ---- tiles ----
const TILE = { FLOOR: 0, WALL: 1, STONE: 2, WATER: 3, FENCE: 4, BUSH: 5, BOX: 6, PAD: 7 };
// WALL breaks under supers flagged `breaks`; STONE never breaks; BOX is a Showdown power-cube box
// (has hit points, drops a cube); PAD is a jump pad (map data gives its landing point).
const TF_MOVE = 1; // blocks movement
const TF_SHOT = 2; // blocks straight shots and beams (lobs fly over everything)
const TF_BUSH = 4; // hides brawlers inside it
const TF_BREAK = 8; // destroyed by `breaks` supers (becomes FLOOR)
const TF_PAD = 16;
const TILE_FLAGS = [
  0, // FLOOR
  TF_MOVE | TF_SHOT | TF_BREAK, // WALL
  TF_MOVE | TF_SHOT, // STONE
  TF_MOVE, // WATER
  TF_MOVE, // FENCE (rope): blocks movement, not shots
  TF_BUSH, // BUSH
  TF_MOVE | TF_SHOT, // BOX (destroyed by damage, not by `breaks`)
  TF_PAD, // PAD
];

// ---- entity kinds ----
const K = { BRAWLER: 1, SHOT: 2, AREA: 3, PICKUP: 4, BALL: 5, DEPLOY: 6 };
const PICK = { GEM: 1, CUBE: 2, STAR: 3 };

// ---- modes ----
const MODE = { GEM: 'gem', SHOWDOWN: 'sd', BALL: 'ball', KNOCKOUT: 'ko', BOUNTY: 'bounty' };
const MODE_INFO = {
  gem: { name: 'Gem Rush', short: 'Collect 10 gems and hold them for 15 seconds.', teams: 2, size: 3, color: '#b45cff' },
  sd: { name: 'Showdown', short: 'Last brawler standing wins. Grab power cubes, dodge the poison.', teams: 10, size: 1, color: '#5bd16a' },
  ball: { name: 'Blast Ball', short: 'Score 2 goals before the other team.', teams: 2, size: 3, color: '#4aa3ff' },
  ko: { name: 'Knockout', short: 'Best of 3 rounds. No respawns.', teams: 2, size: 3, color: '#ff8a3d' },
  bounty: { name: 'Bounty', short: 'Take down enemies for stars. Most stars wins.', teams: 2, size: 3, color: '#3fd4e8' },
};

// ---- events: sim.events is an array of arrays [EV.x, ...args]; the caller drains it each tick ----
const EV = {
  FIRE: 1, // [EV.FIRE, slot, act(1 attack, 2 super, 3 gadget), x, y, ang, inSeq]
  SHOT_END: 2, // [EV.SHOT_END, shotId, x, y, wall(0/1)]   (wall: stopped by a tile)
  HIT: 3, // [EV.HIT, targetId, dmg, x, y, srcSlot, crit(0/1), act]   (target: any entity id; dmg after modifiers;
  //        act: ACT.* of the source, on brawler hits)
  HEAL: 4, // [EV.HEAL, slot, amount, x, y]
  KILL: 5, // [EV.KILL, victimSlot, killerSlot (-1 poison/none), x, y]
  RESPAWN: 6, // [EV.RESPAWN, slot, x, y]
  PICKUP: 7, // [EV.PICKUP, slot, pickKind, count, x, y]
  DROP: 8, // [EV.DROP, pickKind, count, x, y]
  GOAL: 9, // [EV.GOAL, team, scorerSlot]
  TILE: 10, // [EV.TILE, tileIndex, newTile]   (a tile changed: wall broken, box destroyed)
  SUPER_READY: 11, // [EV.SUPER_READY, slot]
  PIN: 12, // [EV.PIN, slot, pinId]   (quick chat; see PINS)
  EMOTE: 13, // [EV.EMOTE, slot, emoteId]
  ROUND: 14, // [EV.ROUND, winnerTeam (-1 draw), round]
  END: 15, // [EV.END]   (sim.result is set)
  SPAWN: 16, // [EV.SPAWN, entityId, kind]   (a shot/area/deploy/pickup appeared; view effects)
  DESPAWN: 17, // [EV.DESPAWN, entityId, kind]
  BALL: 18, // [EV.BALL, what(1 pick, 2 kick, 3 pass, 4 drop), slot]
  STATUS: 19, // [EV.STATUS, slot, what(1 stun, 2 slow, 3 knockback, 4 invisible, 5 shield, 6 speed), t]
  COUNTDOWN: 20, // [EV.COUNTDOWN, team, seconds]   (gem countdown started/stopped: team -1 = stopped)
  POISON: 21, // [EV.POISON, stage]
};

const PINS = ['Attack!', 'Defend!', 'Help!', 'Nice!', 'Thanks!', 'Sorry!', 'Go for gems!', 'Careful!'];
const EMOTES = ['gg', 'happy', 'angry', 'sad', 'thumbs'];

// ---- input word: one 30-bit integer per player per tick (human, bot and remote player alike) ----
// bits 0-7 move angle (256 steps) | 8-10 move magnitude 0..7 (0 = stand still) | 11-20 aim angle
// (1024 steps) | 21-26 aim distance 0..63 (share of the attack's range; lobs land there) |
// 27-28 action 0 none, 1 attack, 2 super, 3 gadget | 29 auto-aim (the sim picks the nearest
// enemy the shooter's team can see; aim fields are ignored).
// The action is an edge: it fires once on the tick it arrives. Angles are world angles (atan2).
const ACT = { NONE: 0, ATTACK: 1, SUPER: 2, GADGET: 3 };
const IN_IDLE = 0;

function packIn(mvA, mvM, aimA, aimD, act, auto) {
  const m = Math.round(clamp(mvM, 0, 1) * 7);
  const ma = m ? Math.round(((mvA % TAU) + TAU) % TAU / TAU * 256) & 255 : 0;
  const aa = Math.round(((aimA % TAU) + TAU) % TAU / TAU * 1024) & 1023;
  const ad = Math.round(clamp(aimD, 0, 1) * 63);
  return (ma | (m << 8) | (aa << 11) | (ad << 21) | ((act & 3) << 27) | ((auto ? 1 : 0) << 29)) >>> 0;
}

// Fills `o` with { mvA, mvM, mx, my, aimA, aimD, ax, ay, act, auto } and returns it.
function unpackIn(w, o) {
  o = o || {};
  const m = (w >>> 8) & 7;
  o.mvM = m / 7;
  o.mvA = (w & 255) / 256 * TAU;
  o.mx = m ? Math.cos(o.mvA) * o.mvM : 0;
  o.my = m ? Math.sin(o.mvA) * o.mvM : 0;
  o.aimA = ((w >>> 11) & 1023) / 1024 * TAU;
  o.aimD = ((w >>> 21) & 63) / 63;
  o.ax = Math.cos(o.aimA);
  o.ay = Math.sin(o.aimA);
  o.act = (w >>> 27) & 3;
  o.auto = (w >>> 29) & 1;
  return o;
}

// Rotates both angles by 180 degrees (the second team plays a view turned upside down).
function flipIn(w) {
  const ma = ((w & 255) + 128) & 255;
  const aa = (((w >>> 11) & 1023) + 512) & 1023;
  return ((w & ~255 & ~(1023 << 11)) | ma | (aa << 11)) >>> 0;
}

const inAct = (w) => (w >>> 27) & 3;
const withAct = (w, act, auto) => ((w & ~(3 << 27) & ~(1 << 29)) | ((act & 3) << 27) | ((auto ? 1 : 0) << 29)) >>> 0;
const noAct = (w) => (w & ~(3 << 27) & ~(1 << 29)) >>> 0;

// ---- rarities & roles (data and UI) ----
const RARITY = {
  start: { name: 'Starting', color: '#9fb4c8' },
  rare: { name: 'Rare', color: '#5bd16a' },
  super: { name: 'Super Rare', color: '#4aa3ff' },
  epic: { name: 'Epic', color: '#c05cff' },
  mythic: { name: 'Mythic', color: '#ff4d6d' },
  legend: { name: 'Legendary', color: '#ffd23f' },
};
const ROLES = {
  fighter: 'Damage Dealer', tank: 'Tank', sharp: 'Marksman', thrower: 'Artillery',
  support: 'Support', assassin: 'Assassin', control: 'Controller',
};
