// ---------- UI: the lobby and menus (DOM overlay, landscape) ----------
// Screens: lobby, panels (events, brawlers, brawler details, Trophy Road, pass, shop, quests,
// friends, settings), drop opening, matchmaking, VS intro, results, pause, modal and toasts.
// Data comes only from Meta / SAVE / BRAWLERS; pictures from Art. The game wires the hooks:
//   UI.onPlay(event, bk)  UI.onFriendHost(opts)  UI.onFriendJoin(code)  UI.onFriendStart()
//   UI.onFriendLeave()  UI.onSettings(settings)
//   friendly room (host): UI.onFriendSlot(i)  UI.onFriendMode()  UI.onFriendMap()  UI.onFriendBots(on)
// UI.home: where the menus go back to (the lobby, or the friendly room while one is open).
const UI = (() => {
  const U = {
    screen: '', panelName: '', panelArg: null,
    onPlay: null, onFriendHost: null, onFriendJoin: null, onFriendStart: null, onFriendLeave: null, onSettings: null,
    onFriendSlot: null, onFriendMode: null, onFriendMap: null, onFriendBots: null, home: null,
  };
  const goHome = () => (U.home || U.showLobby)();
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
    const page = U.screen === 'panel' && U.panelName === 'brawler';
    if (U.screen !== 'lobby' && U.screen !== 'room' && !page) return;
    const c = $(page ? 'bdcv' : 'herocv');
    if (!c) return;
    const dt = heroLast ? Math.min(0.05, (ts - heroLast) / 1000) : 0;
    heroLast = ts; heroT += dt;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext('2d');
    x.clearRect(0, 0, w, h);
    // podiums: you in the middle; in a friendly room your friend stands beside you (as in the
    // original's team lobby), on your side if they are with you
    const list = page ? [U.panelArg || S().sel] : U.screen === 'room' && U.heroes ? U.heroes : [S().sel];
    const one = list.length < 2 || !list[1];
    for (let k = 0; k < list.length; k++) {
      if (!list[k]) continue;
      const cx = one ? w / 2 : w * (k === 0 ? 0.36 : 0.74), sc = one || k === 0 ? 1 : 0.8;
      x.fillStyle = 'rgba(10,4,30,0.45)';
      x.beginPath(); x.ellipse(cx, h * 0.8, w * (one ? 0.32 : 0.2) * sc, h * 0.09 * sc, 0, 0, TAU); x.fill();
      x.strokeStyle = k === 0 ? 'rgba(255,210,63,0.6)' : U.heroFoe ? 'rgba(255,90,90,0.7)' : 'rgba(80,170,255,0.7)'; x.lineWidth = 3 * dpr; x.stroke();
      if (typeof Art !== 'undefined') {
        try { Art.brawler(x, list[k], cx, h * 0.8, h * 0.42 * sc, Math.PI / 2 + Math.sin(heroT * 0.7 + k * 1.3) * 0.6, heroT + k * 0.4, 0, 0); } catch (e) { /* ignore */ }
      }
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
    const login = typeof Meta !== 'undefined' && Meta.loginState ? Meta.loginState(Date.now()) : { ready: false };
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
        <button class="mb o ${login.ready ? 'dot' : ''}" data-go="login"><b>📅</b>Daily</button>
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
    // the daily login reward pops up the first time the lobby shows on a new day
    if (login.ready && !loginShown && !(typeof navigator !== 'undefined' && navigator.webdriver)) { loginShown = true; setTimeout(() => { if (U.screen === 'lobby') U.showLogin(); }, 350); }
  };
  let loginShown = false;

  // ---- daily login reward: seven days in a row, today's tile highlighted ----
  function rewardTile(r) {
    if (r.type === 'drop') return { ic: '⭐', tx: r.rarity ? (r.rarity[0].toUpperCase() + r.rarity.slice(1)) + ' drop' : 'Drop' };
    const ic = { coins: '<i class="coin"></i>', pp: '<i class="ppi"></i>', gems: '<i class="gemi"></i>', credits: '<i class="cri"></i>' }[r.type] || '🎁';
    return { ic, tx: fmtNum(r.n) };
  }
  U.showLogin = () => {
    const st = Meta.loginState(Date.now());
    const tiles = st.list.map((r, i) => {
      const t = rewardTile(r), done = i < st.day || (!st.ready && i === st.day), today = st.ready && i === st.day;
      return `<div class="lday ${today ? 'today' : ''} ${done ? 'done' : ''}"><div class="o" style="font-size:.7em">DAY ${i + 1}</div><div class="o" style="font-size:1.5em">${t.ic}</div><div class="o" style="font-size:.8em">${t.tx}</div>${done ? '<div class="lck o">✔</div>' : ''}</div>`;
    }).join('');
    const html = `<div class="o" style="font-size:1.3em;margin-bottom:.4em">Daily login reward</div><div class="ldays">${tiles}</div>
      <div class="muted" style="font-size:.75em;margin:.5em 0">${st.ready ? 'Come back every day for the next reward.' : 'Claimed today. Come back tomorrow!'}</div>`;
    U.modal(html, st.ready ? [{ text: 'Claim', cls: 'y', fn: () => {
      const g = Meta.claimLogin(Date.now());
      if (g) { snd('buy'); const t = rewardTile(g); U.toast(`Got ${t.tx.replace(/<[^>]*>/g, '')}${g.type === 'drop' ? '' : ' ' + g.type}!`); }
      if (U.screen === 'lobby') U.showLobby(); else if (U.screen === 'panel') U.refresh();
    } }] : [{ text: 'OK', cls: 'y' }]);
  };

  // ---- panels ----
  function panel(title, body, opts) {
    hideScreens();
    U.screen = 'panel';
    const P = el('panel');
    P.innerHTML = `<div class="ph"><button class="back o" data-back>◀</button><div class="tl o">${esc(title)}</div>${curHtml()}</div><div class="pb">${body}</div>`;
    show('panel');
    paint(P);
    bind(P, '[data-back]', () => ((opts && opts.back) || goHome)());
    return P;
  }
  U.open = (name, arg) => {
    U.panelName = name; U.panelArg = arg;
    const f = PANELS[name];
    if (f) f(arg); else goHome();
  };
  U.refresh = () => {
    if (U.screen === 'lobby') U.showLobby();
    else if (U.screen === 'room') goHome();
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
    // The brawler list, laid out like the original's: a card per brawler in its rarity's colour, name
    // on top, power level in a badge, trophies under it; locked ones dark.
    brawlers() {
      const keys = BRAWLER_KEYS.slice().sort((a, b) => {
        const oa = Meta.owned(a), ob = Meta.owned(b);
        if (oa !== ob) return oa ? -1 : 1;
        if (oa) return Meta.bState(b).tro - Meta.bState(a).tro;
        return Meta.RARITIES.indexOf(brRar(a)) - Meta.RARITIES.indexOf(brRar(b));
      });
      const nOwned = keys.filter((k) => Meta.owned(k)).length;
      const body = `<div class="muted o" style="font-size:.8em;margin-bottom:.4em">${nOwned} / ${keys.length} unlocked</div><div class="grid">${keys.map((bk) => {
        const o = Meta.owned(bk), st = o ? Meta.bState(bk) : null, up = o && Meta.upgradeCost(bk);
        const can = up && S().coins >= up.coins && (S().pp | 0) >= up.pp, col = RAR_COL(brRar(bk));
        return `<button class="bc ${o ? '' : 'lock'} ${S().sel === bk ? 'sel' : ''} ${can ? 'dot' : ''}" data-bk="${bk}" style="background:linear-gradient(${col},#1d1240 95%)"><div class="bn o">${esc(brName(bk).toUpperCase())}</div>${pcv(bk, 7)}${o ? `<div class="bpw o">${st.lvl}</div><div class="bt o"><i class="troi"></i> ${st.tro}</div>` : '<div class="bt o" style="color:#cfc8ff">🔒 Locked</div>'}</button>`;
      }).join('')}</div>`;
      const P = panel('Brawlers', body);
      P.querySelectorAll('.bc[data-bk]').forEach((b) => b.addEventListener('click', () => { snd('click'); U.open('brawler', b.dataset.bk); }));
    },
    // A brawler's page, laid out like the original's: name, rarity and class with the trophies and
    // the power level (power points bar, upgrade) on the left, the brawler turning on a podium in the
    // middle, its stats (health, attack, super, with the next level's gain) and ability icons on the
    // right, and a big SELECT. Tapping an ability shows what it does (and buys or equips gear).
    brawler(bk) {
      bk = bk || S().sel;
      const D = BRAWLERS[bk], o = Meta.owned(bk), st = o ? Meta.bState(bk) : { lvl: 1, tro: 0, best: 0, gad: [], st: [], gadget: -1, star: -1 };
      const lv = st.lvl;
      const ss = typeof brawlerStats === 'function' ? brawlerStats(bk, lv) : null;
      const nx = typeof brawlerStats === 'function' && lv < MAX_POWER ? brawlerStats(bk, lv + 1) : null;
      const up = o && Meta.upgradeCost(bk);
      const roadNode = Meta.ROAD.find((n) => n.reward.type === 'brawler' && n.reward.bk === bk);
      const col = RAR_COL(D.rarity);
      const gain = (k) => (o && nx && ss && nx[k] > ss[k] ? `<span class="nx">+${fmtNum(nx[k] - ss[k])}</span>` : '');
      const row = (ic, k, v, g) => `<div class="srow"><span class="sic">${ic}</span><span class="sk o">${k}</span><span class="sv o">${v}${g || ''}</span></div>`;
      const ppHave = S().pp | 0, ppNeed = up ? up.pp : 0, ppF = up ? clamp(ppHave / Math.max(1, ppNeed), 0, 1) : 1;
      // abilities: attack, super, gadgets, star powers as tiles
      const tiles = [{ k: 'atk', tag: 'ATTACK', c: '#d22a3a', g: D.atk }, { k: 'sup', tag: 'SUPER', c: '#e0a000', g: D.sup }]
        .concat((D.gadgets || []).map((g, i) => ({ k: 'gadget', i, tag: 'GADGET', c: '#2fa83d', g })))
        .concat((D.stars || []).map((g, i) => ({ k: 'star', i, tag: 'STAR POWER', c: '#e0a000', g })));
      const tileHtml = (t, j) => {
        let state = '';
        if (t.k === 'gadget' || t.k === 'star') {
          const has = t.k === 'gadget' ? st.gad[t.i] : st.st[t.i], eq = t.k === 'gadget' ? st.gadget === t.i : st.star === t.i;
          state = eq ? 'eq' : has ? '' : 'off';
        }
        const ic = t.k === 'atk' ? '🎯' : t.k === 'sup' ? '💥' : t.k === 'gadget' ? '⚡' : '⭐';
        return `<button class="atile ${state}" data-ab="${j}" style="--c:${t.c}"><span class="aic">${ic}</span><span class="atg o">${t.tag}</span>${state === 'eq' ? '<span class="aeq o">✔</span>' : ''}</button>`;
      };
      let main = '';
      if (o) main = S().sel === bk ? '<button class="btn dark o bsel" disabled>SELECTED</button>' : '<button class="btn y o bsel" data-sel>SELECT</button>';
      else {
        const c = Meta.creditCost(bk);
        main = `<button class="btn b o bsel" data-unlock ${S().credits >= c ? '' : 'disabled'}>UNLOCK <i class="cri"></i>${fmtNum(c)}</button>` + (roadNode ? `<div class="pill o" style="font-size:.75em">Trophy Road <i class="troi"></i> ${roadNode.t}</div>` : '');
      }
      const body = `<div class="bdet">
        <div class="bl">
          <div class="bname o">${esc(D.name.toUpperCase())}</div>
          <div><span class="brar o" style="background:${col}">${esc(RARITY[D.rarity].name.toUpperCase())}</span> <span class="pill o" style="font-size:.75em">${esc(ROLES[D.role])}</span></div>
          ${o ? `<div class="btro"><i class="troi" style="font-size:1.6em"></i><div><div class="o" style="font-size:1.3em">${st.tro}</div><div class="muted o" style="font-size:.65em">HIGHEST ${st.best}</div></div></div>` : ''}
          <div class="bpow"><div class="pbadge o"><span>POWER</span><b>${lv}</b></div><div style="flex:1">
            ${o && up ? `<div class="ppbar"><i style="width:${ppF * 100}%"></i><span class="o"><i class="ppi"></i> ${fmtNum(ppHave)} / ${fmtNum(ppNeed)}</span></div>` : `<div class="ppbar max"><i style="width:100%"></i><span class="o">${o ? 'MAX' : 'Not unlocked'}</span></div>`}
          </div></div>
          ${o && up ? `<button class="btn g o bup" data-up ${S().coins >= up.coins && ppHave >= up.pp ? '' : 'disabled'}>UPGRADE <i class="coin"></i> ${fmtNum(up.coins)}</button>` : ''}
          <div class="bdesc">${esc(D.desc)}</div>
        </div>
        <div class="bm"><canvas id="bdcv"></canvas></div>
        <div class="br">
          <div class="scard">
            ${ss ? row('❤️', 'HEALTH', fmtNum(ss.hp), gain('hp')) + row('🎯', 'ATTACK', fmtNum(ss.dmg) + (ss.n > 1 ? ' ×' + ss.n : ''), gain('dmg')) + row('💥', 'SUPER', ss.supDmg ? fmtNum(ss.supDmg) : '—', gain('supDmg')) : ''}
            ${ss ? `<div class="smini muted o"><span>Range ${esc(ss.rangeName || ss.range)}</span><span>Reload ${esc(ss.reloadName || ss.reload)}</span><span>Speed ${esc(ss.speedName || ss.speed)}</span></div>` : ''}
          </div>
          <div class="atiles">${tiles.map(tileHtml).join('')}</div>
          <div class="bmain">${main}</div>
        </div>
      </div>`;
      const P = panel(D.name, body, { back: () => U.open('brawlers') });
      bind(P, '[data-up]', () => { if (Meta.upgrade(bk)) { snd('levelUp'); U.toast(`${D.name} is now power ${Meta.bState(bk).lvl}!`); } PANELS.brawler(bk); });
      bind(P, '[data-sel]', () => { Meta.select(bk); goHome(); });
      bind(P, '[data-unlock]', () => { if (Meta.buyBrawler(bk)) { snd('unlock'); U.toast(`${D.name} unlocked!`); } PANELS.brawler(bk); });
      bind(P, '[data-ab]', (b) => {
        const t = tiles[+b.dataset.ab], btns = [];
        let note = '';
        if (t.k === 'gadget' || t.k === 'star') {
          const s2 = o ? Meta.bState(bk) : st, has = t.k === 'gadget' ? s2.gad[t.i] : s2.st[t.i], eq = t.k === 'gadget' ? s2.gadget === t.i : s2.star === t.i;
          const need = t.k === 'gadget' ? Meta.GADGET_LVL : Meta.STAR_LVL, cost = Meta.gearCost(bk, t.k, t.i);
          // one of each can be equipped; tapping the equipped one takes it off
          const setEq = () => { const s3 = Meta.bState(bk); if (t.k === 'gadget') Meta.setGear(bk, s3.gadget === t.i ? -1 : t.i, s3.star); else Meta.setGear(bk, s3.gadget, s3.star === t.i ? -1 : t.i); PANELS.brawler(bk); };
          if (o && has) btns.push({ text: eq ? 'Unequip' : 'Equip', cls: eq ? 'dark' : 'g', fn: setEq });
          else if (o && lv >= need && cost) btns.push({ text: `Buy for ${fmtNum(cost.coins)} coins`, cls: 'y', fn: () => { if (Meta.buyGear(bk, t.k, t.i)) snd('buy'); else U.toast('Not enough coins'); PANELS.brawler(bk); } });
          else note = `<div class="muted" style="font-size:.75em;margin-top:.4em">Unlocks at power ${need}</div>`;
        }
        btns.push({ text: 'Close', cls: 'dark' });
        U.modal(`<div class="o" style="font-size:.75em;color:${t.c}">${t.tag}</div><div class="o" style="font-size:1.25em;margin:.15em 0 .4em">${esc(t.g.name)}</div><div style="font-family:system-ui,sans-serif;font-weight:700;font-size:.85em;max-width:24em">${esc(t.g.text)}</div>${note}<div style="height:.6em"></div>`, btns);
      });
      heroLast = 0;
      if (!heroRaf && typeof requestAnimationFrame !== 'undefined') heroRaf = requestAnimationFrame(heroLoop);
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
    login() { U.showLobby(); U.showLogin(); },
    friends() {
      const evs = (typeof MODE_INFO !== 'undefined' ? Object.keys(MODE_INFO) : []).filter((m) => Meta.mapsFor(m).length);
      const body = `<div class="rows">
        <div class="card rows"><div class="o">Host a friendly battle</div>
          <div class="set"><span>Mode</span><span>${evs.map((m, i) => `<button class="btn ${i === 0 ? 'g' : 'dark'} o" data-fm="${m}">${esc(MODE_INFO[m].name)}</button>`).join(' ')}</span></div>
          <div class="set"><span>Your friend plays</span><span><button class="btn g o" data-ft="1">With you</button> <button class="btn dark o" data-ft="0">Against you</button></span></div>
          <div><button class="btn y o" data-host>Create room</button></div></div>
        <div class="card rows"><div class="o">Join a friend</div><div class="set"><input class="nm" id="fcode" maxlength="6" placeholder="ROOM CODE" autocomplete="off"><button class="btn b o" data-join>Join</button></div></div>
        <div class="card muted" style="font-size:.72em;font-family:system-ui,sans-serif;font-weight:700">Friendly battles connect the two phones directly. In the room the host can add or take away bots, move players between teams and change the mode and map. No trophies are won or lost.</div>
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
          <div class="set"><span>Graphics</span><span>${['auto', 'high', 'low'].map((q) => `<button class="btn ${st.quality === q ? 'g' : 'dark'} o" data-q="${q}">${q.toUpperCase()}</button>`).join(' ')}</span></div>
          <div class="set"><span>Button size</span><span>${[['S', 0.85], ['M', 1], ['L', 1.2], ['XL', 1.4]].map(([n, v]) => `<button class="btn ${(+st.btnSize || 1) === v ? 'g' : 'dark'} o" data-bs="${v}">${n}</button>`).join(' ')}</span></div></div>
        <div class="card muted" style="font-size:.72em;font-family:system-ui,sans-serif;font-weight:700">Controls: drag on the left to move. Tap the red button to auto-aim, or drag it to aim and release to fire. The yellow button fires your super once it's charged; the green one uses your gadget. Keyboard: WASD, mouse aim, click to attack, Space for super, Q for gadget.</div>
      </div>`;
      const P = panel('Settings', body);
      const apply = () => { saveGame(); if (U.onSettings) U.onSettings(S().settings); };
      bind(P, '[data-tog]', (b) => { st[b.dataset.tog] = !st[b.dataset.tog]; apply(); PANELS.settings(); });
      bind(P, '[data-q]', (b) => { st.quality = b.dataset.q; apply(); PANELS.settings(); });
      bind(P, '[data-bs]', (b) => { st.btnSize = +b.dataset.bs; apply(); PANELS.settings(); });
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
      <div style="display:flex;gap:.8em"><button class="btn dark o" id="rx">Exit</button>${summary.friendly ? (summary.rematch ? '<button class="btn y o" id="ra">Back to room</button>' : '') : '<button class="btn y o" id="ra">Play again</button>'}</div>`;
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

  // ---- friendly room (state from the network layer) ----
  // Laid out like the lobby, as the original's friendly games are: your brawler (tap it to pick
  // another) with your friend beside you, the event on the right with a big PLAY under it, and the
  // two teams' places on the left. The host taps an empty place to add a bot, a bot to take it away,
  // or a player to send them to the other team; Showdown has ten places and no teams.
  // state: { role: 'host' | 'guest', code, status, friend: { name, bk, lvl } | null, mode, map,
  //          layout: ['host' | 'guest' | 'bot' | 'empty', ...] | null, canStart, why }
  U.friendLobby = (state) => {
    hideScreens();
    U.screen = 'room';
    const s = S(), host = state.role === 'host', me = host ? 'host' : 'guest';
    const mine = s.brawlers[s.sel] || { lvl: 1 };
    const mi = MODE_INFO[state.mode] || { name: state.mode ? state.mode : '...', color: '#666' };
    const L = state.layout, sd = state.mode === MODE.SHOWDOWN;
    const half = L ? L.length / 2 : 3;
    const teamOf = (k) => (L && !sd ? (L.indexOf(k) < half ? 0 : 1) : 0);
    const fr = state.friend;
    U.heroes = [s.sel, fr ? fr.bk : null];
    U.heroFoe = !!(L && !sd && teamOf('host') !== teamOf('guest'));
    const place = (k, i) => {
      const tap = host ? `data-slot="${i}"` : 'disabled';
      if (k === me) return `<button class="rslot you" ${tap}>${pcv(s.sel, 2.6)}<div class="pn o">${esc(s.name)}</div><div class="o lv">P${mine.lvl}</div></button>`;
      if (k === 'host' || k === 'guest') {
        return fr ? `<button class="rslot pl" ${tap}>${pcv(fr.bk, 2.6)}<div class="pn o">${esc(fr.name)}</div><div class="o lv">P${fr.lvl || 1}</div></button>`
          : `<button class="rslot pl wait" ${tap}><div class="o big">…</div><div class="pn o">Friend</div></button>`;
      }
      if (k === 'bot') return `<button class="rslot bot" ${tap}><div class="o big">🤖</div><div class="pn o">BOT</div></button>`;
      return `<button class="rslot empty" ${tap}><div class="o big">+</div><div class="pn o">${host ? 'Add bot' : 'Empty'}</div></button>`;
    };
    let teams = '';
    if (L && sd) teams = `<div class="rteam sd">${L.map(place).join('')}</div>`;
    else if (L) {
      const row = (t) => `<div class="rlab o">${t ? 'RED TEAM' : 'BLUE TEAM'}</div><div class="rteam t${t}">${L.slice(t * half, t * half + half).map((k, j) => place(k, t * half + j)).join('')}</div>`;
      teams = row(0) + row(1);
    } else teams = '<div class="muted o">Waiting for the room...</div>';
    const El = el('lobby');
    El.innerHTML = `
      <div class="top">
        <button class="back o" data-rback>◀</button>
        <div class="o" style="font-size:1.1em">FRIENDLY GAME</div>
        <div class="pill o rcode">${host ? 'CODE' : 'ROOM'} <b>${esc(state.code || '------')}</b></div>
        <span class="muted o" id="fstatus" style="font-size:.8em">${esc(state.status || '')}</span>
      </div>
      <div class="rteams">${teams}${host && L ? `<div class="rbots"><button class="btn dark o" data-bots="1">Fill bots</button><button class="btn dark o" data-bots="0">No bots</button></div>` : ''}</div>
      <button class="hero" data-pick><canvas id="herocv"></canvas><div class="hn o">${esc(brName(s.sel).toUpperCase())}${fr ? ` <span style="opacity:.7">&amp; ${esc(brName(fr.bk).toUpperCase())}</span>` : ''}</div><div class="hi"><span class="lvl o">POWER ${mine.lvl}</span><span class="pill o">Tap to change</span></div></button>
      <div class="right">
        <div class="evc">
          <button class="eh o" data-rmode style="background:${mi.color};width:100%"><span>${icv(MODE_ICON[state.mode] || 'star', 1.3)} ${esc(mi.name)}</span><span style="font-size:.8em">${host ? '⟳' : ''}</span></button>
          <button class="eb" data-rmap style="width:100%"><span>${esc(mapName(state.map))}</span><span class="muted">${host ? 'Change ⟳' : ''}</span></button>
        </div>
        ${host ? `<button class="btn y o" id="play" data-fs ${state.canStart ? '' : 'disabled'}>PLAY</button><div class="muted o" style="font-size:.75em;min-height:1em">${esc(state.canStart ? '' : state.why || (fr ? '' : 'Waiting for your friend...'))}</div>`
          : '<div class="pill o" style="font-size:1.05em;padding:.5em 1em">Waiting for the host to start</div>'}
        <div class="muted" style="font-size:.65em;font-family:system-ui,sans-serif;font-weight:700">Friendly game · no trophies</div>
      </div>`;
    show('lobby');
    paint(El);
    bind(El, '[data-rback]', () => { if (U.onFriendLeave) U.onFriendLeave(); U.showLobby(); });
    bind(El, '[data-fs]', () => { if (U.onFriendStart) U.onFriendStart(); });
    bind(El, '[data-pick]', () => U.open('brawlers'));
    if (host) {
      bind(El, '[data-slot]', (b) => { if (U.onFriendSlot) U.onFriendSlot(+b.dataset.slot); });
      bind(El, '[data-bots]', (b) => { if (U.onFriendBots) U.onFriendBots(b.dataset.bots === '1'); });
      bind(El, '[data-rmode]', () => { if (U.onFriendMode) U.onFriendMode(); });
      bind(El, '[data-rmap]', () => { if (U.onFriendMap) U.onFriendMap(); });
    }
    heroLast = 0;
    if (!heroRaf && typeof requestAnimationFrame !== 'undefined') heroRaf = requestAnimationFrame(heroLoop);
  };
  U.friendStatus = (text) => { const s = $('fstatus'); if (s) s.textContent = text; else U.toast(text); };

  U.init = () => {
    if (S() && S().settings && U.onSettings) U.onSettings(S().settings);
  };
  return U;
})();
