// ---------- Procedural art: heroes, monsters, bosses, pickups, icons, ground ----------
// Painters draw in body units: (0, 0) is the body centre, radius 1, facing +x.
// Everything is painted once into cached canvases and stamped with drawImage.
const OUT = '#1a1424';
const BONE = '#ece6d2';
const GOLDC = '#ffcc33';

function fs(ctx, fill, lw) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw || 0.12;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}
function el(ctx, x, y, rx, ry, fill, lw) { ellipse(ctx, x, y, rx, ry); fs(ctx, fill, lw); }
function rr(ctx, x, y, w, h, r, fill, lw) { roundRect(ctx, x, y, w, h, r); fs(ctx, fill, lw); }
function ln(ctx, x1, y1, x2, y2, w, col) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineCap = 'round';
  ctx.lineWidth = w + 0.14;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  ctx.stroke();
}
function pg(ctx, pts, fill, lw) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  fs(ctx, fill, lw);
}
function dot(ctx, x, y, r, col) {
  circle(ctx, x, y, r);
  ctx.fillStyle = col;
  ctx.fill();
}
function eyes(ctx, x, y, gap, r, col, pupil) {
  for (const s of [-1, 1]) {
    el(ctx, x + s * gap, y, r, r * 1.15, col || '#fff', 0.07);
    if (pupil) dot(ctx, x + s * gap + r * 0.35, y + r * 0.1, r * 0.5, pupil);
  }
}
function feet(ctx, f, col, y, gap) {
  const a = f ? 0.12 : -0.12;
  el(ctx, -gap + a, y, 0.22, 0.14, col);
  el(ctx, gap - a, y, 0.22, 0.14, col);
}

