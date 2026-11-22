// ---------- Online sync: the host runs the world, guests mirror it ----------
// Host -> guest (fast, ~15 Hz): snapshots { t:'s', ... } of units, shots, areas, pickups, HUD and events.
// Host -> guest (reliable): lobby, start, room, offer, loot, end.  Guest -> host: hello, info, in (fast), pick, reroll.

const SNAP_EVERY = 4; // sim ticks between snapshots (60 / 4 = 15 Hz)
const UF = { downed: 1, deadOut: 2, ko: 4, invuln: 8, invis: 16, freeze: 32, stun: 64, burn: 128, poison: 256, slow: 512, root: 1024, dash: 2048, voidMark: 4096, flash: 8192, channel: 16384, dragon: 32768, rage: 65536, banner: 131072, hymn: 262144, air: 524288, autoRev: 1048576 };
const AREA_SHAPES = ['circle', 'line', 'cone', 'ring'];
const R1 = (v) => Math.round(v * 10) / 10;

function unitType(u) {
  if (u.kind === 'hero') return 'h:' + u.hero.id;
  if (u.kind === 'mob') return 'm:' + u.mid;
  if (u.kind === 'boss') return 'b:' + u.bid;
  return 's:' + u.stype;
}

function packUnit(w, u) {
  const st = u.st;
  let f = 0;
  if (u.downed) f |= UF.downed;
  if (u.deadOut) f |= UF.deadOut;
  if (u.ko) f |= UF.ko;
  if (st.invuln > 0) f |= UF.invuln;
  if (st.invis > 0) f |= UF.invis;
  if (st.freeze > 0) f |= UF.freeze;
  if (st.stun > 0) f |= UF.stun;
  if (st.burn > 0) f |= UF.burn;
  if (st.poison > 0) f |= UF.poison;
  if (st.slow > 0) f |= UF.slow;
  if (st.root > 0) f |= UF.root;
  if (u.dash) f |= UF.dash;
  if (u.dash && u.dash.air) f |= UF.air;
  if (st.voidMark > 0) f |= UF.voidMark;
  if (u.flash > 0) f |= UF.flash;
  if (u.channel) f |= UF.channel;
  if (u.formT > w.t) f |= UF.dragon;
  if (u.autoRev > 0) f |= UF.autoRev;
  for (const b of u.buffs) { if (b.id === 'rage') f |= UF.rage; if (b.id === 'banner') f |= UF.banner; if (b.id === 'hymn') f |= UF.hymn; }
  const a = [u.id, unitType(u), Math.round(u.x), Math.round(u.y), Math.round(u.ang * 100), Math.ceil(u.hp), u.maxHp, R1(u.r), f, Math.round(u.shield), u.team, R1(u.anim)];
  if (u.kind === 'hero') {
    a.push(Math.floor(u.ult), R1(u.cd.skill), R1(u.cd.skillMax), R1(u.cd.dash), R1(u.reviveP), Math.round(u.bleed), u.pl.slot, R1(u.respawn || 0),
      Math.round(u.spd * (1 + u.bf.ms) * (1 - (st.slow > 0 ? st.slowAmt : 0))), u.blessN, u.channel ? u.channel.kind || '' : '', u.kos || 0, u.deaths || 0);
  } else if (u.kind === 'mob') a.push(u.elite || '');
  else if (u.kind === 'summon') a.push(u.owner ? u.owner.id : 0);
  return a;
}

function packRoom(room) {
  const palKey = room.type === 'arena' ? 'arena' : (REALMS.find((r) => r.pal === room.pal) || REALMS[0]).key;
  return { w: room.w, h: room.h, obst: room.obst.map((o) => [Math.round(o.x), Math.round(o.y), Math.round(o.r), o.k]), deco: room.deco.map((d) => [Math.round(d.x), Math.round(d.y), d.k, R1(d.s)]), type: room.type, seed: room.seed, realm: room.realm || 0, pal: palKey };
}

function unpackRoom(r) {
  const pal = r.pal === 'arena' ? ARENA_PAL : (REALMS.find((x) => x.key === r.pal) || REALMS[0]).pal;
  return { w: r.w, h: r.h, obst: r.obst.map(([x, y, rr, k]) => ({ x, y, r: rr, k })), deco: r.deco.map(([x, y, k, s]) => ({ x, y, k, s })), type: r.type, seed: r.seed, realm: r.realm, pal };
}

