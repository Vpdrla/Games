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
    $('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal') && this.modalDismiss) this.closeModal(); });
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
    shopBtn.classList.toggle('dot', this.pageName !== 'shop' && shop.offers.some((o) => !o.bought) && !SAVE.shopSeen);
  },

  // Called about once per second while the home screen is visible.
  tick() {
    if (!$('home').classList.contains('show')) return;
    if (this.pageName === 'battle') this.renderChests();
  },

  // ---- battle page ----
  renderBattle() {
    const a = curArena();
    const ar = ARENAS[a];
    const next = ARENAS[a + 1];
    const prog = next ? clamp((SAVE.trophies - ar.min) / (next.min - ar.min), 0, 1) * 100 : 100;
    $('p-battle').innerHTML = `<div class="inner">
      <div class="arena"><canvas id="arena-cv"></canvas>
        <div class="lbl"><div><div class="ai">Arena ${a + 1}</div><div class="an">${esc(ar.name)}</div></div>
        <div><div class="tp"><i class="tro"></i>${SAVE.trophies}</div>${next ? `<div class="prog"><i style="width:${prog}%"></i></div><div class="ai">Next: ${next.min}</div>` : '<div class="ai">Top arena!</div>'}</div></div>
      </div>
      <button class="btn gold big" id="b-battle">⚔️ BATTLE</button>
      <div class="row"><button class="btn blue small" id="b-train">🎯 Training</button><button class="btn purple small" id="b-online">🌐 Play Online</button></div>
      <div class="chests" id="chests"></div>
      <div class="minis" id="minis"></div>
    </div>`;
    requestAnimationFrame(() => { const cv = $('arena-cv'); if (cv) arenaPreview(cv, a); });
    $('b-battle').onclick = () => Game.startAIBattle(false);
    $('b-train').onclick = () => Game.startAIBattle(true);
    $('b-online').onclick = () => this.page('online');
    this.renderChests();
  },

  renderChests() {
    const box = $('chests');
    if (!box) return;
    const unlocking = anyUnlocking();
    box.innerHTML = SAVE.chests.map((ch, i) => {
      const st = chestState(ch);
      if (st === 'empty') return `<div class="slot"><div class="st muted">Chest slot</div></div>`;
      const def = CHESTS[ch.type];
      let label;
      if (st === 'ready') label = '<div class="st g">OPEN!</div>';
      else if (st === 'unlocking') label = `<div class="st y">${fmtDuration(ch.unlockAt - Date.now())}</div><div class="st">⚡${gemsToOpen(ch)}</div>`;
      else label = unlocking ? `<div class="st">${fmtDuration(def.time * 1000)}</div>` : `<div class="st y">Tap to unlock</div><div class="st">${fmtDuration(def.time * 1000)}</div>`;
      return `<div class="slot full ${st === 'ready' ? 'ready' : ''}" data-i="${i}"><span class="ar">A${ch.arena + 1}</span><img src="${chestImg(ch.type)}" alt="">${label}</div>`;
    }).join('');
    for (const el of box.querySelectorAll('.slot.full')) el.onclick = () => this.chestSlot(+el.dataset.i);
    const free = nextFreeChestIn();
    const fs = freeState();
    const minis = $('minis');
    if (!minis) return;
    minis.innerHTML = `<div class="mini ${free <= 0 ? 'ready' : ''}" id="m-free"><img src="${chestImg('free')}" alt=""><div><b>Free Chest</b><small>${free <= 0 ? 'Ready! (' + fs.n + ')' : 'Next in ' + fmtDuration(free)}</small></div></div>
      <div class="mini ${SAVE.crowns >= CROWNS_FOR_CHEST ? 'ready' : ''}" id="m-crown"><img src="${chestImg('crown')}" alt=""><div style="flex:1;min-width:0"><b>Crown Chest</b><small>${SAVE.crowns >= CROWNS_FOR_CHEST ? 'Ready!' : SAVE.crowns + ' / ' + CROWNS_FOR_CHEST + ' crowns'}</small><div class="pb"><i style="width:${(SAVE.crowns / CROWNS_FOR_CHEST) * 100}%"></i></div></div></div>`;
    $('m-free').onclick = () => {
      if (!takeFreeChest()) { this.toast('The next free chest arrives in ' + fmtDuration(nextFreeChestIn())); return; }
      this.openChest('free', curArena());
    };
    $('m-crown').onclick = () => {
      if (SAVE.crowns < CROWNS_FOR_CHEST) { this.toast('Win crowns by destroying enemy towers.'); return; }
      SAVE.crowns = 0;
      saveGame();
      this.openChest('crown', curArena());
    };
  },

  chestSlot(i) {
    const ch = SAVE.chests[i];
    const st = chestState(ch);
    const def = CHESTS[ch.type];
    if (st === 'ready') {
      SAVE.chests[i] = null;
      saveGame();
      this.openChest(ch.type, ch.arena, ch.seed);
      return;
    }
    const gems = gemsToOpen(ch);
    const canStart = st === 'locked' && !anyUnlocking();
    this.modal(`<h2>${def.name}</h2>
      <div class="chestbox"><img class="big" src="${chestImg(ch.type)}" alt=""></div>
      <p class="center muted">Arena ${ch.arena + 1} · about ${Math.round(def.cards * (1 + ch.arena * 0.35))} cards${def.only ? ' (' + def.only + ')' : ''}</p>
      <p class="center">${st === 'unlocking' ? 'Unlocking: ' + fmtDuration(ch.unlockAt - Date.now()) + ' left' : 'Unlock time: ' + fmtDuration(def.time * 1000)}</p>
      <div class="btns">
        ${canStart ? '<button class="btn green" id="c-start">Start unlock</button>' : ''}
        <button class="btn purple" id="c-gems" ${SAVE.gems < gems ? 'disabled' : ''}>Open now ⚡${gems}</button>
      </div>
      ${st === 'locked' && !canStart ? '<p class="center muted small">Another chest is already unlocking.</p>' : ''}
      <div class="btns"><button class="btn small" id="c-close">Close</button></div>`, true);
    if ($('c-start')) $('c-start').onclick = () => {
      ch.unlockAt = Date.now() + def.time * 1000;
      saveGame();
      this.closeModal();
      this.renderChests();
      Sound.play('click');
    };
    $('c-gems').onclick = () => {
      if (SAVE.gems < gems) return;
      SAVE.gems -= gems;
      SAVE.chests[i] = null;
      saveGame();
      this.refreshTop();
      this.openChest(ch.type, ch.arena, ch.seed);
    };
    $('c-close').onclick = () => this.closeModal();
  },

  // Chest opening: tap the chest, then tap through the cards.
  openChest(type, arena, seed) {
    const loot = rollChest(type, arena, seed);
    const got = grantChest(loot);
    this.refreshTop();
    const def = CHESTS[type];
    let step = -1;
    const show = () => {
      if (step < 0) {
        this.modal(`<h2>${def.name}</h2><div class="chestbox" id="cb"><img class="shake" src="${chestImg(type)}" alt=""><p class="muted">Tap to open!</p></div>`, false);
      } else if (step < got.length) {
        const g = got[step];
        const c = CARDS[g.key], r = RARITY[c.rarity];
        const rec = SAVE.cards[g.key];
        const need = upgradeCost(g.key);
        this.modal(`<h2 style="color:${r.color}">${esc(c.name)}</h2>
          <div class="chestbox" id="cb"><div class="reveal pop"><img src="${cardImg(g.key, 130)}" style="width:130px" alt="">
          <div class="cnt">x${g.n}</div>${g.isNew ? '<div class="nw">NEW CARD!</div>' : ''}
          <div class="muted small">${r.name} · Level ${rec.lvl}${need ? ' · ' + rec.n + '/' + need.copies + ' to upgrade' : ' · Max level'}</div></div>
          <p class="muted small">${got.length - step - 1} more</p></div>`, false);
        Sound.play(c.rarity === 'legendary' ? 'legendary' : c.rarity === 'epic' ? 'epic' : 'cardflip');
      } else {
        this.modal(`<h2>${def.name}</h2>
          <div class="loot">${got.map((g) => `<div class="cc"><img src="${cardImg(g.key, 80)}" alt=""><div class="lv">x${g.n}</div>${g.isNew ? '<span class="nw">NEW</span>' : ''}</div>`).join('')}</div>
          <div class="rw">${loot.gold ? `<div class="res"><i class="coin"></i>+${loot.gold}</div>` : ''}${loot.gems ? `<div class="res"><i class="gem"></i>+${loot.gems}</div>` : ''}</div>
          <div class="btns"><button class="btn gold" id="c-ok">Collect</button></div>`, false);
        Sound.play('coin');
        $('c-ok').onclick = () => { this.closeModal(); this.render(); this.refreshTop(); this.refreshNav(); };
        return;
      }
      $('cb').onclick = () => { step++; if (step === 0) Sound.play('chest'); show(); };
    };
    show();
  },

  // ---- cards page ----
  renderCards() {
    const deck = curDeck();
    const owned = CARD_KEYS.filter((k) => SAVE.cards[k] && !deck.includes(k));
    owned.sort((a, b) => CARDS[a].cost - CARDS[b].cost || RARITY_ORDER.indexOf(CARDS[a].rarity) - RARITY_ORDER.indexOf(CARDS[b].rarity));
    const locked = CARD_KEYS.filter((k) => !SAVE.cards[k]);
    locked.sort((a, b) => CARDS[a].arena - CARDS[b].arena);
    const cell = (k, inDeck) => {
      const rec = SAVE.cards[k];
      if (!rec) return `<div class="cc locked" data-k="${k}"><img src="${cardImg(k, 90)}" alt=""><div class="lv">Arena ${CARDS[k].arena + 1}</div></div>`;
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
      <div class="grid">${owned.map((k) => wrap(k, false)).join('') || '<p class="muted">All your cards are in the deck.</p>'}</div>
      ${locked.length ? `<h3>Not found yet <small>Win chests to unlock</small></h3><div class="grid">${locked.map((k) => `<div>${cell(k)}</div>`).join('')}</div>` : ''}
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
      ${!rec ? `<p class="center muted">Unlocks in Arena ${c.arena + 1}: ${esc(ARENAS[c.arena].name)} (${ARENAS[c.arena].min} trophies)</p>` : ''}
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
      this.renderCards();
      this.refreshNav();
      this.toast(`${c.name} upgraded to level ${res.lvl}! +${res.xp} XP`);
      if (res.kingUps) setTimeout(() => this.kingLevelUp(), 400);
    };
    $('ci-x').onclick = () => this.closeModal();
  },

  kingLevelUp() {
    Sound.play('levelup');
    this.modal(`<h2>King Level ${SAVE.king}!</h2><p class="center">Your towers are stronger now.</p><div class="rw"><div class="res"><i class="gem"></i>+10</div></div><div class="btns"><button class="btn gold" id="kl-ok">Great!</button></div>`, true);
    $('kl-ok').onclick = () => this.closeModal();
    this.refreshTop();
  },

  // ---- shop ----
  renderShop() {
    SAVE.shopSeen = todayKey();
    const shop = refreshShop();
    $('p-shop').innerHTML = `<div class="inner">
      <h3>Daily deals <small>New offers every day</small></h3>
      <div class="shopgrid">${shop.offers.map((o, i) => `<div class="offer ${o.bought ? 'done' : ''}"><img src="${cardImg(o.key, 90)}" alt=""><b>${esc(CARDS[o.key].name)} x${o.n}</b>
        <button class="btn small ${o.bought ? '' : 'gold'}" data-o="${i}" ${o.bought || SAVE.gold < o.price ? 'disabled' : ''}>${o.bought ? 'Sold' : `<i class="coin"></i> ${o.price}`}</button></div>`).join('')}</div>
      <h3>Chests</h3>
      <div class="shopgrid">${SHOP_CHESTS.map((c, i) => `<div class="offer"><img src="${chestImg(c.type)}" alt=""><b>${CHESTS[c.type].name}</b><small>Arena ${curArena() + 1} rewards</small>
        <button class="btn small purple" data-c="${i}" ${SAVE.gems < c.gems ? 'disabled' : ''}><i class="gem"></i> ${c.gems}</button></div>`).join('')}</div>
      <h3>Gold</h3>
      <div class="shopgrid">${GOLD_PACKS.map((g, i) => `<div class="offer"><div style="font-size:34px">💰</div><b>${g.gold} gold</b>
        <button class="btn small purple" data-g="${i}" ${SAVE.gems < g.gems ? 'disabled' : ''}><i class="gem"></i> ${g.gems}</button></div>`).join('')}</div>
      <p class="center muted small">Everything is earned in the game. No real money, no ads.</p>
    </div>`;
    for (const b of document.querySelectorAll('#p-shop [data-o]')) b.onclick = () => {
      const o = shop.offers[+b.dataset.o];
      if (o.bought || SAVE.gold < o.price) return;
      SAVE.gold -= o.price;
      o.bought = true;
      const isNew = addCards(o.key, o.n);
      saveGame();
      Sound.play('coin');
      this.toast(`${isNew ? 'New card: ' : ''}${CARDS[o.key].name} x${o.n}`);
      this.refreshTop();
      this.renderShop();
    };
    for (const b of document.querySelectorAll('#p-shop [data-c]')) b.onclick = () => {
      const c = SHOP_CHESTS[+b.dataset.c];
      if (SAVE.gems < c.gems) return;
      SAVE.gems -= c.gems;
      saveGame();
      this.refreshTop();
      this.openChest(c.type, curArena());
    };
    for (const b of document.querySelectorAll('#p-shop [data-g]')) b.onclick = () => {
      const g = GOLD_PACKS[+b.dataset.g];
      if (SAVE.gems < g.gems) return;
      SAVE.gems -= g.gems;
      SAVE.gold += g.gold;
      saveGame();
      Sound.play('coin');
      this.refreshTop();
      this.renderShop();
    };
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

  resultModal(scene, r, rw) {
    const my = scene.myTeam;
    const res = scene.result;
    const online = !!scene.link;
    const title = r.draw ? 'Draw' : r.win ? 'Victory!' : 'Defeat';
    const reason = { surrender: r.win ? 'Your opponent surrendered.' : 'You surrendered.', disconnect: 'Your opponent disconnected.', tiebreak: 'Decided by the weakest tower.' }[res.reason] || '';
    const ch = rw.chest;
    this.modal(`<div class="result">
      <h2 style="font-size:30px;color:${r.draw ? '#fff' : r.win ? '#8fd0ff' : '#ff8a8a'}">${title}</h2>
      <div class="crowns"><div class="c"><i class="crn b"></i>${res.crowns[my]}</div><span class="muted" style="font-size:16px">vs</span><div class="c">${res.crowns[1 - my]}<i class="crn r"></i></div></div>
      <div class="muted small">${esc(scene.names[my])} vs ${esc(scene.names[1 - my])}</div>
      ${reason ? `<div class="muted small">${reason}</div>` : ''}
      <div class="rw">
        ${rw.trophies ? `<div class="res"><i class="tro"></i>${rw.trophies > 0 ? '+' : ''}${rw.trophies}</div>` : ''}
        ${rw.gold ? `<div class="res"><i class="coin"></i>+${rw.gold}</div>` : ''}
        ${rw.crowns ? `<div class="res">👑 +${rw.crowns}</div>` : ''}
      </div>
      ${ch ? `<div class="chestbox" style="min-height:0"><img src="${chestImg(ch.type)}" style="width:90px" alt=""><div class="small">You won a <b>${CHESTS[ch.type].name}</b>!</div></div>` : r.win && r.mode !== 'training' ? '<p class="muted small center">Chest slots are full, so no chest this time.</p>' : ''}
      ${rw.crownChest ? '<p class="small center" style="color:#ffe070">👑 Crown Chest is ready!</p>' : ''}
      ${rw.arenaUp != null ? `<p class="center" style="color:#ffe070;font-weight:900">New arena unlocked: ${esc(ARENAS[rw.arenaUp].name)}!</p>` : ''}
      <div class="btns" style="width:100%">
        ${online ? `<button class="btn green" id="rs-again" ${Lobby.link && !Lobby.link.closed ? '' : 'disabled'}>Rematch</button>` : ''}
        <button class="btn gold" id="rs-ok">${online ? 'Leave' : 'OK'}</button>
      </div>
      ${online ? '<div class="muted small" id="rs-note"></div>' : ''}
    </div>`, false);
    $('rs-ok').onclick = () => {
      this.closeModal();
      if (online) Lobby.leave();
      Game.toHome(rw.arenaUp);
    };
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

  arenaUnlocked(a) {
    const cards = CARD_KEYS.filter((k) => CARDS[k].arena === a);
    Sound.play('levelup');
    this.modal(`<h2>New Arena!</h2><p class="center" style="font-size:18px;font-weight:900">${esc(ARENAS[a].name)}</p>
      ${cards.length ? `<p class="center muted small">New cards can now drop from chests:</p><div class="loot">${cards.map((k) => `<div class="cc"><img src="${cardImg(k, 80)}" alt=""></div>`).join('')}</div>` : '<p class="center">You reached the top arena. Legendary!</p>'}
      <div class="btns"><button class="btn gold" id="au-ok">Awesome</button></div>`, true);
    $('au-ok').onclick = () => this.closeModal();
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
