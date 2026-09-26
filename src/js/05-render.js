// ---------- Stickman skeleton, poses & drawing ----------
// Angles: arms/legs measured from straight down; positive = toward facing direction.
// a2 = relative bend of forearm / shin.
const POSE_KEYS = ['lean', 'ba1', 'ba2', 'fa1', 'fa2', 'bl1', 'bl2', 'fl1', 'fl2', 'head'];
function mkPose(lean, ba1, ba2, fa1, fa2, bl1, bl2, fl1, fl2, extra) {
  return Object.assign({ lean, ba1, ba2, fa1, fa2, bl1, bl2, fl1, fl2, head: 0, w: null }, extra || {});
}
function lerpPose(a, b, t) {
  const o = {};
  for (const k of POSE_KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  if (a.w != null || b.w != null) {
    const aw = a.w != null ? a.w : b.w;
    const bw = b.w != null ? b.w : a.w;
    o.w = aw + (bw - aw) * t;
  } else o.w = null;
  return o;
}

const PZ = {
  stand: mkPose(0.06, 0.4, 1.3, 0.6, 1.4, -0.2, 0.05, 0.2, -0.1),
  jump: mkPose(0.05, 2.2, 0.5, 2.6, 0.4, 0.3, -1.4, 1.0, -1.5),
  fall: mkPose(0.0, 1.8, 0.6, 2.0, 0.5, -0.3, -0.5, 0.4, -0.7),
  dash: mkPose(0.85, -1.2, 0.3, -0.9, 0.3, -0.7, -0.4, 1.1, -0.3),
  hurt: mkPose(-0.45, 2.3, 0.8, 2.0, 0.9, 0.35, -0.5, 0.6, -0.3),
  crouch: mkPose(0.35, 0.8, 1.4, 1.0, 1.5, -0.1, -1.9, 1.2, -1.7),
  cast: mkPose(0.12, 1.2, 0.3, 1.6, 0.0, -0.3, 0.05, 0.35, -0.15),
  castUp: mkPose(-0.05, 2.9, 0.2, 3.0, 0.1, -0.2, 0.0, 0.2, 0.0),
  victory: mkPose(-0.05, 0.5, 0.4, 3.05, 0.1, -0.15, 0.0, 0.15, 0.0),
  down: mkPose(1.45, 0.8, 0.2, 1.2, 0.2, 1.4, -0.2, 1.5, -0.1),
  walkSlow: mkPose(0.05, 0.3, 0.3, 0.3, 0.3, -0.2, 0, 0.2, -0.1),
  windup: mkPose(-0.15, 0.6, 1.4, 2.8, 0.6, -0.4, 0.05, 0.4, -0.3),
  strike: mkPose(0.35, 0.3, 1.0, 1.3, 0.1, -0.55, 0.1, 0.65, -0.45),
  aim: mkPose(0.0, 1.57, 0.0, 1.45, 1.6, -0.3, 0.05, 0.3, -0.1),
  throwBack: mkPose(-0.2, 0.6, 1.0, 3.6, 0.5, -0.3, 0.0, 0.4, -0.2),
  throwFwd: mkPose(0.3, 0.4, 1.0, 1.6, 0.2, -0.5, 0.0, 0.6, -0.4),
  shieldUp: mkPose(0.1, 1.4, 1.3, 0.5, 1.3, -0.25, 0.05, 0.3, -0.15),
};

function runPose(ph, lean = 0.3) {
  const s = Math.sin(ph), c = Math.cos(ph);
  const s2 = Math.sin(ph + Math.PI), c2 = Math.cos(ph + Math.PI);
  return mkPose(
    lean,
    0.25 + 0.95 * s, 1.5,
    0.25 - 0.95 * s, 1.5,
    0.85 * s2, -(0.25 + 1.3 * Math.max(0, c2)),
    0.85 * s, -(0.25 + 1.3 * Math.max(0, c))
  );
}
function walkPose(ph) {
  const s = Math.sin(ph), c = Math.cos(ph);
  return mkPose(0.08, 0.15 + 0.5 * s, 0.5, 0.15 - 0.5 * s, 0.5, -0.5 * s, -(0.1 + 0.6 * Math.max(0, -c)), 0.5 * s, -(0.1 + 0.6 * Math.max(0, c)));
}
function idlePose(t) {
  const b = Math.sin(t * 2.6);
  return mkPose(0.07 + b * 0.015, 0.4 + b * 0.05, 1.3, 0.6 + b * 0.05, 1.4, -0.2, 0.05 - b * 0.03, 0.2, -0.1 - b * 0.03);
}

function skel(x, y, f, s, p, grounded) {
  const TH = 11 * s, SH = 11 * s, TO = 15 * s, UA = 9.5 * s, FA = 9.5 * s, HR = 6.5 * s;
  let hipH;
  if (grounded) {
    const d1 = Math.cos(p.bl1) * TH + Math.cos(p.bl1 + p.bl2) * SH;
    const d2 = Math.cos(p.fl1) * TH + Math.cos(p.fl1 + p.fl2) * SH;
    hipH = Math.max(d1, d2, 5 * s);
  } else hipH = 21 * s;
  const hx = x, hy = y - hipH;
  const nx = hx + Math.sin(p.lean) * TO * f, ny = hy - Math.cos(p.lean) * TO;
  const ha = p.lean + (p.head || 0);
  const headX = nx + Math.sin(ha) * (HR + 1.5 * s) * f;
  const headY = ny - Math.cos(ha) * (HR + 1.5 * s);
  const shx = hx + (nx - hx) * 0.88, shy = hy + (ny - hy) * 0.88;
  const limb = (ox, oy, a1, a2, l1, l2) => {
    const ex = ox + Math.sin(a1) * l1 * f, ey = oy + Math.cos(a1) * l1;
    const a = a1 + a2;
    return [ex, ey, ex + Math.sin(a) * l2 * f, ey + Math.cos(a) * l2, a];
  };
  return {
    hx, hy, nx, ny, headX, headY, hr: HR, shx, shy, f, s, lean: p.lean,
    ba: limb(shx, shy, p.ba1, p.ba2, UA, FA),
    fa: limb(shx, shy, p.fa1, p.fa2, UA, FA),
    bl: limb(hx, hy, p.bl1, p.bl2, TH, SH),
    fl: limb(hx, hy, p.fl1, p.fl2, TH, SH),
    wAng: p.w != null ? p.w : null,
  };
}

function strokeLimbs(ctx, k, back) {
  ctx.beginPath();
  if (back) {
    ctx.moveTo(k.shx, k.shy); ctx.lineTo(k.ba[0], k.ba[1]); ctx.lineTo(k.ba[2], k.ba[3]);
    ctx.moveTo(k.hx, k.hy); ctx.lineTo(k.bl[0], k.bl[1]); ctx.lineTo(k.bl[2], k.bl[3]);
  } else {
    ctx.moveTo(k.hx, k.hy); ctx.lineTo(k.nx, k.ny);
    ctx.moveTo(k.hx, k.hy); ctx.lineTo(k.fl[0], k.fl[1]); ctx.lineTo(k.fl[2], k.fl[3]);
    ctx.moveTo(k.shx, k.shy); ctx.lineTo(k.fa[0], k.fa[1]); ctx.lineTo(k.fa[2], k.fa[3]);
  }
  ctx.stroke();
}

function drawStick(ctx, k, color, opt = {}) {
  const lw = (opt.lw || 3.4) * k.s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (opt.outline) {
    ctx.strokeStyle = opt.outline;
    ctx.lineWidth = lw + 3;
    strokeLimbs(ctx, k, true);
    strokeLimbs(ctx, k, false);
    ctx.beginPath();
    ctx.arc(k.headX, k.headY, k.hr + 1.5, 0, TAU);
    ctx.fillStyle = opt.outline;
    ctx.fill();
  }
  ctx.lineWidth = lw;
  ctx.strokeStyle = opt.back || color;
  strokeLimbs(ctx, k, true);
  ctx.strokeStyle = color;
  strokeLimbs(ctx, k, false);
  ctx.beginPath();
  ctx.arc(k.headX, k.headY, k.hr, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  if (opt.eye) {
    ctx.fillStyle = opt.eye;
    const ex = k.headX + k.f * k.hr * 0.45, ey = k.headY - k.hr * 0.1;
    if (opt.angry) {
      ctx.beginPath();
      ctx.moveTo(ex - k.f * 2.5 * k.s, ey - 2 * k.s);
      ctx.lineTo(ex + k.f * 2 * k.s, ey);
      ctx.lineTo(ex - k.f * 1.5 * k.s, ey + 1.2 * k.s);
      ctx.fill();
    } else {
      ctx.fillRect(ex - 1.2 * k.s, ey - 1.5 * k.s, 2.4 * k.s, 2.6 * k.s);
    }
  }
}

function weaponDir(k) {
  const ang = k.wAng != null ? k.wAng : k.fa[4];
  return { dx: Math.sin(ang) * k.f, dy: Math.cos(ang), ang };
}

function drawWeapon(ctx, k, wid, t) {
  if (!wid || wid === 'fists') {
    if (wid === 'fists') {
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(k.fa[2], k.fa[3], 3 * k.s, 0, TAU);
      ctx.fill();
    }
    return;
  }
  const s = k.s;
  const hx = k.fa[2], hy = k.fa[3];
  const { dx, dy } = weaponDir(k);
  const px = -dy, py = dx;
  const P = (a, b) => [hx + dx * a * s + px * b * s, hy + dy * a * s + py * b * s];
  const line = (a, b, w, c) => {
    ctx.strokeStyle = c; ctx.lineWidth = w * s;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  };
  ctx.lineCap = 'round';
  switch (wid) {
    case 'sword':
    case 'esword': {
      const blade = wid === 'sword' ? '#e0e7ec' : '#b0a8a0';
      line(P(-5, 0), P(3, 0), 3, '#5d4037');
      line(P(3, 0), P(33, 0), 3.2, blade);
      line(P(5, 0), P(31, 0), 1, '#ffffff');
      line(P(3, -5.5), P(3, 5.5), 2.6, wid === 'sword' ? '#c8a24a' : '#6d5d4b');
      break;
    }
    case 'katana': {
      line(P(-7, 0), P(3, 0), 3.2, '#b71c1c');
      ctx.strokeStyle = '#f5f9ff'; ctx.lineWidth = 2.6 * s;
      const a = P(3, 0), m = P(22, -2.2), b = P(40, -5);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(m[0], m[1], b[0], b[1]); ctx.stroke();
      ctx.fillStyle = '#37474f';
      const g = P(3, 0);
      ctx.beginPath(); ctx.arc(g[0], g[1], 2.8 * s, 0, TAU); ctx.fill();
      break;
    }
    case 'cosmic': {
      ctx.save();
      ctx.shadowColor = '#b388ff';
      ctx.shadowBlur = 10;
      line(P(-6, 0), P(3, 0), 3.4, '#311b92');
      line(P(3, 0), P(44, 0), 4.6, 'rgba(179,136,255,0.9)');
      line(P(4, 0), P(42, 0), 1.8, '#ffffff');
      ctx.restore();
      line(P(3, -6), P(3, 6), 3, '#ffd740');
      const tw = (Math.sin(t * 10) + 1) * 0.5;
      ctx.fillStyle = `rgba(255,255,255,${0.5 + tw * 0.5})`;
      const sp = P(20 + tw * 18, 0);
      ctx.fillRect(sp[0] - 1, sp[1] - 1, 2, 2);
      break;
    }
    case 'spear': {
      line(P(-24, 0), P(40, 0), 2.6, '#8d6e63');
      ctx.fillStyle = '#cfd8dc';
      const a = P(38, -4), b = P(52, 0), c = P(38, 4);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill();
      line(P(36, -3), P(36, 3), 2, '#c62828');
      break;
    }
    case 'hammer': {
      line(P(-6, 0), P(30, 0), 3, '#6d4c41');
      const c1 = P(26, -11), c2 = P(38, -11), c3 = P(38, 11), c4 = P(26, 11);
      ctx.fillStyle = '#90a4ae';
      ctx.beginPath(); ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.lineTo(c4[0], c4[1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#455a64'; ctx.lineWidth = 1.5; ctx.stroke();
      break;
    }
    case 'club': {
      line(P(-4, 0), P(30, 0), 5, '#6d4c41');
      line(P(18, 0), P(34, 0), 10, '#795548');
      break;
    }
    case 'dagger': {
      line(P(-2, 0), P(3, 0), 2.5, '#424242');
      line(P(3, 0), P(17, 0), 2.4, '#cfd8dc');
      break;
    }
    case 'staff': {
      line(P(-20, 0), P(24, 0), 2.4, '#5d4037');
      const o = P(27, 0);
      ctx.fillStyle = '#80deea';
      ctx.beginPath(); ctx.arc(o[0], o[1], 4.5 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(o[0] - 1, o[1] - 1, 1.5 * s, 0, TAU); ctx.fill();
      break;
    }
    case 'darksword': {
      ctx.save();
      ctx.shadowColor = '#d500f9';
      ctx.shadowBlur = 8;
      line(P(-6, 0), P(3, 0), 3.4, '#1a0033');
      line(P(3, 0), P(40, 0), 4.2, '#4a148c');
      line(P(5, 0), P(38, 0), 1.4, '#ea80fc');
      ctx.restore();
      line(P(3, -6), P(3, 6), 3, '#212121');
      break;
    }
    case 'bomb': {
      ctx.fillStyle = '#212121';
      ctx.beginPath(); ctx.arc(hx, hy, 5 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = (t * 8) % 1 > 0.5 ? '#ffeb3b' : '#ff5722';
      ctx.fillRect(hx + 2 * s, hy - 7 * s, 2 * s, 2 * s);
      break;
    }
  }
}

function drawBow(ctx, k, draw) {
  const s = k.s, f = k.f;
  const hx = k.ba[2], hy = k.ba[3];
  const R = 13 * s;
  const cx = hx - f * 6 * s;
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = 2.4 * s;
  ctx.beginPath();
  if (f > 0) ctx.arc(cx, hy, R, -1.1, 1.1);
  else ctx.arc(cx, hy, R, Math.PI - 1.1, Math.PI + 1.1);
  ctx.stroke();
  const ex = cx + f * Math.cos(1.1) * R, ey = Math.sin(1.1) * R;
  const px = draw ? k.fa[2] : ex, py = draw ? k.fa[3] : hy;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ex, hy - ey);
  ctx.lineTo(px, py);
  ctx.lineTo(ex, hy + ey);
  ctx.stroke();
  if (draw) {
    ctx.strokeStyle = '#d7ccc8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(hx + f * 10 * s, hy);
    ctx.stroke();
  }
}

function drawShield(ctx, k, color) {
  const s = k.s;
  const x = k.ba[2] + k.f * 4 * s, y = k.ba[3] - 2 * s;
  ctx.fillStyle = color;
  roundRect(ctx, x - 5 * s, y - 16 * s, 10 * s, 30 * s, 4 * s);
  ctx.fill();
  ctx.strokeStyle = '#eceff1';
  ctx.lineWidth = 2 * s;
  ctx.stroke();
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath(); ctx.arc(x, y - 1 * s, 2.5 * s, 0, TAU); ctx.fill();
}

function drawShadowEllipse(ctx, x, y, w, a = 0.25) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, w, w * 0.22, 0, 0, TAU);
  ctx.fill();
}

// ---------- Creatures ----------
function drawBat(ctx, x, y, s, t, color, f, horns) {
  const flap = Math.sin(t * 18);
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * 4 * s, y - 2 * s);
    ctx.lineTo(x + side * 13 * s, y - (5 + flap * 8) * s);
    ctx.lineTo(x + side * 22 * s, y - (1 + flap * 10) * s);
    ctx.lineTo(x + side * 17 * s, y + (2 - flap * 2) * s);
    ctx.lineTo(x + side * 12 * s, y + 0.5 * s);
    ctx.lineTo(x + side * 7 * s, y + 4 * s);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(x, y, 7 * s, 6.5 * s, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 5 * s, y - 4 * s); ctx.lineTo(x - 4 * s, y - 10 * s); ctx.lineTo(x - 1.5 * s, y - 5 * s);
  ctx.moveTo(x + 5 * s, y - 4 * s); ctx.lineTo(x + 4 * s, y - 10 * s); ctx.lineTo(x + 1.5 * s, y - 5 * s);
  ctx.fill();
  if (horns) {
    ctx.fillStyle = '#ffe082';
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, y - 5 * s); ctx.lineTo(x - 7 * s, y - 12 * s); ctx.lineTo(x - 2 * s, y - 6 * s);
    ctx.moveTo(x + 4 * s, y - 5 * s); ctx.lineTo(x + 7 * s, y - 12 * s); ctx.lineTo(x + 2 * s, y - 6 * s);
    ctx.fill();
  }
  ctx.fillStyle = horns ? '#fff59d' : '#ff5252';
  ctx.fillRect(x + f * 1.5 * s - 3 * s, y - 2 * s, 2 * s, 2 * s);
  ctx.fillRect(x + f * 1.5 * s + 1 * s, y - 2 * s, 2 * s, 2 * s);
}

function drawSlime(ctx, x, y, s, t, color, sq, f) {
  const w = 14 * s * (1 + sq * 0.35), h = 17 * s * (1 - sq * 0.35);
  const g = ctx.createLinearGradient(x, y - h, x, y);
  g.addColorStop(0, shade(color, 0.3));
  g.addColorStop(1, shade(color, -0.2));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w * 1.05, y - h * 0.9, x, y - h);
  ctx.quadraticCurveTo(x + w * 1.05, y - h * 0.9, x + w, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(x - w * 0.35, y - h * 0.68, 3 * s, 2 * s, -0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(x + f * 3 * s - 4 * s, y - h * 0.55, 2.5 * s, 3.5 * s);
  ctx.fillRect(x + f * 3 * s + 2 * s, y - h * 0.55, 2.5 * s, 3.5 * s);
}

function drawSpider(ctx, x, y, s, t, color, f, moving, scorpion) {
  const bodyY = y - 9 * s;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * s;
  ctx.lineCap = 'round';
  const legs = scorpion ? 3 : 4;
  for (let i = 0; i < legs; i++) {
    for (const side of [-1, 1]) {
      const ph = t * (moving ? 16 : 3) + i * 1.3 + (side > 0 ? 0 : Math.PI);
      const lift = Math.max(0, Math.sin(ph)) * 4 * s;
      const baseX = x + (i - (legs - 1) / 2) * 5 * s;
      const kneeX = baseX + side * 8 * s, kneeY = bodyY - 7 * s - lift;
      const footX = baseX + side * 14 * s + Math.cos(ph) * 2 * s, footY = y - lift * 0.3;
      ctx.beginPath();
      ctx.moveTo(baseX, bodyY);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
    }
  }
  ctx.fillStyle = color;
  if (scorpion) {
    ctx.beginPath(); ctx.ellipse(x - f * 3 * s, bodyY, 11 * s, 6 * s, 0, 0, TAU); ctx.fill();
    // tail
    ctx.lineWidth = 3.5 * s;
    ctx.beginPath();
    const tb = x - f * 12 * s;
    ctx.moveTo(tb, bodyY);
    const sw = Math.sin(t * 4) * 2 * s;
    ctx.quadraticCurveTo(tb - f * 12 * s, bodyY - 10 * s, tb - f * 6 * s + sw, bodyY - 22 * s);
    ctx.quadraticCurveTo(tb + f * 2 * s + sw, bodyY - 26 * s, tb + f * 6 * s + sw, bodyY - 19 * s);
    ctx.stroke();
    ctx.fillStyle = '#ffeb3b';
    ctx.beginPath(); ctx.arc(tb + f * 7 * s + sw, bodyY - 18 * s, 2.2 * s, 0, TAU); ctx.fill();
    // claws
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5 * s;
    for (const off of [-3, 3]) {
      ctx.beginPath();
      ctx.moveTo(x + f * 6 * s, bodyY + off * 0.3 * s);
      ctx.lineTo(x + f * 14 * s, bodyY - 3 * s + off * s);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x + f * 16 * s, bodyY - 3 * s + off * s, 3 * s, 0, TAU); ctx.fill();
    }
  } else {
    ctx.beginPath(); ctx.ellipse(x - f * 6 * s, bodyY - 1 * s, 9 * s, 7 * s, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + f * 5 * s, bodyY, 5.5 * s, 5 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ef5350';
    ctx.fillRect(x + f * 7 * s - 1 * s, bodyY - 2 * s, 2 * s, 2 * s);
    ctx.fillRect(x + f * 7 * s - 4 * s * f - 1 * s, bodyY - 2.5 * s, 1.6 * s, 1.6 * s);
    ctx.fillStyle = 'rgba(255,82,82,0.6)';
    ctx.beginPath(); ctx.arc(x - f * 7 * s, bodyY - 3 * s, 2.5 * s, 0, TAU); ctx.fill();
  }
}

// ---------- Icons ----------
function drawCoinIcon(ctx, x, y, r, t) {
  const sq = Math.abs(Math.cos(t || 0));
  ctx.fillStyle = '#f9a825';
  ctx.beginPath(); ctx.ellipse(x, y, r * Math.max(0.25, sq), r, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.7 * Math.max(0.25, sq), r * 0.7, 0, 0, TAU); ctx.fill();
}
function drawHeartIcon(ctx, x, y, r, color) {
  ctx.fillStyle = color || '#ff4d6d';
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  ctx.fill();
}
function drawPotionIcon(ctx, x, y, r) {
  ctx.fillStyle = '#ff5277';
  ctx.beginPath(); ctx.arc(x, y + r * 0.25, r * 0.55, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(x - r * 0.18, y - r * 0.6, r * 0.36, r * 0.45);
  ctx.fillStyle = '#8d6e63';
  ctx.fillRect(x - r * 0.24, y - r * 0.75, r * 0.48, r * 0.2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.arc(x - r * 0.2, y + r * 0.1, r * 0.14, 0, TAU); ctx.fill();
}
function drawSkillGlyph(ctx, id, x, y, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.18);
  ctx.lineCap = 'round';
  switch (id) {
    case 'blast':
      ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill();
      ctx.globalAlpha *= 0.6;
      ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.stroke();
      break;
    case 'quake':
      ctx.beginPath();
      ctx.moveTo(x - r, y + r * 0.4); ctx.lineTo(x - r * 0.4, y - r * 0.3); ctx.lineTo(x, y + r * 0.2);
      ctx.lineTo(x + r * 0.4, y - r * 0.5); ctx.lineTo(x + r, y + r * 0.4);
      ctx.stroke();
      break;
    case 'whirl':
      ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, Math.PI * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 0.35, Math.PI, Math.PI * 2.5); ctx.stroke();
      break;
    case 'thunder':
      ctx.beginPath();
      ctx.moveTo(x + r * 0.2, y - r); ctx.lineTo(x - r * 0.45, y + r * 0.1); ctx.lineTo(x + r * 0.05, y + r * 0.1);
      ctx.lineTo(x - r * 0.2, y + r); ctx.lineTo(x + r * 0.5, y - r * 0.15); ctx.lineTo(x, y - r * 0.15); ctx.closePath();
      ctx.fill();
      break;
    case 'frost':
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.stroke();
      }
      break;
    case 'meteor':
      ctx.beginPath(); ctx.arc(x + r * 0.25, y + r * 0.25, r * 0.45, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - r * 0.9, y - r * 0.9); ctx.lineTo(x, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r * 0.3, y - r * 1.0); ctx.lineTo(x + r * 0.2, y - r * 0.2); ctx.stroke();
      break;
  }
  ctx.restore();
}

// ---------- Parallax backdrop ----------
class Backdrop {
  constructor(region, seed) {
    this.R = region;
    const rng = new RNG(seed);
    this.LW = 1600;
    this.t = 0;
    const N = 80;
    const ridge = (base, amps) => {
      const pts = [];
      const coefs = amps.map(([k, a]) => [k, a, rng.range(0, TAU)]);
      for (let i = 0; i < N; i++) {
        const x = (i / N) * TAU;
        let y = base;
        for (const [k, a, ph] of coefs) y -= a * Math.sin(k * x + ph);
        pts.push(y);
      }
      return pts;
    };
    const items = (n, minS, maxS) => {
      const arr = [];
      for (let i = 0; i < n; i++) arr.push({ x: rng.range(0, this.LW), s: rng.range(minS, maxS), v: rng.next() });
      arr.sort((a, b) => a.x - b.x);
      return arr;
    };
    const R = region;
    this.layers = [];
    switch (R.shape) {
      case 'hills':
        this.layers.push({ pf: 0.1, color: R.far, pts: ridge(205, [[3, 30], [7, 18], [13, 8]]), items: [], kind: 'mount' });
        this.layers.push({ pf: 0.28, color: R.mid, pts: ridge(255, [[2, 16], [5, 12], [9, 4]]), items: items(14, 0.7, 1.3), kind: 'lolli' });
        this.layers.push({ pf: 0.5, color: R.near, pts: ridge(300, [[3, 12], [6, 8]]), items: items(8, 0.9, 1.4), kind: 'lolli' });
        break;
      case 'trees':
        this.layers.push({ pf: 0.1, color: R.far, pts: ridge(220, [[4, 8], [9, 5]]), items: items(40, 0.7, 1.1), kind: 'pine' });
        this.layers.push({ pf: 0.28, color: R.mid, pts: ridge(265, [[3, 8], [7, 5]]), items: items(26, 1.0, 1.5), kind: 'pine' });
        this.layers.push({ pf: 0.55, color: R.near, pts: ridge(320, [[2, 6], [5, 4]]), items: items(10, 1.0, 1.6), kind: 'trunk' });
        break;
      case 'dunes':
        this.layers.push({ pf: 0.08, color: R.far, pts: ridge(235, [[2, 12], [5, 6]]), items: items(3, 0.8, 1.3), kind: 'pyramid' });
        this.layers.push({ pf: 0.25, color: R.mid, pts: ridge(265, [[2, 20], [4, 10]]), items: [], kind: '' });
        this.layers.push({ pf: 0.5, color: R.near, pts: ridge(305, [[3, 14], [5, 8]]), items: items(5, 0.8, 1.2), kind: 'cactus' });
        break;
      case 'peaks':
        this.layers.push({ pf: 0.08, color: R.far, pts: ridge(190, [[4, 40], [9, 22], [17, 9]]), items: [], kind: 'snowcap' });
        this.layers.push({ pf: 0.25, color: R.mid, pts: ridge(255, [[3, 18], [8, 9]]), items: items(34, 0.6, 1.0), kind: 'snowpine' });
        this.layers.push({ pf: 0.5, color: R.near, pts: ridge(305, [[2, 10], [5, 6]]), items: items(8, 0.9, 1.3), kind: 'snowpine' });
        break;
      case 'volcano':
        this.layers.push({ pf: 0.06, color: R.far, pts: ridge(250, [[2, 10], [5, 6]]), items: items(2, 1.0, 1.3), kind: 'volcano' });
        this.layers.push({ pf: 0.25, color: R.mid, pts: ridge(270, [[5, 22], [11, 12], [19, 6]]), items: [], kind: '' });
        this.layers.push({ pf: 0.5, color: R.near, pts: ridge(315, [[4, 14], [9, 10]]), items: [], kind: '' });
        break;
      case 'spires':
        this.layers.push({ pf: 0.08, color: R.far, pts: ridge(245, [[2, 6]]), items: items(7, 0.8, 1.4), kind: 'castle' });
        this.layers.push({ pf: 0.25, color: R.mid, pts: ridge(275, [[3, 6]]), items: items(9, 0.8, 1.3), kind: 'tower' });
        this.layers.push({ pf: 0.5, color: R.near, pts: ridge(320, [[2, 4]]), items: [], kind: 'wall' });
        break;
    }
    this.clouds = [];
    const nc = R.shape === 'volcano' ? 5 : R.shape === 'spires' ? 3 : 6;
    for (let i = 0; i < nc; i++) this.clouds.push({ x: rng.range(0, 2000), y: rng.range(20, 130), s: rng.range(0.6, 1.4) });
    this.stars = [];
    if (R.shape === 'spires' || R.shape === 'volcano' || R.shape === 'trees') {
      for (let i = 0; i < 60; i++) this.stars.push({ x: rng.range(0, 1), y: rng.range(0, 0.5), s: rng.range(0.5, 1.6), p: rng.range(0, TAU) });
    }
  }

  draw(ctx, camX, camY, W, H, t) {
    const R = this.R;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, R.sky[0]);
    g.addColorStop(1, R.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of this.stars) {
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 2 + s.p);
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    // sun / moon
    const sx = W * 0.76, sy = 64 - camY * 0.05;
    const night = R.shape === 'spires' || R.shape === 'trees';
    const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    sg.addColorStop(0, rgba(R.sun.length === 7 ? R.sun : '#ffffff', 0.55));
    sg.addColorStop(1, rgba(R.sun.length === 7 ? R.sun : '#ffffff', 0));
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 90, sy - 90, 180, 180);
    ctx.fillStyle = R.sun;
    ctx.beginPath(); ctx.arc(sx, sy, night ? 20 : 26, 0, TAU); ctx.fill();
    if (night) {
      ctx.fillStyle = R.sky[0];
      ctx.beginPath(); ctx.arc(sx + 9, sy - 5, 17, 0, TAU); ctx.fill();
    }
    // clouds
    if (R.shape !== 'volcano') {
      ctx.fillStyle = night ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)';
      for (const c of this.clouds) {
        const x = ((((c.x - camX * 0.04 - t * 8 * c.s) % 2000) + 2000) % 2000) - 200;
        if (x > W + 100) continue;
        const y = c.y - camY * 0.05;
        ctx.beginPath();
        ctx.ellipse(x, y, 34 * c.s, 11 * c.s, 0, 0, TAU);
        ctx.ellipse(x + 18 * c.s, y - 8 * c.s, 20 * c.s, 12 * c.s, 0, 0, TAU);
        ctx.ellipse(x - 14 * c.s, y - 5 * c.s, 16 * c.s, 9 * c.s, 0, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(40,20,20,0.35)';
      for (const c of this.clouds) {
        const x = ((((c.x - camX * 0.04 - t * 5 * c.s) % 2000) + 2000) % 2000) - 200;
        ctx.beginPath(); ctx.ellipse(x, c.y * 0.6, 60 * c.s, 14 * c.s, 0, 0, TAU); ctx.fill();
      }
    }
    for (let li = 0; li < this.layers.length; li++) this.drawLayer(ctx, this.layers[li], camX, camY, W, H, t, li);
    if (R.shape === 'trees') {
      const fg = ctx.createLinearGradient(0, H * 0.5, 0, H);
      fg.addColorStop(0, 'rgba(160,200,180,0)');
      fg.addColorStop(1, 'rgba(160,200,180,0.12)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, H * 0.5, W, H * 0.5);
    }
    if (R.shape === 'volcano') {
      const lg = ctx.createLinearGradient(0, H * 0.55, 0, H);
      lg.addColorStop(0, 'rgba(255,87,34,0)');
      lg.addColorStop(1, `rgba(255,87,34,${0.18 + Math.sin(t * 1.5) * 0.05})`);
      ctx.fillStyle = lg;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
    }
  }

  drawLayer(ctx, L, camX, camY, W, H, t, li) {
    const LW = this.LW;
    const N = L.pts.length;
    const step = LW / N;
    const off = (((camX * L.pf) % LW) + LW) % LW;
    const yOff = -camY * L.pf * 0.35 + (H - 360) * 0.5 + 30 * L.pf;
    ctx.fillStyle = L.color;
    ctx.beginPath();
    ctx.moveTo(-2, H);
    const i0 = Math.floor(off / step);
    const cnt = Math.ceil(W / step) + 2;
    for (let k = 0; k <= cnt; k++) {
      const i = i0 + k;
      const x = i * step - off;
      ctx.lineTo(x, L.pts[i % N] + yOff);
    }
    ctx.lineTo(W + 2, H);
    ctx.closePath();
    ctx.fill();
    if (!L.items.length && L.kind !== 'wall' && L.kind !== 'snowcap') return;
    const yAt = (x) => {
      const fx = (x + off) / step;
      const i = Math.floor(fx);
      const fr = fx - i;
      return lerp(L.pts[((i % N) + N) % N], L.pts[(((i + 1) % N) + N) % N], fr) + yOff;
    };
    if (L.kind === 'snowcap') {
      // snow on peaks: draw lighter ridge tops
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k <= cnt; k++) {
        const i = i0 + k;
        const y = L.pts[i % N], yp = L.pts[(i - 1 + N) % N], yn = L.pts[(i + 1) % N];
        if (y < yp && y < yn && y < 170) {
          const x = i * step - off;
          ctx.beginPath();
          ctx.moveTo(x, y + yOff - 1);
          ctx.lineTo(x - step * 0.9, y + yOff + 16);
          ctx.lineTo(x - step * 0.3, y + yOff + 11);
          ctx.lineTo(x, y + yOff + 17);
          ctx.lineTo(x + step * 0.3, y + yOff + 11);
          ctx.lineTo(x + step * 0.9, y + yOff + 16);
          ctx.closePath();
          ctx.fill();
        }
      }
      return;
    }
    if (L.kind === 'wall') {
      ctx.fillStyle = L.color;
      const bw = 26;
      const o2 = off % (bw * 2);
      for (let x = -o2; x < W + bw; x += bw * 2) {
        const y = yAt(x) - 14;
        ctx.fillRect(x, y, bw, 16);
      }
      return;
    }
    for (const it of L.items) {
      for (const rep of [0, LW]) {
        const x = it.x + rep - off;
        if (x < -120 || x > W + 120) continue;
        const y = yAt(x) + 2;
        const s = it.s;
        switch (L.kind) {
          case 'lolli': {
            ctx.fillStyle = shade(L.color, -0.25);
            ctx.fillRect(x - 2 * s, y - 22 * s, 4 * s, 22 * s);
            ctx.fillStyle = shade(L.color, 0.08);
            ctx.beginPath(); ctx.arc(x, y - 28 * s, 13 * s, 0, TAU); ctx.fill();
            ctx.fillStyle = shade(L.color, -0.08);
            ctx.beginPath(); ctx.arc(x + 5 * s, y - 25 * s, 8 * s, 0, TAU); ctx.fill();
            break;
          }
          case 'pine':
          case 'snowpine': {
            const c = L.color;
            ctx.fillStyle = c;
            const h = 60 * s;
            ctx.fillRect(x - 2 * s, y - 10 * s, 4 * s, 12 * s);
            for (let j = 0; j < 3; j++) {
              const ty = y - 8 * s - j * h * 0.26;
              const tw = (18 - j * 4.5) * s;
              ctx.beginPath();
              ctx.moveTo(x - tw, ty);
              ctx.lineTo(x, ty - h * 0.42);
              ctx.lineTo(x + tw, ty);
              ctx.closePath();
              ctx.fill();
            }
            if (L.kind === 'snowpine') {
              ctx.fillStyle = 'rgba(255,255,255,0.7)';
              ctx.beginPath();
              ctx.moveTo(x - 5 * s, y - h * 0.62);
              ctx.lineTo(x, y - h * 0.94);
              ctx.lineTo(x + 5 * s, y - h * 0.62);
              ctx.closePath();
              ctx.fill();
            }
            break;
          }
          case 'trunk': {
            ctx.fillStyle = L.color;
            ctx.fillRect(x - 9 * s, y - 360, 18 * s, 362);
            ctx.beginPath(); ctx.arc(x, y - 250 * s, 70 * s, 0, TAU); ctx.fill();
            ctx.fillRect(x - 30 * s, y - 120 * s, 22 * s, 4 * s);
            break;
          }
          case 'pyramid': {
            ctx.fillStyle = shade(L.color, -0.05);
            ctx.beginPath();
            ctx.moveTo(x - 70 * s, y + 4);
            ctx.lineTo(x, y - 75 * s);
            ctx.lineTo(x + 70 * s, y + 4);
            ctx.fill();
            ctx.fillStyle = shade(L.color, -0.18);
            ctx.beginPath();
            ctx.moveTo(x, y - 75 * s);
            ctx.lineTo(x + 70 * s, y + 4);
            ctx.lineTo(x + 18 * s, y + 4);
            ctx.fill();
            break;
          }
          case 'cactus': {
            ctx.fillStyle = shade(L.color, -0.2);
            ctx.fillRect(x - 3 * s, y - 34 * s, 7 * s, 36 * s);
            ctx.fillRect(x - 12 * s, y - 24 * s, 5 * s, 12 * s);
            ctx.fillRect(x - 12 * s, y - 14 * s, 10 * s, 4 * s);
            ctx.fillRect(x + 8 * s, y - 28 * s, 5 * s, 12 * s);
            ctx.fillRect(x + 3 * s, y - 18 * s, 10 * s, 4 * s);
            break;
          }
          case 'volcano': {
            ctx.fillStyle = L.color;
            ctx.beginPath();
            ctx.moveTo(x - 150 * s, y + 10);
            ctx.lineTo(x - 28 * s, y - 120 * s);
            ctx.lineTo(x + 28 * s, y - 120 * s);
            ctx.lineTo(x + 150 * s, y + 10);
            ctx.fill();
            const glow = 0.6 + Math.sin(t * 2 + it.v * 6) * 0.2;
            ctx.fillStyle = `rgba(255,111,0,${glow})`;
            ctx.beginPath(); ctx.ellipse(x, y - 120 * s, 28 * s, 6 * s, 0, 0, TAU); ctx.fill();
            ctx.strokeStyle = `rgba(255,87,34,${glow * 0.8})`;
            ctx.lineWidth = 3 * s;
            ctx.beginPath(); ctx.moveTo(x - 5 * s, y - 118 * s); ctx.lineTo(x - 18 * s, y - 70 * s); ctx.lineTo(x - 10 * s, y - 40 * s); ctx.stroke();
            ctx.fillStyle = 'rgba(60,40,40,0.35)';
            for (let j = 0; j < 4; j++) {
              const pp = (t * 0.15 + j * 0.25 + it.v) % 1;
              ctx.beginPath(); ctx.arc(x + Math.sin(pp * 6 + j) * 15 * s, y - 130 * s - pp * 120 * s, (10 + pp * 25) * s, 0, TAU); ctx.fill();
            }
            break;
          }
          case 'castle': {
            ctx.fillStyle = L.color;
            const w = 26 * s, h = 90 * s + it.v * 60 * s;
            ctx.fillRect(x - w / 2, y - h, w, h + 4);
            ctx.beginPath(); ctx.moveTo(x - w / 2 - 4, y - h); ctx.lineTo(x, y - h - 40 * s); ctx.lineTo(x + w / 2 + 4, y - h); ctx.fill();
            ctx.fillStyle = 'rgba(255,213,79,0.7)';
            for (let j = 0; j < 3; j++) if ((it.v * 10 + j) % 2 < 1.3) ctx.fillRect(x - 3 * s, y - h + 14 * s + j * 22 * s, 5 * s, 8 * s);
            break;
          }
          case 'tower': {
            ctx.fillStyle = L.color;
            const w = 34 * s, h = 70 * s + it.v * 40 * s;
            ctx.fillRect(x - w / 2, y - h, w, h + 4);
            for (let j = 0; j < 4; j++) ctx.fillRect(x - w / 2 + j * (w / 3.5), y - h - 8 * s, w / 7, 8 * s);
            ctx.fillStyle = 'rgba(255,183,77,0.55)';
            ctx.fillRect(x - 4 * s, y - h + 16 * s, 8 * s, 12 * s);
            break;
          }
        }
      }
    }
  }
}

