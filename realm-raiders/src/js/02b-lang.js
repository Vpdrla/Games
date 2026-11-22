// ---------- Languages: English and Korean ----------
// Text is written in English in the code and translated on display with tr(). Text that arrives
// from the simulation (banners, room labels, pop-ups) goes through trx(), which also understands
// labels with numbers and names in them. Each device shows its own language, also online.

const Lang = { ko: false };

function langAuto() {
  try { return /^ko/i.test(navigator.language || '') || (navigator.languages || []).some((l) => /^ko/i.test(l)); } catch (e) { return false; }
}

function setLang(code) {
  Lang.ko = code === 'ko' || (code === 'auto' && langAuto());
  try { document.documentElement.lang = Lang.ko ? 'ko' : 'en'; } catch (e) { /* no document */ }
}

function fillParams(s, p) {
  if (!p) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? p[k] : m));
}

// Korean particles that depend on the last syllable of a name: 이/가, 은/는, 을/를, (으)로.
function josa(s) {
  const fin = (ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c <= 11171 ? c % 28 : -1; };
  return s
    .replace(/([가-힣])((?:<\/b>)?)이\(가\)/g, (m, ch, b) => ch + b + (fin(ch) > 0 ? '이' : '가'))
    .replace(/([가-힣])((?:<\/b>)?)\(으\)로/g, (m, ch, b) => ch + b + (fin(ch) > 0 && fin(ch) !== 8 ? '으로' : '로'));
}

// Translate a fixed English text (with optional {params}).
function tr(s, p) {
  if (s == null) return '';
  if (Lang.ko) { const k = KO[s]; if (k != null) return p ? josa(fillParams(k, p)) : k; }
  const e = EN[s];
  return fillParams(e != null ? e : s, p);
}

let KO_LOWER = null;
function trName(s) {
  if (!Lang.ko) return s;
  if (KO[s] != null) return KO[s];
  if (!KO_LOWER) { KO_LOWER = {}; for (const k in KO) KO_LOWER[k.toLowerCase()] = KO[k]; }
  const v = KO_LOWER[String(s).toLowerCase()];
  return v != null ? v : s;
}

// Translate text built by the game ("Whispering Woods · Room 3/7", "FLOOR 5 CLEARED", ...).
function trx(s) {
  if (!Lang.ko || s == null || s === '') return s == null ? '' : s;
  s = String(s);
  if (s.includes(' · ')) return s.split(' · ').map(trx).join(' · ');
  const n = trName(s);
  if (n !== s) return n;
  for (const [re, f] of KO_PAT) { const m = s.match(re); if (m) return f(m); }
  return s;
}

const KO_PAT = [
  [/^Room (\d+)\/(\d+)$/, (m) => '방 ' + m[1] + '/' + m[2]],
  [/^Room (\d+)$/, (m) => m[1] + '번 방'],
  [/^Floor (\d+)$/, (m) => m[1] + '층'],
  [/^FLOOR (\d+) CLEARED$/, (m) => m[1] + '층 돌파!'],
  [/^(.+) IS ENRAGED!$/, (m) => trName(m[1]) + ', 분노하다!'],
  [/^(.+) falls$/, (m) => trName(m[1]) + ' 처치!'],
  [/^(.+) WINS!$/, (m) => trName(m[1]) + ' 승리!'],
  [/^first to (\d+)$/, (m) => m[1] + '점 선취'],
  [/^(\d+)x MULTI-KILL!$/, (m) => m[1] + '연속 처치!'],
  [/^Gamepad (\d)$/, (m) => '게임패드 ' + m[1]],
  [/^Player (\d)$/, (m) => '플레이어 ' + m[1]],
  [/^Joining room (\w+)\.\.\.$/, (m) => m[1] + ' 방에 들어가는 중...'],
];

// Item names are built from parts, so they are rebuilt in Korean word order.
function itemName(it) {
  if (it.uniq) return tr(UNIQUE_BY_ID[it.uniq].name);
  if (!Lang.ko) return it.name;
  const parts = String(it.name).split(' ');
  const pre = parts[0], base = parts[1] || it.base, suf = parts.slice(2).join(' ');
  return (suf ? tr(suf) + ' ' : '') + tr(pre) + ' ' + tr(base);
}

