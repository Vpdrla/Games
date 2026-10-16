// ---------- Menus and modals: home, hero & stage select, power-ups, codex, achievements, in-run dialogs ----------
const imgCache = new Map();
function canvasUrl(key, make) {
  let u = imgCache.get(key);
  if (!u) {
    u = make().toDataURL();
    imgCache.set(key, u);
  }
  return u;
}
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
function heroImg(k, px) {
  return canvasUrl('hero:' + k + px, () => Sprites.get('hero-ui:' + k, CHARACTERS[k].look, 0, false, 'n', (px * DPR()) / 4));
}
function enemyImg(k, px) {
  return canvasUrl('enemy:' + k + px, () => Sprites.get('ui:' + k, k, 0, false, 'n', (px * DPR()) / 4));
}
function chestImg(boss) {
  return canvasUrl('chest:' + boss, () => DropSprites.get('chest', boss ? 1 : 0, 50 * DPR()));
}
function icon(k, px) { return Icons.url(k, px || 40); }
// "1:00 / 5:00" for time goals, "620 / 1000" for the rest
function achShown(a, cur, goal) {
  const f = a.id.startsWith('survive') || a.id === 'endless20' ? fmtTime : fmtNum;
  return f(Math.min(cur, goal)) + ' / ' + f(goal);
}
// The name of what an achievement unlocks, or '' when it unlocks nothing new.
function unlockName(a) {
  const r = a.reward;
  if (r.char && !SAVE.chars.includes(r.char)) return CHARACTERS[r.char].name;
  if (r.weapon && !SAVE.weapons.includes(r.weapon)) return WEAPONS[r.weapon].name;
  if (r.stage && SAVE.stages <= r.stage) return STAGES[r.stage].name;
  return '';
}
function tog(id, on, dis) { return `<button class="tog${on ? ' on' : ''}" id="${id}"${dis ? ' disabled' : ''}></button>`; }
function goldTag(n) { return `<span class="res"><i class="coin"></i>${fmtNum(n)}</span>`; }

function itemName(c) {
  if (c.kind === 'weapon') return WEAPONS[c.key].name;
  if (c.kind === 'passive') return PASSIVES[c.key].name;
  if (c.kind === 'gold') return 'Gold Pouch';
  if (c.kind === 'heal') return 'Hearty Meal';
  if (c.kind === 'evolve') return WEAPONS[c.key].name;
  return '';
}

function itemDesc(c) {
  if (c.kind === 'weapon') {
    const w = WEAPONS[c.key];
    if (c.lvl <= 1) return w.desc;
    return deltaText(c.key, w.lv[c.lvl - 2]);
  }
  if (c.kind === 'passive') return PASSIVES[c.key].desc;
  if (c.kind === 'gold') return '+' + c.v + ' gold';
  if (c.kind === 'heal') return 'Restore ' + c.v + ' health';
  if (c.kind === 'evolve') return WEAPONS[c.key].desc;
  return '';
}

