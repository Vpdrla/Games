// ---------- Game data: weapons, items, enemies, bosses, stages, heroes, power-ups ----------
const SIM_DT = 1 / 60;
const NIGHT = 900; // seconds until dawn in a normal run
const MAX_WEAPONS = 6;
const MAX_PASSIVES = 6;
const WEAPON_MAX = 8;
const ENEMY_CAP = 420;

// Weapon stats: dmg (flat), cd (seconds), amount, area, speed, dur, pierce, knock, interval.
// Level deltas: dmg/amount/pierce/chain add flat; cd/area/speed/dur add fractions of the base.
const WEAPONS = {
  bolt: {
    name: 'Magic Bolt', col: '#7fc8ff', pair: 'haste', evo: 'storm',
    desc: 'Fires bolts at the nearest enemies.',
    base: { dmg: 10, cd: 1.2, amount: 1, area: 1, speed: 1, dur: 1, pierce: 1, knock: 1 },
    lv: [{ amount: 1 }, { dmg: 5 }, { amount: 1, cd: -0.1 }, { pierce: 1 }, { amount: 1 }, { dmg: 5 }, { dmg: 10, pierce: 1 }],
  },
  slash: {
    name: 'Lantern Slash', col: '#ffcf6a', pair: 'might', evo: 'dawn',
    desc: 'Sweeps a blazing arc beside you.',
    base: { dmg: 16, cd: 1.35, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, knock: 1.5 },
    lv: [{ amount: 1 }, { dmg: 6 }, { area: 0.15, dmg: 4 }, { dmg: 6 }, { area: 0.15, dmg: 4 }, { dmg: 6 }, { dmg: 8, cd: -0.1 }],
  },
  blades: {
    name: 'Orbiting Blades', col: '#c8d8ff', pair: 'duration', evo: 'halo',
    desc: 'Blades circle around you for a while.',
    base: { dmg: 10, cd: 3.4, amount: 2, area: 1, speed: 1, dur: 1, pierce: 0, knock: 1, interval: 0.35 },
    lv: [{ amount: 1 }, { speed: 0.3, area: 0.15 }, { dmg: 6 }, { amount: 1 }, { dur: 0.5 }, { dmg: 6 }, { amount: 1 }],
  },
  aura: {
    name: 'Holy Aura', col: '#fff3a8', pair: 'vitality', evo: 'sanctum',
    desc: 'Burns enemies that come close.',
    base: { dmg: 5, cd: 0.7, amount: 0, area: 1, speed: 1, dur: 1, pierce: 0, knock: 0.6 },
    lv: [{ area: 0.2 }, { dmg: 3, cd: -0.1 }, { area: 0.2 }, { dmg: 3 }, { area: 0.2, cd: -0.1 }, { dmg: 3 }, { area: 0.2 }],
  },
  boomerang: {
    name: 'Boomerang', col: '#ffa860', pair: 'swiftness', evo: 'moons',
    desc: 'Flies out and returns, cutting everything.',
    base: { dmg: 14, cd: 1.6, amount: 1, area: 1, speed: 1, dur: 1, pierce: 99, knock: 1.2 },
    lv: [{ dmg: 6 }, { amount: 1 }, { area: 0.25 }, { dmg: 6, speed: 0.2 }, { amount: 1 }, { dmg: 6 }, { area: 0.25, dmg: 6 }],
  },
  lightning: {
    name: 'Chain Lightning', col: '#b9f2ff', pair: 'luck', evo: 'tempest',
    desc: 'Strikes a random enemy and jumps to others.',
    base: { dmg: 22, cd: 2.4, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, knock: 0.5, chain: 2 },
    lv: [{ chain: 1 }, { amount: 1 }, { dmg: 10 }, { chain: 1, cd: -0.1 }, { amount: 1 }, { dmg: 10 }, { chain: 2 }],
  },
  flask: {
    name: 'Fire Flask', col: '#ff7a3a', pair: 'area', evo: 'inferno',
    desc: 'Shatters into a burning pool.',
    base: { dmg: 8, cd: 2.6, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, knock: 0, interval: 0.4 },
    lv: [{ amount: 1 }, { area: 0.2 }, { dmg: 4, dur: 0.25 }, { amount: 1 }, { area: 0.2 }, { dmg: 4, dur: 0.25 }, { amount: 1 }],
  },
  frost: {
    name: 'Frost Nova', col: '#9fe4ff', pair: 'armor', evo: 'zero',
    desc: 'A freezing ring that slows enemies.',
    base: { dmg: 12, cd: 3.2, amount: 0, area: 1, speed: 1, dur: 1, pierce: 0, knock: 2 },
    lv: [{ dmg: 6 }, { area: 0.2 }, { cd: -0.1, dur: 0.3 }, { dmg: 8 }, { area: 0.2 }, { cd: -0.1 }, { dmg: 12 }],
  },
  orb: {
    name: 'Ricochet Orb', col: '#d68cff', pair: 'velocity', evo: 'prism',
    desc: 'Bounces around the screen edges.',
    base: { dmg: 12, cd: 3.2, amount: 1, area: 1, speed: 1, dur: 1, pierce: 99, knock: 0.8 },
    lv: [{ dmg: 6 }, { amount: 1 }, { speed: 0.2, dur: 0.3 }, { dmg: 6 }, { amount: 1 }, { dur: 0.3, area: 0.25 }, { dmg: 10 }],
  },
  beam: {
    name: 'Sweeping Beam', col: '#ff6ad5', pair: 'regen', evo: 'solar',
    desc: 'A laser sweeps in a circle around you.',
    base: { dmg: 9, cd: 3.8, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, knock: 0.3, interval: 0.2 },
    lv: [{ dmg: 4 }, { dur: 0.3 }, { area: 0.2 }, { amount: 1 }, { dmg: 4 }, { dur: 0.3, cd: -0.1 }, { amount: 1, area: 0.2 }],
  },
  drones: {
    name: 'Seeker Drones', col: '#8affc1', pair: 'magnet', evo: 'hive',
    desc: 'Drones fire homing rockets.',
    base: { dmg: 14, cd: 1.8, amount: 1, area: 1, speed: 1, dur: 1, pierce: 1, knock: 1 },
    lv: [{ dmg: 5 }, { amount: 1 }, { cd: -0.1 }, { area: 0.25, dmg: 5 }, { amount: 1 }, { cd: -0.1 }, { dmg: 8, amount: 1 }],
  },
  runes: {
    name: 'Spike Runes', col: '#ffd84a', pair: 'multishot', evo: 'glyph',
    desc: 'Lays runes that erupt under enemies.',
    base: { dmg: 30, cd: 1.4, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, knock: 1.5 },
    lv: [{ dmg: 10 }, { amount: 1 }, { area: 0.2 }, { cd: -0.15 }, { dmg: 10 }, { amount: 1 }, { dmg: 15, area: 0.2 }],
  },

  // ----- evolutions (replace the base weapon, no further levels) -----
  storm: { name: 'Arcane Storm', col: '#5fb0ff', evolved: 'bolt', desc: 'A ceaseless torrent of piercing bolts.', base: { dmg: 16, cd: 0.14, amount: 1, area: 1.2, speed: 1.2, dur: 1, pierce: 3, knock: 0.6 } },
  dawn: { name: 'Dawnbreaker', col: '#ffb02e', evolved: 'slash', desc: 'Huge arcs on both sides that launch flying crescents.', base: { dmg: 44, cd: 1.0, amount: 2, area: 1.6, speed: 1, dur: 1, pierce: 0, knock: 2 } },
  halo: { name: 'Eternal Halo', col: '#e8f0ff', evolved: 'blades', desc: 'Six blades that never stop spinning.', base: { dmg: 22, cd: 0, amount: 6, area: 1.4, speed: 1.4, dur: 1, pierce: 0, knock: 1.2, interval: 0.3 } },
  sanctum: { name: 'Sanctuary', col: '#fff7c8', evolved: 'aura', desc: 'A holy field that slows enemies and heals you.', base: { dmg: 14, cd: 0.5, amount: 0, area: 2.0, speed: 1, dur: 1, pierce: 0, knock: 0.6 } },
  moons: { name: 'Twin Moons', col: '#ffd0a0', evolved: 'boomerang', desc: 'Giant boomerangs fly both ways.', base: { dmg: 32, cd: 1.1, amount: 2, area: 1.8, speed: 1.15, dur: 1.2, pierce: 99, knock: 1.6 } },
  tempest: { name: 'Tempest', col: '#e0fbff', evolved: 'lightning', desc: 'Storms of chaining, exploding bolts.', base: { dmg: 40, cd: 1.2, amount: 3, area: 1.2, speed: 1, dur: 1, pierce: 0, knock: 0.8, chain: 6 } },
  inferno: { name: 'Inferno', col: '#ff5a1a', evolved: 'flask', desc: 'Huge firestorms that creep after enemies.', base: { dmg: 16, cd: 2.0, amount: 3, area: 2.0, speed: 1, dur: 1.5, pierce: 0, knock: 0, interval: 0.3 } },
  zero: { name: 'Absolute Zero', col: '#d8f6ff', evolved: 'frost', desc: 'Freezes enemies solid. Frozen foes take +50% damage.', base: { dmg: 30, cd: 2.4, amount: 0, area: 1.6, speed: 1, dur: 1.3, pierce: 0, knock: 0 } },
  prism: { name: 'Prism Storm', col: '#f0a0ff', evolved: 'orb', desc: 'Large seeking orbs that ricochet for ages.', base: { dmg: 26, cd: 2.2, amount: 3, area: 1.6, speed: 1.2, dur: 1.5, pierce: 99, knock: 1 } },
  solar: { name: 'Solar Lance', col: '#ffe066', evolved: 'beam', desc: 'Twin beams that never stop and mend your wounds.', base: { dmg: 16, cd: 0, amount: 2, area: 1.6, speed: 1.1, dur: 1, pierce: 0, knock: 0.4, interval: 0.18 } },
  hive: { name: 'Hive Swarm', col: '#5affa8', evolved: 'drones', desc: 'A swarm of drones that also gathers gems.', base: { dmg: 26, cd: 0.9, amount: 5, area: 1.5, speed: 1.2, dur: 1, pierce: 1, knock: 1.2 } },
  glyph: { name: 'Glyph Field', col: '#ffe98a', evolved: 'runes', desc: 'Runes that keep erupting and never break.', base: { dmg: 45, cd: 1.0, amount: 2, area: 1.5, speed: 1, dur: 1.5, pierce: 0, knock: 1.5 } },
};
const BASE_WEAPONS = ['bolt', 'slash', 'blades', 'aura', 'boomerang', 'lightning', 'flask', 'frost', 'orb', 'beam', 'drones', 'runes'];
const EVOLVED = {}; // base -> evolved key
for (const k of BASE_WEAPONS) EVOLVED[k] = WEAPONS[k].evo;