const KO = {
  // ---- roles, rarity, difficulty, slots
  Tank: '탱커', Fighter: '전사', Mage: '마법사', Ranger: '원거리', Assassin: '암살자', Healer: '힐러', Support: '서포터', Summoner: '소환사',
  Common: '일반', Rare: '희귀', Epic: '에픽', Legendary: '전설', Mythic: '신화',
  Normal: '보통', Heroic: '영웅',
  Weapon: '무기', Armor: '방어구', Charm: '장신구',

  // ---- heroes
  Brand: '브랜드', 'Oathsworn Knight': '맹세의 기사', 'Shield Bash': '방패 강타',
  'Charge forward, stunning and knocking back every foe in the way.': '앞으로 돌진해 길을 막는 모든 적을 기절시키고 밀쳐 냅니다.',
  'Rallying Banner': '결집의 깃발',
  'Plant a banner: allies near it take half damage and heal. Taunts nearby monsters and shields Brand.': '깃발을 꽂아 주변 아군이 받는 피해를 절반으로 줄이고 회복시킵니다. 주변 몬스터를 도발하고 브랜드에게 보호막을 씌웁니다.',
  Bulwark: '철벽', 'Takes 20% less damage.': '받는 피해가 20% 줄어듭니다.',
  Ember: '엠버', Pyromancer: '화염술사', 'Flame Wave': '화염 파도',
  'Breathe a wide cone of fire that burns everything it touches.': '닿는 모든 것을 불태우는 넓은 부채꼴 불길을 내뿜습니다.',
  'Meteor Storm': '메테오 폭풍', 'Call down a storm of meteors on the enemy horde.': '적 무리 위로 유성우를 떨어뜨립니다.',
  Combustion: '연소', 'Burning foes explode when they die.': '불타는 적은 죽을 때 폭발합니다.',
  Hawke: '호크', 'Wind Ranger': '바람 궁수', Volley: '일제 사격', 'Fire a fan of seven piercing arrows.': '관통하는 화살 일곱 발을 부채꼴로 쏩니다.',
  'Arrow Rain': '화살비', 'Darken the sky: arrows pour down on a wide area for three seconds.': '하늘을 뒤덮은 화살이 3초 동안 넓은 지역에 쏟아집니다.',
  'Eagle Eye': '매의 눈', 'Deals up to 30% more damage to distant targets.': '멀리 있는 적에게 최대 30% 더 큰 피해를 줍니다.',
  Willow: '윌로우', 'Grove Druid': '숲의 드루이드', 'Healing Bloom': '치유의 꽃', 'Grow a flower field that heals allies standing in it.': '안에 선 아군을 치유하는 꽃밭을 피워 냅니다.',
  'Grove of Life': '생명의 숲', 'Revive every fallen ally nearby, heal the whole party and root foes in place.': '주변의 쓰러진 아군을 모두 부활시키고, 파티 전체를 치유하며, 적을 그 자리에 묶습니다.',
  'Verdant Aura': '신록의 기운', 'Allies near Willow regenerate health.': '윌로우 근처의 아군은 체력이 회복됩니다.',
  Rime: '라임', 'Frost Witch': '서리 마녀', 'Frost Nova': '서리 폭발', 'Blast frost around you, freezing nearby foes solid.': '주변에 냉기를 터뜨려 가까운 적을 얼려 버립니다.',
  Blizzard: '눈보라', 'Summon a blizzard that slows, shreds and freezes everything inside.': '안에 있는 모든 것을 느리게 하고, 베고, 얼리는 눈보라를 부릅니다.',
  Shatter: '산산조각', 'Frozen foes take 40% more damage.': '얼어붙은 적은 40% 더 큰 피해를 받습니다.',
  Gale: '게일', 'Wind Monk': '바람 수도승', 'Cyclone Kick': '회오리 발차기', 'Spin through the enemy line, kicking foes away. Untouchable while spinning.': '적진을 회전하며 돌파해 적을 걷어찹니다. 회전하는 동안 무적입니다.',
  Tornado: '토네이도', 'Unleash a roaming tornado that drags foes in and shreds them.': '적을 빨아들여 갈기갈기 찢는 떠도는 토네이도를 풀어놓습니다.',
  Windwalk: '바람걸음', 'Moves faster and dodges 15% of attacks.': '더 빠르게 움직이고 공격의 15%를 회피합니다.',
  Gizmo: '기즈모', Gadgeteer: '발명가', 'Deploy Turret': '포탑 설치', 'Drop an auto-turret that shoots nearby foes (up to two at once).': '가까운 적을 쏘는 자동 포탑을 설치합니다 (최대 2개).',
  'Rocket Barrage': '로켓 포화', 'Fire a swarm of homing rockets.': '유도 로켓을 무더기로 발사합니다.',
  Overclock: '오버클럭', 'Each of your turrets gives you +15% attack speed.': '포탑 하나마다 공격 속도가 15% 빨라집니다.',
  Volt: '볼트', 'Storm Caller': '폭풍술사', 'Thunder Dash': '번개 질주', 'Become lightning and blink forward, shocking everything you pass.': '번개가 되어 앞으로 순간이동하며 지나간 모든 것을 감전시킵니다.',
  Thunderstorm: '뇌우', 'A storm follows you, striking foes around you again and again.': '폭풍이 따라다니며 주변의 적을 계속해서 내리칩니다.',
  Overload: '과부하', 'Every 4th attack chains to five targets.': '4번째 공격마다 다섯 대상에게 번개가 이어집니다.',
  Nyx: '닉스', 'Shadow Blade': '그림자 칼날', 'Shadow Step': '그림자 걸음', 'Teleport behind a foe and vanish. Your next three hits are critical.': '적 뒤로 순간이동해 모습을 감춥니다. 다음 세 번의 공격은 치명타입니다.',
  'Death Lotus': '죽음의 연꽃', 'Become a whirl of blades, cutting every foe around you. Untouchable while it lasts.': '칼날의 소용돌이가 되어 주변의 모든 적을 벱니다. 지속되는 동안 무적입니다.',
  'Killer Instinct': '살인 본능', '+25% critical chance. Critical hits deal 220% damage.': '치명타 확률 +25%. 치명타는 220% 피해를 줍니다.',
  Krag: '크라그', Berserker: '광전사', Whirlwind: '소용돌이', 'Spin your axe for two seconds, hitting everything around you while you move.': '2초 동안 도끼를 휘둘러 움직이며 주변의 모든 것을 칩니다.',
  'Blood Rage': '피의 분노', 'Grow huge and enraged: much faster attacks, speed, damage and lifesteal.': '거대해지고 분노합니다: 공격 속도, 이동 속도, 피해, 생명력 흡수가 크게 오릅니다.',
  Fury: '격노', 'Deals up to 50% more damage as health drops.': '체력이 줄수록 최대 50% 더 큰 피해를 줍니다.',
  Vex: '벡스', 'Plague Witch': '역병 마녀', 'Toxic Cloud': '독구름', 'Hurl a cloud of plague that poisons and slows foes inside.': '안에 있는 적을 중독시키고 느리게 하는 역병 구름을 던집니다.',
  'Plague Burst': '역병 폭발', 'Detonate all poison at once and spread it to nearby foes.': '모든 독을 한꺼번에 터뜨리고 주변 적에게 퍼뜨립니다.',
  Venom: '맹독', 'Poisoned foes deal 20% less damage.': '중독된 적은 피해를 20% 덜 줍니다.',
  Morrow: '모로우', Necromancer: '강령술사', 'Raise Dead': '시체 일으키기', 'Raise two skeleton warriors to fight for you.': '함께 싸울 해골 전사 둘을 일으킵니다.',
  'Soul Harvest': '영혼 수확', 'Rip the souls from every foe nearby, healing your party and raising champions.': '주변 모든 적의 영혼을 뜯어내 파티를 치유하고 해골 용사를 일으킵니다.',
  Gravecall: '무덤의 부름', 'Foes you kill sometimes rise as skeletons.': '처치한 적이 가끔 해골로 되살아납니다.',
  Lyra: '라이라', 'Battle Bard': '전투 음유시인', 'Battle Hymn': '전투 찬가', 'Inspire the party: faster attacks, faster feet and more damage.': '파티를 고무합니다: 더 빠른 공격, 더 빠른 발, 더 큰 피해.',
  Crescendo: '크레셴도', 'A sonic boom stuns every foe on screen and heals the party.': '음파 폭발로 화면의 모든 적을 기절시키고 파티를 치유합니다.',
  Encore: '앙코르', 'Allies near Lyra deal 10% more damage.': '라이라 근처의 아군은 피해를 10% 더 줍니다.',
  Atlas: '아틀라스', 'Stone Titan': '바위 거인', 'Boulder Toss': '바위 던지기', 'Hurl a boulder that stuns everything where it lands.': '떨어진 곳의 모든 것을 기절시키는 바위를 던집니다.',
  Earthquake: '지진', 'Three shockwaves ripple out from Atlas, stunning foes.': '아틀라스에게서 세 번의 충격파가 퍼져 나가 적을 기절시킵니다.',
  'Stone Skin': '돌 피부', 'Gains a shield after a few seconds without being hit.': '몇 초 동안 맞지 않으면 보호막을 얻습니다.',
  Sol: '솔', 'Dawn Cleric': '새벽 사제', Sanctuary: '성역', 'Shield every nearby ally and cleanse their ailments.': '주변 아군 모두에게 보호막을 씌우고 상태 이상을 정화합니다.',
  'Divine Intervention': '신성한 개입', 'Make the whole party invulnerable, revive the fallen and heal everyone.': '파티 전체를 무적으로 만들고, 쓰러진 아군을 부활시키고, 모두를 치유합니다.',
  Grace: '은총', 'Each hit heals the most wounded ally nearby.': '공격할 때마다 주변에서 가장 많이 다친 아군을 치유합니다.',
  Chrona: '크로나', 'Time Weaver': '시간 직조자', Rewind: '되감기', 'Return to where you were three seconds ago, with the health you had then.': '3초 전의 위치와 그때의 체력으로 돌아갑니다.',
  'Time Stop': '시간 정지', 'Freeze time for every foe. Your party keeps moving.': '모든 적의 시간을 멈춥니다. 파티는 계속 움직입니다.',
  Haste: '가속', 'Skills recharge 15% faster and attacks are 10% faster.': '스킬이 15% 빨리 충전되고 공격이 10% 빨라집니다.',
  Umbra: '움브라', 'Void Seer': '공허 예언자', 'Black Hole': '블랙홀', 'Open a black hole that drags foes together and crushes them.': '적을 한데 끌어모아 짓누르는 블랙홀을 엽니다.',
  Collapse: '붕괴', 'Open a giant singularity that pulls everything in, then explodes.': '모든 것을 빨아들인 뒤 폭발하는 거대한 특이점을 엽니다.',
  Entropy: '엔트로피', 'Foes inside your void zones take 25% more damage.': '공허 지대 안의 적은 25% 더 큰 피해를 받습니다.',
  Drakon: '드라콘', 'Dragon Knight': '용기사', 'Dragon Leap': '용의 도약', 'Leap into the air and crash down in a burst of flame.': '공중으로 뛰어올라 화염과 함께 내리꽂습니다.',
  Dragonform: '용 변신', 'Become a dragon for 8 seconds: bigger, tougher, breathing fire.': '8초 동안 용이 됩니다: 더 크고, 더 단단하고, 불을 뿜습니다.',
  Dragonblood: '용의 피', 'Immune to burning. Deals 15% more damage to burning foes.': '화상에 면역입니다. 불타는 적에게 15% 더 큰 피해를 줍니다.',
  // basic attack descriptions
  'Strikes nearby foes in an arc, knocking them back.': '가까운 적을 휘둘러 베고 밀쳐 냅니다.',
  'Strikes nearby foes in an arc.': '가까운 적을 휘둘러 벱니다.',
  'Lightning that jumps between foes.': '적 사이를 건너뛰는 번개를 쏩니다.',
  'A spear thrust that pierces a line of foes.': '일렬로 선 적을 꿰뚫는 창 찌르기.',
  'Fires bolts that explode and burn at range.': '폭발하며 불태우는 화염구를 멀리 쏩니다.',
  'Fires bolts that poison at range.': '중독시키는 다트를 멀리 쏩니다.',
  'Fires bolts that slow at range.': '적을 느리게 하는 탄을 멀리 쏩니다.',
  'Fires bolts that pierce at range.': '관통하는 탄을 멀리 쏩니다.',
  'Fires bolts that seek their target at range.': '대상을 쫓아가는 탄을 멀리 쏩니다.',
  'Fires bolts at range.': '탄을 멀리 쏩니다.',

  // ---- bosses, realms, elites, rewards
  Gorethorn: '고어손', 'The Treant King': '나무정령 왕', Morvane: '모르반', 'The Bone Lich': '해골 리치', Infernus: '인페르누스', 'The Molten Golem': '용암 골렘',
  Glacia: '글라시아', 'The Frost Wyrm': '서리 비룡', 'The Hollow King': '공허의 왕', 'Lord of the Void': '공허의 군주',
  'Whispering Woods': '속삭이는 숲', 'Sunken Crypt': '가라앉은 묘지', 'Ember Depths': '불꽃 동굴', 'Frostfang Peaks': '서리송곳니 봉우리', 'Void Citadel': '공허의 성채',
  Swift: '신속한', Brutal: '잔혹한', Armored: '단단한', Volatile: '폭발하는', Frostbound: '서리 깃든', Vampiric: '흡혈하는',
  Blessing: '축복', 'Choose a blessing': '축복을 고르세요', 'Gold Hoard': '황금 더미', 'A pile of gold': '금화 더미', 'Gear Chest': '장비 상자', 'New equipment': '새 장비',
  Spring: '샘', 'Heal and revive the party': '파티 치유와 부활', 'Elite Den': '정예 소굴', 'Tough fight, blessing + gear': '힘든 전투, 축복 + 장비',

  // ---- blessings
  Might: '힘', '+12% damage': '피해 +12%', '+12% attack speed': '공격 속도 +12%', 'Fleet Foot': '날랜 발', '+8% move speed': '이동 속도 +8%',
  Vigor: '활력', '+16% max health': '최대 체력 +16%', Focus: '집중', 'Skill recharges 10% faster': '스킬 충전 10% 빠르게', 'Ultimate charges 20% faster': '궁극기 충전 20% 빠르게',
  'Keen Edge': '예리한 칼날', '+6% critical chance': '치명타 확률 +6%', Brutality: '잔혹함', '+25% critical damage': '치명타 피해 +25%',
  'Iron Skin': '강철 피부', 'Take 8% less damage': '받는 피해 8% 감소', Renewal: '재생', 'Regenerate 0.6% health per second': '초당 체력 0.6% 회복',
  Greed: '탐욕', '+25% gold': '골드 +25%', Vampirism: '흡혈', 'Heal for 3% of damage dealt': '준 피해의 3%만큼 회복',
  'Bramble Mail': '가시 갑옷', 'Return 40% of damage taken': '받은 피해의 40%를 되돌려 줌', 'Split Shot': '분열 사격', 'Attacks hit one more target': '공격이 대상 하나를 더 맞힘',
  Piercing: '관통', 'Shots pierce one more foe': '투사체가 적 하나를 더 관통', Ignite: '점화', '15% chance on hit to set foes ablaze': '적중 시 15% 확률로 불태움',
  Frostbite: '동상', '25% chance on hit to chill foes': '적중 시 25% 확률로 둔화', 'Static Charge': '정전기', '12% chance on hit to chain lightning': '적중 시 12% 확률로 연쇄 번개',
  Toxin: '독소', '35% chance on hit to poison': '적중 시 35% 확률로 중독', Executioner: '처형자', '+40% damage to foes under 30% health': '체력 30% 이하의 적에게 피해 +40%',
  'Every 10 s, gain a shield of 15% max health': '10초마다 최대 체력 15%의 보호막', 'Spirit Blades': '영혼 칼날', 'Two spirit blades orbit you and cut foes': '영혼 칼날 두 개가 주위를 돌며 적을 벱니다',
  'Spirit Wisp': '영혼 도깨비불', 'A wisp follows you and shoots foes': '도깨비불이 따라다니며 적을 쏩니다', Echo: '메아리', '30% chance your skill recharges instantly': '30% 확률로 스킬이 즉시 재충전',
  Shockwave: '충격파', 'Using your skill releases a shockwave': '스킬을 쓰면 충격파가 터집니다', Overcharge: '과충전', 'Ultimate deals 40% more damage': '궁극기 피해 +40%',
  'Giant Blood': '거인의 피', '+30% health, +15% damage, bigger': '체력 +30%, 피해 +15%, 몸집 증가', 'Second Wind': '기사회생', 'Once per room, survive a fatal blow': '방마다 한 번, 치명적인 공격을 버팁니다',
  'Phoenix Heart': '불사조의 심장', 'Rise from defeat once with 60% health': '쓰러져도 한 번 체력 60%로 일어섭니다', 'Glass Cannon': '유리 대포', '+50% damage, -25% max health': '피해 +50%, 최대 체력 -25%',
  'Time Warp': '시간 왜곡', 'Skill 30% faster, ultimate charges 30% faster': '스킬 30% 빠르게, 궁극기 충전 30% 빠르게', Stormlord: '폭풍의 군주', 'Every 3rd attack calls lightning down on the target': '3번째 공격마다 대상에게 번개가 떨어집니다',
  'Midas Touch': '미다스의 손', 'Double gold, elites burst into coins': '골드 2배, 정예 몬스터가 금화를 쏟아냅니다', Avatar: '화신', 'Your ultimate also empowers you: +50% damage and speed for 6 s': '궁극기를 쓰면 6초 동안 피해와 속도 +50%',
  'Twin Strike': '쌍둥이 일격', 'Attacks strike twice (the echo deals 50%)': '공격이 두 번 들어갑니다 (두 번째는 50%)',

  // ---- gear
  Sword: '검', Staff: '지팡이', Bow: '활', Axe: '도끼', Dagger: '단검', Wand: '완드', Spear: '창', Hammer: '망치', Tome: '마법서', Orb: '오브',
  Plate: '판금 갑옷', Robe: '로브', Mail: '사슬 갑옷', Cloak: '망토', Vest: '조끼', Aegis: '방패', Garb: '의복', Mantle: '어깨망토',
  Ring: '반지', Amulet: '목걸이', Talisman: '호부', Idol: '우상', Pendant: '펜던트', Sigil: '인장',
  Damage: '피해', Health: '체력', 'Attack speed': '공격 속도', 'Crit chance': '치명타 확률', 'Crit damage': '치명타 피해', 'Skill haste': '스킬 가속', 'Move speed': '이동 속도',
  Lifesteal: '생명력 흡수', 'Ult charge': '궁극기 충전', 'Damage reduction': '피해 감소', 'Gold find': '골드 획득', Regeneration: '재생',
  Fierce: '사나운', Sturdy: '튼튼한', Quick: '재빠른', Keen: '예리한', Cruel: '잔인한', Arcane: '비전의', Thirsting: '피에 굶주린', Warded: '수호의', Lucky: '행운의', Living: '살아있는',
  'of Embers': '불씨의', 'of the Owl': '올빼미의', 'of Storms': '폭풍의', 'of the Deep': '심해의', 'of Dawn': '새벽의', 'of Thorns': '가시의', 'of the Wolf': '늑대의', 'of Frost': '서리의',
  'of Kings': '왕들의', 'of the Void': '공허의', 'of Ages': '시대의', 'of Valor': '용맹의',
  'Phoenix Plume': '불사조 깃털', 'Once per run, rise from defeat with 40% health.': '런마다 한 번, 쓰러져도 체력 40%로 일어섭니다.',
  'Stormcaller Ring': '폭풍 부름 반지', 'Hits have a 10% chance to call lightning.': '적중 시 10% 확률로 번개를 부릅니다.',
  'Chrono Band': '시간의 팔찌', 'Skill recharges 20% faster.': '스킬이 20% 빨리 충전됩니다.', 'Midas Idol': '미다스 우상', '+60% gold find.': '골드 획득 +60%.',
  'Fang of Night': '밤의 송곳니', '+8% lifesteal. Critical hits heal 2% health.': '생명력 흡수 +8%. 치명타 때 체력 2% 회복.',
  Worldsplitter: '세계 분쇄자', 'Every 5th attack sends out a shockwave.': '5번째 공격마다 충격파를 보냅니다.',
  'Heart of the Void': '공허의 심장', '+25% damage to elites and bosses.': '정예와 보스에게 피해 +25%.', 'Ember Brand': '불씨 낙인', 'Attacks set foes ablaze.': '공격이 적을 불태웁니다.',
  'Titan Plate': '거인의 판금', '+40% health and 10% damage reduction.': '체력 +40%, 피해 감소 10%.',
  'Frostheart Aegis': '서리심장 방패', 'Foes that hit you are chilled. Freezes nearby foes when health drops low.': '나를 때린 적은 둔화됩니다. 체력이 낮아지면 주변 적을 얼립니다.',
  'Briar Mail': '찔레 갑옷', 'Returns 80% of damage taken to the attacker.': '받은 피해의 80%를 공격자에게 되돌립니다.',
  'Windrunner Cloak': '바람걸음 망토', '+15% move speed; dash recharges twice as fast.': '이동 속도 +15%, 대시가 두 배 빨리 충전됩니다.',

  // ---- camp upgrades
  'War Banner': '전쟁 깃발', '+4% damage for every hero': '모든 영웅 피해 +4%', 'Healer Tent': '치유 천막', '+5% health for every hero': '모든 영웅 체력 +5%',
  Treasury: '보물창고', '+8% gold from runs': '런에서 얻는 골드 +8%', Library: '도서관', '+10% hero XP': '영웅 경험치 +10%',
  'Shrine of Luck': '행운의 제단', 'Better blessings and loot': '더 좋은 축복과 전리품', 'Fortune Teller': '점술가', '+1 blessing reroll per run': '런마다 축복 다시 뽑기 +1',
  'Ankh Shrine': '앙크 제단', 'Rise once per run when you fall': '런마다 한 번, 쓰러지면 일어섭니다',

  // ---- achievements
  'First Blood': '첫 사냥', 'Defeat your first monster': '첫 몬스터 처치', 'Monster Hunter': '몬스터 사냥꾼', 'Defeat 500 monsters': '몬스터 500마리 처치',
  'Monster Slayer': '몬스터 학살자', 'Defeat 5,000 monsters': '몬스터 5,000마리 처치', 'Legend of the Realms': '영역의 전설', 'Defeat 25,000 monsters': '몬스터 25,000마리 처치',
  Woodcutter: '나무꾼', 'Defeat Gorethorn in the Whispering Woods': '속삭이는 숲에서 고어손 처치', Lichbane: '리치 사냥꾼', 'Defeat Morvane in the Sunken Crypt': '가라앉은 묘지에서 모르반 처치',
  'Through the Fire': '불길을 넘어', 'Defeat Infernus. Unlocks Chrona': '인페르누스 처치. 크로나 해금', Wyrmslayer: '비룡 사냥꾼', 'Defeat Glacia the Frost Wyrm. Unlocks Drakon': '서리 비룡 글라시아 처치. 드라콘 해금',
  Kingslayer: '왕 시해자', 'Defeat the Hollow King': '공허의 왕 처치', 'Heroic Deed': '영웅적 업적', 'Clear any realm on Heroic': '영웅 난이도로 아무 영역이나 돌파',
  'Mythic Legend': '신화의 전설', 'Clear any realm on Mythic': '신화 난이도로 아무 영역이나 돌파', 'Master of Realms': '영역의 지배자', 'Clear all five realms on Mythic': '다섯 영역 모두 신화 난이도로 돌파',
  'Into the Abyss': '심연 속으로', 'Reach floor 5 of the Abyss': '심연 5층 도달', 'Abyss Walker': '심연 보행자', 'Reach floor 10 of the Abyss. Unlocks Umbra': '심연 10층 도달. 움브라 해금',
  'Abyss Diver': '심연 잠수부', 'Reach floor 25 of the Abyss': '심연 25층 도달', Bottomless: '끝없는 심연', 'Reach floor 50 of the Abyss': '심연 50층 도달',
  Recruiter: '모집관', 'Unlock 6 heroes': '영웅 6명 해금', 'Guild Master': '길드 마스터', 'Unlock 12 heroes': '영웅 12명 해금', 'Full Roster': '전원 집합', 'Unlock every hero': '모든 영웅 해금',
  Seasoned: '숙련자', 'Raise a hero to level 10': '영웅 하나를 10레벨까지', Veteran: '베테랑', 'Raise a hero to level 20': '영웅 하나를 20레벨까지', Paragon: '귀감', 'Raise a hero to level 30': '영웅 하나를 30레벨까지',
  'Shiny!': '반짝반짝!', 'Find an Epic item': '에픽 아이템 획득', 'Legendary Loot': '전설의 전리품', 'Find a Legendary item': '전설 아이템 획득', 'Mythic Treasure': '신화의 보물', 'Find a Mythic item': '신화 아이템 획득',
  Blacksmith: '대장장이', 'Upgrade an item to +10': '아이템을 +10까지 강화', Untouchable: '무결점', 'Clear a combat room without anyone taking damage': '아무도 피해를 입지 않고 전투 방 돌파',
  'Perfect Hunt': '완벽한 사냥', 'Defeat a boss with nobody falling': '아무도 쓰러지지 않고 보스 처치', 'Combo Master': '콤보 마스터', 'Reach a 200 hit combo': '200 콤보 달성',
  Unstoppable: '멈출 수 없는', 'Reach a 600 hit combo': '600 콤보 달성', Massacre: '대학살', 'Defeat 20 monsters in one quick chain': '몬스터 20마리를 쉬지 않고 연속 처치',
  'Ultimate Power': '궁극의 힘', 'Use 100 ultimates': '궁극기 100번 사용', 'Guardian Angel': '수호천사', 'Revive allies 25 times': '동료를 25번 부활',
  'Divinely Blessed': '신의 축복', 'Hold 15 blessings in a single run': '한 런에서 축복 15개 보유', 'Chosen One': '선택받은 자', 'Receive a Legendary blessing': '전설 축복 받기',
  'Dragon Hoard': '용의 보물', 'Earn 25,000 gold in total': '총 25,000 골드 획득', Speedrunner: '스피드러너', 'Clear a realm in under 7 minutes': '7분 안에 영역 돌파',
  'Better Together': '함께라서 좋아', 'Finish a run with another player': '다른 플레이어와 런 완주', 'Long Distance': '멀리서도 함께', 'Play an online game with a friend': '친구와 온라인 게임 하기',
  Gladiator: '검투사', 'Win an Arena match': '아레나 1승', Champion: '챔피언', 'Win 25 Arena matches': '아레나 25승', Ace: '에이스', 'Score 5 knockouts in a row in the Arena without falling': '아레나에서 쓰러지지 않고 5연속 처치',
  Dutiful: '성실함', 'Complete 15 daily quests': '일일 퀘스트 15개 완료', Builder: '건축가', 'Buy 15 camp upgrades': '캠프 업그레이드 15번 구매',

  // ---- daily quests
  'Defeat {n} monsters': '몬스터 {n}마리 처치', 'Clear {n} rooms': '방 {n}개 돌파', 'Defeat {n} elite monsters': '정예 몬스터 {n}마리 처치', 'Defeat {n} boss': '보스 {n}마리 처치',
  'Use your ultimate {n} times': '궁극기 {n}번 사용', 'Collect {n} gold in runs': '런에서 골드 {n} 모으기', 'Open {n} gear chests': '장비 상자 {n}개 열기',
  'Win {n} Arena match': '아레나 {n}승', 'Collect {n} blessings': '축복 {n}개 모으기', 'Clear {n} Abyss floors': '심연 {n}층 돌파',

  // ---- in-game text (simulation, HUD, effects)
  DODGE: '회피', 'SECOND WIND': '기사회생!', 'ECHO!': '메아리!', 'STONE SKIN': '돌 피부', 'REBORN!': '부활!', OUT: '탈락', 'DOWN!': '쓰러짐!', DOWN: '쓰러짐',
  HEAL: '회복', 'POWER!': '힘!', 'ULT +35': '궁극기 +35', 'KILLING SPREE!': '연속 처치!', 'UNSTOPPABLE!': '막을 수 없다!',
  'ROOM CLEAR': '방 돌파!', 'Flawless!': '무피해!', 'VICTORY!': '승리!', DEFEATED: '패배', 'Healing Spring': '치유의 샘', 'Rest a moment': '잠시 쉬어 가세요',
  ARENA: '아레나', 'Free for all': '개인전', 'Team battle': '팀전', OVERTIME: '연장전', 'Next knockout wins': '다음 처치가 승리', 'BLUE TEAM': '블루 팀', 'RED TEAM': '레드 팀', PLAYER: '플레이어',
  Boss: '보스', BOSS: '보스', Arena: '아레나', Abyss: '심연', 'The Abyss': '심연', 'TIME STOP': '시간 정지', COMBO: '콤보', BOT: '봇', 'Esc: menu': 'Esc: 메뉴', 'The arena': '아레나',
  ULT: '궁극', Raider: '모험가', 'You are out until the next room': '다음 방까지 탈락했어요', 'Rising again...': '다시 일어서는 중...', 'You are down! Allies can revive you': '쓰러졌어요! 동료가 살려 줄 수 있어요',
  dash: '대시',
};

