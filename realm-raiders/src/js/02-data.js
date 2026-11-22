// ---------- Game data: heroes, monsters, bosses, realms, blessings, gear, achievements ----------
// World units are pixels of a 1x zoom. Damage and health are level-1 base values; the hero's level,
// gear, camp upgrades and blessings multiply them.

const GAME_VER = 1;
const SIM_HZ = 60;
const SIM_DT = 1 / SIM_HZ;
const HERO_R = 18;
const ROOM_W = 1400;
const ROOM_H = 900;
const ARENA_W = 1560;
const ARENA_H = 1000;
const DASH_CD = 2.6;
const REVIVE_TIME = 1.8;
const BLEED_TIME = 22;

const RARITY = [
  { key: 'common', name: 'Common', color: '#c9d1e0' },
  { key: 'rare', name: 'Rare', color: '#4fb3ff' },
  { key: 'epic', name: 'Epic', color: '#c46bff' },
  { key: 'legendary', name: 'Legendary', color: '#ffb22e' },
  { key: 'mythic', name: 'Mythic', color: '#ff4f6d' },
];

const ROLE_COLOR = { Tank: '#6aa8ff', Fighter: '#ff9a4a', Mage: '#c46bff', Ranger: '#7be06a', Assassin: '#ff5d8f', Healer: '#5df0b0', Support: '#ffd84a', Summoner: '#9fa8ff' };

