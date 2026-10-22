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
//          hself (heal also the shooter), grow (radius gain per tile travelled).
//   lob    thrown over everything, lands after T s (shorter throws land sooner). n, gap (sideways
//          spacing between landing points), spread (fan of landing points), ring (landing points on
//          a circle of that radius), at:'self' (around the thrower, not at the aim point), blast
//          (radius), dmg, kb, stun, slow, breaks, area {r, T, dps, hps, slow} (puddle on landing).
//   beam   instant segment: range, dmg, w (half width), pierce, chain {n, r, mul}. Clips at walls.
//   arc    instant melee swipe: range, half (half angle), dmg, kb.
//   dash   the brawler rushes dist tiles at spd: dmg to everything it passes (w), inv (untouchable).
//   leap   jumps to the aim point (range), T flight time, lands with r/dmg/kb/breaks, heal. away:
//          auto-aim jumps away from the nearest enemy (an escape), not onto it.
//   deploy places a unit at the aim point (range): unit 'turret' (shoots shot spec every rate s at
//          the nearest visible enemy within aggro) or 'pet' (chases enemies within aggro, hits for
//          dmg every rate s at reach, else follows its owner). land {r, dmg} on arrival. One per owner.
//   area   a lasting zone at the aim point (at:'aim', range) or on the user (at:'self').
//   pulse  instant ring around the user: r, dmg, heal (allies + self), kb, stun, slow.
//   heal   heals the user by amt.
//   buff   what: 'shield' (f damage blocked for T), 'speed' (+f for T; r = allies in radius too),
//          'invis' (T), 'ammo' (+v bars), 'nextStun' (next attack stuns v s), 'nextSlow' (next
//          puddle slows by v), 'petStun' (pet's next hit stuns v s), 'deployRate' (unit fires v times
//          faster for T).
// Any primitive may carry `then: [primitive, ...]`, run right after it with the same aim.
// `chg` on a main attack (or its split/area/pet) = share of the super gained per enemy brawler hit.
// Gadgets: 3 uses per match, `cd` s apart; `req: 'deploy'` needs the brawler's unit on the field.
// Star powers: `patch` replaces fields of atk/sup specs; `pass` holds passive effects the sim reads:
//   petHeal (owner heals when the pet hits), atkHeal (heal per attack fired), deployHeal (the unit
//   heals when the main attack hits), ammoOnHit, killHeal, moveReload (+share of reload while
//   moving), invisHeal (per second while invisible), fieldHeal (per second in own lasting zone).

