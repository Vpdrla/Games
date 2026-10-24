// ---------- Meta: trophies, Trophy Road, upgrades, pass, drops, shop, quests, matchmaking ----------
// Modelled on the original's progression (per-brawler trophies, a Trophy Road on total trophies,
// power levels 1-11 paid with coins and power points, a free pass, rarity-rolling drops, daily wins
// and quests). One deliberate change: below 1,000 total trophies wins pay extra and low brawlers
// don't lose trophies, so the slow early climb goes faster. Above 1,000 the original tables apply.

const Meta = (() => {
  const RARITIES = ['rare', 'super', 'epic', 'mythic', 'legend'];
  const NEWBIE_TOTAL = 1000; // below this many total trophies ...
  const NEWBIE_WIN_MULT = 3; // ... trophy gains are multiplied ...
  const NEWBIE_SAFE = 100; // ... and brawlers under this many trophies never lose any

  // 3v3: [up to brawler trophies, win, loss]
  const TRO_3V3 = [
    [49, 8, 0], [99, 8, -1], [199, 8, -2], [299, 8, -3], [399, 8, -4], [499, 8, -5], [599, 8, -6],
    [699, 8, -7], [799, 8, -8], [899, 7, -9], [999, 6, -10], [1099, 5, -11], [1199, 4, -12], [1e9, 3, -12],
  ];
  // Showdown, 10 players: [up to brawler trophies, [1st .. 10th]]
  const TRO_SD = [
    [49, [10, 8, 7, 6, 4, 2, 2, 1, 0, 0]], [99, [10, 8, 7, 6, 3, 2, 2, 0, -1, -2]],
    [199, [10, 8, 7, 6, 3, 1, 0, -1, -2, -2]], [299, [10, 8, 6, 5, 3, 1, 0, -2, -3, -3]],
    [399, [10, 8, 6, 5, 2, 0, 0, -3, -4, -4]], [499, [10, 8, 6, 5, 2, -1, -2, -3, -5, -5]],
    [599, [10, 8, 6, 4, 2, -1, -2, -5, -6, -6]], [699, [10, 8, 6, 4, 1, -2, -2, -5, -7, -8]],
    [799, [10, 8, 6, 4, 1, -3, -4, -5, -8, -9]], [899, [9, 7, 5, 2, 0, -3, -4, -7, -9, -10]],
    [999, [8, 6, 4, 1, -1, -3, -6, -8, -10, -11]], [1099, [6, 5, 3, 1, -2, -5, -6, -9, -11, -12]],
    [1199, [5, 4, 1, 0, -2, -6, -7, -10, -12, -13]], [1e9, [5, 3, 0, -1, -2, -6, -8, -11, -12, -13]],
  ];
  // coins / power points to go from level i+1 to i+2
  const UP_COINS = [20, 35, 75, 140, 290, 480, 800, 1250, 1875, 2800];
  const UP_PP = [20, 30, 50, 80, 130, 210, 340, 550, 890, 1440];
  const GADGET_LVL = 7, STAR_LVL = 9, GADGET_COST = 1000, STAR_COST = 2000;
  const CREDIT_COST = { rare: 160, super: 430, epic: 925, mythic: 1900, legend: 3800 };

  // ---- Trophy Road (total trophies). Brawler unlocks plus resources; dense below 1,000 ----
  const R = (t, reward) => ({ t, reward });
  const ROAD = [
    R(10, { type: 'brawler', bk: 'bramble' }), R(20, { type: 'coins', n: 100 }), R(30, { type: 'pp', n: 40 }),
    R(45, { type: 'drop', rarity: 'rare' }), R(60, { type: 'brawler', bk: 'dax' }), R(80, { type: 'coins', n: 150 }),
    R(100, { type: 'brawler', bk: 'brick' }), R(125, { type: 'pp', n: 60 }), R(150, { type: 'drop', rarity: 'super' }),
    R(175, { type: 'coins', n: 200 }), R(200, { type: 'brawler', bk: 'pip' }), R(230, { type: 'gems', n: 10 }),
    R(260, { type: 'pp', n: 80 }), R(300, { type: 'brawler', bk: 'melody' }), R(340, { type: 'credits', n: 60 }),
    R(380, { type: 'drop', rarity: 'super' }), R(420, { type: 'coins', n: 250 }), R(460, { type: 'brawler', bk: 'sizzle' }),
    R(500, { type: 'pp', n: 120 }), R(540, { type: 'drop', rarity: 'epic' }), R(580, { type: 'brawler', bk: 'gizmo' }),
    R(620, { type: 'coins', n: 300 }), R(660, { type: 'gems', n: 15 }), R(700, { type: 'brawler', bk: 'volt' }),
    R(740, { type: 'pp', n: 150 }), R(780, { type: 'credits', n: 100 }), R(820, { type: 'drop', rarity: 'epic' }),
    R(860, { type: 'coins', n: 400 }), R(900, { type: 'pp', n: 200 }), R(950, { type: 'drop', rarity: 'mythic' }),
    R(1000, { type: 'brawler', bk: 'hawk' }), R(1100, { type: 'coins', n: 500 }), R(1250, { type: 'brawler', bk: 'frost' }),
    R(1400, { type: 'pp', n: 300 }), R(1500, { type: 'drop', rarity: 'epic' }), R(1650, { type: 'brawler', bk: 'shade' }),
    R(1800, { type: 'coins', n: 750 }), R(2000, { type: 'brawler', bk: 'zip' }), R(2250, { type: 'pp', n: 400 }),
    R(2500, { type: 'brawler', bk: 'specter' }), R(2750, { type: 'drop', rarity: 'legend' }), R(3000, { type: 'brawler', bk: 'thorn' }),
  ];
  for (let t = 3250; t <= 10000; t += 250) {
    const k = (t / 250) % 4;
    ROAD.push(R(t, k === 0 ? { type: 'drop', rarity: 'mythic' } : k === 1 ? { type: 'coins', n: 1000 } : k === 2 ? { type: 'pp', n: 500 } : { type: 'credits', n: 200 }));
  }

  // ---- free pass: 50 tiers, then a bonus drop every 1,000 XP ----
  const PASS_TIER_XP = 500;
  const PASS = [];
  const passCycle = [
    { type: 'coins', n: 100 }, { type: 'pp', n: 50 }, { type: 'drop', rarity: 'rare' }, { type: 'coins', n: 150 },
    { type: 'credits', n: 40 }, { type: 'pp', n: 80 }, { type: 'gems', n: 10 }, { type: 'drop', rarity: 'super' },
  ];
  for (let i = 0; i < 50; i++) {
    let r = passCycle[i % passCycle.length];
    if (i === 24) r = { type: 'brawler', bk: 'frost' };
    else if (i === 49) r = { type: 'drop', rarity: 'legend' };
    else if (i % 10 === 9) r = { type: 'drop', rarity: 'epic' };
    PASS.push({ tier: i + 1, xp: (i + 1) * PASS_TIER_XP, reward: r });
  }
  const PASS_BONUS_XP = 1000;

  // ---- drops: start rarity weights and rewards per final rarity ----
  const DROP_W = { rare: 50, super: 28, epic: 15, mythic: 5, legend: 2 };
  const DROP_REWARDS = {
    rare: [[{ type: 'coins', n: 50 }, 40], [{ type: 'pp', n: 25 }, 40], [{ type: 'credits', n: 10 }, 20]],
    super: [[{ type: 'coins', n: 100 }, 35], [{ type: 'pp', n: 50 }, 35], [{ type: 'credits', n: 30 }, 20], [{ type: 'gems', n: 3 }, 10]],
    epic: [[{ type: 'coins', n: 250 }, 30], [{ type: 'pp', n: 120 }, 30], [{ type: 'credits', n: 80 }, 20], [{ type: 'gems', n: 8 }, 10], [{ type: 'brawler', max: 'super' }, 10]],
    mythic: [[{ type: 'coins', n: 600 }, 25], [{ type: 'pp', n: 300 }, 25], [{ type: 'credits', n: 200 }, 20], [{ type: 'gems', n: 20 }, 10], [{ type: 'brawler', max: 'epic' }, 20]],
    legend: [[{ type: 'coins', n: 1500 }, 20], [{ type: 'pp', n: 700 }, 20], [{ type: 'credits', n: 500 }, 15], [{ type: 'gems', n: 40 }, 10], [{ type: 'brawler', max: 'legend' }, 35]],
  };
  const DAILY_WIN_DROPS = 5; // the first wins of each day give a drop each

  // ---- events: 4 slots with rotating maps, like the original's event list ----
  const EVENT_SLOTS = [['gem'], ['sd'], ['ball'], ['ko', 'bounty']];
  const ROTATE_S = 4 * 3600;

  const MODE_ROLE_W = {
    gem: { fighter: 1, tank: 0.8, sharp: 1, thrower: 1, support: 1, assassin: 0.7, control: 1 },
    sd: { fighter: 1.2, tank: 1.3, sharp: 0.8, thrower: 0.7, support: 0.6, assassin: 1.2, control: 0.9 },
    ball: { fighter: 1.1, tank: 1.3, sharp: 0.8, thrower: 0.6, support: 0.9, assassin: 1, control: 1 },
    ko: { fighter: 0.9, tank: 0.7, sharp: 1.4, thrower: 1.3, support: 1, assassin: 0.8, control: 1.1 },
    bounty: { fighter: 0.9, tank: 0.6, sharp: 1.5, thrower: 1.2, support: 1, assassin: 0.9, control: 1 },
  };

  // ---- bot names: varied styles, like a real lobby ----
  const NAME_A = ['Shadow', 'Blaze', 'Kitty', 'Nova', 'Turbo', 'Ghost', 'Lucky', 'Rex', 'Pixel', 'Sunny', 'Frosty', 'Mango', 'Viper', 'Bunny', 'Ace', 'Nugget', 'Storm', 'Panda', 'Jinx', 'Toast', 'Moon', 'Rocket', 'Bean', 'Spike', 'Echo', 'Zero', 'Mochi', 'Fury', 'Taco', 'Comet'];
  const NAME_B = ['King', 'Queen', 'Master', 'Gamer', 'Hunter', 'Boy', 'Girl', 'Pro', 'Lord', 'YT', 'Ninja', 'Star', 'Wolf', 'Cat', 'Dragon', 'Legend', 'Main', 'Kid', 'Bro', 'Senpai'];
  const NAME_FIRST = ['Minjun', 'Jiwoo', 'Seoyeon', 'Haneul', 'Lukas', 'Mateo', 'Yuki', 'Sora', 'Ahmed', 'Sofia', 'Lea', 'Noah', 'Emma', 'Liam', 'Chloe', 'Ivan', 'Aiko', 'Diego', 'Nina', 'Omar', 'Hugo', 'Mila', 'Kenji', 'Zara', 'Leo', 'Ana', 'Felix', 'Ines', 'Arjun', 'Maya'];
  const CLAN = ['TBK', 'GG', 'BS', 'XD', 'OP', 'KR', 'EU', 'RIP', 'ZZZ', 'LOL', 'MVP', 'NRG'];

  // ---- helpers ----
  const S = () => SAVE;
  const dayKey = (now) => { const d = new Date(now); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const owned = (bk) => !!S().brawlers[bk];
  const bState = (bk) => {
    const b = S().brawlers[bk];
    return b ? { tro: b.tro, best: b.best, lvl: b.lvl, pp: S().pp | 0, gadget: b.gadget, star: b.star, gad: b.gad, st: b.st, games: b.games, wins: b.wins } : null;
  };
  const totalTrophies = () => { let n = 0; for (const k in S().brawlers) n += S().brawlers[k].tro; return n; };
  const band = (tbl, tro) => { for (const r of tbl) if (tro <= r[0]) return r; return tbl[tbl.length - 1]; };
  const rarityOf = (bk) => (BRAWLERS[bk] ? BRAWLERS[bk].rarity : 'rare');
  const rarIdx = (r) => (r === 'start' ? -1 : RARITIES.indexOf(r));
  const mapsFor = (mode) => (typeof MAPS === 'undefined' ? [] : Object.keys(MAPS).filter((k) => (MAPS[k].modes || []).includes(mode)));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const wpick = (entries) => { let t = 0; for (const e of entries) t += e[1]; let r = Math.random() * t; for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; } return entries[entries.length - 1][0]; };

  // ---- daily state (wins, quests, gift, shop purchases) ----
  const QUEST_KINDS = [
    { k: 'play', text: (q) => `Play ${q.goal} games`, goal: () => 4, xp: 200 },
    { k: 'win', text: (q) => `Win ${q.goal} games`, goal: () => 3, xp: 300 },
    { k: 'winMode', text: (q) => `Win ${q.goal} games in ${MODE_INFO[q.mode].name}`, goal: () => 2, xp: 300, mode: true },
    { k: 'kills', text: (q) => `Defeat ${q.goal} enemies`, goal: () => 10 + Math.floor(Math.random() * 3) * 5, xp: 250 },
    { k: 'dmgRole', text: (q) => `Deal ${fmtNum(q.goal)} damage with ${ROLES[q.role]} brawlers`, goal: () => 20000 + Math.floor(Math.random() * 3) * 10000, xp: 300, role: true },
    { k: 'heal', text: (q) => `Heal ${fmtNum(q.goal)} health`, goal: () => 8000, xp: 250 },
    { k: 'gems', text: (q) => `Collect ${q.goal} gems in Gem Rush`, goal: () => 12, xp: 250, needMode: 'gem' },
    { k: 'goals', text: (q) => `Score ${q.goal} goals in Blast Ball`, goal: () => 2, xp: 300, needMode: 'ball' },
  ];
  function daily(now) {
    const d = S().daily, key = dayKey(now || Date.now());
    if (d.day !== key) {
      d.day = key; d.wins = 0; d.gift = false; d.bought = [];
      d.quests = makeQuests();
      saveGame();
    }
    return d;
  }
  function makeQuests() {
    const ready = Object.keys(MODE_INFO).filter((m) => mapsFor(m).length);
    const kinds = QUEST_KINDS.filter((q) => !q.needMode || ready.includes(q.needMode));
    const out = [];
    const used = new Set();
    while (out.length < 3 && used.size < kinds.length) {
      const q = pick(kinds);
      if (used.has(q.k)) continue;
      used.add(q.k);
      const quest = { k: q.k, n: 0, done: false, xp: q.xp };
      if (q.mode) quest.mode = pick(ready.length ? ready : ['gem']);
      if (q.role) quest.role = pick(Object.keys(ROLES));
      quest.goal = q.goal();
      out.push(quest);
    }
    return out;
  }
  const questText = (q) => { const k = QUEST_KINDS.find((x) => x.k === q.k); return k ? k.text(q) : q.k; };

  // ---- rewards ----
  function unownedUpTo(maxR) {
    const mi = rarIdx(maxR);
    return BRAWLER_KEYS.filter((k) => !owned(k) && rarIdx(rarityOf(k)) <= mi);
  }
  // Applies a reward and returns what was actually given (a brawler already owned turns into credits).
  function grant(r) {
    const s = S();
    const g = Object.assign({}, r);
    switch (r.type) {
      case 'coins': s.coins += r.n; break;
      case 'pp': s.pp = (s.pp | 0) + r.n; break;
      case 'credits': s.credits += r.n; break;
      case 'gems': s.gems += r.n; break;
      case 'drop': s.drops.push(r.rarity || ''); break;
      case 'brawler': {
        let bk = r.bk;
        if (!bk) { const pool = unownedUpTo(r.max || 'legend'); bk = pool.length ? pick(pool) : null; }
        if (bk && !owned(bk)) { s.brawlers[bk] = newBrawlerState(); g.bk = bk; g.isNew = true; } else {
          g.type = 'credits'; g.n = bk ? Math.round(CREDIT_COST[rarityOf(bk)] / 2) : 100; s.credits += g.n; g.converted = true;
        }
        break;
      }
    }
    return g;
  }

  // ---- brawlers ----
  function upgradeCost(bk) {
    const b = S().brawlers[bk];
    if (!b || b.lvl >= MAX_POWER) return null;
    return { coins: UP_COINS[b.lvl - 1], pp: UP_PP[b.lvl - 1] };
  }
  function upgrade(bk) {
    const c = upgradeCost(bk), s = S();
    if (!c || s.coins < c.coins || (s.pp | 0) < c.pp) return false;
    s.coins -= c.coins; s.pp -= c.pp; s.brawlers[bk].lvl++;
    saveGame();
    return true;
  }
  // kind: 'gadget' | 'star'
  function gearCost(bk, kind, i) {
    const b = S().brawlers[bk];
    if (!b) return null;
    const have = kind === 'gadget' ? b.gad : b.st;
    if (have[i || 0]) return null;
    return { coins: kind === 'gadget' ? GADGET_COST : STAR_COST, lvl: kind === 'gadget' ? GADGET_LVL : STAR_LVL };
  }
  function buyGear(bk, kind, i) {
    i = i || 0;
    const c = gearCost(bk, kind, i), b = S().brawlers[bk];
    if (!c || b.lvl < c.lvl || S().coins < c.coins) return false;
    S().coins -= c.coins;
    if (kind === 'gadget') { b.gad[i] = true; if (b.gadget < 0) b.gadget = i; } else { b.st[i] = true; if (b.star < 0) b.star = i; }
    saveGame();
    return true;
  }
  function setGear(bk, gadget, star) {
    const b = S().brawlers[bk];
    if (!b) return;
    if (gadget === -1 || b.gad[gadget]) b.gadget = gadget;
    if (star === -1 || b.st[star]) b.star = star;
    saveGame();
  }
  function buyBrawler(bk) {
    if (owned(bk) || !BRAWLERS[bk]) return false;
    const c = CREDIT_COST[rarityOf(bk)];
    if (!c || S().credits < c) return false;
    S().credits -= c;
    S().brawlers[bk] = newBrawlerState();
    saveGame();
    return true;
  }
  const creditCost = (bk) => CREDIT_COST[rarityOf(bk)] || 0;
  function select(bk) { if (owned(bk)) { S().sel = bk; saveGame(); } }

  // ---- Trophy Road ----
  function roadState() {
    const s = S();
    let ready = 0;
    for (let i = s.road; i < ROAD.length && ROAD[i].t <= s.hiTotal; i++) ready++;
    const next = ROAD.find((n) => n.t > s.hiTotal) || null;
    return { claimed: s.road, ready, next, total: totalTrophies(), hi: s.hiTotal };
  }
  function claimRoad() {
    const s = S(), out = [];
    while (s.road < ROAD.length && ROAD[s.road].t <= s.hiTotal) { out.push(Object.assign({ t: ROAD[s.road].t }, grant(ROAD[s.road].reward))); s.road++; }
    if (out.length) saveGame();
    return out;
  }

  // ---- pass ----
  function passState() {
    const p = S().pass;
    let tier = 0;
    while (tier < PASS.length && p.xp >= PASS[tier].xp) tier++;
    const bonusXp = Math.max(0, p.xp - PASS[PASS.length - 1].xp);
    const bonusReady = Math.floor(bonusXp / PASS_BONUS_XP) - (p.bonus | 0);
    const cur = tier < PASS.length ? (PASS[tier - 1] ? PASS[tier - 1].xp : 0) : PASS[PASS.length - 1].xp;
    const nxt = tier < PASS.length ? PASS[tier].xp : cur + PASS_BONUS_XP;
    return { xp: p.xp, tier, claimed: p.claimed, ready: tier - p.claimed + Math.max(0, bonusReady), tierXp: p.xp - cur, tierNeed: nxt - cur, bonusReady: Math.max(0, bonusReady) };
  }
  // Claims tier `tier` (1-based; must be the next unclaimed and reached) or a bonus drop (tier 0).
  function claimPass(tier) {
    const p = S().pass, st = passState();
    if (tier === 0) {
      if (st.bonusReady <= 0) return null;
      p.bonus = (p.bonus | 0) + 1;
      const g = grant({ type: 'drop', rarity: 'super' });
      saveGame();
      return g;
    }
    if (tier !== p.claimed + 1 || tier > st.tier) return null;
    p.claimed = tier;
    const g = grant(PASS[tier - 1].reward);
    saveGame();
    return g;
  }

  // ---- drops ----
  const pendingDrops = () => S().drops.slice();
  // Opens the oldest pending drop. steps: the rarities the opening animation climbs through.
  function openDrop() {
    const s = S();
    if (!s.drops.length) return null;
    const floor = s.drops.shift() || 'rare';
    const fi = Math.max(0, RARITIES.indexOf(floor));
    const final = wpick(RARITIES.slice(fi).map((r) => [r, DROP_W[r]]));
    const steps = RARITIES.slice(fi, RARITIES.indexOf(final) + 1);
    let r = wpick(DROP_REWARDS[final]);
    if (r.type === 'brawler' && !unownedUpTo(r.max).length) r = { type: 'credits', n: Math.round(CREDIT_COST[final] / 3) };
    const reward = grant(r);
    saveGame();
    return { rarity: final, steps, reward };
  }

  // ---- shop ----
  function shop(now) {
    const d = daily(now);
    const day = d.day;
    const h = hashStr(day);
    const gifts = [{ type: 'coins', n: 100 }, { type: 'pp', n: 50 }, { type: 'drop', rarity: 'rare' }];
    const offers = [
      { id: 'gift', title: 'Daily gift', give: gifts[h % gifts.length], cost: null },
      { id: 'pp100', title: 'Power points', give: { type: 'pp', n: 100 }, cost: { coins: 200 } },
      { id: 'pp300', title: 'Power points', give: { type: 'pp', n: 300 }, cost: { coins: 540 } },
      { id: 'coins500', title: 'Coins', give: { type: 'coins', n: 500 }, cost: { gems: 30 } },
      { id: 'credits250', title: 'Credits', give: { type: 'credits', n: 250 }, cost: { gems: 40 } },
      { id: 'dropEpic', title: 'Epic drop', give: { type: 'drop', rarity: 'epic' }, cost: { gems: 25 } },
    ];
    for (const o of offers) o.bought = o.id === 'gift' ? d.gift : d.bought.includes(o.id);
    return offers;
  }
  function buy(id, now) {
    const o = shop(now).find((x) => x.id === id), s = S(), d = daily(now);
    if (!o || o.bought) return null;
    if (o.cost) {
      if (o.cost.coins && s.coins < o.cost.coins) return null;
      if (o.cost.gems && s.gems < o.cost.gems) return null;
      if (o.cost.coins) s.coins -= o.cost.coins;
      if (o.cost.gems) s.gems -= o.cost.gems;
      d.bought.push(id);
    } else d.gift = true;
    const g = grant(o.give);
    saveGame();
    return g;
  }
  const quests = (now) => daily(now).quests.map((q) => Object.assign({ text: questText(q) }, q));

  // ---- events ----
  function events(now) {
    now = now || Date.now();
    const t = now / 1000;
    return EVENT_SLOTS.map((modes, i) => {
      const off = i * 3600;
      const k = Math.floor((t + off) / ROTATE_S);
      const mode = modes[k % modes.length];
      const maps = mapsFor(mode);
      const map = maps.length ? maps[Math.floor(k / modes.length) % maps.length] : null;
      return { id: i + ':' + k, slot: i, mode, map, ready: !!map, endsAt: ((k + 1) * ROTATE_S - off) * 1000 };
    });
  }

  // ---- bots ----
  function botName(rng) {
    const style = rng.int(0, 6);
    const num = () => String(rng.int(1, 999));
    switch (style) {
      case 0: return rng.pick(NAME_A) + rng.pick(NAME_B);
      case 1: return rng.pick(NAME_FIRST) + (rng.chance(0.6) ? num() : '');
      case 2: return rng.pick(NAME_A).toLowerCase() + '_' + rng.pick(NAME_B).toLowerCase();
      case 3: return 'xX' + rng.pick(NAME_A) + 'Xx';
      case 4: return '[' + rng.pick(CLAN) + '] ' + rng.pick(NAME_FIRST);
      case 5: return rng.pick(NAME_FIRST).toUpperCase().slice(0, 4) + rng.pick(['.exe', 'YT', '07', '!!', '~']);
      default: return rng.pick(NAME_A) + rng.pick(['', '.', '-']) + num();
    }
  }
  // Skill grows with trophies: low trophies meet beginner-like bots, high trophies strong ones.
  function botProfile(rng, tro, mode) {
    const skill = clamp(0.15 + 0.65 * Math.min(1, tro / 900) + 0.15 * Math.min(1, Math.max(0, tro - 900) / 900) + rng.range(-0.12, 0.12), 0.05, 0.97);
    const fav = rng.shuffle(BRAWLER_KEYS.slice()).slice(0, 3);
    return {
      name: botName(rng), icon: rng.pick(BRAWLER_KEYS), skill,
      traits: { aggr: rng.next(), patience: rng.next(), greed: rng.next(), teamwork: clamp(0.35 + rng.next() * 0.65, 0, 1), tilt: rng.next() },
      fav, mode,
    };
  }
  function wallShare(mapKey) {
    try {
      const m = parseMap(mapKey);
      let w = 0;
      for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === TILE.WALL) w++;
      return w / m.tiles.length;
    } catch (e) { return 0; }
  }
  function botBrawler(rng, prof, mode, mapKey, taken) {
    const roleW = MODE_ROLE_W[mode] || MODE_ROLE_W.gem;
    const walls = wallShare(mapKey);
    const entries = [];
    for (const bk of BRAWLER_KEYS) {
      if (taken.has(bk)) continue;
      const role = BRAWLERS[bk].role;
      let w = roleW[role] || 1;
      if (role === 'thrower' && walls > 0.08) w *= 1.5;
      if (prof.fav.includes(bk)) w *= 2.5;
      entries.push([bk, w]);
    }
    return entries.length ? rng.weighted(entries) : rng.pick(BRAWLER_KEYS);
  }
  function botSlot(rng, team, mode, mapKey, tro, lvl, taken) {
    const btro = Math.max(0, Math.round(tro * rng.range(0.75, 1.2) + rng.int(-15, 25)));
    const prof = botProfile(rng, btro, mode);
    const bk = botBrawler(rng, prof, mode, mapKey, taken);
    taken.add(bk);
    const blvl = clamp(lvl + rng.int(-1, 1), 1, MAX_POWER);
    return {
      team, bk, lvl: blvl, gadget: blvl >= GADGET_LVL && rng.chance(0.8) ? 0 : -1, star: blvl >= STAR_LVL && rng.chance(0.7) ? 0 : -1,
      name: prof.name, icon: prof.icon, tro: btro, ctrl: 'bot', profile: prof,
    };
  }
  function localSlot(team, bk) {
    const b = S().brawlers[bk];
    return {
      team, bk, lvl: b.lvl, gadget: b.lvl >= GADGET_LVL ? b.gadget : -1, star: b.lvl >= STAR_LVL ? b.star : -1,
      name: S().name, icon: S().icon, tro: b.tro, ctrl: 'local', profile: null,
    };
  }

  // Builds a Match cfg for an event and the chosen brawler: the local player plus bots.
  function matchCfg(ev, bk, now) {
    if (!ev || !ev.map) return null;
    bk = owned(bk) ? bk : S().sel;
    const b = S().brawlers[bk];
    const seed = (Math.random() * 0x7fffffff) | 0;
    const rng = new RNG(seed ^ 0x5bd1e995);
    const mode = ev.mode;
    const size = MODE_INFO[mode].teams * MODE_INFO[mode].size;
    const slots = [];
    const taken = new Set([bk]);
    for (let i = 0; i < size; i++) {
      const team = mode === MODE.SHOWDOWN ? i : (i < 3 ? 0 : 1);
      if (i === 0) { slots.push(localSlot(team, bk)); continue; }
      if (mode !== MODE.SHOWDOWN && i === 3) taken.clear(); // teammates differ; enemies may mirror you
      slots.push(botSlot(rng, team, mode, ev.map, b.tro, b.lvl, taken));
    }
    return { mode, map: ev.map, seed, slots, localSlot: 0, friendly: false, event: ev.id };
  }

  // Friend battle. opts: { mode, map, hostBk, guestBk, sameTeam, hostLvl, guestLvl }. The host is
  // slot 0; the guest is slot 1 (same team) or slot 3 (other team) in 3v3, slot 1 in Showdown.
  function friendlyCfg(opts) {
    const mode = opts.mode, size = MODE_INFO[mode].teams * MODE_INFO[mode].size;
    const seed = (Math.random() * 0x7fffffff) | 0;
    const rng = new RNG(seed ^ 0x2545f491);
    const guestSlot = mode === MODE.SHOWDOWN ? 1 : opts.sameTeam ? 1 : 3;
    const slots = [];
    const guestBk = BRAWLER_KEYS.includes(opts.guestBk) ? opts.guestBk : 'nova'; // never trust a key from the network
    const taken = new Set([opts.hostBk, guestBk]);
    for (let i = 0; i < size; i++) {
      const team = mode === MODE.SHOWDOWN ? i : (i < 3 ? 0 : 1);
      if (i === 0) slots.push(Object.assign(localSlot(team, owned(opts.hostBk) ? opts.hostBk : S().sel), { ctrl: 'local' }));
      else if (i === guestSlot) {
        const lvl = clamp(opts.guestLvl | 0 || 1, 1, MAX_POWER);
        slots.push({ team, bk: guestBk, lvl, gadget: lvl >= GADGET_LVL && opts.guestGad ? 0 : -1, star: lvl >= STAR_LVL && opts.guestStar ? 0 : -1, name: String(opts.guestName || 'Friend').slice(0, 16), icon: guestBk, tro: opts.guestTro | 0, ctrl: 'remote', profile: null });
      } else slots.push(botSlot(rng, team, mode, opts.map, 300, Math.max(1, Math.round(((opts.hostLvl || 1) + (opts.guestLvl || 1)) / 2)), taken));
    }
    return { mode, map: opts.map, seed, slots, localSlot: 0, guestSlot, friendly: true };
  }

  // ---- results ----
  function trophyDelta(mode, outcome, rank, tro, total) {
    let d;
    if (mode === MODE.SHOWDOWN) d = band(TRO_SD, tro)[1][clamp(rank, 1, 10) - 1];
    else d = outcome === 'win' ? band(TRO_3V3, tro)[1] : outcome === 'loss' ? band(TRO_3V3, tro)[2] : 0;
    if (total < NEWBIE_TOTAL) {
      if (d > 0) d = Math.round(d * NEWBIE_WIN_MULT);
      if (d < 0 && tro < NEWBIE_SAFE) d = 0;
    }
    if (d < 0) d = -Math.min(-d, tro); // never below 0
    return d;
  }
  function passXpFor(mode, outcome, rank, mvp) {
    let xp = mode === MODE.SHOWDOWN ? (rank <= 2 ? 40 : rank <= 4 ? 35 : rank <= 6 ? 25 : 20) : outcome === 'win' ? 40 : outcome === 'draw' ? 30 : 20;
    if (mvp) xp += 10;
    return xp;
  }
  // Pays out a finished match and returns a summary for the result screen.
  // opts.abandoned: the player left (or closed the app) mid-match: a loss with no pass XP, quest
  // progress or daily win, as in the original.
  function applyResult(cfg, result, slot, now, opts) {
    if (slot === undefined) slot = cfg.localSlot || 0;
    const abandoned = !!(opts && opts.abandoned);
    const s = S(), me = cfg.slots[slot];
    const mode = cfg.mode;
    let outcome, rank = 0;
    if (mode === MODE.SHOWDOWN) {
      rank = result.rank && result.rank.indexOf(slot) >= 0 ? result.rank.indexOf(slot) + 1 : 10;
      outcome = rank <= 4 ? 'win' : 'loss';
    } else outcome = result.winner === -1 ? 'draw' : result.winner === me.team ? 'win' : 'loss';
    const mvp = result.mvp === slot;
    const st = (result.stats && result.stats[slot]) || {};
    if (cfg.friendly) return { friendly: true, outcome, rank, mvp, stats: st };
    const d = daily(now);
    const b = s.brawlers[me.bk];
    const totalBefore = totalTrophies();
    const delta = b ? trophyDelta(mode, outcome, rank, b.tro, totalBefore) : 0;
    if (b) {
      b.tro += delta; b.best = Math.max(b.best, b.tro); b.games++;
      if (outcome === 'win') b.wins++;
    }
    const totalAfter = totalTrophies();
    s.hiTotal = Math.max(s.hiTotal, totalAfter);
    const ss = s.stats;
    ss.played++;
    const won = mode === MODE.SHOWDOWN ? rank === 1 : outcome === 'win';
    if (outcome === 'win') { ss.wins++; ss.streak++; ss.bestStreak = Math.max(ss.bestStreak, ss.streak); } else if (outcome === 'loss') { ss.losses++; ss.streak = 0; } else ss.draws++;
    if (mode === MODE.SHOWDOWN && rank === 1) ss.sdWins++;
    ss.kills += st.kills | 0; ss.deaths += st.deaths | 0;
    if (mvp) ss.mvps++;
    // pass XP
    const passBefore = passState().tier;
    let xp = abandoned ? 0 : passXpFor(mode, outcome, rank, mvp);
    // daily win drops
    let dropEarned = false;
    if (!abandoned && outcome === 'win' && d.wins < DAILY_WIN_DROPS) { d.wins++; s.drops.push(''); dropEarned = true; }
    // quests
    const questsDone = [];
    for (const q of d.quests) {
      if (q.done || abandoned) continue;
      let add = 0;
      switch (q.k) {
        case 'play': add = 1; break;
        case 'win': add = outcome === 'win' ? 1 : 0; break;
        case 'winMode': add = outcome === 'win' && mode === q.mode ? 1 : 0; break;
        case 'kills': add = st.kills | 0; break;
        case 'dmgRole': add = BRAWLERS[me.bk] && BRAWLERS[me.bk].role === q.role ? Math.round(st.dmg || 0) : 0; break;
        case 'heal': add = Math.round(st.heal || 0); break;
        case 'gems': add = mode === MODE.GEM ? st.gems | 0 : 0; break;
        case 'goals': add = mode === MODE.BALL ? st.goals | 0 : 0; break;
      }
      q.n = Math.min(q.goal, q.n + add);
      if (q.n >= q.goal) { q.done = true; xp += q.xp; questsDone.push(questText(q)); }
    }
    s.pass.xp += xp;
    const passAfter = passState().tier;
    const road = roadState();
    saveGame();
    return {
      friendly: false, outcome, rank, mvp, won, stats: st,
      bk: me.bk, troDelta: delta, tro: b ? b.tro : 0, best: b ? b.best : 0, totalBefore, totalAfter,
      newbie: totalBefore < NEWBIE_TOTAL, passXp: xp, passTierUps: passAfter - passBefore,
      dropEarned, dailyWins: d.wins, dailyWinMax: DAILY_WIN_DROPS, questsDone, roadReady: road.ready, roadNext: road.next,
    };
  }

  return {
    RARITIES, ROAD, PASS, PASS_TIER_XP, UP_COINS, UP_PP, CREDIT_COST, GADGET_LVL, STAR_LVL, NEWBIE_TOTAL, DAILY_WIN_DROPS,
    owned, bState, totalTrophies, upgradeCost, upgrade, gearCost, buyGear, setGear, buyBrawler, creditCost, select,
    roadState, claimRoad, passState, claimPass, pendingDrops, openDrop, shop, buy, quests, daily,
    events, matchCfg, friendlyCfg, botProfile, applyResult, trophyDelta, mapsFor, grant,
  };
})();
