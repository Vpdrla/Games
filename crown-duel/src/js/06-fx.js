// ---------- Visual effects (purely cosmetic, never part of the simulation) ----------
// Particles live in world tiles; `z` lifts them off the ground.
class FX {
  constructor() { this.parts = []; }

  add(p) {
    if (this.parts.length > 700) this.parts.shift();
    p.t = 0;
    if (p.z == null) p.z = 0;
    this.parts.push(p);
    return p;
  }

  update(dt) {
    for (const p of this.parts) {
      p.t += dt;
      if (p.vx) p.x += p.vx * dt;
      if (p.vy) p.y += p.vy * dt;
      if (p.vz != null) {
        p.z += p.vz * dt;
        p.vz -= (p.g == null ? 14 : p.g) * dt;
        if (p.z < 0) { p.z = 0; p.vz = -p.vz * 0.3; if (p.vx) p.vx *= 0.6; if (p.vy) p.vy *= 0.6; }
      }
    }
    let n = 0;
    for (const p of this.parts) if (p.t < p.life) this.parts[n++] = p;
    this.parts.length = n;
  }

  puff(x, y, n, col, size, z) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(0.3, 1.2);
      this.add({ k: 'puff', x, y, z: z || 0.1, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, life: rand(0.35, 0.7), r0: size * 0.4, r1: size * rand(0.8, 1.3), col: col || '#fff' });
    }
  }
  ring(x, y, r, col, life, w) { this.add({ k: 'ring', x, y, r, col, life: life || 0.35, w: w || 0.12 }); }
  flash(x, y, r, col, life) { this.add({ k: 'flash', x, y, r, col, life: life || 0.25 }); }
  sparks(x, y, n, col, z) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(2, 5);
      this.add({ k: 'spark', x, y, z: z || 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: rand(1, 4), g: 18, life: rand(0.15, 0.35), col: col || '#fff6c0' });
    }
  }
  debris(x, y, n, cols, spread) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(0.5, 3) * (spread || 1);
      this.add({ k: 'debris', x, y, z: rand(0.2, 1.2), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: rand(3, 8), g: 20, life: rand(0.6, 1.2), col: choice(cols), s: rand(0.1, 0.25), rot: rand(0, TAU) });
    }
  }
  bolt(x1, y1, z1, x2, y2, z2, col, life) { this.add({ k: 'bolt', x: x1, y: y1, z: z1, x2, y2, z2, col: col || '#bff4ff', life: life || 0.18 }); }
  text(x, y, str, col, size) { this.add({ k: 'text', x, y, z: 1.2, vz: 2.2, g: 1.5, str, col: col || '#fff', size: size || 0.7, life: 1.0 }); }
  arrows(x, y, r, delays) {
    for (const d of delays) {
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * r;
        this.add({ k: 'arrow', x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, life: d + 0.02, fall: 0.3, col: '#d8c8a0' });
      }
    }
  }
  shards(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(1, 3);
      this.add({ k: 'shard', x, y, z: 0.4, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: rand(2, 5), g: 16, life: rand(0.4, 0.7), rot: rand(0, TAU) });
    }
  }

  draw(ctx, v) {
    const T = v.T;
    for (const p of this.parts) {
      const q = v.toScreen(p.x, p.y);
      const sx = q[0], sy = q[1] - p.z * T;
      const f = p.t / p.life;
      switch (p.k) {
        case 'puff': {
          ctx.globalAlpha = (1 - f) * 0.8;
          ctx.fillStyle = p.col;
          circle(ctx, sx, sy, lerp(p.r0, p.r1, easeOut(f)) * T);
          ctx.fill();
          break;
        }
        case 'ring':
          ctx.globalAlpha = 1 - f;
          ctx.strokeStyle = p.col;
          ctx.lineWidth = p.w * T * (1 - f * 0.5);
          ellipse(ctx, sx, sy, lerp(0.2, p.r, easeOut(f)) * T, lerp(0.2, p.r, easeOut(f)) * T * 0.8);
          ctx.stroke();
          break;
        case 'flash':
          ctx.globalAlpha = (1 - f) * 0.7;
          ctx.fillStyle = p.col;
          ellipse(ctx, sx, sy, p.r * T, p.r * T * 0.8);
          ctx.fill();
          break;
        case 'spark':
          ctx.globalAlpha = 1 - f;
          ctx.strokeStyle = p.col;
          ctx.lineWidth = 0.08 * T;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - p.vx * 0.04 * T, sy - p.vy * 0.04 * T * (v.flip ? -1 : 1) + p.vz * 0.04 * T);
          ctx.stroke();
          break;
        case 'debris':
          ctx.globalAlpha = Math.min(1, (1 - f) * 3);
          ctx.fillStyle = p.col;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(p.rot + p.t * 8);
          ctx.fillRect(-p.s * T / 2, -p.s * T / 2, p.s * T, p.s * T);
          ctx.restore();
          break;
        case 'shard':
          ctx.globalAlpha = 1 - f;
          ctx.fillStyle = '#dffaff';
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(p.rot + p.t * 6);
          ctx.beginPath();
          ctx.moveTo(0, -0.18 * T);
          ctx.lineTo(0.07 * T, 0);
          ctx.lineTo(0, 0.18 * T);
          ctx.lineTo(-0.07 * T, 0);
          ctx.fill();
          ctx.restore();
          break;
        case 'bolt': {
          const q2 = v.toScreen(p.x2, p.y2);
          const ex = q2[0], ey = q2[1] - p.z2 * T;
          ctx.globalAlpha = 1 - f * 0.6;
          ctx.strokeStyle = p.col;
          ctx.lineWidth = 0.14 * T;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          const n = 6;
          for (let i = 1; i < n; i++) {
            const t = i / n;
            ctx.lineTo(lerp(sx, ex, t) + rand(-0.35, 0.35) * T, lerp(sy, ey, t) + rand(-0.35, 0.35) * T);
          }
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 0.05 * T;
          ctx.stroke();
          break;
        }
        case 'text':
          ctx.globalAlpha = Math.min(1, (1 - f) * 2);
          outlineText(ctx, p.str, sx, sy, p.size * T, p.col);
          break;
        case 'arrow': {
          if (p.life - p.t > p.fall) break;
          const h = ((p.life - p.t) / p.fall) * 7;
          ctx.globalAlpha = 1;
          ctx.strokeStyle = OUT;
          ctx.lineWidth = 0.1 * T;
          ctx.beginPath();
          ctx.moveTo(sx - 0.25 * T, sy - (h + 0.7) * T);
          ctx.lineTo(sx, sy - h * T);
          ctx.stroke();
          ctx.strokeStyle = p.col;
          ctx.lineWidth = 0.05 * T;
          ctx.stroke();
          break;
        }
        case 'dirt':
          ctx.globalAlpha = (1 - f) * 0.9;
          ctx.fillStyle = '#6a4a2a';
          ellipse(ctx, sx, sy, 0.35 * T, 0.22 * T);
          ctx.fill();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
