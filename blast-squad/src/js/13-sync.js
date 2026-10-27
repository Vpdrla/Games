// ---------- Sync: friendly battles between two phones (host snapshots, guest mirror, Friend lobby) ----------
// Host-authoritative. The host runs the Sim, every bot and the friend's RemoteCtrl (a Match with net
// 'host' plus a SyncHost). The guest runs no sim and no AI: GuestMatch keeps a mirror of the host's world
// with the Sim's entity shapes (so View, FX, Sound and perceive() work on it unchanged), shows the others
// a little in the past (interpolated), predicts its own brawler and sends its input words.
//
// Guest -> host
//   'u' every tick  { t:'i', s: seq of the newest word, w: [up to 6 words, oldest first] } (world angles)
//   'r'             { t:'pin', i }  { t:'emo', i }  { t:'rs' } (pickup list, please)  { t:'bye' }
// Host -> guest
//   'u' 15 Hz snapshot, filtered by what the guest's team can see (hidden enemies are left out):
//     { t:'s', k: tick, f: freezeT*10, x: host speed (tests), h: hud() (numbers to 0.1, the poison rect
//       as '@p'), p: poison [x0,y0,x1,y1 *10, k*100], B: brawlers, m: own extras, D: deploys, b: ball,
//       es: seq of E[0], E: events, S: shot records, A: area records, P: pickup records, pc: [n, id sum] }
//     B   [slot, x*100, y*100, face/64, hp, flags, (jump: T*100, TT*100, x0, y0, x1, y1 *10), (carry, bounty, cubes)]
//         or [slot, -1, respawnT*10] when down. flags: 1 bush 2 super 4 stun 8 slow 16 shield 32 invisible
//         64 speed 128 dash 256 knockback 512 jump fields follow 1024 carried items follow
//     m   [ammo*100, super*100, gadgets left, gadget cooldown*10, last input seq applied, slowF*100, speedF*100,
//          speed multiplier from star powers right now*100 (Escape Mode, Shadow Step)]
//     D   [id, key, owner, x*100, y*100, hp, maxHp, face/64]          b  [x*100, y*100, z*100, holder]
//     E   [ticks ago, EV.x, ...args] with seq es + index; each event rides in 5 snapshots in a row
//     S   [ticks since it was at its start, first id, n, key, owner, flags (1 super 2 lob 4 beam 8 breaks 16 thru walls),
//          x0*10, y0*10, then straight: spd*10, range*10, r*100, angles*1000 (one per shot) | lob: T*100, r*100,
//          fuse*100 (0: bursts on landing), blast radius*100, tx*10, ty*10 per shot | beam: x1*10, y1*10]   (3 snapshots in a row; a bounce resends the path)
//     A   [ticks ago, id, key, owner, x*10, y*10, r*10, t left*10, T*10, flags 1 harm 2 heal 4 slow]
//     P   [ticks ago, id, pick, n, x*10, y*10, (pop to tx*10, ty*10, pop time*100)]
//   'r' { t:'ids', ids }  { t:'T', k, l: [tile, value, ...] }  { t:'e', k, ev } (goals, rounds)
//       { t:'end', k, r: result }  { t:'PL', P: every pickup }  { t:'bye' }
// Projectiles are not streamed: the guest gets one record per volley and flies them itself (straight
// lines stop at walls and at full range, lobs land, beams fade); only shots that end on a brawler or a
// unit need an EV.SHOT_END from the host, and areas that run out need no DESPAWN. Events that would show
// a hidden enemy (hits, heals, statuses, pickups, gadgets in a bush) are not sent, nor effects far off
// the guest's screen. The friend's own shots are fast-forwarded on the host by half the round trip.
// The guest draws the others ~70-200 ms in the past (adaptive to jitter), plays events and records at
// their tick on that timeline, and predicts its own brawler from its words (moveCircle, speed and
// slow from the snapshots), replaying the unacknowledged ones on every snapshot: small errors are
// ignored, medium ones eased out over ~150 ms, large ones (respawns, teleports) snapped.

const SYNC_SNAP = 2; // sim ticks per snapshot (15 Hz)
const SYNC_EV_WIN = 5; // snapshots an event rides in
const SYNC_REC_WIN = 3; // ... a shot or area record
const SYNC_PICK_WIN = 5; // ... a pickup record
const SYNC_WORDS = 6; // input words per packet
const SYNC_AWAY = 2000; // ms without the friend's inputs before an AI holds their brawler
const SYNC_GONE = 12000; // ms of silence before the link is dropped (the AI keeps playing)
const SYNC_FAR_X = 18, SYNC_FAR_Y = 12; // effects farther than this from the guest are not sent (tiles)

const sq1 = (v) => Math.round(v * 10);
const sq2 = (v) => Math.round(v * 100);
const sqFace = (a) => Math.round(((((a % TAU) + TAU) % TAU) / TAU) * 64) & 63;
const sRound = (v) => (Number.isInteger(v) ? v : Math.round(v * 10) / 10);

// Visual keys (pk / ak / dk) <-> small numbers. Both phones build the same table from BRAWLERS.
const SyncKeys = {
  list: null, idx: null,
  init() {
    if (this.list) return;
    const set = new Set();
    const walk = (o, d) => {
      if (!o || typeof o !== 'object' || d > 6) return;
      for (const k in o) {
        const v = o[k];
        if ((k === 'pk' || k === 'ak' || k === 'dk') && typeof v === 'string') set.add(v);
        else if (v && typeof v === 'object') walk(v, d + 1);
      }
    };
    for (const bk of BRAWLER_KEYS) {
      set.add(bk);
      for (const s of ['.atk', '.sup', '.gad']) set.add(bk + s);
      walk(BRAWLERS[bk], 0);
    }
    this.list = [...set].sort();
    this.idx = new Map(this.list.map((k, i) => [k, i]));
  },
  enc(k) { return this.idx.has(k) ? this.idx.get(k) : String(k); },
  dec(v) { return typeof v === 'string' ? v : this.list[v] || ''; },
};

// Event copy for the wire: floats to 0.1 (the FIRE angle to 0.01).
function syncEv(ev, k) {
  const a = [k];
  for (let i = 0; i < ev.length; i++) {
    const v = ev[i];
    a.push(typeof v !== 'number' || Number.isInteger(v) ? v : ev[0] === EV.FIRE && i === 5 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10);
  }
  return a;
}

// HUD copy for the wire (any mode's shape): numbers to 0.1, the poison rect by reference.
function syncHud(h, poison) {
  if (h === poison && poison) return '@p';
  if (typeof h === 'number') return sRound(h);
  if (Array.isArray(h)) return h.map((v) => syncHud(v, poison));
  if (h && typeof h === 'object') { const o = {}; for (const k in h) o[k] = syncHud(h[k], poison); return o; }
  return h;
}
function syncUnHud(h, poison) {
  if (h === '@p') return poison;
  if (Array.isArray(h)) return h.map((v) => syncUnHud(v, poison));
  if (h && typeof h === 'object') { const o = {}; for (const k in h) o[k] = syncUnHud(h[k], poison); return o; }
  return h;
}

// A key from the network that names an own entry of a data table (never 'constructor', '__proto__'...).
const syncOwn = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

// A fingerprint of the game data both phones must share (brawlers and maps): different builds
// don't play together.
let syncDV = 0;
function syncDataVer() {
  if (!syncDV) syncDV = hashStr(JSON.stringify(BRAWLERS) + JSON.stringify(MAPS)) || 1;
  return syncDV;
}

// Radius growth per tile of a shot kind ('bk.atk' / 'bk.sup' / 'bk.gad'), from the brawler data.
function syncWave(pk) {
  const p = String(pk).split('.'), D = BRAWLERS[p[0]];
  if (!D) return false;
  if (p[1] === 'gad') return (D.gadgets || []).some((g) => !!g.wave);
  const sp = p[1] === 'sup' ? D.sup : D.atk;
  return !!(sp && sp.wave);
}
function syncGrow(pk) {
  const p = String(pk).split('.'), D = BRAWLERS[p[0]];
  if (!D) return 0;
  if (p[1] === 'gad') return Math.max(0, ...(D.gadgets || []).map((g) => g.grow || 0));
  const sp = p[1] === 'sup' ? D.sup : D.atk;
  return (sp && sp.grow) || 0;
}

// ================= host =================
// Attached to the host's Match: records what happens each tick, sends snapshots, takes the friend's
// inputs and hands their brawler to an AI while they are away.
class SyncHost {
  constructor(match, link, guestSlot) {
    SyncKeys.init();
    const sim = match.sim;
    this.m = match; this.sim = sim; this.link = link; this.gs = guestSlot;
    this.team = sim.brawlers[guestSlot].team;
    this.byId = new Map(sim.brawlers.map((b) => [b.id, b]));
    this.seq = 0; // next event seq
    this.win = []; // the last snapshots' batches
    this.cur = this.batch();
    this.shots = new Map(); // live shot id -> { e, x0 } (for SHOT_END and bounces)
    this.areas = new Map(); // live area id -> area (one that just runs out needs no DESPAWN)
    this.fresh = []; // shots made this tick
    this.tiles = [];
    this.lastSnap = -99; this.lastSnapAt = 0;
    this.t0 = performance.now(); this.lastIn = 0; this.away = false; this.gone = false; this.ended = false;
    this.stats = { n: 0, bytes: 0, max: 0, sizes: [] };
    // every shot as it is made (one that dies on its first tick is gone from sim.shots by the tick's end)
    const self = this, spawn = sim.spawnShot;
    sim.spawnShot = function () { const e = spawn.apply(this, arguments); self.fresh.push(e); return e; };
    match.onTick = () => this.onTick();
    match.sync = this;
    this.send({ t: 'ids', ids: sim.brawlers.map((b) => b.id) });
    for (const a of sim.areas) { this.areas.set(a.id, a); this.cur.A.push(this.areaRec(a, sim.tick)); }
    for (const p of sim.pickups) this.cur.P.push(this.pickRec(p, sim.tick));
  }

