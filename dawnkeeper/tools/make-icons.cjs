// Renders the app icons (PNG) with headless Chromium.
// Usage: NODE_PATH=$(npm root -g) node dawnkeeper/tools/make-icons.cjs
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const draw = (size) => `
  const c = document.createElement('canvas'); c.width = c.height = ${size};
  const x = c.getContext('2d'); const s = ${size} / 512; x.scale(s, s);
  // night sky warming into dawn at the bottom
  const sky = x.createLinearGradient(0, 0, 0, 512); sky.addColorStop(0, '#0a0b26'); sky.addColorStop(0.6, '#2a2060'); sky.addColorStop(1, '#ff9a4a');
  x.fillStyle = sky; x.fillRect(0, 0, 512, 512);
  x.fillStyle = '#fff';
  for (const [sx, sy, r] of [[70, 80, 3], [140, 50, 2], [430, 150, 3], [90, 190, 2], [400, 60, 2], [250, 40, 2]]) { x.beginPath(); x.arc(sx, sy, r, 0, 7); x.fill(); }
  // moon
  x.fillStyle = '#f2f0ff'; x.beginPath(); x.arc(390, 110, 52, 0, 7); x.fill();
  x.fillStyle = '#0f0e30'; x.beginPath(); x.arc(368, 96, 46, 0, 7); x.fill();
  // lantern glow
  const g = x.createRadialGradient(256, 300, 10, 256, 300, 230); g.addColorStop(0, 'rgba(255,220,130,0.95)'); g.addColorStop(0.4, 'rgba(255,170,70,0.45)'); g.addColorStop(1, 'rgba(255,150,60,0)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  x.lineJoin = 'round'; x.lineCap = 'round';
  const O = '#1a1424';
  // handle ring
  x.lineWidth = 26; x.strokeStyle = O; x.beginPath(); x.arc(256, 168, 46, Math.PI, 0); x.stroke();
  x.lineWidth = 14; x.strokeStyle = '#8a6a4a'; x.stroke();
  // roof
  x.fillStyle = '#5a3a1a'; x.beginPath(); x.moveTo(150, 222); x.lineTo(256, 160); x.lineTo(362, 222); x.closePath(); x.fill(); x.lineWidth = 14; x.strokeStyle = O; x.stroke();
  // frame
  x.fillStyle = '#4a2e14'; x.beginPath(); x.roundRect(170, 214, 172, 210, 24); x.fill(); x.stroke();
  const fl = x.createLinearGradient(0, 240, 0, 400); fl.addColorStop(0, '#fff6c8'); fl.addColorStop(1, '#ffc040');
  x.fillStyle = fl; x.beginPath(); x.roundRect(196, 240, 120, 158, 16); x.fill(); x.lineWidth = 8; x.stroke();
  // flame
  x.fillStyle = '#ff8a2a'; x.beginPath(); x.moveTo(256, 268); x.quadraticCurveTo(298, 330, 256, 372); x.quadraticCurveTo(214, 330, 256, 268); x.fill();
  x.fillStyle = '#fff3b0'; x.beginPath(); x.moveTo(256, 306); x.quadraticCurveTo(278, 344, 256, 366); x.quadraticCurveTo(234, 344, 256, 306); x.fill();
  // base
  x.fillStyle = '#5a3a1a'; x.beginPath(); x.roundRect(158, 418, 196, 34, 12); x.fill(); x.lineWidth = 14; x.strokeStyle = O; x.stroke();
  c.toDataURL('image/png');
`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const size of [512, 192, 180]) {
    const url = await page.evaluate(draw(size));
    writeFileSync(join(root, 'icons', `icon-${size}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('dawnkeeper/icons/icon-' + size + '.png');
  }
  await browser.close();
})();
