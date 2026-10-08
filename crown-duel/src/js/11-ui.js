// ---------- Menus: home, cards & decks, chests, shop, online lobby, settings and results ----------
const imgCache = new Map();
function cardImg(key, w) {
  const ck = key + '@' + w;
  let u = imgCache.get(ck);
  if (!u) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    u = cardArt(key, Math.round(w * dpr), Math.round(w * 1.24 * dpr)).toDataURL();
    imgCache.set(ck, u);
  }
  return u;
}

function chestImg(type, open) {
  const ck = 'chest:' + type + (open ? ':o' : '');
  let u = imgCache.get(ck);
  if (u) return u;
  const def = CHESTS[type];
  const cv = makeCanvas(160, 150);
  const x = cv.getContext('2d');
  x.translate(80, 84);
  x.scale(50, 50);
  x.fillStyle = 'rgba(0,0,0,0.3)';
  ellipse(x, 0, 0.95, 1.2, 0.25);
  x.fill();
  // body
  rrect(x, -1.2, -0.4, 2.4, 1.3, 0.18, def.col, 0.08);
  x.fillStyle = shade(def.col, -0.25);
  x.fillRect(-1.16, 0.45, 2.32, 0.4);
  rrect(x, -1.25, -0.45, 0.35, 1.38, 0.08, def.dark, 0.06);
  rrect(x, 0.9, -0.45, 0.35, 1.38, 0.08, def.dark, 0.06);
  if (open) {
    x.fillStyle = 'rgba(255,240,180,0.85)';
    x.beginPath();
    x.moveTo(-1, -0.4);
    x.lineTo(-1.5, -1.5);
    x.lineTo(1.5, -1.5);
    x.lineTo(1, -0.4);
    x.fill();
    rrect(x, -1.2, -1.45, 2.4, 0.5, 0.2, def.col, 0.08);
  } else {
    x.beginPath();
    x.moveTo(-1.2, -0.35);
    x.lineTo(-1.2, -0.7);
    x.quadraticCurveTo(0, -1.45, 1.2, -0.7);
    x.lineTo(1.2, -0.35);
    x.closePath();
    fillStroke(x, shade(def.col, 0.15), 0.08);
    rrect(x, -1.25, -0.8, 0.35, 0.5, 0.08, def.dark, 0.06);
    rrect(x, 0.9, -0.8, 0.35, 0.5, 0.08, def.dark, 0.06);
    rrect(x, -0.22, -0.55, 0.44, 0.5, 0.1, GOLDC, 0.06);
    x.fillStyle = OUT;
    circle(x, 0, -0.33, 0.07);
    x.fill();
  }
  if (type === 'crown') poly(x, [-0.5, 0.55, -0.5, 0.1, -0.25, 0.3, 0, -0.05, 0.25, 0.3, 0.5, 0.1, 0.5, 0.55], GOLDC, 0.05);
  if (type === 'legendary' || type === 'epic' || type === 'magic') {
    x.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [sx, sy] of [[-0.7, -1.1], [0.8, -1.2], [1.3, 0.2]]) { circle(x, sx, sy, 0.07); x.fill(); }
  }
  u = cv.toDataURL();
  imgCache.set(ck, u);
  return u;
}

// Crown Road rewards that are not cards or chests: a pile of coins, a gem and a Deck Pack.
function rewardImg(kind) {
  const ck = 'rw:' + kind;
  let u = imgCache.get(ck);
  if (u) return u;
  const cv = makeCanvas(120, 120);
  const x = cv.getContext('2d');
  x.translate(60, 64);
  x.scale(38, 38);
  x.fillStyle = 'rgba(0,0,0,0.3)';
  ellipse(x, 0, 1.0, 1.15, 0.26);
  x.fill();
  if (kind === 'gold') {
    for (const [sx, sy, n] of [[-0.6, 0.85, 3], [0.62, 0.85, 2], [0, 0.95, 5]]) {
      for (let i = 0; i < n; i++) ell(x, sx, sy - i * 0.24, 0.5, 0.2, i === n - 1 ? '#ffe070' : '#e8a800', 0.06);
    }
  } else if (kind === 'gems') {
    poly(x, [-0.9, -0.2, -0.5, -0.8, 0.5, -0.8, 0.9, -0.2, 0, 0.95], '#1fc75a', 0.08);
    poly(x, [-0.5, -0.8, 0.5, -0.8, 0.32, -0.2, -0.32, -0.2], '#9fffb0', 0.05);
    poly(x, [-0.32, -0.2, 0.32, -0.2, 0, 0.95], '#5ae88a', 0.04);
    x.fillStyle = 'rgba(255,255,255,0.85)';
    circle(x, -0.3, -0.55, 0.08);
    x.fill();
  } else {
    // two cards and a gold band: a pack of copies for the whole deck
    x.save();
    x.rotate(-0.25);
    rrect(x, -0.8, -1.05, 1.3, 1.75, 0.16, '#2f5fa8', 0.07);
    x.restore();
    x.save();
    x.rotate(0.12);
    rrect(x, -0.5, -1.0, 1.3, 1.75, 0.16, '#5aa9ff', 0.07);
    rrect(x, -0.5, 0.05, 1.3, 0.34, 0.03, GOLDC, 0.05);
    poly(x, [-0.2, -0.2, -0.2, -0.62, 0.0, -0.42, 0.15, -0.72, 0.3, -0.42, 0.5, -0.62, 0.5, -0.2], GOLDC, 0.05);
    x.restore();
  }
  u = cv.toDataURL();
  imgCache.set(ck, u);
  return u;
}

// A card not found yet: the frame with its subject as a dark silhouette (gate cards on the Crown Road).
function silhouetteImg(key, w) {
  const ck = 'sil:' + key + '@' + w;
  let u = imgCache.get(ck);
  if (u) return u;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.round(w * dpr), ch = Math.round(w * 1.24 * dpr);
  const S = cw / 100, H = ch / S;
  // the subject alone, drawn like cardArt does, then filled with one dark colour
  const sub = makeCanvas(cw, ch);
  const s = sub.getContext('2d');
  s.scale(S, S);
  const c = CARDS[key];
  const o = { c: TEAM_COLORS[0], dir: 1, back: false, walk: 0.1, moving: false, t: 0.3, atk: -1, id: 1, aimX: 1, aimY: 0.2, attacking: true, charging: false };
  if (c.type === 'spell') drawSpellIcon(s, c.spell, 50, H * 0.52);
  else {
    const un = c.unit, uh = UNIT_H[un] || 1.2, n = Math.min(c.count || 1, 3);
    const sc = Math.min(58, (H * 0.62) / (uh + (UNITS[un].air ? 0.3 : 0))) * (n > 1 ? 0.8 : 1);
    for (let i = n - 1; i >= 0; i--) {
      s.save();
      s.translate(50 + (n === 1 ? 0 : (i - (n - 1) / 2) * 24), H * 0.86 - (n > 1 && i === 1 ? 6 : 0) - (UNITS[un].air ? sc * 0.25 : 0));
      s.scale(sc, sc);
      UNIT_ART[un](s, Object.assign({}, o, { id: i + 1 }));
      s.restore();
    }
  }
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = '#070b16';
  s.fillRect(0, 0, cw, ch);
  const cv = makeCanvas(cw, ch);
  const x = cv.getContext('2d');
  x.save();
  x.scale(S, S);
  roundRect(x, 2, 2, 96, H - 4, 12);
  x.fillStyle = '#3a4560';
  x.fill();
  roundRect(x, 8, 8, 84, H - 16, 8);
  const bg = x.createLinearGradient(0, 8, 0, H - 8);
  bg.addColorStop(0, '#5d6f94');
  bg.addColorStop(1, '#2a3552');
  x.fillStyle = bg;
  x.fill();
  x.restore();
  x.drawImage(sub, 0, 0);
  x.save();
  x.scale(S, S);
  outlineText(x, '?', 50, H * 0.3, 34, '#ffe070');
  x.restore();
  u = cv.toDataURL();
  imgCache.set(ck, u);
  return u;
}

// Compact countdown for the chest slots: 83 s -> "1:23", 3723 s -> "1:02:03"
function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n) => (n < 10 ? '0' : '') + n;
  return h ? h + ':' + p(m) + ':' + p(ss) : m + ':' + p(ss);
}

