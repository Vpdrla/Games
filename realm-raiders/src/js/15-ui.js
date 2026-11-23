// ---------- UI: DOM menus, panels, blessing picker, pause, results and toasts ----------

const SVGI = {
  sword: '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M14.5 3H21v6.5L10 20.5 8.5 22 7 20.5l-1.5 1.5L2 18.5 3.5 17 2 15.5 3.5 14 14.5 3z" fill="currentColor"/></svg>',
  swirl: '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M12 2a10 10 0 1 0 10 10h-3a7 7 0 1 1-7-7 4 4 0 1 1-4 4h-3a7 7 0 1 0 7-7z" fill="currentColor"/></svg>',
  cross: '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M4 2l6 6-2 2L2 4V2h2zm16 0h2v2l-6 6-2-2 6-6zM9 13l2 2-5 5 1.5 1.5-1.5 1.5L2 19l1.5-1.5L5 19l4-6zm6 0l4 6 1.5-1.5L22 19l-4 4-1.5-1.5L18 20l-5-5 2-2zm-3-5l7 7-2 2-7-7 2-2z" fill="currentColor"/></svg>',
  users: '<svg viewBox="0 0 24 24" width="1em" height="1em"><circle cx="8" cy="8" r="4" fill="currentColor"/><circle cx="17" cy="9" r="3" fill="currentColor"/><path d="M1 21c0-4 3-7 7-7s7 3 7 7H1zm15 0c0-2-.6-4-1.8-5.4A5 5 0 0 1 23 20v1h-7z" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M12 2l3 7 7 .6-5.3 4.7L18.4 22 12 18l-6.4 4 1.7-7.7L2 9.6 9 9z" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M15 4l-8 8 8 8 2-2-6-6 6-6z" fill="currentColor"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M6 10V8a6 6 0 1 1 12 0v2h1v12H5V10h1zm3 0h6V8a3 3 0 0 0-6 0v2z" fill="currentColor"/></svg>',
  chest: '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M3 10h18v10H3zM5 4h14a2 2 0 0 1 2 2v3H3V6a2 2 0 0 1 2-2z" fill="currentColor"/><rect x="10" y="9" width="4" height="5" fill="#3a2300"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M6 3l15 9-15 9z" fill="currentColor"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15 15 0 0 0-1.3-3.9A8 8 0 0 1 18.9 8zM12 4.1c.8 1.1 1.5 2.4 1.9 3.9h-3.8c.4-1.5 1.1-2.8 1.9-3.9zM4.3 14a8 8 0 0 1 0-4h3.4a16 16 0 0 0 0 4H4.3zm.8 2h3a15 15 0 0 0 1.3 3.9A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.3-3.9A15 15 0 0 0 8.1 8zM12 19.9c-.8-1.1-1.5-2.4-1.9-3.9h3.8c-.4 1.5-1.1 2.8-1.9 3.9zM14.3 14H9.7a14 14 0 0 1 0-4h4.6a14 14 0 0 1 0 4zm.3 5.9a15 15 0 0 0 1.3-3.9h3a8 8 0 0 1-4.3 3.9zM16.3 14a16 16 0 0 0 0-4h3.4a8 8 0 0 1 0 4h-3.4z" fill="currentColor"/></svg>',
};

function rarColor(r) { return RARITY[r].color; }
function statLabel(k, v) { const g = GEAR_STATS[k]; return '+' + v + g[3] + ' ' + tr(g[0]); }
function heroName(id) { return tr(HERO_BY_ID[id].name); }

