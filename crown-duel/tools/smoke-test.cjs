// Headless smoke test: boots the game on a portrait phone screen, clicks through the menus,
// plays a full battle (a bot drives the player's side), opens chests and upgrades a card.
// Usage: NODE_PATH=$(npm root -g) node crown-duel/tools/smoke-test.cjs [screenshot-dir]
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const shots = process.argv[2] || null;
if (shots) fs.mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };
  const wait = (ms) => page.waitForTimeout(ms);
  const check = async (label) => {
    const last = await page.evaluate(() => window.__lastError || null);
    if (last) errors.push(label + ': ' + last);
    await page.evaluate(() => { window.__lastError = null; });
  };

  await page.goto('file://' + path.join(root, 'index.html'));
  await wait(800);
  await shot('01-home');
  await check('home');

  for (const p of ['cards', 'shop', 'online', 'more', 'battle']) {
    await page.click(`#nav button[data-p="${p}"]`);
    await wait(300);
    await shot('02-page-' + p);
    await check('page ' + p);
  }

  // free chest
  await page.click('#m-free');
  await wait(300);
  for (let i = 0; i < 12; i++) {
    if (await page.$('#c-ok')) break;
    await page.click('#cb');
    await wait(120);
  }
  await shot('03-chest');
  await page.click('#c-ok');
  await check('free chest');

  // a full battle against the AI with a bot playing for us
  await page.click('#b-battle');
  await wait(2200);
  await shot('04-battle-start');
  await page.evaluate(() => { window.__CD.autoplay(0.8); window.__CD.speed(6); });
  await wait(6000);
  await shot('05-battle-mid');
  await check('battle');
  for (let i = 0; i < 60; i++) {
    if (await page.$('#rs-ok')) break;
    await wait(1000);
  }
  await wait(300);
  await shot('06-result');
  await check('result');
  const res = await page.evaluate(() => ({ trophies: window.__CD.save().trophies, stats: window.__CD.save().stats, chests: window.__CD.save().chests }));
  console.log('after battle:', JSON.stringify(res));
  await page.click('#rs-ok');
  await wait(500);

  // training battle + surrender through the menu
  await page.click('#b-train');
  await wait(2200);
  await page.evaluate(() => window.__CD.scene().openMenu());
  await wait(300);
  await shot('07-pause');
  await page.click('#bm-sur');
  await wait(3200);
  await page.click('#rs-ok');
  await wait(400);
  await check('training');

  // chest unlock via gems, card upgrade
  await page.evaluate(() => { const s = window.__CD.save(); s.gems = 999; s.gold = 5000; s.cards.knight.n = 50; });
  const slot = await page.$('.slot.full');
  if (slot) {
    await slot.click();
    await wait(200);
    await page.click('#c-gems');
    await wait(200);
    for (let i = 0; i < 40; i++) { if (await page.$('#c-ok')) break; await page.click('#cb'); await wait(60); }
    await page.click('#c-ok');
  }
  await page.click('#nav button[data-p="cards"]');
  await wait(300);
  await page.click('.cc[data-k="knight"]');
  await wait(200);
  await shot('08-card-info');
  await page.click('#ci-up');
  await wait(600);
  if (await page.$('#kl-ok')) await page.click('#kl-ok');
  const lvl = await page.evaluate(() => window.__CD.save().cards.knight.lvl);
  console.log('knight level after upgrade:', lvl);
  await shot('09-cards');
  await check('cards');

  // manual drag-and-drop of a card in a new battle
  await page.click('#nav button[data-p="battle"]');
  await page.click('#b-battle');
  await wait(2400);
  const v = await page.evaluate(() => { const vw = window.__CD.scene().view; return { c: vw.cards[0], ox: vw.ox, oy: vw.oy, T: vw.T }; });
  const sx = v.c.x + v.c.w / 2, sy = v.c.y + v.c.h / 2;
  await page.evaluate(() => { window.__CD.scene().sim.p[0].elixir = 10; });
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(sx, sy - i * 40);
  await wait(100);
  await shot('10-drag');
  const tx = v.ox + 4 * v.T, ty = v.oy + 22 * v.T;
  await page.mouse.move(tx, ty);
  await page.mouse.up();
  await wait(1500);
  const played = await page.evaluate(() => window.__CD.scene().sim.p[0].plays);
  console.log('cards played by drag:', played);
  await shot('11-played');
  await check('drag');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No errors.');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