function packSnap(w, evs) {
  const m = w.mode;
  const units = [];
  for (const u of w.units) if (!u.dead) units.push(packUnit(w, u));
  const projs = w.projs.map((p) => [p.id, p.kind || 'orb', Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), R1(p.r), p.color || '#fff', Math.round(p.h || 0), p.team]);
  const areas = [];
  for (const a of w.areas) {
    if (a.hidden) continue;
    areas.push([a.id, AREA_SHAPES.indexOf(a.shape), Math.round(a.x), Math.round(a.y), Math.round(a.r || 0), R1(a.ang || 0), Math.round(a.len || 0), Math.round(a.wid || 0), R1(a.arc || 0), R1(a.t), R1(a.dur), R1(a.delay || 0), a.kind || '', a.color || '', a.team, (a.tele ? 1 : 0) | (a.friendly ? 2 : 0) | (a.small ? 4 : 0) | (a.fired ? 8 : 0) | (a.beam ? 16 : 0)]);
  }
  const picks = w.picks.map((p) => [p.id, p.kind, Math.round(p.x), Math.round(p.y)]);
  const hud = { l: m.hud ? m.hud().label : '', ph: m.phase, g: Math.round(w.gold), c: w.combo.n, ts: w.timeStop ? R1(w.timeStop.t) : 0, tsm: w.timeStop ? w.timeStop.max : 0 };
  if (m.portals) hud.po = m.portals.map((p) => [Math.round(p.x), Math.round(p.y), p.reward, R1(p.prog), p.type]);
  if (m.boss && !m.boss.dead) hud.b = m.boss.id;
  if (m.kind === 'arena') { hud.sc = m.score; hud.tl = Math.round(m.timeLeft); hud.ffa = m.ffa ? 1 : 0; hud.tg = m.target; }
  if (m.kind !== 'arena') { hud.ri = m.roomIdx; hud.rt = m.total; }
  return { t: 's', k: w.tick, tm: R1(w.t), u: units, p: projs, a: areas, k2: picks, h: hud, e: evs };
}

// ---------- Guest mirror ----------
class Mirror {
  constructor() {
    this.units = [];
    this.byId = new Map();
    this.projs = [];
    this.areas = [];
    this.picks = [];
    this.room = null;
    this.t = 0;
    this.timeStop = null;
    this.combo = { n: 0 };
    this.gold = 0;
    this.arena = false;
    this.mode = { portals: [], phase: '', hud: () => ({ label: this.hudLabel || '', phase: this.mode.phase, boss: this.boss }), kind: '' };
    this.boss = null;
    this.snapAt = 0;
    this.interval = SNAP_EVERY / SIM_HZ;
    this.lastK = -1;
    this.me = null;
    this.mySlot = -1;
    this.pred = null;
    this.ev = [];
  }

  heroes() { return this.units.filter((u) => u.kind === 'hero'); }
  bounds(r) { const W = this.room ? this.room.w : ROOM_W, H = this.room ? this.room.h : ROOM_H; return { x0: 28 + r, y0: 28 + r, x1: W - 28 - r, y1: H - 28 - r }; }

