'use strict';
// Loads Realm Raiders modules into a fresh Node vm context, the way build.mjs bundles them (same
// order, one shared scope), and returns the names asked for. Used by the headless tests.
//   const { load } = require('./load.cjs');
//   const api = load({ upTo: '07-modes.js', names: ['World', 'RunMode'] });
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS_DIR = path.join(__dirname, '..', 'src', 'js');

function load(opts) {
  opts = opts || {};
  let files = fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort();
  if (opts.upTo) files = files.filter((f) => f <= opts.upTo);
  const ctx = {
    console, Set, Map, WeakMap, Array, Object, Number, String, Boolean, JSON, Error, TypeError, RangeError, Math, Date,
    Float32Array, Float64Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Int16Array, Int8Array, ArrayBuffer, DataView,
    Infinity, NaN, isFinite, isNaN, parseInt, parseFloat, Symbol, Promise, Reflect, Proxy, setTimeout, clearTimeout, queueMicrotask,
    performance: { now: () => performance.now() },
  };
  if (opts.extra) Object.assign(ctx, opts.extra);
  vm.createContext(ctx);
  let code = '';
  for (const f of files) code += `// ===== ${f} =====\n${fs.readFileSync(path.join(JS_DIR, f), 'utf8')}\n`;
  const names = opts.names || [];
  code += `\nglobalThis.__api = { ${names.map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} };`;
  vm.runInContext(code, ctx, { filename: 'realm-raiders.js' });
  return ctx.__api;
}

module.exports = { load };