  batch() { return { es: this.seq, E: [], S: [], A: [], P: [] }; }
  send(m, fast) { return this.gone ? 0 : this.link.send(m, fast); }

  // The guest is gone for good: the AI keeps their brawler.
  drop() {
    if (this.gone) return;
    this.gone = true;
    this.m.setAway(this.gs, true);
  }

  onNet(m) {
    switch (m.t) {
      case 'i': {
        if (this.gone || !Array.isArray(m.w)) return;
        this.lastIn = performance.now();
        const c = this.m.ctrls[this.gs];
        if (c instanceof RemoteCtrl) c.push(m.s | 0, m.w.slice(-SYNC_WORDS).map((w) => w >>> 0));
        break;
      }
      // chat and resend requests are rate-limited (a flooding friend can't bog the host down)
      case 'pin': if (!this.m.ended && this.limit('pin', 400)) this.m.pin(this.gs, clamp(m.i | 0, 0, PINS.length - 1)); break;
      case 'emo': if (!this.m.ended && this.limit('emo', 400)) this.m.emote(this.gs, clamp(m.i | 0, 0, EMOTES.length - 1)); break;
      case 'rs': if (this.limit('rs', 1000)) this.send({ t: 'PL', P: this.sim.pickups.filter((p) => !p.dead).map((p) => { const r = this.pickRec(p, this.sim.tick); r[0] = 0; return r; }) }); break;
    }
  }

  // True at most once per `ms` for a kind of request.
  limit(kind, ms) {
    const now = performance.now(), L = this.lim || (this.lim = {});
    if (L[kind] && now - L[kind] < ms) return false;
    L[kind] = now;
    return true;
  }

  onTick() {
    const sim = this.sim, k = sim.tick;
    this.shotRecs(k);
    for (const ev of this.m.events) this.onEvent(ev, k);
    if (this.tiles.length) { this.send({ t: 'T', k, l: this.tiles }); this.tiles = []; }
    this.bounces(k);
    const now = performance.now();
    if (sim.over || (k - this.lastSnap >= SYNC_SNAP && (this.m.speed <= 1 || now - this.lastSnapAt >= 30))) this.snap(now);
    if (sim.over && !this.ended) { this.ended = true; this.send({ t: 'end', k, r: sim.result }); }
    this.checkAway(now);
  }

  // Away after SYNC_AWAY ms without inputs (a longer grace while the friend's match is starting).
  checkAway(now) {
    if (this.gone) return;
    const since = now - (this.lastIn || this.t0);
    if (this.lastIn && since > SYNC_GONE) {
      this.send({ t: 'bye' });
      this.drop();
      setTimeout(() => this.link.close('timeout'), 200);
      if (typeof UI !== 'undefined') UI.toast('Your friend lost the connection. An AI plays for them.');
      return;
    }
    const away = since > (this.lastIn ? SYNC_AWAY : 6000);
    if (away === this.away) return;
    this.away = away;
    this.m.setAway(this.gs, away);
    if (this.lastIn && typeof UI !== 'undefined') UI.toast(away ? 'Your friend is not responding. An AI plays for them.' : 'Your friend is back!');
  }

  hidden(b) { return !!b && b.team !== this.team && b.alive && !((b.vis >> this.team) & 1); }

  // Near the guest's screen? (Anywhere while they watch someone else after being knocked out.)
  near(x, y, pad) {
    const sim = this.sim, g = sim.brawlers[this.gs];
    if (!g.alive && g.respawnT < 0) return true;
    if (Math.abs(x - g.x) <= SYNC_FAR_X + pad && Math.abs(y - g.y) <= SYNC_FAR_Y + pad) return true;
    // the view's camera stops at the map edges, so a player near an edge sees farther the other way
    if (this.camK !== sim.tick) {
      const sd = sim.modeKey === MODE.SHOWDOWN;
      this.cam = cameraRect(sim.map, g.x, g.y, g.team === 1 && !sd, sd, this.cam || {});
      this.camK = sim.tick;
    }
    return inRect(this.cam, x, y, pad + 4); // a wider phone than 16:9 sees up to ~3.5 tiles more to each side
  }

  // Shot records for this tick's new shots (a volley shares one record). The friend's own shots are
  // fast-forwarded by half the round trip (at most 100 ms): their attack reached us that late.
  shotRecs(k) {
    if (!this.fresh.length) return;
    const sim = this.sim, kit = sim.brawlers[this.gs].kit;
    const ff = typeof sim.stepStraight === 'function' ? Math.min(3, Math.round(Math.min(100, (this.link.rtt || 0) / 2) / (SIM_DT * 1000))) : 0;
    let last = null;
    for (const e of this.fresh) {
      // made before the shots phase it has already moved once this tick (split spikes made during it haven't)
      let k0 = (e.lob ? e.lob.t > 0 : e.beam > 0 ? e.ttl < 0.15 - 1e-9 : e.trav > 0 || e.dead) ? k - 1 : k;
      const ex0 = e.x0, ey0 = e.y0, ang = e.ang, range = e.range; // the path as made (a bounce changes it)
      if (ff && e.owner === this.gs && !e.dead && !(e.beam > 0) && (e.s === kit.atk || e.s === kit.sup || e.s === kit.gad)) {
        for (let i = 0; i < ff && !e.dead; i++) { e.px = e.x; e.py = e.y; if (e.lob) sim.stepLob(e); else sim.stepStraight(e); }
        k0 -= ff;
      }
      this.shots.set(e.id, { e, x0: ex0, dead: -1 });
      if (!this.near(ex0, ey0, (range || 0) + 2)) { last = null; continue; }
      const fl = (e.sup ? 1 : 0) | (e.lob ? 2 : 0) | (e.beam > 0 ? 4 : 0) | (e.breaks ? 8 : 0) | (e.s && e.s.thru ? 16 : 0);
      const pk = SyncKeys.enc(e.pk), x0 = sq1(ex0), y0 = sq1(ey0), r = sq2(e.r0 || e.r);
      if (fl & 4) { this.cur.S.push([k0, e.id, 1, pk, e.owner, fl, x0, y0, sq1(e.x), sq1(e.y)]); last = null; continue; }
      const a = (fl & 2) ? [sq2(e.lob.T), r, sq2(e.lob.fuse), sq2(e.lob.br)] : [sq1(e.spd), sq1(range), r];
      const same = last && last[1] + last[2] === e.id && last[0] === k0 && last[3] === pk && last[4] === e.owner && last[5] === fl && last[6] === x0 && last[7] === y0 &&
        last[8] === a[0] && last[9] === a[1] && last[10] === a[2] && (!(fl & 2) || last[11] === a[3]);
      if (same) last[2]++;
      else { last = [k0, e.id, 1, pk, e.owner, fl, x0, y0].concat(a); this.cur.S.push(last); }
      if (fl & 2) last.push(sq1(e.lob.tx), sq1(e.lob.ty)); else last.push(Math.round(ang * 1000));
    }
    this.fresh.length = 0;
  }

  // A bouncing shot changed course: send its new path under the same id. Dead shots are forgotten a
  // tick later (one fast-forwarded into a hit reports its SHOT_END on the next tick).
  bounces(k) {
    for (const [id, o] of this.shots) {
      const e = o.e;
      if (e.dead) { if (o.dead < 0) o.dead = k; else if (k - o.dead > 1) this.shots.delete(id); continue; }
      if (e.x0 === o.x0 || e.lob) continue;
      o.x0 = e.x0;
      this.cur.S.push([k, id, 1, SyncKeys.enc(e.pk), e.owner, (e.sup ? 1 : 0) | (e.breaks ? 8 : 0) | (e.s && e.s.thru ? 16 : 0), sq1(e.x0), sq1(e.y0), sq1(e.spd), sq1(e.range), sq2(e.r0 || e.r), Math.round(e.ang * 1000)]);
    }
  }

  areaRec(a, k) {
    return [k, a.id, SyncKeys.enc(a.ak), a.owner, sq1(a.x), sq1(a.y), sq1(a.r), sq1(a.t), sq1(a.T), (a.dmg > 0 ? 1 : 0) | (a.heal > 0 ? 2 : 0) | (a.slow > 0 ? 4 : 0)];
  }

  pickRec(p, k) {
    const r = [k, p.id, p.pick, p.n, sq1(p.x), sq1(p.y)];
    if (p.popT > 0) r.push(sq1(p.x + p.vx * p.popT), sq1(p.y + p.vy * p.popT), sq2(p.popT));
    return r;
  }