// Long English texts that are looked up by key.
const EN = {
  HELP_BASICS: 'Your hero <b>attacks automatically</b> whatever is in range. You move, dodge, and choose when to use your <b>skill</b>, your <b>ultimate</b> (charges as you deal damage) and your <b>dash</b> (a quick roll you can\'t be hit during). Red areas are attacks about to land: step out of them!',
  HELP_RAIDS: 'Each realm has 7 rooms and a boss. After a room, pick a portal: each shows its reward (<b>Blessings</b> make you stronger for the run, <b>Gear chests</b> give equipment you keep, <b>Springs</b> heal). Fallen allies can be revived by standing next to them. Gold, gear and hero XP stay after the run, win or lose.',
  HELP_TOUCH: 'Drag on the left to move. Tap a button to use it at the nearest foe, or drag from a button to aim it, then let go. If you hold your phone upright, the game turns sideways on its own. The buttons can be made more or less see-through in Settings.',
  HELP_KEYS: '<b>Player 1:</b> WASD move · Q skill · E ultimate · Space dash (alone you can also use arrows + J/K/L, and the mouse to aim: left click skill, right click ultimate)<br><b>Player 2:</b> IJKL move · U skill · O ultimate · ; dash<br><b>Player 3:</b> Arrows move · Numpad 1 skill · Numpad 2 ultimate · Numpad 0 dash',
  HELP_PADS: 'Left stick move · X or RB skill · B, Y or RT ultimate · A, LB or LT dash · right stick aims · Start for the menu.',
  HELP_FRIENDS: 'On one screen: open Adventure, Abyss or Arena and have each friend press a key from their keys or a button on their gamepad to join. Online: one player creates a room under <b>Play with friends</b> and shares the 4-letter code; up to 4 players, bots fill the gaps.',
  ONLINE_NOTE: 'Online play connects your devices directly (WebRTC) and needs an internet connection. It works from the GitHub Pages version of the game, not inside the Claude preview. On mobile data, if a connection fails, try Wi-Fi. Friends on the same screen can also just join from Adventure, Abyss or Arena.',
};

