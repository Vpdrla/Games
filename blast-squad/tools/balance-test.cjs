#!/usr/bin/env node
'use strict';
// Balance test: plays N headless bot matches (default 2000) spread evenly over every mode and map,
// with random lineups from all 15 brawlers (no duplicate within a team; Showdown: 10 distinct),
// mid-skill bots (0.35-0.65 each) with random traits, power 9, gadget 0, star 0. One worker thread
// per core; each worker loads the modules itself through load.cjs.
// The brawlers copy the original game's numbers, which aren't tuned for bots: per-brawler win rates
// are reported, and gated only as a sanity check that no kit is broken.
// Gates (exit 1 on failure). The statistical ones fail only when the whole 95% CI is outside the band:
//   - 3v3 win rate per brawler (decided matches) 25-85%
//   - Showdown wins per brawler 0.1x-5x of the fair share (1 in 10)
//   - side bias per 3v3 mode: team 0 wins 48-52% of decided matches
//   - >= 85% of matches end by the objective (gem 'gems' or the 3:30 clock with a gem leader, ball
//     'goals', ko 'rounds', bounty 'stars', sd 'last')
//   - no NaN, no stuck bots (Bot telemetry.stuck), no exceptions
//   - speed >= 500x real time per core (sim + bots)
// Usage: node tools/balance-test.cjs [N=2000] [--quick] [--seed=1] [--workers=4] [--modes=gem,sd,...]
//          [--json=file] (per-match results, for digging into a number) [--ctx] (see fastGlobals)
const os = require('node:os');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const MODES_ALL = ['gem', 'sd', 'ball', 'ko', 'bounty'];
const OBJECTIVE = { gem: 'gems', sd: 'last', ball: 'goals', ko: 'rounds', bounty: 'stars' };
const MAX_T = 600; // s: every mode ends long before this (gem/sd caps 300, ko 5 rounds of 120)

// load.cjs runs the bundle in a contextified vm global: every global lookup (Math, top-level
// functions) goes through an interceptor V8 can't cache, and bots run ~2.5x slower than in a page.
// So workers ask vm for an ordinary global instead (Node >= 22.8) and copy load.cjs's sandbox onto it:
// same names, same Math.random / Date / performance traps. --ctx keeps the contextified global.
function fastGlobals(vm) {
  const NO_CTX = vm.constants && vm.constants.DONT_CONTEXTIFY;
  if (!NO_CTX) return false;
  const real = new WeakMap(), create = vm.createContext, run = vm.runInContext;
  vm.createContext = function (sandbox, opts) {
    if (!sandbox || typeof sandbox !== 'object' || opts) return create.call(vm, sandbox, opts);
    const g = create.call(vm, NO_CTX);
    for (const k of Object.keys(sandbox)) {
      const d = Object.getOwnPropertyDescriptor(g, k);
      if (!d || d.writable || d.set) g[k] = sandbox[k]; // Infinity, NaN: read-only and the same
    }
    real.set(sandbox, g);
    return sandbox;
  };
  vm.runInContext = function (code, sandbox, opts) {
    const g = real.get(sandbox);
    if (!g) return run.call(vm, code, sandbox, opts);
    const r = run.call(vm, code, g, opts);
    sandbox.__api = g.__api;
    return r;
  };
  return true;
}

