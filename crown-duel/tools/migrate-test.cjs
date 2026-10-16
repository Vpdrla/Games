'use strict';
// Save migration test: plays careers on the pre-change code (the last v1 commit by default) to make real v1 saves, loads
// each one into today's code and checks migrateV2 (spec.saveMigration): nothing reset or lowered, the Crown
// Road back-paid exactly once up to best, waiting chests queued, a second load pays nothing. Then the career
// keeps going on the new code and must get past the old wall (A8 within 120 battles for 300-battle saves).
// Usage: node crown-duel/tools/migrate-test.cjs [v1Battles=300] [seeds=1,2,3,4] [after=120] [--rev=<git rev>] [--policy=attentive|lazy]
//          [--save-dir=<dir>]
//   --policy=lazy leaves more chests locked and the slots full at the moment of the update (the A8 pace check
//     then becomes 'past the old wall')
//   --save-dir writes each v1 save as <dir>/v1-seed<N>.json for career-sim.cjs --migrate-from
// Uses career-sim.cjs (same bot, one child process per career). About 2 min for the defaults on 4 CPUs.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');
const { loadSources, makeWorld, makeCareer, giftSummary } = require('./career-sim.cjs');

const SKILL = 0.55;
const WALL = 2100; // under the old rules careers stalled at 1,800-2,100 trophies

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The last commit with v1 saves: the parent of the commit that added migrateV2 (HEAD while it is uncommitted).
function preV2Rev() {
  try {
    const intro = execFileSync('git', ['log', '-1', '--format=%H', '-S', 'function migrateV2', '--', 'crown-duel/src/js/09-save.js'],
      { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }).trim();
    return intro ? intro + '^' : 'HEAD';
  } catch (e) { return 'HEAD'; }
}
const noGift = (sv) => JSON.stringify(sv, (k, v) => (k === 'pendingGift' ? undefined : v));

