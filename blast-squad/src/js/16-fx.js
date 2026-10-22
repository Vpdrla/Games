// ---------- FX: particles, damage numbers, screen shake, banners and per-brawler cues ----------
// Purely cosmetic: fed by sim events (FX.onEvent) and drawn by View. Particles live in world tiles
// with a height z (tiles); View passes the world -> screen mapping when drawing. A fixed pool of
// particle objects is reused, so nothing is allocated per frame.
const FX = (() => {
  const MAXP = 700;
  const pool = [];
  for (let i = 0; i < MAXP; i++) {
    pool.push({ k: '', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, t: 0, life: 1, r: 0, r1: 0, col: '#fff', col2: '#fff', str: '', size: 1, rot: 0, vr: 0, x2: 0, y2: 0, ang: 0, w: 0, tgt: -1, n: 0, pts: new Float32Array(20) });
  }
  const live = [];
  const rng = new RNG(0x51eed);
  const R = (a, b) => a + rng.next() * (b - a);
  // events already handled (the match may hand the same event to View.onEvent and FX.onEvent)
  const seen = new Array(64).fill(null);
  let seenI = 0;
  // shot id -> visual key, so a SHOT_END can show the right impact after the shot is gone
  const memo = [];
  for (let i = 0; i < 160; i++) memo.push({ id: -1, pk: '', lob: false, sup: false, slot: -1 });
  let memoI = 0;
  const cues = [];
  for (let i = 0; i < 12; i++) cues.push({ hit: 0, atk: 0, heal: 0, sup: 0, pin: -1, pinT: 0, emote: -1, emoteT: 0, ready: 0 });

  const FXO = {
    low: false,
    local: -1, // local slot (View sets it every frame)
    sd: null, // Showdown colouring (View sets it every frame)
    shake: 0, // tiles
    hurt: 0, // red screen flash (s)
    banner: null,
    feed: [], // kill feed: { kb, kn, ks, vb, vn, vs, t }
    cues,
    count: () => live.length,

    add(k, x, y, z, life) {
      if (live.length >= (this.low ? MAXP * 0.45 : MAXP)) return null;
      const o = pool[live.length];
      if (!o) return null;
      o.k = k; o.x = x; o.y = y; o.z = z || 0; o.t = 0; o.life = life;
      o.vx = 0; o.vy = 0; o.vz = 0; o.g = 0; o.r = 0.1; o.r1 = 0; o.col = '#fff'; o.col2 = '#fff';
      o.str = ''; o.size = 1; o.rot = 0; o.vr = 0; o.w = 0.1; o.tgt = -1; o.n = 0;
      live.push(o);
      return o;
    },

    clear() {
      live.length = 0;
      this.shake = 0;
      this.hurt = 0;
      this.banner = null;
      this.feed.length = 0;
      for (const c of cues) { c.hit = c.atk = c.heal = c.sup = c.pinT = c.emoteT = c.ready = 0; c.pin = c.emote = -1; }
      for (const m of memo) m.id = -1;
      seen.fill(null);
    },

    update(dt) {
      let n = 0;
      for (let i = 0; i < live.length; i++) {
        const o = live[i];
        o.t += dt;
        if (o.t >= o.life) continue;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (o.g || o.vz) {
          o.z += o.vz * dt;
          o.vz -= o.g * dt;
          if (o.z < 0 && o.k === 'debris') { o.z = 0; o.vz = -o.vz * 0.35; o.vx *= 0.6; o.vy *= 0.6; o.vr *= 0.6; }
        }
        if (o.k === 'spark') { const f = 1 - Math.min(1, 4 * dt); o.vx *= f; o.vy *= f; }
        o.rot += o.vr * dt;
        // keep the pool packed: live[0..n) are the active particles
        if (i !== n) { const tmp = live[n]; live[n] = o; live[i] = tmp; pool[n] = o; pool[i] = tmp; }
        n++;
      }
      live.length = n;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * Math.max(0.6, this.shake * 6));
      if (this.hurt > 0) this.hurt -= dt;
      if (this.banner) { this.banner.t += dt; if (this.banner.t >= this.banner.life) this.banner = null; }
      for (const c of cues) {
        if (c.hit > 0) c.hit -= dt;
        if (c.atk > 0) c.atk -= dt;
        if (c.heal > 0) c.heal -= dt;
        if (c.ready > 0) c.ready -= dt;
        if (c.pinT > 0) c.pinT -= dt;
        if (c.emoteT > 0) c.emoteT -= dt;
      }
      for (let i = this.feed.length - 1; i >= 0; i--) { this.feed[i].t += dt; if (this.feed[i].t > 4.5) this.feed.splice(i, 1); }
    },

    // ---- emitters (world tiles) ----
    sparks(x, y, z, n, col, spd) {
      if (this.low) n = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const o = this.add('spark', x, y, z, R(0.18, 0.4));
        if (!o) return;
        const a = R(0, TAU), s = R(0.4, 1) * (spd || 4);
        o.vx = Math.cos(a) * s; o.vy = Math.sin(a) * s * 0.75; o.vz = R(1, 4); o.g = 14;
        o.col = col; o.r = R(0.03, 0.06);
      }
    },
    puff(x, y, z, r, col, life, n) {
      n = n || 1;
      if (this.low) n = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const o = this.add('puff', x + (n > 1 ? R(-r, r) * 0.4 : 0), y + (n > 1 ? R(-r, r) * 0.3 : 0), z, (life || 0.45) * R(0.8, 1.2));
        if (!o) return;
        o.r = r * 0.35; o.r1 = r * (n > 1 ? R(0.6, 1) : 1); o.col = col;
        if (n > 1) { const a = R(0, TAU); o.vx = Math.cos(a) * r; o.vy = Math.sin(a) * r * 0.6; o.vz = R(0.2, 0.8); }
      }
    },
    ring(x, y, r, col, life, w) {
      const o = this.add('ring', x, y, 0, life || 0.35);
      if (!o) return;
      o.r = r * 0.2; o.r1 = r; o.col = col; o.w = w || 0.1;
    },
    flash(x, y, z, r, col, life) {
      const o = this.add('flash', x, y, z, life || 0.2);
      if (!o) return;
      o.r = r; o.col = col;
    },
    debris(x, y, n, cols) {
      if (this.low) n = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const o = this.add('debris', x + R(-0.3, 0.3), y + R(-0.3, 0.3), R(0.2, 0.7), R(0.7, 1.2));
        if (!o) return;
        const a = R(0, TAU), s = R(0.5, 3);
        o.vx = Math.cos(a) * s; o.vy = Math.sin(a) * s * 0.7; o.vz = R(2, 6); o.g = 22;
        o.col = cols[i % cols.length]; o.r = R(0.07, 0.15); o.rot = R(0, TAU); o.vr = R(-10, 10);
      }
    },
    stars(x, y, z, n, col, spread) {
      if (this.low) n = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const o = this.add('star', x + R(-1, 1) * (spread || 0.4), y + R(-1, 1) * (spread || 0.4) * 0.6, z + R(0, 0.6), R(0.35, 0.7));
        if (!o) return;
        o.vz = R(0.5, 1.5); o.col = col; o.r = R(0.08, 0.15);
      }
    },
    beam(x, y, x2, y2, z, w, col, life) {
      const o = this.add('beam', x, y, z, life || 0.18);
      if (!o) return;
      o.x2 = x2; o.y2 = y2; o.w = w; o.col = col;
    },
    bolt(x, y, x2, y2, z, col, life) {
      const o = this.add('bolt', x, y, z, life || 0.2);
      if (!o) return;
      o.x2 = x2; o.y2 = y2; o.col = col;
      const nx = -(y2 - y), ny = x2 - x, l = Math.hypot(nx, ny) || 1;
      for (let i = 0; i < 10; i++) {
        const u = i / 9, off = i === 0 || i === 9 ? 0 : R(-1, 1) * Math.min(0.35, l * 0.08);
        o.pts[i * 2] = lerp(x, x2, u) + (nx / l) * off;
        o.pts[i * 2 + 1] = lerp(y, y2, u) + (ny / l) * off;
      }
    },
    arc(x, y, ang, r, spread, col, life) {
      const o = this.add('arc', x, y, 0.4, life || 0.18);
      if (!o) return;
      o.ang = ang; o.r = r; o.w = spread; o.col = col;
    },
    column(x, y, col) {
      const o = this.add('column', x, y, 0, 0.7);
      if (!o) return;
      o.col = col;
    },
    // Damage / heal number above (x, y). Hits on the same target within a moment are summed, like
    // a shotgun's pellets in the original.
    number(x, y, val, col, size, tgt) {
      if (tgt >= 0) {
        for (const o of live) {
          if (o.k === 'text' && o.tgt === tgt && o.col === col && o.t < 0.14) { o.n += val; o.str = String(Math.round(o.n)); o.t = Math.min(o.t, 0.05); return; }
        }
      }
      const o = this.add('text', x + R(-0.15, 0.15), y, 1.35, 0.9);
      if (!o) return;
      o.vz = 1.6; o.g = 1.2; o.n = val; o.str = String(Math.round(val)); o.col = col; o.size = size || 1; o.tgt = tgt;
    },
    label(x, y, str, col, size) {
      const o = this.add('text', x, y, 1.5, 1.0);
      if (!o) return;
      o.vz = 1.2; o.g = 0.8; o.str = str; o.col = col; o.size = size || 0.9; o.tgt = -1;
    },
    explode(x, y, r, col, near) {
      this.flash(x, y, 0.3, r * 1.6, '#fff3c0', 0.18);
      this.flash(x, y, 0.3, r * 2.2, col || '#ff8a1a', 0.35);
      this.ring(x, y, r, col || '#ffb040', 0.32, 0.14);
      this.puff(x, y, 0.3, r * 0.8, 'rgba(90,80,80,0.55)', 0.7, 5);
      this.sparks(x, y, 0.4, 12, '#ffd23f', 6);
      if (near < 5) this.shake = Math.max(this.shake, 0.18 * (1 - near / 5) * Math.min(1.6, r));
    },
    say(text, sub, col, life) {
      this.banner = { text, sub: sub || '', col: col || '#fff', t: 0, life: life || 2 };
    },

    // ---- sim events ----
    onEvent(ev, state) {
      for (let i = 0; i < 64; i++) if (seen[i] === ev) return;
      seen[seenI] = ev;
      seenI = (seenI + 1) & 63;
      const bs = state.brawlers || [];
      const me = bs[this.local];
      const myTeam = me ? me.team : 0;
      const sd = isSd(state);
      const side = (b) => (b && b.team === myTeam && (!sd || b.slot === this.local) ? 0 : 1);
      const near = (x, y) => (me && me.alive ? Math.hypot(me.x - x, me.y - y) : 99);
      const seenBy = (b) => !b || b.team === myTeam || b.vis === undefined || ((b.vis >> myTeam) & 1);
      switch (ev[0]) {
        case EV.FIRE: {
          const b = bs[ev[1]];
          if (!b) break;
          const c = cues[ev[1]];
          if (c) c.atk = 0.16;
          if (!seenBy(b)) break;
          const act = ev[2], ang = ev[5], col = Art.color(b.bk), x = ev[3], y = ev[4];
          const mx = x + Math.cos(ang) * 0.6, my = y + Math.sin(ang) * 0.6;
          const s = specOf(b, act), prim = s ? s.t : 'shot';
          if (prim === 'shot' || prim === 'beam' || prim === 'lob') {
            this.flash(mx, my, 0.45, act === 2 ? 0.75 : 0.45, act === 2 ? '#ffd23f' : '#fff3b0', 0.1);
            if (prim !== 'lob' && !this.low) this.sparks(mx, my, 0.45, 2, '#fff3b0', 2.5);
          } else if (prim === 'arc') this.arc(x, y, ang, (s.range || 2) * 0.8, (s.half || 0.6) * 2, col, 0.16);
          else if (prim === 'pulse') {
            // gadget pulses: a ring the size of the effect, coloured by what it does
            const pc = s.heal ? '#5dff7a' : s.stun ? '#ffe14a' : s.slow ? '#bff4ff' : s.kb ? '#ffffff' : col;
            this.ring(x, y, s.r || 2, pc, 0.4, 0.16);
            this.ring(x, y, (s.r || 2) * 0.6, pc, 0.3, 0.1);
            this.flash(x, y, 0.4, (s.r || 2) * 0.8, pc, 0.25);
            this.stars(x, y, 0.3, 8, pc, (s.r || 2) * 0.6);
            if (s.stun || s.kb) this.sparks(x, y, 0.4, 10, pc, 6);
          } else if (prim === 'dash' || prim === 'leap') {
            this.puff(x, y, 0.1, 0.7, 'rgba(240,230,210,0.75)', 0.4, 5);
            if (prim === 'leap') this.ring(x, y, 1.0, '#ffffff', 0.3, 0.08);
          } else if (prim === 'heal') {
            this.stars(x, y, 0.5, 10, '#5dff7a', 0.5);
            this.ring(x, y, 0.9, '#5dff7a', 0.4, 0.1);
          } else if (prim === 'buff' && s.what === 'ammo') {
            this.stars(x, y, 0.8, 8, '#ffb02e', 0.4);
            if (ev[1] === this.local) this.label(x, y, 'Reload!', '#ffb02e', 0.85);
          } else if (prim === 'buff' && (s.what === 'nextStun' || s.what === 'nextSlow' || s.what === 'petStun' || s.what === 'deployRate')) {
            this.stars(x, y, 0.8, 8, '#ffe14a', 0.4);
            this.ring(x, y, 0.8, '#ffe14a', 0.3, 0.08);
          }
          if (act === 2) this.ring(x, y, 1.2, '#ffd23f', 0.3, 0.08);
          break;
        }
        case EV.SPAWN: {
          if (ev[2] === K.SHOT) {
            const s = findId(state.shots, ev[1]);
            if (s) { const m = memo[memoI]; memoI = (memoI + 1) % memo.length; m.id = s.id; m.pk = s.pk; m.lob = !!s.lob; m.sup = !!s.sup; m.slot = s.owner; }
            // beams are drawn by the view from the beam shot; light up where they end
            if (s && s.beam > 0) {
              const st = Art.shotStyle(s.pk, s.sup);
              this.flash(s.x, s.y, 0.45, 0.7, st[2], 0.22);
              this.sparks(s.x, s.y, 0.45, 4, st[1], 4);
            }
          } else if (ev[2] === K.DEPLOY) {
            const d = findId(state.deploys, ev[1]);
            if (d) { this.puff(d.x, d.y, 0.2, 0.6, 'rgba(255,255,255,0.8)', 0.4, 4); this.ring(d.x, d.y, 0.9, '#ffffff', 0.3, 0.06); }
          } else if (ev[2] === K.AREA) {
            const a = findId(state.areas, ev[1]);
            if (a) this.ring(a.x, a.y, a.r, '#ffffff', 0.3, 0.06);
          }
          break;
        }
        case EV.SHOT_END: {
          let m = null;
          for (const q of memo) if (q.id === ev[1]) { m = q; break; }
          const x = ev[2], y = ev[3];
          const st = m ? Art.shotStyle(m.pk, m.sup) : null;
          const kind = st ? st[0] : '';
          if (kind === 'bomb' || kind === 'barrel' || kind === 'grenade') this.explode(x, y, kind === 'barrel' ? 1.5 : 0.9, '#ff8a1a', near(x, y));
          else if (kind === 'bottle') { this.puff(x, y, 0.1, 0.8, st[2], 0.4, 3); this.sparks(x, y, 0.2, 8, '#bfffd0', 4); this.debris(x, y, 4, ['#c8ffd8', st[1]]); }
          else if (kind === 'spikebag' || kind === 'cactus') { this.sparks(x, y, 0.3, 8, '#cfffb0', 5); this.puff(x, y, 0.2, 0.5, 'rgba(220,200,150,0.6)', 0.35); }
          else if (kind === 'storm') { this.ring(x, y, 2, '#9ae8ff', 0.4, 0.1); this.flash(x, y, 0.3, 1.5, '#3ad8ff', 0.3); }
          else if (kind === 'crate' || kind === 'pawball') this.puff(x, y, 0.1, 0.7, 'rgba(255,255,255,0.7)', 0.4, 4);
          else if (ev[4]) { this.puff(x, y, 0.4, 0.3, 'rgba(255,240,220,0.8)', 0.25); this.sparks(x, y, 0.4, 3, st ? st[2] : '#ffd23f', 3); }
          if (m) m.id = -1;
          break;
        }
        case EV.HIT: {
          const id = ev[1], dmg = ev[2], x = ev[3], y = ev[4], src = ev[5], crit = ev[6];
          let tb = null;
          for (const b of bs) if (b && b.id === id) { tb = b; break; }
          const sb = bs[src];
          this.sparks(x, y, 0.5, 5, sb ? Art.color(sb.bk) : '#fff', 3.5);
          this.flash(x, y, 0.5, 0.35, '#ffffff', 0.08);
          if (tb) {
            const c = cues[tb.slot];
            if (c) c.hit = 0.1;
            if (tb.slot === this.local) {
              this.number(tb.x, tb.y, dmg, '#ff4a4a', 1.05, id);
              this.hurt = 0.28;
              this.shake = Math.max(this.shake, 0.06 + Math.min(0.14, (dmg / (tb.maxHp || 4000)) * 0.6));
            } else if (src === this.local && seenBy(tb)) this.number(tb.x, tb.y, dmg, crit ? '#ffd23f' : '#ffffff', crit ? 1.2 : 1.05, id);
          } else if (src === this.local) this.number(x, y, dmg, '#ffffff', 0.85, id);
          break;
        }
        case EV.HEAL: {
          const b = bs[ev[1]];
          if (!b) break;
          const c = cues[ev[1]];
          if (c) c.heal = 0.4;
          if (side(b) === 0 && ev[2] >= 10) this.number(b.x, b.y, ev[2], '#5dff7a', 0.9, b.id + 100000);
          if (seenBy(b)) for (let i = 0; i < 2; i++) { const o = this.add('plus', b.x + R(-0.35, 0.35), b.y, R(0.3, 0.9), 0.6); if (o) { o.vz = 1.2; o.col = '#5dff7a'; o.r = 0.09; } }
          break;
        }
        case EV.KILL: {
          const v = bs[ev[1]], k = bs[ev[2]];
          const x = ev[3], y = ev[4];
          const col = v ? (side(v) === 0 ? '#3d9bff' : '#ff4a4a') : '#fff';
          this.puff(x, y, 0.4, 0.9, 'rgba(255,255,255,0.85)', 0.55, 7);
          this.ring(x, y, 1.3, col, 0.4, 0.12);
          this.sparks(x, y, 0.5, 14, v ? Art.color(v.bk) : '#fff', 5);
          const o = this.add('skull', x, y, 0.8, 1.1);
          if (o) { o.vz = 1.4; o.r = 0.5; }
          if (near(x, y) < 4) this.shake = Math.max(this.shake, 0.12);
          if (v) {
            this.feed.push({ kb: k ? k.bk : '', kn: k ? k.name || 'P' + k.slot : 'Poison', ks: k ? side(k) : 2, vb: v.bk, vn: v.name || 'P' + v.slot, vs: side(v), t: 0, me: v.slot === this.local || (k && k.slot === this.local) });
            if (this.feed.length > 4) this.feed.shift();
          }
          break;
        }
        case EV.RESPAWN: {
          const b = bs[ev[1]];
          const col = b ? (side(b) === 0 ? '#7ac8ff' : '#ff8a8a') : '#fff';
          this.column(ev[2], ev[3], col);
          this.ring(ev[2], ev[3], 1.2, col, 0.5, 0.12);
          this.stars(ev[2], ev[3], 0.3, 8, '#ffffff', 0.5);
          break;
        }
        case EV.PICKUP: {
          const x = ev[4], y = ev[5], kind = ev[2];
          const col = kind === PICK.GEM ? '#d886ff' : kind === PICK.CUBE ? '#7aff6a' : '#ffd23f';
          this.stars(x, y, 0.3, 6, col, 0.3);
          this.flash(x, y, 0.4, 0.7, col, 0.25);
          if (ev[1] === this.local) this.label(x, y, '+' + ev[3], col, 0.95);
          break;
        }
        case EV.DROP:
          this.puff(ev[3], ev[4], 0.2, 0.5, 'rgba(255,255,255,0.7)', 0.3, 3);
          this.stars(ev[3], ev[4], 0.2, 4, ev[1] === PICK.GEM ? '#d886ff' : ev[1] === PICK.CUBE ? '#7aff6a' : '#ffd23f', 0.4);
          break;
        case EV.GOAL: {
          const mine = ev[1] === myTeam;
          this.say('GOAL!', mine ? 'Your team scored' : 'The enemy scored', mine ? '#5ab4ff' : '#ff5a5a', 2.2);
          const s = bs[ev[2]];
          if (s) for (let i = 0; i < (this.low ? 12 : 30); i++) {
            const o = this.add('confetti', s.x + R(-2, 2), s.y + R(-1.5, 1.5), R(1.5, 3), R(1.2, 2));
            if (!o) break;
            o.vz = R(0, 2); o.g = 3; o.vx = R(-1, 1); o.col = i % 3 ? (mine ? '#5ab4ff' : '#ff5a5a') : '#ffd23f'; o.rot = R(0, TAU); o.vr = R(-12, 12);
          }
          break;
        }
        case EV.TILE: {
          const m = state.map;
          if (!m) break;
          const x = (ev[1] % m.w) + 0.5, y = Math.floor(ev[1] / m.w) + 0.5;
          const env = typeof View !== 'undefined' && View.layer ? View.layer.env : null;
          const cols = env ? [env.wall[0], env.wall[1], env.wall[2]] : ['#d99a62', '#a8653a', '#7c4424'];
          this.debris(x, y, 10, cols);
          this.puff(x, y, 0.3, 0.9, 'rgba(230,210,180,0.7)', 0.6, 5);
          if (typeof View !== 'undefined' && View.tileChanged) View.tileChanged(ev[1]);
          break;
        }
        case EV.SUPER_READY: {
          const b = bs[ev[1]];
          const c = cues[ev[1]];
          if (c) c.ready = 0.6;
          if (b && b.slot === this.local) { this.ring(b.x, b.y, 1.4, '#ffd23f', 0.5, 0.14); this.stars(b.x, b.y, 0.6, 10, '#ffd23f', 0.5); }
          break;
        }
        case EV.PIN: { const c = cues[ev[1]]; if (c) { c.pin = ev[2]; c.pinT = 2.6; } break; }
        case EV.EMOTE: { const c = cues[ev[1]]; if (c) { c.emote = ev[2]; c.emoteT = 2.2; } break; }
        case EV.ROUND: {
          const w = ev[1];
          if (w < 0) this.say('DRAW', 'Round ' + ev[2], '#ffffff', 2.4);
          else this.say(w === myTeam ? 'ROUND WON!' : 'ROUND LOST', 'Round ' + ev[2], w === myTeam ? '#5ab4ff' : '#ff5a5a', 2.4);
          break;
        }
        case EV.DESPAWN:
          if (ev[2] === K.DEPLOY) {
            const d = findId(state.deploys, ev[1]);
            if (d) { this.puff(d.x, d.y, 0.3, 0.7, 'rgba(255,255,255,0.8)', 0.45, 5); this.debris(d.x, d.y, 5, ['#7a7f92', '#ff9a2e']); }
          }
          break;
        case EV.BALL: {
          const ball = state.ball;
          if (!ball) break;
          if (ev[1] === 2 || ev[1] === 3) { this.ring(ball.x, ball.y, 0.8, '#ffffff', 0.25, 0.08); this.puff(ball.x, ball.y, 0.1, 0.4, 'rgba(255,255,255,0.7)', 0.3, 3); }
          break;
        }
        case EV.STATUS: {
          const b = bs[ev[1]];
          if (!b || !seenBy(b)) break;
          const what = ev[2];
          if (what === 1) this.stars(b.x, b.y, 1.2, 6, '#ffd23f', 0.3);
          else if (what === 2) this.stars(b.x, b.y, 0.2, 6, '#bff4ff', 0.4);
          else if (what === 3) this.puff(b.x, b.y, 0.05, 0.4, 'rgba(230,210,180,0.7)', 0.35, 3);
          else if (what === 4) this.puff(b.x, b.y, 0.5, 0.8, 'rgba(160,130,220,0.7)', 0.5, 6);
          else if (what === 5) this.ring(b.x, b.y, 0.9, '#7ab8ff', 0.4, 0.1);
          else if (what === 6) this.ring(b.x, b.y, 1.0, '#7affb0', 0.35, 0.08);
          break;
        }
        case EV.COUNTDOWN:
          if (ev[1] >= 0) this.say(ev[1] === myTeam ? 'Hold the gems!' : 'Stop them!', ev[1] === myTeam ? 'Your team has the most gems' : 'The enemy team has the most gems', ev[1] === myTeam ? '#5ab4ff' : '#ff5a5a', 1.8);
          else this.say('Countdown stopped', '', '#ffffff', 1.4);
          break;
        case EV.POISON:
          this.say('Poison is closing in!', '', '#7aff6a', 2);
          break;
      }
    },

    // ---- drawing (V: { ox, oy, k, T, dpr } world -> screen: sx = ox + x * k, sy = oy + y * k) ----
    draw(ctx, V) {
      const T = V.T;
      for (let i = 0; i < live.length; i++) {
        const o = live[i];
        if (o.k === 'text' || o.k === 'skull') continue;
        const u = o.t / o.life;
        const sx = V.ox + o.x * V.k, sy = V.oy + o.y * V.k - o.z * T;
        switch (o.k) {
          case 'spark':
            ctx.globalAlpha = 1 - u;
            ctx.fillStyle = o.col;
            ctx.fillRect(sx - o.r * T, sy - o.r * T, o.r * T * 2, o.r * T * 2);
            break;
          case 'puff': {
            ctx.globalAlpha = (1 - u) * 0.7;
            ctx.fillStyle = o.col;
            const r = lerp(o.r, o.r1, easeOut(u)) * T;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, TAU);
            ctx.fill();
            break;
          }
          case 'ring': {
            ctx.globalAlpha = 1 - u;
            ctx.strokeStyle = o.col;
            ctx.lineWidth = Math.max(1, o.w * T * (1 - u * 0.6));
            const r = lerp(o.r, o.r1, easeOut(u)) * T;
            ctx.beginPath();
            ctx.ellipse(sx, sy, r, r * 0.78, 0, 0, TAU);
            ctx.stroke();
            break;
          }
          case 'flash': {
            ctx.globalAlpha = (1 - u) * 0.9;
            const r = o.r * T * (0.7 + u * 0.5);
            ctx.drawImage(Art.glow(o.col, 32), sx - r, sy - r, r * 2, r * 2);
            break;
          }
          case 'debris':
            ctx.globalAlpha = u > 0.8 ? (1 - u) * 5 : 1;
            ctx.fillStyle = o.col;
            ctx.setTransform(Math.cos(o.rot), Math.sin(o.rot), -Math.sin(o.rot), Math.cos(o.rot), sx, sy);
            ctx.fillRect(-o.r * T, -o.r * T * 0.7, o.r * T * 2, o.r * T * 1.4);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(-o.r * T, -o.r * T * 0.7, o.r * T * 2, o.r * T * 1.4);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            break;
          case 'star': {
            ctx.globalAlpha = 1 - u;
            const r = o.r * T * (u < 0.3 ? u / 0.3 : 1);
            ctx.fillStyle = o.col;
            ctx.beginPath();
            ctx.moveTo(sx, sy - r * 2);
            ctx.quadraticCurveTo(sx, sy, sx + r * 2, sy);
            ctx.quadraticCurveTo(sx, sy, sx, sy + r * 2);
            ctx.quadraticCurveTo(sx, sy, sx - r * 2, sy);
            ctx.quadraticCurveTo(sx, sy, sx, sy - r * 2);
            ctx.fill();
            break;
          }
          case 'plus': {
            ctx.globalAlpha = 1 - u;
            const r = o.r * T;
            ctx.fillStyle = o.col;
            ctx.fillRect(sx - r, sy - r * 0.35, r * 2, r * 0.7);
            ctx.fillRect(sx - r * 0.35, sy - r, r * 0.7, r * 2);
            break;
          }
          case 'beam': case 'bolt': {
            const ex = V.ox + o.x2 * V.k, ey = V.oy + o.y2 * V.k - o.z * T;
            ctx.globalAlpha = 1 - u;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            if (o.k === 'beam') { ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); } else {
              for (let j = 0; j < 10; j++) {
                const px = V.ox + o.pts[j * 2] * V.k, py = V.oy + o.pts[j * 2 + 1] * V.k - o.z * T;
                if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
              }
            }
            if (o.k === 'beam') {
              ctx.strokeStyle = o.col;
              ctx.globalAlpha = (1 - u) * 0.55;
              ctx.lineWidth = o.w * T * 2.2;
              ctx.stroke();
              ctx.globalAlpha = 1 - u;
              ctx.lineWidth = o.w * T;
            } else ctx.lineWidth = Math.max(1, T * 0.05);
            ctx.strokeStyle = o.k === 'beam' ? '#ffffff' : o.col;
            ctx.stroke();
            break;
          }
          case 'arc': {
            ctx.globalAlpha = 1 - u;
            const a = V.k < 0 ? o.ang + Math.PI : o.ang;
            const r = o.r * T * (0.6 + 0.4 * easeOut(u));
            ctx.beginPath();
            ctx.arc(sx, sy, r, a - o.w / 2, a + o.w / 2);
            ctx.arc(sx, sy, r * 0.65, a + o.w / 2, a - o.w / 2, true);
            ctx.closePath();
            ctx.fillStyle = rgba(o.col.length === 7 ? o.col : '#ffffff', 0.6);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1, T * 0.04);
            ctx.stroke();
            break;
          }
          case 'column': {
            ctx.globalAlpha = (1 - u) * 0.8;
            const w = T * 0.9 * (1 - u * 0.5), h = T * 3.5;
            ctx.drawImage(Art.glow(o.col, 32), sx - w, sy - h, w * 2, h + T * 0.4);
            break;
          }
          case 'confetti':
            ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
            ctx.fillStyle = o.col;
            ctx.setTransform(Math.cos(o.rot), Math.sin(o.rot), -Math.sin(o.rot), Math.cos(o.rot), sx, sy);
            ctx.fillRect(-T * 0.08, -T * 0.04, T * 0.16, T * 0.08);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            break;
        }
      }
      ctx.globalAlpha = 1;
    },

    // Floating numbers and skulls, drawn above everything in the world.
    drawTexts(ctx, V) {
      const T = V.T;
      for (let i = 0; i < live.length; i++) {
        const o = live[i];
        if (o.k !== 'text' && o.k !== 'skull') continue;
        const u = o.t / o.life;
        const sx = V.ox + o.x * V.k, sy = V.oy + o.y * V.k - o.z * T;
        ctx.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
        if (o.k === 'skull') {
          const ic = Art.icon('skull', T * 0.6);
          ctx.drawImage(ic, sx - ic.width / 2, sy - ic.height / 2);
          continue;
        }
        const pop = u < 0.12 ? 1 + (0.12 - u) * 4 : 1;
        outlineText(ctx, o.str, sx, sy, Math.max(11 * V.dpr, T * 0.52) * o.size * pop, o.col);
      }
      ctx.globalAlpha = 1;
    },
  };

  // Showdown colours everyone but you red. The view sets FX.sd every frame; without a view, guess
  // from the state (the sim keeps its mode key in modeKey).
  function isSd(state) {
    if (FXO.sd != null) return FXO.sd;
    if (state.modeKey) return state.modeKey === 'sd';
    if (typeof state.mode === 'string') return state.mode === 'sd';
    return !!(state.brawlers && state.brawlers.length > 6);
  }
  function findId(arr, id) {
    if (!arr) return null;
    for (const e of arr) if (e && e.id === id) return e;
    return null;
  }
  // The primitive spec behind an action (the sim's kit when present, else the data table).
  function specOf(b, act) {
    if (b.kit) return act === 2 ? b.kit.sup : act === 3 ? b.kit.gad : b.kit.atk;
    const D = typeof BRAWLERS !== 'undefined' && BRAWLERS[b.bk];
    if (!D) return null;
    return act === 2 ? D.sup : act === 3 ? D.gadgets && D.gadgets[Math.max(0, b.gadget | 0)] : D.atk;
  }
  return FXO;
})();
