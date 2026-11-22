// Renders the app icons (PNG) with headless Chromium.
// Usage: NODE_PATH=$(npm root -g) node runebound/tools/make-icons.cjs
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const draw = (size) => `
  const c = document.createElement('canvas'); c.width = c.height = ${size};
  const x = c.getContext('2d'); const s = ${size} / 512; x.scale(s, s);
  const bg = x.createRadialGradient(256, 200, 30, 256, 256, 380); bg.addColorStop(0, '#6b3fd0'); bg.addColorStop(0.55, '#2a1460'); bg.addColorStop(1, '#0d0620');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 512);
  // two fanned cards
  const card = (a, dx, c1, c2) => { x.save(); x.translate(256 + dx, 280); x.rotate(a);
    x.fillStyle = 'rgba(0,0,0,0.45)'; x.beginPath(); x.roundRect(-112, -150, 236, 320, 26); x.fill();
    const g = x.createLinearGradient(-110, -160, 110, 160); g.addColorStop(0, c1); g.addColorStop(1, c2);
    x.fillStyle = g; x.beginPath(); x.roundRect(-118, -160, 236, 320, 26); x.fill();
    x.lineWidth = 12; x.strokeStyle = '#e8c170'; x.stroke(); x.restore(); };
  card(-0.28, -70, '#c8451c', '#3e0d05');
  card(0.28, 70, '#2f8a3a', '#0b2a0f');
  card(0, 0, '#4b2f8a', '#160a33');
  // rune
  x.save(); x.translate(256, 270);
  const glow = x.createRadialGradient(0, 0, 10, 0, 0, 150); glow.addColorStop(0, 'rgba(255,200,90,0.55)'); glow.addColorStop(1, 'rgba(255,200,90,0)');
  x.fillStyle = glow; x.fillRect(-160, -160, 320, 320);
  x.font = 'bold 230px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 16; x.strokeStyle = '#2a1405'; x.strokeText('ᚱ', 0, 6);
  const gold = x.createLinearGradient(0, -110, 0, 110); gold.addColorStop(0, '#fff3c4'); gold.addColorStop(0.5, '#e8c170'); gold.addColorStop(1, '#a8661a');
  x.fillStyle = gold; x.fillText('ᚱ', 0, 6); x.restore();
  return c.toDataURL('image/png');`;

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  for (const size of [180, 192, 512]) {
    const url = await page.evaluate(`(() => {${draw(size)}})()`);
    writeFileSync(join(root, 'icons', `icon-${size}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`icons/icon-${size}.png`);
  }
  await browser.close();
})();