function runOne(job) {
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || '' });
  const oldCode = loadSources(job.rev);
  if (/function migrateV2/.test(oldCode)) throw new Error(`${job.rev} already has migrateV2; pass --rev=<a commit before the v2 economy>`);
  const newCode = loadSources('');
  const total = job.v1Battles + job.after;
  const c = makeCareer({ skill: SKILL, seed: job.seed, battles: total, sched: 'spec', hc: 0, policy: job.policy });

  // 1. a real v1 career
  const w1 = makeWorld(oldCode, job.seed);
  w1.A.loadGame();
  c.attach(w1);
  c.play(job.v1Battles);
  const raw = JSON.stringify(w1.A.getSave()); // what v1 saveGame writes
  const v1 = JSON.parse(raw);
  const now = w1.clock.now;
  if (job.saveDir) {
    fs.mkdirSync(job.saveDir, { recursive: true });
    fs.writeFileSync(path.join(job.saveDir, `v1-seed${job.seed}.json`), JSON.stringify({ now, save: v1 }));
  }
  const v1ArenaReach = c.out.arenaReach.length - 1;

  // 2. load it with today's code
  const w2 = makeWorld(newCode, job.seed + 7777, now);
  w2.store[w2.A.SAVE_KEY] = raw;
  w2.A.loadGame();
  const A = w2.A, sv = A.getSave(), gift = sv.pendingGift;
  check('v1 save is v1', v1.v === 1, `v ${v1.v}`);
  check('migrated to v2 with a gift', sv.v === 2 && gift && Array.isArray(gift.road), `v ${sv.v}`);
  for (const k of ['trophies', 'best', 'arenaSeen', 'cycle', 'king', 'kingXp', 'name', 'deck', 'tutorial']) check(`${k} unchanged`, same(sv[k], v1[k]), `${v1[k]} -> ${sv[k]}`);
  check('decks unchanged', same(sv.decks, v1.decks));
  check('settings unchanged', same(sv.settings, v1.settings));
  check('stats unchanged, lstreak 0', Object.keys(v1.stats).every((k) => sv.stats[k] === v1.stats[k]) && sv.stats.lstreak === 0);
  check('free chest state kept', v1.free == null || same(sv.free, v1.free));
  check('gems = before + gift', sv.gems === v1.gems + gift.gems, `${v1.gems} + ${gift.gems} = ${sv.gems}`);
  check('gold >= before + gift', sv.gold >= v1.gold + gift.gold, `${v1.gold} + ${gift.gold} <= ${sv.gold}`);
  check('road back-pay at most 10k gold', gift.gold <= 10000, `${gift.gold} gold`);
  // cards: nothing lost or lowered; copies only go down on maxed cards (turned into gold)
  const lowered = Object.keys(v1.cards).filter((k) => !sv.cards[k] || sv.cards[k].lvl < v1.cards[k].lvl || (sv.cards[k].lvl < A.MAX_LEVEL && sv.cards[k].n < v1.cards[k].n));
  check('no card lost, lowered or short of copies', !lowered.length, lowered.join(','));
  const ab = A.arenaIndex(v1.best);
  const missing = A.CARD_KEYS.filter((k) => A.CARDS[k].arena <= ab && !sv.cards[k]);
  check('every card of the reached arenas owned', !missing.length, missing.join(','));
  check('Tunneler only at 2600', !!sv.cards.tunneler === (v1.best >= 2600 || !!v1.cards.tunneler), `best ${v1.best}`);
  const lv = Object.keys(v1.cards).map((k) => v1.cards[k].lvl).sort((a, b) => b - a).slice(0, 8);
  const floorV1 = Math.min(A.MAX_LEVEL, Math.max(1, Math.floor(lv.reduce((a, b) => a + b, 0) / lv.length) - 2));
  const under = Object.keys(sv.cards).filter((k) => sv.cards[k].lvl < floorV1);
  check('no card below top-8 average - 2', !under.length, `floor ${floorV1}; ${under.join(',')}`);
  check('raised cards all go to one level', new Set(gift.raised.map((x) => x.to)).size <= 1 && gift.raised.every((x) => x.to > x.from));
  const due = A.ROAD.filter((n) => n.t <= v1.best).length;
  check('road index = nodes up to best', sv.road === due && gift.road.length === due && gift.road.every((g, i) => g.t === A.ROAD[i].t), `road ${sv.road}, due ${due}, paid ${gift.road.length}`);
  // chests: ready/unlocking keep their timer (never longer than the new one), locked ones join the 2-lane queue
  const chestBad = [];
  const starts = [];
  v1.chests.forEach((o, i) => {
    const ch = sv.chests[i];
    if (!o) { if (ch) chestBad.push(`slot ${i} filled`); return; }
    if (!ch || ch.type !== o.type || ch.arena !== o.arena || ch.seed !== o.seed) { chestBad.push(`slot ${i} changed`); return; }
    const st = A.chestState(ch);
    if (st === 'locked') chestBad.push(`slot ${i} still locked`);
    if (!o.unlockAt) starts.push(ch.unlockAt - A.CHESTS[ch.type].time * 1000);
    else if (o.unlockAt <= now) { if (ch.unlockAt !== o.unlockAt) chestBad.push(`slot ${i} ready timer moved`); }
    else if (ch.unlockAt !== Math.min(o.unlockAt, now + A.CHESTS[o.type].time * 1000)) chestBad.push(`slot ${i} unlock timer wrong`);
  });
  const unlocking = sv.chests.filter((ch) => A.chestState(ch) === 'unlocking').length;
  if (unlocking > 2) chestBad.push(`${unlocking} unlocking`);
  if (starts.some((s, i) => i && s < starts[i - 1])) chestBad.push('queue out of slot order');
  check('chests queued (2 lanes, slot order)', !chestBad.length, v1.chests.map((o, i) => (o ? `${o.type}:${o.unlockAt ? (o.unlockAt <= now ? 'ready' : 'unlocking') : 'locked'}->${A.chestState(sv.chests[i])}` : '-')).join(' ') + (chestBad.length ? ' | ' + chestBad.join(', ') : ''));
  check('crowns capped at 16', sv.crowns === Math.min(16, v1.crowns), `${v1.crowns} -> ${sv.crowns}`);
  const stored = w2.store[A.SAVE_KEY];
  check('stored save is v2 without pendingGift', JSON.parse(stored).v === 2 && !/pendingGift/.test(stored));

  // 3. loading again pays nothing (twice, to be sure)
  let prev = noGift(sv), prevStore = stored, again = true;
  for (let i = 0; i < 2; i++) {
    const w = makeWorld(newCode, job.seed + 9999 + i, now);
    w.store[w.A.SAVE_KEY] = prevStore;
    w.A.loadGame();
    const s2 = w.A.getSave();
    if (s2.pendingGift != null || noGift(s2) !== prev) again = false;
    prev = noGift(s2);
    prevStore = w.store[w.A.SAVE_KEY];
  }
  check('second and third load pay nothing', again);

  // 4. keep playing on the new code
  const before = { trophies: v1.trophies, best: v1.best, deck: +w1.A.avgDeckLevel(w1.A.curDeck()).toFixed(2), owned: Object.keys(v1.cards).length, gold: v1.gold };
  const deckAfterLoad = +A.avgDeckLevel(A.curDeck()).toFixed(2);
  delete sv.pendingGift;
  c.attach(w2);
  c.play(total);
  const out = c.finish();
  const a8 = out.arenaReach[7] ? out.arenaReach[7].battle - job.v1Battles : null;
  // the A8 pace check is calibrated for the attentive reference player; lazy runs must pass the old wall
  const strict = job.policy === 'attentive' && (job.v1Battles >= 300 || v1.best >= 1900);
  if (v1ArenaReach >= 7) check(`A8 within ${job.after} battles`, true, 'already reached A8 before the update');
  else if (strict) check(`A8 within ${job.after} battles`, a8 != null && a8 <= job.after, a8 == null ? `not reached; best ${out.final.best}` : `A8 ${a8} battles after the update`);
  else check(`past the old wall (${WALL}) within ${job.after} battles`, out.final.best > WALL, `best ${v1.best} -> ${out.final.best}${a8 != null ? `; A8 ${a8} battles after the update` : ''}`);
  return { seed: job.seed, v1Battles: job.v1Battles, before, gift: giftSummary(gift), deckAfterLoad, a8, after: { trophies: out.final.trophies, best: out.final.best, deck: +out.final.deckLvl.toFixed(2) }, checks };
}