// basic.kind: melee (arc in front), shot (projectile), chain (instant lightning), thrust (line)
// skill.ai / ult.ai tell the bots when a power is worth using.
const HEROES = [
  {
    id: 'brand', name: 'Brand', title: 'Oathsworn Knight', role: 'Tank', color: '#4f7dff', color2: '#e8eeff', rarity: 0, unlock: { gold: 0 },
    hp: 640, spd: 200, armor: 0.2, look: { hat: 'helm', weapon: 'sword', wcol: '#dfe7f5' },
    basic: { kind: 'melee', dmg: 30, rate: 1.5, range: 66, arc: 1.9, knock: 90 },
    skill: { name: 'Shield Bash', cd: 6.5, ai: 'engage', desc: 'Charge forward, stunning and knocking back every foe in the way.' },
    ult: { name: 'Rallying Banner', ai: 'tank', desc: 'Plant a banner: allies near it take half damage and heal. Taunts nearby monsters and shields Brand.' },
    passive: { name: 'Bulwark', desc: 'Takes 20% less damage.' },
  },
  {
    id: 'ember', name: 'Ember', title: 'Pyromancer', role: 'Mage', color: '#ff5a2e', color2: '#ffd08a', rarity: 0, unlock: { gold: 0 },
    hp: 380, spd: 210, armor: 0, look: { hat: 'wizard', weapon: 'staff', wcol: '#ff7b2e' },
    basic: { kind: 'shot', dmg: 26, rate: 1.6, range: 430, spd: 540, r: 9, fx: 'fire', splash: 42, burn: 2 },
    skill: { name: 'Flame Wave', cd: 6, ai: 'cone', range: 230, desc: 'Breathe a wide cone of fire that burns everything it touches.' },
    ult: { name: 'Meteor Storm', ai: 'aoe', desc: 'Call down a storm of meteors on the enemy horde.' },
    passive: { name: 'Combustion', desc: 'Burning foes explode when they die.' },
  },
  {
    id: 'hawke', name: 'Hawke', title: 'Wind Ranger', role: 'Ranger', color: '#3fbf5a', color2: '#d9ffb8', rarity: 0, unlock: { gold: 0 },
    hp: 390, spd: 215, armor: 0, look: { hat: 'feather', weapon: 'bow', wcol: '#a8723c' },
    basic: { kind: 'shot', dmg: 28, rate: 1.55, range: 490, spd: 800, r: 6, fx: 'arrow' },
    skill: { name: 'Volley', cd: 5.5, ai: 'target', range: 420, desc: 'Fire a fan of seven piercing arrows.' },
    ult: { name: 'Arrow Rain', ai: 'aoe', desc: 'Darken the sky: arrows pour down on a wide area for three seconds.' },
    passive: { name: 'Eagle Eye', desc: 'Deals up to 30% more damage to distant targets.' },
  },
  {
    id: 'willow', name: 'Willow', title: 'Grove Druid', role: 'Healer', color: '#2fd6a0', color2: '#e6ffd0', rarity: 0, unlock: { gold: 0 },
    hp: 430, spd: 210, armor: 0.05, look: { hat: 'leaves', weapon: 'staff', wcol: '#7cff8a' },
    basic: { kind: 'shot', dmg: 22, rate: 1.6, range: 400, spd: 500, r: 8, fx: 'leaf' },
    skill: { name: 'Healing Bloom', cd: 8.5, ai: 'heal', desc: 'Grow a flower field that heals allies standing in it.' },
    ult: { name: 'Grove of Life', ai: 'revive', desc: 'Revive every fallen ally nearby, heal the whole party and root foes in place.' },
    passive: { name: 'Verdant Aura', desc: 'Allies near Willow regenerate health.' },
  },
  {
    id: 'rime', name: 'Rime', title: 'Frost Witch', role: 'Mage', color: '#58c8ff', color2: '#e8fbff', rarity: 1, unlock: { gold: 600 },
    hp: 400, spd: 205, armor: 0, look: { hat: 'icecrown', weapon: 'wand', wcol: '#a8eaff' },
    basic: { kind: 'shot', dmg: 22, rate: 1.8, range: 420, spd: 620, r: 7, fx: 'ice', pierce: 1, slow: 0.3 },
    skill: { name: 'Frost Nova', cd: 8, ai: 'nova', range: 160, desc: 'Blast frost around you, freezing nearby foes solid.' },
    ult: { name: 'Blizzard', ai: 'aoe', desc: 'Summon a blizzard that slows, shreds and freezes everything inside.' },
    passive: { name: 'Shatter', desc: 'Frozen foes take 40% more damage.' },
  },
  {
    id: 'gale', name: 'Gale', title: 'Wind Monk', role: 'Fighter', color: '#9be7ff', color2: '#fff4d6', rarity: 1, unlock: { gold: 600 },
    hp: 470, spd: 240, armor: 0.08, look: { hat: 'band', weapon: 'fist', wcol: '#ffe2a8' },
    basic: { kind: 'melee', dmg: 22, rate: 2.4, range: 58, arc: 1.3, knock: 110 },
    skill: { name: 'Cyclone Kick', cd: 5, ai: 'engage', desc: 'Spin through the enemy line, kicking foes away. Untouchable while spinning.' },
    ult: { name: 'Tornado', ai: 'aoe', desc: 'Unleash a roaming tornado that drags foes in and shreds them.' },
    passive: { name: 'Windwalk', desc: 'Moves faster and dodges 15% of attacks.' },
  },
  {
    id: 'gizmo', name: 'Gizmo', title: 'Gadgeteer', role: 'Summoner', color: '#ffb02e', color2: '#fff0c8', rarity: 1, unlock: { gold: 900 },
    hp: 400, spd: 205, armor: 0.05, look: { hat: 'goggles', weapon: 'gun', wcol: '#8a96a8' },
    basic: { kind: 'shot', dmg: 11, rate: 4.4, range: 390, spd: 680, r: 5, fx: 'rivet', spread: 0.12 },
    skill: { name: 'Deploy Turret', cd: 7, ai: 'summon', desc: 'Drop an auto-turret that shoots nearby foes (up to two at once).' },
    ult: { name: 'Rocket Barrage', ai: 'aoe', desc: 'Fire a swarm of homing rockets.' },
    passive: { name: 'Overclock', desc: 'Each of your turrets gives you +15% attack speed.' },
  },
  {
    id: 'volt', name: 'Volt', title: 'Storm Caller', role: 'Mage', color: '#ffe23f', color2: '#fffbe0', rarity: 1, unlock: { gold: 900 },
    hp: 380, spd: 220, armor: 0, look: { hat: 'spikes', weapon: 'wand', wcol: '#fff36a' },
    basic: { kind: 'chain', dmg: 24, rate: 1.5, range: 380, jumps: 2, jump: 150 },
    skill: { name: 'Thunder Dash', cd: 6, ai: 'engage', desc: 'Become lightning and blink forward, shocking everything you pass.' },
    ult: { name: 'Thunderstorm', ai: 'aoe', desc: 'A storm follows you, striking foes around you again and again.' },
    passive: { name: 'Overload', desc: 'Every 4th attack chains to five targets.' },
  },
  {
    id: 'nyx', name: 'Nyx', title: 'Shadow Blade', role: 'Assassin', color: '#a24dff', color2: '#ffd1f5', rarity: 2, unlock: { gold: 1500 },
    hp: 400, spd: 235, armor: 0, look: { hat: 'hood', weapon: 'daggers', wcol: '#d6c8ff' },
    basic: { kind: 'melee', dmg: 20, rate: 3, range: 56, arc: 1.4, knock: 30 },
    skill: { name: 'Shadow Step', cd: 5, ai: 'engage', desc: 'Teleport behind a foe and vanish. Your next three hits are critical.' },
    ult: { name: 'Death Lotus', ai: 'melee', desc: 'Become a whirl of blades, cutting every foe around you. Untouchable while it lasts.' },
    passive: { name: 'Killer Instinct', desc: '+25% critical chance. Critical hits deal 220% damage.' },
  },
  {
    id: 'krag', name: 'Krag', title: 'Berserker', role: 'Fighter', color: '#d8433a', color2: '#ffd2b0', rarity: 2, unlock: { gold: 1500 },
    hp: 560, spd: 215, armor: 0.1, look: { hat: 'horns', weapon: 'axe', wcol: '#c6ccd8' },
    basic: { kind: 'melee', dmg: 40, rate: 1.1, range: 74, arc: 2.4, knock: 120 },
    skill: { name: 'Whirlwind', cd: 7, ai: 'nova', range: 110, desc: 'Spin your axe for two seconds, hitting everything around you while you move.' },
    ult: { name: 'Blood Rage', ai: 'buff', desc: 'Grow huge and enraged: much faster attacks, speed, damage and lifesteal.' },
    passive: { name: 'Fury', desc: 'Deals up to 50% more damage as health drops.' },
  },
  {
    id: 'vex', name: 'Vex', title: 'Plague Witch', role: 'Mage', color: '#8fe03a', color2: '#f2ffc8', rarity: 2, unlock: { gold: 2000 },
    hp: 390, spd: 215, armor: 0, look: { hat: 'witch', weapon: 'wand', wcol: '#b6ff4a' },
    basic: { kind: 'shot', dmg: 12, rate: 2.2, range: 420, spd: 640, r: 5, fx: 'poison', poison: 1 },
    skill: { name: 'Toxic Cloud', cd: 7.5, ai: 'target', range: 420, desc: 'Hurl a cloud of plague that poisons and slows foes inside.' },
    ult: { name: 'Plague Burst', ai: 'poison', desc: 'Detonate all poison at once and spread it to nearby foes.' },
    passive: { name: 'Venom', desc: 'Poisoned foes deal 20% less damage.' },
  },
  {
    id: 'morrow', name: 'Morrow', title: 'Necromancer', role: 'Summoner', color: '#7f8cb0', color2: '#d6ffe8', rarity: 2, unlock: { gold: 2000 },
    hp: 400, spd: 205, armor: 0.05, look: { hat: 'hood', weapon: 'scythe', wcol: '#9affc6' },
    basic: { kind: 'shot', dmg: 24, rate: 1.4, range: 410, spd: 520, r: 8, fx: 'bone' },
    skill: { name: 'Raise Dead', cd: 8.5, ai: 'summon', desc: 'Raise two skeleton warriors to fight for you.' },
    ult: { name: 'Soul Harvest', ai: 'aoe', desc: 'Rip the souls from every foe nearby, healing your party and raising champions.' },
    passive: { name: 'Gravecall', desc: 'Foes you kill sometimes rise as skeletons.' },
  },
  {
    id: 'lyra', name: 'Lyra', title: 'Battle Bard', role: 'Support', color: '#ff7ad1', color2: '#fff0fa', rarity: 2, unlock: { gold: 2500 },
    hp: 420, spd: 220, armor: 0.05, look: { hat: 'bard', weapon: 'lute', wcol: '#ffb86a' },
    basic: { kind: 'shot', dmg: 18, rate: 1.6, range: 320, spd: 540, r: 15, fx: 'sound', pierce: 3 },
    skill: { name: 'Battle Hymn', cd: 10, ai: 'buff', desc: 'Inspire the party: faster attacks, faster feet and more damage.' },
    ult: { name: 'Crescendo', ai: 'aoe', desc: 'A sonic boom stuns every foe on screen and heals the party.' },
    passive: { name: 'Encore', desc: 'Allies near Lyra deal 10% more damage.' },
  },
  {
    id: 'atlas', name: 'Atlas', title: 'Stone Titan', role: 'Tank', color: '#b08a5a', color2: '#f0e0c8', rarity: 2, unlock: { gold: 2500 },
    hp: 680, spd: 190, armor: 0.25, look: { hat: 'rock', weapon: 'fist', wcol: '#8d7a62' },
    basic: { kind: 'melee', dmg: 32, rate: 1.2, range: 62, arc: 1.5, knock: 170 },
    skill: { name: 'Boulder Toss', cd: 7, ai: 'target', range: 420, desc: 'Hurl a boulder that stuns everything where it lands.' },
    ult: { name: 'Earthquake', ai: 'aoe', desc: 'Three shockwaves ripple out from Atlas, stunning foes.' },
    passive: { name: 'Stone Skin', desc: 'Gains a shield after a few seconds without being hit.' },
  },
  {
    id: 'sol', name: 'Sol', title: 'Dawn Cleric', role: 'Healer', color: '#ffd23f', color2: '#ffffff', rarity: 3, unlock: { gold: 3500 },
    hp: 450, spd: 210, armor: 0.1, look: { hat: 'halo', weapon: 'staff', wcol: '#fff1a0' },
    basic: { kind: 'shot', dmg: 22, rate: 1.6, range: 420, spd: 580, r: 9, fx: 'holy' },
    skill: { name: 'Sanctuary', cd: 9, ai: 'shield', desc: 'Shield every nearby ally and cleanse their ailments.' },
    ult: { name: 'Divine Intervention', ai: 'revive', desc: 'Make the whole party invulnerable, revive the fallen and heal everyone.' },
    passive: { name: 'Grace', desc: 'Each hit heals the most wounded ally nearby.' },
  },
  {
    id: 'chrona', name: 'Chrona', title: 'Time Weaver', role: 'Support', color: '#53e0d0', color2: '#fff2c6', rarity: 3, unlock: { ach: 'realm3' },
    hp: 400, spd: 210, armor: 0.05, look: { hat: 'clock', weapon: 'staff', wcol: '#ffe08a' },
    basic: { kind: 'shot', dmg: 24, rate: 1.5, range: 420, spd: 560, r: 8, fx: 'time', slow: 0.2 },
    skill: { name: 'Rewind', cd: 9, ai: 'escape', desc: 'Return to where you were three seconds ago, with the health you had then.' },
    ult: { name: 'Time Stop', ai: 'aoe', desc: 'Freeze time for every foe. Your party keeps moving.' },
    passive: { name: 'Haste', desc: 'Skills recharge 15% faster and attacks are 10% faster.' },
  },
  {
    id: 'umbra', name: 'Umbra', title: 'Void Seer', role: 'Mage', color: '#6a3cff', color2: '#ff8af0', rarity: 3, unlock: { ach: 'abyss10' },
    hp: 390, spd: 210, armor: 0, look: { hat: 'voideye', weapon: 'orb', wcol: '#b07bff' },
    basic: { kind: 'shot', dmg: 30, rate: 1.2, range: 400, spd: 400, r: 11, fx: 'void', pierce: 1, homing: 2.5 },
    skill: { name: 'Black Hole', cd: 8.5, ai: 'target', range: 420, desc: 'Open a black hole that drags foes together and crushes them.' },
    ult: { name: 'Collapse', ai: 'aoe', desc: 'Open a giant singularity that pulls everything in, then explodes.' },
    passive: { name: 'Entropy', desc: 'Foes inside your void zones take 25% more damage.' },
  },
  {
    id: 'drakon', name: 'Drakon', title: 'Dragon Knight', role: 'Fighter', color: '#e8542e', color2: '#ffe0a0', rarity: 3, unlock: { ach: 'boss_glacia' },
    hp: 520, spd: 210, armor: 0.12, look: { hat: 'dragon', weapon: 'spear', wcol: '#ffcf6a' },
    basic: { kind: 'thrust', dmg: 32, rate: 1.4, range: 96, width: 30, knock: 80 },
    skill: { name: 'Dragon Leap', cd: 7, ai: 'leap', range: 280, desc: 'Leap into the air and crash down in a burst of flame.' },
    ult: { name: 'Dragonform', ai: 'buff', desc: 'Become a dragon for 8 seconds: bigger, tougher, breathing fire.' },
    passive: { name: 'Dragonblood', desc: 'Immune to burning. Deals 15% more damage to burning foes.' },
  },
];
const HERO_BY_ID = {};
for (const h of HEROES) HERO_BY_ID[h.id] = h;

