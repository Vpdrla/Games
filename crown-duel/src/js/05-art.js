// ---------- Procedural art: units, buildings, towers, projectiles, arena and card faces ----------
// Unit painters draw in tile units with the unit's feet at (0, 0); callers translate and scale.
const TEAM_COLORS = [
  { main: '#3d8bff', dark: '#1f4fb0', light: '#a8d0ff', hp: '#4aa8ff', name: 'blue' },
  { main: '#ff4848', dark: '#a8182a', light: '#ffb0a8', hp: '#ff5454', name: 'red' },
];
const OUT = '#1c1a26';
const SKIN = '#f3c6a0';
const GOB = '#7fcf4a';
const BONE = '#efeee3';
const STEEL = '#c9d3dc';
const WOOD = '#8a5a2b';
const GOLDC = '#ffcc33';

function fillStroke(ctx, fill, lw) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw || 0.05;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}
function ell(ctx, x, y, rx, ry, fill, lw) { ellipse(ctx, x, y, rx, ry); fillStroke(ctx, fill, lw); }
function rrect(ctx, x, y, w, h, r, fill, lw) { roundRect(ctx, x, y, w, h, r); fillStroke(ctx, fill, lw); }
function seg(ctx, x1, y1, x2, y2, w, col, cap) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineCap = cap || 'round';
  ctx.lineWidth = w + 0.08;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  ctx.stroke();
}
function poly(ctx, pts, fill, lw) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  fillStroke(ctx, fill, lw);
}

// Weapon angle through an attack: raise (wind-up) -> fast strike -> recover.
function swingAngle(atk, rest) {
  rest = rest == null ? -1.1 : rest;
  if (atk < 0) return rest;
  if (atk < 0.12) return lerp(-2.4, 0.4, atk / 0.12);
  if (atk < 0.4) return lerp(0.4, rest, (atk - 0.12) / 0.28);
  if (atk > 0.7) return lerp(rest, -2.4, (atk - 0.7) / 0.3);
  return rest;
}

// ---- weapons (drawn from the hand, pointing along +x after rotation) ----
const W = {
  sword(ctx, len, col) {
    rrect(ctx, -0.03, -0.05, 0.1, 0.1, 0.03, '#6b4a2a', 0.03);
    rrect(ctx, 0.06, -0.1, 0.05, 0.2, 0.02, GOLDC, 0.03);
    poly(ctx, [0.1, -0.045, 0.1 + len, -0.03, 0.14 + len, 0, 0.1 + len, 0.03, 0.1, 0.045], col || STEEL, 0.035);
  },
  axe(ctx, len, big) {
    seg(ctx, -0.05, 0, len, 0, 0.06, WOOD);
    const s = big ? 1.4 : 1;
    ctx.save();
    ctx.translate(len - 0.06, 0);
    ctx.scale(s, s);
    poly(ctx, [-0.08, -0.03, 0.06, -0.2, 0.12, -0.16, 0.1, 0.02, 0.06, 0.16, -0.08, 0.04], STEEL, 0.035);
    ctx.restore();
  },
  spear(ctx, len) {
    seg(ctx, -0.25, 0, len, 0, 0.05, '#a0703a');
    poly(ctx, [len, -0.06, len + 0.18, 0, len, 0.06], STEEL, 0.03);
  },
  club(ctx, len, col) {
    seg(ctx, -0.02, 0, len * 0.6, 0, 0.07, col || BONE);
    ell(ctx, len * 0.75, 0, 0.12, 0.09, col || BONE, 0.035);
  },
  hammer(ctx, len) {
    seg(ctx, -0.05, 0, len, 0, 0.06, WOOD);
    rrect(ctx, len - 0.08, -0.14, 0.16, 0.28, 0.04, '#8a8f96', 0.035);
  },
  pick(ctx, len) {
    seg(ctx, -0.05, 0, len, 0, 0.05, WOOD);
    ctx.beginPath();
    ctx.moveTo(len - 0.02, -0.2);
    ctx.quadraticCurveTo(len + 0.1, 0, len - 0.02, 0.2);
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = STEEL;
    ctx.stroke();
  },
  staff(ctx, len, orb, glow) {
    seg(ctx, -0.35, 0, len, 0, 0.05, '#6b4526');
    if (glow) {
      ctx.fillStyle = rgba(glow, 0.35);
      circle(ctx, len + 0.08, 0, 0.18);
      ctx.fill();
    }
    ell(ctx, len + 0.08, 0, 0.09, 0.09, orb, 0.03);
  },
};

// Chibi humanoid. p: size, skin, torso, torso2, legs, head, hat(ctx,o,p), face, weapon(ctx,o), wAng, noLegs, beard, belly
function hum(ctx, o, p) {
  const k = p.size || 1;
  ctx.save();
  ctx.scale(o.dir * k, k);
  const mv = o.moving;
  const ph = o.walk * TAU;
  const bob = mv ? Math.abs(Math.sin(ph)) * 0.05 : Math.sin(o.t * 2) * 0.008;
  // legs
  if (!p.noLegs) {
    const l = mv ? Math.sin(ph) * 0.08 : 0;
    rrect(ctx, -0.17 + l, -0.26 - Math.max(0, l) * 0.6, 0.13, 0.26, 0.05, p.legs || '#4b3b30', 0.04);
    rrect(ctx, 0.04 - l, -0.26 - Math.max(0, -l) * 0.6, 0.13, 0.26, 0.05, p.legs || '#4b3b30', 0.04);
  }
  ctx.translate(0, -bob);
  const bw = p.belly ? 0.56 : 0.46;
  // back hand
  ell(ctx, -0.25, -0.42, 0.075, 0.075, p.hand || p.skin, 0.035);
  if (p.off) p.off(ctx, o);
  // torso
  rrect(ctx, -bw / 2, -0.66, bw, 0.42, 0.14, p.torso, 0.05);
  if (p.torso2) {
    roundRect(ctx, -bw / 2 + 0.06, -0.62, bw - 0.12, 0.2, 0.08);
    ctx.fillStyle = p.torso2;
    ctx.fill();
  }
  if (p.belt !== false) {
    ctx.fillStyle = p.belt || '#5a3a1f';
    ctx.fillRect(-bw / 2 + 0.02, -0.33, bw - 0.04, 0.06);
  }
  // head
  const hr = p.head || 0.27;
  const hy = -0.66 - hr * 0.78;
  ell(ctx, 0, hy, hr, hr * 0.96, p.skin, 0.05);
  if (!o.back) {
    if (p.face) p.face(ctx, o, hy, hr);
    else {
      ctx.fillStyle = OUT;
      circle(ctx, 0.05, hy - 0.01, 0.035);
      ctx.fill();
      circle(ctx, 0.16, hy - 0.01, 0.035);
      ctx.fill();
    }
  }
  if (p.beard && !o.back) {
    ctx.beginPath();
    ctx.moveTo(-0.14, hy + 0.06);
    ctx.quadraticCurveTo(0.05, hy + hr + 0.22, 0.24, hy + 0.06);
    ctx.quadraticCurveTo(0.05, hy + 0.14, -0.14, hy + 0.06);
    fillStroke(ctx, p.beard, 0.035);
  }
  if (p.hat) p.hat(ctx, o, hy, hr);
  // weapon hand
  ctx.save();
  ctx.translate(0.24, -0.44);
  ctx.rotate(p.wAng != null ? p.wAng : swingAngle(o.atk));
  if (p.weapon) p.weapon(ctx, o);
  ell(ctx, 0, 0, 0.075, 0.075, p.hand || p.skin, 0.035);
  ctx.restore();
  ctx.restore();
}