// ----- heroes -----
function paintHero(ctx, f, look) {
  const c = look.cloak, t = look.trim, skin = look.skin;
  feet(ctx, f, '#3a2a2a', 0.92, 0.32);
  // cloak
  ctx.beginPath();
  ctx.moveTo(-0.62, 0.9);
  ctx.quadraticCurveTo(-0.7, -0.05, -0.2, -0.2);
  ctx.lineTo(0.2, -0.2);
  ctx.quadraticCurveTo(0.7, -0.05, 0.62, 0.9);
  ctx.closePath();
  fs(ctx, c);
  pg(ctx, [-0.12, -0.15, 0.12, -0.15, 0.08, 0.86, -0.08, 0.86], t, 0.06);
  // head
  el(ctx, 0.04, -0.52, 0.5, 0.46, skin);
  eyes(ctx, 0.18, -0.5, 0.15, 0.08, OUT);
  dot(ctx, 0.36, -0.36, 0.06, 'rgba(255,120,120,0.6)');
  // hats
  switch (look.hat) {
    case 'hood':
      ctx.beginPath();
      ctx.moveTo(-0.55, -0.35);
      ctx.quadraticCurveTo(-0.5, -1.15, 0.1, -1.05);
      ctx.quadraticCurveTo(0.6, -0.95, 0.55, -0.62);
      ctx.quadraticCurveTo(0.1, -0.85, -0.2, -0.6);
      ctx.quadraticCurveTo(-0.4, -0.45, -0.55, -0.35);
      ctx.closePath();
      fs(ctx, c);
      break;
    case 'hood2':
      ctx.beginPath();
      ctx.moveTo(-0.58, -0.25);
      ctx.quadraticCurveTo(-0.62, -1.1, 0.05, -1.08);
      ctx.quadraticCurveTo(0.62, -1.0, 0.56, -0.55);
      ctx.lineTo(0.3, -0.78);
      ctx.quadraticCurveTo(-0.15, -0.8, -0.3, -0.45);
      ctx.closePath();
      fs(ctx, c);
      pg(ctx, [-0.55, -0.9, -0.95, -1.2, -0.62, -0.7], t, 0.07);
      break;
    case 'witch':
      el(ctx, 0.02, -0.82, 0.72, 0.16, c);
      pg(ctx, [-0.38, -0.86, 0.36, -0.86, 0.05, -1.75, -0.25, -1.55], c);
      rr(ctx, -0.36, -0.98, 0.72, 0.14, 0.05, t, 0.06);
      dot(ctx, 0.05, -1.78, 0.09, t);
      break;
    case 'helm':
      ctx.beginPath();
      ctx.arc(0.04, -0.55, 0.56, Math.PI * 1.02, Math.PI * 1.98);
      ctx.lineTo(0.6, -0.3);
      ctx.lineTo(0.3, -0.3);
      ctx.lineTo(0.3, -0.62);
      ctx.lineTo(-0.52, -0.62);
      ctx.closePath();
      fs(ctx, '#b8c2d4');
      pg(ctx, [-0.05, -1.08, 0.12, -1.42, 0.25, -1.06], '#d84a4a', 0.07);
      break;
    case 'goggles':
      ctx.beginPath();
      ctx.arc(0.04, -0.56, 0.52, Math.PI, TAU);
      ctx.closePath();
      fs(ctx, '#7a3a2a');
      rr(ctx, -0.5, -0.8, 1.05, 0.16, 0.06, '#4a3a3a', 0.06);
      el(ctx, 0.16, -0.73, 0.14, 0.13, '#9fe8ff', 0.07);
      el(ctx, 0.46, -0.73, 0.12, 0.12, '#9fe8ff', 0.07);
      break;
    case 'cap':
      ctx.beginPath();
      ctx.arc(0.02, -0.62, 0.5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.closePath();
      fs(ctx, c);
      pg(ctx, [0.2, -0.7, 0.85, -0.7, 0.75, -0.6, 0.2, -0.6], c, 0.07);
      ln(ctx, -0.1, -1.08, -0.2, -1.4, 0.05, '#999');
      dot(ctx, -0.2, -1.42, 0.09, t);
      break;
  }
  // lantern in the front hand
  ln(ctx, 0.5, 0.15, 0.78, 0.2, 0.08, c);
  ln(ctx, 0.82, 0.05, 0.82, 0.2, 0.05, '#555');
  rr(ctx, 0.66, 0.2, 0.32, 0.38, 0.06, '#5a3a1a', 0.07);
  rr(ctx, 0.71, 0.26, 0.22, 0.24, 0.05, '#ffe27a', 0.04);
}

// ----- monsters -----
function paintSkeleton(ctx, f, bow) {
  feet(ctx, f, BONE, 0.92, 0.28);
  ln(ctx, -0.18, 0.5, -0.24 + (f ? 0.06 : -0.06), 0.85, 0.1, BONE);
  ln(ctx, 0.18, 0.5, 0.24 - (f ? 0.06 : -0.06), 0.85, 0.1, BONE);
  rr(ctx, -0.36, -0.12, 0.72, 0.66, 0.2, '#d8d0b8');
  for (const y of [0.05, 0.2, 0.35]) ln(ctx, -0.24, y, 0.24, y, 0.04, '#a89e86');
  ln(ctx, 0.3, 0.0, 0.8, 0.12 + (f ? 0.05 : -0.05), 0.09, BONE);
  ln(ctx, -0.3, 0.0, -0.6, 0.35, 0.09, BONE);
  el(ctx, 0.06, -0.55, 0.5, 0.46, BONE);
  rr(ctx, -0.1, -0.24, 0.42, 0.2, 0.06, BONE, 0.08);
  el(ctx, 0.0, -0.58, 0.13, 0.15, OUT, 0.02);
  el(ctx, 0.3, -0.58, 0.12, 0.14, OUT, 0.02);
  dot(ctx, 0.02, -0.58, 0.05, '#ff5a3a');
  dot(ctx, 0.31, -0.58, 0.05, '#ff5a3a');
  if (bow) {
    ctx.beginPath();
    ctx.arc(0.62, 0.05, 0.62, -1.2, 1.2);
    ctx.lineWidth = 0.22;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = '#8a5a2b';
    ctx.stroke();
    ln(ctx, 0.85, -0.53, 0.85, 0.63, 0.02, '#ddd');
  }
}

const PAINT = {
  hero(ctx, f, look) { paintHero(ctx, f, look); },

  bat(ctx, f) {
    const up = f % 2 === 0;
    const wy = up ? -0.75 : 0.35;
    pg(ctx, [-0.25, -0.05, -1.25, wy, -1.0, wy + 0.3, -0.7, 0.1, -0.45, 0.3], '#4a2a62');
    pg(ctx, [0.25, -0.05, 1.25, wy, 1.0, wy + 0.3, 0.7, 0.1, 0.45, 0.3], '#4a2a62');
    el(ctx, 0, 0, 0.5, 0.48, '#5b3a7a');
    pg(ctx, [-0.35, -0.3, -0.3, -0.75, -0.1, -0.4], '#5b3a7a', 0.08);
    pg(ctx, [0.35, -0.3, 0.3, -0.75, 0.1, -0.4], '#5b3a7a', 0.08);
    dot(ctx, -0.12, -0.08, 0.1, '#ff4a4a');
    dot(ctx, 0.18, -0.08, 0.1, '#ff4a4a');
    pg(ctx, [-0.05, 0.18, 0.02, 0.32, 0.08, 0.18], '#fff', 0.03);
  },

  zombie(ctx, f) {
    feet(ctx, f, '#3a4a3a', 0.92, 0.3);
    rr(ctx, -0.48, -0.15, 0.96, 0.95, 0.25, '#4a6a9a');
    pg(ctx, [-0.48, 0.55, -0.3, 0.8, -0.1, 0.6, 0.1, 0.82, 0.3, 0.6, 0.48, 0.8, 0.48, 0.55], '#3a5a8a', 0.06);
    ln(ctx, 0.2, 0.08, 0.95, 0.0 + (f ? 0.06 : -0.06), 0.2, '#6fa35a');
    ln(ctx, -0.1, 0.18, 0.75, 0.22 + (f ? -0.06 : 0.06), 0.2, '#6fa35a');
    el(ctx, 0.06, -0.52, 0.5, 0.46, '#7ab868');
    el(ctx, 0.0, -0.58, 0.12, 0.13, '#fff', 0.06);
    el(ctx, 0.3, -0.55, 0.08, 0.09, '#fff', 0.06);
    dot(ctx, 0.03, -0.57, 0.05, OUT);
    dot(ctx, 0.31, -0.55, 0.04, OUT);
    ln(ctx, 0.05, -0.3, 0.32, -0.33, 0.04, OUT);
    dot(ctx, -0.25, -0.75, 0.08, '#5a8a48');
  },

  skeleton(ctx, f) { paintSkeleton(ctx, f, false); },
  archer(ctx, f) { paintSkeleton(ctx, f, true); },

  ghost(ctx, f) {
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.moveTo(-0.8, 0.0);
    ctx.arc(0, -0.1, 0.8, Math.PI, 0);
    ctx.lineTo(0.8, 0.7);
    const ph = f ? 0.15 : -0.15;
    for (let i = 0; i < 4; i++) {
      const x0 = 0.8 - i * 0.4;
      ctx.quadraticCurveTo(x0 - 0.1, 0.95 + (i % 2 ? ph : -ph), x0 - 0.2, 0.8);
      ctx.quadraticCurveTo(x0 - 0.3, 0.65, x0 - 0.4, 0.78);
    }
    ctx.closePath();
    fs(ctx, '#dcebff');
    ctx.globalAlpha = 1;
    el(ctx, 0.0, -0.2, 0.13, 0.2, OUT, 0.02);
    el(ctx, 0.34, -0.2, 0.12, 0.19, OUT, 0.02);
    el(ctx, 0.2, 0.18, 0.1, 0.13, OUT, 0.02);
    ln(ctx, 0.75, 0.1, 1.0, -0.05 + ph, 0.12, '#dcebff');
  },

  slime(ctx, f) { paintSlime(ctx, f, '#5ad06a', '#2f9a40'); },
  slimelet(ctx, f) { paintSlime(ctx, f, '#8ae89a', '#4ab85a'); },

  hound(ctx, f) { paintBeast(ctx, f, '#a03a2a', '#6a1a12', '#ffd84a', true); },
  wolf(ctx, f) { paintBeast(ctx, f, '#dfe8f2', '#8a9ab0', '#5ac8ff', false); },

  bloater(ctx, f) {
    feet(ctx, f, '#6a2a62', 0.9, 0.4);
    el(ctx, 0, 0.05, 0.95 + (f ? 0.03 : 0), 0.88 - (f ? 0.03 : 0), '#c868b8');
    dot(ctx, -0.4, -0.25, 0.14, '#e8a0d8');
    dot(ctx, -0.25, 0.4, 0.1, '#e8a0d8');
    dot(ctx, 0.5, 0.45, 0.12, '#a84a98');
    eyes(ctx, 0.25, -0.25, 0.2, 0.12, '#fff', OUT);
    el(ctx, 0.32, 0.18, 0.2, 0.12, '#5a1a52', 0.06);
  },

  knight(ctx, f) {
    feet(ctx, f, '#3a3a4a', 0.92, 0.3);
    rr(ctx, -0.5, -0.2, 1.0, 1.0, 0.25, '#8a96a8');
    ln(ctx, -0.3, 0.1, -0.7, 0.3, 0.16, '#8a96a8');
    el(ctx, 0.02, -0.52, 0.48, 0.46, '#a8b4c8');
    rr(ctx, -0.05, -0.62, 0.5, 0.12, 0.05, OUT, 0.02);
    pg(ctx, [-0.1, -0.95, 0.05, -1.3, 0.2, -0.95], '#d84a4a', 0.07);
    // shield in front
    ctx.beginPath();
    ctx.moveTo(0.45, -0.55);
    ctx.lineTo(1.05, -0.55);
    ctx.lineTo(1.05, 0.3);
    ctx.quadraticCurveTo(0.75, 0.85, 0.45, 0.3);
    ctx.closePath();
    fs(ctx, '#5a6a8a');
    ln(ctx, 0.75, -0.45, 0.75, 0.5, 0.08, GOLDC);
    ln(ctx, 0.52, -0.1, 0.98, -0.1, 0.08, GOLDC);
  },

  necro(ctx, f) {
    pg(ctx, [-0.65, 0.95, -0.4, -0.3, 0.4, -0.3, 0.65, 0.95], '#4a2a6a');
    pg(ctx, [-0.3, 0.95, -0.1, 0.2, 0.1, 0.2, 0.3, 0.95], '#2a1a3a', 0.06);
    ln(ctx, 0.8, -1.0, 0.8, 0.95, 0.09, '#6a4a2a');
    circle(ctx, 0.8, -1.05, 0.2);
    fs(ctx, f ? '#7aff8a' : '#5ae070', 0.07);
    ln(ctx, 0.3, 0.0, 0.78, 0.05, 0.14, '#4a2a6a');
    ctx.beginPath();
    ctx.arc(0, -0.55, 0.55, Math.PI * 0.95, Math.PI * 2.05);
    ctx.quadraticCurveTo(0.6, -0.1, 0, -0.05);
    ctx.quadraticCurveTo(-0.6, -0.1, -0.55, -0.5);
    fs(ctx, '#3a1a5a');
    el(ctx, 0.08, -0.5, 0.3, 0.3, BONE, 0.07);
    dot(ctx, -0.02, -0.52, 0.07, '#7aff8a');
    dot(ctx, 0.2, -0.52, 0.07, '#7aff8a');
  },

  wisp(ctx, f) {
    const h = f ? 1.25 : 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.quadraticCurveTo(0.85, -0.2, 0.6, 0.35);
    ctx.quadraticCurveTo(0.3, 0.85, 0, 0.8);
    ctx.quadraticCurveTo(-0.3, 0.85, -0.6, 0.35);
    ctx.quadraticCurveTo(-0.85, -0.2, 0, -h);
    fs(ctx, '#5ab8ff', 0.1);
    el(ctx, 0, 0.25, 0.4, 0.45, '#cff4ff', 0.01);
    dot(ctx, -0.12, 0.2, 0.08, OUT);
    dot(ctx, 0.16, 0.2, 0.08, OUT);
  },

  golem(ctx, f) {
    feet(ctx, f, '#4a463e', 0.92, 0.42);
    rr(ctx, -0.8, -0.45, 1.6, 1.3, 0.3, '#7a7468');
    rr(ctx, -0.35, -1.0, 0.7, 0.6, 0.18, '#8a8478');
    dot(ctx, -0.1, -0.72, 0.09, '#ffb040');
    dot(ctx, 0.18, -0.72, 0.09, '#ffb040');
    rr(ctx, 0.6, -0.3 + (f ? 0.06 : 0), 0.45, 0.85, 0.15, '#6a6458');
    rr(ctx, -1.05, -0.3 - (f ? 0.06 : 0), 0.45, 0.85, 0.15, '#6a6458');
    el(ctx, -0.3, -0.25, 0.25, 0.12, '#5a8a48', 0.05);
    el(ctx, 0.35, 0.4, 0.2, 0.1, '#5a8a48', 0.05);
    ln(ctx, -0.2, 0.1, 0.1, 0.35, 0.04, '#4a463e');
  },

  yeti(ctx, f) {
    feet(ctx, f, '#a8b8c8', 0.92, 0.38);
    el(ctx, 0, 0.1, 0.85, 0.85, '#eef6ff');
    ln(ctx, 0.55, -0.1, 0.95, 0.35 + (f ? 0.08 : 0), 0.32, '#eef6ff');
    ln(ctx, -0.55, -0.1, -0.9, 0.35 - (f ? 0.08 : 0), 0.32, '#eef6ff');
    el(ctx, 0.15, -0.3, 0.42, 0.36, '#7ab0d8');
    eyes(ctx, 0.15, -0.38, 0.15, 0.08, '#fff', OUT);
    pg(ctx, [-0.05, -0.12, 0.35, -0.12, 0.15, 0.0], '#fff', 0.05);
    pg(ctx, [-0.5, -0.6, -0.75, -1.0, -0.35, -0.75], '#d8c8a8', 0.07);
    pg(ctx, [0.5, -0.6, 0.75, -1.0, 0.35, -0.75], '#d8c8a8', 0.07);
  },

  imp(ctx, f) {
    const wy = f ? -0.9 : -0.5;
    pg(ctx, [-0.2, -0.1, -1.0, wy, -0.8, 0.1], '#8a1a1a', 0.08);
    pg(ctx, [0.2, -0.1, 1.0, wy, 0.8, 0.1], '#8a1a1a', 0.08);
    ln(ctx, -0.3, 0.5, -0.8, 0.85, 0.06, '#c8342a');
    el(ctx, 0, 0.15, 0.55, 0.62, '#e0442a');
    pg(ctx, [-0.35, -0.3, -0.5, -0.9, -0.1, -0.45], '#ffd8a0', 0.07);
    pg(ctx, [0.35, -0.3, 0.5, -0.9, 0.1, -0.45], '#ffd8a0', 0.07);
    eyes(ctx, 0.15, -0.05, 0.16, 0.1, '#ffe84a', OUT);
    ln(ctx, 0.0, 0.3, 0.3, 0.32, 0.05, OUT);
  },

  crawler(ctx, f) {
    for (let i = 0; i < 3; i++) {
      const x = -0.5 + i * 0.5, o = (i + f) % 2 ? 0.1 : -0.1;
      ln(ctx, x, 0.3, x - 0.25 + o, 0.85, 0.1, '#3a2018');
      ln(ctx, x, 0.3, x + 0.25 - o, 0.85, 0.1, '#3a2018');
    }
    el(ctx, 0, 0.1, 0.95, 0.65, '#4a2a22');
    ctx.strokeStyle = f ? '#ffb040' : '#ff7a2a';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(-0.6, 0.0); ctx.lineTo(-0.2, 0.2); ctx.lineTo(0.1, -0.15); ctx.lineTo(0.5, 0.15);
    ctx.moveTo(-0.3, 0.45); ctx.lineTo(0.0, 0.25); ctx.lineTo(0.3, 0.45);
    ctx.stroke();
    eyes(ctx, 0.62, -0.1, 0.13, 0.08, '#ffd84a');
  },

  shade(ctx, f) {
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(-0.6, 0.9);
    ctx.lineTo(-0.7, -0.2);
    ctx.quadraticCurveTo(-0.6, -1.0, 0, -1.0);
    ctx.quadraticCurveTo(0.6, -1.0, 0.7, -0.2);
    ctx.lineTo(0.6, 0.9);
    for (let i = 0; i < 4; i++) {
      const x = 0.6 - (i + 0.5) * 0.3;
      ctx.lineTo(x, 0.6 + ((i + f) % 2) * 0.2);
      ctx.lineTo(x - 0.15, 0.9);
    }
    ctx.closePath();
    fs(ctx, '#2a1a3a', 0.1);
    ctx.globalAlpha = 1;
    el(ctx, 0.05, -0.35, 0.14, 0.08, '#d07aff', 0.02);
    el(ctx, 0.4, -0.35, 0.13, 0.08, '#d07aff', 0.02);
  },

  watcher(ctx, f) {
    for (let i = 0; i < 3; i++) {
      const x = -0.4 + i * 0.4, w = (i + f) % 2 ? 0.25 : -0.25;
      ctx.beginPath();
      ctx.moveTo(x, 0.5);
      ctx.quadraticCurveTo(x + w, 0.8, x - w * 0.5, 1.15);
      ctx.lineWidth = 0.26;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      ctx.lineWidth = 0.14;
      ctx.strokeStyle = '#a07ab8';
      ctx.stroke();
    }
    el(ctx, 0, 0, 0.85, 0.8, '#f2e8f6');
    ln(ctx, -0.6, -0.2, -0.35, -0.05, 0.03, '#e05a6a');
    ln(ctx, -0.5, 0.4, -0.3, 0.2, 0.03, '#e05a6a');
    el(ctx, 0.25, 0, 0.38, 0.4, '#8a3ad0', 0.07);
    dot(ctx, 0.32, 0, 0.17, OUT);
    dot(ctx, 0.2, -0.12, 0.08, '#fff');
  },

  brazier(ctx, f) {
    ln(ctx, 0, 0.0, 0, 1.1, 0.18, '#5a3a1a');
    el(ctx, 0, 1.1, 0.45, 0.14, '#4a3020');
    rr(ctx, -0.45, -0.85, 0.9, 0.9, 0.12, '#3a2a1a');
    rr(ctx, -0.32, -0.72, 0.64, 0.64, 0.1, f ? '#ffe27a' : '#ffc84a', 0.05);
    pg(ctx, [-0.55, -0.85, 0.55, -0.85, 0, -1.25], '#5a3a1a', 0.08);
  },

  drake(ctx, f) {
    const wy = f ? -1.2 : -0.85;
    pg(ctx, [-0.3, -0.2, -1.3, wy, -1.1, 0.1, -0.7, 0.0], '#8a1a2a');
    pg(ctx, [-0.1, -0.3, -0.9, wy - 0.2, -0.5, 0.0], '#a8243a', 0.08);
    ln(ctx, -0.6, 0.5, -1.2, 0.8, 0.2, '#c8342a');
    pg(ctx, [-1.2, 0.8, -1.45, 0.6, -1.4, 1.0], '#ffb040', 0.06);
    feet(ctx, f, '#6a1a1a', 0.92, 0.35);
    el(ctx, -0.1, 0.25, 0.75, 0.65, '#c8342a');
    el(ctx, 0.05, 0.4, 0.45, 0.4, '#ffc870', 0.07);
    ln(ctx, 0.3, -0.1, 0.55, -0.55, 0.32, '#c8342a');
    el(ctx, 0.75, -0.7, 0.45, 0.32, '#c8342a');
    pg(ctx, [0.5, -0.95, 0.35, -1.35, 0.7, -0.98], '#ffd8a0', 0.06);
    pg(ctx, [0.8, -0.98, 0.85, -1.4, 1.0, -0.95], '#ffd8a0', 0.06);
    dot(ctx, 0.85, -0.75, 0.09, '#ffe84a');
    dot(ctx, 1.08, -0.6, 0.05, OUT);
  },

  sovereign(ctx, f) {
    // cape
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.35);
    ctx.quadraticCurveTo(-1.2, 0.4, -0.95 + (f ? 0.08 : 0), 1.0);
    ctx.lineTo(0.95 - (f ? 0.08 : 0), 1.0);
    ctx.quadraticCurveTo(1.2, 0.4, 0.5, -0.35);
    ctx.closePath();
    fs(ctx, '#1a0a2a');
    pg(ctx, [-0.45, 0.95, -0.35, -0.25, 0.35, -0.25, 0.45, 0.95], '#3a1a5a');
    ln(ctx, 0, -0.2, 0, 0.9, 0.06, '#a05aff');
    ln(ctx, 0.85, -1.1, 0.85, 0.95, 0.09, '#2a2a3a');
    circle(ctx, 0.85, -1.15, 0.2);
    fs(ctx, '#d07aff', 0.07);
    el(ctx, 0.02, -0.6, 0.42, 0.42, '#d8d0e8');
    el(ctx, -0.08, -0.6, 0.11, 0.06, '#fff', 0.03);
    el(ctx, 0.2, -0.6, 0.11, 0.06, '#fff', 0.03);
    pg(ctx, [-0.42, -0.85, -0.42, -1.3, -0.2, -1.05, 0.02, -1.4, 0.24, -1.05, 0.46, -1.3, 0.46, -0.85], GOLDC, 0.08);
  },
};
PAINT.titan = PAINT.golem;