// ---------- Monsters ----------
// ai: melee | contact | ranged | charger | caster | bomber | leaper | summoner | ringer | blinker | laser | slammer | lobber
const MOBS = {
  // Whispering Woods
  slime: { name: 'Slime', ai: 'contact', hp: 42, spd: 95, r: 17, dmg: 10, look: { shape: 'slime', color: '#5fd35a' }, split: { id: 'slimelet', n: 2 }, gold: 2 },
  slimelet: { name: 'Slimelet', ai: 'contact', hp: 14, spd: 130, r: 10, dmg: 6, look: { shape: 'slime', color: '#8be86a' }, gold: 0, minion: true },
  goblin: { name: 'Goblin', ai: 'melee', hp: 46, spd: 150, r: 15, dmg: 12, reach: 30, wind: 0.38, cd: 1.3, look: { shape: 'goblin', color: '#7fb43c' }, gold: 2 },
  archer: { name: 'Goblin Archer', ai: 'ranged', hp: 36, spd: 115, r: 15, dmg: 10, keep: 300, cd: 2.2, shot: { spd: 330, r: 6, n: 1, kind: 'arrow', color: '#e8d5a0' }, look: { shape: 'goblin', color: '#6f9e3a', hood: true, weapon: 'bow' }, gold: 3 },
  shroom: { name: 'Sporecap', ai: 'caster', hp: 70, spd: 70, r: 18, dmg: 7, keep: 280, cd: 3.6, cast: { r: 75, delay: 0.9, zone: 'spore', dur: 3 }, look: { shape: 'shroom', color: '#d65a8a' }, gold: 3 },
  wolf: { name: 'Timber Wolf', ai: 'charger', hp: 56, spd: 165, r: 16, dmg: 16, cd: 3, look: { shape: 'wolf', color: '#8c8f98' }, gold: 3 },
  sapling: { name: 'Sapling', ai: 'melee', hp: 40, spd: 120, r: 14, dmg: 10, reach: 26, wind: 0.4, cd: 1.4, look: { shape: 'tree', color: '#5a9e3a' }, gold: 0, minion: true },
  // Sunken Crypt
  skeleton: { name: 'Skeleton', ai: 'melee', hp: 70, spd: 125, r: 16, dmg: 15, reach: 32, wind: 0.36, cd: 1.3, look: { shape: 'skull', color: '#e8e4d8', weapon: 'sword' }, gold: 3 },
  skelarcher: { name: 'Bone Archer', ai: 'ranged', hp: 54, spd: 110, r: 15, dmg: 13, keep: 320, cd: 2.1, shot: { spd: 360, r: 6, n: 1, kind: 'bone', color: '#f0ead8' }, look: { shape: 'skull', color: '#d8d2c0', weapon: 'bow' }, gold: 3 },
  ghost: { name: 'Wraith', ai: 'contact', hp: 58, spd: 135, r: 16, dmg: 14, flyer: true, look: { shape: 'ghost', color: '#a8c8ff' }, gold: 3 },
  bonemage: { name: 'Bone Mage', ai: 'ringer', hp: 80, spd: 90, r: 17, dmg: 12, keep: 260, cd: 3.2, ring: { n: 10, spd: 210, r: 7, color: '#9affc6' }, look: { shape: 'skull', color: '#cfe8d8', hat: 'mage' }, gold: 4 },
  gargoyle: { name: 'Gargoyle', ai: 'leaper', hp: 100, spd: 120, r: 19, dmg: 22, cd: 3.4, look: { shape: 'gargoyle', color: '#8a8f9e' }, gold: 4 },
  // Ember Depths
  imp: { name: 'Imp', ai: 'ranged', hp: 58, spd: 160, r: 14, dmg: 15, keep: 260, cd: 1.9, flyer: true, shot: { spd: 300, r: 8, n: 1, kind: 'fire', color: '#ff7b2e', homing: 1.2 }, look: { shape: 'imp', color: '#e8453a' }, gold: 4 },
  magma: { name: 'Magma Slime', ai: 'contact', hp: 90, spd: 100, r: 19, dmg: 16, look: { shape: 'slime', color: '#ff6a1e', glow: true }, split: { id: 'magmalet', n: 2 }, deathZone: 'lava', gold: 4 },
  magmalet: { name: 'Ember Blob', ai: 'contact', hp: 26, spd: 135, r: 11, dmg: 9, look: { shape: 'slime', color: '#ffa040', glow: true }, gold: 0, minion: true },
  hound: { name: 'Hellhound', ai: 'charger', hp: 85, spd: 175, r: 17, dmg: 22, cd: 2.8, trail: true, look: { shape: 'wolf', color: '#b8322a', glow: true }, gold: 4 },
  elemental: { name: 'Fire Spirit', ai: 'caster', hp: 90, spd: 95, r: 17, dmg: 26, keep: 300, cd: 3.2, flyer: true, cast: { r: 80, delay: 0.85, zone: 'pillar' }, look: { shape: 'flame', color: '#ffb02e' }, gold: 4 },
  brute: { name: 'Demon Brute', ai: 'slammer', hp: 340, spd: 80, r: 28, dmg: 34, cd: 2.6, look: { shape: 'brute', color: '#a83a5a' }, heavy: true, gold: 8 },
  // Frostfang Peaks
  icewolf: { name: 'Ice Wolf', ai: 'charger', hp: 110, spd: 180, r: 17, dmg: 24, cd: 2.8, slowHit: true, look: { shape: 'wolf', color: '#bfe6ff' }, gold: 5 },
  yeti: { name: 'Yeti', ai: 'lobber', hp: 380, spd: 85, r: 27, dmg: 36, keep: 240, cd: 3, look: { shape: 'yeti', color: '#eef6ff' }, heavy: true, gold: 8 },
  wisp: { name: 'Frost Wisp', ai: 'bomber', hp: 60, spd: 150, r: 13, dmg: 40, flyer: true, look: { shape: 'wisp', color: '#7fe0ff' }, gold: 4 },
  icearcher: { name: 'Frost Archer', ai: 'ranged', hp: 90, spd: 115, r: 15, dmg: 17, keep: 330, cd: 2.4, shot: { spd: 380, r: 6, n: 3, spread: 0.28, kind: 'ice', color: '#a8eaff', slow: true }, look: { shape: 'goblin', color: '#7fa8c8', hood: true, weapon: 'bow' }, gold: 5 },
  frostknight: { name: 'Frozen Knight', ai: 'melee', hp: 260, spd: 105, r: 21, dmg: 30, reach: 38, wind: 0.45, cd: 1.6, shield: 0.5, look: { shape: 'knight', color: '#8fc0e8' }, heavy: true, gold: 7 },
  // Void Citadel
  voidling: { name: 'Voidling', ai: 'contact', hp: 44, spd: 190, r: 12, dmg: 14, look: { shape: 'voidling', color: '#7a4dff' }, gold: 2 },
  shadowknight: { name: 'Shadow Knight', ai: 'blinker', hp: 230, spd: 130, r: 19, dmg: 34, reach: 36, wind: 0.42, cd: 1.5, look: { shape: 'knight', color: '#40305e' }, gold: 7 },
  eye: { name: 'Watcher', ai: 'laser', hp: 160, spd: 70, r: 20, dmg: 34, keep: 340, cd: 3.3, flyer: true, look: { shape: 'eye', color: '#ff4f9a' }, gold: 6 },
  voidcaster: { name: 'Void Caller', ai: 'caster', hp: 150, spd: 95, r: 17, dmg: 22, keep: 310, cd: 3.6, cast: { r: 110, delay: 0.8, zone: 'gravity', dur: 2.2 }, look: { shape: 'skull', color: '#b48aff', hat: 'mage' }, gold: 6 },
  horror: { name: 'Void Horror', ai: 'summoner', hp: 420, spd: 70, r: 30, dmg: 30, cd: 4.5, summon: { id: 'voidling', n: 2, max: 6 }, look: { shape: 'horror', color: '#3c2a6a' }, heavy: true, gold: 10 },
};

