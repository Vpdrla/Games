// ---------- Brawlers ----------
// Pure data. Every attack, super and gadget is a small "primitive" spec that the sim interprets, so a
// new brawler is a table entry, not new code. Numbers are in the original game's units at power 1
// (health, damage, heal, speed 720/770/820) and are scaled by LEVEL_MULT(lvl) in the sim. Ranges and
// radii are in tiles, projectile speeds in tiles/s, times in seconds, angles in radians.
//
// Primitives (`t`):
//   shot   straight projectiles. n (count), spread (total fan angle), burst (s between projectiles;
//          0 = all at once), jit (sideways barrel offset, alternating), spd, r, range, dmg.
//          Modifiers: pierce, bounce {n, r} (jumps to the nearest other enemy), breaks (walls),
//          kb (knockback tiles, along the shot), slow {T, f}, stun (s), ramp [mulNear, mulFar]
//          (damage over the travelled share of range), split {n, dmg, spd, range, r} (bursts on
//          landing/hit/wall), steal (share of damage healed back), heal (heals allies it passes),
//          hself (heal also the shooter), grow (radius gain per tile travelled), wave {n, spread |
//          width} (a fan / row of parts sharing one hit list), lanes {n, width} (parallel shots, each
//          its own), thru (passes walls; with breaks it tears through them), ricochet + gain (bounces
//          off walls, +gain tiles of range each time), homing (turn rate towards the nearest enemy),
//          healUnit (heals the shooter's own unit it reaches by that share of its damage).
//          With burst > 0 and spread, the burst sweeps across the spread, left to right. ramp may
//          carry a span [mulA, mulB, kA, kB]: flat before kA and after kB (shares of range).
//   lob    thrown over everything, lands after T s (shorter throws land sooner). n, gap (sideways
//          spacing between landing points), spread (fan of landing points), ring (landing points on
//          a circle of that radius), spiral {r0, dr, a0, da} (i-th at radius r0+i*dr, angle
//          a0+i*da from the aim), at:'self' (around the thrower, not at the aim point), burst (s
//          between throws), fuse (bursts that long after the throw), blast (radius), dmg, kb, stun,
//          slow, breaks, area {r, T, dps, hps, slow, nostack, steal} (puddle on landing; ticks
//          every second from the landing; nostack: standing in several hurts once; steal: share
//          of the damage healed back to the thrower).
//   beam   instant segment: range, dmg, w (half width), pierce, chain {n, r, mul}. Clips at walls.
//   arc    instant melee swipe: range, half (half angle), dmg, kb.
//   dash   the brawler rushes dist tiles at spd: dmg to everything it passes (w), inv (untouchable,
//          for invT s if given), fly (over walls and water).
//   leap   jumps to the aim point (range), T flight time, lands with r/dmg/kb/breaks, heal. away:
//          auto-aim jumps away from the nearest enemy (an escape), not onto it.
//   deploy places a unit at the aim point (range): unit 'turret' (shoots shot spec every rate s at
//          the nearest visible enemy within aggro; shot.spread scatters it) or 'pet' (chases enemies
//          within aggro, hits for dmg every rate s at reach, or fires its shot spec from there, else
//          follows its owner) or 'plant' (stands as cover; life s). land {r, dmg} on arrival.
//          hpFrom:'owner' (the owner's health now), dmgTaken (damage multiplier on the unit). A unit
//          with a burst fires it when destroyed or replaced. One per owner.
//   area   a lasting zone at the aim point (at:'aim', range), on the user (at:'self'), or on the
//          user and every ally within teamR (at:'team'). cleanse: allies inside shake off and
//          ignore stuns, slows and burns.
//   pulse  instant ring around the user: r, dmg, heal (allies + self), kb, stun, slow.
//   heal   heals the user by amt.
//   buff   what: 'shield' (f damage blocked for T), 'speed' (+f for T; r = allies in radius too),
//          'invis' (T), 'ammo' (+v bars), 'nextStun' (next attack stuns v s), 'nextSlow' (next
//          puddle slows by v), 'petStun' (pet's next hit stuns v s), 'deployRate' (unit fires v times
//          faster for T).
// Any primitive may carry `then: [primitive, ...]`, run right after it with the same aim, `delay`
// (s before it happens) and `repeat {n, every}` (happens n times, every s apart).
// `chg` on a main attack (or its split/area/pet) = share of the super gained per enemy brawler hit
// (gchg: a gadget shot that charges the super too).
// Gadgets: 3 uses per match, `cd` s apart; `req: 'deploy'` needs the brawler's unit on the field
// (within reqR tiles if given); needTarget: only with an enemy within range; ammo: uses that many
// ammo bars. `ammo` on a brawler: its ammo bars (3 if not given).
// Star powers: `patch` replaces fields of atk/sup specs; `pass` holds passive effects the sim reads:
//   petHeal (owner heals when the pet hits), atkHeal (heal per attack fired), deployHeal (the unit
//   heals when the main attack hits), ammoOnHit, killHeal, moveReload (+share of reload while
//   moving), invisHeal (per second while invisible), dynaJump / dynaJumpSup (tiles flung by his
//   own main attack / super blast).