function hood(col) {
  return (ctx, o, hy, hr) => {
    ctx.beginPath();
    ctx.arc(0, hy, hr + 0.04, Math.PI * 1.05, Math.PI * 1.95);
    ctx.quadraticCurveTo(hr + 0.1, hy + 0.1, hr * 0.6, hy + 0.12);
    ctx.lineTo(-hr * 0.6, hy + 0.12);
    ctx.quadraticCurveTo(-hr - 0.1, hy + 0.1, -hr - 0.03, hy - 0.02);
    fillStroke(ctx, col, 0.045);
    if (o.back) { ell(ctx, 0, hy, hr * 0.95, hr * 0.9, col, 0.04); }
  };
}
function helmet(col, plume) {
  return (ctx, o, hy, hr) => {
    ctx.beginPath();
    ctx.arc(0, hy, hr + 0.03, Math.PI, 0);
    ctx.lineTo(hr + 0.03, hy + 0.04);
    ctx.lineTo(-hr - 0.03, hy + 0.04);
    ctx.closePath();
    fillStroke(ctx, col, 0.045);
    if (o.back) ell(ctx, 0, hy + 0.02, hr, hr * 0.85, col, 0.04);
    if (plume) {
      ctx.beginPath();
      ctx.moveTo(-0.02, hy - hr);
      ctx.quadraticCurveTo(-0.3, hy - hr - 0.28, -0.36, hy - hr + 0.02);
      ctx.quadraticCurveTo(-0.2, hy - hr - 0.08, -0.02, hy - hr);
      fillStroke(ctx, plume, 0.035);
    }
  };
}
function eyesAngry(ctx, o, hy) {
  ctx.fillStyle = OUT;
  circle(ctx, 0.06, hy + 0.01, 0.035);
  ctx.fill();
  circle(ctx, 0.17, hy + 0.01, 0.035);
  ctx.fill();
  seg(ctx, 0.0, hy - 0.08, 0.1, hy - 0.04, 0.03, OUT);
  seg(ctx, 0.22, hy - 0.08, 0.12, hy - 0.04, 0.03, OUT);
}
function glowEyes(col) {
  return (ctx, o, hy) => {
    ctx.fillStyle = col;
    ctx.fillRect(0.02, hy - 0.03, 0.08, 0.05);
    ctx.fillRect(0.14, hy - 0.03, 0.08, 0.05);
  };
}
function skullFace(ctx, o, hy) {
  ctx.fillStyle = OUT;
  ell(ctx, 0.06, hy, 0.055, 0.06, OUT, 0.01);
  ell(ctx, 0.19, hy, 0.055, 0.06, OUT, 0.01);
  ctx.fillRect(0.06, hy + 0.1, 0.13, 0.025);
}
function bowWeapon(ctx, o) {
  const pull = o.atk > 0.6 ? (o.atk - 0.6) / 0.4 : 0;
  ctx.rotate(1.1);
  ctx.beginPath();
  ctx.arc(-0.05, 0, 0.3, -1.2, 1.2);
  ctx.lineWidth = 0.1;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = 0.055;
  ctx.strokeStyle = '#a0662a';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.06, -0.28);
  ctx.lineTo(-0.05 - pull * 0.2, 0);
  ctx.lineTo(0.06, 0.28);
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = '#eee';
  ctx.stroke();
  if (pull > 0) seg(ctx, -0.05 - pull * 0.2, 0, 0.35, 0, 0.025, '#d8c8a0');
}
function musketWeapon(ctx, o) {
  ctx.rotate(1.1 - (o.atk >= 0 && o.atk < 0.1 ? 0.25 : 0));
  rrect(ctx, -0.22, -0.05, 0.3, 0.1, 0.03, '#7a4a22', 0.035);
  rrect(ctx, 0.05, -0.035, 0.52, 0.07, 0.02, '#555c66', 0.035);
  if (o.atk >= 0 && o.atk < 0.08) {
    ctx.fillStyle = '#ffd24a';
    circle(ctx, 0.66, 0, 0.1);
    ctx.fill();
  }
}

