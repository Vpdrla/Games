// ---------- Online play: WebRTC between phones (adapted from Blast Squad for up to 4 players) ----------
// Devices connect directly with WebRTC data channels. A PeerJS-compatible signaling server (the free
// public one at 0.peerjs.com by default) only introduces them by room code; no game data goes through it.
// Page URL options: ?signal=host:port (own PeerJS server), ?ice=none, ?lag=MS&loss=PCT (debug)
//   const room = await Net.hostRoom(token, (code) => {...}, (link) => {...}, maxGuests)  // room.close()
//   const link = await Net.joinRoom(code, token)
//   link.send(obj, fast)   link.listen(fn)   link.onclose = (why) => {}   link.rtt
const NET_PREFIX = 'realmraiders-v1-';
const NET_PROTO = 1;
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NET_TIMEOUT = 15000;

const netCode = (n) => { let s = ''; for (let i = 0; i < n; i++) s += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]; return s; };
const netId = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

function netConfig() {
  const qs = new URLSearchParams(location.search);
  const sig = qs.get('signal');
  let base = 'wss://0.peerjs.com:443/peerjs?key=peerjs';
  if (sig) {
    let u = sig;
    if (!/^wss?:\/\//.test(u)) u = (/^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(u) ? 'ws://' : 'wss://') + u;
    if (!/\/$/.test(u)) u += '/';
    base = u + 'peerjs?key=' + (qs.get('key') || 'peerjs');
  }
  const ice = qs.get('ice') === 'none' ? [] : [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ];
  const lag = Math.max(0, +qs.get('lag') || 0), loss = clamp(+qs.get('loss') || 0, 0, 100);
  return { base, ice, lag, loss };
}

class NetError extends Error {
  constructor(code, msg) { super(msg || code); this.code = code; }
}

class Signal {
  constructor(id) { this.id = id; this.ws = null; this.onmsg = null; this.hb = null; this.closed = false; }

  open(timeoutMs) {
    const cfg = netConfig();
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (code, msg) => { if (done) return; done = true; this.close(); reject(new NetError(code, msg)); };
      const offline = 'Could not reach the matchmaking server. Online play needs an internet connection (it does not work inside the Claude preview; open the GitHub Pages version).';
      const timer = setTimeout(() => fail('offline', offline), timeoutMs || 10000);
      let ws;
      try { ws = new WebSocket(cfg.base + '&id=' + encodeURIComponent(this.id) + '&token=' + netId() + '&version=1.5.4'); } catch (e) { clearTimeout(timer); fail('offline', offline); return; }
      this.ws = ws;
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (!done) {
          if (m.type === 'OPEN') { done = true; clearTimeout(timer); this.hb = setInterval(() => this.raw({ type: 'HEARTBEAT' }), 5000); resolve(this); }
          else if (m.type === 'ID-TAKEN') { clearTimeout(timer); fail('taken'); }
          else if (m.type === 'ERROR') { clearTimeout(timer); fail('server', 'The matchmaking server refused the connection.'); }
          return;
        }
        if (this.onmsg) this.onmsg(m);
      };
      ws.onerror = () => { clearTimeout(timer); fail('offline', offline); };
      ws.onclose = () => { clearTimeout(timer); if (!done) fail('offline', offline); if (this.hb) clearInterval(this.hb); this.hb = null; };
    });
  }

  raw(m) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); } catch (e) { /* socket gone */ } }
  send(type, dst, payload) { this.raw({ type, dst, payload }); }
  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.hb) clearInterval(this.hb);
    this.hb = null;
    try { if (this.ws) this.ws.close(); } catch (e) { /* already closed */ }
    this.ws = null;
  }
}

