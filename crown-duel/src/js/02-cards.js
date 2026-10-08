// ---------- Cards, units, arenas & progression tables ----------
// Distances are in tiles (the arena is 18 x 32 tiles), times in seconds, speeds in tiles/second.
// Stats are for level 1; every level adds 10% hit points and damage.

const MAX_LEVEL = 10;
const ONLINE_LEVEL = 6; // "tournament standard": every card and tower is this level in online battles
const LEVEL_MULT = (lvl) => Math.pow(1.1, lvl - 1);

const RARITY = {
  common: { name: 'Common', color: '#9fb4c8', dark: '#4f6275', copies: [2, 4, 10, 20, 40, 80, 150, 250, 400], xp: 1 },
  rare: { name: 'Rare', color: '#ff9f2e', dark: '#9a4d00', copies: [1, 2, 4, 8, 16, 28, 48, 80, 120], xp: 1.5 },
  epic: { name: 'Epic', color: '#c05cff', dark: '#5e1c8f', copies: [1, 1, 2, 3, 4, 6, 9, 12, 16], xp: 2 },
  legendary: { name: 'Legendary', color: '#3ff0d0', dark: '#0f7a6b', copies: [1, 1, 1, 1, 2, 2, 3, 3, 3], xp: 3 },
};
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
const UPGRADE_GOLD = [5, 20, 50, 150, 400, 1000, 2000, 4000, 8000];
const UPGRADE_XP = [4, 5, 6, 10, 25, 50, 100, 200, 400];
const KING_XP = [20, 50, 100, 200, 400, 800, 1600, 3000, 5000];

const TOWER_STATS = {
  princess: { hp: 2000, dmg: 72, hs: 0.8, range: 7.5, r: 1.5, proj: 'arrow', pspeed: 14 },
  king: { hp: 3200, dmg: 72, hs: 1.0, range: 7, r: 2, proj: 'cannonball', pspeed: 12 },
};