// ---------- Bosses ----------
const BOSSES = {
  gorethorn: { name: 'Gorethorn', title: 'The Treant King', hp: 3400, r: 62, spd: 70, dmg: 20, color: '#5e8a34', color2: '#a6d36a', shape: 'treant', moves: ['roots', 'ring', 'summon', 'slam'], p2: ['roots', 'ring2', 'summon', 'slam', 'charge'], summon: 'sapling' },
  morvane: { name: 'Morvane', title: 'The Bone Lich', hp: 4200, r: 52, spd: 85, dmg: 22, color: '#cfe8d8', color2: '#9affc6', shape: 'lich', moves: ['spiral', 'summon', 'blink', 'fan'], p2: ['spiral2', 'summon', 'blink', 'fan', 'beam'], summon: 'skeleton' },
  infernus: { name: 'Infernus', title: 'The Molten Golem', hp: 5200, r: 66, spd: 65, dmg: 28, color: '#8a3a2a', color2: '#ff8a2e', shape: 'golem', moves: ['meteors', 'ring', 'slam', 'pools'], p2: ['meteors2', 'ring2', 'slam', 'pools', 'charge'], summon: 'magma' },
  glacia: { name: 'Glacia', title: 'The Frost Wyrm', hp: 6000, r: 60, spd: 95, dmg: 30, color: '#6ab8e8', color2: '#e8fbff', shape: 'wyrm', moves: ['breath', 'icicles', 'orbs', 'sweep'], p2: ['breath', 'icicles2', 'orbs', 'sweep', 'summon'], summon: 'wisp' },
  hollow: { name: 'The Hollow King', title: 'Lord of the Void', hp: 7600, r: 58, spd: 100, dmg: 34, color: '#2a1e48', color2: '#b07bff', shape: 'king', moves: ['waves', 'summon', 'beams', 'blink'], p2: ['waves2', 'summon', 'beams2', 'blink', 'spiral'], summon: 'shadowknight' },
};