const PASSIVES = {
  might: { name: 'Ember Heart', col: '#ff6a4a', max: 5, desc: '+10% damage' },
  haste: { name: 'Hourglass', col: '#7fe0ff', max: 5, desc: '8% faster cooldowns' },
  area: { name: 'Wide Lens', col: '#ffd86a', max: 5, desc: '+10% area' },
  duration: { name: 'Candle Wax', col: '#fff0d0', max: 5, desc: '+12% effect duration' },
  multishot: { name: 'Twin Wick', col: '#ffb05a', max: 2, desc: '+1 projectile for every weapon' },
  swiftness: { name: 'Feather Boots', col: '#a8ff9a', max: 5, desc: '+10% move speed' },
  vitality: { name: 'Oak Heart', col: '#ff8fa8', max: 5, desc: '+20% max health' },
  regen: { name: 'Moss Charm', col: '#6fe07a', max: 5, desc: 'Recover 0.25 health per second' },
  magnet: { name: 'Lodestone', col: '#b0b8ff', max: 5, desc: '+35% pickup range' },
  luck: { name: 'Clover', col: '#5fe39a', max: 5, desc: '+10% luck: crits, chests and drops' },
  armor: { name: 'Iron Plate', col: '#c0c8d8', max: 5, desc: 'Take 1 less damage per hit' },
  velocity: { name: 'Wind Rune', col: '#bff0ff', max: 5, desc: '+12% projectile speed' },
};
const PASSIVE_KEYS = Object.keys(PASSIVES);
const PAIR_OF = {}; // passive -> base weapon it evolves
for (const k of BASE_WEAPONS) PAIR_OF[WEAPONS[k].pair] = k;

