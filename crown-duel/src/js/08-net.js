// ---------- Online play ----------
// Two phones connect directly with WebRTC data channels. A PeerJS-compatible signaling server
// (the free public one at 0.peerjs.com by default) only introduces them; no game data goes through it.
// Add ?signal=host:port to the page URL to use your own PeerJS server instead.
const NET_PREFIX = 'crownduel-v1-';
const NET_PROTO = 1;
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QUICK_ID = NET_PREFIX + 'quick';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randCode = (n) => { let s = ''; for (let i = 0; i < n; i++) s += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]; return s; };
const randId = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

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
  return { base, ice };
}

class NetError extends Error {
  constructor(code, msg) { super(msg || code); this.code = code; }
}

// A registration with the signaling server under one id.
class Signal {
  constructor(id) {
    this.id = id;
    this.ws = null;
    this.onmsg = null;
    this.hb = null;
    this.closed = false;
  }

  open(timeoutMs) {
    const cfg = netConfig();
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (code, msg) => { if (done) return; done = true; this.close(); reject(new NetError(code, msg)); };
      const timer = setTimeout(() => fail('offline', 'Could not reach the matchmaking server.'), timeoutMs || 10000);
      let ws;
      try {
        ws = new WebSocket(cfg.base + '&id=' + encodeURIComponent(this.id) + '&token=' + randId() + '&version=1.5.4');
      } catch (e) {
        clearTimeout(timer);
        fail('offline', 'Could not reach the matchmaking server.');
        return;
      }
      this.ws = ws;
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (!done) {
          if (m.type === 'OPEN') {
            done = true;
            clearTimeout(timer);
            this.hb = setInterval(() => this.raw({ type: 'HEARTBEAT' }), 5000);
            resolve(this);
          } else if (m.type === 'ID-TAKEN') { clearTimeout(timer); fail('taken'); } else if (m.type === 'ERROR') { clearTimeout(timer); fail('server', 'The matchmaking server refused the connection.'); }
          return;
        }
        if (this.onmsg) this.onmsg(m);
      };
      ws.onerror = () => { clearTimeout(timer); fail('offline', 'Could not reach the matchmaking server.'); };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!done) fail('offline', 'Could not reach the matchmaking server.');
        if (this.hb) clearInterval(this.hb);
        this.hb = null;
      };
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

// A live connection to the other player: a reliable channel for commands and an
// unreliable one for the frequent battle snapshots.
class Link {
  constructor(pc, r, u, role) {
    this.pc = pc;
    this.r = r;
    this.u = u;
    this.role = role;
    this.onmsg = null;
    this.onclose = null;
    this.closed = false;
    this.rtt = 0;
    this.lastRecv = performance.now();
    this.queue = [];
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
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') this.close('lost');
    };
    this.pinger = setInterval(() => {
      this.send({ t: '_p', ts: performance.now() });
      if (performance.now() - this.lastRecv > 20000) this.close('timeout');
    }, 1000);
  }

  listen(fn) {
    this.onmsg = fn;
    const q = this.queue;
    this.queue = [];
    for (const m of q) fn(m);
  }

  send(m, fast) {
    if (this.closed) return;
    const ch = fast && this.u.readyState === 'open' ? this.u : this.r;
    if (ch.readyState !== 'open') return;
    try { ch.send(JSON.stringify(m)); } catch (e) { /* channel closing */ }
  }

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