const UNIT_ART = {
  knight(ctx, o) {
    hum(ctx, o, { skin: SKIN, torso: STEEL, torso2: o.c.main, legs: '#5a5f6a', hat: helmet('#9aa6b2', o.c.main), belt: '#6b4a2a',
      face: (c, oo, hy) => { eyesAngry(c, oo, hy); seg(c, 0.02, hy + 0.12, 0.24, hy + 0.12, 0.05, '#7a4a20'); },
      weapon: (c) => W.sword(c, 0.5) });
  },
  archer(ctx, o) {
    hum(ctx, o, { skin: SKIN, torso: o.c.main, torso2: o.c.light, legs: '#4a3a5a', hat: hood('#3a8a3a'), weapon: bowWeapon, wAng: -0.2 });
  },
  goblin(ctx, o) {
    hum(ctx, o, { size: 0.82, skin: GOB, torso: '#8b5a2b', torso2: o.c.main, legs: '#5a3a1a', head: 0.3,
      hat: (c, oo, hy, hr) => {
        poly(c, [-hr + 0.02, hy - 0.02, -hr - 0.22, hy - 0.16, -hr + 0.04, hy + 0.08], GOB, 0.035);
        poly(c, [hr - 0.02, hy - 0.02, hr + 0.22, hy - 0.16, hr - 0.04, hy + 0.08], GOB, 0.035);
        ctx.fillStyle = o.c.main;
        ctx.fillRect(-hr * 0.9, hy - hr * 0.55, hr * 1.8, 0.07);
      },
      face: eyesAngry, weapon: (c) => W.sword(c, 0.22, '#d0d8e0') });
  },
  speargob(ctx, o) {
    hum(ctx, o, { size: 0.82, skin: GOB, torso: '#8b5a2b', torso2: o.c.main, legs: '#5a3a1a', head: 0.3,
      hat: (c, oo, hy, hr) => {
        poly(c, [-hr + 0.02, hy - 0.02, -hr - 0.22, hy - 0.16, -hr + 0.04, hy + 0.08], GOB, 0.035);
        poly(c, [hr - 0.02, hy - 0.02, hr + 0.22, hy - 0.16, hr - 0.04, hy + 0.08], GOB, 0.035);
        hood(o.c.main)(c, oo, hy, hr * 0.9);
      },
      face: eyesAngry, weapon: (c, oo) => { if (!(oo.atk >= 0 && oo.atk < 0.25)) W.spear(c, 0.45); }, wAng: o.atk > 0.6 ? -0.8 - (o.atk - 0.6) : -0.9 });
  },
  skeleton(ctx, o) {
    hum(ctx, o, { size: 0.8, skin: BONE, torso: '#dcdad0', torso2: null, legs: BONE, belt: o.c.main, head: 0.29, hand: BONE,
      face: skullFace, weapon: (c) => W.club(c, 0.34) });
  },
  bomber(ctx, o) {
    const hold = !(o.atk >= 0 && o.atk < 0.3);
    hum(ctx, o, { size: 0.82, skin: BONE, torso: '#dcdad0', legs: BONE, belt: o.c.main, head: 0.29, hand: BONE, face: skullFace,
      hat: (c, oo, hy, hr) => { c.fillStyle = o.c.main; c.fillRect(-hr, hy - hr * 0.5, hr * 2, 0.08); },
      wAng: -1.9, weapon: (c) => {
        if (!hold) return;
        ell(c, 0.18, 0, 0.16, 0.16, '#2a2a33', 0.04);
        seg(c, 0.25, -0.12, 0.33, -0.22, 0.03, '#c8a060');
        c.fillStyle = '#ffcf40';
        circle(c, 0.34, -0.24, 0.04 + Math.random() * 0.02);
        c.fill();
      } });
  },
  barbarian(ctx, o) {
    hum(ctx, o, { skin: SKIN, torso: '#b07a44', torso2: o.c.main, legs: '#6b4a2a', beard: '#ffd35a',
      hat: (c, oo, hy, hr) => {
        helmet('#8e979f')(c, oo, hy, hr);
        poly(c, [-hr, hy - 0.05, -hr - 0.2, hy - 0.35, -hr + 0.08, hy - 0.15], '#f5eedb', 0.035);
        poly(c, [hr, hy - 0.05, hr + 0.2, hy - 0.35, hr - 0.08, hy - 0.15], '#f5eedb', 0.035);
      },
      face: eyesAngry, weapon: (c) => W.sword(c, 0.5) });
  },
  imp(ctx, o) {
    const flap = Math.sin(o.t * 18 + o.id) * 0.5;
    ctx.save();
    ctx.scale(o.dir, 1);
    const y = -0.45;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 0.14, y - 0.05);
      ctx.rotate(s * (0.4 + flap));
      poly(ctx, [0, 0, s * 0.42, -0.2, s * 0.36, 0.02, s * 0.44, 0.12, 0, 0.1], '#5b3f7a', 0.035);
      ctx.restore();
    }
    ell(ctx, 0, y, 0.24, 0.22, '#7a55a8', 0.045);
    poly(ctx, [-0.14, y - 0.16, -0.2, y - 0.36, -0.04, y - 0.2], o.c.main, 0.03);
    poly(ctx, [0.14, y - 0.16, 0.2, y - 0.36, 0.04, y - 0.2], o.c.main, 0.03);
    if (!o.back) {
      ell(ctx, 0.04, y - 0.02, 0.06, 0.07, '#fff', 0.02);
      ell(ctx, 0.15, y - 0.02, 0.06, 0.07, '#fff', 0.02);
      ctx.fillStyle = OUT;
      circle(ctx, 0.06, y - 0.01, 0.03);
      ctx.fill();
      circle(ctx, 0.17, y - 0.01, 0.03);
      ctx.fill();
    }
    ctx.restore();
  },
  sprite(ctx, o) {
    const hop = o.moving ? Math.abs(Math.sin(o.walk * TAU * 2)) * 0.15 : 0;
    ctx.save();
    ctx.scale(o.dir, 1);
    ctx.translate(0, -hop);
    ctx.fillStyle = 'rgba(160,230,255,0.35)';
    circle(ctx, 0, -0.3, 0.36);
    ctx.fill();
    ell(ctx, 0, -0.28, 0.24, 0.24, '#bfeeff', 0.045);
    poly(ctx, [-0.18, -0.44, -0.1, -0.7, -0.02, -0.46, 0.06, -0.74, 0.12, -0.46, 0.22, -0.64, 0.2, -0.38], '#e8fbff', 0.035);
    ctx.fillStyle = o.c.main;
    ctx.fillRect(-0.2, -0.16, 0.4, 0.05);
    if (!o.back) {
      ctx.fillStyle = OUT;
      circle(ctx, 0.04, -0.3, 0.035);
      ctx.fill();
      circle(ctx, 0.14, -0.3, 0.035);
      ctx.fill();
    }
    ctx.restore();
  },
  giant(ctx, o) {
    hum(ctx, o, { size: 1.8, skin: SKIN, torso: o.c.main, torso2: o.c.light, legs: '#6a5040', belly: true, beard: '#d8782a', head: 0.26,
      hat: (c, oo, hy, hr) => { if (oo.back) ell(c, 0, hy - 0.02, hr * 0.9, hr * 0.8, '#e8b890', 0.03); },
      face: eyesAngry, wAng: swingAngle(o.atk, -0.3), weapon: (c) => ell(c, 0.08, 0, 0.13, 0.12, SKIN, 0.04) });
  },
  musketeer(ctx, o) {
    hum(ctx, o, { skin: SKIN, torso: o.c.main, torso2: o.c.dark, legs: '#3a3040',
      hat: (c, oo, hy, hr) => {
        ell(c, 0, hy - hr * 0.35, hr + 0.12, 0.07, '#9aa4ae', 0.04);
        ctx.beginPath();
        ctx.arc(0, hy - hr * 0.35, hr * 0.8, Math.PI, 0);
        ctx.closePath();
        fillStroke(c, '#aab4be', 0.04);
      },
      weapon: musketWeapon, wAng: -0.3 });
  },
  maiden(ctx, o) {
    hum(ctx, o, { skin: SKIN, torso: STEEL, torso2: o.c.main, legs: '#5a4030',
      hat: (c, oo, hy, hr) => {
        ctx.beginPath();
        ctx.arc(0, hy - 0.02, hr + 0.04, Math.PI * 0.95, Math.PI * 2.05);
        fillStroke(c, '#ff8a2a', 0.04);
        rrect(c, -hr - 0.08, hy - 0.02, 0.1, 0.4, 0.05, '#ff8a2a', 0.035);
        rrect(c, hr - 0.02, hy - 0.02, 0.1, 0.4, 0.05, '#ff8a2a', 0.035);
      },
      wAng: o.atk >= 0 && o.atk < 0.35 ? lerp(-3.2, 2.9, o.atk / 0.35) : -1.2, weapon: (c) => W.axe(c, 0.5, true) });
  },
  boar(ctx, o) {
    ctx.save();
    ctx.scale(o.dir, 1);
    const g = o.moving ? Math.sin(o.walk * TAU * 1.5) * 0.06 : 0;
    const lift = o.jump || 0;
    ctx.translate(0, -lift);
    // boar
    for (const lx of [-0.32, -0.14, 0.14, 0.3]) rrect(ctx, lx - 0.05, -0.28 + (lx > 0 ? g : -g), 0.1, 0.28, 0.04, '#5a3a20', 0.035);
    ell(ctx, 0, -0.42, 0.46, 0.26, '#8a5a34', 0.05);
    ell(ctx, 0.38, -0.44, 0.2, 0.17, '#9a6a40', 0.045);
    ell(ctx, 0.54, -0.42, 0.07, 0.06, '#d08a8a', 0.03);
    poly(ctx, [0.46, -0.36, 0.56, -0.22, 0.42, -0.32], '#fff5dd', 0.025);
    ctx.fillStyle = OUT;
    circle(ctx, 0.42, -0.5, 0.03);
    ctx.fill();
    rrect(ctx, -0.22, -0.62, 0.36, 0.1, 0.04, o.c.main, 0.035);
    // rider
    ctx.translate(-0.02, -0.52);
    hum(ctx, { dir: 1, walk: 0, moving: false, t: o.t, atk: o.atk, back: o.back, c: o.c }, {
      size: 0.72, skin: SKIN, torso: o.c.main, torso2: o.c.dark, noLegs: true, beard: '#6a3a1a',
      hat: (c, oo, hy, hr) => { ctx.beginPath(); ctx.arc(0, hy, hr + 0.02, Math.PI, 0); fillStroke(c, '#3a2a1a', 0.04); },
      weapon: (c) => W.hammer(c, 0.42) });
    ctx.restore();
  },
  berserker(ctx, o) {
    hum(ctx, o, { skin: '#e8b48a', torso: '#6a4a3a', torso2: o.c.main, legs: '#3a2a20',
      hat: (c, oo, hy, hr) => { c.fillStyle = o.c.main; c.fillRect(-hr * 0.8, hy - 0.05, hr * 1.6, 0.05); },
      face: eyesAngry, off: (c) => { c.save(); c.translate(-0.25, -0.42); c.rotate(-1.8 + (o.atk > 0.7 ? 0.5 : 0)); W.axe(c, 0.34); c.restore(); },
      weapon: (c) => W.axe(c, 0.38) });
  },
  firemage(ctx, o) {
    hum(ctx, o, { skin: SKIN, torso: o.c.main, torso2: o.c.dark, legs: o.c.dark, beard: '#eee',
      hat: (c, oo, hy, hr) => {
        ell(c, 0, hy - hr * 0.45, hr + 0.14, 0.08, o.c.dark, 0.04);
        poly(c, [-hr * 0.8, hy - hr * 0.5, 0.05, hy - hr - 0.55, hr * 0.8, hy - hr * 0.5], o.c.main, 0.04);
      },
      wAng: o.atk > 0.6 ? -1.8 : -0.9,
      weapon: (c) => {
        const gl = 0.12 + Math.sin(o.t * 12) * 0.02;
        c.fillStyle = 'rgba(255,150,40,0.45)';
        circle(c, 0.1, 0, gl + 0.08);
        c.fill();
        ell(c, 0.1, 0, gl, gl, '#ffb028', 0.03);
      } });
  },
  drakeling(ctx, o) {
    const flap = Math.sin(o.t * 10 + o.id) * 0.45;
    ctx.save();
    ctx.scale(o.dir * 1.15, 1.15);
    const y = -0.5;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 0.1, y - 0.12);
      ctx.rotate(s * (0.3 + flap));
      poly(ctx, [0, 0, s * 0.5, -0.3, s * 0.46, -0.02, s * 0.56, 0.1, 0, 0.12], '#4fae4f', 0.035);
      ctx.restore();
    }
    poly(ctx, [-0.2, y + 0.05, -0.5, y + 0.2, -0.25, y + 0.14], '#3f9a3f', 0.035);
    ell(ctx, 0, y, 0.26, 0.22, '#5cc25c', 0.045);
    ell(ctx, 0.02, y + 0.06, 0.16, 0.12, '#f2e3a0', 0.03);
    ell(ctx, 0.22, y - 0.2, 0.18, 0.15, '#5cc25c', 0.045);
    poly(ctx, [0.14, y - 0.32, 0.12, y - 0.46, 0.22, y - 0.34], o.c.main, 0.03);
    poly(ctx, [0.26, y - 0.33, 0.3, y - 0.47, 0.34, y - 0.31], o.c.main, 0.03);
    if (!o.back) {
      ctx.fillStyle = OUT;
      circle(ctx, 0.28, y - 0.22, 0.03);
      ctx.fill();
    }
    ctx.restore();
  },
  lancer(ctx, o) {
    ctx.save();
    ctx.scale(o.dir, 1);
    const g = o.moving ? Math.sin(o.walk * TAU * 1.6) * 0.07 : 0;
    for (const lx of [-0.34, -0.18, 0.18, 0.34]) rrect(ctx, lx - 0.05, -0.34 + (lx > 0 ? g : -g), 0.1, 0.34, 0.04, '#e8e2d6', 0.035);
    ell(ctx, 0, -0.5, 0.48, 0.24, '#f4efe4', 0.05);
    rrect(ctx, 0.3, -0.86, 0.2, 0.38, 0.08, '#f4efe4', 0.045);
    ell(ctx, 0.46, -0.84, 0.16, 0.1, '#f4efe4', 0.045);
    rrect(ctx, 0.28, -0.9, 0.08, 0.3, 0.04, '#6a4a2a', 0.03);
    rrect(ctx, -0.36, -0.6, 0.6, 0.22, 0.06, o.c.main, 0.04);
    ctx.fillStyle = GOLDC;
    ctx.fillRect(-0.34, -0.44, 0.56, 0.04);
    ctx.translate(-0.05, -0.62);
    hum(ctx, { dir: 1, walk: 0, moving: false, t: o.t, atk: -1, back: o.back, c: o.c }, {
      size: 0.75, skin: SKIN, torso: STEEL, torso2: o.c.main, noLegs: true, hat: helmet('#aab4be', o.c.main),
      wAng: o.atk >= 0 && o.atk < 0.2 ? 0.1 : o.charging ? -0.05 : -0.45, weapon: (c) => {
        seg(c, -0.2, 0, 0.9, 0, 0.07, '#d9c28a');
        poly(c, [0.9, -0.07, 1.15, 0, 0.9, 0.07], STEEL, 0.03);
      } });
    ctx.restore();
  },
  balloon(ctx, o) {
    const sway = Math.sin(o.t * 2 + o.id) * 0.04;
    ctx.save();
    ctx.translate(sway, 0);
    seg(ctx, -0.18, -0.35, -0.3, -0.75, 0.025, '#6a4a2a');
    seg(ctx, 0.18, -0.35, 0.3, -0.75, 0.025, '#6a4a2a');
    rrect(ctx, -0.22, -0.4, 0.44, 0.26, 0.05, '#9a6a3a', 0.04);
    ell(ctx, 0.02, -0.5, 0.1, 0.1, BONE, 0.03);
    ell(ctx, 0, -1.12, 0.5, 0.48, o.c.main, 0.05);
    ctx.save();
    ellipse(ctx, 0, -1.12, 0.5, 0.48);
    ctx.clip();
    ctx.fillStyle = o.c.light;
    for (let i = -2; i <= 2; i++) ctx.fillRect(i * 0.2 - 0.04, -1.7, 0.08, 1.2);
    ctx.restore();
    ellipse(ctx, 0, -1.12, 0.5, 0.48);
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    if (!(o.atk >= 0 && o.atk < 0.2)) ell(ctx, 0, -0.08, 0.13, 0.13, '#2a2a33', 0.035);
    ctx.restore();
  },
  necro(ctx, o) {
    hum(ctx, o, { skin: '#d8d0e8', torso: '#4a2f6a', torso2: o.c.main, legs: '#3a2350', belt: o.c.main,
      hat: hood('#3a2350'), face: glowEyes('#b56cff'),
      wAng: o.atk > 0.6 ? -1.9 : -1.2, weapon: (c) => { W.staff(c, 0.5, BONE, '#b56cff'); } });
  },
  juggernaut(ctx, o) {
    hum(ctx, o, { size: 1.55, skin: '#3a3f4a', torso: '#4a5060', torso2: o.c.main, legs: '#2e323c', hand: '#4a5060', head: 0.28,
      hat: (c, oo, hy, hr) => {
        poly(c, [-hr, hy, -hr - 0.16, hy - hr - 0.2, -hr * 0.4, hy - hr * 0.7], '#2e323c', 0.035);
        poly(c, [hr, hy, hr + 0.16, hy - hr - 0.2, hr * 0.4, hy - hr * 0.7], '#2e323c', 0.035);
      },
      face: glowEyes('#b388ff'), weapon: (c) => W.sword(c, 0.62, '#9fb0c4') });
  },
  golem(ctx, o) { golemArt(ctx, o, 1.6); },
  golemite(ctx, o) { golemArt(ctx, o, 0.95); },
  stormmage(ctx, o) {
    const crackle = (c) => {
      c.strokeStyle = '#bff4ff';
      c.lineWidth = 0.035;
      c.beginPath();
      c.moveTo(0, 0);
      for (let i = 1; i <= 4; i++) c.lineTo(i * 0.07, (Math.random() - 0.5) * 0.16);
      c.stroke();
    };
    hum(ctx, o, { skin: SKIN, torso: '#e6eef8', torso2: o.c.main, legs: '#5a6a8a',
      hat: (c, oo, hy, hr) => {
        poly(c, [-hr, hy - 0.05, -hr * 0.6, hy - hr - 0.2, -0.05, hy - hr, 0.1, hy - hr - 0.28, hr * 0.5, hy - hr - 0.02, hr + 0.1, hy - hr * 0.6, hr, hy - 0.05], '#dfe8f5', 0.04);
      },
      face: glowEyes('#6fe8ff'), wAng: o.atk > 0.6 || o.atk < 0.15 && o.atk >= 0 ? -0.2 : -0.8,
      weapon: (c) => { c.fillStyle = 'rgba(120,230,255,0.5)'; circle(c, 0.05, 0, 0.14); c.fill(); crackle(c); } });
  },
  tunneler(ctx, o) {
    hum(ctx, o, { skin: SKIN, torso: '#8a6a40', torso2: o.c.main, legs: '#4a3a2a', beard: '#8a8a8a',
      hat: (c, oo, hy, hr) => {
        ctx.beginPath();
        ctx.arc(0, hy - 0.02, hr + 0.04, Math.PI, 0);
        ctx.closePath();
        fillStroke(c, '#e0b020', 0.04);
        ell(c, 0.02, hy - hr * 0.6, 0.07, 0.06, '#fff8c0', 0.03);
      },
      weapon: (c) => W.pick(c, 0.45) });
  },
  frostmage(ctx, o) {
    hum(ctx, o, { skin: '#dff3ff', torso: '#e8f7ff', torso2: o.c.main, legs: '#9fc8e8', belt: o.c.main,
      hat: hood('#a8dcf8'), face: glowEyes('#3ab8ff'),
      wAng: o.atk > 0.6 ? -1.8 : -1.1, weapon: (c) => W.staff(c, 0.45, '#9ff0ff', '#9ff0ff') });
  },
  // ---- buildings ----
  cannon(ctx, o) {
    rrect(ctx, -0.7, -0.5, 1.4, 0.6, 0.12, '#8a6038', 0.05);
    ctx.fillStyle = o.c.main;
    ctx.fillRect(-0.66, -0.22, 1.32, 0.1);
    ell(ctx, 0, -0.55, 0.42, 0.3, '#6a4a2a', 0.05);
    ctx.save();
    ctx.translate(0, -0.62);
    const a = Math.atan2(o.aimY, o.aimX);
    ctx.rotate(a);
    const kick = o.atk >= 0 && o.atk < 0.15 ? -0.12 : 0;
    rrect(ctx, -0.2 + kick, -0.17, 0.82, 0.34, 0.12, '#3a3a44', 0.05);
    ell(ctx, 0.6 + kick, 0, 0.08, 0.18, '#22222a', 0.04);
    ctx.restore();
  },
  inferno(ctx, o) {
    rrect(ctx, -0.6, -0.4, 1.2, 0.5, 0.1, '#6a6070', 0.05);
    poly(ctx, [-0.5, -0.35, -0.3, -1.7, 0.3, -1.7, 0.5, -0.35], '#7a7080', 0.05);
    ctx.fillStyle = o.c.main;
    ctx.fillRect(-0.36, -0.9, 0.72, 0.1);
    const g = 0.2 + (o.attacking ? 0.06 + Math.sin(o.t * 20) * 0.03 : 0);
    ctx.fillStyle = 'rgba(255,90,30,0.45)';
    circle(ctx, 0, -1.85, g + 0.14);
    ctx.fill();
    ell(ctx, 0, -1.85, g, g, '#ff7a2a', 0.04);
    ell(ctx, 0, -1.85, g * 0.5, g * 0.5, '#ffe08a', 0.02);
  },
  tombstone(ctx, o) {
    ell(ctx, 0, -0.1, 0.75, 0.3, '#6a5a44', 0.05);
    rrect(ctx, -0.45, -1.3, 0.9, 1.2, 0.4, '#9aa0a8', 0.05);
    ctx.fillStyle = '#6a7078';
    ctx.fillRect(-0.06, -1.1, 0.12, 0.6);
    ctx.fillRect(-0.24, -0.92, 0.48, 0.12);
    ctx.fillStyle = o.c.main;
    ctx.fillRect(-0.4, -0.3, 0.8, 0.08);
  },
  pump(ctx, o) {
    rrect(ctx, -0.7, -0.4, 1.4, 0.5, 0.1, '#6a5040', 0.05);
    rrect(ctx, -0.45, -1.5, 0.9, 1.15, 0.3, 'rgba(230,220,255,0.55)', 0.05);
    const lvl = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(o.t * 1.5));
    ctx.save();
    roundRect(ctx, -0.42, -1.47, 0.84, 1.1, 0.28);
    ctx.clip();
    ctx.fillStyle = '#d23cf0';
    ctx.fillRect(-0.5, -0.37 - lvl * 1.0, 1, 1.2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-0.3, -1.4, 0.1, 1);
    ctx.restore();
    ctx.fillStyle = o.c.main;
    ctx.fillRect(-0.47, -0.95, 0.94, 0.1);
    rrect(ctx, 0.4, -1.1, 0.35, 0.12, 0.04, '#8a8f96', 0.035);
  },
};