  apply(s, now) {
    if (s.k <= this.lastK) return;
    if (this.lastK >= 0) this.interval = clamp((now - this.snapAt) / 1000, 0.03, 0.25) * 0.3 + this.interval * 0.7;
    this.lastK = s.k;
    this.snapAt = now;
    this.t = s.tm;
    this.baseT = s.tm;
    const seen = new Set();
    for (const a of s.u) {
      const id = a[0];
      seen.add(id);
      let u = this.byId.get(id);
      const [kind, key] = a[1].split(':');
      if (!u) {
        u = { id, kind: kind === 'h' ? 'hero' : kind === 'm' ? 'mob' : kind === 'b' ? 'boss' : 'summon', st: {}, buffs: [], bf: {}, x: a[2], y: a[3], sx0: a[2], sy0: a[3], sx1: a[2], sy1: a[3], cd: {}, counters: {}, born: this.t };
        if (u.kind === 'hero') { u.hero = HERO_BY_ID[key]; u.pl = { slot: -1, name: '', kind: 'remote' }; }
        if (u.kind === 'mob') { u.mob = MOBS[key]; u.mid = key; u.heavy = !!u.mob.heavy; u.flyer = !!u.mob.flyer; }
        if (u.kind === 'boss') { u.boss = BOSSES[key]; u.bid = key; }
        if (u.kind === 'summon') u.stype = key;
        this.byId.set(id, u);
        this.units.push(u);
      }
      u.sx0 = u.x; u.sy0 = u.y;
      u.sx1 = a[2]; u.sy1 = a[3];
      u.ang = a[4] / 100; u.hp = a[5]; u.maxHp = a[6]; u.r = a[7]; u.baseR = a[7];
      const f = a[8];
      u.shield = a[9]; u.team = a[10]; u.anim = a[11];
      u.downed = !!(f & UF.downed); u.deadOut = !!(f & UF.deadOut); u.ko = !!(f & UF.ko);
      const st = u.st;
      st.invuln = f & UF.invuln ? 1 : 0; st.invis = f & UF.invis ? 1 : 0; st.freeze = f & UF.freeze ? 1 : 0; st.stun = f & UF.stun ? 1 : 0;
      st.burn = f & UF.burn ? 1 : 0; st.poison = f & UF.poison ? 1 : 0; st.slow = f & UF.slow ? 1 : 0; st.root = f & UF.root ? 1 : 0; st.voidMark = f & UF.voidMark ? 1 : 0;
      u.dash = f & UF.dash ? { air: !!(f & UF.air) } : null;
      if (f & UF.flash) u.flash = 0.1;
      u.channel = f & UF.channel ? { kind: '' } : null;
      u.formT = f & UF.dragon ? this.t + 1 : 0;
      u.autoRev = f & UF.autoRev ? 1 : 0;
      u.buffs = [];
      if (f & UF.rage) u.buffs.push({ id: 'rage' });
      if (f & UF.banner) u.buffs.push({ id: 'banner' });
      if (f & UF.hymn) u.buffs.push({ id: 'hymn' });
      if (u.kind === 'hero') {
        u.ult = a[12]; u.cd.skill = a[13]; u.cd.skillMax = a[14]; u.cd.dash = a[15]; u.reviveP = a[16]; u.bleed = a[17]; u.pl.slot = a[18]; u.respawn = a[19]; u.spdNow = a[20]; u.blessN = a[21];
        if (u.channel) u.channel.kind = a[22];
        u.kos = a[23]; u.deaths = a[24];
        const pl = this.players && this.players.find((p) => p.slot === u.pl.slot);
        if (pl) u.pl = Object.assign(u.pl, { name: pl.name, kind: pl.kind });
      } else if (u.kind === 'mob') u.elite = a[12] || null;
      else if (u.kind === 'summon') { u.ownerId = a[12]; u.owner = this.byId.get(a[12]) || null; u.untargetable = u.stype === 'wisp'; }
    }
    this.units = this.units.filter((u) => { if (seen.has(u.id)) return true; this.byId.delete(u.id); return false; });
    this.projs = s.p.map((p) => ({ id: p[0], kind: p[1], x0: p[2], y0: p[3], x: p[2], y: p[3], vx: p[4], vy: p[5], r: p[6], color: p[7], h: p[8], team: p[9], lob: p[8] > 0 }));
    const oldA = new Map(this.areas.map((a) => [a.id, a]));
    this.areas = s.a.map((a) => {
      const o = oldA.get(a[0]);
      const ar = { id: a[0], shape: AREA_SHAPES[a[1]], x: a[2], y: a[3], r: a[4], ang: a[5], len: a[6], wid: a[7], arc: a[8], t0: a[9], t: a[9], dur: a[10], delay: a[11], kind: a[12], color: a[13], team: a[14],
        tele: !!(a[15] & 1), friendly: !!(a[15] & 2), small: !!(a[15] & 4), fired: !!(a[15] & 8), beam: !!(a[15] & 16) };
      ar.tx = ar.x; ar.ty = ar.y;
      ar.px = o ? o.x : ar.x; ar.py = o ? o.y : ar.y;
      return ar;
    });
    this.picks = s.k2.map((p) => ({ id: p[0], kind: p[1], x: p[2], y: p[3], t: 1 }));
    const h = s.h;
    this.hudLabel = h.l;
    this.mode.phase = h.ph;
    this.gold = h.g;
    this.combo.n = h.c;
    this.timeStop = h.ts > 0 ? { t: h.ts, max: h.tsm } : null;
    this.mode.portals = (h.po || []).map((p) => ({ x: p[0], y: p[1], reward: p[2], prog: p[3], type: p[4] }));
    this.boss = h.b ? this.byId.get(h.b) || null : null;
    if (h.sc) { this.mode.kind = 'arena'; this.mode.score = h.sc; this.mode.timeLeft = h.tl; this.mode.ffa = !!h.ffa; this.mode.target = h.tg; this.arena = true; }
    else { this.mode.roomIdx = h.ri; this.mode.total = h.rt; }
    for (const e of s.e || []) this.ev.push(e);
    this.me = this.units.find((u) => u.kind === 'hero' && u.pl.slot === this.mySlot) || null;
  }