// ---------- Realms ----------
const REALMS = [
  { id: 1, key: 'woods', name: 'Whispering Woods', boss: 'gorethorn', mobs: ['slime', 'goblin', 'archer', 'shroom', 'wolf'], heavy: [], hp: 1, dmg: 1, power: 1,
    pal: { f1: '#2c4a2a', f2: '#33552e', line: '#243e22', wall: '#1a2e18', deco: '#4f7a3a', obst: 'tree', accent: '#9be36a', sky: '#0e1a0d' } },
  { id: 2, key: 'crypt', name: 'Sunken Crypt', boss: 'morvane', mobs: ['skeleton', 'skelarcher', 'ghost', 'bonemage', 'gargoyle'], heavy: [], hp: 2.1, dmg: 1.45, power: 6,
    pal: { f1: '#2a2838', f2: '#302e42', line: '#22202e', wall: '#16141f', deco: '#4a4766', obst: 'pillar', accent: '#9affc6', sky: '#0c0b12' } },
  { id: 3, key: 'ember', name: 'Ember Depths', boss: 'infernus', mobs: ['imp', 'magma', 'hound', 'elemental', 'brute'], heavy: ['brute'], hp: 3.8, dmg: 2.05, power: 12,
    pal: { f1: '#3a1f18', f2: '#45241a', line: '#2e1812', wall: '#1e0f0b', deco: '#7a3a22', obst: 'rock', accent: '#ff8a2e', sky: '#140806' } },
  { id: 4, key: 'frost', name: 'Frostfang Peaks', boss: 'glacia', mobs: ['icewolf', 'yeti', 'wisp', 'icearcher', 'frostknight'], heavy: ['yeti', 'frostknight'], hp: 6.4, dmg: 2.7, power: 18,
    pal: { f1: '#2a3a4e', f2: '#31435a', line: '#24334a', wall: '#152030', deco: '#6a8aaa', obst: 'crystal', accent: '#a8eaff', sky: '#0a1018' } },
  { id: 5, key: 'void', name: 'Void Citadel', boss: 'hollow', mobs: ['voidling', 'shadowknight', 'eye', 'voidcaster', 'horror'], heavy: ['horror', 'shadowknight'], hp: 10, dmg: 3.4, power: 24,
    pal: { f1: '#1e1630', f2: '#251b3a', line: '#181226', wall: '#0e0a18', deco: '#4a3a7a', obst: 'obelisk', accent: '#b07bff', sky: '#07050c' } },
];
const ARENA_PAL = { f1: '#2a2f45', f2: '#30364f', line: '#232839', wall: '#151927', deco: '#4c5680', obst: 'pillar', accent: '#ffd23f', sky: '#0b0d16' };

const DIFFS = [
  { key: 'normal', name: 'Normal', hp: 1, dmg: 1, gold: 1, ilvl: 0, color: '#7be06a' },
  { key: 'heroic', name: 'Heroic', hp: 2.6, dmg: 1.7, gold: 1.8, ilvl: 8, color: '#ffb22e' },
  { key: 'mythic', name: 'Mythic', hp: 6, dmg: 2.6, gold: 3, ilvl: 16, color: '#ff4f6d' },
];

// Elite monsters get one affix.
const ELITE_AFFIX = [
  { key: 'swift', name: 'Swift', color: '#7fe0ff' },
  { key: 'brutal', name: 'Brutal', color: '#ff5a4a' },
  { key: 'armored', name: 'Armored', color: '#c8d0e0' },
  { key: 'volatile', name: 'Volatile', color: '#ffb02e' },
  { key: 'frozen', name: 'Frostbound', color: '#a8eaff' },
  { key: 'vampiric', name: 'Vampiric', color: '#ff4f9a' },
];

// Rewards offered on room portals.
const REWARDS = {
  bless: { name: 'Blessing', color: '#ffd23f', desc: 'Choose a blessing' },
  gold: { name: 'Gold Hoard', color: '#ffc21a', desc: 'A pile of gold' },
  gear: { name: 'Gear Chest', color: '#c46bff', desc: 'New equipment' },
  heal: { name: 'Spring', color: '#5df0b0', desc: 'Heal and revive the party' },
  elite: { name: 'Elite Den', color: '#ff5a4a', desc: 'Tough fight, blessing + gear' },
};

