// Smoke test: opens the built game in a phone-sized landscape browser with touch, walks through the
// menus, plays a match with the local brawler on autopilot, checks the result screen and the save,
// and fails on any page error. Saves screenshots.
// Usage: NODE_PATH=$(npm root -g) node blast-squad/tools/smoke-test.cjs [shots-dir] [--modes=gem,sd,...]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(require('node:os').tmpdir(), 'bs-smoke');
const modesArg = (process.argv.find((a) => a.startsWith('--modes=')) || '').slice(8);
fs.mkdirSync(outDir, { recursive: true });
const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL - ' + m); };
const ok = (m) => console.log('ok - ' + m);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail('page error: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') fail('console error: ' + m.text()); });
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForTimeout(800);
  const shot = (n) => page.screenshot({ path: path.join(outDir, n + '.png') });
  const has = (sel) => page.$(sel).then((e) => !!e);

  // ---- lobby ----
  if (await has('#lobby.show #play')) ok('lobby shows a PLAY button'); else fail('no lobby');
  await shot('01-lobby');
  // ---- panels ----
  for (const p of ['brawlers', 'road', 'pass', 'shop', 'quests', 'friends', 'settings', 'events']) {
    await page.evaluate((n) => window.__BS.UI.open(n), p);
    await page.waitForTimeout(250);
    if (await has('#panel.show')) ok('panel ' + p); else fail('panel ' + p + ' did not open');
    await shot('02-' + p);
  }
  await page.evaluate(() => window.__BS.UI.open('brawler', 'nova'));
  await page.waitForTimeout(250);
  await shot('03-brawler-nova');
  // give resources and upgrade
  await page.evaluate(() => window.__BS.give({ coins: 5000, pp: 5000 }));
  await page.evaluate(() => window.__BS.UI.open('brawler', 'nova'));
  await page.click('[data-up]');
  await page.waitForTimeout(200);
  const lvl = await page.evaluate(() => window.__BS.save().brawlers.nova.lvl);
  if (lvl === 2) ok('upgrade nova to power 2'); else fail('upgrade failed, level ' + lvl);
  // drop opening
  await page.evaluate(() => { window.__BS.save().drops.push('epic'); });
  await page.evaluate(() => window.__BS.UI.openDrops());
  for (let i = 0; i < 6; i++) { if (await has('#dropb')) await page.click('#dropb').catch(() => {}); await page.waitForTimeout(220); }
  await shot('04-drop');
  if (await has('#dropn')) { ok('drop opened'); await page.click('#dropn'); } else fail('drop did not open');
  await page.evaluate(() => window.__BS.UI.showLobby());

  // ---- matches ----
  const modes = modesArg ? modesArg.split(',') : ['gem', 'sd', 'ball', 'ko', 'bounty'];
  for (const mode of modes) {
    const started = await page.evaluate((mode) => {
      const M = window.__BS.Meta, evs = M.events(Date.now());
      // Knockout and Bounty share a rotating slot: play the one that is off rotation through its slot
      let ev = evs.find((e) => e.mode === mode && e.ready);
      if (!ev) { const slot = evs.find((e) => e.ready && (e.mode === 'ko' || e.mode === 'bounty')); if (slot && M.mapsFor(mode).length) ev = Object.assign({}, slot, { mode, map: M.mapsFor(mode)[0] }); }
      if (!ev) return false;
      window.__BS.Game.play(ev, window.__BS.save().sel);
      return true;
    }, mode);
    if (!started) { console.log('  (no ' + mode + ' event with a map yet)'); continue; }
    await page.waitForTimeout(600);
    await shot('05-' + mode + '-matchmaking');
    await page.waitForFunction(() => !!window.__BS.match(), null, { timeout: 15000 }).catch(() => fail(mode + ': match did not start'));
    if (!(await page.evaluate(() => !!window.__BS.match()))) continue;
    ok(mode + ': match started');
    await page.waitForTimeout(1500);
    await shot('06-' + mode + '-match');
    // touch: drag the move stick and tap attack
    await page.touchscreen.tap(740, 298);
    await page.waitForTimeout(400);
    const auto = await page.evaluate(() => window.__BS.autoplay(0.7));
    if (!auto) console.log('  (no Bot yet: the match runs with idle bots)');
    await page.evaluate(() => window.__BS.speed(8));
    const t0 = Date.now();
    await page.waitForFunction(() => document.querySelector('#result.show'), null, { timeout: 240000 }).catch(() => fail(mode + ': no result screen within 4 min'));
    const secs = await page.evaluate(() => (window.__BS.sim() ? window.__BS.sim().t : 0));
    ok(`${mode}: result screen after ${((Date.now() - t0) / 1000).toFixed(0)} s (${secs.toFixed(0)} s of game)`);
    await shot('07-' + mode + '-result');
    const played = await page.evaluate(() => window.__BS.save().stats.played);
    if (played >= 1) ok('save counts the match (' + played + ' played)'); else fail('match not saved');
    await page.click('#rx');
    await page.waitForTimeout(300);
  }
  const last = await page.evaluate(() => window.__lastError || null);
  if (last) fail('game error: ' + last);
  await browser.close();
  console.log(`screenshots in ${outDir}`);
  if (errors.length) { console.log(`smoke test FAILED (${errors.length})`); process.exit(1); }
  console.log('smoke test passed');
})().catch((e) => { console.error(e); process.exit(1); });
