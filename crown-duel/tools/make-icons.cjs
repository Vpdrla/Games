// Renders the app icons (PNG) with headless Chromium.
// Usage: NODE_PATH=$(npm root -g) node crown-duel/tools/make-icons.cjs
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const draw = (size) => `
  const c = document.createElement('canvas'); c.width = c.height = ${size};
  const x = c.getContext('2d'); const s = ${size} / 512; x.scale(s, s);
  // red vs blue halves
  const red = x.createLinearGradient(0, 0, 512, 512); red.addColorStop(0, '#ff6a5a'); red.addColorStop(1, '#a8182a');
  x.fillStyle = red; x.fillRect(0, 0, 512, 512);
  const blue = x.createLinearGradient(0, 512, 512, 0); blue.addColorStop(0, '#1f4fb0'); blue.addColorStop(1, '#5aa9ff');
  x.fillStyle = blue; x.beginPath(); x.moveTo(512, 0); x.lineTo(512, 512); x.lineTo(0, 512); x.closePath(); x.fill();
  const glow = x.createRadialGradient(256, 270, 20, 256, 270, 260); glow.addColorStop(0, 'rgba(255,240,180,0.55)'); glow.addColorStop(1, 'rgba(255,240,180,0)');
  x.fillStyle = glow; x.fillRect(0, 0, 512, 512);
  x.lineJoin = 'round'; x.lineCap = 'round';
  // crossed swords
  const sword = (a) => { x.save(); x.translate(256, 280); x.rotate(a);
    x.fillStyle = '#1c1a26'; x.fillRect(-18, -210, 36, 330);
    x.fillStyle = '#e8eef5'; x.beginPath(); x.moveTo(-12, 60); x.lineTo(-12, -190); x.lineTo(0, -214); x.lineTo(12, -190); x.lineTo(12, 60); x.fill();
    x.fillStyle = '#1c1a26'; x.fillRect(-58, 52, 116, 34); x.fillStyle = '#ffcc33'; x.fillRect(-52, 57, 104, 24);
    x.fillStyle = '#6b4a2a'; x.fillRect(-11, 86, 22, 70); x.fillStyle = '#ffcc33'; x.beginPath(); x.arc(0, 162, 16, 0, 7); x.fill();
    x.restore(); };
  sword(-0.72); sword(0.72);
  // crown
  x.save(); x.translate(256, 270);
  x.beginPath(); x.moveTo(-150, 90); x.lineTo(-150, -60); x.lineTo(-75, 10); x.lineTo(0, -110); x.lineTo(75, 10); x.lineTo(150, -60); x.lineTo(150, 90); x.closePath();
  x.lineWidth = 22; x.strokeStyle = '#1c1a26'; x.stroke();
  const gold = x.createLinearGradient(0, -110, 0, 90); gold.addColorStop(0, '#fff2a0'); gold.addColorStop(0.5, '#ffcc33'); gold.addColorStop(1, '#d08a00');
  x.fillStyle = gold; x.fill();
  x.fillStyle = '#1c1a26'; x.fillRect(-162, 80, 324, 58); x.fillStyle = gold; x.fillRect(-152, 88, 304, 42);
  for (const [px, py, col] of [[-150, -62, '#ff4848'], [0, -112, '#3d8bff'], [150, -62, '#ff4848']]) { x.fillStyle = '#1c1a26'; x.beginPath(); x.arc(px, py, 26, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(px, py, 17, 0, 7); x.fill(); }
  for (const [px, col] of [[-80, '#ff4848'], [0, '#3d8bff'], [80, '#ff4848']]) { x.fillStyle = '#1c1a26'; x.beginPath(); x.arc(px, 109, 17, 0, 7); x.fill(); x.fillStyle = col; x.beginPath(); x.arc(px, 109, 11, 0, 7); x.fill(); }
  x.restore();
  c.toDataURL('image/png');
`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const size of [512, 192, 180]) {
    const url = await page.evaluate(draw(size));
    writeFileSync(join(root, 'icons', `icon-${size}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('crown-duel/icons/icon-' + size + '.png');
  }
  await browser.close();
})();
