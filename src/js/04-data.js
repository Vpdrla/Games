// ---------- Game data: weapons, skills, enemies, regions, bosses, map ----------
const WEAPONS = {
  fists: { name: 'Bare Fists', style: 'fist', dmg: 1.0, speed: 1.25, reach: 30, kb: 170, price: 0, region: 0, color: '#ffd54f', desc: 'Lightning-fast punches and kicks.' },
  sword: { name: 'Iron Sword', style: 'blade', dmg: 1.45, speed: 1.0, reach: 46, kb: 210, price: 120, region: 0, color: '#cfd8dc', desc: 'Balanced reach and power.' },
  spear: { name: 'Long Spear', style: 'spear', dmg: 1.55, speed: 0.95, reach: 66, kb: 200, price: 350, region: 1, color: '#a1887f', desc: 'Huge reach. Keep foes at bay.' },
  hammer: { name: 'War Hammer', style: 'hammer', dmg: 2.3, speed: 0.74, reach: 50, kb: 380, price: 750, region: 2, color: '#90a4ae', heavy: true, desc: 'Slow, crushing blows that smash through shields.' },
  katana: { name: 'Storm Katana', style: 'blade', dmg: 2.2, speed: 1.22, reach: 52, kb: 230, price: 1500, region: 3, color: '#e3f2fd', desc: 'Swift, razor-sharp strikes.' },
  cosmic: { name: 'Cosmic Blade', style: 'blade', dmg: 3.0, speed: 1.12, reach: 60, kb: 280, price: 3600, region: 5, color: '#b388ff', desc: 'Forged from starlight. The ultimate weapon.' },
};
const WEAPON_ORDER = ['fists', 'sword', 'spear', 'hammer', 'katana', 'cosmic'];

const SKILLS = {
  blast: { name: 'Energy Blast', cost: 20, cd: 0.5, color: '#4fc3f7', desc: 'Fire a piercing ball of energy.' },
  quake: { name: 'Ground Quake', cost: 35, cd: 1.2, color: '#ffb74d', desc: 'Shockwaves race along the ground in both directions.' },
  whirl: { name: 'Whirlwind', cost: 30, cd: 1.0, color: '#aed581', desc: 'Spin into a blade tornado. Invincible while spinning.' },
  thunder: { name: 'Thunder Call', cost: 45, cd: 1.6, color: '#fff176', desc: 'Lightning strikes up to 5 nearby foes.' },
  frost: { name: 'Frost Nova', cost: 40, cd: 1.6, color: '#80deea', desc: 'Freeze every enemy around you.' },
  meteor: { name: 'Meteor Rain', cost: 65, cd: 2.5, color: '#ff7043', desc: 'Call down a storm of meteors ahead of you.' },
};
const SKILL_ORDER = ['blast', 'quake', 'whirl', 'thunder', 'frost', 'meteor'];
const BOSS_REWARD = ['quake', 'whirl', 'thunder', 'frost', 'meteor', null];

const TIER_HP = [1, 2.1, 3.8, 6.2, 9.2, 12.5];
const TIER_DMG = [1, 1.55, 2.2, 3.0, 3.9, 4.9];

