'use strict';
// Progression simulator: plays whole careers through the real Save and Meta code (trophies, Trophy
// Road, upgrades, pass, drops, daily wins, quests, shop) and reports how fast an average player
// climbs. The battles themselves aren't simulated: a 3v3 win is a coin flip weighted by power levels
// and the bots' skill, and Showdown places the player around the middle.
// Usage: node blast-squad/tools/progress-sim.cjs [careers=40] [matches=400] [--assert]
//   checks: 1,000 total trophies after 60-80 matches (median) for the average player, and that
//   above 1,000 total trophies trophy changes follow the original table.
const { load } = require('./load.cjs');

const argv = process.argv.slice(2);
const nums = argv.filter((a) => /^\d+$/.test(a)).map(Number);
const CAREERS = nums[0] || 40, MATCHES = nums[1] || 400, ASSERT = argv.includes('--assert');
const PER_DAY = 14; // matches a day (daily wins and quests reset every simulated day)

function makeCareer(seed) {
  let clock = Date.UTC(2026, 0, 5, 9, 0, 0);
  let rs = seed >>> 0;
  const rnd = () => { rs = (rs + 0x6d2b79f5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const M = Object.create(Math); M.random = rnd;
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } }
  const store = {};
  const api = load({
    files: ['01-util.js', '02-const.js', '03-brawlers.js', '04-maps.js', '05-geo.js', '18-save.js', '19-meta.js'],
    names: ['Meta', 'loadGame', 'saveGame', 'BRAWLERS', 'BRAWLER_KEYS', 'MAPS', 'MODE', 'MODE_INFO'],
    allowRandom: true,
    extra: {
      Math: M, Date: FakeDate,
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    },
  });
  // every mode gets a map so all four event slots are playable in the simulation
  const base = Object.keys(api.MAPS)[0];
  for (const m of ['sd', 'ball', 'ko', 'bounty']) {
    if (!Object.keys(api.MAPS).some((k) => api.MAPS[k].modes.includes(m))) api.MAPS['sim_' + m] = Object.assign({}, api.MAPS[base], { modes: [m] });
  }
  api.loadGame();
  return { api, rnd, tick: (ms) => { clock += ms; }, now: () => clock };
}

