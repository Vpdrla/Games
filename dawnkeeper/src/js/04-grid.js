// ---------- Spatial hash for fast neighbour queries ----------
// The world is unbounded, so cells wrap around a 64x64 table. Items from far-away cells that
// alias into the same bucket are rejected by the callers' distance checks.
const GRID_C = 40;
const GRID_N = 64;
const GRID_MASK = GRID_N - 1;

class Grid {
  constructor(max) {
    this.head = new Int32Array(GRID_N * GRID_N).fill(-1);
    this.next = new Int32Array(max);
    this.items = new Array(max);
    this.max = max;
    this.n = 0;
  }

  clear() {
    this.head.fill(-1);
    this.n = 0;
  }

  insert(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.items[i] = o;
    const k = ((Math.floor(o.y / GRID_C) & GRID_MASK) << 6) | (Math.floor(o.x / GRID_C) & GRID_MASK);
    this.next[i] = this.head[k];
    this.head[k] = i;
  }

  // Fills `out` with items in cells overlapping the square around (x, y); returns the count.
  query(x, y, r, out) {
    let x0 = Math.floor((x - r) / GRID_C), x1 = Math.floor((x + r) / GRID_C);
    let y0 = Math.floor((y - r) / GRID_C), y1 = Math.floor((y + r) / GRID_C);
    if (x1 - x0 >= GRID_N) x1 = x0 + GRID_N - 1;
    if (y1 - y0 >= GRID_N) y1 = y0 + GRID_N - 1;
    let n = 0;
    const head = this.head, next = this.next, items = this.items;
    for (let cy = y0; cy <= y1; cy++) {
      const row = (cy & GRID_MASK) << 6;
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = head[row | (cx & GRID_MASK)]; i !== -1; i = next[i]) out[n++] = items[i];
      }
    }
    return n;
  }
}