// ---------- Blessings (in-run upgrades) ----------
// m: stat mods added per stack. Stats: dmg as ms hp crit critDmg cdr ult ls thorns armor regen gold multi pierce
const BLESSINGS = [
  { id: 'might', name: 'Might', rar: 0, max: 10, m: { dmg: 0.12 }, desc: '+12% damage' },
  { id: 'haste', name: 'Haste', rar: 0, max: 8, m: { as: 0.12 }, desc: '+12% attack speed' },
  { id: 'swift', name: 'Fleet Foot', rar: 0, max: 5, m: { ms: 0.08 }, desc: '+8% move speed' },
  { id: 'vigor', name: 'Vigor', rar: 0, max: 8, m: { hp: 0.16 }, desc: '+16% max health' },
  { id: 'focus', name: 'Focus', rar: 0, max: 5, m: { cdr: 0.1 }, desc: 'Skill recharges 10% faster' },
  { id: 'fury', name: 'Fury', rar: 0, max: 5, m: { ult: 0.2 }, desc: 'Ultimate charges 20% faster' },
  { id: 'keen', name: 'Keen Edge', rar: 0, max: 6, m: { crit: 0.06 }, desc: '+6% critical chance' },
  { id: 'brutal', name: 'Brutality', rar: 0, max: 6, m: { critDmg: 0.25 }, desc: '+25% critical damage' },
  { id: 'iron', name: 'Iron Skin', rar: 0, max: 4, m: { armor: 0.08 }, desc: 'Take 8% less damage' },
  { id: 'regen', name: 'Renewal', rar: 0, max: 5, m: { regen: 0.006 }, desc: 'Regenerate 0.6% health per second' },
  { id: 'greed', name: 'Greed', rar: 0, max: 5, m: { gold: 0.25 }, desc: '+25% gold' },
  { id: 'vamp', name: 'Vampirism', rar: 1, max: 4, m: { ls: 0.03 }, desc: 'Heal for 3% of damage dealt' },
  { id: 'thorns', name: 'Bramble Mail', rar: 1, max: 4, m: { thorns: 0.4 }, desc: 'Return 40% of damage taken' },
  { id: 'multi', name: 'Split Shot', rar: 1, max: 3, m: { multi: 1 }, desc: 'Attacks hit one more target' },
  { id: 'pierce', name: 'Piercing', rar: 1, max: 3, m: { pierce: 1 }, desc: 'Shots pierce one more foe' },
  { id: 'ignite', name: 'Ignite', rar: 1, max: 3, m: { pIgnite: 0.15 }, desc: '15% chance on hit to set foes ablaze' },
  { id: 'chill', name: 'Frostbite', rar: 1, max: 3, m: { pChill: 0.25 }, desc: '25% chance on hit to chill foes' },
  { id: 'static', name: 'Static Charge', rar: 1, max: 3, m: { pStatic: 0.12 }, desc: '12% chance on hit to chain lightning' },
  { id: 'toxic', name: 'Toxin', rar: 1, max: 3, m: { pToxic: 0.35 }, desc: '35% chance on hit to poison' },
  { id: 'exec', name: 'Executioner', rar: 1, max: 3, m: { exec: 0.4 }, desc: '+40% damage to foes under 30% health' },
  { id: 'bulwark', name: 'Bulwark', rar: 1, max: 3, m: { bulwark: 0.15 }, desc: 'Every 10 s, gain a shield of 15% max health' },
  { id: 'blades', name: 'Spirit Blades', rar: 2, max: 3, m: { blades: 2 }, desc: 'Two spirit blades orbit you and cut foes' },
  { id: 'wisp', name: 'Spirit Wisp', rar: 2, max: 3, m: { wisps: 1 }, desc: 'A wisp follows you and shoots foes' },
  { id: 'echo', name: 'Echo', rar: 2, max: 2, m: { echo: 0.3 }, desc: '30% chance your skill recharges instantly' },
  { id: 'nova', name: 'Shockwave', rar: 2, max: 3, m: { nova: 1 }, desc: 'Using your skill releases a shockwave' },
  { id: 'overcharge', name: 'Overcharge', rar: 2, max: 3, m: { ultDmg: 0.4 }, desc: 'Ultimate deals 40% more damage' },
  { id: 'giant', name: 'Giant Blood', rar: 2, max: 2, m: { hp: 0.3, dmg: 0.15, size: 0.15, ms: -0.05 }, desc: '+30% health, +15% damage, bigger' },
  { id: 'secondwind', name: 'Second Wind', rar: 2, max: 1, m: { secondwind: 1 }, desc: 'Once per room, survive a fatal blow' },
  { id: 'phoenix', name: 'Phoenix Heart', rar: 3, max: 1, m: { phoenix: 1 }, desc: 'Rise from defeat once with 60% health' },
  { id: 'glass', name: 'Glass Cannon', rar: 3, max: 1, m: { dmg: 0.5, hp: -0.25 }, desc: '+50% damage, -25% max health' },
  { id: 'timewarp', name: 'Time Warp', rar: 3, max: 1, m: { cdr: 0.3, ult: 0.3 }, desc: 'Skill 30% faster, ultimate charges 30% faster' },
  { id: 'storm', name: 'Stormlord', rar: 3, max: 1, m: { storm: 1 }, desc: 'Every 3rd attack calls lightning down on the target' },
  { id: 'midas', name: 'Midas Touch', rar: 3, max: 1, m: { gold: 1, midas: 1 }, desc: 'Double gold, elites burst into coins' },
  { id: 'avatar', name: 'Avatar', rar: 3, max: 1, m: { avatar: 1 }, desc: 'Your ultimate also empowers you: +50% damage and speed for 6 s' },
  { id: 'twin', name: 'Twin Strike', rar: 3, max: 1, m: { twin: 1 }, desc: 'Attacks strike twice (the echo deals 50%)' },
];
const BLESS_BY_ID = {};
for (const b of BLESSINGS) BLESS_BY_ID[b.id] = b;
const BLESS_WEIGHT = [62, 27, 9, 2.2];

// ---------- Gear ----------
const SLOTS = ['weapon', 'armor', 'charm'];
const SLOT_NAME = { weapon: 'Weapon', armor: 'Armor', charm: 'Charm' };
const GEAR_BASES = {
  weapon: ['Sword', 'Staff', 'Bow', 'Axe', 'Dagger', 'Wand', 'Spear', 'Hammer', 'Tome', 'Orb'],
  armor: ['Plate', 'Robe', 'Mail', 'Cloak', 'Vest', 'Aegis', 'Garb', 'Mantle'],
  charm: ['Ring', 'Amulet', 'Talisman', 'Idol', 'Pendant', 'Sigil', 'Charm'],
};
// stat: [label, base value at ilvl 1, growth per ilvl, unit]
const GEAR_STATS = {
  dmg: ['Damage', 3, 0.55, '%'],
  hp: ['Health', 4, 0.75, '%'],
  as: ['Attack speed', 2, 0.22, '%'],
  crit: ['Crit chance', 1.5, 0.12, '%'],
  critDmg: ['Crit damage', 5, 0.6, '%'],
  cdr: ['Skill haste', 2, 0.2, '%'],
  ms: ['Move speed', 1.5, 0.1, '%'],
  ls: ['Lifesteal', 0.6, 0.06, '%'],
  ult: ['Ult charge', 3, 0.35, '%'],
  armor: ['Damage reduction', 1, 0.1, '%'],
  gold: ['Gold find', 4, 0.5, '%'],
  regen: ['Regeneration', 0.1, 0.012, '%/s'],
};
const MAIN_STAT = { weapon: 'dmg', armor: 'hp', charm: null };
const PREFIX = { dmg: 'Fierce', hp: 'Sturdy', as: 'Quick', crit: 'Keen', critDmg: 'Cruel', cdr: 'Arcane', ms: 'Swift', ls: 'Thirsting', ult: 'Mythic', armor: 'Warded', gold: 'Lucky', regen: 'Living' };
const SUFFIX = ['of Embers', 'of the Owl', 'of Storms', 'of the Deep', 'of Dawn', 'of Thorns', 'of the Wolf', 'of Frost', 'of Kings', 'of the Void', 'of Ages', 'of Valor'];
// Legendary items: one unique power each.
const UNIQUES = [
  { id: 'phoenix', slot: 'charm', name: 'Phoenix Plume', desc: 'Once per run, rise from defeat with 40% health.' },
  { id: 'stormring', slot: 'charm', name: 'Stormcaller Ring', desc: 'Hits have a 10% chance to call lightning.' },
  { id: 'chrono', slot: 'charm', name: 'Chrono Band', desc: 'Skill recharges 20% faster.' },
  { id: 'midas', slot: 'charm', name: 'Midas Idol', desc: '+60% gold find.' },
  { id: 'fang', slot: 'weapon', name: 'Fang of Night', desc: '+8% lifesteal. Critical hits heal 2% health.' },
  { id: 'worldsplit', slot: 'weapon', name: 'Worldsplitter', desc: 'Every 5th attack sends out a shockwave.' },
  { id: 'voidorb', slot: 'weapon', name: 'Heart of the Void', desc: '+25% damage to elites and bosses.' },
  { id: 'emberblade', slot: 'weapon', name: 'Ember Brand', desc: 'Attacks set foes ablaze.' },
  { id: 'titan', slot: 'armor', name: 'Titan Plate', desc: '+40% health and 10% damage reduction.' },
  { id: 'frostheart', slot: 'armor', name: 'Frostheart Aegis', desc: 'Foes that hit you are chilled. Freezes nearby foes when health drops low.' },
  { id: 'thornmail', slot: 'armor', name: 'Briar Mail', desc: 'Returns 80% of damage taken to the attacker.' },
  { id: 'windcloak', slot: 'armor', name: 'Windrunner Cloak', desc: '+15% move speed; dash recharges twice as fast.' },
];
const UNIQUE_BY_ID = {};
for (const u of UNIQUES) UNIQUE_BY_ID[u.id] = u;
const RAR_MULT = [1, 1.3, 1.65, 2.1, 2.7];

