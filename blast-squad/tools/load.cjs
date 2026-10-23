'use strict';
// Loads Blast Squad modules into a fresh Node vm context, the way build.mjs bundles them (same order,
// one shared scope), and returns the names asked for. Used by every headless test.
//   const { load } = require('./load.cjs');
//   const api = load({ upTo: '10-motor.js', names: ['Sim', 'parseMap'] });
// Determinism: inside the context Math.random, Date.now and performance.now throw (unless
// allowRandom), so the sim and the bots can only use their seeded RNGs. checkDeterministicSources()
// also scans the sim/AI source files for those calls.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS_DIR = process.env.BS_JS_DIR || path.join(__dirname, '..', 'src', 'js');
// Files that must stay deterministic: data, maps, geo, sim, modes and AI.
const DET_FILES = /^(0[2-9]|10)-/;

function moduleList(upTo) {
  let files = fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort();
  if (upTo) files = files.filter((f) => f <= upTo);
  return files;
}

function load(opts) {
  opts = opts || {};
  const files = opts.files || moduleList(opts.upTo || '10-zzz');
  const M = Object.create(Math);
  if (!opts.allowRandom) M.random = () => { throw new Error('Math.random used in deterministic code'); };
  const FakeDate = function () { throw new Error('Date used in deterministic code'); };
  FakeDate.now = () => { throw new Error('Date.now used in deterministic code'); };
  const ctx = {
    console, Set, Map, WeakMap, Array, Object, Number, String, Boolean, JSON, Error, TypeError, RangeError,
    Float32Array, Float64Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Int16Array, Int8Array, ArrayBuffer, DataView,
    Infinity, NaN, isFinite, isNaN, parseInt, parseFloat, Symbol, Promise, Reflect, Proxy,
    setTimeout, clearTimeout, queueMicrotask,
    Math: M,
    Date: opts.allowRandom ? Date : FakeDate,
    performance: opts.allowRandom ? { now: () => performance.now() } : { now: () => { throw new Error('performance.now used in deterministic code'); } },
  };
  if (opts.extra) Object.assign(ctx, opts.extra);
  vm.createContext(ctx);
  let code = '';
  for (const f of files) code += `// ===== ${f} =====\n${fs.readFileSync(path.join(JS_DIR, f), 'utf8')}\n`;
  const names = opts.names || [];
  code += `\nglobalThis.__api = { ${names.map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} };`;
  vm.runInContext(code, ctx, { filename: 'blast-squad.js' });
  return ctx.__api;
}

// Static check: returns a list of "file:line: text" for nondeterministic calls in deterministic files.
function checkDeterministicSources() {
  const bad = [];
  const re = /\bMath\.random\b|\bDate\.now\b|\bnew Date\b|\bperformance\.now\b|(?<![\w.])(rand|randi|choice)\(/;
  for (const f of moduleList()) {
    if (!DET_FILES.test(f)) continue;
    const lines = fs.readFileSync(path.join(JS_DIR, f), 'utf8').split('\n');
    lines.forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, '');
      if (re.test(code)) bad.push(`${f}:${i + 1}: ${l.trim()}`);
    });
  }
  return bad;
}

module.exports = { load, moduleList, checkDeterministicSources, JS_DIR };