function paintSlime(ctx, f, col, dark) {
  const sq = f ? 1.08 : 0.94;
  ctx.beginPath();
  ctx.moveTo(-0.95 * sq, 0.85);
  ctx.quadraticCurveTo(-1.0 * sq, -0.9 / sq, 0, -0.85 / sq);
  ctx.quadraticCurveTo(1.0 * sq, -0.9 / sq, 0.95 * sq, 0.85);
  ctx.closePath();
  fs(ctx, col);
  el(ctx, -0.35, -0.35 / sq, 0.18, 0.12, 'rgba(255,255,255,0.7)', 0.01);
  eyes(ctx, 0.25, 0.05, 0.22, 0.12, '#fff', OUT);
  ln(ctx, 0.15, 0.42, 0.45, 0.42, 0.05, dark);
}

function paintBeast(ctx, f, col, dark, eye, horns) {
  const o = f ? 0.12 : -0.12;
  ln(ctx, -0.55, 0.4, -0.65 + o, 0.9, 0.16, dark);
  ln(ctx, 0.45, 0.4, 0.55 - o, 0.9, 0.16, dark);
  ln(ctx, -0.8, 0.0, -1.15, -0.35 + o, 0.14, col);
  el(ctx, -0.05, 0.2, 0.85, 0.48, col);
  ln(ctx, -0.35, 0.45, -0.25 - o, 0.9, 0.16, col);
  ln(ctx, 0.25, 0.45, 0.35 + o, 0.9, 0.16, col);
  el(ctx, 0.72, -0.25, 0.45, 0.4, col);
  el(ctx, 1.02, -0.12, 0.2, 0.16, dark, 0.07);
  pg(ctx, [0.45, -0.5, 0.48, -0.95, 0.72, -0.6], col, 0.08);
  if (horns) pg(ctx, [0.6, -0.6, 0.85, -1.0, 0.82, -0.6], '#ffd8a0', 0.06);
  dot(ctx, 0.82, -0.32, 0.09, eye);
}

