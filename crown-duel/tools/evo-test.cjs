// Evolutions in the battle sim: cycle counting and each evolved form's effect, plus AI-vs-AI battles with
// every evolution in play (no crashes, no stalemates).
// Usage: node crown-duel/tools/evo-test.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const jsDir = path.join(__dirname, '..', 'src', 'js');
const files = ['01-util.js', '02-cards.js', '03-sim.js', '04-ai.js'];
const code = files.map((f) => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n') +
  '\n;globalThis.__api = { Sim, AIPlayer, buildAIDeck, CARDS, CARD_KEYS, EVOS, EVO_KEYS, RNG, SIM_DT, LEVEL_MULT };';
const ctx = { console, Math, Set, Map, Object, Array, JSON, Number, String, Infinity, NaN, isFinite };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const { Sim, AIPlayer, buildAIDeck, CARDS, CARD_KEYS, EVOS, EVO_KEYS, RNG, SIM_DT, LEVEL_MULT } = ctx.__api;

let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; };
const lv = {};
for (const k of CARD_KEYS) lv[k] = 1;
const FILL = ['knight', 'archers', 'goblins', 'skeletons', 'giant', 'musketeer', 'arrows', 'fireball'];
// a sim where team 0 holds card `key` (evolved) and team 1 has nothing on the field
function mk(key, evos) {
  const deck = [key].concat(FILL.filter((k) => k !== key)).slice(0, 8);
  return new Sim({ decks: [deck, FILL], levels: [lv, lv], kings: [1, 1], seed: 5, evos: [evos || [key], []] });
}
const steps = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };
// plays `key` from slot 0 for team (forcing it into the hand with full elixir)
function play(sim, key, x, y, team) {
  team = team || 0;
  const p = sim.p[team];
  p.hand[0] = key;
  p.elixir = 10;
  return sim.play(team, 0, x, y);
}
const units = (sim, u, team) => sim.ents.filter((e) => !e.dead && e.u === u && (team == null || e.team === team));
const foe = (sim, u, x, y) => sim.spawnUnit(1, u, x, y, 1, 0);

// ---- cycles ----
{
  const sim = mk('knight');
  const s0 = sim.evoState(0, 'knight');
  play(sim, 'knight', 9, 24);
  const s1 = sim.evoState(0, 'knight'), e1 = units(sim, 'knight', 0).every((e) => !e.evo);
  play(sim, 'knight', 6, 24);
  const s2 = sim.evoState(0, 'knight'), ready = sim.evoReady(0, 'knight');
  play(sim, 'knight', 12, 24);
  const evolved = units(sim, 'knight', 0).filter((e) => e.evo).length;
  check(s0 === 0 && s1 === 1 && e1 && s2 === 2 && ready && evolved === 1 && sim.evoState(0, 'knight') === 0,
    `Knight evolves on the 3rd play (2 cycles), then the count restarts (${s0},${s1},${s2},${evolved})`);
  const other = mk('knight', []);
  for (let i = 0; i < 4; i++) play(other, 'knight', 9, 24);
  check(units(other, 'knight', 0).every((e) => !e.evo) && other.evoState(0, 'knight') === -1, 'without the evolution unlocked nothing evolves');
}
// evolve right away for each effect test
function evoUnit(key, x, y) {
  const sim = mk(key);
  sim.p[0].evoC[key] = EVOS[key].cycles;
  play(sim, key, x, y);
  return sim;
}