// Each brawler copies one from the original game, with its numbers at power 1 as of the September
// 2026 balance update, checked against the Brawl Stars Fandom wiki's brawler pages and their
// balance history (October 2026): health, movement speed (750 normal, 800 fast, 855 very fast
// since every brawler got faster that month), damage, range, reload, projectile speed (units/s
// over 300) and width, super charge per hit (chg), gadgets with their cooldowns and star powers.
// The names are our own. Original:   nova Shelly, dax Colt, brick El Primo, bramble Nita, pip Dynamike, melody Poco,
// sizzle Barley, gizmo Jessie, volt Rico, hawk Piper, frost Gale, shade Mortis, zip Max, specter
// Leon, thorn Spike. Not copied: hypercharges and a few gadgets / star powers that need systems we
// don't have (Spring Ejector, Sneaky Sneakers, Lollipop Drop, Curveball, the Buffies).
const BRAWLERS = {
  nova: {
    name: 'Nova', rarity: 'start', role: 'fighter', color: '#e8574a',
    desc: 'A scrappy shotgunner who wins every fight up close.',
    hp: 3900, speed: 800, reload: 1.5,
    atk: {
      name: 'Scattershot', text: 'Fires 5 shells in a 27° cone. Brutal up close.',
      t: 'shot', n: 5, spread: 0.471, dmg: 300, range: 7.67, spd: 10.33, r: 0.18, chg: 0.1005,
    },
    sup: {
      name: 'Big Bang', text: 'A wide blast of 9 shells that knocks enemies back and smashes walls.',
      t: 'shot', n: 9, spread: 0.785, dmg: 320, range: 7.67, spd: 13.77, r: 0.22, kb: 1.6, breaks: true,
    },
    gadgets: [
      { name: 'Quick Step', text: 'Dashes 2.67 tiles and fully reloads.', cd: 16, t: 'dash', dist: 2.67, spd: 8, then: [{ t: 'buff', what: 'ammo', v: 3 }] },
      { name: 'Choke', text: 'The next 3 attacks are twice as narrow, fly faster and reach 10 tiles.', cd: 18, t: 'buff', what: 'nextAtk', n: 3, patch: { spread: 0.236, range: 10, spd: 14.33, chg: 0.075 } },
    ],
    stars: [
      { name: 'Sticky Shells', text: 'Big Bang slows enemies by 55% for 2 seconds.', patch: { sup: { slow: { T: 2, f: 0.55 } } } },
      { name: 'Patch Up', text: 'Dropping below 40% health heals 30% of max health. Recharges in 15 s.', pass: { lowHeal: { at: 0.4, f: 0.3, cd: 15 } } },
    ],
  },
  dax: {
    name: 'Dax', rarity: 'rare', role: 'sharp', color: '#d9a441',
    desc: 'A quick-draw gunslinger who melts anything in a straight line.',
    hp: 3100, speed: 750, reload: 1.3,
    atk: {
      name: 'Six-Shooter', text: 'Fires 6 bullets in two streams from both revolvers.',
      t: 'shot', n: 6, burst: 0.133, jit: 0.165, dmg: 360, range: 9, spd: 13.33, r: 0.165, chg: 0.0835,
    },
    sup: {
      name: 'Bullet Storm', text: 'A long burst of 12 big bullets that pierce enemies; each destroys the wall it hits.',
      t: 'shot', n: 12, burst: 0.117, jit: 0.165, dmg: 320, range: 11, spd: 16.3, r: 0.335, pierce: true, breaks: true,
    },
    gadgets: [
      { name: 'Speedloader', text: 'Fires 2 quick long-range shots that slow enemies for half a second.', cd: 15, t: 'shot', n: 2, burst: 0.1, jit: 0.165, dmg: 320, range: 11, spd: 16.3, r: 0.165, slow: { T: 0.5, f: 0.3 } },
      { name: 'Silver Bullet', text: 'Uses an ammo bar: one big bullet that pierces enemies and tears through walls.', cd: 17, t: 'shot', ammo: 1, dmg: 601, range: 11, spd: 12.68, r: 0.2, pierce: true, breaks: true, thru: true, chg: 0.0835, gchg: true },
    ],
    stars: [
      { name: 'Slick Boots', text: 'Moves 13% faster.', pass: { speedMul: 0.13 } },
      { name: 'Long Barrel', text: 'Six-Shooter reaches 1 tile further and its bullets fly 11% faster.', patch: { atk: { range: 10, spd: 14.8 } } },
    ],
  },
  brick: {
    name: 'Brick', rarity: 'rare', role: 'tank', color: '#3f8fd8',
    desc: 'A wrestler with a mountain of health and fists of stone.',
    hp: 6500, speed: 800, reload: 0.8,
    atk: {
      name: 'Fist Flurry', text: 'Throws 4 piercing punches that grow as they fly.',
      t: 'shot', n: 4, burst: 0.2125, jit: 0.25, dmg: 380, range: 3, spd: 10.87, r: 0.265, grow: 0.133, pierce: true, chg: 0.095,
    },
    sup: {
      name: 'Big Drop', text: 'Leaps to a spot (5.3 tiles a second, untouchable) and slams down, knocking enemies back and breaking walls.',
      t: 'leap', range: 9, lspd: 5.33, r: 1.7, dmg: 960, kb: 2.6, breaks: true,
    },
    gadgets: [
      { name: 'Body Slam', text: 'Dashes 2.67 tiles and throws everyone he runs into 2 tiles behind him.', cd: 15, t: 'dash', dist: 2.67, spd: 12, w: 0.5, throwBack: 2 },
      { name: 'Iron Hide', text: 'For 1 second, enemy projectiles that reach him are destroyed.', cd: 20, t: 'buff', what: 'block', T: 1 },
    ],
    stars: [
      { name: 'Hot Landing', text: 'Enemies hit by Big Drop burn for 900 over 4 seconds.', patch: { sup: { burn: { dmg: 900, T: 4 } } } },
      { name: 'Second Wind', text: 'Moves 25% faster for 3 seconds after landing Big Drop.', patch: { sup: { onLand: { t: 'buff', what: 'speed', f: 0.25, T: 3 } } } },
    ],
  },
  bramble: {
    name: 'Bramble', rarity: 'rare', role: 'fighter', color: '#8a5a3a',
    desc: 'A forest kid who never fights alone: her bear has her back.',
    hp: 4200, speed: 750, reload: 1.1,
    atk: {
      name: 'Root Wave', text: 'A 1.67-tile wide shockwave that pierces through every enemy in its path.',
      t: 'shot', dmg: 960, range: 6, spd: 9.06, r: 0.25, wave: { n: 3, width: 1.2 }, pierce: true, chg: 0.209,
    },
    sup: {
      name: 'Big Bruno', text: 'Summons Bruno the bear, who chases and mauls nearby enemies.',
      t: 'deploy', unit: 'pet', dk: 'bramble.bear', range: 5, rad: 0.55, hp: 4300, dmg: 400, rate: 0.6, reach: 2,
      spd: 2.03, aggro: 8, chg: 0.1,
    },
    gadgets: [
      { name: 'Heavy Paws', text: 'After 1 second, Bruno stuns enemies within 3.33 tiles for 0.5 seconds.', cd: 13, req: 'deploy', reqR: 12, t: 'pulse', at: 'unit', delay: 1, r: 3.33, stun: 0.5 },
      { name: 'Thick Fur', text: 'Bruno blocks 35% of damage for 3 seconds.', cd: 14, req: 'deploy', reqR: 12, t: 'buff', what: 'unitShield', f: 0.35, T: 3 },
    ],
    stars: [
      { name: 'Best Buddies', text: 'Bramble heals 546 when Bruno lands a hit, and Bruno heals 546 when she does.', pass: { petHeal: 546, deployHeal: 546 } },
      { name: 'Angry Bruno', text: "Bruno swipes 60% more often.", patch: { sup: { rate: 0.24 } } },
    ],
  },
  pip: {
    name: 'Pip', rarity: 'super', role: 'thrower', color: '#ff8a3d',
    desc: 'A cheerful demolition miner who lobs dynamite over walls.',
    hp: 3000, speed: 800, reload: 1.4,
    atk: {
      name: 'Fuse Pair', text: 'Lobs 2 sticks of dynamite over walls. They lie on the ground and blow up 1 second after the throw.',
      t: 'lob', n: 2, gap: 0.7, T: 0.7, fuse: 1.0, range: 7.33, dmg: 800, blast: 1.5, r: 0.18, chg: 0.125,
    },
    sup: {
      name: 'Big Barrel', text: 'A huge barrel bomb that blows up 1.3 seconds after the throw, knocking enemies back and destroying walls.',
      t: 'lob', T: 0.9, fuse: 1.3, range: 7.33, dmg: 2200, blast: 2.67, kb: 3, breaks: true, r: 0.35,
    },
    gadgets: [
      { name: 'Spin Cycle', text: 'Spins 20% faster for 2 seconds, tossing 20 sticks in a widening spiral (75% stronger). No attacks meanwhile.', cd: 12, t: 'buff', what: 'speed', f: 0.2, T: 2,
        then: [{ t: 'lob', at: 'self', n: 20, burst: 0.1, spiral: { r0: 2.33, dr: 0.333, a0: 1.571, da: 1.745 }, T: 0.6, fuse: 1.0, dmg: 1400, blast: 1.5, r: 0.18 }] },
      { name: 'Short Fuse', text: 'The next attack stuns enemies for 1.5 seconds.', cd: 23, t: 'buff', what: 'nextStun', v: 1.5 },
    ],
    stars: [
      { name: 'Rocket Boots', text: 'Caught in his own blast, Pip is flung away from it: 3 tiles by a stick, 5 by Big Barrel.', pass: { dynaJump: 3, dynaJumpSup: 5 } },
      { name: 'Boom Boost', text: 'Big Barrel deals 800 extra damage.', patch: { sup: { dmg: 3000 } } },
    ],
  },
  melody: {
    name: 'Melody', rarity: 'rare', role: 'support', color: '#e45bb0',
    desc: 'A street musician whose songs hurt foes and mend friends.',
    hp: 4000, speed: 750, reload: 1.6,
    atk: {
      name: 'Sonic Chord', text: 'A 65° sound wave that pierces enemies and heals allies for 200.',
      t: 'shot', dmg: 760, heal: 200, range: 7, spd: 8.33, r: 0.35, wave: { n: 11, spread: 1.134 }, pierce: true, chg: 0.25,
    },
    sup: {
      name: 'Encore', text: 'A 65° wave that passes through walls and heals Melody and every ally it reaches for 2100.',
      t: 'shot', dmg: 0, heal: 2100, hself: true, range: 9.33, spd: 16.67, r: 0.35, wave: { n: 13, spread: 1.134 }, pierce: true, thru: true,
    },
    gadgets: [
      { name: 'Lullaby', text: 'Three waves, 2 seconds apart, each healing Melody and nearby allies for 700.', cd: 20, t: 'pulse', r: 3.33, heal: 700, repeat: { n: 3, every: 2 } },
      { name: 'Steady Beat', text: 'Throws a note: for 4 seconds, allies in its 3.33-tile circle shake off and ignore stuns, slows and burns.', cd: 24, t: 'area', at: 'aim', range: 6, r: 3.33, T: 4, cleanse: true, ak: 'melody.gad' },
    ],
    stars: [
      { name: 'Harmony', text: 'Sonic Chord heals allies for 400 more.', patch: { atk: { heal: 600 } } },
      { name: 'Feedback', text: 'Encore also hits enemies for 760.', patch: { sup: { dmg: 760 } } },
    ],
  },
  sizzle: {
    name: 'Sizzle', rarity: 'rare', role: 'thrower', color: '#ff5a1f',
    desc: 'A food-truck chef who throws bottles of blazing sauce.',
    hp: 2700, speed: 750, reload: 2.0,
    atk: {
      name: 'Hot Sauce', text: 'Lobs a bottle that leaves a puddle burning 800 a second.',
      t: 'lob', T: 0.95, range: 7.33, r: 0.2, dmg: 0, area: { r: 2, T: 1.9, dps: 800 }, chg: 0.18,
    },
    sup: {
      name: 'Last Call', text: 'Throws 5 bottles in a fan, 0.2 s apart, setting a whole area ablaze (standing in several burns once).',
      t: 'lob', n: 5, burst: 0.2, spread: 0.55, T: 1.0, range: 9.33, r: 0.2, dmg: 0, area: { r: 1.15, T: 3.9, dps: 800, nostack: true },
    },
    gadgets: [
      { name: 'Syrup', text: 'Drops a big sticky puddle that slows enemies by half for 4 seconds.', cd: 18, t: 'area', at: 'self', r: 3.33, T: 4, slow: 0.53 },
      { name: 'House Special', text: 'Drops a soothing puddle under Sizzle and every ally within 10 tiles, healing 405 a second for 4.5 seconds.', cd: 17, t: 'area', at: 'team', teamR: 10, r: 2.67, T: 4.5, hps: 405, nostack: true, ak: 'melody.gad' },
    ],
    stars: [
      { name: 'Taste Test', text: 'Heals Sizzle for 10% of her health (270) with every attack.', pass: { atkHeal: 270 } },
      { name: 'Extra Spicy', text: 'Hot Sauce burns 200 more a second (at power 9).', patch: { atk: { area: { r: 2, T: 1.9, dps: 911 } } } },
    ],
  },
  gizmo: {
    name: 'Gizmo', rarity: 'super', role: 'support', color: '#3fc3b5',
    desc: 'A young inventor whose sparks bounce and whose turret never sleeps.',
    hp: 3300, speed: 750, reload: 1.8,
    atk: {
      name: 'Spark Orb', text: 'An orb that bounces on to 2 more nearby enemies, 25% softer each time.',
      t: 'shot', dmg: 1060, range: 9, spd: 10.17, r: 0.5, bounce: { n: 2, r: 6.67, mul: 0.75, spd: 5.07 }, chg: 0.167,
    },
    sup: {
      name: 'Turret', text: 'Builds a turret that rapidly shoots the nearest enemy within 9 tiles.',
      t: 'deploy', unit: 'turret', dk: 'gizmo.turret', range: 5, rad: 0.5, hp: 3600, aggro: 9, rate: 0.3,
      shot: { pk: 'gizmo.turret', dmg: 300, range: 9, spd: 11.6, r: 0.13, spread: 0.262 },
    },
    gadgets: [
      { name: 'Static Field', text: 'The turret slows enemies within 4.33 tiles for 3 seconds.', cd: 15, req: 'deploy', reqR: 12, t: 'pulse', at: 'unit', r: 4.33, slow: { T: 3, f: 0.47 } },
      { name: 'Overclock', text: 'The turret fires twice as fast for 5 seconds.', cd: 11, req: 'deploy', reqR: 12, t: 'buff', what: 'deployRate', v: 2, T: 5 },
    ],
    stars: [
      { name: 'Repair Kit', text: 'Shooting the turret with Spark Orb repairs it by half the orb\'s damage, then the orb bounces on.', patch: { atk: { healUnit: 0.5 } } },
      { name: 'Chain Sparks', text: "The turret's shots bounce on to 2 more enemies within 4.67 tiles.", patch: { sup: { shot: { pk: 'gizmo.turret', dmg: 300, range: 9, spd: 11.6, r: 0.13, spread: 0.262, bounce: { n: 2, r: 4.67, mul: 0.75, spd: 6.73 } } } } },
    ],
  },
  volt: {
    name: 'Volt', rarity: 'super', role: 'sharp', color: '#ffd23f',
    desc: 'A storm-chasing robot whose bolts ricochet off every wall.',
    hp: 3000, speed: 750, reload: 1.1,
    atk: {
      name: 'Ricochet Bolts', text: 'A burst of 5 bolts that bounce off walls, gaining 1.67 tiles of range per bounce.',
      t: 'shot', n: 5, burst: 0.1, spread: 0.118, dmg: 300, range: 9.67, spd: 11.59, r: 0.335, ricochet: true, gain: 1.67, chg: 0.0625,
    },
    sup: {
      name: 'Thunder Spray', text: 'A long burst of 12 bolts that pierce enemies and bounce off walls.',
      t: 'shot', n: 12, burst: 0.104, spread: 0.157, dmg: 360, range: 13.33, spd: 16.3, r: 0.335, pierce: true, ricochet: true, gain: 1.67,
    },
    gadgets: [
      { name: 'Bolt Box', text: 'Places a box with 2000 health that gives cover; destroyed or replaced, it blasts 8 piercing bouncing bolts.', cd: 22, t: 'deploy', unit: 'plant', dk: 'volt.box', range: 7.33, rad: 0.45, hp: 2000,
        burst: { n: 8, shot: { pk: 'volt.sup', dmg: 400, range: 11.67, spd: 16.3, r: 0.335, pierce: true, ricochet: true, gain: 1.67 } } },
      { name: 'Split Bolt', text: 'A big bolt that splits into 3 when it hits an enemy or a wall; every part hits as hard as 3 bolts.', cd: 17, t: 'shot', dmg: 900, range: 9.67, spd: 12, r: 0.335, pk: 'volt.sup',
        split: { n: 3, dmg: 900, range: 4, spd: 12, r: 0.2, ricochet: true, pk: 'volt.atk' } },
    ],
    stars: [
      { name: 'Overcharge', text: 'Bolts that have bounced deal 120 more damage.', patch: { atk: { bounceDmg: 120 }, sup: { bounceDmg: 120 } } },
      { name: 'Escape Mode', text: 'Moves 35% faster below 40% health.', pass: { lowSpeed: { at: 0.4, f: 0.35 } } },
    ],
  },
  hawk: {
    name: 'Hawk', rarity: 'epic', role: 'sharp', color: '#7b6cf6',
    desc: 'An elegant sharpshooter: the further the target, the harder it hits.',
    hp: 2800, speed: 750, reload: 2.3,
    atk: {
      name: 'Long Shot', text: 'A single bullet: 360 damage up close, rising to 1800 over the last 15% of its range.',
      t: 'shot', dmg: 1800, ramp: [0.2, 1, 0, 0.85], range: 10, spd: 13.33, r: 0.335, chg: 0.1765,
    },
    sup: {
      name: 'Pop-Up', text: 'Leaps away for 2 seconds, untouchable, dropping 4 grenades where she took off.',
      t: 'leap', range: 8.67, T: 2, away: true,
      then: [{ t: 'lob', at: 'self', n: 4, ring: 0.9, T: 0.5, fuse: 0.8, dmg: 900, blast: 2, r: 0.2, breaks: true }],
    },
    gadgets: [
      { name: 'Back Off', text: 'Only with an enemy within 7 tiles: fires at the nearest one, knocking them back.', cd: 18, t: 'shot', seek: true, needTarget: true, dmg: 90, range: 7, spd: 15, r: 0.15, kb: 2.5 },
      { name: 'Scope', text: 'The next attack homes in on enemies, reaches 11.67 tiles and does at least 25% damage.', cd: 18, t: 'buff', what: 'nextAtk', n: 1, patch: { range: 11.67, homing: 3, ramp: [0.25, 1, 0, 0.85] } },
    ],
    stars: [
      { name: 'Hidden Shot', text: 'From a bush, Long Shot deals up to 630 more at full range.', patch: { atk: { ambush: 630 } } },
      { name: 'Quick Hands', text: 'Hitting an enemy refunds 0.4 of an ammo bar.', pass: { ammoOnHit: 0.4 } },
    ],
  },
  frost: {
    name: 'Frost', rarity: 'epic', role: 'control', color: '#7fd6ff',
    desc: 'A grumpy snow-cone vendor who blows enemies away.',
    hp: 4000, speed: 750, reload: 1.2,
    atk: {
      name: 'Snow Flurry', text: 'Throws 6 snowballs in a wide fan.',
      t: 'shot', n: 6, spread: 0.524, dmg: 300, range: 8.33, spd: 10.67, r: 0.17, chg: 0.0675,
    },
    sup: {
      name: 'Gale Wall', text: 'A 4-tile wide gust that passes through walls and carries enemies away (up to 8.33 tiles).',
      t: 'shot', dmg: 800, range: 10, spd: 15, r: 0.3, wave: { n: 9, width: 3.4 }, pierce: true, thru: true, carry: 8.33,
    },
    gadgets: [
      { name: 'Whirlwind', text: 'A twister, 2 tiles round, that shoves enemies away for 5 seconds.', cd: 21, t: 'area', at: 'aim', range: 6, r: 2, T: 5, push: 3 },
    ],
    stars: [
      { name: 'Hard Gust', text: 'Enemies Gale Wall pushes into a wall are stunned for 1.25 seconds.', patch: { sup: { wallStun: 1.25 } } },
      { name: 'Frostbite', text: 'Snowballs slow enemies for half a second.', patch: { atk: { slow: { T: 0.5, f: 0.3 } } } },
    ],
  },
  shade: {
    name: 'Shade', rarity: 'mythic', role: 'assassin', color: '#6b3fa0',
    desc: 'A gloomy undertaker who dashes in for the finishing blow.',
    hp: 4000, speed: 855, reload: 2.4,
    atk: {
      name: 'Night Lunge', text: 'Dashes 2.67 tiles, striking every enemy in the way. After 4.5 s without attacking it reaches 4.67.',
      t: 'dash', dist: 2.67, spd: 9, dmg: 1000, w: 0.5, chg: 0.2125, long: { dist: 4.67, T: 4.5 },
    },
    sup: {
      name: 'Soul Swarm', text: 'A 2.67-tile wide swarm of bats that flies through walls; each enemy brawler it hits heals Shade for the full damage.',
      t: 'shot', dmg: 900, range: 10, spd: 10, r: 0.92, pierce: true, thru: true, steal: 1, stealFull: true,
    },
    gadgets: [
      { name: 'Whirl', text: 'Spins his shovel, hitting every enemy within 2.67 tiles for 1000.', cd: 18, t: 'pulse', r: 2.67, dmg: 1000 },
      { name: 'Bat Form', text: 'Turns into bats and flies 5 tiles over walls and water, untouchable, hitting enemies on the way.', cd: 24, t: 'dash', dist: 5, spd: 14, dmg: 700, w: 0.6, inv: true, fly: true },
    ],
    stars: [
      { name: 'Feast', text: 'Taking down an enemy heals 20% of max health.', pass: { killHealF: 0.2 } },
      { name: 'Coiled', text: 'The long lunge is ready 2 seconds sooner.', pass: { dashCharge: 2 } },
    ],
  },
  zip: {
    name: 'Zip', rarity: 'mythic', role: 'fighter', color: '#ffcc33',
    desc: 'A hyperactive speedster who never stops moving or shooting.',
    hp: 3500, speed: 855, reload: 1.3, ammo: 4,
    atk: {
      name: 'Rapid Fire', text: 'Fires 4 fast bullets in a quick sweeping burst. Zip has 4 ammo bars.',
      t: 'shot', n: 4, burst: 0.1075, spread: 0.236, dmg: 320, range: 8.33, spd: 13.33, r: 0.13, chg: 1 / 18,
    },
    sup: {
      name: 'Rush Hour', text: 'Zip and allies within 4 tiles move 300 speed points faster for 4 seconds.',
      t: 'buff', what: 'speed', pts: 300, T: 4, r: 4,
    },
    gadgets: [{ name: 'Blink', text: 'Dashes 3.33 tiles and can\'t be hurt for half a second.', cd: 18, t: 'dash', dist: 3.33, spd: 18, inv: true, invT: 0.5 }],
    stars: [
      { name: 'Overdrive', text: 'Each hit during Rush Hour makes it last 0.25 s longer.', pass: { supExtend: 0.25 } },
      { name: 'Run and Gun', text: 'Reloads about 15% faster while moving.', pass: { moveReload: 0.1538 } },
    ],
  },
  specter: {
    name: 'Specter', rarity: 'legend', role: 'assassin', color: '#4fd18b',
    desc: 'A sly phantom who vanishes, then strikes from nowhere.',
    hp: 3300, speed: 855, reload: 1.9,
    atk: {
      name: 'Spectral Blades', text: '4 blades swept left to right: 480 damage over the first 15% of their range, down to 168 at full range.',
      t: 'shot', n: 4, burst: 0.0875, spread: 0.305, dmg: 480, ramp: [1, 0.35, 0.15, 1], range: 9.67, spd: 11.67, r: 0.14, chg: 0.12625,
    },
    sup: {
      name: 'Fade', text: 'Turns invisible for 6 seconds: only enemies within 4 tiles see him. Attacking ends it.',
      t: 'buff', what: 'invis', T: 6,
    },
    gadgets: [
      { name: 'Double', text: 'Sends out a copy of himself with his current health (it takes double damage) that hunts and shoots enemies for 10 seconds.', cd: 13, t: 'deploy', unit: 'pet', dk: 'specter', range: 1.5, rad: 0.42, hp: 1650, hpFrom: 'owner', dmgTaken: 2, rate: 1.0,
        reach: 8.33, spd: 2.85, aggro: 10, life: 10, shot: { pk: 'specter.atk', dmg: 320, range: 8.33, spd: 11.67, r: 0.14 } },
    ],
    stars: [
      { name: 'Shadow Step', text: 'Moves 30% faster while invisible.', pass: { invisSpeed: 0.3 } },
      { name: 'Hidden Mend', text: 'Heals 660 per second while invisible.', pass: { invisHeal: 660 } },
    ],
  },
  thorn: {
    name: 'Thorn', rarity: 'legend', role: 'sharp', color: '#6fcf3f',
    desc: 'A silent cactus whose needle balls burst into spikes.',
    hp: 3000, speed: 750, reload: 2.0,
    atk: {
      name: 'Needle Ball', text: 'A cactus ball that bursts when it hits or stops: 540 to everyone within 1 tile, and 6 spikes flying 4.33 tiles.',
      t: 'shot', dmg: 540, range: 7.67, spd: 7.25, r: 0.5, chg: 0.13,
      split: { n: 6, dmg: 540, range: 4.33, spd: 10.87, r: 0.165, chg: 0.13, pk: 'thorn.spike', fixed: true, blast: 1 },
    },
    sup: {
      name: 'Briar Patch', text: 'Lobs a spike field that burns 400 a second and slows enemies.',
      t: 'lob', T: 1.0, range: 7.67, r: 0.3, dmg: 0, area: { r: 2.67, T: 4.5, dps: 400, slow: 0.53 },
    },
    gadgets: [
      { name: 'Pincushion', text: 'Fires a row of 5 needles: 300 damage up close, 500 at full range.', cd: 17, t: 'shot', lanes: { n: 5, width: 1.6 }, dmg: 500, ramp: [0.6, 1], range: 7.67, spd: 10.87, r: 0.165, pk: 'thorn.spike' },
      { name: 'Sap', text: 'Throws a cactus with 1750 health that gives cover; when it breaks or is replaced, allies within 3.33 tiles heal 900.', cd: 20, t: 'deploy', unit: 'plant', dk: 'thorn', range: 7.33, rad: 0.5, hp: 1750,
        burst: { r: 3.33, heal: 900 } },
    ],
    stars: [{ name: 'Green Thumb', text: 'Briar Patch heals Thorn for 75% of the damage it deals.', patch: { sup: { area: { r: 2.67, T: 4.5, dps: 400, slow: 0.53, steal: 0.75 } } } }],
  },
};

