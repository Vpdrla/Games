// Renders the app icons (PNG) with headless Chromium.
// Usage: NODE_PATH=$(npm root -g) node tools/make-icons.cjs
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const draw = (size) => `
  const c = document.createElement('canvas'); c.width = c.height = ${size};
  const x = c.getContext('2d'); const s = ${size} / 512; x.scale(s, s);
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#2b4a6b'); g.addColorStop(1, '#0b0f16');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const sun = x.createRadialGradient(360, 150, 10, 360, 150, 170); sun.addColorStop(0, 'rgba(255,201,64,0.55)'); sun.addColorStop(1, 'rgba(255,201,64,0)');
  x.fillStyle = sun; x.fillRect(0, 0, 512, 512);
  x.fillStyle = '#ffc940'; x.beginPath(); x.arc(360, 150, 46, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#16222f'; x.beginPath(); x.moveTo(0, 430); x.quadraticCurveTo(140, 360, 280, 410); x.quadraticCurveTo(400, 450, 512, 400); x.lineTo(512, 512); x.lineTo(0, 512); x.fill();
  x.lineCap = 'round'; x.lineJoin = 'round';
  // scarf
  x.strokeStyle = '#e53935'; x.lineWidth = 16;
  x.beginPath(); x.moveTo(230, 150); x.quadraticCurveTo(170, 140, 120, 175); x.stroke();
  x.lineWidth = 12; x.beginPath(); x.moveTo(228, 158); x.quadraticCurveTo(180, 175, 140, 215); x.stroke();
  // body
  const stroke = (w, col) => { x.strokeStyle = col; x.lineWidth = w;
    x.beginPath();
    x.moveTo(262, 180); x.lineTo(240, 290);            // torso
    x.moveTo(240, 290); x.lineTo(300, 340); x.lineTo(330, 420); // front leg
    x.moveTo(240, 290); x.lineTo(185, 350); x.lineTo(130, 360); // back leg
    x.moveTo(256, 205); x.lineTo(200, 250); x.lineTo(160, 225); // back arm
    x.moveTo(256, 205); x.lineTo(315, 225); x.lineTo(345, 180); // front arm
    x.stroke(); };
  stroke(40, 'rgba(255,255,255,0.9)');
  stroke(26, '#111');
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(268, 138, 44, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#111'; x.beginPath(); x.arc(268, 138, 36, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.fillRect(282, 128, 9, 12);
  // sword
  x.strokeStyle = '#ffe9a8'; x.lineWidth = 16; x.beginPath(); x.moveTo(350, 172); x.lineTo(420, 70); x.stroke();
  x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.moveTo(356, 160); x.lineTo(416, 76); x.stroke();
  x.strokeStyle = '#c8a24a'; x.lineWidth = 14; x.beginPath(); x.moveTo(330, 170); x.lineTo(372, 196); x.stroke();
  // slash arc
  x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 10; x.beginPath(); x.arc(300, 200, 150, -1.6, -0.3); x.stroke();
  c.toDataURL('image/png');
`;
(async () => {
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [512, 192, 180]) {
  const url = await page.evaluate(draw(size));
  writeFileSync(join(root, 'icons', `icon-${size}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('icons/icon-' + size + '.png');
}
await browser.close();
})();
