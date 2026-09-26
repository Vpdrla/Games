// Headless smoke test: boots the game as a landscape phone, clicks through the menus,
// and lets a bot play every stage type and every boss while watching for errors.
// Usage: NODE_PATH=$(npm root -g) node tools/smoke-test.cjs [screenshotDir]
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const shots = process.argv[2] || null;
if (shots) fs.mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
  await shot('01-title');
  await page.click('text=START ADVENTURE');
  await wait(600);
  await shot('02-story');
  await page.click('text=CONTINUE');
  await wait(500);
  await shot('03-map');
  await check('map');

  // bot: runs right, jumps, attacks, dashes, uses skills
  const startBot = () => page.evaluate(() => {
    const I = window.__SO.Input;
    window.__botT = 0;
    clearInterval(window.__bot);
    window.__bot = setInterval(() => {
      const t = ++window.__botT;
      I.key.right = true;
      I.key.left = false;
      I.key.up = t % 40 < 4;
      I.key.down = t % 55 < 3;
      if (t % 9 === 0) I.latch.jump = true;
      if (t % 3 === 0) I.latch.attack = true;
      if (t % 37 === 0) I.latch.dash = true;
      if (t % 61 === 0) I.latch.skill1 = true;
      if (t % 83 === 0) I.latch.skill2 = true;
      if (t % 150 === 0) I.latch.potion = true;
    }, 50);
  });
  const stopBot = () => page.evaluate(() => { clearInterval(window.__bot); const I = window.__SO.Input; I.key = {}; });

  // tutorial stage, played normally for a while
  await page.evaluate(() => window.__SO.play('r0-l1'));
  await wait(1500);
  await shot('04-tutorial-start');
  await startBot();
  await wait(9000);
  await shot('05-tutorial-play');
  await stopBot();
  await check('tutorial');

  // give the player every skill so all of them get exercised
  await page.evaluate(() => {
    const s = window.__SO.save();
    s.skills = ['blast', 'quake', 'whirl', 'thunder', 'frost', 'meteor'];
    s.weapons = ['fists', 'sword', 'spear', 'hammer', 'katana', 'cosmic'];
  });
  const skillPairs = [['blast', 'quake'], ['whirl', 'thunder'], ['frost', 'meteor']];
  const weapons = ['sword', 'spear', 'hammer', 'katana', 'cosmic', 'fists'];

  for (let r = 0; r < 6; r++) {
    for (const node of [`r${r}-l2`, `r${r}-side`]) {
      await page.evaluate(([n, w, sk]) => {
        const s = window.__SO.save();
        s.weapon = w;
        s.slots = sk;
        window.__SO.play(n);
        window.__SO.Game.scene.godMode = true;
      }, [node, weapons[r], skillPairs[r % 3]]);
      await startBot();
      await wait(7000);
      await shot(`10-${node}`);
      await stopBot();
      await check(node);
    }
    // boss: jump straight into the arena
    const boss = `r${r}-boss`;
    await page.evaluate(([n, w, sk]) => {
      const s = window.__SO.save();
      s.weapon = w;
      s.slots = sk;
      window.__SO.play(n);
      const S = window.__SO.Game.scene;
      S.godMode = true;
      const a = S.arenas[S.arenas.length - 1];
      S.player.x = a.x0 + 120;
      S.player.y = a.gy - 60;
    }, [boss, weapons[(r + 2) % 6], skillPairs[(r + 1) % 3]]);
    await startBot();
    await wait(4000);
    await shot(`20-${boss}-a`);
    await wait(12000);
    await shot(`21-${boss}-b`);
    const info = await page.evaluate(() => {
      const S = window.__SO.Game.scene;
      return S.boss ? { name: S.boss.name, hp: Math.round(S.boss.hp), max: S.boss.maxHp, state: S.boss.state } : null;
    });
    console.log(boss, JSON.stringify(info));
    await stopBot();
    await check(boss);
  }

  // endless arena, then a finished boss fight end-to-end (kill boss, collect shard, result screen)
  await page.evaluate(() => { window.__SO.save().done['r0-boss'] = true; window.__SO.play('arena'); window.__SO.Game.scene.godMode = true; });
  await startBot();
  await wait(8000);
  await shot('30-arena');
  await stopBot();
  await check('arena');

  await page.evaluate(() => {
    window.__SO.play('r0-boss');
    const S = window.__SO.Game.scene;
    S.godMode = true;
    const a = S.arenas[S.arenas.length - 1];
    S.player.x = a.x0 + 120;
    S.player.y = a.gy - 60;
  });
  await wait(2500);
  await page.evaluate(() => { const S = window.__SO.Game.scene; S.boss.takeHit({ dmg: 99999, dir: 1, kbx: 0, kby: 0, heavy: true, kind: 'melee' }); });
  await wait(4000);
  await page.evaluate(() => { const S = window.__SO.Game.scene; const sh = S.pickups.find((p) => p.type === 'shard'); if (sh) { S.player.x = sh.x - 9; S.player.y = sh.y - 30; } });
  await wait(3500);
  await shot('40-result');
  const hasResult = await page.isVisible('text=CONTINUE');
  console.log('result screen visible:', hasResult);
  if (!hasResult) errors.push('result screen did not appear after boss kill');
  await page.click('text=CONTINUE');
  await wait(800);
  await shot('41-map-after');
  await check('boss-complete');

  // town shop + gear + settings
  await page.evaluate(() => { window.__SO.save().coins = 5000; });
  await page.evaluate(() => { const m = window.__SO.Game.scene; m.enterNode(window.__SO.MAP.nodes['r0-town']); });
  await wait(400);
  await shot('50-shop');
  await page.click('#modal-panel .tabs >> text=UPGRADES');
  await wait(200);
  await shot('51-shop-upgrades');
  await page.click('#modal-panel >> text=GEAR');
  await wait(300);
  await shot('52-gear');
  await page.click('text=CLOSE');
  await wait(200);
  await page.click('text=LEAVE');
  await page.click('#mh-set');
  await wait(300);
  await shot('53-settings');
  await page.click('text=BACK');
  await check('menus');

  // death flow
  await page.evaluate(() => { window.__SO.play('r1-l1'); const S = window.__SO.Game.scene; S.player.hurt(99999, 0, 100); });
  await wait(2500);
  await shot('60-defeat');
  const hasDefeat = await page.isVisible('text=RETRY FROM CHECKPOINT');
  if (!hasDefeat) errors.push('defeat screen missing');
  await page.click('text=RETRY FROM CHECKPOINT');
  await wait(800);
  await check('retry');

  // portrait orientation
  await page.setViewportSize({ width: 390, height: 844 });
  await wait(500);
  await shot('70-portrait');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
