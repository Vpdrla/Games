// Headless AI-vs-AI battles to check the simulation for crashes, stalemates and card balance.
// Usage: node crown-duel/tools/sim-test.cjs [games=200] [--verbose]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const jsDir = path.join(__dirname, '..', 'src', 'js');
const files = ['01-util.js', '02-cards.js', '03-sim.js', '04-ai.js'];
const code = files.map((f) => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n') +
  '\n;globalThis.__api = { Sim, AIPlayer, buildAIDeck, CARDS, CARD_KEYS, ARENAS, RNG, SIM_DT, REG_TIME, OT_TIME };';
const ctx = { console, Math, Set, Map, Object, Array, JSON, Number, String, Infinity, NaN, isFinite };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const { Sim, AIPlayer, buildAIDeck, CARDS, CARD_KEYS, RNG, SIM_DT } = ctx.__api;

const games = parseInt(process.argv[2] || '200', 10);
const verbose = process.argv.includes('--verbose');
const cardStats = {};
for (const k of CARD_KEYS) cardStats[k] = { games: 0, wins: 0, plays: 0 };
const results = { 0: 0, 1: 0, draw: 0 };
const reasons = {};
let totalTime = 0, maxEnts = 0, crowns = 0;
const t0 = Date.now();

for (let g = 0; g < games; g++) {
  const rng = new RNG(1000 + g);
  const decks = [buildAIDeck(7, rng), buildAIDeck(7, rng)];
  const lv = {};
  for (const k of CARD_KEYS) lv[k] = 5;
  const sim = new Sim({ decks, levels: [lv, lv], kings: [5, 5], seed: 77 + g });
  const skills = [0.5 + rng.next() * 0.5, 0.5 + rng.next() * 0.5];
  const ai = [new AIPlayer(sim, 0, skills[0], g * 3 + 1), new AIPlayer(sim, 1, skills[1], g * 3 + 2)];
  let steps = 0;
  while (!sim.over && steps < 30 * 400) {
    ai[0].update(SIM_DT);
    ai[1].update(SIM_DT);
    sim.step();
    for (const ev of sim.events) {
      if (ev[0] === 'play') cardStats[ev[2]].plays++;
    }
    sim.events.length = 0;
    maxEnts = Math.max(maxEnts, sim.ents.length);
    steps++;
    for (const e of sim.ents) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) throw new Error('NaN position on ' + (e.u || e.kind) + ' in game ' + g);
    }
  }
  if (!sim.over) throw new Error('game ' + g + ' did not finish');
  totalTime += sim.t;
  crowns += sim.p[0].crowns + sim.p[1].crowns;
  reasons[sim.endReason] = (reasons[sim.endReason] || 0) + 1;
  if (sim.winner === -1) results.draw++; else results[sim.winner]++;
  for (const team of [0, 1]) {
    for (const k of decks[team]) {
      cardStats[k].games++;
      if (sim.winner === team) cardStats[k].wins++;
    }
  }
  if (verbose) console.log(`game ${g}: winner ${sim.winner} (${sim.endReason}) crowns ${sim.p[0].crowns}-${sim.p[1].crowns} t=${sim.t.toFixed(0)}s skills ${skills.map((s) => s.toFixed(2))} decks ${decks[0].join(',')} | ${decks[1].join(',')}`);
}

console.log(`${games} games in ${((Date.now() - t0) / 1000).toFixed(1)}s. team0 ${results[0]}, team1 ${results[1]}, draws ${results.draw}`);
console.log('end reasons', JSON.stringify(reasons), 'avg length', (totalTime / games).toFixed(0) + 's', 'avg crowns', (crowns / games).toFixed(2), 'max entities', maxEnts);
const rows = CARD_KEYS.filter((k) => cardStats[k].games).map((k) => [k, cardStats[k].games, (cardStats[k].wins / cardStats[k].games * 100).toFixed(0) + '%', (cardStats[k].plays / cardStats[k].games).toFixed(1)]);
rows.sort((a, b) => parseFloat(b[2]) - parseFloat(a[2]));
for (const r of rows) console.log(r[0].padEnd(12), String(r[1]).padStart(4), 'games', r[2].padStart(4), 'win', r[3].padStart(5), 'plays/game');
