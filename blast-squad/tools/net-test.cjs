// End-to-end friendly-battle test: starts a local PeerJS signaling server, opens the built game on two
// landscape "phones" (touch), hosts a room from the Friends panel, joins it by code on the other phone,
// starts, and lets both brawlers play on autopilot (the host's sim is sped up for the long part).
// Passes: (1) Gem Rush with ?lag=150&loss=5, played to the end; (2) Blast Ball (goal freezes) with lag,
// if that mode exists yet; (3) a short pass without lag: away/AI takeover and the host leaving.
// Checks: same winner on both result screens, the guest's prediction error (its predicted position for
// an input vs. the host's position after that input, and its shown position vs. the host's at the same
// moment), snapshot sizes, page errors.
// Needs the `peer` package: npm install --prefix /tmp/peer peer
// Usage: NODE_PATH=$(npm root -g):/tmp/peer/node_modules node blast-squad/tools/net-test.cjs [shots-dir] [--quick]
const { chromium } = require('playwright');
const { PeerServer } = require('peer');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const shots = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const quick = process.argv.includes('--quick');
if (shots) fs.mkdirSync(shots, { recursive: true });
const PORT = 9127;
const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL - ' + m); };
const ok = (m) => console.log('ok - ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = PeerServer({ port: PORT, host: '127.0.0.1', path: '/' });
  await sleep(500);
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection', '--autoplay-policy=no-user-gesture-required'] });

  const mk = async (name, q) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => fail(name + ' page error: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') fail(name + ' console error: ' + m.text()); });
    await page.goto('file://' + path.join(root, 'index.html') + `?signal=127.0.0.1:${PORT}&ice=none` + (q || ''));
    await page.waitForTimeout(700);
    await page.evaluate((n) => { const s = window.__BS.save(); s.name = n; }, name);
    return page;
  };
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };

  // Host a room from the Friends panel, join it by code, start. Returns the guest slot.
  async function connect(host, guest, mode, sameTeam, tag) {
    for (const p of [host, guest]) { await p.click('[data-go="friends"]'); await p.waitForTimeout(250); }
    await host.click(`[data-fm="${mode}"]`);
    await host.click(`[data-ft="${sameTeam ? 1 : 0}"]`);
    await host.click('[data-host]');
    await host.waitForFunction(() => window.__BS.friend().st && window.__BS.friend().st.code, null, { timeout: 15000 });
    const code = await host.evaluate(() => window.__BS.friend().st.code);
    ok(`${tag}: room ${code}`);
    await shot(host, tag + '-1-host-room');
    await guest.fill('#fcode', code);
    await guest.click('[data-join]');
    await host.waitForFunction(() => window.__BS.friend().st.canStart, null, { timeout: 20000 });
    await guest.waitForFunction(() => window.__BS.friend().st.friend, null, { timeout: 10000 });
    const names = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__BS.friend().st.friend.name)));
    if (names[0] !== 'Guesty' || names[1] !== 'Hosty') fail(`${tag}: hello names ${names.join('/')}`); else ok(`${tag}: hello exchanged`);
    await shot(guest, tag + '-2-guest-lobby');
    await host.click('[data-fs]');
    await host.waitForFunction(() => window.__BS.match() && window.__BS.match().net === 'host', null, { timeout: 15000 });
    await guest.waitForFunction(() => window.__BS.match() && window.__BS.match().net === 'guest' && window.__BS.match().ready, null, { timeout: 15000 });
    const gs = await guest.evaluate(() => window.__BS.match().local);
    ok(`${tag}: both phones in the match (guest slot ${gs})`);
    return gs;
  }

  const netStats = (p) => p.evaluate(() => window.__BS.net());
  const sizeLine = (h) => {
    const s = h.sizes.slice().sort((a, b) => a - b);
    return { mean: Math.round(h.bytes / Math.max(1, h.n)), p95: s[Math.floor(s.length * 0.95)] || 0, max: h.max, n: h.n };
  };
  const results = async (host, guest) => Promise.all([
    host.evaluate(() => { const m = window.__BS.match(); return m && m.sim.result ? { winner: m.sim.result.winner, reason: m.sim.result.reason, head: (document.querySelector('.res-h') || {}).textContent } : null; }),
    guest.evaluate(() => { const m = window.__BS.match(); return m && m.state.result ? { winner: m.state.result.winner, reason: m.state.result.reason, head: (document.querySelector('.res-h') || {}).textContent } : null; }),
  ]);

  // ---------------- pass 1: Gem Rush with lag and loss, to the end ----------------
  async function fullMatch(mode, tag, normalSecs, rematch) {
    const q = '&lag=150&loss=5';
    const host = await mk('Hosty', q), guest = await mk('Guesty', q);
    await connect(host, guest, mode, mode === 'gem', tag);
    await host.evaluate(() => window.__BS.autoplay(0.6));
    await guest.evaluate(() => window.__BS.autoplay(0.6));
    let froze = false, gemsSeen = false, shotsSeen = 0;
    const gap = [];
    const t0 = Date.now();
    while (Date.now() - t0 < normalSecs * 1000) {
      await sleep(500);
      // the guest's brawler as the guest shows it vs. as the host has it, at (nearly) the same moment
      const [hp, gp] = await Promise.all([
        host.evaluate(() => { const m = window.__BS.match(); const b = m && m.sim.brawlers[m.sync.gs]; return b && b.alive ? [b.x, b.y] : null; }),
        guest.evaluate(() => { const m = window.__BS.match(); const b = m && m.me; return b && b.alive ? [b.x, b.y] : null; }),
      ]);
      if (hp && gp && Math.hypot(hp[0] - gp[0], hp[1] - gp[1]) < 4) gap.push(Math.hypot(hp[0] - gp[0], hp[1] - gp[1]));
      const g = await guest.evaluate(() => { const m = window.__BS.match(); if (!m || !m.state) return null; const s = m.state; return { f: s.freezeT, shots: s.shots.length, picks: s.pickups.length, over: s.over }; });
      if (!g) break;
      if (g.f > 0) froze = true;
      if (g.picks > 0) gemsSeen = true;
      shotsSeen = Math.max(shotsSeen, g.shots);
      if (g.over) break;
    }
    await shot(host, tag + '-3-host');
    await shot(guest, tag + '-4-guest');
    const gn = await netStats(guest), hn = await netStats(host);
    const sz = sizeLine(hn);
    console.log(`  ${tag}: rtt ${Math.round(gn.rtt)} ms, interpolation delay ${Math.round(gn.delay)} ms, jitter ${Math.round(gn.jitter)} ms`);
    console.log(`  ${tag}: guest prediction error mean ${gn.mean.toFixed(3)} tiles, max ${gn.max.toFixed(2)} (${gn.n} samples)`);
    console.log(`  ${tag}: snapshots ${sz.n}, size mean ${sz.mean} B, p95 ${sz.p95} B, max ${sz.max} B`);
    const gapMean = gap.length ? gap.reduce((x, y) => x + y, 0) / gap.length : 0;
    console.log(`  ${tag}: guest's brawler on the guest vs on the host at the same moment: ${gapMean.toFixed(2)} tiles on average (${gap.length} samples; it runs ahead by about half a round trip)`);
    if (gapMean > 1) fail(`${tag}: the guest's brawler is ${gapMean.toFixed(2)} tiles from the host's on average`);
    if (gn.n < 20) fail(`${tag}: too few prediction samples (${gn.n})`);
    else if (gn.mean > 1) fail(`${tag}: guest prediction is off by ${gn.mean.toFixed(2)} tiles on average`); else ok(`${tag}: prediction within a tile on average`);
    if (sz.mean > 1200) fail(`${tag}: snapshots average ${sz.mean} B`); else ok(`${tag}: snapshots average ${sz.mean} B (< 1.2 KB)`);
    if (shotsSeen === 0) fail(`${tag}: the guest never saw a projectile`); else ok(`${tag}: guest flies projectiles (up to ${shotsSeen} at once)`);
    if (mode === 'gem' && !gemsSeen) fail(`${tag}: the guest never saw a gem`);
    // the rest of the match at speed on the host (the guest follows the faster clock)
    await host.evaluate(() => window.__BS.speed(4));
    const t1 = Date.now();
    for (;;) {
      const done = await Promise.all([host.$('#result.show'), guest.$('#result.show')]);
      if (done[0] && done[1]) break;
      if (Date.now() - t1 > 300000) { fail(`${tag}: no result screens within 5 min`); break; }
      if (mode === 'ball' && !froze) froze = await guest.evaluate(() => { const m = window.__BS.match(); return !!(m && m.state && m.state.freezeT > 0); });
      await sleep(400);
    }
    await sleep(500);
    await shot(host, tag + '-5-host-result');
    await shot(guest, tag + '-6-guest-result');
    const [hr, gr] = await results(host, guest);
    console.log(`  ${tag}: host result ${JSON.stringify(hr)}, guest result ${JSON.stringify(gr)}`);
    if (!hr || !gr || hr.winner !== gr.winner) fail(`${tag}: results differ`); else ok(`${tag}: same winner on both phones (${hr.winner}, ${hr.reason})`);
    const friendly = await Promise.all([host, guest].map((p) => p.evaluate(() => /no trophies/i.test(document.querySelector('#result').textContent))));
    if (!friendly[0] || !friendly[1]) fail(`${tag}: result screen is not marked friendly`);
    if (mode === 'ball') { if (froze) ok(`${tag}: the guest saw a goal freeze`); else fail(`${tag}: no freeze seen on the guest`); }
    const tro = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__BS.save().stats.played)));
    if (tro[0] || tro[1]) fail(`${tag}: a friendly match was counted (${tro})`);
    for (const p of [host, guest]) { const le = await p.evaluate(() => window.__lastError || null); if (le) fail(`${tag}: game error: ${le}`); }
    if (rematch) {
      // both go back to the room from the result screen and the host starts another match
      await guest.click('#ra');
      await host.click('#ra');
      const ready = await host.waitForFunction(() => window.__BS.friend().st.canStart, null, { timeout: 10000 }).then(() => true, () => false);
      if (!ready) fail(`${tag}: host can't start a rematch`);
      else {
        await host.click('[data-fs]');
        const again = await guest.waitForFunction(() => window.__BS.match() && window.__BS.match().net === 'guest' && window.__BS.match().ready, null, { timeout: 15000 }).then(() => true, () => false);
        if (again) ok(`${tag}: back to the room and a rematch starts on both phones`); else fail(`${tag}: rematch did not start on the guest`);
        await host.evaluate(() => window.__BS.Game.leave());
        await guest.waitForFunction(() => !window.__BS.match(), null, { timeout: 15000 }).catch(() => fail(`${tag}: guest stuck after the host left the rematch`));
      }
    } else {
      await host.click('#rx');
      await guest.click('#rx');
    }
    await host.context().close();
    await guest.context().close();
  }

  await fullMatch('gem', 'gem-lag', quick ? 12 : 25, true);

  // ---------------- pass 2: a mode with freezes (Blast Ball), if it exists ----------------
  const probe = await mk('Probe');
  const ball = await probe.evaluate(() => window.__BS.modes().includes('ball') && window.__BS.Meta.mapsFor('ball').length > 0);
  await probe.context().close();
  if (!ball) console.log('  (Blast Ball is not implemented yet: freeze pass skipped)');
  else if (!quick) await fullMatch('ball', 'ball-lag', 15);

  // ---------------- pass 3: no lag, away and leaving ----------------
  {
    const host = await mk('Hosty'), guest = await mk('Guesty');
    const gs = await connect(host, guest, 'gem', false, 'nolag');
    await host.evaluate(() => window.__BS.autoplay(0.6));
    await guest.evaluate(() => window.__BS.autoplay(0.6));
    await sleep(quick ? 6000 : 10000);
    const gn = await netStats(guest), hn = await netStats(host);
    const sz = sizeLine(hn);
    console.log(`  nolag: rtt ${Math.round(gn.rtt)} ms, delay ${Math.round(gn.delay)} ms, prediction error mean ${gn.mean.toFixed(3)} max ${gn.max.toFixed(2)} (${gn.n}), snapshots mean ${sz.mean} B p95 ${sz.p95} B max ${sz.max} B`);
    if (gn.mean > 0.5) fail(`nolag: prediction error ${gn.mean.toFixed(2)} tiles`); else ok('nolag: prediction error small');
    // the guest stops sending: the host's AI takes the brawler after 2 s, and gives it back
    await guest.evaluate(() => { window.__BS.match().paused = true; });
    await sleep(3000);
    const away = await host.evaluate((gs) => !!window.__BS.match().ctrls[gs].bot, gs);
    await guest.evaluate(() => { window.__BS.match().paused = false; });
    await sleep(1500);
    const back = await host.evaluate((gs) => !window.__BS.match().ctrls[gs].bot, gs);
    if (away && back) ok('nolag: AI holds the brawler while the friend is away, and gives it back'); else fail(`nolag: away ${away}, back ${back}`);
    // the host leaves: the guest's match is cancelled and it goes back to the lobby
    await host.evaluate(() => window.__BS.Game.leave());
    await guest.waitForFunction(() => !window.__BS.match() && document.querySelector('#lobby.show'), null, { timeout: 15000 }).catch(() => {});
    const gone = await guest.evaluate(() => ({ match: !!window.__BS.match(), lobby: !!document.querySelector('#lobby.show'), toast: document.querySelector('#toast').textContent }));
    if (!gone.match && gone.lobby) ok(`nolag: the guest is back in the lobby after the host left ("${gone.toast}")`); else fail('nolag: guest still in the match after the host left ' + JSON.stringify(gone));
    for (const p of [host, guest]) { const le = await p.evaluate(() => window.__lastError || null); if (le) fail(`nolag: game error: ${le}`); }
    await host.context().close();
    await guest.context().close();
  }

  await browser.close();
  try { server.close && server.close(); } catch (e) { /* ignore */ }
  console.log(errors.length ? `net test FAILED (${errors.length})` : 'net test passed');
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