function golemArt(ctx, o, k) {
  ctx.save();
  ctx.scale(o.dir * k, k);
  const mv = o.moving;
  const l = mv ? Math.sin(o.walk * TAU) * 0.06 : 0;
  ell(ctx, -0.22 + l, -0.14, 0.16, 0.14, '#8a7a6a', 0.045);
  ell(ctx, 0.22 - l, -0.14, 0.16, 0.14, '#8a7a6a', 0.045);
  const sw = swingAngle(o.atk, -0.4);
  ell(ctx, -0.42, -0.5, 0.16, 0.2, '#9a8a78', 0.045);
  ell(ctx, 0, -0.55, 0.4, 0.36, '#a89886', 0.05);
  ell(ctx, -0.1, -0.62, 0.12, 0.08, '#8a7a6a', 0.02);
  ell(ctx, 0.14, -0.44, 0.1, 0.07, '#8a7a6a', 0.02);
  ell(ctx, 0, -0.98, 0.24, 0.2, '#b0a08e', 0.045);
  poly(ctx, [-0.06, -1.14, 0.02, -1.36, 0.1, -1.14], o.c.main, 0.03);
  if (!o.back) {
    ctx.fillStyle = '#ffe28a';
    ctx.fillRect(0.02, -1.02, 0.07, 0.04);
    ctx.fillRect(0.14, -1.02, 0.07, 0.04);
  }
  ctx.save();
  ctx.translate(0.36, -0.58);
  ctx.rotate(sw * 0.5);
  ell(ctx, 0.08, 0.08, 0.17, 0.2, '#9a8a78', 0.045);
  ctx.restore();
  ctx.restore();
}

