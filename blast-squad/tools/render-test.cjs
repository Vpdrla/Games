// Render test for Art / FX / View: builds a standalone page from the util, constants, maps and geo
// modules plus 15-art, 16-fx and 17-view (and the brawler data, sim and modes when they load), feeds
// the view fake states shaped like DESIGN.md's entities (every mode's HUD, shots of many kinds, lobs,
// beams, areas, units, pickups, the ball, Showdown poison) and, when the sim loads, a real bot-less
// match. Checks for page errors, measures draw time (also under 4x CPU throttling) and saves
// screenshots.
// Usage: NODE_PATH=$(npm root -g) node blast-squad/tools/render-test.cjs [screenshot-dir]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.cjs');

const JS = path.join(__dirname, '..', 'src', 'js');
const outDir = process.argv[2] || path.join(require('node:os').tmpdir(), 'bs-render');
fs.mkdirSync(outDir, { recursive: true });

// ---- which modules can join the page ----
const has = (f) => fs.existsSync(path.join(JS, f));
const base = ['01-util.js', '02-const.js', '04-maps.js', '05-geo.js'];
let extra = [];
const tryLoad = (files, names, check) => {
  try {
    const api = load({ files, names, allowRandom: true });
    return check ? check(api) : true;
  } catch (e) {
    console.log('  (skipping ' + files.slice(-1)[0] + ': ' + e.message.split('\n')[0] + ')');
    return false;
  }
};
if (has('03-brawlers.js') && tryLoad(['01-util.js', '02-const.js', '03-brawlers.js'], ['BRAWLERS'], (a) => !!a.BRAWLERS)) extra.push('03-brawlers.js');
if (extra.length && has('06-sim.js') && has('07-modes.js')) {
  const files = ['01-util.js', '02-const.js', '03-brawlers.js', '04-maps.js', '05-geo.js', '06-sim.js', '07-modes.js'];
  const ok = tryLoad(files, ['Sim', 'MODES'], (a) => {
    const slots = [];
    for (let i = 0; i < 6; i++) slots.push({ team: i < 3 ? 0 : 1, bk: 'nova', lvl: 1, gadget: 0, star: 0 });
    const s = new a.Sim({ mode: 'gem', map: 'crystal_cove', seed: 1, slots });
    for (let i = 0; i < 30; i++) s.step();
    return true;
  });
  if (ok) extra.push('06-sim.js', '07-modes.js');
}
const files = base.concat(extra).sort().concat(['15-art.js', '16-fx.js', '17-view.js']);
console.log('modules: ' + files.join(' '));
const code = files.map((f) => `// ===== ${f} =====\n` + fs.readFileSync(path.join(JS, f), 'utf8')).join('\n');

