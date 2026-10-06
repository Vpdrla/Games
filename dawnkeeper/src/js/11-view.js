// ---------- Run renderer: camera, world, effects, night overlay and HUD ----------
const VIEW_SHORT = 350; // world units across the shorter screen side
const SHOT_COLS = { arrow: '#f0e0b0', snowball: '#ffffff', fireball: '#ff8a2a', spread: '#ff6ad5' };
const KILL_COLS = { bat: '#8a5ab0', zombie: '#7ab868', skeleton: '#ece6d2', ghost: '#dcebff', slime: '#5ad06a', slimelet: '#8ae89a', archer: '#ece6d2', hound: '#c8483a', bloater: '#d878c8', knight: '#a8b4c8', necro: '#7a4aa8', wisp: '#7fd8ff', golem: '#a09888', wolf: '#e8f0f8', yeti: '#ffffff', imp: '#ff6a3a', crawler: '#ff9a3a', shade: '#a05aff', watcher: '#f2e8f6' };

class View {
  constructor(run) {
    this.run = run;
    this.fx = new FX();
    this.W = 360; this.H = 640; this.k = 1; this.dpr = 1; this.scale = 1;
    this.sa = { top: 0, bottom: 0 };
    this.shake = 0;
    this.hurtFlash = 0;
    this.whiteFlash = 0;
    this.banner = null;
    this.tile = null;
    this.tileFor = 0;
    this.sorted = [];
    this.t = 0;
    this.dmgNums = true;
    this.dawnGlow = 0;
    this.snow = [];
    for (let i = 0; i < 70; i++) this.snow.push({ x: Math.random(), y: Math.random(), s: rand(0.6, 1.4) });
  }

  layout(W, H, sa, dpr) {
    this.W = W;
    this.H = H;
    this.sa = sa || this.sa;
    this.dpr = dpr || this.dpr;
    this.scale = Math.min(W, H) / VIEW_SHORT;
    this.k = this.scale * this.dpr;
    this.run.setView(W / this.scale, H / this.scale);
    if (Math.abs(this.tileFor - this.k) > 0.001) {
      Sprites.clear();
      DropSprites.cache.clear();
      DecorSprites.cache.clear();
      this.tile = groundTile(this.run.stage, Math.round(256 * this.k));
      this.tileFor = this.k;
    }
  }

  say(text, sub, col, time) {
    this.banner = { text, sub: sub || '', col: col || '#fff', t: 0, life: time || 2.4 };
  }