// Every unit that can appear on the battlefield (cards spawn these).
const UNITS = {
  knight: { name: 'Knight', hp: 1150, dmg: 135, hs: 1.2, load: 0.4, range: 1.0, speed: 1, r: 0.45, mass: 6, targets: 'ground' },
  archer: { name: 'Archer', hp: 200, dmg: 70, hs: 0.9, load: 0.3, range: 5, speed: 1, r: 0.35, mass: 3, targets: 'any', proj: 'arrow', pspeed: 12 },
  goblin: { name: 'Goblin', hp: 135, dmg: 80, hs: 1.1, load: 0.3, range: 0.6, speed: 2, r: 0.32, mass: 2, targets: 'ground' },
  speargob: { name: 'Spear Goblin', hp: 88, dmg: 45, hs: 1.7, load: 0.4, range: 5, speed: 2, r: 0.32, mass: 2, targets: 'any', proj: 'spear', pspeed: 11 },
  skeleton: { name: 'Skeleton', hp: 55, dmg: 55, hs: 1.0, load: 0.2, range: 0.6, speed: 1.5, r: 0.3, mass: 1, targets: 'ground' },
  bomber: { name: 'Bomber', hp: 220, dmg: 150, hs: 1.8, load: 0.5, range: 4.5, speed: 1, r: 0.35, mass: 3, targets: 'ground', proj: 'bomb', pspeed: 7, splash: 1.5 },
  barbarian: { name: 'Barbarian', hp: 460, dmg: 115, hs: 1.4, load: 0.4, range: 0.8, speed: 1, r: 0.45, mass: 5, targets: 'ground' },
  imp: { name: 'Imp', hp: 160, dmg: 70, hs: 1.0, load: 0.3, range: 1.6, speed: 1.5, r: 0.35, mass: 2, targets: 'any', air: true, proj: 'spit', pspeed: 10 },
  sprite: { name: 'Frost Sprite', hp: 150, dmg: 75, hs: 0.8, load: 0.2, range: 2.5, speed: 2, r: 0.3, mass: 1, targets: 'any', kamikaze: true, splash: 1.5, freeze: 1.2 },
  giant: { name: 'Giant', hp: 2700, dmg: 170, hs: 1.5, load: 0.5, range: 1.2, speed: 0.75, r: 0.75, mass: 18, targets: 'buildings' },
  musketeer: { name: 'Musketeer', hp: 480, dmg: 145, hs: 1.0, load: 0.4, range: 6, speed: 1, r: 0.4, mass: 5, targets: 'any', proj: 'bullet', pspeed: 16 },
  maiden: { name: 'Shieldmaiden', hp: 1250, dmg: 170, hs: 1.5, load: 0.5, range: 0.8, speed: 1, r: 0.45, mass: 7, targets: 'ground', splash: 1.4, splashSelf: true },
  boar: { name: 'Boar Rider', hp: 1050, dmg: 200, hs: 1.6, load: 0.5, range: 0.8, speed: 2, r: 0.55, mass: 7, targets: 'buildings', jump: true },
  berserker: { name: 'Berserker', hp: 780, dmg: 470, hs: 1.8, load: 0.4, range: 0.8, speed: 1.5, r: 0.45, mass: 6, targets: 'ground' },
  firemage: { name: 'Fire Mage', hp: 450, dmg: 185, hs: 1.4, load: 0.6, range: 5.5, speed: 1, r: 0.4, mass: 5, targets: 'any', proj: 'fireorb', pspeed: 9, splash: 1.5 },
  drakeling: { name: 'Drakeling', hp: 700, dmg: 100, hs: 1.5, load: 0.4, range: 3.5, speed: 1.5, r: 0.55, mass: 5, targets: 'any', air: true, proj: 'flame', pspeed: 9, splash: 1.5 },
  lancer: { name: 'Lancer', hp: 1100, dmg: 220, hs: 1.4, load: 0.4, range: 1.6, speed: 1, r: 0.6, mass: 10, targets: 'ground', charge: { dist: 2.5, speed: 2, mult: 2 } },
  balloon: { name: 'Bomb Balloon', hp: 1000, dmg: 440, hs: 3.0, load: 0.8, range: 0.3, speed: 1, r: 0.6, mass: 8, targets: 'buildings', air: true, deathDmg: { dmg: 150, r: 2.5 } },
  necro: { name: 'Necromancer', hp: 560, dmg: 75, hs: 1.1, load: 0.4, range: 5, speed: 1, r: 0.45, mass: 5, targets: 'any', proj: 'orb', pspeed: 9, splash: 1.0, spawn: { unit: 'skeleton', count: 3, every: 7, first: 1 } },
  juggernaut: { name: 'Juggernaut', hp: 2300, dmg: 530, hs: 1.8, load: 0.5, range: 1.2, speed: 0.75, r: 0.8, mass: 18, targets: 'ground' },
  golem: { name: 'Stone Golem', hp: 3800, dmg: 170, hs: 2.5, load: 0.6, range: 0.75, speed: 0.75, r: 0.9, mass: 20, targets: 'buildings', deathDmg: { dmg: 170, r: 2 }, deathSpawn: { unit: 'golemite', count: 2 } },
  golemite: { name: 'Golemite', hp: 780, dmg: 38, hs: 2.5, load: 0.6, range: 0.5, speed: 0.75, r: 0.55, mass: 10, targets: 'buildings', deathDmg: { dmg: 35, r: 1.5 } },
  stormmage: { name: 'Storm Mage', hp: 480, dmg: 75, hs: 1.8, load: 0.5, range: 5, speed: 1.5, r: 0.4, mass: 5, targets: 'any', chain: 2, stun: 0.5, deployZap: { dmg: 110, r: 2.5, stun: 0.5 } },
  tunneler: { name: 'Tunneler', hp: 700, dmg: 115, hs: 1.2, load: 0.4, range: 0.8, speed: 1.5, r: 0.45, mass: 6, targets: 'ground', towerMult: 0.35 },
  frostmage: { name: 'Frost Mage', hp: 470, dmg: 60, hs: 1.7, load: 0.5, range: 5.5, speed: 1, r: 0.4, mass: 5, targets: 'any', proj: 'ice', pspeed: 10, splash: 1.0, slow: 0.35, slowT: 2.5, deployZap: { dmg: 50, r: 3, slow: 0.35, slowT: 2.5 } },
  // buildings
  cannon: { name: 'Cannon', building: true, hp: 560, dmg: 105, hs: 0.9, load: 0.3, range: 5.5, r: 0.9, mass: 99, targets: 'ground', proj: 'cannonball', pspeed: 14, life: 30 },
  inferno: { name: 'Inferno Tower', building: true, hp: 1000, dmg: 20, hs: 0.4, load: 0.4, range: 6, r: 0.9, mass: 99, targets: 'any', beam: [20, 68, 270], life: 30 },
  tombstone: { name: 'Tombstone', building: true, hp: 300, r: 0.9, mass: 99, life: 40, spawn: { unit: 'skeleton', count: 1, every: 3.5, first: 1 }, deathSpawn: { unit: 'skeleton', count: 4 } },
  pump: { name: 'Elixir Pump', building: true, hp: 640, r: 0.9, mass: 99, life: 70, pump: 8.5 },
};