  onEvent(ev, k) {
    const sim = this.sim, B = sim.brawlers, me = B[this.gs];
    let x = null, y = null, mine = false;
    switch (ev[0]) {
      case EV.SPAWN:
        if (ev[2] === K.AREA) { const a = sim.areas.find((o) => o.id === ev[1]); if (a) this.areas.set(a.id, a); if (a && this.near(a.x, a.y, a.r + 1)) this.cur.A.push(this.areaRec(a, k)); }
        else if (ev[2] === K.PICKUP) { const p = sim.pickups.find((o) => o.id === ev[1]); if (p) this.cur.P.push(this.pickRec(p, k)); }
        return; // shots go as records; units and the ball are in every snapshot
      case EV.SHOT_END: {
        const o = this.shots.get(ev[1]);
        this.shots.delete(ev[1]);
        const e = o && o.e;
        // the guest ends shots by itself at walls and at full range, and when lobs land or beams fade
        if (!e || e.lob || e.beam > 0 || ev[4] || e.trav >= e.range - 1e-6) return;
        x = ev[2]; y = ev[3]; mine = e.owner === this.gs;
        break;
      }
      case EV.DESPAWN: {
        if (ev[2] === K.SHOT) this.shots.delete(ev[1]);
        else if (ev[2] === K.AREA) { const a = this.areas.get(ev[1]); this.areas.delete(ev[1]); if (!a || a.t <= 0) return; }
        break;
      }
      case EV.TILE: this.tiles.push(ev[1], ev[2]); return;
      case EV.GOAL: case EV.ROUND: this.send({ t: 'e', k, ev }); return;
      case EV.END: return; // the result follows on the reliable channel
      case EV.SUPER_READY: case EV.PIN: if (B[ev[1]].team !== this.team) return; break;
      case EV.HIT: {
        const t = this.byId.get(ev[1]);
        if (this.hidden(t)) return;
        x = ev[3]; y = ev[4]; mine = t === me || ev[5] === this.gs;
        break;
      }
      case EV.FIRE: case EV.HEAL: case EV.PICKUP: case EV.STATUS: case EV.EMOTE: {
        const b = B[ev[1]];
        if (this.hidden(b)) return;
        mine = ev[1] === this.gs || ev[0] === EV.EMOTE;
        x = ev[0] === EV.PICKUP ? ev[4] : ev[0] === EV.STATUS ? b.x : ev[3];
        y = ev[0] === EV.PICKUP ? ev[5] : ev[0] === EV.STATUS ? b.y : ev[4];
        break;
      }
      case EV.DROP: x = ev[3]; y = ev[4]; break;
    }
    if (x !== null && !mine && !this.near(x, y, 2)) return;
    this.cur.E.push(syncEv(ev, k));
    this.seq++;
  }

  snap(now) {
    const sim = this.sim, k = sim.tick, B = sim.brawlers, g = B[this.gs];
    this.win.push(this.cur);
    if (this.win.length > SYNC_EV_WIN) this.win.shift();
    this.cur = this.batch();
    const W = this.win, n = W.length;
    const msg = { t: 's', k };
    if (sim.freezeT > 0) msg.f = sq1(sim.freezeT);
    if (this.m.speed !== 1) msg.x = this.m.speed;
    msg.h = syncHud(sim.hud(), sim.poison);
    if (sim.poison) msg.p = [sq1(sim.poison.x0), sq1(sim.poison.y0), sq1(sim.poison.x1), sq1(sim.poison.y1), sq2(sim.poison.k || 0)];
    const BB = [];
    for (const b of B) {
      if (!b.alive) { BB.push([b.slot, -1, sq1(b.respawnT)]); continue; }
      if (b.team !== this.team && !sim.visibleTo(this.team, b)) continue;
      const jump = b.jumpT > 0, ex = b.carry > 0 || b.bounty > 0 || b.cubes > 0;
      const fl = (b.inBush ? 1 : 0) | (b.supReady ? 2 : 0) | (b.stunT > 0 ? 4 : 0) | (b.slowT > 0 ? 8 : 0) | (b.shieldT > 0 ? 16 : 0) | (b.invisT > 0 ? 32 : 0) |
        (b.speedT > 0 ? 64 : 0) | (b.dashT > 0 ? 128 : 0) | (b.kbT > 0 ? 256 : 0) | (jump ? 512 : 0) | (ex ? 1024 : 0);
      const a = [b.slot, sq2(b.x), sq2(b.y), sqFace(b.face), Math.ceil(b.hp), fl];
      if (jump) a.push(sq2(b.jumpT), sq2(b.jumpTT), sq1(b.jx0), sq1(b.jy0), sq1(b.jx1), sq1(b.jy1));
      if (ex) a.push(b.carry, b.bounty, b.cubes);
      BB.push(a);
    }
    msg.B = BB;
    const gp = g.kit.pass;
    const pm = (gp.lowSpeed && g.hp < g.maxHp * gp.lowSpeed.at ? 1 + gp.lowSpeed.f : 1) * (gp.invisSpeed && g.invisT > 0 ? 1 + gp.invisSpeed : 1);
    msg.m = [sq2(g.ammo), sq2(g.sup), g.gadLeft, sq1(g.gadT), g.lastSeq, sq2(g.slowF), sq2(g.speedF), sq2(pm)];
    const D = [];
    for (const d of sim.deploys) if (!d.dead && this.near(d.x, d.y, 2)) D.push([d.id, SyncKeys.enc(d.dk), d.owner, sq2(d.x), sq2(d.y), Math.ceil(d.hp), d.maxHp, sqFace(d.face)]);
    if (D.length) msg.D = D;
    const bl = sim.ball;
    if (bl) msg.b = [sq2(bl.x), sq2(bl.y), sq2(bl.z || 0), bl.holder];
    const E = [];
    for (const w of W) for (const e of w.E) { const a = e.slice(); a[0] = k - a[0]; E.push(a); }
    if (E.length) { msg.es = W[0].es; msg.E = E; }
    const recs = (key, win) => {
      const out = [];
      for (let i = Math.max(0, n - win); i < n; i++) for (const r of W[i][key]) { const a = r.slice(); a[0] = k - a[0]; out.push(a); }
      return out;
    };
    const S = recs('S', SYNC_REC_WIN), A = recs('A', SYNC_REC_WIN), P = recs('P', SYNC_PICK_WIN);
    if (S.length) msg.S = S;
    if (A.length) msg.A = A;
    if (P.length) msg.P = P;
    let pn = 0, ps = 0;
    for (const p of sim.pickups) if (!p.dead) { pn++; ps = (ps + p.id) & 0xffff; }
    msg.pc = [pn, ps];
    const size = this.send(msg, !this.sim.over); // the final one (the last events) must arrive
    const st = this.stats;
    st.n++; st.bytes += size; st.max = Math.max(st.max, size);
    st.sizes.push(size);
    if (st.sizes.length > 600) st.sizes.shift();
    this.lastSnap = k;
    this.lastSnapAt = now;
  }
}

// ================= guest =================
// The world as the guest sees it: the Sim's fields and entity shapes, filled from snapshots.
class GuestState {
  constructor(cfg) {
    this.cfg = cfg;
    this.modeKey = cfg.mode;
    this.map = cloneMap(parseMap(cfg.map));
    this.nTeams = 0;
    for (const s of cfg.slots) this.nTeams = Math.max(this.nTeams, s.team + 1);
    this.tick = 0; this.t = 0; this.freezeT = 0; this.over = false; this.result = null;
    this.shots = []; this.areas = []; this.pickups = []; this.deploys = []; this.ball = null; this.poison = null;
    this.pins = []; this.events = []; this.deathOrder = [];
    this._hud = { mode: cfg.mode, time: 0 };
    this.brawlers = cfg.slots.map((s, i) => {
      const star = s.star == null ? -1 : s.star, gad = s.gadget == null ? -1 : s.gadget;
      const kit = brawlerKit(s.bk, star, gad), lvl = s.lvl || 1, hp = Math.round(kit.hp * LEVEL_MULT(lvl));
      return {
        id: i + 1, kind: K.BRAWLER, team: s.team, x: 0, y: 0, px: 0, py: 0, r: BRAWLER_R, dead: false,
        slot: i, bk: s.bk, lvl, gadget: kit.gad ? gad : -1, star, name: s.name || kit.D.name,
        hp, maxHp: hp, hp0: hp, alive: true, respawnT: 0, face: 0,
        ammo: MAX_AMMO, reload: kit.reload, sup: 0, supReady: false, gadLeft: kit.gad ? 3 : 0, gadT: 0,
        cubes: 0, carry: 0, bounty: 0,
        vis: 1 << s.team, inBush: false, revealT: 0, quietT: 0, shieldT: 0,
        stunT: 0, slowT: 0, slowF: 0, kbT: 0, kbx: 0, kby: 0, dashT: 0, invisT: 0, speedT: 0, speedF: 0,
        mvx: 0, mvy: 0, lastSeq: 0, st: { kills: 0, deaths: 0, dmg: 0, heal: 0, gems: 0, goals: 0, stars: 0 },
        kit, pk: [s.bk, s.bk + '.atk', s.bk + '.sup', s.bk + '.gad'], speed: kit.speed * (1 + (kit.pass.speedMul || 0)),
        jumpT: 0, jumpTT: 0, jx0: 0, jy0: 0, jx1: 0, jy1: 0,
      };
    });
  }
  hud() { return this._hud; }
  visibleTo(team, e) { return e.kind === K.BRAWLER ? ((e.vis >> team) & 1) === 1 : true; }
}

