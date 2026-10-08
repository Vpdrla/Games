// Headless smoke test on a portrait phone screen: every menu, a run with level-ups, a chest,
// pause, the thumb joystick, a boss, a frame-rate check with a full horde, death and results.
// Usage: NODE_PATH=$(npm root -g) node dawnkeeper/tools/smoke-test.cjs [screenshot-dir]
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
  const ok = (cond, msg) => { if (!cond) errors.push('FAILED: ' + msg); else console.log('ok -', msg); };

  await page.goto('file://' + path.join(root, 'index.html'));
  await wait(800);
  await shot('01-home');
  await check('home');

  // menus
  await page.click('#h-play');
  await wait(250);
  await shot('02-setup');
  ok(await page.$('#setup .hero.locked .hp'), 'locked heroes show their unlock progress');
  await page.click('#s-back');
  await page.evaluate(() => { window.__DK.save().gold = 5000; });
  await page.click('#h-shop');
  await wait(250);
  await page.click('#shop .pu button[data-k="might"]');
  await page.click('#shop .pu button[data-k="reroll"]');
  await page.click('#shop .pu button[data-k="banish"]');
  await wait(150);
  await shot('03-shop');
  const power = await page.evaluate(() => window.__DK.save().power);
  ok(power.might === 1 && power.reroll === 1 && power.banish === 1, 'buying power-ups');
  await page.click('#sh-back');
  await page.click('#h-codex');
  await wait(200);
  await shot('04-codex-weapons');
  await page.click('#cx-tabs button[data-t="e"]');
  await wait(200);
  await shot('05-codex-monsters');
  await page.click('#cx-back');
  await page.click('#h-ach');
  await wait(200);
  await shot('06-achievements');
  await page.click('#a-back');
  await page.click('#h-set');
  await wait(200);
  await shot('07-settings');
  await page.click('#o-ok');
  await page.click('#h-daily');
  await wait(200);
  await shot('08-daily');
  await page.click('#d-no');
  await wait(200);
  await check('menus');

  // a run
  await page.click('#h-play');
  await wait(200);
  await page.click('#s-go');
  await wait(800);
  await shot('09-run-start');
  // the thumb joystick: drag right and the hero walks right
  const x0 = await page.evaluate(() => window.__DK.run().player.x);
  await page.mouse.move(195, 600);
  await page.mouse.down();
  await page.mouse.move(255, 600, { steps: 4 });
  await wait(700);
  await shot('10-joystick');
  await page.mouse.up();
  const x1 = await page.evaluate(() => window.__DK.run().player.x);
  ok(x1 - x0 > 30, 'joystick moves the hero (' + Math.round(x1 - x0) + ')');

  // level up
  await page.evaluate(() => window.__DK.giveXp(5));
  await wait(400);
  await shot('11-levelup');
  ok(await page.$('#modal .choice'), 'level-up choices shown');
  await page.click('#lv-rr');
  await wait(200);
  await page.click('#lv-bn');
  await wait(150);
  await page.click('#modal .choice[data-i="0"]');
  await wait(200);
  ok(await page.evaluate(() => Object.keys(window.__DK.run().banished).length === 1), 'banish removed a choice');
  await page.click('#modal .choice[data-i="0"]');
  await wait(300);
  ok(await page.evaluate(() => window.__DK.run().weapons.length + window.__DK.run().passives.length >= 2 || window.__DK.run().weapons[0].lvl === 2), 'picked an upgrade');
  await check('level up');

  // chest
  await page.evaluate(() => { const r = window.__DK.run(); r.drop('chest', r.player.x + 4, r.player.y).boss = true; });
  await wait(500);
  await shot('12-chest');
  await page.click('#ch-box');
  await wait(1600);
  await shot('13-chest-open');
  await page.click('#ch-ok');
  await wait(200);
  await check('chest');

  // pause
  await page.click('#pause-btn');
  await wait(200);
  await shot('14-pause');
  await page.click('#p-go');
  await wait(200);

  // autoplay into the first boss
  await page.evaluate(() => { window.__DK.autoplay(true); window.__DK.setTime(290); window.__DK.speed(3); });
  await wait(4500);
  await shot('15-boss');
  const boss = await page.evaluate(() => { const r = window.__DK.run(); return r.boss ? r.boss.bossKey : null; });
  ok(boss === 'colossus', 'mini-boss arrives at 5:00 (' + boss + ')');
  await check('boss');

  // frame rate with a full horde, 4x CPU slowdown to approximate a mid-range phone
  const cdp = await ctx.newCDPSession(page);
  await page.evaluate(() => { window.__DK.speed(1); window.__DK.spawn('zombie', 300); window.__DK.spawn('bat', 100); });
  const measure = () => page.evaluate(() => new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); };
    requestAnimationFrame(f);
  }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const fpsHigh = await measure();
  await page.evaluate(() => { window.__DK.save().settings.quality = 'low'; window.__DK.Game.applyQuality(); });
  const fpsLow = await measure();
  await page.evaluate(() => { window.__DK.save().settings.quality = 'auto'; window.__DK.Game.applyQuality(); });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const ents = await page.evaluate(() => window.__DK.run().enemies.length);
  console.log(`fps with ${ents} enemies at 4x CPU slowdown (software rendering): ${fpsHigh.toFixed(1)} sharp, ${fpsLow.toFixed(1)} low quality`);
  await shot('16-horde');
  await check('horde');

  // death and results
  await page.evaluate(() => { const r = window.__DK.run(); r.revivals = 0; r.player.inv = 0; r.hurt(99999); });
  await wait(2600);
  await shot('17-result');
  ok(await page.$('#r-home'), 'result screen shown');
  ok(await page.$('#modal .goldsum') && await page.$('#modal .nextun'), 'result shows the gold breakdown and the next unlock');
  const st = await page.evaluate(() => window.__DK.save().stats);
  ok(st.runs === 1 && st.kills > 0, 'run saved (' + st.kills + ' kills)');
  await page.click('#r-home');
  await wait(400);
  await check('result');

  // landscape
  await page.setViewportSize({ width: 844, height: 390 });
  await wait(300);
  await shot('18-home-landscape');
  await page.click('#h-play');
  await wait(200);
  await page.click('#s-go');
  await wait(1200);
  await shot('19-run-landscape');
  await check('landscape');

  await browser.close();
  if (errors.length) {
    console.log('\nERRORS:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('\nsmoke test passed');
})();