// Human readable text for a level delta.
function deltaText(key, d) {
  const w = WEAPONS[key];
  const parts = [];
  if (d.dmg) parts.push('+' + d.dmg + ' damage');
  if (d.amount) parts.push('+' + d.amount + (key === 'drones' ? ' drone' : key === 'lightning' ? ' strike' : key === 'slash' ? ' slash' : key === 'beam' ? ' beam' : key === 'blades' ? ' blade' : ' projectile'));
  if (d.pierce) parts.push('+' + d.pierce + ' pierce');
  if (d.chain) parts.push('+' + d.chain + ' chain');
  if (d.cd) parts.push(Math.round(-d.cd * 100) + '% faster');
  if (d.area) parts.push('+' + Math.round(d.area * 100) + '% area');
  if (d.speed) parts.push('+' + Math.round(d.speed * 100) + '% speed');
  if (d.dur) parts.push('+' + Math.round(d.dur * 100) + '% duration');
  return parts.join(', ') || w.desc;
}

// Enemies. hp/dmg are scaled by night time and stage. r = body radius (world units).
const ENEMIES = {
  bat: { name: 'Bat', hp: 5, spd: 92, dmg: 4, r: 8, xp: 1, ai: 'bat', fly: true, col: '#5b3a7a' },
  zombie: { name: 'Zombie', hp: 20, spd: 34, dmg: 7, r: 11, xp: 2, ai: 'chase', col: '#6fa35a' },
  skeleton: { name: 'Skeleton', hp: 12, spd: 50, dmg: 6, r: 10, xp: 1, ai: 'chase', col: '#e8e2cf' },
  ghost: { name: 'Ghost', hp: 11, spd: 56, dmg: 6, r: 10, xp: 2, ai: 'ghost', fly: true, col: '#cfe4ff' },
  slime: { name: 'Slime', hp: 26, spd: 40, dmg: 7, r: 13, xp: 2, ai: 'hop', split: 'slimelet', col: '#5ad06a' },
  slimelet: { name: 'Slimelet', hp: 7, spd: 50, dmg: 4, r: 7, xp: 1, ai: 'hop', col: '#7ae08a' },
  archer: { name: 'Bone Archer', hp: 16, spd: 40, dmg: 6, r: 10, xp: 2, ai: 'ranged', range: 170, shot: 'arrow', every: 3.4, col: '#e0d6b8' },
  hound: { name: 'Hellhound', hp: 30, spd: 46, dmg: 8, r: 12, xp: 3, ai: 'charge', col: '#a03a2a' },
  bloater: { name: 'Bloater', hp: 22, spd: 34, dmg: 6, r: 13, xp: 2, ai: 'bloat', col: '#b85aa8' },
  knight: { name: 'Shield Knight', hp: 60, spd: 36, dmg: 10, r: 13, xp: 4, ai: 'chase', shield: true, kres: 0.3, col: '#8a96a8' },
  necro: { name: 'Necromancer', hp: 40, spd: 30, dmg: 6, r: 11, xp: 5, ai: 'summon', minion: 'skeleton', col: '#4a2a6a' },
  wisp: { name: 'Wisp', hp: 7, spd: 62, dmg: 5, r: 7, xp: 1, ai: 'chase', fly: true, col: '#7fd8ff' },
  golem: { name: 'Stone Golem', hp: 220, spd: 28, dmg: 16, r: 22, xp: 10, ai: 'chase', kres: 0.1, col: '#7a7468' },
  wolf: { name: 'Frost Wolf', hp: 16, spd: 78, dmg: 6, r: 10, xp: 2, ai: 'chase', col: '#d8e4f0' },
  yeti: { name: 'Yeti', hp: 100, spd: 36, dmg: 12, r: 18, xp: 6, ai: 'ranged', range: 220, shot: 'snowball', every: 3.4, kres: 0.4, col: '#eef6ff' },
  imp: { name: 'Imp', hp: 16, spd: 66, dmg: 6, r: 9, xp: 2, ai: 'ranged', range: 140, shot: 'fireball', every: 2.4, fly: true, col: '#e0442a' },
  crawler: { name: 'Magma Crawler', hp: 45, spd: 40, dmg: 9, r: 13, xp: 3, ai: 'chase', puddle: true, col: '#ff7a2a' },
  shade: { name: 'Shade', hp: 26, spd: 60, dmg: 8, r: 10, xp: 3, ai: 'blink', col: '#2a1a3a' },
  watcher: { name: 'Watcher', hp: 34, spd: 36, dmg: 7, r: 12, xp: 4, ai: 'ranged', range: 200, shot: 'spread', every: 3.0, fly: true, col: '#e8d8f0' },
  brazier: { name: 'Lantern Post', hp: 1, spd: 0, dmg: 0, r: 10, xp: 0, ai: 'prop', col: '#ffb040' },
};
const ENEMY_KEYS = Object.keys(ENEMIES).filter((k) => k !== 'brazier');

