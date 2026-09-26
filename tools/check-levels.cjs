// Verifies every generated stage is completable: BFS over standable tiles using
// conservative jump limits (the real player can jump higher/further than this).
// Usage: NODE_PATH=$(npm root -g) node tools/check-levels.cjs
const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => {
    const { generateLevel, levelDefFor, MAP } = window.__SO;
    const TILE = 32;
    const MAX_RISE = 5; // tiles (double jump reaches ~6)
    const MAX_DX = 6; // tiles horizontally on a jump (double jump + air reaches ~7)
    const MAX_DROP_DX = 7;

    function check(def) {
      const L = generateLevel(def);
      const W = L.world;
      const solid = (c, r) => { const t = W.get(c, r); return t === 1 || t === 5; };
      const floorT = (t) => t === 1 || t === 5 || t === 2;
      const virt = new Set();
      const key = (c, r) => c * 100 + r;
      for (const p of L.platforms) {
        const c0 = Math.floor(p.x / TILE), c1 = Math.floor((Math.max(p.ax, p.bx) + p.w - 1) / TILE);
        const cs = Math.floor(Math.min(p.ax, p.bx) / TILE);
        const r0 = Math.floor(Math.min(p.ay, p.by) / TILE), r1 = Math.floor(Math.max(p.ay, p.by) / TILE);
        for (let c = Math.min(c0, cs); c <= c1; c++) for (let r = r0; r <= r1; r++) virt.add(key(c, r));
      }
      const springs = new Set(L.springs.map((s) => key(Math.floor(s.x / TILE), Math.round(s.y / TILE))));
      const standable = (c, r) => {
        if (c < 0 || c >= W.cols || r < 2 || r >= W.rows) return false;
        const t = W.get(c, r);
        const base = floorT(t) || virt.has(key(c, r));
        if (!base) return false;
        if (solid(c, r - 1) || solid(c, r - 2)) return false;
        const a = W.get(c, r - 1);
        if (a === 3 || a === 4) return false;
        return true;
      };
      const cells = [];
      for (let c = 0; c < W.cols; c++) for (let r = 0; r < W.rows; r++) if (standable(c, r)) cells.push([c, r]);
      const byCol = new Map();
      for (const [c, r] of cells) { if (!byCol.has(c)) byCol.set(c, []); byCol.get(c).push(r); }
      const clear = (c, r0, r1) => { for (let r = Math.max(0, r0); r <= r1; r++) if (solid(c, r)) return false; return true; };
      const start = [Math.floor(L.start.x / TILE), Math.round(L.start.y / TILE)];
      let goal;
      if (L.goal) goal = [Math.floor(L.goal.x / TILE), Math.round(L.goal.y / TILE)];
      else if (L.arenas.length) { const a = L.arenas[L.arenas.length - 1]; goal = [Math.floor(a.x0 / TILE) + 3, Math.round(a.gy / TILE)]; }
      if (!standable(start[0], start[1])) return 'start not standable';
      if (!standable(goal[0], goal[1])) return 'goal not standable';
      const seen = new Set([key(start[0], start[1])]);
      const q = [start];
      let far = start[0];
      while (q.length) {
        const [c, r] = q.shift();
        if (c === goal[0] && r === goal[1]) return null;
        far = Math.max(far, c);
        const rise = springs.has(key(c, r)) ? 8 : MAX_RISE;
        for (let c2 = c - MAX_DROP_DX; c2 <= c + MAX_DROP_DX; c2++) {
          const rows = byCol.get(c2);
          if (!rows) continue;
          const dc = Math.abs(c2 - c);
          for (const r2 of rows) {
            const k = key(c2, r2);
            if (seen.has(k)) continue;
            const up = r - r2;
            if (up > rise) continue;
            if (up > 0 && dc > MAX_DX) continue;
            if (dc > 1) {
              const top = Math.min(r, r2) - (up > 0 ? rise : 3);
              let ok = true;
              for (let cc = Math.min(c, c2) + 1; cc < Math.max(c, c2); cc++) if (!clear(cc, top, Math.max(r, r2) - 1)) { ok = false; break; }
              if (!ok) continue;
            } else if (dc === 1 && up > 0) {
              if (!clear(c, r - up - 2, r - 1) || !clear(c2, r2 - 2, r2 - 1)) continue;
            }
            seen.add(k);
            q.push([c2, r2]);
          }
        }
      }
      return 'unreachable goal (got to column ' + far + ' of ' + goal[0] + ')';
    }

    const failures = [];
    let n = 0;
    for (const node of MAP.list) {
      const def = levelDefFor(node);
      if (!def || def.len === 0) continue;
      n++;
      const err = check(def);
      if (err) failures.push(node.id + ': ' + err);
    }
    // random seeds for every region and stage type
    for (let r = 0; r < 6; r++) {
      for (let i = 0; i < 60; i++) {
        for (const kind of ['normal', 'treasure', 'boss']) {
          const def = { kind, region: r, diff: r + (i % 3) * 0.33, len: kind === 'boss' ? 60 : 115 + (i % 3) * 22 + r * 8, seed: 1000 + i * 7919 + r * 31, boss: 'bruto', name: 'x' };
          n++;
          const err = check(def);
          if (err) failures.push(`${kind} r${r} seed ${def.seed}: ${err}`);
        }
      }
    }
    return { n, failures };
  });
  console.log(`Checked ${result.n} levels`);
  if (result.failures.length) console.log('FAILURES:\n' + result.failures.slice(0, 40).join('\n'));
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  await browser.close();
  process.exit(result.failures.length || errors.length ? 1 : 0);
})();