// Crown drawn above bosses' heads.
function paintCrown(ctx, y) {
  pg(ctx, [-0.4, y + 0.25, -0.4, y - 0.15, -0.2, y + 0.05, 0, y - 0.25, 0.2, y + 0.05, 0.4, y - 0.15, 0.4, y + 0.25], GOLDC, 0.08);
  dot(ctx, 0, y + 0.08, 0.07, '#ff4a6a');
}

// ----- sprite cache -----
// Half-size of each sprite canvas in body radii (just enough for hats, wings and staffs).
const SPRITE_PAD = { bat: 1.45, archer: 1.45, drake: 1.65, sovereign: 1.65 };

const Sprites = {
  cache: new Map(),
  clear() { this.cache.clear(); },
  // look: painter key or hero look object; rpx: body radius in device pixels
  get(key, look, frame, flip, variant, rpx, tint) {
    const R = Math.max(2, Math.round(rpx));
    const ck = key + '|' + frame + '|' + (flip ? 1 : 0) + '|' + variant + '|' + R;
    let c = this.cache.get(ck);
    if (c) return c;
    let pad = typeof look === 'object' ? 1.95 : SPRITE_PAD[look] || 1.38;
    if (variant === 'elite') pad += 0.35;
    if (variant === 'boss') pad = Math.max(pad, 1.85) + 0.25;
    const size = Math.ceil(R * pad * 2);
    c = makeCanvas(size, size);
    const x = c.getContext('2d');
    x.translate(size / 2, size / 2);
    x.scale(R, R);
    if (flip) x.scale(-1, 1);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    const paint = typeof look === 'object' ? PAINT.hero : PAINT[look] || PAINT.skeleton;
    if (variant === 'elite') {
      x.shadowColor = '#ffd84a';
      x.shadowBlur = R * 0.6;
    }
    if (variant === 'boss') {
      x.shadowColor = tint || '#ff4a4a';
      x.shadowBlur = R * 0.35;
    }
    paint(x, frame, look);
    x.shadowBlur = 0;
    if (variant === 'flash') {
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = 'rgba(255,255,255,0.85)';
      x.fillRect(-pad, -pad, pad * 2, pad * 2);
    } else if (variant === 'frozen') {
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = 'rgba(150,220,255,0.55)';
      x.fillRect(-pad, -pad, pad * 2, pad * 2);
    } else if (variant === 'boss' && tint) {
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = rgba(tint, 0.3);
      x.fillRect(-pad, -pad, pad * 2, pad * 2);
    }
    x.globalCompositeOperation = 'source-over';
    if (variant === 'boss' && key !== 'sovereign') paintCrown(x, -1.45);
    this.cache.set(ck, c);
    return c;
  },
};