// The guest's match runner: the same interface the Game uses for a Match (update, draw, quit, onEnd,
// cfg, local, net, ended, sim.over, ctrls for __BS.autoplay).
class GuestMatch {
  constructor(cfg, opts) {
    SyncKeys.init();
    this.cfg = cfg;
    this.net = 'guest';
    this.link = opts.link;
    this.local = cfg.localSlot;
    this.state = new GuestState(cfg);
    this.sim = this.state;
    this.pmap = cloneMap(this.state.map); // tiles as of now, for prediction (the view's map follows the timeline)
    this.ctrls = [];
    this.ctrls[this.local] = new LocalCtrl(this.local);
    this.speed = 1; this.paused = false; this.ended = false; this.endT = 0; this.voided = false;
    this.onEnd = null; this.telemetry = null; this.events = [];
    // snapshots and the timeline
    this.buf = []; // decoded snapshots, oldest first
    this.latest = null; this.newest = -1; this.newestAt = 0; this.lastSnapAt = performance.now();
    this.rate = SIM_HZ; this.off = null; this.jit = 0; this.delay = 100; this.rt = 0; this.ready = false;
    this.F = 0; // frozen ticks so far on the render timeline (nothing flies while the world is frozen)
    this.tl = []; // pending timeline items, sorted by (k, o, seq)
    this.evSeen = new Set(); this.evMax = -1;
    this.shotRec = new Map(); // shot id -> { x0, y0, a } of its last record (dedupe, bounces)
    this.shotDone = new Set(); // shots that ended (a late record must not bring them back)
    this.areaSeen = new Set(); this.pickSeen = new Map(); // pickup id -> alive (as far as the host told us)
    this.pcBad = 0; this.rsAt = 0;
    this.dep = new Map(); this.frameN = 0; // deploy id -> mirror object
    this.endAt = 0; this.endItem = null;
    // own brawler: prediction
    this.seq = 0; this.words = []; this.acc = 0;
    this.hist = []; // { s, w, x, y } predicted position after input s
    this.pred = { x: 0, y: 0 }; this.off2 = { x: 0, y: 0 }; this._mv = { x: 0, y: 0 };
    this.ballOff = { x: 0, y: 0, lx: 0, ly: 0, held: false };
    this.pend = []; // own actions not yet confirmed { s, act }
    this.fired = new Set(); this.atkCd = 0; this.faceT = 0; this.fireAng = 0;
    this.err = { n: 0, sum: 0, max: 0, snaps: 0 };
    this._in = {}; this._o = { x: 0, y: 0 };
    const me = this.state.brawlers[this.local];
    this.flip = me.team === 1 && cfg.mode !== MODE.SHOWDOWN;
    Input.reset();
    Input.setFlip(this.flip);
    Input.enabled = true;
    Input.onPin = (i) => this.link.send({ t: 'pin', i });
    Input.onEmote = (i) => this.link.send({ t: 'emo', i });
    View.reset(this.local);
    View.aim = Match.NO_AIM;
  }

  get me() { return this.state.brawlers[this.local]; }

  // ---- network ----
  onNet(m) {
    switch (m.t) {
      case 's': this.onSnap(m); break;
      case 'ids': if (Array.isArray(m.ids)) m.ids.forEach((id, i) => { if (this.state.brawlers[i]) this.state.brawlers[i].id = id; }); break;
      case 'T':
        for (let i = 0; i + 1 < m.l.length; i += 2) this.pmap.tiles[m.l[i]] = m.l[i + 1];
        this.queue({ k: m.k, o: 1, seq: 0, type: 'tile', l: m.l });
        break;
      case 'e': this.queue({ k: m.k, o: 1, seq: 0, type: 'ev', ev: m.ev }); break;
      case 'end':
        if (this.endItem) break;
        this.endAt = performance.now();
        this.endItem = { k: m.k, o: 3, seq: 0, type: 'end', r: m.r };
        this.queue(this.endItem);
        break;
      case 'PL': this.pickList(m.P || []); break;
    }
  }

  queue(it) {
    const q = this.tl;
    let i = q.length;
    while (i > 0) {
      const p = q[i - 1];
      if (p.k < it.k || (p.k === it.k && (p.o < it.o || (p.o === it.o && p.seq <= it.seq)))) break;
      i--;
    }
    q.splice(i, 0, it);
  }

  onSnap(m) {
    const now = performance.now();
    this.lastSnapAt = now;
    const er = this.err;
    er.snaps++;
    const k = m.k;
    if (k <= this.newest - 40 || this.buf.some((s) => s.k === k)) return;
    const poison = m.p ? { x0: m.p[0] / 10, y0: m.p[1] / 10, x1: m.p[2] / 10, y1: m.p[3] / 10, k: (m.p[4] || 0) / 100 } : null;
    const s = { k, f: (m.f || 0) / 10, x: m.x || 1, hud: syncUnHud(m.h, poison), poison, B: [], me: m.m, D: m.D || [], ball: m.b || null, at: now };
    for (const r of m.B || []) {
      const slot = r[0];
      if (r[1] === -1) { s.B[slot] = { dead: true, rt: r[2] / 10 }; continue; }
      const o = { dead: false, x: r[1] / 100, y: r[2] / 100, face: (r[3] / 64) * TAU, hp: r[4], fl: r[5], carry: 0, bounty: 0, cubes: 0, jumpT: 0 };
      let i = 6;
      if (o.fl & 512) { o.jumpT = r[i] / 100; o.jumpTT = r[i + 1] / 100; o.jx0 = r[i + 2] / 10; o.jy0 = r[i + 3] / 10; o.jx1 = r[i + 4] / 10; o.jy1 = r[i + 5] / 10; i += 6; }
      if (o.fl & 1024) { o.carry = r[i]; o.bounty = r[i + 1]; o.cubes = r[i + 2]; }
      s.B[slot] = o;
    }
    // into the buffer (kept in tick order; the unreliable channel may reorder)
    let i = this.buf.length;
    while (i > 0 && this.buf[i - 1].k > k) i--;
    this.buf.splice(i, 0, s);
    if (this.buf.length > 32) this.buf.shift();
    if (k > this.newest) {
      this.clock(s, now);
      this.newest = k; this.newestAt = now;
      const prev = this.latest;
      this.latest = s;
      this.reconcile(s, prev);
      if (!this.ready) this.start(s);
    }
    // events: each one once, by seq
    if (m.E) {
      for (let j = 0; j < m.E.length; j++) {
        const seq = m.es + j;
        if (seq <= this.evMax - 400 || this.evSeen.has(seq)) continue;
        this.evSeen.add(seq);
        if (seq > this.evMax) this.evMax = seq;
        const e = m.E[j];
        if (e[1] === EV.DESPAWN && e[3] === K.PICKUP) this.pickSeen.set(e[2], false); // gone on the host now
        this.queue({ k: k - e[0], o: 2, seq, type: 'ev', ev: e.slice(1) });
      }
      if (this.evSeen.size > 600) for (const q of this.evSeen) if (q < this.evMax - 400) this.evSeen.delete(q);
    }
    for (const r of m.S || []) this.shotRecord(r, k);
    for (const r of m.A || []) {
      if (this.areaSeen.has(r[1])) continue;
      this.areaSeen.add(r[1]);
      this.queue({ k: k - r[0], o: 0, seq: 0, type: 'area', r });
    }
    for (const r of m.P || []) {
      if (this.pickSeen.has(r[1])) continue;
      this.pickSeen.set(r[1], true);
      this.queue({ k: k - r[0], o: 0, seq: 0, type: 'pick', r });
    }
    // pickups the host has vs the ones we know of: ask for the list if they stay different
    if (m.pc && k === this.newest) {
      let n = 0, sum = 0;
      for (const [id, alive] of this.pickSeen) if (alive) { n++; sum = (sum + id) & 0xffff; }
      if (n !== m.pc[0] || sum !== m.pc[1]) {
        if (++this.pcBad > 12 && now - this.rsAt > 2000) { this.rsAt = now; this.pcBad = 0; this.link.send({ t: 'rs' }); }
      } else this.pcBad = 0;
    }
  }

  shotRecord(r, k) {
    const id = r[1], n = r[2], fl = r[5];
    const o = this.shotRec.get(id);
    if (o) {
      // a record we have: a new path for a bounced shot, else a repeat
      if (n === 1 && !(fl & 6) && (o.x0 !== r[6] || o.y0 !== r[7] || o.a !== r[11])) {
        o.x0 = r[6]; o.y0 = r[7]; o.a = r[11];
        this.queue({ k: k - r[0], o: 0, seq: 0, type: 'bounce', r, k0: k - r[0] });
      }
      return;
    }
    for (let i = 0; i < n; i++) this.shotRec.set(id + i, { x0: r[6], y0: r[7], a: fl & 6 ? 0 : r[11 + i] });
    if (this.shotRec.size > 500) { let c = this.shotRec.size - 400; for (const key of this.shotRec.keys()) { if (c-- <= 0) break; this.shotRec.delete(key); } }
    this.queue({ k: k - r[0] + 1, o: 0, seq: 0, type: 'shot', r, k0: k - r[0] });
  }

  // Replaces the pickups with the host's list (after we asked: something got lost on the way).
  pickList(P) {
    const st = this.state, ids = new Set(P.map((r) => r[1]));
    for (const [id] of this.pickSeen) if (!ids.has(id)) this.pickSeen.set(id, false);
    st.pickups = st.pickups.filter((p) => ids.has(p.id));
    for (const r of P) if (!st.pickups.some((p) => p.id === r[1])) { this.pickSeen.set(r[1], true); this.addPickup(r, this.rt); }
  }

  // Render clock: the host's tick estimated from the earliest-arriving snapshots, minus an adaptive delay.
  clock(s, now) {
    const rate = SIM_HZ * s.x;
    if (rate !== this.rate) { this.rate = rate; this.off = null; }
    const off = s.k - (now * rate) / 1000;
    if (this.off == null) { this.off = off; this.jit = 0; this.rt = Math.max(this.rt, s.k - 3); return; }
    const d = off - this.off;
    this.off += d > 0 ? d * 0.3 : d * 0.04; // early packets lift the estimate fast, late ones pull it slowly
    this.jit += ((Math.abs(d) * 1000) / rate - this.jit) * 0.1;
  }

  start(s) {
    this.ready = true;
    const r = s.B[this.local];
    if (r && !r.dead) { this.pred.x = r.x; this.pred.y = r.y; }
    this.rt = Math.max(this.rt, s.k - 3);
  }

