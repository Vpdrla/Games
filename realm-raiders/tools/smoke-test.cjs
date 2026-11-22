// Smoke test: opens the built game in a phone-sized landscape browser with touch, walks through the
// menus and panels, plays an adventure and an arena match on autopilot at high speed, checks the
// results and the save, and fails on any page error. Saves screenshots.
// Usage: NODE_PATH=$(npm root -g) node realm-raiders/tools/smoke-test.cjs [shots-dir] [--desktop]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(require('node:os').tmpdir(), 'rr-smoke');
const desktop = process.argv.includes('--desktop');
fs.mkdirSync(outDir, { recursive: true });
const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL - ' + m); };
const ok = (m) => console.log('ok - ' + m);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(desktop ? { viewport: { width: 1280, height: 720 } } : { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail('page error: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error') fail('console error: ' + m.text()); });
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForTimeout(1200);
  const shot = (n) => page.screenshot({ path: path.join(outDir, (desktop ? 'd-' : 'm-') + n + '.png') });
  const has = (sel) => page.$(sel).then((e) => !!e);
  if (await has('#menu.show .mode.adv')) ok('main menu shows'); else fail('no main menu');
  await shot('01-menu');
  for (const p of ['heroes', 'gear', 'camp', 'ach', 'quests', 'settings', 'help', 'online']) {
    await page.evaluate((n) => { window.__RR.UI.closePanels(); window.__RR.UI.open(n); }, p);
    await page.waitForTimeout(200);
    if (await has('#panel.show .pbox')) ok('panel ' + p); else fail('panel ' + p);
    await shot('02-' + p);
  }
  await page.evaluate(() => { window.__RR.UI.closePanels(); window.__RR.UI.open('hero', 'ember'); });
  await page.waitForTimeout(200); await shot('03-hero');
  await page.evaluate(() => { const M = window.__RR.Meta; M.s.gold += 5000; window.__RR.UI.closePanels(); window.__RR.UI.open('hero', 'rime'); });
  await page.click('[data-act="unlock"]');
  const unlocked = await page.evaluate(() => window.__RR.Meta.s.heroes.rime.unlocked);
  if (unlocked) ok('unlock a hero with gold'); else fail('could not unlock rime');
  await page.evaluate(() => { const M = window.__RR.Meta; const it = M.makeItem(10, 2, 0, 'weapon'); M.addItem(it); window.__RR.UI.closePanels(); window.__RR.UI.open('item', it.uid); });
  await page.waitForTimeout(150); await shot('04-item');
  await page.click('[data-act="equip"]');
  await page.click('[data-act="upgrade"]');
  const up = await page.evaluate(() => { const M = window.__RR.Meta; const id = M.hero(M.s.sel).gear.weapon; return M.item(id).up; });
  if (up === 1) ok('equip and upgrade an item'); else fail('upgrade failed: ' + up);
  // adventure setup and run
  await page.evaluate(() => { window.__RR.UI.closePanels(); window.__RR.UI.showMenu(); });
  await page.click('.mode.adv');
  await page.waitForTimeout(250);
  await shot('05-setup');
  await page.click('[data-act="start"]');
  await page.waitForTimeout(1600);
  await shot('06-play');
  await page.evaluate(() => { window.__RR.Game.autopilot = true; window.__RR.Game.speed = 6; });
  let seenOffer = false, seenBoss = false;
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => { const G = window.__RR.Game; const w = G.world; return { scene: G.scene, phase: w && w.mode.phase, room: w && w.mode.roomIdx, offers: !!document.querySelector('#offers.show'), boss: !!(w && w.mode.boss && !w.mode.boss.dead) }; });
    if (st.offers && !seenOffer) { seenOffer = true; await shot('07-offers'); }
    if (st.boss && !seenBoss) { seenBoss = true; await page.evaluate(() => { window.__RR.Game.speed = 1; }); await page.waitForTimeout(1500); await shot('08-boss'); await page.evaluate(() => { window.__RR.Game.speed = 6; }); }
    if (i === 6) await shot('06b-fight');
    if (st.scene === 'results') break;
  }
  await page.waitForTimeout(400);
  if (await has('#results.show')) ok('adventure reached the results screen'); else fail('no results screen');
  await shot('09-results');
  const save = await page.evaluate(() => { const s = window.__RR.Meta.s; return { runs: s.stats.runs, kills: s.stats.kills, lvl: s.heroes[s.sel].lvl, items: s.items.length, ach: Object.keys(s.ach).length }; });
  if (save.runs === 1 && save.kills > 50) ok('run saved: ' + JSON.stringify(save)); else fail('save after run: ' + JSON.stringify(save));
  // arena
  await page.click('[data-act="tomenu"]');
  await page.waitForTimeout(300);
  await page.click('.mode.are');
  await page.waitForTimeout(200);
  await page.click('[data-act="arenasize"][data-arg="2:2"]');
  await page.click('[data-act="start"]');
  await page.waitForTimeout(1500);
  await shot('10-arena');
  await page.evaluate(() => { window.__RR.Game.autopilot = true; window.__RR.Game.speed = 6; });
  for (let i = 0; i < 120; i++) { await page.waitForTimeout(500); if (await page.evaluate(() => window.__RR.Game.scene === 'results')) break; }
  await page.waitForTimeout(400);
  if (await has('#results.show')) ok('arena reached the results screen'); else fail('arena did not finish');
  await shot('11-arena-results');
  // pause menu
  await page.click('[data-act="tomenu"]');
  await page.click('.mode.adv');
  await page.click('[data-act="start"]');
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__RR.Game.togglePause());
  await page.waitForTimeout(200);
  if (await has('#pause.show')) ok('pause menu'); else fail('pause menu');
  await shot('12-pause');
  await page.click('[data-act="abandon"]');
  await page.click('.dialog [data-arg="1"]');
  await page.waitForTimeout(800);
  if (await has('#results.show')) ok('leaving a run shows results'); else fail('abandon failed');
  await browser.close();
  console.log(errors.length ? `\n${errors.length} problem(s)` : '\nall good');
  process.exit(errors.length ? 1 : 0);
})();