// Enemy shots: speed, radius, damage multiplier of the shooter's damage.
const SHOTS = {
  arrow: { spd: 150, r: 4, n: 1, spread: 0, dmg: 0.55 },
  snowball: { spd: 125, r: 7, n: 1, spread: 0, slow: 0.35, dmg: 0.7 },
  fireball: { spd: 140, r: 5, n: 1, spread: 0, dmg: 0.6 },
  spread: { spd: 115, r: 5, n: 3, spread: 0.3, dmg: 0.5 },
};

// Bosses reuse an enemy body (or a custom one), scaled and crowned.
const BOSSES = {
  colossus: { name: 'Bone Colossus', body: 'skeleton', scale: 3.0, tint: '#f0e6c8', hp: 1500, spd: 38, dmg: 16, attacks: ['slam', 'summon', 'slam', 'ring'], minion: 'skeleton' },
  banshee: { name: 'Wailing Banshee', body: 'ghost', scale: 3.0, tint: '#b8d0ff', hp: 2600, spd: 56, dmg: 15, attacks: ['ring', 'dash', 'spiral', 'dash'], ghost: true },
  gravelord: { name: 'Grave Lord', body: 'necro', scale: 3.2, tint: '#7a3aa8', hp: 6500, spd: 40, dmg: 20, attacks: ['spiral', 'summon', 'slam', 'volley', 'ring'], minion: 'zombie', final: true },
  troll: { name: 'Frost Troll', body: 'yeti', scale: 2.4, tint: '#a8d8ff', hp: 2600, spd: 40, dmg: 18, attacks: ['slam', 'volley', 'dash'], minion: 'wolf' },
  wraith: { name: 'Ice Wraith', body: 'ghost', scale: 3.0, tint: '#7fe0ff', hp: 3600, spd: 60, dmg: 17, attacks: ['blink', 'ring', 'spiral'], ghost: true },
  titan: { name: 'Glacial Titan', body: 'golem', scale: 2.6, tint: '#9fd8ff', hp: 9500, spd: 36, dmg: 24, attacks: ['slam', 'ring', 'summon', 'volley', 'dash'], minion: 'wolf', final: true },
  brute: { name: 'Magma Brute', body: 'golem', scale: 2.3, tint: '#ff7a3a', hp: 3800, spd: 40, dmg: 20, attacks: ['slam', 'dash', 'ring'], minion: 'crawler' },
  impqueen: { name: 'Imp Queen', body: 'imp', scale: 3.4, tint: '#ff4a6a', hp: 4800, spd: 62, dmg: 19, attacks: ['volley', 'summon', 'spiral', 'blink'], minion: 'imp' },
  drake: { name: 'Infernal Drake', body: 'drake', scale: 3.0, tint: null, hp: 13000, spd: 44, dmg: 26, attacks: ['spiral', 'dash', 'volley', 'slam', 'ring'], minion: 'imp', final: true },
  voidknight: { name: 'Void Knight', body: 'knight', scale: 2.8, tint: '#6a3aff', hp: 5600, spd: 48, dmg: 22, attacks: ['dash', 'slam', 'blink', 'ring'], minion: 'shade' },
  eye: { name: 'Eye of the Abyss', body: 'watcher', scale: 3.2, tint: '#ff4ad0', hp: 6800, spd: 40, dmg: 21, attacks: ['spiral', 'volley', 'ring', 'blink'], minion: 'watcher' },
  sovereign: { name: 'Night Sovereign', body: 'sovereign', scale: 3.0, tint: null, hp: 18000, spd: 46, dmg: 28, attacks: ['spiral', 'summon', 'dash', 'volley', 'blink', 'slam', 'ring'], minion: 'shade', final: true },
};