// ----- pickups -----
const GEM_COLS = [['#4ab8ff', '#bfe8ff'], ['#4aff8a', '#c8ffd8'], ['#ff4a6a', '#ffc0cc']];
function gemTier(v) { return v <= 2 ? 0 : v <= 12 ? 1 : 2; }

const DROP_PAINT = {
  gem(x, t) {
    const [c, l] = GEM_COLS[t];
    pg(x, [0, -1, 0.7, -0.1, 0, 1, -0.7, -0.1], c, 0.14);
    pg(x, [0, -1, 0.7, -0.1, 0, 0.1, -0.35, -0.3], l, 0.0001);
  },
  heart(x) {
    x.beginPath();
    x.moveTo(0, 0.9);
    x.bezierCurveTo(-1.3, 0, -0.7, -1.1, 0, -0.45);
    x.bezierCurveTo(0.7, -1.1, 1.3, 0, 0, 0.9);
    fs(x, '#ff4a6a', 0.14);
    el(x, -0.4, -0.35, 0.18, 0.12, '#ffc0cc', 0.01);
  },
  coin(x) {
    el(x, 0, 0, 0.8, 0.85, '#ffcc33', 0.14);
    el(x, 0, 0, 0.5, 0.55, '#ffe27a', 0.06);
  },
  bag(x) {
    el(x, 0, 0.25, 0.85, 0.75, '#a8743a', 0.14);
    pg(x, [-0.35, -0.45, 0.35, -0.45, 0.5, -0.85, -0.5, -0.85], '#a8743a', 0.12);
    x.fillStyle = GOLDC;
    x.font = '900 1px system-ui';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('$', 0, 0.3);
  },
  magnet(x) {
    x.beginPath();
    x.arc(0, 0, 0.65, Math.PI, 0, true);
    x.lineWidth = 0.6;
    x.strokeStyle = OUT;
    x.stroke();
    x.lineWidth = 0.42;
    x.strokeStyle = '#e83a3a';
    x.stroke();
    rr(x, -0.86, -0.6, 0.42, 0.45, 0.05, '#dde', 0.1);
    rr(x, 0.44, -0.6, 0.42, 0.45, 0.05, '#dde', 0.1);
  },
  bomb(x) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ln(x, Math.cos(a) * 0.5, Math.sin(a) * 0.5, Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0.12, '#fff3a8');
    }
    el(x, 0, 0, 0.6, 0.6, '#fff8d8', 0.12);
    el(x, 0, 0, 0.35, 0.35, '#ffd84a', 0.04);
  },
  chest(x, t) {
    const body = t ? '#7a3ab8' : '#a8642a', trim = GOLDC;
    rr(x, -1, -0.3, 2, 1.2, 0.15, body, 0.14);
    x.beginPath();
    x.moveTo(-1, -0.25);
    x.quadraticCurveTo(0, -1.25, 1, -0.25);
    x.closePath();
    fs(x, shade(body, 0.15), 0.14);
    rr(x, -1.05, -0.35, 2.1, 0.18, 0.05, trim, 0.08);
    rr(x, -0.2, -0.45, 0.4, 0.5, 0.08, trim, 0.08);
    dot(x, 0, -0.22, 0.07, OUT);
  },
};