class Link {
  constructor(pc, r, u, role, timeout) {
    this.pc = pc; this.r = r; this.u = u; this.role = role;
    this.onmsg = null; this.onclose = null; this.closed = false;
    this.rtt = 0;
    this.timeout = timeout || NET_TIMEOUT;
    this.lastRecv = performance.now();
    this.queue = [];
    this.bytesOut = 0;
    const cfg = netConfig();
    this.lag = cfg.lag; this.loss = cfg.loss; this.rAt = 0;
    const recv = (ev) => {
      this.lastRecv = performance.now();
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === '_p') { this.send({ t: '_q', ts: m.ts }); return; }
      if (m.t === '_q') { this.rtt = performance.now() - m.ts; return; }
      if (this.onmsg) this.onmsg(m); else this.queue.push(m);
    };
    r.onmessage = recv;
    u.onmessage = recv;
    r.onclose = () => this.close('closed');
    pc.onconnectionstatechange = () => { const s = pc.connectionState; if (s === 'failed' || s === 'closed') this.close('lost'); };
    this.pinger = setInterval(() => {
      this.send({ t: '_p', ts: performance.now() });
      if (performance.now() - this.lastRecv > this.timeout) this.close('timeout');
    }, 1000);
  }

  listen(fn) { this.onmsg = fn; const q = this.queue; this.queue = []; for (const m of q) fn(m); }

  send(m, fast) {
    if (this.closed) return 0;
    const ch = fast && this.u.readyState === 'open' ? this.u : this.r;
    if (ch.readyState !== 'open') return 0;
    const s = JSON.stringify(m);
    this.bytesOut += s.length;
    if (!this.lag && !this.loss) { this.put(ch, s); return s.length; }
    if (ch === this.u && Math.random() * 100 < this.loss) return s.length;
    const now = performance.now();
    let at = now + this.lag * (0.8 + Math.random() * 0.4);
    if (ch === this.r) { at = Math.max(at, this.rAt); this.rAt = at; }
    setTimeout(() => { if (!this.closed && ch.readyState === 'open') this.put(ch, s); }, at - now);
    return s.length;
  }

  put(ch, s) { try { ch.send(s); } catch (e) { /* channel closing */ } }

  close(why) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pinger);
    try { this.r.close(); } catch (e) { /* ignore */ }
    try { this.u.close(); } catch (e) { /* ignore */ }
    try { this.pc.close(); } catch (e) { /* ignore */ }
    if (this.onclose) this.onclose(why || 'closed');
  }
}

// An in-page pair of links for tests (no network): latency in ms.
function mockLinkPair(lag) {
  const mk = (role) => ({ role, onmsg: null, onclose: null, closed: false, rtt: (lag || 0) * 2, queue: [], other: null,
    listen(fn) { this.onmsg = fn; const q = this.queue; this.queue = []; for (const m of q) fn(m); },
    send(m) { if (this.closed) return 0; const s = JSON.stringify(m), o = this.other; setTimeout(() => { if (o.closed) return; const v = JSON.parse(s); if (o.onmsg) o.onmsg(v); else o.queue.push(v); }, lag || 0); return s.length; },
    close(why) { if (this.closed) return; this.closed = true; if (this.onclose) this.onclose(why || 'closed'); if (!this.other.closed) this.other.close('closed'); } });
  const a = mk('host'), b = mk('guest');
  a.other = b; b.other = a;
  return [a, b];
}

// Same-computer transport for testing: with ?net=bc two tabs of the game talk over a BroadcastChannel.
const netBc = () => { try { return new URLSearchParams(location.search).get('net') === 'bc' && typeof BroadcastChannel !== 'undefined'; } catch (e) { return false; } };
class BcLink {
  constructor(name, role) {
    this.role = role; this.onmsg = null; this.onclose = null; this.closed = false; this.rtt = 5; this.queue = [];
    this.ch = new BroadcastChannel(name);
    this.ch.onmessage = (ev) => {
      const m = ev.data;
      if (!m || m.from === role) return;
      if (m.close) { this.close('closed'); return; }
      if (this.onmsg) this.onmsg(m.d); else this.queue.push(m.d);
    };
  }
  listen(fn) { this.onmsg = fn; const q = this.queue; this.queue = []; for (const m of q) fn(m); }
  send(m) { if (this.closed) return 0; this.ch.postMessage({ from: this.role, d: m }); return 1; }
  close(why) { if (this.closed) return; this.closed = true; try { this.ch.postMessage({ from: this.role, close: 1 }); this.ch.close(); } catch (e) { /* ignore */ } if (this.onclose) this.onclose(why || 'closed'); }
}