// Stages. waves[minute] = enemy pool for that minute ('type:weight ...').
const STAGES = [
  {
    key: 'graveyard', name: 'Moonlit Graveyard', hp: 1, dmg: 1, rate: 1, gold: 1,
    desc: 'Where the night begins. Bats, bones and restless dead.',
    ground: ['#27324a', '#2d3a54', '#222b40'], accent: '#3c5a4a', night: '#0a0c24', dawn: '#ffb46a', decor: 'grave',
    swarm: 'bat', ring: 'wisp', minis: ['colossus', 'banshee'], boss: 'gravelord', hazard: null,
    waves: [
      'bat:5 skeleton:3', 'skeleton:4 bat:4 zombie:2', 'zombie:3 skeleton:3 ghost:3 bat:2', 'ghost:3 zombie:3 slime:3',
      'slime:3 archer:2 skeleton:3 bat:3', 'hound:3 zombie:3 ghost:2', 'archer:2 knight:2 ghost:3 bat:4', 'knight:3 slime:3 bloater:2',
      'necro:1 skeleton:5 hound:2 ghost:2', 'golem:1 zombie:4 bloater:2 bat:4', 'knight:3 archer:2 hound:3', 'golem:1 necro:1 ghost:4 slime:3',
      'bloater:3 knight:3 hound:3 bat:3', 'golem:2 archer:3 necro:1 zombie:4', 'golem:2 knight:3 necro:1 hound:3 ghost:3 bloater:2',
    ],
  },
  {
    key: 'frozen', name: 'Frozen Wastes', hp: 1.35, dmg: 1.2, rate: 1.1, gold: 1.25,
    desc: 'Wolves hunt in packs and blizzards push you around.',
    ground: ['#b8c8dc', '#c6d4e6', '#a8bad0'], accent: '#7a96b8', night: '#0c1430', dawn: '#ffc8a0', decor: 'ice',
    swarm: 'wolf', ring: 'wisp', minis: ['troll', 'wraith'], boss: 'titan', hazard: 'blizzard',
    waves: [
      'wisp:4 bat:3 wolf:1', 'wolf:3 skeleton:3 ghost:2', 'wolf:4 ghost:3 slime:2', 'yeti:1 wolf:3 wisp:3 zombie:2',
      'archer:2 wolf:4 ghost:3', 'knight:2 wolf:4 yeti:1', 'yeti:2 ghost:4 archer:2', 'wolf:6 knight:2 bloater:2',
      'necro:1 yeti:2 wolf:4', 'golem:1 wolf:5 ghost:3', 'yeti:2 knight:3 archer:3', 'golem:1 necro:1 wolf:5',
      'yeti:3 bloater:3 wolf:5', 'golem:2 yeti:2 knight:3 wolf:4', 'golem:2 yeti:3 necro:1 wolf:6 knight:2',
    ],
  },
  {
    key: 'ember', name: 'Ember Caverns', hp: 1.75, dmg: 1.45, rate: 1.2, gold: 1.5,
    desc: 'Lava vents erupt under everyone. Imps rain fire.',
    ground: ['#3a2422', '#462a26', '#2e1c1c'], accent: '#ff6a2a', night: '#1a0808', dawn: '#ffd08a', decor: 'lava',
    swarm: 'imp', ring: 'crawler', minis: ['brute', 'impqueen'], boss: 'drake', hazard: 'vents',
    waves: [
      'bat:5 skeleton:3', 'skeleton:3 bat:3 zombie:2 imp:1', 'crawler:1 imp:2 bloater:2 bat:3 zombie:2', 'hound:2 imp:2 crawler:2 zombie:3',
      'imp:4 hound:3 slime:3', 'crawler:4 bloater:3 imp:2', 'knight:2 imp:4 hound:3', 'golem:1 crawler:4 imp:3',
      'necro:1 hound:4 imp:4', 'golem:1 bloater:4 crawler:4', 'knight:3 imp:5 hound:3', 'golem:2 crawler:4 imp:4',
      'bloater:4 hound:4 imp:4 knight:2', 'golem:2 necro:1 crawler:5 imp:4', 'golem:3 knight:3 hound:4 imp:5 bloater:3',
    ],
  },
  {
    key: 'void', name: 'Void Citadel', hp: 2.3, dmg: 1.7, rate: 1.3, gold: 2,
    desc: 'The Night Sovereign\'s keep. Shades blink, watchers stare.',
    ground: ['#1c1630', '#241c3c', '#161226'], accent: '#a05aff', night: '#08041a', dawn: '#ffe0b0', decor: 'void',
    swarm: 'shade', ring: 'wisp', minis: ['voidknight', 'eye'], boss: 'sovereign', hazard: 'rifts',
    waves: [
      'bat:5 skeleton:3', 'skeleton:3 bat:3 ghost:2 shade:1', 'shade:2 ghost:3 watcher:1 zombie:2', 'knight:1 shade:3 wisp:3 watcher:1 zombie:2',
      'watcher:3 shade:4 slime:3', 'hound:3 shade:4 watcher:2', 'knight:3 watcher:3 shade:4', 'golem:1 shade:5 bloater:3',
      'necro:1 watcher:3 shade:5', 'golem:1 knight:3 shade:5', 'watcher:4 hound:4 shade:5', 'golem:2 necro:1 shade:6',
      'knight:4 watcher:4 shade:5 bloater:3', 'golem:2 necro:2 shade:6 watcher:3', 'golem:3 knight:4 necro:1 shade:7 watcher:4',
    ],
  },
];
for (const st of STAGES) st.pools = st.waves.map((w) => w.split(/\s+/).map((s) => { const [k, n] = s.split(':'); return [k, +n]; }));
const STAGE_INDEX = {};
STAGES.forEach((s, i) => { STAGE_INDEX[s.key] = i; });