// Enemy archetypes. hp/dmg are scaled by region tier.
const ENEMIES = {
  grunt: { name: 'Grunt', hp: 30, dmg: 8, speed: 85, color: '#e53935', ai: 'melee', reach: 26, windup: 0.45, cd: 1.1, xp: 8, coin: [2, 4] },
  sword: { name: 'Swordsman', hp: 44, dmg: 11, speed: 95, color: '#fb8c00', ai: 'melee', weapon: 'esword', reach: 42, windup: 0.45, cd: 1.2, block: 0.25, xp: 12, coin: [3, 6] },
  archer: { name: 'Archer', hp: 26, dmg: 9, speed: 75, color: '#2e7d32', ai: 'archer', weapon: 'bow', range: 330, windup: 0.75, cd: 1.9, xp: 11, coin: [3, 5] },
  shield: { name: 'Guard', hp: 55, dmg: 10, speed: 62, color: '#1e88e5', ai: 'shield', weapon: 'shield', reach: 30, windup: 0.5, cd: 1.4, xp: 15, coin: [4, 7] },
  brute: { name: 'Brute', hp: 150, dmg: 20, speed: 55, color: '#8e24aa', ai: 'brute', scale: 1.5, reach: 46, windup: 0.8, cd: 2.0, armor: true, xp: 35, coin: [10, 16] },
  yeti: { name: 'Yeti', hp: 160, dmg: 20, speed: 60, color: '#b3e5fc', ai: 'brute', scale: 1.55, reach: 48, windup: 0.75, cd: 1.9, armor: true, fur: true, xp: 36, coin: [10, 16] },
  bat: { name: 'Bat', hp: 16, dmg: 7, speed: 130, color: '#5e35b1', ai: 'flyer', body: 'bat', flying: true, w: 26, h: 18, xp: 7, coin: [1, 3] },
  icebat: { name: 'Frost Bat', hp: 22, dmg: 9, speed: 140, color: '#4fc3f7', ai: 'flyer', body: 'bat', flying: true, w: 26, h: 18, chill: true, xp: 9, coin: [2, 3] },
  imp: { name: 'Imp', hp: 26, dmg: 10, speed: 115, color: '#ff7043', ai: 'flyer', body: 'imp', flying: true, shoots: true, w: 24, h: 24, xp: 12, coin: [2, 4] },
  ninja: { name: 'Ninja', hp: 40, dmg: 12, speed: 175, color: '#263238', ai: 'ninja', weapon: 'dagger', reach: 32, windup: 0.3, cd: 1.0, xp: 18, coin: [4, 8] },
  bomber: { name: 'Bomber', hp: 30, dmg: 16, speed: 65, color: '#fbc02d', ai: 'bomber', weapon: 'bomb', range: 300, windup: 0.6, cd: 2.2, xp: 13, coin: [3, 6] },
  mage: { name: 'Mage', hp: 36, dmg: 13, speed: 60, color: '#00acc1', ai: 'mage', weapon: 'staff', range: 360, windup: 0.8, cd: 2.6, xp: 16, coin: [4, 8] },
  slime: { name: 'Slime', hp: 22, dmg: 7, speed: 100, color: '#66bb6a', ai: 'hopper', body: 'slime', w: 26, h: 20, xp: 6, coin: [1, 3] },
  spider: { name: 'Spider', hp: 22, dmg: 8, speed: 140, color: '#4e342e', ai: 'crawler', body: 'spider', w: 28, h: 16, xp: 8, coin: [1, 3] },
  scorpion: { name: 'Scorpion', hp: 38, dmg: 12, speed: 95, color: '#a1887f', ai: 'crawler', body: 'scorpion', w: 34, h: 20, xp: 12, coin: [2, 5] },
  mummy: { name: 'Mummy', hp: 52, dmg: 11, speed: 55, color: '#d7ccc8', ai: 'melee', reach: 30, windup: 0.6, cd: 1.3, bandage: true, xp: 14, coin: [3, 6] },
  knight: { name: 'Dark Knight', hp: 90, dmg: 16, speed: 82, color: '#546e7a', ai: 'melee', weapon: 'esword', reach: 46, windup: 0.5, cd: 1.3, block: 0.45, scale: 1.15, helmet: true, xp: 30, coin: [6, 12] },
  shade: { name: 'Shade', hp: 1, dmg: 20, speed: 330, color: '#4a148c', ai: 'shade', xp: 0, coin: [0, 0], noLoot: true },
};

