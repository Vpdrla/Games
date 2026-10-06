// Headless runs driven by the autopilot: checks the simulation for crashes, NaN and runaway
// entity counts, and prints balance numbers (survival time, level curve, weapon damage).
// Usage: node dawnkeeper/tools/sim-test.cjs [runs-per-stage=4] [--power=0|max] [--stage=N] [--char=key] [--quick] [--verbose]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const jsDir = path.join(__dirname, '..', 'src', 'js');
const files = ['01-util.js', '02-data.js', '04-grid.js', '05-run.js', '06-weapons.js', '07-enemies.js', '08-bot.js'];
const code = files.map((f) => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n') +
  '\n;globalThis.__api = { Run, Bot, STAGES, CHARACTERS, CHAR_KEYS, BASE_WEAPONS, POWERUPS, POWERUP_KEYS, WEAPONS, SIM_DT, ENEMY_CAP };';
const ctx = { console, Math, Set, Map, Object, Array, JSON, Number, String, Infinity, NaN, isFinite, Int32Array, Float32Array };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const { Run, Bot, STAGES, CHAR_KEYS, BASE_WEAPONS, POWERUPS, POWERUP_KEYS, SIM_DT, ENEMY_CAP } = ctx.__api;

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const per = parseInt(args.find((a) => /^\d+$/.test(a)) || '4', 10);
const verbose = args.includes('--verbose');
const quick = args.includes('--quick');
const powerMode = opt('power', '0');
const onlyStage = opt('stage', null);
const onlyChar = opt('char', null);
const power = {};
if (powerMode === 'max') for (const k of POWERUP_KEYS) power[k] = POWERUPS[k].max;
else if (powerMode === 'mid') for (const k of POWERUP_KEYS) power[k] = Math.ceil(POWERUPS[k].max / 2);

const results = [];
let failures = 0;
const t0 = Date.now();
let steps = 0;

for (let s = 0; s < STAGES.length; s++) {
  if (onlyStage != null && +onlyStage !== s) continue;
  for (let i = 0; i < per; i++) {
    const char = onlyChar || CHAR_KEYS[(i + s) % CHAR_KEYS.length];
    const run = new Run({ stage: s, char, seed: 1000 + s * 100 + i, power, weapons: BASE_WEAPONS, mode: quick ? 'quick' : 'normal', viewW: 350, viewH: 760 });
    const bot = new Bot(run, 1);
    const levelAt = {};
    let maxEnemies = 0, maxProj = 0, err = null;
    const limit = (quick ? 7 : 17) * 60 / SIM_DT;
    try {
      for (let k = 0; k < limit && !run.over; k++) {
        bot.update(SIM_DT);
        run.step();
        steps++;
        while (run.pendingLevels > 0) run.applyChoice(bot.choose(run.rollChoices()));
        while (run.chests.length) run.openChest(run.chests.shift());
        run.events.length = 0;
        maxEnemies = Math.max(maxEnemies, run.enemies.length);
        maxProj = Math.max(maxProj, run.projs.length + run.eprojs.length);
        const m = Math.floor(run.time / 60);
        if (!(m in levelAt)) levelAt[m] = run.level;
        if (k % 600 === 0) {
          const p = run.player;
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp)) throw new Error('player NaN');
          for (const e of run.enemies) if (!Number.isFinite(e.x) || !Number.isFinite(e.hp)) throw new Error('enemy NaN ' + e.type);
        }
      }
    } catch (e) {
      err = e;
      failures++;
    }
    const top = Object.entries(run.dmgBy).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ':' + Math.round(v / 1000) + 'k');
    const r = {
      stage: STAGES[s].key, char, time: run.time, won: run.won, level: run.level, kills: run.kills, maxEnemies, maxProj,
      weapons: run.weapons.map((w) => w.key + w.lvl).join(' '), top: top.join(' '), levelAt, err,
    };
    results.push(r);
    const mm = Math.floor(r.time / 60), ss = Math.floor(r.time % 60);
    console.log(`${r.stage.padEnd(9)} ${char.padEnd(6)} ${r.won ? 'WIN ' : 'dead'} ${mm}:${String(ss).padStart(2, '0')} lv${String(r.level).padEnd(3)} kills ${String(r.kills).padEnd(6)} maxE ${maxEnemies} maxP ${maxProj} | ${r.weapons} | ${r.top}${err ? '\n  ERROR ' + err.stack : ''}`);
    if (verbose) console.log('  level by minute', JSON.stringify(levelAt), 'gems left', run.gemCount, 'hp', Math.round(run.player.hp) + '/' + run.stats.maxHp, 'hurt', JSON.stringify(Object.fromEntries(Object.entries(run.hurtBy).map(([k, v]) => [k, Math.round(v)]))));
  }
}

const secs = (Date.now() - t0) / 1000;
console.log(`\n${results.length} runs, ${failures} errors, ${(steps / secs).toFixed(0)} steps/s (${(steps / secs / 60).toFixed(1)}x realtime)`);
const byStage = {};
for (const r of results) {
  const b = byStage[r.stage] || (byStage[r.stage] = { n: 0, wins: 0, time: 0, lv: 0 });
  b.n++; b.wins += r.won ? 1 : 0; b.time += r.time; b.lv += r.level;
}
for (const [k, b] of Object.entries(byStage)) console.log(`${k.padEnd(9)} win ${b.wins}/${b.n}  avg time ${(b.time / b.n / 60).toFixed(1)} min  avg level ${(b.lv / b.n).toFixed(0)}`);
if (results.some((r) => r.maxEnemies > ENEMY_CAP + 120)) { console.log('FAIL: enemy cap exceeded'); failures++; }
process.exit(failures ? 1 : 0);