// Unit draw sizes (for shadows, hp bar placement and card art framing).
const UNIT_H = {
  knight: 1.2, archer: 1.15, goblin: 1.0, speargob: 1.0, skeleton: 0.95, bomber: 1.0, barbarian: 1.25, imp: 0.8, sprite: 0.8,
  giant: 2.1, musketeer: 1.2, maiden: 1.2, boar: 1.45, berserker: 1.2, firemage: 1.5, drakeling: 1.0, lancer: 1.7, balloon: 1.6,
  necro: 1.2, juggernaut: 1.9, golem: 2.2, golemite: 1.3, stormmage: 1.3, tunneler: 1.2, frostmage: 1.2,
  cannon: 1.1, inferno: 2.1, tombstone: 1.4, pump: 1.6,
};
const AIR_H = 1.1;

// ---- towers ----
function drawTower(ctx, e, o) {
  const k = e.tt === 'king';
  const hw = k ? 1.9 : 1.45;
  const c = o.c;
  if (e.dead || o.destroyed) {
    ell(ctx, 0, 0, hw, hw * 0.55, '#7a7066', 0.05);
    ell(ctx, -0.5, -0.2, 0.5, 0.3, '#8e857a', 0.04);
    ell(ctx, 0.5, -0.1, 0.45, 0.28, '#948b80', 0.04);
    ell(ctx, 0.1, -0.35, 0.4, 0.25, '#a0978a', 0.04);
    return;
  }
  const H = k ? 1.9 : 1.6;
  const top = -H - hw * 0.5;
  // walls (front face) and top platform
  rrect(ctx, -hw, top + hw * 0.5, hw * 2, H + hw * 0.5, 0.18, '#a39a8e', 0.06);
  ctx.save();
  roundRect(ctx, -hw + 0.06, top + hw * 0.5, hw * 2 - 0.12, H + hw * 0.5 - 0.06, 0.16);
  ctx.clip();
  ctx.fillStyle = '#8f867a';
  for (let r = 0; r < 4; r++) {
    for (let i = -1; i < 5; i++) ctx.fillRect(-hw + i * hw * 0.5 + (r % 2) * hw * 0.25, top + hw * 0.6 + r * H * 0.27 + 0.18, hw * 0.44, 0.07);
  }
  ctx.restore();
  rrect(ctx, -hw - 0.08, top - hw * 0.25, hw * 2 + 0.16, hw * 0.9, 0.2, '#b8afa2', 0.06);
  rrect(ctx, -hw + 0.18, top - hw * 0.12, hw * 2 - 0.36, hw * 0.62, 0.14, '#cfc6b8', 0.04);
  // team banner
  rrect(ctx, -0.35, top + hw * 0.75, 0.7, H * 0.55, 0.08, c.main, 0.045);
  poly(ctx, [-0.35, top + hw * 0.75 + H * 0.5, 0, top + hw * 0.75 + H * 0.66, 0.35, top + hw * 0.75 + H * 0.5], c.main, 0.045);
  ctx.fillStyle = GOLDC;
  if (k) {
    poly(ctx, [-0.2, top + hw * 0.95, -0.2, top + hw * 0.75 + 0.1, -0.1, top + hw * 0.85, 0, top + hw * 0.7 + 0.05, 0.1, top + hw * 0.85, 0.2, top + hw * 0.75 + 0.1, 0.2, top + hw * 0.95], GOLDC, 0.03);
  } else {
    circle(ctx, 0, top + hw * 0.95, 0.12);
    ctx.fill();
  }
  // crenellations
  for (let i = 0; i < 4; i++) rrect(ctx, -hw + 0.02 + i * (hw * 2 - 0.3) / 3, top - hw * 0.42, 0.3, 0.26, 0.05, '#b8afa2', 0.04);
  // occupant
  ctx.save();
  ctx.translate(0, top + hw * 0.2);
  const dir = o.aimX < -0.1 ? -1 : 1;
  const back = o.aimY < -0.2;
  if (k) {
    // cannon
    ctx.save();
    ctx.translate(0.55 * dir, 0.05);
    const a = Math.atan2(o.aimY * 0.6 - 0.4, o.aimX);
    ctx.rotate(o.active ? a : dir > 0 ? -0.5 : Math.PI + 0.5);
    rrect(ctx, -0.1, -0.13, 0.6, 0.26, 0.1, '#3a3a44', 0.045);
    ctx.restore();
    const sleeping = !o.active;
    hum(ctx, { dir: -dir, walk: 0, moving: false, t: o.t, atk: -1, back: false, c }, {
      size: 0.95, skin: SKIN, torso: c.main, torso2: c.light, noLegs: true, beard: '#f2f2f2', head: 0.3,
      face: sleeping ? (cc, oo, hy) => { seg(cc, 0.02, hy, 0.1, hy, 0.03, OUT); seg(cc, 0.14, hy, 0.22, hy, 0.03, OUT); } : eyesAngry,
      hat: (cc, oo, hy, hr) => poly(cc, [-hr, hy - hr * 0.5, -hr, hy - hr - 0.2, -hr * 0.5, hy - hr - 0.02, 0, hy - hr - 0.26, hr * 0.5, hy - hr - 0.02, hr, hy - hr - 0.2, hr, hy - hr * 0.5], GOLDC, 0.04),
      wAng: 0.6, weapon: null });
    if (sleeping) outlineText(ctx, 'z', 0.5, -1.2 - (o.t % 2) * 0.25, 0.34, '#fff');
  } else {
    hum(ctx, { dir, walk: 0, moving: false, t: o.t, atk: o.atk, back, c }, {
      size: 0.95, skin: SKIN, torso: c.main, torso2: c.light, noLegs: true, head: 0.3,
      hat: (cc, oo, hy, hr) => {
        ctx.beginPath();
        ctx.arc(0, hy - 0.02, hr + 0.04, Math.PI * 0.95, Math.PI * 2.05);
        fillStroke(cc, '#ff78b0', 0.04);
        poly(cc, [-0.12, hy - hr - 0.02, -0.12, hy - hr - 0.16, -0.04, hy - hr - 0.08, 0.04, hy - hr - 0.18, 0.12, hy - hr - 0.08, 0.2, hy - hr - 0.16, 0.2, hy - hr - 0.02], GOLDC, 0.03);
      },
      weapon: bowWeapon, wAng: -0.2 });
  }
  ctx.restore();
}

