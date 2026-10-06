// ---------- Visual effects in world space (pooled particles, damage numbers, lightning) ----------
class FX {
  constructor() {
    this.p = [];
    this.free = [];
    this.texts = 0;
    this.low = false;
  }

  add(k, x, y, life) {
    if (this.p.length > (this.low ? 300 : 700)) return null;
    const o = this.free.pop() || {};
    o.k = k; o.x = x; o.y = y; o.t = 0; o.life = life;
    o.vx = 0; o.vy = 0; o.r = 4; o.r1 = 0; o.col = '#fff'; o.str = ''; o.size = 10; o.pts = null; o.g = 0; o.rot = 0; o.w = 2;
    this.p.push(o);
    return o;
  }

  clear() {
    for (const o of this.p) this.free.push(o);
    this.p.length = 0;
    this.texts = 0;
  }

  update(dt) {
    const ps = this.p;
    let n = 0;
    for (let i = 0; i < ps.length; i++) {
      const o = ps[i];
      o.t += dt;
      if (o.t >= o.life) {
        if (o.k === 'text') this.texts--;
        o.pts = null;
        this.free.push(o);
        continue;
      }
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.g) o.vy += o.g * dt;
      if (o.k === 'spark' || o.k === 'shard') { o.vx *= 1 - 3 * dt; o.vy *= 1 - 3 * dt; }
      ps[n++] = o;
    }
    ps.length = n;
  }

  sparks(x, y, n, col, spd) {
    if (this.low) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const o = this.add('spark', x, y, rand(0.2, 0.45));
      if (!o) return;
      const a = rand(0, TAU), s = rand(0.4, 1) * (spd || 160);
      o.vx = Math.cos(a) * s;
      o.vy = Math.sin(a) * s;
      o.col = col;
      o.r = rand(1.2, 2.4);
    }
  }

  puff(x, y, r, col, life) {
    const o = this.add('puff', x, y, life || 0.4);
    if (!o) return;
    o.r = r * 0.4;
    o.r1 = r;
    o.col = col;
  }

  ring(x, y, r, col, life, w) {
    const o = this.add('ring', x, y, life || 0.35);
    if (!o) return;
    o.r = r * 0.2;
    o.r1 = r;
    o.col = col;
    o.w = w || 3;
  }

  flash(x, y, r, col, life) {
    const o = this.add('flash', x, y, life || 0.25);
    if (!o) return;
    o.r = r;
    o.col = col;
  }

  shards(x, y, n, col) {
    if (this.low) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const o = this.add('shard', x, y, rand(0.35, 0.6));
      if (!o) return;
      const a = rand(0, TAU), s = rand(40, 140);
      o.vx = Math.cos(a) * s;
      o.vy = Math.sin(a) * s - 60;
      o.g = 260;
      o.col = col;
      o.r = rand(1.5, 3.5);
      o.rot = rand(0, TAU);
    }
  }

  text(x, y, str, col, size) {
    if (this.texts > (this.low ? 25 : 55)) return;
    const o = this.add('text', x + rand(-5, 5), y, 0.75);
    if (!o) return;
    this.texts++;
    o.vy = -38;
    o.str = str;
    o.col = col;
    o.size = size || 9;
  }

  zap(pts, col, w) {
    const o = this.add('zap', 0, 0, 0.22);
    if (!o) return;
    // jag each segment once so the bolt looks electric
    const out = [pts[0], pts[1]];
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1];
      const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
      for (let j = 1; j < 4; j++) {
        const u = j / 4, off = rand(-1, 1) * Math.min(14, l * 0.12);
        out.push(lerp(x0, x1, u) + (nx / l) * off, lerp(y0, y1, u) + (ny / l) * off);
      }
      out.push(x1, y1);
    }
    o.pts = out;
    o.col = col;
    o.w = w || 2.5;
  }

  draw(ctx) {
    for (const o of this.p) {
      const u = o.t / o.life;
      switch (o.k) {
        case 'spark':
          ctx.globalAlpha = 1 - u;
          ctx.fillStyle = o.col;
          ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
          break;
        case 'puff':
          ctx.globalAlpha = (1 - u) * 0.6;
          ctx.fillStyle = o.col;
          circle(ctx, o.x, o.y, lerp(o.r, o.r1, easeOut(u)));
          ctx.fill();
          break;
        case 'ring':
          ctx.globalAlpha = 1 - u;
          ctx.strokeStyle = o.col;
          ctx.lineWidth = o.w * (1 - u * 0.6);
          circle(ctx, o.x, o.y, lerp(o.r, o.r1, easeOut(u)));
          ctx.stroke();
          break;
        case 'flash': {
          ctx.globalAlpha = (1 - u) * 0.9;
          const gl = Glow.get(o.col, 32);
          const r = o.r * (0.7 + u * 0.5);
          ctx.drawImage(gl, o.x - r, o.y - r, r * 2, r * 2);
          break;
        }
        case 'shard':
          ctx.globalAlpha = 1 - u;
          ctx.fillStyle = o.col;
          ctx.save();
          ctx.translate(o.x, o.y);
          ctx.rotate(o.rot + o.t * 8);
          ctx.beginPath();
          ctx.moveTo(-o.r, -o.r * 0.6);
          ctx.lineTo(o.r, 0);
          ctx.lineTo(-o.r * 0.4, o.r);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        case 'zap': {
          ctx.globalAlpha = 1 - u;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(o.pts[0], o.pts[1]);
          for (let i = 2; i < o.pts.length; i += 2) ctx.lineTo(o.pts[i], o.pts[i + 1]);
          ctx.strokeStyle = rgba(o.col, 0.45);
          ctx.lineWidth = o.w * 3;
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = o.w;
          ctx.stroke();
          break;
        }
        case 'text':
          ctx.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
          outlineText(ctx, o.str, o.x, o.y, o.size * (u < 0.15 ? 1 + (0.15 - u) * 3 : 1), o.col);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