const REGIONS = [
  {
    id: 'meadow', name: 'Green Meadows', music: 'meadow', shape: 'hills', weather: null,
    sky: ['#4aa8ec', '#c4ecff'], sun: '#fff6c4', far: '#8fc2dc', mid: '#79b865', near: '#5a9e4c',
    ground: '#7a5230', groundDark: '#4e321c', top: '#5fbf3f', topDark: '#3e8f2a', plat: '#a0703f',
    decor: ['grass', 'flower', 'rock', 'bush', 'grass', 'flower'],
    pool: [['grunt', 6], ['slime', 3], ['bat', 2], ['archer', 2]],
    hazards: ['spikes'],
    mapColor: '#6fbf57',
    story: 'The Shadow Lord has shattered the Crystal of Light into six shards and scattered darkness across the land. You, a lone stick warrior, set out from Oakvale Village. First, the brute BIG BRUTO terrorizes the meadows...',
  },
  {
    id: 'woods', name: 'Whispering Woods', music: 'woods', shape: 'trees', weather: 'leaves',
    sky: ['#17312f', '#4a7a5c'], sun: '#e8f5e9', far: '#2c5244', mid: '#22402f', near: '#162a1f',
    ground: '#4a3426', groundDark: '#2b1d14', top: '#3c7d3a', topDark: '#285a27', plat: '#6b4a2e',
    decor: ['mushroom', 'grass', 'fern', 'stump', 'mushroom'],
    pool: [['grunt', 3], ['sword', 3], ['archer', 3], ['bat', 2], ['slime', 2], ['spider', 3]],
    hazards: ['spikes', 'saw'],
    tint: 'rgba(8,24,16,0.18)',
    mapColor: '#2f6b3c',
    story: 'Deep in the Whispering Woods, the spider queen ARACHNA guards the second shard. Watch your step... and the trees.',
  },
  {
    id: 'dunes', name: 'Scorching Dunes', music: 'dunes', shape: 'dunes', weather: 'sand',
    sky: ['#f39a3a', '#ffe1a0'], sun: '#fffbe0', far: '#e4ae6a', mid: '#d59650', near: '#c2803c',
    ground: '#d4a45c', groundDark: '#9c7236', top: '#efca83', topDark: '#c99a50', plat: '#a67c4a',
    decor: ['cactus', 'bones', 'rock', 'cactus'],
    pool: [['sword', 3], ['archer', 2], ['bomber', 3], ['mummy', 3], ['scorpion', 3]],
    hazards: ['spikes', 'saw', 'fall'],
    mapColor: '#e2b86a',
    story: 'Beyond the forest lie the Scorching Dunes. The undying pharaoh SETH-RA hoards the third shard inside his pyramid.',
  },
  {
    id: 'frost', name: 'Frostpeak Mountains', music: 'frost', shape: 'peaks', weather: 'snow',
    sky: ['#5c7ea8', '#d6e6f4'], sun: '#ffffff', far: '#b4c9de', mid: '#8aa5c0', near: '#6a849f',
    ground: '#7f9ab5', groundDark: '#4f6680', top: '#f4fbff', topDark: '#cfe2f0', plat: '#9fd4ef',
    decor: ['snowpile', 'pine', 'crystal', 'snowpile'],
    pool: [['shield', 3], ['archer', 2], ['yeti', 2], ['ninja', 2], ['icebat', 3], ['sword', 2]],
    hazards: ['ice', 'icicle', 'fall', 'spikes'],
    mapColor: '#dbe9f5',
    story: 'The air turns bitter cold. On the Frostpeak Mountains, the colossus GLACIUS sleeps upon the fourth shard.',
  },
  {
    id: 'volcano', name: 'Ember Volcano', music: 'volcano', shape: 'volcano', weather: 'embers',
    sky: ['#1e0a0a', '#7a2412'], sun: '#ffab91', far: '#461812', mid: '#32110e', near: '#200a08',
    ground: '#3b2a28', groundDark: '#1c1110', top: '#62403a', topDark: '#3a2420', plat: '#5a4038',
    decor: ['lavarock', 'bones', 'lavarock', 'rock'],
    pool: [['bomber', 2], ['mage', 3], ['brute', 2], ['ninja', 2], ['imp', 3], ['knight', 1]],
    hazards: ['lava', 'fire', 'spikes'],
    tint: 'rgba(80,10,0,0.12)',
    mapColor: '#8a3a26',
    story: 'The earth burns. Atop the Ember Volcano, the dragon IGNIVORE devours all who seek the fifth shard.',
  },
  {
    id: 'citadel', name: 'Shadow Citadel', music: 'citadel', shape: 'spires', weather: 'ash',
    sky: ['#0e0a19', '#3a2352'], sun: '#e1d5ff', far: '#281d3b', mid: '#1d152b', near: '#120c1c',
    ground: '#3d3a4a', groundDark: '#1c1a24', top: '#5d5872', topDark: '#3d3a4a', plat: '#4a4560',
    decor: ['torch', 'banner', 'skull', 'torch'],
    pool: [['knight', 3], ['mage', 2], ['ninja', 2], ['shield', 2], ['archer', 2], ['brute', 1]],
    hazards: ['saw', 'fire', 'spikes'],
    tint: 'rgba(20,0,40,0.16)',
    mapColor: '#4b3a66',
    story: 'The Shadow Citadel looms before you. The Shadow Lord awaits on his throne with the final shard. End this.',
  },
];