const BRAWLER_KEYS = ['nova', 'dax', 'brick', 'bramble', 'pip', 'melody', 'sizzle', 'gizmo', 'volt', 'hawk', 'frost', 'shade', 'zip', 'specter', 'thorn'];

// The kit a brawler fights with: atk/sup with the chosen star power patched in, the gadget, and
// passive effects. Cached because every Sim builds one per slot.
const brawlerKitCache = {};
function brawlerKit(bk, star, gadget) {
  const key = bk + ':' + star + ':' + gadget;
  if (brawlerKitCache[key]) return brawlerKitCache[key];
  const D = BRAWLERS[bk];
  if (!D) throw new Error('Unknown brawler ' + bk);
  const sp = star >= 0 ? D.stars[star] : null;
  const patch = (sp && sp.patch) || {};
  const kit = {
    bk, D, hp: D.hp, speed: U(D.speed), reload: D.reload, ammo: D.ammo || MAX_AMMO,
    atk: Object.assign({}, D.atk, patch.atk || {}),
    sup: Object.assign({}, D.sup, patch.sup || {}),
    gad: gadget >= 0 ? D.gadgets[gadget] || null : null,
    pass: (sp && sp.pass) || {},
  };
  // a gadget that changes the next few main attacks (Choke, Scope): the attack it turns into
  kit.nxAtk = kit.gad && kit.gad.what === 'nextAtk' ? Object.assign({}, kit.atk, kit.gad.patch) : null;
  brawlerKitCache[key] = kit;
  return kit;
}