{ // Knight: 60% less damage while not swinging
  const sim = evoUnit('knight', 9, 24);
  steps(sim, 40);
  const k = units(sim, 'knight', 0)[0], hp = k.hp;
  sim.hurt(k, 100);
  check(hp - k.hp === 40, `evolved Knight takes 40 of 100 damage while walking (${hp - k.hp})`);
}
{ // Archers: range 6.5, power shot past 4 tiles
  const sim = evoUnit('archers', 9, 24);
  const a = units(sim, 'archer', 0);
  check(a.length === 2 && a.every((e) => e.evo && e.st.range === 6.5) && sim.p[0].evoC.archers === 0, `evolved Archers reach 6.5 tiles (${a.map((e) => e.st.range)})`);
  const base = CARDS.archers && a[0] ? a[0].st.dmg : 0;
  const t = foe(sim, 'knight', a[0].x, a[0].y - 5.5);
  check(sim.evoAttack(a[0], t, base) === base * 1.5, 'Power Shot: 50% more damage to a target 5 tiles away');
}
{ // Skeletons: every hit raises another, up to 8
  const sim = evoUnit('skeletons', 9, 20);
  steps(sim, 35);
  foe(sim, 'giant', 9, 19); // tanky target right in front
  steps(sim, 30 * 8);
  const sk = units(sim, 'skeleton', 0);
  check(sk.length > 3 && sk.length <= 8 && sk.every((e) => e.evo), `evolved Skeletons multiply on hits, at most 8 (${sk.length})`);
}
{ // Barbarians: +10% hp, rage on hit
  const sim = evoUnit('barbarians', 9, 20);
  const b = units(sim, 'barbarian', 0);
  check(b.length === 4 && b[0].maxHp === Math.round(460 * 1.1), `evolved Barbarians have 10% more hit points (${b[0] && b[0].maxHp})`);
  steps(sim, 35);
  foe(sim, 'giant', 9, 19);
  steps(sim, 60);
  check(b.some((e) => e.rageT > 0), 'evolved Barbarians rage after hitting');
}
{ // Bomber: bombs bounce twice
  const sim = evoUnit('bomber', 9, 22);
  steps(sim, 35);
  foe(sim, 'knight', 9, 18.5);
  let booms = 0;
  for (let i = 0; i < 30 * 3; i++) { sim.step(); booms += sim.events.filter((v) => v[0] === 'boom' && v[4] === 'bomb').length; sim.events.length = 0; }
  check(booms >= 3, `evolved Bomber's bomb blows up three times (${booms} bomb blasts in 3 s)`);
}
{ // Cannon: a blast when it lands
  const sim = mk('cannon');
  sim.p[0].evoC.cannon = 2;
  const g = foe(sim, 'goblin', 9, 21.5);
  g.deployT = 0;
  const hp = g.hp;
  play(sim, 'cannon', 9, 23);
  steps(sim, 35);
  check(g.dead || g.hp < hp, `evolved Cannon's landing blast hits nearby ground troops (${hp} -> ${g.hp})`);
}
{ // Zap: a second, wider bolt
  const sim = mk('zap', ['zap']);
  const deck = sim.p[0].deck;
  sim.p[0].evoC.zap = 2;
  const g1 = foe(sim, 'knight', 9, 10), g2 = foe(sim, 'knight', 12.2, 10);
  play(sim, 'zap', 9, 10);
  const h1 = g1.hp, h2 = g2.hp;
  steps(sim, 20);
  check(g1.hp < h1 && g2.hp < h2, `evolved Zap hits twice, the second bolt wider (${h1}->${g1.hp}, ${h2}->${g2.hp})`);
}
{ // Musketeer: 3 sniper rounds, then normal range
  const sim = evoUnit('musketeer', 9, 24);
  const m = units(sim, 'musketeer', 0)[0];
  check(m.st.range === 9 && m.ammo === 3, 'evolved Musketeer starts with 3 sniper rounds at range 9');
  const t = foe(sim, 'giant', 9, 20);
  const d = [sim.evoAttack(m, t, 100), sim.evoAttack(m, t, 100), sim.evoAttack(m, t, 100), sim.evoAttack(m, t, 100)];
  check(d.join(',') === '180,180,180,100' && m.st.range === 6, `sniper rounds deal 80% more, then her normal range comes back (${d}, range ${m.st.range})`);
}
{ // Shieldmaiden: whirlwind pulls ground troops in
  const sim = evoUnit('maiden', 9, 20);
  steps(sim, 35);
  const v = units(sim, 'maiden', 0)[0];
  const g = foe(sim, 'knight', v.x + 3, v.y);
  const d0 = Math.hypot(g.x - v.x, g.y - v.y);
  sim.whirl(v, 3.5, 0.9);
  check(Math.hypot(g.x - v.x, g.y - v.y) < d0 - 0.5, 'evolved Shieldmaiden pulls a nearby troop towards her');
}
{ // Juggernaut: heals on a kill
  const sim = evoUnit('juggernaut', 9, 20);
  steps(sim, 35);
  const j = units(sim, 'juggernaut', 0)[0];
  j.hp = Math.round(j.maxHp * 0.5);
  const hp = j.hp;
  foe(sim, 'goblin', j.x, j.y - 1.5);
  steps(sim, 30 * 3);
  check(j.hp >= hp + Math.round(j.maxHp * 0.25) - 200, `evolved Juggernaut heals 25% after a kill (${hp} -> ${j.hp} of ${j.maxHp})`);
}
{ // Frost Sprite: a second freeze
  const sim = evoUnit('sprite', 9, 20);
  steps(sim, 35);
  const g = foe(sim, 'giant', 9, 18.5);
  let fx = 0;
  for (let i = 0; i < 30 * 3; i++) { sim.step(); fx += sim.events.filter((v) => v[0] === 'frostfx').length; sim.events.length = 0; }
  check(fx >= 2, `evolved Frost Sprite bursts twice (${fx} bursts)`);
}
{ // Fire Mage: shield, shockwave when it breaks
  const sim = evoUnit('firemage', 9, 24);
  const w = units(sim, 'firemage', 0)[0];
  const g = foe(sim, 'knight', w.x + 1.5, w.y);
  const hp = w.hp, sh = w.shield, x0 = g.x;
  sim.hurt(w, sh - 10);
  const keep = w.hp === hp && w.shield === 10;
  sim.hurt(w, 50);
  check(sh === Math.round(w.maxHp * 0.4) && keep && w.shield === 0 && w.hp === hp - 40 && g.x > x0 + 1, `evolved Fire Mage's shield soaks damage, then breaks with a shockwave (${sh}, hp ${hp}->${w.hp}, knocked ${(g.x - x0).toFixed(2)})`);
}
{ // Necromancer: heals when her skeletons fall
  const sim = evoUnit('necro', 9, 24);
  steps(sim, 70);
  const n = units(sim, 'necro', 0)[0];
  n.hp -= 200;
  const hp = n.hp;
  const sk = units(sim, 'skeleton', 0);
  for (const s of sk) sim.kill(s);
  check(sk.length >= 1 && n.hp === Math.min(n.maxHp, hp + 60 * sk.length), `evolved Necromancer heals 60 per fallen skeleton (${sk.length} fell, ${hp} -> ${n.hp})`);
}

