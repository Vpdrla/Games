// ---------- Battle view: draws a battle from a state object and turns touches into card plays ----------
// The state comes from a local Sim (offline / host) or from network snapshots (guest).
const UNIT_SCALE = 1.12;
const TOWER_SCALE = 0.86;
const TOP_ROOM = 1.7; // tiles reserved above the arena for the enemy king tower
const EMOTES = ['👍', '😂', '😡', '😭', '👏', '😱'];

class BattleView {
  constructor(scene, o) {
    this.scene = scene;
    this.myTeam = o.myTeam;
    this.flip = o.myTeam === 1;
    this.theme = ARENAS[o.arena || 0];
    this.fx = new FX();
    this.t = 0;
    this.T = 20;
    this.sel = -1;
    this.drag = null;
    this.ptr = null;
    this.msgs = [];
    this.emotes = [];
    this.emoteOpen = false;
    this.shake = 0;
    this.vs = new Map();
    this.bg = null;
    this.bgT = 0;
    this.badSpot = 0;
    this.crownPops = [];
  }

  // ---- layout ----
  layout(W, H, safe) {
    this.W = W;
    this.H = H;
    const sb = safe.bottom || 0, st = safe.top || 0;
    let handH = clamp(H * 0.19, 112, 172);
    const eh = 20;
    let ch = handH - eh - 20;
    let cw = ch / 1.24;
    const maxW = Math.min(W, 560) - 16;
    if (cw * 4.62 + 30 > maxW) { cw = (maxW - 30) / 4.62; ch = cw * 1.24; handH = ch + eh + 20; }
    this.handH = handH + sb;
    this.handTop = H - this.handH;
    const availH = this.handTop - st;
    const T = Math.min(W / 18.3, availH / (AH + TOP_ROOM + 0.2));
    this.T = T;
    this.ox = Math.round((W - AW * T) / 2);
    this.oy = Math.round(st + (availH - (AH + TOP_ROOM + 0.2) * T) / 2 + TOP_ROOM * T);
    const nw = cw * 0.62, nh = ch * 0.62;
    const rowW = nw + 10 + cw * 4 + 18;
    const x0 = (W - rowW) / 2;
    const cy = this.handTop + 8;
    this.nextRect = { x: x0, y: cy + ch - nh, w: nw, h: nh };
    this.cards = [];
    for (let i = 0; i < 4; i++) this.cards.push({ x: x0 + nw + 10 + i * (cw + 6), y: cy, w: cw, h: ch });
    this.elixirRect = { x: x0 + nw + 10, y: cy + ch + 6, w: cw * 4 + 18, h: eh - 4 };
    this.emoteBtn = { x: 8 + 18, y: this.handTop - 26, r: 18 };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!this.bg || Math.abs(this.bgT - T) > 0.01) {
      this.bg = paintArena(this.theme, T * this.dpr, false);
      this.bgT = T;
    }
  }

  toScreen(x, y) { return [this.ox + x * this.T, this.oy + (this.flip ? AH - y : y) * this.T]; }
  toWorld(sx, sy) {
    const x = (sx - this.ox) / this.T;
    let y = (sy - this.oy) / this.T;
    if (this.flip) y = AH - y;
    return [x, y];
  }

  vstate(e) {
    let s = this.vs.get(e.id);
    if (!s) { s = { dir: e.team === this.myTeam ? 1 : -1, walk: Math.random(), flash: 0, hp: e.hp, seen: this.t }; this.vs.set(e.id, s); }
    return s;
  }

  // ---- events from the simulation (or network) ----
  onEvent(ev) {
    const f = this.fx;
    const mine = (team) => team === this.myTeam;
    switch (ev[0]) {
      case 'play': {
        const [, team, key, x, y] = ev;
        if (!mine(team)) this.cardPop(key, x, y);
        Sound.play(CARDS[key].type === 'spell' ? 'cast' : 'deploy');
        break;
      }
      case 'land': {
        const [, , x, y, u] = ev;
        const big = UNITS[u] && UNITS[u].r >= 0.7;
        f.puff(x, y, big ? 8 : 4, 'rgba(240,235,220,0.9)', big ? 0.6 : 0.35);
        if (big) { this.shake = Math.max(this.shake, 0.15); Sound.play('thud'); }
        break;
      }
      case 'hit': {
        const [, , x, y, heavy, u] = ev;
        f.sparks(x, y, heavy > 1 ? 7 : 3, heavy > 1 ? '#ffe28a' : '#fff');
        Sound.play(heavy > 1 ? 'hitHeavy' : u === 'giant' || u === 'golem' || u === 'golemite' ? 'punch' : 'hit');
        break;
      }
      case 'phit': {
        const [, , pt, x, y] = ev;
        if (pt === 'ice') { f.shards(x, y, 3); Sound.play('ice'); } else f.sparks(x, y, 3, pt === 'spit' ? '#c9a8ff' : '#fff');
        if (pt === 'cannonball') Sound.play('thud');
        break;
      }
      case 'shoot': {
        const pt = ev[2];
        Sound.play(pt === 'arrow' || pt === 'spear' ? 'bow' : pt === 'bullet' ? 'gun' : pt === 'cannonball' ? 'cannon' : pt === 'spit' ? 'spit' : 'magic');
        break;
      }
      case 'boom': {
        const [, x, y, r, pt] = ev;
        const fire = pt === 'fireball' || pt === 'fireorb' || pt === 'flame';
        f.flash(x, y, r, fire ? '#ff9a3a' : pt === 'orb' ? '#b56cff' : pt === 'ice' ? '#bff0ff' : '#ffe8b0', 0.3);
        f.ring(x, y, r, fire ? '#ffcf6a' : pt === 'ice' ? '#e8fbff' : '#fff', 0.35, 0.14);
        if (pt === 'ice') f.shards(x, y, 6);
        else f.puff(x, y, r > 2 ? 10 : 5, fire ? 'rgba(255,140,60,0.8)' : 'rgba(120,110,100,0.8)', r * 0.4);
        if (r >= 2) { this.shake = Math.max(this.shake, r >= 2.4 ? 0.3 : 0.18); Sound.play('boom'); } else Sound.play(fire ? 'fire' : pt === 'ice' ? 'ice' : 'pop');
        break;
      }
      case 'spin': {
        const [, , x, y] = ev;
        f.ring(x, y, 1.8, '#fff', 0.25, 0.1);
        Sound.play('swing');
        break;
      }
      case 'bolt': {
        const [, x1, y1, x2, y2] = ev;
        f.bolt(x1, y1, 1.2, x2, y2, 0.6);
        Sound.play('zap');
        break;
      }
      case 'zapfx': {
        const [, x, y, r] = ev;
        f.flash(x, y, r, '#9ff0ff', 0.3);
        f.ring(x, y, r, '#e8fdff', 0.3, 0.1);
        for (let i = 0; i < 5; i++) { const a = Math.random() * TAU; f.bolt(x, y, 6, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, 0, '#bff4ff', 0.25); }
        Sound.play('zap');
        break;
      }
      case 'frostfx': {
        const [, x, y, r] = ev;
        f.flash(x, y, r, '#cff6ff', 0.4);
        f.shards(x, y, 10);
        Sound.play('ice');
        break;
      }
      case 'spell': {
        const [, team, sp, x, y, r] = ev;
        if (sp === 'arrows') { f.arrows(x, y, r, [0.45, 0.7, 0.95]); Sound.play('volley'); }
        if (sp === 'zap') { f.flash(x, y, r, '#9ff0ff', 0.35); f.ring(x, y, r, '#e8fdff', 0.3, 0.12); for (let i = 0; i < 6; i++) { const a = Math.random() * TAU; f.bolt(x, y, 7, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, 0, '#bff4ff', 0.3); } Sound.play('zap'); }
        if (sp === 'freeze') { f.flash(x, y, r, '#dffaff', 0.5); f.shards(x, y, 16); Sound.play('freeze'); }
        if (sp === 'poison') Sound.play('poison');
        if (sp === 'log') Sound.play('log');
        break;
      }
      case 'die': {
        const [, , u, x, y, air] = ev;
        const big = UNITS[u] && UNITS[u].r >= 0.7;
        f.puff(x, y, big ? 10 : 5, 'rgba(255,255,255,0.85)', big ? 0.7 : 0.4, air ? AIR_H : 0.2);
        if (UNITS[u] && UNITS[u].building) f.debris(x, y, 10, ['#8a7a6a', '#6a5a4a', '#a09080'], 0.8);
        if (u === 'skeleton' || u === 'bomber') f.debris(x, y, 4, [BONE], 0.6);
        Sound.play(big ? 'dieBig' : 'die');
        break;
      }
      case 'tower': {
        const [, , team, tt, x, y] = ev;
        f.debris(x, y, 26, ['#a39a8e', '#8f867a', '#cfc6b8', '#6a6258'], 1.6);
        f.puff(x, y, 16, 'rgba(210,200,190,0.9)', 1.2, 0.5);
        f.flash(x, y, 3, '#fff2c0', 0.4);
        this.shake = 0.55;
        Sound.play('towerDown');
        Game.vibrate(120);
        this.crownPops.push({ team: 1 - team, t: 0 });
        const byMe = mine(1 - team);
        this.message(tt === 'king' ? (byMe ? 'KING TOWER DOWN!' : 'Your king has fallen!') : byMe ? '+1 Crown!' : 'Tower lost!', byMe ? '#8fd0ff' : '#ff9a9a');
        break;
      }
      case 'king':
        if (!mine(ev[1])) this.message('King activated!', '#ffe082');
        Sound.play('king');
        break;
      case 'elx': {
        const [, team, x, y] = ev;
        if (mine(team)) { this.fx.text(x, y, '+1', '#ff9cf2', 0.8); Sound.play('elixir'); }
        break;
      }
      case 'charge': Sound.play('charge'); break;
      case 'lance': { const [, , x, y] = ev; f.sparks(x, y, 8, '#ffe28a'); Sound.play('hitHeavy'); break; }
      case 'summon': { const [, , x, y] = ev; f.puff(x, y, 3, 'rgba(180,120,255,0.7)', 0.4); Sound.play('summon'); break; }
      case 'dig': { const [, , x, y] = ev; f.debris(x, y, 10, ['#6a4a2a', '#8a6a40'], 0.8); Sound.play('dig'); break; }
      case 'ot': this.message('OVERTIME!', '#ffb74d', 2.5); Sound.play('warn'); break;
      case 'dbl': this.message('2x ELIXIR!', '#ff9cf2', 2.2); Sound.play('warn'); break;
    }
  }

  message(text, col, dur) { this.msgs.push({ text, col: col || '#fff', t: 0, dur: dur || 1.8 }); if (this.msgs.length > 3) this.msgs.shift(); }

  cardPop(key, x, y) { this.fx.add({ k: 'cardpop', x, y, key, life: 1.0 }); }

  showEmote(team, i) {
    this.emotes = this.emotes.filter((e) => e.team !== team);
    this.emotes.push({ team, i, t: 0 });
    Sound.play('emote');
  }

  update(dt, st) {
    this.t += dt;
    this.fx.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.badSpot > 0) this.badSpot -= dt;
    for (const m of this.msgs) m.t += dt;
    this.msgs = this.msgs.filter((m) => m.t < m.dur);
    for (const e of this.emotes) e.t += dt;
    this.emotes = this.emotes.filter((e) => e.t < 2.4);
    for (const c of this.crownPops) c.t += dt;
    this.crownPops = this.crownPops.filter((c) => c.t < 1.2);
    // per-entity visual bookkeeping
    for (const e of st.ents) {
      if (e.kind !== 'troop' && e.kind !== 'building' && e.kind !== 'tower') continue;
      const s = this.vstate(e);
      if (e.hp < s.hp - 0.5) s.flash = 0.12;
      s.hp = e.hp;
      if (s.flash > 0) s.flash -= dt;
      if (e.moving) s.walk = (s.walk + dt * (e.st ? e.st.speed || 1 : e.spd || 1) * 1.3) % 1;
      const fx = e.fx;
      if (fx > 0.2) s.dir = 1; else if (fx < -0.2) s.dir = -1;
      s.last = this.t;
    }
    if (this.vs.size > 400) for (const [id, s] of this.vs) if (this.t - s.last > 3) this.vs.delete(id);
    if (this.sel >= 0 && !st.me.hand[this.sel]) this.sel = -1;
  }

  // ---- drawing ----
  draw(ctx, st) {
    const W = this.W, H = this.H, T = this.T;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, this.theme.sky[0]);
    sky.addColorStop(1, this.theme.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (this.shake > 0) ctx.translate(rand(-1, 1) * this.shake * 8, rand(-1, 1) * this.shake * 8);
    const pad = this.bg.pad;
    ctx.drawImage(this.bg.canvas, this.ox - pad * T, this.oy - pad * T, (AW + pad * 2) * T, (AH + pad * 2) * T);
    // shimmering river
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 12; i++) {
      const x = ((i * 1.7 + this.t * 0.6) % (AW + 2)) - 1;
      const y = RIVER_TOP + 0.4 + ((i * 0.37) % 1.2);
      const q = this.toScreen(x, this.flip ? AH - y : y);
      ctx.fillRect(q[0], q[1], 0.8 * T, 0.06 * T);
    }
    const a = st.alpha;
    const ents = st.ents;
    this.drawPlacementZones(ctx, st);
    // ground areas & shadows
    for (const e of ents) if (e.kind === 'area') this.drawArea(ctx, e);
    for (const e of ents) {
      if (e.kind !== 'troop' && e.kind !== 'building') continue;
      if (e.tunnel) continue;
      const q = this.toScreen(lerp(e.px, e.x, a), lerp(e.py, e.y, a));
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ellipse(ctx, q[0], q[1], e.r * T * (e.air ? 0.8 : 1), e.r * T * 0.45);
      ctx.fill();
    }
    // sprites (ground sorted by y, then flying)
    const ground = [], air = [];
    const alive = new Set();
    for (const e of ents) {
      if (e.kind === 'tower') alive.add(e.team + ':' + e.lane);
      if (e.kind === 'troop' || e.kind === 'building' || e.kind === 'tower') (e.air && e.deployT <= 0 ? air : ground).push(e);
    }
    for (const team of [0, 1]) {
      for (const s of TOWER_SLOTS) {
        if (alive.has(team + ':' + s.lane) || (st.t < 0.2 && !st.over)) continue;
        ground.push({ kind: 'rubble', tt: s.tt, team, x: s.x, y: mirrorY(team, s.y), px: s.x, py: mirrorY(team, s.y) });
      }
    }
    const sy = (e) => (this.flip ? AH - e.y : e.y);
    ground.sort((p, q) => sy(p) - sy(q));
    air.sort((p, q) => sy(p) - sy(q));
    for (const e of ground) this.drawEntity(ctx, e, a);
    for (const e of ents) if (e.kind === 'proj' && e.pt === 'log') this.drawProj(ctx, e, a);
    for (const e of air) this.drawEntity(ctx, e, a);
    for (const e of ents) if (e.kind === 'proj' && e.pt !== 'log') this.drawProj(ctx, e, a);
    this.fx.draw(ctx, this);
    this.drawCardPops(ctx);
    // health bars on top
    for (const e of ents) if (e.kind === 'troop' || e.kind === 'building' || e.kind === 'tower') this.drawHp(ctx, e, a);
    this.drawGhost(ctx, st);
    ctx.restore();
    this.drawHud(ctx, st);
  }

  drawArea(ctx, e) {
    const q = this.toScreen(e.x, e.y), T = this.T;
    const f = e.dur ? e.t / e.dur : 0;
    if (e.sp === 'poison') {
      ctx.fillStyle = 'rgba(120,220,60,0.28)';
      ellipse(ctx, q[0], q[1], e.r * T, e.r * T * 0.8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,255,90,0.6)';
      ctx.lineWidth = 0.1 * T;
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const an = i * 0.8 + this.t * 0.7, rr = ((i * 0.37 + this.t * 0.3) % 1) * e.r * 0.85;
        ctx.fillStyle = 'rgba(190,255,120,0.55)';
        circle(ctx, q[0] + Math.cos(an) * rr * T, q[1] + Math.sin(an) * rr * T * 0.8 - ((this.t * 1.3 + i) % 1) * 0.6 * T, 0.12 * T);
        ctx.fill();
      }
    } else if (e.sp === 'freeze') {
      ctx.globalAlpha = f > 0.85 ? (1 - f) / 0.15 : 1;
      ctx.fillStyle = 'rgba(190,240,255,0.3)';
      ellipse(ctx, q[0], q[1], e.r * T, e.r * T * 0.8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,252,255,0.8)';
      ctx.lineWidth = 0.08 * T;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.sp === 'arrows') {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 * (1 - f)) + ')';
      ctx.lineWidth = 0.06 * T;
      ellipse(ctx, q[0], q[1], e.r * T, e.r * T * 0.8);
      ctx.stroke();
    }
  }

  drawEntity(ctx, e, a) {
    const T = this.T;
    const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a);
    const q = this.toScreen(x, y);
    const mine = e.team === this.myTeam;
    const c = TEAM_COLORS[mine ? 0 : 1];
    if (e.kind === 'rubble') {
      ctx.save();
      ctx.translate(q[0], q[1]);
      ctx.scale(T * TOWER_SCALE, T * TOWER_SCALE);
      drawTower(ctx, e, { c, destroyed: true });
      ctx.restore();
      return;
    }
    const s = this.vstate(e);
    const fyS = this.flip ? -e.fy : e.fy;
    let aimX = e.fx, aimY = fyS;
    const atk = e.atk != null ? e.atk : e.attacking && e.st && e.st.hs ? clamp(1 - e.cd / e.st.hs, 0, 1) : -1;
    const o = {
      c, dir: s.dir, back: fyS < -0.25, walk: s.walk, moving: e.moving, t: this.t, atk, id: e.id,
      aimX, aimY, attacking: e.attacking, charging: e.charging, active: e.active, jump: 0,
    };
    if (e.kind === 'tower') {
      ctx.save();
      ctx.translate(q[0], q[1]);
      ctx.scale(T * TOWER_SCALE, T * TOWER_SCALE);
      drawTower(ctx, e, o);
      if (e.freezeT > 0) this.frozenOverlay(ctx, e.tt === 'king' ? 2 : 1.5, 3.2);
      ctx.restore();
      if (s.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ellipse(ctx, q[0], q[1] - 1.5 * T, 1.5 * T, 1.3 * T); ctx.fill(); }
      return;
    }
    if (e.tunnel) {
      if (Math.random() < 0.3) this.fx.add({ k: 'dirt', x, y, life: 0.6 });
      ctx.fillStyle = '#7a5a36';
      ellipse(ctx, q[0], q[1], 0.45 * T, 0.28 * T);
      ctx.fill();
      ctx.fillStyle = '#9a7a4a';
      ellipse(ctx, q[0], q[1] - 0.1 * T, 0.3 * T, 0.18 * T);
      ctx.fill();
      return;
    }
    let z = 0;
    let alpha = 1;
    if (e.deployT > 0) {
      z = Math.min(e.deployT, 1) * 2.2;
      alpha = 0.55;
      // deploy timer
      ctx.strokeStyle = mine ? 'rgba(160,210,255,0.9)' : 'rgba(255,160,160,0.9)';
      ctx.lineWidth = 0.1 * T;
      ctx.beginPath();
      ctx.arc(q[0], q[1], e.r * T + 0.1 * T, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(1 - e.deployT, 0, 1));
      ctx.stroke();
    }
    if (e.air) z += AIR_H + Math.sin(this.t * 3 + e.id) * 0.08;
    if (e.jumping) z += 0.9;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(q[0], q[1] - z * T);
    const sc = T * UNIT_SCALE;
    ctx.scale(sc, sc);
    const f = UNIT_ART[e.u];
    if (f) f(ctx, o);
    if (s.flash > 0) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#fff';
      const h = UNIT_H[e.u] || 1.2;
      ellipse(ctx, 0, -h * 0.45, e.r * 1.1, h * 0.5);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    if (e.freezeT > 0) this.frozenOverlay(ctx, e.r, UNIT_H[e.u] || 1.2);
    if (e.stunT > 0 && !(e.freezeT > 0)) {
      const h = (UNIT_H[e.u] || 1.2) + 0.15;
      for (let i = 0; i < 3; i++) {
        const an = this.t * 6 + (i * TAU) / 3;
        ctx.fillStyle = '#fff59d';
        circle(ctx, Math.cos(an) * 0.3, -h + Math.sin(an) * 0.1, 0.07);
        ctx.fill();
      }
    }
    if (e.slowT > 0 && !(e.freezeT > 0)) {
      ctx.strokeStyle = 'rgba(150,230,255,0.8)';
      ctx.lineWidth = 0.06;
      ellipse(ctx, 0, 0, e.r * 0.9, e.r * 0.4);
      ctx.stroke();
    }
    ctx.restore();
    // inferno beam
    if (e.u === 'inferno' && e.attacking) {
      const tx = e.target ? e.target.x : e.tgx, ty = e.target ? e.target.y : e.tgy;
      if (tx != null) {
        const tq = this.toScreen(tx, ty);
        const stage = e.rampT != null ? (e.rampT < 2 ? 0 : e.rampT < 4 ? 1 : 2) : e.ramp || 0;
        const tAir = e.target ? e.target.air : e.tgAir;
        const bx = q[0], by = q[1] - 1.85 * T * UNIT_SCALE, ex = tq[0], ey = tq[1] - (tAir ? AIR_H + 0.4 : 0.5) * T;
        ctx.strokeStyle = ['rgba(255,170,60,0.7)', 'rgba(255,110,40,0.85)', 'rgba(255,60,30,0.95)'][stage];
        ctx.lineWidth = (0.12 + stage * 0.08) * T;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = '#fff3c0';
        ctx.lineWidth = 0.05 * T;
        ctx.stroke();
      }
    }
  }

  frozenOverlay(ctx, r, h) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#bff0ff';
    roundRect(ctx, -r * 1.1, -h * 1.02, r * 2.2, h * 1.04, 0.2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.05;
    ctx.stroke();
  }

  drawProj(ctx, p, a) {
    const T = this.T;
    const x = lerp(p.px, p.x, a), y = lerp(p.py, p.y, a);
    const q = this.toScreen(x, y);
    let z = 0;
    if (p.pt !== 'log') {
      const f = clamp(p.trav / (p.d0 || 1), 0, 1);
      const h0 = p.h0 == null ? 0.8 : p.h0, h1 = p.h1 == null ? 0.5 : p.h1;
      const arc = p.pt === 'bomb' || p.pt === 'fireball' || p.pt === 'cannonball' && h0 < 1.5 ? Math.min(3, (p.d0 || 1) * 0.35) : p.pt === 'arrow' || p.pt === 'spear' ? Math.min(1.2, (p.d0 || 1) * 0.12) : 0;
      z = lerp(h0, h1, f) + Math.sin(f * Math.PI) * arc;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ellipse(ctx, q[0], q[1], 0.15 * T, 0.07 * T);
      ctx.fill();
    }
    let vx = p.x - p.px, vy = p.y - p.py;
    if (Math.abs(vx) + Math.abs(vy) < 1e-4) { vx = (p.tx || p.x) - p.x; vy = (p.ty || p.y) - p.y; }
    if (this.flip) vy = -vy;
    ctx.save();
    ctx.translate(q[0], q[1] - z * T);
    ctx.scale(T, T);
    drawProjectile(ctx, p, { vx, vy, t: this.t });
    ctx.restore();
  }

  drawHp(ctx, e, a) {
    const T = this.T;
    const mine = e.team === this.myTeam;
    const col = TEAM_COLORS[mine ? 0 : 1].hp;
    const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a);
    const q = this.toScreen(x, y);
    if (e.kind === 'tower') {
      const k = e.tt === 'king';
      if (k && !e.active && e.hp >= e.maxHp) {
        this.levelBadge(ctx, q[0] - 1.5 * T, q[1] - 3.8 * T, e.lvl, mine);
        return;
      }
      const w = (k ? 3.2 : 2.6) * T, h = 0.42 * T;
      const bx = q[0] - w / 2, by = q[1] - (k ? 4.05 : 3.8) * T;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      roundRect(ctx, bx - 2, by - 2, w + 4, h + 4, 5);
      ctx.fill();
      ctx.fillStyle = col;
      roundRect(ctx, bx, by, w * clamp(e.hp / e.maxHp, 0, 1), h, 4);
      ctx.fill();
      outlineText(ctx, String(Math.max(0, Math.ceil(e.hp))), q[0] + 0.25 * T, by + h / 2 + 0.5, Math.max(9, h * 0.95), '#fff');
      this.levelBadge(ctx, bx - 2, by + h / 2, e.lvl, mine);
      return;
    }
    if (e.hp >= e.maxHp - 0.5 || e.deployT > 0 || e.tunnel) return;
    const uh = (UNIT_H[e.u] || 1.2) * UNIT_SCALE + (e.air ? AIR_H : 0) + 0.25;
    const w = clamp(e.r * 2.2, 0.9, 2.2) * T, h = Math.max(3, 0.16 * T);
    const bx = q[0] - w / 2, by = q[1] - uh * T;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    ctx.fillStyle = col;
    ctx.fillRect(bx, by, w * clamp(e.hp / e.maxHp, 0, 1), h);
  }

  levelBadge(ctx, x, y, lvl, mine) {
    const r = Math.max(7, this.T * 0.36);
    ctx.fillStyle = mine ? '#1f4fb0' : '#a8182a';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const an = (i / 6) * TAU + Math.PI / 6;
      ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    outlineText(ctx, String(lvl || 1), x, y + 0.5, r * 1.15, '#fff');
  }

  drawCardPops(ctx) {
    const T = this.T;
    for (const p of this.fx.parts) {
      if (p.k !== 'cardpop') continue;
      const q = this.toScreen(p.x, p.y);
      const f = p.t / p.life;
      const w = 1.9 * T, h = w * 1.24;
      ctx.globalAlpha = f > 0.7 ? (1 - f) / 0.3 : 1;
      const cv = cardArt(p.key, Math.round(w * this.dpr), Math.round(h * this.dpr));
      ctx.drawImage(cv, q[0] - w / 2, q[1] - h - 1.2 * T - f * 0.8 * T, w, h);
      ctx.globalAlpha = 1;
    }
  }

  // ---- card placement ----
  selectedKey(st) {
    const i = this.drag ? this.drag.slot : this.sel;
    return i >= 0 ? st.me.hand[i] : null;
  }

  drawPlacementZones(ctx, st) {
    const key = this.selectedKey(st);
    if (!key || (!this.drag && this.sel < 0)) return;
    const c = CARDS[key];
    if (c.type === 'spell' || c.anywhere) return;
    const T = this.T;
    // forbidden: the enemy half, except "pockets" where an enemy princess tower has fallen
    const enemyT = this.myTeam === 0 ? 1 : 0;
    const et = st.ents.filter((e) => e.kind === 'tower' && e.team === enemyT);
    const leftDown = !et.some((e) => e.lane === 0), rightDown = !et.some((e) => e.lane === 1);
    ctx.fillStyle = this.badSpot > 0 ? 'rgba(255,40,40,0.38)' : 'rgba(255,40,40,0.2)';
    const X = (x) => this.ox + x * T, Y = (ly) => this.oy + ly * T;
    ctx.fillRect(X(0), Y(0), AW * T, 10 * T);
    ctx.fillRect(X(leftDown ? 9 : 0), Y(10), (leftDown && rightDown ? 0 : leftDown || rightDown ? 9 : 18) * T, 5 * T);
    ctx.fillRect(X(0), Y(RIVER_TOP), AW * T, 2 * T);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(RIVER_BOT));
    ctx.lineTo(X(AW), Y(RIVER_BOT));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ghostPos(st) {
    if (!this.drag || !this.drag.over) return null;
    const [wx, wy] = this.toWorld(this.drag.x, this.drag.y - this.dragLift());
    const x = clamp(Math.round(wx * 2) / 2, 0.5, AW - 0.5), y = clamp(Math.round(wy * 2) / 2, 0.5, AH - 0.5);
    return [x, y];
  }

  // Lift the drop point above the finger so it isn't hidden under the thumb.
  dragLift() { return this.T * 1.2; }

  drawGhost(ctx, st) {
    const key = this.selectedKey(st);
    const g = this.ghostPos(st);
    if (!key || !g) return;
    const c = CARDS[key];
    const T = this.T;
    const ok = st.canPlace(key, g[0], g[1]);
    const q = this.toScreen(g[0], g[1]);
    ctx.save();
    if (c.type === 'spell') {
      const r = c.radius || 1;
      ctx.fillStyle = ok ? 'rgba(255,255,255,0.18)' : 'rgba(255,60,60,0.25)';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      if (c.spell === 'log') {
        const len = c.travel * T;
        ctx.fillRect(q[0] - c.halfW * T, q[1] - len, c.halfW * 2 * T, len);
        ctx.strokeRect(q[0] - c.halfW * T, q[1] - len, c.halfW * 2 * T, len);
      } else {
        ellipse(ctx, q[0], q[1], r * T, r * T);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      const u = UNITS[c.unit];
      const n = c.count || 1;
      const offs = formation(n);
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < n; i++) {
        const off = offs[i];
        const pq = this.toScreen(g[0] + off[0], g[1] + (this.myTeam === 0 ? off[1] : -off[1]));
        ctx.save();
        ctx.translate(pq[0], pq[1] - (u.air ? AIR_H * T : 0));
        ctx.scale(T * UNIT_SCALE, T * UNIT_SCALE);
        UNIT_ART[c.unit](ctx, { c: TEAM_COLORS[0], dir: 1, back: true, walk: 0, moving: false, t: this.t, atk: -1, id: i, aimX: 0, aimY: -1, attacking: false });
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (u.range >= 2 || u.building) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ellipse(ctx, q[0], q[1], (u.range + u.r) * T, (u.range + u.r) * T);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,70,70,0.95)';
      ctx.lineWidth = 2;
      ellipse(ctx, q[0], q[1], Math.max(0.5, u.r) * T, Math.max(0.5, u.r) * T * 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- HUD ----
  drawHud(ctx, st) {
    const W = this.W, T = this.T;
    // top: opponent name + timer
    const top = Math.max(this.oy - TOP_ROOM * T, 2);
    const nbw = Math.min(150, this.ox + 5.4 * T - 10);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, 6, top + 2, nbw, 34, 9);
    ctx.fill();
    ctx.save();
    roundRect(ctx, 6, top + 2, nbw - 4, 34, 9);
    ctx.clip();
    outlineText(ctx, st.foe.name, 14, top + 13, 12, '#ffb0a8', 'left');
    outlineText(ctx, st.foe.sub || '', 14, top + 27, 10, '#ffe082', 'left');
    ctx.restore();
    const tl = st.timeLeft;
    const tw = 92;
    // menu button
    const mb = this.menuBtn = { x: W - tw - 6 - 42, y: top + 2, w: 36, h: 36 };
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, mb.x, mb.y, mb.w, mb.h, 9);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) ctx.fillRect(mb.x + 9, mb.y + 10 + i * 7, 18, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, W - tw - 6, top + 2, tw, 38, 9);
    ctx.fill();
    outlineText(ctx, st.ot ? 'Overtime' : 'Time left', W - tw / 2 - 6, top + 12, 10, st.ot ? '#ffb74d' : '#ddd');
    outlineText(ctx, fmtTime(tl), W - tw / 2 - 6, top + 29, 17, tl <= 10 && !st.over ? '#ff6b6b' : '#fff');
    if (st.dbl) {
      ctx.fillStyle = '#c42be0';
      roundRect(ctx, W - tw - 6, top + 43, tw, 18, 7);
      ctx.fill();
      outlineText(ctx, st.ot ? 'x2 ELIXIR' : 'x2 ELIXIR', W - tw / 2 - 6, top + 52, 10, '#fff');
    }
    // crowns (right side, around the river)
    const cx = this.ox + AW * T - 0.9 * T;
    const mid = this.oy + RIVER_MID * T;
    this.crownRow(ctx, cx, mid - 2.4 * T, st.foe.crowns, false);
    this.crownRow(ctx, cx, mid + 2.4 * T, st.me.crowns, true);
    // messages
    let my = this.oy + 11 * T;
    for (const m of this.msgs) {
      const f = m.t / m.dur;
      const s = m.t < 0.15 ? easeOutBack(m.t / 0.15) : 1;
      ctx.globalAlpha = f > 0.8 ? (1 - f) / 0.2 : 1;
      let fs = Math.min(30, T * 1.4);
      ctx.font = `900 ${fs}px system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif`;
      const mw = ctx.measureText(m.text).width;
      if (mw > W - 24) fs *= (W - 24) / mw;
      outlineText(ctx, m.text, W / 2, my, fs * s, m.col);
      ctx.globalAlpha = 1;
      my += T * 1.6;
    }
    // emotes
    for (const e of this.emotes) {
      const mine = e.team === this.myTeam;
      const ex = W / 2 + (mine ? -3.2 : 3.2) * T, ey = this.oy + (mine ? 26.2 : 5.2) * T;
      const s = e.t < 0.2 ? easeOutBack(e.t / 0.2) : 1;
      ctx.globalAlpha = e.t > 2 ? (2.4 - e.t) / 0.4 : 1;
      ctx.fillStyle = '#fff';
      roundRect(ctx, ex - 26 * s, ey - 24 * s, 52 * s, 44 * s, 12);
      ctx.fill();
      ctx.strokeStyle = mine ? TEAM_COLORS[0].main : TEAM_COLORS[1].main;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = `${Math.round(28 * s)}px system-ui,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(EMOTES[e.i] || '?', ex, ey);
      ctx.globalAlpha = 1;
    }
    this.drawHand(ctx, st);
    if (st.tutorial && !this.drag) this.drawTutorial(ctx, st);
    if (st.stalled) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, W / 2 - 120, this.oy + 13 * T, 240, 44, 12);
      ctx.fill();
      outlineText(ctx, 'Waiting for opponent…', W / 2, this.oy + 13 * T + 22, 16, '#ffe082');
    }
    if (st.intro > 0) this.drawIntro(ctx, st);
  }

  crownRow(ctx, x, y, n, mine) {
    const T = this.T, s = Math.max(9, T * 0.55);
    for (let i = 0; i < 3; i++) {
      const cy = y + (mine ? i : -i) * s * 1.9;
      const on = i < n;
      ctx.save();
      ctx.translate(x, cy);
      ctx.globalAlpha = on ? 1 : 0.35;
      ctx.beginPath();
      ctx.moveTo(-s, s * 0.6);
      ctx.lineTo(-s, -s * 0.5);
      ctx.lineTo(-s * 0.5, 0);
      ctx.lineTo(0, -s * 0.8);
      ctx.lineTo(s * 0.5, 0);
      ctx.lineTo(s, -s * 0.5);
      ctx.lineTo(s, s * 0.6);
      ctx.closePath();
      ctx.fillStyle = on ? (mine ? '#5aa9ff' : '#ff6060') : '#222';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.restore();
    }
  }

  drawHand(ctx, st) {
    const W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, this.handTop, 0, H);
    g.addColorStop(0, '#2a3b5c');
    g.addColorStop(1, '#131c2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, this.handTop, W, this.handH);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, this.handTop, W, 2);
    const me = st.me;
    // next card
    const nr = this.nextRect;
    if (me.next) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(cardArt(me.next, Math.round(nr.w * this.dpr), Math.round(nr.h * this.dpr)), nr.x, nr.y, nr.w, nr.h);
      ctx.globalAlpha = 1;
    }
    outlineText(ctx, 'Next', nr.x + nr.w / 2, nr.y - 8, 11, '#cfd8dc');
    // hand
    for (let i = 0; i < 4; i++) {
      const r = this.cards[i];
      const key = me.hand[i];
      if (!key) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        roundRect(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.fill();
        continue;
      }
      const dragging = this.drag && this.drag.slot === i && this.drag.over;
      const lift = this.sel === i || (this.drag && this.drag.slot === i) ? 10 : 0;
      const pending = me.pending && me.pending.has(i);
      ctx.globalAlpha = dragging ? 0.35 : pending ? 0.5 : 1;
      ctx.drawImage(cardArt(key, Math.round(r.w * this.dpr), Math.round(r.h * this.dpr)), r.x, r.y - lift, r.w, r.h);
      ctx.globalAlpha = 1;
      const cost = CARDS[key].cost;
      if (me.elixir < cost) {
        const f = clamp(me.elixir / cost, 0, 1);
        ctx.fillStyle = 'rgba(10,10,20,0.62)';
        roundRect(ctx, r.x, r.y - lift, r.w, r.h * (1 - f), 8);
        ctx.fill();
      }
      if (lift) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        roundRect(ctx, r.x - 1, r.y - lift - 1, r.w + 2, r.h + 2, 9);
        ctx.stroke();
      }
    }
    // elixir bar
    const er = this.elixirRect;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, er.x, er.y, er.w, er.h, er.h / 2);
    ctx.fill();
    const el = clamp(me.elixir, 0, 10);
    const fw = (er.w - 4) * (el / 10);
    if (fw > 0) {
      const eg = ctx.createLinearGradient(0, er.y, 0, er.y + er.h);
      eg.addColorStop(0, '#f78cf2');
      eg.addColorStop(1, '#b01ad0');
      ctx.fillStyle = eg;
      roundRect(ctx, er.x + 2, er.y + 2, fw, er.h - 4, (er.h - 4) / 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < 10; i++) ctx.fillRect(er.x + 2 + ((er.w - 4) * i) / 10 - 0.5, er.y + 3, 1, er.h - 6);
    // elixir drop with the number
    const dx = er.x - 2, dy = er.y + er.h / 2;
    ctx.save();
    ctx.translate(dx, dy);
    const ds = er.h * 0.9;
    ctx.beginPath();
    ctx.moveTo(0, -ds);
    ctx.bezierCurveTo(ds * 0.7, -ds * 0.2, ds * 0.8, ds * 0.2, ds * 0.8, ds * 0.4);
    ctx.arc(0, ds * 0.4, ds * 0.8, 0, Math.PI);
    ctx.bezierCurveTo(-ds * 0.8, ds * 0.2, -ds * 0.7, -ds * 0.2, 0, -ds);
    ctx.fillStyle = '#d23cf0';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    outlineText(ctx, String(Math.floor(el)), 0, ds * 0.35, ds * 1.1, '#fff');
    ctx.restore();
    // emote button
    const b = this.emoteBtn;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    circle(ctx, b.x, b.y, b.r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '18px system-ui,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💬', b.x, b.y + 1);
    if (this.emoteOpen) {
      for (let i = 0; i < EMOTES.length; i++) {
        const p = this.emoteSlot(i);
        ctx.fillStyle = '#fff';
        circle(ctx, p.x, p.y, p.r);
        ctx.fill();
        ctx.strokeStyle = '#1f4fb0';
        ctx.stroke();
        ctx.font = `${Math.round(p.r * 1.2)}px system-ui,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.fillText(EMOTES[i], p.x, p.y + 1);
      }
    }
    // dragged card follows the finger while still over the hand
    if (this.drag && !this.drag.over) {
      const key = me.hand[this.drag.slot];
      const r = this.cards[this.drag.slot];
      if (key) ctx.drawImage(cardArt(key, Math.round(r.w * this.dpr), Math.round(r.h * this.dpr)), this.drag.x - r.w / 2, this.drag.y - r.h / 2, r.w, r.h);
    }
  }

  // First battle: a finger shows how to drag a card onto the arena.
  drawTutorial(ctx, st) {
    const i = st.me.hand.findIndex((k) => k && CARDS[k].type === 'troop' && CARDS[k].cost <= st.me.elixir);
    if (i < 0) return;
    const r = this.cards[i];
    const f = (this.t % 2.2) / 1.6;
    if (f > 1) return;
    const e = easeOut(f);
    const [tx, ty] = this.toScreen(this.flip ? 14.5 : 3.5, this.flip ? AH - 21 : 21);
    const x = lerp(r.x + r.w / 2, tx, e), y = lerp(r.y + r.h / 2, ty, e);
    ctx.globalAlpha = f < 0.1 ? f * 10 : f > 0.85 ? (1 - f) / 0.15 : 1;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    circle(ctx, tx, ty, this.T * 1.2);
    ctx.fill();
    ctx.font = `${Math.round(this.T * 2)}px system-ui,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('👆', x, y);
    ctx.globalAlpha = 1;
  }

  emoteSlot(i) {
    const b = this.emoteBtn;
    return { x: b.x + (i % 3) * 44 + 8, y: b.y - 50 - Math.floor(i / 3) * 44, r: 19 };
  }

  drawIntro(ctx, st) {
    const W = this.W, H = this.H;
    const f = st.intro;
    ctx.fillStyle = `rgba(5,10,25,${Math.min(0.6, f * 0.5)})`;
    ctx.fillRect(0, 0, W, H);
    const s = Math.min(1, f * 1.5);
    ctx.globalAlpha = s;
    outlineText(ctx, st.foe.name, W / 2, H * 0.3, 24, '#ff9a9a');
    outlineText(ctx, 'VS', W / 2, H * 0.4, 44, '#ffe082');
    outlineText(ctx, st.me.name, W / 2, H * 0.5, 24, '#8fd0ff');
    ctx.globalAlpha = 1;
  }

  // ---- input ----
  hitMenu(x, y) {
    const b = this.menuBtn;
    return !!b && x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4;
  }

  hitCard(x, y) {
    for (let i = 0; i < 4; i++) {
      const r = this.cards[i];
      if (x >= r.x - 3 && x <= r.x + r.w + 3 && y >= r.y - 12 && y <= r.y + r.h + 6) return i;
    }
    return -1;
  }

  pointer(type, x, y, st) {
    if (type === 'down') {
      if (this.emoteOpen) {
        for (let i = 0; i < EMOTES.length; i++) {
          const p = this.emoteSlot(i);
          if (Math.hypot(x - p.x, y - p.y) < p.r + 4) { this.emoteOpen = false; this.scene.sendEmote(i); return; }
        }
        this.emoteOpen = false;
      }
      const b = this.emoteBtn;
      if (Math.hypot(x - b.x, y - b.y) < b.r + 6) { this.emoteOpen = true; Sound.play('click'); return; }
      const i = this.hitCard(x, y);
      if (i >= 0 && st.me.hand[i]) {
        this.drag = { slot: i, x, y, sx: x, sy: y, over: false, moved: false, wasSel: this.sel === i };
        this.sel = i;
        Sound.play('click');
        return;
      }
      if (y < this.handTop && this.sel >= 0 && st.me.hand[this.sel]) {
        // tap-to-place with a selected card
        this.drag = { slot: this.sel, x, y: y + this.dragLift(), sx: x, sy: y, over: true, moved: true, tap: true };
        this.release(st);
      }
      return;
    }
    if (!this.drag) return;
    if (type === 'move') {
      this.drag.x = x;
      this.drag.y = y;
      if (Math.hypot(x - this.drag.sx, y - this.drag.sy) > 10) this.drag.moved = true;
      this.drag.over = y < this.handTop - 4;
      return;
    }
    if (type === 'up' || type === 'cancel') {
      if (type === 'cancel') { this.drag = null; return; }
      if (this.drag.over) this.release(st);
      else {
        if (!this.drag.moved && this.drag.wasSel) this.sel = -1;
        this.drag = null;
      }
    }
  }

  release(st) {
    const d = this.drag;
    this.drag = null;
    const key = st.me.hand[d.slot];
    if (!key) return;
    this.drag = d;
    const g = this.ghostPos(st);
    this.drag = null;
    if (!g) return;
    if (st.me.elixir < CARDS[key].cost) {
      this.message('Not enough elixir', '#ff9cf2', 1.1);
      Sound.play('error');
      return;
    }
    if (!st.canPlace(key, g[0], g[1])) {
      this.badSpot = 0.6;
      Sound.play('error');
      return;
    }
    if (this.scene.tryPlay(d.slot, g[0], g[1])) this.sel = -1;
  }
}