// Heroes. look drives their sprite.
const CHARACTERS = {
  lumen: { name: 'Lumen', title: 'Lamplighter', weapon: 'slash', perk: '+10% max health', mods: { maxHp: 0.1 }, look: { cloak: '#e08a2a', hat: 'hood', trim: '#ffd27a', skin: '#ffd9b8' }, unlock: null },
  aria: { name: 'Aria', title: 'Star Mage', weapon: 'bolt', perk: '10% faster cooldowns', mods: { cd: -0.1 }, look: { cloak: '#7a4ad8', hat: 'witch', trim: '#ffd84a', skin: '#ffe0c8' }, unlock: null },
  bram: { name: 'Bram', title: 'Oath Knight', weapon: 'aura', perk: '+1 armor, +20% max health, -10% speed', mods: { armor: 1, maxHp: 0.2, speed: -0.1 }, look: { cloak: '#5a6a88', hat: 'helm', trim: '#d8dde8', skin: '#f0c8a0' }, unlock: 'lv20' },
  kira: { name: 'Kira', title: 'Wild Ranger', weapon: 'boomerang', perk: '+15% move speed', mods: { speed: 0.15 }, look: { cloak: '#3a8a4a', hat: 'hood2', trim: '#a8e060', skin: '#e8b890' }, unlock: 'survive10' },
  vesper: { name: 'Vesper', title: 'Alchemist', weapon: 'flask', perk: '+15% area', mods: { area: 0.15 }, look: { cloak: '#b8343a', hat: 'goggles', trim: '#ffb060', skin: '#ffd0b0' }, unlock: 'boss1' },
  orin: { name: 'Orin', title: 'Tinkerer', weapon: 'drones', perk: '+1 projectile, -20% max health', mods: { amount: 1, maxHp: -0.2 }, look: { cloak: '#2a7ab8', hat: 'cap', trim: '#8affc1', skin: '#f2c8a8' }, unlock: 'evolve1' },
};
const CHAR_KEYS = Object.keys(CHARACTERS);