const DropSprites = {
  cache: new Map(),
  get(k, tier, rpx) {
    const R = Math.max(2, Math.round(rpx));
    const ck = k + tier + '|' + R;
    let c = this.cache.get(ck);
    if (c) return c;
    const size = Math.ceil(R * 2.6);
    c = makeCanvas(size, size);
    const x = c.getContext('2d');
    x.translate(size / 2, size / 2);
    x.scale(R, R);
    x.lineJoin = 'round';
    DROP_PAINT[k](x, tier);
    this.cache.set(ck, c);
    return c;
  },
};

// ----- item icons (weapons, passives, power-ups) -----
function star(ctx, x, y, r, col) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr2 = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  ctx.closePath();
  fs(ctx, col, 0.08);
}

const ICON = {
  bolt(x, c) {
    ln(x, -0.75, 0.75, 0.0, 0.0, 0.25, rgba(c, 0.5));
    el(x, 0.15, -0.15, 0.48, 0.48, c, 0.12);
    el(x, 0.05, -0.28, 0.18, 0.15, '#fff', 0.01);
  },
  slash(x, c) {
    x.beginPath();
    x.arc(-0.3, 0.3, 1.0, -1.45, 0.15);
    x.arc(-0.45, 0.45, 0.7, 0.15, -1.45, true);
    x.closePath();
    fs(x, c, 0.12);
  },
  blades(x, c) {
    el(x, 0, 0, 0.18, 0.18, '#fff', 0.08);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU - 0.4;
      x.save();
      x.translate(Math.cos(a) * 0.6, Math.sin(a) * 0.6);
      x.rotate(a + Math.PI / 2);
      pg(x, [0, -0.45, 0.16, 0, 0, 0.3, -0.16, 0], c, 0.1);
      x.restore();
    }
  },
  aura(x, c) {
    for (const [r, a] of [[0.95, 0.3], [0.7, 0.55], [0.42, 1]]) {
      circle(x, 0, 0, r);
      x.fillStyle = rgba(c, a);
      x.fill();
    }
    circle(x, 0, 0, 0.95);
    x.lineWidth = 0.1;
    x.strokeStyle = OUT;
    x.stroke();
    star(x, 0, 0, 0.3, '#fff');
  },
  boomerang(x, c) { pg(x, [-0.85, -0.2, 0.0, -0.75, 0.85, -0.2, 0.7, 0.05, 0.0, -0.35, -0.7, 0.05], c, 0.12); pg(x, [-0.3, 0.1, 0, -0.15, 0.3, 0.1, 0, 0.75], c, 0.12); },
  lightning(x, c) { pg(x, [0.2, -1, -0.55, 0.1, -0.05, 0.1, -0.3, 1, 0.55, -0.15, 0.05, -0.15, 0.35, -1], c, 0.12); },
  flask(x, c) {
    rr(x, -0.18, -0.95, 0.36, 0.4, 0.06, '#cfe4ff', 0.1);
    x.beginPath();
    x.moveTo(-0.2, -0.6);
    x.lineTo(-0.7, 0.55);
    x.quadraticCurveTo(-0.75, 0.85, -0.45, 0.85);
    x.lineTo(0.45, 0.85);
    x.quadraticCurveTo(0.75, 0.85, 0.7, 0.55);
    x.lineTo(0.2, -0.6);
    x.closePath();
    fs(x, '#cfe4ff', 0.1);
    pg(x, [-0.52, 0.2, 0.52, 0.2, 0.66, 0.6, 0.45, 0.78, -0.45, 0.78, -0.66, 0.6], c, 0.05);
  },
  frost(x, c) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      ln(x, Math.cos(a) * -0.9, Math.sin(a) * -0.9, Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.16, c);
    }
    el(x, 0, 0, 0.22, 0.22, '#fff', 0.08);
  },
  orb(x, c) {
    x.setLineDash([0.15, 0.15]);
    ln(x, -0.9, 0.6, -0.3, -0.5, 0.06, rgba(c, 0.8));
    ln(x, -0.3, -0.5, 0.2, 0.2, 0.06, rgba(c, 0.8));
    x.setLineDash([]);
    el(x, 0.35, 0.25, 0.5, 0.5, c, 0.12);
    el(x, 0.22, 0.1, 0.16, 0.13, '#fff', 0.01);
  },
  beam(x, c) {
    ln(x, -0.6, 0.6, 0.95, -0.95, 0.32, c);
    ln(x, -0.6, 0.6, 0.95, -0.95, 0.1, '#fff');
    el(x, -0.6, 0.6, 0.36, 0.36, '#6a5a8a', 0.12);
  },
  drones(x, c) {
    ln(x, -0.75, -0.55, 0.75, -0.55, 0.1, '#888');
    el(x, -0.75, -0.6, 0.3, 0.08, '#ccc', 0.06);
    el(x, 0.75, -0.6, 0.3, 0.08, '#ccc', 0.06);
    rr(x, -0.45, -0.5, 0.9, 0.6, 0.2, c, 0.12);
    dot(x, 0, -0.2, 0.12, '#fff');
    pg(x, [-0.12, 0.35, 0.12, 0.35, 0.12, 0.8, 0, 0.98, -0.12, 0.8], '#ff7a3a', 0.08);
  },
  runes(x, c) {
    circle(x, 0, 0.2, 0.75);
    x.lineWidth = 0.14;
    x.strokeStyle = c;
    x.stroke();
    pg(x, [-0.4, 0.5, -0.2, -0.6, 0, 0.2, 0.2, -0.85, 0.4, 0.5], c, 0.1);
  },
  might(x, c) { DROP_PAINT.heart(x); pg(x, [0, -0.2, 0.25, 0.2, 0.05, 0.1, 0, 0.45, -0.05, 0.1, -0.25, 0.2], '#ffd84a', 0.06); },
  haste(x, c) {
    rr(x, -0.6, -0.95, 1.2, 0.18, 0.06, '#8a5a2b', 0.08);
    rr(x, -0.6, 0.77, 1.2, 0.18, 0.06, '#8a5a2b', 0.08);
    pg(x, [-0.45, -0.77, 0.45, -0.77, 0.08, 0, 0.45, 0.77, -0.45, 0.77, -0.08, 0], '#cff4ff', 0.1);
    pg(x, [-0.25, 0.75, 0.25, 0.75, 0, 0.35], c, 0.04);
  },
  area(x, c) {
    ln(x, 0.35, 0.35, 0.85, 0.85, 0.22, '#8a5a2b');
    circle(x, -0.15, -0.15, 0.62);
    fs(x, rgba(c, 0.5), 0.16);
    el(x, -0.35, -0.35, 0.15, 0.1, '#fff', 0.01);
  },
  duration(x, c) {
    rr(x, -0.32, -0.25, 0.64, 1.1, 0.1, c, 0.1);
    ln(x, 0, -0.25, 0, -0.45, 0.06, OUT);
    pg(x, [0, -1, 0.2, -0.6, 0, -0.42, -0.2, -0.6], '#ffb040', 0.06);
  },
  multishot(x, c) {
    for (const s of [-1, 1]) {
      rr(x, s * 0.35 - 0.2, -0.1, 0.4, 0.95, 0.08, '#fff0d0', 0.1);
      pg(x, [s * 0.35, -0.8, s * 0.35 + 0.17, -0.38, s * 0.35, -0.22, s * 0.35 - 0.17, -0.38], c, 0.06);
    }
  },
  swiftness(x, c) {
    pg(x, [-0.5, -0.8, 0.1, -0.8, 0.1, 0.3, 0.8, 0.45, 0.8, 0.8, -0.5, 0.8], '#8a5a2b', 0.12);
    pg(x, [-0.45, -0.5, -1.0, -0.85, -0.95, -0.3, -0.5, -0.2], c, 0.08);
    pg(x, [-0.45, -0.15, -1.0, -0.35, -0.9, 0.1, -0.5, 0.15], c, 0.08);
  },
  vitality(x, c) { DROP_PAINT.heart(x); pg(x, [0.15, -0.6, 0.65, -1.0, 0.55, -0.55], '#6fe07a', 0.06); },
  regen(x, c) {
    x.beginPath();
    x.moveTo(-0.7, 0.75);
    x.quadraticCurveTo(-0.9, -0.6, 0.8, -0.85);
    x.quadraticCurveTo(0.7, 0.75, -0.7, 0.75);
    fs(x, c, 0.12);
    ln(x, -0.7, 0.75, 0.4, -0.4, 0.06, '#2f8a3a');
  },
  magnet(x) { DROP_PAINT.magnet(x); },
  luck(x, c) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      el(x, Math.cos(a) * 0.38, Math.sin(a) * 0.38 - 0.1, 0.36, 0.36, c, 0.1);
    }
    ln(x, 0, 0.2, 0.3, 0.95, 0.1, '#2f8a3a');
  },
  armor(x, c) {
    x.beginPath();
    x.moveTo(-0.75, -0.75);
    x.lineTo(0.75, -0.75);
    x.lineTo(0.7, 0.2);
    x.quadraticCurveTo(0.4, 0.75, 0, 0.95);
    x.quadraticCurveTo(-0.4, 0.75, -0.7, 0.2);
    x.closePath();
    fs(x, c, 0.12);
    pg(x, [-0.1, -0.55, 0.1, -0.55, 0.1, 0.6, -0.1, 0.6], '#fff', 0.04);
  },
  velocity(x, c) {
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.arc(-0.1 + i * 0.1, -0.1, 0.25 + i * 0.25, Math.PI * 0.9, Math.PI * 2.1);
      x.lineWidth = 0.22;
      x.strokeStyle = OUT;
      x.stroke();
      x.lineWidth = 0.12;
      x.strokeStyle = c;
      x.stroke();
    }
    ln(x, -0.9, 0.6, 0.6, 0.6, 0.12, c);
  },
  growth(x) { pg(x, [0, -0.95, 0.75, -0.1, 0.3, -0.1, 0.3, 0.85, -0.3, 0.85, -0.3, -0.1, -0.75, -0.1], '#6fe07a', 0.12); },
  greed(x) { for (let i = 0; i < 3; i++) el(x, 0, 0.55 - i * 0.4, 0.8, 0.3, i === 2 ? '#ffe27a' : '#ffcc33', 0.1); },
  revival(x) {
    pg(x, [-0.12, -0.2, 0.12, -0.2, 0.12, 0.95, -0.12, 0.95], '#ffd84a', 0.1);
    pg(x, [-0.6, 0.05, 0.6, 0.05, 0.6, 0.3, -0.6, 0.3], '#ffd84a', 0.1);
    circle(x, 0, -0.55, 0.36);
    x.lineWidth = 0.26;
    x.strokeStyle = OUT;
    x.stroke();
    x.lineWidth = 0.14;
    x.strokeStyle = '#ffd84a';
    x.stroke();
  },
  reroll(x) {
    x.beginPath();
    x.arc(0, 0, 0.65, 0.3, Math.PI * 1.6);
    x.lineWidth = 0.34;
    x.strokeStyle = OUT;
    x.stroke();
    x.lineWidth = 0.2;
    x.strokeStyle = '#7fe0ff';
    x.stroke();
    pg(x, [0.25, -0.95, 0.85, -0.65, 0.3, -0.3], '#7fe0ff', 0.08);
  },
  skip(x) {
    pg(x, [-0.85, -0.6, -0.1, 0, -0.85, 0.6], '#ffd84a', 0.1);
    pg(x, [-0.1, -0.6, 0.65, 0, -0.1, 0.6], '#ffd84a', 0.1);
    rr(x, 0.65, -0.6, 0.2, 1.2, 0.05, '#ffd84a', 0.08);
  },
  banish(x) {
    el(x, 0, 0, 0.85, 0.85, '#ff6a5a', 0.12);
    ln(x, -0.4, -0.4, 0.4, 0.4, 0.2, '#fff');
    ln(x, 0.4, -0.4, -0.4, 0.4, 0.2, '#fff');
  },
  gold(x) { DROP_PAINT.bag(x); },
  heal(x) { DROP_PAINT.heart(x); },
};