// ---- the page's own code: fake states and the frame loop (stringified into the page) ----
function pageMain() {
  const HAS_B = typeof BRAWLERS !== 'undefined';
  const HAS_SIM = typeof Sim !== 'undefined' && typeof MODES !== 'undefined';
  let nextId = 1;
  const KEYS = ['nova', 'dax', 'brick', 'bramble', 'pip', 'melody', 'sizzle', 'gizmo', 'volt', 'hawk', 'frost', 'shade', 'zip', 'specter', 'thorn'];
  const HP = { nova: 3600, dax: 2800, brick: 6000, bramble: 4000, pip: 2800, melody: 4000, sizzle: 2400, gizmo: 3000, volt: 3200, hawk: 2400, frost: 3800, shade: 3800, zip: 3300, specter: 3200, thorn: 2400 };
  const NAMES = ['You', 'Mika', 'Tobi_77', 'xXRexXx', 'Luna', 'Kai', 'Pepper', 'Jun', 'Sasha', 'Bo'];

  // test maps: a Blast Ball field and a 44x44 Showdown map (page-local; 04-maps.js is not touched)
  MAPS.test_ball = {
    name: 'Test Field', modes: ['ball'],
    rows: [
      'XXXXXXX.ZZZZZ.XXXXXXX',
      '.....................',
      '...""".2..2..2."""...',
      '.....................',
      '..##.............##..',
      '..##....#####....##..',
      '.....................',
      '"""......~~~......"""',
      '"""..............."""',
      '.......=======.......',
      '.....................',
      '....##.........##....',
      '....##..."""...##....',
      '.....................',
      '..""".....#....."""..',
      '.....................',
      '..........O..........',
    ],
  };
  {
    const N = 44, rng = new RNG(4242), g = [];
    for (let y = 0; y < N; y++) g.push(new Array(N).fill('.'));
    const blob = (ch, n, w, h) => {
      for (let i = 0; i < n; i++) {
        const x0 = rng.int(1, N - w - 1), y0 = rng.int(1, N - h - 1);
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (rng.chance(0.85)) g[y][x] = ch;
      }
    };
    blob('"', 26, 4, 3);
    blob('#', 18, 3, 2);
    blob('X', 5, 2, 2);
    blob('~', 3, 5, 3);
    for (let i = 0; i < 36; i++) g[rng.int(2, N - 3)][rng.int(2, N - 3)] = 'B';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU, x = Math.round(N / 2 + Math.cos(a) * 17), y = Math.round(N / 2 + Math.sin(a) * 17);
      g[y][x] = 'S';
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g[y + dy][x + dx] !== 'S') g[y + dy][x + dx] = '.';
    }
    MAPS.test_sd = { name: 'Test Wilds', modes: ['sd'], full: true, rows: g.map((r) => r.join('')) };
  }

  function brawler(slot, team, bk, x, y, o) {
    const hp = HP[bk] || 3600;
    const b = {
      id: nextId++, kind: K.BRAWLER, team, x, y, px: x, py: y, r: BRAWLER_R, dead: false,
      slot, bk, lvl: 7, gadget: 0, star: 0, name: NAMES[slot] || 'P' + slot,
      hp, maxHp: hp, alive: true, respawnT: 0, face: team === 0 ? -Math.PI / 2 : Math.PI / 2,
      ammo: 3, reload: 1.5, sup: 0, supReady: false, gadLeft: 3, gadT: 0,
      cubes: 0, carry: 0, bounty: 0,
      vis: 0xffff, inBush: false, revealT: 0, quietT: 0, shieldT: 0,
      stunT: 0, slowT: 0, slowF: 0, kbT: 0, kbx: 0, kby: 0, dashT: 0,
      invisT: 0, speedT: 0, speedF: 0, mvx: 0, mvy: 0, lastSeq: 0,
      st: { kills: 0, deaths: 0, dmg: 0, heal: 0, gems: 0, goals: 0, stars: 0 },
    };
    return Object.assign(b, o || {});
  }
  function shot(owner, team, pk, x, y, ang, o) {
    return Object.assign({ id: nextId++, kind: K.SHOT, team, x, y, px: x, py: y, r: 0.15, dead: false, owner, pk, x0: x, y0: y, ang, spd: 11, range: 8, trav: 0, dmg: 300, pierce: false, hitMask: 0, sup: false, breaks: false, lob: null }, o || {});
  }
  function lob(owner, team, pk, x, y, tx, ty, T, t, o) {
    const s = shot(owner, team, pk, x, y, Math.atan2(ty - y, tx - x), o);
    s.range = Math.hypot(tx - x, ty - y);
    s.lob = { tx, ty, T, t };
    return s;
  }
  function beam(owner, team, pk, x, y, ang, len) {
    const s = shot(owner, team, pk, x, y, ang);
    s.x = s.px = x + Math.cos(ang) * len; s.y = s.py = y + Math.sin(ang) * len; s.beam = len; s.ttl = 0.15;
    return s;
  }
  const area = (owner, team, ak, x, y, r, T, t, o) => Object.assign({ id: nextId++, kind: K.AREA, team, x, y, px: x, py: y, r, dead: false, owner, ak, t, T, dmg: 500, heal: 0, slow: 0 }, o || {});
  const pickup = (pick, x, y, n, t) => ({ id: nextId++, kind: K.PICKUP, team: -1, x, y, px: x, py: y, r: 0.3, dead: false, pick, n: n || 1, vx: 0, vy: 0, t: t == null ? 2 : t });
  const deploy = (owner, team, dk, x, y, face, hp) => ({ id: nextId++, kind: K.DEPLOY, team, x, y, px: x, py: y, r: 0.5, dead: false, owner, dk, hp: hp || 2400, maxHp: 3000, face: face || 0, t: 1 });

  function baseState(modeKey, mapKey, hud) {
    const map = cloneMap(parseMap(mapKey));
    return { modeKey, map, brawlers: [], shots: [], areas: [], pickups: [], deploys: [], ball: null, tick: 0, t: 0, poison: null, events: [], hudObj: hud, hud() { return this.hudObj; } };
  }
  const inBush = (st, b) => { b.inBush = inBushAt(st.map, b.x, b.y); return b; };
  const hideFrom = (b, team) => { b.vis = 1 << b.team; return b; };

  // ---- scenarios ----
  const SC = {};
  SC.gem = () => {
    const st = baseState('gem', 'crystal_cove', { mode: 'gem', time: 74, gems: [7, 10], count: 12, countTeam: 1 });
    const B = st.brawlers;
    B.push(brawler(0, 0, 'nova', 10.4, 20.6, { carry: 3, ammo: 2.4, sup: 0.62, face: -1.9, mvx: 1, mvy: -2 }));
    B.push(inBush(st, brawler(1, 0, 'brick', 5.5, 18.5, { hp: 4100, shieldT: 2 })));
    B.push(brawler(2, 0, 'melody', 15.2, 22.2, { supReady: true, sup: 1, hp: 2600, mvx: -1 }));
    B.push(brawler(3, 1, 'dax', 8.6, 12.4, { carry: 6, face: 1.3, hp: 1900, mvx: 1.5 }));
    B.push(hideFrom(inBush(st, brawler(4, 1, 'pip', 5.5, 14.5)), 0));
    B.push(brawler(5, 1, 'gizmo', 15.3, 14.2, { carry: 4, face: 2.2, stunT: 1.2 }));
    st.deploys.push(deploy(5, 1, 'gizmo.turret', 17.5, 19.6, 2.6));
    for (let i = 0; i < 5; i++) st.shots.push(shot(0, 0, 'nova.atk', 10.3 + (i - 2) * 0.35, 18.4 - Math.abs(i - 2) * 0.1, -1.9 + (i - 2) * 0.13, { r: 0.18 }));
    for (let i = 0; i < 3; i++) st.shots.push(shot(3, 1, 'dax.atk', 8.9 + i * 0.25, 14.0 + i * 0.9, 1.3, { r: 0.14 }));
    st.shots.push(lob(4, 1, 'pip.atk', 5.5, 14.5, 9.6, 19.8, 0.95, 0.48, { r: 0.18 }));
    st.shots.push(lob(4, 1, 'pip.atk', 5.5, 14.5, 10.3, 19.4, 0.95, 0.48, { r: 0.18 }));
    st.shots.push(shot(5, 1, 'gizmo.atk', 14.4, 16.4, 2.0, { r: 0.25 }));
    st.shots.push(shot(5, 1, 'gizmo.tshot', 16.4, 20.5, 2.7, { r: 0.13 }));
    st.shots.push(shot(2, 0, 'melody.atk', 13.4, 19.6, -2.1, { r: 0.9, pierce: true }));
    for (const [x, y] of [[10.5, 18.3], [9.0, 17.7], [12.2, 17.9], [11.4, 19.0]]) st.pickups.push(pickup(PICK.GEM, x, y));
    st.events.push([EV.HIT, B[3].id, 1450, B[3].x, B[3].y, 0, 0], [EV.HIT, B[0].id, 720, B[0].x, B[0].y, 3, 0], [EV.HEAL, 2, 640, B[2].x, B[2].y],
      [EV.KILL, 4, 0, 6, 15, 0], [EV.KILL, 1, 3, 5, 19], [EV.FIRE, 0, 1, B[0].x, B[0].y, -1.9, 0], [EV.PICKUP, 0, PICK.GEM, 1, 10, 20], [EV.PIN, 1, 0]);
    return { st, local: 0, aim: { act: ACT.ATTACK, ang: -1.9, d: 1 } };
  };
  SC.gemFlip = () => {
    const s = SC.gem();
    s.local = 3;
    s.aim = { act: ACT.ATTACK, ang: 1.3, d: 1 };
    s.st.brawlers[3].name = 'You';
    s.st.brawlers[0].name = 'Rival';
    s.st.brawlers[4].vis = 0xffff; // a teammate now: visible in the bush, half transparent
    s.st.brawlers[1].vis = 1; // hidden from team 1
    return s;
  };
  SC.ball = () => {
    const st = baseState('ball', 'test_ball', { mode: 'ball', time: 95, goals: [1, 0], ot: false });
    const B = st.brawlers;
    B.push(brawler(0, 0, 'zip', 10.5, 9.4, { face: -1.4, mvx: 0.2, mvy: -3, speedT: 2, speedF: 0.5 }));
    B.push(brawler(1, 0, 'frost', 6.2, 12.5, { face: -1.0, slowT: 0 }));
    B.push(brawler(2, 0, 'bramble', 15.0, 13.0, { face: -1.7 }));
    B.push(brawler(3, 1, 'shade', 9.0, 4.3, { face: 1.5, dashT: 0.2, mvy: 6 }));
    B.push(brawler(4, 1, 'hawk', 14.2, 3.2, { face: 2.4, slowT: 1.5, slowF: 0.3 }));
    B.push(brawler(5, 1, 'specter', 4.5, 7.4, { face: 0.5, hp: 1200 }));
    st.ball = { id: nextId++, kind: K.BALL, team: -1, x: 10.6, y: 9.0, px: 10.6, py: 9.0, r: 0.35, dead: false, holder: 0, vx: 0, vy: 0, z: 0 };
    st.deploys.push(deploy(2, 0, 'bramble.bear', 13.6, 10.8, -2.0, 3600));
    for (let i = 0; i < 6; i++) st.shots.push(shot(1, 0, 'frost.atk', 6.6 + Math.cos(-1.0 + (i - 2.5) * 0.14) * 2.2, 12.2 + Math.sin(-1.0 + (i - 2.5) * 0.14) * 2.2, -1.0 + (i - 2.5) * 0.14, { r: 0.17 }));
    st.shots.push(shot(4, 1, 'hawk.atk', 12.6, 6.4, 2.1));
    st.shots.push(shot(5, 1, 'specter.atk', 6.0, 8.3, 0.6));
    st.shots.push(shot(5, 1, 'specter.atk', 6.2, 8.0, 0.4));
    st.events.push([EV.GOAL, 0, 0]);
    return { st, local: 0, aim: { act: ACT.ATTACK, ang: -1.4, d: 1 } };
  };
  SC.ko = () => {
    const st = baseState('ko', 'crystal_cove', { mode: 'ko', time: 31, round: 2, rounds: [1, 0], alive: [2, 3], poison: null });
    const B = st.brawlers;
    B.push(brawler(0, 0, 'sizzle', 10.5, 21.4, { hp: 700, face: -1.6, supReady: true, sup: 1 }));
    B.push(brawler(1, 0, 'volt', 4.4, 19.7, { face: -1.2 }));
    B.push(brawler(2, 0, 'specter', 15.2, 18.6, { alive: false, respawnT: -1 }));
    B.push(brawler(3, 1, 'thorn', 9.4, 13.2, { face: 1.7, bounty: 0 }));
    B.push(brawler(4, 1, 'brick', 5.6, 13.1, { face: 1.6, stunT: 1, hp: 3000 }));
    B.push(brawler(5, 1, 'bramble', 15.4, 12.6, { face: 2.0, invisT: 0 }));
    st.deploys.push(deploy(5, 1, 'bramble.bear', 13.4, 15.3, 1.9, 2000));
    st.shots.push(beam(1, 0, 'volt.atk', 4.4, 19.7, -1.1, 7.6));
    st.areas.push(area(0, 0, 'sizzle.atk', 9.4, 14.6, 1.15, 1.6, 1.2));
    st.areas.push(area(3, 1, 'thorn.sup', 11.7, 19.4, 2.4, 4.5, 3.0, { slow: 0.4 }));
    st.areas.push(area(1, 0, 'volt.sup', 6.0, 13.2, 2.4, 4, 2.6, { slow: 0.4 }));
    st.shots.push(shot(3, 1, 'thorn.atk', 9.8, 15.6, 1.4, { r: 0.3 }));
    for (let i = 0; i < 6; i++) st.shots.push(shot(3, 1, 'thorn.spike', 12.2 + Math.cos(i) * 0.6, 17.0 + Math.sin(i) * 0.6, i + 0.3, { r: 0.12 }));
    st.shots.push(lob(0, 0, 'sizzle.atk', 10.5, 21.4, 8.6, 14.0, 0.95, 0.6, { r: 0.2 }));
    st.events.push([EV.HIT, B[0].id, 600, B[0].x, B[0].y, 3, 0], [EV.KILL, 2, 5, 15, 18], [EV.STATUS, 4, 1, 1]);
    return { st, local: 0, aim: { act: ACT.SUPER, ang: -1.55, d: 0.75 } };
  };
  SC.bounty = () => {
    const st = baseState('bounty', 'crystal_cove', { mode: 'bounty', time: 8, stars: [4, 6] });
    const B = st.brawlers;
    B.push(brawler(0, 0, 'hawk', 10.5, 23, { alive: false, respawnT: 2.4 }));
    B.push(brawler(1, 0, 'thorn', 7.4, 19.6, { bounty: 3, face: -1.4 }));
    B.push(brawler(2, 0, 'zip', 13.6, 20.4, { bounty: 2, face: -2.1, mvx: -2 }));
    B.push(brawler(3, 1, 'frost', 8.4, 14.6, { bounty: 5, face: 1.4 }));
    B.push(brawler(4, 1, 'shade', 12.5, 15.1, { bounty: 2, face: 2.0, shieldT: 1 }));
    B.push(brawler(5, 1, 'melody', 16.5, 12.8, { bounty: 2, face: 2.4 }));
    st.pickups.push(pickup(PICK.STAR, 10.5, 17.6, 1));
    st.shots.push(shot(4, 1, 'shade.sup', 11.7, 17.4, 2.4, { r: 0.8, sup: true }));
    st.shots.push(shot(3, 1, 'frost.sup', 8.6, 16.8, 1.5, { r: 1.6, sup: true }));
    return { st, local: 0, aim: { act: 0 } };
  };
  SC.sd = () => {
    const st = baseState('sd', 'test_sd', null);
    const rect = poisonRect(st.map, 70, { start: 30, shrink: 100, minHalf: 4 }, {});
    st.poison = rect;
    st.hudObj = { mode: 'sd', time: 70, alive: 7, poison: rect };
    const B = st.brawlers;
    const free = (x, y) => { const o = { x, y }; pushOut(st.map, o, 0.42, TF_MOVE); return o; };
    const p0 = free(rect.x0 + 3.5, rect.y0 + 6);
    const spots = [[p0.x, p0.y], [p0.x + 5, p0.y - 3], [p0.x + 8, p0.y + 4], [p0.x - 2.5, p0.y + 6], [p0.x + 2, p0.y + 8], [p0.x + 12, p0.y - 1], [p0.x - 5, p0.y - 4]];
    const keys = ['bramble', 'dax', 'pip', 'gizmo', 'zip', 'sizzle', 'nova'];
    for (let i = 0; i < 10; i++) {
      const [x, y] = spots[i] || [5 + i, 5];
      const q = free(x, y);
      const b = brawler(i, i, keys[i % keys.length], q.x, q.y, { cubes: i === 0 ? 3 : i % 3, alive: i < 7, respawnT: i < 7 ? 0 : -1 });
      inBush(st, b);
      if (b.inBush && i !== 0) b.vis = 1 << i;
      B.push(b);
    }
    B[0].face = 0.2;
    for (let i = 0; i < 3; i++) st.pickups.push(pickup(PICK.CUBE, p0.x + 3 + i * 0.7, p0.y + 2 - i * 0.4));
    st.deploys.push(deploy(3, 3, 'gizmo.turret', B[3].x + 1.2, B[3].y - 0.4, -0.4));
    st.shots.push(lob(2, 2, 'pip.sup', B[2].x, B[2].y, p0.x + 2, p0.y + 1, 1.1, 0.5, { r: 0.35, sup: true }));
    st.shots.push(shot(1, 1, 'dax.sup', B[1].x - 1, B[1].y + 0.6, 2.6, { r: 0.16, sup: true }));
    st.events.push([EV.KILL, 8, 1, 30, 20], [EV.POISON, 1]);
    return { st, local: 0, aim: { act: ACT.SUPER, ang: 0.3, d: 0.8 } };
  };

  // Effects right after a burst of events (damage and heal numbers, explosions, poofs, sparkles).
  SC.fx = () => {
    const s = SC.gem();
    const st = s.st, B = st.brawlers;
    s.shotAt = 14; // screenshot early, while the numbers are up
    B[5].stunT = 1.5;
    B[3].slowT = 2; B[3].slowF = 0.3;
    B[2].invisT = 3;
    st.events = [
      [EV.FIRE, 0, 1, B[0].x, B[0].y, -1.9, 0], [EV.FIRE, 3, 1, B[3].x, B[3].y, 1.3, 0],
      [EV.HIT, B[3].id, 1450, B[3].x, B[3].y, 0, 0], [EV.HIT, B[3].id, 380, B[3].x, B[3].y, 0, 1],
      [EV.HIT, B[0].id, 720, B[0].x, B[0].y, 3, 0], [EV.HEAL, 2, 640, B[2].x, B[2].y], [EV.HEAL, 0, 468, B[0].x, B[0].y],
      [EV.SHOT_END, 999, 12.6, 15.4, 0], [EV.KILL, 4, 0, 6.5, 15.5], [EV.RESPAWN, 1, 7.5, 22.5],
      [EV.SUPER_READY, 0], [EV.PICKUP, 0, PICK.GEM, 1, 10.4, 19.5], [EV.STATUS, 5, 1, 1.5], [EV.TILE, 10 * 21 + 14, TILE.FLOOR],
      [EV.FIRE, 5, 3, B[5].x, B[5].y, 2, 0],
    ];
    // a bomb landing next to the player: give the explosion a shot to remember
    st.shots.push(Object.assign(lob(4, 1, 'pip.atk', 6, 15, 12.6, 15.4, 0.9, 0.8), { id: 999 }));
    st.events.unshift([EV.SPAWN, 999, K.SHOT]);
    st.map.tiles[10 * 21 + 14] = TILE.FLOOR;
    return s;
  };

  // A real sim match driven by simple scripted inputs (no AI), to check the real entity shapes.
  SC.sim = () => {
    if (!HAS_SIM) return null;
    const keys = ['nova', 'volt', 'pip', 'sizzle', 'gizmo', 'bramble'];
    const slots = keys.map((bk, i) => ({ team: i < 3 ? 0 : 1, bk, lvl: 9, gadget: 0, star: 0, name: NAMES[i] }));
    const sim = new Sim({ mode: 'gem', map: 'crystal_cove', seed: 99, slots });
    sim.tile0 = 0;
    return { st: sim, local: 0, aim: { act: 0 }, live: true };
  };
  const simRng = new RNG(5);
  function driveSim(sim) {
    const B = sim.brawlers;
    for (const b of B) {
      if (!b.alive) continue;
      // walk towards the middle with some wandering, shoot at whoever is nearest
      let tx = 10.5 + Math.sin(sim.t * 0.7 + b.slot) * 4, ty = 16.5 + (b.team ? -3 : 3) + Math.cos(sim.t * 0.5 + b.slot) * 3;
      let ang = Math.atan2(ty - b.y, tx - b.x);
      const mag = Math.hypot(tx - b.x, ty - b.y) > 0.6 ? 1 : 0;
      let act = 0;
      if (b.supReady && simRng.chance(0.05)) act = ACT.SUPER;
      else if (b.ammo >= 1 && simRng.chance(0.06)) act = ACT.ATTACK;
      else if (b.gadLeft > 0 && simRng.chance(0.004)) act = ACT.GADGET;
      sim.setInput(b.slot, packIn(ang, mag, 0, 0.8, act, 1));
    }
    sim.step();
    for (const ev of sim.events) View.onEvent(ev, sim);
    sim.events.length = 0;
  }

  // advance a fake state by one tick (shots fly, lobs arc, timers count down)
  function tickFake(st) {
    st.tick++;
    st.t = st.tick * SIM_DT;
    for (const s of st.shots) {
      s.px = s.x; s.py = s.y;
      if (s.beam > 0) { s.ttl -= SIM_DT; if (s.ttl <= 0) s.ttl = 0.15; continue; }
      if (s.lob) {
        const L = s.lob;
        L.t += SIM_DT;
        if (L.t > L.T) { L.t = 0; s.x = s.px = s.x0; s.y = s.py = s.y0; continue; }
        const k = L.t / L.T;
        s.x = s.x0 + (L.tx - s.x0) * k;
        s.y = s.y0 + (L.ty - s.y0) * k;
        continue;
      }
      s.x += Math.cos(s.ang) * s.spd * SIM_DT * 0.25;
      s.y += Math.sin(s.ang) * s.spd * SIM_DT * 0.25;
      s.trav += s.spd * SIM_DT * 0.25;
      if (s.trav > 2) { s.x = s.px = s.x - Math.cos(s.ang) * s.trav; s.y = s.py = s.y - Math.sin(s.ang) * s.trav; s.trav = 0; }
    }
    for (const a of st.areas) { a.t -= SIM_DT; if (a.t <= 0) a.t = a.T; }
    for (const b of st.brawlers) { b.px = b.x; b.py = b.y; }
  }

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const R = window.__R = {
    mods: { Art, FX, View },
    scenarios: Object.keys(SC),
    hasSim: HAS_SIM, hasB: HAS_B,
    cur: null,
    setup(name, w, h, dpr) {
      const d = View.resize(w, h, dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(h * d);
      nextId = 1;
      const s = SC[name]();
      if (!s) return false;
      View.reset(s.local);
      R.cur = s;
      View.aim = Object.assign({ act: 0, ang: 0, d: 1 }, s.aim);
      if (s.st.events) { for (const ev of s.st.events) View.onEvent(ev, s.st); if (!s.live) s.st.events.length = 0; }
      return true;
    },
    // n frames at 60 fps: two frames per sim tick (alpha 0.5, 1)
    run(n) {
      const s = R.cur, times = [];
      for (let i = 0; i < n; i++) {
        if (i % 2 === 0) { if (s.live) driveSim(s.st); else tickFake(s.st); }
        const t0 = performance.now();
        View.draw(ctx, s.st, s.local, i % 2 ? 1 : 0.5, { dt: 1 / 60, safe: { l: 0, r: 0, t: 0, b: 0 } });
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      return { avg: times.reduce((a, b) => a + b, 0) / times.length, p95: times[Math.floor(times.length * 0.95)], fx: FX.count() };
    },
    // frame rate with real requestAnimationFrame pacing (raster included)
    fps(ms) {
      return new Promise((done) => {
        const s = R.cur;
        let n = 0, i = 0;
        const t0 = performance.now();
        const step = () => {
          if (i++ % 2 === 0) { if (s.live) driveSim(s.st); else tickFake(s.st); }
          View.draw(ctx, s.st, s.local, i % 2 ? 1 : 0.5);
          n++;
          if (performance.now() - t0 < ms) requestAnimationFrame(step);
          else done(n / ((performance.now() - t0) / 1000));
        };
        requestAnimationFrame(step);
      });
    },
    // Art sheet: every brawler in four poses, its portrait, the units, pickups and shot sprites
    sheet() {
      const T = 72, cw = T * 1.5;
      canvas.width = Math.round(cw * 17 + 20);
      canvas.height = Math.round(T * 1.9 * 5 + T * 3.6);
      canvas.style.width = canvas.width + 'px';
      canvas.style.height = canvas.height + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#e9b778';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const angs = [0.35, Math.PI - 0.6, -Math.PI / 2 - 0.3, Math.PI / 2];
      const all = KEYS.concat(['bramble.bear', 'gizmo.turret']);
      all.forEach((k, i) => {
        const x = 10 + cw * 0.5 + i * cw;
        angs.forEach((a, r) => {
          const y = T * 1.6 + r * T * 1.75;
          Art.ring(ctx, x, y, T, r & 1, r === 0, 0, 0);
          Art.brawler(ctx, k, x, y, T, a, r * 0.2 + i * 0.1, 0, r === 3 ? Art.F.WALK : r === 1 ? Art.F.ATK : 0);
        });
        if (KEYS.includes(k)) ctx.drawImage(Art.portrait(k, T * 1.2), x - T * 0.6, T * 1.6 + 4 * T * 1.75 - T * 0.9);
      });
      // pickups, icons and shot sprites along the bottom
      const y = canvas.height - T * 1.0;
      let x = 10 + T * 0.5;
      for (const p of [PICK.GEM, PICK.CUBE, PICK.STAR]) { Art.pickup(ctx, { id: p, pick: p, n: 1, t: 2 }, x, y, T, 0.3); x += T; }
      Art.ball(ctx, x, y, 0, T, 0, 0.4); x += T;
      const pks = ['nova.atk', 'dax.atk', 'brick.atk', 'bramble.atk', 'pip.atk', 'pip.sup', 'melody.atk', 'sizzle.atk', 'gizmo.atk', 'gizmo.tshot', 'hawk.atk', 'hawk.nade', 'frost.atk', 'frost.sup', 'shade.sup', 'zip.atk', 'specter.atk', 'thorn.atk', 'thorn.spike', 'thorn.sup', 'dax.sup', 'nova.sup'];
      for (const pk of pks) {
        Art.shot(ctx, { id: 1, pk, sup: pk.endsWith('.sup'), r: pk === 'frost.sup' ? 0.9 : pk.includes('wave') || pk === 'bramble.atk' || pk === 'melody.atk' || pk === 'shade.sup' ? 0.5 : 0.18 }, x, y, 0.3, -0.3, T, 0);
        x += T * 0.8;
      }
    },
  };
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block}</style></head>
<body><canvas id="c"></canvas><script>
window.__errors = [];
window.onerror = (m, s, l) => { window.__errors.push(m + ' @' + l); };
(function () {
${code}
(${pageMain.toString()})();
})();
</script></body></html>`;
const pagePath = path.join(outDir, 'render-test.html');
fs.writeFileSync(pagePath, html);
if (process.env.BS_PAGE_ONLY) { console.log('page: ' + pagePath); process.exit(0); }

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const results = [];
  const sizes = [
    { tag: 'phone', w: 844, h: 390, dpr: 2 },
    { tag: 'hd', w: 1280, h: 720, dpr: 1 },
  ];
  for (const sz of sizes) {
    const ctx = await browser.newContext({ viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: sz.dpr });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${sz.tag}] pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${sz.tag}] console: ${m.text()}`); });
    await page.goto('file://' + pagePath);
    const info = await page.evaluate(() => (window.__R ? { sc: window.__R.scenarios, sim: window.__R.hasSim, data: window.__R.hasB } : null));
    if (!info) { errors.push('page did not start: ' + JSON.stringify(await page.evaluate(() => window.__errors))); await ctx.close(); continue; }
    if (sz.tag === 'phone') console.log(`brawler data: ${info.data ? 'yes' : 'no'}, real sim: ${info.sim ? 'yes' : 'no'}`);
    const list = sz.tag === 'phone' ? info.sc : ['gem', 'ko', 'sd', 'bounty'];
    for (const name of list) {
      const ok = await page.evaluate(([n, w, h, d]) => window.__R.setup(n, w, h, d), [name, sz.w, sz.h, sz.dpr]);
      if (!ok) continue;
      const frames = name === 'sim' ? 900 : name === 'fx' ? 14 : 90;
      const r = await page.evaluate((n) => window.__R.run(n), frames);
      const pe = await page.evaluate(() => window.__errors.splice(0));
      for (const e of pe) errors.push(`[${sz.tag}/${name}] ${e}`);
      await page.screenshot({ path: path.join(outDir, `${sz.tag}-${name}.png`) });
      results.push({ size: sz.tag, scene: name, avg: r.avg, p95: r.p95, fx: r.fx });
      console.log(`${sz.tag.padEnd(5)} ${name.padEnd(8)} draw avg ${r.avg.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms, particles ${r.fx}`);
    }
    if (sz.tag === 'phone') {
      // frame pacing, then the same under 4x CPU throttling (a mid/low phone)
      await page.evaluate(([w, h, d]) => window.__R.setup('gem', w, h, d), [sz.w, sz.h, sz.dpr]);
      const fps = await page.evaluate(() => window.__R.fps(2000));
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.evaluate(([w, h, d]) => window.__R.setup(window.__R.hasSim ? 'sim' : 'gem', w, h, d), [sz.w, sz.h, sz.dpr]);
      const thr = await page.evaluate(() => window.__R.run(240));
      const fpsT = await page.evaluate(() => window.__R.fps(3000));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      console.log(`phone fps (rAF, gem): ${fps.toFixed(1)}; 4x throttled: draw avg ${thr.avg.toFixed(2)} ms, p95 ${thr.p95.toFixed(2)} ms, fps ${fpsT.toFixed(1)}`);
      if (fpsT < 30) errors.push(`FAILED: under 4x CPU throttling the view runs at ${fpsT.toFixed(1)} fps (< 30)`);
      // art sheet
      await page.evaluate(() => window.__R.sheet());
      await page.setViewportSize({ width: await page.evaluate(() => document.getElementById('c').width), height: await page.evaluate(() => document.getElementById('c').height) });
      await (await page.$('canvas')).screenshot({ path: path.join(outDir, 'sheet.png') });
      const pe = await page.evaluate(() => window.__errors.splice(0));
      for (const e of pe) errors.push(`[sheet] ${e}`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log('screenshots in ' + outDir);
  if (errors.length) {
    console.log('\n' + errors.length + ' problem(s):\n' + errors.slice(0, 30).join('\n'));
    process.exit(1);
  }
  console.log('render test: OK');
})();