// ---------- Camp upgrades (permanent) ----------
const TALENTS = [
  { id: 'might', name: 'War Banner', desc: '+4% damage for every hero', max: 10, per: 0.04, cost: (l) => Math.round(220 * Math.pow(1.55, l)) },
  { id: 'vital', name: 'Healer Tent', desc: '+5% health for every hero', max: 10, per: 0.05, cost: (l) => Math.round(220 * Math.pow(1.55, l)) },
  { id: 'fortune', name: 'Treasury', desc: '+8% gold from runs', max: 10, per: 0.08, cost: (l) => Math.round(180 * Math.pow(1.5, l)) },
  { id: 'wisdom', name: 'Library', desc: '+10% hero XP', max: 10, per: 0.1, cost: (l) => Math.round(180 * Math.pow(1.5, l)) },
  { id: 'luck', name: 'Shrine of Luck', desc: 'Better blessings and loot', max: 5, per: 1, cost: (l) => Math.round(600 * Math.pow(1.9, l)) },
  { id: 'reroll', name: 'Fortune Teller', desc: '+1 blessing reroll per run', max: 3, per: 1, cost: (l) => [800, 2400, 6000][l] || 99999 },
  { id: 'revive', name: 'Ankh Shrine', desc: 'Rise once per run when you fall', max: 1, per: 1, cost: () => 4000 },
];
const TALENT_BY_ID = {};
for (const t of TALENTS) TALENT_BY_ID[t.id] = t;