  // Smooth positions between snapshots and move our own hero right away.
  frame(now, dt, myInput) {
    const k = clamp((now - this.snapAt) / 1000 / this.interval, 0, 1.25);
    this.t = (this.baseT || 0) + (now - this.snapAt) / 1000;
    for (const u of this.units) {
      if (u === this.me) continue;
      u.px = u.x; u.py = u.y;
      u.x = lerp(u.sx0, u.sx1, k);
      u.y = lerp(u.sy0, u.sy1, k);
      if (u.flash > 0) u.flash -= dt;
    }
    const el = (now - this.snapAt) / 1000;
    for (const p of this.projs) { if (!p.lob) { p.x = p.x0 + p.vx * el; p.y = p.y0 + p.vy * el; } }
    for (const a of this.areas) { a.t = a.t0 + el; a.x = lerp(a.px, a.tx, Math.min(1, k)); a.y = lerp(a.py, a.ty, Math.min(1, k)); }
    const me = this.me;
    if (me) {
      if (!this.pred || dist(this.pred.x, this.pred.y, me.sx1, me.sy1) > 140 || me.dash || me.ko) this.pred = { x: me.sx1, y: me.sy1 };
      const p = this.pred;
      const canMove = !me.ko && !me.st.freeze && !me.st.stun && !me.st.root;
      const sp = (me.downed ? 0.35 : 1) * (me.spdNow || me.hero.spd);
      if (canMove && myInput) {
        let mx = myInput.mx, my = myInput.my;
        const m = Math.hypot(mx, my);
        if (m > 1) { mx /= m; my /= m; }
        p.x += mx * sp * dt; p.y += my * sp * dt;
        if (this.room) for (const o of this.room.obst) {
          const dx = p.x - o.x, dy = p.y - o.y, mm = me.r + o.r, d = Math.hypot(dx, dy);
          if (d < mm) { p.x = o.x + dx / (d || 1) * mm; p.y = o.y + dy / (d || 1) * mm; }
        }
        const b = this.bounds(me.r);
        p.x = clamp(p.x, b.x0, b.x1); p.y = clamp(p.y, b.y0, b.y1);
        // where the host will have us once it sees our latest input
        const lead = (this.rtt || 100) / 2000 + this.interval;
        const tx = me.sx1 + mx * sp * lead, ty = me.sy1 + my * sp * lead;
        p.x = lerp(p.x, tx, Math.min(1, dt * 3));
        p.y = lerp(p.y, ty, Math.min(1, dt * 3));
        if (m > 0.2) me.angLocal = Math.atan2(my, mx);
      }
      me.px = me.x; me.py = me.y;
      me.x = p.x; me.y = p.y;
    }
  }
}

// ---------- Host side ----------
class HostSync {
  constructor(game) {
    this.game = game;
    this.guests = []; // { link, slot, name, info, inSeq, edges }
    this.evBuf = [];
    this.tickN = 0;
  }

  addGuest(link) {
    const used = new Set(this.guests.map((g) => g.slot));
    let slot = 1;
    while (used.has(slot)) slot++;
    const g = { link, slot, name: 'Friend', info: null, last: { sk: 0, ul: 0, da: 0 }, input: { mx: 0, my: 0 }, ready: false };
    this.guests.push(g);
    link.listen((m) => this.onMsg(g, m));
    link.onclose = () => this.drop(g);
    link.send({ t: 'welcome', slot, v: GAME_VER });
    return g;
  }

  drop(g) {
    this.guests = this.guests.filter((x) => x !== g);
    this.game.onGuestLeft(g);
  }

  onMsg(g, m) {
    if (m.t === 'hello') { if (m.v !== GAME_VER) { g.link.send({ t: 'bye', why: 'version' }); g.link.close('version'); return; } g.name = String(m.name || 'Friend').slice(0, 16); g.info = m.info; this.game.onLobbyChange(); }
    else if (m.t === 'info') { g.info = m.info; this.game.onLobbyChange(); }
    else if (m.t === 'in') {
      g.input.mx = clamp(+m.mx || 0, -1, 1); g.input.my = clamp(+m.my || 0, -1, 1);
      const pl = this.game.playerBySlot(g.slot);
      if (pl && pl.unit && pl.kind === 'remote') {
        const inp = pl.unit.input;
        inp.mx = g.input.mx; inp.my = g.input.my;
        if (m.sk > g.last.sk) { inp.skill = true; inp.aim = m.sa != null ? m.sa : null; inp.aimD = m.sd || 0; }
        if (m.ul > g.last.ul) { inp.ult = true; inp.aim = m.ua != null ? m.ua : inp.aim; inp.aimD = m.ud || inp.aimD; }
        if (m.da > g.last.da) inp.dash = true;
      }
      g.last.sk = Math.max(g.last.sk, m.sk || 0); g.last.ul = Math.max(g.last.ul, m.ul || 0); g.last.da = Math.max(g.last.da, m.da || 0);
    } else if (m.t === 'pick') { const w = this.game.world; if (w && w.mode.pick) w.mode.pick(g.slot, m.idx | 0); }
    else if (m.t === 'reroll') { const w = this.game.world; if (w && w.mode.reroll) w.mode.reroll(g.slot); }
    else if (m.t === 'emote') this.broadcast({ t: 'emote', slot: g.slot, e: m.e });
  }

