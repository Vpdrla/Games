// Checks that every text the game shows has a Korean translation: hero/monster/item data, every
// tr('...') in the source, and labels built at run time (rooms, floors, banners).
// Usage: node realm-raiders/tools/lang-test.cjs
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.cjs');

const A = load({ upTo: '02b-lang.js', names: ['KO', 'HEROES', 'BOSSES', 'REALMS', 'DIFFS', 'ELITE_AFFIX', 'REWARDS', 'BLESSINGS', 'GEAR_STATS', 'GEAR_BASES', 'PREFIX', 'SUFFIX', 'UNIQUES', 'TALENTS', 'ACHIEVEMENTS', 'QUESTS', 'RARITY', 'SLOT_NAME', 'Lang', 'trx', 'tr'],
  extra: { navigator: { language: 'ko-KR' }, document: { documentElement: {} } } });
const KO = A.KO;
const missing = new Set();
const need = (s, where) => { if (s && KO[s] == null) missing.add(where + ': ' + s); };

for (const h of A.HEROES) {
  need(h.name, 'hero'); need(h.title, 'hero'); need(h.role, 'role');
  for (const k of ['skill', 'ult', 'passive']) { need(h[k].name, 'hero ' + k); need(h[k].desc, 'hero ' + k); }
}
for (const b of Object.values(A.BOSSES)) { need(b.name, 'boss'); need(b.title, 'boss'); }
for (const r of A.REALMS) need(r.name, 'realm');
for (const d of A.DIFFS) need(d.name, 'difficulty');
for (const e of A.ELITE_AFFIX) need(e.name, 'elite');
for (const r of Object.values(A.REWARDS)) { need(r.name, 'reward'); need(r.desc, 'reward'); }
for (const b of A.BLESSINGS) { need(b.name, 'blessing'); need(b.desc, 'blessing'); }
for (const g of Object.values(A.GEAR_STATS)) need(g[0], 'stat');
for (const list of Object.values(A.GEAR_BASES)) for (const b of list) need(b, 'base');
for (const p of Object.values(A.PREFIX)) need(p, 'prefix');
for (const p of A.SUFFIX) need(p, 'suffix');
for (const u of A.UNIQUES) { need(u.name, 'unique'); need(u.desc, 'unique'); }
for (const t of A.TALENTS) { need(t.name, 'talent'); need(t.desc, 'talent'); }
for (const a of A.ACHIEVEMENTS) { need(a.name, 'achievement'); need(a.desc, 'achievement'); }
for (const q of A.QUESTS) need(q.name, 'quest');
for (const r of A.RARITY) need(r.name, 'rarity');
for (const s of Object.values(A.SLOT_NAME)) need(s, 'slot');

const dir = path.join(__dirname, '..', 'src', 'js');
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.js') || f === '02b-lang.js') continue;
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const m of src.matchAll(/\btr\(\s*'((?:[^'\\]|\\.)*)'/g)) { const v = m[1].replace(/\\'/g, "'"); if (!v.endsWith(' ') || v.trim().length > 12) need(v, f); }
  for (const m of src.matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"/g)) need(m[1], f);
  // messages shown through trx: online status and errors
  for (const m of src.matchAll(/msg: '([^']+)'/g)) if (!m[1].endsWith(' ')) need(m[1], f + ' msg');
  for (const m of src.matchAll(/new NetError\('\w+', '([^']+)'\)/g)) need(m[1], f + ' net');
  for (const m of src.matchAll(/const offline = '([^']+)'/g)) need(m[1], f + ' net');
  for (const m of src.matchAll(/emit\('(?:banner|text)'[^;]*?'([A-Za-z][^']*)'/g)) { const s = m[1]; if (!/^#/.test(s) && /[a-z]{2}/i.test(s) && !s.endsWith(' ')) { A.Lang.ko = true; if (A.trx(s) === s) missing.add(f + ' emitted: ' + s); } }
}
for (const f of ['KEY_HINT', 'DEV_NAME']) {
  const src = fs.readFileSync(path.join(dir, '09-input.js'), 'utf8');
  const m = src.match(new RegExp('const ' + f + ' = (\\{[^\\n]*\\});'));
  const obj = eval('(' + m[1] + ')');
  A.Lang.ko = true;
  for (const v of Object.values(obj)) if (A.trx(v) === v && v !== 'Touch') missing.add(f + ': ' + v); else if (v === 'Touch' && KO.Touch == null) missing.add(f + ': Touch');
}
A.Lang.ko = true;
const samples = ['Whispering Woods · Room 3/7', 'Abyss · Floor 12', 'FLOOR 5 CLEARED', 'GORETHORN IS ENRAGED!', 'Gorethorn falls', 'BLUE TEAM WINS!', 'Free for all · first to 10', '12x MULTI-KILL!', 'Sunken Crypt · Boss', 'Arena · Team battle'];
for (const s of samples) { const k = A.trx(s); if (/[A-Za-z]{3}/.test(k.replace(/[A-Z]{2,}\b/g, ''))) missing.add('pattern: ' + s + ' -> ' + k); else console.log('  ' + s + '  ->  ' + k); }

A.Lang.ko = true;
const jo = [A.tr('{name} joined your guild!', { name: '<b>브랜드</b>' }), A.tr('Play as {name}', { name: '엠버' }), A.tr('Play as {name}', { name: '솔' }), A.tr('{name} left. A bot takes over.', { name: '민준' })];
console.log('  ' + jo.join(' | '));
if (jo[0] !== '<b>브랜드</b>가 길드에 합류했어요!' || jo[1] !== '엠버로 플레이' || jo[2] !== '솔로 플레이' || jo[3] !== '민준이 나갔어요. 봇이 대신 플레이해요.') missing.add('josa: ' + jo.join(' | '));
if (missing.size) { console.log('\nMissing Korean (' + missing.size + '):'); for (const m of missing) console.log('  ' + m); process.exit(1); }
console.log('\nall text has Korean (' + Object.keys(KO).length + ' entries)');