  // Turn simulation events into effects.
  onEvent(ev) {
    const fx = this.fx, run = this.run, p = run.player;
    switch (ev[0]) {
      case 'dmg':
        if (this.dmgNums) fx.text(ev[1], ev[2], String(Math.round(ev[3])), ev[4] ? '#ffd84a' : '#ffffff', ev[4] ? 11 : 8.5);
        break;
      case 'kill': {
        const col = KILL_COLS[ev[3]] || '#fff';
        if (ev[4] === 2) {
          fx.flash(ev[1], ev[2], 140, '#fff3c0', 0.6);
          fx.ring(ev[1], ev[2], 160, '#ffd84a', 0.7, 6);
          fx.sparks(ev[1], ev[2], 40, '#ffd84a', 320);
          this.shake = Math.max(this.shake, 14);
        } else {
          fx.puff(ev[1], ev[2], (ev[5] || 10) * 1.3, col, 0.35);
          fx.sparks(ev[1], ev[2], ev[4] ? 14 : 4, col, ev[4] ? 220 : 120);
          if (ev[4]) { fx.ring(ev[1], ev[2], 60, '#ffd84a', 0.4, 4); this.shake = Math.max(this.shake, 5); }
        }
        break;
      }
      case 'hurt':
        this.hurtFlash = 0.35;
        this.shake = Math.max(this.shake, 4);
        fx.sparks(p.x, p.y, 5, '#ff5a5a', 120);
        break;
      case 'heal':
        if (ev[1] >= 3) fx.text(p.x, p.y - 22, '+' + Math.round(ev[1]), '#6fe07a', 10);
        break;
      case 'coin':
        fx.text(p.x, p.y - 22, '+' + ev[1], '#ffcc33', 9);
        break;
      case 'zap':
        fx.zap(ev[1], ev[2] ? '#e0fbff' : '#9fe8ff', ev[2] ? 3.5 : 2.5);
        fx.flash(ev[1][2], ev[1][3], 26, '#bff4ff', 0.2);
        break;
      case 'boom':
        fx.flash(ev[1], ev[2], ev[3] * 1.6, ev[4] || '#ffb040', 0.3);
        fx.ring(ev[1], ev[2], ev[3], ev[4] || '#ffb040', 0.3, 3);
        fx.sparks(ev[1], ev[2], 6, ev[4] || '#ffb040', 160);
        this.shake = Math.max(this.shake, 2);
        break;
      case 'spike':
        fx.ring(ev[1], ev[2], ev[3], '#ffd84a', 0.3, 4);
        fx.shards(ev[1], ev[2], 8, ev[4] ? '#fff3a8' : '#ffd84a');
        break;
      case 'slam':
        fx.ring(ev[1], ev[2], ev[3], '#ff6a4a', 0.45, 6);
        fx.puff(ev[1], ev[2], ev[3], 'rgba(160,120,100,0.6)', 0.5);
        this.shake = Math.max(this.shake, 10);
        break;
      case 'blink':
        fx.puff(ev[1], ev[2], 24, '#7a3ab8', 0.4);
        fx.puff(ev[3], ev[4], 24, '#7a3ab8', 0.4);
        fx.ring(ev[3], ev[4], 40, '#d07aff', 0.35, 3);
        break;
      case 'summon':
        fx.ring(ev[1], ev[2], 60, '#7aff8a', 0.5, 3);
        break;
      case 'bomb':
      case 'flash':
        this.whiteFlash = 0.6;
        this.shake = Math.max(this.shake, 8);
        break;
      case 'prop':
        fx.sparks(ev[1], ev[2], 14, '#ffb040', 160);
        fx.puff(ev[1], ev[2], 20, '#ffb040', 0.4);
        break;
      case 'level':
        fx.ring(p.x, p.y, 70, '#7fc8ff', 0.5, 4);
        fx.sparks(p.x, p.y, 16, '#bfe8ff', 180);
        break;
      case 'enrage':
        fx.ring(ev[1], ev[2], 120, '#ff3a3a', 0.6, 6);
        this.say('ENRAGED!', '', '#ff6a5a', 1.6);
        this.shake = Math.max(this.shake, 10);
        break;
      case 'boss':
        this.say(BOSSES[ev[1]].name, ev[2] ? 'The night\'s master is here' : 'A mighty foe appears', '#ff8a6a', 3);
        this.shake = Math.max(this.shake, 8);
        break;
      case 'bossWarn':
        this.say(ev[2] ? 'Dawn is near...' : 'Something big approaches...', ev[2] ? 'Defeat the master of the night!' : '', '#ffb070', 3);
        break;
      case 'bossDown':
        this.say('VICTORY!', BOSSES[ev[1]].name + ' defeated', '#ffd84a', 2.2);
        break;
      case 'swarm':
        this.say('Swarm!', '', '#d8b0ff', 1.6);
        break;
      case 'ring':
        this.say('Surrounded!', '', '#9fe8ff', 1.6);
        break;
      case 'elite':
        break;
      case 'blizzard':
        if (ev[1]) this.say('Blizzard!', 'The wind pushes everything', '#cfe8ff', 1.8);
        break;
      case 'revive':
        fx.ring(p.x, p.y, 160, '#ffd84a', 0.8, 8);
        this.say('REVIVED!', '', '#ffd84a', 2);
        break;
      case 'dawn':
        this.dawnGlow = 1;
        this.say('DAWN BREAKS!', 'You survived the night', '#ffd88a', 3.4);
        this.shake = 16;
        break;
    }
  }