// Permanent power-ups bought with gold between runs.
const POWERUPS = {
  might: { name: 'Might', desc: '+5% damage', max: 5, cost: 100, icon: 'might' },
  armor: { name: 'Armor', desc: '+1 armor', max: 3, cost: 250, icon: 'armor' },
  maxHp: { name: 'Max Health', desc: '+10% max health', max: 5, cost: 80, icon: 'vitality' },
  regen: { name: 'Recovery', desc: '+0.1 health per second', max: 5, cost: 100, icon: 'regen' },
  cd: { name: 'Cooldown', desc: '3% faster cooldowns', max: 5, cost: 150, icon: 'haste' },
  area: { name: 'Area', desc: '+5% area', max: 4, cost: 120, icon: 'area' },
  dur: { name: 'Duration', desc: '+6% duration', max: 4, cost: 110, icon: 'duration' },
  speed: { name: 'Move Speed', desc: '+5% move speed', max: 3, cost: 130, icon: 'swiftness' },
  magnet: { name: 'Magnet', desc: '+20% pickup range', max: 3, cost: 90, icon: 'magnet' },
  luck: { name: 'Luck', desc: '+8% luck', max: 3, cost: 180, icon: 'luck' },
  growth: { name: 'Growth', desc: '+4% experience', max: 5, cost: 120, icon: 'growth' },
  greed: { name: 'Greed', desc: '+10% gold', max: 5, cost: 80, icon: 'greed' },
  amount: { name: 'Amount', desc: '+1 projectile', max: 1, cost: 1800, icon: 'multishot' },
  revival: { name: 'Revival', desc: 'Come back once with half health', max: 1, cost: 1500, icon: 'revival' },
  reroll: { name: 'Reroll', desc: '+1 reroll of level-up choices', max: 5, cost: 120, icon: 'reroll' },
  skip: { name: 'Skip', desc: '+1 skip (take nothing, get XP)', max: 5, cost: 60, icon: 'skip' },
  banish: { name: 'Banish', desc: '+1 banish (remove a choice for the run)', max: 5, cost: 100, icon: 'banish' },
};
const POWERUP_KEYS = Object.keys(POWERUPS);
const powerCost = (k, rank) => Math.round(POWERUPS[k].cost * (1 + rank * 0.5));

// Daily Night modifiers.
const DAILY_MODS = {
  swarm: { name: 'Swarming Night', desc: '+60% enemies, +30% experience' },
  glass: { name: 'Glass Lantern', desc: '+60% damage, half health' },
  quick: { name: 'Quickening', desc: 'Everyone moves 25% faster' },
  bounty: { name: 'Bounty Hunt', desc: 'Elites (with chests) twice as often' },
  giant: { name: 'Giant Night', desc: 'Enemies have double health, +50% experience' },
  lucky: { name: 'Lucky Star', desc: '+50% luck' },
  greedy: { name: 'Gold Rush', desc: '+100% gold, enemies hit 20% harder' },
};
const DAILY_MOD_KEYS = Object.keys(DAILY_MODS);

// XP needed to go from level L to L+1.
function xpNeed(L) {
  if (L < 20) return 5 + (L - 1) * 10;
  if (L < 40) return 195 + (L - 20) * 13;
  return 455 + (L - 40) * 16;
}

