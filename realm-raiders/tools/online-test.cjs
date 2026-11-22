// Two browser tabs play online together over the same-computer transport (?net=bc): lobby, start,
// the guest's view, blessing picks on the guest, and both reaching the results.
// Usage: NODE_PATH=$(npm root -g) node realm-raiders/tools/online-test.cjs [shots-dir]
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = process.argv[2] || path.join(require('node:os').tmpdir(), 'rr-online');
fs.mkdirSync(outDir, { recursive: true });
const fails = [];
const check = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) fails.push(m); };
const PORT = 8000 + Math.floor(Math.random() * 900);

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  for (const [p, n] of [[A, 'host'], [B, 'guest']]) {
    p.on('pageerror', (e) => check(false, n + ' page error: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') check(false, n + ' console error: ' + m.text()); });
    await p.goto(`http://127.0.0.1:${PORT}/index.html?net=bc`);
  }
  await A.waitForTimeout(800);
  await A.evaluate(() => { window.__RR.Meta.s.name = 'Hosty'; window.__RR.UI.open('online'); });
  await A.click('[data-act="host"]');
  await A.waitForSelector('.code');
  const code = (await A.textContent('.code')).trim();
  check(/^[A-Z2-9]{4}$/.test(code), 'host shows a room code ' + code);
  await B.evaluate(() => { window.__RR.Meta.s.name = 'Guesty'; window.__RR.Meta.s.sel = 'ember'; window.__RR.UI.open('online'); });
  await B.fill('#joincode', code);
  await B.click('[data-act="join"]');
  await B.waitForTimeout(800);
  const lobbyA = await A.evaluate(() => window.__RR.UI.online.lobby.players.map((p) => p.name + ':' + p.hero + ':' + p.kind).join(','));
  check(lobbyA.includes('Guesty:ember:guest'), 'host lobby lists the guest: ' + lobbyA);
  const lobbyB = await B.evaluate(() => window.__RR.UI.online && window.__RR.UI.online.step);
  check(lobbyB === 'lobby', 'guest sees the lobby');
  await A.screenshot({ path: path.join(outDir, 'a-lobby.png') });
  await B.screenshot({ path: path.join(outDir, 'b-lobby.png') });
  await A.click('[data-act="onstart"]');
  await A.waitForTimeout(1500);
  check(await B.evaluate(() => window.__RR.Game.scene === 'play' && !!window.__RR.Game.mirror), 'guest is in the game');
  await A.evaluate(() => { window.__RR.Game.autopilot = true; window.__RR.Game.speed = 3; });
  let offersSeen = 0, shotTaken = false;
  for (let i = 0; i < 400; i++) {
    await B.waitForTimeout(500);
    const st = await B.evaluate(() => ({ scene: window.__RR.Game.scene, offers: !!document.querySelector('#offers.show'), units: window.__RR.Game.mirror ? window.__RR.Game.mirror.units.length : 0 }));
    if (st.offers) { offersSeen++; if (offersSeen === 1) await B.screenshot({ path: path.join(outDir, 'b-offers.png') }); await B.click('#offers .bc >> nth=0').catch(() => {}); }
    if (!shotTaken && st.units > 5) { shotTaken = true; await B.screenshot({ path: path.join(outDir, 'b-play.png') }); await A.screenshot({ path: path.join(outDir, 'a-play.png') }); }
    if (st.scene === 'results') break;
  }
  check(offersSeen > 0, 'guest was offered blessings (' + offersSeen + ')');
  const gb = await A.evaluate(() => { const w = window.__RR.Game.world; const p = w && w.players.find((x) => x.slot === 1); return p && p.unit ? p.unit.blessN : -1; });
  check(gb > 0, 'guest blessings applied on the host (' + gb + ')');
  await B.waitForTimeout(800);
  check(await B.evaluate(() => !!document.querySelector('#results.show')), 'guest reaches the results screen');
  check(await A.evaluate(() => !!document.querySelector('#results.show')), 'host reaches the results screen');
  await B.screenshot({ path: path.join(outDir, 'b-results.png') });
  const gs = await B.evaluate(() => ({ runs: window.__RR.Meta.s.stats.runs, online: window.__RR.Meta.s.stats.onlineGames, lvl: window.__RR.Meta.s.heroes.ember.lvl }));
  check(gs.runs === 1 && gs.online === 1, 'guest save updated ' + JSON.stringify(gs));
  // back to the lobby, then the host leaves
  await A.click('[data-act="again"]');
  await B.click('[data-act="tomenu"]');
  await A.waitForTimeout(500);
  check(await B.evaluate(() => window.__RR.UI.cur === 'online' && window.__RR.UI.online.step === 'lobby'), 'guest is back in the lobby');
  await A.evaluate(() => window.__RR.UI.back());
  await B.waitForTimeout(600);
  check(await B.evaluate(() => window.__RR.UI.online.step === 'error' || window.__RR.Game.online === null), 'guest notices the host closing the room');
  await browser.close();
  srv.kill();
  console.log(fails.length ? fails.length + ' failure(s)' : 'all good');
  process.exit(fails.length ? 1 : 0);
})();