const UI = {
  cur: null, arg: null, stack: [],
  party: null, setup: null,
  offer: null,
  online: null,
  dlg: null,

  init() {
    const root = $('ui');
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      Sound.unlock();
      Sound.play('click', 0.5);
      this.act(el.dataset.act, el.dataset.arg, el);
    });
    root.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.set) this.setSetting(el.dataset.set, el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value);
    });
    root.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.set && el.type === 'checkbox') this.setSetting(el.dataset.set, el.checked);
    });
  },

  show(id, on) { $(id).classList.toggle('show', !!on); },
  hideAll() { for (const id of ['menu', 'panel', 'offers', 'pause', 'results']) this.show(id, false); this.cur = null; },

  // ---------- main menu ----------
  showMenu() {
    this.hideAll();
    const s = Meta.s, h = HERO_BY_ID[s.sel], hh = Meta.hero(s.sel);
    const chest = Meta.chestReady();
    const qdot = s.daily.quests.some((q) => !q.claimed && q.prog >= q.n) || Meta.canBonus();
    $('menu').innerHTML = `
      <div class="mtop">
        <div class="logo">REALM RAIDERS<small>${tr('CO-OP ACTION RPG')}</small></div>
        <div class="sp"></div>
        <button class="btn sm dark" data-act="lang">${SVGI.globe} ${Lang.ko ? 'English' : '한국어'}</button>
        <button class="btn sm y${chest ? ' dot' : ''}" data-act="chest">${SVGI.chest} ${tr('Daily chest')}</button>
        <span class="pill o"><span class="coin"></span> ${fmtNum(s.gold)}</span>
      </div>
      <div class="showcase">
        <canvas id="showcv" data-hero="${h.id}"></canvas>
        <div class="hn o">${esc(tr(h.name))}</div>
        <div class="ht">${esc(tr(h.title))} · <span style="color:${ROLE_COLOR[h.role]}">${tr(h.role)}</span></div>
        <div class="row" style="justify-content:center"><span class="tag">Lv ${hh.lvl}</span><span class="tag">${tr('Power')} ${Meta.power(h.id)}</span></div>
        <div class="lvbar"><i style="width:${hh.lvl >= MAX_LVL ? 100 : Math.round(hh.xp / Meta.xpNeed(hh.lvl) * 100)}%"></i></div>
        <button class="btn sm dark" data-act="open" data-arg="heroes">${tr('Change hero')}</button>
      </div>
      <div class="modes">
        <button class="mode adv" data-act="setup" data-arg="adventure"><span class="ic">${SVGI.sword}</span><span><b>${tr('Adventure')}</b><span>${tr('Raid 5 realms · bosses · loot')}</span></span></button>
        <button class="mode aby" data-act="setup" data-arg="abyss" ${Meta.abyssUnlocked() ? '' : 'disabled'}><span class="ic">${SVGI.swirl}</span><span><b>${tr('The Abyss')}</b><span>${Meta.abyssUnlocked() ? tr('Endless floors · best {n}', { n: s.stats.abyssBest }) : tr('Beat the Whispering Woods first')}</span></span></button>
        <button class="mode are" data-act="setup" data-arg="arena"><span class="ic">${SVGI.cross}</span><span><b>${tr('Arena')}</b><span>${tr('Hero vs hero · team or free-for-all')}</span></span></button>
        <button class="mode onl" data-act="open" data-arg="online"><span class="ic">${SVGI.users}</span><span><b>${tr('Play with friends')}</b><span>${tr('Online room code · or join on one screen')}</span></span></button>
      </div>
      <div class="mnav">
        <button class="btn dark" data-act="open" data-arg="heroes">${tr('Heroes')}</button>
        <button class="btn dark" data-act="open" data-arg="gear">${tr('Gear')}${s.items.some((i) => i.isNew) ? ' ●' : ''}</button>
        <button class="btn dark" data-act="open" data-arg="camp">${tr('Camp')}</button>
        <button class="btn dark" data-act="open" data-arg="ach">${tr('Achievements')}</button>
        <button class="btn dark${qdot ? ' dot' : ''}" data-act="open" data-arg="quests">${tr('Quests')}</button>
        <button class="btn dark" data-act="open" data-arg="settings">${tr('Settings')}</button>
        <button class="btn dark" data-act="open" data-arg="help">${tr('How to play')}</button>
      </div>`;
    this.show('menu', true);
    this.paint($('menu'));
  },

  paint(root) {
    for (const cv of root.querySelectorAll('canvas[data-hero]')) this.portrait(cv, cv.dataset.hero, cv.dataset.dim === '1');
  },

  portrait(cv, id, dim, t, ang) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 80, h = cv.clientHeight || 80;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, h);
    const hero = HERO_BY_ID[id];
    const g = x.createRadialGradient(w / 2, h * 0.6, 4, w / 2, h * 0.6, w * 0.55);
    g.addColorStop(0, rgba(hero.color, 0.45)); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const r = Math.min(w, h) * 0.26;
    const u = { id: 1, kind: 'hero', x: w / 2, y: h * 0.6, px: w / 2, py: h * 0.6, r, baseR: r, hero, ang: ang != null ? ang : 0.9, st: newStatus(), buffs: [], cd: {}, pl: { slot: 0 }, anim: 0, flash: 0, shield: 0 };
    x.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(x, u.x, u.y + r * 0.8, r * 0.9, r * 0.32); x.fill();
    if (dim) x.globalAlpha = 0.35;
    View.drawHero(x, u, t || 0, { t: 0 });
    x.globalAlpha = 1;
  },

  tickMenu(t) {
    const cv = $('showcv');
    if (cv && $('menu').classList.contains('show')) this.portrait(cv, cv.dataset.hero, false, t, 0.9 + Math.sin(t * 0.8) * 0.9);
  },

  // ---------- panels ----------
  panel(title, body, opts) {
    opts = opts || {};
    $('panel').innerHTML = `<div class="pbox"><div class="phead"><button class="btn sm dark" data-act="back">${SVGI.back}</button><h2 class="o">${title}</h2>${opts.right || ''}<span class="pill o"><span class="coin"></span> ${fmtNum(Meta.s.gold)}</span></div><div class="pbody" id="pbody">${body}</div>${opts.foot ? `<div class="phead pfoot">${opts.foot}</div>` : ''}</div>`;
    this.show('panel', true);
    this.paint($('panel'));
  },

  open(name, arg, noPush) {
    if (!noPush && this.cur) this.stack.push([this.cur, this.arg]);
    this.cur = name; this.arg = arg;
    const fn = this['p_' + name];
    if (fn) fn.call(this, arg);
  },

  refresh() { if (this.cur) { const st = this.stack.length; const sc = $('pbody') ? $('pbody').scrollTop : 0; this.open(this.cur, this.arg, true); this.stack.length = st; if ($('pbody')) $('pbody').scrollTop = sc; } },

  back() {
    if (this.cur === 'online') Game.leaveOnline();
    const prev = this.stack.pop();
    if (prev) { this.cur = null; this.open(prev[0], prev[1], true); this.cur = prev[0]; return; }
    this.cur = null;
    this.setup = null;
    this.show('panel', false);
    this.showMenu();
  },

  closePanels() { this.stack.length = 0; this.cur = null; this.setup = null; this.show('panel', false); },

  // --- heroes ---
  p_heroes() {
    const s = Meta.s;
    const list = HEROES.slice().sort((a, b) => (s.heroes[b.id].unlocked - s.heroes[a.id].unlocked) || a.rarity - b.rarity);
    const cards = list.map((h) => {
      const hh = s.heroes[h.id];
      const req = hh.unlocked ? `<span class="lv">Lv ${hh.lvl} · ${tr('Power')} ${Meta.power(h.id)}</span>` : h.unlock.gold != null ? `<span class="lv">${SVGI.lock} <span class="coin"></span> ${fmtNum(h.unlock.gold)}</span>` : `<span class="lv">${SVGI.lock} ${tr('Achievement')}</span>`;
      return `<div class="card hc${s.sel === h.id ? ' sel' : ''}${hh.unlocked ? '' : ' lock'}" data-act="hero" data-arg="${h.id}"><canvas data-hero="${h.id}" data-dim="${hh.unlocked ? 0 : 1}"></canvas><span class="nm">${esc(tr(h.name))}</span><span class="rl" style="background:${ROLE_COLOR[h.role]}">${tr(h.role)}</span>${req}</div>`;
    }).join('');
    this.panel(tr('Heroes') + ' · ' + heroCount(s) + '/' + HEROES.length, `<div class="grid">${cards}</div>`);
  },

  p_hero(id) {
    const s = Meta.s, h = HERO_BY_ID[id], hh = s.heroes[id];
    const L = Meta.loadout(id);
    const lv = hh.lvl;
    const gear = SLOTS.map((sl) => {
      const it = Meta.item(hh.gear[sl]);
      return it ? this.itemCard(it, `data-act="item" data-arg="${it.uid}"`) : `<div class="item" style="border-color:#3a2f70" data-act="gearpick" data-arg="${id}:${sl}"><span class="in muted">${tr('Empty')} · ${tr(SLOT_NAME[sl])}</span><span class="is">${tr('Tap to equip')}</span></div>`;
    }).join('');
    const unlock = hh.unlocked ? '' : h.unlock.gold != null
      ? `<button class="btn y" data-act="unlock" data-arg="${id}" ${Meta.canUnlock(id) ? '' : 'disabled'}>${tr('Unlock')} · <span class="coin"></span> ${fmtNum(h.unlock.gold)}</button>`
      : `<span class="tag">${tr('Unlock')}: ${esc(tr((ACHIEVEMENTS.find((a) => a.id === h.unlock.ach) || {}).desc || ''))}</span>`;
    const body = `<div class="row" style="align-items:flex-start;gap:1em">
      <div style="display:flex;flex-direction:column;align-items:center;gap:.3em;min-width:8em"><canvas data-hero="${id}" style="width:8em;height:8em"></canvas>
        <span class="rl tag" style="background:${ROLE_COLOR[h.role]};color:#100a20">${tr(h.role)}</span>
        ${hh.unlocked ? `<span>${tr('Level {n}', { n: lv })}${lv >= MAX_LVL ? ' (' + tr('max') + ')' : ''}</span><div class="lvbar" style="width:8em"><i style="width:${lv >= MAX_LVL ? 100 : Math.round(hh.xp / Meta.xpNeed(lv) * 100)}%"></i></div><span class="kv">${tr('{a} runs · {b} kills', { a: hh.runs, b: fmtNum(hh.kills) })}</span>` : ''}
      </div>
      <div style="flex:1;min-width:14em">
        <div class="kv"><b>${esc(tr(h.title))}</b> · ${tr('Health')} <b>${Math.round(h.hp * (1 + 0.07 * (lv - 1)) * (1 + (L.mods.hp || 0)))}</b> · ${tr('Speed')} <b>${h.spd}</b> · ${tr('Power')} <b>${Meta.power(id)}</b></div>
        <div class="sec">${tr('Attack')}</div><div class="kv">${tr(basicDesc(h))}</div>
        <div class="sec">${tr('Skill')} · ${esc(tr(h.skill.name))} <span class="tag">${tr('{n}s', { n: h.skill.cd })}</span></div><div class="kv">${esc(tr(h.skill.desc))}</div>
        <div class="sec">${tr('Ultimate')} · ${esc(tr(h.ult.name))}</div><div class="kv">${esc(tr(h.ult.desc))}</div>
        <div class="sec">${tr('Passive')} · ${esc(tr(h.passive.name))}</div><div class="kv">${esc(tr(h.passive.desc))}</div>
        ${hh.unlocked ? `<div class="sec">${tr('Gear')}</div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(11em,1fr))">${gear}</div>` : ''}
      </div></div>`;
    const foot = hh.unlocked ? (s.sel === id ? `<span class="tag">${tr('Selected')}</span>` : `<button class="btn g" data-act="select" data-arg="${id}">${tr('Play as {name}', { name: esc(tr(h.name)) })}</button>`) : unlock;
    this.panel(esc(tr(h.name)), body, { foot: '<div style="flex:1"></div>' + foot });
  },

  itemCard(it, attrs, extra) {
    const by = Meta.equippedBy(it.uid);
    const st = Meta.itemStats(it);
    return `<div class="item" style="position:relative;border-color:${rarColor(it.rar)}" ${attrs || ''}>${by ? `<span class="eq">${esc(heroName(by))}</span>` : ''}${it.isNew ? `<span class="eq" style="left:.35em;right:auto;background:#ff4f6d;color:#fff">${tr('NEW')}</span>` : ''}
      <span class="in" style="color:${rarColor(it.rar)};${it.isNew || by ? 'margin-top:.8em' : ''}">${esc(itemName(it))}${it.up ? ' +' + it.up : ''}</span>
      <span class="is">${tr(RARITY[it.rar].name)} ${tr(SLOT_NAME[it.slot])} · iLvl ${it.ilvl}</span>
      <span class="is" style="color:#e8e4ff">${statLabel(st[0][0], st[0][1])}${st.length > 1 ? ' · ' + tr('+{n} more', { n: st.length - 1 }) : ''}</span>${it.uniq ? `<span class="is" style="color:#ffb22e">${esc(tr(UNIQUE_BY_ID[it.uniq].desc))}</span>` : ''}${extra || ''}</div>`;
  },

  // --- gear ---
  p_gear(filter) {
    const s = Meta.s;
    filter = filter || 'all';
    const items = s.items.filter((i) => filter === 'all' || i.slot === filter).sort((a, b) => b.rar - a.rar || Meta.itemScore(b) - Meta.itemScore(a));
    const tabs = ['all', ...SLOTS].map((f) => `<button class="btn sm ${filter === f ? 'y' : 'dark'}" data-act="gearf" data-arg="${f}">${f === 'all' ? tr('All') : tr(SLOT_NAME[f])}</button>`).join('');
    const body = `<div class="row" style="margin-bottom:.6em">${tabs}<div style="flex:1"></div><span class="kv">${s.items.length}/${INV_MAX}</span></div>
      ${items.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(12em,1fr))">${items.map((it) => this.itemCard(it, `data-act="item" data-arg="${it.uid}"`)).join('')}</div>` : `<p class="muted">${tr('No gear yet. Gear Chests, elite dens, bosses and daily rewards drop equipment.')}</p>`}`;
    this.panel(tr('Gear'), body, { foot: `<span class="kv">${tr('Salvage unequipped:')}</span><button class="btn sm dark" data-act="salv" data-arg="0">${tr('Commons')}</button><button class="btn sm dark" data-act="salv" data-arg="1">${tr('Rare & below')}</button>` });
  },

  p_item(uid) {
    const it = Meta.item(+uid);
    if (!it) { this.back(); return; }
    it.isNew = false;
    const s = Meta.s, sel = s.sel;
    const cur = Meta.item(Meta.hero(sel).gear[it.slot]);
    const st = Meta.itemStats(it);
    const curSt = cur && cur !== it ? new Map(Meta.itemStats(cur)) : null;
    const rows = st.map(([k, v]) => {
      let d = '';
      if (curSt) { const o = curSt.get(k) || 0; const df = Math.round((v - o) * 10) / 10; d = df ? ` <span class="${df > 0 ? 'up' : 'down'}">(${df > 0 ? '+' : ''}${df})</span>` : ''; }
      return `<span>${tr(GEAR_STATS[k][0])}</span><span class="v">+${v}${GEAR_STATS[k][3]}${d}</span>`;
    }).join('');
    const nextUp = it.up < 10 ? `<span class="kv">${tr('Upgrade +{n}: all stats +10%', { n: it.up + 1 })}</span>` : '';
    const by = Meta.equippedBy(it.uid);
    const body = `<div class="row" style="align-items:flex-start;gap:1em"><div style="flex:1;min-width:13em">
      <div style="font-size:1.3em;font-weight:900;color:${rarColor(it.rar)}">${esc(itemName(it))}${it.up ? ' +' + it.up : ''}</div>
      <div class="kv">${tr(RARITY[it.rar].name)} ${tr(SLOT_NAME[it.slot])} · ${tr('item level {n}', { n: it.ilvl })} · ${tr('score {n}', { n: Meta.itemScore(it) })}</div>
      ${it.uniq ? `<div class="kv" style="color:#ffb22e;margin:.4em 0">★ ${esc(tr(UNIQUE_BY_ID[it.uniq].desc))}</div>` : ''}
      <div class="statl" style="margin-top:.5em">${rows}</div>
      ${by ? `<div class="kv" style="margin-top:.5em">${tr('Equipped by {name}', { name: '<b>' + esc(heroName(by)) + '</b>' })}</div>` : ''}
      ${cur && cur !== it ? `<div class="sec">${tr('Compared with what {name} wears now', { name: esc(heroName(sel)) })}</div>${this.itemCard(cur, '')}` : ''}
      ${nextUp}
    </div></div>`;
    const foot = `<div style="flex:1"></div>
      <button class="btn sm dark" data-act="lock" data-arg="${it.uid}">${it.lock ? tr('Unlock') : tr('Lock')}</button>
      <button class="btn sm r" data-act="salvage" data-arg="${it.uid}" ${it.lock ? 'disabled' : ''}>${tr('Salvage')} <span class="coin"></span> ${Meta.salvageValue(it)}</button>
      ${it.up < 10 ? `<button class="btn sm b" data-act="upgrade" data-arg="${it.uid}" ${s.gold >= Meta.upCost(it) ? '' : 'disabled'}>${tr('Upgrade')} <span class="coin"></span> ${fmtNum(Meta.upCost(it))}</button>` : `<span class="tag">${tr('Max +10')}</span>`}
      ${by === sel ? `<button class="btn sm dark" data-act="unequip" data-arg="${sel}:${it.slot}">${tr('Unequip')}</button>` : `<button class="btn sm g" data-act="equip" data-arg="${it.uid}">${tr('Equip on {name}', { name: esc(heroName(sel)) })}</button>`}`;
    this.panel(tr('Item'), body, { foot });
  },

  p_gearpick(arg) {
    const [hid, slot] = arg.split(':');
    const items = Meta.s.items.filter((i) => i.slot === slot).sort((a, b) => Meta.itemScore(b) - Meta.itemScore(a));
    const body = items.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(12em,1fr))">${items.map((it) => this.itemCard(it, `data-act="equipon" data-arg="${hid}:${it.uid}"`)).join('')}</div>` : `<p class="muted">${tr('You have no {slot} yet.', { slot: tr(SLOT_NAME[slot]) })}</p>`;
    this.panel(tr('Choose {slot} for {name}', { slot: tr(SLOT_NAME[slot]), name: heroName(hid) }), body);
  },

  // --- camp ---
  p_camp() {
    const s = Meta.s;
    const rows = TALENTS.map((t) => {
      const l = s.talents[t.id] || 0, c = Meta.talentCost(t.id);
      const pips = Array.from({ length: t.max }, (_, i) => `<span style="display:inline-block;width:.65em;height:.65em;border-radius:.15em;margin-right:.15em;background:${i < l ? 'var(--gold)' : '#3a2f70'}"></span>`).join('');
      return `<div class="ach${l >= t.max ? ' done' : ''}"><div class="ai">${l}</div><div class="at"><b>${esc(tr(t.name))}</b><span>${esc(tr(t.desc))}</span><div>${pips}</div></div>${c == null ? '<span class="tag">MAX</span>' : `<button class="btn sm y" data-act="talent" data-arg="${t.id}" ${s.gold >= c ? '' : 'disabled'}><span class="coin"></span> ${fmtNum(c)}</button>`}</div>`;
    }).join('');
    this.panel(tr('Camp upgrades'), `<p class="kv" style="margin-bottom:.5em">${tr('Permanent upgrades for every hero, paid with gold from your raids.')}</p>${rows}`);
  },

  // --- achievements ---
  p_ach() {
    const s = Meta.s;
    const done = ACHIEVEMENTS.filter((a) => s.ach[a.id]).length;
    const rows = ACHIEVEMENTS.map((a) => {
      const ok = !!s.ach[a.id];
      let prog = '';
      if (!ok && a.prog) { const [v, n] = a.prog(s); prog = `<div class="row" style="gap:.4em"><div class="bar"><i style="width:${clamp(v / n, 0, 1) * 100}%"></i></div><span class="kv">${fmtNum(Math.min(v, n))}/${fmtNum(n)}</span></div>`; }
      return `<div class="ach${ok ? ' done' : ''}"><div class="ai">${ok ? SVGI.star : SVGI.lock}</div><div class="at"><b>${esc(tr(a.name))}</b><span>${esc(tr(a.desc))}</span>${prog}</div><span class="tag"><span class="coin"></span> ${fmtNum(a.gold)}${a.hero ? ' + ' + tr('hero') : ''}</span></div>`;
    }).join('');
    this.panel(tr('Achievements') + ' · ' + done + '/' + ACHIEVEMENTS.length, rows);
  },

  // --- quests ---
  p_quests() {
    Meta.daily();
    const d = Meta.s.daily;
    const rows = d.quests.map((q, i) => {
      const Q = QUESTS.find((x) => x.id === q.id);
      const ok = q.prog >= q.n;
      return `<div class="ach${q.claimed ? ' done' : ''}"><div class="ai">${q.claimed ? SVGI.star : i + 1}</div><div class="at"><b>${esc(tr(Q.name, { n: fmtNum(q.n) }))}</b><div class="row" style="gap:.4em"><div class="bar"><i style="width:${clamp(q.prog / q.n, 0, 1) * 100}%"></i></div><span class="kv">${fmtNum(q.prog)}/${fmtNum(q.n)}</span></div></div>${q.claimed ? `<span class="tag">${tr('Done')}</span>` : `<button class="btn sm y" data-act="claimq" data-arg="${i}" ${ok ? '' : 'disabled'}><span class="coin"></span> ${q.gold}</button>`}</div>`;
    }).join('');
    const bonus = d.bonus ? `<span class="tag">${tr('Bonus chest claimed')}</span>` : `<button class="btn ${Meta.canBonus() ? 'y' : 'dark'}" data-act="bonus" ${Meta.canBonus() ? '' : 'disabled'}>${SVGI.chest} ${tr('Finish all three: bonus gear chest')}</button>`;
    this.panel(tr('Daily quests'), `<p class="kv" style="margin-bottom:.5em">${tr('New quests every day. Progress counts in every mode.')}</p>${rows}<div class="row" style="margin-top:.6em">${bonus}</div>`);
  },

  // --- settings ---
  p_settings() {
    const st = Meta.s.settings;
    const sk = ['Easy', 'Normal', 'Hard'].map((n, i) => `<button class="btn sm ${st.botSkill === i ? 'y' : 'dark'}" data-act="botskill" data-arg="${i}">${tr(n)}</button>`).join('');
    const lg = [['auto', tr('Automatic')], ['ko', '한국어'], ['en', 'English']].map(([k, n]) => `<button class="btn sm ${(st.lang || 'auto') === k ? 'y' : 'dark'}" data-act="setlang" data-arg="${k}">${n}</button>`).join('');
    const body = `
      <div class="sec">${tr('Language')}</div><div class="row">${lg}</div>
      <div class="sec">${tr('Player')}</div><div class="row"><span>${tr('Name')}</span><input data-set="name" maxlength="16" value="${esc(Meta.s.name)}"></div>
      <div class="sec">${tr('Sound')}</div>
      <div class="row"><span style="width:6em">${tr('Effects')}</span><input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-set="sfx"></div>
      <div class="row"><span style="width:6em">${tr('Music')}</span><input type="range" min="0" max="1" step="0.05" value="${st.music}" data-set="music"></div>
      <div class="sec">${tr('Game')}</div>
      <div class="row"><span>${tr('Touch buttons')}</span>${[[0.35, tr('See-through')], [0.6, tr('Medium')], [0.9, tr('Solid')]].map(([v, n]) => `<button class="btn sm ${Math.abs((st.btnAlpha || 0.35) - v) < 0.01 ? 'y' : 'dark'}" data-act="btnalpha" data-arg="${v}">${n}</button>`).join('')}</div>
      <label class="row"><input type="checkbox" data-set="shake" ${st.shake ? 'checked' : ''}> ${tr('Screen shake')}</label>
      <label class="row"><input type="checkbox" data-set="nums" ${st.nums ? 'checked' : ''}> ${tr('Damage numbers')}</label>
      <label class="row"><input type="checkbox" data-set="autoSalvage" ${st.autoSalvage ? 'checked' : ''}> ${tr('Auto-salvage Common items')}</label>
      <div class="row" style="margin-top:.3em"><span>${tr('Bot skill')}</span>${sk}</div>
      <div class="sec">${tr('Save')}</div>
      <p class="kv">${Meta.cloud ? tr('Your progress is saved on this device and in your Claude account.') : tr('Your progress is saved on this device.')} ${tr('Copy the save code to move it to another device.')}</p>
      <div class="row"><button class="btn sm dark" data-act="export">${tr('Copy save code')}</button><button class="btn sm dark" data-act="import">${tr('Load a save code')}</button><button class="btn sm r" data-act="reset">${tr('Reset progress')}</button></div>
      <textarea id="savecode" rows="3" style="width:100%;margin-top:.4em;display:none"></textarea>`;
    this.panel(tr('Settings'), body);
  },

  setSetting(k, v) {
    const st = Meta.s.settings;
    if (k === 'name') { Meta.s.name = String(v).slice(0, 16) || 'Raider'; Meta.save(); return; }
    st[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    if (k === 'autoSalvage') st[k] = !!v;
    applySettings();
    Meta.save();
  },

  p_help() {
    const body = `
      <div class="sec">${tr('The basics')}</div>
      <p class="kv">${tr('HELP_BASICS')}</p>
      <div class="sec">${tr('Raids')}</div>
      <p class="kv">${tr('HELP_RAIDS')}</p>
      <div class="sec">${tr('Touch')}</div>
      <p class="kv">${tr('HELP_TOUCH')}</p>
      <div class="sec">${tr('Keyboard (up to 3 players on one keyboard)')}</div>
      <p class="kv">${tr('HELP_KEYS')}</p>
      <div class="sec">${tr('Gamepads (up to 4)')}</div>
      <p class="kv">${tr('HELP_PADS')}</p>
      <div class="sec">${tr('Friends')}</div>
      <p class="kv">${tr('HELP_FRIENDS')}</p>`;
    this.panel(tr('How to play'), body);
  },

  // --- setup (adventure / abyss / arena) ---
  defaultDev() { return Input.usedTouch || ('ontouchstart' in window && !matchMedia('(pointer:fine)').matches) ? 'touch' : 'kb1'; },

  p_setup(mode) {
    const s = Meta.s;
    if (!this.setup || this.setup.mode !== mode) {
      const realm = Math.min(5, Math.max(1, [5, 4, 3, 2, 1].find((r) => Meta.realmUnlocked(r)) || 1));
      this.setup = { mode, realm, diff: 0, teams: 2, size: 2, target: 10 };
      const party = [{ kind: 'local', dev: this.defaultDev(), hero: s.sel }];
      const picks = this.botPicks(s.sel);
      const nb = mode === 'arena' ? 1 : s.settings.bots;
      for (let i = 0; i < nb; i++) party.push({ kind: 'bot', hero: picks[i] });
      this.party = party;
      if (mode === 'arena') this.party[1].team = 1;
    }
    const S = this.setup;
    let top = '';
    if (mode === 'adventure') {
      top = `<div class="sec">${tr('Realm')}</div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(9.5em,1fr))">${REALMS.map((r) => {
        const un = Meta.realmUnlocked(r.id), cl = s.realms[r.id] || 0;
        return `<div class="card realm${S.realm === r.id ? ' sel' : ''}${un ? '' : ' lock'}" style="background:linear-gradient(${r.pal.f2},${r.pal.wall})" ${un ? `data-act="realm" data-arg="${r.id}"` : ''}><b style="color:${r.pal.accent}">${r.id}. ${esc(tr(r.name))}</b><span class="bs">${tr('Boss')}: ${esc(tr(BOSSES[r.boss].name))}</span><span class="bs">${tr('Power')} ${(r.power - 1) * 22 + 100}+</span><span class="bs">${un ? (cl ? '★'.repeat(cl) + ' ' + tr('cleared') : tr('Not cleared')) : SVGI.lock + ' ' + tr('Clear realm {n}', { n: r.id - 1 })}</span></div>`;
      }).join('')}</div>
      <div class="sec">${tr('Difficulty')}</div><div class="tabs">${DIFFS.map((d, i) => `<button class="btn sm ${S.diff === i ? 'on' : 'dark'}" data-act="diff" data-arg="${i}" ${Meta.diffUnlocked(S.realm, i) ? '' : 'disabled'}>${tr(d.name)}</button>`).join('')}<span class="kv" style="margin-left:.4em">${S.diff ? tr('Tougher monsters, more gold and better loot') : tr('Clear a realm to unlock Heroic, clear Heroic for Mythic')}</span></div>`;
    } else if (mode === 'abyss') {
      top = `<p class="kv">${tr('Endless floors of mixed monsters with a boss every 5th floor. How deep can you go? Best: floor {n}.', { n: '<b>' + s.stats.abyssBest + '</b>' })}</p>`;
    } else {
      top = `<div class="sec">${tr('Arena')}</div><div class="tabs">${[[2, 1], [2, 2], [2, 3], [2, 4], [0, 4], [0, 6]].map(([t, n]) => `<button class="btn sm ${S.teams === t && S.size === n ? 'on' : 'dark'}" data-act="arenasize" data-arg="${t}:${n}">${t ? n + 'v' + n : tr('FFA') + ' ' + n}</button>`).join('')}</div>
        <div class="row" style="margin-top:.4em"><span class="kv">${tr('Knockouts to win')}</span>${[5, 10, 15].map((k) => `<button class="btn sm ${S.target === k ? 'y' : 'dark'}" data-act="target" data-arg="${k}">${k}</button>`).join('')}<span class="kv">${tr("Heroes are evened out in the arena: level and gear don't count.")}</span></div>`;
      this.fitArena();
    }
    const slots = this.party.map((p, i) => this.slotHtml(p, i, mode)).join('');
    const maxN = mode === 'arena' ? (S.teams ? S.size * 2 : S.size) : 4;
    const add = this.party.length < maxN && mode !== 'arena' ? `<div class="slot" data-act="addbot"><b>+ ${tr('Add bot')}</b><span class="dv">${tr('or press a key / gamepad button to join')}</span></div>` : '';
    const body = `${top}<div class="sec">${tr('Party')} ${mode === 'arena' ? '' : tr('(up to 4)')}</div><div class="slots">${slots}${add}</div>
      <p class="kv" style="margin-top:.5em">${tr('Friends on this device: press U (right keyboard), Numpad 1 (arrows) or A on a gamepad to join.')}</p>`;
    const title = mode === 'adventure' ? tr('Adventure') : mode === 'abyss' ? tr('The Abyss') : tr('Arena');
    this.panel(title, body, { foot: `<div style="flex:1"></div><button class="btn y" data-act="start">${SVGI.play} ${tr('Start')}</button>` });
  },

  fitArena() {
    const S = this.setup;
    const n = S.teams ? S.size * 2 : S.size;
    while (this.party.length > n) { const i = this.party.map((p) => p.kind).lastIndexOf('bot'); this.party.splice(i >= 1 ? i : this.party.length - 1, 1); }
    const picks = this.botPicks(Meta.s.sel);
    while (this.party.length < n) this.party.push({ kind: 'bot', hero: picks[this.party.length % picks.length] });
    if (S.teams) {
      let c = [0, 0];
      for (const p of this.party) { if (p.team == null || c[p.team] >= S.size) p.team = c[0] < S.size ? 0 : 1; c[p.team]++; }
    }
  },

  botPicks(sel) {
    const want = ['Tank', 'Healer', 'Ranger', 'Mage', 'Fighter', 'Support', 'Assassin', 'Summoner'];
    const used = new Set([sel]);
    const out = [];
    for (const r of want) { const h = HEROES.find((x) => x.role === r && !used.has(x.id) && Meta.hero(x.id).unlocked) || HEROES.find((x) => x.role === r && !used.has(x.id)); if (h) { used.add(h.id); out.push(h.id); } }
    return out;
  },

  slotHtml(p, i, mode) {
    const h = HERO_BY_ID[p.hero];
    const team = mode === 'arena' && this.setup.teams ? `<button class="btn sm ${p.team ? 'r' : 'b'}" data-act="team" data-arg="${i}">${p.team ? tr('Red team') : tr('Blue team')}</button>` : '';
    const nav = `<div class="row" style="justify-content:center;gap:.3em"><button class="btn sm dark" data-act="slothero" data-arg="${i}:-1">‹</button><span>${esc(tr(h.name))}</span><button class="btn sm dark" data-act="slothero" data-arg="${i}:1">›</button></div>`;
    if (p.kind === 'local') {
      return `<div class="slot hum"><canvas data-hero="${h.id}"></canvas><b style="color:${PLAYER_COLORS[i % 4]}">P${this.party.slice(0, i + 1).filter((x) => x.kind === 'local').length}${i === 0 ? ' · ' + tr('You') : ''}</b>${nav}<span class="dv">${esc(trx(KEY_HINT[p.dev] || p.dev))}</span>${team}${i > 0 ? `<button class="btn sm dark" data-act="kick" data-arg="${i}">${tr('Remove')}</button>` : `<button class="btn sm dark" data-act="dev" data-arg="0">${tr('Controls')}: ${esc(trx(DEV_NAME[p.dev]))}</button>`}</div>`;
    }
    return `<div class="slot bot"><canvas data-hero="${h.id}"></canvas><b class="muted">${tr('Bot')}</b>${nav}${team}${mode !== 'arena' ? `<button class="btn sm dark" data-act="kick" data-arg="${i}">${tr('Remove')}</button>` : ''}</div>`;
  },

  // Called every frame while a setup panel is open: friends join by pressing a key.
  tickSetup() {
    if ((this.cur !== 'setup' && this.cur !== 'online') || !this.party) return;
    const dev = Input.joinPress();
    if (!dev) return;
    if (this.party.some((p) => p.kind === 'local' && p.dev === dev)) return;
    if (this.cur === 'online') return;
    if (this.party[0].dev === 'kb1' && dev === 'kb1') return;
    const mode = this.setup.mode;
    const maxN = mode === 'arena' ? (this.setup.teams ? this.setup.size * 2 : this.setup.size) : 4;
    const used = new Set(this.party.map((p) => p.hero));
    const hero = (HEROES.find((h) => Meta.hero(h.id).unlocked && !used.has(h.id)) || HEROES[0]).id;
    const entry = { kind: 'local', dev, hero };
    const bi = this.party.findIndex((p, i) => i > 0 && p.kind === 'bot' && (mode !== 'arena' || !this.setup.teams || p.team === 1));
    const bi2 = bi >= 0 ? bi : this.party.findIndex((p, i) => i > 0 && p.kind === 'bot');
    if (bi2 >= 0) { entry.team = this.party[bi2].team; this.party[bi2] = entry; }
    else if (this.party.length < maxN) { entry.team = 1; this.party.push(entry); }
    else return;
    Input.soloKb = !this.party.some((p) => p.kind === 'local' && (p.dev === 'kb2' || p.dev === 'kb3'));
    Sound.play('pickup', 0.6);
    this.toast(tr('{dev} joined!', { dev: '<b>' + esc(trx(DEV_NAME[dev])) + '</b>' }));
    this.refresh();
  },

  // ---------- online ----------
  p_online() {
    const o = this.online || { step: 'menu' };
    this.online = o;
    let body = '';
    if (o.step === 'menu') {
      body = `<p class="kv">${tr('Play the same game together on different phones or computers. One player creates a room; the others join with its code. Up to 4 heroes, bots fill the empty places.')}</p>
        <div class="row" style="margin:.6em 0"><span>${tr('Your name')}</span><input data-set="name" maxlength="16" value="${esc(Meta.s.name)}"></div>
        <div class="row" style="gap:1em;align-items:stretch">
          <div class="card" style="flex:1;min-width:13em;cursor:default"><div class="sec">${tr('Host')}</div><p class="kv">${tr('Create a room and share the code.')}</p><button class="btn y" style="margin-top:.4em" data-act="host">${tr('Create room')}</button></div>
          <div class="card" style="flex:1;min-width:13em;cursor:default"><div class="sec">${tr('Join')}</div><div class="row"><input id="joincode" maxlength="4" placeholder="CODE" style="width:6em;text-transform:uppercase;letter-spacing:.2em;font-weight:900"><button class="btn b" data-act="join">${tr('Join')}</button></div></div>
        </div>
        <p class="kv" style="margin-top:.6em">${tr('ONLINE_NOTE')}</p>`;
    } else if (o.step === 'wait') {
      body = `<p class="kv">${esc(trx(o.msg || 'Connecting...'))}</p>`;
    } else if (o.step === 'error') {
      body = `<p style="color:#ff8a9a">${esc(trx(o.msg))}</p><div class="row" style="margin-top:.6em"><button class="btn" data-act="onlinemenu">${tr('Back')}</button></div>`;
    } else if (o.step === 'lobby') {
      const L = o.lobby || { players: [], cfg: {} };
      const isHost = o.role === 'host';
      const cfg = L.cfg || {};
      const rows = L.players.map((p) => { const h = HERO_BY_ID[p.hero] || HEROES[0]; return `<div class="slot ${p.kind === 'bot' ? 'bot' : 'hum'}"><canvas data-hero="${h.id}"></canvas><b style="color:${p.kind === 'bot' ? '#a0a8c0' : PLAYER_COLORS[p.slot % 4]}">${esc(p.kind === 'bot' ? tr('Bot') : p.name)}${p.slot === o.slot ? ' (' + tr('you') + ')' : ''}</b><span>${esc(tr(h.name))} · Lv ${p.lvl || 1}</span>${p.slot === o.slot ? `<div class="row" style="justify-content:center"><button class="btn sm dark" data-act="onhero" data-arg="-1">‹</button><button class="btn sm dark" data-act="onhero" data-arg="1">›</button></div>` : ''}</div>`; }).join('');
      let conf = '';
      if (isHost) {
        conf = `<div class="sec">${tr('Mode')}</div><div class="tabs">${['adventure', 'abyss', 'arena'].map((m) => `<button class="btn sm ${cfg.mode === m ? 'on' : 'dark'}" data-act="onmode" data-arg="${m}" ${m === 'abyss' && !Meta.abyssUnlocked() ? 'disabled' : ''}>${m === 'adventure' ? tr('Adventure') : m === 'abyss' ? tr('Abyss') : tr('Arena')}</button>`).join('')}</div>`;
        if (cfg.mode === 'adventure') conf += `<div class="row" style="margin-top:.4em">${REALMS.map((r) => `<button class="btn sm ${cfg.realm === r.id ? 'y' : 'dark'}" data-act="onrealm" data-arg="${r.id}" ${Meta.realmUnlocked(r.id) ? '' : 'disabled'}>${r.id}. ${esc(tr(r.name))}</button>`).join('')}</div><div class="tabs" style="margin-top:.4em">${DIFFS.map((d, i) => `<button class="btn sm ${cfg.diff === i ? 'on' : 'dark'}" data-act="ondiff" data-arg="${i}" ${Meta.diffUnlocked(cfg.realm, i) ? '' : 'disabled'}>${tr(d.name)}</button>`).join('')}</div>`;
        if (cfg.mode === 'arena') conf += `<div class="tabs" style="margin-top:.4em">${[['team', 'Friends vs bots'], ['versus', 'Friends vs friends'], ['ffa', 'Free for all']].map(([k, n]) => `<button class="btn sm ${cfg.arena === k ? 'on' : 'dark'}" data-act="onarena" data-arg="${k}">${tr(n)}</button>`).join('')}</div>`;
        conf += `<label class="row" style="margin-top:.4em"><input type="checkbox" id="onbots" ${cfg.bots ? 'checked' : ''} data-act="onbots"> ${tr('Fill empty places with bots')}</label>`;
      } else conf = `<p class="kv">${tr('The host picks the mode:')} <b>${esc(cfg.mode === 'adventure' ? tr('Adventure') + ' · ' + tr(REALMS[(cfg.realm || 1) - 1].name) + ' · ' + tr(DIFFS[cfg.diff || 0].name) : cfg.mode === 'abyss' ? tr('The Abyss') : tr('Arena'))}</b></p>`;
      body = `${isHost ? `<div class="row" style="justify-content:center;flex-direction:column;align-items:center"><span class="kv">${tr('Room code')}</span><span class="code o">${esc(o.code || '····')}</span><span class="kv">${tr('Tell your friends to open Play with friends → Join')}</span></div>` : ''}${conf}<div class="sec">${tr('Players')}</div><div class="slots">${rows}</div>`;
      const foot = isHost ? `<div style="flex:1"></div><button class="btn y" data-act="onstart">${SVGI.play} ${tr('Start')}</button>` : `<span class="kv">${tr('Waiting for the host to start...')}</span>`;
      this.panel(tr('Play with friends'), body, { foot });
      return;
    }
    this.panel(tr('Play with friends'), body);
  },

  // ---------- actions ----------
  act(a, arg, el) {
    const s = Meta.s;
    switch (a) {
      case 'open': this.open(arg); break;
      case 'back': this.back(); break;
      case 'lang': s.settings.lang = Lang.ko ? 'en' : 'ko'; applySettings(); Meta.save(); if ($('pause').classList.contains('show')) this.showPause(); else this.showMenu(); break;
      case 'setlang': s.settings.lang = arg; applySettings(); Meta.save(); this.refresh(); break;
      case 'btnalpha': s.settings.btnAlpha = +arg; applySettings(); Meta.save(); this.refresh(); break;
      case 'setup': this.setup = null; this.open('setup', arg); break;
      case 'hero': this.open('hero', arg); break;
      case 'select': s.sel = arg; Meta.save(); if (this.party && this.party[0]) this.party[0].hero = arg; this.toast(tr('Now playing {name}', { name: '<b>' + esc(heroName(arg)) + '</b>' })); this.back(); break;
      case 'unlock': if (Meta.unlock(arg)) { Sound.play('level', 0.7); this.toast(tr('{name} joined your guild!', { name: '<b>' + esc(heroName(arg)) + '</b>' })); s.sel = arg; Meta.save(); this.refresh(); } break;
      case 'item': this.open('item', arg); break;
      case 'gearf': this.cur = 'gear'; this.arg = arg; this.refresh(); break;
      case 'gearpick': this.open('gearpick', arg); break;
      case 'equipon': { const [h, uid] = arg.split(':'); Meta.equip(h, +uid); this.back(); this.refresh(); break; }
      case 'equip': Meta.equip(s.sel, +arg); Sound.play('pickup', 0.5); this.refresh(); break;
      case 'unequip': { const [h, sl] = arg.split(':'); Meta.unequip(h, sl); this.refresh(); break; }
      case 'upgrade': if (Meta.upgrade(+arg)) { Sound.play('buy', 0.7); this.refresh(); } break;
      case 'salvage': { const v = Meta.salvage(+arg); if (v) { Sound.play('coin', 0.7); this.toast(tr('Salvaged for {g}', { g: '<span class="coin"></span> <b>' + v + '</b>' })); this.back(); this.refresh(); } break; }
      case 'lock': { const it = Meta.item(+arg); if (it) { it.lock = !it.lock; Meta.save(); this.refresh(); } break; }
      case 'salv': this.confirm(+arg ? tr('Salvage every unequipped, unlocked Rare or Common item?') : tr('Salvage every unequipped, unlocked Common item?'), tr('Salvage')).then((ok) => { if (!ok) return; const r = Meta.salvageBelow(+arg); this.toast(tr('Salvaged {n} items for {g}', { n: r.n, g: '<span class="coin"></span> <b>' + r.g + '</b>' })); this.refresh(); }); break;
      case 'talent': if (Meta.buyTalent(arg)) { Sound.play('buy', 0.7); this.refresh(); } break;
      case 'claimq': { const g = Meta.claimQuest(+arg); if (g) { Sound.play('coin', 0.8); this.toast(tr('Quest complete! {g}', { g: '<span class="coin"></span> <b>' + g + '</b>' })); this.refresh(); } break; }
      case 'bonus': { const it = Meta.claimBonus(); if (it) { this.lootToast(it); this.refresh(); } break; }
      case 'chest': { const r = Meta.claimChest(); if (r) { Sound.play('chest', 0.8); this.toast(tr('Daily chest: {g}', { g: '<span class="coin"></span> <b>' + r.gold + '</b>' })); this.lootToast(r.item); this.showMenu(); } else this.toast(tr('Come back tomorrow for another chest')); break; }
      case 'botskill': s.settings.botSkill = +arg; Meta.save(); this.refresh(); break;
      case 'export': { const ta = $('savecode'); ta.style.display = 'block'; ta.value = Meta.exportCode(); ta.select(); try { navigator.clipboard.writeText(ta.value).then(() => this.toast(tr('Save code copied')), () => {}); } catch (e) { /* manual copy */ } break; }
      case 'import': { const ta = $('savecode'); if (ta.style.display !== 'block') { ta.style.display = 'block'; ta.value = ''; ta.placeholder = tr('Paste a save code, then press Load again'); ta.focus(); break; } if (Meta.importCode(ta.value)) { applySettings(); this.toast(tr('Save loaded')); this.closePanels(); this.showMenu(); } else this.toast(tr('That save code is not valid')); break; }
      case 'reset': this.confirm(tr('Reset all progress? Heroes, gear, gold and achievements will be lost.'), tr('Reset')).then((ok) => { if (ok) { Meta.reset(); applySettings(); this.closePanels(); this.showMenu(); } }); break;
      case 'realm': this.setup.realm = +arg; if (!Meta.diffUnlocked(this.setup.realm, this.setup.diff)) this.setup.diff = 0; this.refresh(); break;
      case 'diff': this.setup.diff = +arg; this.refresh(); break;
      case 'arenasize': { const [t, n] = arg.split(':').map(Number); this.setup.teams = t; this.setup.size = n; this.fitArena(); this.refresh(); break; }
      case 'target': this.setup.target = +arg; this.refresh(); break;
      case 'team': { const p = this.party[+arg]; p.team = p.team ? 0 : 1; this.refresh(); break; }
      case 'slothero': {
        const [i, d] = arg.split(':').map(Number);
        const p = this.party[i];
        const pool = p.kind === 'local' ? HEROES.filter((h) => Meta.hero(h.id).unlocked) : HEROES;
        let k = pool.findIndex((h) => h.id === p.hero);
        k = (k + d + pool.length) % pool.length;
        p.hero = pool[k].id;
        if (i === 0) { s.sel = p.hero; Meta.save(); }
        this.refresh();
        break;
      }
      case 'addbot': { const picks = this.botPicks(s.sel).filter((h) => !this.party.some((p) => p.hero === h)); this.party.push({ kind: 'bot', hero: picks[0] || 'brand' }); s.settings.bots = this.party.filter((p) => p.kind === 'bot').length; Meta.save(); this.refresh(); break; }
      case 'kick': this.party.splice(+arg, 1); if (this.setup.mode !== 'arena') { s.settings.bots = this.party.filter((p) => p.kind === 'bot').length; Meta.save(); } Input.soloKb = !this.party.some((p) => p.kind === 'local' && (p.dev === 'kb2' || p.dev === 'kb3')); this.refresh(); break;
      case 'dev': { const order = ['touch', 'kb1', 'pad0']; const p = this.party[0]; p.dev = order[(order.indexOf(p.dev) + 1) % order.length]; this.refresh(); break; }
      case 'start': this.startSetup(); break;
      // online
      case 'host': Game.hostOnline(); break;
      case 'join': { const c = ($('joincode').value || '').trim().toUpperCase(); if (c.length !== 4) { this.toast(tr('Enter the 4-letter room code')); break; } Game.joinOnline(c); break; }
      case 'onlinemenu': Game.leaveOnline(); this.online = { step: 'menu' }; this.refresh(); break;
      case 'onmode': Game.lobbyCfg({ mode: arg }); break;
      case 'onrealm': Game.lobbyCfg({ realm: +arg, diff: 0 }); break;
      case 'ondiff': Game.lobbyCfg({ diff: +arg }); break;
      case 'onarena': Game.lobbyCfg({ arena: arg }); break;
      case 'onbots': Game.lobbyCfg({ bots: el.checked }); break;
      case 'onhero': Game.lobbyHero(+arg); break;
      case 'onstart': Game.hostStart(); break;
      // in game
      case 'resume': this.hidePause(); break;
      case 'abandon': this.confirm(tr('Leave this run? You keep the gold and gear found so far.'), tr('Leave')).then((ok) => { if (ok) { this.hidePause(); Game.abandon(); } }); break;
      case 'pick': this.pickOffer(+arg.split(':')[0], +arg.split(':')[1]); break;
      case 'reroll': this.rerollOffer(+arg); break;
      case 'again': this.show('results', false); Game.again(); break;
      case 'tomenu': this.show('results', false); Game.toMenu(); break;
      case 'dlg': if (this.dlg) { const f = this.dlg; this.dlg = null; f(arg === '1'); } break;
      case 'mute': s.settings.sfx = s.settings.sfx > 0 ? 0 : 0.8; s.settings.music = s.settings.sfx ? 0.45 : 0; applySettings(); Meta.save(); this.showPause(); break;
    }
  },

  startSetup() {
    const S = this.setup;
    const cfg = { mode: S.mode, realm: S.realm, diff: S.diff, teams: S.teams, target: S.target };
    if (S.mode === 'adventure' && !Meta.realmUnlocked(S.realm)) return;
    const party = this.party.map((p) => Object.assign({}, p));
    if (S.mode === 'arena' && !S.teams) party.forEach((p, i) => { p.team = i; });
    this.closePanels();
    this.hideAll();
    Game.startLocal(cfg, party);
  },

  confirm(msg, yes) {
    return new Promise((res) => {
      const d = document.createElement('div');
      d.className = 'dialog';
      d.innerHTML = `<div class="mbox" style="width:min(calc(var(--vw,1vw)*90),26em)"><p style="text-align:center">${esc(msg)}</p><div class="row" style="justify-content:center"><button class="btn dark" data-act="dlg" data-arg="0">${tr('Cancel')}</button><button class="btn r" data-act="dlg" data-arg="1">${esc(yes || 'OK')}</button></div></div>`;
      $('ui').appendChild(d);
      this.dlg = (ok) => { d.remove(); res(ok); };
    });
  },

  // ---------- toasts ----------
  toast(html, color) {
    const t = document.createElement('div');
    t.className = 'toast o';
    if (color) t.style.borderColor = color;
    t.innerHTML = html;
    const box = $('toasts');
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 3400);
  },

  lootToast(it) {
    this.toast(`<span style="color:${rarColor(it.rar)}">${tr(RARITY[it.rar].name)}</span> <b style="color:${rarColor(it.rar)}">${esc(itemName(it))}</b>`, rarColor(it.rar));
    Sound.play(it.rar >= 3 ? 'legend' : 'chest', 0.7);
  },

  tickToasts() {
    while (Meta.toasts.length) {
      const t = Meta.toasts.shift();
      if (t.kind === 'ach') { this.toast(`${SVGI.star} ${tr('Achievement')}: <b>${esc(tr(t.a.name))}</b> <span class="coin"></span> ${t.a.gold}${t.a.hero ? ' · ' + tr('{name} unlocked!', { name: esc(heroName(t.a.hero)) }) : ''}`); Sound.play('ach', 0.8); }
    }
  },

  // ---------- blessing picker ----------
  // rows: [{ slot, dev, name, hero, ids, rerolls, remote }]
  showOffers(rows) {
    const keep = this.offer ? this.offer.rows : [];
    for (const r of rows) {
      const old = keep.find((k) => k.slot === r.slot);
      r.cur = old ? Math.min(old.cur, r.ids.length - 1) : 1;
    }
    const others = keep.filter((k) => !rows.some((r) => r.slot === k.slot) && !k.done);
    this.offer = { rows: others.concat(rows) };
    this.renderOffers();
  },

  renderOffers() {
    const O = this.offer;
    if (!O) return;
    const rows = O.rows.filter((r) => !r.done);
    if (!rows.length) { this.show('offers', false); this.offer = null; return; }
    const compact = rows.length > 1;
    $('offers').innerHTML = `<div class="o" style="font-size:1.5em;font-weight:900;color:var(--gold)">${tr('Choose a blessing')}</div>` + rows.map((r) => `<div class="orow"><h3 class="o" style="color:${PLAYER_COLORS[r.slot % 4]}">${esc(r.name)} · ${esc(heroName(r.hero))}${compact ? ` <span class="kv">(${esc(trx(KEY_HINT[r.dev] || ''))})</span>` : ''}</h3><div class="ocards">${r.ids.map((id, i) => {
      const b = BLESS_BY_ID[id], have = r.have ? (r.have[id] || 0) : 0;
      return `<div class="bc${i === r.cur && r.dev !== 'touch' ? ' cur' : ''}" style="border-color:${RARITY[b.rar].color}${compact ? ';min-height:6.5em' : ''}" data-act="pick" data-arg="${r.slot}:${i}"><span class="br" style="color:${RARITY[b.rar].color}">${tr(RARITY[b.rar].name)}</span><span class="bstar" style="color:${RARITY[b.rar].color}">${SVGI.star}</span><b>${esc(tr(b.name))}</b><span class="bd">${esc(tr(b.desc))}</span>${have ? `<span class="bn">${tr('You have {a}/{b}', { a: have, b: b.max })}</span>` : ''}</div>`;
    }).join('')}</div>${r.rerolls > 0 ? `<button class="btn sm dark" data-act="reroll" data-arg="${r.slot}">${tr('Reroll ({n} left)', { n: r.rerolls })}</button>` : ''}</div>`).join('');
    this.show('offers', true);
  },

  pickOffer(slot, idx) {
    const O = this.offer;
    if (!O) return;
    const r = O.rows.find((x) => x.slot === slot);
    if (!r || r.done) return;
    r.done = true;
    Game.pickBlessing(slot, idx);
    this.renderOffers();
  },

  rerollOffer(slot) {
    const r = this.offer && this.offer.rows.find((x) => x.slot === slot);
    if (!r || r.rerolls <= 0) return;
    Game.rerollBlessing(slot);
  },

  tickOffers() {
    const O = this.offer;
    if (!O || !$('offers').classList.contains('show')) return;
    let dirty = false;
    for (const r of O.rows) {
      if (r.done || r.remote || !r.dev || r.dev === 'touch') continue;
      const m = Input.menu(r.dev);
      if (m.left) { r.cur = (r.cur + r.ids.length - 1) % r.ids.length; dirty = true; Sound.play('click', 0.4); }
      if (m.right) { r.cur = (r.cur + 1) % r.ids.length; dirty = true; Sound.play('click', 0.4); }
      if (m.ok) { this.pickOffer(r.slot, r.cur); return; }
      if (m.alt && r.rerolls > 0) { this.rerollOffer(r.slot); return; }
    }
    if (dirty) this.renderOffers();
  },

  // ---------- pause ----------
  showPause() {
    const locals = Game.localUnits();
    const bl = locals.map((u) => {
      const list = Object.keys(u.bless || {}).map((id) => `<span class="tag" style="background:${RARITY[BLESS_BY_ID[id].rar].color};color:#100a20">${esc(tr(BLESS_BY_ID[id].name))}${u.bless[id] > 1 ? ' ×' + u.bless[id] : ''}</span>`).join(' ');
      return `<div><b style="color:${u.hero.color}">${esc(tr(u.hero.name))}</b> <span class="kv">${list || tr('No blessings yet')}</span></div>`;
    }).join('');
    $('pause').innerHTML = `<div class="mbox"><h1 class="o">${tr('Paused')}</h1>${Game.online ? `<p class="kv" style="text-align:center">${tr('Online games keep running while this menu is open.')}</p>` : ''}<div class="sec">${tr('Blessings')}</div>${bl}
      <button class="btn g" data-act="resume">${tr('Resume')}</button>
      <button class="btn dark" data-act="lang">${SVGI.globe} ${Lang.ko ? 'English' : '한국어'}</button>
      <button class="btn dark" data-act="mute">${Meta.s.settings.sfx > 0 ? tr('Mute sound') : tr('Unmute sound')}</button>
      <button class="btn r" data-act="abandon">${tr('Leave run')}</button></div>`;
    this.show('pause', true);
    Game.paused = true;
  },

  hidePause() { this.show('pause', false); Game.paused = false; },

  // ---------- results ----------
  showResults(r) {
    const o = r.out || { gold: 0, xp: 0, items: [], ach: [] };
    const lv = o.lvl;
    const stats = [[tr('Rooms'), r.ws.rooms || 0], [tr('Kills'), fmtNum(r.ws.kills || 0)], [tr('Best combo'), r.ws.bestCombo || 0], [tr('Time'), fmtTime(r.time || 0)], [tr('Gold'), '+' + fmtNum(o.gold)], [tr('Hero XP'), '+' + fmtNum(o.xp)]];
    if (r.kind === 'abyss') stats.unshift([tr('Floors'), r.res.floor || 0]);
    if (r.kind === 'arena') { stats.length = 0; stats.push([tr('Knockouts'), r.kos || 0], [tr('Falls'), r.deaths || 0], [tr('Gold'), '+' + fmtNum(o.gold)], [tr('Hero XP'), '+' + fmtNum(o.xp)]); }
    const loot = (o.items || []).map((it) => this.itemCard(it, '')).join('');
    const ach = (o.ach || []).map((a) => `<span class="tag" style="background:var(--gold);color:#3a2300">${esc(tr(a.name))}</span>`).join(' ');
    $('results').innerHTML = `<div class="mbox res"><h1 class="o" style="color:${r.win ? 'var(--gold)' : '#ff8a9a'}">${esc(r.title)}</h1>${r.sub ? `<p class="kv" style="text-align:center">${esc(r.sub)}</p>` : ''}
      <div class="rgrid">${stats.map(([k, v]) => `<div class="rstat"><b>${v}</b><span>${k}</span></div>`).join('')}</div>
      ${lv ? `<p style="text-align:center">${lv.after > lv.before ? `<b style="color:var(--gold)">${tr('{name} reached level {n}!', { name: esc(heroName(r.hero)), n: lv.after })}</b>` : esc(tr('{name} · level {n}', { name: heroName(r.hero), n: lv.after }))}</p>` : ''}
      ${o.realmUnlock ? `<p style="text-align:center;color:var(--gold)">${tr('New realm unlocked: {name}!', { name: esc(tr(REALMS[o.realmUnlock - 1].name)) })}</p>` : ''}
      ${loot ? `<div class="sec">${tr('Loot')}</div><div class="loot">${loot}</div>` : ''}
      ${ach ? `<div class="sec">${tr('Achievements')}</div><div>${ach}</div>` : ''}
      <div class="row" style="flex-wrap:nowrap">${r.canAgain ? `<button class="btn y" data-act="again">${tr('Play again')}</button>` : ''}<button class="btn" data-act="tomenu">${Game.online ? tr('Back to lobby') : tr('Camp')}</button></div></div>`;
    this.show('results', true);
    if (lv && lv.after > lv.before) Sound.play('level', 0.8);
  },
};

function basicDesc(h) {
  const b = h.basic;
  if (b.kind === 'melee') return b.knock > 100 ? 'Strikes nearby foes in an arc, knocking them back.' : 'Strikes nearby foes in an arc.';
  if (b.kind === 'chain') return 'Lightning that jumps between foes.';
  if (b.kind === 'thrust') return 'A spear thrust that pierces a line of foes.';
  if (b.splash) return 'Fires bolts that explode and burn at range.';
  if (b.poison) return 'Fires bolts that poison at range.';
  if (b.slow) return 'Fires bolts that slow at range.';
  if (b.pierce) return 'Fires bolts that pierce at range.';
  if (b.homing) return 'Fires bolts that seek their target at range.';
  return 'Fires bolts at range.';
}

function applySettings() {
  const st = Meta.s.settings;
  setLang(st.lang || 'auto');
  Settings.nums = st.nums;
  Settings.shake = st.shake;
  Settings.btnAlpha = st.btnAlpha || 0.35;
  Sound.setVol(st.sfx);
  Music.setVol(st.music);
}