Object.assign(KO, {
  // menus
  'CO-OP ACTION RPG': '협동 액션 RPG', 'Daily chest': '일일 상자', Power: '전투력', 'Change hero': '영웅 바꾸기', Adventure: '모험',
  'Raid 5 realms · bosses · loot': '영역 5곳 공략 · 보스 · 전리품', 'Endless floors · best {n}': '끝없는 층 · 최고 {n}층', 'Beat the Whispering Woods first': '먼저 속삭이는 숲을 돌파하세요',
  'Hero vs hero · team or free-for-all': '영웅 대 영웅 · 팀전 또는 개인전', 'Play with friends': '친구와 함께', 'Online room code · or join on one screen': '온라인 방 코드 · 한 화면에서도 참가',
  Heroes: '영웅', Gear: '장비', Camp: '캠프', Achievements: '업적', Quests: '퀘스트', Settings: '설정', 'How to play': '플레이 방법', Achievement: '업적',
  Empty: '비어 있음', 'Tap to equip': '눌러서 장착', Unlock: '해금', 'Level {n}': '레벨 {n}', max: '최대', '{a} runs · {b} kills': '{a}번 출전 · {b}마리 처치',
  Speed: '속도', Attack: '공격', Skill: '스킬', '{n}s': '{n}초', Ultimate: '궁극기', Passive: '패시브', Selected: '선택됨', 'Play as {name}': '{name}(으)로 플레이',
  NEW: 'NEW', '+{n} more': '+{n}개 더', All: '전체', 'No gear yet. Gear Chests, elite dens, bosses and daily rewards drop equipment.': '아직 장비가 없어요. 장비 상자, 정예 소굴, 보스, 일일 보상에서 장비를 얻을 수 있어요.',
  'Salvage unequipped:': '장착 안 한 장비 분해:', Commons: '일반', 'Rare & below': '희귀 이하', 'Upgrade +{n}: all stats +10%': '+{n} 강화: 모든 능력치 +10%',
  'item level {n}': '아이템 레벨 {n}', 'score {n}': '점수 {n}', 'Equipped by {name}': '{name} 장착 중', 'Compared with what {name} wears now': '{name}이(가) 지금 착용한 장비와 비교',
  Lock: '잠금', Salvage: '분해', Upgrade: '강화', 'Max +10': '최대 +10', Unequip: '해제', 'Equip on {name}': '{name}에게 장착', Item: '아이템',
  'You have no {slot} yet.': '아직 {slot}이(가) 없어요.', 'Choose {slot} for {name}': '{name}의 {slot} 고르기',
  'Camp upgrades': '캠프 업그레이드', 'Permanent upgrades for every hero, paid with gold from your raids.': '모든 영웅에게 적용되는 영구 업그레이드. 공략에서 얻은 골드로 구매합니다.',
  hero: '영웅', Done: '완료', 'Bonus chest claimed': '보너스 상자 받음', 'Finish all three: bonus gear chest': '세 개 모두 완료: 보너스 장비 상자',
  'Daily quests': '일일 퀘스트', 'New quests every day. Progress counts in every mode.': '매일 새 퀘스트가 나와요. 모든 모드의 진행이 반영됩니다.',
  // settings
  Automatic: '자동', Language: '언어', Player: '플레이어', Name: '이름', Sound: '소리', Effects: '효과음', Music: '음악', Game: '게임',
  'Touch buttons': '터치 버튼', 'See-through': '반투명', Medium: '중간', Solid: '진하게', 'Screen shake': '화면 흔들림', 'Damage numbers': '피해 숫자',
  'Auto-salvage Common items': '일반 아이템 자동 분해', 'Bot skill': '봇 실력', Easy: '쉬움', Hard: '어려움', Save: '저장',
  'Your progress is saved on this device and in your Claude account.': '진행 상황은 이 기기와 Claude 계정에 저장됩니다.', 'Your progress is saved on this device.': '진행 상황은 이 기기에 저장됩니다.',
  'Copy the save code to move it to another device.': '다른 기기로 옮기려면 저장 코드를 복사하세요.', 'Copy save code': '저장 코드 복사', 'Load a save code': '저장 코드 불러오기', 'Reset progress': '진행 초기화',
  // help
  'The basics': '기본', Raids: '공략', Touch: '터치', 'Keyboard (up to 3 players on one keyboard)': '키보드 (한 키보드로 최대 3명)', 'Gamepads (up to 4)': '게임패드 (최대 4개)', Friends: '친구',
  HELP_BASICS: '영웅은 사거리 안의 적을 <b>자동으로 공격</b>합니다. 여러분은 움직이고, 피하고, <b>스킬</b>, <b>궁극기</b>(피해를 줄수록 충전), <b>대시</b>(구르는 동안 맞지 않음)를 쓸 때를 고르면 됩니다. 빨간 영역은 곧 떨어질 공격이니 피하세요!',
  HELP_RAIDS: '영역마다 방 7개와 보스가 있어요. 방을 돌파하면 포털을 고르세요. 포털마다 보상이 보여요 (<b>축복</b>은 이번 런 동안 강해지고, <b>장비 상자</b>는 계속 쓰는 장비를 주고, <b>샘</b>은 회복시켜 줍니다). 쓰러진 동료 옆에 서 있으면 살릴 수 있어요. 골드, 장비, 영웅 경험치는 이기든 지든 남습니다.',
  HELP_TOUCH: '왼쪽을 드래그해서 움직이세요. 버튼을 누르면 가장 가까운 적에게 쓰고, 버튼에서 드래그한 뒤 손을 떼면 그 방향으로 조준합니다. 휴대폰을 세로로 들어도 게임은 자동으로 가로로 돌아갑니다. 설정에서 버튼 투명도를 바꿀 수 있어요.',
  HELP_KEYS: '<b>플레이어 1:</b> WASD 이동 · Q 스킬 · E 궁극기 · Space 대시 (혼자일 때는 방향키 + J/K/L, 마우스 조준도 가능: 왼쪽 클릭 스킬, 오른쪽 클릭 궁극기)<br><b>플레이어 2:</b> IJKL 이동 · U 스킬 · O 궁극기 · ; 대시<br><b>플레이어 3:</b> 방향키 이동 · 숫자패드 1 스킬 · 숫자패드 2 궁극기 · 숫자패드 0 대시',
  HELP_PADS: '왼쪽 스틱 이동 · X 또는 RB 스킬 · B, Y 또는 RT 궁극기 · A, LB 또는 LT 대시 · 오른쪽 스틱 조준 · Start 메뉴.',
  HELP_FRIENDS: '한 화면에서: 모험, 심연, 아레나를 열고 친구가 자기 키나 게임패드 버튼을 누르면 참가합니다. 온라인: 한 명이 <b>친구와 함께</b>에서 방을 만들고 4글자 코드를 알려 주세요. 최대 4명이고 빈자리는 봇이 채웁니다.',
  // setup
  Realm: '영역', cleared: '돌파', 'Not cleared': '아직 돌파 못 함', 'Clear realm {n}': '{n}번 영역 돌파 필요', Difficulty: '난이도',
  'Tougher monsters, more gold and better loot': '더 강한 몬스터, 더 많은 골드, 더 좋은 전리품', 'Clear a realm to unlock Heroic, clear Heroic for Mythic': '영역을 돌파하면 영웅 난이도, 영웅을 돌파하면 신화 난이도가 열려요',
  'Endless floors of mixed monsters with a boss every 5th floor. How deep can you go? Best: floor {n}.': '온갖 몬스터가 나오는 끝없는 층, 5층마다 보스가 나와요. 얼마나 깊이 갈 수 있을까요? 최고 기록: {n}층.',
  FFA: '개인전', 'Knockouts to win': '승리 처치 수', "Heroes are evened out in the arena: level and gear don't count.": '아레나에서는 모든 영웅이 공평해요: 레벨과 장비가 반영되지 않습니다.',
  'Add bot': '봇 추가', 'or press a key / gamepad button to join': '또는 키 / 게임패드 버튼을 눌러 참가', Party: '파티', '(up to 4)': '(최대 4명)',
  'Friends on this device: press U (right keyboard), Numpad 1 (arrows) or A on a gamepad to join.': '이 기기의 친구: U (오른쪽 키보드), 숫자패드 1 (방향키), 또는 게임패드 A를 눌러 참가하세요.',
  Start: '시작', 'Red team': '레드 팀', 'Blue team': '블루 팀', You: '나', Remove: '빼기', Controls: '조작', Bot: '봇', '{dev} joined!': '{dev} 참가!',
  // online
  'Play the same game together on different phones or computers. One player creates a room; the others join with its code. Up to 4 heroes, bots fill the empty places.': '서로 다른 휴대폰이나 컴퓨터에서 같은 게임을 함께 해요. 한 명이 방을 만들고 나머지는 코드로 들어옵니다. 영웅은 최대 4명, 빈자리는 봇이 채워요.',
  'Your name': '내 이름', Host: '방장', 'Create a room and share the code.': '방을 만들고 코드를 알려 주세요.', 'Create room': '방 만들기', Join: '참가',
  ONLINE_NOTE: '온라인 플레이는 기기끼리 직접 연결(WebRTC)되며 인터넷이 필요해요. GitHub Pages 버전에서 작동하고, Claude 미리보기 안에서는 작동하지 않아요. 모바일 데이터에서 연결이 안 되면 Wi-Fi를 써 보세요. 같은 화면의 친구는 모험, 심연, 아레나에서 바로 참가할 수 있어요.',
  Back: '뒤로', you: '나', Mode: '모드', 'Friends vs bots': '친구 대 봇', 'Friends vs friends': '친구 대 친구', 'Fill empty places with bots': '빈자리를 봇으로 채우기',
  'The host picks the mode:': '방장이 모드를 고릅니다:', 'Room code': '방 코드', 'Tell your friends to open Play with friends → Join': '친구에게 친구와 함께 → 참가를 누르라고 알려 주세요',
  Players: '플레이어', 'Waiting for the host to start...': '방장이 시작하기를 기다리는 중...',
  'Connecting...': '연결 중...', 'Creating a room...': '방을 만드는 중...', 'Connected! Waiting for the room...': '연결됐어요! 방 정보를 기다리는 중...', 'This browser cannot play online.': '이 브라우저에서는 온라인 플레이를 할 수 없어요.',
  'The room was closed.': '방이 닫혔어요.', 'Your friend is running a different version. Both of you should reload.': '친구와 게임 버전이 달라요. 두 사람 모두 새로고침하세요.',
  'Could not create a room. Try again.': '방을 만들 수 없어요. 다시 시도하세요.', 'Could not connect to your friend. Check the code, or try another network (Wi-Fi).': '친구와 연결할 수 없어요. 코드를 확인하거나 다른 네트워크(Wi-Fi)를 써 보세요.',
  'The connection failed. Your networks may block direct connections; try Wi-Fi.': '연결에 실패했어요. 네트워크가 직접 연결을 막고 있을 수 있어요. Wi-Fi를 써 보세요.',
  'Room not found. Check the code and make sure your friend is waiting.': '방을 찾을 수 없어요. 코드를 확인하고 친구가 기다리고 있는지 확인하세요.', 'The connection failed.': '연결에 실패했어요.',
  'Could not start a connection on this device.': '이 기기에서 연결을 시작할 수 없어요.', 'Room not found.': '방을 찾을 수 없어요.', 'That room is full.': '방이 가득 찼어요.',
  'The host left the room.': '방장이 방을 나갔어요.',
  'Could not reach the matchmaking server. Online play needs an internet connection (it does not work inside the Claude preview; open the GitHub Pages version).': '매칭 서버에 연결할 수 없어요. 온라인 플레이는 인터넷이 필요해요 (Claude 미리보기 안에서는 작동하지 않으니 GitHub Pages 버전을 여세요).',
  'The matchmaking server refused the connection.': '매칭 서버가 연결을 거부했어요.',
  // toasts and dialogs
  'Now playing {name}': '이제 {name}(으)로 플레이', '{name} joined your guild!': '{name}이(가) 길드에 합류했어요!', 'Salvaged for {g}': '분해해서 {g} 획득',
  'Salvage every unequipped, unlocked Rare or Common item?': '장착하지 않고 잠그지 않은 희귀·일반 아이템을 모두 분해할까요?', 'Salvage every unequipped, unlocked Common item?': '장착하지 않고 잠그지 않은 일반 아이템을 모두 분해할까요?',
  'Salvaged {n} items for {g}': '아이템 {n}개를 분해해 {g} 획득', 'Quest complete! {g}': '퀘스트 완료! {g}', 'Daily chest: {g}': '일일 상자: {g}', 'Come back tomorrow for another chest': '내일 또 상자를 받으러 오세요',
  'Save code copied': '저장 코드를 복사했어요', 'Paste a save code, then press Load again': '저장 코드를 붙여 넣고 불러오기를 한 번 더 누르세요', 'Save loaded': '저장을 불러왔어요', 'That save code is not valid': '올바른 저장 코드가 아니에요',
  'Reset all progress? Heroes, gear, gold and achievements will be lost.': '모든 진행을 초기화할까요? 영웅, 장비, 골드, 업적이 사라집니다.', Reset: '초기화', 'Enter the 4-letter room code': '4글자 방 코드를 입력하세요',
  'Leave this run? You keep the gold and gear found so far.': '이번 런을 그만둘까요? 지금까지 얻은 골드와 장비는 남아요.', Leave: '나가기', Cancel: '취소', '{name} unlocked!': '{name} 해금!',
  'You have {a}/{b}': '{a}/{b} 보유', 'Reroll ({n} left)': '다시 뽑기 ({n}번 남음)', 'No blessings yet': '아직 축복 없음',
  // pause and results
  Paused: '일시 정지', 'Online games keep running while this menu is open.': '온라인 게임은 이 메뉴를 열어도 계속 진행돼요.', Blessings: '축복', Resume: '계속하기',
  'Mute sound': '소리 끄기', 'Unmute sound': '소리 켜기', 'Leave run': '런 그만두기', Rooms: '방', Kills: '처치', 'Best combo': '최고 콤보', Time: '시간', Gold: '골드', 'Hero XP': '영웅 경험치',
  Floors: '층', Knockouts: '처치', Falls: '쓰러짐', '{name} reached level {n}!': '{name} 레벨 {n} 달성!', '{name} · level {n}': '{name} · 레벨 {n}', 'New realm unlocked: {name}!': '새 영역 해금: {name}!',
  Loot: '전리품', 'Play again': '다시 하기', 'Back to lobby': '대기실로', 'Progress loaded from your Claude account': 'Claude 계정에서 진행 상황을 불러왔어요', 'Something went wrong: ': '문제가 생겼어요: ',
  'Your hero attacks on its own.': '영웅은 알아서 공격해요.', 'Step out of <b>red areas</b>: they are attacks about to land!': '<b>빨간 영역</b>에서 벗어나세요: 곧 떨어질 공격이에요!',
  'Drag on the left to move. Tap the skill, ultimate and dash buttons, or drag them to aim.': '왼쪽을 드래그해 움직이고, 스킬·궁극기·대시 버튼을 누르거나 드래그해서 조준하세요.',
  'Left stick moves. X skill, B ultimate, A dash.': '왼쪽 스틱으로 이동, X 스킬, B 궁극기, A 대시.', 'WASD to move. Q skill, E ultimate, Space dash. The mouse aims.': 'WASD 이동, Q 스킬, E 궁극기, Space 대시. 마우스로 조준해요.',
  'Champion!': '챔피언!', 'Place #{n}': '{n}위', 'Victory!': '승리!', Defeat: '패배', Score: '점수', 'You cleared {n} floors': '{n}층 돌파', 'Realm cleared!': '영역 돌파!', Defeated: '패배',
  'The host left the game. Your loot was saved.': '방장이 게임을 나갔어요. 전리품은 저장됐어요.', 'The host left the game.': '방장이 게임을 나갔어요.', '{name} left. A bot takes over.': '{name}이(가) 나갔어요. 봇이 대신 플레이해요.',
  'first to {n}': '{n}점 선취',
  // device names and key hints
  'Q skill': 'Q 스킬', 'E ult': 'E 궁극기', 'Space dash': 'Space 대시', 'U skill': 'U 스킬', 'O ult': 'O 궁극기', '; dash': '; 대시', Arrows: '방향키', '1 skill': '1 스킬', '2 ult': '2 궁극기', '0 dash (numpad)': '0 대시 (숫자패드)',
  'Keyboard (left)': '키보드 (왼쪽)', 'Keyboard (right)': '키보드 (오른쪽)', 'Keyboard (arrows)': '키보드 (방향키)',
});