// ---- AI vs AI with every evolution in play ----
{
  let done = 0, w = [0, 0, 0], evoPlays = 0;
  for (let g = 0; g < 40; g++) {
    const rng = new RNG(500 + g);
    const decks = [buildAIDeck(7, rng), buildAIDeck(7, rng)];
    // put two evolvable cards first in each deck
    for (const d of decks) {
      const ev = EVO_KEYS.filter((k) => !d.includes(k)).slice(g % 5, g % 5 + 2);
      d.splice(0, 2, ...ev);
    }
    const lv5 = {};
    for (const k of CARD_KEYS) lv5[k] = 5;
    const sim = new Sim({ decks, levels: [lv5, lv5], kings: [5, 5], seed: 900 + g, evos: [decks[0].slice(0, 2), decks[1].slice(0, 2)] });
    const ai = [new AIPlayer(sim, 0, 0.7, g * 3 + 1), new AIPlayer(sim, 1, 0.7, g * 3 + 2)];
    let n = 0;
    while (!sim.over && n < 30 * 400) {
      ai[0].update(SIM_DT); ai[1].update(SIM_DT); sim.step(); n++;
      for (const v of sim.events) if (v[0] === 'play' && v[5]) evoPlays++;
      sim.events.length = 0;
      for (const e of sim.ents) if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp == null ? 0 : e.hp)) throw new Error('bad number on ' + (e.u || e.kind));
    }
    if (sim.over) done++;
    w[sim.winner < 0 ? 2 : sim.winner]++;
  }
  check(done === 40 && evoPlays > 40, `40 AI battles with evolutions finish (${done}), ${evoPlays} evolved plays, wins ${w[0]}/${w[1]} draws ${w[2]}`);
}

console.log(fails ? `FAILED: ${fails}` : 'evolution tests passed');
process.exit(fails ? 1 : 0);
