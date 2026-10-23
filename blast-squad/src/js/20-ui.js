// ---------- UI: the lobby and menus (DOM overlay, landscape) ----------
// Screens: lobby, panels (events, brawlers, brawler details, Trophy Road, pass, shop, quests,
// friends, settings), drop opening, matchmaking, VS intro, results, pause, modal and toasts.
// Data comes only from Meta / SAVE / BRAWLERS; pictures from Art. The game wires the hooks:
//   UI.onPlay(event, bk)  UI.onFriendHost(opts)  UI.onFriendJoin(code)  UI.onFriendStart()
//   UI.onFriendLeave()  UI.onSettings(settings)
const UI = (() => {
  const U = {
    screen: '', panelName: '', panelArg: null,
    onPlay: null, onFriendHost: null, onFriendJoin: null, onFriendStart: null, onFriendLeave: null, onSettings: null,
  };
  const snd = (name, o) => { if (typeof Sound !== 'undefined' && Sound.play) Sound.play(name, o); };
  const MODE_ICON = { gem: 'gem', sd: 'skull', ball: 'ball', ko: 'bolt', bounty: 'star', test: 'skull' };
  const RAR_COL = (r) => (RARITY[r] ? RARITY[r].color : '#9fb4c8');
  const brName = (bk) => (typeof BRAWLERS !== 'undefined' && BRAWLERS[bk] ? BRAWLERS[bk].name : bk);
  const brRar = (bk) => (typeof BRAWLERS !== 'undefined' && BRAWLERS[bk] ? BRAWLERS[bk].rarity : 'rare');
  const mapName = (k) => (k && typeof MAPS !== 'undefined' && MAPS[k] ? MAPS[k].name : 'Coming soon');
  const S = () => SAVE;

  // ---- helpers ----
  const els = {};
  const el = (id) => els[id] || (els[id] = $(id));
  const show = (id, on) => el(id).classList.toggle('show', on !== false);
  function hideScreens() { for (const id of ['lobby', 'panel', 'mm', 'vs', 'result', 'pause', 'drop']) show(id, false); }
  const pill = (cls, n) => `<span class="pill"><i class="${cls}"></i>${fmtNum(n)}</span>`;
  const curHtml = () => `<div class="cur">${pill('coin', S().coins)}${pill('ppi', S().pp | 0)}${pill('gemi', S().gems)}${pill('cri', S().credits)}</div>`;
  const pcv = (bk, em, extra) => `<canvas data-bk="${esc(bk)}" style="width:${em}em;height:${em}em" ${extra || ''}></canvas>`;
  const icv = (name, em) => `<canvas data-icon="${esc(name)}" style="width:${em}em;height:${em}em"></canvas>`;
  // Paints every <canvas data-bk> / <canvas data-icon> inside root once laid out.
  function paint(root) {
    const dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
    root.querySelectorAll('canvas[data-bk],canvas[data-icon]').forEach((c) => {
      const w = Math.max(16, Math.round((c.clientWidth || 48) * dpr)), h = Math.max(16, Math.round((c.clientHeight || 48) * dpr));
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.clearRect(0, 0, w, h);
      if (typeof Art === 'undefined') { x.fillStyle = '#5b4bd0'; x.fillRect(0, 0, w, h); return; }
      try {
        const img = c.dataset.bk ? Art.portrait(c.dataset.bk, Math.min(w, h)) : Art.icon(c.dataset.icon, Math.min(w, h));
        x.drawImage(img, (w - Math.min(w, h)) / 2, (h - Math.min(w, h)) / 2, Math.min(w, h), Math.min(w, h));
      } catch (e) { /* missing art: leave blank */ }
    });
  }
  function rewardHtml(g) {
    if (!g) return '';
    switch (g.type) {
      case 'coins': return `<span class="pill"><i class="coin"></i>${fmtNum(g.n)} coins</span>`;
      case 'pp': return `<span class="pill"><i class="ppi"></i>${fmtNum(g.n)} power points</span>`;
      case 'credits': return `<span class="pill"><i class="cri"></i>${fmtNum(g.n)} credits</span>`;
      case 'gems': return `<span class="pill"><i class="gemi"></i>${fmtNum(g.n)} gems</span>`;
      case 'drop': return `<span class="pill">${g.rarity ? esc(RARITY[g.rarity] ? RARITY[g.rarity].name : g.rarity) + ' ' : ''}Drop</span>`;
      case 'brawler': return `<span class="pill">New brawler: ${esc(brName(g.bk))}</span>`;
    }
    return '';
  }
  function rewardIcon(r) {
    switch (r.type) {
      case 'coins': return `<div class="rwb"><i class="coin"></i></div><div>${fmtNum(r.n)}</div>`;
      case 'pp': return `<div class="rwb"><i class="ppi"></i></div><div>${fmtNum(r.n)}</div>`;
      case 'credits': return `<div class="rwb"><i class="cri"></i></div><div>${fmtNum(r.n)}</div>`;
      case 'gems': return `<div class="rwb"><i class="gemi"></i></div><div>${fmtNum(r.n)}</div>`;
      case 'drop': return `<div class="rwb" style="background:${RAR_COL(r.rarity || 'rare')}">★</div><div>${esc((RARITY[r.rarity] || RARITY.rare).name)} drop</div>`;
      case 'brawler': return `<div class="rwb" style="padding:0">${pcv(r.bk, 3.1)}</div><div>${esc(brName(r.bk))}</div>`;
    }
    return '';
  }
  function bind(root, sel, fn) { root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => { snd('click'); fn(b, e); })); }

  // ---- toast & modal ----
  let toastT = 0;
  U.toast = (text) => {
    const t = el('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 1900);
  };
  U.modal = (html, buttons) => {
    const m = el('modal');
    const bts = (buttons || [{ text: 'OK', cls: 'y' }]).map((b, i) => `<button class="btn ${b.cls || ''} o" data-mb="${i}">${esc(b.text)}</button>`).join('');
    m.innerHTML = `<div class="card">${html}<div style="display:flex;gap:.6em;justify-content:center">${bts}</div></div>`;
    show('modal');
    paint(m);
    bind(m, '[data-mb]', (b) => { show('modal', false); const f = (buttons || [])[+b.dataset.mb]; if (f && f.fn) f.fn(); });
  };
  U.closeModal = () => show('modal', false);

  // ---- lobby ----
  let heroRaf = 0, heroT = 0, heroLast = 0;
  function heroLoop(ts) {
    heroRaf = 0;
    if (U.screen !== 'lobby') return;
    const c = $('herocv');
    if (!c) return;
    const dt = heroLast ? Math.min(0.05, (ts - heroLast) / 1000) : 0;
    heroLast = ts; heroT += dt;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext('2d');
    x.clearRect(0, 0, w, h);
    // podium
    x.fillStyle = 'rgba(10,4,30,0.45)';
    x.beginPath(); x.ellipse(w / 2, h * 0.8, w * 0.32, h * 0.09, 0, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(255,210,63,0.6)'; x.lineWidth = 3 * dpr; x.stroke();
    if (typeof Art !== 'undefined') {
      try { Art.brawler(x, S().sel, w / 2, h * 0.8, h * 0.42, Math.PI / 2 + Math.sin(heroT * 0.7) * 0.6, heroT, 0, 0); } catch (e) { /* ignore */ }
    }
    heroRaf = requestAnimationFrame(heroLoop);
  }
  function eventCard(ev) {
    const mi = MODE_INFO[ev.mode] || { name: ev.mode, color: '#888' };
    const left = Math.max(0, ev.endsAt - Date.now());
    return `<div class="eh o" style="background:${mi.color}"><span>${icv(MODE_ICON[ev.mode] || 'star', 1.3)} ${esc(mi.name)}</span><span style="font-size:.8em">▸</span></div>` +
      `<div class="eb"><span>${esc(mapName(ev.map))}</span><span class="muted">${ev.ready ? fmtDuration(left) : 'Soon'}</span></div>`;
  }
  function curEvent() {
    if (typeof Meta === 'undefined') return null;
    const evs = Meta.events(Date.now());
    let ev = evs[S().ev | 0] || evs[0];
    if (!ev.ready) ev = evs.find((e) => e.ready) || ev;
    return ev;
  }
  U.showLobby = () => {
    hideScreens();
    U.screen = 'lobby';
    const s = S(), bk = s.sel, b = s.brawlers[bk] || { lvl: 1, tro: 0 };
    const rs = typeof Meta !== 'undefined' ? Meta.roadState() : { ready: 0, next: null, total: 0, hi: 0 };
    const ps = typeof Meta !== 'undefined' ? Meta.passState() : { ready: 0 };
    const total = typeof Meta !== 'undefined' ? Meta.totalTrophies() : 0;
    const next = rs.next;
    const prevT = typeof Meta !== 'undefined' ? (Meta.ROAD.filter((n) => n.t <= rs.hi).pop() || { t: 0 }).t : 0;
    const pct = next ? clamp((rs.hi - prevT) / Math.max(1, next.t - prevT), 0, 1) * 100 : 100;
    const ev = curEvent();
    const drops = s.drops.length;
    const qDone = typeof Meta !== 'undefined' ? Meta.quests(Date.now()).filter((q) => q.done).length : 0;
    const gift = typeof Meta !== 'undefined' ? Meta.shop(Date.now()).some((o) => o.id === 'gift' && !o.bought) : false;
    const L = el('lobby');
    L.innerHTML = `
      <div class="top">
        <button class="prof" data-go="settings">${pcv(s.icon, 2.2)}<div><div class="nm o">${esc(s.name)}</div><div class="tt o"><i class="troi"></i> ${fmtNum(total)}</div></div></button>
        <button class="road-mini ${rs.ready ? 'dot' : ''}" data-go="road" style="position:relative"><div class="lab o"><span>Trophy Road</span><span>${next ? '<i class="troi"></i> ' + next.t : 'Max'}</span></div><div class="bar"><i style="width:${pct}%"></i></div></button>
        ${curHtml()}
      </div>
      <div class="side">
        <button class="mb o ${gift ? 'dot' : ''}" data-go="shop"><b>🛒</b>Shop</button>
        <button class="mb o" data-go="brawlers"><b>🧢</b>Brawlers</button>
        <button class="mb o ${ps.ready > 0 ? 'dot' : ''}" data-go="pass"><b>🎟️</b>Pass</button>
        <button class="mb o ${qDone ? 'dot' : ''}" data-go="quests"><b>📜</b>Quests</button>
        <button class="mb o" data-go="friends"><b>👥</b>Friends</button>
        ${drops ? `<button class="mb o dot" data-go="drops" style="background:linear-gradient(#ffe46a,#ffb21a);color:#3a2300"><b>⭐</b>Drops ${drops}</button>` : ''}
      </div>
      <button class="hero" data-go="brawler" data-arg="${esc(bk)}"><canvas id="herocv"></canvas><div class="hn o">${esc(brName(bk).toUpperCase())}</div><div class="hi"><span class="lvl o">POWER ${b.lvl}</span><span class="pill o"><i class="troi"></i>${b.tro}</span></div></button>
      <div class="right">
        ${ev ? `<button class="evc" id="evcard" data-go="events">${eventCard(ev)}</button>` : ''}
        <button class="btn y o" id="play" ${ev && ev.ready ? '' : 'disabled'}>PLAY</button>
      </div>`;
    show('lobby');
    paint(L);
    bind(L, '[data-go]', (btn) => U.open(btn.dataset.go, btn.dataset.arg));
    bind(L, '#play', () => {
      const e = curEvent();
      if (!e || !e.ready) { U.toast('This event is coming soon'); return; }
      if (U.onPlay) U.onPlay(e, S().sel);
    });
    heroLast = 0;
    if (!heroRaf && typeof requestAnimationFrame !== 'undefined') heroRaf = requestAnimationFrame(heroLoop);
  };

  // ---- panels ----
  function panel(title, body, opts) {
    hideScreens();
    U.screen = 'panel';
    const P = el('panel');
    P.innerHTML = `<div class="ph"><button class="back o" data-back>◀</button><div class="tl o">${esc(title)}</div>${curHtml()}</div><div class="pb">${body}</div>`;
    show('panel');
    paint(P);
    bind(P, '[data-back]', () => ((opts && opts.back) || U.showLobby)());
    return P;
  }
  U.open = (name, arg) => {
    U.panelName = name; U.panelArg = arg;
    const f = PANELS[name];
    if (f) f(arg); else U.showLobby();
  };
  U.refresh = () => {
    if (U.screen === 'lobby') U.showLobby();
    else if (U.screen === 'panel' && PANELS[U.panelName]) PANELS[U.panelName](U.panelArg);
  };

  const PANELS = {
    events() {
      const evs = Meta.events(Date.now());
      const body = `<div class="offers">${evs.map((ev, i) => `<button class="evc" data-ev="${i}" style="width:15em${ev.ready ? '' : ';filter:grayscale(.8) brightness(.7)'}">${eventCard(ev)}<div class="eb" style="font-size:.7em;font-family:system-ui,sans-serif;font-weight:700">${esc(MODE_INFO[ev.mode].short)}</div></button>`).join('')}</div>`;
      const P = panel('Events', body);
      bind(P, '[data-ev]', (b) => {
        const ev = evs[+b.dataset.ev];
        if (!ev.ready) { U.toast('Coming soon'); return; }
        S().ev = +b.dataset.ev; saveGame(); U.showLobby();
      });
    },
    brawlers() {
      const keys = BRAWLER_KEYS.slice().sort((a, b) => {
        const oa = Meta.owned(a), ob = Meta.owned(b);
        if (oa !== ob) return oa ? -1 : 1;
        if (oa) return Meta.bState(b).tro - Meta.bState(a).tro;
        return Meta.RARITIES.indexOf(brRar(a)) - Meta.RARITIES.indexOf(brRar(b));
      });
      const body = `<div class="grid">${keys.map((bk) => {
        const o = Meta.owned(bk), st = o ? Meta.bState(bk) : null, up = o && Meta.upgradeCost(bk);
        const can = up && S().coins >= up.coins && (S().pp | 0) >= up.pp;
        return `<button class="bc ${o ? '' : 'lock'} ${S().sel === bk ? 'sel' : ''} ${can ? 'dot' : ''}" data-bk="${bk}" style="border-color:${RAR_COL(brRar(bk))}">${pcv(bk, 7)}<div class="bn o">${esc(brName(bk))}</div><div class="bt o">${o ? `<i class="troi"></i> ${st.tro} · P${st.lvl}` : 'Locked'}</div></button>`;
      }).join('')}</div>`;
      const P = panel('Brawlers', body);
      P.querySelectorAll('.bc[data-bk]').forEach((b) => b.addEventListener('click', () => { snd('click'); U.open('brawler', b.dataset.bk); }));
    },
    brawler(bk) {
      bk = bk || S().sel;
      const D = BRAWLERS[bk], o = Meta.owned(bk), st = o ? Meta.bState(bk) : { lvl: 1, tro: 0, best: 0, gad: [], st: [], gadget: -1, star: -1 };
      const lv = st.lvl;
      const ss = typeof brawlerStats === 'function' ? brawlerStats(bk, lv) : null;
      const up = o && Meta.upgradeCost(bk);
      const roadNode = Meta.ROAD.find((n) => n.reward.type === 'brawler' && n.reward.bk === bk);
      const gearRow = (kind, i, g) => {
        if (!g) return '';
        const ownedG = kind === 'gadget' ? st.gad[i] : st.st[i];
        const need = kind === 'gadget' ? Meta.GADGET_LVL : Meta.STAR_LVL;
        const eq = kind === 'gadget' ? st.gadget === i : st.star === i;
        const cost = Meta.gearCost(bk, kind, i);
        let act = '';
        if (o && ownedG) act = `<button class="btn ${eq ? 'g' : 'dark'} o" data-eq="${kind}">${eq ? 'Equipped' : 'Equip'}</button>`;
        else if (o && lv >= need && cost) act = `<button class="btn y o" data-buy="${kind}" ${S().coins >= cost.coins ? '' : 'disabled'}><i class="coin"></i>${fmtNum(cost.coins)}</button>`;
        else act = `<span class="muted" style="font-size:.7em">Power ${need}</span>`;
        return `<div class="abil"><span class="tag o" style="background:${kind === 'gadget' ? '#2fa83d' : '#e0a000'}">${kind === 'gadget' ? 'GADGET' : 'STAR'}</span><div class="tx"><b>${esc(g.name)}</b> ${esc(g.text)}</div>${act}</div>`;
      };
      const stat = (k, v) => `<div class="stat"><div class="k">${k}</div><div class="v o">${v}</div></div>`;
      let actions = '';
      if (o) {
        if (up) actions += `<button class="btn y o" data-up ${S().coins >= up.coins && (S().pp | 0) >= up.pp ? '' : 'disabled'}>Upgrade to ${lv + 1}: <i class="ppi"></i>${up.pp} <i class="coin"></i>${up.coins}</button>`;
        else actions += '<span class="pill o">Max power</span>';
        actions += S().sel === bk ? ' <span class="pill o">Selected</span>' : ` <button class="btn g o" data-sel>Select</button>`;
      } else {
        const c = Meta.creditCost(bk);
        actions += `<button class="btn b o" data-unlock ${S().credits >= c ? '' : 'disabled'}>Unlock <i class="cri"></i>${fmtNum(c)}</button>`;
        if (roadNode) actions += ` <span class="pill o">Trophy Road <i class="troi"></i> ${roadNode.t}</span>`;
      }
      const body = `<div class="det">
        <div class="lft">${pcv(bk, 12)}<div class="o" style="font-size:1.3em">${esc(D.name)}</div><div class="pill o" style="color:${RAR_COL(D.rarity)}">${esc(RARITY[D.rarity].name)} · ${esc(ROLES[D.role])}</div>
          ${o ? `<div class="pill o"><i class="troi"></i> ${st.tro} (best ${st.best})</div>` : ''}</div>
        <div class="rgt">
          <div class="card" style="font-family:system-ui,sans-serif;font-weight:700;font-size:.8em">${esc(D.desc)}</div>
          <div class="stats">${ss ? stat('POWER', lv) + stat('HEALTH', fmtNum(ss.hp)) + stat('DAMAGE', fmtNum(ss.dmg) + (ss.n > 1 ? ' ×' + ss.n : '')) + stat('RANGE', esc(ss.rangeName || ss.range)) + stat('RELOAD', esc(ss.reloadName || ss.reload)) + stat('SPEED', esc(ss.speedName || ss.speed)) + stat('SUPER', fmtNum(ss.supDmg)) + stat('RARITY', esc(RARITY[D.rarity].name)) : ''}</div>
          <div class="card rows">
            <div class="abil"><span class="tag o" style="background:#d22a3a">ATTACK</span><div class="tx"><b>${esc(D.atk.name)}</b> ${esc(D.atk.text)}</div></div>
            <div class="abil"><span class="tag o" style="background:#e0a000;color:#3a2300">SUPER</span><div class="tx"><b>${esc(D.sup.name)}</b> ${esc(D.sup.text)}</div></div>
            ${(D.gadgets || []).map((g, i) => gearRow('gadget', i, g)).join('')}
            ${(D.stars || []).map((g, i) => gearRow('star', i, g)).join('')}
          </div>
          <div>${actions}</div>
        </div></div>`;
      const P = panel(D.name, body, { back: () => U.open('brawlers') });
      bind(P, '[data-up]', () => { if (Meta.upgrade(bk)) { snd('levelUp'); U.toast(`${D.name} is now power ${Meta.bState(bk).lvl}!`); } PANELS.brawler(bk); });
      bind(P, '[data-sel]', () => { Meta.select(bk); U.showLobby(); });
      bind(P, '[data-unlock]', () => { if (Meta.buyBrawler(bk)) { snd('unlock'); U.toast(`${D.name} unlocked!`); } PANELS.brawler(bk); });
      bind(P, '[data-buy]', (b) => { if (Meta.buyGear(bk, b.dataset.buy, 0)) { snd('buy'); } PANELS.brawler(bk); });
      bind(P, '[data-eq]', (b) => {
        const s2 = Meta.bState(bk);
        if (b.dataset.eq === 'gadget') Meta.setGear(bk, s2.gadget === 0 ? -1 : 0, s2.star); else Meta.setGear(bk, s2.gadget, s2.star === 0 ? -1 : 0);
        PANELS.brawler(bk);
      });
    },
    road() {
      const rs = Meta.roadState();
      const nodes = Meta.ROAD;
      const first = Math.max(0, rs.claimed - 2);
      const body = `<div class="card" style="display:flex;justify-content:space-between;align-items:center"><span class="o"><i class="troi"></i> ${fmtNum(rs.total)} total trophies${rs.hi > rs.total ? ` <span class="muted">(best ${fmtNum(rs.hi)})</span>` : ''}</span>${rs.ready ? `<button class="btn y o" data-claim>Claim ${rs.ready} reward${rs.ready > 1 ? 's' : ''}</button>` : rs.next ? `<span class="muted">Next at ${rs.next.t}</span>` : ''}</div>
        <div class="track" id="roadtrack">${nodes.slice(first, first + 40).map((n, j) => {
          const i = first + j, done = i < rs.claimed, ready = !done && n.t <= rs.hi;
          return `<div class="node ${done ? 'done' : ''} ${ready ? 'ready' : ''}"><div class="nt o"><i class="troi"></i> ${n.t}</div><div class="rw">${rewardIcon(n.reward)}</div><div style="font-size:.65em">${done ? 'Claimed' : ready ? 'Ready!' : ''}</div></div>`;
        }).join('')}</div>`;
      const P = panel('Trophy Road', body);
      bind(P, '[data-claim]', () => {
        const got = Meta.claimRoad();
        snd('unlock');
        U.modal(`<div class="o" style="font-size:1.3em">Trophy Road rewards</div><div class="chips">${got.map(rewardHtml).join('')}</div>`, [{ text: 'Nice!', cls: 'y', fn: () => PANELS.road() }]);
      });
    },
    pass() {
      const ps = Meta.passState();
      const tiers = Meta.PASS;
      const first = Math.max(0, ps.claimed - 2);
      const body = `<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:1em"><div style="flex:1"><div class="o">Tier ${ps.tier} / ${tiers.length}</div><div class="qbar"><i style="width:${clamp(ps.tierXp / Math.max(1, ps.tierNeed), 0, 1) * 100}%"></i></div><div class="muted" style="font-size:.7em">${ps.tierXp} / ${ps.tierNeed} XP · play matches and finish quests</div></div>
        ${ps.claimed < ps.tier ? `<button class="btn y o" data-claim>Claim tier ${ps.claimed + 1}</button>` : ps.bonusReady > 0 ? '<button class="btn y o" data-bonus>Claim bonus drop</button>' : ''}</div>
        <div class="track">${tiers.slice(first, first + 30).map((t) => {
          const done = t.tier <= ps.claimed, ready = !done && t.tier <= ps.tier;
          return `<div class="node ${done ? 'done' : ''} ${ready ? 'ready' : ''}"><div class="nt o">Tier ${t.tier}</div><div class="rw">${rewardIcon(t.reward)}</div></div>`;
        }).join('')}</div>`;
      const P = panel('Blast Pass', body);
      bind(P, '[data-claim]', () => { const g = Meta.claimPass(Meta.passState().claimed + 1); snd('confirm'); if (g) U.toast('Got ' + rewardText(g)); PANELS.pass(); });
      bind(P, '[data-bonus]', () => { const g = Meta.claimPass(0); if (g) U.toast('Bonus drop!'); PANELS.pass(); });
    },
    shop() {
      const offers = Meta.shop(Date.now());
      const body = `<div class="offers">${offers.map((o) => `<div class="offer ${o.bought ? 'bought' : ''}"><div class="o">${esc(o.title)}</div><div class="rw">${rewardIcon(o.give)}</div>
        <button class="btn ${o.cost ? 'y' : 'g'} o" data-buy="${o.id}" ${o.bought ? 'disabled' : ''}>${o.bought ? 'Bought' : o.cost ? (o.cost.coins ? `<i class="coin"></i>${o.cost.coins}` : `<i class="gemi"></i>${o.cost.gems}`) : 'FREE'}</button></div>`).join('')}</div>
        <div class="card" style="margin-top:.8em;font-size:.75em;font-family:system-ui,sans-serif;font-weight:700">Gems come from the pass, the Trophy Road and drops. There is nothing to buy with real money.</div>`;
      const P = panel('Shop', body);
      bind(P, '[data-buy]', (b) => {
        const g = Meta.buy(b.dataset.buy, Date.now());
        if (g) { snd('buy'); U.toast('Got ' + rewardText(g)); } else { snd('error'); U.toast('Not enough'); }
        PANELS.shop();
      });
    },
    quests() {
      const qs = Meta.quests(Date.now());
      const d = Meta.daily(Date.now());
      const body = `<div class="rows">${qs.map((q) => `<div class="card quest"><div class="qb"><div class="o">${esc(q.text)}</div><div class="qbar"><i style="width:${(q.n / q.goal) * 100}%"></i></div><div class="muted" style="font-size:.7em">${fmtNum(q.n)} / ${fmtNum(q.goal)}</div></div><span class="pill o">${q.done ? '✔' : '+' + q.xp + ' XP'}</span></div>`).join('')}
        <div class="card quest"><div class="qb"><div class="o">Daily wins: ${d.wins} / ${Meta.DAILY_WIN_DROPS}</div><div class="muted" style="font-size:.7em">Each of your first ${Meta.DAILY_WIN_DROPS} wins today gives a drop.</div></div></div></div>`;
      panel('Quests', body);
    },
    drops() { openDrops(); },
    friends() {
      const evs = (typeof MODE_INFO !== 'undefined' ? Object.keys(MODE_INFO) : []).filter((m) => Meta.mapsFor(m).length);
      const body = `<div class="rows">
        <div class="card rows"><div class="o">Host a friendly battle</div>
          <div class="set"><span>Mode</span><span>${evs.map((m, i) => `<button class="btn ${i === 0 ? 'g' : 'dark'} o" data-fm="${m}">${esc(MODE_INFO[m].name)}</button>`).join(' ')}</span></div>
          <div class="set"><span>Your friend plays</span><span><button class="btn g o" data-ft="1">With you</button> <button class="btn dark o" data-ft="0">Against you</button></span></div>
          <div><button class="btn y o" data-host>Create room</button></div></div>
        <div class="card rows"><div class="o">Join a friend</div><div class="set"><input class="nm" id="fcode" maxlength="6" placeholder="ROOM CODE" autocomplete="off"><button class="btn b o" data-join>Join</button></div></div>
        <div class="card muted" style="font-size:.72em;font-family:system-ui,sans-serif;font-weight:700">Friendly battles connect the two phones directly. AI brawlers fill the other slots. No trophies are won or lost.</div>
      </div>`;
      const P = panel('Friends', body);
      let fm = evs[0] || 'gem', ft = true;
      bind(P, '[data-fm]', (b) => { fm = b.dataset.fm; P.querySelectorAll('[data-fm]').forEach((x) => x.className = 'btn o ' + (x === b ? 'g' : 'dark')); });
      bind(P, '[data-ft]', (b) => { ft = b.dataset.ft === '1'; P.querySelectorAll('[data-ft]').forEach((x) => x.className = 'btn o ' + (x === b ? 'g' : 'dark')); });
      bind(P, '[data-host]', () => {
        const maps = Meta.mapsFor(fm);
        const opts = { mode: fm, map: maps[Math.floor(Math.random() * maps.length)], sameTeam: ft, hostBk: S().sel };
        if (U.onFriendHost) U.onFriendHost(opts); else U.toast('Friend battles are not available');
      });
      bind(P, '[data-join]', () => {
        const code = ($('fcode').value || '').trim().toUpperCase();
        if (code.length < 4) { U.toast('Enter the room code'); return; }
        if (U.onFriendJoin) U.onFriendJoin(code); else U.toast('Friend battles are not available');
      });
    },
    settings() {
      const st = S().settings;
      const tog = (k, label) => `<div class="set"><span>${label}</span><button class="btn tog ${st[k] ? 'g' : 'dark'} o" data-tog="${k}">${st[k] ? 'ON' : 'OFF'}</button></div>`;
      const body = `<div class="rows">
        <div class="card set"><span>Name</span><input class="nm" id="pname" maxlength="16" value="${esc(S().name)}"></div>
        <div class="card rows">${tog('sound', 'Sound effects')}${tog('music', 'Music')}${tog('vibrate', 'Vibration')}${tog('leftHanded', 'Left-handed controls')}
          <div class="set"><span>Graphics</span><span>${['auto', 'high', 'low'].map((q) => `<button class="btn ${st.quality === q ? 'g' : 'dark'} o" data-q="${q}">${q.toUpperCase()}</button>`).join(' ')}</span></div></div>
        <div class="card muted" style="font-size:.72em;font-family:system-ui,sans-serif;font-weight:700">Controls: drag on the left to move. Tap the red button to auto-aim, or drag it to aim and release to fire. The yellow button fires your super once it's charged; the green one uses your gadget. Keyboard: WASD, mouse aim, click to attack, Space for super, Q for gadget.</div>
      </div>`;
      const P = panel('Settings', body);
      const apply = () => { saveGame(); if (U.onSettings) U.onSettings(S().settings); };
      bind(P, '[data-tog]', (b) => { st[b.dataset.tog] = !st[b.dataset.tog]; apply(); PANELS.settings(); });
      bind(P, '[data-q]', (b) => { st.quality = b.dataset.q; apply(); PANELS.settings(); });
      const nm = $('pname');
      nm.addEventListener('change', () => { const v = nm.value.trim().slice(0, 16); if (v) { S().name = v; saveGame(); } });
    },
  };
  function rewardText(g) { return rewardHtml(g).replace(/<[^>]+>/g, '').trim(); }

  // ---- drop opening: tap to climb rarities, like the original ----
  function openDrops() {
    if (!S().drops.length) { U.showLobby(); return; }
    hideScreens();
    U.screen = 'drop';
    const r = Meta.openDrop();
    const D = el('drop');
    let step = 0;
    const draw = () => {
      const rar = r.steps[Math.min(step, r.steps.length - 1)];
      const reveal = step >= r.steps.length;
      D.innerHTML = `<div class="dropr o" style="color:${RAR_COL(rar)}">${esc(RARITY[rar].name)} Drop</div>
        <button class="dropb o" id="dropb" style="background:radial-gradient(circle at 40% 35%,#fff,${RAR_COL(rar)} 55%,${shade(RAR_COL(rar), -0.4)})">${reveal ? '' : 'TAP'}</button>
        <div id="dropr">${reveal ? rewardHtml(r.reward) : `<span class="muted">${step + 1} / ?</span>`}</div>
        ${reveal ? `<button class="btn y o" id="dropn">${S().drops.length ? `Next (${S().drops.length})` : 'Done'}</button>` : ''}`;
      show('drop');
      const b = $('dropb');
      b.addEventListener('click', () => {
        if (step >= r.steps.length) return;
        step++;
        snd(step >= r.steps.length ? 'dropOpen' : 'drop', { n: step >= r.steps.length ? Meta.RARITIES.indexOf(r.rarity) : step });
        b.classList.add('pop');
        setTimeout(draw, 160);
      });
      const n = $('dropn');
      if (n) n.addEventListener('click', () => { snd('click'); if (S().drops.length) openDrops(); else U.showLobby(); });
    };
    draw();
  }
  U.openDrops = openDrops;

  // ---- matchmaking, VS, results ----
  function slotHtml(s, extra) {
    return `<div class="mmslot rel">${pcv(s.bk, 4.6)}<div class="pn o">${esc(s.name)}</div><div class="o" style="font-size:.85em"><i class="troi"></i> ${s.tro | 0} · P${s.lvl}</div>${extra || ''}</div>`;
  }
  let mmTimer = 0;
  U.showMatchmaking = (cfg, onDone) => {
    hideScreens();
    U.screen = 'mm';
    const M = el('mm');
    const n = cfg.slots.length;
    let filled = 1;
    const order = cfg.slots.map((s, i) => i).filter((i) => i !== cfg.localSlot);
    const draw = () => {
      const shown = new Set([cfg.localSlot, ...order.slice(0, filled - 1)]);
      M.innerHTML = `<div class="mmt o">${filled < n ? 'Searching for players...' : 'Players found!'}</div><div class="o">${filled} / ${n}</div>
        <div class="mms">${cfg.slots.map((s, i) => (shown.has(i) ? slotHtml(s) : '<div class="mmslot empty"><div class="o" style="font-size:2em">?</div></div>')).join('')}</div>
        <div class="o" style="color:${MODE_INFO[cfg.mode].color}">${esc(MODE_INFO[cfg.mode].name)} · ${esc(mapName(cfg.map))}</div>
        <button class="btn r o" id="mmx">Cancel</button>`;
      show('mm');
      paint(M);
      $('mmx').addEventListener('click', () => { clearTimeout(mmTimer); snd('back'); U.showLobby(); });
    };
    draw();
    const stepFill = () => {
      if (filled >= n) { mmTimer = setTimeout(onDone, 500); return; }
      filled += 1 + (Math.random() < 0.3 ? 1 : 0);
      filled = Math.min(n, filled);
      snd('click');
      draw();
      mmTimer = setTimeout(stepFill, 180 + Math.random() * (n > 6 ? 300 : 520));
    };
    mmTimer = setTimeout(stepFill, 400 + Math.random() * 400);
  };
  U.showVs = (cfg, onDone) => {
    hideScreens();
    U.screen = 'vs';
    const V = el('vs');
    let html;
    if (cfg.mode === MODE.SHOWDOWN) {
      html = `<div class="mmt o">${esc(MODE_INFO.sd.name)}</div><div class="vsrow sd" style="flex-wrap:wrap;max-width:92vw">${cfg.slots.map((s) => slotHtml(s)).join('')}</div>`;
    } else {
      const t0 = cfg.slots.filter((s) => s.team === 0), t1 = cfg.slots.filter((s) => s.team === 1);
      const myTeam = cfg.slots[cfg.localSlot].team;
      const rowA = myTeam === 0 ? t0 : t1, rowB = myTeam === 0 ? t1 : t0;
      html = `<div class="vsrow t0">${rowA.map((s) => slotHtml(s)).join('')}</div><div class="vsx o">VS</div><div class="vsrow t1">${rowB.map((s) => slotHtml(s)).join('')}</div>`;
    }
    V.innerHTML = html + `<div class="o" style="font-size:.9em">${esc(MODE_INFO[cfg.mode].name)} · ${esc(mapName(cfg.map))}</div>`;
    show('vs');
    paint(V);
    snd('go');
    let done = false;
    const fin = () => { if (done) return; done = true; onDone && onDone(); };
    V.onclick = fin;
    setTimeout(fin, 2600);
  };
  U.showResult = (summary, result, cfg, onAgain, onExit) => {
    hideScreens();
    U.screen = 'result';
    const R = el('result');
    const me = cfg.slots[cfg.localSlot];
    let head, cls;
    if (cfg.mode === MODE.SHOWDOWN) { head = `RANK #${summary.rank || '?'}`; cls = summary.rank <= 4 ? 'win' : 'loss'; } else if (summary.outcome === 'win') { head = 'VICTORY'; cls = 'win'; } else if (summary.outcome === 'draw') { head = 'DRAW'; cls = 'draw'; } else { head = 'DEFEAT'; cls = 'loss'; }
    const order = cfg.mode === MODE.SHOWDOWN && result.rank && result.rank.length ? result.rank.slice(0, 10) : cfg.slots.map((s, i) => i).sort((a, b) => (cfg.slots[a].team === me.team ? 0 : 1) - (cfg.slots[b].team === me.team ? 0 : 1));
    const rows = order.map((i) => {
      const s = cfg.slots[i], st = (result.stats && result.stats[i]) || {};
      const tcol = cfg.mode === MODE.SHOWDOWN ? (i === cfg.localSlot ? '#3d9bff' : '#5bd16a') : s.team === me.team ? '#3d9bff' : '#ff4a4a';
      return `<div class="mmslot rel" style="background:linear-gradient(${tcol},${shade(tcol, -0.45)});${i === cfg.localSlot ? 'outline:.18em solid #ffd23f' : ''}">${result.mvp === i ? '<div class="mvp">STAR</div>' : ''}${pcv(s.bk, 4.2)}<div class="pn o">${esc(s.name)}</div><div class="o" style="font-size:.85em">⚔ ${st.kills | 0} · ☠ ${st.deaths | 0}</div></div>`;
    }).join('');
    const chips = [];
    if (summary.friendly) chips.push('<span class="chip o">Friendly battle · no trophies</span>');
    else {
      const d = summary.troDelta;
      chips.push(`<span class="chip o" style="color:${d > 0 ? '#ffd23f' : d < 0 ? '#ff7a7a' : '#fff'}"><i class="troi"></i> ${d > 0 ? '+' : ''}${d}${summary.newbie && d > 0 ? ' <span style="font-size:.7em;color:#7be56f">NEW PLAYER BONUS</span>' : ''}</span>`);
      chips.push(`<span class="chip o">+${summary.passXp} pass XP</span>`);
      if (summary.dropEarned) chips.push(`<span class="chip o" style="color:#ffd23f">Daily win drop! (${summary.dailyWins}/${summary.dailyWinMax})</span>`);
      for (const q of summary.questsDone || []) chips.push(`<span class="chip o" style="color:#7be56f">Quest done: ${esc(q)}</span>`);
      if (summary.roadReady) chips.push(`<span class="chip o" style="color:#ffd23f">Trophy Road reward ready!</span>`);
      if (summary.mvp) chips.push('<span class="chip o" style="color:#ffd23f">You were the star player!</span>');
    }
    // the final score, your team first (gems, goals, rounds or stars)
    const unit = { gem: 'gems', ball: 'goals', ko: 'rounds', bounty: 'stars' }[cfg.mode];
    const sc = result.score || [0, 0], mine = me.team === 1 ? [sc[1], sc[0]] : sc;
    const scoreLine = unit && cfg.mode !== MODE.SHOWDOWN ? `<div class="o" style="font-size:1.05em;margin-top:-.3em"><span style="color:#5ab4ff">${mine[0] | 0}</span> - <span style="color:#ff6a6a">${mine[1] | 0}</span> ${unit}</div>` : '';
    R.innerHTML = `<div class="res-h o ${cls}">${head}</div>${scoreLine}
      <div class="res-rows">${rows}</div>
      <div class="chips">${chips.join('')}</div>
      <div style="display:flex;gap:.8em"><button class="btn dark o" id="rx">Exit</button>${summary.friendly ? '' : '<button class="btn y o" id="ra">Play again</button>'}</div>`;
    show('result');
    paint(R);
    snd(cls === 'win' ? 'victory' : cls === 'draw' ? 'draw' : 'defeat');
    if (!summary.friendly && summary.troDelta) setTimeout(() => snd(summary.troDelta > 0 ? 'trophyUp' : 'trophyDown'), 900);
    $('rx').addEventListener('click', () => { snd('click'); (onExit || U.showLobby)(); });
    const a = $('ra');
    if (a) a.addEventListener('click', () => { snd('click'); onAgain && onAgain(); });
  };
  U.showPause = (onResume, onQuit) => {
    const P = el('pause');
    P.innerHTML = `<div class="card"><div class="o" style="font-size:1.4em">Paused</div><button class="btn g o" id="pr">Resume</button><button class="btn dark o" id="ps">Settings</button><button class="btn r o" id="pq">Leave match</button></div>`;
    show('pause');
    $('pr').addEventListener('click', () => { snd('click'); show('pause', false); onResume && onResume(); });
    $('pq').addEventListener('click', () => { snd('click'); show('pause', false); onQuit && onQuit(); });
    $('ps').addEventListener('click', () => {
      const st = S().settings;
      U.modal(`<div class="o">Settings</div><div class="rows">${['sound', 'music', 'vibrate', 'leftHanded'].map((k) => `<div class="set"><span>${{ sound: 'Sound', music: 'Music', vibrate: 'Vibration', leftHanded: 'Left-handed' }[k]}</span><button class="btn tog ${st[k] ? 'g' : 'dark'} o" data-tg="${k}">${st[k] ? 'ON' : 'OFF'}</button></div>`).join('')}</div>`, [{ text: 'Done', cls: 'y' }]);
      bind(el('modal'), '[data-tg]', (b) => { st[b.dataset.tg] = !st[b.dataset.tg]; b.textContent = st[b.dataset.tg] ? 'ON' : 'OFF'; b.className = 'btn tog o ' + (st[b.dataset.tg] ? 'g' : 'dark'); saveGame(); if (U.onSettings) U.onSettings(st); });
    });
  };
  U.hidePause = () => show('pause', false);
  U.hideAll = () => { hideScreens(); show('modal', false); U.screen = ''; };

  // ---- friend lobby (state from the network layer) ----
  // state: { role: 'host' | 'guest', code, status, friend: { name, bk } | null, mode, map, sameTeam, canStart }
  U.friendLobby = (state) => {
    const mi = MODE_INFO[state.mode] || { name: '', color: '#888' };
    const body = `<div class="rows">
      <div class="card" style="text-align:center"><div class="muted" style="font-size:.8em">${state.role === 'host' ? 'Room code - tell it to your friend' : 'Room'}</div><div class="o" style="font-size:2.4em;letter-spacing:.2em">${esc(state.code || '------')}</div></div>
      <div class="card set"><span>${esc(mi.name)} · ${esc(mapName(state.map))}</span><span>${state.sameTeam ? 'Same team' : 'Opponents'}</span></div>
      <div class="card set"><span>${state.friend ? `${pcv(state.friend.bk, 2.2)} ${esc(state.friend.name)}` : 'Waiting for your friend...'}</span><span class="muted" id="fstatus">${esc(state.status || '')}</span></div>
      ${state.role === 'host' ? `<div><button class="btn y o" data-fs ${state.canStart ? '' : 'disabled'}>Start</button></div>` : ''}
    </div>`;
    const P = panel('Friendly battle', body, { back: () => { if (U.onFriendLeave) U.onFriendLeave(); U.showLobby(); } });
    U.panelName = '';
    bind(P, '[data-fs]', () => { if (U.onFriendStart) U.onFriendStart(); });
  };
  U.friendStatus = (text) => { const s = $('fstatus'); if (s) s.textContent = text; else U.toast(text); };

  U.init = () => {
    if (S() && S().settings && U.onSettings) U.onSettings(S().settings);
  };
  return U;
})();