// Card list. `unit` + `count` for troops/buildings; spells carry their own numbers.
const CARDS = {
  knight: { name: 'Knight', rarity: 'common', cost: 3, type: 'troop', unit: 'knight', arena: 0, desc: 'A sturdy swordsman. Great value tank and defender for only 3 elixir.' },
  archers: { name: 'Archers', rarity: 'common', cost: 3, type: 'troop', unit: 'archer', count: 2, arena: 0, desc: 'Two archers that shoot ground and air targets from a safe distance.' },
  goblins: { name: 'Goblins', rarity: 'common', cost: 2, type: 'troop', unit: 'goblin', count: 3, arena: 0, desc: 'Three very fast stabbers. Fragile, but they shred tanks.' },
  skeletons: { name: 'Skeletons', rarity: 'common', cost: 1, type: 'troop', unit: 'skeleton', count: 3, arena: 0, desc: 'Three cheap bony fighters. Perfect for distracting big units.' },
  giant: { name: 'Giant', rarity: 'rare', cost: 5, type: 'troop', unit: 'giant', arena: 0, desc: 'Slow and huge. Ignores troops and pounds buildings and towers only.' },
  musketeer: { name: 'Musketeer', rarity: 'rare', cost: 4, type: 'troop', unit: 'musketeer', arena: 0, desc: 'Long-range sharpshooter that hits air and ground.' },
  arrows: { name: 'Arrows', rarity: 'common', cost: 3, type: 'spell', arena: 0, spell: 'arrows', dmg: 80, waves: 3, radius: 4, towerMult: 0.25, desc: 'Three volleys of arrows over a wide area. Wipes out swarms.' },
  fireball: { name: 'Fireball', rarity: 'rare', cost: 4, type: 'spell', arena: 0, spell: 'fireball', dmg: 460, radius: 2.5, towerMult: 0.3, knock: 1.2, desc: 'A blazing ball that deals heavy area damage and knocks troops back.' },
  speargobs: { name: 'Spear Goblins', rarity: 'common', cost: 2, type: 'troop', unit: 'speargob', count: 3, arena: 0, desc: 'Three goblins that throw spears at air and ground targets.' },
  bomber: { name: 'Bomber', rarity: 'common', cost: 2, type: 'troop', unit: 'bomber', arena: 0, desc: 'Lobs bombs that splash ground troops. Cannot hit air.' },
  drakeling: { name: 'Drakeling', rarity: 'epic', cost: 4, type: 'troop', unit: 'drakeling', arena: 0, desc: 'A flying baby dragon that breathes splash fire on air and ground.' },
  horde: { name: 'Bone Horde', rarity: 'epic', cost: 3, type: 'troop', unit: 'skeleton', count: 12, arena: 0, desc: 'Twelve skeletons that swarm and overwhelm anything on the ground.' },

  imps: { name: 'Imps', rarity: 'common', cost: 3, type: 'troop', unit: 'imp', count: 3, arena: 1, desc: 'Three flying imps that spit at air and ground targets.' },
  tombstone: { name: 'Tombstone', rarity: 'rare', cost: 3, type: 'building', unit: 'tombstone', arena: 1, desc: 'Raises a skeleton every few seconds, and four more when destroyed.' },
  necro: { name: 'Necromancer', rarity: 'epic', cost: 5, type: 'troop', unit: 'necro', arena: 1, desc: 'Casts dark splash magic and summons skeletons every 7 seconds.' },
  maiden: { name: 'Shieldmaiden', rarity: 'rare', cost: 4, type: 'troop', unit: 'maiden', arena: 1, desc: 'Swings her axe in a full circle, hitting every ground troop around her.' },

  barbarians: { name: 'Barbarians', rarity: 'common', cost: 5, type: 'troop', unit: 'barbarian', count: 4, arena: 2, desc: 'Four tough brawlers with big swords.' },
  cannon: { name: 'Cannon', rarity: 'common', cost: 3, type: 'building', unit: 'cannon', arena: 2, desc: 'A defensive cannon that pulls tanks away from your towers. Ground only.' },
  berserker: { name: 'Berserker', rarity: 'rare', cost: 4, type: 'troop', unit: 'berserker', arena: 2, desc: 'Double axes and huge single hits. Melts tanks.' },
  lancer: { name: 'Lancer', rarity: 'epic', cost: 5, type: 'troop', unit: 'lancer', arena: 2, desc: 'Charges after a short run and deals double damage with his first hit.' },

  sprite: { name: 'Frost Sprite', rarity: 'common', cost: 1, type: 'troop', unit: 'sprite', arena: 3, desc: 'Leaps onto enemies, dealing splash damage and freezing them briefly.' },
  zap: { name: 'Zap', rarity: 'common', cost: 2, type: 'spell', arena: 3, spell: 'zap', dmg: 130, radius: 2.5, towerMult: 0.3, stun: 0.5, desc: 'Instant lightning that damages and stuns. Resets charging attacks.' },
  freeze: { name: 'Freeze', rarity: 'epic', cost: 4, type: 'spell', arena: 3, spell: 'freeze', dmg: 70, radius: 3, towerMult: 0.3, freeze: 4, desc: 'Freezes troops, buildings and towers in the area for 4 seconds.' },
  frostmage: { name: 'Frost Mage', rarity: 'legendary', cost: 3, type: 'troop', unit: 'frostmage', arena: 3, desc: 'Ice blasts that slow enemies down. Chills the area when deployed.' },

  boar: { name: 'Boar Rider', rarity: 'rare', cost: 4, type: 'troop', unit: 'boar', arena: 4, desc: 'Very fast building hunter that leaps over the river.' },
  inferno: { name: 'Inferno Tower', rarity: 'rare', cost: 5, type: 'building', unit: 'inferno', arena: 4, desc: 'A beam whose damage grows the longer it locks on. Tank killer.' },
  balloon: { name: 'Bomb Balloon', rarity: 'epic', cost: 5, type: 'troop', unit: 'balloon', arena: 4, desc: 'Flies straight at buildings and drops heavy bombs. Explodes when popped.' },
  poison: { name: 'Poison', rarity: 'epic', cost: 4, type: 'spell', arena: 4, spell: 'poison', dmg: 50, dur: 8, radius: 3.5, towerMult: 0.3, slow: 0.15, desc: 'A toxic cloud that damages and slows everything inside for 8 seconds.' },

  firemage: { name: 'Fire Mage', rarity: 'rare', cost: 5, type: 'troop', unit: 'firemage', arena: 5, desc: 'Hurls fire orbs that splash air and ground troops.' },
  juggernaut: { name: 'Juggernaut', rarity: 'epic', cost: 7, type: 'troop', unit: 'juggernaut', arena: 5, desc: 'Armored war machine. Slow, but every swing is devastating.' },
  golem: { name: 'Stone Golem', rarity: 'epic', cost: 8, type: 'troop', unit: 'golem', arena: 5, desc: 'Enormous building hunter. Bursts into two golemites when destroyed.' },
  pump: { name: 'Elixir Pump', rarity: 'rare', cost: 6, type: 'building', unit: 'pump', arena: 5, desc: 'Pumps out 1 elixir every 8.5 seconds while it stands.' },

  stormmage: { name: 'Storm Mage', rarity: 'legendary', cost: 4, type: 'troop', unit: 'stormmage', arena: 6, desc: 'Zaps two targets at once, stunning them. Blasts the area when deployed.' },
  tunneler: { name: 'Tunneler', rarity: 'legendary', cost: 3, type: 'troop', unit: 'tunneler', arena: 7, anywhere: true, desc: 'Digs underground and pops up anywhere in the arena.' },
  log: { name: 'Log', rarity: 'legendary', cost: 2, type: 'spell', arena: 6, spell: 'log', dmg: 200, halfW: 1.9, travel: 10.5, speed: 7, towerMult: 0.2, knock: 1.0, desc: 'A spiked log that rolls forward, knocking back ground troops.' },
};
const CARD_KEYS = Object.keys(CARDS);
const STARTER_DECK = ['knight', 'archers', 'goblins', 'skeletons', 'giant', 'musketeer', 'arrows', 'fireball'];