// 1412 -> "1,412"
function fmtInt(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

// Cards an arena gate hands over (the arena's cards no earlier road node gives), rarest first.
function gateKeys(t, a) {
  return CARD_KEYS.filter((k) => CARDS[k].arena === a && roadNodeFor(k) === t)
    .sort((p, q) => RARITY_ORDER.indexOf(CARDS[q].rarity) - RARITY_ORDER.indexOf(CARDS[p].rarity));
}

// One entry per thing a road node gives: { kind, img, name, card (key, for cards), gate (unclaimed gate cards are silhouettes) }.
function roadItems(node) {
  const out = [];
  for (const [kind, arg] of node.rewards) {
    if (kind === 'card') for (const k of arg) out.push({ kind, img: cardImg(k, 60), name: CARDS[k].name, card: k });
    else if (kind === 'gate') {
      for (const k of gateKeys(node.t, arg)) {
        if (node.t > SAVE.best && SAVE.cards[k]) continue; // already yours: the gate won't grant it again
        out.push({ kind, img: cardImg(k, 60), name: CARDS[k].name, card: k, gate: true });
      }
    }
    else if (kind === 'chest') out.push({ kind, img: chestImg(arg), name: CHESTS[arg].name });
    else if (kind === 'gold') out.push({ kind, img: rewardImg('gold'), name: fmtInt(arg) + ' gold' });
    else if (kind === 'gems') out.push({ kind, img: rewardImg('gems'), name: arg + ' gems' });
    else if (kind === 'pack') out.push({ kind, img: rewardImg('pack'), name: arg > 1 ? arg + ' Deck Packs' : 'Deck Pack' });
  }
  return out;
}

const roadNodeName = (node) => roadItems(node).map((it) => it.name).join(' + ');
const roadGate = (node) => { const g = node.rewards.find((r) => r[0] === 'gate'); return g ? g[1] : -1; };

// A small card tile for reward lists: art, copies, NEW, an upgrade arrow and an optional level tag.
function lootCell(g, w, showLvl) {
  const rec = SAVE.cards[g.key];
  const cell = `<div class="cc"><img src="${cardImg(g.key, w)}" alt=""><div class="lv">x${g.n}</div>${g.isNew ? '<span class="nw">NEW</span>' : ''}${rec && canUpgrade(g.key) ? '<span class="up">↑</span>' : ''}</div>`;
  return showLvl && rec ? `<div>${cell}<span class="tag">Lv ${rec.lvl}</span></div>` : cell;
}

function arenaPreview(cv, a) {
  const theme = ARENAS[a];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 300, h = cv.clientHeight || 170;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  const T = w / 12;
  const bg = paintArena(theme, T * dpr, false);
  x.drawImage(bg.canvas, -(bg.pad + 3) * T, -(bg.pad + 1.2) * T, (AW + bg.pad * 2) * T, (AH + bg.pad * 2) * T);
  const tw = [{ tt: 'princess', lane: 0, x: 3.5, y: 6.5 }, { tt: 'king', lane: -1, x: 9, y: 3 }, { tt: 'princess', lane: 1, x: 14.5, y: 6.5 }];
  for (const t of tw) {
    x.save();
    x.translate((t.x - 3) * T, (t.y - 1.2 + 2.2) * T);
    x.scale(T * 0.85, T * 0.85);
    drawTower(x, t, { c: TEAM_COLORS[a % 2 === 0 ? 1 : 0], aimX: 0.3, aimY: 1, t: 1, atk: -1, active: true });
    x.restore();
  }
}

const UI = {
  pageName: 'battle',
  swapKey: null,
  lastTick: 0,

  init() {
    for (const b of document.querySelectorAll('#nav button')) b.addEventListener('click', () => { Sound.play('click'); this.page(b.dataset.p); });
    $('modal').addEventListener('pointerdown', (e) => {
      if (e.target !== $('modal') || !this.modalDismiss) return;
      const d = this.closeModal();
      if (typeof d === 'function') d();
    });
  },

  showScreen(name) {
    $('home').classList.toggle('show', name === 'home');
    if (name === 'home') { this.refreshTop(); this.page(this.pageName); }
  },

  page(name) {
    if (name !== 'cards') this.swapKey = null;
    this.pageName = name;
    for (const s of document.querySelectorAll('.page')) s.classList.toggle('show', s.id === 'p-' + name);
    for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('on', b.dataset.p === name);
    this.render(name);
    this.refreshNav();
  },

  render(name) {
    const fn = { battle: this.renderBattle, cards: this.renderCards, shop: this.renderShop, online: this.renderOnline, more: this.renderMore }[name || this.pageName];
    if (fn) fn.call(this);
  },

  refreshTop() {
    const need = SAVE.king < MAX_LEVEL ? KING_XP[SAVE.king - 1] : 1;
    const pct = SAVE.king < MAX_LEVEL ? clamp(SAVE.kingXp / need, 0, 1) * 100 : 100;
    $('h-prof').innerHTML = `<div class="klv">${SAVE.king}</div><div class="pname"><b>${esc(SAVE.name)}</b><div class="xpb"><i style="width:${pct}%"></i></div></div>`;
    $('h-gold').innerHTML = `<i class="coin"></i>${fmtNum(SAVE.gold)}`;
    $('h-gems').innerHTML = `<i class="gem"></i>${fmtNum(SAVE.gems)}`;
  },

  refreshNav() {
    const up = curDeck().some((k) => canUpgrade(k)) || Object.keys(SAVE.fresh).length > 0;
    const cardsBtn = document.querySelector('#nav button[data-p="cards"]');
    cardsBtn.classList.toggle('dot', up && this.pageName !== 'cards');
    const shopBtn = document.querySelector('#nav button[data-p="shop"]');
    const shop = refreshShop();
    // today's free Deck Pack is waiting, or there are deals not seen today
    const freePack = shop.offers.some((o) => o.kind === 'pack' && !o.bought);
    shopBtn.classList.toggle('dot', this.pageName !== 'shop' && (freePack || (shop.offers.some((o) => !o.bought) && SAVE.shopSeen !== todayKey())));
  },

  // Called about once per second while the home screen is visible.
  tick() {
    if (!$('home').classList.contains('show')) return;
    if (this.pageName === 'battle') this.renderChests();
    if (this.slotTick) this.slotTick();
  },

  // ---- battle page ----
  renderBattle() {
    const a = curArena();
    const ar = ARENAS[a];
    const next = ARENAS[a + 1];
    const prog = next ? clamp((SAVE.trophies - ar.min) / (next.min - ar.min), 0, 1) * 100 : 100;
    const toNext = next ? Math.ceil((next.min - SAVE.trophies) / 30) : 0;
    $('p-battle').innerHTML = `<div class="inner">
      <div class="arena"><canvas id="arena-cv"></canvas>
        <div class="lbl"><div><div class="ai">Arena ${a + 1}</div><div class="an">${esc(ar.name)}</div></div>
        <div class="tr"><div class="tp"><i class="tro"></i>${SAVE.trophies}</div>${next ? `<div class="prog"><i style="width:${prog}%"></i></div><div class="ai">Next: ${next.min}</div><div class="ai nx">${esc(next.name)} in ${plural(toNext, 'win')}</div>` : '<div class="ai">Top arena!</div>'}</div></div>
      </div>
      <h3 id="road-h">Crown Road <small>View all ›</small></h3>
      <div id="road">${this.roadStrip()}</div>
      <button class="btn gold big" id="b-battle">⚔️ BATTLE<small id="b-sub"></small></button>
      <div class="row"><button class="btn blue small" id="b-train">🎯 Training</button><button class="btn purple small" id="b-online">🌐 Play Online</button></div>
      <div class="chests" id="chests"></div>
      <div class="minis" id="minis"></div>
    </div>`;
    requestAnimationFrame(() => { const cv = $('arena-cv'); if (cv) arenaPreview(cv, a); });
    $('b-battle').onclick = () => Game.startAIBattle(false);
    $('b-train').onclick = () => Game.startAIBattle(true);
    $('b-online').onclick = () => this.page('online');
    $('road').onclick = $('road-h').onclick = () => { Sound.play('click'); this.roadModal(); };
    this.renderChests();
  },

  // What the next AI battle brings, shown under the BATTLE label.
  battleSub() {
    const parts = [];
    if (comebackDue()) parts.push('💪 Comeback match');
    if (chestSlotFree() < 0) parts.push('Slots full: wins give Instant Loot');
    return parts.join('\n');
  },

  // The last claimed Crown Road node and the next three.
  roadStrip() {
    const r = SAVE.road;
    let start = Math.max(0, r - 1);
    if (start + 4 > ROAD.length) start = Math.max(0, ROAD.length - 4);
    return ROAD.slice(start, start + 4).map((node, j) => {
      const i = start + j, done = i < r;
      const items = roadItems(node);
      const first = items[0];
      const two = items.length > 1 && items[1].card && first.card && !first.gate;
      const icon = (it) => `<img class="${it.card ? 'cd' : ''}" src="${it.gate && !done ? silhouetteImg(it.card, 48) : it.img}" alt="">`;
      const more = items.length - (two ? 2 : 1);
      return `<div class="node ${done ? 'done' : ''} ${i === r ? 'next' : ''} ${roadGate(node) >= 0 ? 'gate' : ''}">
        <div class="ic ${two ? 'two' : ''}">${icon(first)}${two ? icon(items[1]) : ''}${done ? '<span class="ck">✓</span>' : more > 0 ? `<span class="more">+${more}</span>` : ''}</div>
        <b><i class="tro"></i>${node.t}</b><small>${done ? 'Claimed' : plural(winsTo(node.t), 'win')}</small></div>`;
    }).join('');
  },

  // Every node of the current and next arena (and the gate after them).
  roadModal() {
    const a = curArena();
    const lo = ARENAS[a].min;
    const hi = ARENAS[a + 2] ? ARENAS[a + 2].min : Math.max(SAVE.best, TOP_MIN) + 1000;
    const rows = ROAD.map((node, i) => ({ node, i })).filter((x) => x.node.t >= lo && x.node.t <= hi).map(({ node, i }) => {
      const done = i < SAVE.road;
      const gate = roadGate(node);
      const items = roadItems(node).map((it) => `<div class="ri"><img class="${it.card ? 'cd' : ''}" src="${it.gate && !done ? silhouetteImg(it.card, 44) : it.img}" alt=""><span>${it.gate && !done ? '???' : esc(it.name)}</span></div>`).join('');
      return `<div class="rrow ${done ? 'done' : ''} ${i === SAVE.road ? 'next' : ''} ${gate >= 0 ? 'gate' : ''}">
        <div class="rt"><b><i class="tro"></i>${node.t}</b><small>${done ? '✓ Claimed' : plural(winsTo(node.t), 'win')}</small></div>
        <div class="rr">${gate >= 0 ? `<div class="gt">Arena ${gate + 1}: ${esc(ARENAS[gate].name)}${done ? '' : ' · Unlocks at ' + node.t}</div>` : ''}${items}</div></div>`;
    }).join('');
    this.modal(`<h2>Crown Road</h2>
      <p class="center muted small">A reward every 1 to 3 wins, paid once when your best trophies reach it. Each arena's cards arrive at its gate, ready to play.</p>
      <div id="road-all">${rows}</div>
      <div class="btns"><button class="btn gold" id="ra-ok">Close</button></div>`, true);
    $('ra-ok').onclick = () => this.closeModal();
    const nx = document.querySelector('#road-all .next');
    const panel = $('modal-panel');
    if (nx) panel.scrollTop += nx.getBoundingClientRect().top - panel.getBoundingClientRect().top - panel.clientHeight / 3;
  },

  // Chest slots and the two mini chests. Runs every second, so the elements are kept and only their
  // contents change (taps and test handles stay attached).
  renderChests() {
    const box = $('chests');
    if (!box) return;
    if (box.children.length !== SAVE.chests.length) {
      box.innerHTML = SAVE.chests.map((_, i) => `<div class="slot" data-i="${i}"></div>`).join('');
      for (const el of box.children) el.onclick = () => { if (SAVE.chests[+el.dataset.i]) this.chestSlot(+el.dataset.i); };
    }
    const now = Date.now();
    SAVE.chests.forEach((ch, i) => {
      const el = box.children[i];
      const st = chestState(ch);
      let cls = 'slot', html = '<div class="st muted">Chest slot</div>';
      if (st !== 'empty') {
        let label;
        if (st === 'ready') label = '<div class="st g">OPEN!</div>';
        else if (st === 'unlocking') label = `<div class="st y">${fmtClock(ch.unlockAt - now)}</div><div class="st">⚡${gemsToOpen(ch)}</div>`;
        else label = `<div class="st q">Queued</div>${ch.unlockAt ? `<div class="st sm">opens in ${fmtClock(ch.unlockAt - now)}</div>` : ''}`;
        cls = 'slot full' + (st === 'ready' ? ' ready' : '');
        html = `<span class="ar">A${chestOpenArena(ch) + 1}</span><img src="${chestImg(ch.type)}" alt="">${label}`;
      }
      if (el.className !== cls) el.className = cls;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
    });
    const sub = $('b-sub');
    if (sub) { const t = this.battleSub(); if (sub.textContent !== t) sub.textContent = t; }
    const minis = $('minis');
    if (!minis) return;
    if (!$('m-free')) {
      minis.innerHTML = '<div class="mini" id="m-free"></div><div class="mini" id="m-crown"></div>';
      $('m-free').onclick = () => {
        if (!takeFreeChest()) { this.toast('The next free chest arrives in ' + fmtDuration(nextFreeChestIn())); return; }
        this.openChest('free', curArena());
      };
      $('m-crown').onclick = () => {
        if (!takeCrownChest()) { this.toast('Win crowns by destroying enemy towers.'); return; }
        this.openChest('crown', curArena());
      };
    }
    const free = nextFreeChestIn();
    const fs = freeState();
    // crowns bank up to two chests: "+1 banked" means one is ready to open, the bar fills toward the next
    const banked = Math.floor(SAVE.crowns / CROWNS_FOR_CHEST);
    const toward = SAVE.crowns - banked * CROWNS_FOR_CHEST;
    const full = SAVE.crowns >= CROWN_BANK;
    const set = (el, cls, html) => { if (el.className !== cls) el.className = cls; if (el._h !== html) { el.innerHTML = html; el._h = html; } };
    set($('m-free'), 'mini' + (free <= 0 ? ' ready' : ''), `<img src="${chestImg('free')}" alt=""><div><b>Free Chest</b><small>${free <= 0 ? 'Ready! (' + fs.n + '/' + FREE_CHEST_MAX + ')' : 'Next in ' + fmtDuration(free)}</small></div>`);
    set($('m-crown'), 'mini' + (banked ? ' ready' : ''), `<img src="${chestImg('crown')}" alt=""><div style="flex:1;min-width:0"><b>Crown Chest${banked ? ` <span class="bk">+${banked} banked</span>` : ''}</b><small>${full ? 'Bank full: open one!' : toward + ' / ' + CROWNS_FOR_CHEST + ' crowns'}</small><div class="pb"><i style="width:${full ? 100 : (toward / CROWNS_FOR_CHEST) * 100}%"></i></div></div>`);
  },

  // A ready chest opens at once; any other shows its timer and the gem price to open it now.
  chestSlot(i) {
    const ch = SAVE.chests[i];
    if (!ch) return;
    if (chestState(ch) === 'ready') {
      const r = takeSlotChest(i, false);
      if (r) this.openChest(r.type, r.arena, r.seed);
      return;
    }
    const def = CHESTS[ch.type];
    const a = chestOpenArena(ch);
    this.modal(`<h2>${def.name}</h2>
      <div class="chestbox" style="min-height:0"><img class="big" src="${chestImg(ch.type)}" alt=""></div>
      <p class="center muted">Arena ${a + 1} · about ${Math.round(def.cards * (1 + a * 0.35))} cards${def.only ? ' (' + def.only + ')' : ''}</p>
      <p class="center" id="c-time"></p>
      <div class="btns"><button class="btn purple" id="c-gems"></button></div>
      <p class="center muted small">Chests unlock by themselves, two at a time, in the order you won them.</p>
      <div class="btns"><button class="btn small" id="c-close">Close</button></div>`, true);
    // kept live by tick() while the modal is open
    this.slotTick = () => {
      if (SAVE.chests[i] !== ch || !this.modalOpen() || !$('c-time')) { this.slotTick = null; return; }
      const st = chestState(ch);
      const gems = st === 'ready' ? 0 : gemsToOpen(ch);
      $('c-time').innerHTML = st === 'ready' ? '<b style="color:#8dff8d">Ready to open!</b>' : `Opens in <b>${fmtDuration(ch.unlockAt - Date.now())}</b>${st === 'unlocking' ? '' : ' (queued)'}`;
      const b = $('c-gems');
      b.innerHTML = gems ? `Open now ⚡${gems}` : 'Open';
      b.disabled = SAVE.gems < gems;
    };
    this.slotTick();
    $('c-gems').onclick = () => {
      const r = takeSlotChest(i, true);
      if (!r) return;
      this.slotTick = null;
      this.refreshTop();
      this.openChest(r.type, r.arena, r.seed);
    };
    $('c-close').onclick = () => { this.slotTick = null; this.closeModal(); };
  },

  // Chest opening: tap the chest, then tap through the cards (or skip to the summary).
  openChest(type, arena, seed) {
    const before = new Set(curDeck().filter((k) => canUpgrade(k)));
    const loot = rollChest(type, arena, seed);
    const got = grantChest(loot);
    this.refreshTop();
    const ups = curDeck().filter((k) => canUpgrade(k) && !before.has(k)).length;
    const def = CHESTS[type];
    const skip = '<div class="btns"><button class="btn tiny skip" id="c-skip">Skip ›</button></div>';
    let step = -1;
    const show = () => {
      if (step < 0) {
        this.modal(`<h2>${def.name}</h2><div class="chestbox" id="cb"><img class="shake" src="${chestImg(type)}" alt=""><p class="muted">Tap to open!</p></div>${skip}`, false);
      } else if (step < got.length) {
        const g = got[step];
        const c = CARDS[g.key], r = RARITY[c.rarity];
        const rec = SAVE.cards[g.key];
        const need = upgradeCost(g.key);
        const inDeck = curDeck().includes(g.key);
        const tags = (inDeck ? '<span class="pill">In deck</span>' : '') + (canUpgrade(g.key) ? '<span class="pill u">UPGRADE READY</span>' : '');
        this.modal(`<h2 style="color:${r.color}">${esc(c.name)}</h2>
          <div class="chestbox" id="cb"><div class="reveal pop"><img src="${cardImg(g.key, 130)}" style="width:130px" alt="">
          <div class="cnt">x${g.n}</div>${g.isNew ? '<div class="nw">NEW CARD!</div>' : ''}
          <div class="muted small">${r.name} · Level ${rec.lvl}${need ? ' · ' + rec.n + '/' + need.copies + ' to upgrade' : ' · Max level'}</div>
          ${tags ? `<div class="pills">${tags}</div>` : ''}</div>
          <p class="muted small">${got.length - step - 1} more</p></div>${skip}`, false);
        Sound.play(c.rarity === 'legendary' ? 'legendary' : c.rarity === 'epic' ? 'epic' : 'cardflip');
      } else {
        this.modal(`<h2>${def.name}</h2>
          <div class="loot">${got.map((g) => lootCell(g, 80)).join('')}</div>
          <div class="rw">${loot.gold ? `<div class="res"><i class="coin"></i>+${loot.gold}</div>` : ''}${loot.gems ? `<div class="res"><i class="gem"></i>+${loot.gems}</div>` : ''}</div>
          <div class="btns">${ups ? `<button class="btn green" id="c-cards">Cards ↑${ups}</button>` : ''}<button class="btn gold" id="c-ok">Collect</button></div>`, false);
        Sound.play('coin');
        const done = () => { this.closeModal(); this.render(); this.refreshTop(); this.refreshNav(); };
        $('c-ok').onclick = done;
        if ($('c-cards')) $('c-cards').onclick = () => { done(); this.page('cards'); };
        return;
      }
      $('cb').onclick = () => { step++; if (step === 0) Sound.play('chest'); show(); };
      $('c-skip').onclick = () => { if (step < 0) Sound.play('chest'); step = got.length; show(); };
    };
    show();
  },

  // ---- cards page ----
  renderCards() {
    const deck = curDeck();
    const owned = CARD_KEYS.filter((k) => SAVE.cards[k] && !deck.includes(k));
    owned.sort((a, b) => CARDS[a].cost - CARDS[b].cost || RARITY_ORDER.indexOf(CARDS[a].rarity) - RARITY_ORDER.indexOf(CARDS[b].rarity));
    const locked = CARD_KEYS.filter((k) => !SAVE.cards[k]);
    locked.sort((a, b) => (roadNodeFor(a) || 0) - (roadNodeFor(b) || 0));
    const cell = (k, inDeck) => {
      const rec = SAVE.cards[k];
      if (!rec) return `<div class="cc locked" data-k="${k}"><img src="${cardImg(k, 90)}" alt=""><div class="lv">Crown Road<br><i class="tro"></i>${roadNodeFor(k)}</div></div>`;
      const u = upgradeCost(k);
      const pct = u ? clamp(rec.n / u.copies, 0, 1) * 100 : 100;
      const up = canUpgrade(k);
      return `<div class="cc ${this.swapKey && inDeck ? 'swap' : ''} ${this.swapKey === k ? 'sel' : ''}" data-k="${k}"><img src="${cardImg(k, 90)}" alt=""><div class="lv">Lvl ${rec.lvl}</div>
        ${up ? '<span class="up">↑</span>' : ''}${SAVE.fresh[k] ? '<span class="nw">NEW</span>' : ''}</div>
        <div class="bar2" style="margin-top:-2px"><i class="${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></i><span>${u ? rec.n + '/' + u.copies : 'MAX'}</span></div>`;
    };
    const wrap = (k, inDeck) => `<div>${cell(k, inDeck)}</div>`;
    $('p-cards').innerHTML = `<div class="inner">
      <div class="deckbar"><div class="tabs">${[0, 1, 2].map((i) => `<button class="btn tiny ${i === SAVE.deck ? 'gold' : ''}" data-d="${i}">Deck ${i + 1}</button>`).join('')}</div>
      <div class="sp"></div><div class="avg"><i class="drop"></i>Avg ${avgElixir(deck).toFixed(1)}</div></div>
      ${this.swapKey ? `<div class="status"><img src="${cardImg(this.swapKey, 40)}" style="width:34px" alt="">Tap a card in your deck to replace it. <button class="btn tiny" id="sw-x">Cancel</button></div>` : ''}
      <div class="deckgrid"><div class="grid">${deck.map((k) => wrap(k, true)).join('')}</div></div>
      <h3>Collection <small>${Object.keys(SAVE.cards).length}/${CARD_KEYS.length} found</small></h3>
      <div class="grid">${owned.map((k) => wrap(k, false)).join('') || '<p class="muted" style="grid-column:1/-1">All your cards are in the deck.</p>'}</div>
      ${locked.length ? `<h3>Not found yet <small>Unlock on the Crown Road</small></h3><div class="grid">${locked.map((k) => `<div>${cell(k)}</div>`).join('')}</div>` : ''}
    </div>`;
    for (const b of document.querySelectorAll('#p-cards [data-d]')) b.onclick = () => { SAVE.deck = +b.dataset.d; saveGame(); this.swapKey = null; this.renderCards(); };
    if ($('sw-x')) $('sw-x').onclick = () => { this.swapKey = null; this.renderCards(); };
    for (const el of document.querySelectorAll('#p-cards .cc')) {
      el.onclick = () => {
        const k = el.dataset.k;
        if (this.swapKey) {
          const d = curDeck();
          const i = d.indexOf(k);
          if (i >= 0) {
            d[i] = this.swapKey;
            this.swapKey = null;
            saveGame();
            Sound.play('click');
            this.renderCards();
          }
          return;
        }
        if (!SAVE.cards[k]) { this.cardInfo(k); return; }
        this.cardInfo(k);
      };
    }
  },

  cardInfo(k) {
    const c = CARDS[k], r = RARITY[c.rarity];
    const rec = SAVE.cards[k];
    const lvl = rec ? rec.lvl : 1;
    if (rec && SAVE.fresh[k]) { delete SAVE.fresh[k]; saveGame(); }
    const u = rec ? upgradeCost(k) : null;
    const cur = cardStatLines(k, lvl);
    const nxt = u ? cardStatLines(k, lvl + 1) : null;
    const inDeck = curDeck().includes(k);
    const rows = cur.map((row, i) => {
      const n = nxt && nxt[i] && nxt[i][1] !== row[1] && typeof row[1] === 'number' ? ` <span class="inc">+${nxt[i][1] - row[1]}</span>` : '';
      return `<tr><td>${row[0]}</td><td>${row[1]}${n}</td></tr>`;
    }).join('');
    this.modal(`<div class="cardinfo"><img src="${cardImg(k, 110)}" alt=""><div class="d">
        <h2 style="text-align:left;color:${r.color}">${esc(c.name)}</h2>
        <div class="rar" style="color:${r.color}">${r.name} ${c.type}${rec ? ' · Level ' + lvl : ''}</div>
        <p class="muted" style="margin-top:6px;font-size:13px">${esc(c.desc)}</p></div></div>
      <table class="stt">${rows}</table>
      ${!rec && roadNodeFor(k) != null ? `<p class="center muted">Unlocks on the Crown Road at ${fmtInt(roadNodeFor(k))} trophies (about ${plural(Math.max(1, winsTo(roadNodeFor(k))), 'win')})</p>` : ''}
      ${rec && u ? `<p class="center small muted">Cards: ${rec.n} / ${u.copies} · Upgrade cost: ${u.gold} gold · +${u.xp} XP</p>` : ''}
      <div class="btns">
        ${rec && !inDeck ? '<button class="btn blue" id="ci-use">Use</button>' : ''}
        ${rec && u ? `<button class="btn green" id="ci-up" ${canUpgrade(k) ? '' : 'disabled'}>Upgrade <i class="coin"></i> ${u.gold}</button>` : ''}
        <button class="btn" id="ci-x">Close</button>
      </div>`, true);
    if ($('ci-use')) $('ci-use').onclick = () => { this.swapKey = k; this.closeModal(); this.renderCards(); };
    if ($('ci-up')) $('ci-up').onclick = () => {
      const res = upgradeCard(k);
      if (!res) return;
      Sound.play('upgrade');
      this.refreshTop();
      this.closeModal();
      this.render();
      this.refreshNav();
      this.toast(`${c.name} upgraded to level ${res.lvl}! +${res.xp} XP`);
      if (res.kingUps) setTimeout(() => this.kingLevelUp(res.kingUps), 400);
    };
    $('ci-x').onclick = () => this.closeModal();
  },

  // n: levels gained at once (each one paid 10 gems)
  kingLevelUp(n) {
    Sound.play('levelup');
    this.modal(`<h2>King Level ${SAVE.king}!</h2><p class="center">Your towers are stronger now.</p><div class="rw"><div class="res"><i class="gem"></i>+${10 * (n || 1)}</div></div><div class="btns"><button class="btn gold" id="kl-ok">Great!</button></div>`, true);
    $('kl-ok').onclick = () => this.closeModal();
    this.refreshTop();
  },

  // ---- shop ----
  renderShop() {
    SAVE.shopSeen = todayKey();
    const shop = refreshShop();
    const left = cardRequestsLeft();
    const offers = shop.offers.map((o, i) => ({ o, i }));
    const pack = offers.find((x) => x.o.kind === 'pack');
    const deals = offers.filter((x) => x.o.kind !== 'pack');
    $('p-shop').innerHTML = `<div class="inner">
      <h3>Daily deals <small>New offers every day</small></h3>
      ${pack ? `<div class="offer wide ${pack.o.bought ? 'done' : ''}"><img src="${rewardImg('pack')}" alt=""><div class="d"><b>Free Deck Pack</b><small>Copies for all 8 cards in your deck</small></div>
        <button class="btn small ${pack.o.bought ? '' : 'green'}" data-o="${pack.i}" ${pack.o.bought ? 'disabled' : ''}>${pack.o.bought ? 'Claimed' : 'Free'}</button></div>` : ''}
      <div class="shopgrid">${deals.map(({ o, i }) => `<div class="offer ${o.bought ? 'done' : ''}"><img src="${cardImg(o.key, 90)}" alt=""><b>${esc(CARDS[o.key].name)} x${o.n}</b>
        <button class="btn small ${o.bought ? '' : 'gold'}" data-o="${i}" ${o.bought || SAVE.gold < o.price ? 'disabled' : ''}>${o.bought ? 'Sold' : `<i class="coin"></i> ${o.price}`}</button></div>`).join('')}</div>
      <h3>Card Request <small>${CARD_REQUESTS_PER_DAY - left}/${CARD_REQUESTS_PER_DAY} today</small></h3>
      <div class="grid req">${curDeck().map((k) => {
        const q = cardRequestOffer(k);
        return `<div><div class="cc" data-q="${k}"><img src="${cardImg(k, 90)}" alt=""><div class="lv">${q ? 'x' + q.n : 'MAX'}</div></div>
          <button class="btn tiny purple" data-r="${k}" ${!q || !left || SAVE.gems < q.gems ? 'disabled' : ''}>${q ? `<i class="gem"></i> ${q.gems}` : 'Max'}</button></div>`;
      }).join('')}</div>
      <p class="center muted small">${left ? 'Pick any card in your deck. ' + plural(left, 'request') + ' left today.' : 'No requests left today. More tomorrow!'}</p>
      <h3>Chests</h3>
      <div class="shopgrid">${SHOP_CHESTS.map((c, i) => `<div class="offer"><img src="${chestImg(c.type)}" alt=""><b>${CHESTS[c.type].name}</b><small>Arena ${curArena() + 1} rewards</small>
        <button class="btn small purple" data-c="${i}" ${SAVE.gems < c.gems ? 'disabled' : ''}><i class="gem"></i> ${c.gems}</button></div>`).join('')}</div>
      <h3>Gold</h3>
      <div class="shopgrid">${GOLD_PACKS.map((g, i) => `<div class="offer"><img src="${rewardImg('gold')}" alt=""><b>${fmtInt(g.gold)} gold</b>
        <button class="btn small purple" data-g="${i}" ${SAVE.gems < g.gems ? 'disabled' : ''}><i class="gem"></i> ${g.gems}</button></div>`).join('')}</div>
      <p class="center muted small">Everything is earned in the game. No real money, no ads.</p>
    </div>`;
    const after = () => { Sound.play('coin'); this.refreshTop(); this.renderShop(); this.refreshNav(); };
    const once = () => { const now = Date.now(); if (now - (this.lastBuy || 0) < 450) return false; this.lastBuy = now; return true; };
    for (const b of document.querySelectorAll('#p-shop [data-o]')) b.onclick = () => {
      if (!once()) return;
      const res = buyOffer(+b.dataset.o);
      if (!res) return;
      if (res.kind === 'pack') { this.refreshTop(); this.packReveal('Deck Pack', res.cards); return; }
      this.toast(`${res.isNew ? 'New card: ' : ''}${CARDS[res.key].name} x${res.n}`);
      after();
    };
    for (const b of document.querySelectorAll('#p-shop [data-r]')) b.onclick = () => {
      if (!once()) return;
      const res = buyCardRequest(b.dataset.r);
      if (!res) return;
      this.toast(`Card Request: ${CARDS[res.key].name} x${res.n}`);
      after();
    };
    for (const el of document.querySelectorAll('#p-shop .req .cc')) el.onclick = () => this.cardInfo(el.dataset.q);
    for (const b of document.querySelectorAll('#p-shop [data-c]')) b.onclick = () => {
      if (!once()) return;
      const res = buyShopChest(+b.dataset.c);
      if (!res) return;
      this.refreshTop();
      this.openChest(res.type, res.arena);
    };
    for (const b of document.querySelectorAll('#p-shop [data-g]')) b.onclick = () => { if (once() && buyGoldPack(+b.dataset.g)) after(); };
  },

  // Deck Pack reveal: one summary of the copies every deck card got.
  packReveal(title, got) {
    Sound.play('chest');
    this.modal(`<h2>${esc(title)}</h2><p class="center muted small">Copies for every card in your deck</p>
      <div class="loot">${got.map((g) => lootCell(g, 80)).join('')}</div>
      <div class="btns"><button class="btn gold" id="pk-ok">Collect</button></div>`, false);
    $('pk-ok').onclick = () => { this.closeModal(); this.render(); this.refreshTop(); this.refreshNav(); };
  },

  // ---- online page ----
  renderOnline() {
    const st = SAVE.stats;
    const ok = Net.supported();
    $('p-online').innerHTML = `<div class="inner">
      <div class="card"><h2>Online Duel</h2>
        <p class="center muted" style="font-size:13px;margin-top:4px">Battle a friend's phone in real time. Both players need an internet connection. Online battles use tournament rules: every card and tower is level ${ONLINE_LEVEL}.</p></div>
      <div class="card" style="display:flex;flex-direction:column;gap:8px">
        <h3>Your name</h3>
        <div class="field"><input class="txt" id="on-name" maxlength="16" value="${esc(SAVE.name)}" autocomplete="off"></div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:10px" id="lobby">
        ${ok ? `<button class="btn green" id="on-quick">⚡ Quick Match</button>
        <button class="btn blue" id="on-host">🏠 Create Room</button>
        <div class="field"><input class="txt code" id="on-code" maxlength="4" placeholder="CODE" autocomplete="off" autocapitalize="characters"><button class="btn gold" id="on-join">Join</button></div>
        <div id="on-status"></div>` : '<p class="center">Online play is not supported by this browser.</p>'}
      </div>
      <div class="stats"><div class="stat"><b>${st.onlineWins}</b><span>Online wins</span></div><div class="stat"><b>${st.onlineLosses}</b><span>Online losses</span></div><div class="stat"><b>${curDeck().length}</b><span>Cards in deck</span></div></div>
      <p class="center muted small">Tip: Create a room and send the code (or link) to a friend. Quick Match pairs you with anyone searching right now.</p>
    </div>`;
    const nameIn = $('on-name');
    nameIn.onchange = nameIn.onblur = () => {
      const v = nameIn.value.replace(/[<>]/g, '').trim().slice(0, 16);
      if (v) { SAVE.name = v; saveGame(); this.refreshTop(); }
    };
    if (!ok) return;
    $('on-quick').onclick = () => Lobby.start('quick');
    $('on-host').onclick = () => Lobby.start('host');
    $('on-join').onclick = () => {
      const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 4) { this.toast('Enter the 4-letter room code'); return; }
      Lobby.start('join', code);
    };
    $('on-code').oninput = () => { $('on-code').value = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); };
    if (Lobby.pendingCode) { $('on-code').value = Lobby.pendingCode; }
    if (Lobby.busy) this.lobbyStatus(Lobby.statusText || 'Connecting…', true);
  },

  lobbyStatus(text, spinning, err) {
    Lobby.statusText = text;
    const el = $('on-status');
    if (!el) return;
    el.innerHTML = `<div class="status ${err ? 'err' : ''}">${spinning ? '<i class="spin"></i>' : ''}<span style="flex:1">${esc(text)}</span>${Lobby.busy ? '<button class="btn tiny red" id="on-cancel">Cancel</button>' : ''}</div>`;
    if ($('on-cancel')) $('on-cancel').onclick = () => Lobby.cancel();
  },

  lobbyRoom(code) {
    const el = $('on-status');
    if (!el) return;
    const url = location.origin + location.pathname + '?room=' + code;
    el.innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:8px;align-items:stretch"><div class="center muted small">Room code</div><div class="roomcode">${code}</div>
      <div class="status"><i class="spin"></i><span style="flex:1">Waiting for your friend to join…</span></div>
      <div class="btns"><button class="btn small blue" id="on-share">Share invite</button><button class="btn small red" id="on-cancel">Cancel</button></div></div>`;
    $('on-cancel').onclick = () => Lobby.cancel();
    $('on-share').onclick = () => {
      const text = `Join my Crown Duel battle! Room code: ${code}`;
      if (navigator.share) navigator.share({ title: 'Crown Duel', text, url }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text + ' ' + url).then(() => this.toast('Invite copied!')).catch(() => this.toast(text));
      else this.toast(text);
    };
  },

  // ---- more page ----
  renderMore() {
    const s = SAVE.settings, st = SAVE.stats;
    const tog = (id, on) => `<button class="tog ${on ? 'on' : ''}" id="${id}" aria-label="toggle"></button>`;
    const install = Game.installPrompt ? '<button class="btn small green" id="m-install">Install app</button>' : '';
    $('p-more').innerHTML = `<div class="inner">
      <div class="card"><h3>Settings</h3>
        <div class="setrow">Sound effects ${tog('s-sfx', s.sfx)}</div>
        <div class="setrow">Music ${tog('s-mus', s.music)}</div>
        <div class="setrow">Vibration ${tog('s-vib', s.vibrate)}</div>
        <div class="setrow">Offline play <span class="muted small">${Game.offlineReady ? '✅ Ready' : Game.isEmbedded() ? 'Open the game directly to install' : 'Available after first load'}</span></div>
        ${install ? `<div class="setrow">Home screen app ${install}</div>` : ''}
      </div>
      <div class="card"><h3>Stats</h3><div class="stats">
        <div class="stat"><b>${SAVE.trophies}</b><span>Trophies</span></div><div class="stat"><b>${SAVE.best}</b><span>Best</span></div><div class="stat"><b>${st.wins}</b><span>Wins</span></div>
        <div class="stat"><b>${st.losses}</b><span>Losses</span></div><div class="stat"><b>${st.three}</b><span>3-crown wins</span></div><div class="stat"><b>${st.bestStreak}</b><span>Best streak</span></div>
      </div></div>
      <div class="card help"><h3>How to play</h3>
        <ul>
          <li><b>Drag a card</b> from your hand onto your side of the arena (or tap a card, then tap the arena).</li>
          <li>Cards cost <b>elixir</b>, which refills over time. The last minute gives <b>double elixir</b>.</li>
          <li>Destroy enemy towers to earn <b>crowns</b>. The king tower wins instantly with 3 crowns.</li>
          <li>When an enemy side tower falls you may deploy troops deeper on that side.</li>
          <li>Tied after 3 minutes? <b>Overtime</b>: the next crown wins. Still tied: the weakest tower decides.</li>
          <li>Win battles for <b>trophies</b> and <b>chests</b>. Chests hold cards and gold for upgrades.</li>
          <li>Counter smartly: splash beats swarms, swarms and high damage beat tanks, buildings pull tanks away.</li>
        </ul></div>
      <div class="card"><h3>Danger zone</h3><div class="btns"><button class="btn small red" id="m-reset">Reset progress</button></div></div>
      <p class="center muted small">Crown Duel · made for phones · plays offline</p>
    </div>`;
    $('s-sfx').onclick = () => { s.sfx = !s.sfx; applySettings(); saveGame(); this.renderMore(); };
    $('s-mus').onclick = () => { s.music = !s.music; applySettings(); saveGame(); this.renderMore(); };
    $('s-vib').onclick = () => { s.vibrate = !s.vibrate; saveGame(); this.renderMore(); };
    if ($('m-install')) $('m-install').onclick = () => {
      const p = Game.installPrompt;
      Game.installPrompt = null;
      p.prompt();
      p.userChoice.finally(() => this.renderMore());
    };
    $('m-reset').onclick = () => {
      this.modal(`<h2>Reset progress?</h2><p class="center">All trophies, cards, gold and chests will be lost.</p><div class="btns"><button class="btn red" id="r-yes">Reset</button><button class="btn" id="r-no">Cancel</button></div>`, true);
      $('r-yes').onclick = () => { resetGame(); this.closeModal(); this.refreshTop(); this.page('battle'); };
      $('r-no').onclick = () => this.closeModal();
    };
  },

  // ---- battle overlays ----
  battleMenu(scene, offline) {
    this.modal(`<h2>${offline ? 'Paused' : 'Menu'}</h2>
      <div class="btns col" style="flex-direction:column">
        <button class="btn green" id="bm-res">Resume</button>
        <button class="btn small" id="bm-snd">Sound: ${SAVE.settings.sfx ? 'On' : 'Off'}</button>
        <button class="btn red" id="bm-sur">${offline ? 'Surrender' : 'Leave battle'}</button>
      </div>`, true, () => scene.resume());
    $('bm-res').onclick = () => { this.closeModal(); scene.resume(); };
    $('bm-snd').onclick = () => { SAVE.settings.sfx = !SAVE.settings.sfx; applySettings(); saveGame(); $('bm-snd').textContent = 'Sound: ' + (SAVE.settings.sfx ? 'On' : 'Off'); };
    $('bm-sur').onclick = () => { this.closeModal(); scene.resume(); scene.surrender(); };
  },

  // Result screen, built around progress: trophy bar, rewards, the chest's place in the queue and the Crown Road.
  resultModal(scene, r, rw) {
    const my = scene.myTeam;
    const res = scene.result;
    const online = !!scene.link;
    const ai = r.mode === 'ai';
    const title = r.draw ? 'Draw' : r.win ? 'Victory!' : 'Defeat';
    const reason = { surrender: r.win ? 'Your opponent surrendered.' : 'You surrendered.', disconnect: 'Your opponent disconnected.', tiebreak: 'Decided by the weakest tower.' }[res.reason] || '';
    // trophy bar inside the arena band, animated from the old count to the new one
    let tbar = '';
    if (ai) {
      const t1 = SAVE.trophies, t0 = t1 - rw.trophies;
      const a = arenaIndex(t1), next = ARENAS[a + 1];
      let lo, hi, label;
      if (next) {
        lo = ARENAS[a].min;
        hi = next.min;
        label = `${fmtInt(t1)} / ${fmtInt(hi)} · ${esc(next.name)} in ${plural(winsTo(hi), 'win')}`;
      } else {
        const node = ROAD[SAVE.road];
        hi = node ? node.t : t1;
        lo = node ? hi - 100 : 0;
        label = node ? `${fmtInt(t1)} · next Legend reward at ${fmtInt(hi)}` : `${fmtInt(t1)} · Legend Road complete!`;
      }
      const pct = (t) => (hi > lo ? clamp((t - lo) / (hi - lo), 0, 1) * 100 : 100);
      const from = arenaIndex(t0) < a ? 0 : pct(t0);
      tbar = `<div id="rs-tbar" class="tbar" data-to="${pct(t1)}"><div class="tl"><i class="tro"></i>${label}</div>
        <div class="rbar"><i style="width:${from}%"></i></div>${rw.protected ? '<div class="pr">🛡 Trophies protected</div>' : ''}</div>`;
    }
    // reward chips
    const crownTxt = crownChestReady() ? 'chest ready' : SAVE.crowns + '/' + CROWNS_FOR_CHEST;
    const chips = [
      ai ? `<div class="chip"><i class="tro"></i>${rw.trophies > 0 ? '+' : rw.trophies < 0 ? '−' : '±'}${Math.abs(rw.trophies)}</div>` : '',
      rw.gold ? `<div class="chip"><i class="coin"></i>+${rw.gold}</div>` : '',
      rw.crowns || rw.crownsLost ? `<div class="chip">👑 +${rw.crowns} <span class="muted">(${rw.crownsLost ? 'bank full' : crownTxt})</span></div>` : '',
      rw.xp ? `<div class="chip">⭐ +${rw.xp} XP</div>` : '',
    ].join('');
    // where the chest went (or the Instant Loot paid instead)
    let chest = '';
    const ch = rw.chest;
    if (ch) {
      const slot = SAVE.chests.indexOf(ch) + 1;
      const st = chestState(ch);
      chest = `<div class="cline"><img src="${chestImg(ch.type)}" alt=""><div><b>${CHESTS[ch.type].name}</b>${slot ? ' → slot ' + slot : ''}<small>${st === 'ready' ? 'ready to open' : (st === 'unlocking' ? 'unlocking · opens in ' : 'queued · opens in ') + fmtDuration(ch.unlockAt - Date.now())}</small></div></div>`;
    } else if (rw.bonus) {
      chest = `<div class="cline col"><div><b>Slots full: Instant Loot</b><small>A Silver Chest's worth, paid on the spot</small></div>
        <div class="loot sm">${rw.bonus.got.map((g) => lootCell(g, 50)).join('')}</div>
        ${rw.bonus.loot.gold ? `<div class="chip"><i class="coin"></i>+${rw.bonus.loot.gold}</div>` : ''}</div>`;
    } else if (r.win && online) chest = '<p class="muted small center">Chest slots are full, so no chest this time.</p>';
    else if (ai && !r.win && rw.gold > 0) chest = `<p class="muted small center">${r.draw ? 'A draw' : 'Defeat'} still pays: +${rw.gold} gold${rw.crowns ? ', crowns counted' : ''}.</p>`;
    else if (ai && !r.win && r.reason === 'surrender') chest = '<p class="muted small center">Surrendered: no rewards for this battle.</p>';
    // Crown Road nodes claimed by this battle, then the next one
    let road = '';
    if (ai) {
      const got = rw.road.map((g) => {
        const node = ROAD.find((n) => n.t === g.t);
        const gate = node ? roadGate(node) : -1;
        // the header names the node (a gate by its arena); gold and gems, chest loot included, are chips
        const name = gate >= 0 ? ARENAS[gate].name + ' gate' : node ? roadItems(node).filter((it) => it.kind !== 'gold' && it.kind !== 'gems').map((it) => it.name).join(' + ') : '';
        const extra = [
          gate >= 0 && g.chest ? `<div class="chip"><img src="${chestImg(g.chest)}" alt="">${CHESTS[g.chest].name}</div>` : '',
          g.gold ? `<div class="chip"><i class="coin"></i>+${fmtInt(g.gold)}</div>` : '',
          g.gems ? `<div class="chip"><i class="gem"></i>+${g.gems}</div>` : '',
        ].join('');
        return `<div class="rg"><div class="rh"><i class="tro"></i>${g.t}${name ? ' · ' + esc(name) : ''}</div>
          ${g.cards.length ? `<div class="loot sm">${g.cards.map((c) => lootCell(c, 50, true)).join('')}</div>` : ''}
          ${extra ? `<div class="rw">${extra}</div>` : ''}</div>`;
      }).join('');
      const nx = ROAD[SAVE.road];
      road = `<div id="rs-road">${got ? '<div class="rtitle">Crown Road reward' + (rw.road.length > 1 ? 's' : '') + '!</div>' + got : ''}
        ${nx ? `<div class="nx">Next: <b>${esc(roadNodeName(nx))}</b> at ${fmtInt(nx.t)} (${plural(winsTo(nx.t), 'win')})</div>` : ''}</div>`;
    }
    const ups = curDeck().filter((k) => canUpgrade(k)).length;
    this.modal(`<div class="result">
      <h2 style="font-size:30px;color:${r.draw ? '#fff' : r.win ? '#8fd0ff' : '#ff8a8a'}">${title}</h2>
      <div class="crowns"><div class="c"><i class="crn b"></i>${res.crowns[my]}</div><span class="muted" style="font-size:16px">vs</span><div class="c">${res.crowns[1 - my]}<i class="crn r"></i></div></div>
      <div class="muted small">${esc(scene.names[my])} vs ${esc(scene.names[1 - my])}</div>
      ${reason ? `<div class="muted small">${reason}</div>` : ''}
      ${tbar}
      ${chips ? `<div class="rw">${chips}</div>` : ''}
      ${chest}
      ${rw.crownChest ? '<p class="small center" style="color:#ffe070">👑 Crown Chest is ready!</p>' : ''}
      ${rw.arenaUp != null ? `<p class="center" style="color:#ffe070;font-weight:900">New arena unlocked: ${esc(ARENAS[rw.arenaUp].name)}!</p>` : ''}
      ${road}
      <div class="btns" style="width:100%">
        ${ups && !online ? `<button class="btn green" id="rs-cards">Cards ↑${ups}</button>` : ''}
        ${online ? `<button class="btn green" id="rs-again" ${Lobby.link && !Lobby.link.closed ? '' : 'disabled'}>Rematch</button>` : ''}
        <button class="btn gold" id="rs-ok">${online ? 'Leave' : 'OK'}</button>
      </div>
      ${rw.comeback ? '<div class="small cb">💪 Next match: Comeback match</div>' : ''}
      ${online ? '<div class="muted small" id="rs-note"></div>' : ''}
    </div>`, false);
    const bar = document.querySelector('#rs-tbar .rbar i');
    if (bar) requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = $('rs-tbar').dataset.to + '%'; }));
    $('rs-ok').onclick = () => {
      this.closeModal();
      if (online) Lobby.leave();
      Game.toHome(rw);
    };
    if ($('rs-cards')) $('rs-cards').onclick = () => { this.closeModal(); Game.toHome(rw, 'cards'); };
    if ($('rs-again')) $('rs-again').onclick = () => {
      $('rs-again').disabled = true;
      Lobby.requestRematch();
    };
    this.rematchUpdate();
  },

  rematchUpdate() {
    const n = $('rs-note');
    if (!n) return;
    const l = Lobby.link;
    if (!l || l.closed) { n.textContent = 'Your opponent left.'; const b = $('rs-again'); if (b) b.disabled = true; return; }
    n.textContent = Lobby.rematch.me && Lobby.rematch.them ? 'Starting…' : Lobby.rematch.me ? 'Waiting for your opponent…' : Lobby.rematch.them ? 'Your opponent wants a rematch!' : '';
  },

  // granted: the cards the arena gate just handed over ({ key, n, lvl, isNew }); then: runs after the modal closes.
  arenaUnlocked(a, granted, then) {
    const top = a === ARENAS.length - 1;
    const list = granted && granted.length ? granted : CARD_KEYS.filter((k) => CARDS[k].arena === a && SAVE.cards[k]).map((k) => ({ key: k, n: 0, lvl: SAVE.cards[k].lvl }));
    Sound.play('levelup');
    this.modal(`<h2>New Arena!</h2><p class="center" style="font-size:18px;font-weight:900">${esc(ARENAS[a].name)}</p>
      ${top ? '<p class="center">You reached the top arena! Tunneler joins your deck options, and the Legend Road pays a reward every 100 trophies from here.</p>' : ''}
      ${list.length ? `<p class="center muted small">${granted && granted.length ? 'Added to your collection:' : 'Arena cards:'}</p><div class="loot c3">${list.map((g) => {
        const rec = SAVE.cards[g.key];
        return `<div><div class="cc"><img src="${cardImg(g.key, 80)}" alt=""><div class="lv">Lvl ${rec ? rec.lvl : g.lvl}</div>${g.isNew ? '<span class="nw">NEW</span>' : ''}</div>${canUpgrade(g.key) ? '<span class="tag u">Upgrade ready</span>' : ''}</div>`;
      }).join('')}</div>` : ''}
      <div class="btns"><button class="btn gold" id="au-ok">Awesome</button></div>`, true, then);
    $('au-ok').onclick = () => { this.closeModal(); if (then) then(); };
  },

  // One-time "Crown Road catch-up" for saves from before the progression update (gift from migrateV2).
  migrationGift(gift) {
    if (!gift) return;
    const fresh = [], seen = new Set();
    for (const g of gift.cards.concat(...gift.road.map((e) => e.cards.filter((c) => c.isNew)))) {
      if (!seen.has(g.key)) { seen.add(g.key); fresh.push(g); }
    }
    if (!fresh.length && !gift.raised.length && !gift.road.length) return;
    const row = (icon, text) => `<div class="gift"><span class="e">${icon}</span><span>${text}</span></div>`;
    const rows = [
      fresh.length ? row('🃏', plural(fresh.length, 'new card') + ', ready to play') : '',
      gift.raised.length ? row('⬆️', `${plural(gift.raised.length, 'card')} raised to level ${gift.raised[0].to}`) : '',
      gift.road.length ? row('<i class="tro"></i>', `${plural(gift.road.length, 'Crown Road reward')} up to ${fmtInt(gift.road[gift.road.length - 1].t)} trophies`) : '',
      gift.gold ? row('<i class="coin"></i>', `+${fmtInt(gift.gold)} gold`) : '',
      gift.gems ? row('<i class="gem"></i>', `+${fmtInt(gift.gems)} gems`) : '',
      gift.copies ? row('📦', `+${fmtInt(gift.copies)} card copies`) : '',
    ].join('');
    Sound.play('levelup');
    this.modal(`<h2>Crown Road catch-up</h2>
      <p class="center small">Progress got a big update: wins pay more, chests unlock by themselves and the new Crown Road hands out cards. Here is everything your trophies already earned.</p>
      ${rows}
      ${fresh.length ? `<div class="loot ${fresh.length > 8 ? 'sm' : ''}">${fresh.map((g) => `<div class="cc"><img src="${cardImg(g.key, 80)}" alt=""><div class="lv">Lvl ${SAVE.cards[g.key].lvl}</div><span class="nw">NEW</span>${canUpgrade(g.key) ? '<span class="up">↑</span>' : ''}</div>`).join('')}</div>` : ''}
      <div class="btns"><button class="btn gold" id="mg-ok">Collect</button></div>`, true, () => this.render());
    $('mg-ok').onclick = () => { this.closeModal(); this.render(); this.refreshTop(); this.refreshNav(); };
  },

  // ---- modal & toast ----
  modal(html, dismissable, onDismiss) {
    $('modal-panel').innerHTML = html;
    $('modal').classList.add('show');
    this.modalDismiss = dismissable ? (onDismiss || true) : null;
  },

  closeModal() {
    const d = this.modalDismiss;
    $('modal').classList.remove('show');
    this.modalDismiss = null;
    return d;
  },

  modalOpen() { return $('modal').classList.contains('show'); },

  toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('toast').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
  },
};

// Online lobby flow: find/create a match, exchange decks, then start battles (and rematches).
const Lobby = {
  token: null,
  link: null,
  role: null,
  busy: false,
  peer: null,
  rematch: { me: false, them: false },
  pendingCode: null,
  statusText: '',

  async start(kind, code) {
    if (this.busy) return;
    this.cancel();
    Sound.init();
    const tk = this.token = Net.token();
    this.busy = true;
    UI.lobbyStatus(kind === 'quick' ? 'Searching for an opponent…' : kind === 'host' ? 'Creating a room…' : 'Joining room ' + code + '…', true);
    try {
      let link;
      if (kind === 'quick') link = await Net.quickMatch(tk, (s) => UI.lobbyStatus(s, true));
      else if (kind === 'host') link = await Net.hostRoom(tk, (c) => UI.lobbyRoom(c));
      else link = await Net.joinRoom(code, tk);
      if (tk.cancelled) { link.close(); return; }
      this.connected(link);
    } catch (e) {
      this.busy = false;
      if (e.code === 'cancelled') return;
      UI.lobbyStatus(e.message || 'Connection failed.', false, true);
      Sound.play('error');
    }
  },

  cancel() {
    if (this.token) this.token.cancel();
    this.token = null;
    this.busy = false;
    UI.lobbyStatus('', false);
    const el = $('on-status');
    if (el) el.innerHTML = '';
  },

  connected(link) {
    this.link = link;
    this.role = link.role;
    this.rematch = { me: false, them: false };
    this.peer = null;
    link.onclose = () => this.onClose();
    link.listen((m) => this.onPeerMessage(m));
    UI.lobbyStatus('Connected! Getting ready…', true);
    Sound.play('emote');
    if (link.role === 'guest') link.send({ t: 'hello', v: NET_PROTO, name: SAVE.name, deck: curDeck(), trophies: SAVE.trophies, arena: curArena(), king: SAVE.king });
  },

  onClose() {
    this.busy = false;
    if (Game.scene instanceof BattleScene && !Game.scene.ended) { Game.scene.onDisconnect(); return; }
    UI.rematchUpdate();
    if (!(Game.scene instanceof BattleScene)) UI.lobbyStatus('Connection closed.', false, true);
  },

  validDeck(d) {
    return Array.isArray(d) && d.length === 8 && new Set(d).size === 8 && d.every((k) => typeof k === 'string' && CARDS[k]) ? d : STARTER_DECK.slice();
  },

  onPeerMessage(m) {
    if (m.t === 'hello' && this.role === 'host') {
      if (m.v !== NET_PROTO) { this.link.send({ t: 'bye' }); this.link.close(); return; }
      this.peer = { name: String(m.name || 'Rival').slice(0, 16), deck: this.validDeck(m.deck), trophies: m.trophies | 0, arena: clamp(m.arena | 0, 0, ARENAS.length - 1), king: m.king | 0 };
      this.startMatch();
    } else if (m.t === 'start' && this.role === 'guest') {
      this.beginBattle(m);
    } else if (m.t === 'again') {
      this.rematch.them = true;
      UI.rematchUpdate();
      if (this.rematch.me && this.role === 'host') this.startMatch();
    } else if (m.t === 'bye' || m.t === 'leave') {
      if (this.link) this.link.close();
    }
  },

  startMatch() {
    const p = this.peer;
    const seed = randi(1, 1e9);
    const msg = {
      t: 'start', seed, arena: Math.max(curArena(), p.arena),
      names: [SAVE.name, p.name], decks: [curDeck().slice(), p.deck],
      subs: ['🏆 ' + SAVE.trophies, '🏆 ' + p.trophies],
    };
    this.link.send(msg);
    this.beginBattle(msg);
  },

  beginBattle(m) {
    this.busy = false;
    this.rematch = { me: false, them: false };
    const lv = {};
    for (const k of CARD_KEYS) lv[k] = ONLINE_LEVEL;
    UI.closeModal();
    Game.setScene(new BattleScene({
      mode: this.role, link: this.link, decks: [this.validDeck(m.decks[0]), this.validDeck(m.decks[1])], levels: [lv, lv], kings: [ONLINE_LEVEL, ONLINE_LEVEL],
      names: [String(m.names[0]).slice(0, 16), String(m.names[1]).slice(0, 16)], subs: m.subs || ['', ''], arena: clamp(m.arena | 0, 0, ARENAS.length - 1), seed: m.seed | 0,
    }));
  },

  requestRematch() {
    if (!this.link || this.link.closed) return;
    this.rematch.me = true;
    this.link.send({ t: 'again' });
    UI.rematchUpdate();
    if (this.role === 'host' && this.rematch.them) this.startMatch();
  },

  leave() {
    if (this.link) {
      this.link.send({ t: 'leave' });
      const l = this.link;
      setTimeout(() => l.close(), 200);
    }
    this.link = null;
    this.busy = false;
  },
};
