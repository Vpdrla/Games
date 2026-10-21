// ---------- Geometry on the tile grid ----------
// Pure functions shared by the sim, the guest's movement prediction and the bots. No allocation in
// the hot paths: results go into caller-owned `out` objects.

const tileIdx = (m, tx, ty) => ty * m.w + tx;
// Tile code at tile coords; outside the map counts as STONE (walls you can't leave through).
const tileAtT = (m, tx, ty) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? TILE.STONE : m.tiles[ty * m.w + tx]);
const tileAt = (m, x, y) => tileAtT(m, Math.floor(x), Math.floor(y));
const flagsAt = (m, x, y) => TILE_FLAGS[tileAt(m, x, y)];
const flagsAtT = (m, tx, ty) => TILE_FLAGS[tileAtT(m, tx, ty)];
const inBushAt = (m, x, y) => (flagsAt(m, x, y) & TF_BUSH) !== 0;

// Pushes a circle out of every blocking tile it overlaps (two passes) and keeps it inside the map.
function pushOut(m, o, r, mask) {
  for (let pass = 0; pass < 2; pass++) {
    const tx0 = Math.floor(o.x - r), tx1 = Math.floor(o.x + r);
    const ty0 = Math.floor(o.y - r), ty1 = Math.floor(o.y + r);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!(flagsAtT(m, tx, ty) & mask)) continue;
        const nx = clamp(o.x, tx, tx + 1), ny = clamp(o.y, ty, ty + 1);
        const dx = o.x - nx, dy = o.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          o.x += (dx / d) * (r - d);
          o.y += (dy / d) * (r - d);
        } else {
          // centre inside the tile: leave along the shallowest side
          const l = o.x - tx, rr = tx + 1 - o.x, t = o.y - ty, b = ty + 1 - o.y;
          const mn = Math.min(l, rr, t, b);
          if (mn === l) o.x = tx - r; else if (mn === rr) o.x = tx + 1 + r; else if (mn === t) o.y = ty - r; else o.y = ty + 1 + r;
        }
      }
    }
  }
  o.x = clamp(o.x, r, m.w - r);
  o.y = clamp(o.y, r, m.h - r);
  return o;
}

// Moves a circle by (dx, dy), sliding along blocking tiles. Steps of at most 0.25 tile, so fast
// dashes can't tunnel through a one-tile wall. Writes the result to out.x/out.y and returns out.
function moveCircle(m, x, y, r, dx, dy, out, mask) {
  mask = mask || TF_MOVE;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.25));
  out.x = x; out.y = y;
  const sx = dx / n, sy = dy / n;
  for (let i = 0; i < n; i++) {
    out.x += sx; out.y += sy;
    pushOut(m, out, r, mask);
  }
  return out;
}

// Walks the segment (x0,y0)->(x1,y1) through the tile grid (DDA). Returns the fraction t in [0, 1]
// where it first enters a tile whose flags match `mask`, or -1 if none. The tile is written to
// out.tx/out.ty when `out` is given. A start inside a matching tile returns 0.
function rayHit(m, x0, y0, x1, y1, mask, out) {
  let tx = Math.floor(x0), ty = Math.floor(y0);
  const tx1 = Math.floor(x1), ty1 = Math.floor(y1);
  if (flagsAtT(m, tx, ty) & mask) { if (out) { out.tx = tx; out.ty = ty; } return 0; }
  const dx = x1 - x0, dy = y1 - y0;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? tx + 1 - x0 : x0 - tx) * tdx : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? ty + 1 - y0 : y0 - ty) * tdy : Infinity;
  let guard = 0;
  while ((tx !== tx1 || ty !== ty1) && guard++ < 512) {
    let t;
    if (tmx < tmy) { t = tmx; tmx += tdx; tx += stepX; } else { t = tmy; tmy += tdy; ty += stepY; }
    if (t > 1) break;
    if (flagsAtT(m, tx, ty) & mask) { if (out) { out.tx = tx; out.ty = ty; } return t; }
  }
  return -1;
}

// True when a straight shot from a to b would not be stopped by a wall (water and fences don't stop
// shots). Used for auto-aim, bot shooting decisions and beam clipping, never for visibility.
const shotClear = (m, x0, y0, x1, y1) => rayHit(m, x0, y0, x1, y1, TF_SHOT, null) < 0;
// True when a brawler could walk straight from a to b (centre line only).
const walkClear = (m, x0, y0, x1, y1) => rayHit(m, x0, y0, x1, y1, TF_MOVE, null) < 0;

// First t in [0, 1] where the segment (x0,y0)->(x1,y1) touches the circle (cx, cy, r), or -1.
function segCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const fx = x0 - cx, fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  if (a < 1e-12) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