const ARENAS = [
  { name: 'Meadow Grounds', min: 0, grass: ['#6cc24a', '#62b642'], edge: '#3f7a2b', path: '#c9b27a', water: '#3aa0e0', deco: 'trees', sky: ['#1d4d7a', '#0d1b33'] },
  { name: 'Bone Pit', min: 200, grass: ['#9bb45a', '#8fa650'], edge: '#5d5b3e', path: '#c2b59b', water: '#4a9bb8', deco: 'bones', sky: ['#3c3350', '#141226'] },
  { name: 'Barbarian Bowl', min: 450, grass: ['#b9a063', '#ae955a'], edge: '#7a5a35', path: '#d9c28f', water: '#3f95c9', deco: 'barrels', sky: ['#5a3a22', '#1c120a'] },
  { name: 'Frozen Peak', min: 750, grass: ['#d8e8f2', '#cadeea'], edge: '#7fa2bb', path: '#eef6fb', water: '#5ab6e8', deco: 'snow', sky: ['#35577a', '#0f1d30'] },
  { name: 'Jungle Temple', min: 1100, grass: ['#3fa65a', '#379a50'], edge: '#26663a', path: '#b89b62', water: '#2f9c9c', deco: 'jungle', sky: ['#1a4a3a', '#08180f'] },
  { name: 'Lava Forge', min: 1500, grass: ['#7c6f69', '#72655f'], edge: '#3f3533', path: '#a8958a', water: '#ff6a1f', deco: 'lava', sky: ['#5a1f10', '#1a0805'] },
  { name: 'Storm Summit', min: 2000, grass: ['#7aa4a0', '#709a96'], edge: '#3d5c62', path: '#c8d4d0', water: '#4f7bd8', deco: 'storm', sky: ['#28305a', '#0a0c1e'] },
  { name: 'Royal Crown', min: 2600, grass: ['#6fbf6a', '#66b561'], edge: '#8a6d1f', path: '#e8d7a0', water: '#39a7e6', deco: 'royal', sky: ['#4a2f73', '#140b26'] },
];