// ================================================================ worker: plays matches
function workerMain() {
  const fast = !workerData.ctx && fastGlobals(require('node:vm'));
  const { load } = require('./load.cjs');
  const A = load({ names: ['Sim', 'Bot', 'rand'] });
  let guarded = false;
  try { A.rand(0, 1); } catch (e) { guarded = true; }
  if (!guarded) throw new Error('determinism guard is off: Math.random works inside the modules');
  const fin = Number.isFinite;

  // First NaN/Infinity found in the world, or null. Brawlers every tick, other entities when `all`.
  function nanCheck(sim, all) {
    for (const b of sim.brawlers) {
      if (!fin(b.x) || !fin(b.y) || !fin(b.hp) || !fin(b.maxHp) || !fin(b.ammo) || !fin(b.sup)) return `brawler ${b.slot} (${b.bk}) x=${b.x} y=${b.y} hp=${b.hp} ammo=${b.ammo} sup=${b.sup}`;
    }
    if (!all) return null;
    for (const s of sim.shots) if (!fin(s.x) || !fin(s.y) || !fin(s.dmg)) return `shot ${s.pk} x=${s.x} y=${s.y} dmg=${s.dmg}`;
    for (const a of sim.areas) if (!fin(a.x) || !fin(a.y) || !fin(a.dmg) || !fin(a.heal)) return `area ${a.ak} x=${a.x} y=${a.y}`;
    for (const d of sim.deploys) if (!fin(d.x) || !fin(d.y) || !fin(d.hp)) return `deploy ${d.dk} x=${d.x} y=${d.y} hp=${d.hp}`;
    for (const p of sim.pickups) if (!fin(p.x) || !fin(p.y)) return `pickup ${p.pick} x=${p.x} y=${p.y}`;
    const o = sim.ball;
    if (o && (!fin(o.x) || !fin(o.y) || !fin(o.z))) return `ball x=${o.x} y=${o.y} z=${o.z}`;
    return null;
  }

  // One match, driven like Match does offline (pins included). Returns a compact result.
  function play(job) {
    const t0 = process.hrtime.bigint();
    const out = { i: job.i, mode: job.mode, map: job.map, seed: job.seed, err: null, nan: null, stuck: [], secs: 0, ms: 0 };
    try {
      const sim = new A.Sim({ mode: job.mode, map: job.map, seed: job.seed, slots: job.slots });
      sim.pins = [];
      const n = job.slots.length;
      const bots = job.slots.map((s, i) => new A.Bot(i, job.profiles[i], (job.seed ^ Math.imul(i, 0x9e3779b1)) >>> 0));
      while (!sim.over && sim.t < MAX_T) {
        for (let k = 0; k < n; k++) {
          const b = bots[k];
          sim.setInput(k, b.tick(sim));
          if (b.outPin != null) { sim.pins.push({ slot: k, id: b.outPin, t: sim.t }); b.outPin = null; }
          b.outEmote = null;
        }
        sim.step();
        if (sim.pins.length && sim.t - sim.pins[0].t > 4) sim.pins.shift();
        sim.events.length = 0;
        const bad = nanCheck(sim, sim.tick % 10 === 0);
        if (bad) { out.nan = `t=${sim.t.toFixed(2)} ${bad}`; break; }
      }
      out.secs = sim.t;
      bots.forEach((b, k) => { const s = b.telemetry.stuck; if (s) out.stuck.push([k, job.slots[k].bk, s]); });
      if (!out.nan) {
        if (!sim.over) throw new Error(`no result after ${MAX_T} s`);
        const r = sim.result;
        out.winner = r.winner;
        out.reason = r.reason;
        out.score = r.score;
        out.rank = job.mode === 'sd' ? r.rank : null;
        // per slot: damage to brawlers, kills, deaths, healing, damage by attack / super / gadget
        out.st = r.stats.map((s, k) => [s.dmg, s.kills, s.deaths, s.heal, sim.dmgBy[k * 4 + 1], sim.dmgBy[k * 4 + 2], sim.dmgBy[k * 4 + 3]]);
        for (const row of out.st) if (!row.every(fin)) out.nan = 'result stats ' + JSON.stringify(out.st);
        if (!out.score.every(fin)) out.nan = 'result score ' + JSON.stringify(out.score);
      }
    } catch (e) {
      out.err = String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
    }
    out.ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return out;
  }

  parentPort.on('message', (msg) => {
    if (msg.type === 'jobs') parentPort.postMessage({ type: 'results', results: msg.jobs.map(play) });
  });
  parentPort.postMessage({ type: 'ready', fast });
}