// ---------- Screen-space weather ----------
class Weather {
  constructor(kind, W, H) {
    this.kind = kind;
    this.p = [];
    const n = { snow: 70, leaves: 18, sand: 45, embers: 40, ash: 35 }[kind] || 0;
    for (let i = 0; i < n; i++) this.p.push(this.spawn(W, H, true));
  }
  spawn(W, H, init) {
    const k = this.kind;
    const o = { x: rand(0, W), y: init ? rand(0, H) : -10, s: rand(0.6, 1.4), ph: rand(0, TAU), r: rand(0, TAU) };
    if (k === 'embers') { o.y = init ? rand(0, H) : H + 10; }
    if (k === 'sand') { o.x = init ? rand(0, W) : -10; o.y = rand(0, H); }
    return o;
  }
  update(dt, camDX, W, H) {
    const k = this.kind;
    for (let i = 0; i < this.p.length; i++) {
      const o = this.p[i];
      o.x -= camDX * 0.9;
      o.ph += dt;
      switch (k) {
        case 'snow': o.y += 30 * o.s * dt; o.x += Math.sin(o.ph * 1.5) * 12 * dt - 8 * dt; break;
        case 'leaves': o.y += 26 * o.s * dt; o.x += Math.sin(o.ph * 1.2) * 30 * dt - 10 * dt; o.r += dt * 2; break;
        case 'sand': o.x += 220 * o.s * dt; o.y += Math.sin(o.ph * 3) * 10 * dt; break;
        case 'embers': o.y -= 40 * o.s * dt; o.x += Math.sin(o.ph * 2) * 16 * dt; break;
        case 'ash': o.y += 16 * o.s * dt; o.x += Math.sin(o.ph) * 10 * dt + 6 * dt; break;
      }
      if (o.x < -20) o.x += W + 40;
      if (o.x > W + 20) o.x -= W + 40;
      if (k === 'embers') { if (o.y < -10) this.p[i] = this.spawn(W, H, false); }
      else if (o.y > H + 10) this.p[i] = this.spawn(W, H, false);
    }
  }
  draw(ctx) {
    const k = this.kind;
    for (const o of this.p) {
      switch (k) {
        case 'snow':
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath(); ctx.arc(o.x, o.y, 1.6 * o.s, 0, TAU); ctx.fill();
          break;
        case 'leaves':
          ctx.save();
          ctx.translate(o.x, o.y);
          ctx.rotate(o.r);
          ctx.fillStyle = o.s > 1 ? 'rgba(205,160,60,0.8)' : 'rgba(120,170,70,0.75)';
          ctx.beginPath(); ctx.ellipse(0, 0, 4 * o.s, 2 * o.s, 0, 0, TAU); ctx.fill();
          ctx.restore();
          break;
        case 'sand':
          ctx.fillStyle = 'rgba(255,236,190,0.5)';
          ctx.fillRect(o.x, o.y, 6 * o.s, 1.2);
          break;
        case 'embers':
          ctx.fillStyle = `rgba(255,${(140 + Math.sin(o.ph * 5) * 60) | 0},40,0.85)`;
          ctx.fillRect(o.x, o.y, 2 * o.s, 2 * o.s);
          break;
        case 'ash':
          ctx.fillStyle = 'rgba(200,190,220,0.35)';
          ctx.fillRect(o.x, o.y, 2 * o.s, 2 * o.s);
          break;
      }
    }
  }
}