// ---------- Achievements ----------
// test(s) reads the save; reward gold (and maybe a hero).
const ACHIEVEMENTS = [
  { id: 'first', name: 'First Blood', desc: 'Defeat your first monster', test: (s) => s.stats.kills >= 1, gold: 50 },
  { id: 'kills500', name: 'Monster Hunter', desc: 'Defeat 500 monsters', test: (s) => s.stats.kills >= 500, gold: 200, prog: (s) => [s.stats.kills, 500] },
  { id: 'kills5k', name: 'Monster Slayer', desc: 'Defeat 5,000 monsters', test: (s) => s.stats.kills >= 5000, gold: 800, prog: (s) => [s.stats.kills, 5000] },
  { id: 'kills25k', name: 'Legend of the Realms', desc: 'Defeat 25,000 monsters', test: (s) => s.stats.kills >= 25000, gold: 3000, prog: (s) => [s.stats.kills, 25000] },
  { id: 'realm1', name: 'Woodcutter', desc: 'Defeat Gorethorn in the Whispering Woods', test: (s) => !!s.stats.boss.gorethorn, gold: 300 },
  { id: 'realm2', name: 'Lichbane', desc: 'Defeat Morvane in the Sunken Crypt', test: (s) => !!s.stats.boss.morvane, gold: 500 },
  { id: 'realm3', name: 'Through the Fire', desc: 'Defeat Infernus. Unlocks Chrona', test: (s) => !!s.stats.boss.infernus, gold: 700, hero: 'chrona' },
  { id: 'boss_glacia', name: 'Wyrmslayer', desc: 'Defeat Glacia the Frost Wyrm. Unlocks Drakon', test: (s) => !!s.stats.boss.glacia, gold: 900, hero: 'drakon' },
  { id: 'realm5', name: 'Kingslayer', desc: 'Defeat the Hollow King', test: (s) => !!s.stats.boss.hollow, gold: 1500 },
  { id: 'heroic', name: 'Heroic Deed', desc: 'Clear any realm on Heroic', test: (s) => s.stats.heroicClears >= 1, gold: 600 },
  { id: 'mythic', name: 'Mythic Legend', desc: 'Clear any realm on Mythic', test: (s) => s.stats.mythicClears >= 1, gold: 2000 },
  { id: 'allmythic', name: 'Master of Realms', desc: 'Clear all five realms on Mythic', test: (s) => REALMS.every((r) => (s.realms[r.id] || 0) >= 3), gold: 8000 },
  { id: 'abyss5', name: 'Into the Abyss', desc: 'Reach floor 5 of the Abyss', test: (s) => s.stats.abyssBest >= 5, gold: 250, prog: (s) => [s.stats.abyssBest, 5] },
  { id: 'abyss10', name: 'Abyss Walker', desc: 'Reach floor 10 of the Abyss. Unlocks Umbra', test: (s) => s.stats.abyssBest >= 10, gold: 600, hero: 'umbra', prog: (s) => [s.stats.abyssBest, 10] },
  { id: 'abyss25', name: 'Abyss Diver', desc: 'Reach floor 25 of the Abyss', test: (s) => s.stats.abyssBest >= 25, gold: 2000, prog: (s) => [s.stats.abyssBest, 25] },
  { id: 'abyss50', name: 'Bottomless', desc: 'Reach floor 50 of the Abyss', test: (s) => s.stats.abyssBest >= 50, gold: 6000, prog: (s) => [s.stats.abyssBest, 50] },
  { id: 'heroes6', name: 'Recruiter', desc: 'Unlock 6 heroes', test: (s) => heroCount(s) >= 6, gold: 300, prog: (s) => [heroCount(s), 6] },
  { id: 'heroes12', name: 'Guild Master', desc: 'Unlock 12 heroes', test: (s) => heroCount(s) >= 12, gold: 1000, prog: (s) => [heroCount(s), 12] },
  { id: 'heroesall', name: 'Full Roster', desc: 'Unlock every hero', test: (s) => heroCount(s) >= HEROES.length, gold: 5000, prog: (s) => [heroCount(s), HEROES.length] },
  { id: 'lvl10', name: 'Seasoned', desc: 'Raise a hero to level 10', test: (s) => maxHeroLvl(s) >= 10, gold: 300, prog: (s) => [maxHeroLvl(s), 10] },
  { id: 'lvl20', name: 'Veteran', desc: 'Raise a hero to level 20', test: (s) => maxHeroLvl(s) >= 20, gold: 1000, prog: (s) => [maxHeroLvl(s), 20] },
  { id: 'lvl30', name: 'Paragon', desc: 'Raise a hero to level 30', test: (s) => maxHeroLvl(s) >= 30, gold: 3000, prog: (s) => [maxHeroLvl(s), 30] },
  { id: 'epic', name: 'Shiny!', desc: 'Find an Epic item', test: (s) => s.stats.bestRar >= 2, gold: 150 },
  { id: 'legend', name: 'Legendary Loot', desc: 'Find a Legendary item', test: (s) => s.stats.bestRar >= 3, gold: 500 },
  { id: 'mythicitem', name: 'Mythic Treasure', desc: 'Find a Mythic item', test: (s) => s.stats.bestRar >= 4, gold: 1500 },
  { id: 'upgrade', name: 'Blacksmith', desc: 'Upgrade an item to +10', test: (s) => s.stats.maxUp >= 10, gold: 800, prog: (s) => [s.stats.maxUp, 10] },
  { id: 'flawless', name: 'Untouchable', desc: 'Clear a combat room without anyone taking damage', test: (s) => s.stats.flawless >= 1, gold: 200 },
  { id: 'bossflaw', name: 'Perfect Hunt', desc: 'Defeat a boss with nobody falling', test: (s) => s.stats.bossNoDown >= 1, gold: 400 },
  { id: 'combo100', name: 'Combo Master', desc: 'Reach a 200 hit combo', test: (s) => s.stats.bestCombo >= 200, gold: 250, prog: (s) => [s.stats.bestCombo, 200] },
  { id: 'combo300', name: 'Unstoppable', desc: 'Reach a 600 hit combo', test: (s) => s.stats.bestCombo >= 600, gold: 800, prog: (s) => [s.stats.bestCombo, 600] },
  { id: 'multi10', name: 'Massacre', desc: 'Defeat 20 monsters in one quick chain', test: (s) => s.stats.bestMulti >= 20, gold: 300, prog: (s) => [s.stats.bestMulti, 20] },
  { id: 'ults100', name: 'Ultimate Power', desc: 'Use 100 ultimates', test: (s) => s.stats.ults >= 100, gold: 500, prog: (s) => [s.stats.ults, 100] },
  { id: 'revives', name: 'Guardian Angel', desc: 'Revive allies 25 times', test: (s) => s.stats.revives >= 25, gold: 400, prog: (s) => [s.stats.revives, 25] },
  { id: 'blessed', name: 'Divinely Blessed', desc: 'Hold 15 blessings in a single run', test: (s) => s.stats.maxBless >= 15, gold: 400, prog: (s) => [s.stats.maxBless, 15] },
  { id: 'legbless', name: 'Chosen One', desc: 'Receive a Legendary blessing', test: (s) => s.stats.legBless >= 1, gold: 300 },
  { id: 'rich', name: 'Dragon Hoard', desc: 'Earn 25,000 gold in total', test: (s) => s.stats.goldEarned >= 25000, gold: 1000, prog: (s) => [s.stats.goldEarned, 25000] },
  { id: 'speed', name: 'Speedrunner', desc: 'Clear a realm in under 7 minutes', test: (s) => s.stats.fastClear > 0 && s.stats.fastClear < 420, gold: 600 },
  { id: 'friends', name: 'Better Together', desc: 'Finish a run with another player', test: (s) => s.stats.coopRuns >= 1, gold: 300 },
  { id: 'online', name: 'Long Distance', desc: 'Play an online game with a friend', test: (s) => s.stats.onlineGames >= 1, gold: 300 },
  { id: 'arena1', name: 'Gladiator', desc: 'Win an Arena match', test: (s) => s.stats.arenaWins >= 1, gold: 200 },
  { id: 'arena25', name: 'Champion', desc: 'Win 25 Arena matches', test: (s) => s.stats.arenaWins >= 25, gold: 1200, prog: (s) => [s.stats.arenaWins, 25] },
  { id: 'ace', name: 'Ace', desc: 'Score 5 knockouts in a row in the Arena without falling', test: (s) => s.stats.bestStreak >= 5, gold: 400, prog: (s) => [s.stats.bestStreak, 5] },
  { id: 'quests', name: 'Dutiful', desc: 'Complete 15 daily quests', test: (s) => s.stats.quests >= 15, gold: 600, prog: (s) => [s.stats.quests, 15] },
  { id: 'camp', name: 'Builder', desc: 'Buy 15 camp upgrades', test: (s) => talentCount(s) >= 15, gold: 800, prog: (s) => [talentCount(s), 15] },
];
function heroCount(s) { let n = 0; for (const h of HEROES) if (s.heroes[h.id] && s.heroes[h.id].unlocked) n++; return n; }
function maxHeroLvl(s) { let n = 1; for (const h of HEROES) if (s.heroes[h.id]) n = Math.max(n, s.heroes[h.id].lvl || 1); return n; }
function talentCount(s) { let n = 0; for (const t of TALENTS) n += s.talents[t.id] || 0; return n; }

// ---------- Daily quests ----------
const QUESTS = [
  { id: 'kills', name: 'Defeat {n} monsters', stat: 'kills', n: [250, 400, 600], gold: 160 },
  { id: 'rooms', name: 'Clear {n} rooms', stat: 'rooms', n: [8, 12, 16], gold: 160 },
  { id: 'elites', name: 'Defeat {n} elite monsters', stat: 'elites', n: [4, 6, 10], gold: 180 },
  { id: 'boss', name: 'Defeat {n} boss', stat: 'bosses', n: [1, 1, 2], gold: 220 },
  { id: 'ults', name: 'Use your ultimate {n} times', stat: 'ults', n: [6, 10, 15], gold: 150 },
  { id: 'gold', name: 'Collect {n} gold in runs', stat: 'gold', n: [400, 700, 1100], gold: 150 },
  { id: 'chests', name: 'Open {n} gear chests', stat: 'chests', n: [2, 3, 4], gold: 180 },
  { id: 'arena', name: 'Win {n} Arena match', stat: 'arenaWins', n: [1, 1, 2], gold: 200 },
  { id: 'bless', name: 'Collect {n} blessings', stat: 'blessings', n: [8, 12, 16], gold: 150 },
  { id: 'abyss', name: 'Clear {n} Abyss floors', stat: 'abyss', n: [5, 8, 12], gold: 200 },
];

const BOT_NAMES = ['Aria', 'Bram', 'Cass', 'Dorin', 'Elka', 'Fenn', 'Gwen', 'Hugo', 'Isla', 'Jory', 'Kira', 'Lio', 'Mara', 'Nico', 'Oona', 'Pip', 'Quin', 'Rhea', 'Sven', 'Tova', 'Ulric', 'Vera', 'Wren', 'Yara', 'Zeke'];