const BOSSES = {
  bruto: { name: 'BIG BRUTO', title: 'Tyrant of the Meadows', hp: 900, dmg: 16 },
  spider: { name: 'ARACHNA', title: 'Queen of the Whispering Woods', hp: 2000, dmg: 22 },
  pharaoh: { name: 'SETH-RA', title: 'The Undying Pharaoh', hp: 2800, dmg: 28 },
  golem: { name: 'GLACIUS', title: 'The Frost Colossus', hp: 8500, dmg: 36 },
  dragon: { name: 'IGNIVORE', title: 'The Inferno Dragon', hp: 6000, dmg: 44 },
  shadow: { name: 'THE SHADOW LORD', title: 'Master of the Citadel', hp: 18000, dmg: 52 },
};
const BOSS_ORDER = ['bruto', 'spider', 'pharaoh', 'golem', 'dragon', 'shadow'];

const UPGRADES = [
  { id: 'hp', name: 'Vitality', desc: '+20 Max HP', base: 60, grow: 1.42, max: 15 },
  { id: 'atk', name: 'Strength', desc: '+3 Attack', base: 80, grow: 1.47, max: 15 },
  { id: 'def', name: 'Toughness', desc: '-4% damage taken', base: 100, grow: 1.55, max: 10 },
  { id: 'en', name: 'Spirit', desc: '+20 Max Energy & faster regen', base: 90, grow: 1.5, max: 8 },
  { id: 'pot', name: 'Potion Bag', desc: '+1 potion capacity', base: 120, grow: 1.7, max: 4 },
];
function upgradePrice(u, lvl) { return Math.floor(u.base * Math.pow(u.grow, lvl)); }
function potionPrice(region) { return 30 + region * 12; }

// ---------- World map ----------
const NODE_NAMES = [
  ['Oakvale Village', 'Meadow Path', 'Windmill Hills', 'Hidden Grotto', 'Bandit Camp', "Bruto's Fort"],
  ['Mossy Hamlet', 'Twilight Trail', 'Mushroom Hollow', 'Fairy Ring', 'Old Rope Bridge', "Spider's Nest"],
  ['Oasis Bazaar', 'Dune Sea', 'Sunken Ruins', 'Lost Tomb', 'Scorpion Canyon', "Pharaoh's Pyramid"],
  ['Snowcap Lodge', 'Frozen Pass', 'Crystal Caves', 'Yeti Den', 'Avalanche Ridge', 'Glacier Throne'],
  ['Ashfall Outpost', 'Lava Fields', 'Magma Mines', 'Ember Vault', 'Caldera Rim', "Dragon's Peak"],
  ['Last Camp', 'Citadel Gates', 'Hall of Knights', 'Mirror Hall', 'Dark Spire', 'Throne of Shadows'],
];
const SIDE_TYPE = ['treasure', 'challenge', 'treasure', 'challenge', 'treasure', 'challenge'];
const NODE_TYPE_LABEL = { town: 'Town', level: 'Stage', boss: 'Boss Lair', treasure: 'Treasure Stage', challenge: 'Challenge Arena', arena: 'Endless Arena' };
const MAP_REGION_W = 430;
const MAP_W = 60 + 6 * MAP_REGION_W + 60;
const MAP_H = 360;

