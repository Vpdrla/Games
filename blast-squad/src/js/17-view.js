// ---------- View: camera, world rendering (3/4 view, depth sorted), labels and the battle HUD ----------
// Draws a Sim (or the guest's mirror with the same entity shapes) in device pixels with an identity
// transform. World units are tiles; one tile is T device pixels and the camera shows CAM_H tiles of
// height. Team 1 sees the map turned 180 degrees in 3v3 modes (flip), so its own goal is at the bottom.
//   View.resize(w, h, dpr) -> dpr used (capped at 2); the canvas should be round(w * dpr) x round(h * dpr)
//   View.draw(ctx, state, localSlot, alpha, opts)   opts: { dt, safe: {l, r, t, b} (CSS px), hud: bool }
//   View.onEvent(ev, state)          sim events (forwards to FX.onEvent; the tile layer follows EV.TILE)
//   View.aim = { act, ang, d }       set by the input layer: ACT.* (0 none), world angle, share of range
//   View.screenToWorld(sx, sy)       CSS pixels -> world tiles (reused object {x, y})
//   View.worldToScreen(x, y)         world tiles -> CSS pixels (reused object {x, y})
const View = (() => {
  const SHOT_Z = 0.45; // straight shots fly at gun height (tiles)
  const HP_COL = { own: '#3fd04f', enemy: '#ff4040', me: '#36d6ff' };
  const SIDE_COL = ['#3d9bff', '#ff4a4a'];
  const EMOTE_TXT = { gg: 'GG!', happy: 'Yay!', angry: 'Grr!', sad: 'Aww...', thumbs: 'Nice!' };

  const V = {
    W: 844, H: 390, dpr: 1, Wd: 844, Hd: 390,
    T: 24, flip: false, mode: 'gem', team: 0, local: -1,
    cam: { x: 0, y: 0, cx: 0, cy: 0, x0: 0, y0: 0, x1: 0, y1: 0 },
    aim: { act: 0, ang: 0, d: 1, screen: false },
    layer: null,
    time: 0, // real-time clock (s) for animation
    drawMs: 0, // last frame's draw time (ms), for the auto-quality check
    debug: false,
  };

  // ---- per-frame state (no allocation in the hot path) ----
  const F = { ox: 0, oy: 0, k: 1, f: 1, T: 24, lox: 0, loy: 0, sx: 0, sy: 0, rTop: 0, rBot: 0, cA: 0, cB: 0, alpha: 1, sd: false, shakeX: 0, shakeY: 0 };
  const FXV = { ox: 0, oy: 0, k: 1, T: 24, dpr: 1 };
  const camT = { x: 0, y: 0 }; // camera target (world)
  const crect = {};
  let lastMap = null;
  let snap = true;
  let tilesCopy = null;
  let lastT = -1;
  let spectate = -1;
  let ballRoll = 0;
  const jumpWas = new Float32Array(16); // jumpT seen last frame per slot (landing slams)
  const dashWas = new Float32Array(16);
  const sparkleT = { t: 0 };
  // drawables: pooled records, bucketed by screen row
  const pool = [];
  let poolN = 0;
  const rows = [];
  const overlay = [];
  const labels = [];
  const rec = (type, e, sx, sy, ys) => {
    let d = pool[poolN];
    if (!d) { d = { type: 0, e: null, sx: 0, sy: 0, ys: 0, z: 0, side: 0, a: 1 }; pool[poolN] = d; }
    poolN++;
    d.type = type; d.e = e; d.sx = sx; d.sy = sy; d.ys = ys; d.z = 0; d.side = 0; d.a = 1;
    return d;
  };
  const D_BRAWLER = 1, D_DEPLOY = 2, D_PICKUP = 3, D_BALL = 4, D_SHOT = 5, D_LOB = 6, D_BEAM = 7, D_JUMP = 8;

  // ---- small helpers ----
  const lerpPos = (e, a) => { F.sx = e.px + (e.x - e.px) * a; F.sy = e.py + (e.y - e.py) * a; };
  const toSX = (x) => F.ox + x * F.k;
  const toSY = (y) => F.oy + y * F.k;
  const sideOf = (team, slot) => (F.sd ? (slot === V.local ? 0 : 1) : team === V.team ? 0 : 1);
  const scrAng = (a) => (V.flip ? a + Math.PI : a);
  const visible = (b) => b.vis === undefined || ((b.vis >> V.team) & 1) === 1 || b.team === V.team;
  function modeOf(state, hud) {
    if (state.modeKey) return state.modeKey;
    if (typeof state.mode === 'string') return state.mode;
    if (hud && hud.mode) return hud.mode;
    return 'gem';
  }
  function hudOf(state) {
    if (typeof state.hud === 'function') return state.hud();
    return state.hud || null;
  }
  // Attack spec of a brawler for an action (the sim's kit when present, else the data table).
  function specOf(b, act) {
    if (b.kit) return act === ACT.SUPER ? b.kit.sup : act === ACT.GADGET ? b.kit.gad : b.kit.atk;
    if (typeof BRAWLERS === 'undefined' || !BRAWLERS[b.bk]) return null;
    const D = BRAWLERS[b.bk];
    return act === ACT.SUPER ? D.sup : act === ACT.GADGET ? (D.gadgets && D.gadgets[Math.max(0, b.gadget | 0)]) : D.atk;
  }

  // ---- cached text labels (names, HP numbers) ----
  const textCache = new Map();
  function textSprite(str, size, col) {
    const ck = str + '|' + size + '|' + col;
    let c = textCache.get(ck);
    if (c) return c;
    if (textCache.size > 400) textCache.clear();
    const font = `900 ${size}px system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif`;
    const m = measure(font, str);
    c = makeCanvas(m + size * 0.6, size * 1.45);
    const x = c.getContext('2d');
    outlineText(x, str, c.width / 2, c.height / 2, size, col);
    textCache.set(ck, c);
    return c;
  }
  let measureCtx = null;
  function measure(font, str) {
    if (!measureCtx) measureCtx = makeCanvas(4, 4).getContext('2d');
    measureCtx.font = font;
    return Math.ceil(measureCtx.measureText(str).width);
  }
  const vignettes = new Map();
  function vignette(col) {
    const ck = col + V.Wd + 'x' + V.Hd;
    let c = vignettes.get(ck);
    if (c) return c;
    if (vignettes.size > 3) vignettes.clear();
    // full resolution and blitted 1:1 (stretching a small one costs more per frame than it saves)
    const w = V.Wd, h = V.Hd;
    c = makeCanvas(w, h);
    const x = c.getContext('2d');
    x.translate(w / 2, h / 2);
    x.scale(1, h / w);
    x.translate(-w / 2, -h / 2);
    // a circle in this squashed space is an ellipse filling the screen
    const g = x.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.62);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.6, rgba(col, 0.35));
    g.addColorStop(1, rgba(col, 0.95));
    x.fillStyle = g;
    x.fillRect(0, h / 2 - w / 2, w, w);
    vignettes.set(ck, c);
    return c;
  }

  // ================= public API =================
  V.resize = function (w, h, dpr) {
    V.W = Math.max(1, w);
    V.H = Math.max(1, h);
    V.dpr = clamp(dpr || 1, 1, 2);
    V.Wd = Math.round(V.W * V.dpr);
    V.Hd = Math.round(V.H * V.dpr);
    const T = Math.max(8, Math.round(V.Hd / CAM_H));
    if (T !== V.T) {
      V.T = T;
      Art.clear();
      textCache.clear();
      vignettes.clear();
      V.layer = null; // re-rendered at the new zoom on the next draw
    }
    return V.dpr;
  };

  // A new match (or leaving one): forget the layer, snap the camera, drop effects. localSlot (optional)
  // lets effects of events that arrive before the first draw know whose side they are on.
  V.reset = function (localSlot) {
    if (localSlot != null) { V.local = localSlot; }
    V.layer = null;
    lastMap = null;
    snap = true;
    spectate = -1;
    tilesCopy = null;
    jumpWas.fill(0);
    dashWas.fill(0);
    FX.clear();
    FX.local = V.local;
  };

  V.onEvent = function (ev, state) {
    if (ev[0] === EV.KILL && ev[1] === V.local && ev[2] >= 0) spectate = ev[2];
    FX.onEvent(ev, state);
  };

  // Called by FX on EV.TILE (and by the per-frame tile diff): repaint the ground around a tile.
  V.tileChanged = function (idx) {
    const L = V.layer;
    if (!L) return;
    Art.updateTile(L, idx);
    if (tilesCopy && idx < tilesCopy.length) tilesCopy[idx] = L.map.tiles[idx];
  };

  const s2w = { x: 0, y: 0 };
  V.screenToWorld = function (sx, sy) {
    s2w.x = (sx * V.dpr - F.ox) / F.k;
    s2w.y = (sy * V.dpr - F.oy) / F.k;
    return s2w;
  };
  const w2s = { x: 0, y: 0 };
  V.worldToScreen = function (x, y) {
    w2s.x = toSX(x) / V.dpr;
    w2s.y = toSY(y) / V.dpr;
    return w2s;
  };

  // ================= draw =================
  V.draw = function (ctx, state, localSlot, alpha, opts) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    opts = opts || {};
    let dt = opts.dt;
    if (dt == null) {
      dt = lastT < 0 ? 1 / 60 : (t0 - lastT) / 1000;
      lastT = t0;
    }
    dt = clamp(dt, 0, 0.1);
    V.time += dt;
    alpha = alpha == null ? 1 : clamp(alpha, 0, 1);
    F.alpha = alpha;
    const map = state.map;
    const B = state.brawlers || [];
    const hud = hudOf(state);
    V.mode = modeOf(state, hud);
    F.sd = V.mode === 'sd';
    V.local = localSlot;
    const me = B[localSlot] || null;
    V.team = me ? me.team : 0;
    V.flip = !!me && me.team === 1 && !F.sd;
    FX.local = localSlot;
    FX.sd = F.sd;
    FX.update(dt);
    if (V.Wd !== ctx.canvas.width || V.Hd !== ctx.canvas.height) {
      // the canvas was sized without resize(): follow it
      V.resize(ctx.canvas.width / V.dpr, ctx.canvas.height / V.dpr, V.dpr);
    }
    if (!map) return;
    if (map !== lastMap) { lastMap = map; V.layer = null; snap = true; tilesCopy = null; spectate = -1; }
    ensureLayer(map);
    syncTiles(map);
    updateCamera(state, me, dt);
    // per-frame mapping
    const T = V.T, f = V.flip ? -1 : 1;
    F.T = T; F.f = f; F.k = T * f;
    const sh = FX.shake * T;
    F.shakeX = sh ? Math.sin(V.time * 93) * sh : 0;
    F.shakeY = sh ? Math.cos(V.time * 71) * sh * 0.8 : 0;
    // whole device pixels: the floor blit stays a plain copy and sprites don't shimmer
    F.ox = Math.round(V.Wd / 2 - V.cam.cx * F.k + F.shakeX);
    F.oy = Math.round(V.Hd / 2 - V.cam.cy * F.k + F.shakeY);
    F.lox = F.ox + (V.flip ? map.w + Art.MX : -Art.MX) * F.k;
    F.loy = F.oy + (V.flip ? map.h + Art.MY : -Art.MY) * F.k;
    FXV.ox = F.ox; FXV.oy = F.oy; FXV.k = F.k; FXV.T = T; FXV.dpr = V.dpr;
    // visible screen rows / columns (screen-oriented tile indices)
    F.rTop = clamp(Math.floor(-F.loy / T - Art.MY) - 1, 0, map.h - 1);
    F.rBot = clamp(Math.ceil((V.Hd - F.loy) / T - Art.MY) + 2, 0, map.h - 1);
    F.cA = clamp(Math.floor(-F.lox / T - Art.MX) - 1, 0, map.w - 1);
    F.cB = clamp(Math.ceil((V.Wd - F.lox) / T - Art.MX) + 1, 0, map.w - 1);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawGround(ctx, state, map);
    drawAim(ctx, state, me, false);
    collect(state, me);
    drawRows(ctx, map, me);
    drawOverlay(ctx);
    FX.draw(ctx, FXV);
    drawAim(ctx, state, me, true);
    drawPoison(ctx, state, hud, map);
    drawLabels(ctx, state);
    FX.drawTexts(ctx, FXV);
    if (opts.hud !== false) drawHud(ctx, state, hud, me, opts.safe);
    ctx.globalAlpha = 1;
    if (t0) V.drawMs = performance.now() - t0;
  };

  // ---- tile layer ----
  function ensureLayer(map) {
    const L = V.layer;
    if (L && L.map === map && L.flip === V.flip && L.T === V.T && L.mode === V.mode && L.team === V.team) return;
    V.layer = Art.tileLayer(map, V.T, V.flip, { mode: V.mode, team: V.team });
    V.layer.T = V.T;
    V.layer.mode = V.mode;
    tilesCopy = new Uint8Array(map.tiles);
  }
  // Repaints tiles that changed without an EV.TILE reaching us (late join, mirror updates).
  function syncTiles(map) {
    if (!tilesCopy || tilesCopy.length !== map.tiles.length) { tilesCopy = new Uint8Array(map.tiles); return; }
    const a = map.tiles;
    for (let i = 0; i < a.length; i++) if (a[i] !== tilesCopy[i]) V.tileChanged(i);
  }

  // ---- camera ----
  function updateCamera(state, me, dt) {
    const map = state.map, B = state.brawlers || [];
    let tgt = me;
    if (me && !me.alive && me.respawnT < 0) {
      // out of the match (Showdown, Knockout): watch the killer, a teammate, or anyone left
      let s = spectate >= 0 && B[spectate] && B[spectate].alive ? B[spectate] : null;
      if (!s) for (const b of B) if (b && b.alive && b.team === me.team) { s = b; break; }
      if (!s) for (const b of B) if (b && b.alive) { s = b; break; }
      if (s) tgt = s;
    }
    if (tgt && (tgt.alive || tgt === me)) {
      if (tgt.alive) { lerpPos(tgt, F.alpha); camT.x = F.sx; camT.y = F.sy; } else if (snap) { camT.x = tgt.x; camT.y = tgt.y; }
    } else if (snap) { camT.x = map.w / 2; camT.y = map.h / 2; }
    cameraRect(map, camT.x, camT.y, V.flip, F.sd, crect);
    // the visible width follows the device's aspect ratio (the height is always CAM_H tiles)
    const vw = V.Wd / V.T, hw = vw / 2;
    let cx = F.sd ? camT.x : camT.x;
    cx = map.w + 2 <= vw ? map.w / 2 : clamp(cx, hw - 1, map.w + 1 - hw);
    const cy = crect.cy;
    const c = V.cam;
    if (snap) { c.cx = cx; c.cy = cy; snap = false; } else {
      const k = 1 - Math.exp(-dt * 11);
      c.cx += (cx - c.cx) * k;
      c.cy += (cy - c.cy) * k;
    }
    c.x = camT.x; c.y = camT.y;
    const hh = V.Hd / V.T / 2;
    c.x0 = c.cx - hw; c.x1 = c.cx + hw; c.y0 = c.cy - hh; c.y1 = c.cy + hh;
  }

  // ---- ground: floor layer, water, areas, rings and shadows ----
  function drawGround(ctx, state, map) {
    const L = V.layer, T = F.T;
    // visible part of the pre-rendered layer (source rect clamped to the canvas)
    const q = T / L.px;
    let sx = -F.lox / q, sy = -F.loy / q, sw = V.Wd / q, sh = V.Hd / q;
    let dx = 0, dy = 0;
    if (sx < 0) { dx = -sx * q; sw += sx; sx = 0; }
    if (sy < 0) { dy = -sy * q; sh += sy; sy = 0; }
    sw = Math.min(sw, L.canvas.width - sx);
    sh = Math.min(sh, L.canvas.height - sy);
    if (dx > 0 || dy > 0 || sw * q < V.Wd - 0.5 || sh * q < V.Hd - 0.5) {
      ctx.fillStyle = L.env.outTop;
      ctx.fillRect(0, 0, V.Wd, V.Hd);
    }
    if (sw > 0 && sh > 0) ctx.drawImage(L.canvas, sx, sy, sw, sh, dx, dy, sw * q, sh * q);
    // animated water
    const txA = V.flip ? map.w - 1 - F.cB : F.cA, txB = V.flip ? map.w - 1 - F.cA : F.cB;
    for (let r = F.rTop; r <= F.rBot; r++) Art.drawWaterRow(ctx, map, L, V.flip ? map.h - 1 - r : r, txA, txB, F.lox, F.loy, T, V.time);
    // lasting zones lie on the ground (walls cover them)
    const A = state.areas || [];
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.dead) continue;
      const x = toSX(a.x), y = toSY(a.y), R = a.r * T + T;
      if (x < -R || x > V.Wd + R || y < -R || y > V.Hd + R) continue;
      const ob = state.brawlers && state.brawlers[a.owner];
      Art.area(ctx, a, x, y, T, V.time, sideOf(a.team, ob ? ob.slot : -1));
    }
    // team circles under brawlers (and units), below everything that stands
    const B = state.brawlers || [];
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b || !b.alive || !visible(b)) continue;
      lerpPos(b, F.alpha);
      const x = toSX(F.sx), y = toSY(F.sy);
      if (x < -T * 2 || x > V.Wd + T * 2 || y < -T * 2 || y > V.Hd + T * 3) continue;
      const side = sideOf(b.team, b.slot), own = side === 0;
      if (b.inBush && !own) continue;
      const jumping = b.jumpT > 0;
      if (jumping) { Art.shadow(ctx, x, y, T * 0.35, 0.25); continue; }
      if (own && b.inBush) ctx.globalAlpha = 0.6;
      Art.ring(ctx, x, y, T, side, b.slot === V.local, b.supReady ? 1 : 0, V.time + b.slot * 0.3);
      if (b.slot === V.local && !b.supReady && b.sup > 0.01) {
        // super charge as a thin arc around the player's circle
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = Math.max(1.5, T * 0.06);
        ctx.beginPath();
        ctx.ellipse(x, y, T * 0.58, T * 0.42, 0, -Math.PI / 2, -Math.PI / 2 + TAU * b.sup);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const DP = state.deploys || [];
    for (let i = 0; i < DP.length; i++) {
      const d = DP[i];
      if (d.dead) continue;
      lerpPos(d, F.alpha);
      const x = toSX(F.sx), y = toSY(F.sy);
      if (x < -T * 2 || x > V.Wd + T * 2 || y < -T * 2 || y > V.Hd + T * 3) continue;
      const ob = B[d.owner];
      ctx.globalAlpha = 0.75;
      Art.ring(ctx, x, y, T * 0.8, sideOf(d.team, ob ? ob.slot : -1), false, 0, 0);
      ctx.globalAlpha = 1;
    }
  }

  // ---- gather drawables into screen rows ----
  function bucket(d) {
    const map = V.layer.map;
    let r = Math.floor(V.flip ? map.h - d.ys : d.ys);
    r = clamp(r, 0, map.h - 1);
    if (r < F.rTop - 1 || r > F.rBot) return;
    const row = rows[r] || (rows[r] = []);
    row.push(d);
  }
  function onScreen(x, y, m) { return x > -m && x < V.Wd + m && y > -m && y < V.Hd + m * 2; }

  function collect(state, me) {
    const map = state.map, T = F.T, a = F.alpha;
    poolN = 0;
    for (let i = 0; i < rows.length; i++) if (rows[i]) rows[i].length = 0;
    overlay.length = 0;
    labels.length = 0;
    const B = state.brawlers || [];
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b) continue;
      // landing slam after a leap (the sim has no event for it)
      const jw = jumpWas[b.slot & 15];
      if (jw > 0 && !(b.jumpT > 0) && b.alive) landing(b);
      jumpWas[b.slot & 15] = b.alive ? b.jumpT || 0 : 0;
      if (!b.alive || !visible(b)) { dashWas[b.slot & 15] = 0; continue; }
      lerpPos(b, a);
      const x = toSX(F.sx), y = toSY(F.sy);
      if (!onScreen(x, y, T * 2)) continue;
      const d = rec(D_BRAWLER, b, x, y, F.sy);
      d.side = sideOf(b.team, b.slot);
      d.a = 1;
      if (d.side === 0 && b.inBush) d.a = b.slot === V.local ? 0.62 : 0.5;
      if (b.invisT > 0) d.a = d.side === 0 ? 0.42 : 0.3;
      if (b.jumpT > 0 && b.jumpTT > 0) {
        const tl = Math.max(0, b.jumpT - a * SIM_DT), k = clamp(1 - tl / b.jumpTT, 0, 1);
        const L = Math.hypot(b.jx1 - b.jx0, b.jy1 - b.jy0);
        d.z = 4 * (1.2 + L * 0.18) * k * (1 - k);
        d.type = D_JUMP;
        overlay.push(d);
      } else bucket(d);
      labels.push(d);
      // dash trail
      if (b.dashT > 0 || b.kbT > 0) {
        dashWas[b.slot & 15] += 1;
        if ((dashWas[b.slot & 15] | 0) % 2 === 0) FX.puff(F.sx, F.sy, 0.15, 0.45, 'rgba(255,255,255,0.55)', 0.3);
      }
    }
    const DP = state.deploys || [];
    for (let i = 0; i < DP.length; i++) {
      const e = DP[i];
      if (e.dead) continue;
      lerpPos(e, a);
      const x = toSX(F.sx), y = toSY(F.sy);
      if (!onScreen(x, y, T * 2)) continue;
      const ob = B[e.owner];
      const d = rec(D_DEPLOY, e, x, y, F.sy);
      d.side = sideOf(e.team, ob ? ob.slot : -1);
      bucket(d);
      labels.push(d);
    }
    const P = state.pickups || [];
    for (let i = 0; i < P.length; i++) {
      const e = P[i];
      if (e.dead) continue;
      lerpPos(e, a);
      const x = toSX(F.sx), y = toSY(F.sy);
      if (!onScreen(x, y, T)) continue;
      bucket(rec(D_PICKUP, e, x, y, F.sy));
    }
    // gem sparkle: now and then a twinkle on a random visible gem (cosmetic, not seeded)
    sparkleT.t -= 1 / 60;
    if (sparkleT.t <= 0 && P.length) {
      sparkleT.t = FX.low ? 0.5 : 0.22;
      const p = P[(V.time * 37 | 0) % P.length];
      if (p && !p.dead && p.pick === PICK.GEM) FX.stars(p.x, p.y, 0.5, 1, '#f2d0ff', 0.25);
    }
    if (state.ball) {
      const e = state.ball;
      lerpPos(e, a);
      const x = toSX(F.sx), y = toSY(F.sy);
      if (onScreen(x, y, T)) {
        // a held ball sorts in front of its holder, so it stays visible whichever way they face
        const h = e.holder >= 0 && B[e.holder] && B[e.holder].alive ? B[e.holder] : null;
        let ys = F.sy;
        if (h) { lerpPos(h, a); ys = F.sy + (V.flip ? -0.05 : 0.05); }
        const d = rec(D_BALL, e, x, y, ys);
        d.z = e.z || 0;
        if (d.z > 0.6) overlay.push(d); else bucket(d);
      }
      ballRoll += Math.hypot(e.vx || 0, e.vy || 0) * (1 / 60) * 2.6 * (e.vx < 0 ? -1 : 1);
    }
    const S = state.shots || [];
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (s.dead && !(s.beam > 0)) continue;
      if (s.beam > 0) {
        const d = rec(D_BEAM, s, 0, 0, s.y);
        overlay.push(d);
        continue;
      }
      lerpPos(s, a);
      const x = toSX(F.sx), y = toSY(F.sy);
      if (!onScreen(x, y, T * 3)) continue;
      if (s.lob) {
        const L = s.lob;
        const k = clamp((L.t - (1 - a) * SIM_DT) / (L.T || 1), 0, 1);
        const d = rec(D_LOB, s, x, y, F.sy);
        d.z = 4 * (0.9 + Math.min(2.4, s.range * 0.22)) * k * (1 - k) + 0.25 * (1 - k);
        overlay.push(d);
      } else bucket(rec(D_SHOT, s, x, y, F.sy));
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;
      // insertion sort by ground depth (few per row)
      for (let j = 1; j < row.length; j++) {
        const v = row[j];
        const key = V.flip ? -v.ys : v.ys;
        let k = j - 1;
        while (k >= 0 && (V.flip ? -row[k].ys : row[k].ys) > key) { row[k + 1] = row[k]; k--; }
        row[k + 1] = v;
      }
    }
  }

  function landing(b) {
    const near = V.local >= 0 ? Math.hypot(b.x - camT.x, b.y - camT.y) : 99;
    FX.ring(b.x, b.y, 1.6, '#ffffff', 0.35, 0.12);
    FX.puff(b.x, b.y, 0.2, 1.1, 'rgba(230,210,180,0.75)', 0.5, 6);
    FX.debris(b.x, b.y, 5, ['#c8a070', '#a07850', '#e8d0a0']);
    if (near < 5) FX.shake = Math.max(FX.shake, 0.14 * (1 - near / 5));
  }

  // ---- raised tiles and standing entities, row by row from the back ----
  function drawRows(ctx, map, me) {
    const L = V.layer, T = F.T;
    const txA = V.flip ? map.w - 1 - F.cB : F.cA, txB = V.flip ? map.w - 1 - F.cA : F.cB;
    let near = null;
    if (me && me.alive) { lerpPos(me, F.alpha); nearPt.x = F.sx; nearPt.y = F.sy; near = nearPt; }
    Art.frame(L);
    for (let r = Math.max(0, F.rTop - 1); r <= F.rBot; r++) {
      const ty = V.flip ? map.h - 1 - r : r;
      Art.drawRow(ctx, map, L, ty, txA, txB, F.lox, F.loy, T, near, V.time);
      const row = rows[r];
      if (!row) continue;
      for (let j = 0; j < row.length; j++) drawThing(ctx, row[j]);
    }
  }
  const nearPt = { x: 0, y: 0 };

  function drawThing(ctx, d) {
    const T = F.T;
    switch (d.type) {
      case D_BRAWLER: case D_JUMP: drawBrawler(ctx, d); break;
      case D_DEPLOY: {
        const e = d.e;
        const moving = Math.abs(e.x - e.px) + Math.abs(e.y - e.py) > 0.002;
        Art.deploy(ctx, e, d.sx, d.sy, T, V.time + e.id * 0.31, scrAng(e.face || 0), moving ? Art.F.WALK : 0);
        break;
      }
      case D_PICKUP: Art.pickup(ctx, d.e, d.sx, d.sy, T, V.time); break;
      case D_BALL: Art.ball(ctx, d.sx, d.sy, d.z, T, V.time, ballRoll); break;
      case D_SHOT: Art.shot(ctx, d.e, d.sx, d.sy, SHOT_Z, scrAng(d.e.ang), T, V.time); break;
      case D_LOB: Art.shot(ctx, d.e, d.sx, d.sy, d.z, scrAng(d.e.ang), T, V.time); break;
      case D_BEAM: {
        const s = d.e;
        const life = clamp((s.ttl || 0) / 0.15, 0, 1);
        Art.beam(ctx, s, toSX(s.x0), toSY(s.y0) - SHOT_Z * T, toSX(s.x), toSY(s.y) - SHOT_Z * T, T, V.time, life);
        break;
      }
    }
  }

  function drawBrawler(ctx, d) {
    const b = d.e, T = F.T, x = d.sx, y = d.sy - d.z * T;
    const isMe = b.slot === V.local;
    const c = FX.cues[b.slot];
    let face = b.face || 0;
    if (isMe && V.aim.act) face = V.aim.screen ? V.aim.ang + (V.flip ? Math.PI : 0) : V.aim.ang;
    const moving = (b.mvx || 0) * (b.mvx || 0) + (b.mvy || 0) * (b.mvy || 0) > 0.05;
    let fl = 0;
    if (moving && !(b.stunT > 0)) fl |= Art.F.WALK;
    if (c && c.hit > 0) fl |= Art.F.FLASH;
    else if (b.slowT > 0) fl |= Art.F.COLD;
    if (b.fireT !== undefined ? b.fireT < 0.12 : c && c.atk > 0.06) fl |= Art.F.ATK;
    // super-ready glow behind the body
    if (b.supReady && d.a > 0.45) {
      const p = 0.5 + 0.5 * Math.sin(V.time * 6 + b.slot);
      ctx.globalAlpha = 0.35 + 0.25 * p;
      const g = Art.glow('#ffd23f', 24);
      ctx.drawImage(g, x - T * 0.85, y - T * 1.45, T * 1.7, T * 1.7);
      ctx.globalAlpha = 1;
    }
    if (b.dashT > 0) {
      // afterimage one tick back along the dash
      ctx.globalAlpha = 0.28 * d.a;
      Art.brawler(ctx, b.bk, toSX(b.px), toSY(b.py) - d.z * T, T, scrAng(face), V.time + b.slot * 0.37, d.side, fl & ~Art.F.FLASH);
    }
    ctx.globalAlpha = d.a;
    if (b.invisT > 0 && d.a < 1) ctx.globalAlpha = d.a * (0.8 + 0.2 * Math.sin(V.time * 9));
    Art.brawler(ctx, b.bk, x, y, T, scrAng(face), V.time + b.slot * 0.37, d.side, fl);
    ctx.globalAlpha = 1;
    // status overlays
    if (b.shieldT > 0) {
      const p = 0.5 + 0.5 * Math.sin(V.time * 5);
      ctx.globalAlpha = 0.28 + 0.1 * p;
      ctx.fillStyle = '#9ad4ff';
      ctx.beginPath();
      ctx.ellipse(x, y - T * 0.62, T * 0.62, T * 0.74, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = Math.max(1.5, T * 0.05);
      ctx.strokeStyle = '#e8f6ff';
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x - T * 0.25, y - T * 1.0, T * 0.13, T * 0.06, -0.6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (b.stunT > 0) {
      for (let i = 0; i < 3; i++) {
        const a = V.time * 5 + (i * TAU) / 3;
        const ic = Art.icon('star', T * 0.32);
        ctx.drawImage(ic, x + Math.cos(a) * T * 0.38 - ic.width / 2, y - T * 1.55 + Math.sin(a) * T * 0.12 - ic.height / 2);
      }
    }
    if (b.slowT > 0) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#bff4ff';
      ctx.beginPath();
      ctx.ellipse(x, y, T * 0.5, T * 0.22, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (b.speedT > 0) {
      ctx.strokeStyle = 'rgba(122,255,176,0.85)';
      ctx.lineWidth = Math.max(1.5, T * 0.05);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const u = (V.time * 3 + i / 3) % 1;
        const yy = y - T * (0.25 + i * 0.3);
        const xx = x - T * 0.45 - u * T * 0.4;
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx - T * 0.3, yy);
      }
      ctx.stroke();
    }
    if (c && c.heal > 0 && d.a > 0.4) {
      ctx.globalAlpha = Math.min(1, c.heal * 2.5) * 0.45;
      ctx.drawImage(Art.glow('#5dff7a', 24), x - T * 0.7, y - T * 1.3, T * 1.4, T * 1.4);
      ctx.globalAlpha = 1;
    }
  }

  // ---- things above the walls: lobs in flight, leaping brawlers, beams, the ball in the air ----
  function drawOverlay(ctx) {
    for (let i = 0; i < overlay.length; i++) {
      const d = overlay[i];
      if (d.type === D_JUMP) drawBrawler(ctx, d); else drawThing(ctx, d);
    }
  }

  // ---- aim indicator for the local brawler (View.aim set by the input layer) ----
  const aimP = { x: 0, y: 0 };
  // Drawn twice: on the ground under everything that stands (air = false), then only the dotted
  // flight arc of lobbed things above the walls (air = true).
  function drawAim(ctx, state, me, air) {
    const A = V.aim;
    if (!A || !A.act || !me || !me.alive) return;
    const s = specOf(me, A.act);
    if (A.act === ACT.SUPER && !me.supReady) return;
    const T = F.T, map = state.map;
    lerpPos(me, F.alpha);
    const wx = F.sx, wy = F.sy;
    const ang = A.screen ? A.ang + (V.flip ? Math.PI : 0) : A.ang; // world angle
    const sa = scrAng(ang);
    const col = A.act === ACT.SUPER ? '#ffd23f' : A.act === ACT.GADGET ? '#5dff7a' : '#ffffff';
    const x0 = toSX(wx), y0 = toSY(wy);
    const fillA = A.act === ACT.ATTACK ? 0.36 : 0.4;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const prim = s ? s.t : 'shot';
    if (air && prim !== 'lob' && prim !== 'leap' && prim !== 'deploy' && prim !== 'area') { ctx.restore(); return; }
    const range = s ? s.range || s.dist || 0 : 6;
    const d = clamp(A.d == null ? 1 : A.d, 0, 1);
    const edge = () => { ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(1.5, T * 0.05); ctx.strokeStyle = col; ctx.stroke(); };
    const fill = () => { ctx.globalAlpha = fillA; ctx.fillStyle = col; ctx.fill(); };
    // straight things stop at the first wall unless they break it
    const clipLen = (L, mask, breaks) => {
      if (breaks || !map) return L;
      const t = rayHit(map, wx, wy, wx + Math.cos(ang) * L, wy + Math.sin(ang) * L, mask, null);
      return t >= 0 ? Math.max(0.3, L * t) : L;
    };
    const circleAt = (cx, cy, r) => { ctx.beginPath(); ctx.arc(cx, cy, r * T, 0, TAU); fill(); edge(); };
    switch (prim) {
      case 'shot': case 'beam': case 'dash': {
        const n = s ? s.n || 1 : 1;
        const L = prim === 'dash' ? clipLen(range, TF_MOVE, false) : clipLen(range, TF_SHOT, s && s.breaks);
        if (prim === 'shot' && n > 1 && s.spread > 0) {
          const half = s.spread / 2 + Math.atan2(s.r || 0.15, L);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.arc(x0, y0, L * T, sa - half, sa + half);
          ctx.closePath();
          fill();
          edge();
        } else {
          const w0 = prim === 'beam' ? s.w || 0.25 : prim === 'dash' ? (s && s.w) || 0.4 : (s ? s.r || 0.15 : 0.15) + ((s && s.jit) || 0);
          const w1 = w0 + (s && s.grow ? s.grow * L : 0);
          const c = Math.cos(sa), sn = Math.sin(sa);
          ctx.beginPath();
          ctx.moveTo(x0 - sn * w0 * T, y0 + c * w0 * T);
          ctx.lineTo(x0 + c * L * T - sn * w1 * T, y0 + sn * L * T + c * w1 * T);
          ctx.arc(x0 + c * L * T, y0 + sn * L * T, w1 * T, sa + Math.PI / 2, sa - Math.PI / 2, true);
          ctx.lineTo(x0 + sn * w0 * T, y0 - c * w0 * T);
          ctx.closePath();
          fill();
          edge();
          if (s && s.split) {
            ctx.setLineDash([T * 0.15, T * 0.15]);
            ctx.beginPath();
            ctx.arc(x0 + c * L * T, y0 + sn * L * T, s.split.range * T * 0.6, 0, TAU);
            edge();
            ctx.setLineDash([]);
          }
        }
        break;
      }
      case 'arc': {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.arc(x0, y0, range * T, sa - (s.half || 0.6), sa + (s.half || 0.6));
        ctx.closePath();
        fill();
        edge();
        break;
      }
      case 'lob': case 'leap': case 'deploy': case 'area': {
        if (prim === 'area' && s.at === 'self') { if (!air) circleAt(x0, y0, s.r || 1); break; }
        const dist = range * d;
        const tx = wx + Math.cos(ang) * dist, ty = wy + Math.sin(ang) * dist;
        const x1 = toSX(tx), y1 = toSY(ty);
        if (air) {
          // dotted flight arc over everything
          const H = (prim === 'deploy' ? 0.8 : 1.0) + Math.min(2.4, dist * 0.22);
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = col;
          const nd = Math.max(4, Math.round(dist * 1.6));
          for (let i = 1; i < nd; i++) {
            const k = i / nd;
            const z = 4 * H * k * (1 - k) + 0.6 * (1 - k);
            circle(ctx, lerp(x0, x1, k), lerp(y0, y1, k) - z * T, Math.max(1.5, T * 0.07));
            ctx.fill();
          }
          break;
        }
        let R = 0.6;
        if (s) R = s.blast || (s.area && s.area.r) || s.r || (s.land && s.land.r) || s.rad || 0.6;
        if (prim === 'leap') R = s.r || 0.9;
        const n = s && s.n > 1 ? s.n : 1;
        if (n > 1 && s.gap) {
          const c = Math.cos(ang), sn = Math.sin(ang);
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * s.gap;
            circleAt(toSX(tx - sn * off), toSY(ty + c * off), R);
          }
        } else if (n > 1 && s.spread) {
          for (let i = 0; i < n; i++) {
            const a2 = ang + (i / (n - 1) - 0.5) * s.spread;
            circleAt(toSX(wx + Math.cos(a2) * dist), toSY(wy + Math.sin(a2) * dist), R);
          }
        } else circleAt(x1, y1, R);
        break;
      }
      case 'pulse': circleAt(x0, y0, s.r || 2); break;
      default: circleAt(x0, y0, (s && s.r) || 0.9); break;
    }
    ctx.restore();
  }

  // ---- poison cloud outside the safe rectangle (Showdown, Knockout overtime) ----
  function drawPoison(ctx, state, hud, map) {
    const P = (hud && hud.poison) || state.poison;
    if (!P || (P.x0 <= -0.45 && P.y0 <= -0.45 && P.x1 >= map.w + 0.45 && P.y1 >= map.h + 0.45)) return;
    const T = F.T;
    let ax = toSX(P.x0), bx = toSX(P.x1), ay = toSY(P.y0), by = toSY(P.y1);
    if (ax > bx) { const t = ax; ax = bx; bx = t; }
    if (ay > by) { const t = ay; ay = by; by = t; }
    ax = Math.round(ax); bx = Math.round(bx); ay = Math.round(ay); by = Math.round(by);
    const W = V.Wd, H = V.Hd;
    const pul = 0.5 + 0.05 * Math.sin(V.time * 2);
    ctx.fillStyle = `rgba(28,104,60,${pul})`;
    if (ay > 0) ctx.fillRect(0, 0, W, Math.min(H, ay));
    if (by < H) ctx.fillRect(0, Math.max(0, by), W, H - Math.max(0, by));
    const top = clamp(ay, 0, H), bot = clamp(by, 0, H);
    if (bot > top) {
      if (ax > 0) ctx.fillRect(0, top, Math.min(W, ax), bot - top);
      if (bx < W) ctx.fillRect(Math.max(0, bx), top, W - Math.max(0, bx), bot - top);
    }
    // drifting gas inside the cloud
    const cl = Art.cloud(T), s = cl.width, step = T * (FX.low ? 1.8 : 1.35);
    const inside = (x, y) => x > ax && x < bx && y > ay && y < by;
    const g = T * 2.6;
    for (let gy = Math.floor(-F.oy / g) - 1; gy * g + F.oy < H + g; gy++) {
      for (let gx = Math.floor(-F.ox / g) - 1; gx * g + F.ox < W + g; gx++) {
        const h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
        const x = F.ox + gx * g + (h % 97) / 97 * g + Math.sin(V.time * 0.6 + h) * T * 0.4;
        const y = F.oy + gy * g + ((h >> 8) % 89) / 89 * g + Math.cos(V.time * 0.5 + h) * T * 0.3;
        if (inside(x, y) || x < -s || x > W + s || y < -s || y > H + s) continue;
        ctx.globalAlpha = 0.7;
        ctx.drawImage(cl, Math.round(x - s / 2), Math.round(y - s / 2));
      }
    }
    // a thick bank of puffs along the edge
    const puffs = (x0, y0, x1, y1, ox, oy) => {
      const L = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(L / step);
      for (let i = 0; i <= n; i++) {
        const u = n ? i / n : 0;
        const px = lerp(x0, x1, u), py = lerp(y0, y1, u);
        if (px < -s || px > W + s || py < -s || py > H + s) continue;
        const w = Math.sin(V.time * 1.7 + i * 1.3) * T * 0.14;
        ctx.drawImage(cl, Math.round(px - s / 2 + ox * T * 0.3 + w), Math.round(py - s / 2 + oy * T * 0.3 - w));
      }
    };
    ctx.globalAlpha = 0.95;
    puffs(ax, ay, bx, ay, 0, -1);
    puffs(ax, by, bx, by, 0, 1);
    puffs(ax, ay, ax, by, -1, 0);
    puffs(bx, ay, bx, by, 1, 0);
    ctx.globalAlpha = 1;
  }

  // ---- names, health and ammo bars, carried items, chat bubbles ----
  function drawLabels(ctx, state) {
    const T = F.T;
    const fs = Math.max(9 * V.dpr, Math.round(T * 0.3));
    for (let i = 0; i < labels.length; i++) {
      const d = labels[i];
      const e = d.e;
      if (d.type === D_DEPLOY) {
        const w = T * 0.9, h = Math.max(4, T * 0.14);
        bar(ctx, d.sx - w / 2, d.sy - T * 1.2, w, h, e.hp / (e.maxHp || 1), d.side === 0 ? HP_COL.own : HP_COL.enemy, false);
        continue;
      }
      if (d.a < 0.35 && d.side !== 0) continue; // a barely seen invisible enemy keeps no label
      const b = e, isMe = b.slot === V.local;
      const y = d.sy - d.z * T;
      const w = T * 1.32, h = Math.max(fs * 0.95, T * 0.26);
      const by = y - T * 1.72;
      ctx.globalAlpha = d.a < 1 ? Math.max(0.55, d.a) : 1;
      const col = isMe ? HP_COL.me : d.side === 0 ? HP_COL.own : HP_COL.enemy;
      bar(ctx, d.sx - w / 2, by, w, h, b.hp / (b.maxHp || 1), col, true);
      // HP number inside the bar
      const hs = textSprite(String(Math.max(0, Math.ceil(b.hp))), fs, '#ffffff');
      ctx.drawImage(hs, Math.round(d.sx - hs.width / 2), Math.round(by + h / 2 - hs.height / 2));
      // name above
      const nm = textSprite(b.name || '', Math.round(fs * 0.92), isMe ? '#ffe27a' : d.side === 0 ? '#bfe0ff' : '#ffc4c4');
      ctx.drawImage(nm, Math.round(d.sx - nm.width / 2), Math.round(by - nm.height * 0.82));
      let topY = by - nm.height * 0.82;
      // ammo segments (own brawler only)
      if (isMe) {
        const ah = Math.max(3, T * 0.12), ay = by + h + Math.max(2, T * 0.04), gap = Math.max(1.5, T * 0.04);
        const sw = (w - gap * 2) / 3;
        for (let k = 0; k < 3; k++) {
          const fill = clamp((b.ammo || 0) - k, 0, 1);
          const sx = d.sx - w / 2 + k * (sw + gap);
          roundRect(ctx, sx, ay, sw, ah, ah * 0.4);
          ctx.fillStyle = 'rgba(20,10,30,0.8)';
          ctx.fill();
          if (fill > 0) {
            roundRect(ctx, sx, ay, sw * fill, ah, ah * 0.4);
            ctx.fillStyle = fill >= 1 ? '#ff9a1a' : '#c06a2a';
            ctx.fill();
          }
        }
      }
      // carried gems / bounty stars / power cubes
      const tag = (icon, n, col2) => {
        const ic = Art.icon(icon, fs * 1.25);
        const tx = textSprite(String(n), Math.round(fs * 1.05), col2);
        const tw = ic.width * 0.9 + tx.width * 0.85;
        const x0 = d.sx - tw / 2, yy = topY - ic.height * 0.62;
        ctx.drawImage(ic, Math.round(x0), Math.round(yy));
        ctx.drawImage(tx, Math.round(x0 + ic.width * 0.8), Math.round(yy + ic.height / 2 - tx.height / 2));
        topY = yy;
      };
      if (b.carry > 0) tag('gem', b.carry, '#f0c8ff');
      if (b.bounty > 0) tag('star', b.bounty, '#fff3a0');
      if (F.sd && b.cubes > 0) tag('cube', b.cubes, '#c8ffc0');
      ctx.globalAlpha = 1;
      // quick chat and emotes
      const c = FX.cues[b.slot];
      if (c && (c.pinT > 0 || c.emoteT > 0)) {
        const str = c.pinT > 0 ? PINS[c.pin] || '' : EMOTE_TXT[EMOTES[c.emote]] || '!';
        const life = c.pinT > 0 ? c.pinT : c.emoteT;
        ctx.globalAlpha = Math.min(1, life * 3);
        bubble(ctx, d.sx, topY - T * 0.15, str, fs, d.side);
        ctx.globalAlpha = 1;
      }
    }
  }
  function bar(ctx, x, y, w, h, frac, col, big) {
    frac = clamp(frac, 0, 1);
    const r = h * 0.35;
    roundRect(ctx, x - 1.5, y - 1.5, w + 3, h + 3, r + 1);
    ctx.fillStyle = 'rgba(16,10,28,0.88)';
    ctx.fill();
    if (frac > 0) {
      roundRect(ctx, x, y, Math.max(h * 0.5, w * frac), h, r);
      ctx.fillStyle = col;
      ctx.fill();
      if (big) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(x + r * 0.5, y + h * 0.12, Math.max(0, w * frac - r), h * 0.22);
      }
    }
  }
  function bubble(ctx, x, y, str, fs, side) {
    const ts = textSprite(str, Math.round(fs * 1.05), '#ffffff');
    const w = ts.width + fs * 0.4, h = ts.height * 1.05;
    roundRect(ctx, x - w / 2, y - h, w, h, h * 0.35);
    ctx.fillStyle = side === 0 ? 'rgba(30,90,170,0.92)' : 'rgba(170,30,40,0.92)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, fs * 0.12);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - fs * 0.25, y - 1);
    ctx.lineTo(x, y + fs * 0.35);
    ctx.lineTo(x + fs * 0.25, y - 1);
    ctx.fill();
    ctx.drawImage(ts, x - ts.width / 2, y - h / 2 - ts.height / 2);
  }

  // ================= HUD =================
  function drawHud(ctx, state, hud, me, safe) {
    const dpr = V.dpr;
    const u = dpr * clamp(Math.min(V.W / 844, V.H / 390), 0.8, 1.5);
    const W = V.Wd, H = V.Hd;
    const sl = ((safe && safe.l) || 0) * dpr, sr = ((safe && safe.r) || 0) * dpr, st = ((safe && safe.t) || 0) * dpr;
    // red flash when hurt, pulsing vignette at low health
    if (FX.hurt > 0) {
      ctx.globalAlpha = clamp(FX.hurt / 0.28, 0, 1) * 0.6;
      ctx.drawImage(vignette('#ff1a1a'), 0, 0);
    }
    if (me && me.alive && me.hp < me.maxHp * 0.4) {
      const k = 1 - me.hp / (me.maxHp * 0.4);
      ctx.globalAlpha = (0.45 + 0.4 * k) * (0.8 + 0.2 * Math.sin(V.time * (4 + 4 * k)));
      ctx.drawImage(vignette('#c80a1a'), 0, 0);
    }
    ctx.globalAlpha = 1;
    if (hud) topPanel(ctx, state, hud, u, W, st);
    killFeed(ctx, u, sl + 10 * u, st + 10 * u);
    // banners (GOAL!, round results, countdown notices)
    const bn = FX.banner;
    if (bn) {
      const k = bn.t / bn.life;
      const pop = k < 0.12 ? easeOutBack(k / 0.12) : 1;
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      outlineText(ctx, bn.text, W / 2, H * 0.3, 26 * u * pop, bn.col);
      if (bn.sub) outlineText(ctx, bn.sub, W / 2, H * 0.3 + 23 * u, 11 * u, '#ffffff');
      ctx.globalAlpha = 1;
    }
    // respawn countdown / out of the match
    if (me && !me.alive) {
      if (me.respawnT > 0) {
        outlineText(ctx, 'Respawning in', W / 2, H * 0.5 - 26 * u, 16 * u, '#ffffff');
        outlineText(ctx, String(Math.ceil(me.respawnT)), W / 2, H * 0.5 + 12 * u, 48 * u, '#ffd23f');
      } else if (!state.over) {
        outlineText(ctx, F.sd ? 'You were knocked out' : 'Out for this round', W / 2, H * 0.62, 16 * u, '#ffffff');
        const s = spectate >= 0 && state.brawlers[spectate] && state.brawlers[spectate].alive ? state.brawlers[spectate] : null;
        if (s) outlineText(ctx, 'Watching ' + (s.name || ''), W / 2, H * 0.62 + 20 * u, 11 * u, '#bfe0ff');
      }
    }
    if (V.debug) outlineText(ctx, V.drawMs.toFixed(1) + ' ms  fx ' + FX.count(), W - sr - 70 * u, H - 12 * u, 10 * u, '#fff');
  }

  function panel(ctx, x, y, w, h, col) {
    roundRect(ctx, x, y, w, h, h * 0.3);
    ctx.fillStyle = col || 'rgba(14,10,34,0.72)';
    ctx.fill();
  }
  // A team score box: icon + number on the team's colour.
  function scoreBox(ctx, x, y, w, h, side, iconName, n, u) {
    roundRect(ctx, x, y, w, h, h * 0.28);
    ctx.fillStyle = side === 0 ? '#2a7de0' : '#e03a3a';
    ctx.fill();
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, x + 2 * u, y + 2 * u, w - 4 * u, h * 0.38, h * 0.2);
    ctx.fill();
    if (iconName) {
      const ic = Art.icon(iconName, h * 0.9);
      const left = side === 0;
      ctx.drawImage(ic, left ? x + 3 * u : x + w - ic.width - 3 * u, y + h / 2 - ic.height / 2);
      outlineText(ctx, String(n), left ? x + w - h * 0.62 : x + h * 0.62, y + h / 2, h * 0.62, '#ffffff');
    } else outlineText(ctx, String(n), x + w / 2, y + h / 2, h * 0.62, '#ffffff');
  }

  function topPanel(ctx, state, hud, u, W, st) {
    const cx = W / 2, y = st + 6 * u, h = 30 * u;
    const mine = V.team, a = (arr) => arr[mine], b = (arr) => arr[1 - mine];
    switch (hud.mode) {
      case 'gem': {
        const bw = 64 * u;
        panel(ctx, cx - bw - 10 * u, y - 3 * u, bw * 2 + 20 * u, h + 6 * u);
        scoreBox(ctx, cx - bw - 6 * u, y, bw, h, 0, 'gem', a(hud.gems), u);
        scoreBox(ctx, cx + 6 * u, y, bw, h, 1, 'gem', b(hud.gems), u);
        if (hud.countTeam >= 0 && hud.count > 0) {
          const ours = hud.countTeam === mine;
          const pulse = 1 + 0.08 * Math.max(0, Math.sin(V.time * TAU));
          outlineText(ctx, String(hud.count), cx, y + h + 34 * u, 40 * u * pulse, ours ? '#5ab4ff' : '#ff5a5a');
          outlineText(ctx, ours ? 'YOUR TEAM WINS IN' : 'ENEMY WINS IN', cx, y + h + 8 * u, 10 * u, '#ffffff');
        }
        break;
      }
      case 'ball': case 'bounty': {
        const bw = 56 * u, tw = 58 * u;
        const ic = hud.mode === 'bounty' ? 'star' : 'ball';
        const sc = hud.mode === 'bounty' ? hud.stars : hud.goals;
        panel(ctx, cx - bw - tw / 2 - 8 * u, y - 3 * u, bw * 2 + tw + 16 * u, h + 6 * u);
        scoreBox(ctx, cx - tw / 2 - bw - 4 * u, y, bw, h, 0, ic, a(sc), u);
        scoreBox(ctx, cx + tw / 2 + 4 * u, y, bw, h, 1, ic, b(sc), u);
        clock(ctx, cx, y + h / 2, hud.time, u);
        if (hud.ot) outlineText(ctx, 'OVERTIME', cx, y + h + 12 * u, 12 * u, '#ffd23f');
        break;
      }
      case 'ko': {
        const tw = 58 * u, pw = 98 * u;
        panel(ctx, cx - pw - tw / 2 - 6 * u, y - 3 * u, pw * 2 + tw + 12 * u, h + 6 * u);
        clock(ctx, cx, y + h / 2, hud.time, u);
        // round wins as pips, team heads (greyed when down)
        for (let side = 0; side < 2; side++) {
          const wins = side === 0 ? a(hud.rounds) : b(hud.rounds);
          const team = side === 0 ? mine : 1 - mine;
          const dir = side === 0 ? -1 : 1;
          const x0 = cx + dir * (tw / 2 + 4 * u);
          for (let k = 0; k < 2; k++) {
            const px = x0 + dir * (8 * u + k * 15 * u), py = y + h / 2;
            circle(ctx, px, py, 5.5 * u);
            ctx.fillStyle = k < wins ? (side === 0 ? '#5ab4ff' : '#ff5a5a') : 'rgba(255,255,255,0.18)';
            ctx.fill();
            ctx.lineWidth = 1.5 * u;
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.stroke();
          }
          let k = 0;
          for (const br of state.brawlers || []) {
            if (!br || br.team !== team) continue;
            const ps = 22 * u, px = x0 + dir * (40 * u + k * (ps + 2 * u)) - (dir < 0 ? ps : 0);
            const pt = Art.portrait(br.bk, ps);
            ctx.globalAlpha = br.alive ? 1 : 0.35;
            ctx.drawImage(pt, px, y + h / 2 - ps / 2, ps, ps);
            ctx.lineWidth = 2 * u;
            ctx.strokeStyle = side === 0 ? '#3d9bff' : '#ff4a4a';
            ctx.strokeRect(px, y + h / 2 - ps / 2, ps, ps);
            ctx.globalAlpha = 1;
            k++;
          }
        }
        break;
      }
      case 'sd': {
        const w = 112 * u;
        panel(ctx, cx - w / 2, y - 3 * u, w, h + 6 * u);
        const ic = Art.icon('skull', h * 0.85);
        ctx.drawImage(ic, cx - w / 2 + 6 * u, y + h / 2 - ic.height / 2);
        outlineText(ctx, String(hud.alive), cx - w / 2 + 6 * u + ic.width + 14 * u, y + h / 2, h * 0.7, '#ffffff');
        outlineText(ctx, 'LEFT', cx + w / 2 - 26 * u, y + h / 2, h * 0.38, '#ffd23f');
        break;
      }
      default: {
        // test mode and anything new: kills per team and the clock
        const k = hud.kills || [0, 0];
        const bw = 52 * u, tw = 58 * u;
        panel(ctx, cx - bw - tw / 2 - 8 * u, y - 3 * u, bw * 2 + tw + 16 * u, h + 6 * u);
        scoreBox(ctx, cx - tw / 2 - bw - 4 * u, y, bw, h, 0, 'skull', k[mine] || 0, u);
        scoreBox(ctx, cx + tw / 2 + 4 * u, y, bw, h, 1, 'skull', k[1 - mine] || 0, u);
        clock(ctx, cx, y + h / 2, hud.time, u);
      }
    }
  }
  function clock(ctx, x, y, t, u) {
    const low = t <= 10 && t > 0;
    const pulse = low ? 1 + 0.12 * Math.max(0, Math.sin(V.time * TAU * 2)) : 1;
    outlineText(ctx, fmtTime(t || 0), x, y, 17 * u * pulse, low ? '#ff6a5a' : '#ffffff');
  }

  function killFeed(ctx, u, x, y) {
    const feed = FX.feed;
    if (!feed.length) return;
    const ps = 20 * u, h = ps + 6 * u;
    for (let i = 0; i < feed.length; i++) {
      const e = feed[i];
      const a = e.t < 0.2 ? e.t / 0.2 : e.t > 4 ? (4.5 - e.t) / 0.5 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      const yy = y + i * (h + 4 * u);
      const w = ps * 2 + 34 * u;
      roundRect(ctx, x, yy, w, h, h * 0.3);
      ctx.fillStyle = e.me ? 'rgba(90,70,10,0.8)' : 'rgba(14,10,34,0.7)';
      ctx.fill();
      // killer
      if (e.kb) {
        ctx.drawImage(Art.portrait(e.kb, ps), x + 3 * u, yy + 3 * u, ps, ps);
        ctx.lineWidth = 2 * u;
        ctx.strokeStyle = SIDE_COL[e.ks] || '#9fb4c8';
        ctx.strokeRect(x + 3 * u, yy + 3 * u, ps, ps);
      } else {
        const ic = Art.icon('skull', ps);
        ctx.drawImage(ic, x + 3 * u, yy + 3 * u, ps, ps);
      }
      // arrow
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const ax = x + ps + 10 * u, ay = yy + h / 2;
      ctx.moveTo(ax, ay - 4 * u);
      ctx.lineTo(ax + 12 * u, ay);
      ctx.lineTo(ax, ay + 4 * u);
      ctx.fill();
      // victim
      const vx = x + w - ps - 3 * u;
      ctx.drawImage(Art.portrait(e.vb, ps), vx, yy + 3 * u, ps, ps);
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = SIDE_COL[e.vs] || '#9fb4c8';
      ctx.strokeRect(vx, yy + 3 * u, ps, ps);
      ctx.strokeStyle = 'rgba(255,40,40,0.9)';
      ctx.beginPath();
      ctx.moveTo(vx + 3 * u, yy + 6 * u);
      ctx.lineTo(vx + ps - 3 * u, yy + ps);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  return V;
})();