  update(dt) {
    this.t += dt;
    this.fx.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.whiteFlash > 0) this.whiteFlash -= dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null; }
    if (this.dawnGlow > 0 && this.run.dawnT <= 0 && this.run.over) this.dawnGlow = Math.max(0.6, this.dawnGlow);
  }

  // ----- drawing -----
  draw(ctx) {
    const run = this.run, p = run.player, k = this.k, dpr = this.dpr;
    const W = this.W, H = this.H;
    let sx = 0, sy = 0;
    if (this.shake > 0) { sx = rand(-1, 1) * this.shake * 0.4; sy = rand(-1, 1) * this.shake * 0.4; }
    const camX = p.x, camY = p.y;
    const hw = W / this.scale / 2, hh = H / this.scale / 2;
    this.view = { x0: camX - hw - 40, x1: camX + hw + 40, y0: camY - hh - 50, y1: camY + hh + 50 };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = run.stage.ground[0];
    ctx.fillRect(0, 0, W, H);
    // ground tiles (device-pixel space)
    const T = this.tile.width;
    const ox = (W * dpr) / 2 - camX * k + sx * dpr, oy = (H * dpr) / 2 - camY * k + sy * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const tx0 = Math.floor(-ox / T), ty0 = Math.floor(-oy / T);
    for (let ty = ty0; ty * T + oy < H * dpr; ty++) for (let tx = tx0; tx * T + ox < W * dpr; tx++) ctx.drawImage(this.tile, Math.round(tx * T + ox), Math.round(ty * T + oy));
    // world transform
    ctx.setTransform(k, 0, 0, k, ox, oy);
    this.ox = ox;
    this.oy = oy;
    this.drawDecor(ctx);
    this.drawZones(ctx, false);
    this.drawWeaponsUnder(ctx);
    this.drawDrops(ctx);
    this.drawEntities(ctx);
    this.drawProjs(ctx);
    this.drawWeaponsOver(ctx);
    this.drawZones(ctx, true);
    this.fx.draw(ctx);
    this.drawEnemyShots(ctx);
    this.drawNight(ctx);
    this.drawLights(ctx);
    // screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawWeather(ctx);
    if (this.hurtFlash > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,30,30,${Math.min(0.5, this.hurtFlash * 1.4)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.whiteFlash > 0) {
      ctx.fillStyle = `rgba(255,250,220,${Math.min(0.85, this.whiteFlash * 1.5)})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.drawHUD(ctx);
  }

  inView(x, y, r) {
    const v = this.view;
    return x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;
  }

  drawDecor(ctx) {
    const v = this.view, C = 150, kind = this.run.stage.decor, list = DECOR[kind];
    const cx0 = Math.floor(v.x0 / C) - 1, cx1 = Math.floor(v.x1 / C) + 1, cy0 = Math.floor(v.y0 / C) - 1, cy1 = Math.floor(v.y1 / C) + 1;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const h = hashStr(cx + ',' + cy);
        if (h % 100 >= 30) continue;
        const x = cx * C + ((h >>> 8) % C), y = cy * C + ((h >>> 16) % C);
        const r = 12 + ((h >>> 4) % 9);
        if (!this.inView(x, y, r * 2)) continue;
        const spr = DecorSprites.get(kind, (h >>> 12) % list.length, r * this.k);
        const s = spr.width / this.k;
        ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
      }
    }
  }

  drawZones(ctx, over) {
    const run = this.run, t = this.t;
    for (const z of run.zones) {
      if (z.dead || !this.inView(z.x, z.y, (z.r || 40) + (z.len || 0))) continue;
      const u = z.t / z.life;
      switch (z.k) {
        case 'slash': {
          if (!over) break;
          const a = 1 - u;
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.scale(z.side, 1);
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.ellipse(-z.rx * 0.2, 0, z.rx * 1.1, z.ry * 1.25, 0, -Math.PI / 2, Math.PI / 2);
          ctx.ellipse(-z.rx * 0.45, 0, z.rx * 0.8, z.ry * 0.7, 0, Math.PI / 2, -Math.PI / 2, true);
          ctx.closePath();
          ctx.fillStyle = rgba(z.col, 0.85);
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = 1;
          break;
        }
        case 'pool': {
          if (over) break;
          const fade = Math.min(1, (1 - u) * 4, z.t * 6);
          ctx.globalAlpha = fade * 0.75;
          const gl = Glow.get(z.inferno ? '#ff3a1a' : '#ff7a2a', 32);
          ctx.drawImage(gl, z.x - z.r * 1.3, z.y - z.r * 1.3, z.r * 2.6, z.r * 2.6);
          ctx.globalAlpha = fade;
          for (let i = 0; i < 5; i++) {
            const a = i * 1.26 + t * 2, rr2 = z.r * (0.25 + (i % 3) * 0.22);
            const fx2 = z.x + Math.cos(a) * rr2, fy = z.y + Math.sin(a) * rr2 * 0.6;
            const fl = 4 + Math.sin(t * 12 + i) * 1.5;
            ctx.fillStyle = i % 2 ? '#ffd84a' : '#ff8a2a';
            ctx.beginPath();
            ctx.moveTo(fx2 - fl * 0.6, fy);
            ctx.quadraticCurveTo(fx2, fy - fl * 2.6, fx2 + fl * 0.6, fy);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'nova': {
          if (!over) break;
          ctx.globalAlpha = 1 - u;
          ctx.strokeStyle = z.zero ? '#e8fbff' : '#9fe4ff';
          ctx.lineWidth = z.zero ? 7 : 5;
          circle(ctx, z.x, z.y, z.cur || 1);
          ctx.stroke();
          ctx.fillStyle = z.zero ? 'rgba(200,240,255,0.18)' : 'rgba(150,220,255,0.12)';
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'rune': {
          if (over) break;
          const ready = !(z.cool > 0);
          ctx.globalAlpha = Math.min(1, z.t * 4, (z.life - z.t) * 2) * (ready ? 1 : 0.4);
          ctx.strokeStyle = z.glyph ? '#fff3a8' : '#ffd84a';
          ctx.lineWidth = 1.6;
          circle(ctx, z.x, z.y, 11 + Math.sin(t * 5 + z.x) * 1);
          ctx.stroke();
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const a = t * 1.5 + (i * TAU) / 3;
            ctx.moveTo(z.x + Math.cos(a) * 7, z.y + Math.sin(a) * 7);
            ctx.lineTo(z.x + Math.cos(a + 2.1) * 7, z.y + Math.sin(a + 2.1) * 7);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'vent': {
          if (over) break;
          if (z.t < z.warn) {
            const w = z.t / z.warn;
            ctx.fillStyle = `rgba(255,80,30,${0.12 + w * 0.2})`;
            circle(ctx, z.x, z.y, z.r);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,120,40,0.35)';
            circle(ctx, z.x, z.y, z.r * w);
            ctx.fill();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = '#ff6a2a';
            ctx.lineWidth = 1.5;
            circle(ctx, z.x, z.y, z.r);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            const f = Math.min(1, (z.life - z.t) * 2);
            ctx.globalAlpha = f;
            const gl = Glow.get('#ff5a1a', 32);
            ctx.drawImage(gl, z.x - z.r * 1.5, z.y - z.r * 1.5, z.r * 3, z.r * 3);
            ctx.fillStyle = '#ffb040';
            for (let i = 0; i < 6; i++) {
              const a = i + t * 3, rr2 = z.r * 0.6 * ((i * 37) % 10) / 10;
              const fl = 5 + Math.sin(t * 14 + i) * 2;
              const fx2 = z.x + Math.cos(a) * rr2, fy = z.y + Math.sin(a) * rr2 * 0.6;
              ctx.beginPath();
              ctx.moveTo(fx2 - fl * 0.6, fy);
              ctx.quadraticCurveTo(fx2, fy - fl * 3.2, fx2 + fl * 0.6, fy);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }
          break;
        }
        case 'rift': {
          if (over) break;
          ctx.globalAlpha = Math.min(1, z.t * 2, (z.life - z.t) * 2);
          const gl = Glow.get('#7a2aff', 32);
          ctx.drawImage(gl, z.x - z.r * 1.6, z.y - z.r * 1.6, z.r * 3.2, z.r * 3.2);
          ctx.fillStyle = '#12061f';
          circle(ctx, z.x, z.y, z.r * 0.75);
          ctx.fill();
          ctx.strokeStyle = '#c08aff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const a = t * 3 + (i * TAU) / 3;
            ctx.moveTo(z.x + Math.cos(a) * z.r * 0.75, z.y + Math.sin(a) * z.r * 0.75);
            ctx.quadraticCurveTo(z.x + Math.cos(a + 1) * z.r * 0.3, z.y + Math.sin(a + 1) * z.r * 0.3, z.x, z.y);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'puddle': {
          if (over) break;
          ctx.globalAlpha = Math.min(1, (z.life - z.t)) * 0.7;
          ctx.fillStyle = '#ff6a1a';
          ellipse(ctx, z.x, z.y, z.r, z.r * 0.7);
          ctx.fill();
          ctx.fillStyle = '#ffc84a';
          ellipse(ctx, z.x, z.y, z.r * 0.55, z.r * 0.38);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'warn': {
          if (!over) break;
          ctx.fillStyle = 'rgba(255,40,40,0.16)';
          circle(ctx, z.x, z.y, z.r);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,60,40,0.35)';
          circle(ctx, z.x, z.y, z.r * u);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,90,70,0.9)';
          ctx.lineWidth = 2;
          circle(ctx, z.x, z.y, z.r);
          ctx.stroke();
          break;
        }
        case 'warnLine': {
          if (!over) break;
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.rotate(z.ang);
          ctx.fillStyle = `rgba(255,50,40,${0.14 + u * 0.2})`;
          ctx.fillRect(0, -z.w / 2, z.len, z.w);
          ctx.strokeStyle = 'rgba(255,90,70,0.8)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(0, -z.w / 2, z.len, z.w);
          ctx.restore();
          break;
        }
      }
    }
  }

  drawWeaponsUnder(ctx) {
    const run = this.run, p = run.player;
    for (const w of run.weapons) {
      const s = w.s;
      if ((w.key === 'aura' || w.key === 'sanctum') && s.r) {
        const sanct = w.key === 'sanctum';
        const gl = Glow.get(sanct ? '#fff3b0' : '#fff0a0', 48);
        ctx.globalAlpha = 0.28 + (s.pulse || 0) * 0.25;
        ctx.drawImage(gl, p.x - s.r * 1.25, p.y - s.r * 1.25, s.r * 2.5, s.r * 2.5);
        ctx.globalAlpha = 0.5 + (s.pulse || 0) * 0.4;
        ctx.strokeStyle = sanct ? '#ffe98a' : '#fff3a8';
        ctx.lineWidth = 1.5;
        circle(ctx, p.x, p.y, s.r);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  drawWeaponsOver(ctx) {
    const run = this.run, p = run.player;
    for (const w of run.weapons) {
      const s = w.s, col = WEAPONS[w.key].col;
      if ((w.key === 'blades' || w.key === 'halo') && s.on && s.n) {
        for (let i = 0; i < s.n; i++) {
          const a = s.ang + (i * TAU) / s.n;
          const x = p.x + Math.cos(a) * s.rad, y = p.y + Math.sin(a) * s.rad;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a + Math.PI / 2 + this.t * 0);
          const L = s.size * 1.7;
          ctx.globalAlpha = 0.35;
          ctx.drawImage(Glow.get(col, 24), -L, -L, L * 2, L * 2);
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.moveTo(0, -L);
          ctx.lineTo(L * 0.35, 0);
          ctx.lineTo(0, L * 0.5);
          ctx.lineTo(-L * 0.35, 0);
          ctx.closePath();
          ctx.fillStyle = '#f2f6ff';
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = OUT;
          ctx.stroke();
          ctx.restore();
        }
      }
      if ((w.key === 'beam' || w.key === 'solar') && s.on && s.n) {
        ctx.lineCap = 'round';
        for (let i = 0; i < s.n; i++) {
          const a = s.ang + (i * TAU) / s.n;
          const x1 = p.x + Math.cos(a) * s.len, y1 = p.y + Math.sin(a) * s.len;
          ctx.strokeStyle = rgba(col, 0.35);
          ctx.lineWidth = s.width * 2.6;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x1, y1); ctx.stroke();
          ctx.strokeStyle = rgba(col, 0.9);
          ctx.lineWidth = s.width * 1.2;
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = s.width * 0.45;
          ctx.stroke();
        }
      }
      if ((w.key === 'drones' || w.key === 'hive') && s.d) {
        for (const d of s.d) {
          const bob = Math.sin(this.t * 6 + d.x * 0.1) * 1.5;
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ellipse(ctx, d.x, d.y + 14, 5, 2);
          ctx.fill();
          ctx.strokeStyle = '#cfd8e8';
          ctx.lineWidth = 1.2;
          const pr = 5 + Math.sin(this.t * 40) * 2;
          ctx.beginPath(); ctx.moveTo(d.x - pr - 4, d.y - 5 + bob); ctx.lineTo(d.x + pr + 4, d.y - 5 + bob); ctx.stroke();
          rr(ctx, d.x - 5, d.y - 4 + bob, 10, 7, 3, col, 1.2);
          ctx.fillStyle = '#fff';
          ctx.fillRect(d.x - 1, d.y - 2 + bob, 2, 2);
        }
      }
    }
  }

  drawDrops(ctx) {
    const run = this.run, k = this.k, t = this.t;
    for (const d of run.drops) {
      if (d.dead || !this.inView(d.x, d.y, 12)) continue;
      let spr, r;
      if (d.k === 'gem') {
        const tier = d.big ? 2 : gemTier(d.v);
        r = d.big ? 8 : 4.2 + tier * 0.9;
        spr = DropSprites.get('gem', tier, r * k);
      } else if (d.k === 'chest') {
        r = 9;
        spr = DropSprites.get('chest', d.boss ? 1 : 0, r * k);
        ctx.globalAlpha = 0.5 + Math.sin(t * 5) * 0.2;
        ctx.drawImage(Glow.get(d.boss ? '#c88aff' : '#ffd84a', 32), d.x - 22, d.y - 22, 44, 44);
        ctx.globalAlpha = 1;
      } else {
        r = d.k === 'coin' ? 4.5 : 6.5;
        spr = DropSprites.get(d.k, 0, r * k);
      }
      const bob = d.k === 'gem' ? 0 : Math.sin(t * 4 + d.x) * 1.5;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(spr, Math.round(d.x * k + this.ox - spr.width / 2), Math.round((d.y + bob) * k + this.oy - spr.height / 2));
      ctx.setTransform(k, 0, 0, k, this.ox, this.oy);
    }
  }

  drawEntities(ctx) {
    const run = this.run, p = run.player, k = this.k, list = this.sorted;
    list.length = 0;
    for (const e of run.enemies) if (!e.dead && this.inView(e.x, e.y, e.r * 2)) list.push(e);
    list.push(p);
    list.sort((a, b) => a.y - b.y);
    // shadows first
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    for (const e of list) {
      const r = e.r, fly = e.fly ? 6 : 0;
      ctx.moveTo(e.x + r * 0.8, e.y + r * 0.95 + fly);
      ctx.ellipse(e.x, e.y + r * 0.95 + fly, r * 0.8, r * 0.3, 0, 0, TAU);
    }
    ctx.fill();
    // sprites are stamped 1:1 in device pixels: crisp and fast
    const ox = this.ox, oy = this.oy;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const e of list) {
      if (e === p) {
        ctx.setTransform(k, 0, 0, k, ox, oy);
        this.drawPlayer(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        continue;
      }
      const sp = e.ai === 'bat' || e.ai === 'sweep' || e.type === 'imp' ? 9 : 5;
      let frame = Math.floor(e.t * sp) % 2;
      if (e.frozen > 0) frame = 0;
      let variant = 'n';
      if (e.boss) variant = 'boss';
      else if (e.elite) variant = 'elite';
      if (e.flash > 0) variant = 'flash';
      else if (e.frozen > 0) variant = 'frozen';
      if (e.ai === 'bloat' && e.st === 1 && Math.floor(this.t * 12) % 2) variant = 'flash';
      const tint = e.boss ? BOSSES[e.bossKey].tint : null;
      const spr = Sprites.get(e.boss ? e.bossKey : e.look, e.look, frame, e.fx < 0, variant, e.r * k, tint);
      const bob = e.ai === 'hop' ? -Math.max(0, Math.sin(e.t * 5 + e.id)) * e.r * 0.5 : e.fly ? Math.sin(e.t * 4 + e.id) * 2 - 4 : 0;
      if (e.spawnT > 0) ctx.globalAlpha = Math.max(0.1, 1 - e.spawnT / 0.6);
      else if (e.ghost && !e.boss) ctx.globalAlpha = 0.85;
      ctx.drawImage(spr, Math.round(e.x * k + ox - spr.width / 2), Math.round((e.y + bob) * k + oy - spr.height / 2));
      ctx.globalAlpha = 1;
      if (e.prop || (e.ai === 'charge' && e.st === 1) || (e.elite && e.hp < e.maxHp)) {
        ctx.setTransform(k, 0, 0, k, ox, oy);
        if (e.prop) {
          ctx.globalAlpha = 0.5 + Math.sin(this.t * 6 + e.id) * 0.15;
          ctx.drawImage(Glow.get('#ffb040', 32), e.x - 26, e.y - e.r - 20, 52, 52);
          ctx.globalAlpha = 1;
        }
        if (e.ai === 'charge' && e.st === 1) outlineText(ctx, '!', e.x, e.y - e.r - 10, 16, '#ff4a3a');
        if (e.elite && e.hp < e.maxHp) this.bar(ctx, e.x, e.y - e.r - 8, e.r * 2, 3, e.hp / e.maxHp, '#ffd84a');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
    ctx.setTransform(k, 0, 0, k, ox, oy);
  }

  drawPlayer(ctx) {
    if (this.dead) return;
    const run = this.run, p = run.player, k = this.k;
    const ch = run.char;
    const frame = p.moving ? Math.floor(p.walk) % 2 : 0;
    const blink = p.hurtT > 0 && Math.floor(this.t * 30) % 2;
    const spr = Sprites.get('hero:' + run.charKey, ch.look, frame, p.fx < 0, blink ? 'flash' : 'n', p.r * k);
    const s = spr.width / k;
    const bob = p.moving ? -Math.abs(Math.sin(p.walk * Math.PI)) * 1.5 : 0;
    ctx.drawImage(spr, p.x - s / 2, p.y - s / 2 + bob, s, s);
    // health bar under the hero
    const hpf = clamp(p.hp / run.stats.maxHp, 0, 1);
    this.bar(ctx, p.x, p.y + p.r + 7, 26, 3.5, hpf, hpf > 0.5 ? '#6fe07a' : hpf > 0.25 ? '#ffd84a' : '#ff4a4a');
  }

  bar(ctx, x, y, w, h, f, col) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - w / 2 - 0.8, y - 0.8, w + 1.6, h + 1.6);
    ctx.fillStyle = col;
    ctx.fillRect(x - w / 2, y, w * f, h);
  }

  drawProjs(ctx) {
    const run = this.run;
    for (const p of run.projs) {
      if (p.dead || !this.inView(p.x, p.y, 30)) continue;
      const col = WEAPONS[p.w.key].col;
      switch (p.k) {
        case 'bolt':
        case 'storm': {
          const r = p.r * 2.6;
          ctx.drawImage(Glow.get(col, 24), p.x - r, p.y - r, r * 2, r * 2);
          const sp = Math.hypot(p.vx, p.vy) || 1;
          ctx.strokeStyle = rgba(col, 0.6);
          ctx.lineWidth = p.r * 1.2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.vx / sp) * p.r * 3, p.y - (p.vy / sp) * p.r * 3);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          circle(ctx, p.x, p.y, p.r * 0.55);
          ctx.fill();
          break;
        }
        case 'crescent': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(p.ang, 1);
          ctx.globalAlpha = Math.min(1, (p.life - p.t) * 3);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * 0.7, p.r * 1.3, 0, -Math.PI / 2, Math.PI / 2);
          ctx.ellipse(-p.r * 0.35, 0, p.r * 0.5, p.r * 1.0, 0, Math.PI / 2, -Math.PI / 2, true);
          ctx.closePath();
          ctx.fillStyle = rgba(col, 0.9);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = 1;
          break;
        }
        case 'boom':
        case 'moon': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.ang);
          const r = p.r * 1.3;
          ctx.scale(r, r);
          ctx.lineJoin = 'round';
          pg(ctx, [-0.9, 0.35, 0, -0.55, 0.9, 0.35, 0.65, 0.55, 0, -0.1, -0.65, 0.55], col, 0.16);
          ctx.restore();
          break;
        }
        case 'flask': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.ang);
          ctx.scale(5, 5);
          rr(ctx, -0.25, -1.1, 0.5, 0.5, 0.1, '#cfe4ff', 0.2);
          el(ctx, 0, 0, 0.75, 0.75, col, 0.2);
          ctx.restore();
          break;
        }
        case 'orb':
        case 'prism': {
          const r = p.r * 2.2;
          ctx.drawImage(Glow.get(col, 24), p.x - r, p.y - r, r * 2, r * 2);
          ctx.fillStyle = p.k === 'prism' ? '#fff0ff' : '#f2e0ff';
          circle(ctx, p.x, p.y, p.r * 0.6);
          ctx.fill();
          break;
        }
        case 'missile': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.ang);
          ctx.drawImage(Glow.get('#ffb040', 16), -14, -6, 12, 12);
          rr(ctx, -5, -2.2, 9, 4.4, 2, '#e8eef5', 1);
          ctx.fillStyle = col;
          ctx.fillRect(1, -2.2, 2, 4.4);
          ctx.restore();
          break;
        }
      }
    }
  }

  drawEnemyShots(ctx) {
    for (const b of this.run.eprojs) {
      if (b.dead || !this.inView(b.x, b.y, 12)) continue;
      if (b.k === 'arrow') {
        const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
        ln(ctx, b.x - ux * 9, b.y - uy * 9, b.x + ux * 3, b.y + uy * 3, 1.8, '#e8d8b0');
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(b.x + ux * 6, b.y + uy * 6);
        ctx.lineTo(b.x - uy * 3, b.y + ux * 3);
        ctx.lineTo(b.x + uy * 3, b.y - ux * 3);
        ctx.fill();
        continue;
      }
      const col = b.col || SHOT_COLS[b.k] || '#ff5a3a';
      const r = b.r;
      ctx.drawImage(Glow.get(col, 16), b.x - r * 2.4, b.y - r * 2.4, r * 4.8, r * 4.8);
      circle(ctx, b.x, b.y, r);
      ctx.fillStyle = b.k === 'snowball' ? '#ffffff' : '#fff6e8';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = b.k === 'boss' ? '#2a0a1a' : OUT;
      ctx.stroke();
      if (b.k === 'boss' || b.k === 'spread' || b.k === 'fireball') {
        ctx.fillStyle = col;
        circle(ctx, b.x, b.y, r * 0.55);
        ctx.fill();
      }
    }
  }

  // Night darkness with a pool of lantern light around the hero; it lifts as dawn nears.
  drawNight(ctx) {
    const run = this.run, st = run.stage, p = run.player;
    const prog = clamp(run.T / NIGHT, 0, 1);
    let a = lerp(0.5, 0.12, prog);
    if (run.dawnT > 0 || run.won) a = Math.max(0, a - (1 - Math.max(0, run.dawnT) / 3.5) * 0.4);
    if (a <= 0.01) return;
    const v = this.view;
    const g = ctx.createRadialGradient(p.x, p.y - 4, 55, p.x, p.y, Math.max(v.x1 - v.x0, v.y1 - v.y0) * 0.55);
    const night = prog < 0.8 ? st.night : st.night;
    g.addColorStop(0, rgba(night, 0));
    g.addColorStop(0.35, rgba(night, a * 0.55));
    g.addColorStop(1, rgba(night, a));
    ctx.fillStyle = g;
    ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    if (prog > 0.75) {
      // warm dawn glow creeping in from the top of the screen
      const d = (prog - 0.75) / 0.25;
      const g2 = ctx.createLinearGradient(0, v.y0, 0, v.y0 + (v.y1 - v.y0) * 0.6);
      g2.addColorStop(0, rgba(st.dawn, 0.28 * d));
      g2.addColorStop(1, rgba(st.dawn, 0));
      ctx.fillStyle = g2;
      ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    }
  }

  drawLights(ctx) {
    const run = this.run, p = run.player, t = this.t;
    ctx.globalCompositeOperation = 'lighter';
    // the lantern
    const fl = 1 + Math.sin(t * 9) * 0.04 + Math.sin(t * 23) * 0.03;
    ctx.globalAlpha = 0.22;
    ctx.drawImage(Glow.get('#ffb050', 48), p.x + p.fx * 9 - 40 * fl, p.y - 36 * fl, 80 * fl, 80 * fl);
    ctx.globalAlpha = 0.5;
    for (const e of run.enemies) {
      if (e.prop && !e.dead && this.inView(e.x, e.y, 30)) ctx.drawImage(Glow.get('#ff9a30', 32), e.x - 22, e.y - e.r - 14, 44, 44);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.dawnGlow > 0) {
      const v = this.view;
      ctx.fillStyle = `rgba(255,220,160,${0.25 * this.dawnGlow})`;
      ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    }
  }

  drawWeather(ctx) {
    const run = this.run;
    const W = this.W, H = this.H;
    if (run.stage.hazard === 'blizzard' || run.stage.decor === 'ice') {
      const wind = run.wind, strong = Math.hypot(wind.x, wind.y) > 1;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      const n = strong ? 70 : 30;
      for (let i = 0; i < n; i++) {
        const s = this.snow[i];
        const vx = strong ? wind.x * 6 : 8, vy = strong ? wind.y * 6 + 30 : 30;
        const x = (((s.x * W + this.t * vx * s.s - run.player.x * this.scale * 0.3) % W) + W) % W;
        const y = (((s.y * H + this.t * vy * s.s - run.player.y * this.scale * 0.3) % H) + H) % H;
        if (strong) {
          ctx.globalAlpha = 0.5;
          ctx.fillRect(x, y, 6 * s.s, 1.4);
        } else {
          ctx.globalAlpha = 0.7;
          ctx.fillRect(x, y, 2 * s.s, 2 * s.s);
        }
      }
      ctx.globalAlpha = 1;
      if (strong) {
        ctx.fillStyle = 'rgba(220,235,255,0.12)';
        ctx.fillRect(0, 0, W, H);
      }
    } else if (run.stage.decor === 'lava') {
      ctx.fillStyle = 'rgba(255,150,60,0.7)';
      for (let i = 0; i < 24; i++) {
        const s = this.snow[i];
        const x = (((s.x * W - run.player.x * this.scale * 0.4 + Math.sin(this.t + i) * 10) % W) + W) % W;
        const y = (((s.y * H - this.t * 24 * s.s - run.player.y * this.scale * 0.4) % H) + H) % H;
        ctx.globalAlpha = 0.5 + Math.sin(this.t * 3 + i) * 0.3;
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ----- HUD (CSS pixels) -----
  drawHUD(ctx) {
    const run = this.run, W = this.W, H = this.H, top = this.sa.top, bot = this.sa.bottom;
    // XP bar
    const xb = 8, yb = top + 6, wb = W - 16, hb = 13;
    ctx.fillStyle = 'rgba(5,8,25,0.75)';
    roundRect(ctx, xb - 1.5, yb - 1.5, wb + 3, hb + 3, 6);
    ctx.fill();
    const f = clamp(run.xp / run.xpNext, 0, 1);
    if (f > 0) {
      const g = ctx.createLinearGradient(xb, 0, xb + wb, 0);
      g.addColorStop(0, '#3a8aff');
      g.addColorStop(1, '#8ad8ff');
      ctx.fillStyle = g;
      roundRect(ctx, xb, yb, Math.max(6, wb * f), hb, 5);
      ctx.fill();
    }
    outlineText(ctx, 'LV ' + run.level, xb + wb - 6, yb + hb / 2 + 0.5, 11, '#fff', 'right');
    // timer + dawn progress
    const time = run.mode === 'quick' ? run.time : run.time;
    outlineText(ctx, fmtTime(time), W / 2, top + 38, 22, '#fff');
    const pw = 96, px = W / 2 - pw / 2, py = top + 54;
    const prog = clamp(run.T / NIGHT, 0, 1);
    ctx.fillStyle = 'rgba(5,8,25,0.6)';
    roundRect(ctx, px, py, pw, 5, 2.5);
    ctx.fill();
    const g2 = ctx.createLinearGradient(px, 0, px + pw, 0);
    g2.addColorStop(0, '#6a7aff');
    g2.addColorStop(1, '#ffc46a');
    ctx.fillStyle = g2;
    roundRect(ctx, px, py, Math.max(5, pw * prog), 5, 2.5);
    ctx.fill();
    ctx.fillStyle = '#cfd8ff';
    circle(ctx, px - 7, py + 2.5, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(5,8,25,1)';
    circle(ctx, px - 5.5, py + 1.5, 3.2);
    ctx.fill();
    ctx.fillStyle = '#ffc46a';
    circle(ctx, px + pw + 7, py + 2.5, 4);
    ctx.fill();
    // kills and gold
    outlineText(ctx, '💀 ' + fmtNum(run.kills), 10, top + 36, 13, '#fff', 'left');
    ctx.fillStyle = '#ffcc33';
    circle(ctx, 16, top + 56, 5.5);
    ctx.fill();
    ctx.strokeStyle = '#8a5a00';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    outlineText(ctx, fmtNum(run.gold), 25, top + 56.5, 13, '#ffe27a', 'left');
    // inventory
    let x = 8;
    const iy = top + 70;
    for (const w of run.weapons) {
      this.slotIcon(ctx, w.key, x, iy, 22, WEAPONS[w.key].evolved ? 'MAX' : w.lvl, WEAPONS[w.key].evolved);
      x += 25;
    }
    x = 8;
    for (const p of run.passives) {
      this.slotIcon(ctx, p.key, x, iy + 27, 17, p.lvl, false);
      x += 20;
    }
    // boss bar
    const b = run.boss;
    if (b && !b.dead) {
      const bw = Math.min(W - 40, 420), bx = (W - bw) / 2, by = H - bot - 26;
      ctx.fillStyle = 'rgba(10,4,12,0.8)';
      roundRect(ctx, bx - 2, by - 2, bw + 4, 14, 6);
      ctx.fill();
      const g3 = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g3.addColorStop(0, '#ff3a5a');
      g3.addColorStop(1, '#ff9a4a');
      ctx.fillStyle = g3;
      roundRect(ctx, bx, by, Math.max(4, bw * clamp(b.hp / b.maxHp, 0, 1)), 10, 5);
      ctx.fill();
      outlineText(ctx, BOSSES[b.bossKey].name + (b.phase === 2 ? ' (enraged)' : ''), W / 2, by - 10, 13, '#ffd0c0');
    }
    // banner
    const bn = this.banner;
    if (bn) {
      const u = bn.t / bn.life;
      const a = u < 0.1 ? u / 0.1 : u > 0.8 ? (1 - u) / 0.2 : 1;
      ctx.globalAlpha = a;
      const sc = u < 0.1 ? 0.7 + u * 3 : 1;
      outlineText(ctx, bn.text, W / 2, H * 0.27, 28 * sc, bn.col);
      if (bn.sub) outlineText(ctx, bn.sub, W / 2, H * 0.27 + 26, 13, '#f0e8ff');
      ctx.globalAlpha = 1;
    }
    Input.draw(ctx);
  }

  slotIcon(ctx, key, x, y, s, lvl, evo) {
    ctx.fillStyle = evo ? 'rgba(80,50,0,0.75)' : 'rgba(5,8,25,0.7)';
    roundRect(ctx, x, y, s, s, 4);
    ctx.fill();
    if (evo) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.2; ctx.stroke(); }
    const ic = Icons.canvas(key, Math.round(s * this.dpr));
    ctx.drawImage(ic, x, y, s, s);
    outlineText(ctx, String(lvl), x + s - 1, y + s - 2, s > 20 ? 8 : 7, evo ? '#ffd84a' : '#fff', 'right');
  }
}