const Icons = {
  cache: new Map(),
  // Returns a canvas of size px with the icon of a weapon / passive / power-up key.
  canvas(key, px) {
    const ck = key + '@' + px;
    let c = this.cache.get(ck);
    if (c) return c;
    c = makeCanvas(px, px);
    const x = c.getContext('2d');
    x.translate(px / 2, px / 2);
    x.scale(px * 0.4, px * 0.4);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    const wd = WEAPONS[key];
    const base = wd && wd.evolved ? wd.evolved : key;
    const col = wd ? wd.col : PASSIVES[key] ? PASSIVES[key].col : '#fff';
    if (wd && wd.evolved) {
      const g = x.createRadialGradient(0, 0, 0.2, 0, 0, 1.25);
      g.addColorStop(0, rgba(col, 0.9));
      g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g;
      x.fillRect(-1.25, -1.25, 2.5, 2.5);
    }
    const p = ICON[base] || ICON[(POWERUPS[key] && POWERUPS[key].icon) || ''] || ICON.might;
    p(x, col);
    if (wd && wd.evolved) star(x, 0.72, -0.72, 0.32, '#fff6a8');
    this.cache.set(ck, c);
    return c;
  },
  url(key, px) {
    const ck = 'u:' + key + '@' + px;
    let u = this.cache.get(ck);
    if (!u) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      u = this.canvas(key, Math.round(px * dpr)).toDataURL();
      this.cache.set(ck, u);
    }
    return u;
  },
};