function arenaIndex(trophies) {
  let a = 0;
  for (let i = 0; i < ARENAS.length; i++) if (trophies >= ARENAS[i].min) a = i;
  return a;
}

// Cards of a given arena and below (AI decks; chests add every owned card on top).
function cardsForArena(a) {
  return CARD_KEYS.filter((k) => CARDS[k].arena <= a);
}

// ---- AI matchmaking tables ----
// Card level an opponent "should" have at a trophy count; the AI sits halfway between this and your deck.
const AI_EXPECTED = [[0, 1], [200, 3], [450, 4.8], [750, 5.8], [1100, 6.5], [1500, 7.1], [2000, 7.7], [2600, 8.4], [3600, 10]];
const AI_GAP = [-1.0, -0.8, -0.6, -0.4, -0.3, -0.3, -0.2, -0.1]; // per-arena level offset (the main difficulty knob)
const AI_CAP_ABOVE = 0.3; // below 2600 the AI is never more than this many levels above your deck
const AI_FLOOR_BELOW = 3; // ...and never more than this many levels below the expected curve
const AI_TOP_RAMP = 0.001; // extra levels per trophy above 2600 (bounded ladder in the top arena)
const AI_TOP_RAMP_MAX = 0.6;
const AI_MERCY = -0.5; // "Comeback match" after a losing streak
const AI_SKILL_CAP = 0.85;
const AI_SKILL_STEP = 0.10; // skill gained per arena

function expectedLevel(t) {
  const E = AI_EXPECTED;
  if (t <= E[0][0]) return E[0][1];
  for (let i = 1; i < E.length; i++) {
    if (t <= E[i][0]) return lerp(E[i - 1][1], E[i][1], (t - E[i - 1][0]) / (E[i][0] - E[i - 1][0]));
  }
  return E[E.length - 1][1];
}