const UI = {
  cur: 'home',
  modalOpen: false,
  modalDismiss: false,
  onClose: null,
  codexTab: 'w',

  init() {
    $('pause-btn').addEventListener('click', () => {
      Sound.play('click');
      if (Game.scene instanceof RunScene) Game.scene.openPause();
    });
    $('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal') && this.modalDismiss) this.closeModal(); });
  },

  showScreen(name) {
    for (const id of ['home', 'setup', 'shop', 'codex', 'achs', 'hud']) $(id).classList.toggle('show', id === name);
    this.cur = name;
    if (name === 'home') this.renderHome();
    if (name === 'setup') this.renderSetup();
    if (name === 'shop') this.renderShop();
    if (name === 'codex') this.renderCodex();
    if (name === 'achs') this.renderAchs();
  },

  modal(html, dismiss) {
    const p = $('modal-panel');
    p.innerHTML = html;
    p.scrollTop = 0;
    $('modal').classList.add('show');
    this.modalOpen = true;
    this.modalDismiss = !!dismiss;
  },

  closeModal() {
    $('modal').classList.remove('show');
    this.modalOpen = false;
    if (this.onClose) {
      const f = this.onClose;
      this.onClose = null;
      f();
    }
  },

  toast(html, ms) {
    const t = document.createElement('div');
    t.className = 'toast pop';
    t.innerHTML = html;
    $('toast').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, ms || 2600);
  },

  achToasts(list) {
    list.forEach((g, i) => setTimeout(() => {
      Sound.play('unlock');
      this.toast(`🏆 <span><b>${esc(g.a.name)}</b><br><small>${esc(g.text)}</small></span>`, 3200);
    }, i * 700));
  },

  // ----- home -----
  renderHome() {
    const d = dailyInfo(), done = SAVE.daily.date === d.key && SAVE.daily.rewarded;
    const achDone = ACHIEVEMENTS.filter((a) => SAVE.ach[a.id]).length;
    $('home').innerHTML = `
      <div class="topbar">${goldTag(SAVE.gold)}<span class="sp"></span><button class="iconbtn" id="h-set" aria-label="Settings">⚙️</button></div>
      <div class="logo"><h1>DAWNKEEPER</h1><p>Survive the night. Keep the light.</p></div>
      <div class="menu">
        <button class="btn big gold" id="h-play">▶ PLAY</button>
        <div class="daily${done ? ' done' : ''}" id="h-daily"><span class="moon">${done ? '✅' : '🌙'}</span><div><b>Daily Night${done ? ' · best ' + fmtTime(SAVE.daily.best) : ' · +150 gold'}</b>
          <small>${esc(STAGES[d.stage].name)} · ${esc(CHARACTERS[d.char].name)} · ${d.mods.map((m) => esc(DAILY_MODS[m].name)).join(', ')}</small></div></div>
        <div class="row"><button class="btn${affordablePowers() ? ' dot' : ''}" id="h-shop">⬆️ Power-ups</button><button class="btn" id="h-codex">📖 Codex</button></div>
        <button class="btn" id="h-ach">🏆 Achievements <small class="muted">${achDone}/${ACHIEVEMENTS.length}</small></button>
        <div class="foot" id="h-foot"></div>
      </div>`;
    $('h-play').onclick = () => { Sound.play('click'); this.showScreen('setup'); };
    $('h-daily').onclick = () => { Sound.play('click'); this.dailyModal(); };
    $('h-shop').onclick = () => { Sound.play('click'); this.showScreen('shop'); };
    $('h-codex').onclick = () => { Sound.play('click'); this.showScreen('codex'); };
    $('h-ach').onclick = () => { Sound.play('click'); this.showScreen('achs'); };
    $('h-set').onclick = () => { Sound.play('click'); this.settingsModal(); };
    this.renderFoot();
  },

  renderFoot() {
    const f = $('h-foot');
    if (!f) return;
    let html = '';
    if (Game.installPrompt) html += '<button class="btn small green" id="h-install">Install app</button>';
    else if (Game.isIOS() && !Game.isStandalone() && !Game.isEmbedded()) html += '<div class="hint">Tip: tap Share → "Add to Home Screen" to install and play offline.</div>';
    const status = Game.offlineReady ? 'Offline ready' : location.protocol === 'file:' ? 'Playing from a file · works offline' : '';
    html += `<div>v1.0${status ? ' · ' + status : ''}</div>`;
    f.innerHTML = html;
    const ib = $('h-install');
    if (ib) ib.onclick = () => {
      const p = Game.installPrompt;
      Game.installPrompt = null;
      p.prompt();
      p.userChoice.finally(() => this.renderFoot());
    };
  },

  dailyModal() {
    const d = dailyInfo(), done = SAVE.daily.date === d.key && SAVE.daily.rewarded;
    this.modal(`<h2>🌙 Daily Night</h2>
      <p class="center muted">A new night every day. Same stage, hero and twists for the whole day.</p>
      <div class="card herodetail"><img src="${heroImg(d.char, 46)}"><div><b>${esc(CHARACTERS[d.char].name)} · ${esc(STAGES[d.stage].name)}</b><p>Starts with ${esc(WEAPONS[CHARACTERS[d.char].weapon].name)}</p></div></div>
      ${d.mods.map((m) => `<div class="card"><b>${esc(DAILY_MODS[m].name)}</b><p class="muted">${esc(DAILY_MODS[m].desc)}</p></div>`).join('')}
      <p class="center">${done ? 'Today\'s best: <b>' + fmtTime(SAVE.daily.best) + '</b>' : 'First finish today: <b>+150 gold</b>'}</p>
      <div class="btns"><button class="btn" id="d-no">Back</button><button class="btn gold" id="d-go">Start</button></div>`, true);
    $('d-no').onclick = () => this.closeModal();
    $('d-go').onclick = () => {
      this.closeModal();
      Game.startRun({ stage: d.stage, char: d.char, mode: 'daily', mods: d.mods, seed: d.seed });
    };
  },

  // ----- hero & stage select -----
  renderSetup() {
    const sel = SAVE.sel;
    const heroes = CHAR_KEYS.map((k) => {
      const c = CHARACTERS[k], locked = !SAVE.chars.includes(k), a = locked && ACHIEVEMENTS.find((x) => x.id === c.unlock);
      let prog = '';
      if (a) {
        const [cur, goal] = a.prog(SAVE, null);
        prog = `<small class="hp">${esc(a.desc)} · <span>${achShown(a, cur, goal)}</span></small><div class="bar"><i style="width:${(clamp(cur / goal, 0, 1) * 100).toFixed(1)}%"></i></div>`;
      }
      return `<div class="hero${sel.char === k ? ' sel' : ''}${locked ? ' locked' : ''}" data-h="${k}">${locked ? '<span class="lock">🔒</span>' : ''}<img src="${heroImg(k, 64)}"><b>${esc(c.name)}</b><small>${esc(c.title)}</small>${prog}</div>`;
    }).join('');
    const ch = CHARACTERS[sel.char];
    const lockText = (i) => {
      const q = SAVE.quickClears[STAGES[i - 1].key] || 0;
      return 'Clear ' + STAGES[i - 1].name + ' (or win it twice on Quick Night)' + (q ? ' · ' + Math.min(q, 1) + '/2 Quick wins' : '');
    };
    const stages = STAGES.map((s, i) => {
      const locked = i >= SAVE.stages, b = SAVE.best[s.key];
      const best = b && b.time ? `<span class="best">${b.won ? '☀️ Cleared · ' : ''}Best ${fmtTime(b.time)}</span>` : '';
      return `<div class="stage${sel.stage === i ? ' sel' : ''}${locked ? ' locked' : ''}" data-s="${i}" style="background:linear-gradient(90deg,${rgba(s.night, 0.95)},${rgba(s.ground[1], 0.75)})">
        <div class="sw" style="background:linear-gradient(135deg,${s.ground[1]},${s.accent})"></div>
        <div class="si"><b>${locked ? '🔒 ' : ''}${esc(s.name)}</b><small>${locked ? esc(lockText(i)) : esc(s.desc)}</small>${best}</div></div>`;
    }).join('');
    const canEndless = !!SAVE.cleared[STAGES[sel.stage].key];
    if (!canEndless) sel.endless = false;
    $('setup').innerHTML = `
      <div class="phead"><button class="iconbtn" id="s-back" aria-label="Back">←</button><h2>Prepare for the night</h2>${goldTag(SAVE.gold)}</div>
      <div class="pbody scroll">
        <h3>Hero</h3>
        <div class="heroes">${heroes}</div>
        <div class="card herodetail"><img src="${icon(ch.weapon, 46)}"><div><b>${esc(ch.name)} · ${esc(ch.title)}</b><p>Starts with ${esc(WEAPONS[ch.weapon].name)}. ${esc(ch.perk)}.</p></div></div>
        <h3>Stage</h3>
        <div class="stages">${stages}</div>
        <h3>Mode</h3>
        <div class="seg" id="s-mode"><button data-m="normal" class="${sel.mode === 'normal' ? 'on' : ''}">Full Night<small>15:00 · boss at dawn</small></button><button data-m="quick" class="${sel.mode === 'quick' ? 'on' : ''}">Quick Night<small>5:00 · 60% gold · 2 wins clear a stage</small></button></div>
        <div class="card"><div class="setrow"><div>Endless night<small>${canEndless ? 'Keep fighting after dawn. Bosses keep coming.' : 'Clear this stage to unlock'}</small></div>${tog('s-end', sel.endless, !canEndless)}</div></div>
      </div>
      <div class="pfoot"><button class="btn big gold" id="s-go">START NIGHT</button></div>`;
    $('s-back').onclick = () => { Sound.play('click'); saveGame(); this.showScreen('home'); };
    for (const h of document.querySelectorAll('#setup .hero')) h.onclick = () => {
      const k = h.dataset.h;
      if (!SAVE.chars.includes(k)) {
        Sound.play('error');
        const a = ACHIEVEMENTS.find((x) => x.id === CHARACTERS[k].unlock);
        this.toast(`🔒 ${esc(CHARACTERS[k].name)}: ${a ? esc(a.desc) : 'locked'}`);
        return;
      }
      Sound.play('click');
      sel.char = k;
      this.renderSetup();
    };
    for (const s of document.querySelectorAll('#setup .stage')) s.onclick = () => {
      const i = +s.dataset.s;
      if (i >= SAVE.stages) { Sound.play('error'); this.toast('🔒 ' + esc(lockText(i))); return; }
      Sound.play('click');
      sel.stage = i;
      this.renderSetup();
    };
    for (const b of document.querySelectorAll('#s-mode button')) b.onclick = () => { Sound.play('click'); sel.mode = b.dataset.m; this.renderSetup(); };
    $('s-end').onclick = () => { if (!canEndless) return; Sound.play('click'); sel.endless = !sel.endless; this.renderSetup(); };
    $('s-go').onclick = () => {
      saveGame();
      Game.startRun({ stage: sel.stage, char: sel.char, mode: sel.mode, endless: sel.endless && canEndless });
    };
  },

  // ----- power-ups -----
  renderShop() {
    let spent = 0;
    for (const k of POWERUP_KEYS) for (let r = 0; r < (SAVE.power[k] || 0); r++) spent += powerCost(k, r);
    for (const k of LIMIT_BREAK_KEYS) for (let r = 0; r < (SAVE.limit[k] || 0); r++) spent += limitCost(k, r);
    const card = (cls, ic, name, desc, rank, maxRank, cost, attr) => {
      const max = rank >= maxRank;
      const pips = Array.from({ length: maxRank }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
      return `<div class="pu${cls}${max ? ' max' : ''}"><div class="t"><img src="${icon(ic, 36)}"><div><b>${esc(name)}</b><small>${esc(desc)}</small></div></div>
        <div class="pips">${pips}</div>
        <button class="btn small ${max ? '' : cls ? 'purple' : 'gold'}" ${attr} ${max || SAVE.gold < cost ? 'disabled' : ''}>${max ? 'MAX' : '<i class="coin"></i>' + fmtNum(cost)}</button></div>`;
    };
    const cards = POWERUP_KEYS.map((k) => {
      const p = POWERUPS[k], rank = SAVE.power[k] || 0;
      return card('', p.icon, p.name, p.desc, rank, p.max, rank >= p.max ? 0 : powerCost(k, rank), `data-k="${k}"`);
    }).join('');
    // Limit Break opens once everything above is maxed (its buttons use data-lb, never data-k)
    let lb = '';
    if (allPowerMaxed()) {
      lb = `<h3>Limit Break <small>each rank = 1/5 of a power-up rank</small></h3><div class="pgrid">` + LIMIT_BREAK_KEYS.map((k) => {
        const p = POWERUPS[k], rank = SAVE.limit[k] || 0;
        return card(' lb', p.icon, p.name, LIMIT_DESC[k] + ' per rank', rank, LIMIT_RANKS, rank >= LIMIT_RANKS ? 0 : limitCost(k, rank), `data-lb="${k}"`);
      }).join('') + `</div><h3>Power-ups <small>all maxed</small></h3>`;
    }
    $('shop').innerHTML = `
      <div class="phead"><button class="iconbtn" id="sh-back" aria-label="Back">←</button><h2>Power-ups</h2>${goldTag(SAVE.gold)}</div>
      <div class="pbody scroll">
        <p class="muted" style="font-size:13px">Power-ups make every run stronger. Earn gold by picking up coins, opening chests and surviving.</p>
        ${lb}
        <div class="pgrid">${cards}</div>
        <div class="card"><div class="setrow"><div>Refund everything<small>Get all ${fmtNum(spent)} gold back to rebuy differently</small></div><button class="btn small red" id="sh-refund" ${spent ? '' : 'disabled'}>Refund</button></div></div>
      </div>`;
    const bought = () => {
      saveGame();
      Sound.play('buy');
      Game.vibrate(20);
      const y = $('shop').querySelector('.pbody').scrollTop;
      this.renderShop();
      $('shop').querySelector('.pbody').scrollTop = y;
    };
    $('sh-back').onclick = () => { Sound.play('click'); this.showScreen('home'); };
    for (const b of document.querySelectorAll('#shop .pu button[data-k]')) b.onclick = () => {
      const k = b.dataset.k, rank = SAVE.power[k] || 0, cost = powerCost(k, rank);
      if (rank >= POWERUPS[k].max || SAVE.gold < cost) { Sound.play('error'); return; }
      SAVE.gold -= cost;
      SAVE.power[k] = rank + 1;
      bought();
    };
    for (const b of document.querySelectorAll('#shop .pu button[data-lb]')) b.onclick = () => {
      const k = b.dataset.lb, rank = SAVE.limit[k] || 0, cost = limitCost(k, rank);
      if (!allPowerMaxed() || rank >= LIMIT_RANKS || SAVE.gold < cost) { Sound.play('error'); return; }
      SAVE.gold -= cost;
      SAVE.limit[k] = rank + 1;
      bought();
    };
    $('sh-refund').onclick = () => {
      this.modal(`<h2>Refund all?</h2><p class="center">You get back <b>${fmtNum(spent)}</b> gold and all power-ups${lb ? ' and Limit Breaks' : ''} reset.</p><div class="btns"><button class="btn" id="r-no">Cancel</button><button class="btn red" id="r-yes">Refund</button></div>`, true);
      $('r-no').onclick = () => this.closeModal();
      $('r-yes').onclick = () => {
        SAVE.gold += spent;
        SAVE.power = {};
        SAVE.limit = {};
        saveGame();
        Sound.play('coin');
        this.closeModal();
        this.renderShop();
      };
    };
  },

  // ----- codex -----
  renderCodex() {
    const tab = this.codexTab;
    let body = '';
    if (tab === 'w') {
      body = '<div class="codex">' + BASE_WEAPONS.map((k) => {
        const w = WEAPONS[k], unlocked = SAVE.weapons.includes(k), evo = w.evo, found = SAVE.evolved[evo];
        const a = ACHIEVEMENTS.find((x) => x.reward.weapon === k);
        return `<div class="cx${unlocked ? '' : ' unk'}"><img src="${icon(k, 40)}"><div class="d"><b>${unlocked ? esc(w.name) : '🔒 ' + esc(w.name)}</b>
          <small>${unlocked ? esc(w.desc) : 'Unlock: ' + (a ? esc(a.desc) : '?')}</small>
          <small>Lv 8 + ${esc(PASSIVES[w.pair].name)} → <b style="display:inline;color:${found ? '#ffd84a' : '#a9abd0'}">${found ? esc(WEAPONS[evo].name) : '???'}</b></small></div>
          <span class="ar">→</span><div class="${found ? '' : 'unk'}" style="display:contents"><img src="${icon(evo, 40)}" style="${found ? '' : 'filter:brightness(0) opacity(.5)'}"></div></div>`;
      }).join('') + '</div>';
    } else if (tab === 'p') {
      body = '<div class="codex">' + PASSIVE_KEYS.map((k) => {
        const p = PASSIVES[k], w = PAIR_OF[k];
        return `<div class="cx"><img src="${icon(k, 40)}"><div class="d"><b>${esc(p.name)} <small style="display:inline">max Lv ${p.max}</small></b><small>${esc(p.desc)}</small><small>Evolves ${esc(WEAPONS[w].name)}</small></div></div>`;
      }).join('') + '</div>';
    } else {
      body = '<div class="egrid">' + ENEMY_KEYS.map((k) => {
        const seen = SAVE.seen.e[k], n = SAVE.stats.byType[k] || 0;
        return `<div class="en${seen ? '' : ' unk'}"><img src="${enemyImg(k, 56)}"><b>${seen ? esc(ENEMIES[k].name) : '???'}</b><small>${seen ? fmtNum(n) + ' defeated' : 'Not met yet'}</small></div>`;
      }).join('') + '</div>';
    }
    $('codex').innerHTML = `
      <div class="phead"><button class="iconbtn" id="cx-back" aria-label="Back">←</button><h2>Codex</h2></div>
      <div class="pbody scroll">
        <div class="seg" id="cx-tabs"><button data-t="w" class="${tab === 'w' ? 'on' : ''}">Weapons</button><button data-t="p" class="${tab === 'p' ? 'on' : ''}">Items</button><button data-t="e" class="${tab === 'e' ? 'on' : ''}">Monsters</button></div>
        ${body}
      </div>`;
    $('cx-back').onclick = () => { Sound.play('click'); this.showScreen('home'); };
    for (const b of document.querySelectorAll('#cx-tabs button')) b.onclick = () => { Sound.play('click'); this.codexTab = b.dataset.t; this.renderCodex(); };
  },

  // ----- achievements -----
  renderAchs() {
    const rows = ACHIEVEMENTS.map((a) => {
      const done = !!SAVE.ach[a.id], [cur, goal] = a.prog(SAVE, null), f = clamp(cur / goal, 0, 1);
      const shown = achShown(a, cur, goal);
      return `<div class="ach${done ? ' done' : ''}"><div class="ic">${done ? '🏆' : '🔸'}</div><div class="d"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>
        <div class="rw">Reward: ${esc(rewardText(a))}</div>${done ? '' : `<div class="bar"><i style="width:${(f * 100).toFixed(1)}%"></i></div><small>${shown}</small>`}</div></div>`;
    }).join('');
    $('achs').innerHTML = `
      <div class="phead"><button class="iconbtn" id="a-back" aria-label="Back">←</button><h2>Achievements</h2></div>
      <div class="pbody scroll">${rows}</div>`;
    $('a-back').onclick = () => { Sound.play('click'); this.showScreen('home'); };
  },

  // ----- settings -----
  settingsModal(inRun) {
    const s = SAVE.settings;
    const q = (v, l) => `<button data-q="${v}" class="${s.quality === v ? 'on' : ''}">${l}</button>`;
    this.modal(`<h2>Settings</h2>
      <div class="card">
        <div class="setrow">Sound effects ${tog('o-sfx', s.sfx)}</div>
        <div class="setrow">Music ${tog('o-mus', s.music)}</div>
        <div class="setrow">Vibration ${tog('o-vib', s.vibrate)}</div>
        <div class="setrow">Damage numbers ${tog('o-dmg', s.dmgNums)}</div>
        <div class="setrow"><div>Graphics<small>Low helps older phones</small></div><div class="seg" id="o-q" style="width:190px">${q('auto', 'Auto')}${q('high', 'High')}${q('low', 'Low')}</div></div>
        ${inRun ? '' : `<div class="setrow"><div>Offline play<small>${Game.offlineReady ? '✅ Ready' : Game.isEmbedded() ? 'Open the game directly to install' : 'Available after the first load'}</small></div></div>`}
      </div>
      <div class="btns">${inRun ? '' : '<button class="btn small red" id="o-reset">Reset progress</button>'}<button class="btn" id="o-ok">Done</button></div>`, true);
    const bind = (id, key, after) => {
      $(id).onclick = () => {
        s[key] = !s[key];
        $(id).classList.toggle('on', s[key]);
        applySettings();
        saveGame();
        if (after) after();
        Sound.play('click');
      };
    };
    bind('o-sfx', 'sfx');
    bind('o-mus', 'music');
    bind('o-vib', 'vibrate');
    bind('o-dmg', 'dmgNums');
    for (const b of document.querySelectorAll('#o-q button')) b.onclick = () => {
      s.quality = b.dataset.q;
      for (const o of document.querySelectorAll('#o-q button')) o.classList.toggle('on', o === b);
      saveGame();
      Game.applyQuality();
      Sound.play('click');
    };
    $('o-ok').onclick = () => this.closeModal();
    const rb = $('o-reset');
    if (rb) rb.onclick = () => {
      this.modal(`<h2>Reset progress?</h2><p class="center">All gold, power-ups, heroes, stages and achievements will be lost.</p><div class="btns"><button class="btn" id="r-no">Cancel</button><button class="btn red" id="r-yes">Reset</button></div>`, true);
      $('r-no').onclick = () => this.settingsModal();
      $('r-yes').onclick = () => { resetGame(); this.closeModal(); this.showScreen('home'); };
    };
  },

  // ----- in-run dialogs -----
  choiceHTML(run, c, i, banish) {
    let tag = '', evo = '', cls = c.kind;
    if (c.kind === 'weapon') {
      const w = WEAPONS[c.key];
      tag = c.isNew ? '<span class="tag">NEW</span>' : `<span class="tag lv">Lv ${c.lvl}</span>`;
      const has = run.passiveLvl(w.pair) > 0;
      evo = c.lvl >= WEAPON_MAX ? (has ? '✦ Ready to evolve! Open a chest' : `✦ Evolves with ${PASSIVES[w.pair].name}`) : `✦ Evolves with ${PASSIVES[w.pair].name}${has ? ' ✓' : ''}`;
    } else if (c.kind === 'passive') {
      tag = c.isNew ? '<span class="tag">NEW</span>' : `<span class="tag lv">Lv ${c.lvl}</span>`;
      const wk = PAIR_OF[c.key], fam = run.family(wk);
      if (fam && !WEAPONS[fam.key].evolved) evo = `✦ Evolves your ${WEAPONS[wk].name}`;
    }
    return `<button class="choice ${cls}${banish ? ' banish' : ''} pop" style="animation-delay:${i * 0.06}s" data-i="${i}"><img src="${icon(c.key || c.kind, 50)}"><div class="d"><b>${esc(itemName(c))} ${tag}</b><small>${esc(itemDesc(c))}</small>${evo ? `<div class="evo">${esc(evo)}</div>` : ''}</div></button>`;
  },

  levelUp(scene, choices) {
    const run = scene.run;
    let banish = false;
    const render = () => {
      const tools = [];
      if (run.rerolls > 0) tools.push(`<button class="btn small blue" id="lv-rr">🔄 Reroll ${run.rerolls}</button>`);
      if (run.skips > 0) tools.push(`<button class="btn small" id="lv-sk">⏭ Skip ${run.skips}</button>`);
      if (run.banishes > 0 && choices.some((c) => c.key)) tools.push(`<button class="btn small ${banish ? 'red' : ''}" id="lv-bn">🚫 ${banish ? 'Tap to banish' : 'Banish ' + run.banishes}</button>`);
      this.modal(`<h2 class="lvl">LEVEL UP!</h2>
        <p class="center muted" style="margin-top:-6px">Level ${run.level - run.pendingLevels + 1}${run.pendingLevels > 1 ? ' · ' + run.pendingLevels + ' to pick' : ''}</p>
        ${choices.map((c, i) => this.choiceHTML(run, c, i, banish && c.key)).join('')}
        ${tools.length ? `<div class="btns">${tools.join('')}</div>` : ''}`, false);
      for (const b of document.querySelectorAll('#modal .choice')) b.onclick = () => {
        const c = choices[+b.dataset.i];
        if (banish && c.key) {
          run.banishes--;
          run.banished[c.key] = 1;
          banish = false;
          Sound.play('banish');
          choices = run.rollChoices();
          render();
          return;
        }
        this.closeModal();
        scene.pick(c);
      };
      const rr2 = $('lv-rr');
      if (rr2) rr2.onclick = () => { run.rerolls--; banish = false; Sound.play('reroll'); choices = run.rollChoices(); render(); };
      const sk = $('lv-sk');
      if (sk) sk.onclick = () => { run.skipLevel(); Sound.play('click'); this.closeModal(); scene.resume(); };
      const bn = $('lv-bn');
      if (bn) bn.onclick = () => { banish = !banish; Sound.play('click'); render(); };
    };
    render();
  },

  chest(scene, res, boss) {
    this.modal(`<div class="chest" id="ch-box"><img class="box shake glow" src="${chestImg(boss)}"><b>${boss ? 'Boss Treasure!' : 'Treasure Chest!'}</b><small class="muted">Tap to open</small></div>`, false);
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      Sound.play(res.items.some((i) => i.kind === 'evolve') ? 'evolve' : 'chestOpen');
      Game.vibrate([30, 40, 60]);
      const rows = res.items.map((c, i) => {
        if (c.kind === 'evolve') {
          return `<div class="lootrow evo pop" style="animation-delay:${0.2 + i * 0.35}s"><img src="${icon(c.key, 38)}"><div><b>EVOLUTION! ${esc(WEAPONS[c.key].name)}</b><small>${esc(WEAPONS[c.from].name)} evolved: ${esc(WEAPONS[c.key].desc)}</small></div></div>`;
        }
        return `<div class="lootrow pop" style="animation-delay:${0.2 + i * 0.35}s"><img src="${icon(c.key, 38)}"><div><b>${esc(itemName(c))} <span style="color:#7fc8ff">Lv ${c.lvl}</span></b><small>${esc(itemDesc(c))}</small></div></div>`;
      }).join('');
      $('modal-panel').innerHTML = `<div class="chest"><img class="box pop" src="${chestImg(boss)}" style="width:96px"></div>
        <div class="loot">${rows || '<p class="center muted">Your gear is maxed out!</p>'}
        <div class="lootrow pop" style="animation-delay:${0.2 + res.items.length * 0.35}s"><span class="coin" style="width:30px;height:30px;margin:4px"></span><div><b>+${res.gold} gold</b></div></div></div>
        <div class="btns"><button class="btn gold" id="ch-ok">Collect</button></div>`;
      $('ch-ok').onclick = () => { Sound.play('coin'); this.closeModal(); scene.resume(); };
    };
    $('ch-box').onclick = open;
    setTimeout(open, 1400);
  },

  pause(scene) {
    const run = scene.run, s = run.stats;
    const inv = run.weapons.map((w) => `<div class="it${WEAPONS[w.key].evolved ? ' evo' : ''}"><img src="${icon(w.key, 42)}"><span>${WEAPONS[w.key].evolved ? '★' : w.lvl}</span></div>`).join('') +
      run.passives.map((p) => `<div class="it"><img src="${icon(p.key, 42)}"><span>${p.lvl}</span></div>`).join('');
    const pct = (v) => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';
    this.modal(`<h2>Paused</h2>
      <div class="inv">${inv}</div>
      <div class="stats">
        <div class="stat"><b>${Math.ceil(run.player.hp)}/${s.maxHp}</b><span>Health</span></div>
        <div class="stat"><b>${pct(s.might)}</b><span>Damage</span></div>
        <div class="stat"><b>${Math.round((1 - s.cd) * 100)}%</b><span>Faster</span></div>
        <div class="stat"><b>${pct(s.area)}</b><span>Area</span></div>
        <div class="stat"><b>${s.armor}</b><span>Armor</span></div>
        <div class="stat"><b>${pct(s.speed)}</b><span>Speed</span></div>
      </div>
      <div class="btns"><button class="btn small" id="p-set">⚙️ Settings</button><button class="btn small red" id="p-quit">Give up</button></div>
      <button class="btn big green" id="p-go">▶ Resume</button>`, false);
    $('p-go').onclick = () => { Sound.play('click'); this.closeModal(); scene.resume(); };
    $('p-set').onclick = () => {
      Sound.play('click');
      this.settingsModal(true);
      $('o-ok').onclick = () => this.pause(scene);
      this.modalDismiss = false;
    };
    $('p-quit').onclick = () => {
      this.modal(`<h2>Give up?</h2><p class="center">You keep half of the gold from this run.</p><div class="btns"><button class="btn" id="q-no">Keep going</button><button class="btn red" id="q-yes">Give up</button></div>`, false);
      $('q-no').onclick = () => this.pause(scene);
      $('q-yes').onclick = () => { this.closeModal(); scene.quit(); };
    };
  },

  result(scene, out, quit) {
    const run = scene.run;
    const title = run.won ? '☀️ DAWN BREAKS!' : quit ? 'Run abandoned' : '🌑 The night claims you';
    const sub = run.won ? `${esc(run.stage.name)} is safe until tomorrow.` : quit ? '' : 'Your light will shine again. Power up and try once more!';
    const dmg = Object.entries(run.dmgBy).filter(([k]) => WEAPONS[k]).sort((a, b) => b[1] - a[1]);
    const top = dmg.length ? dmg[0][1] : 1;
    const rows = dmg.slice(0, 6).map(([k, v]) => `<div class="dmgrow"><img src="${icon(k, 24)}"><span class="nm">${esc(WEAPONS[k].name)}</span><div class="bar"><i style="width:${((v / top) * 100).toFixed(1)}%"></i></div><span class="v">${fmtNum(v)}</span></div>`).join('');
    const achs = out.ach.map((g) => `<div class="newach pop">🏆<div><b>${esc(g.a.name)}</b>${esc(g.text)}</div></div>`).join('');
    // where the gold came from
    const P = out.parts || { pickups: out.gold, survival: 0 };
    const achGold = out.ach.reduce((n, g) => n + (g.a.reward.gold || 0), 0);
    const gl = (label, v, cls) => `<div class="gl${cls || ''}"><span>${label}</span><b>${v < 0 ? '−' : '+'}${fmtNum(Math.abs(v))}</b></div>`;
    const glist = gl('Pickups', P.pickups) + gl('Survival', P.survival) + (P.dawn ? gl('Dawn bonus', P.dawn, ' sun') : '') +
      (P.minimum ? gl('Minimum reward', P.minimum) : '') + (P.halved ? gl('Gave up (half)', -P.halved, ' neg') : '') +
      (P.daily ? gl('Daily', P.daily) : '') + (achGold ? gl('Achievements', achGold) : '');
    // the closest hero, weapon or stage still to unlock
    let next = null;
    for (const a of ACHIEVEMENTS) {
      if (SAVE.ach[a.id] || !unlockName(a)) continue;
      const [cur, goal] = a.prog(SAVE, null), f = clamp(cur / goal, 0, 1);
      if (!next || f > next.f) next = { a, cur, goal, f };
    }
    const nextHtml = next ? `<div class="card nextun"><div class="gl"><span>Next unlock: <b>${esc(unlockName(next.a))}</b></span><b>${achShown(next.a, next.cur, next.goal)}</b></div>
      <small>${esc(next.a.desc)}</small><div class="bar"><i style="width:${(next.f * 100).toFixed(1)}%"></i></div></div>` : '';
    const nAfford = affordablePowers();
    this.modal(`<h2>${title}</h2>${sub ? `<p class="center muted">${sub}</p>` : ''}
      <div class="stats">
        <div class="stat"><b>${fmtTime(run.time)}</b><span>Survived</span></div>
        <div class="stat"><b>${run.level}</b><span>Level</span></div>
        <div class="stat"><b>${fmtNum(run.kills)}</b><span>Defeated</span></div>
      </div>
      <div class="card goldsum">${glist}<div class="gl tot"><span><i class="coin"></i> Total</span><b>+${fmtNum(out.gold + achGold)} gold</b></div></div>
      ${achs}
      ${nextHtml}
      ${rows ? `<h3>Damage</h3>${rows}` : ''}
      ${nAfford ? `<button class="btn green" id="r-shop">⬆️ ${nAfford} power-up${nAfford > 1 ? 's' : ''} affordable</button>` : ''}
      <div class="btns"><button class="btn" id="r-home">Home</button><button class="btn gold" id="r-again">Play again</button></div>`, false);
    $('r-home').onclick = () => { Sound.play('click'); this.closeModal(); Game.toHome(); };
    const rs = $('r-shop');
    if (rs) rs.onclick = () => { Sound.play('click'); this.closeModal(); Game.toHome(); this.showScreen('shop'); };
    $('r-again').onclick = () => { Sound.play('click'); this.closeModal(); Game.startRun(scene.cfg); };
    if (out.ach.length) setTimeout(() => Sound.play('unlock'), 500);
  },
};