  broadcast(m, fast) { for (const g of this.guests) g.link.send(m, fast); }
  sendTo(slot, m) { const g = this.guests.find((x) => x.slot === slot); if (g) g.link.send(m); }

  // Called by the host's game loop after the world advanced.
  afterStep(w, evs) {
    for (const e of evs) {
      if (e[0] === 'dmg' && this.evBuf.length > 140) continue;
      this.evBuf.push(e);
      if (e[0] === 'room') this.broadcast({ t: 'room', room: packRoom(w.room) });
      if (e[0] === 'offers') this.sendOffers(w);
      if (e[0] === 'loot') { const g = this.guests.find((x) => x.slot === e[1]); if (g) g.link.send({ t: 'loot', ilvl: e[2], bonus: e[3] }); }
    }
    this.tickN++;
    if (this.tickN % SNAP_EVERY === 0 || evs.some((e) => e[0] === 'end')) {
      const snap = packSnap(w, this.evBuf);
      this.evBuf = [];
      this.broadcast(snap, true);
    }
  }

  sendOffers(w) {
    const m = w.mode;
    for (const g of this.guests) {
      const of = m.offers && m.offers[g.slot];
      if (of && !of.done) g.link.send({ t: 'offer', ids: of.ids, rerolls: of.rerolls });
    }
  }
}

// ---------- Guest side ----------
class GuestSync {
  constructor(game, link) {
    this.game = game;
    this.link = link;
    this.slot = -1;
    this.mirror = null;
    this.cnt = { sk: 0, ul: 0, da: 0 };
    this.aim = { sa: null, sd: 0, ua: null, ud: 0 };
    this.sendT = 0;
    link.listen((m) => this.onMsg(m));
    link.onclose = (why) => game.onHostLeft(why);
  }

  onMsg(m) {
    const G = this.game;
    if (m.t === 'welcome') { this.slot = m.slot; G.onWelcome(m.slot); }
    else if (m.t === 'lobby') G.onLobby(m);
    else if (m.t === 'start') {
      this.mirror = new Mirror();
      this.mirror.mySlot = this.slot;
      this.mirror.players = m.players;
      G.onGuestStart(m, this.mirror);
    } else if (m.t === 'room') { if (this.mirror) this.mirror.room = unpackRoom(m.room); }
    else if (m.t === 's') { if (this.mirror) { this.mirror.rtt = this.link.rtt; this.mirror.apply(m, performance.now()); } }
    else if (m.t === 'offer') G.onOffer(m);
    else if (m.t === 'loot') G.onLoot(m.ilvl, m.bonus);
    else if (m.t === 'end') G.onGuestEnd(m);
    else if (m.t === 'emote') G.onEmote(m);
    else if (m.t === 'bye') G.onHostLeft(m.why);
  }

  input(inp, dt) {
    if (inp.skill) { this.cnt.sk++; this.aim.sa = inp.aim; this.aim.sd = inp.aimD; }
    if (inp.ult) { this.cnt.ul++; this.aim.ua = inp.aim; this.aim.ud = inp.aimD; }
    if (inp.dash) this.cnt.da++;
    this.sendT -= dt;
    if (this.sendT <= 0 || inp.skill || inp.ult || inp.dash) {
      this.sendT = 1 / 30;
      const m = { t: 'in', mx: R1(inp.mx || 0), my: R1(inp.my || 0), sk: this.cnt.sk, ul: this.cnt.ul, da: this.cnt.da };
      if (this.aim.sa != null) { m.sa = R1(this.aim.sa); m.sd = R1(this.aim.sd || 0); }
      if (this.aim.ua != null) { m.ua = R1(this.aim.ua); m.ud = R1(this.aim.ud || 0); }
      this.link.send(m, true);
    }
    inp.skill = inp.ult = inp.dash = false;
  }

  send(m) { this.link.send(m); }
}