const Net = {
  supported() { return netBc() || (typeof RTCPeerConnection !== 'undefined' && typeof WebSocket !== 'undefined'); },

  token() {
    const t = { cancelled: false, fns: [] };
    t.cancel = () => { if (t.cancelled) return; t.cancelled = true; for (const f of t.fns) { try { f(); } catch (e) { /* ignore */ } } };
    t.on = (f) => { if (t.cancelled) f(); else t.fns.push(f); };
    return t;
  },

  // Opens a room and keeps accepting friends (up to maxGuests) until room.close().
  async hostRoom(token, onCode, onGuest, maxGuests) {
    if (netBc()) {
      const code = netCode(4), lobby = new BroadcastChannel('rr-room-' + code);
      const room = { code, links: [], full: false, close: () => { try { lobby.close(); } catch (e) { /* ignore */ } } };
      lobby.onmessage = (ev) => {
        const m = ev.data;
        if (!m || !m.hello) return;
        if (room.full || room.links.filter((l) => !l.closed).length >= (maxGuests || 3)) { lobby.postMessage({ busy: m.hello }); return; }
        const link = new BcLink('rr-link-' + m.hello, 'host');
        room.links.push(link);
        lobby.postMessage({ welcome: m.hello });
        onGuest(link);
      };
      token.on(() => room.close());
      onCode(code);
      return room;
    }
    for (let i = 0; i < 6; i++) {
      if (token.cancelled) throw new NetError('cancelled');
      const code = netCode(4);
      const sig = new Signal(NET_PREFIX + code);
      token.on(() => sig.close());
      try { await sig.open(12000); } catch (e) { if (e.code === 'taken') continue; throw e; }
      onCode(code);
      return this.acceptGuests(sig, token, onGuest, maxGuests || 3, code);
    }
    throw new NetError('server', 'Could not create a room. Try again.');
  },

  acceptGuests(sig, token, onGuest, maxGuests, code) {
    const cfg = netConfig();
    const peers = new Map();
    const room = { code, links: [], full: false, close: () => { sig.close(); for (const p of peers.values()) if (!p.done) { try { p.pc.close(); } catch (e) { /* ignore */ } } } };
    token.on(() => room.close());
    sig.onmsg = async (m) => {
      const p = m.payload || {};
      if (m.type === 'OFFER') {
        const open = room.links.filter((l) => !l.closed).length;
        if (open >= maxGuests || room.full) { sig.send('LEAVE', m.src, { why: 'busy' }); return; }
        if (p.v !== NET_PROTO) { sig.send('LEAVE', m.src, { why: 'version' }); return; }
        const old = peers.get(m.src);
        if (old && !old.done) { try { old.pc.close(); } catch (e) { /* ignore */ } }
        const pc = new RTCPeerConnection({ iceServers: cfg.ice });
        const ent = { pc, cid: p.cid, chans: {}, pend: [], done: false };
        peers.set(m.src, ent);
        const check = () => {
          if (ent.done) return;
          const c = ent.chans;
          if (c.r && c.u && c.r.readyState === 'open' && c.u.readyState === 'open') {
            ent.done = true;
            const link = new Link(pc, c.r, c.u, 'host');
            room.links.push(link);
            onGuest(link);
          }
        };
        pc.onicecandidate = (ev) => { if (ev.candidate) sig.send('CANDIDATE', m.src, { cid: ent.cid, c: ev.candidate.toJSON() }); };
        pc.ondatachannel = (ev) => { const ch = ev.channel; ent.chans[ch.label] = ch; ch.onopen = check; check(); };
        try {
          await pc.setRemoteDescription(p.sdp);
          for (const c of ent.pend.splice(0)) await pc.addIceCandidate(c).catch(() => {});
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          sig.send('ANSWER', m.src, { cid: ent.cid, sdp: pc.localDescription });
        } catch (e) { try { pc.close(); } catch (e2) { /* ignore */ } peers.delete(m.src); }
      } else if (m.type === 'CANDIDATE') {
        const ent = peers.get(m.src);
        if (!ent || p.cid !== ent.cid) return;
        if (ent.pc.remoteDescription) ent.pc.addIceCandidate(p.c).catch(() => {}); else ent.pend.push(p.c);
      } else if (m.type === 'LEAVE') {
        const ent = peers.get(m.src);
        if (ent && !ent.done) { try { ent.pc.close(); } catch (e) { /* ignore */ } peers.delete(m.src); }
      }
    };
    return room;
  },

  async joinId(hostId, token, timeoutMs) {
    const cfg = netConfig();
    const sig = new Signal(NET_PREFIX + 'g-' + netId());
    token.on(() => sig.close());
    await sig.open(12000);
    return new Promise((resolve, reject) => {
      let done = false;
      const pc = new RTCPeerConnection({ iceServers: cfg.ice });
      const r = pc.createDataChannel('r', { ordered: true });
      const u = pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 });
      const cid = netId();
      const pend = [];
      const finish = (err, link) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) { try { pc.close(); } catch (e) { /* ignore */ } sig.close(); reject(err); } else { setTimeout(() => sig.close(), 1500); resolve(link); }
      };
      const timer = setTimeout(() => finish(new NetError('timeout', 'Could not connect to your friend. Check the code, or try another network (Wi-Fi).')), timeoutMs || 20000);
      token.on(() => finish(new NetError('cancelled')));
      const check = () => { if (r.readyState === 'open' && u.readyState === 'open') finish(null, new Link(pc, r, u, 'guest')); };
      r.onopen = check;
      u.onopen = check;
      pc.onicecandidate = (ev) => { if (ev.candidate) sig.send('CANDIDATE', hostId, { cid, c: ev.candidate.toJSON() }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') finish(new NetError('failed', 'The connection failed. Your networks may block direct connections; try Wi-Fi.')); };
      sig.onmsg = async (m) => {
        if (m.src !== hostId || done) { if (m.type === 'EXPIRE' && !done) finish(new NetError('notfound', 'Room not found. Check the code and make sure your friend is waiting.')); return; }
        const p = m.payload || {};
        if (m.type === 'ANSWER' && p.cid === cid) {
          try { await pc.setRemoteDescription(p.sdp); for (const c of pend.splice(0)) await pc.addIceCandidate(c).catch(() => {}); } catch (e) { finish(new NetError('failed', 'The connection failed.')); }
        } else if (m.type === 'CANDIDATE' && p.cid === cid) {
          if (pc.remoteDescription) pc.addIceCandidate(p.c).catch(() => {}); else pend.push(p.c);
        } else if (m.type === 'EXPIRE') finish(new NetError('notfound', 'Room not found. Check the code and make sure your friend is waiting.'));
        else if (m.type === 'LEAVE') {
          const why = p.why;
          finish(new NetError(why || 'left', why === 'busy' ? 'That room is full.' : why === 'version' ? 'Your friend is running a different version. Both of you should reload.' : 'The host left the room.'));
        }
      };
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => sig.send('OFFER', hostId, { v: NET_PROTO, cid, sdp: pc.localDescription })).catch(() => finish(new NetError('failed', 'Could not start a connection on this device.')));
    });
  },

  joinRoom(code, token) {
    if (netBc()) {
      return new Promise((resolve, reject) => {
        const id = netId(), lobby = new BroadcastChannel('rr-room-' + code.toUpperCase().trim());
        const link = new BcLink('rr-link-' + id, 'guest');
        const timer = setTimeout(() => { lobby.close(); reject(new NetError('notfound', 'Room not found.')); }, 3000);
        token.on(() => { clearTimeout(timer); lobby.close(); reject(new NetError('cancelled')); });
        lobby.onmessage = (ev) => {
          const m = ev.data || {};
          if (m.welcome === id) { clearTimeout(timer); lobby.close(); resolve(link); }
          if (m.busy === id) { clearTimeout(timer); lobby.close(); reject(new NetError('busy', 'That room is full.')); }
        };
        lobby.postMessage({ hello: id });
      });
    }
    return this.joinId(NET_PREFIX + code.toUpperCase().trim(), token, 20000);
  },
};