const Net = {
  link: null,
  busy: null,

  supported() { return typeof RTCPeerConnection !== 'undefined' && typeof WebSocket !== 'undefined'; },

  // Cancellation token shared by the lobby UI.
  token() {
    const t = { cancelled: false, fns: [] };
    t.cancel = () => { if (t.cancelled) return; t.cancelled = true; for (const f of t.fns) { try { f(); } catch (e) { /* ignore */ } } };
    t.on = (f) => { if (t.cancelled) f(); else t.fns.push(f); };
    return t;
  },

  // Create a room with a short code and wait for a friend to join it.
  async hostRoom(token, onCode) {
    for (let i = 0; i < 6; i++) {
      if (token.cancelled) throw new NetError('cancelled');
      const code = randCode(4);
      const sig = new Signal(NET_PREFIX + code);
      token.on(() => sig.close());
      try {
        await sig.open(12000);
      } catch (e) {
        if (e.code === 'taken') continue;
        throw e;
      }
      onCode(code);
      return this.acceptGuest(sig, token);
    }
    throw new NetError('server', 'Could not create a room. Try again.');
  },

  acceptGuest(sig, token) {
    const cfg = netConfig();
    return new Promise((resolve, reject) => {
      let pc = null, peer = null, cid = null, pend = [], done = false;
      const reset = () => {
        if (pc) { try { pc.close(); } catch (e) { /* ignore */ } }
        pc = null; peer = null; cid = null; pend = [];
      };
      token.on(() => { if (done) return; done = true; reset(); sig.close(); reject(new NetError('cancelled')); });
      sig.onmsg = async (m) => {
        if (done) return;
        const p = m.payload || {};
        if (m.type === 'OFFER') {
          if (peer && peer !== m.src) { sig.send('LEAVE', m.src, { why: 'busy' }); return; }
          if (p.v !== NET_PROTO) { sig.send('LEAVE', m.src, { why: 'version' }); return; }
          reset();
          peer = m.src;
          cid = p.cid;
          const myPc = pc = new RTCPeerConnection({ iceServers: cfg.ice });
          const chans = {};
          const check = () => {
            if (done || pc !== myPc) return;
            if (chans.r && chans.u && chans.r.readyState === 'open' && chans.u.readyState === 'open') {
              done = true;
              const link = new Link(myPc, chans.r, chans.u, 'host');
              setTimeout(() => sig.close(), 1500);
              resolve(link);
            }
          };
          myPc.onicecandidate = (ev) => { if (ev.candidate && pc === myPc) sig.send('CANDIDATE', peer, { cid, c: ev.candidate.toJSON() }); };
          myPc.ondatachannel = (ev) => {
            const ch = ev.channel;
            chans[ch.label] = ch;
            ch.onopen = check;
            check();
          };
          myPc.onconnectionstatechange = () => { if (!done && pc === myPc && myPc.connectionState === 'failed') reset(); };
          try {
            await myPc.setRemoteDescription(p.sdp);
            for (const c of pend.splice(0)) await myPc.addIceCandidate(c).catch(() => {});
            const ans = await myPc.createAnswer();
            await myPc.setLocalDescription(ans);
            if (pc === myPc) sig.send('ANSWER', peer, { cid, sdp: myPc.localDescription });
          } catch (e) { if (pc === myPc) reset(); }
        } else if (m.type === 'CANDIDATE' && m.src === peer && p.cid === cid) {
          if (pc && pc.remoteDescription) pc.addIceCandidate(p.c).catch(() => {});
          else pend.push(p.c);
        } else if (m.type === 'LEAVE' && m.src === peer) reset();
      };
    });
  },

  // Connect to a peer id that is waiting as host.
  async joinId(hostId, token, timeoutMs) {
    const cfg = netConfig();
    const sig = new Signal(NET_PREFIX + 'g-' + randId());
    token.on(() => sig.close());
    await sig.open(12000);
    return new Promise((resolve, reject) => {
      let done = false;
      const pc = new RTCPeerConnection({ iceServers: cfg.ice });
      const r = pc.createDataChannel('r', { ordered: true });
      const u = pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 });
      const cid = randId();
      const pend = [];
      const finish = (err, link) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) { try { pc.close(); } catch (e) { /* ignore */ } sig.close(); reject(err); } else { setTimeout(() => sig.close(), 1500); resolve(link); }
      };
      const timer = setTimeout(() => finish(new NetError('timeout', 'Could not connect to the other player. Try again, or try another network (Wi-Fi).')), timeoutMs || 20000);
      token.on(() => finish(new NetError('cancelled')));
      const check = () => { if (r.readyState === 'open' && u.readyState === 'open') finish(null, new Link(pc, r, u, 'guest')); };
      r.onopen = check;
      u.onopen = check;
      pc.onicecandidate = (ev) => { if (ev.candidate) sig.send('CANDIDATE', hostId, { cid, c: ev.candidate.toJSON() }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') finish(new NetError('failed', 'The connection failed. Your networks may block direct connections; try Wi-Fi.')); };
      sig.onmsg = async (m) => {
        if (m.src !== hostId || done) return;
        const p = m.payload || {};
        if (m.type === 'ANSWER' && p.cid === cid) {
          try {
            await pc.setRemoteDescription(p.sdp);
            for (const c of pend.splice(0)) await pc.addIceCandidate(c).catch(() => {});
          } catch (e) { finish(new NetError('failed', 'The connection failed.')); }
        } else if (m.type === 'CANDIDATE' && p.cid === cid) {
          if (pc.remoteDescription) pc.addIceCandidate(p.c).catch(() => {}); else pend.push(p.c);
        } else if (m.type === 'EXPIRE') finish(new NetError('notfound', 'Room not found. Check the code and make sure your friend is waiting.'));
        else if (m.type === 'LEAVE') {
          const why = p.why;
          finish(new NetError(why === 'busy' ? 'busy' : why === 'version' ? 'version' : 'left',
            why === 'busy' ? 'That room already has two players.' : why === 'version' ? 'Your friend is running a different version of the game. Both of you should reload.' : 'The host left the room.'));
        }
      };
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .then(() => sig.send('OFFER', hostId, { v: NET_PROTO, cid, sdp: pc.localDescription }))
        .catch(() => finish(new NetError('failed', 'Could not start a connection on this device.')));
    });
  },

  joinRoom(code, token) {
    return this.joinId(NET_PREFIX + code.toUpperCase(), token, 20000);
  },

  // Random matchmaking: whoever grabs the shared lobby id waits; the next player connects to them.
  async quickMatch(token, onStatus) {
    for (let i = 0; i < 40; i++) {
      if (token.cancelled) throw new NetError('cancelled');
      const sig = new Signal(QUICK_ID);
      token.on(() => sig.close());
      let hosting = false;
      try {
        await sig.open(12000);
        hosting = true;
      } catch (e) {
        if (e.code !== 'taken') throw e;
      }
      if (hosting) {
        onStatus('Searching for an opponent…');
        return this.acceptGuest(sig, token);
      }
      onStatus('Opponent found! Connecting…');
      try {
        return await this.joinId(QUICK_ID, token, 12000);
      } catch (e) {
        if (token.cancelled || e.code === 'cancelled' || e.code === 'offline') throw e;
        onStatus('Searching for an opponent…');
        await sleep(rand(400, 1800));
      }
    }
    throw new NetError('timeout', 'No opponent found right now. Try again later or invite a friend with a room code.');
  },
};