// The part of the world a player at (x, y) sees: the same rectangle the view shows on a 16:9 phone.
// `flip` is true for the team whose view is turned upside down (team 1 in 3v3); `sd` centres it
// (Showdown). The camera stops at the map edges (with a one-tile margin). Writes out.x0/y0/x1/y1
// and out.cx/cy (camera centre) and returns out.
function cameraRect(m, x, y, flip, sd, out) {
  out = out || {};
  const ahead = sd ? 0 : (CAM_AHEAD - 0.5) * CAM_H; // camera centre sits this far ahead of the player
  let cx = x, cy = flip ? y + ahead : y - ahead;
  const hw = CAM_W / 2, hh = CAM_H / 2;
  cx = m.w + 2 <= CAM_W ? m.w / 2 : clamp(cx, hw - 1, m.w + 1 - hw);
  cy = m.h + 2 <= CAM_H ? m.h / 2 : clamp(cy, hh - 1, m.h + 1 - hh);
  out.cx = cx; out.cy = cy;
  out.x0 = cx - hw; out.x1 = cx + hw; out.y0 = cy - hh; out.y1 = cy + hh;
  return out;
}
const inRect = (r, x, y, pad) => x >= r.x0 - (pad || 0) && x <= r.x1 + (pad || 0) && y >= r.y0 - (pad || 0) && y <= r.y1 + (pad || 0);

// Safe zone of a closing poison cloud at time t (s). sched: { start, shrink, minHalf } — the cloud
// starts closing at `start`, takes `shrink` seconds, and stops at a square of half-size `minHalf`
// around the map centre. Before `start` the safe zone is the whole map. Writes out.x0/y0/x1/y1.
function poisonRect(m, t, sched, out) {
  out = out || {};
  const k = clamp((t - sched.start) / sched.shrink, 0, 1);
  const cx = m.w / 2, cy = m.h / 2;
  const hx = lerp(m.w / 2 + 0.5, sched.minHalf, k), hy = lerp(m.h / 2 + 0.5, sched.minHalf, k);
  out.x0 = cx - hx; out.x1 = cx + hx; out.y0 = cy - hy; out.y1 = cy + hy;
  out.k = k;
  return out;
}

// ---- flow fields (bot navigation) ----
// Distance in tiles from every tile to the nearest goal, walking in 8 directions without cutting
// corners. Blocked tiles get Infinity. goals: array of {x, y} (world units). Returns Float32Array.
function flowField(m, goals, mask) {
  mask = mask || TF_MOVE;
  const n = m.w * m.h;
  const d = new Float32Array(n).fill(Infinity);
  // binary heap of tile indices keyed by d
  const heap = new Int32Array(n * 8 + 16);
  let hn = 0;
  const push = (i) => {
    let k = hn++;
    heap[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (d[heap[p]] <= d[heap[k]]) break;
      const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--hn];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let s = k;
      if (l < hn && d[heap[l]] < d[heap[s]]) s = l;
      if (r < hn && d[heap[r]] < d[heap[s]]) s = r;
      if (s === k) break;
      const t = heap[s]; heap[s] = heap[k]; heap[k] = t; k = s;
    }
    return top;
  };
  for (const g of goals) {
    const tx = clamp(Math.floor(g.x), 0, m.w - 1), ty = clamp(Math.floor(g.y), 0, m.h - 1);
    const i = ty * m.w + tx;
    if (!(TILE_FLAGS[m.tiles[i]] & mask)) { d[i] = 0; push(i); continue; }
    // goal on a blocked tile (e.g. the gem mine): start from the free tiles around it
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const j = ny * m.w + nx;
        if (TILE_FLAGS[m.tiles[j]] & mask) continue;
        const v = dx && dy ? Math.SQRT2 : 1;
        if (v < d[j]) { d[j] = v; push(j); }
      }
    }
  }
  const done = new Uint8Array(n);
  while (hn > 0) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    const x = i % m.w, y = (i / m.w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const j = ny * m.w + nx;
        if (TILE_FLAGS[m.tiles[j]] & mask) continue;
        if (dx && dy && ((TILE_FLAGS[m.tiles[y * m.w + nx]] & mask) || (TILE_FLAGS[m.tiles[ny * m.w + x]] & mask))) continue;
        const nd = d[i] + (dx && dy ? Math.SQRT2 : 1);
        if (nd < d[j]) { d[j] = nd; if (hn < heap.length) push(j); }
      }
    }
  }
  return d;
}

// Value of a flow field at a world point (Infinity on blocked tiles / outside).
const flowAt = (m, f, x, y) => {
  const tx = Math.floor(x), ty = Math.floor(y);
  return tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? Infinity : f[ty * m.w + tx];
};

// Direction to walk downhill on a flow field from (x, y): towards the best of the 8 neighbouring
// tile centres (no corner cutting). Writes out.x/out.y (unit vector, 0,0 at a goal or when stuck)
// and out.d (distance left) and returns out.
function flowDir(m, f, x, y, out) {
  const tx = Math.floor(x), ty = Math.floor(y);
  const here = flowAt(m, f, x, y);
  out.d = here;
  out.x = 0; out.y = 0;
  let best = here, bx = 0, by = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      if (dx && dy && (flagsAtT(m, tx + dx, ty) & TF_MOVE || flagsAtT(m, tx, ty + dy) & TF_MOVE)) continue;
      const v = f[ny * m.w + nx];
      if (v < best) { best = v; bx = nx + 0.5; by = ny + 0.5; }
    }
  }
  if (best < here) {
    const vx = bx - x, vy = by - y, l = Math.hypot(vx, vy) || 1;
    out.x = vx / l; out.y = vy / l;
  } else if (here === Infinity) {
    // standing on a blocked tile (pushed against a wall): step back towards the tile centre
    const vx = tx + 0.5 - x, vy = ty + 0.5 - y, l = Math.hypot(vx, vy) || 1;
    out.x = vx / l; out.y = vy / l;
  }
  return out;
}
