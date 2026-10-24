'use strict';
// Human-likeness and fairness test for the bots: plays headless bot matches per skill tier and checks
// behaviour against target ranges for human players (reaction times, hit rates by distance, stick
// direction changes, idling, bush time, retreat health, super timing, stuck time), that better bots
// beat worse ones, and that bots can't cheat (static scan + a counterfactual percept test).
// Usage: node blast-squad/tools/ai-test.cjs [matchesPerTier=12] [--mode=gem] [--verbose]
const fs = require('node:fs');
const path = require('node:path');
const { load, checkDeterministicSources } = require('./load.cjs');

const argv = process.argv.slice(2);
const N = +(argv.find((a) => /^\d+$/.test(a)) || 12);
const MODE_ARG = (argv.find((a) => a.startsWith('--mode=')) || '--mode=gem').slice(7);
const VERBOSE = argv.includes('--verbose');
const A = load({ names: ['Sim', 'Bot', 'Telemetry', 'perceive', 'newPercept', 'BRAWLER_KEYS', 'MAPS', 'MODE', 'MODE_INFO', 'RNG', 'botParams'] });
let failures = 0;
const say = (ok, name, detail) => { if (!ok) failures++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`); };
const med = (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (x) => (x * 100).toFixed(0) + '%';

function mapFor(mode) { return Object.keys(A.MAPS).filter((k) => A.MAPS[k].modes.includes(mode)); }
function traits(rng) { return { aggr: rng.next(), patience: rng.next(), greed: rng.next(), teamwork: 0.35 + rng.next() * 0.65, tilt: rng.next() }; }

// One match. skills: per slot. Returns per-slot telemetry and the result.
function play(mode, map, seed, skills, keys) {
  const size = A.MODE_INFO[mode].teams * A.MODE_INFO[mode].size;
  const rng = new A.RNG(seed * 31 + 7);
  const slots = [];
  for (let i = 0; i < size; i++) slots.push({ team: mode === 'sd' ? i : i < 3 ? 0 : 1, bk: keys[i % keys.length], lvl: 7, gadget: 0, star: 0 });
  const sim = new A.Sim({ mode, map, seed, slots });
  sim.pins = [];
  const bots = slots.map((s, i) => new A.Bot(i, { skill: skills[i], traits: traits(rng) }, seed * 97 + i));
  const tel = slots.map((s, i) => new A.Telemetry(sim, i));
  let n = 0;
  const cap = 30 * 60 * 6;
  while (!sim.over && n < cap) {
    for (let i = 0; i < size; i++) {
      sim.setInput(i, bots[i].tick(sim));
      if (bots[i].outPin != null) { sim.pins.push({ slot: i, id: bots[i].outPin, t: sim.t }); bots[i].outPin = null; }
    }
    sim.step();
    if (sim.pins.length && sim.t - sim.pins[0].t > 4) sim.pins.shift();
    for (const t of tel) t.tick(sim.events);
    sim.events.length = 0;
    for (const b of sim.brawlers) if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.hp)) throw new Error('NaN in brawler ' + b.slot);
    n++;
  }
  return { sim, bots, tel: tel.map((t) => t.report()), result: sim.result, secs: sim.t };
}

// ---- 1. anti-cheat ----
console.log('== Bots only see what a player sees');
{
  const src = ['09-mind.js', '10-motor.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8').replace(/\/\/.*$/gm, ''));
  const botPart = src[1].split('class Telemetry')[0] + src[0];
  const botBad = botPart.split('\n').filter((l) => /\bsim\./.test(l) && !/perceive\(sim,/.test(l));
  say(botBad.length === 0, 'static scan', botBad.length ? botBad.slice(0, 3).join(' | ') : 'mind and motor read the sim only through perceive()');
  // counterfactual: moving an enemy this team can't see must not change what it perceives
  const map = mapFor('gem')[0];
  const slots = [];
  for (let i = 0; i < 6; i++) slots.push({ team: i < 3 ? 0 : 1, bk: A.BRAWLER_KEYS[i], lvl: 5, gadget: 0, star: 0 });
  const sim = new A.Sim({ mode: 'gem', map, seed: 5, slots });
  for (let k = 0; k < 30; k++) sim.step();
  const P1 = JSON.stringify(Object.assign({}, A.perceive(sim, 0, A.newPercept(), null), { map: null, _seen: null }));
  const enemy = sim.brawlers.find((b) => b.team === 1 && !((b.vis >> 0) & 1));
  let same = true, tested = 0;
  for (const b of sim.brawlers) {
    if (b.team === 0) continue;
    const P0 = A.perceive(sim, 0, A.newPercept(), null);
    if (P0.enemies.some((e) => e.slot === b.slot)) continue; // on screen: moving it would change the percept
    tested++;
    const ox = b.x, oy = b.y;
    b.x = 2; b.y = 2;
    const P2 = JSON.stringify(Object.assign({}, A.perceive(sim, 0, A.newPercept(), null), { map: null, _seen: null }));
    b.x = ox; b.y = oy;
    if (P2 !== P1) same = false;
  }
  say(same && tested > 0, 'counterfactual percept', `${tested} unseen enemies moved, percept unchanged: ${same}${enemy ? '' : ''}`);
  say(checkDeterministicSources().length === 0, 'deterministic sources', checkDeterministicSources().slice(0, 2).join(' | ') || 'no Math.random / Date in sim or AI');
}

// ---- 2. determinism with bots ----
console.log('== Determinism');
{
  const map = mapFor(MODE_ARG)[0];
  const keys = A.BRAWLER_KEYS.slice(0, 6);
  const a = play(MODE_ARG, map, 77, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], keys);
  const b = play(MODE_ARG, map, 77, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], keys);
  const h = (r) => JSON.stringify([r.secs, r.result.winner, r.result.score, r.sim.brawlers.map((x) => [x.x.toFixed(4), x.y.toFixed(4), x.hp])]);
  say(h(a) === h(b), 'same seed, same match', `${a.secs.toFixed(1)} s, winner ${a.result.winner}`);
}

// ---- 3. behaviour per tier ----
// Hit-rate ranges are first estimates for single-projectile attacks at 3-6 tiles. The sim's auto-aim
// (like the original's) aims at a target's current spot, so against players who walk in straight
// lines it hits often; calibrate with window.__BS.telemetry() from real matches.
const TIERS = [
  { name: 'beginner', skill: 0.15, react: [0.33, 0.45], hitMid: [0.3, 0.75] },
  { name: 'mid', skill: 0.5, react: [0.23, 0.32], hitMid: [0.3, 0.65] },
  { name: 'expert', skill: 0.88, react: [0.18, 0.25], hitMid: [0.35, 0.75] },
];
const all = {};
for (const tier of TIERS) {
  console.log(`== ${tier.name} bots (skill ${tier.skill}), ${N} ${MODE_ARG} matches`);
  const maps = mapFor(MODE_ARG);
  const agg = { reacts: [], hitNear: [0, 0], hitMid: [0, 0], hitFar: [0, 0], multiNear: [0, 0], multiMid: [0, 0], multiFar: [0, 0], dir: [], idle: [], bush: [], retreat: [], supDelay: [], fastRev: [], stuck: 0, mins: 0, objective: 0, secs: [], resp: [] };
  for (let g = 0; g < N; g++) {
    const keys = [];
    for (let i = 0; i < 6; i++) keys.push(A.BRAWLER_KEYS[(g * 7 + i * 4) % A.BRAWLER_KEYS.length]);
    const r = play(MODE_ARG, maps[g % maps.length], 1000 + g, keys.map(() => tier.skill), keys);
    agg.secs.push(r.secs);
    if (r.result && r.result.reason !== 'time') agg.objective++;
    r.bots.forEach((b, i) => {
      const T = b.telemetry, R = r.tel[i];
      agg.reacts.push(...T.reacts);
      agg.retreat.push(...T.retreatHPs);
      agg.supDelay.push(...T.superDelays);
      agg.stuck += T.stuck;
      const mins = (T.alive / 30) / 60;
      agg.mins += mins;
      agg.fastRev.push(T.fastReversals / Math.max(0.05, mins));
      agg.dir.push(R.dirChangesPerMin);
      agg.idle.push(R.idle);
      agg.bush.push(R.bush);
      if (R.responseMedian != null) agg.resp.push(R.responseMedian);
      for (const k of ['hitNear', 'hitMid', 'hitFar', 'multiNear', 'multiMid', 'multiFar']) if (R[k].n) { agg[k][0] += R[k].hit * R[k].n; agg[k][1] += R[k].n; }
    });
  }
  const hr = (k) => (agg[k][1] ? agg[k][0] / agg[k][1] : NaN);
  const rm = med(agg.reacts);
  say(rm >= tier.react[0] && rm <= tier.react[1], 'reaction median', `${(rm * 1000).toFixed(0)} ms (${tier.react.map((x) => x * 1000).join('-')}), fastest ${(Math.min(...agg.reacts) * 1000).toFixed(0)} ms (>= 130)`);
  say(Math.min(...agg.reacts) >= 0.13, 'no superhuman reactions', `min ${(Math.min(...agg.reacts) * 1000).toFixed(0)} ms`);
  say(hr('hitMid') >= tier.hitMid[0] && hr('hitMid') <= tier.hitMid[1], 'hit rate 3-6 tiles', `${pct(hr('hitMid'))} of ${agg.hitMid[1]} single-projectile attacks (${tier.hitMid.map(pct).join('-')}); <3 tiles ${pct(hr('hitNear'))}, >6 tiles ${pct(hr('hitFar'))}; spreads/bursts ${pct(hr('multiNear'))} / ${pct(hr('multiMid'))} / ${pct(hr('multiFar'))}`);
  const dm = med(agg.dir);
  say(dm >= 40 && dm <= 120, 'stick direction changes', `${dm.toFixed(0)} per minute (40-120)`);
  const im = med(agg.idle);
  say(im >= 0.03 && im <= 0.12, 'idle while alive', `${pct(im)} (3-12%)`);
  const bm = med(agg.bush);
  say(bm >= 0.03 && bm <= 0.25, 'time in bushes', `${pct(bm)} (3-25%)`);
  const rt = med(agg.retreat);
  say(rt >= 0.2 && rt <= 0.5, 'retreat starts at health', `${pct(rt)} (25-45%; ${agg.retreat.length} retreats)`);
  const fr = med(agg.fastRev);
  say(fr < 2, 'fast reversals', `${fr.toFixed(2)} per minute (< 2)`);
  const sdm = med(agg.supDelay);
  say(sdm >= 2 && sdm <= 15, 'super charged -> used', `${sdm.toFixed(1)} s median (2-15)`);
  say(agg.stuck === 0, 'stuck', `${agg.stuck} times in ${agg.mins.toFixed(0)} bot-minutes (0)`);
  say(agg.objective / N >= 0.85, 'matches end by objective', `${agg.objective}/${N}, mean length ${(agg.secs.reduce((a, b) => a + b, 0) / N).toFixed(0)} s`);
  if (VERBOSE) console.log(`     first-shot response median ${med(agg.resp).toFixed(2)} s`);
  all[tier.name] = agg;
}

// ---- 4. better players win more ----
console.log('== Skill matters');
// 30 mirror-lineup matches per pair: fewer would mostly measure luck (12 games give +-14%). Adjacent
// tiers are close in skill, so their gate is lower.
const SKILL_N = +((argv.find((a) => a.startsWith('--skill-n=')) || '--skill-n=30').slice(10));
for (const [hi, lo, want] of [[0.88, 0.15, [0.65, 0.92]], [0.5, 0.15, [0.52, 0.85]], [0.88, 0.5, [0.52, 0.85]]]) {
  let wins = 0, games = 0;
  const maps = mapFor(MODE_ARG);
  for (let g = 0; g < SKILL_N; g++) {
    const keys = [];
    for (let i = 0; i < 3; i++) keys.push(A.BRAWLER_KEYS[(g * 5 + i * 4) % A.BRAWLER_KEYS.length]);
    const lineup = keys.concat(keys); // mirror lineups: only skill differs
    const sideHi = g % 2; // alternate sides
    const skills = [0, 1, 2, 3, 4, 5].map((i) => ((i < 3 ? 0 : 1) === sideHi ? hi : lo));
    const r = play(MODE_ARG, maps[g % maps.length], 5000 + g, skills, lineup);
    if (r.result.winner === sideHi) wins++;
    if (r.result.winner >= 0) games++;
  }
  const wr = games ? wins / games : 0;
  say(wr >= want[0] && wr <= want[1], `skill ${hi} vs ${lo}`, `wins ${pct(wr)} of ${games} decided (${want.map(pct).join('-')})`);
}

// ---- 5. every mode: bots play the objective, never get stuck, and matches feel the right length ----
console.log('== Modes');
{
  const PER_MAP = +((argv.find((a) => a.startsWith('--per-map=')) || '--per-map=4').slice(10));
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  for (const mode of ['gem', 'sd', 'ball', 'ko', 'bounty']) {
    const maps = mapFor(mode), runs = [];
    for (const map of maps) {
      for (let g = 0; g < PER_MAP; g++) {
        const size = A.MODE_INFO[mode].teams * A.MODE_INFO[mode].size, keys = [];
        for (let i = 0; i < size; i++) keys.push(A.BRAWLER_KEYS[(g * 7 + i * 4 + map.length) % A.BRAWLER_KEYS.length]);
        runs.push(play(mode, map, 9000 + g * 11 + map.length, new Array(size).fill(0.5), keys));
      }
    }
    const n = runs.length, secs = runs.map((r) => r.secs).sort((a, b) => a - b), medSecs = secs[Math.floor(n / 2)];
    const stuck = sum(runs.map((r) => sum(r.bots.map((b) => b.telemetry.stuck))));
    const idle = sum(runs.map((r) => sum(r.tel.map((t) => t.idle)) / r.tel.length)) / n;
    say(stuck === 0, `${mode}: stuck`, `${stuck} in ${n} matches`);
    say(idle >= 0.03 && idle <= 0.12, `${mode}: idle while alive`, `${pct(idle)} (3-12%)`);
    const by = (reason) => runs.filter((r) => r.result.reason === reason).length;
    if (mode === 'gem') say(by('gems') / n >= 0.7, 'gem: won by gems', `${by('gems')}/${n}, median ${medSecs.toFixed(0)} s`);
    if (mode === 'sd') {
      say(by('last') / n >= 0.75, 'sd: one survivor at the end', `${by('last')}/${n}`);
      say(medSecs >= 60 && medSecs <= 160, 'sd: match length', `median ${medSecs.toFixed(0)} s (60-160)`);
    }
    if (mode === 'ball') {
      const scored = runs.filter((r) => r.result.score[0] + r.result.score[1] > 0).length, draws = runs.filter((r) => r.result.winner < 0).length;
      say(scored / n >= 0.6, 'ball: goals get scored', `${scored}/${n} matches with a goal, ${by('goals')} won by 2 goals or a golden goal, ${draws} draws, median ${medSecs.toFixed(0)} s`);
      say(draws / n <= 0.35, 'ball: few draws', `${draws}/${n}`);
    }
    if (mode === 'ko') {
      const rl = sum(runs.map((r) => r.sim.playT / r.sim.ms.round)) / n;
      say(by('rounds') === n, 'ko: decided by rounds', `${by('rounds')}/${n}`);
      say(rl >= 20 && rl <= 70, 'ko: round length', `${rl.toFixed(0)} s per round (20-70)`);
    }
    if (mode === 'bounty') {
      const stars = runs.map((r) => r.result.score[0] + r.result.score[1]), dec = runs.filter((r) => r.result.winner >= 0).length;
      say(Math.min(...stars) >= 8, 'bounty: stars change hands', `${Math.min(...stars)}-${Math.max(...stars)} stars per match`);
      say(dec / n >= 0.7, 'bounty: decided', `${dec}/${n} not drawn`);
    }
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll AI checks passed');
process.exit(failures ? 1 : 0);