// ---- projectiles ----
function drawProjectile(ctx, p, o) {
  const a = Math.atan2(o.vy, o.vx);
  switch (p.pt) {
    case 'arrow':
    case 'spear':
      ctx.save();
      ctx.rotate(a);
      seg(ctx, -0.35, 0, 0.25, 0, 0.05, p.pt === 'spear' ? '#a0703a' : '#d8c8a0');
      poly(ctx, [0.25, -0.07, 0.4, 0, 0.25, 0.07], STEEL, 0.03);
      ctx.restore();
      break;
    case 'bullet':
      ell(ctx, 0, 0, 0.09, 0.09, '#333', 0.02);
      break;
    case 'cannonball':
      ell(ctx, 0, 0, 0.16, 0.16, '#2a2a33', 0.04);
      break;
    case 'bomb':
      ell(ctx, 0, 0, 0.16, 0.16, '#2a2a33', 0.04);
      ctx.fillStyle = '#ffcf40';
      circle(ctx, 0.1, -0.14, 0.05);
      ctx.fill();
      break;
    case 'spit':
      ell(ctx, 0, 0, 0.1, 0.1, '#b388ff', 0.03);
      break;
    case 'orb':
      ctx.fillStyle = 'rgba(180,100,255,0.4)';
      circle(ctx, 0, 0, 0.22);
      ctx.fill();
      ell(ctx, 0, 0, 0.12, 0.12, '#c78cff', 0.03);
      break;
    case 'ice':
      ctx.fillStyle = 'rgba(160,240,255,0.45)';
      circle(ctx, 0, 0, 0.22);
      ctx.fill();
      ell(ctx, 0, 0, 0.12, 0.12, '#dffaff', 0.03);
      break;
    case 'flame':
    case 'fireorb':
    case 'fireball': {
      const r = p.pt === 'fireball' ? 0.45 : p.pt === 'fireorb' ? 0.24 : 0.2;
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(255,120,30,0.35)';
      ellipse(ctx, -r * 0.8, 0, r * 1.8, r * 0.9);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ff7a1a';
      circle(ctx, 0, 0, r);
      ctx.fill();
      ctx.fillStyle = '#ffe07a';
      circle(ctx, 0, 0, r * 0.55);
      ctx.fill();
      break;
    }
    case 'log': {
      ctx.save();
      const roll = o.t * 14;
      rrect(ctx, -1.9, -0.45, 3.8, 0.6, 0.28, '#8a5a2b', 0.06);
      ctx.fillStyle = '#6a4220';
      for (let i = 0; i < 6; i++) {
        const x = -1.7 + i * 0.7 + (roll % 0.7);
        if (x < 1.7) ctx.fillRect(x, -0.42, 0.08, 0.54);
      }
      ell(ctx, -1.85, -0.15, 0.12, 0.28, '#c89a5a', 0.04);
      ell(ctx, 1.85, -0.15, 0.12, 0.28, '#c89a5a', 0.04);
      ctx.restore();
      break;
    }
    default:
      ell(ctx, 0, 0, 0.1, 0.1, '#fff', 0.02);
  }
}

