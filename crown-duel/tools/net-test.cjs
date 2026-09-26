// End-to-end online test: starts a local PeerJS signaling server, opens the game on two
// "phones", creates a room on one, joins it by code on the other and plays a whole match
// with bots on both sides. Needs the `peer` package: npm install --prefix /tmp/peer peer
// Usage: NODE_PATH=$(npm root -g):/tmp/peer/node_modules node crown-duel/tools/net-test.cjs [screenshot-dir]
const { chromium } = require('playwright');
const { PeerServer } = require('peer');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const shots = process.argv[2] || null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PORT = 9123;

(async () => {
  const server = PeerServer({ port: PORT, host: '127.0.0.1', path: '/' });
  await new Promise((r) => setTimeout(r, 500));
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
  const url = 'file://' + path.join(root, 'index.html') + `?signal=127.0.0.1:${PORT}&ice=none`;
  const errors = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ' pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
    await page.goto(url);
    await page.waitForTimeout(600);
    await page.evaluate((n) => { window.__CD.save().name = n; }, name);
    return page;
  };
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };
  const host = await mk('Hosty');
  const guest = await mk('Guesty');

  // host creates a room
  await host.click('#nav button[data-p="online"]');
  await host.click('#on-host');
  await host.waitForSelector('.roomcode', { timeout: 15000 });
  const code = (await host.textContent('.roomcode')).trim();
  console.log('room code:', code);
  await shot(host, 'n1-host-room');

  // guest joins with the code
  await guest.click('#nav button[data-p="online"]');
  await guest.fill('#on-code', code);
  await guest.click('#on-join');
  const inBattle = (p) => p.waitForFunction(() => { const s = window.__CD.scene(); return s && s.mode && (s.mode === 'host' || s.mode === 'guest'); }, null, { timeout: 20000 });
  await Promise.all([inBattle(host), inBattle(guest)]);
  console.log('both players are in battle');
  await host.waitForTimeout(2500);

  // bots: the host's side is played by the AI, the guest plays random legal cards over the network
  await host.evaluate(() => { window.__CD.autoplay(0.7); window.__CD.speed(3); });
  await guest.evaluate(() => {
    window.__gbot = setInterval(() => {
      const s = window.__CD.scene();
      if (!s || s.ended || !s.g) return;
      const st = s.state();
      const slot = st.me.hand.findIndex((k, i) => k && CARDS_COST(k) <= st.me.elixir && !s.pending.has(i));
      if (slot < 0) return;
      const x = Math.random() < 0.5 ? 3.5 : 14.5, y = 32 - (18 + Math.random() * 8);
      s.tryPlay(slot, x, y);
    }, 400);
    function CARDS_COST(k) { return { knight: 3, archers: 3, goblins: 2, skeletons: 1, giant: 5, musketeer: 4, arrows: 3, fireball: 4 }[k] || 3; }
  });
  await host.waitForTimeout(8000);
  await shot(host, 'n2-host-battle');
  await shot(guest, 'n3-guest-battle');

  // compare what both sides see
  const hs = await host.evaluate(() => { const s = window.__CD.scene(); return { t: s.sim.t, towers: s.sim.ents.filter((e) => e.kind === 'tower').map((e) => Math.ceil(e.hp)), n: s.sim.ents.length, guestPlays: s.sim.p[1].plays }; });
  const gs = await guest.evaluate(() => { const s = window.__CD.scene(); return { t: s.g.t, towers: s.gList.filter((e) => e.kind === 'tower').map((e) => e.hp), n: s.gList.length, hand: s.g.hand }; });
  console.log('host view :', JSON.stringify(hs));
  console.log('guest view:', JSON.stringify(gs));
  if (hs.guestPlays < 1) errors.push('the guest never managed to play a card');
  if (Math.abs(hs.t - gs.t) > 1.5) errors.push('guest clock is far behind the host: ' + hs.t + ' vs ' + gs.t);

  // emote from the guest shows up on the host
  await guest.evaluate(() => window.__CD.scene().sendEmote(1));
  await host.waitForTimeout(400);
  const emo = await host.evaluate(() => window.__CD.scene().view.emotes.length);
  if (!emo) errors.push('emote did not arrive');

  // play to the end
  for (let i = 0; i < 120; i++) {
    const done = await Promise.all([host.$('#rs-ok'), guest.$('#rs-ok')]);
    if (done[0] && done[1]) break;
    await host.waitForTimeout(1000);
  }
  await shot(host, 'n4-host-result');
  await shot(guest, 'n5-guest-result');
  const hr = await host.evaluate(() => window.__CD.scene().result);
  const gr = await guest.evaluate(() => window.__CD.scene().result);
  console.log('host result :', JSON.stringify(hr));
  console.log('guest result:', JSON.stringify(gr));
  if (!hr || !gr || hr.winner !== gr.winner) errors.push('results differ between players');

  // rematch
  await guest.evaluate(() => clearInterval(window.__gbot));
  await host.click('#rs-again');
  await guest.click('#rs-again');
  const rematch = (p) => p.waitForFunction(() => { const s = window.__CD.scene(); return s && !s.ended && s.intro > 0; }, null, { timeout: 10000 });
  await Promise.all([rematch(host), rematch(guest)]);
  console.log('rematch started');
  await host.waitForTimeout(2500);

  // guest surrenders; host must win
  await guest.evaluate(() => window.__CD.scene().surrender());
  await host.waitForTimeout(1000);
  const hr2 = await host.evaluate(() => window.__CD.scene().result);
  console.log('after surrender, host result:', JSON.stringify(hr2));
  if (!hr2 || hr2.winner !== 0) errors.push('host did not win after the guest surrendered');

  // leaving closes the connection for the other player
  await host.waitForSelector('#rs-ok', { timeout: 8000 });
  await guest.waitForSelector('#rs-ok', { timeout: 8000 });
  await guest.click('#rs-ok');
  await host.waitForTimeout(1500);
  const note = await host.textContent('#rs-note');
  console.log('host note after guest left:', note);
  if (!/left/i.test(note)) errors.push('host was not told that the guest left');

  // random matchmaking: both players press Quick Match
  await host.click('#rs-ok');
  await host.waitForTimeout(500);
  for (const p of [host, guest]) await p.click('#nav button[data-p="online"]');
  await host.click('#on-quick');
  await host.waitForTimeout(1500);
  await guest.click('#on-quick');
  await Promise.all([inBattle(host), inBattle(guest)]);
  const roles = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__CD.scene().mode)));
  console.log('quick match roles:', roles.join(' / '));
  if (roles.sort().join() !== 'guest,host') errors.push('quick match did not pair the players');

  for (const p of [host, guest]) {
    const le = await p.evaluate(() => window.__lastError || null);
    if (le) errors.push('lastError: ' + le);
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'Online test passed.');
  await browser.close();
  server.close && server.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
