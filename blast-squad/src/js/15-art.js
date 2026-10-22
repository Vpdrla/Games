// ---------- Art: procedural sprites (brawlers, tiles, shots, pickups, portraits) ----------
// Everything is painted once into cached canvases (by key, frame and pixel size) and stamped with
// drawImage. Painters work in tile units: (0, 0) is a brawler's feet, 1 = one tile, +x faces right,
// front view. The world pass of the view draws in device pixels with an identity transform; Art's
// world helpers (shot, area, pickup, ...) assume that and leave the transform as they found it.
const Art = (() => {
  const OL = '#1d1530'; // outline colour
  const LW = 0.05; // outline width (tile units)
  const SKIN = '#ffd3ae';
  const TAN = '#eeaa78';
  const PALE = '#e4def4';
  const TEAMC = ['#3d9bff', '#ff4a4a', '#ffd23f']; // own / enemy / neutral
  const STEP = [1, 0, -1, 0, 0, 0]; // walk frames 0-3, idle 4-5
  const BOB = [0, -0.04, 0, -0.04, 0, -0.02];
  const F = { WALK: 1, FLASH: 2, COLD: 4, ATK: 8 };

  // ---- painting helpers (tile units) ----
  function fs(x, fill, lw) {
    x.fillStyle = fill;
    x.fill();
    if (lw === 0) return;
    x.lineWidth = lw || LW;
    x.strokeStyle = OL;
    x.stroke();
  }
  function el(x, cx, cy, rx, ry, fill, lw) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); fs(x, fill, lw); }
  function elr(x, cx, cy, rx, ry, rot, fill, lw) { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, TAU); fs(x, fill, lw); }
  function rr(x, X, Y, w, h, r, fill, lw) { roundRect(x, X, Y, w, h, r); fs(x, fill, lw); }
  function pg(x, pts, fill, lw) {
    x.beginPath();
    x.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
    x.closePath();
    fs(x, fill, lw);
  }
  function ln(x, x1, y1, x2, y2, w, col, ow) {
    x.beginPath();
    x.moveTo(x1, y1);
    x.lineTo(x2, y2);
    x.lineCap = 'round';
    if (ow !== 0) {
      x.lineWidth = w + (ow || LW * 1.6);
      x.strokeStyle = OL;
      x.stroke();
    }
    x.lineWidth = w;
    x.strokeStyle = col;
    x.stroke();
  }
  function dot(x, cx, cy, r, col) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fillStyle = col; x.fill(); }
  function gloss(x, cx, cy, rx, ry, a) { x.beginPath(); x.ellipse(cx, cy, rx, ry, -0.5, 0, TAU); x.fillStyle = `rgba(255,255,255,${a || 0.4})`; x.fill(); }
  function stroke(x, w, col) { x.lineWidth = w; x.strokeStyle = col; x.stroke(); }
  function star5(x, cx, cy, r, ri, rot) {
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot - Math.PI / 2 + (i * Math.PI) / 5, rad = i & 1 ? ri : r;
      x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    x.closePath();
  }

  // ---- chibi body parts ----
  function feet(x, f, col) {
    const s = STEP[f];
    el(x, -0.13 + s * 0.06, -0.06 - Math.max(0, s) * 0.06, 0.12, 0.08, col);
    el(x, 0.13 - s * 0.06, -0.06 - Math.max(0, -s) * 0.06, 0.12, 0.08, col);
  }
  function eyes(x, ex, ey, s, pupil, iris) {
    s = s || 1;
    el(x, ex, ey, 0.064 * s, 0.088 * s, '#fff', 0.03);
    el(x, ex + 0.18 * s, ey, 0.058 * s, 0.084 * s, '#fff', 0.03);
    if (iris) {
      dot(x, ex + 0.016 * s, ey + 0.012 * s, 0.045 * s, iris);
      dot(x, ex + 0.194 * s, ey + 0.012 * s, 0.042 * s, iris);
    }
    dot(x, ex + 0.018 * s, ey + 0.014 * s, 0.032 * s, pupil || OL);
    dot(x, ex + 0.196 * s, ey + 0.014 * s, 0.03 * s, pupil || OL);
    dot(x, ex + 0.002 * s, ey - 0.024 * s, 0.015 * s, '#fff');
    dot(x, ex + 0.18 * s, ey - 0.024 * s, 0.014 * s, '#fff');
  }
  function smile(x, cx, cy, w, open) {
    x.beginPath();
    x.arc(cx, cy - w * 0.6, w, 0.45, Math.PI - 0.45);
    if (open) { x.closePath(); fs(x, '#a8304a', 0.025); } else stroke(x, 0.03, OL);
  }
  function brows(x, ex, ey, ang, col) {
    ln(x, ex - 0.05, ey - 0.1 - ang, ex + 0.05, ey - 0.1 + ang, 0.03, col || OL, 0);
    ln(x, ex + 0.13, ey - 0.1 + ang, ex + 0.23, ey - 0.1 - ang, 0.03, col || OL, 0);
  }
  function blush(x, cx, cy) { dot(x, cx, cy, 0.045, 'rgba(255,100,110,0.45)'); }
  // Hair over the top and back of a head (front view, face on the right) with a fringe of `n` points.
  function hairCap(x, hx, hy, r, col, n, drop) {
    n = n || 4;
    drop = drop == null ? 0.18 : drop;
    x.beginPath();
    x.arc(hx, hy, r * 1.05, Math.PI * 0.6, Math.PI * 1.97);
    const xa = hx + r * 0.98, xb = hx - r * 0.2, yb = hy - r * 0.42;
    for (let i = 0; i <= n; i++) {
      const u = i / n, px = lerp(xa, xb, u), py = yb + Math.sin(u * Math.PI) * -0.02;
      x.lineTo(px, py + (i % 2 ? drop * r : 0));
    }
    x.lineTo(hx - r * 0.28, hy + r * 0.15);
    x.closePath();
    fs(x, col);
    gloss(x, hx - r * 0.25, hy - r * 0.62, r * 0.28, r * 0.12, 0.3);
  }
  function hairBack(x, hx, hy, r, col) {
    el(x, hx, hy, r * 1.05, r * 1.02, col);
    gloss(x, hx - r * 0.3, hy - r * 0.55, r * 0.3, r * 0.13, 0.28);
  }
  function arm(x, ax, ay, col, hand) {
    el(x, ax, ay, 0.085, 0.085, hand || SKIN);
    if (col) rr(x, ax - 0.06, ay - 0.13, 0.12, 0.1, 0.04, col, 0.035);
  }

  // ---- brawlers: body painters (x, frame, back) and weapon painters (origin = hand, +x = aim) ----
  const BODY = {};
  const GUN = {};

  BODY.nova = (x, f, back) => {
    const hair = '#6a3420', jk = '#5cbf47', sc = '#ff3b3b';
    feet(x, f, '#4a2e22');
    x.translate(0, BOB[f]);
    const w = f < 4 ? (f & 1) * 0.06 : f === 5 ? 0.02 : 0;
    pg(x, [-0.08, -0.66, -0.46, -0.56 + w, -0.6, -0.34 + w, -0.42, -0.4 + w * 0.5, -0.04, -0.52], sc);
    ln(x, -0.48, -0.5 + w, -0.52, -0.4 + w, 0.035, '#ffd23f', 0);
    rr(x, -0.15, -0.28, 0.3, 0.22, 0.06, '#33507e');
    rr(x, -0.26, -0.64, 0.52, 0.44, 0.15, jk);
    if (!back) {
      ln(x, 0.07, -0.6, 0.07, -0.22, 0.025, '#3d8a2e', 0);
      rr(x, 0.1, -0.4, 0.1, 0.08, 0.02, '#4aa338', 0.03);
    }
    arm(x, -0.27, -0.34, jk);
    if (!back) elr(x, -0.36, -0.88, 0.12, 0.23, 0.55, hair);
    el(x, 0.02, -0.94, 0.37, 0.35, SKIN);
    if (back) {
      hairBack(x, 0.02, -0.96, 0.37, hair);
      elr(x, -0.02, -0.72, 0.11, 0.2, 0.1, hair);
      dot(x, 0.02, -0.86, 0.05, sc);
    } else {
      hairCap(x, 0.02, -0.96, 0.37, hair, 5);
      eyes(x, 0.07, -0.9, 1, OL, '#3a7a2a');
      brows(x, 0.07, -0.9, 0.015, hair);
      smile(x, 0.2, -0.74, 0.06);
      blush(x, 0.3, -0.8);
    }
    rr(x, -0.25, -0.69, 0.5, 0.14, 0.07, sc);
    for (const sx of [-0.12, 0.04, 0.18]) ln(x, sx, -0.68, sx, -0.57, 0.03, '#ffd23f', 0);
  };
  GUN.nova = (x) => {
    ln(x, -0.06, 0, 0.08, 0.03, 0.11, '#5cbf47');
    rr(x, 0.02, -0.04, 0.28, 0.13, 0.05, '#a0602a');
    rr(x, 0.26, -0.06, 0.44, 0.08, 0.03, '#6b7388');
    rr(x, 0.26, 0.02, 0.4, 0.07, 0.03, '#4c5266');
    rr(x, 0.64, -0.075, 0.07, 0.17, 0.02, '#363b4c', 0.03);
    el(x, 0.09, 0.06, 0.075, 0.07, SKIN);
    el(x, 0.4, 0.08, 0.065, 0.06, SKIN);
  };

  BODY.dax = (x, f, back) => {
    const hat = '#a8642f', vest = '#8f5426';
    feet(x, f, '#5a2e16');
    x.translate(0, BOB[f]);
    rr(x, -0.15, -0.28, 0.3, 0.22, 0.06, '#2f3d66');
    rr(x, -0.26, -0.64, 0.52, 0.44, 0.15, '#3d86e0');
    if (back) rr(x, -0.26, -0.62, 0.52, 0.38, 0.14, vest);
    else {
      pg(x, [-0.25, -0.6, -0.02, -0.6, 0.03, -0.24, -0.25, -0.24], vest, 0.035);
      pg(x, [0.14, -0.6, 0.25, -0.56, 0.25, -0.24, 0.16, -0.24], vest, 0.035);
      dot(x, -0.12, -0.42, 0.045, '#ffd23f');
    }
    rr(x, -0.26, -0.28, 0.52, 0.08, 0.03, '#4a2a16', 0.03);
    rr(x, -0.04, -0.29, 0.1, 0.1, 0.02, '#ffd23f', 0.03);
    arm(x, -0.27, -0.34, '#3d86e0', TAN);
    el(x, 0.02, -0.92, 0.35, 0.33, TAN);
    if (!back) {
      eyes(x, 0.06, -0.9, 0.95, OL);
      brows(x, 0.06, -0.9, -0.02, '#5a3418');
      pg(x, [0.08, -0.77, 0.2, -0.81, 0.33, -0.77, 0.34, -0.71, 0.2, -0.75, 0.08, -0.71], '#6a3a1a', 0.03);
      pg(x, [-0.2, -0.64, 0.24, -0.64, 0.04, -0.5], '#e8303a', 0.035);
    } else {
      el(x, 0.02, -0.92, 0.355, 0.335, '#6a3a1a');
      pg(x, [-0.22, -0.66, 0.26, -0.66, 0.02, -0.56], '#e8303a', 0.035);
    }
    el(x, 0.02, -1.13, 0.54, 0.14, hat);
    x.beginPath();
    x.moveTo(-0.26, -1.14);
    x.quadraticCurveTo(-0.28, -1.5, -0.08, -1.48);
    x.quadraticCurveTo(0.03, -1.4, 0.12, -1.48);
    x.quadraticCurveTo(0.32, -1.5, 0.3, -1.14);
    x.closePath();
    fs(x, hat);
    rr(x, -0.27, -1.24, 0.57, 0.08, 0.03, '#4a2410', 0.03);
    gloss(x, -0.12, -1.38, 0.08, 0.04, 0.35);
  };
  GUN.dax = (x) => {
    const pistol = (dy, c) => {
      rr(x, 0.04, dy - 0.05, 0.36, 0.09, 0.03, c);
      rr(x, 0.04, dy - 0.02, 0.1, 0.16, 0.03, '#7a4a22', 0.035);
      el(x, 0.17, dy, 0.06, 0.06, '#9aa2b4', 0.03);
    };
    pistol(0.12, '#8a92a8');
    el(x, 0.07, 0.13, 0.065, 0.065, TAN);
    ln(x, -0.06, -0.02, 0.06, -0.04, 0.11, '#3d86e0');
    pistol(-0.06, '#c8d0de');
    el(x, 0.07, -0.05, 0.07, 0.07, TAN);
  };

  BODY.brick = (x, f, back) => {
    const mask = '#2f6bff', skin = '#e89a68';
    feet(x, f, '#c8202a');
    x.translate(0, BOB[f]);
    rr(x, -0.18, -0.32, 0.36, 0.26, 0.07, '#2a2a40');
    rr(x, -0.3, -0.42, 0.6, 0.16, 0.06, '#e8303a');
    rr(x, -0.35, -0.78, 0.7, 0.42, 0.2, skin);
    if (!back) {
      x.beginPath();
      x.arc(-0.08, -0.62, 0.11, 0.3, Math.PI - 0.3);
      x.arc(0.16, -0.62, 0.11, 0.3, Math.PI - 0.3);
      stroke(x, 0.03, '#b86a40');
      ln(x, 0.04, -0.52, 0.04, -0.42, 0.025, '#b86a40', 0);
    } else ln(x, 0, -0.74, 0, -0.44, 0.03, '#b86a40', 0);
    rr(x, -0.32, -0.44, 0.64, 0.1, 0.04, '#ffd23f', 0.035);
    el(x, 0.02, -0.39, 0.08, 0.06, '#fff3a0', 0.03);
    el(x, -0.38, -0.46, 0.14, 0.13, '#e8303a');
    rr(x, -0.46, -0.55, 0.16, 0.07, 0.03, '#fff', 0.03);
    el(x, 0.02, -1.0, 0.32, 0.31, mask);
    if (!back) {
      pg(x, [-0.06, -1.06, 0.06, -1.24, 0.12, -1.08, 0.2, -1.26, 0.26, -1.07, 0.36, -1.15, 0.33, -0.92, 0.2, -0.84, 0.0, -0.88], '#fff', 0.03);
      el(x, 0.07, -0.98, 0.06, 0.07, '#fff', 0.025);
      el(x, 0.24, -0.98, 0.055, 0.065, '#fff', 0.025);
      dot(x, 0.085, -0.97, 0.032, OL);
      dot(x, 0.25, -0.97, 0.03, OL);
      ln(x, 0.0, -1.1, 0.13, -1.06, 0.035, '#ffd23f', 0);
      ln(x, 0.19, -1.06, 0.31, -1.1, 0.035, '#ffd23f', 0);
      el(x, 0.18, -0.81, 0.09, 0.06, skin, 0.03);
      ln(x, 0.12, -0.81, 0.24, -0.81, 0.02, OL, 0);
    } else {
      ln(x, 0.02, -1.25, 0.02, -0.82, 0.04, '#fff', 0);
      for (const y of [-1.12, -1.0, -0.9]) ln(x, -0.05, y, 0.09, y + 0.04, 0.025, '#ffd23f', 0);
    }
    gloss(x, -0.1, -1.18, 0.1, 0.05, 0.35);
  };
  GUN.brick = (x) => {
    ln(x, -0.06, 0, 0.12, 0.01, 0.13, '#e89a68');
    rr(x, 0.08, -0.08, 0.08, 0.18, 0.03, '#fff', 0.035);
    el(x, 0.27, 0.01, 0.15, 0.14, '#e8303a');
    gloss(x, 0.24, -0.05, 0.06, 0.035, 0.45);
    ln(x, 0.3, -0.1, 0.34, 0.1, 0.02, '#a8141e', 0);
  };

  BODY.bramble = (x, f, back) => {
    const fur = '#8f5a30', tunic = '#6cc04a';
    feet(x, f, '#5a3a22');
    x.translate(0, BOB[f]);
    rr(x, -0.15, -0.28, 0.3, 0.22, 0.06, '#7a5a3a');
    rr(x, -0.26, -0.64, 0.52, 0.44, 0.15, tunic);
    if (!back) { pg(x, [-0.2, -0.62, 0.0, -0.4, 0.2, -0.62], '#4e9e32', 0.03); }
    rr(x, -0.26, -0.32, 0.52, 0.07, 0.03, '#6a4224', 0.03);
    arm(x, -0.27, -0.34, null, fur);
    // bear hood
    el(x, -0.24, -1.26, 0.11, 0.11, fur);
    el(x, 0.26, -1.28, 0.11, 0.11, fur);
    dot(x, -0.24, -1.26, 0.05, '#ff9ab0');
    dot(x, 0.26, -1.28, 0.05, '#ff9ab0');
    el(x, 0.02, -0.93, 0.36, 0.34, SKIN);
    if (back) {
      el(x, 0.02, -0.96, 0.41, 0.39, fur);
      el(x, 0.02, -0.74, 0.2, 0.14, '#7a4a26', 0.03);
      gloss(x, -0.1, -1.18, 0.12, 0.05, 0.25);
    } else {
      x.beginPath();
      x.arc(0.02, -0.95, 0.41, Math.PI * 0.62, Math.PI * 2.02);
      x.quadraticCurveTo(0.12, -1.12, -0.24, -0.98);
      x.lineTo(-0.3, -0.72);
      x.closePath();
      fs(x, fur);
      el(x, 0.06, -1.18, 0.1, 0.07, '#d8a878', 0.03);
      dot(x, 0.1, -1.2, 0.035, OL);
      dot(x, -0.07, -1.24, 0.028, OL);
      dot(x, 0.2, -1.26, 0.028, OL);
      eyes(x, 0.06, -0.87, 0.95, OL, '#5a3a20');
      smile(x, 0.2, -0.72, 0.055, true);
      blush(x, 0.31, -0.78);
      blush(x, -0.04, -0.78);
    }
  };
  GUN.bramble = (x) => {
    const fur = '#8f5a30';
    ln(x, -0.06, 0, 0.12, 0.01, 0.12, '#6cc04a');
    el(x, 0.28, 0.0, 0.18, 0.16, fur);
    el(x, 0.32, 0.03, 0.08, 0.07, '#ff9ab0', 0.03);
    for (let i = -1; i <= 1; i++) {
      dot(x, 0.42, i * 0.07, 0.035, '#ff9ab0');
      pg(x, [0.44, i * 0.07 - 0.02, 0.53, i * 0.08, 0.44, i * 0.07 + 0.02], '#f4ecd8', 0.02);
    }
    gloss(x, 0.22, -0.08, 0.07, 0.035, 0.3);
  };

  BODY.pip = (x, f, back) => {
    const hat = '#ffd23f', ov = '#ff8a2a';
    feet(x, f, '#5a3a22');
    x.translate(0, BOB[f]);
    rr(x, -0.26, -0.6, 0.52, 0.48, 0.16, '#4a7ad8');
    rr(x, -0.24, -0.46, 0.48, 0.36, 0.12, ov);
    if (!back) {
      ln(x, -0.15, -0.6, -0.15, -0.44, 0.04, '#d0601a', 0);
      ln(x, 0.15, -0.6, 0.15, -0.44, 0.04, '#d0601a', 0);
      rr(x, -0.08, -0.38, 0.16, 0.1, 0.03, '#d0601a', 0.03);
    }
    // bomb belt
    for (const bx of [-0.18, 0.18]) { dot(x, bx, -0.15, 0.065, OL); dot(x, bx, -0.15, 0.05, '#3a3a4e'); }
    arm(x, -0.27, -0.32, '#4a7ad8');
    el(x, 0.02, -0.9, 0.38, 0.35, SKIN);
    if (!back) {
      eyes(x, 0.05, -0.86, 1.0, OL, '#4a6ad8');
      el(x, 0.29, -0.77, 0.08, 0.065, '#ffa080', 0.03);
      smile(x, 0.16, -0.66, 0.06, true);
      for (const [fx2, fy2] of [[-0.02, -0.74], [0.04, -0.71], [0.38, -0.84]]) dot(x, fx2, fy2, 0.014, '#c8704a');
    }
    // hard hat with lamp
    x.beginPath();
    x.arc(0.02, -1.0, 0.39, Math.PI, TAU);
    x.closePath();
    fs(x, hat);
    rr(x, -0.42, -1.04, 0.86, 0.09, 0.04, '#e8a81a');
    ln(x, 0.02, -1.38, 0.02, -1.06, 0.035, '#e8a81a', 0);
    gloss(x, -0.14, -1.24, 0.1, 0.05, 0.45);
    if (!back) {
      rr(x, 0.2, -1.24, 0.16, 0.16, 0.05, '#7a7f92', 0.035);
      el(x, 0.3, -1.16, 0.07, 0.07, '#fff6b0', 0.03);
      dot(x, 0.31, -1.17, 0.03, '#fff');
    } else rr(x, -0.3, -0.98, 0.64, 0.06, 0.03, '#5a3a22', 0.03);
  };
  GUN.pip = (x) => {
    ln(x, -0.06, 0, 0.1, 0.01, 0.11, '#4a7ad8');
    el(x, 0.26, 0.0, 0.15, 0.15, '#33334a');
    gloss(x, 0.21, -0.06, 0.06, 0.035, 0.45);
    rr(x, 0.32, -0.16, 0.07, 0.06, 0.02, '#8a8a9a', 0.025);
    x.beginPath();
    x.moveTo(0.36, -0.16);
    x.quadraticCurveTo(0.42, -0.26, 0.5, -0.22);
    stroke(x, 0.025, '#c8a878');
    star5(x, 0.5, -0.22, 0.06, 0.025, 0.3);
    x.fillStyle = '#ffd23f';
    x.fill();
    dot(x, 0.5, -0.22, 0.02, '#fff');
    el(x, 0.13, 0.04, 0.07, 0.07, SKIN);
  };

  BODY.melody = (x, f, back) => {
    const bone = '#f6f1e4', pink = '#ff5ab4', jk = '#7a3ad8';
    feet(x, f, '#2a2238');
    x.translate(0, BOB[f]);
    pg(x, [-0.3, -0.12, -0.2, -0.38, 0.2, -0.38, 0.3, -0.12], pink);
    rr(x, -0.24, -0.66, 0.48, 0.32, 0.13, jk);
    if (!back) {
      pg(x, [-0.06, -0.66, 0.04, -0.5, 0.14, -0.66], '#2a2238', 0.03);
      for (const by of [-0.48, -0.4]) dot(x, 0.12, by, 0.025, '#ffd23f');
    }
    arm(x, -0.26, -0.36, jk, bone);
    // pigtails
    el(x, -0.36, -0.86, 0.13, 0.18, pink);
    if (back) el(x, 0.4, -0.86, 0.13, 0.18, pink);
    el(x, 0.02, -0.94, 0.36, 0.34, bone);
    if (!back) {
      el(x, 0.06, -0.93, 0.08, 0.1, '#2a1a3a', 0.02);
      el(x, 0.25, -0.93, 0.075, 0.095, '#2a1a3a', 0.02);
      dot(x, 0.07, -0.92, 0.035, pink);
      dot(x, 0.26, -0.92, 0.033, pink);
      pg(x, [0.16, -0.84, 0.13, -0.8, 0.19, -0.8], '#2a1a3a', 0.015);
      rr(x, 0.04, -0.75, 0.26, 0.07, 0.02, '#fff', 0.025);
      for (let i = 1; i < 4; i++) ln(x, 0.04 + i * 0.065, -0.75, 0.04 + i * 0.065, -0.68, 0.015, OL, 0);
      x.beginPath();
      x.arc(0.02, -0.96, 0.375, Math.PI * 0.95, Math.PI * 1.75);
      x.quadraticCurveTo(0.0, -1.1, -0.3, -0.9);
      x.closePath();
      fs(x, pink);
    } else hairBack(x, 0.02, -0.98, 0.34, pink);
    el(x, 0.4, -0.86, 0.12, 0.17, pink);
    // flower
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      el(x, -0.18 + Math.cos(a) * 0.07, -1.24 + Math.sin(a) * 0.07, 0.055, 0.055, '#ffd23f', 0.025);
    }
    dot(x, -0.18, -1.24, 0.045, '#ff8a2a');
  };
  GUN.melody = (x) => {
    ln(x, 0.12, 0.0, 0.66, -0.02, 0.06, '#8a5a32');
    rr(x, 0.6, -0.07, 0.12, 0.1, 0.03, '#5a3a22', 0.03);
    el(x, 0.16, 0.04, 0.16, 0.14, '#1fc8c8');
    el(x, 0.3, 0.0, 0.1, 0.1, '#1fc8c8');
    dot(x, 0.18, 0.03, 0.045, OL);
    for (let i = 0; i < 3; i++) ln(x, 0.24 + i * 0.03, -0.04, 0.24 + i * 0.03, 0.08, 0.012, '#fff', 0);
    gloss(x, 0.1, -0.03, 0.06, 0.03, 0.4);
    el(x, 0.04, 0.08, 0.065, 0.065, '#f6f1e4');
    el(x, 0.48, 0.01, 0.06, 0.06, '#f6f1e4');
  };

  BODY.sizzle = (x, f, back) => {
    const chrome = '#c8d2e0';
    const spin = (f & 3) * 0.4;
    el(x, 0, -0.1, 0.14, 0.11, '#3a3f52');
    dot(x, 0, -0.1, 0.04, '#9aa6b8');
    ln(x, Math.cos(spin) * -0.09, -0.1 + Math.sin(spin) * -0.07, Math.cos(spin) * 0.09, -0.1 + Math.sin(spin) * 0.07, 0.02, '#9aa6b8', 0);
    x.translate(0, BOB[f] * 0.5);
    rr(x, -0.05, -0.28, 0.1, 0.12, 0.03, '#8a96a8', 0.035);
    rr(x, -0.27, -0.68, 0.54, 0.44, 0.15, chrome);
    if (!back) {
      rr(x, -0.12, -0.66, 0.24, 0.4, 0.06, '#fff', 0.03);
      pg(x, [-0.27, -0.6, -0.1, -0.6, -0.1, -0.28, -0.27, -0.32], '#2a2a3a', 0.03);
      pg(x, [0.27, -0.6, 0.1, -0.6, 0.1, -0.28, 0.27, -0.32], '#2a2a3a', 0.03);
      pg(x, [-0.12, -0.7, 0.0, -0.64, -0.12, -0.58], '#e8303a', 0.025);
      pg(x, [0.12, -0.7, 0.0, -0.64, 0.12, -0.58], '#e8303a', 0.025);
      dot(x, 0, -0.64, 0.03, '#a8141e');
    } else rr(x, -0.2, -0.62, 0.4, 0.32, 0.08, '#2a2a3a', 0.03);
    arm(x, -0.29, -0.38, null, '#8a96a8');
    ln(x, 0.02, -1.24, 0.02, -1.4, 0.03, '#8a96a8');
    dot(x, 0.02, -1.42, 0.05, '#ff5a5a');
    rr(x, -0.28, -1.26, 0.6, 0.5, 0.15, chrome);
    gloss(x, -0.14, -1.18, 0.1, 0.04, 0.5);
    if (!back) {
      rr(x, -0.16, -1.16, 0.44, 0.3, 0.08, '#16263a', 0.03);
      x.beginPath();
      x.arc(0.0, -1.0, 0.045, Math.PI, TAU);
      x.moveTo(0.21, -1.0);
      x.arc(0.165, -1.0, 0.045, Math.PI, TAU);
      stroke(x, 0.03, '#5af0e0');
      x.beginPath();
      x.arc(0.08, -0.95, 0.06, 0.4, Math.PI - 0.4);
      stroke(x, 0.025, '#5af0e0');
    } else for (const vy of [-1.1, -1.0, -0.9]) ln(x, -0.12, vy, 0.16, vy, 0.025, '#8a96a8', 0);
    // tiny bowler hat
    el(x, 0.04, -1.26, 0.2, 0.05, '#2a2a3a', 0.03);
    x.beginPath();
    x.arc(0.04, -1.27, 0.13, Math.PI, TAU);
    x.closePath();
    fs(x, '#2a2a3a', 0.03);
  };
  GUN.sizzle = (x) => {
    ln(x, -0.06, 0, 0.1, 0.01, 0.08, '#8a96a8');
    rr(x, 0.12, -0.08, 0.26, 0.16, 0.06, '#3ad06a');
    rr(x, 0.36, -0.04, 0.14, 0.08, 0.02, '#3ad06a', 0.03);
    rr(x, 0.18, -0.06, 0.12, 0.12, 0.02, '#fff', 0.02);
    dot(x, 0.24, 0, 0.03, '#e8303a');
    gloss(x, 0.2, -0.05, 0.07, 0.025, 0.5);
    for (let i = 0; i < 3; i++) dot(x, 0.55 + i * 0.05, -0.04 + (i & 1) * 0.06, 0.022, '#c8ffd8');
    el(x, 0.13, 0.03, 0.065, 0.065, '#8a96a8');
  };

  BODY.gizmo = (x, f, back) => {
    const hair = '#ff8a2a';
    feet(x, f, '#4a3a2a');
    x.translate(0, BOB[f]);
    rr(x, -0.26, -0.64, 0.52, 0.44, 0.15, '#ffd23f');
    rr(x, -0.24, -0.5, 0.48, 0.38, 0.12, '#3a6fd8');
    if (!back) {
      ln(x, -0.15, -0.64, -0.15, -0.48, 0.04, '#2a55b0', 0);
      ln(x, 0.15, -0.64, 0.15, -0.48, 0.04, '#2a55b0', 0);
      rr(x, -0.07, -0.42, 0.14, 0.1, 0.03, '#2a55b0', 0.03);
    }
    rr(x, -0.26, -0.26, 0.52, 0.07, 0.03, '#6a4224', 0.03);
    ln(x, 0.18, -0.24, 0.24, -0.12, 0.03, '#9aa6b8', 0);
    arm(x, -0.27, -0.34, '#ffd23f', '#6a4a2a');
    el(x, 0.02, -0.92, 0.36, 0.34, SKIN);
    if (back) {
      hairBack(x, 0.02, -0.96, 0.36, hair);
      for (let i = 0; i < 5; i++) pg(x, [-0.3 + i * 0.13, -1.2, -0.24 + i * 0.13, -1.42 + (i & 1) * 0.08, -0.18 + i * 0.13, -1.2], hair, 0.03);
    } else {
      for (let i = 0; i < 4; i++) pg(x, [-0.32 + i * 0.13, -1.12, -0.28 + i * 0.12, -1.38 + (i & 1) * 0.08, -0.16 + i * 0.13, -1.14], hair, 0.03);
      hairCap(x, 0.02, -0.95, 0.36, hair, 6, 0.24);
      eyes(x, 0.06, -0.86, 0.95, OL, '#3a7a2a');
      smile(x, 0.2, -0.72, 0.06, true);
      for (const [fx2, fy2] of [[0.0, -0.76], [0.06, -0.73], [0.34, -0.78]]) dot(x, fx2, fy2, 0.014, '#d07a4a');
    }
    // goggles on the forehead
    rr(x, -0.33, -1.13, 0.7, 0.07, 0.03, '#4a3a3a', 0.03);
    if (!back) {
      el(x, 0.05, -1.11, 0.1, 0.09, '#7af0ff', 0.04);
      el(x, 0.27, -1.11, 0.09, 0.085, '#7af0ff', 0.04);
      gloss(x, 0.03, -1.14, 0.04, 0.02, 0.7);
      gloss(x, 0.25, -1.14, 0.035, 0.02, 0.7);
    }
  };
  GUN.gizmo = (x) => {
    ln(x, -0.06, 0, 0.1, 0.01, 0.11, '#ffd23f');
    rr(x, 0.04, -0.09, 0.32, 0.17, 0.05, '#ff9a2e');
    rr(x, 0.32, -0.07, 0.12, 0.13, 0.03, '#7a7f92', 0.035);
    rr(x, 0.1, -0.13, 0.14, 0.06, 0.02, '#4a5068', 0.03);
    dot(x, 0.53, -0.005, 0.1, 'rgba(120,240,255,0.35)');
    el(x, 0.52, -0.005, 0.07, 0.07, '#9af6ff', 0.03);
    dot(x, 0.5, -0.025, 0.025, '#fff');
    el(x, 0.1, 0.04, 0.07, 0.07, '#6a4a2a');
  };

  BODY.volt = (x, f, back) => {
    const y = '#ffd23f', dk = '#2a2f45', cy = '#4ff0ff';
    feet(x, f, dk);
    x.translate(0, BOB[f]);
    rr(x, -0.14, -0.3, 0.28, 0.24, 0.06, dk);
    rr(x, -0.28, -0.7, 0.56, 0.46, 0.16, y);
    pg(x, [-0.28, -0.4, 0.28, -0.4, 0.26, -0.3, -0.26, -0.3], dk, 0.03);
    if (!back) {
      el(x, 0.02, -0.53, 0.1, 0.1, '#2a2f45', 0.03);
      dot(x, 0.02, -0.53, 0.06, cy);
      dot(x, 0.0, -0.55, 0.02, '#fff');
    } else for (const vx of [-0.12, 0.0, 0.12]) ln(x, vx, -0.64, vx, -0.46, 0.03, dk, 0);
    arm(x, -0.3, -0.38, null, dk);
    // lightning antenna
    pg(x, [0.0, -1.24, 0.12, -1.48, 0.06, -1.47, 0.16, -1.66, -0.02, -1.42, 0.05, -1.43], cy, 0.03);
    el(x, 0.02, -0.96, 0.35, 0.33, y);
    gloss(x, -0.12, -1.14, 0.11, 0.05, 0.45);
    if (!back) {
      rr(x, -0.06, -1.03, 0.42, 0.17, 0.08, dk, 0.035);
      rr(x, 0.0, -0.98, 0.32, 0.07, 0.035, cy, 0);
      dot(x, 0.24, -0.945, 0.025, '#fff');
      for (const mx of [0.06, 0.13, 0.2]) ln(x, mx, -0.8, mx, -0.74, 0.025, dk, 0);
    } else {
      rr(x, -0.18, -1.06, 0.4, 0.2, 0.06, '#e8b81a', 0.03);
      for (const vy of [-1.0, -0.94]) ln(x, -0.12, vy, 0.16, vy, 0.02, dk, 0);
    }
  };
  GUN.volt = (x) => {
    ln(x, -0.06, 0, 0.1, 0.01, 0.1, '#2a2f45');
    rr(x, 0.04, -0.08, 0.42, 0.15, 0.05, '#3a405a');
    for (let i = 0; i < 3; i++) rr(x, 0.12 + i * 0.1, -0.11, 0.05, 0.21, 0.02, '#ffd23f', 0.03);
    dot(x, 0.55, -0.005, 0.11, 'rgba(79,240,255,0.35)');
    el(x, 0.54, -0.005, 0.07, 0.07, '#4ff0ff', 0.03);
    dot(x, 0.53, -0.02, 0.03, '#fff');
    el(x, 0.1, 0.04, 0.07, 0.07, '#2a2f45');
  };

  BODY.hawk = (x, f, back) => {
    const dress = '#8a3ab0', hair = '#efe8ff';
    feet(x, f, '#2a1a3a');
    x.translate(0, BOB[f]);
    pg(x, [-0.36, -0.1, -0.2, -0.46, 0.2, -0.46, 0.36, -0.1], dress);
    pg(x, [-0.34, -0.14, 0.34, -0.14, 0.36, -0.1, -0.36, -0.1], '#fff', 0.025);
    rr(x, -0.22, -0.66, 0.44, 0.3, 0.12, dress);
    if (!back) {
      pg(x, [-0.16, -0.66, 0.02, -0.52, 0.2, -0.66, 0.02, -0.6], '#fff', 0.025);
      dot(x, 0.02, -0.5, 0.035, '#ffd23f');
    }
    arm(x, -0.25, -0.38, dress, '#fff');
    el(x, -0.02, -1.24, 0.17, 0.15, hair); // bun
    el(x, 0.02, -0.93, 0.35, 0.33, SKIN);
    if (back) hairBack(x, 0.02, -0.96, 0.35, hair);
    else {
      hairCap(x, 0.02, -0.96, 0.35, hair, 3, 0.12);
      eyes(x, 0.06, -0.88, 0.92, OL, '#8a3ab0');
      ln(x, 0.0, -0.98, 0.12, -1.0, 0.025, '#8a7a9a', 0);
      x.beginPath();
      x.arc(0.23, -0.88, 0.075, 0, TAU);
      stroke(x, 0.025, '#ffd23f');
      ln(x, 0.23, -0.8, 0.22, -0.66, 0.015, '#ffd23f', 0);
      smile(x, 0.18, -0.73, 0.05);
      dot(x, 0.18, -0.735, 0.022, '#e8305a');
    }
    // little top hat with a feather
    elr(x, 0.12, -1.18, 0.17, 0.045, -0.25, '#2a1a3a', 0.03);
    x.save();
    x.translate(0.12, -1.2);
    x.rotate(-0.25);
    rr(x, -0.1, -0.2, 0.2, 0.2, 0.03, '#2a1a3a', 0.03);
    rr(x, -0.1, -0.07, 0.2, 0.05, 0.01, '#c05ae0', 0);
    x.restore();
    elr(x, -0.02, -1.36, 0.04, 0.14, -0.8, '#ff5ab4', 0.025);
  };
  GUN.hawk = (x) => {
    ln(x, -0.06, 0, 0.1, 0.01, 0.09, '#8a3ab0');
    ln(x, 0.0, 0.0, 0.92, 0.0, 0.04, '#5a3a2a');
    x.beginPath();
    x.moveTo(0.14, 0);
    x.quadraticCurveTo(0.3, -0.13, 0.66, -0.02);
    x.lineTo(0.66, 0.02);
    x.quadraticCurveTo(0.3, 0.13, 0.14, 0);
    fs(x, '#b05ae0', 0.035);
    for (const lx of [0.3, 0.45]) ln(x, lx, -0.07, lx + 0.08, 0.06, 0.015, '#7a2aa0', 0);
    rr(x, 0.86, -0.035, 0.12, 0.07, 0.02, '#8a92a8', 0.03);
    x.beginPath();
    x.arc(0.0, 0.08, 0.07, Math.PI * 0.5, Math.PI * 1.5);
    stroke(x, 0.035, '#5a3a2a');
    el(x, 0.08, 0.03, 0.06, 0.06, '#fff');
    el(x, 0.6, 0.02, 0.055, 0.055, '#fff');
  };

  BODY.frost = (x, f, back) => {
    const suit = '#5ab4ff', glove = '#ff9a3a';
    feet(x, f, '#2a3a5a');
    x.translate(0, BOB[f]);
    rr(x, -0.31, -0.68, 0.62, 0.6, 0.22, suit);
    if (!back) {
      rr(x, 0.06, -0.56, 0.14, 0.08, 0.02, '#fff', 0.025);
      ln(x, -0.02, -0.66, -0.02, -0.14, 0.025, '#3a8ad8', 0);
    }
    rr(x, -0.3, -0.32, 0.6, 0.07, 0.03, '#2a4a8a', 0.03);
    arm(x, -0.32, -0.38, suit, glove);
    el(x, 0.02, -0.92, 0.36, 0.34, '#ffc8a0');
    if (!back) {
      eyes(x, 0.07, -0.92, 0.85, OL);
      blush(x, 0.32, -0.82);
      blush(x, -0.02, -0.82);
      el(x, 0.25, -0.82, 0.06, 0.05, '#ff9a8a', 0.025);
      pg(x, [0.04, -0.76, 0.2, -0.8, 0.36, -0.76, 0.38, -0.66, 0.24, -0.72, 0.18, -0.72, 0.04, -0.66], '#fff', 0.03);
    }
    // beanie with pompom
    x.beginPath();
    x.arc(0.02, -0.98, 0.39, Math.PI * 1.02, Math.PI * 1.98);
    x.closePath();
    fs(x, '#2a6ad8');
    rr(x, -0.38, -1.06, 0.8, 0.12, 0.06, '#fff');
    for (let i = 0; i < 4; i++) ln(x, -0.18 + i * 0.12, -1.3, -0.16 + i * 0.12, -1.1, 0.02, '#1a4ab0', 0);
    el(x, 0.02, -1.4, 0.1, 0.1, '#fff');
    if (back) el(x, 0.02, -0.82, 0.3, 0.12, '#ffc8a0', 0.03);
  };
  GUN.frost = (x) => {
    ln(x, -0.06, 0, 0.1, 0.01, 0.12, '#5ab4ff');
    rr(x, 0.02, -0.1, 0.26, 0.2, 0.06, '#ff8a2a');
    for (let i = 0; i < 3; i++) ln(x, 0.07 + i * 0.06, -0.06, 0.07 + i * 0.06, 0.06, 0.02, '#c85a10', 0);
    rr(x, 0.26, -0.05, 0.36, 0.1, 0.04, '#e8f2ff');
    rr(x, 0.58, -0.08, 0.1, 0.16, 0.03, '#9ad8ff', 0.035);
    dot(x, 0.68, 0, 0.05, 'rgba(220,248,255,0.8)');
    el(x, 0.1, 0.06, 0.075, 0.075, '#ff9a3a');
  };

  BODY.shade = (x, f, back) => {
    const cape = '#2a1a3a', lin = '#c0203a', hair = '#1a1a2e';
    feet(x, f, '#14141e');
    x.translate(0, BOB[f]);
    const w = f < 4 ? (f & 1) * 0.04 : 0;
    pg(x, [-0.26, -0.68, -0.42 - w, -0.08, 0.42 + w, -0.08, 0.26, -0.68], back ? cape : lin);
    if (!back) {
      pg(x, [-0.26, -0.68, -0.42 - w, -0.08, -0.3, -0.08, -0.18, -0.6], cape, 0.03);
      pg(x, [0.26, -0.68, 0.42 + w, -0.08, 0.3, -0.08, 0.18, -0.6], cape, 0.03);
      rr(x, -0.16, -0.66, 0.32, 0.5, 0.1, '#4a2a6a');
      pg(x, [-0.06, -0.66, 0.06, -0.66, 0.0, -0.46], '#fff', 0.025);
      pg(x, [-0.08, -0.66, 0.0, -0.6, 0.08, -0.66, 0.0, -0.72], lin, 0.025);
    } else for (const cx of [-0.2, 0, 0.2]) ln(x, cx, -0.6, cx * 1.4, -0.12, 0.02, '#1a0f26', 0);
    arm(x, -0.28, -0.36, null, PALE);
    // high collar behind the head
    pg(x, [-0.38, -1.12, -0.2, -0.72, 0.24, -0.72, 0.42, -1.12, 0.2, -0.86, -0.16, -0.86], back ? cape : lin);
    el(x, 0.02, -0.93, 0.34, 0.33, PALE);
    if (back) hairBack(x, 0.02, -0.97, 0.34, hair);
    else {
      x.beginPath();
      x.arc(0.02, -0.96, 0.355, Math.PI * 0.62, Math.PI * 1.98);
      x.lineTo(0.22, -1.06);
      x.lineTo(0.12, -0.96);
      x.lineTo(0.02, -1.06);
      x.lineTo(-0.24, -0.94);
      x.closePath();
      fs(x, hair);
      gloss(x, -0.1, -1.18, 0.1, 0.04, 0.3);
      eyes(x, 0.07, -0.88, 0.9, '#2a0010', '#ff2a4a');
      brows(x, 0.07, -0.88, -0.025);
      smile(x, 0.19, -0.73, 0.06);
      pg(x, [0.14, -0.73, 0.16, -0.68, 0.18, -0.73], '#fff', 0.015);
    }
    if (back) pg(x, [-0.38, -1.12, -0.2, -0.78, 0.24, -0.78, 0.42, -1.12, 0.2, -0.92, -0.16, -0.92], cape);
  };
  GUN.shade = (x) => {
    ln(x, -0.06, 0, 0.08, 0.01, 0.09, '#2a1a3a');
    ln(x, -0.05, 0.0, 0.55, 0.0, 0.05, '#8a5a32');
    pg(x, [0.52, -0.1, 0.72, -0.1, 0.84, 0.0, 0.72, 0.1, 0.52, 0.1], '#c8d0dc');
    ln(x, 0.56, -0.05, 0.74, -0.05, 0.015, '#fff', 0);
    el(x, 0.06, 0.04, 0.065, 0.065, PALE);
    el(x, 0.36, 0.03, 0.06, 0.06, PALE);
  };

  BODY.zip = (x, f, back) => {
    const hair = '#3fb6ff', jk = '#a6e22e';
    feet(x, f, '#fff');
    if (f < 4) { const s = STEP[f]; ln(x, -0.2 + s * 0.06, -0.06, -0.08 + s * 0.06, -0.06, 0.025, '#ff3b3b', 0); }
    x.translate(0, BOB[f]);
    rr(x, -0.15, -0.28, 0.3, 0.2, 0.06, '#2a3a5a');
    rr(x, -0.25, -0.64, 0.5, 0.42, 0.15, jk);
    ln(x, -0.2, -0.6, -0.2, -0.26, 0.03, '#fff', 0);
    ln(x, 0.2, -0.6, 0.2, -0.26, 0.03, '#fff', 0);
    if (!back) { x.font = '900 0.16px sans-serif'; x.textAlign = 'center'; x.fillStyle = '#2a3a5a'; x.fillText('7', 0.02, -0.38); }
    arm(x, -0.27, -0.34, jk);
    // headband tails
    const tw = f < 4 ? (f & 1) * 0.05 : 0;
    pg(x, [-0.3, -1.04, -0.6, -1.12 + tw, -0.56, -0.98 + tw, -0.3, -0.98], '#ff3b3b', 0.03);
    el(x, 0.02, -0.92, 0.35, 0.33, SKIN);
    if (back) {
      hairBack(x, 0.02, -0.97, 0.35, hair);
      for (let i = 0; i < 4; i++) pg(x, [-0.26 + i * 0.16, -1.18, -0.2 + i * 0.16, -1.42, -0.1 + i * 0.16, -1.2], hair, 0.03);
    } else {
      for (let i = 0; i < 4; i++) pg(x, [-0.34 + i * 0.12, -1.06, -0.52 + i * 0.12, -1.3 - (i & 1) * 0.06, -0.2 + i * 0.12, -1.18], hair, 0.03);
      hairCap(x, 0.02, -0.97, 0.35, hair, 4, 0.2);
      eyes(x, 0.07, -0.88, 0.9, OL, '#2a7ad8');
      brows(x, 0.07, -0.88, -0.03);
      smile(x, 0.2, -0.72, 0.06, true);
    }
    rr(x, -0.32, -1.08, 0.68, 0.09, 0.04, '#ff3b3b', 0.03);
  };
  GUN.zip = (x) => {
    ln(x, -0.06, 0, 0.1, 0.01, 0.1, '#a6e22e');
    rr(x, 0.04, -0.08, 0.32, 0.14, 0.06, '#f4f6fa');
    rr(x, 0.3, -0.05, 0.16, 0.08, 0.03, '#5a6078', 0.03);
    ln(x, 0.1, -0.03, 0.28, -0.03, 0.03, '#1ae8a0', 0);
    dot(x, 0.5, -0.01, 0.05, 'rgba(26,232,160,0.6)');
    rr(x, 0.08, 0.0, 0.08, 0.14, 0.03, '#d8dce6', 0.03);
    el(x, 0.1, 0.06, 0.07, 0.07, SKIN);
  };

  BODY.specter = (x, f, back) => {
    const hood = '#6a3ad0', skin = '#5ad06a';
    feet(x, f, '#3aa04a');
    x.translate(0, BOB[f]);
    // curly tail
    x.beginPath();
    x.moveTo(-0.18, -0.24);
    x.quadraticCurveTo(-0.52, -0.2, -0.5, -0.42);
    x.arc(-0.4, -0.42, 0.1, Math.PI, Math.PI * 2.6);
    x.lineCap = 'round';
    stroke(x, 0.13, OL);
    stroke(x, 0.08, skin);
    pg(x, [-0.3, -0.12, -0.24, -0.66, 0.24, -0.66, 0.3, -0.12], hood);
    if (!back) pg(x, [-0.06, -0.66, 0.06, -0.66, 0.08, -0.14, -0.04, -0.14], '#4a26a0', 0.025);
    rr(x, -0.28, -0.34, 0.56, 0.06, 0.03, '#ffd23f', 0.025);
    arm(x, -0.27, -0.36, hood, skin);
    // hood
    x.beginPath();
    x.moveTo(-0.38, -0.66);
    x.quadraticCurveTo(-0.5, -1.2, -0.08, -1.36);
    x.quadraticCurveTo(-0.3, -1.5, -0.42, -1.44);
    x.quadraticCurveTo(-0.02, -1.6, 0.3, -1.3);
    x.quadraticCurveTo(0.5, -1.0, 0.4, -0.66);
    x.closePath();
    fs(x, hood);
    if (!back) {
      el(x, 0.1, -0.9, 0.26, 0.24, skin);
      el(x, 0.06, -0.94, 0.1, 0.1, '#ffd23f', 0.035);
      el(x, 0.26, -0.92, 0.09, 0.09, '#ffd23f', 0.035);
      dot(x, 0.09, -0.93, 0.035, OL);
      dot(x, 0.27, -0.95, 0.032, OL);
      x.beginPath();
      x.moveTo(0.0, -0.78);
      x.quadraticCurveTo(0.2, -0.72, 0.34, -0.8);
      stroke(x, 0.025, OL);
      gloss(x, -0.02, -1.2, 0.12, 0.05, 0.25);
    } else {
      ln(x, 0.0, -1.3, 0.0, -0.74, 0.025, '#4a26a0', 0);
      gloss(x, -0.12, -1.2, 0.12, 0.05, 0.25);
    }
  };
  GUN.specter = (x) => {
    ln(x, -0.06, 0, 0.1, 0.01, 0.1, '#6a3ad0');
    for (const [dy, a] of [[-0.08, -0.35], [0.06, 0.25]]) {
      x.save();
      x.translate(0.12, dy);
      x.rotate(a);
      rr(x, -0.02, -0.025, 0.14, 0.05, 0.02, '#8a5aff', 0.025);
      pg(x, [0.12, -0.05, 0.42, 0.0, 0.12, 0.05], '#e0e6f0', 0.03);
      x.restore();
    }
    el(x, 0.11, 0.0, 0.07, 0.07, '#5ad06a');
  };

  BODY.thorn = (x, f, back) => {
    const g = '#4cc25a', dk = '#2f9a44';
    feet(x, f, '#3a9a4a');
    x.translate(0, BOB[f]);
    // back arm (cactus branch)
    rr(x, -0.46, -0.84, 0.14, 0.32, 0.07, g);
    rr(x, -0.46, -0.6, 0.22, 0.12, 0.06, g);
    rr(x, -0.28, -1.28, 0.58, 1.2, 0.29, g);
    for (const rx of [-0.12, 0.02, 0.16]) ln(x, rx, -1.16, rx, -0.18, 0.025, dk, 0);
    for (let i = 0; i < 9; i++) {
      const sx = -0.24 + (i % 3) * 0.24 + ((i / 3) | 0) * 0.04, sy = -1.0 + ((i / 3) | 0) * 0.3;
      ln(x, sx, sy, sx - 0.04, sy - 0.04, 0.015, '#f4f0d8', 0);
    }
    gloss(x, -0.12, -1.08, 0.08, 0.16, 0.25);
    if (!back) {
      eyes(x, 0.04, -0.94, 0.95, OL);
      smile(x, 0.16, -0.78, 0.07, true);
      blush(x, 0.28, -0.84);
      blush(x, -0.04, -0.84);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      el(x, 0.02 + Math.cos(a) * 0.09, -1.3 + Math.sin(a) * 0.07, 0.07, 0.06, '#ff6ab4', 0.025);
    }
    dot(x, 0.02, -1.3, 0.05, '#ffd23f');
  };
  GUN.thorn = (x) => {
    rr(x, -0.04, -0.06, 0.22, 0.12, 0.06, '#4cc25a');
    el(x, 0.32, 0.0, 0.14, 0.14, '#5ad06a');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ln(x, 0.32 + Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.32 + Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.02, '#f4f0d8', 0);
    }
    gloss(x, 0.28, -0.05, 0.05, 0.03, 0.4);
  };

  // pets and turrets use the same sprite machinery
  BODY['bramble.bear'] = (x, f, back) => {
    const fur = '#8f5a30';
    const s = STEP[f];
    for (const [lx, ph] of [[-0.24, 1], [0.24, -1], [-0.12, -1], [0.12, 1]]) el(x, lx, -0.08 - Math.max(0, s * ph) * 0.05, 0.1, 0.08, '#5a3418');
    x.translate(0, BOB[f]);
    el(x, 0, -0.34, 0.38, 0.28, fur);
    el(x, -0.2, -0.82, 0.1, 0.1, fur);
    el(x, 0.24, -0.82, 0.1, 0.1, fur);
    dot(x, -0.2, -0.82, 0.045, '#ff9ab0');
    dot(x, 0.24, -0.82, 0.045, '#ff9ab0');
    el(x, 0.04, -0.6, 0.3, 0.26, fur);
    if (!back) {
      el(x, 0.14, -0.52, 0.12, 0.09, '#d8a878', 0.03);
      dot(x, 0.18, -0.56, 0.04, OL);
      dot(x, 0.0, -0.66, 0.035, OL);
      dot(x, 0.22, -0.68, 0.032, OL);
      dot(x, -0.01, -0.675, 0.012, '#fff');
    }
    gloss(x, -0.08, -0.74, 0.1, 0.04, 0.3);
  };
  BODY['gizmo.turret'] = (x) => {
    ln(x, 0, -0.3, -0.3, -0.04, 0.06, '#5a6078');
    ln(x, 0, -0.3, 0.3, -0.04, 0.06, '#5a6078');
    ln(x, 0, -0.3, 0.0, -0.02, 0.06, '#5a6078');
    el(x, 0, -0.36, 0.22, 0.12, '#ff9a2e');
    rr(x, -0.06, -0.62, 0.12, 0.26, 0.04, '#7a7f92', 0.035);
  };
  GUN['gizmo.turret'] = (x) => {
    el(x, 0.0, 0.0, 0.2, 0.17, '#ffb02e');
    rr(x, 0.1, -0.06, 0.34, 0.12, 0.04, '#5a6078');
    el(x, 0.46, 0.0, 0.07, 0.07, '#9af6ff', 0.03);
    el(x, -0.02, -0.02, 0.09, 0.08, '#16263a', 0.03);
    dot(x, 0.0, -0.025, 0.04, '#4ff0ff');
    gloss(x, -0.08, -0.08, 0.07, 0.03, 0.45);
  };

  // per key: scale, theme colour, hand (weapon anchor) position
  const LOOK = {
    nova: { s: 1, col: '#ff5a4a', hand: [0.14, -0.36] },
    dax: { s: 1, col: '#e0a040', hand: [0.15, -0.36] },
    brick: { s: 1.16, col: '#2f6bff', hand: [0.2, -0.46] },
    bramble: { s: 1, col: '#9a6a3a', hand: [0.16, -0.36] },
    pip: { s: 0.92, col: '#ffcf30', hand: [0.15, -0.34] },
    melody: { s: 1, col: '#ff5ab4', hand: [0.12, -0.38] },
    sizzle: { s: 1, col: '#30d0c0', hand: [0.18, -0.44] },
    gizmo: { s: 0.96, col: '#ff8a2a', hand: [0.15, -0.36] },
    volt: { s: 1.02, col: '#ffd23f', hand: [0.18, -0.44] },
    hawk: { s: 1, col: '#b05ae0', hand: [0.13, -0.4] },
    frost: { s: 1.08, col: '#7ad4ff', hand: [0.2, -0.38] },
    shade: { s: 1, col: '#c02040', hand: [0.16, -0.4] },
    zip: { s: 0.96, col: '#a6e22e', hand: [0.15, -0.36] },
    specter: { s: 0.95, col: '#8a5aff', hand: [0.14, -0.36] },
    thorn: { s: 1.02, col: '#4cc25a', hand: [0.24, -0.46] },
    'bramble.bear': { s: 1.1, col: '#8f5a30', hand: [0, 0] },
    'gizmo.turret': { s: 1.05, col: '#ff9a2e', hand: [0, -0.66] },
  };
  const RAR = { nova: 'start', dax: 'rare', brick: 'rare', bramble: 'rare', pip: 'rare', melody: 'rare', sizzle: 'super', gizmo: 'super', volt: 'super', hawk: 'epic', frost: 'epic', shade: 'mythic', zip: 'mythic', specter: 'legend', thorn: 'legend' };

  BODY._ = (x, f, back) => {
    feet(x, f, '#3a3a4a');
    x.translate(0, BOB[f]);
    rr(x, -0.25, -0.62, 0.5, 0.44, 0.15, '#8a92a8');
    el(x, 0.02, -0.92, 0.36, 0.34, SKIN);
    if (!back) eyes(x, 0.06, -0.9, 1); else hairBack(x, 0.02, -0.95, 0.36, '#5a5a6a');
  };
  GUN._ = (x) => { rr(x, 0.04, -0.06, 0.4, 0.12, 0.04, '#6b7388'); el(x, 0.08, 0.03, 0.07, 0.07, SKIN); };

  const lookOf = (bk) => LOOK[bk] || (LOOK[bk] = { s: 1, col: '#9fb4c8', hand: [0.14, -0.36] });

  // ---- sprite caches ----
  const sprites = new Map();
  function paintVariant(x, w, h, v) {
    if (!v) return;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = v === 1 ? 'rgba(255,255,255,0.82)' : 'rgba(110,200,255,0.5)';
    x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
  }
  // Body sprite of a brawler/pet: back view or front, frame, px per tile (T), variant (0, 1 flash, 2 cold).
  function bodySprite(bk, back, f, T, v) {
    const ck = bk + (back ? '|b' : '|f') + f + '|' + T + '|' + v;
    let c = sprites.get(ck);
    if (c) return c;
    const L = lookOf(bk), k = T * L.s;
    const w = Math.ceil(k * 1.9), h = Math.ceil(k * 2.3);
    c = makeCanvas(w, h);
    c.ax = w / 2;
    c.ay = h - k * 0.26;
    const x = c.getContext('2d');
    x.translate(c.ax, c.ay);
    x.scale(k, k);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    (BODY[bk] || BODY._)(x, f, back);
    paintVariant(x, w, h, v);
    sprites.set(ck, c);
    return c;
  }
  function gunSprite(bk, T, v) {
    const ck = 'g|' + bk + '|' + T + '|' + v;
    let c = sprites.get(ck);
    if (c) return c;
    const L = lookOf(bk), k = T * L.s;
    const w = Math.ceil(k * 1.35), h = Math.ceil(k * 0.8);
    c = makeCanvas(w, h);
    c.ax = k * 0.22;
    c.ay = h / 2;
    const x = c.getContext('2d');
    x.translate(c.ax, c.ay);
    x.scale(k, k);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    (GUN[bk] || GUN._)(x);
    paintVariant(x, w, h, v);
    sprites.set(ck, c);
    return c;
  }

  // Draws a brawler (or pet/turret) with its feet at (x, y). scale: pixels per tile in ctx units.
  // face: aim angle on screen (radians). anim: animation clock (s). team: unused colour side (the
  // view draws team circles), kept for the contract. flags: Art.F bits (WALK, FLASH, COLD, ATK).
  function brawler(ctx, bk, x, y, scale, face, anim, team, flags) {
    flags = flags | 0;
    const T = Math.max(4, Math.round(scale));
    const L = lookOf(bk);
    const ca = Math.cos(face), sa = Math.sin(face);
    const mirror = ca < 0;
    const back = sa < -0.45;
    const t = anim || 0;
    const f = flags & F.WALK ? Math.floor(t * 9) & 3 : 4 + (Math.floor(t * 1.7) & 1);
    const v = flags & F.FLASH ? 1 : flags & F.COLD ? 2 : 0;
    const body = bodySprite(bk, back, f, T, v);
    const hasGun = !!GUN[bk] || !BODY[bk];
    const k = T * L.s;
    const sc = scale / T;
    ctx.save();
    ctx.translate(x, y);
    if (sc !== 1) ctx.scale(sc, sc);
    if (mirror) ctx.scale(-1, 1);
    const a = mirror ? Math.PI - face : face;
    let gx = 0, gy = 0, g = null;
    if (hasGun) {
      g = gunSprite(bk, T, v);
      gx = L.hand[0] * k;
      gy = (L.hand[1] + BOB[f]) * k;
      if (back) gx = -gx * 0.4;
    }
    if (g && back) drawGun(ctx, g, gx, gy, a, flags & F.ATK ? k * 0.08 : 0);
    ctx.drawImage(body, -body.ax, -body.ay);
    if (g && !back) drawGun(ctx, g, gx, gy, a, flags & F.ATK ? k * 0.08 : 0);
    ctx.restore();
  }
  function drawGun(ctx, g, gx, gy, a, recoil) {
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(a);
    ctx.drawImage(g, -g.ax - recoil, -g.ay);
    ctx.restore();
  }

  // ---- portraits (menus) ----
  const portraits = new Map();
  function portrait(bk, px) {
    px = Math.max(8, Math.round(px));
    const ck = bk + '@' + px;
    let c = portraits.get(ck);
    if (c) return c;
    c = makeCanvas(px, px);
    const x = c.getContext('2d');
    let rar = RAR[bk] || 'rare';
    if (typeof BRAWLERS !== 'undefined' && BRAWLERS[bk] && BRAWLERS[bk].rarity) rar = BRAWLERS[bk].rarity;
    const col = (RARITY[rar] && RARITY[rar].color) || '#9fb4c8';
    const g = x.createRadialGradient(px * 0.5, px * 0.42, px * 0.05, px * 0.5, px * 0.5, px * 0.75);
    g.addColorStop(0, shade(col, 0.45));
    g.addColorStop(0.55, col);
    g.addColorStop(1, shade(col, -0.45));
    x.fillStyle = g;
    x.fillRect(0, 0, px, px);
    // sunburst
    x.save();
    x.translate(px * 0.5, px * 0.45);
    x.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 12; i++) {
      x.rotate(TAU / 12);
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(px, -px * 0.12);
      x.lineTo(px, px * 0.12);
      x.closePath();
      x.fill();
    }
    x.restore();
    const L = lookOf(bk), k = (px * 0.86) / L.s;
    x.save();
    x.translate(px * 0.5, px * 0.42 + 0.92 * k * L.s);
    x.scale(k * L.s, k * L.s);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    x.save();
    (BODY[bk] || BODY._)(x, 4, false);
    x.restore();
    if (GUN[bk]) {
      x.translate(L.hand[0], L.hand[1]);
      x.rotate(0.5);
      GUN[bk](x);
    }
    x.restore();
    x.strokeStyle = 'rgba(0,0,0,0.55)';
    x.lineWidth = Math.max(2, px * 0.04);
    x.strokeRect(0, 0, px, px);
    portraits.set(ck, c);
    return c;
  }

  // ---- glow, shadows, rings, icons ----
  const glows = new Map();
  function glow(col, px) {
    const R = Math.max(2, Math.round(px));
    const ck = col + R;
    let c = glows.get(ck);
    if (c) return c;
    c = makeCanvas(R * 2, R * 2);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(R, R, 0, R, R, R);
    g.addColorStop(0, rgba(col, 1));
    g.addColorStop(0.35, rgba(col, 0.55));
    g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, R * 2, R * 2);
    glows.set(ck, c);
    return c;
  }
  function shadow(ctx, x, y, rx, a) {
    ctx.globalAlpha = a == null ? 0.28 : a;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Team circle under a brawler (side 0 own = blue, 1 enemy = red). sup: super-ready pulse 0..1.
  function ring(ctx, x, y, T, side, local, sup, t) {
    const col = TEAMC[side] || TEAMC[2];
    const rx = T * 0.5, ry = T * 0.36;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = rgba(col, 0.32);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, T * (local ? 0.085 : 0.065));
    ctx.strokeStyle = col;
    ctx.stroke();
    if (sup > 0) {
      const p = 0.5 + 0.5 * Math.sin(t * 7);
      ctx.globalAlpha = 0.5 + p * 0.5;
      ctx.beginPath();
      ctx.ellipse(x, y, rx * (1.18 + p * 0.08), ry * (1.18 + p * 0.08), 0, 0, TAU);
      ctx.lineWidth = Math.max(1.5, T * 0.07);
      ctx.strokeStyle = '#ffd23f';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  const ICON = {
    gem(x) {
      pg(x, [-0.42, -0.2, -0.2, -0.55, 0.2, -0.55, 0.42, -0.2, 0, 0.6], '#c158ff', 0.09);
      pg(x, [-0.42, -0.2, 0.42, -0.2, 0, 0.6], '#9a2ee0', 0);
      pg(x, [-0.2, -0.55, 0.2, -0.55, 0.12, -0.2, -0.12, -0.2], '#efb8ff', 0);
      pg(x, [-0.12, -0.2, 0.12, -0.2, 0, 0.6], '#d886ff', 0);
      pg(x, [-0.42, -0.2, -0.2, -0.55, 0.2, -0.55, 0.42, -0.2, 0, 0.6], 'rgba(0,0,0,0)', 0.09);
    },
    cube(x) {
      pg(x, [-0.45, -0.2, 0, -0.45, 0.45, -0.2, 0, 0.05], '#9dff7a', 0.08);
      pg(x, [-0.45, -0.2, 0, 0.05, 0, 0.6, -0.45, 0.35], '#3ccf3c', 0.08);
      pg(x, [0.45, -0.2, 0, 0.05, 0, 0.6, 0.45, 0.35], '#25a02c', 0.08);
      pg(x, [-0.05, -0.36, 0.12, -0.3, 0.0, -0.22, 0.1, -0.16, -0.12, -0.1, -0.02, -0.2, -0.14, -0.26], '#fff', 0);
    },
    star(x) {
      star5(x, 0, 0.04, 0.58, 0.26, 0);
      fs(x, '#ffd23f', 0.09);
      star5(x, -0.04, -0.02, 0.32, 0.14, 0);
      x.fillStyle = '#fff3a0';
      x.fill();
    },
    skull(x) {
      el(x, 0, -0.08, 0.48, 0.44, '#f4f0e6', 0.08);
      rr(x, -0.24, 0.18, 0.48, 0.3, 0.08, '#f4f0e6', 0.08);
      el(x, -0.18, -0.06, 0.13, 0.15, OL, 0);
      el(x, 0.18, -0.06, 0.13, 0.15, OL, 0);
      pg(x, [0, 0.12, -0.06, 0.24, 0.06, 0.24], OL, 0);
      for (const sx of [-0.1, 0.1]) ln(x, sx, 0.32, sx, 0.46, 0.04, OL, 0);
    },
    ball(x) {
      el(x, 0, 0, 0.55, 0.55, '#fff', 0.08);
      pg(x, [0, -0.2, 0.19, -0.06, 0.12, 0.16, -0.12, 0.16, -0.19, -0.06], '#ff7a1a', 0.05);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 5;
        ln(x, Math.cos(a) * 0.22, Math.sin(a) * 0.22, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.05, OL, 0);
      }
      gloss(x, -0.2, -0.26, 0.16, 0.08, 0.6);
    },
    bolt(x) { pg(x, [0.1, -0.6, -0.35, 0.08, -0.02, 0.08, -0.12, 0.6, 0.35, -0.1, 0.02, -0.1], '#ffd23f', 0.08); },
    heart(x) {
      x.beginPath();
      x.moveTo(0, 0.5);
      x.bezierCurveTo(-0.7, 0.0, -0.45, -0.6, 0, -0.25);
      x.bezierCurveTo(0.45, -0.6, 0.7, 0.0, 0, 0.5);
      fs(x, '#ff4a6a', 0.08);
    },
  };
  const icons = new Map();
  // Small cached icon canvas (gem, cube, star, skull, ball, bolt, heart) for the HUD and menus.
  function icon(name, px) {
    px = Math.max(4, Math.round(px));
    const ck = name + px;
    let c = icons.get(ck);
    if (c) return c;
    c = makeCanvas(px, px);
    const x = c.getContext('2d');
    x.translate(px / 2, px / 2);
    x.scale(px * 0.8, px * 0.8);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    (ICON[name] || ICON.star)(x);
    icons.set(ck, c);
    return c;
  }

  // ---- environments and the tile layer ----
  const ENV = {
    mine: {
      g: ['#efb070', '#e5a262'], speck: '#c9864c', out: '#8a5434', outTop: '#b5703f', outDeco: 'crystal',
      wall: ['#d99a62', '#a8653a', '#7c4424'], stone: ['#a7adc2', '#717892', '#4f556c'],
      bush: ['#5fd05a', '#3ea446', '#226d30'], water: ['#3fb2f0', '#2b8fd6', '#1f6aa8'], fence: ['#8f5a30', '#f2dca8'],
    },
    grass: {
      g: ['#93d968', '#88cf5e'], speck: '#6fb54a', out: '#3f8a3a', outTop: '#5aa84a', outDeco: 'tree',
      wall: ['#d8c49a', '#a8946a', '#7a6848'], stone: ['#9ea6b8', '#6d7488', '#4c5266'],
      bush: ['#46c25a', '#2f9a44', '#1c6a30'], water: ['#45b8f2', '#2f98dc', '#2272b0'], fence: ['#8f5a30', '#f2dca8'],
    },
    turf: {
      g: ['#6fd062', '#63c457'], speck: '#55b04a', out: '#2f6a8a', outTop: '#4a8ab0', outDeco: 'stand',
      wall: ['#e2e6f0', '#aab0c4', '#7a8098'], stone: ['#8a92a8', '#5d6478', '#434a5e'],
      bush: ['#3fb850', '#2a8f3e', '#1a6430'], water: ['#45b8f2', '#2f98dc', '#2272b0'], fence: ['#e8e8f0', '#ff6a3a'],
    },
    desert: {
      g: ['#f5d690', '#edca80'], speck: '#d8ac62', out: '#b0743e', outTop: '#d49656', outDeco: 'cactus',
      wall: ['#e8a868', '#b8743e', '#8a4e26'], stone: ['#b8a48a', '#8a765e', '#64543e'],
      bush: ['#8ccf4a', '#62a636', '#3f7a24'], water: ['#45c0e8', '#2fa0d0', '#2278a8'], fence: ['#8f5a30', '#f2dca8'],
    },
    snow: {
      g: ['#eef5fc', '#e2ecf8'], speck: '#c8d8ec', out: '#5a7aa8', outTop: '#8aa8d0', outDeco: 'pine',
      wall: ['#b8e0f8', '#7ab0dc', '#4e80b0'], stone: ['#a0a8c0', '#6c7490', '#4c5270'],
      bush: ['#4cbf8a', '#2f9a6a', '#1d6a4a'], water: ['#5ac8f0', '#3aa4dc', '#2a7ab4'], fence: ['#8f5a30', '#f2dca8'],
    },
  };
  const MODE_ENV = { gem: 'mine', sd: 'grass', ball: 'turf', ko: 'desert', bounty: 'snow' };
  function envOf(map, mode) {
    if (map.env && ENV[map.env]) return ENV[map.env];
    return ENV[MODE_ENV[mode] || MODE_ENV[(map.modes && map.modes[0]) || 'gem']] || ENV.mine;
  }
  const MX = 9, MY = 3; // tile layer margin around the map (tiles)
  const RAISED = (tt) => tt === TILE.WALL || tt === TILE.STONE || tt === TILE.BOX;

  // Pre-renders the flat part of a map (floor, water, pads, mode markings, shadows, the border) in
  // screen orientation: flip = the view turned 180 degrees. opts: { mode, team (local team, for
  // spawn tints) }. Raised tiles (walls, crates, bushes, fences) are drawn per frame by drawRow so
  // they can overlap brawlers in depth order. The layer canvas pixel (0, 0) is the screen-top-left
  // corner of the margin; one tile = layer.px pixels.
  function tileLayer(map, px, flip, opts) {
    opts = opts || {};
    const lw = map.w + MX * 2, lh = map.h + MY * 2;
    // keep the canvas within ~6M pixels (phone canvas memory); bigger zooms are drawn scaled
    px = Math.max(8, Math.min(Math.round(px), Math.floor(Math.sqrt(6e6 / (lw * lh)))));
    const c = makeCanvas(lw * px, lh * px);
    const L = { canvas: c, px, flip: !!flip, map, env: envOf(map, opts.mode), mode: opts.mode || (map.modes && map.modes[0]), team: opts.team | 0, lw, lh, mineIdx: -1 };
    if (map.mine) L.mineIdx = Math.floor(map.mine.y) * map.w + Math.floor(map.mine.x);
    const x = c.getContext('2d');
    x.lineJoin = 'round';
    x.lineCap = 'round';
    paintOutside(x, L);
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) groundTile(x, L, tx, ty);
    paintMarks(x, L);
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) groundShadow(x, L, tx, ty);
    paintBorder(x, L);
    return L;
  }
  // world tile -> layer tile (screen orientation)
  const lxOf = (L, tx) => (L.flip ? L.map.w - 1 - tx : tx) + MX;
  const lyOf = (L, ty) => (L.flip ? L.map.h - 1 - ty : ty) + MY;
  const tAt = (m, tx, ty) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? -1 : m.tiles[ty * m.w + tx]);

  function paintOutside(x, L) {
    const e = L.env, px = L.px, c = L.canvas;
    x.fillStyle = e.outTop;
    x.fillRect(0, 0, c.width, c.height);
    // big soft checker on the plateau
    x.fillStyle = 'rgba(0,0,0,0.05)';
    for (let ty = 0; ty < L.lh; ty += 2) for (let tx = (ty / 2) & 1 ? 2 : 0; tx < L.lw; tx += 4) x.fillRect(tx * px, ty * px, px * 2, px * 2);
    const rng = new RNG(hashStr(L.map.key || 'map') ^ 0x5eed);
    const n = Math.round(L.lw * L.lh * 0.05);
    for (let i = 0; i < n; i++) {
      const tx = rng.range(0, L.lw), ty = rng.range(0, L.lh);
      if (tx > MX - 1.2 && tx < MX + L.map.w + 1.2 && ty > MY - 1.6 && ty < MY + L.map.h + 1.2) continue;
      x.save();
      x.translate(tx * px, ty * px);
      x.scale(px, px);
      decor(x, e, rng);
      x.restore();
    }
  }
  function decor(x, e, rng) {
    const s = rng.range(0.7, 1.2);
    x.scale(s, s);
    x.lineJoin = 'round';
    switch (e.outDeco) {
      case 'crystal':
        if (rng.chance(0.5)) {
          pg(x, [-0.3, 0.2, -0.18, -0.5, 0.0, -0.75, 0.16, -0.45, 0.3, 0.2], '#b45cff', 0.06);
          pg(x, [0.0, -0.75, 0.16, -0.45, 0.04, 0.2], '#e2a8ff', 0);
        } else {
          el(x, 0, 0, 0.42, 0.3, '#9a6440', 0.06);
          gloss(x, -0.12, -0.08, 0.16, 0.07, 0.25);
        }
        break;
      case 'tree':
        el(x, 0.05, 0.28, 0.42, 0.16, 'rgba(0,0,0,0.2)', 0);
        rr(x, -0.07, -0.1, 0.14, 0.4, 0.04, '#7a4a26', 0.05);
        el(x, 0, -0.42, 0.42, 0.38, '#3aa048', 0.06);
        el(x, -0.12, -0.52, 0.2, 0.16, '#5ac85a', 0);
        break;
      case 'stand':
        rr(x, -0.45, -0.3, 0.9, 0.6, 0.1, rng.chance(0.5) ? '#ff6a5a' : '#5aa8ff', 0.06);
        dot(x, -0.15, -0.05, 0.1, '#ffd2ad');
        dot(x, 0.18, -0.05, 0.1, '#e8a878');
        break;
      case 'cactus':
        rr(x, -0.12, -0.6, 0.24, 0.8, 0.12, '#4cb85a', 0.06);
        rr(x, -0.36, -0.35, 0.14, 0.3, 0.07, '#4cb85a', 0.05);
        rr(x, 0.22, -0.45, 0.14, 0.3, 0.07, '#4cb85a', 0.05);
        break;
      case 'pine':
        rr(x, -0.06, 0.0, 0.12, 0.3, 0.03, '#6a4a2a', 0.05);
        pg(x, [-0.45, 0.05, 0, -0.75, 0.45, 0.05], '#2f8a6a', 0.06);
        pg(x, [-0.25, -0.38, 0, -0.75, 0.25, -0.38], '#fff', 0);
        break;
    }
  }

  // Floor of one world tile (and the flat look of water, pads and bush ground).
  function groundTile(x, L, tx, ty) {
    const m = L.map, e = L.env, px = L.px;
    const X = lxOf(L, tx) * px, Y = lyOf(L, ty) * px;
    const tt = m.tiles[ty * m.w + tx];
    x.fillStyle = e.g[(tx + ty) & 1];
    x.fillRect(X, Y, px, px);
    const h = hashStr(tx + ',' + ty + (m.key || ''));
    // specks
    x.fillStyle = rgba(e.speck, 0.5);
    for (let i = 0; i < 3; i++) {
      const sx = ((h >>> (i * 5)) & 31) / 31, sy = ((h >>> (i * 5 + 15)) & 31) / 31;
      x.fillRect(X + sx * px * 0.85, Y + sy * px * 0.85, px * 0.07, px * 0.05);
    }
    if (tt === TILE.WATER) waterTile(x, L, tx, ty, X, Y);
    else if (tt === TILE.BUSH) {
      x.fillStyle = rgba(e.bush[2], 0.45);
      x.fillRect(X, Y, px, px);
    } else if (tt === TILE.PAD) padTile(x, px, X, Y);
  }
  // Screen-relative neighbour: dx/dy are screen directions (the layer may be flipped).
  function nb(L, tx, ty, dx, dy) {
    if (L.flip) { dx = -dx; dy = -dy; }
    return tAt(L.map, tx + dx, ty + dy);
  }
  function waterTile(x, L, tx, ty, X, Y) {
    const e = L.env, px = L.px;
    x.fillStyle = e.water[0];
    x.fillRect(X, Y, px, px);
    const land = (dx, dy) => { const n = nb(L, tx, ty, dx, dy); return n !== TILE.WATER && n !== -1; };
    // the bank's front face shows along the top edge (3/4 view), foam on the other edges
    if (land(0, -1)) {
      x.fillStyle = e.water[2];
      x.fillRect(X, Y, px, px * 0.24);
      x.fillStyle = 'rgba(255,255,255,0.55)';
      x.fillRect(X, Y + px * 0.24, px, px * 0.05);
    }
    x.fillStyle = 'rgba(255,255,255,0.5)';
    if (land(0, 1)) x.fillRect(X, Y + px * 0.9, px, px * 0.1);
    if (land(-1, 0)) x.fillRect(X, Y, px * 0.08, px);
    if (land(1, 0)) x.fillRect(X + px * 0.92, Y, px * 0.08, px);
  }
  function padTile(x, px, X, Y) {
    const cx = X + px / 2, cy = Y + px / 2;
    x.fillStyle = '#4a5068';
    circle(x, cx, cy, px * 0.46);
    x.fill();
    x.lineWidth = px * 0.05;
    x.strokeStyle = OL;
    x.stroke();
    x.fillStyle = '#ffb02e';
    circle(x, cx, cy, px * 0.34);
    x.fill();
    x.fillStyle = '#ffe27a';
    circle(x, cx, cy, px * 0.2);
    x.fill();
  }
  // Soft shadows that raised tiles and bushes cast on the floor below and to the right.
  function groundShadow(x, L, tx, ty) {
    const m = L.map, tt = m.tiles[ty * m.w + tx];
    if (!RAISED(tt) && tt !== TILE.BUSH) return;
    const px = L.px, X = lxOf(L, tx) * px, Y = lyOf(L, ty) * px;
    const below = nb(L, tx, ty, 0, 1), right = nb(L, tx, ty, 1, 0);
    x.fillStyle = 'rgba(40,20,10,0.22)';
    if (!RAISED(below) && below !== -1) {
      x.fillRect(X + px * 0.06, Y + px, px * 0.98, px * (tt === TILE.BUSH ? 0.14 : 0.26));
      x.fillRect(X + px * 0.06, Y + px, px * 0.98, px * 0.1);
    }
    if (RAISED(tt) && !RAISED(right) && right !== -1) x.fillRect(X + px, Y + px * 0.25, px * 0.2, px * 0.9);
  }
  // Mode markings on the floor: gem mine pit, goals and centre lines, spawn tints, bounty star.
  function paintMarks(x, L) {
    const m = L.map, px = L.px;
    const P = (wx, wy) => [(L.flip ? m.w - wx : wx) + MX, (L.flip ? m.h - wy : wy) + MY];
    const mode = L.mode;
    if (m.mine && mode !== 'sd') {
      const [cx, cy] = P(m.mine.x, m.mine.y);
      x.fillStyle = 'rgba(80,30,110,0.18)';
      circle(x, cx * px, cy * px, px * 2.3);
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.35)';
      x.lineWidth = px * 0.06;
      x.setLineDash([px * 0.25, px * 0.18]);
      circle(x, cx * px, cy * px, px * 2.3);
      x.stroke();
      x.setLineDash([]);
    }
    if (mode === 'ball' || L.env === ENV.turf) {
      x.strokeStyle = 'rgba(255,255,255,0.55)';
      x.lineWidth = px * 0.08;
      const [c0x, c0y] = P(0, m.h / 2), [c1x] = P(m.w, m.h / 2);
      x.beginPath();
      x.moveTo(c0x * px, c0y * px);
      x.lineTo(c1x * px, c0y * px);
      x.stroke();
      circle(x, (MX + m.w / 2) * px, (MY + m.h / 2) * px, px * 2.2);
      x.stroke();
      // mowing stripes
      x.fillStyle = 'rgba(255,255,255,0.05)';
      for (let ty = 0; ty < m.h; ty += 4) x.fillRect(MX * px, (MY + ty) * px, m.w * px, px * 2);
    }
    for (const g of m.goals || []) {
      const [ax, ay] = P(g.x0, g.y0), [bx, by] = P(g.x1, g.y1);
      const gx0 = Math.min(ax, bx), gy0 = Math.min(ay, by), gw = Math.abs(bx - ax), gh = Math.abs(by - ay);
      const col = TEAMC[g.team === L.team ? 0 : 1];
      x.fillStyle = rgba(col, 0.3);
      x.fillRect(gx0 * px, gy0 * px, gw * px, gh * px);
      x.strokeStyle = 'rgba(255,255,255,0.45)';
      x.lineWidth = px * 0.03;
      for (let i = 0.25; i < gw; i += 0.25) { x.beginPath(); x.moveTo((gx0 + i) * px, gy0 * px); x.lineTo((gx0 + i) * px, (gy0 + gh) * px); x.stroke(); }
      for (let i = 0.25; i < gh; i += 0.25) { x.beginPath(); x.moveTo(gx0 * px, (gy0 + i) * px); x.lineTo((gx0 + gw) * px, (gy0 + i) * px); x.stroke(); }
      x.strokeStyle = col;
      x.lineWidth = px * 0.12;
      x.strokeRect(gx0 * px, gy0 * px, gw * px, gh * px);
      // goal box lines on the turf
      x.strokeStyle = 'rgba(255,255,255,0.55)';
      x.lineWidth = px * 0.08;
      const near = (gy0 + gh / 2) < MY + m.h / 2 ? 1 : -1;
      x.strokeRect((gx0 - 1.5) * px, (near > 0 ? gy0 : gy0 - 2.5 + gh) * px, (gw + 3) * px, (gh + 2.5) * px);
    }
    if (mode !== 'sd' && m.spawns && m.spawns.length === 2) {
      for (let team = 0; team < 2; team++) {
        const col = TEAMC[team === L.team ? 0 : 1];
        for (const s of m.spawns[team]) {
          const [sx, sy] = P(s.x, s.y);
          x.fillStyle = rgba(col, 0.22);
          circle(x, sx * px, sy * px, px * 0.62);
          x.fill();
          x.strokeStyle = rgba(col, 0.6);
          x.lineWidth = px * 0.06;
          x.stroke();
        }
      }
    }
    if (m.obj && mode === 'bounty') {
      const [ox, oy] = P(m.obj.x, m.obj.y);
      x.save();
      x.translate(ox * px, oy * px);
      x.scale(px, px);
      star5(x, 0, 0, 1.0, 0.45, 0);
      x.fillStyle = 'rgba(255,210,63,0.3)';
      x.fill();
      x.lineWidth = 0.06;
      x.strokeStyle = 'rgba(255,255,255,0.5)';
      x.stroke();
      x.restore();
    }
  }
  // The plateau around the arena: its front face shows above the top edge of the map (3/4 view).
  function paintBorder(x, L) {
    const m = L.map, px = L.px, e = L.env;
    const X0 = MX * px, Y0 = MY * px, W = m.w * px, H = m.h * px;
    x.fillStyle = e.out;
    x.fillRect(X0 - px * 0.15, Y0 - px * 0.55, W + px * 0.3, px * 0.55);
    x.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < m.w; i++) x.fillRect(X0 + i * px + px * 0.47, Y0 - px * 0.5, px * 0.06, px * 0.5);
    x.strokeStyle = OL;
    x.lineWidth = Math.max(1.5, px * 0.06);
    x.strokeRect(X0 - px * 0.15, Y0 - px * 0.55, W + px * 0.3, H + px * 0.7);
    x.fillStyle = 'rgba(0,0,0,0.16)';
    x.fillRect(X0, Y0, W, px * 0.18);
    x.fillRect(X0, Y0, px * 0.12, H);
  }

  // Repaints the floor around a changed tile (a broken wall or box) and adds rubble.
  function updateTile(L, idx) {
    const m = L.map, tx = idx % m.w, ty = (idx / m.w) | 0, px = L.px;
    const x = L.canvas.getContext('2d');
    const ax = Math.min(lxOf(L, tx - 1), lxOf(L, tx + 1)), ay = Math.min(lyOf(L, ty - 1), lyOf(L, ty + 1));
    x.save();
    x.beginPath();
    x.rect(ax * px, ay * px, px * 3, px * 3);
    x.clip();
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = tx + dx, ny = ty + dy;
      if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h) groundTile(x, L, nx, ny);
    }
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = tx + dx, ny = ty + dy;
      if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h) groundShadow(x, L, nx, ny);
    }
    if (m.tiles[idx] === TILE.FLOOR) {
      const X = lxOf(L, tx) * px, Y = lyOf(L, ty) * px;
      const rng = new RNG(idx * 7919);
      for (let i = 0; i < 6; i++) {
        x.fillStyle = i & 1 ? L.env.wall[1] : L.env.wall[2];
        const r = px * rng.range(0.05, 0.11);
        circle(x, X + px * rng.range(0.15, 0.85), Y + px * rng.range(0.2, 0.85), r);
        x.fill();
      }
    }
    x.restore();
  }

  // ---- raised tiles (drawn every frame, row by row, in depth order with the entities) ----
  let rawT = 0;
  const rawCache = new Map();
  function rawSprite(key, T, paint, wTiles, hTiles, ox, oy) {
    if (T !== rawT) { rawCache.clear(); rawT = T; }
    let c = rawCache.get(key);
    if (c) return c;
    c = makeCanvas(Math.ceil(T * wTiles), Math.ceil(T * hTiles));
    c.ox = ox * T;
    c.oy = oy * T;
    const x = c.getContext('2d');
    x.translate(c.ox, c.oy);
    x.scale(T, T);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    paint(x);
    rawCache.set(key, c);
    return c;
  }
  // Block sprite: top face raised half a tile, front face below; mask bits N1 E2 S4 W8 (same kind).
  function paintBlock(x, cols, mask, kind, v) {
    const n = mask & 1, eE = mask & 2, s = mask & 4, w = mask & 8;
    const top = cols[0], side = cols[1], dark = cols[2];
    const r = 0.14;
    const x0 = w ? -0.02 : 0, x1 = eE ? 1.02 : 1, y0 = n ? -0.52 : -0.5, y1 = s ? 0.52 : 0.5;
    // front face
    if (!s) {
      x.beginPath();
      x.moveTo(x0, 0.4);
      x.lineTo(x1, 0.4);
      if (eE) x.lineTo(x1, 1); else { x.lineTo(x1, 1 - r); x.quadraticCurveTo(x1, 1, x1 - r, 1); }
      if (w) x.lineTo(x0, 1); else { x.lineTo(x0 + r, 1); x.quadraticCurveTo(x0, 1, x0, 1 - r); }
      x.closePath();
      x.fillStyle = side;
      x.fill();
      if (kind === 'wall') {
        x.fillStyle = dark;
        x.fillRect(x0, 0.72, x1 - x0, 0.035);
        const off = v & 1 ? 0.25 : 0.0;
        for (const bx of [off + 0.25, off + 0.75]) if (bx < 1) x.fillRect(bx, 0.5, 0.035, 0.22);
        x.fillRect(off + 0.5 > 1 ? off : off + 0.5, 0.755, 0.035, 0.22);
      } else if (kind === 'stone') {
        x.fillStyle = dark;
        x.fillRect(x0, 0.68, x1 - x0, 0.04);
        dot(x, 0.2, 0.84, 0.035, dark);
        dot(x, 0.8, 0.84, 0.035, dark);
      } else if (kind === 'box') {
        x.fillStyle = dark;
        for (const by of [0.62, 0.82]) x.fillRect(x0, by, x1 - x0, 0.03);
      }
      x.lineWidth = LW;
      x.strokeStyle = OL;
      x.beginPath();
      if (!w) { x.moveTo(x0, 0.4); x.lineTo(x0, 1 - r); x.quadraticCurveTo(x0, 1, x0 + r, 1); } else x.moveTo(x0, 1);
      if (!eE) { x.lineTo(x1 - r, 1); x.quadraticCurveTo(x1, 1, x1, 1 - r); x.lineTo(x1, 0.4); } else x.lineTo(x1, 1);
      x.stroke();
    }
    // top face
    const rNW = !n && !w ? r : 0, rNE = !n && !eE ? r : 0, rSE = !s && !eE ? r : 0, rSW = !s && !w ? r : 0;
    x.beginPath();
    x.moveTo(x0 + rNW, y0);
    x.lineTo(x1 - rNE, y0);
    if (rNE) x.quadraticCurveTo(x1, y0, x1, y0 + rNE);
    x.lineTo(x1, y1 - rSE);
    if (rSE) x.quadraticCurveTo(x1, y1, x1 - rSE, y1);
    x.lineTo(x0 + rSW, y1);
    if (rSW) x.quadraticCurveTo(x0, y1, x0, y1 - rSW);
    x.lineTo(x0, y0 + rNW);
    if (rNW) x.quadraticCurveTo(x0, y0, x0 + rNW, y0);
    x.closePath();
    x.fillStyle = top;
    x.fill();
    // bevel: light along open top/left edges, darker along open bottom/right
    x.fillStyle = 'rgba(255,255,255,0.28)';
    if (!n) x.fillRect(x0 + rNW * 0.5, y0 + 0.02, x1 - x0 - rNW * 0.5 - rNE * 0.5, 0.07);
    if (!w) x.fillRect(x0 + 0.02, y0 + rNW * 0.5, 0.07, y1 - y0 - rNW * 0.5 - rSW * 0.5);
    x.fillStyle = 'rgba(0,0,0,0.12)';
    if (!s) x.fillRect(x0 + rSW * 0.5, y1 - 0.08, x1 - x0 - rSW * 0.5 - rSE * 0.5, 0.06);
    if (!eE) x.fillRect(x1 - 0.08, y0 + rNE * 0.5, 0.06, y1 - y0 - rNE * 0.5 - rSE * 0.5);
    // texture
    if (kind === 'wall') {
      x.strokeStyle = rgba(dark.length === 7 ? dark : '#7c4424', 0.55);
      x.lineWidth = 0.03;
      x.beginPath();
      if (v & 1) { x.moveTo(0.25, -0.2); x.lineTo(0.42, -0.05); x.lineTo(0.38, 0.12); }
      if (v & 2) { x.moveTo(0.62, 0.05); x.lineTo(0.75, 0.2); }
      if (v & 4) { x.moveTo(0.5, -0.35); x.lineTo(0.58, -0.22); }
      x.stroke();
      dot(x, 0.7, -0.25, 0.03, rgba('#ffffff', 0.35));
    } else if (kind === 'stone') {
      x.strokeStyle = 'rgba(0,0,0,0.18)';
      x.lineWidth = 0.035;
      x.strokeRect(0.18, -0.32, 0.64, 0.64);
      for (const [dx, dy] of [[0.12, -0.38], [0.88, -0.38], [0.12, 0.38], [0.88, 0.38]]) dot(x, dx, dy, 0.04, 'rgba(0,0,0,0.25)');
    } else if (kind === 'box') {
      x.strokeStyle = 'rgba(80,40,10,0.45)';
      x.lineWidth = 0.035;
      for (const py of [-0.25, 0.0, 0.25]) { x.beginPath(); x.moveTo(x0 + 0.06, py); x.lineTo(x1 - 0.06, py); x.stroke(); }
      x.save();
      x.translate(0.5, 0.0);
      x.scale(0.62, 0.62);
      ICON.cube(x);
      x.restore();
    }
    // outline the open edges of the top face
    x.lineWidth = LW;
    x.strokeStyle = OL;
    x.beginPath();
    if (!n) { x.moveTo(x0 + rNW, y0); x.lineTo(x1 - rNE, y0); }
    if (!eE) { x.moveTo(x1, y0 + rNE); x.lineTo(x1, y1 - rSE); }
    if (!s) { x.moveTo(x1 - rSE, y1); x.lineTo(x0 + rSW, y1); }
    if (!w) { x.moveTo(x0, y1 - rSW); x.lineTo(x0, y0 + rNW); }
    x.stroke();
    x.beginPath();
    if (rNW) { x.moveTo(x0, y0 + rNW); x.quadraticCurveTo(x0, y0, x0 + rNW, y0); }
    if (rNE) { x.moveTo(x1 - rNE, y0); x.quadraticCurveTo(x1, y0, x1, y0 + rNE); }
    if (rSE) { x.moveTo(x1, y1 - rSE); x.quadraticCurveTo(x1, y1, x1 - rSE, y1); }
    if (rSW) { x.moveTo(x0 + rSW, y1); x.quadraticCurveTo(x0, y1, x0, y1 - rSW); }
    x.stroke();
  }
  const BUSH_PUFFS = [
    [[0.2, 0.25, 0.3], [0.78, 0.22, 0.3], [0.5, -0.02, 0.34], [0.26, 0.66, 0.3], [0.74, 0.66, 0.3], [0.5, 0.4, 0.3]],
    [[0.25, 0.1, 0.32], [0.75, 0.3, 0.3], [0.45, 0.62, 0.34], [0.82, 0.72, 0.26], [0.15, 0.6, 0.28], [0.55, 0.05, 0.28]],
    [[0.3, 0.2, 0.3], [0.7, 0.05, 0.3], [0.8, 0.5, 0.32], [0.3, 0.62, 0.32], [0.6, 0.72, 0.28], [0.5, 0.35, 0.3]],
  ];
  function paintBush(x, cols, v, pass) {
    const P = BUSH_PUFFS[v % 3];
    if (pass === 0) {
      for (const [px2, py2, r] of P) { x.beginPath(); x.arc(px2, py2 - 0.12, r + 0.05, 0, TAU); x.fillStyle = cols[2]; x.fill(); }
      return;
    }
    for (const [px2, py2, r] of P) { x.beginPath(); x.arc(px2, py2 - 0.12, r, 0, TAU); x.fillStyle = cols[1]; x.fill(); }
    for (const [px2, py2, r] of P) { x.beginPath(); x.arc(px2 - r * 0.15, py2 - 0.12 - r * 0.2, r * 0.75, 0, TAU); x.fillStyle = cols[0]; x.fill(); }
    for (const [px2, py2, r] of P) { x.beginPath(); x.ellipse(px2 - r * 0.35, py2 - 0.12 - r * 0.45, r * 0.28, r * 0.15, -0.5, 0, TAU); x.fillStyle = 'rgba(255,255,255,0.28)'; x.fill(); }
    x.strokeStyle = rgba(cols[2], 0.6);
    x.lineWidth = 0.035;
    for (let i = 0; i < 3; i++) {
      const [px2, py2] = P[(i * 2 + v) % P.length];
      x.beginPath();
      x.moveTo(px2 - 0.06, py2 - 0.02);
      x.lineTo(px2, py2 - 0.12);
      x.lineTo(px2 + 0.06, py2 - 0.02);
      x.stroke();
    }
  }
  function paintFence(x, cols, mask) {
    const rope = (x1, y1, x2, y2) => {
      x.beginPath();
      x.moveTo(x1, y1);
      x.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + 0.06, x2, y2);
      x.lineWidth = 0.09;
      x.strokeStyle = OL;
      x.stroke();
      x.lineWidth = 0.05;
      x.strokeStyle = cols[1];
      x.stroke();
    };
    for (const h of [-0.05, 0.2]) {
      if (mask & 2) rope(0.5, h, 1.0, h);
      if (mask & 8) rope(0.0, h, 0.5, h);
    }
    if (mask & 1) rope(0.5, 0.0, 0.5, -0.55);
    if (mask & 4) rope(0.5, 0.2, 0.5, 0.75);
    rr(x, 0.4, -0.3, 0.2, 0.75, 0.05, cols[0]);
    el(x, 0.5, -0.3, 0.1, 0.05, shade(cols[0], 0.3), 0.035);
  }
  function paintMine(x) {
    el(x, 0.5, 0.55, 0.62, 0.4, '#3a2a3e');
    el(x, 0.5, 0.5, 0.48, 0.28, '#1c1426', 0);
    const cr = [[0.2, 0.42, 0.45, 0.13], [0.5, 0.48, 0.78, 0.17], [0.8, 0.42, 0.5, 0.12], [0.36, 0.5, 0.55, 0.1], [0.66, 0.5, 0.62, 0.11]];
    for (const [cx, by, hgt, w2] of cr) {
      pg(x, [cx - w2, by, cx - w2 * 0.7, by - hgt * 0.75, cx, by - hgt, cx + w2 * 0.7, by - hgt * 0.75, cx + w2, by], '#b45cff', 0.04);
      pg(x, [cx, by - hgt, cx + w2 * 0.7, by - hgt * 0.75, cx + w2, by, cx + 0.01, by], '#8a2ed8', 0);
      ln(x, cx - w2 * 0.35, by - hgt * 0.7, cx - w2 * 0.3, by - 0.05, 0.03, 'rgba(255,255,255,0.6)', 0);
    }
  }
  // Draws the raised tiles of one world row. ox/oy: screen pixel of the layer origin; T: pixels per
  // tile; near: {x, y} (world) of the local brawler, whose nearby bushes turn see-through.
  function drawRow(ctx, map, L, ty, txA, txB, ox, oy, T, near, t) {
    const e = L.env, w = map.w, m = map;
    if (ty < 0 || ty >= m.h) return;
    txA = Math.max(0, txA);
    txB = Math.min(w - 1, txB);
    const sy = oy + lyOf(L, ty) * T;
    let bushes = 0;
    for (let tx = txA; tx <= txB; tx++) {
      const tt = m.tiles[ty * w + tx];
      if (tt === TILE.BUSH) { bushes++; continue; }
      if (tt !== TILE.WALL && tt !== TILE.STONE && tt !== TILE.BOX && tt !== TILE.FENCE) continue;
      const sx = ox + lxOf(L, tx) * T;
      const idx = ty * w + tx;
      if (idx === L.mineIdx) {
        const c = rawSprite('mine', T, paintMine, 1.6, 1.6, 0.3, 0.6);
        ctx.drawImage(c, sx - c.ox, sy - c.oy);
        const p = 0.5 + 0.5 * Math.sin(t * 3);
        const gl = glow('#c86aff', T);
        ctx.globalAlpha = 0.35 + p * 0.3;
        ctx.drawImage(gl, sx + T * 0.5 - T * 1.1, sy + T * 0.1 - T * 1.1, T * 2.2, T * 2.2);
        ctx.globalAlpha = 1;
        continue;
      }
      let mask = 0;
      if (nb(L, tx, ty, 0, -1) === tt) mask |= 1;
      if (nb(L, tx, ty, 1, 0) === tt) mask |= 2;
      if (nb(L, tx, ty, 0, 1) === tt) mask |= 4;
      if (nb(L, tx, ty, -1, 0) === tt) mask |= 8;
      if (tt === TILE.FENCE) {
        const c = rawSprite(tt * 1000 + mask, T, (x) => paintFence(x, e.fence, mask), 1.3, 1.6, 0.15, 0.7);
        ctx.drawImage(c, sx - c.ox, sy - c.oy);
        continue;
      }
      const v = hashStr(String(idx)) & 7;
      const kind = tt === TILE.WALL ? 'wall' : tt === TILE.STONE ? 'stone' : 'box';
      const cols = tt === TILE.WALL ? e.wall : tt === TILE.STONE ? e.stone : ['#dc9a52', '#a8692e', '#7a4818'];
      const c = rawSprite(tt * 1000 + mask * 8 + v, T, (x) => paintBlock(x, cols, mask, kind, v), 1.12, 1.62, 0.06, 0.56);
      ctx.drawImage(c, sx - c.ox, sy - c.oy);
    }
    if (!bushes) return;
    for (let pass = 0; pass < 2; pass++) {
      for (let tx = txA; tx <= txB; tx++) {
        if (m.tiles[ty * w + tx] !== TILE.BUSH) continue;
        const sx = ox + lxOf(L, tx) * T;
        const v = hashStr(tx + ':' + ty) % 3;
        const c = rawSprite('bush' + pass + v, T, (x) => paintBush(x, e.bush, v, pass), 1.8, 1.9, 0.4, 0.6);
        let a = 1;
        if (near) {
          const d2 = (tx + 0.5 - near.x) * (tx + 0.5 - near.x) + (ty + 0.5 - near.y) * (ty + 0.5 - near.y);
          if (d2 < 4) a = 0.45 + 0.55 * Math.min(1, Math.max(0, d2 - 1) / 3);
        }
        if (a < 1) ctx.globalAlpha = a;
        ctx.drawImage(c, sx - c.ox, sy - c.oy);
        if (a < 1) ctx.globalAlpha = 1;
      }
    }
  }
  // Animated water shimmer over the visible water tiles of a row.
  function drawWaterRow(ctx, map, L, ty, txA, txB, ox, oy, T, t) {
    if (ty < 0 || ty >= map.h) return;
    const sy = oy + lyOf(L, ty) * T;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1, T * 0.045);
    ctx.beginPath();
    for (let tx = Math.max(0, txA); tx <= Math.min(map.w - 1, txB); tx++) {
      if (map.tiles[ty * map.w + tx] !== TILE.WATER) continue;
      const sx = ox + lxOf(L, tx) * T;
      for (let i = 0; i < 2; i++) {
        const ph = t * 0.6 + tx * 0.37 + ty * 0.61 + i * 0.5;
        const u = ph - Math.floor(ph);
        const wx = sx + T * (0.15 + ((tx * 7 + ty * 3 + i * 5) % 6) * 0.1);
        const wy = sy + T * (0.35 + i * 0.35) + Math.sin(ph * TAU) * T * 0.03;
        const len = T * 0.22 * Math.sin(u * Math.PI);
        if (len < 1) continue;
        ctx.moveTo(wx - len / 2, wy);
        ctx.lineTo(wx + len / 2, wy);
      }
    }
    ctx.stroke();
  }

  // ---- shots ----
  // pk -> [kind, core colour, glow colour]
  const SHOT = {
    'nova.atk': ['pellet', '#fff27a', '#ff8a1a'], 'nova.sup': ['pellet2', '#fff0c0', '#ff3d1a'], 'nova.gad': ['pellet', '#fff', '#ff6a3a'],
    'dax.atk': ['bullet', '#fff6b0', '#ffb01a'], 'dax.sup': ['bullet2', '#ffffff', '#ff5a1a'], 'dax.gad': ['bullet', '#fff6b0', '#ffb01a'],
    'brick.atk': ['punch', '#ffffff', '#ff6a3a'], 'brick.sup': ['punch', '#ffffff', '#ffd23f'], 'brick.gad': ['punch', '#ffffff', '#3d9bff'],
    'bramble.atk': ['wave', '#d8ffa0', '#6ab83a'], 'bramble.sup': ['pawball', '#d8a878', '#8f5a30'], 'bramble.gad': ['wave', '#ffe0a0', '#c87a3a'],
    'pip.atk': ['bomb', '#33334a', '#ffb02e'], 'pip.sup': ['barrel', '#a8692e', '#ff5a1a'], 'pip.gad': ['bomb', '#33334a', '#ffd23f'],
    'melody.atk': ['note', '#ffb0e6', '#ff3aa8'], 'melody.sup': ['note', '#c8ffd0', '#2fd05a'], 'melody.gad': ['note', '#c8ffd0', '#2fd05a'],
    'sizzle.atk': ['bottle', '#3ad06a', '#7aff6a'], 'sizzle.sup': ['bottle', '#ff8a2a', '#ffd23f'], 'sizzle.gad': ['bottle', '#5a6aff', '#9ab0ff'],
    'gizmo.atk': ['orb', '#e8feff', '#1fc8ff'], 'gizmo.sup': ['crate', '#ff9a2e', '#ffd23f'], 'gizmo.gad': ['orb', '#e8feff', '#1fc8ff'],
    'gizmo.turret': ['bolt', '#e8feff', '#1fc8ff'],
    'volt.atk': ['zap', '#f0feff', '#3ad8ff'], 'volt.sup': ['storm', '#c0f0ff', '#3a7aff'], 'volt.gad': ['zap', '#f0feff', '#3ad8ff'],
    'hawk.atk': ['tracer', '#ffffff', '#c86aff'], 'hawk.sup': ['grenade', '#4a6a3a', '#ff8a1a'], 'hawk.gad': ['wave', '#ffffff', '#c86aff'],
    'frost.atk': ['snow', '#ffffff', '#8ad8ff'], 'frost.sup': ['wind', '#ffffff', '#8ad8ff'], 'frost.gad': ['snow', '#ffffff', '#8ad8ff'],
    'shade.atk': ['slash', '#e0c8ff', '#7a3ad8'], 'shade.sup': ['bats', '#ff5a8a', '#8a1a4a'], 'shade.gad': ['slash', '#e0c8ff', '#7a3ad8'],
    'zip.atk': ['bolt', '#d8fff0', '#1ae8a0'], 'zip.sup': ['bolt', '#d8fff0', '#1ae8a0'], 'zip.gad': ['bolt', '#d8fff0', '#1ae8a0'],
    'specter.atk': ['blade', '#eef0ff', '#8a5aff'], 'specter.sup': ['blade', '#eef0ff', '#c05aff'], 'specter.gad': ['blade', '#eef0ff', '#8a5aff'],
    'thorn.atk': ['cactus', '#6ad86a', '#2a9a3a'], 'thorn.spike': ['spike', '#e8ffd0', '#4cc25a'], 'thorn.sup': ['spikebag', '#6ad86a', '#2a9a3a'],
    'thorn.gad': ['cactus', '#6ad86a', '#2a9a3a'],
  };
  const SPIN = { bomb: 9, barrel: 6, bottle: 12, snow: 4, cactus: 6, blade: 18, grenade: 10, crate: 5, pawball: 6, spikebag: 5, storm: 3 };
  const ROUND_KINDS = { orb: 1, bomb: 1, barrel: 1, bottle: 1, snow: 1, cactus: 1, blade: 1, grenade: 1, crate: 1, pawball: 1, spikebag: 1, storm: 1, zap: 1 };
  const styleCache = new Map();
  function shotStyle(pk, sup) {
    let st = styleCache.get(pk);
    if (st) return st;
    st = SHOT[pk];
    if (!st) {
      const bk = String(pk).split('.')[0];
      const col = lookOf(bk).col;
      st = [sup ? 'bullet2' : 'bullet', '#ffffff', col.length === 7 ? col : '#ffd23f'];
    }
    styleCache.set(pk, st);
    return st;
  }
  function paintShot(x, kind, c1, c2, sz) {
    switch (kind) {
      case 'pellet': case 'pellet2': case 'bullet': case 'bullet2': case 'tracer': case 'bolt': {
        const big = kind === 'pellet2' || kind === 'bullet2';
        const len = kind === 'tracer' ? 1.2 : kind === 'bolt' ? 0.6 : big ? 0.7 : 0.5;
        const w = kind === 'tracer' ? 0.06 : big ? 0.13 : kind === 'pellet' ? 0.09 : 0.08;
        const g = x.createLinearGradient(-len, 0, 0, 0);
        g.addColorStop(0, rgba(c2, 0));
        g.addColorStop(1, rgba(c2, 0.85));
        x.beginPath();
        x.moveTo(0, -w * 1.1);
        x.lineTo(-len, 0);
        x.lineTo(0, w * 1.1);
        x.closePath();
        x.fillStyle = g;
        x.fill();
        dot(x, 0, 0, w * 2.1, rgba(c2, 0.35));
        x.beginPath();
        x.ellipse(0, 0, w * 1.7, w, 0, 0, TAU);
        x.fillStyle = c1;
        x.fill();
        x.lineWidth = 0.025;
        x.strokeStyle = c2;
        x.stroke();
        break;
      }
      case 'orb': case 'zap':
        dot(x, 0, 0, 0.3, rgba(c2, 0.3));
        dot(x, 0, 0, 0.2, rgba(c2, 0.7));
        dot(x, 0, 0, 0.12, c1);
        if (kind === 'zap') for (let i = 0; i < 4; i++) { const a = i * 1.7; ln(x, Math.cos(a) * 0.1, Math.sin(a) * 0.1, Math.cos(a + 0.4) * 0.28, Math.sin(a + 0.4) * 0.28, 0.025, c1, 0); }
        break;
      case 'storm':
        dot(x, 0, 0, 0.32, rgba(c2, 0.35));
        el(x, 0, 0, 0.2, 0.2, '#3a4a8a', 0.04);
        for (let i = 0; i < 3; i++) { const a = (i * TAU) / 3; ln(x, Math.cos(a) * 0.06, Math.sin(a) * 0.06, Math.cos(a + 0.6) * 0.18, Math.sin(a + 0.6) * 0.18, 0.03, c1, 0); }
        break;
      case 'bomb':
        el(x, 0, 0, 0.16, 0.16, c1, 0.04);
        gloss(x, -0.05, -0.06, 0.06, 0.03, 0.5);
        ln(x, 0.08, -0.12, 0.16, -0.2, 0.03, '#c8a878', 0);
        dot(x, 0.18, -0.22, 0.05, '#ffd23f');
        dot(x, 0.18, -0.22, 0.025, '#fff');
        break;
      case 'barrel':
        rr(x, -0.24, -0.2, 0.48, 0.4, 0.1, c1, 0.045);
        x.fillStyle = '#4a2a10';
        x.fillRect(-0.24, -0.1, 0.48, 0.04);
        x.fillRect(-0.24, 0.06, 0.48, 0.04);
        rr(x, -0.12, -0.08, 0.24, 0.16, 0.03, '#ff3b3b', 0.03);
        break;
      case 'bottle':
        rr(x, -0.13, -0.08, 0.2, 0.16, 0.06, c1, 0.035);
        rr(x, 0.06, -0.04, 0.1, 0.08, 0.02, c1, 0.03);
        gloss(x, -0.06, -0.04, 0.06, 0.02, 0.6);
        dot(x, 0.2, 0, 0.05, rgba(c2, 0.8));
        break;
      case 'crate':
        rr(x, -0.18, -0.18, 0.36, 0.36, 0.05, c1, 0.04);
        ln(x, -0.12, -0.12, 0.12, 0.12, 0.03, '#a85a10', 0);
        break;
      case 'pawball':
        el(x, 0, 0, 0.2, 0.2, c2, 0.04);
        dot(x, 0.03, 0.03, 0.08, '#ff9ab0');
        break;
      case 'grenade':
        el(x, 0, 0, 0.12, 0.14, c1, 0.035);
        rr(x, -0.05, -0.2, 0.1, 0.07, 0.02, '#9aa2b4', 0.025);
        break;
      case 'snow':
        dot(x, 0, 0, 0.2, rgba(c2, 0.3));
        el(x, 0, 0, 0.13, 0.13, c1, 0.035);
        dot(x, 0.03, 0.04, 0.06, '#d8f0ff');
        break;
      case 'cactus':
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ln(x, Math.cos(a) * 0.12, Math.sin(a) * 0.12, Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.025, '#f4f0d8', 0); }
        el(x, 0, 0, 0.15, 0.15, c1, 0.04);
        gloss(x, -0.04, -0.05, 0.05, 0.025, 0.5);
        break;
      case 'spikebag':
        el(x, 0, 0, 0.2, 0.18, '#c8a060', 0.04);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; pg(x, [Math.cos(a) * 0.15, Math.sin(a) * 0.15, Math.cos(a + 0.2) * 0.3, Math.sin(a + 0.2) * 0.3, Math.cos(a + 0.4) * 0.15, Math.sin(a + 0.4) * 0.15], c1, 0.025); }
        break;
      case 'spike':
        pg(x, [0.18, 0, -0.12, -0.05, -0.12, 0.05], c1, 0.03);
        break;
      case 'blade':
        for (let i = 0; i < 4; i++) {
          const a = (i * TAU) / 4;
          pg(x, [0, 0, Math.cos(a - 0.3) * 0.08, Math.sin(a - 0.3) * 0.08, Math.cos(a) * 0.22, Math.sin(a) * 0.22, Math.cos(a + 0.3) * 0.08, Math.sin(a + 0.3) * 0.08], c1, 0.025);
        }
        dot(x, 0, 0, 0.05, c2);
        break;
      case 'punch':
        x.beginPath();
        x.arc(-0.15, 0, 0.3, -1.0, 1.0);
        x.arc(-0.25, 0, 0.26, 0.9, -0.9, true);
        x.closePath();
        x.fillStyle = rgba(c2, 0.75);
        x.fill();
        el(x, 0.08, 0, 0.1, 0.12, c1, 0);
        break;
      case 'wave': case 'note': case 'wind': case 'slash': case 'bats': {
        const R = Math.max(0.3, sz);
        const spread = kind === 'slash' ? 1.0 : kind === 'wind' ? 1.1 : 0.85;
        x.beginPath();
        x.arc(-R * 0.75, 0, R, -spread, spread);
        x.arc(-R * 0.95, 0, R * 0.9, spread * 0.95, -spread * 0.95, true);
        x.closePath();
        x.fillStyle = rgba(c2, kind === 'wind' ? 0.45 : 0.75);
        x.fill();
        x.lineWidth = 0.035;
        x.strokeStyle = c1;
        x.stroke();
        if (kind === 'note') {
          x.beginPath();
          x.arc(-R * 0.95, 0, R * 0.72, -spread * 0.8, spread * 0.8);
          x.lineWidth = 0.04;
          x.strokeStyle = rgba(c1, 0.7);
          x.stroke();
          el(x, -0.02, 0.04, 0.06, 0.045, c1, 0.025);
          ln(x, 0.03, 0.03, 0.03, -0.15, 0.025, c1, 0);
          ln(x, 0.03, -0.15, 0.1, -0.1, 0.025, c1, 0);
        } else if (kind === 'wind') {
          for (const dy of [-0.25, 0, 0.25]) ln(x, -R * 0.5, dy * R, -R * 0.1, dy * R * 1.1, 0.03, 'rgba(255,255,255,0.8)', 0);
        } else if (kind === 'bats') {
          for (const dy of [-0.4, 0.0, 0.4]) pg(x, [-0.1, dy * R, -0.2, dy * R - 0.08, -0.14, dy * R, -0.2, dy * R + 0.08], '#2a0a1a', 0);
        }
        break;
      }
    }
  }
  const shotCache = new Map();
  let shotT = 0;
  function shotSprite(st, sz, T) {
    if (T !== shotT) { shotCache.clear(); shotT = T; }
    const kind = st[0];
    const wave = kind === 'wave' || kind === 'note' || kind === 'wind' || kind === 'slash' || kind === 'bats';
    const szq = wave ? Math.round(Math.max(0.3, sz) * 10) / 10 : 0;
    const ck = st[0] + st[1] + st[2] + szq;
    let c = shotCache.get(ck);
    if (c) return c;
    let w = 0.8, h = 0.8, ax = 0.4;
    if (!ROUND_KINDS[kind]) { w = kind === 'tracer' ? 1.45 : wave ? szq * 1.2 + 0.4 : 1.0; ax = wave ? szq * 0.6 + 0.3 : w - 0.3; h = wave ? szq * 2.0 + 0.3 : 0.6; }
    c = makeCanvas(Math.ceil(w * T), Math.ceil(h * T));
    c.ax = ax * T;
    c.ay = (h / 2) * T;
    const x = c.getContext('2d');
    x.translate(c.ax, c.ay);
    x.scale(T, T);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    paintShot(x, kind, st[1], st[2], szq);
    shotCache.set(ck, c);
    return c;
  }
  // Draws a shot at screen (x, y) on the ground, lifted by z tiles (lobs), heading `ang` on screen.
  function shot(ctx, s, x, y, z, ang, T, t) {
    const st = shotStyle(s.pk, s.sup);
    const kind = st[0];
    if (z > 0.02) shadow(ctx, x, y, T * 0.2 * (1 - Math.min(0.5, z * 0.15)), 0.3);
    const spr = shotSprite(st, (s.r || 0.3) * 1.15, T);
    const big = s.sup && ROUND_KINDS[kind] ? 1.35 : 1;
    const a = SPIN[kind] ? t * SPIN[kind] + s.id : ang;
    const ca = Math.cos(a) * big, sa = Math.sin(a) * big;
    ctx.setTransform(ca, sa, -sa, ca, x, y - z * T);
    ctx.drawImage(spr, -spr.ax, -spr.ay);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- areas ----
  const AREA = {
    'sizzle.atk': 'fire', 'sizzle.sup': 'fire', 'sizzle.gad': 'tar',
    'volt.sup': 'storm', 'volt.gad': 'pulse',
    'thorn.sup': 'spikes', 'thorn.atk': 'spikes', 'thorn.gad': 'heal',
    'melody.gad': 'heal', 'melody.sup': 'heal', 'melody.atk': 'heal',
    'frost.gad': 'frost', 'frost.sup': 'frost', 'frost.atk': 'frost',
    'brick.sup': 'slam', 'brick.gad': 'shield', 'hawk.gad': 'pulse', 'hawk.sup': 'boom',
    'pip.sup': 'boom', 'pip.atk': 'boom', 'pip.gad': 'boom',
    'zip.sup': 'speed', 'specter.sup': 'smoke', 'specter.gad': 'speed', 'gizmo.gad': 'heal', 'shade.sup': 'drain',
  };
  // Draws an area centred at screen (x, y). side: colour side of its owner (0 own, 1 enemy).
  function area(ctx, a, x, y, T, t, side) {
    let kind = AREA[a.ak];
    if (!kind) kind = a.heal > 0 ? 'heal' : a.slow > 0 ? 'frost' : a.dmg > 0 ? 'fire' : 'pulse';
    const R = Math.max(0.2, a.r) * T;
    const life = a.T > 0 ? clamp(a.t / a.T, 0, 1) : 1; // 1 fresh -> 0 gone
    const fade = Math.min(1, life * 6, (1 - life) * 12 + 0.25);
    const tc = TEAMC[side] || TEAMC[2];
    const sy = 0.78; // ground discs are squashed a little (3/4 view)
    const disc = (col, al, r) => {
      ctx.globalAlpha = al * fade;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * sy, 0, 0, TAU);
      ctx.fill();
    };
    const rim = (col, w, al) => {
      ctx.globalAlpha = al * fade;
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.ellipse(x, y, R, R * sy, 0, 0, TAU);
      ctx.stroke();
    };
    switch (kind) {
      case 'fire': {
        disc('#ff6a1a', 0.45, R);
        disc('#ffb02e', 0.5, R * 0.7);
        ctx.globalAlpha = fade;
        for (let i = 0; i < 9; i++) {
          const ang = i * 2.4 + a.id, rr2 = R * (0.2 + ((i * 37) % 10) / 13);
          const fx = x + Math.cos(ang) * rr2, fy = y + Math.sin(ang) * rr2 * sy;
          const fl = T * (0.16 + 0.06 * Math.sin(t * 13 + i * 1.7));
          ctx.fillStyle = i % 3 ? '#ffd23f' : '#ff5a1a';
          ctx.beginPath();
          ctx.moveTo(fx - fl * 0.55, fy);
          ctx.quadraticCurveTo(fx, fy - fl * 2.6, fx + fl * 0.55, fy);
          ctx.fill();
        }
        rim(tc, Math.max(1, T * 0.05), 0.6);
        break;
      }
      case 'tar':
        disc('#3a2a5a', 0.6, R);
        disc('#6a5aaa', 0.4, R * 0.6);
        rim(tc, Math.max(1, T * 0.05), 0.6);
        break;
      case 'storm': {
        disc('#2a3a8a', 0.35, R);
        ctx.globalAlpha = 0.85 * fade;
        ctx.strokeStyle = '#9ae8ff';
        ctx.lineWidth = Math.max(1, T * 0.06);
        ctx.setLineDash([T * 0.35, T * 0.25]);
        ctx.lineDashOffset = -t * T * 2;
        ctx.beginPath();
        ctx.ellipse(x, y, R * 0.92, R * 0.92 * sy, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        const k = Math.floor(t * 10);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, T * 0.04);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const ang = ((k * 7 + i * 13) % 17) / 17 * TAU, r1 = R * (0.2 + ((k + i * 3) % 5) * 0.15);
          let px = x + Math.cos(ang) * r1 * 0.3, py = y + Math.sin(ang) * r1 * 0.3 * sy;
          ctx.moveTo(px, py);
          for (let j = 1; j <= 3; j++) {
            px = x + Math.cos(ang + j * 0.25) * r1 * (0.3 + j * 0.25);
            py = y + Math.sin(ang + j * 0.25) * r1 * (0.3 + j * 0.25) * sy;
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
        rim(tc, Math.max(1, T * 0.05), 0.7);
        break;
      }
      case 'spikes':
        disc('#c8a060', 0.4, R);
        ctx.globalAlpha = fade;
        for (let i = 0; i < 14; i++) {
          const ang = i * 2.4 + a.id * 0.7, rr2 = R * Math.sqrt(((i * 7) % 14) / 14) * 0.9;
          const sx = x + Math.cos(ang) * rr2, sy2 = y + Math.sin(ang) * rr2 * sy;
          ctx.fillStyle = i & 1 ? '#4cc25a' : '#2f9a44';
          ctx.beginPath();
          ctx.moveTo(sx - T * 0.07, sy2);
          ctx.lineTo(sx, sy2 - T * 0.24);
          ctx.lineTo(sx + T * 0.07, sy2);
          ctx.closePath();
          ctx.fill();
        }
        rim(tc, Math.max(1, T * 0.05), 0.7);
        break;
      case 'heal': {
        disc('#3aff7a', 0.22, R);
        rim('#7affa0', Math.max(1, T * 0.07), 0.8);
        ctx.globalAlpha = fade;
        for (let i = 0; i < 5; i++) {
          const u = (t * 0.8 + i * 0.2) % 1;
          const ang = i * 1.9 + a.id;
          const px = x + Math.cos(ang) * R * 0.55, py = y + Math.sin(ang) * R * 0.55 * sy - u * T * 0.8;
          const s = T * 0.09;
          ctx.globalAlpha = fade * (1 - u);
          ctx.fillStyle = '#7affa0';
          ctx.fillRect(px - s, py - s * 0.35, s * 2, s * 0.7);
          ctx.fillRect(px - s * 0.35, py - s, s * 0.7, s * 2);
        }
        break;
      }
      case 'frost':
        disc('#bff4ff', 0.35, R);
        rim('#e8fbff', Math.max(1, T * 0.08), 0.85);
        ctx.globalAlpha = 0.8 * fade;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, T * 0.04);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * TAU + t * 0.4;
          ctx.moveTo(x + Math.cos(ang) * R * 0.3, y + Math.sin(ang) * R * 0.3 * sy);
          ctx.lineTo(x + Math.cos(ang) * R * 0.8, y + Math.sin(ang) * R * 0.8 * sy);
        }
        ctx.stroke();
        break;
      case 'slam': case 'pulse': case 'boom': case 'shield': case 'speed': case 'smoke': case 'drain': {
        const u = 1 - life;
        const col = kind === 'boom' ? '#ff8a1a' : kind === 'pulse' ? '#9ae8ff' : kind === 'speed' ? '#7affb0' : kind === 'smoke' ? '#9a8ab8' : kind === 'drain' ? '#ff3a6a' : kind === 'shield' ? '#7ab8ff' : '#ffb06a';
        if (kind === 'boom') {
          const gl = glow('#ff8a1a', T);
          ctx.globalAlpha = fade * 0.9;
          ctx.drawImage(gl, x - R * 1.2, y - R * 1.2, R * 2.4, R * 2.4);
        }
        disc(col, 0.25 * (1 - u * 0.5), R);
        ctx.globalAlpha = (1 - u) * 0.9;
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.5, T * 0.12 * (1 - u));
        ctx.beginPath();
        ctx.ellipse(x, y, R * (0.3 + 0.7 * easeOut(Math.min(1, u * 2))), R * sy * (0.3 + 0.7 * easeOut(Math.min(1, u * 2))), 0, 0, TAU);
        ctx.stroke();
        rim(tc, Math.max(1, T * 0.04), 0.5);
        break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- pickups, deploys, ball, poison cloud ----
  function pickup(ctx, p, x, y, T, t) {
    const name = p.pick === PICK.GEM ? 'gem' : p.pick === PICK.CUBE ? 'cube' : 'star';
    const hop = p.t < 0.45 ? Math.sin((p.t / 0.45) * Math.PI) * 0.7 : 0;
    const bob = Math.sin(t * 3 + p.id) * 0.06 + 0.3 + hop;
    shadow(ctx, x, y, T * 0.28, 0.25);
    const col = name === 'gem' ? '#c86aff' : name === 'cube' ? '#6aff6a' : '#ffd23f';
    const gl = glow(col, T * 0.5);
    ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 4 + p.id);
    ctx.drawImage(gl, x - T * 0.55, y - bob * T - T * 0.55, T * 1.1, T * 1.1);
    ctx.globalAlpha = 1;
    const ic = icon(name, T * (name === 'cube' ? 0.7 : 0.62));
    ctx.drawImage(ic, x - ic.width / 2, y - bob * T - ic.height / 2);
    if (p.n > 1) outlineText(ctx, String(p.n), x + T * 0.3, y - bob * T - T * 0.3, Math.max(9, T * 0.32), '#fff');
  }
  // Deploys: pets and turrets use body sprites; face is a screen angle.
  function deploy(ctx, d, x, y, T, t, face, flags) {
    if (BODY[d.dk]) brawler(ctx, d.dk, x, y, T, face, t, 0, flags);
    else {
      const col = lookOf(String(d.dk).split('.')[0]).col;
      shadow(ctx, x, y, T * 0.35);
      roundRect(ctx, x - T * 0.3, y - T * 0.55, T * 0.6, T * 0.55, T * 0.1);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = Math.max(1, T * 0.05);
      ctx.strokeStyle = OL;
      ctx.stroke();
    }
  }
  function ball(ctx, x, y, z, T, t, roll) {
    shadow(ctx, x, y, T * 0.3 * (1 - Math.min(0.5, z * 0.12)), 0.3);
    const ic = icon('ball', T * 0.66);
    const by = y - (z + 0.3) * T;
    ctx.setTransform(Math.cos(roll), Math.sin(roll), -Math.sin(roll), Math.cos(roll), x, by);
    ctx.drawImage(ic, -ic.width / 2, -ic.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // A puff of poison cloud (cached), drawn along the edge of the safe zone.
  function cloud(px) {
    return rawSprite('cloud', rawT || px, (x) => {
      const P = [[0.5, 0.5, 0.42], [0.25, 0.55, 0.28], [0.75, 0.55, 0.28], [0.42, 0.32, 0.26], [0.65, 0.3, 0.24]];
      for (const [cx, cy, r] of P) dot(x, cx, cy, r + 0.04, 'rgba(30,110,40,0.55)');
      for (const [cx, cy, r] of P) dot(x, cx, cy, r, 'rgba(90,210,90,0.75)');
      for (const [cx, cy, r] of P) dot(x, cx - r * 0.25, cy - r * 0.3, r * 0.45, 'rgba(180,255,170,0.45)');
    }, 1.0, 1.0, 0, 0);
  }

  // Clears every cached sprite (call when the zoom changes a lot, e.g. after a resize).
  function clear() {
    sprites.clear();
    rawCache.clear();
    shotCache.clear();
    glows.clear();
  }

  return {
    F, OL, TEAMC, LOOK, ENV, MX, MY,
    brawler, portrait, tileLayer, updateTile, drawRow, drawWaterRow,
    shot, shotStyle, area, pickup, deploy, ball, cloud, ring, shadow, glow, icon, clear,
    color: (bk) => lookOf(bk).col,
    hasLook: (bk) => !!BODY[bk],
  };
})();