// ---- arena background ----
function paintArena(theme, T, flipped) {
  const pad = 1.2;
  const cw = (AW + pad * 2) * T, ch = (AH + pad * 2) * T;
  const cv = makeCanvas(cw, ch);
  const ctx = cv.getContext('2d');
  ctx.translate(pad * T, pad * T);
  ctx.scale(T, T);
  const rng = new RNG(hashStr(theme.name));
  // surroundings
  ctx.fillStyle = theme.edge;
  ctx.fillRect(-pad, -pad, AW + pad * 2, AH + pad * 2);
  for (let i = 0; i < 90; i++) {
    const x = rng.range(-pad, AW + pad), y = rng.range(-pad, AH + pad);
    ctx.fillStyle = rgba('#000000', rng.range(0.05, 0.14));
    circle(ctx, x, y, rng.range(0.2, 0.7));
    ctx.fill();
  }
  // grass checkerboard
  for (let y = 0; y < AH; y++) {
    for (let x = 0; x < AW; x++) {
      ctx.fillStyle = theme.grass[(x + y) & 1];
      ctx.fillRect(x, y, 1.02, 1.02);
    }
  }
  // soft light variation
  const grd = ctx.createRadialGradient(AW / 2, AH / 2, 2, AW / 2, AH / 2, 20);
  grd.addColorStop(0, 'rgba(255,255,255,0.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, AW, AH);
  // walking paths along the lanes
  ctx.fillStyle = rgba(theme.path, 0.35);
  for (const bx of BRIDGES) {
    roundRect(ctx, bx - 1.1, 4, 2.2, AH - 8, 1);
    ctx.fill();
  }
  roundRect(ctx, 3.5, 7.3, 11, 1.5, 0.7);
  ctx.fill();
  roundRect(ctx, 3.5, AH - 8.8, 11, 1.5, 0.7);
  ctx.fill();
  // tower pads
  for (const team of [0, 1]) {
    for (const s of TOWER_SLOTS) {
      const y = flipped ? AH - mirrorY(team, s.y) : mirrorY(team, s.y);
      ctx.fillStyle = rgba('#000000', 0.12);
      roundRect(ctx, s.x - s.half - 0.35, y - s.half - 0.35, s.half * 2 + 0.7, s.half * 2 + 0.7, 0.6);
      ctx.fill();
      ctx.fillStyle = rgba(theme.path, 0.8);
      roundRect(ctx, s.x - s.half - 0.2, y - s.half - 0.2, s.half * 2 + 0.4, s.half * 2 + 0.4, 0.5);
      ctx.fill();
    }
  }
  // river
  const water = ctx.createLinearGradient(0, RIVER_TOP, 0, RIVER_BOT);
  water.addColorStop(0, shade(theme.water, -0.25));
  water.addColorStop(0.5, theme.water);
  water.addColorStop(1, shade(theme.water, -0.25));
  ctx.fillStyle = water;
  ctx.fillRect(-pad, RIVER_TOP, AW + pad * 2, RIVER_BOT - RIVER_TOP);
  ctx.fillStyle = rgba('#000000', 0.18);
  ctx.fillRect(-pad, RIVER_TOP, AW + pad * 2, 0.12);
  ctx.fillRect(-pad, RIVER_BOT - 0.12, AW + pad * 2, 0.12);
  for (let i = 0; i < 40; i++) {
    const x = rng.range(-pad, AW + pad);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x, rng.range(RIVER_TOP + 0.3, RIVER_BOT - 0.4), rng.range(0.3, 0.9), 0.07);
  }
  // bridges
  for (const bx of BRIDGES) {
    const x0 = bx - BRIDGE_HALF;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x0 + 0.1, RIVER_TOP - 0.1, BRIDGE_HALF * 2, RIVER_BOT - RIVER_TOP + 0.4);
    ctx.fillStyle = '#b07a44';
    ctx.fillRect(x0, RIVER_TOP - 0.3, BRIDGE_HALF * 2, RIVER_BOT - RIVER_TOP + 0.6);
    ctx.fillStyle = '#8a5a2b';
    for (let y = RIVER_TOP - 0.3; y < RIVER_BOT + 0.3; y += 0.4) ctx.fillRect(x0, y, BRIDGE_HALF * 2, 0.06);
    ctx.fillStyle = '#6a4220';
    ctx.fillRect(x0 - 0.12, RIVER_TOP - 0.4, 0.18, RIVER_BOT - RIVER_TOP + 0.8);
    ctx.fillRect(x0 + BRIDGE_HALF * 2 - 0.06, RIVER_TOP - 0.4, 0.18, RIVER_BOT - RIVER_TOP + 0.8);
  }
  // border
  ctx.strokeStyle = rgba('#000000', 0.35);
  ctx.lineWidth = 0.12;
  ctx.strokeRect(0, 0, AW, AH);
  paintDeco(ctx, theme, rng, pad);
  return { canvas: cv, pad };
}

function paintDeco(ctx, theme, rng, pad) {
  const spots = [];
  for (let i = 0; i < 26; i++) {
    const left = rng.chance(0.5);
    spots.push([left ? rng.range(-pad + 0.3, -0.2) : rng.range(AW + 0.2, AW + pad - 0.3), rng.range(-0.5, AH + 0.5)]);
  }
  for (let i = 0; i < 8; i++) spots.push([rng.range(0, AW), rng.chance(0.5) ? rng.range(-pad + 0.2, -0.3) : rng.range(AH + 0.3, AH + pad - 0.2)]);
  for (const [x, y] of spots) {
    if (y > RIVER_TOP - 0.5 && y < RIVER_BOT + 0.5) continue;
    const s = rng.range(0.35, 0.6);
    switch (theme.deco) {
      case 'trees': case 'jungle': case 'royal':
        ell(ctx, x, y, s, s, theme.deco === 'jungle' ? '#1f6a33' : '#2f8a3a', 0.05);
        ell(ctx, x - s * 0.3, y - s * 0.3, s * 0.5, s * 0.5, theme.deco === 'jungle' ? '#2f8a4a' : '#4aa84f', 0.03);
        if (theme.deco === 'royal' && rng.chance(0.3)) ell(ctx, x + s * 0.3, y + s * 0.2, 0.12, 0.12, GOLDC, 0.03);
        break;
      case 'bones':
        ell(ctx, x, y, s * 0.6, s * 0.5, BONE, 0.04);
        ctx.fillStyle = OUT;
        circle(ctx, x - 0.08, y - 0.02, 0.06);
        ctx.fill();
        circle(ctx, x + 0.08, y - 0.02, 0.06);
        ctx.fill();
        break;
      case 'barrels':
        rrect(ctx, x - s * 0.4, y - s * 0.5, s * 0.8, s, 0.12, '#9a6a3a', 0.04);
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(x - s * 0.4, y - s * 0.1, s * 0.8, 0.06);
        break;
      case 'snow':
        ell(ctx, x, y, s, s * 0.8, '#f4fbff', 0.04);
        ell(ctx, x + s * 0.2, y + s * 0.1, s * 0.4, s * 0.3, '#dbeaf4', 0.02);
        break;
      case 'lava':
        ctx.fillStyle = '#ff6a1f';
        circle(ctx, x, y, s * 0.7);
        ctx.fill();
        ctx.fillStyle = '#ffd24a';
        circle(ctx, x, y, s * 0.3);
        ctx.fill();
        break;
      case 'storm':
        ell(ctx, x, y, s, s * 0.7, '#5a6a7a', 0.04);
        break;
    }
  }
}