function runChildren(jobs, par) {
  return new Promise((resolve) => {
    const results = new Array(jobs.length);
    let next = 0, done = 0;
    const launch = () => {
      if (next >= jobs.length) return;
      const i = next++;
      const p = spawn(process.execPath, [__filename, '--child', JSON.stringify(jobs[i])], { env: process.env });
      let buf = '', err = '';
      p.stdout.on('data', (d) => (buf += d));
      p.stderr.on('data', (d) => (err += d));
      p.on('close', () => {
        try { results[i] = JSON.parse(buf); } catch (e) { results[i] = { seed: jobs[i].seed, error: (err || buf).slice(0, 1500) }; }
        if (++done === jobs.length) resolve(results); else launch();
      });
    };
    for (let k = 0; k < Math.min(par, jobs.length); k++) launch();
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--child') { process.stdout.write(JSON.stringify(runOne(JSON.parse(args[1])))); return; }
  const opt = (name) => { const a = args.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : null; };
  const pos = args.filter((a) => !a.startsWith('--'));
  const v1Battles = parseInt(pos[0] || '300', 10);
  const seeds = (pos[1] || '1,2,3,4').split(',').map(Number);
  const after = parseInt(pos[2] || '120', 10);
  const rev = opt('rev') || preV2Rev();
  const saveDir = opt('save-dir') ? path.resolve(opt('save-dir')) : null;
  const policy = opt('policy') || 'attentive';
  const t = Date.now();
  const results = await runChildren(seeds.map((seed) => ({ seed, v1Battles, after, rev, saveDir, policy })), Math.max(1, os.cpus().length));
  console.log(`${seeds.length} ${policy} v1 careers of ${v1Battles} battles on ${rev}, migrated, then ${after} more battles (${((Date.now() - t) / 1000).toFixed(0)}s)`);
  let fails = 0;
  for (const r of results) {
    if (r.error) { fails++; console.log(`\nseed ${r.seed}: ERROR\n${r.error}`); continue; }
    console.log(`\nseed ${r.seed}: v1 trophies ${r.before.trophies}, best ${r.before.best}, deck ${r.before.deck}, ${r.before.owned} cards, ${r.before.gold} gold`);
    console.log(`  gift: ${r.gift.newCards} new cards, ${r.gift.raised} raised (+${r.gift.raisedLv} levels), ${r.gift.road} road nodes, +${r.gift.gold} gold, +${r.gift.gems} gems, +${r.gift.copies} copies; deck ${r.deckAfterLoad} after load`);
    console.log(`  after ${after} more battles: trophies ${r.after.trophies}, best ${r.after.best}, deck ${r.after.deck}; A8 ${r.a8 == null ? 'not reached' : r.a8 + ' battles after the update'}`);
    for (const c of r.checks) {
      if (!c.ok) fails++;
      console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ': ' + c.detail : ''}`);
    }
  }
  console.log(fails ? `\n${fails} check(s) FAILED.` : '\nAll migration checks passed.');
  if (fails) process.exitCode = 1;
}

main();