// ----- ground and decorations -----
function groundTile(stage, px) {
  const c = makeCanvas(px, px);
  const x = c.getContext('2d');
  const rng = new RNG(hashStr(stage.key));
  const [g0, g1, g2] = stage.ground;
  x.fillStyle = g0;
  x.fillRect(0, 0, px, px);
  const k = px / 256;
  // soft blotches (wrapped so the tile repeats seamlessly)
  for (let i = 0; i < 26; i++) {
    const cx = rng.range(0, px), cy = rng.range(0, px), r = rng.range(18, 52) * k;
    x.fillStyle = rgba(rng.chance(0.5) ? g1 : g2, 0.55);
    for (const ox of [-px, 0, px]) for (const oy of [-px, 0, px]) {
      ellipse(x, cx + ox, cy + oy, r, r * 0.7);
      x.fill();
    }
  }
  // details
  for (let i = 0; i < 70; i++) {
    const cx = rng.range(0, px), cy = rng.range(0, px);
    x.fillStyle = rgba(stage.accent, rng.range(0.25, 0.6));
    if (stage.decor === 'grave' || stage.decor === 'ice') {
      x.fillRect(cx, cy, 1.5 * k, 4 * k);
      x.fillRect(cx + 2 * k, cy + 1 * k, 1.5 * k, 3 * k);
    } else if (stage.decor === 'lava') {
      x.fillRect(cx, cy, 2.5 * k, 1.5 * k);
    } else {
      x.fillRect(cx, cy, 2 * k, 2 * k);
    }
  }
  if (stage.decor === 'lava') {
    x.strokeStyle = 'rgba(255,110,40,0.35)';
    x.lineWidth = 1.6 * k;
    for (let i = 0; i < 6; i++) {
      let cx = rng.range(0, px), cy = rng.range(0, px);
      x.beginPath();
      x.moveTo(cx, cy);
      for (let j = 0; j < 4; j++) { cx += rng.range(-18, 18) * k; cy += rng.range(-18, 18) * k; x.lineTo(cx, cy); }
      x.stroke();
    }
  }
  if (stage.decor === 'void') {
    x.strokeStyle = 'rgba(160,90,255,0.18)';
    x.lineWidth = 1.2 * k;
    for (let i = 0; i <= 4; i++) {
      x.beginPath(); x.moveTo(i * 64 * k, 0); x.lineTo(i * 64 * k, px); x.stroke();
      x.beginPath(); x.moveTo(0, i * 64 * k); x.lineTo(px, i * 64 * k); x.stroke();
    }
  }
  return c;
}

const DECOR = {
  grave: [
    (x) => { rr(x, -0.55, -0.9, 1.1, 1.7, 0.5, '#6a7488'); ln(x, -0.25, -0.35, 0.25, -0.35, 0.08, '#4a5468'); ln(x, 0, -0.6, 0, 0.0, 0.08, '#4a5468'); el(x, 0, 0.85, 0.8, 0.18, '#3a4a3a', 0.08); },
    (x) => { pg(x, [-0.12, -1, 0.12, -1, 0.12, -0.55, 0.5, -0.55, 0.5, -0.32, 0.12, -0.32, 0.12, 0.9, -0.12, 0.9, -0.12, -0.32, -0.5, -0.32, -0.5, -0.55, -0.12, -0.55], '#8a8070'); },
    (x) => { ln(x, 0, 1, 0, -0.4, 0.22, '#3a2a2a'); ln(x, 0, -0.1, -0.6, -0.7, 0.12, '#3a2a2a'); ln(x, 0, -0.3, 0.55, -0.95, 0.12, '#3a2a2a'); ln(x, -0.3, -0.4, -0.35, -0.95, 0.08, '#3a2a2a'); },
  ],
  ice: [
    (x) => { pg(x, [-0.9, 0.8, -0.6, -0.3, -0.1, -0.9, 0.5, -0.4, 0.9, 0.8], '#cfe8ff'); pg(x, [-0.1, -0.9, 0.5, -0.4, 0.2, 0.2], '#ffffff', 0.05); },
    (x) => { ln(x, 0, 1, 0, 0.6, 0.2, '#5a3a2a'); pg(x, [-0.8, 0.65, 0, -1.0, 0.8, 0.65], '#3a6a5a'); pg(x, [-0.45, -0.1, 0, -1.0, 0.45, -0.1], '#f2f8ff', 0.06); },
  ],
  lava: [
    (x) => { pg(x, [-0.9, 0.7, -0.7, -0.2, -0.2, -0.6, 0.4, -0.5, 0.9, 0.7], '#3a2826'); ln(x, -0.4, 0.4, 0.3, -0.1, 0.06, '#ff7a2a'); },
    (x) => { el(x, 0, 0.3, 0.9, 0.45, '#ff6a1a', 0.12); el(x, 0, 0.3, 0.6, 0.28, '#ffc84a', 0.02); },
  ],
  void: [
    (x) => { pg(x, [-0.3, 0.9, -0.45, -0.4, 0, -1.0, 0.45, -0.4, 0.3, 0.9], '#5a3a9a'); pg(x, [0, -1.0, 0.45, -0.4, 0.1, 0.3], '#a07aff', 0.05); },
    (x) => { rr(x, -0.45, -1.0, 0.9, 1.9, 0.08, '#3a2e52'); rr(x, -0.6, -1.1, 1.2, 0.25, 0.05, '#4a3e62'); rr(x, -0.6, 0.75, 1.2, 0.25, 0.05, '#4a3e62'); },
  ],
};

const DecorSprites = {
  cache: new Map(),
  get(kind, i, rpx) {
    const R = Math.max(2, Math.round(rpx));
    const ck = kind + i + '|' + R;
    let c = this.cache.get(ck);
    if (c) return c;
    const size = Math.ceil(R * 2.4);
    c = makeCanvas(size, size);
    const x = c.getContext('2d');
    x.translate(size / 2, size / 2);
    x.scale(R, R);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    DECOR[kind][i](x);
    this.cache.set(ck, c);
    return c;
  },
};

// Soft round glow used for lights and projectiles.
const Glow = {
  cache: new Map(),
  get(col, px) {
    const R = Math.max(2, Math.round(px));
    const ck = col + R;
    let c = this.cache.get(ck);
    if (c) return c;
    c = makeCanvas(R * 2, R * 2);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(R, R, 0, R, R, R);
    g.addColorStop(0, rgba(col, 1));
    g.addColorStop(0.35, rgba(col, 0.55));
    g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, R * 2, R * 2);
    this.cache.set(ck, c);
    return c;
  },
};