// ---- card faces ----
const cardArtCache = new Map();
function cardArt(key, w, h, opts) {
  opts = opts || {};
  const ck = key + ':' + w + 'x' + h + (opts.plain ? 'p' : '');
  let cv = cardArtCache.get(ck);
  if (cv) return cv;
  cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  const c = CARDS[key];
  const rar = RARITY[c.rarity];
  const S = w / 100;
  ctx.scale(S, S);
  const H = h / S;
  // frame
  roundRect(ctx, 2, 2, 96, H - 4, 12);
  const fg = ctx.createLinearGradient(0, 0, 0, H);
  fg.addColorStop(0, shade(rar.color, 0.25));
  fg.addColorStop(1, rar.dark);
  ctx.fillStyle = fg;
  ctx.fill();
  // background
  roundRect(ctx, 8, 8, 84, H - 16, 8);
  const bg = ctx.createLinearGradient(0, 8, 0, H - 8);
  const cols = c.type === 'spell' ? ['#7a58c8', '#3a2a70'] : c.type === 'building' ? ['#c89a5a', '#6a4a2a'] : ['#6ab8f0', '#2a5a9a'];
  bg.addColorStop(0, cols[0]);
  bg.addColorStop(1, cols[1]);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.save();
  roundRect(ctx, 8, 8, 84, H - 16, 8);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(50, H * 0.2, 60, 30, 0, 0, TAU);
  ctx.fill();
  // subject
  const o = { c: TEAM_COLORS[0], dir: 1, back: false, walk: 0.1, moving: false, t: 0.3, atk: -1, id: 1, aimX: 1, aimY: 0.2, attacking: true, charging: false };
  if (c.type === 'spell') drawSpellIcon(ctx, c.spell, 50, H * 0.52);
  else {
    const u = c.unit;
    const uh = UNIT_H[u] || 1.2;
    const n = Math.min(c.count || 1, 3);
    const sc = Math.min(58, (H * 0.62) / (uh + (UNITS[u].air ? 0.3 : 0))) * (n > 1 ? 0.8 : 1);
    for (let i = n - 1; i >= 0; i--) {
      ctx.save();
      const ox = n === 1 ? 0 : (i - (n - 1) / 2) * 24;
      ctx.translate(50 + ox, H * 0.86 - (n > 1 && i === 1 ? 6 : 0) - (UNITS[u].air ? sc * 0.25 : 0));
      ctx.scale(sc, sc);
      UNIT_ART[u](ctx, Object.assign({}, o, { id: i + 1 }));
      ctx.restore();
    }
  }
  ctx.restore();
  if (!opts.plain) {
    // elixir cost drop
    ctx.save();
    ctx.translate(20, 20);
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.bezierCurveTo(10, -3, 13, 3, 13, 7);
    ctx.arc(0, 7, 13, 0, Math.PI);
    ctx.bezierCurveTo(-13, 3, -10, -3, 0, -15);
    const eg = ctx.createRadialGradient(-3, 2, 2, 0, 4, 15);
    eg.addColorStop(0, '#ff9cf2');
    eg.addColorStop(1, '#b01ad0');
    ctx.fillStyle = eg;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#3a0848';
    ctx.stroke();
    outlineText(ctx, String(c.cost), 0, 6, 17, '#fff');
    ctx.restore();
  }
  cardArtCache.set(ck, cv);
  return cv;
}

function drawSpellIcon(ctx, sp, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(30, 30);
  switch (sp) {
    case 'arrows':
      for (const [dx, dy] of [[-0.45, -0.1], [0, 0.15], [0.45, -0.1]]) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(1.2);
        seg(ctx, -0.6, 0, 0.35, 0, 0.09, '#e0d0a8');
        poly(ctx, [0.35, -0.13, 0.62, 0, 0.35, 0.13], STEEL, 0.05);
        poly(ctx, [-0.6, 0, -0.75, -0.14, -0.45, 0], '#e84a4a', 0.04);
        ctx.restore();
      }
      break;
    case 'fireball':
      ctx.fillStyle = 'rgba(255,120,30,0.45)';
      ellipse(ctx, -0.35, -0.35, 0.9, 0.55);
      ctx.fill();
      ell(ctx, 0.1, 0.1, 0.62, 0.62, '#ff7a1a', 0.07);
      ell(ctx, 0.2, 0.0, 0.36, 0.36, '#ffe07a', 0.03);
      break;
    case 'zap':
      poly(ctx, [0.1, -1.0, -0.45, 0.1, -0.05, 0.1, -0.25, 1.0, 0.5, -0.2, 0.08, -0.2, 0.35, -1.0], '#aef4ff', 0.08);
      break;
    case 'freeze':
      ctx.strokeStyle = '#e8fbff';
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 3);
        seg(ctx, -0.85, 0, 0.85, 0, 0.14, '#dff8ff');
        seg(ctx, 0.5, 0, 0.72, -0.2, 0.08, '#dff8ff');
        seg(ctx, 0.5, 0, 0.72, 0.2, 0.08, '#dff8ff');
        seg(ctx, -0.5, 0, -0.72, -0.2, 0.08, '#dff8ff');
        seg(ctx, -0.5, 0, -0.72, 0.2, 0.08, '#dff8ff');
        ctx.restore();
      }
      break;
    case 'poison':
      ell(ctx, 0, 0.15, 0.8, 0.55, '#7ad64a', 0.07);
      ell(ctx, -0.3, -0.2, 0.3, 0.3, '#9ae86a', 0.05);
      ell(ctx, 0.35, -0.25, 0.22, 0.22, '#9ae86a', 0.05);
      ctx.fillStyle = OUT;
      circle(ctx, -0.18, 0.15, 0.1);
      ctx.fill();
      circle(ctx, 0.18, 0.15, 0.1);
      ctx.fill();
      break;
    case 'log':
      ctx.rotate(-0.35);
      rrect(ctx, -0.95, -0.35, 1.9, 0.7, 0.34, '#8a5a2b', 0.07);
      ell(ctx, 0.95, 0, 0.18, 0.35, '#c89a5a', 0.05);
      for (let i = 0; i < 4; i++) poly(ctx, [-0.6 + i * 0.4, -0.35, -0.5 + i * 0.4, -0.58, -0.4 + i * 0.4, -0.35], STEEL, 0.03);
      break;
  }
  ctx.restore();
}