// Numbers for the brawler info screen, scaled to a power level.
function brawlerStats(bk, lvl) {
  const D = BRAWLERS[bk], m = LEVEL_MULT(lvl || 1), a = D.atk;
  const range = a.range || a.dist || 0;
  return {
    hp: Math.round(D.hp * m),
    dmg: Math.round((a.dmg || (a.area ? a.area.dps : 0)) * m),
    n: a.n || 1,
    range,
    // the original's classes (e.g. Colt 9 Long, Rico 9.67 Very long; Colt 1.3 s Very fast, Piper 2.3 Very slow)
    rangeName: range < 4 ? 'Short' : range < 6.67 ? 'Normal' : range < 9.5 ? 'Long' : 'Very long',
    reload: D.reload,
    reloadName: D.reload <= 1.3 ? 'Very fast' : D.reload <= 1.45 ? 'Fast' : D.reload <= 1.8 ? 'Normal' : D.reload < 2.3 ? 'Slow' : 'Very slow',
    speed: D.speed,
    speedName: D.speed >= 855 ? 'Very fast' : D.speed >= 800 ? 'Fast' : 'Normal',
    supDmg: Math.round((D.sup.dmg || D.sup.heal || (D.sup.area ? D.sup.area.dps : 0) || D.sup.dps || (D.sup.shot ? D.sup.shot.dmg : 0) || 0) * m),
  };
}