function play(c) {
  const { api, rnd } = c;
  const Meta = api.Meta, S = () => api.Meta.bState;
  const evs = Meta.events(c.now()).filter((e) => e.ready);
  const ev = evs[Math.floor(rnd() * evs.length)];
  // brawler choice: usually the strongest, sometimes another one
  const owned = api.BRAWLER_KEYS.filter((k) => Meta.owned(k));
  const byLvl = owned.slice().sort((a, b) => Meta.bState(b).lvl - Meta.bState(a).lvl || Meta.bState(a).tro - Meta.bState(b).tro);
  const bk = rnd() < 0.6 ? byLvl[0] : owned[Math.floor(rnd() * owned.length)];
  const cfg = Meta.matchCfg(ev, bk, c.now());
  const me = cfg.slots[0];
  const result = { winner: -1, rank: [], mvp: -1, stats: cfg.slots.map(() => ({ kills: 0, deaths: 0, dmg: 0, heal: 0, gems: 0, goals: 0, stars: 0 })) };
  const st = result.stats[0];
  st.kills = Math.floor(rnd() * 6); st.deaths = Math.floor(rnd() * 5); st.dmg = 8000 + rnd() * 30000; st.heal = rnd() * 6000; st.gems = Math.floor(rnd() * 8); st.goals = rnd() < 0.3 ? 1 : 0;
  if (cfg.mode === 'sd') {
    const lvlEdge = (me.lvl - avg(cfg.slots.slice(1).map((s) => s.lvl))) * 0.6;
    const rank = Math.max(1, Math.min(10, Math.round(4.6 - lvlEdge + (rnd() - 0.5) * 6)));
    const others = cfg.slots.map((s, i) => i).filter((i) => i !== 0);
    others.sort(() => rnd() - 0.5);
    others.splice(rank - 1, 0, 0);
    result.rank = others;
  } else {
    const bots = cfg.slots.slice(1);
    const enemySkill = avg(bots.filter((s) => s.team === 1).map((s) => s.profile.skill));
    const allySkill = avg(bots.filter((s) => s.team === 0).map((s) => s.profile.skill));
    const lvlEdge = me.lvl - avg(bots.filter((s) => s.team === 1).map((s) => s.lvl));
    const p = Math.max(0.15, Math.min(0.85, 0.55 + lvlEdge * 0.04 + (allySkill - enemySkill) * 0.3 + (0.5 - enemySkill) * 0.12));
    const r = rnd();
    result.winner = r < p ? 0 : r < p + 0.04 ? -1 : 1;
  }
  result.mvp = rnd() < 0.25 ? 0 : 1;
  const sum = Meta.applyResult(cfg, result, 0, c.now());
  // the player spends everything sensibly
  Meta.claimRoad();
  while (Meta.claimPass(Meta.passState().claimed + 1)) { /* claim every reached tier */ }
  while (Meta.claimPass(0)) { /* bonus drops */ }
  while (Meta.pendingDrops().length) Meta.openDrop();
  for (const o of Meta.shop(c.now())) if (!o.bought && (!o.cost || o.id.startsWith('pp'))) Meta.buy(o.id, c.now());
  for (const k of byLvl) {
    while (Meta.upgrade(k)) { /* upgrade the strongest first */ }
    Meta.buyGear(k, 'gadget'); Meta.buyGear(k, 'star');
  }
  for (const k of api.BRAWLER_KEYS) if (!Meta.owned(k)) Meta.buyBrawler(k);
  c.tick(Math.round(86400000 / PER_DAY));
  return { sum, cfg };
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const CHECK = [250, 500, 1000, 1500, 2000, 3000];
const reach = CHECK.map(() => []);
const unlockAt = {};
const curr = [];
let tableOk = true;
for (let n = 0; n < CAREERS; n++) {
  const c = makeCareer(1000 + n * 7919);
  const got = CHECK.map(() => null);
  for (let m = 1; m <= MATCHES; m++) {
    const { sum, cfg } = play(c);
    // above 1,000 total trophies the original table applies (no newbie bonus)
    if (!sum.newbie && cfg.mode !== 'sd' && sum.outcome === 'win') {
      const t0 = sum.tro - sum.troDelta;
      const expect = c.api.Meta.trophyDelta(cfg.mode, 'win', 0, t0, 5000);
      if (expect !== sum.troDelta) tableOk = false;
    }
    const total = sum.totalAfter;
    CHECK.forEach((t, i) => { if (got[i] == null && total >= t) got[i] = m; });
    for (const k of c.api.BRAWLER_KEYS) if (c.api.Meta.owned(k)) { (unlockAt[k] = unlockAt[k] || []); if (!unlockAt[k][n]) unlockAt[k][n] = m; }
    if (m === 100 || m === MATCHES) curr.push({ m, coins: c.api.Meta.bState('nova') && 0, total, owned: c.api.BRAWLER_KEYS.filter((k) => c.api.Meta.owned(k)).length });
  }
  got.forEach((v, i) => reach[i].push(v));
}
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
console.log(`Progression: ${CAREERS} careers x ${MATCHES} matches (${PER_DAY} a day)`);
console.log('total trophies | median matches | range | careers that got there');
CHECK.forEach((t, i) => {
  const v = reach[i].filter((x) => x != null);
  console.log(`  ${String(t).padStart(5)} | ${String(med(reach[i]) ?? '-').padStart(6)} | ${v.length ? Math.min(...v) + '-' + Math.max(...v) : '-'} | ${v.length}/${CAREERS}`);
});
console.log('brawler unlocks (median match):');
console.log('  ' + Object.keys(unlockAt).map((k) => `${k} ${med(unlockAt[k]) || 0}`).join(', '));
const at100 = curr.filter((x) => x.m === 100), atEnd = curr.filter((x) => x.m === MATCHES);
console.log(`brawlers owned: ${avg(at100.map((x) => x.owned)).toFixed(1)} at 100 matches, ${avg(atEnd.map((x) => x.owned)).toFixed(1)} at ${MATCHES}`);
console.log(`above 1,000 trophies the original table applies: ${tableOk ? 'yes' : 'NO'}`);
if (ASSERT) {
  const m1000 = med(reach[2]);
  const fails = [];
  if (!(m1000 >= 60 && m1000 <= 80)) fails.push(`1,000 trophies at median match ${m1000} (want 60-80)`);
  if (!tableOk) fails.push('trophy changes above 1,000 differ from the original table');
  if (fails.length) { console.log('FAIL: ' + fails.join('; ')); process.exit(1); }
  console.log('PASS');
}