// Achievements. prog(S, r) returns [current, goal]; S = save, r = live run summary or null.
const ACHIEVEMENTS = [
  { id: 'survive5', name: 'First Light', desc: 'Survive 5 minutes', prog: (S, r) => [Math.max(S.stats.bestTime, r ? r.time : 0), 300], reward: { gold: 100 } },
  { id: 'survive10', name: 'Long Night', desc: 'Survive 10 minutes', prog: (S, r) => [Math.max(S.stats.bestTime, r ? r.time : 0), 600], reward: { char: 'kira' } },
  { id: 'lv20', name: 'Rising Flame', desc: 'Reach level 20 in a run', prog: (S, r) => [Math.max(S.stats.maxLevel, r ? r.level : 0), 20], reward: { char: 'bram' } },
  { id: 'lv30', name: 'Blazing', desc: 'Reach level 30 in a run', prog: (S, r) => [Math.max(S.stats.maxLevel, r ? r.level : 0), 30], reward: { weapon: 'beam' } },
  { id: 'lv50', name: 'Inferno Soul', desc: 'Reach level 50 in a run', prog: (S, r) => [Math.max(S.stats.maxLevel, r ? r.level : 0), 50], reward: { gold: 600 } },
  { id: 'mini1', name: 'Giant Slayer', desc: 'Defeat a mini-boss', prog: (S, r) => [S.stats.minis + (r ? r.minis : 0), 1], reward: { gold: 150 } },
  { id: 'boss1', name: 'Bringer of Dawn', desc: 'Defeat a final boss', prog: (S, r) => [S.stats.bosses + (r ? r.bosses : 0), 1], reward: { char: 'vesper' } },
  { id: 'evolve1', name: 'Transmutation', desc: 'Evolve a weapon', prog: (S, r) => [Object.keys(Object.assign({}, S.evolved, r ? r.evolved : {})).length, 1], reward: { char: 'orin', weapon: 'drones' } },
  { id: 'evolve6', name: 'Grand Alchemist', desc: 'Evolve 6 different weapons', prog: (S, r) => [Object.keys(Object.assign({}, S.evolved, r ? r.evolved : {})).length, 6], reward: { gold: 1000 } },
  { id: 'evolve12', name: 'Master of Light', desc: 'Evolve all 12 weapons', prog: (S, r) => [Object.keys(Object.assign({}, S.evolved, r ? r.evolved : {})).length, 12], reward: { gold: 3000 } },
  { id: 'kill1k', name: 'Lamplit Path', desc: 'Defeat 1,000 enemies', prog: (S, r) => [S.stats.kills + (r ? r.kills : 0), 1000], reward: { gold: 100 } },
  { id: 'kill5k', name: 'Horde Breaker', desc: 'Defeat 5,000 enemies', prog: (S, r) => [S.stats.kills + (r ? r.kills : 0), 5000], reward: { weapon: 'orb' } },
  { id: 'kill25k', name: 'Endless Vigil', desc: 'Defeat 25,000 enemies', prog: (S, r) => [S.stats.kills + (r ? r.kills : 0), 25000], reward: { gold: 1500 } },
  { id: 'kill100k', name: 'Legend of the Lantern', desc: 'Defeat 100,000 enemies', prog: (S, r) => [S.stats.kills + (r ? r.kills : 0), 100000], reward: { gold: 5000 } },
  { id: 'run1k', name: 'One Thousand Lights', desc: 'Defeat 1,000 enemies in one run', prog: (S, r) => [Math.max(S.stats.bestKills, r ? r.kills : 0), 1000], reward: { gold: 200 } },
  { id: 'bats', name: 'Bat Swatter', desc: 'Defeat 500 bats', prog: (S, r) => [(S.stats.byType.bat || 0) + (r ? r.byType.bat || 0 : 0), 500], reward: { gold: 120 } },
  { id: 'chests', name: 'Treasure Hunter', desc: 'Open 20 chests', prog: (S, r) => [S.stats.chests + (r ? r.chests : 0), 20], reward: { weapon: 'runes' } },
  { id: 'arsenal', name: 'Full Arsenal', desc: 'Hold 6 weapons at once', prog: (S, r) => [Math.max(S.stats.maxWeapons, r ? r.weapons : 0), 6], reward: { gold: 250 } },
  { id: 'gold', name: 'Gold Hoarder', desc: 'Collect 5,000 gold in total', prog: (S, r) => [S.stats.goldEarned + (r ? r.gold : 0), 5000], reward: { gold: 500 } },
  { id: 'daily', name: 'Daily Devotion', desc: 'Finish a Daily Night', prog: (S) => [S.stats.dailies, 1], reward: { gold: 200 } },
  { id: 'clear1', name: 'Graveyard Dawn', desc: 'Clear the Moonlit Graveyard', prog: (S, r) => [S.cleared.graveyard || (r && r.won && r.stage === 'graveyard') ? 1 : 0, 1], reward: { stage: 1 } },
  { id: 'clear2', name: 'Thaw', desc: 'Clear the Frozen Wastes', prog: (S, r) => [S.cleared.frozen || (r && r.won && r.stage === 'frozen') ? 1 : 0, 1], reward: { stage: 2 } },
  { id: 'clear3', name: 'Cooled Embers', desc: 'Clear the Ember Caverns', prog: (S, r) => [S.cleared.ember || (r && r.won && r.stage === 'ember') ? 1 : 0, 1], reward: { stage: 3 } },
  { id: 'clear4', name: 'Dawnkeeper', desc: 'Defeat the Night Sovereign', prog: (S, r) => [S.cleared.void || (r && r.won && r.stage === 'void') ? 1 : 0, 1], reward: { gold: 2500 } },
  { id: 'heroes', name: 'Fellowship', desc: 'Clear a stage with 4 different heroes', prog: (S, r) => [Object.keys(Object.assign({}, S.heroClears, r && r.won ? { [r.char]: 1 } : {})).length, 4], reward: { gold: 800 } },
  { id: 'noheal', name: 'Iron Will', desc: 'Clear a stage without picking up a heart', prog: (S, r) => [S.stats.noHealClear || (r && r.won && !r.hearts) ? 1 : 0, 1], reward: { gold: 600 } },
  { id: 'endless20', name: 'Eternal Night', desc: 'Survive 20 minutes in Endless', prog: (S, r) => [Math.max(S.stats.bestEndless, r && r.endless ? r.time : 0), 1200], reward: { gold: 1500 } },
];