function buildMap() {
  const nodes = {};
  const list = [];
  const add = (n) => { n.adj = []; nodes[n.id] = n; list.push(n); return n; };
  const link = (a, b) => { nodes[a].adj.push(b); nodes[b].adj.push(a); };
  const layout = [[40, 250], [125, 170], [205, 240], [215, 108], [295, 165], [372, 236]];
  for (let r = 0; r < 6; r++) {
    const bx = 60 + r * MAP_REGION_W;
    const flip = r % 2 === 1;
    const pos = (i) => ({ x: bx + layout[i][0], y: flip ? 350 - layout[i][1] : layout[i][1] });
    add(Object.assign({ id: `r${r}-town`, type: 'town', region: r, name: NODE_NAMES[r][0] }, pos(0)));
    add(Object.assign({ id: `r${r}-l1`, type: 'level', idx: 0, region: r, name: NODE_NAMES[r][1] }, pos(1)));
    add(Object.assign({ id: `r${r}-l2`, type: 'level', idx: 1, region: r, name: NODE_NAMES[r][2] }, pos(2)));
    add(Object.assign({ id: `r${r}-side`, type: SIDE_TYPE[r], region: r, name: NODE_NAMES[r][3] }, pos(3)));
    add(Object.assign({ id: `r${r}-l3`, type: 'level', idx: 2, region: r, name: NODE_NAMES[r][4] }, pos(4)));
    add(Object.assign({ id: `r${r}-boss`, type: 'boss', region: r, name: NODE_NAMES[r][5] }, pos(5)));
    link(`r${r}-town`, `r${r}-l1`);
    link(`r${r}-l1`, `r${r}-l2`);
    link(`r${r}-l2`, `r${r}-side`);
    link(`r${r}-l2`, `r${r}-l3`);
    link(`r${r}-l3`, `r${r}-boss`);
    if (r > 0) link(`r${r - 1}-boss`, `r${r}-town`);
  }
  add({ id: 'arena', type: 'arena', region: 0, name: 'Grand Colosseum', x: 60 + 118, y: 60 + 20 });
  link('r0-town', 'arena');
  return { nodes, list };
}
const MAP = buildMap();

function levelDefFor(node) {
  const r = node.region;
  const seed = hashStr(node.id + ':v1');
  switch (node.type) {
    case 'level':
      return { kind: 'normal', region: r, diff: r + node.idx * 0.33, len: 115 + node.idx * 22 + r * 8, seed, tutorial: node.id === 'r0-l1', name: node.name, nodeId: node.id };
    case 'boss':
      return { kind: 'boss', region: r, diff: r + 0.9, len: 60, seed, boss: BOSS_ORDER[r], name: node.name, nodeId: node.id };
    case 'treasure':
      return { kind: 'treasure', region: r, diff: r + 0.4, len: 95, seed, name: node.name, nodeId: node.id };
    case 'challenge':
      return { kind: 'challenge', region: r, diff: r + 0.8, len: 0, seed, waves: 5, name: node.name, nodeId: node.id };
    case 'arena': {
      const top = highestRegionCleared();
      return { kind: 'endless', region: top, diff: top + 0.5, len: 0, seed: (Math.random() * 1e9) | 0, name: node.name, nodeId: node.id };
    }
  }
  return null;
}

function ambushDef(region) {
  return { kind: 'ambush', region, diff: region + 0.3, len: 0, seed: (Math.random() * 1e9) | 0, waves: 2, name: 'Ambush!', nodeId: null };
}

function highestRegionCleared() {
  let top = 0;
  for (let r = 0; r < 6; r++) if (SAVE && SAVE.done[`r${r}-boss`]) top = Math.min(5, r + 1);
  return Math.min(top, 5);
}

// ---------- Player progression ----------
function xpNeed(lvl) { return Math.floor(40 * Math.pow(lvl, 1.4)) + 20; }

function playerStats(save) {
  const lvl = save.lvl;
  return {
    maxHp: 100 + (lvl - 1) * 10 + save.up.hp * 20,
    atk: 10 + (lvl - 1) * 2 + save.up.atk * 3,
    def: Math.min(0.5, save.up.def * 0.04),
    maxEn: 100 + save.up.en * 20,
    enRegen: 3 + save.up.en * 0.8,
    potMax: 3 + save.up.pot,
  };
}

function defaultSave() {
  return {
    v: 1, lvl: 1, xp: 0, coins: 0, potions: 1,
    up: { hp: 0, atk: 0, def: 0, en: 0, pot: 0 },
    weapons: ['fists'], weapon: 'fists',
    skills: ['blast'], slots: ['blast', null],
    done: {}, ranks: {}, at: 'r0-town', seen: {},
    settings: { sfx: true, music: true, shake: true, ctrl: 1, alpha: 0.5, touch: 'auto' },
    stats: { kills: 0, deaths: 0, time: 0, bestCombo: 0 },
    arenaBest: 0, won: false, started: false,
  };
}