// ================================================================ main: jobs, workers, report
function mainThread() {
  const { load } = require('./load.cjs');
  const A = load({ upTo: '04-maps.js', names: ['RNG', 'BRAWLER_KEYS', 'MAPS', 'MODE_INFO'] });
  const KEYS = A.BRAWLER_KEYS;
  const argv = process.argv.slice(2);
  const opt = (name, def) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };
  const N = argv.includes('--quick') ? 300 : +(argv.find((a) => /^\d+$/.test(a)) || 2000);
  const SEED = +opt('seed', 1);
  const W = Math.max(1, Math.min(+opt('workers', (os.availableParallelism ? os.availableParallelism() : os.cpus().length)), 64));
  const MODES = opt('modes', MODES_ALL.join(',')).split(',').filter((m) => MODES_ALL.includes(m));
  const JSON_OUT = opt('json', null);
  const CTX = argv.includes('--ctx');
  const mapsFor = (mode) => Object.keys(A.MAPS).filter((k) => A.MAPS[k].modes.includes(mode));

  // ---- jobs: modes round-robin, maps round-robin within a mode, random lineups, bots and seeds
  const rng = new A.RNG((SEED * 0x9e3779b1) >>> 0 || 1);
  const pickN = (n) => rng.shuffle(KEYS.slice()).slice(0, n);
  const jobs = [];
  for (let i = 0; i < N; i++) {
    const mode = MODES[i % MODES.length], maps = mapsFor(mode);
    const map = maps[Math.floor(i / MODES.length) % maps.length];
    const sd = mode === 'sd', size = A.MODE_INFO[mode].teams * A.MODE_INFO[mode].size;
    const keys = sd ? pickN(size) : pickN(3).concat(pickN(3));
    const slots = keys.map((bk, s) => ({ team: sd ? s : s < 3 ? 0 : 1, bk, lvl: 9, gadget: 0, star: 0 }));
    const profiles = keys.map(() => ({
      skill: 0.35 + rng.next() * 0.3,
      traits: { aggr: rng.next(), patience: rng.next(), greed: rng.next(), teamwork: 0.35 + rng.next() * 0.65, tilt: rng.next() },
    }));
    jobs.push({ i, mode, map, seed: rng.int(1, 0x7fffffff), slots, profiles });
  }

  console.log(`Blast Squad balance test: ${N} matches over ${MODES.join('/')} (${MODES.map((m) => mapsFor(m).length).reduce((a, b) => a + b, 0)} maps), ${W} workers, seed ${SEED}`);
  console.log('  bots: skill 0.35-0.65, random traits; every brawler at power 9, gadget 0, star 0');

  const results = new Array(N);
  let next = 0, done = 0, fastAll = true;
  const t0 = Date.now();
  const BATCH = 2;
  const progress = process.stderr.isTTY;
  let alive = Math.min(W, N);
  for (let w = 0; w < alive; w++) {
    const wk = new Worker(__filename, { workerData: { ctx: CTX } });
    const feed = () => {
      if (next >= N) { wk.terminate(); return; }
      const batch = jobs.slice(next, next + BATCH);
      next += batch.length;
      wk.postMessage({ type: 'jobs', jobs: batch });
    };
    wk.on('message', (msg) => {
      if (msg.type === 'ready') { if (!msg.fast) fastAll = false; feed(); return; }
      for (const r of msg.results) { results[r.i] = r; done++; }
      if (progress) process.stderr.write(`\r  ${done}/${N} matches, ${((Date.now() - t0) / 1000).toFixed(0)} s `);
      feed();
    });
    wk.on('error', (e) => { console.error('worker crashed:', e); process.exit(2); });
    wk.on('exit', () => { if (--alive === 0) report(); });
  }
  if (N === 0) report();

  function report() {
    if (progress) process.stderr.write('\r' + ' '.repeat(40) + '\r');
    const wall = (Date.now() - t0) / 1000;
    if (results.some((r) => !r)) { console.log('  FAIL: some matches never came back'); process.exit(1); }
    if (JSON_OUT) require('node:fs').writeFileSync(JSON_OUT, JSON.stringify({ seed: SEED, jobs, results }));
    const gates = [];
    const gate = (ok, name, detail) => { gates.push({ ok, name, detail }); return ok; };
    const pct = (x, d) => (Number.isFinite(x) ? (x * 100).toFixed(d == null ? 1 : d) : '-');
    const pad = (s, n) => String(s).padStart(n);
    const ok = results.filter((r) => !r.err && !r.nan);
    const lineup = (r) => jobs[r.i].slots.map((s) => s.bk);

    // ---- per brawler: 3v3 win rate (mirror appearances left out: they are 50% by construction)
    const B = {};
    for (const k of KEYS) B[k] = { n: 0, w: 0, draws: 0, mode: {}, sdN: 0, sdW: 0, sdPlace: 0, games: 0, kills: 0, deaths: 0, dmg: 0, heal: 0, dA: 0, dS: 0, dG: 0, secs: 0 };
    for (const r of ok) {
      const keys = lineup(r);
      if (r.mode === 'sd') {
        r.rank.forEach((slot, place) => { const b = B[keys[slot]]; b.sdN++; b.sdPlace += place + 1; if (place === 0) b.sdW++; });
        continue;
      }
      const t0k = keys.slice(0, 3), t1k = keys.slice(3);
      keys.forEach((bk, s) => {
        const b = B[bk], st = r.st[s];
        b.games++; b.dmg += st[0]; b.kills += st[1]; b.deaths += st[2]; b.heal += st[3]; b.dA += st[4]; b.dS += st[5]; b.dG += st[6]; b.secs += r.secs;
        const team = s < 3 ? 0 : 1;
        if ((team ? t0k : t1k).includes(bk)) return; // on both sides
        const m = b.mode[r.mode] || (b.mode[r.mode] = { n: 0, w: 0 });
        if (r.winner < 0) { b.draws++; return; }
        b.n++; m.n++;
        if (r.winner === team) { b.w++; m.w++; }
      });
    }
    const M3 = MODES.filter((m) => m !== 'sd');
    console.log('\n== Per brawler (the original\'s numbers). 3v3: win rate of decided matches (mirror appearances left out),');
    console.log('   sanity gate 25-85%; Showdown: mean place and wins vs the fair 1 in 10, gate 0.1x-5x. Both fail only when the 95% CI is outside.');
    console.log('  brawler   3v3 n   win%  95% CI           ' + M3.map((m) => pad(m, 7)).join('') + '  |  SD n  place  wins  x fair  95% CI');
    const verdict = (ci, x, lo, hi) => (ci[1] < lo || ci[0] > hi ? 'FAIL' : x < lo || x > hi ? '~' : 'ok');
    const failB = [], failS = [];
    for (const k of KEYS) {
      const b = B[k];
      let line = '  ' + k.padEnd(9);
      if (M3.length) {
        const x = b.w / b.n, ci = wilson(b.w, b.n), v = b.n ? verdict(ci, x, 0.25, 0.85) : '-';
        if (v === 'FAIL') failB.push(`${k} ${pct(x)}% (${pct(ci[0])}-${pct(ci[1])})`);
        line += pad(b.n, 6) + pad(pct(x), 7) + `  ${pct(ci[0])}-${pct(ci[1])}`.padEnd(13) + (v).padEnd(5) + M3.map((m) => pad(b.mode[m] ? pct(b.mode[m].w / b.mode[m].n, 0) : '-', 7)).join('');
      }
      if (MODES.includes('sd')) {
        const x = b.sdW / b.sdN, ci = wilson(b.sdW, b.sdN), v = b.sdN ? verdict(ci, x, 0.01, 0.5) : '-';
        if (v === 'FAIL') failS.push(`${k} ${(x * 10).toFixed(2)}x (${(ci[0] * 10).toFixed(2)}-${(ci[1] * 10).toFixed(2)})`);
        line += '  | ' + pad(b.sdN, 5) + pad((b.sdPlace / b.sdN).toFixed(1), 7) + pad(b.sdW, 6) + pad((x * 10).toFixed(2), 8) + `  ${(ci[0] * 10).toFixed(2)}-${(ci[1] * 10).toFixed(2)}`.padEnd(13) + v;
      }
      console.log(line);
    }
    if (M3.length) gate(!failB.length, '3v3 win rate per brawler 25-85% (no broken kit)', failB.length ? failB.join(', ') : `all ${KEYS.length} inside (CI-aware)`);
    if (MODES.includes('sd')) gate(!failS.length, 'Showdown wins per brawler 0.1x-5x fair (no broken kit)', failS.length ? failS.join(', ') : `all ${KEYS.length} inside (CI-aware)`);

    // ---- what each brawler does in 3v3 (info)
    if (M3.length) {
      console.log('\n== Per brawler in 3v3, per match (info): kills, deaths, damage to brawlers (k), healing (k), damage by attack/super/gadget');
      console.log('  brawler   kills deaths   dmg   heal   atk/sup/gad    draws');
      for (const k of KEYS) {
        const b = B[k], g = Math.max(1, b.games), d = Math.max(1, b.dA + b.dS + b.dG);
        console.log('  ' + k.padEnd(9) + pad((b.kills / g).toFixed(1), 6) + pad((b.deaths / g).toFixed(1), 7) + pad((b.dmg / g / 1000).toFixed(1), 6) + pad((b.heal / g / 1000).toFixed(1), 7) +
          `   ${pct(b.dA / d, 0)}/${pct(b.dS / d, 0)}/${pct(b.dG / d, 0)}`.padEnd(14) + pad(b.draws, 6));
      }
    }

    // ---- modes: side bias, how matches end
    console.log('\n== Modes: side bias (team 0 share of decided matches, gate 48-52%, CI-aware) and how matches end');
    let objN = 0, objAll = 0;
    const sideFail = [];
    for (const mode of MODES) {
      const rs = ok.filter((r) => r.mode === mode);
      const reasons = {};
      for (const r of rs) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      // a Gem Rush clock running out with one team holding more gems is decided by gems too
      const obj = (reasons[OBJECTIVE[mode]] || 0) + (mode === 'gem' ? rs.filter((r) => r.reason === 'time' && r.winner >= 0).length : 0);
      objN += obj; objAll += rs.length;
      const secs = rs.map((r) => r.secs).sort((a, b) => a - b), medS = secs.length ? secs[Math.floor(secs.length / 2)] : 0;
      let side = '';
      if (mode !== 'sd') {
        const dec = rs.filter((r) => r.winner >= 0), w0 = dec.filter((r) => r.winner === 0).length, ci = wilson(w0, dec.length);
        const v = dec.length ? verdict(ci, w0 / dec.length, 0.48, 0.52) : '-';
        if (v === 'FAIL') sideFail.push(`${mode} ${pct(w0 / dec.length)}% (${pct(ci[0])}-${pct(ci[1])})`);
        side = `team 0 ${pct(w0 / dec.length)}% (${pct(ci[0])}-${pct(ci[1])}) ${v}, draws ${rs.length - dec.length};`;
      }
      const ends = Object.keys(reasons).sort().map((k) => `${k} ${pct(reasons[k] / rs.length, 0)}%`).join(' ');
      console.log(`  ${mode.padEnd(7)} ${pad(rs.length, 5)} matches, ${side} ends: ${ends}; median ${medS.toFixed(0)} s`);
    }
    if (M3.length) gate(!sideFail.length, 'side bias 48-52%', sideFail.length ? sideFail.join(', ') : 'no side wins more than chance allows');
    gate(objAll > 0 && objN / objAll >= 0.85, 'matches end by the objective >= 85%', `${objN}/${objAll} = ${pct(objN / objAll)}%`);

    // ---- health
    const errs = results.filter((r) => r.err), nans = results.filter((r) => r.nan);
    const stuck = results.filter((r) => r.stuck.length);
    const desc = (r) => `#${r.i} ${r.mode}/${r.map} seed ${r.seed} [${lineup(r).join(',')}]`;
    console.log('\n== Health');
    for (const r of errs.slice(0, 5)) console.log(`  exception in ${desc(r)}: ${r.err}`);
    for (const r of nans.slice(0, 5)) console.log(`  NaN in ${desc(r)}: ${r.nan}`);
    for (const r of stuck.slice(0, 8)) console.log(`  stuck in ${desc(r)}: ${r.stuck.map(([s, bk, n]) => `slot ${s} ${bk} x${n}`).join(', ')}`);
    gate(!errs.length, 'no exceptions', `${errs.length} of ${N} matches`);
    gate(!nans.length, 'no NaN', `${nans.length} of ${N} matches (brawlers every tick, everything else every 10 ticks, results)`);
    const stuckN = stuck.reduce((a, r) => a + r.stuck.reduce((x, s) => x + s[2], 0), 0);
    const botMin = results.reduce((a, r) => a + r.secs * jobs[r.i].slots.length, 0) / 60;
    gate(stuckN === 0, 'no stuck bots', `${stuckN} in ${botMin.toFixed(0)} bot-minutes (${stuck.length} matches)`);

    // ---- speed: game time per second of worker time (one worker = one core)
    const gameS = results.reduce((a, r) => a + r.secs, 0), busy = results.reduce((a, r) => a + r.ms, 0) / 1000;
    const per = MODES.map((m) => { const rs = results.filter((r) => r.mode === m); return `${m} ${(rs.reduce((a, r) => a + r.secs, 0) / Math.max(1e-9, rs.reduce((a, r) => a + r.ms, 0) / 1000)).toFixed(0)}x`; }).join(', ');
    console.log('\n== Speed');
    console.log(`  ${(gameS / 3600).toFixed(1)} h of play in ${wall.toFixed(0)} s wall on ${W} workers (${fastAll && !CTX ? 'plain' : 'contextified'} vm globals); per core: ${per}`);
    gate(gameS / busy >= 500, 'speed >= 500x real time per core', `${(gameS / busy).toFixed(0)}x (sim + bots)`);

    console.log('\n== Gates');
    for (const g of gates) console.log(`  ${g.ok ? 'PASS' : 'FAIL'}  ${g.name}: ${g.detail}`);
    const bad = gates.filter((g) => !g.ok).length;
    console.log(bad ? `\n${bad} gate(s) FAILED (${wall.toFixed(0)} s)` : `\nAll balance gates passed (${wall.toFixed(0)} s)`);
    process.exit(bad ? 1 : 0);
  }
}

// Wilson score interval for k successes in n trials (95%).
function wilson(k, n) {
  if (!n) return [0, 1];
  const z = 1.96, z2 = z * z, p = k / n, den = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / den, h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

if (isMainThread) mainThread();
else workerMain();