  // ---- own brawler: prediction and reconciliation ----
  control(s) {
    const r = s && s.B[this.local];
    return !!r && !r.dead && !(r.fl & (4 | 128 | 256 | 512)) && s.f <= 0;
  }
  moveSpeed(s) {
    const r = s.B[this.local], m = s.me || [];
    let k = this.me.speed;
    if (r.fl & 8) k *= 1 - (m[5] || 0) / 100;
    if (r.fl & 64) k *= 1 + (m[6] || 0) / 100;
    if (m[7]) k *= m[7] / 100;
    return k;
  }
  step(x, y, w, sp, out) {
    const I = unpackIn(w, this._in);
    out.x = x; out.y = y;
    if (!I.mvM) return out;
    const k = sp * SIM_DT;
    return moveCircle(this.pmap, x, y, BRAWLER_R, I.mx * k, I.my * k, out);
  }

  reconcile(s, prev) {
    const r = s.B[this.local];
    if (!r || !s.me) return;
    const ack = s.me[4];
    this.pend = this.pend.filter((p) => p.s > ack);
    if (r.dead) return;
    const H = this.hist;
    while (H.length && H[0].s < ack) H.shift();
    let x = r.x, y = r.y;
    const ctl = this.control(s);
    if (ctl) {
      // how far off the prediction for the acknowledged input was (for tests and tuning)
      if (H.length && H[0].s === ack && this.control(prev) && ack > 0) {
        const e = Math.hypot(r.x - H[0].x, r.y - H[0].y);
        if (e < 4) { this.err.n++; this.err.sum += e; this.err.max = Math.max(this.err.max, e); }
      }
      const sp = this.moveSpeed(s), o = this._o;
      for (const h of H) {
        if (h.s <= ack) continue;
        this.step(x, y, h.w, sp, o);
        x = h.x = o.x; y = h.y = o.y;
      }
    }
    const dx = x - this.pred.x, dy = y - this.pred.y, d = Math.hypot(dx, dy);
    if (d < 0.05) return; // small: not worth a visible correction
    if (d > 2.5) { this.off2.x = this.off2.y = 0; } // large: snap
    else { this.off2.x -= dx; this.off2.y -= dy; } // medium: the display eases over (~150 ms)
    this.pred.x = x; this.pred.y = y;
  }

  // One local tick: read the controls (or the autoplay bot), send the word, move the own brawler.
  localTick() {
    const st = this.state, me = this.me;
    Input.setLocal(me.alive ? me : null, BRAWLERS[me.bk]);
    Input.ball = !!(me.alive && ((this.latest && this.latest.ball && this.latest.ball[3] === this.local) || (st.ball && st.ball.holder === this.local)));
    const c = this.ctrls[this.local];
    let w = 0;
    if (this.ready) w = (c.tick ? c.tick(st) : c.word(st)) >>> 0;
    else Input.word(); // keeps the controls polled until the first snapshot
    if (c.outPin != null) { this.link.send({ t: 'pin', i: c.outPin }); c.outPin = null; }
    if (c.outEmote != null) { this.link.send({ t: 'emo', i: c.outEmote }); c.outEmote = null; }
    const seq = ++this.seq;
    this.words.push(w);
    if (this.words.length > SYNC_WORDS) this.words.shift();
    this.link.send({ t: 'i', s: seq, w: this.words }, true);
    const L = this.latest, mv = this._mv;
    mv.x = mv.y = 0;
    if (this.control(L)) {
      const o = this.step(this.pred.x, this.pred.y, w, this.moveSpeed(L), this._o);
      mv.x = (o.x - this.pred.x) / SIM_DT; mv.y = (o.y - this.pred.y) / SIM_DT;
      this.pred.x = o.x; this.pred.y = o.y;
      const I = this._in;
      if (I.mvM > 0 && this.faceT <= 0) me.face = I.mvA;
      if (I.act) this.localFire(I, seq);
    }
    this.hist.push({ s: seq, w, x: this.pred.x, y: this.pred.y });
    if (this.hist.length > 120) this.hist.shift();
    if (this.atkCd > 0) this.atkCd -= SIM_DT;
    if (this.faceT > 0) this.faceT -= SIM_DT;
  }

  // Muzzle flash, sound, pose and ammo at once on the guest's own attack (the host's FIRE is skipped).
  localFire(I, seq) {
    const me = this.me, kit = me.kit, act = I.act, L = this.latest;
    if (act !== ACT.GADGET && ((L && L.ball && L.ball[3] === this.local) || (this.state.ball && this.state.ball.holder === this.local))) return; // a kick, not a shot
    let s = null;
    if (act === ACT.ATTACK) { if (me.ammo < 1 || this.atkCd > 0) return; s = kit.atk; this.atkCd = s.cd || (s.burst ? (s.n - 1) * s.burst + 0.15 : 0.3); }
    else if (act === ACT.SUPER) { if (!me.supReady) return; s = kit.sup; }
    else { s = kit.gad; if (!s || me.gadLeft <= 0 || me.gadT > 0) return; }
    let ang = I.aimA;
    if (I.auto) {
      const range = (s.range || s.dist || 0) + 1;
      let bd = range * range, tg = null;
      for (const e of this.state.brawlers) {
        if (!e.alive || e.team === me.team || !((e.vis >> me.team) & 1)) continue;
        const d2 = dist2(me.x, me.y, e.x, e.y);
        if (d2 < bd) { bd = d2; tg = e; }
      }
      ang = tg ? (s.away ? Math.atan2(me.y - tg.y, me.x - tg.x) : Math.atan2(tg.y - me.y, tg.x - me.x)) : me.face;
    }
    this.pend.push({ s: seq, act });
    this.fired.add(seq);
    if (this.fired.size > 64) this.fired.delete(this.fired.values().next().value);
    me.face = ang; this.fireAng = ang; this.faceT = 0.35;
    this.fx([EV.FIRE, this.local, act, me.x, me.y, ang, seq]);
    this.refreshMe(0);
  }

  // ---- per frame ----
  update(dt) {
    if (this.paused) return;
    if (this.ended) { this.endT += dt; return; }
    const now = performance.now();
    this.acc = Math.min(this.acc + dt, SIM_DT * 6);
    let n = 0;
    while (this.acc >= SIM_DT && n < 5) { this.localTick(); this.acc -= SIM_DT; n++; }
    if (this.ready) {
      this.advance(dt, now);
      this.runTimeline(now);
      if (this.ended) return;
      this.interp();
      this.flyAll();
      this.refreshMe(dt);
      const me = this.me, hud = this.state.hud();
      if (typeof Sound !== 'undefined') { Sound.ear(me.x, me.y, this.flip); Sound.onHud(hud, me.team); }
      if (typeof Music !== 'undefined') Music.intensity = Match.prototype.intensity.call({ sim: this.state });
    }
    // the host went quiet or left: this match can't go on
    if (!this.endItem && (now - this.lastSnapAt > SYNC_GONE || (this.link.closed && now - this.lastSnapAt > 1500))) this.voidMatch('Lost the connection to your friend. The match was cancelled.');
  }

  advance(dt, now) {
    const tgt = (this.jit * 2.5 + (SYNC_SNAP * 1000) / SIM_HZ * 1.2) * (this.rate > SIM_HZ ? 0.5 : 1);
    this.delay += (clamp(tgt, 70, 200) - this.delay) * Math.min(1, dt * 0.5);
    const target = this.off + (now * this.rate) / 1000 - (this.delay * this.rate) / 1000;
    let rt = this.rt + dt * this.rate;
    const e = target - rt;
    if (Math.abs(e) > this.rate) rt = target; else rt += e * Math.min(1, dt * 4);
    if (this.endItem && now - this.endAt > 700) rt = Math.max(rt, this.endItem.k);
    else rt = Math.min(rt, this.newest);
    rt = Math.max(this.rt, rt); // never backwards: the timeline has already played
    if (this.state.freezeT > 0) this.F += rt - this.rt;
    this.rt = rt;
  }

  runTimeline() {
    const q = this.tl;
    while (q.length && q[0].k <= this.rt && !this.ended) {
      const it = q.shift();
      switch (it.type) {
        case 'ev': this.onEvent(it.ev); break;
        case 'shot': this.addShots(it.r, it.k0); break;
        case 'bounce': this.bounce(it.r, it.k0); break;
        case 'area': this.addArea(it.r, it.k); break;
        case 'pick': this.addPickup(it.r, it.k); break;
        case 'tile': {
          const t = this.state.map.tiles;
          for (let i = 0; i + 1 < it.l.length; i += 2) { t[it.l[i]] = it.l[i + 1]; this.fx([EV.TILE, it.l[i], it.l[i + 1]]); }
          break;
        }
        case 'end': this.finish(it.r); break;
      }
    }
  }

  fx(ev) {
    const st = this.state;
    View.onEvent(ev, st);
    if (typeof Sound !== 'undefined') Sound.onEvent(ev, st, this.local);
    if (typeof Game === 'undefined') return;
    if (ev[0] === EV.HIT && ev[1] === this.me.id) Game.vibrate(18);
    else if (ev[0] === EV.KILL && ev[1] === this.local) Game.vibrate(70);
  }

