// Renders the app icons (PNG) with headless Chromium.
// Usage: NODE_PATH=$(npm root -g) node blast-squad/tools/make-icons.cjs
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const draw = (size) => `
  const c = document.createElement('canvas'); c.width = c.height = ${size};
  const x = c.getContext('2d'); const s = ${size} / 512; x.scale(s, s);
  // purple night sky
  const bg = x.createRadialGradient(256, 230, 30, 256, 256, 380); bg.addColorStop(0, '#7b3cff'); bg.addColorStop(0.6, '#3a1690'); bg.addColorStop(1, '#14102e');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 512);
  x.lineJoin = 'round'; x.lineCap = 'round';
  // explosion burst
  const burst = (r0, r1, n, rot) => { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n; const r = i % 2 ? r0 : r1; x.lineTo(256 + Math.cos(a) * r, 262 + Math.sin(a) * r); } x.closePath(); };
  burst(120, 230, 10, -Math.PI / 2); x.lineWidth = 26; x.strokeStyle = '#1a0f2e'; x.stroke();
  const fire = x.createRadialGradient(256, 262, 20, 256, 262, 230); fire.addColorStop(0, '#fff6b0'); fire.addColorStop(0.45, '#ffd23f'); fire.addColorStop(1, '#ff7a1a');
  x.fillStyle = fire; x.fill();
  // gem
  x.save(); x.translate(256, 262);
  x.beginPath(); x.moveTo(0, -112); x.lineTo(92, -30); x.lineTo(56, 104); x.lineTo(-56, 104); x.lineTo(-92, -30); x.closePath();
  x.lineWidth = 24; x.strokeStyle = '#1a0f2e'; x.stroke();
  const g = x.createLinearGradient(-90, -110, 90, 110); g.addColorStop(0, '#f3c4ff'); g.addColorStop(0.45, '#c05cff'); g.addColorStop(1, '#6a1fb5');
  x.fillStyle = g; x.fill();
  x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.moveTo(0, -112); x.lineTo(-92, -30); x.lineTo(-30, -20); x.closePath(); x.fill();
  x.fillStyle = 'rgba(40,0,80,0.25)'; x.beginPath(); x.moveTo(30, -20); x.lineTo(92, -30); x.lineTo(56, 104); x.lineTo(0, 104); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 6; x.beginPath(); x.moveTo(-92, -30); x.lineTo(92, -30); x.moveTo(-30, -20); x.lineTo(0, 104); x.moveTo(30, -20); x.lineTo(0, 104); x.stroke();
  x.restore();
  // sparkles
  for (const [px, py, r] of [[110, 120, 18], [410, 110, 14], [420, 400, 20], [96, 404, 12]]) {
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(px, py - r * 2); x.lineTo(px + r * 0.5, py - r * 0.5); x.lineTo(px + r * 2, py); x.lineTo(px + r * 0.5, py + r * 0.5); x.lineTo(px, py + r * 2); x.lineTo(px - r * 0.5, py + r * 0.5); x.lineTo(px - r * 2, py); x.lineTo(px - r * 0.5, py - r * 0.5); x.closePath(); x.fill();
  }
  c.toDataURL('image/png');
`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const size of [512, 192, 180]) {
    const url = await page.evaluate(draw(size));
    writeFileSync(join(root, 'icons', `icon-${size}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('blast-squad/icons/icon-' + size + '.png');
  }
  await browser.close();
})();
