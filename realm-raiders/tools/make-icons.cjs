// Renders the app icons (PNG) with headless Chromium.
// Usage: NODE_PATH=$(npm root -g) node realm-raiders/tools/make-icons.cjs
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const draw = (size) => `
  const c = document.createElement('canvas'); c.width = c.height = ${size};
  const x = c.getContext('2d'); const s = ${size} / 512; x.scale(s, s);
  const bg = x.createRadialGradient(256, 220, 30, 256, 256, 380); bg.addColorStop(0, '#5a2dc2'); bg.addColorStop(0.6, '#241458'); bg.addColorStop(1, '#0d0a1a');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 512);
  x.lineJoin = 'round'; x.lineCap = 'round';
  // portal ring
  x.strokeStyle = 'rgba(176,123,255,0.55)'; x.lineWidth = 18; x.beginPath(); x.ellipse(256, 300, 190, 190, 0, 0, Math.PI * 2); x.stroke();
  // shield
  x.beginPath(); x.moveTo(256, 92); x.lineTo(404, 146); x.quadraticCurveTo(404, 330, 256, 430); x.quadraticCurveTo(108, 330, 108, 146); x.closePath();
  x.lineWidth = 26; x.strokeStyle = '#0d0a1a'; x.stroke();
  const g = x.createLinearGradient(108, 92, 404, 430); g.addColorStop(0, '#6aa8ff'); g.addColorStop(1, '#2a46c8');
  x.fillStyle = g; x.fill();
  x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.moveTo(256, 92); x.lineTo(256, 430); x.quadraticCurveTo(108, 330, 108, 146); x.closePath(); x.fill();
  // sword
  x.save(); x.translate(256, 262); x.rotate(-Math.PI / 4);
  x.fillStyle = '#0d0a1a'; x.fillRect(-26, -190, 52, 300);
  x.fillStyle = '#eef2ff'; x.beginPath(); x.moveTo(-15, 60); x.lineTo(-15, -150); x.lineTo(0, -180); x.lineTo(15, -150); x.lineTo(15, 60); x.closePath(); x.fill();
  x.fillStyle = '#ffd23f'; x.fillRect(-58, 56, 116, 26); x.strokeStyle = '#0d0a1a'; x.lineWidth = 8; x.strokeRect(-58, 56, 116, 26);
  x.fillStyle = '#8a5a2a'; x.fillRect(-11, 82, 22, 62); x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(0, 152, 16, 0, Math.PI * 2); x.fill(); x.stroke();
  x.restore();
  // sparkles
  for (const [px, py, r] of [[96, 96, 16], [418, 90, 13], [430, 410, 18], [84, 414, 12]]) {
    x.fillStyle = '#ffd23f'; x.beginPath(); x.moveTo(px, py - r * 2); x.lineTo(px + r * 0.5, py - r * 0.5); x.lineTo(px + r * 2, py); x.lineTo(px + r * 0.5, py + r * 0.5); x.lineTo(px, py + r * 2); x.lineTo(px - r * 0.5, py + r * 0.5); x.lineTo(px - r * 2, py); x.lineTo(px - r * 0.5, py - r * 0.5); x.closePath(); x.fill();
  }
  c.toDataURL('image/png');
`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const size of [512, 192, 180]) {
    const url = await page.evaluate(draw(size));
    writeFileSync(join(root, 'icons', `icon-${size}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('realm-raiders/icons/icon-' + size + '.png');
  }
  await browser.close();
})();