const BRAWLERS = {
  nova: {
    name: 'Nova', rarity: 'start', role: 'fighter', color: '#e8574a',
    desc: 'A scrappy shotgunner who wins every fight up close.',
    hp: 3600, speed: 720, reload: 1.5,
    atk: {
      name: 'Scattershot', text: 'Fires 5 pellets in a cone. Brutal up close.',
      t: 'shot', n: 5, spread: 0.52, dmg: 300, range: 7.67, spd: 11.3, r: 0.18, chg: 1 / 12,
    },
    sup: {
      name: 'Big Bang', text: 'A wide blast of 9 pellets that knocks enemies back and smashes walls.',
      t: 'shot', n: 9, spread: 0.62, dmg: 320, range: 7.67, spd: 11.3, r: 0.22, kb: 1.6, breaks: true,
    },
    gadgets: [{ name: 'Quick Step', text: 'Dashes 2.5 tiles in the aimed direction.', cd: 5, t: 'dash', dist: 2.5, spd: 14 }],
    stars: [{ name: 'Sticky Shells', text: 'Big Bang pellets slow enemies for 2.5 seconds.', patch: { sup: { slow: { T: 2.5, f: 0.35 } } } }],
  },
  dax: {
    name: 'Dax', rarity: 'rare', role: 'sharp', color: '#d9a441',
    desc: 'A quick-draw gunslinger who melts anything in a straight line.',
    hp: 2800, speed: 720, reload: 1.6,
    atk: {
      name: 'Six-Shooter', text: 'Fires 6 bullets in a fast line from both revolvers.',
      t: 'shot', n: 6, burst: 0.08, jit: 0.15, dmg: 360, range: 9, spd: 12.7, r: 0.14, chg: 1 / 12,
    },
    sup: {
      name: 'Bullet Storm', text: 'A long burst of 12 bullets that pierce enemies and tear through walls.',
      t: 'shot', n: 12, burst: 0.06, jit: 0.15, dmg: 360, range: 11, spd: 14, r: 0.16, pierce: true, breaks: true,
    },
    gadgets: [{ name: 'Speedloader', text: 'Instantly reloads 2 ammo.', cd: 6, t: 'buff', what: 'ammo', v: 2 }],
    stars: [{ name: 'Long Barrel', text: 'Six-Shooter reaches 1.3 tiles further.', patch: { atk: { range: 10.3 } } }],
  },
  brick: {
    name: 'Brick', rarity: 'rare', role: 'tank', color: '#3f8fd8',
    desc: 'A wrestler with a mountain of health and fists of stone.',
    hp: 6000, speed: 770, reload: 1.2,
    atk: {
      name: 'Fist Flurry', text: 'Throws 4 quick punches at short range.',
      t: 'shot', n: 4, burst: 0.07, jit: 0.25, dmg: 380, range: 3, spd: 12, r: 0.3, chg: 1 / 10,
    },
    sup: {
      name: 'Big Drop', text: 'Leaps to a spot and slams down, damaging enemies and breaking walls.',
      t: 'leap', range: 9, r: 1.7, dmg: 800, breaks: true,
    },
    gadgets: [{ name: 'Iron Hide', text: 'Blocks half of all damage for 3 seconds.', cd: 7, t: 'buff', what: 'shield', T: 3, f: 0.5 }],
    stars: [{ name: 'Second Wind', text: 'Big Drop heals Brick for 1200 on landing.', patch: { sup: { heal: 1200 } } }],
  },
  bramble: {
    name: 'Bramble', rarity: 'rare', role: 'fighter', color: '#8a5a3a',
    desc: 'A forest kid who never fights alone: her bear has her back.',
    hp: 4000, speed: 720, reload: 1.1,
    atk: {
      name: 'Root Wave', text: 'A shockwave that pierces through every enemy in its path.',
      t: 'shot', dmg: 920, range: 6.3, spd: 7.7, r: 0.5, pierce: true, chg: 1 / 3,
    },
    sup: {
      name: 'Big Bruno', text: 'Summons Bruno the bear, who mauls nearby enemies.',
      t: 'deploy', unit: 'pet', dk: 'bramble.bear', range: 7, rad: 0.55, hp: 4000, dmg: 400, rate: 1.0, reach: 1.15,
      spd: 2.9, aggro: 8, chg: 1 / 6, land: { r: 1.3, dmg: 800 },
    },
    gadgets: [{ name: 'Heavy Paws', text: "Bruno's next hit stuns for 1 second.", cd: 6, req: 'deploy', t: 'buff', what: 'petStun', v: 1.0 }],
    stars: [{ name: 'Best Buddies', text: 'Bramble heals 500 whenever Bruno lands a hit.', pass: { petHeal: 500 } }],
  },
  pip: {
    name: 'Pip', rarity: 'rare', role: 'thrower', color: '#ff8a3d',
    desc: 'A cheerful demolition miner who lobs dynamite over walls.',
    hp: 2800, speed: 720, reload: 1.7,
    atk: {
      name: 'Fuse Pair', text: 'Lobs 2 sticks of dynamite over walls.',
      t: 'lob', n: 2, gap: 0.7, T: 0.95, range: 7, dmg: 960, blast: 0.85, r: 0.18, chg: 1 / 6,
    },
    sup: {
      name: 'Big Barrel', text: 'A huge barrel bomb that knocks enemies back and blows up walls.',
      t: 'lob', T: 1.1, range: 7, dmg: 2000, blast: 2.0, kb: 1.8, breaks: true, r: 0.35,
    },
    gadgets: [{ name: 'Short Fuse', text: 'The next attack stuns enemies for 1.5 seconds.', cd: 7, t: 'buff', what: 'nextStun', v: 1.5 }],
    stars: [{ name: 'Boom Boost', text: 'Big Barrel deals 1000 extra damage.', patch: { sup: { dmg: 3000 } } }],
  },
  melody: {
    name: 'Melody', rarity: 'rare', role: 'support', color: '#e45bb0',
    desc: 'A street musician whose songs hurt foes and mend friends.',
    hp: 4000, speed: 720, reload: 1.4,
    atk: {
      name: 'Sonic Chord', text: 'A wide sound wave that pierces enemies.',
      t: 'shot', dmg: 760, range: 7, spd: 8.7, r: 0.5, grow: 0.18, pierce: true, chg: 1 / 7,
    },
    sup: {
      name: 'Encore', text: 'A huge wave that heals Melody and every ally it passes.',
      t: 'shot', dmg: 0, heal: 2400, hself: true, range: 9.7, spd: 9, r: 1.0, grow: 0.1, pierce: true,
    },
    gadgets: [{ name: 'Lullaby', text: 'Heals Melody and nearby allies for 1200.', cd: 7, t: 'pulse', r: 3.3, heal: 1200 }],
    stars: [{ name: 'Harmony', text: 'Sonic Chord also heals allies it passes for 400.', patch: { atk: { heal: 400 } } }],
  },
  sizzle: {
    name: 'Sizzle', rarity: 'super', role: 'thrower', color: '#ff5a1f',
    desc: 'A food-truck chef who throws bottles of blazing sauce.',
    hp: 2400, speed: 720, reload: 2.1,
    atk: {
      name: 'Hot Sauce', text: 'Lobs a bottle that leaves a burning puddle.',
      t: 'lob', T: 0.95, range: 7.67, r: 0.2, dmg: 0, area: { r: 1.15, T: 1.6, dps: 760 }, chg: 1 / 10,
    },
    sup: {
      name: 'Last Call', text: 'Throws 5 bottles in a fan, setting a whole area ablaze.',
      t: 'lob', n: 5, spread: 0.55, T: 1.0, range: 9, r: 0.2, dmg: 0, area: { r: 1.15, T: 2.6, dps: 760 },
    },
    gadgets: [{ name: 'Syrup', text: 'The next puddle also slows enemies by 40%.', cd: 6, t: 'buff', what: 'nextSlow', v: 0.4 }],
    stars: [{ name: 'Taste Test', text: 'Heals Sizzle for 400 with every attack.', pass: { atkHeal: 400 } }],
  },
  gizmo: {
    name: 'Gizmo', rarity: 'super', role: 'support', color: '#3fc3b5',
    desc: 'A young inventor whose sparks bounce and whose turret never sleeps.',
    hp: 3000, speed: 720, reload: 1.5,
    atk: {
      name: 'Spark Orb', text: 'An orb that bounces on to 2 more nearby enemies.',
      t: 'shot', dmg: 1000, range: 9, spd: 8.3, r: 0.25, bounce: { n: 2, r: 4.7 }, chg: 1 / 4,
    },
    sup: {
      name: 'Turret', text: 'Builds a turret that shoots the nearest enemy.',
      t: 'deploy', unit: 'turret', dk: 'gizmo.turret', range: 4, rad: 0.5, hp: 3000, aggro: 8.7, rate: 0.4,
      shot: { pk: 'gizmo.turret', dmg: 260, range: 8.7, spd: 11, r: 0.13 },
    },
    gadgets: [{ name: 'Overclock', text: 'The turret fires twice as fast for 5 seconds.', cd: 7, req: 'deploy', t: 'buff', what: 'deployRate', v: 2, T: 5 }],
    stars: [{ name: 'Repair Kit', text: 'Spark Orb hits repair the turret for 400.', pass: { deployHeal: 400 } }],
  },
  volt: {
    name: 'Volt', rarity: 'super', role: 'control', color: '#ffd23f',
    desc: 'A storm chaser who zaps through crowds in an instant.',
    hp: 3200, speed: 720, reload: 1.8,
    atk: {
      // no travel time to dodge, so it hits for less than a projectile of the same reload would
      name: 'Arc Beam', text: 'An instant beam that pierces every enemy in a line.',
      t: 'beam', dmg: 920, range: 8, w: 0.28, pierce: true, chg: 1 / 4,
    },
    sup: {
      name: 'Thunderhead', text: 'Calls a storm cloud that shocks and slows enemies under it.',
      t: 'area', at: 'aim', range: 8, r: 2.4, T: 4, dps: 500, slow: 0.4,
    },
    gadgets: [{ name: 'Static Burst', text: 'Stuns nearby enemies for 1 second.', cd: 7, t: 'pulse', r: 2.4, dmg: 300, stun: 1.0 }],
    stars: [{ name: 'Jumper Cable', text: 'Arc Beam chains to one more enemy nearby.', patch: { atk: { chain: { n: 1, r: 3.5, mul: 0.6 } } } }],
  },
  hawk: {
    name: 'Hawk', rarity: 'epic', role: 'sharp', color: '#7b6cf6',
    desc: 'An elegant sharpshooter: the further the target, the harder it hits.',
    hp: 2400, speed: 720, reload: 2.3,
    atk: {
      name: 'Long Shot', text: 'A single bullet that deals more damage the further it flies.',
      t: 'shot', dmg: 1520, ramp: [0.35, 1], range: 10, spd: 15, r: 0.14, chg: 1 / 3,
    },
    sup: {
      name: 'Pop-Up', text: 'Leaps away, dropping 4 grenades where she took off.',
      t: 'leap', range: 7.3, away: true,
      then: [{ t: 'lob', at: 'self', n: 4, ring: 0.9, T: 0.8, dmg: 900, blast: 1.0, r: 0.2 }],
    },
    gadgets: [{ name: 'Back Off', text: 'Blasts nearby enemies back and damages them.', cd: 6, t: 'pulse', r: 2.6, dmg: 600, kb: 3 }],
    stars: [{ name: 'Quick Hands', text: 'Hitting an enemy refunds half an ammo bar.', pass: { ammoOnHit: 0.5 } }],
  },
  frost: {
    name: 'Frost', rarity: 'epic', role: 'control', color: '#7fd6ff',
    desc: 'A grumpy snow-cone vendor who blows enemies away.',
    hp: 3800, speed: 720, reload: 1.4,
    atk: {
      name: 'Snow Flurry', text: 'Throws 6 snowballs in a wide fan.',
      t: 'shot', n: 6, spread: 0.7, dmg: 380, range: 8, spd: 9.7, r: 0.17, chg: 1 / 14,
    },
    sup: {
      name: 'Gale Wall', text: 'A wide gust that pushes enemies back.',
      t: 'shot', dmg: 300, range: 8.3, spd: 10, r: 1.6, pierce: true, kb: 3.2,
    },
    gadgets: [{ name: 'Frost Ring', text: 'Slows nearby enemies by 45% for 2.5 seconds.', cd: 7, t: 'pulse', r: 3.2, dmg: 0, slow: { T: 2.5, f: 0.45 } }],
    stars: [{ name: 'Frostbite', text: 'Snowballs slow enemies for half a second.', patch: { atk: { slow: { T: 0.5, f: 0.3 } } } }],
  },
  shade: {
    name: 'Shade', rarity: 'mythic', role: 'assassin', color: '#6b3fa0',
    desc: 'A gloomy undertaker who dashes in for the finishing blow.',
    hp: 3800, speed: 820, reload: 2.4,
    atk: {
      name: 'Night Lunge', text: 'Dashes forward, striking every enemy in the way.',
      t: 'dash', dist: 3, spd: 12, dmg: 900, w: 0.5, chg: 1 / 4,
    },
    sup: {
      name: 'Soul Swarm', text: 'A swarm of bats that pierces enemies and steals their health.',
      t: 'shot', dmg: 900, range: 8, spd: 10, r: 0.6, grow: 0.08, pierce: true, steal: 1,
    },
    gadgets: [{ name: 'Quick Recharge', text: 'Instantly reloads 1 ammo.', cd: 6, t: 'buff', what: 'ammo', v: 1 }],
    stars: [{ name: 'Feast', text: 'Heals 1500 after taking down an enemy.', pass: { killHeal: 1500 } }],
  },
  zip: {
    name: 'Zip', rarity: 'mythic', role: 'fighter', color: '#ffcc33',
    desc: 'A hyperactive speedster who never stops moving or shooting.',
    hp: 3300, speed: 820, reload: 1.0,
    atk: {
      name: 'Rapid Fire', text: 'Fires 4 fast bullets in a quick burst.',
      t: 'shot', n: 4, burst: 0.05, jit: 0.1, dmg: 320, range: 8.7, spd: 13.3, r: 0.13, chg: 1 / 14,
    },
    sup: {
      name: 'Rush Hour', text: 'Zip and nearby allies move 50% faster for 4 seconds.',
      t: 'buff', what: 'speed', f: 0.5, T: 4, r: 6,
    },
    gadgets: [{ name: 'Blink', text: 'A short dash during which Zip cannot be hurt.', cd: 6, t: 'dash', dist: 3, spd: 18, inv: true }],
    stars: [{ name: 'Run and Gun', text: 'Reloads 50% faster while moving.', pass: { moveReload: 0.5 } }],
  },
  specter: {
    name: 'Specter', rarity: 'legend', role: 'assassin', color: '#4fd18b',
    desc: 'A sly phantom who vanishes, then strikes from nowhere.',
    hp: 3200, speed: 820, reload: 1.9,
    atk: {
      name: 'Spectral Blades', text: '4 blades in a fan. They hit harder up close.',
      t: 'shot', n: 4, spread: 0.36, dmg: 480, ramp: [1, 0.45], range: 9.7, spd: 11.7, r: 0.14, chg: 1 / 11,
    },
    sup: {
      name: 'Fade', text: 'Turns invisible to enemies for 6 seconds. Attacking ends it.',
      t: 'buff', what: 'invis', T: 6,
    },
    gadgets: [{ name: 'Shadow Step', text: 'Moves 60% faster for 3 seconds.', cd: 7, t: 'buff', what: 'speed', f: 0.6, T: 3 }],
    stars: [{ name: 'Hidden Mend', text: 'Heals 1000 per second while invisible.', pass: { invisHeal: 1000 } }],
  },
  thorn: {
    name: 'Thorn', rarity: 'legend', role: 'sharp', color: '#6fcf3f',
    desc: 'A silent cactus whose needle balls burst into spikes.',
    hp: 2400, speed: 720, reload: 2.0,
    atk: {
      name: 'Needle Ball', text: 'A cactus ball that bursts into 6 spikes when it stops.',
      t: 'shot', dmg: 700, range: 7.67, spd: 8.3, r: 0.3, chg: 1 / 5,
      split: { n: 6, dmg: 520, range: 2.7, spd: 9.7, r: 0.12, chg: 1 / 12, pk: 'thorn.spike' },
    },
    sup: {
      name: 'Briar Patch', text: 'Lobs a spike field that damages and slows enemies.',
      t: 'lob', T: 1.0, range: 9, r: 0.3, dmg: 0, area: { r: 2.4, T: 4.5, dps: 600, slow: 0.4 },
    },
    gadgets: [{ name: 'Sap', text: 'Instantly heals 1500.', cd: 7, t: 'heal', amt: 1500 }],
    stars: [{ name: 'Green Thumb', text: 'Heals 800 per second inside his own Briar Patch.', pass: { fieldHeal: 800 } }],
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
    bk, D, hp: D.hp, speed: U(D.speed), reload: D.reload,
    atk: Object.assign({}, D.atk, patch.atk || {}),
    sup: Object.assign({}, D.sup, patch.sup || {}),
    gad: gadget >= 0 ? D.gadgets[gadget] : null,
    pass: (sp && sp.pass) || {},
  };
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
    rangeName: range < 4.5 ? 'Short' : range < 8.5 ? 'Normal' : 'Long',
    reload: D.reload,
    reloadName: D.reload < 1.3 ? 'Fast' : D.reload < 1.9 ? 'Normal' : 'Slow',
    speed: D.speed,
    speedName: D.speed >= 820 ? 'Very fast' : D.speed >= 770 ? 'Fast' : 'Normal',
    supDmg: Math.round((D.sup.dmg || D.sup.heal || (D.sup.area ? D.sup.area.dps : 0) || D.sup.dps || (D.sup.shot ? D.sup.shot.dmg : 0) || 0) * m),
  };
}