const statCache = new Map();
// Scaled unit stats for a level. `lvl` is the card level (towers use the king level).
function unitStats(key, lvl) {
  const ck = key + '@' + lvl;
  let s = statCache.get(ck);
  if (s) return s;
  const u = UNITS[key];
  const m = LEVEL_MULT(lvl);
  s = Object.assign({ key, sight: 5.5, towerMult: 1 }, u);
  s.hp = Math.round(u.hp * m);
  if (u.dmg) s.dmg = Math.round(u.dmg * m);
  if (u.beam) s.beam = u.beam.map((v) => Math.round(v * m));
  if (u.deathDmg) s.deathDmg = { dmg: Math.round(u.deathDmg.dmg * m), r: u.deathDmg.r };
  if (u.deployZap) s.deployZap = Object.assign({}, u.deployZap, { dmg: Math.round(u.deployZap.dmg * m) });
  if (u.range > s.sight) s.sight = u.range + 0.5;
  s.kind = u.building ? 'building' : 'troop';
  statCache.set(ck, s);
  return s;
}

function spellStats(key, lvl) {
  const c = CARDS[key];
  const m = LEVEL_MULT(lvl);
  const s = Object.assign({}, c);
  s.dmg = Math.round(c.dmg * m);
  if (c.spell === 'freeze') s.freeze = c.freeze + (lvl - 1) * 0.1;
  return s;
}

function towerStats(tt, lvl) {
  const b = TOWER_STATS[tt];
  const m = LEVEL_MULT(lvl);
  return Object.assign({}, b, { hp: Math.round(b.hp * m), dmg: Math.round(b.dmg * m) });
}

// Short stat lines for the card info panel.
function cardStatLines(key, lvl) {
  const c = CARDS[key];
  const out = [];
  if (c.type === 'spell') {
    const s = spellStats(key, lvl);
    if (s.spell === 'arrows') out.push(['Damage', s.dmg + ' x' + s.waves]);
    else if (s.spell === 'poison') out.push(['Damage/sec', s.dmg], ['Duration', s.dur + 's']);
    else out.push(['Damage', s.dmg]);
    out.push(['Tower damage', Math.round((s.spell === 'poison' ? s.dmg * s.dur : s.spell === 'arrows' ? s.dmg * s.waves : s.dmg) * s.towerMult)]);
    if (s.radius) out.push(['Radius', s.radius]);
    if (s.stun) out.push(['Stun', s.stun + 's']);
    if (s.freeze) out.push(['Freeze', s.freeze.toFixed(1) + 's']);
    if (s.spell === 'log') out.push(['Range', s.travel]);
    return out;
  }
  const u = unitStats(c.unit, lvl);
  out.push(['Hitpoints', u.hp]);
  if (u.beam) out.push(['Damage', u.beam.join(' > ')]);
  else if (u.dmg) out.push(['Damage', u.chain ? u.dmg + ' x' + u.chain : u.dmg]);
  if (u.hs && u.dmg) out.push(['Hit speed', u.hs + 's']);
  if (u.range) out.push(['Range', u.range < 2 ? 'Melee' : u.range]);
  if (u.speed) out.push(['Speed', u.speed >= 2 ? 'Very fast' : u.speed >= 1.5 ? 'Fast' : u.speed >= 1 ? 'Medium' : 'Slow']);
  if (u.targets) out.push(['Targets', u.targets === 'any' ? 'Air & Ground' : u.targets === 'ground' ? 'Ground' : 'Buildings']);
  if (c.count > 1) out.push(['Count', 'x' + c.count]);
  if (u.life) out.push(['Lifetime', u.life + 's']);
  if (u.spawn) out.push(['Spawns', u.spawn.count + ' ' + UNITS[u.spawn.unit].name + (u.spawn.count > 1 ? 's' : '') + ' / ' + u.spawn.every + 's']);
  if (u.pump) out.push(['Elixir', '+1 / ' + u.pump + 's']);
  if (u.splash) out.push(['Splash', u.splash]);
  if (u.air) out.push(['Type', 'Flying']);
  return out;
}