  onEvent(ev) {
    const st = this.state;
    switch (ev[0]) {
      case EV.FIRE: if (ev[1] === this.local && this.fired.has(ev[6])) return; break;
      case EV.SHOT_END: {
        const s = st.shots.find((o) => o.id === ev[1]);
        if (!s) this.done(ev[1]);
        if (s) { s.x = s.px = ev[2]; s.y = s.py = ev[3]; }
        this.fx(ev);
        if (s) { s.dead = true; st.shots.splice(st.shots.indexOf(s), 1); }
        return;
      }
      case EV.DESPAWN: {
        this.fx(ev);
        const kind = ev[2], id = ev[1];
        if (kind === K.SHOT) { st.shots = st.shots.filter((o) => o.id !== id); this.done(id); }
        else if (kind === K.AREA) st.areas = st.areas.filter((o) => o.id !== id);
        else if (kind === K.PICKUP) { st.pickups = st.pickups.filter((o) => o.id !== id); this.pickSeen.set(id, false); }
        return;
      }
      case EV.PIN: st.pins.push({ slot: ev[1], id: ev[2], t: st.t }); if (st.pins.length > 8) st.pins.shift(); break;
      case EV.KILL: st.deathOrder.push(ev[1]); break;
      case EV.TILE: this.state.map.tiles[ev[1]] = ev[2]; this.pmap.tiles[ev[1]] = ev[2]; break;
    }
    this.fx(ev);
  }

  // ---- projectiles, areas and pickups flown by the guest ----
  done(id) {
    this.shotDone.add(id);
    if (this.shotDone.size > 300) this.shotDone.delete(this.shotDone.values().next().value);
  }

  addShots(r, k0) {
    const st = this.state, n = r[2], fl = r[5], owner = r[4], ob = st.brawlers[owner];
    const pk = SyncKeys.dec(r[3]), x0 = r[6] / 10, y0 = r[7] / 10;
    for (let i = 0; i < n; i++) {
      if (this.shotDone.has(r[1] + i)) continue;
      const s = {
        id: r[1] + i, kind: K.SHOT, team: ob ? ob.team : -1, owner, pk, sup: !!(fl & 1), breaks: !!(fl & 8), thru: !!(fl & 16),
        x: x0, y: y0, px: x0, py: y0, x0, y0, ang: 0, vx: 1, vy: 0, spd: 0, range: 0, r: 0.15, trav: 0,
        lob: null, beam: 0, ttl: 0, dead: false, p0: k0 - this.F, endL: 0, wall: 0, s: null,
      };
      if (fl & 4) {
        s.x = s.px = r[8] / 10; s.y = s.py = r[9] / 10;
        s.range = s.trav = s.beam = Math.max(0.01, Math.hypot(s.x - x0, s.y - y0));
        s.ang = Math.atan2(s.y - y0, s.x - x0); s.r = 0.1; s.ttl = 0.15;
      } else if (fl & 2) {
        const tx = r[12 + i * 2] / 10, ty = r[13 + i * 2] / 10, T = r[8] / 100;
        s.lob = { tx, ty, T, t: 0, fuse: r[10] / 100, br: r[11] / 100 };
        s.r = r[9] / 100;
        s.range = Math.hypot(tx - x0, ty - y0);
        s.spd = s.range / Math.max(0.01, T);
        s.ang = Math.atan2(ty - y0, tx - x0);
      } else {
        s.spd = r[8] / 10; s.range = r[9] / 10; s.r = s.r0 = r[10] / 100;
        s.grow = syncGrow(pk); // shots that widen as they travel
        if (syncWave(pk)) s.grp = pk + '@' + owner + '@' + k0; // parts of one wave, drawn as one band
        this.path(s, r[11 + i] / 1000, x0, y0, s.range);
      }
      s.vx = Math.cos(s.ang); s.vy = Math.sin(s.ang);
      st.shots.push(s);
      this.fx([EV.SPAWN, s.id, K.SHOT]);
      if (!this.fly(s)) { s.dead = true; st.shots.pop(); } // already over by the time it reached us
    }
  }

  // Straight path from (x0, y0): where it stops by itself (wall, stone for wall-breakers, full range).
  path(s, ang, x0, y0, range) {
    const m = this.state.map;
    s.ang = ang; s.vx = Math.cos(ang); s.vy = Math.sin(ang); s.x0 = x0; s.y0 = y0; s.range = range;
    s.endL = range; s.wall = 0;
    if (s.breaks) {
      for (let d = 0.1; d < range + 0.05; d += 0.1) {
        if (tileAt(m, x0 + s.vx * Math.min(d, range), y0 + s.vy * Math.min(d, range)) === TILE.STONE) { s.endL = Math.max(0, d - 0.1); s.wall = 1; break; }
      }
    } else if (!s.thru) {
      const t = rayHit(m, x0, y0, x0 + s.vx * range, y0 + s.vy * range, TF_SHOT, null);
      if (t >= 0) { s.endL = range * t; s.wall = 1; }
    }
  }

  bounce(r, k0) {
    const s = this.state.shots.find((o) => o.id === r[1]);
    if (!s || s.lob || s.beam) return;
    s.p0 = k0 - this.F;
    s.spd = r[8] / 10; s.r = s.r0 = r[10] / 100;
    this.path(s, r[11] / 1000, r[6] / 10, r[7] / 10, r[9] / 10);
  }

  // Moves a shot to the render time; false (and its end shown) once it is over.
  fly(s) {
    const el = (this.rt - this.F - s.p0) * SIM_DT;
    if (s.beam > 0) {
      s.ttl = 0.15 - el;
      if (s.ttl > 0) return true;
      this.fx([EV.SHOT_END, s.id, s.x, s.y, 0]);
      return false;
    }
    if (s.lob) {
      const L = s.lob, k = clamp(el / L.T, 0, 1);
      L.t = Math.max(0, el);
      s.x = s.px = s.x0 + (L.tx - s.x0) * k; s.y = s.py = s.y0 + (L.ty - s.y0) * k;
      s.trav = s.range * k;
      if (k < 1 || el < L.fuse) return true; // in flight, or lying lit on the ground
      this.fx([EV.SHOT_END, s.id, L.tx, L.ty, 0]);
      return false;
    }
    const d = clamp(s.spd * el, 0, s.endL);
    s.trav = d;
    if (s.grow) s.r = s.r0 + s.grow * d;
    s.x = s.px = s.x0 + s.vx * d; s.y = s.py = s.y0 + s.vy * d;
    if (d < s.endL - 1e-6) return true;
    this.fx([EV.SHOT_END, s.id, s.x, s.y, s.wall]);
    return false;
  }

  addArea(r, k) {
    const st = this.state, ob = st.brawlers[r[3]], fl = r[9];
    const a = {
      id: r[1], kind: K.AREA, team: ob ? ob.team : -1, owner: r[3], ak: SyncKeys.dec(r[2]), x: r[4] / 10, y: r[5] / 10, px: r[4] / 10, py: r[5] / 10,
      r: r[6] / 10, t: r[7] / 10, T: r[8] / 10, t0: r[7] / 10, p0: k - this.F, dmg: fl & 1 ? 1 : 0, heal: fl & 2 ? 1 : 0, slow: fl & 4 ? 0.3 : 0, dead: false,
    };
    a.t = a.t0 - (this.rt - this.F - a.p0) * SIM_DT;
    if (a.t <= 0) return;
    st.areas.push(a);
    this.fx([EV.SPAWN, a.id, K.AREA]);
  }

  addPickup(r, k) {
    const st = this.state;
    if (!this.pickSeen.get(r[1]) && this.pickSeen.has(r[1])) return; // taken already
    const x = r[4] / 10, y = r[5] / 10;
    const p = { id: r[1], kind: K.PICKUP, team: -1, x, y, px: x, py: y, r: 0.3, dead: false, pick: r[2], n: r[3], vx: 0, vy: 0, t: 0, popT: 0, p0: k - this.F, ox: x, oy: y, tx: x, ty: y, pT: 0 };
    if (r.length > 6) { p.tx = r[6] / 10; p.ty = r[7] / 10; p.pT = r[8] / 100; }
    st.pickups.push(p);
  }

  flyAll() {
    const st = this.state;
    if (st.shots.length) st.shots = st.shots.filter((s) => (this.fly(s) ? true : ((s.dead = true), false)));
    if (st.areas.length) {
      for (const a of st.areas) a.t = a.t0 - (this.rt - this.F - a.p0) * SIM_DT;
      st.areas = st.areas.filter((a) => a.t > 0);
    }
    for (const p of st.pickups) {
      const el = Math.max(0, (this.rt - this.F - p.p0) * SIM_DT);
      p.t = el;
      const k = p.pT > 0 ? Math.min(1, el / p.pT) : 1;
      p.x = p.px = p.ox + (p.tx - p.ox) * k; p.y = p.py = p.oy + (p.ty - p.oy) * k;
    }
    if (st.pins.length && st.t - st.pins[0].t > 4) st.pins.shift();
  }

