// Online sync test without a network: a host world and a guest mirror joined by an in-memory link
// with latency. Checks the lobby handshake, snapshots, guest input reaching the host, blessing
// offers and picks, loot and the end of the run.
// Usage: node realm-raiders/tools/net-test.cjs
const { load } = require('./load.cjs');
const A = load({ upTo: '11-sync.js', names: ['World', 'RunMode', 'HeroBot', 'HostSync', 'GuestSync', 'Mirror', 'mockLinkPair', 'SIM_DT', 'GAME_VER'],
  extra: { location: { search: '' } } });
const fails = [];
const check = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails.push(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const [hl, gl] = A.mockLinkPair(0);
  const hostGame = { world: null, left: 0, onGuestLeft() { this.left++; }, onLobbyChange() {}, playerBySlot(s) { return this.world.players.find((p) => p.slot === s); } };
  const guestGame = { slot: -1, offers: [], loot: [], ended: null, started: null,
    onWelcome(s) { this.slot = s; }, onLobby() {}, onGuestStart(m, mirror) { this.started = m; this.mirror = mirror; },
    onOffer(m) { this.offers.push(m); }, onLoot(i, b) { this.loot.push([i, b]); }, onGuestEnd(m) { this.ended = m; }, onEmote() {}, onHostLeft() {} };
  const host = new A.HostSync(hostGame);
  const g = host.addGuest(hl);
  const guest = new A.GuestSync(guestGame, gl);
  gl.send({ t: 'hello', v: A.GAME_VER, name: 'Friend', info: { hero: 'ember', lvl: 3, load: { mods: {}, uniq: [] }, luck: 0, rerolls: 1, ankh: false } });
  await sleep(100);
  check(guestGame.slot === 1, 'guest gets slot 1');
  check(g.info && g.info.hero === 'ember', 'host knows the guest hero');
  // start a run: host bot + remote guest
  const w = new A.World({ seed: 9 });
  hostGame.world = w;
  w.mode = new A.RunMode(w, { kind: 'adventure', realm: 1, diff: 0 });
  w.mode.next = { type: 'combat', reward: 'gear' };
  const players = [
    { slot: 0, kind: 'bot', name: 'Host', hero: 'brand', lvl: 5, load: { mods: {}, uniq: [] }, team: 0, bot: new A.HeroBot(2, 1), rerolls: 0 },
    Object.assign({ slot: 1, kind: 'remote', name: 'Friend', team: 0 }, g.info),
  ];
  w.players = players;
  for (const p of players) w.spawnHero(p, 700, 800);
  host.broadcast({ t: 'start', cfg: { mode: 'adventure', realm: 1, diff: 0 }, players: players.map((p) => ({ slot: p.slot, name: p.name, hero: p.hero, kind: p.kind })) });
  await sleep(80);
  check(!!guestGame.mirror, 'guest started a mirror');
  const mirror = guestGame.mirror;
  const inp = { mx: 0, my: 0, skill: false, ult: false, dash: false, aim: null, aimD: 0 };
  let maxErr = 0, picked = 0, steps = 0, inputMoved = false;
  const hist = new Map();
  const phases = {};
  const startX = players[1].unit.x;
  const t0 = Date.now();
  while (!w.mode.result && steps < 60 * 60 * 12) {
    // the guest: walk in a circle, fire the skill now and then, pick blessings
    const tt = steps / 60;
    inp.mx = Math.cos(tt * 0.7); inp.my = Math.sin(tt * 0.7);
    if (steps % 240 === 0) inp.skill = true;
    // steer the remote hero roughly towards foes so the run progresses (host-side helper bot for the test)
    if (steps > 600) { const hb = players[1].hb || (players[1].hb = new A.HeroBot(2, 5)); const saved = Object.assign({}, players[1].unit.input); hb.think(w, players[1].unit, A.SIM_DT); const u = players[1].unit.input; inp.mx = u.mx; inp.my = u.my; Object.assign(players[1].unit.input, saved); }
    guest.input(inp, A.SIM_DT);
    for (const p of players) if (p.kind === 'bot') p.bot.think(w, p.unit, A.SIM_DT);
    w.step();
    const e = w.ev; w.ev = [];
    host.afterStep(w, e);
    steps++;
    phases[w.mode.phase] = (phases[w.mode.phase] || 0) + 1;
    if (steps % 4 === 0) { const m = new Map(); for (const u of w.units) m.set(u.id, [u.x, u.y]); hist.set(w.tick, m); if (hist.size > 200) hist.delete(hist.keys().next().value); }
    if (steps === 120 && Math.abs(players[1].unit.x - startX) > 20) inputMoved = true;
    if (steps % 2 === 0) await sleep(0);
    if (guestGame.offers.length > picked) { gl.send({ t: 'pick', idx: 0 }); picked++; }
    if (steps % 120 === 0 && mirror.units.length) {
      mirror.frame(performance.now(), 0, null);
      const at = hist.get(mirror.lastK);
      if (at) for (const m of mirror.units) { const h = at.get(m.id); if (h) maxErr = Math.max(maxErr, Math.hypot(m.sx1 - h[0], m.sy1 - h[1])); }
    }
  }
  await sleep(200);
  console.log('phases (s):', JSON.stringify(Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, Math.round(v / 60)]))), 'label', w.mode.label());
  if (!w.mode.result) w.mode.finish(false);
  check(inputMoved, 'guest input moves its hero on the host');
  check(mirror.units.length > 0 && mirror.room, 'mirror has units and a room');
  check(maxErr < 2, 'mirror positions track the host (max snapshot error ' + Math.round(maxErr) + ')');
  check(picked > 0 && players[1].unit.blessN === picked, 'guest blessing picks apply on the host (' + picked + ' picks, ' + players[1].unit.blessN + ' blessings)');
  check(guestGame.loot.length > 0, 'guest receives loot rolls (' + guestGame.loot.length + ')');
  host.broadcast({ t: 'end', res: w.mode.result, ws: w.stats });
  await sleep(100);
  check(!!guestGame.ended && !!w.mode.result, 'guest gets the end of the run (' + (w.mode.result && w.mode.result.win ? 'win' : 'loss') + ', ' + w.stats.rooms + ' rooms)');
  const bytes = JSON.stringify(A.World ? {} : {}).length;
  hl.close('bye');
  await sleep(50);
  check(hostGame.left === 1, 'host notices the guest leaving');
  console.log('sim seconds', (steps / 60).toFixed(0), 'wall ms', Date.now() - t0);
  console.log(fails.length ? fails.length + ' failure(s)' : 'all good');
  process.exit(fails.length ? 1 : 0);
})();