  // ---- others: interpolated between the two snapshots around the render time ----
  interp() {
    const st = this.state, buf = this.buf, rt = this.rt;
    if (!buf.length) return;
    let i = buf.length - 1;
    while (i > 0 && buf[i].k > rt) i--;
    const s0 = buf[i], s1 = s0.k <= rt && i + 1 < buf.length ? buf[i + 1] : null;
    if (i > 1) buf.splice(0, i - 1); // keep one older than the pair
    const a = s1 ? clamp((rt - s0.k) / (s1.k - s0.k), 0, 1) : 0;
    const span = s1 ? (s1.k - s0.k) * SIM_DT : 1;
    st.tick = Math.floor(rt);
    st.t = rt * SIM_DT;
    st.freezeT = s0.f;
    st._hud = s0.hud;
    st.poison = s0.poison;
    const all = (1 << st.nTeams) - 1;
    for (const b of st.brawlers) {
      if (b.slot === this.local) continue;
      const r0 = s0.B[b.slot], r1 = s1 && s1.B[b.slot];
      if (r0 === undefined) { b.vis = 1 << b.team; b.mvx = b.mvy = 0; continue; } // hidden from us
      b.vis = all;
      if (r0.dead) {
        if (b.alive) { b.alive = false; b.mvx = b.mvy = 0; }
        b.respawnT = r0.rt > 0 ? Math.max(0.01, r0.rt - (rt - s0.k) * SIM_DT) : r0.rt;
        b.inBush = false;
        continue;
      }
      b.alive = true;
      let x = r0.x, y = r0.y, face = r0.face;
      b.mvx = b.mvy = 0;
      if (r1 && !r1.dead && Math.abs(r1.x - r0.x) + Math.abs(r1.y - r0.y) < 3) {
        x += (r1.x - r0.x) * a; y += (r1.y - r0.y) * a;
        face += angDiff(r0.face, r1.face) * a;
        b.mvx = (r1.x - r0.x) / span; b.mvy = (r1.y - r0.y) / span;
      }
      b.x = b.px = x; b.y = b.py = y; b.face = face;
      this.fields(b, r0);
    }
    // units
    const D = st.deploys, fn = ++this.frameN;
    D.length = 0;
    for (const r of s0.D) {
      let o = this.dep.get(r[0]);
      const fresh = !o;
      if (!o) { o = { id: r[0], kind: K.DEPLOY, team: 0, x: 0, y: 0, px: 0, py: 0, r: 0.5, dead: false, owner: r[2], dk: SyncKeys.dec(r[1]), hp: 0, maxHp: 1, face: 0, t: 0, mvx: 0, mvy: 0 }; this.dep.set(r[0], o); }
      const ob = st.brawlers[r[2]];
      o.team = ob ? ob.team : 0;
      let x = r[3] / 100, y = r[4] / 100;
      const q = s1 ? s1.D.find((d) => d[0] === r[0]) : null;
      if (q) { x += (q[3] / 100 - x) * a; y += (q[4] / 100 - y) * a; }
      o.mvx = (x - o.x) * 30; o.mvy = (y - o.y) * 30;
      o.x = o.px = x; o.y = o.py = y; o.hp = r[5]; o.maxHp = r[6]; o.face = (r[7] / 64) * TAU;
      o.seen = fn;
      D.push(o);
      if (fresh) this.fx([EV.SPAWN, o.id, K.DEPLOY]);
    }
    if (this.dep.size > D.length) for (const [id, o] of this.dep) if (o.seen !== fn) { o.dead = true; this.dep.delete(id); }
    // the ball
    if (s0.ball) {
      const bl = st.ball || (st.ball = { id: 0, kind: K.BALL, team: -1, x: 0, y: 0, px: 0, py: 0, r: 0.35, dead: false, holder: -1, vx: 0, vy: 0, z: 0 });
      const b0 = s0.ball, b1 = s1 && s1.ball;
      let x = b0[0] / 100, y = b0[1] / 100, z = b0[2] / 100;
      bl.vx = bl.vy = 0;
      if (b1 && Math.abs(b1[0] - b0[0]) + Math.abs(b1[1] - b0[1]) < 400) {
        x += (b1[0] / 100 - x) * a; y += (b1[1] / 100 - y) * a; z += (b1[2] / 100 - z) * a;
        bl.vx = (b1[0] - b0[0]) / 100 / span; bl.vy = (b1[1] - b0[1]) / 100 / span;
      }
      bl.x = bl.px = x; bl.y = bl.py = y; bl.z = z; bl.holder = b0[3];
    } else st.ball = null;
  }

  // Status and score fields of a brawler from its snapshot record.
  fields(b, r) {
    const fl = r.fl, on = (bit) => (fl & bit ? 1 : 0);
    b.hp = r.hp; b.cubes = r.cubes; b.maxHp = b.hp0 + r.cubes * CUBE_HP; b.carry = r.carry; b.bounty = r.bounty;
    b.inBush = !!on(1); b.supReady = !!on(2); b.sup = b.supReady ? 1 : b.slot === this.local ? b.sup : 0;
    b.stunT = on(4); b.slowT = on(8); b.shieldT = on(16); b.invisT = on(32); b.speedT = on(64); b.dashT = on(128); b.kbT = on(256);
    if (fl & 512) { b.jumpT = r.jumpT; b.jumpTT = r.jumpTT; b.jx0 = r.jx0; b.jy0 = r.jy0; b.jx1 = r.jx1; b.jy1 = r.jy1; } else b.jumpT = 0;
  }

  // The own brawler: predicted position (plus the easing offset) and the newest snapshot's numbers,
  // corrected for actions the host hasn't confirmed yet.
  refreshMe(dt) {
    const me = this.me, L = this.latest;
    if (!L) return;
    const r = L.B[this.local], m = L.me || [0, 0, 0, 0, 0, 0, 0];
    const now = performance.now(), el = Math.max(0, (now - L.at) / 1000) * (this.rate / SIM_HZ);
    me.vis = (1 << this.state.nTeams) - 1;
    if (!r) return;
    if (r.dead) {
      me.alive = false;
      me.respawnT = r.rt > 0 ? Math.max(0.01, r.rt - el) : r.rt;
      me.mvx = me.mvy = 0;
      this.hist.length = 0;
      return;
    }
    if (!me.alive) { me.alive = true; this.pred.x = r.x; this.pred.y = r.y; this.off2.x = this.off2.y = 0; }
    const f = Math.exp(-dt / 0.05);
    this.off2.x *= f; this.off2.y *= f;
    if (Math.abs(this.off2.x) + Math.abs(this.off2.y) < 0.002) this.off2.x = this.off2.y = 0;
    if (!this.control(L) && L.f <= 0) {
      // stunned, knocked back, dashing or leaping: follow the host
      this.pred.x += (r.x - this.pred.x) * Math.min(1, dt * 12);
      this.pred.y += (r.y - this.pred.y) * Math.min(1, dt * 12);
    }
    me.x = me.px = this.pred.x + this.off2.x;
    me.y = me.py = this.pred.y + this.off2.y;
    me.mvx = this._mv.x; me.mvy = this._mv.y;
    if (!this.control(L)) { me.mvx = me.mvy = 0; if (this.faceT <= 0) me.face = r.face; }
    else if (this.faceT > 0) me.face = this.fireAng;
    this.fields(me, r);
    me.inBush = inBushAt(this.state.map, me.x, me.y);
    me.lastSeq = m[4];
    let pa = 0, ps = 0, pg = 0;
    for (const p of this.pend) { if (p.act === ACT.ATTACK) pa++; else if (p.act === ACT.SUPER) ps++; else pg++; }
    me.ammo = Math.max(0, Math.min(MAX_AMMO, m[0] / 100 + el / me.reload) - pa);
    me.sup = ps ? 0 : m[1] / 100;
    me.supReady = !ps && !!(r.fl & 2);
    me.gadLeft = Math.max(0, m[2] - pg);
    me.gadT = pg ? (me.kit.gad && me.kit.gad.cd) || 5 : Math.max(0, m[3] / 10 - el);
    me.slowF = (m[5] || 0) / 100; me.speedF = (m[6] || 0) / 100;
    this.holdBall(dt);
  }

  // A ball we hold sits at our predicted brawler (from the moment the host says so); after a kick it
  // eases from there onto its real path.
  holdBall(dt) {
    const bl = this.state.ball, me = this.me, L = this.latest, o = this.ballOff;
    if (!bl) return;
    const held = me.alive && (bl.holder === this.local || (L.ball && L.ball[3] === this.local));
    if (held) {
      bl.x = bl.px = me.x + Math.cos(me.face) * 0.45; bl.y = bl.py = me.y + Math.sin(me.face) * 0.45; bl.z = 0;
      o.held = true; o.x = o.y = 0;
    } else {
      if (o.held) { o.held = false; o.x = o.lx - bl.x; o.y = o.ly - bl.y; if (Math.abs(o.x) + Math.abs(o.y) > 4) o.x = o.y = 0; }
      const f = Math.exp(-dt / 0.08);
      o.x *= f; o.y *= f;
      bl.x += o.x; bl.y += o.y; bl.px = bl.x; bl.py = bl.y;
    }
    o.lx = bl.x; o.ly = bl.y;
  }

  finish(r) {
    if (this.ended) return;
    const st = this.state;
    st.over = true;
    st.result = r;
    this.ended = true;
    this.endT = 0;
    Input.enabled = false;
    setTimeout(() => { if (this.onEnd) this.onEnd(r); }, 1800);
  }

  voidMatch(text) {
    if (this.ended || this.voided) return;
    this.voided = true;
    if (typeof Game !== 'undefined' && Game.match === this) Game.leave();
    else this.quit();
    if (typeof UI !== 'undefined') UI.toast(text);
  }

  // For tests: how good the prediction is and what the snapshots cost.
  report() {
    const e = this.err;
    return { n: e.n, mean: e.n ? e.sum / e.n : 0, max: e.max, snaps: e.snaps, delay: this.delay, jitter: this.jit, rt: this.rt, newest: this.newest };
  }

  draw(ctx, opts) {
    if (!this.ready) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#14102e';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      outlineText(ctx, 'Connecting to your friend...', ctx.canvas.width / 2, ctx.canvas.height / 2, Math.round(ctx.canvas.height * 0.05), '#ffffff');
      return;
    }
    const me = this.me;
    View.aim = Input.aim || Match.NO_AIM;
    View.draw(ctx, this.state, this.local, 1, opts);
    if (!this.ended) Input.draw(ctx, me.alive ? me : null);
    if (!this.ended && performance.now() - this.lastSnapAt > 1500) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      outlineText(ctx, 'Waiting for your friend...', ctx.canvas.width / 2, ctx.canvas.height * 0.22, Math.round(ctx.canvas.height * 0.045), '#ffd23f');
    }
  }

  quit() {
    this.paused = true;
    Input.enabled = false;
  }
}

// ================= Friend: the friendly-battle lobby =================
// Wires the Friends panel to the network: host a room or join one by code, swap hellos (name,
// brawler, power, trophies), start (host), run the match on both phones, tear everything down.
const Friend = {
  token: null, link: null, role: '', phase: '', st: null, opts: null, hello: null, sync: null, guest: null, pend: [], guestIn: false,

  wire() {
    UI.onFriendHost = (o) => this.host(o);
    UI.onFriendJoin = (code) => this.join(code);
    UI.onFriendStart = () => this.start();
    UI.onFriendLeave = () => this.leave();
  },

  mine() {
    const s = SAVE, bk = BRAWLERS[s.sel] ? s.sel : 'nova', b = s.brawlers[bk] || { lvl: 1, tro: 0 };
    return {
      t: 'hello', v: NET_PROTO, dv: syncDataVer(), name: String(s.name || 'Player').slice(0, 16), bk, lvl: b.lvl | 0, tro: b.tro | 0,
      gad: b.lvl >= Meta.GADGET_LVL ? b.gadget : -1, star: b.lvl >= Meta.STAR_LVL ? b.star : -1, // equipped gear (index, -1 none)
    };
  },

  // Forget the current room (sending a goodbye if a friend is connected).
  reset(bye) {
    if (this.token) this.token.cancel();
    const l = this.link;
    if (l && !l.closed) {
      l.onclose = null;
      if (bye) l.send({ t: 'bye' });
      setTimeout(() => l.close('bye'), bye ? 400 : 0);
    }
    this.token = null; this.link = null; this.role = ''; this.phase = ''; this.hello = null; this.sync = null; this.guest = null; this.pend = []; this.guestIn = false;
  },

  show() { if (this.phase === 'lobby') UI.friendLobby(this.st); },

  host(opts) {
    if (!Net.supported()) { UI.toast('Friendly battles need WebRTC, which this browser lacks'); return; }
    this.reset(true);
    const tok = this.token = Net.token();
    this.role = 'host'; this.phase = 'lobby'; this.opts = opts;
    this.st = { role: 'host', code: '', status: 'Creating a room...', friend: null, mode: opts.mode, map: opts.map, sameTeam: !!opts.sameTeam, canStart: false };
    this.show();
    Net.hostRoom(tok, (code) => { if (tok !== this.token) return; this.st.code = code; this.st.status = 'Waiting for your friend...'; this.show(); }, { timeout: SYNC_GONE })
      .then((link) => { if (tok !== this.token) { link.close(); return; } this.connected(link); })
      .catch((e) => this.fail(tok, e));
  },

  join(code) {
    if (!Net.supported()) { UI.toast('Friendly battles need WebRTC, which this browser lacks'); return; }
    this.reset(true);
    const tok = this.token = Net.token();
    this.role = 'guest'; this.phase = 'lobby';
    this.st = { role: 'guest', code, status: 'Connecting...', friend: null, mode: '', map: '', sameTeam: true, canStart: false };
    this.show();
    Net.joinRoom(code, tok, { timeout: SYNC_GONE })
      .then((link) => { if (tok !== this.token) { link.close(); return; } this.connected(link); })
      .catch((e) => this.fail(tok, e));
  },

  fail(tok, e) {
    if (tok !== this.token || (e && e.code === 'cancelled')) return;
    this.reset(false);
    UI.toast((e && e.message) || 'Could not connect');
    UI.open('friends');
  },

  connected(link) {
    this.link = link;
    link.listen((m) => this.onMsg(m));
    link.onclose = (why) => this.onClose(why);
    const hi = this.mine();
    if (this.role === 'host') Object.assign(hi, { mode: this.opts.mode, map: this.opts.map, sameTeam: !!this.opts.sameTeam });
    link.send(hi);
    this.st.status = this.role === 'host' ? 'Connected' : 'Connected. Waiting for your friend to start...';
    this.show();
  },

  onMsg(m) {
    switch (m.t) {
      case 'hello': {
        if (m.v !== NET_PROTO || m.dv !== syncDataVer()) { UI.toast('Your friend has a different version of the game. Both of you should reload.'); this.leave(); UI.open('friends'); return; }
        this.hello = m;
        this.st.friend = { name: String(m.name || 'Friend').slice(0, 16), bk: BRAWLER_KEYS.includes(m.bk) ? m.bk : 'nova' };
        if (this.role === 'guest') { this.st.mode = syncOwn(MODE_INFO, m.mode) ? m.mode : 'gem'; this.st.map = syncOwn(MAPS, m.map) ? m.map : ''; this.st.sameTeam = !!m.sameTeam; }
        else { this.st.canStart = true; this.st.status = 'Ready!'; }
        if (typeof Sound !== 'undefined') Sound.play('confirm');
        this.show();
        return;
      }
      case 'start': if (this.role === 'guest' && this.phase === 'lobby' && m.cfg) this.startGuest(m.cfg); return;
      case 'room': // the guest is back in the room after a match
        if (this.role !== 'host') return;
        this.guestIn = true;
        if (this.phase === 'lobby') { this.st.canStart = true; this.st.status = 'Ready!'; this.show(); }
        return;
      case 'bye': this.peerLeft(); return;
    }
    if (this.role === 'host') { if (this.sync) this.sync.onNet(m); } else if (this.guest) this.guest.onNet(m);
    else if (this.phase === 'vs') { this.pend.push(m); if (this.pend.length > 200) this.pend.splice(this.pend.findIndex((x) => x.t === 's'), 1); }
  },

  // The friend left or the connection died.
  peerLeft() {
    const ph = this.phase;
    if (ph === 'post') { this.reset(false); UI.toast('Your friend left the room'); return; } // still on the result screen
    if (ph === 'lobby' || ph === 'vs') {
      this.reset(false);
      UI.toast('Your friend left');
      UI.open('friends');
    } else if (ph === 'match') {
      if (this.role === 'host') {
        if (this.sync && !this.sync.ended && !this.sync.gone) { this.sync.drop(); UI.toast('Your friend left. An AI plays for them.'); }
      } else if (this.guest && !this.guest.endItem) this.guest.voidMatch('Your friend left. The match was cancelled.');
    }
  },
  onClose() { this.link = null; this.peerLeft(); },

  leave() { this.reset(true); },

  // Host: Start pressed.
  start() {
    if (this.role !== 'host' || !this.hello || this.phase !== 'lobby' || !this.st.canStart) return;
    const s = SAVE, o = this.opts, h = this.hello;
    const hostBk = Meta.owned(o.hostBk) ? o.hostBk : s.sel;
    const cfg = Meta.friendlyCfg({
      mode: o.mode, map: o.map, sameTeam: !!o.sameTeam, hostBk, hostLvl: (s.brawlers[hostBk] || { lvl: 1 }).lvl,
      guestBk: this.st.friend.bk, guestLvl: clamp(h.lvl | 0, 1, MAX_POWER), guestName: this.st.friend.name, guestTro: h.tro | 0,
      guestGad: h.gad, guestStar: h.star,
    });
    this.link.send({ t: 'start', cfg });
    this.phase = 'vs';
    this.guestIn = false; this.st.canStart = false;
    if (typeof Sound !== 'undefined') Sound.init();
    UI.showVs(cfg, () => {
      if (this.phase !== 'vs' || !this.link) return;
      const m = Game.startMatch(cfg, { net: 'host', link: this.link });
      this.phase = 'match';
      this.sync = new SyncHost(m, this.link, cfg.guestSlot);
      m.onLeave = () => this.leave();
      m.onFinished = () => this.finished();
    });
  },

  // Guest: the host started.
  startGuest(cfg0) {
    const ok = cfg0 && syncOwn(MODE_INFO, cfg0.mode) && syncOwn(MAPS, cfg0.map) && Array.isArray(cfg0.slots) &&
      cfg0.slots.length === MODE_INFO[cfg0.mode].teams * MODE_INFO[cfg0.mode].size && (cfg0.guestSlot | 0) === cfg0.guestSlot &&
      cfg0.guestSlot > 0 && cfg0.guestSlot < cfg0.slots.length && cfg0.slots.every((s) => s && BRAWLER_KEYS.includes(s.bk));
    if (!ok) { UI.toast('Could not start the battle'); this.leave(); UI.open('friends'); return; }
    // friendly no matter what the host's message says: a friend's phone can't change your trophies
    const cfg = Object.assign({}, cfg0, { localSlot: cfg0.guestSlot, friendly: true });
    this.phase = 'vs';
    if (typeof Sound !== 'undefined') Sound.init();
    UI.showVs(cfg, () => {
      if (this.phase !== 'vs' || !this.link) return;
      const g = Game.startMatch(cfg, { net: 'guest', link: this.link });
      this.phase = 'match';
      this.guest = g;
      g.onLeave = () => this.leave();
      g.onFinished = () => this.finished();
      const p = this.pend;
      this.pend = [];
      for (const m of p) g.onNet(m);
    });
  },

  // The result screen is up. The link stays open: either player can go back to the room for another
  // match (as with the original's friendly rooms) or leave it.
  finished() {
    this.phase = 'post'; this.sync = null; this.guest = null; this.pend = [];
    if (!this.link || this.link.closed) this.reset(false);
  },

  // True while the friend is still connected after a match.
  canRematch() { return this.phase === 'post' && !!this.link && !this.link.closed; },

  // From the result screen back to the room (same mode and map; the host starts again).
  backToRoom() {
    if (!this.canRematch()) { this.reset(true); UI.open('friends'); return; }
    this.phase = 'lobby';
    if (this.role === 'guest') {
      this.link.send({ t: 'room' });
      this.st.status = 'Waiting for your friend to start...';
    } else {
      this.st.canStart = this.guestIn;
      this.st.status = this.guestIn ? 'Ready!' : 'Waiting for your friend to come back...';
    }
    this.show();
  },
};
